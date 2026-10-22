// The Markets surface: ONE table over every venue whose reader runs, with its views (All, Holdings, Linked,
// Signals as filter states), an inspector aside for the selected row, the market modal over the table, the
// Quotient settings dialog, and a plain-words state for every venue that cannot be read (docs/dapp-design.md 4.5,
// 7.2 M0; docs/design/cockpit-v2 Main.dc.html). Read-only: no order entry outside the XO ticket in the Cockpit build,
// no key, no signature.
//
// The top bar's search field filters the rows already loaded and sends nothing (ui/context useSearchQuery); the
// "Ask the venues" button is the only thing that sends the text to the venues that can search by it.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

import { CATEGORY_LABEL, type Category } from "../../core/category";
import { parseIsoMs } from "../../core/format";
import type { VenueId } from "../../core/ports";
import { DEFAULT_SWITCHES, type VenueSwitches } from "../../core/venue-policy";
import { Button, Disclosure, EmptyTile, ErrorTile, Num, renderableUntrusted, useAnnounce, useNow, useReportVenueCount, useSearchQuery } from "../../ui";
import { NoAddressWatched, NoVenueSelected, OutcomeTile, TotalsPanel, VenueSection, useHoldings, type Holdings } from "../portfolio";
import { QuotientSettingsDialog, useSignalsServices, type LinkLoad } from "../signals";
import { BOOK_ROW_CAP, bookTargets, loadBooks, type BookEntry, type BookTarget } from "./books";
import { EXPLORER_VENUES, venueStatusOf } from "./catalog";
import { ALL_CATEGORIES, categoryEmptyWords, countsByCategory, filterByCategory, inCategory, type CategoryFilter } from "./categories";
import { CategoryChips } from "./CategoryChips";
import { MAX_PAGES_PER_VENUE, STATUS_FILTERS, useMarketFeed, type FeedSelection, type StatusFilter } from "./feed";
import { ExplorerHero, type HeroCounts } from "./HeroBand";
import type { MarketParams } from "./ids";
import { Inspector } from "./Inspector";
import { linkedRowKeys } from "./links";
import { MarketDialog } from "./MarketDialog";
import { MarketTable, toRow, type ExplorerRow } from "./MarketTable";
import { quotientStateOf, useQuotientSnapshot, type QuotientState } from "./QuotientPanel";
import { useExplorerServices, type ExplorerServices } from "./services";
import { VenuePanel, type VenueRowState } from "./VenuePanel";
import { ViewChips } from "./ViewChips";
import { DEFAULT_VIEW, VIEW_LABELS, countsByView, filterByView, inView, marksOf, rowKeyOf, type MarkContext, type ViewId } from "./views";

export type SortKey = "closing" | "venue";

const SORTS: readonly { readonly value: SortKey; readonly label: string }[] = [
  { value: "closing", label: "Closing soonest" },
  { value: "venue", label: "Venue order" },
];

export const TABLE_CAPTION = "Markets across the venues that are on";

// Under the table, beside the books button (Main.dc.html's footer bar).
export const TABLE_FOOT_NOTE =
  "Rows are the venues' own public answers, shown as published apart from length limits; an unknown figure is \"no data\", never zero. Books load only when you press the button, one request per venue; rows whose venue needs the Cockpit or has no book are skipped.";

export const SEARCH_NOTE = "Typing in the search field narrows the markets already loaded and sends nothing. \"Ask the venues\" sends the text to the venues that can search by it.";

