// Order-book normalisation (docs/aggregation-design.md section 2.2).
//
// Venues disagree about which end of the array is the best level, whether the NO side is a
// separate book, and whether a book exists at all. This module turns every raw shape into the
// one normal form the engine uses: explicit sort (bids descending, asks ascending), merged
// duplicate prices, zero-size levels dropped, prices strictly inside (0, 1), and a `derived`
// flag that says whether the levels are real resting orders ("native") or arithmetic on the
// other side ("complement", never executable).
//
// The raw order is never trusted: levels are always re-sorted. A raw order that contradicts the
// declared convention only produces a warning, because it can mean the venue silently changed
// (Polymarket /price was observed to disagree with its own docs).

import type { AdapterError, Book, BookConvention, BookDerivation, BookLevel, Result, TokenRef } from "../types.js";
import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  ratFromDec,
  ratToDec,
  ratToDecExact,
  sub,
  type Rational,
} from "./rational.js";

export interface ParsedLevel {
  readonly price: Rational;
  readonly size: Rational;
}

export interface ParsedBook {
  readonly token: TokenRef;
  // Bids descending, asks ascending.
  readonly bids: readonly ParsedLevel[];
  readonly asks: readonly ParsedLevel[];
  readonly convention: BookConvention;
  readonly derived: BookDerivation;
  readonly asOfMs: number;
}

export interface BookMeta {
  readonly token: TokenRef;
  readonly asOfMs: number;
  readonly venueTsMs?: number;
  readonly hash?: string;
}

export interface NormalizedBook {
  readonly book: Book;
  readonly warnings: readonly string[];
}

function bad(error: AdapterError, detail: string): { readonly ok: false; readonly error: AdapterError; readonly detail: string } {
  return { ok: false, error, detail };
}

// ---------------------------------------------------------------------------------------------
// Level parsing and canonical form

function parseLevels(levels: readonly BookLevel[], side: string): Result<ParsedLevel[], AdapterError> {
  const out: ParsedLevel[] = [];
  for (const level of levels) {
    const price = ratFromDec(level.price);
    const size = ratFromDec(level.size);
    if (!price.ok || !size.ok) return bad("SCHEMA_DRIFT", `${side} level is not a plain decimal`);
    if (cmp(price.value, ZERO) <= 0 || cmp(price.value, ONE) >= 0) {
      return bad("SCHEMA_DRIFT", `${side} price must be strictly between 0 and 1`);
    }
    out.push({ price: price.value, size: size.value });
  }
  return { ok: true, value: out };
}

// Drops zero sizes, merges equal prices (exact size sum) and sorts. bids: best (highest) first.
function canonical(levels: readonly ParsedLevel[], descending: boolean): ParsedLevel[] {
  const merged: ParsedLevel[] = [];
  for (const level of levels) {
    if (cmp(level.size, ZERO) === 0) continue;
    const at = merged.findIndex((m) => cmp(m.price, level.price) === 0);
    const existing = at >= 0 ? merged[at] : undefined;
    if (existing === undefined) merged.push(level);
    else merged[at] = { price: existing.price, size: add(existing.size, level.size) };
  }
  merged.sort((a, b) => (descending ? -cmp(a.price, b.price) : cmp(a.price, b.price)));
  return merged;
}

function toLevel(level: ParsedLevel): BookLevel {
  const price = ratToDecExact(level.price);
  const size = ratToDecExact(level.size);
  if (price === null || size === null) throw new RangeError("book level not representable");
  return { price, size };
}

function monotone(values: readonly Rational[], direction: "asc" | "desc"): boolean {
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const next = values[i];
    if (prev === undefined || next === undefined) continue;
    const c = cmp(prev, next);
    if (direction === "asc" ? c > 0 : c < 0) return false;
  }
  return true;
}

