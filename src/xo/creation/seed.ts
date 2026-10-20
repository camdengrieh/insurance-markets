// The creation seed order (docs/phase1-gap-closing.md CR7, N9, decision D5 and amendment A3; research note 23
// section 5 and rule O08).
//
// XO's create flow asks the creator for a seed: a buy order that gives the new market its first liquidity
// ("a stake of at least $10, and a seed price from 5c to 95c"; XO's own seeds are resting buys, exactly
// $10.00 in 46 of 71 cases). Amendment A3 fixes how this project places it:
//
//   - every order is GTD, expiry never 0, so the seed is a post-only GTD BUY living 7 to 30 days; a longer
//     life needs a new approval;
//   - the 1.08 fee multiplier applies to every BUY, post-only included (a maker can be charged up to the
//     800 bps bound), so the seed has its own cap of $10.80, which is a $10.00 stake times 1.08;
//   - it counts toward the $50 per day like any order, and the $1 creation fee counts too;
//   - it is placed only after the market is ACTIVE and the orderbook says `active: true`; a 422 "market is
//     not active" means wait and retry, not fail.
//
// A consequence worth knowing. "At least $10" and "at most $10.80 with the multiplier" leave exactly one
// stake: $10.00. On this project's price grid (0.001 ticks, shares in multiples of 0.001) the principal is
// shares times tick, so only a tick that divides 10,000,000 gives exactly $10.00: 15 prices between 5 and
// 95 cents. Any other price is refused, with the valid ones listed, never rounded. `seedPriceChoices` lists them.
//
// Pure: the caller passes the clock and the facts. Nothing is signed or sent here.

import { MAX_ORDER_TTL_S, type PostRequest } from "../../relay/contract.js";
import { SEED_MIN_ATOMIC, SEED_PRICE_MAX_TICKS, SEED_PRICE_MIN_TICKS } from "../../create/lint.js";
import { CREATION_FEE_ATOMIC, SHARE_STEP_MICRO } from "../chain/constants.js";
import {
  ORDER_FEE_BOUND_BPS,
  SEED_CAP_ATOMIC,
  SEED_STAKE_ATOMIC,
  computeOrderAmounts,
  formatMicro,
  formatTick,
  maxBuyOutlay,
  orderCapAmount,
  parsePriceToTick,
} from "../signing/amounts.js";
import { SIDE_BUY } from "../signing/constants.js";
import { parseDecimalToMicro } from "../units.js";
import type { ReviewPhase } from "./review.js";

// ---- constants --------------------------------------------------------------------------------------------

const DAY_S = 86_400;
// A3: 7 to 30 days. The default is the shortest, so that a stale seed expires soon.
export const SEED_TTL_S = Object.freeze({ min: 7 * DAY_S, max: MAX_ORDER_TTL_S, default: 7 * DAY_S });
export const SEED_FEE_BOUND_BPS = ORDER_FEE_BOUND_BPS;
// What counts against the daily cap for one creation that is seeded: the fee and the seed's cap.
export const CREATION_ATTEMPT_COST_ATOMIC = CREATION_FEE_ATOMIC + SEED_CAP_ATOMIC;

// The retry schedule for a 422 "market is not active" (CR7, O08): short at first (the orderbook indexes a
// fresh activation within seconds), capped at five minutes, and given up on after half an hour.
export const SEED_RETRY = Object.freeze({
  delaysS: Object.freeze([15, 30, 60, 120, 240, 300]),
  maxAttempts: 8,
  maxTotalS: 1800,
});

// ---- the plan ---------------------------------------------------------------------------------------------

export type SeedCode =
  | "seed_outcome_invalid"
  | "seed_token_invalid"
  | "seed_price_invalid"
  | "seed_price_out_of_range"
  | "seed_price_off_grid"
  | "seed_stake_invalid"
  | "seed_below_minimum"
  | "seed_exceeds_cap"
  | "seed_ttl_invalid"
  | "seed_amounts_invalid";

export interface SeedInput {
  readonly outcome: string;
  readonly yesTokenId: string;
  readonly noTokenId: string;
  // Decimal dollars per share of the outcome being backed, such as "0.5".
  readonly price: string;
  // Decimal dollars; defaults to the one stake the cap allows, "10".
  readonly stakeUsd?: string;
  // Order life in seconds, 7 to 30 days; defaults to 7 days.
  readonly ttlS?: number;
  // When given, a seed that outlives the market gets a warning.
  readonly marketExpiresAtS?: number;
  readonly nowS?: number;
  // True when the token ids were checked against the orderbook's own market record (`resolveSeedTokens`).
  readonly tokensVerified?: boolean;
}

