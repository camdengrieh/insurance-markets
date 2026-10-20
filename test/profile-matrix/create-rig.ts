import assert from "node:assert/strict";
import { after, describe } from "node:test";

import { type Address, type Hex } from "viem";

import { Secret, relayEndpoint } from "../../src/config.js";
import type { GuardrailConfig } from "../../src/config.js";
import { createEmbeddedRelayClient, createRelayClient } from "../../src/relay/client.js";
import { RELAY_USER_AGENT } from "../../src/relay/contract.js";
import type { AuditEvent } from "../../src/guardrails/audit.js";
import { CANCEL_MARKET_TOOL, PREPARE_CREATE_TOOL, RESPOND_TOOL, SEED_TOOL, SUBMIT_CREATE_TOOL, TRACK_TOOL, registerCreateTools, type CreateToolDeps } from "../../src/tools/create.js";
import { explorerTransportFromHttp } from "../../src/xo/chain/reads.js";
import { XoClient } from "../../src/xo/client.js";
import { XO_PLUGIN_HOSTS } from "../../src/xo/http.js";
import { SEED_CAP_ATOMIC } from "../../src/xo/signing/amounts.js";
import { CREATION_FEE_ATOMIC } from "../../src/xo/chain/constants.js";
import { prettyMetadataText, type MetadataJson } from "../../src/xo/creation/metadata.js";
import { createRelay, type CoreServices, type Relay } from "../../relay/main.js";
import { createEmbeddedRelay, credentialL2Auth } from "../../relay/embedded.js";
import { createCredentialRoutes } from "../../relay/credentials.js";
import { createCreationRuntime, routes as creationRoutes, type CreationRuntime } from "../../relay/creation.js";
import { routes as fundingRoutes } from "../../relay/funding.js";
import { routes as healthRoutes } from "../../relay/health.js";
import { createOrderRoutes } from "../../relay/orders.js";
import { mergeRoutes } from "../../relay/routes.js";
import { createAccountDirectory, loadUserOpOptions, routes as useropRoutes } from "../../relay/userops.js";
import type { TickReport } from "../../relay/watchers.js";
import type { MockXo } from "../mock-xo/server.js";
import { MOCK_SWITCHES } from "../mock-xo/switches.js";
import { useMock } from "../mock-xo/testing.js";
import { connect, type CallResult, type Harness } from "../tools-helpers.js";
import { mintUsdce } from "../relay-userops-helpers.js";
import { TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY } from "../relay-core-helpers.js";
import {
  DAY_CAP_ATOMIC,
  JOURNEY_FLAGS,
  allProfiles,
  applyProfile,
  assertNoViolations,
  identityOf,
  ORDER_CAP_ATOMIC,
  checkCredentialsKept,
  checkInvariants,
  creditBalance,
  ensureDeployedLikeXoApp,
  findSecrets,
  flowConnect,
  flowFund,
  intentOf,
  preparedIdOf,
  recordingRelayFetch,
  secretsOf,
  seededBytes,
  signIntent,
  splitKnown,
  startStack,
  withDeadline,
  type Flow,
  type History,
  type Identity,
  type InvariantOptions,
  type Json,
  type MatrixProfile,
  type RelayHandle,
  type StackOptions,
  type StartRelayInput,
  type Stack,
  type Step,
  type Transport,
  type TransportName,
} from "./helpers.js";
import type { WriteFlagName } from "../../src/relay/flags.js";

// Rig and invariants for the creation acceptance tests (test/profile-matrix/create-*.test.ts). Not a test file.
//
// It builds on helpers.ts without editing it. helpers.ts wires the relay without the creation runtime and registers no
// creation tools, so this file adds both: its own HTTP and embedded transports (the same route table plus
// relay/creation.ts and its watcher, a hosted-file shelf standing in for the creator's web host and for XO's bucket),
// and a second in-memory MCP server holding the six creation tools that talk to the very same relay client. Every
// step lands in the same History the core invariants read (the wire, the prepared items, the signatures), so
// checkInvariants judges the whole run, and the creation-specific invariants below are added on top.
//
// Signatures come from the public Anvil test keys (chain.owner(i)). Nothing here signs or sends anything real.

export const SELF_HOST = "https://markets.acme-research.net/m/";
const XO_BUCKET = "https://storage.googleapis.com/market-metadata-mainnet/";
const USD = 1_000_000n;

export const CREATE_FLAGS: readonly WriteFlagName[] = [...JOURNEY_FLAGS, "XO_ENABLE_CREATE", "ENABLE_SELF_HOSTED_METADATA"];

// The tools whose prepared items are user operations that create, answer or cancel a market.
export const MARKET_OP_TOOLS: ReadonlySet<string> = new Set([PREPARE_CREATE_TOOL, SUBMIT_CREATE_TOOL, RESPOND_TOOL, CANCEL_MARKET_TOOL]);
export const CREATE_TOOLS: readonly string[] = [PREPARE_CREATE_TOOL, SUBMIT_CREATE_TOOL, TRACK_TOOL, RESPOND_TOOL, CANCEL_MARKET_TOOL, SEED_TOOL];

// ---- the transports -------------------------------------------------------------------------------------------------------

export interface CreateExtras {
  readonly creation: CreationRuntime;
  // The shelf: hosted files by URL (the creator's host and XO's bucket). Survives a restart of the relay.
  readonly files: Map<string, string>;
  // Every URL the relay read from outside the mock.
  readonly fetched: string[];
  // One round of the relay's upkeep (expiry sweeps), where the transport has one: the embedded relay's maintain(). The HTTP
  // relay's own timer runs prepared.sweep() and nothing else, which is what `sweepLikeHttp` does.
  readonly maintain?: () => Promise<void>;
}

const EXTRAS = new WeakMap<object, CreateExtras>();
const SHELVES = new Map<string, Map<string, string>>();
const BASE_HOST = { host: "mainnet.base.org", methods: ["GET", "POST"] } as const;

