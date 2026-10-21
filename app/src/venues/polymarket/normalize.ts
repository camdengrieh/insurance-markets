import { sha256, toBytes } from "viem";

import type {
  FeeSpec,
  Market,
  MarketGroup,
  MarketRef,
  MarketSummary,
  Outcome,
  OutcomeSummary,
  Prov,
  Rules,
  Status,
  Transport,
  Untrusted,
} from "../../core/ports";
import {
  ADAPTER_VERSION,
  COLLATERAL,
  FEE_ROUNDING,
  FEE_TTL_SEC,
  RULES_MAX_RAW_CHARS,
  TTL_MS,
  VENUE,
  CLOB_ORIGIN,
  GAMMA_ORIGIN,
} from "./constants";
import { categorise, type CategoryVerdict } from "../../core/category";
import { rulesHashOf } from "../../core/rules-hash";
import { safeHttpsUrl, untrustedField } from "../../core/untrusted";
import { cmpDec, isOpenUnitInterval, numberToDec, numericToDec, parseDec, type Dec } from "./decimal";
import { selectTokenIds, type Ledger } from "./ids";
import { ADDRESS, type GammaEvent, type GammaMarket } from "./schemas";

// Gamma row -> the port's MarketSummary and Market. Rules the code enforces:
//   - every string a stranger can write goes through the shared sanitiser and sits in an Untrusted slot;
//   - outcomes are matched by index and token id, never by label text; the roles yes/no are assigned only to
//     the exact pair ["Yes","No"] in that order (48 of 100 sampled markets are not Yes/No);
//   - the outcomePrices on a row are a DISPLAY price (never an executable quote) and are null when absent;
//   - an unknown version, an unknown resolution status or a missing fee parameter fails closed.

const SANITIZE_SOURCE = "polymarket";

function titleOf(text: string): Untrusted<string> {
  return untrustedField("title", text, SANITIZE_SOURCE);
}

function labelOf(text: string): Untrusted<string> {
  return untrustedField("outcome", text, SANITIZE_SOURCE);
}

export function isoOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// ---- schema identity ----------------------------------------------------------------------------------------------

// What this adapter version parses from a Gamma market. Market.prov.schemaHash is the hash of this description, so
// a change to the parsed field set is visible in every record the adapter produced (the live drift suite is the
// check against what the venue actually sends).
const PARSED_FIELDS = [
  "id", "question", "conditionId", "slug", "outcomes", "outcomePrices", "clobTokenIds", "positionIds", "version",
  "active", "closed", "archived", "acceptingOrders", "enableOrderBook", "restricted", "startDate", "endDate",
  "updatedAt", "description", "resolutionSource", "resolvedBy", "volume", "orderPriceMinTickSize", "orderMinSize",
  "negRisk", "negRiskMarketID", "questionID", "umaResolutionStatus", "resolutionStatus", "umaBond", "umaReward",
  "feesEnabled", "feeSchedule", "events",
];
let schemaHashCache: string | undefined;
export function gammaSchemaHash(): string {
  schemaHashCache ??= sha256(toBytes(`polymarket.gamma.market/1:${PARSED_FIELDS.join(",")}`)).slice(2, 18);
  return schemaHashCache;
}

// ---- status -------------------------------------------------------------------------------------------------------

type Signal = "none" | "proposed" | "disputed" | "resolved" | "unknown";

function umaSignal(value: string | null | undefined): Signal {
  if (value === null || value === undefined || value === "") return "none";
  if (value === "proposed") return "proposed";
  if (value === "disputed") return "disputed";
  if (value === "resolved") return "resolved";
  return "unknown";
}

// v2 markets carry `resolutionStatus` (inactive|active|resolved). What "active" means in the process is not
// documented and no v2 market has been observed, so it fails closed.
function v2Signal(value: string | null | undefined): Signal {
  if (value === null || value === undefined || value === "") return "none";
  if (value === "inactive") return "none";
  if (value === "resolved") return "resolved";
  return "unknown";
}

