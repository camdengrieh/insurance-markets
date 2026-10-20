// Report over the recorded data: spread distribution, persistence, depth-limited size and
// modelled post-fee net edge, by venue pair and time-to-close bucket.
//
// This report makes no profit claim. Every number is an OBSERVATION of recorded order books run
// through pm/core's fee, lock and haircut model at the moment of the snapshot. It does not say a
// discrepancy could have been traded: latency, leg risk, transfers, account limits and rule
// divergence beyond a flat haircut are not modelled, and the pre-registered day-90 test of
// docs/market-linking-design.md section 13.5 is not performed here.
//
// Exactness: all prices, sizes and edges are rationals (pm/core/rational.ts); the output is
// decimal strings. Pairing tolerance, intervals and gaps are the only plain numbers (times).

import { walkPair, walkPartitionLong, walkPartitionShort, type BookLeg, type DepthParams } from "../core/depth.js";
import { DEFAULTS, lockRate } from "../core/edge.js";
import { polymarketFeeSpec, unknownFeeSpec, xoFeeSpec, type FeeSource } from "../core/fee-specs.js";
import { haircutForBasis } from "../core/labels.js";
import type { ParsedBook, ParsedLevel } from "../core/books.js";
import {
  ONE,
  ZERO,
  absR,
  add,
  cmp,
  div,
  ratFromDec,
  ratFromInt,
  sub,
  type Rational,
} from "../core/rational.js";
import type { BasisAxis, BasisClass, Exhaustive, FeeSpec, VenueId } from "../types.js";
import type { RecorderConfig } from "./config.js";
import { detectGaps, thresholdMs } from "./gaps.js";
import { countDist, dist, episodes, type CountDist, type Dist } from "./stats.js";
import type { RecorderStore } from "./store.js";
import type { FeeRecord, MarketStateRow, SnapshotRow, TargetGroup, TargetLink } from "./types.js";

export const HORIZON_BUCKETS = ["lt_1d", "1_3d", "3_14d", "14_60d", "gte_60d", "unknown"] as const;
export type HorizonBucket = (typeof HORIZON_BUCKETS)[number];

const DAY_MS = 86_400_000;

export function horizonBucket(daysLeft: number | null): HorizonBucket {
  if (daysLeft === null || !Number.isFinite(daysLeft)) return "unknown";
  if (daysLeft < 1) return "lt_1d";
  if (daysLeft < 3) return "1_3d";
  if (daysLeft < 14) return "3_14d";
  if (daysLeft < 60) return "14_60d";
  return "gte_60d";
}

export const DISCLAIMERS: readonly string[] = [
  "This report describes recorded order-book discrepancies and a modelled net figure. It makes no claim that any discrepancy could have been traded.",
  "Not modelled: latency and leg risk between the two venues, transfer and withdrawal time, account, region and size limits, minimum order sizes, tick rounding, taxes, fee changes after the snapshot, and any resolution divergence beyond the flat haircut for the link's basis class.",
  "Books are sampled, not streamed: a discrepancy shorter than the sampling interval is invisible, and persistence figures are lower bounds measured between samples.",
  "NO-side prices are derived from the recorded YES book (complement), so they are not confirmed as resting orders.",
  "The pre-registered day-90 statistical test is not run by this report.",
];

export const ASSUMPTIONS: readonly string[] = [
  "Fees are rebuilt from the venue fee facts recorded with the snapshot, through pm/core fee specs: XO from effectiveFeeConfig.takerFeeBps with the curve p(1-p) form; Polymarket from the market's own feeSchedule. Limitless exposes only a fee flag, so its net edge is not computed.",
  "A fee spec older than three state intervals at the snapshot time is treated as stale and the net figure is withheld.",
  "Capital lock charges the hurdle rate from pm/core DEFAULTS (annual) over the time to the latest known close; an unknown close withholds the net figure.",
  "The haircut per share comes from the link's basis class (pm/core DEFAULT_DELTA); a basis of 'different' is never priced and withholds the net figure. Legging reserve and fixed costs are zero (not modelled).",
  "Candidate links are included in the recorded set and are marked by state; a candidate is not a verified pair.",
];

export interface ReportOptions {
  readonly nowMs: number;
  readonly config: Pick<
    RecorderConfig,
    "gapFactor" | "intervalSec" | "shortIntervalSec" | "shortHorizonSec" | "postCloseGraceSec" | "resolveIntervalSec"
  >;
  // Two snapshots belong to the same observation when this close.
  readonly pairToleranceSec?: number;
  readonly hurdleApy?: Rational;
}

