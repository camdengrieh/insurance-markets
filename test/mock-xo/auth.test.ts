import assert from "node:assert/strict";
import { describe } from "node:test";

import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";

import { getJson, useMock } from "./testing.js";
import { createCredentials, l1Headers, l2Call, l2Headers, setupTrader, traderFor, type Credentials, type Trader } from "./traders.js";
import { accountKey } from "./state.js";
import type { MockXo } from "./server.js";

// L1 (a ClobAuth signature by the account, checked by the REAL deployed Kernel on the local chain), L2 (HMAC) and the
// four /auth routes. Basis: docs/research/01 and 22; the error texts that are not quoted there are synthetic (M).

const L1_ERROR = /^L1 signature invalid \(ECDSA failed; EIP-1271: /;

async function post(mock: MockXo, trader: Trader, options: Parameters<typeof l1Headers>[2] = {}) {
  return getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: await l1Headers(mock, trader, options) });
}

async function derive(mock: MockXo, trader: Trader, options: Parameters<typeof l1Headers>[2] = {}) {
  return getJson(mock, "orderbook", "/auth/derive-api-key", { headers: await l1Headers(mock, trader, options) });
}

describe("L1: a ClobAuth signature by the account", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("the owner's signature creates a key in every accepted form: EIP-191 or raw digest, 0x01 or 0x00 prefix", async (mock) => {
    mock.setSwitch("auth.max_keys", "5");
    const trader = await setupTrader(mock, 2);
    const seen = new Set<string>();
    for (const form of ["eip191", "raw"] as const) {
      for (const prefix of ["0x01", "0x00"] as const) {
        const reply = await post(mock, trader, { form, prefix });
        assert.equal(reply.status, 200, `${form} ${prefix}: ${reply.text}`);
        const body = reply.body as { apiKey: string; secret: string; passphrase: string };
        assert.match(body.apiKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert.match(body.secret, /^[A-Za-z0-9_-]{43}=$/, "URL-safe base64 with padding");
        assert.match(body.passphrase, /^[0-9a-f]{40}$/);
        seen.add(body.apiKey);
      }
    }
    assert.equal(seen.size, 4, "four distinct keys");
  });

  harness.it("a key created from L1 registers the account under registry.trigger = on-l1-create, and under no other trigger", async (mock) => {
    mock.setSwitch("registry.trigger", "on-l1-create");
    const trader = await setupTrader(mock, 2, { register: false });
    const registered = async (): Promise<unknown> => ((await getJson(mock, "orderbook", `/balance-allowance?address=${trader.account}`)).body as { smart_account: unknown }).smart_account;
    assert.equal(await registered(), null);
    assert.equal((await post(mock, trader)).status, 200);
    assert.equal(await registered(), trader.key);
    // A failed L1 registers nothing.
    const other = await setupTrader(mock, 3, { register: false });
    assert.equal((await post(mock, other, { signer: privateKeyToAccount(keccak256(toHex("not the owner"))) as never })).status, 401);
    assert.equal(((await getJson(mock, "orderbook", `/balance-allowance?address=${other.account}`)).body as { smart_account: unknown }).smart_account, null);
  });

  harness.it("derive: 404 while there is no key, then the OLDEST key; the secret comes back only when auth.derive_returns_secret = yes", async (mock) => {
    mock.setSwitch("auth.max_keys", "5");
    const trader = await setupTrader(mock, 2);
    assert.deepEqual((await derive(mock, trader)).body, { error: "no API key found for this address" });
    assert.equal((await derive(mock, trader)).status, 404);
    const first = (await post(mock, trader)).body as { apiKey: string; secret: string; passphrase: string };
    await post(mock, trader);
    const derived = await derive(mock, trader);
    assert.equal(derived.status, 200);
    assert.deepEqual(derived.body, { apiKey: first.apiKey }, "the oldest key; no secret by default (AU2)");
    mock.setSwitch("auth.derive_returns_secret", "yes");
    assert.deepEqual((await derive(mock, trader)).body, first);
  });

  harness.it("keys are capped per account by auth.max_keys: 400 api key limit reached, and another account is unaffected", async (mock) => {
    const a = await setupTrader(mock, 2);
    const b = await setupTrader(mock, 3);
    assert.equal((await post(mock, a)).status, 200);
    const second = await post(mock, a);
    assert.equal(second.status, 400);
    assert.deepEqual(second.body, { error: "api key limit reached" });
    assert.equal((await post(mock, b)).status, 200);
    mock.setSwitch("auth.max_keys", "5");
    for (let i = 0; i < 4; i += 1) assert.equal((await post(mock, a)).status, 200);
    assert.equal((await post(mock, a)).status, 400);
  });

  harness.it("the same account gets the same keys on every run (ids are seeded, not random)", async (mock) => {
    const trader = await setupTrader(mock, 2);
    const first = await createCredentials(mock, trader);
    mock.state.reset();
    mock.state.forceRegistered(trader.account);
    const again = await createCredentials(mock, trader);
    assert.deepEqual(again, first);
  });

  harness.it("refuses what is not a valid ClobAuth: missing headers, a wrong signer, a wrong digest input, a malformed signature", async (mock) => {
    const trader = await setupTrader(mock, 2);
    const full = await l1Headers(mock, trader);
    for (const missing of ["xo_address", "xo_signature", "xo_timestamp"]) {
      const { [missing]: _drop, ...rest } = full;
      void _drop;
      const reply = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: rest });
      assert.equal(reply.status, 401, missing);
      assert.deepEqual(reply.body, { error: "L1 authentication required" }, missing);
    }
    // Signed by a key that does not own the account.
    const stranger = privateKeyToAccount(keccak256(toHex("a stranger")));
    const wrong = await post(mock, trader, { signer: stranger as never });
    assert.equal(wrong.status, 401);
    assert.match((wrong.body as { error: string }).error, L1_ERROR);
    // Signed over another timestamp than the header carries.
    const stale = await l1Headers(mock, trader);
    const otherTimestamp = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: { ...stale, xo_timestamp: String(Number(stale["xo_timestamp"]) + 1) } });
    assert.equal(otherTimestamp.status, 401);
    // Signed over nonce 0 but sent with nonce 1.
    const otherNonce = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: { ...stale, xo_nonce: "1" } });
    assert.equal(otherNonce.status, 401);
    // Signature with a flipped byte, with a bad length, and not hex at all. (Dropping only the last byte is NOT
    // refused: without v the remaining r and s are a valid 64-byte EIP-2098 compact signature, which the real
    // deployed validator reads as valid; mock-chain found that on the real bytecode.)
    const bytes = stale["xo_signature"] as string;
    const flipped = `${bytes.slice(0, 60)}${bytes[60] === "0" ? "1" : "0"}${bytes.slice(61)}`;
    for (const signature of [flipped, bytes.slice(0, -20), "0xzz", "0x", "nothex"]) {
      const reply = await post(mock, trader, { signature: signature as never });
      assert.equal(reply.status, 401, signature);
    }
    // A malformed address is a 400, not an authentication failure.
    assert.equal((await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: { ...stale, xo_address: "0x12" } })).status, 400);
    assert.equal((await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: { ...stale, xo_nonce: "-1" } })).status, 400);
    assert.equal(mock.write.credentials.length, 0, "nothing was minted by any of them");
  });

  harness.it("the timestamp window is 120 s of the mock clock: accepted at -110 and +120, refused at -125 and +150", async (mock) => {
    mock.setSwitch("auth.max_keys", "5");
    const trader = await setupTrader(mock, 2);
    const now = mock.clock.nowSeconds();
    const attempt = async (delta: number) => post(mock, trader, { timestamp: String(now + delta) });
    assert.equal((await attempt(-110)).status, 200);
    assert.equal((await attempt(120)).status, 200);
    for (const delta of [-125, 150]) {
      const reply = await attempt(delta);
      assert.equal(reply.status, 401, String(delta));
      assert.deepEqual(reply.body, { error: "L1 timestamp too old or too far in future" });
    }
    // The window follows the mock clock, not the wall clock.
    const before = await l1Headers(mock, trader);
    await mock.advance(130);
    const old = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: before });
    assert.equal(old.status, 401);
    assert.deepEqual(old.body, { error: "L1 timestamp too old or too far in future" });
  });

  harness.it("an account with no code fails: the gateway needs a deployed account (AD6, AU6)", async (mock) => {
    const trader = traderFor(mock, 5);
    const reply = await post(mock, trader);
    assert.equal(reply.status, 401);
    assert.equal((reply.body as { error: string }).error, "L1 signature invalid (ECDSA failed; EIP-1271: no contract code)");
  });

  harness.it("a plain ECDSA signature by an EOA over the ClobAuth passes the ECDSA path as itself", async (mock) => {
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const owner = chain.owner(6);
    const timestamp = String(mock.clock.nowSeconds());
    const { clobAuthDigest } = await import("./verify.js");
    const signature = await owner.sign({ hash: clobAuthDigest(owner.address, timestamp, 0n) });
    const reply = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: { xo_address: owner.address, xo_signature: signature, xo_timestamp: timestamp } });
    assert.equal(reply.status, 200, reply.text);
    // ... but not as somebody else's account.
    const victim = traderFor(mock, 3);
    const forged = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: { xo_address: victim.account, xo_signature: signature, xo_timestamp: timestamp } });
    assert.equal(forged.status, 401);
  });
});

