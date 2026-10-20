import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { utcDayKey } from "../src/guardrails/limits.js";
import { CryptoError } from "../relay/crypto.js";
import { needService } from "../relay/config.js";
import { guardWrite } from "../relay/capabilities.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createRelay, type CreateRelayOptions, type Relay } from "../relay/main.js";
import type { RouteTable } from "../relay/types.js";
import { StoreError } from "../relay/store.js";
import { RelayError } from "../src/relay/errors.js";
import { addr, FakeClock, hex32, pause, rawRequest, secret, tempDir, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, type TempDir } from "./relay-core-helpers.js";

// The whole relay, stopped and started again on the same data directory, cleanly and by crash:
// caps are not reset, nothing is sent twice, watchers and facts come back, the lock and the master
// secret are enforced.

const dirs: TempDir[] = [];
const running: Relay[] = [];
after(async () => {
  for (const relay of running) await relay.close().catch(() => undefined);
  for (const made of dirs) await made.cleanup();
});

const OWNER = addr(0x11);
const ACCOUNT = addr(0x22);
const USD = 1_000_000n;

const submitRoute: NonNullable<RouteTable["POST /v1/order/submit"]> = async (body, context) => {
  const prepared = needService(context, "prepared");
  const upstream = needService(context, "upstream");
  const record = await prepared.beginSend(body.prepared_id);
  try {
    const response = await upstream.request({ method: "POST", url: "https://orderbooks.xo.market/order", body: JSON.stringify({ id: record.id }), purpose: "post_order" });
    await prepared.resolve(record.id, response.ok ? "accepted" : "rejected", response.ok ? "posted" : "refused");
    return { state: response.ok ? "accepted" : "rejected", order_hash: hex32(1) };
  } catch {
    await prepared.resolve(record.id, "ambiguous", "upstream_failed");
    return { state: "ambiguous", order_hash: hex32(1) };
  }
};

interface Rig {
  readonly dir: string;
  readonly clock: FakeClock;
  start(options?: Partial<CreateRelayOptions> & { env?: Record<string, string> }): Promise<Relay>;
}

async function rig(): Promise<Rig> {
  const made = await tempDir();
  dirs.push(made);
  const clock = new FakeClock();
  return {
    dir: made.dir,
    clock,
    async start(options = {}) {
      const { env, ...rest } = options;
      const relay = await createRelay({
        env: { RELAY_DATA_DIR: made.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", RELAY_ENFORCE_FLAG_FACTS: "0", ...env },
        masterSecret: secret(TEST_MASTER_SECRET),
        kdf: TEST_KDF,
        allowWeakKdf: true,
        now: clock.now,
        maintenance: false,
        routes: { ...healthRoutes, "POST /v1/order/submit": submitRoute },
        http: { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 }, requestBudgetMs: 5_000 },
        fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
        ...rest,
      });
      running.push(relay);
      return relay;
    },
  };
}

async function reserveSpend(relay: Relay, clock: FakeClock, amountAtomic: bigint, id?: string): Promise<boolean> {
  const result = await relay.services.ledger.reserveFor({
    kind: "spend",
    account: ACCOUNT,
    day: utcDayKey(clock.now()) as string,
    amountAtomic,
    limitAtomic: 1_000n * USD,
    category: "order",
    expiresAtMs: clock.now() + 300_000,
    ...(id === undefined ? {} : { reservationId: id }),
  });
  return result.reserved;
}

async function submit(relay: Relay, preparedId: string): Promise<{ status: number; json: unknown }> {
  const response = await rawRequest({
    port: relay.port,
    method: "POST",
    path: "/v1/order/submit",
    headers: { "content-type": "application/json", "x-relay-key": TEST_RELAY_KEY },
    body: JSON.stringify({ prepared_id: preparedId, signature: `0x${"11".repeat(65)}` }),
  });
  return { status: response.status, json: response.json };
}

function hangingFetch(counter: { posts: number }): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") counter.posts += 1;
    return new Promise<Response>(() => undefined);
  }) as typeof fetch;
}

