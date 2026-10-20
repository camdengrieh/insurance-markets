import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SigningError,
  DEFAULT_AMOUNT_CONSTRAINTS,
  DEFAULT_MAX_TTL_SECONDS,
  DEFAULT_ORDER_TTL_SECONDS,
  MIN_REMAINING_TTL_SECONDS,
  NO_AMOUNT_CONSTRAINTS,
  ORDER_CAP_FEE_BPS,
  ORDER_FEE_BOUND_BPS,
  SEED_CAP_ATOMIC,
  SEED_STAKE_ATOMIC,
  assertGtdExpiration,
  assertRemainingTtl,
  computeOrderAmounts,
  decodeOrderAmounts,
  defaultGtdExpiration,
  exactShareStepMicro,
  formatMicro,
  formatTick,
  gtdExpirationFromTtl,
  maxBuyFee,
  maxBuyOutlay,
  minSellProceeds,
  orderCapAmount,
  parsePriceToTick,
  parseSharesToMicro,
  resolveAmountConstraints,
  wholeSeconds,
  type SigningErrorCode,
} from "../src/xo/signing/index.js";

function rejects(fn: () => unknown, code: SigningErrorCode): void {
  assert.throws(fn, (error: unknown) => error instanceof SigningError && error.code === code, `expected ${code}`);
}

describe("price to tick [07 s3 test 2]", () => {
  it("maps decimal prices to integer ticks over 1000", () => {
    assert.equal(parsePriceToTick("0.5"), 500);
    assert.equal(parsePriceToTick("0.500"), 500);
    assert.equal(parsePriceToTick("0.001"), 1);
    assert.equal(parsePriceToTick("0.999"), 999);
    assert.equal(parsePriceToTick("0.123"), 123);
  });

  it("rejects off-tick prices", () => {
    rejects(() => parsePriceToTick("0.5005"), "invalid_price");
    rejects(() => parsePriceToTick("0.0005"), "invalid_price");
    rejects(() => parsePriceToTick("0.1234"), "invalid_price");
  });

  it("rejects 0, 1 and anything outside (0, 1)", () => {
    for (const bad of ["0", "1", "0.000", "1.000", "1.5", "2", "10"]) rejects(() => parsePriceToTick(bad), "invalid_price");
  });

  it("rejects numbers, signs, exponents, hex, spaces and empty input", () => {
    for (const bad of [0.5, "", ".5", "+0.5", "-0.5", "5e-1", "0x10", " 0.5", "0.5 ", "0,5", "00.5", "NaN", "Infinity", null, undefined]) {
      rejects(() => parsePriceToTick(bad), "invalid_price");
    }
  });

  it("rejects absurdly long input", () => {
    rejects(() => parsePriceToTick(`0.${"1".repeat(200)}`), "invalid_price");
  });
});

describe("shares to micro-shares", () => {
  it("parses up to 6 decimals exactly", () => {
    assert.equal(parseSharesToMicro("1"), 1_000_000n);
    assert.equal(parseSharesToMicro("0.000001"), 1n);
    assert.equal(parseSharesToMicro("12.345678"), 12_345_678n);
    assert.equal(parseSharesToMicro("100.50"), 100_500_000n);
    assert.equal(parseSharesToMicro("7"), 7_000_000n);
  });

  it("rejects zero, more than 6 decimals, negatives and non-strings", () => {
    rejects(() => parseSharesToMicro("0"), "invalid_size");
    rejects(() => parseSharesToMicro("0.000000"), "invalid_size");
    rejects(() => parseSharesToMicro("0.0000001"), "invalid_size");
    rejects(() => parseSharesToMicro("-1"), "invalid_size");
    rejects(() => parseSharesToMicro("1e6"), "invalid_size");
    rejects(() => parseSharesToMicro(5), "invalid_size");
    rejects(() => parseSharesToMicro(""), "invalid_size");
  });
});