describe("L2: the HMAC with an API key", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  async function trader(mock: MockXo): Promise<{ trader: Trader; creds: Credentials }> {
    const t = await setupTrader(mock, 2);
    return { trader: t, creds: await createCredentials(mock, t) };
  }

  harness.it("GET /auth/api-keys lists the account's key ids for a valid HMAC, and only that account's", async (mock) => {
    mock.setSwitch("auth.max_keys", "5");
    const { trader: a, creds } = await trader(mock);
    const b = await setupTrader(mock, 3);
    await createCredentials(mock, b);
    await createCredentials(mock, a);
    const reply = await l2Call(mock, a, creds, "GET", "/auth/api-keys");
    assert.equal(reply.status, 200);
    const ids = (reply.body as { apiKeys: string[] }).apiKeys;
    assert.equal(ids.length, 2);
    assert.deepEqual(ids, mock.write.credentialsOf(a.key).map((entry) => entry.apiKey));
    assert.ok(!ids.some((id) => mock.write.credentialsOf(b.key).some((entry) => entry.apiKey === id)));
  });

  harness.it("refuses an unsigned request, an unknown key, a wrong passphrase, a wrong signature and a tampered body", async (mock) => {
    const { trader: t, creds } = await trader(mock);
    const bare = await getJson(mock, "orderbook", "/auth/api-keys");
    assert.deepEqual(bare.body, { error: "L2 auth required" });
    assert.equal(bare.status, 401);
    const unknown = await l2Call(mock, t, { ...creds, apiKey: "00000000-0000-4000-8000-000000000000" }, "GET", "/auth/api-keys");
    assert.deepEqual(unknown.body, { error: "invalid API key" });
    const passphrase = await l2Call(mock, t, creds, "GET", "/auth/api-keys", undefined, { passphrase: "wrong" });
    assert.deepEqual(passphrase.body, { error: "invalid API key" });
    const signature = await l2Call(mock, t, creds, "GET", "/auth/api-keys", undefined, { signature: "AAAA" });
    assert.deepEqual(signature.body, { error: "invalid L2 signature" });
    // A signature for one body does not authorise another.
    const headers = l2Headers(mock, t, creds, "DELETE", "/auth/api-key", { body: JSON.stringify({ api_key: "x" }) });
    mock.setSwitch("auth.delete_level", "L2");
    const tampered = await getJson(mock, "orderbook", "/auth/api-key", { method: "DELETE", headers, body: JSON.stringify({ api_key: creds.apiKey }) });
    assert.equal(tampered.status, 401);
    assert.equal(mock.write.credentials.length, 1, "the key is still there");
  });

  harness.it("the timestamp window is 30 s of the mock clock", async (mock) => {
    const { trader: t, creds } = await trader(mock);
    const now = mock.clock.nowSeconds();
    for (const delta of [-30, 30]) assert.equal((await l2Call(mock, t, creds, "GET", "/auth/api-keys", undefined, { timestamp: String(now + delta) })).status, 200, String(delta));
    for (const delta of [-31, 31]) {
      const reply = await l2Call(mock, t, creds, "GET", "/auth/api-keys", undefined, { timestamp: String(now + delta) });
      assert.equal(reply.status, 401, String(delta));
      assert.deepEqual(reply.body, { error: "L2 timestamp too old or too far in future" });
    }
  });

  harness.it("a key belongs to its account: another account's key does not authorise XO_ADDRESS of this one", async (mock) => {
    const { trader: t, creds } = await trader(mock);
    const other = await setupTrader(mock, 3);
    const reply = await l2Call(mock, t, creds, "GET", "/auth/api-keys", undefined, { headers: { xo_address: other.account } });
    assert.equal(reply.status, 401);
    assert.deepEqual(reply.body, { error: "XO_ADDRESS does not match the API key" });
    assert.equal(accountKey(other.account), other.key);
  });

  harness.it("Xo-* header spellings are read as well as XO_*; POLY_* is not", async (mock) => {
    const { trader: t, creds } = await trader(mock);
    const headers = l2Headers(mock, t, creds, "GET", "/auth/api-keys");
    const dashed = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.replace(/_/g, "-"), value]));
    assert.equal((await getJson(mock, "orderbook", "/auth/api-keys", { headers: dashed })).status, 200);
    const poly = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.replace(/^xo_/, "poly_"), value]));
    const reply = await getJson(mock, "orderbook", "/auth/api-keys", { headers: poly });
    assert.equal(reply.status, 401);
    assert.deepEqual(reply.body, { error: "L2 auth required" });
  });
});

