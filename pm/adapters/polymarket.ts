// Polymarket (global) read adapter for pm/: Gamma for market metadata, the CLOB for books and per-market
// parameters. Public reads only; no auth, no POST. This file owns the HTTP side (the fixed host list, the plugin
// User-Agent, the paging it asks for, the descriptor). EVERY parse goes through the one Polymarket parser set in
// sdk/venues/polymarket (the dApp reads with the same code) into the SDK read model; the FeeSpec the engine prices
// with is built with sdk/engine/fee-specs.ts from the fee the shared parser validated. What the shared parser enforces (docs/research/08
// sections 2.2 to 2.10 and its Verification section, which overrides the body):
//
//   - marketId is the conditionId. Outcome token ids come from `clobTokenIds` when the market's `version` is "v1"
//     and from `positionIds` when it is "v2", never from whichever is present; a missing or unknown version fails
//     closed. A market has exactly two outcomes; roles yes/no go only to the exact pair ["Yes", "No"].
//   - Books: CLOB `GET /book?token_id=`; the best level is LAST in both arrays and the parser re-sorts anyway.
//     A crossed book, a duplicate price level or a price outside (0, 1) is drift. `/price`, `outcomePrices`,
//     `lastTradePrice` and the book's embedded last_trade_price are never used. GET batch routes returned 400 live
//     and the POST variants are untested, so books are fetched one token at a time.
//   - Fees: Gamma `feesEnabled` + `feeSchedule` per market (the docs table is only a default), checked against the
//     CLOB `fd` block. If they differ the fee is UNKNOWN (no net figure) and the market carries a warning; the
//     curve must be exponent 1 and taker-only. `/fee-rate` and mbf/tbf are legacy signing fields and are ignored.
//   - Resolution: a UMA proposal or dispute makes a market non-tradable here, and "closed is false and
//     acceptingOrders" is not treated as proof the question is open.
//
// Unverified: the V2 position-id path (no v2 market was in the samples), and the filter encoding of
// `GET /markets?condition_ids=` (the slug route is the verified one and is preferred).

import {
  claimedConditionId,
  clobBookSchema,
  CONDITION_ID,
  crossCheckClobTokens,
  gammaFee,
  isTokenId,
  normalizeMarket,
  parseBook as parseSdkBook,
  parseClobMarketInfo,
  parseGammaMarket,
  parseKeysetPage,
  parseSearchPage,
  reconcileFees,
  resolutionSignal,
  statusOf,
  summarizeRow,
  tradableOf,
  type ClobMarketInfo,
  type GammaMarket,
  type NormalizeContext,
  type PolymarketFee,
} from "../../sdk/venues/polymarket/index.js";
import { polymarketFeeSpec, unknownFeeSpec, type FeeSource } from "../../sdk/engine/fee-specs.js";
import type { AdapterError, Book, FeeSpec, MarketRef, MarketSummary, Result, Status, TokenRef } from "../../sdk/model.js";
import { untrusted } from "../types.js";
import { AdapterFailure, toAdapterFailure } from "./errors.js";
import { adapterDescriptor, POLYMARKET_HOSTS } from "./policy.js";
import { buildUrl, createJsonTransport, type JsonTransport, type TransportOptions } from "./transport.js";
import type { AdapterMarket, PmPage, PmVenueAdapter, RuleFields } from "./types.js";

const GAMMA = "gamma-api.polymarket.com";
const CLOB = "clob.polymarket.com";
const GAMMA_MARKETS = `https://${GAMMA}/markets`;
const FEE_TTL_SEC = 300;
const KEYSET_MAX = 100;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
// The prov transport class of the shared read model: pm/ reads from its own process, with no credential (T1).
const TRANSPORT = "T1";

export interface PolymarketAdapterOptions {
  readonly http?: TransportOptions;
  readonly transport?: JsonTransport;
  readonly nowMs?: () => number;
}

function drift(detail: string): AdapterFailure {
  return new AdapterFailure("SCHEMA_DRIFT", detail);
}

function gammaOrThrow(value: unknown): GammaMarket {
  const parsed = parseGammaMarket(value);
  if (!parsed.ok) throw drift(`Gamma market: ${parsed.reason}`);
  return parsed.value;
}

// Status and the reasons a market is not tradable, from the shared parser (sdk/venues/polymarket normalize.ts
// statusOf and tradableOf). Takes the Gamma market JSON; a row the parser refuses is SCHEMA_DRIFT.
export function polymarketStatus(raw: unknown, nowMs: number): { status: Status; reasons: string[] } {
  const g = gammaOrThrow(raw);
  const status = statusOf(g, nowMs);
  return { status, reasons: tradableOf(g, status).reasons };
}

// ---- fee ----

function sourceFor(g: GammaMarket, now: number): FeeSource {
  const feeType = (g as Record<string, unknown>)["feeType"];
  const clean = typeof feeType === "string" && /^[a-z0-9_]{1,64}$/.test(feeType) ? `;feeType=${feeType}` : "";
  return {
    url: GAMMA_MARKETS,
    field: `feeSchedule${clean}`,
    granularity: "market",
    verifiedAt: new Date(now).toISOString(),
    ttlSec: FEE_TTL_SEC,
  };
}

