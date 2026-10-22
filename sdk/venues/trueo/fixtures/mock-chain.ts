import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, toEventSelector } from "viem";

import type { FetchLike, FetchResponseLike } from "../../../model.js";
import { ERC20_ABI, HOOK_ABI, MANAGER_ABI, MARKET_ABI, QUOTER_ABI, STATE_VIEW_ABI, TRANSFER_EVENT, VAULT_ABI } from "../abi.js";
import { poolIdOf, type PoolKey } from "../math.js";
import type { Address, Hex } from "../rpc.js";

// A small in-memory Base: a JSON-RPC endpoint that answers eth_call and eth_getLogs for exactly the contracts
// the adapter reads, encoding its answers with the same ABIs. No network, no node. It is a test double, not a
// copy of the real contracts: it serves what is loaded into it. The scenario (scenario.ts) loads REAL values that
// were read from Base mainnet on 2026-10-20 (base_captured_2026-10-20.json), and a test that needs another state
// overrides one field of a real market; nothing is invented. Every selector it serves is pinned separately to the
// research notes (constants.test.ts). Every request is recorded, so a test can assert what was (and was not) sent.

export interface MockPool {
  readonly sqrtPriceX96: bigint;
  readonly lpFee: number;
  readonly liquidity: bigint;
  readonly paused: boolean;
  // V4Quoter results captured for whole-share sizes, keyed by the share count: the TYD micro-units paid (buy) or
  // received (sell), or null where the real quoter reverted. A size that is not in the table reverts.
  readonly quotes?: {
    readonly buy: Readonly<Record<string, bigint | null>>;
    readonly sell: Readonly<Record<string, bigint | null>>;
  };
}

export interface MockMarket {
  readonly address: Address;
  readonly question: string;
  readonly source: string;
  readonly additionalInfo: string;
  readonly endOfTrading: bigint;
  readonly status: number;
  readonly winning: bigint;
  readonly version: string;
  readonly paymentToken: Address;
  readonly yesToken: Address;
  readonly noToken: Address;
  readonly hook: Address;
  readonly yesKey: PoolKey;
  readonly noKey: PoolKey;
  readonly paused: boolean;
  readonly yes: MockPool;
  readonly no: MockPool;
  // Overrides, to build a market whose reported ids or decimals do not match its keys.
  readonly reportedIds?: readonly [Hex, Hex];
  readonly outcomeDecimals?: number;
}

export interface MockLog {
  readonly token: Address;
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
}

export interface MockChain {
  managerPaused: boolean;
  tydDecimals: number;
  tydAsset: Address;
  // convertToAssets(x) = x * assetsPerShareMicro / 1e6.
  assetsPerShareMicro: bigint;
  activeMarkets: Address[];
  markets: Map<string, MockMarket>;
  inactive: Set<string>;
  hooks: Map<string, { feeNumerator: bigint; denominator: bigint; broken?: boolean }>;
  balances: Map<string, bigint>;
  venuePositions: Map<string, readonly [bigint, bigint]>;
  claimable: Map<string, bigint>;
  logs: MockLog[];
  // Behaviours.
  rejectBatch: boolean;
  limited: boolean;
  httpStatus: number | undefined;
  failEverything: boolean;
  // Sleep forever on any request.
  hang: boolean;
  // Calls whose calldata starts with one of these selectors revert (a function the contract lacks).
  revertSelectors: Set<string>;
}

export interface RecordedRpc {
  readonly method: string;
  readonly batch: boolean;
  readonly to?: string;
  readonly selector?: string;
  readonly params?: unknown;
}

export interface MockRpc {
  readonly fetch: FetchLike;
  readonly requests: RecordedRpc[];
  // POSTs sent (a batch is one).
  readonly posts: { url: string; method: string; body: unknown }[];
}

const key = (value: string): string => value.toLowerCase();

