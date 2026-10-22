import { rulesFingerprintOfFields } from "../../rules.js";
import type {
  AdapterCaps,
  AdapterDeps,
  AdapterError,
  Book,
  FeeSpec,
  Level,
  ListMarketsQuery,
  Market,
  MarketGroup,
  MarketRef,
  MarketSummary,
  Outcome,
  OutcomeSummary,
  Page,
  Prov,
  Result,
  Status,
  TickRanges,
  TokenRef,
  Untrusted,
  VenueHealth,
  VenueReadAdapter,
} from "../../model.js";
import { categorise } from "../../category.js";
import { canonDec, compareDec, isDec } from "../../money/dec.js";
import { assetIdOf, coinOf, encodingOf, outcomeFromMarketId, parseOutcomeToken, tokenOf, type Side } from "./encoding.js";
import { AdapterFailure } from "./errors.js";
import { requestJson, resolveDeadline } from "./http.js";
import {
  allMidsSchema,
  l2BookSchema,
  outcomeMetaEnvelopeSchema,
  outcomeSpecSchema,
  questionSpecSchema,
  SCHEMA_DESCRIPTOR,
  settledOutcomeSchema,
  type OutcomeSpec,
  type QuestionSpec,
} from "./schema.js";
import { closeOf, isProtocolMarkClass, parseSpec, titleOf, valueOf, type SpecPair } from "./spec.js";
import { cleanBlock, cleanLine, normalizeForHash, sha256Hex } from "./text.js";

// Hyperliquid HIP-4 outcome markets (HyperCore), read only, through POST /info.
//
// STATUS: shapes UNVERIFIED. No research stream called POST /info (the ground rules forbade a POST), so the
// outcomeMeta and settledOutcome shapes come from the official docs' sample responses, and l2Book and
// allMids from live websocket frames of the same data. The adapter is written against those and fails closed
// on any difference (SCHEMA_DRIFT). The explorer must show this venue's tile as "unverified" until the opt-in
// live drift suite (live.test.ts, APP_LIVE=1) has been run and HYPERLIQUID_SHAPE_STATUS is changed by hand.
// Sources: docs/research/09-venues-onchain-clob.md section 2.6, docs/venue-census.md (three HIP-4 records),
// docs/research/fixtures/hyperliquid-*, docs/dapp-design.md sections 4.2 and 4.6.

export const HYPERLIQUID_ORIGIN = "https://api.hyperliquid.xyz";
export const HYPERLIQUID_INFO_URL = `${HYPERLIQUID_ORIGIN}/info`;
// sdk/venues/origins.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const HYPERLIQUID_READ_SERVICE = "hyperliquid_info";
export const HYPERLIQUID_ADAPTER_VERSION = "hyperliquid-hip4-0.1";
export const HYPERLIQUID_SCHEMA_HASH = sha256Hex(SCHEMA_DESCRIPTOR);

// The only /info request types this adapter sends. bridge/allowlist.ts (the read proxy) allows exactly these
// for the hyperliquid_info service: all are reads, none takes a user address or a signature.
export const HYPERLIQUID_INFO_TYPES = ["outcomeMeta", "allMids", "l2Book", "settledOutcome"] as const;
export type HyperliquidInfoType = (typeof HYPERLIQUID_INFO_TYPES)[number];

// "REST requests share an aggregated weight limit of 1200 per minute" (official rate-limits page, H):
// l2Book and allMids weigh 2, other info requests 20. Core's per-host token bucket reads these.
export const HYPERLIQUID_WEIGHT_PER_MINUTE = 1_200;
export const HYPERLIQUID_INFO_WEIGHTS: Readonly<Record<HyperliquidInfoType, number>> = { outcomeMeta: 20, allMids: 2, l2Book: 2, settledOutcome: 20 };

export interface ShapeStatus {
  readonly status: "unverified" | "verified";
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly missing: readonly string[];
}

