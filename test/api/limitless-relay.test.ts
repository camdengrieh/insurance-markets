import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";

import { loadApiConfig } from "../../api/config.js";
import { LIMITLESS_RELAY_LIMITS, LIMITLESS_RELAY_ROUTES } from "../../api/limitless-relay.js";
import { XO_RELAY_DAPP_ORIGIN } from "../../api/xo-relay.js";
import { buildLimitlessHeaders } from "../../sdk/node/trade/clob/limitless/hmac.js";
import { absentVenue, Clock, startHarness, testConfig, type Harness } from "./helpers.js";

// The Limitless order relay (api/limitless-relay.ts) against a fake Limitless: off by default, the allowlist of methods,
// paths and queries (the query forwarded exactly, as the HMAC covers it), the three lmts-* headers and nothing else
// going on, only content-type coming back, the 64 KiB body cap, CORS for the dApp and the dev server only, its own
// per-client limit, the deadline, and that no header value, slug or body reaches a log line. Nothing here talks to
// Limitless.

const LIMITLESS = "https://api.limitless.exchange";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const SLUG = "will-it-rain-in-test-city-1792756800000";
const ORDER_ID = "6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203";
const TOKEN = { tokenId: "relay-test-token-id-4b7e", secret: "cmVsYXktdGVzdC1zZWNyZXQtb25seS0wMTIzNDU2Nzg5" };

// The headers a browser makes for one request: the same signer the server-side flow uses, with a test token.
function signed(method: "GET" | "POST" | "DELETE", pathWithQuery: string, body = ""): Record<string, string> {
  return buildLimitlessHeaders({ token: TOKEN, timestampIso: "2026-10-23T12:00:00Z", method, pathWithQuery, body });
}

interface Seen {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: Buffer | null;
}

interface FakeAnswer {
  readonly status?: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
}

function fakeLimitless(answer: (seen: Seen) => FakeAnswer | Promise<FakeAnswer> = () => ({ body: "{}" })): { readonly fetch: typeof fetch; readonly seen: Seen[] } {
  const seen: Seen[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const body = init?.body === undefined || init.body === null ? null : Buffer.from(init.body as Uint8Array);
    const entry: Seen = { url: String(input), method: init?.method ?? "GET", headers, body };
    seen.push(entry);
    if (init?.signal?.aborted === true) throw new Error("aborted");
    const out = await answer(entry);
    return new Response(out.body ?? "{}", { status: out.status ?? 200, headers: { "content-type": "application/json; charset=utf-8", ...out.headers } });
  };
  return { fetch: impl as typeof fetch, seen };
}

async function relayHarness(options: { readonly on?: boolean; readonly upstream?: ReturnType<typeof fakeLimitless>; readonly timeoutMs?: number; readonly xo?: boolean } = {}): Promise<{ h: Harness; upstream: ReturnType<typeof fakeLimitless>; logs: string[] }> {
  const upstream = options.upstream ?? fakeLimitless();
  const logs: string[] = [];
  const env: Record<string, string> = {};
  if (options.on !== false) env["API_LIMITLESS_RELAY"] = "on";
  if (options.xo === true) env["API_XO_RELAY"] = "on";
  const h = await startHarness({
    config: testConfig(env),
    fetchFor: (venue) => absentVenue(venue),
    clock: new Clock(NOW),
    relayFetch: upstream.fetch,
    log: (line) => logs.push(line),
    ...(options.timeoutMs === undefined ? {} : { relayUpstreamTimeoutMs: options.timeoutMs }),
  });
  return { h, upstream, logs };
}

function raw(origin: string, method: string, path: string, headers: Record<string, string> = {}, body?: string | Buffer): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
  const url = new URL(origin);
  const framed = body === undefined || headers["transfer-encoding"] !== undefined ? headers : { ...headers, "content-length": String(Buffer.byteLength(body)) };
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, method, path, headers: framed }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const codeOf = (text: string): unknown => (JSON.parse(text) as { error?: { code?: unknown } }).error?.code;
const DAPP = { origin: XO_RELAY_DAPP_ORIGIN };

