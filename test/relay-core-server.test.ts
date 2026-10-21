import assert from "node:assert/strict";
import { connect } from "node:net";
import { after, describe, it } from "node:test";

import { CONTRACT_ROUTE_KEYS, errorResponseSchema } from "../src/relay/contract.js";
import { FLAG_NAMES } from "../src/relay/flags.js";
import { RelayError } from "../src/relay/errors.js";
import { ALL_FLAGS_OFF, type Flags } from "../src/relay/flags.js";
import { createMemoryAudit } from "../relay/audit.js";
import { RelayKeyring } from "../relay/auth.js";
import { CapabilityRegistry } from "../relay/capabilities.js";
import type { AccountDirectory } from "../relay/health.js";
import { openRelayStorage } from "../relay/store.js";
import { createUpstream, XO_UPSTREAM_HOSTS } from "../relay/upstream.js";
import { DEFAULT_HTTP, type RelayHttpConfig } from "../relay/config.js";
import { routes as healthRoutes } from "../relay/health.js";
import { READ_ROUTE_KEYS, startRelayServer, WRITE_ROUTE_KEYS, type RunningServer } from "../relay/server.js";
import type { RelayServices, RouteTable } from "../relay/types.js";
import { addr, deferred, FakeClock, hex32, jsonHeaders, pause, rawRequest, secret, tempDir, TEST_RELAY_KEY, TEST_RELAY_KEY_NEXT, type RawResponse } from "./relay-core-helpers.js";

// The HTTP server: loopback only, Host and Origin, the relay key with rotation, rate limits, body
// limits, strict validation, the kill switch on every write route, the 6 s answer-by budget, a
// correlation id, graceful shutdown.

interface HealthBody {
  readonly status: string;
  readonly kill: boolean;
  readonly time: string;
  readonly flags: Record<string, boolean>;
  readonly tripwires: { readonly ok: boolean; readonly tripped: unknown[] };
}

const OWNER = addr(0x11);
const closers: Array<() => Promise<void>> = [];
after(async () => {
  for (const close of closers) await close();
});

interface Rig {
  readonly server: RunningServer;
  readonly audit: ReturnType<typeof createMemoryAudit>;
  readonly clock: FakeClock;
  readonly flags: { current: Flags };
  call(path: string, options?: { method?: string; body?: unknown; key?: string | null; headers?: Record<string, string> }): Promise<RawResponse>;
}

const cancelOk = async (body: { order_hash: string }): Promise<{ order_hash: string; state: "cancelled" }> => ({ order_hash: body.order_hash, state: "cancelled" });

const BASE_ROUTES: RouteTable = {
  ...healthRoutes,
  "POST /v1/order/cancel": cancelOk,
  "POST /v1/orders/list": async () => ({ orders: [] }),
};

async function serve(options: {
  readonly routes?: RouteTable;
  readonly http?: Partial<RelayHttpConfig>;
  readonly next?: boolean;
  readonly services?: RelayServices;
  readonly flags?: Flags;
  readonly newRequestId?: () => string;
} = {}): Promise<Rig> {
  const clock = new FakeClock();
  const audit = createMemoryAudit(clock.now);
  const flags = { current: options.flags ?? ALL_FLAGS_OFF };
  const server = await startRelayServer({
    keyring: new RelayKeyring(secret(TEST_RELAY_KEY), options.next === true ? secret(TEST_RELAY_KEY_NEXT) : undefined),
    services: options.services ?? {},
    flags: () => flags.current,
    routes: options.routes ?? BASE_ROUTES,
    now: clock.now,
    port: 0,
    // Generous limits unless a test is about limits.
    http: {
      readRate: { capacity: 10_000, refillPerSecond: 10_000 },
      writeRate: { capacity: 10_000, refillPerSecond: 10_000 },
      authFailureRate: { capacity: 10_000, refillPerSecond: 10_000 },
      ...options.http,
    },
    audit,
    ...(options.newRequestId === undefined ? {} : { newRequestId: options.newRequestId }),
  });
  closers.push(() => server.close({ graceMs: 500 }));
  return {
    server,
    audit,
    clock,
    flags,
    call: (path, call = {}) =>
      rawRequest({
        port: server.port,
        method: call.method ?? (call.body === undefined ? "GET" : "POST"),
        path,
        headers: {
          ...(call.body === undefined ? {} : { "content-type": "application/json" }),
          ...(call.key === null ? {} : { "x-relay-key": call.key ?? TEST_RELAY_KEY }),
          ...call.headers,
        },
        ...(call.body === undefined ? {} : { body: typeof call.body === "string" ? call.body : JSON.stringify(call.body) }),
      }),
  };
}

