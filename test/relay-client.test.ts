import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it as nodeIt, mock, type TestOptions } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";

import { privateKeyToAccount } from "viem/accounts";

import { Secret, loadConfig } from "../src/config.js";
import { RELAY_CLIENT_LIMITS, createRelayClient, createRelayClientFromConfig, effectiveTimeoutMs } from "../src/relay/client.js";
import {
  POST_ROUTES,
  RELAY_CLIENT_TIMEOUT_MS,
  RELAY_KEY_HEADER,
  RELAY_USER_AGENT,
  digestTag,
  orderStatusPath,
  userOpStatusPath,
  type PostPath,
  type RelayClient,
  type RelayFailure,
  type RelayResult,
} from "../src/relay/contract.js";
import { ERROR_CODES, ERROR_HTTP_STATUS, type ErrorCode } from "../src/relay/errors.js";
import { ALL_FLAGS_OFF } from "../src/relay/flags.js";

// Everything here runs against a node:http stub bound to 127.0.0.1 on a port the OS picks, or
// against an injected fetch. Nothing leaves the machine. The relay key is a made-up test value,
// and the owner and account addresses are derived from public Anvil test keys (never typed).

// Every test gets a deadline, so a regression in the client's own timeout shows up as a failing
// test and not as a hung run. A test may still pass its own options.
function it(name: string, optionsOrBody: TestOptions | (() => void | Promise<void>), body?: () => void | Promise<void>): void {
  if (typeof optionsOrBody === "function") nodeIt(name, { timeout: 20_000 }, optionsOrBody);
  else nodeIt(name, { timeout: 20_000, ...optionsOrBody }, body);
}

const TEST_KEY = "test-only-relay-key-0123456789abcdef";
const SECRET = new Secret(TEST_KEY);
const OWNER = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80").address;
const ACCOUNT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d").address;
const OTHER_OWNER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a").address;
const NO_PORT = "http://127.0.0.1:9"; // never contacted: used with an injected fetch only

const h = (byte: string): `0x${string}` => `0x${byte.repeat(32)}`;
const PREPARED_ID = "0123456789abcdef0123456789abcdef";
const NOW_ISO = "2026-10-19T12:00:00Z";
const LATER_ISO = "2026-10-19T12:05:00Z";

function statusFixture(): Record<string, unknown> {
  return {
    account: ACCOUNT,
    state: "registered",
    registered: true,
    trading_enabled: "unknown",
    balance_usd: "1.25",
    credentials: { state: "stored", key_tag: "k-1a2b" },
    flags: { ...ALL_FLAGS_OFF },
    tripwires: { ok: true, tripped: [] },
    capabilities: { AD5: "yes" },
    upstream: { "orderbooks.xo.market": { state: "ok", errors: 0, last_error_at: null } },
  };
}

function preparedFixture(owner: string = OWNER): Record<string, unknown> {
  return {
    prepared_id: PREPARED_ID,
    kind: "userop",
    owner,
    account: ACCOUNT,
    expires_at: LATER_ISO,
    sign: { intent: { op: "raw", rawSigningPayloadHex: h("ab") }, expected_digest: h("ab"), digest_form: "userOpHash" },
    summary: { lines: ["Enable trading for the account"], digest_tag: digestTag(h("ab")) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: { AD5: "unknown" },
    warnings: ["Caps are advisory against a compromised agent."],
    user_op_hash: h("ab"),
  };
}

const HEALTH = {
  status: "ok",
  version: "0.2.0",
  time: NOW_ISO,
  kill: false,
  flags: { ...ALL_FLAGS_OFF },
  tripwires: { ok: true, tripped: [] },
  upstream: {},
};

// ---- the stub server ------------------------------------------------------------------------------------------------

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
}
type Respond = (res: ServerResponse, seen: Seen, req: IncomingMessage) => void;
interface Stub {
  readonly url: string;
  readonly port: number;
  readonly seen: Seen[];
}

const open: Array<() => Promise<void>> = [];
afterEach(async () => {
  mock.timers.reset();
  mock.restoreAll();
  await Promise.all(open.splice(0).map((close) => close()));
});

async function startStub(respond: Respond): Promise<Stub> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const record: Seen = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(record);
      respond(res, record, req);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  open.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return { url: `http://127.0.0.1:${port}`, port, seen };
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const stubJson = (status: number, body: unknown, headers: Record<string, string> = {}): Promise<Stub> =>
  startStub((res) => sendJson(res, status, body, headers));

const clientFor = (stub: Stub): RelayClient => createRelayClient({ baseUrl: stub.url, key: SECRET });

function jsonFetch(body: unknown, status = 200, headers: Record<string, string> = {}): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })) as typeof fetch;
}

const injected = (fetchImpl: typeof fetch): RelayClient => createRelayClient({ baseUrl: NO_PORT, key: SECRET, fetch: fetchImpl });

function failed(result: RelayResult<unknown>): { readonly status: number; readonly error: RelayFailure } {
  if (result.ok) assert.fail(`expected a failure, got ${JSON.stringify(result)}`);
  return { status: result.status, error: result.error };
}

// The relay key must not appear in any rendering of a result, whole or in part.
function assertNoKey(value: unknown, label = "result"): void {
  const renderings = [JSON.stringify(value), inspect(value, { depth: 12 }), String(value)];
  for (const text of renderings) {
    assert.equal(text.includes(TEST_KEY), false, `${label} holds the relay key`);
    assert.equal(text.includes(TEST_KEY.slice(0, 14)), false, `${label} holds the start of the relay key`);
    assert.equal(text.includes(TEST_KEY.slice(14, 28)), false, `${label} holds the middle of the relay key`);
  }
}

const flush = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));
const statusCall = (client: RelayClient, options?: Parameters<RelayClient["post"]>[2]) =>
  client.post("/v1/account/status", { owner: OWNER }, options);
// A POST that changes state on the relay: a timeout here must not be reported as safe to repeat.
const cancelCall = (client: RelayClient, options?: Parameters<RelayClient["post"]>[2]) =>
  client.post("/v1/order/cancel", { owner: OWNER, order_hash: h("cc") }, options);

