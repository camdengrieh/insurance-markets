import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { after, describe } from "node:test";

import { encodeFunctionData, getAddress, keccak256, stringToHex, type Address, type Hex } from "viem";
import type { HDAccount } from "viem/accounts";

import { Secret, loadConfig, relayEndpoint, type EnvLike, type GuardrailConfig } from "../../src/config.js";
import type { AuditEvent } from "../../src/guardrails/audit.js";
import { createEmbeddedRelayClient, createRelayClient } from "../../src/relay/client.js";
import { RELAY_USER_AGENT, type RelayClient } from "../../src/relay/contract.js";
import { XO_PLUGIN_HOSTS } from "../../src/xo/http.js";
import { XoClient } from "../../src/xo/client.js";
import { FLAG_NAMES, type Flags, type WriteFlagName } from "../../src/relay/flags.js";
import { registerAccountTools, type AccountToolDeps } from "../../src/tools/account.js";
import { registerFundTools, createXoFundingReads, type FundToolDeps } from "../../src/tools/fund.js";
import { registerTradeTools } from "../../src/tools/trade.js";
import { registerUseropTools } from "../../src/tools/userop.js";
import { proposeEvm } from "../../src/paybox.js";
import { deriveAccount } from "../../src/xo/account/derive.js";
import { CONDITIONAL_TOKENS } from "../../src/xo/chain/constants.js";
import { explorerTransportFromHttp } from "../../src/xo/chain/reads.js";
import { BaseRpc } from "../../src/xo/funding/preflight.js";
import { orderFromWire, hashOrder } from "../../src/xo/signing/index.js";
import { verifyPreparedLocal } from "../../src/xo/signing/rebuild.js";
import { parseSendParams } from "../../src/xo/userop/bundler.js";
import { userOpHash } from "../../src/xo/userop/hash.js";
import { createProductionRelay, createRelay, type CoreServices, type Relay } from "../../relay/main.js";
import { createEmbeddedRelay, credentialL2Auth } from "../../relay/embedded.js";
import type { RelayHttpConfig } from "../../relay/config.js";
import { createCredentialRoutes, TRIPLET_SECRET_NAME, type CredentialOptions } from "../../relay/credentials.js";
import { routes as creationRoutes } from "../../relay/creation.js";
import { routes as fundingRoutes } from "../../relay/funding.js";
import { routes as healthRoutes } from "../../relay/health.js";
import { createOrderRoutes } from "../../relay/orders.js";
import { mergeRoutes } from "../../relay/routes.js";
import type { RelayServices, RouteTable } from "../../relay/types.js";
import { createAccountDirectory, loadUserOpOptions, routes as useropRoutes, type UserOpOptions } from "../../relay/userops.js";
import { CTF_STUB_ABI } from "../anvil/stubs.js";
import type { MockXo } from "../mock-xo/server.js";
import { useMock } from "../mock-xo/testing.js";
import { MOCK_SWITCHES, type MockSwitchName } from "../mock-xo/switches.js";
import { closeAll, connect, type CallResult, type Harness } from "../tools-helpers.js";
import { TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, tempDir, type TempDir } from "../relay-core-helpers.js";

// Shared rig for the profile-matrix acceptance tests (test/profile-matrix/core-*.test.ts). Not a test file.
//
// What it builds: the plugin's real tools (xo_account, xo_connect, the user-operation tools, the order tools,
// the funding tools) over an in-memory MCP transport, the real RelayClient, the real relay with every route
// wired, and the local mock XO behind the relay's upstream client. The only thing standing in for PayBox is
// `sign`: it signs a prepared item's intent with a PUBLIC Anvil/Hardhat TEST key (no real key anywhere).
//
// The transport is a parameter: "http" (tools -> RelayClient -> loopback HTTP -> relay) is built here;
// "embedded" (tools -> embedded RelayClient -> in-process relay) plugs in through `embeddedTransport()`.
//
// Everything records what it sees (the wire to the mock, the relay's answers, the tools' results, the audit
// events) so `checkInvariants` can judge a whole journey from the outside.

export type Json = Record<string, unknown>;
export type TransportName = "http" | "embedded";

export const DAY_CAP_ATOMIC = 50_000_000n;
export const ORDER_CAP_ATOMIC = 10_000_000n;
export const FUNDING_TEST_CAP_ATOMIC = 10_000_000n;

export const WRITE_FLAGS = FLAG_NAMES.filter((name): name is WriteFlagName => name !== "KILL");
// The flags the journeys of this suite exercise (creation is out of scope here).
export const JOURNEY_FLAGS: readonly WriteFlagName[] = ["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING", "ENABLE_FUNDING", "ENABLE_WITHDRAW"];

const lower = (value: string): string => value.toLowerCase();

// A deterministic stand-in for crypto.randomBytes: the same seed gives the same salts and ids.
export function seededBytes(seed: number): (bytes: number) => Buffer {
  let state = seed >>> 0;
  return (bytes) => {
    const out = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i += 1) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out[i] = (t ^ (t >>> 14)) & 0xff;
    }
    return out;
  };
}

// ---- the wire to the mock (what the relay sends upstream) -------------------------------------------------------------

export type WireKind = "bundler_send" | "order_post" | "order_delete" | "api_key_create" | "other";

export interface WireCall {
  readonly seq: number;
  readonly kind: WireKind;
  readonly host: string;
  readonly method: string;
  readonly path: string;
  readonly search: string;
  readonly rpc: string | undefined;
  // The XO-side meaning, when the body says: the user-operation hash, the order hash.
  readonly userOpHash?: string;
  readonly sender?: string;
  readonly orderHash?: string;
  readonly apiKeyHeader?: string;
  readonly signatureHeader?: string;
  // The HTTP status (0 when the fault dropped it); for the bundler: whether the JSON-RPC answer had a result.
  status: number;
  accepted: boolean;
  // The wire signature prefix of an order ("0x01" / "0x00").
  readonly prefix?: string;
}

export type WireAction =
  | { readonly action: "fail" }
  | { readonly action: "forward_then_fail" }
  | { readonly action: "status"; readonly status: number }
  | { readonly action: "hang" }
  // XO is slow: the request is held for this long (real time) and then served normally.
  | { readonly action: "delay"; readonly ms: number }
  // The relay process dies at this point: before the request leaves (the XO side never sees it) or after the XO
  // side has done its work (the answer is lost). `run` is the crash (the transport's abandon).
  | { readonly action: "crash"; readonly when: "before" | "after"; readonly run: () => Promise<void> };

export interface WireFault {
  readonly name: string;
  readonly match: (call: WireCall) => boolean;
  readonly action: WireAction;
  // How many matching calls it hits (default: all).
  readonly times?: number;
  hits?: number;
}

export class Wire {
  readonly calls: WireCall[] = [];
  readonly faults: WireFault[] = [];
  private seq = 0;
  // Every secret-bearing header value the relay sent (the HMAC signature and API key), for the leak scan.
  readonly sentSecrets = new Set<string>();

  constructor(private readonly mock: MockXo) {}

  count(match: (call: WireCall) => boolean): number {
    return this.calls.filter(match).length;
  }

  fault(fault: WireFault): void {
    this.faults.push({ ...fault, hits: 0 });
  }

  clearFaults(): void {
    this.faults.length = 0;
  }

