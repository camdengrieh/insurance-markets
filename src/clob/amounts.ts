// Exact integer price and size handling for the two CLOB venues. No floating point anywhere: a price is a string on
// the market's tick grid, a size is a string with at most the venue's size decimals, and both become 6-decimal
// integers ("micro" units of collateral and shares). Rules, each with a test (test/clob-amounts.test.ts):
//
//   - price: 0 < p < 1, at most `priceDecimals` places, and a whole multiple of the tick; anything else is refused;
//   - shares: > 0, at most `sizeDecimals` places (2 on Polymarket, per docs.polymarket.com/trading/place-orders.md
//     "round the share quantity down to the size decimals"; the same 2 is applied to Limitless, whose docs give no
//     size grid and whose recorded books carry whole-unit sizes), and at least the market's minimum;
//   - collateral = shares x price. With 2 size decimals and at most 4 price decimals the product has at most 6
//     places, so it is always a whole number of micro units; the code still CHECKS exactness and refuses an inexact
//     product instead of rounding it, so an order can never be built for more cash than the ticket says;
//   - BUY:  makerAmount = collateral micro, takerAmount = shares micro;
//     SELL: makerAmount = shares micro,     takerAmount = collateral micro (both venues, same convention as the CTF
//     exchange; place-orders.md "Computing makerAmount and takerAmount" and eip712-signing "Amounts").
//
// The cap arithmetic is the XO one (src/xo/signing/amounts.ts orderCapAmount) with the CLOB policy fee ceiling, so a
// BUY counts principal plus the ceiling and a SELL the larger of its proceeds and its face value.

import { formatAtomic } from "../guardrails/amount.js";
import { orderCapAmount, type OrderCapAmount } from "../xo/signing/amounts.js";
import { SIDE_BUY, SIDE_SELL } from "../xo/signing/constants.js";
import { SigningError } from "../xo/signing/errors.js";
import { CLOB_CAP_FEE_BPS, CLOB_COLLATERAL_DECIMALS } from "./venues.js";

export const MICRO = 1_000_000n;
const MAX_INPUT_LENGTH = 40;
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export type ClobSide = typeof SIDE_BUY | typeof SIDE_SELL;

function scaled(value: unknown, maxDecimals: number, label: string, code: "invalid_price" | "invalid_size"): bigint {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_INPUT_LENGTH) throw new SigningError(code, `${label} must be a plain decimal string`);
  const match = DECIMAL.exec(value);
  if (match === null) throw new SigningError(code, `${label} must be a plain non-negative decimal string`);
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > maxDecimals) throw new SigningError(code, `${label} has more than ${maxDecimals} decimal places`);
  return BigInt(whole) * MICRO + BigInt(fraction.padEnd(CLOB_COLLATERAL_DECIMALS, "0") || "0");
}

// A tick such as "0.01" as micro units (10000n). Refuses anything that is not a price step.
export function parseTickMicro(tick: unknown): bigint {
  const micro = scaled(tick, CLOB_COLLATERAL_DECIMALS, "tick", "invalid_price");
  if (micro <= 0n || micro >= MICRO) throw new SigningError("invalid_price", "tick must be a price step between 0 and 1");
  return micro;
}

export interface PriceGrid {
  // The market's tick, as the venue spells it ("0.01").
  readonly tick: string;
  // How many decimal places a price may carry on this grid.
  readonly priceDecimals: number;
}

// "0.52" on a 0.01 grid -> 520000n. Off-grid, out of range or over-precise prices are refused.
export function parseClobPriceMicro(price: unknown, grid: PriceGrid): bigint {
  const micro = scaled(price, grid.priceDecimals, "price", "invalid_price");
  if (micro <= 0n || micro >= MICRO) throw new SigningError("invalid_price", "price must be between 0 and 1, exclusive");
  const tick = parseTickMicro(grid.tick);
  if (micro % tick !== 0n) throw new SigningError("invalid_price", `price must be a whole multiple of the ${grid.tick} tick`);
  return micro;
}

