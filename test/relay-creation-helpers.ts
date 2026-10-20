import { after } from "node:test";

import assert from "node:assert/strict";

import { encodeFunctionData, type Address, type Hex } from "viem";

import { DEFAULTS } from "../src/config.js";
import { Secret } from "../src/config.js";
import { createRelayClient } from "../src/relay/client.js";
import type { PostRequest, PostResponse, RelayClient, RelayResult } from "../src/relay/contract.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import type { MarketDraft } from "../src/create/lint.js";
import { buildMetadata, prettyMetadataText, type MetadataJson } from "../src/xo/creation/metadata.js";
import { createCreationRuntime, routes as creationRoutes, type CreationRuntime } from "../relay/creation.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createRelay, type CreateRelayOptions, type Relay } from "../relay/main.js";
import { createAccountDirectory, routes as useropRoutes, type UserOpOptions } from "../relay/userops.js";
import { USDCE_STUB_ABI } from "./anvil/stubs.js";
import type { MockXo } from "./mock-xo/server.js";
import { TEST_RELAY_KEY, tempDir, type TempDir } from "./relay-core-helpers.js";
import { deployOwner } from "./mock-xo/testing.js";
import { ok, signPrepared, statusOf } from "./relay-userops-helpers.js";
import { checkDecoded } from "./relay-decoded-check.js";

// A relay wired to the local mock XO with the creation module plugged in, for the relay-creation tests. Not a test file.
//
// The relay's clock IS the mock's clock; a rate-limit wait in the upstream client moves that clock instead of sleeping.
// The self-host the relay may read metadata from is an invented, valid-looking host; the files "hosted" there live in a
// Map this rig serves from its own fetch, and so do XO's suggested files (which a real oracle puts in its own bucket).
// Keys are the public Anvil test keys (chain.owner(i)). Nothing here signs anything real.

export const SELF_HOST = "https://markets.acme-research.net/m/";
export const HOSTED_URI = `${SELF_HOST}0b7d6c1e-3f4a-4c52-9a10-1c2d3e4f5a6b.json`;
export const SECOND_URI = `${SELF_HOST}7a1c2e3d-5b6f-4a7b-8c9d-0e1f2a3b4c5d.json`;

export const CREATE_ENV = Object.freeze({
  XO_RELAY_KEY: TEST_RELAY_KEY,
  RELAY_PORT: "0",
  RELAY_CREDENTIAL_STORE: "off",
  RELAY_ENFORCE_FLAG_FACTS: "0",
  RELAY_SELF_HOST: SELF_HOST,
  ENABLE_USEROP_SUBMIT: "1",
  XO_ENABLE_CREATE: "1",
  ENABLE_SELF_HOSTED_METADATA: "1",
});

export interface CreationRig {
  readonly mock: MockXo;
  readonly relay: Relay;
  readonly client: RelayClient;
  readonly creation: CreationRuntime;
  readonly dir: string;
  readonly temp: TempDir;
  // The files "served" by the self-host and by XO's bucket, by URL.
  readonly files: Map<string, string>;
  // URLs requested from outside the mock (the metadata fetches), in order.
  readonly fetched: string[];
  post<P extends Parameters<RelayClient["post"]>[0]>(path: P, body: PostRequest<P>): Promise<RelayResult<PostResponse<P>>>;
  tick(): Promise<void>;
  stop(): Promise<void>;
  // Drops everything without an orderly shutdown, as a crash would.
  crash(): Promise<void>;
}

export interface CreationRigOptions {
  readonly env?: Record<string, string>;
  readonly dir?: TempDir;
  readonly files?: Map<string, string>;
  readonly userops?: UserOpOptions;
  // Wraps the mock's fetch, for faults.
  readonly wrapFetch?: (inner: typeof fetch) => typeof fetch;
  readonly createOptions?: Partial<CreateRelayOptions>;
  // The watcher loop's period in real milliseconds. 0 (the default here) starts no timer: tests call tick() themselves.
  readonly intervalMs?: number;
}