// ---- configuration -----------------------------------------------------------------------------------------------------

describe("relay client: not configured", () => {
  const countingFetch = (): { fetchImpl: typeof fetch; calls: () => number } => {
    let calls = 0;
    return {
      fetchImpl: (() => {
        calls += 1;
        return Promise.reject(new Error("no network in this test"));
      }) as typeof fetch,
      calls: () => calls,
    };
  };

  const cases: ReadonlyArray<{ name: string; baseUrl?: string; key?: Secret; missing?: string[]; invalid?: string[] }> = [
    { name: "nothing set", missing: ["XO_RELAY_URL", "XO_RELAY_KEY"] },
    { name: "no key", baseUrl: "http://127.0.0.1:8787", missing: ["XO_RELAY_KEY"] },
    { name: "no URL", key: SECRET, missing: ["XO_RELAY_URL"] },
    { name: "empty URL", baseUrl: "", key: SECRET, missing: ["XO_RELAY_URL"] },
    { name: "http to a non-loopback host", baseUrl: "http://relay.example", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "http to a look-alike of loopback", baseUrl: "http://127.0.0.1.relay.example", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "a URL with a password", baseUrl: "https://user:pw-secret-value@relay.example", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "a URL with a query", baseUrl: "https://relay.example/?token=abc", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "a URL with a fragment", baseUrl: "https://relay.example/#x", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "a URL with a space", baseUrl: "https://relay.example/a b", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "another scheme", baseUrl: "ftp://127.0.0.1", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "not a URL", baseUrl: "relay", key: SECRET, invalid: ["XO_RELAY_URL"] },
    { name: "a key that is too short", baseUrl: "http://127.0.0.1:8787", key: new Secret("short"), invalid: ["XO_RELAY_KEY"] },
    {
      name: "a key that would inject a header",
      baseUrl: "http://127.0.0.1:8787",
      key: new Secret("0123456789abcdef\r\nx-evil: 1"),
      invalid: ["XO_RELAY_KEY"],
    },
    { name: "a key with a space", baseUrl: "http://127.0.0.1:8787", key: new Secret("0123456789 abcdef0123"), invalid: ["XO_RELAY_KEY"] },
    { name: "a key that is too long", baseUrl: "http://127.0.0.1:8787", key: new Secret("k".repeat(257)), invalid: ["XO_RELAY_KEY"] },
    { name: "a bad URL and no key", baseUrl: "http://relay.example", missing: ["XO_RELAY_KEY"], invalid: ["XO_RELAY_URL"] },
  ];

  for (const entry of cases) {
    it(`returns relay_not_configured and sends nothing: ${entry.name}`, async () => {
      const { fetchImpl, calls } = countingFetch();
      const client = createRelayClient({ baseUrl: entry.baseUrl, key: entry.key, fetch: fetchImpl });
      for (const result of [await statusCall(client), await client.get("/v1/health")]) {
        const { status, error } = failed(result);
        assert.equal(status, 0);
        assert.equal(error.code, "relay_not_configured");
        assert.deepEqual(error.details?.["missing"], entry.missing);
        assert.deepEqual(error.details?.["invalid"], entry.invalid);
        assert.match(error.message, /XO_RELAY_URL and XO_RELAY_KEY/);
        // Neither the URL's parts nor the key may be echoed.
        for (const secretPart of ["pw-secret-value", "token=abc", "x-evil", TEST_KEY]) {
          assert.equal(JSON.stringify(result).includes(secretPart), false, secretPart);
        }
      }
      assert.equal(calls(), 0);
    });
  }

  it("builds without a network call and without throwing, even for nonsense options", async () => {
    const { fetchImpl, calls } = countingFetch();
    const nonsense = [
      { baseUrl: 5 as unknown as string, key: SECRET },
      { baseUrl: "http://127.0.0.1:8787", key: "a-plain-string-key-0123456789" as unknown as Secret },
      { baseUrl: "http://127.0.0.1:8787", key: {} as unknown as Secret },
      { baseUrl: null as unknown as string, key: null as unknown as Secret },
    ];
    for (const options of nonsense) {
      const client = createRelayClient({ ...options, fetch: fetchImpl });
      assert.equal(failed(await statusCall(client)).error.code, "relay_not_configured");
    }
    assert.equal(calls(), 0);
  });

  it("the config-based constructor says relay_not_configured when XO_RELAY_URL is unset", async () => {
    const { fetchImpl, calls } = countingFetch();
    for (const env of [{}, { XO_RELAY_KEY: TEST_KEY }, { XO_RELAY_URL: "http://127.0.0.1:8787" }, { XO_RELAY_URL: "http://relay.example", XO_RELAY_KEY: TEST_KEY }]) {
      const { config } = loadConfig(env);
      const result = await statusCall(createRelayClientFromConfig(config, fetchImpl));
      assert.equal(failed(result).error.code, "relay_not_configured");
      assertNoKey(result);
    }
    assert.equal(calls(), 0);
  });

  it("the config-based constructor talks to the configured relay", async () => {
    const stub = await stubJson(200, statusFixture());
    const { config } = loadConfig({ XO_RELAY_URL: stub.url, XO_RELAY_KEY: TEST_KEY });
    const result = await statusCall(createRelayClientFromConfig(config));
    assert.equal(result.ok, true);
    assert.equal(stub.seen[0]?.headers[RELAY_KEY_HEADER], TEST_KEY);
  });
});

// ---- what goes on the wire ---------------------------------------------------------------------------------------------

