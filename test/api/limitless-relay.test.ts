import assert from "node:assert/strict";
import { test } from "node:test";

import { stringToHex } from "viem";

import { loadApiConfig } from "../../api/config.js";
import { ACCOUNT_EXISTS_MESSAGE, LIMITLESS_RELAY_LIMITS } from "../../api/limitless-relay.js";
import { buildLimitlessHeaders } from "../../sdk/node/trade/clob/limitless/hmac.js";
import { LIMITLESS_CTF_EXCHANGE } from "../../sdk/chain/limitless/constants.js";
import { closeHarness, codeOf, DAPP, fakeUpstream, nowSeconds, postJson, proof, raw, testKey, unifiedHarness, type FakeAnswer, type Seen } from "./unified-helpers.js";

// The Limitless partner relay (api/limitless-relay.ts) against a fake Limitless: off by default; the market read without
// a token and 503 not_configured for everything else until the operator's partner token is set; the signing message;
// registration (the wallet's signature checked here, the operator's HMAC and the x-account / x-signing-message /
// x-signature headers upstream, the profile id stored, a 409 recovered as ours or answered "already has a Limitless
// account"); orders with ownerId and onBehalfOf from the store only; cancel and open orders behind the ownership proof;
// the visitor-token routes gone; deadlines; and log lines without values. Nothing here talks to Limitless.

// Made-up partner token for these tests only.
const TOKEN = { tokenId: "partner-test-token-id-made-up", secret: "cGFydG5lci10ZXN0LXNlY3JldC1tYWRlLXVwLTAxMjM=" };
const ON = { API_LIMITLESS_RELAY: "on", LIMITLESS_PARTNER_TOKEN_ID: TOKEN.tokenId, LIMITLESS_PARTNER_SECRET: TOKEN.secret };
const E = testKey("limitless-e");
const OTHER = testKey("limitless-other");
const SLUG = "will-it-rain-in-test-city-1792756800000";
const ORDER_ID = "6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203";
const PROFILE = 4242;
// The live text's form (research note 44 section 2.1) with a made-up nonce.
const SIGNING_MESSAGE = `Welcome to Limitless Exchange!\n\nThis request will not trigger a blockchain transaction or cost any gas fees.\n\nSignature is required to authenticate an upcoming API request.\n\nNonce: 0x${"5a".repeat(32)}`;

interface LimitlessWorld {
  create: FakeAnswer;
  list: FakeAnswer;
  delay: number;
}

function limitless(state: LimitlessWorld = { create: { status: 201, body: JSON.stringify({ profileId: PROFILE, account: "" }) }, list: { body: JSON.stringify({ data: [], limit: 25, page: 1, hasMore: false }) }, delay: 0 }) {
  return fakeUpstream(async (seen: Seen): Promise<FakeAnswer> => {
    if (state.delay > 0) await new Promise((resolve) => setTimeout(resolve, state.delay));
    const url = new URL(seen.url);
    if (url.pathname === "/auth/signing-message") return { body: SIGNING_MESSAGE, contentType: "text/plain; charset=utf-8" };
    if (url.pathname === "/profiles/partner-accounts" && seen.method === "POST") return state.create;
    if (url.pathname === "/profiles/partner-accounts" && seen.method === "GET") return state.list;
    if (url.pathname === "/orders") return { status: 201, body: '{"order":{"id":"6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203"}}' };
    return { body: JSON.stringify({ slug: SLUG, venue: { exchange: LIMITLESS_CTF_EXCHANGE } }) };
  });
}

// The headers the operator's token makes for one upstream call at the harness's clock.
function expectedHmac(seconds: number, method: "GET" | "POST" | "DELETE", pathWithQuery: string, body = ""): Record<string, string> {
  const timestampIso = new Date(seconds * 1000).toISOString().replace(/\.000Z$/, "Z");
  return buildLimitlessHeaders({ token: TOKEN, timestampIso, method, pathWithQuery, body });
}

async function registration(key = E): Promise<{ account: string; signingMessageHex: string; signature: string }> {
  return { account: key.address, signingMessageHex: stringToHex(SIGNING_MESSAGE), signature: await key.signMessage({ message: SIGNING_MESSAGE }) };
}

async function signedOrder(key = E, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return { salt: "12345", maker: key.address, signer: key.address, taker: "0x0000000000000000000000000000000000000000", tokenId: "1", makerAmount: "1000000", takerAmount: "2000000", expiration: "0", nonce: 0, price: 0.5, feeRateBps: 0, side: 0, signature: `0x${"cd".repeat(65)}`, signatureType: 0, ...overrides };
}

