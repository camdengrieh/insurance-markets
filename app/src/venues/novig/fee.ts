import { fromAtomic, roundQty, subQty, type Qty } from "../../core/money";
import { ONE_PRICE } from "./shared";

// Novig's taker fee (docs.novig.com/api/concepts/fees): Fee = c * P * (1 - P) * N, where P is the execution price,
// N the contracts in the fill (each pays $1, so N is shares), c the market's `fee.coefficient`. The maker never
// pays. Rounded half-up to $0.00001, no cent floor. Whether it is charged at all depends on the market's
// `fee.charged`: WHEN_LIVE (only on fills matched while the event is in play) or ALWAYS. The caller decides the
// phase; this function only does the arithmetic, exactly.
//
// Worked check from the research: 10,000 API units (100 shares) at 0.50 with c = 0.06 costs $1.50.
export const FEE_ROUNDING_PLACES = 5;

export function takerFeeUsd(coefficient: Qty, price: Qty, shares: Qty): Qty | null {
  if (coefficient.unit !== "price" || price.unit !== "price" || shares.unit !== "shares") return null;
  if (coefficient.atomic < 0n || price.atomic <= 0n || shares.atomic < 0n) return null;
  const complement = subQty(ONE_PRICE, price);
  // price must lie strictly inside (0, 1)
  if (complement.atomic <= 0n) return null;
  const atomic = coefficient.atomic * price.atomic * complement.atomic * shares.atomic;
  const scale = coefficient.scale + price.scale + complement.scale + shares.scale;
  return roundQty(fromAtomic("usd", atomic, scale), FEE_ROUNDING_PLACES, "half_up");
}
