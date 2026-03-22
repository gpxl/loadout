import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectSignals,
  detectProject,
  scanProjects,
  gatherExploratoryContext,
} from "../../src/core/detect.js";

describe("detectSignals", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-signals-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("detects TypeScript", async () => {
    await writeFile(join(tmpDir, "tsconfig.json"), "{}");
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { commander: "^1.0.0" } }),
    );
    const signals = await detectSignals(tmpDir);
    expect(signals.hasTypescript).toBe(true);
  });

  it("detects Tailwind from deps", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { tailwindcss: "^3.0.0", next: "^14" } }),
    );
    const signals = await detectSignals(tmpDir);
    expect(signals.hasTailwind).toBe(true);
  });

  it("detects Tailwind from config file", async () => {
    await writeFile(join(tmpDir, "tailwind.config.ts"), "export default {}");
    const signals = await detectSignals(tmpDir);
    expect(signals.hasTailwind).toBe(true);
  });

  it("detects Prisma from deps", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { prisma: "^5.0.0" } }),
    );
    const signals = await detectSignals(tmpDir);
    expect(signals.hasPrisma).toBe(true);
  });

  it("detects Prisma from schema file", async () => {
    await mkdir(join(tmpDir, "prisma"), { recursive: true });
    await writeFile(join(tmpDir, "prisma", "schema.prisma"), "generator {}");
    const signals = await detectSignals(tmpDir);
    expect(signals.hasPrisma).toBe(true);
  });

  it("detects Supabase from deps", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ dependencies: { "@supabase/supabase-js": "^2.0.0" } }),
    );
    const signals = await detectSignals(tmpDir);
    expect(signals.hasSupabase).toBe(true);
  });

  it("detects turborepo from turbo.json", async () => {
    await writeFile(join(tmpDir, "turbo.json"), "{}");
    const signals = await detectSignals(tmpDir);
    expect(signals.hasTurborepo).toBe(true);
    expect(signals.hasMonorepo).toBe(true);
  });

  it("detects monorepo from pnpm-workspace.yaml", async () => {
    await writeFile(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - apps/*");
    const signals = await detectSignals(tmpDir);
    expect(signals.hasMonorepo).toBe(true);
  });

  it("detects Docker", async () => {
    await writeFile(join(tmpDir, "Dockerfile"), "FROM node:20");
    const signals = await detectSignals(tmpDir);
    expect(signals.hasDocker).toBe(true);
  });

  it("detects frameworks", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: {
          next: "^14",
          "@tanstack/react-query": "^5",
          "react-hook-form": "^7",
          "framer-motion": "^11",
        },
      }),
    );
    const signals = await detectSignals(tmpDir);
    expect(signals.frameworks).toContain("tanstack-query");
    expect(signals.frameworks).toContain("react-hook-form");
    expect(signals.frameworks).toContain("framer-motion");
  });

  it("detects test framework", async () => {
    await writeFile(
      join(tmpDir, "package.json"),
      JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }),
    );
    const signals = await detectSignals(tmpDir);
    expect(signals.testFramework).toBe("vitest");
  });
});

describe("detectProject", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-detect-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns project with signals and installed skills", async () => {
    await writeFile(join(tmpDir, "Cargo.toml"), "[package]");
    await mkdir(join(tmpDir, ".claude", "skills", "rust-best-practices"), {
      recursive: true,
    });
    await writeFile(
      join(tmpDir, ".claude", "skills", "rust-best-practices", "SKILL.md"),
      "# Rust",
    );

    const result = await detectProject(tmpDir);
    expect(result.hasClaudeSkills).toBe(true);
    expect(result.installedSkills).toContain("rust-best-practices");
    expect(result.path).toBe(tmpDir);
  });

  it("handles project with no project-level skills", async () => {
    const result = await detectProject(tmpDir);
    expect(result.hasClaudeSkills).toBe(false);
    // installedSkills may include global skills from ~/.claude/skills/
    // but hasClaudeSkills should be false since no project-level skills exist
  });
});

describe("scanProjects", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-scan-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("scans immediate subdirectories", async () => {
    await mkdir(join(tmpDir, "web-app"));
    await writeFile(join(tmpDir, "web-app", "next.config.js"), "{}");

    await mkdir(join(tmpDir, "cli-tool"));
    await writeFile(join(tmpDir, "cli-tool", "Cargo.toml"), "[package]");

    const results = await scanProjects(tmpDir);
    expect(results).toHaveLength(2);

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["cli-tool", "web-app"]);
  });

  it("skips hidden directories", async () => {
    await mkdir(join(tmpDir, ".hidden"));
    await writeFile(join(tmpDir, ".hidden", "Cargo.toml"), "[package]");
    const results = await scanProjects(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips node_modules", async () => {
    await mkdir(join(tmpDir, "node_modules"));
    const results = await scanProjects(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("skips regular files", async () => {
    await writeFile(join(tmpDir, "README.md"), "# hello");
    const results = await scanProjects(tmpDir);
    expect(results).toHaveLength(0);
  });
});

describe("gatherExploratoryContext", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "loadout-explore-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns top-level files", async () => {
    await writeFile(join(tmpDir, "main.py"), "print('hi')");
    await writeFile(join(tmpDir, "README.md"), "# Hello");
    await writeFile(join(tmpDir, "requirements.txt"), "click");

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.topLevelFiles).toContain("main.py");
    expect(ctx.topLevelFiles).toContain("README.md");
    expect(ctx.topLevelFiles).toContain("requirements.txt");
  });

  it("filters hidden files from top-level", async () => {
    await writeFile(join(tmpDir, ".hidden"), "secret");
    await writeFile(join(tmpDir, "visible.py"), "x = 1");

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.topLevelFiles).toContain("visible.py");
    expect(ctx.topLevelFiles).not.toContain(".hidden");
  });

  it("returns README snippet", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join("\n");
    await writeFile(join(tmpDir, "README.md"), lines);

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.readmeSnippet).toContain("Line 1");
    expect(ctx.readmeSnippet).toContain("Line 30");
    expect(ctx.readmeSnippet).not.toContain("Line 31");
  });

  it("reads CLAUDE.md snippet", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    const content = "# Stack\nPython + Click + Supabase\n";
    await writeFile(join(tmpDir, "CLAUDE.md"), content);

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.claudeMdSnippet).toContain("Python + Click + Supabase");
  });

  it("reads CLAUDE.md from .claude/ subdirectory", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "CLAUDE.md"), "# My Project");

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.claudeMdSnippet).toContain("My Project");
  });

  it("returns file extension distribution", async () => {
    await writeFile(join(tmpDir, "main.py"), "import os");
    await writeFile(join(tmpDir, "utils.py"), "def foo(): pass");
    await writeFile(join(tmpDir, "README.md"), "# Docs");

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.fileExtensions[".py"]).toBe(2);
    expect(ctx.fileExtensions[".md"]).toBe(1);
  });

  it("returns manifest files", async () => {
    await writeFile(join(tmpDir, "requirements.txt"), "click");
    await writeFile(join(tmpDir, "Makefile"), "all:");

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.manifestFiles).toContain("requirements.txt");
    expect(ctx.manifestFiles).toContain("Makefile");
  });

  it("extracts import patterns from source files", async () => {
    await writeFile(join(tmpDir, "main.py"), "import click\nfrom supabase import create_client\n\ndef main():\n    pass");
    await writeFile(join(tmpDir, "utils.py"), "import os\nimport json");

    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.importPatterns).toContain("import click");
    expect(ctx.importPatterns).toContain("from supabase import create_client");
  });

  it("handles empty directory", async () => {
    const ctx = await gatherExploratoryContext(tmpDir);
    expect(ctx.topLevelFiles).toEqual([]);
    expect(ctx.readmeSnippet).toBe("");
    expect(ctx.claudeMdSnippet).toBe("");
    expect(ctx.fileExtensions).toEqual({});
    expect(ctx.manifestFiles).toEqual([]);
    expect(ctx.importPatterns).toEqual([]);
  });
});
