import { readdir, readFile, access, lstat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ProjectSignals, DetectedProject, ProjectContext, ExploratoryContext } from "../types.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAllDeps(pkg: Record<string, unknown>): Record<string, string> {
  return {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
}

/**
 * Detect rich project signals for recommendation matching.
 */
export async function detectSignals(
  projectPath: string,
): Promise<ProjectSignals> {
  const pkgPath = join(projectPath, "package.json");
  const pkg = await readJson(pkgPath);
  const deps = pkg ? getAllDeps(pkg) : {};

  const hasTypescript = await fileExists(join(projectPath, "tsconfig.json"));
  const hasTailwind =
    "tailwindcss" in deps ||
    (await fileExists(join(projectPath, "tailwind.config.js"))) ||
    (await fileExists(join(projectPath, "tailwind.config.ts")));
  const hasPrisma = "prisma" in deps || (await fileExists(join(projectPath, "prisma/schema.prisma")));
  const hasDrizzle = "drizzle-orm" in deps;
  const hasSupabase = "@supabase/supabase-js" in deps || "@supabase/ssr" in deps;
  const hasTurborepo =
    (await fileExists(join(projectPath, "turbo.json"))) ||
    "turbo" in deps;
  const hasMonorepo =
    hasTurborepo ||
    (await fileExists(join(projectPath, "nx.json"))) ||
    (await fileExists(join(projectPath, "pnpm-workspace.yaml"))) ||
    (await fileExists(join(projectPath, "lerna.json")));
  const hasDocker =
    (await fileExists(join(projectPath, "Dockerfile"))) ||
    (await fileExists(join(projectPath, "docker-compose.yml"))) ||
    (await fileExists(join(projectPath, "docker-compose.yaml")));
  const hasVite = "vite" in deps || (await fileExists(join(projectPath, "vite.config.ts")));

  const frameworks: string[] = [];
  if ("@tanstack/react-query" in deps) frameworks.push("tanstack-query");
  if ("react-hook-form" in deps) frameworks.push("react-hook-form");
  if ("framer-motion" in deps || "motion" in deps) frameworks.push("framer-motion");
  if ("@trpc/server" in deps) frameworks.push("trpc");
  if ("express" in deps) frameworks.push("express");
  if ("fastify" in deps) frameworks.push("fastify");
  if ("hono" in deps) frameworks.push("hono");

  let testFramework: string | null = null;
  if ("vitest" in deps) testFramework = "vitest";
  else if ("jest" in deps) testFramework = "jest";
  else if ("pytest" in deps) testFramework = "pytest";

  let styling: string | null = null;
  if (hasTailwind) styling = "tailwind";
  else if ("styled-components" in deps) styling = "styled-components";
  else if ("@emotion/react" in deps) styling = "emotion";

  return {
    hasTypescript,
    hasTailwind,
    hasPrisma,
    hasDrizzle,
    hasSupabase,
    hasTurborepo,
    hasMonorepo,
    hasDocker,
    hasVite,
    frameworks,
    testFramework,
    styling,
  };
}

/**
 * List skill names from a single .claude/skills/ directory.
 */
async function scanSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => !e.startsWith("."));
  } catch {
    return [];
  }
}

/**
 * List installed skill names from both project-level and global .claude/skills/.
 * Deduplicates names so a skill installed in both scopes is only counted once.
 */
async function getInstalledSkillNames(projectPath: string): Promise<string[]> {
  const [projectSkills, globalSkills] = await Promise.all([
    scanSkillNames(join(projectPath, ".claude", "skills")),
    scanSkillNames(join(homedir(), ".claude", "skills")),
  ]);
  return [...new Set([...projectSkills, ...globalSkills])];
}

/**
 * Detect a single project's metadata including signals and installed skills.
 */
export async function detectProject(
  projectPath: string,
): Promise<DetectedProject> {
  const name = projectPath.split("/").pop() ?? projectPath;
  const signals = await detectSignals(projectPath);
  const projectSkills = await scanSkillNames(join(projectPath, ".claude", "skills"));
  const hasClaudeSkills = projectSkills.length > 0;
  const installedSkills = await getInstalledSkillNames(projectPath);

  return { path: projectPath, name, signals, hasClaudeSkills, installedSkills };
}

