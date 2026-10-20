import assert from "node:assert/strict";
import { test } from "node:test";
import { complementOf, feeSpecFor, horizonBucket, toParsedBook, buildReport, formatReport, type Report } from "../../recorder/report.js";
import { mustConfig } from "../../recorder/config.js";
import { RecorderStore } from "../../recorder/store.js";
import type { SnapshotRow, Target, TargetGroup, TargetLink } from "../../recorder/types.js";
import { checkFeeSpec } from "../../core/fees.js";
import { dec } from "../../core/rational.js";

const H = 3_600_000;
const DAY = 24 * H;
const T0 = Date.parse("2026-10-20T12:00:00Z");
const cfg = mustConfig({});

type Lv = [string, string];
interface Obs {
  t: number;
  bids: Lv[];
  asks: Lv[];
  flags?: SnapshotRow["flags"];
}

function snapRow(key: string, o: Obs): SnapshotRow {
  const [venue, marketId] = key.split(":") as ["xo" | "polymarket" | "limitless", string];
  return {
    targetKey: key,
    venue,
    marketId,
    tokenId: `${marketId}-tok`,
    observedMs: o.t,
    reqStartMs: o.t,
    venueTsMs: null,
    bookHash: null,
    bids: o.bids,
    asks: o.asks,
    nBids: o.bids.length,
    nAsks: o.asks.length,
    bestBid: o.bids[0]?.[0] ?? null,
    bestAsk: o.asks[0]?.[0] ?? null,
    flags: o.flags ?? [],
    tick: null,
  };
}

interface Seed {
  targets: { key: string; fee: { model: "xo_effective" | "polymarket_schedule" | "limitless_flag" | "unknown"; params: Record<string, string> }; closeMs: number | null; obs: Obs[] }[];
  links?: TargetLink[];
  groups?: TargetGroup[];
  // Only one market-state row per target, so later snapshots rely on an ageing fee fact.
  stateOnce?: boolean;
}

function seed(s: Seed): RecorderStore {
  const store = RecorderStore.open(":memory:");
  store.startRun(T0, "test", "cfg");
  const targets: Target[] = s.targets.map((t) => {
    const [venue, marketId] = t.key.split(":") as ["xo" | "polymarket" | "limitless", string];
    return { key: t.key, venue, marketId, closeHintMs: null };
  });
  store.syncTargets(targets, s.links ?? [], s.groups ?? []);
  for (const t of s.targets) {
    const [venue, marketId] = t.key.split(":") as ["xo" | "polymarket" | "limitless", string];
    const first = Math.min(...t.obs.map((o) => o.t));
    // One state row per day keeps the fee spec fresh for every snapshot, as the real recorder does hourly.
    const last = Math.max(...t.obs.map((o) => o.t));
    for (let at = first; at <= (s.stateOnce === true ? first : last + H); at += H) {
      store.insertMarketState({ targetKey: t.key, venue, marketId, observedMs: at, tokenId: `${marketId}-tok`, status: "active", closeMs: t.closeMs, accepting: true, tick: null, fee: t.fee });
    }
    for (const o of t.obs) store.insertSnapshot(snapRow(t.key, o));
  }
  return store;
}

const XO_FEE = { model: "xo_effective", params: { takerBps: "600" } } as const;
const PM_FEE = { model: "polymarket_schedule", params: { rate: "0.04", exponent: "1" } } as const;
const LINK = (basis = "identical", relation = "identity", flipB = false): TargetLink => ({
  linkId: "lnk_00000000000000000000000000000001",
  relation,
  state: "approved",
  basisClass: basis,
  exhaustiveness: null,
  legs: [
    { targetKey: "xo:A", flip: false, closeMs: null },
    { targetKey: "polymarket:B", flip: flipB, closeMs: null },
  ],
});

