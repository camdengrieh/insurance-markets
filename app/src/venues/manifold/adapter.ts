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
  OutcomeSummary,
  Page,
  Prov,
  Result,
  Status,
  TokenRef,
  Untrusted,
  VenueHealth,
  VenueReadAdapter,
} from "../../core/ports";
import { complementOfOne, numberToDec } from "./decimal";
import { AdapterFailure } from "./errors";
import { requestJson } from "./http";
import { binaryRowSchema, kindSchema, MARKET_ID, OUTCOME_TYPE_BINARY, SCHEMA_DESCRIPTOR, searchResponseSchema, TOKEN_MANA, type BinaryRow } from "./schema";
import { cleanBlock, cleanLine, normalizeForHash, sha256Hex } from "./text";

// Manifold (play money): a slow, keyless reference prior, never an executable price. Manifold's markets are
// automated market makers, so there is NO order book here (getBooks answers NOT_SUPPORTED for every token),
// nothing is tradable through this app, and a Manifold probability must never be shown as a bid or an ask.
// Sources: docs/research/09-venues-onchain-clob.md section 2.10, docs/research/26-dapp-unified-view.md
// (CORS `*`, 500 requests per minute per IP), docs/dapp-design.md section 4.2 and 4.6.

export const MANIFOLD_ORIGIN = "https://api.manifold.markets";
export const MANIFOLD_API_BASE = `${MANIFOLD_ORIGIN}/v0`;
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const MANIFOLD_READ_SERVICE = "manifold";
// "There is a rate limit of 500 requests per minute per IP." Core's per-host token bucket reads this.
export const MANIFOLD_RATE_LIMIT_PER_MINUTE = 500;
export const MANIFOLD_ADAPTER_VERSION = "manifold-0.1";
export const MANIFOLD_SCHEMA_HASH = sha256Hex(SCHEMA_DESCRIPTOR);

// Terms read in the notes: bots and automated tools are permitted; scraping outside the API, circumventing
// limits and commercial AI/ML training on API data are not. No caching or redistribution clause was found,
// but none was verified either, so the licence class fails closed to "unknown".
export const MANIFOLD_TERMS_NOTE =
  "Manifold terms (as read): bots permitted; no scraping outside the API; no commercial AI/ML training on API data without a licence.";

const SEARCH_PAGE_DEFAULT = 50;
const SEARCH_PAGE_MAX = 100;
const TERM_MAX = 200;
const TITLE_MAX = 300;
const RULES_MAX = 8_000;
const LIST_TTL_MS = 60_000;

const CAPS: AdapterCaps = {
  listMarkets: true,
  search: true,
  getMarket: true,
  // AMM: no book, ever.
  getBook: false,
  getBooksBatch: false,
  getFeeSpec: false,
  getResolution: false,
  getPositionsByAddress: false,
  stream: false,
};

// Counters for the last list or detail read: rows kept, rows of a kind this adapter does not model, and rows
// of a modelled kind that failed validation (drift). health() reports them.
export interface ManifoldReadReport {
  readonly parsed: number;
  readonly skippedUnsupported: number;
  readonly dropped: number;
}

export interface ManifoldAdapter extends VenueReadAdapter {
  readonly id: "manifold";
  lastReadReport(): ManifoldReadReport;
}

const untrusted = (value: string): Untrusted<string> => ({ untrusted: true, value });

