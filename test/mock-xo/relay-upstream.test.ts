import assert from "node:assert/strict";
import { describe } from "node:test";

import { RELAY_USER_AGENT } from "../../src/relay/contract.js";
import { createUpstream, UpstreamError, XO_UPSTREAM_HOSTS, type Upstream } from "../../relay/upstream.js";
import { useMock } from "./testing.js";
import type { MockXo } from "./server.js";

// The relay's upstream client (relay/upstream.ts) against the mock: the same https hostnames and allowlist the
// relay uses, the mock plugged in through the client's `fetch` seam. This proves the mock fits the seam the
// relay will use; the client's own behaviour is tested in test/relay-core-upstream.test.ts.

function upstreamFor(mock: MockXo): Upstream {
  return createUpstream({
    hosts: XO_UPSTREAM_HOSTS,
    fetch: mock.asFetch,
    requestsPerSecond: 1000,
    sleep: async () => undefined,
    jitter: () => 0,
  });
}

describe("the relay's upstream client against the mock", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("reads the orderbook with the pinned User-Agent and no identifying header", async (mock) => {
    const response = await upstreamFor(mock).request({ method: "GET", url: "https://orderbooks.xo.market/time", purpose: "clock" });
    assert.equal(response.status, 200);
    assert.equal(response.body, String(mock.clock.nowSeconds()));
    const [entry] = mock.requestsTo("orderbook");
    assert.ok(entry !== undefined);
    assert.equal(entry.userAgent, RELAY_USER_AGENT);
    assert.equal(RELAY_USER_AGENT, "insurance-markets-xo-plugin/0.2");
    assert.equal(entry.from, null);
    assert.equal(entry.referer, null);
    assert.equal(entry.origin, null);
    assert.ok(!entry.headerNames.includes("cookie") && !entry.headerNames.includes("authorization"));
  });

  harness.it("retries a GET once after a 429 and succeeds, and does not look past the allowlist", async (mock) => {
    mock.injectFault("429-retry-after", { count: 1, listeners: ["orderbook"], retryAfterMs: 100 });
    const response = await upstreamFor(mock).request({ method: "GET", url: "https://orderbooks.xo.market/time", purpose: "clock" });
    assert.equal(response.status, 200);
    assert.equal(mock.requestsTo("orderbook").length, 2);
    await assert.rejects(
      upstreamFor(mock).request({ method: "GET", url: "https://example.com/time", purpose: "clock" }),
      (error: unknown) => error instanceof UpstreamError && error.kind === "host_not_allowed",
    );
    assert.equal(mock.requests.filter((entry) => entry.path === "/time").length, 2, "the refused host reached nothing");
  });

  harness.it("latches 'requires key' on the first 401 from the XO RPC and the bundler, and then sends nothing more", async (mock) => {
    mock.setSwitch("rpc.access", "requires-key");
    const upstream = upstreamFor(mock);
    const call = (host: string) => upstream.request({ method: "POST", url: `https://${host}/`, purpose: "chain_read", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    for (const [host, door] of [
      ["rpc-mainnet-2.xo.market", "xoRpc"],
      ["mainnet-bundler.xo.market", "bundler"],
    ] as const) {
      await assert.rejects(call(host), (error: unknown) => error instanceof UpstreamError && error.kind === "requires_key", host);
      assert.equal(upstream.hostState(host), "requires_key");
      await assert.rejects(call(host), (error: unknown) => error instanceof UpstreamError && error.kind === "requires_key", host);
      assert.equal(mock.requestsTo(door).length, 1, `${host}: after the latch nothing is sent`);
    }
  });

  harness.it("with the node open the same calls succeed; with it down they fail as a network error", async (mock) => {
    const upstream = upstreamFor(mock);
    const call = () => upstream.request({ method: "POST", url: "https://rpc-mainnet-2.xo.market/", purpose: "chain_read", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    mock.setSwitch("rpc.access", "open");
    const ok = await call();
    assert.equal(ok.status, 200);
    assert.deepEqual(upstream.json(ok), { jsonrpc: "2.0", id: 1, result: "0xc97" });
    mock.setSwitch("rpc.access", "down");
    await assert.rejects(call(), (error: unknown) => error instanceof UpstreamError && error.kind === "network");
  });

  harness.it("reads the explorer's getLogs through it", async (mock) => {
    const response = await upstreamFor(mock).request({
      method: "GET",
      url: "https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest",
      purpose: "logs",
    });
    assert.equal(response.status, 200);
    assert.equal((JSON.parse(response.body) as { status: string }).status, "1");
  });
});
