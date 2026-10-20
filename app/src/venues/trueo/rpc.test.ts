import { decodeFunctionResult, encodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import type { AdapterDeps } from "../../core/ports";
import { MARKET_ABI, QUOTER_ABI, STATE_VIEW_ABI } from "./abi";
import { isAdapterFailure } from "./errors";
import { buildWorld, DEPLOYMENT, NOW_MS, TYD, HOOK_V2 } from "./fixtures/scenario";
import { createRpc, type Address, type Hex } from "./rpc";

const URL_ = "https://rpc.example.test/";
const FAR = NOW_MS + 60_000;

function setup() {
  const world = buildWorld();
  const deps: AdapterDeps = { fetch: world.rpc.fetch, nowMs: () => NOW_MS };
  return { world, deps };
}

async function failureOf(promise: Promise<unknown>): Promise<{ code: string; detail: string; retryAfterMs: number | null }> {
  try {
    await promise;
  } catch (error) {
    if (isAdapterFailure(error)) return { code: error.code, detail: error.detail, retryAfterMs: error.retryAfterMs };
    throw error;
  }
  throw new Error("expected a failure");
}

const managerCount = (): { to: Address; data: Hex } => ({ to: DEPLOYMENT.manager as Address, data: "0x7d6a0d1a" });

describe("golden vectors computed with Foundry's cast (independent of viem)", () => {
  const YES = "0x1111111111111111111111111111111111111111" as Address;
  const key = { currency0: YES, currency1: TYD, fee: 1, tickSpacing: 60, hooks: HOOK_V2 };

  it("encodes quoteExactInputSingle(poolKey, zeroForOne, exactAmount, hookData) the way the V4Quoter ABI lays out a struct with bytes", () => {
    // cast calldata "quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))" "((YES,TYD,1,60,HOOK),true,1e18,0x)"
    expect(encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: key, zeroForOne: true, exactAmount: 10n ** 18n, hookData: "0x" }] })).toBe(
      "0xaa9d21cb00000000000000000000000000000000000000000000000000000000000000200000000000000000000000001111111111111111111111111111111111111111000000000000000000000000b13cf163d916917d9cd6e836905ca5f12a1def4b0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000003e83479b2276ecfb7c7181f67b5d092d3511e0c400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("encodes quoteExactOutputSingle with zeroForOne false and 5 shares", () => {
    expect(encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactOutputSingle", args: [{ poolKey: key, zeroForOne: false, exactAmount: 5n * 10n ** 18n, hookData: "0x" }] })).toBe(
      "0x5873307300000000000000000000000000000000000000000000000000000000000000200000000000000000000000001111111111111111111111111111111111111111000000000000000000000000b13cf163d916917d9cd6e836905ca5f12a1def4b0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000003e83479b2276ecfb7c7181f67b5d092d3511e0c400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004563918244f4000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("encodes getSlot0(bytes32) and decodes cast's slot0 and quote return data", () => {
    const id = "0x84564fc8fde8aeb9b26c3ab8632647e4f7a9c8d73fb4d69cd82bbbe5b99b74fa" as Hex;
    expect(encodeFunctionData({ abi: STATE_VIEW_ABI, functionName: "getSlot0", args: [id] })).toBe("0xc815641c84564fc8fde8aeb9b26c3ab8632647e4f7a9c8d73fb4d69cd82bbbe5b99b74fa");
    // cast abi-encode "f(uint160,int24,uint24,uint24)" 30500284735263970804878 -190000 0 1
    const slot0 = "0x0000000000000000000000000000000000000000000006756c7ac949ce11c48efffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd19d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001" as Hex;
    expect(decodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getSlot0", data: slot0 })).toEqual([30500284735263970804878n, -190000, 0, 1]);
    // cast abi-encode "f(uint256,uint256)" 148200 150000
    const quote = "0x00000000000000000000000000000000000000000000000000000000000242e800000000000000000000000000000000000000000000000000000000000249f0" as Hex;
    expect(decodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", data: quote })).toEqual([148200n, 150000n]);
  });

  it("decodes a getPoolKeys answer of two structs as cast encodes it", () => {
    // cast abi-encode "f(((address,address,uint24,int24,address),(address,address,uint24,int24,address)))" ...
    const data = "0x0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000b13cf163d916917d9cd6e836905ca5f12a1def4b0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000003e83479b2276ecfb7c7181f67b5d092d3511e0c4000000000000000000000000b13cf163d916917d9cd6e836905ca5f12a1def4b00000000000000000000000022222222222222222222222222222222222222220000000000000000000000000000000000000000000000000000000000001f40000000000000000000000000000000000000000000000000000000000000003c0000000000000000000000003e83479b2276ecfb7c7181f67b5d092d3511e0c4" as Hex;
    const [yes, no] = decodeFunctionResult({ abi: MARKET_ABI, functionName: "getPoolKeys", data });
    expect(yes.currency0.toLowerCase()).toBe(YES);
    expect([yes.fee, yes.tickSpacing]).toEqual([1, 60]);
    expect([no.currency1.toLowerCase(), no.fee]).toEqual(["0x2222222222222222222222222222222222222222", 8000]);
  });
});

describe("trueo rpc: batching and fallback", () => {
  it("sends many reads as one JSON-RPC batch POST", async () => {
    const { world, deps } = setup();
    const rpc = createRpc(deps, { url: URL_ });
    const results = await rpc.callMany(Array.from({ length: 10 }, managerCount), FAR);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(world.rpc.posts).toHaveLength(1);
    expect(Array.isArray(world.rpc.posts[0]?.body)).toBe(true);
    expect(rpc.mode()).toBe("batch");
  });

  it("splits into chunks of at most maxBatch", async () => {
    const { world, deps } = setup();
    const rpc = createRpc(deps, { url: URL_, maxBatch: 4 });
    await rpc.callMany(Array.from({ length: 10 }, managerCount), FAR);
    expect(world.rpc.posts.map((post) => (post.body as unknown[]).length)).toEqual([4, 4, 2]);
  });

  it("falls back to single requests, for good, when an array body is refused", async () => {
    const { world, deps } = setup();
    world.chain.rejectBatch = true;
    const rpc = createRpc(deps, { url: URL_ });
    const results = await rpc.callMany(Array.from({ length: 5 }, managerCount), FAR);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(rpc.mode()).toBe("single");
    const after = world.rpc.posts.length;
    await rpc.callMany(Array.from({ length: 3 }, managerCount), FAR);
    // 3 single POSTs and no more array attempts.
    expect(world.rpc.posts.length - after).toBe(3);
    expect(world.rpc.posts.slice(after).every((post) => !Array.isArray(post.body))).toBe(true);
  });

  it("never batches when told not to, and a single call is never an array", async () => {
    const { world, deps } = setup();
    await createRpc(deps, { url: URL_, batch: "never" }).callMany(Array.from({ length: 3 }, managerCount), FAR);
    await createRpc(deps, { url: URL_ }).callMany([managerCount()], FAR);
    expect(world.rpc.posts.every((post) => !Array.isArray(post.body))).toBe(true);
  });

  it("matches answers to calls by id, even when a node returns the batch out of order", async () => {
    const { world, deps } = setup();
    const inner = world.rpc.fetch;
    const reversing: AdapterDeps = {
      nowMs: deps.nowMs,
      fetch: async (url, init) => {
        const response = await inner(url, init);
        const body = JSON.parse(await response.text()) as unknown;
        const text = JSON.stringify(Array.isArray(body) ? [...body].reverse() : body);
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(text) as unknown, text: async () => text };
      },
    };
    const rpc = createRpc(reversing, { url: URL_ });
    const calls = [managerCount(), { to: DEPLOYMENT.manager as Address, data: encodeFunctionData({ abi: [{ type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const, functionName: "paused" }) }];
    const [count, paused] = await rpc.callMany(calls, FAR);
    expect(count?.ok && BigInt(count.data)).toBe(BigInt(world.chain.activeMarkets.length));
    expect(paused?.ok && BigInt(paused.data)).toBe(0n);
  });
});

describe("trueo rpc: failures", () => {
  it("classifies a revert per call and does not fail the batch", async () => {
    const { world, deps } = setup();
    const rpc = createRpc(deps, { url: URL_ });
    const results = await rpc.callMany([managerCount(), { to: world.live.address, data: "0x00000000" }], FAR);
    expect(results[0]?.ok).toBe(true);
    expect(results[1]).toEqual({ ok: false, kind: "revert" });
  });

  it("maps HTTP 429 to RATE_LIMITED with Retry-After, and does not change mode for it", async () => {
    const { world, deps } = setup();
    world.chain.limited = true;
    const rpc = createRpc(deps, { url: URL_ });
    expect(await failureOf(rpc.callMany([managerCount(), managerCount()], FAR))).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 3000 });
    world.chain.limited = false;
    await rpc.callMany([managerCount(), managerCount()], FAR);
    expect(rpc.mode()).toBe("batch");
  });

  it("maps a JSON-RPC limit error to RATE_LIMITED", async () => {
    const { deps } = setup();
    const limited: AdapterDeps = {
      nowMs: deps.nowMs,
      fetch: async () => {
        const text = JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32005, message: "limit exceeded" } });
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(text) as unknown, text: async () => text };
      },
    };
    expect(await failureOf(createRpc(limited, { url: URL_, batch: "never" }).callMany([managerCount()], FAR))).toMatchObject({ code: "RATE_LIMITED", detail: "rpc_limited" });
  });

  it("throws VENUE_PAUSED when every call fails for a reason other than a revert (the endpoint serves no reads)", async () => {
    const { world, deps } = setup();
    world.chain.failEverything = true;
    expect(await failureOf(createRpc(deps, { url: URL_ }).callMany([managerCount(), managerCount()], FAR))).toMatchObject({ code: "VENUE_PAUSED", detail: "rpc_errors" });
  });

  it("maps HTTP statuses and transport failures to the closed set without quoting the body", async () => {
    const { world, deps } = setup();
    const cases: Array<[number, string]> = [
      [403, "VENUE_PAUSED"],
      [500, "VENUE_PAUSED"],
      [504, "TIMEOUT"],
      [400, "SCHEMA_DRIFT"],
    ];
    for (const [status, code] of cases) {
      world.chain.httpStatus = status;
      const failure = await failureOf(createRpc(deps, { url: URL_, batch: "never" }).callMany([managerCount()], FAR));
      expect(failure.code).toBe(code);
      expect(failure.detail).toMatch(/^[a-z0-9_]+$/);
    }
    const down: AdapterDeps = { nowMs: deps.nowMs, fetch: async () => Promise.reject(new TypeError("Failed to fetch")) };
    expect(await failureOf(createRpc(down, { url: URL_ }).callMany([managerCount()], FAR))).toMatchObject({ code: "TIMEOUT", detail: "no_response" });
  });

  it("times out a hung endpoint at the deadline", async () => {
    const { world, deps } = setup();
    world.chain.hang = true;
    expect(await failureOf(createRpc(deps, { url: URL_ }).callMany([managerCount()], NOW_MS + 20))).toMatchObject({ code: "TIMEOUT", detail: "deadline" });
  });

  it("rejects an answer that is not valid JSON or is oversize", async () => {
    const { deps } = setup();
    const text = (body: string): AdapterDeps => ({ nowMs: deps.nowMs, fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => body }) });
    expect(await failureOf(createRpc(text("nope"), { url: URL_ }).callMany([managerCount()], FAR))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "invalid_json" });
    expect(await failureOf(createRpc(text(" ".repeat(2_000_001)), { url: URL_ }).callMany([managerCount()], FAR))).toMatchObject({ code: "SCHEMA_DRIFT", detail: "body_too_large" });
  });
});

