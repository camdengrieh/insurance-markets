import assert from "node:assert/strict";
import { homedir, userInfo } from "node:os";
import { after, before, test } from "node:test";
import { ManualClock, seededRandom } from "../../recorder/clock.js";
import { mustConfig } from "../../recorder/config.js";
import { PoliteClient, type HttpOutcome } from "../../recorder/http.js";
import type { EventKind, RequestSpec } from "../../recorder/types.js";
import { startHost, T0, type FakeHost } from "./helpers.js";

const HOST = "orderbooks.xo.market";
const spec: RequestSpec = { host: HOST, path: "/book", query: { token_id: "abc" }, purpose: "book" };

let host: FakeHost;
let clock: ManualClock;
before(async () => {
  clock = new ManualClock(T0);
  host = await startHost(() => ({ body: { ok: true } }), () => clock.nowMs());
});
after(async () => host.close());

function client(overrides: Record<string, unknown> = {}, events: [EventKind, string | null, string][] = []): PoliteClient {
  const c = mustConfig({
    hostBases: { [HOST]: host.base },
    backoff: { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 0, maxAttempts: 3 },
    requestTimeoutMs: 600,
    ...overrides,
  });
  return new PoliteClient({ config: c, clock, rng: seededRandom(1), onEvent: (k, h, d) => events.push([k, h, d]) });
}
function reset(): void {
  host.seen.length = 0;
}

test("requests are GET only, carry the fixed generic user agent and nothing identifying", async () => {
  reset();
  const r = await client().get(spec);
  assert.equal(r.ok, true);
  assert.equal(host.seen.length, 1);
  const seen = host.seen[0];
  assert.ok(seen);
  assert.equal(seen.method, "GET");
  assert.equal(seen.path, "/book");
  assert.equal(seen.query, "?token_id=abc");
  assert.equal(seen.headers["user-agent"], "insurance-markets-research/0.1");
  for (const name of ["cookie", "authorization", "referer", "from", "x-api-key", "origin", "content-length", "content-type"]) {
    assert.equal(seen.headers[name], undefined, `header ${name} must not be sent`);
  }
  const blob = JSON.stringify(seen.headers).toLowerCase();
  assert.equal(blob.includes("@"), false);
  assert.equal(blob.includes(homedir().toLowerCase()), false);
  const name = userInfo().username.toLowerCase();
  if (name.length >= 4) assert.equal(blob.includes(name), false);
});

test("a host outside the allowlist is refused before any request is made", async () => {
  reset();
  const events: [EventKind, string | null, string][] = [];
  const c = client({}, events);
  for (const bad of [
    { host: "api.elections.kalshi.com", path: "/trade-api/v2/markets", purpose: "book" as const },
    { host: "127.0.0.1", path: "/book", purpose: "book" as const },
    { host: HOST, path: "book", purpose: "book" as const },
  ]) {
    const r = await c.get(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "refused_host");
  }
  assert.equal(host.seen.length, 0);
  assert.ok(events.some(([k]) => k === "refused"));
});

test("429 with Retry-After is honoured, then the call succeeds", async () => {
  reset();
  let n = 0;
  host.handler = () => (++n === 1 ? { status: 429, headers: { "Retry-After": "7" }, body: {} } : { body: { ok: true } });
  const events: [EventKind, string | null, string][] = [];
  const c = client({}, events);
  const before = clock.nowMs();
  const r = await c.get(spec);
  assert.equal(r.ok, true);
  assert.equal(host.seen.length, 2);
  assert.ok(clock.nowMs() - before >= 7000, "waited at least the Retry-After");
  assert.ok(events.some(([k, , d]) => k === "backoff" && /wait_ms=7000/.test(d)));
  assert.equal(c.counters().get(HOST)?.throttled, 1);
});

test("5xx and network drops back off exponentially and stop after maxAttempts", async () => {
  reset();
  host.handler = () => ({ status: 503, body: {} });
  const c = client({ breaker: { failures: 99, cooldownMs: 1000 } });
  clock.sleeps.length = 0;
  const r = await c.get(spec);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "http_error");
    assert.equal(r.status, 503);
    assert.equal(r.attempts, 3);
  }
  assert.equal(host.seen.length, 3);
  const waits = clock.sleeps.filter((s) => s >= 1000);
  assert.deepEqual(waits.slice(0, 2), [1000, 2000]);
});

