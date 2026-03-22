import { describe, it, expect } from "vitest";
import { fetchOfficialOrgs, isOfficialSource } from "../../src/core/official.js";

describe("fetchOfficialOrgs", () => {
  it(
    "fetches a non-empty set of official orgs from skills.sh",
    async () => {
      const orgs = await fetchOfficialOrgs();
      expect(orgs.size).toBeGreaterThan(0);
      // Known official orgs should be present
      expect(orgs.has("supabase")).toBe(true);
      expect(orgs.has("vercel")).toBe(true);
      expect(orgs.has("anthropics")).toBe(true);
    },
    15_000,
  );
});

describe("isOfficialSource", () => {
  it(
    "identifies official sources",
    async () => {
      expect(await isOfficialSource("supabase/agent-skills")).toBe(true);
      expect(await isOfficialSource("vercel-labs/agent-skills")).toBe(true);
      expect(await isOfficialSource("resend/resend-skills")).toBe(true);
      expect(await isOfficialSource("github/awesome-copilot")).toBe(true);
    },
    15_000,
  );

  it(
    "identifies community sources",
    async () => {
      expect(await isOfficialSource("sickn33/antigravity-awesome-skills")).toBe(false);
      expect(await isOfficialSource("random-user/my-skills")).toBe(false);
    },
    15_000,
  );
});
