// The Markets table (docs/dapp-design.md 4.5). Every cell either shows a figure with its meaning, or says why it has
// none. Titles and outcome labels are market text and appear only inside the fixed untrusted slot.

import { Link } from "wouter";

import type { MarketSummary, OutcomeSummary } from "../../core/ports";
import { Badge, DataTable, Missing, UntrustedText, errorText, renderableUntrusted, venueName, type Column } from "../../ui";
import type { ExplorerAdapter } from "./adapters";
import { rowKey, type BookEntry } from "./books";
import { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, priceText, statusInfo, utcText, viewBook, volumeText } from "./display";
import { marketHref } from "./ids";
import { LinkBadge } from "./links";

export interface ExplorerRow {
  readonly key: string;
  readonly summary: MarketSummary;
  readonly adapter: ExplorerAdapter;
}

export function toRow(summary: MarketSummary, adapter: ExplorerAdapter): ExplorerRow {
  return { key: rowKey(summary.ref.venue, summary.ref.marketId), summary, adapter };
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
              <OutcomeName outcome={outcome} /> {text === null ? <Missing label="no display price" /> : <span className="explorer-figure">{text}</span>}
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
        <span className="explorer-figure">
          bid {view.bid ?? "none"} / ask {view.ask ?? "none"}
        </span>
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

export interface TableContext {
  readonly books: ReadonlyMap<string, BookEntry>;
  readonly nowMs: number;
}

export function marketColumns(context: TableContext): Column<ExplorerRow>[] {
  const bookOf = (row: ExplorerRow): BookEntry | undefined => context.books.get(row.key);
  return [
    { key: "venue", header: "Venue", render: (row) => venueName(row.summary.ref.venue) },
    {
      key: "title",
      header: "Market",
      rowHeader: true,
      render: (row) => {
        const href = marketHref(row.summary.ref.venue, row.summary.ref.marketId);
        const title = <UntrustedText value={row.summary.title} field="title" clamp={2} />;
        return href === null ? title : <Link href={href}>{title}</Link>;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const info = statusInfo(row.summary.status);
        return <Badge tone={info.tone}>{info.text}</Badge>;
      },
    },
    { key: "closes", header: "Closes (UTC)", render: (row) => utcText(row.summary.closesAtUtc) },
    { key: "price", header: "Price (bid / ask, else display price)", render: (row) => <PriceCell row={row} book={bookOf(row)} nowMs={context.nowMs} /> },
    {
      key: "spread",
      header: "Spread",
      render: (row) => {
        const book = bookOf(row);
        if (book?.state === "ok") {
          const view = viewBook(row.summary.ref.venue, book.book, context.nowMs);
          return (
            <>
              <span className="explorer-figure">{view.spread ?? "no spread"}</span>
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
    {
      key: "depth",
      header: "Depth within 5c",
      align: "end",
      render: (row) => {
        const book = bookOf(row);
        if (book?.state !== "ok") return null;
        const view = viewBook(row.summary.ref.venue, book.book, context.nowMs);
        return (
          <>
            <span>bids {view.depthBids ?? "none"}</span>
            <span className="explorer-caption">asks {view.depthAsks ?? "none"}</span>
          </>
        );
      },
    },
    { key: "volume", header: "Volume (with unit)", align: "end", render: (row) => volumeText(row.summary.volume) },
    {
      key: "fee",
      header: "Fee model",
      render: (row) => (row.adapter.feeNote === null ? <span className="explorer-caption">open the market</span> : row.adapter.feeNote),
    },
    { key: "links", header: "Links", render: (row) => <LinkBadge market={row.summary.ref} /> },
  ];
}

export function MarketTable({ rows, context, caption }: { readonly rows: readonly ExplorerRow[]; readonly context: TableContext; readonly caption: string }) {
  return <DataTable caption={caption} columns={marketColumns(context)} rows={rows} rowKey={(row) => row.key} />;
}