// The right-aligned status line of the toolbar: "9 of 9 loaded rows · 6 venues · each venue at most 5 pages".
export interface StatusFacts {
  readonly shown: number;
  readonly loaded: number;
  readonly venues: number;
  readonly loading: boolean;
  readonly view: ViewId;
  readonly category: CategoryFilter;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function StatusLine({ facts }: { readonly facts: StatusFacts | null }) {
  if (facts === null) return <>Loading markets.</>;
  const { shown, loaded, venues, loading, view, category } = facts;
  // "in Signals, Politics": the view and the category that narrowed the rows, when they did.
  const narrowed = [view === "all" ? null : VIEW_LABELS[view], category === "all" ? null : CATEGORY_LABEL[category]].filter((part): part is string => part !== null);
  if (loading && loaded === 0) {
    return (
      <>
        Loading markets from <Num>{String(venues)}</Num> {plural(venues, "venue", "venues")}.
      </>
    );
  }
  return (
    <>
      <Num>{String(shown)}</Num> of <Num>{String(loaded)}</Num> loaded {plural(loaded, "row", "rows")}
      {narrowed.length === 0 ? "" : ` in ${narrowed.join(", ")}`} · <Num>{String(venues)}</Num> {plural(venues, "venue", "venues")} · each venue at most <Num>{String(MAX_PAGES_PER_VENUE)}</Num> pages
    </>
  );
}

const VIEW_HEADINGS: Readonly<Record<ViewId, string>> = Object.freeze({ all: "All markets", held: "Holdings", linked: "Linked markets", signals: "Signals" });

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

// ---- the view headers --------------------------------------------------------------------------------------------------

function ViewHeader({ view, holdings, linkLoad, quotient, onOpenQuotientSettings }: { readonly view: ViewId; readonly holdings: Holdings; readonly linkLoad: LinkLoad | null; readonly quotient: QuotientState; readonly onOpenQuotientSettings: () => void }) {
  switch (view) {
    case "all":
      return null;
    case "held":
      return (
        <p className="explorer-note" data-view-note="held">
          {holdings.state.kind === "no_address"
            ? "Rows a watched address holds. No address is watched, so no row is held."
            : holdings.state.kind === "no_venue"
              ? "Rows a watched address holds. No venue is selected for any watched address, so nothing was read."
              : holdings.state.kind === "ready"
                ? `Rows a watched address holds, joined on the venue and the outcome token (never on the title). ${holdings.keys.size} position${holdings.keys.size === 1 ? "" : "s"} read for ${holdings.addresses} address${holdings.addresses === 1 ? "" : "es"}.`
                : holdings.state.kind === "error"
                  ? "Rows a watched address holds. The positions could not be read, so no row is marked held."
                  : "Rows a watched address holds. Positions are being read."}
        </p>
      );
    case "linked":
      return (
        <p className="explorer-note" data-view-note="linked">
          {linkLoad === null || linkLoad.state === "absent"
            ? "Rows named by an approved cross-venue link. This build bundles no link file, so no row is linked, and nothing guesses a link from similar titles."
            : linkLoad.state === "rejected"
              ? "Rows named by an approved cross-venue link. The bundled link file was refused whole, so no row is linked."
              : "Rows named by an approved cross-venue link, as candidates: a candidate is never proof, and no spread is drawn between candidates."}
        </p>
      );
    case "signals":
      return (
        <div className="explorer-view-note" data-view-note="signals">
          <p className="explorer-note">
            Rows on a venue Quotient covers (Polymarket, Polymarket US, Kalshi and Hyperliquid outcomes; not XO or Trueo).{" "}
            {quotient === "on" ? "Quotient is on: open a market to look it up; nothing is requested until you press that button." : quotient === "off" ? "Quotient is off: the licence clause comes first." : "Quotient stays off until your setting has been read."}
          </p>
          <Button onClick={onOpenQuotientSettings}>Quotient settings</Button>
        </div>
      );
  }
}

function emptyWords(view: ViewId, holdings: Holdings): { readonly title: string; readonly body: string } | null {
  switch (view) {
    case "all":
      return null;
    case "held":
      return {
        title: "No held market among the loaded rows",
        body:
          holdings.state.kind === "no_address"
            ? "No address is watched. Watch one from the wallet chip in the top bar (Just watch an address) and select venues for it; until then no row can be held."
            : "None of the loaded rows is a market a watched address holds. This is a join on exact ids, not a zero balance.",
      };
    case "linked":
      return { title: "No linked market among the loaded rows", body: "No approved or proposed link names a loaded row. The linker proposes candidates every two hours; a link exists only after a person approves it." };
    case "signals":
      return { title: "No row on a venue Quotient covers", body: "None of the loaded rows is on Polymarket, Polymarket US, Kalshi or Hyperliquid outcomes. XO and Trueo are not covered." };
  }
}

// ---- the feed ------------------------------------------------------------------------------------------------------------

interface FeedProps {
  readonly services: ExplorerServices;
  readonly selection: FeedSelection;
  readonly venueStates: readonly Omit<VenueRowState, "feed">[];
  readonly filterText: string;
  readonly sort: SortKey;
  readonly view: ViewId;
  readonly category: CategoryFilter;
  readonly markContext: MarkContext;
  readonly holdings: Holdings;
  readonly linkLoad: LinkLoad | null;
  readonly quotient: QuotientState;
  readonly selectedKey: string | null;
  readonly onSelect: (key: string | null) => void;
  readonly onToggle: (venue: VenueId, selected: boolean) => void;
  readonly onWatch: (key: string) => void;
  readonly onOpenMarket: (row: ExplorerRow) => void;
  readonly onCounts: (counts: HeroCounts & Readonly<Record<ViewId, number>>) => void;
  // The category counts of the rows in the current view, for the chip row the parent renders under the view chips.
  readonly onCategoryCounts: (counts: CategoryCounts) => void;
  // The toolbar's status line (StatusLine), reported when its figures change.
  readonly onStatus: (facts: StatusFacts) => void;
  readonly onOpenQuotientSettings: () => void;
}

export interface CategoryCounts {
  readonly byCategory: ReadonlyMap<Category, number>;
  readonly total: number;
}

// Owns the queries for one selection. The parent re-mounts it (by key) when the selection changes, so extra pages and
// loaded books never leak from one selection into another.
function Feed({ services, selection, venueStates, filterText, sort, view, category, markContext, holdings, linkLoad, quotient, selectedKey, onSelect, onToggle, onWatch, onOpenMarket, onCounts, onCategoryCounts, onStatus, onOpenQuotientSettings }: FeedProps) {
  const { feeds, loadMore, retry } = useMarketFeed(services, selection);
  const signals = useSignalsServices();
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
      for (const item of feed.items) out.push(toRow(item, adapter, marksOf(item, markContext)));
    }
    return out;
  }, [feeds, services.adapters, markContext]);

  // The view narrows first, then the category chip, then the search text; the sort comes last.
  const viewRows = useMemo(() => filterByView(all, view), [all, view]);
  const rows = useMemo(() => sortRows(filterRows(filterByCategory(viewRows, category), filterText), sort), [viewRows, category, filterText, sort]);
  const counts = useMemo(() => countsByView(all), [all]);
  const categoryCounts = useMemo(() => countsByCategory(viewRows), [viewRows]);

  const loading = feeds.some((feed) => feed.state === "loading");
  const okCount = feeds.filter((feed) => feed.state === "ok").length;
  const failed = panelRows.filter((row) => row.selected && row.feed?.state === "error").length;
  useReportVenueCount({ read: okCount, total: EXPLORER_VENUES.length });

  const announced = useRef("");
  useEffect(() => {
    if (loading || feeds.length === 0) return;
    const message = `Loaded ${all.length} markets from ${okCount} ${okCount === 1 ? "venue" : "venues"}.`;
    if (announced.current === message) return;
    announced.current = message;
    announce(message);
  }, [loading, feeds.length, all.length, okCount, announce]);

  // The feed hands out a new array every render, so `counts` is a new object every render: report it only when its
  // values changed, or the parent's state update would re-render this component for ever.
  const reported = useRef("");
  useEffect(() => {
    const key = `${counts.all}:${counts.held}:${counts.linked}:${counts.signals}`;
    if (reported.current === key) return;
    reported.current = key;
    onCounts(counts);
  }, [counts, onCounts]);

  const reportedCategories = useRef("");
  useEffect(() => {
    const key = `${viewRows.length}:${[...categoryCounts].map(([id, count]) => `${id}=${count}`).join(",")}`;
    if (reportedCategories.current === key) return;
    reportedCategories.current = key;
    onCategoryCounts({ byCategory: categoryCounts, total: viewRows.length });
  }, [categoryCounts, viewRows.length, onCategoryCounts]);

  const targets = useMemo(() => bookTargets(rows.map((row) => row.summary), services.adapters), [rows, services.adapters]);

  const load = useCallback(
    (which: readonly BookTarget[], message: string): void => {
      setBooksBusy(true);
      void loadBooks(services, which, (key, entry) => {
        setBooks((current) => new Map(current).set(key, entry));
      }).then(() => {
        setBooksBusy(false);
        announce(message);
      });
    },
    [services, announce],
  );

  const onLoadBooks = useCallback(() => load(targets, "Order books loaded for the visible markets."), [load, targets]);
  const onLoadOne = useCallback(
    (row: ExplorerRow) => {
      const target = bookTargets([row.summary], services.adapters)[0];
      if (target !== undefined) load([target], "Order book loaded for the inspected market.");
    },
    [load, services.adapters],
  );

  // The inspected row: the one picked, while the table shows it; otherwise the first row shown (Main.dc.html selects
  // the first row on load). Selecting never requests anything.
  const selected = (selectedKey === null ? undefined : rows.find((row) => row.key === selectedKey)) ?? rows[0] ?? null;
  // A category that empties a view with rows gets the category's words; an empty view keeps its own.
  const empty = rows.length === 0 ? (category !== "all" && viewRows.length > 0 ? categoryEmptyWords(category) : emptyWords(view, holdings)) : null;
  const venuesSummary = `Venues: ${okCount} of ${feeds.length} selected read${failed > 0 ? `, ${failed} could not be read` : ""}, ${panelRows.length - feeds.length} not read in this build or switched off`;

  const shownCount = rows.length;
  const loadedCount = all.length;
  const venueCount = feeds.length;
  useEffect(() => {
    onStatus({ shown: shownCount, loaded: loadedCount, venues: venueCount, loading, view, category });
  }, [shownCount, loadedCount, venueCount, loading, view, category, onStatus]);

  // "the first 10" when the cap leaves some rows that could have a book unasked.
  const capped = targets.length === BOOK_ROW_CAP && rows.filter((row) => row.adapter.books.state === "available").length > BOOK_ROW_CAP;
  const booksLabel = targets.length === 0 ? "Load books (none of these rows can)" : `Load books for ${capped ? "the first " : "the "}${targets.length} visible ${targets.length === 1 ? "row" : "rows"}`;

  return (
    <>
      <section aria-labelledby="explorer-markets-heading" className="explorer-list">
        <h2 id="explorer-markets-heading" className="ui-visually-hidden">
          {VIEW_HEADINGS[view]}
        </h2>
        <ViewHeader view={view} holdings={holdings} linkLoad={linkLoad} quotient={quotient} onOpenQuotientSettings={onOpenQuotientSettings} />
        <div className="explorer-split">
          <div className="explorer-main">
            {rows.length === 0 ? (
              empty === null ? null : (
                <EmptyTile title={empty.title} heading="h3">
                  <p>{empty.body}</p>
                </EmptyTile>
              )
            ) : (
              <MarketTable rows={rows} caption={TABLE_CAPTION} context={{ books, nowMs, selectedKey: selected?.key ?? null, onSelect, onOpenMarket }} />
            )}
            <div className="explorer-table-foot">
              <p className="explorer-note">{TABLE_FOOT_NOTE}</p>
              <Button busy={booksBusy} disabled={targets.length === 0} onClick={onLoadBooks}>
                {booksLabel}
              </Button>
            </div>
          </div>
          <Inspector
            row={selected}
            book={selected === null ? undefined : books.get(selected.key)}
            nowMs={nowMs}
            linkLoad={linkLoad}
            readLeg={signals.readLeg}
            clock={signals.nowMs}
            quotient={quotient}
            onOpenMarket={onOpenMarket}
            onPrepare={onOpenMarket}
            onWatch={(row) => onWatch(row.key)}
            onLoadBook={onLoadOne}
            onOpenQuotientSettings={onOpenQuotientSettings}
          />
        </div>
      </section>
      {view === "held" ? <HoldingsPanels holdings={holdings} /> : null}
      <div className="explorer-venues-fold">
        <Disclosure summary={venuesSummary} defaultOpen={failed > 0 || okCount === 0}>
          <VenuePanel rows={panelRows} mode={services.mode} nowMs={nowMs} query={selection.query} onToggle={onToggle} onRetry={retry} onLoadMore={loadMore} />
        </Disclosure>
      </div>
    </>
  );
}