export function emptyChain(tydAsset: Address): MockChain {
  return {
    managerPaused: false,
    tydDecimals: 6,
    tydAsset,
    assetsPerShareMicro: 1_045_656n,
    activeMarkets: [],
    markets: new Map(),
    inactive: new Set(),
    hooks: new Map(),
    balances: new Map(),
    venuePositions: new Map(),
    claimable: new Map(),
    logs: [],
    rejectBatch: false,
    limited: false,
    httpStatus: undefined,
    failEverything: false,
    hang: false,
    revertSelectors: new Set(),
  };
}

function ok(text: string, status = 200, headers: Record<string, string> = {}): FetchResponseLike {
  const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { ok: status >= 200 && status < 300, status, headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null }, json: async () => JSON.parse(text) as unknown, text: async () => text };
}

class Revert extends Error {}

interface Addresses {
  readonly manager: Address;
  readonly tyd: Address;
  readonly stateView: Address;
  readonly quoter: Address;
}

function poolOf(chain: MockChain, id: Hex): { market: MockMarket; side: "yes" | "no"; pool: MockPool; poolKey: PoolKey } | undefined {
  for (const market of chain.markets.values()) {
    if (poolIdOf(market.yesKey).toLowerCase() === id.toLowerCase()) return { market, side: "yes", pool: market.yes, poolKey: market.yesKey };
    if (poolIdOf(market.noKey).toLowerCase() === id.toLowerCase()) return { market, side: "no", pool: market.no, poolKey: market.noKey };
  }
  return undefined;
}

const ONE_SHARE = 10n ** 18n;

