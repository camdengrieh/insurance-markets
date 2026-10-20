// Test double for the wallet and portfolio screens: an in-memory chain behind the JSON-RPC hosts of
// headers.config.ts, plus plain GET routes. Pure code with no Node import, so it can sit beside the sources
// without tripping the bundle boundary check. Only tests import it; nothing reachable from main.tsx does.
//
// A request that nothing answers throws, so a test can never pass through an unexpected call.

import { decodeFunctionData, encodeAbiParameters, parseAbi, type Hex } from "viem";

import type { FetchLike, FetchResponseLike } from "../../core/ports";
import { MULTICALL3_ADDRESS } from "./rpc";

const ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export interface FakeChain {
  // eth_getCode answers by lower-case address; anything absent is "0x".
  codes?: Readonly<Record<string, string>>;
  native?: Readonly<Record<string, bigint>>;
  // token (lower-case) -> holder (lower-case) -> balance
  tokens?: Readonly<Record<string, Readonly<Record<string, bigint>>>>;
  // token -> owner -> spender -> allowance
  allowances?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, bigint>>>>>>;
  // Multicall3 exists on this chain.
  multicall?: boolean;
  // The endpoint answers JSON-RPC batch arrays.
  batch?: boolean;
  // The request fails like a network error.
  down?: boolean;
  // An HTTP status for every answer.
  status?: number;
}

export interface Reply {
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  readonly reject?: boolean;
}

export type GetRoute = (url: URL) => Reply;

export interface Recorded {
  readonly url: URL;
  readonly method: string;
  readonly body: unknown;
}

function response(status: number, text: string): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

const word = (value: bigint): Hex => encodeAbiParameters([{ type: "uint256" }], [value]);

function callOn(chain: FakeChain, to: string, data: Hex): { ok: true; data: Hex } | { ok: false } {
  const target = to.toLowerCase();
  if (target === MULTICALL3_ADDRESS.toLowerCase()) {
    if (chain.multicall !== true) return { ok: true, data: "0x" };
    const decoded = decodeFunctionData({ abi: ABI, data });
    if (decoded.functionName === "getEthBalance") return { ok: true, data: word(chain.native?.[(decoded.args[0] as string).toLowerCase()] ?? 0n) };
    if (decoded.functionName !== "aggregate3") return { ok: false };
    const calls = decoded.args[0] as ReadonlyArray<{ target: string; allowFailure: boolean; callData: Hex }>;
    const results = calls.map((call) => {
      const inner = callOn(chain, call.target, call.callData);
      return inner.ok ? { success: true, returnData: inner.data } : { success: false, returnData: "0x" as Hex };
    });
    return { ok: true, data: encodeAggregateResult(results) };
  }
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: ABI, data });
  } catch {
    return { ok: false };
  }
  if (decoded.functionName === "balanceOf") {
    const holders = chain.tokens?.[target];
    if (holders === undefined) return { ok: false };
    return { ok: true, data: word(holders[(decoded.args[0] as string).toLowerCase()] ?? 0n) };
  }
  if (decoded.functionName === "allowance") {
    const [owner, spender] = decoded.args as readonly [string, string];
    return { ok: true, data: word(chain.allowances?.[target]?.[owner.toLowerCase()]?.[spender.toLowerCase()] ?? 0n) };
  }
  return { ok: false };
}

function encodeAggregateResult(results: ReadonlyArray<{ success: boolean; returnData: Hex }>): Hex {
  return encodeAbiParameters([{ type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }], [results]);
}

// Answers one JSON-RPC request object; undefined = no such method (an error object is returned).
function rpcAnswer(chain: FakeChain, request: { id: unknown; method: string; params: unknown[] }): Record<string, unknown> {
  const base = { jsonrpc: "2.0", id: request.id };
  switch (request.method) {
    case "eth_getCode": {
      const address = String(request.params[0]).toLowerCase();
      return { ...base, result: chain.codes?.[address] ?? "0x" };
    }
    case "eth_getBalance": {
      const address = String(request.params[0]).toLowerCase();
      return { ...base, result: `0x${(chain.native?.[address] ?? 0n).toString(16)}` };
    }
    case "eth_call": {
      const call = request.params[0] as { to: string; data: Hex };
      const out = callOn(chain, call.to, call.data);
      return out.ok ? { ...base, result: out.data } : { ...base, error: { code: 3, message: "execution reverted" } };
    }
    default:
      return { ...base, error: { code: -32601, message: "method not found" } };
  }
}

export interface FakeNetwork {
  readonly fetch: FetchLike;
  readonly calls: Recorded[];
  // The JSON-RPC methods that were asked, in order.
  methods(): string[];
}

// `rpc` maps a host ("base-rpc.publicnode.com") to its chain; `get` maps "host/path" to a GET route.
export function fakeNetwork(setup: { rpc?: Readonly<Record<string, FakeChain>>; get?: Readonly<Record<string, GetRoute>> }): FakeNetwork {
  const calls: Recorded[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const body: unknown = init?.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ url, method, body });
    if (method === "POST") {
      const chain = setup.rpc?.[url.hostname];
      if (chain === undefined) throw new Error(`no fake chain for ${url.hostname}`);
      if (chain.down === true) throw new TypeError("Failed to fetch");
      if (chain.status !== undefined && chain.status !== 200) return response(chain.status, "{}");
      if (Array.isArray(body)) {
        if (chain.batch === false) return response(200, JSON.stringify(rpcAnswer(chain, { id: null, method: "batch_unsupported", params: [] })));
        return response(200, JSON.stringify(body.map((item) => rpcAnswer(chain, item as { id: unknown; method: string; params: unknown[] }))));
      }
      return response(200, JSON.stringify(rpcAnswer(chain, body as { id: unknown; method: string; params: unknown[] })));
    }
    const route = setup.get?.[`${url.hostname}${url.pathname}`];
    if (route === undefined) throw new Error(`no scripted route for ${url.hostname}${url.pathname}${url.search}`);
    const reply = route(url);
    if (reply.reject === true) throw new TypeError("Failed to fetch");
    return response(reply.status ?? 200, reply.text ?? JSON.stringify(reply.body ?? null));
  };
  return { fetch, calls, methods: () => calls.flatMap((call) => (Array.isArray(call.body) ? call.body : [call.body]).map((item) => String((item as { method?: unknown })?.method))) };
}

export function manualClock(startMs: number): { readonly nowMs: () => number; advance(ms: number): void } {
  let now = startMs;
  return { nowMs: () => now, advance: (ms) => void (now += ms) };
}
