import assert from "node:assert/strict";
import { test } from "node:test";

import { bearerOf, checkKey, issueKey, keySha256, KeyIssueError } from "../../api/keys.js";
import { runKeysCli } from "../../api/keys-cli.js";
import { SqliteMeteringStore } from "../../api/metering-store.js";
import { Clock, forbiddenFetch, groupEnv, realLeg, startHarness, testConfig, trueoWorld } from "./helpers.js";
import { fakeBaseRpc, fakeFacilitator, paymentEnv, testPayer } from "./payments.js";
import { decodeRequired } from "./payments.js";

// Subscription keys (docs/sdk-and-api-design.md section 4): issued by the operator CLI, stored hashed, with a tier and a rate
// limit of their own, revocable, checked in constant time before any handler, sent only as Authorization: Bearer.

const NOW = Date.parse("2026-10-22T12:00:00Z");

test("a key is stored only as its sha256, and checks: good, wrong secret, unknown id, malformed, revoked, expired", () => {
  const store = SqliteMeteringStore.open(":memory:");
  try {
    const { key, row } = issueKey(store, { label: "dApp", tier: "full", perMinute: 600, burst: 100, days: 30 }, NOW);
    assert.match(key, /^imk_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    const secret = key.slice("imk_".length + 13);
    const stored = JSON.stringify(store.keys());
    assert.equal(stored.includes(key), false);
    assert.equal(stored.includes(secret), false, "the secret never reaches the store");
    assert.equal(store.key(row.id)?.keySha256, keySha256(key));
    const ok = checkKey(store, key, NOW);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.ok ? ok.limit : null, { capacity: 100, refillPerSecond: 10 });
    const wrong = `${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`;
    assert.deepEqual(checkKey(store, wrong, NOW), { ok: false, reason: "unknown" });
    assert.deepEqual(checkKey(store, `imk_${"0".repeat(12)}_${secret}`, NOW), { ok: false, reason: "unknown" });
    assert.deepEqual(checkKey(store, "not-a-key", NOW), { ok: false, reason: "malformed" });
    assert.deepEqual(checkKey(store, key, NOW + 31 * 86_400_000), { ok: false, reason: "expired" });
    assert.equal(store.revokeKey(row.id, NOW + 1), true);
    assert.equal(store.revokeKey(row.id, NOW + 2), false, "revoked once");
    assert.deepEqual(checkKey(store, key, NOW + 3), { ok: false, reason: "revoked" });
    assert.throws(() => issueKey(store, { label: "", tier: "quote" }, NOW), KeyIssueError);
    assert.throws(() => issueKey(store, { label: "x", tier: "quote", perMinute: 0 }, NOW), KeyIssueError);
    assert.throws(() => issueKey(store, { label: "x", tier: "gold" as never }, NOW), KeyIssueError);
  } finally {
    store.close();
  }
});

test("only Authorization: Bearer <key> is read", () => {
  assert.equal(bearerOf(undefined), null);
  assert.equal(bearerOf("Bearer imk_x"), "imk_x");
  for (const header of ["Basic abc", "bearer imk_x", "Bearer", "Bearer a b", ["Bearer a", "Bearer b"]] as const) assert.equal(bearerOf(header as never), "malformed");
});

test("the operator CLI issues once, lists without keys or hashes, and revokes", () => {
  const store = SqliteMeteringStore.open(":memory:");
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (line: string) => out.push(line), err: (line: string) => err.push(line) };
  try {
    assert.equal(runKeysCli(store, ["issue", "--label", "heavy user", "--tier", "quote", "--per-minute", "60", "--burst", "10"], NOW, io), 0);
    const key = out.find((line) => line.startsWith("key "))?.slice(4) ?? "";
    assert.match(key, /^imk_/);
    const id = store.keys()[0]?.id ?? "";
    out.length = 0;
    assert.equal(runKeysCli(store, ["list"], NOW, io), 0);
    assert.equal(out.length, 1);
    assert.equal(out.join("\n").includes(key), false);
    assert.equal(out.join("\n").includes(keySha256(key)), false);
    assert.match(out[0] as string, new RegExp(`^${id}  quote  60/min burst 10`));
    assert.equal(runKeysCli(store, ["revoke", id], NOW, io), 0);
    assert.equal(runKeysCli(store, ["revoke", id], NOW, io), 1);
    assert.equal(runKeysCli(store, ["issue", "--label", "x"], NOW, io), 2);
    assert.equal(runKeysCli(store, ["issue", "--label", "x", "--tier", "full", "--key", "mine"], NOW, io), 2, "no flag sets the key");
    assert.equal(runKeysCli(store, ["export"], NOW, io), 2);
  } finally {
    store.close();
  }
});