function errorCode(response: RawResponse): string {
  const parsed = errorResponseSchema.safeParse(response.json);
  assert.ok(parsed.success, `not an error body: ${response.text}`);
  return parsed.data.error.code;
}

describe("binding", () => {
  it("listens on 127.0.0.1 and nowhere else", async () => {
    const rig = await serve();
    assert.equal(rig.server.host, "127.0.0.1");
    assert.equal(rig.server.origin, `http://127.0.0.1:${rig.server.port}`);
    assert.ok(rig.server.port > 0);
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: rig.server.port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", reject);
    });
    // The IPv6 loopback is not served.
    await new Promise<void>((resolve) => {
      const socket = connect({ host: "::1", port: rig.server.port });
      socket.on("connect", () => {
        socket.destroy();
        assert.fail("the relay answered on ::1");
      });
      socket.on("error", () => resolve());
    });
  });

  it("picks a different free port each time when asked for 0", async () => {
    const a = await serve();
    const b = await serve();
    assert.notEqual(a.server.port, b.server.port);
  });
});

describe("the relay key", () => {
  it("answers 401 unauthorized when the key is missing, wrong, or sent the wrong way", async () => {
    const rig = await serve();
    for (const response of [
      await rig.call("/v1/health", { key: null }),
      await rig.call("/v1/health", { key: "wrong-key-wrong-key-wrong" }),
      await rig.call("/v1/health", { key: "" }),
      await rig.call(`/v1/health`, { key: null, headers: { authorization: `Bearer ${TEST_RELAY_KEY}` } }),
      await rig.call(`/v1/health`, { key: null, headers: { "x-relay-key-next": TEST_RELAY_KEY } }),
      await rig.call("/v1/health", { key: TEST_RELAY_KEY.slice(0, -1) }),
      await rig.call("/v1/health", { key: `${TEST_RELAY_KEY}x` }),
      await rig.call("/v1/health", { key: TEST_RELAY_KEY.toUpperCase() }),
    ]) {
      assert.equal(response.status, 401, response.text);
      assert.equal(errorCode(response), "unauthorized");
    }
  });

  it("does not take the key from the query string", async () => {
    const rig = await serve();
    const response = await rig.call(`/v1/health?key=${TEST_RELAY_KEY}`, { key: null });
    assert.equal(response.status, 401);
  });

  it("accepts the current key, and during a rotation the next one too; after the rotation only the new one", async () => {
    const rotating = await serve({ next: true });
    assert.equal((await rotating.call("/v1/health", { key: TEST_RELAY_KEY })).status, 200);
    assert.equal((await rotating.call("/v1/health", { key: TEST_RELAY_KEY_NEXT })).status, 200);
    assert.equal((await rotating.call("/v1/health", { key: "third-key-third-key-third" })).status, 401);
    const single = await serve();
    assert.equal((await single.call("/v1/health", { key: TEST_RELAY_KEY_NEXT })).status, 401, "the next key means nothing outside a rotation");
  });

  it("tells an unauthenticated caller nothing about routes: unknown paths are 401 too", async () => {
    const rig = await serve();
    assert.equal((await rig.call("/v1/does-not-exist", { key: null })).status, 401);
    assert.equal((await rig.call("/v1/order/prepare", { key: null, method: "GET" })).status, 401);
  });

  it("locks an address out after repeated wrong keys, even for the right key, until the window passes", async () => {
    const rig = await serve({ http: { authFailureRate: { capacity: 3, refillPerSecond: 1 / 60 } } });
    for (let index = 0; index < 3; index += 1) assert.equal((await rig.call("/v1/health", { key: "wrong-key-wrong-key-wrong" })).status, 401);
    const locked = await rig.call("/v1/health");
    assert.equal(locked.status, 429);
    assert.equal(errorCode(locked), "rate_limited");
    assert.ok(Number(locked.headers["retry-after"]) >= 1);
    rig.clock.advance(61_000);
    assert.equal((await rig.call("/v1/health")).status, 200);
  });

  it("does not let successful calls use up the failure allowance", async () => {
    const rig = await serve({ http: { authFailureRate: { capacity: 2, refillPerSecond: 1 / 3600 } } });
    for (let index = 0; index < 10; index += 1) assert.equal((await rig.call("/v1/health")).status, 200);
  });
});

