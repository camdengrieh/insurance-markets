// pm_signal_request: describe a Quotient request. The AGENT pays (PayBox use_service or
// pay_x402 from a dedicated data credential); this module never pays, signs, fetches or holds a
// key. It returns the canonical URL, the pinned payment tuple to compare a free unpaid 402
// challenge against, a price ceiling, the purpose and the budget arithmetic. Pure and offline.

import * as z from "zod/v4";
import { formatAtomic } from "../../src/guardrails/amount.js";
import {
  DATA_BUDGET,
  DISCLOSURE,
  FORBIDDEN_ROUTES,
  GATEWAY_ORIGIN,
  OPENAPI_VERSION_PINNED,
  PAYMENT_PIN,
  PINS_VERIFIED_ON,
  PRICE_CEILING_MULTIPLE,
  PURPOSES,
  QUOTIENT_CLAUSE,
  ROUTES,
  type Purpose,
  type RouteSpec,
} from "./constants.js";
import { flagOff, type FlagContext, type FlagOff } from "./flag.js";
import { MARKET_KEY_RE, encodeKeyForPath } from "./keys.js";

// ---------------------------------------------------------------------------------------------
// Input

const decimal01 = z
  .string()
  .regex(/^(0(\.[0-9]{1,6})?|1(\.0{1,6})?)$/, "expected a decimal between 0 and 1 with at most 6 places");
const usdDecimal = z.string().regex(/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/, "expected dollars with at most 2 places");
const topic = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/, "topic has unsupported characters");
const marketKey = z.string().max(260).regex(MARKET_KEY_RE, "expected a Quotient market key such as polymarket:123");

const candidatesParams = z.strictObject({
  // Only Polymarket International and Kalshi get verified live quotes.
  venue: z.enum(["polymarket", "kalshi"]).optional(),
  topic: topic.optional(),
  min_spread: decimal01.optional(),
  max_forecast_age: z.int().min(1).max(720).optional(),
  sort: z.enum(["spread_desc", "spread_asc", "updated_desc", "volume_desc", "quality"]).optional(),
});

const signalsParams = z.strictObject({
  venue: z.enum(["polymarket", "polymarket_us", "kalshi", "hl_outcomes"]).optional(),
  topic: topic.optional(),
  status: z.enum(["active", "ineligible", "in_play", "retired"]).optional(),
  min_conviction: z.int().min(1).max(3).optional(),
  min_capacity_usd: usdDecimal.optional(),
  exclude_drawdown_risk: z.boolean().optional(),
  window: z.int().min(1).max(168).optional(),
  sort: z.enum(["quality"]).optional(),
});

const enrichmentParams = z.strictObject({
  market_keys: z.array(marketKey).min(1).max(10),
});

const forecastParams = z.strictObject({
  market_key: marketKey,
  history: z.int().min(0).max(10).optional(),
});

const noParams = z.strictObject({});

export const describeRequestInputSchema = z.discriminatedUnion("purpose", [
  z.strictObject({ purpose: z.literal("candidates"), params: candidatesParams.optional(), challenge: z.unknown().optional() }),
  z.strictObject({ purpose: z.literal("published_signals"), params: signalsParams.optional(), challenge: z.unknown().optional() }),
  z.strictObject({ purpose: z.literal("enrichment"), params: enrichmentParams, challenge: z.unknown().optional() }),
  z.strictObject({ purpose: z.literal("forecast_history"), params: forecastParams, challenge: z.unknown().optional() }),
  z.strictObject({ purpose: z.literal("track_record"), params: noParams.optional(), challenge: z.unknown().optional() }),
]);
export type DescribeRequestInput = z.input<typeof describeRequestInputSchema>;

// ---------------------------------------------------------------------------------------------
// Canonical URL

type Query = Record<string, string>;

function buildQuery(entries: readonly (readonly [string, string | undefined])[]): Query {
  const q: Query = {};
  for (const [k, v] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (v !== undefined) q[k] = v;
  }
  return q;
}