  readonly fetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders !== undefined) {
      const entries = rawHeaders instanceof Headers ? [...rawHeaders.entries()] : Array.isArray(rawHeaders) ? rawHeaders : Object.entries(rawHeaders as Record<string, string>);
      for (const [name, value] of entries) headers[name.toLowerCase()] = String(value);
    }
    let rpc: string | undefined;
    let parsedBody: unknown;
    if (body !== undefined) {
      try {
        parsedBody = JSON.parse(body);
        const named = (parsedBody as { method?: unknown }).method;
        if (typeof named === "string") rpc = named;
      } catch {
        parsedBody = undefined;
      }
    }
    let kind: WireKind = "other";
    let userOp: string | undefined;
    let sender: string | undefined;
    let orderHash: string | undefined;
    let prefix: string | undefined;
    if (rpc === "eth_sendUserOperation") {
      kind = "bundler_send";
      try {
        const parsed = parseSendParams((parsedBody as { params: unknown[] }).params);
        if (parsed.ok) {
          userOp = userOpHash(parsed.op);
          sender = lower(parsed.op.sender);
        }
      } catch {
        // an unparseable send is still a bundler send; it matches no prepared item
      }
    } else if (method === "POST" && url.pathname === "/order") {
      kind = "order_post";
      try {
        const order = (parsedBody as { order: Record<string, unknown> }).order;
        orderHash = lower(hashOrder(orderFromWire(order)));
        prefix = String(order["signature"]).slice(0, 4);
      } catch {
        // unparseable: matches no prepared item
      }
    } else if (method === "DELETE" && url.pathname === "/order") {
      kind = "order_delete";
      const target = (parsedBody as Record<string, unknown> | undefined)?.["orderID"] ?? (parsedBody as Record<string, unknown> | undefined)?.["orderId"];
      if (typeof target === "string" || typeof target === "number") orderHash = lower(String(target));
    } else if (method === "POST" && url.pathname === "/auth/api-key") {
      kind = "api_key_create";
    }
    const call: WireCall = {
      seq: this.seq++,
      kind,
      host: url.hostname,
      method,
      path: url.pathname,
      search: url.search,
      rpc,
      ...(userOp === undefined ? {} : { userOpHash: userOp }),
      ...(sender === undefined ? {} : { sender }),
      ...(orderHash === undefined ? {} : { orderHash }),
      ...(prefix === undefined ? {} : { prefix }),
      ...(headers["xo_api_key"] === undefined ? {} : { apiKeyHeader: headers["xo_api_key"] }),
      ...(headers["xo_signature"] === undefined ? {} : { signatureHeader: headers["xo_signature"] }),
      status: 0,
      accepted: false,
    };
    this.calls.push(call);
    if (headers["xo_api_key"] !== undefined && headers["xo_signature"] !== undefined) {
      this.sentSecrets.add(headers["xo_signature"]);
    }

    for (const fault of this.faults) {
      if (!fault.match(call)) continue;
      if (fault.times !== undefined && (fault.hits ?? 0) >= fault.times) continue;
      fault.hits = (fault.hits ?? 0) + 1;
      const action = fault.action;
      if (action.action === "fail") throw new TypeError("fetch failed");
      if (action.action === "status") {
        call.status = action.status;
        return new Response("gateway error", { status: action.status });
      }
      if (action.action === "crash") {
        if (action.when === "before") {
          void action.run().catch(() => undefined);
          throw new TypeError("fetch failed");
        }
        const response = await this.mock.asFetch(input, init);
        call.status = response.status;
        call.accepted = await acceptedBy(call, response.clone());
        await response.text();
        void action.run().catch(() => undefined);
        throw new TypeError("fetch failed");
      }
      if (action.action === "delay") {
        await new Promise((resolve) => setTimeout(resolve, action.ms));
        const response = await this.mock.asFetch(input, init);
        call.status = response.status;
        call.accepted = await acceptedBy(call, response.clone());
        return response;
      }
      if (action.action === "hang") {
        return new Promise<Response>((_resolve, reject) => {
          const fail = (): void => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (init?.signal?.aborted === true) fail();
          init?.signal?.addEventListener("abort", fail, { once: true });
        });
      }
      const response = await this.mock.asFetch(input, init);
      call.status = response.status;
      call.accepted = await acceptedBy(call, response.clone());
      await response.text();
      throw new TypeError("fetch failed");
    }

    const response = await this.mock.asFetch(input, init);
    call.status = response.status;
    call.accepted = await acceptedBy(call, response.clone());
    return response;
  }) as typeof fetch;
}

async function acceptedBy(call: WireCall, response: Response): Promise<boolean> {
  if (response.status < 200 || response.status >= 300) return false;
  if (call.kind === "bundler_send") {
    try {
      const body = (await response.json()) as { result?: unknown; error?: unknown };
      return body.result !== undefined && body.error === undefined;
    } catch {
      return false;
    }
  }
  if (call.kind === "order_post") {
    try {
      const body = (await response.json()) as { success?: unknown };
      return body.success === true;
    } catch {
      return false;
    }
  }
  return true;
}

// ---- the plugin's view of the relay (what a response looks like on the way back) -----------------------------------------------

export interface RelayWireEntry {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly requestBody: string;
  readonly responseBody: string;
  readonly responseHeaders: string;
}

export function recordingRelayFetch(entries: RelayWireEntry[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const response = await globalThis.fetch(input, init);
    const text = await response.clone().text();
    entries.push({
      method: (init?.method ?? "GET").toUpperCase(),
      url,
      status: response.status,
      requestBody: typeof init?.body === "string" ? init.body : "",
      responseBody: text,
      responseHeaders: JSON.stringify([...response.headers.entries()]),
    });
    return response;
  }) as typeof fetch;
}

// ---- what a step of a journey looks like ------------------------------------------------------------------------------------------

export interface Step {
  readonly tool: string;
  readonly args: Json;
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Json | undefined;
  readonly code: string | undefined;
  readonly outcome: string | undefined;
  readonly startedMs: number;
  readonly endedMs: number;
  // For xo_fund_account: whether the account was deployed on chain when the call was made.
  readonly deployedBefore?: boolean;
}

export interface PreparedRecord {
  readonly tool: string;
  readonly owner: string;
  readonly account: string;
  readonly preparedId: string;
  readonly kind: string;
  readonly userOpHash?: string;
  readonly orderHash?: string;
  readonly dryRun: boolean;
}

// ---- the relay handle (transport-specific) -------------------------------------------------------------------------------------------

// What the invariant checks and the tests need from a running relay, whichever transport carries the calls.
export interface RelayView {
  readonly services: CoreServices;
  flags(): Flags;
  // "http://127.0.0.1:port" for the HTTP transport, "embedded" for the in-process one.
  readonly url: string;
}

export interface RelayHandle {
  readonly name: TransportName;
  readonly view: RelayView;
  readonly dataDir: string;
  // The client the plugin's tools talk to; every answer it receives is appended to `record`.
  makeClient(config: GuardrailConfig, record: RelayWireEntry[]): RelayClient;
  close(): Promise<void>;
  abandon(): Promise<void>;
}

export interface StartRelayInput {
  readonly mock: MockXo;
  readonly wire: Wire;
  readonly dir: string;
  readonly env: Record<string, string>;
  // "adapter": the credential module's L2 signer (credentialL2Auth) is wired explicitly into the relay; "default": the
  // relay is assembled as its own entry point assembles it (relay/embedded.ts wires the adapter itself; createRelay in
  // relay/main.ts, which `pnpm relay` runs, does not).
  readonly l2: "adapter" | "default";
  readonly seed: number;
  readonly orderTimings: { readonly pendingAfterMs?: number; readonly postTimeoutMs?: number };
  readonly credentialOptions?: CredentialOptions;
}

export interface Transport {
  readonly name: TransportName;
  start(input: StartRelayInput): Promise<RelayHandle>;
}

interface Assembled {
  readonly env: Record<string, string>;
  readonly routes: RouteTable;
  readonly extraServices: Partial<RelayServices>;
  readonly useropOptions: UserOpOptions;
  readonly http: Partial<RelayHttpConfig>;
}

// Everything both transports share: the route table (credential and order modules built with the test seams),
// the user-operation options and the optional L2 adapter. Time is the mock's: a sleep moves its clock.
function assemble(input: StartRelayInput, services: () => CoreServices | undefined): Assembled {
  const { mock } = input;
  const env: Record<string, string> = {
    XO_RELAY_KEY: TEST_RELAY_KEY,
    RELAY_PORT: "0",
    RELAY_DATA_DIR: input.dir,
    // The write flags are the operator's confirmation in these runs; the test decides which are on.
    RELAY_ENFORCE_FLAG_FACTS: "0",
    ...input.env,
  };
  const useropOptions = loadUserOpOptions(env).options;
  const orders = createOrderRoutes({ random: seededBytes(input.seed), ...input.orderTimings });
  // The adapter relay/embedded.ts ships: the credential module is the single signer of XO's L2 calls.
  const l2auth = credentialL2Auth(services, () => mock.clock.nowMs());
  return {
    env,
    useropOptions,
    routes: mergeRoutes(
      healthRoutes,
      createCredentialRoutes({
        sleep: async (ms) => {
          mock.clock.advanceMs(Math.max(0, Math.ceil(ms)));
        },
        ...input.credentialOptions,
      }),
      orders.routes,
      useropRoutes,
      fundingRoutes,
      creationRoutes,
    ),
    extraServices: { userops: useropOptions, ...(input.l2 === "adapter" ? { l2auth } : {}) },
    http: {
      readRate: { capacity: 100_000, refillPerSecond: 100_000 },
      writeRate: { capacity: 100_000, refillPerSecond: 100_000 },
      requestBudgetMs: 120_000,
      hardDeadlineMs: 180_000,
    },
  };
}

// A crash can be triggered from inside a request (a wire fault) and again by the test's restart; run it once.
function once(run: () => Promise<void>): () => Promise<void> {
  let started: Promise<void> | undefined;
  return () => (started ??= run());
}

const BASE_HOST = { host: "mainnet.base.org", methods: ["GET", "POST"] } as const;

export const httpTransport: Transport = {
  name: "http",
  async start(input) {
    const { mock } = input;
    let ref: Relay | undefined;
    const parts = assemble(input, () => ref?.services);
    const relay = await createRelay({
      env: parts.env,
      masterSecret: new Secret(TEST_MASTER_SECRET),
      kdf: TEST_KDF,
      allowWeakKdf: true,
      isProcessAlive: () => false,
      now: () => mock.clock.nowMs(),
      sleep: async (ms) => {
        mock.clock.advanceMs(Math.max(0, Math.round(ms)));
      },
      fetch: input.wire.fetch,
      maintenance: false,
      extraUpstreamHosts: [BASE_HOST],
      accounts: createAccountDirectory({ upstream: () => ref?.services.upstream, options: parts.useropOptions, now: () => mock.clock.nowMs() }),
      routes: parts.routes,
      extraServices: parts.extraServices,
      http: parts.http,
    });
    ref = relay;
    return {
      name: "http",
      view: { services: relay.services, flags: relay.flags, url: relay.url },
      dataDir: input.dir,
      makeClient: (config, record) => {
        const endpoint = relayEndpoint(config);
        return createRelayClient({ baseUrl: endpoint?.baseUrl, key: endpoint?.key, fetch: recordingRelayFetch(record) });
      },
      close: once(() => relay.close()),
      abandon: once(() => relay.abandon()),
    };
  },
};

