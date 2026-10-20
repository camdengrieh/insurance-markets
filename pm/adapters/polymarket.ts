// Polymarket (global) read adapter: Gamma for market metadata, the CLOB for books and per-market
// parameters. Public reads only; no auth, no POST. Facts encoded here (docs/research/08 sections
// 2.2 to 2.10 and its Verification section, which overrides the body):
//
//   - marketId is the conditionId. Outcome token ids come from `clobTokenIds` when the market's
//     `version` is "v1" and from `positionIds` when it is "v2", never from whichever is present.
//     A market with a missing or unknown version fails closed.
//   - `outcomes` and `clobTokenIds` arrive as JSON text. Outcomes are not always Yes/No (48 of
//     100 sampled), so roles are assigned only to exact "Yes"/"No" labels and everything else is a
//     plain label; matching is by index, never by title.
//   - Books: CLOB `GET /book?token_id=`; the best level is LAST in both arrays, and the code
//     re-sorts anyway. `/price`, `outcomePrices`, `lastTradePrice` and the book's embedded
//     last_trade_price are never used. GET batch routes returned 400 live and the POST variants
//     are untested, so books are fetched one token at a time.
//   - Fees: Gamma `feesEnabled` + `feeSchedule` per market (the docs table is only a default),
//     cross-checked with the CLOB `fd` block; if they differ the larger rate is used and the
//     market carries a warning. `/fee-rate` and mbf/tbf are legacy signing fields and are ignored.
//     takerOnly must be true; anything else is an unknown fee.
//   - Resolution: UMA proposal or dispute flags make a market non-tradable here, and "closed is
//     false and acceptingOrders" is not treated as proof the question is open.
//
// Unverified: the V2 position-id path (no v2 market was in the samples), and the filter encoding
// of `GET /markets?condition_ids=` (the slug route is the verified one and is preferred).

import { normalizeSortedBook, type RawSidedBook } from "../core/books.js";
import { unknownFeeSpec, polymarketFeeSpec, type FeeSource } from "../core/fee-specs.js";
import { cmp, ratFromDec } from "../core/rational.js";
import type {
  AdapterError,
  Book,
  BookLevel,
  Dec,
  FeeSpec,
  Market,
  MarketRef,
  MarketSummary,
  OutcomeRef,
  Result,
  Status,
  TokenRef,
} from "../types.js";
import { untrusted } from "../types.js";
import { AdapterFailure, toAdapterFailure } from "./errors.js";
import { adapterDescriptor, POLYMARKET_HOSTS } from "./policy.js";
import { buildRules } from "./rules.js";
import { buildUrl, createJsonTransport, type JsonTransport, type TransportOptions } from "./transport.js";
import { ADAPTER_VERSION, type AdapterMarket, type PmPage, type PmVenueAdapter, type RuleFields } from "./types.js";
import {
  bool,
  conditionIdText,
  decOf,
  get,
  intText,
  isRec,
  isoUtc,
  jsonTextStrings,
  shapeHash,
  shortText,
  str,
  tokenIdText,
  type Rec,
} from "./values.js";

const GAMMA = "gamma-api.polymarket.com";
const CLOB = "clob.polymarket.com";
const MAX_LEVELS = 5000;
const FEE_TTL_SEC = 300;
const KEYSET_MAX = 100;

export interface PolymarketAdapterOptions {
  readonly http?: TransportOptions;
  readonly transport?: JsonTransport;
  readonly nowMs?: () => number;
}

// ---- Gamma market ----

interface GammaMarket {
  readonly raw: Rec;
  readonly conditionId: string;
  readonly question: string;
  readonly slug: string | null;
  readonly gammaId: string | null;
  readonly version: "v1" | "v2";
  readonly outcomes: readonly string[];
  readonly tokenIds: readonly string[];
  readonly active: boolean | null;
  readonly closed: boolean | null;
  readonly archived: boolean | null;
  readonly acceptingOrders: boolean | null;
  readonly enableOrderBook: boolean | null;
}

