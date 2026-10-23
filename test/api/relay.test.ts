import assert from "node:assert/strict";
import { request } from "node:http";
import { test } from "node:test";

import { loadApiConfig } from "../../api/config.js";
import { XO_RELAY_DAPP_ORIGIN, XO_RELAY_LIMITS, XO_RELAY_ROUTES } from "../../api/xo-relay.js";
import { absentVenue, Clock, startHarness, testConfig, type Harness } from "./helpers.js";

// The XO order relay (api/xo-relay.ts) against a fake order book: off by default, the allowlist of methods, paths and
// query keys, which request headers go on (under XO's names) and which answer headers come back, the 64 KiB body cap,
// CORS for the dApp and the dev server only, the per-client limit, the deadline, and that no header value or body ever
// reaches a log line. Nothing here talks to XO.

const ORDERBOOK = "https://orderbooks.xo.market";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const HASH = `0x${"ab".repeat(32)}`;
const ACCOUNT = `0x${"12".repeat(20)}`;

// Values a log line must never contain.
const SECRETS = {
  apiKey: "relay-test-api-key-7f3a",
  passphrase: "relay-test-passphrase-91c2",
  signature: "relay-test-hmac-signature-55d0=",
  l1Signature: `0x01${"cd".repeat(85)}`,
  cookie: "session=relay-test-cookie-0c4e",
  bearer: "Bearer relay-test-bearer-6b1d",
};

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

function fakeOrderBook(answer: (seen: Seen) => FakeAnswer | Promise<FakeAnswer> = () => ({ body: "{}" })): { readonly fetch: typeof fetch; readonly seen: Seen[] } {
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
    return new Response(out.body ?? "{}", { status: out.status ?? 200, headers: { "content-type": "application/json", ...out.headers } });
  };
  return { fetch: impl as typeof fetch, seen };
}

async function relayHarness(options: { readonly on?: boolean; readonly upstream?: ReturnType<typeof fakeOrderBook>; readonly timeoutMs?: number } = {}): Promise<{ h: Harness; upstream: ReturnType<typeof fakeOrderBook>; logs: string[] }> {
  const upstream = options.upstream ?? fakeOrderBook();
  const logs: string[] = [];
  const h = await startHarness({
    config: testConfig(options.on === false ? {} : { API_XO_RELAY: "on" }),
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
  // node:http writes a DELETE body without framing unless told: state the length (or the chunking) explicitly.
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

const L2 = { "xo-api-key": SECRETS.apiKey, "xo-passphrase": SECRETS.passphrase, "xo-timestamp": "1792756800", "xo-signature": SECRETS.signature };

test("the relay is off by default: every relay path answers relay_not_enabled and nothing is sent", async () => {
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data" }).config.xoRelay, false);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", API_XO_RELAY: "on" }).config.xoRelay, true);
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data", API_XO_RELAY: "maybe" }).fatal[0]?.variable, "API_XO_RELAY");
  const { h, upstream } = await relayHarness({ on: false });
  try {
    for (const [method, path] of [["GET", "/v1/relay/xo/clob/time"], ["POST", "/v1/relay/xo/clob/order"], ["GET", "/v1/relay/anything"]] as const) {
      const answer = await raw(h.server.origin, method, path, { origin: XO_RELAY_DAPP_ORIGIN, "content-type": "application/json" }, method === "POST" ? "{}" : undefined);
      assert.deepEqual([answer.status, codeOf(answer.text)], [403, "relay_not_enabled"], path);
    }
    const preflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN, "access-control-request-method": "GET" });
    assert.equal(preflight.headers["access-control-allow-origin"], undefined, "no CORS grant while off");
    assert.equal(upstream.seen.length, 0);
  } finally {
    await h.close();
  }
});