// The HTTP relay exactly as `pnpm relay` assembles it (relay/main.ts createProductionRelay with only the environment): the
// default route table and the shipped wiring (account directory, L2 signer, user-operation options). Only the test seams
// (clock, fetch, weak KDF) are added. core-findings.test.ts uses it to check that assembly.
export const httpShippedTransport: Transport = {
  name: "http",
  async start(input) {
    const { mock } = input;
    const env: Record<string, string> = { XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", RELAY_DATA_DIR: input.dir, RELAY_ENFORCE_FLAG_FACTS: "0", ...input.env };
    const relay = await createProductionRelay({
      env,
      masterSecret: new Secret(TEST_MASTER_SECRET),
      kdf: TEST_KDF,
      allowWeakKdf: true,
      isProcessAlive: () => false,
      now: () => mock.clock.nowMs(),
      sleep: async (ms) => {
        mock.clock.advanceMs(Math.max(0, Math.round(ms)));
      },
      fetch: input.wire.fetch,
      maintenance: false,
      http: { readRate: { capacity: 100_000, refillPerSecond: 100_000 }, writeRate: { capacity: 100_000, refillPerSecond: 100_000 } },
    });
    return {
      name: "http",
      view: { services: relay.services, flags: relay.flags, url: relay.url },
      dataDir: input.dir,
      makeClient: (config, record) => {
        const endpoint = relayEndpoint(config);
        return createRelayClient({ baseUrl: endpoint?.baseUrl, key: endpoint?.key, fetch: recordingRelayFetch(record) });
      },
      close: once(() => relay.close()),
      abandon: once(() => relay.abandon()),
    };
  },
};

// The in-process relay (relay/embedded.ts): the same route table behind a function instead of a socket.
export const embeddedTransport: Transport = {
  name: "embedded",
  async start(input) {
    const { mock } = input;
    let services: CoreServices | undefined;
    const parts = assemble(input, () => services);
    const relay = await createEmbeddedRelay({
      dataDir: input.dir,
      // Every owner is served from the one data directory in these tests (each stays isolated by account);
      // a test about the owner policy itself sets XO_OWNER or clears this through relayEnv.
      env: { XO_ALLOW_ANY_OWNER: "1", ...parts.env },
      clock: () => mock.clock.nowMs(),
      masterSecret: new Secret(TEST_MASTER_SECRET),
      kdf: TEST_KDF,
      allowWeakKdf: true,
      isProcessAlive: () => false,
      sleep: async (ms) => {
        mock.clock.advanceMs(Math.max(0, Math.round(ms)));
      },
      fetch: input.wire.fetch,
      maintenance: false,
      extraUpstreamHosts: [BASE_HOST],
      userops: parts.useropOptions,
      routes: parts.routes,
      extraServices: parts.extraServices,
      http: parts.http,
      // Several owners are served from one data directory in these tests; each stays isolated by account.
      // (XO_ALLOW_ANY_OWNER is an environment setting of the local mode.)
    });
    services = relay.services;
    return {
      name: "embedded",
      view: { services: relay.services, flags: relay.flags, url: "embedded" },
      dataDir: input.dir,
      makeClient: (_config, record) =>
        createEmbeddedRelayClient(async (request) => {
          const reply = await relay.handler(request);
          record.push({ method: request.method, url: request.path, status: reply.status, requestBody: request.bodyText ?? "", responseBody: reply.bodyText, responseHeaders: "[]" });
          return reply;
        }),
      close: once(() => relay.close()),
      abandon: once(() => relay.abandon()),
    };
  },
};

// ---- the stack -------------------------------------------------------------------------------------------------------------------------

export interface StackOptions {
  readonly mock: MockXo;
  readonly transport?: Transport;
  // Flags on at the relay / at the plugin. Default: the journey flags, on at both ends.
  readonly relayOn?: readonly WriteFlagName[];
  readonly pluginOn?: readonly WriteFlagName[];
  readonly relayKill?: boolean;
  readonly pluginKill?: boolean;
  readonly dir?: TempDir;
  readonly l2?: "adapter" | "default";
  readonly seed?: number;
  readonly relayEnv?: Record<string, string>;
  readonly pluginEnv?: Record<string, string>;
  readonly orderTimings?: StartRelayInput["orderTimings"];
  readonly credentialOptions?: CredentialOptions | undefined;
  // Reuse the recorders of an earlier stack (a restart): one history across the whole journey.
  readonly history?: History;
}

export interface History {
  readonly wire: Wire;
  readonly relayWire: RelayWireEntry[];
  readonly audit: AuditEvent[];
  readonly steps: Step[];
  readonly prepared: PreparedRecord[];
  readonly signed: Array<{ readonly preparedId: string; readonly digest: string; readonly by: string }>;
  // Everything a restart wrote to the data directory, and where.
  readonly dirs: Set<string>;
  readonly secretsSeen: Set<string>;
}

export function newHistory(mock: MockXo): History {
  return { wire: new Wire(mock), relayWire: [], audit: [], steps: [], prepared: [], signed: [], dirs: new Set(), secretsSeen: new Set() };
}

export interface Stack {
  readonly mock: MockXo;
  readonly transport: TransportName;
  readonly handle: RelayHandle;
  readonly relay: RelayView;
  readonly harness: Harness;
  readonly history: History;
  readonly dir: TempDir;
  readonly pluginEnv: EnvLike;
  readonly options: StackOptions;
  readonly config: GuardrailConfig;
  call(tool: string, args: Json): Promise<Step>;
  // The relay's own client (what a tool would use), for direct contract calls in a test.
  client(): RelayClient;
  restart(how: "close" | "crash", overrides?: Partial<StackOptions>): Promise<Stack>;
  stop(): Promise<void>;
}

const stacks: Stack[] = [];
const dirs: TempDir[] = [];

after(async () => {
  await closeAll().catch(() => undefined);
  for (const stack of stacks.splice(0)) await stack.stop().catch(() => undefined);
  for (const dir of dirs.splice(0)) await dir.cleanup().catch(() => undefined);
});

function flagEnv(on: readonly WriteFlagName[], kill: boolean): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of WRITE_FLAGS) env[name] = on.includes(name) ? "1" : "0";
  if (kill) env["KILL"] = "1";
  return env;
}

export async function startStack(options: StackOptions): Promise<Stack> {
  const { mock } = options;
  const transport = options.transport ?? httpTransport;
  let dir = options.dir;
  if (dir === undefined) {
    dir = await tempDir("profile-matrix-");
    dirs.push(dir);
  }
  const history = options.history ?? newHistory(mock);
  history.dirs.add(dir.dir);
  const relayOn = options.relayOn ?? JOURNEY_FLAGS;
  const pluginOn = options.pluginOn ?? relayOn;

  const handle = await transport.start({
    mock,
    wire: history.wire,
    dir: dir.dir,
    env: { ...flagEnv(relayOn, options.relayKill === true), ...options.relayEnv },
    l2: options.l2 ?? "adapter",
    seed: options.seed ?? 7,
    orderTimings: options.orderTimings ?? {},
    ...(options.credentialOptions === undefined ? {} : { credentialOptions: options.credentialOptions }),
  });
  const relay = handle.view;

  const pluginEnv: Record<string, string> = {
    ...(relay.url.startsWith("http") ? { XO_RELAY_URL: relay.url, XO_RELAY_KEY: TEST_RELAY_KEY } : {}),
    ...flagEnv(pluginOn, options.pluginKill === true),
    ...options.pluginEnv,
  };
  const config = loadConfig(pluginEnv).config;
  const nowMs = (): number => mock.clock.nowMs();
  const client = handle.makeClient(config, history.relayWire);
  const audit = { write: (event: AuditEvent): void => void history.audit.push(event) };
  const relayDeps = { nowMs, config: () => config, env: () => pluginEnv, relay: () => client, audit };
  const accountDeps: AccountToolDeps = {
    ...relayDeps,
    createClient: () => xoClientFor(mock, 7_000),
    explorer: (xo) => explorerTransportFromHttp(xo.http),
    rpc: () => undefined,
  };
  const fundDeps: FundToolDeps = {
    ...relayDeps,
    // PayBox's proposal builder checks the expiry against the machine clock (src/paybox.ts), which is hours away
    // from the mock's. Let it choose its own expiry; every other check of the proposal still runs.
    propose: (input) => proposeEvm({ chain: input.chain, to: input.to, ...(input.value === undefined ? {} : { value: input.value }), ...(input.data === undefined ? {} : { data: input.data }) }),
    baseRpc: () => new BaseRpc({ transport: mock.rpcTransport, url: "https://mainnet.base.org" }),
    xo: () => createXoFundingReads(() => xoClientFor(mock, 5_500)),
  };
  const harness = await connect((server) => {
    registerAccountTools(server, accountDeps);
    registerUseropTools(server, relayDeps);
    registerTradeTools(server, relayDeps);
    registerFundTools(server, fundDeps);
  });

  const stack: Stack = {
    mock,
    transport: handle.name,
    handle,
    relay,
    harness,
    history,
    dir,
    pluginEnv,
    options,
    config,
    async call(tool, args) {
      const startedMs = nowMs();
      let deployedBefore: boolean | undefined;
      if (tool === "xo_fund_account" && typeof args["owner"] === "string") {
        deployedBefore = await mock.chains.isDeployed(deriveAccount(getAddress(args["owner"]))).catch(() => undefined);
      }
      const result: CallResult = await withDeadline(harness.call(tool, args), 30_000, `${tool} did not answer`);
      const structured = result.structured;
      const step: Step = {
        tool,
        args,
        isError: result.isError,
        text: result.text,
        structured,
        code: typeof structured?.["code"] === "string" ? (structured["code"] as string) : undefined,
        outcome: typeof structured?.["outcome"] === "string" ? (structured["outcome"] as string) : undefined,
        startedMs,
        endedMs: nowMs(),
        ...(deployedBefore === undefined ? {} : { deployedBefore }),
      };
      history.steps.push(step);
      recordPrepared(history, step);
      return step;
    },
    client: () => client,
    async restart(how, overrides = {}) {
      await harness.close().catch(() => undefined);
      if (how === "crash") await handle.abandon();
      else await handle.close();
      const next = await startStack({ ...options, ...overrides, dir, history, seed: (options.seed ?? 7) + 101 });
      return next;
    },
    async stop() {
      await harness.close().catch(() => undefined);
      await handle.close().catch(() => undefined);
    },
  };
  stacks.push(stack);
  return stack;
}

