import { XO_DATA_API_HOST, XO_ORDERBOOK_HOST, XoError, XoHttp, type HttpOptions } from "./http.js";
import {
  KNOWN_MARKET_STATUSES,
  KNOWN_REVIEW_STATUSES,
  untrusted,
  type BalanceAllowance,
  type BookLevel,
  type Claimable,
  type ClaimableEntry,
  type FeeAssessment,
  type FeeConfig,
  type KnownMarketStatus,
  type LastTrade,
  type Lifecycle,
  type ListedOutcome,
  type MarketCategory,
  type MarketCollection,
  type MarketCore,
  type MarketCreator,
  type MarketDetail,
  type MarketKind,
  type MarketOutcome,
  type MarketPage,
  type MarketRules,
  type MarketStatus,
  type MarketSummary,
  type MarketWithTokens,
  type OrderBook,
  type OrderbookMarket,
  type PageMeta,
  type PortfolioEntry,
  type PortfolioResult,
  type Position,
  type Positions,
  type Quote,
  type RefundReason,
  type ReviewStatus,
  type Settlement,
  type SkippedRow,
  type ThinReason,
  type TradingState,
  type UntrustedString,
} from "./types.js";
import {
  isTokenId,
  midpointMicro,
  normalizeAddress,
  normalizeBareAddress,
  normalizeConditionId,
  parseDecimalToMicro,
  parseMicroInteger,
  MICRO,
} from "./units.js";

// Typed, defensive client for the XO public read APIs. Every response is checked at runtime;
// nothing is cast from JSON. Hard-won facts this file encodes (docs/phase0-gate-results.md,
// gate 9, and docs/research/02-xo-read-api.md with its Verification section):
//   - discovery is marketType=2,4 always (the default scope returns only the 9 legacy AMM rows);
//   - take is at most 50, and paging trusts meta.hasNextPage only (rows hide after itemCount);
//   - Data API prices are micro-unit strings; list prices are display prices and detail routes
//     return a constant 500000, so quotes come from the orderbook only;
//   - orderbook /price: side=BUY is the best bid and side=SELL is the best ask;
//   - outcome index 0 is the Yes slot and 1 the No slot; winningOutcomeId is an outcome row id.

export const MAX_TAKE = 50;
export const DEFAULT_TAKE = 20;
export const DEFAULT_MAX_PAGES = 5;
// Display prices follow the midpoint only while the spread is at most 0.10; mirror that.
export const WIDE_SPREAD_MICRO = 100_000n;
const MAX_SEARCH_CHARS = 100;
const MAX_LEVELS_PER_SIDE = 2000;
const MAX_POSITIONS = 5000;
const MAX_PORTFOLIO_ENTRIES = 200;
const END_OF_STREAM_CURSOR = "LTE=";

// ---- request parameters ----

export const LIST_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
  "RESOLVED",
  "VOIDED",
  "VOIDED_CLOSED",
  "UPDATE_REQUIRED",
  "CLOSING_24H",
  "EXPIRED",
] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];
export const LIST_SORT_FIELDS = ["createdAt", "expiresAt", "startsAt", "totalVolume", "totalVolumeInUSD"] as const;
export type ListSortField = (typeof LIST_SORT_FIELDS)[number];

// There is deliberately no marketScope or free marketType here: discovery is fixed to types 2 and
// 4, and `kind` can only narrow it to one of the two. XO applies marketType before paging, so a
// kind filter done on the client would return empty pages.
export const LIST_KINDS = ["clob", "conviction"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export interface ListMarketsParams {
  readonly page?: number;
  readonly take?: number;
  readonly kind?: ListKind;
  // Defaults to ["ACTIVE"]. Pass the statuses you want; omitting them would crawl every closed market.
  readonly statuses?: readonly ListStatus[];
  // Title-only, case-insensitive, contiguous substring match (no ranking, no creator or tag search).
  readonly search?: string;
  readonly sortBy?: ListSortField;
  readonly sortOrder?: "ASC" | "DESC";
}

export interface ListAllMarketsParams extends Omit<ListMarketsParams, "page"> {
  readonly maxPages?: number;
}

export interface PortfolioParams {
  readonly page?: number;
  readonly take?: number;
  // Passed through as given. Whether the default scope hides CLOB and Conviction positions on
  // this route is unverified; /positions on the orderbook is the authoritative holdings read.
  readonly marketScope?: "default" | "withClob" | "withPulse" | "onlyPulse" | "onlyClobPulse" | "onlyClob";
}

// ---- decoding primitives ----

type Rec = Readonly<Record<string, unknown>>;

class DecodeError extends Error {
  readonly path: string;
  readonly problem: string;
  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.path = path;
    this.problem = problem;
  }
}

const at = (path: string, key: string | number): string =>
  typeof key === "number" ? `${path}[${key}]` : path === "" ? key : `${path}.${key}`;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Own properties only, so inherited names (constructor, toString, ...) can never satisfy a read.
function field(rec: Rec, key: string): unknown {
  return Object.hasOwn(rec, key) ? rec[key] : undefined;
}

function asRec(value: unknown, path: string): Rec {
  if (!isRec(value)) throw new DecodeError(path, "expected an object");
  return value;
}

function asArray(value: unknown, path: string, max: number): readonly unknown[] {
  if (!Array.isArray(value)) throw new DecodeError(path, "expected an array");
  if (value.length > max) throw new DecodeError(path, `more than ${max} items`);
  return value as readonly unknown[];
}

function reqString(rec: Rec, key: string, path: string, max = 20_000): string {
  const value = field(rec, key);
  if (typeof value !== "string") throw new DecodeError(at(path, key), "expected a string");
  if (value.length > max) throw new DecodeError(at(path, key), "string too long");
  return value;
}

function optString(rec: Rec, key: string, path: string, max = 20_000): string | null {
  const value = field(rec, key);
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new DecodeError(at(path, key), "expected a string or null");
  if (value.length > max) throw new DecodeError(at(path, key), "string too long");
  return value;
}

function reqInt(rec: Rec, key: string, path: string): number {
  const value = field(rec, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new DecodeError(at(path, key), "expected a non-negative integer");
  }
  return value;
}

function optInt(rec: Rec, key: string, path: string): number | null {
  const value = field(rec, key);
  if (value === undefined || value === null) return null;
  return reqInt(rec, key, path);
}

function reqBool(rec: Rec, key: string, path: string): boolean {
  const value = field(rec, key);
  if (typeof value !== "boolean") throw new DecodeError(at(path, key), "expected a boolean");
  return value;
}

