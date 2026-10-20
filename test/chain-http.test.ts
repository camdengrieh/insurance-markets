import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  XO_DATA_API_HOST,
  XO_EXPLORER_HOST,
  XO_ORDERBOOK_HOST,
  XO_PLUGIN_HOSTS,
  XoError,
  XoHttp,
  type FetchLike,
} from "../src/xo/http.js";
import { ExplorerLogReader, explorerTransportFromHttp } from "../src/xo/chain/reads.js";
import * as C from "../src/xo/chain/constants.js";
import { jsonResponse } from "./fixtures/xo/load.js";

const noSleep = async (): Promise<void> => undefined;
const ok: FetchLike = async () => jsonResponse({ ok: 1 });
const make = (extra: ConstructorParameters<typeof XoHttp>[0] = {}): XoHttp => new XoHttp({ fetchImpl: ok, minIntervalMs: 0, sleep: noSleep, ...extra });

const EXPLORER_URL = `https://${XO_EXPLORER_HOST}/api?module=logs&action=getLogs`;
const ORDERBOOK_URL = `https://${XO_ORDERBOOK_HOST}/time`;

async function blocked(client: XoHttp, url: string): Promise<void> {
  try {
    await client.getJson(url);
  } catch (error) {
    assert.ok(error instanceof XoError, String(error));
    assert.equal(error.kind, "blocked", url);
    return;
  }
  assert.fail(`${url} should be blocked`);
}

describe("XoHttp host allowlist parameter", () => {
  it("keeps the two read APIs as the default, so the explorer stays blocked until a caller opts in", async () => {
    const client = make();
    assert.deepEqual(await client.getJson(ORDERBOOK_URL), { ok: 1 });
    await blocked(client, EXPLORER_URL);
    assert.deepEqual(client.requestCounts(), { [XO_ORDERBOOK_HOST]: 1 });
  });

  it("lets the plugin opt in to the explorer with XO_PLUGIN_HOSTS (orderbook, data API, explorer)", async () => {
    assert.deepEqual([...XO_PLUGIN_HOSTS], [XO_ORDERBOOK_HOST, XO_DATA_API_HOST, XO_EXPLORER_HOST]);
    const client = make({ allowedHosts: XO_PLUGIN_HOSTS });
    for (const url of [ORDERBOOK_URL, `https://${XO_DATA_API_HOST}/api/markets`, EXPLORER_URL]) assert.deepEqual(await client.getJson(url), { ok: 1 });
    await blocked(client, "https://rpc-mainnet-2.xo.market/");
    await blocked(client, "https://mainnet-bundler.xo.market/");
    await blocked(client, "https://example.com/");
  });

  it("lets a relay pass a larger set of its own, and nothing outside it", async () => {
    const hosts = [...XO_PLUGIN_HOSTS, "rpc-mainnet-2.xo.market", "mainnet-bundler.xo.market", "mainnet.base.org"];
    const client = make({ allowedHosts: hosts });
    for (const host of hosts) assert.deepEqual(await client.getJson(`https://${host}/x`), { ok: 1 }, host);
    await blocked(client, "https://base.drpc.org/");
  });

  it("honours a narrower set too", async () => {
    const client = make({ allowedHosts: [XO_EXPLORER_HOST] });
    assert.deepEqual(await client.getJson(EXPLORER_URL), { ok: 1 });
    await blocked(client, ORDERBOOK_URL);
  });

  it("still blocks http, userinfo, ports, suffix hosts, trailing dots and look-alikes for a listed host", async () => {
    const client = make({ allowedHosts: XO_PLUGIN_HOSTS });
    for (const url of [
      `http://${XO_EXPLORER_HOST}/api`,
      `https://user:pw@${XO_EXPLORER_HOST}/api`,
      `https://${XO_EXPLORER_HOST}:8443/api`,
      `https://${XO_EXPLORER_HOST}./api`,
      `https://${XO_EXPLORER_HOST}.evil.example/api`,
      `https://evil-${XO_EXPLORER_HOST}/api`,
      `https://${XO_EXPLORER_HOST}@evil.example/api`,
      "https://xo.market/",
      "not a url",
    ]) {
      await blocked(client, url);
    }
  });

  it("rejects a malformed host list at construction, so a typo cannot widen access", () => {
    const bad: string[][] = [
      [],
      [""],
      ["*.xo.market"],
      ["xo.market:443"],
      ["https://explorer-mainnet.xo.market"],
      ["explorer-mainnet.xo.market/"],
      ["Explorer-Mainnet.XO.market"],
      ["user@explorer-mainnet.xo.market"],
      ["127.0.0.1"],
      ["10.0.0.1"],
      ["localhost"],
      ["exa mple.com"],
      ["-bad.example.com"],
      [XO_EXPLORER_HOST, ""],
    ];
    for (const hosts of bad) assert.throws(() => new XoHttp({ allowedHosts: hosts }), RangeError, JSON.stringify(hosts));
  });

  it("counts requests per allowed host like before", async () => {
    const client = make({ allowedHosts: XO_PLUGIN_HOSTS });
    await client.getJson(EXPLORER_URL);
    await client.getJson(EXPLORER_URL);
    await client.getJson(ORDERBOOK_URL);
    assert.deepEqual(client.requestCounts(), { [XO_EXPLORER_HOST]: 2, [XO_ORDERBOOK_HOST]: 1 });
  });
});

describe("explorer reads through XoHttp", () => {
  it("runs a getLogs query through the real transport, with the plugin's own User-Agent and no credentials", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      seen.push({ url: input, init });
      return jsonResponse({ status: "0", message: "No logs found", result: [] });
    };
    const http = new XoHttp({ fetchImpl, minIntervalMs: 0, sleep: noSleep, allowedHosts: XO_PLUGIN_HOSTS });
    const reader = new ExplorerLogReader({ transport: explorerTransportFromHttp(http) });
    const result = await reader.getLogs({ address: C.ENTRY_POINT_V07, topic0: C.ACCOUNT_DEPLOYED_TOPIC });
    assert.deepEqual([result.logs.length, result.complete], [0, true]);
    assert.equal(seen.length, 1);
    const request = seen[0];
    assert.ok(request !== undefined);
    assert.equal(new URL(request.url).hostname, XO_EXPLORER_HOST);
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.credentials, "omit");
    assert.equal((request.init.headers as Record<string, string>)["user-agent"], "insurance-markets-xo-plugin/0.2");
    assert.deepEqual(Object.keys(request.init.headers as Record<string, string>).sort(), ["accept", "user-agent"]);
  });

  it("is refused by a default client, before any request, with a 'blocked' error mapped to invalid_input", async () => {
    let calls = 0;
    const http = new XoHttp({ fetchImpl: async () => { calls += 1; return jsonResponse({}); }, minIntervalMs: 0, sleep: noSleep });
    const reader = new ExplorerLogReader({ transport: explorerTransportFromHttp(http) });
    await assert.rejects(reader.getLogs({ topic0: C.ACCOUNT_DEPLOYED_TOPIC }), (error: unknown) => error instanceof Error && (error as { code?: string }).code === "invalid_input");
    assert.equal(calls, 0);
  });
});
