import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { gzipSync } from "node:zlib";

import { BRIDGE_USER_AGENT } from "../../contract.js";
import { createReadProxy, type ProxyOutcome, type ReadProxyOptions } from "../../proxy.js";

// The proxy with its real transport (the global fetch) against servers on 127.0.0.1. The allowlist is pointed at
// them by the `origins` option, which exists for exactly this and is not reachable from the wire. These tests
// check what a stubbed fetch cannot: the headers that really leave, the redirect handling of the real client,
// and that the size cap is counted on decoded bytes.

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

interface Target {
  readonly origin: string;
  readonly seen: Seen[];
  readonly server: Server;
}

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function listen(handler: (req: IncomingMessage, res: ServerResponse, seen: Seen) => void): Promise<Target> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const entry = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(entry);
      handler(req, res, entry);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen, server };
}

function proxyTo(target: Target | string, options: ReadProxyOptions = {}) {
  const origin = typeof target === "string" ? target : target.origin;
  return createReadProxy({ origins: { xo_orderbook: origin, rpc_base: origin, kalshi: origin }, enabled: ["kalshi"], ...options });
}

const GET = { service: "xo_orderbook", method: "GET", path: "/book", query: "token_id=123" };

function code(outcome: ProxyOutcome): string {
  return outcome.ok ? "ok" : outcome.failure.code;
}

describe("the real request", () => {
  it("carries exactly the fixed headers: no Origin, no Cookie, no Referer, no Authorization, the fixed User-Agent", async () => {
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("set-cookie", "sid=1; Path=/");
      res.end('{"ok":true}');
    });
    const proxy = proxyTo(target);
    for (let i = 0; i < 2; i += 1) assert.equal(code(await proxy.handle(GET)), "ok");
    assert.equal(target.seen.length, 2);
    for (const seen of target.seen) {
      assert.equal(seen.method, "GET");
      assert.equal(seen.url, "/book?token_id=123");
      assert.equal(seen.headers["user-agent"], BRIDGE_USER_AGENT);
      assert.equal(seen.headers["accept"], "application/json");
      for (const name of ["origin", "cookie", "referer", "authorization", "x-forwarded-for", "forwarded", "via", "proxy-authorization"]) {
        assert.equal(seen.headers[name], undefined, `${name} must not be sent`);
      }
      assert.equal(JSON.stringify(seen.headers).includes("sid=1"), false, "a cookie the venue set came back");
    }
  });

  it("sends a POST without an Origin either, with a JSON content type and the re-serialised body", async () => {
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end('{"jsonrpc":"2.0","id":1,"result":"0x2105"}');
    });
    const proxy = proxyTo(target);
    const body = new TextEncoder().encode('{ "jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": [] }');
    assert.equal(code(await proxy.handle({ service: "rpc_base", method: "POST", path: "/", query: "", body })), "ok");
    const seen = target.seen[0];
    assert.ok(seen);
    assert.equal(seen.method, "POST");
    assert.equal(seen.headers["origin"], undefined);
    assert.equal(seen.headers["content-type"], "application/json");
    assert.equal(seen.body, '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}');
  });
});

describe("redirects (M1-3)", () => {
  it("does not follow a 302: the second server is never contacted", async () => {
    const trap = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end('{"trap":true}');
    });
    const target = await listen((_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", `${trap.origin}/stolen`);
      res.end();
    });
    const proxy = proxyTo(target);
    assert.equal(code(await proxy.handle(GET)), "redirect_refused");
    assert.equal(target.seen.length, 1);
    assert.equal(trap.seen.length, 0);
  });

  it("refuses 301, 303, 307 and 308 the same way", async () => {
    for (const status of [301, 303, 307, 308]) {
      const trap = await listen((_req, res) => res.end("{}"));
      const target = await listen((_req, res) => {
        res.statusCode = status;
        res.setHeader("location", `${trap.origin}/x`);
        res.end();
      });
      assert.equal(code(await proxyTo(target).handle(GET)), "redirect_refused", String(status));
      assert.equal(trap.seen.length, 0);
    }
  });

  it("refuses a redirect on a POST too, without re-sending the body anywhere", async () => {
    const trap = await listen((_req, res) => res.end("{}"));
    const target = await listen((_req, res) => {
      res.statusCode = 307;
      res.setHeader("location", `${trap.origin}/x`);
      res.end();
    });
    const body = new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}');
    assert.equal(code(await proxyTo(target).handle({ service: "rpc_base", method: "POST", path: "/", query: "", body })), "redirect_refused");
    assert.equal(trap.seen.length, 0);
  });
});

describe("size and time with the real client", () => {
  it("refuses a body that streams past the cap with no Content-Length", async () => {
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.write('{"a":"');
      const timer = setInterval(() => res.write("x".repeat(400)), 5);
      res.on("close", () => clearInterval(timer));
    });
    assert.equal(code(await proxyTo(target, { maxResponseBytes: 2000 }).handle(GET)), "response_too_large");
  });

  it("refuses by Content-Length before reading", async () => {
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("content-length", "5000");
      res.write('{"a":"');
    });
    assert.equal(code(await proxyTo(target, { maxResponseBytes: 2000 }).handle(GET)), "response_too_large");
  });

  it("counts a compressed body on its decoded size (a small gzip cannot be a large body)", async () => {
    const bomb = gzipSync(Buffer.from(`{"a":"${"0".repeat(5_000_000)}"}`));
    assert.ok(bomb.length < 20_000, "the bomb must be small on the wire");
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("content-encoding", "gzip");
      res.end(bomb);
    });
    assert.equal(code(await proxyTo(target, { maxResponseBytes: 100_000 }).handle(GET)), "response_too_large");
  });

  it("accepts a compressed body whose decoded size is inside the cap", async () => {
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("content-encoding", "gzip");
      res.end(gzipSync(Buffer.from('{"ok":true}')));
    });
    const outcome = await proxyTo(target).handle(GET);
    assert.equal(outcome.ok && outcome.envelope.bytes, 11);
  });

  it("times out a server that accepts the connection and never answers", async () => {
    const target = await listen(() => undefined);
    assert.equal(code(await proxyTo(target, { timeoutMs: 100 }).handle(GET)), "upstream_timeout");
  });

  it("times out a body that starts and then stalls (the deadline covers reading it)", async () => {
    const target = await listen((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.write('{"a":');
    });
    assert.equal(code(await proxyTo(target, { timeoutMs: 150 }).handle(GET)), "upstream_timeout");
  });

  it("reports a refused connection as upstream_timeout (network) without quoting the error", async () => {
    const target = await listen((_req, res) => res.end("{}"));
    const origin = target.origin;
    await new Promise<void>((resolve) => target.server.close(() => resolve()));
    const outcome = await proxyTo(origin).handle(GET);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.equal(outcome.failure.code, "upstream_timeout");
      assert.equal(outcome.failure.details?.["reason"], "network");
      assert.doesNotMatch(JSON.stringify(outcome.failure), /ECONNREFUSED|127\.0\.0\.1/);
    }
  });

  it("returns a normal JSON answer, and a 404 with a JSON body as data", async () => {
    const target = await listen((_req, res) => {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end('{"error":"no such market"}');
    });
    const outcome = await proxyTo(target).handle(GET);
    assert.equal(outcome.ok && outcome.envelope.upstream_status, 404);
    assert.deepEqual(outcome.ok && outcome.envelope.body, { error: "no such market" });
  });
});
