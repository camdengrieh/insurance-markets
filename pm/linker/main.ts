// Single entry script for the linker.
//
//   tsx pm/linker/main.ts <once|run|dry-run|report|export-app> --registry <file> --out <dir> [options]
//
//   once        discover open markets, score, propose candidates into the registry, export the bundle, print the report
//   run         the same every --interval (default 2h) until SIGINT or SIGTERM
//   dry-run     print the requests a run would make; no network, no writes
//   report      counts per venue, category and block and the top candidates, from the files in --out
//   export-app  write the dApp's links.json from the bundle in --out (ids, hashes, categories, bands)
//
// runCli() takes its clock, fetch and output sinks as arguments so tests drive every command
// against a loopback fake. Candidates are proposed, never approved: approval is
// `tsx pm/links/cli.ts review <id>` then `approve` by a person.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { validateBundle } from "../links/bundle.js";
import { nodeFileEnv, readRegistry } from "../links/registry-file.js";
import { systemClock, type Clock } from "../recorder/clock.js";
import { parseConfig, type RecorderConfig } from "../recorder/config.js";
import { writeAtomic } from "../recorder/discover.js";
import { PoliteClient } from "../recorder/http.js";
import { acquireLock, ensureWritableDir } from "../recorder/main.js";
import { QUOTIENT_FLAG } from "../signals/flag.js";
import { isLinkerVenue, LINKER_VENUES, refusalReason, type LinkerVenue } from "./allowlist.js";
import { serializeAppDataset, toAppDataset } from "./app-dataset.js";
import { BUNDLE_FILE, DEFAULT_INTERVAL_MS, LOCK_NAME, MAX_INTERVAL_MS, MIN_INTERVAL_MS, PIN_FILE, STATE_FILE } from "./constants.js";
import { DEFAULT_DISCOVER, dryRunLines } from "./discover.js";
import { stateReportLines } from "./report.js";
import { runOnce } from "./run.js";
import { readState } from "./state.js";

export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly clock?: Clock;
  readonly fetchImpl?: typeof fetch;
  readonly rng?: () => number;
  readonly signal?: AbortSignal;
  readonly env?: Readonly<Record<string, string | undefined>>;
  // Tests only: lets SYNTHETIC- ids form a bundle. Not reachable from the command line.
  readonly allowSynthetic?: boolean;
}

const HELP = `pm-linker: proposes same-question links across venues; a person approves them

usage: tsx pm/linker/main.ts <command> --registry <file> --out <dir> [options]

commands
  once        one pass now, then exit (for cron, Railway cron, a scheduled routine)
  run         loop every --interval (default 2h) until SIGINT or SIGTERM
  dry-run     print the requests a pass would make; no network, no writes
  report      counts per venue, category and block, and the top candidates (ids and hashes only)
  export-app  write the dApp dataset (--app-out <file>) from the bundle in --out

options
  --registry <file>        the working link registry (default pm/links/data/registry.json); candidates are added here
  --out <dir>              where the state file, candidates.bundle.json, its .pin and structure-groups.json live
  --interval <2h|30m|3600s> (run) time between passes, 15m to 7d
  --venues a,b             subset of xo, polymarket, limitless (default all three)
  --config <file>          recorder-style JSON (hostBudgets, hostBases for a loopback test server, backoff)
  --max-detail N           XO detail reads per pass (default 300)
  --quotient-body <file>   (once, run) a Quotient body the agent already paid for; read in memory, reported on stdout only
  --quotient-kind mispriced|signals   how to parse that body (default mispriced)
  --app-out <file>         (export-app) where to write the dApp's links.json
  --release YYYY-MM-DD     (export-app) release date stamped into the dApp dataset (default today)

Quotient agreement appears only when ${QUOTIENT_FLAG}=1 is set and a body file is given, and only on stdout.
Kalshi, Quotient and every venue not on the allowlist are never contacted and never written.
`;

