// Kalshi read adapter. RESTRICTED TERMS: Kalshi's Developer Agreement (v1.1, possibly stale)
// limits API data to the member's own trading and bars collecting, caching, aggregating or
// storing it (docs/research/08 4.9, aggregation-design 10). Consequences enforced here:
//
//   - OFF by default. `createKalshiAdapter` throws unless the caller passes `enabled: true` AND
//     the sha256 of the current clause text (from the descriptor), which proves the clause was
//     put in front of the user. Without both, `createAdapters` hands out a disabled adapter.
//   - Memory only. The adapter keeps no cache, writes no file and imports no storage module (a
//     source-scan test enforces that). Data leaves a call only as the return value.
//   - Never recorded, never exported: descriptor.recordable and mayExport are false, and
//     assertMayPersist("kalshi") throws.
//   - Every Market carries a provenance source starting "restricted:kalshi".
//
// Facts encoded (docs/research/08 section 4 and its Verification section):
//   - Order books are BIDS ONLY: `yes_dollars` and `no_dollars`, ascending, best LAST. YES ask =
//     1 - best NO bid. The two views are one pool of liquidity (never add them).
//   - Batch books use REPEATED `tickers=` params. A comma-joined value returns HTTP 200 with a
//     bogus empty book, so any entry whose ticker contains a comma is an error.
//   - `GET /series` ignores `limit` and returns more than 3.5 MB: it is never called; only
//     `GET /series/{ticker}` is.
//   - No free-text search endpoint exists: `text` is refused.
//   - Prices are `*_dollars` strings and counts `*_fp` strings; last_price and previous prices
//     are never used. Tick comes from `price_ranges`, not from the structure label.
//   - Fees: series fee_type and fee_multiplier, plus scheduled/event overrides from
//     /series/fee_changes and /events/fee_changes. A present or unreadable override makes the
//     fee unknown (fail closed). The shapes of the two fee_changes routes were never captured,
//     so that reading is tolerant and conservative; the opt-in live drift suite checks it.

import { normalizeKalshiBook, type BookMeta } from "../core/books.js";
import { kalshiFeeSpec, unknownFeeSpec, type FeeSource } from "../core/fee-specs.js";
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
  Tick,
  TickRange,
  TokenRef,
} from "../types.js";
import { untrusted } from "../types.js";
import { AdapterFailure, toAdapterFailure } from "./errors.js";
import { adapterDescriptor, KALSHI_HOSTS } from "./policy.js";
import { buildRules } from "./rules.js";
import { buildUrl, createJsonTransport, type JsonTransport, type TransportOptions } from "./transport.js";
import { ADAPTER_VERSION, type AdapterMarket, type PmPage, type PmVenueAdapter, type RuleFields } from "./types.js";
import { bool, decOf, get, intText, isRec, isoUtc, plainDec, shapeHash, str, type Rec } from "./values.js";

const HOST = "external-api.kalshi.com";
const BASE = "/trade-api/v2";
const MAX_LEVELS = 5000;
const BATCH_MAX = 50;
const FEE_TTL_SEC = 300;
const TICKER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export interface KalshiGate {
  readonly enabled: boolean;
  // sha256 of descriptor.clause for the current registry text. Proof the clause was shown.
  readonly acknowledgedClauseSha256?: string;
}

export type KalshiGateStatus = "off" | "ack_required" | "enabled";

export interface KalshiAdapterOptions {
  readonly http?: TransportOptions;
  readonly transport?: JsonTransport;
  readonly nowMs?: () => number;
  // "check" (default) reads the two fee_changes routes; "skip" leaves them out and says so in the
  // market warnings.
  readonly feeChanges?: "check" | "skip";
}

