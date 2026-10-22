// The fan-out: one independent query per enabled venue, merged by the screen. One venue failing leaves the others
// rendering (the M2-6 principle, applied to the explorer). A switched-off or Cockpit-only venue is never queried
// (`enabled: false`), so nothing is requested from it.
//
// A venue that is throttled, blocked or read from the chain only (sdk/venues/state.ts) is "degraded", not failed: it
// stays in the list with the rows read earlier in this visit, each field labelled with its source and age
// (sdk/venues/state-fields.ts), the settlement read from its contracts where it settles on a chain this app reads, and
// the fields only the venue holds empty with the stated reason. A chain-only venue's API is never asked.

import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { CHAIN_NOT_ON_CHAIN, isChainReadVenue, MAX_CHAIN_ROWS, readChainResolutions, sourceSummary, type ChainField } from "@sdk/venues/state-fields";
import { READ_OK, type VenueReadState } from "@sdk/venues/state";

import { ttlFor } from "../../core/cache";
import { adapterErrorOfFetch, isNeedsCockpit } from "../../core/fetch";
import type { AdapterError, MarketSummary, Prov, SourcedSummary, Status, VenueId } from "../../core/ports";
import { renderableUntrusted, venueName } from "../../ui";
import type { ExplorerAdapter, ListOutcome } from "./adapters";
import type { ExplorerServices } from "./services";
import { isStateCode, stateFor } from "./venue-state";

export const PAGE_SIZE = 20;
// Per-venue fan-out cap: at most this many pages of one venue are loaded by pressing "Load more".
export const MAX_PAGES_PER_VENUE = 5;

export const STATUS_FILTERS = [
  { value: "active", label: "Open", statuses: ["active"] },
  { value: "closed", label: "Closed or awaiting result", statuses: ["closed", "determined"] },
  { value: "resolved", label: "Resolved", statuses: ["resolved"] },
] as const satisfies readonly { readonly value: string; readonly label: string; readonly statuses: readonly Status[] }[];
export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export function statusesOf(filter: StatusFilter): readonly Status[] {
  return STATUS_FILTERS.find((candidate) => candidate.value === filter)?.statuses ?? ["active"];
}

export interface FeedSelection {
  // Venues whose reader runs and that the user has not unchecked.
  readonly venues: readonly VenueId[];
  readonly status: StatusFilter;
  // The text sent to the venues; "" means a plain list.
  readonly query: string;
}

// ---- errors ----------------------------------------------------------------------------------------------------------------

export type FeedErrorCode = AdapterError | "NEEDS_COCKPIT" | "UNKNOWN";

const ADAPTER_CODES: ReadonlySet<string> = new Set<AdapterError>(["RATE_LIMITED", "STALE", "NOT_SUPPORTED", "SCHEMA_DRIFT", "VENUE_PAUSED", "NOT_FOUND", "TIMEOUT", "EMPTY_BOOK"]);

export interface ClassifiedError {
  readonly code: FeedErrorCode;
  readonly retryAfterMs: number | null;
}

// Every reader throws its own class (XoAdapterError, PolymarketError, AdapterFailure, AdapterException) and the fetch
// port throws FetchError. They share a `code`; the message is never read, because it could quote upstream text.
export function classifyError(error: unknown): ClassifiedError {
  if (isNeedsCockpit(error)) return { code: "NEEDS_COCKPIT", retryAfterMs: null };
  const holder = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; retryAfterMs?: unknown };
  const retryAfterMs = typeof holder.retryAfterMs === "number" && Number.isFinite(holder.retryAfterMs) ? holder.retryAfterMs : null;
  if (typeof holder.code === "string" && ADAPTER_CODES.has(holder.code)) return { code: holder.code as AdapterError, retryAfterMs };
  const mapped = adapterErrorOfFetch(error);
  return { code: mapped ?? "UNKNOWN", retryAfterMs };
}

export class FeedError extends Error {
  readonly classified: ClassifiedError;
  constructor(classified: ClassifiedError) {
    // A fixed message: the original one is dropped on purpose.
    super(`list failed: ${classified.code}`);
    this.name = "FeedError";
    this.classified = classified;
  }
}

// ---- the feed --------------------------------------------------------------------------------------------------------------

export type VenueFeedState = "loading" | "ok" | "error" | "search_unsupported" | "degraded";

export interface VenueFeed {
  readonly venue: VenueId;
  readonly state: VenueFeedState;
  // The rows as they may be shown (venue-only fields nulled for a blocked or chain-only venue); `rows` has the same
  // rows with the origin of every field.
  readonly items: readonly MarketSummary[];
  readonly rows: readonly SourcedSummary[];
  // Whether the venue's API can be asked now, and if not why. A degraded feed's rows are kept from earlier reads.
  readonly readState: VenueReadState;
  readonly refused: number;
  // The venue cut a text search short and offers no way to the rest.
  readonly truncated: boolean;
  readonly next: string | null;
  readonly error: ClassifiedError | null;
  readonly prov: Prov | null;
  readonly pages: number;
  readonly loadingMore: boolean;
  readonly moreError: ClassifiedError | null;
  readonly fetchedAtMs: number | null;
}

