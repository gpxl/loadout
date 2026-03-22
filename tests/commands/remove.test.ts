import { describe, it, expect, vi, beforeEach } from "vitest";
import { removeCommand } from "../../src/commands/remove.js";

vi.mock("../../src/core/skills.js", () => ({
  removeSkill: vi.fn(),
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

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
}));

import { removeSkill, getInstalledSkills } from "../../src/core/skills.js";
import { log } from "../../src/utils/log.js";
import { confirm } from "@inquirer/prompts";

const mockRemove = vi.mocked(removeSkill);
const mockSkills = vi.mocked(getInstalledSkills);
const mockConfirm = vi.mocked(confirm);

beforeEach(() => {
  process.exitCode = undefined;
});

describe("removeCommand", () => {
  it("reports error when skill not found in scope", async () => {
    mockSkills.mockResolvedValue([]);

    await removeCommand("nonexistent", { yes: true });

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("suggests other scope when skill exists there", async () => {
    mockSkills.mockResolvedValue([
      { name: "my-skill", path: "/home/.claude/skills/my-skill", description: null, scope: "global" },
    ]);

    await removeCommand("my-skill", { yes: true });

    expect(log.info).toHaveBeenCalledWith(
      expect.stringContaining("--global"),
    );
  });

  it("removes skill when confirmed with --yes", async () => {
    mockSkills.mockResolvedValue([
      { name: "test-skill", path: "/tmp/.claude/skills/test-skill", description: "Test", scope: "project" },
    ]);
    mockRemove.mockResolvedValue();

    await removeCommand("test-skill", { yes: true });

    expect(mockRemove).toHaveBeenCalledWith("test-skill", expect.objectContaining({ global: undefined }));
    expect(log.success).toHaveBeenCalledWith(
      expect.stringContaining("Removed test-skill"),
    );
  });

  it("cancels when user declines confirmation", async () => {
    mockSkills.mockResolvedValue([
      { name: "test-skill", path: "/tmp/.claude/skills/test-skill", description: null, scope: "project" },
    ]);
    mockConfirm.mockResolvedValue(false);

    await removeCommand("test-skill");

    expect(mockRemove).not.toHaveBeenCalled();
    expect(log.dim).toHaveBeenCalledWith("Cancelled.");
  });

  it("reports error on removal failure", async () => {
    mockSkills.mockResolvedValue([
      { name: "test-skill", path: "/tmp/.claude/skills/test-skill", description: null, scope: "project" },
    ]);
    mockRemove.mockRejectedValue(new Error("permission denied"));

    await removeCommand("test-skill", { yes: true });

    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("permission denied"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("uses global scope when --global flag set", async () => {
    mockSkills.mockResolvedValue([
      { name: "global-skill", path: "/home/.claude/skills/global-skill", description: null, scope: "global" },
    ]);
    mockRemove.mockResolvedValue();

    await removeCommand("global-skill", { global: true, yes: true });

    expect(mockRemove).toHaveBeenCalledWith("global-skill", expect.objectContaining({ global: true }));
  });
});
