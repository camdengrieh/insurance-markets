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
} from "../../model.js";
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
} from "./constants.js";
import { categorise, type CategoryVerdict } from "../../category.js";
import { polymarketRuleFields, rulesFingerprint } from "../../rules.js";
import { safeHttpsUrl, untrustedField } from "../../text.js";
import { cmpDec, isOpenUnitInterval, numberToDec, numericToDec, parseDec, type Dec } from "./decimal.js";
import { selectTokenIds, type Ledger } from "./ids.js";
import { ADDRESS, CONDITION_ID, type GammaEvent, type GammaMarket } from "./schemas.js";

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
  "negRisk", "negRiskMarketID", "questionID", "umaResolutionStatus", "umaResolutionStatuses", "resolutionStatus", "umaBond", "umaReward",
  "feesEnabled", "feeSchedule", "events",
];
let schemaHashCache: string | undefined;
export function gammaSchemaHash(): string {
  schemaHashCache ??= sha256(toBytes(`polymarket.gamma.market/1:${PARSED_FIELDS.join(",")}`)).slice(2, 18);
  return schemaHashCache;
}

// ---- status -------------------------------------------------------------------------------------------------------

export type Signal = "none" | "proposed" | "disputed" | "resolved" | "unknown";

function umaSignal(value: unknown): Signal {
  if (value === null || value === undefined || value === "") return "none";
  if (value === "proposed") return "proposed";
  if (value === "disputed") return "disputed";
  if (value === "resolved") return "resolved";
  return "unknown";
}

const MAX_UMA_HISTORY = 64;

// `umaResolutionStatuses` is the UMA status HISTORY, oldest first: the recorded events keyset carries
// ["proposed", "proposed", "resolved"] next to umaResolutionStatus "resolved", and the recorded markets list
// ["proposed", "proposed"] next to "proposed". Its last entry is therefore the current state. Every entry must be
// a known value; an unreadable history or an unknown entry is an unknown signal (fails closed).
function umaHistorySignal(value: unknown): Signal {
  if (value === null || value === undefined || value === "") return "none";
  let list: unknown = value;
  if (typeof value === "string") {
    if (value.length > 4096) return "unknown";
    try {
      list = JSON.parse(value) as unknown;
    } catch {
      return "unknown";
    }
  }
  if (!Array.isArray(list) || list.length > MAX_UMA_HISTORY) return "unknown";
  const entries = (list as unknown[]).filter((entry) => entry !== "");
  if (entries.some((entry) => typeof entry !== "string" || umaSignal(entry) === "unknown")) return "unknown";
  return entries.length === 0 ? "none" : umaSignal(entries[entries.length - 1]);
}

// Two readings of the same process agree, or one of them says nothing; anything else is unknown.
function combine(a: Signal, b: Signal): Signal {
  if (a === b) return a;
  if (a === "none") return b;
  if (b === "none") return a;
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

export function resolutionSignal(
  raw: Pick<GammaMarket, "umaResolutionStatus" | "resolutionStatus"> & { readonly umaResolutionStatuses?: unknown },
): Signal {
  return combine(combine(umaSignal(raw.umaResolutionStatus), umaHistorySignal(raw.umaResolutionStatuses)), v2Signal(raw.resolutionStatus));
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

// Why a market cannot be traded, as fixed codes (never venue text). The codes of both readers merged here: the
// status, the closed and active flags, the resolution signal, the order switches. Empty means tradable.
export function tradableOf(raw: GammaMarket, status: Status): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (status !== "active") reasons.push(`status_${status}`);
  if (raw.closed === true || raw.archived === true) reasons.push("market_closed");
  if (raw.active !== true) reasons.push("market_not_active");
  const signal = resolutionSignal(raw);
  if (signal === "unknown") reasons.push("uma_status_unrecognised");
  else if (signal !== "none") reasons.push(`uma_${signal}`);
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
    // The shared rules-v2 fingerprint over the market's own description, resolution source and end date (finding
    // A2, sdk/rules.ts), so a linker-proposed leg can be re-checked here. An event description shown as a
    // fallback is display only and not fingerprinted.
    sha256: rulesFingerprint("polymarket", polymarketRuleFields(raw)),
    sources: source === null ? [] : [source],
    mechanism: uma ? "uma_oo" : "unknown",
    ...(resolver === undefined ? {} : { resolver }),
    ...(cutoff === null ? {} : { cutoffUtc: cutoff }),
    ...(start === null ? {} : { windowStartUtc: start }),
    // "Unknown/50-50": each token redeems 0.50 (note 08 2.10). That is the UMA adapter's answer, so a market
    // with no UMA field at all has no known void policy.
    void: uma ? "fifty_fifty" : "unknown",
  };
  return { ok: true, rules };
}

// ---- fees ---------------------------------------------------------------------------------------------------------

// The fee parameters as a route writes them (Gamma `feeSchedule`, CLOB `fd`), before validation.
export interface FeeInput {
  readonly rate: unknown;
  readonly exponent: unknown;
  readonly takerOnly: unknown;
}

// The validated fee of one market: the documented curve C x rate x p x (1 - p), taker only, with the venue's own
// rate. `exponent` is "1" when the venue sent the curve's parameters and null when fees are switched off
// (feesEnabled:false, a documented zero). Anything this reader cannot vouch for is `known: false`, and no
// net-of-fee number may be shown for it. Both the dApp reader and the pm adapter build their FeeSpec from this.
export type PolymarketFee =
  | { readonly known: true; readonly rate: Dec; readonly exponent: "1" | null }
  | { readonly known: false; readonly reason: string };

const PLAIN_DECIMAL = /^(?:0|[1-9][0-9]{0,29})(?:\.[0-9]{1,29})?$/;

