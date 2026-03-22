import { resolve } from "node:path";
import chalk from "chalk";
import { getInstalledSkills } from "../core/skills.js";
import { detectProject } from "../core/detect.js";
import { readScanMetadata, computeStaleness } from "../core/scan-state.js";
import { log } from "../utils/log.js";

export async function statusCommand(path?: string, options: { json?: boolean } = {}): Promise<void> {
  const projectPath = resolve(path ?? process.cwd());
  const project = await detectProject(projectPath);
  const skills = await getInstalledSkills(projectPath);

  // Read scan metadata for staleness
  const scanMeta = await readScanMetadata(projectPath);
  const stale = scanMeta ? await computeStaleness(projectPath, scanMeta) : null;

  if (options.json) {
    const projectSkills = skills.filter((s) => s.scope === "project");
    const globalSkills = skills.filter((s) => s.scope === "global");

    console.log(JSON.stringify({
      project: {
        path: projectPath,
        name: project.name,
        signals: project.signals,
      },
      skills: skills.map((s) => ({
        name: s.name,
        scope: s.scope,
        description: s.description,
      })),
      summary: {
        project: projectSkills.length,
        global: globalSkills.length,
      },
      scan: {
        lastScanAt: scanMeta?.lastScanAt ?? null,
        stale: stale,
      },
    }, null, 2));
    return;
  }

  console.log();
  const s = project.signals;
  const detectedSignals = [
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

  console.log(chalk.bold(`Project: ${project.name}`));
  if (detectedSignals.length > 0) {
    console.log(`  Signals: ${chalk.cyan(detectedSignals.join(", "))}`);
  }
  console.log();

  const projectSkills = skills.filter((s) => s.scope === "project");
  const globalSkills = skills.filter((s) => s.scope === "global");

  if (projectSkills.length > 0) {
    console.log(chalk.bold("Project skills:"));
    for (const skill of projectSkills) {
      console.log(`  ${chalk.green("●")} ${skill.name}`);
      if (skill.description) {
        console.log(`    ${chalk.dim(skill.description)}`);
      }
    }
    console.log();
  }

  if (globalSkills.length > 0) {
    console.log(chalk.bold("Global skills:"));
    for (const skill of globalSkills) {
      console.log(`  ${chalk.blue("●")} ${skill.name}`);
      if (skill.description) {
        console.log(`    ${chalk.dim(skill.description)}`);
      }
    }
    console.log();
  }

  if (skills.length === 0) {
    log.dim("No skills installed. Run `loadout scan` to get recommendations.");
  } else {
    log.dim(`${projectSkills.length} project + ${globalSkills.length} global skill(s)`);
  }
}