const dirs: TempDir[] = [];
const rigs: CreationRig[] = [];

after(async () => {
  for (const rig of rigs.splice(0)) await rig.stop().catch(() => undefined);
  for (const dir of dirs.splice(0)) await dir.cleanup().catch(() => undefined);
});

export async function startCreationRig(mock: MockXo, options: CreationRigOptions = {}): Promise<CreationRig> {
  let dir = options.dir;
  if (dir === undefined) {
    dir = await tempDir("relay-creation-");
    dirs.push(dir);
  }
  const files = options.files ?? new Map<string, string>();
  const fetched: string[] = [];
  const served = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const hosted = files.get(url);
    const outside = url.startsWith(SELF_HOST) || url.startsWith("https://storage.googleapis.com/market-metadata-mainnet/");
    if (outside) {
      fetched.push(url);
      if (hosted === undefined) return new Response("not found", { status: 404 });
      return new Response(hosted, { status: 200, headers: { "content-type": "application/json" } });
    }
    return mock.asFetch(input, init);
  }) as typeof fetch;
  const fetchImpl = options.wrapFetch === undefined ? served : options.wrapFetch(served);

  const creation = createCreationRuntime({ intervalMs: options.intervalMs ?? 0, now: () => mock.clock.nowMs() });
  let ref: Relay | undefined;
  const relay = await createRelay({
    env: { ...CREATE_ENV, RELAY_DATA_DIR: dir.dir, ...options.env },
    accounts: createAccountDirectory({ upstream: () => ref?.services.upstream, ...(options.userops === undefined ? {} : { options: options.userops }), now: () => mock.clock.nowMs() }),
    now: () => mock.clock.nowMs(),
    sleep: async (ms) => {
      mock.clock.advanceMs(Math.max(0, Math.round(ms)));
    },
    fetch: fetchImpl,
    maintenance: false,
    extraUpstreamHosts: [{ host: "mainnet.base.org", methods: ["GET", "POST"] }],
    routes: { ...healthRoutes, ...useropRoutes, ...creationRoutes },
    http: {
      readRate: { capacity: 100_000, refillPerSecond: 100_000 },
      writeRate: { capacity: 100_000, refillPerSecond: 100_000 },
      requestBudgetMs: 120_000,
      hardDeadlineMs: 180_000,
    },
    extraServices: { ...(options.userops === undefined ? {} : { userops: options.userops }), ...creation.extraServices },
    ...options.createOptions,
  });
  ref = relay;
  creation.attach(relay);
  const client = createRelayClient({ baseUrl: relay.url, key: new Secret(TEST_RELAY_KEY) });
  const rig: CreationRig = {
    mock,
    relay,
    client,
    creation,
    dir: dir.dir,
    temp: dir,
    files,
    fetched,
    post: async (path, body) => checkDecoded(path, await client.post(path, body)),
    async tick() {
      await creation.tick();
    },
    async stop() {
      creation.stop();
      await relay.close();
    },
    async crash() {
      creation.stop();
      await relay.abandon();
    },
  };
  rigs.push(rig);
  return rig;
}

// ---- the draft, and the file XO would read ---------------------------------------------------------------------------------

const GOOD_RULES =
  "This market resolves Yes if the 1-day candle for BTC-USD on Coinbase Exchange (https://exchange.coinbase.com/markets/BTC-USD) that opens at 2026-12-31T00:00:00Z closes at a price strictly above 150,000 USD. Otherwise the market resolves No. If Coinbase does not publish that candle, or BTC-USD trading is suspended for the whole day, the market is void and positions resolve equally.";

export const DRAFT: MarketDraft = {
  title: "Will Bitcoin's daily closing price on Coinbase be above $150,000 on December 31, 2026?",
  description: "Binary market on whether BTC-USD closes above $150,000 on Coinbase on the last day of 2026.",
  category: "Crypto",
  outcomes: ["Yes", "No"],
  rules: GOOD_RULES,
  resolutionSources: ["https://exchange.coinbase.com/markets/BTC-USD"],
  closeDate: "2027-01-01T00:00:00Z",
};

