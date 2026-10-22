// Exact LP: reproduces docs/research/15 section 4.7 (cases A to D and the implication example)
// and the Frechet violation trades of section 3.5.
import assert from "node:assert/strict";
import { test } from "vitest";
import type { FeeSpec } from "../model.js";
import { kalshiFeeSpec, polymarketFeeSpec } from "./fee-specs.js";
import { unitEconomics } from "./fees.js";
import {
  impliedPrices,
  planPnl,
  simplexMax,
  solveArb,
  type ArbContract,
  type ArbSolution,
  type ArbSpecParams,
} from "./lp.js";
import { lockRate } from "./edge.js";
import { ONE, ZERO, cmp, dec, eq, lt, ratFromInt, sum, type Rational } from "../money/rational.js";
import { NOW_MS, SOURCE, at, ladder } from "./fixtures/helpers.js";

const P = (rate: string): FeeSpec => polymarketFeeSpec({ rate, source: SOURCE });
const K: FeeSpec = kalshiFeeSpec({ multiplier: "1", source: SOURCE });

function solved(p: ArbSpecParams): ArbSolution {
  const r = solveArb(p);
  assert.equal(r.ok, true, r.ok ? "" : `${r.error} ${r.detail ?? ""}`);
  return (r as { ok: true; value: ArbSolution }).value;
}

const R = (rows: readonly (readonly (number | string)[])[]): Rational[][] =>
  rows.map((row) => row.map((v) => dec(String(v))));

// 15 section 4.7: states X, Y, Z win; contracts X@P, Y@P, Rep@P, Dem@K, Z@K
const payoff = R([
  [1, 0, 0, 1, 0],
  [0, 1, 0, 1, 0],
  [0, 0, 1, 0, 1],
]);
const books = [
  { asks: ladder([["0.46", "30"], ["0.48", "100"]]), bids: ladder([["0.44", "50"]]) },
  { asks: ladder([["0.21", "40"], ["0.23", "100"]]), bids: ladder([["0.19", "50"]]) },
  { asks: ladder([["0.31", "50"], ["0.33", "200"]]), bids: ladder([["0.29", "100"]]) },
  { asks: ladder([["0.66", "60"], ["0.68", "100"]]), bids: ladder([["0.64", "100"]]) },
  { asks: ladder([["0.30", "25"], ["0.32", "100"]]), bids: ladder([["0.28", "100"]]) },
];
const venues: FeeSpec[] = [P("0.04"), P("0.04"), P("0.04"), K, K];
const zero = P("0");
const contracts = (specs: FeeSpec[]): ArbContract[] => books.map((b, j) => ({ ...b, spec: specs[j] as FeeSpec }));
const LOCK = lockRate(dec("0.08"), ratFromInt(30)); // 8% APY for 30 days

function trade(s: ArbSolution, contract: number, side: "buy" | "sell", price: string): string {
  const t = s.trades.find((x) => x.contract === contract && x.side === side && eq(x.price, dec(price)));
  return t === undefined ? "0" : at(t.qty, 4);
}

test("15 4.7 (A) depth-aware, no fees: guaranteed profit $2.50, payoff 90 in every state", () => {
  const s = solved({ payoff, contracts: contracts(Array(5).fill(zero) as FeeSpec[]), nowMs: NOW_MS });
  assert.equal(at(s.value, 4), "2.5");
  assert.equal(trade(s, 0, "buy", "0.46"), "30");
  assert.equal(trade(s, 1, "buy", "0.21"), "30");
  assert.equal(trade(s, 2, "buy", "0.31"), "50");
  assert.equal(trade(s, 3, "buy", "0.66"), "60");
  assert.equal(trade(s, 4, "buy", "0.30"), "25");
  assert.equal(trade(s, 4, "buy", "0.32"), "15");
  assert.deepEqual(s.statePrices.map((v) => at(v, 4)), ["0.47", "0.21", "0.32"]);
  // payoff 90 in every state at cost 87.50
  for (const row of payoff) {
    const total = sum(s.trades.map((t) => (t.side === "buy" ? mulq(t.qty, row[t.contract] as Rational) : ZERO)));
    assert.equal(at(total, 4), "90");
  }
  const cost = sum(s.trades.map((t) => mulq(t.qty, t.price)));
  assert.equal(at(cost, 2), "87.5");
});

