// Local store: SQLite through node:sqlite (built into Node 24, no dependency).
//
// Why SQLite and not JSONL: the report and the gap check are range queries over (target, time),
// resumability needs a small mutable state table next to append-only data, and WAL mode gives
// crash-safe writes with one writer. JSONL with checksums was the fallback; it was not needed.
//
// Data tables are append-only: every row carries a SHA-256 over its own fields, UPDATE is blocked
// by triggers, and DELETE is blocked unless a retention window is open (prune() opens it). `verify`
// recomputes every checksum. This detects accidental corruption and casual edits; it is not
// tamper-proofing against someone with write access to the file.
//
// Only allowlisted venues can be written: every insert re-checks the venue (a second guard behind
// the target loader), so a restricted venue's numbers cannot reach disk by any code path.

import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { canonicalJson, sha256Hex } from "../links/canonical.js";
import { assertRecordable, isRecordableVenue, type RecVenue } from "./allowlist.js";
import {
  MARKET_STATUSES,
  TOOL_VERSION,
  type EventKind,
  type FeeRecord,
  type MarketStateRow,
  type MarketStatusCode,
  type SnapshotRow,
  type Target,
  type TargetGroup,
  type TargetLink,
} from "./types.js";

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT, started_ms INTEGER NOT NULL, ended_ms INTEGER,
  tool_version TEXT NOT NULL, mode TEXT NOT NULL, config_sha256 TEXT NOT NULL, end_reason TEXT);
CREATE TABLE IF NOT EXISTS targets (
  target_key TEXT PRIMARY KEY, venue TEXT NOT NULL, market_id TEXT NOT NULL, close_hint_ms INTEGER);
CREATE TABLE IF NOT EXISTS target_state (
  target_key TEXT PRIMARY KEY, last_book_ms INTEGER, last_resolve_ms INTEGER, token_id TEXT,
  close_ms INTEGER, status TEXT, failures INTEGER NOT NULL DEFAULT 0, retired INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS links (
  link_id TEXT PRIMARY KEY, relation TEXT NOT NULL, state TEXT NOT NULL, basis_class TEXT NOT NULL, exhaustiveness TEXT);
CREATE TABLE IF NOT EXISTS link_legs (
  link_id TEXT NOT NULL, idx INTEGER NOT NULL, target_key TEXT NOT NULL, flip INTEGER NOT NULL, close_ms INTEGER,
  PRIMARY KEY (link_id, idx));
CREATE TABLE IF NOT EXISTS groups (
  group_id TEXT NOT NULL, idx INTEGER NOT NULL, venue TEXT NOT NULL, target_key TEXT NOT NULL, exhaustive TEXT NOT NULL,
  PRIMARY KEY (group_id, idx));
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, target_key TEXT NOT NULL, venue TEXT NOT NULL,
  market_id TEXT NOT NULL, token_id TEXT NOT NULL, observed_ms INTEGER NOT NULL, req_start_ms INTEGER NOT NULL,
  venue_ts_ms INTEGER, book_hash TEXT, bids_json TEXT NOT NULL, asks_json TEXT NOT NULL, n_bids INTEGER NOT NULL,
  n_asks INTEGER NOT NULL, best_bid TEXT, best_ask TEXT, flags TEXT NOT NULL, tick TEXT, sha256 TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS snapshots_target_time ON snapshots (target_key, observed_ms);
CREATE TABLE IF NOT EXISTS market_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, target_key TEXT NOT NULL, venue TEXT NOT NULL,
  market_id TEXT NOT NULL, observed_ms INTEGER NOT NULL, token_id TEXT, status TEXT NOT NULL, close_ms INTEGER,
  accepting INTEGER, tick TEXT, fee_json TEXT NOT NULL, sha256 TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS market_state_target_time ON market_state (target_key, observed_ms);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER NOT NULL, run_id INTEGER, kind TEXT NOT NULL, host TEXT,
  target_key TEXT, detail TEXT NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clock_skew (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, ts_ms INTEGER NOT NULL, host TEXT NOT NULL,
  local_start_ms INTEGER NOT NULL, local_end_ms INTEGER NOT NULL, server_ms INTEGER NOT NULL,
  skew_est_ms INTEGER NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS host_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, ts_ms INTEGER NOT NULL, host TEXT NOT NULL,
  requests INTEGER NOT NULL, ok INTEGER NOT NULL, errors INTEGER NOT NULL, throttled INTEGER NOT NULL,
  backoff_ms INTEGER NOT NULL, sha256 TEXT NOT NULL);
`;

const APPEND_ONLY = ["snapshots", "market_state", "events", "clock_skew", "host_stats"] as const;
const TIME_COLUMN: Readonly<Record<(typeof APPEND_ONLY)[number], string>> = {
  snapshots: "observed_ms",
  market_state: "observed_ms",
  events: "ts_ms",
  clock_skew: "ts_ms",
  host_stats: "ts_ms",
};

function triggers(): string {
  return APPEND_ONLY.map(
    (t) => `
CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t}
BEGIN SELECT RAISE(ABORT, 'append-only table: update refused'); END;
CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
WHEN (SELECT value FROM meta WHERE key = 'prune_before_ms') IS NULL
  OR OLD.${TIME_COLUMN[t]} >= CAST((SELECT value FROM meta WHERE key = 'prune_before_ms') AS INTEGER)
