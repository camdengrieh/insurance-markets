// Limitless for the standalone build, read through our markets API (api/, at MARKETS_API_ORIGIN) instead of the venue.
// Limitless sends no CORS headers for this page, so the browser cannot read it; the markets API runs the SDK's own
// keyless Limitless reader (sdk/venues/limitless) on its server and serves what it read with each field's source and
// age: GET /v1/markets?venue=limitless (the list) and GET /v1/markets/limitless/:slug (the market and its books). This
// reader turns those answers back into the read model the Markets screen uses, and says where they came from:
//   - every row's provenance names "our markets API", with the time the API read the venue (not the time the page
//     asked the API), so a row the API kept from an earlier read shows its real age;
//   - a book carries the time the API read it; a book the API could not read is that outcome's error, never empty;
//   - titles, labels and rules are a stranger's text and are cleaned again here (sdk/text.ts) as any reader does;
//   - the category is worked out here from the title's words (sdk/category.ts), as for any row without native words.
// The Cockpit build keeps reading Limitless through the daemon (features/explorer/adapters.ts): nothing here runs there.

import { categorise } from "@sdk/category";
import { untrustedField } from "@sdk/text";
import { registeredOrigin } from "@sdk/venues/limitless/constants";
import { getJson, resolveDeadline } from "@sdk/venues/limitless/http";
import { AdapterFailure, isAdapterFailure } from "@sdk/venues/limitless/errors";
import { COLLATERAL as LIMITLESS_COLLATERAL, unknownFee } from "@sdk/venues/limitless/map";
import { makeProv } from "@sdk/venues/policy";

import type { AdapterCaps, AdapterDeps, AdapterError, Book, FeeSpec, Level, ListMarketsQuery, Market, MarketRef, MarketSummary, OutcomeSummary, Page, Result, Status, TokenRef, VenueHealth, VenueReadAdapter } from "./ports";

export const VIA_MARKETS_API = "via our markets API";
// The markets API refreshes a venue's list at most once a minute (api/markets.ts LIST_REFRESH_MS).
const LIST_TTL_MS = 60_000;
const PAGE_MAX = 100;
const PAGE_DEFAULT = 50;
// The venue's own origin, named in a fee record's source as the SDK reader names it (sdk/venues/origins.ts).
const VENUE_ORIGIN = registeredOrigin("limitless") ?? "";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const TOKEN_ID = /^[0-9]{1,78}$/;
const DEC = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,18})?$/;
const STATUSES: readonly Status[] = ["pending", "active", "paused", "closed", "determined", "disputed", "resolved", "voided", "unknown"];

const CAPS: AdapterCaps = {
  listMarkets: true,
  // The API can filter its kept rows by text, but the explorer's search narrows the loaded rows; as before, Limitless is
  // not asked for a text search.
  search: false,
  getMarket: true,
  getBook: true,
  getBooksBatch: false,
  getFeeSpec: true,
  getResolution: false,
  getPositionsByAddress: false,
  stream: false,
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// The API serves a stranger's text as { untrusted: true, value }.
function textOf(value: unknown): string | null {
  const wrapped = record(value);
  return wrapped !== null && wrapped["untrusted"] === true && typeof wrapped["value"] === "string" ? wrapped["value"] : null;
}

function statusOf(value: unknown): Status | null {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value) ? (value as Status) : null;
}

function nativeOf(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = record(value);
  if (raw === null) return out;
  for (const [key, entry] of Object.entries(raw)) if (/^[a-z_]{1,32}$/.test(key) && typeof entry === "string" && entry.length <= 200) out[key] = entry;
  return out;
}

function msOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

// The time the API read the venue for this row: its `prov.fetchedAtMs`, or the asOf of a kept field.
function readAtOf(row: Record<string, unknown>): number | null {
  const prov = record(row["prov"]);
  return msOf(prov?.["fetchedAtMs"]);
}

function outcomeOf(value: unknown): OutcomeSummary | null {
  const outcome = record(value);
  if (outcome === null) return null;
  const index = outcome["index"];
  const role = outcome["role"];
  const tokenId = outcome["tokenId"];
  const label = textOf(outcome["label"]);
  const price = outcome["displayPrice"];
  if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || (role !== "yes" && role !== "no" && role !== "label") || typeof tokenId !== "string" || !TOKEN_ID.test(tokenId) || label === null) return null;
  return { index, role, label: untrustedField("outcome", label, "limitless"), tokenId, displayPrice: typeof price === "string" && DEC.test(price) ? price : null };
}

