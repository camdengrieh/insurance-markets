import { decodeEventLog, parseAbi, toEventSelector } from "viem";

import { POLYMARKET_MODULE_ABI, POLYMARKET_RESULT_DENOMINATOR } from "../../sdk/chain/polymarket/abi.js";
import type { Address, Hex, RpcLog } from "../../sdk/chain/rpc.js";

// The two events the SDK's chain readers do not decode yet, for the indexer.
//
// ConditionPreparation of Gnosis Conditional Tokens, copied from the verified ABI Sourcify serves for the Polygon and Base
// deployments (chain 137 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 and chain 8453 0xC9c98965297Bc527861c898329Ee280632B76e18,
// both "match", read 2026-10-22; the excerpt is test/api/fixtures/verified-abi-condition-preparation_2026-10-22.json and
// test/api/abi.test.ts recomputes the topic from it):
//   ConditionPreparation(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount)
// XO's Conditional Tokens has no verified source (sdk/chain/xo/pins.ts); its ConditionResolution is already read with the
// same Gnosis fragments, and its preparations are decoded with this one on the same footing.
//
// ConditionResolved of Polymarket's Protocol V2 modules is the SDK's verified fragment (sdk/chain/polymarket/abi.ts).

export const CONDITION_PREPARATION_ABI = parseAbi([
  "event ConditionPreparation(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount)",
]);
export const CONDITION_PREPARATION_TOPIC = toEventSelector("ConditionPreparation(bytes32,address,bytes32,uint256)");
export const MODULE_CONDITION_RESOLVED_TOPIC = toEventSelector("ConditionResolved(bytes31,uint256[])");

export interface PreparationEvent {
  readonly conditionId: Hex;
  readonly oracle: Address;
  readonly questionId: Hex;
  readonly outcomeSlotCount: number;
}

export interface ModuleResolutionEvent {
  // The 31-byte condition id, lower case.
  readonly conditionId: Hex;
  readonly result: readonly bigint[];
  readonly denominator: bigint;
}

const BYTES32 = /^0x[0-9a-f]{64}$/;
const BYTES31 = /^0x[0-9a-f]{62}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;

export function decodePreparation(log: RpcLog, ledger: Address): PreparationEvent | null {
  if (log.address.toLowerCase() !== ledger.toLowerCase() || log.topics[0] !== CONDITION_PREPARATION_TOPIC) return null;
  let args: Record<string, unknown>;
  try {
    args = decodeEventLog({ abi: CONDITION_PREPARATION_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true }).args as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const conditionId = typeof args["conditionId"] === "string" ? args["conditionId"].toLowerCase() : "";
  const oracle = typeof args["oracle"] === "string" ? args["oracle"].toLowerCase() : "";
  const questionId = typeof args["questionId"] === "string" ? args["questionId"].toLowerCase() : "";
  const slots = args["outcomeSlotCount"];
  // The contract refuses fewer than 2 and more than 256 slots.
  if (!BYTES32.test(conditionId) || !ADDRESS.test(oracle) || !BYTES32.test(questionId) || typeof slots !== "bigint" || slots < 2n || slots > 256n) return null;
  return { conditionId: conditionId as Hex, oracle: oracle as Address, questionId: questionId as Hex, outcomeSlotCount: Number(slots) };
}

// A module result is [] until resolved, then values in parts per million that sum to RESULT_DENOMINATOR; anything else is
// refused (null), as the SDK's readModuleResults reader refuses it.
export function decodeModuleResolution(log: RpcLog, module: Address): ModuleResolutionEvent | null {
  if (log.address.toLowerCase() !== module.toLowerCase() || log.topics[0] !== MODULE_CONDITION_RESOLVED_TOPIC) return null;
  let args: Record<string, unknown>;
  try {
    args = decodeEventLog({ abi: POLYMARKET_MODULE_ABI, eventName: "ConditionResolved", data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true }).args as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const conditionId = typeof args["conditionId"] === "string" ? args["conditionId"].toLowerCase() : "";
  const result = args["result"];
  if (!BYTES31.test(conditionId) || !Array.isArray(result) || result.length < 2 || !result.every((value) => typeof value === "bigint" && value >= 0n)) return null;
  const values = result as bigint[];
  if (values.reduce((sum, value) => sum + value, 0n) !== POLYMARKET_RESULT_DENOMINATOR) return null;
  return { conditionId: conditionId as Hex, result: values, denominator: POLYMARKET_RESULT_DENOMINATOR };
}