test("only the allowlisted methods, paths and query keys are forwarded", async () => {
  const { h, upstream } = await relayHarness();
  try {
    const refused: Array<[string, string, number, string]> = [
      ["GET", "/v1/relay/xo/clob/auth/api-keys", 404, "not_found"],
      ["GET", "/v1/relay/xo/clob/markets", 404, "not_found"],
      ["GET", "/v1/relay/xo/clob/orders/123", 404, "not_found"],
      ["GET", "/v1/relay/xo/clob/../time", 404, "not_found"],
      ["GET", "/v1/relay/xo/clob", 404, "not_found"],
      ["GET", "/v1/relay/xo/bundler", 404, "not_found"],
      ["GET", "/v1/relay/xo/clob/%74ime", 404, "not_found"],
      ["DELETE", "/v1/relay/xo/clob/orders", 405, "method_not_allowed"],
      ["PUT", "/v1/relay/xo/clob/order", 405, "method_not_allowed"],
      ["HEAD", "/v1/relay/xo/clob/time", 405, "method_not_allowed"],
      ["GET", "/v1/relay/xo/clob/orders?limit=1", 400, "invalid_request"],
      ["GET", "/v1/relay/xo/clob/time?x=1", 400, "invalid_request"],
      ["GET", "/v1/relay/xo/clob/balance-allowance", 400, "invalid_request"],
      ["GET", "/v1/relay/xo/clob/balance-allowance?address=0x12", 400, "invalid_request"],
      ["GET", `/v1/relay/xo/clob/balance-allowance?address=${ACCOUNT}&address=${ACCOUNT}`, 400, "invalid_request"],
      ["GET", `/v1/relay/xo/clob/balance-allowance?address=${ACCOUNT}&extra=1`, 400, "invalid_request"],
      ["GET", "/v1/relay/xo/clob/book?token_id=0x1", 400, "invalid_request"],
    ];
    for (const [method, path, status, code] of refused) {
      const answer = await raw(h.server.origin, method, path, { origin: XO_RELAY_DAPP_ORIGIN });
      assert.equal(answer.status, status, `${method} ${path}`);
      if (method !== "HEAD") assert.equal(codeOf(answer.text), code, `${method} ${path}`);
      assert.equal(answer.headers["x-xo-relay"], "refused");
    }
    assert.equal(upstream.seen.length, 0, "nothing refused was sent");

    const allowed: Array<[string, string, string]> = [
      ["GET", "/v1/relay/xo/clob/time", `${ORDERBOOK}/time`],
      ["GET", `/v1/relay/xo/clob/balance-allowance?address=${ACCOUNT}`, `${ORDERBOOK}/balance-allowance?address=${ACCOUNT}`],
      ["GET", "/v1/relay/xo/clob/book?token_id=123456789", `${ORDERBOOK}/book?token_id=123456789`],
      ["GET", "/v1/relay/xo/clob/auth/derive-api-key", `${ORDERBOOK}/auth/derive-api-key`],
      ["GET", "/v1/relay/xo/clob/orders", `${ORDERBOOK}/orders`],
      ["GET", `/v1/relay/xo/clob/orders/${HASH}`, `${ORDERBOOK}/orders/${HASH}`],
    ];
    for (const [method, path, url] of allowed) {
      const answer = await raw(h.server.origin, method, path, { origin: XO_RELAY_DAPP_ORIGIN });
      assert.equal(answer.status, 200, path);
      assert.equal(upstream.seen.at(-1)?.url, url);
      assert.equal(upstream.seen.at(-1)?.method, method);
    }
    assert.deepEqual(XO_RELAY_ROUTES.map((route) => `${route.methods.join("|")} ${route.label}`), [
      "GET /time",
      "GET /balance-allowance",
      "GET /book",
      "GET /auth/derive-api-key",
      "POST /auth/api-key",
      "POST|DELETE /order",
      "GET /orders",
      "GET /orders/:hash",
    ]);
  } finally {
    await h.close();
  }
});