// Flipped to "verified" only by a person after running the live drift suite and reading its result.
export const HYPERLIQUID_SHAPE_STATUS: ShapeStatus = {
  status: "unverified",
  summary: "Response shapes come from the official docs samples and live websocket frames; POST /info was never called.",
  evidence: [
    "outcomeMeta and settledOutcome: official docs sample responses (not live)",
    "l2Book: live websocket frames, 6 of 20 levels per side kept, Yes and No books are exact mirrors",
    "allMids: live websocket frame, outcome coins appear as '#<encoding>' keys, Yes + No mids sum to 1",
  ],
  missing: [
    "POST /info response bodies for outcomeMeta, allMids, l2Book and settledOutcome",
    "POST /info response CORS headers (only the OPTIONS preflight was measured)",
    "whether settled outcomes stay in outcomeMeta",
    "tick size and minimum order size",
    "whether outcome tokens appear in spotClearinghouseState (positions are not read by this adapter)",
  ],
};

// Shown with every Hyperliquid market. Census, clauses 1.6 to 1.8 of the Terms of Use read from the app's
// static chunk (H): the list is open-ended and unpublished, so no eligibility verdict is computed.
export const HYPERLIQUID_EXCLUDED_PERSONS_CLAUSE =
  "Hyperliquid's terms bar outcome markets to 'Excluded Persons' in jurisdictions it designates from time to time (the list is not published), and the interface is unavailable to residents of the United States and Ontario. This app does not decide whether you are eligible.";

const UNVERIFIED_TAG = "unverified-shape";
const SOURCE = {
  outcomeMeta: `hyperliquid:info/outcomeMeta[${UNVERIFIED_TAG}]`,
  settledOutcome: `hyperliquid:info/settledOutcome[${UNVERIFIED_TAG}]`,
  market: `hyperliquid:info/outcomeMeta+allMids[${UNVERIFIED_TAG}]`,
} as const;

const META_TTL_MS = 30_000;
const STALE_BOOK_MS = 300_000;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;
const BOOK_CONCURRENCY = 4;
const RULES_MAX = 8_000;

const CAPS: AdapterCaps = {
  listMarkets: true,
  search: true,
  getMarket: true,
  getBook: true,
  getBooksBatch: true,
  getFeeSpec: false,
  getResolution: false,
  // Positions by address (spotClearinghouseState) are not read here: that shape is the open DT8 item.
  getPositionsByAddress: false,
  stream: false,
};

// Prices are probabilities with five significant figures (census, H): the finest step is 1e-5 above 0.1,
// 1e-6 from 0.01 to 0.1 and 1e-7 below. Display and validation only; unverified live.
const TICK: TickRanges = [
  { from: "0", to: "0.01", tick: "0.0000001" },
  { from: "0.01", to: "0.1", tick: "0.000001" },
  { from: "0.1", to: "1", tick: "0.00001" },
];

const untrusted = (value: string): Untrusted<string> => ({ untrusted: true, value });

export interface HyperliquidReadReport {
  readonly parsed: number;
  readonly dropped: number;
  readonly questionsDropped: number;
  readonly midsAvailable: boolean;
}

export interface HyperliquidAdapter extends VenueReadAdapter {
  readonly id: "hyperliquid";
  readonly shapeStatus: ShapeStatus;
  lastReadReport(): HyperliquidReadReport;
}

interface GroupInfo {
  readonly question: number;
  readonly fallback: boolean;
  readonly questionName: string;
}

interface Loaded {
  readonly atMs: number;
  readonly order: readonly number[];
  readonly specs: ReadonlyMap<number, OutcomeSpec>;
  readonly groups: ReadonlyMap<number, GroupInfo>;
  // coin ("#<enc>") to mid, validated decimals in [0, 1]; null when allMids could not be read.
  readonly mids: ReadonlyMap<string, string> | null;
  readonly report: HyperliquidReadReport;
}

function parseOutcomeMeta(body: unknown): { specs: Map<number, OutcomeSpec>; order: number[]; questions: QuestionSpec[]; dropped: number; questionsDropped: number } {
  const envelope = outcomeMetaEnvelopeSchema.safeParse(body);
  if (!envelope.success) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "outcome_meta_envelope");
  const specs = new Map<number, OutcomeSpec>();
  const order: number[] = [];
  let dropped = 0;
  for (const raw of envelope.data.outcomes) {
    const spec = outcomeSpecSchema.safeParse(raw);
    // A duplicate outcome number is as suspect as a malformed row.
    if (!spec.success || specs.has(spec.data.outcome)) {
      dropped += 1;
      continue;
    }
    specs.set(spec.data.outcome, spec.data);
    order.push(spec.data.outcome);
  }
  const questions: QuestionSpec[] = [];
  let questionsDropped = 0;
  for (const raw of envelope.data.questions ?? []) {
    const question = questionSpecSchema.safeParse(raw);
    if (question.success) questions.push(question.data);
    else questionsDropped += 1;
  }
  // Every row malformed means the shape changed, not that one outcome is odd.
  if (envelope.data.outcomes.length > 0 && specs.size === 0) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "no_outcome_matches_schema");
  return { specs, order, questions, dropped, questionsDropped };
}