function hostedFetch(files: Map<string, string>, fetched: string[], inner: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(SELF_HOST) && !url.startsWith(XO_BUCKET)) return inner(input, init);
    fetched.push(url);
    const hosted = files.get(url);
    if (hosted === undefined) return new Response("not found", { status: 404 });
    return new Response(hosted, { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function once(run: () => Promise<void>): () => Promise<void> {
  let started: Promise<void> | undefined;
  return () => (started ??= run());
}

function parts(input: StartRelayInput, services: () => CoreServices | undefined, creation: CreationRuntime) {
  const { mock } = input;
  const env: Record<string, string> = {
    XO_RELAY_KEY: TEST_RELAY_KEY,
    RELAY_PORT: "0",
    RELAY_DATA_DIR: input.dir,
    RELAY_ENFORCE_FLAG_FACTS: "0",
    RELAY_SELF_HOST: SELF_HOST,
    ...input.env,
  };
  const useropOptions = loadUserOpOptions(env).options;
  const orders = createOrderRoutes({ random: seededBytes(input.seed), ...input.orderTimings });
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
    extraServices: { userops: useropOptions, l2auth, ...creation.extraServices },
    http: {
      readRate: { capacity: 100_000, refillPerSecond: 100_000 },
      writeRate: { capacity: 100_000, refillPerSecond: 100_000 },
      requestBudgetMs: 120_000,
      hardDeadlineMs: 180_000,
    },
  };
}

function shelfFor(dir: string): { readonly files: Map<string, string>; readonly fetched: string[] } {
  let files = SHELVES.get(dir);
  if (files === undefined) {
    files = new Map();
    SHELVES.set(dir, files);
  }
  return { files, fetched: [] };
}

export const createHttpTransport: Transport = {
  name: "http",
  async start(input) {
    const { mock } = input;
    const { files, fetched } = shelfFor(input.dir);
    const creation = createCreationRuntime({ intervalMs: 0, now: () => mock.clock.nowMs() });
    let ref: Relay | undefined;
    const built = parts(input, () => ref?.services, creation);
    const relay = await createRelay({
      env: built.env,
      masterSecret: new Secret(TEST_MASTER_SECRET),
      kdf: TEST_KDF,
      allowWeakKdf: true,
      isProcessAlive: () => false,
      now: () => mock.clock.nowMs(),
      sleep: async (ms) => {
        mock.clock.advanceMs(Math.max(0, Math.round(ms)));
      },
      fetch: hostedFetch(files, fetched, input.wire.fetch),
      maintenance: false,
      extraUpstreamHosts: [BASE_HOST],
      accounts: createAccountDirectory({ upstream: () => ref?.services.upstream, options: built.useropOptions, now: () => mock.clock.nowMs() }),
      routes: built.routes,
      extraServices: built.extraServices,
      http: built.http,
    });
    ref = relay;
    creation.attach(relay);
    const stop = once(async () => {
      creation.stop();
      await relay.close();
    });
    const drop = once(async () => {
      creation.stop();
      await relay.abandon();
    });
    const handle: RelayHandle = {
      name: "http",
      view: { services: relay.services, flags: relay.flags, url: relay.url },
      dataDir: input.dir,
      makeClient: (config, record) => {
        const endpoint = relayEndpoint(config);
        return createRelayClient({ baseUrl: endpoint?.baseUrl, key: endpoint?.key, fetch: recordingRelayFetch(record) });
      },
      close: stop,
      abandon: drop,
    };
    EXTRAS.set(handle, { creation, files, fetched });
    return handle;
  },
};

export const createEmbeddedTransport: Transport = {
  name: "embedded",
  async start(input) {
    const { mock } = input;
    const { files, fetched } = shelfFor(input.dir);
    const creation = createCreationRuntime({ intervalMs: 0, now: () => mock.clock.nowMs() });
    let services: CoreServices | undefined;
    const built = parts(input, () => services, creation);
    const relay = await createEmbeddedRelay({
      dataDir: input.dir,
      env: { XO_ALLOW_ANY_OWNER: "1", ...built.env },
      clock: () => mock.clock.nowMs(),
      masterSecret: new Secret(TEST_MASTER_SECRET),
      kdf: TEST_KDF,
      allowWeakKdf: true,
      isProcessAlive: () => false,
      sleep: async (ms) => {
        mock.clock.advanceMs(Math.max(0, Math.round(ms)));
      },
      fetch: hostedFetch(files, fetched, input.wire.fetch),
      maintenance: false,
      extraUpstreamHosts: [BASE_HOST],
      userops: built.useropOptions,
      routes: built.routes,
      extraServices: built.extraServices,
      http: built.http,
    });
    services = relay.services;
    creation.attach(relay);
    const stop = once(async () => {
      creation.stop();
      await relay.close();
    });
    const drop = once(async () => {
      creation.stop();
      await relay.abandon();
    });
    const handle: RelayHandle = {
      name: "embedded",
      view: { services: relay.services, flags: relay.flags, url: "embedded" },
      dataDir: input.dir,
      makeClient: (_config, record) =>
        createEmbeddedRelayClient(async (request) => {
          const reply = await relay.handler(request);
          record.push({ method: request.method, url: request.path, status: reply.status, requestBody: request.bodyText ?? "", responseBody: reply.bodyText, responseHeaders: "[]" });
          return reply;
        }),
      close: stop,
      abandon: drop,
    };
    EXTRAS.set(handle, { creation, files, fetched, maintain: () => relay.maintain() });
    return handle;
  },
};

export const CREATE_TRANSPORTS: readonly Transport[] = [createHttpTransport, createEmbeddedTransport];

// ---- the creation stack -------------------------------------------------------------------------------------------------------

export interface PreparedMeta {
  readonly tool: string;
  readonly uri?: string;
  readonly conditionId?: string;
  readonly account: string;
}

interface Ledgers {
  readonly steps: Step[];
  // prepared_id -> what it was for.
  readonly meta: Map<string, PreparedMeta>;
}

const LEDGERS = new WeakMap<History, Ledgers>();

function ledgersOf(history: History): Ledgers {
  let found = LEDGERS.get(history);
  if (found === undefined) {
    found = { steps: [], meta: new Map() };
    LEDGERS.set(history, found);
  }
  return found;
}

export interface CreateStack {
  readonly stack: Stack;
  readonly extras: CreateExtras;
  // The steps of the creation tools only (the core steps are in stack.history.steps).
  readonly steps: Step[];
  readonly meta: Map<string, PreparedMeta>;
  call(tool: string, args: Json): Promise<Step>;
  // One pass of the relay's watcher, as its timer would make.
  tick(): Promise<TickReport | undefined>;
  restart(how: "close" | "crash", overrides?: Partial<StackOptions>): Promise<CreateStack>;
  stop(): Promise<void>;
}

function xoClientFor(mock: MockXo): XoClient {
  return new XoClient({ totalBudgetMs: 7_000, allowedHosts: XO_PLUGIN_HOSTS, userAgent: RELAY_USER_AGENT, fetchImpl: mock.fetch, minIntervalMs: 1 });
}

const lower = (value: string): string => value.toLowerCase();

export interface CreateStackOptions extends Omit<StackOptions, "transport"> {
  readonly transport: Transport;
}

export async function startCreateStack(options: CreateStackOptions): Promise<CreateStack> {
  const relayOn = options.relayOn ?? CREATE_FLAGS;
  const pluginOn = options.pluginOn ?? relayOn;
  const stack = await startStack({ ...options, relayOn, pluginOn });
  return adoptCreate(stack);
}

export async function adoptCreate(stack: Stack): Promise<CreateStack> {
  const extras = EXTRAS.get(stack.handle);
  assert.ok(extras !== undefined, "this stack was not started by the creation transports");
  const { mock, history, config } = stack;
  const ledgers = ledgersOf(history);
  const nowMs = (): number => mock.clock.nowMs();
  const audit = { write: (event: AuditEvent): void => void history.audit.push(event) };
  const deps: CreateToolDeps = {
    nowMs,
    config: () => config as GuardrailConfig,
    env: () => stack.pluginEnv,
    relay: () => stack.client(),
    audit,
    createClient: () => xoClientFor(mock),
    explorer: (xo) => explorerTransportFromHttp(xo.http),
  };
  const harness: Harness = await connect((server) => registerCreateTools(server, deps));
  const self: CreateStack = {
    stack,
    extras,
    steps: ledgers.steps,
    meta: ledgers.meta,
    async call(tool, args) {
      const startedMs = nowMs();
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
      };
      ledgers.steps.push(step);
      recordCreatePrepared(self, step);
      return step;
    },
    tick: () => extras.creation.tick(),
    async restart(how, overrides = {}) {
      await harness.close().catch(() => undefined);
      const next = await stack.restart(how, overrides);
      return adoptCreate(next);
    },
    async stop() {
      await harness.close().catch(() => undefined);
      await stack.stop();
    },
  };
  return self;
}