// Strict ISO-8601 date-time with an explicit zone. Date.parse alone also accepts legacy forms such
// as "12/31/2030 (any text)", which would let free text ride along in a date field.
const ISO_DATE_TIME =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

// Returns the canonical UTC form (YYYY-MM-DDTHH:MM:SS.mmmZ), or null when the text is not a date-time.
function canonicalIso(value: string): string | null {
  if (value.length > 64 || !ISO_DATE_TIME.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  // Years outside 0000 to 9999 print with a sign and are not a market date.
  return /^\d{4}-/.test(iso) ? iso : null;
}

function optIso(rec: Rec, key: string, path: string): string | null {
  const value = optString(rec, key, path, 64);
  if (value === null) return null;
  const iso = canonicalIso(value);
  if (iso === null) throw new DecodeError(at(path, key), "expected an ISO 8601 date-time");
  return iso;
}

// Display-only fields use these: malformed becomes null instead of failing the whole row.
const lenientInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const lenientString = (value: unknown, max = 2000): string | null =>
  typeof value === "string" && value.length <= max ? value : null;
const lenientBool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

// Creator-written text on the detail route. Long text is cut, not dropped, and every cut or
// ignored field is noted so the caller can say so (the sanitizer then caps what is shown).
const DETAIL_TEXT_CAP = 20_000;
const SOURCE_CAP = 2_000;
const MAX_SOURCES_READ = 20;
const MAX_OUTCOME_RULES_READ = 10;

// Cuts at `max` UTF-16 code units without leaving half of a surrogate pair.
function cutAt(value: string, max: number): string {
  const cut = value.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

function boundedText(value: unknown, max: number, name: string, omissions: string[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    omissions.push(`${name} was not text and was ignored`);
    return null;
  }
  if (value.length > max) {
    omissions.push(`${name} was longer than ${max} characters and was cut`);
    return cutAt(value, max);
  }
  return value;
}

const entries = (count: number): string => (count === 1 ? "entry was" : "entries were");

function microIntegerField(rec: Rec, key: string, path: string): bigint {
  const value = parseMicroInteger(field(rec, key));
  if (value === null) throw new DecodeError(at(path, key), "expected an integer string of micro units");
  return value;
}

function tokenIdField(value: unknown, path: string): string {
  if (!isTokenId(value)) throw new DecodeError(path, "expected a decimal token id");
  return value;
}

function conditionIdField(rec: Rec, key: string, path: string): string {
  const value = normalizeConditionId(field(rec, key));
  if (value === null) throw new DecodeError(at(path, key), "expected a 32-byte hex condition id");
  return value;
}

// ---- market decoding ----

function classifyStatus(raw: string): MarketStatus {
  // Exact match on purpose: a lookalike value must not be read as ACTIVE.
  return (KNOWN_MARKET_STATUSES as readonly string[]).includes(raw) ? (raw as KnownMarketStatus) : "unknown";
}

function classifyKind(typeCode: number): MarketKind {
  switch (typeCode) {
    case 0:
      return "standard";
    case 1:
      return "pulse_amm";
    case 2:
      return "clob";
    case 3:
      return "clob_pulse";
    case 4:
      return "conviction";
    default:
      return "unknown";
  }
}

function classifyReview(raw: string | null): ReviewStatus | null {
  if (raw === null) return null;
  return (KNOWN_REVIEW_STATUSES as readonly string[]).includes(raw) ? (raw as ReviewStatus) : "unknown";
}

type OutcomeWithPrice = MarketOutcome & { readonly displayPriceMicro: bigint | null };

// Accepts the live names (outcomeTokenId, index) and the OpenAPI names (tokenId, position).
function decodeOutcome(value: unknown, path: string): OutcomeWithPrice {
  const rec = asRec(value, path);
  const id = reqInt(rec, "id", path);
  const live = field(rec, "index");
  const spec = field(rec, "position");
  if (live !== undefined && spec !== undefined && live !== spec) throw new DecodeError(at(path, "index"), "index and position disagree");
  const index = live ?? spec;
  if (index !== 0 && index !== 1) throw new DecodeError(at(path, "index"), "expected 0 or 1");
  const liveToken = field(rec, "outcomeTokenId");
  const specToken = field(rec, "tokenId");
  if (liveToken !== undefined && specToken !== undefined && liveToken !== specToken) {
    throw new DecodeError(at(path, "outcomeTokenId"), "outcomeTokenId and tokenId disagree");
  }
  const tokenId = tokenIdField(liveToken ?? specToken, at(path, "outcomeTokenId"));
  // Integer strings only. A "0.55" style value (the OpenAPI example) is not trusted as micro.
  const price = parseMicroInteger(field(rec, "currentPrice"));
  const displayPriceMicro = price !== null && price <= MICRO ? price : null;
  return {
    id,
    index,
    slot: index === 0 ? "yes" : "no",
    title: untrusted(reqString(rec, "title", path, 500)),
    tokenId,
    displayPriceMicro,
  };
}

function decodeOutcomePair(value: unknown, path: string): readonly [OutcomeWithPrice, OutcomeWithPrice] {
  const items = asArray(value, path, 8);
  if (items.length !== 2) throw new DecodeError(path, "expected exactly two outcomes");
  const decoded = items.map((item, i) => decodeOutcome(item, at(path, i)));
  const yes = decoded.find((o) => o.index === 0);
  const no = decoded.find((o) => o.index === 1);
  if (yes === undefined || no === undefined) throw new DecodeError(path, "expected one outcome at index 0 and one at index 1");
  if (yes.id === no.id || yes.tokenId === no.tokenId) throw new DecodeError(path, "outcomes are not distinct");
  return [yes, no];
}

function decodeCategories(rec: Rec): readonly MarketCategory[] {
  const raw = field(rec, "categoryPath") ?? field(rec, "category");
  if (!Array.isArray(raw)) return [];
  const out: MarketCategory[] = [];
  for (const item of raw.slice(0, 10) as unknown[]) {
    if (!isRec(item)) continue;
    const name = lenientString(field(item, "name"), 200);
    if (name === null) continue;
    const slug = lenientString(field(item, "slug"), 200);
    out.push({ id: lenientInt(field(item, "id")), name: untrusted(name), slug: slug === null ? null : untrusted(slug) });
  }
  return out;
}

function decodeCreator(value: unknown): MarketCreator | null {
  if (!isRec(value)) return null;
  const username = lenientString(field(value, "username"), 200);
  const bio = lenientString(field(value, "bio"), 2000);
  return {
    id: lenientInt(field(value, "id")),
    walletAddress: normalizeAddress(field(value, "walletPublicKey")),
    username: username === null ? null : untrusted(username),
    bio: bio === null ? null : untrusted(bio),
    verified: lenientBool(field(value, "verified")),
  };
}

function decodeVolumeUsd(value: unknown): bigint | null {
  return parseDecimalToMicro(value);
}

function decodeCore(rec: Rec, path: string, outcomes: readonly MarketOutcome[], omissions: string[]): MarketCore {
  const typeCode = reqInt(rec, "type", path);
  const statusRaw = reqString(rec, "status", path, 64);
  const winningOutcomeId = optInt(rec, "winningOutcomeId", path);
  let winningOutcomeIndex: 0 | 1 | null = null;
  if (winningOutcomeId !== null) {
    // winningOutcomeId is an outcome ROW id (outcomes[].id), never an index.
    const winner = outcomes.find((o) => o.id === winningOutcomeId);
    if (winner === undefined) throw new DecodeError(at(path, "winningOutcomeId"), "does not match any outcome id");
    winningOutcomeIndex = winner.index;
  }
  const settlement: Settlement = { winningOutcomeId, winningOutcomeIndex, resolvedAt: optIso(rec, "resolvedAt", path) };
  const resolutionSources: UntrustedString[] = [];
  const rawSources = field(rec, "resolutionSources");
  let resolutionSourcesTotal = 0;
  if (Array.isArray(rawSources)) {
    resolutionSourcesTotal = rawSources.length;
    if (rawSources.length > MAX_SOURCES_READ) {
      omissions.push(`resolutionSources has ${rawSources.length} entries; only the first ${MAX_SOURCES_READ} were read`);
    }
    let unreadable = 0;
    let cut = 0;
    for (const item of rawSources.slice(0, MAX_SOURCES_READ) as unknown[]) {
      if (typeof item !== "string") {
        unreadable += 1;
      } else if (item.length > SOURCE_CAP) {
        cut += 1;
        resolutionSources.push(untrusted(cutAt(item, SOURCE_CAP)));
      } else {
        resolutionSources.push(untrusted(item));
      }
    }
    if (cut > 0) omissions.push(`${cut} resolutionSources ${entries(cut)} longer than ${SOURCE_CAP} characters and ${cut === 1 ? "was" : "were"} cut`);
    if (unreadable > 0) omissions.push(`${unreadable} resolutionSources ${entries(unreadable)} not text and left out`);
  } else if (rawSources !== undefined && rawSources !== null) {
    omissions.push("resolutionSources was not a list and was ignored");
  }
  const resolutionType = lenientString(field(rec, "resolutionType"), 64);
  const reviewRaw = lenientString(field(rec, "reviewStatus"), 64);
  return {
    id: reqInt(rec, "id", path),
    conditionId: conditionIdField(rec, "conditionId", path),
    title: untrusted(reqString(rec, "title", path, 1000)),
    slug: untrusted(reqString(rec, "slug", path, 500)),
    typeCode,
    kind: classifyKind(typeCode),
    status: classifyStatus(statusRaw),
    statusRaw: untrusted(statusRaw),
    createdAt: lenientIso(field(rec, "createdAt")),
    startsAt: optIso(rec, "startsAt", path),
    expiresAt: optIso(rec, "expiresAt", path),
    settlement,
    categoryPath: decodeCategories(rec),
    resolutionSources,
    resolutionSourcesTotal,
    resolutionType: resolutionType === null ? null : untrusted(resolutionType),
    resolverAddress: normalizeAddress(field(rec, "resolverAddress")),
    reviewStatus: classifyReview(reviewRaw),
    reviewStatusRaw: reviewRaw === null ? null : untrusted(reviewRaw),
    resolutionFlagCount: lenientInt(field(rec, "resolutionFlagCount")),
    creator: decodeCreator(field(rec, "creator")),
    totalVolumeUsdMicro: decodeVolumeUsd(field(rec, "totalVolumeInUSD")),
  };
}

function lenientIso(value: unknown): string | null {
  return typeof value === "string" ? canonicalIso(value) : null;
}

export function decodeMarketSummary(value: unknown, path = "market"): MarketSummary {
  const rec = asRec(value, path);
  const outcomes = decodeOutcomePair(field(rec, "outcomes"), at(path, "outcomes"));
  // List rows never show sources, so what decodeCore would report about them is not needed.
  const core = decodeCore(rec, path, outcomes, []);
  const listed: readonly [ListedOutcome, ListedOutcome] = [outcomes[0], outcomes[1]];
  return { ...core, outcomes: listed };
}

function decodeFeeConfig(value: unknown, path: string): FeeConfig {
  const rec = asRec(value, path);
  const bps = (key: string): number => {
    const n = field(rec, key);
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > 10_000) {
      throw new DecodeError(at(path, key), "expected an integer from 0 to 10000");
    }
    return n;
  };
  const curve = lenientString(field(rec, "curveModel"), 64);
  const name = lenientString(field(rec, "configName"), 64);
  return {
    takerFeeBps: bps("takerFeeBps"),
    makerFeeBps: bps("makerFeeBps"),
    eligible: lenientBool(field(rec, "eligible")),
    curveModel: curve === null ? null : untrusted(curve),
    configName: name === null ? null : untrusted(name),
  };
}

function decodeRules(value: unknown, omissions: string[]): MarketRules {
  if (!isRec(value)) {
    if (value !== undefined && value !== null) omissions.push("rules was not an object and was ignored");
    return { description: null, outcomeRules: [], outcomeRulesTotal: 0 };
  }
  const description = boundedText(field(value, "description"), DETAIL_TEXT_CAP, "rules.description", omissions);
  const rules: { outcomeIndex: 0 | 1; rule: UntrustedString }[] = [];
  const raw = field(value, "outcomeRules");
  let outcomeRulesTotal = 0;
  if (Array.isArray(raw)) {
    outcomeRulesTotal = raw.length;
    if (raw.length > MAX_OUTCOME_RULES_READ) {
      omissions.push(`rules.outcomeRules has ${raw.length} entries; only the first ${MAX_OUTCOME_RULES_READ} were read`);
    }
    let unreadable = 0;
    (raw.slice(0, MAX_OUTCOME_RULES_READ) as unknown[]).forEach((item, i) => {
      const index = isRec(item) ? field(item, "outcomeIndex") : undefined;
      const rule = isRec(item) ? field(item, "rule") : undefined;
      if ((index !== 0 && index !== 1) || typeof rule !== "string") {
        unreadable += 1;
        return;
      }
      const text = boundedText(rule, DETAIL_TEXT_CAP, `outcomeRules[${i}].rule`, omissions);
      if (text !== null) rules.push({ outcomeIndex: index, rule: untrusted(text) });
    });
    if (unreadable > 0) omissions.push(`${unreadable} outcomeRules ${entries(unreadable)} unreadable and left out`);
  } else if (raw !== undefined && raw !== null) {
    omissions.push("rules.outcomeRules was not a list and was ignored");
  }
  return { description: description === null ? null : untrusted(description), outcomeRules: rules, outcomeRulesTotal };
}

export function decodeMarketDetail(value: unknown, path = "market"): MarketDetail {
  const rec = asRec(value, path);
  // Detail routes report a constant currentPrice of 500000; it is dropped here on purpose.
  const pair = decodeOutcomePair(field(rec, "outcomes"), at(path, "outcomes"));
  const outcomes: readonly [MarketOutcome, MarketOutcome] = [stripPrice(pair[0]), stripPrice(pair[1])];
  const omissions: string[] = [];
  const core = decodeCore(rec, path, outcomes, omissions);

  // Every amount in this client assumes 6-decimal collateral; refuse anything else.
  const collateral = field(rec, "collateralToken");
  if (isRec(collateral)) {
    const decimals = field(collateral, "decimals");
    if (decimals !== undefined && decimals !== 6) throw new DecodeError(at(at(path, "collateralToken"), "decimals"), "expected 6");
  }

  let effectiveFeeConfig: FeeConfig | null = null;
  let feeConfigProblem: string | null = null;
  const rawFee = field(rec, "effectiveFeeConfig");
  if (rawFee !== undefined && rawFee !== null) {
    try {
      effectiveFeeConfig = decodeFeeConfig(rawFee, at(path, "effectiveFeeConfig"));
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      feeConfigProblem = error.message;
    }
  }
  const description = boundedText(field(rec, "description"), DETAIL_TEXT_CAP, "description", omissions);
  const rules = decodeRules(field(rec, "rules"), omissions);
  const evidence = boundedText(field(rec, "resolutionEvidence"), DETAIL_TEXT_CAP, "resolutionEvidence", omissions);
  const notes = boundedText(field(rec, "notes"), DETAIL_TEXT_CAP, "notes", omissions);
  return {
    ...core,
    outcomes,
    description: description === null ? null : untrusted(description),
    rules,
    resolutionEvidence: evidence === null ? null : untrusted(evidence),
    notes: notes === null ? null : untrusted(notes),
    omissions,
    effectiveFeeConfig,
    feeConfigProblem,
  };
}

function stripPrice(outcome: OutcomeWithPrice): MarketOutcome {
  return { id: outcome.id, index: outcome.index, slot: outcome.slot, title: outcome.title, tokenId: outcome.tokenId };
}

function decodePageMeta(value: unknown, path: string): PageMeta {
  const rec = asRec(value, path);
  return {
    page: reqInt(rec, "page", path),
    take: lenientInt(field(rec, "take")),
    itemCount: lenientInt(field(rec, "itemCount")),
    pageCount: lenientInt(field(rec, "pageCount")),
    // Required: without it there is no safe way to know whether to fetch another page.
    hasNextPage: reqBool(rec, "hasNextPage", path),
    hasPreviousPage: lenientBool(field(rec, "hasPreviousPage")),
  };
}

// The envelope is strict. Rows are validated one by one so a single malformed (or hostile)
// user-created market cannot break discovery for everyone; bad rows are reported in `skipped`.
export function decodeMarketPage(value: unknown, requestedTake: number): MarketPage {
  const rec = asRec(value, "response");
  const rows = asArray(field(rec, "data"), "data", 100);
  if (rows.length > requestedTake) throw new DecodeError("data", "more rows than requested");
  const meta = decodePageMeta(field(rec, "meta"), "meta");
  const markets: MarketSummary[] = [];
  const skipped: SkippedRow[] = [];
  rows.forEach((row, index) => {
    try {
      markets.push(decodeMarketSummary(row, at("data", index)));
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      skipped.push({ index, reason: error.message });
    }
  });
  return { markets, skipped, meta };
}

// ---- lifecycle and tradability (pure) ----

// Classifies a market from Data API metadata. "open" still needs the orderbook's own
// `active` flag and a two-sided book before anything is quoted or traded.
export function lifecycleOf(
  market: Pick<MarketCore, "status" | "startsAt" | "expiresAt" | "settlement">,
  nowMs: number,
): Lifecycle {
  switch (market.status) {
    case "ACTIVE": {
      // Fail closed: no usable expiry, a start in the future or a past expiry is not open.
      if (market.expiresAt === null) return "unknown";
      if (nowMs >= Date.parse(market.expiresAt)) return "expired_unresolved";
      if (market.startsAt !== null && nowMs < Date.parse(market.startsAt)) return "pending";
      return "open";
    }
    case "PENDING":
      return "pending";
    case "PAUSED":
      return "paused";
    case "UPDATE_REQUIRED":
      return "review_required";
    case "RESOLVED":
      return "resolved_provisional";
    case "CLOSED":
      return market.settlement.winningOutcomeIndex === null ? "closed_no_winner" : "settled";
    case "VOIDED":
    case "VOIDED_CLOSED":
      return "voided";
    case "CANCELLED":
      return "cancelled";
    case "unknown":
      return "unknown";
  }
}

export function isOpenByMetadata(
  market: Pick<MarketCore, "status" | "startsAt" | "expiresAt" | "settlement">,
  nowMs: number,
): boolean {
  return lifecycleOf(market, nowMs) === "open";
}

// ---- fees (pure) ----

// /fee-rate returns 0 for every token, including nonexistent ones, while the Data API
// effectiveFeeConfig shows 400 to 800 bps on many markets. Fail closed: when figures disagree
// use the larger, and treat a lone /fee-rate of 0 as unknown rather than free.
export function resolveTakerFee(input: { readonly effective: FeeConfig | null; readonly feeRateBps: readonly number[] }): FeeAssessment {
  const effectiveConfigBps = input.effective === null ? null : input.effective.takerFeeBps;
  const rates = [...input.feeRateBps];
  const base = { effectiveConfigBps, feeRateBps: rates };
  if (effectiveConfigBps === null) {
    if (rates.length === 0) {
      return { ...base, takerFeeBps: null, status: "unknown", note: "no fee figure available; treat the fee as unknown" };
    }
    const largest = Math.max(...rates);
    if (largest === 0) {
      return { ...base, takerFeeBps: null, status: "unknown", note: "only /fee-rate reported, and it returns 0 even for nonexistent tokens; treat the fee as unknown" };
    }
    return { ...base, takerFeeBps: largest, status: "fee_rate_only", note: "only /fee-rate reported (unreliable); using the larger value" };
  }
  const all = [effectiveConfigBps, ...rates];
  const largest = Math.max(...all);
  if (rates.length === 0) {
    return { ...base, takerFeeBps: effectiveConfigBps, status: "effective_only", note: "/fee-rate unavailable; using effectiveFeeConfig" };
  }
  if (all.every((n) => n === largest)) {
    return { ...base, takerFeeBps: largest, status: "agree", note: "effectiveFeeConfig and /fee-rate agree" };
  }
  return { ...base, takerFeeBps: largest, status: "disagree", note: "effectiveFeeConfig and /fee-rate disagree; using the larger figure" };
}

// ---- orderbook decoding ----

function decodeLevels(value: unknown, path: string): BookLevel[] {
  const items = asArray(value, path, MAX_LEVELS_PER_SIDE);
  return items.map((item, i) => {
    const rec = asRec(item, at(path, i));
    // Book prices sit strictly inside (0, 1); sizes are human shares with up to 6 decimals.
    const priceMicro = parseDecimalToMicro(field(rec, "price"));
    if (priceMicro === null || priceMicro <= 0n || priceMicro >= MICRO) {
      throw new DecodeError(at(at(path, i), "price"), "expected a decimal price between 0 and 1");
    }
    const sizeMicro = parseDecimalToMicro(field(rec, "size"));
    if (sizeMicro === null || sizeMicro <= 0n) {
      throw new DecodeError(at(at(path, i), "size"), "expected a positive decimal size with at most 6 decimals");
    }
    return { priceMicro, sizeMicro };
  });
}

export function decodeBook(value: unknown, expectedTokenId: string): OrderBook {
  const rec = asRec(value, "book");
  const tokenId = tokenIdField(field(rec, "asset_id"), "book.asset_id");
  if (tokenId !== expectedTokenId) throw new DecodeError("book.asset_id", "does not match the requested token");
  const timestamp = reqString(rec, "timestamp", "book", 20);
  if (!/^[0-9]{1,16}$/.test(timestamp)) throw new DecodeError("book.timestamp", "expected a millisecond timestamp string");
  const tick = parseDecimalToMicro(field(rec, "tick_size"));
  if (tick === null || tick <= 0n || tick > 100_000n) throw new DecodeError("book.tick_size", "expected a decimal tick size");
  const minOrder = field(rec, "min_order_size");
  const minOrderSizeRaw = typeof minOrder === "string" ? minOrder : typeof minOrder === "number" && Number.isFinite(minOrder) ? String(minOrder) : null;
  if (minOrderSizeRaw === null || minOrderSizeRaw.length > 40) throw new DecodeError("book.min_order_size", "expected a short string");
  const lastTrade = field(rec, "last_trade_price");
  const lastTradeMicro = lastTrade === undefined || lastTrade === null ? null : parseDecimalToMicro(lastTrade);
  if (lastTrade !== undefined && lastTrade !== null && lastTradeMicro === null) {
    throw new DecodeError("book.last_trade_price", "expected a decimal price");
  }
  // Sorted here instead of trusting the wire order.
  const bids = decodeLevels(field(rec, "bids"), "book.bids").sort((a, b) => (a.priceMicro > b.priceMicro ? -1 : a.priceMicro < b.priceMicro ? 1 : 0));
  const asks = decodeLevels(field(rec, "asks"), "book.asks").sort((a, b) => (a.priceMicro < b.priceMicro ? -1 : a.priceMicro > b.priceMicro ? 1 : 0));
  return {
    tokenId,
    conditionId: conditionIdField(rec, "market", "book"),
    timestampMs: Number(timestamp),
    hash: lenientString(field(rec, "hash"), 128),
    bids,
    asks,
    tickSizeMicro: tick,
    minOrderSizeRaw,
    negRisk: reqBool(rec, "neg_risk", "book"),
    // "0.000" is the no-trade sentinel, not a price.
    lastTradePriceMicro: lastTradeMicro === null || lastTradeMicro === 0n ? null : lastTradeMicro,
    lastUpdateId: lenientInt(field(rec, "last_update_id")),
  };
}

// Everything a quote needs comes from one /book snapshot, so bid, ask and depth are consistent.
export function quoteFromBook(book: OrderBook): Quote {
  const bestBid = book.bids[0] ?? null;
  const bestAsk = book.asks[0] ?? null;
  const thin: ThinReason[] = [];
  if (bestBid === null) thin.push("no_bids");
  if (bestAsk === null) thin.push("no_asks");
  let spreadMicro: bigint | null = null;
  let midMicro: bigint | null = null;
  if (bestBid !== null && bestAsk !== null) {
    if (bestBid.priceMicro >= bestAsk.priceMicro) {
      thin.push("crossed");
    } else {
      spreadMicro = bestAsk.priceMicro - bestBid.priceMicro;
      midMicro = midpointMicro(bestBid.priceMicro, bestAsk.priceMicro);
      if (spreadMicro > WIDE_SPREAD_MICRO) thin.push("wide_spread");
    }
  }
  const sum = (levels: readonly BookLevel[]) => levels.reduce((total, level) => total + level.sizeMicro, 0n);
  return {
    tokenId: book.tokenId,
    conditionId: book.conditionId,
    timestampMs: book.timestampMs,
    bestBid,
    bestAsk,
    spreadMicro,
    midMicro,
    bidDepthMicro: sum(book.bids),
    askDepthMicro: sum(book.asks),
    thin,
    lastTradePriceMicro: book.lastTradePriceMicro,
  };
}

// {"price":"0.105"}. "0.000" means the side is empty, so it maps to null and never to a price.
function decodePrice(value: unknown): bigint | null {
  const rec = asRec(value, "price");
  const price = parseDecimalToMicro(field(rec, "price"));
  if (price === null || price >= MICRO) throw new DecodeError("price.price", "expected a decimal price below 1");
  return price === 0n ? null : price;
}

function decodeLastTrade(value: unknown): LastTrade | null {
  const rec = asRec(value, "lastTrade");
  const side = field(rec, "side");
  // No trade yet: the API answers price "0.5" with an empty side. That 0.5 is a placeholder.
  if (side === "") return null;
  if (side !== "BUY" && side !== "SELL") throw new DecodeError("lastTrade.side", "expected BUY, SELL or an empty string");
  const price = parseDecimalToMicro(field(rec, "price"));
  if (price === null || price <= 0n || price >= MICRO) throw new DecodeError("lastTrade.price", "expected a decimal price between 0 and 1");
  return { priceMicro: price, side };
}

function decodeOrderbookMarket(value: unknown, requestedConditionId: string): OrderbookMarket {
  const rec = asRec(value, "market");
  const conditionId = conditionIdField(rec, "condition_id", "market");
  if (conditionId !== requestedConditionId) throw new DecodeError("market.condition_id", "does not match the request");
  const tokens = asArray(field(rec, "tokens"), "market.tokens", 4);
  if (tokens.length !== 2) throw new DecodeError("market.tokens", "expected exactly two tokens");
  let yes: string | null = null;
  let no: string | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const path = at("market.tokens", i);
    const token = asRec(tokens[i], path);
    const id = tokenIdField(field(token, "token_id"), at(path, "token_id"));
    const label = field(token, "outcome");
    if (label === "Yes" && yes === null) yes = id;
    else if (label === "No" && no === null) no = id;
    else throw new DecodeError(at(path, "outcome"), "expected one Yes and one No token");
  }
  if (yes === null || no === null || yes === no) throw new DecodeError("market.tokens", "expected distinct Yes and No tokens");
  return { conditionId, yesTokenId: yes, noTokenId: no, active: reqBool(rec, "active", "market") };
}

