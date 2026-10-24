import { request } from "node:http";

import { encodeFunctionData, keccak256, numberToHex, parseAbi, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { SqliteAccountStore, type AccountStore } from "../../api/account-store.js";
import { proofMessage, sha256Hex } from "../../api/proof.js";
import { SIMPLE_7702_ABI, SIMPLE_7702_IMPLEMENTATION } from "../../api/sponsor-policy.js";
import { XO_RELAY_DAPP_ORIGIN } from "../../api/xo-relay.js";
import { absentVenue, Clock, startHarness, testConfig, type Harness } from "./helpers.js";

// Test support for the unified-account routes (paymaster, Polymarket relay and bridge route, Limitless partner relay,
// account backup): one fake upstream that records every request and answers by URL, a harness with a clock, a raw HTTP
// client (so headers and bodies go exactly as written), test keys, and the ownership proof (api/proof.ts) a browser makes.
// Nothing here talks to a real service; every credential below is a test value made up for these tests.

export const NOW = Date.parse("2026-10-24T12:00:00Z");
export const DAPP = { origin: XO_RELAY_DAPP_ORIGIN };

// Deterministic test keys (keccak of a label): never funded, never used anywhere else.
export function testKey(label: string): PrivateKeyAccount {
  return privateKeyToAccount(keccak256(toHex(`insurance-markets test key: ${label}`)));
}

export interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Buffer | null;
}

export interface FakeAnswer {
  readonly status?: number;
  readonly body?: string;
  readonly contentType?: string;
  readonly throws?: boolean;
}

export interface FakeUpstream {
  readonly fetch: typeof fetch;
  readonly seen: Seen[];
}

export function fakeUpstream(answer: (seen: Seen) => FakeAnswer | Promise<FakeAnswer> = () => ({ body: "{}" })): FakeUpstream {
  const seen: Seen[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const raw = init?.body;
    const body = raw === undefined || raw === null ? null : typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw as Uint8Array);
    const entry: Seen = { url: String(input), method: init?.method ?? "GET", headers, body };
    seen.push(entry);
    const out = await answer(entry);
    if (out.throws === true) throw new Error("unreachable");
    return new Response(out.body ?? "{}", { status: out.status ?? 200, headers: { "content-type": out.contentType ?? "application/json; charset=utf-8" } });
  };
  return { fetch: impl as typeof fetch, seen };
}

export interface UnifiedHarness {
  readonly h: Harness;
  readonly clock: Clock;
  readonly store: AccountStore;
  readonly logs: string[];
}

export async function unifiedHarness(env: Record<string, string>, upstream: FakeUpstream, options: { readonly timeoutMs?: number } = {}): Promise<UnifiedHarness> {
  const clock = new Clock(NOW);
  const store = SqliteAccountStore.open(":memory:");
  const logs: string[] = [];
  const h = await startHarness({
    config: testConfig(env),
    fetchFor: (venue) => absentVenue(venue),
    clock,
    relayFetch: upstream.fetch,
    accountStore: store,
    log: (line) => logs.push(line),
    ...(options.timeoutMs === undefined ? {} : { relayUpstreamTimeoutMs: options.timeoutMs }),
  });
  return { h, clock, store, logs };
}

export async function closeHarness(u: UnifiedHarness): Promise<void> {
  await u.h.close();
  u.store.close();
}

export interface RawAnswer {
  readonly status: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly text: string;
}

export function raw(origin: string, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<RawAnswer> {
  const url = new URL(origin);
  const framed = body === undefined ? headers : { ...headers, "content-length": String(Buffer.byteLength(body)) };
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, method, path, headers: framed }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export function postJson(origin: string, path: string, value: unknown, headers: Record<string, string> = {}): Promise<RawAnswer> {
  return raw(origin, "POST", path, { ...DAPP, "content-type": "application/json", ...headers }, typeof value === "string" ? value : JSON.stringify(value));
}

export const codeOf = (text: string): unknown => (JSON.parse(text) as { error?: { code?: unknown } }).error?.code;

// The x-im-proof header value a browser makes for one request (design section 3.3, as the browser account sends it:
// the sha256 of the exact body, the empty string's sha256 for none).
export async function proof(key: PrivateKeyAccount, method: string, pathWithQuery: string, body: string, seconds: number): Promise<string> {
  const signature: Hex = await key.signMessage({ message: proofMessage(method, pathWithQuery, seconds, sha256Hex(body)) });
  return `${key.address}.${seconds}.${signature}`;
}

export const nowSeconds = (clock: Clock): number => Math.floor(clock.now / 1000);

// ---- user operations as viem's Simple7702 account and bundler client send them ----------------------------------------

const TOKEN_ABI = parseAbi(["function approve(address spender, uint256 amount)", "function transfer(address to, uint256 amount)"]);
export const approveData = (spender: Address): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "approve", args: [spender, 10n ** 30n] });
export const transferData = (to: Address, amount = 1_000_000n): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "transfer", args: [to, amount] });

export function executeData(calls: ReadonlyArray<{ readonly to: Address; readonly data: Hex }>): Hex {
  if (calls.length === 1) {
    const [call] = calls as [{ to: Address; data: Hex }];
    return encodeFunctionData({ abi: SIMPLE_7702_ABI, functionName: "execute", args: [call.to, 0n, call.data] });
  }
  return encodeFunctionData({ abi: SIMPLE_7702_ABI, functionName: "executeBatch", args: [calls.map((call) => ({ target: call.to, value: 0n, data: call.data }))] });
}

export function userOperation(sender: Address, callData: Hex, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sender,
    nonce: "0x0",
    factory: "0x7702",
    factoryData: "0x",
    callData,
    callGasLimit: "0x0",
    verificationGasLimit: "0x0",
    preVerificationGas: "0x0",
    maxFeePerGas: "0x3b9aca00",
    maxPriorityFeePerGas: "0x3b9aca00",
    signature: `0x${"ff".repeat(32)}${"00".repeat(32)}1c`,
    ...extra,
  };
}

// The eip7702Auth field as viem's formatUserOperationRequest writes it, signed by `key`.
export async function authorizationFor(key: PrivateKeyAccount, chainId: number, address: Address = SIMPLE_7702_IMPLEMENTATION): Promise<Record<string, string>> {
  const signed = await key.signAuthorization({ address, chainId, nonce: 0 });
  return {
    address: signed.address,
    chainId: numberToHex(signed.chainId),
    nonce: numberToHex(signed.nonce),
    r: numberToHex(BigInt(signed.r), { size: 32 }),
    s: numberToHex(BigInt(signed.s), { size: 32 }),
    yParity: numberToHex(signed.yParity ?? 0, { size: 1 }),
  };
}

export function rpc(method: string, params: unknown[], id: number | string = 1): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method, params };
}