// The prepared items of the creation tools, recorded the way helpers.ts records the core tools' (it keeps that function
// private): the user-operation hash for market operations, the order hash for the seed.
function recordCreatePrepared(cs: CreateStack, step: Step): void {
  const out = step.structured;
  if (out === undefined) return;
  const prepared = out["prepared"] as Json | undefined;
  if (prepared === undefined || typeof prepared["prepared_id"] !== "string") return;
  const history = cs.stack.history;
  const summaryLines = ((prepared["summary"] as Json | undefined)?.["lines"] as string[] | undefined) ?? [];
  const orderLine = summaryLines.find((line) => line.startsWith("Order id (hash) "));
  const account = String(out["account"] ?? prepared["account"]);
  history.prepared.push({
    tool: step.tool,
    owner: String(out["owner"] ?? prepared["owner"]),
    account,
    preparedId: prepared["prepared_id"],
    kind: String(prepared["kind"]),
    ...(typeof out["user_op_hash"] === "string" ? { userOpHash: lower(out["user_op_hash"]) } : typeof prepared["user_op_hash"] === "string" ? { userOpHash: lower(prepared["user_op_hash"] as string) } : {}),
    ...(orderLine === undefined ? {} : { orderHash: lower(orderLine.slice("Order id (hash) ".length).replace(/\.$/, "")) }),
    dryRun: out["outcome"] === "dry_run",
  });
  const uri = typeof step.args["metadata_url"] === "string" ? step.args["metadata_url"] : undefined;
  const conditionId = typeof step.args["condition_id"] === "string" ? lower(step.args["condition_id"]) : undefined;
  cs.meta.set(prepared["prepared_id"], { tool: step.tool, account: lower(account), ...(uri === undefined ? {} : { uri }), ...(conditionId === undefined ? {} : { conditionId }) });
}

// ---- drafts and files -----------------------------------------------------------------------------------------------------------

const money = (value: number): string => value.toLocaleString("en-US");

// Draft number `variant` (0, 1, 2 ...): the same market with a different threshold, so each one is a different draft with its
// own hosted file, as three real creations would be.
export function draftArgs(owner: string, variant: number): Json {
  const threshold = money(150_000 + variant * 10_000);
  const swap = (text: string): string => text.replaceAll("150,000", threshold);
  return {
    owner,
    title: swap("Will Bitcoin's daily closing price on Coinbase be above $150,000 on December 31, 2026?"),
    description: swap("Binary market on whether BTC-USD closes above $150,000 on Coinbase on the last day of 2026."),
    category: "Crypto",
    outcomes: ["Yes", "No"],
    rules: swap(
      "This market resolves Yes if the 1-day candle for BTC-USD on Coinbase Exchange (https://exchange.coinbase.com/markets/BTC-USD) that opens at 2026-12-31T00:00:00Z closes at a price strictly above 150,000 USD. Otherwise the market resolves No. If Coinbase does not publish that candle, or BTC-USD trading is suspended for the whole day, the market is void and positions resolve equally.",
    ),
    resolution_sources: ["https://exchange.coinbase.com/markets/BTC-USD"],
    close_date: "2027-01-01T00:00:00Z",
    image_url: "https://assets.acme-research.net/img/cover.webp",
    tags: ["Bitcoin", "Crypto", "Price"],
    subcategories: ["Bitcoin"],
    outcome_rules: [swap("Resolves to Yes if the Coinbase BTC-USD daily candle for 2026-12-31 closes above 150,000 USD."), swap("Resolves to No if that candle closes at or below 150,000 USD.")],
    metadata_url: hostedUri(variant),
  };
}

export function hostedUri(variant: number): string {
  const tail = (0x1c2d3e4f5a00 + variant).toString(16).padStart(12, "0");
  return `${SELF_HOST}0b7d6c1e-3f4a-4c52-9a10-${tail}.json`;
}