function decodeFeeRate(value: unknown): number {
  const rec = asRec(value, "feeRate");
  const bps = field(rec, "base_fee");
  if (typeof bps !== "number" || !Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
    throw new DecodeError("feeRate.base_fee", "expected an integer from 0 to 10000");
  }
  return bps;
}

function decodeTradingState(value: unknown): TradingState {
  const rec = asRec(value, "tradingState");
  const state = reqString(rec, "state", "tradingState", 64);
  return state === "active" || state === "paused" ? { state } : { state: "unknown", raw: untrusted(state) };
}

function decodeBalanceAllowance(value: unknown): BalanceAllowance {
  const rec = asRec(value, "balance");
  const raw = field(rec, "smart_account");
  let smartAccount: string | null = null;
  if (raw !== undefined && raw !== null) {
    smartAccount = normalizeBareAddress(raw) ?? normalizeAddress(raw);
    if (smartAccount === null) throw new DecodeError("balance.smart_account", "expected a 40-digit hex address or null");
  }
  return {
    balanceMicro: microIntegerField(rec, "balance", "balance"),
    // See BalanceAllowance: kept raw, because what `allowance` means is not verified.
    allowanceMicro: microIntegerField(rec, "allowance", "balance"),
    smartAccount,
  };
}

function decodePositions(value: unknown): Positions {
  const rec = asRec(value, "positions");
  const items = asArray(field(rec, "positions"), "positions.positions", MAX_POSITIONS);
  const positions: Position[] = items.map((item, i) => {
    const path = at("positions.positions", i);
    const row = asRec(item, path);
    const balanceMicro = microIntegerField(row, "balance", path);
    const reservedMicro = microIntegerField(row, "reserved", path);
    if (reservedMicro > balanceMicro) throw new DecodeError(at(path, "reserved"), "exceeds balance");
    return { tokenId: tokenIdField(field(row, "token_id"), at(path, "token_id")), balanceMicro, reservedMicro, freeMicro: balanceMicro - reservedMicro };
  });
  // The response schema has no next_cursor. If one shows up anyway, say the list may be partial.
  const cursor = field(rec, "next_cursor");
  const truncated = typeof cursor === "string" && cursor !== "" && cursor !== END_OF_STREAM_CURSOR;
  return { cashBalanceMicro: microIntegerField(rec, "cash_balance", "positions"), positions, truncated };
}

