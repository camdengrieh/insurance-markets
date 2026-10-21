// The four views of the one Markets table (docs/design/cockpit-v2 Main.dc.html "view chips"). Holdings, Linked and
// Signals are FILTER STATES over the rows already loaded, never screens of their own: a chip narrows the table and
// says, in words, what it narrowed by. Every count is computed from loaded data; nothing here guesses.
//
//   all       every loaded row;
//   held      rows whose market one of the watched addresses holds (a position read keyed by the address, joined on
//             the venue and the outcome token id: never on title text);
//   linked    rows that an approved link dataset names as a leg (candidates, never proof; none while no dataset is
//             bundled);
//   signals   rows on a venue Quotient covers (Polymarket, Polymarket US, Kalshi, Hyperliquid outcomes: docs 4.7).
//             XO and Trueo are not covered and get a Q number only through an approved link.

import type { MarketSummary, VenueId } from "../../core/ports";

export const VIEW_IDS = ["all", "held", "linked", "signals"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export const DEFAULT_VIEW: ViewId = "all";

export const VIEW_LABELS: Readonly<Record<ViewId, string>> = Object.freeze({
  all: "All",
  held: "Holdings",
  linked: "Linked",
  signals: "Signals",
});

export function isViewId(value: unknown): value is ViewId {
  return typeof value === "string" && (VIEW_IDS as readonly string[]).includes(value);
}

// Venues Quotient covers (docs/dapp-design.md 4.7), by the explorer's venue ids. A closed list: a venue that is
// not here is "not covered", and the words say so.
export const QUOTIENT_COVERED_VENUES: ReadonlySet<VenueId> = new Set<VenueId>(["polymarket", "polymarket_us", "kalshi", "hyperliquid"]);

export function quotientCovers(venue: VenueId): boolean {
  return QUOTIENT_COVERED_VENUES.has(venue);
}

// The marks a row carries: outlined words in the table and the facts the views filter on.
export interface RowMarks {
  readonly held: boolean;
  readonly linked: boolean;
  readonly signal: boolean;
  readonly watched: boolean;
}

export const NO_MARKS: RowMarks = Object.freeze({ held: false, linked: false, signal: false, watched: false });

// The key of a position: a venue and an outcome token, lower-cased. The same key is built from a portfolio row
// (venue, tokenId) and from a market's outcomes, so the join never touches market text.
export function holdingKey(venue: VenueId, tokenId: string): string {
  return `${venue}:${tokenId.toLowerCase()}`;
}

export function rowKeyOf(venue: VenueId, marketId: string): string {
  return `${venue}:${marketId}`;
}

export interface MarkContext {
  // Keys of every position the watched addresses hold (holdingKey). Empty when no address is watched.
  readonly holdings: ReadonlySet<string>;
  // Row keys (rowKeyOf) with at least one link candidate.
  readonly linkedRows: ReadonlySet<string>;
  // Row keys the user marked "watch" in this visit (memory only).
  readonly watched: ReadonlySet<string>;
}

export function marksOf(summary: MarketSummary, context: MarkContext): RowMarks {
  const venue = summary.ref.venue;
  const key = rowKeyOf(venue, summary.ref.marketId);
  const held = summary.outcomes.some((outcome) => outcome.tokenId !== "" && context.holdings.has(holdingKey(venue, outcome.tokenId)));
  return {
    held,
    linked: context.linkedRows.has(key),
    signal: quotientCovers(venue),
    watched: context.watched.has(key),
  };
}

export function inView(marks: RowMarks, view: ViewId): boolean {
  switch (view) {
    case "all":
      return true;
    case "held":
      return marks.held;
    case "linked":
      return marks.linked;
    case "signals":
      return marks.signal;
  }
}

export function filterByView<Row extends { readonly marks: RowMarks }>(rows: readonly Row[], view: ViewId): Row[] {
  return rows.filter((row) => inView(row.marks, view));
}

// One count per chip, from the rows loaded right now. "all" is the total.
export function countsByView(rows: ReadonlyArray<{ readonly marks: RowMarks }>): Readonly<Record<ViewId, number>> {
  const counts: Record<ViewId, number> = { all: 0, held: 0, linked: 0, signals: 0 };
  for (const row of rows) {
    for (const view of VIEW_IDS) if (inView(row.marks, view)) counts[view] += 1;
  }
  return counts;
}