describe("computeOrderAmounts", () => {
  it("BUY: maker is collateral, taker is shares [07 s3 test 1]", () => {
    const a = computeOrderAmounts({ side: 0, price: "0.55", shares: "100" });
    assert.equal(a.makerAmount, 55_000_000n);
    assert.equal(a.takerAmount, 100_000_000n);
    assert.equal(a.priceTick, 550);
    assert.equal(a.collateralMicro, 55_000_000n);
    assert.equal(a.sharesMicro, 100_000_000n);
  });

  it("SELL: maker is shares, taker is collateral [07 s3 test 1]", () => {
    const a = computeOrderAmounts({ side: 1, price: "0.123", shares: "7" });
    assert.equal(a.makerAmount, 7_000_000n);
    assert.equal(a.takerAmount, 861_000n);
  });

  it("is exact for fractional shares when the product divides by 1000", () => {
    // The pure arithmetic, so the default floors are switched off for this one.
    const a = computeOrderAmounts({ side: 0, price: "0.5", shares: "0.000002", constraints: NO_AMOUNT_CONSTRAINTS });
    assert.equal(a.takerAmount, 2n);
    assert.equal(a.makerAmount, 1n);
  });

  it("rejects an inexact product instead of rounding it", () => {
    // 1 micro-share at 0.5 would need half a micro-USDC
    rejects(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "0.000001" }), "inexact_amount");
    rejects(() => computeOrderAmounts({ side: 1, price: "0.123", shares: "0.0005" }), "inexact_amount");
    rejects(() => computeOrderAmounts({ side: 0, price: "0.333", shares: "0.000001" }), "inexact_amount");
  });

  it("reports the share step in the error message", () => {
    assert.throws(
      () => computeOrderAmounts({ side: 0, price: "0.123", shares: "0.0005" }),
      (error: unknown) => error instanceof SigningError && error.message.includes("0.001"),
    );
  });

  it("rejects an invalid side, price or size", () => {
    rejects(() => computeOrderAmounts({ side: 2 as 0, price: "0.5", shares: "1" }), "invalid_order");
    rejects(() => computeOrderAmounts({ side: 0, price: "1", shares: "1" }), "invalid_price");
    rejects(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "0" }), "invalid_size");
  });

  it("enforces caller-supplied minimums and steps on top of the defaults", () => {
    const plain = computeOrderAmounts({ side: 0, price: "0.5", shares: "1" });
    assert.equal(plain.takerAmount, 1_000_000n);
    rejects(
      () => computeOrderAmounts({ side: 0, price: "0.5", shares: "1", constraints: { minSharesMicro: 5_000_000n } }),
      "below_minimum",
    );
    rejects(
      () => computeOrderAmounts({ side: 0, price: "0.5", shares: "1", constraints: { minCollateralMicro: 10_000_000n } }),
      "below_minimum",
    );
    rejects(
      () => computeOrderAmounts({ side: 0, price: "0.5", shares: "1.5", constraints: { shareStepMicro: 1_000_000n } }),
      "invalid_size",
    );
    rejects(
      () => computeOrderAmounts({ side: 0, price: "0.5", shares: "1", constraints: { shareStepMicro: 0n } }),
      "invalid_size",
    );
    assert.doesNotThrow(() =>
      computeOrderAmounts({
        side: 0,
        price: "0.5",
        shares: "5",
        constraints: { minSharesMicro: 5_000_000n, minCollateralMicro: 2_500_000n, shareStepMicro: 1_000_000n },
      }),
    );
  });

  it("applies the default floors when the caller names none: step 0.001 share, 1 share, $0.30 (delta 5.8)", () => {
    assert.deepEqual(DEFAULT_AMOUNT_CONSTRAINTS, { minSharesMicro: 1_000_000n, minCollateralMicro: 300_000n, shareStepMicro: 1_000n });
    // at the floors: 1 share at 0.30 is exactly $0.30
    const atFloor = computeOrderAmounts({ side: 0, price: "0.3", shares: "1" });
    assert.equal(atFloor.collateralMicro, 300_000n);
    // below the share minimum, below the notional minimum, off the 0.001 step
    rejects(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "0.999" }), "below_minimum");
    rejects(() => computeOrderAmounts({ side: 0, price: "0.299", shares: "1" }), "below_minimum");
    rejects(() => computeOrderAmounts({ side: 1, price: "0.001", shares: "100" }), "below_minimum");
    rejects(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "1.0005" }), "invalid_size");
    rejects(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "1.0001" }), "invalid_size");
    assert.doesNotThrow(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "1.001" }));
  });

  it("a caller who names one floor keeps the defaults for the others; a value that cannot bind switches one off", () => {
    assert.deepEqual(resolveAmountConstraints(), DEFAULT_AMOUNT_CONSTRAINTS);
    assert.deepEqual(resolveAmountConstraints({ minSharesMicro: 5_000_000n }), {
      minSharesMicro: 5_000_000n,
      minCollateralMicro: 300_000n,
      shareStepMicro: 1_000n,
    });
    assert.deepEqual(resolveAmountConstraints({ minCollateralMicro: undefined }), DEFAULT_AMOUNT_CONSTRAINTS);
    // naming only a share minimum still leaves the $0.30 floor in force
    rejects(() => computeOrderAmounts({ side: 0, price: "0.001", shares: "100", constraints: { minSharesMicro: 1n } }), "below_minimum");
    assert.doesNotThrow(() => computeOrderAmounts({ side: 0, price: "0.001", shares: "100", constraints: { minCollateralMicro: 0n } }));
    assert.doesNotThrow(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "0.7", constraints: { minSharesMicro: 0n } }));
    assert.doesNotThrow(() => computeOrderAmounts({ side: 0, price: "0.5", shares: "1.0005", constraints: { shareStepMicro: 1n } }));
  });

  it("whole shares are always exact at every tick", () => {
    for (let tick = 1; tick <= 999; tick += 1) {
      const a = computeOrderAmounts({ side: 0, price: formatTick(tick), shares: "3", constraints: NO_AMOUNT_CONSTRAINTS });
      assert.equal(a.collateralMicro * 1000n, 3_000_000n * BigInt(tick));
    }
  });
});

