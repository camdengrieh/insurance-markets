import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";

import { registerReadToolsWith, type ReadToolDeps } from "../../../src/tools/read.js";
import { XoClient } from "../../../src/xo/client.js";
import { dataRoute, fastOptions, fixture, orderbookRoute, stubFetch, type Route } from "../../../test/fixtures/xo/load.js";
import { securityHeaders } from "../../../app/headers.config.js";
import {
  BRIDGE_ERROR_HTTP_STATUS,
  BRIDGE_USER_AGENT,
  TOKEN_SCAN_PATTERN,
  UI_ROUTE_KEYS,
  VENUE_PAUSE_MS,
  bridgeErrorResponseSchema,
  readProxyResponseSchema,
  type BridgeErrorCode,
} from "../../contract.js";
import { OPTIONAL_MODULE_NAMES, loadOptionalModules } from "../../main.js";
import { QUOTIENT_KEY_ENV, bridgeModule, readProxyOf, venueSwitchesOf } from "../../proxy.js";
import { tokenId } from "../../auth.js";
import { bearer, send } from "../server/helpers.js";
import { errorCode, hangingFetch, jsonResponse, scriptedUpstream, startProxyDaemon, textResponse, type ProxyDaemon } from "./helpers.js";

const running: ProxyDaemon[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (running.length > 0) await running.pop()?.stop();
  while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true });
});
async function start(...args: Parameters<typeof startProxyDaemon>): Promise<ProxyDaemon> {
  const daemon = await startProxyDaemon(...args);
  running.push(daemon);
  return daemon;
}

const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
const ADDR = `0x${"cd".repeat(20)}`;

function expectError(reply: { status: number; json(): unknown }, code: BridgeErrorCode): void {
  assert.equal(reply.status, BRIDGE_ERROR_HTTP_STATUS[code], `status for ${code}`);
  const body = bridgeErrorResponseSchema.parse(reply.json());
  assert.equal(body.error.code, code);
}

describe("the route", () => {
  it("registers exactly GET and POST /ui/read/*, both inside the frozen contract, both needing the read scope", async () => {
    const daemon = await start();
    const routes = daemon.daemon.host.routes().filter((route) => route.key.includes("/ui/read/"));
    assert.deepEqual(routes.map((route) => route.key).sort(), ["GET /ui/read/*", "POST /ui/read/*"]);
    for (const route of routes) {
      assert.ok((UI_ROUTE_KEYS as readonly string[]).includes(route.key));
      assert.deepEqual(route.access, { scope: "read" });
    }
  });

  it("is what bridge/main.ts discovers: `proxy` exports bridgeModule", async () => {
    assert.ok(OPTIONAL_MODULE_NAMES.includes("proxy"));
    assert.equal(typeof bridgeModule, "function");
    const loaded = await loadOptionalModules([{ name: "proxy", load: () => import("../../proxy.js") }]);
    assert.deepEqual(loaded.map((entry) => entry.name), ["proxy"]);
  });

  it("needs a token: 401 before anything is looked at, and nothing goes upstream", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({}));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const headerSets: Array<Record<string, string>> = [{}, { authorization: "Bearer cku_" + "A".repeat(43) }, { authorization: "Basic abc" }];
    for (const headers of headerSets) {
      const reply = await send({ port: daemon.port, path: "/ui/read/xo_orderbook/time", headers });
      expectError(reply, "unauthorized");
    }
    // A made-up service is also a 401 without a token: the route list is not revealed.
    expectError(await send({ port: daemon.port, path: "/ui/read/evil/x" }), "unauthorized");
    assert.equal(upstream.calls.length, 0);
  });

  it("serves a read-only instance (M1-8 groundwork) and an agent token with the read scope", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ ok: 1 }));
    const agent = `cka_${"B".repeat(43)}`;
    const daemon = await start({ role: "read_only", agentScopes: ["read"], agentHash: { id: tokenId(agent), sha256: createHash("sha256").update(agent).digest("hex") }, proxy: { fetch: upstream.fetch } });
    assert.equal((await daemon.get("xo_orderbook", "/time")).status, 200);
    const reply = await send({ port: daemon.port, path: "/ui/read/polymarket_gamma/status", headers: bearer(agent) });
    assert.equal(reply.status, 200);
    assert.equal(upstream.calls.length, 2);
  });
});