function decodeClaimable(value: unknown): Claimable {
  const rec = asRec(value, "claimable");
  const address = normalizeAddress(field(rec, "address"));
  if (address === null) throw new DecodeError("claimable.address", "expected a 0x address");
  const items = asArray(field(rec, "claimable"), "claimable.claimable", MAX_POSITIONS);
  const claimable: ClaimableEntry[] = items.map((item, i) => {
    const path = at("claimable.claimable", i);
    const row = asRec(item, path);
    const outcome = field(row, "outcome");
    if (outcome !== "Yes" && outcome !== "No") throw new DecodeError(at(path, "outcome"), "expected Yes or No");
    const reasonRaw = reqString(row, "refund_reason", path, 64);
    const refundReason: RefundReason = reasonRaw === "resolved_winner" || reasonRaw === "voided_refund" ? reasonRaw : "unknown";
    return {
      conditionId: conditionIdField(row, "market_id", path),
      outcome,
      tokenId: tokenIdField(field(row, "token_id"), at(path, "token_id")),
      balanceMicro: microIntegerField(row, "balance", path),
      refundReason,
      refundReasonRaw: untrusted(reasonRaw),
    };
  });
  return { address, claimable };
}

function decodePortfolio(value: unknown): Extract<PortfolioResult, { status: "ok" }> {
  const rec = asRec(value, "portfolio");
  const meta = decodePageMeta(field(rec, "meta"), "portfolio.meta");
  const rows = asArray(field(rec, "data"), "portfolio.data", MAX_PORTFOLIO_ENTRIES);
  const entries: PortfolioEntry[] = [];
  const skipped: SkippedRow[] = [];
  rows.forEach((row, index) => {
    const path = at("portfolio.data", index);
    try {
      const entry = asRec(row, path);
      const statusRaw = reqString(entry, "status", path, 64);
      const positionsRaw = asArray(field(entry, "positions"), at(path, "positions"), 100);
      entries.push({
        conditionId: conditionIdField(entry, "contractMarketId", path),
        title: untrusted(reqString(entry, "title", path, 1000)),
        status: classifyStatus(statusRaw),
        statusRaw: untrusted(statusRaw),
        winningOutcomeId: optInt(entry, "winningOutcomeId", path),
        positions: positionsRaw.map((p, k) => {
          const ppath = at(at(path, "positions"), k);
          const position = asRec(p, ppath);
          const outcome = field(position, "outcome");
          const tokenRaw = isRec(outcome) ? field(outcome, "outcomeTokenId") : undefined;
          const titleRaw = isRec(outcome) ? lenientString(field(outcome, "title"), 500) : null;
          return {
            tokenId: isTokenId(tokenRaw) ? tokenRaw : null,
            outcomeTitle: titleRaw === null ? null : untrusted(titleRaw),
            // Micro-shares per the OpenAPI description; never observed populated.
            shareAmountMicro: microIntegerField(position, "shareAmount", ppath),
            hasClaimed: lenientBool(field(position, "hasClaimed")),
          };
        }),
      });
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      skipped.push({ index, reason: error.message });
    }
  });
  return { status: "ok", entries, meta, skipped };
}

