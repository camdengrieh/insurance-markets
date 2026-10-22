// XO read adapter. A thin layer over the shared XO parser in sdk/venues/xo: its client (./api/client.ts) owns
// every XO trap (marketType=2,4 discovery, take<=50, paging on meta.hasNextPage only, micro-unit parsing, strict
// decoders that fail closed, explicit User-Agent, host allowlist) and its reader mapping (./map.ts) turns the
// decoded detail, list rows and books into the SDK read model. Nothing here decodes an XO response or maps one by
// hand: the Market comes from the SDK mapping through ./from-sdk.ts, and this file adds only what pm has and the
// dApp does not (the orderbook cross-check, the rules-hash sentinel and extras, the pm FeeSpec, warnings).
// Transport (fetch, clock, sleep) is injected through the client options; src/xo/client.ts fills Node's defaults.
//
// Mapping notes:
//   - marketId is the conditionId. Outcome 0 is the Yes slot and outcome 1 the No slot even for
//     team-named markets, so roles come from the slot, never from the title.
//   - Prices come from the orderbook only. List display prices and the constant detail
//     currentPrice are dropped by the client and never reach a Book or Quote.
//   - Fee: the SDK decides whether the fee is known (only the FLAT_BPS model, the larger of /fee-rate and
//     effectiveFeeConfig); pm/core/fee-specs.ts builds pm's spec from that figure. The two sources disagree
//     live, so the market carries a warning and pm/core refuses the executable tier until a real fill
//     reconciles them.
//   - XO has no batch book route that was ever tested, so getBooks fetches one token at a time.
//   - Sizes and prices are micro integers inside the client; the SDK mapping turns them into exact decimal
//     strings and pm/core into rationals. No floating point.

import { XoClient } from "../../src/xo/client.js";
import type { HttpOptions } from "../../src/xo/http.js";
import { DEFAULT_TAKE, LIST_STATUSES, MAX_TAKE, lifecycleOf, type XoClient as SdkXoClient } from "../../sdk/venues/xo/api/client.js";
import type { Lifecycle, MarketDetail } from "../../sdk/venues/xo/api/types.js";
import { bookOf, feeSpecOf, marketOf, statusOfLifecycle, summaryOf, xoStatusesFor } from "../../sdk/venues/xo/index.js";
import { normalizeSortedBook } from "../core/books.js";
import { unknownFeeSpec, xoFeeSpec, type FeeSource } from "../core/fee-specs.js";
import type { AdapterError, Book, FeeSpec, Market, MarketRef, MarketSummary, Result, Status, TokenRef } from "../types.js";
import { untrusted } from "../types.js";
import { AdapterFailure, toAdapterFailure } from "./errors.js";
import { marketFromSdk, summaryFromSdk } from "./from-sdk.js";
import { xoLossyRuleRead, xoRulesText } from "../../sdk/rules.js";
import { buildRules } from "./rules.js";
import { adapterDescriptor, XO_HOSTS } from "./policy.js";
import type { AdapterMarket, PmPage, PmVenueAdapter, RuleFields } from "./types.js";
import { tokenIdText } from "./values.js";

export interface XoAdapterOptions {
  // Inject a prepared client (tests, or the plugin sharing one client with the xo_* reads).
  readonly client?: SdkXoClient;
  // Otherwise a client is built from these options. The host list is always the two XO read
  // hosts; a caller-supplied allowedHosts is ignored.
  readonly http?: HttpOptions;
  // Wall clock in epoch milliseconds (provenance, lifecycle, book age). Default Date.now.
  readonly nowMs?: () => number;
}

const XO_BASE = "https://api-mainnet.xo.market/api";
const FEE_TTL_SEC = 300;

