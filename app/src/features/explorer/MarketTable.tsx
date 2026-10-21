// The Markets table (docs/dapp-design.md 4.5; docs/design/cockpit-v2 Main.dc.html). One row per market: venue mark,
// title in the untrusted slot, Yes bid and ask (or the display price, labelled as such), spread, depth within five
// cents as a dithered bar beside its number, close time, marks (held, link, Q, watch) and an Inspect button that
// selects the row for the inspector aside. Every cell either shows a figure with its meaning or says why it has none.
// The title is a link to the market's own address (so it can be copied or opened in a new tab), and a plain click
// on it opens the market modal in place over the unchanged table, exactly as the inspector's "Open market" does.
//
// It is a real <table> with explicit ARIA roles on every part, so the phone layout (rows as cards, components.css
// `data-cards`, placed by explorer.css through each cell's data-col) keeps the table semantics, and the scroll
// region is focusable so a keyboard user can scroll a wide table at 360 px without the page ever scrolling sideways.

import { useId } from "react";
import { Link } from "wouter";

import { addQty, toDec, type Qty } from "../../core/money";
import type { MarketSummary, OutcomeSummary } from "../../core/ports";
import { formatQty } from "../../core/format";
import { Badge, DitherBar, Mark, Missing, Num, UntrustedText, VenueMark, VisuallyHidden, errorText, renderableUntrusted, venueName } from "../../ui";
import type { ExplorerAdapter } from "./adapters";
import { rowKey, type BookEntry } from "./books";
import { categoryLabelOf, categoryOfRow } from "./categories";
import { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, depthWithin, priceText, utcText, viewBook } from "./display";
import { marketHref } from "./ids";
import { NO_MARKS, type RowMarks } from "./views";

export interface ExplorerRow {
  readonly key: string;
  readonly summary: MarketSummary;
  readonly adapter: ExplorerAdapter;
  readonly marks: RowMarks;
}

export function toRow(summary: MarketSummary, adapter: ExplorerAdapter, marks: RowMarks = NO_MARKS): ExplorerRow {
  return { key: rowKey(summary.ref.venue, summary.ref.marketId), summary, adapter, marks };
}

// Roles name the two sides of a binary market in fixed words; the creator's own label follows in the untrusted slot
// when it says something else (a team-named XO market keeps "Yes" as outcome 0 whatever its label is).
export function OutcomeName({ outcome }: { readonly outcome: Pick<OutcomeSummary, "role" | "label"> }) {
  if (outcome.role === "label") return <UntrustedText value={outcome.label} field="outcome" clamp={1} />;
  const fixed = outcome.role === "yes" ? "Yes" : "No";
  const shown = renderableUntrusted(outcome.label, { field: "outcome" });
  const same = shown === null || shown.trim() === "" || shown.trim().toLowerCase() === fixed.toLowerCase();
  return same ? (
    <>{fixed}</>
  ) : (
    <>
      {fixed} (<UntrustedText value={outcome.label} field="outcome" clamp={1} />)
    </>
  );
}

const MAX_PRICES_PER_ROW = 3;

// The venue's display prices, labelled as such: shown in the inspector's sub-line, never in a price cell of the table
// (a price cell holds an order-book figure or says why it has none).
export function DisplayPrices({ summary }: { readonly summary: MarketSummary }) {
  if (summary.outcomes.length === 0) return <Missing label="no outcomes listed" />;
  const shown = summary.outcomes.slice(0, MAX_PRICES_PER_ROW);
  return (
    <>
      <ul className="explorer-prices">
        {shown.map((outcome) => {
          const text = priceText(outcome.displayPrice);
          return (
            <li key={outcome.index}>
              <OutcomeName outcome={outcome} /> {text === null ? <Missing label="no display price" /> : <Num>{text}</Num>}
            </li>
          );
        })}
      </ul>
      {summary.outcomes.length > shown.length ? <span className="explorer-note">{`+${summary.outcomes.length - shown.length} more outcomes`}</span> : null}
      <span className="explorer-caption">{DISPLAY_PRICE_CAPTION}</span>
    </>
  );
}

// What a row with no loaded book says in its price cell: one short phrase, never an empty book.
export const NO_BOOK_WORDS = Object.freeze({ needs_cockpit: "book via Cockpit", none: "no order book", available: "no book loaded" });

function noBookWord(row: ExplorerRow): string {
  return NO_BOOK_WORDS[row.adapter.books.state];
}

