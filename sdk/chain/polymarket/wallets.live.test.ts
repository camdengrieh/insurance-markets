import { decodeFunctionResult, encodeFunctionData, keccak256, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

import type { FetchLike } from "../../model.js";
import { checkPin } from "../pins.js";
import { createRpcPort, rpcPostFromFetch } from "../rpc.js";
import { POLYGON_RPC_URL, POLYMARKET_PROXY_WALLET_FACTORY, POLYMARKET_PROXY_WALLET_IMPLEMENTATION, POLYMARKET_SAFE_FACTORY, POLYMARKET_SAFE_SINGLETON, POLYMARKET_WALLET_PINS } from "./constants.js";
import { PUBLISHED_SAFE_INIT_CODE_HASH, findPolymarketWallets, safeAddress } from "./wallets.js";

// Live check of the wallet derivation: OPT-IN, only with APP_LIVE=1, so a normal run stays offline. Read-only JSON-RPC
// to the public Polygon RPC the dApp names, with the fixed research User-Agent and nothing that identifies a person.
// It asks the deployed factories for their own answers and compares them with wallets.ts, and checks the published
// vectors' wallets on chain (run once on 2026-10-22, when it passed). A failure is a finding: review the derivation.
//
//   APP_LIVE=1 pnpm --dir app exec vitest run ../sdk/chain/polymarket/wallets.live.test.ts

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

const FACTORY_ABI = parseAbi([
  "function getImplementation() view returns (address)",
  "function masterCopy() view returns (address)",
  "function getContractBytecode() view returns (bytes)",
  "function computeProxyAddress(address user) view returns (address)",
]);

// The published vectors (wallets.test.ts names their sources): a polymarket-sdk proxy wallet signer whose wallet is
// deployed, and the py-builder-relayer-client Safe signer.
const PROXY_SIGNER = "0x002b8410e87FE36907602bAD0706642AaA3B9f8d" as const;
const SAFE_SIGNER = "0x6e0c80c90ea6c15917308F820Eac91Ce2724B5b5" as const;

describe.skipIf(!LIVE)("Polymarket wallet derivation, live (APP_LIVE=1)", () => {
  const port = createRpcPort({ url: POLYGON_RPC_URL, post: rpcPostFromFetch(liveFetch), methods: ["eth_getCode", "eth_getStorageAt", "eth_call"] });
  const read = async (to: `0x${string}`, functionName: "getImplementation" | "masterCopy" | "getContractBytecode" | "computeProxyAddress", args: readonly unknown[] = []): Promise<unknown> => {
    const data = await port.call({ to, data: encodeFunctionData({ abi: FACTORY_ABI, functionName, args } as never) });
    return decodeFunctionResult({ abi: FACTORY_ABI, functionName, data } as never) as unknown;
  };

  it("the factories and what they clone still have their pinned code", async () => {
    for (const pin of Object.values(POLYMARKET_WALLET_PINS)) expect(await checkPin(port, pin), pin.name).toEqual({ ok: true });
  }, 120_000);

  it("the factories' own answers equal the derivation", async () => {
    expect(await read(POLYMARKET_PROXY_WALLET_FACTORY, "getImplementation")).toBe(POLYMARKET_PROXY_WALLET_IMPLEMENTATION);
    expect(await read(POLYMARKET_SAFE_FACTORY, "masterCopy")).toBe(POLYMARKET_SAFE_SINGLETON);
    expect(keccak256((await read(POLYMARKET_SAFE_FACTORY, "getContractBytecode")) as `0x${string}`)).toBe(PUBLISHED_SAFE_INIT_CODE_HASH);
    expect(await read(POLYMARKET_SAFE_FACTORY, "computeProxyAddress", [SAFE_SIGNER])).toBe(safeAddress(SAFE_SIGNER));
  }, 120_000);

  it("the published vectors' wallets are found on chain", async () => {
    const proxy = await findPolymarketWallets(port, PROXY_SIGNER);
    expect(proxy.find((entry) => entry.kind === "proxy")?.state).toBe("found");
    const safe = await findPolymarketWallets(port, SAFE_SIGNER);
    expect(safe.find((entry) => entry.kind === "safe")?.state).toBe("found");
  }, 120_000);
});
