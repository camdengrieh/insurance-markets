import { describe, expect, it } from "vitest";

import { parseQty } from "../../core/money";
import { nonNegativeDec, probability, within } from "./units";

describe("probability units (M3-2: units fail closed)", () => {
  it("keeps a 0 to 1 value exactly", () => {
    expect(probability(0.55, "unit")).toMatchObject({ ok: true, value: "0.55" });
    expect(probability("0.123456789", "unit")).toMatchObject({ ok: true, value: "0.123456789" });
    expect(probability(0, "unit")).toMatchObject({ ok: true, value: "0" });
    expect(probability(1, "unit")).toMatchObject({ ok: true, value: "1" });
  });

  it("moves the decimal point for a 0 to 100 value, never dividing floats", () => {
    expect(probability(61, "percent")).toMatchObject({ ok: true, value: "0.61" });
    expect(probability(52.5, "percent")).toMatchObject({ ok: true, value: "0.525" });
    expect(probability(100, "percent")).toMatchObject({ ok: true, value: "1" });
    expect(probability("7", "percent")).toMatchObject({ ok: true, value: "0.07" });
    expect(probability(0.1 + 0.2, "unit")).toMatchObject({ ok: true });
  });

  it("refuses a percent where a 0 to 1 value is expected", () => {
    expect(probability(62, "unit")).toEqual({ ok: false, reason: "out_of_range" });
    expect(probability(1.01, "unit")).toEqual({ ok: false, reason: "out_of_range" });
    expect(probability(-0.01, "unit")).toEqual({ ok: false, reason: "not_a_number" });
  });

  it("refuses a 0 to 1 value where a percent is expected only past 100", () => {
    expect(probability(100.5, "percent")).toEqual({ ok: false, reason: "out_of_range" });
    expect(probability(-1, "percent")).toEqual({ ok: false, reason: "not_a_number" });
  });

  it("refuses anything that is not a plain number", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "55%", " 0.5", "0.5 ", "1e-3", "0x10", "", null, undefined, {}, [], true, 1n]) {
      expect(probability(bad, "unit"), String(bad)).toEqual({ ok: false, reason: "not_a_number" });
    }
  });

  it("does not turn a missing value into 0", () => {
    expect(probability(undefined, "unit").ok).toBe(false);
    expect(probability(null, "percent").ok).toBe(false);
  });
});

describe("nonNegativeDec and within", () => {
  it("accepts exact non-negative decimals only", () => {
    expect(nonNegativeDec(850)).toBe("850");
    expect(nonNegativeDec("12.50")).toBe("12.5");
    expect(nonNegativeDec(-1)).toBeNull();
    expect(nonNegativeDec("abc")).toBeNull();
    expect(nonNegativeDec(null)).toBeNull();
  });

  it("compares with an exact tolerance", () => {
    const a = parseQty("price", "0.62");
    const b = parseQty("price", "0.6");
    if (a === null || b === null) throw new Error("fixture");
    expect(within(a, b, "0.02")).toBe(true);
    expect(within(a, b, "0.01")).toBe(false);
    expect(within(b, a, "0.02")).toBe(true);
  });
});