describe("DELETE /auth/api-key", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("under auth.delete_level = L1 only an L1 signature deletes; under L2 only an HMAC", async (mock) => {
    mock.setSwitch("auth.max_keys", "5");
    const t = await setupTrader(mock, 2);
    const creds = await createCredentials(mock, t);
    const spare = await createCredentials(mock, t);
    const del = (headers: Record<string, string>, apiKey: string) => getJson(mock, "orderbook", "/auth/api-key", { method: "DELETE", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ api_key: apiKey }) });
    const withL2 = (apiKey: string) => l2Headers(mock, t, creds, "DELETE", "/auth/api-key", { body: JSON.stringify({ api_key: apiKey }) });

    mock.setSwitch("auth.delete_level", "L1");
    const l2Only = await del(withL2(spare.apiKey), spare.apiKey);
    assert.equal(l2Only.status, 401, "an HMAC is not enough at level L1");
    assert.equal((await del(await l1Headers(mock, t), spare.apiKey)).status, 200);
    assert.equal(mock.write.credentialByKey(spare.apiKey), undefined);

    mock.setSwitch("auth.delete_level", "L2");
    const l1Only = await del(await l1Headers(mock, t), creds.apiKey);
    assert.equal(l1Only.status, 401, "an L1 signature is not enough at level L2");
    assert.equal((await del(withL2(creds.apiKey), creds.apiKey)).status, 200);
    assert.equal(mock.write.credentials.length, 0);
  });

  harness.it("cannot delete another account's key, an unknown key, or send no key", async (mock) => {
    mock.setSwitch("auth.delete_level", "L2");
    const a = await setupTrader(mock, 2);
    const b = await setupTrader(mock, 3);
    const credsA = await createCredentials(mock, a);
    const credsB = await createCredentials(mock, b);
    const del = (apiKey: unknown) => {
      const body = JSON.stringify(apiKey === undefined ? {} : { api_key: apiKey });
      return getJson(mock, "orderbook", "/auth/api-key", { method: "DELETE", headers: { "content-type": "application/json", ...l2Headers(mock, a, credsA, "DELETE", "/auth/api-key", { body }) }, body });
    };
    assert.equal((await del(credsB.apiKey)).status, 404);
    assert.equal((await del("00000000-0000-4000-8000-000000000000")).status, 404);
    assert.equal((await del(undefined)).status, 400);
    assert.ok(mock.write.credentialByKey(credsB.apiKey) !== undefined);
  });
});