export function resolutionSignal(raw: Pick<GammaMarket, "umaResolutionStatus" | "resolutionStatus">): Signal {
  const a = umaSignal(raw.umaResolutionStatus);
  const b = v2Signal(raw.resolutionStatus);
  if (a === b) return a;
  if (a === "none") return b;
  if (b === "none") return a;
  return "unknown";
}

// A market with `closed:false` and `acceptingOrders:true` can already have a proposed result (the Arsenal match,
// 0.9995 on the day), so the resolution signal wins over the open/closed flags.
export function statusOf(raw: GammaMarket, nowMs: number): Status {
  const signal = resolutionSignal(raw);
  if (signal === "resolved") return "resolved";
  if (signal === "disputed") return "disputed";
  if (signal === "proposed") return "determined";
  if (signal === "unknown") return "unknown";
  if (raw.closed === true || raw.archived === true) return "closed";
  if (raw.closed !== false || raw.active === null || raw.active === undefined) return "unknown";
  if (raw.active) return raw.acceptingOrders === false ? "paused" : "active";
  const start = raw.startDate === null || raw.startDate === undefined ? Number.NaN : Date.parse(raw.startDate);
  return Number.isNaN(start) ? "paused" : start > nowMs ? "pending" : "paused";
}

export function tradableOf(raw: GammaMarket, status: Status): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (status !== "active") reasons.push(`status_${status}`);
  if (raw.acceptingOrders === false) reasons.push("not_accepting_orders");
  else if (raw.acceptingOrders === null || raw.acceptingOrders === undefined) reasons.push("accepting_orders_unknown");
  if (raw.enableOrderBook === false) reasons.push("order_book_disabled");
  else if (raw.enableOrderBook === null || raw.enableOrderBook === undefined) reasons.push("order_book_unknown");
  return { ok: reasons.length === 0, reasons };
}

// ---- rules --------------------------------------------------------------------------------------------------------

const MARK_RUN = /(\p{M}{4})\p{M}+/gu;

// The port's rules hash: sha256 of the NFKC-normalised, whitespace-collapsed text, over the FULL text, not the
// capped display copy. Runs of combining marks are cut first because canonical reordering is quadratic in them.
export function rulesHash(raw: string): string {
  const text = raw.replace(MARK_RUN, "$1").normalize("NFKC").replace(/\s+/gu, " ").trim();
  return sha256(toBytes(text)).slice(2);
}

export function buildRules(raw: GammaMarket, event: GammaEvent | undefined): { ok: true; rules: Rules } | { ok: false; reason: string } {
  const text = raw.description ?? event?.description ?? "";
  if (text.length > RULES_MAX_RAW_CHARS) return { ok: false, reason: "rules text longer than the 262144-character limit" };
  const uma = [raw.umaBond, raw.umaReward, raw.umaResolutionStatus].some((value) => value !== null && value !== undefined);
  const source = safeHttpsUrl(raw.resolutionSource?.trim());
  const cutoff = isoOrNull(raw.endDate);
  const start = isoOrNull(raw.startDate);
  const resolver = typeof raw.resolvedBy === "string" && ADDRESS.test(raw.resolvedBy) ? raw.resolvedBy : undefined;
  const rules: Rules = {
    text: untrustedField("rules", text, SANITIZE_SOURCE),
    // The description, the resolution source and the end date, as the linking recipe says (finding A2): a changed
    // source or end date changes the hash even when the description does not.
    sha256: rulesHashOf([text, raw.resolutionSource, raw.endDate]),
    sources: source === null ? [] : [source],
    mechanism: uma ? "uma_oo" : "unknown",
    ...(resolver === undefined ? {} : { resolver }),
    ...(cutoff === null ? {} : { cutoffUtc: cutoff }),
    ...(start === null ? {} : { windowStartUtc: start }),
    // "Unknown/50-50": each token redeems 0.50 (note 08 2.10).
    void: "fifty_fifty",
  };
  return { ok: true, rules };
}

// ---- fees ---------------------------------------------------------------------------------------------------------

