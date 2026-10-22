import assert from "node:assert/strict";
import { test } from "node:test";
import { mustConfig } from "../../recorder/config.js";
import { buildDryRun, bookIntervalMs, closeOf, dueJobs, isRetired, nextDueMs, sliceFor } from "../../recorder/plan.js";
import type { TargetStateRow } from "../../recorder/store.js";
import type { Target } from "../../recorder/types.js";
import { countDist, dist, episodes, quantileSorted } from "../../recorder/stats.js";
import { detectGaps } from "../../recorder/gaps.js";
import { dec } from "../../core/rational.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const H = 3_600_000;
const cfg = mustConfig({});
const t = (key: string, closeHintMs: number | null = null): Target => {
  const [venue, marketId] = key.split(":") as ["xo" | "polymarket" | "limitless", string];
  return { key, venue, marketId, closeHintMs };
};
const st = (o: Partial<TargetStateRow> & { targetKey: string }): TargetStateRow => ({ lastBookMs: null, lastResolveMs: null, tokenId: "tok", closeMs: null, status: "active", failures: 0, retired: false, ...o });

test("short-dated markets get the faster slice; the boundary and the post-close window are exact", () => {
  assert.equal(sliceFor(null, NOW, cfg), "regular");
  assert.equal(sliceFor(NOW + 72 * H, NOW, cfg), "short");
  assert.equal(sliceFor(NOW + 72 * H + 1, NOW, cfg), "regular");
  assert.equal(sliceFor(NOW - 3 * H, NOW, cfg), "short", "still short just after close");
  assert.equal(sliceFor(NOW - 6 * H - 1, NOW, cfg), "regular");
  assert.equal(bookIntervalMs("short", cfg), 300_000);
  assert.equal(bookIntervalMs("regular", cfg), 3_600_000);
});

test("dueJobs: new targets first, cadence per slice, nothing before its time, retired never", () => {
  const targets = [t("xo:a", NOW + 10 * H), t("xo:b", NOW + 30 * 24 * H), t("polymarket:c"), t("xo:d", NOW - 7 * H)];
  const states = new Map<string, TargetStateRow>([
    ["xo:a", st({ targetKey: "xo:a", lastBookMs: NOW - 301_000, lastResolveMs: NOW - 100_000 })],
    ["xo:b", st({ targetKey: "xo:b", lastBookMs: NOW - 301_000, lastResolveMs: NOW - 100_000 })],
    ["xo:d", st({ targetKey: "xo:d", lastBookMs: NOW - 10 * H, lastResolveMs: NOW - 10 * H })],
  ]);
  const jobs = dueJobs(targets, states, NOW, cfg);
  assert.deepEqual(jobs.map((j) => j.target.key), ["polymarket:c", "xo:a"], "c was never sampled; a is short and 301 s old; b is regular and fresh; d is past close plus grace");
  assert.equal(jobs[0]?.needResolve, true);
  assert.equal(jobs[1]?.needResolve, false);
  assert.equal(isRetired(t("xo:d", NOW - 7 * H), undefined, NOW, cfg), true);
  assert.equal(isRetired(t("xo:x"), st({ targetKey: "xo:x", retired: true }), NOW, cfg), true);
});

test("a target with no token retries its state call with growing delay, capped by the interval", () => {
  const tg = [t("xo:a")];
  const failing = (failures: number, ago: number) => new Map([["xo:a", st({ targetKey: "xo:a", tokenId: null, lastResolveMs: NOW - ago, failures })]]);
  assert.equal(dueJobs(tg, failing(1, 100_000), NOW, cfg).length, 0, "120 s * 2 not reached");
  assert.equal(dueJobs(tg, failing(1, 250_000), NOW, cfg).length, 1);
  assert.equal(dueJobs(tg, failing(10, 1_000_000), NOW, cfg).length, 0, "delay capped at the resolve interval of 1 h");
  assert.equal(dueJobs(tg, failing(10, 3_700_000), NOW, cfg).length, 1);
});

test("nextDueMs reports the earliest due time, null when nothing is active", () => {
  const states = new Map([["xo:a", st({ targetKey: "xo:a", lastBookMs: NOW - 100_000, lastResolveMs: NOW - 100_000, closeMs: NOW + H })]]);
  assert.equal(nextDueMs([t("xo:a")], states, NOW, cfg), NOW - 100_000 + 300_000);
  assert.equal(nextDueMs([], states, NOW, cfg), null);
  assert.equal(closeOf(t("xo:a", 5), st({ targetKey: "xo:a", closeMs: 9 })), 9);
  assert.equal(closeOf(t("xo:a", 5), undefined), 5);
});

test("dry run lists exact URLs, cadence and projected load, and never mentions a restricted host", () => {
  const targets = [t("xo:0xabc", NOW + 2 * 24 * H), t("polymarket:0xdef"), t("limitless:some-slug")];
  const a = buildDryRun(cfg, targets, NOW);
  const b = buildDryRun(cfg, [...targets].reverse(), NOW);
  assert.deepEqual(a.lines, b.lines, "deterministic and order independent");
  const text = a.lines.join("\n");
  assert.match(text, /GET https:\/\/api-mainnet\.xo\.market\/api\/markets\/contract\/0xabc/);
  assert.match(text, /every 900s {2}GET https:\/\/api-mainnet/);
  assert.match(text, /GET https:\/\/gamma-api\.polymarket\.com\/markets\?condition_ids=0xdef/);
  assert.match(text, /GET https:\/\/orderbooks\.xo\.market\/book  \(token_id = the outcome-0 token id the state call returns\)/);
  assert.match(text, /GET https:\/\/clob\.polymarket\.com\/book  \(token_id = the outcome-0 token id the state call returns\)/);
  assert.match(text, /GET https:\/\/api\.limitless\.exchange\/markets\/some-slug\/orderbook/);
  assert.match(text, /user-agent: insurance-markets-research\/0\.1/);
  assert.match(text, /GET only/);
  assert.equal(/kalshi\.com|quotient\.social/i.test(text.replace("restricted venues (never contacted, never stored): kalshi, quotient", "")), false);
  const xoBook = a.load.find((l) => l.host === "orderbooks.xo.market");
  assert.equal(xoBook?.requestsPerHour, 12, "one short-dated market: a book every 5 minutes");
  assert.equal(a.load.find((l) => l.host === "clob.polymarket.com")?.requestsPerHour, 1);
});

