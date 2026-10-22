import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

import { createApi, type Api } from "../../api/app.js";
import { assertStartable, loadApiConfig, type ApiConfig } from "../../api/config.js";
import { API_SERVING_POLICY, type ServingPolicy } from "../../api/serving.js";
import { startApiServer, type RunningServer } from "../../api/server.js";
import { SqliteIndexStore, type IndexStore } from "../../api/store.js";
import { sha256Hex } from "../../sdk/hash.js";
import { APPROVAL_ACK, approveLink } from "../../sdk/links/approve.js";
import { buildBundle, serializeBundle } from "../../sdk/links/bundle.js";
import { contentSha256, type CandidateInput, type Link, type LinkLeg } from "../../sdk/links/schema.js";
import { findLink, proposeLink, type Registry } from "../../sdk/links/store.js";
import type { FetchLike, VenueId } from "../../sdk/model.js";
import { termsAllowPersistence } from "../../sdk/venues/licence.js";

// Test support for the API: a config, a server on a free loopback port, a clock the test moves, and the SDK's recorded
// venue worlds (loaded at run time: their modules import JSON, which the root typecheck does not resolve).

const REPO = join(import.meta.dirname, "..", "..");

export interface TrueoWorld {
  readonly fetch: FetchLike;
  readonly requests: readonly unknown[];
  readonly nowMs: number;
  readonly liveAddress: string;
}

// The SDK's Trueo world: markets read from Base mainnet on 2026-10-20 (sdk/venues/trueo/fixtures/scenario.ts), behind a
// fake JSON-RPC endpoint.
export async function trueoWorld(): Promise<TrueoWorld> {
  const scenario = (await import(pathToFileURL(join(REPO, "sdk/venues/trueo/fixtures/scenario.ts")).href)) as {
    buildWorld(): { rpc: { fetch: FetchLike; requests: unknown[] }; live: { address: string } };
    NOW_MS: number;
  };
  const world = scenario.buildWorld();
  return { fetch: world.rpc.fetch, requests: world.rpc.requests, nowMs: scenario.NOW_MS, liveAddress: world.live.address };
}

export interface PolymarketFixtures {
  readonly listUrl: string;
  readonly listBody: unknown;
}

// Polymarket's recorded Gamma market list (sdk/venues/polymarket/fixtures), as the SDK's state tests serve it.
export async function polymarketFixtures(): Promise<PolymarketFixtures> {
  const load = (await import(pathToFileURL(join(REPO, "sdk/venues/polymarket/fixtures/load.ts")).href)) as {
    recorded: { marketsList(): unknown[] };
    keysetEnvelope(rows: unknown[], next: string | null): unknown;
  };
  return { listUrl: "https://gamma-api.polymarket.com/markets/keyset?closed=false&limit=50", listBody: load.keysetEnvelope(load.recorded.marketsList(), null) };
}

export function testConfig(env: Record<string, string> = {}): ApiConfig {
  const dir = mkdtempSync(join(tmpdir(), "api-test-"));
  return assertStartable(loadApiConfig({ API_DATA_DIR: dir, API_PORT: "0", API_CORS_ORIGINS: "https://app.example.org", ...env }));
}

export class Clock {
  now: number;
  constructor(start: number) {
    this.now = start;
  }
  readonly read = (): number => this.now;
  advance(ms: number): void {
    this.now += ms;
  }
}

// A fetch that fails the test if a venue is ever asked.
export function forbiddenFetch(venue: string, calls: string[]): FetchLike {
  return async (input) => {
    calls.push(`${venue} ${input}`);
    throw new Error(`venue ${venue} must never be asked (${input})`);
  };
}

export interface Harness {
  readonly api: Api;
  readonly server: RunningServer;
  readonly store: IndexStore;
  get(path: string, headers?: Record<string, string>): Promise<{ status: number; headers: Headers; json: Record<string, unknown> }>;
  close(): Promise<void>;
}

export interface HarnessOptions {
  readonly config?: ApiConfig;
  readonly policy?: ServingPolicy;
  readonly fetchFor: (venue: VenueId) => FetchLike;
  readonly rpcFetch?: FetchLike;
  readonly clock: Clock;
  readonly store?: IndexStore;
}

