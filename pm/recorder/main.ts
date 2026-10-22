// Single entry script for the recorder.
//
//   tsx pm/recorder/main.ts <command> [options]
//
// Commands: run (loop), once (one tick, for cron and schedulers), dry-run (print the plan; no
// network, no database), discover (build the targets file from public data), report, verify, gaps,
// prune, status, help. Nothing here deploys or
// starts anything on its own; see pm/recorder/RUN.md.
//
// runCli() takes its clock, fetch and output sinks as arguments so tests can drive every command
// against fixtures and a loopback server.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256Hex } from "../links/canonical.js";
import { Collector } from "./collector.js";
import { systemClock, type Clock } from "./clock.js";
import { parseConfig, type RecorderConfig } from "./config.js";
import { dryDiscoverLines, discover, fileAgeMs, DEFAULT_DISCOVER, type DiscoverOptions } from "./discover.js";
import { detectGaps } from "./gaps.js";
import { PoliteClient } from "./http.js";
import { buildDryRun } from "./plan.js";
import { buildReport, formatReport } from "./report.js";
import { RecorderStore } from "./store.js";
import { loadTargets, type TargetInputs } from "./targets.js";
import { acquireLock, ensureWritableDir } from "./lock.js";
import type { TargetSet } from "./types.js";

// The lock and data-directory helpers live in lock.ts (the linker imports them from there, so its bundle never
// carries this command line); re-exported for existing importers.
export { LOCK_STALE_MS, acquireLock, ensureWritableDir, type Lock } from "./lock.js";

export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly clock?: Clock;
  readonly fetchImpl?: typeof fetch;
  readonly rng?: () => number;
  // Tests only: lets a synthetic bundle load. Not reachable from the command line.
  readonly allowSynthetic?: boolean;
  readonly signal?: AbortSignal;
  // RECORDER_DB, RECORDER_TARGETS and RECORDER_CONFIG give defaults for --db, --targets and --config (the container sets them).
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const HELP = `pm-recorder: read-only recorder of public order books for linked markets

usage: tsx pm/recorder/main.ts <command> [options]

commands
  run        loop until stopped (SIGINT or SIGTERM)
  once       do whatever is due now, then exit (for cron, launchd, systemd timers, schedulers)
  dry-run    print the URLs and cadence that run would use; no network, no database
  discover   build the targets file from public XO and Polymarket data (--dry lists the requests only)
  report     descriptive report from the recorded data (no trading claims)
  verify     recompute row checksums and run the SQLite integrity check
  gaps       list gaps in the recorded series
  prune      apply retention now
  status     counts, size, runs, target states

inputs
  --db <path>              database file (default pm/recorder/data/recorder.sqlite)
  --bundle <path>          pm/links bundle; needs --pin <sha256> or --pin-file <path>
  --pin <hex> | --pin-file <path> | --unpinned   manifest hash to require (--unpinned skips the check)
  --targets <path>         JSON file with XO or Polymarket groups and loose markets
                           (discover writes it; default: targets.json next to the database)
  --discover               (run, once) keep --targets up to date by discovery; no hand-written list needed
  --discover-every <sec>   (run) seconds between discoveries (default 86400, minimum 300)
  --dry                    (discover) print the requests it would make and their count; nothing is sent
  --max-short N  --max-regular N   (discover) per venue caps for markets closing within the short horizon / others
  --no-candidates          record approved links only
  --config <path>          JSON overrides (see pm/recorder/config.ts)
  --venues a,b             subset of: xo, polymarket, limitless
  --interval-sec N  --short-interval-sec N  --short-horizon-hours N  --depth N  --retention-days N
  --format text|json  --out <path>   (report)
  --days N                 (prune) override retention days

Kalshi, Quotient and every venue not on the allowlist are refused, never contacted and never stored.
`;

