import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import { UI_TOKEN_PATTERN, bridgeErrorResponseSchema, readProxyResponseSchema } from "../../contract.js";
import { HOSTILE_CASES } from "./corpus.js";
import { bearer, makeFixtureApp, startE2eDaemon, type E2eDaemon, type Reply } from "./harness.js";

// The read half of a Cockpit session against the real daemon process and the local mock XO: pair, list markets,
// read one market's rules, read an order book, all through GET /ui/read/<service>/..., then the refusals of M1-3.
// The upstream of the proxy in this process is the mock XO's loopback listeners and nothing else: a request for any
// other host is refused by the launcher's fetch and counted in daemon.blockedHosts().

let daemon: E2eDaemon;
let appDir: string;
let token: string;

before(async () => {
  appDir = await makeFixtureApp();
  daemon = await startE2eDaemon({ appDir });
  await daemon.waitForLink(1);
  token = (await daemon.pair()).token;
});
after(async () => {
  await daemon.stop();
  await rm(appDir, { recursive: true, force: true });
});

async function direct(base: string, path: string): Promise<unknown> {
  const response = await fetch(`${base}${path}`, { headers: { accept: "application/json" } });
  assert.equal(response.status, 200, `the mock answers ${path}`);
  return (await response.json()) as unknown;
}

function code(reply: Reply): string | undefined {
  const parsed = bridgeErrorResponseSchema.safeParse(reply.json());
  return parsed.success ? parsed.data.error.code : undefined;
}

const LIST = "/api/markets?marketType=2,4&statuses=ACTIVE&take=50&page=1";

describe("a read session", () => {
  it("lists markets through the proxy exactly as the mock serves them", async () => {
    assert.ok(daemon.mock);
    const reply = await daemon.getJson(`/ui/read/xo_data${LIST}`, token);
    assert.equal(reply.status, 200);
    const envelope = readProxyResponseSchema.parse(reply.json());
    assert.equal(envelope.service, "xo_data");
    assert.equal(envelope.upstream_status, 200);
    assert.deepEqual(envelope.body, await direct(daemon.mock.dataApi, LIST));
    const rows = (envelope.body as { data: { title: string }[] }).data;
    assert.ok(rows.length >= 3, "the default catalogue is listed");
  });

  it("passes hostile market text through as data: the daemon neither strips nor interprets it", async () => {
    const reply = await daemon.getJson(`/ui/read/xo_data${LIST}`, token);
    const rows = (readProxyResponseSchema.parse(reply.json()).body as { data: { title: string }[] }).data;
    const titles = new Set(rows.map((row) => row.title));
    for (const item of HOSTILE_CASES) assert.ok(titles.has(item.title), `${item.id} arrives byte for byte`);
    // The reply is JSON with the JSON content type, so a browser would never run it.
    assert.match(String(reply.headers["content-type"]), /^application\/json/);
    assert.equal(reply.headers["x-content-type-options"], "nosniff");
  });

  it("reads a market's rules by condition id and an order book by token id, equal to the mock's own answers", async () => {
    assert.ok(daemon.mock);
    const list = readProxyResponseSchema.parse((await daemon.getJson(`/ui/read/xo_data${LIST}`, token)).json()).body as { data: { conditionId: string }[] };
    const first = list.data.find((row) => /^0x[0-9a-f]{64}$/.test(row.conditionId));
    assert.ok(first);
    const detailPath = `/api/markets/contract/${first.conditionId}`;
    const detail = readProxyResponseSchema.parse((await daemon.getJson(`/ui/read/xo_data${detailPath}`, token)).json());
    assert.deepEqual(detail.body, await direct(daemon.mock.dataApi, detailPath));
    const tokenId = (detail.body as { outcomes: { outcomeTokenId: string }[] }).outcomes[0]?.outcomeTokenId;
    assert.match(String(tokenId), /^[1-9][0-9]{0,77}$/);
    const bookPath = `/book?token_id=${String(tokenId)}`;
    const book = readProxyResponseSchema.parse((await daemon.getJson(`/ui/read/xo_orderbook${bookPath}`, token)).json());
    assert.equal(book.service, "xo_orderbook");
    assert.deepEqual(book.body, await direct(daemon.mock.orderbook, bookPath));
  });

  it("lets the agent token read as well, and gives it no more than read and prepare", async () => {
    const agent = daemon.agentToken();
    assert.ok(agent);
    const read = await daemon.getJson(`/ui/read/xo_data${LIST}`, agent);
    assert.equal(read.status, 200);
    // The arm routes belong to the page; the agent's token is refused there. A submit-class tool is refused for the
    // page token (it can never hold submit) and, with no ARM window, for everyone.
    const arm = await daemon.postJson("/ui/arm", { minutes: 1 }, bearer(agent));
    assert.equal(arm.status, 403, "arming is for the page only");
    const submit = await daemon.postJson("/ui/tool", { tool: "xo_submit_order", args: { prepared_id: "0".repeat(32) } }, bearer(token));
    assert.equal(submit.status, 403, "a page token can never submit");
    assert.match(token, UI_TOKEN_PATTERN);
  });
});

