import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createPinGuard } from "@sdk/chain/pins";
import { BASE_CHAIN_ID } from "@sdk/chain/limitless/constants";
import { POLYGON_CHAIN_ID } from "@sdk/chain/polymarket/constants";
import { createRpcPort, rpcPostFromFetch } from "@sdk/chain/rpc";

import { BROWSER_DIRECT_ORIGINS } from "../../../../headers.config";
import { createAdapterDeps } from "../../../core/env";
import { MARKETS_API_ORIGIN } from "../../../core/markets-api";
import { registerVenueActivation, type VenueActivation } from "../../account/activation";
import { registerBalanceSource, type BalanceSource } from "../../account/balances";
import { createCredentialStore, type SessionStorageLike } from "./credentials";
import { createVenueHttp, type BrowserFetch } from "./http";
import { createVenueKit, type VenueKit } from "./kit";
import type { ChainSession, DirectDeps } from "./types";

// Everything the direct path takes from the browser, in one record, so a test injects a fake venue, a fake chain, a
// fake clock and an in-memory store. The page's own record is made on first use: nothing here runs at import.
//
//   http      the browser's fetch, limited to the browser-direct venue hosts the standalone CSP lists (never an RPC,
//             never a daemon-only host); each executor names its own origin within that list (our markets API carries
//             the relays to XO, Limitless and Polymarket's relayer and bridge);
//   chain     the public JSON-RPC the CSP lists for the chain (Polygon for Polymarket, Base for Limitless), through the
//             page's guarded read port (eth_call, eth_getCode and eth_getStorageAt only), with a pin guard;
//   store     this tab's sessionStorage (credentials.ts), never localStorage;
//   random    the browser's cryptographic random source.

const CHAIN_METHODS = ["eth_call", "eth_getCode", "eth_getStorageAt"] as const;

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
      const service = chainId === POLYGON_CHAIN_ID ? "rpc_polygon" : chainId === BASE_CHAIN_ID ? "rpc_base" : null;
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

// The page's kit: the browser's ports, our markets API and this tab's storage.
export function createBrowserVenueKit(): VenueKit {
  const reads = createAdapterDeps({ mode: "standalone" });
  return createVenueKit({
    direct: createBrowserDirectDeps(),
    adapter: { fetch: reads.fetch, nowMs: reads.nowMs },
    relayOrigin: MARKETS_API_ORIGIN,
    xoFetch: (url, init) => globalThis.fetch(url, init),
    xoStorage: sessionStorageOrNull(),
  });
}

let page: VenueKit | null = null;

function pageKit(): VenueKit {
  page ??= createBrowserVenueKit();
  return page;
}

// The venue activations the trading account runs, in order (XO, Polymarket, Limitless). The account feature registers
// these; a test passes its own kit.
export function venueActivations(kit: VenueKit = pageKit()): readonly VenueActivation[] {
  return kit.activations;
}

// What each venue holds for the account (the Polymarket wallet's pUSD, K(E)'s USDC.e), for the one balance.
export function venueBalanceSources(kit: VenueKit = pageKit()): readonly BalanceSource[] {
  return kit.balances;
}

// Registers the three venues' activations (XO, Polymarket, Limitless, in that order) and their balance sources with the
// trading account, once (main.tsx calls it in the hosted build). Returns a function that removes them again.
export function registerVenues(kit: VenueKit = pageKit()): () => void {
  const removers = [...venueActivations(kit).map(registerVenueActivation), ...venueBalanceSources(kit).map(registerBalanceSource)];
  return () => {
    for (const remove of removers) remove();
  };
}

const KitContext = createContext<VenueKit | null>(null);

export function VenueKitProvider({ kit, children }: { readonly kit: VenueKit; readonly children: ReactNode }) {
  return <KitContext.Provider value={kit}>{children}</KitContext.Provider>;
}

export function useVenueKit(): VenueKit {
  const injected = useContext(KitContext);
  return useMemo(() => injected ?? pageKit(), [injected]);
}