// One list row of GET /v1/markets, or null when it does not have the shape the API promises.
export function summaryOfApiRow(value: unknown, nowMs: number): MarketSummary | null {
  const row = record(value);
  if (row === null || row["venue"] !== "limitless") return null;
  const marketId = row["marketId"];
  const title = textOf(row["title"]);
  const status = statusOf(row["status"]);
  const readAt = readAtOf(row);
  if (typeof marketId !== "string" || !SLUG.test(marketId) || title === null || status === null || readAt === null || !Array.isArray(row["outcomes"])) return null;
  const outcomes = row["outcomes"].map(outcomeOf);
  if (outcomes.length === 0 || outcomes.some((outcome) => outcome === null)) return null;
  const closes = row["closesAtUtc"];
  const volume = record(row["volume"]);
  const amount = volume?.["amount"];
  const unit = volume?.["unit"];
  const windowHours = volume?.["windowHours"];
  const titleText = untrustedField("title", title, "limitless");
  return {
    ref: { venue: "limitless", marketId, native: nativeOf(row["native"]) },
    title: titleText,
    status,
    closesAtUtc: typeof closes === "string" && !Number.isNaN(Date.parse(closes)) ? closes : null,
    outcomes: outcomes as OutcomeSummary[],
    volume: {
      amount: typeof amount === "string" && DEC.test(amount) ? amount : null,
      unit: unit === "usd" || unit === "usdc_e" || unit === "shares" || unit === "contracts" ? unit : "unknown",
      windowHours: typeof windowHours === "number" && Number.isFinite(windowHours) ? windowHours : null,
    },
    prov: makeProv({ venue: "limitless", source: VIA_MARKETS_API, fetchedAtMs: readAt, nowMs, ttlMs: LIST_TTL_MS, transport: "T0" }),
    category: categorise({ venue: "limitless", native: [], title: titleText.value }),
  };
}

export interface ApiBook {
  readonly tokenId: string;
  // null with the API's reason when it holds no book for the outcome.
  readonly book: { readonly bids: readonly Level[]; readonly asks: readonly Level[]; readonly asOfMs: number; readonly derived: "native" | "complement" } | null;
  readonly reason: string | null;
}

function levelsOf(value: unknown): Level[] | null {
  if (!Array.isArray(value)) return null;
  const out: Level[] = [];
  for (const entry of value) {
    const level = record(entry);
    const price = level?.["price"];
    const size = level?.["size"];
    if (typeof price !== "string" || typeof size !== "string" || !DEC.test(price) || !DEC.test(size)) return null;
    out.push({ price, size });
  }
  return out;
}

// The `books` of GET /v1/markets/limitless/:slug: one per outcome, each with the time the API read it or why there is none.
export function booksOfApiAnswer(json: unknown): ApiBook[] | null {
  const answer = record(json);
  if (answer === null || !Array.isArray(answer["books"])) return null;
  const out: ApiBook[] = [];
  for (const entry of answer["books"]) {
    const row = record(entry);
    const tokenId = row?.["tokenId"];
    if (row === null || typeof tokenId !== "string" || !TOKEN_ID.test(tokenId)) return null;
    const book = record(row["book"]);
    const source = record(row["source"]);
    if (book === null) {
      const reason = typeof source?.["reason"] === "string" ? source["reason"] : "The markets API holds no book for this outcome.";
      out.push({ tokenId, book: null, reason: reason.slice(0, 200) });
      continue;
    }
    const bids = levelsOf(book["bids"]);
    const asks = levelsOf(book["asks"]);
    const asOfMs = msOf(book["asOfMs"]);
    const derived = book["derived"] === "complement" ? "complement" : book["derived"] === "native" ? "native" : null;
    if (bids === null || asks === null || asOfMs === null || derived === null) return null;
    out.push({ tokenId, book: { bids, asks, asOfMs, derived }, reason: null });
  }
  return out;
}