// XO's suggestion for a market: the creator's own file with one more tag (a change the diff guard calls benign).
export function benignSuggestion(fileText: string): string {
  const parsed = JSON.parse(fileText) as MetadataJson;
  const copy = structuredClone(parsed) as unknown as Record<string, unknown>;
  copy["tags"] = [...(copy["tags"] as string[]), "Markets"];
  return prettyMetadataText(copy as unknown as MetadataJson);
}

// ---- the flows ------------------------------------------------------------------------------------------------------------------

export interface MarketRun {
  readonly variant: number;
  readonly uri: string;
  readonly flow: Flow;
  conditionId?: Hex;
  fileText?: string;
}

export async function signStep(cs: CreateStack, who: Identity, prepared: Step, digestLabel = "market"): Promise<{ readonly id: string; readonly signature: Hex } | undefined> {
  const intent = intentOf(prepared);
  if (intent === undefined) return undefined;
  const signature = await signIntent(who.key, intent);
  const id = preparedIdOf(prepared);
  cs.stack.history.signed.push({ preparedId: id, digest: String(intent.rawSigningPayloadHex ?? digestLabel), by: who.owner });
  return { id, signature };
}

async function lookUntilTerminal(cs: CreateStack, flow: Flow, hash: unknown): Promise<void> {
  if (typeof hash !== "string") return;
  for (let look = 0; look < 3; look += 1) {
    await cs.stack.mock.advance(10);
    flow["status"] = await cs.stack.call("xo_userop_status", { user_op_hash: hash });
    const state = (flow["status"].structured?.["status"] as Json | undefined)?.["state"];
    if (state === "included" || state === "failed" || state === "rejected") break;
  }
}

// create: the file, hosting it, the relay's prepare, the signature, the send, the status, then the watcher's look and
// the creator's list. Stops at the first refusal and says where in the returned flow.
export async function flowCreate(cs: CreateStack, who: Identity, variant: number): Promise<MarketRun> {
  const args = draftArgs(who.owner, variant);
  const run: MarketRun = { variant, uri: String(args["metadata_url"]), flow: {} };
  const { flow } = run;
  flow["file"] = await cs.call(PREPARE_CREATE_TOOL, args);
  const file = flow["file"].structured?.["metadata_file"] as { url?: string; text?: string } | undefined;
  if (flow["file"].outcome !== "metadata_ready" || file?.text === undefined || file.url === undefined) return run;
  cs.extras.files.set(file.url, file.text);
  run.fileText = file.text;
  flow["prepare"] = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
  const item = await signStep(cs, who, flow["prepare"]);
  if (item === undefined) return run;
  flow["submit"] = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
  await lookUntilTerminal(cs, flow, flow["submit"].structured?.["user_op_hash"]);
  await cs.tick();
  flow["list"] = await cs.call(TRACK_TOOL, { owner: who.owner });
  const listed = (flow["list"].structured?.["created_markets"] as Array<{ condition_id: Hex; metadata_uri: string }> | undefined) ?? [];
  const mine = listed.find((entry) => entry.metadata_uri === run.uri);
  if (mine !== undefined) {
    run.conditionId = mine.condition_id;
    flow["track"] = await cs.call(TRACK_TOOL, { condition_id: mine.condition_id });
  }
  return run;
}

// Lets the oracle's review happen: time passes, the watcher looks, the market is tracked.
export async function flowReview(cs: CreateStack, run: MarketRun, seconds: number): Promise<Flow> {
  const flow: Flow = {};
  await cs.stack.mock.advance(seconds);
  await cs.tick();
  if (run.conditionId !== undefined) flow["track"] = await cs.call(TRACK_TOOL, { condition_id: run.conditionId });
  return flow;
}

export async function flowSeed(cs: CreateStack, who: Identity, run: MarketRun, options: { readonly price?: string; readonly outcome?: "yes" | "no" } = {}): Promise<Flow> {
  const flow: Flow = {};
  if (run.conditionId === undefined) return flow;
  flow["prepare"] = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId, outcome: options.outcome ?? "yes", price: options.price ?? "0.5", ttl_days: 7 });
  const item = await signStep(cs, who, flow["prepare"], "seed");
  if (item === undefined) return flow;
  flow["submit"] = await cs.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
  return flow;
}

export async function flowCancel(cs: CreateStack, who: Identity, run: MarketRun): Promise<Flow> {
  const flow: Flow = {};
  if (run.conditionId === undefined) return flow;
  flow["prepare"] = await cs.call(CANCEL_MARKET_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId });
  const item = await signStep(cs, who, flow["prepare"]);
  if (item === undefined) return flow;
  flow["submit"] = await cs.call(CANCEL_MARKET_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
  await lookUntilTerminal(cs, flow, flow["submit"].structured?.["user_op_hash"]);
  await cs.tick();
  flow["track"] = await cs.call(TRACK_TOOL, { condition_id: run.conditionId });
  return flow;
}

// XO asked for changes: the suggestion is hosted where XO's oracle put it, the watcher looks, the creator answers.
export async function flowRespond(cs: CreateStack, who: Identity, run: MarketRun, accept: boolean): Promise<Flow> {
  const flow: Flow = {};
  const { mock } = cs.stack;
  const market = run.conditionId === undefined ? undefined : mock.creation.markets.get(run.conditionId);
  if (run.conditionId === undefined || market?.suggestion == null || run.fileText === undefined) return flow;
  cs.extras.files.set(market.suggestion.uri, benignSuggestion(run.fileText));
  await cs.tick();
  flow["before"] = await cs.call(TRACK_TOOL, { condition_id: run.conditionId });
  flow["prepare"] = await cs.call(RESPOND_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId, accept });
  const item = await signStep(cs, who, flow["prepare"]);
  if (item === undefined) return flow;
  flow["submit"] = await cs.call(RESPOND_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
  await lookUntilTerminal(cs, flow, flow["submit"].structured?.["user_op_hash"]);
  await cs.tick();
  flow["track"] = await cs.call(TRACK_TOOL, { condition_id: run.conditionId });
  return flow;
}