// A fee parameter is a plain non-negative decimal: a string such as "0.04", or a JSON number whose shortest form
// is plain with at most 15 significant digits. A number that prints in exponent form (1e-7) is refused rather than
// expanded: no documented rate looks like that, so it is read as drift (the pm adapter's rule, the stricter one).
export function feeDecimal(value: unknown): Dec | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const text = String(value);
    if (!PLAIN_DECIMAL.test(text) || text.replace(".", "").replace(/^0+/, "").replace(/0+$/, "").length > 15) return null;
    return parseDec(text);
  }
  return typeof value === "string" && PLAIN_DECIMAL.test(value) ? parseDec(value) : null;
}

function curveOf(schedule: FeeInput): PolymarketFee {
  const rate = feeDecimal(schedule.rate);
  const exponent = feeDecimal(schedule.exponent);
  if (rate === null) return { known: false, reason: "the fee rate is not a plain decimal" };
  if (exponent !== "1") return { known: false, reason: "the fee exponent is not 1" };
  if (schedule.takerOnly !== true) return { known: false, reason: "the fee is not taker-only" };
  if (cmpDec(rate, "1") === 1) return { known: false, reason: "the fee rate is above 1" };
  return { known: true, rate, exponent: "1" };
}

// Gamma: feesEnabled:false is a documented zero fee. With fees on, the schedule must be exactly the documented
// curve (exponent 1, taker only); anything else, or a missing field, is unknown.
export function gammaFee(enabled: boolean | null | undefined, schedule: FeeInput | null | undefined): PolymarketFee {
  if (enabled === false) return { known: true, rate: "0", exponent: null };
  if (enabled !== true) return { known: false, reason: "feesEnabled is missing" };
  if (schedule === null || schedule === undefined) return { known: false, reason: "the fee schedule is missing" };
  return curveOf(schedule);
}

// The matching engine's `fd` block (r, e, to); null when the engine sent none.
export function clobFee(fd: { readonly r: unknown; readonly e: unknown; readonly to: unknown } | null | undefined): PolymarketFee | null {
  if (fd === null || fd === undefined) return null;
  return curveOf({ rate: fd.r, exponent: fd.e, takerOnly: fd.to });
}

export interface ReconciledFee {
  readonly fee: PolymarketFee;
  // True when both sources gave a readable fee and the rates differ.
  readonly disagree: boolean;
}

// Gamma's copy of the fee is a cache (max-age five minutes); the engine's `fd` is what is charged. When a CLOB record
// exists the two must agree, or the fee is unknown: no "larger of the two" guess. No `fd` agrees only with a Gamma
// zero fee. (`/fee-rate` and mbf/tbf are signing-era fields, 1000 bps while the charged rate was 0.04, never read.)
export function reconcileFees(gamma: PolymarketFee, clob: PolymarketFee | null): ReconciledFee {
  if (clob === null) {
    if (gamma.known && cmpDec(gamma.rate, "0") === 0) return { fee: gamma, disagree: false };
    return { fee: { known: false, reason: "the engine sent no fee details and Gamma does not say the market is free" }, disagree: false };
  }
  if (!clob.known) return { fee: clob, disagree: false };
  if (!gamma.known) return { fee: { known: false, reason: `Gamma's fee could not be read (${gamma.reason})` }, disagree: false };
  if (cmpDec(gamma.rate, clob.rate) !== 0) return { fee: { known: false, reason: "Gamma and the engine give different fee rates" }, disagree: true };
  return { fee: clob, disagree: false };
}

function feeSpecShell(url: string, field: string, nowMs: number): Pick<FeeSpec, "venue" | "payer" | "paramsSource" | "verifiedAt"> {
  return {
    venue: "polymarket",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url, field, granularity: "market" },
    verifiedAt: new Date(nowMs).toISOString(),
  };
}

export function unknownFeeSpec(url: string, field: string, nowMs: number): FeeSpec {
  return { modelId: "unknown", ...feeSpecShell(url, field, nowMs), ttlSec: 0 };
}

// The read model's FeeSpec of a validated fee.
export function feeSpecOf(fee: PolymarketFee, url: string, field: string, nowMs: number): FeeSpec {
  if (!fee.known) return unknownFeeSpec(url, field, nowMs);
  return {
    modelId: "curve_pq",
    taker: { rate: fee.rate, exponent: "1" },
    maker: { rate: "0" },
    rounding: FEE_ROUNDING,
    ...feeSpecShell(url, field, nowMs),
    ttlSec: FEE_TTL_SEC,
  };
}

// The validated fee a FeeSpec built by feeSpecOf stands for (the dApp keeps only the spec on a Market).
export function feeOfSpec(spec: FeeSpec): PolymarketFee {
  if (spec.modelId !== "curve_pq" || spec.taker?.rate === undefined) return { known: false, reason: "the market's fee is unknown" };
  const rate = parseDec(spec.taker.rate);
  return rate === null ? { known: false, reason: "the market's fee rate is not a decimal" } : { known: true, rate, exponent: rate === "0" ? null : "1" };
}

export function feeSpecFrom(
  input: { readonly enabled: boolean | null | undefined; readonly schedule: FeeInput | null | undefined },
  url: string,
  field: string,
  nowMs: number,
): FeeSpec {
  return feeSpecOf(gammaFee(input.enabled, input.schedule), url, field, nowMs);
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
  // decide it ("unknown" fails closed in any consumer). The neg-risk id is a 32-byte hex id or it names no group.
  if (raw.negRisk === true && negRiskId !== null && CONDITION_ID.test(negRiskId)) return { key: `polymarket:neg_risk:${negRiskId}`, kind: "neg_risk", exhaustive: "unknown" };
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
// slug are matched token by token against the fixed keyword table (sdk/category.ts); the question is the last resort.
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
