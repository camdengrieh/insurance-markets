// Scheduling decisions and the dry-run plan. Pure functions: no clock, no network, no database.

import { RESEARCH_USER_AGENT } from "./allowlist.js";
import type { HostBudget, RecorderConfig } from "./config.js";
import { COLLECTORS } from "./venues/index.js";
import { urlOf, type Target } from "./types.js";
import type { TargetStateRow } from "./store.js";

export type Slice = "short" | "regular";

export function closeOf(t: Target, st: TargetStateRow | undefined): number | null {
  return st?.closeMs ?? t.closeHintMs;
}

// Markets closing soon are sampled faster, because that is where short-lived gaps would show.
export function sliceFor(closeMs: number | null, nowMs: number, cfg: Pick<RecorderConfig, "shortHorizonSec" | "postCloseGraceSec">): Slice {
  if (closeMs === null) return "regular";
  const left = closeMs - nowMs;
  return left <= cfg.shortHorizonSec * 1000 && left > -cfg.postCloseGraceSec * 1000 ? "short" : "regular";
}

export function bookIntervalMs(slice: Slice, cfg: Pick<RecorderConfig, "intervalSec" | "shortIntervalSec">): number {
  return (slice === "short" ? cfg.shortIntervalSec : cfg.intervalSec) * 1000;
}

export function resolveIntervalMs(slice: Slice, cfg: Pick<RecorderConfig, "resolveIntervalSec" | "shortResolveIntervalSec">): number {
  return (slice === "short" ? cfg.shortResolveIntervalSec : cfg.resolveIntervalSec) * 1000;
}

// A snapshot is stamped when its request ENDS, so a scheduler that fires exactly one interval after
// the previous START sees slightly less than one interval elapsed. Without slack every second
// tick would be skipped and the cadence silently halved (ADT-4). The slack is the smaller of 30 s
// and a tenth of the interval, so it can never turn a 5-minute cadence into much faster polling.
export function dueSlackMs(intervalMs: number): number {
  return Math.min(30_000, Math.floor(intervalMs / 10));
}

export function isRetired(t: Target, st: TargetStateRow | undefined, nowMs: number, cfg: Pick<RecorderConfig, "postCloseGraceSec">): boolean {
  if (st?.retired === true) return true;
  const close = closeOf(t, st);
  return close !== null && nowMs > close + cfg.postCloseGraceSec * 1000;
}

export interface Job {
  readonly target: Target;
  readonly slice: Slice;
  readonly needResolve: boolean;
  readonly needBook: boolean;
  // Oldest first; never-sampled targets sort before everything.
  readonly lastMs: number;
}

type PlanCfg = Pick<
  RecorderConfig,
  "intervalSec" | "shortIntervalSec" | "shortHorizonSec" | "resolveIntervalSec" | "shortResolveIntervalSec" | "postCloseGraceSec"
>;

export function dueJobs(targets: readonly Target[], states: ReadonlyMap<string, TargetStateRow>, nowMs: number, cfg: PlanCfg): Job[] {
  const jobs: Job[] = [];
  for (const target of targets) {
    const st = states.get(target.key);
    if (isRetired(target, st, nowMs, cfg)) continue;
    const slice = sliceFor(closeOf(target, st), nowMs, cfg);
    const noToken = st?.tokenId === undefined || st.tokenId === null;
    let needResolve = false;
    if (st?.lastResolveMs === undefined || st.lastResolveMs === null) needResolve = true;
    else {
      const wait = noToken ? Math.min(resolveIntervalMs(slice, cfg), 120_000 * 2 ** Math.min(st.failures, 5)) : resolveIntervalMs(slice, cfg);
      needResolve = nowMs - st.lastResolveMs >= wait - dueSlackMs(wait);
    }
    const bookEvery = bookIntervalMs(slice, cfg);
    const needBook = st?.lastBookMs === undefined || st.lastBookMs === null || nowMs - st.lastBookMs >= bookEvery - dueSlackMs(bookEvery);
    if (needResolve || (needBook && !noToken)) {
      jobs.push({ target, slice, needResolve, needBook: needBook || needResolve, lastMs: Math.min(st?.lastBookMs ?? -1, st?.lastResolveMs ?? -1) });
    }
  }
  return jobs.sort((a, b) => a.lastMs - b.lastMs || (a.target.key < b.target.key ? -1 : 1));
}

