import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { afterEach, describe, it } from "node:test";

import * as z from "zod/v4";

import { UI_ROUTE_KEYS, BRIDGE_ERROR_CODES, BRIDGE_ERROR_HTTP_STATUS, MAX_REQUEST_BODY_BYTES, bridgeErrorResponseSchema, type BridgeErrorCode } from "../../contract.js";
import { securityHeaders } from "../../../app/headers.config.js";
import {
  BridgeHttpError,
  DaemonStartError,
  defineRoute,
  fail,
  json,
  startDaemon,
  type BridgeModule,
  type Guard,
} from "../../server.js";
import { Auth } from "../../auth.js";
import { bearer, captureStderr, fakeClock, postJson, raw, seededRandom, send, startTestDaemon, type RequestInput, type TestDaemon } from "./helpers.js";

// A module with one route of each shape, standing in for the proxy, class table, inbox and feed.
const probe: BridgeModule = {
  name: "probe",
  routes: [
    defineRoute({
      method: "GET",
      path: "/ui/status",
      access: { scope: "read" },
      handler: (ctx) => json({ kind: ctx.principal?.kind, scopes: ctx.principal?.scopes, headers: ctx.headers }),
    }),
    defineRoute({
      method: "POST",
      path: "/ui/tool",
      access: { scope: "prepare" },
      body: z.object({ tool: z.string().regex(/^[a-z_]+$/), args: z.record(z.string(), z.json()) }).strict(),
      handler: (ctx) => json({ echoed: ctx.body.tool, bytes: ctx.rawBody.length }),
    }),
    defineRoute({
      method: "POST",
      path: "/ui/inbox/sign",
      access: { scope: "submit" },
      body: z.object({ prepared_id: z.string() }).strict(),
      handler: () => json({ signed: true }),
    }),
    defineRoute({ method: "POST", path: "/ui/kill", access: { scope: "read" }, body: z.object({}).strict(), handler: () => json({ kill: true }) }),
    defineRoute({
      method: "GET",
      path: "/ui/inbox/:prepared_id",
      access: { scope: "read" },
      handler: (ctx) => json({ id: ctx.params["prepared_id"] }),
    }),
    defineRoute({ method: "GET", path: "/ui/read/", access: { scope: "read" }, handler: (ctx) => json({ rest: ctx.rest, query: ctx.query }) }),
    defineRoute({ method: "GET", path: "/ui/userop/:hash", access: { scope: "read" }, handler: () => { throw new Error("secret detail xyz"); } }),
    defineRoute({ method: "GET", path: "/ui/order/:hash", access: { scope: "read" }, handler: () => { throw new BridgeHttpError("venue_paused", "Venue paused.", { retryAfterS: 30 }); } }),
    defineRoute({ method: "POST", path: "/mcp", access: { scope: "read" }, body: "raw", kinds: ["agent"], handler: (ctx) => json({ method: ctx.toWebRequest().method, len: ctx.rawBody.length }) }),
    defineRoute({
      method: "GET",
      path: "/mcp",
      access: { scope: "read" },
      handler: () =>
        ({
          kind: "web",
          response: new Response("{}", { status: 200, headers: { "content-type": "application/json", "set-cookie": "a=b", "access-control-allow-origin": "*", "x-frame-options": "ALLOWALL", "x-extra": "kept" } }),
        }),
    }),
    defineRoute({
      method: "GET",
      path: "/ui/events",
      access: { scope: "read" },
      handler: () => ({
        kind: "stream",
        contentType: "text/event-stream",
        start(sink) {
          sink.write("id: 1\ndata: {}\n\n");
          sink.onClose(() => closedStreams.push("closed"));
        },
      }),
    }),
  ],
};
const closedStreams: string[] = [];

let running: TestDaemon | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
  closedStreams.length = 0;
});

async function start(extra: Parameters<typeof startTestDaemon>[0] = {}): Promise<TestDaemon> {
  running = await startTestDaemon({ modules: [{ name: "probe", source: probe }], ...extra });
  return running;
}

describe("binding", () => {
  it("listens on 127.0.0.1 only, on a free port chosen at runtime", async () => {
    const t = await start();
    assert.ok(t.port > 0);
    assert.equal(t.daemon.origin, `http://127.0.0.1:${t.port}`);
    const reply = await send({ port: t.port, path: "/ui/status" });
    assert.equal(reply.status, 401);
    // a second daemon gets another port
    const other = await startTestDaemon();
    assert.notEqual(other.port, t.port);
    await other.stop();
  });
});