describe("an allowed read", () => {
  it("returns the contract's envelope with the security headers, no cookie and no CORS header", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ price: "0.55" }, { headers: { "set-cookie": "sid=abc; Path=/", "access-control-allow-origin": "*", "access-control-allow-credentials": "true" } }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const reply = await daemon.get("xo_orderbook", "/last-trade-price", `token_id=${TOKEN}`);
    assert.equal(reply.status, 200);
    const envelope = readProxyResponseSchema.parse(reply.json());
    assert.equal(envelope.service, "xo_orderbook");
    assert.deepEqual(envelope.body, { price: "0.55" });
    assert.equal(reply.headers["set-cookie"], undefined);
    assert.equal(Object.keys(reply.headers).some((name) => name.startsWith("access-control-")), false);
    for (const pair of securityHeaders("cockpit")) assert.equal(reply.headers[pair.key.toLowerCase()], pair.value);
    assert.match(String(reply.headers["content-type"]), /^application\/json/);
    assert.equal(reply.headers["cache-control"], "no-store");
    assert.doesNotMatch(reply.text, /sid=abc|access-control/);
  });

  it("forwards the query exactly and the checked URL only", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ ok: 1 }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    await daemon.get("xo_data", "/api/markets", "marketType=2,4&statuses=ACTIVE&take=20&page=1&search=rain%20today");
    assert.equal(upstream.calls[0]?.url, "https://api-mainnet.xo.market/api/markets?marketType=2,4&statuses=ACTIVE&take=20&page=1&search=rain%20today");
  });

  it("sends nothing of the caller's: no cookie, Referer, Origin, Authorization or forwarding header, and never the daemon's token", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ ok: 1 }, { headers: { "set-cookie": "sid=abc" } }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const hostile = {
      cookie: "session=stolen",
      referer: "http://evil.example/",
      origin: daemon.daemon.origin,
      "x-forwarded-for": "1.2.3.4",
      "x-forwarded-host": "evil.example",
      forwarded: "for=1.2.3.4",
      "x-api-key": "k",
      "x-quotient-api-key": "qt_attempt_to_smuggle",
      "proxy-authorization": "Basic abc",
      "user-agent": "evil/9",
      accept: "text/html",
    };
    await daemon.get("xo_orderbook", "/time", "", hostile);
    await daemon.get("xo_orderbook", "/time", "", hostile);
    for (const call of upstream.calls) {
      assert.deepEqual(call.init.headers, { accept: "application/json", "user-agent": BRIDGE_USER_AGENT });
      assert.doesNotMatch(JSON.stringify(call), new RegExp(daemon.token));
    }
  });

  it("turns a POST JSON-RPC read into one compact upstream call", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x2105" }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const reply = await daemon.post("rpc_base", "/", ' {"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]} ');
    assert.equal(reply.status, 200);
    assert.deepEqual(readProxyResponseSchema.parse(reply.json()).body, { jsonrpc: "2.0", id: 1, result: "0x2105" });
    assert.equal(upstream.calls[0]?.url, "https://base-rpc.publicnode.com/");
    assert.equal(upstream.calls[0]?.init.body, '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}');
  });
});

