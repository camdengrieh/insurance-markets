// The Quotient settings (docs/dapp-design.md 4.5 "Signals", 4.7, M3): the switch, the spend meter, the calls, their
// results and the track record. Hosted in the Quotient settings dialog of the Markets surface
// (QuotientSettingsDialog.tsx); there is no Signals screen. Quotient's forecasts are shown beside venue prices and
// never blended into a score of ours.
//
// Rules this component holds (each is a test in signals.test.tsx):
//   - Quotient is OFF until the user reads the licence clause and switches it on (R8).
//   - Nothing is requested on load, on a timer or on a refocus. A paid route runs only from the press of the button
//     that shows its price (M3-5), and the page never pays: a 402 is shown as "payment required" (M3-1).
//   - Results live in this component's state and the client's memory store: not in IndexedDB, not in a URL, not in a
//     file (M3-4). They are dropped on page hide, after 15 idle minutes, and when Quotient is switched off.
//   - There is no export, copy, share, download or print control for Quotient or Kalshi rows (M3-8).
//   - Default filter: forecasting. Sports (experimental) only behind an opt-in (research 12 10.4).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { IDLE_DROP_MS } from "../../core/cache";
import { addQty, cmpQty, parseQty } from "../../core/money";
import { Badge, EmptyTile, Tile, useAnnounce, useClock, useNow, formatAge, formatUtc } from "../../ui";
import {
  ROUTES,
  WHY_NOT_ARBITRAGE,
  allPass,
  approvalFor,
  gatesOf,
  type PerformanceSnapshot,
  type QuotientResult,
  type RouteId,
  type RowSet,
} from "../../venues/quotient";
import { CallPanel, type ImportRoute, type PaidRoute } from "./CallPanel";
import { GatePanel, ShapeStatus } from "./GatePanel";
import { RejectedRows, ResultNotice } from "./Notices";
import { RowCard } from "./RowCard";
import { SpendPanel } from "./SpendPanel";
import { TrackRecord } from "./TrackRecord";
import { usdLabel } from "./figures";
import type { LinkLoad } from "./links/dataset";
import { useSignalsServices } from "./services";

type ListKey = PaidRoute | "import";
interface ListEntry {
  readonly result: QuotientResult<RowSet>;
  // The route the rows came from, for the cost line under each row.
  readonly route: RouteId;
}
type Lists = Readonly<Partial<Record<ListKey, ListEntry>>>;

export const COVERAGE_FILTERS = ["forecasting", "with_experimental", "all"] as const;
export type CoverageFilter = (typeof COVERAGE_FILTERS)[number];

const COVERAGE_FILTER_TEXT: Readonly<Record<CoverageFilter, string>> = Object.freeze({
  forecasting: "Forecasting only (default)",
  with_experimental: "Also experimental (all sports, no established edge)",
  all: "Everything, including under review and research only",
});

const LIST_TITLES: Readonly<Record<ListKey, string>> = Object.freeze({
  mispriced: "Mispriced markets",
  signals: "Published signals",
  lookup: "Market lookup",
  import: "Imported from your agent",
});

function isRowSet(data: unknown): data is RowSet {
  return typeof data === "object" && data !== null && "rows" in data && Array.isArray((data as { rows?: unknown }).rows);
}

// An import of a list route yields rows; an import that yields a snapshot is handled by the track record.
function asRows(result: QuotientResult<RowSet | PerformanceSnapshot>): QuotientResult<RowSet> {
  if (result.status !== "ok") return result;
  if (isRowSet(result.data)) return { ...result, data: result.data };
  return { status: "failed_closed", route: result.route, reason: "bad_shape", rejected: [], text: "Failed closed: that file is not a list of rows." };
}

function asSnapshot(result: QuotientResult<RowSet | PerformanceSnapshot>): QuotientResult<PerformanceSnapshot> {
  if (result.status !== "ok") return result;
  if (!isRowSet(result.data)) return { ...result, data: result.data };
  return { status: "failed_closed", route: result.route, reason: "bad_shape", rejected: [], text: "Failed closed: that file is not a track-record snapshot." };
}

function covered(filter: CoverageFilter, coverage: string | null): boolean {
  if (filter === "all") return true;
  if (coverage === "forecasting") return true;
  return filter === "with_experimental" && coverage === "experimental";
}