// The plugin's XO read client against the mock. Its request pacing (4 per second per host) is unit-tested in
// test/xo-http.test.ts; here it would only add real-time sleeps, so the interval is the smallest allowed.
function xoClientFor(mock: MockXo, totalBudgetMs: number): XoClient {
  return new XoClient({ totalBudgetMs, allowedHosts: XO_PLUGIN_HOSTS, userAgent: RELAY_USER_AGENT, fetchImpl: mock.fetch, minIntervalMs: 1 });
}

export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`HANG: ${label} (no answer in ${String(ms)} ms of real time)`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

function recordPrepared(history: History, step: Step): void {
  const out = step.structured;
  if (out === undefined) return;
  if (step.tool === "xo_withdraw" && step.outcome === "prepared" && typeof out["prepared_id"] === "string") {
    // The withdrawal answer has no `prepared` object; its signing digest IS the user-operation hash.
    const intent = out["request_wallet_sign_intent"] as IntentLike | undefined;
    history.prepared.push({
      tool: step.tool,
      owner: String(out["owner"]),
      account: String(out["account"]),
      preparedId: out["prepared_id"],
      kind: "userop",
      ...(typeof intent?.rawSigningPayloadHex === "string" ? { userOpHash: lower(intent.rawSigningPayloadHex) } : {}),
      dryRun: false,
    });
    return;
  }
  const prepared = out["prepared"] as Json | undefined;
  if (prepared === undefined || typeof prepared["prepared_id"] !== "string") return;
  const summaryLines = ((prepared["summary"] as Json | undefined)?.["lines"] as string[] | undefined) ?? [];
  const orderLine = summaryLines.find((line) => line.startsWith("Order id (hash) "));
  history.prepared.push({
    tool: step.tool,
    owner: String(out["owner"] ?? prepared["owner"]),
    account: String(out["account"] ?? prepared["account"]),
    preparedId: prepared["prepared_id"],
    kind: String(prepared["kind"]),
    ...(typeof out["user_op_hash"] === "string" ? { userOpHash: lower(out["user_op_hash"]) } : typeof prepared["user_op_hash"] === "string" ? { userOpHash: lower(prepared["user_op_hash"]) } : {}),
    ...(orderLine === undefined ? {} : { orderHash: lower(orderLine.slice("Order id (hash) ".length).replace(/\.$/, "")) }),
    dryRun: out["outcome"] === "dry_run",
  });
}

// ---- the agent: what an LLM with PayBox does, with a TEST key ------------------------------------------------------------------------------

export type SignForm = "as_intent" | "eip191";

export interface IntentLike {
  readonly op: string;
  readonly rawSigningPayloadHex?: string;
  readonly typedData?: { readonly domain: unknown; readonly types: unknown; readonly primaryType: string; readonly message: unknown };
}

// What PayBox's request_wallet_sign returns for an intent: a raw signature over the 32 bytes, or an EIP-712
// signature. "eip191" is the other form XO's own app uses (a message signature over the digest).
export async function signIntent(owner: HDAccount, intent: IntentLike, form: SignForm = "as_intent"): Promise<Hex> {
  if (intent.op === "raw") {
    const digest = intent.rawSigningPayloadHex as Hex;
    return form === "eip191" ? owner.signMessage({ message: { raw: digest } }) : owner.sign({ hash: digest });
  }
  assert.equal(intent.op, "typedData", "only raw and typedData intents are signed by this suite");
  const data = intent.typedData;
  assert.ok(data !== undefined);
  return owner.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message } as never);
}

export function intentOf(step: Step): IntentLike | undefined {
  return step.structured?.["sign_with_paybox"] as IntentLike | undefined;
}

export function preparedIdOf(step: Step): string {
  const prepared = step.structured?.["prepared"] as Json | undefined;
  assert.ok(prepared !== undefined && typeof prepared["prepared_id"] === "string", `no prepared item in ${step.tool}: ${step.text.slice(0, 200)}`);
  return prepared["prepared_id"] as string;
}

export function ownerOf(mock: MockXo, index: number): HDAccount {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined, "the mock has an XO chain");
  return chain.owner(index);
}

export interface Identity {
  readonly index: number;
  readonly key: HDAccount;
  readonly owner: Address;
  readonly account: Address;
}

export function identityOf(mock: MockXo, index: number): Identity {
  const key = ownerOf(mock, index);
  const owner = getAddress(key.address);
  return { index, key, owner, account: deriveAccount(owner) };
}

// ---- a switch profile ---------------------------------------------------------------------------------------------------------------------------

export interface MatrixProfile {
  readonly name: string;
  readonly base: "pessimistic" | "optimistic";
  // A single switch moved off the pessimistic profile (the "each flipped alone" runs).
  readonly flip?: { readonly name: MockSwitchName; readonly value: string };
}

export function applyProfile(mock: MockXo, profile: MatrixProfile): void {
  mock.setProfile(profile.base);
  if (profile.flip !== undefined) mock.switches.setByName(profile.flip.name, profile.flip.value);
}

// The two profiles and every single flip from the pessimistic profile to every other value of each switch.
export function allProfiles(): MatrixProfile[] {
  const out: MatrixProfile[] = [
    { name: "pessimistic", base: "pessimistic" },
    { name: "optimistic", base: "optimistic" },
  ];
  for (const definition of MOCK_SWITCHES) {
    for (const value of definition.values) {
      if (value === definition.pessimistic) continue;
      out.push({ name: `${definition.name}=${value}`, base: "pessimistic", flip: { name: definition.name, value } });
    }
  }
  return out;
}

// ---- driving the flows ---------------------------------------------------------------------------------------------------------------------------

export interface Funded {
  readonly microUsd: bigint;
}

// XO credits an account's order-book balance. The funding journey does this through the real Hyperlane path;
// the order journeys take it as given.
export function creditBalance(mock: MockXo, account: Address, micro: bigint): void {
  mock.state.setBalance(account, { balanceMicro: micro, allowanceMicro: micro, cashBalanceMicro: micro });
}

// Deploys the account on the local chain the way XO's own app would (not through this relay), so the flows after
// the deploy can be exercised in a profile where the relay's own deploy path is refused.
export async function deployAsXoApp(mock: MockXo, index: number): Promise<void> {
  const { deployOwner } = await import("../mock-xo/testing.js");
  await deployOwner(mock, index, { enableTrading: true });
}

export async function signAndSubmitUserop(stack: Stack, tool: string, who: Identity, prepared: Step, submitArgs: Json = {}, form: SignForm = "as_intent"): Promise<Step> {
  const intent = intentOf(prepared);
  assert.ok(intent !== undefined, `${tool} prepare returned no signing intent: ${prepared.text.slice(0, 300)}`);
  const signature = await signIntent(who.key, intent, form);
  const id = preparedIdOf(prepared);
  stack.history.signed.push({ preparedId: id, digest: String(intent.rawSigningPayloadHex ?? "typed"), by: who.owner });
  return stack.call(tool, { step: "submit", prepared_id: id, signature, ...submitArgs });
}

// ---- scans: secrets, files ----------------------------------------------------------------------------------------------------------------------

export function secretForms(value: string): string[] {
  const out = new Set<string>();
  const add = (text: string): void => {
    out.add(text);
    out.add(text.toLowerCase());
  };
  add(value);
  add(JSON.stringify(value).slice(1, -1));
  add(Buffer.from(value).toString("hex"));
  add(encodeURIComponent(value));
  if (value.startsWith("0x")) add(value.slice(2));
  // Base64 of the value wherever it sits inside a larger blob: the three byte alignments, each cut to the characters
  // that do not depend on the neighbouring bytes.
  const stable = (encoded: string, dropLeading: number): string => encoded.replace(/=+$/, "").slice(dropLeading, -1);
  for (const [pad, dropLeading] of [["", 0], ["x", 2], ["xx", 3]] as const) {
    const bytes = Buffer.from(pad + value);
    add(stable(bytes.toString("base64"), dropLeading));
    add(stable(bytes.toString("base64url"), dropLeading));
  }
  add(Buffer.from(value).toString("base64"));
  add(Buffer.from(value).toString("base64url"));
  return [...out].filter((entry) => entry.length >= 8);
}

