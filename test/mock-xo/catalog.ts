// The mock's market catalogue: markets as the Data API and the orderbook describe them, built from the
// recorded fixtures in test/fixtures/xo so their SHAPE is the recorded shape by construction.
//
// A market is a small spec plus deterministic ids (keccak of the seed, so a run never depends on Math.random,
// the clock or the order tests ran in). The Data API detail and list rows are clones of recorded rows with the
// identifying fields overwritten; the orderbook market and books are derived from the same spec, so the
// Data API outcome tokens equal the orderbook Yes/No tokens (the client cross-checks that).

import { keccak256, toHex, type Hex } from "viem";

import { positionIdOf } from "../../src/xo/signing/ctf.js";
import { clone, fixture } from "../fixtures/xo/load.js";

type Json = Record<string, unknown>;

export type MarketKind = "clob" | "conviction";
export type DataMarketStatus = "PENDING" | "ACTIVE" | "PAUSED" | "CLOSED" | "RESOLVED" | "VOIDED" | "VOIDED_CLOSED" | "UPDATE_REQUIRED" | "CANCELLED";

export const MARKET_TYPE_CODE: Readonly<Record<MarketKind, number>> = { clob: 2, conviction: 4 };

// Statuses whose rows carry a winner (winningOutcomeId and winningOutcome, recorded in the closed and
// resolved fixtures).
const WINNER_STATUSES: ReadonlySet<DataMarketStatus> = new Set<DataMarketStatus>(["CLOSED", "RESOLVED"]);
// Statuses after which the orderbook has no book (the client treats a 404 on /book as "closed, resolved or unknown").
const NO_BOOK_STATUSES: ReadonlySet<DataMarketStatus> = new Set<DataMarketStatus>(["CLOSED", "RESOLVED", "VOIDED", "VOIDED_CLOSED", "CANCELLED"]);

export interface MarketSpec {
  // Determines every id. Two markets with the same seed are the same market.
  readonly seed: string;
  readonly title?: string;
  readonly kind?: MarketKind;
  readonly status?: DataMarketStatus;
  readonly startsAt?: string;
  readonly expiresAt?: string;
  // Data API effectiveFeeConfig.takerFeeBps. The orderbook /fee-rate stays 0, as live.
  readonly takerFeeBps?: number;
  // The orderbook's own `active` flag. Defaults to status === "ACTIVE".
  readonly orderbookActive?: boolean;
  // Counted by the list endpoint but not returned in `data` (live quirk, docs/research/02 A12).
  readonly hidden?: boolean;
  // Winner index for CLOSED and RESOLVED. Default 0 (Yes).
  readonly winner?: 0 | 1;
  // Yes-token mid in thousandths (1 to 999 minus the spread). Default 500.
  readonly midTicks?: number;
  // A market that exists on the chain (the write mock's creation flow) carries the ids the manager emitted
  // instead of ids derived from the seed.
  readonly conditionId?: string;
  readonly yesTokenId?: string;
  readonly noTokenId?: string;
  // The metadata URI the creator sent and the creator account (lower-case, no 0x).
  readonly metadataUri?: string;
  readonly creator?: string;
  // Block time of the creation (ms). Default: derived from the clock like the seeded markets.
  readonly createdAtMs?: number;
}

export interface MockMarket {
  readonly id: number;
  readonly seed: string;
  readonly conditionId: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: MarketKind;
  status: DataMarketStatus;
  readonly startsAt: string;
  expiresAt: string;
  readonly takerFeeBps: number;
  orderbookActive: boolean;
  readonly hidden: boolean;
  readonly winner: 0 | 1;
  readonly yesTokenId: string;
  readonly noTokenId: string;
  readonly createdAtMs: number;
  readonly midTicks: number;
  // Set for markets created through the manager (write mock); null for the seeded catalogue.
  metadataUri: string | null;
  readonly creator: string | null;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function conditionIdFor(seed: string): string {
  return keccak256(toHex(`mock-market:${seed}`));
}

// The outcome token ids are the real CTF position ids of the condition (index set 1 for Yes, 2 for No), as on XO,
// so the relay's decoded block can show the condition and the checker can bind it to the token (SC-7).
export function tokenIdFor(conditionId: string, index: 0 | 1): string {
  return positionIdOf(conditionId as Hex, index === 0 ? 1n : 2n).toString(10);
}

function slugify(title: string, id: number): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `${base === "" ? "market" : base}-${String(id)}`;
}