function groupsOf(questions: readonly QuestionSpec[]): Map<number, GroupInfo> {
  const groups = new Map<number, GroupInfo>();
  for (const question of questions) {
    const info = (fallback: boolean): GroupInfo => ({ question: question.question, fallback, questionName: question.name });
    for (const outcome of question.namedOutcomes) if (!groups.has(outcome)) groups.set(outcome, info(false));
    if (question.fallbackOutcome !== null && question.fallbackOutcome !== undefined && !groups.has(question.fallbackOutcome)) {
      groups.set(question.fallbackOutcome, info(true));
    }
  }
  return groups;
}

// '#<enc>' keys with a decimal mid in [0, 1]; anything else is ignored (the map also holds perps and spot).
function midsOf(body: unknown): Map<string, string> | null {
  const parsed = allMidsSchema.safeParse(body);
  if (!parsed.success) return null;
  const mids = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!key.startsWith("#") || parseOutcomeToken(key) === null) continue;
    if (typeof value !== "string" || !isDec(value) || compareDec(value, "1") > 0) continue;
    mids.set(key, canonDec(value));
  }
  return mids;
}

function symbolOf(spec: OutcomeSpec): string {
  return spec.quoteToken ?? "unknown";
}

function allowedStatuses(query: ListMarketsQuery): ReadonlySet<Status> {
  return new Set<Status>(query.statuses === undefined || query.statuses.length === 0 ? ["active"] : query.statuses);
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (!/^\d{1,6}$/.test(cursor)) throw new AdapterFailure("hyperliquid", "NOT_SUPPORTED", "bad_cursor");
  return Number(cursor);
}

function unknownFee(): FeeSpec {
  // Fees are charged only on close or settle, with no numeric rate in the official docs and a per-deployer
  // fee scale (census, H/M). modelId "unknown" and ttlSec 0 fail closed: no net-of-fee number is derived.
  return {
    modelId: "unknown",
    payer: "buyer_adds_seller_withholds",
    paramsSource: { url: HYPERLIQUID_INFO_URL, field: "userFees", granularity: "market" },
    verifiedAt: "never",
    ttlSec: 0,
  };
}

function bookLevels(raw: ReadonlyArray<{ px: string; sz: string }>, side: "bids" | "asks"): Level[] {
  const levels: Level[] = [];
  for (const { px, sz } of raw) {
    if (!isDec(px) || !isDec(sz)) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "level_not_decimal");
    // An outcome price is a probability: strictly between 0 and 1.
    if (compareDec(px, "0") <= 0 || compareDec(px, "1") >= 0) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "level_price_range");
    // A zero-size level is no liquidity; it is dropped, not shown.
    if (compareDec(sz, "0") === 0) continue;
    levels.push({ price: canonDec(px), size: canonDec(sz) });
  }
  // Sort explicitly; the venue's order is never trusted.
  levels.sort((a, b) => (side === "bids" ? compareDec(b.price, a.price) : compareDec(a.price, b.price)));
  return levels;
}