describe("relay client: request shape", () => {
  // Headers the HTTP stack adds on its own; anything else must be ours and on the list below.
  const STACK_HEADERS = new Set(["host", "connection", "accept-encoding", "accept-language", "sec-fetch-mode", "content-length"]);
  const OUR_HEADERS = new Set(["user-agent", "accept", RELAY_KEY_HEADER, "content-type"]);

  function assertHeaders(seen: Seen, post: boolean): void {
    const names = Object.keys(seen.headers);
    for (const name of names) assert.ok(STACK_HEADERS.has(name) || OUR_HEADERS.has(name), `unexpected header ${name}`);
    assert.equal(seen.headers["user-agent"], "insurance-markets-xo-plugin/0.2");
    assert.equal(RELAY_USER_AGENT, "insurance-markets-xo-plugin/0.2");
    assert.equal(seen.headers["accept"], "application/json");
    assert.equal(seen.headers[RELAY_KEY_HEADER], TEST_KEY);
    for (const forbidden of ["cookie", "authorization", "proxy-authorization", "referer", "from", "origin", "x-forwarded-for", "forwarded"]) {
      assert.equal(forbidden in seen.headers, false, forbidden);
    }
    assert.equal(seen.headers["content-type"], post ? "application/json" : undefined);
  }

  it("sends a GET with the fixed headers and no body", async () => {
    const stub = await stubJson(200, HEALTH);
    const result = await clientFor(stub).get("/v1/health");
    assert.equal(result.ok, true);
    assert.equal(stub.seen.length, 1);
    const seen = stub.seen[0];
    assert.ok(seen);
    assert.equal(seen.method, "GET");
    assert.equal(seen.url, "/v1/health");
    assert.equal(seen.body, "");
    assertHeaders(seen, false);
  });

  it("sends a POST with exactly the request body and the fixed headers", async () => {
    const stub = await stubJson(200, statusFixture());
    const body = { owner: OWNER, account: ACCOUNT };
    const result = await clientFor(stub).post("/v1/account/status", body);
    assert.equal(result.ok, true);
    const seen = stub.seen[0];
    assert.ok(seen);
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/v1/account/status");
    assert.deepEqual(JSON.parse(seen.body), body);
    assertHeaders(seen, true);
  });

  it("keeps a path prefix on the base URL and ignores trailing slashes", async () => {
    const stub = await stubJson(200, HEALTH);
    const client = createRelayClient({ baseUrl: `${stub.url}/api//`, key: SECRET });
    assert.equal((await client.get("/v1/health")).ok, true);
    assert.equal(stub.seen[0]?.url, "/api/v1/health");
  });

  it("calls the status routes with the hash in the path", async () => {
    const stub = await startStub((res, seen) => {
      if (seen.url.startsWith("/v1/userop/")) sendJson(res, 200, { user_op_hash: h("ab"), state: "included", tx_hash: h("ee") });
      else sendJson(res, 200, { order_hash: h("cc"), state: "open" });
    });
    const client = clientFor(stub);
    const userOp = await client.get(userOpStatusPath(h("ab")));
    const order = await client.get(orderStatusPath(h("cc")));
    assert.equal(userOp.ok && userOp.data.state, "included");
    assert.equal(order.ok && order.data.state, "open");
    assert.deepEqual(stub.seen.map((entry) => entry.url), [`/v1/userop/${h("ab")}`, `/v1/order/${h("cc")}`]);
  });

  it("looks up the global fetch at call time, so a stub installed later is used", async () => {
    const client = createRelayClient({ baseUrl: NO_PORT, key: SECRET });
    let seenUrl = "";
    mock.method(globalThis, "fetch", async (input: string) => {
      seenUrl = input;
      return new Response(JSON.stringify(HEALTH), { status: 200, headers: { "content-type": "application/json" } });
    });
    assert.equal((await client.get("/v1/health")).ok, true);
    assert.equal(seenUrl, `${NO_PORT}/v1/health`);
  });

  it("sets redirect, credentials and referrer policy so nothing ambient is sent", async () => {
    let init: RequestInit | undefined;
    const client = injected((async (_input: string, options?: RequestInit) => {
      init = options;
      return new Response(JSON.stringify(HEALTH), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch);
    await client.get("/v1/health");
    assert.equal(init?.redirect, "manual");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.referrerPolicy, "no-referrer");
    assert.ok(init?.signal instanceof AbortSignal);
  });
});

describe("relay client: no redirects and no cookies", () => {
  it("refuses a redirect, never follows it, and the key never leaves the configured origin", async () => {
    const target = await stubJson(200, HEALTH);
    for (const [status, post] of [[301, false], [302, true], [307, true], [308, false]] as const) {
      const first = await startStub((res) => {
        res.writeHead(status, { location: `${target.url}/v1/health` });
        res.end();
      });
      const client = clientFor(first);
      const result = post ? await cancelCall(client) : await client.get("/v1/health");
      const { error, status: got } = failed(result);
      assert.equal(got, status);
      assert.equal(error.code, "relay_not_configured");
      assert.equal(error.details?.["reason"], "redirect_refused");
      assert.equal(first.seen.length, 1);
      assertNoKey(result);
    }
    assert.equal(target.seen.length, 0, "the redirect target must never be contacted");
  });

  it("sends no cookie back, whatever the relay sets", async () => {
    const stub = await stubJson(200, HEALTH, { "set-cookie": "sid=abc123; Path=/; HttpOnly" });
    const client = clientFor(stub);
    await client.get("/v1/health");
    await client.get("/v1/health");
    assert.equal(stub.seen.length, 2);
    assert.equal("cookie" in (stub.seen[1]?.headers ?? {}), false);
  });
});

// ---- validation of what comes back ------------------------------------------------------------------------------------

describe("relay client: responses are validated against the contract", () => {
  it("returns parsed data for each kind of answer", async () => {
    const stub = await startStub((res, seen) => {
      const reply: Record<string, unknown> = {
        "/v1/account/status": statusFixture(),
        "/v1/userop/prepare": preparedFixture(),
        "/v1/order/submit": { state: "accepted", order_hash: h("cc") },
        "/v1/orders/list": { orders: [] },
        "/v1/health": HEALTH,
      };
      sendJson(res, 200, reply[seen.url] ?? {});
    });
    const client = clientFor(stub);
    const status = await statusCall(client);
    assert.ok(status.ok);
    assert.equal(status.status, 200);
    assert.equal(status.data.state, "registered");
    const prepared = await client.post("/v1/userop/prepare", { owner: OWNER, action: "deploy_enable_trading" });
    assert.ok(prepared.ok);
    assert.equal(prepared.data.user_op_hash, h("ab"));
    assert.equal(prepared.data.sign.intent.op, "raw");
    const submit = await client.post("/v1/order/submit", { prepared_id: PREPARED_ID, signature: `0x${"22".repeat(65)}` });
    assert.ok(submit.ok);
    assert.equal(submit.data.state, "accepted");
    const list = await client.post("/v1/orders/list", { owner: OWNER });
    assert.ok(list.ok);
    assert.deepEqual(list.data.orders, []);
    const health = await client.get("/v1/health");
    assert.ok(health.ok);
    assert.equal(health.data.status, "ok");
  });

  const broken: ReadonlyArray<{ name: string; make: () => Response }> = (() => {
    const json = (value: unknown, type = "application/json") =>
      new Response(typeof value === "string" ? value : JSON.stringify(value), { status: 200, headers: { "content-type": type } });
    const without = (key: string) => {
      const value = statusFixture();
      delete value[key];
      return value;
    };
    return [
      { name: "an unknown extra field", make: () => json({ ...statusFixture(), extra: 1 }) },
      { name: "a missing required field", make: () => json(without("state")) },
      { name: "a wrong type", make: () => json({ ...statusFixture(), registered: "yes" }) },
      { name: "a value outside an enum", make: () => json({ ...statusFixture(), state: "maybe" }) },
      { name: "an address with a bad checksum", make: () => json({ ...statusFixture(), account: `0x${"aA".repeat(20)}` }) },
      { name: "a decimal sent as a number", make: () => json({ ...statusFixture(), balance_usd: 1.25 }) },
      { name: "an array", make: () => json([statusFixture()]) },
      { name: "a bare string", make: () => json('"ok"') },
      { name: "null", make: () => json("null") },
      { name: "invalid JSON", make: () => json("{\"state\":") },
      { name: "an empty body", make: () => json("") },
      { name: "valid JSON with the wrong content type", make: () => json(statusFixture(), "text/plain") },
      { name: "an HTML page", make: () => json("<html>hello</html>", "text/html") },
      { name: "the answer to a different route", make: () => json(HEALTH) },
    ];
  })();

  for (const entry of broken) {
    it(`drops ${entry.name}; a read says it is safe to retry, a write says the outcome is unknown`, async () => {
      const read = injected((async () => entry.make()) as typeof fetch);
      const readFail = failed(await statusCall(read));
      assert.equal(readFail.error.code, "internal");
      assert.equal(readFail.error.details?.["reason"], "invalid_response");
      assert.equal(readFail.error.details?.["retry_safe"], true);

      const write = injected((async () => entry.make()) as typeof fetch);
      const writeFail = failed(await cancelCall(write));
      assert.equal(writeFail.error.code, "ambiguous");
      assert.equal(writeFail.error.details?.["retry_safe"], false);
      assert.match(writeFail.error.message, /do not resend/);
      assert.equal(writeFail.status, 200);
    });
  }

  it("drops a GET answer that fails its schema as internal", async () => {
    const client = injected(jsonFetch({ ...HEALTH, status: "great" }));
    const { error } = failed(await client.get("/v1/health"));
    assert.equal(error.code, "internal");
    assert.equal(error.details?.["reason"], "invalid_response");
  });

  it("drops an invalid UTF-8 body", async () => {
    const client = injected((async () =>
      new Response(new Uint8Array([0x7b, 0xff, 0x7d]), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch);
    const { error } = failed(await cancelCall(client));
    assert.equal(error.code, "ambiguous");
    assert.equal(error.details?.["reason"], "body_read_failed");
  });

  it("drops an answer about another owner, case aside, and accepts the same owner in lower case", async () => {
    const other = failed(await injected(jsonFetch(preparedFixture(OTHER_OWNER))).post("/v1/userop/prepare", { owner: OWNER, action: "deploy_enable_trading" }));
    assert.equal(other.error.code, "ambiguous");
    assert.equal(other.error.details?.["reason"], "invalid_response");

    const lower = await injected(jsonFetch(preparedFixture(OWNER.toLowerCase()))).post("/v1/userop/prepare", { owner: OWNER, action: "deploy_enable_trading" });
    assert.equal(lower.ok, true);
  });

  it("drops an order, user operation or funding answer about a different hash than the one asked for", async () => {
    const order = failed(await injected(jsonFetch({ order_hash: h("dd"), state: "open" })).get(orderStatusPath(h("cc"))));
    assert.equal(order.error.details?.["reason"], "invalid_response");
    const userOp = failed(await injected(jsonFetch({ user_op_hash: h("dd"), state: "included" })).get(userOpStatusPath(h("ab"))));
    assert.equal(userOp.error.details?.["reason"], "invalid_response");
    const cancel = failed(await injected(jsonFetch({ order_hash: h("dd"), state: "cancelled" })).post("/v1/order/cancel", { owner: OWNER, order_hash: h("cc") }));
    assert.equal(cancel.error.code, "ambiguous");
    const funding = failed(
      await injected(jsonFetch({ funding_id: "ffffffffffffffffffffffffffffffff", state: "dispatched", message_id: h("ff") })).post("/v1/funding/report", {
        owner: OWNER,
        funding_id: PREPARED_ID,
        tx_hash: h("dd"),
      }),
    );
    assert.equal(funding.error.code, "ambiguous");
    // The same hash in another case is the same hash.
    const same = await injected(jsonFetch({ order_hash: `0x${"CC".repeat(32)}`, state: "open" })).get(orderStatusPath(h("cc")));
    assert.equal(same.ok, true);
  });

  it("accepts exactly what the schema accepts, over 300 seeded mutations of a valid answer", async () => {
    // mulberry32: a fixed-seed generator, so the same mutations run every time.
    let seed = 0x5eed1234;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const pathsOf = (value: unknown, prefix: string[] = []): string[][] =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.entries(value).flatMap(([key, inner]) => [[...prefix, key], ...pathsOf(inner, [...prefix, key])])
        : [];
    const schema = POST_ROUTES["/v1/account/status"].response;
    let accepted = 0;
    let rejected = 0;
    for (let round = 0; round < 300; round += 1) {
      const mutated = structuredClone(statusFixture());
      const path = pick(pathsOf(mutated));
      let parent: Record<string, unknown> = mutated;
      for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
      const last = path[path.length - 1] as string;
      const operation = pick(["delete", "null", "zero", "text", "list", "object", "true", "extra"] as const);
      if (operation === "delete") delete parent[last];
      else if (operation === "null") parent[last] = null;
      else if (operation === "zero") parent[last] = 0;
      else if (operation === "text") parent[last] = "zz";
      else if (operation === "list") parent[last] = [];
      else if (operation === "object") parent[last] = {};
      else if (operation === "true") parent[last] = true;
      else parent["unexpected_extra_key"] = 1;
      const expected = schema.safeParse(mutated);
      const result = await statusCall(injected(jsonFetch(mutated)));
      assert.equal(result.ok, expected.success, `${operation} ${path.join(".")}`);
      if (result.ok && expected.success) {
        assert.deepEqual(result.data, expected.data);
        accepted += 1;
      } else {
        rejected += 1;
      }
    }
    assert.ok(accepted > 0 && rejected > 0, `not a vacuous run: ${accepted} accepted, ${rejected} rejected`);
  });
});

describe("relay client: requests are validated before anything is sent", () => {
  it("refuses a body that breaks the contract, names the field and never echoes the value", async () => {
    const stub = await stubJson(200, statusFixture());
    const client = clientFor(stub);
    const cases: ReadonlyArray<{ call: () => Promise<RelayResult<unknown>>; field: RegExp; leak: string }> = [
      { call: () => client.post("/v1/account/status", { owner: "0xnot-an-address-leak-me" }), field: /owner/, leak: "leak-me" },
      { call: () => client.post("/v1/account/status", { owner: OWNER, surprise: "leak-me-too" } as never), field: /./, leak: "leak-me-too" },
      { call: () => client.post("/v1/userop/prepare", { owner: OWNER, action: "launch_rocket" } as never), field: /./, leak: "launch_rocket" },
      { call: () => client.post("/v1/order/cancel", { owner: OWNER, order_hash: "0x12" }), field: /order_hash/, leak: "0x12\"" },
      { call: () => client.post("/v1/creation/track", {} as never), field: /condition_id/, leak: "zzz" },
    ];
    for (const entry of cases) {
      const result = await entry.call();
      const { status, error } = failed(result);
      assert.equal(status, 0);
      assert.equal(error.code, "invalid_request");
      const fields = error.details?.["fields"];
      assert.ok(Array.isArray(fields) && fields.some((field) => entry.field.test(field)), JSON.stringify(fields));
      assert.equal(JSON.stringify(result).includes(entry.leak), false, entry.leak);
    }
    assert.equal(stub.seen.length, 0, "an invalid request must never reach the network");
  });

  it("refuses paths that are not contract routes", async () => {
    const stub = await stubJson(200, HEALTH);
    const client = clientFor(stub);
    const badGets = [
      "/v1/order/0x12",
      `/v1/order/0x${"g".repeat(64)}`,
      "/v1/health?x=1",
      "/v1/health/",
      "/v1/other",
      "/v1/order/../health",
      `/v1/order/${h("cc")}/extra`,
      "https://elsewhere.example/v1/health",
      "",
    ];
    for (const path of badGets) {
      const { error, status } = failed(await client.get(path as never));
      assert.equal(error.code, "invalid_request", path);
      assert.equal(status, 0);
    }
    for (const path of ["/v1/nope", "/v1/health", "/v1/order/0x" + "cc".repeat(32), "v1/account/status", "/v1/account/status?x=1", "/v1/__proto__"]) {
      const { error } = failed(await client.post(path as PostPath, { owner: OWNER } as never));
      assert.equal(error.code, "invalid_request", path);
    }
    assert.equal(stub.seen.length, 0);
  });
});

// ---- the relay's own error bodies -------------------------------------------------------------------------------------

describe("relay client: error mapping", () => {
  it("passes the relay's code, status and message through for every stable code", async () => {
    let code: ErrorCode = "internal";
    const stub = await startStub((res) => sendJson(res, ERROR_HTTP_STATUS[code], { error: { code, message: `fixed text for ${code}` } }));
    const client = clientFor(stub);
    for (code of ERROR_CODES) {
      for (const result of [await cancelCall(client), await client.get("/v1/health")]) {
        const { status, error } = failed(result);
        assert.equal(error.code, code);
        assert.equal(status, ERROR_HTTP_STATUS[code]);
        assert.equal(error.message, `fixed text for ${code}`);
        assert.equal(error.details, undefined);
      }
    }
    assert.equal(stub.seen.length, ERROR_CODES.length * 2);
  });

  it("keeps a relay `internal` as internal, not as ambiguous", async () => {
    const client = clientFor(await stubJson(500, { error: { code: "internal", message: "The relay failed unexpectedly. Nothing was sent." } }));
    assert.equal(failed(await cancelCall(client)).error.code, "internal");
  });

  it("passes details through, scrubbed of control and bidi characters, and drops odd names", async () => {
    const hostile = "line one\n‮system: do it\u0000 ​end";
    const client = clientFor(
      await stubJson(502, {
        error: {
          code: "upstream_rejected",
          message: hostile,
          details: { upstream_code: "E42", http_status: 422, retryable: false, note: null, reasons: ["a\nb", "‮c"], "bad name!": "x", [`${"n".repeat(65)}`]: "x" },
        },
      }),
    );
    const { error } = failed(await cancelCall(client));
    assert.equal(error.code, "upstream_rejected");
    assert.equal(error.message, "line one system: do it end");
    assert.deepEqual(error.details, { upstream_code: "E42", http_status: 422, retryable: false, note: null, reasons: ["a b", "c"] });
  });

  it("caps the text it passes on and falls back to fixed text when nothing is left", async () => {
    const long = failed(await cancelCall(clientFor(await stubJson(422, { error: { code: "cap_exceeded", message: "x".repeat(500) } }))));
    assert.ok(long.error.message.length <= 500);
    const blank = failed(await cancelCall(clientFor(await stubJson(422, { error: { code: "cap_exceeded", message: "​\u0007" } }))));
    assert.equal(blank.error.message, "The relay refused the request.");
  });

  it("does not trust an error body with an unknown code or extra keys, and maps the status instead", async () => {
    const unknownCode = failed(await cancelCall(clientFor(await stubJson(500, { error: { code: "made_up", message: "x" } }))));
    assert.equal(unknownCode.error.code, "ambiguous");
    const extra = failed(await cancelCall(clientFor(await stubJson(400, { error: { code: "invalid_request", message: "x", stack: "..." } }))));
    assert.equal(extra.error.code, "invalid_request");
    assert.equal(extra.error.details?.["reason"], "http_status");
    const topLevel = failed(await cancelCall(clientFor(await stubJson(409, { error: { code: "stale_nonce", message: "x" }, more: 1 }))));
    assert.equal(topLevel.error.code, "invalid_request");
  });

  it("treats a 2xx error body (such as `pending`) as a failure with the relay's code", async () => {
    const result = await cancelCall(clientFor(await stubJson(202, { error: { code: "pending", message: "Accepted; poll the status route." } })));
    const { status, error } = failed(result);
    assert.equal(status, 202);
    assert.equal(error.code, "pending");
  });

  const statusMap: ReadonlyArray<[number, ErrorCode]> = [
    [400, "invalid_request"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [404, "not_found"],
    [413, "invalid_request"],
    [418, "invalid_request"],
    [422, "invalid_request"],
    [429, "rate_limited"],
  ];
  for (const [httpStatus, code] of statusMap) {
    it(`maps HTTP ${httpStatus} without a valid error body to ${code}`, async () => {
      const client = clientFor(await startStub((res) => { res.writeHead(httpStatus, { "content-type": "text/html" }); res.end("<h1>nope</h1>"); }));
      const post = failed(await cancelCall(client));
      assert.equal(post.error.code, code);
      assert.equal(post.status, httpStatus);
      assert.equal(failed(await client.get("/v1/health")).error.code, code);
    });
  }

  for (const httpStatus of [500, 502, 503, 504]) {
    it(`maps HTTP ${httpStatus} without a valid error body to ambiguous for a write and internal for a read, with no retry`, async () => {
      const stub = await startStub((res) => { res.writeHead(httpStatus, { "content-type": "text/html" }); res.end("<h1>bad gateway</h1>"); });
      const client = clientFor(stub);
      const write = failed(await cancelCall(client));
      assert.equal(write.error.code, "ambiguous");
      assert.equal(write.error.details?.["reason"], "server_error");
      assert.equal(write.status, httpStatus);
      const read = failed(await statusCall(client));
      assert.equal(read.error.code, "internal");
      assert.equal(read.error.details?.["retry_safe"], true);
      const get = failed(await client.get("/v1/health"));
      assert.equal(get.error.code, "internal");
      assert.equal(stub.seen.length, 3, "one request per call: the client never retries");
    });
  }

  it("reads Retry-After on a 429, with or without an error body, and caps it", async () => {
    const wait = async (header: string | undefined, body: unknown): Promise<unknown> => {
      const client = clientFor(
        await startStub((res) => {
          res.writeHead(429, { "content-type": "application/json", ...(header === undefined ? {} : { "retry-after": header }) });
          res.end(body === undefined ? "" : JSON.stringify(body));
        }),
      );
      const { error } = failed(await cancelCall(client));
      assert.equal(error.code, "rate_limited");
      return error.details?.["retry_after_ms"];
    };
    assert.equal(await wait("7", undefined), 7000);
    assert.equal(await wait("9999999", undefined), RELAY_CLIENT_LIMITS.maxRetryAfterMs);
    assert.equal(await wait("99999999", undefined), undefined);
    assert.equal(await wait("Wed, 21 Oct 2026 07:28:00 GMT", undefined), undefined);
    assert.equal(await wait("-3", undefined), undefined);
    assert.equal(await wait("7", { error: { code: "rate_limited", message: "slow down" } }), 7000);
    assert.equal(await wait("7", { error: { code: "rate_limited", message: "slow down", details: { retry_after_ms: 250 } } }), 250);
  });

  it("falls back to the status for an error body that is too large to read, even if it would be valid", async () => {
    const details = { list: Array.from({ length: 2000 }, () => "y".repeat(20)) };
    const body = JSON.stringify({ error: { code: "capability_unknown", message: "would be accepted if read", details } });
    assert.ok(body.length > RELAY_CLIENT_LIMITS.maxErrorBodyBytes);
    assert.ok(body.length < RELAY_CLIENT_LIMITS.maxResponseBytes);
    const client = clientFor(
      await startStub((res) => {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(body);
      }),
    );
    const { error } = failed(await client.get("/v1/health"));
    assert.equal(error.code, "not_found");
    assert.equal(error.details?.["reason"], "http_status");
  });
});

// ---- time ------------------------------------------------------------------------------------------------------------------

describe("relay client: timeouts", () => {
  it("clamps every requested timeout to the 8 s client limit", () => {
    assert.equal(RELAY_CLIENT_TIMEOUT_MS, 8000);
    assert.equal(effectiveTimeoutMs(), 8000);
    assert.equal(effectiveTimeoutMs(100), 100);
    assert.equal(effectiveTimeoutMs(100.9), 100);
    assert.equal(effectiveTimeoutMs(0.2), 1);
    assert.equal(effectiveTimeoutMs(8000), 8000);
    assert.equal(effectiveTimeoutMs(8001), 8000);
    assert.equal(effectiveTimeoutMs(10_000), 8000);
    assert.equal(effectiveTimeoutMs(Number.MAX_SAFE_INTEGER), 8000);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) assert.equal(effectiveTimeoutMs(bad), 8000, String(bad));
  });

  it("aborts at 8 s by default, 7999 ms is not enough, even when fetch ignores the signal", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const client = injected((() => new Promise<Response>(() => undefined)) as typeof fetch);
    let done = false;
    const pending = cancelCall(client);
    void pending.then(() => { done = true; });
    mock.timers.tick(7999);
    await flush();
    assert.equal(done, false);
    mock.timers.tick(1);
    const { error, status } = failed(await pending);
    assert.equal(status, 0);
    assert.equal(error.code, "ambiguous");
    assert.equal(error.details?.["reason"], "timeout");
    assert.equal(error.details?.["retry_safe"], false);
  });

  it("never waits longer than 8 s for a larger request, and honours a shorter one", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const never = (() => new Promise<Response>(() => undefined)) as typeof fetch;
    const long = statusCall(injected(never), { timeoutMs: 60_000 });
    mock.timers.tick(8000);
    const longFail = failed(await long);
    assert.equal(longFail.error.code, "internal");
    assert.equal(longFail.error.details?.["reason"], "timeout");
    assert.equal(longFail.error.details?.["retry_safe"], true);

    const short = cancelCall(injected(never), { timeoutMs: 100 });
    mock.timers.tick(100);
    assert.equal(failed(await short).error.details?.["reason"], "timeout");
  });

  it("cancels a response that arrives after the timeout", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    let release: (response: Response) => void = () => undefined;
    const late = new Promise<Response>((resolve) => { release = resolve; });
    const pending = cancelCall(injected((() => late) as typeof fetch));
    mock.timers.tick(8000);
    assert.equal(failed(await pending).error.details?.["reason"], "timeout");
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("{}")); },
      cancel() { cancelled = true; },
    });
    release(new Response(body, { status: 200, headers: { "content-type": "application/json" } }));
    await flush();
    await flush();
    assert.equal(cancelled, true);
  });

  it("clears its timer after every call", async () => {
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const started: unknown[] = [];
    const cleared: unknown[] = [];
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const handle = realSet(fn, ms);
      if (ms === 8000) started.push(handle);
      return handle;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: Parameters<typeof clearTimeout>[0]) => {
      cleared.push(handle);
      return realClear(handle);
    }) as typeof clearTimeout;
    try {
      await statusCall(injected(jsonFetch(statusFixture())));
      await statusCall(injected(jsonFetch({ nonsense: true })));
      await cancelCall(injected(jsonFetch({ error: { code: "kill_switch", message: "off" } }, 503)));
      await injected(((): Promise<Response> => Promise.reject(new Error("down"))) as typeof fetch).get("/v1/health");
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
    assert.equal(started.length, 4);
    for (const handle of started) assert.ok(cleared.includes(handle));
  });

  it("times out a relay that never answers (real socket)", { timeout: 10_000 }, async () => {
    const stub = await startStub(() => undefined);
    const client = clientFor(stub);
    const write = failed(await cancelCall(client, { timeoutMs: 150 }));
    assert.equal(write.error.code, "ambiguous");
    assert.equal(write.error.details?.["reason"], "timeout");
    const read = failed(await client.get("/v1/health", { timeoutMs: 150 }));
    assert.equal(read.error.code, "internal");
    assert.equal(read.error.details?.["reason"], "timeout");
    assert.equal(stub.seen.length, 2, "no retry after a timeout");
  });

  it("times out a relay that sends headers and then stalls the body (real socket)", { timeout: 10_000 }, async () => {
    const stub = await startStub((res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{\"state\":");
    });
    const { error, status } = failed(await cancelCall(clientFor(stub), { timeoutMs: 150 }));
    assert.equal(status, 200);
    assert.equal(error.code, "ambiguous");
    assert.equal(error.details?.["reason"], "timeout");
  });

  it("stops when the caller aborts, and sends nothing if it had already aborted", { timeout: 10_000 }, async () => {
    const stub = await startStub(() => undefined);
    const client = clientFor(stub);
    const controller = new AbortController();
    const pending = cancelCall(client, { signal: controller.signal });
    while (stub.seen.length === 0) await flush();
    controller.abort();
    const { error } = failed(await pending);
    assert.equal(error.code, "ambiguous");
    assert.equal(error.details?.["reason"], "aborted");

    const before = stub.seen.length;
    const gone = new AbortController();
    gone.abort();
    const early = failed(await cancelCall(client, { signal: gone.signal }));
    assert.equal(early.error.code, "internal");
    assert.match(early.error.message, /Nothing was sent/);
    assert.equal(stub.seen.length, before);
  });
});

