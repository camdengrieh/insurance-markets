// The collection loop: decide what is due, fetch it politely, store it, log what went wrong.
//
// Resumable: all scheduling state lives in the store, so a restart continues where it stopped
// and never bursts. Failures never raise: they become events, and the target is retried on its
// own cadence (the HTTP client has already retried with backoff). Gaps (a target sampled later
// than gapFactor intervals) are logged when they are discovered, with both ends.

import { isRecordableVenue, termsPermitRecording } from "./allowlist.js";
import type { Clock } from "./clock.js";
import type { RecorderConfig } from "./config.js";
import type { HttpOutcome, PoliteClient } from "./http.js";
import { bookIntervalMs, dueJobs, nextDueMs, sliceFor, closeOf, type Job } from "./plan.js";
import { RecorderStore, type TargetStateRow } from "./store.js";
import { parseSides } from "./venues/common.js";
import { COLLECTORS, type RawBook } from "./venues/index.js";
import type { EventKind, SnapshotRow, Target } from "./types.js";

export interface TickSummary {
  readonly due: number;
  readonly booksOk: number;
  readonly booksFailed: number;
  readonly resolvesOk: number;
  readonly resolvesFailed: number;
  readonly deferred: number;
  readonly elapsedMs: number;
  readonly nextDueMs: number | null;
  readonly stoppedEarly: boolean;
}

export interface CollectorDeps {
  readonly store: RecorderStore;
  readonly client: PoliteClient;
  readonly clock: Clock;
  readonly config: RecorderConfig;
  readonly log?: (line: string) => void;
  // Called at the start of every tick, for example to reload the target files.
  readonly beforeTick?: () => void;
}

const DAY_MS = 86_400_000;

export function buildSnapshot(t: Target, tokenId: string, startMs: number, endMs: number, raw: RawBook, depth: number): SnapshotRow {
  // The shared parser has already validated the levels and sorted each side best first.
  const sides = parseSides(raw.bids, raw.asks, "best_first", depth);
  return {
    targetKey: t.key,
    venue: t.venue,
    marketId: t.marketId,
    tokenId,
    observedMs: endMs,
    reqStartMs: startMs,
    venueTsMs: raw.venueTsMs,
    bookHash: raw.hash,
    bids: sides.bids,
    asks: sides.asks,
    nBids: sides.nBids,
    nAsks: sides.nAsks,
    bestBid: sides.bids[0]?.[0] ?? null,
    bestAsk: sides.asks[0]?.[0] ?? null,
    flags: sides.flags,
    tick: raw.tick,
  };
}

function blank(key: string): TargetStateRow {
  return { targetKey: key, lastBookMs: null, lastResolveMs: null, tokenId: null, closeMs: null, status: null, failures: 0, retired: false };
}

export class Collector {
  private readonly skewLoggedMs = new Map<string, number>();
  private lastPruneMs: number | null = null;
  private readonly termsPaused = new Set<string>();

  constructor(private readonly deps: CollectorDeps) {}

  private event(kind: EventKind, host: string | null, key: string | null, detail: string): void {
    this.deps.store.event(this.deps.clock.nowMs(), kind, host, key, detail);
  }

  private noteSkew(host: string, r: Extract<HttpOutcome, { ok: true }>): void {
    if (r.serverDateMs === null) return;
    const { store, config, clock } = this.deps;
    // Local minus server, so a positive number means our clock is ahead. The Date header has
    // one-second resolution (it truncates), so the unbiased server time adds half a second; the
    // result is good to about +-500 ms plus half the round trip.
    const est = Math.round((r.startMs + r.endMs) / 2 - (r.serverDateMs + 500));
    const last = this.skewLoggedMs.get(host) ?? -Infinity;
    const warn = Math.abs(est) > config.skewWarnMs;
    if (clock.nowMs() - last >= config.skewLogEverySec * 1000 || warn) {
      store.insertSkew(clock.nowMs(), host, r.startMs, r.endMs, r.serverDateMs, est);
      this.skewLoggedMs.set(host, clock.nowMs());
      if (warn) this.event("skew", host, null, `local clock minus server is ${est} ms, beyond ${config.skewWarnMs} ms`);
    }
  }

