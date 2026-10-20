import { after } from "node:test";

import { encodeFunctionData, type Address } from "viem";
import type { HDAccount } from "viem/accounts";

import { Secret } from "../src/config.js";
import { createRelayClient } from "../src/relay/client.js";
import { userOpStatusPath, type PostRequest, type PostResponse, type PreparedSign, type RelayClient, type RelayResult } from "../src/relay/contract.js";
import { createAccountDirectory, type UserOpExtensions, type UserOpOptions } from "../relay/userops.js";
import { routes as fundingRoutes } from "../relay/funding.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createRelay, type CreateRelayOptions, type Relay } from "../relay/main.js";
import { routes as useropRoutes } from "../relay/userops.js";
import type { MockXo } from "./mock-xo/server.js";
import { signEip191, signRaw } from "./anvil/userop.js";
import { tempDir, TEST_RELAY_KEY, type TempDir } from "./relay-core-helpers.js";
import type { Hex } from "viem";
import { USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import { USDCE_STUB_ABI } from "./anvil/stubs.js";
import { packedFromJson, type PackedUserOpJson } from "../src/xo/userop/pack.js";
import type { PackedUserOp } from "../src/xo/userop/pack.js";
import { checkDecoded } from "./relay-decoded-check.js";

// A relay wired to the local mock XO, for the relay-userops and relay-funding tests. Not a test file.
//
// Time: the relay's clock IS the mock's clock, and a rate-limit wait in the upstream client moves that clock
// instead of sleeping, so a test takes no real time for pacing and everything stays on one timeline. The
// relay's HTTP budget is raised so no test sees a `pending` answer by accident. Keys are the public Anvil
// test keys (chain.owner(i)); nothing here signs anything real.

export const RELAY_ENV_BASE = Object.freeze({
  XO_RELAY_KEY: TEST_RELAY_KEY,
  RELAY_PORT: "0",
  RELAY_CREDENTIAL_STORE: "off",
  // Every flag below is switched on by the test that needs it.
  RELAY_ENFORCE_FLAG_FACTS: "0",
});

export interface Rig {
  readonly mock: MockXo;
  readonly relay: Relay;
  readonly client: RelayClient;
  readonly dir: string;
  post<P extends Parameters<RelayClient["post"]>[0]>(path: P, body: PostRequest<P>): Promise<RelayResult<PostResponse<P>>>;
  stop(): Promise<void>;
}

export interface RigOptions {
  readonly env?: Record<string, string>;
  readonly userops?: UserOpOptions;
  readonly extensions?: UserOpExtensions;
  readonly fetch?: typeof fetch;
  readonly createOptions?: Partial<CreateRelayOptions>;
  // Wire the account directory (POST /v1/account/status) built from the same readers.
  readonly directory?: boolean;
  // Reuse a data directory (a restart test).
  readonly dir?: TempDir;
}

const dirs: TempDir[] = [];
const rigs: Rig[] = [];

after(async () => {
  for (const rig of rigs.splice(0)) await rig.stop().catch(() => undefined);
  for (const dir of dirs.splice(0)) await dir.cleanup().catch(() => undefined);
});

export async function startRig(mock: MockXo, options: RigOptions = {}): Promise<Rig> {
  let made = options.dir;
  if (made === undefined) {
    made = await tempDir("relay-userops-");
    dirs.push(made);
  }
  let ref: Relay | undefined;
  const relay = await createRelay({
    env: { ...RELAY_ENV_BASE, RELAY_DATA_DIR: made.dir, ...options.env },
    ...(options.directory === true ? { accounts: createAccountDirectory({ upstream: () => ref?.services.upstream, ...(options.userops === undefined ? {} : { options: options.userops }), now: () => mock.clock.nowMs() }) } : {}),
    now: () => mock.clock.nowMs(),
    sleep: async (ms) => {
      mock.clock.advanceMs(Math.max(0, Math.round(ms)));
    },
    fetch: options.fetch ?? mock.asFetch,
    maintenance: false,
    extraUpstreamHosts: [{ host: "mainnet.base.org", methods: ["GET", "POST"] }],
    routes: { ...healthRoutes, ...useropRoutes, ...fundingRoutes },
    http: {
      readRate: { capacity: 100_000, refillPerSecond: 100_000 },
      writeRate: { capacity: 100_000, refillPerSecond: 100_000 },
      requestBudgetMs: 120_000,
      hardDeadlineMs: 180_000,
    },
    extraServices: {
      ...(options.userops === undefined ? {} : { userops: options.userops }),
      ...(options.extensions === undefined ? {} : { useropExtensions: options.extensions }),
    },
    ...options.createOptions,
  });
  ref = relay;
  const client = createRelayClient({ baseUrl: relay.url, key: new Secret(TEST_RELAY_KEY) });
  const rig: Rig = {
    mock,
    relay,
    client,
    dir: made.dir,
    post: async (path, body) => checkDecoded(path, await client.post(path, body)),
    stop: async () => {
      await relay.close();
    },
  };
  rigs.push(rig);
  return rig;
}

// ---- signing like PayBox would ---------------------------------------------------------------------------------

export type SignForm = "raw" | "eip191";

// The signature PayBox's request_wallet_sign would return for this `sign` block: the intent's digest signed
// as it is (raw), or as an EIP-191 message over its 32 bytes (what XO's own app does). Both validate on chain.
export async function signPrepared(owner: HDAccount, sign: PreparedSign, form: SignForm = "raw"): Promise<Hex> {
  if (sign.intent.op !== "raw") throw new Error("a user operation is signed with a raw intent");
  const digest = sign.intent.rawSigningPayloadHex as Hex;
  return form === "raw" ? signRaw(owner, digest) : signEip191(owner, digest);
}

export async function statusOf(rig: Rig, hash: string): Promise<{ readonly state: string; readonly tx_hash?: string | undefined; readonly detail?: string | undefined }> {
  return ok(await rig.client.get(userOpStatusPath(hash)));
}

export function ok<T>(result: RelayResult<T>): T {
  if (!result.ok) throw new Error(`expected a success, got ${result.error.code}: ${result.error.message}`);
  return result.data;
}

export function failed<T>(result: RelayResult<T>): { readonly code: string; readonly message: string; readonly details?: unknown } {
  if (result.ok) throw new Error("expected a failure, got a success");
  return result.error;
}

// ---- reading what the relay stored and what the chain holds --------------------------------------------------------

// The unsigned operation stored with a prepared item (what submit rebuilds and hashes).
export function storedOp(rig: Rig, preparedId: string): PackedUserOp {
  const record = rig.relay.services.prepared.require(preparedId);
  const payload = record.payload as unknown as { readonly op: PackedUserOpJson };
  return packedFromJson(payload.op);
}

export async function usdceBalanceOf(mock: MockXo, account: Address): Promise<bigint> {
  const chain = mock.chains.xo;
  if (chain === undefined) throw new Error("the mock has no XO chain");
  return (await chain.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "balanceOf", args: [account] })) as bigint;
}