test("off by default; the market read needs no token; everything else is 503 not_configured until the partner token is set", async () => {
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data" }).config.limitlessRelay, false);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", API_LIMITLESS_RELAY: "maybe" }).fatal[0]?.variable, "API_LIMITLESS_RELAY");
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", LIMITLESS_PARTNER_TOKEN_ID: TOKEN.tokenId }).config.operator.limitlessPartner, null);
  const upstream = limitless();
  const off = await unifiedHarness({}, upstream);
  try {
    const answer = await raw(off.h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.deepEqual([answer.status, codeOf(answer.text), answer.headers["x-limitless-relay"]], [403, "relay_not_enabled", "refused"]);
  } finally {
    await closeHarness(off);
  }
  const bare = await unifiedHarness({ API_LIMITLESS_RELAY: "on" }, upstream);
  try {
    const market = await raw(bare.h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.equal(market.status, 200);
    assert.equal(market.headers["x-limitless-relay"], "upstream");
    assert.equal(upstream.seen[0]?.url, `https://api.limitless.exchange/markets/${SLUG}`);
    assert.equal(upstream.seen[0]?.headers["lmts-api-key"], undefined, "a public read is sent unsigned");
    for (const [method, path] of [["GET", "/v1/relay/limitless/signing-message"], ["POST", "/v1/relay/limitless/register"], ["POST", "/v1/relay/limitless/orders"], ["POST", "/v1/relay/limitless/orders/cancel"], ["GET", `/v1/relay/limitless/orders?account=${E.address}&marketSlug=${SLUG}`]] as const) {
      const r = await raw(bare.h.server.origin, method, path, { ...DAPP, "content-type": "application/json" }, method === "POST" ? "{}" : undefined);
      assert.deepEqual([r.status, codeOf(r.text)], [503, "not_configured"], path);
    }
    assert.equal(upstream.seen.length, 1);
  } finally {
    await closeHarness(bare);
  }
});

test("the signing message is passed through as text, unsigned", async () => {
  const upstream = limitless();
  const u = await unifiedHarness(ON, upstream);
  try {
    const answer = await raw(u.h.server.origin, "GET", "/v1/relay/limitless/signing-message", DAPP);
    assert.equal(answer.status, 200);
    assert.equal(answer.text, SIGNING_MESSAGE);
    assert.match(String(answer.headers["content-type"]), /^text\/plain/);
    assert.equal(upstream.seen[0]?.url, "https://api.limitless.exchange/auth/signing-message");
    assert.equal(upstream.seen[0]?.headers["lmts-signature"], undefined);
    assert.equal((await raw(u.h.server.origin, "GET", "/v1/relay/limitless/signing-message?x=1", DAPP)).status, 400);
  } finally {
    await closeHarness(u);
  }
});

test("register: the wallet's own signature, the operator's HMAC and the three x- headers; the profile id stored and reused", async () => {
  const state: LimitlessWorld = { create: { status: 201, body: JSON.stringify({ profileId: PROFILE, account: E.address }) }, list: { body: '{"data":[]}' }, delay: 0 };
  const upstream = limitless(state);
  const u = await unifiedHarness(ON, upstream);
  try {
    const good = await registration();
    // Someone else's signature over the message, or a signature over another message, never reaches Limitless.
    const forged = { ...good, signature: await OTHER.signMessage({ message: SIGNING_MESSAGE }) };
    assert.deepEqual([(await postJson(u.h.server.origin, "/v1/relay/limitless/register", forged)).status, upstream.seen.length], [401, 0]);
    const otherText = { ...good, signingMessageHex: stringToHex(`${SIGNING_MESSAGE}0`) };
    assert.equal((await postJson(u.h.server.origin, "/v1/relay/limitless/register", otherText)).status, 401);
    for (const bad of [{ ...good, account: "0x12" }, { ...good, signingMessageHex: "0xzz" }, { ...good, signature: "0x12" }, { ...good, extra: 1 }, { ...good, signingMessageHex: stringToHex("x".repeat(LIMITLESS_RELAY_LIMITS.maxSigningMessageBytes + 1)) }]) {
      assert.equal((await postJson(u.h.server.origin, "/v1/relay/limitless/register", bad)).status, 400, JSON.stringify(bad).slice(0, 60));
    }
    assert.equal(upstream.seen.length, 0);

    const answer = await postJson(u.h.server.origin, "/v1/relay/limitless/register", good);
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(JSON.parse(answer.text), { profileId: PROFILE });
    assert.equal(answer.headers["x-limitless-relay"], "server");
    const [sent] = upstream.seen;
    assert.equal(sent?.url, "https://api.limitless.exchange/profiles/partner-accounts");
    assert.equal(sent?.method, "POST");
    assert.equal(sent?.body?.toString("utf8"), "{}");
    assert.equal(sent?.headers["x-account"], E.address);
    assert.equal(sent?.headers["x-signing-message"], good.signingMessageHex);
    assert.equal(sent?.headers["x-signature"], good.signature);
    const expected = expectedHmac(nowSeconds(u.clock), "POST", "/profiles/partner-accounts", "{}");
    for (const name of ["lmts-api-key", "lmts-timestamp", "lmts-signature"]) assert.equal(sent?.headers[name], expected[name], name);
    assert.equal(u.store.limitlessProfile(E.address), PROFILE);
    // Registering again answers from the store.
    const again = await postJson(u.h.server.origin, "/v1/relay/limitless/register", good);
    assert.deepEqual([again.status, JSON.parse(again.text), upstream.seen.length], [200, { profileId: PROFILE }, 1]);
  } finally {
    await closeHarness(u);
  }
});