describe("exactShareStepMicro", () => {
  it("is 1000 / gcd(tick, 1000) micro-shares", () => {
    assert.equal(exactShareStepMicro(500), 2n);
    assert.equal(exactShareStepMicro(550), 20n);
    assert.equal(exactShareStepMicro(123), 1000n);
    assert.equal(exactShareStepMicro(1), 1000n);
    assert.equal(exactShareStepMicro(999), 1000n);
    assert.equal(exactShareStepMicro(250), 4n);
  });

  it("a size at exactly the step is accepted and one micro-share below is not", () => {
    for (const tick of [1, 7, 125, 250, 333, 500, 550, 999]) {
      const step = exactShareStepMicro(tick);
      const price = formatTick(tick);
      const pure = { constraints: NO_AMOUNT_CONSTRAINTS };
      assert.doesNotThrow(() => computeOrderAmounts({ side: 0, price, shares: formatMicro(step), ...pure }), `tick ${tick}`);
      if (step > 1n) {
        rejects(() => computeOrderAmounts({ side: 0, price, shares: formatMicro(step - 1n), ...pure }), "inexact_amount");
      }
    }
  });

  it("rejects ticks outside 1..999", () => {
    for (const bad of [0, 1000, -1, 1.5, Number.NaN]) rejects(() => exactShareStepMicro(bad), "invalid_price");
  });
});

describe("decodeOrderAmounts", () => {
  it("inverts computeOrderAmounts for both sides", () => {
    for (const side of [0, 1] as const) {
      const a = computeOrderAmounts({ side, price: "0.37", shares: "12.5" });
      const d = decodeOrderAmounts({ side, makerAmount: a.makerAmount, takerAmount: a.takerAmount });
      assert.equal(d.priceTick, 370);
      assert.equal(d.sharesMicro, 12_500_000n);
      assert.equal(d.collateralMicro, a.collateralMicro);
    }
  });

  it("rejects amounts that are not an exact tick or are outside the price range", () => {
    rejects(() => decodeOrderAmounts({ side: 0, makerAmount: 1_234_567n, takerAmount: 3_000_000n }), "invalid_price");
    rejects(() => decodeOrderAmounts({ side: 0, makerAmount: 10_000_000n, takerAmount: 10_000_000n }), "invalid_price");
    rejects(() => decodeOrderAmounts({ side: 0, makerAmount: 1n, takerAmount: 10_000_000n }), "invalid_price");
    rejects(() => decodeOrderAmounts({ side: 0, makerAmount: 0n, takerAmount: 1n }), "invalid_order");
    rejects(() => decodeOrderAmounts({ side: 2 as 0, makerAmount: 1n, takerAmount: 1n }), "invalid_order");
  });
});

describe("format helpers", () => {
  it("format canonical decimals with trailing zeros trimmed", () => {
    assert.equal(formatTick(550), "0.55");
    assert.equal(formatTick(1), "0.001");
    assert.equal(formatTick(999), "0.999");
    assert.equal(formatMicro(1_000_000n), "1");
    assert.equal(formatMicro(1_500_000n), "1.5");
    assert.equal(formatMicro(1n), "0.000001");
    assert.equal(formatMicro(0n), "0");
    rejects(() => formatMicro(-1n), "invalid_integer");
  });
});

