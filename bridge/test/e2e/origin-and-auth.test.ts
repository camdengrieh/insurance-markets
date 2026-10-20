import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import { cspHeaderValue, securityHeaders } from "../../../app/headers.config.js";
import { UI_POST_PATHS } from "../../contract.js";
import { bearer, makeFixtureApp, startE2eDaemon, type E2eDaemon, type Reply } from "./harness.js";

// M1-1 (DNS rebinding), M1-2 (wrong Origin, missing token, no Set-Cookie) against the real daemon in its own
// process: real sockets, the real module set, the real security headers.

let daemon: E2eDaemon;
let appDir: string;
let token: string;

before(async () => {
  appDir = await makeFixtureApp();
  daemon = await startE2eDaemon({ appDir, hostile: false });
  await daemon.waitForLink(1);
  token = (await daemon.pair()).token;
});
after(async () => {
  await daemon.stop();
  await rm(appDir, { recursive: true, force: true });
});

function errorCode(reply: Reply): string | undefined {
  try {
    return (reply.json() as { error?: { code?: string } }).error?.code;
  } catch {
    return undefined;
  }
}

// A cross-section of what a rebinding page could ask for: the app, the API, the stream, the proxy, pairing.
const PATHS: readonly { readonly method: string; readonly path: string }[] = [
  { method: "GET", path: "/" },
  { method: "GET", path: "/app.js" },
  { method: "GET", path: "/ui/status" },
  { method: "GET", path: "/ui/events" },
  { method: "GET", path: "/ui/inbox" },
  { method: "GET", path: "/ui/read/xo_data/api/markets?marketType=2,4&statuses=ACTIVE&take=1&page=1" },
  { method: "POST", path: "/ui/pair" },
  { method: "POST", path: "/ui/kill" },
];

function ask(method: string, path: string, extra: { host?: string | null; headers?: Record<string, string> } = {}): Promise<Reply> {
  const headers = { ...(method === "POST" ? { "content-type": "application/json" } : {}), ...(extra.headers ?? {}) };
  return daemon.request({ method, path, headers, ...(extra.host === undefined ? {} : { host: extra.host }), ...(method === "POST" ? { body: "{}" } : {}) });
}

