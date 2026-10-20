import { cmpQty, fromBaseUnits, mulBps, parseQty, toDec, type Qty } from "../../core/money";
import type { Dec } from "../../core/ports";
import { AMOUNT_CEILING_FACTOR, MAX_CALL_USD, PINNED_PAYMENT, QUOTIENT_HOST } from "./constants";
import { ROUTES, type RouteId } from "./routes";
import { challengeSchema } from "./schemas";

// The x402 challenge of an unpaid request to a paid route (HTTP 402). This module READS and CHECKS a challenge. It
// has no function that builds a payment, a proof, a PAYMENT-SIGNATURE or X-Payment header, or a signature, and the
// client imports nothing that could: the page never initiates payment (M3-1). The user's own agent pays (import
// mode) or the user's own prepaid key does (mode A).
//
// Hard stop (M3-3): any field of the challenge that differs from the pinned tuple, an amount above the ceiling,
// or two copies of the challenge (body and header) that disagree. A mismatch is the attack signal of research 12
// section 10.6 (a lookalike payee or an inflated price); the client latches and refuses further paid calls until
// a person resets it.

export type MismatchField =
  | "x402Version"
  | "scheme"
  | "network"
  | "asset"
  | "payTo"
  | "maxTimeoutSeconds"
  | "amount"
  | "resource"
  | "accepts"
  | "challenge_inconsistent";

export interface Mismatch {
  readonly field: MismatchField;
  readonly detail: string;
}

export interface PaymentRequired {
  readonly state: "payment_required";
  readonly route: RouteId;
  // The challenge amount in dollars (authoritative), the table price, and whether they differ.
  readonly amountUsd: Dec;
  readonly tableUsd: Dec;
  readonly priceChanged: boolean;
  readonly network: string;
  readonly settlementAsset: "USDC on Base";
}

export interface HardStop {
  readonly state: "hard_stop";
  readonly route: RouteId;
  readonly mismatches: readonly Mismatch[];
}

export interface Unreadable {
  readonly state: "unreadable";
  readonly route: RouteId;
}

export type ChallengeVerdict = PaymentRequired | HardStop | Unreadable;

const MAX_HEADER_CHARS = 16_384;
const ATOMIC = /^[1-9][0-9]{0,18}$/;

function lower(value: unknown): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}

// The amount ceiling for a route: the lower of AMOUNT_CEILING_FACTOR times the table price and MAX_CALL_USD.
export function amountCeiling(route: RouteId): Qty {
  const table = parseQty("usd", ROUTES[route].priceUsd) ?? parseQty("usd", "0");
  const cap = parseQty("usd", MAX_CALL_USD);
  if (table === null || cap === null) throw new RangeError("price table");
  // factor x price, exact: bps of 10_000 times the factor.
  const doubled = mulBps(table, AMOUNT_CEILING_FACTOR * 10_000);
  return cmpQty(doubled, cap) <= 0 ? doubled : cap;
}

interface Checked {
  readonly mismatches: Mismatch[];
  readonly amount: Qty | null;
}

function checkAccept(route: RouteId, accept: unknown, version: unknown): Checked {
  const mismatches: Mismatch[] = [];
  const add = (field: MismatchField, detail: string): void => {
    mismatches.push({ field, detail });
  };
  if (version !== PINNED_PAYMENT.x402Version) add("x402Version", "not the pinned x402 version");
  if (typeof accept !== "object" || accept === null) {
    add("accepts", "an entry is not an object");
    return { mismatches, amount: null };
  }
  const row = accept as Record<string, unknown>;
  if (row["scheme"] !== PINNED_PAYMENT.scheme) add("scheme", "not the pinned scheme");
  if (row["network"] !== PINNED_PAYMENT.network) add("network", "not the pinned network");
  if (lower(row["asset"]) !== PINNED_PAYMENT.asset.toLowerCase()) add("asset", "not the pinned token");
  if (lower(row["payTo"]) !== PINNED_PAYMENT.payTo.toLowerCase()) add("payTo", "not the pinned payee");
  const timeout = row["maxTimeoutSeconds"];
  if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 1 || timeout > PINNED_PAYMENT.maxTimeoutSeconds) {
    add("maxTimeoutSeconds", "missing or longer than the pinned limit");
  }
  let amount: Qty | null = null;
  const raw = row["amount"];
  if (typeof raw !== "string" || !ATOMIC.test(raw)) {
    add("amount", "not a positive whole number of token units");
  } else {
    amount = fromBaseUnits("usd", raw, PINNED_PAYMENT.decimals);
    if (amount === null || cmpQty(amount, amountCeiling(route)) > 0) add("amount", "above the ceiling for this route");
  }
  return { mismatches, amount };
}

