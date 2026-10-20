// Pure display rules for the Markets screen (docs/dapp-design.md 4.1 principles 4 and 5, 4.5, 4.4 valuation rules).
// No React and no I/O: everything here is a function of venue data, so the rules are pinned by plain unit tests.
//
//   - a missing value is `null` and prints as "no data", never 0 or 0.5;
//   - a list/display price is never called a quote: it carries the words "display price, not executable";
//   - a spread exists only when BOTH sides of a native, fresh, uncrossed book exist, and XO never gets above
//     "indicative" (its fee source is an unreconciled ceiling, M0-8);
//   - amounts are exact decimals with their unit; nothing here uses floating point.

import { spreadOf, topOfBook } from "../../core/book";
import { freshnessOf, ttlFor } from "../../core/cache";
import { formatPriceCents, formatQty, parseIsoMs, formatUtc } from "../../core/format";
import { addQty, cmpQty, parseQty, qtyOfDec, subQty, type Qty } from "../../core/money";
import type { Book, Dec, Freshness, Level, MarketSummary, OutcomeSummary, Status, VenueId } from "../../core/ports";
import type { Tone } from "../../ui";

// ---- status ------------------------------------------------------------------------------------------------------------

// Typed Record: the compiler fails when ports.ts adds a Status, so every status has words.
export const STATUS_TEXT: Readonly<Record<Status, { readonly text: string; readonly tone: Tone }>> = Object.freeze({
  pending: { text: "pending", tone: "neutral" },
  active: { text: "active", tone: "ok" },
  paused: { text: "paused", tone: "warn" },
  closed: { text: "closed", tone: "neutral" },
  determined: { text: "outcome proposed", tone: "warn" },
  disputed: { text: "disputed", tone: "warn" },
  resolved: { text: "resolved", tone: "info" },
  voided: { text: "voided", tone: "neutral" },
  unknown: { text: "status unknown", tone: "warn" },
});

// A status that is not in the closed list (a bug, a tampered value) reads as unknown, never as active.
export function statusInfo(status: unknown): { readonly text: string; readonly tone: Tone } {
  return typeof status === "string" && Object.hasOwn(STATUS_TEXT, status) ? STATUS_TEXT[status as Status] : STATUS_TEXT.unknown;
}

// ---- times -------------------------------------------------------------------------------------------------------------

// "2026-11-03 18:00 UTC", or null for a missing or unparseable time. Always UTC (XO cutoffs are UTC, Polymarket's
// are ET), and a bad string is "no data", never "now".
export function utcText(iso: string | null | undefined): string | null {
  const ms = parseIsoMs(iso);
  return ms === null ? null : formatUtc(ms, false);
}

// ---- display prices ----------------------------------------------------------------------------------------------------

export const DISPLAY_PRICE_CAPTION = "display price, not executable";

// The outcome whose book and price the table row shows: the "yes" outcome by role, else the first. Never matched on
// label text.
export function headlineOutcome(outcomes: readonly OutcomeSummary[]): OutcomeSummary | null {
  return outcomes.find((outcome) => outcome.role === "yes") ?? outcomes[0] ?? null;
}

// 0.534 -> "53.4c". null, a non-decimal or an out-of-range price -> null (the cell says "no data").
export function priceText(price: Dec | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const q = qtyOfDec("price", price);
  if (q === null) return null;
  const zero = parseQty("price", "0");
  const one = parseQty("price", "1");
  if (zero === null || one === null || cmpQty(q, zero) < 0 || cmpQty(q, one) > 0) return null;
  return formatPriceCents(q);
}

// ---- volume ------------------------------------------------------------------------------------------------------------

// Volume with its unit and window. null when the venue reports none. An unknown unit prints the bare decimal and
// says the unit is not stated (Manifold's volume is play money, never dollars).
export function volumeText(volume: MarketSummary["volume"]): string | null {
  if (volume.amount === null) return null;
  const window = volume.windowHours === null ? "" : ` per ${volume.windowHours} h`;
  switch (volume.unit) {
    case "usd":
    case "usdc_e":
    case "shares":
    case "contracts": {
      const q = qtyOfDec(volume.unit, volume.amount);
      return q === null ? null : `${formatQty(q)}${window}`;
    }
    case "unknown": {
      // The unit is not one the app can name, so the figure is shown as stated, with that said in words.
      if (!/^\d{1,30}(?:\.\d{1,18})?$/.test(volume.amount)) return null;
      return `${volume.amount} (unit not stated)${window}`;
    }
    default:
      // A unit outside the closed list is unknown, not a guess.
      return null;
  }
}

