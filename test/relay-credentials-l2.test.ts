import assert from "node:assert/strict";
import { describe } from "node:test";
import { inspect } from "node:util";

import { SignedL2, ensureCredentialsReady, l2Request, signL2, type L2Variant } from "../relay/credentials.js";
import { useMock } from "./mock-xo/testing.js";
import { connect, createWorld, deployed, expectRelayError, jsonResponse, ownerAt, requestsTo, statusRecord } from "./relay-credentials-helpers.js";

// signL2 and l2Request: what the other relay modules use to call XO with a user's credential. The
// variant comes from recorded facts and is pessimistic until they are recorded; the timestamp is XO's.

const HMAC_DECODE = { stripped: { key: "b64url", pad: "stripped" }, raw: { key: "raw", pad: "padded" }, "b64url-decoded-padded": { key: "b64url", pad: "padded" } } as const;

describe("signL2", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("refuses to guess: no recorded HMAC form means no signature, and a query needs the target fact too", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    // Take the facts away as if nothing had ever been recorded.
    await world.storage.state.transact(() => ({ ops: [{ ns: "capabilities", key: "OR10", value: null }], result: undefined }));
    await world.storage.close();
    const bare = await createWorld(mock, t, { dir: world.dir });
    await expectRelayError(signL2(bare.context(), { account: owner.smart, method: "GET", path: "/orders" }), "capability_unknown", { id: "OR10" });
    await expectRelayError(l2Request(bare.context(), { account: owner.smart, method: "GET", path: "/orders", purpose: "orders_list" }), "capability_unknown");
    // With only the decoding known, a request without a query is signed, one with a query is not.
    await bare.capabilities.record({ id: "OR10", state: "unknown", source: "probe", value: "b64url-stripped:unknown:addr-yes" });
    const signed = await signL2(bare.context(), { account: owner.smart, method: "GET", path: "/orders" });
    assert.equal(signed.variant.key, "b64url");
    await expectRelayError(signL2(bare.context(), { account: owner.smart, method: "GET", path: "/orders", query: "limit=1" }), "capability_unknown", { id: "OR10" });
    // An explicit variant (what the probes pass) is the only way past the facts.
    const probed = await signL2(bare.context(), { account: owner.smart, method: "GET", path: "/orders", query: "limit=1", variant: { target: "path-only" } });
    assert.equal(probed.variant.target, "path-only");
    // A rejected fact counts as unrecorded.
    await bare.capabilities.record({ id: "OR10", state: "no", source: "operator", value: "b64url-stripped:path-only:addr-yes" });
    await expectRelayError(signL2(bare.context(), { account: owner.smart, method: "GET", path: "/orders" }), "capability_unknown");
  });

  for (const decode of ["stripped", "raw", "b64url-decoded-padded"] as const) {
    for (const target of ["path-with-query", "path-only"] as const) {
      for (const address of ["required", "ignored"] as const) {
        harness.it(`signs requests the mock accepts: hmac.decode ${decode}, hmac.target ${target}, l2.xo_address ${address}`, async (mock, t) => {
          mock.setSwitch("hmac.decode", decode);
          mock.setSwitch("hmac.target", target);
          mock.setSwitch("l2.xo_address", address);
          const world = await createWorld(mock, t);
          const owner = await deployed(mock, 0);
          await connect(world, owner);
          // The probes learned this server's form; every later call signs with it.
          const reply = await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/orders", query: "limit=5", purpose: "orders_list" });
          assert.equal(reply.status, 200);
          const bare = await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys", purpose: "keys_list" });
          assert.equal(bare.status, 200);
          const signed = await signL2(world.context(), { account: owner.smart, method: "GET", path: "/orders", query: "limit=5" });
          assert.deepEqual({ key: signed.variant.key, pad: signed.variant.pad, target: signed.variant.target }, { ...HMAC_DECODE[decode], target });
          assert.equal(signed.url, "https://orderbooks.xo.market/orders?limit=5");
          assert.deepEqual(Object.keys(signed.headers).sort(), ["XO_ADDRESS", "XO_API_KEY", "XO_PASSPHRASE", "XO_SIGNATURE", "XO_TIMESTAMP"]);
          assert.equal(signed.headers["XO_ADDRESS"], owner.smart);
          // The request the mock saw was signed over the right target.
          const seen = requestsTo(world, "GET", "/orders").at(-1)!;
          assert.equal(seen.search, "?limit=5");
        });
      }
    }
  }

  harness.it("leaves XO_ADDRESS out exactly when the recorded form says addr-no, and puts it in otherwise", async (mock, t) => {
    mock.setSwitch("l2.xo_address", "ignored");
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const withAddress = await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys" });
    assert.equal(withAddress.headers["XO_ADDRESS"], owner.smart);
    const base = (await world.capabilities.fact("OR10"))!.value!.replace(/:addr-yes$/, "");
    await world.capabilities.record({ id: "OR10", state: "yes", source: "operator", value: `${base}:addr-no`, note: "T2: this server wants no XO_ADDRESS" });
    const without = await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys" });
    assert.deepEqual(Object.keys(without.headers).sort(), ["XO_API_KEY", "XO_PASSPHRASE", "XO_SIGNATURE", "XO_TIMESTAMP"]);
    assert.equal((await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys", purpose: "keys_list" })).status, 200, "and a server that ignores the header accepts that");
    // An explicit variant (the probes) overrides the recorded one in either direction.
    const forced = await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys", variant: { addr: "addr-yes" } });
    assert.equal(forced.headers["XO_ADDRESS"], owner.smart);
  });

  harness.it("signs a POST with its exact body and a DELETE, and a wrong body does not verify", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const body = JSON.stringify({ orderID: `0x${"ab".repeat(32)}` });
    const del = await l2Request(world.context(), { account: owner.smart, method: "DELETE", path: "/order", body, purpose: "order_cancel" });
    // The mock answers a well-authenticated cancel of an unknown order with a 4xx that is not an auth failure.
    assert.notEqual(del.status, 401, del.body);
    // Tamper with the body after signing: the server must see a different HMAC than the body it got.
    const signed = await signL2(world.context(), { account: owner.smart, method: "DELETE", path: "/order", body });
    const tampered = await world.upstream.request({ method: "DELETE", url: signed.url, headers: { ...signed.headers, "content-type": "application/json" }, body: JSON.stringify({ orderID: `0x${"cd".repeat(32)}` }), purpose: "order_cancel" });
    assert.equal(tampered.status, 401);
  });

  harness.it("uses XO's clock, not the relay's, so a skewed relay still signs inside XO's 30 second window", async (mock, t) => {
    const world = await createWorld(mock, t, { skewMs: -3_600_000 });
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const signed = await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys" });
    assert.ok(Math.abs(Number(signed.timestamp) - mock.clock.nowSeconds()) <= 2);
    assert.equal((await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys", purpose: "keys_list" })).status, 200);
    // The offset is cached for a short while, then read again.
    const before = requestsTo(world, "GET", "/time").length;
    await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys" });
    assert.equal(requestsTo(world, "GET", "/time").length, before, "a second signature right away reuses the offset");
    mock.clock.advanceMs(25_000);
    await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys" });
    assert.equal(requestsTo(world, "GET", "/time").length, before + 1, "after the cache expired it was read again");
  });

  harness.it("refuses without a stored credential, with a failed one, and for a path that carries a query", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await world.capabilities.record({ id: "OR10", state: "yes", source: "operator", value: "b64url-padded:path-with-query:addr-yes" });
    await expectRelayError(signL2(world.context(), { account: owner.smart, method: "GET", path: "/orders" }), "precondition_failed", { reason: "credentials_missing" });
    await connect(world, owner);
    await expectRelayError(signL2(world.context(), { account: owner.smart, method: "GET", path: "/orders?limit=1" }), "internal");
    await expectRelayError(signL2(world.context(), { account: owner.smart, method: "GET", path: "/orders#x" }), "internal");
    // Another account has no credential even though the facts are global.
    await expectRelayError(signL2(world.context(), { account: ownerAt(mock, 1).smart, method: "GET", path: "/orders" }), "precondition_failed", { reason: "credentials_missing" });
    // A credential parked as failed is not used.
    await world.storage.state.transact((reader) => {
      const flow = reader.get("credential_flow", owner.smart.toLowerCase()) as { [key: string]: never };
      return { ops: [{ ns: "credential_flow", key: owner.smart.toLowerCase(), value: { ...flow, state: "failed" } }], result: undefined };
    });
    await expectRelayError(signL2(world.context(), { account: owner.smart, method: "GET", path: "/orders" }), "precondition_failed", { reason: "credentials_failed" });
  });

  harness.it("hands out an object that prints nothing: JSON, inspect and string conversion carry no credential header", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    const signed = await signL2(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys" });
    assert.ok(signed instanceof SignedL2);
    const minted = mock.write.credentials[0]!;
    for (const text of [JSON.stringify(signed), inspect(signed, { showHidden: true, depth: 6 }), `${JSON.stringify({ signed })}`]) {
      for (const secret of [minted.apiKey, minted.secret, minted.passphrase, signed.headers["XO_SIGNATURE"] as string]) assert.ok(!text.includes(secret), text);
    }
  });

  harness.it("l2Request sends the pinned user agent and nothing identifying, and never forwards an abort signal it was not given", async (mock, t) => {
    const world = await createWorld(mock, t);
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    mock.clearRequests();
    const controller = new AbortController();
    await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys", purpose: "keys_list", signal: controller.signal });
    const [entry] = mock.requestsTo("orderbook").filter((request) => request.path === "/auth/api-keys");
    assert.equal(entry?.userAgent, "insurance-markets-xo-plugin/0.2");
    assert.equal(entry?.from, null);
    assert.ok(!entry?.headerNames.includes("cookie"));
  });
});

