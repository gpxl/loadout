import { execFile } from "node:child_process";
import type { ProjectContext, AIAnalysis, RankedSkill, RankingMeta, RelevanceTier, SkillSearchResult } from "../types.js";
import { isOfficialSource } from "./official.js";
import { fetchAuditsBatch, summarizeRisk } from "./audit.js";

export const MAX_QUERIES = 12;

/**
 * Check if Claude CLI is available on PATH.
 */
async function hasClaudeCli(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Check if Anthropic API key is set in environment.
 */
function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Check if any AI backend is available.
 */
export async function isAIAvailable(): Promise<boolean> {
  if (hasApiKey()) return true;
  return hasClaudeCli();
}

/**
 * Call Claude via CLI and parse JSON response.
 */
async function callClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["-p", prompt, "--output-format", "json", "--model", "haiku", "--tools", ""],
      { timeout: 45000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr ? `: ${stderr.trim()}` : "";
          reject(new Error(`Claude CLI failed: ${err.message}${detail}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.type === "result" && parsed.result) {
            resolve(parsed.result);
          } else {
            reject(new Error("Unexpected Claude CLI response format"));
          }
        } catch {
          reject(new Error("Failed to parse Claude CLI response"));
        }
      },
    );
    child.stdin?.end();
  });
}

/**
 * Call Claude via Anthropic SDK (when API key is available).
 */
async function callClaudeApi(prompt: string): Promise<string> {
  // Dynamic import so the SDK is truly optional — not a hard dependency.
  // Uses Function() constructor to prevent tsup/esbuild from bundling the SDK.
  // Standard `await import(...)` would be rewritten by the bundler into a require,
  // failing at runtime when the package isn't installed.
  const mod = await (Function('return import("@anthropic-ai/sdk")')() as Promise<{ default: new () => AnthropicClient }>);
  const client = new mod.default();
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const block = message.content[0];
  if (block.type === "text") return block.text;
  throw new Error("Unexpected API response format");
}

/** Minimal type for the Anthropic client (avoids hard dep on @anthropic-ai/sdk types) */
interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{
      content: Array<{ type: string; text: string }>;
    }>;
  };
}

/**
 * Call Claude using the best available backend.
 * Prefers API key (faster, works in CI) over CLI.
 */
export async function callClaude(prompt: string): Promise<string> {
  if (hasApiKey()) {
    return callClaudeApi(prompt);
  }
  return callClaudeCli(prompt);
}

/**
 * Extract JSON from a response that might contain markdown fences or extra text.
 */
function extractJson(text: string): string {
  // Try extracting from markdown code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try finding raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];

  return text;
}

/**
 * Infer the project type using AI for unknown projects.
 * Returns a free-form descriptive type string (e.g. "python data pipeline").
 */
export async function inferProjectType(
  context: ProjectContext,
): Promise<{ inferredType: string; primaryLanguages: string[]; confidence: number }> {
  const ec = context.exploratoryContext;
  const s = context.signals;
  const signalSummary = [
    s.hasTypescript && "TypeScript",
    s.hasTailwind && "Tailwind",
    s.hasPrisma && "Prisma",
    s.hasDrizzle && "Drizzle",
    s.hasSupabase && "Supabase",
    s.hasTurborepo && "Turborepo",
    s.hasMonorepo && "Monorepo",
    s.hasDocker && "Docker",
    s.hasVite && "Vite",
    ...s.frameworks,
    s.testFramework,
    s.styling,
  ].filter(Boolean);

  const prompt = `Given these project signals, infer the project type in 2-4 words (e.g. "python data pipeline", "rust cli tool", "java android app").

Signals:
- Top-level files: ${JSON.stringify(ec.topLevelFiles)}
- File extensions: ${JSON.stringify(ec.fileExtensions)}
- Manifest files: ${JSON.stringify(ec.manifestFiles)}
- Import patterns: ${JSON.stringify(ec.importPatterns)}
- Detected signals: ${JSON.stringify(signalSummary)}
- Config files: ${JSON.stringify(context.configFiles)}
- CLAUDE.md excerpt: """${ec.claudeMdSnippet.slice(0, 500)}"""
- README excerpt: """${ec.readmeSnippet.slice(0, 500)}"""

Return ONLY valid JSON: {"inferredType": "...", "primaryLanguages": ["python", "java"], "confidence": 85}`;

  const raw = await callClaude(prompt);
  const json = extractJson(raw);
  const parsed = JSON.parse(json) as { inferredType: string; primaryLanguages: string[]; confidence: number };

  if (typeof parsed.inferredType !== "string" || !Array.isArray(parsed.primaryLanguages)) {
    throw new Error("Invalid AI type inference response");
  }

  return parsed;
}

/**
 * Analyze a project using Claude to identify technologies and generate search queries.
 */
export async function analyzeProject(context: ProjectContext): Promise<AIAnalysis> {
  const deps = context.packageJson
    ? {
        ...((context.packageJson.dependencies ?? {}) as Record<string, string>),
        ...((context.packageJson.devDependencies ?? {}) as Record<string, string>),
      }
    : {};

  const hasSkills = context.installedSkills.length > 0;
  const coverageInstruction = hasSkills
    ? `\nThe project already has ${context.installedSkills.length} skill(s) installed: ${JSON.stringify(context.installedSkills)}
Assess how well these cover the project's core needs. If existing skills already provide strong coverage, there may be no need for as many search queries — use your judgment to generate only queries that target genuine gaps. A well-covered project might need just 2-3 targeted queries, while a project with no skills might need 8-10.`
    : `\nNo skills are currently installed — generate a comprehensive set of queries to cover the project's core needs.`;

  const ec = context.exploratoryContext;
  const claudeMdSection = ec.claudeMdSnippet
    ? `\n- CLAUDE.md project documentation:\n"""\n${ec.claudeMdSnippet.slice(0, 1000)}\n"""\nThis file describes the project's stack, patterns, and constraints. Use it as a primary signal.`
    : "";

  const prompt = `You are a JSON API analyzing a software project to recommend skills from skills.sh.

Given this project context:
- Name: ${context.name}
- Inferred type: ${context.inferredType}
- package.json dependencies: ${JSON.stringify(Object.keys(deps))}
- Config files present: ${JSON.stringify(context.configFiles)}${claudeMdSection}
- Top-level files: ${JSON.stringify(ec.topLevelFiles.slice(0, 30))}
- File extensions: ${JSON.stringify(ec.fileExtensions)}
- Manifest files: ${JSON.stringify(ec.manifestFiles)}
- Import patterns: ${JSON.stringify(ec.importPatterns.slice(0, 20))}
${coverageInstruction}

Identify the core technologies, services, frameworks, and patterns in use.
Then generate focused search queries for skills.sh (a registry of Claude Code skills).

Best practices for queries:
- Prioritize the project's CORE stack — skip tangential or generic queries
- Don't generate overlapping queries (e.g., "react" covers "react hooks")
- One query per distinct technology or concern
- Don't search for technologies already well-covered by installed skills unless you believe better alternatives may exist

Return ONLY valid JSON, no other text:
{"technologies": ["next.js", "react", ...], "queries": ["nextjs", "react", ...], "reasoning": "Brief explanation...", "coverageSummary": "Brief assessment of existing skill coverage and gaps, or 'No skills installed' if none"}`;

  const raw = await callClaude(prompt);
  const json = extractJson(raw);
  const parsed = JSON.parse(json) as AIAnalysis;

  if (!Array.isArray(parsed.technologies) || !Array.isArray(parsed.queries) || typeof parsed.reasoning !== "string") {
    throw new Error("Invalid AI analysis response structure");
  }

  // Hard cap on queries as safety net
  parsed.queries = parsed.queries.slice(0, MAX_QUERIES);

  // Normalise optional field
  if (typeof parsed.coverageSummary !== "string") {
    parsed.coverageSummary = undefined;
  }

  return parsed;
}

/**
 * Rank skills by relevance to a project using Claude.
 * Returns both the ranked list and metadata about coverage assessment.
 */
export async function rankSkills(
  skills: SkillSearchResult[],
  context: ProjectContext,
  analysis: AIAnalysis,
): Promise<{ ranked: RankedSkill[]; meta: RankingMeta }> {
  // Fetch official status and audit data in parallel
  const [officialStatuses, audits] = await Promise.all([
    Promise.all(skills.map(async (s) => ({ name: s.name, official: await isOfficialSource(s.source) }))),
    fetchAuditsBatch(skills),
  ]);

  const officialMap = new Map(officialStatuses.map((o) => [o.name, o.official]));

  const skillSummaries = skills.map((s) => {
    const audit = audits.get(s.name);
    const risk = audit ? summarizeRisk(audit) : "unaudited";
    return {
      name: s.name,
      source: s.source,
      installs: s.installs,
      official: officialMap.get(s.name) ?? false,
      auditRisk: risk,
    };
  });

  const hasInstalled = context.installedSkills.length > 0;
  const coverageContext = hasInstalled
    ? `\nAlready installed skills: ${JSON.stringify(context.installedSkills)}
Consider what these skills already cover. If the project has strong existing coverage, there may be no need to recommend many additional skills. Use your judgment — a well-covered project might only need 2-5 targeted additions, while a project with few or no skills may benefit from 10-15. Set maxRecommended to reflect your assessment.`
    : `\nNo skills are currently installed — recommend a comprehensive set to cover the project's core needs.`;

  const compatibilityContext = context.exploratoryContext.claudeMdSnippet
    ? `\nProject CLAUDE.md excerpt (for compatibility assessment): """${context.exploratoryContext.claudeMdSnippet.slice(0, 500)}"""`
    : "";

  const prompt = `You are a JSON API ranking skills by relevance to a project.

Project: ${context.name} — ${analysis.reasoning}
Technologies: ${JSON.stringify(analysis.technologies)}
Inferred type: ${context.inferredType}
${coverageContext}${compatibilityContext}

Available skills (candidates, NOT yet installed):
${JSON.stringify(skillSummaries)}

IMPORTANT ranking rules:
- Official skills (official: true) from technology vendors MUST be strongly preferred over community alternatives.
- When a project uses a technology (e.g., Supabase, Resend, Stripe), the OFFICIAL skill from that vendor should be ranked "essential" with relevance >= 85.
- Community skills should only be recommended when no official alternative exists for that technology.
- Security audit risk levels (auditRisk) indicate skill safety: "safe" and "low" are good, "medium" requires caution, "high" and "critical" should be excluded or ranked very low.
- Prefer skills with "safe" or "low" audit risk over "unaudited" or higher-risk alternatives.
- Only include skills that meaningfully improve this specific project.
- Keep reasons under 15 words. Only include relevance >= 40.

COMPATIBILITY rules:
- Assess whether each skill is actually compatible with this project's setup.
- If a skill targets a specific framework version, router type, or language version that doesn't match this project, reduce its relevance or exclude it.
- Add a "compatible" field (true/false) and "compatibilityNote" (brief explanation if false).
- Example: A "Next.js App Router" skill should score low for a Pages Router project. A "React 18" skill should score low for a React 19 project.

For each skill provide:
- tier: "essential" (relevance ≥ 80), "recommended" (60-79), or "optional" (40-59)
- category: one of Framework, Styling, Database, Testing, DevOps, State, Auth, API, Performance, DX, General
- description: one-sentence description of what the skill provides
- compatible: true/false
- compatibilityNote: brief explanation if not compatible (omit if compatible)

Return ONLY valid JSON, no other text:
{"coverageNote": "Brief assessment of how well the project is already covered and what gaps remain", "maxRecommended": <number or null — how many skills you think this project actually needs, null means no cap>, "ranked": [{"name": "skill-name", "reason": "Why it's relevant", "relevance": 85, "tier": "essential", "category": "Framework", "description": "Next.js App Router patterns and conventions", "compatible": true}, ...]}`;

  const raw = await callClaude(prompt);
  const json = extractJson(raw);
  const parsed = JSON.parse(json) as {
    ranked: Array<{
      name: string;
      reason: string;
      relevance: number;
      tier?: RelevanceTier;
      category?: string;
      description?: string;
      compatible?: boolean;
      compatibilityNote?: string;
    }>;
    coverageNote?: string;
    maxRecommended?: number | null;
  };

  if (!Array.isArray(parsed.ranked)) {
    throw new Error("Invalid AI ranking response structure");
  }

  // Map ranked results back to full skill objects
  const skillsByName = new Map(skills.map((s) => [s.name, s]));
  const ranked: RankedSkill[] = [];

  for (const item of parsed.ranked) {
    const skill = skillsByName.get(item.name);
    if (skill) {
      const audit = audits.get(skill.name);
      ranked.push({
        skill,
        reason: item.reason,
        relevance: item.relevance,
        tier: item.tier ?? inferTier(item.relevance),
        category: item.category ?? "General",
        description: item.description ?? "",
        official: officialMap.get(skill.name) ?? false,
        auditRisk: audit ? summarizeRisk(audit) : "unaudited",
        compatible: item.compatible,
        compatibilityNote: item.compatibilityNote,
      });
    }
  }

  const meta: RankingMeta = {
    coverageNote: typeof parsed.coverageNote === "string" ? parsed.coverageNote : "No coverage assessment available",
    maxRecommended: typeof parsed.maxRecommended === "number" ? parsed.maxRecommended : undefined,
  };

  return { ranked, meta };
}

function inferTier(relevance: number): RelevanceTier {
  if (relevance >= 80) return "essential";
  if (relevance >= 60) return "recommended";
  return "optional";
}