describe("Host and Origin", () => {
  it("accepts the bound address and localhost on the bound port", async () => {
    const rig = await serve();
    for (const host of [`127.0.0.1:${rig.server.port}`, `localhost:${rig.server.port}`, `LOCALHOST:${rig.server.port}`]) {
      const response = await rawRequest({ port: rig.server.port, headers: { host, "x-relay-key": TEST_RELAY_KEY } });
      assert.equal(response.status, 200, host);
    }
  });

  it("refuses any other Host, even with the right key (DNS rebinding)", async () => {
    const rig = await serve();
    for (const host of ["evil.example", `evil.example:${rig.server.port}`, "127.0.0.1", `127.0.0.1:${rig.server.port + 1}`, `127.0.0.1.evil.example:${rig.server.port}`, `[::1]:${rig.server.port}`, "0.0.0.0:80"]) {
      const response = await rawRequest({ port: rig.server.port, headers: { host, "x-relay-key": TEST_RELAY_KEY } });
      assert.equal(response.status, 401, `Host "${host}": ${response.text}`);
      assert.equal(errorCode(response), "unauthorized");
    }
  });

  it("refuses a request that has no Host header at all", async () => {
    const rig = await serve();
    const text = await new Promise<string>((resolve, reject) => {
      const socket = connect({ host: "127.0.0.1", port: rig.server.port });
      let data = "";
      socket.on("data", (chunk) => (data += chunk.toString("utf8")));
      socket.on("close", () => resolve(data));
      socket.on("error", reject);
      socket.write(`GET /v1/health HTTP/1.1\r\nx-relay-key: ${TEST_RELAY_KEY}\r\nconnection: close\r\n\r\n`);
    });
    assert.match(text, /^HTTP\/1\.1 (401|400) /);
    assert.equal(text.includes('"status":"ok"'), false);
  });

  it("refuses a request with a foreign, null or malformed Origin, and a cross-site fetch", async () => {
    const rig = await serve();
    const port = rig.server.port;
    for (const origin of ["http://evil.example", "null", `http://127.0.0.1:${port + 1}`, `https://127.0.0.1:${port}`, `http://evil.example:${port}`, `http://127.0.0.1:${port}.evil.example`]) {
      const response = await rawRequest({ port, headers: { origin, "x-relay-key": TEST_RELAY_KEY } });
      assert.equal(response.status, 401, origin);
    }
    for (const site of ["cross-site", "same-site"]) {
      const response = await rawRequest({ port, headers: { "sec-fetch-site": site, "x-relay-key": TEST_RELAY_KEY } });
      assert.equal(response.status, 401, site);
    }
  });

  it("accepts the relay's own origin and a plain client with no Origin", async () => {
    const rig = await serve();
    const port = rig.server.port;
    assert.equal((await rawRequest({ port, headers: { origin: `http://127.0.0.1:${port}`, "x-relay-key": TEST_RELAY_KEY } })).status, 200);
    assert.equal((await rawRequest({ port, headers: { "sec-fetch-site": "same-origin", "x-relay-key": TEST_RELAY_KEY } })).status, 200);
    assert.equal((await rawRequest({ port, headers: { "x-relay-key": TEST_RELAY_KEY } })).status, 200);
  });

  it("never sends a CORS header, and a preflight gets no permission", async () => {
    const rig = await serve();
    const responses = [
      await rig.call("/v1/health"),
      await rig.call("/v1/health", { key: null }),
      await rig.call("/v1/health", { method: "OPTIONS" }),
      await rig.call("/v1/nothing"),
      await rawRequest({ port: rig.server.port, method: "OPTIONS", headers: { origin: "http://evil.example", "access-control-request-method": "POST" } }),
    ];
    for (const response of responses) {
      assert.deepEqual(Object.keys(response.headers).filter((name) => name.startsWith("access-control-")), []);
    }
    assert.notEqual(responses[2]?.status, 200);
    assert.equal(responses[4]?.status, 401);
  });
});

