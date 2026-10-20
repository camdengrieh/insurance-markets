// Property tests with fixed seeds (mulberry32): no clock, no network, no floating point in the
// code under test. Each property runs over a few hundred generated cases.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Book, BookLevel, FeeSpec } from "../../types.js";
import { solveArb, type ArbContract } from "../../core/lp.js";
import { complementBook, normalizeSortedBook, parseBook } from "../../core/books.js";
import { walkBasket, type BasketLeg } from "../../core/basket.js";
import { feePerShare, orderFee } from "../../core/fees.js";
import { kalshiFeeSpec, polymarketFeeSpec } from "../../core/fee-specs.js";
import { partitionCheck, type QuotedLeg } from "../../core/relations.js";
import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  eq,
  mul,
  rat,
  ratFromInt,
  ratToDec,
  sub,
  sum,
  type Rational,
} from "../../core/rational.js";
import { walkLevels } from "../../core/walk.js";
import { NO, NOW_MS, SOURCE, YES, int, level, prng } from "./helpers.js";

const CASES = 300;

// price in ticks of 0.001 -> decimal string
const price = (ticks: number): string => `0.${String(ticks).padStart(3, "0")}`;
const px = (ticks: number): Rational => rat(BigInt(ticks), 1000n);

function must<T>(r: { ok: true; value: T } | { ok: false; error: string; detail?: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${r.error}: ${r.detail ?? ""}`);
  return (r as { ok: true; value: T }).value;
}

// Random uncrossed raw book with duplicates and zero sizes mixed in, in random order.
function rawBook(rand: () => number): { bids: BookLevel[]; asks: BookLevel[] } {
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  const nb = int(rand, 0, 6);
  const na = int(rand, 0, 6);
  for (let i = 0; i < nb; i += 1) bids.push(level(price(int(rand, 1, 499)), String(int(rand, 0, 50))));
  for (let i = 0; i < na; i += 1) asks.push(level(price(int(rand, 500, 999)), `${int(rand, 0, 50)}.${int(rand, 0, 99)}`));
  shuffle(bids, rand);
  shuffle(asks, rand);
  return { bids, asks };
}

function shuffle<T>(xs: T[], rand: () => number): void {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = rand() % (i + 1);
    const a = xs[i] as T;
    xs[i] = xs[j] as T;
    xs[j] = a;
  }
}

const meta = { token: YES, asOfMs: 1 };

test("rational algebra: commutative, associative, distributive, invertible", () => {
  const rand = prng(1);
  const r = (): Rational => rat(BigInt(int(rand, -500, 500)), BigInt(int(rand, 1, 997)));
  for (let i = 0; i < CASES; i += 1) {
    const a = r();
    const b = r();
    const c = r();
    assert.ok(eq(add(a, b), add(b, a)));
    assert.ok(eq(add(add(a, b), c), add(a, add(b, c))));
    assert.ok(eq(mul(a, add(b, c)), add(mul(a, b), mul(a, c))));
    assert.ok(eq(sub(add(a, b), b), a));
    if (b.n !== 0n) assert.ok(eq(div(mul(a, b), b), a));
    assert.equal(cmp(a, b), -cmp(b, a) as -1 | 0 | 1);
  }
});

test("directed rounding brackets the exact value and never moves it by more than one unit", () => {
  const rand = prng(2);
  for (let i = 0; i < CASES; i += 1) {
    const v = rat(BigInt(int(rand, -100000, 100000)), BigInt(int(rand, 1, 9973)));
    const places = int(rand, 0, 6);
    const unit = rat(1n, 10n ** BigInt(places));
    const floor = ratToDecAsRat(v, places, "floor");
    const ceil = ratToDecAsRat(v, places, "ceil");
    assert.ok(cmp(floor, v) <= 0 && cmp(v, ceil) <= 0);
    assert.ok(cmp(sub(ceil, floor), unit) <= 0);
  }
});

function ratToDecAsRat(v: Rational, places: number, mode: "floor" | "ceil"): Rational {
  const text = ratToDec(v, places, mode);
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const [whole = "0", frac = ""] = body.split(".");
  const n = BigInt(whole + frac.padEnd(places, "0"));
  return rat(negative ? -n : n, 10n ** BigInt(places));
}

test("normalisation: sorted, merged, idempotent and independent of raw order", () => {
  const rand = prng(3);
  for (let i = 0; i < CASES; i += 1) {
    const raw = rawBook(rand);
    const first = normalizeSortedBook(meta, "best_first", raw);
    const hasLevels = [...raw.bids, ...raw.asks].some((l) => Number(l.size) > 0);
    if (!hasLevels) {
      assert.equal(first.ok, false);
      continue;
    }
    const a = must(first).book;
    // sorted strictly (so also merged): bids descending, asks ascending
    for (let k = 1; k < a.bids.length; k += 1) assert.ok(Number((a.bids[k - 1] as BookLevel).price) > Number((a.bids[k] as BookLevel).price));
    for (let k = 1; k < a.asks.length; k += 1) assert.ok(Number((a.asks[k - 1] as BookLevel).price) < Number((a.asks[k] as BookLevel).price));
    // no zero sizes survive
    for (const l of [...a.bids, ...a.asks]) assert.ok(Number(l.size) > 0);
    // total size is preserved exactly
    const total = (ls: readonly BookLevel[]): Rational => sum(ls.map((l) => must(parsePositive(l.size))));
    assert.ok(eq(total(a.bids), total(raw.bids)));
    assert.ok(eq(total(a.asks), total(raw.asks)));
    // idempotent
    const b = must(normalizeSortedBook(meta, "best_first", { bids: a.bids, asks: a.asks })).book;
    assert.deepEqual(b.bids, a.bids);
    assert.deepEqual(b.asks, a.asks);
    // permutation of the raw levels (and the declared convention) changes nothing
    const shuffled = { bids: [...raw.bids], asks: [...raw.asks] };
    shuffle(shuffled.bids, rand);
    shuffle(shuffled.asks, rand);
    const c = must(normalizeSortedBook(meta, "best_last", shuffled)).book;
    assert.deepEqual(c.bids, a.bids);
    assert.deepEqual(c.asks, a.asks);
  }
});

function parsePositive(text: string): { ok: true; value: Rational } {
  const [whole = "0", frac = ""] = text.split(".");
  return { ok: true, value: rat(BigInt(whole + frac), 10n ** BigInt(frac.length)) };
}

test("complement is an involution and swaps best bid with best ask", () => {
  const rand = prng(4);
  for (let i = 0; i < CASES; i += 1) {
    const raw = rawBook(rand);
    if (![...raw.bids, ...raw.asks].some((l) => Number(l.size) > 0)) continue;
    const book: Book = must(normalizeSortedBook(meta, "best_first", raw)).book;
    const c = complementBook(book, NO);
    const back = complementBook(c, YES);
    assert.deepEqual(back.bids, book.bids);
    assert.deepEqual(back.asks, book.asks);
    assert.equal(c.derived, "complement");
    const p = must(parseBook(book));
    const pc = must(parseBook(c));
    if (p.bids[0] !== undefined) assert.ok(eq(pc.asks[0]?.price ?? ZERO, sub(ONE, p.bids[0].price)));
    if (p.asks[0] !== undefined) assert.ok(eq(pc.bids[0]?.price ?? ZERO, sub(ONE, p.asks[0].price)));
  }
});

test("depth walk: fills sum to min(size, depth); vwap lies between best and worst and moves against the trader", () => {
  const rand = prng(5);
  for (let i = 0; i < CASES; i += 1) {
    const n = int(rand, 1, 6);
    const ticks = new Set<number>();
    while (ticks.size < n) ticks.add(int(rand, 1, 998));
    const sorted = [...ticks].sort((a, b) => a - b);
    const asks = sorted.map((t) => ({ price: px(t), size: ratFromInt(int(rand, 1, 40)) }));
    const bids = [...asks].reverse();
    const depth = sum(asks.map((l) => l.size));
    let prevBuy: Rational | null = null;
    let prevSell: Rational | null = null;
    for (const size of [1, 3, 10, 25, 60, 200]) {
      const want = ratFromInt(size);
      const buy = walkLevels(asks, "buy", want);
      assert.ok(eq(buy.filled, cmp(want, depth) < 0 ? want : depth));
      assert.equal(buy.complete, cmp(want, depth) <= 0);
      assert.ok(eq(sum(buy.fills.map((f) => mul(f.price, f.qty))), buy.notional));
      const vwap = buy.vwap as Rational;
      assert.ok(cmp(vwap, buy.best as Rational) >= 0 && cmp(vwap, buy.worst as Rational) <= 0);
      if (prevBuy !== null && buy.complete) assert.ok(cmp(vwap, prevBuy) >= 0);
      if (buy.complete) prevBuy = vwap;
      const sell = walkLevels(bids, "sell", want);
      const sv = sell.vwap as Rational;
      assert.ok(cmp(sv, sell.best as Rational) <= 0 && cmp(sv, sell.worst as Rational) >= 0);
      if (prevSell !== null && sell.complete) assert.ok(cmp(sv, prevSell) <= 0);
      if (sell.complete) prevSell = sv;
    }
  }
});

test("curve fees are non-negative, symmetric in p and 1 - p, and bounded by rate / 4", () => {
  const rand = prng(6);
  for (let i = 0; i < CASES; i += 1) {
    const rate = rat(BigInt(int(rand, 0, 100)), 1000n);
    const spec = polymarketFeeSpec({ rate: ratToDec(rate, 3, "floor"), source: SOURCE });
    const t = int(rand, 1, 999);
    const f = unwrap(feePerShare(spec, "taker", "buy", px(t)));
    const g = unwrap(feePerShare(spec, "taker", "sell", px(1000 - t)));
    assert.ok(eq(f, g));
    assert.ok(cmp(f, ZERO) >= 0);
    assert.ok(cmp(f, div(rate, ratFromInt(4))) <= 0);
  }
});

function unwrap<T>(r: { ok: true; value: T } | { ok: false; code: string; detail: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${r.code}: ${r.detail}`);
  return (r as { ok: true; value: T }).value;
}

