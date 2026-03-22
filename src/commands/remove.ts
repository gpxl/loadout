import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { removeSkill, getInstalledSkills } from "../core/skills.js";
import { log } from "../utils/log.js";

export async function removeCommand(
  skillName: string,
  opts: { global?: boolean; yes?: boolean } = {},
): Promise<void> {
  const projectPath = process.cwd();
  const skills = await getInstalledSkills(projectPath);

  const scope = opts.global ? "global" : "project";
  const found = skills.find((s) => s.name === skillName && s.scope === scope);

  if (!found) {
    log.error(
      `Skill "${skillName}" not found in ${scope} scope.`,
    );
    const other = skills.find((s) => s.name === skillName);
    if (other) {
      log.info(
        `Found in ${other.scope} scope — use ${other.scope === "global" ? "--global" : "without --global"} flag.`,
      );
    }
    process.exitCode = 1;
    return;
  }

  if (!opts.yes) {
    const ok = await confirm({
      message: `Remove ${chalk.cyan(skillName)} from ${scope}?`,
      default: false,
    });
    if (!ok) {
      log.dim("Cancelled.");
      return;
    }
  }

  try {
    await removeSkill(skillName, { projectPath, global: opts.global });
    log.success(`Removed ${skillName}`);
  } catch (err) {
    log.error(
      `Failed to remove: ${err instanceof Error ? err.message : err}`,
    );
    process.exitCode = 1;
  }
}
