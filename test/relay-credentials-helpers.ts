import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import type { TestContext } from "node:test";
import { join } from "node:path";

import { getAddress, type Address, type Hex } from "viem";
import type { HDAccount } from "viem/accounts";

import { Secret } from "../src/config.js";
import { POST_ROUTES, type Prepared } from "../src/relay/contract.js";
import { ALL_FLAGS_OFF, type Flags } from "../src/relay/flags.js";
import { createMemoryAudit } from "../relay/audit.js";
import type { AlertInput, AlertRecord, AlertSink } from "../relay/alerts.js";
import { CapabilityRegistry } from "../relay/capabilities.js";
import { loadRelayConfig } from "../relay/config.js";
import { createCredentialRoutes, type CredentialOptions } from "../relay/credentials.js";
import { DurableLedger, ledgerLimitsFrom } from "../relay/ledger.js";
import { PreparedStore } from "../relay/prepared.js";
import { openRelayStorage, type FsLike, type RelayStorage } from "../relay/store.js";
import type { RelayContext, RelayServices, RouteTable } from "../relay/types.js";
import { createUpstream, XO_UPSTREAM_HOSTS, type Upstream } from "../relay/upstream.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import type { MockXo } from "./mock-xo/server.js";
import { deployOwner } from "./mock-xo/testing.js";
import { clobAuthDigest, kernelWrappedDigest } from "./mock-xo/verify.js";
import { tempDir, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, type TempDir } from "./relay-core-helpers.js";

// Shared setup for the relay-credentials tests. Not a test file (the unit glob only runs *.test.ts).
//
// A "world" is the relay's services (encrypted storage in a temp directory, capability facts, prepared
// items, an upstream client whose fetch is the mock XO with a spy in front) plus a context to call the
// route handlers with. Time is the mock's clock: the relay reads it and its sleeps move it, so nothing
// waits for real time. Owners are the public Anvil test accounts of the mock's chain (TEST keys).

export interface SentRequest {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly search: string;
  // Lower-case header names.
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
  // 0 while the request is in flight or when it ended without a response (a timeout).
  status: number;
  // Whether the account's triplet was on disk when the request left.
  readonly tripletOnDisk: boolean | undefined;
  // The mock clock when the request left, in ms.
  readonly atMs: number;
}

export type Interceptor = (request: { readonly method: string; readonly url: URL; readonly headers: Readonly<Record<string, string>>; readonly body: string | undefined }) => Response | undefined | Promise<Response | undefined>;

export class FakeAlerts implements AlertSink {
  readonly raised: AlertInput[] = [];
  readonly hookEnabled = false;
  async raise(alert: AlertInput): Promise<void> {
    this.raised.push(alert);
  }
  recent(): readonly AlertRecord[] {
    return [];
  }
  hookRuns(): number {
    return 0;
  }
  hookFailures(): number {
    return 0;
  }
  async idle(): Promise<void> {}
  async close(): Promise<void> {}
}

export interface WorldOptions {
  readonly credentials?: CredentialOptions;
  readonly flags?: Partial<Flags>;
  // Run in front of the mock for every upstream request.
  readonly intercept?: Interceptor;
  // false: no credential store (RELAY_CREDENTIAL_STORE=off).
  readonly credentialStore?: boolean;
  // Share a data directory with an earlier world (a restart).
  readonly dir?: TempDir;
  // The relay's clock runs this far ahead of (or behind) the mock's. XO's own time must win.
  readonly skewMs?: number;
  readonly fs?: FsLike;
}

export interface World {
  readonly mock: MockXo;
  readonly dir: TempDir;
  readonly storage: RelayStorage;
  readonly services: RelayServices;
  readonly capabilities: CapabilityRegistry;
  readonly prepared: PreparedStore;
  readonly upstream: Upstream;
  readonly audit: ReturnType<typeof createMemoryAudit>;
  readonly alerts: FakeAlerts;
  readonly sent: SentRequest[];
  readonly routes: RouteTable;
  readonly flags: { current: Flags };
  setIntercept(intercept: Interceptor | undefined): void;
  context(): RelayContext;
  // A crash: drop everything without flushing or releasing anything, then the directory can be reopened.
  crash(): void;
  close(): Promise<void>;
}