test("XO headers go on under XO's names with the body unchanged; nothing else goes on, and only content-type comes back", async () => {
  const upstream = fakeOrderBook(() => ({ status: 201, body: '{"success":true,"orderID":"x"}', headers: { "set-cookie": "a=b", "x-upstream-internal": "1", server: "upstream", "access-control-allow-origin": "*" } }));
  const { h } = await relayHarness({ upstream });
  try {
    const body = '{"order":{"salt":"1","side":0},"orderType":"GTD"}';
    const answer = await raw(
      h.server.origin,
      "POST",
      "/v1/relay/xo/clob/order",
      { ...L2, "xo-address": ACCOUNT, origin: XO_RELAY_DAPP_ORIGIN, "content-type": "application/json", cookie: SECRETS.cookie, authorization: SECRETS.bearer, "x-forwarded-for": "203.0.113.9", "xo-extra": "1", referer: "https://elsewhere.invalid/" },
      body,
    );
    assert.equal(answer.status, 201);
    assert.equal(answer.text, '{"success":true,"orderID":"x"}');
    assert.equal(answer.headers["content-type"], "application/json");
    assert.equal(answer.headers["set-cookie"], undefined);
    assert.equal(answer.headers["x-upstream-internal"], undefined);
    assert.equal(answer.headers["server"], undefined);
    assert.equal(answer.headers["access-control-allow-origin"], XO_RELAY_DAPP_ORIGIN, "the relay's own CORS, never the upstream's");
    assert.equal(answer.headers["access-control-allow-credentials"], undefined);
    assert.equal(answer.headers["x-xo-relay"], "upstream");
    const sent = upstream.seen[0] as Seen;
    assert.equal(sent.url, `${ORDERBOOK}/order`);
    assert.equal(sent.method, "POST");
    assert.equal(sent.body?.toString("utf8"), body, "the body byte for byte");
    assert.deepEqual(Object.keys(sent.headers).sort(), ["accept", "content-type", "user-agent", "xo_address", "xo_api_key", "xo_passphrase", "xo_signature", "xo_timestamp"]);
    assert.equal(sent.headers["xo_api_key"], SECRETS.apiKey);
    assert.equal(sent.headers["xo_signature"], SECRETS.signature);
    assert.equal(sent.headers["user-agent"], "insurance-markets-api/0.1");

    // The underscore spelling is taken too; one header under both spellings is refused before anything is sent.
    const underscore = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/orders", { xo_api_key: SECRETS.apiKey, xo_passphrase: SECRETS.passphrase, xo_timestamp: "1792756800", xo_signature: SECRETS.signature, origin: XO_RELAY_DAPP_ORIGIN });
    assert.equal(underscore.status, 201);
    assert.equal(upstream.seen[1]?.headers["xo_passphrase"], SECRETS.passphrase);
    const both = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/orders", { ...L2, xo_api_key: SECRETS.apiKey, origin: XO_RELAY_DAPP_ORIGIN });
    assert.deepEqual([both.status, codeOf(both.text)], [400, "invalid_request"]);
    assert.equal(both.text.includes(SECRETS.apiKey), false, "a refusal never echoes a value");
    assert.equal(upstream.seen.length, 2);

    // L1 headers on the login routes; an L2 header there is not forwarded.
    await raw(h.server.origin, "POST", "/v1/relay/xo/clob/auth/api-key", { "xo-address": ACCOUNT, "xo-signature": SECRETS.l1Signature, "xo-timestamp": "1792756800", "xo-nonce": "0", "xo-api-key": SECRETS.apiKey, origin: XO_RELAY_DAPP_ORIGIN, "content-type": "application/json" }, "{}");
    const login = upstream.seen[2] as Seen;
    assert.deepEqual(Object.keys(login.headers).sort(), ["accept", "content-type", "user-agent", "xo_address", "xo_nonce", "xo_signature", "xo_timestamp"]);
    assert.equal(login.body?.toString("utf8"), "{}");
  } finally {
    await h.close();
  }
});