function marketOfApiAnswer(json: unknown, slug: string, nowMs: number): Market {
  const answer = record(json);
  const market = record(answer?.["market"]);
  const fields = record(answer?.["fields"]);
  const marketField = record(fields?.["market"]);
  const readAt = msOf(marketField?.["asOfMs"]);
  const title = textOf(market?.["title"]);
  const status = statusOf(market?.["status"]);
  const rules = record(market?.["rules"]);
  if (market === null || market["venue"] !== "limitless" || market["marketId"] !== slug || title === null || status === null || readAt === null || rules === null || !Array.isArray(market["outcomes"])) {
    throw new AdapterFailure("limitless", "SCHEMA_DRIFT", "markets_api_market_shape");
  }
  const outcomes = market["outcomes"].map((entry) => {
    const outcome = outcomeOf({ ...(record(entry) ?? {}), displayPrice: null });
    if (outcome === null) throw new AdapterFailure("limitless", "SCHEMA_DRIFT", "markets_api_outcome_shape");
    return { index: outcome.index, role: outcome.role, label: outcome.label, tokenId: outcome.tokenId };
  });
  const times = record(market["timesUtc"]) ?? {};
  const closesAt = typeof times["closesAt"] === "string" && !Number.isNaN(Date.parse(times["closesAt"])) ? times["closesAt"] : undefined;
  const rulesText = textOf(rules["text"]) ?? "";
  const sha = typeof rules["sha256"] === "string" && /^[0-9a-f]{64}$/.test(rules["sha256"]) ? rules["sha256"] : "";
  const cutoff = typeof rules["cutoffUtc"] === "string" && !Number.isNaN(Date.parse(rules["cutoffUtc"])) ? rules["cutoffUtc"] : undefined;
  const tick = typeof market["tick"] === "string" && /^0\.[0-9]{1,6}$/.test(market["tick"]) ? market["tick"] : "0.001";
  const minSize = typeof market["minSize"] === "string" && DEC.test(market["minSize"]) ? market["minSize"] : undefined;
  const titleText = untrustedField("title", title, "limitless");
  return {
    ref: { venue: "limitless", marketId: slug, native: nativeOf(market["native"]) },
    title: titleText,
    outcomes,
    rules: { text: untrustedField("rules", rulesText, "limitless"), sha256: sha, sources: [], mechanism: "unknown", void: "unknown", ...(cutoff === undefined ? {} : { cutoffUtc: cutoff }) },
    status,
    // Read-only here: the order path is the wallet ticket (features/trade/direct/limitless), which reads the market again.
    tradable: { ok: false, reasons: ["read_only_adapter", "fee_model_unknown"] },
    timesUtc: closesAt === undefined ? {} : { closesAt },
    tick,
    ...(minSize === undefined ? {} : { minSize }),
    collateral: LIMITLESS_COLLATERAL,
    fee: unknownFee(VENUE_ORIGIN, slug, nowMs),
    prov: { fetchedAtMs: readAt, source: VIA_MARKETS_API, adapterVersion: "limitless-via-markets-api-0.1", schemaHash: "" },
    category: categorise({ venue: "limitless", native: [], title: titleText.value }),
  };
}

export interface MarketsApiLimitlessAdapter extends VenueReadAdapter {
  readonly id: "limitless";
  lastReadReport(): { readonly parsed: number; readonly dropped: number; readonly fetchedAtMs: number };
}