function assemble(
  meta: BookMeta,
  convention: BookConvention,
  derived: BookDerivation,
  bids: readonly ParsedLevel[],
  asks: readonly ParsedLevel[],
  warnings: readonly string[],
): Result<NormalizedBook, AdapterError> {
  const bestBid = bids[0];
  const bestAsk = asks[0];
  if (bestBid === undefined && bestAsk === undefined) return bad("EMPTY_BOOK", "book has no levels");
  // A crossed or locked book is never a market state a matching engine leaves behind. Treat it
  // as corrupt or mid-update and fail closed instead of computing an edge from it.
  if (bestBid !== undefined && bestAsk !== undefined && cmp(bestBid.price, bestAsk.price) >= 0) {
    return bad("SCHEMA_DRIFT", "crossed or locked book");
  }
  const book: Book = {
    token: meta.token,
    bids: bids.map(toLevel),
    asks: asks.map(toLevel),
    convention,
    asOfMs: meta.asOfMs,
    ...(meta.venueTsMs === undefined ? {} : { venueTsMs: meta.venueTsMs }),
    ...(meta.hash === undefined ? {} : { hash: meta.hash }),
    derived,
  };
  return { ok: true, value: { book, warnings } };
}

// ---------------------------------------------------------------------------------------------
// Single-token books: XO, Polymarket, Polymarket US, Opinion

export interface RawSidedBook {
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
}

export type SortedConvention = "best_first" | "best_last" | "mirrored_per_token";

// Normalises one token's own book. `best_first` (XO, Polymarket US) lists the best level first
// on both sides; `best_last` (Polymarket CLOB, Kalshi) lists it last; `mirrored_per_token`
// (Opinion) has one book per token with the other token a mirror image and is treated as
// best_first for the order warning. All three are re-sorted regardless.
export function normalizeSortedBook(meta: BookMeta, convention: SortedConvention, raw: RawSidedBook): Result<NormalizedBook, AdapterError> {
  const bids = parseLevels(raw.bids, "bid");
  if (!bids.ok) return bids;
  const asks = parseLevels(raw.asks, "ask");
  if (!asks.ok) return asks;
  const warnings: string[] = [];
  const bestFirst = convention !== "best_last";
  if (!monotone(bids.value.map((l) => l.price), bestFirst ? "desc" : "asc")) {
    warnings.push(`bid order does not match declared convention ${convention}`);
  }
  if (!monotone(asks.value.map((l) => l.price), bestFirst ? "asc" : "desc")) {
    warnings.push(`ask order does not match declared convention ${convention}`);
  }
  return assemble(meta, convention, "native", canonical(bids.value, true), canonical(asks.value, false), warnings);
}

// ---------------------------------------------------------------------------------------------
// Complement and mirror handling

function flip(levels: readonly ParsedLevel[]): ParsedLevel[] {
  return levels.map((l) => ({ price: sub(ONE, l.price), size: l.size }));
}

export function parseBook(book: Book): Result<ParsedBook, AdapterError> {
  const bids = parseLevels(book.bids, "bid");
  if (!bids.ok) return bids;
  const asks = parseLevels(book.asks, "ask");
  if (!asks.ok) return asks;
  // Re-canonicalise so a hand-built Book can never smuggle an unsorted ladder into the walker.
  return {
    ok: true,
    value: {
      token: book.token,
      bids: canonical(bids.value, true),
      asks: canonical(asks.value, false),
      convention: book.convention,
      derived: book.derived,
      asOfMs: book.asOfMs,
    },
  };
}

// The other outcome's view of the same liquidity: NO bids are 1 minus YES asks and NO asks are
// 1 minus YES bids. The result is synthetic arithmetic, so it is tagged "complement" and must
// never be summed with the original book as if it were extra depth. Applying it twice returns
// the original levels, which are native again.
export function complementBook(book: Book, other: TokenRef): Book {
  const parsed = parseBook(book);
  if (!parsed.ok) throw new RangeError(`cannot complement a malformed book: ${parsed.detail ?? parsed.error}`);
  return {
    token: other,
    bids: canonical(flip(parsed.value.asks), true).map(toLevel),
    asks: canonical(flip(parsed.value.bids), false).map(toLevel),
    convention: book.convention,
    asOfMs: book.asOfMs,
    ...(book.venueTsMs === undefined ? {} : { venueTsMs: book.venueTsMs }),
    ...(book.hash === undefined ? {} : { hash: book.hash }),
    derived: book.derived === "complement" ? "native" : "complement",
  };
}