  private async processJob(job: Job, states: Map<string, TargetStateRow>): Promise<{ resolveOk: boolean; resolveFailed: boolean; bookOk: boolean; bookFailed: boolean; deferred: boolean }> {
    const { store, client, clock, config } = this.deps;
    const t = job.target;
    const col = COLLECTORS[t.venue];
    const out = { resolveOk: false, resolveFailed: false, bookOk: false, bookFailed: false, deferred: false };
    let st = states.get(t.key) ?? blank(t.key);

    if (job.needResolve || st.tokenId === null) {
      const bodies: unknown[] = [];
      let failure: Extract<HttpOutcome, { ok: false }> | null = null;
      for (const spec of col.resolvePlan(t.marketId)) {
        const r = await client.get(spec);
        if (!r.ok) {
          failure = r;
          break;
        }
        this.noteSkew(spec.host, r);
        bodies.push(r.json);
      }
      const now = clock.nowMs();
      if (failure !== null) {
        out.resolveFailed = true;
        out.deferred = failure.reason === "budget" || failure.reason === "breaker_open";
        this.event("resolve_failed", null, t.key, `reason=${failure.reason}${failure.status === undefined ? "" : ` status=${failure.status}`}`);
        st = { ...st, lastResolveMs: now, failures: st.failures + 1 };
        store.saveTargetState(st);
        states.set(t.key, st);
        if (st.tokenId === null) return out;
      } else {
        const parsed = col.parseResolve(bodies, now, t.marketId);
        if (!parsed.ok) {
          out.resolveFailed = true;
          this.event("parse_error", null, t.key, `resolve: ${parsed.reason}`);
          st = { ...st, lastResolveMs: now, failures: st.failures + 1 };
          store.saveTargetState(st);
          states.set(t.key, st);
          if (st.tokenId === null) return out;
        } else {
          out.resolveOk = true;
          const m = parsed.value;
          const closeMs = m.closeMs ?? t.closeHintMs;
          const retire = m.status === "closed" || m.status === "resolved" || (closeMs !== null && now > closeMs + config.postCloseGraceSec * 1000);
          store.exec(() => {
            store.insertMarketState({ targetKey: t.key, venue: t.venue, marketId: t.marketId, observedMs: now, tokenId: m.tokenId, status: m.status, closeMs: m.closeMs, accepting: m.accepting, tick: m.tick, fee: m.fee });
            st = { ...st, lastResolveMs: now, tokenId: m.tokenId, closeMs: m.closeMs, status: m.status, failures: 0, retired: retire };
            store.saveTargetState(st);
          });
          states.set(t.key, st);
          if (retire) {
            this.event("retired", null, t.key, `status=${m.status}`);
            return out;
          }
        }
      }
    }
    if (!job.needBook || st.tokenId === null) return out;

    const slice = sliceFor(closeOf(t, st), clock.nowMs(), config);
    const bookSpec = col.bookPlan(t.marketId, st.tokenId);
    const r = await client.get(bookSpec);
    if (!r.ok) {
      out.bookFailed = true;
      out.deferred = r.reason === "budget" || r.reason === "breaker_open";
      this.event("book_failed", null, t.key, `reason=${r.reason}${r.status === undefined ? "" : ` status=${r.status}`}`);
      st = { ...st, lastBookMs: clock.nowMs(), failures: st.failures + 1 };
      store.saveTargetState(st);
      states.set(t.key, st);
      return out;
    }
    this.noteSkew(bookSpec.host, r);
    const parsed = col.parseBook(r.json, st.tokenId);
    if (!parsed.ok) {
      out.bookFailed = true;
      this.event("parse_error", null, t.key, `book: ${parsed.reason}`);
      st = { ...st, lastBookMs: clock.nowMs(), failures: st.failures + 1 };
      store.saveTargetState(st);
      states.set(t.key, st);
      return out;
    }
    const row = buildSnapshot(t, st.tokenId, r.startMs, r.endMs, parsed.value, config.depthLevels);
    const prev = store.lastSnapshotMs(t.key);
    if (prev !== null && row.observedMs < prev) {
      this.event("clock_regress", null, t.key, `observed ${row.observedMs} is before the previous snapshot ${prev}; row not stored`);
      return out;
    }
    store.exec(() => {
      store.insertSnapshot(row);
      st = { ...st, lastBookMs: row.observedMs, failures: 0 };
      store.saveTargetState(st);
    });
    states.set(t.key, st);
    out.bookOk = true;
    if (prev !== null && row.observedMs - prev > config.gapFactor * bookIntervalMs(slice, config)) {
      this.event("gap", null, t.key, `from=${prev} to=${row.observedMs} missed_ms=${row.observedMs - prev}`);
    }
    return out;
  }