// Throws SCHEMA_DRIFT on any shape the adapter does not understand.
function parseGamma(value: unknown): GammaMarket {
  if (!isRec(value)) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma market is not an object");
  const conditionId = conditionIdText(get(value, "conditionId"));
  if (conditionId === null) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma market.conditionId is not a condition id");
  const question = str(value, "question", 2000);
  if (question === null) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma market.question is missing");
  const version = get(value, "version");
  if (version !== "v1" && version !== "v2") {
    throw new AdapterFailure("SCHEMA_DRIFT", "Gamma market.version is missing or unknown; token ids cannot be chosen");
  }
  const outcomes = jsonTextStrings(get(value, "outcomes"), 8, 200);
  if (outcomes === null || outcomes.length !== 2) {
    throw new AdapterFailure("SCHEMA_DRIFT", "Gamma market.outcomes is not a two-item list");
  }
  const idsRaw = version === "v1" ? jsonTextStrings(get(value, "clobTokenIds"), 8, 100) : jsonTextStrings(get(value, "positionIds"), 8, 100);
  const field = version === "v1" ? "clobTokenIds" : "positionIds";
  if (idsRaw === null || idsRaw.length !== outcomes.length) {
    throw new AdapterFailure("SCHEMA_DRIFT", `Gamma market.${field} does not match outcomes`);
  }
  const tokenIds: string[] = [];
  for (const id of idsRaw) {
    const t = tokenIdText(id);
    if (t === null) throw new AdapterFailure("SCHEMA_DRIFT", `Gamma market.${field} holds a non-numeric id`);
    tokenIds.push(t);
  }
  if (new Set(tokenIds).size !== tokenIds.length) throw new AdapterFailure("SCHEMA_DRIFT", `Gamma market.${field} repeats an id`);
  const gammaId = intText(get(value, "id"));
  return {
    raw: value,
    conditionId,
    question,
    slug: ((): string | null => {
      const s = str(value, "slug", 300);
      return s !== null && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(s) ? s : null;
    })(),
    gammaId,
    version,
    outcomes,
    tokenIds,
    active: bool(value, "active"),
    closed: bool(value, "closed"),
    archived: bool(value, "archived"),
    acceptingOrders: bool(value, "acceptingOrders"),
    enableOrderBook: bool(value, "enableOrderBook"),
  };
}

// UMA resolution flags: `umaResolutionStatus` (string or null) plus `umaResolutionStatuses`
// (JSON text list). Known values map to a state; an unrecognised value is "unrecognised".
type Uma = "none" | "proposed" | "disputed" | "resolved" | "unrecognised";

function umaState(raw: Rec): Uma {
  const values: string[] = [];
  const single = get(raw, "umaResolutionStatus");
  if (typeof single === "string" && single !== "") values.push(single);
  else if (single !== undefined && single !== null && typeof single !== "string") return "unrecognised";
  const many = get(raw, "umaResolutionStatuses");
  if (many !== undefined && many !== null && many !== "") {
    const list = jsonTextStrings(many, 64, 64);
    if (list === null) return "unrecognised";
    values.push(...list.filter((v) => v !== ""));
  }
  if (values.length === 0) return "none";
  let best: Uma = "none";
  const rank: Record<Uma, number> = { none: 0, resolved: 1, proposed: 2, disputed: 3, unrecognised: 4 };
  for (const v of values) {
    const state: Uma = v === "proposed" || v === "disputed" || v === "resolved" ? v : "unrecognised";
    if (rank[state] > rank[best]) best = state;
  }
  return best;
}

export function polymarketStatus(g: GammaMarket): { status: Status; reasons: string[] } {
  const reasons: string[] = [];
  const uma = umaState(g.raw);
  if (uma === "unrecognised") reasons.push("uma_status_unrecognised");
  if (g.archived === true || g.closed === true) {
    return { status: uma === "resolved" ? "resolved" : uma === "unrecognised" ? "unknown" : "closed", reasons: [...reasons, "market_closed"] };
  }
  if (g.active !== true) return { status: "unknown", reasons: [...reasons, "market_not_active"] };
  if (uma === "disputed") return { status: "disputed", reasons: [...reasons, "uma_disputed"] };
  if (uma === "proposed") return { status: "determined", reasons: [...reasons, "uma_proposed"] };
  if (uma === "resolved") return { status: "resolved", reasons: [...reasons, "uma_resolved"] };
  if (uma === "unrecognised") return { status: "unknown", reasons };
  if (g.acceptingOrders === false) return { status: "paused", reasons: [...reasons, "not_accepting_orders"] };
  if (g.acceptingOrders === null) reasons.push("accepting_orders_unknown");
  if (g.enableOrderBook === false) reasons.push("orderbook_disabled");
  return { status: "active", reasons };
}