export interface PersistenceRow {
  readonly episodes: number;
  readonly observations: CountDist | null;
  // First to last snapshot of an episode: a lower bound on how long the condition held.
  readonly spanSec: CountDist | null;
}

export interface CellRow {
  readonly key: string;
  readonly kind: "pair" | "group_short_basket" | "group_long_basket";
  readonly venues: string;
  readonly horizon: HorizonBucket;
  readonly nObservations: number;
  readonly nGrossPositive: number;
  readonly nNetPositive: number;
  readonly nNetWithheld: number;
  readonly grossPerShare: Dist | null;
  readonly modelNetPerShare: Dist | null;
  readonly midGap: Dist | null;
  readonly ownSpreads: Readonly<Record<string, Dist | null>>;
  // Walk size and modelled net total in collateral units, at observations with a positive modelled net only.
  readonly depthLimitedShares: Dist | null;
  readonly modelNetTotal: Dist | null;
  readonly persistenceGross: PersistenceRow;
  readonly persistenceNet: PersistenceRow;
  readonly smallSample: boolean;
}

export interface Report {
  readonly generatedAtMs: number;
  readonly window: { readonly firstMs: number | null; readonly lastMs: number | null; readonly days: string | null };
  readonly disclaimers: readonly string[];
  readonly assumptions: readonly string[];
  readonly coverage: {
    readonly targets: number;
    readonly snapshots: number;
    readonly runs: number;
    readonly gaps: number;
    readonly missedHours: string;
    readonly perTarget: readonly { readonly key: string; readonly snapshots: number; readonly gaps: number }[];
    readonly eventsByKind: Readonly<Record<string, number>>;
  };
  readonly clockSkew: readonly { readonly host: string; readonly n: number; readonly minMs: number; readonly medianMs: number; readonly maxMs: number }[];
  readonly hostRequests: readonly { readonly host: string; readonly requests: number; readonly errors: number; readonly throttled: number; readonly backoffMs: number }[];
  readonly cells: readonly CellRow[];
  readonly exclusions: Readonly<Record<string, number>>;
}

// ---------------------------------------------------------------------------------------------
// Books and fee specs from stored rows

function parseLevels(levels: SnapshotRow["bids"]): ParsedLevel[] | null {
  const out: ParsedLevel[] = [];
  for (const [p, s] of levels) {
    const price = ratFromDec(p);
    const size = ratFromDec(s);
    if (!price.ok || !size.ok) return null;
    out.push({ price: price.value, size: size.value });
  }
  return out;
}

export function toParsedBook(s: SnapshotRow): ParsedBook | null {
  if (s.flags.includes("crossed")) return null;
  const bids = parseLevels(s.bids);
  const asks = parseLevels(s.asks);
  if (bids === null || asks === null) return null;
  return {
    token: { venue: s.venue as VenueId, tokenId: s.tokenId },
    bids,
    asks,
    convention: "best_first",
    derived: "native",
    asOfMs: s.observedMs,
  };
}

function flipLevels(levels: readonly ParsedLevel[]): ParsedLevel[] {
  return levels.map((l) => ({ price: sub(ONE, l.price), size: l.size }));
}

// The other outcome's view: NO bids are 1 - YES asks and NO asks are 1 - YES bids.
export function complementOf(b: ParsedBook): ParsedBook {
  return { ...b, bids: flipLevels(b.asks), asks: flipLevels(b.bids), derived: b.derived === "native" ? "complement" : "native" };
}

function feeSource(venue: string, atMs: number, ttlSec: number): FeeSource {
  return {
    url: venue === "xo" ? "https://api-mainnet.xo.market/api/markets/contract" : venue === "polymarket" ? "https://gamma-api.polymarket.com/markets" : `recorded:${venue}`,
    field: venue === "xo" ? "effectiveFeeConfig.takerFeeBps" : venue === "polymarket" ? "feeSchedule" : "metadata.fee",
    granularity: "market",
    verifiedAt: new Date(atMs).toISOString(),
    ttlSec,
  };
}

