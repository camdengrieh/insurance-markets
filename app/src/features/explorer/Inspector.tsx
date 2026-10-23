// The inspector aside (docs/design/cockpit-v2 Main.dc.html): the selected row's venue and provenance on one line, its
// title slot, the status, close, volume and display-price sub-lines, then the order book (best levels, or the caution
// tile), "Same question elsewhere" and the Quotient line by coverage state, each under a heading with a short note on
// its right, and the actions: Open market, Prepare order (venues with a ticket, Cockpit, paired only) and the 44 px
// Watch button. It is a landmark named by aria-label; its sections have their own headings, and every action is a
// button. On a phone it is a non-modal bottom sheet (components.css .ui-sheet-aside) with a handle that folds it to
// its header (Mobile.dc.html).

import { useId, useState } from "react";

import { Badge, Button, Missing, Num, ProvenanceLine, UntrustedText, VenueMark, VisuallyHidden, useAppMode } from "../../ui";
import type { LinkLoad } from "../signals/links/dataset";
import type { LegReader } from "../signals/services";
import { BookPanel } from "./BookPanel";
import type { BookEntry } from "./books";
import { categoryLabelOf, categorySourceText, verdictOf } from "./categories";
import { statusInfo, utcText, volumeText } from "./display";
import { DisplayPrices, type ExplorerRow } from "./MarketTable";
import { QuotientLine, type QuotientState } from "./QuotientPanel";
import { SameQuestion } from "./SameQuestion";
import { FieldSourcesList, mixedSources, originText } from "./sources";
import { hasDirectExecutor } from "../trade/direct";
import { hasTicket, PREPARE_NEEDS_COCKPIT, PREPARE_NO_PATH, PrepareOrderAction } from "./Ticket";
import { provForMode } from "./VenuePanel";
import { quotientCovers } from "./views";

export interface InspectorProps {
  readonly row: ExplorerRow | null;
  readonly book: BookEntry | undefined;
  readonly nowMs: number;
  readonly linkLoad: LinkLoad | null;
  readonly readLeg: LegReader;
  readonly clock: () => number;
  readonly quotient: QuotientState;
  readonly onOpenMarket: (row: ExplorerRow) => void;
  readonly onPrepare: (row: ExplorerRow) => void;
  readonly onWatch: (row: ExplorerRow) => void;
  readonly onLoadBook: (row: ExplorerRow) => void;
  readonly onOpenQuotientSettings: () => void;
}

export const INSPECTOR_LABEL = "Inspector";
export const INSPECTOR_EMPTY = "No row is shown, so there is nothing to inspect. When the table has rows, the first one is inspected here and any row can be picked.";
export const WATCH_LABEL = "Watch this market";
export const PREPARE_VENUE_NOT_READ = "Prepare order: this venue cannot be asked now";
export const WATCH_NOTE = "Watch marks the row in this tab's memory only; it sends nothing and is dropped when you close the tab.";

// The short note on the right of the "Order book" heading.
function bookNote(row: ExplorerRow, book: BookEntry | undefined): string {
  if (row.withheld !== null) return "venue not read now";
  switch (row.adapter.books.state) {
    case "needs_cockpit":
      return "read by the Cockpit";
    case "none":
      return "this venue has none";
    case "available":
      return book?.state === "ok" ? "best levels; the modal has the rest" : "loads only on request";
  }
}

// The short note on the right of the "Quotient" heading: the venue's coverage and the switch.
function quotientNote(row: ExplorerRow, quotient: QuotientState): string {
  const coverage = quotientCovers(row.summary.ref.venue) ? "covered" : "not covered";
  return `${coverage} · ${quotient === "on" ? "on" : "off"}`;
}

