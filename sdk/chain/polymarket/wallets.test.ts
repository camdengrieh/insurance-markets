import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { decodeFunctionData, encodeAbiParameters, getAddress, keccak256, padHex, parseAbi, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { depositWalletCandidates } from "../../trade/clob/polymarket/deposit-wallet.js";
import { createPinGuard } from "../pins.js";
import { createRpcPort, type RpcHttpResponse } from "../rpc.js";
import { POLYMARKET_PROXY_WALLET_FACTORY, POLYMARKET_PROXY_WALLET_IMPLEMENTATION, POLYMARKET_SAFE_FACTORY, POLYMARKET_SAFE_SINGLETON, POLYMARKET_WALLET_PINS } from "./constants.js";
import {
  PROXY_WALLET_RUNTIME_CODE,
  PUBLISHED_PROXY_INIT_CODE_HASH,
  PUBLISHED_SAFE_INIT_CODE_HASH,
  SAFE_PROXY_RUNTIME_CODE,
  findPolymarketWallets,
  polymarketWalletCandidates,
  proxyWalletAddress,
  proxyWalletInitCode,
  safeAddress,
  safeInitCode,
} from "./wallets.js";

// The derivation of a signer's Polymarket wallets (wallets.ts) against the vectors Polymarket publishes, and the
// on-chain checks against an in-memory node. Every vector below is copied from the named official repository (read
// 2026-10-22); none was produced by this code.

// github.com/Polymarket/polymarket-sdk test/proxywallet_address.ts (commit 87c00cd1256f61038f1f60397456846b5ebc6b73):
// [signer, proxy wallet] for the factory 0xaB45c5A4B0c941a2F231C04C3f49182e1A254052.
const PROXY_VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["0x00002569317Dc5588b59BAe5F63F5F8945912e58", "0x0D56FeAd54dd28cb7A903E7C6f2AeED9a26D6910"],
  ["0x002b8410e87FE36907602bAD0706642AaA3B9f8d", "0xeDB217f9B4BEF2A328453C9ce669C01103b76256"],
  ["0x0050aCEb61fAD6F7130b678991a8AAb9e8bA01d4", "0x4631a2C46512B3639881b3b110189D520556d3A6"],
  ["0xffeE4f6510312b7E9d066b124bf84Cb81cF6d2D2", "0xa810B581E0614749845D8f8a1F77199b486D3b43"],
  ["0xff5Dc13E00593957F6a62F3a2F39e8446Bca2086", "0x28D96cFcAc8210167Ed63401850AB8609898d31E"],
  ["0xFF8F0f472C1B2c51a9869FfbFE59578e9f814eA3", "0xc7498D2C55dA9134f4Fcf8A8F5926bECCdBA409E"],
  ["0xFEf1a35FC07A89FF46E969F4a4Db6F601fA2E0d6", "0xaE7Be8967fd2d17cDeF9923035633f2905Ac0B9f"],
  ["0xfF161f8A02315BfddB94c8aC6c7AdaB3D605C155", "0x7D9023ed6C6a99F22aD6E5a9135BFb002088B92e"],
  ["0xfDd284a9B2A8Ff58585cA8fb027aecDe948C3f3e", "0xce2EF09B3E4F85C40CE593A4C7630648648e794f"],
  ["0xFD742C2b0359f73E79e13505c881B9D7aF81467D", "0x26aff3bD0ecd5Ff24b3200C71c052f5F804a04de"],
];

// github.com/Polymarket/py-builder-relayer-client tests/builder/test_derive.py test_derive_safe (commit
// 4968df278eebd933f47e530669ed517a896c9897), for the Safe factory 0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b.
const SAFE_VECTOR = { signer: "0x6e0c80c90ea6c15917308F820Eac91Ce2724B5b5", safe: "0x6d8c4e9aDF5748Af82Dabe2C6225207770d6B4fa" } as const;

// What eth_getCode returned on 2026-10-22 over the public Polygon RPC at the second proxy vector's wallet and at the
// Safe vector (both deployed).
const OBSERVED_PROXY_RUNTIME = "0x363d3d373d3d3d363d7344e999d5c2f66ef0861317f9a4805ac2e90aeb4f5af43d82803e903d91602b57fd5bf3";
const OBSERVED_SAFE_RUNTIME_KECCAK = "0x92565062fdea8761e07d9df2fcdbd66c0582af6ddf0e0355bc07754ad97400b0";

// Public test signers (the Hardhat and Anvil default accounts 1 and 2).
const SIGNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
const STRANGER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;