describe("M1-1: the Host header must be exactly 127.0.0.1:<port>", () => {
  const wrongHosts = (port: number): string[] => [
    "evil.example",
    `evil.example:${port}`,
    "127.0.0.1",
    `localhost:${port}`,
    `127.0.0.1:${port + 1}`,
    `127.0.0.1:${port}.evil.example`,
    `[::1]:${port}`,
    `127.0.0.1:${port},evil.example`,
    `0.0.0.0:${port}`,
    `127.1:${port}`,
    `2130706433:${port}`,
  ];

  it("answers 403 host_forbidden to every wrong Host on every kind of route, even with a valid token", async () => {
    for (const host of wrongHosts(daemon.port)) {
      for (const { method, path } of PATHS) {
        for (const withToken of [false, true]) {
          const reply = await ask(method, path, { host, headers: withToken ? bearer(token) : {} });
          assert.equal(reply.status, 403, `${method} ${path} Host: ${host} token=${String(withToken)} -> ${reply.status}`);
          assert.equal(errorCode(reply), "host_forbidden", `${method} ${path} Host: ${host}`);
        }
      }
    }
  });

  it("serves the same requests when the Host is right (the control for the loop above)", async () => {
    const page = await ask("GET", "/");
    assert.equal(page.status, 200);
    const status = await ask("GET", "/ui/inbox", { headers: bearer(token) });
    assert.notEqual(errorCode(status), "host_forbidden");
  });

  it("refuses a duplicated Host and a request with no Host over a raw socket", async () => {
    const dup = await daemon.raw(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${daemon.port}\r\nHost: evil.example\r\nConnection: close\r\n\r\n`);
    assert.match(dup, /^HTTP\/1\.1 (400|403) /);
    const none = await daemon.raw("GET / HTTP/1.1\r\nConnection: close\r\n\r\n");
    assert.doesNotMatch(none, /^HTTP\/1\.1 2\d\d /);
    const absolute = await daemon.raw(`GET http://evil.example/ HTTP/1.1\r\nHost: 127.0.0.1:${daemon.port}\r\nConnection: close\r\n\r\n`);
    assert.doesNotMatch(absolute, /^HTTP\/1\.1 2\d\d /);
  });
});

describe("M1-2: Origin, token and cookies", () => {
  const wrongOrigins = (port: number): string[] => [
    "http://evil.example",
    "https://evil.example",
    `http://127.0.0.1:${port + 1}`,
    `http://localhost:${port}`,
    `https://127.0.0.1:${port}`,
    "null",
    `http://127.0.0.1:${port}.evil.example`,
    `http://127.0.0.1:${port}/`,
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
  ];

  it("answers 403 origin_forbidden to every wrong Origin, with and without a token, on the app and the API", async () => {
    for (const origin of wrongOrigins(daemon.port)) {
      for (const { method, path } of PATHS) {
        for (const withToken of [false, true]) {
          const reply = await ask(method, path, { headers: { origin, ...(withToken ? bearer(token) : {}) } });
          assert.equal(reply.status, 403, `${method} ${path} Origin: ${origin} token=${String(withToken)} -> ${reply.status}`);
          assert.equal(errorCode(reply), "origin_forbidden", `${method} ${path} Origin: ${origin}`);
        }
      }
    }
  });

  it("accepts the daemon's own origin, and a request without an Origin (a non-browser client)", async () => {
    const own = await ask("GET", "/ui/inbox", { headers: { origin: daemon.origin, ...bearer(token) } });
    assert.equal(own.status, 200);
    const none = await ask("GET", "/ui/inbox", { headers: bearer(token) });
    assert.equal(none.status, 200);
  });

  it("refuses a cross-site fetch on API routes by Sec-Fetch-Site, even without an Origin header", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const reply = await ask("GET", "/ui/inbox", { headers: { "sec-fetch-site": site, ...bearer(token) } });
      assert.equal(reply.status, 403, site);
    }
  });

  it("answers 401 to a missing, malformed, unknown or tampered token on every token-protected route", async () => {
    const genuine = token;
    const flipped = `${genuine.slice(0, -1)}${genuine.endsWith("A") ? "B" : "A"}`;
    const bad = [undefined, "", "x", "Bearer", "cku_short", "cka_".padEnd(47, "a"), flipped, `${genuine}x`, genuine.replace("cku_", "cka_")];
    const routes: { method: string; path: string }[] = [
      { method: "GET", path: "/ui/status" },
      { method: "GET", path: "/ui/events" },
      { method: "GET", path: "/ui/inbox" },
      { method: "GET", path: "/ui/inbox/0123456789abcdef0123456789abcdef" },
      { method: "GET", path: "/ui/read/xo_data/api/markets" },
      { method: "POST", path: "/ui/read/xo_rpc/" },
      ...UI_POST_PATHS.filter((path) => path !== "/ui/pair").map((path) => ({ method: "POST", path })),
    ];
    for (const value of bad) {
      for (const { method, path } of routes) {
        const headers: Record<string, string> = value === undefined ? {} : { authorization: value.startsWith("Bearer") ? value : `Bearer ${value}` };
        const reply = await ask(method, path, { headers });
        assert.equal(reply.status, 401, `${method} ${path} with ${JSON.stringify(value)?.slice(0, 20)} -> ${reply.status}`);
      }
    }
    // A raw token without the Bearer scheme is also refused.
    assert.equal((await ask("GET", "/ui/inbox", { headers: { authorization: genuine } })).status, 401);
  });

  it("answers 405 to OPTIONS, PUT, PATCH and TRACE on the API, with no CORS headers", async () => {
    for (const method of ["OPTIONS", "PUT", "PATCH", "TRACE"]) {
      const reply = await daemon.request({ method, path: "/ui/inbox", headers: { origin: daemon.origin, "access-control-request-method": "GET", ...bearer(token) } });
      assert.equal(reply.status, 405, method);
    }
  });

  it("every response so far carries the cockpit security headers and no Set-Cookie, no Access-Control-*", () => {
    const expected = securityHeaders("cockpit");
    const sweep = daemon.log();
    assert.ok(sweep.length > 400, `the sweep is large (${sweep.length})`);
    for (const entry of sweep) {
      const headers = entry.reply.headers;
      const where = `${entry.method} ${entry.path} (${entry.reply.status})`;
      assert.equal(headers["set-cookie"], undefined, `Set-Cookie on ${where}`);
      assert.equal(headers["set-cookie2"], undefined, `Set-Cookie2 on ${where}`);
      for (const name of Object.keys(headers)) assert.ok(!name.startsWith("access-control-"), `${name} on ${where}`);
      for (const pair of expected) assert.equal(headers[pair.key.toLowerCase()], pair.value, `${pair.key} on ${where}`);
      assert.equal(headers["cache-control"], "no-store", `Cache-Control on ${where}`);
    }
  });

  it("serves the Content-Security-Policy of the cockpit build verbatim: connect-src 'self' and nothing else", async () => {
    const page = await ask("GET", "/");
    const csp = String(page.headers["content-security-policy"]);
    assert.equal(csp, cspHeaderValue("cockpit"));
    assert.match(csp, /connect-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /https?:/);
    assert.match(csp, /require-trusted-types-for 'script'/);
  });
});