describe("GTD expiry helper", () => {
  const NOW = 1_791_389_400;

  it("refuses expiration 0 (never expires) unless the flag is set", () => {
    rejects(() => assertGtdExpiration(0n, NOW), "never_expiring_order");
    rejects(() => assertGtdExpiration(0n, NOW, {}), "never_expiring_order");
    rejects(() => assertGtdExpiration(0n, NOW, { allowNeverExpires: false }), "never_expiring_order");
    assert.equal(assertGtdExpiration(0n, NOW, { allowNeverExpires: true }), 0n);
  });

  it("refuses a TTL of 0 unless the flag is set", () => {
    rejects(() => gtdExpirationFromTtl(NOW, 0), "never_expiring_order");
    assert.equal(gtdExpirationFromTtl(NOW, 0, { allowNeverExpires: true }), 0n);
  });

  it("computes now + ttl and returns a non-zero expiration", () => {
    assert.equal(gtdExpirationFromTtl(NOW, 60), BigInt(NOW + 60));
    assert.equal(gtdExpirationFromTtl(BigInt(NOW), 1), BigInt(NOW + 1));
  });

  it("refuses expirations that are not in the future", () => {
    rejects(() => assertGtdExpiration(BigInt(NOW), NOW), "invalid_expiration");
    rejects(() => assertGtdExpiration(BigInt(NOW - 1), NOW), "invalid_expiration");
    assert.equal(assertGtdExpiration(BigInt(NOW + 1), NOW), BigInt(NOW + 1));
  });

  it("refuses negative, fractional, non-integer and non-positive inputs", () => {
    rejects(() => gtdExpirationFromTtl(NOW, -5), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW, 1.5), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW, Number.NaN), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW, Number.POSITIVE_INFINITY), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(0, 60), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW + 0.5, 60), "invalid_expiration");
    rejects(() => assertGtdExpiration(-1n, NOW), "invalid_expiration");
  });

  it("bounds the TTL by default: a far-future expiration is the same bearer instrument as 0 (SIGN-2)", () => {
    assert.equal(DEFAULT_MAX_TTL_SECONDS, 3600);
    assert.equal(gtdExpirationFromTtl(NOW, 3600), BigInt(NOW + 3600));
    assert.equal(assertGtdExpiration(BigInt(NOW + 3600), NOW), BigInt(NOW + 3600));
    rejects(() => gtdExpirationFromTtl(NOW, 3601), "invalid_expiration");
    rejects(() => assertGtdExpiration(BigInt(NOW + 3601), NOW), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW, 86_400 * 30), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW, 1e15), "invalid_expiration");
    rejects(() => assertGtdExpiration(2n ** 256n - 1n, NOW), "invalid_expiration");
    // Raising the window is possible, but only by naming it.
    assert.equal(gtdExpirationFromTtl(NOW, 86_400, { maxTtlSeconds: 86_400 }), BigInt(NOW + 86_400));
    // A minimum above the default window cannot be satisfied without also raising the maximum.
    rejects(() => gtdExpirationFromTtl(NOW, 7200, { minTtlSeconds: 7200 }), "invalid_expiration");
    assert.equal(gtdExpirationFromTtl(NOW, 7200, { minTtlSeconds: 7200, maxTtlSeconds: 7200 }), BigInt(NOW + 7200));
  });

  it("applies optional TTL bounds only when given", () => {
    rejects(() => gtdExpirationFromTtl(NOW, 3601, { maxTtlSeconds: 3600 }), "invalid_expiration");
    assert.equal(gtdExpirationFromTtl(NOW, 3600, { maxTtlSeconds: 3600 }), BigInt(NOW + 3600));
    rejects(() => gtdExpirationFromTtl(NOW, 5, { minTtlSeconds: 10 }), "invalid_expiration");
    assert.equal(gtdExpirationFromTtl(NOW, 10, { minTtlSeconds: 10 }), BigInt(NOW + 10));
    rejects(() => gtdExpirationFromTtl(NOW, 60, { minTtlSeconds: 100, maxTtlSeconds: 50 }), "invalid_expiration");
    rejects(() => gtdExpirationFromTtl(NOW, 60, { maxTtlSeconds: 0 }), "invalid_expiration");
  });

  it("an expiration of 0 still passes through the explicit flag even with TTL bounds", () => {
    assert.equal(assertGtdExpiration(0n, NOW, { allowNeverExpires: true, maxTtlSeconds: 60 }), 0n);
  });
});

