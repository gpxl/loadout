import { describe, it, expect, vi, beforeEach } from "vitest";
import { statusCommand } from "../../src/commands/status.js";

vi.mock("../../src/core/detect.js", () => ({
  detectProject: vi.fn(),
}));

vi.mock("../../src/core/skills.js", () => ({
  getInstalledSkills: vi.fn(),
}));

vi.mock("../../src/utils/log.js", () => ({
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
    setQuiet: vi.fn(),
  },
}));

import { detectProject } from "../../src/core/detect.js";
import { getInstalledSkills } from "../../src/core/skills.js";
import { log } from "../../src/utils/log.js";

const mockDetect = vi.mocked(detectProject);
const mockSkills = vi.mocked(getInstalledSkills);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("statusCommand", () => {
  it("shows no skills message when none installed", async () => {
    mockDetect.mockResolvedValue({
      path: "/tmp/test",
      name: "test-project",
      signals: {
        hasTypescript: true,
        hasTailwind: false,
        hasPrisma: false,
        hasDrizzle: false,
        hasSupabase: false,
        hasTurborepo: false,
        hasMonorepo: false,
        hasDocker: false,
        hasVite: false,
        frameworks: ["next"],
        testFramework: null,
        styling: null,
      },
      hasClaudeSkills: false,
      installedSkills: [],
    });
    mockSkills.mockResolvedValue([]);

    await statusCommand("/tmp/test");

    expect(log.dim).toHaveBeenCalledWith(
      expect.stringContaining("No skills installed"),
    );
  });

  it("shows project and global skill counts", async () => {
    mockDetect.mockResolvedValue({
      path: "/tmp/test",
      name: "my-app",
      signals: {
        hasTypescript: true,
        hasTailwind: true,
        hasPrisma: false,
        hasDrizzle: false,
        hasSupabase: false,
        hasTurborepo: false,
        hasMonorepo: false,
        hasDocker: false,
        hasVite: true,
        frameworks: ["react"],
        testFramework: "vitest",
        styling: "tailwind",
      },
      hasClaudeSkills: true,
      installedSkills: ["react-best-practices"],
    });
    mockSkills.mockResolvedValue([
      { name: "react-best-practices", path: "/tmp/.claude/skills/react-best-practices", description: "React patterns", scope: "project" },
      { name: "typescript-expert", path: "/home/.claude/skills/typescript-expert", description: "TS expert", scope: "global" },
    ]);

    await statusCommand("/tmp/test");

    expect(log.dim).toHaveBeenCalledWith(
      expect.stringContaining("1 project + 1 global"),
    );
  });

  it("defaults to cwd when no path given", async () => {
    mockDetect.mockResolvedValue({
      path: process.cwd(),
      name: "loadout",
      signals: {
        hasTypescript: true,
        hasTailwind: false,
        hasPrisma: false,
        hasDrizzle: false,
        hasSupabase: false,
        hasTurborepo: false,
        hasMonorepo: false,
        hasDocker: false,
        hasVite: false,
        frameworks: [],
        testFramework: "vitest",
        styling: null,
      },
      hasClaudeSkills: false,
      installedSkills: [],
    });
    mockSkills.mockResolvedValue([]);

    await statusCommand();

    expect(mockDetect).toHaveBeenCalledWith(expect.stringContaining("/"));
    expect(mockSkills).toHaveBeenCalledWith(expect.stringContaining("/"));
  });
});