const DAY_MS = 86_400_000;

export function buildMarket(spec: MarketSpec, id: number, nowMs: number): MockMarket {
  const kind = spec.kind ?? "clob";
  const status = spec.status ?? "ACTIVE";
  const conditionId = spec.conditionId ?? conditionIdFor(spec.seed);
  const title = spec.title ?? `Mock market ${spec.seed}`;
  const midTicks = spec.midTicks ?? 500;
  if (!Number.isInteger(midTicks) || midTicks < 30 || midTicks > 970) throw new RangeError("midTicks must be an integer from 30 to 970");
  return {
    id,
    seed: spec.seed,
    conditionId,
    slug: slugify(title, id),
    title,
    kind,
    status,
    startsAt: spec.startsAt ?? iso(nowMs - DAY_MS),
    expiresAt: spec.expiresAt ?? iso(nowMs + 30 * DAY_MS),
    takerFeeBps: spec.takerFeeBps ?? 0,
    orderbookActive: spec.orderbookActive ?? status === "ACTIVE",
    hidden: spec.hidden ?? false,
    winner: spec.winner ?? 0,
    yesTokenId: spec.yesTokenId ?? tokenIdFor(conditionId, 0),
    noTokenId: spec.noTokenId ?? tokenIdFor(conditionId, 1),
    createdAtMs: spec.createdAtMs ?? nowMs - 2 * DAY_MS,
    midTicks,
    metadataUri: spec.metadataUri ?? null,
    creator: spec.creator ?? null,
  };
}

export function hasBook(market: MockMarket): boolean {
  return !NO_BOOK_STATUSES.has(market.status);
}

// ---- Data API rows ----------------------------------------------------------------------------------------------------

// A row is a clone of a recorded row with the identifying fields overwritten, so its shape is the recorded
// shape. The template is picked by what was recorded: one list row per lifecycle status that has a recording,
// and for the detail route one recording per kind (a flat 0 bps fee has a smaller effectiveFeeConfig).

interface ListTemplate {
  readonly file: string;
  readonly kind: MarketKind;
  readonly status: DataMarketStatus;
}

const LIST_TEMPLATES: readonly ListTemplate[] = [
  { file: "data-markets-closed-resolved.json", kind: "clob", status: "CLOSED" },
  { file: "live-data-list-resolved.json", kind: "conviction", status: "RESOLVED" },
  { file: "live-data-list-paused.json", kind: "conviction", status: "PAUSED" },
  { file: "live-data-list-update-required.json", kind: "clob", status: "UPDATE_REQUIRED" },
  { file: "live-data-list-voided.json", kind: "conviction", status: "VOIDED" },
  { file: "live-data-list-voided-closed.json", kind: "clob", status: "VOIDED_CLOSED" },
];
const DEFAULT_LIST_TEMPLATE = "data-markets-list.json";

function firstRow(name: string): Json {
  return clone((fixture(name) as { data: Json[] }).data[0] as Json);
}

function detailTemplateFile(market: MockMarket): string {
  if (market.kind === "conviction") return "data-market-by-contract-conviction.json";
  return market.takerFeeBps === 0 ? "data-market-by-slug.json" : "live-data-detail-fee-400.json";
}

function outcomeRowId(market: MockMarket, index: 0 | 1): number {
  return market.id * 2 + index;
}

function micro(ticks: number): string {
  return String(ticks * 1000);
}

function reviewStatusFor(market: MockMarket, recorded: unknown): unknown {
  if (market.status === "UPDATE_REQUIRED") return "UPDATE_REQUIRED";
  // A recorded UPDATE_REQUIRED review on a template does not describe an ACTIVE or PAUSED market.
  if (recorded === "UPDATE_REQUIRED") return "APPROVE";
  return recorded;
}

