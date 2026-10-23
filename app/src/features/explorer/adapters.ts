// The seven readers of this release behind one small interface the Markets screen uses (docs/dapp-design.md 7.2 M0).
//
// Each reader takes the page's injected `deps` (fetch and clock) and builds absolute upstream URLs; the same code runs
// in the standalone build (direct to CORS-open hosts) and the Cockpit build (through the daemon's read proxy). The one
// exception is Limitless in the standalone build, read through our markets API (core/markets-api-limitless.ts). This
// file only adapts their differently shaped extras (skipped-row counts, XO settlement, shape status) to one record.

import { createLimitlessAdapter } from "@sdk/venues/limitless";
import { createHyperliquidAdapter, HYPERLIQUID_EXCLUDED_PERSONS_CLAUSE, HYPERLIQUID_SHAPE_STATUS } from "@sdk/venues/hyperliquid";
import { createManifoldAdapter } from "@sdk/venues/manifold";
import { createPascalAdapter } from "@sdk/venues/pascal";
import { createPolymarketAdapter } from "@sdk/venues/polymarket";
import { createTrueoAdapter } from "@sdk/venues/trueo";
import { createXoAdapter, xoBookAvailability, XO_FEE_STATUS, xoVariantForMode } from "@sdk/venues/xo";
import { MARKETS_API_ORIGIN } from "../../core/markets-api";
import { createMarketsApiLimitlessAdapter } from "../../core/markets-api-limitless";
import type { AdapterDeps, ListMarketsQuery, Market, MarketRef, MarketSummary, Page, VenueId, VenueReadAdapter } from "../../core/ports";
import type { AppMode } from "../../ui";

export interface ListOutcome {
  readonly page: Page<MarketSummary>;
  // Rows the reader refused (bad shape, unsupported kind). Counted and shown, never silently dropped.
  readonly refused: number;
  // True when the venue says more results exist than it returned and gives no cursor to reach them (a text search).
  // The screen must say "refine your search", never show a cut-off list as complete.
  readonly truncated: boolean;
}

export interface DetailOutcome {
  readonly market: Market;
  // Fixed sentences written by the reader about what was cut or dropped.
  readonly notes: readonly string[];
  readonly settlement: { readonly winningOutcomeIndex: number | null; readonly resolvedAt: string | null } | null;
}

// Where an order book would be shown.
export type BookAvailability =
  | { readonly state: "available" }
  // The venue blocks browsers: the standalone build shows the "needs the Cockpit" tile, never an empty book.
  | { readonly state: "needs_cockpit"; readonly what: string }
  | { readonly state: "none"; readonly why: string };

export interface ShapeStatusView {
  readonly status: "verified" | "unverified";
  readonly summary: string;
}

export interface ExplorerAdapter {
  readonly id: VenueId;
  readonly adapter: VenueReadAdapter;
  readonly books: BookAvailability;
  list(q: ListMarketsQuery): Promise<ListOutcome>;
  detail(ref: MarketRef): Promise<DetailOutcome>;
  // The argument for `getBooks({ deadlineMs })`. The readers disagree: XO reads a duration, Polymarket an absolute
  // time, the rest either. This is the one place that knows.
  deadlineFor(nowMs: number, budgetMs: number): number;
  // A fixed sentence about this venue's fee model status in a list column, or null when the list cannot say.
  readonly feeNote: string | null;
  // Present while the venue's response shapes are not verified against the live service.
  readonly shape: ShapeStatusView | null;
  // A fixed clause that must sit beside this venue's markets.
  readonly clause: string | null;
}

const NO_FEE = null;

// Venues the standalone build reads through our markets API (core/markets-api-limitless.ts) because the venue sends no
// CORS headers for this page: the Cockpit build reads them through the daemon instead. Empty when the build names no
// markets API.
export function readsViaMarketsApi(venue: VenueId, origin: string | null = MARKETS_API_ORIGIN): boolean {
  return origin !== null && venue === "limitless";
}