// ---- CLOB market info ----

interface ClobInfo {
  readonly tokens: ReadonlyArray<{ readonly id: string; readonly outcome: string }>;
  readonly tick: Dec | null;
  readonly minSize: Dec | null;
  readonly acceptingOrders: boolean | null;
  readonly fee: { readonly rate: Dec | null; readonly exponent: Dec | null; readonly takerOnly: boolean | null } | null;
}

function parseClob(value: unknown, conditionId: string): ClobInfo {
  if (!isRec(value)) throw new AdapterFailure("SCHEMA_DRIFT", "CLOB market info is not an object");
  const c = get(value, "c");
  if (c !== undefined && conditionIdText(c) !== conditionId) {
    throw new AdapterFailure("SCHEMA_DRIFT", "CLOB market info belongs to another condition");
  }
  const tokens: Array<{ id: string; outcome: string }> = [];
  const t = get(value, "t");
  if (!Array.isArray(t) || t.length > 8) throw new AdapterFailure("SCHEMA_DRIFT", "CLOB market info has no token list");
  for (const item of t as unknown[]) {
    const id = isRec(item) ? tokenIdText(get(item, "t")) : null;
    const outcome = isRec(item) ? str(item, "o", 200) : null;
    if (id === null || outcome === null) throw new AdapterFailure("SCHEMA_DRIFT", "CLOB market info token entry is malformed");
    tokens.push({ id, outcome });
  }
  const fd = get(value, "fd");
  const fee = isRec(fd) ? { rate: decOf(get(fd, "r")), exponent: decOf(get(fd, "e")), takerOnly: bool(fd, "to") } : null;
  return {
    tokens,
    tick: decOf(get(value, "mts")),
    minSize: decOf(get(value, "mos")),
    acceptingOrders: bool(value, "ao"),
    fee,
  };
}

// Per-index confirmation that Gamma's ids and labels agree with the CLOB's. A mismatch means one
// of the two is stale or the version rule is wrong, and a wrong-way outcome mapping would flip
// every price, so the market is refused.
function crossCheckTokens(g: GammaMarket, clob: ClobInfo): void {
  g.tokenIds.forEach((id, i) => {
    const entry = clob.tokens.find((x) => x.id === id);
    if (entry === undefined) {
      throw new AdapterFailure(
        "SCHEMA_DRIFT",
        g.version === "v1"
          ? "Gamma clobTokenIds are not the CLOB token ids"
          : "v2 positionIds could not be confirmed against the CLOB (unexercised path)",
      );
    }
    if (entry.outcome !== g.outcomes[i]) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma and CLOB disagree on outcome order");
  });
}

// ---- fee ----

function sourceFor(g: GammaMarket, now: number): FeeSource {
  const feeType = shortText(get(g.raw, "feeType"), 64);
  const clean = feeType !== null && /^[a-z0-9_]{1,64}$/.test(feeType) ? `;feeType=${feeType}` : "";
  return {
    url: `https://${GAMMA}/markets`,
    field: `feeSchedule${clean}`,
    granularity: "market",
    verifiedAt: new Date(now).toISOString(),
    ttlSec: FEE_TTL_SEC,
  };
}

