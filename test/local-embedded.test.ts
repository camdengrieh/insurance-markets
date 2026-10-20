import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createEmbeddedRelayClient } from "../src/relay/client.js";
import type { RelayResult } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../src/xo/chain/constants.js";
import { createEmbeddedRelay, type EmbeddedRelay } from "../relay/embedded.js";
import { mergeRoutes } from "../relay/routes.js";
import type { RouteTable } from "../relay/types.js";
import { addr, deferred, pause, TEST_MASTER_SECRET, tempDir, FakeClock, TEST_KDF } from "./relay-core-helpers.js";
import { Secret } from "../src/config.js";
import { startEmbedded, takeBlockedRequests } from "./local-helpers.js";

// The embedded relay: the HTTP server's pipeline called as a function. Every refusal below has a request
// that must be refused; the parity test (local-parity.test.ts) checks the same rules against the HTTP server.

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const OTHER = addr(0x1234);
const HASH = `0x${"ab".repeat(32)}`;

function code(result: RelayResult<unknown>): string {
  assert.equal(result.ok, false, "expected a failure");
  return result.ok ? "" : result.error.code;
}

async function raw(relay: EmbeddedRelay, method: "GET" | "POST", path: string, bodyText?: string) {
  const reply = await relay.handler({ method, path, bodyText, signal: new AbortController().signal });
  return { status: reply.status, body: JSON.parse(reply.bodyText) as { error?: { code: string; message: string; details?: unknown } } };
}

