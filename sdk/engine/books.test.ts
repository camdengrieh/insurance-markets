import assert from "node:assert/strict";
import { test } from "vitest";
import type { Book } from "../model.js";
import {
  checkMirror,
  complementBook,
  midPrice,
  normalizeAmmQuotes,
  normalizeKalshiBook,
  normalizeSortedBook,
  normalizeYesSideOnly,
  parseBook,
  topOfBook,
} from "./books.js";
import { ratToDecExact } from "../money/rational.js";
import { NO, YES, level } from "./fixtures/helpers.js";

const meta = { token: YES, asOfMs: 1_000 };
const noMeta = { token: NO, asOfMs: 1_000 };

function must<T>(r: { ok: true; value: T } | { ok: false; error: string; detail?: string }): T {
  assert.equal(r.ok, true, r.ok ? "" : `${r.error}: ${r.detail ?? ""}`);
  return (r as { ok: true; value: T }).value;
}

function err(r: { ok: boolean; error?: string }): string | undefined {
  assert.equal(r.ok, false);
  return r.error;
}

const prices = (levels: Book["bids"]): string[] => levels.map((l) => l.price);

test("best_first (XO): sorted explicitly, canonical decimals, native", () => {
  const n = must(
    normalizeSortedBook(meta, "best_first", {
      bids: [level("0.470", "10.000"), level("0.46", "5")],
      asks: [level("0.48", "7"), level("0.490", "3")],
    }),
  );
  assert.deepEqual(n.book.bids, [level("0.47", "10"), level("0.46", "5")]);
  assert.deepEqual(n.book.asks, [level("0.48", "7"), level("0.49", "3")]);
  assert.equal(n.book.derived, "native");
  assert.equal(n.book.convention, "best_first");
  assert.deepEqual(n.warnings, []);
});

test("best_last (Polymarket CLOB): best level is last on the wire and still ends up first", () => {
  const n = must(
    normalizeSortedBook(meta, "best_last", {
      bids: [level("0.44", "9"), level("0.45", "1"), level("0.46", "2")],
      asks: [level("0.50", "4"), level("0.49", "3"), level("0.48", "2")],
    }),
  );
  assert.deepEqual(prices(n.book.bids), ["0.46", "0.45", "0.44"]);
  assert.deepEqual(prices(n.book.asks), ["0.48", "0.49", "0.5"]);
  assert.deepEqual(n.warnings, []);
});

test("a raw order that contradicts the declared convention is repaired and warned about", () => {
  const n = must(
    normalizeSortedBook(meta, "best_first", {
      bids: [level("0.44", "9"), level("0.46", "2")],
      asks: [level("0.50", "4"), level("0.48", "2")],
    }),
  );
  assert.deepEqual(prices(n.book.bids), ["0.46", "0.44"]);
  assert.deepEqual(prices(n.book.asks), ["0.48", "0.5"]);
  assert.equal(n.warnings.length, 2);
});

test("duplicate prices merge exactly and zero-size levels disappear", () => {
  const n = must(
    normalizeSortedBook(meta, "best_first", {
      bids: [level("0.40", "1.5"), level("0.4", "2.25"), level("0.39", "0")],
      asks: [level("0.6", "1")],
    }),
  );
  assert.deepEqual(n.book.bids, [level("0.4", "3.75")]);
});

test("malformed levels, out-of-range prices, crossed and empty books fail closed", () => {
  const bad = (bids: Book["bids"], asks: Book["asks"]): string | undefined =>
    err(normalizeSortedBook(meta, "best_first", { bids, asks }));
  assert.equal(bad([level("0.4e1", "1")], []), "SCHEMA_DRIFT");
  assert.equal(bad([level("-0.4", "1")], []), "SCHEMA_DRIFT");
  assert.equal(bad([level("0", "1")], []), "SCHEMA_DRIFT");
  assert.equal(bad([], [level("1", "1")]), "SCHEMA_DRIFT");
  assert.equal(bad([level("0.4", "x")], []), "SCHEMA_DRIFT");
  assert.equal(bad([level("0.5", "1")], [level("0.5", "1")]), "SCHEMA_DRIFT"); // locked
  assert.equal(bad([level("0.6", "1")], [level("0.5", "1")]), "SCHEMA_DRIFT"); // crossed
  assert.equal(bad([], []), "EMPTY_BOOK");
  assert.equal(bad([level("0.4", "0")], []), "EMPTY_BOOK"); // only zero-size levels
});

test("a one-sided book is valid and has no mid", () => {
  const n = must(normalizeSortedBook(meta, "best_first", { bids: [level("0.4", "1")], asks: [] }));
  const parsed = must(parseBook(n.book));
  assert.equal(midPrice(parsed), null);
  assert.equal(topOfBook(parsed).ask, null);
  assert.equal(ratToDecExact(topOfBook(parsed).bid ?? { n: 0n, d: 1n }), "0.4");
});

test("Kalshi: bids only on both sides; each side's asks come from the other side's bids", () => {
  const k = must(
    normalizeKalshiBook(meta, noMeta, {
      yesBids: [level("0.38", "10"), level("0.40", "100")],
      noBids: [level("0.55", "50"), level("0.50", "20")],
    }),
  );
  // YES ask = 1 - best NO bid
  assert.deepEqual(k.yes.book.bids, [level("0.4", "100"), level("0.38", "10")]);
  assert.deepEqual(k.yes.book.asks, [level("0.45", "50"), level("0.5", "20")]);
  // NO ask = 1 - best YES bid
  assert.deepEqual(k.no.book.bids, [level("0.55", "50"), level("0.5", "20")]);
  assert.deepEqual(k.no.book.asks, [level("0.6", "100"), level("0.62", "10")]);
  // Real resting orders on both views, so both are executable; they are one pool of liquidity.
  assert.equal(k.yes.book.derived, "native");
  assert.equal(k.no.book.derived, "native");
  assert.equal(checkMirror(k.yes.book, k.no.book).mirrored, true);
});

