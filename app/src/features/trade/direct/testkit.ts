// TEST SUPPORT (imported by test files only): a wallet that signs with a local test account, a scripted venue behind
// the direct path's http port, an in-memory Polygon node behind the real JSON-RPC port, and an in-memory Web Storage.
// Nothing here is a recording from a venue or a chain: every answer is written by the test that installs it. Pure code
// with no Node import (the boundary check treats every non-*.test file under app/src as bundled code).

import { createRpcPort, type RpcHttpResponse } from "@sdk/chain/rpc";
import type { Address, Hex, LocalAccount, TypedDataDefinition } from "viem";

import { BROWSER_DIRECT_ORIGINS } from "../../../../headers.config";
import { WalletError, type TransactionRequest, type WalletCapabilities, type WalletSigner } from "../../../core/signer";
import { createCredentialStore, type SessionStorageLike } from "./credentials";
import type { VenueHttp, VenueRequest, VenueResponse } from "./http";
import type { ChainSession, DirectDeps } from "./types";

// ---- the wallet ---------------------------------------------------------------------------------------------------------

export interface FakeSignerOptions {
  readonly capabilities?: Partial<WalletCapabilities>;
  // What the wallet does when asked to sign: sign with its account (default), refuse, or sign with another account.
  readonly signs?: "yes" | "reject" | { readonly with: LocalAccount };
  // The hash sendTransaction returns; when absent the wallet refuses transactions as unsupported.
  readonly txHash?: Hex;
  readonly name?: string;
}

export interface FakeSigner extends WalletSigner {
  readonly typedData: TypedDataDefinition[];
  readonly transactions: TransactionRequest[];
  readonly switches: number[];
}

export function fakeSigner(account: LocalAccount, options: FakeSignerOptions = {}): FakeSigner {
  const typedData: TypedDataDefinition[] = [];
  const transactions: TransactionRequest[] = [];
  const switches: number[] = [];
  let chain = 1;
  const capabilities: WalletCapabilities = { sendTransaction: options.txHash !== undefined, chains: "any", ...options.capabilities };
  return {
    kind: "injected",
    name: options.name ?? "Test wallet",
    address: account.address,
    capabilities,
    typedData,
    transactions,
    switches,
    chainId: async () => chain,
    switchChain: async (chainId) => {
      switches.push(chainId);
      chain = chainId;
    },
    signTypedData: async (data) => {
      typedData.push(data);
      const signs = options.signs ?? "yes";
      if (signs === "reject") throw new WalletError("rejected", "User rejected the request.");
      const signer = signs === "yes" ? account : signs.with;
      if (signer.signTypedData === undefined) throw new WalletError("unsupported", "no typed data");
      return signer.signTypedData(data as never);
    },
    signMessage: async (message) => {
      if (account.signMessage === undefined) throw new WalletError("unsupported", "no messages");
      return account.signMessage({ message });
    },
    sendTransaction: async (tx) => {
      if (options.txHash === undefined || !capabilities.sendTransaction) throw new WalletError("unsupported", "This wallet does not send transactions.");
      transactions.push(tx);
      return options.txHash;
    },
  };
}

// ---- the venue ----------------------------------------------------------------------------------------------------------

export type Route = (request: VenueRequest) => VenueResponse | Promise<VenueResponse>;

export interface FakeVenue {
  readonly http: VenueHttp;
  readonly requests: VenueRequest[];
  // "METHOD /path" (no query) -> handler. A request with no route answers 404.
  readonly routes: Map<string, Route>;
}

export function json(status: number, body: unknown): VenueResponse {
  return { status, text: JSON.stringify(body) };
}

export function fakeVenue(routes: Readonly<Record<string, Route>> = {}): FakeVenue {
  const table = new Map<string, Route>(Object.entries(routes));
  const requests: VenueRequest[] = [];
  return {
    requests,
    routes: table,
    http: async (request) => {
      requests.push(request);
      const url = new URL(request.url);
      const route = table.get(`${request.method} ${url.pathname}`);
      if (route === undefined) return json(404, { error: "no route in the test venue" });
      return route(request);
    },
  };
}

// ---- the chain ----------------------------------------------------------------------------------------------------------

export interface FakeNode {
  readonly code?: Readonly<Record<string, string>>;
  readonly slot0?: Readonly<Record<string, string>>;
  // eth_call: the answer for (to, data), or null for a revert.
  readonly call?: (to: string, data: Hex) => Hex | null;
  // Every request fails at the transport (the RPC cannot be reached).
  readonly down?: boolean;
}

export function fakeChain(node: FakeNode): ChainSession & { readonly methods: string[] } {
  const methods: string[] = [];
  const answer = (item: { id: number; method: string; params: unknown[] }) => {
    methods.push(item.method);
    const base = { jsonrpc: "2.0", id: item.id };
    const target = String((item.method === "eth_call" ? (item.params[0] as { to: string }).to : item.params[0]) ?? "").toLowerCase();
    if (item.method === "eth_getCode") return { ...base, result: node.code?.[target] ?? "0x" };
    if (item.method === "eth_getStorageAt") return { ...base, result: node.slot0?.[target] ?? `0x${"00".repeat(32)}` };
    if (item.method === "eth_call") {
      const result = node.call?.(target, (item.params[0] as { data: Hex }).data) ?? null;
      return result === null ? { ...base, error: { code: 3, message: "execution reverted" } } : { ...base, result };
    }
    return { ...base, error: { code: -32601, message: "no" } };
  };
  const post = async (_url: string, body: unknown): Promise<RpcHttpResponse> => {
    if (node.down === true) throw new TypeError("Failed to fetch");
    return { status: 200, body: Array.isArray(body) ? (body as never[]).map(answer) : answer(body as never) };
  };
  // The registry's Polygon RPC names the port; the fake post answers every request, so nothing is ever sent there.
  const row = BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === "rpc_polygon");
  const port = createRpcPort({ url: `${row?.origin ?? ""}/`, post, methods: ["eth_getCode", "eth_getStorageAt", "eth_call"] });
  // The pin guard is the Safe singleton's code check; the wallet reader's own tests cover it with the recorded code.
  return { port, guard: { check: async () => ({ ok: true }) }, methods };
}

// ---- storage and deps ---------------------------------------------------------------------------------------------------

export class MemoryStorage implements SessionStorageLike {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

export interface TestDeps extends DirectDeps {
  readonly clock: { now: number };
}

// Fixed values for the tests, labelled as such: the page clock, and a salt source that yields 0x0102...06.
export const TEST_NOW_MS = 1_792_755_563_000;

export function testDeps(venue: FakeVenue, chain: ChainSession | null, storage: SessionStorageLike | null = new MemoryStorage()): TestDeps {
  const clock = { now: TEST_NOW_MS };
  return {
    clock,
    http: venue.http,
    chain: () => chain,
    store: createCredentialStore(storage),
    nowMs: () => clock.now,
    randomBytes: (length) => Uint8Array.from({ length }, (_, index) => index + 1),
  };
}

export function lower(address: Address): string {
  return address.toLowerCase();
}