test("order-level rounding never undercharges a ceil-rounded venue and equals the sum when exact", () => {
  const rand = prng(7);
  const kalshi = kalshiFeeSpec({ multiplier: "1", source: SOURCE });
  const exact: FeeSpec = { ...kalshi, rounding: "none" };
  for (let i = 0; i < CASES; i += 1) {
    const fills = Array.from({ length: int(rand, 1, 4) }, () => ({ price: px(int(rand, 10, 990)), qty: ratFromInt(int(rand, 1, 300)) }));
    const smooth = sum(fills.map((f) => mul(unwrap(feePerShare(exact, "taker", "buy", f.price)), f.qty)));
    assert.ok(eq(unwrap(orderFee(exact, "taker", "buy", fills)), smooth));
    const rounded = unwrap(orderFee(kalshi, "taker", "buy", fills));
    assert.ok(cmp(rounded, smooth) >= 0);
    assert.ok(cmp(sub(rounded, smooth), rat(1n, 100n)) <= 0); // at most one cent of rounding
  }
});

test("basket walk: marginal net non-increasing, taken steps above tau, totals equal the sum of steps", () => {
  const rand = prng(8);
  const spec = polymarketFeeSpec({ rate: "0.03", source: SOURCE });
  const k = kalshiFeeSpec({ multiplier: "1", source: SOURCE });
  for (let i = 0; i < CASES; i += 1) {
    const ladderOf = (start: number, dir: 1): { price: Rational; size: Rational }[] => {
      let t = start;
      return Array.from({ length: int(rand, 1, 5) }, () => {
        t += dir * int(rand, 1, 8);
        return { price: px(Math.min(t, 990)), size: ratFromInt(int(rand, 1, 60)) };
      });
    };
    // dedupe equal capped prices by construction: start low enough that the cap is not hit
    const a = ladderOf(int(rand, 100, 300), 1);
    const b = ladderOf(int(rand, 400, 600), 1);
    const legs: BasketLeg[] = [
      { id: "a", side: "buy", levels: a, spec },
      { id: "b", side: "buy", levels: b, spec: k },
    ];
    const tau = rat(BigInt(int(rand, 0, 30)), 1000n);
    const out = unwrap(walkBasket(legs, { guaranteedPayoff: ONE, tau, lockRate: rat(1n, 200n), nowMs: NOW_MS }));
    let prev: Rational | null = null;
    for (const s of out.steps) {
      assert.ok(cmp(s.edge.net, tau) > 0);
      if (prev !== null) assert.ok(cmp(prev, s.edge.net) >= 0);
      prev = s.edge.net;
    }
    if (out.stopReason === "below_tau") assert.ok(cmp(out.rejected?.edge.net ?? ONE, tau) <= 0);
    const qty = sum(out.steps.map((s) => s.qty));
    assert.ok(eq(out.totals.qty, qty));
    assert.ok(eq(out.totals.gross, sum(out.steps.map((s) => mul(s.edge.gross, s.qty)))));
    assert.ok(eq(out.totals.net, sub(sub(sub(sub(out.totals.gross, out.totals.fees), out.totals.lock), out.totals.reserve), out.totals.haircut)));
    // per-leg fills conserve the taken quantity
    for (const leg of out.perLeg) assert.ok(eq(sum(leg.fills.map((f) => f.qty)), qty));
  }
});