// Earliest time anything becomes due again, or null when nothing is active.
export function nextDueMs(targets: readonly Target[], states: ReadonlyMap<string, TargetStateRow>, nowMs: number, cfg: PlanCfg): number | null {
  let best: number | null = null;
  for (const target of targets) {
    const st = states.get(target.key);
    if (isRetired(target, st, nowMs, cfg)) continue;
    const slice = sliceFor(closeOf(target, st), nowMs, cfg);
    const book = (st?.lastBookMs ?? nowMs - bookIntervalMs(slice, cfg)) + bookIntervalMs(slice, cfg);
    const res = (st?.lastResolveMs ?? nowMs - resolveIntervalMs(slice, cfg)) + resolveIntervalMs(slice, cfg);
    const t = Math.min(book, res);
    best = best === null ? t : Math.min(best, t);
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Dry run

export interface HostLoad {
  readonly host: string;
  readonly requestsPerHour: number;
  readonly worstCasePerHour: number;
  readonly budget: HostBudget;
  readonly withinBudget: boolean;
  readonly worstCaseWithinBudget: boolean;
}

export interface DryRun {
  readonly lines: readonly string[];
  readonly load: readonly HostLoad[];
}

export function buildDryRun(cfg: RecorderConfig, targets: readonly Target[], nowMs: number, extra: readonly string[] = []): DryRun {
  const lines: string[] = [];
  lines.push("pm-recorder dry run: no network calls, no database access, nothing written");
  lines.push(`user-agent: ${RESEARCH_USER_AGENT}`);
  lines.push(`method: GET only, no auth, no cookies, no request bodies`);
  lines.push(`cadence: books every ${cfg.intervalSec}s; markets closing within ${cfg.shortHorizonSec}s every ${cfg.shortIntervalSec}s`);
  lines.push(`market state (status, close, fee): every ${cfg.resolveIntervalSec}s; short-dated every ${cfg.shortResolveIntervalSec}s`);
  lines.push(`polling stops ${cfg.postCloseGraceSec}s after a market closes; depth stored: ${cfg.depthLevels} levels per side`);
  lines.push(`venues: ${cfg.venues.join(", ")}`);
  for (const line of extra) lines.push(line);
  lines.push(`targets: ${targets.length}`);

  const perHour = new Map<string, { now: number; worst: number }>();
  const bump = (host: string, nowRate: number, worstRate: number): void => {
    const cur = perHour.get(host) ?? { now: 0, worst: 0 };
    perHour.set(host, { now: cur.now + nowRate, worst: cur.worst + worstRate });
  };
  const per = (ms: number): number => 3_600_000 / ms;
  const sorted = [...targets].sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const t of sorted) {
    const col = COLLECTORS[t.venue];
    const slice = sliceFor(t.closeHintMs, nowMs, cfg);
    const bookEvery = bookIntervalMs(slice, cfg);
    const resolveEvery = resolveIntervalMs(slice, cfg);
    const note = t.closeHintMs === null ? "close time unknown until the first state call; assumed regular" : slice === "short" ? "short-dated" : "regular";
    lines.push(`  ${t.key}  [${note}]`);
    for (const spec of col.resolvePlan(t.marketId)) {
      lines.push(`    every ${resolveEvery / 1000}s  GET ${urlOf(spec)}`);
      bump(spec.host, per(resolveEvery), per(cfg.shortResolveIntervalSec * 1000));
    }
    const book = col.bookTarget(t.marketId);
    const tokenNote = book.tokenParam === null ? "" : `  (${book.tokenParam} = the outcome-0 token id the state call returns)`;
    lines.push(`    every ${bookEvery / 1000}s  GET https://${book.host}${book.path}${tokenNote}`);
    bump(book.host, per(bookEvery), per(cfg.shortIntervalSec * 1000));
  }

  lines.push("projected load per host (requests per hour, before retries):");
  const load: HostLoad[] = [];
  for (const [host, rate] of [...perHour].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const budget = cfg.hostBudgets[host] as HostBudget;
    const row: HostLoad = {
      host,
      requestsPerHour: Math.ceil(rate.now),
      worstCasePerHour: Math.ceil(rate.worst),
      budget,
      withinBudget: rate.now <= budget.maxPerHour && rate.now / 3600 <= budget.rps,
      worstCaseWithinBudget: rate.worst <= budget.maxPerHour && rate.worst / 3600 <= budget.rps,
    };
    load.push(row);
    lines.push(
      `  ${host}: now ${row.requestsPerHour}/h, all-short worst case ${row.worstCasePerHour}/h; budget ${budget.maxPerHour}/h, ${budget.rps} rps, burst ${budget.burst}` +
        `${row.withinBudget ? "" : "  OVER BUDGET: requests will be deferred"}${row.worstCaseWithinBudget ? "" : "  (worst case over budget)"}`,
    );
  }
  lines.push("restricted venues (never contacted, never stored): kalshi, quotient, and any venue not on the allowlist");
  return { lines, load };
}
