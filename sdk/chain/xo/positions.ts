import { binaryPositionIds } from "../ctf.js";
import { readRegisteredConditions } from "../exchange.js";
import { ctfSource, type PositionTarget } from "../positions.js";
import type { Hex, RpcPort, RpcRequestOptions } from "../rpc.js";
import { CTF_EXCHANGE, USDC_E_ADDRESS } from "./constants.js";
import { XO_PINS } from "./pins.js";

// Which XO position ids to read (chain 3223), and which condition decides each. An XO market row names its condition
// (the market id) and its two outcome token ids; they are used only if the ids derive from the condition with XO
// USDC as collateral (the Conditional Tokens algorithm, sdk/chain/ctf.ts). A token found by a transfer scan is looked
// up in the exchange's token registry and checked the same way.

const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^[0-9]{1,78}$/;
const MAX_U256 = (1n << 256n) - 1n;

export type XoTargets = { readonly ok: true; readonly targets: readonly PositionTarget[] } | { readonly ok: false; readonly why: string };

export function xoTargets(market: { readonly conditionId: string; readonly tokenIds: readonly string[] }): XoTargets {
  if (!CONDITION_ID.test(market.conditionId)) return { ok: false, why: "The market has no 32-byte condition id." };
  if (market.tokenIds.length !== 2 || !market.tokenIds.every((id) => DECIMAL.test(id) && BigInt(id) <= MAX_U256)) return { ok: false, why: "Only two-outcome conditions are derived." };
  const conditionId = market.conditionId.toLowerCase() as Hex;
  const derived = binaryPositionIds(USDC_E_ADDRESS, conditionId);
  if (derived[0] !== BigInt(market.tokenIds[0] as string) || derived[1] !== BigInt(market.tokenIds[1] as string)) {
    return { ok: false, why: "The listed token ids do not derive from the market's condition, so they were not read." };
  }
  return { ok: true, targets: derived.map((tokenId, index) => ({ tokenId, ledger: XO_PINS.conditionalTokens, resolution: ctfSource(XO_PINS.conditionalTokens, conditionId, index) })) };
}

export async function xoScannedTargets(port: RpcPort, tokenIds: readonly bigint[], options?: RpcRequestOptions): Promise<{ readonly targets: readonly PositionTarget[]; readonly unconfirmed: number }> {
  const conditions = await readRegisteredConditions(port, [CTF_EXCHANGE], tokenIds, [USDC_E_ADDRESS], options);
  let unconfirmed = 0;
  const targets = [...new Set(tokenIds)].map((tokenId): PositionTarget => {
    const derived = conditions.get(tokenId) ?? null;
    if (derived === null) unconfirmed += 1;
    return { tokenId, ledger: XO_PINS.conditionalTokens, resolution: derived === null ? null : ctfSource(XO_PINS.conditionalTokens, derived.conditionId, derived.outcomeIndex) };
  });
  return { targets, unconfirmed };
}