test("bodies: JSON only, at most 64 KiB, none on a GET", async () => {
  const { h, upstream } = await relayHarness();
  try {
    const headers = { ...L2, origin: XO_RELAY_DAPP_ORIGIN, "content-type": "application/json" };
    const atCap = `{"pad":"${"x".repeat(XO_RELAY_LIMITS.maxBodyBytes - 10)}"}`;
    assert.equal(Buffer.byteLength(atCap), XO_RELAY_LIMITS.maxBodyBytes);
    const cap = await raw(h.server.origin, "DELETE", "/v1/relay/xo/clob/order", headers, atCap);
    assert.equal(cap.status, 200, cap.text);
    const over = `{"pad":"${"x".repeat(XO_RELAY_LIMITS.maxBodyBytes - 9)}"}`;
    const declared = await raw(h.server.origin, "DELETE", "/v1/relay/xo/clob/order", headers, over);
    assert.deepEqual([declared.status, codeOf(declared.text)], [413, "payload_too_large"]);
    const chunked = await raw(h.server.origin, "POST", "/v1/relay/xo/clob/order", { ...headers, "transfer-encoding": "chunked" }, over);
    assert.deepEqual([chunked.status, codeOf(chunked.text)], [413, "payload_too_large"]);
    const text = await raw(h.server.origin, "POST", "/v1/relay/xo/clob/order", { ...headers, "content-type": "text/plain" }, "{}");
    assert.deepEqual([text.status, codeOf(text.text)], [415, "unsupported_media_type"]);
    const notJson = await raw(h.server.origin, "POST", "/v1/relay/xo/clob/order", headers, "not json");
    assert.deepEqual([notJson.status, codeOf(notJson.text)], [400, "invalid_request"]);
    const getBody = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/orders", { ...headers }, "{}");
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
      const preflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/xo/clob/order", { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type, xo-api-key, xo-passphrase, xo-timestamp, xo-signature" });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers["access-control-allow-origin"], origin);
      assert.equal(preflight.headers["access-control-allow-methods"], "POST, DELETE, OPTIONS");
      const allowedHeaders = String(preflight.headers["access-control-allow-headers"]).split(", ");
      for (const name of ["content-type", "xo-api-key", "xo-passphrase", "xo-timestamp", "xo-signature", "xo-address", "xo-nonce"]) assert.ok(allowedHeaders.includes(name), name);
      assert.equal(allowedHeaders.includes("cookie") || allowedHeaders.includes("authorization"), false);
      assert.equal(preflight.headers["access-control-max-age"], "7200");
      assert.equal(preflight.headers["access-control-allow-credentials"], undefined);
      assert.equal(preflight.headers["vary"], "Origin");
    }
    const timePreflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN, "access-control-request-method": "GET" });
    assert.equal(timePreflight.headers["access-control-allow-methods"], "GET, OPTIONS");
    for (const origin of ["https://evil.example.org", "https://xo-markets-explorer.vercel.app.evil.org", "http://localhost.evil.org:5173", "null"]) {
      const preflight = await raw(h.server.origin, "OPTIONS", "/v1/relay/xo/clob/order", { origin, "access-control-request-method": "POST" });
      assert.equal(preflight.headers["access-control-allow-origin"], undefined, origin);
      const actual = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin });
      assert.deepEqual([actual.status, codeOf(actual.text)], [403, "origin_not_allowed"], origin);
      assert.equal(actual.headers["access-control-allow-origin"], undefined);
    }
    const unknownPath = await raw(h.server.origin, "OPTIONS", "/v1/relay/xo/clob/auth/api-keys", { origin: XO_RELAY_DAPP_ORIGIN, "access-control-request-method": "GET" });
    assert.equal(unknownPath.headers["access-control-allow-origin"], undefined);
    // The API's other routes keep their own CORS list (API_CORS_ORIGINS): the relay's origins are not added to it.
    const health = await raw(h.server.origin, "GET", "/v1/health", { origin: XO_RELAY_DAPP_ORIGIN });
    assert.equal(health.headers["access-control-allow-origin"], undefined);
    assert.equal(upstream.seen.length, 0);
  } finally {
    await h.close();
  }
});

test("the per-client limit: 30 at once, then 429 with Retry-After", async () => {
  const { h, upstream } = await relayHarness();
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN })).status);
    assert.deepEqual(statuses.slice(0, 30), Array.from({ length: 30 }, () => 200));
    const last = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN });
    assert.deepEqual([last.status, codeOf(last.text)], [429, "rate_limited"]);
    assert.equal(last.headers["retry-after"], "1");
    assert.equal(last.headers["access-control-expose-headers"], "x-request-id, retry-after, x-xo-relay");
    assert.equal(upstream.seen.length, 30);
  } finally {
    await h.close();
  }
});

