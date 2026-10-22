import * as z from "zod/v4";

import { CATEGORIES, type Category } from "../sdk/category.js";
import { createRpcPort, rpcPostFromFetch, type RpcPort } from "../sdk/chain/rpc.js";
import { isVenueId, type FetchLike, type VenueId } from "../sdk/model.js";
import { DATA_TERMS } from "../sdk/venues/licence.js";
import { VENUE_IDS, venuePolicy } from "../sdk/venues/policy.js";
import { VenueStateTracker } from "../sdk/venues/state.js";
import { CHAIN_OF_VENUE, isChainReadVenue } from "../sdk/venues/state-fields.js";
import { API_VERSION, DEFAULT_RPC, type ApiConfig, type ChainKey } from "./config.js";
import { buildGroups, GroupsSource } from "./groups.js";
import { CHAIN_SPECS, chainSpecById, type ChainSpec } from "./indexer/chains.js";
import { ChainIndexer } from "./indexer/indexer.js";
import { RpcPool } from "./indexer/rpc-pool.js";
import { DEFAULT_PAGE, MarketService, matchesQuery, MAX_PAGE, type ListQuery } from "./markets.js";
import type { ServingPolicy } from "./serving.js";
import type { IndexStore } from "./store.js";

// The API's parts and its route handlers, without HTTP (server.ts carries them). Built from sdk/ and its own code only.

export type ErrorCode =
  | "invalid_request"
  | "not_found"
  | "method_not_allowed"
  | "payload_too_large"
  | "uri_too_long"
  | "rate_limited"
  | "venue_not_served"
  | "venue_unavailable"
  | "market_not_found"
  | "internal"
  | "shutting_down";

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  invalid_request: 400,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  uri_too_long: 414,
  rate_limited: 429,
  venue_not_served: 403,
  venue_unavailable: 503,
  market_not_found: 404,
  internal: 500,
  shutting_down: 503,
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
  readonly policy: ServingPolicy;
  readonly store: IndexStore | null;
  // The honest fetch for venue reads (upstream.ts) or, in tests, a fake per venue.
  readonly fetchFor: (venue: VenueId) => FetchLike;
  // The fetch every JSON-RPC endpoint is reached through.
  readonly rpcFetch: FetchLike;
  readonly nowMs: () => number;
  readonly log?: (line: string) => void;
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
}

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

export function createApi(deps: ApiDeps): Api {
  const { config, policy, store, nowMs } = deps;
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
    policy,
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
      served: markets.servedVenues(),
      limits: {
        markets: { burst: config.limits.markets.capacity, perMinute: config.limits.markets.refillPerSecond * 60 },
        reads: { burst: config.limits.reads.capacity, perMinute: config.limits.reads.refillPerSecond * 60 },
        maxUrlChars: config.limits.maxUrlChars,
        bodies: "none accepted",
      },
    };
  }

  function venues(): Record<string, unknown> {
    const now = nowMs();
    return {
      asOfMs: now,
      venues: VENUE_IDS.map((id) => {
        const p = venuePolicy(id);
        const verdict = policy.servability(id);
        const spec = isChainReadVenue(id) ? chainSpecById(CHAIN_OF_VENUE[id].chainId) : null;
        const reading = markets.hasReader(id);
        const list = reading ? markets.listInfo(id, now) : null;
        return {
          id,
          name: p.name,
          tier: p.tier,
          licence: verdict.licence,
          dataTerms: verdict.dataTerms,
          served: verdict.served,
          ...(verdict.served ? {} : { notServed: { code: verdict.code, reason: verdict.reason } }),
          clause: p.clause,
          reader: reading,
          caps: markets.caps(id),
          // A venue that is not served is never asked, so it has no read state of its own.
          state: reading ? markets.stateView(id, now) : { kind: "not_read", reason: verdict.served ? "The API has no reader for this venue." : verdict.reason, next: null },
          list,
          chain: spec === null ? null : { chainId: spec.chainId, via: spec.via, indexed: specs.has(spec.key) },
        };
      }),
      indexer: config.indexer ? indexerStatus() : [],
      dataTermsSource: `platform registry, ${Object.keys(DATA_TERMS).length} records (sdk/venues/licence.ts)`,
    };
  }

  function parseList(params: URLSearchParams): ListQuery {
    const parsed = listQuerySchema.safeParse(single(params));
    if (!parsed.success) throw new ApiError("invalid_request", "The query does not match: venue, category (one of the fixed nine), q (1 to 100 characters), limit (1 to 100) and cursor are accepted.");
    const data = parsed.data;
    let venue: VenueId | null = null;
    if (data.venue !== undefined) {
      const verdict = policy.servability(data.venue);
      if (!verdict.served) throw new ApiError("venue_not_served", verdict.reason, { code: verdict.code });
      if (!isVenueId(data.venue)) throw new ApiError("venue_not_served", "Not a venue this API knows.");
      venue = data.venue;
    }
    if (data.q !== undefined && CONTROL.test(data.q)) throw new ApiError("invalid_request", "q may not hold control characters.");
    const limit = data.limit === undefined ? DEFAULT_PAGE : Number(data.limit);
    if (limit > MAX_PAGE) throw new ApiError("invalid_request", `limit is at most ${MAX_PAGE}.`);
    return { venue, category: (data.category ?? null) as Category | null, q: data.q === undefined ? null : data.q.toLowerCase(), limit, offset: data.cursor === undefined ? 0 : Number(data.cursor) };
  }

  async function listMarkets(params: URLSearchParams): Promise<Record<string, unknown>> {
    const query = parseList(params);
    const wanted = query.venue === null ? markets.servedVenues() : [query.venue];
    if (query.venue !== null && !markets.hasReader(query.venue)) throw new ApiError("venue_not_served", "The API has no reader for this venue.");
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
    const verdict = policy.servability(venue);
    if (!verdict.served) throw new ApiError("venue_not_served", verdict.reason, { code: verdict.code });
    if (!isVenueId(venue) || !markets.hasReader(venue)) throw new ApiError("venue_not_served", "The API has no reader for this venue.");
    if (!MARKET_ID.test(id)) throw new ApiError("invalid_request", "The market id is not one this API reads.");
    try {
      const answer = await markets.market(venue, id);
      if (answer === null) throw new ApiError("venue_not_served", "The API has no reader for this venue.");
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
    return { asOfMs: nowMs(), ...buildGroups(approved, candidates, policy, nowMs()) };
  }

  log(`api ${API_VERSION}: serving ${markets.servedVenues().join(", ") || "no venue"}; ${indexers.length} chain indexer(s)`);
  return { markets, indexers, tracker, startedMs, health, venues, listMarkets, market, groups };
}
