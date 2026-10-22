import { binaryPositionIds } from "../ctf.js";
import { ctfSource, moduleSource, type PositionTarget } from "../positions.js";
import type { Hex } from "../rpc.js";
import { POLYMARKET_PINS, POLYMARKET_USDC_E, POLYMARKET_WRAPPED_COLLATERAL } from "./constants.js";

// Which Polymarket position ids to read, and where their results live, from what the chain itself defines.
//
// CTF ("v1") markets: a position id is getPositionId(collateral, getCollectionId(0, conditionId, indexSet)), with USDC.e
// as collateral for a plain market and the NegRiskAdapter's wrapped collateral for a negative-risk one. The market's
// listed token ids are used only if they derive from its condition exactly; a list that does not is refused.
//
// Protocol V2 ("v2") markets: the position id encodes its module, condition and outcome
// (docs.polymarket.com/resources/onchain-position-data.md, read 2026-10-22):
//   moduleId = id >> 248 (1 BinaryModule, 2 NegRiskModule, 3 CombinatorialModule), outcomeIndex = id & 0xff,
//   conditionId = the id with its low byte cleared, a bytes31 (the top 31 bytes).
// Results are read from the module the id names; combinatorial positions keep their legs elsewhere and are not read.

export type PolymarketLedger = "ctf_v1" | "protocol_v2";

export interface PolymarketMarketIds {
  readonly conditionId: string;
  readonly ledger: PolymarketLedger;
  // Gamma's negRisk flag; null when the row did not carry it (both collaterals are then tried).
  readonly negRisk: boolean | null;
  // The listed ids, in outcome order, as decimal strings.
  readonly tokenIds: readonly string[];
}

export type PolymarketTargets = { readonly ok: true; readonly targets: readonly PositionTarget[] } | { readonly ok: false; readonly why: string };

const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]{1,78}$/;
const MAX_U256 = (1n << 256n) - 1n;

export interface V2PositionParts {
  readonly moduleId: number;
  // The 31-byte condition id, as the modules' bytes31 argument.
  readonly conditionId: Hex;
  readonly outcomeIndex: number;
}

export function v2PositionParts(id: bigint): V2PositionParts | null {
  if (id < 0n || id > MAX_U256) return null;
  const moduleId = Number(id >> 248n);
  if (moduleId < 1 || moduleId > 3) return null;
  return { moduleId, conditionId: `0x${(id >> 8n).toString(16).padStart(62, "0")}` as Hex, outcomeIndex: Number(id & 0xffn) };
}

function v2Target(id: bigint): PositionTarget | null {
  const parts = v2PositionParts(id);
  if (parts === null) return null;
  const module = parts.moduleId === 1 ? POLYMARKET_PINS.binaryModule : parts.moduleId === 2 ? POLYMARKET_PINS.negRiskModule : null;
  return { tokenId: id, ledger: POLYMARKET_PINS.positionManager, resolution: module === null ? null : moduleSource(module, parts.conditionId, parts.outcomeIndex) };
}

export function polymarketTargets(market: PolymarketMarketIds): PolymarketTargets {
  if (!market.tokenIds.every((id) => DECIMAL.test(id) && BigInt(id) <= MAX_U256)) return { ok: false, why: "A listed token id is not a 256-bit integer." };
  const ids = market.tokenIds.map((id) => BigInt(id));
  if (market.ledger === "protocol_v2") {
    const targets = ids.map(v2Target);
    if (targets.some((target) => target === null)) return { ok: false, why: "A listed position id does not name a Polymarket Protocol V2 module." };
    const parts = ids.map((id) => v2PositionParts(id) as V2PositionParts);
    if (new Set(parts.map((part) => part.conditionId)).size !== 1 || parts.some((part, index) => part.outcomeIndex !== index)) {
      return { ok: false, why: "The listed position ids are not the outcomes of one condition in order." };
    }
    return { ok: true, targets: targets as PositionTarget[] };
  }
  if (!CONDITION_ID.test(market.conditionId)) return { ok: false, why: "The market has no 32-byte condition id." };
  if (ids.length !== 2) return { ok: false, why: "Only two-outcome conditions are derived." };
  const conditionId = market.conditionId.toLowerCase() as Hex;
  const collaterals = market.negRisk === true ? [POLYMARKET_WRAPPED_COLLATERAL] : market.negRisk === false ? [POLYMARKET_USDC_E] : [POLYMARKET_USDC_E, POLYMARKET_WRAPPED_COLLATERAL];
  for (const collateral of collaterals) {
    const derived = binaryPositionIds(collateral, conditionId);
    if (derived[0] === ids[0] && derived[1] === ids[1]) {
      return { ok: true, targets: derived.map((tokenId, index) => ({ tokenId, ledger: POLYMARKET_PINS.conditionalTokens, resolution: ctfSource(POLYMARKET_PINS.conditionalTokens, conditionId, index) })) };
    }
  }
  return { ok: false, why: "The listed token ids do not derive from the market's condition, so they were not read." };
}

// A token id found by a transfer scan, with no market row: a V2 id still names its module and condition; a CTF id
// names nothing the chain can look up (Polymarket's current exchanges keep no token registry).
export function polymarketScannedTarget(id: bigint, ledger: "ctf_v1" | "protocol_v2"): PositionTarget | null {
  if (ledger === "protocol_v2") return v2Target(id);
  return { tokenId: id, ledger: POLYMARKET_PINS.conditionalTokens, resolution: null };
}
