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
// Parsing is shared: every answer body goes through the one Kalshi parser in sdk/venues/kalshi (parse.ts, map.ts),
// the same code the dApp reads with, into the SDK read model. What stays here is this layer's own: the gate, the
// descriptor, the transport and request plan, the fee spec (sdk/engine/fee-specs.ts from the parser's validated
// fee inputs), the fee_changes check, tradability and provenance. Sharing the parser changes nothing about who may
// call it.
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
//   - Token ids in this layer are TICKER:yes and TICKER:no (the dApp writes TICKER#yes); the
//     parser takes the separator.

import {
  KALSHI_CURSOR,
  KALSHI_LIST_STATUS,
  KALSHI_TICKER,
  bookOf,
  feeChangesVerdict,
  feeInputsOf,
  kalshiStatus,
  marketOf,
  parseBatchBooks,
  parseBookEnvelope,
  parseEventBody,
  parseExchangeStatus,
  parseListBody,
  parseMarketBody,
  parseSeriesBody,
  parseTokenId,
  readBook,
  type KalshiBookBody,
  type TokenSeparator,
} from "../../sdk/venues/kalshi/index.js";
import { kalshiRuleFields } from "../../sdk/rules.js";
import { kalshiFeeSpec, unknownFeeSpec, type FeeSource } from "../../sdk/engine/fee-specs.js";
import type { AdapterError, Book, FeeSpec, Market, MarketRef, MarketSummary, Result, Status, TokenRef } from "../../sdk/model.js";
import { untrusted } from "../types.js";
import { AdapterFailure, toAdapterFailure } from "./errors.js";
import { adapterDescriptor, KALSHI_HOSTS } from "./policy.js";
import { buildUrl, createJsonTransport, type JsonTransport, type TransportOptions } from "./transport.js";
import { ADAPTER_VERSION, type AdapterMarket, type PmPage, type PmVenueAdapter, type RuleFields } from "./types.js";
import { shapeHash } from "./values.js";

const HOST = "external-api.kalshi.com";
const ORIGIN = `https://${HOST}`;
const BASE = "/trade-api/v2";
const BATCH_MAX = 50;
const FEE_TTL_SEC = 300;
const SEPARATOR: TokenSeparator = ":";

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

// The shared parser's status table, its fee_changes reading and its batch-book reading, under the
// names this layer has always exported.
export { feeChangesVerdict, kalshiStatus, parseBatchBooks };

// The parser's fixed detail tokens, as sentences built from our own text (never upstream text).
const REFUSED: Readonly<Record<string, string>> = {
  market_shape: "Kalshi market answer has an unexpected shape",
  ticker_mismatch: "Kalshi returned a different market",
  unsupported_market: "only plain binary Kalshi markets are supported (no scalar or multivariate combo markets)",
  price_ranges: "Kalshi price ranges are not a contiguous ascending cover of 0 to 1",
  list_shape: "Kalshi markets response has no markets list",
  no_valid_rows: "no Kalshi market row in the response could be read",
  too_many_invalid_rows: "more than half of the Kalshi market rows could not be read",
  bad_next_cursor: "Kalshi returned a next cursor with unexpected characters",
  invalid_level: "Kalshi orderbook has a malformed level",
  crossed: "Kalshi orderbook is crossed",
  empty_book: "Kalshi orderbook has no levels on either side",
};

