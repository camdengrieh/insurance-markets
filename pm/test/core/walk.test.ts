import assert from "node:assert/strict";
import { test } from "node:test";
import type { Book, FeeSpec } from "../../types.js";
import { complementBook, normalizeSortedBook, parseBook } from "../../core/books.js";
import { kalshiFeeSpec, polymarketFeeSpec, unknownFeeSpec, xoFeeSpec } from "../../core/fee-specs.js";
import { quoteBook, walkBook, walkLevels } from "../../core/walk.js";
import { dec, ratToDecExact } from "../../core/rational.js";
import { NO, NOW_MS, SOURCE, YES, at, ladder, level } from "./helpers.js";

const xo = xoFeeSpec({ takerBps: "400", source: SOURCE });

function book(): Book {
  const n = normalizeSortedBook(
    { token: YES, asOfMs: NOW_MS - 1000 },
    "best_first",
    {
      bids: [level("0.31", "100"), level("0.30", "400")],
      asks: [level("0.32", "200"), level("0.326", "300"), level("0.334", "500")],
    },
  );
  assert.equal(n.ok, true);
  return (n as { ok: true; value: { book: Book } }).value.book;
}

function quote(b: Book, side: "buy" | "sell", size: string, spec: FeeSpec = xo) {
  const r = quoteBook(b, side, size, spec, NOW_MS);
  assert.equal(r.ok, true);
  return (r as Extract<ReturnType<typeof quoteBook>, { ok: true }>).value;
}

test("a buy walks asks from the lowest price up and a sell walks bids from the highest down", () => {
  const parsed = parseBook(book());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const buy = walkBook(parsed.value, "buy", dec("250"));
  assert.deepEqual(buy.fills.map((f) => [at(f.price, 3), at(f.qty, 0)]), [["0.32", "200"], ["0.326", "50"]]);
  assert.equal(at(buy.notional, 3), "80.3");
  assert.equal(ratToDecExact(buy.vwap ?? dec("0")), "0.3212");
  const sell = walkBook(parsed.value, "sell", dec("150"));
  assert.deepEqual(sell.fills.map((f) => [at(f.price, 2), at(f.qty, 0)]), [["0.31", "100"], ["0.3", "50"]]);
  assert.equal(at(sell.worst, 2), "0.3");
});

test("size beyond the depth fills partially and says so", () => {
  const parsed = parseBook(book());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const w = walkBook(parsed.value, "buy", dec("2000"));
  assert.equal(w.complete, false);
  assert.equal(at(w.filled, 0), "1000");
  const none = walkBook({ ...parsed.value, asks: [] }, "buy", dec("1"));
  assert.equal(none.vwap, null);
  assert.equal(none.best, null);
  assert.equal(none.complete, false);
});

test("a limit price stops the walk before a worse level", () => {
  const w = walkLevels(ladder([["0.32", "200"], ["0.34", "300"]]), "buy", dec("400"), dec("0.33"));
  assert.equal(at(w.filled, 0), "200");
  const s = walkLevels(ladder([["0.31", "100"], ["0.29", "300"]]), "sell", dec("400"), dec("0.30"));
  assert.equal(at(s.filled, 0), "100");
  assert.throws(() => walkLevels(ladder([["0.3", "1"]]), "buy", dec("0")), RangeError);
});

test("quote: vwap rounds against the trader and fees use the order-level rule", () => {
  const b = book();
  const buy = quote(b, "buy", "250");
  assert.equal(buy.quote.bestPrice, "0.32");
  assert.equal(buy.quote.vwap, "0.3212");
  assert.equal(buy.quote.filledSize, "250");
  assert.equal(buy.quote.feeSpecId, "xo:curve_pq");
  assert.equal(buy.executable, true);
  // fee 200 x 0.008704 + 50 x 0.00878896 = 2.18...: floor to 6 dp
  assert.equal(buy.fee, "2.180248");
  assert.equal(buy.netCost, "82.480248");
  const sell = quote(b, "sell", "150");
  assert.equal(sell.quote.vwap, "0.306666666"); // 46/150 rounds DOWN for a sell
  assert.equal(sell.netCost === null, false);
  const third = quote({ ...b, asks: [level("0.5", "3")] }, "buy", "3");
  assert.equal(third.quote.vwap, "0.5");
  const odd = quote({ ...b, asks: [level("0.4", "1"), level("0.5", "2")] }, "buy", "3");
  assert.equal(odd.quote.vwap, "0.466666667"); // 1.4/3 rounds UP for a buy
});

test("quote of a partial fill is not executable and reports the filled size", () => {
  const q = quote(book(), "buy", "5000");
  assert.equal(q.complete, false);
  assert.equal(q.executable, false);
  assert.equal(q.quote.filledSize, "1000");
  assert.equal(q.quote.requestedSize, "5000");
});

test("quote of a complement-derived book is shown but never executable", () => {
  const c = complementBook(book(), NO);
  const q = quote(c, "buy", "100");
  assert.equal(q.quote.derived, "complement");
  assert.equal(q.executable, false);
  assert.equal(q.complete, true);
});

test("quote with an unknown or stale fee model keeps the price but drops the cost", () => {
  const u = quote(book(), "buy", "100", unknownFeeSpec("worldx", SOURCE));
  assert.equal(u.fee, null);
  assert.equal(u.netCost, null);
  assert.equal(u.feeError?.code, "MODEL_UNKNOWN");
  assert.equal(u.executable, false);
  assert.equal(u.quote.vwap, "0.32");
  const stale = quote(book(), "buy", "100", { ...xo, verifiedAt: "2020-01-01", ttlSec: 60 });
  assert.equal(stale.feeError?.code, "SPEC_STALE");
  const noMaker = quoteBook(book(), "buy", "100", xo, NOW_MS, "maker");
  assert.equal(noMaker.ok && noMaker.value.feeError?.code, "PARAMS_MISSING");
});

test("quote rejects non-decimal or non-positive sizes", () => {
  for (const bad of ["0", "-1", "1e3", "", "0x10", "1,000"]) {
    assert.equal(quoteBook(book(), "buy", bad, xo, NOW_MS).ok, false, bad);
  }
});

test("a one-sided empty side returns a null vwap with no fee charged", () => {
  const b: Book = { ...book(), asks: [] };
  const q = quote(b, "buy", "10");
  assert.equal(q.quote.vwap, null);
  assert.equal(q.quote.bestPrice, null);
  assert.equal(q.quote.filledSize, "0");
  assert.equal(q.complete, false);
});

test("Kalshi quotes pick up the cent-grid order rounding", () => {
  const k = kalshiFeeSpec({ multiplier: "1", source: SOURCE });
  const b: Book = { ...book(), asks: [level("0.62", "40")] };
  const q = quote(b, "buy", "31", k);
  assert.equal(q.fee, "0.52"); // 31 x 0.016492 = 0.511252 -> 0.52
  assert.equal(q.notional, "19.22");
  assert.equal(q.netCost, "19.74");
  const p = quote(b, "buy", "31", polymarketFeeSpec({ rate: "0.05", source: SOURCE }));
  assert.equal(p.fee, "0.36518"); // 31 x 0.05 x 0.62 x 0.38, already on the 5 dp grid
});