export interface MirrorReport {
  readonly mirrored: boolean;
  readonly detail: string | null;
}

// True when `other` is exactly the complement of `book` (same sizes at mirrored prices). Used to
// detect that two per-token books are one liquidity pool, so depth is never double counted.
export function checkMirror(book: Book, other: Book): MirrorReport {
  const a = parseBook(book);
  const b = parseBook(other);
  if (!a.ok || !b.ok) return { mirrored: false, detail: "malformed book" };
  const same = (x: readonly ParsedLevel[], y: readonly ParsedLevel[]): boolean =>
    x.length === y.length && x.every((l, i) => {
      const m = y[i];
      return m !== undefined && cmp(l.price, m.price) === 0 && cmp(l.size, m.size) === 0;
    });
  if (!same(canonical(flip(a.value.asks), true), b.value.bids)) {
    return { mirrored: false, detail: "bids differ from the complement of the other asks" };
  }
  if (!same(canonical(flip(a.value.bids), false), b.value.asks)) {
    return { mirrored: false, detail: "asks differ from the complement of the other bids" };
  }
  return { mirrored: true, detail: null };
}

// ---------------------------------------------------------------------------------------------
// Kalshi: bids only on both sides

export interface RawKalshiBook {
  // Resting bids to buy YES and resting bids to buy NO (the venue publishes no asks).
  readonly yesBids: readonly BookLevel[];
  readonly noBids: readonly BookLevel[];
}

// A bid for NO at price n is a resting order that sells YES at 1 - n, so the YES book is
// (yes bids, 1 - no bids) and the NO book is (no bids, 1 - yes bids). Both views are built from
// real resting orders, so both are "native" and executable, but they are ONE pool of liquidity:
// never add the two books together.
export function normalizeKalshiBook(
  yes: BookMeta,
  no: BookMeta,
  raw: RawKalshiBook,
): Result<{ readonly yes: NormalizedBook; readonly no: NormalizedBook }, AdapterError> {
  const yesBids = parseLevels(raw.yesBids, "yes bid");
  if (!yesBids.ok) return yesBids;
  const noBids = parseLevels(raw.noBids, "no bid");
  if (!noBids.ok) return noBids;
  const warnings: string[] = [];
  if (!monotone(yesBids.value.map((l) => l.price), "asc")) warnings.push("yes bid order does not match declared convention best_last");
  if (!monotone(noBids.value.map((l) => l.price), "asc")) warnings.push("no bid order does not match declared convention best_last");
  const yb = canonical(yesBids.value, true);
  const nb = canonical(noBids.value, true);
  const yesBook = assemble(yes, "best_last", "native", yb, canonical(flip(nb), false), warnings);
  if (!yesBook.ok) return yesBook;
  const noBook = assemble(no, "best_last", "native", nb, canonical(flip(yb), false), warnings);
  if (!noBook.ok) return noBook;
  return { ok: true, value: { yes: yesBook.value, no: noBook.value } };
}

// ---------------------------------------------------------------------------------------------
// Yes-side-only books: Limitless, Predict.fun

// The venue publishes one YES book with NO folded in. The YES token book is native; the NO
// token book is the complement of it and is therefore synthetic.
export function normalizeYesSideOnly(
  yes: BookMeta,
  noToken: TokenRef,
  raw: RawSidedBook,
): Result<{ readonly yes: NormalizedBook; readonly no: NormalizedBook }, AdapterError> {
  const bids = parseLevels(raw.bids, "bid");
  if (!bids.ok) return bids;
  const asks = parseLevels(raw.asks, "ask");
  if (!asks.ok) return asks;
  const yesBook = assemble(yes, "yes_side_only", "native", canonical(bids.value, true), canonical(asks.value, false), []);
  if (!yesBook.ok) return yesBook;
  const noBook: NormalizedBook = {
    book: complementBook(yesBook.value.book, noToken),
    warnings: ["NO book is a synthetic complement of the YES book"],
  };
  return { ok: true, value: { yes: yesBook.value, no: noBook } };
}