export class KalshiDisabledError extends Error {
  readonly status: Exclude<KalshiGateStatus, "enabled">;
  constructor(status: Exclude<KalshiGateStatus, "enabled">) {
    super(
      status === "off"
        ? "the Kalshi adapter is OFF (restricted data terms); enable it explicitly"
        : "the Kalshi adapter needs the current terms clause acknowledged (acknowledgedClauseSha256)",
    );
    this.name = "KalshiDisabledError";
    this.status = status;
  }
}

export function evaluateKalshiGate(gate: KalshiGate | undefined, nowMs: number): KalshiGateStatus {
  if (gate === undefined || gate.enabled !== true) return "off";
  const descriptor = adapterDescriptor("kalshi", nowMs);
  return gate.acknowledgedClauseSha256 === descriptor.clauseSha256 ? "enabled" : "ack_required";
}

// ---- parsing ----

export function kalshiStatus(raw: string | null): Status {
  switch (raw) {
    case "initialized":
      return "pending";
    case "inactive":
      return "paused";
    case "active":
      return "active";
    case "closed":
      return "closed";
    case "determined":
      return "determined";
    // `amended` restarts the settlement timer after a dispute: still not final.
    case "disputed":
    case "amended":
      return "disputed";
    case "finalized":
      return "resolved";
    default:
      return "unknown";
  }
}

function tickerOf(value: unknown): string | null {
  return typeof value === "string" && TICKER.test(value) ? value : null;
}

interface KalshiMarket {
  readonly raw: Rec;
  readonly ticker: string;
  readonly eventTicker: string;
  readonly statusRaw: string | null;
}

function parseMarket(value: unknown): KalshiMarket {
  const raw = isRec(value) && isRec(get(value, "market")) ? (get(value, "market") as Rec) : value;
  if (!isRec(raw)) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi market is not an object");
  const ticker = tickerOf(get(raw, "ticker"));
  const eventTicker = tickerOf(get(raw, "event_ticker"));
  if (ticker === null || eventTicker === null) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi market has no usable ticker or event_ticker");
  return { raw, ticker, eventTicker, statusRaw: str(raw, "status", 40) };
}

function parseTick(raw: Rec): Tick {
  const ranges = get(raw, "price_ranges");
  if (!Array.isArray(ranges) || ranges.length === 0 || ranges.length > 20) {
    throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi market.price_ranges is missing");
  }
  const out: TickRange[] = [];
  let expectedStart: Dec = "0";
  for (const r of ranges as unknown[]) {
    const from = isRec(r) ? plainDec(get(r, "start")) : null;
    const to = isRec(r) ? plainDec(get(r, "end")) : null;
    const step = isRec(r) ? plainDec(get(r, "step")) : null;
    if (from === null || to === null || step === null) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi price range is malformed");
    const a = ratFromDec(from);
    const b = ratFromDec(to);
    const e = ratFromDec(expectedStart);
    const s = ratFromDec(step);
    if (!a.ok || !b.ok || !e.ok || !s.ok || cmp(a.value, e.value) !== 0 || cmp(b.value, a.value) <= 0 || cmp(s.value, b.value) > 0 || cmp(s.value, { n: 0n, d: 1n }) <= 0) {
      throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi price ranges are not a contiguous ascending cover");
    }
    out.push({ from, to, step });
    expectedStart = to;
  }
  if (expectedStart !== "1") throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi price ranges do not end at 1");
  const only = out[0];
  return out.length === 1 && only !== undefined ? only.step : out;
}

function sourceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value.slice(0, 20) as unknown[]) {
    const url = isRec(item) ? str(item, "url", 300) : null;
    if (url !== null && /^https:\/\/[^\s]+$/.test(url)) out.push(url);
  }
  return out;
}

