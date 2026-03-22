import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, printInstallSummary } from "../../src/utils/log.js";

describe("log", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.setQuiet(false);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    log.setQuiet(false);
  });

  it("info writes to console.log", () => {
    log.info("hello");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("success writes to console.log", () => {
    log.success("done");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("warn writes to console.error", () => {
    log.warn("careful");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("error writes to console.error", () => {
    log.error("fail");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("dim writes to console.log", () => {
    log.dim("subtle");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("suppresses all output when quiet", () => {
    log.setQuiet(true);
    log.info("hidden");
    log.success("hidden");
    log.warn("hidden");
    log.error("hidden");
    log.dim("hidden");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("printInstallSummary", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.setQuiet(false);
  });

  afterEach(() => {
    logSpy.mockRestore();
    log.setQuiet(false);
  });

  it("does nothing for single install results", () => {
    const results = new Map<string, Error | null>([["skill-a", null]]);
    printInstallSummary(results);
    // Single result = no summary line
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("prints summary for multiple results", () => {
    const results = new Map<string, Error | null>([
      ["skill-a", null],
      ["skill-b", null],
    ]);
    printInstallSummary(results);
    expect(logSpy).toHaveBeenCalled();
  });

  it("prints failure details when some installs fail", () => {
    const results = new Map<string, Error | null>([
      ["skill-a", null],
      ["skill-b", new Error("not found")],
    ]);
    printInstallSummary(results);
    // Should mention the failed skill
    const allCalls = logSpy.mock.calls.flat().join(" ");
    expect(allCalls).toContain("failed");
  });
});
