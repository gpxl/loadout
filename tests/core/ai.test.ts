import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import type { ProjectContext, AIAnalysis, SkillSearchResult } from "../../src/types.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    path: "/test/project",
    name: "test-project",
    signals: {
      hasTypescript: true,
      hasTailwind: true,
      hasPrisma: false,
      hasDrizzle: false,
      hasSupabase: false,
      hasTurborepo: false,
      hasMonorepo: false,
      hasDocker: false,
      hasVite: false,
      frameworks: [],
      testFramework: "vitest",
      styling: "tailwind",
    },
    packageJson: {
      dependencies: { next: "14.0.0", react: "18.0.0" },
      devDependencies: { typescript: "5.0.0" },
    },
    configFiles: ["next.config.ts", "tsconfig.json", "tailwind.config.ts"],
    installedSkills: [],
    exploratoryContext: {
      topLevelFiles: [],
      readmeSnippet: "",
      claudeMdSnippet: "",
      fileExtensions: {},
      manifestFiles: [],
      importPatterns: [],
    },
    inferredType: "nextjs web app",
    ...overrides,
  };
}

function makeChildStub() {
  return { stdin: { end: vi.fn() } };
}

function mockCliSuccess(result: string): ReturnType<typeof makeChildStub> {
  const child = makeChildStub();
  mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    if (typeof callback === "function") {
      (callback as (err: Error | null, stdout: string, stderr: string) => void)(
        null,
        JSON.stringify({ type: "result", subtype: "success", result }),
        "",
      );
    }
    return child as unknown as ReturnType<typeof execFile>;
  });
  return child;
}

function mockCliFailure(message: string, stderr = ""): ReturnType<typeof makeChildStub> {
  const child = makeChildStub();
  mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    if (typeof callback === "function") {
      (callback as (err: Error | null, stdout: string, stderr: string) => void)(
        new Error(message),
        "",
        stderr,
      );
    }
    return child as unknown as ReturnType<typeof execFile>;
  });
  return child;
}

describe("isAIAvailable", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns true when API key is set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const { isAIAvailable } = await import("../../src/core/ai.js");
    expect(await isAIAvailable()).toBe(true);
  });

  it("returns true when claude CLI is available", async () => {
    const child = makeChildStub();
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null, stdout: string) => void)(null, "1.0.0");
      }
      return child as unknown as ReturnType<typeof execFile>;
    });
    const { isAIAvailable } = await import("../../src/core/ai.js");
    expect(await isAIAvailable()).toBe(true);
  });

  it("returns false when neither is available", async () => {
    mockCliFailure("not found");
    const { isAIAvailable } = await import("../../src/core/ai.js");
    expect(await isAIAvailable()).toBe(false);
  });
});