describe("routing and validation", () => {
  it("says not_found for an unknown path and 405 for the wrong method, with an Allow header", async () => {
    const rig = await serve();
    const unknown = await rig.call("/v1/withdraw-everything");
    assert.equal(unknown.status, 404);
    assert.equal(errorCode(unknown), "not_found");
    const wrongGet = await rig.call("/v1/orders/list");
    assert.equal(wrongGet.status, 405);
    assert.equal(wrongGet.headers["allow"], "POST");
    assert.equal(errorCode(wrongGet), "invalid_request");
    const wrongPost = await rig.call("/v1/health", { method: "POST", body: {} });
    assert.equal(wrongPost.status, 405);
    assert.equal(wrongPost.headers["allow"], "GET");
    for (const method of ["PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const response = await rig.call("/v1/health", { method });
      assert.equal(response.status, 405, method);
    }
  });

  it("refuses a query string, traversal, double slashes and odd characters in the path", async () => {
    const rig = await serve();
    for (const path of ["/v1/health?x=1", "/v1/health?", "/v1/../v1/health", "/v1//health", "/v1/health#frag", "//v1/health", "/v1/health%2f..", "/v1/%2e%2e/v1/health"]) {
      const response = await rawRequest({ port: rig.server.port, path, headers: { "x-relay-key": TEST_RELAY_KEY } });
      assert.ok([400, 404].includes(response.status), `${path}: ${response.status}`);
      assert.notEqual(response.status, 200, path);
    }
    assert.equal((await rig.call("/v1/health/")).status, 200, "a trailing slash is tolerated");
  });

  it("requires JSON for a POST, and accepts the charset parameter", async () => {
    const rig = await serve();
    const body = JSON.stringify({ owner: OWNER, order_hash: hex32(1) });
    const post = (headers: Record<string, string>) =>
      rawRequest({ port: rig.server.port, method: "POST", path: "/v1/order/cancel", headers: { "x-relay-key": TEST_RELAY_KEY, ...headers }, body });
    assert.equal((await post({})).status, 415);
    assert.equal((await post({ "content-type": "text/plain" })).status, 415);
    assert.equal((await post({ "content-type": "application/x-www-form-urlencoded" })).status, 415);
    assert.equal((await post({ "content-type": "application/jsonx" })).status, 415);
    assert.equal((await post({ "content-type": "application/json" })).status, 200);
    assert.equal((await post({ "content-type": "application/json; charset=utf-8" })).status, 200);
    assert.equal((await post({ "content-type": "Application/JSON;charset=UTF-8" })).status, 200);
    assert.equal(errorCode(await post({})), "invalid_request");
  });

  it("rejects malformed JSON, unknown fields, wrong types and prototype tricks with invalid_request, naming only the fields", async () => {
    const rig = await serve();
    const send = (body: string) => rig.call("/v1/order/cancel", { method: "POST", body });
    for (const body of ["{", "", "null", "[]", "\"text\"", "123", '{"owner":"0x11","order_hash":"nope"}', JSON.stringify({ owner: OWNER, order_hash: hex32(1), extra: 1 }), `{"owner":"${OWNER}","order_hash":"${hex32(1)}","__proto__":{"x":1}}`, JSON.stringify({ owner: 5, order_hash: hex32(1) })]) {
      const response = await send(body);
      assert.equal(response.status, 400, body);
      assert.equal(errorCode(response), "invalid_request");
    }
    const bad = await send(JSON.stringify({ owner: "0x123", order_hash: hex32(1), "weird<key>": 1 }));
    const fields = (bad.json as { error: { details: { fields: string[] } } }).error.details.fields;
    assert.ok(fields.every((field) => /^[A-Za-z0-9_.()-]+$/.test(field)), fields.join(","));
    assert.equal(bad.text.includes("<"), false);
  });

  it("validates GET path parameters against the contract", async () => {
    const seen: string[] = [];
    const rig = await serve({
      routes: {
        "GET /v1/order/:hash": async (params) => {
          seen.push(params.hash);
          return { order_hash: params.hash, state: "open" };
        },
      },
    });
    assert.equal((await rig.call(`/v1/order/${hex32(7)}`)).status, 200);
    assert.deepEqual(seen, [hex32(7)]);
    for (const hash of ["0x12", "nothex", `${hex32(7)}00`, "0xZZ" + "0".repeat(62)]) {
      assert.equal((await rig.call(`/v1/order/${hash}`)).status, 400, hash);
    }
    assert.equal(seen.length, 1);
  });

  it("answers not_implemented (501) for a contract route that has no handler yet", async () => {
    const rig = await serve({ routes: {} });
    const response = await rig.call("/v1/userop/submit", { method: "POST", body: { prepared_id: "0".repeat(32), signature: `0x${"11".repeat(65)}` } });
    assert.equal(response.status, 501);
    assert.equal(errorCode(response), "not_implemented");
  });
});

describe("limits on what a client can send", () => {
  it("refuses a body over the size cap with 413, whether declared or streamed", async () => {
    const rig = await serve();
    const big = "x".repeat(DEFAULT_HTTP.bodyLimitBytes + 100);
    const streamed = await rig.call("/v1/order/cancel", { method: "POST", body: JSON.stringify({ pad: big }) });
    assert.equal(streamed.status, 413);
    assert.equal(errorCode(streamed), "invalid_request");
    const declared = await rawRequest({
      port: rig.server.port,
      method: "POST",
      path: "/v1/order/cancel",
      headers: jsonHeaders(TEST_RELAY_KEY, { "content-length": "99999999" }),
      body: "{}",
    }).catch((error: unknown) => ({ status: 0, text: String(error) }));
    assert.ok([413, 0].includes(declared.status), `declared length: ${declared.status}`);
  });

  it("accepts a body just under the cap", async () => {
    const rig = await serve({ http: { bodyLimitBytes: 300 } });
    const ok = JSON.stringify({ owner: OWNER, order_hash: hex32(1) });
    assert.ok(ok.length < 300);
    assert.equal((await rig.call("/v1/order/cancel", { method: "POST", body: ok })).status, 200);
    assert.equal((await rig.call("/v1/order/cancel", { method: "POST", body: ok + " ".repeat(300) })).status, 413);
  });

  it("rate limits each endpoint on its own, with Retry-After, and recovers with time", async () => {
    const rig = await serve({ http: { readRate: { capacity: 3, refillPerSecond: 1 }, writeRate: { capacity: 2, refillPerSecond: 1 } } });
    for (let index = 0; index < 3; index += 1) assert.equal((await rig.call("/v1/health")).status, 200);
    const limited = await rig.call("/v1/health");
    assert.equal(limited.status, 429);
    assert.equal(errorCode(limited), "rate_limited");
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    // Another endpoint has its own bucket.
    assert.equal((await rig.call("/v1/orders/list", { method: "POST", body: { owner: OWNER } })).status, 200);
    // Writes have theirs.
    const cancel = (): Promise<RawResponse> => rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.equal((await cancel()).status, 200);
    assert.equal((await cancel()).status, 200);
    assert.equal((await cancel()).status, 429);
    rig.clock.advance(2000);
    assert.equal((await cancel()).status, 200);
    assert.equal((await rig.call("/v1/health")).status, 200);
  });
});

describe("the kill switch", () => {
  it("partitions the contract: every route is either a read route or a write route, never both", () => {
    const reads = new Set<string>(READ_ROUTE_KEYS);
    const writes = new Set<string>(WRITE_ROUTE_KEYS);
    for (const key of CONTRACT_ROUTE_KEYS) assert.ok(reads.has(key) !== writes.has(key), `${key} must be in exactly one list`);
    assert.equal(reads.size + writes.size, CONTRACT_ROUTE_KEYS.length);
    for (const key of ["POST /v1/userop/prepare", "POST /v1/userop/submit", "POST /v1/auth/prepare", "POST /v1/auth/submit", "POST /v1/order/prepare", "POST /v1/order/submit", "POST /v1/order/cancel", "POST /v1/funding/check", "POST /v1/funding/report"]) {
      assert.ok(writes.has(key), `${key} is a write route`);
    }
  });

  it("refuses every write route with kill_switch (503) while reads still work", async () => {
    const rig = await serve({ flags: { ...ALL_FLAGS_OFF, KILL: true } });
    for (const key of WRITE_ROUTE_KEYS) {
      const [method, path] = key.split(" ") as [string, string];
      // The body is deliberately empty: the kill switch answers before anything else is looked at.
      const response = await rig.call(path.replace(":hash", hex32(1)), method === "POST" ? { method, body: {} } : { method });
      assert.equal(response.status, 503, key);
      assert.equal(errorCode(response), "kill_switch", key);
    }
    const health = await rig.call("/v1/health");
    assert.equal(health.status, 200);
    assert.equal((health.json as { status: string }).status, "kill_switch");
    assert.equal((health.json as { kill: boolean }).kill, true);
    assert.equal((await rig.call("/v1/orders/list", { method: "POST", body: { owner: OWNER } })).status, 200);
  });

  it("takes effect between two requests when the flag changes while the relay runs", async () => {
    const rig = await serve();
    const cancel = (): Promise<RawResponse> => rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.equal((await cancel()).status, 200);
    rig.flags.current = { ...ALL_FLAGS_OFF, KILL: true };
    assert.equal(errorCode(await cancel()), "kill_switch");
    rig.flags.current = ALL_FLAGS_OFF;
    assert.equal((await cancel()).status, 200);
  });

  it("treats a malformed flags object as kill switch ON", async () => {
    const rig = await serve();
    rig.flags.current = {} as Flags;
    assert.equal(errorCode(await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } })), "kill_switch");
  });

  it("is checked after the key, so an unauthenticated caller cannot read the switch", async () => {
    const rig = await serve({ flags: { ...ALL_FLAGS_OFF, KILL: true } });
    assert.equal(errorCode(await rig.call("/v1/order/cancel", { method: "POST", body: {}, key: null })), "unauthorized");
  });
});

