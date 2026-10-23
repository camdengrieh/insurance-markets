// Test support for the XO direct-execution tests: a wallet signer over a key made up for the tests, a fake relay that
// records every request and answers as XO would, and an in-memory Web Storage. Imported by *.test.ts(x) only; it
// contacts nothing.

import { getAddress, type Address, type Hex, type TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { WalletError, type WalletCapabilities, type WalletSigner } from "../../../../core/signer";
import type { CredentialStorage } from "./credentials";
import type { RelayFetch } from "./relay";

// A key that exists only in these tests.
export const TEST_KEY: Hex = `0x${"4c".repeat(32)}`;
// A reserved .invalid host: never resolvable, and every request to it goes to fakeRelay below.
const RELAY_HOST = "relay.test.invalid";
export const RELAY_ORIGIN = `https://${RELAY_HOST}`;
export const XO_NOW_S = 1_792_756_800;
export const TOKEN_ID = "52114319501245915516055106046884209969926127482827954674443846427813813222426";

export interface SignerCall {
  readonly method: "chainId" | "switchChain" | "signTypedData" | "signMessage" | "sendTransaction";
  readonly arg?: unknown;
}

export interface FakeSignerOptions {
  readonly kind?: "injected" | "walletconnect";
  readonly chains?: WalletCapabilities["chains"];
  readonly startChain?: number;
  readonly switchError?: WalletError;
  readonly signError?: WalletError;
  // Sign with another key than the one the address names (a wallet answering for the wrong account).
  readonly signWith?: Hex;
}

export interface FakeSigner extends WalletSigner {
  readonly calls: SignerCall[];
}

export function fakeSigner(options: FakeSignerOptions = {}): FakeSigner {
  const account = privateKeyToAccount(TEST_KEY);
  const signing = options.signWith === undefined ? account : privateKeyToAccount(options.signWith);
  const calls: SignerCall[] = [];
  let chain = options.startChain ?? 1;
  return {
    kind: options.kind ?? "injected",
    name: "Test wallet",
    address: getAddress(account.address),
    capabilities: { sendTransaction: options.kind !== "walletconnect", chains: options.chains ?? "any" },
    calls,
    async chainId() {
      calls.push({ method: "chainId" });
      return chain;
    },
    async switchChain(chainId: number) {
      calls.push({ method: "switchChain", arg: chainId });
      if (options.switchError !== undefined) throw options.switchError;
      chain = chainId;
    },
    async signTypedData(data: TypedDataDefinition) {
      calls.push({ method: "signTypedData", arg: data });
      if (options.signError !== undefined) throw options.signError;
      const domainChain = (data.domain as { chainId?: number } | undefined)?.chainId;
      if (domainChain !== chain) throw new WalletError("failed", "the domain chain differs from the active chain");
      return signing.signTypedData(data as Parameters<typeof signing.signTypedData>[0]);
    },
    async signMessage(message: string) {
      calls.push({ method: "signMessage", arg: message });
      return signing.signMessage({ message });
    },
    async sendTransaction() {
      calls.push({ method: "sendTransaction" });
      throw new WalletError("unsupported", "not in these tests");
    },
  };
}

export interface RelayCall {
  readonly url: string;
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
  readonly init: RequestInit;
}

export interface FakeReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  // "relay": the relay's own refusal (no x-xo-relay: upstream).
  readonly from?: "xo" | "relay";
}

export type Route = (call: RelayCall) => FakeReply | Promise<FakeReply> | undefined;

// A fake of the markets API's relay. `routes` answer by "METHOD /path"; /time answers XO_NOW_S unless overridden.
export function fakeRelay(routes: Readonly<Record<string, Route>> = {}): { readonly fetch: RelayFetch; readonly calls: RelayCall[] } {
  const calls: RelayCall[] = [];
  const fetchImpl: RelayFetch = async (url, init) => {
    const parsed = new URL(url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const path = parsed.pathname.replace(/^\/v1\/relay\/xo\/clob/, "");
    const call: RelayCall = { url, path, method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : null, init };
    calls.push(call);
    const route = routes[`${call.method} ${path.startsWith("/orders/") ? "/orders/:hash" : path}`];
    const reply = (await route?.(call)) ?? (path === "/time" ? { text: String(XO_NOW_S) } : { status: 404, body: { error: "not found" } });
    const text = reply.text ?? JSON.stringify(reply.body ?? {});
    return new Response(text, { status: reply.status ?? 200, headers: { "content-type": reply.text === undefined ? "application/json" : "text/plain", ...(reply.from === "relay" ? { "x-xo-relay": "refused" } : { "x-xo-relay": "upstream" }) } });
  };
  return { fetch: fetchImpl, calls };
}

export function memoryStorage(): CredentialStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

// A fixed random source for salts (non-zero).
export function fixedRandom(bytes: number): Uint8Array {
  return Uint8Array.from({ length: bytes }, (_, index) => index + 1);
}

export const CREDENTIAL = Object.freeze({ apiKey: "11111111-2222-3333-4444-555555555555", secret: "c2VjcmV0LWZvci10ZXN0cy1vbmx5LTEyMzQ1Ng==", passphrase: "test-passphrase-only" });

export function ownerAddress(): Address {
  return getAddress(privateKeyToAccount(TEST_KEY).address);
}