// A creator who is ready to create and seed: the account exists (the XO app deployed it), the relay holds XO credentials for it
// (connect), it holds USDC.e for the fee and the order book shows a balance for the seed. Returns the identity.
export async function readyCreator(cs: CreateStack, index = 0, options: { readonly connect?: boolean; readonly usdce?: bigint; readonly balanceMicro?: bigint } = {}): Promise<Identity> {
  const { stack } = cs;
  const who = identityOf(stack.mock, index);
  await ensureDeployedLikeXoApp(stack, who);
  if (options.connect !== false) {
    const connected = await flowConnect(stack, who);
    assert.equal(connected["submit"]?.code, "connected", connected["submit"]?.text.slice(0, 200));
  }
  await mintUsdce(stack.mock, who.account, options.usdce ?? 40n * USD);
  creditBalance(stack.mock, who.account, options.balanceMicro ?? 100n * USD);
  return who;
}

// The relay process dies at the first wire call of this kind: before the request leaves, or after XO has done its work (the
// answer is lost). The test restarts on the same directory afterwards.
export function crashAt(cs: CreateStack, kind: "bundler_send" | "order_post", when: "before" | "after", times = 1): void {
  cs.stack.history.wire.fault({ name: `crash ${when} the ${kind}`, match: (call) => call.kind === kind, times, action: { action: "crash", when, run: () => cs.stack.handle.abandon() } });
}

export interface CreateJourneyOptions {
  readonly usdce?: bigint;
  readonly balanceMicro?: bigint;
}

export interface CreateJourney {
  readonly flows: Record<string, Flow>;
  readonly runs: { readonly a: MarketRun; readonly b: MarketRun; readonly c: MarketRun };
}

// What an agent with PayBox does to launch markets, in order: deploy and connect as the XO app / the connect flow would,
// fund the account, then create three markets (one approved and seeded, one that XO asks to change and the creator
// accepts, one the creator cancels). Every step runs whatever the earlier ones answered, so a refusal early on does not
// hide the later ones; `checkCreateInvariants` judges what must hold regardless.
export async function createJourney(cs: CreateStack, who: Identity, options: CreateJourneyOptions = {}): Promise<CreateJourney> {
  const { stack } = cs;
  const { mock } = stack;
  const flows: Record<string, Flow> = {};
  flows["fundEarly"] = await flowFund(stack, who, { execute: false });
  await ensureDeployedLikeXoApp(stack, who);
  flows["connect"] = await flowConnect(stack, who);
  await mintUsdce(mock, who.account, options.usdce ?? 40n * USD);
  creditBalance(mock, who.account, options.balanceMicro ?? 100n * USD);
  flows["fund"] = await flowFund(stack, who, { execute: false });

  // A: approved, then seeded.
  mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
  const a = await flowCreate(cs, who, 0);
  flows["createA"] = a.flow;
  flows["reviewA"] = await flowReview(cs, a, 700);
  flows["seedA"] = await flowSeed(cs, who, a);

  // B: XO asks for changes; the guard passes; the creator accepts.
  mock.creation.policy = { decision: "update", reviewDelayS: 300, windowS: 48 * 3600, changeExpiry: false, metadataUpdate: false };
  const b = await flowCreate(cs, who, 1);
  flows["createB"] = b.flow;
  await mock.advance(305);
  flows["respondB"] = await flowRespond(cs, who, b, true);

  // C: cancelled by its creator before the first review.
  mock.creation.policy = { decision: "approve", reviewDelayS: 3600, metadataUpdate: false };
  const c = await flowCreate(cs, who, 2);
  flows["createC"] = c.flow;
  flows["cancelC"] = await flowCancel(cs, who, c);
  return { flows, runs: { a, b, c } };
}

// ---- the invariants -------------------------------------------------------------------------------------------------------------------

export interface CreateInvariantOptions extends InvariantOptions {
  // The caps this run is held to (default: $10 per order, $50 per day).
  readonly seedCap?: bigint;
  // Longest a creation-tool call may take on the mock's clock.
  readonly stepBudgetMs?: number;
  // C5 (flags and the kill switch) applies only to creation steps from this index on (see gateMark).
  readonly createStepFrom?: number;
}

// Call it at the moment the switches change in the middle of a run: the flag checks then judge only what happened after.
export function gateMark(cs: CreateStack): CreateInvariantOptions {
  return { gatesFrom: { wireSeq: cs.stack.history.wire.calls.length, step: cs.stack.history.steps.length }, createStepFrom: cs.steps.length };
}

const FAILING_OUTCOMES: ReadonlySet<string> = new Set(["refused", "rejected", "ambiguous", "pending"]);
const CREATE_OUTCOMES: ReadonlySet<string> = new Set(["prepared", "dry_run", "metadata_ready", "submitted", "accepted", "pending", "rejected", "ambiguous", "refused", "tracked", "listed"]);
const VAGUE: ReadonlySet<string> = new Set(["internal", "unknown", "error", "failed_unknown"]);

export function createWritable(stack: Stack): { readonly create: boolean; readonly hosting: boolean; readonly userop: boolean; readonly trading: boolean } {
  const relayOn = stack.options.relayOn ?? CREATE_FLAGS;
  const pluginOn = stack.options.pluginOn ?? relayOn;
  const live = stack.options.relayKill !== true && stack.options.pluginKill !== true && stack.options.relayEnv?.["KILL"] !== "1" && stack.options.relayEnv?.["XO_KILL_SWITCH"] !== "1";
  const both = (flag: WriteFlagName): boolean => live && relayOn.includes(flag) && pluginOn.includes(flag);
  return { create: both("XO_ENABLE_CREATE"), hosting: both("ENABLE_SELF_HOSTED_METADATA"), userop: both("ENABLE_USEROP_SUBMIT"), trading: both("ENABLE_TRADING") };
}