describe("caps survive a restart", () => {
  for (const how of ["close", "crash"] as const) {
    it(`keeps the day's spend and the funding total after a ${how === "close" ? "clean stop" : "crash"}`, async () => {
      const r = await rig();
      const first = await r.start();
      for (let index = 0; index < 4; index += 1) assert.equal(await reserveSpend(first, r.clock, 10n * USD), true);
      assert.equal(await reserveSpend(first, r.clock, 5n * USD), true);
      const fund = await first.services.ledger.reserveFor({ kind: "fund", account: ACCOUNT, day: first.services.ledger.currentDay(), amountAtomic: 9n * USD, limitAtomic: 50n * USD, category: "funding", expiresAtMs: r.clock.now() + 300_000 });
      assert.equal(fund.reserved, true);
      if (how === "close") await first.close();
      else await first.abandon();

      const second = await r.start();
      assert.equal(await reserveSpend(second, r.clock, 6n * USD), false, "$45 are already spent today");
      assert.equal(await reserveSpend(second, r.clock, 5n * USD), true);
      const more = await second.services.ledger.reserveFor({ kind: "fund", account: ACCOUNT, day: second.services.ledger.currentDay(), amountAtomic: 2n * USD, limitAtomic: 50n * USD, category: "funding", expiresAtMs: r.clock.now() + 300_000 });
      assert.equal(more.reserved, false);
      assert.equal(more.reserved ? "" : more.reason, "funding_total_cap");
      await second.close();
    });
  }
});

describe("nothing is sent twice", () => {
  it("marks a send that was in flight at a crash as ambiguous, holds its reservation, alerts, and refuses to send it again", async () => {
    const r = await rig();
    const counter = { posts: 0 };
    // Only this test wants the short budget (the POST hangs, so the answer is `pending`); the others wait for the final answer.
    const first = await r.start({ fetch: hangingFetch(counter), http: { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 }, requestBudgetMs: 150 } });
    const reservationId = "resv0000000001";
    assert.equal(await reserveSpend(first, r.clock, 4n * USD, reservationId), true);
    const record = await first.services.prepared.create({
      kind: "order",
      owner: OWNER,
      account: ACCOUNT,
      digest: hex32(0xd1) as `0x${string}`,
      digestForm: "kernelWrappedOrderHash",
      payload: { note: "an order" },
      reservationIds: [reservationId],
    });
    const answer = await submit(first, record.id);
    assert.equal(answer.status, 202, "the POST is hanging, so the relay answers pending");
    assert.equal(counter.posts, 1);
    assert.equal(first.services.prepared.get(record.id)?.state, "sending");
    await first.abandon();

    const secondCounter = { posts: 0 };
    const second = await r.start({ fetch: hangingFetch(secondCounter) });
    assert.equal(second.recovered.interruptedSends, 1);
    assert.equal(second.services.prepared.get(record.id)?.state, "ambiguous");
    assert.equal(second.services.prepared.get(record.id)?.detail, "interrupted_by_restart");
    assert.equal(second.services.ledger.reservation(reservationId)?.hold, true);
    assert.equal(second.services.ledger.reservation(reservationId)?.state, "reserved");
    assert.equal((await second.services.ledger.usageDetail(ACCOUNT)).spentAtomic, 4n * USD, "the cap is still used");

    const again = await submit(second, record.id);
    assert.equal(again.status, 409);
    assert.equal((again.json as { error: { code: string } }).error.code, "prepared_used");
    assert.equal(secondCounter.posts, 0, "the restarted relay made no request for it");
    const alerts = await readFile(join(r.dir, "logs", "alerts.log"), "utf8");
    assert.match(alerts, /send_interrupted_by_restart/);
    await second.close();
  });

  it("does not resend an item whose send was acknowledged either", async () => {
    const r = await rig();
    const counter = { posts: 0 };
    const first = await r.start({ fetch: (async (_i: unknown, init?: RequestInit) => { if (init?.method === "POST") counter.posts += 1; return new Response("{}", { status: 200 }); }) as typeof fetch });
    const record = await first.services.prepared.create({ kind: "order", owner: OWNER, account: ACCOUNT, digest: hex32(0xd2) as `0x${string}`, digestForm: "kernelWrappedOrderHash", payload: null });
    assert.equal((await submit(first, record.id)).status, 200);
    assert.equal((await submit(first, record.id)).status, 409);
    await first.close();
    const second = await r.start();
    assert.equal(second.recovered.interruptedSends, 0);
    assert.equal((await submit(second, record.id)).status, 409);
    assert.equal(counter.posts, 1);
    await second.close();
  });

  it("keeps an item that was prepared but not sent usable after a crash, and expires it on time", async () => {
    const r = await rig();
    const first = await r.start();
    const reservationId = "resv0000000002";
    await reserveSpend(first, r.clock, 3n * USD, reservationId);
    const record = await first.services.prepared.create({ kind: "order", owner: OWNER, account: ACCOUNT, digest: hex32(0xd3) as `0x${string}`, digestForm: "kernelWrappedOrderHash", payload: null, reservationIds: [reservationId] });
    await first.abandon();
    r.clock.advance(60_000);
    const second = await r.start();
    assert.equal(second.recovered.interruptedSends, 0);
    assert.equal(second.services.prepared.get(record.id)?.state, "prepared");
    r.clock.advance(300_000);
    await second.services.prepared.sweep();
    assert.equal(second.services.prepared.get(record.id)?.state, "expired");
    // Expiry alone does not give the cap back: that takes evidence the item is gone.
    assert.equal((await second.services.ledger.usageDetail(ACCOUNT, utcDayKey(r.clock.now() - 360_000) as string)).spentAtomic, 3n * USD);
    await assert.rejects(second.services.ledger.release(reservationId), (error: unknown) => error instanceof RelayError && error.code === "precondition_failed");
    await second.close();
  });
});