function pmFeeSpec(fee: PolymarketFee, source: FeeSource): FeeSpec {
  if (!fee.known) return unknownFeeSpec("polymarket", source);
  return polymarketFeeSpec({ rate: fee.rate, ...(fee.exponent === null ? {} : { exponent: fee.exponent }), source });
}

// Gamma's fee alone when the CLOB has no record of the market; otherwise the two must agree (sdk reconcileFees).
function buildFee(g: GammaMarket, clob: ClobMarketInfo | null, now: number): { spec: FeeSpec; warnings: string[] } {
  const gamma = gammaFee(g.feesEnabled, g.feeSchedule ?? null);
  const reconciled = clob === null ? { fee: gamma, disagree: false } : reconcileFees(gamma, clob.fee);
  const warnings: string[] = [];
  if (reconciled.disagree) warnings.push("Polymarket Gamma and CLOB fee rates differ; the fee is unknown until they agree");
  else if (!reconciled.fee.known) warnings.push(`Polymarket fee is unknown (${reconciled.fee.reason}); no net figure can be computed`);
  return { spec: pmFeeSpec(reconciled.fee, sourceFor(g, now)), warnings };
}

// ---- books ----

export function parseBook(json: unknown, token: TokenRef, asOfMs: number): Result<Book, AdapterError> {
  const wire = clobBookSchema.safeParse(json);
  if (!wire.success) return { ok: false, error: "SCHEMA_DRIFT", detail: "book does not match the expected shape" };
  const parsed = parseSdkBook(wire.data, token.tokenId, asOfMs);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, detail: parsed.error === "EMPTY_BOOK" ? "book has no levels" : "book is for another token, malformed or crossed" };
  }
  // The shared parser has already re-sorted the levels; the convention names the raw payload's order.
  return { ok: true, value: { ...parsed.book, convention: "best_last" } };
}

// ---- adapter ----

