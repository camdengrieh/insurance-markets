import { decodeFunctionResult, encodeFunctionData, getAddress, parseAbi } from "viem";

import type { ContractPin } from "./pins.js";
import type { Address, Hex, RpcCallResult, RpcPort, RpcRequestOptions } from "./rpc.js";

// Multicall3 `aggregate3`: many eth_calls as ONE eth_call. Used where a page reads many balances at once (the dApp's
// wallet balances and the holdings view). A chain without Multicall3 answers "0x" for a call to an address with no
// code; that, a revert of the whole aggregate, or an answer that does not decode is `null`, and the caller sends the
// same reads through the port's batch instead. A per-call failure inside the aggregate is a revert of that call only.

// The canonical Multicall3 deployment, the same address on every chain that has it (github.com/mds1/multicall3,
// "Multicall3 Contract Addresses"). Its runtime code on Polygon and Base, read 2026-10-22, is pinned below (Sourcify
// exact_match "Multicall3" on both, equal to eth_getCode); XO's chain has no code at the address.
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

function multicallPin(chainId: number): ContractPin {
  return Object.freeze({
    chainId,
    name: "Multicall3",
    address: MULTICALL3_ADDRESS,
    codeHash: "0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891" as const,
    codeSize: 3808,
    implementation: null,
    source: "github.com/mds1/multicall3, Multicall3 Contract Addresses",
    verified: "Sourcify exact_match (Multicall3); its on-chain code equals eth_getCode",
    readOn: "2026-10-22",
  });
}

export const MULTICALL3_PINS: Readonly<Record<137 | 8453, ContractPin>> = Object.freeze({ 137: multicallPin(137), 8453: multicallPin(8453) });

export const MULTICALL3_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
]);

export interface AggregateCall {
  readonly target: Address;
  readonly callData: Hex;
}

// The calldata of getEthBalance(holder), as one inner call to Multicall3 itself.
export function ethBalanceCall(holder: Address): AggregateCall {
  return { target: MULTICALL3_ADDRESS, callData: encodeFunctionData({ abi: MULTICALL3_ABI, functionName: "getEthBalance", args: [getAddress(holder)] }) };
}

export async function aggregate3(port: RpcPort, calls: readonly AggregateCall[], options?: RpcRequestOptions): Promise<RpcCallResult[] | null> {
  if (calls.length === 0) return [];
  const data = encodeFunctionData({
    abi: MULTICALL3_ABI,
    functionName: "aggregate3",
    args: [calls.map((call) => ({ target: getAddress(call.target), allowFailure: true, callData: call.callData }))],
  });
  const [answer] = await port.callMany([{ to: MULTICALL3_ADDRESS, data }], options);
  if (answer === undefined || !answer.ok) return null;
  try {
    const decoded = decodeFunctionResult({ abi: MULTICALL3_ABI, functionName: "aggregate3", data: answer.data });
    if (decoded.length !== calls.length) return null;
    return decoded.map((entry): RpcCallResult => (entry.success ? { ok: true, data: entry.returnData } : { ok: false, kind: "revert" }));
  } catch {
    // "0x" (no Multicall3 on this chain) or anything that does not decode as the aggregate result.
    return null;
  }
}