// ---------------------------------------------------------------------------------------------
// AMM pools: Trueo

export interface AmmQuote {
  // Total shares moved and the total collateral paid (buy) or received (sell) for them, as
  // quoted by the pool at that size (for example V4Quoter output).
  readonly size: BookLevel["size"];
  readonly amount: string;
}

export interface RawAmmQuotes {
  readonly buys: readonly AmmQuote[];
  readonly sells: readonly AmmQuote[];
}

const AMM_PRICE_SCALE = 9;

// Turns cumulative pool quotes into incremental levels so the same depth walker can price them.
// Marginal prices are rounded against the trader (asks up, bids down) at nine places, so the
// walker never understates a cost. Marginal prices must worsen with size; anything else is a
// malformed quote set and fails closed.
export function normalizeAmmQuotes(meta: BookMeta, raw: RawAmmQuotes): Result<NormalizedBook, AdapterError> {
  const asks = ammLevels(raw.buys, "ceil");
  if (!asks.ok) return asks;
  const bids = ammLevels(raw.sells, "floor");
  if (!bids.ok) return bids;
  return assemble(meta, "amm_pool", "native", canonical(bids.value, true), canonical(asks.value, false), [
    "AMM levels are quoted trades, not resting orders; price impact beyond the largest quote is unknown",
  ]);
}

function ammLevels(quotes: readonly AmmQuote[], mode: "ceil" | "floor"): Result<ParsedLevel[], AdapterError> {
  const parsed: { size: Rational; amount: Rational }[] = [];
  for (const q of quotes) {
    const size = ratFromDec(q.size);
    const amount = ratFromDec(q.amount);
    if (!size.ok || !amount.ok || cmp(size.value, ZERO) <= 0 || cmp(amount.value, ZERO) <= 0) {
      return bad("SCHEMA_DRIFT", "AMM quote is not a positive decimal pair");
    }
    parsed.push({ size: size.value, amount: amount.value });
  }
  parsed.sort((a, b) => cmp(a.size, b.size));
  const out: ParsedLevel[] = [];
  let prevSize = ZERO;
  let prevAmount = ZERO;
  let prevMarginal: Rational | null = null;
  for (const q of parsed) {
    const dSize = sub(q.size, prevSize);
    if (cmp(dSize, ZERO) <= 0) return bad("SCHEMA_DRIFT", "duplicate AMM quote size");
    const marginal = div(sub(q.amount, prevAmount), dSize);
    if (prevMarginal !== null && (mode === "ceil" ? cmp(marginal, prevMarginal) < 0 : cmp(marginal, prevMarginal) > 0)) {
      return bad("SCHEMA_DRIFT", "AMM marginal price improves with size");
    }
    const priceText = ratToDec(marginal, AMM_PRICE_SCALE, mode);
    const price = ratFromDec(priceText);
    if (!price.ok || cmp(price.value, ZERO) <= 0 || cmp(price.value, ONE) >= 0) {
      return bad("SCHEMA_DRIFT", "AMM marginal price out of range");
    }
    out.push({ price: price.value, size: dSize });
    prevSize = q.size;
    prevAmount = q.amount;
    prevMarginal = marginal;
  }
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------------------------
// Top of book

export interface Top {
  readonly bid: Rational | null;
  readonly ask: Rational | null;
}

export function topOfBook(book: ParsedBook): Top {
  return { bid: book.bids[0]?.price ?? null, ask: book.asks[0]?.price ?? null };
}

// Mid price when both sides exist; null otherwise (a one-sided book has no mid).
export function midPrice(book: ParsedBook): Rational | null {
  const top = topOfBook(book);
  if (top.bid === null || top.ask === null) return null;
  return div(add(top.bid, top.ask), { n: 2n, d: 1n });
}