describe("handlers", () => {
  it("returns the handler's answer after checking it against the contract", async () => {
    const rig = await serve();
    const response = await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(9) } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { order_hash: hex32(9), state: "cancelled" });
    assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  });

  it("turns a RelayError into its code and status, and nothing else about it", async () => {
    const rig = await serve({
      routes: {
        "POST /v1/order/cancel": async () => {
          throw new RelayError("cap_exceeded", "Over the daily cap.", { limit_usd: "50", reasons: ["daily"] });
        },
      },
    });
    const response = await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.equal(response.status, 422);
    assert.deepEqual(response.json, { error: { code: "cap_exceeded", message: "Over the daily cap.", details: { limit_usd: "50", reasons: ["daily"] } } });
  });

  it("hides the message of any other exception behind a fixed internal error", async () => {
    const rig = await serve({
      routes: {
        "POST /v1/order/cancel": async () => {
          throw new Error("SECRET-TOKEN-in-an-upstream-body https://rpc.example/key123");
        },
      },
    });
    const response = await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.equal(response.status, 500);
    assert.equal(errorCode(response), "internal");
    assert.equal(response.text.includes("SECRET-TOKEN"), false);
    assert.equal(rig.audit.lines.join("\n").includes("SECRET-TOKEN"), false);
  });

  it("refuses to send an answer that does not match the contract", async () => {
    const rig = await serve({
      routes: { "POST /v1/order/cancel": (async () => ({ order_hash: hex32(1), state: "cancelled", extra_secret: "LEAK" })) as never },
    });
    const response = await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.equal(response.status, 500);
    assert.equal(errorCode(response), "internal");
    assert.equal(response.text.includes("LEAK"), false);
    const wrongState = await serve({ routes: { "POST /v1/order/cancel": (async () => ({ order_hash: hex32(1), state: "banana" })) as never } });
    assert.equal((await wrongState.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } })).status, 500);
  });

  it("gives each handler a context with the clock, the services and a request id that matches the response header", async () => {
    let seen: { requestId: string; now: number; hasServices: boolean } | undefined;
    const services: RelayServices = { audit: createMemoryAudit() };
    const rig = await serve({
      services,
      newRequestId: (() => {
        let n = 0;
        return () => `req_test_${++n}`;
      })(),
      routes: {
        "POST /v1/orders/list": async (_body, context) => {
          seen = { requestId: context.requestId, now: context.now(), hasServices: context.services === services };
          return { orders: [] };
        },
      },
    });
    const response = await rig.call("/v1/orders/list", { method: "POST", body: { owner: OWNER } });
    assert.equal(response.headers["x-request-id"], "req_test_1");
    assert.deepEqual(seen, { requestId: "req_test_1", now: rig.clock.now(), hasServices: true });
    const second = await rig.call("/v1/orders/list", { method: "POST", body: { owner: OWNER } });
    assert.equal(second.headers["x-request-id"], "req_test_2");
  });

  it("gives every response a correlation id of the documented form, also on errors, and logs it", async () => {
    const rig = await serve();
    const ids = new Set<string>();
    for (const response of [await rig.call("/v1/health"), await rig.call("/v1/health", { key: null }), await rig.call("/v1/nope"), await rig.call("/v1/order/cancel", { method: "POST", body: {} })]) {
      const id = response.headers["x-request-id"] as string;
      assert.match(id, /^req_[0-9a-f]{12}$/);
      ids.add(id);
    }
    assert.equal(ids.size, 4);
    await pause(10);
    const log = rig.audit.lines.join("\n");
    for (const id of ids) assert.ok(log.includes(id), `${id} is in the audit log`);
  });

  it("logs routes, statuses and codes, never bodies or keys", async () => {
    const rig = await serve();
    await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1), padding: "BODY-CANARY" } });
    await rig.call("/v1/health", { key: "wrong-key-CANARY-wrong-key" });
    await pause(10);
    const log = rig.audit.lines.join("\n");
    assert.ok(log.includes('"route":"POST /v1/order/cancel"'));
    assert.ok(log.includes('"ev":"auth_failure"'));
    for (const canary of ["BODY-CANARY", "wrong-key-CANARY", TEST_RELAY_KEY]) assert.equal(log.includes(canary), false, canary);
  });

  it("aborts the handler's signal when the client goes away", async () => {
    const started = deferred();
    const aborted = deferred<boolean>();
    const rig = await serve({
      routes: {
        "POST /v1/orders/list": async (_body, context) => {
          started.resolve();
          context.signal.addEventListener("abort", () => aborted.resolve(true), { once: true });
          await new Promise((resolve) => setTimeout(resolve, 3000).unref());
          return { orders: [] };
        },
      },
    });
    const socket = connect({ host: "127.0.0.1", port: rig.server.port });
    const body = JSON.stringify({ owner: OWNER });
    socket.write(`POST /v1/orders/list HTTP/1.1\r\nhost: 127.0.0.1:${rig.server.port}\r\nx-relay-key: ${TEST_RELAY_KEY}\r\ncontent-type: application/json\r\ncontent-length: ${body.length}\r\n\r\n${body}`);
    await started.promise;
    socket.destroy();
    assert.equal(await Promise.race([aborted.promise, pause(2000).then(() => false)]), true);
  });
});

