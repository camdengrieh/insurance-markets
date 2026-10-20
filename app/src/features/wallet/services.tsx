import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { NO_FACTS, type CapabilityFacts } from "../../core/capabilities";
import { BindingsStore, openStores, type OpenedStores } from "../../core/bindings";
import { createAdapterDeps } from "../../core/env";
import { pageToken } from "../../core/page-token";
import type { AdapterDeps } from "../../core/ports";
import { loadVenueSwitches } from "../../core/settings";
import { DEFAULT_SWITCHES, type VenueSwitches } from "../../core/venue-policy";
import { appModeFromEnv, type AppMode } from "../../ui/context";

// What the wallet and portfolio screens need from the outside: the injected fetch and clock, the user's own
// browser storage, and the recorded capability facts. A screen never touches a global; tests pass fakes.

export interface WalletServices {
  readonly mode: AppMode;
  readonly deps: AdapterDeps;
  // Memoised: the first call opens IndexedDB (or the in-memory fallback), later calls return the same stores.
  readonly stores: () => Promise<OpenedStores>;
  // The recorded live-test facts. Only an exact "yes" counts as proven; the default is all unknown, so every
  // capability shows "unproven" until the Cockpit's status feed supplies a record.
  readonly facts: CapabilityFacts;
}

// The Cockpit's ui token comes from the session client (pairing is not part of these screens). Until that client
// provides one, a Cockpit build has no token, its reads fail as "unauthorized", and the screens say so in words.
export type TokenSource = () => string | null;

const created = new Map<AppMode, WalletServices>();

export function createDefaultServices(mode: AppMode, getToken: TokenSource = pageToken): WalletServices {
  const built = createAdapterDeps({ mode, getToken });
  let opened: Promise<OpenedStores> | undefined;
  return {
    mode,
    deps: { fetch: built.fetch, nowMs: built.nowMs },
    stores: () => (opened ??= openStores()),
    facts: NO_FACTS,
  };
}

function defaultServices(mode: AppMode): WalletServices {
  let services = created.get(mode);
  if (services === undefined) {
    services = createDefaultServices(mode);
    created.set(mode, services);
  }
  return services;
}

const ServicesContext = createContext<WalletServices | null>(null);

export function WalletServicesProvider({ services, children }: { readonly services: WalletServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

// The provided services, or the real ones for this build.
export function useWalletServices(): WalletServices {
  const provided = useContext(ServicesContext);
  return provided ?? defaultServices(appModeFromEnv());
}

// ---- the user's saved addresses and switches -----------------------------------------------------------------------

export interface BindingsState {
  readonly status: "loading" | "ready";
  readonly store: BindingsStore | null;
  readonly stores: OpenedStores | null;
  readonly bindings: Awaited<ReturnType<BindingsStore["list"]>>;
  readonly switches: VenueSwitches;
  readonly persistence: "indexeddb" | "memory" | null;
  // Reload the list after a change.
  readonly refresh: () => Promise<void>;
}

export function useBindingsState(): BindingsState {
  const services = useWalletServices();
  const [stores, setStores] = useState<OpenedStores | null>(null);
  const [bindings, setBindings] = useState<BindingsState["bindings"]>([]);
  const [switches, setSwitches] = useState<VenueSwitches>(DEFAULT_SWITCHES);
  const [status, setStatus] = useState<BindingsState["status"]>("loading");
  const store = useMemo(() => (stores === null ? null : new BindingsStore(stores.bindings)), [stores]);

  useEffect(() => {
    let live = true;
    void services.stores().then(async (opened) => {
      const loaded = await loadVenueSwitches(opened.settings);
      const list = await new BindingsStore(opened.bindings).list();
      if (!live) return;
      setStores(opened);
      setSwitches(loaded);
      setBindings(list);
      setStatus("ready");
    });
    return () => {
      live = false;
    };
  }, [services]);

  const refresh = useMemo(
    () => async (): Promise<void> => {
      if (store === null) return;
      setBindings(await store.list());
    },
    [store],
  );

  return { status, store, stores, bindings, switches, persistence: stores?.persistence ?? null, refresh };
}
