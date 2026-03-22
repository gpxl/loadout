import { z } from "zod";

/** A skill returned by the skills.sh search API */
export const SkillSearchResultSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  name: z.string(),
  installs: z.number(),
  source: z.string(),
});

export type SkillSearchResult = z.infer<typeof SkillSearchResultSchema>;

/** Search API response envelope */
export const SearchResponseSchema = z.object({
  query: z.string(),
  searchType: z.string(),
  skills: z.array(SkillSearchResultSchema),
  count: z.number(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** An installed skill as reported by `npx skills list --json` */
export const InstalledSkillSchema = z.object({
  name: z.string(),
  path: z.string(),
  scope: z.string(),
  agents: z.array(z.string()).optional(),
});

export type InstalledSkill = z.infer<typeof InstalledSkillSchema>;

/** Detected project signals for recommendation */
export interface ProjectSignals {
  hasTypescript: boolean;
  hasTailwind: boolean;
  hasPrisma: boolean;
  hasDrizzle: boolean;
  hasSupabase: boolean;
  hasTurborepo: boolean;
  hasMonorepo: boolean;
  hasDocker: boolean;
  hasVite: boolean;
  frameworks: string[];
  testFramework: string | null;
  styling: string | null;
}

export interface DetectedProject {
  path: string;
  name: string;
  signals: ProjectSignals;
  hasClaudeSkills: boolean;
  installedSkills: string[];
}

/** Gathered context for unknown or under-detected projects */
export interface ExploratoryContext {
  topLevelFiles: string[];
  readmeSnippet: string;
  claudeMdSnippet: string;
  fileExtensions: Record<string, number>;
  manifestFiles: string[];
  importPatterns: string[];
}

/** Full project context for AI analysis */
export interface ProjectContext {
  path: string;
  name: string;
  signals: ProjectSignals;
  packageJson: Record<string, unknown> | null;
  configFiles: string[];
  installedSkills: string[];
  exploratoryContext: ExploratoryContext;
  inferredType: string;
}

/** AI-generated project analysis */
export interface AIAnalysis {
  technologies: string[];
  queries: string[];
  reasoning: string;
  coverageSummary?: string;
}

/** Metadata returned alongside ranked skills */
export interface RankingMeta {
  coverageNote: string;
  maxRecommended?: number;
}

export type RelevanceTier = "essential" | "recommended" | "optional";

/** A skill ranked by AI with explanation */
export interface RankedSkill {
  skill: SkillSearchResult;
  reason: string;
  relevance: number;
  tier: RelevanceTier;
  category: string;
  description: string;
  official: boolean;
  auditRisk: string;
  compatible?: boolean;
  compatibilityNote?: string;
}
