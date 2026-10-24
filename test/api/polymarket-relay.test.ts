import assert from "node:assert/strict";
import { test } from "node:test";

import { getAddress } from "viem";

import { builderHeaders, builderMessage, builderSignature } from "../../api/builder-signing.js";
import { loadApiConfig } from "../../api/config.js";
import { POLYMARKET_CTF_EXCHANGE, POLYMARKET_PUSD } from "../../sdk/chain/polymarket/constants.js";
import { POLYMARKET_DEPOSIT_WALLET_FACTORY } from "../../sdk/chain/xo/constants.js";
import { depositWalletAddress } from "../../sdk/trade/clob/polymarket/deposit-wallet.js";
import { approveData, closeHarness, codeOf, DAPP, fakeUpstream, nowSeconds, postJson, proof, raw, testKey, transferData, unifiedHarness, type Seen } from "./unified-helpers.js";

// The Polymarket builder relay (api/polymarket-relay.ts, api/builder-signing.ts) against a fake relayer: the builder
// HMAC against an independently computed vector, off by default and 503 not_configured without the Builder credentials,
// the allowlist of paths, methods, queries and transaction types, the ownership proof WALLET-CREATE needs, the WALLET
// batch target rule, the session-signer routes with their Idempotency-Key, the per-signer limit, and that no secret or
// body reaches a log line.

// A made-up test secret (base64 of "builder-vector-secret-for-tests-01"); never a real credential.
const SECRET = "YnVpbGRlci12ZWN0b3Itc2VjcmV0LWZvci10ZXN0cy0wMQ==";
const CREDS = { apiKey: "builder-test-key-made-up", secret: SECRET, passphrase: "builder-test-passphrase-made-up" };
const ON = { API_POLYMARKET_RELAY: "on", POLY_BUILDER_API_KEY: CREDS.apiKey, POLY_BUILDER_SECRET: SECRET, POLY_BUILDER_PASSPHRASE: CREDS.passphrase };
const E = testKey("polymarket-e");
const OTHER = testKey("polymarket-other");
const VECTOR_BODY = '{"type":"WALLET-CREATE","from":"0x1111111111111111111111111111111111111111","to":"0x00000000000Fb5C9ADea0298D729A0CB3823Cc07","metadata":"Deploy Deposit Wallet"}';