describe("state that has to come back", () => {
  it("brings back capability facts, tripwires, watcher records and stored secrets", async () => {
    const r = await rig();
    const first = await r.start();
    await first.services.capabilities.record({ id: "AD5", state: "yes", source: "probe", note: "T1 passed" });
    await first.services.tripwires.trip({ id: "exchange_upgraded", detail: "A second Upgraded event appeared." });
    await first.services.state.set("watchers", "cond-1", { condition: hex32(0xc1), cursorBlock: 12_610_000, windowMs: 60_000 });
    await first.services.secrets?.put(ACCOUNT, "hmac_triplet", JSON.stringify({ key: "K", secret: "S", passphrase: "P" }));
    await first.abandon();

    const second = await r.start({ env: { ENABLE_TRADING: "1" } });
    assert.equal(second.services.capabilities.state("AD5"), "yes");
    assert.equal(second.services.capabilities.fact("AD5")?.note, "T1 passed");
    assert.equal(second.services.tripwires.isTripped(), true);
    assert.deepEqual(second.services.state.get("watchers", "cond-1"), { condition: hex32(0xc1), cursorBlock: 12_610_000, windowMs: 60_000 });
    assert.equal((await second.services.secrets?.get(ACCOUNT, "hmac_triplet"))?.reveal(), JSON.stringify({ key: "K", secret: "S", passphrase: "P" }));
    // A write is refused straight away: the tripwire outlived the process.
    const context = { flags: second.flags, now: () => r.clock.now(), requestId: "r", signal: new AbortController().signal, services: second.services };
    assert.equal(second.flags().ENABLE_TRADING, true);
    assert.throws(() => guardWrite(context, "ENABLE_TRADING"), (error: unknown) => error instanceof RelayError && error.code === "tripwire");
    await second.close();
  });

  it("lets a watcher loop pick up where it stopped", async () => {
    const r = await rig();
    // A minimal stand-in for the creation stream's review poller: it keeps a cursor per watched market.
    const advance = async (relay: Relay, key: string, steps: number): Promise<number> => {
      for (let index = 0; index < steps; index += 1) {
        await relay.services.state.transact((reader) => {
          const current = reader.get<{ cursor: number }>("watchers", key) ?? { cursor: 0 };
          return { ops: [{ ns: "watchers", key, value: { cursor: current.cursor + 1 } }], result: undefined };
        });
      }
      return (relay.services.state.get<{ cursor: number }>("watchers", key) as { cursor: number }).cursor;
    };
    const first = await r.start();
    assert.equal(await advance(first, "m1", 3), 3);
    await first.abandon();
    const second = await r.start();
    assert.equal(second.services.state.keys("watchers").length, 1, "the watcher is still registered");
    assert.equal(await advance(second, "m1", 2), 5, "it resumed from 3, not from 0");
    await second.close();
  });

  it("brings back a half-written journal tail as a clean store, and says how much it dropped", async () => {
    const r = await rig();
    const first = await r.start();
    await first.services.state.set("meta", "k", "v");
    await first.abandon();
    await appendFile(join(r.dir, "journal.log"), "0badc0de {\"s\":999,\"t\":0,\"o\":[[\"meta\",\"k\"");
    const second = await r.start();
    assert.ok(second.recovered.tornJournalBytes > 0);
    assert.equal(second.services.state.get("meta", "k"), "v");
    await second.close();
  });
});