describe("relay client: connection failures", () => {
  it("says relay_not_configured, with nothing sent, when nothing is listening", { timeout: 10_000 }, async () => {
    const stub = await stubJson(200, HEALTH);
    const dead = createRelayClient({ baseUrl: stub.url, key: SECRET });
    await Promise.all(open.splice(0).map((close) => close()));
    for (const result of [await cancelCall(dead), await dead.get("/v1/health")]) {
      const { status, error } = failed(result);
      assert.equal(status, 0);
      assert.equal(error.code, "relay_not_configured");
      assert.equal(error.details?.["reason"], "unreachable");
      assertNoKey(result);
    }
  });

  it("says ambiguous for a write, and internal for a read, when the connection drops mid-request", { timeout: 10_000 }, async () => {
    const stub = await startStub((_res, _seen, req) => { req.socket.destroy(); });
    const client = clientFor(stub);
    const write = failed(await cancelCall(client));
    assert.equal(write.error.code, "ambiguous");
    assert.equal(write.error.details?.["reason"], "network");
    const read = failed(await client.get("/v1/health"));
    assert.equal(read.error.code, "internal");
    assert.equal(read.error.details?.["reason"], "network");
  });

  it("reports an answer that is cut off halfway as unreadable", { timeout: 10_000 }, async () => {
    const stub = await startStub((res) => {
      res.writeHead(200, { "content-type": "application/json", "content-length": "500" });
      res.write("{\"state\":");
      setImmediate(() => res.socket?.destroy());
    });
    const { error, status } = failed(await cancelCall(clientFor(stub)));
    assert.equal(status, 200);
    assert.equal(error.code, "ambiguous");
    assert.equal(error.details?.["reason"], "body_read_failed");
  });
});

