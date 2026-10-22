// Test double for the chain holdings readers: an in-memory EVM chain behind each public RPC host the page names
// (polygon-bor-rpc.publicnode.com, base-rpc.publicnode.com, rpc-mainnet-2.xo.market). It answers the read methods the
// readers send, with contract code the test supplies (the real pinned runtime code, loaded by the test from the
// recordings in test/fixtures/chain-bytecode), ERC-1155 balances, Conditional Tokens payouts, Polymarket module
// results, exchange token registries and TransferSingle logs. Any request to another host is recorded and refused,
// so a test can prove that no venue API was asked. Only tests import it.

import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, padHex, parseAbi, type Hex } from "viem";

import { CTF_ABI } from "@sdk/chain/ctf";
import { EXCHANGE_REGISTRY_ABI } from "@sdk/chain/exchange";
import { POLYMARKET_MODULE_ABI } from "@sdk/chain/polymarket/abi";

import type { FetchLike, FetchResponseLike } from "../../core/ports";

const ERC20 = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

export interface TransferFixture {
  readonly ledger: string;
  readonly to: string;
  readonly id: bigint;
  readonly value: bigint;
  readonly block: bigint;
}

export interface MemoryChain {
  readonly head: bigint;
  // Lower-case address -> runtime code.
  readonly code: Readonly<Record<string, string>>;
  // Lower-case proxy -> the 32-byte word in its EIP-1967 implementation slot.
  readonly slots?: Readonly<Record<string, string>>;
  // ledger -> holder -> token id (decimal) -> balance; all lower-case.
  readonly balances?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, bigint>>>>>>;
  // Conditional Tokens: condition id (lower-case) -> payout numerators (all zero: not resolved). Absent: no slots.
  readonly payouts?: Readonly<Record<string, readonly bigint[]>>;
  // module -> 31-byte condition id -> result ([] unresolved).
  readonly results?: Readonly<Record<string, Readonly<Record<string, readonly bigint[]>>>>;
  // exchange -> token id (decimal) -> condition id.
  readonly registry?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly erc20?: Readonly<Record<string, Readonly<Record<string, bigint>>>>;
  readonly transfers?: readonly TransferFixture[];
}

export interface ChainNetwork {
  readonly fetch: FetchLike;
  // Every host asked, in order.
  readonly hosts: string[];
  readonly methods: string[];
}

function response(status: number, text: string): FetchResponseLike {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => JSON.parse(text) as unknown, text: async () => text };
}

const ZERO32 = `0x${"00".repeat(32)}`;

function call(chain: MemoryChain, to: string, data: Hex): Hex | null {
  const target = to.toLowerCase();
  const abi = [...CTF_ABI, ...POLYMARKET_MODULE_ABI, ...EXCHANGE_REGISTRY_ABI, ...ERC20];
  let decoded;
  try {
    decoded = decodeFunctionData({ abi, data });
  } catch {
    return null;
  }
  const args = (decoded.args ?? []) as readonly unknown[];
  switch (decoded.functionName) {
    case "balanceOfBatch": {
      const [owners, ids] = args as [readonly string[], readonly bigint[]];
      const values = ids.map((id, index) => chain.balances?.[target]?.[(owners[index] ?? "").toLowerCase()]?.[id.toString()] ?? 0n);
      return encodeFunctionResult({ abi: CTF_ABI, functionName: "balanceOfBatch", result: values });
    }
    case "payoutDenominator": {
      const payouts = chain.payouts?.[String(args[0]).toLowerCase()];
      return encodeAbiParameters([{ type: "uint256" }], [payouts === undefined ? 0n : payouts.reduce((sum, n) => sum + n, 0n)]);
    }
    case "getOutcomeSlotCount": {
      const payouts = chain.payouts?.[String(args[0]).toLowerCase()];
      return encodeAbiParameters([{ type: "uint256" }], [BigInt(payouts?.length ?? 0)]);
    }
    case "payoutNumerators": {
      const payouts = chain.payouts?.[String(args[0]).toLowerCase()];
      return encodeAbiParameters([{ type: "uint256" }], [payouts?.[Number(args[1])] ?? 0n]);
    }
    case "getResult": {
      const result = chain.results?.[target]?.[String(args[0]).toLowerCase()] ?? [];
      return encodeFunctionResult({ abi: POLYMARKET_MODULE_ABI, functionName: "getResult", result });
    }
    case "getConditionId": {
      const condition = chain.registry?.[target]?.[String(args[0])] ?? ZERO32;
      return encodeAbiParameters([{ type: "bytes32" }], [condition as Hex]);
    }
    case "balanceOf": {
      if (args.length !== 1) return null;
      const holders = chain.erc20?.[target];
      if (holders === undefined) return null;
      return encodeAbiParameters([{ type: "uint256" }], [holders[String(args[0]).toLowerCase()] ?? 0n]);
    }
    default:
      return null;
  }
}