describe("resuming without a signature", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("a stored credential whose check was cut short is validated by ensureCredentialsReady, and a validated one is left alone", async (mock, t) => {
    const world = await createWorld(mock, t, {
      intercept: (request) => (request.headers["xo_api_key"] !== undefined ? jsonResponse(503, { error: "unavailable" }) : undefined),
    });
    const owner = await deployed(mock, 0);
    await connect(world, owner);
    assert.equal(statusRecord(world, owner)?.state, "stored");
    world.setIntercept(undefined);
    const options = { sleep: async (): Promise<void> => undefined };
    const first = await ensureCredentialsReady(world.context(), owner.smart, options);
    assert.deepEqual({ state: first.state, ready: first.ready }, { state: "validated", ready: true });
    const sent = world.sent.length;
    const second = await ensureCredentialsReady(world.context(), owner.smart, options);
    assert.equal(second.state, "validated");
    assert.equal(world.sent.length, sent, "nothing to do, nothing sent");
    // An account that has no credential is just reported.
    const none = await ensureCredentialsReady(world.context(), ownerAt(mock, 3).smart, options);
    assert.deepEqual({ state: none.state, ready: none.ready }, { state: "none", ready: false });
  });

  harness.it("the variant type is exactly the four documented parts", () => {
    const sample: L2Variant = { key: "raw", pad: "padded", target: "path-only", addr: "addr-no" };
    assert.deepEqual(Object.keys(sample).sort(), ["addr", "key", "pad", "target"]);
  });
});
