import * as z from "zod/v4";

import { CATEGORIES, type Category } from "../sdk/category.js";
import { createRpcPort, rpcPostFromFetch, type RpcPort } from "../sdk/chain/rpc.js";
import { isVenueId, type FetchLike, type VenueId } from "../sdk/model.js";
import { decToAtomic } from "../sdk/money/decimal.js";
import { VENUE_IDS, venuePolicy } from "../sdk/venues/policy.js";
import { VenueStateTracker } from "../sdk/venues/state.js";
import { CHAIN_OF_VENUE, isChainReadVenue } from "../sdk/venues/state-fields.js";
import { API_VERSION, DEFAULT_RPC, type ApiConfig, type ChainKey } from "./config.js";
import { buildGroups, GroupsSource } from "./groups.js";
import { CHAIN_SPECS, chainSpecById, type ChainSpec } from "./indexer/chains.js";
import { ChainIndexer } from "./indexer/indexer.js";
import { RpcPool } from "./indexer/rpc-pool.js";
import { DEFAULT_PAGE, MarketService, matchesQuery, MAX_PAGE, type ListQuery } from "./markets.js";
import { groupLabel, legOutcomeIndex, legUnavailable, QUOTABLE_RELATIONS, quoteLeg, rankLegs, type LegQuote, type QuotableGroup } from "./quote.js";
import { NOT_BUILT_REASON, notBuilt, ownerOf, preparePolymarketLeg, routePrepareBodySchema, type PreparedLeg, type RoutePrepareBody } from "./route-prepare.js";
import type { IndexStore } from "./store.js";

// The API's parts and its route handlers, without HTTP (server.ts carries them). Built from sdk/ and its own code only.

export type ErrorCode =
  | "invalid_request"
  | "not_found"
  | "method_not_allowed"
  | "payload_too_large"
  | "uri_too_long"
  | "rate_limited"
  | "no_reader"
  | "venue_unavailable"
  | "market_not_found"
  | "internal"
  | "shutting_down"
  | "unauthorized"
  | "unsupported_media_type"
  | "group_not_found"
  | "group_not_quotable"
  | "route_prepare_not_enabled";

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  invalid_request: 400,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  uri_too_long: 414,
  rate_limited: 429,
  no_reader: 404,
  venue_unavailable: 503,
  market_not_found: 404,
  internal: 500,
  shutting_down: 503,
  unauthorized: 401,
  unsupported_media_type: 415,
  group_not_found: 404,
  group_not_quotable: 422,
  route_prepare_not_enabled: 403,
});

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;
  constructor(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export interface ApiDeps {
  readonly config: ApiConfig;
  readonly store: IndexStore | null;
  // The honest fetch for venue reads (upstream.ts) or, in tests, a fake per venue.
  readonly fetchFor: (venue: VenueId) => FetchLike;
  // The fetch every JSON-RPC endpoint is reached through.
  readonly rpcFetch: FetchLike;
  readonly nowMs: () => number;
  readonly log?: (line: string) => void;
  // The random source of an order's salt (node:crypto randomBytes by default); tests pass a fixed one.
  readonly random?: (bytes: number) => Buffer;
}

export interface Api {
  readonly markets: MarketService;
  readonly indexers: readonly ChainIndexer[];
  readonly tracker: VenueStateTracker;
  readonly startedMs: number;
  // Route handlers: plain JSON bodies, or an ApiError.
  health(): Record<string, unknown>;
  venues(): Record<string, unknown>;
  listMarkets(query: URLSearchParams): Promise<Record<string, unknown>>;
  market(venue: string, id: string): Promise<Record<string, unknown>>;
  groups(): Record<string, unknown>;
  // Paid routes (metering is the server's, metering.ts): the handlers themselves never see money.
  quote(query: URLSearchParams): Promise<Record<string, unknown>>;
  routePrepare(body: unknown): Promise<Record<string, unknown>>;
  // The shape checks of the paid routes alone (no read, no group lookup): run before any payment is asked for.
  checkPaid(kind: "quote" | "route_prepare", query: URLSearchParams, body: unknown): void;
}

// The one answer for a venue the API does not read: not a venue id, or a venue with no keyless reader (markets.ts).
export const NO_READER = "The API has no reader for this venue.";

// A quote's size is in shares: above zero, at most this many, at most 6 decimal places.
export const MAX_QUOTE_SHARES = 1_000_000n;

// The read methods an indexer port may send.
const INDEXER_METHODS = ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getLogs", "eth_getCode", "eth_getStorageAt"] as const;

export function makePort(url: string, fetch: FetchLike, nowMs: () => number): RpcPort {
  // A log answer can be large; the port refuses one over the cap and the indexer asks for fewer blocks.
  return createRpcPort({ url, post: rpcPostFromFetch(fetch, { nowMs, maxBodyChars: 8_000_000 }), methods: [...INDEXER_METHODS], maxLogBlockRange: 10_000n });
}

const MARKET_ID = /^[A-Za-z0-9_.:#-]{1,120}$/;

const listQuerySchema = z
  .object({
    venue: z.string().max(40).optional(),
    category: z.enum(CATEGORIES).optional(),
    q: z.string().min(1).max(100).optional(),
    limit: z.string().regex(/^[1-9][0-9]{0,2}$/).optional(),
    cursor: z.string().regex(/^(0|[1-9][0-9]{0,5})$/).optional(),
  })
  .strict();

function single(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    if (all.length !== 1) throw new ApiError("invalid_request", "Each query parameter may be given once.");
    out[key] = all[0] as string;
  }
  return out;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const quoteQuerySchema = z
  .object({
    group: z.string().regex(/^lnk_[0-9a-f]{32}$/),
    side: z.enum(["buy", "sell"]),
    size: z.string().max(20).regex(/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,6})?$/),
    outcome: z.string().regex(/^(0|[1-9][0-9]?)$/).optional(),
  })
  .strict();