interface Extra {
  readonly items: readonly MarketSummary[];
  readonly refused: number;
  readonly next: string | null;
  readonly pages: number;
  readonly loading: boolean;
  readonly error: ClassifiedError | null;
}

const NO_EXTRA: Extra = { items: [], refused: 0, next: null, pages: 0, loading: false, error: null };

function ownRows(venue: VenueId, outcome: ListOutcome): MarketSummary[] {
  // A reader that returned another venue's row would mislabel it; such a row is dropped.
  return outcome.page.items.filter((item) => item.ref.venue === venue);
}

export interface MarketFeed {
  readonly feeds: readonly VenueFeed[];
  loadMore(venue: VenueId): void;
  retry(venue: VenueId): void;
}

// Rows of one venue kept in this visit's memory that fit the selection: its status filter and, for a text search, a
// title that contains the text (the venue's own search cannot be asked).
function keptRows(services: ExplorerServices, venue: VenueId, statuses: readonly Status[], text: string): MarketSummary[] {
  const needle = text.toLowerCase();
  return services.memory.rows().filter((row) => {
    if (row.ref.venue !== venue || !statuses.includes(row.status)) return false;
    if (needle === "") return true;
    return (renderableUntrusted(row.title, { field: "title" }) ?? "").toLowerCase().includes(needle);
  });
}