function buildFee(g: GammaMarket, clob: ClobInfo | null, now: number): { spec: FeeSpec; warnings: string[] } {
  const source = sourceFor(g, now);
  const warnings: string[] = [];
  const enabled = bool(g.raw, "feesEnabled");
  const schedule = get(g.raw, "feeSchedule");
  const candidates: Array<{ rate: Dec; exponent: Dec | null; takerOnly: boolean | null; from: string }> = [];
  if (enabled === false) {
    candidates.push({ rate: "0", exponent: null, takerOnly: true, from: "gamma" });
  } else if (enabled === true && isRec(schedule)) {
    const rate = decOf(get(schedule, "rate"));
    if (rate !== null) candidates.push({ rate, exponent: decOf(get(schedule, "exponent")), takerOnly: bool(schedule, "takerOnly"), from: "gamma" });
  }
  if (clob?.fee != null && clob.fee.rate !== null) {
    candidates.push({ rate: clob.fee.rate, exponent: clob.fee.exponent, takerOnly: clob.fee.takerOnly, from: "clob" });
  }
  if (candidates.length === 0) return { spec: unknownFeeSpec("polymarket", source), warnings: ["Polymarket fee is unknown; no net figure can be computed"] };
  if (candidates.some((c) => c.takerOnly === false)) {
    return { spec: unknownFeeSpec("polymarket", source), warnings: ["Polymarket fee is not taker-only; the fee model does not cover it"] };
  }
  // Most conservative figure when the two sources differ.
  let top = candidates[0];
  if (top === undefined) return { spec: unknownFeeSpec("polymarket", source), warnings };
  for (const c of candidates) {
    const a = ratFromDec(c.rate);
    const b = ratFromDec(top.rate);
    if (a.ok && b.ok && cmp(a.value, b.value) > 0) top = c;
  }
  if (candidates.some((c) => c.rate !== top?.rate)) warnings.push("Polymarket Gamma and CLOB fee rates differ; the larger rate is used");
  const exponent = top.exponent ?? candidates.find((c) => c.exponent !== null)?.exponent ?? null;
  return { spec: polymarketFeeSpec({ rate: top.rate, ...(exponent === null ? {} : { exponent }), source }), warnings };
}

// ---- adapter ----

