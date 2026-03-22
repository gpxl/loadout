import { resolve } from "node:path";
import { checkbox, Separator } from "@inquirer/prompts";
import chalk from "chalk";
import { detectProject, buildProjectContext } from "../core/detect.js";
import { inferProjectType } from "../core/ai.js";
import { getRecommendations } from "../core/recommend.js";
import { installSkillBatch, generateSkillRules } from "../core/skills.js";
import { log, printInstallSummary } from "../utils/log.js";
import { formatInstalls, getRiskColor } from "../utils/format.js";
import type { SkillSearchResult, RankedSkill, RelevanceTier } from "../types.js";

const TIER_LABELS: Record<RelevanceTier, string> = {
  essential: "Essential",
  recommended: "Recommended",
  optional: "Optional",
};

const TIER_ORDER: RelevanceTier[] = ["essential", "recommended", "optional"];

/** Time window (ms) for double-ESC detection. */
const ESC_WINDOW = 1000;

export async function scanCommand(
  path?: string,
  options: { global?: boolean; yes?: boolean; json?: boolean } = {},
): Promise<void> {
  const projectPath = resolve(path ?? process.cwd());

  if (options.json) {
    log.setQuiet(true);
  } else {
    log.info(`Scanning ${chalk.bold(projectPath)}...`);
  }

  const project = await detectProject(projectPath);
  const context = await buildProjectContext(project);

  // Edge case #6: Empty project — warn early if nothing to analyze
  const ec = context.exploratoryContext;
  if (ec.topLevelFiles.length === 0 && Object.keys(ec.fileExtensions).length === 0 && ec.manifestFiles.length === 0) {
    if (options.json) {
      writeJson({ error: "Empty project — no files found to analyze.", project: { path: projectPath, name: context.name } });
    } else {
      log.warn("No project files found. Is this an empty directory?");
    }
    return;
  }

  // Edge case #5: AI failure — clean error message instead of stack trace
  log.info("Analyzing project...");
  let typeResult: { inferredType: string; confidence: number };
  try {
    typeResult = await inferProjectType(context);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      writeJson({ error: `AI analysis failed: ${msg}`, project: { path: projectPath, name: context.name } });
    } else {
      log.error(`AI analysis failed: ${msg}`);
      log.dim("Ensure the Claude CLI is installed or set ANTHROPIC_API_KEY, then try again.");
    }
    return;
  }
  context.inferredType = typeResult.inferredType;
  log.info(`Detected: ${chalk.cyan(typeResult.inferredType)} (${typeResult.confidence}% confidence)`);

  let ranked: RankedSkill[] = [];
  let coverageSummary: string | undefined;
  let coverageNote: string | undefined;
  let totalEvaluated = 0;
  try {
    const recommendations = await getRecommendations(context);
    ranked = recommendations.ranked;
    coverageSummary = recommendations.coverageSummary;
    coverageNote = recommendations.coverageNote;
    totalEvaluated = recommendations.totalEvaluated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      writeJson({
        error: `Recommendation pipeline failed: ${msg}`,
        project: { path: projectPath, name: context.name, type: context.inferredType },
      });
    } else {
      log.error(`Recommendation pipeline failed: ${msg}`);
      log.dim("Try again or use `loadout search <query>` to search manually.");
    }
    return;
  }

  // --json: output structured result and exit (no prompts, no install)
  if (options.json) {
    writeJson({
      project: {
        path: projectPath,
        name: context.name,
        type: context.inferredType,
        installedSkillCount: context.installedSkills.length,
        installedSkills: context.installedSkills,
      },
      coverage: {
        summary: coverageSummary ?? null,
        note: coverageNote ?? null,
      },
      totalEvaluated,
      recommendations: ranked.map((r) => ({
        name: r.skill.name,
        source: r.skill.source,
        installs: r.skill.installs,
        tier: r.tier,
        relevance: r.relevance,
        reason: r.reason,
        description: r.description,
        category: r.category,
        official: r.official,
        auditRisk: r.auditRisk,
        compatible: r.compatible ?? true,
        compatibilityNote: r.compatibilityNote ?? null,
      })),
    });
    return;
  }

  // Interactive / --yes path
  if (context.installedSkills.length > 0) {
    log.info(`${chalk.bold(String(context.installedSkills.length))} skill(s) already installed.`);
  }
  const coverageMsg = coverageNote ?? coverageSummary;
  if (coverageMsg) {
    log.dim(`Coverage: ${coverageMsg}`);
  }

  if (ranked.length > 0) {
    let selected: SkillSearchResult[];

    if (options.yes) {
      selected = ranked.map((r) => r.skill);
      const officialCount = ranked.filter((r) => r.official).length;
      const badge = officialCount > 0 ? ` (${officialCount} official)` : "";
      log.info(`Auto-selecting all ${selected.length} recommended skill(s)${badge}.`);
    } else {
      const choices = buildTieredChoices(ranked);
      const result = await promptWithDoubleEsc(choices);
      if (result === null) {
        return;
      }
      selected = result;

      if (selected.length === 0) {
        log.dim("Nothing selected.");
        log.dim("Run loadout search <query> to explore more skills.");
        return;
      }
    }

    const descriptionMap = new Map<string, string>();
    for (const r of ranked) {
      descriptionMap.set(r.skill.name, r.description || r.reason);
    }

    await installSelected(selected, { projectPath, global: options.global }, descriptionMap);
    log.dim("Run loadout search <query> to explore more skills.");
  } else {
    log.success("No new skills to recommend — you're all set!");
  }
}