test("404 is not retried and does not count against the host", async () => {
  reset();
  host.handler = () => ({ status: 404, body: {} });
  const c = client({ breaker: { failures: 1, cooldownMs: 1000 } });
  for (let i = 0; i < 3; i += 1) {
    const r = await c.get(spec);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 404);
  }
  assert.equal(host.seen.length, 3);
});

test("the circuit breaker opens after repeated failures, blocks calls, then half-opens", async () => {
  reset();
  host.handler = () => ({ status: 500, body: {} });
  const events: [EventKind, string | null, string][] = [];
  const c = client({ breaker: { failures: 2, cooldownMs: 600_000 }, backoff: { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 0, maxAttempts: 1 } }, events);
  await c.get(spec);
  await c.get(spec);
  const seenBefore = host.seen.length;
  const blocked = await c.get(spec);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "breaker_open");
  assert.equal(host.seen.length, seenBefore, "no request while the breaker is open");
  assert.ok(events.some(([k]) => k === "breaker_open"));
  clock.advance(600_001);
  host.handler = () => ({ body: { ok: true } });
  const again = await c.get(spec);
  assert.equal(again.ok, true);
});

test("the hourly budget defers requests instead of exceeding it", async () => {
  reset();
  host.handler = () => ({ body: {} });
  const c = client({ hostBudgets: { [HOST]: { rps: 3, burst: 3, maxPerHour: 4 } } });
  const outcomes: HttpOutcome[] = [];
  for (let i = 0; i < 6; i += 1) outcomes.push(await c.get(spec));
  assert.equal(outcomes.filter((o) => o.ok).length, 4);
  const refused = outcomes.filter((o) => !o.ok);
  assert.equal(refused.length, 2);
  for (const o of refused) if (!o.ok) assert.equal(o.reason, "budget");
  assert.equal(host.seen.length, 4);
  clock.advance(3_600_001);
  assert.equal((await c.get(spec)).ok, true, "the budget window rolls over");
});

test("the token bucket spaces requests at the configured rate", async () => {
  reset();
  host.handler = () => ({ body: {} });
  const c = client({ hostBudgets: { [HOST]: { rps: 2, burst: 1, maxPerHour: 1000 } } });
  const t0 = clock.nowMs();
  for (let i = 0; i < 5; i += 1) await c.get(spec);
  assert.ok(clock.nowMs() - t0 >= 4 * 500 - 5, `5 requests at 2 rps need about 2 s of simulated time, got ${clock.nowMs() - t0}`);
});

test("redirects are errors, never followed", async () => {
  reset();
  host.handler = () => ({ status: 302, headers: { Location: "http://127.0.0.1:9/elsewhere" }, body: {} });
  const r = await client().get(spec);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "redirect");
  assert.equal(host.seen.length, 1);
});

test("oversize bodies, bad JSON and slow servers fail cleanly", async () => {
  reset();
  host.handler = () => ({ raw: JSON.stringify({ pad: "x".repeat(5000) }) });
  const small = client({ maxBodyBytes: 1024 });
  const big = await small.get(spec);
  assert.equal(big.ok, false);
  if (!big.ok) assert.equal(big.reason, "too_large");

  host.handler = () => ({ raw: "<html>not json" });
  const bad = await client().get(spec);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "bad_json");

  host.handler = () => ({ body: {}, delayMs: 1500 });
  const slow = await client({ backoff: { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 0, maxAttempts: 1 } }).get(spec);
  assert.equal(slow.ok, false);
  if (!slow.ok) assert.equal(slow.reason, "timeout");
});

test("the server Date header is returned for clock-skew logging", async () => {
  reset();
  host.handler = () => ({ body: {}, headers: { Date: new Date(T0 + 45_000).toUTCString() } });
  const r = await client().get(spec);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.serverDateMs, Math.floor((T0 + 45_000) / 1000) * 1000);
});

test("a clock that moves backwards does not freeze the budget window or cause a long sleep", async () => {
  reset();
  host.handler = () => ({ body: {} });
  const c = client({ hostBudgets: { [HOST]: { rps: 2, burst: 2, maxPerHour: 1000 } } });
  await c.get(spec);
  const t = clock.nowMs();
  clock.set(t - 3 * 3_600_000);
  const before = clock.nowMs();
  const r = await c.get(spec);
  assert.equal(r.ok, true);
  assert.ok(clock.nowMs() - before < 2000, `slept ${clock.nowMs() - before} ms of simulated time`);
  clock.set(t + 1000);
});
