// Golden tests: reproduce the worked examples in docs/aggregation-design.md (Examples 1 to 5 and
// the stack in 5.7) and docs/research/10 sections 6.2 to 6.5 to the displayed digit. Each
// expected string is the figure printed in the document, compared after rounding the exact
// rational to the document's own precision. The 15 section 4.7 examples live in lp.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeeSpec } from "../../types.js";
import {
  levelEdge,
  repriceOrders,
  walkBasket,
  type BasketLeg,
  type BasketOutcome,
  type BasketParams,
  type LegPrice,
} from "../../core/basket.js";
import {
  DEFAULTS,
  amortisedFixedCost,
  effectiveDays,
  haircutEv,
  lockRate,
  minSharesForFixedCostShare,
  modelEdge,
  scenarioEv,
} from "../../core/edge.js";
import { kalshiFeeSpec, polymarketFeeSpec, xoFeeSpec } from "../../core/fee-specs.js";
import { feePerShare, orderFee } from "../../core/fees.js";
import { ONE, ZERO, dec, div, mul, neg, ratFromInt, ratToDecExact, sub, type Rational } from "../../core/rational.js";
import { NOW_MS, SOURCE, at, ladder } from "./helpers.js";

function ok<T>(r: { ok: true; value: T } | { ok: false; code: string; detail: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${r.code}: ${r.detail}`);
  return (r as { ok: true; value: T }).value;
}

function xo(bps: string): FeeSpec {
  return xoFeeSpec({ takerBps: bps, source: SOURCE });
}
const kalshi = kalshiFeeSpec({ multiplier: "1", source: SOURCE });
const poly = (rate: string): FeeSpec => polymarketFeeSpec({ rate, source: SOURCE });

function pair(a: LegPrice, b: LegPrice, params: Partial<BasketParams> = {}) {
  return ok(
    levelEdge([a, b], { guaranteedPayoff: ONE, nowMs: NOW_MS, ...params }),
  );
}

// ---------------------------------------------------------------------------------------------
// Example 1 (aggregation-design 5.1): XO YES vs Kalshi NO, 7 days, 8% APY, reserve 1 cent

const ex1Legs = (xoSpec: FeeSpec = xo("400")): BasketLeg[] => [
  { id: "xo-yes", side: "buy", levels: ladder([["0.320", "200"], ["0.326", "300"], ["0.334", "500"]]), spec: xoSpec },
  { id: "k-no", side: "buy", levels: ladder([["0.620", "150"], ["0.626", "400"], ["0.632", "600"]]), spec: kalshi },
];
const ex1Params: BasketParams = {
  guaranteedPayoff: ONE,
  tau: dec("0.005"),
  lockRate: lockRate(DEFAULTS.hurdleApy, ratFromInt(7)),
  lockBase: "price",
  reservePerShare: dec("0.01"),
  nowMs: NOW_MS,
};

function legOf(step: BasketOutcome["steps"][number], id: string) {
  const leg = step.edge.legs.find((l) => l.id === id);
  assert.ok(leg, id);
  return leg;
}

test("Example 1: the four-step table, to the digit", () => {
  const out = ok(walkBasket(ex1Legs(), ex1Params));
  assert.equal(out.steps.length, 3);
  assert.equal(out.stopReason, "below_tau");
  const rows = [...out.steps, out.rejected].map((s) => {
    assert.ok(s);
    return {
      qty: at(s.qty, 0),
      gross: at(s.edge.gross, 4),
      feeXo: at(legOf(s, "xo-yes").fee, 6),
      feeK: at(legOf(s, "k-no").fee, 6),
      lock: at(s.edge.lock, 6),
      reserve: at(s.edge.reserve, 4),
      net: at(s.edge.net, 6),
    };
  });
  assert.deepEqual(rows, [
    { qty: "150", gross: "0.06", feeXo: "0.008704", feeK: "0.016492", lock: "0.001442", reserve: "0.01", net: "0.023362" },
    { qty: "50", gross: "0.054", feeXo: "0.008704", feeK: "0.016389", lock: "0.001451", reserve: "0.01", net: "0.017456" },
    { qty: "300", gross: "0.048", feeXo: "0.008789", feeK: "0.016389", lock: "0.001461", reserve: "0.01", net: "0.011362" },
    { qty: "50", gross: "0.04", feeXo: "0.008898", feeK: "0.016389", lock: "0.001473", reserve: "0.01", net: "0.003241" },
  ]);
  assert.equal(out.rejected?.taken, false);
});

test("Example 1: totals for steps 1 to 3", () => {
  const t = ok(walkBasket(ex1Legs(), ex1Params)).totals;
  assert.equal(at(t.qty, 0), "500");
  assert.equal(at(t.capital, 2), "473.9");
  assert.equal(at(t.gross, 2), "26.1");
  assert.equal(at(t.fees, 3), "12.587");
  assert.equal(at(t.netOfFees, 2), "13.51");
  assert.equal(at(t.lock, 2), "0.73");
  assert.equal(at(t.reserve, 2), "5");
  assert.equal(at(t.net, 2), "7.79");
  assert.equal(at(t.returnOnCapital, 4), "0.0164"); // 1.64% of capital in 7 days
  // fees alone take 2.52 cents of the 6 cent top-of-book gap: 42% of it
  const top = ok(walkBasket(ex1Legs(), { ...ex1Params, maxQty: ONE, tau: ratFromInt(-1) })).steps[0];
  assert.ok(top);
  assert.equal(at(top.edge.fees, 4), "0.0252");
  assert.equal(at(div(top.edge.fees, top.edge.gross), 2), "0.42");
});

test("Example 1: with a $10 cap on the XO leg only 31 shares fit and net is about $0.72", () => {
  const shares = div(dec("10"), dec("0.32")); // 31.25
  const cap = ratFromInt(shares.n / shares.d); // whole shares
  assert.equal(at(cap, 0), "31");
  const out = ok(walkBasket(ex1Legs(), { ...ex1Params, maxQty: cap }));
  assert.equal(out.stopReason, "max_qty");
  assert.equal(at(out.totals.qty, 0), "31");
  assert.equal(at(out.totals.net, 2), "0.72");
  // re-price the chosen lot with each venue's exact order rule: Kalshi rounds the order up to the
  // cent, which the smooth walk cannot see
  const repriced = ok(repriceOrders(ex1Legs(), out));
  const kFee = repriced.perLegFees.find((p) => p.id === "k-no");
  assert.equal(ratToDecExact(kFee?.fee ?? ZERO), "0.52"); // 31 x 0.016492 = 0.511252 -> 0.52
  assert.ok(repriced.roundedFees.n * repriced.smoothFees.d > repriced.smoothFees.n * repriced.roundedFees.d);
});

test("Example 1: XO fee sensitivity at step 1 is +0.0321 / +0.0234 / +0.0147", () => {
  const nets = ["0", "400", "800"].map((bps) => {
    const out = ok(walkBasket(ex1Legs(xo(bps)), { ...ex1Params, maxQty: ONE }));
    const first = out.steps[0];
    assert.ok(first);
    return at(first.edge.net, 4);
  });
  assert.deepEqual(nets, ["0.0321", "0.0234", "0.0147"]);
});

// ---------------------------------------------------------------------------------------------
// Example 2 (5.2): Polymarket politics 0.04, three outcomes, asks 0.30 / 0.34 / 0.33, 100 sets

const ex2Prices = (rate: string): LegPrice[] =>
  ["0.30", "0.34", "0.33"].map((p, i) => ({ id: `o${i}`, side: "buy" as const, price: dec(p), spec: poly(rate) }));

test("Example 2: complete set, 100 sets", () => {
  const edge = ok(levelEdge(ex2Prices("0.04"), { guaranteedPayoff: ONE, nowMs: NOW_MS }));
  const sets = ratFromInt(100);
  assert.equal(at(mul(edge.gross, sets), 2), "3");
  assert.equal(at(mul(edge.fees, sets), 3), "2.622");
  assert.equal(at(mul(edge.net, sets), 3), "0.378");
  // capital including fees is $99.62; a 60-day lock at 8% on it turns the set negative
  const lock = lockRate(DEFAULTS.hurdleApy, ratFromInt(60));
  const locked = ok(levelEdge(ex2Prices("0.04"), { guaranteedPayoff: ONE, lockRate: lock, lockBase: "price_plus_fee", nowMs: NOW_MS }));
  assert.equal(at(mul(locked.lock, sets), 2), "1.31");
  assert.equal(at(mul(locked.net, sets), 2), "-0.93");
});

test("Example 2: a dispute tail adds little: lock 1.311 / 1.317 / 1.334 at 1.2% / 7.6% / 27%", () => {
  const out = ["0.012", "0.076", "0.27"].map((p) => {
    const days = effectiveDays(ratFromInt(60), dec(p), ratFromInt(4));
    const e = ok(levelEdge(ex2Prices("0.04"), { guaranteedPayoff: ONE, lockRate: lockRate(DEFAULTS.hurdleApy, days), lockBase: "price_plus_fee", nowMs: NOW_MS }));
    return at(mul(e.lock, ratFromInt(100)), 3);
  });
  assert.deepEqual(out, ["1.311", "1.317", "1.334"]);
});

test("Example 2: same-venue complement YES 0.47 + NO 0.51 gives net $0.004", () => {
  const legs: LegPrice[] = [
    { id: "yes", side: "buy", price: dec("0.47"), spec: poly("0.04") },
    { id: "no", side: "buy", price: dec("0.51"), spec: poly("0.04") },
  ];
  const e = ok(levelEdge(legs, { guaranteedPayoff: ONE, nowMs: NOW_MS }));
  const shares = ratFromInt(100);
  assert.equal(at(mul(e.gross, shares), 2), "2");
  assert.equal(at(mul(e.fees, shares), 3), "1.996");
  assert.equal(at(mul(e.net, shares), 3), "0.004");
});

// ---------------------------------------------------------------------------------------------
// Example 3 (5.4): forecast versus ask

test("Example 3: model edge with shrinkage 1 / 0.5 / 0.25 / 0.1", () => {
  const fee = ok(feePerShare(poly("0.04"), "taker", "buy", dec("0.54")));
  assert.equal(at(fee, 6), "0.009936");
  const run = (lambdaQ: string) => {
    const m = modelEdge({ ask: dec("0.54"), mid: dec("0.535"), q: dec("0.62"), lambdaQ: dec(lambdaQ), feePerShare: fee });
    assert.ok(m);
    return m;
  };
  assert.equal(at(run("1").ev, 4), "0.0701");
  assert.equal(at(run("1").qEff, 4), "0.62");
  assert.equal(at(run("0.5").qEff, 4), "0.5775");
  assert.equal(at(run("0.5").ev, 4), "0.0276");
  assert.equal(at(run("0.25").qEff, 5), "0.55625");
  assert.equal(at(run("0.25").ev, 4), "0.0063");
  assert.equal(at(run("0.1").ev, 4), "-0.0064");
  // dollars on a $10 order of 18.5 shares: 1.30 / 0.51 / 0.12
  const shares = dec("18.5");
  assert.equal(at(mul(run("1").ev, shares), 2), "1.3");
  assert.equal(at(mul(run("0.5").ev, shares), 2), "0.51");
  assert.equal(at(mul(run("0.25").ev, shares), 2), "0.12");
  // the default shrinkage is the cautious one
  assert.equal(ratToDecExact(DEFAULTS.lambdaQ), "0.25");
  assert.equal(modelEdge({ ask: dec("0.54"), mid: dec("0.535"), q: dec("0.62"), lambdaQ: dec("1.5"), feePerShare: fee }), null);
});

// ---------------------------------------------------------------------------------------------
// Example 4 (5.5): lock with a 27% dispute tail of 4 days, fixed rebalancing cost

const ex4Legs: LegPrice[] = [
  { id: "xo-yes", side: "buy", price: dec("0.32"), spec: xo("400") },
  { id: "k-no", side: "buy", price: dec("0.62"), spec: kalshi },
];

test("Example 4: cost per share 0.965196, T = 46.08 days, lock 0.009748, net 0.034804 -> 0.025056", () => {
  const days = effectiveDays(ratFromInt(45), dec("0.27"), ratFromInt(4));
  assert.equal(at(days, 2), "46.08");
  const base = pair(ex4Legs[0] as LegPrice, ex4Legs[1] as LegPrice);
  const cost = sub(ONE, base.net);
  assert.equal(at(cost, 6), "0.965196");
  assert.equal(at(base.net, 6), "0.034804");
  const locked = pair(ex4Legs[0] as LegPrice, ex4Legs[1] as LegPrice, {
    lockRate: lockRate(DEFAULTS.hurdleApy, days),
    lockBase: "price_plus_fee",
  });
  assert.equal(at(locked.lock, 6), "0.009748");
  assert.equal(at(locked.net, 6), "0.025056");
});

test("Example 4: fixed rebalancing cost amortisation and break-even share count (~319)", () => {
  const per = ["1", "5", "20"].map((n) => at(amortisedFixedCost(dec("2"), dec(n)), 2));
  assert.deepEqual(per, ["2", "0.4", "0.1"]);
  const days = effectiveDays(ratFromInt(45), dec("0.27"), ratFromInt(4));
  const locked = pair(ex4Legs[0] as LegPrice, ex4Legs[1] as LegPrice, { lockRate: lockRate(DEFAULTS.hurdleApy, days), lockBase: "price_plus_fee" });
  const shares = minSharesForFixedCostShare(dec("2"), locked.net, dec("0.25"));
  assert.ok(shares);
  assert.equal(at(shares, 0, "floor"), "319");
  assert.equal(minSharesForFixedCostShare(dec("2"), neg(dec("0.01")), dec("0.25")), null);
});

// ---------------------------------------------------------------------------------------------
// Example 5 (5.6): resolution-risk haircut

test("Example 5: EV per share at delta 0.12% / 0.5% / 2% / 5%", () => {
  const e = pair(ex4Legs[0] as LegPrice, ex4Legs[1] as LegPrice);
  const cost = sub(ONE, e.net);
  assert.deepEqual(
    ["0.0012", "0.005", "0.02", "0.05"].map((d) => at(haircutEv(cost, dec(d)), 4)),
    ["0.0336", "0.0298", "0.0148", "-0.0152"],
  );
});

test("Example 5: three-state check: EV +0.0110, worst case -0.9652", () => {
  const e = pair(ex4Legs[0] as LegPrice, ex4Legs[1] as LegPrice);
  const cost = sub(ONE, e.net);
  const r = scenarioEv(cost, [
    { probability: dec("0.97"), payoff: ONE }, // venues agree
    { probability: dec("0.02"), payoff: ZERO }, // adverse divergence
    { probability: dec("0.01"), payoff: dec("0.62") }, // Kalshi voids at last price, XO resolves NO
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(at(r.value.ev, 4), "0.011");
  assert.equal(at(r.value.worst, 4), "-0.9652");
});

test("scenario probabilities must be a distribution", () => {
  assert.deepEqual(scenarioEv(dec("0.5"), []), { ok: false, error: "NO_SCENARIOS" });
  assert.deepEqual(scenarioEv(dec("0.5"), [{ probability: dec("0.9"), payoff: ONE }]), { ok: false, error: "PROBABILITIES_NOT_ONE" });
  assert.deepEqual(
    scenarioEv(dec("0.5"), [{ probability: neg(dec("0.5")), payoff: ONE }, { probability: dec("1.5"), payoff: ONE }]),
    { ok: false, error: "NEGATIVE_PROBABILITY" },
  );
});

// ---------------------------------------------------------------------------------------------
// 5.7: full stack for the step-1 pair

test("5.7: the full stack leaves +0.0031 per share, 5% of the gross, below tau", () => {
  const days = effectiveDays(ratFromInt(45), dec("0.27"), ratFromInt(4));
  const e = pair(ex4Legs[0] as LegPrice, ex4Legs[1] as LegPrice, {
    lockRate: lockRate(DEFAULTS.hurdleApy, days),
    lockBase: "price_plus_fee",
    haircutPerShare: dec("0.02"),
    reservePerShare: dec("0.002"),
  });
  assert.equal(at(e.gross, 4), "0.06");
  assert.equal(at(e.fees, 4), "0.0252");
  assert.equal(at(e.lock, 4), "0.0097");
  assert.equal(at(e.haircut, 4), "0.02");
  assert.equal(at(e.reserve, 4), "0.002");
  assert.equal(at(e.net, 4), "0.0031");
  assert.equal(at(div(e.net, e.gross), 2), "0.05");
  assert.ok(e.net.n * DEFAULTS.tau.d < DEFAULTS.tau.n * e.net.d, "below tau, so the label is indicative");
});

// ---------------------------------------------------------------------------------------------
// docs/research/10 section 6.2 (Example A): Kalshi YES + Polymarket NO, depth walked

test("10 6.2 Example A: four-step table and totals", () => {
  const legs: BasketLeg[] = [
    { id: "k-yes", side: "buy", levels: ladder([["0.38", "120"], ["0.39", "300"], ["0.41", "500"]]), spec: kalshi },
    { id: "p-no", side: "buy", levels: ladder([["0.54", "80"], ["0.55", "400"], ["0.57", "1000"]]), spec: poly("0.05") },
  ];
  const params: BasketParams = {
    guaranteedPayoff: ONE,
    tau: dec("0.005"),
    lockRate: lockRate(DEFAULTS.hurdleApy, ratFromInt(30)),
    lockBase: "price",
    reservePerShare: dec("0.01"),
    nowMs: NOW_MS,
  };
  const out = ok(walkBasket(legs, params));
  const rows = [...out.steps, out.rejected].map((s) => {
    assert.ok(s);
    return [at(s.qty, 0), at(s.edge.gross, 4), at(s.edge.fees, 4), at(s.edge.lock, 4), at(s.edge.net, 4)];
  });
  assert.deepEqual(rows, [
    ["80", "0.08", "0.0289", "0.006", "0.035"],
    ["40", "0.07", "0.0289", "0.0061", "0.025"],
    ["300", "0.06", "0.029", "0.0062", "0.0148"],
    ["60", "0.04", "0.0293", "0.0063", "-0.0056"],
  ]);
  const first = out.steps[0];
  assert.ok(first);
  assert.equal(at(legOf(first, "k-yes").fee, 6), "0.016492");
  assert.equal(at(legOf(first, "p-no").fee, 6), "0.01242");
  const t = out.totals;
  assert.equal(at(t.qty, 0), "420");
  assert.equal(at(t.capital, 2), "392.8");
  assert.equal(at(t.gross, 2), "27.2");
  assert.equal(at(t.netOfFees, 2), "15.02");
  assert.equal(at(t.lock, 2), "2.58");
  assert.equal(at(t.reserve, 2), "4.2");
  assert.equal(at(t.net, 2), "8.24");
  assert.equal(at(t.net, 4), "8.2412");
  assert.equal(at(t.returnOnCapital, 3), "0.021"); // 2.1% of capital over 30 days
  // fee lines: Kalshi 6.97494 smooth, 6.98 at order level; Polymarket 5.20110
  const kFills = out.perLeg.find((p) => p.id === "k-yes")?.fills ?? [];
  assert.equal(ratToDecExact(ok(feeSum(kalshi, kFills))), "6.98");
  const pFills = out.perLeg.find((p) => p.id === "p-no")?.fills ?? [];
  assert.equal(ratToDecExact(ok(orderFee({ ...poly("0.05"), rounding: "none" }, "taker", "buy", pFills))), "5.2011");
  // skipping lock and reserve would also have taken step 4 (net of fees +0.0107)
  const fourth = out.rejected;
  assert.ok(fourth);
  assert.equal(at(sub(fourth.edge.gross, fourth.edge.fees), 4), "0.0107");
});

function feeSum(spec: FeeSpec, fills: readonly { price: Rational; qty: Rational }[]) {
  return orderFee(spec, "taker", "buy", fills);
}

// ---------------------------------------------------------------------------------------------
// docs/research/10 sections 6.3 to 6.5

test("10 6.3 Example B: YES 0.47 + NO 0.51 by category rate (100 shares)", () => {
  const rows = ["0", "0.04", "0.05", "0.07"].map((rate) => {
    const e = pair(
      { id: "yes", side: "buy", price: dec("0.47"), spec: poly(rate) },
      { id: "no", side: "buy", price: dec("0.51"), spec: poly(rate) },
    );
    return [at(mul(e.fees, ratFromInt(100)), 3), at(mul(e.net, ratFromInt(100)), 3)];
  });
  assert.deepEqual(rows, [
    ["0", "2"],
    ["1.996", "0.004"],
    ["2.495", "-0.495"],
    ["3.493", "-1.493"],
  ]);
});

test("10 6.3: break-even gross spread at mid prices is rate / 2 (2.0 / 2.5 / 3.5 cents)", () => {
  const be = ["0.04", "0.05", "0.07"].map((rate) => {
    const e = pair(
      { id: "a", side: "buy", price: dec("0.5"), spec: poly(rate) },
      { id: "b", side: "buy", price: dec("0.5"), spec: poly(rate) },
    );
    return at(e.fees, 3);
  });
  assert.deepEqual(be, ["0.02", "0.025", "0.035"]);
  // cross venue at mid prices: (theta_A + theta_B) / 4 = 2.75 cents for XO 400 bps + Kalshi 0.07
  const cross = pair(
    { id: "xo", side: "buy", price: dec("0.5"), spec: xo("400") },
    { id: "k", side: "buy", price: dec("0.5"), spec: kalshi },
  );
  assert.equal(at(cross.fees, 4), "0.0275");
});

test("10 6.4 Example C: neg-risk set 0.30/0.28/0.22/0.18, 100 shares, rate 0.04", () => {
  const legs: LegPrice[] = ["0.30", "0.28", "0.22", "0.18"].map((p, i) => ({
    id: `o${i}`,
    side: "buy" as const,
    price: dec(p),
    spec: poly("0.04"),
  }));
  const e = ok(levelEdge(legs, { guaranteedPayoff: ONE, nowMs: NOW_MS }));
  const sets = ratFromInt(100);
  assert.equal(at(mul(e.gross, sets), 2), "2");
  assert.equal(at(mul(e.fees, sets), 4), "2.9232");
  assert.equal(at(mul(e.net, sets), 4), "-0.9232");
});

test("10 6.5 Example D: XO YES 0.30 + Polymarket NO 0.66 at XO 0 / 400 / 700 bps", () => {
  const rows = ["0", "400", "700"].map((bps) => {
    const e = pair(
      { id: "xo", side: "buy", price: dec("0.30"), spec: xo(bps) },
      { id: "p", side: "buy", price: dec("0.66"), spec: poly("0.04") },
    );
    const shares = ratFromInt(100);
    return [at(mul(e.gross, shares), 2), at(mul(legOfEdge(e, "xo").fee, shares), 2), at(mul(e.net, shares), 2)];
  });
  assert.deepEqual(rows, [
    ["4", "0", "3.1"],
    ["4", "0.84", "2.26"],
    ["4", "1.47", "1.63"],
  ]);
  const polyFee = pair(
    { id: "xo", side: "buy", price: dec("0.30"), spec: xo("0") },
    { id: "p", side: "buy", price: dec("0.66"), spec: poly("0.04") },
  );
  assert.equal(at(mul(legOfEdge(polyFee, "p").fee, ratFromInt(100)), 4), "0.8976");
});

function legOfEdge(e: ReturnType<typeof pair>, id: string) {
  const leg = e.legs.find((l) => l.id === id);
  assert.ok(leg);
  return leg;
}