// One value per cell (Main.dc.html): "50.0c / 54.0c" for the headline outcome's best bid and ask, or one short phrase.
function PriceCell({ row, book, nowMs }: { readonly row: ExplorerRow; readonly book: BookEntry | undefined; readonly nowMs: number }) {
  const { summary } = row;
  if (book?.state === "loading") return <span role="status">loading book</span>;
  if (book?.state === "error") return <Badge tone="warn">{`book: ${errorText(book.error.code).title}`}</Badge>;
  if (book?.state === "ok") {
    const view = viewBook(summary.ref.venue, book.book, nowMs);
    const outcome = summary.outcomes.find((candidate) => candidate.index === book.outcomeIndex);
    return (
      <>
        <VisuallyHidden>bid </VisuallyHidden>
        <Num>{view.bid ?? "none"}</Num>
        {" / "}
        <VisuallyHidden>ask </VisuallyHidden>
        <Num>{view.ask ?? "none"}</Num>
        {outcome === undefined || outcome.role === "yes" ? null : (
          <span className="explorer-caption">
            for <OutcomeName outcome={outcome} />
          </span>
        )}
      </>
    );
  }
  return (
    <span className="explorer-price-word" data-book={row.adapter.books.state}>
      {noBookWord(row)}
    </span>
  );
}

// Shares within five cents on both sides, as one exact quantity (for the bar) and the two printed figures.
export function depthOf(book: BookEntry | undefined): Qty | null {
  if (book?.state !== "ok") return null;
  const depth = depthWithin(book.book);
  if (depth.bids === null && depth.asks === null) return null;
  if (depth.bids === null) return depth.asks;
  if (depth.asks === null) return depth.bids;
  return addQty(depth.bids, depth.asks);
}

// The bar is decoration beside the exact figures: its width is this row's depth over the deepest loaded row, and
// the one place floating point is used, because nothing is printed from it.
export function depthRatio(depth: Qty | null, deepest: Qty | null): number {
  if (depth === null || deepest === null) return 0;
  const top = Number(toDec(deepest));
  const own = Number(toDec(depth));
  if (!Number.isFinite(top) || !Number.isFinite(own) || top <= 0) return 0;
  return Math.min(1, Math.max(0, own / top));
}

// One combined figure (bids and asks within five cents, summed exactly) beside its bar; the split is in the inspector.
function DepthCell({ row, book, deepest }: { readonly row: ExplorerRow; readonly book: BookEntry | undefined; readonly deepest: Qty | null }) {
  if (book?.state !== "ok") return <Missing label={noBookWord(row)} />;
  const depth = depthOf(book);
  if (depth === null) return <Missing label="no orders within five cents" />;
  return (
    <span className="ui-depth explorer-depth">
      <DitherBar value={depthRatio(depth, deepest)} tone="yes" />
      <Num>{formatQty(depth)}</Num>
    </span>
  );
}

// The inks follow System.dc.html: "held" is outlined in the ink, "link" in the Yes blue, "Q" in the No rust. A row
// with no mark is blank to the eye and says "none" to a screen reader.
function Marks({ marks }: { readonly marks: RowMarks }) {
  if (!marks.held && !marks.linked && !marks.signal && !marks.watched) return <VisuallyHidden>none</VisuallyHidden>;
  return (
    <span className="ui-marks">
      {marks.held ? <Mark tone="ink">held</Mark> : null}
      {marks.linked ? <Mark tone="yes">link</Mark> : null}
      {marks.signal ? <Mark tone="no">Q</Mark> : null}
      {marks.watched ? <Mark tone="ink">watch</Mark> : null}
    </span>
  );
}

export interface TableContext {
  readonly books: ReadonlyMap<string, BookEntry>;
  readonly nowMs: number;
  readonly selectedKey: string | null;
  // Selects the row for the inspector (the whole row is the target; its venue cell holds the keyboard button).
  readonly onSelect: (key: string) => void;
  // Opens the market modal over the table, in place (no navigation, no remount).
  readonly onOpenMarket: (row: ExplorerRow) => void;
}

// A plain left click opens the modal in place; a modified click or a middle click keeps the link's own behaviour
// (open in a new tab, copy), which is why the title stays a real link.
function isPlainClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

// The ids that name a row's select button: "Inspect", the title slot, "on <venue>" (aria-labelledby, so the market's
// own text reaches the accessible name only as the rendered text of its untrusted slot).
interface RowIds {
  readonly verb: string;
  readonly title: string;
  readonly venue: string;
}

interface ColumnSpec {
  readonly key: string;
  readonly header: string;
  readonly align?: "end";
  readonly rowHeader?: boolean;
  readonly render: (row: ExplorerRow, ids: RowIds) => React.ReactNode;
}