// ---- delta 5.8: fee bound, cap rule, expiry defaults -----------------------------------------------------

// splitmix64 over bigint with a fixed seed. No Math.random, so every run is identical.
class Rng {
  #state: bigint;
  constructor(seed: bigint) {
    this.#state = BigInt.asUintN(64, seed);
  }
  next64(): bigint {
    this.#state = BigInt.asUintN(64, this.#state + 0x9e3779b97f4a7c15n);
    let z = this.#state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return z ^ (z >> 31n);
  }
  // inclusive range
  between(min: bigint, max: bigint): bigint {
    return min + (this.next64() % (max - min + 1n));
  }
}

describe("fee bound arithmetic (maxBuyOutlay, minSellProceeds)", () => {
  it("adds the bound on top of a BUY and takes it off a SELL, rounding the safe way", () => {
    assert.equal(ORDER_FEE_BOUND_BPS, 800);
    assert.equal(maxBuyOutlay(10_000_000n, 800), 10_800_000n);
    assert.equal(maxBuyFee(10_000_000n, 800), 800_000n);
    // 123 * 800 / 10000 = 9.84: the fee rounds UP to 10, so the outlay is never understated
    assert.equal(maxBuyOutlay(123n, 800), 133n);
    assert.equal(maxBuyOutlay(1n, 800), 2n);
    assert.equal(maxBuyOutlay(1_000_000n, 0), 1_000_000n);
    assert.equal(maxBuyOutlay(1_000_000n, 1000), 1_100_000n);
    assert.equal(minSellProceeds(10_000_000n, 800), 9_200_000n);
    // 123 - ceil(9.84) = 113: the net rounds DOWN
    assert.equal(minSellProceeds(123n, 800), 113n);
    assert.equal(minSellProceeds(1n, 800), 0n);
    assert.equal(minSellProceeds(5_000_000n, 0), 5_000_000n);
  });

  it("accepts bigint basis points too and refuses everything that is not a fee bound", () => {
    assert.equal(maxBuyOutlay(1_000_000n, 800n), 1_080_000n);
    for (const bad of [-1, 1001, 800.5, Number.NaN, Number.POSITIVE_INFINITY, "800", null, undefined, -1n, 1001n]) {
      rejects(() => maxBuyOutlay(1_000_000n, bad as number), "invalid_integer");
      rejects(() => minSellProceeds(1_000_000n, bad as number), "invalid_integer");
    }
    for (const bad of [0n, -5n, 1_000_000, "1", null, undefined]) {
      rejects(() => maxBuyOutlay(bad as bigint, 800), "invalid_integer");
      rejects(() => minSellProceeds(bad as bigint, 800), "invalid_integer");
    }
  });

  it("property (seed 0xfee01): the outlay is the smallest integer that is at least principal x (1 + bound)", () => {
    const rng = new Rng(0xfee01n);
    for (let i = 0; i < 4000; i += 1) {
      const maker = rng.between(1n, 100_000_000_000n);
      const bps = rng.between(0n, 1000n);
      const outlay = maxBuyOutlay(maker, bps);
      assert.ok(outlay * 10_000n >= maker * (10_000n + bps), `never understates ${maker} at ${bps}`);
      assert.ok((outlay - 1n) * 10_000n < maker * (10_000n + bps), `no more than one unit of slack ${maker} at ${bps}`);
      const proceeds = minSellProceeds(maker, bps);
      assert.ok(proceeds * 10_000n <= maker * (10_000n - bps), `never overstates ${maker} at ${bps}`);
      assert.ok((proceeds + 1n) * 10_000n > maker * (10_000n - bps), `no more than one unit of slack ${maker} at ${bps}`);
    }
  });

  it("property (seed 0xfee02): a BUY split into any partial fills never pulls more than maxBuyOutlay", () => {
    // The contract floors every leg: a fill takes `making` of the remaining collateral, and the fee on
    // that leg is at most floor(making x bound / 10000). Summing the worst legs must stay under the outlay.
    const rng = new Rng(0xfee02n);
    for (let i = 0; i < 1500; i += 1) {
      const tick = Number(rng.between(1n, 999n));
      const step = exactShareStepMicro(tick);
      const shares = step * rng.between(1n, 40_000n);
      const collateral = (shares * BigInt(tick)) / 1000n;
      const bps = rng.between(0n, 1000n);
      let remaining = collateral;
      let pulled = 0n;
      while (remaining > 0n) {
        const making = rng.between(1n, remaining);
        remaining -= making;
        pulled += making + (making * bps) / 10_000n; // the largest fee the contract allows on this leg
      }
      assert.ok(pulled <= maxBuyOutlay(collateral, bps), `fills of ${collateral} at ${bps} bps pulled ${pulled}`);
    }
  });

  it("property (seed 0xfee03): a SELL in one leg nets at least minSellProceeds; many legs lose under one unit each", () => {
    const rng = new Rng(0xfee03n);
    for (let i = 0; i < 1500; i += 1) {
      const taker = rng.between(1n, 50_000_000_000n);
      const bps = rng.between(0n, 1000n);
      // one leg: the fee withheld is at most floor(cash x bound / 10000)
      assert.ok(taker - (taker * bps) / 10_000n >= minSellProceeds(taker, bps));
    }
    // legs: each leg's taking is floor(making x takerAmount / makerAmount); the sum falls short by < 1 per leg
    for (let i = 0; i < 300; i += 1) {
      const makerShares = rng.between(1_000n, 100_000_000n);
      const takerAmount = rng.between(1_000n, 80_000_000n);
      let remaining = makerShares;
      let legs = 0n;
      let got = 0n;
      while (remaining > 0n) {
        const making = rng.between(1n, remaining);
        remaining -= making;
        legs += 1n;
        got += (making * takerAmount) / makerShares;
      }
      assert.ok(takerAmount - got < legs, "the floor division loses less than one micro-unit per leg");
    }
  });

  it("property (seed 0xfee04): on-grid orders have an exact notional, and no BUY outlay can pass the cap by rounding", () => {
    const rng = new Rng(0xfee04n);
    for (let i = 0; i < 1500; i += 1) {
      const tick = Number(rng.between(1n, 999n));
      const sharesMicro = 1_000_000n + 1_000n * rng.between(0n, 12_000n);
      const buy = computeOrderAmounts({ side: 0, price: formatTick(tick), shares: formatMicro(sharesMicro), constraints: { minCollateralMicro: 0n } });
      assert.equal(buy.collateralMicro * 1000n, sharesMicro * BigInt(tick), "no rounding on the 1,000 micro-share step");
      const cap = orderCapAmount({ side: 0, makerAmount: buy.makerAmount, takerAmount: buy.takerAmount, feeBps: 800 });
      assert.equal(cap.capAtomic, buy.collateralMicro + maxBuyFee(buy.collateralMicro, 800));
      assert.ok(cap.capAtomic * 100n >= buy.collateralMicro * 108n);
      assert.ok(cap.capAtomic * 100n < buy.collateralMicro * 108n + 100n);
    }
  });
});