describe("analyzeProject", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("parses a valid AI analysis response", async () => {
    const aiResponse: AIAnalysis = {
      technologies: ["next.js", "react", "tailwindcss", "typescript"],
      queries: ["nextjs", "react", "tailwind", "typescript"],
      reasoning: "This is a Next.js project with Tailwind CSS.",
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { analyzeProject } = await import("../../src/core/ai.js");
    const result = await analyzeProject(makeContext());

    expect(result.technologies).toContain("next.js");
    expect(result.queries).toContain("nextjs");
    expect(result.reasoning).toContain("Next.js");
  });

  it("handles JSON wrapped in markdown fences", async () => {
    const aiResponse = {
      technologies: ["react"],
      queries: ["react"],
      reasoning: "React app",
    };
    mockCliSuccess("```json\n" + JSON.stringify(aiResponse) + "\n```");

    const { analyzeProject } = await import("../../src/core/ai.js");
    const result = await analyzeProject(makeContext());

    expect(result.technologies).toContain("react");
  });

  it("throws on invalid response structure", async () => {
    mockCliSuccess(JSON.stringify({ invalid: true }));

    const { analyzeProject } = await import("../../src/core/ai.js");
    await expect(analyzeProject(makeContext())).rejects.toThrow();
  });

  it("throws when CLI fails", async () => {
    mockCliFailure("timeout");

    const { analyzeProject } = await import("../../src/core/ai.js");
    await expect(analyzeProject(makeContext())).rejects.toThrow("Claude CLI failed");
  });

  it("handles null packageJson", async () => {
    const aiResponse: AIAnalysis = {
      technologies: ["unknown"],
      queries: ["general"],
      reasoning: "No package.json found.",
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { analyzeProject } = await import("../../src/core/ai.js");
    const result = await analyzeProject(makeContext({ packageJson: null }));
    expect(result.queries).toContain("general");
  });

  it("returns coverageSummary when provided by AI", async () => {
    const aiResponse = {
      technologies: ["next.js", "react"],
      queries: ["nextjs"],
      reasoning: "Next.js project with good existing coverage",
      coverageSummary: "3 of 4 core areas covered — only testing gap remains",
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { analyzeProject } = await import("../../src/core/ai.js");
    const result = await analyzeProject(makeContext({ installedSkills: ["next-best-practices", "react-best-practices"] }));

    expect(result.coverageSummary).toBe("3 of 4 core areas covered — only testing gap remains");
  });

  it("caps queries at MAX_QUERIES", async () => {
    const manyQueries = Array.from({ length: 30 }, (_, i) => `query-${i}`);
    const aiResponse: AIAnalysis = {
      technologies: ["next.js"],
      queries: manyQueries,
      reasoning: "Many queries",
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { analyzeProject, MAX_QUERIES } = await import("../../src/core/ai.js");
    const result = await analyzeProject(makeContext());

    expect(result.queries).toHaveLength(MAX_QUERIES);
    expect(result.queries[0]).toBe("query-0");
    expect(result.queries[MAX_QUERIES - 1]).toBe(`query-${MAX_QUERIES - 1}`);
  });
});

describe("rankSkills", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  const mockSkills: SkillSearchResult[] = [
    { id: "1", skillId: "s1", name: "next-best-practices", installs: 1000, source: "vercel/skills" },
    { id: "2", skillId: "s2", name: "tailwind-skills", installs: 500, source: "user/skills" },
    { id: "3", skillId: "s3", name: "docker-deploy", installs: 200, source: "user/docker" },
  ];

  const mockAnalysis: AIAnalysis = {
    technologies: ["next.js", "tailwindcss"],
    queries: ["nextjs", "tailwind"],
    reasoning: "Next.js with Tailwind",
  };

  it("returns ranked skills with reasons, tier, category, and description", async () => {
    const rankResponse = {
      coverageNote: "No skills installed — full coverage needed",
      maxRecommended: null,
      ranked: [
        { name: "next-best-practices", reason: "Core framework match", relevance: 95, tier: "essential", category: "Framework", description: "Next.js App Router patterns" },
        { name: "tailwind-skills", reason: "Styling framework match", relevance: 75, tier: "recommended", category: "Styling", description: "Tailwind CSS utilities" },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    const { ranked, meta } = await rankSkills(mockSkills, makeContext(), mockAnalysis);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].skill.name).toBe("next-best-practices");
    expect(ranked[0].reason).toBe("Core framework match");
    expect(ranked[0].relevance).toBe(95);
    expect(ranked[0].tier).toBe("essential");
    expect(ranked[0].category).toBe("Framework");
    expect(ranked[0].description).toBe("Next.js App Router patterns");
    expect(ranked[1].tier).toBe("recommended");
    expect(ranked[1].category).toBe("Styling");
    expect(meta.coverageNote).toBe("No skills installed — full coverage needed");
    expect(meta.maxRecommended).toBeUndefined();
  });

  it("infers tier from relevance when not provided by AI", async () => {
    const rankResponse = {
      ranked: [
        { name: "next-best-practices", reason: "Core match", relevance: 90 },
        { name: "tailwind-skills", reason: "Styling match", relevance: 65 },
        { name: "docker-deploy", reason: "Deployment", relevance: 45 },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    const { ranked } = await rankSkills(mockSkills, makeContext(), mockAnalysis);

    expect(ranked[0].tier).toBe("essential");
    expect(ranked[1].tier).toBe("recommended");
    expect(ranked[2].tier).toBe("optional");
    // Fallback category and description
    expect(ranked[0].category).toBe("General");
    expect(ranked[0].description).toBe("");
  });

  it("filters out skills not in the input list", async () => {
    const rankResponse = {
      ranked: [
        { name: "next-best-practices", reason: "Match", relevance: 90, tier: "essential", category: "Framework", description: "Next.js" },
        { name: "nonexistent-skill", reason: "Ghost", relevance: 50, tier: "optional", category: "General", description: "" },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    const { ranked } = await rankSkills(mockSkills, makeContext(), mockAnalysis);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].skill.name).toBe("next-best-practices");
  });

  it("returns meta with coverageNote and maxRecommended", async () => {
    const rankResponse = {
      coverageNote: "Strong coverage — 2 gaps remain",
      maxRecommended: 3,
      ranked: [
        { name: "next-best-practices", reason: "Core match", relevance: 90, tier: "essential", category: "Framework", description: "Next.js patterns" },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    const { meta } = await rankSkills(mockSkills, makeContext({ installedSkills: ["existing-skill"] }), mockAnalysis);

    expect(meta.coverageNote).toBe("Strong coverage — 2 gaps remain");
    expect(meta.maxRecommended).toBe(3);
  });

  it("defaults coverageNote when AI omits it", async () => {
    const rankResponse = {
      ranked: [
        { name: "next-best-practices", reason: "Core match", relevance: 90 },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    const { meta } = await rankSkills(mockSkills, makeContext(), mockAnalysis);

    expect(meta.coverageNote).toBe("No coverage assessment available");
    expect(meta.maxRecommended).toBeUndefined();
  });

  it("throws on invalid response", async () => {
    mockCliSuccess(JSON.stringify({ bad: "data" }));

    const { rankSkills } = await import("../../src/core/ai.js");
    await expect(rankSkills(mockSkills, makeContext(), mockAnalysis)).rejects.toThrow();
  });
});

describe("inferProjectType", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("returns inferred type for unknown project", async () => {
    const aiResponse = {
      inferredType: "python data pipeline",
      primaryLanguages: ["python"],
      confidence: 85,
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { inferProjectType } = await import("../../src/core/ai.js");
    const result = await inferProjectType(makeContext({
      signals: {
        hasTypescript: false,
        hasTailwind: false,
        hasPrisma: false,
        hasDrizzle: false,
        hasSupabase: false,
        hasTurborepo: false,
        hasMonorepo: false,
        hasDocker: false,
        hasVite: false,
        frameworks: [],
        testFramework: null,
        styling: null,
      },
      inferredType: "",
      exploratoryContext: {
        topLevelFiles: ["main.py", "requirements.txt"],
        readmeSnippet: "A data pipeline tool",
        claudeMdSnippet: "",
        fileExtensions: { ".py": 10 },
        manifestFiles: ["requirements.txt"],
        importPatterns: ["import click", "from supabase import create_client"],
      },
    }));

    expect(result.inferredType).toBe("python data pipeline");
    expect(result.primaryLanguages).toContain("python");
    expect(result.confidence).toBe(85);
  });

  it("handles AI failure gracefully", async () => {
    mockCliFailure("timeout");

    const { inferProjectType } = await import("../../src/core/ai.js");
    await expect(inferProjectType(makeContext())).rejects.toThrow();
  });
});

describe("analyzeProject with exploratory context", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("includes CLAUDE.md in prompt when available", async () => {
    const aiResponse: AIAnalysis = {
      technologies: ["python", "click"],
      queries: ["python", "cli"],
      reasoning: "Python CLI tool with Click",
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { analyzeProject } = await import("../../src/core/ai.js");
    await analyzeProject(makeContext({
      exploratoryContext: {
        topLevelFiles: ["main.py"],
        readmeSnippet: "",
        claudeMdSnippet: "# Stack\nPython + Click + Supabase",
        fileExtensions: { ".py": 5 },
        manifestFiles: ["requirements.txt"],
        importPatterns: [],
      },
    }));

    // Verify the prompt sent to Claude includes CLAUDE.md content
    const callArgs = mockedExecFile.mock.calls;
    const promptArg = callArgs[callArgs.length - 1][1] as string[];
    const promptIdx = promptArg.indexOf("-p");
    expect(promptArg[promptIdx + 1]).toContain("CLAUDE.md project documentation");
    expect(promptArg[promptIdx + 1]).toContain("Python + Click + Supabase");
  });

  it("includes exploratory context in prompt when available", async () => {
    const aiResponse: AIAnalysis = {
      technologies: ["python"],
      queries: ["python"],
      reasoning: "Python project",
    };
    mockCliSuccess(JSON.stringify(aiResponse));

    const { analyzeProject } = await import("../../src/core/ai.js");
    await analyzeProject(makeContext({
      exploratoryContext: {
        topLevelFiles: ["main.py", "utils.py"],
        readmeSnippet: "A Python tool",
        claudeMdSnippet: "",
        fileExtensions: { ".py": 10, ".md": 2 },
        manifestFiles: ["requirements.txt"],
        importPatterns: ["import click"],
      },
    }));

    const callArgs = mockedExecFile.mock.calls;
    const promptArg = callArgs[callArgs.length - 1][1] as string[];
    const promptIdx = promptArg.indexOf("-p");
    expect(promptArg[promptIdx + 1]).toContain("Top-level files");
    expect(promptArg[promptIdx + 1]).toContain("Import patterns");
  });
});

describe("rankSkills with compatibility", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  const mockSkills: SkillSearchResult[] = [
    { id: "1", skillId: "s1", name: "next-best-practices", installs: 1000, source: "vercel/skills" },
  ];

  const mockAnalysis: AIAnalysis = {
    technologies: ["next.js"],
    queries: ["nextjs"],
    reasoning: "Next.js project",
  };

  it("includes compatibility assessment in prompt", async () => {
    const rankResponse = {
      ranked: [
        { name: "next-best-practices", reason: "Core match", relevance: 90, tier: "essential", category: "Framework", description: "Next.js patterns", compatible: true },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    await rankSkills(mockSkills, makeContext(), mockAnalysis);

    const callArgs = mockedExecFile.mock.calls;
    const promptArg = callArgs[callArgs.length - 1][1] as string[];
    const promptIdx = promptArg.indexOf("-p");
    expect(promptArg[promptIdx + 1]).toContain("COMPATIBILITY rules");
  });

  it("returns compatibility fields in ranked results", async () => {
    const rankResponse = {
      ranked: [
        { name: "next-best-practices", reason: "Core match", relevance: 90, tier: "essential", category: "Framework", description: "Next.js patterns", compatible: false, compatibilityNote: "Targets Pages Router" },
      ],
    };
    mockCliSuccess(JSON.stringify(rankResponse));

    const { rankSkills } = await import("../../src/core/ai.js");
    const { ranked } = await rankSkills(mockSkills, makeContext(), mockAnalysis);

    expect(ranked[0].compatible).toBe(false);
    expect(ranked[0].compatibilityNote).toBe("Targets Pages Router");
  });
});

describe("callClaude", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("uses CLI when no API key is set", async () => {
    mockCliSuccess("hello");

    const { callClaude } = await import("../../src/core/ai.js");
    const result = await callClaude("test prompt");

    expect(result).toBe("hello");
    expect(mockedExecFile).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "test prompt"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("closes stdin on the child process to prevent hanging", async () => {
    const child = mockCliSuccess("hello");

    const { callClaude } = await import("../../src/core/ai.js");
    await callClaude("test prompt");

    expect(child.stdin.end).toHaveBeenCalledOnce();
  });

  it("includes stderr in error message when available", async () => {
    mockCliFailure("command failed", "some diagnostic output");

    const { callClaude } = await import("../../src/core/ai.js");
    await expect(callClaude("test")).rejects.toThrow(
      "Claude CLI failed: command failed: some diagnostic output",
    );
  });

  it("rejects when CLI returns unexpected format", async () => {
    const child = makeChildStub();
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (typeof callback === "function") {
        (callback as (err: Error | null, stdout: string, stderr: string) => void)(
          null,
          JSON.stringify({ type: "error", message: "bad" }),
          "",
        );
      }
      return child as unknown as ReturnType<typeof execFile>;
    });

    const { callClaude } = await import("../../src/core/ai.js");
    await expect(callClaude("test")).rejects.toThrow("Unexpected Claude CLI response format");
  });
});
