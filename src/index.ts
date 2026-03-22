import { Command } from "commander";
import { scanCommand } from "./commands/scan.js";
import { searchCommand } from "./commands/search.js";
import { installCommand } from "./commands/install.js";
import { statusCommand } from "./commands/status.js";
import { removeCommand } from "./commands/remove.js";
import { updateCommand } from "./commands/update.js";
import { log } from "./utils/log.js";
import { VERSION } from "./version.js";

process.on("uncaughtException", (err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  log.error(err instanceof Error ? (err as Error).message : String(err));
  process.exit(1);
});

const program = new Command();

program
  .name("loadout")
  .description("Discover and install skills from skills.sh for your projects")
  .version(VERSION);

// scan
program
  .command("scan [path]")
  .description("Analyze project and recommend skills from skills.sh")
  .option("-g, --global", "Install skills globally to ~/.claude/skills/")
  .option("-y, --yes", "Auto-select all recommended skills (skip interactive prompt)")
  .option("--json", "Output recommendations as JSON (no prompts, no install)")
  .action((path: string | undefined, opts: { global?: boolean; yes?: boolean; json?: boolean }) =>
    scanCommand(path, { global: opts.global, yes: opts.yes, json: opts.json }),
  );

// search
program
  .command("search <query>")
  .description("Search the skills.sh registry")
  .option("-l, --limit <n>", "Max results", "20")
  .action((query: string, opts) =>
    searchCommand(query, { limit: Number(opts.limit) }),
  );

// install
program
  .command("install <source>")
  .description("Install skills from a GitHub source (e.g. vercel-labs/agent-skills)")
  .option("-g, --global", "Install globally to ~/.claude/skills/")
  .option("-s, --skill <name>", "Install a specific skill by name")
  .option("-y, --yes", "Skip confirmation")
  .action((source: string, opts) =>
    installCommand(source, { global: opts.global, skill: opts.skill, yes: opts.yes }),
  );

// status
program
  .command("status [path]")
  .description("Show installed skills for a project")
  .option("--json", "Output as JSON")
  .action((path: string | undefined, opts: { json?: boolean }) =>
    statusCommand(path, { json: opts.json }),
  );

// remove
program
  .command("remove <skill>")
  .description("Remove an installed skill")
  .option("-g, --global", "Remove from global scope")
  .option("-y, --yes", "Skip confirmation")
  .action((skill: string, opts) =>
    removeCommand(skill, { global: opts.global, yes: opts.yes }),
  );

// update
program
  .command("update")
  .description("Update loadout to the latest version")
  .action(() => updateCommand());

program.parse();
