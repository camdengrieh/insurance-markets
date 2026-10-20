import assert from "node:assert/strict";
import { describe } from "node:test";

import { ENTRY_POINT_V07 } from "../../src/xo/chain/constants.js";
import { toRpcUserOperation } from "../../src/xo/userop/bundler.js";
import { buildOp, enableTradingCalls } from "../anvil/scenarios.js";
import type { MockXo } from "./server.js";
import { getJson, postRpc, useMock } from "./testing.js";
import { createCredentials, l1Headers, l2Call, l2Headers, marketTokens, placeOrder, setupTrader, type Credentials, type Trader } from "./traders.js";

// Faults on the WRITE surfaces (spec 5.5 B, "faults"): 429 with retry_after_ms, 5xx, a timeout, truncated JSON.
// A fault set to "before" happens before the server does anything: nothing was written. A fault set to "after" is
// the dangerous one: the server did the write and the RESPONSE is what is lost, so the client cannot tell. Every
// case here proves which of the two it is by looking at the state afterwards.

async function trader(mock: MockXo): Promise<{ t: Trader; creds: Credentials; yes: string }> {
  mock.setProfile("optimistic");
  await mock.paymaster.reconcile("sponsor");
  const t = await setupTrader(mock, 2);
  const creds = await createCredentials(mock, t);
  return { t, creds, yes: marketTokens(mock, "clob-active-a").yes };
}

// Races a request against a short real timer, because a "timeout" fault never answers.
async function attempt(request: Promise<{ status: number; text: string }>): Promise<string> {
  const outcome = await Promise.race([
    request.then((reply) => `${String(reply.status)}:${reply.text.length > 0 && !reply.text.endsWith("}") ? "truncated" : "whole"}`).catch(() => "closed"),
    new Promise<string>((resolve) => setTimeout(() => resolve("no answer"), 120)),
  ]);
  return outcome;
}

describe("a fault BEFORE the write: nothing happened", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("429 carries retry_after_ms and Retry-After, 5xx is 503, a timeout never answers, truncated JSON stops mid-body; no order exists after any of them", async (mock) => {
    const { t, creds, yes } = await trader(mock);
    mock.injectFault("429-retry-after", { retryAfterMs: 1500, listeners: ["orderbook"], count: 1 });
    const limited = await placeOrder(mock, t, creds, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n });
    assert.equal(limited.reply.status, 429);
    assert.deepEqual(limited.reply.body, { error: "rate limit exceeded", retry_after_ms: 1500 });
    assert.equal(limited.reply.headers.get("retry-after"), "2");

    mock.injectFault("5xx", { listeners: ["orderbook"], count: 1 });
    assert.equal((await placeOrder(mock, t, creds, { tokenId: yes, side: "BUY", tick: 301, sharesMicro: 10_000_000n })).reply.status, 503);

    mock.injectFault("truncated-json", { listeners: ["orderbook"], count: 1 });
    const cut = await placeOrder(mock, t, creds, { tokenId: yes, side: "BUY", tick: 302, sharesMicro: 10_000_000n });
    assert.equal(cut.reply.status, 200);
    assert.throws(() => JSON.parse(cut.reply.text));

    mock.injectFault("timeout", { listeners: ["orderbook"], count: 1 });
    const built = await (await import("./traders.js")).buildOrder(mock, t, { tokenId: yes, side: "BUY", tick: 303, sharesMicro: 10_000_000n });
    const headers = l2Headers(mock, t, creds, "POST", "/order", { body: built.body });
    assert.equal(await attempt(getJson(mock, "orderbook", "/order", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: built.body })), "no answer");

    assert.equal(mock.write.orders.size, 0, "none of the four wrote anything");
    mock.faults.clear();
    assert.equal((await placeOrder(mock, t, creds, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n })).reply.status, 200);
    assert.equal(mock.write.orders.size, 1);
  });

  harness.it("the bundler and the credential routes take the same faults: no operation lands, no key is minted", async (mock) => {
    mock.setProfile("optimistic");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const fresh = await buildOp({ chain, owner: chain.owner(3), init: true, sponsored: true, calls: enableTradingCalls() });
    mock.injectFault("5xx", { listeners: ["bundler"], count: 1 });
    assert.equal((await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(fresh.op), ENTRY_POINT_V07])).status, 503);
    assert.equal(await mock.chains.isDeployed(fresh.account), false);
    const other = await setupTrader(mock, 4);
    mock.injectFault("429-retry-after", { listeners: ["orderbook"], count: 1 });
    const limited = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, other) });
    assert.equal(limited.status, 429);
    assert.equal(mock.write.credentialsOf(other.key).length, 0);
  });
});