export function findSecrets(label: string, haystack: string | Buffer, secrets: Readonly<Record<string, string>>): string[] {
  const text = (typeof haystack === "string" ? Buffer.from(haystack) : haystack).toString("latin1");
  const lowered = text.toLowerCase();
  const found: string[] = [];
  for (const [name, value] of Object.entries(secrets)) {
    for (const variant of secretForms(value)) {
      if (text.includes(variant) || lowered.includes(variant.toLowerCase())) {
        found.push(`${label} holds ${name} (${variant.slice(0, 6)}...)`);
        break;
      }
    }
  }
  return found;
}

export async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      const info = await stat(path).catch(() => undefined);
      if (info === undefined) continue;
      if (info.isDirectory()) await visit(path);
      else out.push(path);
    }
  };
  await visit(root);
  return out;
}

// Every secret this world has: the relay key, the master secret, each triplet the mock minted (key, secret,
// passphrase) and each HMAC signature the relay sent.
export function secretsOf(stack: Stack): Record<string, string> {
  const secrets: Record<string, string> = { relay_key: TEST_RELAY_KEY, master_secret: TEST_MASTER_SECRET };
  let n = 0;
  for (const credential of stack.mock.write.credentials) {
    n += 1;
    secrets[`triplet_${String(n)}_api_key`] = credential.apiKey;
    secrets[`triplet_${String(n)}_secret`] = credential.secret;
    secrets[`triplet_${String(n)}_passphrase`] = credential.passphrase;
  }
  n = 0;
  for (const signature of stack.history.wire.sentSecrets) {
    n += 1;
    secrets[`hmac_signature_${String(n)}`] = signature;
  }
  return secrets;
}

export async function scanForSecrets(stack: Stack): Promise<string[]> {
  const secrets = secretsOf(stack);
  const found: string[] = [];
  for (const [index, step] of stack.history.steps.entries()) {
    found.push(...findSecrets(`tool result ${String(index)} (${step.tool}) text`, step.text, secrets));
    found.push(...findSecrets(`tool result ${String(index)} (${step.tool}) structured`, JSON.stringify(step.structured ?? {}), secrets));
  }
  // The plugin's side of the wire: what the relay answered, headers included (the relay key is only ever REQUESTED).
  for (const [index, entry] of stack.history.relayWire.entries()) {
    found.push(...findSecrets(`relay response ${String(index)} (${entry.url}) body`, entry.responseBody, secrets));
    found.push(...findSecrets(`relay response ${String(index)} (${entry.url}) headers`, entry.responseHeaders, secrets));
  }
  found.push(...findSecrets("plugin audit events", JSON.stringify(stack.history.audit, (_key, value) => (typeof value === "bigint" ? value.toString() : value)), secrets));
  // The relay's data directory: audit log, alerts, state journal, the encrypted vault. Nothing may hold a plaintext secret.
  for (const dir of stack.history.dirs) {
    for (const file of await walkFiles(dir)) {
      const content = await readFile(file).catch(() => undefined);
      if (content === undefined) continue;
      found.push(...findSecrets(`file ${file.slice(dir.length)}`, content, secrets));
    }
  }
  return found;
}

export function stableCodes(): ReadonlySet<string> {
  return STABLE_CODES;
}

// The tool-level codes that are not relay errors (the plugin's own refusals and the happy-path words).
const STABLE_CODES: ReadonlySet<string> = new Set([
  "prepared",
  "dry_run",
  "submitted",
  "accepted",
  "pending",
  "rejected",
  "ambiguous",
  "cancelled",
  "not_found",
  "listed",
  "status",
  "found",
  "stored",
  "included",
  "failed",
  "unknown",
  "done",
  "monitoring",
  "proposed",
  "ok",
]);


// ---- the flows -------------------------------------------------------------------------------------------------------------------------------------
//
// Each flow is what an agent with PayBox does for one capability. A flow never asserts that it succeeds (in the
// pessimistic profile most of them are refused, and that is the right answer); it returns every step so the
// caller can say what the profile should have done, and `checkInvariants` judges what must hold regardless.

export type Flow = Record<string, Step | undefined>;

const PROPOSAL_KEY = "io.paybox/transactionProposal";

export function isTerminalUserop(step: Step | undefined): boolean {
  const state = (step?.structured?.["status"] as Json | undefined)?.["state"];
  return state === "included" || state === "failed" || state === "rejected";
}

export async function flowAccount(stack: Stack, who: Identity): Promise<Flow> {
  return { account: await stack.call("xo_account", { owner: who.owner }) };
}

// xo_deploy_enable_trading: prepare, sign, submit, then follow the status for a bounded number of looks.
export async function flowDeploy(stack: Stack, who: Identity, form: SignForm = "as_intent"): Promise<Flow> {
  const flow: Flow = {};
  flow["prepare"] = await stack.call("xo_deploy_enable_trading", { step: "prepare", owner: who.owner });
  if (intentOf(flow["prepare"]) === undefined) return flow;
  flow["submit"] = await signAndSubmitUserop(stack, "xo_deploy_enable_trading", who, flow["prepare"], {}, form);
  const hash = flow["submit"].structured?.["user_op_hash"];
  if (typeof hash === "string") {
    for (let look = 0; look < 3; look += 1) {
      await stack.mock.advance(10);
      flow["status"] = await stack.call("xo_userop_status", { user_op_hash: hash });
      if (isTerminalUserop(flow["status"])) break;
    }
  }
  return flow;
}

// XO's own app deploys and registers the account (what a user does in the XO UI), so the flows after the deploy
// can be driven in a profile whose relay deploy path is refused. Nothing here goes through the relay.
export async function ensureDeployedLikeXoApp(stack: Stack, who: Identity): Promise<boolean> {
  const chains = stack.mock.chains;
  if (!(await chains.isDeployed(who.account))) await deployAsXoApp(stack.mock, who.index);
  stack.mock.state.forceRegistered(who.account);
  return chains.isDeployed(who.account);
}

export async function flowConnect(stack: Stack, who: Identity): Promise<Flow> {
  const flow: Flow = {};
  flow["prepare"] = await stack.call("xo_connect", { step: "prepare", owner: who.owner });
  const intent = intentOf(flow["prepare"]);
  if (intent === undefined) return flow;
  const signature = await signIntent(who.key, intent);
  const id = preparedIdOf(flow["prepare"]);
  stack.history.signed.push({ preparedId: id, digest: "auth", by: who.owner });
  flow["submit"] = await stack.call("xo_connect", { step: "submit", prepared_id: id, signature });
  return flow;
}

export interface FundFlowOptions {
  readonly amountUsd?: string;
  // The owner's wallet actually executes the proposals on Base (mock.hyperlane) and the tool follows the delivery.
  readonly execute?: boolean;
}

export async function flowFund(stack: Stack, who: Identity, options: FundFlowOptions = {}): Promise<Flow> {
  const { sendFunding, USD } = await import("../relay-funding-helpers.js");
  const amount = options.amountUsd ?? "2";
  const flow: Flow = {};
  // The owner's Base wallet holds USDC (the mock's emulation of the user's PayBox wallet on Base).
  stack.mock.hyperlane.setBaseBalance(who.owner, 100n * USD);
  flow["first"] = await stack.call("xo_fund_account", { owner: who.owner, amount_usd: amount });
  // The proposal is returned alone under PayBox's key, so the funding id is read from the text.
  const relayPart = flow["first"].structured?.["relay"] as Json | undefined;
  const fundingId = typeof relayPart?.["funding_id"] === "string" ? relayPart["funding_id"] : /funding_id ([0-9a-f]{32})/.exec(flow["first"].text)?.[1];
  if (options.execute !== true || flow["first"].structured?.[PROPOSAL_KEY] === undefined || fundingId === undefined) return flow;
  const sent = await sendFunding(stack.mock, who.owner, BigInt(Math.round(Number(amount) * 1_000_000)));
  assert.equal(USD, 1_000_000n);
  const follow: Json = { owner: who.owner, amount_usd: amount, tx_hash: sent.hash, funding_id: fundingId, xo_balance_before_usd: "0" };
  flow["dispatched"] = await stack.call("xo_fund_account", follow);
  await stack.mock.advance(40);
  flow["settled"] = await stack.call("xo_fund_account", follow);
  return flow;
}

export interface OrderFlowOptions {
  readonly marketSeed?: string;
  readonly outcome?: "yes" | "no";
  readonly side?: "BUY" | "SELL";
  readonly price?: string;
  readonly shares?: string;
  readonly form?: SignForm;
  readonly cancel?: boolean;
}

export async function flowOrder(stack: Stack, who: Identity, options: OrderFlowOptions = {}): Promise<Flow> {
  const { marketTokens } = await import("../mock-xo/traders.js");
  const tokens = marketTokens(stack.mock, options.marketSeed ?? "clob-active-a");
  const flow: Flow = {};
  flow["prepare"] = await stack.call("xo_prepare_order", {
    owner: who.owner,
    token_id: options.outcome === "no" ? tokens.no : tokens.yes,
    side: options.side ?? "BUY",
    price: options.price ?? "0.4",
    shares: options.shares ?? "10",
  });
  const intent = intentOf(flow["prepare"]);
  if (intent === undefined) return flow;
  const signature = await signIntent(who.key, intent, options.form ?? "as_intent");
  const id = preparedIdOf(flow["prepare"]);
  stack.history.signed.push({ preparedId: id, digest: String(intent.rawSigningPayloadHex ?? "typed"), by: who.owner });
  flow["submit"] = await stack.call("xo_submit_order", { prepared_id: id, signature });
  const hash = flow["submit"].structured?.["order_hash"];
  if (typeof hash !== "string") return flow;
  flow["status"] = await stack.call("xo_order_status", { order_hash: hash });
  flow["list"] = await stack.call("xo_list_orders", { owner: who.owner });
  if (options.cancel !== false) flow["cancel"] = await stack.call("xo_cancel_order", { owner: who.owner, order_hash: hash });
  return flow;
}

