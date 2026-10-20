import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { Secret } from "../src/config.js";
import { createRelayClient } from "../src/relay/client.js";
import type { RelayClient, RelayResult } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../src/xo/chain/constants.js";
import { createRelay, type Relay } from "../relay/main.js";
import type { RouteTable } from "../relay/types.js";
import { FakeClock, jsonHeaders, rawRequest, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, tempDir, type TempDir } from "./relay-core-helpers.js";
import { OPEN_RATES, offlineFetch, startEmbedded, takeBlockedRequests, type StartedEmbedded } from "./local-helpers.js";

// The HTTP relay and the embedded relay are two doors into one pipeline. The same requests go through
// both, and the answers must agree: same status family, same error code, same message, same details,
// same data. A rule that one door enforces and the other forgets shows up here.

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const SIGNATURE = `0x${"11".repeat(65)}`;

const dirs: TempDir[] = [];
const relays: Relay[] = [];
after(async () => {
  for (const relay of relays.splice(0)) await relay.close().catch(() => undefined);
  for (const dir of dirs.splice(0)) await dir.cleanup().catch(() => undefined);
});

interface Pair {
  readonly http: Relay;
  readonly httpClient: RelayClient;
  readonly embedded: StartedEmbedded;
}

async function pair(env: Record<string, string> = {}, extra: { readonly routes?: RouteTable; readonly realRates?: boolean } = {}): Promise<Pair> {
  const dir = await tempDir("local-parity-");
  dirs.push(dir);
  const clock = new FakeClock("2026-10-19T12:00:00Z");
  // XO_OWNER: funding needs an established owner on the embedded door (the bare HTTP relay here has no owner policy).
  const base = { RELAY_ENFORCE_FLAG_FACTS: "0", XO_OWNER: OWNER, ...env };
  const http = await createRelay({
    env: { ...base, RELAY_DATA_DIR: dir.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0" },
    masterSecret: new Secret(TEST_MASTER_SECRET),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    now: clock.now,
    sleep: clock.sleep,
    maintenance: false,
    fetch: offlineFetch,
    ...(extra.routes === undefined ? {} : { routes: extra.routes }),
    ...(extra.realRates === true ? {} : { http: OPEN_RATES }),
  });
  relays.push(http);
  const embedded = await startEmbedded({ env: base, clock: new FakeClock("2026-10-19T12:00:00Z"), ...(extra.routes === undefined ? {} : { routes: extra.routes }), ...(extra.realRates === true ? { realRates: true } : {}) });
  return { http, httpClient: createRelayClient({ baseUrl: http.url, key: new Secret(TEST_RELAY_KEY), fetch: offlineLoopbackFetch }), embedded };
}

// The HTTP client talks to 127.0.0.1, which the network guard lets through.
const offlineLoopbackFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

function shape(result: RelayResult<unknown>): unknown {
  if (result.ok) {
    const data = JSON.parse(JSON.stringify(result.data)) as Record<string, unknown>;
    delete data["time"];
    return { ok: true, data };
  }
  return { ok: false, code: result.error.code, message: result.error.message, details: result.error.details ?? null };
}

async function same(p: Pair, call: (client: RelayClient) => Promise<RelayResult<unknown>>): Promise<RelayResult<unknown>> {
  const [a, b] = await Promise.all([call(p.httpClient), call(p.embedded.relay.client)]);
  assert.deepEqual(shape(b), shape(a), "the embedded relay answered differently from the HTTP relay");
  return b;
}

describe("the embedded relay and the HTTP relay agree", () => {
  it("on a read, a refused write, an unknown item and a bad prepared id", async () => {
    const p = await pair();
    const health = await same(p, (c) => c.get("/v1/health"));
    assert.equal(health.ok, true);
    for (const result of [
      await same(p, (c) => c.post("/v1/auth/prepare", { owner: OWNER })),
      await same(p, (c) => c.post("/v1/funding/check", { owner: OWNER, amount: "1" })),
      await same(p, (c) => c.post("/v1/order/prepare", { owner: OWNER, token_id: "1", side: "BUY", price: "0.4", shares: "10", tif: "GTD" })),
      await same(p, (c) => c.post("/v1/userop/submit", { prepared_id: "0".repeat(32), signature: SIGNATURE })),
      await same(p, (c) => c.post("/v1/order/submit", { prepared_id: "1".repeat(32), signature: SIGNATURE })),
    ]) {
      assert.equal(result.ok, false);
    }
    // Status of something the relay never saw: whatever one door says, the other says too.
    await same(p, (c) => c.get(`/v1/order/0x${"cd".repeat(32)}`));
    await same(p, (c) => c.get(`/v1/userop/0x${"cd".repeat(32)}`));
  });

  it("on the kill switch", async () => {
    const p = await pair({ XO_KILL_SWITCH: "1", ENABLE_TRADING: "1" });
    for (const result of [
      await same(p, (c) => c.post("/v1/auth/prepare", { owner: OWNER })),
      await same(p, (c) => c.post("/v1/order/cancel", { owner: OWNER, order_hash: `0x${"ab".repeat(32)}` })),
      await same(p, (c) => c.post("/v1/userop/submit", { prepared_id: "0".repeat(32), signature: SIGNATURE })),
    ]) {
      assert.equal(result.ok ? "" : result.error.code, "kill_switch");
    }
    assert.equal((await same(p, (c) => c.get("/v1/health"))).ok, true);
  });

  it("on a dry-run prepare while XO is unreachable (a coded failure from both, reading only XO hosts)", async () => {
    const p = await pair();
    const result = await same(p, (c) => c.post("/v1/userop/prepare", { owner: OWNER, action: "enable_trading", params: {} }));
    assert.equal(result.ok, false);
    const hosts = new Set(takeBlockedRequests().map((entry) => entry.split(" ")[1]));
    for (const host of hosts) assert.match(String(host), /\.xo\.market$/);
  });

  it("on handler errors: a RelayError with details, a thrown Error, a bad answer", async () => {
    const routes: RouteTable = {
      "POST /v1/auth/prepare": async () => {
        throw new RelayError("capability_unknown", "A fact is missing.", { id: "OR10" });
      },
      "POST /v1/funding/check": async () => {
        throw new Error("a stray secret-looking value 0123456789abcdef");
      },
      "POST /v1/order/cancel": (async () => ({ nonsense: 1 })) as never,
    };
    const p = await pair({}, { routes });
    const a = await same(p, (c) => c.post("/v1/auth/prepare", { owner: OWNER }));
    assert.equal(a.ok ? "" : a.error.code, "capability_unknown");
    const b = await same(p, (c) => c.post("/v1/funding/check", { owner: OWNER, amount: "1" }));
    assert.equal(b.ok ? "" : b.error.code, "internal");
    const c = await same(p, (client) => client.post("/v1/order/cancel", { owner: OWNER, order_hash: `0x${"ab".repeat(32)}` }));
    assert.equal(c.ok ? "" : c.error.code, "internal");
  });

  it("on the per-endpoint rate limit (burst of 6 writes, then refused)", async () => {
    const p = await pair({}, { realRates: true });
    for (let index = 0; index < 8; index += 1) {
      const result = await same(p, (c) => c.post("/v1/auth/prepare", { owner: OWNER }));
      assert.equal(result.ok ? "" : result.error.code, index < 6 ? "flag_off" : "rate_limited");
    }
  });

  it("on requests the client would never send: forbidden keys, bad JSON, queries, wrong method, unknown path, a big body", async () => {
    const p = await pair();
    const cases: Array<{ readonly name: string; readonly method: "GET" | "POST"; readonly path: string; readonly body?: string }> = [
      { name: "__proto__", method: "POST", path: "/v1/auth/prepare", body: `{"owner":"${OWNER}","__proto__":{"a":1}}` },
      { name: "nested constructor", method: "POST", path: "/v1/auth/prepare", body: `{"owner":"${OWNER}","x":[{"constructor":1}]}` },
      { name: "not json", method: "POST", path: "/v1/auth/prepare", body: "{nope" },
      { name: "extra field", method: "POST", path: "/v1/auth/prepare", body: `{"owner":"${OWNER}","extra":1}` },
      { name: "query string", method: "GET", path: "/v1/health?a=b" },
      { name: "traversal", method: "GET", path: "/v1/../v1/health" },
      { name: "wrong method on a POST route", method: "GET", path: "/v1/auth/prepare" },
      { name: "wrong method on a GET route", method: "POST", path: "/v1/health", body: "{}" },
      { name: "unknown path", method: "GET", path: "/v1/elsewhere" },
      { name: "bad hash", method: "GET", path: "/v1/order/0x12" },
      { name: "body too large", method: "POST", path: "/v1/auth/prepare", body: JSON.stringify({ owner: OWNER, pad: "x".repeat(70_000) }) },
    ];
    for (const entry of cases) {
      const http = await rawRequest({
        port: p.http.port,
        method: entry.method,
        path: entry.path,
        headers: jsonHeaders(TEST_RELAY_KEY, entry.body === undefined ? {} : { "content-length": String(Buffer.byteLength(entry.body)) }),
        ...(entry.body === undefined ? {} : { body: entry.body }),
      });
      const reply = await p.embedded.relay.handler({ method: entry.method, path: entry.path, bodyText: entry.body, signal: new AbortController().signal });
      const embedded = JSON.parse(reply.bodyText) as { error?: { code: string; details?: unknown } };
      const wire = http.json as { error?: { code: string; details?: unknown } };
      assert.equal(reply.status, http.status, `${entry.name}: status`);
      assert.equal(embedded.error?.code, wire.error?.code, `${entry.name}: code`);
      assert.deepEqual(embedded.error?.details, wire.error?.details, `${entry.name}: details`);
    }
  });
});
