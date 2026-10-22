import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  feeUpperBoundMicro,
  formatMicro,
  isTokenId,
  midpointMicro,
  normalizeAddress,
  normalizeBareAddress,
  normalizeConditionId,
  parseDecimalToMicro,
  parseVenueDecimalToMicro,
  parseMicroInteger,
} from "../src/xo/units.js";

describe("parseDecimalToMicro", () => {
  it("parses exactly, including the 6-decimal book sizes seen live", () => {
    assert.equal(parseDecimalToMicro("0.534"), 534_000n);
    assert.equal(parseDecimalToMicro("1271.980687"), 1_271_980_687n);
    assert.equal(parseDecimalToMicro("20.317466"), 20_317_466n);
    assert.equal(parseDecimalToMicro("1000"), 1_000_000_000n);
    assert.equal(parseDecimalToMicro("0.000"), 0n);
    assert.equal(parseDecimalToMicro("0.000001"), 1n);
    // 0.1 + 0.2 style sums are exact in micro units.
    assert.equal(parseDecimalToMicro("0.1")! + parseDecimalToMicro("0.2")!, parseDecimalToMicro("0.3"));
  });

  it("is exact where floating point is not", () => {
    // 4.35 * 100 is 434.99999999999994 as a double.
    assert.equal(parseDecimalToMicro("4.35"), 4_350_000n);
    assert.equal(parseDecimalToMicro("9007199254740993"), 9_007_199_254_740_993_000_000n);
  });

  it("counts trailing zeros as places, so seven places is refused even when the extra digit is 0", () => {
    assert.equal(parseDecimalToMicro("0.5340000"), null);
    assert.equal(parseDecimalToMicro("0.534000"), 534_000n);
  });

  it("drops exact zero padding in an API payload value, but still refuses a real seventh place", () => {
    assert.equal(parseVenueDecimalToMicro("0.5340000"), 534_000n);
    assert.equal(parseVenueDecimalToMicro("12.500000000000000000"), 12_500_000n);
    assert.equal(parseVenueDecimalToMicro("0.5340001"), null);
    assert.equal(parseVenueDecimalToMicro("-0.5"), null);
    assert.equal(parseVenueDecimalToMicro("05"), null);
  });

  it("rejects more than 6 real decimals instead of rounding", () => {
    assert.equal(parseDecimalToMicro("0.5340001"), null);
    assert.equal(parseDecimalToMicro("1.0000001"), null);
  });

  it("rejects every malformed shape", () => {
    for (const bad of ["", " ", "1 ", " 1", "-1", "+1", "1e3", "1E3", "0x10", ".5", "5.", "00.5", "01", "1,000", "1_000", "NaN", "Infinity", "0.5\n", "１"]) {
      assert.equal(parseDecimalToMicro(bad), null, JSON.stringify(bad));
    }
    for (const bad of [undefined, null, 1, 0.5, {}, [], true]) assert.equal(parseDecimalToMicro(bad), null);
    assert.equal(parseDecimalToMicro("1".repeat(41)), null);
  });

  it("honours a smaller maxDecimals", () => {
    assert.equal(parseDecimalToMicro("0.12", 2), 120_000n);
    assert.equal(parseDecimalToMicro("0.123", 2), null);
    assert.equal(parseDecimalToMicro("0.1", 7), null);
  });
});

describe("parseMicroInteger", () => {
  it("parses Data API micro-unit prices", () => {
    assert.equal(parseMicroInteger("670000"), 670_000n);
    assert.equal(parseMicroInteger("500000"), 500_000n);
    assert.equal(parseMicroInteger("0"), 0n);
    assert.equal(parseMicroInteger("5240253130274"), 5_240_253_130_274n);
  });

  it("rejects decimals, signs, exponents and non-strings", () => {
    for (const bad of ["0.55", "-1", "+1", "1e6", "01", "", "1 ", "0x1f", "6.7e5"]) assert.equal(parseMicroInteger(bad), null, bad);
    for (const bad of [670000, null, undefined, 1n, {}]) assert.equal(parseMicroInteger(bad), null);
  });
});

