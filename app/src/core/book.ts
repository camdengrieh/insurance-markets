// Order-book helpers shared by every adapter (ports.ts Book: "always sorted explicitly: bids descending, asks
// ascending. Never trust the venue's order"). Exact decimal comparison, no floating point.
//
// A level the venue sends that is not an exact decimal in range is DROPPED and counted, never repaired: the
// adapter reports a non-zero `invalid` as schema drift. A book is not "empty" because its levels were bad.

import { cmpQty, parseQty, subQty, toDec } from "./money";
import type { Dec, Level } from "./ports";

export type Side = "bids" | "asks";

export interface NormalizedLevels {
  readonly levels: readonly Level[];
  // How many input levels were dropped (not a decimal, price outside [0, 1], size not positive).
  readonly invalid: number;
}

// Sorts one side (bids descending, asks ascending) and drops invalid levels. Prices are probabilities in [0, 1].
// Equal prices keep their input order (the sort is stable) and are not merged: that is the venue's statement.
export function normalizeLevels(raw: readonly Level[], side: Side): NormalizedLevels {
  const parsed: Array<{ level: Level; price: NonNullable<ReturnType<typeof parseQty>> }> = [];
  let invalid = 0;
  const one = parseQty("price", "1");
  for (const level of raw) {
    const price = parseQty("price", level.price);
    const size = parseQty("shares", level.size);
    if (price === null || size === null || one === null || cmpQty(price, one) > 0 || size.atomic <= 0n) {
      invalid += 1;
      continue;
    }
    parsed.push({ level, price });
  }
  parsed.sort((a, b) => (side === "bids" ? cmpQty(b.price, a.price) : cmpQty(a.price, b.price)));
  return { levels: parsed.map((entry) => entry.level), invalid };
}

export interface Top {
  readonly bid: Level | null;
  readonly ask: Level | null;
  // The best bid is at or above the best ask: a stale or broken book, never an opportunity.
  readonly crossed: boolean;
}

// Best bid and ask of an already normalised book.
export function topOfBook(bids: readonly Level[], asks: readonly Level[]): Top {
  const bid = bids[0] ?? null;
  const ask = asks[0] ?? null;
  let crossed = false;
  if (bid !== null && ask !== null) {
    const bidPrice = parseQty("price", bid.price);
    const askPrice = parseQty("price", ask.price);
    crossed = bidPrice === null || askPrice === null || cmpQty(bidPrice, askPrice) >= 0;
  }
  return { bid, ask, crossed };
}

// The spread as a decimal price, or null when a side is empty or the book is crossed. A one-sided book has no
// spread (null), not a spread of 1 and not 0.
export function spreadOf(bids: readonly Level[], asks: readonly Level[]): Dec | null {
  const top = topOfBook(bids, asks);
  if (top.bid === null || top.ask === null || top.crossed) return null;
  const bidPrice = parseQty("price", top.bid.price);
  const askPrice = parseQty("price", top.ask.price);
  if (bidPrice === null || askPrice === null) return null;
  return toDec(subQty(askPrice, bidPrice));
}
