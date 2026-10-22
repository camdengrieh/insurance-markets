// pm_get_quote as a pure function over injected adapters (docs/aggregation-design.md 9.1, 8.3).
//
// Normalised depth walk for (venue, market, outcome, side, size): VWAP, order-level fee, net cost,
// the `derived` flag, staleness flags and a `quote_id` hash. Read-only: nothing here places or
// prepares an order, and a quote is never a promise of a fill.
//
// Fail closed: an unknown venue, a missing or mismatched book, an unusable fee model or a stale
// book never produce a number that looks executable. They produce `executable: false` plus a
// flag, or an error when no honest number exists. Market text only leaves through the fixed
// untrusted slots of src/guardrails/untrusted.ts.
//
// This module also holds the small helpers the other pm/ops modules share (context, guarded
// adapter calls, registry checks, untrusted slots).

import * as z from "zod/v4";
import {
  UNTRUSTED_DATA_NOTICE,
  sanitizeField,
  type UntrustedContent,
} from "../../src/guardrails/untrusted.js";
import { checkFeeSpec } from "../../sdk/engine/fees.js";
import { feeSpecId } from "../../sdk/engine/fee-specs.js";
import { quoteBook } from "../../sdk/engine/walk.js";
import {
  ZERO,
  cmp,
  div,
  ratFromDec,
  ratToDec,
  sub,
  ratToDecExact,
  type Rational,
  type SDec,
} from "../core/rational.js";
import { parseBook } from "../../sdk/engine/books.js";
import { canonicalSha256 } from "../links/canonical.js";
import { dataPolicy, getPlatform } from "../registry/registry.js";
import { readSection } from "../registry/staleness.js";
import type { PlatformRecord } from "../registry/types.js";
import {
  VENUE_IDS,
  type Book,
  type FeeSpec,
  type Market,
  type OutcomeRef,
  type Result,
  type Status,
  type Tick,
  type TokenRef,
  type VenueId,
  type VenueReadAdapter,
} from "../types.js";

// ---------------------------------------------------------------------------------------------
// Shared context and helpers (also used by verify.ts, compare.ts and lookup.ts)

export type AdapterLookup = (venue: VenueId) => VenueReadAdapter | undefined;
export type PlatformLookup = (venue: string) => PlatformRecord | undefined;

