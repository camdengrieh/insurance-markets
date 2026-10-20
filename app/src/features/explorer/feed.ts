// The fan-out: one independent query per enabled venue, merged by the screen. One venue failing leaves the others
// rendering (the M2-6 principle, applied to the explorer). A switched-off or Cockpit-only venue is never queried
// (`enabled: false`), so nothing is requested from it.

import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { ttlFor } from "../../core/cache";
import { adapterErrorOfFetch, isNeedsCockpit } from "../../core/fetch";
import type { AdapterError, MarketSummary, Prov, Status, VenueId } from "../../core/ports";
import type { ExplorerAdapter, ListOutcome } from "./adapters";
import type { ExplorerServices } from "./services";

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

export type VenueFeedState = "loading" | "ok" | "error" | "search_unsupported";

export interface VenueFeed {
  readonly venue: VenueId;
  readonly state: VenueFeedState;
  readonly items: readonly MarketSummary[];
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

// Call with a stable `selection`-derived key. The caller re-mounts the component that owns this hook when the
// selection changes (the extra pages belong to one selection).
export function useMarketFeed(services: ExplorerServices, selection: FeedSelection): MarketFeed {
  const venues = selection.venues.filter((venue) => services.adapters[venue] !== undefined);
  const text = selection.query.trim();
  const statuses = statusesOf(selection.status);

  const queries = useQueries({
    queries: venues.map((venue) => {
      const entry = services.adapters[venue] as ExplorerAdapter;
      const searchable = text === "" || entry.adapter.caps.search;
      return {
        queryKey: ["explorer", "list", services.id, venue, selection.status, text] as const,
        enabled: searchable,
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

  const feeds: VenueFeed[] = venues.map((venue, index) => {
    const query = queries[index];
    const entry = services.adapters[venue] as ExplorerAdapter;
    const extra = extras[venue] ?? NO_EXTRA;
    const base = query?.data;
    const baseItems = base === undefined ? [] : ownRows(venue, base);
    const items = [...baseItems, ...extra.items];
    const unsupported = text !== "" && !entry.adapter.caps.search;
    let state: VenueFeedState;
    if (unsupported) state = "search_unsupported";
    else if (base !== undefined) state = "ok";
    else if (query?.error != null) state = "error";
    else state = "loading";
    const error = query?.error instanceof FeedError ? query.error.classified : query?.error == null ? null : classifyError(query.error);
    return {
      venue,
      state,
      items,
      refused: (base?.refused ?? 0) + extra.refused,
      truncated: base?.truncated === true,
      next: extra.pages === 0 ? (base?.page.next ?? null) : extra.next,
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
