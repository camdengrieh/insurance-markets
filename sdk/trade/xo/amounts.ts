import { atomicToDec, decToAtomic, roundDiv } from "../../money/decimal.js";
import type { CapBasis } from "../contract.js";
import { FEE_RATE_CEILING_BPS, MAX_FEE_RATE_BPS, SHARE_MICRO_PER_SHARE, SHARE_STEP_MICRO } from "../../chain/xo/constants.js";
import { MAX_TICK, MIN_TICK, SIDE_BUY, SIDE_SELL, TICK_DENOMINATOR } from "./constants.js";
import { SigningError } from "./errors.js";
import type { OrderSide } from "./order.js";

// Integer-only price and size handling. Rules taken from the notes (01 c, 07 2.2, 22 c and 9.2):
//   - price is a tick integer in [1, 999] over 1000 (tick 0.001); off-tick is rejected
//   - shares and collateral are 6-decimal micro units
//   - BUY:  makerAmount = collateral micro, takerAmount = shares micro
//   - SELL: makerAmount = shares micro,     takerAmount = collateral micro
//   - collateral micro = sharesMicro * tick / 1000, and the division must be exact
//   - text goes through the shared decimal grammar (sdk/money/decimal.ts): more places than the scale is refused,
//     trailing zeros included
// XO documents no rounding rule for inexact products, so those are rejected (never rounded). With the
// share step at 1,000 micro-shares every product is exact at every tick, so the question never arises.
//
// Floors. The gateway's real minimum size and notional are NOT ESTABLISHABLE WITHOUT A LIVE ORDER
// (docs/phase1-gap-closing.md OR6, N7). Until a live order shows them the client floors are the
// conservative ones below, applied whenever the caller does not name its own: a share step of 1,000
// micro-shares (0.001 share), at least 1 share and at least $0.30. A caller can change any one of the
// three (`constraints`); the others keep their default.
//
// Fees. The signer cannot bound the fee, because orders carry no fee field. The on-chain per-leg bound is
// `maxFeeRateBps` of the leg's cash value (800 today, hard ceiling 1,000) and it sits ON TOP of a BUY's
// principal, while a SELL's proceeds are net of it [docs/research/22 sec 9 item 2, V M2]. So the most a
// BUY can cost is makerAmount plus the bound (rounded up), and the least a SELL can net is takerAmount
// minus the bound (rounded up, so the net is rounded down). Both round in the safe direction.

function parseScaledDecimal(
  value: unknown,
  scale: number,
  label: string,
  code: "invalid_price" | "invalid_size",
): bigint {
  const parsed = decToAtomic(value, scale);
  if (parsed.ok) return parsed.value;
  if (parsed.failure === "precision") throw new SigningError(code, `${label} has more than ${scale} decimal places`);
  throw new SigningError(code, `${label} must be a plain non-negative decimal string`);
}

// "0.55" -> 550. Throws on off-tick prices and on anything outside the open interval (0, 1).
export function parsePriceToTick(price: unknown): number {
  const tick = parseScaledDecimal(price, 3, "price", "invalid_price");
  if (tick < BigInt(MIN_TICK) || tick > BigInt(MAX_TICK)) {
    throw new SigningError("invalid_price", `price must be between 0.001 and 0.999`);
  }
  return Number(tick);
}