export function conditionId(seed: string): Hex {
  return keccak256(stringToHex(seed));
}

// The market is resolved on chain (the stub CTF's test-only setter), as a resolution would leave it.
export async function resolveOnChain(mock: MockXo, id: Hex): Promise<void> {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  await chain.sendFrom(chain.bundler.address, CONDITIONAL_TOKENS, encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "stubSetPayoutDenominator", args: [id, 1n] }));
}

export async function flowRedeem(stack: Stack, who: Identity, seed = "matrix-redeem"): Promise<Flow> {
  const id = conditionId(seed);
  await resolveOnChain(stack.mock, id);
  const flow: Flow = {};
  flow["prepare"] = await stack.call("xo_redeem", { step: "prepare", owner: who.owner, condition_ids: [id] });
  if (intentOf(flow["prepare"]) === undefined) return flow;
  flow["submit"] = await signAndSubmitUserop(stack, "xo_redeem", who, flow["prepare"]);
  const hash = flow["submit"].structured?.["user_op_hash"];
  if (typeof hash === "string") {
    await stack.mock.advance(10);
    flow["status"] = await stack.call("xo_userop_status", { user_op_hash: hash });
  }
  return flow;
}

// xo_withdraw prepares; xo_submit_userop sends. The prepared item is a user operation (kind userop).
export async function flowWithdraw(stack: Stack, who: Identity, amountUsd = "1"): Promise<Flow> {
  const { mintUsdce } = await import("../relay-userops-helpers.js");
  await mintUsdce(stack.mock, who.account, 5_000_000n);
  const flow: Flow = {};
  flow["prepare"] = await stack.call("xo_withdraw", { owner: who.owner, amount_usd: amountUsd });
  const intent = flow["prepare"].structured?.["request_wallet_sign_intent"] as IntentLike | undefined;
  const id = flow["prepare"].structured?.["prepared_id"];
  if (intent === undefined || typeof id !== "string") return flow;
  const signature = await signIntent(who.key, intent);
  stack.history.signed.push({ preparedId: id, digest: String(intent.rawSigningPayloadHex ?? "typed"), by: who.owner });
  flow["submit"] = await stack.call("xo_submit_userop", { prepared_id: id, signature });
  return flow;
}

// ---- the invariants ---------------------------------------------------------------------------------------------------------------------------------------

export interface InvariantOptions {
  // Which write paths are switched on at BOTH ends and with the kill switch off. Default: derived from the stack.
  readonly writable?: { readonly userop: boolean; readonly trading: boolean; readonly funding: boolean; readonly withdraw: boolean };
  // I6 (flags and the kill switch) applies only from this wire sequence number and step index on: a switch flipped
  // in the middle of a journey says nothing about what happened before it.
  readonly gatesFrom?: { readonly wireSeq: number; readonly step: number };
  // The caps the run is held to. Default: the product defaults ($10 per order, $50 per day).
  readonly caps?: { readonly order: bigint; readonly day: bigint };
  // Skip the leak scan (it reads the whole data directory); the leak test runs it once per journey.
  readonly skipScan?: boolean;
}

export function writableOf(stack: Stack): NonNullable<InvariantOptions["writable"]> {
  const relayOn = stack.options.relayOn ?? JOURNEY_FLAGS;
  const pluginOn = stack.options.pluginOn ?? relayOn;
  const live = stack.options.relayKill !== true && stack.options.pluginKill !== true;
  const both = (flag: WriteFlagName): boolean => live && relayOn.includes(flag) && pluginOn.includes(flag);
  return { userop: both("ENABLE_USEROP_SUBMIT"), trading: both("ENABLE_TRADING"), funding: both("ENABLE_FUNDING"), withdraw: both("ENABLE_WITHDRAW") };
}

const VAGUE_CODES: ReadonlySet<string> = new Set(["internal", "unknown", "error", "failed_unknown"]);

const OUTCOME_OK: ReadonlySet<string> = new Set(["prepared", "dry_run", "submitted", "accepted", "pending", "rejected", "ambiguous", "refused", "cancelled", "not_found", "listed", "status", "done", "monitoring", "connected"]);

