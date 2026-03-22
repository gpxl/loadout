import { SearchResponseSchema } from "../types.js";
import type { SkillSearchResult } from "../types.js";

const SEARCH_API = "https://skills.sh/api/search";

export interface SearchOptions {
  query: string;
  limit?: number;
}

/**
 * Search the skills.sh registry for skills matching a query.
 * Uses the public search API at skills.sh/api/search.
 */
export async function searchSkills(
  opts: SearchOptions,
): Promise<SkillSearchResult[]> {
  const { query, limit = 20 } = opts;

  if (query.length < 2) {
    throw new Error("Search query must be at least 2 characters");
  }

  const url = new URL(SEARCH_API);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`skills.sh search failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const parsed = SearchResponseSchema.parse(json);
  return parsed.skills;
}