export interface SeedOrderPlan {
  readonly outcome: "yes" | "no";
  readonly tokenId: string;
  readonly side: "BUY";
  readonly tif: "GTD";
  readonly postOnly: true;
  readonly purpose: "seed";
  // Decimal strings, as the relay's order/prepare takes them.
  readonly price: string;
  readonly shares: string;
  readonly ttlS: number;
  readonly priceTick: number;
  readonly sharesMicro: bigint;
  // shares times price, in USDC.e micro-units (always 10,000,000 on this grid).
  readonly principalAtomic: bigint;
  // What counts against the seed cap and the daily cap: the principal plus the 800 bps fee bound.
  readonly capAtomic: bigint;
  readonly feeBoundBps: number;
  readonly ledgerCategory: "seed";
  readonly countsTowardDailyCap: true;
  readonly warnings: readonly string[];
}

export type SeedPlanResult =
  | { readonly ok: true; readonly plan: SeedOrderPlan }
  | { readonly ok: false; readonly code: SeedCode; readonly message: string; readonly choices?: readonly string[] };

const TOKEN_ID = /^(0|[1-9][0-9]{0,77})$/;

function fail(code: SeedCode, message: string, choices?: readonly string[]): SeedPlanResult {
  return choices === undefined ? { ok: false, code, message } : { ok: false, code, message, choices };
}

// The prices (as decimal strings) at which a stake lands on the grid exactly: the tick divides the stake.
export function seedPriceChoices(stakeAtomic: bigint = SEED_STAKE_ATOMIC): string[] {
  const choices: string[] = [];
  for (let tick = SEED_PRICE_MIN_TICKS; tick <= SEED_PRICE_MAX_TICKS; tick += 1) {
    if (stakeAtomic % BigInt(tick) === 0n) choices.push(formatTick(tick));
  }
  return choices;
}

export function planSeedOrder(input: SeedInput): SeedPlanResult {
  const outcome = typeof input.outcome === "string" ? input.outcome.trim().toLowerCase() : "";
  if (outcome !== "yes" && outcome !== "no") return fail("seed_outcome_invalid", 'The outcome to back must be "yes" or "no".');
  const tokenId = outcome === "yes" ? input.yesTokenId : input.noTokenId;
  if (typeof tokenId !== "string" || !TOKEN_ID.test(tokenId) || tokenId === "0") return fail("seed_token_invalid", "The outcome token id is not a decimal token id.");
  if (input.yesTokenId === input.noTokenId) return fail("seed_token_invalid", "The Yes and No token ids are the same.");

  let priceTick: number;
  try {
    priceTick = parsePriceToTick(input.price);
  } catch {
    return fail("seed_price_invalid", "The seed price must be a decimal such as 0.5 on the 0.001 grid.");
  }
  if (priceTick < SEED_PRICE_MIN_TICKS || priceTick > SEED_PRICE_MAX_TICKS) {
    return fail("seed_price_out_of_range", "The seed price must be between 5 and 95 cents.");
  }

  const stakeText = input.stakeUsd === undefined ? "10" : input.stakeUsd;
  const stake = parseDecimalToMicro(stakeText, 6);
  if (stake === null || stake <= 0n) return fail("seed_stake_invalid", "The stake must be a positive dollar amount with at most 6 decimals.");
  if (stake < SEED_MIN_ATOMIC) return fail("seed_below_minimum", "XO asks for a seed stake of at least $10.");
  if (maxBuyOutlay(stake, SEED_FEE_BOUND_BPS) > SEED_CAP_ATOMIC) {
    return fail("seed_exceeds_cap", "With the 800 bps fee bound counted, the seed cap of $10.80 fits a stake of exactly $10.00 and no more.");
  }
  // principal = (shares in steps of 0.001) times the tick, so the tick has to divide the stake.
  if (stake % BigInt(priceTick) !== 0n) {
    return fail(
      "seed_price_off_grid",
      "At this price a $10.00 stake does not land on the share grid exactly, and amounts are never rounded. Use one of the listed prices.",
      seedPriceChoices(stake),
    );
  }
  const sharesMicro = (stake * 1000n) / BigInt(priceTick);

  const ttlS = input.ttlS === undefined ? SEED_TTL_S.default : input.ttlS;
  if (!Number.isSafeInteger(ttlS) || ttlS < SEED_TTL_S.min || ttlS > SEED_TTL_S.max) {
    return fail("seed_ttl_invalid", "A seed lives 7 to 30 days.");
  }

  const price = formatTick(priceTick);
  const shares = formatMicro(sharesMicro);
  let principal: bigint;
  let cap: bigint;
  try {
    const amounts = computeOrderAmounts({ side: SIDE_BUY, price, shares });
    if (amounts.sharesMicro % SHARE_STEP_MICRO !== 0n) throw new Error("share step");
    principal = amounts.makerAmount;
    cap = orderCapAmount({ side: SIDE_BUY, makerAmount: amounts.makerAmount, takerAmount: amounts.takerAmount, feeBps: SEED_FEE_BOUND_BPS }).capAtomic;
  } catch {
    return fail("seed_amounts_invalid", "The seed amounts failed the order arithmetic checks.");
  }
  if (principal !== stake || cap > SEED_CAP_ATOMIC) return fail("seed_amounts_invalid", "The seed amounts do not match the stake or exceed the seed cap.");

  const warnings: string[] = [];
  if (input.tokensVerified !== true) {
    warnings.push("The outcome tokens were taken from the creation log (outcome 1 is Yes). Check them against the orderbook's market record before signing.");
  }
  if (input.marketExpiresAtS !== undefined && input.nowS !== undefined && input.nowS + ttlS > input.marketExpiresAtS) {
    warnings.push("The seed order outlives the market. That is harmless, but it cannot be shortened below 7 days.");
  }
  return {
    ok: true,
    plan: {
      outcome,
      tokenId,
      side: "BUY",
      tif: "GTD",
      postOnly: true,
      purpose: "seed",
      price,
      shares,
      ttlS,
      priceTick,
      sharesMicro,
      principalAtomic: principal,
      capAtomic: cap,
      feeBoundBps: SEED_FEE_BOUND_BPS,
      ledgerCategory: "seed",
      countsTowardDailyCap: true,
      warnings,
    },
  };
}