test("the builder signature matches a vector computed independently (openssl) from the builder-signing-sdk steps", () => {
  // Computed outside this code base:
  //   printf '%s' "$MSG" | openssl dgst -sha256 -mac HMAC -macopt hexkey:<hex of base64-decoded secret> -binary | base64 | tr '+/' '-_'
  // with MSG = timestamp + method + path + body (no query; nothing for a body-less GET). The "=" padding is kept, "+" and
  // "/" become "-" and "_".
  assert.equal(builderMessage(1761300002, "POST", "/submit", VECTOR_BODY), `1761300002POST/submit${VECTOR_BODY}`);
  assert.equal(builderSignature(SECRET, 1761300002, "POST", "/submit", VECTOR_BODY), "l8v9ByhaVlpp2Qt_xmBOZ-ArbDz3jcWi2n1PmAQ_jbk=");
  assert.equal(builderSignature(SECRET, 1761300003, "POST", "/submit", VECTOR_BODY), "_V7iyWTjOLTrNy5Sm9c1yxWL-j43QVyo6OgYS71fhqM=");
  assert.equal(builderSignature(SECRET, 1761300000, "GET", "/v1/account/transactions/params", undefined), "D3DaJb15xNp0wXMjdZSsha4qEIW_N0rAE8vAv1QBWE4=");
  // The url-safe alphabet of the same secret decodes to the same key.
  assert.equal(builderSignature(SECRET.replace(/\+/g, "-").replace(/\//g, "_"), 1761300000, "GET", "/v1/account/transactions/params", undefined), "D3DaJb15xNp0wXMjdZSsha4qEIW_N0rAE8vAv1QBWE4=");
  assert.deepEqual(builderHeaders(CREDS, 1761300002, "POST", "/submit", VECTOR_BODY), {
    POLY_BUILDER_API_KEY: CREDS.apiKey,
    POLY_BUILDER_PASSPHRASE: CREDS.passphrase,
    POLY_BUILDER_SIGNATURE: "l8v9ByhaVlpp2Qt_xmBOZ-ArbDz3jcWi2n1PmAQ_jbk=",
    POLY_BUILDER_TIMESTAMP: "1761300002",
  });
  assert.throws(() => builderMessage(1, "GET", "/v1/account/transactions/params?address=0x1", undefined), /no query/);
});

const relayer = () => fakeUpstream((seen: Seen) => (seen.url.includes("/submit") ? { body: '{"transactionID":"tx-1","state":"STATE_NEW"}' } : { body: '{"nonce":"3"}' }));

test("off by default, and 503 not_configured without all three Builder credentials", async () => {
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data" }).config.polymarketRelay, false);
  const short = loadApiConfig({ API_DATA_DIR: "/data", POLY_BUILDER_API_KEY: "k", POLY_BUILDER_SECRET: "not base64!" });
  assert.equal(short.config.operator.polyBuilder, null);
  assert.equal(JSON.stringify(short.issues).includes("not base64!"), false);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", POLY_BUILDER_CODE: "0x12" }).config.operator.polyBuilderCode, null);
  const upstream = relayer();
  const off = await unifiedHarness({}, upstream);
  try {
    assert.equal(codeOf((await raw(off.h.server.origin, "GET", `/v1/relay/polymarket/deployed?address=${E.address}&type=WALLET`, DAPP)).text), "relay_not_enabled");
  } finally {
    await closeHarness(off);
  }
  const bare = await unifiedHarness({ API_POLYMARKET_RELAY: "on" }, upstream);
  try {
    const answer = await raw(bare.h.server.origin, "GET", `/v1/relay/polymarket/deployed?address=${E.address}&type=WALLET`, DAPP);
    assert.deepEqual([answer.status, codeOf(answer.text)], [503, "not_configured"]);
    assert.equal(upstream.seen.length, 0);
  } finally {
    await closeHarness(bare);
  }
});

test("reads go out with the builder headers over the path without its query, the query forwarded as sent", async () => {
  const upstream = relayer();
  const u = await unifiedHarness(ON, upstream);
  try {
    const path = `/v1/relay/polymarket/v1/account/transactions/params?address=${E.address}&type=WALLET`;
    const answer = await raw(u.h.server.origin, "GET", path, DAPP);
    assert.equal(answer.status, 200);
    assert.equal(answer.headers["access-control-allow-origin"], DAPP.origin);
    const [sent] = upstream.seen;
    assert.equal(sent?.url, `https://relayer-v2.polymarket.com/v1/account/transactions/params?address=${E.address}&type=WALLET`);
    const seconds = nowSeconds(u.clock);
    assert.equal(sent?.headers["poly_builder_signature"], builderSignature(SECRET, seconds, "GET", "/v1/account/transactions/params", undefined));
    assert.equal(sent?.headers["poly_builder_timestamp"], String(seconds));
    assert.equal(sent?.headers["poly_builder_api_key"], CREDS.apiKey);
    assert.equal(sent?.headers["poly_builder_passphrase"], CREDS.passphrase);
    for (const ok of [`/v1/relay/polymarket/v1/account/transactions/0193a7b2-7c1e-7d2a-9f00-1234abcd5678`, `/v1/relay/polymarket/deployed?type=WALLET&address=${E.address}`, "/v1/relay/polymarket/transaction?id=0193a7b2"]) {
      assert.equal((await raw(u.h.server.origin, "GET", ok, DAPP)).status, 200, ok);
    }
    const refused: Array<[string, string, number, string]> = [
      ["GET", "/v1/relay/polymarket/nonce", 404, "not_found"],
      ["GET", "/v1/relay/polymarket/relay-payload", 404, "not_found"],
      ["POST", "/v1/relay/polymarket/auth/builder-api-key", 404, "not_found"],
      ["GET", "/v1/relay/polymarket", 404, "not_found"],
      ["GET", "/v1/relay/polymarket/submit", 405, "method_not_allowed"],
      ["POST", "/v1/relay/polymarket/deployed", 405, "method_not_allowed"],
      ["GET", `/v1/relay/polymarket/deployed?address=${E.address}&type=SAFE`, 400, "invalid_request"],
      ["GET", `/v1/relay/polymarket/deployed?address=${E.address}`, 400, "invalid_request"],
      ["GET", `/v1/relay/polymarket/deployed?address=${E.address}&type=WALLET&x=1`, 400, "invalid_request"],
      ["GET", "/v1/relay/polymarket/v1/account/transactions/a%2Fb", 404, "not_found"],
    ];
    const before = upstream.seen.length;
    for (const [method, path2, status, code] of refused) {
      const r = await raw(u.h.server.origin, method, path2, { ...DAPP, ...(method === "POST" ? { "content-type": "application/json" } : {}) }, method === "POST" ? "{}" : undefined);
      assert.deepEqual([r.status, codeOf(r.text)], [status, code], `${method} ${path2}`);
    }
    assert.equal(upstream.seen.length, before);
    for (const line of u.logs) {
      assert.equal(line.includes(SECRET) || line.includes(CREDS.apiKey) || line.includes(CREDS.passphrase) || line.includes(E.address), false, line);
    }
  } finally {
    await closeHarness(u);
  }
});

test("WALLET-CREATE needs an ownership proof for `from`; the body that goes out is the one that was signed", async () => {
  const upstream = relayer();
  const u = await unifiedHarness(ON, upstream);
  try {
    const path = "/v1/relay/polymarket/submit";
    const body = JSON.stringify({ type: "WALLET-CREATE", from: E.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY, metadata: "Deploy Deposit Wallet" });
    const seconds = nowSeconds(u.clock);
    const missing = await postJson(u.h.server.origin, path, body);
    assert.deepEqual([missing.status, codeOf(missing.text)], [401, "proof_required"]);
    const theirs = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(OTHER, "POST", path, body, seconds) });
    assert.deepEqual([theirs.status, codeOf(theirs.text)], [401, "proof_invalid"]);
    const stale = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(E, "POST", path, body, seconds - 301) });
    assert.deepEqual([stale.status, codeOf(stale.text)], [401, "proof_invalid"]);
    const otherBody = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(E, "POST", path, body.replace("Deploy", "Make"), seconds) });
    assert.equal(otherBody.status, 401);
    assert.equal(upstream.seen.length, 0, "nothing sent without a good proof");
    const ok = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(E, "POST", path, body, seconds) });
    assert.equal(ok.status, 200, ok.text);
    assert.equal(JSON.parse(ok.text).transactionID, "tx-1");
    const [sent] = upstream.seen;
    assert.equal(sent?.url, "https://relayer-v2.polymarket.com/submit");
    assert.equal(sent?.body?.toString("utf8"), body);
    assert.equal(sent?.headers["poly_builder_signature"], builderSignature(SECRET, seconds, "POST", "/submit", body));
    assert.equal(sent?.headers["x-im-proof"], undefined, "the proof stays here");
    // Wrong factory, unknown type, extra field.
    for (const bad of [{ type: "WALLET-CREATE", from: E.address, to: POLYMARKET_CTF_EXCHANGE }, { type: "SAFE", from: E.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY }, { type: "WALLET-CREATE", from: E.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY, extra: 1 }]) {
      const text = JSON.stringify(bad);
      const r = await postJson(u.h.server.origin, path, text, { "x-im-proof": await proof(E, "POST", path, text, seconds) });
      assert.ok(r.status === 400 || r.status === 404, text);
    }
    assert.equal(upstream.seen.length, 1);
  } finally {
    await closeHarness(u);
  }
});