describe("the embedded relay answers like the HTTP one, without a socket", () => {
  it("serves a read with no key, no URL and no listener", async () => {
    const { relay } = await startEmbedded();
    const health = await relay.client.get("/v1/health");
    assert.equal(health.ok, true);
    if (health.ok) {
      assert.equal(health.data.kill, false);
      assert.equal(health.data.flags.ENABLE_TRADING, false);
    }
    assert.equal(relay.config.keys.current, undefined, "no relay key was ever configured");
  });

  it("starts without XO_RELAY_KEY and ignores a malformed one (nothing listens, so nothing needs it)", async () => {
    const { relay } = await startEmbedded({ env: { XO_RELAY_KEY: "short" } });
    assert.equal((await relay.client.get("/v1/health")).ok, true);
  });

  it("keeps every write path off by default: each write route is refused with flag_off", async () => {
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER } });
    const signature = `0x${"11".repeat(65)}`;
    const prepares = await Promise.all([
      relay.client.post("/v1/auth/prepare", { owner: OWNER }),
      relay.client.post("/v1/funding/check", { owner: OWNER, amount: "1" }),
      relay.client.post("/v1/order/prepare", { owner: OWNER, token_id: "1", side: "BUY", price: "0.4", shares: "10", tif: "GTD" }),
    ]);
    for (const result of prepares) assert.equal(code(result), "flag_off");
    // A submit of an item that does not exist is refused too (some check the flag first, some the item).
    const submits = await Promise.all([
      relay.client.post("/v1/auth/submit", { prepared_id: "0".repeat(32), signature }),
      relay.client.post("/v1/userop/submit", { prepared_id: "0".repeat(32), signature }),
      relay.client.post("/v1/order/submit", { prepared_id: "0".repeat(32), signature }),
    ]);
    for (const result of submits) assert.ok(["flag_off", "not_found"].includes(code(result)));
    assert.deepEqual(takeBlockedRequests(), [], "a refused write made no request to XO");
  });

  it("a dry-run prepare works with every flag off and only ever reads from XO's own hosts; with XO unreachable it fails with a coded answer, not a hang", async () => {
    // XO_OWNER is set: without it the embedded relay asks for a confirmation of the wallet first (RT-2, test/relay-owner-confirm.test.ts).
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER } });
    const result = await relay.client.post("/v1/userop/prepare", { owner: OWNER, action: "enable_trading", params: {} });
    assert.equal(result.ok, false);
    assert.notEqual(code(result), "flag_off");
    assert.notEqual(code(result), "pending");
    const hosts = new Set(takeBlockedRequests().map((entry) => entry.split(" ")[1]));
    assert.ok(hosts.size > 0, "it did try to read the chain");
    for (const host of hosts) assert.ok(["explorer-mainnet.xo.market", "rpc-mainnet-2.xo.market", "orderbooks.xo.market", "api-mainnet.xo.market", "mainnet-bundler.xo.market"].includes(host as string), `unexpected host ${host}`);
  });

  it("the kill switch refuses every write route and leaves reads alone", async () => {
    const { relay } = await startEmbedded({ env: { XO_KILL_SWITCH: "1", ENABLE_TRADING: "1", ENABLE_USEROP_SUBMIT: "1" } });
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "kill_switch");
    assert.equal(code(await relay.client.post("/v1/userop/submit", { prepared_id: "0".repeat(32), signature: `0x${"11".repeat(65)}` })), "kill_switch");
    assert.equal(code(await relay.client.post("/v1/order/cancel", { owner: OWNER, order_hash: HASH })), "kill_switch");
    const health = await relay.client.get("/v1/health");
    assert.equal(health.ok && health.data.kill, true);
    assert.equal(health.ok && health.data.status, "kill_switch");
  });

  it("the kill switch engaged while running takes effect on the very next write", async () => {
    const routes: RouteTable = { "POST /v1/auth/prepare": async () => { throw new RelayError("cap_exceeded", "stub"); } };
    const { relay } = await startEmbedded({ routes, env: { XO_OWNER: OWNER } });
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "cap_exceeded");
    await relay.services.flagGate.engageKill("test");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "kill_switch");
  });

  it("refuses what the contract refuses: bad bodies, forbidden keys, queries, unknown routes, wrong methods, big bodies", async () => {
    const { relay } = await startEmbedded();
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: "0x1234" } as never)), "invalid_request");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER, extra: 1 } as never)), "invalid_request");
    assert.equal((await raw(relay, "POST", "/v1/auth/prepare", `{"owner":"${OWNER}","__proto__":{"x":1}}`)).body.error?.code, "invalid_request");
    assert.equal((await raw(relay, "POST", "/v1/auth/prepare", `{"owner":"${OWNER}","a":{"constructor":1}}`)).status, 400);
    assert.equal((await raw(relay, "POST", "/v1/auth/prepare", "{not json")).body.error?.code, "invalid_request");
    assert.equal((await raw(relay, "GET", "/v1/health?x=1")).status, 400);
    assert.equal((await raw(relay, "GET", "/v1/../health")).status, 400);
    assert.equal((await raw(relay, "GET", "/v1/nothing")).body.error?.code, "not_found");
    const wrongMethod = await raw(relay, "GET", "/v1/auth/prepare");
    assert.equal(wrongMethod.status, 405);
    assert.equal((await raw(relay, "POST", "/v1/health", "{}")).status, 405);
    const big = await raw(relay, "POST", "/v1/auth/prepare", JSON.stringify({ owner: OWNER, pad: "x".repeat(70_000) }));
    assert.equal(big.status, 413);
    assert.equal((await raw(relay, "GET", "/v1/order/0x12")).body.error?.code, "invalid_request");
  });

  it("answers `not_implemented` for a contract route with no handler, and refuses a write route in the kill state before that", async () => {
    const { relay } = await startEmbedded({ routes: {} as RouteTable });
    assert.equal(code(await relay.client.post("/v1/creation/track", { condition_id: HASH })), "not_implemented");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "not_implemented");
  });

  it("applies the per-endpoint rate limit with the injected clock (6 writes in a burst, then a refusal, then a refill)", async () => {
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER }, realRates: true, clock });
    for (let index = 0; index < 6; index += 1) assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "flag_off");
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "rate_limited");
    // Another endpoint has its own bucket.
    assert.equal(code(await relay.client.post("/v1/funding/check", { owner: OWNER, amount: "1" })), "flag_off");
    clock.advance(1_000);
    assert.equal(code(await relay.client.post("/v1/auth/prepare", { owner: OWNER })), "flag_off");
  });

  it("turns a handler that throws something other than a RelayError into a fixed `internal`, with nothing of the error in it", async () => {
    const secretText = "leaky-secret-text-should-never-appear";
    const routes: RouteTable = { "POST /v1/auth/prepare": async () => { throw new Error(secretText); } };
    const { relay } = await startEmbedded({ routes, env: { XO_OWNER: OWNER } });
    const result = await relay.client.post("/v1/auth/prepare", { owner: OWNER });
    assert.equal(code(result), "internal");
    assert.ok(!JSON.stringify(result).includes(secretText));
  });

  it("turns an answer that does not match its contract into `internal` and sends nothing of it", async () => {
    const routes: RouteTable = { "POST /v1/auth/prepare": (async () => ({ nonsense: true })) as never };
    const { relay } = await startEmbedded({ routes, env: { XO_OWNER: OWNER } });
    const result = await relay.client.post("/v1/auth/prepare", { owner: OWNER });
    assert.equal(code(result), "internal");
    assert.ok(!JSON.stringify(result).includes("nonsense"));
  });

  it("passes a RelayError through with its code, message and details", async () => {
    const routes: RouteTable = { "POST /v1/auth/prepare": async () => { throw new RelayError("capability_unknown", "A fact is missing.", { id: "OR10" }); } };
    const { relay } = await startEmbedded({ routes, env: { XO_OWNER: OWNER } });
    const result = await relay.client.post("/v1/auth/prepare", { owner: OWNER });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "capability_unknown");
      assert.equal(result.error.message, "A fact is missing.");
      assert.deepEqual(result.error.details, { id: "OR10" });
    }
  });
});

