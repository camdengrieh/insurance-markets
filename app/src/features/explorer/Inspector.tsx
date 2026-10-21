// The inspector aside (docs/design/cockpit-v2 Main.dc.html): the selected row's provenance line, title slot, order
// book (best levels, or the caution tile), "Same question elsewhere", the Quotient line by coverage state, and the
// actions: Open market, Prepare order (XO, Cockpit, paired only) and Watch. On a phone it is a non-modal bottom
// sheet (components.css .ui-sheet-aside). Keyboard reachable: it is a landmark with its own heading, and every
// action is a button.

import { Badge, Button, Missing, Num, ProvenanceLine, UntrustedText, VenueMark, useAppMode } from "../../ui";
import type { LinkLoad } from "../signals/links/dataset";
import type { LegReader } from "../signals/services";
import { BookPanel } from "./BookPanel";
import type { BookEntry } from "./books";
import { statusInfo, utcText, volumeText } from "./display";
import type { ExplorerRow } from "./MarketTable";
import { QuotientLine, type QuotientState } from "./QuotientPanel";
import { SameQuestion } from "./SameQuestion";
import { PREPARE_NEEDS_COCKPIT, PREPARE_XO_ONLY, PrepareOrderAction } from "./Ticket";
import { provForMode } from "./VenuePanel";

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

export const INSPECTOR_EMPTY = "Select a row with its Inspect button to see its order book, the same question elsewhere and its Quotient state here.";

export function Inspector({ row, book, nowMs, linkLoad, readLeg, clock, quotient, onOpenMarket, onPrepare, onWatch, onLoadBook, onOpenQuotientSettings }: InspectorProps) {
  const mode = useAppMode();
  return (
    <aside className="explorer-inspector ui-sheet-aside" aria-labelledby="explorer-inspector-heading" data-selected={row === null ? "none" : row.key}>
      <h2 id="explorer-inspector-heading" className="explorer-inspector-heading">
        Inspector
      </h2>
      {row === null ? (
        <p className="explorer-note" data-inspector="empty">
          {INSPECTOR_EMPTY}
        </p>
      ) : (
        <div className="explorer-inspector-body" data-inspector={row.key}>
          <p className="explorer-inspector-venue">
            <VenueMark venue={row.summary.ref.venue} /> <Badge tone={statusInfo(row.summary.status).tone}>{statusInfo(row.summary.status).text}</Badge>
          </p>
          <ProvenanceLine prov={provForMode(row.summary.prov, mode)} />
          <p className="explorer-title">
            <UntrustedText value={row.summary.title} field="title" />
          </p>
          <p className="explorer-sub">
            closes {utcText(row.summary.closesAtUtc) === null ? <Missing label="not stated" /> : <Num>{utcText(row.summary.closesAtUtc)}</Num>} · volume{" "}
            {volumeText(row.summary.volume) === null ? <Missing label="not stated" /> : <Num>{volumeText(row.summary.volume)}</Num>}
          </p>
          <section className="explorer-inspector-section" aria-labelledby="explorer-inspector-book">
            <h3 id="explorer-inspector-book">Order book</h3>
            <BookPanel venue={row.summary.ref.venue} availability={row.adapter.books} entry={book} nowMs={nowMs} onLoad={row.adapter.books.state === "available" ? () => onLoadBook(row) : undefined} loading={book?.state === "loading"} />
          </section>
          <section className="explorer-inspector-section" aria-labelledby="explorer-inspector-same">
            <h3 id="explorer-inspector-same">Same question elsewhere</h3>
            <SameQuestion market={row.summary.ref} load={linkLoad} readLeg={readLeg} nowMs={clock} variant="compact" />
          </section>
          <section className="explorer-inspector-section" aria-labelledby="explorer-inspector-quotient">
            <h3 id="explorer-inspector-quotient">Quotient</h3>
            <QuotientLine venue={row.summary.ref.venue} state={quotient} onOpenSettings={onOpenQuotientSettings} />
          </section>
          <div className="explorer-inspector-actions">
            <Button variant="primary" onClick={() => onOpenMarket(row)}>
              Open market
            </Button>
            {mode === "cockpit" ? (
              <PrepareOrderAction venue={row.summary.ref.venue} onPrepare={() => onPrepare(row)} />
            ) : (
              <Button disabled data-prepare={row.summary.ref.venue === "xo" ? "needs-cockpit" : "xo-only"}>
                {row.summary.ref.venue === "xo" ? PREPARE_NEEDS_COCKPIT : PREPARE_XO_ONLY}
              </Button>
            )}
            <Button aria-pressed={row.marks.watched} onClick={() => onWatch(row)}>
              {row.marks.watched ? "Watching" : "Watch"}
            </Button>
          </div>
          <p className="explorer-caption">Watch marks the row in this tab's memory only; it sends nothing and is dropped when you close the tab.</p>
        </div>
      )}
    </aside>
  );
}