  async tick(signal?: AbortSignal): Promise<TickSummary> {
    const { store, client, clock, config } = this.deps;
    this.deps.beforeTick?.();
    const start = clock.nowMs();
    if (store.sizeBytes() > config.maxDbBytes) {
      this.event("disk_cap", null, null, `database exceeds maxDbBytes=${config.maxDbBytes}; collection paused`);
      return { due: 0, booksOk: 0, booksFailed: 0, resolvesOk: 0, resolvesFailed: 0, deferred: 0, elapsedMs: 0, nextDueMs: null, stoppedEarly: true };
    }
    // A venue is collected only while the registry's terms for it are fresh and permit persisting.
    const permitted = new Map<string, boolean>();
    for (const v of config.venues) {
      const ok = termsPermitRecording(v, start);
      permitted.set(v, ok);
      if (!ok && !this.termsPaused.has(v)) {
        this.termsPaused.add(v);
        this.event("refused", null, null, `collection of ${v} paused: the registry data terms are stale or do not permit persisting`);
      }
      if (ok) this.termsPaused.delete(v);
    }
    const targets = store.targets().filter((t) => isRecordableVenue(t.venue) && config.venues.includes(t.venue) && permitted.get(t.venue) === true);
    const states = store.targetStates();
    const jobs = dueJobs(targets, states, start, config);
    const byVenue = new Map<string, Job[]>();
    for (const j of jobs) byVenue.set(j.target.venue, [...(byVenue.get(j.target.venue) ?? []), j]);

    const totals = { booksOk: 0, booksFailed: 0, resolvesOk: 0, resolvesFailed: 0, deferred: 0 };
    let stoppedEarly = false;
    await Promise.all(
      [...byVenue.values()].map(async (list) => {
        for (const job of list) {
          if (signal?.aborted === true || clock.nowMs() - start > config.maxTickMs) {
            stoppedEarly = true;
            break;
          }
          const r = await this.processJob(job, states);
          totals.booksOk += r.bookOk ? 1 : 0;
          totals.booksFailed += r.bookFailed ? 1 : 0;
          totals.resolvesOk += r.resolveOk ? 1 : 0;
          totals.resolvesFailed += r.resolveFailed ? 1 : 0;
          totals.deferred += r.deferred ? 1 : 0;
        }
      }),
    );
    const now = clock.nowMs();
    for (const [host, c] of client.counters()) if (c.requests > 0) store.insertHostStats(now, host, c);
    client.resetCounters();

    if (this.lastPruneMs === null) this.lastPruneMs = Number(store.getMeta("last_prune_ms") ?? "0");
    if (now - this.lastPruneMs >= DAY_MS) {
      store.prune(now, now - config.retentionDays * DAY_MS);
      store.setMeta("last_prune_ms", String(now));
      this.lastPruneMs = now;
    }
    return {
      due: jobs.length,
      ...totals,
      elapsedMs: clock.nowMs() - start,
      nextDueMs: nextDueMs(targets, store.targetStates(), now, config),
      stoppedEarly,
    };
  }

  // Runs until the signal aborts. `once` does a single tick, for cron-style schedulers.
  async run(signal: AbortSignal, once = false): Promise<void> {
    const { clock, config, log } = this.deps;
    while (!signal.aborted) {
      const s = await this.tick(signal);
      log?.(`tick: due=${s.due} books_ok=${s.booksOk} books_failed=${s.booksFailed} state_ok=${s.resolvesOk} state_failed=${s.resolvesFailed} deferred=${s.deferred} elapsed_ms=${s.elapsedMs}`);
      if (once) return;
      const wait = s.nextDueMs === null ? config.loopTickSec * 1000 : Math.min(config.loopTickSec * 1000, Math.max(1000, s.nextDueMs - clock.nowMs()));
      await clock.sleep(wait, signal);
    }
  }
}