describe("a fault AFTER the write: the response is lost, the write is not", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const kind of ["5xx", "timeout", "truncated-json"] as const) {
    harness.it(`POST /order answered with ${kind} after the order was accepted: GET /orders still has it, and a blind resend is a duplicate`, async (mock) => {
      const { t, creds, yes } = await trader(mock);
      mock.injectFault(kind, { listeners: ["orderbook"], count: 1, when: "after" });
      const built = await (await import("./traders.js")).buildOrder(mock, t, { tokenId: yes, side: "BUY", tick: 300, sharesMicro: 10_000_000n, salt: 99n });
      const headers = l2Headers(mock, t, creds, "POST", "/order", { body: built.body });
      const seen = await attempt(getJson(mock, "orderbook", "/order", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: built.body }));
      assert.notEqual(seen, "200:whole", `the client did not get the order id (${seen})`);
      assert.equal(mock.write.orders.size, 1, "but the order is on the book");
      const listed = (await l2Call(mock, t, creds, "GET", "/orders")).body as { data: { order_hash: string }[] };
      assert.deepEqual(listed.data.map((row) => row.order_hash), [built.hash]);
      // The fault is spent (count 1): the next request is normal, and the resend is a duplicate, never a second order.
      assert.equal(mock.switches.get("faults"), "none");
      const resend = await getJson(mock, "orderbook", "/order", { method: "POST", headers: { "content-type": "application/json", ...l2Headers(mock, t, creds, "POST", "/order", { body: built.body }) }, body: built.body });
      assert.equal(resend.status, 400);
      assert.match((resend.body as { error: string }).error, /duplicate order/);
      assert.equal(mock.write.orders.size, 1);
    });
  }

  harness.it("reads are never affected by an 'after' fault: only POST, PUT and DELETE are", async (mock) => {
    const { t, creds } = await trader(mock);
    const counted = mock.faults.injected;
    mock.injectFault("5xx", { listeners: ["orderbook"], when: "after" });
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 200);
    assert.equal((await l2Call(mock, t, creds, "GET", "/orders")).status, 200);
    assert.equal(mock.faults.injected, counted, "nothing was counted");
    const del = await l2Call(mock, t, creds, "DELETE", "/cancel-all");
    assert.equal(del.status, 503, "a write is");
    mock.faults.clear();
  });

  harness.it("a key minted whose response was lost is unrecoverable unless derive returns the secret (AU2): the relay must persist before use", async (mock) => {
    mock.setProfile("pessimistic");
    const other = await setupTrader(mock, 4);
    mock.injectFault("timeout", { listeners: ["orderbook"], count: 1, when: "after" });
    const lost = await attempt(getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, other) }));
    assert.equal(lost, "no answer");
    assert.equal(mock.write.credentialsOf(other.key).length, 1, "the key exists");
    // Derive finds it, but under the pessimistic switch gives no secret ...
    const derived = await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, other) });
    assert.deepEqual(Object.keys(derived.body as object), ["apiKey"]);
    // ... and a second create is refused by the key cap: the account is stuck without a secret.
    assert.equal((await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, other) })).status, 400);
    // If derive does return the secret the situation is recoverable.
    mock.setSwitch("auth.derive_returns_secret", "yes");
    const recovered = await getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, other) });
    assert.deepEqual(Object.keys(recovered.body as object).sort(), ["apiKey", "passphrase", "secret"]);
  });

  harness.it("eth_sendUserOperation answered with a fault after the operation landed: the receipt exists, the account is deployed, a resend is rejected by the EntryPoint", async (mock) => {
    mock.setProfile("optimistic");
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const built = await buildOp({ chain, owner: chain.owner(3), init: true, sponsored: true, calls: enableTradingCalls() });
    mock.injectFault("5xx", { listeners: ["bundler"], count: 1, when: "after" });
    assert.equal((await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(built.op), ENTRY_POINT_V07])).status, 503);
    assert.equal(await mock.chains.isDeployed(built.account), true, "it landed");
    assert.equal(((await postRpc(mock, "bundler", "eth_getUserOperationReceipt", [built.hash])).body["result"] as { success: boolean }).success, true);
    const resend = await postRpc(mock, "bundler", "eth_sendUserOperation", [toRpcUserOperation(built.op), ENTRY_POINT_V07]);
    assert.match((resend.body["error"] as { message: string }).message, /^AA10/);
  });
});
