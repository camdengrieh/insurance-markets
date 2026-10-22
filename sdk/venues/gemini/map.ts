import { rulesFingerprintOfFields } from "../../rules.js";
import { sha256, toBytes } from "viem";

import { parseIsoMs } from "../../format.js";
import { cmpQty, parseQty, toDec } from "../../money/qty.js";
import type { Collateral, Dec, FeeSpec, Market, MarketGroup, MarketRef, MarketSummary, Outcome, OutcomeSummary, Rules, Status, VolumeUnit } from "../../model.js";
import { safeHttpsUrl, untrustedField } from "../../text.js";
import { makeProv } from "../policy.js";
import { openUnitPrice } from "../novig/shared.js";
import {
  GEMINI_ADAPTER_VERSION,
  GEMINI_API_BASE,
  GEMINI_FEE_SCHEDULE_FROM,
  GEMINI_FEE_TTL_SEC,
  GEMINI_FEE_VERIFIED_AT,
  GEMINI_LIST_TTL_MS,
  GEMINI_MAKER_COEFFICIENT,
  GEMINI_TAKER_COEFFICIENT,
} from "./constants.js";
import { contractSchema, eventSchema, SCHEMA_DESCRIPTOR, type GeminiContract, type GeminiEventShell } from "./schemas.js";

export const GEMINI_SCHEMA_HASH = sha256(toBytes(SCHEMA_DESCRIPTOR)).slice(2);

export const COLLATERAL: Collateral = Object.freeze({ symbol: "USD", chain: "offchain", decimals: 2, custody: "venue" });

// ---- parsing ---------------------------------------------------------------------------------------------------------

export interface GeminiEvent {
  readonly shell: GeminiEventShell;
  readonly contracts: readonly GeminiContract[];
  // Spreads, totals and props nested under a sports game. Counted, not read.
  readonly childEvents: number;
}

export type ParseResult = { readonly ok: true; readonly event: GeminiEvent } | { readonly ok: false; readonly reason: "event_shape" | "contract_shape" | "combo" | "duplicate_contract" };

export function parseEvent(raw: unknown): ParseResult {
  const shell = eventSchema.safeParse(raw);
  if (!shell.success) return { ok: false, reason: "event_shape" };
  const contracts: GeminiContract[] = [];
  const seen = new Set<string>();
  for (const item of shell.data.contracts) {
    const parsed = contractSchema.safeParse(item);
    // One bad contract drops the whole event: a categorical event missing an outcome would read as complete.
    if (!parsed.success) return { ok: false, reason: "contract_shape" };
    if (parsed.data.isCombo === true) return { ok: false, reason: "combo" };
    const key = parsed.data.instrumentSymbol.toLowerCase();
    if (seen.has(key)) return { ok: false, reason: "duplicate_contract" };
    seen.add(key);
    contracts.push(parsed.data);
  }
  return { ok: true, event: { shell: shell.data, contracts, childEvents: shell.data.events?.length ?? 0 } };
}

// ---- rich text ---------------------------------------------------------------------------------------------------------

const MAX_NODES = 2000;
const MAX_DEPTH = 12;
export const MAX_RULE_CHARS = 60_000;

// The contract description is a rich-text document: {nodeType, content[], value}. Only the `value` of text nodes is
// taken, in order; nothing here interprets a mark, a link or a node type as markup. Bounded in nodes, depth and size.
export function richTextOf(node: unknown): string {
  const pieces: string[] = [];
  let nodes = 0;
  let chars = 0;
  const walk = (value: unknown, depth: number, topLevel: boolean): void => {
    if (depth > MAX_DEPTH || nodes >= MAX_NODES || chars >= MAX_RULE_CHARS) return;
    if (typeof value !== "object" || value === null) return;
    nodes += 1;
    const record = value as { value?: unknown; content?: unknown };
    if (typeof record.value === "string") {
      const piece = record.value.slice(0, MAX_RULE_CHARS - chars);
      pieces.push(piece);
      chars += piece.length;
    }
    if (Array.isArray(record.content)) for (const child of record.content) walk(child, depth + 1, depth === 0 && topLevel);
  };
  walk(node, 0, true);
  return pieces.join("\n");
}

