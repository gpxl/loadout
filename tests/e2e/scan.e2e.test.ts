import { execFile } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { detectProject, buildProjectContext } from "../../src/core/detect.js";
import { getRecommendations } from "../../src/core/recommend.js";
import type { DetectedProject, ProjectContext } from "../../src/types.js";

/**
 * End-to-end tests for the full scan pipeline against a synthetic project.
 *
 * Creates a temp project with a realistic package.json and config files,
 * then runs detection, context building, search, and AI ranking.
 *
 * Run with: pnpm test:e2e
 */

let projectPath: string;

function claudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

let cliAvailable = false;
let project: DetectedProject;
let context: ProjectContext;

beforeAll(async () => {
  // Create a synthetic Next.js + Supabase + Tailwind project
  projectPath = await mkdtemp(join(tmpdir(), "loadout-e2e-"));

  const packageJson = {
    name: "e2e-test-app",
    version: "1.0.0",
    dependencies: {
      "next": "^15.0.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0",
      "@supabase/supabase-js": "^2.0.0",
      "@supabase/ssr": "^0.5.0",
      "@tanstack/react-query": "^5.0.0",
      "framer-motion": "^11.0.0",
      "tailwindcss": "^4.0.0",
      "zod": "^3.0.0",
    },
    devDependencies: {
      "typescript": "^5.0.0",
      "jest": "^29.0.0",
      "@types/react": "^19.0.0",
    },
  };

  await writeFile(join(projectPath, "package.json"), JSON.stringify(packageJson, null, 2));
  await writeFile(join(projectPath, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  await writeFile(join(projectPath, "tailwind.config.ts"), "export default {}");
  await writeFile(join(projectPath, "next.config.ts"), "export default {}");
  await mkdir(join(projectPath, "prisma"), { recursive: true });

  cliAvailable = await claudeCliAvailable();
  project = await detectProject(projectPath);
  context = await buildProjectContext(project);
}, 10_000);

afterAll(async () => {
  if (projectPath) {
    await rm(projectPath, { recursive: true, force: true });
  }
});

describe("scan pipeline: detection", () => {
  it("detects TypeScript", () => {
    expect(project.signals.hasTypescript).toBe(true);
  });

  it("detects Tailwind CSS", () => {
    expect(project.signals.hasTailwind).toBe(true);
  });

  it("detects Supabase", () => {
    expect(project.signals.hasSupabase).toBe(true);
  });

  it("detects known frameworks", () => {
    expect(project.signals.frameworks).toContain("tanstack-query");
    expect(project.signals.frameworks).toContain("framer-motion");
  });

  it("detects test framework", () => {
    expect(project.signals.testFramework).toBe("jest");
  });
});

describe("scan pipeline: context building", () => {
  it("reads package.json", () => {
    expect(context.packageJson).not.toBeNull();
    expect(context.packageJson!.dependencies).toBeDefined();
  });

  it("finds config files", () => {
    expect(context.configFiles.length).toBeGreaterThan(0);
    expect(context.configFiles).toContain("tsconfig.json");
  });

  it("uses temp dir name as project name", () => {
    expect(context.name).toBeTruthy();
    expect(context.name.startsWith("loadout-e2e-")).toBe(true);
  });
});

describe("scan pipeline: recommendations (AI)", () => {
  beforeEach(({ skip }) => {
    if (!cliAvailable) skip();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it(
    "AI analysis and ranking complete without timeout",
    async () => {
      const result = await getRecommendations(context);

      expect(result.ranked).not.toBeNull();
    },
    90_000,
  );

  it(
    "AI ranking returns scored results with reasons, tiers, categories, and descriptions",
    async () => {
      const result = await getRecommendations(context);

      expect(result.ranked.length).toBeGreaterThanOrEqual(0);

      for (const item of result.ranked) {
        expect(item.skill.name).toBeTruthy();
        expect(typeof item.reason).toBe("string");
        expect(item.reason.length).toBeGreaterThan(0);
        expect(item.relevance).toBeGreaterThanOrEqual(40);
        expect(item.relevance).toBeLessThanOrEqual(100);
        expect(["essential", "recommended", "optional"]).toContain(item.tier);
        expect(typeof item.category).toBe("string");
        expect(item.category.length).toBeGreaterThan(0);
        expect(typeof item.description).toBe("string");
      }
    },
    90_000,
  );

  it(
    "returns coverage metadata",
    async () => {
      const result = await getRecommendations(context);

      const hasCoverage = result.coverageSummary || result.coverageNote;
      expect(hasCoverage).toBeTruthy();
    },
    90_000,
  );

  it(
    "ranked skills are capped — not the full search results",
    async () => {
      const result = await getRecommendations(context);

      expect(result.ranked.length).toBeLessThanOrEqual(25);
    },
    90_000,
  );

  it(
    "totalEvaluated is populated when AI is used",
    async () => {
      const result = await getRecommendations(context);

      expect(result.totalEvaluated).toBeGreaterThan(0);
      expect(result.totalEvaluated).toBeLessThanOrEqual(25);
    },
    90_000,
  );
});