describe("refusals through the daemon (M1-3)", () => {
  it("answers each with its contract code and status and sends nothing upstream", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ should: "never be asked" }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const rpc = (method: string): unknown => ({ jsonrpc: "2.0", id: 1, method, params: [] });
    const checks: Array<[string, () => Promise<{ status: number; json(): unknown }>, BridgeErrorCode]> = [
      ["unknown service", () => daemon.get("not_a_venue", "/x"), "service_not_allowed"],
      ["a host-looking service", () => daemon.get("evil.example", "/x"), "service_not_allowed"],
      ["a path that is not listed", () => daemon.get("xo_orderbook", "/orders"), "path_not_allowed"],
      ["a signed Kalshi route", () => daemon.get("kalshi", "/trade-api/v2/portfolio/positions"), "path_not_allowed"],
      ["a Quotient route that takes the wallet", () => daemon.get("quotient", "/api/v1/portfolio"), "path_not_allowed"],
      ["a credential in the query", () => daemon.get("xo_data", "/api/markets", "api_key=abc"), "path_not_allowed"],
      ["a service with no path", () => send({ port: daemon.port, path: "/ui/read/xo_data", headers: bearer(daemon.token) }), "path_not_allowed"],
      ["a POST to a GET route", () => daemon.post("xo_data", "/api/markets", {}), "method_not_allowed"],
      ["a GET to an RPC node", () => daemon.get("rpc_base", "/"), "method_not_allowed"],
      ["a signing RPC method", () => daemon.post("rpc_base", "/", rpc("eth_sendRawTransaction")), "rpc_method_not_allowed"],
      ["a batch hiding a write", () => daemon.post("xo_rpc", "/", [rpc("eth_chainId"), rpc("eth_sendTransaction")]), "rpc_method_not_allowed"],
      ["a Hyperliquid order", () => daemon.post("hyperliquid_info", "/info", { type: "order" }), "rpc_method_not_allowed"],
      ["a POST body that is not JSON", () => daemon.post("rpc_base", "/", "{nope"), "invalid_request"],
      ["a restricted venue that is off", () => daemon.get("kalshi", "/trade-api/v2/markets"), "venue_disabled"],
    ];
    for (const [label, run, code] of checks) {
      const reply = await run();
      try {
        expectError(reply, code);
      } catch (error) {
        throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    assert.equal(upstream.calls.length, 0);
  });

  it("refuses an encoded slash, dot segment or backslash before the proxy sees it", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({}));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    for (const path of ["/ui/read/xo_data/api/markets%2fcontract", "/ui/read/xo_data/api/%2e%2e/admin", "/ui/read/xo_data/api/../admin", "/ui/read/xo_data/api%5cmarkets", "/ui/read/xo_data//api/markets", "/ui/read//xo_data/api/markets"]) {
      const reply = await send({ port: daemon.port, path, headers: bearer(daemon.token) });
      assert.ok([400, 403, 404].includes(reply.status), `${path} -> ${reply.status}`);
    }
    assert.equal(upstream.calls.length, 0);
  });

  it("answers an upstream redirect with 502 redirect_refused and follows nothing", async () => {
    const upstream = scriptedUpstream(() => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    expectError(await daemon.get("xo_orderbook", "/time"), "redirect_refused");
    assert.equal(upstream.calls.length, 1);
  });

  it("answers an over-size upstream body with 502 response_too_large", async () => {
    const daemon = await start({ proxy: { fetch: scriptedUpstream(() => new Response("x".repeat(2000))).fetch, maxResponseBytes: 1000 } });
    expectError(await daemon.get("xo_orderbook", "/time"), "response_too_large");
  });

  it("answers a body that is not JSON with 502 upstream_not_json, without quoting it", async () => {
    const daemon = await start({ proxy: { fetch: scriptedUpstream(() => textResponse("<html>MARKER-TEXT</html>")).fetch } });
    const reply = await daemon.get("xo_orderbook", "/time");
    expectError(reply, "upstream_not_json");
    assert.doesNotMatch(reply.text, /MARKER-TEXT/);
  });

  it("answers an upstream that never replies with 504 upstream_timeout", async () => {
    const daemon = await start({ proxy: { fetch: hangingFetch(), timeoutMs: 40 } });
    expectError(await daemon.get("xo_orderbook", "/time"), "upstream_timeout");
  });

  it("requires a JSON content type on a POST (415) and rejects an oversize body (413)", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({}));
    const daemon = await start({ proxy: { fetch: upstream.fetch }, maxBodyBytes: 512 });
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
    expectError(await daemon.post("rpc_base", "/", body, { "content-type": "text/plain" }), "unsupported_media_type");
    expectError(await daemon.post("rpc_base", "/", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: ["x".repeat(600)] })), "body_too_large");
    assert.equal(upstream.calls.length, 0);
  });
});