// ---- books -------------------------------------------------------------------------------------------------------------

export const FIVE_CENTS = "0.05";

export interface DepthWithin {
  readonly bids: Qty | null;
  readonly asks: Qty | null;
}

function sum(levels: readonly Level[]): Qty | null {
  let total: Qty | null = null;
  for (const level of levels) {
    const size = parseQty("shares", level.size);
    if (size === null) return null;
    total = total === null ? size : addQty(total, size);
  }
  return total;
}

// Shares resting within five cents of the best price on each side (docs/dapp-design.md 4.5 "depth within 5 cents").
// A side with no orders is null (no data), not zero.
export function depthWithin(book: Pick<Book, "bids" | "asks">, window: Dec = FIVE_CENTS): DepthWithin {
  const width = parseQty("price", window);
  const bestBid = book.bids[0] === undefined ? null : parseQty("price", book.bids[0].price);
  const bestAsk = book.asks[0] === undefined ? null : parseQty("price", book.asks[0].price);
  if (width === null) return { bids: null, asks: null };
  const bids =
    bestBid === null
      ? null
      : sum(
          book.bids.filter((level) => {
            const price = parseQty("price", level.price);
            return price !== null && cmpQty(price, subQty(bestBid, width)) >= 0;
          }),
        );
  const asks =
    bestAsk === null
      ? null
      : sum(
          book.asks.filter((level) => {
            const price = parseQty("price", level.price);
            return price !== null && cmpQty(price, addQty(bestAsk, width)) <= 0;
          }),
        );
  return { bids, asks };
}

export type SpreadTier = "none" | "indicative" | "book";

export interface BookView {
  readonly bid: string | null;
  readonly ask: string | null;
  readonly bidSize: string | null;
  readonly askSize: string | null;
  readonly spread: string | null;
  readonly tier: SpreadTier;
  // Why the tier is not "book", in words. null when it is.
  readonly tierReason: string | null;
  readonly depthBids: string | null;
  readonly depthAsks: string | null;
  readonly freshness: Freshness;
  readonly crossed: boolean;
}

// How much the numbers of a book may be trusted:
//   book        a native, fresh, uncrossed book with both sides: the venue's own sorted book. Still not a quote you can
//               fill (size and fees are not applied here);
//   indicative  everything else that has a number: a stale book, a complement-derived book, any XO book;
//   none        no spread to show.
export function viewBook(venue: VenueId, book: Book, nowMs: number): BookView {
  const top = topOfBook(book.bids, book.asks);
  const spreadDec = spreadOf(book.bids, book.asks);
  const spreadQ = spreadDec === null ? null : qtyOfDec("price", spreadDec);
  const freshness = freshnessOf(book.asOfMs, ttlFor("book_foreground"), nowMs);
  let tier: SpreadTier = "none";
  let tierReason: string | null = null;
  if (spreadQ !== null && !top.crossed) {
    if (venue === "xo") {
      tier = "indicative";
      tierReason = "XO's fee source is an unreconciled ceiling, so no XO spread is ever shown as executable";
    } else if (book.derived !== "native") {
      tier = "indicative";
      tierReason = "this book is derived from the other side, not the venue's own";
    } else if (freshness !== "live") {
      tier = "indicative";
      tierReason = freshness === "recent" ? "this book is older than its freshness window" : "this book is stale or its time is unknown";
    } else {
      tier = "book";
    }
  } else if (top.crossed) {
    tierReason = "the best bid is at or above the best ask, so the book is stale or broken";
  } else if (top.bid === null || top.ask === null) {
    tierReason = "one side of the book is empty, so there is no spread";
  }
  const depth = depthWithin(book);
  return {
    bid: top.bid === null ? null : priceText(top.bid.price),
    ask: top.ask === null ? null : priceText(top.ask.price),
    bidSize: top.bid === null ? null : sizeText(top.bid.size),
    askSize: top.ask === null ? null : sizeText(top.ask.size),
    spread: spreadQ === null || top.crossed ? null : formatPriceCents(spreadQ),
    tier,
    tierReason,
    depthBids: depth.bids === null ? null : formatQty(depth.bids),
    depthAsks: depth.asks === null ? null : formatQty(depth.asks),
    freshness,
    crossed: top.crossed,
  };
}

export function sizeText(size: Dec): string | null {
  const q = qtyOfDec("shares", size);
  return q === null ? null : formatQty(q);
}

export const SPREAD_LABEL: Readonly<Record<SpreadTier, string>> = Object.freeze({
  none: "no spread",
  indicative: "indicative spread, not executable",
  book: "book spread (size and fees not applied)",
});
