import type { ProjectContext, SkillSearchResult, RankedSkill, RankingMeta, AIAnalysis } from "../types.js";
import { isAIAvailable, analyzeProject, rankSkills, callClaude, MAX_QUERIES } from "./ai.js";
import { searchSkills } from "./registry.js";
import { log } from "../utils/log.js";

export interface RecommendationResult {
  ranked: RankedSkill[];
  totalEvaluated: number;
  coverageSummary?: string;
  coverageNote?: string;
}

/**
 * Get AI-powered recommendations for a project.
 * Requires AI (Claude CLI or ANTHROPIC_API_KEY). Throws if unavailable.
 */
export async function getRecommendations(
  context: ProjectContext,
): Promise<RecommendationResult> {
  if (!await isAIAvailable()) {
    throw new Error(
      "AI is required for skill recommendations. Install the Claude CLI or set ANTHROPIC_API_KEY.",
    );
  }

  log.dim("Analyzing project with Claude...");
  const analysis = await analyzeProject(context);
  const queries = analysis.queries.slice(0, MAX_QUERIES);

  // Edge case #1: AI returned no search queries
  if (queries.length === 0) {
    log.warn("AI analysis returned no search queries. Try `loadout search <query>` to search manually.");
    return { ranked: [], totalEvaluated: 0, coverageSummary: analysis.coverageSummary };
  }

  log.dim(`AI identified: ${analysis.technologies.join(", ")}`);

  // Search in parallel for all queries
  const searchResults = await Promise.allSettled(
    queries.map((q) => searchSkills({ query: q, limit: 10 })),
  );

  // Edge case #2: Track search failures and warn when all fail
  let searchFailures = 0;
  const results: SkillSearchResult[][] = [];
  for (const result of searchResults) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      searchFailures++;
      results.push([]);
    }
  }

  if (searchFailures > 0 && searchFailures === queries.length) {
    log.warn("All skill searches failed — skills.sh may be unavailable. Try again later or use `loadout search <query>`.");
    return { ranked: [], totalEvaluated: 0, coverageSummary: analysis.coverageSummary };
  } else if (searchFailures > 0) {
    log.dim(`${searchFailures}/${queries.length} searches failed — results may be incomplete.`);
  }

  const allSkills = deduplicateSkills(results.flat());
  const bestVersions = deduplicateByName(allSkills);
  let available = filterInstalled(bestVersions, context.installedSkills);

  // Second pass: refine if first pass seems thin
  if (available.length < 10) {
    try {
      log.dim("Checking for coverage gaps...");
      const followUp = await refineQueries(available, context, analysis);
      if (followUp.length > 0) {
        const moreResults = await Promise.all(
          followUp.map((q) =>
            searchSkills({ query: q, limit: 10 }).catch(() => [] as SkillSearchResult[]),
          ),
        );
        const moreSkills = deduplicateByName(deduplicateSkills(moreResults.flat()));
        const moreAvailable = filterInstalled(moreSkills, context.installedSkills);
        // Merge, dedup by name again
        const merged = [...available, ...moreAvailable];
        available = deduplicateByName(merged);
      }
    } catch {
      // Best-effort — continue with first-pass results
    }
  }

  // Sort by install count as baseline
  available.sort((a, b) => b.installs - a.installs);

  // AI ranking — cap input to keep prompt small and response fast
  const MAX_SKILLS_FOR_RANKING = 25;
  let ranked: RankedSkill[] = [];
  let totalEvaluated = 0;
  let rankingMeta: RankingMeta | null = null;

  if (available.length > 0) {
    try {
      log.dim("Ranking skills by relevance...");
      const toRank = available.slice(0, MAX_SKILLS_FOR_RANKING);
      totalEvaluated = toRank.length;
      const result = await rankSkills(toRank, context, analysis);
      ranked = result.ranked;
      rankingMeta = result.meta;

      // Edge case #4: AI caps too aggressively — floor at 1 when results exist
      if (rankingMeta.maxRecommended != null && rankingMeta.maxRecommended > 0 && ranked.length > rankingMeta.maxRecommended) {
        ranked = ranked.slice(0, rankingMeta.maxRecommended);
      }
    } catch (err) {
      // Edge case #3: Ranking failure — warn clearly, don't masquerade as "all set"
      log.warn(`AI ranking failed: ${err instanceof Error ? err.message : err}`);
      log.warn(`${totalEvaluated} skill(s) were found but could not be ranked. Try again or use \`loadout search <query>\`.`);
    }
  }

  return {
    ranked,
    totalEvaluated,
    coverageSummary: analysis.coverageSummary,
    coverageNote: rankingMeta?.coverageNote,
  };
}

/**
 * Use AI to identify coverage gaps and generate follow-up search queries.
 * Only called when the first pass returns fewer than 10 results.
 */
async function refineQueries(
  firstPassResults: SkillSearchResult[],
  context: ProjectContext,
  analysis: AIAnalysis,
): Promise<string[]> {
  const prompt = `You searched for skills and found these results:
${JSON.stringify(firstPassResults.map((s) => s.name))}

The project uses: ${analysis.technologies.join(", ")}
${context.inferredType ? `Inferred type: ${context.inferredType}` : ""}

Are there technology gaps not covered by these results? If so, suggest 2-4 targeted follow-up search queries. If coverage is adequate, return an empty array.

Return ONLY valid JSON: {"gaps": ["description of gap"], "queries": ["query1", "query2"]}`;

  const raw = await callClaude(prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as { gaps?: string[]; queries?: string[] };
  return Array.isArray(parsed.queries) ? parsed.queries.slice(0, 4) : [];
}

/**
 * Deduplicate skills by id, keeping the first occurrence.
 */
export function deduplicateSkills<T extends { id: string }>(
  skills: T[],
): T[] {
  const seen = new Set<string>();
  return skills.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/**
 * Deduplicate skills by name, keeping the version with the most installs.
 * Many skills appear from multiple sources (e.g. "zustand" from 5 repos).
 */
export function deduplicateByName<T extends { name: string; installs: number }>(
  skills: T[],
): T[] {
  const bestByName = new Map<string, T>();
  for (const skill of skills) {
    const existing = bestByName.get(skill.name);
    if (!existing || skill.installs > existing.installs) {
      bestByName.set(skill.name, skill);
    }
  }
  return [...bestByName.values()];
}

/**
 * Filter out already-installed skills.
 */
export function filterInstalled<T extends { name: string }>(
  skills: T[],
  installedNames: string[],
): T[] {
  const installed = new Set(installedNames);
  return skills.filter((s) => !installed.has(s.name));
}