describe("the answer-by budget", () => {
  it("answers `pending` (202) when a handler is still running at the budget, and lets the handler finish", async () => {
    const release = deferred();
    const finished = deferred();
    const rig = await serve({
      http: { requestBudgetMs: 40 },
      routes: {
        "POST /v1/order/cancel": async (body) => {
          await release.promise;
          finished.resolve();
          return { order_hash: body.order_hash, state: "cancelled" };
        },
      },
    });
    const began = performance.now();
    const response = await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.ok(performance.now() - began < 1500, "the answer did not wait for the handler");
    assert.equal(response.status, 202);
    assert.equal(errorCode(response), "pending");
    assert.equal(rig.server.inflight() >= 1, true);
    release.resolve();
    await finished.promise;
    await pause(30);
    assert.equal(rig.server.inflight(), 0);
    assert.ok(rig.audit.lines.some((line) => line.includes('"state":"completed_late"')), "the late result is audited");
  });

  it("does not answer pending when the handler is quick, and the default budget is 6 seconds", async () => {
    assert.equal(DEFAULT_HTTP.requestBudgetMs, 6000);
    const rig = await serve({ http: { requestBudgetMs: 2000 } });
    assert.equal((await rig.call("/v1/orders/list", { method: "POST", body: { owner: OWNER } })).status, 200);
  });

  it("records a late failure without a second response", async () => {
    const release = deferred();
    const rig = await serve({
      http: { requestBudgetMs: 30 },
      routes: {
        "POST /v1/order/cancel": async () => {
          await release.promise;
          throw new RelayError("upstream_rejected", "The upstream host refused.");
        },
      },
    });
    const response = await rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    assert.equal(response.status, 202);
    release.resolve();
    await pause(50);
    assert.ok(rig.audit.lines.some((line) => line.includes('"code":"upstream_rejected"') && line.includes("completed_late")));
  });
});

