import { readdir, readFile, rm, cp, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { homedir, tmpdir } from "node:os";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__", ".venv", ".next",
]);
const MAX_SEARCH_DEPTH = 5;

export interface SkillInfo {
  name: string;
  path: string;
  description: string | null;
  scope: "project" | "global";
}

/**
 * Parse SKILL.md frontmatter to extract the description.
 */
function parseSkillDescription(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const descLine = frontmatter
    .split("\n")
    .find((line) => line.startsWith("description:"));

  if (!descLine) return null;

  return descLine
    .replace(/^description:\s*/, "")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

/**
 * Scan a skills directory and return info about each installed skill.
 */
async function scanSkillsDir(
  dir: string,
  scope: "project" | "global",
): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;

    const skillPath = join(dir, entry);
    const skillMdPath = join(skillPath, "SKILL.md");

    let description: string | null = null;
    try {
      const content = await readFile(skillMdPath, "utf-8");
      description = parseSkillDescription(content);
    } catch {
      // No SKILL.md or unreadable — still list the skill
    }

    skills.push({ name: entry, path: skillPath, description, scope });
  }

  return skills;
}

/**
 * Get all installed skills for a project (project-level + global).
 */
export async function getInstalledSkills(
  projectPath: string,
): Promise<SkillInfo[]> {
  const projectSkills = await scanSkillsDir(
    join(projectPath, ".claude", "skills"),
    "project",
  );
  const globalSkills = await scanSkillsDir(
    join(homedir(), ".claude", "skills"),
    "global",
  );

  return [...projectSkills, ...globalSkills];
}

/**
 * Get project-level installed skills only.
 */
export async function getProjectSkills(
  projectPath: string,
): Promise<SkillInfo[]> {
  return scanSkillsDir(join(projectPath, ".claude", "skills"), "project");
}

/**
 * Install multiple skills from a single GitHub repo in one clone operation.
 * Returns a map of skill name → error (null if successful).
 */