export function feeSpecFor(venue: string, fee: FeeRecord, atMs: number, ttlSec: number): FeeSpec {
  const source = feeSource(venue, atMs, ttlSec);
  if (venue === "xo" && fee.model === "xo_effective" && fee.params["takerBps"] !== undefined) {
    return xoFeeSpec({ takerBps: fee.params["takerBps"], ...(fee.params["makerBps"] === undefined ? {} : { makerBps: fee.params["makerBps"] }), source });
  }
  if (venue === "polymarket" && fee.model === "polymarket_schedule" && fee.params["rate"] !== undefined) {
    return polymarketFeeSpec({ rate: fee.params["rate"], ...(fee.params["exponent"] === undefined ? {} : { exponent: fee.params["exponent"] }), source });
  }
  return unknownFeeSpec(venue, source);
}

// ---------------------------------------------------------------------------------------------
// Per-target series

interface Series {
  readonly key: string;
  readonly venue: string;
  readonly snaps: readonly SnapshotRow[];
  readonly states: readonly (MarketStateRow & { readonly id: number })[];
}

function stateAt(series: Series, tMs: number): (MarketStateRow & { readonly id: number }) | null {
  let best: (MarketStateRow & { readonly id: number }) | null = null;
  for (const s of series.states) {
    if (s.observedMs > tMs) break;
    best = s;
  }
  return best;
}

function closeAt(series: Series, tMs: number, hint: number | null): number | null {
  let close: number | null = null;
  for (const s of series.states) {
    if (s.observedMs > tMs) break;
    if (s.closeMs !== null) close = s.closeMs;
  }
  return close ?? hint;
}

function topAsk(b: ParsedBook): Rational | null {
  return b.asks[0]?.price ?? null;
}
function topBid(b: ParsedBook): Rational | null {
  return b.bids[0]?.price ?? null;
}
function mid(b: ParsedBook): Rational | null {
  const x = topBid(b);
  const y = topAsk(b);
  return x === null || y === null ? null : div(add(x, y), ratFromInt(2));
}
function spread(b: ParsedBook): Rational | null {
  const x = topBid(b);
  const y = topAsk(b);
  return x === null || y === null ? null : sub(y, x);
}

// ---------------------------------------------------------------------------------------------
// One observation of a basket

interface ObsResult {
  readonly tMs: number;
  readonly bucket: HorizonBucket;
  readonly gross: Rational;
  readonly net: Rational | null;
  readonly qty: Rational | null;
  readonly netTotal: Rational | null;
  readonly midGap: Rational | null;
  readonly spreads: readonly { readonly venue: string; readonly value: Rational | null }[];
}

interface Side {
  readonly venue: string;
  readonly book: ParsedBook;
  readonly spec: FeeSpec;
  readonly id: string;
}

function topEdge(outcome: { readonly steps: readonly { readonly edge: { readonly net: Rational } }[]; readonly rejected: { readonly edge: { readonly net: Rational } } | null }): Rational | null {
  return outcome.steps[0]?.edge.net ?? outcome.rejected?.edge.net ?? null;
}

function lockFor(hurdle: Rational, closeMs: number | null, tMs: number): Rational | null {
  if (closeMs === null) return null;
  return lockRate(hurdle, div(ratFromInt(Math.max(0, closeMs - tMs)), ratFromInt(DAY_MS)));
}

function basisOf(cls: string): { readonly info: { readonly class: BasisClass; readonly axes: readonly BasisAxis[] } } {
  if (cls === "settlement_window" || cls === "settlement_source") return { info: { class: cls, axes: [] } };
  if (cls === "identical") return { info: { class: "identical", axes: [] } };
  return { info: { class: "identical", axes: ["condition_scope"] } };
}

// ---------------------------------------------------------------------------------------------
// Aggregation

class Cell {
  n = 0;
  grossPos = 0;
  netPos = 0;
  netWithheld = 0;
  gross: Rational[] = [];
  net: Rational[] = [];
  midGap: Rational[] = [];
  spreads = new Map<string, Rational[]>();
  qty: Rational[] = [];
  netTotal: Rational[] = [];
  epGross: { nObs: number; spanSec: number }[] = [];
  epNet: { nObs: number; spanSec: number }[] = [];
  constructor(readonly kind: CellRow["kind"], readonly venues: string, readonly horizon: HorizonBucket) {}

