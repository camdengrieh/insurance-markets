// The Markets screen: one searchable list over every venue whose reader runs, plus a plain-words state for every venue
// that does not (docs/dapp-design.md 4.5, 7.2 M0). Read-only: no order entry, no key, no signature.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { parseIsoMs } from "../../core/format";
import type { VenueId } from "../../core/ports";
import { DEFAULT_SWITCHES, type VenueSwitches } from "../../core/venue-policy";
import { Button, Field, renderableUntrusted, useAnnounce, useNow } from "../../ui";
import { bookTargets, loadBooks, type BookEntry } from "./books";
import { EXPLORER_VENUES, venueStatusOf } from "./catalog";
import { MAX_PAGES_PER_VENUE, STATUS_FILTERS, useMarketFeed, type FeedSelection, type StatusFilter } from "./feed";
import { MarketTable, toRow, type ExplorerRow } from "./MarketTable";
import { useExplorerServices, type ExplorerServices } from "./services";
import { VenuePanel, type VenueRowState } from "./VenuePanel";

export type SortKey = "closing" | "venue";

const SORTS: readonly { readonly value: SortKey; readonly label: string }[] = [
  { value: "closing", label: "Closing soonest" },
  { value: "venue", label: "Venue, then the venue's own order" },
];

// Never by a price, a last trade or a volume: those are not comparable across venues (principle 5 of section 4.1).
export function sortRows(rows: readonly ExplorerRow[], sort: SortKey): ExplorerRow[] {
  const venueRank = (row: ExplorerRow): number => {
    const index = EXPLORER_VENUES.indexOf(row.summary.ref.venue);
    return index === -1 ? EXPLORER_VENUES.length : index;
  };
  const decorated = rows.map((row, index) => ({ row, index, venue: venueRank(row), closes: parseIsoMs(row.summary.closesAtUtc) }));
  decorated.sort((a, b) => {
    if (sort === "closing") {
      // A market with no close time sorts last: unknown is not "soonest".
      const left = a.closes ?? Number.POSITIVE_INFINITY;
      const right = b.closes ?? Number.POSITIVE_INFINITY;
      if (left !== right) return left < right ? -1 : 1;
    }
    return a.venue - b.venue || a.index - b.index;
  });
  return decorated.map((entry) => entry.row);
}

// The live filter over rows already loaded. Reads titles only through the sanctioned renderer.
export function filterRows(rows: readonly ExplorerRow[], text: string): ExplorerRow[] {
  const needle = text.trim().toLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((row) => (renderableUntrusted(row.summary.title, { field: "title" }) ?? "").toLowerCase().includes(needle));
}

interface FeedProps {
  readonly services: ExplorerServices;
  readonly selection: FeedSelection;
  readonly venueStates: readonly Omit<VenueRowState, "feed">[];
  readonly filterText: string;
  readonly sort: SortKey;
  readonly onToggle: (venue: VenueId, selected: boolean) => void;
}