describe("R9 pauses and limits through the daemon", () => {
  it("pauses a venue after a 403: 503 with Retry-After, the reason on stderr, and the status shape", async () => {
    let status = 403;
    const upstream = scriptedUpstream(() => jsonResponse({ error: "forbidden" }, { status }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const first = await daemon.get("xo_orderbook", "/time");
    assert.equal(first.status, 200);
    assert.equal(readProxyResponseSchema.parse(first.json()).upstream_status, 403);
    const second = await daemon.get("xo_orderbook", "/time");
    expectError(second, "venue_paused");
    assert.equal(second.headers["retry-after"], String(VENUE_PAUSE_MS / 1000));
    assert.equal(upstream.calls.length, 1);
    assert.match(daemon.stderr.text(), /reads from xo_orderbook are paused for 10 minutes \(http_403\)/);
    const venues = venueSwitchesOf(daemon.daemon.host);
    assert.equal(venues?.["xo_orderbook"]?.reason, "paused");
    assert.equal(venues?.["xo_orderbook"]?.paused_until, "2026-10-19T12:10:00Z");
    assert.equal(venues?.["kalshi"]?.reason, "default_off");
    assert.equal(venues?.["polymarket_gamma"]?.reason, "none");
    // The clock is the daemon's: ten minutes later it works again.
    daemon.clock.now += VENUE_PAUSE_MS;
    status = 200;
    assert.equal(readProxyResponseSchema.parse((await daemon.get("xo_orderbook", "/time")).json()).upstream_status, 200);
  });

  it("limits a burst per venue with 429 and Retry-After", async () => {
    const daemon = await start({ proxy: { fetch: scriptedUpstream(() => jsonResponse({ ok: 1 })).fetch } });
    const statuses: number[] = [];
    let last: Awaited<ReturnType<typeof daemon.get>> | undefined;
    for (let i = 0; i < 20; i += 1) {
      last = await daemon.get("xo_orderbook", "/time");
      statuses.push(last.status);
    }
    assert.equal(statuses.filter((status) => status === 200).length, 5);
    assert.equal(statuses.filter((status) => status === 429).length, 15);
    assert.ok(last);
    expectError(last, "rate_limited");
    assert.ok(Number(last.headers["retry-after"]) >= 1);
  });
});

describe("operator settings", () => {
  it("turns on exactly the restricted venues named in XO_COCKPIT_VENUES and says so, ignoring other names", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({ ok: 1 }));
    const daemon = await start({ daemon: { env: { XO_COCKPIT_VENUES: "kalshi, bogus ,xo_data" } }, proxy: { fetch: upstream.fetch } });
    assert.equal((await daemon.get("kalshi", "/trade-api/v2/markets")).status, 200);
    expectError(await daemon.get("quotient", "/api/public/performance"), "venue_disabled");
    assert.equal((await daemon.get("xo_data", "/api/markets")).status, 200);
    assert.match(daemon.stderr.text(), /restricted-terms venues turned on by the operator: kalshi\./);
    assert.match(daemon.stderr.text(), /named 2 item\(s\) that are not restricted-terms venues; they were ignored/);
    assert.doesNotMatch(daemon.stderr.text(), /bogus/);
  });

  it("attaches a daemon-held Quotient key to Quotient only, and the key never appears in an answer or on stderr", async () => {
    const key = "qt_SECRETKEYabcdef123456";
    const upstream = scriptedUpstream(() => jsonResponse({ price: 1 }));
    const daemon = await start({ daemon: { env: { XO_COCKPIT_VENUES: "quotient", [QUOTIENT_KEY_ENV]: key } }, proxy: { fetch: upstream.fetch } });
    const quotient = await daemon.get("quotient", "/api/v1/signals", "window=24");
    const other = await daemon.get("polymarket_gamma", "/status");
    assert.equal(quotient.status, 200);
    assert.equal(upstream.calls[0]?.init.headers["x-quotient-api-key"], key);
    assert.equal(upstream.calls[1]?.init.headers["x-quotient-api-key"], undefined);
    for (const text of [quotient.text, other.text, daemon.stderr.text()]) assert.doesNotMatch(text, /SECRETKEY/);
  });

  it("warns, without echoing it, about a Quotient key that does not look like one", async () => {
    const upstream = scriptedUpstream(() => jsonResponse({}));
    const daemon = await start({ daemon: { env: { XO_COCKPIT_VENUES: "quotient", [QUOTIENT_KEY_ENV]: "sk-not-a-quotient-key" } }, proxy: { fetch: upstream.fetch } });
    await daemon.get("quotient", "/api/public/performance");
    assert.equal(upstream.calls[0]?.init.headers["x-quotient-api-key"], undefined);
    assert.match(daemon.stderr.text(), /does not look like a Quotient key; it is not used/);
    assert.doesNotMatch(daemon.stderr.text(), /sk-not-a/);
  });
});