// All violations of the creation acceptance invariants plus the core ones (nothing sent that no prepared item names, no
// double send, caps, no funding of an undeployed account, flags, secrets, actionable refusals). Empty means they held.
export async function checkCreateInvariants(cs: CreateStack, options: CreateInvariantOptions = {}): Promise<string[]> {
  const { stack } = cs;
  const { mock, history } = stack;
  const violations = await checkInvariants(stack, options);
  const writable = createWritable(stack);
  const prepared = history.prepared.filter((item) => !item.dryRun);
  const signedIds = new Set(history.signed.map((entry) => entry.preparedId));
  const byOp = new Map(prepared.filter((item) => item.userOpHash !== undefined).map((item) => [item.userOpHash as string, item]));
  const byOrder = new Map(prepared.filter((item) => item.orderHash !== undefined).map((item) => [item.orderHash as string, item]));

  // C1. One draft makes one market: no hosted file backs two markets, no market exists without a signed creation item.
  const markets = [...mock.creation.markets.values()];
  const perUri = new Map<string, number>();
  for (const market of markets) perUri.set(market.metadataUri, (perUri.get(market.metadataUri) ?? 0) + 1);
  for (const [uri, count] of perUri) if (count > 1) violations.push(`C1 ${String(count)} markets were created from one metadata file (${uri})`);
  const createSends = history.wire.calls.filter((call) => call.kind === "bundler_send" && call.accepted && call.userOpHash !== undefined && cs.meta.get(byOp.get(call.userOpHash)?.preparedId ?? "")?.tool === PREPARE_CREATE_TOOL);
  const sendsPerUri = new Map<string, number>();
  for (const call of createSends) {
    const uri = cs.meta.get(byOp.get(call.userOpHash as string)?.preparedId ?? "")?.uri ?? "?";
    sendsPerUri.set(uri, (sendsPerUri.get(uri) ?? 0) + 1);
  }
  for (const [uri, count] of sendsPerUri) if (count > 1) violations.push(`C1 the creation of ${uri} was accepted by the bundler ${String(count)} times`);
  if (markets.length > createSends.length) violations.push(`C1 ${String(markets.length)} markets exist but only ${String(createSends.length)} creation operations were accepted by the bundler`);

  // C2. The fee is one $1 reservation per creation attempt that was prepared, never more.
  const ledger = stack.relay.services.ledger;
  const fees = ledger.list().filter((reservation) => reservation.category === "creation_fee" && reservation.state !== "released");
  // A fee reservation belongs to a prepared creation the relay holds (or held): the caller may never have seen it, because the
  // tool refused to hand over an item whose hosted file was not the draft's, but the relay must know which item it is for.
  const referenced = new Set(stack.relay.services.prepared.list().flatMap((item) => item.reservationIds));
  for (const fee of fees) if (fee.amountAtomic !== CREATION_FEE_ATOMIC) violations.push(`C2 creation fee reservation ${fee.id} holds ${String(fee.amountAtomic)} (the fee is ${String(CREATION_FEE_ATOMIC)})`);
  for (const fee of fees) if (!referenced.has(fee.id)) violations.push(`C2 creation fee reservation ${fee.id} belongs to no prepared item the relay holds`);
  for (const item of stack.relay.services.prepared.list()) {
    const own = item.reservationIds.filter((id) => fees.some((fee) => fee.id === id)).length;
    if (own > 1) violations.push(`C2 prepared item ${item.id} holds ${String(own)} creation fees (one attempt costs one fee)`);
  }

  // C3. A seed: within the seed cap, only on an active market its account created.
  const seedCap = options.seedCap ?? SEED_CAP_ATOMIC;
  for (const reservation of ledger.list().filter((entry) => entry.category === "seed" && entry.state !== "released")) {
    if (reservation.amountAtomic > seedCap) violations.push(`C3 seed reservation ${reservation.id} holds ${String(reservation.amountAtomic)} (seed cap ${String(seedCap)})`);
  }
  const seedPosts = history.wire.calls.filter((call) => call.kind === "order_post" && call.accepted && call.orderHash !== undefined && cs.meta.get(byOrder.get(call.orderHash)?.preparedId ?? "")?.tool === SEED_TOOL);
  for (const call of seedPosts) {
    const meta = cs.meta.get(byOrder.get(call.orderHash as string)?.preparedId ?? "");
    const id = meta?.conditionId ?? "?";
    const market = markets.find((entry) => entry.conditionId.toLowerCase() === id);
    if (market === undefined) violations.push(`C3 a seed was accepted for ${id}, which is not a market on the chain`);
    else {
      if (lower(market.creator) !== meta?.account) violations.push(`C3 a seed was accepted for ${id} from ${String(meta?.account)}, but ${market.creator} created the market`);
      if (market.status !== "ACTIVE") violations.push(`C3 a seed was accepted for ${id} while the market was ${market.status}`);
    }
  }

  // C4. Per-category caps in the ledger, in addition to the day total the core check holds: an order never above its cap,
  // the creation fee and the seed never turned into something larger.
  const caps = options.caps ?? { order: ORDER_CAP_ATOMIC, day: DAY_CAP_ATOMIC };
  for (const reservation of ledger.list().filter((entry) => entry.state !== "released" && entry.kind === "spend")) {
    if (reservation.category === "creation_fee" && reservation.amountAtomic > caps.order) violations.push(`C4 fee reservation ${reservation.id} is above the per-order cap`);
  }

  // C5. No creation write with its flag off at either end (or the kill switch on).
  const fromSeq = options.gatesFrom?.wireSeq ?? 0;
  const lateSteps = cs.steps.slice(options.createStepFrom ?? 0);
  for (const call of history.wire.calls.filter((entry) => entry.kind === "bundler_send" && entry.seq >= fromSeq)) {
    const meta = cs.meta.get(byOp.get(call.userOpHash ?? "")?.preparedId ?? "");
    if (meta === undefined || !MARKET_OP_TOOLS.has(meta.tool)) continue;
    const needed = meta.tool === PREPARE_CREATE_TOOL ? writable.create && writable.hosting && writable.userop : writable.create && writable.userop;
    if (!needed) violations.push(`C5 a ${meta.tool} operation reached the bundler although XO_ENABLE_CREATE, the hosting flag or ENABLE_USEROP_SUBMIT is off at one end or the kill switch is on`);
  }
  for (const call of seedPosts.filter((entry) => entry.seq >= fromSeq)) if (!(writable.create && writable.trading)) violations.push("C5 a seed was posted to the order book although XO_ENABLE_CREATE or ENABLE_TRADING is off at one end or the kill switch is on");
  for (const step of lateSteps) {
    if (step.outcome === "submitted" && step.tool !== TRACK_TOOL && !(writable.create && writable.userop)) violations.push(`C5 ${step.tool} reported a submit with XO_ENABLE_CREATE or ENABLE_USEROP_SUBMIT off or the kill switch on`);
    if (step.tool === SEED_TOOL && step.outcome === "accepted" && !(writable.create && writable.trading)) violations.push("C5 xo_place_seed reported accepted with XO_ENABLE_CREATE or ENABLE_TRADING off or the kill switch on");
  }

  // C6. Every creation-tool answer is stable and actionable, and none hangs.
  const budget = options.stepBudgetMs ?? 60_000;
  for (const step of cs.steps) {
    const out = step.structured;
    const label = `${step.tool}${typeof step.args["step"] === "string" ? ` ${step.args["step"]}` : ""}`;
    if (step.endedMs - step.startedMs > budget) violations.push(`C6 ${label} took ${String(step.endedMs - step.startedMs)} ms on the mock's clock (budget ${String(budget)})`);
    if (out === undefined) {
      violations.push(`C6 ${label} returned no structured result (isError ${String(step.isError)}): ${step.text.slice(0, 120)}`);
      continue;
    }
    const code = out["code"];
    const message = out["message"];
    const next = out["next_action"];
    if (typeof code !== "string" || !/^[a-z][a-z0-9_]*$/.test(code)) violations.push(`C6 ${label} answered without a stable snake_case code (${String(code)})`);
    if (typeof message !== "string" || message.trim().length < 10) violations.push(`C6 ${label} answered (${String(code)}) without a message that says what happened`);
    if (step.outcome === undefined || !CREATE_OUTCOMES.has(step.outcome)) violations.push(`C6 ${label} answered with an unknown outcome ${String(step.outcome)}`);
    const hasNext = (typeof next === "string" && next.trim().length >= 10) || /(^|\n)Next:/.test(step.text);
    if ((step.isError || FAILING_OUTCOMES.has(String(step.outcome))) && !hasNext) violations.push(`C6 ${label} refused (${String(code)}) without saying what to do next`);
    if (step.isError && typeof code === "string" && VAGUE.has(code)) violations.push(`C9 ${label} refused with the vague code ${code}: ${String(message)}`);
    if (step.isError && !FAILING_OUTCOMES.has(String(step.outcome))) violations.push(`C6 ${label} isError with outcome ${String(step.outcome)}`);
  }

  // C7. No secret in anything a creation tool said.
  const secrets = secretsOf(stack);
  for (const [index, step] of cs.steps.entries()) {
    violations.push(...findSecrets(`creation tool result ${String(index)} (${step.tool}) text`, step.text, secrets).map((line) => `C7 ${line}`));
    violations.push(...findSecrets(`creation tool result ${String(index)} (${step.tool}) structured`, JSON.stringify(step.structured ?? {}), secrets).map((line) => `C7 ${line}`));
  }
  for (const [url, text] of cs.extras.files) violations.push(...findSecrets(`hosted file ${url}`, text, secrets).map((line) => `C7 ${line}`));

  // Every signature the suite made was for a prepared item (the agent never signs anything the relay did not hand out).
  for (const entry of history.signed) if (!prepared.some((item) => item.preparedId === entry.preparedId)) violations.push(`C8 a signature was made for ${entry.preparedId}, which no prepared item names`);
  void signedIds;
  return violations;
}