describe("shutdown", () => {
  it("lets a running request finish, then stops listening", async () => {
    const started = deferred();
    const release = deferred();
    const rig = await serve({
      routes: {
        "POST /v1/order/cancel": async (body) => {
          started.resolve();
          await release.promise;
          return { order_hash: body.order_hash, state: "cancelled" };
        },
      },
    });
    const pending = rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } });
    await started.promise;
    const closing = rig.server.close({ graceMs: 5000 });
    await pause(20);
    release.resolve();
    const response = await pending;
    assert.equal(response.status, 200);
    await closing;
    await new Promise<void>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port: rig.server.port });
      socket.on("connect", () => {
        socket.destroy();
        assert.fail("still listening after close");
      });
      socket.on("error", () => resolve());
    });
  });

  it("gives up on a stuck handler after the grace period", async () => {
    const started = deferred();
    const rig = await serve({
      routes: {
        "POST /v1/order/cancel": async () => {
          started.resolve();
          await new Promise(() => undefined);
          return { order_hash: hex32(1), state: "cancelled" as const };
        },
      },
    });
    const request = rig.call("/v1/order/cancel", { method: "POST", body: { owner: OWNER, order_hash: hex32(1) } }).catch(() => undefined);
    await started.promise;
    const began = performance.now();
    await rig.server.close({ graceMs: 100 });
    assert.ok(performance.now() - began < 3000);
    await request;
  });

  it("can be closed twice", async () => {
    const rig = await serve();
    await rig.server.close({ graceMs: 100 });
    await rig.server.close({ graceMs: 100 });
  });
});