// `resource.url`, when the challenge carries one, must be this gateway and the path that was requested.
function checkResource(resource: unknown, requestedPath: string): Mismatch[] {
  if (resource === undefined || resource === null) return [];
  const url = typeof resource === "object" && resource !== null ? (resource as Record<string, unknown>)["url"] : undefined;
  if (url === undefined || url === null) return [];
  if (typeof url !== "string") return [{ field: "resource", detail: "the resource is not a URL" }];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [{ field: "resource", detail: "the resource is not a URL" }];
  }
  if (parsed.protocol !== "https:" || parsed.host !== QUOTIENT_HOST || parsed.username !== "" || parsed.password !== "") {
    return [{ field: "resource", detail: "the resource is not the pinned gateway" }];
  }
  if (parsed.pathname !== requestedPath) return [{ field: "resource", detail: "the resource is not the path that was requested" }];
  return [];
}

function checkOne(route: RouteId, requestedPath: string, challenge: unknown): { mismatches: Mismatch[]; amount: Qty | null } | null {
  const parsed = challengeSchema.safeParse(challenge);
  if (!parsed.success) return null;
  const accepts = parsed.data.accepts;
  if (accepts.length === 0 || accepts.length > 4) {
    return { mismatches: [{ field: "accepts", detail: "no payment option, or an unexpected number of them" }], amount: null };
  }
  const mismatches: Mismatch[] = [];
  let amount: Qty | null = null;
  // EVERY option must be the pinned tuple: an extra option that names another payee is the attack.
  accepts.forEach((accept, index) => {
    const checked = checkAccept(route, accept, parsed.data.x402Version);
    mismatches.push(...checked.mismatches);
    if (index === 0) amount = checked.amount;
  });
  mismatches.push(...checkResource((challenge as Record<string, unknown>)["resource"], requestedPath));
  return { mismatches, amount };
}

// The PAYMENT-REQUIRED response header is base64 JSON. It is read when the browser exposes it; through the
// Cockpit's read proxy only the body is available.
export function decodeChallengeHeader(value: string | null): unknown {
  if (value === null || value.length === 0 || value.length > MAX_HEADER_CHARS || !/^[A-Za-z0-9+/_=-]+$/.test(value)) return undefined;
  try {
    const normal = value.replace(/-/g, "+").replace(/_/g, "/");
    const text = atob(normal);
    if (!text.startsWith("{")) return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function dedupe(items: readonly Mismatch[]): Mismatch[] {
  const seen = new Set<string>();
  const out: Mismatch[] = [];
  for (const item of items) {
    const key = `${item.field}:${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// body: the parsed JSON of the 402 answer (or undefined); header: the raw PAYMENT-REQUIRED header (or null).
export function judgeChallenge(route: RouteId, requestedPath: string, body: unknown, header: string | null): ChallengeVerdict {
  const fromBody = body === undefined ? null : checkOne(route, requestedPath, body);
  const headerJson = decodeChallengeHeader(header);
  const fromHeader = headerJson === undefined ? null : checkOne(route, requestedPath, headerJson);
  if (fromBody === null && fromHeader === null) return { state: "unreadable", route };
  const mismatches: Mismatch[] = [...(fromBody?.mismatches ?? []), ...(fromHeader?.mismatches ?? [])];
  if (fromBody?.amount != null && fromHeader?.amount != null && cmpQty(fromBody.amount, fromHeader.amount) !== 0) {
    mismatches.push({ field: "challenge_inconsistent", detail: "the body and the header name different amounts" });
  }
  if (mismatches.length > 0) return { state: "hard_stop", route, mismatches: dedupe(mismatches) };
  const amount = fromBody?.amount ?? fromHeader?.amount ?? null;
  if (amount === null) return { state: "unreadable", route };
  const tableUsd = ROUTES[route].priceUsd;
  const table = parseQty("usd", tableUsd);
  return {
    state: "payment_required",
    route,
    amountUsd: toDec(amount),
    tableUsd,
    priceChanged: table === null || cmpQty(amount, table) !== 0,
    network: PINNED_PAYMENT.network,
    settlementAsset: "USDC on Base",
  };
}