test("upstream failures: a deadline, a redirect, an oversized or non-JSON answer, a refusal passed through", async () => {
  let mode = "slow";
  const upstream = fakeOrderBook(async (seen): Promise<FakeAnswer> => {
    if (mode === "slow") {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { body: "{}" };
    }
    if (mode === "redirect") return { status: 302, headers: { location: "https://elsewhere.invalid/" } };
    if (mode === "big") return { body: `"${"x".repeat(XO_RELAY_LIMITS.maxResponseBytes)}"` };
    if (mode === "html") return { status: 200, body: "<html>hi</html>", headers: { "content-type": "text/html" } };
    if (mode === "time") return { status: 200, body: "1792756800", headers: { "content-type": "text/plain; charset=utf-8" } };
    void seen;
    return { status: 401, body: '{"error":"Invalid L2 signature"}' };
  });
  const realFetch = upstream.fetch;
  // The fake honours the abort signal the relay passes, as fetch does.
  const abortable = (async (input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      void realFetch(input, init).then(resolve, reject);
    })) as typeof fetch;
  const { h } = await relayHarness({ upstream: { fetch: abortable, seen: upstream.seen }, timeoutMs: 50 });
  try {
    const headers = { ...L2, origin: XO_RELAY_DAPP_ORIGIN, "content-type": "application/json" };
    const slow = await raw(h.server.origin, "POST", "/v1/relay/xo/clob/order", headers, "{}");
    assert.deepEqual([slow.status, codeOf(slow.text)], [504, "upstream_timeout"]);
    assert.match(slow.text, /may or may not have been placed/);
    mode = "redirect";
    const redirect = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN });
    assert.deepEqual([redirect.status, codeOf(redirect.text)], [502, "upstream_invalid"]);
    assert.equal(redirect.headers["location"], undefined);
    mode = "big";
    const big = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN });
    assert.deepEqual([big.status, codeOf(big.text)], [502, "upstream_invalid"]);
    mode = "html";
    const html = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN });
    assert.equal(html.headers["content-type"], "text/plain; charset=utf-8", "relabelled, never served as a page");
    assert.equal(html.headers["x-content-type-options"], "nosniff");
    mode = "time";
    const time = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/time", { origin: XO_RELAY_DAPP_ORIGIN });
    assert.deepEqual([time.status, time.text, time.headers["content-type"]], [200, "1792756800", "text/plain; charset=utf-8"]);
    mode = "refuse";
    const refused = await raw(h.server.origin, "GET", "/v1/relay/xo/clob/orders", headers);
    assert.deepEqual([refused.status, refused.text, refused.headers["x-xo-relay"]], [401, '{"error":"Invalid L2 signature"}', "upstream"]);
  } finally {
    await h.close();
  }
});

test("log lines carry the method, the route, the status and the time, and never a header value, query or body", async () => {
  const upstream = fakeOrderBook(() => ({ body: JSON.stringify({ apiKey: SECRETS.apiKey, secret: "relay-test-returned-secret-3e9f", passphrase: SECRETS.passphrase }) }));
  const { h, logs } = await relayHarness({ upstream });
  try {
    await raw(h.server.origin, "GET", "/v1/relay/xo/clob/auth/derive-api-key", { "xo-address": ACCOUNT, "xo-signature": SECRETS.l1Signature, "xo-timestamp": "1792756800", origin: XO_RELAY_DAPP_ORIGIN, cookie: SECRETS.cookie, authorization: SECRETS.bearer });
    await raw(h.server.origin, "POST", "/v1/relay/xo/clob/order", { ...L2, origin: XO_RELAY_DAPP_ORIGIN, "content-type": "application/json" }, JSON.stringify({ order: { signature: SECRETS.l1Signature } }));
    await raw(h.server.origin, "GET", `/v1/relay/xo/clob/orders/${HASH}`, { ...L2, origin: XO_RELAY_DAPP_ORIGIN });
    await raw(h.server.origin, "GET", `/v1/relay/xo/clob/balance-allowance?address=${ACCOUNT}`, { origin: XO_RELAY_DAPP_ORIGIN });
    await raw(h.server.origin, "GET", "/v1/relay/xo/clob/orders", { ...L2, xo_api_key: SECRETS.apiKey, origin: XO_RELAY_DAPP_ORIGIN });
    await raw(h.server.origin, "OPTIONS", "/v1/relay/xo/clob/order", { origin: XO_RELAY_DAPP_ORIGIN, "access-control-request-method": "POST" });
    assert.equal(logs.length, 6);
    for (const line of logs) {
      assert.match(line, /^(GET|POST|DELETE|OPTIONS) \/v1\/relay\/xo\/clob\/[a-z/:-]+ \d{3} \d+ms$/, line);
      for (const value of [...Object.values(SECRETS), "relay-test-returned-secret-3e9f", ACCOUNT, HASH, "1792756800"]) assert.equal(line.includes(value), false, `${line} holds a value`);
    }
    assert.ok(logs.includes("GET /v1/relay/xo/clob/orders/:hash 200 0ms"));
    assert.ok(logs.includes("GET /v1/relay/xo/clob/balance-allowance 200 0ms"));
  } finally {
    await h.close();
  }
});