test("partition gross identities: long = 1 - sum(asks), short = sum(bids) - 1 (no fees)", () => {
  const rand = prng(9);
  const free = polymarketFeeSpec({ rate: "0", source: SOURCE });
  for (let i = 0; i < CASES; i += 1) {
    const n = int(rand, 2, 6);
    const legs: QuotedLeg[] = Array.from({ length: n }, (_, j) => {
      const bid = int(rand, 5, 400);
      return { id: `o${j}`, bid: px(bid), ask: px(bid + int(rand, 1, 50)), spec: free };
    });
    const r = partitionCheck(legs, "by_rule", { nowMs: NOW_MS });
    assert.equal(r.long.kind, "ok");
    assert.equal(r.short.kind, "ok");
    if (r.long.kind === "ok") assert.ok(eq(r.long.edge.net, sub(ONE, r.sumAsk as Rational)));
    if (r.short.kind === "ok") assert.ok(eq(r.short.edge.net, sub(r.sumBid as Rational, ONE)));
    // long and short cannot both be positive on uncrossed quotes (asks >= bids)
    if (r.long.kind === "ok" && r.short.kind === "ok") {
      assert.ok(cmp(r.long.edge.net, ZERO) <= 0 || cmp(r.short.edge.net, ZERO) <= 0);
    }
  }
});