function answer(chain: MockChain, addresses: Addresses, to: Address, data: Hex): Hex {
  if (chain.revertSelectors.has(data.slice(0, 10))) throw new Revert();
  const target = key(to);
  if (target === key(addresses.manager)) {
    const call = decodeFunctionData({ abi: MANAGER_ABI, data });
    switch (call.functionName) {
      case "numberOfActiveMarkets":
        return encodeFunctionResult({ abi: MANAGER_ABI, functionName: "numberOfActiveMarkets", result: BigInt(chain.activeMarkets.length) });
      case "getActiveMarketAddress": {
        const at = chain.activeMarkets[Number(call.args[0])];
        if (at === undefined) throw new Revert();
        return encodeFunctionResult({ abi: MANAGER_ABI, functionName: "getActiveMarketAddress", result: at });
      }
      case "isActiveMarket":
        return encodeFunctionResult({ abi: MANAGER_ABI, functionName: "isActiveMarket", result: chain.markets.has(key(call.args[0])) && !chain.inactive.has(key(call.args[0])) });
      case "paused":
        return encodeFunctionResult({ abi: MANAGER_ABI, functionName: "paused", result: chain.managerPaused });
    }
  }
  if (target === key(addresses.tyd)) {
    const call = decodeFunctionData({ abi: VAULT_ABI, data });
    switch (call.functionName) {
      case "decimals":
        return encodeFunctionResult({ abi: VAULT_ABI, functionName: "decimals", result: chain.tydDecimals });
      case "asset":
        return encodeFunctionResult({ abi: VAULT_ABI, functionName: "asset", result: chain.tydAsset });
      case "convertToAssets":
        return encodeFunctionResult({ abi: VAULT_ABI, functionName: "convertToAssets", result: (call.args[0] * chain.assetsPerShareMicro) / 1_000_000n });
    }
  }
  const market = chain.markets.get(target);
  if (market !== undefined) {
    const call = decodeFunctionData({ abi: MARKET_ABI, data });
    const owner = (call.args?.[0] ?? "0x") as string;
    switch (call.functionName) {
      case "VERSION":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "VERSION", result: market.version });
      case "marketQuestion":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "marketQuestion", result: market.question });
      case "marketSource":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "marketSource", result: market.source });
      case "additionalInfo":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "additionalInfo", result: market.additionalInfo });
      case "endOfTrading":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "endOfTrading", result: market.endOfTrading });
      case "getCurrentStatus":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "getCurrentStatus", result: market.status });
      case "winningPosition":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "winningPosition", result: market.winning });
      case "paymentToken":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "paymentToken", result: market.paymentToken });
      case "yesToken":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "yesToken", result: market.yesToken });
      case "noToken":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "noToken", result: market.noToken });
      case "getPoolKeys":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "getPoolKeys", result: [market.yesKey, market.noKey] });
      case "getPoolIds":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "getPoolIds", result: market.reportedIds ?? [poolIdOf(market.yesKey), poolIdOf(market.noKey)] });
      case "paused":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "paused", result: market.paused });
      case "getUserPosition": {
        const held = chain.venuePositions.get(`${target}|${key(owner)}`) ?? [0n, 0n];
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "getUserPosition", result: [held[0], held[1]] });
      }
      case "getUserClaimableAmount":
        return encodeFunctionResult({ abi: MARKET_ABI, functionName: "getUserClaimableAmount", result: chain.claimable.get(`${target}|${key(owner)}`) ?? 0n });
    }
  }
  const hook = chain.hooks.get(target);
  if (hook !== undefined) {
    if (hook.broken === true) throw new Revert();
    const call = decodeFunctionData({ abi: HOOK_ABI, data });
    switch (call.functionName) {
      case "feeNumerator":
        return encodeFunctionResult({ abi: HOOK_ABI, functionName: "feeNumerator", result: hook.feeNumerator });
      case "FEE_DENOMINATOR":
        return encodeFunctionResult({ abi: HOOK_ABI, functionName: "FEE_DENOMINATOR", result: hook.denominator });
      case "poolPaused": {
        const found = poolOf(chain, call.args[0]);
        if (found === undefined) throw new Revert();
        return encodeFunctionResult({ abi: HOOK_ABI, functionName: "poolPaused", result: found.pool.paused });
      }
    }
  }
  if (target === key(addresses.stateView)) {
    const call = decodeFunctionData({ abi: STATE_VIEW_ABI, data });
    const found = poolOf(chain, call.args[0]);
    if (found === undefined) {
      // An uninitialised pool: Uniswap's StateView returns zeros.
      return call.functionName === "getSlot0"
        ? encodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getSlot0", result: [0n, 0, 0, 0] })
        : encodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getLiquidity", result: 0n });
    }
    return call.functionName === "getSlot0"
      ? encodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getSlot0", result: [found.pool.sqrtPriceX96, 0, 0, found.pool.lpFee] })
      : encodeFunctionResult({ abi: STATE_VIEW_ABI, functionName: "getLiquidity", result: found.pool.liquidity });
  }
  if (target === key(addresses.quoter)) {
    const call = decodeFunctionData({ abi: QUOTER_ABI, data });
    const params = call.args[0];
    const found = poolOf(chain, poolIdOf(params.poolKey));
    if (found === undefined) throw new Revert();
    const tydIsCurrency0 = key(params.poolKey.currency0) === key(addresses.tyd);
    const exact = params.exactAmount;
    // Only whole-share sizes were captured; anything else reverts, like a size the real quoter cannot fill.
    const quoted = (side: "buy" | "sell"): bigint => {
      const table = found.pool.quotes?.[side];
      const value = exact % ONE_SHARE === 0n ? table?.[(exact / ONE_SHARE).toString()] : undefined;
      if (value === undefined || value === null || found.pool.paused) throw new Revert();
      return value;
    };
    if (call.functionName === "quoteExactOutputSingle") {
      // Buying outcome tokens: TYD in, so zeroForOne is true exactly when TYD is currency0.
      if (params.zeroForOne !== tydIsCurrency0) throw new Revert();
      return encodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactOutputSingle", result: [quoted("buy"), 150_000n] });
    }
    if (params.zeroForOne === tydIsCurrency0) throw new Revert();
    return encodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", result: [quoted("sell"), 150_000n] });
  }
  // An outcome token (or any other ERC-20).
  const token = [...chain.markets.values()].find((m) => key(m.yesToken) === target || key(m.noToken) === target);
  if (token !== undefined) {
    const call = decodeFunctionData({ abi: ERC20_ABI, data });
    if (call.functionName === "decimals") return encodeFunctionResult({ abi: ERC20_ABI, functionName: "decimals", result: token.outcomeDecimals ?? 18 });
    return encodeFunctionResult({ abi: ERC20_ABI, functionName: "balanceOf", result: chain.balances.get(`${target}|${key(call.args[0])}`) ?? 0n });
  }
  // Not a contract this world has: a real node answers "0x", which does not decode.
  return "0x";
}