// The positions the Holdings view is built from, under the table: totals, one section per venue read, and the tile
// for every read that returned no table.
function HoldingsPanels({ holdings }: { readonly holdings: Holdings }) {
  const { state } = holdings;
  return (
    <section aria-labelledby="explorer-positions-heading" className="explorer-section" data-holdings={state.kind}>
      <h2 id="explorer-positions-heading">Positions by venue</h2>
      {state.kind === "loading" ? <p role="status">Loading your watched addresses</p> : null}
      {state.kind === "no_address" ? <NoAddressWatched /> : null}
      {state.kind === "no_venue" ? <NoVenueSelected /> : null}
      {state.kind === "reading" ? <p role="status">Reading positions</p> : null}
      {state.kind === "error" ? <ErrorTile code="UNKNOWN" title="The positions could not be read" message="Nothing was read. Try again." heading="h3" onRetry={holdings.refresh} /> : null}
      {state.kind === "ready" ? (
        <>
          <p className="explorer-actions">
            <Button onClick={holdings.refresh} busy={state.query.fetching}>
              Refresh positions
            </Button>
          </p>
          <TotalsPanel rows={state.rows} heading="h3" />
          {state.ok.map((outcome) => (
            <VenueSection key={`${outcome.venue}:${outcome.bindingId}:${outcome.holder}`} outcome={outcome} heading="h3" />
          ))}
          {state.others.map((outcome) => (
            <OutcomeTile key={`${outcome.kind}:${outcome.venue}:${outcome.bindingId}`} outcome={outcome} onRetry={holdings.refresh} heading="h3" />
          ))}
        </>
      ) : null}
    </section>
  );
}