describe("M1-1: Host pinning (DNS rebinding)", () => {
  it("answers 403 host_forbidden for any Host other than 127.0.0.1:<port>, before auth, on every kind of route", async () => {
    const t = await start();
    const token = await t.pair();
    for (const host of ["evil.example", `evil.example:${t.port}`, `localhost:${t.port}`, `127.0.0.1:${t.port + 1}`, "127.0.0.1", `127.0.0.1.evil.example:${t.port}`]) {
      for (const path of ["/", "/index.html", "/ui/status", "/ui/pair", "/mcp", "/nonexistent"]) {
        const reply = await send({ port: t.port, path, host, headers: bearer(token) });
        assert.equal(reply.status, 403, `${host} ${path}`);
        assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "host_forbidden");
      }
    }
  });
  it("refuses a request with no Host header", async () => {
    const t = await start();
    const text = await raw(t.port, "GET /ui/status HTTP/1.0\r\n\r\n");
    assert.match(text, /^HTTP\/1\.[01] 403 /);
    assert.match(text, /host_forbidden/);
  });
  it("refuses two Host headers, whichever is right", async () => {
    const t = await start();
    const text = await raw(t.port, `GET /ui/status HTTP/1.1\r\nHost: 127.0.0.1:${t.port}\r\nHost: evil.example\r\n\r\n`);
    assert.match(text, /^HTTP\/1\.1 403 /);
    assert.match(text, /host_forbidden/);
  });
  it("counts the refusals", async () => {
    const t = await start();
    await send({ port: t.port, path: "/", host: "evil.example" });
    assert.equal(t.daemon.host.stats()["host_forbidden"], 1);
  });
});

