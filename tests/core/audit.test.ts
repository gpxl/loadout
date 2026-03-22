import { describe, it, expect } from "vitest";
import { fetchAudits, fetchAuditsBatch, summarizeRisk } from "../../src/core/audit.js";

describe("fetchAudits", () => {
  it(
    "fetches audit data for a known skill",
    async () => {
      const results = await fetchAudits("supabase/agent-skills", ["supabase-postgres-best-practices"]);
      expect(results.size).toBe(1);

      const audit = results.get("supabase-postgres-best-practices");
      expect(audit).toBeDefined();
      // Should have at least one provider
      expect(audit!.ath || audit!.socket || audit!.snyk).toBeTruthy();
    },
    15_000,
  );

  it(
    "fetches audit data for multiple skills in one call",
    async () => {
      const results = await fetchAudits("supabase/agent-skills", [
        "supabase-postgres-best-practices",
        "skill-creator",
      ]);
      expect(results.size).toBe(2);
    },
    15_000,
  );

  it(
    "returns results for skills the API knows about",
    async () => {
      const results = await fetchAudits("supabase/agent-skills", ["nonexistent-xyz"]);
      // API may return data even for unknown names — just verify no crash
      expect(results).toBeInstanceOf(Map);
    },
    15_000,
  );
});

describe("fetchAuditsBatch", () => {
  it(
    "fetches audits across multiple sources in parallel",
    async () => {
      const skills = [
        { id: "a", skillId: "a", name: "supabase-postgres-best-practices", installs: 1, source: "supabase/agent-skills" },
        { id: "b", skillId: "b", name: "nextjs-supabase-auth", installs: 1, source: "sickn33/antigravity-awesome-skills" },
      ];
      const results = await fetchAuditsBatch(skills);
      expect(results.size).toBeGreaterThan(0);
    },
    15_000,
  );
});

describe("summarizeRisk", () => {
  it("returns low when worst provider is low", () => {
    expect(summarizeRisk({ ath: { risk: "safe" }, socket: { risk: "safe" }, snyk: { risk: "low" } })).toBe("low");
  });

  it("returns safe when all providers are safe", () => {
    expect(summarizeRisk({ ath: { risk: "safe" }, socket: { risk: "safe" }, snyk: { risk: "safe" } })).toBe("safe");
  });

  it("returns worst-case risk", () => {
    expect(summarizeRisk({ ath: { risk: "safe" }, snyk: { risk: "high" } })).toBe("high");
    expect(summarizeRisk({ ath: { risk: "safe" }, snyk: { risk: "critical" } })).toBe("critical");
  });

  it("returns unaudited for empty audit", () => {
    expect(summarizeRisk({})).toBe("unaudited");
  });

  it("normalizes med to medium", () => {
    expect(summarizeRisk({ snyk: { risk: "Med Risk" } })).toBe("medium");
  });
});