/**
 * Build full project context for AI analysis.
 * Reads package.json content and lists config file names.
 */
export async function buildProjectContext(
  project: DetectedProject,
): Promise<ProjectContext> {
  const pkgPath = join(project.path, "package.json");
  const packageJson = await readJson(pkgPath);

  const configPatterns = [
    "next.config.js", "next.config.mjs", "next.config.ts",
    "tsconfig.json", "tailwind.config.js", "tailwind.config.ts",
    "prisma/schema.prisma", "drizzle.config.ts",
    "turbo.json", "pnpm-workspace.yaml", "nx.json", "lerna.json",
    "vite.config.ts", "vite.config.js",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".env", ".env.local",
    "vitest.config.ts", "jest.config.ts", "jest.config.js",
    "eslint.config.js", ".eslintrc.js", ".eslintrc.json",
    // Non-JS manifests
    "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg", "Pipfile",
    "Cargo.toml", "go.mod", "go.sum",
    "Makefile", "CMakeLists.txt",
    "Gemfile", "composer.json",
    "build.gradle", "pom.xml", "build.sbt",
    "mix.exs", "Package.swift", "build.zig", "deno.json",
  ];

  const configFiles: string[] = [];
  for (const pattern of configPatterns) {
    if (await fileExists(join(project.path, pattern))) {
      configFiles.push(pattern);
    }
  }

  const exploratoryContext = await gatherExploratoryContext(project.path);

  return {
    path: project.path,
    name: project.name,
    signals: project.signals,
    packageJson,
    configFiles,
    installedSkills: project.installedSkills,
    exploratoryContext,
    inferredType: "",
  };
}

/** Known manifest files to check for in exploratory context */
const KNOWN_MANIFESTS = [
  "package.json", "requirements.txt", "pyproject.toml", "setup.py", "setup.cfg",
  "Pipfile", "Cargo.toml", "go.mod", "Makefile", "CMakeLists.txt",
  "Gemfile", "composer.json", "build.gradle", "pom.xml", "build.sbt",
  "mix.exs", "Package.swift", "build.zig", "deno.json", "deno.jsonc",
];

/** Extension-to-language mapping for source file sampling */
const SOURCE_EXTENSIONS = new Set([
  ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php", ".ex", ".exs",
  ".swift", ".zig", ".ts", ".js", ".tsx", ".jsx", ".c", ".cpp", ".cs",
]);

/**
 * Gather rich exploratory context for under-detected projects.
 * Reads top-level files, README, CLAUDE.md, file extensions, manifests, and imports.
 */
export async function gatherExploratoryContext(
  projectPath: string,
): Promise<ExploratoryContext> {
  // Top-level files (filter hidden + node_modules, cap at 50)
  let topLevelFiles: string[] = [];
  try {
    const entries = await readdir(projectPath);
    topLevelFiles = entries
      .filter((e) => !e.startsWith(".") && e !== "node_modules")
      .slice(0, 50);
  } catch {
    // empty dir or permission error
  }

  // README snippet (first 30 lines)
  const readmeSnippet = await readSnippet(projectPath, ["README.md", "README.rst", "README.txt", "README"], 30);

  // CLAUDE.md snippet (first 50 lines)
  const claudeMdSnippet = await readSnippet(
    projectPath,
    ["CLAUDE.md", join(".claude", "CLAUDE.md")],
    50,
  );

  // Manifest files
  const manifestFiles: string[] = [];
  for (const manifest of KNOWN_MANIFESTS) {
    if (await fileExists(join(projectPath, manifest))) {
      manifestFiles.push(manifest);
    }
  }

  // File extension distribution (bounded recursive scan ~200 files, 3 levels deep)
  const fileExtensions: Record<string, number> = {};
  await scanExtensions(projectPath, fileExtensions, 3, 200);

  // Import patterns from top source files (max 5 files, 20 lines each)
  const importPatterns = await extractImportPatterns(projectPath, fileExtensions);

  return {
    topLevelFiles,
    readmeSnippet,
    claudeMdSnippet,
    fileExtensions,
    manifestFiles,
    importPatterns,
  };
}