describe("M1-2: Origin pinning, tokens, cookies", () => {
  it("answers 403 origin_forbidden for a wrong Origin on API routes and on static files", async () => {
    const t = await start();
    const token = await t.pair();
    for (const origin of ["https://example.org", "null", "https://app.paybox.sh", `http://localhost:${t.port}`, `http://127.0.0.1:${t.port + 1}`]) {
      for (const path of ["/ui/status", "/ui/tool", "/"]) {
        const reply = await send({ port: t.port, path, method: path === "/ui/tool" ? "POST" : "GET", headers: { origin, ...bearer(token), "content-type": "application/json" }, body: path === "/ui/tool" ? "{}" : undefined });
        assert.equal(reply.status, 403, `${origin} ${path}`);
        assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "origin_forbidden");
      }
    }
  });
  it("accepts the daemon's own Origin and no Origin at all", async () => {
    const t = await start();
    const token = await t.pair();
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: { origin: t.daemon.origin, ...bearer(token) } })).status, 200);
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: bearer(token) })).status, 200);
  });
  it("refuses cross-site and same-site fetch metadata on API routes", async () => {
    const t = await start();
    const token = await t.pair();
    for (const site of ["cross-site", "same-site"]) {
      const reply = await send({ port: t.port, path: "/ui/status", headers: { "sec-fetch-site": site, ...bearer(token) } });
      assert.equal(reply.status, 403);
      assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "origin_forbidden");
    }
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: { "sec-fetch-site": "same-origin", ...bearer(token) } })).status, 200);
  });
  it("answers 401 for a missing, malformed, wrong or non-bearer token", async () => {
    const t = await start();
    const token = await t.pair();
    const bad: Record<string, string>[] = [
      {},
      { authorization: "" },
      { authorization: "Bearer" },
      { authorization: `Basic ${token}` },
      { authorization: `Bearer ${token.slice(0, -1)}` },
      { authorization: `Bearer ${token}0` },
      { authorization: `Bearer cku_${"A".repeat(43)}` },
      { authorization: `Bearer cka_${"A".repeat(43)}` },
      // a token in the query string or a cookie is not a credential
      {},
    ];
    for (const headers of bad) {
      const reply = await send({ port: t.port, path: "/ui/status", headers });
      assert.equal(reply.status, 401, JSON.stringify(headers).slice(0, 40));
      assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "unauthorized");
    }
    assert.equal((await send({ port: t.port, path: `/ui/status?token=${token}` })).status, 401);
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: { cookie: `token=${token}; session=${token}` } })).status, 401);
  });
  it("answers 401 for unknown API paths when unauthenticated, so the route list is not readable without a token", async () => {
    const t = await start();
    for (const path of ["/ui/nothing", "/ui/inbox", "/ui/arm", "/mcp/extra", "/ui"]) {
      const reply = await send({ port: t.port, path });
      assert.equal(reply.status, path === "/mcp/extra" ? 404 : 401, path);
    }
  });
  it("never sends Set-Cookie or any Access-Control header, whatever the route, status or module", async () => {
    const t = await start({ agentHash: undefined });
    const token = await t.pair();
    const probes: Omit<RequestInput, "port">[] = [
      { path: "/" },
      { path: "/ui/status" },
      { path: "/ui/status", headers: bearer(token) },
      { path: "/ui/nothing", headers: bearer(token) },
      { path: "/ui/userop/0x00", headers: bearer(token) },
      { path: "/ui/order/0x00", headers: bearer(token) },
      { path: "/ui/status", headers: { origin: "https://example.org" } },
      { path: "/ui/status", host: "evil.example" },
      { path: "/ui/status", method: "OPTIONS", headers: { origin: "https://example.org", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } },
      { path: "/ui/status", method: "OPTIONS" },
      { path: "/ui/pair", method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
    ];
    const replies = await Promise.all(probes.map((input) => send({ port: t.port, ...input })));
    for (const [index, reply] of replies.entries()) {
      const names = Object.keys(reply.headers).map((name) => name.toLowerCase());
      assert.equal(names.includes("set-cookie"), false, `set-cookie on probe ${index}`);
      assert.equal(names.some((name) => name.startsWith("access-control-")), false, `CORS header on probe ${index}`);
    }
  });
  it("gives no approving answer to a CORS preflight", async () => {
    const t = await start();
    const cross = await send({ port: t.port, path: "/ui/status", method: "OPTIONS", headers: { origin: "https://example.org", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
    assert.equal(cross.status, 403);
    const same = await send({ port: t.port, path: "/ui/status", method: "OPTIONS" });
    assert.equal(same.status, 405);
    assert.equal(same.headers["allow"], "GET, POST, DELETE");
    const token = await t.pair();
    const sameAuth = await send({ port: t.port, path: "/ui/status", method: "OPTIONS", headers: bearer(token) });
    assert.equal(sameAuth.status, 405);
  });
  it("drops WebSocket upgrades and CONNECT", async () => {
    const t = await start();
    const upgraded = await raw(t.port, `GET /ui/events HTTP/1.1\r\nHost: 127.0.0.1:${t.port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    assert.equal(upgraded.includes("101"), false);
    const tunnel = await raw(t.port, `CONNECT example.org:443 HTTP/1.1\r\nHost: example.org:443\r\n\r\n`);
    assert.equal(tunnel.includes("200"), false);
  });
});

describe("security headers", () => {
  it("puts the Cockpit CSP and the other headers from headers.config.ts on every kind of answer", async () => {
    const t = await start();
    const token = await t.pair();
    const wanted = Object.fromEntries(securityHeaders("cockpit").map((pair) => [pair.key.toLowerCase(), pair.value]));
    assert.match(wanted["content-security-policy"] ?? "", /connect-src 'self'(;|$)/);
    const replies = [
      await send({ port: t.port, path: "/ui/status", headers: bearer(token) }),
      await send({ port: t.port, path: "/ui/status" }),
      await send({ port: t.port, path: "/nothing" }),
      await send({ port: t.port, path: "/ui/status", host: "evil.example" }),
      await send({ port: t.port, path: "/mcp", headers: bearer(token) }),
    ];
    for (const reply of replies) {
      for (const [name, value] of Object.entries(wanted)) assert.equal(reply.headers[name], value, name);
      assert.equal(reply.headers["cache-control"], "no-store");
    }
  });
  it("lets a module add headers but never override or add the forbidden ones", async () => {
    const t = await start();
    const agent = await agentToken(t);
    const reply = await send({ port: t.port, path: "/mcp", headers: bearer(agent) });
    assert.equal(reply.status, 200);
    assert.equal(reply.headers["x-extra"], "kept");
    assert.equal(reply.headers["set-cookie"], undefined);
    assert.equal(reply.headers["access-control-allow-origin"], undefined);
    assert.notEqual(reply.headers["x-frame-options"], "ALLOWALL");
    assert.equal(reply.headers["x-frame-options"], "DENY");
  });
});

// A second test daemon that has an agent token, because pair() mints ui tokens.
async function agentToken(t: TestDaemon): Promise<string> {
  const { mintAgentToken, tokenId } = await import("../../auth.js");
  const { createHash } = await import("node:crypto");
  const token = mintAgentToken(seededRandom("agent-token"));
  t.auth.setAgentHash({ id: tokenId(token), sha256: createHash("sha256").update(token).digest("hex") });
  return token;
}

describe("routing and access", () => {
  it("serves a registered route to a token that holds its scope and passes the principal and path pieces", async () => {
    const t = await start();
    const token = await t.pair();
    const status = await send({ port: t.port, path: "/ui/status", headers: { ...bearer(token), cookie: "x=1", "x-test": "yes" } });
    const body = status.json() as { kind: string; scopes: string[]; headers: Record<string, string> };
    assert.equal(body.kind, "ui");
    assert.deepEqual(body.scopes, ["read", "prepare"]);
    assert.equal(body.headers["x-test"], "yes");
    assert.equal(body.headers["authorization"], undefined, "modules never see the Authorization header");
    assert.equal(body.headers["cookie"], undefined, "modules never see Cookie");
    const idParam = await send({ port: t.port, path: "/ui/inbox/prep_abc", headers: bearer(token) });
    assert.deepEqual(idParam.json(), { id: "prep_abc" });
    const prefix = await send({ port: t.port, path: "/ui/read/xo_data/api/markets?limit=5", headers: bearer(token) });
    assert.deepEqual(prefix.json(), { rest: "xo_data/api/markets", query: "limit=5" });
    assert.equal((await send({ port: t.port, path: "/ui/read/", headers: bearer(token) })).status, 404);
  });
  it("answers 403 scope_denied for a scope the token lacks, and never gives a ui token submit", async () => {
    const t = await start();
    const token = await t.pair();
    const reply = await postJson(t.port, "/ui/inbox/sign", { prepared_id: "x" }, bearer(token));
    assert.equal(reply.status, 403);
    assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "scope_denied");
  });
  it("lets an agent token with a submit ceiling reach a submit-scope route, and a read-only instance still refuses it", async () => {
    const t = await start({ agentScopes: ["read", "prepare", "submit"] });
    const agent = await agentToken(t);
    assert.equal((await postJson(t.port, "/ui/inbox/sign", { prepared_id: "x" }, bearer(agent))).status, 200);
    t.role = "read_only";
    const denied = await postJson(t.port, "/ui/inbox/sign", { prepared_id: "x" }, bearer(agent));
    assert.equal(denied.status, 403);
    const tool = await postJson(t.port, "/ui/tool", { tool: "xo_search", args: {} }, bearer(agent));
    assert.equal(tool.status, 403, "a read-only instance serves reads only");
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: bearer(agent) })).status, 200);
  });
  it("restricts a route to the token kinds it names", async () => {
    const t = await start();
    const ui = await t.pair();
    const agent = await agentToken(t);
    assert.equal((await postJson(t.port, "/mcp", {}, bearer(ui))).status, 403);
    assert.equal((await postJson(t.port, "/mcp", { jsonrpc: "2.0" }, bearer(agent))).status, 200);
  });
  it("answers 405 for a known path with another method and 404 for an unknown path, once authenticated", async () => {
    const t = await start();
    const token = await t.pair();
    assert.equal((await postJson(t.port, "/ui/status", {}, bearer(token))).status, 405);
    assert.equal((await send({ port: t.port, path: "/ui/nothing-here", headers: bearer(token) })).status, 404);
    assert.equal((await send({ port: t.port, method: "DELETE", path: "/ui/status", headers: bearer(token) })).status, 405);
    assert.equal((await send({ port: t.port, method: "PUT", path: "/ui/status", headers: bearer(token) })).status, 405);
    assert.equal((await send({ port: t.port, method: "PATCH", path: "/ui/tool", headers: bearer(token) })).status, 405);
  });
  it("refuses a malformed target and an absolute-form request line", async () => {
    const t = await start();
    const token = await t.pair();
    for (const path of ["/ui/../ui/status", "/ui/%2e%2e/status", "/ui/read/a%2fb", "/ui/read/a\\b"]) {
      assert.equal((await send({ port: t.port, path, headers: bearer(token) })).status, 400, path);
    }
    const absolute = await raw(t.port, `GET http://evil.example/ui/status HTTP/1.1\r\nHost: 127.0.0.1:${t.port}\r\n\r\n`);
    assert.match(absolute, /^HTTP\/1\.1 400 /);
  });
  it("answers each error with the contract's body and status for its code", async () => {
    const t = await start();
    const token = await t.pair();
    const paused = await send({ port: t.port, path: "/ui/order/0x00", headers: bearer(token) });
    const parsed = bridgeErrorResponseSchema.parse(paused.json());
    assert.equal(parsed.error.code, "venue_paused");
    assert.equal(parsed.error.retry_after_s, 30);
    assert.equal(paused.status, BRIDGE_ERROR_HTTP_STATUS.venue_paused);
    assert.equal(paused.headers["retry-after"], "30");
    for (const code of BRIDGE_ERROR_CODES) {
      const result = fail(code as BridgeErrorCode, "x");
      assert.equal(result.status, BRIDGE_ERROR_HTTP_STATUS[code as BridgeErrorCode]);
      bridgeErrorResponseSchema.parse(result.body);
    }
  });
  it("turns an unexpected throw into a fixed 500 that quotes nothing", async () => {
    const t = await start();
    const token = await t.pair();
    const reply = await send({ port: t.port, path: "/ui/userop/0x00", headers: bearer(token) });
    assert.equal(reply.status, 500);
    assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "internal");
    assert.equal(reply.text.includes("secret detail xyz"), false);
    assert.equal(t.stderr.text().includes("secret detail xyz"), false);
    assert.match(t.stderr.text(), /a handler failed \(GET \/ui\/userop\/:hash, Error\)/);
  });
});

describe("request body limits and content", () => {
  it("answers 415 for a POST that is not application/json", async () => {
    const t = await start();
    const token = await t.pair();
    for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/json; charset=latin1"]) {
      const reply = await send({ port: t.port, method: "POST", path: "/ui/tool", headers: { ...bearer(token), ...(type === undefined ? {} : { "content-type": type }) }, body: "{}" });
      assert.equal(reply.status, 415, String(type));
    }
  });
  it("answers 413 for a body over the limit, by Content-Length and by streaming, and 400 for a bad Content-Length", async () => {
    const t = await start();
    const token = await t.pair();
    const big = JSON.stringify({ tool: "x", args: { pad: "a".repeat(MAX_REQUEST_BODY_BYTES + 10) } });
    const declared = await send({ port: t.port, method: "POST", path: "/ui/tool", headers: { ...bearer(token), "content-type": "application/json" }, body: big });
    assert.equal(declared.status, 413);
    assert.equal(bridgeErrorResponseSchema.parse(declared.json()).error.code, "body_too_large");
    // chunked: no Content-Length to check, so the cap is applied while reading
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port: t.port, method: "POST", path: "/ui/tool", headers: { ...bearer(token), "content-type": "application/json", "transfer-encoding": "chunked", host: `127.0.0.1:${t.port}` }, setHost: false, agent: false }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      });
      req.on("error", reject);
      const chunk = "a".repeat(64 * 1024);
      req.write('{"tool":"x","args":{"pad":"');
      for (let index = 0; index < 6; index += 1) req.write(chunk);
      req.end('"}}');
    });
    assert.equal(status, 413);
    const exact = await postJson(t.port, "/ui/tool", { tool: "x", args: {} }, bearer(token));
    assert.equal(exact.status, 200);
    const text = await raw(t.port, `POST /ui/tool HTTP/1.1\r\nHost: 127.0.0.1:${t.port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: 1e3\r\n\r\n{}`);
    assert.match(text, /^HTTP\/1\.1 400 /);
  });
  it("does not read the body of a request that fails auth, scope or a guard", async () => {
    const t = await start();
    const token = await t.pair();
    const huge = "a".repeat(MAX_REQUEST_BODY_BYTES * 4);
    // The server answers and closes without reading; a client still writing may see the reset instead of the
    // answer. Either way the answer is never a 413, which would mean the body was read first.
    const outcome = async (path: string, headers: Record<string, string>): Promise<number | "reset"> => {
      try {
        return (await send({ port: t.port, method: "POST", path, headers: { "content-type": "application/json", ...headers }, body: huge })).status;
      } catch {
        return "reset";
      }
    };
    const unauth = await outcome("/ui/tool", {});
    assert.ok(unauth === 401 || unauth === "reset", String(unauth));
    const scope = await outcome("/ui/inbox/sign", bearer(token));
    assert.ok(scope === 403 || scope === "reset", String(scope));
    // a small body shows the same refusals deterministically
    assert.equal((await postJson(t.port, "/ui/tool", { tool: "x", args: {} })).status, 401);
    assert.equal((await postJson(t.port, "/ui/inbox/sign", { prepared_id: "x" }, bearer(token))).status, 403);
  });
  it("answers 400 invalid_request for invalid JSON and for a body that fails the route's schema, without echoing it", async () => {
    const t = await start();
    const token = await t.pair();
    const notJson = await send({ port: t.port, method: "POST", path: "/ui/tool", headers: { ...bearer(token), "content-type": "application/json" }, body: "{nope" });
    assert.equal(notJson.status, 400);
    const bad = await postJson(t.port, "/ui/tool", { tool: "Bad Name", args: {}, extra: "secret-value-123" }, bearer(token));
    assert.equal(bad.status, 400);
    assert.equal(bridgeErrorResponseSchema.parse(bad.json()).error.code, "invalid_request");
    assert.equal(bad.text.includes("secret-value-123"), false);
    assert.equal(bad.text.includes("Bad Name"), false);
    assert.ok(t.audit.some((record) => record.ev === "schema.violation"), "a schema violation is audited");
    assert.equal(JSON.stringify(t.audit).includes("secret-value-123"), false);
  });
  it("refuses a body on a GET", async () => {
    const t = await start();
    const token = await t.pair();
    const reply = await send({ port: t.port, path: "/ui/status", headers: { ...bearer(token), "content-length": "2" }, body: "{}" });
    assert.equal(reply.status, 400);
  });
  it("hands a raw body route the bytes and a Web Request", async () => {
    const t = await start();
    const agent = await agentToken(t);
    const reply = await send({ port: t.port, method: "POST", path: "/mcp", headers: { ...bearer(agent), "content-type": "application/json" }, body: '{"jsonrpc":"2.0","id":1}' });
    assert.deepEqual(reply.json(), { method: "POST", len: 24 });
  });
});