test("register: a 409 is ours when the partner list names the account, otherwise 'already has a Limitless account'", async () => {
  const state: LimitlessWorld = { create: { status: 409, body: '{"message":"exists"}' }, list: { body: JSON.stringify({ data: [{ profileId: 77, account: E.address.toLowerCase(), displayName: "x" }], limit: 25, page: 1, hasMore: false }) }, delay: 0 };
  const upstream = limitless(state);
  const u = await unifiedHarness(ON, upstream);
  try {
    const ours = await postJson(u.h.server.origin, "/v1/relay/limitless/register", await registration());
    assert.deepEqual([ours.status, JSON.parse(ours.text)], [200, { profileId: 77 }]);
    const lookup = upstream.seen[1];
    assert.equal(lookup?.url, `https://api.limitless.exchange/profiles/partner-accounts?account=${E.address}`);
    assert.equal(lookup?.headers["lmts-signature"], expectedHmac(nowSeconds(u.clock), "GET", `/profiles/partner-accounts?account=${E.address}`)["lmts-signature"]);
    // Someone else's profile: the list does not name it.
    const theirs = await postJson(u.h.server.origin, "/v1/relay/limitless/register", await registration(OTHER));
    assert.deepEqual([theirs.status, codeOf(theirs.text)], [409, "account_exists"]);
    assert.equal(JSON.parse(theirs.text).error.message, ACCOUNT_EXISTS_MESSAGE);
    assert.equal(u.store.limitlessProfile(OTHER.address), null);
    // A malformed creation answer is not stored.
    state.create = { status: 201, body: '{"account":"x"}' };
    const third = testKey("limitless-third");
    const bad = await postJson(u.h.server.origin, "/v1/relay/limitless/register", await registration(third));
    assert.deepEqual([bad.status, codeOf(bad.text)], [502, "upstream_invalid"]);
    // Any other refusal passes through.
    state.create = { status: 403, body: '{"message":"missing scope account_creation"}' };
    const scope = await postJson(u.h.server.origin, "/v1/relay/limitless/register", await registration(third));
    assert.deepEqual([scope.status, scope.text, scope.headers["x-limitless-relay"]], [403, '{"message":"missing scope account_creation"}', "upstream"]);
  } finally {
    await closeHarness(u);
  }
});