export function createPolymarketAdapter(options: PolymarketAdapterOptions = {}): PmVenueAdapter {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport ?? createJsonTransport(POLYMARKET_HOSTS, options.http);

  async function fetchGamma(ref: MarketRef): Promise<unknown> {
    const slug = ref.native["slug"];
    if (slug !== undefined && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(slug)) {
      return transport.getJson(buildUrl(GAMMA, "", ["markets", "slug", slug]));
    }
    const list = await transport.getJson(buildUrl(GAMMA, "", ["markets"], [["condition_ids", ref.marketId], ["limit", "1"]]));
    if (!Array.isArray(list)) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma market list is not an array");
    const hit = (list as unknown[]).find((m) => isRec(m) && conditionIdText(get(m, "conditionId")) === ref.marketId.toLowerCase());
    if (hit === undefined) throw new AdapterFailure("NOT_FOUND", "no Gamma market for this condition");
    return hit;
  }

  async function load(ref: MarketRef): Promise<AdapterMarket> {
    if (ref.venue !== "polymarket") throw new AdapterFailure("NOT_SUPPORTED", "market belongs to another venue");
    const wanted = conditionIdText(ref.marketId);
    if (wanted === null) throw new AdapterFailure("NOT_FOUND", "Polymarket marketId must be a conditionId");
    const gammaJson = await fetchGamma({ ...ref, marketId: wanted });
    const g = parseGamma(gammaJson);
    if (g.conditionId !== wanted) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma returned a different condition");
    let clob: ClobInfo | null = null;
    let clobJson: unknown;
    const reasons: string[] = [];
    try {
      clobJson = await transport.getJson(buildUrl(CLOB, "", ["clob-markets", wanted]));
      clob = parseClob(clobJson, wanted);
    } catch (error) {
      const failure = toAdapterFailure(error);
      if (failure.code !== "NOT_FOUND") throw failure;
      reasons.push("clob_market_missing");
    }
    if (clob !== null) crossCheckTokens(g, clob);
    const now = nowMs();
    const state = polymarketStatus(g);
    if (state.status !== "active") reasons.push(`status_${state.status}`);
    for (const r of state.reasons) if (!reasons.includes(r)) reasons.push(r);
    if (clob?.acceptingOrders === false && !reasons.includes("not_accepting_orders")) reasons.push("not_accepting_orders");

    const warnings: string[] = [];
    if (g.version === "v2") warnings.push("v2 position-id path is unexercised against live data");
    const fee = buildFee(g, clob, now);
    warnings.push(...fee.warnings);

    const outcomes: OutcomeRef[] = g.outcomes.map((label, index) => ({
      index,
      role: label === "Yes" ? "yes" : label === "No" ? "no" : "label",
      label: untrusted(label),
      tokenId: g.tokenIds[index] ?? "",
    }));
    // Exactly one Yes and one No, or no roles at all.
    const roles = outcomes.map((o) => o.role);
    const normalisedOutcomes = roles.includes("yes") && roles.includes("no") ? outcomes : outcomes.map((o) => ({ ...o, role: "label" as const }));

    const description = get(g.raw, "description");
    const resolutionSource = get(g.raw, "resolutionSource");
    const endDateRaw = get(g.raw, "endDate");
    const ruleFields: RuleFields = {
      ...(typeof description === "string" ? { description } : {}),
      resolutionSource: typeof resolutionSource === "string" ? resolutionSource : null,
      ...(typeof endDateRaw === "string" ? { endDate: endDateRaw } : {}),
    };
    const sources = typeof resolutionSource === "string" && resolutionSource !== "" ? [resolutionSource.slice(0, 300)] : [];
    const closesAt = isoUtc(endDateRaw);
    const opensAt = isoUtc(get(g.raw, "startDate"));
    const resolvedBy = str(g.raw, "resolvedBy", 100);
    const hasUma = get(g.raw, "umaBond") !== undefined;
    const built = buildRules({
      venue: "polymarket",
      marketId: g.conditionId,
      displayText: typeof description === "string" ? description : "",
      ruleFields,
      sources,
      mechanism: hasUma ? "uma_oo" : "unknown",
      ...(resolvedBy !== null && /^0x[0-9a-fA-F]{40}$/.test(resolvedBy) ? { resolver: resolvedBy.toLowerCase() } : {}),
      ...(closesAt === null ? {} : { cutoffUtc: closesAt }),
      void: hasUma ? "fifty_fifty" : "unknown",
    });
    if (!built.hashed) {
      reasons.push("rules_unavailable");
      warnings.push(built.hashProblem ?? "rules not hashable");
    }

    const tick = clob?.tick ?? decOf(get(g.raw, "orderPriceMinTickSize"));
    if (tick === null) throw new AdapterFailure("SCHEMA_DRIFT", "tick size is missing from both Gamma and the CLOB");
    const minSize = clob?.minSize ?? decOf(get(g.raw, "orderMinSize"));

    const negRisk = bool(g.raw, "negRisk") === true;
    const negRiskId = conditionIdText(get(g.raw, "negRiskMarketID"));
    const events = get(g.raw, "events");
    const event0 = Array.isArray(events) && isRec(events[0]) ? events[0] : null;
    const eventSlug = event0 === null ? null : str(event0, "slug", 200);
    const native: Record<string, string> = {};
    if (g.slug !== null) native["slug"] = g.slug;
    if (g.gammaId !== null) native["gammaId"] = g.gammaId;
    if (eventSlug !== null) native["eventSlug"] = eventSlug;
    if (negRiskId !== null) native["negRiskMarketID"] = negRiskId;
    native["version"] = g.version;

    const statusRaw = state.status;
    return {
      ref: { venue: "polymarket", marketId: g.conditionId, native },
      title: untrusted(g.question),
      outcomes: normalisedOutcomes,
      rules: built.rules,
      status: state.status,
      tradable: { ok: reasons.length === 0, reasons },
      timesUtc: { ...(opensAt === null ? {} : { opensAt }), ...(closesAt === null ? {} : { closesAt }) },
      tick,
      ...(minSize === null ? {} : { minSize }),
      collateral: { symbol: "pUSD", chain: "eip155:137", decimals: 6, custody: "self" },
      // Neg-risk groups are at-most-one-Yes sets; whether the named outcomes are exhaustive
      // (augmented "Other") is a human-reviewed link property, so it is left unknown here.
      ...(negRisk && negRiskId !== null ? { group: { key: negRiskId, kind: "neg_risk" as const, exhaustive: "unknown" as const } } : {}),
      fee: fee.spec,
      prov: {
        fetchedAtMs: now,
        source: `https://${GAMMA}/markets`,
        adapterVersion: ADAPTER_VERSION,
        schemaHash: shapeHash(gammaJson, clobJson),
      },
      extras: {
        ruleFields,
        rulesHashRecipe: built.rulesHashRecipe,
        coreRulesSha256: built.coreRulesSha256,
        statusRaw: untrusted(`closed=${String(g.closed)};active=${String(g.active)};uma=${umaState(g.raw)};state=${statusRaw}`),
        geoRestricted: bool(g.raw, "restricted"),
        warnings,
      },
    };
  }

  function summaryOf(value: unknown): MarketSummary | null {
    let g: GammaMarket;
    try {
      g = parseGamma(value);
    } catch {
      return null;
    }
    const native: Record<string, string> = { version: g.version };
    if (g.slug !== null) native["slug"] = g.slug;
    if (g.gammaId !== null) native["gammaId"] = g.gammaId;
    const closesAt = isoUtc(get(g.raw, "endDate"));
    return {
      ref: { venue: "polymarket", marketId: g.conditionId, native },
      title: untrusted(g.question),
      status: polymarketStatus(g).status,
      ...(closesAt === null ? {} : { closesAt }),
    };
  }

  return {
    id: "polymarket",
    descriptor: adapterDescriptor("polymarket", nowMs()),
    caps: {
      listMarkets: true,
      search: true,
      getMarket: true,
      getBook: true,
      // GET batch routes returned 400 live; the documented POST variants are untested.
      getBooksBatch: false,
      getFeeSpec: true,
      getResolution: true,
      getPositionsByAddress: false,
      stream: false,
    },

    async listMarkets(q): Promise<PmPage<MarketSummary>> {
      const limit = Math.min(Math.max(q.limit ?? 50, 1), KEYSET_MAX);
      const OPEN: Status[] = ["pending", "active", "paused", "determined", "disputed", "unknown"];
      const CLOSED: Status[] = ["closed", "resolved", "voided"];
      const wantsOpen = q.statuses === undefined || q.statuses.some((s) => OPEN.includes(s));
      const wantsClosed = q.statuses !== undefined && q.statuses.some((s) => CLOSED.includes(s));
      let body: unknown;
      let rows: unknown[];
      let hasNext: boolean;
      let nextCursor: string | undefined;
      if (q.text !== undefined) {
        const page = q.cursor === undefined ? 1 : Number(q.cursor);
        if (!Number.isInteger(page) || page < 1 || page > 1000) throw new AdapterFailure("NOT_SUPPORTED", "cursor is not a page number");
        body = await transport.getJson(
          buildUrl(GAMMA, "", ["public-search"], [["q", q.text.slice(0, 200)], ["limit_per_type", String(Math.min(limit, 25))], ["page", String(page)]]),
        );
        if (!isRec(body) || !Array.isArray(get(body, "events"))) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma search response has no events list");
        rows = [];
        for (const ev of get(body, "events") as unknown[]) {
          const inner = isRec(ev) ? get(ev, "markets") : undefined;
          if (Array.isArray(inner)) rows.push(...(inner as unknown[]));
        }
        const pagination = get(body, "pagination");
        hasNext = isRec(pagination) && get(pagination, "hasMore") === true;
        nextCursor = hasNext ? String(page + 1) : undefined;
      } else {
        const query: Array<readonly [string, string]> = [["limit", String(limit)]];
        if (wantsOpen && !wantsClosed) query.push(["closed", "false"]);
        else if (wantsClosed && !wantsOpen) query.push(["closed", "true"]);
        if (q.cursor !== undefined) {
          if (!/^[A-Za-z0-9_\-=.]{1,2000}$/.test(q.cursor)) throw new AdapterFailure("NOT_SUPPORTED", "cursor has unexpected characters");
          query.push(["after_cursor", q.cursor]);
        }
        body = await transport.getJson(buildUrl(GAMMA, "", ["markets", "keyset"], query));
        if (!isRec(body) || !Array.isArray(get(body, "markets"))) throw new AdapterFailure("SCHEMA_DRIFT", "Gamma keyset response has no markets list");
        rows = get(body, "markets") as unknown[];
        const next = get(body, "next_cursor");
        hasNext = typeof next === "string" && next !== "";
        nextCursor = hasNext ? (next as string) : undefined;
      }
      const items: MarketSummary[] = [];
      const skipped: Array<{ index: number; reason: string }> = [];
      rows.forEach((row, index) => {
        const s = summaryOf(row);
        if (s === null) skipped.push({ index, reason: "row is not a recognisable Gamma market" });
        else items.push(s);
      });
      const wanted = q.statuses === undefined ? null : new Set<Status>(q.statuses);
      return {
        items: wanted === null ? items : items.filter((m) => wanted.has(m.status)),
        hasNext,
        ...(nextCursor === undefined ? {} : { nextCursor }),
        skipped,
      };
    },

    getMarket: load,

    async getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>> {
      const started = nowMs();
      const out: Array<Result<Book, AdapterError>> = [];
      for (const token of tokens) {
        if (token.venue !== "polymarket" || tokenIdText(token.tokenId) === null) {
          out.push({ ok: false, error: "NOT_SUPPORTED", detail: "not a Polymarket token id" });
          continue;
        }
        if (nowMs() - started >= opts.deadlineMs) {
          out.push({ ok: false, error: "TIMEOUT", detail: "call budget spent before this book was read" });
          continue;
        }
        try {
          const json = await transport.getJson(buildUrl(CLOB, "", ["book"], [["token_id", token.tokenId]]));
          out.push(parseBook(json, token, nowMs()));
        } catch (error) {
          const failure = toAdapterFailure(error);
          out.push({ ok: false, error: failure.code, detail: failure.detail });
        }
      }
      return out;
    },

    async getFeeSpec(m: Market): Promise<FeeSpec> {
      return (await load(m.ref)).fee;
    },

    async health(): Promise<{ ok: boolean; notes: string[] }> {
      const notes: string[] = [];
      let ok = true;
      try {
        const t = await transport.getJson(buildUrl(CLOB, "", ["time"]));
        if (typeof t !== "number" || !Number.isSafeInteger(t) || t <= 0) {
          ok = false;
          notes.push("CLOB /time did not return unix seconds");
        } else {
          notes.push("CLOB reachable");
        }
      } catch (error) {
        ok = false;
        notes.push(`CLOB health check failed: ${toAdapterFailure(error).code}`);
      }
      try {
        await transport.getJson(buildUrl(GAMMA, "", ["status"]));
        notes.push("Gamma reachable");
      } catch (error) {
        ok = false;
        notes.push(`Gamma health check failed: ${toAdapterFailure(error).code}`);
      }
      return { ok, notes };
    },
  };
}