function pairSeed(opts: { hours: number[]; polyBid?: (i: number) => string; closeMs?: number | null; basis?: string; polyTimeShift?: number; polyFee?: Seed["targets"][number]["fee"]; relation?: string; polyVenue?: "polymarket" | "limitless" }): Seed {
  const close = opts.closeMs === undefined ? T0 + 10 * DAY : opts.closeMs;
  const base = LINK(opts.basis ?? "identical", opts.relation ?? "identity");
  const bKey = `${opts.polyVenue ?? "polymarket"}:B`;
  const link: TargetLink = { ...base, legs: [base.legs[0]!, { ...base.legs[1]!, targetKey: bKey }] };
  return {
    targets: [
      { key: "xo:A", fee: XO_FEE, closeMs: close, obs: opts.hours.map((h) => ({ t: T0 + h * H, bids: [["0.38", "100"]], asks: [["0.40", "100"], ["0.42", "100"]] })) },
      {
        key: bKey,
        fee: opts.polyFee ?? PM_FEE,
        closeMs: close,
        obs: opts.hours.map((h, i) => ({ t: T0 + h * H + (opts.polyTimeShift ?? 0), bids: [[opts.polyBid?.(i) ?? "0.45", "50"], ["0.44", "100"]], asks: [["0.47", "100"]] })),
      },
    ],
    links: [link],
  };
}

function run(store: RecorderStore): Report {
  try {
    return buildReport(store, { nowMs: T0 + 30 * DAY, config: cfg });
  } finally {
    store.close();
  }
}

const cell = (r: Report, kind = "pair") => r.cells.find((c) => c.kind === kind);

test("a cross-venue pair: exact gross gap, modelled net, depth-limited size and persistence", () => {
  const r = run(seed(pairSeed({ hours: [0, 1, 2, 3, 4, 5] })));
  const c = cell(r);
  assert.ok(c);
  assert.equal(c.venues, "polymarketxxo");
  assert.equal(c.horizon, "3_14d");
  assert.equal(c.nObservations, 6);
  assert.equal(c.nGrossPositive, 6);
  // buy YES on XO at 0.40, buy NO on Polymarket at 1 - 0.45: gross 1 - 0.40 - 0.55
  assert.deepEqual([c.grossPerShare?.min, c.grossPerShare?.p50, c.grossPerShare?.max], ["0.05", "0.05", "0.05"]);
  // net at t0: 0.05 - 0.0144 (xo 600 bps x p(1-p)) - 0.0099 (pm 4% x p(1-p)) - 0.005 haircut - 8% x 10/365 x 0.95 lock
  assert.equal(c.modelNetPerShare?.min, "0.018618");
  assert.equal(c.nNetPositive, 6);
  assert.equal(c.nNetWithheld, 0);
  // 50 shares at the first level, 50 more against the second Polymarket level; the third level is below zero.
  assert.equal(c.depthLimitedShares?.max, "100");
  assert.equal(c.persistenceGross.episodes, 1);
  assert.deepEqual(c.persistenceGross.observations, { n: 1, median: 6, p90: 6, max: 6 });
  assert.equal(c.persistenceGross.spanSec?.max, 5 * 3600);
  assert.equal(c.smallSample, true);
  // own spreads and the mid gap
  assert.equal(c.ownSpreads["xo"]?.p50, "0.02");
  assert.equal(c.ownSpreads["polymarket"]?.p50, "0.02");
  assert.equal(c.midGap?.p50, "0.07", "XO mid 0.39 against Polymarket mid 0.46");
});

test("an episode ends when the condition fails, and never spans a recorder gap", () => {
  const split = cell(run(seed(pairSeed({ hours: [0, 1, 2, 3, 4, 5], polyBid: (i) => (i === 3 ? "0.39" : "0.45") }))));
  assert.equal(split?.persistenceGross.episodes, 2);
  assert.deepEqual(split?.persistenceGross.observations, { n: 2, median: 2, p90: 3, max: 3 });
  assert.equal(split?.nGrossPositive, 5);
  const gapped = cell(run(seed(pairSeed({ hours: [0, 1, 2, 8, 9] }))));
  assert.equal(gapped?.persistenceGross.episodes, 2, "six hours of silence break the episode although both sides were positive");
});