BEGIN SELECT RAISE(ABORT, 'append-only table: delete refused outside an open retention window'); END;`,
  ).join("\n");
}

type Row = Record<string, SQLInputValue | undefined>;

function rowSha(table: string, values: readonly (string | number | null)[]): string {
  return sha256Hex(canonicalJson([table, ...values]));
}

function nn(v: number | null | undefined): number | null {
  return v === undefined ? null : v;
}

export interface TargetStateRow {
  readonly targetKey: string;
  readonly lastBookMs: number | null;
  readonly lastResolveMs: number | null;
  readonly tokenId: string | null;
  readonly closeMs: number | null;
  readonly status: MarketStatusCode | null;
  readonly failures: number;
  readonly retired: boolean;
}

export interface VerifyReport {
  readonly ok: boolean;
  readonly checked: Readonly<Record<string, number>>;
  readonly mismatches: readonly { readonly table: string; readonly id: number }[];
  readonly integrity: string;
}

export interface EventRow {
  readonly id: number;
  readonly tsMs: number;
  readonly runId: number | null;
  readonly kind: EventKind;
  readonly host: string | null;
  readonly targetKey: string | null;
  readonly detail: string;
}

export interface SkewRow {
  readonly host: string;
  readonly tsMs: number;
  readonly skewEstMs: number;
}

export interface HostStatRow {
  readonly host: string;
  readonly requests: number;
  readonly ok: number;
  readonly errors: number;
  readonly throttled: number;
  readonly backoffMs: number;
}

// Only our own words and numbers go into events: never response bodies or market text.
export function safeDetail(text: string): string {
  return text.replace(/[^A-Za-z0-9 _:.,=/\-()%>+<]/g, "?").slice(0, 200);
}

export class RecorderStore {
  private readonly db: DatabaseSync;
  private runId: number | null = null;

  private constructor(db: DatabaseSync, readonly path: string) {
    this.db = db;
  }

  static open(path: string): RecorderStore {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    db.exec(triggers());
    const existing = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    if (existing === undefined) db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    else if (existing.value !== String(SCHEMA_VERSION)) {
      db.close();
      throw new Error(`unsupported recorder schema version ${existing.value}`);
    }
    return new RecorderStore(db, path);
  }

  close(): void {
    this.db.close();
  }

  exec<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  sizeBytes(): number {
    if (this.path === ":memory:") {
      const p = this.db.prepare("PRAGMA page_count").get() as { page_count: number };
      const s = this.db.prepare("PRAGMA page_size").get() as { page_size: number };
      return p.page_count * s.page_size;
    }
    let total = 0;
    for (const suffix of ["", "-wal"]) {
      try {
        total += statSync(this.path + suffix).size;
      } catch {
        /* a missing WAL file is normal */
      }
    }
    return total;
  }

  getMeta(key: string): string | null {
    const r = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return r?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  // ---- runs ----

  startRun(nowMs: number, mode: string, configSha256: string): number {
    const open = this.db.prepare("SELECT run_id FROM runs WHERE ended_ms IS NULL ORDER BY run_id DESC LIMIT 1").get() as { run_id: number } | undefined;
    const info = this.db
      .prepare("INSERT INTO runs (started_ms, tool_version, mode, config_sha256) VALUES (?, ?, ?, ?)")
      .run(nowMs, TOOL_VERSION, mode, configSha256);
    this.runId = Number(info.lastInsertRowid);
    if (open !== undefined) this.event(nowMs, "unclean_previous_run", null, null, `previous run ${open.run_id} never recorded an end`);
    this.event(nowMs, "start", null, null, `mode=${mode} version=${TOOL_VERSION}`);
    return this.runId;
  }

  endRun(nowMs: number, reason: string): void {
    if (this.runId === null) return;
    this.event(nowMs, "stop", null, null, `reason=${reason}`);
    this.db.prepare("UPDATE runs SET ended_ms = ?, end_reason = ? WHERE run_id = ?").run(nowMs, safeDetail(reason), this.runId);
    this.runId = null;
  }

  currentRun(): number {
    if (this.runId === null) throw new Error("no run is open");
    return this.runId;
  }

  runs(): { runId: number; startedMs: number; endedMs: number | null; mode: string; endReason: string | null }[] {
    return (this.db.prepare("SELECT run_id, started_ms, ended_ms, mode, end_reason FROM runs ORDER BY run_id").all() as unknown as Row[]).map((r) => ({
      runId: Number(r["run_id"]),
      startedMs: Number(r["started_ms"]),
      endedMs: r["ended_ms"] === null ? null : Number(r["ended_ms"]),
      mode: String(r["mode"]),
      endReason: r["end_reason"] === null ? null : String(r["end_reason"]),
    }));
  }

  // ---- targets, links, groups (replaced wholesale when the inputs change) ----

  syncTargets(targets: readonly Target[], links: readonly TargetLink[], groups: readonly TargetGroup[]): void {
    for (const t of targets) assertRecordable(t.venue);
    for (const g of groups) assertRecordable(g.venue);
    this.exec(() => {
      this.db.exec("DELETE FROM targets; DELETE FROM links; DELETE FROM link_legs; DELETE FROM groups;");
      const addT = this.db.prepare("INSERT INTO targets (target_key, venue, market_id, close_hint_ms) VALUES (?, ?, ?, ?)");
      for (const t of targets) addT.run(t.key, t.venue, t.marketId, nn(t.closeHintMs));
      const addL = this.db.prepare("INSERT INTO links (link_id, relation, state, basis_class, exhaustiveness) VALUES (?, ?, ?, ?, ?)");
      const addLeg = this.db.prepare("INSERT INTO link_legs (link_id, idx, target_key, flip, close_ms) VALUES (?, ?, ?, ?, ?)");
      for (const l of links) {
        addL.run(l.linkId, l.relation, l.state, l.basisClass, l.exhaustiveness);
        l.legs.forEach((leg, i) => addLeg.run(l.linkId, i, leg.targetKey, leg.flip ? 1 : 0, nn(leg.closeMs)));
      }
      const addG = this.db.prepare("INSERT INTO groups (group_id, idx, venue, target_key, exhaustive) VALUES (?, ?, ?, ?, ?)");
      for (const g of groups) g.members.forEach((m, i) => addG.run(g.groupId, i, g.venue, m, g.exhaustive));
      this.db.exec("DELETE FROM target_state WHERE target_key NOT IN (SELECT target_key FROM targets)");
    });
  }

  targets(): Target[] {
    return (this.db.prepare("SELECT target_key, venue, market_id, close_hint_ms FROM targets ORDER BY target_key").all() as unknown as Row[]).flatMap((r) => {
      const venue = String(r["venue"]);
      if (!isRecordableVenue(venue)) return [];
      return [{ key: String(r["target_key"]), venue, marketId: String(r["market_id"]), closeHintMs: r["close_hint_ms"] === null ? null : Number(r["close_hint_ms"]) }];
    });
  }

  links(): TargetLink[] {
    const legs = this.db.prepare("SELECT link_id, idx, target_key, flip, close_ms FROM link_legs ORDER BY link_id, idx").all() as unknown as Row[];
    return (this.db.prepare("SELECT link_id, relation, state, basis_class, exhaustiveness FROM links ORDER BY link_id").all() as unknown as Row[]).map((r) => ({
      linkId: String(r["link_id"]),
      relation: String(r["relation"]),
      state: String(r["state"]),
      basisClass: String(r["basis_class"]),
      exhaustiveness: r["exhaustiveness"] === null ? null : String(r["exhaustiveness"]),
      legs: legs
        .filter((l) => l["link_id"] === r["link_id"])
        .map((l) => ({ targetKey: String(l["target_key"]), flip: Number(l["flip"]) === 1, closeMs: l["close_ms"] === null ? null : Number(l["close_ms"]) })),
    }));
  }

  groups(): TargetGroup[] {
    const rows = this.db.prepare("SELECT group_id, idx, venue, target_key, exhaustive FROM groups ORDER BY group_id, idx").all() as unknown as Row[];
    const out = new Map<string, { venue: RecVenue; exhaustive: TargetGroup["exhaustive"]; members: string[] }>();
    for (const r of rows) {
      const venue = String(r["venue"]);
      if (!isRecordableVenue(venue)) continue;
      const id = String(r["group_id"]);
      const g = out.get(id) ?? { venue, exhaustive: String(r["exhaustive"]) as TargetGroup["exhaustive"], members: [] };
      g.members.push(String(r["target_key"]));
      out.set(id, g);
    }
    return [...out].map(([groupId, g]) => ({ groupId, ...g }));
  }

  // ---- target state (mutable cache; the data tables are the record) ----

  targetStates(): Map<string, TargetStateRow> {
    const out = new Map<string, TargetStateRow>();
    for (const r of this.db.prepare("SELECT * FROM target_state").all() as unknown as Row[]) {
      const status = r["status"] === null ? null : String(r["status"]);
      out.set(String(r["target_key"]), {
        targetKey: String(r["target_key"]),
        lastBookMs: r["last_book_ms"] === null ? null : Number(r["last_book_ms"]),
        lastResolveMs: r["last_resolve_ms"] === null ? null : Number(r["last_resolve_ms"]),
        tokenId: r["token_id"] === null ? null : String(r["token_id"]),
        closeMs: r["close_ms"] === null ? null : Number(r["close_ms"]),
        status: status !== null && (MARKET_STATUSES as readonly string[]).includes(status) ? (status as MarketStatusCode) : null,
        failures: Number(r["failures"]),
        retired: Number(r["retired"]) === 1,
      });
    }
    return out;
  }

  saveTargetState(s: TargetStateRow): void {
    this.db
      .prepare(
        `INSERT INTO target_state (target_key, last_book_ms, last_resolve_ms, token_id, close_ms, status, failures, retired)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_key) DO UPDATE SET last_book_ms = excluded.last_book_ms, last_resolve_ms = excluded.last_resolve_ms,
           token_id = excluded.token_id, close_ms = excluded.close_ms, status = excluded.status,
           failures = excluded.failures, retired = excluded.retired`,
      )
      .run(s.targetKey, nn(s.lastBookMs), nn(s.lastResolveMs), s.tokenId, nn(s.closeMs), s.status, s.failures, s.retired ? 1 : 0);
  }

  // ---- append-only inserts ----

  insertSnapshot(s: SnapshotRow): void {
    assertRecordable(s.venue);
    const bids = JSON.stringify(s.bids);
    const asks = JSON.stringify(s.asks);
    const flags = s.flags.join(",");
    const sha = rowSha("snapshots", [s.targetKey, s.venue, s.marketId, s.tokenId, s.observedMs, s.reqStartMs, nn(s.venueTsMs), s.bookHash, bids, asks, s.nBids, s.nAsks, s.bestBid, s.bestAsk, flags, s.tick]);
    this.db
      .prepare(
        `INSERT INTO snapshots (run_id, target_key, venue, market_id, token_id, observed_ms, req_start_ms, venue_ts_ms, book_hash,
           bids_json, asks_json, n_bids, n_asks, best_bid, best_ask, flags, tick, sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(this.currentRun(), s.targetKey, s.venue, s.marketId, s.tokenId, s.observedMs, s.reqStartMs, nn(s.venueTsMs), s.bookHash, bids, asks, s.nBids, s.nAsks, s.bestBid, s.bestAsk, flags, s.tick, sha);
  }

  insertMarketState(s: MarketStateRow): void {
    assertRecordable(s.venue);
    const fee = canonicalJson(s.fee);
    const accepting = s.accepting === null ? null : s.accepting ? 1 : 0;
    const sha = rowSha("market_state", [s.targetKey, s.venue, s.marketId, s.observedMs, s.tokenId, s.status, nn(s.closeMs), accepting, s.tick, fee]);
    this.db
      .prepare(
        `INSERT INTO market_state (run_id, target_key, venue, market_id, observed_ms, token_id, status, close_ms, accepting, tick, fee_json, sha256)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(this.currentRun(), s.targetKey, s.venue, s.marketId, s.observedMs, s.tokenId, s.status, nn(s.closeMs), accepting, s.tick, fee, sha);
  }

  event(tsMs: number, kind: EventKind, host: string | null, targetKey: string | null, detail: string): void {
    const d = safeDetail(detail);
    const run = this.runId;
    this.db
      .prepare("INSERT INTO events (ts_ms, run_id, kind, host, target_key, detail, sha256) VALUES (?,?,?,?,?,?,?)")
      .run(tsMs, run, kind, host, targetKey, d, rowSha("events", [tsMs, run, kind, host, targetKey, d]));
  }

  insertSkew(tsMs: number, host: string, localStartMs: number, localEndMs: number, serverMs: number, skewEstMs: number): void {
    const sha = rowSha("clock_skew", [tsMs, host, localStartMs, localEndMs, serverMs, skewEstMs]);
    this.db
      .prepare("INSERT INTO clock_skew (run_id, ts_ms, host, local_start_ms, local_end_ms, server_ms, skew_est_ms, sha256) VALUES (?,?,?,?,?,?,?,?)")
      .run(this.currentRun(), tsMs, host, localStartMs, localEndMs, serverMs, skewEstMs, sha);
  }

  insertHostStats(tsMs: number, host: string, c: { requests: number; ok: number; errors: number; throttled: number; backoffMs: number }): void {
    const sha = rowSha("host_stats", [tsMs, host, c.requests, c.ok, c.errors, c.throttled, c.backoffMs]);
    this.db
      .prepare("INSERT INTO host_stats (run_id, ts_ms, host, requests, ok, errors, throttled, backoff_ms, sha256) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(this.currentRun(), tsMs, host, c.requests, c.ok, c.errors, c.throttled, c.backoffMs, sha);
  }

  // ---- reads ----

  snapshots(targetKey: string): SnapshotRow[] {
    const rows = this.db.prepare("SELECT * FROM snapshots WHERE target_key = ? ORDER BY observed_ms, id").all(targetKey) as unknown as Row[];
    return rows.flatMap((r) => {
      const venue = String(r["venue"]);
      if (!isRecordableVenue(venue)) return [];
      return [
        {
          targetKey: String(r["target_key"]),
          venue,
          marketId: String(r["market_id"]),
          tokenId: String(r["token_id"]),
          observedMs: Number(r["observed_ms"]),
          reqStartMs: Number(r["req_start_ms"]),
          venueTsMs: r["venue_ts_ms"] === null ? null : Number(r["venue_ts_ms"]),
          bookHash: r["book_hash"] === null ? null : String(r["book_hash"]),
          bids: JSON.parse(String(r["bids_json"])) as SnapshotRow["bids"],
          asks: JSON.parse(String(r["asks_json"])) as SnapshotRow["asks"],
          nBids: Number(r["n_bids"]),
          nAsks: Number(r["n_asks"]),
          bestBid: r["best_bid"] === null ? null : String(r["best_bid"]),
          bestAsk: r["best_ask"] === null ? null : String(r["best_ask"]),
          flags: String(r["flags"]) === "" ? [] : (String(r["flags"]).split(",") as SnapshotRow["flags"]),
          tick: r["tick"] === null ? null : String(r["tick"]),
        },
      ];
    });
  }

  lastSnapshotMs(targetKey: string): number | null {
    const r = this.db.prepare("SELECT MAX(observed_ms) AS t FROM snapshots WHERE target_key = ?").get(targetKey) as { t: number | null };
    return r.t;
  }

  marketStates(targetKey: string): (MarketStateRow & { readonly id: number })[] {
    const rows = this.db.prepare("SELECT * FROM market_state WHERE target_key = ? ORDER BY observed_ms, id").all(targetKey) as unknown as Row[];
    return rows.flatMap((r) => {
      const venue = String(r["venue"]);
      const status = String(r["status"]);
      if (!isRecordableVenue(venue)) return [];
      return [
        {
          id: Number(r["id"]),
          targetKey: String(r["target_key"]),
          venue,
          marketId: String(r["market_id"]),
          observedMs: Number(r["observed_ms"]),
          tokenId: r["token_id"] === null ? null : String(r["token_id"]),
          status: (MARKET_STATUSES as readonly string[]).includes(status) ? (status as MarketStatusCode) : "unknown",
          closeMs: r["close_ms"] === null ? null : Number(r["close_ms"]),
          accepting: r["accepting"] === null ? null : Number(r["accepting"]) === 1,
          tick: r["tick"] === null ? null : String(r["tick"]),
          fee: JSON.parse(String(r["fee_json"])) as FeeRecord,
        },
      ];
    });
  }

  events(kind?: EventKind): EventRow[] {
    const rows = (kind === undefined ? this.db.prepare("SELECT * FROM events ORDER BY id").all() : this.db.prepare("SELECT * FROM events WHERE kind = ? ORDER BY id").all(kind)) as unknown as Row[];
    return rows.map((r) => ({
      id: Number(r["id"]),
      tsMs: Number(r["ts_ms"]),
      runId: r["run_id"] === null ? null : Number(r["run_id"]),
      kind: String(r["kind"]) as EventKind,
      host: r["host"] === null ? null : String(r["host"]),
      targetKey: r["target_key"] === null ? null : String(r["target_key"]),
      detail: String(r["detail"]),
    }));
  }

  skews(): SkewRow[] {
    return (this.db.prepare("SELECT host, ts_ms, skew_est_ms FROM clock_skew ORDER BY id").all() as unknown as Row[]).map((r) => ({
      host: String(r["host"]),
      tsMs: Number(r["ts_ms"]),
      skewEstMs: Number(r["skew_est_ms"]),
    }));
  }

  hostTotals(): HostStatRow[] {
    return (
      this.db
        .prepare("SELECT host, SUM(requests) AS requests, SUM(ok) AS ok, SUM(errors) AS errors, SUM(throttled) AS throttled, SUM(backoff_ms) AS backoff_ms FROM host_stats GROUP BY host ORDER BY host")
        .all() as unknown as Row[]
    ).map((r) => ({
      host: String(r["host"]),
      requests: Number(r["requests"]),
      ok: Number(r["ok"]),
      errors: Number(r["errors"]),
      throttled: Number(r["throttled"]),
      backoffMs: Number(r["backoff_ms"]),
    }));
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of [...APPEND_ONLY, "targets", "links", "groups", "runs"]) {
      out[t] = Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    }
    return out;
  }

  timeRange(): { firstMs: number | null; lastMs: number | null } {
    const r = this.db.prepare("SELECT MIN(observed_ms) AS a, MAX(observed_ms) AS b FROM snapshots").get() as { a: number | null; b: number | null };
    return { firstMs: r.a, lastMs: r.b };
  }

  // ---- integrity and retention ----

  verify(): VerifyReport {
    const checked: Record<string, number> = {};
    const mismatches: { table: string; id: number }[] = [];
    const cols: Record<(typeof APPEND_ONLY)[number], readonly string[]> = {
      snapshots: ["target_key", "venue", "market_id", "token_id", "observed_ms", "req_start_ms", "venue_ts_ms", "book_hash", "bids_json", "asks_json", "n_bids", "n_asks", "best_bid", "best_ask", "flags", "tick"],
      market_state: ["target_key", "venue", "market_id", "observed_ms", "token_id", "status", "close_ms", "accepting", "tick", "fee_json"],
      events: ["ts_ms", "run_id", "kind", "host", "target_key", "detail"],
      clock_skew: ["ts_ms", "host", "local_start_ms", "local_end_ms", "server_ms", "skew_est_ms"],
      host_stats: ["ts_ms", "host", "requests", "ok", "errors", "throttled", "backoff_ms"],
    };
    for (const table of APPEND_ONLY) {
      let n = 0;
      for (const r of this.db.prepare(`SELECT id, sha256, ${cols[table].join(", ")} FROM ${table}`).iterate() as Iterable<Row>) {
        n += 1;
        const values = cols[table].map((c) => {
          const v = r[c];
          return v === undefined || v === null ? null : typeof v === "bigint" ? Number(v) : (v as string | number);
        });
        if (rowSha(table, values) !== r["sha256"]) mismatches.push({ table, id: Number(r["id"]) });
      }
      checked[table] = n;
    }
    const integrity = String((this.db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check);
    return { ok: mismatches.length === 0 && integrity === "ok", checked, mismatches, integrity };
  }

  // Deletes data older than cutoffMs inside an explicitly opened window. Run records stay.
  prune(nowMs: number, cutoffMs: number): Record<string, number> {
    const removed: Record<string, number> = {};
    this.exec(() => {
      this.setMeta("prune_before_ms", String(cutoffMs));
      try {
        for (const t of APPEND_ONLY) {
          const info = this.db.prepare(`DELETE FROM ${t} WHERE ${TIME_COLUMN[t]} < ?`).run(cutoffMs);
          removed[t] = Number(info.changes);
        }
      } finally {
        this.db.prepare("DELETE FROM meta WHERE key = 'prune_before_ms'").run();
      }
    });
    this.event(nowMs, "prune", null, null, `cutoff_ms=${cutoffMs} snapshots=${removed["snapshots"] ?? 0} market_state=${removed["market_state"] ?? 0} events=${removed["events"] ?? 0}`);
    return removed;
  }

  vacuum(): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE); VACUUM");
  }

  // Test hook: tamper with a row the way a faulty tool or an editor would.
  rawExec(sql: string): void {
    this.db.exec(sql);
  }
}