describe("no secret in any answer", () => {
  it("never carries a token-shaped string back, even when the upstream echoes the request", async () => {
    const upstream = scriptedUpstream((call) => jsonResponse({ echoedHeaders: Object.keys(call.init.headers) }));
    const daemon = await start({ proxy: { fetch: upstream.fetch } });
    const replies = [await daemon.get("xo_orderbook", "/time"), await daemon.get("xo_data", "/api/markets", "take=1"), await daemon.get("kalshi", "/trade-api/v2/markets")];
    for (const reply of replies) assert.doesNotMatch(reply.text, TOKEN_SCAN_PATTERN);
  });
});

// ---- M1-5: an XO book through the proxy equals the plugin's output --------------------------------------------------------

type Obj = Record<string, unknown>;
const detailFee = fixture("live-data-detail-fee-400.json") as Obj;
const obMarketFee = fixture("live-orderbook-market-fee-400.json") as Obj;
const twoSided = fixture("live-orderbook-book-two-sided.json") as Obj;
const emptyBook = fixture("live-orderbook-book-empty.json") as Obj;
const fractionalBook = fixture("live-orderbook-book-fractional.json") as Obj;
const fractionalObMarket = fixture("live-orderbook-market-fractional.json") as Obj;
const fractionalDetail = fixture("live-data-detail-fractional.json") as Obj;
const CID = String(detailFee["conditionId"]);
const YES = String(((obMarketFee["tokens"] as Obj[])[0] as Obj)["token_id"]);
const NO = String(((obMarketFee["tokens"] as Obj[])[1] as Obj)["token_id"]);
const bookFor = (base: Obj, token: string, condition: string): Obj => ({ ...structuredClone(base), asset_id: token, market: condition });

const NOW = Date.parse("2026-10-18T20:00:00Z");

async function callTool(fetchImpl: ReturnType<typeof stubFetch>["fetchImpl"], name: string, args: Obj) {
  const deps: ReadToolDeps = {
    createClient: () => new XoClient(fastOptions(fetchImpl)),
    now: () => NOW,
    audit: { write: () => undefined },
    env: () => ({}),
  };
  const server = new McpServer({ name: "xo-market", version: "0.1.0" }, { supportedProtocolVersions: ["2026-07-28"] });
  registerReadToolsWith(server, deps);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const answer = new Promise<Obj>((resolve) => {
    clientSide.onmessage = (message) => {
      if ((message as { id?: number }).id === 1) resolve(message as unknown as Obj);
    };
  });
  await clientSide.start();
  await clientSide.send({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args,
      _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "proxy-test", version: "0" }, "io.modelcontextprotocol/clientCapabilities": {} },
    },
  } as never);
  const response = await answer;
  await clientSide.close();
  await server.close();
  const result = response["result"] as Obj;
  return { isError: result["isError"] === true, structured: result["structuredContent"], text: (result["content"] as Array<{ text: string }>).map((item) => item.text).join("\n") };
}