function levels(value: unknown, side: string): BookLevel[] | null {
  if (!Array.isArray(value) || value.length > MAX_LEVELS) return null;
  const out: BookLevel[] = [];
  for (const item of value as unknown[]) {
    if (!isRec(item)) return null;
    const price = get(item, "price");
    const size = get(item, "size");
    if (typeof price !== "string" || typeof size !== "string") return null;
    out.push({ price, size });
  }
  void side;
  return out;
}

export function parseBook(json: unknown, token: TokenRef, asOfMs: number): Result<Book, AdapterError> {
  if (!isRec(json)) return { ok: false, error: "SCHEMA_DRIFT", detail: "book is not an object" };
  if (get(json, "asset_id") !== token.tokenId) return { ok: false, error: "SCHEMA_DRIFT", detail: "book.asset_id does not match the requested token" };
  const bids = levels(get(json, "bids"), "bids");
  const asks = levels(get(json, "asks"), "asks");
  if (bids === null || asks === null) return { ok: false, error: "SCHEMA_DRIFT", detail: "book levels are malformed or too many" };
  const ts = get(json, "timestamp");
  const venueTsMs = typeof ts === "string" && /^[0-9]{10,16}$/.test(ts) ? Number(ts) : undefined;
  const hash = str(json, "hash", 128);
  const raw: RawSidedBook = { bids, asks };
  const result = normalizeSortedBook(
    {
      token: { venue: "polymarket", tokenId: token.tokenId },
      asOfMs,
      ...(venueTsMs === undefined ? {} : { venueTsMs }),
      ...(hash === null ? {} : { hash }),
    },
    "best_last",
    raw,
  );
  return result.ok ? { ok: true, value: result.value.book } : { ok: false, error: result.error, detail: result.detail ?? "" };
}