export function createApi(deps: ApiDeps): Api {
  const { config, store, nowMs } = deps;
  const log = deps.log ?? (() => undefined);
  const tracker = new VenueStateTracker();
  const startedMs = nowMs();

  // Chains the index reads on this server, and the indexers.
  const specs = new Map<ChainKey, ChainSpec>();
  const indexers: ChainIndexer[] = [];
  if (config.indexer && store !== null) {
    for (const chain of config.chains) {
      const spec = CHAIN_SPECS[chain.chain];
      specs.set(chain.chain, spec);
      const pool = new RpcPool(spec.chainId, chain.rpcUrls.map((url) => makePort(url, deps.rpcFetch, nowMs)), nowMs);
      indexers.push(new ChainIndexer({ spec, config: chain, store, pool, nowMs, log }));
    }
  }
  const chainOf = (venue: VenueId): ChainSpec | null => {
    if (!isChainReadVenue(venue)) return null;
    const spec = chainSpecById(CHAIN_OF_VENUE[venue].chainId);
    return spec !== null && specs.has(spec.key) ? spec : null;
  };

  // Trueo is read on Base: the first configured Base RPC, or the SDK's public one.
  const baseRpc = config.chains.find((c) => c.chain === "base")?.rpcUrls[0] ?? (DEFAULT_RPC.base[0] as string);
  const markets = new MarketService({
    fetchFor: deps.fetchFor,
    tracker,
    nowMs,
    store: config.indexer ? store : null,
    chainOf,
    trueoRpcUrl: baseRpc,
    budgetMs: config.limits.upstreamBudgetMs,
  });
  const groupsSource = new GroupsSource(config.links, config.candidates, nowMs);

  function indexerStatus(): Record<string, unknown>[] {
    return indexers.map((indexer) => ({ ...indexer.status() }));
  }

  function health(): Record<string, unknown> {
    const now = nowMs();
    return {
      ok: true,
      version: API_VERSION,
      uptimeS: Math.floor((now - startedMs) / 1000),
      asOfMs: now,
      store: store === null ? "none" : "open",
      indexer: config.indexer ? indexerStatus().map((s) => ({ chain: s["chain"], state: s["state"], lagBlocks: s["lagBlocks"] })) : "off",
      readers: markets.readVenues(),
      limits: {
        markets: { burst: config.limits.markets.capacity, perMinute: config.limits.markets.refillPerSecond * 60 },
        reads: { burst: config.limits.reads.capacity, perMinute: config.limits.reads.refillPerSecond * 60 },
        maxUrlChars: config.limits.maxUrlChars,
        paid: { burst: config.limits.paid.capacity, perMinute: config.limits.paid.refillPerSecond * 60, note: "per client without a key; a key brings its own limit" },
        bodies: `POST /v1/route/prepare only: JSON, at most ${config.limits.maxBodyBytes} bytes`,
      },
    };
  }

  function venues(): Record<string, unknown> {
    const now = nowMs();
    return {
      asOfMs: now,
      venues: VENUE_IDS.map((id) => {
        const spec = isChainReadVenue(id) ? chainSpecById(CHAIN_OF_VENUE[id].chainId) : null;
        const reading = markets.hasReader(id);
        return {
          id,
          name: venuePolicy(id).name,
          reader: reading,
          caps: markets.caps(id),
          // A venue without a reader is never asked, so it has no read state of its own.
          state: reading ? markets.stateView(id, now) : { kind: "not_read", reason: NO_READER, next: null },
          list: reading ? markets.listInfo(id, now) : null,
          chain: spec === null ? null : { chainId: spec.chainId, via: spec.via, indexed: specs.has(spec.key) },
        };
      }),
      indexer: config.indexer ? indexerStatus() : [],
    };
  }

  function parseList(params: URLSearchParams): ListQuery {
    const parsed = listQuerySchema.safeParse(single(params));
    if (!parsed.success) throw new ApiError("invalid_request", "The query does not match: venue, category (one of the fixed nine), q (1 to 100 characters), limit (1 to 100) and cursor are accepted.");
    const data = parsed.data;
    let venue: VenueId | null = null;
    if (data.venue !== undefined) {
      if (!isVenueId(data.venue) || !markets.hasReader(data.venue)) throw new ApiError("no_reader", NO_READER);
      venue = data.venue;
    }
    if (data.q !== undefined && CONTROL.test(data.q)) throw new ApiError("invalid_request", "q may not hold control characters.");
    const limit = data.limit === undefined ? DEFAULT_PAGE : Number(data.limit);
    if (limit > MAX_PAGE) throw new ApiError("invalid_request", `limit is at most ${MAX_PAGE}.`);
    return { venue, category: (data.category ?? null) as Category | null, q: data.q === undefined ? null : data.q.toLowerCase(), limit, offset: data.cursor === undefined ? 0 : Number(data.cursor) };
  }

  async function listMarkets(params: URLSearchParams): Promise<Record<string, unknown>> {
    const query = parseList(params);
    const wanted = query.venue === null ? markets.readVenues() : [query.venue];
    const reads = await Promise.all(wanted.map(async (venue) => ({ venue, read: await markets.list(venue) })));
    const now = nowMs();
    const rows: Record<string, unknown>[] = [];
    const states: Record<string, unknown>[] = [];
    for (const { venue, read } of reads) {
      states.push({ venue, state: markets.stateView(venue, now), rows: read.rows.length, readAtMs: read.readAtMs, ageMs: read.readAtMs === null ? null : Math.max(0, now - read.readAtMs), fresh: read.fresh });
      for (const row of read.rows) if (matchesQuery(row, query)) rows.push(markets.present(venue, row, read.fresh, now));
    }
    const page = rows.slice(query.offset, query.offset + query.limit);
    const end = query.offset + page.length;
    return { asOfMs: now, venues: states, total: rows.length, markets: page, next: end < rows.length ? String(end) : null };
  }

  async function market(venue: string, id: string): Promise<Record<string, unknown>> {
    if (!isVenueId(venue) || !markets.hasReader(venue)) throw new ApiError("no_reader", NO_READER);
    if (!MARKET_ID.test(id)) throw new ApiError("invalid_request", "The market id is not one this API reads.");
    try {
      const answer = await markets.market(venue, id);
      if (answer === null) throw new ApiError("no_reader", NO_READER);
      return { asOfMs: nowMs(), ...answer };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code = (error as { code?: unknown }).code;
      if (code === "NOT_FOUND") throw new ApiError("market_not_found", "The venue has no such market.");
      const state = markets.stateView(venue, nowMs());
      throw new ApiError("venue_unavailable", state.reason ?? "The venue could not be read and nothing is kept for this market.");
    }
  }

  function groups(): Record<string, unknown> {
    const [approved, candidates] = groupsSource.current();
    return { asOfMs: nowMs(), ...buildGroups(approved, candidates, nowMs()) };
  }

  // A group as /v1/groups serves it (candidates as proposed), or an ApiError.
  function quotableGroup(linkId: string, outcome: number): QuotableGroup {
    const [approved, candidates] = groupsSource.current();
    const answer = buildGroups(approved, candidates, nowMs());
    const found = answer.approved.find((l) => l.linkId === linkId);
    const proposed = answer.proposed.find((l) => l.linkId === linkId);
    const group: QuotableGroup | null = found !== undefined ? { link: found, state: "approved" } : proposed !== undefined ? { link: proposed, state: "proposed" } : null;
    if (group === null) throw new ApiError("group_not_found", "No group with that id among the groups this API serves (GET /v1/groups).");
    if (!(QUOTABLE_RELATIONS as readonly string[]).includes(group.link.relation)) throw new ApiError("group_not_quotable", `Only identity links are quoted or routed; this one is ${group.link.relation}.`);
    if (Date.parse(group.link.validUntil) <= nowMs()) throw new ApiError("group_not_quotable", "The link is past its validUntil.");
    const first = group.link.legs[0];
    if (first === undefined || legOutcomeIndex(first.outcomeMap, outcome) === null) throw new ApiError("invalid_request", "The outcome is not one of the link's outcomes.");
    return group;
  }

  function venueFailure(venue: VenueId, error: unknown): string {
    const code = (error as { code?: unknown }).code;
    if (code === "NOT_FOUND") return "The venue has no such market.";
    return markets.stateView(venue, nowMs()).reason ?? "The venue could not be read and nothing is kept for this market.";
  }

  function parseQuote(params: URLSearchParams): { readonly data: z.infer<typeof quoteQuerySchema>; readonly outcome: number } {
    const parsed = quoteQuerySchema.safeParse(single(params));
    if (!parsed.success) throw new ApiError("invalid_request", "The query does not match: group (a link id), side (buy or sell), size (shares above 0, at most 6 places) and outcome (optional, 0 to 31) are accepted.");
    const data = parsed.data;
    const sizeAtomic = decToAtomic(data.size, 6);
    if (!sizeAtomic.ok || sizeAtomic.value <= 0n || sizeAtomic.value > MAX_QUOTE_SHARES * 1_000_000n) throw new ApiError("invalid_request", `size is above 0 and at most ${MAX_QUOTE_SHARES.toString()} shares.`);
    const outcome = data.outcome === undefined ? 0 : Number(data.outcome);
    if (outcome > 31) throw new ApiError("invalid_request", "outcome is 0 to 31.");
    return { data, outcome };
  }

  function parsePrepare(body: unknown): RoutePrepareBody {
    const parsed = routePrepareBodySchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError("invalid_request", `The body does not match the route prepare schema${issue === undefined ? "" : ` at ${issue.path.map(String).join(".") || "the top"}: ${issue.message}`}.`);
    }
    if (ownerOf(parsed.data.owner) === null) throw new ApiError("invalid_request", "owner must be a non-zero address (with a valid EIP-55 checksum if it is mixed case).");
    return parsed.data;
  }

  function checkPaid(kind: "quote" | "route_prepare", params: URLSearchParams, body: unknown): void {
    if (kind === "quote") parseQuote(params);
    else {
      if ([...params.keys()].length > 0) throw new ApiError("invalid_request", "This route takes no query.");
      parsePrepare(body);
    }
  }

  async function quote(params: URLSearchParams): Promise<Record<string, unknown>> {
    const { data, outcome } = parseQuote(params);
    const group = quotableGroup(data.group, outcome);
    const legs: LegQuote[] = await Promise.all(
      group.link.legs.map(async (leg): Promise<LegQuote> => {
        const venue = leg.venue;
        const index = legOutcomeIndex(leg.outcomeMap, outcome);
        if (index === null) return legUnavailable(venue, leg.nativeId, null, "The link's outcome map does not name this outcome exactly once on this leg.");
        if (!markets.hasReader(venue)) return legUnavailable(venue, leg.nativeId, index, NO_READER);
        try {
          const view = await markets.tradeView(venue, leg.nativeId);
          if (view === null) return legUnavailable(venue, leg.nativeId, index, NO_READER);
          return quoteLeg({ venue, marketId: leg.nativeId, outcomeIndex: index, view }, data.side, data.size, nowMs());
        } catch (error) {
          return legUnavailable(venue, leg.nativeId, index, venueFailure(venue, error));
        }
      }),
    );
    const ranked = rankLegs(legs, data.side);
    const best = ranked[0]?.rank === 1 ? ranked[0] : null;
    return {
      asOfMs: nowMs(),
      group: groupLabel(group),
      request: { side: data.side, outcome, size: data.size, unit: "shares" },
      best: best === null ? null : { venue: best.venue, marketId: best.marketId, netCost: best.quote?.netCost ?? null, vwap: best.quote?.vwap ?? null },
      legs: ranked,
      method:
        "Each leg is the SDK engine's depth walk (sdk/engine/walk.ts quoteBook) of the stated size against the leg's book, with the venue's fee spec (sdk/engine/fees.ts). A buy's net cost is the notional plus the fee; a sell's the notional less the fee. Executable legs are ranked by net cost; a leg with an unknown or stale fee, a complement or crossed book, an untradable market or too little depth is listed unranked with the reason.",
    };
  }

  async function routePrepare(body: unknown): Promise<Record<string, unknown>> {
    if (config.routePrepare === "off") throw new ApiError("route_prepare_not_enabled", "Route prepare is not enabled on this server.");
    const data = parsePrepare(body);
    const owner = ownerOf(data.owner) as NonNullable<ReturnType<typeof ownerOf>>;
    const group = quotableGroup(data.group, data.outcome);
    const seen = new Set<string>();
    for (const leg of data.legs) {
      const key = `${leg.venue}|${leg.marketId}`;
      if (seen.has(key)) throw new ApiError("invalid_request", "Each leg may be named once.");
      seen.add(key);
      if (!group.link.legs.some((g) => g.venue === leg.venue && g.nativeId === leg.marketId)) throw new ApiError("invalid_request", "Every leg must be one of the group's legs (venue and marketId as GET /v1/groups lists them).");
    }
    const now = nowMs();
    const legs: PreparedLeg[] = await Promise.all(
      data.legs.map(async (leg): Promise<PreparedLeg> => {
        const groupLeg = group.link.legs.find((g) => g.venue === leg.venue && g.nativeId === leg.marketId);
        const venue = groupLeg?.venue as VenueId;
        const index = groupLeg === undefined ? null : legOutcomeIndex(groupLeg.outcomeMap, data.outcome);
        if (index === null) return notBuilt(venue, leg.marketId, null, "Not built: the link's outcome map does not name this outcome exactly once on this leg.");
        if (venue !== "polymarket") return notBuilt(venue, leg.marketId, index, NOT_BUILT_REASON[venue] ?? "Not built: sdk/trade has no order builder for this venue.");
        if (!markets.hasReader(venue)) return notBuilt(venue, leg.marketId, index, "Not built: the API has no reader for this venue.");
        try {
          const view = await markets.tradeView(venue, leg.marketId);
          if (view === null) return notBuilt(venue, leg.marketId, index, "Not built: the API has no reader for this venue.");
          return preparePolymarketLeg({ marketId: leg.marketId, outcomeIndex: index, view, owner, side: data.side, price: leg.price, shares: leg.shares, tif: leg.tif }, { nowMs: now, ...(deps.random === undefined ? {} : { random: deps.random }) });
        } catch (error) {
          return notBuilt(venue, leg.marketId, index, `Not built: ${venueFailure(venue, error)}`);
        }
      }),
    );
    return {
      asOfMs: now,
      group: groupLabel(group),
      owner,
      side: data.side,
      outcome: data.outcome,
      legs,
      submitted: false,
      custody: "None. The API built these orders from the SDK's builders and the venue data it read; it holds no key or venue credential, signed nothing and submitted nothing.",
    };
  }

  log(`api ${API_VERSION}: reading ${markets.readVenues().join(", ") || "no venue"}; ${indexers.length} chain indexer(s)`);
  return { markets, indexers, tracker, startedMs, health, venues, listMarkets, market, groups, quote, routePrepare, checkPaid };
}
