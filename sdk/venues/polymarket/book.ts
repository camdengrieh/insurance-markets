import type { Book, Level } from "../../model.js";
import { VENUE } from "./constants.js";
import { cmpDec, isOpenUnitInterval, isPositive, oneMinus, parseDec, type Dec } from "./decimal.js";
import type { ClobBookWire } from "./schemas.js";

// CLOB book -> the port's Book. The venue lists bids ascending and asks descending with the best level LAST
// (note 08 section 0, item 2); this module sorts explicitly and never relies on the venue's order.

export type BookOutcome =
  | { readonly ok: true; readonly book: Book }
  | { readonly ok: false; readonly error: "SCHEMA_DRIFT" | "EMPTY_BOOK" };

type Side = readonly { readonly price: string; readonly size: string }[];

function levels(side: Side): Level[] | null {
  const out: Level[] = [];
  for (const raw of side) {
    const price = parseDec(raw.price);
    const size = parseDec(raw.size);
    if (price === null || size === null || !isOpenUnitInterval(price)) return null;
    if (cmpDec(size, "0") === -1) return null;
    // A zero-size level carries no liquidity; it is dropped, not an error.
    if (!isPositive(size)) continue;
    out.push({ price, size });
  }
  return out;
}

function byPrice(descending: boolean): (a: Level, b: Level) => number {
  return (a, b) => (cmpDec(a.price, b.price) ?? 0) * (descending ? -1 : 1);
}

function hasDuplicatePrice(side: readonly Level[]): boolean {
  return new Set(side.map((level) => level.price)).size !== side.length;
}

// Milliseconds only: the book timestamp is a stringified 13-digit millisecond value (GET /time is seconds, and
// is not mixed in). Anything else is left out rather than guessed.
export function venueTimestampMs(value: string | number | null | undefined): number | undefined {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^[0-9]{13}$/.test(text)) return undefined;
  return Number(text);
}

export function parseBook(wire: ClobBookWire, requestedTokenId: string, asOfMs: number): BookOutcome {
  // The answer must be for the token asked about; a mismatch is drift, never a book to be used for another token.
  if (wire.asset_id !== requestedTokenId) return { ok: false, error: "SCHEMA_DRIFT" };
  const bidsRaw = levels(wire.bids);
  const asksRaw = levels(wire.asks);
  if (bidsRaw === null || asksRaw === null) return { ok: false, error: "SCHEMA_DRIFT" };
  const bids = bidsRaw.sort(byPrice(true));
  const asks = asksRaw.sort(byPrice(false));
  if (hasDuplicatePrice(bids) || hasDuplicatePrice(asks)) return { ok: false, error: "SCHEMA_DRIFT" };
  const bestBid = bids[0];
  const bestAsk = asks[0];
  // A crossed book cannot be a real resting book; it is a torn or corrupt snapshot.
  if (bestBid !== undefined && bestAsk !== undefined && cmpDec(bestBid.price, bestAsk.price) !== -1) {
    return { ok: false, error: "SCHEMA_DRIFT" };
  }
  if (bids.length === 0 && asks.length === 0) return { ok: false, error: "EMPTY_BOOK" };
  const venueTsMs = venueTimestampMs(wire.timestamp);
  const hash = typeof wire.hash === "string" && wire.hash !== "" ? wire.hash : undefined;
  return {
    ok: true,
    book: {
      token: { venue: VENUE, tokenId: wire.asset_id },
      bids,
      asks,
      asOfMs,
      ...(venueTsMs === undefined ? {} : { venueTsMs }),
      ...(hash === undefined ? {} : { hash }),
      derived: "native",
    },
  };
}

export function bestBid(book: Book): Level | null {
  return book.bids[0] ?? null;
}

export function bestAsk(book: Book): Level | null {
  return book.asks[0] ?? null;
}

// The opposite outcome's book, mirrored: a bid at p on one token is an ask at 1 - p on the other (complementary
// orders match at p and 1 - p). The result says `derived: "complement"`, which the port defines as synthetic and
// never executable: it saves a request, it does not replace the other token's own book.
export function complementBook(book: Book, oppositeTokenId: string): Book | null {
  const mirror = (side: readonly Level[]): Level[] | null => {
    const out: Level[] = [];
    for (const level of side) {
      const price: Dec | null = oneMinus(level.price);
      if (price === null) return null;
      out.push({ price, size: level.size });
    }
    return out;
  };
  const asks = mirror(book.bids);
  const bids = mirror(book.asks);
  if (asks === null || bids === null) return null;
  return {
    token: { venue: VENUE, tokenId: oppositeTokenId },
    bids: bids.sort(byPrice(true)),
    asks: asks.sort(byPrice(false)),
    asOfMs: book.asOfMs,
    ...(book.venueTsMs === undefined ? {} : { venueTsMs: book.venueTsMs }),
    derived: "complement",
  };
}