export function createExplorerAdapters(deps: AdapterDeps, mode: AppMode, marketsApiOrigin: string | null = MARKETS_API_ORIGIN): Partial<Record<VenueId, ExplorerAdapter>> {
  const transport = mode === "cockpit" ? ("T1" as const) : ("T0" as const);

  const xo = createXoAdapter(deps, { variant: xoVariantForMode(mode) });
  const polymarket = createPolymarketAdapter(deps, { transport });
  const trueo = createTrueoAdapter(deps);
  const hyperliquid = createHyperliquidAdapter(deps);
  const pascal = createPascalAdapter(deps, { transport });
  const manifold = createManifoldAdapter(deps);
  // The Cockpit build reads Limitless through the daemon. The standalone build reads it through our markets API, which
  // runs the same SDK reader on its server; without a markets API in the build the SDK reader stays, and refuses every
  // call before a request ("needs the Cockpit"): the screen never calls it there because the venue state says so first.
  const viaApi = mode !== "cockpit" && readsViaMarketsApi("limitless", marketsApiOrigin) && marketsApiOrigin !== null;
  const limitless = viaApi ? createMarketsApiLimitlessAdapter(deps, marketsApiOrigin) : createLimitlessAdapter(deps, { build: mode === "cockpit" ? "cockpit" : "standalone" });

  const duration = (_nowMs: number, budgetMs: number): number => budgetMs;
  const absolute = (nowMs: number, budgetMs: number): number => nowMs + budgetMs;

  const entries: ExplorerAdapter[] = [
    {
      id: "xo",
      adapter: xo,
      books: xoBookAvailability(xo.caps).state === "available" ? { state: "available" } : { state: "needs_cockpit", what: "XO order books" },
      async list(q) {
        const { page, skipped } = await xo.listMarketsDetailed(q);
        return { page, refused: skipped.length, truncated: false };
      },
      async detail(ref) {
        const result = await xo.getMarketDetail(ref);
        return { market: result.market, notes: result.notes, settlement: result.settlement };
      },
      deadlineFor: duration,
      feeNote: XO_FEE_STATUS === "curve_larger_rate" ? "documented curve, larger of two rates" : String(XO_FEE_STATUS).replace(/_/g, " "),
      shape: null,
      clause: null,
    },
    {
      id: "polymarket",
      adapter: polymarket,
      books: { state: "available" },
      async list(q) {
        const { page, rejected, truncated } = await polymarket.listMarketsDetailed(q);
        return { page, refused: rejected.length, truncated };
      },
      async detail(ref) {
        return { market: await polymarket.getMarket(ref), notes: [], settlement: null };
      },
      deadlineFor: absolute,
      feeNote: NO_FEE,
      shape: null,
      clause: null,
    },
    {
      id: "trueo",
      adapter: trueo,
      books: { state: "available" },
      async list(q) {
        const { page, skipped } = await trueo.listMarketsDetailed(q);
        return { page, refused: skipped.length, truncated: false };
      },
      async detail(ref) {
        return { market: await trueo.getMarket(ref), notes: [], settlement: null };
      },
      deadlineFor: absolute,
      feeNote: NO_FEE,
      shape: null,
      clause: null,
    },
    {
      id: "hyperliquid",
      adapter: hyperliquid,
      books: { state: "available" },
      async list(q) {
        const page = await hyperliquid.listMarkets(q);
        return { page, refused: hyperliquid.lastReadReport().dropped, truncated: false };
      },
      async detail(ref) {
        return { market: await hyperliquid.getMarket(ref), notes: [], settlement: null };
      },
      deadlineFor: absolute,
      feeNote: NO_FEE,
      shape: { status: HYPERLIQUID_SHAPE_STATUS.status === "verified" ? "verified" : "unverified", summary: HYPERLIQUID_SHAPE_STATUS.summary },
      clause: HYPERLIQUID_EXCLUDED_PERSONS_CLAUSE,
    },
    {
      id: "pascal",
      adapter: pascal,
      books: { state: "available" },
      async list(q) {
        const page = await pascal.listMarkets(q);
        return { page, refused: pascal.lastReadReport().dropped, truncated: false };
      },
      async detail(ref) {
        return { market: await pascal.getMarket(ref), notes: [], settlement: null };
      },
      deadlineFor: absolute,
      feeNote: NO_FEE,
      shape: null,
      clause: null,
    },
    {
      id: "manifold",
      adapter: manifold,
      books: { state: "none", why: "Manifold is a play-money venue with no order book" },
      async list(q) {
        const page = await manifold.listMarkets(q);
        return { page, refused: manifold.lastReadReport().dropped, truncated: false };
      },
      async detail(ref) {
        return { market: await manifold.getMarket(ref), notes: [], settlement: null };
      },
      deadlineFor: absolute,
      feeNote: NO_FEE,
      shape: null,
      clause: null,
    },
    {
      id: "limitless",
      adapter: limitless,
      books: mode === "cockpit" || viaApi ? { state: "available" } : { state: "needs_cockpit", what: "Limitless markets and order books" },
      async list(q) {
        const page = await limitless.listMarkets(q);
        return { page, refused: limitless.lastReadReport().dropped, truncated: false };
      },
      async detail(ref) {
        return { market: await limitless.getMarket(ref), notes: [], settlement: null };
      },
      deadlineFor: absolute,
      feeNote: NO_FEE,
      shape: null,
      clause: null,
    },
  ];
  const out: Partial<Record<VenueId, ExplorerAdapter>> = {};
  for (const entry of entries) out[entry.id] = Object.freeze(entry);
  return Object.freeze(out);
}