async function readSnippet(
  projectPath: string,
  candidates: string[],
  maxLines: number,
): Promise<string> {
  for (const name of candidates) {
    try {
      const content = await readFile(join(projectPath, name), "utf-8");
      return content.split("\n").slice(0, maxLines).join("\n");
    } catch {
      continue;
    }
  }
  return "";
}

async function scanExtensions(
  dir: string,
  counts: Record<string, number>,
  maxDepth: number,
  maxFiles: number,
  currentCount = { value: 0 },
): Promise<void> {
  if (maxDepth < 0 || currentCount.value >= maxFiles) return;
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (currentCount.value >= maxFiles) break;
      if (entry.startsWith(".") || entry === "node_modules" || entry === "__pycache__" || entry === "target" || entry === "dist" || entry === "build") continue;
      const fullPath = join(dir, entry);
      try {
        const stat = await lstat(fullPath);
        if (stat.isDirectory()) {
          await scanExtensions(fullPath, counts, maxDepth - 1, maxFiles, currentCount);
        } else if (stat.isFile()) {
          const dotIdx = entry.lastIndexOf(".");
          if (dotIdx > 0) {
            const ext = entry.slice(dotIdx).toLowerCase();
            counts[ext] = (counts[ext] ?? 0) + 1;
          }
          currentCount.value++;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // permission error
  }
}

async function extractImportPatterns(
  projectPath: string,
  fileExtensions: Record<string, number>,
): Promise<string[]> {
  // Find dominant source extension
  const sourceExts = Object.entries(fileExtensions)
    .filter(([ext]) => SOURCE_EXTENSIONS.has(ext))
    .sort((a, b) => b[1] - a[1]);

  if (sourceExts.length === 0) return [];

  const dominantExt = sourceExts[0][0];
  const importLines: string[] = [];

  // Find up to 5 source files with the dominant extension (shallow scan)
  const sourceFiles = await findSourceFiles(projectPath, dominantExt, 5, 2);

  for (const filePath of sourceFiles) {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").slice(0, 20);
      for (const line of lines) {
        const trimmed = line.trim();
        if (isImportLine(trimmed)) {
          importLines.push(trimmed);
        }
      }
    } catch {
      continue;
    }
  }

  return importLines;
}

function isImportLine(line: string): boolean {
  return (
    line.startsWith("import ") ||
    line.startsWith("from ") ||
    line.startsWith("require(") ||
    line.startsWith("const ") && line.includes("require(") ||
    line.startsWith("use ") ||
    line.startsWith("#include") ||
    line.startsWith("using ")
  );
}

async function findSourceFiles(
  dir: string,
  ext: string,
  max: number,
  maxDepth: number,
  found: string[] = [],
): Promise<string[]> {
  if (maxDepth < 0 || found.length >= max) return found;
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      if (found.length >= max) break;
      if (entry.startsWith(".") || entry === "node_modules" || entry === "__pycache__" || entry === "target" || entry === "dist" || entry === "build") continue;
      const fullPath = join(dir, entry);
      try {
        const stat = await lstat(fullPath);
        if (stat.isDirectory()) {
          await findSourceFiles(fullPath, ext, max, maxDepth - 1, found);
        } else if (stat.isFile() && entry.endsWith(ext)) {
          found.push(fullPath);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // permission error
  }
  return found;
}

/**
 * Scan a parent directory for project subdirectories.
 */
export async function scanProjects(
  parentDir: string,
): Promise<DetectedProject[]> {
  const entries = await readdir(parentDir);
  const projects: DetectedProject[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;

    const fullPath = join(parentDir, entry);
    try {
      const stat = await lstat(fullPath);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }

    projects.push(await detectProject(fullPath));
  }

  return projects;
}