export async function checkCreateKept(cs: CreateStack): Promise<string[]> {
  return checkCredentialsKept(cs.stack);
}

// Findings already reported (see create-findings.test.ts and the task result): counted and printed at the end of the run
// instead of failing every test that meets them. A violation that matches none of these fails the test.
const CREATE_KNOWN: ReadonlyArray<{ readonly id: string; readonly pattern: RegExp }> = [
  // F3 (core finding) as it shows on a creation: the relay failed after XO took the operation and says "Nothing was sent".
  { id: "F3", pattern: /^C9 \w+ refused with the vague code internal: The relay failed unexpectedly\. Nothing was sent\.$/ },
  // G1: an unreadable explorer is answered with the code `internal` (the code for a bug), by two creation tools.
  { id: "G1", pattern: /^C9 xo_(track_market|place_seed)( prepare)? refused with the vague code internal: The explorer could not be read/ },
];
const seenCreateKnown = new Map<string, number>();

export function assertCreateHeld(violations: readonly string[], context: string): void {
  const own = violations.filter((violation) => {
    const match = CREATE_KNOWN.find((finding) => finding.pattern.test(violation));
    if (match !== undefined) seenCreateKnown.set(match.id, (seenCreateKnown.get(match.id) ?? 0) + 1);
    return match === undefined;
  });
  const { unknown } = splitKnown(own);
  assert.deepEqual(unknown, [], `${context}: ${String(unknown.length)} invariant violation(s)\n  ${unknown.join("\n  ")}`);
}

after(() => {
  if (seenCreateKnown.size > 0) console.log(`create matrix: known findings seen in this file: ${[...seenCreateKnown].map(([id, n]) => `${id} x${String(n)}`).join(", ")}`);
});

// ---- the summary table -----------------------------------------------------------------------------------------------------------------

interface Cell {
  readonly profile: string;
  readonly transport: TransportName;
  readonly tags: Record<string, string>;
}

const CELLS: Cell[] = [];
const COLUMNS = ["createA", "reviewA", "seedA", "createB", "respondB", "createC", "cancelC"] as const;

// The final word of a flow: the last step's code, so "submitted" / "accepted" / "active" or the code that stopped it.
export function tagOf(flow: Flow | undefined): string {
  if (flow === undefined) return "-";
  const steps = Object.values(flow).filter((step): step is Step => step !== undefined);
  const last = steps[steps.length - 1];
  if (last === undefined) return "-";
  return last.code ?? last.outcome ?? "?";
}

export function recordJourney(profile: string, transport: TransportName, journey: CreateJourney): void {
  const tags: Record<string, string> = {};
  for (const column of COLUMNS) tags[column] = tagOf(journey.flows[column]);
  CELLS.push({ profile, transport, tags });
}