export const MOCK_ORIGIN_HOSTS = ["orderbooks.xo.market", "api-mainnet.xo.market", "explorer-mainnet.xo.market"] as const;

export const FLAGS_ON: Flags = Object.freeze({ ...ALL_FLAGS_OFF, ENABLE_TRADING: true });

export async function createWorld(mock: MockXo, t: TestContext | undefined, options: WorldOptions = {}): Promise<World> {
  const dir = options.dir ?? (await tempDir("relay-credentials-"));
  const skew = options.skewMs ?? 0;
  const now = (): number => mock.clock.nowMs() + skew;
  const storage = await openRelayStorage({
    dir: dir.dir,
    now,
    ...(options.fs === undefined ? {} : { fs: options.fs }),
    ...(options.credentialStore === false ? {} : { masterSecret: new Secret(TEST_MASTER_SECRET) }),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    // A world that is abandoned (a simulated crash) leaves its directory lock behind with a live pid.
    isProcessAlive: () => false,
  });
  const audit = createMemoryAudit(now);
  const alerts = new FakeAlerts();
  const capabilities = await CapabilityRegistry.open({ store: storage.state, now, audit });
  const prepared = new PreparedStore({ store: storage.state, now, audit });
  const sent: SentRequest[] = [];
  let intercept = options.intercept;

  const fetchSpy = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[name.toLowerCase()] = value;
    const body = typeof init?.body === "string" ? init.body : undefined;
    const atMs = mock.clock.nowMs();
    const tripletOnDisk = storage.secrets === undefined ? undefined : await anyTripletOnDisk(storage);
    const entry: SentRequest = { method: init?.method ?? "GET", url: url.toString(), path: url.pathname, search: url.search, headers, body, status: 0, tripletOnDisk, atMs };
    sent.push(entry);
    const injected = await intercept?.({ method: init?.method ?? "GET", url, headers, body });
    const response = injected ?? (await mock.asFetch(input, init));
    entry.status = response.status;
    return response;
  }) as typeof fetch;

  const upstream = createUpstream({
    hosts: XO_UPSTREAM_HOSTS,
    fetch: fetchSpy,
    now,
    requestsPerSecond: 1000,
    sleep: async (ms) => {
      mock.clock.advanceMs(Math.max(0, Math.ceil(ms)));
    },
    jitter: () => 0,
  });

  const loaded = loadRelayConfig({ RELAY_DATA_DIR: dir.dir, XO_RELAY_KEY: TEST_RELAY_KEY, ENABLE_TRADING: "1", RELAY_ENFORCE_FLAG_FACTS: "0", ...(options.credentialStore === false ? { RELAY_CREDENTIAL_STORE: "off" } : {}) });
  const ledger = new DurableLedger({ store: storage.state, locks: storage.locks, now, limits: ledgerLimitsFrom(loaded.config, capabilities), audit });

  const services: RelayServices = {
    config: loaded.config,
    state: storage.state,
    locks: storage.locks,
    ...(storage.secrets === undefined ? {} : { secrets: storage.secrets }),
    audit,
    alerts,
    capabilities,
    prepared,
    upstream,
    ledger,
  };
  const flags = { current: Object.freeze({ ...FLAGS_ON, ...options.flags }) as Flags };
  const credentialOptions: CredentialOptions = {
    sleep: async (ms) => {
      mock.clock.advanceMs(Math.max(0, Math.ceil(ms)));
    },
    ...options.credentials,
  };
  const routes = createCredentialRoutes(credentialOptions);
  let counter = 0;
  const world: World = {
    mock,
    dir,
    storage,
    services,
    capabilities,
    prepared,
    upstream,
    audit,
    alerts,
    sent,
    routes,
    flags,
    setIntercept(next) {
      intercept = next;
    },
    context() {
      counter += 1;
      return { flags: () => flags.current, now, requestId: `test-${String(counter)}`, signal: new AbortController().signal, services };
    },
    crash() {
      storage.abandon();
    },
    async close() {
      await storage.close().catch(() => undefined);
      if (options.dir === undefined) await dir.cleanup();
    },
  };
  t?.after(() => world.close());
  return world;
}