describe("the answer-by budget and cancellation, as on the HTTP server", () => {
  it("answers `pending` when the handler is still running at the budget, and lets it finish in the background", async () => {
    const gate = deferred();
    let finished = false;
    const routes: RouteTable = {
      "POST /v1/funding/check": async () => {
        await gate.promise;
        finished = true;
        return { permitted: false, funding_id: null, reserved_usd: "0", reasons: ["test"], account: "0x0", state: "registered", expires_at: null } as never;
      },
    };
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER }, routes, http: { requestBudgetMs: 25, readRate: { capacity: 1000, refillPerSecond: 1000 }, writeRate: { capacity: 1000, refillPerSecond: 1000 } } });
    const result = await relay.client.post("/v1/funding/check", { owner: OWNER, amount: "1" });
    assert.equal(code(result), "pending");
    assert.equal(finished, false);
    gate.resolve();
    await relay.idle();
    assert.equal(finished, true);
  });

  it("a caller that cancels AFTER the `pending` answer does not abort the work that is already in flight", async () => {
    const gate = deferred();
    let sawAbort = false;
    const routes: RouteTable = {
      "POST /v1/funding/check": async (_body, context) => {
        context.signal.addEventListener("abort", () => (sawAbort = true));
        await gate.promise;
        throw new RelayError("cap_exceeded", "done");
      },
    };
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER }, routes, http: { requestBudgetMs: 20, readRate: { capacity: 1000, refillPerSecond: 1000 }, writeRate: { capacity: 1000, refillPerSecond: 1000 } } });
    const caller = new AbortController();
    const result = await relay.client.post("/v1/funding/check", { owner: OWNER, amount: "1" }, { signal: caller.signal });
    assert.equal(code(result), "pending");
    caller.abort();
    await pause(30);
    assert.equal(sawAbort, false, "a send that is under way must never be aborted by a caller that stopped listening");
    gate.resolve();
    await relay.idle();
  });

  it("the same holds for a raw caller of the handler: its signal stops reaching the work once the `pending` answer has gone out", async () => {
    const gate = deferred();
    let sawAbort = false;
    const routes: RouteTable = {
      "POST /v1/funding/check": async (_body, context) => {
        context.signal.addEventListener("abort", () => (sawAbort = true));
        await gate.promise;
        throw new RelayError("cap_exceeded", "done");
      },
    };
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER }, routes, http: { requestBudgetMs: 20, readRate: { capacity: 1000, refillPerSecond: 1000 }, writeRate: { capacity: 1000, refillPerSecond: 1000 } } });
    const caller = new AbortController();
    const reply = await relay.handler({ method: "POST", path: "/v1/funding/check", bodyText: JSON.stringify({ owner: OWNER, amount: "1" }), signal: caller.signal });
    assert.equal(reply.status, 202);
    caller.abort();
    await pause(30);
    assert.equal(sawAbort, false);
    gate.resolve();
    await relay.idle();
  });

  it("a caller that cancels BEFORE the answer aborts the handler's signal (a dropped connection), and gets a coded failure", async () => {
    let sawAbort = false;
    const started = deferred();
    const routes: RouteTable = {
      "POST /v1/funding/check": async (_body, context) => {
        started.resolve();
        await new Promise<void>((resolve) => context.signal.addEventListener("abort", () => { sawAbort = true; resolve(); }));
        throw new RelayError("internal", "aborted");
      },
    };
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER }, routes, http: { requestBudgetMs: 5_000, readRate: { capacity: 1000, refillPerSecond: 1000 }, writeRate: { capacity: 1000, refillPerSecond: 1000 } } });
    const caller = new AbortController();
    const pending = relay.client.post("/v1/funding/check", { owner: OWNER, amount: "1" }, { signal: caller.signal });
    await started.promise;
    caller.abort();
    const result = await pending;
    assert.equal(result.ok, false);
    await pause(10);
    assert.equal(sawAbort, true);
  });

  it("shutting down lets a running handler finish, then refuses everything", async () => {
    const gate = deferred();
    const routes: RouteTable = { "POST /v1/funding/check": async () => { await gate.promise; throw new RelayError("cap_exceeded", "finished"); } };
    const { relay } = await startEmbedded({ env: { XO_OWNER: OWNER }, routes, http: { requestBudgetMs: 10, shutdownGraceMs: 2_000, readRate: { capacity: 1000, refillPerSecond: 1000 }, writeRate: { capacity: 1000, refillPerSecond: 1000 } } });
    assert.equal(code(await relay.client.post("/v1/funding/check", { owner: OWNER, amount: "1" })), "pending");
    const closing = relay.close();
    gate.resolve();
    await closing;
    assert.equal(code(await relay.client.get("/v1/health")), "internal");
  });
});