describe("start-up refusals", () => {
  it("refuses a second relay on the same data directory, and works once the first has stopped", async () => {
    const r = await rig();
    const first = await r.start();
    await assert.rejects(r.start(), (error: unknown) => error instanceof StoreError && error.code === "locked");
    await first.close();
    await (await r.start()).close();
  });

  it("refuses the wrong master secret without leaving the directory locked", async () => {
    const r = await rig();
    await (await r.start()).close();
    await assert.rejects(r.start({ masterSecret: secret("another-master-secret-0123456") }), (error: unknown) => error instanceof CryptoError && error.code === "wrong_master_key");
    await (await r.start()).close();
  });

  it("refuses to start with the credential store on and no master secret, and with it off needs none", async () => {
    const r = await rig();
    await assert.rejects(createRelay({ env: { RELAY_DATA_DIR: r.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0" } }), /RELAY_MASTER_KEY/);
    const relay = await createRelay({ env: { RELAY_DATA_DIR: r.dir, XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_PORT: "0", RELAY_CREDENTIAL_STORE: "off" }, maintenance: false, now: r.clock.now });
    running.push(relay);
    assert.equal(relay.services.secrets, undefined);
    await relay.close();
  });
});

describe("the assembled relay", () => {
  it("serves health with the effective flags: on in the environment is not enough without its test results", async () => {
    const r = await rig();
    const relay = await r.start({ env: { RELAY_ENFORCE_FLAG_FACTS: "1", ENABLE_TRADING: "1", ENABLE_USEROP_SUBMIT: "1", RELAY_ARM: "ENABLE_USEROP_SUBMIT" } });
    const health = await rawRequest({ port: relay.port, headers: { "x-relay-key": TEST_RELAY_KEY } });
    const body = health.json as { status: string; flags: Record<string, boolean>; kill: boolean };
    assert.equal(body.flags["ENABLE_TRADING"], false);
    assert.equal(body.flags["ENABLE_USEROP_SUBMIT"], true, "armed for its test");
    assert.equal(body.status, "ok");
    for (const id of ["T1", "T2", "T3b"]) await relay.services.capabilities.record({ id, state: "yes", source: "operator" });
    const after = await rawRequest({ port: relay.port, headers: { "x-relay-key": TEST_RELAY_KEY } });
    assert.equal((after.json as { flags: Record<string, boolean> }).flags["ENABLE_TRADING"], true);
    await relay.close();
  });

  it("reports a tripped tripwire as degraded and the kill switch as kill_switch", async () => {
    const r = await rig();
    const relay = await r.start();
    await relay.services.tripwires.trip({ id: "router_upgraded", detail: "The Base router implementation changed." });
    const degraded = await rawRequest({ port: relay.port, headers: { "x-relay-key": TEST_RELAY_KEY } });
    assert.equal((degraded.json as { status: string }).status, "degraded");
    assert.deepEqual((degraded.json as { tripwires: { tripped: Array<{ id: string }> } }).tripwires.tripped.map((entry) => entry.id), ["router_upgraded"]);
    await relay.services.flagGate.engageKill("test");
    const killed = await rawRequest({ port: relay.port, headers: { "x-relay-key": TEST_RELAY_KEY } });
    assert.equal((killed.json as { status: string }).status, "kill_switch");
    const refused = await submit(relay, "0".repeat(32));
    assert.equal(refused.status, 503);
    await relay.close();
  });

  it("latches the requires-key door when the bundler asks for a key: a fact, an alert, and no more traffic", async () => {
    const r = await rig();
    let calls = 0;
    const relay = await r.start({ fetch: (async () => { calls += 1; return new Response("{}", { status: 403 }); }) as typeof fetch });
    const upstream = relay.services.upstream;
    await assert.rejects(upstream.request({ method: "POST", url: "https://mainnet-bundler.xo.market/", body: "{}", purpose: "bundler_call" }));
    await assert.rejects(upstream.request({ method: "POST", url: "https://mainnet-bundler.xo.market/", body: "{}", purpose: "bundler_call" }));
    assert.equal(calls, 1);
    // The fact is written by a fire-and-forget promise; wait for it with a bound instead of a fixed pause (a loaded machine needs more than 20 ms).
    for (let waited = 0; relay.services.capabilities.state("UO9") !== "no" && waited < 5_000; waited += 10) await pause(10);
    assert.equal(relay.services.capabilities.state("UO9"), "no");
    assert.equal(relay.services.capabilities.fact("UO9")?.source, "probe");
    const health = await rawRequest({ port: relay.port, headers: { "x-relay-key": TEST_RELAY_KEY } });
    assert.equal((health.json as { upstream: Record<string, { state: string }> }).upstream["mainnet-bundler.xo.market"]?.state, "requires_key");
    assert.equal((health.json as { status: string }).status, "degraded");
    await relay.close();
    assert.match(await readFile(join(r.dir, "logs", "alerts.log"), "utf8"), /upstream_requires_key/);
  });

  it("allows the extra hosts the operator declared and nothing else", async () => {
    const r = await rig();
    const seen: string[] = [];
    const relay = await r.start({
      env: { RELAY_BASE_RPC_URL: "https://base-rpc.example.org/v2/BASE-PATH-KEY-123", RELAY_SELF_HOST: "https://creator.example.org/meta" },
      fetch: (async (input: string | URL | Request) => { seen.push(String(input)); return new Response("{}", { status: 200 }); }) as typeof fetch,
    });
    const upstream = relay.services.upstream;
    await upstream.request({ method: "POST", url: relay.config.baseRpcUrl?.reveal() as string, body: "{}", purpose: "base_call" });
    await upstream.request({ method: "GET", url: "https://creator.example.org/meta/a.json", purpose: "fetch_meta" });
    await assert.rejects(upstream.request({ method: "GET", url: "https://creator.example.org/other.json", purpose: "fetch_meta" }));
    await assert.rejects(upstream.request({ method: "GET", url: "https://example.com/", purpose: "fetch_meta" }));
    assert.deepEqual(seen, ["https://base-rpc.example.org/v2/BASE-PATH-KEY-123", "https://creator.example.org/meta/a.json"]);
    const health = (await rawRequest({ port: relay.port, headers: { "x-relay-key": TEST_RELAY_KEY } })).json as { upstream: Record<string, unknown> };
    assert.ok("base-rpc.example.org" in health.upstream && "creator.example.org" in health.upstream);
    await relay.close();
  });

  it("writes start-up and shutdown to the audit log, with the flag state and no secret", async () => {
    const r = await rig();
    const relay = await r.start();
    await relay.close();
    const log = await readFile(join(r.dir, "logs", "audit.log"), "utf8");
    assert.match(log, /"ev":"startup"/);
    assert.match(log, /"ev":"shutdown"/);
    assert.match(log, /user agent insurance-markets-xo-plugin\/0\.2/);
    for (const canary of [TEST_RELAY_KEY, TEST_MASTER_SECRET]) assert.equal(log.includes(canary), false);
  });
});