/**
 * Present the checkbox prompt with double-ESC exit support.
 * Returns null if the user exits via double-ESC, otherwise the selection.
 */
async function promptWithDoubleEsc(
  choices: Array<{ name: string; value: SkillSearchResult } | Separator>,
): Promise<SkillSearchResult[] | null> {
  const ac = new AbortController();
  let lastEscTime = 0;

  const onKeypress = (_str: string, key: { name: string }) => {
    if (key?.name === "escape") {
      const now = Date.now();
      if (now - lastEscTime < ESC_WINDOW) {
        ac.abort();
      }
      lastEscTime = now;
    }
  };

  process.stdin.on("keypress", onKeypress);

  try {
    return await checkbox<SkillSearchResult>({
      message: "Select skills to install (ESC ESC to exit):",
      choices,
      pageSize: 20,
    }, { signal: ac.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortPromptError") {
      log.dim("Exited.");
      return null;
    }
    // Ctrl+C / SIGINT — also treat as clean exit
    if (err instanceof Error && err.name === "ExitPromptError") {
      log.dim("Exited.");
      return null;
    }
    throw err;
  } finally {
    process.stdin.removeListener("keypress", onKeypress);
  }
}

function buildTieredChoices(ranked: RankedSkill[]): Array<{ name: string; value: SkillSearchResult } | Separator> {
  const grouped = new Map<RelevanceTier, RankedSkill[]>();
  for (const item of ranked) {
    const existing = grouped.get(item.tier) ?? [];
    existing.push(item);
    grouped.set(item.tier, existing);
  }

  const choices: Array<{ name: string; value: SkillSearchResult } | Separator> = [];

  for (const tier of TIER_ORDER) {
    const skills = grouped.get(tier);
    if (!skills || skills.length === 0) continue;

    choices.push(new Separator(chalk.bold(`\n  ${TIER_LABELS[tier]} (${skills.length} skills)`)));

    for (const { skill, reason, relevance, description, official, auditRisk, compatible, compatibilityNote } of skills) {
      const badgeParts: string[] = [];
      badgeParts.push(official ? "Official skill" : "Community");
      badgeParts.push(`${auditRisk} risk`);
      badgeParts.push(`${relevance}% confidence`);
      const colorFn = getRiskColor(auditRisk);
      const badgeStr = `${official ? chalk.yellow(badgeParts[0]) : chalk.dim(badgeParts[0])}/${colorFn(badgeParts[1])}/${chalk.cyan(badgeParts[2])}`;
      const compatWarning = compatible === false ? ` ${chalk.red("⚠ " + (compatibilityNote ?? "may not be compatible"))}` : "";
      const desc = description ? ` — ${description}` : "";
      const line1 = `${skill.name} [${badgeStr}] ${chalk.dim(`(${formatInstalls(skill.installs)} installs)`)}${chalk.dim(desc)}${compatWarning}`;
      const line2 = `  ${chalk.green(reason)}`;
      choices.push({
        name: `${line1}\n    ${line2}`,
        value: skill,
      });
    }
  }

  return choices;
}

async function installSelected(
  selected: SkillSearchResult[],
  opts: { projectPath: string; global?: boolean },
  descriptionMap?: Map<string, string>,
): Promise<void> {
  const bySource = new Map<string, SkillSearchResult[]>();
  for (const skill of selected) {
    const group = bySource.get(skill.source) ?? [];
    group.push(skill);
    bySource.set(skill.source, group);
  }

  const successfulSkills: Array<{ name: string; description: string }> = [];
  const allResults = new Map<string, Error | null>();

  for (const [source, skills] of bySource) {
    const names = skills.map((s) => s.name);
    log.info(`Installing ${names.length} skill(s) from ${chalk.cyan(source)}...`);

    const results = await installSkillBatch(source, names, {
      projectPath: opts.projectPath,
      global: opts.global,
    });

    for (const [name, err] of results) {
      allResults.set(name, err);
      if (err) {
        log.error(`Failed to install ${name}: ${err.message}`);
      } else {
        log.success(`Installed ${name}`);
        const desc = descriptionMap?.get(name) ?? name;
        successfulSkills.push({ name, description: desc });
      }
    }
  }

  printInstallSummary(allResults);

  if (successfulSkills.length > 0) {
    await generateSkillRules(successfulSkills, opts.projectPath, { global: opts.global });

    const targetPath = opts.global ? "~/.claude/skills/" : `${opts.projectPath}/.claude/skills/`;
    log.success(`Done! ${successfulSkills.length} skill(s) installed in ${chalk.bold(targetPath)}`);
    log.success("Updated .claude/rules/skills.md — Claude will use these skills automatically.");
    log.dim("Skills are active in your next Claude Code session.");
  }
}

function writeJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

