import { describe, expect, it } from "vitest";

import { cmpDec, isOpenUnitInterval, isPositive, numberToDec, numericToDec, oneMinus, parseDec } from "./decimal.js";

describe("polymarket decimal helpers", () => {
  it("canonicalises venue decimal strings without floating point", () => {
    expect(parseDec("0.380")).toBe("0.38");
    expect(parseDec("305730")).toBe("305730");
    expect(parseDec("849398.710")).toBe("849398.71");
    expect(parseDec("-0")).toBe("0");
    expect(parseDec("-0.5")).toBe("-0.5");
  });

  it("refuses anything that is not an exact plain decimal", () => {
    for (const bad of ["", "007.5", " 1", "1 ", "1e3", "0x10", "1,5", "+1", "NaN", "Infinity", ".5", "1.", "--1", null, undefined, 1, {}]) {
      expect(parseDec(bad as unknown)).toBeNull();
    }
  });

  it("turns JSON numbers into the shortest exact decimal, expanding exponents by string arithmetic", () => {
    expect(numberToDec(0.3799999982)).toBe("0.3799999982");
    expect(numberToDec(65.789474)).toBe("65.789474");
    expect(numberToDec(120.5)).toBe("120.5");
    expect(numberToDec(1e-7)).toBe("0.0000001");
    // An integer beyond 2^53 is not exact as a double: refused, not rounded.
    expect(numberToDec(1.5e21)).toBeNull();
    expect(numberToDec(1.5e-9)).toBe("0.0000000015");
    expect(numberToDec(0)).toBe("0");
    expect(numberToDec(Number.NaN)).toBeNull();
    expect(numberToDec(Number.POSITIVE_INFINITY)).toBeNull();
    expect(numberToDec("1")).toBeNull();
    expect(numericToDec("0.50")).toBe("0.5");
    expect(numericToDec(0.5)).toBe("0.5");
    expect(numericToDec(true)).toBeNull();
  });

  it("compares exactly where floats would not", () => {
    expect(cmpDec("0.1", "0.10")).toBe(0);
    expect(cmpDec("0.30000000000000004", "0.3")).toBe(1);
    expect(cmpDec("0.37", "0.4")).toBe(-1);
    expect(cmpDec("-1", "0")).toBe(-1);
    expect(cmpDec("12345678901234567890.000000001", "12345678901234567890")).toBe(1);
    expect(cmpDec("x", "1")).toBeNull();
    expect(isPositive("0.000001")).toBe(true);
    expect(isPositive("0")).toBe(false);
  });

  it("accepts only prices strictly between 0 and 1", () => {
    expect(isOpenUnitInterval("0.001")).toBe(true);
    expect(isOpenUnitInterval("0.999")).toBe(true);
    expect(isOpenUnitInterval("0")).toBe(false);
    expect(isOpenUnitInterval("1")).toBe(false);
    expect(isOpenUnitInterval("1.01")).toBe(false);
    expect(isOpenUnitInterval("-0.1")).toBe(false);
  });

  it("computes 1 - p exactly", () => {
    expect(oneMinus("0.37")).toBe("0.63");
    expect(oneMinus("0.001")).toBe("0.999");
    expect(oneMinus("0.3799999982")).toBe("0.6200000018");
    expect(oneMinus("1")).toBe("0");
    expect(oneMinus("bad")).toBeNull();
  });
});