test("ADT-5: an episode never spans a gap the same report counts, also when the gap is inside the short slice", () => {
  // Close 73 h out: the first sample is in the regular slice (gap threshold 2.5 h), the rest in the
  // short slice (threshold 12.5 min). 2h10 to 2h50 is 40 minutes: a gap on both targets.
  const r = run(seed(pairSeed({ hours: [0, 2, 2 + 5 / 60, 2 + 10 / 60, 2 + 50 / 60, 2 + 55 / 60], closeMs: T0 + 73 * H })));
  assert.equal(r.coverage.gaps, 2, "one 40-minute gap on each of the two targets");
  const total = r.cells.reduce((n, c) => n + c.persistenceGross.episodes, 0);
  assert.equal(total, 2, "the run is cut at the gap: two episodes, not one spanning 0 to 2h55");
  const spans = r.cells.flatMap((c) => (c.persistenceGross.spanSec === null ? [] : [c.persistenceGross.spanSec.max]));
  assert.ok(spans.every((sec) => sec <= 2 * 3600 + 10 * 60), `no episode longer than the first run (0 to 2h10): ${spans.join(",")}`);
});

test("net is withheld, never guessed, when the fee model, the close time or the basis is unknown", () => {
  const limitless = cell(run(seed(pairSeed({ hours: [0, 1, 2], polyVenue: "limitless", polyFee: { model: "limitless_flag", params: { feeFlag: "true" } } }))));
  assert.equal(limitless?.nNetWithheld, 3);
  assert.equal(limitless?.modelNetPerShare, null);
  assert.equal(limitless?.nGrossPositive, 3, "the gross gap is still reported");

  const noClose = cell(run(seed(pairSeed({ hours: [0, 1, 2], closeMs: null }))));
  assert.equal(noClose?.horizon, "unknown");
  assert.equal(noClose?.nNetWithheld, 3);

  const different = cell(run(seed(pairSeed({ hours: [0, 1], basis: "different" }))));
  assert.equal(different?.nNetWithheld, 2);

  const unknownFee = cell(run(seed(pairSeed({ hours: [0, 1], polyFee: { model: "unknown", params: {} } }))));
  assert.equal(unknownFee?.nNetWithheld, 2);
});

test("a stale fee fact withholds the net figure", () => {
  const spec = feeSpecFor("xo", XO_FEE, T0, 3 * 3600);
  assert.equal(checkFeeSpec(spec, T0 + 2 * H).ok, true);
  const stale = checkFeeSpec(spec, T0 + 4 * H);
  assert.equal(stale.ok, false);
  assert.equal(feeSpecFor("limitless", { model: "limitless_flag", params: { feeFlag: "true" } }, T0, 100).modelId, "unknown");
  assert.equal(feeSpecFor("polymarket", { model: "polymarket_schedule", params: { rate: "0.04", exponent: "2" } }, T0, 100).modelId, "curve_pq");
});

test("a fee fact older than three state intervals withholds the net figure in the report", () => {
  const s = pairSeed({ hours: [0, 1, 2, 3, 4, 5] });
  const r = run(seed({ ...s, stateOnce: true }));
  const c = cell(r);
  assert.equal(c?.nObservations, 6);
  assert.equal(c?.nNetWithheld, 2, "hours 4 and 5 are past the three-hour ttl; hour 3 is exactly at it and still valid");
});

test("crossed books and unpaired snapshots are excluded and counted, not silently used", () => {
  const s = pairSeed({ hours: [0, 1, 2, 3] });
  s.targets[0]!.obs[1] = { ...s.targets[0]!.obs[1]!, flags: ["crossed"] };
  s.targets[1]!.obs[2] = { ...s.targets[1]!.obs[2]!, t: T0 + 2 * H + 20 * 60_000 };
  const r = run(seed(s));
  assert.equal(cell(r)?.nObservations, 2);
  assert.equal(r.exclusions["crossed_book"], 1);
  assert.equal(r.exclusions["unpaired_snapshot"], 1);
});

test("a complement link flips the second leg into the first leg's frame", () => {
  // B's YES is A's NO. A asks YES 0.40; B asks YES 0.55, so buying both YES costs 0.95 for a payout of 1.
  const s = pairSeed({ hours: [0, 1], relation: "complement" });
  s.links![0] = { ...s.links![0]!, legs: [s.links![0]!.legs[0]!, { ...s.links![0]!.legs[1]!, flip: true }] };
  s.targets[1]!.obs = [0, 1].map((h) => ({ t: T0 + h * H, bids: [["0.52", "50"]], asks: [["0.55", "80"]] }));
  const c = cell(run(seed(s)));
  assert.equal(c?.grossPerShare?.max, "0.05");
  assert.equal(c?.nGrossPositive, 2);
});

