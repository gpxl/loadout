import { log } from "../utils/log.js";

const OFFICIAL_PAGE_URL = "https://skills.sh/official";

let cachedOfficialOrgs: Set<string> | null = null;

/**
 * Fetch the list of official org slugs from skills.sh/official in real-time.
 * Extracts org names from GitHub avatar image-proxy URLs on the page.
 * Results are cached for the lifetime of the process.
 */
export async function fetchOfficialOrgs(): Promise<Set<string>> {
  if (cachedOfficialOrgs) return cachedOfficialOrgs;

  try {
    const res = await fetch(OFFICIAL_PAGE_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const html = await res.text();

    // Official orgs are listed via GitHub avatar image-proxy URLs:
    // /api/image-proxy?url=https%3A%2F%2Fgithub.com%2Fsupabase.png%3Fsize%3D48
    const matches = html.matchAll(/github\.com%2F([a-zA-Z0-9_-]+)\.png/g);
    const orgs = new Set<string>();
    for (const match of matches) {
      orgs.add(match[1].toLowerCase());
    }

    if (orgs.size === 0) {
      log.warn("Could not parse official orgs from skills.sh — falling back to source-based detection.");
    }

    cachedOfficialOrgs = orgs;
    return orgs;
  } catch (err) {
    log.warn(`Failed to fetch official orgs: ${err instanceof Error ? err.message : err}`);
    cachedOfficialOrgs = new Set();
    return cachedOfficialOrgs;
  }
}

/**
 * Extract the GitHub org from a source string like "supabase/agent-skills".
 */
function extractOrg(source: string): string {
  return source.split("/")[0].toLowerCase();
}

/**
 * Check if a skill source is from an official provider.
 * Requires fetchOfficialOrgs() to have been called first.
 */
export async function isOfficialSource(source: string): Promise<boolean> {
  const orgs = await fetchOfficialOrgs();
  return orgs.has(extractOrg(source));
}

/**
 * Synchronous check using the cached official orgs.
 * Returns false if the cache has not been populated yet.
 */
export function isOfficialSourceCached(source: string): boolean {
  if (!cachedOfficialOrgs) return false;
  return cachedOfficialOrgs.has(extractOrg(source));
}