// ---- size ---------------------------------------------------------------------------------------------------------------------

describe("relay client: size cap", () => {
  it("refuses an answer that declares more than the cap, without reading it", async () => {
    const stub = await startStub((res) => {
      res.writeHead(200, { "content-type": "application/json", "content-length": String(RELAY_CLIENT_LIMITS.maxResponseBytes + 1) });
      res.write("{}");
    });
    const { error, status } = failed(await statusCall(clientFor(stub), { timeoutMs: 3000 }));
    assert.equal(status, 200);
    assert.equal(error.details?.["reason"], "response_too_large");
    assert.equal(error.code, "internal");
  });

  it("stops reading an endless answer once it passes the cap, and hangs up", { timeout: 15_000 }, async () => {
    let closed: () => void = () => undefined;
    const serverSawClose = new Promise<void>((resolve) => { closed = resolve; });
    let written = 0;
    const stub = await startStub((res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.on("close", closed);
      res.on("error", () => undefined);
      const chunk = Buffer.alloc(64 * 1024, 0x20);
      const pump = (): void => {
        while (!res.destroyed) {
          written += chunk.length;
          if (!res.write(chunk)) {
            res.once("drain", pump);
            return;
          }
        }
      };
      pump();
    });
    const { error } = failed(await cancelCall(clientFor(stub)));
    assert.equal(error.code, "ambiguous");
    assert.equal(error.details?.["reason"], "response_too_large");
    await serverSawClose;
    assert.ok(written >= RELAY_CLIENT_LIMITS.maxResponseBytes, "the cap is only crossed by reading past it");
  });
});