test("unsupported relations are excluded and counted", () => {
  const s = pairSeed({ hours: [0, 1], relation: "ladder" });
  const r = run(seed(s));
  assert.equal(r.cells.length, 0);
  assert.equal(r.exclusions["unsupported_relation_ladder"], 1);
});

test("same-venue groups: the short basket always, the long basket only when declared exhaustive", () => {
  const mk = (exhaustive: TargetGroup["exhaustive"]): Seed => ({
    targets: ["xo:G1", "xo:G2", "xo:G3"].map((key, i) => ({
      key,
      fee: XO_FEE,
      closeMs: T0 + 10 * DAY,
      obs: [0, 1, 2].map((h) => ({ t: T0 + h * H, bids: [[["0.40", "0.35", "0.30"][i]!, "100"]], asks: [[["0.42", "0.37", "0.32"][i]!, "100"]] })) as Obs[],
    })),
    groups: [{ groupId: "g1", venue: "xo", exhaustive, members: ["xo:G1", "xo:G2", "xo:G3"] }],
  });
  const none = run(seed(mk("unknown")));
  assert.deepEqual(none.cells.map((c) => c.kind), ["group_short_basket"]);
  const short = none.cells[0]!;
  assert.equal(short.grossPerShare?.max, "0.05", "bids sum to 1.05 for a set that can pay at most 1");
  assert.equal(short.nGrossPositive, 3);
  const both = run(seed(mk("by_rule")));
  assert.deepEqual(both.cells.map((c) => c.kind).sort(), ["group_long_basket", "group_short_basket"]);
  const long = both.cells.find((c) => c.kind === "group_long_basket")!;
  assert.equal(long.nGrossPositive, 0, "asks sum to 1.11, so buying every YES costs more than the payout");
  assert.equal(long.grossPerShare?.max, "-0.11");
});

test("horizon buckets are exact at their edges", () => {
  assert.equal(horizonBucket(0.99), "lt_1d");
  assert.equal(horizonBucket(1), "1_3d");
  assert.equal(horizonBucket(3), "3_14d");
  assert.equal(horizonBucket(14), "14_60d");
  assert.equal(horizonBucket(60), "gte_60d");
  assert.equal(horizonBucket(null), "unknown");
  assert.equal(horizonBucket(Number.NaN), "unknown");
});

test("complement books are arithmetic on exact rationals and flip back to native", () => {
  const book = toParsedBook({ ...snapRow("xo:A", { t: 1, bids: [["0.38", "100"]], asks: [["0.40", "100"]] }) });
  assert.ok(book);
  const no = complementOf(book);
  assert.deepEqual(no.asks[0]?.price, dec("0.62"));
  assert.deepEqual(no.bids[0]?.price, dec("0.6"));
  assert.equal(no.derived, "complement");
  assert.equal(complementOf(no).derived, "native");
  assert.equal(toParsedBook(snapRow("xo:A", { t: 1, bids: [["0.5", "1"]], asks: [["0.4", "1"]], flags: ["crossed"] })), null);
});

test("the text report carries the disclaimers and makes no profit claim", () => {
  const r = run(seed(pairSeed({ hours: [0, 1, 2, 3, 4, 5] })));
  const text = formatReport(r);
  assert.match(text, /makes no claim that any discrepancy could have been traded/);
  assert.match(text, /SMALL SAMPLE/);
  assert.match(text, /not a trading claim/);
  for (const word of ["guarantee", "risk-free", "risk free", "profitable", "arbitrage opportunity", "free money", "you can make"]) {
    assert.equal(text.toLowerCase().includes(word), false, `report must not say "${word}"`);
  }
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(r)));
  assert.equal(/\d\.\d{7,}/.test(text), false, "no unrounded numbers");
});

test("an empty database yields an empty but valid report", () => {
  const r = run(RecorderStore.open(":memory:"));
  assert.equal(r.cells.length, 0);
  assert.equal(r.window.firstMs, null);
  assert.match(formatReport(r), /no data/);
});

test("coverage lists gaps found in the recorded series", () => {
  const r = run(seed(pairSeed({ hours: [0, 1, 2, 8, 9] })));
  assert.equal(r.coverage.gaps, 2, "one gap in each of the two series");
  assert.equal(r.coverage.snapshots, 10);
  assert.equal(r.coverage.missedHours, "12.0");
});