test("dry run warns when the projected load is over a host budget", () => {
  const many = Array.from({ length: 800 }, (_, i) => t(`xo:m${i}`, NOW + 24 * H));
  const run = buildDryRun(cfg, many, NOW);
  const row = run.load.find((l) => l.host === "orderbooks.xo.market");
  assert.equal(row?.withinBudget, false);
  assert.match(run.lines.join("\n"), /OVER BUDGET/);
});

test("stats: nearest-rank quantiles and episodes never join across a gap", () => {
  const sorted = ["0.01", "0.02", "0.03", "0.04", "0.05"].map(dec);
  assert.deepEqual(quantileSorted(sorted, 0.5), dec("0.03"));
  assert.deepEqual(quantileSorted(sorted, 0.95), dec("0.05"));
  assert.deepEqual(quantileSorted(sorted, 0.01), dec("0.01"));
  const d = dist(sorted);
  assert.deepEqual(d && [d.n, d.min, d.p50, d.max], [5, "0.01", "0.03", "0.05"]);
  assert.equal(dist([]), null);
  assert.deepEqual(countDist([3, 1, 2, 10]), { n: 4, median: 2, p90: 10, max: 10 });
  const series = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ tMs: i * 1000, flag: [0, 1, 1, 0, 1, 1, 1, 0][i] === 1 }));
  assert.deepEqual(episodes(series, 5000).map((e) => [e.startMs, e.endMs, e.nObs]), [[1000, 2000, 2], [4000, 6000, 3]]);
  const gapped = [0, 1, 2, 10, 11].map((i) => ({ tMs: i * 1000, flag: true }));
  assert.deepEqual(episodes(gapped, 3000).map((e) => e.nObs), [3, 2], "a recorder gap ends an episode");
});

test("gap detection uses 2.5 intervals of the slice in force", () => {
  const regular = [0, H, 2 * H, 5 * H, 6 * H];
  assert.deepEqual(detectGaps(regular, null, cfg), [{ fromMs: 2 * H, toMs: 5 * H, missedMs: 3 * H }]);
  const none = [0, H, 2 * H + 1800_000];
  assert.deepEqual(detectGaps(none, null, cfg), []);
  const short = [NOW, NOW + 300_000, NOW + 300_000 + 800_000];
  assert.equal(detectGaps(short, NOW + H, cfg).length, 1, "800 s is more than 2.5 x 300 s for a short-dated market");
});

test("ADT-4: cron-style ticks exactly one interval apart sample every tick, though each run ends a little after it starts", () => {
  const target = [t("xo:a", NOW + 10 * H)];
  // The snapshot time is the END of the request, so the next tick sees 300 s minus the run time.
  const after = (runMs: number, tickMs: number) =>
    dueJobs(target, new Map([["xo:a", st({ targetKey: "xo:a", lastBookMs: NOW + runMs, lastResolveMs: NOW + runMs, closeMs: NOW + 10 * H })]]), tickMs, cfg);
  assert.equal(after(1_500, NOW + 300_000).length, 1, "298.5 s elapsed of a 300 s interval is due");
  assert.equal(after(1_500, NOW + 300_000)[0]?.needBook, true);
  assert.equal(after(20_000, NOW + 300_000).length, 1, "a 20 s run is still due on the next tick");
  assert.equal(after(0, NOW + 100_000).length, 0, "100 s elapsed is far too early");
  assert.equal(after(0, NOW + 269_999).length, 0, "the tolerance is bounded: min(30 s, interval / 10)");
  assert.equal(after(0, NOW + 270_000).length, 1);
  // Hourly cron against the 3600 s interval: tolerance is capped at 30 s.
  const hourly = (elapsed: number) =>
    dueJobs([t("xo:b", NOW + 30 * 24 * H)], new Map([["xo:b", st({ targetKey: "xo:b", lastBookMs: NOW, lastResolveMs: NOW, closeMs: NOW + 30 * 24 * H })]]), NOW + elapsed, cfg).length;
  assert.equal(hourly(3_600_000 - 2_000), 1);
  assert.equal(hourly(3_600_000 - 31_000), 0);
});

test("ADT-4: simulated once-style cron over six ticks records six snapshots, not three", () => {
  const key = "xo:a";
  const target = [t(key, NOW + 10 * H)];
  let last: number | null = null;
  let snapshots = 0;
  for (let i = 0; i < 6; i += 1) {
    const tick = NOW + i * 300_000;
    const states = new Map<string, TargetStateRow>(last === null ? [] : [[key, st({ targetKey: key, lastBookMs: last, lastResolveMs: last, closeMs: NOW + 10 * H })]]);
    if (dueJobs(target, states, tick, cfg).length > 0) {
      snapshots += 1;
      last = tick + 1_500; // observedMs is the end of the request
    }
  }
  assert.equal(snapshots, 6);
});
