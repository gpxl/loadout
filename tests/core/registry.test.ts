import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchSkills } from "../../src/core/registry.js";

describe("searchSkills", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws on query shorter than 2 chars", async () => {
    await expect(searchSkills({ query: "a" })).rejects.toThrow(
      "Search query must be at least 2 characters",
    );
  });

  it("calls skills.sh API with correct params", async () => {
    const mockResults = {
      query: "react",
      searchType: "fuzzy",
      skills: [
        {
          id: "vercel-labs/agent-skills/react-best-practices",
          skillId: "react-best-practices",
          name: "react-best-practices",
          installs: 100000,
          source: "vercel-labs/agent-skills",
        },
      ],
      count: 1,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResults),
    } as Response);

    const results = await searchSkills({ query: "react", limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("react-best-practices");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("q=react"),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=5"),
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(searchSkills({ query: "react" })).rejects.toThrow(
      "skills.sh search failed: 500",
    );
  });
});