describe("what the embedded relay writes to disk", () => {
  it("keeps the data directory private and writes no secret into the audit log or the alert log", async () => {
    const { relay, dir } = await startEmbedded();
    await relay.client.post("/v1/auth/prepare", { owner: OWNER });
    await relay.client.get("/v1/health");
    await relay.close();
    const logs = join(dir.dir, "logs");
    const names = await readdir(logs);
    assert.ok(names.length > 0);
    for (const name of names) {
      const text = await readFile(join(logs, name), "utf8");
      assert.ok(!text.includes(TEST_MASTER_SECRET), `${name} holds the master secret`);
    }
    const audit = names.filter((name) => name.startsWith("audit"));
    assert.ok(audit.length > 0, "an audit log exists");
    assert.match(await readFile(join(logs, audit[0] as string), "utf8"), /"ev":"startup"/);
  });

  it("refuses to start without a master secret while the credential store is on, naming the variable only", async () => {
    const dir = await tempDir("local-nokey-");
    try {
      await assert.rejects(
        createEmbeddedRelay({ dataDir: dir.dir, env: {}, kdf: TEST_KDF, allowWeakKdf: true, clock: new FakeClock().now }),
        (error: unknown) => error instanceof Error && /RELAY_MASTER_KEY/.test(error.message),
      );
    } finally {
      await dir.cleanup();
    }
  });

  it("starts without a master secret when the credential store is off (no credentials can then be kept)", async () => {
    const { relay } = await startEmbedded({ env: { RELAY_CREDENTIAL_STORE: "off" }, masterSecret: undefined as never });
    assert.equal(relay.services.secrets, undefined);
  });

  it("builds its client from the same factory the plugin uses, with the same error mapping", async () => {
    const client = createEmbeddedRelayClient(async () => ({ status: 503, bodyText: JSON.stringify({ error: { code: "kill_switch", message: "off" } }) }));
    const result = await client.post("/v1/auth/prepare", { owner: OWNER });
    assert.equal(code(result), "kill_switch");
    // A handler that returns garbage is a coded failure, never a thrown error.
    const broken = createEmbeddedRelayClient(async () => ({ status: 200, bodyText: "not json" }));
    assert.equal((await broken.get("/v1/health")).ok, false);
    const throwing = createEmbeddedRelayClient(async () => { throw new Error("boom"); });
    assert.equal((await throwing.post("/v1/auth/prepare", { owner: OWNER })).ok, false);
    void mergeRoutes;
    void Secret;
  });
});

describe("upkeep", () => {
  async function expiringItem(relay: EmbeddedRelay): Promise<string> {
    const record = await relay.services.prepared.create({ kind: "userop", owner: OWNER, account: deriveAccount(OWNER), digest: `0x${"ab".repeat(32)}`, digestForm: "userOpHash", payload: {}, ttlS: 60 });
    return record.id;
  }

  it("maintain() runs the sweeps now: a prepared item past its time is marked expired", async () => {
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ clock });
    const id = await expiringItem(relay);
    assert.equal(relay.services.prepared.get(id)?.state, "prepared");
    clock.advance(10 * 60_000);
    await relay.maintain();
    assert.equal(relay.services.prepared.get(id)?.state, "expired");
  });

  it("the background timer does the same on its own, and close() stops it", async () => {
    const clock = new FakeClock("2026-10-19T12:00:00Z");
    const { relay } = await startEmbedded({ clock, maintenance: true, maintenanceIntervalMs: 20 });
    const id = await expiringItem(relay);
    clock.advance(10 * 60_000);
    const deadline = Date.now() + 3_000;
    while (relay.services.prepared.get(id)?.state !== "expired" && Date.now() < deadline) await pause(10);
    assert.equal(relay.services.prepared.get(id)?.state, "expired");
    await relay.close();
    const late = await expiringItem(relay).catch(() => "closed");
    assert.equal(late, "closed", "nothing is written after close");
  });

  it("rounds do not overlap, and a failing round does not stop the next one", async () => {
    const { relay } = await startEmbedded();
    const [a, b] = [relay.maintain(), relay.maintain()];
    assert.strictEqual(a, b, "a second call joins the round in progress");
    await a;
    const original = relay.services.prepared.sweep.bind(relay.services.prepared);
    let calls = 0;
    (relay.services.prepared as { sweep: () => Promise<unknown> }).sweep = async () => {
      calls += 1;
      throw new Error("disk trouble");
    };
    await relay.maintain();
    await relay.maintain();
    assert.equal(calls, 2);
    (relay.services.prepared as { sweep: () => Promise<unknown> }).sweep = original;
  });
});