describe("cap rule (decision D2 as amended by A3)", () => {
  it("counts every BUY with the fee bound and a SELL by its notional", () => {
    const buy = computeOrderAmounts({ side: 0, price: "0.5", shares: "10" });
    const buyCap = orderCapAmount({ side: 0, makerAmount: buy.makerAmount, takerAmount: buy.takerAmount, feeBps: 800 });
    assert.equal(buyCap.basis, "buy_principal_plus_fee_bound");
    assert.equal(buyCap.capAtomic, 5_400_000n);
    assert.equal(buyCap.maxOutlayAtomic, 5_400_000n);
    assert.equal(buyCap.minProceedsAtomic, null);
    const sell = computeOrderAmounts({ side: 1, price: "0.5", shares: "10" });
    const sellCap = orderCapAmount({ side: 1, makerAmount: sell.makerAmount, takerAmount: sell.takerAmount, feeBps: 800 });
    // RT-3: a SELL counts the LARGER of its expected proceeds (5.00) and its shares at the 1.00 USD face value (10.00)
    assert.equal(sellCap.basis, "sell_max_of_proceeds_and_face_value");
    assert.equal(sellCap.capAtomic, 10_000_000n);
    assert.equal(sellCap.expectedProceedsAtomic, 5_000_000n);
    assert.equal(sellCap.faceValueAtomic, 10_000_000n);
    assert.equal(sellCap.maxOutlayAtomic, null);
    assert.equal(sellCap.minProceedsAtomic, 4_600_000n);
    assert.equal(buyCap.expectedProceedsAtomic, null);
    assert.equal(buyCap.faceValueAtomic, null);
  });

  it("a SELL's cap is max(expected proceeds, shares x 1.00 USD) for every price tick, and never below its notional (RT-3)", () => {
    for (let tick = 1; tick <= 999; tick += 7) {
      const price = (tick / 1000).toFixed(3);
      const sell = computeOrderAmounts({ side: 1, price, shares: "10", constraints: { minCollateralMicro: 0n } });
      const cap = orderCapAmount({ side: 1, makerAmount: sell.makerAmount, takerAmount: sell.takerAmount, feeBps: 1000, minProceedsFloorAtomic: 0n });
      assert.equal(cap.capAtomic, 10_000_000n, `price ${price}`);
      assert.ok(cap.capAtomic >= sell.takerAmount);
    }
    // the max is a real max: a taker amount above the face value (not reachable through a price below 1.00, but the
    // function does not assume it) is what counts
    const odd = orderCapAmount({ side: 1, makerAmount: 1_000_000n, takerAmount: 1_200_000n, feeBps: 1000 });
    assert.equal(odd.capAtomic, 1_200_000n);
    assert.equal(odd.faceValueAtomic, 1_000_000n);
  });

  it("the trade cap uses the 1,000 bps ceiling while the expected on-chain bound stays 800 (SI-2)", () => {
    assert.equal(ORDER_CAP_FEE_BPS, 1000);
    assert.equal(ORDER_FEE_BOUND_BPS, 800);
    const buy = computeOrderAmounts({ side: 0, price: "0.5", shares: "10" });
    assert.equal(orderCapAmount({ side: 0, makerAmount: buy.makerAmount, takerAmount: buy.takerAmount, feeBps: ORDER_CAP_FEE_BPS }).capAtomic, 5_500_000n);
    // the seed keeps the 800 bps its own $10.80 cap was fixed with
    assert.equal(SEED_CAP_ATOMIC, 10_800_000n);
  });

  it("the largest BUY that fits $10 is a $9.25 stake (the multiplier applies to everything, post-only included)", () => {
    assert.equal(maxBuyOutlay(9_259_259n, 800), 10_000_000n);
    assert.equal(maxBuyOutlay(9_259_260n, 800), 10_000_001n);
    // there is no post-only parameter: an extra property changes nothing, so no caller can ask for an exemption
    const base = { side: 0 as const, makerAmount: 9_259_260n, takerAmount: 20_000_000n, feeBps: 800 };
    const withPostOnly = { ...base, postOnly: true } as typeof base;
    assert.deepEqual(orderCapAmount(withPostOnly), orderCapAmount(base));
  });

  it("the creation seed is a $10.00 stake with its own $10.80 cap", () => {
    assert.equal(SEED_STAKE_ATOMIC, 10_000_000n);
    assert.equal(SEED_CAP_ATOMIC, 10_800_000n);
    assert.equal(maxBuyOutlay(SEED_STAKE_ATOMIC, ORDER_FEE_BOUND_BPS), SEED_CAP_ATOMIC);
  });

  it("the minimum-proceeds guard refuses a SELL that could net less than the floor", () => {
    // 326,087 nets exactly 300,000 after the 800 bps bound; one less nets 299,999
    assert.equal(minSellProceeds(326_087n, 800), 300_000n);
    assert.equal(minSellProceeds(326_086n, 800), 299_999n);
    assert.doesNotThrow(() => orderCapAmount({ side: 1, makerAmount: 1_000_000n, takerAmount: 326_087n, feeBps: 800 }));
    rejects(() => orderCapAmount({ side: 1, makerAmount: 1_000_000n, takerAmount: 326_086n, feeBps: 800 }), "below_minimum");
    // the guard is the caller's to change, and 0n switches it off
    assert.doesNotThrow(() => orderCapAmount({ side: 1, makerAmount: 1_000_000n, takerAmount: 326_086n, feeBps: 800, minProceedsFloorAtomic: 299_999n }));
    assert.doesNotThrow(() => orderCapAmount({ side: 1, makerAmount: 1_000_000n, takerAmount: 1n, feeBps: 800, minProceedsFloorAtomic: 0n }));
    // a BUY has no proceeds guard
    assert.doesNotThrow(() => orderCapAmount({ side: 0, makerAmount: 1n, takerAmount: 1n, feeBps: 800 }));
  });

  it("refuses bad sides, amounts and fee bounds", () => {
    rejects(() => orderCapAmount({ side: 2 as 0, makerAmount: 1n, takerAmount: 1n, feeBps: 800 }), "invalid_order");
    rejects(() => orderCapAmount({ side: 0, makerAmount: 0n, takerAmount: 1n, feeBps: 800 }), "invalid_integer");
    rejects(() => orderCapAmount({ side: 0, makerAmount: 1n, takerAmount: 0n, feeBps: 800 }), "invalid_integer");
    rejects(() => orderCapAmount({ side: 0, makerAmount: 1n, takerAmount: 1n, feeBps: 1001 }), "invalid_integer");
    rejects(() => orderCapAmount({ side: 1, makerAmount: 1n, takerAmount: 1n, feeBps: 800, minProceedsFloorAtomic: -1n }), "invalid_integer");
  });
});