function mulq(a: Rational, b: Rational): Rational {
  return { n: a.n * b.n, d: a.d * b.d };
}

test("15 4.7 (B) with taker fees: $0.4406 from Dem@K 60 + Rep@P 35 + Z@K 25", () => {
  const s = solved({ payoff, contracts: contracts(venues), nowMs: NOW_MS });
  assert.equal(at(s.value, 4), "0.4406");
  assert.equal(s.trades.length, 3);
  assert.equal(trade(s, 3, "buy", "0.66"), "60");
  assert.equal(trade(s, 2, "buy", "0.31"), "35");
  assert.equal(trade(s, 4, "buy", "0.30"), "25");
  assert.deepEqual(s.statePrices.map((v) => at(v, 4)), ["0.4648", "0.2166", "0.3186"]);
  // hand check: 0.9425 + 0.2995 + 0.3675 = 1.6094 of fees
  const fee = (spec: FeeSpec, p: string, q: string): Rational => {
    const u = unitEconomics(spec, "taker", "buy", dec(p));
    assert.equal(u.ok, true);
    return mulq((u as { ok: true; value: { fee: Rational } }).value.fee, dec(q));
  };
  assert.equal(at(fee(K, "0.66", "60"), 4), "0.9425");
  assert.equal(at(fee(P("0.04"), "0.31", "35"), 4), "0.2995");
  assert.equal(at(fee(K, "0.30", "25"), 4), "0.3675");
  assert.equal(at(sum([fee(K, "0.66", "60"), fee(P("0.04"), "0.31", "35"), fee(K, "0.30", "25")]), 4), "1.6094");
});

test("15 4.7 (C) fees plus a 30-day 8% lock: $0.0820 on 25 sets of Dem@K + Z@K", () => {
  const s = solved({ payoff, contracts: contracts(venues), lockRate: LOCK, nowMs: NOW_MS });
  assert.equal(at(s.value, 4), "0.082");
  assert.equal(s.trades.length, 2);
  assert.equal(trade(s, 3, "buy", "0.66"), "25");
  assert.equal(trade(s, 4, "buy", "0.30"), "25");
  // capital 24.00 and the same plan earns $0.2398 before the lock charge
  assert.equal(at(sum(s.trades.map((t) => mulq(t.qty, t.price))), 2), "24");
  const noLock = solved({ payoff, contracts: contracts(venues), nowMs: NOW_MS });
  assert.ok(lt(s.value, noLock.value));
});

test("15 4.7 (D) void rows wipe out the apparent arbitrage: guaranteed profit $0.0000", () => {
  const voidRows = R([
    [1, 0, 0, 0.65, 0.3],
    [0, 1, 0, 0.65, 0.3],
    [0, 0, 1, 0.65, 0.3],
  ]);
  const six = [...payoff, ...voidRows];
  const s = solved({ payoff: six, contracts: contracts(venues), lockRate: LOCK, nowMs: NOW_MS });
  assert.equal(at(s.value, 4), "0");
  assert.equal(s.trades.length, 0);
  // plan (C) evaluated in the void rows loses 25 x (0.95 - 0.96 - 0.0304) = -1.0102 (fees on)
  const planC = solved({ payoff, contracts: contracts(venues), lockRate: LOCK, nowMs: NOW_MS });
  const feeOf = (t: { contract: number; side: "buy" | "sell"; price: Rational; qty: Rational }): Rational => {
    const spec = venues[t.contract] as FeeSpec;
    const u = unitEconomics(spec, "taker", t.side, t.price);
    assert.equal(u.ok, true);
    return mulq((u as { ok: true; value: { fee: Rational } }).value.fee, t.qty);
  };
  for (const row of voidRows) assert.equal(at(planPnl(planC.trades, row, feeOf), 4), "-1.0102");
  // and in the normal rows the same plan is positive before the lock charge
  for (const row of payoff) assert.ok(cmp(planPnl(planC.trades, row, feeOf), ZERO) > 0);
});