describe("rate limit", () => {
  it("answers 429 rate_limited with Retry-After once a token's burst is spent, per token", async () => {
    const clock = fakeClock();
    void clock;
    const t = await start({ requestsPerSecond: 2 });
    const token = await t.pair();
    const other = await t.pair();
    const statuses: number[] = [];
    for (let index = 0; index < 8; index += 1) statuses.push((await send({ port: t.port, path: "/ui/status", headers: bearer(token) })).status);
    assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.ok(statuses.includes(429));
    const limited = await send({ port: t.port, path: "/ui/status", headers: bearer(token) });
    assert.equal(limited.status, 429);
    assert.equal(bridgeErrorResponseSchema.parse(limited.json()).error.code, "rate_limited");
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: bearer(other) })).status, 200, "another token has its own bucket");
    t.clock.now += 5_000;
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: bearer(token) })).status, 200, "the bucket refills with time");
  });
});

describe("guards", () => {
  it("runs a registered guard after the scope check and before the body is read; a guard that throws refuses", async () => {
    const t = await start();
    const token = await t.pair();
    const seen: string[] = [];
    const refuseTool: Guard = (ctx) => {
      seen.push(ctx.key);
      return ctx.key === "POST /ui/tool" ? { code: "not_armed", message: "No ARM window is open." } : undefined;
    };
    t.daemon.host.addGuard(refuseTool);
    const blocked = await postJson(t.port, "/ui/tool", { tool: "x", args: {} }, bearer(token));
    assert.equal(blocked.status, 403);
    assert.equal(bridgeErrorResponseSchema.parse(blocked.json()).error.code, "not_armed");
    assert.equal((await send({ port: t.port, path: "/ui/status", headers: bearer(token) })).status, 200);
    assert.deepEqual(seen, ["POST /ui/tool", "GET /ui/status"]);
    // not reached for an unauthenticated request or one outside the token's scope
    await send({ port: t.port, path: "/ui/status" });
    await postJson(t.port, "/ui/inbox/sign", { prepared_id: "x" }, bearer(token));
    assert.equal(seen.length, 2);
    t.daemon.host.addGuard(() => {
      throw new Error("broken guard");
    });
    const refused = await send({ port: t.port, path: "/ui/status", headers: bearer(token) });
    assert.equal(refused.status, 500);
  });
});