export function parseSharesToMicro(shares: unknown): bigint {
  const micro = parseScaledDecimal(shares, 6, "shares", "invalid_size");
  if (micro <= 0n) {
    throw new SigningError("invalid_size", "shares must be greater than zero");
  }
  return micro;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

// Smallest share increment (micro-shares) for which sharesMicro * tick / 1000 is a whole number.
// Pure arithmetic, not an XO rule: XO's own share step is unknown.
export function exactShareStepMicro(priceTick: number): bigint {
  assertTick(priceTick);
  return TICK_DENOMINATOR / gcd(BigInt(priceTick), TICK_DENOMINATOR);
}

function assertTick(priceTick: number): void {
  if (!Number.isInteger(priceTick) || priceTick < MIN_TICK || priceTick > MAX_TICK) {
    throw new SigningError("invalid_price", `price tick must be an integer in [${MIN_TICK}, ${MAX_TICK}]`);
  }
}

export function formatTick(priceTick: number): string {
  assertTick(priceTick);
  return atomicToDec(BigInt(priceTick), 3);
}

export function formatMicro(micro: bigint): string {
  if (micro < 0n) throw new SigningError("invalid_integer", "micro amount must not be negative");
  return atomicToDec(micro, 6);
}

// Floors and the share step. Fields left out take the default below; to switch one off pass the value
// that cannot bind (0n for a minimum, 1n for the step).
export type AmountConstraints = {
  minSharesMicro?: bigint;
  minCollateralMicro?: bigint;
  shareStepMicro?: bigint;
};

export const DEFAULT_MIN_SHARES_MICRO = SHARE_MICRO_PER_SHARE;
export const DEFAULT_MIN_COLLATERAL_MICRO = 300_000n;
export const DEFAULT_SHARE_STEP_MICRO = SHARE_STEP_MICRO;

export const DEFAULT_AMOUNT_CONSTRAINTS: Readonly<Required<AmountConstraints>> = Object.freeze({
  minSharesMicro: DEFAULT_MIN_SHARES_MICRO,
  minCollateralMicro: DEFAULT_MIN_COLLATERAL_MICRO,
  shareStepMicro: DEFAULT_SHARE_STEP_MICRO,
});

// Every floor off and a step of one micro-share: the pure arithmetic, for tests of the arithmetic and
// for callers that apply their own policy.
export const NO_AMOUNT_CONSTRAINTS: Readonly<Required<AmountConstraints>> = Object.freeze({
  minSharesMicro: 0n,
  minCollateralMicro: 0n,
  shareStepMicro: 1n,
});

// The constraints in force: the caller's value for each field it names, the default for the rest.
export function resolveAmountConstraints(overrides?: AmountConstraints): Required<AmountConstraints> {
  return {
    minSharesMicro: overrides?.minSharesMicro ?? DEFAULT_AMOUNT_CONSTRAINTS.minSharesMicro,
    minCollateralMicro: overrides?.minCollateralMicro ?? DEFAULT_AMOUNT_CONSTRAINTS.minCollateralMicro,
    shareStepMicro: overrides?.shareStepMicro ?? DEFAULT_AMOUNT_CONSTRAINTS.shareStepMicro,
  };
}

export type OrderAmounts = {
  side: OrderSide;
  priceTick: number;
  sharesMicro: bigint;
  collateralMicro: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
};

export type ComputeAmountsInput = {
  side: OrderSide;
  price: string;
  shares: string;
  // Overrides for the default floors and step (see AmountConstraints).
  constraints?: AmountConstraints;
};

export function computeOrderAmounts(input: ComputeAmountsInput): OrderAmounts {
  if (input.side !== SIDE_BUY && input.side !== SIDE_SELL) {
    throw new SigningError("invalid_order", "side must be 0 (BUY) or 1 (SELL)");
  }
  const priceTick = parsePriceToTick(input.price);
  const sharesMicro = parseSharesToMicro(input.shares);
  const product = sharesMicro * BigInt(priceTick);
  if (product % TICK_DENOMINATOR !== 0n) {
    throw new SigningError(
      "inexact_amount",
      `${input.shares} shares at ${input.price} is not a whole number of micro-USDC; ` +
        `shares must be a multiple of ${formatMicro(exactShareStepMicro(priceTick))} at this price`,
    );
  }
  const collateralMicro = product / TICK_DENOMINATOR;

  const { minSharesMicro, minCollateralMicro, shareStepMicro } = resolveAmountConstraints(input.constraints);
  if (shareStepMicro <= 0n || sharesMicro % shareStepMicro !== 0n) {
    throw new SigningError("invalid_size", `shares are not a multiple of the required share step ${formatMicro(shareStepMicro > 0n ? shareStepMicro : 1n)}`);
  }
  if (sharesMicro < minSharesMicro) {
    throw new SigningError("below_minimum", "shares are below the minimum size");
  }
  if (collateralMicro < minCollateralMicro) {
    throw new SigningError("below_minimum", "notional is below the minimum");
  }

  return input.side === SIDE_BUY
    ? { side: input.side, priceTick, sharesMicro, collateralMicro, makerAmount: collateralMicro, takerAmount: sharesMicro }
    : { side: input.side, priceTick, sharesMicro, collateralMicro, makerAmount: sharesMicro, takerAmount: collateralMicro };
}

// Inverse of computeOrderAmounts. Used to check that a stored order still says what the quote
// said; rejects amounts whose ratio is not an exact tick.
export function decodeOrderAmounts(input: {
  side: OrderSide;
  makerAmount: bigint;
  takerAmount: bigint;
}): Omit<OrderAmounts, "makerAmount" | "takerAmount"> {
  if (input.side !== SIDE_BUY && input.side !== SIDE_SELL) {
    throw new SigningError("invalid_order", "side must be 0 (BUY) or 1 (SELL)");
  }
  if (input.makerAmount <= 0n || input.takerAmount <= 0n) {
    throw new SigningError("invalid_order", "order amounts must be positive");
  }
  const collateralMicro = input.side === SIDE_BUY ? input.makerAmount : input.takerAmount;
  const sharesMicro = input.side === SIDE_BUY ? input.takerAmount : input.makerAmount;
  const scaled = collateralMicro * TICK_DENOMINATOR;
  if (scaled % sharesMicro !== 0n) {
    throw new SigningError("invalid_price", "order amounts do not form an exact price tick");
  }
  const tick = scaled / sharesMicro;
  if (tick < BigInt(MIN_TICK) || tick > BigInt(MAX_TICK)) {
    throw new SigningError("invalid_price", "order amounts imply a price outside 0.001 to 0.999");
  }
  return { side: input.side, priceTick: Number(tick), sharesMicro, collateralMicro };
}

// ---- fees and the cap rule -------------------------------------------------------------------------

const BPS_DENOMINATOR = 10_000n;

function feeBpsOf(value: unknown): bigint {
  const bps = typeof value === "number" ? (Number.isSafeInteger(value) ? BigInt(value) : undefined) : typeof value === "bigint" ? value : undefined;
  if (bps === undefined || bps < 0n || bps > BigInt(FEE_RATE_CEILING_BPS)) {
    throw new SigningError("invalid_integer", `fee bound must be a whole number of basis points from 0 to ${FEE_RATE_CEILING_BPS}`);
  }
  return bps;
}

function positiveAmount(value: unknown, label: string): bigint {
  if (typeof value !== "bigint" || value <= 0n) {
    throw new SigningError("invalid_integer", `${label} must be a positive bigint of micro units`);
  }
  return value;
}

// The most the fee on a BUY leg can be: feeBps of the principal, rounded UP.
export function maxBuyFee(makerAmount: bigint, feeBps: number | bigint): bigint {
  return roundDiv(positiveAmount(makerAmount, "makerAmount") * feeBpsOf(feeBps), BPS_DENOMINATOR, "ceil");
}

// The most a BUY can pull from the maker's balance in total: principal plus the fee bound. Whatever
// partial fills it is split into, the principals add up to at most makerAmount and each fee is at
// most feeBps of its own principal, so the sum is at most this (the contract floors every leg, this
// rounds the whole up).
export function maxBuyOutlay(makerAmount: bigint, feeBps: number | bigint): bigint {
  return positiveAmount(makerAmount, "makerAmount") + maxBuyFee(makerAmount, feeBps);
}

// The least a SELL can net when it fills in one leg: takerAmount is a pre-fee floor, and the fee
// withheld is at most feeBps of the cash value, rounded up so the net is rounded down. Many tiny fills
// can each lose up to one micro-unit to the contract's own floor division on top of this
// [docs/research/22 (c.1)]; that dust is less than one micro-USDC per fill.
export function minSellProceeds(takerAmount: bigint, feeBps: number | bigint): bigint {
  const amount = positiveAmount(takerAmount, "takerAmount");
  return amount - roundDiv(amount * feeBpsOf(feeBps), BPS_DENOMINATOR, "ceil");
}

// The fee bound the relay EXPECTS on chain: the exchange's own bound today (800 bps). The relay watches it with
// a tripwire (a change makes the relay read-only) and uses it to judge fees it observes. It is also the bound
// the creation seed's own $10.80 cap was fixed with (amendment A3), so the seed keeps it.
export const ORDER_FEE_BOUND_BPS = MAX_FEE_RATE_BPS;

// The fee bound the TRADE caps are computed with (review finding SI-2): the contract's hard ceiling of 1,000
// bps, not today's 800. The on-chain bound is an operator setting that can be raised up to that ceiling without
// notice, and a cap that only holds while it stays at 800 is not a cap. Effect on a BUY: the quoted maximum
// outlay is principal x 1.10 instead of principal x 1.08 (a $5.00 BUY counts $5.50, not $5.40; with the $10
// per-order cap the largest principal is $9.09, not $9.25). The live fee read (the tripwire on the on-chain
// bound, and the fee the order book reports) is unchanged.
export const ORDER_CAP_FEE_BPS = FEE_RATE_CEILING_BPS;

// The creation seed (amendment A3): a $10.00 stake, counted with the fee multiplier like any BUY, so
// $10.80 against its own cap. XO asks for "at least $10.00", so the stake is exactly this.
export const SEED_STAKE_ATOMIC = 10_000_000n;
export const SEED_CAP_ATOMIC = maxBuyOutlay(SEED_STAKE_ATOMIC, ORDER_FEE_BOUND_BPS);

export type { CapBasis };

export type OrderCapAmount = {
  side: OrderSide;
  feeBps: number;
  basis: CapBasis;
  // What counts against the per-order cap, the daily cap and the seed cap.
  capAtomic: bigint;
  // BUY: the most cash that can leave the account (equals capAtomic). SELL: null, no cash leaves.
  maxOutlayAtomic: bigint | null;
  // SELL: the least cash that comes back after the fee bound. BUY: null.
  minProceedsAtomic: bigint | null;
  // SELL only: the two numbers capAtomic is the larger of. BUY: null.
  expectedProceedsAtomic: bigint | null;
  faceValueAtomic: bigint | null;
};

export type OrderCapInput = {
  side: OrderSide;
  makerAmount: bigint;
  takerAmount: bigint;
  feeBps: number;
  // SELL only: refuse a SELL whose worst-case net proceeds fall below this (the minimum-proceeds
  // guard). Default $0.30, the same floor as the notional; 0n switches it off.
  minProceedsFloorAtomic?: bigint;
};

// The cap rule (decision D2 as amended by A3, docs/phase1-gap-closing.md sections 8 and 9, and review
// finding RT-3):
//   - every BUY counts makerAmount plus the fee bound, post-only included (a maker can be charged up
//     to the bound too, so there is no exemption);
//   - a SELL counts the LARGER of its expected proceeds (takerAmount) and its shares at the 1.00 USD face
//     value of a share (makerAmount, as micro-USD). A share pays at most 1.00 USD, so the face value is the
//     most one share can ever be worth; counting the larger of the two means a SELL priced far below its
//     worth (a dump at 0.01 of a share that resolves to 1.00) cannot slip under the caps, and the caps do not
//     depend on the book's own best bid as a reference. Its worst-case net proceeds after the fee bound must
//     still clear the minimum-proceeds guard.
export function orderCapAmount(input: OrderCapInput): OrderCapAmount {
  if (input.side !== SIDE_BUY && input.side !== SIDE_SELL) {
    throw new SigningError("invalid_order", "side must be 0 (BUY) or 1 (SELL)");
  }
  const makerAmount = positiveAmount(input.makerAmount, "makerAmount");
  const takerAmount = positiveAmount(input.takerAmount, "takerAmount");
  const feeBps = Number(feeBpsOf(input.feeBps));
  if (input.side === SIDE_BUY) {
    const outlay = maxBuyOutlay(makerAmount, feeBps);
    return {
      side: input.side,
      feeBps,
      basis: "buy_principal_plus_fee_bound",
      capAtomic: outlay,
      maxOutlayAtomic: outlay,
      minProceedsAtomic: null,
      expectedProceedsAtomic: null,
      faceValueAtomic: null,
    };
  }
  const floor = input.minProceedsFloorAtomic ?? DEFAULT_MIN_COLLATERAL_MICRO;
  if (typeof floor !== "bigint" || floor < 0n) {
    throw new SigningError("invalid_integer", "minProceedsFloorAtomic must be a non-negative bigint");
  }
  const minProceeds = minSellProceeds(takerAmount, feeBps);
  if (minProceeds < floor) {
    throw new SigningError("below_minimum", "the worst-case net proceeds of this SELL, after the fee bound, are below the minimum");
  }
  const faceValue = makerAmount;
  return {
    side: input.side,
    feeBps,
    basis: "sell_max_of_proceeds_and_face_value",
    capAtomic: takerAmount > faceValue ? takerAmount : faceValue,
    maxOutlayAtomic: null,
    minProceedsAtomic: minProceeds,
    expectedProceedsAtomic: takerAmount,
    faceValueAtomic: faceValue,
  };
}
