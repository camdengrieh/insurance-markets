import { describe, expect, it } from "vitest";

import { parseDecimalAtomic } from "./amount.js";
import {
  DEC_PATTERN,
  MAX_DECIMALS,
  MAX_DECIMAL_CHARS,
  atomicToDec,
  canonicalDec,
  compareDecimal,
  compareScaled,
  complementOfOne,
  decFromNumber,
  decToAtomic,
  isDec,
  parseAtomicInteger,
  pow10,
  roundDiv,
  splitDecimal,
  type RoundMode,
} from "./decimal.js";
import { decToFixed } from "./fixed.js";
import { parseQty, toDec, type Qty } from "./qty.js";
import { ratFromDec, ratToDecExact } from "./rational.js";

const failureOf = (text: unknown, decimals = 6, allowNegative = false): string => {
  const parsed = decToAtomic(text, decimals, { allowNegative });
  return parsed.ok ? "ok" : parsed.failure;
};

describe("the grammar", () => {
  it("accepts plain decimals and splits them as written", () => {
    expect(splitDecimal("0")).toEqual({ ok: true, value: { negative: false, whole: "0", fraction: "" } });
    expect(splitDecimal("12.50")).toEqual({ ok: true, value: { negative: false, whole: "12", fraction: "50" } });
    expect(splitDecimal("0.000")).toEqual({ ok: true, value: { negative: false, whole: "0", fraction: "000" } });
    expect(splitDecimal("-1.5", { allowNegative: true })).toEqual({ ok: true, value: { negative: true, whole: "1", fraction: "5" } });
  });

  it("refuses leading zeros, a bare or trailing dot, and an empty string", () => {
    for (const bad of ["01", "00", "00.5", "007"]) expect(failureOf(bad), bad).toBe("grammar");
    for (const bad of [".5", "5.", ".", "1.5.", "1..5"]) expect(failureOf(bad), bad).toBe("grammar");
    expect(failureOf("")).toBe("length");
  });

  it("refuses a sign unless asked, and a plus sign always", () => {
    expect(failureOf("-1")).toBe("sign");
    expect(failureOf("-0")).toBe("sign");
    expect(failureOf("-1", 6, true)).toBe("ok");
    expect(decToAtomic("-0.00", 6, { allowNegative: true })).toEqual({ ok: true, value: 0n });
    for (const bad of ["+1", "--1", "-", "1-", "- 1"]) expect(failureOf(bad, 6, true), bad).toBe("grammar");
  });

  it("refuses exponents, hex, separators, spaces, words and non-ASCII digits", () => {
    for (const bad of ["1e3", "1E3", "1e-3", "5e-1", "0x10", "0b1", "1,000", "1_000", "1 000", " 1", "1 ", "1\n", "NaN", "Infinity", "\u{ff11}", "\u{663}", `0.5${String.fromCodePoint(0)}`]) {
      expect(failureOf(bad), JSON.stringify(bad)).toBe("grammar");
    }
  });

  it("refuses non-strings", () => {
    for (const bad of [1, 0.5, 1n, null, undefined, {}, [], true, Number.NaN]) expect(failureOf(bad), String(bad)).toBe("not_text");
  });

  it("caps the length at 40 characters", () => {
    expect(MAX_DECIMAL_CHARS).toBe(40);
    expect(failureOf("9".repeat(40), 0)).toBe("ok");
    expect(failureOf("9".repeat(41), 0)).toBe("length");
    expect(failureOf(`0.${"1".repeat(38)}`, MAX_DECIMALS)).toBe("precision");
    expect(failureOf(`0.${"1".repeat(36)}`, MAX_DECIMALS)).toBe("ok");
    expect(failureOf("1".repeat(100_000), 6)).toBe("length");
  });

  it("isDec is the non-negative grammar with an optional place limit, and DEC_PATTERN agrees with it", () => {
    for (const ok of ["0", "0.1", "12", "12.345", "0.000"]) {
      expect(isDec(ok), ok).toBe(true);
      expect(DEC_PATTERN.test(ok), ok).toBe(true);
    }
    for (const bad of ["", ".5", "5.", "01", "1e3", "-1", "0x1", " 1", "NaN"]) {
      expect(isDec(bad), bad).toBe(false);
      expect(DEC_PATTERN.test(bad), bad).toBe(false);
    }
    expect(isDec("0.123", 3)).toBe(true);
    expect(isDec("0.1230", 3)).toBe(false);
    expect(isDec(5)).toBe(false);
  });
});

