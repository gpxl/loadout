import { describe, it, expect, vi, beforeEach } from "vitest";
import { installCommand } from "../../src/commands/install.js";

vi.mock("../../src/core/skills.js", () => ({
  installSkillDirect: vi.fn(),
  installSkillBatch: vi.fn(),
  discoverSkillsInRepo: vi.fn(),
  generateSkillRules: vi.fn(),
  getProjectSkills: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
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
  printInstallSummary: vi.fn(),
}));

import { installSkillDirect, discoverSkillsInRepo, installSkillBatch, getProjectSkills } from "../../src/core/skills.js";
import { confirm, checkbox } from "@inquirer/prompts";
import { log } from "../../src/utils/log.js";

const mockInstallDirect = vi.mocked(installSkillDirect);
const mockDiscover = vi.mocked(discoverSkillsInRepo);
const mockInstallBatch = vi.mocked(installSkillBatch);
const mockGetProjectSkills = vi.mocked(getProjectSkills);
const mockConfirm = vi.mocked(confirm);
const mockCheckbox = vi.mocked(checkbox);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockGetProjectSkills.mockResolvedValue([]);
});

describe("installCommand", () => {
  describe("direct skill install (--skill)", () => {
    it("installs a specific skill with --yes", async () => {
      mockInstallDirect.mockResolvedValue(undefined);

      await installCommand("vercel/skills", { skill: "react", yes: true });

      expect(mockInstallDirect).toHaveBeenCalledWith(
        "vercel/skills",
        "react",
        expect.objectContaining({ global: undefined }),
      );
      expect(log.success).toHaveBeenCalledWith(expect.stringContaining("Installed react"));
    });

    it("shows error when direct install fails", async () => {
      mockInstallDirect.mockRejectedValue(new Error("not found"));

      await installCommand("vercel/skills", { skill: "bad-skill", yes: true });

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining("not found"));
    });

    it("cancels when user declines confirmation", async () => {
      mockConfirm.mockResolvedValue(false);

      await installCommand("vercel/skills", { skill: "react" });

      expect(mockInstallDirect).not.toHaveBeenCalled();
      expect(log.dim).toHaveBeenCalledWith("Cancelled.");
    });
  });

  describe("discovery mode", () => {
    it("shows warning when no skills found in repo", async () => {
      mockDiscover.mockResolvedValue([]);

      await installCommand("empty/repo");

      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("No skills found"));
    });

    it("shows error when discovery fails", async () => {
      mockDiscover.mockRejectedValue(new Error("clone failed"));

      await installCommand("bad/repo");

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining("clone failed"));
    });

    it("does nothing when user selects nothing", async () => {
      mockDiscover.mockResolvedValue(["skill-a", "skill-b"]);
      mockCheckbox.mockResolvedValue([]);

      await installCommand("org/repo");

      expect(log.dim).toHaveBeenCalledWith("Nothing selected.");
    });

    it("installs batch when user selects and confirms", async () => {
      mockDiscover.mockResolvedValue(["skill-a", "skill-b"]);
      mockCheckbox.mockResolvedValue(["skill-a"]);
      mockConfirm.mockResolvedValue(true);
      mockInstallBatch.mockResolvedValue(new Map([["skill-a", null]]));

      await installCommand("org/repo");

      expect(mockInstallBatch).toHaveBeenCalledWith(
        "org/repo",
        ["skill-a"],
        expect.any(Object),
      );
      expect(log.success).toHaveBeenCalledWith(expect.stringContaining("Installed skill-a"));
    });

    it("cancels batch when user declines confirmation", async () => {
      mockDiscover.mockResolvedValue(["skill-a"]);
      mockCheckbox.mockResolvedValue(["skill-a"]);
      mockConfirm.mockResolvedValue(false);

      await installCommand("org/repo");

      expect(mockInstallBatch).not.toHaveBeenCalled();
      expect(log.dim).toHaveBeenCalledWith("Cancelled.");
    });
  });
});
