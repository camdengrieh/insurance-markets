import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createPinGuard } from "@sdk/chain/pins";
import { POLYGON_CHAIN_ID } from "@sdk/chain/polymarket/constants";
import { createRpcPort, rpcPostFromFetch } from "@sdk/chain/rpc";

import { BROWSER_DIRECT_ORIGINS } from "../../../../headers.config";
import { createAdapterDeps } from "../../../core/env";
import { createCredentialStore, type SessionStorageLike } from "./credentials";
import { createVenueHttp, type BrowserFetch } from "./http";
import { DIRECT_EXECUTORS, type DirectVenue } from "./index";
import type { ChainSession, DirectDeps } from "./types";

// Everything the direct path takes from the browser, in one record, so a test injects a fake venue, a fake chain, a
// fake clock and an in-memory store. The page's own record is made on first use: nothing here runs at import.
//
//   http      the browser's fetch, limited to the browser-direct venue hosts the standalone CSP lists (never an RPC,
//             never a daemon-only host); each executor names its own origin within that list;
//   chain     the public JSON-RPC the CSP lists for the chain, through the page's guarded read port (eth_call,
//             eth_getCode and eth_getStorageAt only), with a pin guard;
//   store     this tab's sessionStorage (credentials.ts), never localStorage;
//   random    the browser's cryptographic random source.

const CHAIN_METHODS = ["eth_call", "eth_getCode", "eth_getStorageAt"] as const;

export interface DirectServices {
  readonly deps: DirectDeps;
  executor<V extends DirectVenue>(venue: V): ReturnType<(typeof DIRECT_EXECUTORS)[V]>;
}

export function createDirectServices(deps: DirectDeps): DirectServices {
  const made = new Map<DirectVenue, unknown>();
  return {
    deps,
    executor<V extends DirectVenue>(venue: V) {
      let executor = made.get(venue) as ReturnType<(typeof DIRECT_EXECUTORS)[V]> | undefined;
      if (executor === undefined) {
        executor = DIRECT_EXECUTORS[venue](deps) as ReturnType<(typeof DIRECT_EXECUTORS)[V]>;
        made.set(venue, executor);
      }
      return executor;
    },
  };
}

function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function createBrowserDirectDeps(): DirectDeps {
  const reads = createAdapterDeps({ mode: "standalone" });
  const sessions = new Map<number, ChainSession | null>();
  const browserFetch: BrowserFetch = (input, init) => globalThis.fetch(input, init);
  return {
    http: createVenueHttp({ fetch: browserFetch, origins: BROWSER_DIRECT_ORIGINS.filter((entry) => entry.transport === "T0").map((entry) => entry.origin) }),
    chain: (chainId) => {
      if (sessions.has(chainId)) return sessions.get(chainId) ?? null;
      const service = chainId === POLYGON_CHAIN_ID ? "rpc_polygon" : null;
      const row = service === null ? undefined : BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === service && entry.transport === "T0-RPC");
      let session: ChainSession | null = null;
      if (row !== undefined) {
        const port = createRpcPort({ url: `${row.origin}/`, post: rpcPostFromFetch(reads.fetch, { nowMs: reads.nowMs }), methods: CHAIN_METHODS });
        session = { port, guard: createPinGuard(port) };
      }
      sessions.set(chainId, session);
      return session;
    },
    store: createCredentialStore(sessionStorageOrNull()),
    nowMs: () => Date.now(),
    randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
  };
}

const ServicesContext = createContext<DirectServices | null>(null);

export function DirectServicesProvider({ services, children }: { readonly services: DirectServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

let page: DirectServices | null = null;

export function useDirectServices(): DirectServices {
  const injected = useContext(ServicesContext);
  return useMemo(() => {
    if (injected !== null) return injected;
    page ??= createDirectServices(createBrowserDirectDeps());
    return page;
  }, [injected]);
}
