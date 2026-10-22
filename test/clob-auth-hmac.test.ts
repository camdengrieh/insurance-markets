import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { hashTypedData, recoverTypedDataAddress } from "viem";

import { buildLimitlessHeaders, limitlessSignMessage, limitlessSignature } from "../sdk/node/trade/clob/limitless/hmac.js";
import { buildPolymarketClobAuthTypedData, buildPolymarketL1Headers, hashPolymarketClobAuth, polymarketClobAuthSignTypedData, POLYMARKET_CLOB_AUTH_DOMAIN, POLYMARKET_CLOB_AUTH_MESSAGE } from "../src/clob/polymarket/clobauth.js";
import { buildPolymarketL2Headers, polymarketL2Message, polymarketL2Signature } from "../sdk/node/trade/clob/polymarket/l2.js";
import { CLOB_AUTH_DOMAIN_NAME, CLOB_AUTH_DOMAIN_VERSION, CLOB_AUTH_MESSAGE, XO_CHAIN_ID } from "../src/xo/signing/constants.js";
import { hashClobAuth } from "../src/xo/signing/clobauth.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// The Polymarket login and L2 signature, and the Limitless request signature, against the documented compositions
// (wallets-auth.md and authentication, read 2026-10-21). The HMAC reference values are computed here from the
// documented formula with a made-up secret; no venue-issued credential exists in this repository.

const SIGNER = ANVIL_TEST_ACCOUNTS[0]!;
// A made-up base64 secret (32 zero-ish bytes), labelled as such; never a real credential.
const FAKE_SECRET = Buffer.from("test-secret-not-a-real-credential!!", "utf8").toString("base64");

describe("Polymarket ClobAuth (L1)", () => {
  it("is the same struct and attestation text as XO's login, on chain 137 instead of 3223, and nothing else differs", () => {
    assert.deepEqual(POLYMARKET_CLOB_AUTH_DOMAIN, { name: CLOB_AUTH_DOMAIN_NAME, version: CLOB_AUTH_DOMAIN_VERSION, chainId: 137 });
    assert.equal(POLYMARKET_CLOB_AUTH_MESSAGE, CLOB_AUTH_MESSAGE);
    assert.notEqual(XO_CHAIN_ID, 137);
    const fields = { address: SIGNER.address, timestamp: "1792411200", nonce: 0n };
    assert.notEqual(hashPolymarketClobAuth(fields), hashClobAuth(fields), "a login for one chain is not a login for the other");
    const typed = buildPolymarketClobAuthTypedData(fields);
    assert.equal(hashTypedData(typed), hashPolymarketClobAuth(fields));
  });

  it("the JSON typed data hashes to the digest and recovers the signer (local test key)", async () => {
    const fields = { address: SIGNER.address, timestamp: "1792411200", nonce: 0n };
    const typed = polymarketClobAuthSignTypedData(fields);
    assert.equal(hashTypedData(typed as never), hashPolymarketClobAuth(fields));
    const signature = await SIGNER.signTypedData(typed as never);
    assert.equal((await recoverTypedDataAddress({ ...typed, signature } as never)).toLowerCase(), SIGNER.address.toLowerCase());
    const headers = buildPolymarketL1Headers(fields, signature);
    assert.deepEqual(Object.keys(headers), ["POLY_ADDRESS", "POLY_SIGNATURE", "POLY_TIMESTAMP", "POLY_NONCE"]);
    assert.equal(headers.POLY_TIMESTAMP, "1792411200");
    assert.equal(headers.POLY_NONCE, "0");
  });

  it("refuses a timestamp that is not unix seconds", () => {
    assert.throws(() => hashPolymarketClobAuth({ address: SIGNER.address, timestamp: "2026-10-21T00:00:00Z", nonce: 0n }), /unix seconds/);
  });
});

describe("Polymarket L2 (HMAC) headers", () => {
  it("signs timestamp + METHOD + path + body with the base64-decoded secret, URL-safe base64 with padding", () => {
    const message = polymarketL2Message({ timestampSeconds: 1792411200, method: "POST", path: "/order", body: '{"order":{}}' });
    assert.equal(message, '1792411200POST/order{"order":{}}');
    const reference = createHmac("sha256", Buffer.from(FAKE_SECRET, "base64")).update(message, "utf8").digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
    assert.equal(polymarketL2Signature(FAKE_SECRET, message), reference);
    assert.match(reference, /=$/, "padding is kept");
    assert.doesNotMatch(reference, /[+/]/);
  });

  it("builds the five headers and refuses a query string in the signed path", () => {
    const headers = buildPolymarketL2Headers({ address: SIGNER.address, credentials: { apiKey: "key-id", secret: FAKE_SECRET, passphrase: "pass" }, timestampSeconds: 1792411200, method: "GET", path: "/orders", body: "" });
    assert.deepEqual(Object.keys(headers).sort(), ["POLY_ADDRESS", "POLY_API_KEY", "POLY_PASSPHRASE", "POLY_SIGNATURE", "POLY_TIMESTAMP"]);
    assert.equal(headers["POLY_API_KEY"], "key-id");
    assert.throws(() => polymarketL2Message({ timestampSeconds: 1792411200, method: "GET", path: "/orders?x=1", body: "" }), /no query string/);
  });
});

describe("Limitless scoped-token headers", () => {
  it("signs timestamp, METHOD, path with query and body joined by newlines, base64 output", () => {
    const message = limitlessSignMessage({ timestampIso: "2026-10-19T12:00:00Z", method: "POST", pathWithQuery: "/orders?onBehalfOf=42", body: "{}" });
    assert.equal(message, "2026-10-19T12:00:00Z\nPOST\n/orders?onBehalfOf=42\n{}");
    const reference = createHmac("sha256", Buffer.from(FAKE_SECRET, "base64")).update(message, "utf8").digest("base64");
    assert.equal(limitlessSignature(FAKE_SECRET, message), reference);
    const headers = buildLimitlessHeaders({ token: { tokenId: "tok_1", secret: FAKE_SECRET }, timestampIso: "2026-10-19T12:00:00Z", method: "POST", pathWithQuery: "/orders?onBehalfOf=42", body: "{}" });
    assert.deepEqual(Object.keys(headers), ["lmts-api-key", "lmts-timestamp", "lmts-signature"]);
    assert.equal(headers["lmts-signature"], reference);
  });

  it("refuses a timestamp that is not whole-second ISO-8601 UTC", () => {
    assert.throws(() => limitlessSignMessage({ timestampIso: "1792411200", method: "GET", pathWithQuery: "/markets", body: "" }), /ISO-8601/);
  });
});