export interface OpsContext {
  // Injected clock: tests and callers control it. Never read from Date.now() in here.
  readonly nowMs: number;
  // Returns undefined when the venue's adapter is off (restricted-terms venues are off by default).
  readonly adapter: AdapterLookup;
  // Defaults to the bundled registry.
  readonly platform?: PlatformLookup;
  // Budget for one adapter call, ms. Default 15 000.
  readonly timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
// Quote validity and maximum book age (aggregation-design 8.3: 60 s, a D default).
export const QUOTE_VALID_MS = 60_000;
// Clock skew tolerated between the fetch time recorded by the adapter and our clock.
export const FUTURE_SKEW_MS = 5_000;
export const MAX_FILLS_SHOWN = 50;

export type OpsErrorCode =
  | "BAD_INPUT"
  | "VENUE_UNAVAILABLE"
  | "MARKET_UNAVAILABLE"
  | "OUTCOME_NOT_FOUND"
  | "BOOK_UNAVAILABLE"
  | "BOOK_MISMATCH"
  | "DATASET_UNAVAILABLE"
  | "LINK_NOT_FOUND";

export interface OpsFailure {
  readonly ok: false;
  readonly error: OpsErrorCode;
  // Fixed text or field names. Never third-party text.
  readonly detail: string;
}

export function failure(error: OpsErrorCode, detail: string): OpsFailure {
  return { ok: false, error, detail };
}

export type GuardedFailure = "TIMEOUT" | "ADAPTER_THREW";

// Runs one adapter call with a deadline. A throw or a timeout becomes a value; the error message
// is dropped on purpose because it can carry text from the venue.
export async function guarded<T>(
  call: () => Promise<T>,
  timeoutMs: number,
): Promise<Result<T, GuardedFailure>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const first = await Promise.race([call(), deadline]);
    if (first === "timeout") return { ok: false, error: "TIMEOUT", detail: `no answer within ${timeoutMs} ms` };
    return { ok: true, value: first };
  } catch (error) {
    const name = error instanceof Error ? error.name.slice(0, 40) : "non-error";
    return { ok: false, error: "ADAPTER_THREW", detail: name };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function timeoutOf(ctx: OpsContext): number {
  return ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

export function platformOf(ctx: OpsContext, venue: string): PlatformRecord | undefined {
  return (ctx.platform ?? getPlatform)(venue);
}

export function untrustedSlot(venue: string, field: "title" | "outcome", text: string): UntrustedContent {
  return sanitizeField(field, text, `pm-${venue}`);
}

export interface DataTerms {
  // Memory only: never written to disk, never exported. Unknown terms count as restricted.
  readonly memoryOnly: boolean;
  readonly clause: string;
  readonly reason: "restricted" | "unknown_terms" | "stale_terms" | "none_found" | "venue_not_in_registry";
}

export function dataTermsOf(ctx: OpsContext, venue: string): DataTerms {
  const rec = platformOf(ctx, venue);
  if (rec === undefined) {
    return {
      memoryOnly: true,
      clause: "This venue is not in the registry, so its data terms are unknown. Treat its data as memory-only.",
      reason: "venue_not_in_registry",
    };
  }
  const policy = dataPolicy(rec, ctx.nowMs);
  return { memoryOnly: policy.memoryOnly, clause: policy.clause, reason: policy.reason };
}

export interface FeeRegistryCheck {
  // Flags to show next to the quote; empty when the registry fully backs the fee model.
  readonly flags: readonly string[];
  // The spec's id equals the model the registry recorded for this venue. null = venue unknown.
  readonly modelMatches: boolean | null;
  readonly registryStatus: string | null;
  // The registry section is fresh, first-hand and "verified" (the bar for labelling anything).
  readonly gateOk: boolean;
}

export function feeRegistryCheck(ctx: OpsContext, venue: string, spec: FeeSpec): FeeRegistryCheck {
  const rec = platformOf(ctx, venue);
  if (rec === undefined) {
    return { flags: ["venue_not_in_registry"], modelMatches: null, registryStatus: null, gateOk: false };
  }
  const flags: string[] = [];
  const modelMatches = feeSpecId(spec) === rec.fees.value.feeSpecId;
  if (!modelMatches) flags.push("fee_model_registry_mismatch");
  const read = readSection(rec.fees, "gate", ctx.nowMs);
  if (!read.usable) flags.push("fee_registry_not_gate_usable");
  const status = rec.fees.value.status;
  if (status !== "verified") flags.push(`fee_registry_status_${status}`);
  return { flags, modelMatches, registryStatus: status, gateOk: modelMatches && read.usable && status === "verified" };
}

// Hex ids are lower-cased, matching the link registry's market id rule.
export function normaliseMarketId(id: string): string {
  return id.replace(/0x[0-9a-fA-F]+/g, (m) => m.toLowerCase());
}

export function showRat(value: Rational, places = 12): SDec {
  return ratToDecExact(value) ?? ratToDec(value, places, "half_up");
}

export function isoSecond(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(".000Z", "Z");
}

// Validates a Tick: one positive step in (0, 1], or ordered ranges with positive steps.
export function tickProblem(tick: Tick): string | null {
  const positiveStep = (text: string): Rational | null => {
    const r = ratFromDec(text);
    if (!r.ok || cmp(r.value, ZERO) <= 0 || cmp(r.value, { n: 1n, d: 1n }) > 0) return null;
    return r.value;
  };
  if (typeof tick === "string") return positiveStep(tick) === null ? "tick_invalid" : null;
  if (tick.length === 0) return "tick_missing";
  let previousTo: Rational | null = null;
  for (const range of tick) {
    const from = ratFromDec(range.from);
    const to = ratFromDec(range.to);
    if (!from.ok || !to.ok || positiveStep(range.tick) === null) return "tick_invalid";
    if (cmp(from.value, to.value) >= 0) return "tick_invalid";
    if (previousTo !== null && cmp(from.value, previousTo) < 0) return "tick_invalid";
    previousTo = to.value;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Book fetch shared with compare.ts

export type BookFetch =
  | { readonly ok: true; readonly book: Book; readonly outcome: OutcomeRef }
  | OpsFailure;

export async function fetchOutcomeBook(
  ctx: OpsContext,
  adapter: VenueReadAdapter,
  market: Market,
  outcomeIndex: number,
): Promise<BookFetch> {
  const outcome = market.outcomes.find((o) => o.index === outcomeIndex);
  if (outcome === undefined) return failure("OUTCOME_NOT_FOUND", "the market has no outcome with that index");
  return fetchBookForOutcome(ctx, adapter, market, outcome);
}

export async function fetchBookForOutcome(
  ctx: OpsContext,
  adapter: VenueReadAdapter,
  market: Market,
  outcome: OutcomeRef,
): Promise<BookFetch> {
  if (!adapter.caps.getBook) return failure("BOOK_UNAVAILABLE", "NOT_SUPPORTED: the adapter has no book read");
  const token: TokenRef = { venue: market.ref.venue, tokenId: outcome.tokenId };
  const timeoutMs = timeoutOf(ctx);
  const fetched = await guarded(() => adapter.getBooks([token], { deadlineMs: ctx.nowMs + timeoutMs }), timeoutMs);
  if (!fetched.ok) return failure("BOOK_UNAVAILABLE", `${fetched.error}: ${fetched.detail ?? ""}`.trim());
  const first = fetched.value[0];
  if (fetched.value.length !== 1 || first === undefined) {
    return failure("BOOK_UNAVAILABLE", "the adapter returned the wrong number of books");
  }
  if (!first.ok) return failure("BOOK_UNAVAILABLE", first.error);
  const book = first.value;
  if (book.token.venue !== token.venue || book.token.tokenId !== token.tokenId) {
    return failure("BOOK_MISMATCH", "the returned book is for a different token");
  }
  return { ok: true, book, outcome };
}

export function bookSha256(book: Book): string {
  return canonicalSha256({ bids: book.bids, asks: book.asks });
}

// ---------------------------------------------------------------------------------------------
// Input

export const sizeText = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/, "size must be a plain decimal with at most 6 places")
  .refine((v) => /[1-9]/.test(v), "size must be positive");

export const marketIdText = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:\-]*$/, "market id has unsupported characters");

export const quoteInputSchema = z.strictObject({
  venue: z.enum(VENUE_IDS),
  market_id: marketIdText,
  // An outcome index, or "yes" / "no" (matched on the outcome role, never on title text).
  outcome: z.union([z.int().min(0).max(31), z.enum(["yes", "no"])]),
  side: z.enum(["buy", "sell"]),
  size: sizeText,
  // May only tighten the default book age limit.
  max_age_ms: z.int().min(1_000).max(QUOTE_VALID_MS).optional(),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

// ---------------------------------------------------------------------------------------------
// Output

export interface QuoteFill {
  readonly price: SDec;
  readonly size: SDec;
}

export interface QuoteResult {
  readonly quoteId: string;
  readonly venue: VenueId;
  readonly marketId: string;
  readonly market: {
    readonly title: UntrustedContent;
    readonly status: Status;
    readonly tradable: { readonly ok: boolean; readonly reasons: readonly string[] };
    readonly closesAt: string | null;
    readonly tick: Tick;
    readonly minSize: string | null;
    readonly tickProblem: string | null;
  };
  readonly outcome: { readonly index: number; readonly role: OutcomeRef["role"]; readonly label: UntrustedContent; readonly tokenId: string };
  readonly side: "buy" | "sell";
  readonly requestedSize: string;
  readonly filledSize: string;
  readonly complete: boolean;
  readonly topOfBook: { readonly bid: string | null; readonly ask: string | null };
  readonly bestPrice: string | null;
  // Volume-weighted average over the filled depth, rounded against the trader.
  readonly vwap: string | null;
  readonly notional: SDec;
  readonly fee: {
    readonly specId: string;
    readonly modelId: FeeSpec["modelId"];
    readonly role: "taker";
    // Order-level fee with the venue's rounding. null = unknown (never zero).
    readonly amount: SDec | null;
    readonly usable: boolean;
    readonly error: { readonly code: string; readonly detail: string } | null;
    readonly verifiedAt: string;
    readonly ttlSec: number;
    readonly registry: { readonly status: string | null; readonly modelMatches: boolean | null; readonly gateOk: boolean };
  };
  // Buy: notional + fee. Sell: notional - fee. null when the fee is unknown.
  readonly netCost: SDec | null;
  // netCost / filled size, rounded against the trader. null when not computable.
  readonly effectivePrice: string | null;
  readonly derived: Book["derived"];
  // Real resting orders, full size available, usable and registry-backed fee model, tradable
  // market and a fresh book. Describes the data, not a trade: nothing here can place an order.
  readonly executable: boolean;
  readonly fills: readonly QuoteFill[];
  readonly staleness: {
    readonly bookAgeMs: number | null;
    readonly venueAgeMs: number | null;
    readonly maxAgeMs: number;
    readonly stale: boolean;
  };
  readonly flags: readonly string[];
  readonly asOfMs: number;
  readonly validForMs: number;
  readonly validUntilMs: number;
  readonly bookSha256: string;
  readonly dataTerms: DataTerms;
  readonly untrustedNotice: string;
  readonly notes: readonly string[];
}

export type QuoteOutcome = { readonly ok: true; readonly value: QuoteResult } | OpsFailure;

function selectOutcome(market: Market, wanted: QuoteInput["outcome"]): OutcomeRef | OpsFailure {
  const matches =
    typeof wanted === "number"
      ? market.outcomes.filter((o) => o.index === wanted)
      : market.outcomes.filter((o) => o.role === wanted);
  const only = matches[0];
  if (matches.length !== 1 || only === undefined) {
    return failure("OUTCOME_NOT_FOUND", matches.length > 1 ? "the outcome selector is ambiguous" : "no outcome matches the selector");
  }
  return only;
}

function effective(netCost: SDec | null, filled: Rational, side: "buy" | "sell"): string | null {
  if (netCost === null || cmp(filled, ZERO) <= 0) return null;
  const cost = ratFromDec(netCost);
  if (!cost.ok) return null;
  return ratToDec(div(cost.value, filled), 9, side === "buy" ? "ceil" : "floor");
}

// True when `price` sits on the market's tick grid. A single step is a grid from 0; ranges use the
// range that contains the price (bounds inclusive), and a price outside every range has no grid.
// Fails closed: an unreadable tick spec or price is off-grid.
export function offTick(price: Rational, tick: Tick): boolean {
  const onGrid = (p: Rational, stepText: string, origin: Rational): boolean => {
    const step = ratFromDec(stepText);
    if (!step.ok || cmp(step.value, ZERO) <= 0) return false;
    const q = div(sub(p, origin), step.value);
    return q.d === 1n;
  };
  if (typeof tick === "string") return !onGrid(price, tick, ZERO);
  for (const range of tick) {
    const from = ratFromDec(range.from);
    const to = ratFromDec(range.to);
    if (!from.ok || !to.ok) return true;
    if (cmp(price, from.value) >= 0 && cmp(price, to.value) <= 0) return !onGrid(price, range.tick, from.value);
  }
  return true;
}

export async function getQuote(rawInput: unknown, ctx: OpsContext): Promise<QuoteOutcome> {
  const parsed = quoteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("BAD_INPUT", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  const input = parsed.data;
  const adapter = ctx.adapter(input.venue);
  if (adapter === undefined) {
    return failure("VENUE_UNAVAILABLE", "no adapter is enabled for this venue");
  }
  const marketId = normaliseMarketId(input.market_id);
  const timeoutMs = timeoutOf(ctx);
  const got = await guarded(() => adapter.getMarket({ venue: input.venue, marketId, native: {} }), timeoutMs);
  if (!got.ok) return failure("MARKET_UNAVAILABLE", `${got.error}: ${got.detail ?? ""}`.trim());
  const market = got.value;
  if (market.ref.venue !== input.venue) return failure("MARKET_UNAVAILABLE", "the adapter returned a market from another venue");

  const chosen = selectOutcome(market, input.outcome);
  if ("ok" in chosen) return chosen;
  const fetched = await fetchBookForOutcome(ctx, adapter, market, chosen);
  if (!fetched.ok) return fetched;
  const book = fetched.book;

  const spec = market.fee;
  const detail = quoteBook(book, input.side, input.size, spec, ctx.nowMs);
  if (!detail.ok) return failure("BOOK_UNAVAILABLE", detail.reason);
  const walk = detail.value;
  const parsedBook = parseBook(book);
  if (!parsedBook.ok) return failure("BOOK_UNAVAILABLE", parsedBook.detail ?? parsedBook.error);
  // Adapters normalise books, but a crossed or locked ladder is a corrupt or mid-update state
  // whatever produced it: no price is derived from it.
  const bestBid = parsedBook.value.bids[0];
  const bestAsk = parsedBook.value.asks[0];
  if (bestBid !== undefined && bestAsk !== undefined && cmp(bestBid.price, bestAsk.price) >= 0) {
    return failure("BOOK_UNAVAILABLE", "crossed or locked book");
  }

  const flags: string[] = [];
  // Staleness: fetch time from the adapter, and the venue's own timestamp where it has one.
  const maxAgeMs = input.max_age_ms ?? QUOTE_VALID_MS;
  const bookAge = Number.isFinite(book.asOfMs) ? ctx.nowMs - book.asOfMs : null;
  const venueAge = book.venueTsMs !== undefined && Number.isFinite(book.venueTsMs) ? ctx.nowMs - book.venueTsMs : null;
  let stale = false;
  if (bookAge === null) {
    stale = true;
    flags.push("book_time_unknown");
  } else if (bookAge < -FUTURE_SKEW_MS) {
    stale = true;
    flags.push("book_from_future");
  } else if (bookAge > maxAgeMs) {
    stale = true;
    flags.push("book_stale");
  }
  if (book.venueTsMs === undefined) flags.push("no_venue_timestamp");
  else if (venueAge === null) {
    stale = true;
    flags.push("venue_time_invalid");
  } else if (venueAge < -FUTURE_SKEW_MS) {
    stale = true;
    flags.push("venue_time_from_future");
  } else if (venueAge > maxAgeMs) {
    stale = true;
    flags.push("venue_book_stale");
  }

  const statusOk = market.status === "active";
  if (!statusOk) flags.push(`market_status_${market.status}`);
  if (!market.tradable.ok) flags.push("market_not_tradable");
  if (!walk.complete) flags.push(walk.walk.fills.length === 0 ? "empty_side" : "partial_fill");
  if (book.derived === "complement") flags.push("derived_book_not_executable");

  const feeUsable = checkFeeSpec(spec, ctx.nowMs).ok;
  const registry = feeRegistryCheck(ctx, input.venue, spec);
  if (walk.feeError !== null) flags.push(`fee_${walk.feeError.code.toLowerCase()}`);
  flags.push(...registry.flags);

  const problem = tickProblem(market.tick);
  if (problem !== null) flags.push(problem);

  // Orders the venue would reject or that make no sense are shown, but never as executable.
  let orderProblem = false;
  if (market.minSize !== undefined) {
    const min = ratFromDec(market.minSize);
    const asked = ratFromDec(input.size);
    if (!min.ok || !asked.ok || cmp(asked.value, min.value) < 0) {
      flags.push("below_min_size");
      orderProblem = true;
    }
  }
  if (problem === null && walk.walk.fills.some((f) => offTick(f.price, market.tick))) {
    flags.push("price_off_tick");
    orderProblem = true;
  }
  if (cmp(walk.walk.filled, ZERO) > 0 && walk.netCost !== null) {
    const cost = ratFromDec(walk.netCost);
    const perShare = cost.ok ? div(cost.value, walk.walk.filled) : null;
    // A binary share pays at most 1 and a sale of one yields less than 1: outside (0, 1) after
    // fees (including a venue's minimum fee on a tiny order) the number is not a price.
    if (perShare === null || cmp(perShare, ZERO) <= 0 || cmp(perShare, { n: 1n, d: 1n }) >= 0) {
      flags.push("effective_price_out_of_range");
      orderProblem = true;
    }
  }

  const terms = dataTermsOf(ctx, input.venue);
  if (terms.memoryOnly) flags.push("memory_only_data");

  const executable =
    walk.executable &&
    feeUsable &&
    registry.gateOk &&
    statusOk &&
    market.tradable.ok &&
    !stale &&
    problem === null &&
    !orderProblem;

  const fills: QuoteFill[] = walk.walk.fills.slice(0, MAX_FILLS_SHOWN).map((f) => ({ price: showRat(f.price), size: showRat(f.qty) }));
  const topBid = parsedBook.value.bids[0]?.price;
  const topAsk = parsedBook.value.asks[0]?.price;
  const asOfMs = book.asOfMs;
  const validUntilMs = asOfMs + QUOTE_VALID_MS;
  const filledText = walk.quote.filledSize;
  // Nothing filled means there is no cost to report: null, never a zero that reads as "free".
  const filledAny = cmp(walk.walk.filled, ZERO) > 0;
  const feeAmount = filledAny ? walk.fee : null;
  const netCost = filledAny ? walk.netCost : null;

  const idFields = {
    v: 1,
    venue: input.venue,
    marketId: market.ref.marketId,
    tokenId: chosen.tokenId,
    side: input.side,
    requested: walk.quote.requestedSize,
    filled: filledText,
    vwap: walk.quote.vwap,
    fee: feeAmount,
    netCost,
    feeSpecId: walk.quote.feeSpecId,
    derived: book.derived,
    asOfMs,
    bookSha256: bookSha256(book),
  };
  const quoteId = `q_${canonicalSha256(idFields).slice(0, 32)}`;

  const notes = [
    "Read-only reference. A quote is not an offer and no tool in this plugin places an order from it.",
    "The price is a depth walk for the stated size at fetch time; the book can change before any action.",
  ];
  if (terms.memoryOnly) notes.push("This venue's data is restricted or of unknown terms: keep it in memory, do not store, export or republish it.");

  const value: QuoteResult = {
    quoteId,
    venue: input.venue,
    marketId: market.ref.marketId,
    market: {
      title: untrustedSlot(input.venue, "title", market.title.value),
      status: market.status,
      tradable: { ok: market.tradable.ok, reasons: market.tradable.reasons.map((r) => r.slice(0, 80)) },
      closesAt: market.timesUtc.closesAt ?? null,
      tick: market.tick,
      minSize: market.minSize ?? null,
      tickProblem: problem,
    },
    outcome: {
      index: chosen.index,
      role: chosen.role,
      label: untrustedSlot(input.venue, "outcome", chosen.label.value),
      tokenId: chosen.tokenId,
    },
    side: input.side,
    requestedSize: walk.quote.requestedSize,
    filledSize: filledText,
    complete: walk.complete,
    topOfBook: {
      bid: topBid === undefined ? null : showRat(topBid),
      ask: topAsk === undefined ? null : showRat(topAsk),
    },
    bestPrice: walk.quote.bestPrice,
    vwap: walk.quote.vwap,
    notional: walk.notional,
    fee: {
      specId: walk.quote.feeSpecId,
      modelId: spec.modelId,
      role: "taker",
      amount: feeAmount,
      usable: feeUsable && walk.feeError === null,
      error: walk.feeError === null ? null : { code: walk.feeError.code, detail: walk.feeError.detail },
      verifiedAt: spec.verifiedAt,
      ttlSec: spec.ttlSec,
      registry: { status: registry.registryStatus, modelMatches: registry.modelMatches, gateOk: registry.gateOk },
    },
    netCost,
    effectivePrice: effective(netCost, walk.walk.filled, input.side),
    derived: book.derived,
    executable,
    fills,
    staleness: { bookAgeMs: bookAge, venueAgeMs: venueAge, maxAgeMs, stale },
    flags: [...new Set(flags)],
    asOfMs,
    validForMs: QUOTE_VALID_MS,
    validUntilMs,
    bookSha256: idFields.bookSha256,
    dataTerms: terms,
    untrustedNotice: UNTRUSTED_DATA_NOTICE,
    notes,
  };
  return { ok: true, value };
}
