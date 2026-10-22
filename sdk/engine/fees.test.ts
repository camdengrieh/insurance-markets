import assert from "node:assert/strict";
import { test } from "vitest";
import type { FeeSpec } from "../model.js";
import {
  checkFeeSpec,
  feePerShare,
  orderFee,
  parseRounding,
  reconcileXoFeeBps,
  unitEconomics,
  xoFeeMicro,
  fixedCostPerOrder,
} from "./fees.js";
import {
  kalshiFeeSpec,
  limitlessFeeSpec,
  opinionFeeSpec,
  polymarketFeeSpec,
  polymarketUsFeeSpec,
  predictFunFeeSpec,
  trueoFeeSpec,
  unknownFeeSpec,
  xoFeeSpec,
  ROUNDING_UNKNOWN,
} from "./fee-specs.js";
import { dec, eq, ratToDecExact, sub } from "../money/rational.js";
import { NOW_MS, SOURCE } from "./fixtures/helpers.js";

function value<T>(r: { ok: true; value: T } | { ok: false; code: string; detail: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${r.code}: ${r.detail}`);
  return (r as { ok: true; value: T }).value;
}

function code(r: { ok: boolean; code?: string }): string | undefined {
  assert.equal(r.ok, false);
  return r.code;
}

const xo400 = xoFeeSpec({ takerBps: "400", source: SOURCE });

test("curve_pq: C x rate x p x (1-p), symmetric around 0.5 and capped at rate/4", () => {
  const poly = polymarketFeeSpec({ rate: "0.04", source: SOURCE });
  assert.ok(eq(value(feePerShare(poly, "taker", "buy", dec("0.54"))), dec("0.009936")));
  assert.ok(eq(value(feePerShare(poly, "taker", "sell", dec("0.46"))), dec("0.009936")));
  assert.ok(eq(value(feePerShare(poly, "taker", "buy", dec("0.5"))), dec("0.01")));
  assert.ok(eq(value(feePerShare(xo400, "taker", "buy", dec("0.32"))), dec("0.008704")));
});

test("Kalshi coefficient 0.07 x multiplier reproduces the worked example from its fee docs", () => {
  const spec = kalshiFeeSpec({ multiplier: "1", source: SOURCE });
  // docs.kalshi.com fee_rounding: 0.07 x 0.055 x 0.945 = 0.00363825
  assert.ok(eq(value(feePerShare(spec, "taker", "buy", dec("0.055"))), dec("0.00363825")));
  const half = kalshiFeeSpec({ multiplier: "0.5", source: SOURCE });
  assert.ok(eq(value(feePerShare(half, "taker", "buy", dec("0.5"))), dec("0.00875")));
});

test("curve_pq fails closed on exponents other than 1", () => {
  const spec = polymarketFeeSpec({ rate: "0.04", exponent: "2", source: SOURCE });
  assert.equal(code(feePerShare(spec, "taker", "buy", dec("0.5"))), "EXPONENT_UNSUPPORTED");
  const one = polymarketFeeSpec({ rate: "0.04", exponent: "1", source: SOURCE });
  assert.equal(feePerShare(one, "taker", "buy", dec("0.5")).ok, true);
});

test("a role with no recorded parameters is unknown, never zero", () => {
  assert.equal(code(feePerShare(xo400, "maker", "buy", dec("0.5"))), "PARAMS_MISSING");
  const withMaker = xoFeeSpec({ takerBps: "400", makerBps: "0", source: SOURCE });
  assert.ok(eq(value(feePerShare(withMaker, "maker", "buy", dec("0.5"))), dec("0")));
  assert.equal(code(feePerShare(kalshiFeeSpec({ multiplier: "1", source: SOURCE }), "maker", "buy", dec("0.5"))), "PARAMS_MISSING");
});

test("ambiguous, missing or out-of-range coefficients are refused", () => {
  const both: FeeSpec = { ...xo400, taker: { rate: "0.04", bps: "400" } };
  assert.equal(code(feePerShare(both, "taker", "buy", dec("0.5"))), "PARAMS_INVALID");
  const none: FeeSpec = { ...xo400, taker: {} };
  assert.equal(code(feePerShare(none, "taker", "buy", dec("0.5"))), "PARAMS_MISSING");
  const huge: FeeSpec = { ...xo400, taker: { bps: "10001" } };
  assert.equal(code(feePerShare(huge, "taker", "buy", dec("0.5"))), "PARAMS_INVALID");
  const junk: FeeSpec = { ...xo400, taker: { bps: "4e2" } };
  assert.equal(code(feePerShare(junk, "taker", "buy", dec("0.5"))), "PARAMS_INVALID");
});

test("unknown model and invalid prices fail closed", () => {
  const unknown = unknownFeeSpec("world", SOURCE);
  assert.equal(code(feePerShare(unknown, "taker", "buy", dec("0.5"))), "MODEL_UNKNOWN");
  assert.equal(code(checkFeeSpec(unknown, NOW_MS)), "MODEL_UNKNOWN");
  assert.equal(code(feePerShare(xo400, "taker", "buy", dec("0"))), "PRICE_INVALID");
  assert.equal(code(feePerShare(xo400, "taker", "buy", dec("1"))), "PRICE_INVALID");
});

test("spec freshness: stale, future and malformed dates fail closed", () => {
  assert.equal(checkFeeSpec(xo400, NOW_MS).ok, true);
  const stale: FeeSpec = { ...xo400, verifiedAt: "2026-01-01", ttlSec: 3600 };
  assert.equal(code(checkFeeSpec(stale, NOW_MS)), "SPEC_STALE");
  const future: FeeSpec = { ...xo400, verifiedAt: "2027-01-01" };
  assert.equal(code(checkFeeSpec(future, NOW_MS)), "SPEC_TIME_INVALID");
  const garbage: FeeSpec = { ...xo400, verifiedAt: "yesterday" };
  assert.equal(code(checkFeeSpec(garbage, NOW_MS)), "SPEC_TIME_INVALID");
  const noTtl: FeeSpec = { ...xo400, ttlSec: 0 };
  assert.equal(code(checkFeeSpec(noTtl, NOW_MS)), "SPEC_TIME_INVALID");
});

test("rounding grammar", () => {
  assert.equal(parseRounding(undefined).ok, true);
  assert.equal(parseRounding("none").ok, true);
  const steps = value(parseRounding("half_up:5,min:0.00001"));
  assert.equal(steps.length, 2);
  assert.deepEqual(value(parseRounding("ceil:6,align:2")).map((s) => s.kind), ["round", "align"]);
  for (const bad of ["ceil", "bogus:6", "ceil:x", "min:abc", "ceil:6,,", "align:x", "align", ROUNDING_UNKNOWN]) {
    assert.equal(code(parseRounding(bad)), "ROUNDING_UNSUPPORTED", bad);
  }
  // The readers' former prose is refused, never read as a rule.
  for (const prose of ["ceil_6dp", "usd_6dp", "nearest_cent_half_even", "usd_cent_up", "usd_5dp_half_up", "5dp, minimum 0.00001; rounding mode not documented"]) {
    assert.equal(code(parseRounding(prose)), "ROUNDING_UNSUPPORTED", prose);
  }
});

test("align: the trader's cash moves onto the grid against the trader, and the difference is fee", () => {
  const spec: FeeSpec = { ...xo400, rounding: "align:2" };
  // buy 1 at 0.5, 400 bps: fee 0.01, cash 0.51 already on the grid.
  assert.equal(ratToDecExact(value(orderFee(spec, "taker", "buy", [{ price: dec("0.5"), qty: dec("1") }]))), "0.01");
  // buy 1.5 at 0.501: notional 0.7515, fee 1.5 x 0.04 x 0.501 x 0.499 = 0.01499994; 0.76649994 is paid as 0.77.
  assert.equal(ratToDecExact(value(orderFee(spec, "taker", "buy", [{ price: dec("0.501"), qty: dec("1.5") }]))), "0.0185");
  // the same sold: 0.7515 - 0.01499994 = 0.73650006 is received as 0.73.
  assert.equal(ratToDecExact(value(orderFee(spec, "taker", "sell", [{ price: dec("0.501"), qty: dec("1.5") }]))), "0.0215");
});

test("order fee: Kalshi rounds the trade fee up to a micro-dollar, then aligns the balance to the cent", () => {
  const spec = kalshiFeeSpec({ multiplier: "1", source: SOURCE });
  // docs.kalshi.com/getting_started/fee_rounding worked example: -$0.055 of revenue, model fee 0.00363825 ->
  // trade fee 0.003639, balance change -0.06, trade fee plus rounding fee exactly 0.005.
  assert.equal(ratToDecExact(value(orderFee(spec, "taker", "buy", [{ price: dec("0.055"), qty: dec("1") }]))), "0.005");
  const fills = [
    { price: dec("0.38"), qty: dec("80") },
    { price: dec("0.38"), qty: dec("40") },
    { price: dec("0.39"), qty: dec("300") },
  ];
  // smooth total 6.97494 (docs/research/10 section 6.2) on a notional of 162.6: 169.57494 is paid as 169.58
  assert.equal(ratToDecExact(value(orderFee(spec, "taker", "buy", fills))), "6.98");
  const exact: FeeSpec = { ...spec, rounding: "none" };
  assert.equal(ratToDecExact(value(orderFee(exact, "taker", "buy", fills))), "6.97494");
});

test("order fee: Polymarket publishes 5 dp but not the rounding mode, so its fee is never priced", () => {
  const spec = polymarketFeeSpec({ rate: "0.04", source: SOURCE });
  assert.equal(spec.rounding, ROUNDING_UNKNOWN);
  assert.equal(code(orderFee(spec, "taker", "buy", [{ price: dec("0.01"), qty: dec("1") }])), "ROUNDING_UNSUPPORTED");
  // the smooth curve itself is still the venue's
  assert.ok(eq(value(feePerShare(spec, "taker", "buy", dec("0.01"))), dec("0.000396")));
  // a minimum step lifts only a charged fee
  const floored: FeeSpec = { ...spec, rounding: "half_up:5,min:0.00001" };
  assert.equal(ratToDecExact(value(orderFee(floored, "taker", "buy", [{ price: dec("0.001"), qty: dec("0.1") }]))), "0.00001");
  const free: FeeSpec = { ...polymarketFeeSpec({ rate: "0", source: SOURCE }), rounding: "half_up:5,min:0.00001" };
  assert.equal(ratToDecExact(value(orderFee(free, "taker", "buy", [{ price: dec("0.5"), qty: dec("10") }]))), "0");
  assert.equal(code(orderFee(xo400, "taker", "buy", [{ price: dec("0.5"), qty: dec("0") }])), "PARAMS_INVALID");
});

test("XO: the venue's worked example, 200 shares at 0.50 with a 4% base rate, costs $2.00 (docs.xo.market/product/trading/fees)", () => {
  assert.equal(xo400.rounding, "floor:6");
  assert.equal(ratToDecExact(value(orderFee(xo400, "taker", "buy", [{ price: dec("0.5"), qty: dec("200") }]))), "2");
  // two 100-share fills at the same price: $1.00 each, $2.00 in all
  assert.equal(ratToDecExact(value(orderFee(xo400, "taker", "buy", [{ price: dec("0.5"), qty: dec("100") }, { price: dec("0.5"), qty: dec("100") }]))), "2");
  // a fractional micro-dollar is floored, as the venue floors each fill: 1.000001 shares at 0.5 -> 0.01000001 -> 0.01
  assert.equal(ratToDecExact(value(orderFee(xo400, "taker", "buy", [{ price: dec("0.5"), qty: dec("1.000001") }]))), "0.01");
});

test("XO: integer micro form equals the exact formula when it divides evenly", () => {
  // 100 shares = 100_000_000 micro-shares at tick 320 (0.320), 400 bps
  assert.equal(xoFeeMicro(400n, 100_000_000n, 320n), 870_400n);
  const fee = value(orderFee(xo400, "taker", "buy", [{ price: dec("0.32"), qty: dec("100") }]));
  assert.equal(ratToDecExact(fee), "0.8704");
  // floors a fractional micro-unit: 1 micro-share at tick 500, 400 bps -> 0.01 micro -> 0
  assert.equal(xoFeeMicro(400n, 1n, 500n), 0n);
  assert.throws(() => xoFeeMicro(400n, 1n, 0n), RangeError);
  assert.throws(() => xoFeeMicro(400n, 1n, 1000n), RangeError);
});

test("XO fee sources: take the max and report disagreement (docs/research/10 V3)", () => {
  assert.deepEqual(reconcileXoFeeBps("0", "400"), { bps: "400", agreed: false, sourcesKnown: 2 });
  assert.deepEqual(reconcileXoFeeBps("400", "400"), { bps: "400", agreed: true, sourcesKnown: 2 });
  assert.deepEqual(reconcileXoFeeBps(null, "800"), { bps: "800", agreed: false, sourcesKnown: 1 });
  assert.deepEqual(reconcileXoFeeBps(null, null), { bps: null, agreed: false, sourcesKnown: 0 });
  assert.deepEqual(reconcileXoFeeBps("junk", null), { bps: null, agreed: false, sourcesKnown: 0 });
});

test("fee-on-top versus withheld: buy adds, sell withholds", () => {
  const poly = polymarketFeeSpec({ rate: "0.04", source: SOURCE });
  const buy = value(unitEconomics(poly, "taker", "buy", dec("0.54")));
  const sell = value(unitEconomics(poly, "taker", "sell", dec("0.54")));
  assert.ok(eq(buy.effective, dec("0.549936")));
  assert.ok(eq(sell.effective, dec("0.530064")));
  assert.equal(buy.settlementContingent, false);
});

test("token fee (Limitless buy): cost per delivered share is p / (1 - f); sell fee is cash", () => {
  const spec = limitlessFeeSpec({ buyBps: "300", sellBps: "150", source: SOURCE });
  const buy = value(unitEconomics(spec, "taker", "buy", dec("0.4")));
  // 0.4 / 0.97
  assert.equal(buy.effective.n * 97n, 40n * buy.effective.d);
  assert.ok(eq(buy.fee, sub(buy.effective, dec("0.4"))));
  const sell = value(unitEconomics(spec, "taker", "sell", dec("0.4")));
  assert.ok(eq(sell.effective, dec("0.394")));
});

test("curve_min (Predict.fun): base x min(p, 1-p)", () => {
  const spec = predictFunFeeSpec({ feeRateBps: "200", source: SOURCE });
  assert.ok(eq(value(feePerShare(spec, "taker", "buy", dec("0.3"))), dec("0.006")));
  assert.ok(eq(value(feePerShare(spec, "taker", "buy", dec("0.8"))), dec("0.004")));
  assert.ok(eq(value(feePerShare(spec, "maker", "buy", dec("0.8"))), dec("0")));
});

test("Opinion: bps of notional with a minimum fee per order", () => {
  const spec = opinionFeeSpec({ takerBps: "100", minFee: "0.25", source: SOURCE });
  const small = value(orderFee(spec, "taker", "buy", [{ price: dec("0.5"), qty: dec("10") }]));
  // 1% of 5.00 = 0.05, lifted to the 0.25 minimum: a 5% effective rate
  assert.equal(ratToDecExact(small), "0.25");
  const big = value(orderFee(spec, "taker", "buy", [{ price: dec("0.5"), qty: dec("1000") }]));
  assert.equal(ratToDecExact(big), "5");
});

test("profit_pct is a worst-case settlement fee and says so", () => {
  const spec: FeeSpec = {
    venue: "sx",
    modelId: "profit_pct",
    taker: { rate: "0.01" },
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: SOURCE.url, field: SOURCE.field, granularity: SOURCE.granularity },
    verifiedAt: SOURCE.verifiedAt,
    ttlSec: SOURCE.ttlSec,
  };
  const econ = value(unitEconomics(spec, "taker", "buy", dec("0.4")));
  assert.ok(eq(econ.fee, dec("0.006")));
  assert.equal(econ.settlementContingent, true);
});

test("amm_stack: stack applies when payer is not the pool; quotes from the pool already include it", () => {
  const inPool = trueoFeeSpec({ lpFee: "0.008", hookFee: "0.002", gas: "0.03", source: SOURCE });
  assert.ok(eq(value(feePerShare(inPool, "taker", "buy", dec("0.5"))), dec("0")));
  assert.ok(eq(value(fixedCostPerOrder(inPool)), dec("0.03")));
  const onTop: FeeSpec = { ...inPool, payer: "buyer_adds_seller_withholds" };
  assert.ok(eq(value(feePerShare(onTop, "taker", "buy", dec("0.5"))), dec("0.005")));
  const withExtra = trueoFeeSpec({ lpFee: "0.008", hookFee: "0.002", extraFee: "0.05", source: SOURCE });
  assert.ok(eq(value(feePerShare(withExtra, "taker", "buy", dec("0.5"))), dec("0.025")));
  // hook fee unknown (its live value was NOT FOUND): refuse rather than guess
  const noHook: FeeSpec = { ...inPool, taker: { lpFee: "0.008" } };
  assert.equal(code(feePerShare(noHook, "taker", "buy", dec("0.5"))), "PARAMS_MISSING");
});

test("Polymarket US uses one flat theta", () => {
  const spec = polymarketUsFeeSpec({ theta: "0.06", source: SOURCE });
  assert.ok(eq(value(feePerShare(spec, "taker", "buy", dec("0.5"))), dec("0.015")));
});
