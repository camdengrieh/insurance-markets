import { untrustedField } from "../../core/untrusted";
import type {
  AdapterCaps,
  AdapterDeps,
  AdapterError,
  Book,
  FeeSpec,
  ListMarketsQuery,
  Market,
  MarketRef,
  MarketSummary,
  Page,
  Result,
  Status,
  TokenRef,
  Transport,
  VenueHealth,
  VenueReadAdapter,
} from "../../core/ports";
import { parseBook } from "./book";
import {
  CLOB_ORIGIN,
  DATA_ORIGIN,
  DATA_V2_PREFIX,
  DEFAULT_BOOK_CONCURRENCY,
  DEFAULT_LIST_LIMIT,
  DEFAULT_POSITIONS_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  GAMMA_ORIGIN,
  MAX_BOOK_CONCURRENCY,
  MAX_CURSOR_CHARS,
  MAX_LIST_LIMIT,
  MAX_POSITIONS_LIMIT,
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_TEXT_CHARS,
  VENUE,
} from "./constants";
import { codeOf, drift, PolymarketError } from "./errors";
import { parseGeoblock, uncheckedGeoblock, type GeoblockStatus } from "./geoblock";
import { buildUrl, getJson, getText, seg, type Query } from "./http";
import { isTokenId } from "./ids";
import {
  clobMarketUrl,
  feeSpecFrom,
  normalizeMarket,
  normalizeSummary,
  sameFeeParameters,
  unknownFeeSpec,
  type NormalizeContext,
} from "./normalize";
import {
  parsePositionRow,
  POSITION_QUERY_STATUSES,
  type PolymarketPosition,
  type PositionQueryStatus,
} from "./positions";
import {
  ADDRESS,
  CONDITION_ID,
  clobBookSchema,
  clobMarketInfoSchema,
  gammaMarketSchema,
  gammaMarketsKeysetSchema,
  gammaProfileSchema,
  gammaSearchSchema,
  positionsEnvelopeSchema,
  tokensEnvelopeSchema,
  type GammaEvent,
  type GammaMarket,
} from "./schemas";

export interface PolymarketAdapterOptions {
  // How the data reached the page: T0 for a browser-direct read (the default; Polymarket's three API hosts answer
  // CORS with *), or the class the Cockpit assigns if it routes the same call through its read proxy.
  readonly transport?: Transport;
  // Asks polymarket.com/api/geoblock for the caller's own status. Absent by default because that host is not an
  // allowed origin of either build (geoblock.ts); the caller supplies it only where it is.
  readonly geoblock?: () => Promise<unknown>;
  readonly bookConcurrency?: number;
}

export interface RejectedRow {
  // The id the row claimed, or null when it had none that parsed.
  readonly id: string | null;
  // A fixed reason code or sentence; never the row's own text.
  readonly reason: string;
}

export interface ListResult {
  readonly page: Page<MarketSummary>;
  // Rows the adapter refused (unknown version, unparseable shape). Shown to the user as a count, not hidden.
  readonly rejected: readonly RejectedRow[];
  // Search only: more results exist than one page holds and the search route's paging is unverified, so there is no
  // `next` cursor. The caller says "refine your search" rather than showing a short list as complete.
  readonly truncated: boolean;
}

export interface PositionsQuery {
  readonly status?: PositionQueryStatus;
  readonly cursor?: string;
  readonly limit?: number;
  // The caller's own label for the address (the address book binding); defaults to the address.
  readonly bindingId?: string;
}

export interface PositionsPage {
  readonly items: readonly PolymarketPosition[];
  readonly rejected: readonly RejectedRow[];
  readonly next: string | null;
}

export interface TokenCrossCheck {
  readonly ok: boolean;
  // Fixed codes such as "module_mismatch" or "token_missing".
  readonly problems: readonly string[];
}