// What counts as unsafe, by code point (written as numbers: a literal control or direction character in a source
// file is itself a hazard). C0/C1 controls except tab and line feed, soft hyphen, Arabic letter mark, Mongolian vowel
// separator, zero-width and directional marks and overrides, line and paragraph separators, the invisible-operator
// block, BOM, interlinear annotation marks.
function isUnsafe(cp: number): boolean {
  return (
    (cp <= 0x1f && cp !== 0x09 && cp !== 0x0a) ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0xad ||
    cp === 0x61c ||
    cp === 0x180e ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff ||
    (cp >= 0xfff9 && cp <= 0xfffb)
  );
}

// The text a rules hash is taken over: NFKC, invisible and control characters out, every whitespace run one space.
// Taken before any display bound, so a change past the display cut still changes the hash.
export function normalizeForHash(text: string): string {
  let kept = "";
  for (const char of text.normalize("NFKC")) {
    if (!isUnsafe(char.codePointAt(0) ?? 0)) kept += char;
  }
  return kept.replace(/\s+/gu, " ").trim();
}

// The shared rules-v2 canonicalisation (sdk/rules.ts) over the full rules text.
export function rulesFingerprint(text: string): string {
  return rulesFingerprintOfFields([text]);
}

// ---- status ------------------------------------------------------------------------------------------------------------

export function statusOf(event: GeminiEvent): Status {
  switch (event.shell.status) {
    case "approved":
      return "pending";
    case "active": {
      // A listed event whose every contract reports a closed market is closed, whatever the event row says.
      const states = event.contracts.map((contract) => contract.marketState);
      return states.every((state) => state !== undefined) && !states.includes("open") ? "closed" : "active";
    }
    case "closed":
      return "closed";
    case "under_review":
      return "paused";
    case "settled":
      return event.contracts.some((contract) => contract.resolutionSide === "yes" || contract.resolutionSide === "no") ? "resolved" : "determined";
    case "invalid":
      return "voided";
    default:
      return "unknown";
  }
}

// What a port status asks the venue for. Statuses the venue cannot express return null: no request is sent for them.
export function apiStatusFor(status: Status): string | null {
  switch (status) {
    case "active":
      return "active";
    case "pending":
      return "approved";
    case "closed":
      return "closed";
    case "paused":
      return "under_review";
    case "resolved":
      return "settled";
    case "voided":
      return "invalid";
    default:
      return null;
  }
}

// ---- quotes and prices -------------------------------------------------------------------------------------------------

export interface GeminiQuote {
  readonly tokenId: string;
  readonly bid: Dec | null;
  readonly ask: Dec | null;
  readonly last: Dec | null;
  // best bid at or above best ask: neither is shown
  readonly crossed: boolean;
}

export function quoteOf(contract: GeminiContract): GeminiQuote {
  const prices = contract.prices;
  const bid = openUnitPrice(prices?.bestBid, 4);
  const ask = openUnitPrice(prices?.bestAsk, 4);
  const last = openUnitPrice(prices?.lastTradePrice, 4);
  const crossed = bid !== null && ask !== null && cmpQty(bid, ask) >= 0;
  return {
    tokenId: contract.instrumentSymbol,
    bid: crossed || bid === null ? null : toDec(bid),
    ask: crossed || ask === null ? null : toDec(ask),
    last: last === null ? null : toDec(last),
    crossed,
  };
}

// ---- outcomes ----------------------------------------------------------------------------------------------------------

// A contract is one proposition in YES space; its token is its instrument symbol. A binary event with one contract
// has a yes side; a categorical event's contracts are labelled choices (never matched on their text).
function roleFor(event: GeminiEvent): "yes" | "label" {
  return event.shell.type === "binary" && event.contracts.length === 1 ? "yes" : "label";
}

export function outcomesOf(event: GeminiEvent): readonly Outcome[] {
  const role = roleFor(event);
  return event.contracts.map((contract, index) => ({
    index,
    role,
    label: untrustedField("outcome", contract.label, "gemini"),
    tokenId: contract.instrumentSymbol,
  }));
}

export function outcomeSummariesOf(event: GeminiEvent): readonly OutcomeSummary[] {
  return outcomesOf(event).map((outcome, index) => ({ ...outcome, displayPrice: quoteOf(event.contracts[index] as GeminiContract).last }));
}

