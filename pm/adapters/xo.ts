// XO read adapter. A thin mapping layer over src/xo/client.ts, which already owns every XO trap
// (marketType=2,4 discovery, take<=50, paging on meta.hasNextPage only, micro-unit parsing,
// strict decoders that fail closed, explicit User-Agent, host allowlist). Nothing here talks HTTP
// itself; transport (fetch, clock, sleep) is injected through the client options.
//
// Mapping notes:
//   - marketId is the conditionId. Outcome 0 is the Yes slot and outcome 1 the No slot even for
//     team-named markets, so roles come from the slot, never from the title.
//   - Prices come from the orderbook only. List display prices and the constant detail
//     currentPrice are dropped by the client and never reach a Book or Quote.
//   - Fee: the larger of /fee-rate and effectiveFeeConfig (src/xo/client.ts resolveTakerFee);
//     unknown when neither is usable. The two sources disagree live, so the market carries a
//     warning and pm/core refuses the executable tier until a real fill reconciles them.
//   - XO has no batch book route that was ever tested, so getBooks fetches one token at a time.
//   - Sizes and prices are micro integers inside the client; they are turned into exact decimal
//     strings here and into rationals in pm/core. No floating point.

import { formatMicro } from "../../src/xo/units.js";
import {
  DEFAULT_TAKE,
  LIST_STATUSES,
  MAX_TAKE,
  XoClient,
  lifecycleOf,
  type ListStatus,
} from "../../src/xo/client.js";
import type { HttpOptions } from "../../src/xo/http.js";
import type { Lifecycle, MarketDetail, MarketSummary as XoSummary } from "../../src/xo/types.js";
import { normalizeSortedBook, type RawSidedBook } from "../core/books.js";
import { categorise } from "../core/category.js";
import { unknownFeeSpec, xoFeeSpec, type FeeSource } from "../core/fee-specs.js";
import type {
  AdapterError,
  Book,
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
import { buildRules } from "./rules.js";
import { adapterDescriptor, XO_HOSTS } from "./policy.js";
import { ADAPTER_VERSION, type AdapterMarket, type PmPage, type PmVenueAdapter, type RuleFields } from "./types.js";

// Omission texts from src/xo/client.ts that concern rule-bearing fields.
const RULE_OMISSION = /^(rules[ .]|\d+ outcomeRules |outcomeRules\[|resolutionSources |\d+ resolutionSources )/;
import { sha256Text, tokenIdText } from "./values.js";

export interface XoAdapterOptions {
  // Inject a prepared client (tests, or the plugin sharing one client with the xo_* reads).
  readonly client?: XoClient;
  // Otherwise a client is built from these options. The host list is always the two XO read
  // hosts; a caller-supplied allowedHosts is ignored.
  readonly http?: HttpOptions;
  // Wall clock in epoch milliseconds (provenance, lifecycle, book age). Default Date.now.
  readonly nowMs?: () => number;
}

const XO_BASE = "https://api-mainnet.xo.market/api";
// src/xo/client.ts validates every field strictly and throws on drift, so the schema pin for XO
// is the decoder generation, not a payload shape.
const XO_SCHEMA_ID = "xo-client-strict-decoders-v1";
const FEE_TTL_SEC = 300;

const STATUS_TO_LIST: Readonly<Partial<Record<Status, readonly ListStatus[]>>> = {
  pending: ["PENDING"],
  active: ["ACTIVE"],
  paused: ["PAUSED"],
  closed: ["CLOSED"],
  determined: ["RESOLVED"],
  resolved: ["CLOSED"],
  voided: ["VOIDED", "VOIDED_CLOSED"],
};

// Lifecycle -> normalised status. RESOLVED (a winner recorded, payout not final) is "determined";
// CLOSED with a winner is "resolved"; CLOSED without one is "closed"; review_required means the
// creator must update the market, which is not tradable, so it reads as "paused".
export function xoStatusOf(lifecycle: Lifecycle): Status {
  switch (lifecycle) {
    case "pending":
      return "pending";
    case "open":
      return "active";
    case "paused":
    case "review_required":
      return "paused";
    case "expired_unresolved":
    case "closed_no_winner":
      return "closed";
    case "resolved_provisional":
      return "determined";
    case "settled":
      return "resolved";
    case "voided":
    case "cancelled":
      return "voided";
    case "unknown":
      return "unknown";
  }
}

function rejectRef(ref: MarketRef): void {
  if (ref.venue !== "xo") throw new AdapterFailure("NOT_SUPPORTED", "market belongs to another venue");
  if (!/^0x[0-9a-fA-F]{64}$/.test(ref.marketId)) throw new AdapterFailure("NOT_FOUND", "XO marketId must be a conditionId");
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 1;
  if (!/^[1-9][0-9]{0,3}$/.test(cursor)) throw new AdapterFailure("NOT_SUPPORTED", "cursor is not a page number");
  return Number(cursor);
}

export function createXoAdapter(options: XoAdapterOptions = {}): PmVenueAdapter {
  const nowMs = options.nowMs ?? Date.now;
  const client = options.client ?? new XoClient({ ...(options.http ?? {}), allowedHosts: XO_HOSTS });

  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toAdapterFailure(error);
    }
  }

  function summaryOf(row: XoSummary, now: number): MarketSummary {
    const status = xoStatusOf(lifecycleOf(row, now));
    return {
      ref: { venue: "xo", marketId: row.conditionId, native: { slug: String(row.slug), id: String(row.id), kind: row.kind } },
      title: untrusted(String(row.title)),
      status,
      ...(row.expiresAt === null ? {} : { closesAt: row.expiresAt }),
    };
  }

  function feeSpecFrom(detail: MarketDetail, takerBps: number | null, now: number): { spec: FeeSpec; warnings: string[] } {
    const source: FeeSource = {
      url: `${XO_BASE}/markets/contract/${detail.conditionId}`,
      field: "effectiveFeeConfig.takerFeeBps,/fee-rate",
      granularity: "market",
      verifiedAt: new Date(now).toISOString(),
      ttlSec: FEE_TTL_SEC,
    };
    if (takerBps === null) return { spec: unknownFeeSpec("xo", source), warnings: ["XO fee is unknown; no net figure can be computed"] };
    const makerBps = detail.effectiveFeeConfig?.makerFeeBps;
    return {
      spec: xoFeeSpec({
        takerBps: String(takerBps),
        ...(makerBps === undefined ? {} : { makerBps: String(makerBps) }),
        source,
      }),
      warnings: [],
    };
  }

  // src/xo/client.ts cuts rules.description, reads only the first outcomeRules and
  // resolutionSources, and drops unreadable entries, recording each in detail.omissions. Edits
  // beyond those cut points would not change a hash over what was kept, so any such omission
  // makes the rules unhashable instead.
  function lossyRuleRead(detail: {
    readonly omissions: readonly string[];
    readonly rules: { readonly outcomeRules: readonly unknown[]; readonly outcomeRulesTotal: number };
    readonly resolutionSources: readonly unknown[];
    readonly resolutionSourcesTotal: number;
  }): string | null {
    if (detail.rules.outcomeRulesTotal > detail.rules.outcomeRules.length) return "outcomeRules were not all read";
    if (detail.resolutionSourcesTotal > detail.resolutionSources.length) return "resolutionSources were not all read";
    const hit = detail.omissions.find((o) => RULE_OMISSION.test(o));
    return hit === undefined ? null : "a rule-bearing field was cut or dropped when read";
  }

  async function loadMarket(ref: MarketRef): Promise<AdapterMarket> {
    rejectRef(ref);
    const assessment = await guarded(() => client.getFeeAssessment(ref.marketId));
    const now = nowMs();
    const detail = assessment.market.market;
    const book = assessment.market.orderbook;
    const lifecycle = lifecycleOf(detail, now);
    const status = xoStatusOf(lifecycle);

    const reasons: string[] = [];
    if (lifecycle !== "open") reasons.push(`lifecycle_${lifecycle}`);
    if (!book.active) reasons.push("orderbook_inactive");
    if (detail.reviewStatus === "REJECT") reasons.push("review_rejected");

    const warnings: string[] = [];
    if (detail.reviewStatus === "UPDATE_REQUIRED") warnings.push("XO review status is UPDATE_REQUIRED");
    if (detail.resolutionFlagCount !== null && detail.resolutionFlagCount > 0) {
      warnings.push(`XO reports ${detail.resolutionFlagCount} resolution flag(s)`);
    }
    if (detail.feeConfigProblem !== null) warnings.push("XO effectiveFeeConfig was present but unusable");
    if (assessment.status === "disagree") warnings.push("XO /fee-rate and effectiveFeeConfig disagree; the larger figure is used");
    if (assessment.status === "fee_rate_only") warnings.push("XO fee comes from /fee-rate alone, which is unreliable");
    warnings.push(...detail.omissions);

    const outcomes: OutcomeRef[] = detail.outcomes.map((o) => ({
      index: o.index,
      role: o.slot,
      label: untrusted(String(o.title)),
      tokenId: o.tokenId,
    }));

    const descriptionText = detail.rules.description === null ? "" : String(detail.rules.description);
    const parts = descriptionText === "" ? [] : [descriptionText];
    for (const r of detail.rules.outcomeRules) parts.push(`Outcome ${r.outcomeIndex}: ${String(r.rule)}`);
    const displayText = parts.join("\n\n");
    const sources = detail.resolutionSources.slice(0, 20).map(String);
    const ruleFields: RuleFields = {
      ...(displayText === "" ? {} : { rules: displayText }),
      resolutionSources: sources,
      resolverAddress: detail.resolverAddress,
      expiresAt: detail.expiresAt,
    };
    const lossy = lossyRuleRead(detail);
    const built = buildRules({
      venue: "xo",
      ...(lossy === null ? {} : { unhashable: lossy }),
      marketId: detail.conditionId,
      displayText,
      ruleFields,
      sources,
      mechanism: detail.resolutionType !== null && String(detail.resolutionType).toUpperCase() === "MANUAL" ? "xo_manual_modra" : "unknown",
      ...(detail.resolverAddress === null ? {} : { resolver: detail.resolverAddress }),
      ...(detail.expiresAt === null ? {} : { cutoffUtc: detail.expiresAt }),
      ...(detail.startsAt === null ? {} : { windowStartUtc: detail.startsAt }),
      void: "unknown",
    });
    if (!built.hashed) {
      reasons.push("rules_unavailable");
      warnings.push(built.hashProblem ?? "rules not hashable");
    }

    const fee = feeSpecFrom(detail, assessment.takerFeeBps, now);
    warnings.push(...fee.warnings);

    const market: AdapterMarket = {
      ref: { venue: "xo", marketId: detail.conditionId, native: { slug: String(detail.slug), id: String(detail.id), kind: detail.kind } },
      title: untrusted(String(detail.title)),
      outcomes,
      rules: built.rules,
      status,
      tradable: { ok: reasons.length === 0, reasons },
      timesUtc: {
        ...(detail.startsAt === null ? {} : { opensAt: detail.startsAt }),
        ...(detail.expiresAt === null ? {} : { closesAt: detail.expiresAt }),
      },
      // Global 0.001 tick; every sampled book reports the same value.
      tick: "0.001",
      // min_order_size is "0" on every live book and its unit is unconfirmed: left unknown.
      collateral: { symbol: "USDC", chain: "eip155:3223", decimals: 6, custody: "smart_account" },
      fee: fee.spec,
      prov: {
        fetchedAtMs: now,
        source: `${XO_BASE}/markets/contract/${detail.conditionId}`,
        adapterVersion: ADAPTER_VERSION,
        schemaHash: sha256Text(XO_SCHEMA_ID),
      },
      // XO's categoryPath (root first), names and slugs, matched against the fixed table; the title is the last resort.
      category: categorise({
        venue: "xo",
        native: detail.categoryPath.flatMap((c) => (c.slug === null ? [String(c.name)] : [String(c.name), String(c.slug)])),
        title: String(detail.title),
      }),
      extras: {
        ruleFields,
        rulesHashRecipe: built.rulesHashRecipe,
        coreRulesSha256: built.coreRulesSha256,
        statusRaw: untrusted(String(detail.statusRaw)),
        geoRestricted: null,
        warnings,
      },
    };
    return market;
  }

  return {
    id: "xo",
    descriptor: adapterDescriptor("xo", nowMs()),
    caps: {
      listMarkets: true,
      // Title-only, case-insensitive substring match; no ranking.
      search: true,
      getMarket: true,
      getBook: true,
      // POST /books is documented but was never tested; one GET per token.
      getBooksBatch: false,
      getFeeSpec: true,
      getResolution: true,
      getPositionsByAddress: false,
      stream: false,
    },

    async listMarkets(q): Promise<PmPage<MarketSummary>> {
      const page = parseCursor(q.cursor);
      const take = Math.min(Math.max(q.limit ?? DEFAULT_TAKE, 1), MAX_TAKE);
      let statuses: ListStatus[] | undefined;
      if (q.statuses !== undefined) {
        const mapped = new Set<ListStatus>();
        for (const s of q.statuses) for (const l of STATUS_TO_LIST[s] ?? []) mapped.add(l);
        if (mapped.size === 0) throw new AdapterFailure("NOT_SUPPORTED", "XO has no market status matching the request");
        statuses = LIST_STATUSES.filter((l) => mapped.has(l));
      }
      const result = await guarded(() =>
        client.listMarkets({
          page,
          take,
          ...(statuses === undefined ? {} : { statuses }),
          ...(q.text === undefined ? {} : { search: q.text }),
        }),
      );
      const now = nowMs();
      let items = result.markets.map((row) => summaryOf(row, now));
      if (q.statuses !== undefined) {
        const wanted = new Set<Status>(q.statuses);
        items = items.filter((m) => wanted.has(m.status));
      }
      return {
        items,
        skipped: result.skipped.map((row) => ({ index: row.index, reason: row.reason })),
        hasNext: result.meta.hasNextPage,
        ...(result.meta.hasNextPage ? { nextCursor: String(page + 1) } : {}),
      };
    },

    async getMarket(ref: MarketRef): Promise<AdapterMarket> {
      return loadMarket(ref);
    },

    async getBooks(tokens: TokenRef[], opts: { deadlineMs: number }): Promise<Array<Result<Book, AdapterError>>> {
      const started = nowMs();
      const out: Array<Result<Book, AdapterError>> = [];
      for (const token of tokens) {
        if (token.venue !== "xo" || tokenIdText(token.tokenId) === null) {
          out.push({ ok: false, error: "NOT_SUPPORTED", detail: "not an XO token id" });
          continue;
        }
        // deadlineMs is a budget in milliseconds from the start of the call.
        if (nowMs() - started >= opts.deadlineMs) {
          out.push({ ok: false, error: "TIMEOUT", detail: "call budget spent before this book was read" });
          continue;
        }
        try {
          const ob = await client.getBook(token.tokenId);
          const raw: RawSidedBook = {
            bids: ob.bids.map((l) => ({ price: formatMicro(l.priceMicro), size: formatMicro(l.sizeMicro) })),
            asks: ob.asks.map((l) => ({ price: formatMicro(l.priceMicro), size: formatMicro(l.sizeMicro) })),
          };
          const normalised = normalizeSortedBook(
            {
              token: { venue: "xo", tokenId: token.tokenId },
              asOfMs: nowMs(),
              venueTsMs: ob.timestampMs,
              ...(ob.hash === null ? {} : { hash: ob.hash }),
            },
            "best_first",
            raw,
          );
          out.push(normalised.ok ? { ok: true, value: normalised.value.book } : { ok: false, error: normalised.error, detail: normalised.detail ?? "" });
        } catch (error) {
          const failure = toAdapterFailure(error);
          out.push({ ok: false, error: failure.code, detail: failure.detail });
        }
      }
      return out;
    },

    async getFeeSpec(m: Market): Promise<FeeSpec> {
      // Re-reads the live parameters instead of trusting the Market passed in.
      return (await loadMarket(m.ref)).fee;
    },

    async health(): Promise<{ ok: boolean; notes: string[] }> {
      try {
        const state = await client.getTradingState();
        if (state.state === "active") return { ok: true, notes: ["XO trading state: active"] };
        if (state.state === "paused") return { ok: false, notes: ["XO trading state: paused"] };
        return { ok: false, notes: ["XO trading state is an unknown value"] };
      } catch (error) {
        const failure = toAdapterFailure(error);
        return { ok: false, notes: [`XO health check failed: ${failure.code}`] };
      }
    },
  };
}