after(() => {
  if (CELLS.length === 0) return;
  const rows = new Map<string, { count: number; first: string[] }>();
  for (const cell of CELLS) {
    const key = COLUMNS.map((column) => cell.tags[column]).join(" | ");
    const row = rows.get(key) ?? { count: 0, first: [] };
    row.count += 1;
    if (row.first.length < 3) row.first.push(`${cell.profile} over ${cell.transport}`);
    rows.set(key, row);
  }
  const lines = [`create matrix: ${String(CELLS.length)} journeys, final answer of each flow (${COLUMNS.join(" | ")})`];
  for (const [key, row] of [...rows].sort((x, y) => y[1].count - x[1].count)) lines.push(`  ${String(row.count).padStart(3)} x ${key}   e.g. ${row.first.join(", ")}`);
  console.log(lines.join("\n"));
});

export type { Address };


// ---- the profile matrix ---------------------------------------------------------------------------------------------------------------

// The two named profiles, every switch flipped alone from the pessimistic profile (as the core matrix does), and every
// switch flipped alone back from the optimistic profile: creation only works when nearly everything is known, so the
// second family is where the interesting refusals are. The faults switch has its own tests (create-faults).
export function createProfiles(): MatrixProfile[] {
  const out = allProfiles().filter((profile) => profile.flip === undefined || profile.flip.name !== "faults");
  for (const definition of MOCK_SWITCHES) {
    if (definition.name === "faults") continue;
    for (const value of definition.values) {
      if (value === definition.optimistic) continue;
      out.push({ name: `optimistic/${definition.name}=${value}`, base: "optimistic", flip: { name: definition.name, value } });
    }
  }
  return out;
}

export interface CreateMatrixOptions {
  readonly label: string;
  readonly transport: Transport;
  readonly shard: number;
  readonly shards: number;
}

const codeOf = (flows: Record<string, Flow>, flow: string, step: string): string | undefined => flows[flow]?.[step]?.code;

// What the two named profiles are KNOWN to do, written out from the switch values and not read from the relay; every
// other profile is judged by the invariants alone (plus the rules every profile shares).
function expectCreateProfile(profile: MatrixProfile, journey: CreateJourney, cs: CreateStack): void {
  const tag = `${profile.name} over ${cs.stack.transport}`;
  const { flows } = journey;
  const early = flows["fundEarly"]?.["first"];
  assert.equal(early?.isError, true, `${tag}: funding an account that does not exist is refused`);
  // In every profile: a refused creation leaves nothing behind, an accepted one is exactly one market.
  const submitted = ["createA", "createB", "createC"].filter((name) => codeOf(flows, name, "submit") === "submitted").length;
  assert.equal(cs.stack.mock.creation.markets.size, submitted, `${tag}: one market per accepted creation (${String(submitted)} accepted)`);
  if (profile.name === "optimistic") {
    assert.equal(codeOf(flows, "createA", "submit"), "submitted", tag);
    assert.equal(codeOf(flows, "createA", "status"), "included", tag);
    assert.equal(codeOf(flows, "reviewA", "track"), "active", tag);
    assert.equal(codeOf(flows, "seedA", "submit"), "accepted", tag);
    assert.equal(codeOf(flows, "createB", "submit"), "submitted", tag);
    assert.equal(codeOf(flows, "respondB", "before"), "update_required", tag);
    assert.equal(codeOf(flows, "respondB", "submit"), "submitted", tag);
    assert.equal(codeOf(flows, "respondB", "track"), "active", tag);
    assert.equal(codeOf(flows, "createC", "submit"), "submitted", tag);
    assert.equal(codeOf(flows, "cancelC", "track"), "cancelled", tag);
    assert.equal(cs.stack.mock.creation.markets.size, 3, tag);
    return;
  }
  if (profile.name === "pessimistic") {
    // The node is down, so neither the door nor the fee can be read: nothing is prepared on a guess.
    for (const name of ["createA", "createB", "createC"]) {
      assert.equal(codeOf(flows, name, "file"), "metadata_ready", `${tag}: the file is still handed over (${name})`);
      assert.equal(codeOf(flows, name, "prepare"), "precondition_failed", `${tag}: ${name} is refused with a coded precondition`);
    }
    assert.equal(cs.stack.history.wire.count((call) => call.kind === "bundler_send"), 0, `${tag}: no user operation was sent`);
    assert.equal(cs.stack.mock.creation.markets.size, 0, `${tag}: no market`);
    assert.equal(cs.stack.relay.services.ledger.list().filter((entry) => entry.category === "creation_fee" && entry.state !== "released").length, 0, `${tag}: no fee is held`);
  }
}

export function registerCreateMatrix(options: CreateMatrixOptions): void {
  const profiles = createProfiles().filter((_, index) => index % options.shards === options.shard);
  describe(`create matrix over ${options.label} (shard ${String(options.shard + 1)} of ${String(options.shards)})`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });
    for (const profile of profiles) {
      harness.it(profile.name, async (mock) => {
        applyProfile(mock, profile);
        const cs = await startCreateStack({ mock, transport: options.transport });
        const who = identityOf(mock, 0);
        const journey = await createJourney(cs, who);
        recordJourney(profile.name, cs.stack.transport, journey);
        assertCreateHeld([...(await checkCreateInvariants(cs)), ...(await checkCreateKept(cs))], `${profile.name} over ${cs.stack.transport}`);
        expectCreateProfile(profile, journey, cs);
        // Kill the relay as a crash would, start it on the same directory: credentials, the watchers' markets, the fees and
        // the ledger are as they were, and nothing is created or sent a second time.
        const marketsBefore = mock.creation.markets.size;
        const sendsBefore = cs.stack.history.wire.count((call) => call.kind === "bundler_send" || call.kind === "order_post");
        const feesBefore = cs.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released").length;
        const again = await cs.restart("crash");
        await again.tick();
        await again.tick();
        assertCreateHeld([...(await checkCreateKept(again)), ...(await checkCreateInvariants(again))], `${profile.name} after a crash`);
        assert.equal(mock.creation.markets.size, marketsBefore, `${profile.name}: the restart created nothing`);
        assert.equal(again.stack.history.wire.count((call) => call.kind === "bundler_send" || call.kind === "order_post"), sendsBefore, `${profile.name}: the restart sent nothing`);
        assert.equal(again.stack.relay.services.ledger.list().filter((entry) => entry.state !== "released").length, feesBefore, `${profile.name}: the restart reserved nothing and released nothing early`);
      });
    }
  });
}
