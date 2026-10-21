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
import { Badge, Button, DitherBar, Mark, Missing, Num, UntrustedText, VenueMark, errorText, renderableUntrusted } from "../../ui";
import type { ExplorerAdapter } from "./adapters";
import { rowKey, type BookEntry } from "./books";
import { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, depthWithin, priceText, statusInfo, utcText, viewBook, volumeText } from "./display";
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

function DisplayPrices({ summary }: { readonly summary: MarketSummary }) {
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

function PriceCell({ row, book, nowMs }: { readonly row: ExplorerRow; readonly book: BookEntry | undefined; readonly nowMs: number }) {
  const { summary, adapter } = row;
  if (book?.state === "loading") return <span role="status">loading book</span>;
  if (book?.state === "error") return <Badge tone="warn">{`book: ${errorText(book.error.code).title}`}</Badge>;
  if (book?.state === "ok") {
    const view = viewBook(summary.ref.venue, book.book, nowMs);
    const outcome = summary.outcomes.find((candidate) => candidate.index === book.outcomeIndex);
    return (
      <>
        <Num>
          bid {view.bid ?? "none"} / ask {view.ask ?? "none"}
        </Num>
        {outcome === undefined ? null : (
          <span className="explorer-caption">
            for <OutcomeName outcome={outcome} />
          </span>
        )}
        {view.bid === null || view.ask === null ? <span className="explorer-caption">one side is empty: no price is implied</span> : null}
      </>
    );
  }
  return (
    <>
      <DisplayPrices summary={summary} />
      {adapter.books.state === "needs_cockpit" ? (
        <span className="explorer-caption">
          <Badge tone="info">book: needs the Cockpit</Badge>
        </span>
      ) : null}
    </>
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

function DepthCell({ row, book, deepest, nowMs }: { readonly row: ExplorerRow; readonly book: BookEntry | undefined; readonly deepest: Qty | null; readonly nowMs: number }) {
  if (book?.state !== "ok") {
    if (row.adapter.books.state === "needs_cockpit") return <span className="explorer-caption">needs the Cockpit</span>;
    if (row.adapter.books.state === "none") return <span className="explorer-caption">no order book</span>;
    return null;
  }
  const view = viewBook(row.summary.ref.venue, book.book, nowMs);
  const depth = depthOf(book);
  return (
    <span className="ui-depth explorer-depth">
      <DitherBar value={depthRatio(depth, deepest)} tone="yes" />
      <span className="explorer-depth-figures">
        <Num>bids {view.depthBids ?? "none"}</Num>
        <Num>asks {view.depthAsks ?? "none"}</Num>
      </span>
    </span>
  );
}

// The inks follow System.dc.html: "held" is outlined in the ink, "link" in the Yes blue, "Q" in the No rust.
function Marks({ marks }: { readonly marks: RowMarks }) {
  if (!marks.held && !marks.linked && !marks.signal && !marks.watched) return <span className="explorer-caption">none</span>;
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
  readonly onSelect: (key: string) => void;
  // Opens the market modal over the table, in place (no navigation, no remount).
  readonly onOpenMarket: (row: ExplorerRow) => void;
}

// A plain left click opens the modal in place; a modified click or a middle click keeps the link's own behaviour
// (open in a new tab, copy), which is why the title stays a real link.
function isPlainClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

interface ColumnSpec {
  readonly key: string;
  readonly header: string;
  readonly align?: "end";
  readonly rowHeader?: boolean;
  readonly render: (row: ExplorerRow) => React.ReactNode;
}

export function marketColumns(context: TableContext, deepest: Qty | null): readonly ColumnSpec[] {
  const bookOf = (row: ExplorerRow): BookEntry | undefined => context.books.get(row.key);
  return [
    { key: "venue", header: "Venue", render: (row) => <VenueMark venue={row.summary.ref.venue} /> },
    {
      key: "title",
      header: "Market",
      rowHeader: true,
      render: (row) => {
        const href = marketHref(row.summary.ref.venue, row.summary.ref.marketId);
        const title = <UntrustedText value={row.summary.title} field="title" clamp={2} />;
        const info = statusInfo(row.summary.status);
        const volume = volumeText(row.summary.volume);
        return (
          <>
            {href === null ? (
              title
            ) : (
              <Link
                href={href}
                onClick={(event) => {
                  if (!isPlainClick(event)) return;
                  event.preventDefault();
                  context.onOpenMarket(row);
                }}
              >
                {title}
              </Link>
            )}
            <span className="explorer-sub">
              <Badge tone={info.tone}>{info.text}</Badge>
              {volume === null ? <Missing label="no volume" /> : <Num>{volume}</Num>}
            </span>
          </>
        );
      },
    },
    { key: "price", header: "Yes bid / ask", align: "end", render: (row) => <PriceCell row={row} book={bookOf(row)} nowMs={context.nowMs} /> },
    {
      key: "spread",
      header: "Spread",
      align: "end",
      render: (row) => {
        const book = bookOf(row);
        if (book?.state === "ok") {
          const view = viewBook(row.summary.ref.venue, book.book, context.nowMs);
          return (
            <>
              <Num>{view.spread ?? "no spread"}</Num>
              <span className="explorer-caption">{SPREAD_LABEL[view.tier]}</span>
              {view.tierReason === null ? null : <span className="explorer-caption">{view.tierReason}</span>}
            </>
          );
        }
        if (row.adapter.books.state === "needs_cockpit") return <Badge tone="info">needs the Cockpit</Badge>;
        if (row.adapter.books.state === "none") return <span className="explorer-caption">no order book</span>;
        return null;
      },
    },
    { key: "depth", header: "Depth within 5c", align: "end", render: (row) => <DepthCell row={row} book={bookOf(row)} deepest={deepest} nowMs={context.nowMs} /> },
    { key: "closes", header: "Closes (UTC)", render: (row) => (utcText(row.summary.closesAtUtc) === null ? null : <Num>{utcText(row.summary.closesAtUtc)}</Num>) },
    { key: "marks", header: "Marks", render: (row) => <Marks marks={row.marks} /> },
    {
      key: "inspect",
      header: "Inspect",
      render: (row) => (
        <Button aria-pressed={context.selectedKey === row.key} onClick={() => context.onSelect(row.key)}>
          Inspect
        </Button>
      ),
    },
  ];
}

function cell(value: React.ReactNode): React.ReactNode {
  return value === null || value === undefined ? <Missing /> : value;
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
        <caption id={captionId}>{caption}</caption>
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
          {rows.map((row) => (
            <tr key={row.key} role="row" data-selected={context.selectedKey === row.key ? "true" : undefined} data-row-venue={row.summary.ref.venue}>
              {columns.map((column) =>
                column.rowHeader === true ? (
                  <th key={column.key} role="rowheader" scope="row" data-label={column.header} data-align={column.align} data-col={column.key}>
                    {cell(column.render(row))}
                  </th>
                ) : (
                  <td key={column.key} role="cell" data-label={column.header} data-align={column.align} data-col={column.key}>
                    {cell(column.render(row))}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
