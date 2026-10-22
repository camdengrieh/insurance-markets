import { encodeAbiParameters, keccak256 } from "viem";

import { pow10, roundDiv } from "../../money/decimal.js";
import { fromAtomic, type Qty } from "../../money/qty.js";
import type { Address, Hex } from "./rpc.js";

// Exact integer math for Uniswap v4 pools. No floating point anywhere: a sqrt price is a 160-bit integer and a
// TYD price is a decimal with 12 places built from bigint division.

export interface PoolKey {
  readonly currency0: Address;
  readonly currency1: Address;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: Address;
}

// Pool id = keccak256(abi.encode(poolKey)) (reproduced against the on-chain ids of all 20 listed markets in the
// research verification pass).
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}

const Q192 = 1n << 192n;
export const PRICE_SCALE = 12;
const TEN_POW_24 = pow10(24);

function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  return roundDiv(numerator, denominator, "half_up");
}

// TYD per outcome token from a pool's sqrtPriceX96 (research 11 section 7.2). With P = (sqrtPriceX96 / 2^96)^2
// = raw token1 per raw token0:
//   outcome token is currency0 (18 decimals), TYD currency1 (6): price = P x 10^12
//   TYD is currency0, outcome token currency1:                    price = 10^12 / P
// The result has 12 decimal places, rounded half up. Null for an uninitialised pool (sqrtPriceX96 = 0), a
// negative or oversize input, and a price above 1 TYD: outcome liquidity is bounded to [0, 1] by the swap
// validator, so more than 1 means the decimals or the pool are not what this reads, and nothing is shown.
export function sqrtPriceToPrice(sqrtPriceX96: bigint, outcomeIsCurrency0: boolean, outcomeDecimals = 18, tydDecimals = 6): Qty | null {
  if (sqrtPriceX96 <= 0n || sqrtPriceX96 >= 1n << 160n) return null;
  if (outcomeDecimals !== 18 || tydDecimals !== 6) return null;
  const square = sqrtPriceX96 * sqrtPriceX96;
  const scaled = outcomeIsCurrency0 ? divHalfUp(square * TEN_POW_24, Q192) : divHalfUp(TEN_POW_24 * Q192, square);
  if (scaled > pow10(PRICE_SCALE)) return null;
  return fromAtomic("price", scaled, PRICE_SCALE);
}

export type Rounding = "floor" | "ceil";

// numerator / denominator as a decimal with `scale` places, rounded by `mode`. Denominator must be positive.
export function ratioQty(unit: "price", numerator: bigint, denominator: bigint, scale: number, mode: Rounding): Qty {
  if (denominator <= 0n || numerator < 0n) throw new RangeError("ratio needs a positive denominator and a non-negative numerator");
  return fromAtomic(unit, roundDiv(numerator * pow10(scale), denominator, mode), scale);
}