// ---- input validation ----

function invalid(message: string): never {
  throw new XoError("invalid_input", message);
}

function checkPage(value: number | undefined): number {
  const page = value ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 10_000) invalid("page must be an integer from 1 to 10000");
  return page;
}

function checkTake(value: number | undefined): number {
  const take = value ?? DEFAULT_TAKE;
  if (!Number.isInteger(take) || take < 1 || take > MAX_TAKE) invalid(`take must be an integer from 1 to ${MAX_TAKE}`);
  return take;
}

function requireConditionId(value: string): string {
  return normalizeConditionId(value) ?? invalid("conditionId must be 0x followed by 64 hex digits");
}

function requireTokenId(value: string): string {
  return isTokenId(value) ? value : invalid("tokenId must be a decimal string");
}

function requireAddress(value: string): string {
  return normalizeAddress(value) ?? invalid("address must be 0x followed by 40 hex digits");
}

function buildListQuery(params: ListMarketsParams): { readonly query: URLSearchParams; readonly take: number } {
  const take = checkTake(params.take);
  const query = new URLSearchParams();
  // Types 2 (CLOB) and 4 (Conviction) only. The default scope hides every CLOB market, the
  // type-3 Pulse rounds (44,060 rows) flood the catalogue, and onlyClob excludes type 4.
  if (params.kind !== undefined && !(LIST_KINDS as readonly string[]).includes(params.kind)) invalid("unsupported kind filter");
  query.set("marketType", params.kind === "clob" ? "2" : params.kind === "conviction" ? "4" : "2,4");
  const statuses = params.statuses ?? ["ACTIVE"];
  if (statuses.length === 0) invalid("statuses must not be empty");
  for (const status of statuses) {
    if (!(LIST_STATUSES as readonly string[]).includes(status)) invalid("unsupported status filter");
  }
  query.set("statuses", [...new Set(statuses)].join(","));
  query.set("take", String(take));
  query.set("page", String(checkPage(params.page)));
  if (params.search !== undefined) {
    const search = params.search.trim();
    if (search.length === 0 || search.length > MAX_SEARCH_CHARS || /[\u0000-\u001f\u007f]/.test(search)) {
      invalid(`search must be 1 to ${MAX_SEARCH_CHARS} printable characters`);
    }
    query.set("search", search);
  }
  if (params.sortBy !== undefined) {
    if (!(LIST_SORT_FIELDS as readonly string[]).includes(params.sortBy)) invalid("unsupported sortBy");
    query.set("sortBy", params.sortBy);
  }
  if (params.sortOrder !== undefined) {
    if (params.sortOrder !== "ASC" && params.sortOrder !== "DESC") invalid("sortOrder must be ASC or DESC");
    query.set("sortOrder", params.sortOrder);
  }
  return { query, take };
}