export interface FeeInput {
  readonly rate: unknown;
  readonly exponent: unknown;
  readonly takerOnly: boolean;
}

function feeSpecShell(url: string, field: string, nowMs: number): Pick<FeeSpec, "payer" | "paramsSource" | "verifiedAt"> {
  return {
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url, field, granularity: "market" },
    verifiedAt: new Date(nowMs).toISOString(),
  };
}

export function unknownFeeSpec(url: string, field: string, nowMs: number): FeeSpec {
  return { modelId: "unknown", ...feeSpecShell(url, field, nowMs), ttlSec: 0 };
}

// feesEnabled:false is a documented zero fee. With fees on, the parameters must be exactly the documented curve
// (exponent 1, taker only); anything else, or a missing field, is "unknown" so that no net-of-fee number is shown.
export function feeSpecFrom(
  input: { readonly enabled: boolean | null | undefined; readonly schedule: FeeInput | null | undefined },
  url: string,
  field: string,
  nowMs: number,
): FeeSpec {
  const shell = feeSpecShell(url, field, nowMs);
  const zero: FeeSpec = {
    modelId: "curve_pq",
    taker: { rate: "0", exponent: "1" },
    maker: { rate: "0" },
    rounding: FEE_ROUNDING,
    ...shell,
    ttlSec: FEE_TTL_SEC,
  };
  if (input.enabled === false) return zero;
  if (input.enabled !== true || input.schedule === null || input.schedule === undefined) return unknownFeeSpec(url, field, nowMs);
  const rate = numericToDec(input.schedule.rate);
  const exponent = numericToDec(input.schedule.exponent);
  if (rate === null || exponent === null || exponent !== "1" || !input.schedule.takerOnly) return unknownFeeSpec(url, field, nowMs);
  if (cmpDec(rate, "0") === -1 || cmpDec(rate, "1") === 1) return unknownFeeSpec(url, field, nowMs);
  return {
    modelId: "curve_pq",
    taker: { rate, exponent },
    maker: { rate: "0" },
    rounding: FEE_ROUNDING,
    ...shell,
    ttlSec: FEE_TTL_SEC,
  };
}

export function sameFeeParameters(a: FeeSpec, b: FeeSpec): boolean {
  return (
    a.modelId === b.modelId &&
    a.taker?.rate === b.taker?.rate &&
    a.taker?.exponent === b.taker?.exponent &&
    a.maker?.rate === b.maker?.rate
  );
}

// ---- markets ------------------------------------------------------------------------------------------------------

export interface NormalizeContext {
  readonly nowMs: number;
  readonly transport: Transport;
  readonly source: string;
  // The event a search or events route nested this market under.
  readonly event?: GammaEvent | undefined;
}

function roleFor(labels: readonly string[], index: number): "yes" | "no" | "label" {
  if (labels.length === 2 && labels[0] === "Yes" && labels[1] === "No") return index === 0 ? "yes" : "no";
  return "label";
}

function nativeOf(raw: GammaMarket, event: GammaEvent | undefined, ledger: Ledger): Record<string, string> {
  const native: Record<string, string> = { gammaId: raw.id, slug: raw.slug, ledger };
  if (typeof raw.version === "string") native["version"] = raw.version;
  if (event?.slug) native["eventSlug"] = event.slug;
  if (event?.id !== null && event?.id !== undefined) native["eventId"] = event.id;
  if (raw.negRisk !== null && raw.negRisk !== undefined) native["negRisk"] = String(raw.negRisk);
  if (raw.negRiskMarketID) native["negRiskMarketID"] = raw.negRiskMarketID;
  if (raw.questionID) native["questionID"] = raw.questionID;
  if (raw.restricted !== null && raw.restricted !== undefined) native["restricted"] = String(raw.restricted);
  return native;
}

