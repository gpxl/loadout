import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { log } from "../utils/log.js";

export function resolveRepoRoot(): string | null {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    // dist/index.js → repo root (one level up from dist/)
    const repoRoot = dirname(dirname(thisFile));
    const installScript = join(repoRoot, "install.sh");
    if (existsSync(installScript)) {
      return repoRoot;
    }
  } catch {
    // import.meta.url not available or other error
  }
  return null;
}

export async function updateCommand(): Promise<void> {
  const repoRoot = resolveRepoRoot();

  if (!repoRoot) {
    log.error("This installation method doesn't support self-update.");
    log.dim("Re-install with: curl -fsSL https://raw.githubusercontent.com/gpxl/loadout/main/install.sh | bash");
    process.exitCode = 1;
    return;
  }

  log.info(`Updating from ${repoRoot}...`);

  try {
    execSync("bash install.sh", {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } catch {
    log.error("Update failed.");
    process.exitCode = 1;
  }
}