// Owns the queries for one selection. The parent re-mounts it (by key) when the selection changes, so extra pages and
// loaded books never leak from one selection into another.
function Feed({ services, selection, venueStates, filterText, sort, onToggle }: FeedProps) {
  const { feeds, loadMore, retry } = useMarketFeed(services, selection);
  const nowMs = useNow(10_000);
  const announce = useAnnounce();
  const [books, setBooks] = useState<ReadonlyMap<string, BookEntry>>(new Map());
  const [booksBusy, setBooksBusy] = useState(false);

  const panelRows: VenueRowState[] = venueStates.map((state) => ({ ...state, feed: feeds.find((feed) => feed.venue === state.venue) }));

  const all = useMemo(() => {
    const out: ExplorerRow[] = [];
    for (const feed of feeds) {
      const adapter = services.adapters[feed.venue];
      if (adapter === undefined) continue;
      for (const item of feed.items) out.push(toRow(item, adapter));
    }
    return out;
  }, [feeds, services.adapters]);

  const rows = useMemo(() => sortRows(filterRows(all, filterText), sort), [all, filterText, sort]);

  const loading = feeds.some((feed) => feed.state === "loading");
  const okCount = feeds.filter((feed) => feed.state === "ok").length;
  const announced = useRef("");
  useEffect(() => {
    if (loading || feeds.length === 0) return;
    const message = `Loaded ${all.length} markets from ${okCount} ${okCount === 1 ? "venue" : "venues"}.`;
    if (announced.current === message) return;
    announced.current = message;
    announce(message);
  }, [loading, feeds.length, all.length, okCount, announce]);

  const targets = useMemo(() => bookTargets(rows.map((row) => row.summary), services.adapters), [rows, services.adapters]);

  const onLoadBooks = useCallback(() => {
    setBooksBusy(true);
    void loadBooks(services, targets, (key, entry) => {
      setBooks((current) => new Map(current).set(key, entry));
    }).then(() => {
      setBooksBusy(false);
      announce("Order books loaded for the visible markets.");
    });
  }, [services, targets, announce]);

  const venuesLabel = `${feeds.length} ${feeds.length === 1 ? "venue" : "venues"}`;
  const filtered = rows.length !== all.length;

  return (
    <>
      <VenuePanel rows={panelRows} mode={services.mode} nowMs={nowMs} query={selection.query} onToggle={onToggle} onRetry={retry} onLoadMore={loadMore} />
      <section aria-labelledby="explorer-markets-heading" className="explorer-section">
        <h2 id="explorer-markets-heading">Markets</h2>
        <p role="status" className="explorer-count" data-testid="explorer-count">
          {loading && all.length === 0
            ? `Loading markets from ${venuesLabel}.`
            : `${rows.length} ${rows.length === 1 ? "market" : "markets"} shown${filtered ? ` of ${all.length} loaded` : ""} from ${venuesLabel}. Each venue shows at most ${MAX_PAGES_PER_VENUE} pages.`}
        </p>
        <div className="explorer-actions">
          <Button busy={booksBusy} disabled={targets.length === 0} onClick={onLoadBooks}>
            {targets.length === 0 ? "Load order books (none of these rows can)" : `Load order books for the first ${targets.length} ${targets.length === 1 ? "row" : "rows"}`}
          </Button>
          <span className="explorer-note">One request per venue, only when you press the button. Rows from venues that need the Cockpit or have no book are skipped.</span>
        </div>
        {rows.length === 0 ? null : <MarketTable rows={rows} caption="Markets across the venues that are on" context={{ books, nowMs }} />}
        <p className="explorer-note">
          Every row is the venue's own data, shown as published apart from length limits. A display price is what the venue lists beside the market; it is not an
          order book and not a price you can trade at. An unknown figure is shown as "no data", never as zero.
        </p>
      </section>
    </>
  );
}

export function MarketsView() {
  const services = useExplorerServices();
  const announce = useAnnounce();
  const [switches, setSwitches] = useState<VenueSwitches | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<VenueId>>(new Set());
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("closing");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    void services.loadSwitches().then(
      (loaded) => {
        if (live) setSwitches(loaded);
      },
      () => {
        if (live) setSwitches(DEFAULT_SWITCHES);
      },
    );
    return () => {
      live = false;
    };
  }, [services]);

  const venueStates = useMemo(() => {
    if (switches === null) return [];
    return EXPLORER_VENUES.map((venue) => {
      const adapter = services.adapters[venue];
      return { venue, status: venueStatusOf(venue, switches, services.mode, adapter !== undefined), adapter, selected: !hidden.has(venue) };
    });
  }, [switches, services, hidden]);

  const onToggle = useCallback((venue: VenueId, selected: boolean) => {
    setHidden((current) => {
      const next = new Set(current);
      if (selected) next.delete(venue);
      else next.add(venue);
      return next;
    });
  }, []);

  if (switches === null) {
    return (
      <p role="status" className="explorer-note">
        Loading your venue settings.
      </p>
    );
  }

  const selectedVenues = venueStates.filter((state) => state.status.kind === "active" && state.selected).map((state) => state.venue);
  const selection: FeedSelection = { venues: selectedVenues, status, query };
  const signature = JSON.stringify([selectedVenues, status, query]);

  return (
    <div className="explorer">
      <p>
        One list over every venue this build can read. Venues that cannot be read here are named below with the reason. Nothing on this screen places an order.
      </p>
      <form
        className="explorer-filters"
        role="search"
        aria-label="Find markets"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim();
          setQuery(next);
          announce(next === "" ? "Showing the plain list." : "Asking the venues that can search by text.");
        }}
      >
        <Field label="Search titles">
          {(id) => (
            <input id={id} className="ui-input" type="search" value={draft} maxLength={200} autoComplete="off" spellCheck={false} onChange={(event) => setDraft(event.currentTarget.value)} />
          )}
        </Field>
        <Field label="Status">
          {(id) => (
            <select id={id} className="ui-select" value={status} onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}>
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Order by">
          {(id) => (
            <select id={id} className="ui-select" value={sort} onChange={(event) => setSort(event.currentTarget.value as SortKey)}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="explorer-filter-buttons">
          <Button type="submit" variant="primary">
            Search the venues
          </Button>
          <Button
            onClick={() => {
              setDraft("");
              setQuery("");
            }}
          >
            Clear search
          </Button>
        </div>
      </form>
      <p className="explorer-note">Typing narrows the markets already loaded and sends nothing. Press the button to ask the venues that can search by text.</p>
      <Feed key={signature} services={services} selection={selection} venueStates={venueStates} filterText={draft} sort={sort} onToggle={onToggle} />
    </div>
  );
}