// USDC.e on the stub is an open mint: this gives an account a balance the way a delivered deposit would.
export async function mintUsdce(mock: MockXo, to: Address, amount: bigint): Promise<void> {
  const chain = mock.chains.xo;
  if (chain === undefined) throw new Error("the mock has no XO chain");
  await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [to, amount] }));
}

// ---- a fetch that records and can break a request --------------------------------------------------------------------

export interface TappedCall {
  readonly host: string;
  readonly method: string;
  readonly path: string;
  // The query string, "?a=b" or "".
  readonly search: string;
  // The JSON-RPC method of a POST body, when it has one.
  readonly rpc: string | undefined;
}

export type TapAction =
  | { readonly action: "forward" }
  // The request never reaches the mock (a connection that dies before the server sees it).
  | { readonly action: "fail" }
  // The mock does its work and the answer is lost (the ambiguous case).
  | { readonly action: "forward_then_fail" }
  | { readonly action: "forward_then_status"; readonly status: number; readonly headers?: Record<string, string> }
  // The request is answered with this status without being forwarded (a gateway error in front of the bundler).
  | { readonly action: "status"; readonly status: number }
  // A JSON-RPC error answered in place of the mock's (without forwarding), with the request's own id.
  | { readonly action: "rpc_error"; readonly code: number; readonly message: string }
  // This JSON body is the answer (status 200), without forwarding: an index that has not caught up, say.
  | { readonly action: "json"; readonly body: unknown };

export interface Tap {
  readonly calls: TappedCall[];
  count(match: { readonly host?: string; readonly rpc?: string; readonly method?: string }): number;
}

// `rewrite` may change the text of a forwarded answer (return undefined to leave it).
export function tappedFetch(
  mock: MockXo,
  decide: (call: TappedCall) => TapAction | Promise<TapAction> = () => ({ action: "forward" }),
  rewrite?: (call: TappedCall, text: string) => string | undefined,
): { readonly fetch: typeof fetch; readonly tap: Tap } {
  const calls: TappedCall[] = [];
  const tap: Tap = {
    calls,
    count: (match) => calls.filter((call) => (match.host === undefined || call.host === match.host) && (match.rpc === undefined || call.rpc === match.rpc) && (match.method === undefined || call.method === match.method)).length,
  };
  const wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    let rpc: string | undefined;
    if (typeof init?.body === "string") {
      try {
        const parsed = JSON.parse(init.body) as { method?: unknown };
        if (typeof parsed.method === "string") rpc = parsed.method;
      } catch {
        // not JSON
      }
    }
    const call: TappedCall = { host: url.hostname, method: init?.method ?? "GET", path: url.pathname, search: url.search, rpc };
    calls.push(call);
    const verdict = await decide(call);
    if (verdict.action === "fail") throw new TypeError("fetch failed");
    if (verdict.action === "status") return new Response("gateway error", { status: verdict.status });
    if (verdict.action === "json") return new Response(JSON.stringify(verdict.body), { status: 200, headers: { "content-type": "application/json" } });
    if (verdict.action === "rpc_error") {
      let id: unknown = null;
      try {
        id = (JSON.parse(String(init?.body)) as { id?: unknown }).id ?? null;
      } catch {
        id = null;
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code: verdict.code, message: verdict.message } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const response = await mock.asFetch(input, init);
    if (verdict.action === "forward_then_fail") {
      await response.text();
      throw new TypeError("fetch failed");
    }
    if (verdict.action === "forward_then_status") {
      await response.text();
      return new Response("upstream error", { status: verdict.status, headers: verdict.headers });
    }
    if (rewrite !== undefined) {
      const text = await response.text();
      const changed = rewrite(call, text);
      return new Response(changed ?? text, { status: response.status, headers: response.headers });
    }
    return response;
  }) as typeof fetch;
  return { fetch: wrapped, tap };
}

// Some facts are written by a background listener (a host that asked for a key). Polls for a condition for at
// most `timeoutMs` of real time, only to let the event loop turn; it never decides a result by waiting.
export async function eventually(check: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// Lets the event loop run for a moment of real time, e.g. for a request that was abandoned mid-flight to finish.
export function turn(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
