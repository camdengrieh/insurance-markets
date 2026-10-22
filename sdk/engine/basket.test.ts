import assert from "node:assert/strict";
import { test } from "vitest";
import type { Book, FeeSpec } from "../model.js";
import { levelEdge, walkBasket, type BasketLeg, type BasketParams } from "./basket.js";
import { complementBook, normalizeSortedBook, parseBook, type ParsedBook } from "./books.js";
import { walkImplication, walkPair, walkPartitionLong, walkPartitionShort, type BookLeg } from "./depth.js";
import { limitlessFeeSpec, polymarketFeeSpec, unknownFeeSpec } from "./fee-specs.js";
import { ONE, ZERO, cmp, dec, ratFromInt } from "../money/rational.js";
import { NO, NOW_MS, SOURCE, YES, at, ladder, level } from "./fixtures/helpers.js";

const P0 = polymarketFeeSpec({ rate: "0", source: SOURCE });
const P4 = polymarketFeeSpec({ rate: "0.04", source: SOURCE });
const params: BasketParams = { guaranteedPayoff: ONE, tau: ZERO, nowMs: NOW_MS };

function ok<T>(r: { ok: true; value: T } | { ok: false; code: string; detail: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${r.code}: ${r.detail}`);
  return (r as { ok: true; value: T }).value;
}

const buy = (id: string, levels: ReturnType<typeof ladder>, spec: FeeSpec = P0): BasketLeg => ({ id, side: "buy", levels, spec });

test("marginal edge never increases as the walk goes deeper (convex ladders)", () => {
  const out = ok(
    walkBasket(
      [
        buy("a", ladder([["0.30", "10"], ["0.31", "10"], ["0.33", "10"], ["0.36", "10"]])),
        buy("b", ladder([["0.60", "15"], ["0.61", "10"], ["0.62", "10"]])),
      ],
      { ...params, tau: ratFromInt(-1) },
    ),
  );
  const nets = out.steps.map((s) => s.edge.net);
  for (let i = 1; i < nets.length; i += 1) assert.ok(cmp(nets[i - 1] ?? ZERO, nets[i] ?? ZERO) >= 0);
  assert.equal(out.stopReason, "depth_exhausted");
  assert.equal(at(out.totals.qty, 0), "35");
});

test("stops at the first level whose net is not strictly above tau", () => {
  const legs = [buy("a", ladder([["0.40", "10"], ["0.45", "10"]])), buy("b", ladder([["0.50", "100"]]))];
  const out = ok(walkBasket(legs, { ...params, tau: dec("0.05") }));
  assert.equal(out.steps.length, 1); // net 0.10 > 0.05; second level net 0.05 is NOT strictly above
  assert.equal(out.stopReason, "below_tau");
  assert.equal(at(out.rejected?.edge.net ?? ZERO, 2), "0.05");
});

test("a leg with no levels is no_depth; a taken-out ladder is depth_exhausted", () => {
  const none = ok(walkBasket([buy("a", ladder([["0.3", "1"]])), buy("b", [])], params));
  assert.equal(none.stopReason, "no_depth");
  assert.equal(none.steps.length, 0);
  assert.equal(at(none.totals.qty, 0), "0");
  assert.equal(none.totals.returnOnCapital, null);
  assert.equal(none.totals.fixedCost.n, 0n); // no fixed cost is charged for a trade that is not made
});

test("max quantity and lot size cut the taken quantity", () => {
  const legs = [buy("a", ladder([["0.30", "100"]])), buy("b", ladder([["0.60", "100"]]))];
  assert.equal(at(ok(walkBasket(legs, { ...params, maxQty: dec("37.5") })).totals.qty, 1), "37.5");
  const lots = ok(walkBasket(legs, { ...params, maxQty: dec("37.5"), qtyStep: ratFromInt(1) }));
  assert.equal(at(lots.totals.qty, 0), "37");
  assert.equal(at(lots.perLeg[0]?.notional ?? ZERO, 2), "11.1");
  assert.throws(() => walkBasket(legs, { ...params, qtyStep: ZERO }), RangeError);
});

test("fixed costs are charged once and can turn a positive trade negative", () => {
  const legs = [buy("a", ladder([["0.30", "10"]])), buy("b", ladder([["0.60", "10"]]))];
  const out = ok(walkBasket(legs, { ...params, fixedCost: dec("2") }));
  assert.equal(at(out.totals.netOfFees, 2), "1"); // 10 x 0.10
  assert.equal(at(out.totals.net, 2), "-1");
  assert.equal(at(out.totals.returnOnCapital, 4), "-0.1111");
});

test("unknown or stale fee models stop the walk with a code, never a guess", () => {
  const legs = (spec: FeeSpec) => [buy("a", ladder([["0.30", "10"]]), spec), buy("b", ladder([["0.60", "10"]]))];
  const unknown = walkBasket(legs(unknownFeeSpec("world", SOURCE)), params);
  assert.equal(unknown.ok === false && unknown.code, "MODEL_UNKNOWN");
  const stale = walkBasket(legs({ ...P4, verifiedAt: "2020-01-01", ttlSec: 60 }), params);
  assert.equal(stale.ok === false && stale.code, "SPEC_STALE");
  const exp = walkBasket(legs(polymarketFeeSpec({ rate: "0.04", exponent: "2", source: SOURCE })), params);
  assert.equal(exp.ok === false && exp.code, "EXPONENT_UNSUPPORTED");
  assert.throws(() => walkBasket([], params), RangeError);
});

test("sell legs use the posted collateral 1 - p for the lock charge and withhold the fee", () => {
  const e = ok(
    levelEdge(
      [
        { id: "sell", side: "sell", price: dec("0.60"), spec: P4 },
        { id: "buy", side: "buy", price: dec("0.50"), spec: P0 },
      ],
      { guaranteedPayoff: ZERO, lockRate: dec("0.01"), nowMs: NOW_MS },
    ),
  );
  assert.equal(at(e.gross, 2), "0.1"); // 0.60 - 0.50
  assert.equal(at(e.fees, 5), "0.0096"); // 0.04 x 0.6 x 0.4
  assert.equal(at(e.lock, 4), "0.009"); // 0.01 x (0.40 + 0.50)
  assert.equal(at(e.net, 5), "0.0814");
});

test("token-fee buys deliver fewer shares than the level shows (Limitless)", () => {
  const spec = limitlessFeeSpec({ buyBps: "1000", sellBps: "0", source: SOURCE });
  const out = ok(
    walkBasket([buy("lim", ladder([["0.40", "100"]]), spec), buy("other", ladder([["0.50", "1000"]]))], { ...params, tau: ratFromInt(-1) }),
  );
  assert.equal(at(out.totals.qty, 0), "90"); // 10% of the 100 gross shares are the fee
  const first = out.steps[0];
  assert.equal(at(first?.edge.legs[0]?.effective ?? ZERO, 4), "0.4444"); // 0.40 / 0.90
});

// ---------------------------------------------------------------------------------------------
// depth wrappers

function bookOf(token = YES, bids: [string, string][], asks: [string, string][]): Book {
  const n = normalizeSortedBook(
    { token, asOfMs: NOW_MS },
    "best_first",
    { bids: bids.map(([p, s]) => level(p, s)), asks: asks.map(([p, s]) => level(p, s)) },
  );
  assert.equal(n.ok, true);
  return (n as { ok: true; value: { book: Book } }).value.book;
}

function parsed(b: Book): ParsedBook {
  const p = parseBook(b);
  assert.equal(p.ok, true);
  return (p as { ok: true; value: ParsedBook }).value;
}

const bl = (id: string, b: Book, spec: FeeSpec = P0): BookLeg => ({ id, book: parsed(b), spec });
const dp = { tau: ZERO, nowMs: NOW_MS };

test("walkPair prices a complement pair and is executable only on native books", () => {
  const yes = bookOf(YES, [["0.40", "50"]], [["0.45", "100"]]);
  const no = bookOf(NO, [["0.50", "50"]], [["0.52", "100"]]);
  const r = ok(walkPair(bl("yes", yes), bl("no", no), dp));
  assert.equal(r.executable, true);
  assert.equal(at(r.outcome.totals.net, 2), "3"); // (1 - 0.97) x 100
  const synthetic = complementBook(yes, NO);
  const r2 = ok(walkPair(bl("yes", yes), bl("no", synthetic), dp));
  assert.equal(r2.executable, false);
});

test("partition long needs an exhaustive set; short is valid for exclusive sets", () => {
  const legs = ["0.30", "0.34", "0.33"].map((p, i) =>
    bl(`o${i}`, bookOf(YES, [[String(Number(p) - 0.02), "100"]], [[p, "100"]])),
  );
  const refused = walkPartitionLong(legs, "unknown", dp);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, "NOT_EXHAUSTIVE");
  assert.equal(walkPartitionLong(legs, "no", dp).ok, false);
  const long = ok(walkPartitionLong(legs, "by_rule", dp));
  assert.equal(at(long.outcome.totals.net, 2), "3");
  // NO books: NO ask = 1 - YES bid; buying every NO pays n - 1 = 2
  const noLegs = ["0.28", "0.32", "0.31"].map((bid, i) =>
    bl(`n${i}`, bookOf(NO, [], [[String(1 - Number(bid)), "100"]])),
  );
  const short = ok(walkPartitionShort(noLegs, dp));
  // cost 0.72 + 0.68 + 0.69 = 2.09 against a guaranteed 2: no edge, nothing taken
  assert.equal(short.outcome.steps.length, 0);
  assert.equal(at(short.outcome.rejected?.edge.gross ?? ZERO, 2), "-0.09");
});

test("implication walk sells the antecedent into bids and buys the consequent", () => {
  // nomination (N) is implied by winning the general (G): sell G at 0.35, buy N at 0.34
  const g = bookOf(YES, [["0.35", "40"], ["0.33", "80"]], [["0.36", "10"]]);
  const n = bookOf(YES, [["0.30", "10"]], [["0.34", "50"], ["0.36", "100"]]);
  const r = ok(walkImplication(bl("g", g), bl("n", n), dp));
  assert.equal(at(r.outcome.totals.qty, 0), "40");
  assert.equal(at(r.outcome.totals.net, 2), "0.4");
  // 4% fees on both legs remove all of it
  const fee = ok(walkImplication(bl("g", g, P4), bl("n", n, P4), dp));
  assert.equal(at(fee.outcome.totals.qty, 0), "0");
});