export function refOf(event: GeminiEvent): MarketRef {
  return { venue: "gemini", marketId: event.shell.ticker, native: { eventId: event.shell.id.slice(0, 64), ticker: event.shell.ticker } };
}

// ---- volume and time ---------------------------------------------------------------------------------------------------

// The unit of Gemini's volume fields is not stated by the API (probably USD notional), so it is reported as unknown
// and never assumed.
export function volumeOf(event: GeminiEvent): { readonly amount: Dec | null; readonly unit: VolumeUnit; readonly windowHours: number | null } {
  const text = event.shell.volume24h;
  const qty = text === undefined ? null : parseQty("usd", text, { maxScale: 8 });
  return qty === null ? { amount: null, unit: "unknown", windowHours: null } : { amount: toDec(qty), unit: "unknown", windowHours: 24 };
}

export function isoOrNull(text: string | undefined): string | null {
  const ms = parseIsoMs(text);
  if (ms === null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---- fee ---------------------------------------------------------------------------------------------------------------

// Taker 0.07 x C x P x (1 - P) and maker 0.0175 x C x P x (1 - P), rounded up to the next cent, for contracts listed
// on or after 2026-03-18 (gemini.com/fees/predictions, read 2026-10-19 and 2026-10-22: "Fees are rounded up to the
// next cent"; engine grammar "ceil:2"). The page does not say whether a fill or an order is rounded; the engine rounds
// the order once, so an order the venue splits into several fills can cost up to a cent per extra fill more. This is a documentation fact, not an API
// field, so it carries its read date and expires; a contract listed earlier, or an unreadable listing date, reads as
// unknown. The maker fee is currently waived by a promotion that is not in the API (see GEMINI_VERIFICATION).
export function feeSpecOf(event: GeminiEvent, nowMs: number): FeeSpec {
  const unknown: FeeSpec = {
    venue: "gemini",
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${GEMINI_API_BASE}/events`, field: "documented fee schedule (not an API field)", granularity: "category" },
    verifiedAt: GEMINI_FEE_VERIFIED_AT,
    ttlSec: 0,
  };
  const verifiedMs = parseIsoMs(GEMINI_FEE_VERIFIED_AT) as number;
  if (nowMs > verifiedMs + GEMINI_FEE_TTL_SEC * 1000) return unknown;
  const fromMs = parseIsoMs(GEMINI_FEE_SCHEDULE_FROM) as number;
  for (const contract of event.contracts) {
    const listed = parseIsoMs(contract.createdAt ?? event.shell.createdAt);
    if (listed === null || listed < fromMs) return unknown;
  }
  return {
    venue: "gemini",
    modelId: "curve_pq",
    taker: { rate: GEMINI_TAKER_COEFFICIENT },
    maker: { rate: GEMINI_MAKER_COEFFICIENT },
    rounding: "ceil:2",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: `${GEMINI_API_BASE}/events`, field: "documented fee schedule (not an API field)", granularity: "category" },
    verifiedAt: GEMINI_FEE_VERIFIED_AT,
    ttlSec: GEMINI_FEE_TTL_SEC,
  };
}

// ---- rules -------------------------------------------------------------------------------------------------------------

export function rulesTextOf(event: GeminiEvent): string {
  const parts: string[] = [];
  if (event.shell.description !== undefined && event.shell.description.trim() !== "") parts.push(event.shell.description.trim());
  for (const contract of event.contracts) {
    const body = richTextOf(contract.description).trim();
    if (body !== "") parts.push(`${contract.label}: ${body}`);
  }
  return parts.join("\n\n").slice(0, MAX_RULE_CHARS);
}

export function rulesOf(event: GeminiEvent): Rules {
  const full = rulesTextOf(event);
  const sources: string[] = [];
  for (const candidate of [event.shell.termsLink, ...event.contracts.map((contract) => contract.termsAndConditionsUrl)]) {
    const safe = safeHttpsUrl(candidate);
    if (safe !== null && !sources.includes(safe) && sources.length < 10) sources.push(safe);
  }
  const cutoff = isoOrNull(event.shell.expiryDate);
  return {
    text: untrustedField("rules", full, "gemini"),
    sha256: rulesFingerprint(full),
    sources,
    // The exchange determines the outcome under its own contract terms; there is no oracle or dispute bond.
    mechanism: "exchange",
    // Tie and cancellation handling is per contract class (50/50 on a draw in some), in the terms document.
    void: "unknown",
    ...(cutoff === null ? {} : { cutoffUtc: cutoff }),
  };
}

// ---- tick --------------------------------------------------------------------------------------------------------------

// The docs say not to assume a fixed grid: the increment comes from the contract. When contracts disagree the
// coarsest increment is used, so a price on it is on every grid. No readable increment reads "0" (no known grid).
export function tickOf(event: GeminiEvent): Dec {
  let best: ReturnType<typeof openUnitPrice> = null;
  for (const contract of event.contracts) {
    const tick = openUnitPrice(contract.priceIncrement, 6);
    if (tick === null) continue;
    if (best === null || cmpQty(tick, best) > 0) best = tick;
  }
  return best === null ? "0" : toDec(best);
}

export function minSizeOf(event: GeminiEvent): Dec | undefined {
  let best: ReturnType<typeof parseQty> = null;
  for (const contract of event.contracts) {
    const size = parseQty("shares", contract.quantityMinimum, { maxScale: 6 });
    if (size === null || size.atomic <= 0n) continue;
    if (best === null || cmpQty(size, best) > 0) best = size;
  }
  return best === null ? undefined : toDec(best);
}

// ---- group -------------------------------------------------------------------------------------------------------------

// A categorical event is a mutually exclusive set only for the templates known to be (a sports game, a politics
// race with no template). A price ladder ("X or above") is not exclusive. Anything else is an event, exhaustiveness
// unknown.
function groupOf(event: GeminiEvent): MarketGroup | undefined {
  if (event.shell.type !== "categorical") return undefined;
  const exclusive = event.shell.template === undefined || event.shell.template === "sports-game";
  return { key: event.shell.ticker, kind: exclusive ? "mutually_exclusive" : "event", exhaustive: "unknown" };
}

// ---- summary and market -----------------------------------------------------------------------------------------------

export function summaryOf(event: GeminiEvent, nowMs: number, transport: "T0" | "T1"): MarketSummary {
  return {
    ref: refOf(event),
    title: untrustedField("title", event.shell.title, "gemini"),
    status: statusOf(event),
    closesAtUtc: isoOrNull(event.shell.expiryDate),
    outcomes: outcomeSummariesOf(event),
    volume: volumeOf(event),
    prov: makeProv({ venue: "gemini", source: `${GEMINI_API_BASE}/events`, fetchedAtMs: nowMs, nowMs, ttlMs: GEMINI_LIST_TTL_MS, transport }),
  };
}

export function marketOf(event: GeminiEvent, nowMs: number): Market {
  const rules = rulesOf(event);
  const reasons = ["read_only_adapter", "reference_prices_only", "order_books_not_available"];
  if (rules.sha256 === "") reasons.push("rules_text_missing");
  const closes = isoOrNull(event.shell.expiryDate);
  const group = groupOf(event);
  const minSize = minSizeOf(event);
  return {
    ref: refOf(event),
    title: untrustedField("title", event.shell.title, "gemini"),
    outcomes: outcomesOf(event),
    rules,
    status: statusOf(event),
    tradable: { ok: false, reasons },
    timesUtc: closes === null ? {} : { closesAt: closes },
    tick: tickOf(event),
    ...(minSize === undefined ? {} : { minSize }),
    collateral: COLLATERAL,
    ...(group === undefined ? {} : { group }),
    fee: feeSpecOf(event, nowMs),
    prov: { fetchedAtMs: nowMs, source: `${GEMINI_API_BASE}/events/${event.shell.ticker}`, adapterVersion: GEMINI_ADAPTER_VERSION, schemaHash: GEMINI_SCHEMA_HASH },
  };
}

// The contract that settled to yes, if any: the winner of a resolved event.
export function winnerOf(event: GeminiEvent): { readonly tokenId: string; readonly outcomeIndex: number; readonly resolvedAt: string | null } | null {
  const index = event.contracts.findIndex((contract) => contract.resolutionSide === "yes");
  const contract = event.contracts[index];
  return contract === undefined ? null : { tokenId: contract.instrumentSymbol, outcomeIndex: index, resolvedAt: isoOrNull(contract.resolvedAt) };
}