export async function startHarness(options: HarnessOptions): Promise<Harness> {
  const config = options.config ?? testConfig();
  const policy = options.policy ?? API_SERVING_POLICY;
  const store = options.store ?? SqliteIndexStore.open(":memory:");
  const api = createApi({
    config,
    policy,
    store,
    fetchFor: options.fetchFor,
    rpcFetch: options.rpcFetch ?? (async () => {
      throw new Error("no RPC in this test");
    }),
    nowMs: options.clock.read,
  });
  const server = await startApiServer({ api, config, policy, nowMs: options.clock.read });
  return {
    api,
    server,
    store,
    async get(path, headers = {}) {
      const response = await fetch(`${server.origin}${path}`, { headers });
      const text = await response.text();
      return { status: response.status, headers: response.headers, json: (text === "" ? {} : JSON.parse(text)) as Record<string, unknown> };
    },
    async close() {
      await server.close();
      store.close();
    },
  };
}

// Every value under a `venue` key anywhere in a body.
export function venuesNamed(body: unknown): string[] {
  const out: string[] = [];
  const stack: unknown[] = [body];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== "object" || value === null) continue;
    if (Array.isArray(value)) stack.push(...value);
    else {
      const record = value as Record<string, unknown>;
      if (typeof record["venue"] === "string") out.push(record["venue"]);
      stack.push(...Object.values(record));
    }
  }
  return out;
}

// ---- link bundles -------------------------------------------------------------------------------------------------------
//
// TEST links (ids start with TEST-, hashes are of invented labels), proposed and approved through the SDK's own registry
// functions and bundled with their pin, as pm writes them.

export const TODAY = "2026-10-22";
export const CLOSE = "2026-12-31T23:59:00Z";

export const hash = (label: string): string => sha256Hex(`TEST:${label}`);

export function leg(venue: LinkLeg["venue"], id: string, rules = id): LinkLeg {
  return { venue, marketId: `TEST-${id}`, outcomeMap: [0, 1], rulesSha256: hash(`rules:${rules}`), maskedSha256: hash(`mask:${rules}`), closeUtc: CLOSE, voidPolicy: "refund", resolverId: null, creatorAllowlisted: venue === "xo" ? true : null, groupKey: null };
}

export function identity(a: LinkLeg, b: LinkLeg, proof: CandidateInput["proof"]): CandidateInput {
  return { relation: "identity", legs: [a, b], basis: { class: "identical", axes: [], cutoffDeltaMinutes: 0 }, proof, validUntil: CLOSE, synthetic: false };
}

export const SLOT_EQUAL: CandidateInput["proof"] = { level: "P1_slot_equal", evidence: [{ method: "slot_equal", detail: "test_equal_slots" }] };
export const STATISTICS: CandidateInput["proof"] = { level: "P_unproven", evidence: [{ method: "statistics_hint", detail: "s9100.t95.r90.n100.d100.c1h" }] };

export function propose(reg: Registry, input: CandidateInput, source: "structural" | "statistics"): { registry: Registry; link: Link } {
  const r = proposeLink(reg, input, { source, id: `test-${source}` }, { today: TODAY }, termsAllowPersistence);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  return r.value;
}

export function approve(reg: Registry, linkId: string): Registry {
  const link = findLink(reg, linkId);
  assert.ok(link);
  const r = approveLink(reg, linkId, { reviewer: "reviewer-a", date: TODAY, evidence: ["test: both rule texts read"], digest: contentSha256(link), acknowledgement: APPROVAL_ACK }, { today: TODAY }, termsAllowPersistence);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  return r.value.registry;
}

export function writeBundle(dir: string, name: string, reg: Registry, includeCandidates: boolean): { bundle: string; pin: string } {
  const built = buildBundle(reg, { createdAt: "2026-10-22T12:00:00Z", includeCandidates }, termsAllowPersistence);
  assert.ok(built.ok, built.ok ? "" : built.errors.join("; "));
  const bundle = join(dir, `${name}.bundle.json`);
  const pin = join(dir, `${name}.bundle.pin`);
  writeFileSync(bundle, serializeBundle(built.value));
  writeFileSync(pin, `${built.value.manifestSha256}\n`);
  return { bundle, pin };
}