export function marketColumns(context: TableContext, deepest: Qty | null): readonly ColumnSpec[] {
  const bookOf = (row: ExplorerRow): BookEntry | undefined => context.books.get(row.key);
  return [
    {
      key: "venue",
      header: "Venue",
      render: (row, ids) => (
        <button
          type="button"
          className="explorer-row-select"
          aria-current={context.selectedKey === row.key ? "true" : undefined}
          aria-labelledby={`${ids.verb} ${ids.title} ${ids.venue}`}
          onClick={(event) => {
            event.stopPropagation();
            context.onSelect(row.key);
          }}
        >
          <span id={ids.verb} hidden>
            Inspect
          </span>
          <VenueMark venue={row.summary.ref.venue} />
          <span id={ids.venue} hidden>
            {`on ${venueName(row.summary.ref.venue)}`}
          </span>
        </button>
      ),
    },
    {
      key: "title",
      header: "Market",
      rowHeader: true,
      render: (row, ids) => {
        const href = marketHref(row.summary.ref.venue, row.summary.ref.marketId);
        const title = (
          <span id={ids.title} className="explorer-row-title">
            <UntrustedText value={row.summary.title} field="title" clamp={1} />
          </span>
        );
        return href === null ? (
          title
        ) : (
          <Link
            href={href}
            className="explorer-row-link"
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              context.onOpenMarket(row);
            }}
          >
            {title}
          </Link>
        );
      },
    },
    // The fixed taxonomy's label only (categories.ts); the venue's own words are shown in the inspector, as untrusted text.
    {
      key: "category",
      header: "Category",
      render: (row) => (
        <span className="explorer-category" data-category={categoryOfRow(row.summary)}>
          {categoryLabelOf(row.summary)}
        </span>
      ),
    },
    { key: "price", header: "Yes bid / ask", align: "end", render: (row) => <PriceCell row={row} book={bookOf(row)} nowMs={context.nowMs} /> },
    {
      key: "spread",
      header: "Spread",
      align: "end",
      render: (row) => {
        const book = bookOf(row);
        if (book?.state !== "ok") return <Missing label={noBookWord(row)} />;
        const view = viewBook(row.summary.ref.venue, book.book, context.nowMs);
        // One figure; its meaning is said in words for a screen reader here and in full in the inspector. A spread that
        // is not the venue's own fresh book carries a visible "indicative" mark beside the figure.
        return (
          <>
            <span className="explorer-cell-label" aria-hidden="true">
              spread{" "}
            </span>
            {view.spread === null ? <Missing label={view.tierReason ?? "no spread"} /> : <Num>{view.spread}</Num>}
            {view.tier === "indicative" ? (
              <span className="explorer-tier" data-tier="indicative" aria-hidden="true">
                {" "}
                indicative
              </span>
            ) : null}
            <VisuallyHidden>{` ${SPREAD_LABEL[view.tier]}${view.tierReason === null ? "" : `: ${view.tierReason}`}`}</VisuallyHidden>
          </>
        );
      },
    },
    { key: "depth", header: "Depth ±5¢", align: "end", render: (row) => <DepthCell row={row} book={bookOf(row)} deepest={deepest} /> },
    // The header says UTC once, so each cell is the date and time alone ("2026-12-01 00:00"); the inspector has the full text.
    {
      key: "closes",
      header: "Closes (UTC)",
      render: (row) => {
        const text = utcText(row.summary.closesAtUtc);
        return text === null ? null : <Num>{text.replace(/ UTC$/, "")}</Num>;
      },
    },
    { key: "marks", header: "Marks", render: (row) => <Marks marks={row.marks} /> },
  ];
}

function cell(value: React.ReactNode): React.ReactNode {
  return value === null || value === undefined ? <Missing /> : value;
}

// A click anywhere on a row that is not on its link selects it, as the venue cell's button does from the keyboard.
function selectsRow(event: React.MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target;
  return !(target instanceof Element && target.closest("a, button") !== null);
}

export function MarketTable({ rows, context, caption }: { readonly rows: readonly ExplorerRow[]; readonly context: TableContext; readonly caption: string }) {
  const captionId = useId();
  let deepest: Qty | null = null;
  for (const row of rows) {
    const depth = depthOf(context.books.get(row.key));
    if (depth !== null && (deepest === null || Number(toDec(depth)) > Number(toDec(deepest)))) deepest = depth;
  }
  const columns = marketColumns(context, deepest);
  return (
    <div className="ui-table-scroll explorer-table" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className="ui-table" data-cards="true" role="table">
        <caption id={captionId} className="ui-visually-hidden">
          {caption}
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.key} role="columnheader" scope="col" data-align={column.align} data-col={column.key}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, index) => {
            const ids: RowIds = { verb: `${captionId}-v${index}`, title: `${captionId}-t${index}`, venue: `${captionId}-n${index}` };
            return (
              <tr
                key={row.key}
                role="row"
                data-selected={context.selectedKey === row.key ? "true" : undefined}
                data-row-venue={row.summary.ref.venue}
                onClick={(event) => {
                  if (selectsRow(event)) context.onSelect(row.key);
                }}
              >
                {columns.map((column) =>
                  column.rowHeader === true ? (
                    <th key={column.key} role="rowheader" scope="row" data-label={column.header} data-align={column.align} data-col={column.key}>
                      {cell(column.render(row, ids))}
                    </th>
                  ) : (
                    <td key={column.key} role="cell" data-label={column.header} data-align={column.align} data-col={column.key}>
                      {cell(column.render(row, ids))}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
