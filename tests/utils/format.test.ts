import { describe, it, expect } from "vitest";
import { formatInstalls, getRiskColor } from "../../src/utils/format.js";

describe("formatInstalls", () => {
  it("returns raw number below 1000", () => {
    expect(formatInstalls(0)).toBe("0");
    expect(formatInstalls(1)).toBe("1");
    expect(formatInstalls(999)).toBe("999");
  });

  it("formats thousands as K", () => {
    expect(formatInstalls(1000)).toBe("1.0K");
    expect(formatInstalls(1500)).toBe("1.5K");
    expect(formatInstalls(999_999)).toBe("1000.0K");
  });

  it("formats millions as M", () => {
    expect(formatInstalls(1_000_000)).toBe("1.0M");
    expect(formatInstalls(2_500_000)).toBe("2.5M");
  });
});

describe("getRiskColor", () => {
  it("returns green for safe and low", () => {
    const safeFn = getRiskColor("safe");
    const lowFn = getRiskColor("low");
    expect(typeof safeFn).toBe("function");
    expect(typeof lowFn).toBe("function");
    // Verify they produce output (chalk wraps the string)
    expect(safeFn("test")).toContain("test");
    expect(lowFn("test")).toContain("test");
  });

  it("returns yellow for medium", () => {
    const fn = getRiskColor("medium");
    expect(typeof fn).toBe("function");
    expect(fn("test")).toContain("test");
  });

  it("returns red for high and critical", () => {
    const highFn = getRiskColor("high");
    const critFn = getRiskColor("critical");
    expect(typeof highFn).toBe("function");
    expect(typeof critFn).toBe("function");
    expect(highFn("test")).toContain("test");
    expect(critFn("test")).toContain("test");
  });

  it("returns dim for unknown risk levels", () => {
    const fn = getRiskColor("unaudited");
    expect(typeof fn).toBe("function");
    expect(fn("test")).toContain("test");
  });
});