// A fetch for the plugin's XoClient that goes through the daemon's read proxy: the page's Cockpit fetch does the
// same mapping (app/src/core/fetch-cockpit.ts) and unwraps the envelope into an ordinary response.
function viaProxy(daemon: ProxyDaemon): (input: string, init: RequestInit) => Promise<Response> {
  const services: Record<string, string> = { "orderbooks.xo.market": "xo_orderbook", "api-mainnet.xo.market": "xo_data" };
  return async (input) => {
    const url = new URL(String(input));
    const service = services[url.hostname];
    assert.ok(service, `no service for ${url.hostname}`);
    const reply = await send({ port: daemon.port, path: `/ui/read/${service}${url.pathname}${url.search}`, headers: bearer(daemon.token) });
    if (reply.status !== 200) return new Response(reply.text, { status: reply.status });
    const envelope = readProxyResponseSchema.parse(reply.json());
    return new Response(JSON.stringify(envelope.body), { status: envelope.upstream_status, headers: { "content-type": "application/json" } });
  };
}

describe("an XO book through the proxy equals the plugin's output (M1-5)", () => {
  const routes: Route[] = [
    dataRoute(`/markets/contract/${CID}`, detailFee),
    orderbookRoute(`/markets/${CID}`, obMarketFee),
    orderbookRoute("/book", bookFor(twoSided, YES, CID), { token_id: YES }),
    orderbookRoute("/book", bookFor(twoSided, NO, CID), { token_id: NO }),
    orderbookRoute("/last-trade-price", { price: "0.394", side: "SELL" }, { token_id: YES }),
    orderbookRoute("/last-trade-price", { price: "0.49", side: "BUY" }, { token_id: NO }),
    orderbookRoute("/book", bookFor(emptyBook, "123", CID), { token_id: "123" }),
    orderbookRoute(`/markets/${String(fractionalDetail["conditionId"])}`, fractionalObMarket),
    orderbookRoute("/book", fractionalBook, { token_id: String(fractionalBook["asset_id"]) }),
  ];

  const cases: Array<[string, string, Obj]> = [
    ["the Yes book", "xo_orderbook", { token_id: YES, depth: 50 }],
    ["the No book, truncated", "xo_orderbook", { token_id: NO, depth: 2 }],
    ["a book with six-decimal sizes", "xo_orderbook", { token_id: String(fractionalBook["asset_id"]), depth: 3 }],
    ["market prices (book + last trade per side)", "xo_market_prices", { condition_id: CID }],
  ];
  for (const [label, tool, args] of cases) {
    it(`is identical for ${label}`, async () => {
      const direct = stubFetch(routes);
      const proxied = stubFetch(routes);
      const daemon = await start({ proxy: { fetch: (url, init) => proxied.fetchImpl(url, init as RequestInit), limits: { xo_orderbook: { perSecond: 1000, burst: 1000 }, xo_data: { perSecond: 1000, burst: 1000 } } } });
      const expected = await callTool(direct.fetchImpl, tool, args);
      const actual = await callTool(viaProxy(daemon), tool, args);
      assert.equal(expected.isError, false, expected.text);
      assert.deepEqual(actual, expected);
      // The proxy asked the venue for the same URLs the plugin's own client did.
      const urls = (calls: typeof direct.calls) => calls.map((call) => call.url.href).sort();
      assert.deepEqual(urls(proxied.calls), urls(direct.calls));
    });
  }

  it("also gives the same decoded book from the client itself", async () => {
    const direct = stubFetch(routes);
    const proxied = stubFetch(routes);
    const daemon = await start({ proxy: { fetch: (url, init) => proxied.fetchImpl(url, init as RequestInit) } });
    const a = await new XoClient(fastOptions(direct.fetchImpl)).getBook(YES);
    const b = await new XoClient(fastOptions(viaProxy(daemon))).getBook(YES);
    assert.deepEqual(b, a);
    assert.ok(a.bids.length > 0 && a.asks.length > 0);
  });

  it("keeps a venue 404 a 404 for the client (an unknown token has no book)", async () => {
    const proxied = scriptedUpstream(() => jsonResponse({ error: "not found" }, { status: 404 }));
    const daemon = await start({ proxy: { fetch: proxied.fetch } });
    const client = new XoClient(fastOptions(viaProxy(daemon)));
    await assert.rejects(client.getBook("999"), (error: unknown) => (error as { kind?: string }).kind === "not_found");
  });
});

