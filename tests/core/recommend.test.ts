import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deduplicateSkills,
  deduplicateByName,
  filterInstalled,
  getRecommendations,
} from "../../src/core/recommend.js";
import type { ProjectSignals, ProjectContext } from "../../src/types.js";

// Mock dependencies for getRecommendations
vi.mock("../../src/core/ai.js", () => ({
  isAIAvailable: vi.fn(),
  analyzeProject: vi.fn(),
  rankSkills: vi.fn(),
  callClaude: vi.fn(),
  MAX_QUERIES: 12,
}));

vi.mock("../../src/core/registry.js", () => ({
  searchSkills: vi.fn(),
}));

vi.mock("../../src/utils/log.js", () => ({
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  },
}));

function makeSignals(overrides: Partial<ProjectSignals> = {}): ProjectSignals {
  return {
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
    ...overrides,
  };
}

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
  return {
    path: "/test",
    name: "test",
    signals: makeSignals(overrides.signals),
    packageJson: null,
    configFiles: [],
    installedSkills: [],
    exploratoryContext: {
      topLevelFiles: [],
      readmeSnippet: "",
      claudeMdSnippet: "",
      fileExtensions: {},
      manifestFiles: [],
      importPatterns: [],
    },
    inferredType: "unknown project",
    ...overrides,
  };
}

describe("deduplicateSkills", () => {
  it("removes duplicates by id", () => {
    const skills = [
      { id: "a/b/c", name: "c", installs: 100 },
      { id: "a/b/c", name: "c", installs: 100 },
      { id: "d/e/f", name: "f", installs: 50 },
    ];
    const result = deduplicateSkills(skills);
    expect(result).toHaveLength(2);
  });

  it("keeps first occurrence", () => {
    const skills = [
      { id: "a", name: "first", installs: 1 },
      { id: "a", name: "second", installs: 2 },
    ];
    const result = deduplicateSkills(skills);
    expect(result[0].name).toBe("first");
  });
});

describe("deduplicateByName", () => {
  it("keeps the version with the most installs", () => {
    const skills = [
      { name: "zustand", installs: 120, source: "bobmatnyc/claude-mpm-skills" },
      { name: "zustand", installs: 651, source: "lobehub/lobehub" },
      { name: "zustand", installs: 93, source: "pproenca/dot-skills" },
    ];
    const result = deduplicateByName(skills);
    expect(result).toHaveLength(1);
    expect(result[0].installs).toBe(651);
    expect(result[0].source).toBe("lobehub/lobehub");
  });

  it("preserves skills with unique names", () => {
    const skills = [
      { name: "zustand", installs: 651 },
      { name: "zod", installs: 824 },
      { name: "react-email", installs: 3197 },
    ];
    const result = deduplicateByName(skills);
    expect(result).toHaveLength(3);
  });

  it("handles a mix of duplicates and uniques", () => {
    const skills = [
      { name: "framer-motion", installs: 216, source: "mindrally/skills" },
      { name: "framer-motion", installs: 1587, source: "patricio0312rev/skills" },
      { name: "framer-motion", installs: 111, source: "dylantarre/animation-principles" },
      { name: "next-best-practices", installs: 37467, source: "vercel-labs/next-skills" },
    ];
    const result = deduplicateByName(skills);
    expect(result).toHaveLength(2);
    expect(result.find((s) => s.name === "framer-motion")!.installs).toBe(1587);
    expect(result.find((s) => s.name === "next-best-practices")!.installs).toBe(37467);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateByName([])).toEqual([]);
  });
});

describe("filterInstalled", () => {
  it("filters out installed skills by name", () => {
    const skills = [
      { name: "react-best-practices", installs: 100 },
      { name: "typescript-best-practices", installs: 80 },
      { name: "next-best-practices", installs: 60 },
    ];
    const result = filterInstalled(skills, ["react-best-practices"]);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).not.toContain("react-best-practices");
  });

  it("returns all when nothing installed", () => {
    const skills = [{ name: "a", installs: 1 }];
    expect(filterInstalled(skills, [])).toHaveLength(1);
  });
});