export function parseClobSharesMicro(shares: unknown, sizeDecimals: number): bigint {
  const micro = scaled(shares, sizeDecimals, "shares", "invalid_size");
  if (micro <= 0n) throw new SigningError("invalid_size", "shares must be greater than zero");
  return micro;
}

// Canonical text of a micro amount: "0.52", "10", "2.5" (no trailing zeros, no exponent).
export function formatMicro(micro: bigint): string {
  return formatAtomic(micro, CLOB_COLLATERAL_DECIMALS);
}

export interface ClobAmountsInput {
  readonly side: ClobSide;
  readonly price: string;
  readonly shares: string;
  readonly grid: PriceGrid;
  readonly sizeDecimals: number;
  // The market's minimum order size in micro shares (0n when the venue states none).
  readonly minSharesMicro: bigint;
}

export interface ClobAmounts {
  readonly side: ClobSide;
  readonly priceMicro: bigint;
  readonly sharesMicro: bigint;
  readonly collateralMicro: bigint;
  readonly makerAmount: bigint;
  readonly takerAmount: bigint;
}

export function computeClobAmounts(input: ClobAmountsInput): ClobAmounts {
  if (input.side !== SIDE_BUY && input.side !== SIDE_SELL) throw new SigningError("invalid_order", "side must be 0 (BUY) or 1 (SELL)");
  const priceMicro = parseClobPriceMicro(input.price, input.grid);
  const sharesMicro = parseClobSharesMicro(input.shares, input.sizeDecimals);
  const product = sharesMicro * priceMicro;
  // Never rounded: an inexact product is refused so the signed cash amount is exactly shares x price.
  if (product % MICRO !== 0n) throw new SigningError("inexact_amount", `${input.shares} shares at ${input.price} is not a whole number of micro units of collateral`);
  const collateralMicro = product / MICRO;
  if (collateralMicro <= 0n) throw new SigningError("below_minimum", "the order's cash value rounds to nothing");
  if (sharesMicro < input.minSharesMicro) throw new SigningError("below_minimum", "shares are below the market's minimum order size");
  return input.side === SIDE_BUY
    ? { side: input.side, priceMicro, sharesMicro, collateralMicro, makerAmount: collateralMicro, takerAmount: sharesMicro }
    : { side: input.side, priceMicro, sharesMicro, collateralMicro, makerAmount: sharesMicro, takerAmount: collateralMicro };
}

// Inverse of computeClobAmounts, for a stored or decoded order: the price the two amounts imply, exactly, or a refusal.
export function decodeClobAmounts(input: { readonly side: ClobSide; readonly makerAmount: bigint; readonly takerAmount: bigint }): { readonly priceMicro: bigint; readonly sharesMicro: bigint; readonly collateralMicro: bigint } {
  if (input.side !== SIDE_BUY && input.side !== SIDE_SELL) throw new SigningError("invalid_order", "side must be 0 (BUY) or 1 (SELL)");
  if (input.makerAmount <= 0n || input.takerAmount <= 0n) throw new SigningError("invalid_order", "order amounts must be positive");
  const collateralMicro = input.side === SIDE_BUY ? input.makerAmount : input.takerAmount;
  const sharesMicro = input.side === SIDE_BUY ? input.takerAmount : input.makerAmount;
  const scaledPrice = collateralMicro * MICRO;
  if (scaledPrice % sharesMicro !== 0n) throw new SigningError("inexact_amount", "the amounts do not imply an exact price");
  const priceMicro = scaledPrice / sharesMicro;
  if (priceMicro <= 0n || priceMicro >= MICRO) throw new SigningError("invalid_price", "the implied price is outside (0, 1)");
  return { priceMicro, sharesMicro, collateralMicro };
}

// The cap rule with the CLOB policy fee ceiling. A SELL's minimum-proceeds floor is 0 here: the venues' own minimum
// sizes are enforced by `minSharesMicro`, and a SELL that nets little is still a SELL of what the owner holds.
export function clobCapAmount(amounts: Pick<ClobAmounts, "side" | "makerAmount" | "takerAmount">, feeBps = CLOB_CAP_FEE_BPS): OrderCapAmount {
  return orderCapAmount({ side: amounts.side, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, feeBps, minProceedsFloorAtomic: 0n });
}
