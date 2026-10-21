// What the Markets screens need from the outside world, in one injectable record (fixed seeds, injected clocks,
// no network in tests). The real record is built once per page from core/env.ts; a test provides its own.

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { openStores } from "../../core/bindings";
import { createAdapterDeps, type Env } from "../../core/env";
import { pageToken } from "../../core/page-token";
import type { MarketSummary, VenueId } from "../../core/ports";
import { loadVenueSwitches } from "../../core/settings";
import { DEFAULT_SWITCHES, type VenueSwitches } from "../../core/venue-policy";
import { useAppMode, type AppMode } from "../../ui";
import { createExplorerAdapters, type ExplorerAdapter } from "./adapters";

// The list rows seen on this page, kept in memory so the market page can show the venue's display price and open a
// market by its full reference (Polymarket needs its slug) after a click. Dropped with the page; holds only what the
// venue already published, never anything the user typed.
export class MarketMemory {
  readonly #rows = new Map<string, MarketSummary>();
  readonly #max: number;

  constructor(max = 5000) {
    this.#max = max;
  }

  static keyOf(venue: VenueId, marketId: string): string {
    return `${venue}\u0000${marketId.toLowerCase()}`;
  }

  put(summary: MarketSummary): void {
    const key = MarketMemory.keyOf(summary.ref.venue, summary.ref.marketId);
    this.#rows.delete(key);
    this.#rows.set(key, summary);
    if (this.#rows.size > this.#max) {
      const oldest = this.#rows.keys().next();
      if (oldest.done !== true) this.#rows.delete(oldest.value);
    }
  }

  get(venue: VenueId, marketId: string): MarketSummary | undefined {
    return this.#rows.get(MarketMemory.keyOf(venue, marketId));
  }

  get size(): number {
    return this.#rows.size;
  }

  // Every row seen in this visit, oldest first. For lookups over ids (link candidates); never for display order.
  rows(): readonly MarketSummary[] {
    return [...this.#rows.values()];
  }
}

export interface ExplorerServices {
  // Part of every query key, so two service records never share a cache entry.
  readonly id: string;
  readonly mode: AppMode;
  readonly nowMs: () => number;
  readonly adapters: Readonly<Partial<Record<VenueId, ExplorerAdapter>>>;
  readonly loadSwitches: () => Promise<VenueSwitches>;
  readonly memory: MarketMemory;
  // Poll books while the tab is visible (cache class book_foreground). Tests turn it off.
  readonly pollBooks: boolean;
}

let counter = 0;

export interface ExplorerServicesOptions {
  readonly mode: AppMode;
  // The Cockpit's ui token, read at call time. The session client supplies it; null before pairing.
  readonly getToken?: () => string | null;
  // The browser's fetch, timers and clock. Tests pass fakes; the page passes nothing.
  readonly env?: Env;
}

// The Cockpit session client registers where the ui token lives. Until it does, the Cockpit build has no token and
// every read reports "not supported" (the fetch port refuses to send an unauthenticated request).
let tokenSource: () => string | null = pageToken;
export function setExplorerTokenSource(source: () => string | null): void {
  tokenSource = source;
}

export function createExplorerServices(options: ExplorerServicesOptions): ExplorerServices {
  const deps = createAdapterDeps({ mode: options.mode, getToken: options.getToken ?? (() => tokenSource()), ...(options.env === undefined ? {} : { env: options.env }) });
  let switches: Promise<VenueSwitches> | null = null;
  counter += 1;
  return {
    id: `live-${counter}`,
    mode: options.mode,
    nowMs: deps.nowMs,
    adapters: createExplorerAdapters(deps, options.mode),
    // IndexedDB holds only venue ids, booleans and a clause version. An unreadable store means the defaults.
    loadSwitches: () => {
      switches ??= openStores()
        .then((stores) => loadVenueSwitches(stores.settings))
        .catch(() => DEFAULT_SWITCHES);
      return switches;
    },
    memory: new MarketMemory(),
    pollBooks: true,
  };
}

const ServicesContext = createContext<ExplorerServices | null>(null);

export function ExplorerServicesProvider({ services, children }: { readonly services: ExplorerServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

// One real record per page and mode, created on first use so importing this module touches nothing.
const live = new Map<AppMode, ExplorerServices>();

export function useExplorerServices(): ExplorerServices {
  const injected = useContext(ServicesContext);
  const mode = useAppMode();
  return useMemo(() => {
    if (injected !== null) return injected;
    let services = live.get(mode);
    if (services === undefined) {
      services = createExplorerServices({ mode });
      live.set(mode, services);
    }
    return services;
  }, [injected, mode]);
}