// True when any account's triplet file exists in the vault (the tests use one account per world).
async function anyTripletOnDisk(storage: RelayStorage): Promise<boolean> {
  const secrets = storage.secrets;
  if (secrets === undefined) return false;
  try {
    const names = await readdir(join(storage.dir, "secrets"));
    return names.some((name) => name.endsWith(".xo_triplet.enc"));
  } catch {
    return false;
  }
}

// ---- owners, signatures, calls ---------------------------------------------------------------------------------------------------------------

export interface Owner {
  readonly index: number;
  readonly account: HDAccount;
  readonly address: Address;
  readonly smart: Address;
}

export function ownerAt(mock: MockXo, index: number): Owner {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined, "the mock has an XO chain");
  const account = chain.owner(index);
  return { index, account, address: getAddress(account.address), smart: deriveAccount(account.address) };
}

export async function deployed(mock: MockXo, index: number, options: { readonly enableTrading?: boolean } = {}): Promise<Owner> {
  await deployOwner(mock, index, { enableTrading: options.enableTrading ?? true });
  return ownerAt(mock, index);
}

export type DigestForm = "raw" | "eip191";

// What PayBox would return: the owner's key signing the 32-byte digest (raw), or the EIP-191 form over it.
export async function signDigest(owner: Owner, digest: Hex, form: DigestForm = "raw"): Promise<Hex> {
  return form === "raw" ? owner.account.sign({ hash: digest }) : owner.account.signMessage({ message: { raw: digest } });
}

// The independent recomputation: the mock's own digests (test/mock-xo/verify.ts), not the relay's.
export function expectedLoginDigest(account: Address, timestamp: string, wrapped = true): Hex {
  const inner = clobAuthDigest(account, timestamp, 0n);
  return wrapped ? kernelWrappedDigest(inner, account) : inner;
}

export function parsePrepared(value: unknown): Prepared {
  return POST_ROUTES["/v1/auth/prepare"].response.parse(value) as Prepared;
}

export async function prepareLogin(world: World, owner: Owner, extra: { readonly account?: string } = {}): Promise<Prepared> {
  const handler = world.routes["POST /v1/auth/prepare"];
  assert.ok(handler !== undefined);
  const body = POST_ROUTES["/v1/auth/prepare"].request.parse({ owner: owner.address, ...extra });
  return parsePrepared(await handler(body, world.context()));
}

export async function submitLogin(world: World, preparedId: string, signature: unknown): Promise<{ readonly credentials: "stored"; readonly key_tag: string }> {
  const handler = world.routes["POST /v1/auth/submit"];
  assert.ok(handler !== undefined);
  const body = POST_ROUTES["/v1/auth/submit"].request.parse({ prepared_id: preparedId, signature });
  const result = POST_ROUTES["/v1/auth/submit"].response.parse(await handler(body, world.context()));
  return result as { credentials: "stored"; key_tag: string };
}

// Prepare, sign as the owner and submit.
export async function connect(world: World, owner: Owner, form: DigestForm = "raw"): Promise<{ readonly prepared: Prepared; readonly signature: Hex; readonly result: { readonly credentials: "stored"; readonly key_tag: string } }> {
  const prepared = await prepareLogin(world, owner);
  const signature = await signDigest(owner, prepared.sign.expected_digest as Hex, form);
  const result = await submitLogin(world, prepared.prepared_id, signature);
  return { prepared, signature, result };
}