test("orders: ownerId and onBehalfOf come from the store only, for an EOA order the account signed", async () => {
  const upstream = limitless();
  const u = await unifiedHarness(ON, upstream);
  try {
    const body = { account: E.address, order: await signedOrder(), orderType: "GTC", marketSlug: SLUG, postOnly: true, clientOrderId: "ticket-1" };
    const unregistered = await postJson(u.h.server.origin, "/v1/relay/limitless/orders", body);
    assert.deepEqual([unregistered.status, codeOf(unregistered.text)], [409, "not_registered"]);
    u.store.setLimitlessProfile(E.address, PROFILE, u.clock.now);
    for (const bad of [
      { ...body, order: await signedOrder(OTHER) },
      { ...body, order: await signedOrder(E, { signer: OTHER.address }) },
      { ...body, order: await signedOrder(E, { signatureType: 3 }) },
      { ...body, order: await signedOrder(E, { signature: undefined }) },
      { ...body, orderType: "IOC" },
      { ...body, marketSlug: "active" },
      { ...body, ownerId: 1 },
      { ...body, onBehalfOf: 1 },
      { ...body, postOnly: "yes" },
    ]) {
      assert.equal((await postJson(u.h.server.origin, "/v1/relay/limitless/orders", bad)).status, 400, JSON.stringify(bad).slice(0, 100));
    }
    assert.equal(upstream.seen.length, 0);
    const placed = await postJson(u.h.server.origin, "/v1/relay/limitless/orders", body);
    assert.equal(placed.status, 201, placed.text);
    const [sent] = upstream.seen;
    assert.equal(sent?.url, "https://api.limitless.exchange/orders");
    const forwarded = JSON.parse(sent?.body?.toString("utf8") ?? "{}") as Record<string, unknown>;
    assert.deepEqual(forwarded, { order: body.order, ownerId: PROFILE, onBehalfOf: PROFILE, orderType: "GTC", marketSlug: SLUG, postOnly: true, clientOrderId: "ticket-1" });
    assert.equal(sent?.headers["lmts-signature"], expectedHmac(nowSeconds(u.clock), "POST", "/orders", sent?.body?.toString("utf8"))["lmts-signature"]);
    assert.equal(sent?.headers["lmts-api-key"], TOKEN.tokenId);
  } finally {
    await closeHarness(u);
  }
});

test("cancel and open orders need the account's ownership proof; the delegated call goes out with the stored profile id", async () => {
  const upstream = limitless();
  const u = await unifiedHarness(ON, upstream);
  try {
    u.store.setLimitlessProfile(E.address, PROFILE, u.clock.now);
    const seconds = nowSeconds(u.clock);
    const path = "/v1/relay/limitless/orders/cancel";
    const body = JSON.stringify({ account: E.address, orderId: ORDER_ID });
    assert.deepEqual([(await postJson(u.h.server.origin, path, body)).status, upstream.seen.length], [401, 0]);
    const wrongSigner = await postJson(u.h.server.origin, path, body, { "x-im-proof": (await proof(OTHER, "POST", path, body, seconds)).replace(OTHER.address, E.address) });
    assert.deepEqual([wrongSigner.status, codeOf(wrongSigner.text)], [401, "proof_invalid"]);
    const expired = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(E, "POST", path, body, seconds - 600) });
    assert.equal(expired.status, 401);
    const otherBody = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(E, "POST", path, JSON.stringify({ account: E.address, orderId: "7f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203" }), seconds) });
    assert.equal(otherBody.status, 401);
    assert.equal(upstream.seen.length, 0);
    const cancelled = await postJson(u.h.server.origin, path, body, { "x-im-proof": await proof(E, "POST", path, body, seconds) });
    assert.equal(cancelled.status, 200);
    const [cancel] = upstream.seen;
    assert.equal(cancel?.method, "DELETE");
    assert.equal(cancel?.url, `https://api.limitless.exchange/orders/${ORDER_ID}?onBehalfOf=${PROFILE}`);
    assert.equal(cancel?.headers["lmts-signature"], expectedHmac(seconds, "DELETE", `/orders/${ORDER_ID}?onBehalfOf=${PROFILE}`)["lmts-signature"]);
    // An account without a profile here, with its own good proof.
    const otherCancel = JSON.stringify({ account: OTHER.address, orderId: ORDER_ID });
    const none = await postJson(u.h.server.origin, path, otherCancel, { "x-im-proof": await proof(OTHER, "POST", path, otherCancel, seconds) });
    assert.deepEqual([none.status, codeOf(none.text)], [409, "not_registered"]);

    const query = `?account=${E.address}&marketSlug=${SLUG}&limit=5`;
    const list = "/v1/relay/limitless/orders";
    assert.equal((await raw(u.h.server.origin, "GET", `${list}${query}`, DAPP)).status, 401);
    const listed = await raw(u.h.server.origin, "GET", `${list}${query}`, { ...DAPP, "x-im-proof": await proof(E, "GET", `${list}${query}`, "", seconds) });
    assert.equal(listed.status, 200);
    const read = upstream.seen.at(-1);
    assert.equal(read?.url, `https://api.limitless.exchange/markets/${SLUG}/user-orders?limit=5`);
    assert.equal(read?.headers["x-on-behalf-of"], String(PROFILE));
    assert.equal(read?.headers["lmts-signature"], expectedHmac(seconds, "GET", `/markets/${SLUG}/user-orders?limit=5`)["lmts-signature"]);
    // A proof of the path alone is accepted too; a proof by someone else for E's orders is not.
    assert.equal((await raw(u.h.server.origin, "GET", `${list}${query}`, { ...DAPP, "x-im-proof": await proof(E, "GET", list, "", seconds) })).status, 200);
    assert.equal((await raw(u.h.server.origin, "GET", `${list}${query}`, { ...DAPP, "x-im-proof": await proof(OTHER, "GET", `${list}${query}`, "", seconds) })).status, 401);
    for (const bad of [`?account=${E.address}`, `?account=${E.address}&marketSlug=${SLUG}&limit=500`, `?account=${E.address}&marketSlug=${SLUG}&statuses=ALL`]) {
      assert.equal((await raw(u.h.server.origin, "GET", `${list}${bad}`, { ...DAPP, "x-im-proof": await proof(E, "GET", `${list}${bad}`, "", seconds) })).status, 400, bad);
    }
  } finally {
    await closeHarness(u);
  }
});

