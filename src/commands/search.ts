import chalk from "chalk";
import { searchSkills } from "../core/registry.js";
import { fetchOfficialOrgs, isOfficialSourceCached } from "../core/official.js";
import { fetchAuditsBatch, summarizeRisk } from "../core/audit.js";
import { log } from "../utils/log.js";
import { formatInstalls, getRiskColor } from "../utils/format.js";
import type { SkillSearchResult } from "../types.js";

export async function searchCommand(
  query: string,
  opts: { limit?: number } = {},
): Promise<void> {
  const limit = opts.limit ?? 20;

  log.dim(`Searching skills.sh for "${query}"...`);

  // Fetch search results, official orgs, in parallel
  const [results] = await Promise.all([
    searchSkills({ query, limit }),
    fetchOfficialOrgs(),
  ]);

  if (results.length === 0) {
    log.warn(`No skills found for "${query}".`);
    return;
  }

  // Fetch audit data for all results
  const audits = await fetchAuditsBatch(results);

  console.log();
  for (const skill of results) {
    const installs = formatInstalls(skill.installs);
    const badge = isOfficialSourceCached(skill.source) ? chalk.yellow(" [Official]") : "";
    const audit = audits.get(skill.name);
    const risk = audit ? summarizeRisk(audit) : "unaudited";
    const riskColor = getRiskColor(risk);
    console.log(
      `  ${chalk.cyan(skill.name)}${badge} ${riskColor(`[${risk}]`)} ${chalk.dim(`(${installs} installs)`)}`,
    );
    console.log(`    ${chalk.dim("source:")} ${skill.source}`);
    console.log(
      `    ${chalk.dim("install:")} loadout install ${skill.source}`,
    );
    console.log();
  }

  log.dim(`${results.length} result(s) — install with: loadout install <source>`);
}

