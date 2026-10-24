// Everything the trading account takes from the browser, in one record, so a test injects fakes for the store, the
// passkey, the backup server, the chain reads and the sponsor. The page's own record is made on first use: nothing here
// runs at import.
//
// Network: the public RPC hosts and our markets API, both already in the standalone build's connect-src
// (sdk/venues/origins.ts). The account adds no host. The Cockpit build's CSP reaches only 'self', so the account is
// offered in the standalone (hosted) build only.

import { http, type PrivateKeyAccount, type Transport } from "viem";

import { chainById } from "../../core/account";
import { createAdapterDeps } from "../../core/env";
import { MARKETS_API_ORIGIN } from "../../core/markets-api";
import type { AppMode } from "../../ui/context";
import { addableChain } from "../wallet/connect/chains";
import { rpcUrlOf } from "../wallet/rpc";
import { createBackupClient, type BackupClient, type BackupFetch } from "./backup";
import { browserWebAuthnHost, createPasskeyPort, type PasskeyPort } from "./passkey";
import { createChainCalls, type ChainCalls } from "./reads";
import { createSponsor, type Sponsor } from "./sponsor";
import { openAccountStore, type AccountStore } from "./store";

export interface AccountServices {
  // Why the account is not offered in this build, in words; null when it is.
  readonly unavailable: string | null;
  openStore(): Promise<AccountStore>;
  readonly passkey: PasskeyPort;
  readonly backup: BackupClient;
  readonly calls: ChainCalls;
  sponsorFor(owner: PrivateKeyAccount): Sponsor;
  readonly subtle: SubtleCrypto;
  readonly randomBytes: (length: number) => Uint8Array;
  readonly nowMs: () => number;
}

export const COCKPIT_UNAVAILABLE = "The trading account lives on the hosted page. This Cockpit build only reaches its own daemon, so it cannot reach the gas sponsor or the chains.";
export const NO_API_UNAVAILABLE = "This build has no account server, so the trading account is not available here.";

export function accountUnavailable(mode: AppMode, origin: string | null): string | null {
  if (mode !== "standalone") return COCKPIT_UNAVAILABLE;
  if (origin === null) return NO_API_UNAVAILABLE;
  return null;
}

// The browser's fetch with the page's rules for any request it makes: no cookies, no referrer, no cache.
const pageFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  globalThis.fetch(input, { ...init, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });

export function paymasterUrl(origin: string, chainId: number): string {
  return `${origin}/v1/paymaster/${chainId}`;
}

function rpcTransport(chainId: number): Transport | null {
  const chain = chainById(chainId);
  const url = chain === undefined ? null : rpcUrlOf(chain);
  return url === null ? null : http(url, { fetchFn: pageFetch, retryCount: 1, timeout: 20_000 });
}

function paymasterTransport(origin: string | null, chainId: number): Transport | null {
  // Writes are never retried by the transport: a user operation sent twice is answered by its hash, but the page decides.
  return origin === null ? null : http(paymasterUrl(origin, chainId), { fetchFn: pageFetch, retryCount: 0, timeout: 30_000 });
}

export function createBrowserAccountServices(mode: AppMode, origin: string | null = MARKETS_API_ORIGIN): AccountServices {
  const reads = createAdapterDeps({ mode: "standalone" });
  const backupFetch: BackupFetch = (url, init) => pageFetch(url, init);
  return {
    unavailable: accountUnavailable(mode, origin),
    openStore: openAccountStore,
    passkey: createPasskeyPort(browserWebAuthnHost()),
    backup: createBackupClient({ origin, fetch: backupFetch, nowMs: () => Date.now() }),
    calls: createChainCalls(reads),
    sponsorFor: (owner) => createSponsor({ owner, chain: addableChain, rpcTransport, paymasterTransport: (chainId) => paymasterTransport(origin, chainId) }),
    subtle: globalThis.crypto.subtle,
    randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
    nowMs: () => Date.now(),
  };
}