// The body of POST /v1/order/prepare for this seed.
export function seedOrderRequest(plan: SeedOrderPlan, owner: string): PostRequest<"/v1/order/prepare"> {
  return {
    owner,
    token_id: plan.tokenId,
    side: "BUY",
    price: plan.price,
    shares: plan.shares,
    tif: "GTD",
    ttl_s: plan.ttlS,
    post_only: true,
    purpose: "seed",
  };
}

// ---- which token is Yes -------------------------------------------------------------------------------------

export type TokenResolution =
  | { readonly ok: true; readonly yesTokenId: string; readonly noTokenId: string; readonly verified: boolean }
  | { readonly ok: false; readonly code: "seed_token_mismatch"; readonly message: string };

// The creation log lists outcome 1 and outcome 2; index 0 is the Yes slot (23 sec 3.1). The orderbook's market
// record lists its own tokens in order. When it is available the two must agree on both ids and on order, or
// nothing is placed: a seed on the wrong side is real money on the opposite bet.
export function resolveSeedTokens(input: {
  readonly eventYesTokenId: string;
  readonly eventNoTokenId: string;
  readonly orderbookTokens?: readonly { readonly token_id: string }[];
}): TokenResolution {
  const yes = input.eventYesTokenId;
  const no = input.eventNoTokenId;
  if (!TOKEN_ID.test(yes) || !TOKEN_ID.test(no) || yes === no) {
    return { ok: false, code: "seed_token_mismatch", message: "The creation log's token ids are not two different decimal token ids." };
  }
  if (input.orderbookTokens === undefined) return { ok: true, yesTokenId: yes, noTokenId: no, verified: false };
  const [first, second] = input.orderbookTokens;
  if (input.orderbookTokens.length !== 2 || first === undefined || second === undefined) {
    return { ok: false, code: "seed_token_mismatch", message: "The orderbook's market record does not list exactly two tokens." };
  }
  if (first.token_id !== yes || second.token_id !== no) {
    return { ok: false, code: "seed_token_mismatch", message: "The orderbook's token ids or their order differ from the creation log, so which token is Yes is unclear. Nothing was placed." };
  }
  return { ok: true, yesTokenId: yes, noTokenId: no, verified: true };
}

// ---- when to place it -------------------------------------------------------------------------------------------

export type SeedReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: "market_not_active" | "orderbook_not_active" | "orderbook_unknown" };

// Docs: an order on a non-active market gets 422 {"error": "market is not active (status: Pending)"}. Place the
// seed only when the review loop says ACTIVE and the orderbook's market record says `active: true`
// (`active: false` also describes an expired market, so it is not a pending marker by itself).
export function seedReadiness(input: { readonly phase: ReviewPhase; readonly orderbookActive: boolean | null }): SeedReadiness {
  if (input.phase !== "active") return { ready: false, reason: "market_not_active" };
  if (input.orderbookActive === null) return { ready: false, reason: "orderbook_unknown" };
  return input.orderbookActive ? { ready: true } : { ready: false, reason: "orderbook_not_active" };
}

