import { CEILINGS, type GuardrailConfig } from "../config.js";
import { formatAtomic, type ParseResult } from "./amount.js";
import {
  MAX_PRICE_TICK,
  MIN_PRICE_TICK,
  PRICE_TICK_DENOMINATOR,
  USDC_E_DECIMALS,
} from "./constants.js";

// Pure limit checks. No clock reads, no I/O, no storage; the caller passes everything in.
//
// What these checks are worth (gate-results risk B2, read before relying on them):
//   - They bind what THIS plugin prepares and submits, using caps that come from the owner's
//     environment and are clamped to compiled-in ceilings. There is deliberately no per-call cap
//     or override argument: a cap the agent can pass in is not a cap.
//   - They do NOT bind an agent that holds an autonomous PayBox grant. request_wallet_sign carries
//     no value field, so the agent can sign an XO order without ever calling this plugin. Against
//     that agent every cap here is advisory. The real boundaries are the wallet grant's approval
//     mode and an author-operated relay that holds the XO credentials.
//   - The plugin has no storage and no user identity, so it cannot count today's spend itself.
//     checkDailyCap takes the running total from a DailyLedger, which only an author-operated
//     relay can provide. Without one the daily check passes with a warning that says so. It never
//     claims a cap was enforced when it was not.
//   - There is no cap on how many markets are created per day (user decision, 2026-10-19). The
//     creation fee and the seed count toward the daily USD cap like any other spend.

export type GuardCode =
  | "kill_switch"
  | "create_disabled"
  | "amount_invalid"
  | "amount_not_positive"
  | "order_cap_exceeded"
  | "daily_cap_exceeded"
  | "ledger_invalid"
  | "price_invalid"
  | "price_out_of_range"
  | "reference_invalid"
  | "price_outside_band"
  | "quote_invalid_time"
  | "quote_expired"
  | "expiration_invalid"
  | "expiration_missing"
  | "expiration_in_past"
  | "expiration_too_far";

export interface Allowed {
  readonly allowed: true;
  // Reasons the pass is weaker than it looks, such as a daily cap that was not counted.
  readonly warnings: readonly string[];
}

export interface Blocked {
  readonly allowed: false;
  readonly code: GuardCode;
  readonly message: string;
}

export type GuardDecision = Allowed | Blocked;

export const NO_LEDGER_WARNING =
  "The plugin has no storage, so today's total was not counted and this cap was not checked across calls.";

function ok(warnings: readonly string[] = []): Allowed {
  return { allowed: true, warnings };
}

function block(code: GuardCode, message: string): Blocked {
  return { allowed: false, code, message };
}

const usdc = (atomic: bigint): string => `${formatAtomic(atomic, USDC_E_DECIMALS)} USDC.e`;

// Configs are normally built by loadConfig, but a hand-built or corrupted one must not widen a
// cap: clamp to the ceiling and treat anything malformed as zero (block everything).
function effectiveCap(value: unknown, ceiling: bigint): bigint {
  if (typeof value !== "bigint" || value < 0n) return 0n;
  return value < ceiling ? value : ceiling;
}

function effectiveCount(value: unknown, ceiling: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return 0;
  return Math.min(value, ceiling);
}

function effectiveSeconds(value: unknown, ceiling: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return 0;
  return Math.min(value, ceiling);
}

function badAmount(amountAtomic: unknown): Blocked | undefined {
  if (typeof amountAtomic !== "bigint") {
    return block("amount_invalid", "The amount must be an exact integer of USDC.e units.");
  }
  if (amountAtomic <= 0n) {
    return block("amount_not_positive", "The amount must be greater than zero.");
  }
  return undefined;
}

// Kill switch and creation switch ---------------------------------------------------------------

export type ToolClass = "read" | "write" | "create";

// Reads always pass. Every write-adjacent tool (prepare, submit, cancel, fund, withdraw, enable
// trading, redeem, create) is blocked by the kill switch. Creation also needs its own opt-in.
export function checkToolAllowed(toolClass: ToolClass, cfg: GuardrailConfig): GuardDecision {
  if (toolClass === "read") return ok();
  if (cfg.killSwitch !== false) {
    return block("kill_switch", "The kill switch is on: write tools are disabled. Reads still work.");
  }
  if (toolClass === "create" && cfg.createEnabled !== true) {
    return block(
      "create_disabled",
      "Market creation is switched off by the operator. It is off by default.",
    );
  }
  return ok();
}

// Order size ------------------------------------------------------------------------------------

// `amountAtomic` is the order's notional in USDC.e atomic units (6 decimals): the collateral a
// BUY puts up, or shares times price for a SELL. See notionalAtomic.
export function checkOrderCap(amountAtomic: bigint, cfg: GuardrailConfig): GuardDecision {
  const bad = badAmount(amountAtomic);
  if (bad !== undefined) return bad;
  const cap = effectiveCap(cfg.maxOrderAtomic, CEILINGS.maxOrderAtomic);
  if (amountAtomic > cap) {
    return block(
      "order_cap_exceeded",
      `This order is ${usdc(amountAtomic)}, above the per-order cap of ${usdc(cap)}.`,
    );
  }
  return ok();
}

