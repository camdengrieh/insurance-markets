import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";

import { API_LIMITS } from "../../api/config.js";
import { Clock, forbiddenFetch, startHarness, testConfig, trueoWorld } from "./helpers.js";

// The HTTP surface: fixed JSON errors, the stated per-client limits with 429 and Retry-After, request size limits, CORS for
// the configured dApp origin only, and the health route. No secret is configured anywhere here.

async function harness() {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  const h = await startHarness({ fetchFor: (venue) => (venue === "trueo" ? world.fetch : forbiddenFetch(venue, [])), clock });
  return { h, clock };
}

function raw(origin: string, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<{ status: number; headers: Record<string, unknown>; text: string }> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, method, path, headers }, (res) => {
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

test("health states the version, the served venues and the limits, and needs no secret", async () => {
  const { h } = await harness();
  try {
    const answer = await h.get("/v1/health");
    assert.equal(answer.status, 200);
    assert.equal(answer.json["ok"], true);
    assert.deepEqual(answer.json["limits"], {
      markets: { burst: API_LIMITS.markets.capacity, perMinute: 30 },
      reads: { burst: API_LIMITS.reads.capacity, perMinute: 60 },
      maxUrlChars: API_LIMITS.maxUrlChars,
      paid: { burst: API_LIMITS.paid.capacity, perMinute: 30, note: "per client without a key; a key brings its own limit" },
      bodies: `POST /v1/route/prepare only: JSON, at most ${API_LIMITS.maxBodyBytes} bytes`,
    });
    // Metering is stated: keys, route prepare off by default, no payment configured.
    assert.deepEqual(answer.json["metering"], { keys: "Authorization: Bearer <key> (issued by the operator)", routePrepare: "off", x402: { configured: false } });
    assert.equal(answer.headers.get("cache-control"), "no-store");
    assert.match(answer.headers.get("x-request-id") ?? "", /^req_[0-9a-f]{12}$/);
  } finally {
    await h.close();
  }
});

test("each client gets the stated burst, then 429 with Retry-After, and tokens come back with time", async () => {
  const { h, clock } = await harness();
  try {
    for (let i = 0; i < API_LIMITS.markets.capacity; i += 1) assert.equal((await h.get("/v1/markets?venue=trueo")).status, 200, `request ${i}`);
    const refused = await h.get("/v1/markets?venue=trueo");
    assert.equal(refused.status, 429);
    assert.deepEqual(Object.keys(refused.json), ["error"]);
    assert.equal((refused.json["error"] as Record<string, unknown>)["code"], "rate_limited");
    assert.equal(refused.headers.get("retry-after"), "2");
    // With no proxy configured, a forwarded-for header is not believed.
    assert.equal((await h.get("/v1/markets?venue=trueo", { "x-forwarded-for": "198.51.100.9" })).status, 429);
    // The other class has its own bucket.
    assert.equal((await h.get("/v1/venues")).status, 200);
    clock.advance(2_000);
    assert.equal((await h.get("/v1/markets?venue=trueo")).status, 200);
  } finally {
    await h.close();
  }
});

test("behind a configured proxy the client is the forwarded address; without one the header is ignored", async () => {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  const config = testConfig({ API_TRUST_PROXY_HOPS: "1" });
  const h = await startHarness({ config, fetchFor: (venue) => (venue === "trueo" ? world.fetch : forbiddenFetch(venue, [])), clock });
  try {
    for (let i = 0; i < API_LIMITS.reads.capacity; i += 1) await h.get("/v1/groups", { "x-forwarded-for": "198.51.100.7" });
    assert.equal((await h.get("/v1/groups", { "x-forwarded-for": "198.51.100.7" })).status, 429);
    assert.equal((await h.get("/v1/groups", { "x-forwarded-for": "198.51.100.8" })).status, 200);
  } finally {
    await h.close();
  }
});

test("fixed JSON errors: unknown route, wrong method, a body, an over-long target, a bad query", async () => {
  const { h } = await harness();
  try {
    const code = (text: string): unknown => (JSON.parse(text) as { error: { code: string } }).error.code;
    const notFound = await raw(h.server.origin, "GET", "/v1/nothing");
    assert.deepEqual([notFound.status, code(notFound.text)], [404, "not_found"]);
    const post = await raw(h.server.origin, "POST", "/v1/markets", { "content-type": "application/json" }, "{}");
    assert.deepEqual([post.status, code(post.text)], [405, "method_not_allowed"]);
    assert.equal(post.headers["allow"], "GET, HEAD, OPTIONS");
    const body = await raw(h.server.origin, "GET", "/v1/venues", { "content-length": "2" }, "{}");
    assert.deepEqual([body.status, code(body.text)], [413, "payload_too_large"]);
    const long = await raw(h.server.origin, "GET", `/v1/markets?q=${"a".repeat(API_LIMITS.maxUrlChars)}`);
    assert.deepEqual([long.status, code(long.text)], [414, "uri_too_long"]);
    for (const query of ["?category=nonsense", "?limit=0", "?limit=101", "?unknown=1", "?q=a&q=b", "?cursor=-1", "?venue=trueo&venue=trueo"]) {
      const bad = await h.get(`/v1/markets${query}`);
      assert.deepEqual([bad.status, (bad.json["error"] as Record<string, unknown>)["code"]], [400, "invalid_request"], query);
    }
    const extra = await h.get("/v1/venues?x=1");
    assert.equal(extra.status, 400);
    const head = await raw(h.server.origin, "HEAD", "/v1/health");
    assert.deepEqual([head.status, head.text], [200, ""]);
  } finally {
    await h.close();
  }
});

test("CORS headers only for the configured dApp origin, and a preflight for it", async () => {
  const { h } = await harness();
  try {
    const allowed = await h.get("/v1/venues", { origin: "https://app.example.org" });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.org");
    assert.equal(allowed.headers.get("vary"), "Origin");
    const other = await h.get("/v1/venues", { origin: "https://elsewhere.example.org" });
    assert.equal(other.status, 200);
    assert.equal(other.headers.get("access-control-allow-origin"), null);
    const preflight = await raw(h.server.origin, "OPTIONS", "/v1/markets", { origin: "https://app.example.org", "access-control-request-method": "GET" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], "https://app.example.org");
    assert.equal(preflight.headers["access-control-allow-methods"], "GET, HEAD, OPTIONS");
    const refused = await raw(h.server.origin, "OPTIONS", "/v1/markets", { origin: "https://elsewhere.example.org" });
    assert.equal(refused.headers["access-control-allow-origin"], undefined);
  } finally {
    await h.close();
  }
});

test("q, category and paging filter the served rows", async () => {
  const { h } = await harness();
  try {
    const all = await h.get("/v1/markets?venue=trueo&limit=1");
    assert.equal((all.json["markets"] as unknown[]).length, 1);
    assert.equal(all.json["next"], "1");
    const second = await h.get("/v1/markets?venue=trueo&limit=1&cursor=1");
    assert.equal((second.json["markets"] as unknown[]).length, 1);
    assert.equal(second.json["next"], null);
    const q = await h.get("/v1/markets?q=arbitrum");
    assert.equal((q.json["markets"] as unknown[]).length, 1);
    const none = await h.get("/v1/markets?category=sports");
    assert.equal((none.json["markets"] as unknown[]).length, 0);
  } finally {
    await h.close();
  }
});