// Lifecycle -> normalised status: the SDK's one table (sdk/venues/xo/map.ts statusOfLifecycle).
export function xoStatusOf(lifecycle: Lifecycle): Status {
  return statusOfLifecycle(lifecycle);
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

  async function loadMarket(ref: MarketRef): Promise<AdapterMarket> {
    rejectRef(ref);
    // Data API detail plus the orderbook market (Yes/No tokens cross-checked) plus /fee-rate for both tokens.
    const assessment = await guarded(() => client.getFeeAssessment(ref.marketId));
    const now = nowMs();
    const detail = assessment.market.market;
    const orderbook = assessment.market.orderbook;
    // The shared reader's mapping: ref, sanitised title and outcome labels, rules text and https-only sources,
    // status, times, tick, collateral, provenance and category.
    const shared = marketOf(detail, now, now).market;
    const lifecycle = lifecycleOf(detail, now);

    const reasons: string[] = [];
    if (lifecycle !== "open") reasons.push(`lifecycle_${lifecycle}`);
    if (!orderbook.active) reasons.push("orderbook_inactive");
    if (detail.reviewStatus === "REJECT") reasons.push("review_rejected");
    // The shared reader's metadata gates beyond those (review status missing or not approved, a fee config that is
    // not eligible). Its status gate is the lifecycle reason above, and its rejected-review reason is review_rejected.
    for (const reason of shared.tradable.reasons) {
      if (reason.startsWith("status_") || reason === "review_reject") continue;
      if (!reasons.includes(reason)) reasons.push(reason);
    }

    const warnings: string[] = [];
    if (detail.reviewStatus === "UPDATE_REQUIRED") warnings.push("XO review status is UPDATE_REQUIRED");
    if (detail.resolutionFlagCount !== null && detail.resolutionFlagCount > 0) {
      warnings.push(`XO reports ${detail.resolutionFlagCount} resolution flag(s)`);
    }
    if (detail.feeConfigProblem !== null) warnings.push("XO effectiveFeeConfig was present but unusable");
    if (assessment.status === "disagree") warnings.push("XO /fee-rate and effectiveFeeConfig disagree; the larger figure is used");
    if (assessment.status === "fee_rate_only") warnings.push("XO fee comes from /fee-rate alone, which is unreliable");
    warnings.push(...detail.omissions);

    // The hash input pm exposes (extras.ruleFields) and pins (rules.sha256). The client cuts rules.description,
    // reads only the first outcomeRules and resolutionSources, and drops unreadable entries, recording each in
    // detail.omissions; a hash over what was kept would pin something other than the rules, so any such omission
    // makes the rules unhashable instead (sdk/rules.ts, shared with the linker and the dApp).
    const displayText = xoRulesText(detail);
    const sources = detail.resolutionSources.slice(0, 20).map(String);
    const ruleFields: RuleFields = {
      ...(displayText === "" ? {} : { rules: displayText }),
      resolutionSources: sources,
      resolverAddress: detail.resolverAddress,
      expiresAt: detail.expiresAt,
    };
    const lossy = xoLossyRuleRead(detail);
    const built = buildRules({
      venue: "xo",
      ...(lossy === null ? {} : { unhashable: lossy }),
      marketId: detail.conditionId,
      displayText,
      ruleFields,
      sources,
      mechanism: shared.rules.mechanism,
      void: shared.rules.void,
    });
    if (!built.hashed) {
      reasons.push("rules_unavailable");
      warnings.push(built.hashProblem ?? "rules not hashable");
    }

    const fee = feeSpecFrom(detail, assessment.feeRateBps, now);
    warnings.push(...fee.warnings);

    const market: AdapterMarket = {
      ...marketFromSdk(shared, fee.spec),
      // The shared rules block (sanitised text, https-only sources), with pm's hash slot: the rules-v2 value over
      // extras.ruleFields, or a sentinel that is not hex and embeds the market id when the rules cannot be hashed.
      rules: { ...shared.rules, sha256: built.rules.sha256 },
      tradable: { ok: reasons.length === 0, reasons },
      extras: {
        ruleFields,
        rulesHashRecipe: built.rulesHashRecipe,
        statusRaw: untrusted(String(detail.statusRaw)),
        geoRestricted: null,
        warnings,
      },
    };
    return market;
  }

  // The SDK decides whether the fee is known and which figure applies (sdk/venues/xo/map.ts feeSpecOf); pm builds its
  // own spec from that figure (pm/core/fee-specs.ts), because pm/core/fees.ts prices with its own model.
  function feeSpecFrom(detail: MarketDetail, feeRateBps: readonly number[], now: number): { spec: FeeSpec; warnings: string[] } {
    const source: FeeSource = {
      url: `${XO_BASE}/markets/contract/${detail.conditionId}`,
      field: "effectiveFeeConfig.takerFeeBps,/fee-rate",
      granularity: "market",
      verifiedAt: new Date(now).toISOString(),
      ttlSec: FEE_TTL_SEC,
    };
    const shared = feeSpecOf(detail, now, feeRateBps);
    if (shared.modelId === "unknown" || shared.taker?.bps === undefined) {
      return { spec: unknownFeeSpec("xo", source), warnings: ["XO fee is unknown; no net figure can be computed"] };
    }
    return {
      spec: xoFeeSpec({
        takerBps: String(shared.taker.bps),
        ...(shared.maker?.bps === undefined ? {} : { makerBps: String(shared.maker.bps) }),
        source,
      }),
      warnings: [],
    };
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
      let statuses: (typeof LIST_STATUSES)[number][] | undefined;
      if (q.statuses !== undefined) {
        // The shared status table (sdk/venues/xo/adapter.ts xoStatusesFor), in the Data API's own order.
        const mapped = new Set(xoStatusesFor(q.statuses));
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
      let items = result.markets.map((row) => summaryFromSdk(summaryOf(row, now, now)));
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
          // The shared mapping gives exact decimal levels, already sorted best first; pm/core then checks the ladder
          // (empty, crossed or locked books are refused there) and tags the convention.
          const shared = bookOf(await client.getBook(token.tokenId), nowMs());
          const normalised = normalizeSortedBook(
            {
              token: { venue: "xo", tokenId: token.tokenId },
              asOfMs: shared.asOfMs,
              ...(shared.venueTsMs === undefined ? {} : { venueTsMs: shared.venueTsMs }),
              ...(shared.hash === undefined ? {} : { hash: shared.hash }),
            },
            "best_first",
            { bids: shared.bids, asks: shared.asks },
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
