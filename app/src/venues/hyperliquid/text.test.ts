import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonDec, complementOfOne, compareDec, isDec, numberToDec } from "./decimal";
import { boundText, cleanBlock, cleanLine, normalizeForHash, sha256Hex } from "./text";

describe("sha256Hex", () => {
  const samples = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "a".repeat(1000), "café \u{1f600} 中文"];
  it.each(samples)("matches node:crypto for %#", (text) => {
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });
});

describe("decimal helpers", () => {
  it("canonicalises without losing value", () => {
    expect(canonDec("629.0")).toBe("629");
    expect(canonDec("0.50")).toBe("0.5");
    expect(canonDec("0.000")).toBe("0");
    expect(canonDec("10")).toBe("10");
    expect(() => canonDec("1e3")).toThrow();
    expect(() => canonDec("-1")).toThrow();
    expect(() => canonDec("")).toThrow();
  });
  it("accepts only plain non-negative decimals", () => {
    for (const ok of ["0", "0.1", "12", "12.345"]) expect(isDec(ok)).toBe(true);
    for (const bad of ["", ".5", "5.", "01", "1e3", "-1", "0x1", " 1", "NaN"]) expect(isDec(bad)).toBe(false);
  });
  it("turns a JSON number into a decimal string, or null", () => {
    expect(numberToDec(0.4665705492417914, 6)).toBe("0.466571");
    expect(numberToDec(1.2044870082855885, 2)).toBe("1.2");
    expect(numberToDec(0, 6)).toBe("0");
    expect(numberToDec(Number.NaN, 6)).toBeNull();
    expect(numberToDec(Number.POSITIVE_INFINITY, 6)).toBeNull();
    expect(numberToDec(-0.1, 6)).toBeNull();
    expect(numberToDec(1e21, 2)).toBeNull();
  });
  it("compares exactly where a float would not", () => {
    expect(compareDec("0.869", "0.86901")).toBeLessThan(0);
    expect(compareDec("0.5", "0.50")).toBe(0);
    expect(compareDec("10", "9.99999")).toBeGreaterThan(0);
    expect(compareDec("0.1", "0.09999999999999999999")).toBeGreaterThan(0);
  });
  it("takes the complement of one exactly", () => {
    expect(complementOfOne("0.466571")).toBe("0.533429");
    expect(complementOfOne("0")).toBe("1");
    expect(complementOfOne("1")).toBe("0");
    expect(complementOfOne("0.86899")).toBe("0.13101");
    expect(complementOfOne("1.5")).toBeNull();
    expect(complementOfOne("abc")).toBeNull();
  });
});

describe("text bounds", () => {
  it("removes directional and control characters but leaves markup characters as plain text", () => {
    const hostile = "a\u202eb\u0007c\u200bd <img src=x onerror=alert(1)>";
    expect(cleanLine(hostile, 100)).toBe("abcd <img src=x onerror=alert(1)>");
  });
  it("cuts on code points, never inside a surrogate pair", () => {
    expect(boundText("\u{1f600}\u{1f600}\u{1f600}", 2)).toBe("\u{1f600}\u{1f600}\u2026");
    expect(boundText("abc", 3)).toBe("abc");
  });
  it("collapses whitespace in a line and keeps line breaks in a block", () => {
    expect(cleanLine("  a \n\t b  ", 50)).toBe("a b");
    expect(cleanBlock("line one  \nline two", 50)).toBe("line one\nline two");
  });
  it("hashes normalised text, so width variants and spacing do not change the hash", () => {
    expect(normalizeForHash("\uff21  b\n c")).toBe("A b c");
    expect(sha256Hex(normalizeForHash("Rules\n\nhere"))).toBe(sha256Hex(normalizeForHash("Rules here")));
  });
});