describe("trueo rpc: the only methods that can be sent are eth_call and eth_getLogs", () => {
  it("exposes callMany and logs and nothing that takes a method name", () => {
    const { deps } = setup();
    const rpc = createRpc(deps, { url: URL_ });
    expect(Object.keys(rpc).sort()).toEqual(["callMany", "logs", "mode"]);
  });

  it("sends nothing but those methods across a full read of the world", async () => {
    const { world, deps } = setup();
    const rpc = createRpc(deps, { url: URL_ });
    await rpc.callMany([managerCount(), managerCount()], FAR);
    await rpc.logs({ address: [world.live.yesToken], topics: [null], fromBlock: 1n, toBlock: 10n }, FAR);
    const methods = new Set(world.rpc.requests.map((r) => r.method));
    expect([...methods].sort()).toEqual(["eth_call", "eth_getLogs"]);
  });

  it("encodes block bounds as hex quantities and keeps 'latest' as a tag", async () => {
    const { world, deps } = setup();
    const rpc = createRpc(deps, { url: URL_ });
    await rpc.logs({ address: [world.live.yesToken], topics: [null], fromBlock: 255n, toBlock: "latest" }, FAR);
    expect(world.rpc.requests.at(-1)?.params).toMatchObject({ fromBlock: "0xff", toBlock: "latest" });
  });
});