test("a WALLET batch goes out only for the signer's own Deposit Wallet and listed targets", async () => {
  const upstream = relayer();
  const u = await unifiedHarness(ON, upstream);
  try {
    const path = "/v1/relay/polymarket/submit";
    const wallet = depositWalletAddress(E.address, "beacon");
    const batch = (calls: Array<{ target: string; value: string; data: string }>, depositWallet: string = wallet) =>
      JSON.stringify({ type: "WALLET", from: E.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY, nonce: "3", signature: `0x${"ab".repeat(65)}`, metadata: "approvals", depositWalletParams: { depositWallet, deadline: "1792756800", calls } });
    const good = batch([{ target: POLYMARKET_PUSD, value: "0", data: approveData(POLYMARKET_CTF_EXCHANGE) }, { target: POLYMARKET_PUSD, value: "0", data: transferData(E.address) }]);
    const ok = await postJson(u.h.server.origin, path, good);
    assert.equal(ok.status, 200, ok.text);
    assert.equal(upstream.seen[0]?.body?.toString("utf8"), good);
    const stranger = getAddress("0x00000000000000000000000000000000000c0ffe");
    const refusals: Array<[string, number]> = [
      [batch([{ target: stranger, value: "0", data: "0x" }]), 403],
      [batch([{ target: POLYMARKET_PUSD, value: "0", data: transferData(stranger) }]), 403],
      [batch([{ target: POLYMARKET_PUSD, value: "0", data: approveData(stranger) }]), 403],
      [batch([{ target: POLYMARKET_PUSD, value: "1", data: approveData(POLYMARKET_CTF_EXCHANGE) }]), 403],
      [batch([{ target: POLYMARKET_PUSD, value: "0", data: approveData(POLYMARKET_CTF_EXCHANGE) }], depositWalletAddress(OTHER.address, "beacon")), 400],
      [batch([]), 400],
    ];
    for (const [body, status] of refusals) assert.equal((await postJson(u.h.server.origin, path, body)).status, status, body.slice(0, 120));
    assert.equal(upstream.seen.length, 1);
    // The per-signer limit (20 at once) holds across clients.
    let limited = false;
    for (let i = 0; i < 25 && !limited; i += 1) limited = (await postJson(u.h.server.origin, path, good)).status === 429;
    assert.ok(limited);
  } finally {
    await closeHarness(u);
  }
});