export async function installSkillBatch(
  source: string,
  skillNames: string[],
  opts: { global?: boolean; projectPath?: string } = {},
): Promise<Map<string, Error | null>> {
  const results = new Map<string, Error | null>();

  const repoUrl = source.startsWith("/") || source.includes("://")
    ? source
    : `https://github.com/${source}.git`;
  const tmpDir = await mkdtemp(join(tmpdir(), "loadout-install-"));

  try {
    await execAsync("git", ["clone", "--depth", "1", "--quiet", repoUrl, tmpDir]);

    const targetBase = opts.global
      ? join(homedir(), ".claude", "skills")
      : join(opts.projectPath ?? process.cwd(), ".claude", "skills");

    await mkdir(targetBase, { recursive: true });

    for (const skillName of skillNames) {
      try {
        const skillDir = await findSkillDir(tmpDir, skillName);
        if (!skillDir) {
          results.set(skillName, new Error(`Skill "${skillName}" not found in ${source}`));
          continue;
        }
        const targetDir = join(targetBase, skillName);
        await cp(skillDir, targetDir, { recursive: true });
        results.set(skillName, null);
      } catch (err) {
        results.set(skillName, err instanceof Error ? err : new Error(String(err)));
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  return results;
}

/**
 * Install a specific skill by name from a GitHub repo.
 * Delegates to installSkillBatch with a single skill.
 */
export async function installSkillDirect(
  source: string,
  skillName: string,
  opts: { global?: boolean; projectPath?: string } = {},
): Promise<void> {
  const results = await installSkillBatch(source, [skillName], opts);
  const err = results.get(skillName);
  if (err) throw err;
}

/**
 * Discover all skill names available in a GitHub repo.
 */
export async function discoverSkillsInRepo(
  source: string,
): Promise<string[]> {
  const repoUrl = source.startsWith("/") || source.includes("://")
    ? source
    : `https://github.com/${source}.git`;
  const tmpDir = await mkdtemp(join(tmpdir(), "loadout-install-"));

  try {
    await execAsync("git", ["clone", "--depth", "1", "--quiet", repoUrl, tmpDir]);
    const allSkills = await collectAllSkillDirs(tmpDir);
    return allSkills.map((s) => s.name);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Generate a .claude/rules/skills.md file that instructs Claude
 * to proactively use the installed skills.
 */
export async function generateSkillRules(
  installedSkills: Array<{ name: string; description: string }>,
  projectPath: string,
  opts: { global?: boolean } = {},
): Promise<void> {
  const rulesDir = opts.global
    ? join(homedir(), ".claude", "rules")
    : join(projectPath, ".claude", "rules");

  await mkdir(rulesDir, { recursive: true });

  const rows = installedSkills
    .map((s) => `| ${s.name} | ${s.description} |`)
    .join("\n");

  const content = `# Installed Skills

Use these skills automatically when working on this project.

| Skill | When to Use |
|-------|-------------|
${rows}

Invoke each skill via the Skill tool when the task matches its description.
Do not wait for the user to request it — apply skill knowledge proactively.
`;

  await writeFile(join(rulesDir, "skills.md"), content, "utf-8");
}

/**
 * Find a skill directory by name within a cloned repo.
 * Recursively searches up to MAX_SEARCH_DEPTH levels, skipping SKIP_DIRS.
 * Falls back to fuzzy name matching when exact match is not found.
 */
async function findSkillDir(repoDir: string, skillName: string): Promise<string | null> {
  // Recursive exact-match search
  async function findExact(dir: string, depth: number): Promise<string | null> {
    if (depth > MAX_SEARCH_DEPTH) return null;

    const candidate = join(dir, skillName);
    if (await isSkillDir(candidate)) return candidate;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const subPath = join(dir, entry.name);
      // Don't recurse into skill directories — they are leaves
      if (await isSkillDir(subPath)) continue;
      const found = await findExact(subPath, depth + 1);
      if (found) return found;
    }

    return null;
  }

  const exact = await findExact(repoDir, 0);
  if (exact) return exact;

  // Fuzzy fallback: scan all skill dirs and find closest match
  const allSkills = await collectAllSkillDirs(repoDir);
  let bestMatch: { name: string; path: string } | null = null;
  let bestScore = 0;

  for (const candidate of allSkills) {
    const score = nameSimilarity(skillName, candidate.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  const FUZZY_THRESHOLD = 0.5;
  if (bestMatch && bestScore >= FUZZY_THRESHOLD) {
    return bestMatch.path;
  }

  return null;
}

async function isSkillDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    if (!s.isDirectory()) return false;
    await stat(join(path, "SKILL.md"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect all skill directories (with SKILL.md) from a repo,
 * recursively searching up to MAX_SEARCH_DEPTH levels.
 */
async function collectAllSkillDirs(
  repoDir: string,
): Promise<Array<{ name: string; path: string }>> {
  const results: Array<{ name: string; path: string }> = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SEARCH_DEPTH) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);

      if (await isSkillDir(fullPath)) {
        results.push({ name: entry.name, path: fullPath });
        // Skill directories are leaves — don't recurse into them
      } else {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(repoDir, 0);
  return results;
}

/**
 * Tokenize a skill name into lowercase words, splitting on hyphens,
 * underscores, and camelCase boundaries.
 */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[-_]+/)
    .filter(Boolean);
}

/**
 * Compute name similarity between two skill names.
 * Returns a score from 0 to 1. Uses substring matching and token overlap.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();

  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;

  // Token overlap
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const setA = new Set(tokensA);
  const shared = tokensB.filter((t) => setA.has(t)).length;
  const maxLen = Math.max(tokensA.length, tokensB.length);
  const tokenScore = maxLen === 0 ? 0 : shared / maxLen;

  // Substring match — use whichever is higher
  const substringScore = (na.includes(nb) || nb.includes(na)) ? 0.8 : 0;

  return Math.max(tokenScore, substringScore);
}

function execAsync(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 30_000 }, (err, _stdout, stderr) => {
      if (err) {
        const detail = stderr ? `: ${stderr.trim()}` : "";
        reject(new Error(`${cmd} failed${detail}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Remove a skill by deleting its directory from .claude/skills/.
 */
export async function removeSkill(
  skillName: string,
  opts: { projectPath?: string; global?: boolean } = {},
): Promise<void> {
  const base = opts.global
    ? join(homedir(), ".claude", "skills")
    : join(opts.projectPath ?? process.cwd(), ".claude", "skills");

  const skillDir = join(base, skillName);
  await rm(skillDir, { recursive: true, force: true });
}
