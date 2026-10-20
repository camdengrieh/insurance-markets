import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAtomic, parseDecimalAtomic, parsePriceTicks } from "../src/guardrails/amount.js";

describe("parseDecimalAtomic", () => {
  it("parses plain decimals exactly", () => {
    const cases: ReadonlyArray<readonly [string, bigint]> = [
      ["0", 0n],
      ["10", 10_000_000n],
      ["12.5", 12_500_000n],
      ["0.000001", 1n],
      ["0.1", 100_000n],
      ["123456789.123456", 123_456_789_123_456n],
      ["10.000000", 10_000_000n],
    ];
    for (const [input, expected] of cases) {
      assert.deepEqual(parseDecimalAtomic(input, 6), { ok: true, value: expected }, input);
    }
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 style traps: the integer result is exact.
    assert.deepEqual(parseDecimalAtomic("0.3", 6), { ok: true, value: 300_000n });
    assert.deepEqual(parseDecimalAtomic("9007199254740993", 6), { ok: true, value: 9_007_199_254_740_993_000_000n });
  });

  it("rejects NaN, infinity, negatives, signs, hex and scientific notation", () => {
    for (const bad of ["NaN", "nan", "Infinity", "-Infinity", "-1", "-0", "+1", "0x10", "0X10", "0b1", "1e6", "1E6", "1e-3", "1e+3"]) {
      const result = parseDecimalAtomic(bad, 6);
      assert.equal(result.ok, false, bad);
    }
  });

  it("rejects malformed shapes, separators, whitespace and trailing newlines", () => {
    for (const bad of ["", " ", " 1", "1 ", "1\n", "\n1", "1\t", ".5", "5.", ".", "01", "00", "1.5.2", "1,000", "1_000", "1 000", "$1", "1usd", "1.", "--1"]) {
      assert.equal(parseDecimalAtomic(bad, 6).ok, false, JSON.stringify(bad));
    }
  });

  it("rejects non-ASCII digits that look like numbers", () => {
    for (const bad of ["\u{ff11}\u{ff10}", "\u{661}\u{662}", "1\u{2024}5", "1\u{ff0e}5"]) {
      assert.equal(parseDecimalAtomic(bad, 6).ok, false, JSON.stringify(bad));
    }
  });

  it("rejects more precision than the token has instead of rounding", () => {
    assert.equal(parseDecimalAtomic("0.0000001", 6).ok, false);
    assert.equal(parseDecimalAtomic("1.1234567", 6).ok, false);
    assert.equal(parseDecimalAtomic("1.5", 0).ok, false);
    assert.deepEqual(parseDecimalAtomic("15", 0), { ok: true, value: 15n });
  });

  it("rejects overlong input and non-strings", () => {
    assert.equal(parseDecimalAtomic("9".repeat(41), 6).ok, false);
    assert.equal(parseDecimalAtomic("9".repeat(40), 6).ok, true);
    for (const bad of [10, 10n, null, undefined, {}, [], true, Number.NaN]) {
      assert.equal(parseDecimalAtomic(bad, 6).ok, false, String(bad));
    }
  });

  it("rejects an unsupported precision", () => {
    for (const bad of [-1, 19, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(parseDecimalAtomic("1", bad).ok, false, String(bad));
    }
  });

  it("never echoes the rejected input in the reason", () => {
    const result = parseDecimalAtomic("sk_live_SECRET_VALUE", 6);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && !result.reason.includes("SECRET"));
  });
});

describe("formatAtomic", () => {
  it("formats without trailing zeros", () => {
    assert.equal(formatAtomic(10_000_000n, 6), "10");
    assert.equal(formatAtomic(10_000_001n, 6), "10.000001");
    assert.equal(formatAtomic(500_000n, 6), "0.5");
    assert.equal(formatAtomic(0n, 6), "0");
    assert.equal(formatAtomic(-1_500_000n, 6), "-1.5");
    assert.equal(formatAtomic(7n, 0), "7");
  });

  it("round-trips through parseDecimalAtomic", () => {
    for (const text of ["0", "1", "0.000001", "99.99", "100", "123456.654321"]) {
      const parsed = parseDecimalAtomic(text, 6);
      assert.ok(parsed.ok);
      if (parsed.ok) assert.equal(formatAtomic(parsed.value, 6), text);
    }
  });
});

describe("parsePriceTicks", () => {
  it("maps decimal prices to integer ticks of 0.001", () => {
    assert.deepEqual(parsePriceTicks("0.55"), { ok: true, value: 550 });
    assert.deepEqual(parsePriceTicks("0.001"), { ok: true, value: 1 });
    assert.deepEqual(parsePriceTicks("0.999"), { ok: true, value: 999 });
    assert.deepEqual(parsePriceTicks("0.5"), { ok: true, value: 500 });
    assert.deepEqual(parsePriceTicks("1"), { ok: true, value: 1000 });
  });

  it("rejects off-tick, out-of-range and malformed prices", () => {
    for (const bad of ["0.0005", "0.5501", "1.001", "2", "-0.5", "0x1", "5e-1", "NaN", "", ".5", 0.55, null]) {
      assert.equal(parsePriceTicks(bad).ok, false, String(bad));
    }
  });
});