function isoOrNull(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function statusOfRow(row: BinaryRow, nowMs: number): Status {
  if (row.isResolved) return row.resolution === "CANCEL" ? "voided" : "resolved";
  if (row.closeTime !== null && row.closeTime !== undefined && row.closeTime <= nowMs) return "closed";
  return "active";
}

function outcomeSummaries(row: BinaryRow): readonly OutcomeSummary[] {
  // Six decimals is display precision for a 0 to 1 probability; the complement is exact decimal arithmetic.
  const yes = numberToDec(row.probability, 6);
  const no = yes === null ? null : complementOfOne(yes);
  return [
    { index: 0, role: "yes", label: untrusted("Yes"), tokenId: `${row.id}:YES`, displayPrice: yes },
    { index: 1, role: "no", label: untrusted("No"), tokenId: `${row.id}:NO`, displayPrice: no },
  ];
}

function allowedStatuses(query: ListMarketsQuery): ReadonlySet<Status> {
  return new Set<Status>(query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses);
}

// Manifold filters on open | closed | resolved | all. A mixed set asks for all and filters here.
function serverFilter(statuses: ReadonlySet<Status>): "open" | "closed" | "resolved" | "all" {
  if (statuses.size === 1) {
    if (statuses.has("active")) return "open";
    if (statuses.has("closed")) return "closed";
    if (statuses.has("resolved")) return "resolved";
  }
  return "all";
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (!/^\d{1,6}$/.test(cursor)) throw new AdapterFailure("manifold", "NOT_SUPPORTED", "bad_cursor");
  return Number(cursor);
}

function cleanTerm(text: string | undefined): string {
  if (text === undefined) return "";
  return cleanLine(text, TERM_MAX);
}

export function createManifoldAdapter(deps: AdapterDeps): ManifoldAdapter {
  let report: ManifoldReadReport = { parsed: 0, skippedUnsupported: 0, dropped: 0 };

  const prov = (source: string, row?: BinaryRow): Prov => ({
    venue: "manifold",
    source,
    fetchedAtMs: deps.nowMs(),
    ...(row?.lastUpdatedTime !== null && row?.lastUpdatedTime !== undefined ? { venueTsMs: row.lastUpdatedTime } : {}),
    transport: "T0",
    freshness: "recent",
    ttlMs: LIST_TTL_MS,
    license: "unknown",
  });

  // A modelled row becomes a BinaryRow; another kind returns "skip"; a modelled kind that does not validate
  // returns "drop".
  function classify(raw: unknown): BinaryRow | "skip" | "drop" {
    const kind = kindSchema.safeParse(raw);
    if (!kind.success) return "drop";
    if (kind.data.outcomeType !== OUTCOME_TYPE_BINARY) return "skip";
    // Manifold also runs a sweepstakes currency. Only the play-money token is modelled; anything else is a
    // different asset class and is not shown (fails closed).
    if (kind.data.token !== TOKEN_MANA) return "skip";
    const row = binaryRowSchema.safeParse(raw);
    if (!row.success) return "drop";
    const question = cleanLine(row.data.question, TITLE_MAX);
    return question === "" ? "drop" : row.data;
  }

  function summaryOf(row: BinaryRow): MarketSummary {
    const volume = row.volume24Hours === undefined ? null : numberToDec(row.volume24Hours, 2);
    return {
      ref: { venue: "manifold", marketId: row.id, native: { mechanism: row.mechanism } },
      title: untrusted(cleanLine(row.question, TITLE_MAX)),
      status: statusOfRow(row, deps.nowMs()),
      closesAtUtc: isoOrNull(row.closeTime),
      outcomes: outcomeSummaries(row),
      // Mana is play money. The port's VolumeUnit has no "mana", and "usd" would be a lie, so the unit is
      // "unknown" and the amount is a venue-reported 24 hour total in mana, not a dollar figure.
      volume: { amount: volume, unit: "unknown", windowHours: volume === null ? null : 24 },
      prov: prov("manifold:search-markets", row),
    };
  }

  async function listMarkets(query: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const statuses = allowedStatuses(query);
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? SEARCH_PAGE_DEFAULT), 1), SEARCH_PAGE_MAX);
    const offset = parseCursor(query.cursor);
    const filter = serverFilter(statuses);
    const params = [
      `term=${encodeURIComponent(cleanTerm(query.text))}`,
      "sort=liquidity",
      `filter=${filter}`,
      `contractType=${OUTCOME_TYPE_BINARY}`,
      `limit=${limit}`,
      `offset=${offset}`,
    ].join("&");
    const body = await requestJson(deps, { venue: "manifold", url: `${MANIFOLD_API_BASE}/search-markets?${params}` });
    const rows = searchResponseSchema.safeParse(body);
    if (!rows.success) throw new AdapterFailure("manifold", "SCHEMA_DRIFT", "search_not_a_list");

    const items: MarketSummary[] = [];
    let skipped = 0;
    let dropped = 0;
    for (const raw of rows.data) {
      const row = classify(raw);
      if (row === "skip") skipped += 1;
      else if (row === "drop") dropped += 1;
      else {
        const summary = summaryOf(row);
        if (statuses.has(summary.status)) items.push(summary);
      }
    }
    report = { parsed: items.length, skippedUnsupported: skipped, dropped };
    // Every row malformed means the shape changed, not that one market is odd.
    if (rows.data.length > 0 && dropped === rows.data.length) throw new AdapterFailure("manifold", "SCHEMA_DRIFT", "no_row_matches_schema");
    return { items, next: rows.data.length === limit ? String(offset + limit) : null };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    if (ref.venue !== "manifold" || !MARKET_ID.test(ref.marketId)) throw new AdapterFailure("manifold", "NOT_FOUND", "bad_ref");
    const body = await requestJson(deps, { venue: "manifold", url: `${MANIFOLD_API_BASE}/market/${ref.marketId}` });
    const row = classify(body);
    if (row === "skip") throw new AdapterFailure("manifold", "NOT_SUPPORTED", "not_a_play_money_binary_market");
    if (row === "drop") throw new AdapterFailure("manifold", "SCHEMA_DRIFT", "market_shape");
    if (row.id !== ref.marketId) throw new AdapterFailure("manifold", "SCHEMA_DRIFT", "id_mismatch");
    report = { parsed: 1, skippedUnsupported: 0, dropped: 0 };

    const summary = summaryOf(row);
    const closes = isoOrNull(row.closeTime);
    const opens = isoOrNull(row.createdTime);
    const description = row.textDescription ?? "";
    const normalized = normalizeForHash(description);
    return {
      ref: summary.ref,
      title: summary.title,
      outcomes: summary.outcomes.map((o) => ({ index: o.index, role: o.role, label: o.label, tokenId: o.tokenId })),
      rules: {
        text: untrusted(cleanBlock(description, RULES_MAX)),
        // An empty hash means "no rules text was available" and never equals a real hash. The recorded detail
        // fixture carries no description, so the field name is unverified.
        sha256: normalized === "" ? "" : sha256Hex(normalized),
        sources: [],
        // Resolved by the market's creator; no mechanism in the port fits, and none is guessed.
        mechanism: "unknown",
        ...(closes === null ? {} : { cutoffUtc: closes }),
        void: "unknown",
      },
      status: summary.status,
      // Read-only reference: nothing here is tradable through this app, so the reason is always stated.
      tradable: { ok: false, reasons: ["play_money_reference_only", "amm_no_order_book"] },
      timesUtc: { ...(opens === null ? {} : { opensAt: opens }), ...(closes === null ? {} : { closesAt: closes }) },
      // No book, so no tick is used; this is the 1% step of the venue's limit prob fields in the fixture.
      tick: "0.01",
      collateral: { symbol: TOKEN_MANA, chain: "offchain", decimals: 0, custody: "venue" },
      fee: unknownFee(),
      prov: { fetchedAtMs: deps.nowMs(), source: "manifold:market", adapterVersion: MANIFOLD_ADAPTER_VERSION, schemaHash: MANIFOLD_SCHEMA_HASH },
    };
  }

  async function getBooks(tokens: readonly TokenRef[]): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    // Never an empty book: an AMM has no book, and "no liquidity" would be a different claim.
    return tokens.map(() => ({ ok: false as const, error: "NOT_SUPPORTED" as const }));
  }

  async function getFeeSpec(): Promise<FeeSpec> {
    return unknownFee();
  }

  async function health(): Promise<VenueHealth> {
    const notes = ["play money (mana): reference only", "amm: no order book", MANIFOLD_TERMS_NOTE];
    try {
      await requestJson(deps, { venue: "manifold", url: `${MANIFOLD_API_BASE}/markets?limit=1` });
      return { ok: true, notes };
    } catch (error) {
      const code = error instanceof AdapterFailure ? error.code : "TIMEOUT";
      return { ok: false, notes: [...notes, `unreachable: ${code}`] };
    }
  }

  return {
    id: "manifold",
    caps: CAPS,
    listMarkets,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
  };
}

// modelId "unknown" and ttlSec 0: past ttl means fail closed, so no net-of-fee number is ever derived.
function unknownFee(): FeeSpec {
  return {
    modelId: "unknown",
    payer: "in_pool",
    paramsSource: { url: `${MANIFOLD_API_BASE}/market`, field: "none", granularity: "market" },
    verifiedAt: "never",
    ttlSec: 0,
  };
}