export function SignalsView() {
  const services = useSignalsServices();
  const { session } = services;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const clock = useClock();
  const now = useNow(15_000);
  const announce = useAnnounce();

  const [linkLoad, setLinkLoad] = useState<LinkLoad | null>(null);
  const [lists, setLists] = useState<Lists>({});
  const [track, setTrack] = useState<QuotientResult<PerformanceSnapshot> | null>(null);
  const [busy, setBusy] = useState<RouteId | null>(null);
  const [ownLimit, setOwnLimit] = useState("2");
  const [coverage, setCoverage] = useState<CoverageFilter>("forecasting");
  const [notice, setNotice] = useState<string | null>(null);
  const touched = useRef(clock.now());

  useEffect(() => {
    if (!snapshot.loaded) void session.load();
  }, [session, snapshot.loaded]);

  useEffect(() => {
    let live = true;
    services
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
  }, [services]);

  // Whatever drops memory (switch off, page hide, idle) also empties what this screen holds.
  useEffect(() => {
    setLists({});
    setTrack(null);
    setNotice(null);
  }, [snapshot.epoch]);

  useEffect(() => {
    const onHide = (): void => session.dropMemory();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [session]);

  const holding = Object.keys(lists).length > 0 || track !== null;
  useEffect(() => {
    if (holding && now - touched.current > IDLE_DROP_MS) session.dropMemory();
  }, [holding, now, session]);

  const keyed = snapshot.access === "key";
  const enabled = snapshot.enabled;

  const overOwnLimit = useCallback(
    (route: PaidRoute): boolean => {
      if (!keyed) return false;
      const spent = parseQty("usd", session.spentTodayUsd());
      const price = parseQty("usd", ROUTES[route].priceUsd);
      const limit = parseQty("usd", ownLimit);
      if (spent === null || price === null || limit === null) return true;
      return cmpQty(addQty(spent, price), limit) > 0;
    },
    [keyed, ownLimit, session],
  );

  const runList = useCallback(
    async (route: PaidRoute, call: () => Promise<QuotientResult<RowSet>>): Promise<void> => {
      touched.current = clock.now();
      if (overOwnLimit(route)) {
        setNotice(`Not requested: this call would take today's spend above your own limit of ${usdLabel(ownLimit)}. Raise your limit if you want it.`);
        return;
      }
      setNotice(null);
      setBusy(route);
      try {
        const result = await call();
        setLists((previous) => ({ ...previous, [route]: { result, route } }));
        announce(result.status === "ok" ? `${LIST_TITLES[route]} loaded: ${result.data.rows.length} rows.` : `${LIST_TITLES[route]}: ${result.status.replaceAll("_", " ")}.`);
      } finally {
        setBusy(null);
        session.touch();
      }
    },
    [announce, clock, overOwnLimit, ownLimit, session],
  );

  const resetHalt = useCallback(() => {
    session.client().resetHalt();
    session.touch();
  }, [session]);

  const onImport = useCallback(
    (route: ImportRoute, text: string): void => {
      touched.current = clock.now();
      const result = session.client().importJson(route, text);
      if (route === "performance") setTrack(asSnapshot(result));
      else setLists((previous) => ({ ...previous, import: { result: asRows(result), route } }));
      session.touch();
      announce("Import checked.");
    },
    [announce, clock, session],
  );

  const onTrack = useCallback(async (): Promise<void> => {
    touched.current = clock.now();
    setBusy("performance");
    try {
      setTrack(await session.client().performance());
    } finally {
      setBusy(null);
      session.touch();
    }
  }, [clock, session]);

  const done: Readonly<Record<PaidRoute, boolean>> = {
    mispriced: lists.mispriced?.result.status === "ok",
    signals: lists.signals?.result.status === "ok",
    lookup: lists.lookup?.result.status === "ok",
  };

  const entries = (Object.keys(LIST_TITLES) as ListKey[]).flatMap((key) => {
    const entry = lists[key];
    return entry === undefined ? [] : [{ key, entry }];
  });

  return (
    <div className="signals">
      <p className="signals-lead">
        Quotient publishes forecasts and flags markets where its estimate and a venue's quote differ. They are shown here beside the venue's own prices, never blended into a score of ours. No order is placed from a Quotient number.
      </p>
      <p className="signals-why" data-why-not-arbitrage="screen">
        {WHY_NOT_ARBITRAGE}
      </p>

      <ShapeStatus />
      <GatePanel session={session} snapshot={snapshot} mode={services.mode} />

      {enabled ? (
        <>
          <SpendPanel spend={snapshot.spend} keyed={keyed} ownLimit={ownLimit} onOwnLimit={setOwnLimit} />

          <section className="signals-section" aria-labelledby="signals-ask-heading">
            <h2 id="signals-ask-heading">Ask Quotient</h2>
            <p className="signals-note">
              Nothing is requested until you press a button, and each button shows what the call costs. {keyed ? "Your key is attached, so a press is charged." : "With no key a paid press only shows the price."}
            </p>
            {notice === null ? null : (
              <Tile tone="warn" title="Not requested" heading="h3" dataKind="signals-notice" dataCode="own_limit">
                <p>{notice}</p>
              </Tile>
            )}
            <CallPanel
              keyed={keyed}
              busy={busy}
              done={done}
              onMispriced={(params, refresh) => void runList("mispriced", () => session.client().mispriced(params, { approval: approvalFor("mispriced"), refresh }))}
              onSignals={(params, refresh) => void runList("signals", () => session.client().signals(params, { approval: approvalFor("signals"), refresh }))}
              onLookup={(marketKeys, refresh) => void runList("lookup", () => session.client().lookup({ marketKeys }, { approval: approvalFor("lookup"), refresh }))}
              onImport={onImport}
            />
          </section>

          <section className="signals-section" aria-labelledby="signals-results-heading">
            <h2 id="signals-results-heading">Results</h2>
            <fieldset className="signals-access">
              <legend>Which rows to show</legend>
              {COVERAGE_FILTERS.map((value) => (
                <label key={value} className="signals-check">
                  <input type="radio" name="signals-coverage" value={value} checked={coverage === value} onChange={() => setCoverage(value)} />
                  <span>{COVERAGE_FILTER_TEXT[value]}</span>
                </label>
              ))}
            </fieldset>
            {coverage !== "forecasting" ? (
              <p className="signals-note" data-experimental-note="shown">
                <Badge tone="warn">experimental</Badge> Sports markets are live but have no established edge. Treat them as research, not as signals.
              </p>
            ) : null}
            {entries.length === 0 ? (
              <EmptyTile title="No results yet" heading="h3">
                <p>Nothing has been requested, so there is nothing to show. This is not an empty answer from Quotient.</p>
              </EmptyTile>
            ) : (
              entries.map(({ key, entry }) => (
                <ResultsSection key={key} listKey={key} entry={entry} coverage={coverage} nowMs={now} linkLoad={linkLoad} onResetHalt={resetHalt} />
              ))
            )}
          </section>
        </>
      ) : null}

      <TrackRecord result={track} enabled={enabled} busy={busy === "performance"} nowMs={now} onLoad={() => void onTrack()} onResetHalt={resetHalt} />
    </div>
  );
}

interface ResultsSectionProps {
  readonly listKey: ListKey;
  readonly entry: ListEntry;
  readonly coverage: CoverageFilter;
  readonly nowMs: number;
  readonly linkLoad: LinkLoad | null;
  readonly onResetHalt: () => void;
}

function ResultsSection({ listKey, entry, coverage, nowMs, linkLoad, onResetHalt }: ResultsSectionProps) {
  const services = useSignalsServices();
  const { result } = entry;
  const heading = `${LIST_TITLES[listKey]}`;
  if (result.status !== "ok") {
    return (
      <section className="signals-results" data-results={listKey} aria-label={heading}>
        <h3>{heading}</h3>
        <ResultNotice result={result} onResetHalt={onResetHalt} />
      </section>
    );
  }
  const allowExperimental = coverage !== "forecasting";
  const shown = result.data.rows.filter((row) => covered(coverage, row.coverage));
  const hiddenByFilter = result.data.rows.length - shown.length;
  // Rows that pass every check first; a failing row is demoted, never deleted.
  const ordered = [...shown].sort((a, b) => Number(allPass(gatesOf(b, { nowMs, allowExperimental }))) - Number(allPass(gatesOf(a, { nowMs, allowExperimental }))));
  const originText = result.origin === "cache" ? "from this tab's memory (no new request, no new charge)" : result.origin === "import" ? "imported from your file (no request was made)" : "a new request";
  return (
    <section className="signals-results" data-results={listKey} aria-label={heading}>
      <h3>{heading}</h3>
      <p className="signals-note" data-result-origin={result.origin}>
        {result.data.rows.length} row{result.data.rows.length === 1 ? "" : "s"} read, {originText}, {formatAge(result.fetchedAtMs, nowMs)} ({formatUtc(result.fetchedAtMs)}).
        {result.charged ? ` This call was charged, about ${usdLabel(ROUTES[result.route].priceUsd)} by the price table.` : ""}
        {result.data.truncated ? " More rows were sent than this page reads; the rest were not read." : ""}
      </p>
      <RejectedRows rejected={result.data.rejected} />
      {hiddenByFilter > 0 ? (
        <p className="signals-note" data-hidden-by-filter={hiddenByFilter}>
          {hiddenByFilter} row{hiddenByFilter === 1 ? " is" : "s are"} hidden by the coverage filter above. Hidden is not the same as absent.
        </p>
      ) : null}
      {ordered.length === 0 ? (
        <p>No rows to show with this filter.</p>
      ) : (
        <div className="signals-rows">
          {ordered.map((row) => (
            <RowCard key={row.rowId} row={row} route={entry.route} nowMs={nowMs} allowExperimental={allowExperimental} linkLoad={linkLoad} readLeg={services.readLeg} clock={services.nowMs} />
          ))}
        </div>
      )}
    </section>
  );
}