export function createHyperliquidAdapter(deps: AdapterDeps): HyperliquidAdapter {
  let loadedCache: Loaded | null = null;
  let inFlight: Promise<Loaded> | null = null;
  let report: HyperliquidReadReport = { parsed: 0, dropped: 0, questionsDropped: 0, midsAvailable: false };

  const post = (type: HyperliquidInfoType, extra: Record<string, unknown>, deadlineAtMs?: number, notFound?: readonly number[]): Promise<unknown> =>
    requestJson(deps, {
      venue: "hyperliquid",
      url: HYPERLIQUID_INFO_URL,
      method: "POST",
      body: { type, ...extra },
      ...(deadlineAtMs === undefined ? {} : { deadlineAtMs }),
      ...(notFound === undefined ? {} : { notFoundStatuses: notFound }),
    });

  async function fetchLoaded(): Promise<Loaded> {
    const [metaBody, midsBody] = await Promise.all([
      post("outcomeMeta", {}),
      // The prices are a nicety; their failure must not hide the market list.
      post("allMids", {}).then(
        (body) => body,
        () => null,
      ),
    ]);
    const meta = parseOutcomeMeta(metaBody);
    const mids = midsBody === null ? null : midsOf(midsBody);
    const next: Loaded = {
      atMs: deps.nowMs(),
      order: meta.order,
      specs: meta.specs,
      groups: groupsOf(meta.questions),
      mids,
      report: { parsed: meta.specs.size, dropped: meta.dropped, questionsDropped: meta.questionsDropped, midsAvailable: mids !== null },
    };
    report = next.report;
    return next;
  }

  // One metadata read serves a whole paging session; weight 20 per call makes re-reading it per page costly.
  async function load(): Promise<Loaded> {
    if (loadedCache !== null && deps.nowMs() - loadedCache.atMs < META_TTL_MS) return loadedCache;
    inFlight ??= fetchLoaded()
      .then((next) => {
        loadedCache = next;
        return next;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  const prov = (source: string, freshness: Prov["freshness"]): Prov => ({
    venue: "hyperliquid",
    source,
    fetchedAtMs: deps.nowMs(),
    transport: "T0",
    freshness,
    ttlMs: META_TTL_MS,
    license: "unknown",
  });

  function refOf(spec: OutcomeSpec, group: GroupInfo | undefined): MarketRef {
    const yes = encodingOf(spec.outcome, 0);
    const no = encodingOf(spec.outcome, 1);
    return {
      venue: "hyperliquid",
      marketId: String(spec.outcome),
      native: {
        outcome: String(spec.outcome),
        yesCoin: coinOf(yes),
        noCoin: coinOf(no),
        yesToken: tokenOf(yes),
        noToken: tokenOf(no),
        yesAssetId: String(assetIdOf(yes)),
        noAssetId: String(assetIdOf(no)),
        ...(spec.venue === undefined ? {} : { deployerVenue: spec.venue }),
        ...(spec.deployerFeeScale === undefined ? {} : { deployerFeeScale: canonDec(spec.deployerFeeScale) }),
        ...(group === undefined ? {} : { question: String(group.question) }),
      },
    };
  }

  function sideOf(spec: OutcomeSpec, side: Side, mid: string | null): OutcomeSummary {
    return {
      index: side,
      role: side === 0 ? "yes" : "no",
      // Deployer text, even for "Yes"/"No": a template may rename a side.
      label: untrusted(cleanLine(spec.sideSpecs[side].name, 60)),
      tokenId: coinOf(encodingOf(spec.outcome, side)),
      displayPrice: mid,
    };
  }

  function statusOf(pairs: readonly SpecPair[] | null): { status: Status; closesAtUtc: string | null } {
    const closes = closeOf(pairs);
    // Presence in outcomeMeta is taken as "listed"; a close time in the past means awaiting settlement.
    const status: Status = closes !== null && Date.parse(closes) <= deps.nowMs() ? "closed" : "active";
    return { status, closesAtUtc: closes };
  }

  function summaryOf(spec: OutcomeSpec, loaded: Loaded): MarketSummary {
    const pairs = parseSpec(spec.description);
    const { status, closesAtUtc } = statusOf(pairs);
    const title = titleOf(spec.name, spec.description, pairs);
    return {
      ref: refOf(spec, loaded.groups.get(spec.outcome)),
      title: untrusted(title),
      // An outcome spec carries no category field: the title's words are the only source, so the verdict is at
      // most "keyword" and is "other" for a spec that names nothing in the fixed table.
      category: categorise({ venue: "hyperliquid", native: [], title }),
      status,
      closesAtUtc,
      outcomes: ([0, 1] as const).map((side) => sideOf(spec, side, loaded.mids?.get(coinOf(encodingOf(spec.outcome, side))) ?? null)),
      // No volume on the REST route this adapter reads (24 hour notionals are websocket-only).
      volume: { amount: null, unit: "unknown", windowHours: null },
      // The mid is a reference, never an executable price; it is "recent", not "live".
      prov: prov(SOURCE.market, "recent"),
    };
  }

  async function listMarkets(query: ListMarketsQuery): Promise<Page<MarketSummary>> {
    const statuses = allowedStatuses(query);
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? PAGE_DEFAULT), 1), PAGE_MAX);
    const offset = parseCursor(query.cursor);
    const needle = query.text === undefined ? "" : normalizeForHash(query.text).toLowerCase();
    const loaded = await load();

    const matching: MarketSummary[] = [];
    for (const outcome of loaded.order) {
      const spec = loaded.specs.get(outcome);
      if (spec === undefined) continue;
      const summary = summaryOf(spec, loaded);
      if (!statuses.has(summary.status)) continue;
      if (needle !== "" && !`${summary.title.value} ${cleanLine(spec.name, 100)}`.toLowerCase().includes(needle)) continue;
      matching.push(summary);
    }
    const items = matching.slice(offset, offset + limit);
    return { items, next: offset + limit < matching.length ? String(offset + limit) : null };
  }

  function marketOf(spec: OutcomeSpec, group: GroupInfo | undefined, status: Status, closesAtUtc: string | null, settleFraction: string | null): Market {
    const pairs = parseSpec(spec.description);
    const fullText = `${spec.name}\n${spec.description}`;
    const outcomes: Outcome[] = ([0, 1] as const).map((side) => {
      const summary = sideOf(spec, side, null);
      return { index: summary.index, role: summary.role, label: summary.label, tokenId: summary.tokenId };
    });
    const marketGroup: MarketGroup | undefined =
      group === undefined
        ? undefined
        : // Exactly one named outcome of a question settles Yes and the fallback outcome covers the rest
          // (official docs via the census), so the set is exhaustive by rule.
          { key: `hyperliquid:question:${group.question}`, kind: "mutually_exclusive", exhaustive: "by_rule" };
    const ref = refOf(spec, group);
    const title = titleOf(spec.name, spec.description, pairs);
    return {
      ref: settleFraction === null ? ref : { ...ref, native: { ...ref.native, settleFraction } },
      title: untrusted(title),
      category: categorise({ venue: "hyperliquid", native: [], title }),
      outcomes,
      rules: {
        text: untrusted(cleanBlock(fullText, RULES_MAX)),
        // The shared rules-v2 canonicalisation (sdk/rules.ts) over the name and the description.
        sha256: rulesFingerprintOfFields([spec.name, spec.description]),
        sources: [],
        mechanism: isProtocolMarkClass(pairs) ? "protocol_mark" : "unknown",
        ...(closesAtUtc === null ? {} : { cutoffUtc: closesAtUtc }),
        // Yes pays settleFraction in [0, 1] and No pays the rest (official docs via the census).
        void: "scalar",
      },
      status,
      tradable: {
        ok: false,
        reasons: ["read_only_adapter", "excluded_persons_clause_not_evaluated", "response_shapes_unverified"],
      },
      timesUtc: closesAtUtc === null ? {} : { closesAt: closesAtUtc },
      tick: TICK,
      collateral: { symbol: symbolOf(spec), chain: "hyperliquid:hypercore", decimals: 6, custody: "self" },
      ...(marketGroup === undefined ? {} : { group: marketGroup }),
      fee: unknownFee(),
      prov: { fetchedAtMs: deps.nowMs(), source: SOURCE.market, adapterVersion: HYPERLIQUID_ADAPTER_VERSION, schemaHash: HYPERLIQUID_SCHEMA_HASH },
    };
  }

  async function getMarket(ref: MarketRef): Promise<Market> {
    const outcome = ref.venue === "hyperliquid" ? outcomeFromMarketId(ref.marketId) : null;
    if (outcome === null) throw new AdapterFailure("hyperliquid", "NOT_FOUND", "bad_ref");

    const loaded = await load();
    const listed = loaded.specs.get(outcome);
    if (listed !== undefined) {
      const { status, closesAtUtc } = statusOf(parseSpec(listed.description));
      return marketOf(listed, loaded.groups.get(outcome), status, closesAtUtc, null);
    }

    // Not listed: ask for its settlement. An unknown outcome may answer with a 4xx or 5xx status.
    const body = await post("settledOutcome", { outcome }, undefined, [400, 404, 422, 500]);
    if (body === null) throw new AdapterFailure("hyperliquid", "NOT_FOUND", "unknown_outcome");
    const settled = settledOutcomeSchema.safeParse(body);
    if (!settled.success) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "settled_outcome");
    if (settled.data.spec.outcome !== outcome) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "outcome_mismatch");
    // settleFraction is the payout of Yes; it must be a probability.
    if (compareDec(settled.data.settleFraction, "1") > 0) throw new AdapterFailure("hyperliquid", "SCHEMA_DRIFT", "settle_fraction_range");
    return marketOf(settled.data.spec, loaded.groups.get(outcome), "resolved", closeOf(parseSpec(settled.data.spec.description)), canonDec(settled.data.settleFraction));
  }

  async function fetchBook(token: TokenRef, deadlineAtMs: number): Promise<Result<Book, AdapterError>> {
    const parsedToken = token.venue === "hyperliquid" ? parseOutcomeToken(token.tokenId) : null;
    if (parsedToken === null) return { ok: false, error: "NOT_SUPPORTED" };
    const coin = coinOf(parsedToken.encoding);
    try {
      const body = await post("l2Book", { coin }, deadlineAtMs);
      // A null body is how an unknown coin may be reported.
      if (body === null) return { ok: false, error: "NOT_FOUND" };
      const parsed = l2BookSchema.safeParse(body);
      if (!parsed.success) return { ok: false, error: "SCHEMA_DRIFT" };
      // The answer must be for the coin that was asked about.
      if (parsed.data.coin !== coin) return { ok: false, error: "SCHEMA_DRIFT" };
      const now = deps.nowMs();
      if (Math.abs(now - parsed.data.time) > STALE_BOOK_MS) return { ok: false, error: "STALE" };
      const bids = bookLevels(parsed.data.levels[0], "bids");
      const asks = bookLevels(parsed.data.levels[1], "asks");
      if (bids.length === 0 && asks.length === 0) return { ok: false, error: "EMPTY_BOOK" };
      const bestBid = bids[0];
      const bestAsk = asks[0];
      // A crossed or locked book is not a state of a matching engine: treat it as a bad read.
      if (bestBid !== undefined && bestAsk !== undefined && compareDec(bestBid.price, bestAsk.price) >= 0) return { ok: false, error: "SCHEMA_DRIFT" };
      return {
        ok: true,
        value: {
          token: { venue: "hyperliquid", tokenId: coin },
          bids,
          asks,
          asOfMs: now,
          venueTsMs: parsed.data.time,
          // Yes and No have their own books on the venue (a merged engine mirrors them); neither is derived here.
          derived: "native",
        },
      };
    } catch (error) {
      if (error instanceof AdapterFailure) return { ok: false, error: error.code };
      return { ok: false, error: "SCHEMA_DRIFT" };
    }
  }

  async function getBooks(tokens: readonly TokenRef[], opts: { readonly deadlineMs: number }): Promise<ReadonlyArray<Result<Book, AdapterError>>> {
    const deadlineAtMs = resolveDeadline(opts.deadlineMs, deps.nowMs());
    const results: Array<Result<Book, AdapterError>> = [];
    for (let i = 0; i < tokens.length; i += BOOK_CONCURRENCY) {
      const chunk = tokens.slice(i, i + BOOK_CONCURRENCY);
      results.push(...(await Promise.all(chunk.map((token) => fetchBook(token, deadlineAtMs)))));
    }
    return results;
  }

  async function getFeeSpec(): Promise<FeeSpec> {
    return unknownFee();
  }

  async function health(): Promise<VenueHealth> {
    const notes = [
      `response shapes ${HYPERLIQUID_SHAPE_STATUS.status}: ${HYPERLIQUID_SHAPE_STATUS.summary}`,
      "outcome markets are deployer-settled for most listings; no dispute process is documented",
      HYPERLIQUID_EXCLUDED_PERSONS_CLAUSE,
    ];
    try {
      const meta = parseOutcomeMeta(await post("outcomeMeta", {}));
      return {
        ok: true,
        notes: [...notes, `outcomes parsed: ${meta.specs.size}, dropped: ${meta.dropped}, questions dropped: ${meta.questionsDropped}`],
      };
    } catch (error) {
      return { ok: false, notes: [...notes, `unreachable or unreadable: ${error instanceof AdapterFailure ? error.code : "SCHEMA_DRIFT"}`] };
    }
  }

  return {
    id: "hyperliquid",
    caps: CAPS,
    shapeStatus: HYPERLIQUID_SHAPE_STATUS,
    listMarkets,
    getMarket,
    getBooks,
    getFeeSpec,
    health,
    lastReadReport: () => report,
  };
}
