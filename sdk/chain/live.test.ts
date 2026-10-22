import { describe, expect, it } from "vitest";

import type { FetchLike } from "../model.js";
import { LIMITLESS_PINS, BASE_RPC_URL } from "./limitless/constants.js";
import { MULTICALL3_PINS } from "./multicall.js";
import { checkPin, type ContractPin } from "./pins.js";
import { POLYGON_RPC_URL, POLYMARKET_PINS } from "./polymarket/constants.js";
import { createRpcPort, rpcPostFromFetch } from "./rpc.js";
import { XO_PINS, XO_RPC_URL } from "./xo/pins.js";

// Live drift suite: OPT-IN. It reads the code of every pinned contract from the public RPCs the dApp names and runs
// only with APP_LIVE=1, so a normal test run stays offline. eth_getCode and eth_getStorageAt only; the fixed research
// User-Agent and nothing else that identifies a person. A failure is a finding: a contract was upgraded or replaced
// since 2026-10-22, and the readers now refuse to read it until the pin is reviewed.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: init?.method ?? "GET",
    headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    ...(init?.body === undefined ? {} : { body: init.body }),
  });
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: () => response.json() as Promise<unknown>, text: () => response.text() };
};

const chains: ReadonlyArray<[string, string, readonly ContractPin[]]> = [
  ["Polygon", POLYGON_RPC_URL, [...Object.values(POLYMARKET_PINS), MULTICALL3_PINS[137]]],
  ["Base", BASE_RPC_URL, [...Object.values(LIMITLESS_PINS), MULTICALL3_PINS[8453]]],
  ["XO", XO_RPC_URL, Object.values(XO_PINS)],
];

describe.skipIf(!LIVE)("chain pins live drift (APP_LIVE=1)", () => {
  it.each(chains)("%s: every pinned contract still has its pinned code", async (_name, url, pins) => {
    const port = createRpcPort({ url, post: rpcPostFromFetch(liveFetch), methods: ["eth_getCode", "eth_getStorageAt"] });
    for (const pin of pins) expect(await checkPin(port, pin), pin.name).toEqual({ ok: true });
  }, 120_000);
});