test("session-signer calls need an Idempotency-Key, forwarded with the builder headers", async () => {
  const upstream = relayer();
  const u = await unifiedHarness(ON, upstream);
  try {
    const wallet = depositWalletAddress(E.address, "beacon");
    const path = "/v1/relay/polymarket/v1/session-signers/authorizations";
    const body = JSON.stringify({ walletAddress: wallet, sessionSignerAddress: OTHER.address, scopes: ["CLOB"], validUntil: 1792756800, nonce: "4", deadline: "1761300600", signature: `0x${"cd".repeat(65)}` });
    const missing = await postJson(u.h.server.origin, path, body);
    assert.deepEqual([missing.status, codeOf(missing.text)], [400, "invalid_request"]);
    const ok = await postJson(u.h.server.origin, path, body, { "idempotency-key": "auth-0001-test" });
    assert.equal(ok.status, 200);
    const [sent] = upstream.seen;
    assert.equal(sent?.url, "https://relayer-v2.polymarket.com/v1/session-signers/authorizations");
    assert.equal(sent?.headers["idempotency-key"], "auth-0001-test");
    assert.equal(sent?.headers["poly_builder_signature"], builderSignature(SECRET, nowSeconds(u.clock), "POST", "/v1/session-signers/authorizations", body));
    const revoke = JSON.stringify({ walletAddress: wallet, sessionSignerAddress: OTHER.address, nonce: "5", deadline: "1761300600", signature: `0x${"cd".repeat(65)}` });
    assert.equal((await postJson(u.h.server.origin, "/v1/relay/polymarket/v1/session-signers/revocations", revoke, { "idempotency-key": "rev-0001-test" })).status, 200);
    assert.equal((await postJson(u.h.server.origin, "/v1/relay/polymarket/v1/session-signers/revocations", body, { "idempotency-key": "rev-0002-test" })).status, 400, "an authorization body on the revocation route");
    const preflight = await raw(u.h.server.origin, "OPTIONS", path, { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(preflight.headers["access-control-allow-headers"], "content-type, idempotency-key");
    const submitPreflight = await raw(u.h.server.origin, "OPTIONS", "/v1/relay/polymarket/submit", { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(submitPreflight.headers["access-control-allow-headers"], "content-type, x-im-proof");
  } finally {
    await closeHarness(u);
  }
});