describe("formatMicro", () => {
  it("round-trips with the parsers", () => {
    for (const text of ["0", "0.001", "0.534", "1", "12.5", "1271.980687", "0.000001", "999999.999999"]) {
      assert.equal(formatMicro(parseDecimalToMicro(text)!), text);
    }
  });

  it("trims trailing zeros and handles negatives", () => {
    assert.equal(formatMicro(500_000n), "0.5");
    assert.equal(formatMicro(1_000_000n), "1");
    assert.equal(formatMicro(0n), "0");
    assert.equal(formatMicro(-1_500_000n), "-1.5");
    assert.equal(formatMicro(-1n), "-0.000001");
  });

  it("round-trips pseudo-random values", () => {
    let seed = 12345n;
    for (let i = 0; i < 500; i += 1) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 64n);
      const value = seed % 10n ** 15n;
      assert.equal(parseDecimalToMicro(formatMicro(value)), value);
    }
  });
});

describe("midpointMicro", () => {
  it("is exact on tick-aligned prices", () => {
    assert.equal(midpointMicro(105_000n, 135_000n), 120_000n);
    assert.equal(midpointMicro(1_000n, 999_000n), 500_000n);
  });
});

describe("feeUpperBoundMicro", () => {
  it("matches the documented curve", () => {
    // 100 shares at 0.50 with 400 bps: 100 * 0.04 * 0.25 = 1.00 USDC.
    assert.equal(feeUpperBoundMicro(100_000_000n, 500_000n, 400), 1_000_000n);
    assert.equal(feeUpperBoundMicro(100_000_000n, 500_000n, 0), 0n);
  });

  it("rounds up, never down", () => {
    // 1 share at 0.001 with 400 bps is 39.96 micro-USDC, so 40, not 39.
    assert.equal(feeUpperBoundMicro(1_000_000n, 1_000n, 400), 40n);
  });

  it("rejects out-of-range inputs", () => {
    assert.throws(() => feeUpperBoundMicro(-1n, 500_000n, 400), RangeError);
    assert.throws(() => feeUpperBoundMicro(1n, 1_000_001n, 400), RangeError);
    assert.throws(() => feeUpperBoundMicro(1n, 500_000n, 10_001), RangeError);
    assert.throws(() => feeUpperBoundMicro(1n, 500_000n, 1.5), RangeError);
  });
});

describe("identifier validators", () => {
  const cid = `0x${"ab".repeat(32)}`;
  const addr = `0x${"Cc".repeat(20)}`;

  it("normalizes valid ids to lowercase", () => {
    assert.equal(normalizeConditionId(cid.toUpperCase().replace("0X", "0x")), cid);
    assert.equal(normalizeAddress(addr), addr.toLowerCase());
    assert.equal(normalizeBareAddress("Cc".repeat(20)), addr.toLowerCase());
  });

  it("rejects malformed ids", () => {
    assert.equal(normalizeConditionId("0x1234"), null);
    assert.equal(normalizeConditionId(`${cid}00`), null);
    assert.equal(normalizeConditionId(`0x${"zz".repeat(32)}`), null);
    assert.equal(normalizeAddress("0x1234"), null);
    assert.equal(normalizeAddress(`${addr}\n`), null);
    assert.equal(normalizeAddress(`${addr}/../x`), null);
    assert.equal(normalizeBareAddress(addr), null);
    assert.equal(normalizeAddress(undefined), null);
  });

  it("accepts decimal token ids only", () => {
    assert.equal(isTokenId("1"), true);
    assert.equal(isTokenId("42354992342168343237406153717649127110110175778428379760615491859902975634862"), true);
    for (const bad of ["", "0", "01", "-1", "1.5", "0x10", "abc", "1 ", "1\n", "9".repeat(79), "1/../2", "1&side=BUY"]) {
      assert.equal(isTokenId(bad), false, bad);
    }
    assert.equal(isTokenId(5), false);
  });
});