// ---- the key ------------------------------------------------------------------------------------------------------------------

describe("relay client: the relay key never leaks", () => {
  it("is sent in the header and nowhere else, and the stub did receive it", async () => {
    const stub = await stubJson(200, statusFixture());
    const result = await statusCall(clientFor(stub));
    assert.ok(result.ok);
    const seen = stub.seen[0];
    assert.ok(seen);
    assert.equal(seen.headers[RELAY_KEY_HEADER], TEST_KEY);
    assert.equal(seen.url.includes(TEST_KEY), false);
    assert.equal(seen.body.includes(TEST_KEY), false);
    assertNoKey(result);
  });

  it("redacts the key if the relay echoes it, in a message, a detail or a list, even with hidden characters inside", async () => {
    const hidden = `${TEST_KEY.slice(0, 10)}​${TEST_KEY.slice(10)}`;
    const client = clientFor(
      await stubJson(403, {
        error: {
          code: "unauthorized",
          message: `bad key ${TEST_KEY} / ${hidden}`,
          details: { echoed: `key=${TEST_KEY}`, list: [TEST_KEY, `x${hidden}`] },
        },
      }),
    );
    const result = await cancelCall(client);
    const { error } = failed(result);
    assert.equal(error.code, "unauthorized");
    assert.match(error.message, /\[redacted\]/);
    assert.deepEqual(error.details, { echoed: "key=[redacted]", list: ["[redacted]", "x[redacted]"] });
    assertNoKey(result);
  });

  it("does not repeat anything a failing fetch throws", async () => {
    const throwers: ReadonlyArray<typeof fetch> = [
      (() => { throw new Error(`sync throw with ${TEST_KEY}`); }) as typeof fetch,
      (() => Promise.reject(new Error(`rejected with ${TEST_KEY}`))) as typeof fetch,
      (() => Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error(`header ${TEST_KEY}`), { code: "EPROTO" }) }))) as typeof fetch,
      (() => Promise.reject(TEST_KEY)) as typeof fetch,
      (() => Promise.resolve({ status: 200, headers: { get: () => { throw new Error(TEST_KEY); } } })) as unknown as typeof fetch,
      (() => Promise.resolve(null)) as unknown as typeof fetch,
    ];
    for (const fetchImpl of throwers) {
      for (const result of [await cancelCall(injected(fetchImpl)), await statusCall(injected(fetchImpl)), await injected(fetchImpl).get("/v1/health")]) {
        const { error } = failed(result);
        assert.ok(["ambiguous", "internal"].includes(error.code), error.code);
        assertNoKey(result);
      }
    }
  });

  it("never throws, whatever the transport does", async () => {
    const weird: ReadonlyArray<typeof fetch> = [
      (() => undefined) as unknown as typeof fetch,
      (() => { throw "a string"; }) as unknown as typeof fetch,
      (async () => new Response(null, { status: 200 })) as typeof fetch,
      (async () => new Response(null, { status: 204 })) as typeof fetch,
    ];
    for (const fetchImpl of weird) {
      const result = await cancelCall(injected(fetchImpl));
      assert.equal(result.ok, false);
    }
  });

  it("keeps a Secret opaque in every rendering", () => {
    assertNoKey({ key: SECRET });
    assert.equal(String(SECRET), "[redacted]");
  });

  it("has a source file that never logs and holds no identifying text", () => {
    const text = readFileSync(fileURLToPath(new URL("../src/relay/client.ts", import.meta.url)), "utf8");
    assert.equal(/\bconsole\b/.test(text), false);
    assert.equal(/\bstderr\b|\bstdout\b/.test(text), false);
    assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text), false, "an e-mail address");
    assert.equal(/https?:\/\/(?!127\.0\.0\.1)[\w.-]+\.[a-z]{2,}/i.test(text.replace(/\/\/.*$/gm, "")), false, "a hard-coded host");
  });
});

describe("relay client: seam", () => {
  it("satisfies the RelayClient interface that tools depend on", () => {
    const client: RelayClient = createRelayClient({ baseUrl: NO_PORT, key: SECRET });
    assert.equal(typeof client.post, "function");
    assert.equal(typeof client.get, "function");
  });
});