// ---- M1-6: Kalshi and Quotient bodies are never written under the data directory ------------------------------------------------

async function snapshot(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(current: string, prefix: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        out.set(`${rel}/`, "dir");
        await walk(path, `${rel}/`);
      } else {
        const info = await stat(path);
        out.set(rel, `${info.size}:${info.mtimeMs}:${createHash("sha256").update(await readFile(path)).digest("hex")}`);
      }
    }
  }
  await walk(dir, "");
  return out;
}

describe("restricted bodies are never written (M1-6)", () => {
  it("leaves the data directory byte-for-byte unchanged after Kalshi and Quotient reads, and after shutdown", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cockpit-proxy-"));
    dirs.push(dir);
    await mkdir(join(dir, "cockpit"), { recursive: true });
    await writeFile(join(dir, "cockpit", "agent-token.json"), '{"version":1}\n');
    await writeFile(join(dir, "ledger.db"), "existing state");
    const before = await snapshot(dir);

    const KALSHI = "KALSHI-BODY-d41d8cd9";
    const QUOTIENT = "QUOTIENT-BODY-98f00b20";
    const upstream = scriptedUpstream((call) =>
      call.url.includes("kalshi") ? jsonResponse({ markets: [{ title: KALSHI, big: "x".repeat(50_000) }] }) : jsonResponse({ thesis: QUOTIENT, q: 0.61 }),
    );
    const daemon = await start({
      daemon: { dataDir: () => dir, env: { XO_COCKPIT_VENUES: "kalshi,quotient" } },
      proxy: { fetch: upstream.fetch, limits: { kalshi: { perSecond: 1000, burst: 1000 }, quotient: { perSecond: 1000, burst: 1000 } } },
    });
    for (let i = 0; i < 10; i += 1) {
      assert.match((await daemon.get("kalshi", "/trade-api/v2/markets", "status=open")).text, new RegExp(KALSHI));
      assert.match((await daemon.get("quotient", "/api/v1/signals")).text, new RegExp(QUOTIENT));
    }
    // A refusal and a pause also leave nothing behind.
    await daemon.get("kalshi", "/trade-api/v2/portfolio/orders");
    assert.deepEqual(await snapshot(dir), before, "the data directory changed while the proxy was serving");

    await daemon.stop();
    running.splice(running.indexOf(daemon), 1);
    assert.deepEqual(await snapshot(dir), before, "the data directory changed at shutdown");

    // Nothing anywhere in it, in any file, mentions either body; and neither did stderr.
    for (const rel of before.keys()) {
      if (rel.endsWith("/")) continue;
      const text = await readFile(join(dir, rel), "utf8");
      assert.doesNotMatch(text, /KALSHI-BODY|QUOTIENT-BODY/);
    }
    assert.doesNotMatch(daemon.stderr.text(), /KALSHI-BODY|QUOTIENT-BODY/);
    assert.ok(upstream.calls.length >= 20);
  });

  it("the diff test can fail: a file written in the directory is seen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cockpit-proxy-"));
    dirs.push(dir);
    const before = await snapshot(dir);
    await writeFile(join(dir, "cache.json"), "KALSHI-BODY");
    assert.notDeepEqual(await snapshot(dir), before);
  });
});
