// The order book in the inspector: the best levels of the headline outcome's book when one has been loaded, or the
// caution tile in words when a browser cannot read it ("needs the Cockpit"), or the reason there is none. Nothing
// here requests a book on its own; the button asks for this row's book only when pressed. A loaded book ends with
// its own provenance line (the row's line above describes the market list, not the book).

import { useAppMode } from "../../ui";
import { Button, NeedsCockpitTile, Num, ProvenanceLine, Tile } from "../../ui";
import { ttlFor } from "../../core/cache";
import type { Book, VenueId } from "../../core/ports";
import { makeProv } from "../../core/venue-policy";
import type { BookAvailability } from "./adapters";
import type { BookEntry } from "./books";
import { SPREAD_LABEL, viewBook } from "./display";
import { LevelRows } from "./levels";
import { VenueErrorTile } from "./venue-state";
import { provForMode } from "./VenuePanel";

const TOP_LEVELS = 3;

// The book's own provenance: the venue, the order-book source and when it was read, with its freshness from the
// book TTL. In the Cockpit build the read travelled through the daemon.
export function BookProvenance({ venue, book, nowMs }: { readonly venue: VenueId; readonly book: Book; readonly nowMs: number }) {
  const mode = useAppMode();
  return <ProvenanceLine prov={provForMode(makeProv({ venue, source: "order book", fetchedAtMs: book.asOfMs, nowMs, ttlMs: ttlFor("book_foreground"), ...(book.venueTsMs === undefined ? {} : { venueTsMs: book.venueTsMs }) }), mode)} />;
}

export interface BookPanelProps {
  readonly venue: VenueId;
  readonly availability: BookAvailability;
  readonly entry: BookEntry | undefined;
  readonly nowMs: number;
  // Asks the venue for this one row's book. Absent when the row cannot have one.
  readonly onLoad?: () => void;
  readonly loading?: boolean;
  // Why the venue cannot be asked for a book now (throttled, blocked or chain only), or null.
  readonly withheld?: string | null;
}

export function BookPanel({ venue, availability, entry, nowMs, onLoad, loading = false, withheld = null }: BookPanelProps) {
  if (availability.state === "needs_cockpit") return <NeedsCockpitTile venue={venue} what={availability.what.toLowerCase()} heading="h4" />;
  if (withheld !== null) {
    return (
      <Tile tone="warn" title="Order book not asked" heading="h4" dataKind="book-withheld" dataCode={venue}>
        <p>{`${withheld}. No book is shown and none is asked for until reads may be sent again; an earlier book is never shown as live.`}</p>
      </Tile>
    );
  }
  if (availability.state === "none") {
    return (
      <Tile tone="neutral" title="No order book" heading="h4" dataKind="no-book">
        <p>{availability.why}. The only price shown for this market is the venue's display price.</p>
      </Tile>
    );
  }
  if (entry === undefined) {
    return (
      <div className="explorer-book-empty">
        <p className="explorer-note">This row's order book has not been loaded in this visit. Nothing is requested on its own.</p>
        {onLoad === undefined ? null : (
          <Button onClick={onLoad} busy={loading}>
            Load this order book
          </Button>
        )}
      </div>
    );
  }
  if (entry.state === "loading") return <p role="status">Loading the order book.</p>;
  if (entry.state === "error") {
    return <VenueErrorTile venue={venue} error={entry.error} what="order books" heading="h4" {...(onLoad === undefined ? {} : { onRetry: onLoad })} />;
  }
  const view = viewBook(venue, entry.book, nowMs);
  return (
    <div className="explorer-book" data-venue={venue} data-outcome={entry.outcomeIndex}>
      <p className="explorer-book-top">
        <Num>
          bid {view.bid ?? "none"} / ask {view.ask ?? "none"}
        </Num>{" "}
        <span className="explorer-caption">
          {view.spread === null ? "no spread" : `spread ${view.spread}`}: {SPREAD_LABEL[view.tier]}
          {view.tierReason === null ? "" : ` (${view.tierReason})`}
        </span>
      </p>
      <div className="explorer-book-sides">
        <LevelRows caption="Yes bids, highest first" levels={entry.book.bids} side="bids" top={TOP_LEVELS} />
        <LevelRows caption="Yes asks, lowest first" levels={entry.book.asks} side="asks" top={TOP_LEVELS} />
      </div>
      <BookProvenance venue={venue} book={entry.book} nowMs={nowMs} />
      <p className="explorer-caption">Best levels only; the market modal shows both sides and the depth.</p>
    </div>
  );
}