  add(o: ObsResult): void {
    this.n += 1;
    this.gross.push(o.gross);
    if (cmp(o.gross, ZERO) > 0) this.grossPos += 1;
    if (o.net === null) this.netWithheld += 1;
    else {
      this.net.push(o.net);
      if (cmp(o.net, ZERO) > 0) {
        this.netPos += 1;
        if (o.qty !== null) this.qty.push(o.qty);
        if (o.netTotal !== null) this.netTotal.push(o.netTotal);
      }
    }
    if (o.midGap !== null) this.midGap.push(o.midGap);
    for (const s of o.spreads) if (s.value !== null) this.spreads.set(s.venue, [...(this.spreads.get(s.venue) ?? []), s.value]);
  }

  row(): CellRow {
    const pers = (eps: { nObs: number; spanSec: number }[]): PersistenceRow => ({
      episodes: eps.length,
      observations: countDist(eps.map((e) => e.nObs)),
      spanSec: countDist(eps.map((e) => e.spanSec)),
    });
    return {
      key: `${this.kind}|${this.venues}|${this.horizon}`,
      kind: this.kind,
      venues: this.venues,
      horizon: this.horizon,
      nObservations: this.n,
      nGrossPositive: this.grossPos,
      nNetPositive: this.netPos,
      nNetWithheld: this.netWithheld,
      grossPerShare: dist(this.gross),
      modelNetPerShare: dist(this.net),
      midGap: dist(this.midGap),
      ownSpreads: Object.fromEntries([...this.spreads].sort(([a], [b]) => (a < b ? -1 : 1)).map(([v, xs]) => [v, dist(xs)])),
      depthLimitedShares: dist(this.qty),
      modelNetTotal: dist(this.netTotal),
      persistenceGross: pers(this.epGross),
      persistenceNet: pers(this.epNet),
      smallSample: this.n < 30,
    };
  }
}

// ---------------------------------------------------------------------------------------------

function nearest(sorted: readonly SnapshotRow[], from: number, tMs: number, tolMs: number): { readonly row: SnapshotRow | null; readonly next: number } {
  let j = from;
  while (j + 1 < sorted.length && (sorted[j + 1] as SnapshotRow).observedMs <= tMs) j += 1;
  const cands = [sorted[j], sorted[j + 1]].filter((x): x is SnapshotRow => x !== undefined);
  let best: SnapshotRow | null = null;
  for (const c of cands) if (Math.abs(c.observedMs - tMs) <= tolMs && (best === null || Math.abs(c.observedMs - tMs) < Math.abs(best.observedMs - tMs))) best = c;
  return { row: best, next: j };
}