describe("the health route", () => {
  it("reports ok, the flags, no tripwires and no upstream state, and validates against the contract", async () => {
    const rig = await serve();
    const response = await rig.call("/v1/health");
    assert.equal(response.status, 200);
    const body = response.json as HealthBody;
    assert.equal(body.status, "ok");
    assert.equal(body.kill, false);
    assert.deepEqual(body.tripwires, { ok: true, tripped: [] });
    assert.deepEqual(Object.keys(body.flags).sort(), Object.keys(ALL_FLAGS_OFF).sort());
    assert.equal(Object.values(body.flags).some(Boolean), false);
    assert.match(body.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("holds no secret", async () => {
    const rig = await serve({ next: true });
    const response = await rig.call("/v1/health");
    for (const canary of [TEST_RELAY_KEY, TEST_RELAY_KEY_NEXT]) assert.equal(response.text.includes(canary), false);
  });
});

describe("POST /v1/account/status", () => {
  const DERIVED = addr(0x77);
  const directory = (over: Partial<Awaited<ReturnType<AccountDirectory["read"]>>> = {}): AccountDirectory => ({
    derive: () => DERIVED,
    read: async () => ({ state: "registered", registered: true, trading_enabled: "yes", balance_usd: "12.5", ...over }),
  });

  async function statusRig(options: { accounts?: AccountDirectory; withStore?: boolean } = {}) {
    const made = await tempDir();
    const storage = await openRelayStorage({ dir: made.dir });
    closers.push(async () => {
      await storage.close();
      await made.cleanup();
    });
    const capabilities = await CapabilityRegistry.open({ store: storage.state });
    const upstream = createUpstream({ hosts: XO_UPSTREAM_HOSTS, fetch: (async () => new Response("{}")) as unknown as typeof fetch });
    const services: RelayServices = { state: storage.state, capabilities, upstream, ...(options.accounts === undefined ? {} : { accounts: options.accounts }) };
    const rig = await serve({ routes: healthRoutes, services });
    return { rig, storage, capabilities };
  }

  it("answers with the account derived from the owner, its state, the credentials, flags, tripwires, facts and upstream counters", async () => {
    const { rig, storage, capabilities } = await statusRig({ accounts: directory() });
    await storage.state.set("credential_status", DERIVED, { state: "validated", key_tag: "ab12cd34" });
    await capabilities.record({ id: "AD5", state: "yes", source: "probe" });
    const response = await rig.call("/v1/account/status", { method: "POST", body: { owner: OWNER } });
    assert.equal(response.status, 200, response.text);
    const body = response.json as Record<string, unknown> & { capabilities: Record<string, string>; upstream: Record<string, unknown>; credentials: unknown; flags: Record<string, boolean> };
    assert.equal(body["account"], DERIVED);
    assert.equal(body["state"], "registered");
    assert.equal(body["registered"], true);
    assert.equal(body["trading_enabled"], "yes");
    assert.equal(body["balance_usd"], "12.5");
    assert.deepEqual(body.credentials, { state: "validated", key_tag: "ab12cd34" });
    assert.equal(body.capabilities["AD5"], "yes");
    assert.equal(body.capabilities["UO7"], "unknown");
    assert.ok("orderbooks.xo.market" in body.upstream);
    assert.equal(Object.keys(body.flags).length, FLAG_NAMES.length);
    assert.deepEqual(body["tripwires"], { ok: true, tripped: [] });
  });

  it("answers account_mismatch when the caller names a different account, and accepts the same one in any letter case", async () => {
    const { rig } = await statusRig({ accounts: directory() });
    const wrong = await rig.call("/v1/account/status", { method: "POST", body: { owner: OWNER, account: addr(0x78) } });
    assert.equal(wrong.status, 403);
    assert.equal(errorCode(wrong), "account_mismatch");
    const same = await rig.call("/v1/account/status", { method: "POST", body: { owner: OWNER, account: DERIVED } });
    assert.equal(same.status, 200);
  });

  it("reads a missing or malformed credential record as `none`, and passes null balances and unknown trading through", async () => {
    const { rig, storage } = await statusRig({ accounts: directory({ balance_usd: null, trading_enabled: "unknown", state: "undeployed", registered: false }) });
    const none = (await rig.call("/v1/account/status", { method: "POST", body: { owner: OWNER } })).json as { credentials: unknown; balance_usd: unknown; trading_enabled: string; state: string };
    assert.deepEqual(none.credentials, { state: "none", key_tag: null });
    assert.equal(none.balance_usd, null);
    assert.equal(none.trading_enabled, "unknown");
    assert.equal(none.state, "undeployed");
    await storage.state.set("credential_status", DERIVED, { state: "bogus", key_tag: "has space and \u202e" });
    const bad = (await rig.call("/v1/account/status", { method: "POST", body: { owner: OWNER } })).json as { credentials: unknown };
    assert.deepEqual(bad.credentials, { state: "none", key_tag: null });
  });

  it("says not_implemented until an account directory is wired in, and rejects a bad owner", async () => {
    const { rig } = await statusRig();
    const response = await rig.call("/v1/account/status", { method: "POST", body: { owner: OWNER } });
    assert.equal(response.status, 501);
    assert.equal(errorCode(response), "not_implemented");
    const bad = await statusRig({ accounts: directory() });
    assert.equal((await bad.rig.call("/v1/account/status", { method: "POST", body: { owner: "0x0000000000000000000000000000000000000000" } })).status, 400);
    assert.equal((await bad.rig.call("/v1/account/status", { method: "POST", body: { owner: "nope" } })).status, 400);
  });
});