describe("base-unit conversion", () => {
  it("converts exactly at N decimals", () => {
    expect(decToAtomic("12.5", 6)).toEqual({ ok: true, value: 12_500_000n });
    expect(decToAtomic("0.000001", 6)).toEqual({ ok: true, value: 1n });
    expect(decToAtomic("9007199254740993", 6)).toEqual({ ok: true, value: 9_007_199_254_740_993_000_000n });
    expect(decToAtomic("4.35", 2)).toEqual({ ok: true, value: 435n });
    expect(decToAtomic("15", 0)).toEqual({ ok: true, value: 15n });
  });

  it("counts trailing zeros as places and never rounds", () => {
    expect(failureOf("0.1234567")).toBe("precision");
    expect(failureOf("0.1234560")).toBe("precision");
    expect(failureOf("5.0", 0)).toBe("precision");
    expect(failureOf("0.123456")).toBe("ok");
  });

  it("takes 0 to 36 decimals and nothing else", () => {
    expect(decToAtomic("1", MAX_DECIMALS)).toEqual({ ok: true, value: pow10(36) });
    for (const bad of [-1, 37, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(failureOf("1", bad), String(bad)).toBe("decimals");
  });

  it("parses integer strings with the same grammar", () => {
    expect(parseAtomicInteger("670000")).toBe(670_000n);
    expect(parseAtomicInteger("0")).toBe(0n);
    for (const bad of ["0.5", "1.0", "-1", "01", "", "1e6", 670000, null]) expect(parseAtomicInteger(bad), String(bad)).toBeNull();
    expect(parseAtomicInteger("1".repeat(41))).toBeNull();
  });

  it("formats back without trailing zeros and keeps the sign", () => {
    expect(atomicToDec(12_500_000n, 6)).toBe("12.5");
    expect(atomicToDec(10_000_000n, 6)).toBe("10");
    expect(atomicToDec(0n, 6)).toBe("0");
    expect(atomicToDec(-1n, 6)).toBe("-0.000001");
    expect(atomicToDec(7n, 0)).toBe("7");
    // Formatting has no upper bound on places: an exact rational product can carry more than any parser accepts.
    expect(atomicToDec(1n, 54)).toBe(`0.${"0".repeat(53)}1`);
  });

  it("round-trips through text at every scale it accepts", () => {
    for (const text of ["0", "1", "0.000001", "99.99", "100", "123456.654321", "-2.5"]) {
      const parsed = decToAtomic(text, 6, { allowNegative: true });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(atomicToDec(parsed.value, 6)).toBe(text);
    }
    const tiny = `0.${"0".repeat(35)}1`;
    const parsed = decToAtomic(tiny, MAX_DECIMALS);
    expect(parsed).toEqual({ ok: true, value: 1n });
    expect(atomicToDec(1n, MAX_DECIMALS)).toBe(tiny);
  });

  it("canonicalises without changing the value", () => {
    expect(canonicalDec("629.0")).toBe("629");
    expect(canonicalDec("0.50")).toBe("0.5");
    expect(canonicalDec("0.000")).toBe("0");
    expect(canonicalDec("-0.00", { allowNegative: true })).toBe("0");
    expect(canonicalDec("-1.50", { allowNegative: true })).toBe("-1.5");
    expect(canonicalDec("01")).toBeNull();
  });
});

describe("every money module reads text through the same parser", () => {
  const corpus = ["0", "1", "12.5", "0.000001", "0.1234567", "0.1234560", "10.000000", "01", ".5", "5.", "", "-1", "1e3", "9".repeat(40), "9".repeat(41)];

  it("amount, fixed, rational, qty and the core accept the same strings with the same value", () => {
    for (const text of corpus) {
      const core = decToAtomic(text, 6);
      const amount = parseDecimalAtomic(text, 6);
      const fixed = decToFixed(text, 6);
      const qty = parseQty("usd", text, { maxScale: 6 });
      expect(amount.ok, text).toBe(core.ok);
      expect(fixed.ok, text).toBe(core.ok);
      expect(qty !== null, text).toBe(core.ok);
      if (core.ok && amount.ok && fixed.ok && qty !== null) {
        expect(amount.value, text).toBe(core.value);
        expect(fixed.value.units, text).toBe(core.value);
        expect(toDec(qty as Qty), text).toBe(atomicToDec(core.value, 6));
      }
    }
  });

  it("rational reads up to 18 places through the same grammar", () => {
    const parsed = ratFromDec("0.123456789012345678");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(ratToDecExact(parsed.value)).toBe("0.123456789012345678");
    expect(ratFromDec("0.1234567890123456789").ok).toBe(false);
    expect(ratFromDec("1.50").ok).toBe(true);
    expect(ratFromDec("-1").ok).toBe(false);
  });
});

describe("comparison", () => {
  it("compares across scales exactly", () => {
    expect(compareScaled(5n, 1, 50n, 2)).toBe(0);
    expect(compareScaled(1n, 0, 999_999n, 6)).toBe(1);
    expect(compareScaled(-1n, 0, 0n, 3)).toBe(-1);
  });

  it("compares decimal text, and refuses anything that is not the grammar", () => {
    expect(compareDecimal("0.5", "0.50")).toBe(0);
    expect(compareDecimal("0.869", "0.86901")).toBe(-1);
    expect(compareDecimal("10", "9.99999")).toBe(1);
    expect(compareDecimal("0.1", "0.09999999999999999999")).toBe(1);
    expect(compareDecimal("-1", "0")).toBeNull();
    expect(compareDecimal("-1", "0", { allowNegative: true })).toBe(-1);
    expect(compareDecimal("x", "1")).toBeNull();
  });

  it("takes 1 - p for p in [0, 1] only", () => {
    expect(complementOfOne("0.466571")).toBe("0.533429");
    expect(complementOfOne("0")).toBe("1");
    expect(complementOfOne("1")).toBe("0");
    expect(complementOfOne("1.000")).toBe("0");
    expect(complementOfOne("1.5")).toBeNull();
    expect(complementOfOne("-0.5")).toBeNull();
    expect(complementOfOne("abc")).toBeNull();
  });
});

describe("rounding", () => {
  const table: ReadonlyArray<readonly [bigint, bigint, Readonly<Record<RoundMode, bigint>>]> = [
    [7n, 2n, { floor: 3n, ceil: 4n, trunc: 3n, half_up: 4n, half_even: 4n }],
    [5n, 2n, { floor: 2n, ceil: 3n, trunc: 2n, half_up: 3n, half_even: 2n }],
    [-5n, 2n, { floor: -3n, ceil: -2n, trunc: -2n, half_up: -3n, half_even: -2n }],
    [-7n, 3n, { floor: -3n, ceil: -2n, trunc: -2n, half_up: -2n, half_even: -2n }],
    [8n, 3n, { floor: 2n, ceil: 3n, trunc: 2n, half_up: 3n, half_even: 3n }],
    [6n, 3n, { floor: 2n, ceil: 2n, trunc: 2n, half_up: 2n, half_even: 2n }],
    [0n, 9n, { floor: 0n, ceil: 0n, trunc: 0n, half_up: 0n, half_even: 0n }],
  ];

  it("divides in every stated direction", () => {
    for (const [n, d, expected] of table) {
      for (const mode of Object.keys(expected) as RoundMode[]) expect(roundDiv(n, d, mode), `${n}/${d} ${mode}`).toBe(expected[mode]);
    }
  });

  it("refuses a zero or negative denominator", () => {
    expect(() => roundDiv(1n, 0n, "ceil")).toThrow(RangeError);
    expect(() => roundDiv(1n, -1n, "ceil")).toThrow(RangeError);
  });

  it("is the ceil every fee bound uses: never under the exact value", () => {
    for (let n = 0n; n < 50n; n += 1n) {
      const q = roundDiv(n, 7n, "ceil");
      expect(q * 7n >= n && (q - 1n) * 7n < n).toBe(true);
    }
  });
});

describe("JSON numbers", () => {
  it("turns a double into the text the sender wrote", () => {
    expect(decFromNumber(0.07)).toBe("0.07");
    expect(decFromNumber(1e-7)).toBe("0.0000001");
    expect(decFromNumber(1.5e-7)).toBe("0.00000015");
    expect(decFromNumber(-2.5)).toBe("-2.5");
    expect(decFromNumber(62)).toBe("62");
    expect(decFromNumber(-0)).toBe("0");
  });

  it("refuses what it cannot say exactly", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 1e21, 1e-31, "0.5", null]) expect(decFromNumber(bad), String(bad)).toBeNull();
  });
});