function groupOf(raw: GammaMarket, event: GammaEvent | undefined): MarketGroup | undefined {
  const negRiskId = raw.negRiskMarketID ?? event?.negRiskMarketID ?? null;
  // Whether a neg-risk set is exhaustive depends on augmentation and an "Other" market; this adapter does not
  // decide it ("unknown" fails closed in any consumer).
  if (raw.negRisk === true && negRiskId) return { key: `polymarket:neg_risk:${negRiskId}`, kind: "neg_risk", exhaustive: "unknown" };
  if (event?.id !== null && event?.id !== undefined) return { key: `polymarket:event:${event.id}`, kind: "event", exhaustive: "unknown" };
  return undefined;
}

export function refOf(raw: GammaMarket, event: GammaEvent | undefined, ledger: Ledger): MarketRef {
  return { venue: VENUE, marketId: raw.conditionId.toLowerCase(), native: nativeOf(raw, event, ledger) };
}

// ---- category -----------------------------------------------------------------------------------------------------

const MAX_SERIES = 10;
const MAX_SERIES_CHARS = 120;

// The slugs and tickers of the event's series, in order; anything that is not a string is skipped.
function seriesWords(event: GammaEvent | undefined): string[] {
  const out: string[] = [];
  const series = event?.series;
  if (!Array.isArray(series)) return out;
  for (const entry of series.slice(0, MAX_SERIES)) {
    if (entry === null || typeof entry !== "object") continue;
    for (const key of ["slug", "ticker"] as const) {
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === "string" && value !== "") out.push(value.slice(0, MAX_SERIES_CHARS));
    }
  }
  return out;
}

// Gamma publishes no category on a market: the series slugs and tickers, the event ticker and slug, then the market
// slug are matched token by token against the fixed keyword table (core/category.ts); the question is the last resort.
export function categoryOf(raw: Pick<GammaMarket, "slug" | "question">, event: GammaEvent | undefined): CategoryVerdict {
  const native = [...seriesWords(event)];
  if (typeof event?.ticker === "string" && event.ticker !== "") native.push(event.ticker.slice(0, MAX_SERIES_CHARS));
  if (typeof event?.slug === "string" && event.slug !== "") native.push(event.slug);
  native.push(raw.slug);
  return categorise({ venue: VENUE, native, title: raw.question });
}

// The series slugs as the venue wrote them, for the inspector's untrusted slot only.
export function categoryNativeOf(event: GammaEvent | undefined): Untrusted<string> | undefined {
  const slugs: string[] = [];
  const series = event?.series;
  if (Array.isArray(series)) {
    for (const entry of series.slice(0, MAX_SERIES)) {
      const slug = entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>)["slug"] : undefined;
      if (typeof slug === "string" && slug !== "") slugs.push(slug.slice(0, MAX_SERIES_CHARS));
    }
  }
  return slugs.length === 0 ? undefined : untrustedField("category", slugs.join(", "), VENUE);
}

function categoryFields(raw: Pick<GammaMarket, "slug" | "question">, event: GammaEvent | undefined): { readonly category: CategoryVerdict; readonly categoryNative?: Untrusted<string> } {
  const categoryNative = categoryNativeOf(event);
  return { category: categoryOf(raw, event), ...(categoryNative === undefined ? {} : { categoryNative }) };
}

function displayPrice(prices: readonly string[] | null | undefined, count: number, index: number): Dec | null {
  if (prices === null || prices === undefined || prices.length !== count) return null;
  const dec = parseDec(prices[index]);
  if (dec === null || cmpDec(dec, "0") === -1 || cmpDec(dec, "1") === 1) return null;
  return dec;
}

export type Normalized<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

function pickEvent(raw: GammaMarket, ctx: NormalizeContext): GammaEvent | undefined {
  return ctx.event ?? raw.events?.[0];
}