function refused(error: AdapterError, detail: string): AdapterFailure {
  return new AdapterFailure(error, REFUSED[detail] ?? `Kalshi answer refused (${detail})`);
}

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
    if (!KALSHI_TICKER.test(ref.marketId)) throw new AdapterFailure("NOT_FOUND", "Kalshi marketId must be a market ticker");
    const marketJson = await transport.getJson(url(["markets", ref.marketId]));
    const read = parseMarketBody(marketJson, ref.marketId);
    if (!read.ok) throw refused(read.error, read.detail);
    const { row, ticks } = read.value;
    const now = nowMs();
    const warnings: string[] = [];
    const reasons: string[] = [];

    const eventJson = await optional(url(["events", row.event_ticker], [["exclude_markets", "true"]]));
    const event = eventJson === undefined ? null : parseEventBody(eventJson, row.event_ticker);
    if (event === null) warnings.push("Kalshi event record was not found or not readable; series and fee are unknown");
    const seriesJson = event === null ? undefined : await optional(url(["series", event.seriesTicker]));
    const series = event === null || seriesJson === undefined ? null : parseSeriesBody(seriesJson, event.seriesTicker);
    if (event !== null && series === null) warnings.push("Kalshi series record was not found or not readable; the fee is unknown");

    // Fee: the parser validates fee_type and fee_multiplier; the spec is the engine's (sdk/engine/fee-specs.ts).
    const feeSource: FeeSource = {
      url: `${ORIGIN}${BASE}/series`,
      field: "fee_type,fee_multiplier",
      granularity: "series",
      verifiedAt: new Date(now).toISOString(),
      ttlSec: FEE_TTL_SEC,
    };
    let fee: FeeSpec = unknownFeeSpec("kalshi", feeSource);
    if (event !== null && series !== null) {
      const inputs = feeInputsOf(series);
      if (!inputs.ok) {
        warnings.push(inputs.reason === "fee_type_not_modelled" ? "Kalshi fee type is not modelled; the fee is unknown" : "Kalshi fee_multiplier is missing or invalid; the fee is unknown");
      } else {
        let overrides: "clear" | "present" | "inconclusive" | "skipped" = "skipped";
        if (checkFees) {
          const tickers = [event.seriesTicker, row.event_ticker];
          const a = await optional(url(["series", "fee_changes"], [["series_ticker", event.seriesTicker]]));
          const b = await optional(url(["events", "fee_changes"], [["event_ticker", row.event_ticker]]));
          const va = a === undefined ? "inconclusive" : feeChangesVerdict(a, tickers);
          const vb = b === undefined ? "inconclusive" : feeChangesVerdict(b, tickers);
          overrides = va === "present" || vb === "present" ? "present" : va === "clear" && vb === "clear" ? "clear" : "inconclusive";
        }
        if (overrides === "present") warnings.push("Kalshi has a scheduled or event-level fee override for this market; the fee is unknown");
        else if (overrides === "inconclusive") warnings.push("Kalshi fee_changes could not be read reliably; the fee is unknown");
        else {
          if (overrides === "skipped") warnings.push("Kalshi fee_changes were not checked");
          fee = kalshiFeeSpec({ multiplier: inputs.multiplier, makerFees: inputs.feeType === "quadratic_with_maker_fees", source: feeSource });
        }
      }
    }

    const market = marketOf(row, ticks, ORIGIN, now, { event, series, separator: SEPARATOR });

    // Rules: the shared rules-v2 fingerprint. When it cannot be taken, the sha256 slot holds a
    // sentinel that is not hex and embeds the ticker, so two such markets never compare equal.
    const hashed = market.rules.sha256 !== "";
    if (!hashed) {
      reasons.push("rules_unavailable");
      warnings.push("rules not hashable (the rule fields are empty or too long)");
    }
    const rules = hashed ? market.rules : { ...market.rules, sha256: `unavailable:kalshi:${row.ticker}` };

    const st: Status = market.status;
    const closesAt = market.timesUtc.closesAt;
    if (st !== "active") reasons.push(`status_${st}`);
    if (closesAt !== undefined && Date.parse(closesAt) <= now) reasons.push("past_close_time");
    if (closesAt === undefined) reasons.push("close_time_unknown");

    // One price range is one global step, as this layer has always written it.
    const only = ticks.length === 1 ? ticks[0] : undefined;
    const ruleFields = (kalshiRuleFields(row) ?? {}) as RuleFields;
    return {
      ...market,
      rules,
      tradable: { ok: reasons.length === 0, reasons },
      fee,
      tick: only === undefined ? ticks : only.tick,
      prov: {
        fetchedAtMs: now,
        source: `restricted:kalshi:${ORIGIN}${BASE}/markets`,
        adapterVersion: ADAPTER_VERSION,
        schemaHash: shapeHash(marketJson, eventJson, seriesJson),
      },
      extras: {
        ruleFields,
        rulesHashRecipe: hashed ? "rules-v2" : null,
        statusRaw: untrusted(row.status),
        geoRestricted: null,
        warnings,
      },
    };
  }

  async function singleBook(ticker: string): Promise<KalshiBookBody> {
    const json = await transport.getJson(url(["markets", ticker, "orderbook"]));
    const body = parseBookEnvelope(json);
    if (body === null) throw new AdapterFailure("SCHEMA_DRIFT", "Kalshi orderbook is malformed");
    return body;
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
      const kalshiFilter = KALSHI_LIST_STATUS[wanted];
      if (kalshiFilter === undefined) throw new AdapterFailure("NOT_SUPPORTED", "Kalshi cannot list by that status");
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
      const query: Array<readonly [string, string]> = [["status", kalshiFilter], ["limit", String(limit)], ["mve_filter", "exclude"]];
      if (q.cursor !== undefined) {
        if (!KALSHI_CURSOR.test(q.cursor)) throw new AdapterFailure("NOT_SUPPORTED", "cursor has unexpected characters");
        query.push(["cursor", q.cursor]);
      }
      const body = await transport.getJson(url(["markets"], query));
      const read = parseListBody(body, ORIGIN, nowMs(), SEPARATOR);
      if (!read.ok) throw refused(read.error, read.detail);
      const items = read.value.items;
      const skipped = read.value.rejected.map((r) => ({
        index: r.index,
        reason: r.reason === "unsupported_market" ? "not a plain binary Kalshi market" : "row is not a recognisable Kalshi market",
      }));
      const next = read.value.next;
      return { items, skipped, next };
    },

    getMarket: load,

    async getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>> {
      const started = nowMs();
      const parsed = tokens.map((t) => (t.venue === "kalshi" ? parseTokenId(t.tokenId, SEPARATOR) : null));
      const tickers = [...new Set(parsed.flatMap((p) => (p === null ? [] : [p.ticker])))];
      const raws = new Map<string, KalshiBookBody | AdapterFailure>();

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
        const read = readBook(raw);
        if (!read.ok) {
          const failure = refused(read.error, read.detail);
          const bad: Result<Book, AdapterError> = { ok: false, error: failure.code, detail: failure.detail };
          books.set(t, { yes: bad, no: bad });
          continue;
        }
        books.set(t, {
          // The shared parser has already sorted both views; the convention names the raw payload's order.
          yes: { ok: true, value: { ...bookOf("yes", t, read.value, asOfMs, SEPARATOR), convention: "best_last" } },
          no: { ok: true, value: { ...bookOf("no", t, read.value, asOfMs, SEPARATOR), convention: "best_last" } },
        });
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
        const status = parseExchangeStatus(await transport.getJson(url(["exchange", "status"])));
        if (status === null) return { ok: false, notes: ["Kalshi /exchange/status has an unexpected shape"] };
        const ok = status.exchangeActive && status.tradingActive;
        const notes = [ok ? "Kalshi exchange and trading active" : "Kalshi exchange or trading inactive"];
        if (status.inactiveShards > 0) notes.push(`${status.inactiveShards} exchange shard(s) inactive`);
        return { ok, notes };
      } catch (error) {
        return { ok: false, notes: [`Kalshi health check failed: ${toAdapterFailure(error).code}`] };
      }
    },
  };
}