export function createMarketsApiLimitlessAdapter(deps: AdapterDeps, origin: string): MarketsApiLimitlessAdapter {
  const base = new URL(origin).origin;
  let report = { parsed: 0, dropped: 0, fetchedAtMs: 0 };
  // token id -> its market's slug, from every list and detail read, so a book asked for by token finds its market.
  const slugOfToken = new Map<string, string>();

  function remember(slug: string, tokenIds: readonly string[]): void {
    if (slugOfToken.size > 5_000) slugOfToken.clear();
    for (const tokenId of tokenIds) slugOfToken.set(tokenId, slug);
  }

  async function detail(slug: string, deadlineAtMs?: number): Promise<unknown> {
    if (!SLUG.test(slug)) throw new AdapterFailure("limitless", "NOT_FOUND", "bad_market_id");
    return getJson(deps, { url: `${base}/v1/markets/limitless/${slug}`, notFoundStatuses: [404], ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }) });
  }

  async function listMarkets(q: ListMarketsQuery): Promise<Page<MarketSummary>> {
    if (q.text !== undefined && q.text !== "") throw new AdapterFailure("limitless", "NOT_SUPPORTED", "text_search");
    if (q.statuses !== undefined && q.statuses.length > 0 && !q.statuses.includes("active")) throw new AdapterFailure("limitless", "NOT_SUPPORTED", "only_active_listed");
    if (q.cursor !== undefined && q.cursor !== "" && !/^[0-9]{1,6}$/.test(q.cursor)) throw new AdapterFailure("limitless", "NOT_SUPPORTED", "bad_cursor");
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? PAGE_DEFAULT), 1), PAGE_MAX);
    const cursor = q.cursor !== undefined && q.cursor !== "" ? `&cursor=${q.cursor}` : "";
    const nowMs = deps.nowMs();
    const answer = record(await getJson(deps, { url: `${base}/v1/markets?venue=limitless&limit=${limit}${cursor}` }));
    if (answer === null || !Array.isArray(answer["markets"])) throw new AdapterFailure("limitless", "SCHEMA_DRIFT", "markets_api_list_shape");
    const items: MarketSummary[] = [];
    let dropped = 0;
    for (const row of answer["markets"]) {
      const summary = summaryOfApiRow(row, nowMs);
      if (summary === null) {
        dropped += 1;
        continue;
      }
      remember(summary.ref.marketId, summary.outcomes.map((outcome) => outcome.tokenId));
      items.push(summary);
    }
    report = { parsed: items.length, dropped, fetchedAtMs: nowMs };
    const next = answer["next"];
    return { items, next: typeof next === "string" && /^[0-9]{1,6}$/.test(next) ? next : null };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    if (ref.venue !== "limitless") throw new AdapterFailure("limitless", "NOT_SUPPORTED", "wrong_venue");
    const market = marketOfApiAnswer(await detail(ref.marketId), ref.marketId, deps.nowMs());
    remember(market.ref.marketId, market.outcomes.map((outcome) => outcome.tokenId));
    return market;
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    const answers = new Map<string, Promise<ApiBook[] | AdapterError>>();
    const booksOf = (slug: string): Promise<ApiBook[] | AdapterError> => {
      let pending = answers.get(slug);
      if (pending === undefined) {
        pending = detail(slug, deadlineAtMs).then(
          (json) => booksOfApiAnswer(json) ?? "SCHEMA_DRIFT",
          (error: unknown) => (isAdapterFailure(error) ? error.code : "SCHEMA_DRIFT"),
        );
        answers.set(slug, pending);
      }
      return pending;
    };
    const out: Array<Result<Book, AdapterError>> = [];
    for (const token of tokens) {
      const slug = token.marketId !== undefined && SLUG.test(token.marketId) ? token.marketId : slugOfToken.get(token.tokenId);
      if (token.venue !== "limitless" || !TOKEN_ID.test(token.tokenId) || slug === undefined) {
        out.push({ ok: false, error: slug === undefined ? "NOT_FOUND" : "NOT_SUPPORTED" });
        continue;
      }
      const books = await booksOf(slug);
      if (typeof books === "string") {
        out.push({ ok: false, error: books });
        continue;
      }
      const found = books.find((entry) => entry.tokenId === token.tokenId);
      if (found === undefined) out.push({ ok: false, error: "NOT_FOUND" });
      else if (found.book === null) out.push({ ok: false, error: "STALE" });
      else out.push({ ok: true, value: { token: { venue: "limitless", tokenId: token.tokenId, marketId: slug }, bids: found.book.bids, asks: found.book.asks, asOfMs: found.book.asOfMs, derived: found.book.derived } });
    }
    return out;
  }

  async function getFeeSpec(market: Market): Promise<FeeSpec> {
    // The venue documents a 0.40 to 3.00 percent range but no machine-readable model: unknown, past its ttl at birth.
    return unknownFee(VENUE_ORIGIN, market.ref.marketId, deps.nowMs());
  }

  async function health(): Promise<VenueHealth> {
    try {
      await getJson(deps, { url: `${base}/v1/markets?venue=limitless&limit=1` });
      return { ok: true, notes: ["markets_api_answered"] };
    } catch (error) {
      return { ok: false, notes: [isAdapterFailure(error) ? error.detail : "unavailable"] };
    }
  }

  return { id: "limitless", caps: CAPS, listMarkets, getMarket, getBooks, getFeeSpec, health, lastReadReport: () => report };
}
