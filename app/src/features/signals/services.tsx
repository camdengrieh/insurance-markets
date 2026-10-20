// What the Signals screen needs from the outside world, in one injectable record (fixed seeds, injected clocks, no
// network in tests). The real record is built once per page and build mode; a test provides its own.

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { openStores, type RecordStore } from "../../core/bindings";
import { createAdapterDeps, type Env } from "../../core/env";
import { pageToken } from "../../core/page-token";
import type { MarketRef, VenueId } from "../../core/ports";
import { useAppMode, type AppMode } from "../../ui";
import { createExplorerAdapters, type ExplorerAdapter } from "../explorer";
import { loadBundledLinks, type LinkLoad } from "./links/dataset";
import type { LinkLeg } from "./links/schema";
import type { LegObservation } from "./links/verify";
import { SignalsSession } from "./session";

// Reads one leg of a link through its own venue reader: the rules hash and the close time as the venue says them now.
export type LegReader = (leg: LinkLeg) => Promise<LegObservation>;

export interface SignalsServices {
  // Part of every key, so two service records never share state.
  readonly id: string;
  readonly mode: AppMode;
  readonly nowMs: () => number;
  readonly session: SignalsSession;
  readonly loadLinks: () => Promise<LinkLoad>;
  readonly readLeg: LegReader;
}

export function legReaderOver(adapters: Readonly<Partial<Record<VenueId, Pick<ExplorerAdapter, "detail">>>>): LegReader {
  return async (leg) => {
    const reader = adapters[leg.venue];
    if (reader === undefined) return { state: "unavailable" };
    const ref: MarketRef = { venue: leg.venue, marketId: leg.nativeId, native: {} };
    try {
      const { market } = await reader.detail(ref);
      const hash = market.rules.sha256;
      return { state: "read", rulesSha256: hash === "" ? null : hash, closesAtUtc: market.timesUtc.closesAt ?? null, status: market.status };
    } catch {
      // Any failure is "could not read", never a match and never a mismatch.
      return { state: "unavailable" };
    }
  };
}

let counter = 0;

export interface SignalsServicesOptions {
  readonly mode: AppMode;
  readonly getToken?: () => string | null;
  readonly env?: Env;
}

// The Cockpit session client registers where the ui token lives; until it does, the Cockpit build has no token and
// every read reports that it is not allowed.
let tokenSource: () => string | null = pageToken;
export function setSignalsTokenSource(source: () => string | null): void {
  tokenSource = source;
}

export function createSignalsServices(options: SignalsServicesOptions): SignalsServices {
  const built = createAdapterDeps({ mode: options.mode, getToken: options.getToken ?? (() => tokenSource()), ...(options.env === undefined ? {} : { env: options.env }) });
  const deps = { fetch: built.fetch, nowMs: built.nowMs };
  let stores: Promise<RecordStore> | null = null;
  const settings = (): Promise<RecordStore> => {
    stores ??= openStores().then((opened) => opened.settings);
    return stores;
  };
  counter += 1;
  return {
    id: `live-${counter}`,
    mode: options.mode,
    nowMs: deps.nowMs,
    session: new SignalsSession({ mode: options.mode, deps, settings }),
    loadLinks: () => loadBundledLinks(),
    readLeg: legReaderOver(createExplorerAdapters(deps, options.mode)),
  };
}

const ServicesContext = createContext<SignalsServices | null>(null);

export function SignalsServicesProvider({ services, children }: { readonly services: SignalsServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

const live = new Map<AppMode, SignalsServices>();

export function useSignalsServices(): SignalsServices {
  const injected = useContext(ServicesContext);
  const mode = useAppMode();
  return useMemo(() => {
    if (injected !== null) return injected;
    let services = live.get(mode);
    if (services === undefined) {
      services = createSignalsServices({ mode });
      live.set(mode, services);
    }
    return services;
  }, [injected, mode]);
}