test("LP: never negative, matches brute force on small integer plans, duals form a distribution", () => {
  const rand = prng(10);
  const free = polymarketFeeSpec({ rate: "0", source: SOURCE });
  let positives = 0;
  for (let i = 0; i < 120; i += 1) {
    const W = 3;
    const J = 3;
    const payoff: Rational[][] = [];
    for (let w = 0; w < W; w += 1) payoff.push(Array.from({ length: J }, () => ratFromInt(int(rand, 0, 1))));
    // up to one ask and one bid level per contract, sizes 1..2, prices 5..95 cents
    const contracts: ArbContract[] = Array.from({ length: J }, () => {
      const bid = int(rand, 5, 90);
      const ask = bid + int(rand, -3, 8);
      return {
        asks: ask >= 1 && ask <= 99 ? [{ price: rat(BigInt(ask), 100n), size: ratFromInt(int(rand, 1, 2)) }] : [],
        bids: [{ price: rat(BigInt(bid), 100n), size: ratFromInt(int(rand, 1, 2)) }],
        spec: free,
      };
    });
    const solved = solveArb({ payoff, contracts, nowMs: NOW_MS });
    assert.equal(solved.ok, true);
    if (!solved.ok) continue;
    const v = solved.value;
    assert.ok(cmp(v.value, ZERO) >= 0);
    // brute force over integer quantities on every column
    const cols: { j: number; side: "buy" | "sell"; price: Rational; size: number }[] = [];
    contracts.forEach((c, j) => {
      for (const l of c.asks) cols.push({ j, side: "buy", price: l.price, size: Number(l.size.n) });
      for (const l of c.bids) cols.push({ j, side: "sell", price: l.price, size: Number(l.size.n) });
    });
    let best = ZERO;
    const q = new Array<number>(cols.length).fill(0);
    const rec = (k: number): void => {
      if (k === cols.length) {
        let worst: Rational | null = null;
        for (const row of payoff) {
          let pnl = ZERO;
          cols.forEach((c, idx) => {
            const amount = ratFromInt(q[idx] as number);
            const pay = row[c.j] as Rational;
            pnl = add(pnl, c.side === "buy" ? mul(amount, sub(pay, c.price)) : mul(amount, sub(c.price, pay)));
          });
          if (worst === null || cmp(pnl, worst) < 0) worst = pnl;
        }
        if (worst !== null && cmp(worst, best) > 0) best = worst;
        return;
      }
      const col = cols[k];
      if (col === undefined) return;
      for (let x = 0; x <= col.size; x += 1) {
        q[k] = x;
        rec(k + 1);
      }
    };
    rec(0);
    if (cmp(best, ZERO) > 0) positives += 1;
    assert.ok(cmp(v.value, best) >= 0, `LP ${v.value.n}/${v.value.d} below brute force ${best.n}/${best.d}`);
    if (cmp(best, ZERO) > 0) assert.ok(cmp(v.value, ZERO) > 0);
    if (cmp(v.value, ZERO) > 0) {
      assert.ok(eq(sum(v.statePrices), ONE));
      assert.ok(v.statePrices.every((p) => cmp(p, ZERO) >= 0));
    }
  }
  // the generator must actually exercise arbitrage cases, not just empty ones
  assert.ok(positives >= 10, `only ${positives} positive instances`);
});