export async function expectRelayError(promise: Promise<unknown>, code: string, details?: Record<string, unknown>): Promise<{ readonly code: string; readonly details: unknown }> {
  try {
    await promise;
  } catch (error) {
    const err = error as { code?: unknown; details?: Record<string, unknown> | undefined; message?: string };
    assert.equal(err.code, code, `expected ${code}, got ${String(err.code)}: ${String(err.message)}`);
    for (const [key, value] of Object.entries(details ?? {})) assert.deepEqual(err.details?.[key], value, `details.${key}`);
    return { code: err.code as string, details: err.details };
  }
  assert.fail(`expected a RelayError with code ${code}, but the call succeeded`);
}

// ---- looking at what the relay sent ---------------------------------------------------------------------------------------------------

export function requestsTo(world: World, method: string, path: string): SentRequest[] {
  return world.sent.filter((entry) => entry.method === method && entry.path === path);
}

export function l2Requests(world: World): SentRequest[] {
  return world.sent.filter((entry) => entry.headers["xo_api_key"] !== undefined);
}

export function l1Requests(world: World): SentRequest[] {
  return world.sent.filter((entry) => entry.headers["xo_signature"] !== undefined && entry.headers["xo_api_key"] === undefined);
}

// The mock's own record of the account's keys (the ground truth for "how many were minted").
export function mintedKeys(mock: MockXo): number {
  return mock.write.credentials.length;
}

// ---- the secret scanner ----------------------------------------------------------------------------------------------------------------

export function forms(value: string): string[] {
  const out = new Set<string>();
  const add = (text: string): void => {
    out.add(text);
    out.add(text.toLowerCase());
  };
  add(value);
  add(JSON.stringify(value).slice(1, -1));
  add(Buffer.from(value).toString("base64"));
  add(Buffer.from(value).toString("base64").replace(/=+$/, ""));
  add(Buffer.from(value).toString("base64url"));
  add(Buffer.from(value).toString("hex"));
  add(encodeURIComponent(value));
  if (value.startsWith("0x")) add(value.slice(2));
  return [...out].filter((entry) => entry.length >= 8);
}

export function leaksIn(label: string, haystack: string | Buffer, secrets: Record<string, string>): string[] {
  const text = (typeof haystack === "string" ? Buffer.from(haystack) : haystack).toString("latin1");
  const lowered = text.toLowerCase();
  const found: string[] = [];
  for (const [name, value] of Object.entries(secrets)) {
    for (const variant of forms(value)) {
      if (text.includes(variant) || lowered.includes(variant.toLowerCase())) {
        found.push(`${label} holds ${name} (${variant.slice(0, 10)}...)`);
        break;
      }
    }
  }
  return found;
}

// ---- reading the durable state --------------------------------------------------------------------------------------------------------------

export interface PlainTriplet {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

// What the vault holds for the owner's account, decrypted (a test may look; the relay never shows it).
export async function storedTriplet(world: World, owner: Owner): Promise<PlainTriplet | undefined> {
  const secret = await world.storage.secrets?.get(owner.smart.toLowerCase(), "xo_triplet");
  if (secret === undefined) return undefined;
  return JSON.parse(secret.reveal()) as PlainTriplet;
}

export function flowOf(world: World, owner: Owner): Record<string, unknown> | undefined {
  return world.storage.state.get("credential_flow", owner.smart.toLowerCase()) as Record<string, unknown> | undefined;
}

export function statusRecord(world: World, owner: Owner): { readonly state: string; readonly key_tag: string | null } | undefined {
  return world.storage.state.get("credential_status", owner.smart.toLowerCase()) as { state: string; key_tag: string | null } | undefined;
}

export function factOf(world: World, id: string): { readonly state: string; readonly value: string | undefined; readonly source: string } | undefined {
  const fact = world.capabilities.fact(id);
  return fact === undefined ? undefined : { state: fact.state, value: fact.value, source: fact.source };
}

// A response the way the mock's reply looks to a client, for an interceptor.
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
