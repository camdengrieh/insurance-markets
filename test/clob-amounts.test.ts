import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkLimitlessAmounts, clobCapAmount, computeClobAmounts, decodeClobAmounts, formatMicro, parseClobPriceMicro, parseClobSharesMicro, parseTickMicro } from "../src/clob/amounts.js";
import { CLOB_CAP_FEE_BPS, LIMITLESS_MIN_MAKER_AMOUNT, LIMITLESS_PRICE_TICK, POLYMARKET_TICK_RULES, polymarketTickRule } from "../src/clob/venues.js";
import { SigningError } from "../src/xo/signing/errors.js";

// Exact integer amounts for the CLOB venues. The one documented example (place-orders.md: "BUY 10 shares at 0.52 gives
// makerAmount 5200000 and takerAmount 10000000") is reproduced; everything else is the grammar and the never-round rule.

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof SigningError) return error.code;
    throw error;
  }
  return "ok";
};

const CENT = { tick: "0.01", priceDecimals: 2 };
const MIL = { tick: "0.001", priceDecimals: 3 };

describe("prices on the tick grid", () => {
  it("parses a price with up to the grid's decimals and refuses anything finer or off the tick", () => {
    assert.equal(parseClobPriceMicro("0.52", CENT), 520_000n);
    assert.equal(parseClobPriceMicro("0.5", CENT), 500_000n);
    assert.equal(parseClobPriceMicro("0.525", MIL), 525_000n);
    assert.equal(code(() => parseClobPriceMicro("0.525", CENT)), "invalid_price", "three places on a two-place grid");
    assert.equal(code(() => parseClobPriceMicro("0.5250", MIL)), "invalid_price", "trailing zeros count as places (sdk/money/decimal.ts)");
    assert.equal(code(() => parseClobPriceMicro("0.0025", { tick: "0.005", priceDecimals: 4 })), "invalid_price", "not a whole multiple of the tick");
    assert.equal(parseClobPriceMicro("0.0025", { tick: "0.0025", priceDecimals: 4 }), 2_500n);
  });

  it("refuses 0, 1, negatives, exponents, hex and spaces", () => {
    for (const bad of ["0", "1", "1.0", "0.00", "-0.5", "5e-1", "0x1", " 0.5", "0.5 ", "", ".5"]) assert.equal(code(() => parseClobPriceMicro(bad, CENT)), "invalid_price", bad);
  });

  it("knows every tick the docs list, with its decimals", () => {
    assert.deepEqual(
      POLYMARKET_TICK_RULES.map((rule) => rule.tick),
      ["0.1", "0.01", "0.005", "0.0025", "0.001", "0.0001"],
    );
    assert.deepEqual(polymarketTickRule("0.01"), { tick: "0.01", priceDecimals: 2, sizeDecimals: 2, amountDecimals: 4 });
    assert.equal(polymarketTickRule("0.02"), undefined);
    assert.equal(parseTickMicro("0.0001"), 100n);
    assert.equal(code(() => parseTickMicro("1")), "invalid_price");
  });
});

describe("shares and the two amounts", () => {
  it("reproduces the documented example: BUY 10 shares at 0.52 is makerAmount 5200000 and takerAmount 10000000", () => {
    const amounts = computeClobAmounts({ side: 0, price: "0.52", shares: "10", grid: CENT, sizeDecimals: 2, minSharesMicro: 5_000_000n });
    assert.equal(amounts.makerAmount, 5_200_000n);
    assert.equal(amounts.takerAmount, 10_000_000n);
    assert.equal(amounts.collateralMicro, 5_200_000n);
    assert.equal(formatMicro(amounts.priceMicro), "0.52");
  });

  it("swaps the two amounts for a SELL", () => {
    const amounts = computeClobAmounts({ side: 1, price: "0.52", shares: "10", grid: CENT, sizeDecimals: 2, minSharesMicro: 0n });
    assert.equal(amounts.makerAmount, 10_000_000n);
    assert.equal(amounts.takerAmount, 5_200_000n);
  });

  it("never rounds: with two size decimals and four price decimals every product is exact, and the exactness is still checked", () => {
    const amounts = computeClobAmounts({ side: 0, price: "0.0001", shares: "0.01", grid: { tick: "0.0001", priceDecimals: 4 }, sizeDecimals: 2, minSharesMicro: 0n });
    assert.equal(amounts.collateralMicro, 1n, "0.01 shares at 0.0001 is exactly one micro unit");
    // Six size decimals with a four-place price would overflow six places: the product is refused, not rounded.
    assert.equal(code(() => computeClobAmounts({ side: 0, price: "0.0001", shares: "0.000001", grid: { tick: "0.0001", priceDecimals: 4 }, sizeDecimals: 6, minSharesMicro: 0n })), "inexact_amount");
    assert.equal(code(() => computeClobAmounts({ side: 0, price: "0.3", shares: "0.000001", grid: MIL, sizeDecimals: 6, minSharesMicro: 0n })), "inexact_amount");
  });

  it("refuses shares finer than the size decimals, zero shares and shares below the market minimum", () => {
    assert.equal(code(() => parseClobSharesMicro("1.234", 2)), "invalid_size");
    assert.equal(code(() => parseClobSharesMicro("0", 2)), "invalid_size");
    assert.equal(parseClobSharesMicro("1.20", 2), 1_200_000n);
    assert.equal(code(() => computeClobAmounts({ side: 0, price: "0.5", shares: "4.99", grid: CENT, sizeDecimals: 2, minSharesMicro: 5_000_000n })), "below_minimum");
  });

  it("decodes the amounts back to an exact price, and refuses amounts that imply none", () => {
    assert.deepEqual(decodeClobAmounts({ side: 0, makerAmount: 5_200_000n, takerAmount: 10_000_000n }), { priceMicro: 520_000n, sharesMicro: 10_000_000n, collateralMicro: 5_200_000n });
    assert.deepEqual(decodeClobAmounts({ side: 1, makerAmount: 10_000_000n, takerAmount: 5_200_000n }).priceMicro, 520_000n);
    assert.equal(code(() => decodeClobAmounts({ side: 0, makerAmount: 1n, takerAmount: 3n })), "inexact_amount");
    assert.equal(code(() => decodeClobAmounts({ side: 0, makerAmount: 10_000_000n, takerAmount: 10_000_000n })), "invalid_price", "price 1 is outside (0, 1)");
  });
});