// Scheduled or event-level fee overrides. See the header: tolerant and conservative.
export function feeChangesVerdict(json: unknown, tickers: readonly string[]): "clear" | "present" | "inconclusive" {
  if (!isRec(json)) return "inconclusive";
  const arrays = Object.values(json).filter((v): v is unknown[] => Array.isArray(v));
  if (arrays.length === 0) return Object.keys(json).length === 0 ? "clear" : "inconclusive";
  let identifiable = true;
  for (const items of arrays) {
    for (const item of items) {
      if (!isRec(item)) return "inconclusive";
      const keys = [get(item, "series_ticker"), get(item, "event_ticker")].filter((k): k is string => typeof k === "string");
      if (keys.length === 0) identifiable = false;
      if (keys.some((k) => tickers.includes(k))) return "present";
    }
  }
  const total = arrays.reduce((n, a) => n + a.length, 0);
  return total > 0 && !identifiable ? "inconclusive" : "clear";
}

// ---- books ----

function pairs(value: unknown): BookLevel[] | null {
  if (!Array.isArray(value) || value.length > MAX_LEVELS) return null;
  const out: BookLevel[] = [];
  for (const item of value as unknown[]) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const price = item[0];
    const size = item[1];
    if (typeof price !== "string" || typeof size !== "string") return null;
    out.push({ price, size });
  }
  return out;
}

interface RawBook {
  readonly yes: BookLevel[];
  readonly no: BookLevel[];
}

function rawBookOf(holder: unknown): RawBook | null {
  if (!isRec(holder)) return null;
  const book = isRec(get(holder, "orderbook_fp")) ? (get(holder, "orderbook_fp") as Rec) : holder;
  const yes = pairs(get(book, "yes_dollars"));
  const no = pairs(get(book, "no_dollars"));
  return yes === null || no === null ? null : { yes, no };
}

// Batch response: a list of entries that each name their ticker. The exact envelope key was not
// captured, so the first list of such entries is used. Any comma in a ticker is the known
// bogus-book case and makes the whole response unusable.
export function parseBatchBooks(json: unknown): Map<string, RawBook> | null {
  if (!isRec(json)) return null;
  for (const value of Object.values(json)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const out = new Map<string, RawBook>();
    for (const item of value as unknown[]) {
      const ticker = isRec(item) ? str(item, "ticker", 200) : null;
      if (ticker === null) {
        out.clear();
        break;
      }
      if (ticker.includes(",")) return null;
      const raw = rawBookOf(item);
      if (raw === null) return null;
      out.set(ticker, raw);
    }
    if (out.size > 0) return out;
  }
  return null;
}

const TOKEN = /^([A-Za-z0-9][A-Za-z0-9._-]{0,99}):(yes|no)$/;

// ---- adapter ----