// `spentTodayAtomic` must come from a DailyLedger. Pass undefined when there is none.
export function checkDailyCap(
  spentTodayAtomic: bigint | undefined,
  amountAtomic: bigint,
  cfg: GuardrailConfig,
): GuardDecision {
  const bad = badAmount(amountAtomic);
  if (bad !== undefined) return bad;
  if (spentTodayAtomic === undefined) return ok([NO_LEDGER_WARNING]);
  if (typeof spentTodayAtomic !== "bigint" || spentTodayAtomic < 0n) {
    return block("ledger_invalid", "The daily spend total is not a valid amount.");
  }
  const cap = effectiveCap(cfg.maxDailyAtomic, CEILINGS.maxDailyAtomic);
  if (spentTodayAtomic + amountAtomic > cap) {
    return block(
      "daily_cap_exceeded",
      `Today's spend of ${usdc(spentTodayAtomic)} plus this ${usdc(amountAtomic)} would pass the daily cap of ${usdc(cap)}.`,
    );
  }
  return ok();
}

// Notional of an order in USDC.e atomic units: shares_micro * ticks / 1000. XO has not documented
// a rounding rule, so a size that does not divide exactly is refused instead of rounded
// [01 units: "reject sizes where shares_micro * tick % 1000 != 0"].
export function notionalAtomic(sharesMicro: bigint, priceTicks: number): ParseResult<bigint> {
  if (typeof sharesMicro !== "bigint" || sharesMicro <= 0n) {
    return { ok: false, reason: "The share size must be a positive integer of micro-shares." };
  }
  if (!isTick(priceTicks)) {
    return { ok: false, reason: "The price must be a whole tick from 1 to 999 (0.001 to 0.999)." };
  }
  const product = sharesMicro * BigInt(priceTicks);
  const denominator = BigInt(PRICE_TICK_DENOMINATOR);
  if (product % denominator !== 0n) {
    return {
      ok: false,
      reason: "This size and price do not give a whole number of USDC.e units; adjust the size.",
    };
  }
  return { ok: true, value: product / denominator };
}

// Price ------------------------------------------------------------------------------------------

export type OrderSide = "BUY" | "SELL";

function isTick(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PRICE_TICK &&
    value <= MAX_PRICE_TICK
  );
}

// The read client keeps prices as micro-probability (1e6 = 1.0); the guards work in 0.001 ticks.
// This is the one conversion between them, and it refuses anything off-tick or out of range.
export function ticksFromMicroPrice(priceMicro: bigint): ParseResult<number> {
  const perTick = BigInt(1_000_000 / PRICE_TICK_DENOMINATOR);
  if (typeof priceMicro !== "bigint" || priceMicro % perTick !== 0n) {
    return { ok: false, reason: "The price is not a whole 0.001 tick." };
  }
  const ticks = priceMicro / perTick;
  if (ticks < BigInt(MIN_PRICE_TICK) || ticks > BigInt(MAX_PRICE_TICK)) {
    return { ok: false, reason: "The price must be between 0.001 and 0.999." };
  }
  return { ok: true, value: Number(ticks) };
}

// The limit price must be a real tick, and must not be worse for the user than `referenceTicks`
// (taken from the live book by the caller) by more than the configured band. The band is
// directional: a BUY far below the market or a SELL far above it simply rests, which costs the
// user nothing, so only paying up (BUY) or selling cheap (SELL) is limited.
export function checkPriceBand(
  side: OrderSide,
  priceTicks: number,
  referenceTicks: number,
  cfg: GuardrailConfig,
): GuardDecision {
  if (side !== "BUY" && side !== "SELL") {
    return block("price_invalid", "The side must be BUY or SELL.");
  }
  if (!isTick(priceTicks)) {
    return block(
      "price_out_of_range",
      `The price must be a whole tick from ${MIN_PRICE_TICK} to ${MAX_PRICE_TICK} (0.001 to 0.999).`,
    );
  }
  if (!isTick(referenceTicks)) {
    return block(
      "reference_invalid",
      "No usable reference price from the order book, so the price band cannot be checked.",
    );
  }
  const band = effectiveCount(cfg.priceBandTicks, CEILINGS.priceBandTicks);
  const worse = side === "BUY" ? priceTicks - referenceTicks : referenceTicks - priceTicks;
  if (worse > band) {
    return block(
      "price_outside_band",
      `The ${side} price is ${worse} ticks worse than the reference; the limit is ${band} ticks (0.001 each).`,
    );
  }
  return ok();
}

// Quotes and order expiry -----------------------------------------------------------------------

// Tolerated clock difference between whoever issued the quote and whoever checks it.
export const CLOCK_SKEW_MS = 5_000;

function isTimeMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function quoteExpiresAtMs(issuedAtMs: number, cfg: GuardrailConfig): number {
  return issuedAtMs + effectiveSeconds(cfg.quoteTtlSeconds, CEILINGS.quoteTtlSeconds) * 1000;
}

export function checkQuoteFresh(
  issuedAtMs: number,
  nowMs: number,
  cfg: GuardrailConfig,
): GuardDecision {
  if (!isTimeMs(issuedAtMs) || !isTimeMs(nowMs)) {
    return block("quote_invalid_time", "The quote time is not a valid timestamp.");
  }
  if (issuedAtMs > nowMs + CLOCK_SKEW_MS) {
    return block("quote_invalid_time", "The quote is dated in the future.");
  }
  if (nowMs >= quoteExpiresAtMs(issuedAtMs, cfg)) {
    return block("quote_expired", "The quote has expired. Request a new one.");
  }
  return ok();
}

// Unix-seconds expiration to put inside the signed order. Never 0, which means "never expires".
export function orderExpirationSeconds(nowMs: number, cfg: GuardrailConfig): bigint {
  const window = effectiveSeconds(cfg.orderExpirySeconds, CEILINGS.orderExpirySeconds);
  return BigInt(Math.floor(nowMs / 1000) + window);
}

// Verifies the expiration of an order about to be signed or submitted: set, in the future, and no
// further out than the ceiling. A signed order has no timestamp, so this is its only lifetime.
export function checkOrderExpiration(
  expirationSeconds: bigint,
  nowMs: number,
  cfg: GuardrailConfig,
): GuardDecision {
  if (typeof expirationSeconds !== "bigint" || !isTimeMs(nowMs)) {
    return block("expiration_invalid", "The order expiration is not a valid timestamp.");
  }
  if (expirationSeconds === 0n) {
    return block("expiration_missing", "Orders must expire; 0 means they never would.");
  }
  const nowSeconds = BigInt(Math.floor(nowMs / 1000));
  if (expirationSeconds <= nowSeconds) {
    return block("expiration_in_past", "The order expiration has already passed.");
  }
  const window = effectiveSeconds(cfg.orderExpirySeconds, CEILINGS.orderExpirySeconds);
  if (expirationSeconds > nowSeconds + BigInt(window) + BigInt(CLOCK_SKEW_MS / 1000)) {
    return block("expiration_too_far", `Orders may live at most ${window} seconds.`);
  }
  return ok();
}

// Combining ----------------------------------------------------------------------------------------

// First block wins. Otherwise a pass that carries every warning.
export function combineDecisions(...decisions: readonly GuardDecision[]): GuardDecision {
  const warnings: string[] = [];
  for (const decision of decisions) {
    if (!decision.allowed) return decision;
    warnings.push(...decision.warnings);
  }
  return ok([...new Set(warnings)]);
}

// Daily counters ---------------------------------------------------------------------------------

// INTERFACE ONLY. The plugin has no storage and every call runs in a fresh sandbox, so it cannot
// keep a daily counter. An implementation must live in an author-operated relay (a service the
// plugin calls over an allowlisted host) that keys totals by smart account and UTC day and makes
// the check-and-add atomic. Parallel calls would otherwise race past the cap, and a proposal that
// is not yet confirmed has to be reserved when it is made. Even with a relay these caps stay
// advisory against an autonomous agent that signs without going through the plugin (risk B2).
//
// Two counters, both in USDC.e atomic units: `spend` (orders, the creation fee and seed; the $50
// daily cap) and `fund` (Base to XO deposits; the separate funding cap of decisions D3 and A10).
export interface DailyUsage {
  readonly spentAtomic: bigint;
  readonly fundedAtomic: bigint;
}

export type ReserveRequest = {
  readonly kind: "spend" | "fund";
  // Lowercase 0x smart-account address and a UTC day key from utcDayKey.
  readonly account: string;
  readonly day: string;
  readonly amountAtomic: bigint;
  readonly limitAtomic: bigint;
  // Idempotency key (a prepared_id or funding_id). Reserving the same key twice returns the same
  // reservation and adds nothing the second time.
  readonly reservationId?: string;
};

export type ReserveResult =
  | { readonly reserved: true; readonly reservationId: string }
  | { readonly reserved: false; readonly usage: DailyUsage };

export interface DailyLedger {
  usage(account: string, day: string): Promise<DailyUsage>;
  // Atomically adds to today's total only if the result stays within the limit.
  reserve(request: ReserveRequest): Promise<ReserveResult>;
  // Gives a reservation back, for a proposal that expired or an order that was rejected.
  release(reservationId: string): Promise<void>;
}

// UTC day key such as "2026-10-19", or undefined for an invalid time.
export function utcDayKey(nowMs: number): string | undefined {
  if (!isTimeMs(nowMs)) return undefined;
  const date = new Date(nowMs);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}
