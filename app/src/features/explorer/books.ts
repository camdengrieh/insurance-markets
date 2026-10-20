// Loading order books for a handful of visible rows (docs/dapp-design.md 4.5: "books only for visible rows").
//
// Books are fetched only when the user asks, for at most BOOK_ROW_CAP rows of venues that can serve them, one token per
// row (the headline outcome). A book that cannot be had is a typed error in the row's cell, never an empty book.

import type { Book, MarketSummary, TokenRef, VenueId } from "../../core/ports";
import type { ExplorerAdapter } from "./adapters";
import { classifyError, type ClassifiedError } from "./feed";
import { headlineOutcome } from "./display";
import type { ExplorerServices } from "./services";

export const BOOK_ROW_CAP = 10;
export const BOOK_BUDGET_MS = 8000;

export type BookEntry =
  | { readonly state: "loading" }
  | { readonly state: "ok"; readonly book: Book; readonly outcomeIndex: number }
  | { readonly state: "error"; readonly error: ClassifiedError };

export function rowKey(venue: VenueId, marketId: string): string {
  return `${venue}:${marketId}`;
}

export function bookRowKey(summary: MarketSummary): string {
  return rowKey(summary.ref.venue, summary.ref.marketId);
}

export interface BookTarget {
  readonly key: string;
  readonly venue: VenueId;
  readonly token: TokenRef;
  readonly outcomeIndex: number;
}

// The rows that will be asked: the first BOOK_ROW_CAP whose venue serves books, in the order the table shows them.
export function bookTargets(rows: readonly MarketSummary[], adapters: Readonly<Partial<Record<VenueId, ExplorerAdapter>>>): BookTarget[] {
  const out: BookTarget[] = [];
  for (const row of rows) {
    if (out.length >= BOOK_ROW_CAP) break;
    const entry = adapters[row.ref.venue];
    if (entry === undefined || entry.books.state !== "available") continue;
    const outcome = headlineOutcome(row.outcomes);
    if (outcome === null || outcome.tokenId === "") continue;
    out.push({
      key: bookRowKey(row),
      venue: row.ref.venue,
      token: { venue: row.ref.venue, tokenId: outcome.tokenId, marketId: row.ref.marketId },
      outcomeIndex: outcome.index,
    });
  }
  return out;
}

// Asks each venue once for its rows' books and reports each row as it resolves. Never throws.
export async function loadBooks(services: ExplorerServices, targets: readonly BookTarget[], report: (key: string, entry: BookEntry) => void): Promise<void> {
  const byVenue = new Map<VenueId, BookTarget[]>();
  for (const target of targets) {
    byVenue.set(target.venue, [...(byVenue.get(target.venue) ?? []), target]);
    report(target.key, { state: "loading" });
  }
  await Promise.all(
    [...byVenue].map(async ([venue, group]) => {
      const entry = services.adapters[venue];
      if (entry === undefined) return;
      try {
        const results = await entry.adapter.getBooks(
          group.map((target) => target.token),
          { deadlineMs: entry.deadlineFor(services.nowMs(), BOOK_BUDGET_MS) },
        );
        group.forEach((target, index) => {
          const result = results[index];
          if (result === undefined) report(target.key, { state: "error", error: { code: "SCHEMA_DRIFT", retryAfterMs: null } });
          else if (result.ok) {
            // A book for another token would put someone else's prices in this row.
            const same = result.value.token.venue === venue && result.value.token.tokenId.toLowerCase() === target.token.tokenId.toLowerCase();
            report(target.key, same ? { state: "ok", book: result.value, outcomeIndex: target.outcomeIndex } : { state: "error", error: { code: "SCHEMA_DRIFT", retryAfterMs: null } });
          }
          else report(target.key, { state: "error", error: { code: result.error, retryAfterMs: null } });
        });
      } catch (error) {
        const classified = classifyError(error);
        for (const target of group) report(target.key, { state: "error", error: classified });
      }
    }),
  );
}