async function keyed(env: Record<string, string> = {}) {
  const world = await trueoWorld();
  const clock = new Clock(world.nowMs);
  const groups = groupEnv([{ a: realLeg("trueo", `8453:${world.liveAddress}`), b: realLeg("trueo", `8453:${world.flippedAddress}`), approved: true }]);
  const facilitator = fakeFacilitator(() => Math.floor(clock.now / 1000));
  const h = await startHarness({ clock, config: testConfig({ ...groups.env, ...env }), fetchFor: (venue) => (venue === "trueo" ? world.fetch : forbiddenFetch(venue, [])), facilitatorFetch: facilitator.fetch, assetRpcFetch: fakeBaseRpc().fetch });
  const path = `/v1/quote?group=${groups.linkIds[0]}&side=buy&size=10`;
  return { h, clock, path, facilitator, linkId: groups.linkIds[0] as string, world };
}

test("over HTTP: a good key opens a paid route with no payment configured; missing, wrong, malformed and revoked keys do not", async () => {
  const { h, clock, path, facilitator } = await keyed();
  try {
    const { key, row } = issueKey(h.metering, { label: "test", tier: "quote" }, clock.now);
    const ok = await h.get(path, { authorization: `Bearer ${key}` });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.ok(Array.isArray(ok.json["legs"]));
    assert.equal(ok.headers.get("payment-response"), null, "a key pays nothing per call");
    const none = await h.get(path);
    assert.deepEqual([none.status, (none.json["error"] as Record<string, unknown>)["code"]], [503, "payments_not_configured"]);
    for (const [name, header] of [["wrong", `Bearer ${key.slice(0, -2)}xx`], ["malformed", `Basic ${key}`], ["unknown", `Bearer imk_${"a".repeat(12)}_${"b".repeat(43)}`]] as const) {
      const refused = await h.get(path, { authorization: header });
      assert.deepEqual([refused.status, (refused.json["error"] as Record<string, unknown>)["code"]], [401, "unauthorized"], name);
      assert.equal(refused.headers.get("www-authenticate"), "Bearer");
      // A bad key is refused on the free routes too, before anything runs.
      assert.equal((await h.get("/v1/venues", { authorization: header })).status, 401, name);
    }
    // A key in the query is not a key: the query is refused as an unknown parameter.
    assert.equal((await h.get(`${path}&key=${key}`)).status, 400);
    h.metering.revokeKey(row.id, clock.now);
    const revoked = await h.get(path, { authorization: `Bearer ${key}` });
    assert.equal(revoked.status, 401);
    assert.match(String((revoked.json["error"] as Record<string, unknown>)["message"]), /revoked/);
    assert.equal(facilitator.calls.length, 0);
  } finally {
    await h.close();
  }
});

test("over HTTP: a key's own limit gives 429 with Retry-After, separate from the client's; its tier decides route prepare", async () => {
  const { h, clock, path } = await keyed({ API_ROUTE_PREPARE: "paid" });
  try {
    const small = issueKey(h.metering, { label: "small", tier: "quote", perMinute: 60, burst: 2 }, clock.now).key;
    assert.equal((await h.get(path, { authorization: `Bearer ${small}` })).status, 200);
    assert.equal((await h.get(path, { authorization: `Bearer ${small}` })).status, 200);
    const limited = await h.get(path, { authorization: `Bearer ${small}` });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1");
    assert.match(String((limited.json["error"] as Record<string, unknown>)["message"]), /for this key/);
    clock.advance(1_000);
    assert.equal((await h.get(path, { authorization: `Bearer ${small}` })).status, 200, "tokens come back with time");
    clock.advance(2_000);
    const body = { group: `lnk_${"0".repeat(32)}`, outcome: 0, side: "buy", owner: "0x1111111111111111111111111111111111111111", legs: [{ venue: "trueo", marketId: "8453:0x0000000000000000000000000000000000000001", price: "0.5", shares: "1", tif: "FOK" }] };
    const tier = await h.post("/v1/route/prepare", body, { authorization: `Bearer ${small}` });
    assert.deepEqual([tier.status, (tier.json["error"] as Record<string, unknown>)["code"]], [403, "key_tier_refused"]);
    const full = issueKey(h.metering, { label: "full", tier: "full" }, clock.now).key;
    const prepared = await h.post("/v1/route/prepare", body, { authorization: `Bearer ${full}` });
    assert.deepEqual([prepared.status, (prepared.json["error"] as Record<string, unknown>)["code"]], [404, "group_not_found"], "the handler ran for the full tier");
  } finally {
    await h.close();
  }
});

test("over HTTP: a key and a payment together are refused, and a key still works when payments are configured", async () => {
  const { h, clock, path } = await keyed(paymentEnv());
  try {
    const { key } = issueKey(h.metering, { label: "k", tier: "quote" }, clock.now);
    const challenge = await h.get(path);
    assert.equal(challenge.status, 402);
    const requirements = decodeRequired(challenge.headers.get("payment-required")).accepts[0];
    assert.ok(requirements !== undefined);
    const header = await testPayer().pay(requirements, { nowS: Math.floor(clock.now / 1000) });
    const both = await h.get(path, { authorization: `Bearer ${key}`, "payment-signature": header });
    assert.deepEqual([both.status, (both.json["error"] as Record<string, unknown>)["code"]], [400, "invalid_request"]);
    assert.equal((await h.get(path, { authorization: `Bearer ${key}` })).status, 200);
  } finally {
    await h.close();
  }
});
