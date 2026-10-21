import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import { createEmbeddedRelayClient, createRelayClientFromConfig, createRelayClient, useEmbeddedRelay, type EmbeddedRequest } from "../src/relay/client.js";
import { orderStatusPath, type RelayResult } from "../src/relay/contract.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../src/xo/chain/constants.js";

// The embedded transport of the relay client: same guarantees as the HTTP one, no key, no URL.

afterEach(() => useEmbeddedRelay(undefined));

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const HASH = `0x${"ab".repeat(32)}`;
const ok = (body: unknown, status = 200) => ({ status, bodyText: JSON.stringify(body) });
const code = (result: RelayResult<unknown>): string => (result.ok ? "ok" : result.error.code);

describe("createEmbeddedRelayClient", () => {
  it("hands the handler a method, a path, the serialised body and a signal, and nothing else", async () => {
    const seen: EmbeddedRequest[] = [];
    const client = createEmbeddedRelayClient(async (request) => {
      seen.push(request);
      return request.method === "GET" ? ok({ status: "ok", version: "0.2.0", time: "2026-10-19T12:00:00Z", kill: false, flags: Object.fromEntries(["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING", "ENABLE_FUNDING", "ENABLE_WITHDRAW", "XO_ENABLE_CREATE", "ENABLE_SELF_HOSTED_METADATA", "ENABLE_CLOB_POLYMARKET", "ENABLE_CLOB_LIMITLESS", "KILL"].map((name) => [name, false])), tripwires: { ok: true, tripped: [] }, upstream: {} }) : ok({ error: { code: "flag_off", message: "off" } }, 403);
    });
    assert.equal((await client.get("/v1/health")).ok, true);
    assert.equal(code(await client.post("/v1/auth/prepare", { owner: OWNER })), "flag_off");
    assert.deepEqual(seen.map((request) => [request.method, request.path, request.bodyText]), [
      ["GET", "/v1/health", undefined],
      ["POST", "/v1/auth/prepare", JSON.stringify({ owner: OWNER })],
    ]);
    for (const request of seen) assert.ok(request.signal instanceof AbortSignal);
  });

  it("checks a request against the contract before the handler sees it", async () => {
    let calls = 0;
    const client = createEmbeddedRelayClient(async () => {
      calls += 1;
      return ok({});
    });
    assert.equal(code(await client.post("/v1/auth/prepare", { owner: "nope" } as never)), "invalid_request");
    assert.equal(code(await client.post("/v1/auth/prepare", { owner: OWNER, extra: true } as never)), "invalid_request");
    assert.equal(calls, 0);
  });

  it("drops an answer that does not match the contract, or that is about a different owner, as the HTTP client does", async () => {
    const wrongShape = createEmbeddedRelayClient(async () => ok({ nonsense: true }));
    assert.equal(code(await wrongShape.get("/v1/health")), "internal", "a read that failed to validate is retry-safe");
    const state = createEmbeddedRelayClient(async () => ok({ nonsense: true }));
    assert.equal(code(await state.post("/v1/userop/submit", { prepared_id: "0".repeat(32), signature: `0x${"11".repeat(65)}` })), "ambiguous", "a state-changing call that cannot be read is never assumed to have failed");
    const notJson = createEmbeddedRelayClient(async () => ({ status: 200, bodyText: "<html>" }));
    assert.equal(code(await notJson.get("/v1/health")), "internal");
  });

  it("never throws: a handler that throws or never answers is a coded failure within the time given", async () => {
    const throwing = createEmbeddedRelayClient(async () => {
      throw new Error("boom with a secret value");
    });
    const failed = await throwing.post("/v1/auth/prepare", { owner: OWNER });
    assert.equal(failed.ok, false);
    assert.ok(!JSON.stringify(failed).includes("secret value"));
    const hanging = createEmbeddedRelayClient(() => new Promise(() => undefined));
    const started = Date.now();
    const slow = await hanging.post("/v1/auth/prepare", { owner: OWNER }, { timeoutMs: 30 });
    assert.equal(code(slow), "ambiguous");
    assert.ok(Date.now() - started < 2_000);
    assert.equal(code(await hanging.get("/v1/health", { timeoutMs: 30 })), "internal");
  });

  it("aborts the handler's signal when the caller cancels", async () => {
    let aborted = false;
    const client = createEmbeddedRelayClient(
      (request) =>
        new Promise((_resolve) => {
          request.signal.addEventListener("abort", () => (aborted = true));
        }),
    );
    const caller = new AbortController();
    const pending = client.post("/v1/auth/prepare", { owner: OWNER }, { signal: caller.signal });
    setTimeout(() => caller.abort(), 10);
    assert.equal((await pending).ok, false);
    assert.equal(aborted, true);
  });

  it("refuses an answer about another order than the one asked about", async () => {
    const client = createEmbeddedRelayClient(async () => ok({ order_hash: `0x${"cd".repeat(32)}`, state: "open", filled_shares: "0", remaining_shares: "1", detail: "resting" }));
    assert.equal(code(await client.get(orderStatusPath(HASH))), "internal");
  });
});

describe("useEmbeddedRelay", () => {
  it("makes the config-built client talk to the in-process relay, and switching it off restores the HTTP one", async () => {
    const config = loadConfig({}).config;
    // Not configured: the HTTP client has nowhere to go.
    assert.equal(code(await createRelayClientFromConfig(config).post("/v1/auth/prepare", { owner: OWNER })), "relay_not_configured");
    let hits = 0;
    useEmbeddedRelay(async () => {
      hits += 1;
      return ok({ error: { code: "kill_switch", message: "stub" } }, 503);
    });
    assert.equal(code(await createRelayClientFromConfig(config).post("/v1/auth/prepare", { owner: OWNER })), "kill_switch");
    assert.equal(hits, 1);
    useEmbeddedRelay(undefined);
    assert.equal(code(await createRelayClientFromConfig(config).post("/v1/auth/prepare", { owner: OWNER })), "relay_not_configured");
  });

  it("leaves the HTTP client alone: it still demands a URL and a key", async () => {
    assert.equal(code(await createRelayClient({}).get("/v1/health")), "relay_not_configured");
  });
});