export const EXTRAS = {
  imageUrl: "https://assets.acme-research.net/img/cover.webp",
  tags: ["Bitcoin", "Crypto", "Price"],
  subcategories: ["Bitcoin"],
  outcomeRules: [
    "Resolves to Yes if the Coinbase BTC-USD daily candle for 2026-12-31 closes above 150,000 USD.",
    "Resolves to No if that candle closes at or below 150,000 USD.",
  ] as [string, string],
};

export interface BuiltFile {
  readonly metadata: MetadataJson;
  readonly text: string;
  readonly expiresAt: string;
}

export function buildFile(mock: MockXo, overrides: Partial<MarketDraft> = {}): BuiltFile {
  const built = buildMetadata({ draft: { ...DRAFT, ...overrides }, extras: EXTRAS, nowMs: mock.clock.nowMs(), config: DEFAULTS });
  if (!built.ok) throw new Error(`the test draft must build: ${built.message}`);
  return { metadata: built.metadata, text: built.text, expiresAt: new Date(built.expiresAtS * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") };
}

export function hostedText(metadata: MetadataJson): string {
  return prettyMetadataText(metadata);
}

export function createBody(owner: Address, file: BuiltFile, uri = HOSTED_URI) {
  return { owner, action: "create_market" as const, params: { metadata_uri: uri, expires_at: file.expiresAt, title: file.metadata.title } };
}

// USDC.e on the stub is an open mint: this gives an account the balance for the fee, the way a delivered deposit would.
export async function fund(mock: MockXo, to: Address, amount: bigint): Promise<void> {
  const chain = mock.chains.xo;
  if (chain === undefined) throw new Error("the mock has no XO chain");
  await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [to, amount] }));
}

export type { Hex };

// ---- shared steps of the journeys --------------------------------------------------------------------------------------------

const USD = 1_000_000n;

export function ownerOf(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

// A deployed account with trading enabled and $30 of USDC.e: enough for the fee and a seed.
export async function readyOwner(mock: MockXo, index: number, usdce = 30n * USD) {
  await deployOwner(mock, index, { enableTrading: true });
  const alice = ownerOf(mock, index);
  const account = deriveAccount(alice.address);
  await fund(mock, account, usdce);
  return { alice, account };
}

export async function trackOf(rig: CreationRig, conditionId: string) {
  return ok(await rig.post("/v1/creation/track", { condition_id: conditionId as Hex }));
}

// Prepares, signs and submits a creation, checks that it landed, and lets the watcher find it.
export async function createMarket(rig: CreationRig, index: number, options: { readonly uri?: string; readonly file?: BuiltFile } = {}) {
  const mock = rig.mock;
  const alice = ownerOf(mock, index);
  const uri = options.uri ?? HOSTED_URI;
  const file = options.file ?? buildFile(mock);
  rig.files.set(uri, hostedText(file.metadata));
  const prepared = ok(await rig.post("/v1/userop/prepare", createBody(alice.address, file, uri)));
  const submitted = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign, "raw") }));
  assert.equal(submitted.state, "submitted");
  assert.equal((await statusOf(rig, prepared.user_op_hash)).state, "included");
  await rig.tick();
  const created = [...mock.creation.markets.values()].pop();
  assert.ok(created !== undefined, "the mock saw the market");
  return { prepared, file, conditionId: created.conditionId, alice };
}

// Signs and submits a prepared creation-family item and returns the user operation's status.
export async function land(rig: CreationRig, alice: ReturnType<typeof ownerOf>, prepared: { readonly prepared_id: string; readonly sign: Parameters<typeof signPrepared>[1]; readonly user_op_hash: string }) {
  const sent = ok(await rig.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign, "raw") }));
  assert.equal(sent.state, "submitted");
  return statusOf(rig, prepared.user_op_hash);
}