describe("M1-3: what the proxy refuses (through the real process)", () => {
  const read = (service: string, path: string): Promise<Reply> => daemon.getJson(`/ui/read/${service}${path}`, token);

  it("a service that is not on the list", async () => {
    for (const service of ["nope", "xo_orderbook%2f..", "evil.example", "XO_DATA", "xo_data%00"]) {
      const reply = await read(service, "/api/markets");
      assert.ok(reply.status === 403 || reply.status === 400, `${service} -> ${reply.status}`);
    }
  });

  it("a path that is not on the service's list, and traversal tricks", async () => {
    for (const [service, path] of [
      ["xo_data", "/api/admin"],
      ["xo_data", "/api/markets/../admin"],
      ["xo_data", "/api/markets/%2e%2e/admin"],
      ["xo_data", "//evil.example/api/markets"],
      ["xo_orderbook", "/orders"],
      ["xo_orderbook", "/trades"],
      ["xo_orderbook", "/auth/derive-api-key"],
    ] as const) {
      const reply = await read(service, path);
      assert.ok(reply.status >= 400 && reply.status < 500, `${service}${path} -> ${reply.status}`);
      assert.ok(code(reply) !== undefined, `${service}${path} gives a coded error`);
    }
  });

  it("credential-shaped query names, on a path that is otherwise allowed", async () => {
    const reply = await read("xo_data", `${LIST}&api_key=abc`);
    assert.equal(reply.status, 403);
  });

  it("a write method on a read service, and a JSON-RPC method that is not read-only", async () => {
    const post = await daemon.postJson("/ui/read/xo_data/api/markets", {}, bearer(token));
    assert.equal(post.status, 405);
    const send = await daemon.postJson("/ui/read/xo_rpc/", { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: ["0x00"] }, bearer(token));
    assert.equal(send.status, 403);
    assert.equal(code(send), "rpc_method_not_allowed");
    const batch = await daemon.postJson("/ui/read/xo_rpc/", [{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }, { jsonrpc: "2.0", id: 2, method: "eth_sendTransaction", params: [] }], bearer(token));
    assert.equal(batch.status, 403, "one bad call refuses the whole batch");
  });

  it("an oversize request body", async () => {
    // Declared length over the limit: the daemon answers before reading the body (a client that uploads the whole body
    // would see the connection cut instead, which is also a refusal).
    const text = await daemon.raw(
      `POST /ui/read/xo_rpc/ HTTP/1.1\r\nHost: 127.0.0.1:${daemon.port}\r\nContent-Type: application/json\r\nAuthorization: Bearer ${token}\r\nContent-Length: ${4 * 1024 * 1024}\r\nConnection: close\r\n\r\n{"jsonrpc":"2.0"`,
      500,
    );
    assert.match(text, /^HTTP\/1\.1 413 /);
  });

  it("a restricted-terms venue, which ships OFF", async () => {
    const reply = await read("kalshi", "/trade-api/v2/markets");
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "venue_disabled");
  });

  it("never leaves the machine: a request for a real venue host is refused by the stand-in upstream and counted", async () => {
    const before = daemon.blockedHosts().length;
    const reply = await read("polymarket_gamma", "/public-search?q=test&limit_per_type=1");
    assert.ok(reply.status >= 400, "no data came back");
    const hosts = daemon.blockedHosts();
    assert.ok(hosts.length > before, "the launcher refused the connection");
    assert.ok(hosts.includes("gamma-api.polymarket.com"));
    // Only the host this test asked for was ever attempted: every refusal above happened before any upstream call.
    assert.deepEqual([...new Set(hosts)], ["gamma-api.polymarket.com"]);
  });
});