describe("route registry", () => {
  async function tryStart(routes: BridgeModule["routes"], extra: Partial<Parameters<typeof startDaemon>[0]> = {}) {
    const auth = new Auth({ clock: fakeClock(), random: seededRandom("reg"), instance: () => "writer" });
    return startDaemon({ version: "t", stderr: captureStderr(), auth, modules: [{ name: "m", source: { name: "m", routes } }], ...extra });
  }
  it("refuses a route that is not in the frozen contract", async () => {
    await assert.rejects(tryStart([defineRoute({ method: "GET", path: "/ui/secret", access: { scope: "read" }, handler: () => json({}) })]), (error: unknown) => error instanceof DaemonStartError && error.code === "route_invalid" && error.module === "m");
    await assert.rejects(tryStart([defineRoute({ method: "POST", path: "/ui/flags/set", access: { scope: "read" }, body: "raw", handler: () => json({}) })]), DaemonStartError);
    await assert.rejects(tryStart([defineRoute({ method: "GET", path: "/ui/status/", access: { scope: "read" }, handler: () => json({}) })]), DaemonStartError);
  });
  it("accepts a route outside the contract only when the caller names it (tests)", async () => {
    const daemon = await tryStart([defineRoute({ method: "GET", path: "/ui/extra", access: { scope: "read" }, handler: () => json({}) })], { extraRouteKeys: ["GET /ui/extra"] });
    await daemon.close();
  });
  it("refuses a duplicate route, a POST with no body declaration, a GET with one, and a bad access rule", async () => {
    const get = defineRoute({ method: "GET", path: "/ui/status", access: { scope: "read" }, handler: () => json({}) });
    await assert.rejects(tryStart([get, get]), DaemonStartError);
    await assert.rejects(tryStart([defineRoute({ method: "POST", path: "/ui/kill", access: { scope: "read" }, handler: () => json({}) })]), DaemonStartError);
    await assert.rejects(tryStart([defineRoute({ method: "GET", path: "/ui/status", access: { scope: "read" }, body: "raw", handler: () => json({}) })]), DaemonStartError);
    await assert.rejects(tryStart([{ ...get, access: { scope: "admin" } as never }]), DaemonStartError);
    await assert.rejects(tryStart([{ ...get, access: undefined as never }]), DaemonStartError);
  });
  it("refuses a second pairing route (the daemon owns /ui/pair)", async () => {
    await assert.rejects(tryStart([defineRoute({ method: "POST", path: "/ui/pair", access: "public", body: "raw", handler: () => json({}) })]), DaemonStartError);
  });
  it("stops the daemon when a module fails to build, and frees the port", async () => {
    const auth = new Auth({ clock: fakeClock(), random: seededRandom("fail"), instance: () => "writer" });
    let seenPort = 0;
    await assert.rejects(
      startDaemon({
        version: "t",
        stderr: captureStderr(),
        auth,
        modules: [
          {
            name: "boom",
            source: (host) => {
              seenPort = host.port;
              throw new Error("quote of a request");
            },
          },
        ],
      }),
      (error: unknown) => error instanceof DaemonStartError && error.code === "module_failed" && !error.message.includes("quote of a request"),
    );
    assert.ok(seenPort > 0);
    await assert.rejects(new Promise((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: seenPort }, () => resolve(undefined));
      socket.on("error", reject);
    }));
  });
  it("lists the registered routes for introspection", async () => {
    const t = await start();
    const keys = t.daemon.host.routes().map((route) => route.key);
    assert.ok(keys.includes("POST /ui/pair"));
    assert.ok(keys.includes("GET /ui/read/*"));
    assert.ok(keys.includes("GET /ui/inbox/:prepared_id"));
  });
});

