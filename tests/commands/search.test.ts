import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCommand } from "../../src/commands/search.js";

vi.mock("../../src/core/registry.js", () => ({
  searchSkills: vi.fn(),
}));

vi.mock("../../src/core/official.js", () => ({
  fetchOfficialOrgs: vi.fn(),
  isOfficialSourceCached: vi.fn(),
}));

vi.mock("../../src/core/audit.js", () => ({
  fetchAuditsBatch: vi.fn(),
  summarizeRisk: vi.fn(),
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

import { searchSkills } from "../../src/core/registry.js";
import { fetchOfficialOrgs, isOfficialSourceCached } from "../../src/core/official.js";
import { fetchAuditsBatch, summarizeRisk } from "../../src/core/audit.js";
import { log } from "../../src/utils/log.js";

const mockSearch = vi.mocked(searchSkills);
const mockFetchOrgs = vi.mocked(fetchOfficialOrgs);
const mockIsOfficial = vi.mocked(isOfficialSourceCached);
const mockFetchAudits = vi.mocked(fetchAuditsBatch);
const mockSummarizeRisk = vi.mocked(summarizeRisk);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockFetchOrgs.mockResolvedValue(new Set(["vercel"]));
  mockIsOfficial.mockReturnValue(false);
  mockFetchAudits.mockResolvedValue(new Map());
  mockSummarizeRisk.mockReturnValue("unaudited");
});

describe("searchCommand", () => {
  it("shows warning when no results found", async () => {
    mockSearch.mockResolvedValue([]);

    await searchCommand("nonexistent-skill");

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("No skills found"),
    );
  });

  it("displays results when found", async () => {
    mockSearch.mockResolvedValue([
      {
        id: "1",
        skillId: "react-best",
        name: "react-best-practices",
        installs: 1500,
        source: "vercel-labs/agent-skills",
      },
    ]);

    await searchCommand("react");

    expect(log.dim).toHaveBeenCalledWith(
      expect.stringContaining("1 result(s)"),
    );
  });

  it("respects limit option", async () => {
    mockSearch.mockResolvedValue([]);

    await searchCommand("test", { limit: 5 });

    expect(mockSearch).toHaveBeenCalledWith({ query: "test", limit: 5 });
  });

  it("uses default limit of 20", async () => {
    mockSearch.mockResolvedValue([]);

    await searchCommand("test");

    expect(mockSearch).toHaveBeenCalledWith({ query: "test", limit: 20 });
  });
});