// One list of violations; empty means every invariant held. Each message names the invariant and the evidence.
export async function checkInvariants(stack: Stack, options: InvariantOptions = {}): Promise<string[]> {
  const violations: string[] = [];
  const { history, mock } = stack;
  const writable = options.writable ?? writableOf(stack);
  const preparedItems = history.prepared.filter((item) => !item.dryRun);
  const signedIds = new Set(history.signed.map((entry) => entry.preparedId));
  const opsByHash = new Map(preparedItems.filter((item) => item.userOpHash !== undefined).map((item) => [item.userOpHash as string, item]));
  const ordersByHash = new Map(preparedItems.filter((item) => item.orderHash !== undefined).map((item) => [item.orderHash as string, item]));

  // I1. Nothing is sent that does not match a prepared and signed item.
  const bundlerSends = history.wire.calls.filter((call) => call.kind === "bundler_send");
  for (const call of bundlerSends) {
    const item = call.userOpHash === undefined ? undefined : opsByHash.get(call.userOpHash);
    if (item === undefined) violations.push(`I1 a user operation (${String(call.userOpHash)}) went to the bundler but no prepared item names it`);
    else {
      if (!signedIds.has(item.preparedId)) violations.push(`I1 user operation ${String(call.userOpHash)} was sent but its prepared item was never signed`);
      if (call.sender !== undefined && call.sender !== item.account.toLowerCase()) violations.push(`I1 user operation ${String(call.userOpHash)} was sent for ${call.sender}, not for the prepared account ${item.account}`);
      // What the owner was asked to sign is the hash of the operation that went out, not some other digest.
      const signedDigest = history.signed.find((entry) => entry.preparedId === item.preparedId)?.digest;
      if (signedDigest !== undefined && /^0x[0-9a-fA-F]{64}$/.test(signedDigest) && signedDigest.toLowerCase() !== call.userOpHash) violations.push(`I1 the owner signed ${signedDigest} but the operation that was sent hashes to ${String(call.userOpHash)}`);
    }
  }
  const orderPosts = history.wire.calls.filter((call) => call.kind === "order_post");
  for (const call of orderPosts) {
    const item = call.orderHash === undefined ? undefined : ordersByHash.get(call.orderHash);
    if (item === undefined) violations.push(`I1 an order (${String(call.orderHash)}) was posted to the order book but no prepared item names it`);
    else if (!signedIds.has(item.preparedId)) violations.push(`I1 order ${String(call.orderHash)} was posted but its prepared item was never signed`);
  }
  for (const hash of mock.write.orders.keys()) {
    if (!ordersByHash.has(hash.toLowerCase())) violations.push(`I1 the order book holds an order (${hash}) that no prepared item names`);
  }
  for (const call of history.wire.calls.filter((entry) => entry.kind === "order_delete")) {
    const target = call.orderHash;
    const byId = target !== undefined && /^[0-9]+$/.test(target) ? mock.write.orderById(target)?.hash.toLowerCase() : target;
    if (byId === undefined || !ordersByHash.has(byId)) violations.push(`I1 a cancel (${String(target)}) was sent for an order that no prepared item names`);
  }
  const authSigned = history.prepared.filter((item) => item.kind === "auth" && signedIds.has(item.preparedId));
  const creates = history.wire.calls.filter((call) => call.kind === "api_key_create");
  if (creates.length > 0 && authSigned.length === 0) violations.push("I1 an XO API key was created although no connect item was prepared and signed");

  // I3. No double send for any prepared id.
  const sendsByOp = new Map<string, WireCall[]>();
  for (const call of bundlerSends) sendsByOp.set(String(call.userOpHash), [...(sendsByOp.get(String(call.userOpHash)) ?? []), call]);
  for (const [hash, calls] of sendsByOp) {
    // The same operation can be prepared again after the bundler REFUSED it (same content, same nonce, same hash, a new
    // prepared item). Anything else is a double send: an earlier send that was accepted, or whose answer was lost.
    const refusedForSure = (call: WireCall): boolean => call.status === 200 && !call.accepted;
    const items = preparedItems.filter((item) => item.userOpHash === hash && signedIds.has(item.preparedId)).length;
    calls.forEach((call, index) => {
      if (index > 0 && !calls.slice(0, index).every(refusedForSure)) violations.push(`I3 user operation ${hash} was sent again (send ${String(index + 1)}) after an earlier send that was accepted or whose answer was lost`);
    });
    if (calls.length > Math.max(1, items)) violations.push(`I3 user operation ${hash} was sent ${String(calls.length)} times for ${String(items)} signed prepared item(s)`);
  }
  const postsByOrder = new Map<string, WireCall[]>();
  for (const call of orderPosts) postsByOrder.set(String(call.orderHash), [...(postsByOrder.get(String(call.orderHash)) ?? []), call]);
  for (const [hash, calls] of postsByOrder) {
    if (calls.filter((call) => call.accepted).length > 1) violations.push(`I3 order ${hash} was accepted ${String(calls.filter((call) => call.accepted).length)} times`);
    // The one allowed re-post is the wire-prefix swap after an explicit 4xx refusal.
    const early = calls.slice(0, -1);
    if (calls.length > 2 || early.some((call) => call.status < 400 || call.status >= 500)) violations.push(`I3 order ${hash} was posted ${String(calls.length)} times (statuses ${calls.map((call) => call.status).join(",")}); only a prefix swap after a 4xx is allowed`);
  }
  const keysByAccount = new Map<string, number>();
  for (const credential of mock.write.credentials) keysByAccount.set(credential.account, (keysByAccount.get(credential.account) ?? 0) + 1);
  for (const [account, count] of keysByAccount) if (count > 1) violations.push(`I3 ${String(count)} XO API keys exist for account ${account}; at most one may ever be minted`);
  if (creates.length > keysByAccount.size + 0 && creates.filter((call) => call.accepted).length > keysByAccount.size) violations.push("I3 more key-creating requests were accepted than keys exist");

  // I2. Caps, across all flows of the day.
  const caps = options.caps ?? { order: ORDER_CAP_ATOMIC, day: DAY_CAP_ATOMIC };
  const ledger = stack.relay.services.ledger;
  if (ledger !== undefined) {
    const accounts = new Set(ledger.list().map((reservation) => reservation.account));
    for (const account of accounts) {
      const held = ledger.list({ account }).filter((reservation) => reservation.state !== "released");
      const byDay = new Map<string, bigint>();
      let fundedLifetime = 0n;
      for (const reservation of held) {
        if (reservation.kind === "spend") {
          byDay.set(reservation.day, (byDay.get(reservation.day) ?? 0n) + reservation.amountAtomic);
          if (reservation.category === "order" && reservation.amountAtomic > caps.order) violations.push(`I2 order reservation ${reservation.id} holds ${reservation.amountAtomic} (cap ${caps.order})`);
        } else {
          fundedLifetime += reservation.amountAtomic;
        }
      }
      for (const [day, total] of byDay) if (total > caps.day) violations.push(`I2 ${day} spend of ${total} on ${account} is above the daily cap ${caps.day}`);
      if (fundedLifetime > FUNDING_TEST_CAP_ATOMIC && stack.relay.services.capabilities?.state("FU9") !== "yes") violations.push(`I2 funding reservations total ${fundedLifetime} on ${account}, above the test cap ${FUNDING_TEST_CAP_ATOMIC}`);
    }
  }

  // I5. No funding of an undeployed account: no proposal was handed out for one, and no money is reserved for one.
  for (const step of history.steps) {
    if (step.tool !== "xo_fund_account" || step.structured?.[PROPOSAL_KEY] === undefined) continue;
    if (step.deployedBefore === false) violations.push(`I5 xo_fund_account handed out a Base proposal for an undeployed account (${String(step.args["owner"])})`);
  }
  if (ledger !== undefined) {
    for (const reservation of ledger.list().filter((entry) => entry.kind === "fund" && entry.state !== "released")) {
      const deployed = await mock.chains.isDeployed(`0x${reservation.account.replace(/^0x/, "")}` as Address);
      if (!deployed) violations.push(`I5 funding reservation ${reservation.id} is held for an account that is not deployed (${reservation.account})`);
    }
  }

  // I6. No write succeeds with its flag off (or the kill switch on).
  const fromSeq = options.gatesFrom?.wireSeq ?? 0;
  const fromStep = options.gatesFrom?.step ?? 0;
  const late = history.wire.calls.filter((call) => call.seq >= fromSeq);
  const lateSteps = history.steps.slice(fromStep);
  const mustBeNone = (label: string, count: number): void => {
    if (count > 0) violations.push(`I6 ${label}: ${String(count)} upstream write(s) happened although the flag is off at one end or the kill switch is on`);
  };
  if (!writable.userop) mustBeNone("ENABLE_USEROP_SUBMIT", late.filter((call) => call.kind === "bundler_send").length);
  if (!writable.trading) mustBeNone("ENABLE_TRADING", late.filter((call) => call.kind === "order_post" || call.kind === "api_key_create" || call.kind === "order_delete").length);
  if (!writable.funding && fromStep === 0) {
    const funded = ledger?.list().filter((entry) => entry.kind === "fund").length ?? 0;
    mustBeNone("ENABLE_FUNDING", funded);
  }
  for (const step of lateSteps) {
    if (!writable.withdraw && step.tool === "xo_withdraw" && step.outcome === "prepared") violations.push("I6 xo_withdraw prepared an item with ENABLE_WITHDRAW off at one end or the kill switch on");
    if (!writable.userop && (step.outcome === "submitted") && ["xo_deploy_enable_trading", "xo_redeem", "xo_revoke_trading", "xo_submit_userop"].includes(step.tool)) violations.push(`I6 ${step.tool} reported a submit with ENABLE_USEROP_SUBMIT off or the kill switch on`);
    if (!writable.trading && (step.outcome === "accepted" || step.outcome === "cancelled" || step.outcome === "pending")) violations.push(`I6 ${step.tool} reported ${step.outcome} with ENABLE_TRADING off or the kill switch on`);
  }

  // I7. Every failure is an actionable, stable answer.
  for (const step of history.steps) {
    const out = step.structured;
    // xo_account is the v0.1 read tool: its success shape has no code or next_action. Its failures do.
    if (step.tool === "xo_account" && !step.isError) continue;
    // A funding proposal is returned alone under PayBox's key, as PayBox requires.
    if (step.tool === "xo_fund_account" && !step.isError && out?.[PROPOSAL_KEY] !== undefined) continue;
    if (out === undefined) {
      violations.push(`I7 ${step.tool} returned no structured result (isError ${String(step.isError)}): ${step.text.slice(0, 120)}`);
      continue;
    }
    const code = out["code"];
    const message = out["message"];
    const next = out["next_action"];
    if (typeof code !== "string" || code === "") violations.push(`I7 ${step.tool} answered without a code`);
    if (typeof message !== "string" || message.trim().length < 10) violations.push(`I7 ${step.tool} answered (${String(code)}) without a message that says what happened`);
    const failing = step.isError || ["refused", "rejected", "ambiguous", "pending"].includes(String(step.outcome));
    const hasNext = (typeof next === "string" && next.trim().length >= 10) || /(^|\n)Next:|Check again/.test(step.text);
    if (failing && !hasNext) violations.push(`I7 ${step.tool} refused (${String(code)}) without saying what to do next`);
    else if (!failing && typeof next !== "string" && !hasNext && !["found", "done", "credited", "delivered", "dispatched", "connected", "listed", "status"].includes(String(code)) && step.outcome !== "done") violations.push(`I7 ${step.tool} answered (${String(code)}) without a next_action`);
    if (step.outcome !== undefined && !OUTCOME_OK.has(step.outcome)) violations.push(`I7 ${step.tool} answered with an unknown outcome ${step.outcome}`);
    if (step.isError) {
      if (typeof code === "string" && VAGUE_CODES.has(code)) violations.push(`I9 ${step.tool} refused with the vague code ${code}: ${String(message)}`);
      if (!["refused", "rejected", "ambiguous", "pending"].includes(String(step.outcome))) violations.push(`I7 ${step.tool} isError with outcome ${String(step.outcome)}`);
    }
  }

  // I10. Every prepared item the relay handed the plugin can be REBUILT from its decoded block: the digest, the inner
  // hash tag, the order terms and every summary line come out the same (R1, R2). A relay that sent a block that does
  // not rebuild to what it asked the owner to sign would be caught here, on whatever journey produced it.
  for (const [index, entry] of history.relayWire.entries()) {
    if (entry.status !== 200 || !/\/v1\/(?:order|userop|auth)\/prepare$/.test(entry.url)) continue;
    let body: unknown;
    try {
      body = JSON.parse(entry.responseBody);
    } catch {
      continue;
    }
    const verdict = verifyPreparedLocal(body);
    if (!verdict.ok) violations.push(`I10 the prepared item answered by ${entry.url} (relay answer ${String(index)}) does not rebuild from its decoded block: ${verdict.status} at ${verdict.field}: ${verdict.reason}`);
  }

  // The mock itself never broke.
  if (mock.internalErrors().length > 0) violations.push(`the mock threw: ${mock.internalErrors().map((error) => error.message).join("; ")}`);

  // I8. No secret anywhere a reader could see it.
  if (options.skipScan !== true) violations.push(...(await scanForSecrets(stack)).map((line) => `I8 ${line}`));
  return violations;
}

// Credentials survive: every key the mock minted for an account is in the relay's vault, readable, and the tool
// reports credentials present. Call it after every credential step and after every restart.
export async function checkCredentialsKept(stack: Stack): Promise<string[]> {
  const violations: string[] = [];
  const secrets = stack.relay.services.secrets;
  for (const credential of stack.mock.write.credentials) {
    if (secrets === undefined) {
      violations.push("I4 the relay has no credential store although a key was minted");
      continue;
    }
    const stored = await secrets.get(`0x${credential.account}`, TRIPLET_SECRET_NAME).catch(() => undefined);
    if (stored === undefined) {
      violations.push(`I4 the key minted for 0x${credential.account} is not in the relay's vault`);
      continue;
    }
    const parsed = JSON.parse(stored.reveal()) as { apiKey?: string };
    if (!stack.mock.write.credentials.some((entry) => entry.apiKey === parsed.apiKey && entry.account === credential.account)) violations.push(`I4 the stored key for ${credential.account} is not the one XO minted`);
  }
  return violations;
}