// ---- client ----

export type XoClientOptions = HttpOptions;

export class XoClient {
  readonly http: XoHttp;

  constructor(options: XoClientOptions = {}) {
    this.http = new XoHttp(options);
  }

  private dataUrl(path: string, query?: URLSearchParams): URL {
    const url = new URL(`https://${XO_DATA_API_HOST}/api${path}`);
    if (query !== undefined) url.search = query.toString();
    return url;
  }

  private orderbookUrl(path: string, query?: Record<string, string>): URL {
    const url = new URL(`https://${XO_ORDERBOOK_HOST}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    return url;
  }

  private async fetchDecoded<T>(url: URL, decode: (json: unknown) => T): Promise<T> {
    const json = await this.http.getJson(url);
    try {
      return decode(json);
    } catch (error) {
      if (!(error instanceof DecodeError)) throw error;
      throw new XoError("invalid_response", `response failed validation at ${error.path}: ${error.problem}`, {
        host: url.hostname,
        path: url.pathname,
      });
    }
  }

  // ---- Data API: discovery ----

  // One page of ACTIVE (by default) CLOB and Conviction markets. Rows are display data: their
  // outcome prices are NOT quotes.
  async listMarkets(params: ListMarketsParams = {}): Promise<MarketPage> {
    const { query, take } = buildListQuery(params);
    return this.fetchDecoded(this.dataUrl("/markets", query), (json) => decodeMarketPage(json, take));
  }

  // Follows meta.hasNextPage and nothing else: a short page is not the last page, and itemCount
  // and pageCount are ignored. Stops after maxPages to bound upstream load.
  async listAllMarkets(params: ListAllMarketsParams = {}): Promise<MarketCollection> {
    const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) invalid("maxPages must be an integer from 1 to 50");
    const base: ListMarketsParams = {
      ...(params.take === undefined ? {} : { take: params.take }),
      ...(params.kind === undefined ? {} : { kind: params.kind }),
      ...(params.statuses === undefined ? {} : { statuses: params.statuses }),
      ...(params.search === undefined ? {} : { search: params.search }),
      ...(params.sortBy === undefined ? {} : { sortBy: params.sortBy }),
      ...(params.sortOrder === undefined ? {} : { sortOrder: params.sortOrder }),
    };
    const take = checkTake(params.take);
    const seen = new Set<string>();
    const markets: MarketSummary[] = [];
    const skipped: SkippedRow[] = [];
    let pagesFetched = 0;
    let exhausted = false;
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await this.listMarkets({ ...base, page });
      pagesFetched += 1;
      for (const market of result.markets) {
        // Rows can shift between pages while we read, so the same market may appear twice.
        if (seen.has(market.conditionId)) continue;
        seen.add(market.conditionId);
        markets.push(market);
      }
      skipped.push(...result.skipped.map((row) => ({ index: (page - 1) * take + row.index, reason: row.reason })));
      if (!result.meta.hasNextPage) {
        exhausted = true;
        break;
      }
    }
    return { markets, skipped, pagesFetched, exhausted };
  }

  // Title-only substring search over CLOB and Conviction markets.
  searchMarkets(query: string, params: Omit<ListMarketsParams, "search"> = {}): Promise<MarketPage> {
    return this.listMarkets({ ...params, search: query });
  }

  // ---- Data API: single market ----

  async getMarketByConditionId(conditionId: string): Promise<MarketDetail> {
    const id = requireConditionId(conditionId);
    const market = await this.fetchDecoded(this.dataUrl(`/markets/contract/${id}`), (json) => decodeMarketDetail(json));
    if (market.conditionId !== id) throw new XoError("invalid_response", "market conditionId does not match the request");
    return market;
  }

  async getMarketBySlug(slug: string): Promise<MarketDetail> {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(slug)) invalid("slug must be letters, digits, hyphens and underscores");
    return this.fetchDecoded(this.dataUrl(`/markets/slug/${encodeURIComponent(slug)}`), (json) => decodeMarketDetail(json));
  }

  async getMarketById(id: number): Promise<MarketDetail> {
    if (!Number.isSafeInteger(id) || id < 1) invalid("id must be a positive integer");
    const market = await this.fetchDecoded(this.dataUrl(`/markets/${id}`), (json) => decodeMarketDetail(json));
    if (market.id !== id) throw new XoError("invalid_response", "market id does not match the request");
    return market;
  }

  // 404 means the address has no XO profile. That is an answer, not an error.
  async getUserPortfolio(address: string, params: PortfolioParams = {}): Promise<PortfolioResult> {
    const user = requireAddress(address);
    const query = new URLSearchParams({ user, take: String(checkTake(params.take)), page: String(checkPage(params.page)) });
    if (params.marketScope !== undefined) query.set("marketScope", params.marketScope);
    try {
      return await this.fetchDecoded(this.dataUrl("/users/portfolio", query), decodePortfolio);
    } catch (error) {
      if (error instanceof XoError && error.kind === "not_found") return { status: "no_profile" };
      throw error;
    }
  }

  // ---- Orderbook ----

  async getTradingState(): Promise<TradingState> {
    return this.fetchDecoded(this.orderbookUrl("/trading-state"), decodeTradingState);
  }

  // Unix seconds, for clock-skew checks.
  async getServerTimeSeconds(): Promise<number> {
    return this.fetchDecoded(this.orderbookUrl("/time"), (json) => {
      if (typeof json !== "number" || !Number.isSafeInteger(json) || json <= 0) throw new DecodeError("time", "expected a positive integer");
      return json;
    });
  }

  async getOrderbookMarket(conditionId: string): Promise<OrderbookMarket> {
    const id = requireConditionId(conditionId);
    return this.fetchDecoded(this.orderbookUrl(`/markets/${id}`), (json) => decodeOrderbookMarket(json, id));
  }

  // 404 (not_found) means no book exists: closed, resolved or unknown token.
  async getBook(tokenId: string): Promise<OrderBook> {
    const id = requireTokenId(tokenId);
    return this.fetchDecoded(this.orderbookUrl("/book", { token_id: id }), (json) => decodeBook(json, id));
  }

  async getQuote(tokenId: string): Promise<Quote> {
    return quoteFromBook(await this.getBook(tokenId));
  }

  // GET /price?side=BUY is the best BID. Null when that side of the book is empty.
  async getBestBid(tokenId: string): Promise<bigint | null> {
    const id = requireTokenId(tokenId);
    return this.fetchDecoded(this.orderbookUrl("/price", { token_id: id, side: "BUY" }), decodePrice);
  }

  // GET /price?side=SELL is the best ASK. Null when that side of the book is empty.
  async getBestAsk(tokenId: string): Promise<bigint | null> {
    const id = requireTokenId(tokenId);
    return this.fetchDecoded(this.orderbookUrl("/price", { token_id: id, side: "SELL" }), decodePrice);
  }

  async getLastTrade(tokenId: string): Promise<LastTrade | null> {
    const id = requireTokenId(tokenId);
    return this.fetchDecoded(this.orderbookUrl("/last-trade-price", { token_id: id }), decodeLastTrade);
  }

  // Unreliable on its own: returns 0 for every token. Use getFeeAssessment.
  async getFeeRateBps(tokenId: string): Promise<number> {
    const id = requireTokenId(tokenId);
    return this.fetchDecoded(this.orderbookUrl("/fee-rate", { token_id: id }), decodeFeeRate);
  }

  // ---- Orderbook: accounts (public by address) ----
  // These answer 200 for ANY address, so a caller that accepts an arbitrary address can profile
  // other people. Whether an owner EOA resolves to its smart account is unverified.

  async getBalanceAllowance(address: string): Promise<BalanceAllowance> {
    return this.fetchDecoded(this.orderbookUrl("/balance-allowance", { address: requireAddress(address) }), decodeBalanceAllowance);
  }

  // Micro-shares. Not pageable: see Positions.truncated.
  async getPositions(address: string): Promise<Positions> {
    return this.fetchDecoded(this.orderbookUrl("/positions", { address: requireAddress(address) }), decodePositions);
  }

  async getClaimable(address: string): Promise<Claimable> {
    return this.fetchDecoded(this.orderbookUrl("/claimable", { address: requireAddress(address) }), decodeClaimable);
  }

  // ---- composites ----

  // Data API detail plus orderbook market, cross-checked: the Yes slot must be the orderbook's
  // Yes token and the No slot its No token. Anything else fails closed.
  async getMarketWithTokens(conditionId: string): Promise<MarketWithTokens> {
    const id = requireConditionId(conditionId);
    const [market, orderbook] = await Promise.all([this.getMarketByConditionId(id), this.getOrderbookMarket(id)]);
    if (market.outcomes[0].tokenId !== orderbook.yesTokenId || market.outcomes[1].tokenId !== orderbook.noTokenId) {
      throw new XoError("invalid_response", "Data API outcome tokens do not match the orderbook Yes/No tokens");
    }
    return { market, orderbook };
  }

  // effectiveFeeConfig from the Data API plus /fee-rate for both tokens, resolved fail-closed.
  // A failed /fee-rate call degrades to effective_only instead of failing the assessment.
  async getFeeAssessment(conditionId: string): Promise<FeeAssessment & { readonly market: MarketWithTokens }> {
    const market = await this.getMarketWithTokens(conditionId);
    const rates: number[] = [];
    for (const tokenId of [market.orderbook.yesTokenId, market.orderbook.noTokenId]) {
      try {
        rates.push(await this.getFeeRateBps(tokenId));
      } catch (error) {
        // Only upstream trouble degrades the assessment; our own limits and bad input do not.
        if (!(error instanceof XoError) || error.kind === "blocked" || error.kind === "invalid_input") throw error;
      }
    }
    return { ...resolveTakerFee({ effective: market.market.effectiveFeeConfig, feeRateBps: rates }), market };
  }
}