describe("getRecommendations", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("throws when AI is unavailable", async () => {
    const { isAIAvailable } = await import("../../src/core/ai.js");
    vi.mocked(isAIAvailable).mockResolvedValue(false);

    const { getRecommendations } = await import("../../src/core/recommend.js");
    await expect(getRecommendations(makeContext())).rejects.toThrow(
      "AI is required for skill recommendations",
    );
  });

  it("analyzes and ranks with AI", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js", "react"],
      queries: ["nextjs", "react"],
      reasoning: "Next.js app",
    });
    vi.mocked(searchSkills).mockResolvedValue([
      { id: "1", skillId: "s1", name: "next-skill", installs: 100, source: "test/repo" },
    ]);
    vi.mocked(rankSkills).mockResolvedValue({
      ranked: [
        {
          skill: { id: "1", skillId: "s1", name: "next-skill", installs: 100, source: "test/repo" },
          reason: "Core framework",
          relevance: 90,
          tier: "essential",
          category: "Framework",
          description: "Next.js patterns",
        },
      ],
      meta: { coverageNote: "No skills installed", maxRecommended: undefined },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].reason).toBe("Core framework");
    expect(result.ranked[0].tier).toBe("essential");
    expect(result.ranked[0].category).toBe("Framework");
    expect(result.coverageNote).toBe("No skills installed");
    expect(analyzeProject).toHaveBeenCalled();
  });

  it("totalEvaluated reflects count sent to ranking", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js"],
      queries: ["nextjs"],
      reasoning: "Next.js app",
    });

    const skills = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      skillId: `s${i}`,
      name: `skill-${i}`,
      installs: 100 - i,
      source: "test/repo",
    }));
    vi.mocked(searchSkills).mockResolvedValue(skills);
    vi.mocked(rankSkills).mockResolvedValue({ ranked: [], meta: { coverageNote: "Test", maxRecommended: undefined } });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    expect(result.totalEvaluated).toBe(10);
  });

  it("caps skills sent to ranking at 25", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js"],
      queries: ["nextjs"],
      reasoning: "Next.js app",
    });

    const manySkills = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      skillId: `s${i}`,
      name: `skill-${i}`,
      installs: 1000 - i,
      source: "test/repo",
    }));
    vi.mocked(searchSkills).mockResolvedValue(manySkills);
    vi.mocked(rankSkills).mockResolvedValue({ ranked: [], meta: { coverageNote: "Test", maxRecommended: undefined } });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    await getRecommendations(makeContext());

    const calledWith = vi.mocked(rankSkills).mock.calls[0][0];
    expect(calledWith).toHaveLength(25);
    expect(calledWith[0].installs).toBe(1000);
    expect(calledWith[24].installs).toBe(976);
  });

  it("caps AI queries at MAX_QUERIES", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    const manyQueries = Array.from({ length: 20 }, (_, i) => `q-${i}`);
    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js"],
      queries: manyQueries,
      reasoning: "Lots of queries",
    });
    vi.mocked(searchSkills).mockResolvedValue([]);
    vi.mocked(rankSkills).mockResolvedValue({ ranked: [], meta: { coverageNote: "Test", maxRecommended: undefined } });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    await getRecommendations(makeContext());

    expect(vi.mocked(searchSkills).mock.calls.length).toBeLessThanOrEqual(12);
  });

  it("throws when AI analysis fails", async () => {
    const { isAIAvailable, analyzeProject } = await import("../../src/core/ai.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockRejectedValue(new Error("timeout"));

    const { getRecommendations } = await import("../../src/core/recommend.js");
    await expect(
      getRecommendations(makeContext()),
    ).rejects.toThrow("timeout");
  });

  it("filters out installed skills before ranking", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js"],
      queries: ["nextjs"],
      reasoning: "Next.js app",
    });
    vi.mocked(searchSkills).mockResolvedValue([
      { id: "1", skillId: "s1", name: "already-installed", installs: 100, source: "test/repo" },
      { id: "2", skillId: "s2", name: "new-skill", installs: 50, source: "test/repo" },
    ]);
    vi.mocked(rankSkills).mockResolvedValue({
      ranked: [{
        skill: { id: "2", skillId: "s2", name: "new-skill", installs: 50, source: "test/repo" },
        reason: "Fills a gap",
        relevance: 75,
        tier: "recommended",
        category: "General",
        description: "A new skill",
        official: false,
        auditRisk: "safe",
      }],
      meta: { coverageNote: "One gap found" },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(
      makeContext({
        signals: makeSignals(),
        installedSkills: ["already-installed"],
      }),
    );

    // rankSkills should only receive the non-installed skill
    const calledWith = vi.mocked(rankSkills).mock.calls[0][0];
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].name).toBe("new-skill");
  });

  it("applies AI maxRecommended cap to ranked results", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js"],
      queries: ["nextjs"],
      reasoning: "Next.js app",
      coverageSummary: "Good coverage — only minor gaps remain",
    });

    const skills = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      skillId: `s${i}`,
      name: `skill-${i}`,
      installs: 100 - i,
      source: "test/repo",
    }));
    vi.mocked(searchSkills).mockResolvedValue(skills);

    const rankedSkills = skills.map((s) => ({
      skill: s,
      reason: "Fills a gap",
      relevance: 70,
      tier: "recommended" as const,
      category: "General",
      description: "A skill",
      official: false,
      auditRisk: "low",
    }));
    vi.mocked(rankSkills).mockResolvedValue({
      ranked: rankedSkills,
      meta: { coverageNote: "Strong coverage — only 2 targeted additions needed", maxRecommended: 2 },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(
      makeContext({ installedSkills: ["existing-skill-1", "existing-skill-2"] }),
    );

    expect(result.ranked).toHaveLength(2);
    expect(result.coverageSummary).toBe("Good coverage — only minor gaps remain");
    expect(result.coverageNote).toBe("Strong coverage — only 2 targeted additions needed");
  });

  it("passes through coverageSummary without maxRecommended cap", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["next.js"],
      queries: ["nextjs"],
      reasoning: "Next.js app",
      coverageSummary: "No skills installed",
    });
    vi.mocked(searchSkills).mockResolvedValue([
      { id: "1", skillId: "s1", name: "skill-a", installs: 100, source: "test/repo" },
    ]);
    vi.mocked(rankSkills).mockResolvedValue({
      ranked: [{
        skill: { id: "1", skillId: "s1", name: "skill-a", installs: 100, source: "test/repo" },
        reason: "Core",
        relevance: 85,
        tier: "essential",
        category: "Framework",
        description: "A skill",
        official: false,
        auditRisk: "safe",
      }],
      meta: { coverageNote: "No skills installed — comprehensive setup recommended" },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    expect(result.ranked).toHaveLength(1);
    expect(result.coverageSummary).toBe("No skills installed");
    expect(result.coverageNote).toBe("No skills installed — comprehensive setup recommended");
  });

  it("returns empty with warning when AI returns no queries", async () => {
    const { isAIAvailable, analyzeProject } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["unknown"],
      queries: [],
      reasoning: "Could not identify technologies",
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    expect(result.ranked).toEqual([]);
    expect(result.totalEvaluated).toBe(0);
    expect(vi.mocked(searchSkills)).not.toHaveBeenCalled();
  });

  it("returns empty with warning when all searches fail", async () => {
    const { isAIAvailable, analyzeProject } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["python"],
      queries: ["python", "cli"],
      reasoning: "Python CLI",
    });
    vi.mocked(searchSkills).mockRejectedValue(new Error("network error"));

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    expect(result.ranked).toEqual([]);
    expect(result.totalEvaluated).toBe(0);
  });

  it("reports partial search failures but continues", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["python"],
      queries: ["python", "cli"],
      reasoning: "Python CLI",
    });
    vi.mocked(searchSkills)
      .mockResolvedValueOnce([{ id: "1", skillId: "s1", name: "skill-a", installs: 50, source: "test/repo" }])
      .mockRejectedValueOnce(new Error("network error"));
    vi.mocked(rankSkills).mockResolvedValue({
      ranked: [{
        skill: { id: "1", skillId: "s1", name: "skill-a", installs: 50, source: "test/repo" },
        reason: "Core",
        relevance: 85,
        tier: "essential",
        category: "General",
        description: "A skill",
        official: false,
        auditRisk: "safe",
      }],
      meta: { coverageNote: "Partial results" },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    // Should still return the one successful result
    expect(result.ranked).toHaveLength(1);
    expect(result.totalEvaluated).toBe(1);
  });

  it("does not discard ranked results when maxRecommended is 0", async () => {
    const { isAIAvailable, analyzeProject, rankSkills } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["python"],
      queries: ["python"],
      reasoning: "Python project",
    });
    vi.mocked(searchSkills).mockResolvedValue([
      { id: "1", skillId: "s1", name: "skill-a", installs: 100, source: "test/repo" },
    ]);
    vi.mocked(rankSkills).mockResolvedValue({
      ranked: [{
        skill: { id: "1", skillId: "s1", name: "skill-a", installs: 100, source: "test/repo" },
        reason: "Essential",
        relevance: 90,
        tier: "essential",
        category: "General",
        description: "A skill",
        official: false,
        auditRisk: "safe",
      }],
      meta: { coverageNote: "Well covered", maxRecommended: 0 },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    const result = await getRecommendations(makeContext());

    // maxRecommended: 0 should be ignored — results preserved
    expect(result.ranked).toHaveLength(1);
  });

  it("triggers refineQueries when first pass has < 10 results", async () => {
    const { isAIAvailable, analyzeProject, rankSkills, callClaude } = await import("../../src/core/ai.js");
    const { searchSkills } = await import("../../src/core/registry.js");

    vi.mocked(isAIAvailable).mockResolvedValue(true);
    vi.mocked(analyzeProject).mockResolvedValue({
      technologies: ["python", "click"],
      queries: ["python"],
      reasoning: "Python CLI",
    });

    // First pass returns few results
    const firstPassSkills = Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      skillId: `s${i}`,
      name: `skill-${i}`,
      installs: 100 - i,
      source: "test/repo",
    }));
    vi.mocked(searchSkills)
      .mockResolvedValueOnce(firstPassSkills) // first pass
      .mockResolvedValue([                    // refinement results
        { id: "10", skillId: "s10", name: "extra-skill", installs: 50, source: "test/repo" },
      ]);

    // Mock refineQueries AI call
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({ gaps: ["missing CLI tools"], queries: ["cli tools"] }),
    );

    vi.mocked(rankSkills).mockResolvedValue({
      ranked: [],
      meta: { coverageNote: "Test" },
    });

    const { getRecommendations } = await import("../../src/core/recommend.js");
    await getRecommendations(makeContext({ signals: makeSignals() }));

    // callClaude should have been called for refinement
    expect(vi.mocked(callClaude)).toHaveBeenCalled();
  });
});