// Overwrites everything that identifies the market and leaves the rest of the recorded row alone.
function applyIdentity(row: Json, market: MockMarket): Json {
  row["id"] = market.id;
  row["createdAt"] = iso(market.createdAtMs);
  row["updatedAt"] = iso(market.createdAtMs + 60_000);
  row["contractMarketId"] = market.conditionId;
  row["conditionId"] = market.conditionId;
  row["createMarketBlockTimestamp"] = iso(market.createdAtMs - 2_000);
  row["title"] = market.title;
  row["slug"] = market.slug;
  row["type"] = MARKET_TYPE_CODE[market.kind];
  row["status"] = market.status;
  row["startsAt"] = market.startsAt;
  row["expiresAt"] = market.expiresAt;
  row["resolvedAt"] = ["CLOSED", "RESOLVED", "VOIDED", "VOIDED_CLOSED"].includes(market.status) ? iso(market.createdAtMs + DAY_MS) : null;
  row["totalVolume"] = "0";
  row["totalVolumeInUSD"] = "0";
  row["totalNotional"] = "0";
  row["totalNotionalInUSD"] = "0.00";
  row["reviewStatus"] = reviewStatusFor(market, row["reviewStatus"]);
  const outcomes: Json[] = [0, 1].map((i) => {
    const index = i as 0 | 1;
    const template = clone((row["outcomes"] as Json[])[index] as Json);
    template["id"] = outcomeRowId(market, index);
    template["marketId"] = market.id;
    template["outcomeTokenId"] = index === 0 ? market.yesTokenId : market.noTokenId;
    template["title"] = index === 0 ? "Yes" : "No";
    template["currentPrice"] = micro(index === 0 ? market.midTicks : 1000 - market.midTicks);
    template["volumeTraded"] = "0";
    template["volumeTradedInUSD"] = "0";
    template["notionalTraded"] = "0";
    template["index"] = index;
    return template;
  });
  row["outcomes"] = outcomes;
  const fee = row["effectiveFeeConfig"];
  if (typeof fee === "object" && fee !== null) (fee as Json)["takerFeeBps"] = market.takerFeeBps;
  if ("winningOutcomeId" in row || WINNER_STATUSES.has(market.status)) {
    row["winningOutcomeId"] = outcomeRowId(market, market.winner);
    row["winningOutcome"] = clone(outcomes[market.winner] as Json);
  }
  return row;
}

export function dataDetail(market: MockMarket): Json {
  return applyIdentity(clone(fixture(detailTemplateFile(market))) as Json, market);
}

export function dataListRow(market: MockMarket): Json {
  const match = LIST_TEMPLATES.find((entry) => entry.status === market.status);
  const row = applyIdentity(firstRow(match?.file ?? DEFAULT_LIST_TEMPLATE), market);
  // A status without a recording uses the active template, which has no winner keys.
  if (!WINNER_STATUSES.has(market.status)) {
    delete row["winningOutcomeId"];
    delete row["winningOutcome"];
  }
  return row;
}

// ---- orderbook ---------------------------------------------------------------------------------------------------------------------------------

export function orderbookMarket(market: MockMarket): Json {
  return {
    condition_id: market.conditionId,
    tokens: [
      { token_id: market.yesTokenId, outcome: "Yes", price: decimalFromTicks(market.midTicks, true) },
      { token_id: market.noTokenId, outcome: "No", price: decimalFromTicks(1000 - market.midTicks, true) },
    ],
    minimum_tick_size: 0.001,
    neg_risk: false,
    active: market.orderbookActive,
  };
}

// 495 -> "0.495"; with trim, 500 -> "0.5" (the market endpoint trims, the book does not).
export function decimalFromTicks(ticks: number, trim = false): string {
  const whole = Math.floor(ticks / 1000);
  const frac = String(ticks % 1000).padStart(3, "0");
  const text = `${String(whole)}.${frac}`;
  return trim ? text.replace(/0+$/, "").replace(/\.$/, ".0") : text;
}

export interface BookLevel {
  readonly price: string;
  readonly size: string;
}

export interface BookState {
  bids: BookLevel[];
  asks: BookLevel[];
  lastTrade: { readonly price: string; readonly side: "BUY" | "SELL" } | null;
  minOrderSize: string;
  lastUpdateId: number;
}

const DEFAULT_DEPTH: readonly [number, string][] = [
  [5, "1000"],
  [10, "2000"],
  [20, "5000"],
];

// A two-sided book around the token's mid: three levels a side, 5, 10 and 20 ticks away.
export function defaultBook(midTicks: number, lastUpdateId: number): BookState {
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  for (const [offset, size] of DEFAULT_DEPTH) {
    if (midTicks - offset >= 1) bids.push({ price: decimalFromTicks(midTicks - offset), size });
    if (midTicks + offset <= 999) asks.push({ price: decimalFromTicks(midTicks + offset), size });
  }
  return { bids, asks, lastTrade: null, minOrderSize: "0", lastUpdateId };
}