// ---- retry on 422 ------------------------------------------------------------------------------------------------

export interface SeedFailure {
  readonly status?: number;
  // A relay or gateway error code ("ambiguous", "rate_limited", "upstream_rejected").
  readonly code?: string;
  // The gateway's text, untrusted; only matched, never repeated.
  readonly text?: string;
  readonly retryAfterS?: number;
}

export type SeedFailureClass = "not_active" | "ambiguous" | "rate_limited" | "rejected" | "other";

export function classifySeedFailure(failure: SeedFailure): SeedFailureClass {
  if (failure.code === "ambiguous") return "ambiguous";
  if (failure.status === 429 || failure.code === "rate_limited") return "rate_limited";
  const text = (failure.text ?? "").toLowerCase();
  if ((failure.status === 422 || failure.status === undefined) && /market is not active|not active \(status|status: pending/.test(text)) return "not_active";
  if (failure.status === 422 && failure.code === undefined && text === "") return "other";
  if (typeof failure.status === "number" && failure.status >= 400 && failure.status < 500) return "rejected";
  if (failure.code === "upstream_rejected") return "rejected";
  return "other";
}

export type SeedRetryPlan =
  | { readonly action: "retry"; readonly delayS: number; readonly notBeforeS: number; readonly attempt: number }
  | { readonly action: "reconcile" }
  | { readonly action: "stop"; readonly reason: "still_not_active" | "rejected" | "unknown_failure" | "attempts_exhausted" };

export interface SeedRetryInput {
  // Attempts made so far, including the one that just failed (at least 1).
  readonly attempts: number;
  readonly firstAttemptAtS: number;
  readonly nowS: number;
  readonly failure: SeedFailure;
}

// What to do after a failed seed submit. A 422 "not active" waits and retries; an ambiguous result is
// reconciled by order hash and NEVER resent; a rate limit waits; anything else stops (fail closed).
export function planSeedRetry(input: SeedRetryInput): SeedRetryPlan {
  const kind = classifySeedFailure(input.failure);
  if (kind === "ambiguous") return { action: "reconcile" };
  if (kind === "rejected") return { action: "stop", reason: "rejected" };
  if (kind === "other") return { action: "stop", reason: "unknown_failure" };
  const attempts = Number.isSafeInteger(input.attempts) && input.attempts >= 1 ? input.attempts : SEED_RETRY.maxAttempts;
  if (attempts >= SEED_RETRY.maxAttempts) return { action: "stop", reason: "attempts_exhausted" };
  if (input.nowS - input.firstAttemptAtS >= SEED_RETRY.maxTotalS) return { action: "stop", reason: kind === "not_active" ? "still_not_active" : "attempts_exhausted" };
  const base = SEED_RETRY.delaysS[Math.min(attempts - 1, SEED_RETRY.delaysS.length - 1)] as number;
  const hinted = kind === "rate_limited" && typeof input.failure.retryAfterS === "number" && Number.isFinite(input.failure.retryAfterS) ? Math.ceil(input.failure.retryAfterS) : 0;
  const delayS = Math.min(Math.max(base, hinted), 3600);
  return { action: "retry", delayS, notBeforeS: input.nowS + delayS, attempt: attempts + 1 };
}

// ---- the daily cap -----------------------------------------------------------------------------------------------

export interface DayBudget {
  readonly limitAtomic: bigint;
  readonly spentAtomic: bigint;
}

export interface SeedDayCheck {
  readonly fits: boolean;
  readonly neededAtomic: bigint;
  readonly remainingAtomic: bigint;
  readonly remainingAfterAtomic: bigint;
}

// A seed counts toward the daily cap with its full cap amount (stake plus the fee bound).
export function seedFitsDay(plan: Pick<SeedOrderPlan, "capAtomic">, budget: DayBudget): SeedDayCheck {
  const remaining = budget.limitAtomic > budget.spentAtomic ? budget.limitAtomic - budget.spentAtomic : 0n;
  return {
    fits: plan.capAtomic <= remaining,
    neededAtomic: plan.capAtomic,
    remainingAtomic: remaining,
    remainingAfterAtomic: remaining > plan.capAtomic ? remaining - plan.capAtomic : 0n,
  };
}

// How many seeded creations a day's cap pays for: the fee plus the seed's cap each. With no cadence cap
// (a user decision) this, not a count setting, is what limits creation: 4 at $50.
export function seededCreationsPerDay(limitAtomic: bigint): bigint {
  return limitAtomic <= 0n ? 0n : limitAtomic / CREATION_ATTEMPT_COST_ATOMIC;
}