export function createKalshiAdapter(gate: KalshiGate | undefined, options: KalshiAdapterOptions = {}): PmVenueAdapter {
  const nowMs = options.nowMs ?? Date.now;
  const status = evaluateKalshiGate(gate, nowMs());
  if (status !== "enabled") throw new KalshiDisabledError(status);
  const transport = options.transport ?? createJsonTransport(KALSHI_HOSTS, { minIntervalMs: 250, maxBodyBytes: 2 * 1024 * 1024, ...options.http });
  const checkFees = options.feeChanges !== "skip";
  const url = (segments: readonly string[], query: ReadonlyArray<readonly [string, string]> = []): URL =>
    buildUrl(HOST, BASE, segments, query);

  // A missing event, series or fee-change record degrades the fee to unknown; other failures
  // (rate limit, timeout, drift) propagate.
  async function optional(path: URL): Promise<unknown | undefined> {
    try {
      return await transport.getJson(path);
    } catch (error) {
      const failure = toAdapterFailure(error);
      if (failure.code === "NOT_FOUND") return undefined;
      throw failure;
    }
  }

  async function load(ref: MarketRef): Promise<AdapterMarket> {
    if (ref.venue !== "kalshi") throw new AdapterFailure("NOT_SUPPORTED", "market belongs to another venue");
    if (tickerOf(ref.marketId) === null) throw new AdapterFailure("NOT_FOUND", "Kalshi marketId must be a market ticker");
    const marketJson = await transport.getJson(url(["markets", ref.marketId]));
    const m = parseMarket(marketJson);
    if (m.ticker !== ref.marketId) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi returned a different market");
    const raw = m.raw;
    if (get(raw, "market_type") !== "binary") throw new AdapterFailure("NOT_SUPPORTED", "only binary Kalshi markets are supported");
    if (get(raw, "mve_collection_ticker") !== undefined && get(raw, "mve_collection_ticker") !== null && get(raw, "mve_collection_ticker") !== "") {
      throw new AdapterFailure("NOT_SUPPORTED", "multivariate (combo) markets are not supported");
    }
    const now = nowMs();
    const warnings: string[] = [];
    const reasons: string[] = [];

    const eventJson = await optional(url(["events", m.eventTicker], [["exclude_markets", "true"]]));
    const event = isRec(eventJson) && isRec(get(eventJson, "event")) ? (get(eventJson, "event") as Rec) : isRec(eventJson) ? eventJson : null;
    const seriesTicker = event === null ? null : tickerOf(get(event, "series_ticker"));
    if (event === null) warnings.push("Kalshi event record was not found; series and fee are unknown");
    const seriesJson = seriesTicker === null ? undefined : await optional(url(["series", seriesTicker]));
    const series = isRec(seriesJson) && isRec(get(seriesJson, "series")) ? (get(seriesJson, "series") as Rec) : isRec(seriesJson) ? seriesJson : null;

    // Fee
    const feeSource: FeeSource = {
      url: `https://${HOST}${BASE}/series`,
      field: "fee_type,fee_multiplier",
      granularity: "series",
      verifiedAt: new Date(now).toISOString(),
      ttlSec: FEE_TTL_SEC,
    };
    let fee: FeeSpec = unknownFeeSpec("kalshi", feeSource);
    if (series !== null) {
      const feeType = str(series, "fee_type", 64);
      const multiplier = decOf(get(series, "fee_multiplier"));
      const mult = multiplier === null ? null : ratFromDec(multiplier);
      if (feeType !== "quadratic" && feeType !== "quadratic_with_maker_fees") {
        warnings.push("Kalshi fee type is not modelled; the fee is unknown");
      } else if (multiplier === null || mult === null || !mult.ok || mult.value.n <= 0n) {
        warnings.push("Kalshi fee_multiplier is missing or invalid; the fee is unknown");
      } else {
        let overrides: "clear" | "present" | "inconclusive" | "skipped" = "skipped";
        if (checkFees && seriesTicker !== null) {
          const tickers = [seriesTicker, m.eventTicker];
          const a = await optional(url(["series", "fee_changes"], [["series_ticker", seriesTicker]]));
          const b = await optional(url(["events", "fee_changes"], [["event_ticker", m.eventTicker]]));
          const va = a === undefined ? "inconclusive" : feeChangesVerdict(a, tickers);
          const vb = b === undefined ? "inconclusive" : feeChangesVerdict(b, tickers);
          overrides = va === "present" || vb === "present" ? "present" : va === "clear" && vb === "clear" ? "clear" : "inconclusive";
        }
        if (overrides === "present") warnings.push("Kalshi has a scheduled or event-level fee override for this market; the fee is unknown");
        else if (overrides === "inconclusive") warnings.push("Kalshi fee_changes could not be read reliably; the fee is unknown");
        else {
          if (overrides === "skipped") warnings.push("Kalshi fee_changes were not checked");
          fee = kalshiFeeSpec({ multiplier, makerFees: feeType === "quadratic_with_maker_fees", source: feeSource });
        }
      }
    }

    // Rules
    const primary = get(raw, "rules_primary");
    const secondary = get(raw, "rules_secondary");
    const closeRaw = get(raw, "close_time");
    const displayText = [typeof primary === "string" ? primary : "", typeof secondary === "string" ? secondary : ""].filter((t) => t !== "").join("\n\n");
    const ruleFields: RuleFields = {
      ...(typeof primary === "string" ? { rules_primary: primary } : {}),
      // rules_secondary is absent on many markets; absence is treated as empty, never as drift.
      rules_secondary: typeof secondary === "string" ? secondary : null,
      ...(typeof closeRaw === "string" ? { close_time: closeRaw } : {}),
    };
    const sources = [...sourceUrls(series === null ? undefined : get(series, "settlement_sources")), ...sourceUrls(event === null ? undefined : get(event, "settlement_sources"))];
    const closesAt = isoUtc(closeRaw);
    const canClose = bool(raw, "can_close_early");
    const built = buildRules({
      venue: "kalshi",
      marketId: m.ticker,
      displayText,
      ruleFields,
      sources: [...new Set(sources)],
      mechanism: "exchange",
      ...(closesAt === null ? {} : { cutoffUtc: closesAt }),
      void: "unknown",
      ...(canClose === null ? {} : { canCloseEarly: canClose }),
    });
    if (!built.hashed) {
      reasons.push("rules_unavailable");
      warnings.push(built.hashProblem ?? "rules not hashable");
    }

    const st = kalshiStatus(m.statusRaw);
    if (st !== "active") reasons.push(`status_${st}`);
    if (closesAt !== null && Date.parse(closesAt) <= now) reasons.push("past_close_time");
    if (closesAt === null) reasons.push("close_time_unknown");

    const yesLabel = str(raw, "yes_sub_title", 500) ?? str(raw, "title", 500) ?? "Yes";
    const noLabel = str(raw, "no_sub_title", 500) ?? "No";
    const outcomes: OutcomeRef[] = [
      { index: 0, role: "yes", label: untrusted(yesLabel), tokenId: `${m.ticker}:yes` },
      { index: 1, role: "no", label: untrusted(noLabel), tokenId: `${m.ticker}:no` },
    ];
    const opensAt = isoUtc(get(raw, "open_time"));
    const expected = isoUtc(get(raw, "expected_expiration_time"));
    const latest = isoUtc(get(raw, "latest_expiration_time"));
    const exchangeIndex = intText(get(raw, "exchange_index"));
    const native: Record<string, string> = { event_ticker: m.eventTicker };
    if (seriesTicker !== null) native["series_ticker"] = seriesTicker;
    if (exchangeIndex !== null) native["exchange_index"] = exchangeIndex;
    const mutuallyExclusive = event === null ? null : bool(event, "mutually_exclusive");

    return {
      ref: { venue: "kalshi", marketId: m.ticker, native },
      title: untrusted(str(raw, "title", 1000) ?? yesLabel),
      outcomes,
      rules: built.rules,
      status: st,
      tradable: { ok: reasons.length === 0, reasons },
      timesUtc: {
        ...(opensAt === null ? {} : { opensAt }),
        ...(closesAt === null ? {} : { closesAt }),
        ...(expected === null ? {} : { expectedResolutionAt: expected }),
        ...(latest === null ? {} : { latestResolutionAt: latest }),
      },
      tick: parseTick(raw),
      // Fractional contracts are possible, so no minimum is claimed.
      // USD held at the exchange. 4 is the price precision of the *_dollars fields.
      collateral: { symbol: "USD", chain: "offchain", decimals: 4, custody: "venue" },
      // mutually_exclusive is NOT exhaustive: the group is never marked proven here.
      group: { key: m.eventTicker, kind: mutuallyExclusive === true ? "mutually_exclusive" : "event", exhaustive: "unknown" },
      fee,
      prov: {
        fetchedAtMs: now,
        source: `restricted:kalshi:https://${HOST}${BASE}/markets`,
        adapterVersion: ADAPTER_VERSION,
        schemaHash: shapeHash(marketJson, eventJson, seriesJson),
      },
      extras: {
        ruleFields,
        rulesHashRecipe: built.rulesHashRecipe,
        statusRaw: untrusted(m.statusRaw ?? ""),
        geoRestricted: null,
        warnings,
      },
    };
  }

  function summaryOf(value: unknown): MarketSummary | null {
    let m: KalshiMarket;
    try {
      m = parseMarket(value);
    } catch {
      return null;
    }
    const title = str(m.raw, "yes_sub_title", 500) ?? str(m.raw, "title", 500) ?? m.ticker;
    const closesAt = isoUtc(get(m.raw, "close_time"));
    return {
      ref: { venue: "kalshi", marketId: m.ticker, native: { event_ticker: m.eventTicker } },
      title: untrusted(title),
      status: kalshiStatus(m.statusRaw),
      ...(closesAt === null ? {} : { closesAt }),
    };
  }

  async function singleBook(ticker: string): Promise<RawBook> {
    const json = await transport.getJson(url(["markets", ticker, "orderbook"]));
    const raw = rawBookOf(json);
    if (raw === null) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi orderbook is malformed");
    return raw;
  }

  return {
    id: "kalshi",
    descriptor: adapterDescriptor("kalshi", nowMs()),
    caps: {
      listMarkets: true,
      // No free-text market search endpoint exists.
      search: false,
      getMarket: true,
      getBook: true,
      getBooksBatch: true,
      getFeeSpec: true,
      getResolution: true,
      getPositionsByAddress: false,
      stream: false,
    },

    async listMarkets(q): Promise<PmPage<MarketSummary>> {
      if (q.text !== undefined) throw new AdapterFailure("NOT_SUPPORTED", "Kalshi has no free-text market search");
      if (q.statuses !== undefined && q.statuses.length > 1) throw new AdapterFailure("NOT_SUPPORTED", "Kalshi lists one status per call");
      const wanted: Status = q.statuses?.[0] ?? "active";
      const filter: Partial<Record<Status, string>> = { pending: "unopened", active: "open", paused: "paused", closed: "closed", resolved: "settled" };
      const kalshiFilter = filter[wanted];
      if (kalshiFilter === undefined) throw new AdapterFailure("NOT_SUPPORTED", "Kalshi cannot list by that status");
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
      const query: Array<readonly [string, string]> = [["status", kalshiFilter], ["limit", String(limit)], ["mve_filter", "exclude"]];
      if (q.cursor !== undefined) {
        if (!/^[A-Za-z0-9_\-=+/.%]{1,2000}$/.test(q.cursor)) throw new AdapterFailure("NOT_SUPPORTED", "cursor has unexpected characters");
        query.push(["cursor", q.cursor]);
      }
      const body = await transport.getJson(url(["markets"], query));
      if (!isRec(body) || !Array.isArray(get(body, "markets"))) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi markets response has no markets list");
      const items: MarketSummary[] = [];
      const skipped: Array<{ index: number; reason: string }> = [];
      (get(body, "markets") as unknown[]).forEach((row, index) => {
        const s = summaryOf(row);
        if (s === null) skipped.push({ index, reason: "row is not a recognisable Kalshi market" });
        else items.push(s);
      });
      const cursor = get(body, "cursor");
      const hasNext = typeof cursor === "string" && cursor !== "";
      return { items, skipped, hasNext, ...(hasNext ? { nextCursor: cursor } : {}) };
    },

    getMarket: load,

    async getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>> {
      const started = nowMs();
      const parsed = tokens.map((t) => {
        const hit = t.venue === "kalshi" ? TOKEN.exec(t.tokenId) : null;
        return hit === null ? null : { ticker: hit[1] ?? "", side: hit[2] ?? "" };
      });
      const tickers = [...new Set(parsed.flatMap((p) => (p === null ? [] : [p.ticker])))];
      const raws = new Map<string, RawBook | AdapterFailure>();

      if (tickers.length >= 2) {
        for (let i = 0; i < tickers.length; i += BATCH_MAX) {
          const chunk = tickers.slice(i, i + BATCH_MAX);
          if (nowMs() - started >= opts.deadlineMs) break;
          try {
            // Repeated params, never a comma list.
            const json = await transport.getJson(url(["markets", "orderbooks"], chunk.map((t) => ["tickers", t] as const)));
            const batch = parseBatchBooks(json);
            if (batch !== null) for (const t of chunk) { const b = batch.get(t); if (b !== undefined) raws.set(t, b); }
          } catch (error) {
            // Rate limiting and timeouts are not answered with more requests; any other batch
            // failure falls through to the single-book route, which has a verified shape.
            const failure = toAdapterFailure(error);
            if (failure.code === "RATE_LIMITED" || failure.code === "TIMEOUT") for (const t of chunk) raws.set(t, failure);
          }
        }
      }
      // Anything the batch did not answer is read one by one (the verified single-book shape).
      for (const t of tickers) {
        if (raws.has(t)) continue;
        if (nowMs() - started >= opts.deadlineMs) {
          raws.set(t, new AdapterFailure("TIMEOUT", "call budget spent before this book was read"));
          continue;
        }
        try {
          raws.set(t, await singleBook(t));
        } catch (error) {
          raws.set(t, toAdapterFailure(error));
        }
      }

      const books = new Map<string, { yes: Result<Book, AdapterError>; no: Result<Book, AdapterError> }>();
      const asOfMs = nowMs();
      for (const t of tickers) {
        const raw = raws.get(t);
        if (raw === undefined) continue;
        if (raw instanceof AdapterFailure) {
          const bad: Result<Book, AdapterError> = { ok: false, error: raw.code, detail: raw.detail };
          books.set(t, { yes: bad, no: bad });
          continue;
        }
        const yesMeta: BookMeta = { token: { venue: "kalshi", tokenId: `${t}:yes` }, asOfMs };
        const noMeta: BookMeta = { token: { venue: "kalshi", tokenId: `${t}:no` }, asOfMs };
        const result = normalizeKalshiBook(yesMeta, noMeta, { yesBids: raw.yes, noBids: raw.no });
        if (result.ok) {
          books.set(t, { yes: { ok: true, value: result.value.yes.book }, no: { ok: true, value: result.value.no.book } });
        } else {
          const bad: Result<Book, AdapterError> = { ok: false, error: result.error, detail: result.detail ?? "" };
          books.set(t, { yes: bad, no: bad });
        }
      }

      return parsed.map((p): Result<Book, AdapterError> => {
        if (p === null) return { ok: false, error: "NOT_SUPPORTED", detail: "not a Kalshi token id (expected TICKER:yes or TICKER:no)" };
        const pair = books.get(p.ticker);
        if (pair === undefined) return { ok: false, error: "TIMEOUT", detail: "no book was read for this ticker" };
        return p.side === "yes" ? pair.yes : pair.no;
      });
    },

    async getFeeSpec(m: Market): Promise<FeeSpec> {
      return (await load(m.ref)).fee;
    },

    async health(): Promise<{ ok: boolean; notes: string[] }> {
      try {
        const json = await transport.getJson(url(["exchange", "status"]));
        if (!isRec(json) || typeof get(json, "exchange_active") !== "boolean" || typeof get(json, "trading_active") !== "boolean") {
          return { ok: false, notes: ["Kalshi /exchange/status has an unexpected shape"] };
        }
        const notes: string[] = [];
        const ok = get(json, "exchange_active") === true && get(json, "trading_active") === true;
        notes.push(ok ? "Kalshi exchange and trading active" : "Kalshi exchange or trading inactive");
        const shards = get(json, "exchange_index_statuses");
        if (Array.isArray(shards)) {
          const down = (shards as unknown[]).filter((s) => isRec(s) && (get(s, "exchange_active") !== true || get(s, "trading_active") !== true)).length;
          if (down > 0) notes.push(`${down} exchange shard(s) inactive`);
        }
        return { ok, notes };
      } catch (error) {
        return { ok: false, notes: [`Kalshi health check failed: ${toAdapterFailure(error).code}`] };
      }
    },
  };
}