// ---- the surface -----------------------------------------------------------------------------------------------------------

export interface MarketsViewProps {
  // A deep link (a cold load of /market/:venue/:id): open this market's modal over the unchanged surface.
  readonly market?: MarketParams;
  // The deep link named no venue and market this app can read.
  readonly invalidAddress?: boolean;
}

export function MarketsView({ market, invalidAddress = false }: MarketsViewProps) {
  const services = useExplorerServices();
  const announce = useAnnounce();
  const [, navigate] = useLocation();
  const { query: filterText, setQuery } = useSearchQuery();
  const [switches, setSwitches] = useState<VenueSwitches | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<VenueId>>(new Set());
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("closing");
  const [venueQuery, setVenueQuery] = useState("");
  const [view, setView] = useState<ViewId>(DEFAULT_VIEW);
  const [category, setCategory] = useState<CategoryFilter>(ALL_CATEGORIES);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [watched, setWatched] = useState<ReadonlySet<string>>(new Set());
  const [opened, setOpened] = useState<MarketParams | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [counts, setCounts] = useState<(HeroCounts & Readonly<Record<ViewId, number>>) | null>(null);
  const [linkLoad, setLinkLoad] = useState<LinkLoad | null>(null);
  const [statusFacts, setStatusFacts] = useState<StatusFacts | null>(null);
  const searchNoteId = useId();

  const holdings = useHoldings(() => services.memory.rows());
  const signals = useSignalsServices();
  const snapshot = useQuotientSnapshot();
  const quotient = quotientStateOf(snapshot);

  useEffect(() => {
    if (!snapshot.loaded) void signals.session.load();
  }, [signals, snapshot.loaded]);

  useEffect(() => {
    let live = true;
    signals
      .loadLinks()
      .then((load) => {
        if (live) setLinkLoad(load);
      })
      .catch(() => {
        if (live) setLinkLoad({ state: "rejected", reason: "schema" });
      });
    return () => {
      live = false;
    };
  }, [signals]);

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

  const onWatch = useCallback((key: string) => {
    setWatched((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onOpenMarket = useCallback((row: ExplorerRow) => setOpened({ venue: row.summary.ref.venue, marketId: row.summary.ref.marketId }), []);
  const onCounts = useCallback((next: HeroCounts & Readonly<Record<ViewId, number>>) => setCounts(next), []);
  const onCategoryCounts = useCallback((next: CategoryCounts) => setCategoryCounts(next), []);
  const onStatus = useCallback((facts: StatusFacts) => setStatusFacts(facts), []);
  const openQuotientSettings = useCallback(() => setSettingsOpen(true), []);

  // Which rows are linked, from the loaded dataset and the rows this visit has seen (memory holds every list row).
  const markContext = useMemo<MarkContext>(() => {
    const seen: { readonly venue: VenueId; readonly marketId: string }[] = [];
    if (linkLoad !== null && linkLoad.state === "loaded") {
      for (const row of services.memory.rows()) seen.push({ venue: row.ref.venue, marketId: row.ref.marketId });
    }
    return { holdings: holdings.keys, linkedRows: linkedRowKeys(linkLoad, seen, { candidates: true }), watched };
    // counts changes when the feed loads new rows, which is when memory has more rows to look at.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings.keys, linkLoad, watched, services.memory, counts?.all]);

  // A title click and "Open market" set state, so the modal opens over the table as it is. Only a cold load of the
  // market address arrives through the route; closing that one leaves the address, which is the start of the surface.
  const open = market ?? opened;
  const onClose = useCallback(() => {
    if (market !== undefined) navigate("/");
    else setOpened(null);
  }, [market, navigate]);

  // Switching a view drops a selection the new view does not show, so the inspector never keeps a row that no table
  // row is marked as.
  const onView = useCallback(
    (next: ViewId) => {
      setView(next);
      setSelectedKey((key) => {
        if (key === null) return null;
        const row = services.memory.rows().find((candidate) => rowKeyOf(candidate.ref.venue, candidate.ref.marketId) === key);
        return row !== undefined && inView(marksOf(row, markContext), next) ? key : null;
      });
    },
    [services.memory, markContext],
  );

  // Likewise for a category chip: a selection the new category does not show is dropped from the inspector.
  const onCategory = useCallback(
    (next: CategoryFilter) => {
      setCategory(next);
      setSelectedKey((key) => {
        if (key === null) return null;
        const row = services.memory.rows().find((candidate) => rowKeyOf(candidate.ref.venue, candidate.ref.marketId) === key);
        return row !== undefined && inCategory(row, next) ? key : null;
      });
    },
    [services.memory],
  );

  // The venues whose reader runs with the current settings: the number the h1 names (never a hard-coded one).
  const readable = switches === null ? null : venueStates.filter((state) => state.status.kind === "active").length;
  const band = <ExplorerHero venues={readable} rows={counts === null ? null : counts.all} counts={counts} holdings={holdings.state.kind} links={linkLoad} quotient={quotient} />;

  if (switches === null) {
    return (
      <div className="explorer">
        {band}
        <p role="status" className="explorer-note">
          Loading your venue settings.
        </p>
      </div>
    );
  }

  const selectedVenues = venueStates.filter((state) => state.status.kind === "active" && state.selected).map((state) => state.venue);
  const selection: FeedSelection = { venues: selectedVenues, status, query: venueQuery };
  const signature = JSON.stringify([selectedVenues, status, venueQuery]);
  const chipCounts = counts === null ? null : { all: counts.all, held: counts.held, linked: counts.linked, signals: counts.signals };
  // "Ask the venues" and "Clear search" matter only once there is text to send or a venue search to clear.
  const searching = filterText.trim() !== "" || venueQuery !== "";

  return (
    <div className="explorer" data-view={view} data-category={category}>
      {band}
      {invalidAddress ? (
        <ErrorTile code="NOT_FOUND" title="This is not a market address" message="The address does not name a venue and a market id this app can read, so nothing was requested. The Markets list is below." />
      ) : null}
      <div className="explorer-toolbar">
        <ViewChips view={view} counts={chipCounts} onView={onView} />
        <span className="explorer-toolbar-rule" aria-hidden="true" />
        <form
          className="explorer-filters"
          role="search"
          aria-label="Find markets"
          onSubmit={(event) => {
            event.preventDefault();
            const next = filterText.trim();
            setVenueQuery(next);
            announce(next === "" ? "Showing the plain list." : "Asking the venues that can search by text.");
          }}
        >
          <label className="explorer-inline-field">
            <span>Status</span>
            <select className="ui-select" value={status} onChange={(event) => setStatus(event.currentTarget.value as StatusFilter)}>
              {STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="explorer-inline-field">
            <span>Sort</span>
            <select className="ui-select" value={sort} onChange={(event) => setSort(event.currentTarget.value as SortKey)}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {searching ? (
            <span className="explorer-filter-buttons">
              <Button type="submit" aria-describedby={searchNoteId}>
                Ask the venues
              </Button>
              <Button
                onClick={() => {
                  setQuery("");
                  setVenueQuery("");
                }}
              >
                Clear search
              </Button>
            </span>
          ) : null}
          <span id={searchNoteId} hidden>
            {SEARCH_NOTE}
          </span>
        </form>
        <p role="status" className="explorer-status-line" data-testid="explorer-count">
          <StatusLine facts={statusFacts} />
        </p>
      </div>
      <CategoryChips category={category} counts={categoryCounts === null ? null : categoryCounts.byCategory} total={categoryCounts === null ? null : categoryCounts.total} onCategory={onCategory} />
      <Feed
        key={signature}
        services={services}
        selection={selection}
        venueStates={venueStates}
        filterText={filterText}
        sort={sort}
        view={view}
        category={category}
        markContext={markContext}
        holdings={holdings}
        linkLoad={linkLoad}
        quotient={quotient}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onToggle={onToggle}
        onWatch={onWatch}
        onOpenMarket={onOpenMarket}
        onCounts={onCounts}
        onCategoryCounts={onCategoryCounts}
        onStatus={onStatus}
        onOpenQuotientSettings={openQuotientSettings}
      />
      {open === null ? null : (
        <MarketDialog market={open} summary={services.memory.get(open.venue, open.marketId)} switches={switches} linkLoad={linkLoad} readLeg={signals.readLeg} onClose={onClose} onOpenQuotientSettings={openQuotientSettings} />
      )}
      <QuotientSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
