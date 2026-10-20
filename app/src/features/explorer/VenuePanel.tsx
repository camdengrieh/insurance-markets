// One place that says, for every venue this screen knows, what state it is in and why (M0-2). A venue the build
// cannot read is shown as a tile in words; it is never an empty list.

import { Fragment } from "react";

import { formatAge } from "../../core/format";
import type { Prov, VenueId } from "../../core/ports";
import type { AppMode } from "../../ui";
import {
  Badge,
  Button,
  Disclosure,
  EmptyTile,
  ErrorTile,
  NeedsCockpitTile,
  ProvenanceStrip,
  RestrictedTermsTile,
  Tile,
  UnprovenTile,
  venueName,
} from "../../ui";
import type { ExplorerAdapter } from "./adapters";
import { UNREPORTED_VENUES, type VenueStatus } from "./catalog";
import { MAX_PAGES_PER_VENUE, type VenueFeed } from "./feed";

export interface VenueRowState {
  readonly venue: VenueId;
  readonly status: VenueStatus;
  readonly adapter: ExplorerAdapter | undefined;
  // Present when the venue is selected and the reader runs.
  readonly feed: VenueFeed | undefined;
  readonly selected: boolean;
}

export interface VenuePanelProps {
  readonly rows: readonly VenueRowState[];
  readonly mode: AppMode;
  readonly nowMs: number;
  readonly query: string;
  readonly onToggle: (venue: VenueId, selected: boolean) => void;
  readonly onRetry: (venue: VenueId) => void;
  readonly onLoadMore: (venue: VenueId) => void;
}

// Provenance for a venue's list. In the Cockpit build every read travels through the daemon, whatever the adapter's
// own label says.
export function provForMode(prov: Prov, mode: AppMode): Prov {
  return mode === "cockpit" ? { ...prov, transport: "T1" } : prov;
}

function stateBadge(feed: VenueFeed | undefined, selected: boolean, query: string) {
  if (!selected) return <Badge tone="neutral">not requested</Badge>;
  if (feed === undefined) return <Badge tone="neutral">waiting</Badge>;
  switch (feed.state) {
    case "loading":
      return <Badge tone="info">loading</Badge>;
    case "ok":
      return <Badge tone="ok">{`${feed.items.length} loaded`}</Badge>;
    case "error":
      return <Badge tone="danger">could not be read</Badge>;
    case "search_unsupported":
      return <Badge tone="neutral">{query === "" ? "ready" : "no text search"}</Badge>;
  }
}

function ActiveVenue({ row, query, onToggle, onLoadMore, nowMs }: { readonly row: VenueRowState; readonly query: string; readonly nowMs: number; readonly onToggle: VenuePanelProps["onToggle"]; readonly onLoadMore: VenuePanelProps["onLoadMore"] }) {
  const { venue, feed, selected } = row;
  const name = venueName(venue);
  const more = feed !== undefined && feed.state === "ok" && feed.next !== null;
  const pageLimit = feed !== undefined && feed.pages >= MAX_PAGES_PER_VENUE;
  return (
    <li className="explorer-venue" data-venue={venue} data-state={selected ? (feed?.state ?? "waiting") : "hidden"}>
      <label className="explorer-check">
        <input type="checkbox" checked={selected} onChange={(event) => onToggle(venue, event.currentTarget.checked)} />
        <span>{name}</span>
      </label>
      {stateBadge(feed, selected, query)}
      {feed !== undefined && feed.refused > 0 ? <Badge tone="warn">{`${feed.refused} rows refused (unreadable shape)`}</Badge> : null}
      {feed !== undefined && feed.state === "ok" && feed.truncated ? <span className="explorer-note" data-truncated="true">{`${name} has more results than it returned for this search, and offers no way to page to them. Refine your search to narrow it.`}</span> : null}
      {feed !== undefined && feed.state === "search_unsupported" ? <span className="explorer-note">{`${name} cannot search by text, so it was not asked. Clear the search to list it again.`}</span> : null}
      {feed !== undefined && feed.state === "ok" && feed.fetchedAtMs !== null ? <span className="explorer-note">{`read ${formatAge(nowMs, feed.fetchedAtMs)}`}</span> : null}
      {more ? (
        <Button busy={feed.loadingMore} disabled={pageLimit} onClick={() => onLoadMore(venue)}>
          {pageLimit ? "Page limit reached" : `Load more from ${name}`}
        </Button>
      ) : null}
      {feed !== undefined && feed.moreError !== null ? <span className="explorer-note">{`More ${name} markets could not be loaded (${feed.moreError.code.toLowerCase().replace(/_/g, " ")}).`}</span> : null}
    </li>
  );
}