describe("order lifetime defaults (delta 5.8)", () => {
  const NOW = 1_791_389_400;

  it("the default lifetime is 300 s and the submit floor is 90 s", () => {
    assert.equal(DEFAULT_ORDER_TTL_SECONDS, 300);
    assert.equal(MIN_REMAINING_TTL_SECONDS, 90);
    assert.equal(gtdExpirationFromTtl(NOW), BigInt(NOW + 300));
    assert.equal(gtdExpirationFromTtl(NOW, undefined), BigInt(NOW + 300));
    assert.equal(defaultGtdExpiration(NOW), BigInt(NOW + 300));
    assert.equal(defaultGtdExpiration(BigInt(NOW)), BigInt(NOW + 300));
  });

  it("a GTD expiration is never 0, whichever helper makes it", () => {
    rejects(() => gtdExpirationFromTtl(NOW, 0), "never_expiring_order");
    rejects(() => assertGtdExpiration(0n, NOW), "never_expiring_order");
    // assertRemainingTtl has no opt-out at all
    rejects(() => assertRemainingTtl(0n, NOW), "never_expiring_order");
    for (const nonZero of [defaultGtdExpiration(NOW), gtdExpirationFromTtl(NOW, 1), gtdExpirationFromTtl(NOW, 3600)]) assert.ok(nonZero > 0n);
  });

  it("at submit at least 90 s must remain, counted in whole seconds", () => {
    assert.equal(assertRemainingTtl(BigInt(NOW + 90), NOW), 90n);
    assert.equal(assertRemainingTtl(BigInt(NOW + 300), NOW), 300n);
    rejects(() => assertRemainingTtl(BigInt(NOW + 89), NOW), "invalid_expiration");
    rejects(() => assertRemainingTtl(BigInt(NOW + 1), NOW), "invalid_expiration");
    rejects(() => assertRemainingTtl(BigInt(NOW), NOW), "invalid_expiration");
    rejects(() => assertRemainingTtl(BigInt(NOW - 5), NOW), "invalid_expiration");
    // the floor is the caller's to raise or lower, but never to zero
    assert.equal(assertRemainingTtl(BigInt(NOW + 30), NOW, 30), 30n);
    rejects(() => assertRemainingTtl(BigInt(NOW + 30), NOW, 31), "invalid_expiration");
    rejects(() => assertRemainingTtl(BigInt(NOW + 30), NOW, 0), "invalid_expiration");
  });

  it("rejects a fractional clock reading and a negative expiration", () => {
    rejects(() => assertRemainingTtl(BigInt(NOW + 300), NOW + 0.5), "invalid_expiration");
    rejects(() => assertRemainingTtl(-1n, NOW), "invalid_expiration");
    rejects(() => defaultGtdExpiration(NOW + 0.25), "invalid_expiration");
  });

  it("wholeSeconds floors a millisecond clock and refuses anything else", () => {
    assert.equal(wholeSeconds(1_791_389_400_999), 1_791_389_400n);
    assert.equal(wholeSeconds(0), 0n);
    assert.equal(wholeSeconds(999), 0n);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "5" as unknown as number]) rejects(() => wholeSeconds(bad), "invalid_expiration");
  });

  it("a seed's 7 to 30 days need the caller to name the window; the default hour refuses them", () => {
    const SEVEN_DAYS = 7 * 86_400;
    rejects(() => gtdExpirationFromTtl(NOW, SEVEN_DAYS), "invalid_expiration");
    assert.equal(gtdExpirationFromTtl(NOW, SEVEN_DAYS, { maxTtlSeconds: 30 * 86_400 }), BigInt(NOW + SEVEN_DAYS));
  });
});