describe("Polymarket wallet derivation", () => {
  it("the proxy wallet init code built from the factory's source hashes to the relayer client's published constant", () => {
    expect(keccak256(proxyWalletInitCode())).toBe(PUBLISHED_PROXY_INIT_CODE_HASH);
    expect(proxyWalletInitCode().length).toBe(2 + 2 * (99 + 68));
  });

  it("derives every proxy wallet vector of polymarket-sdk", () => {
    for (const [signer, wallet] of PROXY_VECTORS) expect(proxyWalletAddress(signer as `0x${string}`)).toBe(wallet);
  });

  it("the proxy wallet runtime is the clone the deployed wallets hold, naming the pinned implementation", () => {
    expect(PROXY_WALLET_RUNTIME_CODE).toBe(OBSERVED_PROXY_RUNTIME);
    expect(PROXY_WALLET_RUNTIME_CODE).toContain(POLYMARKET_PROXY_WALLET_IMPLEMENTATION.slice(2).toLowerCase());
    expect(proxyWalletInitCode()).toContain(POLYMARKET_PROXY_WALLET_FACTORY.slice(2).toLowerCase());
  });

  it("the Safe init code (proxy creation code plus the pinned singleton) hashes to the published constant", () => {
    expect(keccak256(safeInitCode())).toBe(PUBLISHED_SAFE_INIT_CODE_HASH);
    expect(safeInitCode().endsWith(POLYMARKET_SAFE_SINGLETON.slice(2).toLowerCase())).toBe(true);
  });

  it("derives the Safe vector of py-builder-relayer-client", () => {
    expect(safeAddress(SAFE_VECTOR.signer)).toBe(SAFE_VECTOR.safe);
  });

  it("the Safe runtime is the 124 bytes the deployed Safe holds", () => {
    expect((SAFE_PROXY_RUNTIME_CODE.length - 2) / 2).toBe(124);
    expect(keccak256(SAFE_PROXY_RUNTIME_CODE)).toBe(OBSERVED_SAFE_RUNTIME_KECCAK);
  });

  it("the factories and what they clone are the pinned contracts", () => {
    expect(POLYMARKET_WALLET_PINS.proxyWalletFactory.address).toBe(POLYMARKET_PROXY_WALLET_FACTORY);
    expect(POLYMARKET_WALLET_PINS.proxyWalletImplementation.address).toBe(POLYMARKET_PROXY_WALLET_IMPLEMENTATION);
    expect(POLYMARKET_WALLET_PINS.safeFactory.address).toBe(POLYMARKET_SAFE_FACTORY);
    expect(POLYMARKET_WALLET_PINS.safeSingleton.address).toBe(POLYMARKET_SAFE_SINGLETON);
    // The recorded code of the proxy wallet implementation is what the clone runtime delegates to.
    const recorded = readFileSync(fileURLToPath(new URL("../../../test/fixtures/chain-bytecode/polygon/polymarket-proxy-wallet-implementation.hex", import.meta.url)), "utf8").trim() as Hex;
    expect(keccak256(recorded)).toBe(POLYMARKET_WALLET_PINS.proxyWalletImplementation.codeHash);
  });

  it("names four candidates: proxy, Safe and both Deposit Wallet forms, whatever the address's case", () => {
    const candidates = polymarketWalletCandidates(SIGNER.toLowerCase() as `0x${string}`);
    expect(candidates.map((candidate) => candidate.kind)).toEqual(["proxy", "safe", "deposit_beacon", "deposit_uups"]);
    const deposit = depositWalletCandidates(SIGNER);
    expect(candidates[2]?.address).toBe(deposit.find((entry) => entry.proxy === "beacon")?.address);
    expect(candidates[3]?.address).toBe(deposit.find((entry) => entry.proxy === "uups")?.address);
    expect(candidates[0]?.address).toBe(proxyWalletAddress(SIGNER));
  });
});

// ---- the on-chain checks ----------------------------------------------------------------------------------------------------

const OWNER_ABI = parseAbi(["function getOwners() view returns (address[])", "function owner() view returns (address)"]);

interface Node {
  readonly code: Record<string, string>;
  readonly slot0?: Record<string, string>;
  readonly owners?: Record<string, readonly string[]>;
  readonly owner?: Record<string, string>;
}

function node(chain: Node) {
  const methods: string[] = [];
  const answer = (item: { id: number; method: string; params: unknown[] }) => {
    methods.push(item.method);
    const base = { jsonrpc: "2.0", id: item.id };
    const address = String((item.method === "eth_call" ? (item.params[0] as { to: string }).to : item.params[0]) ?? "").toLowerCase();
    if (item.method === "eth_getCode") return { ...base, result: chain.code[address] ?? "0x" };
    if (item.method === "eth_getStorageAt") return { ...base, result: chain.slot0?.[address] ?? `0x${"00".repeat(32)}` };
    if (item.method === "eth_call") {
      const { functionName } = decodeFunctionData({ abi: OWNER_ABI, data: (item.params[0] as { data: Hex }).data });
      if (functionName === "getOwners" && chain.owners?.[address] !== undefined) return { ...base, result: encodeAbiParameters([{ type: "address[]" }], [chain.owners[address] as `0x${string}`[]]) };
      if (functionName === "owner" && chain.owner?.[address] !== undefined) return { ...base, result: encodeAbiParameters([{ type: "address" }], [chain.owner[address] as `0x${string}`]) };
      return { ...base, error: { code: 3, message: "execution reverted" } };
    }
    return { ...base, error: { code: -32601, message: "no" } };
  };
  const post = async (_url: string, body: unknown): Promise<RpcHttpResponse> => ({
    status: 200,
    body: Array.isArray(body) ? (body as never[]).map(answer) : answer(body as never),
  });
  const port = createRpcPort({ url: "https://polygon.example.test/", post, methods: ["eth_getCode", "eth_getStorageAt", "eth_call"] });
  return { port, methods };
}