test("15 4.7 implication example: buy N / sell G is worth $0.40 gross and exactly $0.00 after 4% fees", () => {
  // contracts N (nominated) and G (wins general); G implies N: states (N,G) = (1,1), (1,0), (0,0)
  const pay = R([[1, 1], [1, 0], [0, 0]]);
  const book = [
    { asks: ladder([["0.34", "50"], ["0.36", "100"]]), bids: [] },
    { asks: [], bids: ladder([["0.35", "40"], ["0.33", "80"]]) },
  ];
  const run = (spec: FeeSpec): ArbSolution =>
    solved({ payoff: pay, contracts: book.map((b) => ({ ...b, spec })), nowMs: NOW_MS });
  assert.equal(at(run(P("0")).value, 4), "0.4");
  assert.equal(at(run(P("0.04")).value, 4), "0");
});

test("3.5 Frechet bounds: violation trades found by the exact LP", () => {
  // upper bound: C = A and B, C bid 0.55 above B ask 0.50 -> buy B, sell C: 10 shares earn $0.50
  const upper = solved({
    payoff: R([[1, 1], [1, 0], [0, 0], [0, 0]]),
    contracts: [
      { asks: ladder([["0.50", "10"]]), bids: [], spec: P("0") },
      { asks: [], bids: ladder([["0.55", "10"]]), spec: P("0") },
    ],
    nowMs: NOW_MS,
  });
  assert.equal(at(upper.value, 4), "0.5");
  // lower bound: A bid 0.70, B bid 0.60, C ask 0.25 -> sell A, sell B, buy C: 0.05 per share
  const lowerPay = R([[1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 0]]);
  const lower = solved({
    payoff: lowerPay,
    contracts: [
      { asks: [], bids: ladder([["0.70", "10"]]), spec: P("0") },
      { asks: [], bids: ladder([["0.60", "10"]]), spec: P("0") },
      { asks: ladder([["0.25", "10"]]), bids: [], spec: P("0") },
    ],
    nowMs: NOW_MS,
  });
  assert.equal(at(lower.value, 4), "0.5");
  // coherent quotes: zero profit and a certificate b <= E[A] <= a
  const quotes = [
    { bid: dec("0.60"), ask: dec("0.61") },
    { bid: dec("0.50"), ask: dec("0.51") },
    { bid: dec("0.30"), ask: dec("0.31") },
  ];
  const coherent = solved({
    payoff: lowerPay,
    contracts: quotes.map((q) => ({
      asks: [{ price: q.ask, size: dec("10") }],
      bids: [{ price: q.bid, size: dec("10") }],
      spec: P("0"),
    })),
    nowMs: NOW_MS,
  });
  assert.equal(at(coherent.value, 4), "0");
  assert.equal(at(sum(coherent.statePrices), 4), "1");
  impliedPrices(lowerPay, coherent.statePrices).forEach((e, j) => {
    const q = quotes[j];
    assert.ok(q);
    assert.ok(cmp(e, q.bid) >= 0 && cmp(e, q.ask) <= 0, `contract ${j}`);
  });
});

test("a complete set with asks summing to 0.97 is worth 3 cents per set before fees", () => {
  const s = solved({
    payoff: R([[1, 0, 0], [0, 1, 0], [0, 0, 1]]),
    contracts: ["0.30", "0.34", "0.33"].map((p) => ({ asks: ladder([[p, "100"]]), bids: [], spec: P("0") })),
    nowMs: NOW_MS,
  });
  assert.equal(at(s.value, 2), "3");
  assert.equal(at(sum(s.statePrices), 4), "1");
});

test("an unusable fee spec stops the LP instead of pricing with a guess", () => {
  const stale: FeeSpec = { ...P("0.04"), verifiedAt: "2020-01-01", ttlSec: 60 };
  const r = solveArb({
    payoff: R([[1], [0]]),
    contracts: [{ asks: ladder([["0.5", "1"]]), bids: [], spec: stale }],
    nowMs: NOW_MS,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "SPEC_STALE");
});

test("simplexMax rejects malformed, unbounded and infeasible-start inputs", () => {
  const one = ONE;
  assert.deepEqual(simplexMax([one], [[one]], []), { ok: false, error: "SHAPE" });
  assert.deepEqual(simplexMax([one], [[one]], [{ n: -1n, d: 1n }]), { ok: false, error: "NEGATIVE_RHS" });
  assert.deepEqual(simplexMax([one], [[{ n: -1n, d: 1n }]], [ZERO]), { ok: false, error: "UNBOUNDED" });
  const ok = simplexMax([one, one], [[one, ZERO], [ZERO, one]], [dec("2"), dec("3")]);
  assert.equal(ok.ok && at(ok.value, 0), "5");
});