test("Kalshi: yes bid + no bid at or above 1 is a crossed book and fails closed", () => {
  assert.equal(
    err(normalizeKalshiBook(meta, noMeta, { yesBids: [level("0.60", "1")], noBids: [level("0.45", "1")] })),
    "SCHEMA_DRIFT",
  );
});

test("Kalshi: an empty side still yields a one-sided book on the other", () => {
  const k = must(normalizeKalshiBook(meta, noMeta, { yesBids: [level("0.4", "10")], noBids: [] }));
  assert.equal(k.yes.book.asks.length, 0);
  assert.deepEqual(k.no.book.asks, [level("0.6", "10")]);
});

test("yes-side-only (Limitless): the NO book is a synthetic complement and says so", () => {
  const r = must(
    normalizeYesSideOnly(meta, NO, { bids: [level("0.40", "10")], asks: [level("0.45", "20")] }),
  );
  assert.equal(r.yes.book.derived, "native");
  assert.equal(r.no.book.derived, "complement");
  assert.deepEqual(r.no.book.bids, [level("0.55", "20")]);
  assert.deepEqual(r.no.book.asks, [level("0.6", "10")]);
  assert.equal(r.no.book.token.tokenId, NO.tokenId);
  assert.ok(r.no.warnings.length > 0);
});

test("complement is an involution on levels and flips the derived tag", () => {
  const n = must(
    normalizeSortedBook(meta, "best_first", {
      bids: [level("0.47", "10"), level("0.46", "5")],
      asks: [level("0.48", "7"), level("0.49", "3")],
    }),
  ).book;
  const c = complementBook(n, NO);
  assert.equal(c.derived, "complement");
  assert.deepEqual(c.bids, [level("0.51", "3"), level("0.52", "7")].sort((a, b) => Number(b.price) - Number(a.price)));
  const back = complementBook(c, YES);
  assert.deepEqual(back.bids, n.bids);
  assert.deepEqual(back.asks, n.asks);
  assert.equal(back.derived, "native");
});

test("mirror check detects a true mirror and a mismatch (no double counting)", () => {
  const yes = must(
    normalizeSortedBook(meta, "mirrored_per_token", {
      bids: [level("0.47", "10")],
      asks: [level("0.48", "7")],
    }),
  ).book;
  const mirror = must(
    normalizeSortedBook(noMeta, "mirrored_per_token", { bids: [level("0.52", "7")], asks: [level("0.53", "10")] }),
  ).book;
  assert.equal(checkMirror(yes, mirror).mirrored, true);
  const other = must(
    normalizeSortedBook(noMeta, "mirrored_per_token", { bids: [level("0.52", "8")], asks: [level("0.53", "10")] }),
  ).book;
  assert.equal(checkMirror(yes, other).mirrored, false);
});

test("AMM pool quotes become incremental levels rounded against the trader", () => {
  const n = must(
    normalizeAmmQuotes(meta, {
      buys: [
        { size: "10", amount: "4" },
        { size: "30", amount: "13" },
      ],
      sells: [
        { size: "10", amount: "3.5" },
        { size: "20", amount: "6.5" },
      ],
    }),
  );
  assert.deepEqual(n.book.asks, [level("0.4", "10"), level("0.45", "20")]);
  assert.deepEqual(n.book.bids, [level("0.35", "10"), level("0.3", "10")]);
  assert.equal(n.book.convention, "amm_pool");
  const thirds = must(normalizeAmmQuotes(meta, { buys: [{ size: "3", amount: "1" }], sells: [] }));
  // 1/3 per share rounds UP for an ask
  assert.deepEqual(thirds.book.asks, [level("0.333333334", "3")]);
  const sells = must(normalizeAmmQuotes(meta, { buys: [], sells: [{ size: "3", amount: "1" }] }));
  assert.deepEqual(sells.book.bids, [level("0.333333333", "3")]);
});

test("AMM quotes that get cheaper with size, duplicate sizes or junk fail closed", () => {
  const buys = (q: { size: string; amount: string }[]): string | undefined =>
    err(normalizeAmmQuotes(meta, { buys: q, sells: [] }));
  assert.equal(buys([{ size: "10", amount: "5" }, { size: "20", amount: "8" }]), "SCHEMA_DRIFT");
  assert.equal(buys([{ size: "10", amount: "4" }, { size: "10", amount: "5" }]), "SCHEMA_DRIFT");
  assert.equal(buys([{ size: "0", amount: "4" }]), "SCHEMA_DRIFT");
  assert.equal(buys([{ size: "10", amount: "11" }]), "SCHEMA_DRIFT"); // price above 1
  assert.equal(err(normalizeAmmQuotes(meta, { buys: [], sells: [] })), "EMPTY_BOOK");
});

test("parseBook re-sorts a hand-built unsorted book so the walker cannot be fooled", () => {
  const sneaky: Book = {
    token: YES,
    bids: [level("0.40", "1"), level("0.45", "1")],
    asks: [level("0.60", "1"), level("0.55", "1")],
    convention: "best_first",
    asOfMs: 1,
    derived: "native",
  };
  const parsed = must(parseBook(sneaky));
  assert.equal(ratToDecExact(parsed.bids[0]?.price ?? { n: 0n, d: 1n }), "0.45");
  assert.equal(ratToDecExact(parsed.asks[0]?.price ?? { n: 0n, d: 1n }), "0.55");
});