function SectionHead({ id, title, note }: { readonly id: string; readonly title: string; readonly note: string }) {
  return (
    <div className="explorer-section-head">
      <h3 id={id}>{title}</h3>
      <span className="explorer-section-note">{note}</span>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" focusable="false">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function Inspector({ row, book, nowMs, linkLoad, readLeg, clock, quotient, onOpenMarket, onPrepare, onWatch, onLoadBook, onOpenQuotientSettings }: InspectorProps) {
  const mode = useAppMode();
  const ids = useId();
  const [folded, setFolded] = useState(false);
  const moreId = `${ids}-more`;
  const watchNoteId = `${ids}-watch`;
  return (
    <aside className="explorer-inspector ui-sheet-aside" aria-label={INSPECTOR_LABEL} data-selected={row === null ? "none" : row.key} data-folded={folded ? "true" : "false"}>
      {row === null ? (
        <p className="explorer-note explorer-inspector-empty" data-inspector="empty">
          {INSPECTOR_EMPTY}
        </p>
      ) : (
        <div className="explorer-inspector-body" data-inspector={row.key}>
          <button type="button" className="explorer-sheet-handle" aria-expanded={!folded} aria-controls={moreId} onClick={() => setFolded((value) => !value)}>
            <span className="explorer-sheet-bar" aria-hidden="true" />
            <VisuallyHidden>{folded ? "Show the inspector's details" : "Fold the inspector to its header"}</VisuallyHidden>
          </button>
          <div className="explorer-inspector-head">
            <div className="explorer-inspector-top">
              <VenueMark venue={row.summary.ref.venue} />
              <ProvenanceLine prov={provForMode(row.summary.prov, mode)} />
            </div>
            <p className="explorer-title">
              <UntrustedText value={row.summary.title} field="title" />
            </p>
            {row.withheld === null ? null : (
              <p className="explorer-note" data-inspector-state="">
                {`${row.withheld}.`}
              </p>
            )}
            <p className="explorer-sub">
              <Badge tone={statusInfo(row.summary.status).tone}>{statusInfo(row.summary.status).text}</Badge>
              {row.fields === null || row.fields.status.source === "venue_api" ? null : <span className="explorer-caption">{originText(row.fields.status, nowMs)}</span>}
              <span>
                closes {utcText(row.summary.closesAtUtc) === null ? <Missing label="not stated" /> : <Num>{utcText(row.summary.closesAtUtc)}</Num>}
              </span>
              <span>
                volume {volumeText(row.summary.volume) === null ? <Missing label="not stated" /> : <Num>{volumeText(row.summary.volume)}</Num>}
              </span>
            </p>
            <div className="explorer-sub explorer-display-prices" data-display-prices="">
              <span>Display price</span>
              <DisplayPrices summary={row.summary} />
            </div>
            <p className="explorer-sub explorer-category-line" data-category={verdictOf(row.summary).category} data-category-source={verdictOf(row.summary).confidence}>
              <span>
                Category: {categoryLabelOf(row.summary)} · {categorySourceText(verdictOf(row.summary))}
              </span>
              {row.summary.categoryNative === undefined ? null : (
                <span className="explorer-category-native">
                  {" · venue says "}
                  <UntrustedText value={row.summary.categoryNative} field="category" clamp={1} />
                </span>
              )}
            </p>
          </div>
          <div className="explorer-inspector-more" id={moreId}>
            <section className="explorer-inspector-section" aria-labelledby={`${ids}-book`}>
              <SectionHead id={`${ids}-book`} title="Order book" note={bookNote(row, book)} />
              <BookPanel
                venue={row.summary.ref.venue}
                availability={row.adapter.books}
                entry={book}
                nowMs={nowMs}
                onLoad={row.adapter.books.state === "available" && row.withheld === null ? () => onLoadBook(row) : undefined}
                loading={book?.state === "loading"}
                withheld={row.withheld}
              />
            </section>
            {row.fields === null || !mixedSources(row.fields) ? null : (
              <section className="explorer-inspector-section" aria-labelledby={`${ids}-sources`}>
                <SectionHead id={`${ids}-sources`} title="Sources" note="per field, with its age" />
                <FieldSourcesList fields={row.fields} resolution={row.resolution} outcomes={row.summary.outcomes} nowMs={nowMs} />
              </section>
            )}
            <section className="explorer-inspector-section explorer-inspector-same" aria-labelledby={`${ids}-same`}>
              <SectionHead id={`${ids}-same`} title="Same question elsewhere" note="candidates, not proof" />
              <SameQuestion market={row.summary.ref} load={linkLoad} readLeg={readLeg} nowMs={clock} variant="compact" />
            </section>
            <section className="explorer-inspector-section" aria-labelledby={`${ids}-quotient`}>
              <SectionHead id={`${ids}-quotient`} title="Quotient" note={quotientNote(row, quotient)} />
              <QuotientLine venue={row.summary.ref.venue} state={quotient} onOpenSettings={onOpenQuotientSettings} />
            </section>
          </div>
          <div className="explorer-inspector-actions">
            <Button variant="primary" onClick={() => onOpenMarket(row)}>
              Open market
            </Button>
            {row.withheld !== null && hasTicket(row.summary.ref.venue) ? (
              // No book, nothing to quote: a venue that cannot be asked now drops out of order preparation.
              <Button disabled data-prepare="venue-not-read">
                {PREPARE_VENUE_NOT_READ}
              </Button>
            ) : mode === "cockpit" || hasDirectExecutor(row.summary.ref.venue) ? (
              <PrepareOrderAction venue={row.summary.ref.venue} onPrepare={() => onPrepare(row)} />
            ) : (
              <Button disabled data-prepare={hasTicket(row.summary.ref.venue) ? "needs-cockpit" : "no-path"}>
                {hasTicket(row.summary.ref.venue) ? PREPARE_NEEDS_COCKPIT : PREPARE_NO_PATH}
              </Button>
            )}
            <button type="button" className="ui-icon-button explorer-watch" aria-label={WATCH_LABEL} aria-pressed={row.marks.watched} aria-describedby={watchNoteId} onClick={() => onWatch(row)}>
              <EyeIcon />
            </button>
            <span id={watchNoteId} hidden>
              {WATCH_NOTE}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