function dedupe(rows: readonly MarketSummary[]): MarketSummary[] {
  const seen = new Set<string>();
  const out: MarketSummary[] = [];
  for (const row of rows) {
    const key = row.ref.marketId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

// Why a degraded row has no settlement from the chain.
function chainNote(venue: VenueId, readState: VenueReadState, status: "pending" | "error" | "success" | "off"): ChainField {
  if (!isChainReadVenue(venue)) return { ok: false, reason: CHAIN_NOT_ON_CHAIN };
  if (readState.kind === "throttled") return { ok: false, reason: "Not read from the chain: the venue only asked us to slow down." };
  if (status === "pending") return { ok: false, reason: "Being read from the chain." };
  if (status === "error") return { ok: false, reason: "The chain could not be read just now, so the settlement is not shown." };
  if (status === "off") return { ok: false, reason: "This build names no public RPC for this venue's chain." };
  return { ok: false, reason: `Only the first ${MAX_CHAIN_ROWS} rows of a venue are read from the chain.` };
}

// Call with a stable `selection`-derived key. The caller re-mounts the component that owns this hook when the
// selection changes (the extra pages belong to one selection). `nowMs` is the screen's clock tick.
export function useMarketFeed(services: ExplorerServices, selection: FeedSelection, nowMs: number = services.nowMs()): MarketFeed {
  const venues = selection.venues.filter((venue) => services.adapters[venue] !== undefined);
  const text = selection.query.trim();
  const statuses = statusesOf(selection.status);
  const tracked = venues.map((venue) => services.venueState(venue, nowMs));

  const queries = useQueries({
    queries: venues.map((venue, index) => {
      const entry = services.adapters[venue] as ExplorerAdapter;
      const searchable = text === "" || entry.adapter.caps.search;
      return {
        queryKey: ["explorer", "list", services.id, venue, selection.status, text] as const,
        // A chain-only venue's API is never asked.
        enabled: searchable && tracked[index]?.kind !== "chain_only",
        staleTime: ttlFor("market_list"),
        queryFn: async (): Promise<ListOutcome> => {
          try {
            const outcome = await entry.list({ statuses, limit: PAGE_SIZE, ...(text === "" ? {} : { text }) });
            for (const row of ownRows(venue, outcome)) services.memory.put(row);
            return outcome;
          } catch (error) {
            throw new FeedError(classifyError(error));
          }
        },
      };
    }),
  });

  const [extras, setExtras] = useState<Readonly<Record<string, Extra>>>({});
  const extrasRef = useRef(extras);
  useEffect(() => {
    extrasRef.current = extras;
  }, [extras]);
  const dataRef = useRef<Readonly<Record<string, ListOutcome | undefined>>>({});
  dataRef.current = Object.fromEntries(venues.map((venue, index) => [venue, queries[index]?.data]));

  const patch = useCallback((venue: VenueId, change: Partial<Extra>) => {
    setExtras((current) => ({ ...current, [venue]: { ...(current[venue] ?? NO_EXTRA), ...change } }));
  }, []);

  const loadMore = useCallback(
    (venue: VenueId): void => {
      const entry = services.adapters[venue];
      const base = dataRef.current[venue];
      const extra = extrasRef.current[venue] ?? NO_EXTRA;
      if (entry === undefined || base === undefined || extra.loading || extra.pages + 1 >= MAX_PAGES_PER_VENUE) return;
      const cursor = extra.pages === 0 ? base.page.next : extra.next;
      if (cursor === null) return;
      patch(venue, { loading: true, error: null });
      void entry
        .list({ statuses, limit: PAGE_SIZE, cursor, ...(text === "" ? {} : { text }) })
        .then((outcome) => {
          const rows = ownRows(venue, outcome);
          for (const row of rows) services.memory.put(row);
          const previous = extrasRef.current[venue] ?? NO_EXTRA;
          patch(venue, { items: [...previous.items, ...rows], refused: previous.refused + outcome.refused, next: outcome.page.next, pages: previous.pages + 1, loading: false });
        })
        .catch((error: unknown) => {
          patch(venue, { loading: false, error: classifyError(error) });
        });
    },
    // statuses and text are derived from `selection`, which is stable for the life of this hook's owner.
    [services, patch, selection.status, text],
  );

  const retry = useCallback(
    (venue: VenueId): void => {
      const index = venues.indexOf(venue);
      void queries[index]?.refetch();
    },
    [queries],
  );

  // Per venue: its state now, whether its rows are kept from earlier reads, and which rows those are.
  const plans = venues.map((venue, index) => {
    const query = queries[index];
    const entry = services.adapters[venue] as ExplorerAdapter;
    const extra = extras[venue] ?? NO_EXTRA;
    const base = query?.data;
    const baseItems = base === undefined ? [] : ownRows(venue, base);
    const error = query?.error == null ? null : query.error instanceof FeedError ? query.error.classified : classifyError(query.error);
    const own = tracked[index] ?? READ_OK;
    const readState = stateFor(own, error, query?.errorUpdatedAt ? query.errorUpdatedAt : nowMs);
    const stateError = error !== null && isStateCode(error.code);
    const degraded = own.kind === "chain_only" || stateError;
    const items = degraded ? dedupe([...baseItems, ...extra.items, ...keptRows(services, venue, statuses, text)]) : [...baseItems, ...extra.items];
    return { venue, query, entry, extra, base, error, readState, degraded, items };
  });

  // The settlement of a blocked or chain-only venue's kept rows, from its contracts.
  const chainPlans = plans.filter((plan) => plan.degraded && (plan.readState.kind === "blocked" || plan.readState.kind === "chain_only") && isChainReadVenue(plan.venue) && plan.items.length > 0);
  const chainQueries = useQueries({
    queries: chainPlans.map((plan) => {
      const venue = plan.venue;
      const rows = plan.items.slice(0, MAX_CHAIN_ROWS);
      const session = isChainReadVenue(venue) ? services.chainSession(venue) : null;
      return {
        queryKey: ["explorer", "chain", services.id, venue, rows.map((row) => row.ref.marketId.toLowerCase()).join(",")] as const,
        enabled: session !== null,
        staleTime: ttlFor("market_list"),
        queryFn: async (): Promise<ReadonlyMap<string, ChainField>> => {
          if (session === null || !isChainReadVenue(venue)) return new Map();
          return readChainResolutions(venue, rows, session, services.nowMs);
        },
      };
    }),
  });

  const feeds: VenueFeed[] = plans.map(({ venue, query, entry, extra, base, error, readState, degraded, items }) => {
    const unsupported = text !== "" && !entry.adapter.caps.search;
    let state: VenueFeedState;
    if (unsupported) state = "search_unsupported";
    else if (degraded) state = "degraded";
    else if (base !== undefined) state = "ok";
    else if (query?.error != null) state = "error";
    else state = "loading";
    const fresh = state === "ok";
    const chainIndex = chainPlans.findIndex((plan) => plan.venue === venue);
    const chainQuery = chainIndex === -1 ? undefined : chainQueries[chainIndex];
    const session = chainIndex !== -1 && isChainReadVenue(venue) ? services.chainSession(venue) : null;
    const chainStatus = chainQuery === undefined ? "success" : session === null ? "off" : chainQuery.status;
    const name = venueName(venue);
    const rows = items.map((item) =>
      sourceSummary(item, {
        // Fields of rows just read are the venue's; a degraded venue's kept rows carry its state.
        state: fresh ? READ_OK : readState,
        name,
        nowMs,
        fresh,
        chain: degraded ? (chainQuery?.data?.get(item.ref.marketId.toLowerCase()) ?? chainNote(venue, readState, chainStatus)) : null,
      }),
    );
    return {
      venue,
      state,
      items: rows.map((row) => row.summary),
      rows,
      readState,
      refused: (base?.refused ?? 0) + extra.refused,
      truncated: base?.truncated === true,
      next: degraded ? null : extra.pages === 0 ? (base?.page.next ?? null) : extra.next,
      error: state === "error" ? error : null,
      prov: items[0]?.prov ?? null,
      pages: base === undefined ? 0 : 1 + extra.pages,
      loadingMore: extra.loading,
      moreError: extra.error,
      fetchedAtMs: query?.dataUpdatedAt ? query.dataUpdatedAt : null,
    };
  });

  return { feeds, loadMore, retry };
}