test("the Limitless relay is off by default: every path answers relay_not_enabled and nothing is sent", async () => {
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data" }).config.limitlessRelay, false);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", API_LIMITLESS_RELAY: "on" }).config.limitlessRelay, true);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", API_LIMITLESS_RELAY: "maybe" }).fatal[0]?.variable, "API_LIMITLESS_RELAY");
  // The XO relay being on does not turn this one on.
  const { h, upstream } = await relayHarness({ on: false, xo: true });
  try {
    for (const [method, path] of [["GET", `/v1/relay/limitless/markets/${SLUG}`], ["POST", "/v1/relay/limitless/orders"], ["GET", "/v1/relay/limitless/anything"]] as const) {
      const answer = await raw(h.server.origin, method, path, { ...DAPP, "content-type": "application/json" }, method === "POST" ? "{}" : undefined);
      assert.deepEqual([answer.status, codeOf(answer.text)], [403, "relay_not_enabled"], path);
      assert.equal(answer.headers["x-limitless-relay"], "refused");
    }
    const preflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/limitless/orders", { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(preflight.headers["access-control-allow-origin"], undefined, "no CORS grant while off");
    assert.equal(upstream.seen.length, 0);
  } finally {
    await h.close();
  }
});

test("only the allowlisted methods, paths and queries are forwarded, the query exactly as sent", async () => {
  const { h, upstream } = await relayHarness();
  try {
    const me = signed("GET", "/profiles/me");
    const refused: Array<[string, string, number, string]> = [
      ["GET", "/v1/relay/limitless/markets/active", 404, "not_found"],
      ["GET", "/v1/relay/limitless/markets/active?limit=25", 404, "not_found"],
      ["GET", "/v1/relay/limitless/markets/search", 404, "not_found"],
      ["GET", "/v1/relay/limitless/markets/categories/user-orders", 404, "not_found"],
      ["GET", "/v1/relay/limitless/markets", 404, "not_found"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/orderbook`, 404, "not_found"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/events`, 404, "not_found"],
      ["GET", "/v1/relay/limitless/portfolio/positions", 404, "not_found"],
      ["POST", "/v1/relay/limitless/portfolio/withdraw", 404, "not_found"],
      ["POST", "/v1/relay/limitless/orders/cancel-batch", 404, "not_found"],
      ["DELETE", `/v1/relay/limitless/orders/all/${SLUG}`, 404, "not_found"],
      ["DELETE", "/v1/relay/limitless/orders/123", 404, "not_found"],
      ["GET", "/v1/relay/limitless/auth/api-tokens", 404, "not_found"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/../../profiles/me`, 404, "not_found"],
      ["GET", "/v1/relay/limitless/profiles/%6De", 404, "not_found"],
      ["GET", "/v1/relay/limitless/profiles/me/", 400, "invalid_request"],
      ["GET", "/v1/relay/limitless/markets/.hidden", 404, "not_found"],
      ["GET", "/v1/relay/limitless", 404, "not_found"],
      ["GET", "/v1/relay/limitless/orders", 405, "method_not_allowed"],
      ["PUT", "/v1/relay/limitless/orders", 405, "method_not_allowed"],
      ["HEAD", `/v1/relay/limitless/markets/${SLUG}`, 405, "method_not_allowed"],
      ["POST", "/v1/relay/limitless/profiles/me", 405, "method_not_allowed"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}?x=1`, 400, "invalid_request"],
      ["GET", "/v1/relay/limitless/profiles/me?x=1", 400, "invalid_request"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders?limit=0`, 400, "invalid_request"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders?limit=201`, 400, "invalid_request"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders?statuses=MATCHED`, 400, "invalid_request"],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders?limit=5&limit=6`, 400, "invalid_request"],
    ];
    for (const [method, path, status, code] of refused) {
      const answer = await raw(h.server.origin, method, path, { ...DAPP, ...me });
      assert.equal(answer.status, status, `${method} ${path}`);
      if (method !== "HEAD") assert.equal(codeOf(answer.text), code, `${method} ${path}`);
      assert.equal(answer.headers["x-limitless-relay"], "refused");
    }
    assert.equal(upstream.seen.length, 0, "nothing refused was sent");

    const allowed: Array<[string, string, Record<string, string>, string]> = [
      ["GET", `/v1/relay/limitless/markets/${SLUG}`, {}, `${LIMITLESS}/markets/${SLUG}`],
      ["GET", "/v1/relay/limitless/profiles/me", me, `${LIMITLESS}/profiles/me`],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders`, signed("GET", `/markets/${SLUG}/user-orders`), `${LIMITLESS}/markets/${SLUG}/user-orders`],
      ["GET", `/v1/relay/limitless/markets/${SLUG}/user-orders?limit=100`, signed("GET", `/markets/${SLUG}/user-orders?limit=100`), `${LIMITLESS}/markets/${SLUG}/user-orders?limit=100`],
      ["DELETE", `/v1/relay/limitless/orders/${ORDER_ID}`, signed("DELETE", `/orders/${ORDER_ID}`), `${LIMITLESS}/orders/${ORDER_ID}`],
    ];
    for (const [method, path, headers, url] of allowed) {
      const answer = await raw(h.server.origin, method, path, { ...DAPP, ...headers });
      assert.equal(answer.status, 200, path);
      assert.equal(answer.headers["x-limitless-relay"], "upstream");
      assert.equal(upstream.seen.at(-1)?.url, url);
      assert.equal(upstream.seen.at(-1)?.method, method);
    }
    assert.deepEqual(LIMITLESS_RELAY_ROUTES.map((route) => `${route.methods.join("|")} ${route.label}${route.signed ? " signed" : ""}`), [
      "GET /markets/:slug",
      "GET /profiles/me signed",
      "POST /orders signed",
      "DELETE /orders/:id signed",
      "GET /markets/:slug/user-orders signed",
    ]);
  } finally {
    await h.close();
  }
});

test("a signed route needs all three lmts-* headers of the right form; a public read sends none of them", async () => {
  const { h, upstream } = await relayHarness();
  try {
    const me = signed("GET", "/profiles/me");
    for (const missing of ["lmts-api-key", "lmts-timestamp", "lmts-signature"]) {
      const headers: Record<string, string> = Object.fromEntries(Object.entries({ ...DAPP, ...me }).filter(([name]) => name !== missing));
      const answer = await raw(h.server.origin, "GET", "/v1/relay/limitless/profiles/me", headers);
      assert.deepEqual([answer.status, codeOf(answer.text)], [400, "invalid_request"], missing);
    }
    for (const [name, value] of [["lmts-timestamp", "1792756800"], ["lmts-signature", "not-base64"], ["lmts-api-key", "has space"]] as const) {
      const answer = await raw(h.server.origin, "GET", "/v1/relay/limitless/profiles/me", { ...DAPP, ...me, [name]: value });
      assert.deepEqual([answer.status, codeOf(answer.text)], [400, "invalid_request"], name);
      assert.equal(answer.text.includes(value), false, "a refusal never echoes a value");
      assert.equal(answer.text.includes(TOKEN.tokenId), false);
    }
    assert.equal(upstream.seen.length, 0);
    await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, { ...DAPP, ...me });
    assert.deepEqual(Object.keys(upstream.seen[0]?.headers ?? {}).sort(), ["accept", "user-agent"], "a public read carries no token header");
  } finally {
    await h.close();
  }
});

test("POST /orders: the lmts-* headers and the body go on unchanged; nothing else goes on, and only content-type comes back", async () => {
  const upstream = fakeLimitless(() => ({ status: 201, body: '{"order":{"id":"x"},"execution":{}}', headers: { "set-cookie": "a=b", "x-upstream-internal": "1", server: "upstream", "access-control-allow-origin": "*" } }));
  const { h } = await relayHarness({ upstream });
  try {
    const body = JSON.stringify({ order: { salt: "1", side: 0, signature: `0x${"ab".repeat(65)}` }, ownerId: 42, orderType: "GTC", marketSlug: SLUG });
    const headers = signed("POST", "/orders", body);
    const answer = await raw(
      h.server.origin,
      "POST",
      "/v1/relay/limitless/orders",
      { ...headers, ...DAPP, "content-type": "application/json", cookie: "session=relay-test-cookie", authorization: "Bearer relay-test-bearer", "x-forwarded-for": "203.0.113.9", "lmts-extra": "1", "x-api-key": "lmts_relay-test-legacy", referer: "https://elsewhere.invalid/" },
      body,
    );
    assert.equal(answer.status, 201);
    assert.equal(answer.text, '{"order":{"id":"x"},"execution":{}}');
    assert.equal(answer.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(answer.headers["set-cookie"], undefined);
    assert.equal(answer.headers["x-upstream-internal"], undefined);
    assert.equal(answer.headers["server"], undefined);
    assert.equal(answer.headers["access-control-allow-origin"], XO_RELAY_DAPP_ORIGIN, "the relay's own CORS, never the upstream's");
    assert.equal(answer.headers["access-control-expose-headers"], "x-request-id, retry-after, x-limitless-relay");
    assert.equal(answer.headers["x-limitless-relay"], "upstream");
    const sent = upstream.seen[0] as Seen;
    assert.equal(sent.url, `${LIMITLESS}/orders`);
    assert.equal(sent.method, "POST");
    assert.equal(sent.body?.toString("utf8"), body, "the body byte for byte");
    assert.deepEqual(Object.keys(sent.headers).sort(), ["accept", "content-type", "lmts-api-key", "lmts-signature", "lmts-timestamp", "user-agent"]);
    assert.equal(sent.headers["lmts-api-key"], TOKEN.tokenId);
    assert.equal(sent.headers["lmts-signature"], headers["lmts-signature"]);
    assert.equal(sent.headers["user-agent"], "insurance-markets-api/0.1");
  } finally {
    await h.close();
  }
});

test("bodies: a JSON object only, at most 64 KiB, and none on a GET or a DELETE", async () => {
  const { h, upstream } = await relayHarness();
  try {
    const post = { ...DAPP, ...signed("POST", "/orders", "{}"), "content-type": "application/json" };
    const atCap = `{"pad":"${"x".repeat(LIMITLESS_RELAY_LIMITS.maxBodyBytes - 10)}"}`;
    assert.equal(Buffer.byteLength(atCap), LIMITLESS_RELAY_LIMITS.maxBodyBytes);
    const cap = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", post, atCap);
    assert.equal(cap.status, 200, cap.text);
    const over = `{"pad":"${"x".repeat(LIMITLESS_RELAY_LIMITS.maxBodyBytes - 9)}"}`;
    const declared = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", post, over);
    assert.deepEqual([declared.status, codeOf(declared.text)], [413, "payload_too_large"]);
    const chunked = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", { ...post, "transfer-encoding": "chunked" }, over);
    assert.deepEqual([chunked.status, codeOf(chunked.text)], [413, "payload_too_large"]);
    const text = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", { ...post, "content-type": "text/plain" }, "{}");
    assert.deepEqual([text.status, codeOf(text.text)], [415, "unsupported_media_type"]);
    for (const bad of ["not json", "[1,2]", '"text"', "null"]) {
      const answer = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", post, bad);
      assert.deepEqual([answer.status, codeOf(answer.text)], [400, "invalid_request"], bad);
    }
    const deleteBody = await raw(h.server.origin, "DELETE", `/v1/relay/limitless/orders/${ORDER_ID}`, { ...DAPP, ...signed("DELETE", `/orders/${ORDER_ID}`), "content-type": "application/json" }, "{}");
    assert.deepEqual([deleteBody.status, codeOf(deleteBody.text)], [413, "payload_too_large"]);
    const getBody = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, { ...DAPP }, "{}");
    assert.deepEqual([getBody.status, codeOf(getBody.text)], [413, "payload_too_large"]);
    assert.equal(upstream.seen.length, 1, "only the body at the cap was sent");
  } finally {
    await h.close();
  }
});

test("CORS: the dApp and the dev server only, preflight cached, any other Origin refused before sending", async () => {
  const { h, upstream } = await relayHarness();
  try {
    for (const origin of [XO_RELAY_DAPP_ORIGIN, "http://localhost:5173", "http://127.0.0.1:4173"]) {
      const preflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/limitless/orders", { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type, lmts-api-key, lmts-timestamp, lmts-signature" });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers["access-control-allow-origin"], origin);
      assert.equal(preflight.headers["access-control-allow-methods"], "POST, OPTIONS");
      assert.equal(preflight.headers["access-control-allow-headers"], "content-type, lmts-api-key, lmts-timestamp, lmts-signature");
      assert.equal(preflight.headers["access-control-max-age"], "7200");
      assert.equal(preflight.headers["access-control-allow-credentials"], undefined);
      assert.equal(preflight.headers["vary"], "Origin");
    }
    const cancel = await raw(h.server.origin, "OPTIONS", `/v1/relay/limitless/orders/${ORDER_ID}`, { ...DAPP, "access-control-request-method": "DELETE" });
    assert.deepEqual([cancel.headers["access-control-allow-methods"], cancel.headers["access-control-allow-headers"]], ["DELETE, OPTIONS", "lmts-api-key, lmts-timestamp, lmts-signature"]);
    const market = await raw(h.server.origin, "OPTIONS", `/v1/relay/limitless/markets/${SLUG}`, { ...DAPP, "access-control-request-method": "GET" });
    assert.equal(market.headers["access-control-allow-methods"], "GET, OPTIONS");
    for (const origin of ["https://evil.example.org", "https://xo-markets-explorer.vercel.app.evil.org", "http://localhost.evil.org:5173", "null"]) {
      const preflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/limitless/orders", { origin, "access-control-request-method": "POST" });
      assert.equal(preflight.headers["access-control-allow-origin"], undefined, origin);
      const actual = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, { origin });
      assert.deepEqual([actual.status, codeOf(actual.text)], [403, "origin_not_allowed"], origin);
      assert.equal(actual.headers["access-control-allow-origin"], undefined);
    }
    const unknownPath = await raw(h.server.origin, "OPTIONS", "/v1/relay/limitless/portfolio/withdraw", { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(unknownPath.headers["access-control-allow-origin"], undefined);
    assert.equal(upstream.seen.length, 0);
  } finally {
    await h.close();
  }
});

test("its own per-client limit: 30 at once, then 429 with Retry-After, apart from the XO relay's", async () => {
  const { h, upstream } = await relayHarness({ xo: true });
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) statuses.push((await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP)).status);
    assert.deepEqual(statuses, Array.from({ length: 30 }, () => 200));
    const last = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.deepEqual([last.status, codeOf(last.text)], [429, "rate_limited"]);
    assert.equal(last.headers["retry-after"], "1");
    assert.equal(last.headers["x-limitless-relay"], "refused");
    // The XO relay's bucket is untouched.
    const xo = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", DAPP);
    assert.equal(xo.headers["x-xo-relay"], "upstream");
    assert.equal(upstream.seen.length, 31);
  } finally {
    await h.close();
  }
});

test("upstream failures: a deadline (an order post may have been placed), a redirect, an oversized or HTML answer, a refusal passed through", async () => {
  let mode = "slow";
  const upstream = fakeLimitless(async (): Promise<FakeAnswer> => {
    if (mode === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { body: "{}" };
    }
    if (mode === "redirect") return { status: 302, headers: { location: "https://elsewhere.invalid/" } };
    if (mode === "big") return { body: `"${"x".repeat(LIMITLESS_RELAY_LIMITS.maxResponseBytes)}"` };
    if (mode === "html") return { status: 200, body: "<html>hi</html>", headers: { "content-type": "text/html" } };
    return { status: 400, body: '{"message":"FEE_RATE_MISMATCH"}' };
  });
  const realFetch = upstream.fetch;
  const abortable = (async (input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      void realFetch(input, init).then(resolve, reject);
    })) as typeof fetch;
  const { h } = await relayHarness({ upstream: { fetch: abortable, seen: upstream.seen }, timeoutMs: 50 });
  try {
    const post = { ...DAPP, ...signed("POST", "/orders", "{}"), "content-type": "application/json" };
    const slow = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", post, "{}");
    assert.deepEqual([slow.status, codeOf(slow.text)], [504, "upstream_timeout"]);
    assert.match(slow.text, /may or may not have been placed/);
    const slowCancel = await raw(h.server.origin, "DELETE", `/v1/relay/limitless/orders/${ORDER_ID}`, { ...DAPP, ...signed("DELETE", `/orders/${ORDER_ID}`) });
    assert.match(slowCancel.text, /may or may not have been cancelled/);
    const slowRead = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.doesNotMatch(slowRead.text, /placed|cancelled/);
    assert.equal(upstream.seen.length, 3, "one request each, nothing retried");
    mode = "redirect";
    const redirect = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.deepEqual([redirect.status, codeOf(redirect.text)], [502, "upstream_invalid"]);
    assert.equal(redirect.headers["location"], undefined);
    mode = "big";
    const big = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.deepEqual([big.status, codeOf(big.text)], [502, "upstream_invalid"]);
    mode = "html";
    const html = await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    assert.equal(html.headers["content-type"], "text/plain; charset=utf-8", "relabelled, never served as a page");
    assert.equal(html.headers["x-content-type-options"], "nosniff");
    mode = "refuse";
    const refused = await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", post, "{}");
    assert.deepEqual([refused.status, refused.text, refused.headers["x-limitless-relay"]], [400, '{"message":"FEE_RATE_MISMATCH"}', "upstream"]);
  } finally {
    await h.close();
  }
});

test("log lines carry the method, the route, the status and the time, and never a header value, slug, query or body", async () => {
  const upstream = fakeLimitless(() => ({ body: JSON.stringify({ id: 42, account: `0x${"12".repeat(20)}` }) }));
  const { h, logs } = await relayHarness({ upstream });
  try {
    const body = JSON.stringify({ order: { signature: `0x${"cd".repeat(65)}` }, ownerId: 42, marketSlug: SLUG });
    const me = signed("GET", "/profiles/me");
    await raw(h.server.origin, "GET", "/v1/relay/limitless/profiles/me", { ...DAPP, ...me, cookie: "session=relay-test-cookie" });
    await raw(h.server.origin, "POST", "/v1/relay/limitless/orders", { ...DAPP, ...signed("POST", "/orders", body), "content-type": "application/json" }, body);
    await raw(h.server.origin, "DELETE", `/v1/relay/limitless/orders/${ORDER_ID}`, { ...DAPP, ...signed("DELETE", `/orders/${ORDER_ID}`) });
    await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}/user-orders?limit=100`, { ...DAPP, ...signed("GET", `/markets/${SLUG}/user-orders?limit=100`) });
    await raw(h.server.origin, "GET", `/v1/relay/limitless/markets/${SLUG}`, DAPP);
    await raw(h.server.origin, "OPTIONS", "/v1/relay/limitless/orders", { ...DAPP, "access-control-request-method": "POST" });
    assert.equal(logs.length, 6);
    for (const line of logs) {
      assert.match(line, /^(GET|POST|DELETE|OPTIONS) \/v1\/relay\/limitless\/[a-z/:-]+ \d{3} \d+ms$/, line);
      for (const value of [TOKEN.tokenId, TOKEN.secret, me["lmts-signature"] ?? "?", "2026-10-23T12:00:00Z", SLUG, ORDER_ID, "limit=100", "relay-test-cookie", "cdcdcd"]) assert.equal(line.includes(value), false, `${line} holds a value`);
    }
    assert.ok(logs.includes("DELETE /v1/relay/limitless/orders/:id 200 0ms"));
    assert.ok(logs.includes("GET /v1/relay/limitless/markets/:slug/user-orders 200 0ms"));
  } finally {
    await h.close();
  }
});