// Findings this suite has already reported (each is in the task result's open_issues with a reproduction). They are
// counted and printed at the end of the run instead of failing every test that touches them; a violation that matches
// none of these fails the test. A fixed finding stops matching, and the pattern should then be deleted.
export interface KnownFinding {
  readonly id: string;
  readonly pattern: RegExp;
  readonly title: string;
}

export const KNOWN_FINDINGS: readonly KnownFinding[] = [
  { id: "F1", pattern: /^I7 xo_(withdraw|fund_account) refused \(\w+\) without saying what to do next$/, title: "xo_withdraw and xo_fund_account refusals carry no next_action for some codes" },
  { id: "F3", pattern: /^I9 \w+ refused with the vague code internal: The relay failed unexpectedly\. Nothing was sent\.$/, title: "an unexpected failure after an irreversible upstream step is reported as 'Nothing was sent'" },
];

const seenKnown = new Map<string, number>();

after(() => {
  if (seenKnown.size === 0) return;
  console.log(`profile-matrix: known findings seen in this file: ${[...seenKnown].map(([id, count]) => `${id} x${String(count)}`).join(", ")}`);
});

export function splitKnown(violations: readonly string[]): { readonly unknown: string[]; readonly known: string[] } {
  const unknown: string[] = [];
  const known: string[] = [];
  for (const violation of violations) {
    const match = KNOWN_FINDINGS.find((finding) => finding.pattern.test(violation));
    if (match === undefined) unknown.push(violation);
    else {
      known.push(violation);
      seenKnown.set(match.id, (seenKnown.get(match.id) ?? 0) + 1);
    }
  }
  return { unknown, known };
}

export function assertNoViolations(violations: readonly string[], context: string): void {
  const { unknown } = splitKnown(violations);
  assert.deepEqual(unknown, [], `${context}: ${String(unknown.length)} invariant violation(s)\n  ${unknown.join("\n  ")}`);
}

export interface JourneyOptions {
  readonly fundExecute?: boolean;
  readonly balanceMicro?: bigint;
  readonly skip?: ReadonlySet<string>;
}

// The whole thing an agent does for one owner, in order. Each flow is independent of the others' success: the
// XO app deploys the account when the relay's own deploy path is refused, and the order book is credited when the
// deposit path is not credited, so every later flow still gets exercised in every profile.
export async function fullJourney(stack: Stack, who: Identity, options: JourneyOptions = {}): Promise<Record<string, Flow>> {
  const skip = options.skip ?? new Set<string>();
  const flows: Record<string, Flow> = {};
  if (!skip.has("account")) flows["account"] = await flowAccount(stack, who);
  // Funding while the account does not exist yet: in every profile this must be refused, with no proposal.
  if (!skip.has("fundEarly")) flows["fundEarly"] = await flowFund(stack, who, { execute: false });
  if (!skip.has("deploy")) flows["deploy"] = await flowDeploy(stack, who);
  await ensureDeployedLikeXoApp(stack, who);
  if (!skip.has("connect")) flows["connect"] = await flowConnect(stack, who);
  if (!skip.has("fund")) flows["fund"] = await flowFund(stack, who, { execute: options.fundExecute !== false });
  creditBalance(stack.mock, who.account, options.balanceMicro ?? 100_000_000n);
  if (!skip.has("order")) flows["order"] = await flowOrder(stack, who);
  if (!skip.has("redeem")) flows["redeem"] = await flowRedeem(stack, who);
  if (!skip.has("withdraw")) flows["withdraw"] = await flowWithdraw(stack, who);
  return flows;
}

export function summarize(flows: Record<string, Flow>): string {
  return Object.entries(flows)
    .map(([name, flow]) => `${name}[${Object.entries(flow).map(([label, step]) => `${label}:${step?.code ?? "-"}`).join(" ")}]`)
    .join("  ");
}

// ---- the profile matrix ---------------------------------------------------------------------------------------------------------------------------------

export interface MatrixOptions {
  readonly label: string;
  readonly transport: Transport;
  readonly shard: number;
  readonly shards: number;
  // Switches left out of this run (their own tests drive them).
  readonly leaveOut?: readonly string[];
}

const code = (flow: Flow | undefined, label: string): string | undefined => flow?.[label]?.code;

// What a profile is KNOWN to do, written out from the switch values and not read from the relay. Only the two named
// profiles and the flips whose effect is understood are pinned; every other flip is judged by the invariants alone.
export function expectProfile(profile: MatrixProfile, flows: Record<string, Flow>, stack: Stack): void {
  const tag = `${profile.name} over ${stack.transport}`;
  const { mock } = stack;
  const orderAccepted = code(flows["order"], "submit") === "accepted";
  const early = flows["fundEarly"]?.["first"];
  if (early !== undefined) {
    assert.equal(early.isError, true, `${tag}: funding an account that does not exist is refused (${early.text.slice(0, 160)})`);
    assert.equal(early.structured?.[PROPOSAL_KEY], undefined, `${tag}: no Base proposal for an undeployed account`);
  }
  if (profile.name === "optimistic") {
    assert.equal(code(flows["deploy"], "prepare"), "prepared", tag);
    assert.equal(code(flows["deploy"], "submit"), "submitted", tag);
    assert.equal(code(flows["deploy"], "status"), "included", tag);
    assert.equal(code(flows["connect"], "submit"), "connected", tag);
    assert.equal(code(flows["fund"], "settled"), "credited", tag);
    assert.equal(code(flows["order"], "submit"), "accepted", tag);
    assert.equal(code(flows["order"], "cancel"), "cancelled", tag);
    assert.equal(code(flows["redeem"], "status"), "included", tag);
    assert.equal(code(flows["withdraw"], "submit"), "submitted", tag);
    assert.equal(mock.write.credentials.length, 1, `${tag}: exactly one XO key was minted`);
    return;
  }
  if (profile.name === "pessimistic") {
    // Nothing the relay cannot prove is attempted: the sponsored deploy, the redeem and the withdrawal are refused
    // before anything is signed, and the gateway that wants the EIP-191 form takes no order.
    assert.equal(code(flows["deploy"], "prepare"), "capability_unknown", tag);
    assert.equal(stack.history.wire.count((call) => call.kind === "bundler_send"), 0, `${tag}: no user operation was sent`);
    assert.equal(code(flows["connect"], "submit"), "connected", tag);
    assert.equal(orderAccepted, false, `${tag}: the order was not placed`);
    assert.equal(mock.write.orders.size, 0, `${tag}: nothing rests on the book`);
    assert.equal(mock.write.credentials.length, 1, `${tag}: exactly one XO key was minted`);
    return;
  }
  const flip = profile.flip;
  if (flip === undefined) return;
  if (flip.name === "order.sig_forms" && flip.value !== "eip191-only") assert.equal(orderAccepted, true, `${tag}: a gateway that takes the raw form takes the order`);
  if (flip.name === "order.sig_forms" && flip.value === "eip191-only") assert.equal(orderAccepted, false, tag);
  if (flip.name === "rpc.access" && flip.value === "open") assert.equal(code(flows["redeem"], "prepare"), "prepared", `${tag}: with the node readable the redeem can be prepared`);
  if (flip.name === "funding.credit" && flip.value === "credited") assert.equal(code(flows["fund"], "settled"), "credited", tag);
  if (flip.name === "funding.credit" && flip.value !== "credited") assert.notEqual(code(flows["fund"], "settled"), "credited", `${tag}: the credit is not claimed before it is seen`);
}

export function registerProfileMatrix(options: MatrixOptions): void {
  const leaveOut = new Set(options.leaveOut ?? ["faults"]);
  const profiles = allProfiles().filter((profile) => profile.flip === undefined || !leaveOut.has(profile.flip.name.split("=")[0] as string));
  const mine = profiles.filter((_, index) => index % options.shards === options.shard);
  describe(`profile matrix over ${options.label} (shard ${String(options.shard + 1)} of ${String(options.shards)})`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });
    for (const profile of mine) {
      harness.it(profile.name, async (mock) => {
        applyProfile(mock, profile);
        const stack = await startStack({ mock, transport: options.transport });
        const who = identityOf(mock, 0);
        const flows = await fullJourney(stack, who);
        const violations = [...(await checkInvariants(stack)), ...(await checkCredentialsKept(stack))];
        assertNoViolations(violations, `${profile.name} over ${stack.transport}`);
        expectProfile(profile, flows, stack);
        // Credentials are never lost: kill the relay as a crash would, start it on the same directory, look again.
        if (mock.write.credentials.length > 0) {
          const again = await stack.restart("crash");
          assertNoViolations(await checkCredentialsKept(again), `${profile.name} after a crash`);
          const account = await again.call("xo_account", { owner: who.owner });
          assert.match(account.text, /credentials present/i, `${profile.name}: after the restart xo_account still reports the credentials`);
        }
      });
    }
  });
}