function parseInterval(text: string | undefined): number | string {
  if (text === undefined) return DEFAULT_INTERVAL_MS;
  const m = /^(\d{1,6})(ms|s|m|h|d)$/.exec(text.trim());
  if (m === null) return "--interval must be a number with a unit (s, m, h, d), for example 2h";
  const n = Number(m[1]);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "ms" | "s" | "m" | "h" | "d"];
  const ms = n * unit;
  if (ms < MIN_INTERVAL_MS || ms > MAX_INTERVAL_MS) return `--interval must be between 15m and 7d`;
  return ms;
}

const DEFAULT_REGISTRY = join("pm", "links", "data", "registry.json");

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const clock = io.clock ?? systemClock;
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        registry: { type: "string" },
        out: { type: "string" },
        interval: { type: "string" },
        venues: { type: "string" },
        config: { type: "string" },
        "max-detail": { type: "string" },
        "quotient-body": { type: "string" },
        "quotient-kind": { type: "string" },
        "app-out": { type: "string" },
        release: { type: "string" },
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
  if (!["once", "run", "dry-run", "report", "export-app"].includes(command)) {
    io.err(`unknown command "${command.slice(0, 30)}"\n\n${HELP}`);
    return 2;
  }

  // ---- venues ----
  const venues: LinkerVenue[] = [];
  for (const v of (values.venues ?? [...LINKER_VENUES].join(",")).split(",").map((s) => s.trim()).filter((s) => s !== "")) {
    if (!isLinkerVenue(v)) {
      io.err(`venue "${v.slice(0, 40)}" refused: ${refusalReason(v)}`);
      return 2;
    }
    if (!venues.includes(v)) venues.push(v);
  }
  if (venues.length === 0) {
    io.err("at least one venue is required");
    return 2;
  }

  // ---- config (host budgets and loopback bases come from the recorder's schema) ----
  let base: Record<string, unknown> = {};
  if (values.config !== undefined) {
    try {
      const j = JSON.parse(readFileSync(values.config, "utf8")) as unknown;
      if (typeof j !== "object" || j === null || Array.isArray(j)) {
        io.err("--config must contain a JSON object");
        return 2;
      }
      base = { ...(j as Record<string, unknown>) };
    } catch {
      io.err("cannot read --config as JSON");
      return 2;
    }
  }
  // dbPath is the recorder's; the linker has no database. Everything else is shared.
  const cfg = parseConfig({ ...base, dbPath: ":memory:", venues });
  if (!cfg.ok) {
    io.err(`configuration refused:\n${cfg.errors.map((e) => `  - ${e}`).join("\n")}`);
    return 2;
  }
  const config: RecorderConfig = cfg.value;
  const maxDetail = values["max-detail"] === undefined ? DEFAULT_DISCOVER.maxDetailRequests : Number(values["max-detail"]);
  if (!Number.isInteger(maxDetail) || maxDetail < 0 || maxDetail > 5000) {
    io.err("--max-detail must be an integer from 0 to 5000");
    return 2;
  }
  const discoverOptions = { ...DEFAULT_DISCOVER, venues, maxDetailRequests: maxDetail };

  if (command === "dry-run") {
    for (const line of dryRunLines(discoverOptions)) io.out(line);
    return 0;
  }

  const outDir = resolve(values.out ?? join("pm", "linker", "out"));
  const registryPath = resolve(values.registry ?? DEFAULT_REGISTRY);

  if (command === "report") {
    const state = readState(join(outDir, STATE_FILE));
    const reg = existsSync(registryPath) ? readRegistry(nodeFileEnv, registryPath) : null;
    let bundle = null;
    const bundlePath = join(outDir, BUNDLE_FILE);
    const pinPath = join(outDir, PIN_FILE);
    if (existsSync(bundlePath) && existsSync(pinPath)) {
      const v = validateBundle(readFileSync(bundlePath, "utf8"), { expectedManifestSha256: readFileSync(pinPath, "utf8").trim(), allowSynthetic: io.allowSynthetic === true });
      if (!v.ok) {
        io.err(`bundle in --out refused: ${v.errors.slice(0, 3).join("; ")}`);
        return 1;
      }
      bundle = v.value;
    }
    for (const line of stateReportLines(state, reg !== null && reg.ok ? reg.value : null, bundle)) io.out(line);
    return 0;
  }

  if (command === "export-app") {
    const appOut = values["app-out"];
    if (appOut === undefined) {
      io.err("export-app needs --app-out <file>");
      return 2;
    }
    const bundlePath = join(outDir, BUNDLE_FILE);
    const pinPath = join(outDir, PIN_FILE);
    if (!existsSync(bundlePath) || !existsSync(pinPath)) {
      io.err("no bundle in --out; run once first");
      return 2;
    }
    const v = validateBundle(readFileSync(bundlePath, "utf8"), { expectedManifestSha256: readFileSync(pinPath, "utf8").trim() });
    if (!v.ok) {
      io.err(`bundle in --out refused: ${v.errors.slice(0, 3).join("; ")}`);
      return 1;
    }
    const release = values.release ?? new Date(clock.nowMs()).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release)) {
      io.err("--release must be YYYY-MM-DD");
      return 2;
    }
    const state = readState(join(outDir, STATE_FILE));
    const categories = new Map(Object.entries(state.markets).map(([k, m]) => [k, m.category]));
    const conv = toAppDataset(v.value, { release, categories });
    const target = resolve(appOut);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, serializeAppDataset(conv.dataset));
    io.out(`wrote ${conv.dataset.links.length} links (${conv.dataset.links.filter((l) => l.state === "proposed").length} proposed) to the dApp dataset; contentSha256 ${conv.dataset.contentSha256}`);
    for (const s of conv.skipped) io.out(`  skipped ${s.linkId}: ${s.reason}`);
    return 0;
  }

  // ---- once / run ----
  const interval = parseInterval(values.interval);
  if (typeof interval === "string") {
    io.err(interval);
    return 2;
  }
  const kindRaw = values["quotient-kind"] ?? "mispriced";
  if (kindRaw !== "mispriced" && kindRaw !== "signals") {
    io.err("--quotient-kind must be mispriced or signals");
    return 2;
  }
  let quotientBody: { text: string; kind: "mispriced" | "signals" } | null = null;
  if (values["quotient-body"] !== undefined) {
    try {
      quotientBody = { text: readFileSync(values["quotient-body"], "utf8"), kind: kindRaw };
    } catch {
      io.err("cannot read --quotient-body");
      return 2;
    }
  }
  const wr = ensureWritableDir(outDir);
  if (wr !== null) {
    io.err(wr);
    return 2;
  }
  const lock = acquireLock(join(outDir, LOCK_NAME));
  if (typeof lock === "string") {
    io.err(lock.replace("another recorder", "another linker"));
    return 3;
  }
  const controller = new AbortController();
  io.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const client = new PoliteClient({
    config,
    clock,
    ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
    ...(io.rng === undefined ? {} : { rng: io.rng }),
    signal: controller.signal,
    onEvent: (kind, host, detail) => io.err(`${kind}${host === null ? "" : ` ${host}`}: ${detail}`),
  });
  const env = io.env ?? {};
  try {
    for (;;) {
      lock.touch();
      const r = await runOnce({
        command: command === "run" ? "run" : "once",
        registryPath,
        outDir,
        clock,
        client,
        venues,
        discover: discoverOptions,
        env,
        quotientBody,
        signal: controller.signal,
        ...(io.allowSynthetic === true ? { allowSynthetic: true } : {}),
      });
      for (const line of r.lines) (r.ok ? io.out : io.err)(line);
      if (!r.ok) return 1;
      if (command === "once" || controller.signal.aborted) return 0;
      io.out(`next pass in ${Math.round(interval / 60_000)} minutes`);
      await clock.sleep(interval, controller.signal);
      if (controller.signal.aborted) return 0;
    }
  } catch (error) {
    io.err(`linker stopped: ${error instanceof Error ? error.message.replace(/\/[^\s]*/g, "<path>").slice(0, 200) : "error"}`);
    return 1;
  } finally {
    controller.abort();
    lock.release();
  }
}

// Keeps the helper importable (the deploy bundle needs it) without a second lock implementation.
export { writeAtomic };

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