export function buildReport(store: RecorderStore, opts: ReportOptions): Report {
  const cfg = opts.config;
  const tolMs = (opts.pairToleranceSec ?? 120) * 1000;
  const hurdle = opts.hurdleApy ?? DEFAULTS.hurdleApy;
  const ttlSec = cfg.resolveIntervalSec * 3;
  const exclusions: Record<string, number> = {};
  const exclude = (why: string): void => {
    exclusions[why] = (exclusions[why] ?? 0) + 1;
  };

  const targets = store.targets();
  const series = new Map<string, Series>();
  for (const t of targets) series.set(t.key, { key: t.key, venue: t.venue, snaps: store.snapshots(t.key), states: store.marketStates(t.key) });
  const hintOf = new Map(targets.map((t) => [t.key, t.closeHintMs]));

  // ---- coverage and gaps ----
  const perTarget: { key: string; snapshots: number; gaps: number }[] = [];
  let gapCount = 0;
  let missedMs = 0;
  for (const s of series.values()) {
    const close = closeAt(s, Number.MAX_SAFE_INTEGER, hintOf.get(s.key) ?? null);
    const gaps = detectGaps(s.snaps.map((x) => x.observedMs), close, cfg);
    gapCount += gaps.length;
    missedMs += gaps.reduce((a, g) => a + g.missedMs, 0);
    perTarget.push({ key: s.key, snapshots: s.snaps.length, gaps: gaps.length });
  }
  const eventsByKind: Record<string, number> = {};
  for (const e of store.events()) eventsByKind[e.kind] = (eventsByKind[e.kind] ?? 0) + 1;

  const skewBy = new Map<string, number[]>();
  for (const k of store.skews()) skewBy.set(k.host, [...(skewBy.get(k.host) ?? []), k.skewEstMs]);
  const clockSkew = [...skewBy]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([host, v]) => {
      const s = [...v].sort((a, b) => a - b);
      return { host, n: s.length, minMs: s[0] as number, medianMs: s[Math.ceil(s.length / 2) - 1] as number, maxMs: s[s.length - 1] as number };
    });

  const cells = new Map<string, Cell>();
  const cellOf = (kind: CellRow["kind"], venues: string, horizon: HorizonBucket): Cell => {
    const k = `${kind}|${venues}|${horizon}`;
    let c = cells.get(k);
    if (c === undefined) {
      c = new Cell(kind, venues, horizon);
      cells.set(k, c);
    }
    return c;
  };

  const sideAt = (s: Series, snap: SnapshotRow): Side | null => {
    const book = toParsedBook(snap);
    if (book === null) {
      exclude(snap.flags.includes("crossed") ? "crossed_book" : "unparseable_book");
      return null;
    }
    const st = stateAt(s, snap.observedMs);
    const fee = st?.fee ?? { model: "unknown" as const, params: {} };
    const stateTs = st?.observedMs ?? snap.observedMs;
    return { venue: s.venue, book, spec: feeSpecFor(s.venue, fee, stateTs, ttlSec), id: s.key };
  };

  // ---- pairs ----
  for (const link of store.links()) {
    if (link.legs.length !== 2 || !["identity", "near_identity", "complement"].includes(link.relation)) {
      exclude(`unsupported_relation_${link.relation}`);
      continue;
    }
    const [la, lb] = link.legs as [TargetLink["legs"][number], TargetLink["legs"][number]];
    const sa = series.get(la.targetKey);
    const sb = series.get(lb.targetKey);
    if (sa === undefined || sb === undefined) continue;
    const pairVenues = [sa.venue, sb.venue].sort().join("x");
    const basis = basisOf(link.basisClass).info;
    const haircut = haircutForBasis(basis);
    const track: { tMs: number; bucket: HorizonBucket; grossPos: boolean; netPos: boolean; gapMs: number }[] = [];
    let jb = 0;
    for (const snapA of sa.snaps) {
      const m = nearest(sb.snaps, jb, snapA.observedMs, tolMs);
      jb = m.next;
      if (m.row === null) {
        exclude("unpaired_snapshot");
        continue;
      }
      const A = sideAt(sa, snapA);
      const B = sideAt(sb, m.row);
      if (A === null || B === null) continue;
      const tMs = Math.max(snapA.observedMs, m.row.observedMs);
      const closeA = closeAt(sa, tMs, la.closeMs);
      const closeB = closeAt(sb, tMs, lb.closeMs);
      const closeMs = closeA !== null && closeB !== null ? Math.max(closeA, closeB) : null;
      const earliest = closeA !== null && closeB !== null ? Math.min(closeA, closeB) : (closeA ?? closeB);
      const bucket = horizonBucket(earliest === null ? null : (earliest - tMs) / DAY_MS);

      // Reference frame is leg A's YES. A flipped leg B lists the opposite outcome first.
      const refA = A.book;
      const refB = lb.flip ? complementOf(B.book) : B.book;
      const lock = lockFor(hurdle, closeMs, tMs);
      const dirs = [
        { yes: { ...A, book: refA }, no: { ...B, book: complementOf(refB) } },
        { yes: { ...B, book: refB }, no: { ...A, book: complementOf(refA) } },
      ];
      let best: { gross: Rational; net: Rational | null; qty: Rational | null; netTotal: Rational | null } | null = null;
      for (const d of dirs) {
        const p1 = topAsk(d.yes.book);
        const p2 = topAsk(d.no.book);
        if (p1 === null || p2 === null) continue;
        const gross = sub(sub(ONE, p1), p2);
        let net: Rational | null = null;
        let qty: Rational | null = null;
        let netTotal: Rational | null = null;
        if (haircut !== null && lock !== null) {
          const params: DepthParams = { tau: ZERO, lockRate: lock, reservePerShare: ZERO, haircutPerShare: haircut, nowMs: tMs };
          const legY: BookLeg = { id: `${d.yes.id}:yes`, book: d.yes.book, spec: d.yes.spec };
          const legN: BookLeg = { id: `${d.no.id}:no`, book: d.no.book, spec: d.no.spec };
          const r = walkPair(legY, legN, params);
          if (r.ok) {
            net = topEdge(r.value.outcome);
            qty = r.value.outcome.totals.qty;
            netTotal = r.value.outcome.totals.net;
          }
        }
        const cand = { gross, net, qty, netTotal };
        if (best === null) best = cand;
        else if (net !== null && best.net !== null ? cmp(net, best.net) > 0 : net !== null && best.net === null ? true : net === null && best.net === null && cmp(gross, best.gross) > 0) best = cand;
      }
      if (best === null) {
        exclude("one_side_empty");
        continue;
      }
      const ma = mid(refA);
      const mb = mid(refB);
      const result: ObsResult = {
        tMs,
        bucket,
        gross: best.gross,
        net: best.net,
        qty: best.qty,
        netTotal: best.netTotal,
        midGap: ma !== null && mb !== null ? absR(sub(ma, mb)) : null,
        spreads: [
          { venue: sa.venue, value: spread(A.book) },
          { venue: sb.venue, value: spread(B.book) },
        ],
      };
      cellOf("pair", pairVenues, bucket).add(result);
      track.push({ tMs, bucket, grossPos: cmp(best.gross, ZERO) > 0, netPos: best.net !== null && cmp(best.net, ZERO) > 0, gapMs: thresholdMs(closeMs, tMs, cfg) });
    }
    recordEpisodes(cells, "pair", pairVenues, track);
  }

  // ---- groups (same venue, mutually exclusive sets declared by a human) ----
  for (const g of store.groups()) groupObservations(g);

  function groupObservations(g: TargetGroup): void {
    const members = g.members.map((m) => series.get(m));
    if (members.some((m) => m === undefined) || members.length < 2) return;
    const ms = members as Series[];
    const anchor = ms[0] as Series;
    const cursors = ms.map(() => 0);
    const tracks = { short: [] as TrackPoint[], long: [] as TrackPoint[] };
    for (const snap of anchor.snaps) {
      const picked: SnapshotRow[] = [snap];
      let ok = true;
      for (let i = 1; i < ms.length; i += 1) {
        const m = nearest((ms[i] as Series).snaps, cursors[i] as number, snap.observedMs, tolMs);
        cursors[i] = m.next;
        if (m.row === null) {
          ok = false;
          break;
        }
        picked.push(m.row);
      }
      if (!ok) {
        exclude("group_member_unpaired");
        continue;
      }
      const sides = picked.map((p, i) => sideAt(ms[i] as Series, p));
      if (sides.some((s) => s === null)) continue;
      const S = sides as Side[];
      const tMs = Math.max(...picked.map((p) => p.observedMs));
      const closes = ms.map((m) => closeAt(m, tMs, hintOf.get(m.key) ?? null));
      const known = closes.filter((c): c is number => c !== null);
      const closeMs = known.length === closes.length ? Math.max(...known) : null;
      const bucket = horizonBucket(known.length === 0 ? null : (Math.min(...known) - tMs) / DAY_MS);
      const lock = lockFor(hurdle, closeMs, tMs);
      const params: DepthParams = { tau: ZERO, ...(lock === null ? {} : { lockRate: lock }), reservePerShare: ZERO, haircutPerShare: ZERO, nowMs: tMs };
      const spreads = S.map((s) => ({ venue: s.venue, value: spread(s.book) }));
      const n = S.length;
      const bids = S.map((s) => topBid(s.book));
      const asks = S.map((s) => topAsk(s.book));
      const sum = (xs: (Rational | null)[]): Rational | null => (xs.some((x) => x === null) ? null : xs.reduce<Rational>((a, x) => add(a, x as Rational), ZERO));
      const venues = `${g.venue}:group`;

      // Short basket: buy every NO; pays at least n - 1 when the set is exclusive.
      const sumBid = sum(bids);
      if (sumBid !== null) {
        let net: Rational | null = null;
        let qty: Rational | null = null;
        let netTotal: Rational | null = null;
        if (lock !== null) {
          const r = walkPartitionShort(S.map((s) => ({ id: `${s.id}:no`, book: complementOf(s.book), spec: s.spec })), params);
          if (r.ok) {
            net = topEdge(r.value.outcome);
            qty = r.value.outcome.totals.qty;
            netTotal = r.value.outcome.totals.net;
          }
        }
        const gross = sub(sumBid, ONE);
        cellOf("group_short_basket", venues, bucket).add({ tMs, bucket, gross, net, qty, netTotal, midGap: null, spreads });
        tracks.short.push({ tMs, bucket, grossPos: cmp(gross, ZERO) > 0, netPos: net !== null && cmp(net, ZERO) > 0, gapMs: thresholdMs(closeMs, tMs, cfg) });
      } else exclude("group_one_side_empty");

      // Long basket only when a human declared the set exhaustive.
      const sumAsk = sum(asks);
      if (sumAsk !== null && (g.exhaustive === "proven" || g.exhaustive === "by_rule")) {
        let net: Rational | null = null;
        let qty: Rational | null = null;
        let netTotal: Rational | null = null;
        if (lock !== null) {
          const r = walkPartitionLong(S.map((s) => ({ id: `${s.id}:yes`, book: s.book, spec: s.spec })), g.exhaustive as Exhaustive, params);
          if (r.ok) {
            net = topEdge(r.value.outcome);
            qty = r.value.outcome.totals.qty;
            netTotal = r.value.outcome.totals.net;
          }
        }
        const gross = sub(ONE, sumAsk);
        cellOf("group_long_basket", venues, bucket).add({ tMs, bucket, gross, net, qty, netTotal, midGap: null, spreads });
        tracks.long.push({ tMs, bucket, grossPos: cmp(gross, ZERO) > 0, netPos: net !== null && cmp(net, ZERO) > 0, gapMs: thresholdMs(closeMs, tMs, cfg) });
      }
      void n;
    }
    recordEpisodes(cells, "group_short_basket", `${g.venue}:group`, tracks.short);
    recordEpisodes(cells, "group_long_basket", `${g.venue}:group`, tracks.long);
  }

  const range = store.timeRange();
  const windowDays = range.firstMs !== null && range.lastMs !== null ? ((range.lastMs - range.firstMs) / DAY_MS).toFixed(2) : null;
  const rows = [...cells.values()].map((c) => c.row()).sort((a, b) => (a.key < b.key ? -1 : 1));
  const counts = store.counts();
  return {
    generatedAtMs: opts.nowMs,
    window: { firstMs: range.firstMs, lastMs: range.lastMs, days: windowDays },
    disclaimers: DISCLAIMERS,
    assumptions: ASSUMPTIONS,
    coverage: {
      targets: targets.length,
      snapshots: counts["snapshots"] ?? 0,
      runs: counts["runs"] ?? 0,
      gaps: gapCount,
      missedHours: (missedMs / 3_600_000).toFixed(1),
      perTarget: perTarget.sort((a, b) => (a.key < b.key ? -1 : 1)),
      eventsByKind: Object.fromEntries(Object.entries(eventsByKind).sort(([a], [b]) => (a < b ? -1 : 1))),
    },
    clockSkew,
    hostRequests: store.hostTotals().map((h) => ({ host: h.host, requests: h.requests, errors: h.errors, throttled: h.throttled, backoffMs: h.backoffMs })),
    cells: rows,
    exclusions: Object.fromEntries(Object.entries(exclusions).sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}

interface TrackPoint {
  readonly tMs: number;
  readonly bucket: HorizonBucket;
  readonly grossPos: boolean;
  readonly netPos: boolean;
  readonly gapMs: number;
}

// Episodes are measured per link or group and credited to the horizon bucket of their first sample
// (documented rule: a long episode counts once, in the bucket where it began). A run ends at any
// silence longer than the gap threshold in force at the earlier sample, as in detectGaps.
function recordEpisodes(cells: Map<string, Cell>, kind: CellRow["kind"], venues: string, track: readonly TrackPoint[]): void {
  if (track.length === 0) return;
  const maxGap = Math.max(...track.map((t) => t.gapMs));
  const bucketAt = new Map(track.map((t) => [t.tMs, t.bucket] as const));
  for (const which of ["gross", "net"] as const) {
    const eps = episodes(track.map((t) => ({ tMs: t.tMs, flag: which === "gross" ? t.grossPos : t.netPos, gapMs: t.gapMs })), maxGap);
    for (const e of eps) {
      const bucket = bucketAt.get(e.startMs) ?? "unknown";
      const cell = cells.get(`${kind}|${venues}|${bucket}`);
      if (cell === undefined) continue;
      (which === "gross" ? cell.epGross : cell.epNet).push({ nObs: e.nObs, spanSec: Math.round((e.endMs - e.startMs) / 1000) });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Text form

function d(x: Dist | null): string {
  return x === null ? "n/a" : `n=${x.n} min=${x.min} p05=${x.p05} p25=${x.p25} p50=${x.p50} p75=${x.p75} p95=${x.p95} max=${x.max}`;
}
function c(x: CountDist | null): string {
  return x === null ? "n/a" : `n=${x.n} median=${x.median} p90=${x.p90} max=${x.max}`;
}

export function formatReport(r: Report): string {
  const L: string[] = [];
  L.push("PM RECORDER REPORT (descriptive; not a trading claim)");
  L.push("");
  for (const x of r.disclaimers) L.push(`- ${x}`);
  L.push("");
  L.push(`generated: ${new Date(r.generatedAtMs).toISOString()}`);
  L.push(`window: ${r.window.firstMs === null ? "no data" : `${new Date(r.window.firstMs).toISOString()} to ${new Date(r.window.lastMs ?? r.window.firstMs).toISOString()} (${r.window.days} days)`}`);
  L.push("");
  L.push("COVERAGE");
  L.push(`  targets=${r.coverage.targets} snapshots=${r.coverage.snapshots} runs=${r.coverage.runs} gaps=${r.coverage.gaps} missed_hours=${r.coverage.missedHours}`);
  const ev = Object.entries(r.coverage.eventsByKind).map(([k, v]) => `${k}=${v}`).join(" ");
  L.push(`  events: ${ev === "" ? "none" : ev}`);
  for (const t of r.coverage.perTarget) L.push(`  ${t.key}: snapshots=${t.snapshots} gaps=${t.gaps}`);
  L.push("");
  L.push("CLOCK SKEW (estimated local clock minus server Date header, ms; resolution about 500 ms)");
  if (r.clockSkew.length === 0) L.push("  none logged");
  for (const s of r.clockSkew) L.push(`  ${s.host}: n=${s.n} min=${s.minMs} median=${s.medianMs} max=${s.maxMs}`);
  L.push("");
  L.push("REQUESTS");
  if (r.hostRequests.length === 0) L.push("  none logged");
  for (const h of r.hostRequests) L.push(`  ${h.host}: requests=${h.requests} errors=${h.errors} throttled=${h.throttled} backoff_ms=${h.backoffMs}`);
  L.push("");
  L.push("OBSERVATIONS BY VENUE PAIR AND TIME TO CLOSE (all edges per share, collateral units)");
  if (r.cells.length === 0) L.push("  no paired observations");
  for (const cell of r.cells) {
    L.push(`  [${cell.kind}] ${cell.venues}  horizon=${cell.horizon}${cell.smallSample ? "  SMALL SAMPLE (n<30, descriptive only)" : ""}`);
    L.push(`    observations=${cell.nObservations} gross>0=${cell.nGrossPositive} modelled_net>0=${cell.nNetPositive} net_withheld=${cell.nNetWithheld}`);
    L.push(`    gross gap (before fees):        ${d(cell.grossPerShare)}`);
    L.push(`    modelled net at top of book:    ${d(cell.modelNetPerShare)}`);
    L.push(`    cross-venue mid gap:            ${d(cell.midGap)}`);
    for (const [v, x] of Object.entries(cell.ownSpreads)) L.push(`    own bid-ask spread ${v}: ${d(x)}`);
    L.push(`    depth-limited shares (net>0):   ${d(cell.depthLimitedShares)}`);
    L.push(`    modelled net total (net>0):     ${d(cell.modelNetTotal)}`);
    L.push(`    persistence gross>0 episodes=${cell.persistenceGross.episodes} samples: ${c(cell.persistenceGross.observations)} span_sec(lower bound): ${c(cell.persistenceGross.spanSec)}`);
    L.push(`    persistence net>0   episodes=${cell.persistenceNet.episodes} samples: ${c(cell.persistenceNet.observations)} span_sec(lower bound): ${c(cell.persistenceNet.spanSec)}`);
  }
  L.push("");
  L.push("EXCLUDED OBSERVATIONS");
  const ex = Object.entries(r.exclusions);
  if (ex.length === 0) L.push("  none");
  for (const [k, v] of ex) L.push(`  ${k}: ${v}`);
  L.push("");
  L.push("ASSUMPTIONS");
  for (const a of r.assumptions) L.push(`- ${a}`);
  return `${L.join("\n")}\n`;
}

// Re-exported for tests.