function queryString(q: Query): string {
  const parts = Object.entries(q).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

interface Built {
  readonly path: string;
  readonly query: Query;
  readonly defaultsApplied: readonly string[];
}

function build(input: z.output<typeof describeRequestInputSchema>): Built {
  const route = ROUTES[input.purpose];
  const defaults: string[] = [];
  // Applies a documented default and records it so the agent sees what was filled in.
  const dflt = (name: string, value: string | number | boolean | undefined, fallback: string | number | boolean): string => {
    if (value === undefined) {
      defaults.push(`${name}=${String(fallback)}`);
      return String(fallback);
    }
    return String(value);
  };
  switch (input.purpose) {
    case "candidates": {
      const p = input.params ?? {};
      return {
        path: route.path,
        query: buildQuery([
          ["min_spread", dflt("min_spread", p.min_spread, "0.08")],
          ["max_forecast_age", dflt("max_forecast_age", p.max_forecast_age, 24)],
          ["sort", dflt("sort", p.sort, "quality")],
          ["venue", p.venue],
          ["topic", p.topic],
        ]),
        defaultsApplied: defaults,
      };
    }
    case "published_signals": {
      const p = input.params ?? {};
      return {
        path: route.path,
        query: buildQuery([
          ["status", dflt("status", p.status, "active")],
          ["min_conviction", dflt("min_conviction", p.min_conviction, 2)],
          ["exclude_drawdown_risk", dflt("exclude_drawdown_risk", p.exclude_drawdown_risk, true)],
          ["sort", dflt("sort", p.sort, "quality")],
          ["min_capacity_usd", p.min_capacity_usd],
          ["venue", p.venue],
          ["topic", p.topic],
          ["window", p.window === undefined ? undefined : String(p.window)],
        ]),
        defaultsApplied: defaults,
      };
    }
    case "enrichment":
      return {
        path: route.path,
        query: buildQuery([["market_keys", input.params.market_keys.join(",")]]),
        defaultsApplied: defaults,
      };
    case "forecast_history": {
      const p = input.params;
      return {
        path: route.path.replace("{marketKey}", encodeKeyForPath(p.market_key)),
        query: buildQuery([["history", dflt("history", p.history, 3)]]),
        defaultsApplied: defaults,
      };
    }
    case "track_record":
      return { path: route.path, query: {}, defaultsApplied: defaults };
  }
}

// ---------------------------------------------------------------------------------------------
// Challenge check

export type ChallengeFailure =
  | "FREE_ROUTE_RETURNED_402"
  | "NOT_AN_OBJECT"
  | "X402_VERSION"
  | "NO_ACCEPTS"
  | "TOO_MANY_ACCEPTS"
  | "SCHEME"
  | "NETWORK"
  | "ASSET"
  | "PAY_TO"
  | "TIMEOUT"
  | "AMOUNT_INVALID"
  | "AMOUNT_OVER_CEILING"
  | "RESOURCE_MISMATCH";

export type ChallengeCheck =
  | {
      readonly ok: true;
      readonly amountAtomic: string;
      readonly amountUsd: string;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly failures: readonly ChallengeFailure[]; readonly action: string };

const HARD_STOP = "Hard stop. Do not pay. A mismatch in host, payee, asset, network or amount is the attack signal.";
const ATOMIC = /^[1-9][0-9]{0,17}$/;
const MAX_ACCEPTS = 8;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Compares a challenge (as returned by the free unpaid GET, body or PAYMENT-REQUIRED header
// decoded) with the pins. EVERY accepts entry must pass, so an agent cannot be steered to a
// different option by position; at least one entry is required.
export function verifyChallenge(
  challenge: unknown,
  expected: { readonly url: string; readonly priceAtomic: bigint },
): ChallengeCheck {
  if (expected.priceAtomic === 0n) return { ok: false, failures: ["FREE_ROUTE_RETURNED_402"], action: HARD_STOP };
  if (!isRecord(challenge)) return { ok: false, failures: ["NOT_AN_OBJECT"], action: HARD_STOP };
  const failures = new Set<ChallengeFailure>();
  if (challenge["x402Version"] !== PAYMENT_PIN.x402Version) failures.add("X402_VERSION");

  const accepts = challenge["accepts"];
  if (!Array.isArray(accepts) || accepts.length === 0) {
    failures.add("NO_ACCEPTS");
  } else if (accepts.length > MAX_ACCEPTS) {
    failures.add("TOO_MANY_ACCEPTS");
  }
  const ceiling = expected.priceAtomic * PRICE_CEILING_MULTIPLE;
  const warnings: string[] = [];
  let firstAmount: bigint | null = null;
  if (Array.isArray(accepts) && accepts.length > 0 && accepts.length <= MAX_ACCEPTS) {
    for (const entry of accepts) {
      if (!isRecord(entry)) {
        failures.add("NOT_AN_OBJECT");
        continue;
      }
      if (entry["scheme"] !== PAYMENT_PIN.scheme) failures.add("SCHEME");
      if (entry["network"] !== PAYMENT_PIN.network) failures.add("NETWORK");
      if (typeof entry["asset"] !== "string" || entry["asset"].toLowerCase() !== PAYMENT_PIN.asset) failures.add("ASSET");
      if (typeof entry["payTo"] !== "string" || entry["payTo"].toLowerCase() !== PAYMENT_PIN.payTo) failures.add("PAY_TO");
      const t = entry["maxTimeoutSeconds"];
      if (!Number.isInteger(t) || (t as number) < 1 || (t as number) > PAYMENT_PIN.maxTimeoutSecondsCeiling) {
        failures.add("TIMEOUT");
      }
      const amount = entry["amount"];
      if (typeof amount !== "string" || !ATOMIC.test(amount)) {
        failures.add("AMOUNT_INVALID");
      } else {
        const a = BigInt(amount);
        if (a > ceiling) failures.add("AMOUNT_OVER_CEILING");
        else if (a !== expected.priceAtomic) warnings.push("amount differs from the pinned table price but is within the 2x ceiling");
        firstAmount ??= a;
      }
    }
  }

  // x402 v2 puts the resource in the challenge; if present it must be exactly the described URL.
  const resource = challenge["resource"];
  if (resource !== undefined) {
    const url = isRecord(resource) ? resource["url"] : undefined;
    if (url !== expected.url) failures.add("RESOURCE_MISMATCH");
  } else {
    warnings.push("challenge carried no resource.url, so the paid URL was not compared; compare the URL you paid to the described one");
  }

  if (failures.size > 0 || firstAmount === null) {
    return { ok: false, failures: [...failures], action: HARD_STOP };
  }
  return {
    ok: true,
    amountAtomic: firstAmount.toString(),
    amountUsd: formatAtomic(firstAmount, PAYMENT_PIN.assetDecimals),
    warnings,
  };
}

// ---------------------------------------------------------------------------------------------
// Budget

export type BudgetCheck =
  | { readonly ok: true; readonly remainingAfterAtomic: string; readonly remainingAfterUsd: string }
  | { readonly ok: false; readonly reason: "PER_CALL_CAP" | "DAILY_CAP" | "BAD_INPUT" };

export interface BudgetInput {
  readonly requestAtomic: string;
  // What the agent has already spent on Quotient today (agent-held; the plugin keeps no state).
  readonly spentTodayAtomic: string;
  readonly perCallCapAtomic?: string;
  readonly perDayCapAtomic?: string;
}

const DIGITS = /^(0|[1-9][0-9]{0,17})$/;

export function checkBudget(input: BudgetInput): BudgetCheck {
  const fields = [input.requestAtomic, input.spentTodayAtomic, input.perCallCapAtomic, input.perDayCapAtomic];
  if (fields.some((f) => f !== undefined && !DIGITS.test(f))) return { ok: false, reason: "BAD_INPUT" };
  const request = BigInt(input.requestAtomic);
  const spent = BigInt(input.spentTodayAtomic);
  const perCall = input.perCallCapAtomic === undefined ? DATA_BUDGET.perCallAtomic : BigInt(input.perCallCapAtomic);
  const perDay = input.perDayCapAtomic === undefined ? DATA_BUDGET.perDayAtomic : BigInt(input.perDayCapAtomic);
  if (request > perCall) return { ok: false, reason: "PER_CALL_CAP" };
  if (spent + request > perDay) return { ok: false, reason: "DAILY_CAP" };
  const left = perDay - spent - request;
  return { ok: true, remainingAfterAtomic: left.toString(), remainingAfterUsd: formatAtomic(left, PAYMENT_PIN.assetDecimals) };
}

// ---------------------------------------------------------------------------------------------
// Description

export interface RequestDescription {
  readonly ok: true;
  readonly purpose: Purpose;
  readonly routeId: string;
  readonly method: "GET";
  readonly url: string;
  readonly origin: typeof GATEWAY_ORIGIN;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly defaultsApplied: readonly string[];
  readonly summary: string;
  readonly role: string;
  readonly cacheHintMinutes: readonly [number, number];
  readonly free: boolean;
  readonly price: { readonly atomic: string; readonly usd: string };
  readonly ceiling: { readonly atomic: string; readonly usd: string };
  readonly expectedPayment: null | {
    readonly x402Version: number;
    readonly scheme: string;
    readonly network: string;
    readonly asset: string;
    readonly payTo: string;
    readonly maxTimeoutSecondsCeiling: number;
    readonly amountAtomic: string;
    readonly amountCeilingAtomic: string;
  };
  readonly budget: {
    readonly perCallUsd: string;
    readonly perDayUsd: string;
    readonly withinPerCallCap: boolean;
  };
  readonly paymentIdentifierHint: string;
  readonly agentSteps: readonly string[];
  readonly neverRequest: readonly { readonly pattern: string; readonly why: string }[];
  readonly pins: { readonly openapiVersion: string; readonly verifiedOn: string };
  readonly agentPays: true;
  readonly pluginPays: false;
  readonly challengeCheck?: ChallengeCheck;
  readonly clause: string;
  readonly disclosure: readonly string[];
}

export type DescribeResult = RequestDescription | FlagOff | { readonly ok: false; readonly error: "BAD_INPUT"; readonly detail: string };

export function describeRequest(ctx: FlagContext, rawInput: unknown): DescribeResult {
  if (!ctx.enabled) return flagOff();
  const parsed = describeRequestInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "BAD_INPUT", detail: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).slice(0, 5).join("; ") };
  }
  const input = parsed.data;
  const route: RouteSpec = ROUTES[input.purpose];
  const built = build(input);
  const url = `${GATEWAY_ORIGIN}${built.path}${queryString(built.query)}`;
  const free = route.priceAtomic === 0n;
  const ceilingAtomic = route.priceAtomic * PRICE_CEILING_MULTIPLE;

  const steps = free
    ? [
        "This route is free and unpaid. The plugin never fetches it; the agent may GET the exact URL and show both the 60-day and the all-time rows.",
      ]
    : [
        "1. Optional: discover_services with query 'quotient' to confirm the route is listed and the price hint.",
        "2. Send a free unpaid GET to the exact URL above. A 402 challenge is free (no charge on 402, 404, 422, 429 or 5xx).",
        "3. Pass the decoded challenge back as `challenge` (or compare it field by field with expectedPayment). Any mismatch, or an amount above the ceiling, is a hard stop: do not pay.",
        "4. Pay from a dedicated data credential: use_service, or pay_x402 with the accepts entry exactly as returned and x402_version 2. The plugin cannot and will not pay.",
        "5. Poll get_request on the same request_id; never re-call to finish. Use the payment-identifier extension on retries so a repeat cannot double-charge.",
        "6. Hand only the selected rows (not the whole feed; arguments are capped near 64 KiB) to pm_signal_parse.",
      ];

  const description: RequestDescription = {
    ok: true,
    purpose: input.purpose,
    routeId: route.routeId,
    method: "GET",
    url,
    origin: GATEWAY_ORIGIN,
    path: built.path,
    query: built.query,
    defaultsApplied: built.defaultsApplied,
    summary: route.summary,
    role: route.role,
    cacheHintMinutes: route.cacheHintMinutes,
    free,
    price: { atomic: route.priceAtomic.toString(), usd: formatAtomic(route.priceAtomic, PAYMENT_PIN.assetDecimals) },
    ceiling: { atomic: ceilingAtomic.toString(), usd: formatAtomic(ceilingAtomic, PAYMENT_PIN.assetDecimals) },
    expectedPayment: free
      ? null
      : {
          x402Version: PAYMENT_PIN.x402Version,
          scheme: PAYMENT_PIN.scheme,
          network: PAYMENT_PIN.network,
          asset: PAYMENT_PIN.asset,
          payTo: PAYMENT_PIN.payTo,
          maxTimeoutSecondsCeiling: PAYMENT_PIN.maxTimeoutSecondsCeiling,
          amountAtomic: route.priceAtomic.toString(),
          amountCeilingAtomic: ceilingAtomic.toString(),
        },
    budget: {
      perCallUsd: formatAtomic(DATA_BUDGET.perCallAtomic, PAYMENT_PIN.assetDecimals),
      perDayUsd: formatAtomic(DATA_BUDGET.perDayAtomic, PAYMENT_PIN.assetDecimals),
      withinPerCallCap: route.priceAtomic <= DATA_BUDGET.perCallAtomic,
    },
    paymentIdentifierHint: "payment-identifier extension id: 16 to 128 characters matching ^[a-zA-Z0-9_-]+$; generate once per logical request and reuse it on retries.",
    agentSteps: steps,
    neverRequest: FORBIDDEN_ROUTES,
    pins: { openapiVersion: OPENAPI_VERSION_PINNED, verifiedOn: PINS_VERIFIED_ON },
    agentPays: true,
    pluginPays: false,
    clause: QUOTIENT_CLAUSE,
    disclosure: DISCLOSURE,
  };

  if (input.challenge === undefined) return description;
  return { ...description, challengeCheck: verifyChallenge(input.challenge, { url, priceAtomic: route.priceAtomic }) };
}

export { PURPOSES };
