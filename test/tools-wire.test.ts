import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import { loadConfig } from "../src/config.js";
import { createRelayClientFromConfig } from "../src/relay/client.js";
import { RELAY_KEY_HEADER, RELAY_USER_AGENT } from "../src/relay/contract.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { ACCOUNT, ENV_ON, NOW, OWNER, RELAY_KEY, SIGNATURE, asObj, closeAll, connect, digestOf, makeDeps, must, orderPrepared, statusResponse, userOpPrepared } from "./tools-helpers.js";

// The tools through the REAL relay client against a loopback HTTP server that this file starts on a free
// port (127.0.0.1 only) and closes afterwards: the wire shape, the headers, and the "one request, no retry"
// rule for a state-changing call whose answer is lost.

interface Seen {
  readonly method: string | undefined;
  readonly url: string | undefined;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
}

const servers: Server[] = [];
afterEach(async () => {
  await closeAll();
  while (servers.length > 0) {
    const server = servers.pop();
    await new Promise<void>((resolve) => {
      server?.closeAllConnections();
      server?.close(() => resolve());
    });
  }
});

async function relayServer(handler: (seen: Seen, response: ServerResponse) => void): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const entry: Seen = { method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(entry);
      handler(entry, response);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

async function toolsFor(url: string, key = RELAY_KEY): Promise<Awaited<ReturnType<typeof connect>>> {
  const env = { ...ENV_ON, XO_RELAY_URL: url, XO_RELAY_KEY: key };
  const built = makeDeps({ env });
  const deps = { ...built.deps, relay: () => createRelayClientFromConfig(loadConfig(env).config) };
  return connect((server) => {
    registerUseropTools(server, deps);
    registerTradeTools(server, deps);
  });
}

describe("through the real relay client", () => {
  it("prepares a user operation: status then prepare, with the fixed headers and the relay key", async () => {
    const prepared = userOpPrepared({ seed: "wire" });
    const { url, seen } = await relayServer((entry, response) => {
      if (entry.url === "/v1/account/status") return json(response, 200, statusResponse({ state: "undeployed" }));
      if (entry.url === "/v1/userop/prepare") return json(response, 200, prepared);
      return json(response, 404, { error: { code: "not_found", message: "no such route" } });
    });
    const harness = await toolsFor(url);
    const result = await harness.call("xo_deploy_enable_trading", { step: "prepare", owner: OWNER });
    assert.equal(result.isError, false, result.text);
    const out = must(result.structured);
    assert.deepEqual(out["sign_with_paybox"], { op: "raw", rawSigningPayloadHex: digestOf("wire") });
    assert.deepEqual(seen.map((entry) => `${entry.method} ${entry.url}`), ["POST /v1/account/status", "POST /v1/userop/prepare"]);
    for (const entry of seen) {
      assert.equal(entry.headers[RELAY_KEY_HEADER], RELAY_KEY);
      assert.equal(entry.headers["user-agent"], RELAY_USER_AGENT);
      assert.match(String(entry.headers["content-type"]), /application\/json/);
      assert.equal(entry.headers["cookie"], undefined);
      assert.equal(entry.headers["referer"], undefined);
    }
    assert.deepEqual(JSON.parse(must(seen[1]).body), { owner: OWNER, account: ACCOUNT, action: "deploy_enable_trading", params: {} });
    // The relay key never comes back in what the agent sees.
    assert.equal((result.text + JSON.stringify(result.structured)).includes(RELAY_KEY), false);
  });

  it("sends a signed submit exactly once, and calls a lost answer ambiguous without retrying", async () => {
    const { url, seen } = await relayServer((_entry, response) => {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end("bad gateway, not json");
    });
    const harness = await toolsFor(url);
    const result = await harness.call("xo_submit_userop", { prepared_id: "ab".repeat(16), signature: SIGNATURE });
    assert.equal(result.isError, true);
    const out = must(result.structured);
    assert.equal(out["outcome"], "ambiguous");
    assert.match(String(out["next_action"]), /Do NOT submit this again/);
    assert.equal(seen.length, 1, "a state-changing call is never retried");
    assert.deepEqual(JSON.parse(must(seen[0]).body), { prepared_id: "ab".repeat(16), signature: SIGNATURE });
  });

  it("maps the relay's own error body to its code, and a wrong key to unauthorized", async () => {
    const { url } = await relayServer((entry, response) => {
      if (entry.headers[RELAY_KEY_HEADER] !== RELAY_KEY) return json(response, 401, { error: { code: "unauthorized", message: "bad key" } });
      return json(response, 422, { error: { code: "cap_exceeded", message: "daily cap would be exceeded", details: { cap: "daily" } } });
    });
    const good = await toolsFor(url);
    const capped = await good.call("xo_prepare_order", { owner: OWNER, token_id: "123", side: "BUY", price: "0.5", shares: "10" });
    assert.equal(must(capped.structured)["code"], "cap_exceeded");
    assert.equal(asObj(must(capped.structured)["relay_details"])["cap"], "daily");
    const bad = await toolsFor(url, "another-test-key-0123456789ABCDEF");
    const denied = await bad.call("xo_prepare_order", { owner: OWNER, token_id: "123", side: "BUY", price: "0.5", shares: "10" });
    assert.equal(must(denied.structured)["code"], "unauthorized");
  });

  it("says relay_not_configured when nothing listens at the configured address", async () => {
    // Find a port that is free right now, then close it, so the connection is refused.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const harness = await toolsFor(`http://127.0.0.1:${port}`);
    const result = await harness.call("xo_prepare_order", { owner: OWNER, token_id: "123", side: "BUY", price: "0.5", shares: "10" });
    assert.equal(result.isError, true);
    assert.equal(must(result.structured)["code"], "relay_not_configured");
  });

  it("prepares an order end to end and passes the relay's quote through", async () => {
    const prepared = orderPrepared({ seed: "wire-order" });
    const { url, seen } = await relayServer((entry, response) => (entry.url === "/v1/order/prepare" ? json(response, 200, prepared) : json(response, 404, { error: { code: "not_found", message: "x" } })));
    const harness = await toolsFor(url);
    const result = await harness.call("xo_prepare_order", { owner: OWNER, token_id: "123", side: "BUY", price: "0.5", shares: "10" });
    assert.equal(result.isError, false, result.text);
    assert.deepEqual(must(result.structured)["prepared"], prepared);
    assert.deepEqual(JSON.parse(must(seen[0]).body), { owner: OWNER, account: ACCOUNT, token_id: "123", side: "BUY", price: "0.5", shares: "10", tif: "GTD", purpose: "trade" });
    assert.ok(NOW > 0);
  });
});