function logs(chain: MemoryChain, filter: { address: string; topics: Array<string | string[] | null>; fromBlock: string; toBlock: string }): unknown[] {
  const from = BigInt(filter.fromBlock);
  const to = BigInt(filter.toBlock);
  const wantedTo = filter.topics[3];
  return (chain.transfers ?? [])
    .filter((transfer) => transfer.ledger.toLowerCase() === filter.address.toLowerCase() && transfer.block >= from && transfer.block <= to)
    .filter((transfer) => typeof wantedTo !== "string" || wantedTo === padHex(transfer.to.toLowerCase() as Hex, { size: 32 }))
    .map((transfer, index) => ({
      address: transfer.ledger.toLowerCase(),
      topics: encodeEventTopics({ abi: CTF_ABI, eventName: "TransferSingle", args: { operator: transfer.to as Hex, from: `0x${"00".repeat(20)}`, to: transfer.to as Hex } }),
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [transfer.id, transfer.value]),
      blockNumber: `0x${transfer.block.toString(16)}`,
      transactionHash: padHex(`0x${(transfer.block * 1000n + BigInt(index)).toString(16)}`, { size: 32 }),
      logIndex: `0x${index.toString(16)}`,
    }));
}

function answer(chain: MemoryChain, request: { id: unknown; method: string; params: unknown[] }): Record<string, unknown> {
  const base = { jsonrpc: "2.0", id: request.id };
  switch (request.method) {
    case "eth_blockNumber":
      return { ...base, result: `0x${chain.head.toString(16)}` };
    case "eth_getCode":
      return { ...base, result: chain.code[String(request.params[0]).toLowerCase()] ?? "0x" };
    case "eth_getStorageAt":
      return { ...base, result: chain.slots?.[String(request.params[0]).toLowerCase()] ?? ZERO32 };
    case "eth_call": {
      const target = request.params[0] as { to: string; data: Hex };
      const out = call(chain, target.to, target.data);
      return out === null ? { ...base, error: { code: 3, message: "execution reverted" } } : { ...base, result: out };
    }
    case "eth_getLogs":
      return { ...base, result: logs(chain, request.params[0] as never) };
    default:
      return { ...base, error: { code: -32601, message: "method not found" } };
  }
}

export function chainNetwork(chains: Readonly<Record<string, MemoryChain>>): ChainNetwork {
  const hosts: string[] = [];
  const methods: string[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    hosts.push(url.hostname);
    const chain = chains[url.hostname];
    if (chain === undefined || init?.method !== "POST" || init.body === undefined) throw new Error(`not a chain host: ${url.hostname}`);
    const body = JSON.parse(init.body) as unknown;
    const items = (Array.isArray(body) ? body : [body]) as Array<{ id: unknown; method: string; params: unknown[] }>;
    for (const item of items) methods.push(item.method);
    const answers = items.map((item) => answer(chain, item));
    return response(200, JSON.stringify(Array.isArray(body) ? answers : answers[0]));
  };
  return { fetch, hosts, methods };
}
