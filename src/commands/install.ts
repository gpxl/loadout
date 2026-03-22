import { resolve } from "node:path";
import chalk from "chalk";
import { checkbox, confirm } from "@inquirer/prompts";
import { installSkillDirect, installSkillBatch, discoverSkillsInRepo, generateSkillRules, getProjectSkills } from "../core/skills.js";
import { log, printInstallSummary } from "../utils/log.js";

export async function installCommand(
  source: string,
  opts: { global?: boolean; skill?: string; yes?: boolean } = {},
): Promise<void> {
  const projectPath = resolve(process.cwd());

  if (opts.skill) {
    // Direct single-skill install
    log.info(`Installing ${chalk.cyan(opts.skill)} from ${chalk.cyan(source)}...`);

    if (!opts.yes) {
      const ok = await confirm({
        message: `Install ${opts.skill} from ${source}${opts.global ? " (global)" : ""}?`,
        default: true,
      });
      if (!ok) {
        log.dim("Cancelled.");
        return;
      }
    }

    try {
      await installSkillDirect(source, opts.skill, { global: opts.global, projectPath });
      log.success(`Installed ${opts.skill}`);
      await updateSkillRules(projectPath, opts.global);
    } catch (err) {
      log.error(`Failed to install: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
    return;
  }

  // Discovery mode: clone repo, discover skills, show checkbox
  log.info(`Discovering skills in ${chalk.cyan(source)}...`);

  let available: string[];
  try {
    available = await discoverSkillsInRepo(source);
  } catch (err) {
    log.error(`Failed to discover skills: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  if (available.length === 0) {
    log.warn(`No skills found in ${source}.`);
    return;
  }

  const choices = available.map((name) => ({
    name,
    value: name,
  }));

  const selected = await checkbox<string>({
    message: `Found ${available.length} skill(s). Select to install:`,
    choices,
    pageSize: 15,
  });

  if (selected.length === 0) {
    log.dim("Nothing selected.");
    return;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Install ${selected.length} skill(s) from ${source}${opts.global ? " (global)" : ""}?`,
      default: true,
    });
    if (!ok) {
      log.dim("Cancelled.");
      return;
    }
  }

  const results = await installSkillBatch(source, selected, {
    global: opts.global,
    projectPath,
  });

  let successCount = 0;
  for (const [name, err] of results) {
    if (err) {
      log.error(`Failed to install ${name}: ${err.message}`);
    } else {
      log.success(`Installed ${name}`);
      successCount++;
    }
  }

  printInstallSummary(results);

  if (successCount > 0) {
    await updateSkillRules(projectPath, opts.global);
    const targetPath = opts.global ? "~/.claude/skills/" : `${projectPath}/.claude/skills/`;
    log.success(`Done! ${successCount} skill(s) installed in ${chalk.bold(targetPath)}`);
    log.success("Updated .claude/rules/skills.md — Claude will use these skills automatically.");
    log.dim("Skills are active in your next Claude Code session.");
  }
}

/**
 * Re-generate rules file based on all currently installed skills.
 */
async function updateSkillRules(projectPath: string, global?: boolean): Promise<void> {
  const skills = await getProjectSkills(projectPath);
  const skillData = skills.map((s) => ({
    name: s.name,
    description: s.description ?? s.name,
  }));
  if (skillData.length > 0) {
    await generateSkillRules(skillData, projectPath, { global });
  }
}
