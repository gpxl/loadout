import chalk from "chalk";

let quiet = false;

export const log = {
  info: (msg: string) => { if (!quiet) console.log(chalk.blue("info"), msg); },
  success: (msg: string) => { if (!quiet) console.log(chalk.green("ok"), msg); },
  warn: (msg: string) => { if (!quiet) console.error(chalk.yellow("warn"), msg); },
  error: (msg: string) => { if (!quiet) console.error(chalk.red("error"), msg); },
  dim: (msg: string) => { if (!quiet) console.log(chalk.dim(msg)); },

  /** Suppress all log output. Used in --json mode to keep stdout clean. */
  setQuiet: (value: boolean) => { quiet = value; },
};

/**
 * Print a summary after batch skill installation.
 * Shows counts and lists failed skills with next-step guidance.
 */
export function printInstallSummary(
  results: Map<string, Error | null>,
): void {
  const succeeded: string[] = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const [name, err] of results) {
    if (err) {
      failed.push({ name, reason: err.message });
    } else {
      succeeded.push(name);
    }
  }

  if (results.size <= 1) return; // No summary needed for single installs

  const parts: string[] = [];
  if (succeeded.length > 0) parts.push(chalk.green(`${succeeded.length} installed`));
  if (failed.length > 0) parts.push(chalk.red(`${failed.length} failed`));
  console.log();
  log.info(`Summary: ${parts.join(", ")}`);

  if (failed.length > 0) {
    for (const { name, reason } of failed) {
      log.dim(`  ${chalk.red("✗")} ${name}: ${reason}`);
    }
    log.dim("Retry failed skills individually: loadout install <source> --skill <name>");
  }
}