function parseNum(v: string | undefined, name: string, errors: string[]): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    errors.push(`${name} must be a number`);
    return undefined;
  }
  return n;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const clock = io.clock ?? systemClock;
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        db: { type: "string" },
        bundle: { type: "string" },
        pin: { type: "string" },
        "pin-file": { type: "string" },
        unpinned: { type: "boolean" },
        targets: { type: "string" },
        "no-candidates": { type: "boolean" },
        config: { type: "string" },
        venues: { type: "string" },
        "interval-sec": { type: "string" },
        "short-interval-sec": { type: "string" },
        "short-horizon-hours": { type: "string" },
        depth: { type: "string" },
        "retention-days": { type: "string" },
        format: { type: "string" },
        out: { type: "string" },
        days: { type: "string" },
        "dry-run": { type: "boolean" },
        dry: { type: "boolean" },
        discover: { type: "boolean" },
        "discover-every": { type: "string" },
        "max-short": { type: "string" },
        "max-regular": { type: "string" },
        help: { type: "boolean" },
      },
    });
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : "bad arguments"}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const command = positionals[0] ?? "help";
  if (command === "help" || values.help === true) {
    io.out(HELP);
    return 0;
  }
  if (!["run", "once", "dry-run", "discover", "report", "verify", "gaps", "prune", "status"].includes(command)) {
    io.err(`unknown command "${command.slice(0, 30)}"\n\n${HELP}`);
    return 2;
  }

  // ---- config ----
  const errors: string[] = [];
  let base: Record<string, unknown> = {};
  try {
    const configPath = values.config ?? nonEmpty(io.env?.["RECORDER_CONFIG"]);
    if (configPath !== undefined) {
      const j = readJson(configPath);
      if (typeof j !== "object" || j === null || Array.isArray(j)) errors.push("--config must contain a JSON object");
      else base = { ...(j as Record<string, unknown>) };
    }
  } catch {
    errors.push("cannot read --config as JSON");
  }
  const set = (k: string, v: unknown): void => {
    if (v !== undefined) base[k] = v;
  };
  set("dbPath", values.db ?? nonEmpty(io.env?.["RECORDER_DB"]));
  if (values.venues !== undefined) set("venues", values.venues.split(",").map((s) => s.trim()).filter((s) => s !== ""));
  set("intervalSec", parseNum(values["interval-sec"], "--interval-sec", errors));
  set("shortIntervalSec", parseNum(values["short-interval-sec"], "--short-interval-sec", errors));
  const hours = parseNum(values["short-horizon-hours"], "--short-horizon-hours", errors);
  if (hours !== undefined) set("shortHorizonSec", Math.round(hours * 3600));
  set("depthLevels", parseNum(values.depth, "--depth", errors));
  set("retentionDays", parseNum(values["retention-days"], "--retention-days", errors));
  const everySec = parseNum(values["discover-every"], "--discover-every", errors) ?? 86_400;
  if (everySec < 300 || everySec > 7 * 86_400) errors.push("--discover-every must be between 300 and 604800 seconds");
  const discoverOpts: DiscoverOptions = {
    ...DEFAULT_DISCOVER,
    ...(parseNum(values["max-short"], "--max-short", errors) === undefined ? {} : { maxShortPerVenue: Number(values["max-short"]) }),
    ...(parseNum(values["max-regular"], "--max-regular", errors) === undefined ? {} : { maxRegularPerVenue: Number(values["max-regular"]) }),
  };
  if (!(discoverOpts.maxShortPerVenue >= 0 && discoverOpts.maxRegularPerVenue >= 0)) errors.push("--max-short and --max-regular must be zero or more");
  const cfgResult = errors.length === 0 ? parseConfig(base) : { ok: false as const, errors };
  if (!cfgResult.ok) {
    io.err(`configuration refused:\n${cfgResult.errors.map((e) => `  - ${e}`).join("\n")}`);
    return 2;
  }
  const config: RecorderConfig = cfgResult.value;

  const discoverOn = (command === "run" || command === "once") && values.discover === true;
  // Where discovery writes and the loop reads: --targets, else RECORDER_TARGETS, else next to the database.
  const discoverPath = values.targets ?? nonEmpty(io.env?.["RECORDER_TARGETS"]) ?? join(dirname(config.dbPath === ":memory:" ? "." : config.dbPath), "targets.json");
  const targetsArg = values.targets ?? (discoverOn || command === "discover" ? discoverPath : nonEmpty(io.env?.["RECORDER_TARGETS"]));

  // ---- target inputs ----
  let expected: string | undefined;
  if (values.pin !== undefined) expected = values.pin.trim().toLowerCase();
  else if (values["pin-file"] !== undefined) {
    try {
      expected = readFileSync(values["pin-file"], "utf8").trim().toLowerCase();
    } catch {
      io.err("cannot read --pin-file");
      return 2;
    }
  }
  if (expected !== undefined && !/^[0-9a-f]{64}$/.test(expected)) {
    io.err("the pin must be 64 lowercase hex characters");
    return 2;
  }
  const inputs: TargetInputs = {
    ...(values.bundle === undefined ? {} : { bundlePath: values.bundle }),
    bundleOptions: {
      ...(expected === undefined ? {} : { expectedManifestSha256: expected }),
      ...(values.unpinned === true ? { unpinned: true } : {}),
      ...(io.allowSynthetic === true ? { allowSynthetic: true } : {}),
      includeCandidates: values["no-candidates"] !== true,
    },
    ...(targetsArg === undefined ? {} : { targetsPath: targetsArg }),
    maxTargets: config.maxTargets,
    venues: config.venues,
  };
  const load = (): TargetSet | string[] => {
    const r = loadTargets(inputs);
    return r.ok ? r.value : r.errors;
  };

  // ---- discover: build the targets file from public data ----
  if (command === "discover") {
    if (values.dry === true) {
      let n = 0;
      for (const line of dryDiscoverLines(config, discoverOpts)) {
        io.out(line);
        n += 1;
      }
      io.out(`(${n} lines; nothing was sent)`);
      return 0;
    }
    const wr = ensureWritableDir(dirname(discoverPath));
    if (wr !== null) {
      io.err(wr);
      return 2;
    }
    const client = new PoliteClient({
      config,
      clock,
      ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
      ...(io.rng === undefined ? {} : { rng: io.rng }),
      ...(io.signal === undefined ? {} : { signal: io.signal }),
    });
    try {
      const r = await discover({ config, client, clock, outPath: discoverPath, options: discoverOpts, ...(io.signal === undefined ? {} : { signal: io.signal }) });
      for (const line of r.lines) io.out(line);
      return r.ok ? 0 : 1;
    } catch (error) {
      io.err(`discover failed: ${error instanceof Error ? error.message.replace(/\/[^\s]*/g, "<path>").slice(0, 200) : "error"}`);
      return 1;
    }
  }

  // ---- commands that need no database ----
  if (command === "dry-run" || (values["dry-run"] === true && (command === "run" || command === "once"))) {
    const t = load();
    if (Array.isArray(t)) {
      io.err(`targets refused:\n${t.map((e) => `  - ${e}`).join("\n")}`);
      return 2;
    }
    const extra = [`skipped: ${t.skipped.linksWithRefusedLeg} links with a refused leg, ${t.skipped.invalidIds} with invalid ids, ${t.skipped.inactiveLinks} inactive`];
    for (const line of buildDryRun(config, t.targets, clock.nowMs(), extra).lines) io.out(line);
    return 0;
  }

  // ---- commands on an existing database ----
  if (["report", "verify", "gaps", "status", "prune"].includes(command)) {
    if (config.dbPath !== ":memory:" && !existsSync(config.dbPath)) {
      io.err("database not found; nothing to read");
      return 2;
    }
    const store = RecorderStore.open(config.dbPath);
    try {
      return await readCommand(command, store, config, values, io, clock.nowMs());
    } finally {
      store.close();
    }
  }

  // ---- run / once ----
  // With discovery on the targets file may not exist yet; it is built after the lock is held.
  if (!discoverOn) {
    const first = load();
    if (Array.isArray(first)) {
      io.err(`targets refused:\n${first.map((e) => `  - ${e}`).join("\n")}`);
      return 2;
    }
    if (first.targets.length === 0) {
      io.err("no targets: give --bundle (with a pin) and/or --targets");
      return 2;
    }
  }
  if (config.dbPath !== ":memory:") {
    const wr = ensureWritableDir(dirname(config.dbPath));
    if (wr !== null) {
      io.err(wr);
      return 2;
    }
  }
  const lock = acquireLock(config.dbPath);
  if (typeof lock === "string") {
    io.err(lock);
    return 3;
  }
  const store = RecorderStore.open(config.dbPath);
  const controller = new AbortController();
  io.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  let lastSha = "";
  // Discovery runs beside collection (same client, so the same budgets). It starts from the tick
  // hook when due and is awaited at shutdown.
  let client: PoliteClient | undefined;
  let discovering: Promise<void> | undefined;
  let lastDiscoveryMs = Number.NEGATIVE_INFINITY;
  let nextDiscoveryAfterMs = everySec * 1000;
  const runDiscovery = async (): Promise<void> => {
    if (client === undefined) return;
    lastDiscoveryMs = clock.nowMs();
    try {
      const r = await discover({ config, client, clock, outPath: discoverPath, options: discoverOpts, signal: controller.signal });
      // Unfinished group lookups or a failed run are retried within the hour.
      nextDiscoveryAfterMs = r.ok && r.pendingLookups === 0 ? everySec * 1000 : Math.min(everySec, 3600) * 1000;
      store.event(
        clock.nowMs(),
        r.ok ? "targets" : "error",
        null,
        null,
        r.ok
          ? `discovery wrote targets=${r.counts.targets} groups=${r.counts.groups} markets=${r.counts.markets} requests=${r.requests} pending_lookups=${r.pendingLookups}`
          : `discovery kept the previous targets file (requests=${r.requests})`,
      );
      for (const line of r.lines) io.out(line);
    } catch (error) {
      nextDiscoveryAfterMs = Math.min(everySec, 3600) * 1000;
      store.event(clock.nowMs(), "error", null, null, `discovery failed: ${error instanceof Error ? error.message.replace(/\/[^\s]*/g, "<path>").slice(0, 120) : "error"}`);
    }
  };
  const sync = (): void => {
    lock.touch();
    if (discoverOn && discovering === undefined && !controller.signal.aborted && clock.nowMs() - lastDiscoveryMs >= nextDiscoveryAfterMs) {
      discovering = runDiscovery().finally(() => {
        discovering = undefined;
      });
    }
    const t = load();
    if (Array.isArray(t)) {
      store.event(clock.nowMs(), "error", null, null, `target files could not be reloaded (${t.length} errors); keeping the previous set`);
      return;
    }
    const sha = sha256Hex(canonicalJson({ t: t.targets, l: t.links, g: t.groups }));
    if (sha === lastSha) return;
    lastSha = sha;
    store.syncTargets(t.targets, t.links, t.groups);
    store.event(clock.nowMs(), "targets", null, null, `targets=${t.targets.length} links=${t.links.length} groups=${t.groups.length} refused_links=${t.skipped.linksWithRefusedLeg}`);
  };
  try {
    store.startRun(clock.nowMs(), command, sha256Hex(JSON.stringify({ ...config, hostBases: {} })));
    client = new PoliteClient({
      config,
      clock,
      ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
      ...(io.rng === undefined ? {} : { rng: io.rng }),
      signal: controller.signal,
      onEvent: (kind, host, detail) => store.event(clock.nowMs(), kind, host, null, detail),
    });
    if (discoverOn) {
      // A recent file is reused; otherwise build it now so the first tick has targets.
      const age = fileAgeMs(discoverPath);
      if (age !== null && age < everySec * 1000 && existsSync(discoverPath)) lastDiscoveryMs = clock.nowMs() - age;
      else {
        await runDiscovery();
        const first = load();
        if (Array.isArray(first) || first.targets.length === 0) {
          io.err("discovery produced no targets and there is no earlier targets file; check the connection and try again");
          store.endRun(clock.nowMs(), "completed");
          return 2;
        }
      }
    }
    const collector = new Collector({ store, client, clock, config, log: io.out, beforeTick: sync });
    await collector.run(controller.signal, command === "once");
    store.endRun(clock.nowMs(), controller.signal.aborted ? "signal" : "completed");
    return 0;
  } catch (error) {
    try {
      store.endRun(clock.nowMs(), "crashed");
    } catch {
      /* the store itself may be the problem */
    }
    io.err(`recorder stopped: ${error instanceof Error ? error.message.slice(0, 200) : "error"}`);
    return 1;
  } finally {
    controller.abort();
    await discovering?.catch(() => undefined);
    store.close();
    lock.release();
  }
}

