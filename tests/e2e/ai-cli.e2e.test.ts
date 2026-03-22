import { execFile } from "node:child_process";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

/**
 * End-to-end tests for Claude CLI subprocess integration.
 *
 * These tests invoke the real Claude CLI and are skipped when it's not
 * available (e.g. CI without CLI installed). Run with: pnpm test:e2e
 */

function claudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

let cliAvailable = false;

beforeAll(async () => {
  cliAvailable = await claudeCliAvailable();
});

describe("Claude CLI subprocess", () => {
  beforeEach(({ skip }) => {
    if (!cliAvailable) skip();
    // Force CLI path — prevent API key from routing to SDK
    delete process.env.ANTHROPIC_API_KEY;
  });

  it(
    "callClaude returns a response without hanging (stdin EOF)",
    async () => {
      const { callClaude } = await import("../../src/core/ai.js");
      const result = await callClaude("Respond with exactly: ok");

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    },
    // 15s — well under the 30s execFile timeout.
    // If stdin isn't closed the process hangs until the 30s kill,
    // so a 15s timeout here catches the regression.
    15_000,
  );

  it(
    "callClaude handles a JSON-generation prompt end to end",
    async () => {
      const { callClaude } = await import("../../src/core/ai.js");
      const result = await callClaude(
        'Return ONLY valid JSON, no other text: {"status": "ok"}',
      );

      expect(typeof result).toBe("string");
      // The response should contain the JSON (possibly wrapped in text)
      expect(result).toContain("ok");
    },
    15_000,
  );

  it(
    "isAIAvailable returns true when CLI is present",
    async () => {
      const { isAIAvailable } = await import("../../src/core/ai.js");
      expect(await isAIAvailable()).toBe(true);
    },
    10_000,
  );
});