function topicOf(address: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [address]);
}

function logsFor(chain: MockChain, filter: { address?: string[]; topics?: Array<string | null>; fromBlock: string; toBlock: string }): unknown[] {
  const from = BigInt(filter.fromBlock);
  const to = filter.toBlock === "latest" ? 2n ** 62n : BigInt(filter.toBlock);
  const addresses = new Set((filter.address ?? []).map(key));
  const transfer = toEventSelector(TRANSFER_EVENT[0]);
  return chain.logs
    .filter((log) => addresses.has(key(log.token)) && log.blockNumber >= from && log.blockNumber <= to)
    .filter((log) => {
      const topics = filter.topics ?? [];
      const wants: Array<[string | null | undefined, string]> = [
        [topics[0], transfer],
        [topics[1], topicOf(log.from)],
        [topics[2], topicOf(log.to)],
      ];
      return wants.every(([want, have]) => want === null || want === undefined || want.toLowerCase() === have.toLowerCase());
    })
    .map((log) => ({
      address: log.token,
      topics: [transfer, topicOf(log.from), topicOf(log.to)],
      data: encodeAbiParameters([{ type: "uint256" }], [log.value]),
      blockNumber: `0x${log.blockNumber.toString(16)}`,
      transactionHash: log.transactionHash,
      logIndex: `0x${log.logIndex.toString(16)}`,
    }));
}

export function mockRpc(chain: MockChain, addresses: Addresses): MockRpc {
  const requests: RecordedRpc[] = [];
  const posts: MockRpc["posts"] = [];

  function handle(item: unknown, batch: boolean): unknown {
    const request = item as { id?: number; method?: string; params?: unknown[] };
    const id = request.id ?? null;
    const record: { method: string; batch: boolean; to?: string; selector?: string; params?: unknown } = { method: String(request.method), batch };
    requests.push(record);
    if (chain.failEverything) return { jsonrpc: "2.0", id, error: { code: -32000, message: "boom" } };
    if (request.method === "eth_call") {
      const call = (request.params?.[0] ?? {}) as { to?: Address; data?: Hex };
      record.to = call.to;
      record.selector = call.data?.slice(0, 10);
      try {
        return { jsonrpc: "2.0", id, result: answer(chain, addresses, call.to as Address, call.data as Hex) };
      } catch (error) {
        if (error instanceof Revert) return { jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } };
        // A selector this world does not serve behaves like a missing function: a revert.
        return { jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } };
      }
    }
    if (request.method === "eth_getLogs") {
      record.params = request.params?.[0];
      return { jsonrpc: "2.0", id, result: logsFor(chain, request.params?.[0] as never) };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
  }

  const fetch: FetchLike = async (input, init) => {
    const body = init?.body === undefined ? undefined : (JSON.parse(init.body) as unknown);
    posts.push({ url: input, method: init?.method ?? "GET", body });
    if (chain.hang) await new Promise<never>(() => undefined);
    if (chain.limited) return ok("rate limited", 429, { "retry-after": "3" });
    if (chain.httpStatus !== undefined) return ok("", chain.httpStatus);
    if (Array.isArray(body)) {
      if (chain.rejectBatch) return ok(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch requests are not supported" } }), 400);
      return ok(JSON.stringify(body.map((item) => handle(item, true))));
    }
    return ok(JSON.stringify(handle(body, false)));
  };
  return { fetch, requests, posts };
}