export function createPolymarketAdapter(options: PolymarketAdapterOptions = {}): PmVenueAdapter {
  const nowMs = options.nowMs ?? Date.now;
  const transport = options.transport ?? createJsonTransport(POLYMARKET_HOSTS, options.http);

  const context = (source: string, now: number): NormalizeContext => ({ nowMs: now, transport: TRANSPORT, source });

  async function fetchGamma(ref: MarketRef): Promise<unknown> {
    const slug = ref.native["slug"];
    if (slug !== undefined && SLUG.test(slug)) {
      return transport.getJson(buildUrl(GAMMA, "", ["markets", "slug", slug]));
    }
    const list = await transport.getJson(buildUrl(GAMMA, "", ["markets"], [["condition_ids", ref.marketId], ["limit", "1"]]));
    if (!Array.isArray(list)) throw drift("Gamma market list is not an array");
    const hit = (list as unknown[]).find((m) => claimedConditionId(m) === ref.marketId);
    if (hit === undefined) throw new AdapterFailure("NOT_FOUND", "no Gamma market for this condition");
    return hit;
  }

  async function fetchClob(conditionId: string): Promise<ClobMarketInfo | null> {
    try {
      const parsed = parseClobMarketInfo(await transport.getJson(buildUrl(CLOB, "", ["clob-markets", conditionId])), conditionId);
      if (!parsed.ok) throw drift(`CLOB market info: ${parsed.reason}`);
      return parsed.info;
    } catch (error) {
      const failure = toAdapterFailure(error);
      if (failure.code !== "NOT_FOUND") throw failure;
      return null;
    }
  }

  async function load(ref: MarketRef): Promise<AdapterMarket> {
    if (ref.venue !== "polymarket") throw new AdapterFailure("NOT_SUPPORTED", "market belongs to another venue");
    if (!CONDITION_ID.test(ref.marketId)) throw new AdapterFailure("NOT_FOUND", "Polymarket marketId must be a conditionId");
    const wanted = ref.marketId.toLowerCase();
    const g = gammaOrThrow(await fetchGamma({ ...ref, marketId: wanted }));
    if (g.conditionId.toLowerCase() !== wanted) throw drift("Gamma returned a different condition");
    const now = nowMs();
    const shared = normalizeMarket(g, context(GAMMA_MARKETS, now));
    if (!shared.ok) throw drift(`Gamma market: ${shared.reason}`);
    const market = shared.value;

    const clob = await fetchClob(wanted);
    if (clob !== null) {
      const problem = crossCheckClobTokens({ tokenIds: market.outcomes.map((o) => o.tokenId), labels: g.outcomes, ledger: market.ref.native["ledger"] }, clob);
      if (problem !== null) throw drift(problem);
    }

    const reasons = [...market.tradable.reasons];
    const add = (reason: string): void => {
      if (!reasons.includes(reason)) reasons.push(reason);
    };
    if (clob === null) add("clob_market_missing");
    if (clob?.acceptingOrders === false) add("not_accepting_orders");

    const warnings: string[] = [];
    if (g.version === "v2") warnings.push("v2 position-id path is unexercised against live data");
    const fee = buildFee(g, clob, now);
    warnings.push(...fee.warnings);

    // The fields the rules-v2 fingerprint covers, as the venue sent them; a key the venue did not send is left out so
    // pm/links/hash.ts reports MISSING_FIELD instead of hashing a silent gap.
    const ruleFields: RuleFields = {
      ...(typeof g.description === "string" ? { description: g.description } : {}),
      resolutionSource: typeof g.resolutionSource === "string" ? g.resolutionSource : null,
      ...(typeof g.endDate === "string" ? { endDate: g.endDate } : {}),
    };
    // The shared parser leaves the fingerprint empty when it cannot pin the rules; pm puts a non-hex sentinel that
    // embeds the market id there, so two markets with unavailable rules never compare equal (./rules.ts).
    const hashed = market.rules.sha256 !== "";
    if (!hashed) {
      add("rules_unavailable");
      warnings.push("rules not hashable (the market's own description or end date is missing)");
    }
    const rules = hashed ? market.rules : { ...market.rules, sha256: `unavailable:polymarket:${market.ref.marketId}` };

    const tick = clob?.tick ?? market.tick;
    const minSize = clob?.minSize ?? market.minSize;
    const status = market.status;
    return {
      ...market,
      rules,
      tradable: { ok: reasons.length === 0, reasons },
      tick,
      ...(minSize === undefined ? {} : { minSize }),
      fee: fee.spec,
      extras: {
        ruleFields,
        rulesHashRecipe: hashed ? "rules-v2" : null,
        statusRaw: untrusted(`closed=${String(g.closed)};active=${String(g.active)};uma=${resolutionSignal(g)};state=${status}`),
        geoRestricted: g.restricted ?? null,
        warnings,
      },
    };
  }

  // Rows are summarised by the shared parser; a row it refuses is reported in `skipped`, never dropped silently, and
  // a page on which every row is refused is drift.
  function summarise(rows: ReadonlyArray<{ readonly row: unknown; readonly ctx: NormalizeContext }>): Pick<PmPage<MarketSummary>, "items" | "skipped"> {
    const items: MarketSummary[] = [];
    const skipped: Array<{ index: number; reason: string }> = [];
    rows.forEach(({ row, ctx }, index) => {
      const result = summarizeRow(row, ctx);
      if (result.ok) items.push(result.value);
      else skipped.push({ index, reason: result.reason });
    });
    if (rows.length > 0 && skipped.length === rows.length) throw drift("every market row on the page was refused");
    return { items, skipped };
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
      const now = nowMs();
      let rows: Array<{ row: unknown; ctx: NormalizeContext }>;
      let nextCursor: string | undefined;
      if (q.text !== undefined) {
        const page = q.cursor === undefined ? 1 : Number(q.cursor);
        if (!Number.isInteger(page) || page < 1 || page > 1000) throw new AdapterFailure("NOT_SUPPORTED", "cursor is not a page number");
        const body = await transport.getJson(
          buildUrl(GAMMA, "", ["public-search"], [["q", q.text.slice(0, 200)], ["limit_per_type", String(Math.min(limit, 25))], ["page", String(page)]]),
        );
        const parsed = parseSearchPage(body);
        if (!parsed.ok) throw drift(`Gamma search: ${parsed.reason}`);
        const source = `https://${GAMMA}/public-search`;
        rows = parsed.rows.map(({ row, event }) => ({ row, ctx: { ...context(source, now), event } }));
        nextCursor = parsed.hasMore ? String(page + 1) : undefined;
      } else {
        const query: Array<readonly [string, string]> = [["limit", String(limit)]];
        if (wantsOpen && !wantsClosed) query.push(["closed", "false"]);
        else if (wantsClosed && !wantsOpen) query.push(["closed", "true"]);
        if (q.cursor !== undefined) {
          if (!/^[A-Za-z0-9_\-=.]{1,2000}$/.test(q.cursor)) throw new AdapterFailure("NOT_SUPPORTED", "cursor has unexpected characters");
          query.push(["after_cursor", q.cursor]);
        }
        const body = await transport.getJson(buildUrl(GAMMA, "", ["markets", "keyset"], query));
        const parsed = parseKeysetPage(body);
        if (!parsed.ok) throw drift(`Gamma keyset: ${parsed.reason}`);
        const ctx = context(`https://${GAMMA}/markets/keyset`, now);
        rows = parsed.rows.map((row) => ({ row, ctx }));
        nextCursor = parsed.next ?? undefined;
      }
      const { items, skipped } = summarise(rows);
      const wanted = q.statuses === undefined ? null : new Set<Status>(q.statuses);
      return {
        items: wanted === null ? items : items.filter((m) => wanted.has(m.status)),
        next: nextCursor ?? null,
        skipped,
      };
    },

    getMarket: load,

    async getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>> {
      const started = nowMs();
      const out: Array<Result<Book, AdapterError>> = [];
      for (const token of tokens) {
        if (token.venue !== "polymarket" || !isTokenId(token.tokenId)) {
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

    async getFeeSpec(m): Promise<FeeSpec> {
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