function nonEmpty(v: string | undefined): string | undefined {
  return v === undefined || v.trim() === "" ? undefined : v;
}

async function readCommand(
  command: string,
  store: RecorderStore,
  config: RecorderConfig,
  values: { readonly format?: string | undefined; readonly out?: string | undefined; readonly days?: string | undefined },
  io: CliIo,
  nowMs: number,
): Promise<number> {
  if (command === "report") {
    const report = buildReport(store, { nowMs, config });
    const text = values.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report);
    if (values.out !== undefined) {
      writeFileSync(values.out, text);
      io.out(`report written to ${values.out}`);
    } else io.out(text);
    return 0;
  }
  if (command === "verify") {
    const v = store.verify();
    io.out(JSON.stringify(v, null, 2));
    return v.ok ? 0 : 1;
  }
  if (command === "gaps") {
    let total = 0;
    for (const t of store.targets()) {
      const snaps = store.snapshots(t.key).map((s) => s.observedMs);
      const state = store.targetStates().get(t.key);
      for (const g of detectGaps(snaps, state?.closeMs ?? t.closeHintMs, config)) {
        total += 1;
        io.out(`${t.key} gap ${new Date(g.fromMs).toISOString()} to ${new Date(g.toMs).toISOString()} (${Math.round(g.missedMs / 60000)} min)`);
      }
    }
    io.out(`gaps: ${total}`);
    return 0;
  }
  if (command === "prune") {
    const days = values.days === undefined ? config.retentionDays : Number(values.days);
    if (!Number.isFinite(days) || days < 7) {
      io.err("--days must be a number of at least 7");
      return 2;
    }
    store.startRun(nowMs, "prune", "-");
    const removed = store.prune(nowMs, nowMs - days * 86_400_000);
    store.endRun(nowMs, "completed");
    io.out(`pruned older than ${days} days: ${JSON.stringify(removed)}`);
    return 0;
  }
  // status
  const range = store.timeRange();
  io.out(
    JSON.stringify(
      {
        counts: store.counts(),
        sizeBytes: store.sizeBytes(),
        firstSnapshot: range.firstMs === null ? null : new Date(range.firstMs).toISOString(),
        lastSnapshot: range.lastMs === null ? null : new Date(range.lastMs).toISOString(),
        runs: store.runs().slice(-5),
        retired: [...store.targetStates().values()].filter((s) => s.retired).length,
      },
      null,
      2,
    ),
  );
  return 0;
}

// Wire process signals only when run as a script. SIGTERM (container stop, redeploy) and
// SIGINT end the loop cleanly: the run is closed and the lock released. If that takes more than
// 25 s (a request stuck beyond its timeout), the process exits non-zero instead of waiting to be killed.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController();
  const stop = (name: string): void => {
    if (controller.signal.aborted) return;
    console.error(`${name} received; finishing the current step and stopping`);
    controller.abort();
    setTimeout(() => process.exit(1), 25_000).unref();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  runCli(process.argv.slice(2), { out: (l) => console.log(l), err: (l) => console.error(l), signal: controller.signal, env: process.env }).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : "error");
      process.exit(1);
    },
  );
}
