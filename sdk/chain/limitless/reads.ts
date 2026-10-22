import { readRegisteredConditions } from "../exchange.js";
import { ctfSource, type PositionTarget } from "../positions.js";
import type { RpcPort, RpcRequestOptions } from "../rpc.js";
import { LIMITLESS_COLLATERALS, LIMITLESS_EXCHANGES, LIMITLESS_PINS } from "./constants.js";

// Which Limitless position ids to read, and which condition decides each, from the chain alone. A Limitless market
// row names its two token ids but not its condition, so the condition is asked of the pinned exchanges' token
// registries (getConditionId) and accepted only if the id derives from it with USDC or one of the pinned wrapped
// collaterals (sdk/chain/exchange.ts). An id no exchange knows, or one the derivation does not confirm, is still
// read for its balance, with no result.

const DECIMAL = /^[0-9]{1,78}$/;
const MAX_U256 = (1n << 256n) - 1n;

export interface LimitlessTargets {
  readonly targets: readonly PositionTarget[];
  // Ids whose condition could not be confirmed on chain.
  readonly unconfirmed: number;
}

export async function limitlessTargets(port: RpcPort, tokenIds: readonly (string | bigint)[], options?: RpcRequestOptions): Promise<LimitlessTargets> {
  const ids = [
    ...new Set(
      tokenIds.flatMap((id) => {
        if (typeof id === "bigint") return id >= 0n && id <= MAX_U256 ? [id] : [];
        return DECIMAL.test(id) && BigInt(id) <= MAX_U256 ? [BigInt(id)] : [];
      }),
    ),
  ];
  const conditions = await readRegisteredConditions(port, LIMITLESS_EXCHANGES, ids, LIMITLESS_COLLATERALS, options);
  let unconfirmed = 0;
  const targets = ids.map((tokenId): PositionTarget => {
    const derived = conditions.get(tokenId) ?? null;
    if (derived === null) unconfirmed += 1;
    return { tokenId, ledger: LIMITLESS_PINS.conditionalTokens, resolution: derived === null ? null : ctfSource(LIMITLESS_PINS.conditionalTokens, derived.conditionId, derived.outcomeIndex) };
  });
  return { targets, unconfirmed };
}