test("the visitor-token routes are gone and no browser lmts-* header is ever forwarded", async () => {
  const upstream = limitless();
  const u = await unifiedHarness(ON, upstream);
  try {
    const visitor = buildLimitlessHeaders({ token: { tokenId: "visitor-token", secret: TOKEN.secret }, timestampIso: "2026-10-24T12:00:00Z", method: "GET", pathWithQuery: "/profiles/me", body: "" });
    const refused: Array<[string, string, number]> = [
      ["GET", "/v1/relay/limitless/profiles/me", 404],
      ["DELETE", `/v1/relay/limitless/orders/${ORDER_ID}`, 404],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders`, 404],
      ["GET", "/v1/relay/limitless/markets/active", 404],
      ["POST", "/v1/relay/limitless/portfolio/withdraw", 404],
      ["PUT", "/v1/relay/limitless/orders", 405],
      ["GET", "/v1/relay/limitless/register", 405],
    ];
    for (const [method, path, status] of refused) assert.equal((await raw(u.h.server.origin, method, path, { ...DAPP, ...visitor })).status, status, `${method} ${path}`);
    await raw(u.h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, { ...DAPP, ...visitor });
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0]?.headers["lmts-api-key"], undefined);
    const preflight = await raw(u.h.server.origin, "OPTIONS", "/v1/relay/limitless/orders", { ...DAPP, "access-control-request-method": "POST" });
    assert.deepEqual([preflight.headers["access-control-allow-methods"], preflight.headers["access-control-allow-headers"]], ["GET, POST, OPTIONS", "content-type, x-im-proof"]);
    const cancel = await raw(u.h.server.origin, "OPTIONS", "/v1/relay/limitless/orders/cancel", { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(cancel.headers["access-control-allow-headers"], "content-type, x-im-proof");
    const evil = await raw(u.h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, { origin: "https://evil.example" });
    assert.deepEqual([evil.status, codeOf(evil.text)], [403, "origin_not_allowed"]);
  } finally {
    await closeHarness(u);
  }
});

test("a deadline on an order post says it may have been placed; log lines carry no value", async () => {
  const state: LimitlessWorld = { create: { status: 201, body: "{}" }, list: { body: "{}" }, delay: 0 };
  const base = limitless(state);
  const abortable = (async (input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      void base.fetch(input, init).then(resolve, reject);
    })) as typeof fetch;
  const u = await unifiedHarness(ON, { fetch: abortable, seen: base.seen }, { timeoutMs: 50 });
  try {
    u.store.setLimitlessProfile(E.address, PROFILE, u.clock.now);
    state.delay = 200;
    const slow = await postJson(u.h.server.origin, "/v1/relay/limitless/orders", { account: E.address, order: await signedOrder(), orderType: "FAK", marketSlug: SLUG });
    assert.deepEqual([slow.status, codeOf(slow.text)], [504, "upstream_timeout"]);
    assert.match(slow.text, /may or may not have been placed/);
    assert.equal(base.seen.length, 1, "nothing retried");
    for (const line of u.logs) {
      for (const value of [TOKEN.tokenId, TOKEN.secret, E.address, SLUG, String(PROFILE)]) assert.equal(line.includes(value), false, `${line} holds a value`);
      assert.match(line, /^(GET|POST|OPTIONS) \/v1\/relay\/limitless\/[a-z/:-]+ \d{3} \d+ms$/);
    }
  } finally {
    await closeHarness(u);
  }
});
