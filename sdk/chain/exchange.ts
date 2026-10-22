import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

import { binaryPositionIds } from "./ctf.js";
import type { Address, Hex, RpcPort, RpcRequestOptions } from "./rpc.js";

// The token registry of a Polymarket-derived CTF exchange: `getConditionId(uint256 token)` names the condition a
// registered outcome token belongs to (zero for a token the exchange does not know). The XO exchange implementation
// (verified CTFExchange source on XO's explorer; ABI in docs/research/fixtures/gaps/userop-templates) and every
// Limitless exchange (Sourcify exact matches, read 2026-10-22) have it; Polymarket's current exchanges do not.
//
// An exchange's answer is never taken on its own: the token id must also derive from that condition by the
// Conditional Tokens algorithm with one of the venue's pinned collaterals (`matchDerivation`), which is what proves the
// pairing. A mismatch is no answer.

export const EXCHANGE_REGISTRY_ABI = parseAbi(["function getConditionId(uint256 token) view returns (bytes32)"]);

const ZERO32 = `0x${"00".repeat(32)}`;

export interface DerivedPosition {
  readonly conditionId: Hex;
  readonly collateral: Address;
  readonly outcomeIndex: 0 | 1;
}

// Which collateral and outcome of a binary condition a token id is, or null when it is neither outcome under any of
// the collaterals.
export function matchDerivation(tokenId: bigint, conditionId: Hex, collaterals: readonly Address[]): DerivedPosition | null {
  for (const collateral of collaterals) {
    const [yes, no] = binaryPositionIds(collateral, conditionId);
    if (yes === tokenId) return { conditionId: conditionId.toLowerCase() as Hex, collateral, outcomeIndex: 0 };
    if (no === tokenId) return { conditionId: conditionId.toLowerCase() as Hex, collateral, outcomeIndex: 1 };
  }
  return null;
}

// For each token id: the condition the pinned exchanges name for it, checked by derivation. All exchanges are asked
// in one batch; non-zero answers that disagree, or an answer the derivation does not confirm, leave the id null.
export async function readRegisteredConditions(
  port: RpcPort,
  exchanges: readonly Address[],
  tokenIds: readonly bigint[],
  collaterals: readonly Address[],
  options?: RpcRequestOptions,
): Promise<Map<bigint, DerivedPosition | null>> {
  const unique = [...new Set(tokenIds)];
  const out = new Map<bigint, DerivedPosition | null>();
  if (unique.length === 0) return out;
  const calls = unique.flatMap((token) => exchanges.map((exchange) => ({ to: exchange, data: encodeFunctionData({ abi: EXCHANGE_REGISTRY_ABI, functionName: "getConditionId", args: [token] }) })));
  const results = await port.callMany(calls, options);
  unique.forEach((token, t) => {
    const named = new Set<string>();
    exchanges.forEach((_, e) => {
      const result = results[t * exchanges.length + e];
      if (result === undefined || !result.ok) return;
      try {
        const condition = decodeFunctionResult({ abi: EXCHANGE_REGISTRY_ABI, functionName: "getConditionId", data: result.data });
        if (condition !== ZERO32) named.add(condition.toLowerCase());
      } catch {
        // Not a bytes32: this exchange gave no answer.
      }
    });
    const [only] = [...named];
    out.set(token, named.size === 1 && only !== undefined ? matchDerivation(token, only as Hex, collaterals) : null);
  });
  return out;
}
