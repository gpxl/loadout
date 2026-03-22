import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { KNOWN_MANIFESTS } from "./detect.js";

export interface ScanMetadata {
  lastScanAt: string;
  manifestChecksums: Record<string, string>;
}

export async function writeScanMetadata(projectPath: string): Promise<void> {
  const checksums: Record<string, string> = {};

  for (const manifest of KNOWN_MANIFESTS) {
    try {
      const content = await readFile(join(projectPath, manifest));
      const hash = createHash("sha256").update(content).digest("hex");
      checksums[manifest] = `sha256:${hash}`;
    } catch {
      // File doesn't exist — skip it
    }
  }

  const metadata: ScanMetadata = {
    lastScanAt: new Date().toISOString(),
    manifestChecksums: checksums,
  };

  const claudeDir = join(projectPath, ".claude");
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    join(claudeDir, ".loadout-scan.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
}

export async function readScanMetadata(projectPath: string): Promise<ScanMetadata | null> {
  try {
    const raw = await readFile(join(projectPath, ".claude", ".loadout-scan.json"), "utf-8");
    return JSON.parse(raw) as ScanMetadata;
  } catch {
    return null;
  }
}

export async function computeStaleness(projectPath: string, metadata: ScanMetadata): Promise<boolean> {
  for (const [manifest, storedChecksum] of Object.entries(metadata.manifestChecksums)) {
    try {
      const content = await readFile(join(projectPath, manifest));
      const currentChecksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (currentChecksum !== storedChecksum) {
        return true; // stale — manifest changed
      }
    } catch {
      return true; // stale — manifest was deleted
    }
  }

  // Check for new manifests that weren't present during the scan
  for (const manifest of KNOWN_MANIFESTS) {
    if (!(manifest in metadata.manifestChecksums)) {
      try {
        await readFile(join(projectPath, manifest));
        return true; // stale — new manifest appeared
      } catch {
        // Still doesn't exist — fine
      }
    }
  }

  return false;
}