const recordedCode = (name: string): string => readFileSync(fileURLToPath(new URL(`../../../test/fixtures/chain-bytecode/polygon/${name}.hex`, import.meta.url)), "utf8").trim();

describe("findPolymarketWallets", () => {
  const [proxy, safe, beacon, uups] = polymarketWalletCandidates(SIGNER);
  if (proxy === undefined || safe === undefined || beacon === undefined || uups === undefined) throw new Error("candidates");
  const key = (address: string) => address.toLowerCase();
  const singletonSlot = padHex(POLYMARKET_SAFE_SINGLETON.toLowerCase() as Hex, { size: 32 });
  const singletonCode = { [key(POLYMARKET_SAFE_SINGLETON)]: recordedCode("polymarket-safe-singleton") };

  it("nothing deployed: every candidate is not_deployed, and only eth_getCode is asked", async () => {
    const { port, methods } = node({ code: {} });
    const checks = await findPolymarketWallets(port, SIGNER);
    expect(checks.map((entry) => entry.state)).toEqual(["not_deployed", "not_deployed", "not_deployed", "not_deployed"]);
    expect(new Set(methods)).toEqual(new Set(["eth_getCode"]));
  });

  it("finds a proxy wallet, a Safe the signer owns and a Deposit Wallet the signer owns", async () => {
    const { port } = node({
      code: { [key(proxy.address)]: proxy.runtimeCode, [key(safe.address)]: safe.runtimeCode, [key(beacon.address)]: beacon.runtimeCode, ...singletonCode },
      slot0: { [key(safe.address)]: singletonSlot },
      owners: { [key(safe.address)]: [STRANGER, SIGNER] },
      owner: { [key(beacon.address)]: SIGNER },
    });
    const checks = await findPolymarketWallets(port, SIGNER, { guard: createPinGuard(port) });
    expect(checks.map((entry) => [entry.kind, entry.state])).toEqual([
      ["proxy", "found"],
      ["safe", "found"],
      ["deposit_beacon", "found"],
      ["deposit_uups", "not_deployed"],
    ]);
    expect(checks[1]?.address).toBe(getAddress(safe.address));
  });

  it("refuses a Safe the signer does not own, a Deposit Wallet owned by another address, and code that is not the wallet's", async () => {
    const { port } = node({
      code: { [key(proxy.address)]: "0x6000", [key(safe.address)]: safe.runtimeCode, [key(uups.address)]: uups.runtimeCode, ...singletonCode },
      slot0: { [key(safe.address)]: singletonSlot },
      owners: { [key(safe.address)]: [STRANGER] },
      owner: { [key(uups.address)]: STRANGER },
    });
    const checks = await findPolymarketWallets(port, SIGNER, { guard: createPinGuard(port) });
    expect(checks.map((entry) => entry.state)).toEqual(["foreign_code", "not_owner", "not_deployed", "not_owner"]);
    expect(checks.every((entry) => entry.state === "found" || (entry.why ?? "").length > 0)).toBe(true);
  });

  it("does not trust a Safe whose singleton slot moved, or whose singleton's code is not the pinned code", async () => {
    const moved = node({ code: { [key(safe.address)]: safe.runtimeCode, ...singletonCode }, slot0: { [key(safe.address)]: padHex(STRANGER.toLowerCase() as Hex, { size: 32 }) }, owners: { [key(safe.address)]: [SIGNER] } });
    expect((await findPolymarketWallets(moved.port, SIGNER))[1]?.state).toBe("singleton_not_pinned");
    const changed = node({ code: { [key(safe.address)]: safe.runtimeCode, [key(POLYMARKET_SAFE_SINGLETON)]: "0x6000" }, slot0: { [key(safe.address)]: singletonSlot }, owners: { [key(safe.address)]: [SIGNER] } });
    const checks = await findPolymarketWallets(changed.port, SIGNER, { guard: createPinGuard(changed.port) });
    expect(checks[1]?.state).toBe("singleton_not_pinned");
    expect(checks[1]?.why).toMatch(/not the code pinned/);
  });

  it("a wallet that does not answer who owns it is unreadable, not found", async () => {
    const { port } = node({ code: { [key(beacon.address)]: beacon.runtimeCode } });
    expect((await findPolymarketWallets(port, SIGNER))[2]?.state).toBe("unreadable");
  });
});