describe("the cap with the policy fee ceiling", () => {
  it("counts a BUY at principal plus 1,000 bps and a SELL at the larger of proceeds and face value, with no proceeds floor", () => {
    const buy = clobCapAmount({ side: 0, makerAmount: 5_200_000n, takerAmount: 10_000_000n });
    assert.equal(buy.feeBps, CLOB_CAP_FEE_BPS);
    assert.equal(buy.capAtomic, 5_720_000n);
    assert.equal(buy.maxOutlayAtomic, 5_720_000n);
    const sell = clobCapAmount({ side: 1, makerAmount: 10_000_000n, takerAmount: 100_000n });
    assert.equal(sell.capAtomic, 10_000_000n, "face value of 10 shares beats proceeds of 0.10");
    assert.equal(sell.minProceedsAtomic, 90_000n);
    assert.equal(sell.maxOutlayAtomic, null);
  });
});

describe("Limitless amount rules (OpenAPI Order.price and makerAmount, create-order.md, @limitless-exchange/sdk 1.3.0)", () => {
  it("pins the venue-wide 0.001 tick and the 100 raw-unit makerAmount floor", () => {
    assert.equal(LIMITLESS_PRICE_TICK, "0.001");
    assert.equal(parseTickMicro(LIMITLESS_PRICE_TICK), 1_000n);
    assert.equal(LIMITLESS_MIN_MAKER_AMOUNT, 100n);
  });

  it("requires shares on the SDK's sharesStep (priceScale / tickInt = 1,000 raw units) and makerAmount of at least 100", () => {
    assert.equal(code(() => checkLimitlessAmounts({ sharesMicro: 10_000n, makerAmount: 100n })), "ok");
    assert.equal(code(() => checkLimitlessAmounts({ sharesMicro: 1_000n, makerAmount: 100n })), "ok");
    assert.equal(code(() => checkLimitlessAmounts({ sharesMicro: 1_500n, makerAmount: 100n })), "invalid_size");
    assert.equal(code(() => checkLimitlessAmounts({ sharesMicro: 10_000n, makerAmount: 99n })), "below_minimum");
    // A BUY of 0.01 shares at 0.001 has makerAmount 10: on the grid, under the floor.
    const tiny = computeClobAmounts({ side: 0, price: "0.001", shares: "0.01", grid: { tick: LIMITLESS_PRICE_TICK, priceDecimals: 3 }, sizeDecimals: 2, minSharesMicro: 0n });
    assert.equal(tiny.makerAmount, 10n);
    assert.equal(code(() => checkLimitlessAmounts(tiny)), "below_minimum");
    // A SELL's makerAmount is its contracts: 0.01 shares is 10,000 raw units, over the floor.
    const sell = computeClobAmounts({ side: 1, price: "0.001", shares: "0.01", grid: { tick: LIMITLESS_PRICE_TICK, priceDecimals: 3 }, sizeDecimals: 2, minSharesMicro: 0n });
    assert.equal(code(() => checkLimitlessAmounts(sell)), "ok");
  });

  it("every price on the 0.001 grid times any two-decimal size is an exact integer of raw units (price x contracts exact)", () => {
    for (const price of ["0.001", "0.123", "0.5", "0.999"]) {
      for (const shares of ["0.01", "0.37", "1", "123.45"]) {
        assert.equal(code(() => computeClobAmounts({ side: 0, price, shares, grid: { tick: LIMITLESS_PRICE_TICK, priceDecimals: 3 }, sizeDecimals: 2, minSharesMicro: 0n })), "ok", `${shares} at ${price}`);
      }
    }
  });
});