export function normalizeSummary(raw: GammaMarket, ctx: NormalizeContext): Normalized<MarketSummary> {
  const tokens = selectTokenIds({
    version: raw.version,
    clobTokenIds: raw.clobTokenIds,
    positionIds: raw.positionIds,
    outcomeCount: raw.outcomes.length,
  });
  if (!tokens.ok) return { ok: false, reason: tokens.reason };
  const event = pickEvent(raw, ctx);
  const outcomes: OutcomeSummary[] = raw.outcomes.map((label, index) => ({
    index,
    role: roleFor(raw.outcomes, index),
    label: labelOf(label),
    tokenId: tokens.ids[index] ?? "",
    displayPrice: displayPrice(raw.outcomePrices, raw.outcomes.length, index),
  }));
  const volume = numericToDec(raw.volume) ?? numberToDec(raw.volumeNum);
  const updated = isoOrNull(raw.updatedAt);
  const prov: Prov = {
    venue: VENUE,
    source: ctx.source,
    fetchedAtMs: ctx.nowMs,
    ...(updated === null ? {} : { venueTsMs: Date.parse(updated) }),
    transport: ctx.transport,
    freshness: "recent",
    ttlMs: TTL_MS.gamma,
    license: "unknown",
  };
  return {
    ok: true,
    value: {
      ref: refOf(raw, event, tokens.ledger),
      title: titleOf(raw.question),
      status: statusOf(raw, ctx.nowMs),
      closesAtUtc: isoOrNull(raw.endDate),
      outcomes,
      volume: { amount: volume, unit: "usd", windowHours: null },
      prov,
      ...categoryFields(raw, event),
    },
  };
}

export function normalizeMarket(raw: GammaMarket, ctx: NormalizeContext): Normalized<Market> {
  const tokens = selectTokenIds({
    version: raw.version,
    clobTokenIds: raw.clobTokenIds,
    positionIds: raw.positionIds,
    outcomeCount: raw.outcomes.length,
  });
  if (!tokens.ok) return { ok: false, reason: tokens.reason };
  const event = pickEvent(raw, ctx);
  const tickValue = numericToDec(raw.orderPriceMinTickSize);
  if (tickValue === null || !isOpenUnitInterval(tickValue)) return { ok: false, reason: "the tick size is missing or not a price step" };
  const rules = buildRules(raw, event);
  if (!rules.ok) return { ok: false, reason: rules.reason };
  const outcomes: Outcome[] = raw.outcomes.map((label, index) => ({
    index,
    role: roleFor(raw.outcomes, index),
    label: labelOf(label),
    tokenId: tokens.ids[index] ?? "",
  }));
  const status = statusOf(raw, ctx.nowMs);
  const minSize = numericToDec(raw.orderMinSize);
  const opens = isoOrNull(raw.startDate);
  const closes = isoOrNull(raw.endDate);
  const group = groupOf(raw, event);
  const feeUrl = `${GAMMA_ORIGIN}/markets/slug/${encodeURIComponent(raw.slug)}`;
  const market: Market = {
    ref: refOf(raw, event, tokens.ledger),
    title: titleOf(raw.question),
    outcomes,
    rules: rules.rules,
    status,
    tradable: tradableOf(raw, status),
    timesUtc: {
      ...(opens === null ? {} : { opensAt: opens }),
      ...(closes === null ? {} : { closesAt: closes }),
    },
    tick: tickValue,
    // Gamma's orderMinSize reads "in USDC" in the docs while the CLOB book reports min_order_size 5 as shares;
    // the unit is unresolved (note 08 2.5), so a consumer reads the book's value before sizing an order.
    ...(minSize === null ? {} : { minSize }),
    collateral: COLLATERAL,
    ...(group === undefined ? {} : { group }),
    fee: feeSpecFrom(
      { enabled: raw.feesEnabled, schedule: raw.feeSchedule ?? null },
      feeUrl,
      "feeSchedule",
      ctx.nowMs,
    ),
    prov: { fetchedAtMs: ctx.nowMs, source: ctx.source, adapterVersion: ADAPTER_VERSION, schemaHash: gammaSchemaHash() },
    ...categoryFields(raw, event),
  };
  return { ok: true, value: market };
}

export function clobMarketUrl(conditionId: string): string {
  return `${CLOB_ORIGIN}/clob-markets/${encodeURIComponent(conditionId)}`;
}