export interface PolymarketAdapter extends VenueReadAdapter {
  readonly id: "polymarket";
  listMarketsDetailed(q: ListMarketsQuery): Promise<ListResult>;
  getPositionsByAddress(address: string, query?: PositionsQuery): Promise<PositionsPage>;
  // Gamma public-profile: the proxy or deposit wallet that holds this address's positions. Looked up, never derived.
  lookupProxyWallet(address: string): Promise<Result<{ readonly proxyWallet: string }, AdapterError>>;
  // Checks Gamma's chosen token ids against the Data API's own token table (condition, ledger module, index, opposite).
  crossCheckTokens(market: Market): Promise<TokenCrossCheck>;
  checkGeoblock(): Promise<GeoblockStatus>;
}

const CURSOR = /^[A-Za-z0-9_\-+/=.~]{1,2048}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,299}$/;
const GAMMA_ID = /^[0-9]{1,20}$/;

const OPEN_SIDE: ReadonlySet<Status> = new Set<Status>(["pending", "active", "paused", "determined", "disputed"]);
const CLOSED_SIDE: ReadonlySet<Status> = new Set<Status>(["closed", "resolved", "voided"]);

// Gamma filters on `closed` only; when the wanted statuses sit on both sides (or include "unknown") the filter is
// omitted and the statuses are applied to the mapped rows instead.
function closedParam(statuses: readonly Status[] | undefined): "true" | "false" | null {
  if (statuses === undefined || statuses.length === 0) return "false";
  if (statuses.every((status) => OPEN_SIDE.has(status))) return "false";
  if (statuses.every((status) => CLOSED_SIDE.has(status))) return "true";
  return null;
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

function checkedCursor(cursor: string | undefined, route: string): string | undefined {
  if (cursor === undefined || cursor === "") return undefined;
  if (cursor.length > MAX_CURSOR_CHARS || !CURSOR.test(cursor)) {
    throw new PolymarketError("NOT_SUPPORTED", route, "the cursor is not one this venue issued");
  }
  return cursor;
}

function claimedConditionId(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const id = (row as { conditionId?: unknown }).conditionId;
  return typeof id === "string" && CONDITION_ID.test(id) ? id.toLowerCase() : null;
}

export function createPolymarketAdapter(deps: AdapterDeps, options: PolymarketAdapterOptions = {}): PolymarketAdapter {
  const transport: Transport = options.transport ?? "T0";
  const concurrency = Math.min(Math.max(Math.trunc(options.bookConcurrency ?? DEFAULT_BOOK_CONCURRENCY), 1), MAX_BOOK_CONCURRENCY);

  // The R9 pause, the token bucket and Retry-After are core's guarded fetch around deps.fetch; a refusal arrives
  // here as an error and is reported, never retried or routed around.
  const get = (route: string, url: string, deadlineMs?: number): Promise<unknown> =>
    getJson(deps, route, url, deadlineMs === undefined ? {} : { deadlineMs });

  const context = (source: string, event?: GammaEvent): NormalizeContext => ({
    nowMs: deps.nowMs(),
    transport,
    source,
    ...(event === undefined ? {} : { event }),
  });

  function summarize(rows: readonly unknown[], source: string, event?: GammaEvent): { items: MarketSummary[]; rejected: RejectedRow[] } {
    const ctx = context(source, event);
    const items: MarketSummary[] = [];
    const rejected: RejectedRow[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const parsed = gammaMarketSchema.safeParse(row);
      if (!parsed.success) {
        rejected.push({ id: claimedConditionId(row), reason: "row does not match the market shape" });
        continue;
      }
      const result = normalizeSummary(parsed.data, ctx);
      if (!result.ok) {
        rejected.push({ id: parsed.data.conditionId.toLowerCase(), reason: result.reason });
        continue;
      }
      if (seen.has(result.value.ref.marketId)) continue;
      seen.add(result.value.ref.marketId);
      items.push(result.value);
    }
    return { items, rejected };
  }

  function filterStatuses(items: MarketSummary[], statuses: readonly Status[] | undefined): MarketSummary[] {
    if (statuses === undefined || statuses.length === 0) return items;
    return items.filter((item) => statuses.includes(item.status));
  }

  async function search(q: ListMarketsQuery, text: string): Promise<ListResult> {
    const route = "gamma public-search";
    if (q.cursor !== undefined && q.cursor !== "") throw new PolymarketError("NOT_SUPPORTED", route, "search results are one page; there is no cursor");
    const limit = clampLimit(q.limit, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const query: Query = [
      ["q", text],
      ["limit_per_type", String(limit)],
    ];
    const json = await get(route, buildUrl(GAMMA_ORIGIN, "/public-search", query));
    const parsed = gammaSearchSchema.safeParse(json);
    if (!parsed.success) throw drift(route, "the search answer does not match the expected shape");
    const items: MarketSummary[] = [];
    const rejected: RejectedRow[] = [];
    const seen = new Set<string>();
    let rows = 0;
    for (const event of parsed.data.events) {
      const nested: GammaEvent = {
        id: event.id ?? null,
        slug: event.slug ?? null,
        title: event.title ?? null,
        description: event.description ?? null,
        negRisk: event.negRisk ?? null,
        negRiskMarketID: event.negRiskMarketID ?? null,
      };
      const markets = event.markets ?? [];
      rows += markets.length;
      const part = summarize(markets, `${GAMMA_ORIGIN}/public-search`, nested);
      rejected.push(...part.rejected);
      for (const item of part.items) {
        if (seen.has(item.ref.marketId)) continue;
        seen.add(item.ref.marketId);
        items.push(item);
      }
    }
    if (rows > 0 && rejected.length === rows) throw drift(route, "every market in the search answer was refused");
    return {
      page: { items: filterStatuses(items, q.statuses), next: null },
      rejected,
      truncated: parsed.data.pagination.hasMore,
    };
  }

  async function listMarketsDetailed(q: ListMarketsQuery): Promise<ListResult> {
    // The search text is user input, but it goes into a URL, so it is cleaned like any other free text.
    const text = q.text === undefined ? "" : untrustedField("generic", q.text.slice(0, MAX_SEARCH_TEXT_CHARS), "polymarket").value;
    if (text !== "") return search(q, text);
    const route = "gamma markets";
    const cursor = checkedCursor(q.cursor, route);
    const closed = closedParam(q.statuses);
    const query: Array<readonly [string, string]> = [];
    if (closed !== null) query.push(["closed", closed]);
    query.push(["limit", String(clampLimit(q.limit, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT))]);
    if (cursor !== undefined) query.push(["after_cursor", cursor]);
    const json = await get(route, buildUrl(GAMMA_ORIGIN, "/markets/keyset", query));
    const parsed = gammaMarketsKeysetSchema.safeParse(json);
    if (!parsed.success) throw drift(route, "the list answer does not match the expected shape");
    const next = parsed.data.next_cursor ?? null;
    if (next !== null && (next === "" || !CURSOR.test(next))) throw drift(route, "the next cursor is not an opaque token");
    const { items, rejected } = summarize(parsed.data.markets, `${GAMMA_ORIGIN}/markets/keyset`);
    if (parsed.data.markets.length > 0 && rejected.length === parsed.data.markets.length) {
      throw drift(route, "every market in the page was refused");
    }
    return { page: { items: filterStatuses(items, q.statuses), next }, rejected, truncated: false };
  }

  async function fetchGammaMarket(ref: MarketRef): Promise<{ market: GammaMarket; source: string }> {
    const route = "gamma market";
    if (ref.venue !== VENUE) throw new PolymarketError("NOT_SUPPORTED", route, "not a Polymarket market");
    if (!CONDITION_ID.test(ref.marketId)) throw new PolymarketError("NOT_FOUND", route, "the market id is not a condition id");
    const slug = ref.native["slug"];
    const gammaId = ref.native["gammaId"];
    let path: string;
    let query: Query = [];
    let envelope = false;
    if (slug !== undefined && SLUG.test(slug)) path = `/markets/slug/${seg(slug)}`;
    else if (gammaId !== undefined && GAMMA_ID.test(gammaId)) path = `/markets/${seg(gammaId)}`;
    else {
      // Fallback by condition id. The filter's name on the keyset route is documented but was never captured.
      path = "/markets/keyset";
      query = [
        ["condition_ids", ref.marketId],
        ["limit", "1"],
      ];
      envelope = true;
    }
    const json = await get(route, buildUrl(GAMMA_ORIGIN, path, query));
    let row: unknown = json;
    if (envelope) {
      const wrapped = gammaMarketsKeysetSchema.safeParse(json);
      if (!wrapped.success) throw drift(route, "the answer does not match the expected shape");
      row = wrapped.data.markets.find((candidate) => claimedConditionId(candidate) === ref.marketId.toLowerCase());
      if (row === undefined) throw new PolymarketError("NOT_FOUND", route, "no market with that condition id");
    }
    const parsed = gammaMarketSchema.safeParse(row);
    if (!parsed.success) throw drift(route, "the market does not match the expected shape");
    // The slug or id could now point at a different market; identity is the condition id.
    if (parsed.data.conditionId.toLowerCase() !== ref.marketId.toLowerCase()) {
      throw new PolymarketError("NOT_FOUND", route, "the market at that slug has a different condition id");
    }
    return { market: parsed.data, source: `${GAMMA_ORIGIN}${path}` };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const { market, source } = await fetchGammaMarket(ref);
    const result = normalizeMarket(market, context(source));
    if (!result.ok) throw drift("gamma market", result.reason);
    return result.value;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    const route = "clob market info";
    const conditionId = market.ref.marketId;
    if (market.ref.venue !== VENUE || !CONDITION_ID.test(conditionId)) throw new PolymarketError("NOT_SUPPORTED", route, "not a Polymarket market");
    const url = clobMarketUrl(conditionId);
    const nowMs = deps.nowMs();
    const json = await get(route, url);
    const parsed = clobMarketInfoSchema.safeParse(json);
    if (!parsed.success) throw drift(route, "the market info does not match the expected shape");
    if (parsed.data.c.toLowerCase() !== conditionId.toLowerCase()) throw drift(route, "the market info is for another condition");
    // The matching engine's value is the one that is charged. Gamma's copy (what getMarket recorded) is a cache with
    // a five-minute max-age; the two must agree, or the fee is unknown and no net-of-fee number is shown.
    const fd = parsed.data.fd;
    // `/fee-rate` and mbf/tbf are signing-era fields (1000 bps while the charged rate was 0.04) and are never read.
    if (fd === null || fd === undefined) {
      // No fee details from the matching engine. That agrees with Gamma only when Gamma also says "no fees"; any
      // other combination cannot be checked and stays unknown.
      const gammaSaysFree = market.fee.modelId === "curve_pq" && market.fee.taker?.rate === "0";
      return gammaSaysFree ? feeSpecFrom({ enabled: false, schedule: null }, url, "fd", nowMs) : unknownFeeSpec(url, "fd", nowMs);
    }
    const live = feeSpecFrom({ enabled: true, schedule: { rate: fd.r, exponent: fd.e, takerOnly: fd.to } }, url, "fd", nowMs);
    if (live.modelId === "unknown") return live;
    if (market.fee.modelId === "unknown" || !sameFeeParameters(live, market.fee)) return unknownFeeSpec(url, "fd", nowMs);
    return live;
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const out: Array<Result<Book, AdapterError>> = new Array(tokens.length);
    let next = 0;
    const one = async (token: TokenRef): Promise<Result<Book, AdapterError>> => {
      if (token.venue !== VENUE) return { ok: false, error: "NOT_SUPPORTED" };
      if (!isTokenId(token.tokenId)) return { ok: false, error: "NOT_FOUND" };
      try {
        const json = await get("clob book", buildUrl(CLOB_ORIGIN, "/book", [["token_id", token.tokenId]]), opts.deadlineMs);
        const wire = clobBookSchema.safeParse(json);
        if (!wire.success) return { ok: false, error: "SCHEMA_DRIFT" };
        const book = parseBook(wire.data, token.tokenId, deps.nowMs());
        return book.ok ? { ok: true, value: book.book } : { ok: false, error: book.error };
      } catch (error) {
        return { ok: false, error: codeOf(error) };
      }
    };
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = next;
        next += 1;
        const token = tokens[index];
        if (token === undefined) return;
        out[index] = await one(token);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tokens.length) }, worker));
    return out;
  }

  async function health(): Promise<VenueHealth> {
    const notes: string[] = [];
    const probes: ReadonlyArray<readonly [string, string]> = [
      ["gamma status", `${GAMMA_ORIGIN}/status`],
      ["data status", `${DATA_ORIGIN}${DATA_V2_PREFIX}/status`],
      ["clob time", `${CLOB_ORIGIN}/time`],
    ];
    const answers = await Promise.all(
      probes.map(async ([route, url]) => {
        try {
          return { route, ok: true as const, answer: await getText(deps, route, url) };
        } catch (error) {
          return { route, ok: false as const, code: codeOf(error) };
        }
      }),
    );
    let ok = true;
    for (const answer of answers) {
      if (!answer.ok) {
        ok = false;
        notes.push(`${answer.route}: ${answer.code}`);
      } else if (answer.route === "clob time" && /^[0-9]{9,11}$/.test(answer.answer.trim())) {
        const skewS = Math.abs(deps.nowMs() / 1000 - Number(answer.answer.trim()));
        if (skewS > 60) notes.push(`this device's clock differs from the venue's by about ${Math.round(skewS)} s`);
      }
    }
    notes.push("geoblock: not checked unless a probe is configured (it reports the caller's own status and is never masked)");
    return { ok, notes };
  }

  async function getPositionsByAddress(address: string, query: PositionsQuery = {}): Promise<PositionsPage> {
    const route = "data positions";
    if (!ADDRESS.test(address)) throw new PolymarketError("NOT_FOUND", route, "not an EVM address");
    const status = query.status ?? "OPEN";
    if (!POSITION_QUERY_STATUSES.includes(status)) throw new PolymarketError("NOT_SUPPORTED", route, "unknown position status");
    const cursor = checkedCursor(query.cursor, route);
    const lower = address.toLowerCase();
    const params: Array<readonly [string, string]> = [
      ["user", lower],
      ["status", status],
      ["limit", String(clampLimit(query.limit, DEFAULT_POSITIONS_LIMIT, MAX_POSITIONS_LIMIT))],
    ];
    if (cursor !== undefined) params.push(["cursor", cursor]);
    const json = await get(route, buildUrl(DATA_ORIGIN, `${DATA_V2_PREFIX}/positions`, params));
    const envelope = positionsEnvelopeSchema.safeParse(json);
    if (!envelope.success) throw drift(route, "the positions answer does not match the expected shape");
    const { has_more: hasMore, next_cursor: nextCursor } = envelope.data.pagination;
    const next = nextCursor ?? null;
    if (hasMore && (next === null || !CURSOR.test(next))) throw drift(route, "more pages exist but no usable cursor was given");
    const ctx = {
      address: lower,
      bindingId: query.bindingId ?? lower,
      requestedStatus: status,
      nowMs: deps.nowMs(),
      transport,
      source: `${DATA_ORIGIN}${DATA_V2_PREFIX}/positions`,
    };
    const items: PolymarketPosition[] = [];
    const rejected: RejectedRow[] = [];
    for (const row of envelope.data.data) {
      const parsed = parsePositionRow(row, ctx);
      if (parsed.ok) items.push(parsed.position);
      else rejected.push({ id: null, reason: parsed.reason });
    }
    if (envelope.data.data.length > 0 && rejected.length === envelope.data.data.length) throw drift(route, "every position row was refused");
    return { items, rejected, next: hasMore ? next : null };
  }

  async function lookupProxyWallet(address: string): Promise<Result<{ readonly proxyWallet: string }, AdapterError>> {
    if (!ADDRESS.test(address)) return { ok: false, error: "NOT_FOUND" };
    try {
      const json = await get("gamma public-profile", buildUrl(GAMMA_ORIGIN, "/public-profile", [["address", address.toLowerCase()]]));
      const parsed = gammaProfileSchema.safeParse(json);
      if (!parsed.success) return { ok: false, error: "SCHEMA_DRIFT" };
      // Only the wallet is kept. The profile's name, bio and image are the user's personal data and are dropped here.
      if (parsed.data.proxyWallet === null || parsed.data.proxyWallet === undefined) return { ok: false, error: "NOT_FOUND" };
      return { ok: true, value: { proxyWallet: parsed.data.proxyWallet } };
    } catch (error) {
      return { ok: false, error: codeOf(error) };
    }
  }

  async function crossCheckTokens(market: Market): Promise<TokenCrossCheck> {
    const route = "data tokens";
    if (market.ref.venue !== VENUE || !CONDITION_ID.test(market.ref.marketId)) throw new PolymarketError("NOT_SUPPORTED", route, "not a Polymarket market");
    const json = await get(route, buildUrl(DATA_ORIGIN, `${DATA_V2_PREFIX}/tokens`, [["condition", market.ref.marketId]]));
    const parsed = tokensEnvelopeSchema.safeParse(json);
    if (!parsed.success) throw drift(route, "the token table does not match the expected shape");
    const problems: string[] = [];
    const ledger = market.ref.native["ledger"];
    for (const outcome of market.outcomes) {
      const row = parsed.data.data.find((candidate) => candidate.token_id === outcome.tokenId);
      if (row === undefined) {
        problems.push("token_missing");
        continue;
      }
      if (row.condition_id.toLowerCase() !== market.ref.marketId.toLowerCase()) problems.push("condition_mismatch");
      // clob_index is the position in Gamma's outcome array. outcome_index is NOT compared (it differs by route).
      if (row.clob_index !== null && row.clob_index !== undefined && row.clob_index !== outcome.index) problems.push("index_mismatch");
      if (ledger === "ctf_v1" && row.module !== "v1_ctf") problems.push("module_mismatch");
      if (ledger === "protocol_v2" && (row.module === null || row.module === undefined || row.module === "v1_ctf")) problems.push("module_mismatch");
      const other = market.outcomes.length === 2 ? market.outcomes[1 - outcome.index] : undefined;
      if (other !== undefined && row.opposite_token_id !== null && row.opposite_token_id !== undefined && row.opposite_token_id !== other.tokenId) {
        problems.push("opposite_mismatch");
      }
    }
    return { ok: problems.length === 0, problems };
  }

  async function checkGeoblock(): Promise<GeoblockStatus> {
    if (options.geoblock === undefined) return uncheckedGeoblock();
    try {
      return parseGeoblock(await options.geoblock(), deps.nowMs());
    } catch {
      return { state: "unknown", reason: "The geoblock check could not be completed. That is not the same as allowed." };
    }
  }

  const caps: AdapterCaps = {
    listMarkets: true,
    search: true,
    getMarket: true,
    getBook: true,
    // GET /books answered 400 live and POST /books is untested, so books are fetched one token at a time.
    getBooksBatch: false,
    getFeeSpec: true,
    // Resolution state comes with getMarket (status, rules); no separate resolutions read is implemented.
    getResolution: false,
    getPositionsByAddress: true,
    stream: false,
  };

  return {
    id: VENUE,
    caps,
    listMarkets: async (q) => (await listMarketsDetailed(q)).page,
    listMarketsDetailed,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    getPositionsByAddress,
    lookupProxyWallet,
    crossCheckTokens,
    checkGeoblock,
  };
}
