// Valuation and totals (docs/dapp-design.md 4.4 "Valuation and display rules"; acceptance M2-4).
//
//   - A position is marked at the BEST BID of the venue's own sorted book. Mid prices and the venue's own
//     `current price` are references, never summed.
//   - A one-sided, empty, crossed, stale, synthetic (complement) or malformed book gives value = null with a
//     reason, never 0 and never a guess from the other side.
//   - Totals add only rows whose value is known, are kept PER UNIT (USDC.e, dollars and TYD are never added to
//     each other), and always carry the number of rows left out. There is no single blended "net worth".
//   - Every amount is a Qty (exact bigint plus unit); raw micro-unit integers were turned into Qty by the adapter.

import { normalizeLevels, topOfBook } from "../../core/book";
import { notional, parseQty, sumRows, type Qty, type UnitTotal } from "../../core/money";
import type { Book } from "../../core/ports";
import { bucketOf, type CollateralUnit, type PortfolioRow } from "./types";

export const MAX_BOOK_AGE_MS = 5 * 60_000;

export interface Mark {
  readonly price: Qty | null;
  readonly value: Qty | null;
  // Fixed app text for why there is no value; null when there is one.
  readonly note: string | null;
}

function noMark(note: string): Mark {
  return { price: null, value: null, note };
}

// qty is shares (or contracts); the result is in `collateral`.
export function bidMark(qty: Qty, book: Book, nowMs: number, collateral: CollateralUnit, maxAgeMs: number = MAX_BOOK_AGE_MS): Mark {
  if (qty.unit !== "shares" && qty.unit !== "contracts") return noMark("The quantity is not a share count, so it is not priced.");
  if (qty.atomic <= 0n) return noMark("The quantity is zero.");
  if (book.derived !== "native") return noMark("Only a derived (complement) book exists, and a derived book is not a price anyone can sell into.");
  if (!Number.isFinite(book.asOfMs) || nowMs - book.asOfMs > maxAgeMs) return noMark("The book is out of date, so it is not used.");
  const bids = normalizeLevels(book.bids, "bids");
  const asks = normalizeLevels(book.asks, "asks");
  if (bids.invalid > 0 || asks.invalid > 0) return noMark("The book had levels that were not valid decimals, so it is not used.");
  const top = topOfBook(bids.levels, asks.levels);
  if (top.crossed) return noMark("The book is crossed (a bid at or above the ask), so it is not used.");
  if (top.bid === null) return noMark("There are no bids on the book, so there is no price to mark at.");
  const price = parseQty("price", top.bid.price);
  if (price === null) return noMark("The best bid is not a valid price.");
  return { price, value: notional(qty, price, collateral), note: null };
}

// ---- totals --------------------------------------------------------------------------------------------------

// A total for one collateral symbol (and so one unit). `total` is null when no row of that symbol had a value.
export interface SymbolTotal extends UnitTotal {
  readonly symbol: string;
}

export interface PortfolioTotals {
  readonly rows: number;
  // Rows of open positions, summed per collateral symbol; `excluded` counts those with no value.
  readonly value: readonly SymbolTotal[];
  readonly valueRows: number;
  readonly excludedFromValue: number;
  // Rows of settled positions with something to collect, summed per collateral symbol.
  readonly claimable: readonly SymbolTotal[];
  readonly claimableRows: number;
  readonly excludedFromClaimable: number;
  // Lost, closed and unrecognised rows: listed, but in neither total.
  readonly otherRows: number;
}

const sumExcluded = (totals: readonly UnitTotal[]): number => totals.reduce((count, total) => count + total.excluded, 0);

// One sum per collateral symbol, in first-seen order. Two symbols that share a unit (pUSD and USDC are both
// "usd") stay separate: they are different assets, and a depeg of one must not hide inside a combined figure.
function totalsBySymbol(rows: readonly PortfolioRow[], pick: (row: PortfolioRow) => Qty | null): SymbolTotal[] {
  const groups = new Map<string, PortfolioRow[]>();
  for (const row of rows) groups.set(row.collateralSymbol, [...(groups.get(row.collateralSymbol) ?? []), row]);
  return [...groups].flatMap(([symbol, members]) => sumRows(members.map((row) => ({ unit: row.collateral, value: pick(row) }))).map((total) => ({ ...total, symbol })));
}

export function summarize(rows: readonly PortfolioRow[]): PortfolioTotals {
  const valueRows = rows.filter((row) => bucketOf(row.status) === "value");
  const claimRows = rows.filter((row) => bucketOf(row.status) === "claimable");
  const value = totalsBySymbol(valueRows, (row) => row.value);
  const claimable = totalsBySymbol(claimRows, (row) => row.claimable);
  return {
    rows: rows.length,
    value,
    valueRows: valueRows.length,
    excludedFromValue: sumExcluded(value),
    claimable,
    claimableRows: claimRows.length,
    excludedFromClaimable: sumExcluded(claimable),
    otherRows: rows.length - valueRows.length - claimRows.length,
  };
}