describe("the skeleton alone", () => {
  it("serves no route of the frozen contract except /ui/pair: the rest answer not_found until a module registers them", async () => {
    const t = await startTestDaemon();
    running = t;
    const token = await t.pair();
    for (const key of UI_ROUTE_KEYS) {
      const [method, pattern] = key.split(" ") as [string, string];
      if (key === "POST /ui/pair") continue;
      const path = pattern.replace("/*", "/xo_data/x").replace(":prepared_id", "prep_x").replace(":hash", "0x00");
      const reply = await send({ port: t.port, method, path, headers: { ...bearer(token), "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      assert.equal(reply.status, 404, key);
      assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "not_found", key);
    }
    assert.deepEqual(t.daemon.host.routes().map((route) => route.key), ["POST /ui/pair"]);
  });
});

describe("audit bus", () => {
  it("replays events emitted before a sink attaches, once, and ignores unknown event names", async () => {
    const auth = new Auth({ clock: fakeClock(), random: seededRandom("audit"), instance: () => "writer" });
    const daemon = await startDaemon({ version: "t", stderr: captureStderr(), auth });
    daemon.host.emitAudit({ ev: "ui.arm", outcome: "ok" });
    daemon.host.emitAudit({ ev: "not.an.event" as never });
    const got: string[] = [];
    const detach = daemon.host.onAudit((record) => got.push(record.ev), { replay: true });
    assert.deepEqual(got, ["ui.arm"]);
    daemon.host.emitAudit({ ev: "ui.kill" });
    assert.deepEqual(got, ["ui.arm", "ui.kill"]);
    detach();
    daemon.host.emitAudit({ ev: "ui.disarm" });
    assert.deepEqual(got, ["ui.arm", "ui.kill"]);
    // a sink that throws does not break the emitter
    daemon.host.onAudit(() => {
      throw new Error("sink down");
    });
    daemon.host.emitAudit({ ev: "ui.kill" });
    await daemon.close();
  });
});

describe("streams and shutdown", () => {
  it("streams server-sent events, tells the module when the client leaves, and ends every stream on close", async () => {
    const t = await start();
    const token = await t.pair();
    const first = await new Promise<{ status: number; type: string | undefined; chunk: string; res: import("node:http").IncomingMessage }>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port: t.port, path: "/ui/events", headers: { ...bearer(token), host: `127.0.0.1:${t.port}` }, setHost: false, agent: false }, (res) => {
        res.once("data", (chunk: Buffer) => resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"], chunk: chunk.toString("utf8"), res }));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(first.status, 200);
    assert.equal(first.type, "text/event-stream");
    assert.equal(first.chunk, "id: 1\ndata: {}\n\n");
    assert.equal(t.daemon.host.openStreams(), 1);
    const ended = new Promise<void>((resolve) => first.res.on("end", () => resolve()));
    await t.stop();
    await ended;
    assert.deepEqual(closedStreams, ["closed"]);
    assert.equal(t.daemon.host.openStreams(), 0);
  });
  it("tells the module when the client disconnects", async () => {
    const t = await start();
    const token = await t.pair();
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port: t.port, path: "/ui/events", headers: { ...bearer(token), host: `127.0.0.1:${t.port}` }, setHost: false, agent: false }, (res) => {
        res.once("data", () => {
          req.destroy();
          resolve();
        });
      });
      req.on("error", () => undefined);
      req.on("error", reject);
      req.end();
    }).catch(() => undefined);
    for (let index = 0; index < 50 && closedStreams.length === 0; index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(closedStreams, ["closed"]);
    assert.equal(t.daemon.host.openStreams(), 0);
  });
  it("closes cleanly and idempotently: module closers run in reverse order, tokens are wiped, the port is released", async () => {
    const order: string[] = [];
    const t = await startTestDaemon({
      modules: [
        { name: "a", source: { name: "a", close: () => void order.push("a") } },
        { name: "b", source: { name: "b", close: async () => void order.push("b") } },
      ],
    });
    t.daemon.host.onClose(() => void order.push("onClose"));
    const token = await t.pair();
    assert.equal((await postJson(t.port, "/ui/pair", { code: "0".repeat(32) })).status, 401);
    await Promise.all([t.stop(), t.stop()]);
    await t.stop();
    assert.deepEqual(order, ["b", "a", "onClose"]);
    assert.equal(t.auth.authenticate(`Bearer ${token}`), undefined);
    await assert.rejects(send({ port: t.port, path: "/" }));
  });
  it("does not hang when a client holds a connection open", async () => {
    const t = await start();
    const idle = connect({ host: "127.0.0.1", port: t.port });
    await new Promise((resolve) => idle.once("connect", resolve));
    idle.write(`GET /ui/status HTTP/1.1\r\nHost: 127.0.0.1:${t.port}\r\n`);
    const started = Date.now();
    await t.stop();
    assert.ok(Date.now() - started < 4_000);
    idle.destroy();
  });
});
