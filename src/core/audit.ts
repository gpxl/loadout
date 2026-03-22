import { z } from "zod";
import type { SkillSearchResult } from "../types.js";

const AUDIT_API = "https://skills.sh/api/audit";

/** Audit result from a single provider */
const ProviderAuditSchema = z.object({
  risk: z.string(),
  analyzedAt: z.string().optional(),
  alerts: z.number().optional(),
  score: z.number().optional(),
});

/** Audit result for a single skill (keyed by provider) */
const SkillAuditSchema = z.object({
  ath: ProviderAuditSchema.optional(),
  socket: ProviderAuditSchema.optional(),
  snyk: ProviderAuditSchema.optional(),
});

export type SkillAudit = z.infer<typeof SkillAuditSchema>;

/** Map of skill name → audit data */
export type AuditResults = Map<string, SkillAudit>;

/**
 * Summarize an audit result into a single risk label for display.
 * Uses worst-case across providers.
 */
export function summarizeRisk(audit: SkillAudit): string {
  const risks = [
    audit.ath?.risk,
    audit.socket?.risk,
    audit.snyk?.risk,
  ].filter(Boolean) as string[];

  if (risks.length === 0) return "unaudited";

  const SEVERITY_ORDER = ["critical", "high", "medium", "med", "low", "safe"];
  for (const level of SEVERITY_ORDER) {
    if (risks.some((r) => r.toLowerCase().includes(level))) {
      if (level === "med") return "medium";
      return level;
    }
  }

  return risks[0].toLowerCase();
}

/**
 * Fetch audit data for a batch of skills from the same source.
 * Returns a map of skill name → audit data.
 */
export async function fetchAudits(
  source: string,
  skillNames: string[],
): Promise<AuditResults> {
  const results: AuditResults = new Map();
  if (skillNames.length === 0) return results;

  try {
    const url = new URL(AUDIT_API);
    url.searchParams.set("source", source);
    url.searchParams.set("skills", skillNames.join(","));

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return results;

    const json = await res.json() as Record<string, unknown>;

    for (const [name, data] of Object.entries(json)) {
      const parsed = SkillAuditSchema.safeParse(data);
      if (parsed.success) {
        results.set(name, parsed.data);
      }
    }
  } catch {
    // Audit data is best-effort — never block on failure
  }

  return results;
}

/**
 * Fetch audit data for a mixed set of skills from multiple sources.
 * Groups by source and fetches in parallel.
 */
export async function fetchAuditsBatch(
  skills: SkillSearchResult[],
): Promise<AuditResults> {
  // Group by source
  const bySource = new Map<string, string[]>();
  for (const skill of skills) {
    const group = bySource.get(skill.source) ?? [];
    group.push(skill.name);
    bySource.set(skill.source, group);
  }

  // Fetch in parallel
  const allResults: AuditResults = new Map();
  const fetches = [...bySource.entries()].map(async ([source, names]) => {
    const results = await fetchAudits(source, names);
    for (const [name, audit] of results) {
      allResults.set(name, audit);
    }
  });

  await Promise.all(fetches);
  return allResults;
}