export function VenueTile({ row, mode }: { readonly row: VenueRowState; readonly mode: AppMode }) {
  const { venue, status } = row;
  const name = venueName(venue);
  switch (status.kind) {
    case "needs_cockpit":
      return <NeedsCockpitTile venue={venue} what="this venue's markets and order books" heading="h3" />;
    case "restricted_off":
      return <RestrictedTermsTile venue={venue} clause={status.clause} heading="h3" />;
    case "switched_off":
      return (
        <Tile tone="neutral" title={`${name}: switched off`} dataKind="switched-off" dataCode={venue} heading="h3">
          <p>{`${name} is switched off in your settings, so nothing was requested from it. This is not an empty market list.`}</p>
        </Tile>
      );
    case "no_reader":
      return (
        <Tile tone="neutral" title={`${name}: no reader in this release`} dataKind="no-reader" dataCode={venue} heading="h3">
          <p>{mode === "cockpit" ? `${name} can be read through the Cockpit, but this release has no reader for it yet.` : `This release has no reader for ${name} yet.`} Nothing was requested.</p>
        </Tile>
      );
    case "not_available":
      return (
        <Tile tone="neutral" title={`${name}: not available`} dataKind="not-available" dataCode={venue} heading="h3">
          <p>{`${name} is not available in this release. Nothing was requested.`}</p>
        </Tile>
      );
    case "active":
      return null;
  }
}

export function VenuePanel({ rows, mode, nowMs, query, onToggle, onRetry, onLoadMore }: VenuePanelProps) {
  const active = rows.filter((row) => row.status.kind === "active");
  const others = rows.filter((row) => row.status.kind !== "active");
  const provs = active.flatMap((row) => (row.feed?.prov == null ? [] : [{ venue: row.venue, prov: provForMode(row.feed.prov, mode) }]));
  return (
    <section aria-labelledby="explorer-venues-heading" className="explorer-section">
      <h2 id="explorer-venues-heading">Venues</h2>
      <ul className="explorer-venues">
        {active.map((row) => (
          <ActiveVenue key={row.venue} row={row} query={query} nowMs={nowMs} onToggle={onToggle} onLoadMore={onLoadMore} />
        ))}
      </ul>
      {active.map((row) => (
        <Fragment key={row.venue}>
          {row.selected && row.feed?.state === "error" && row.feed.error !== null ? (
            row.feed.error.code === "NEEDS_COCKPIT" ? (
              <NeedsCockpitTile venue={row.venue} what="this venue's markets" heading="h3" />
            ) : (
              <ErrorTile code={row.feed.error.code} venue={row.venue} heading="h3" onRetry={() => onRetry(row.venue)} />
            )
          ) : null}
          {row.selected && row.feed?.state === "ok" && row.feed.items.length === 0 ? (
            <EmptyTile title={`${venueName(row.venue)}: no markets match`} heading="h3">
              <p>{`${venueName(row.venue)} answered and listed no markets for this filter. That is a real empty answer, not a failure.`}</p>
            </EmptyTile>
          ) : null}
          {row.adapter?.books.state === "needs_cockpit" ? <NeedsCockpitTile venue={row.venue} what={row.adapter.books.what.toLowerCase()} heading="h3" /> : null}
          {row.adapter?.shape != null && row.adapter.shape.status !== "verified" ? (
            <UnprovenTile capability={`${venueName(row.venue)} response shapes`} state="unknown" heading="h3">
              {`${venueName(row.venue)} response shapes are unverified: ${row.adapter.shape.summary} Rows are shown as read and marked unverified.`}
            </UnprovenTile>
          ) : null}
          {row.adapter?.clause != null ? (
            <Tile tone="info" title={`${venueName(row.venue)}: venue restriction`} role="note" heading="h3" dataKind="venue-clause" dataCode={row.venue}>
              <p>{row.adapter.clause}</p>
              <p>This is a fact about the venue. The app computes no eligibility verdict for you.</p>
            </Tile>
          ) : null}
        </Fragment>
      ))}
      {others.map((row) => (
        <VenueTile key={row.venue} row={row} mode={mode} />
      ))}
      {provs.length === 0 ? null : (
        <Disclosure summary={`Where this data came from (${provs.length})`}>
          {provs.map(({ venue, prov }) => (
            <ProvenanceStrip key={venue} prov={prov} />
          ))}
        </Disclosure>
      )}
      {UNREPORTED_VENUES.length === 0 ? null : (
        <p className="explorer-note">{`Not covered by this screen: ${UNREPORTED_VENUES.map((id) => venueName(id)).join(", ")}.`}</p>
      )}
    </section>
  );
}
