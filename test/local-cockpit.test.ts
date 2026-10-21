import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { useEmbeddedRelay } from "../src/relay/client.js";
import { runCli, type CockpitContext } from "../src/local/cli.js";
import { TEST_KDF } from "./relay-core-helpers.js";
import { offlineFetch } from "./local-helpers.js";

// The `serve` hook of src/local/cli.ts (ask A1) and the runtime kill (R6), against stub daemons: a
// stub module path stands in for bridge/main. Then the same hook inside a real bundle built in a scratch
// root that has a fake bridge/main.ts (ask A2), to prove the daemon joins the dist/local.mjs graph and
// is only evaluated by `serve`. Offline; nothing real is signed or sent.

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface BuildOptions {
  root?: string;
  outfile?: string;
  metafile?: boolean;
  logLevel?: "silent" | "warning";
}
interface BuildResult {
  metafile: { inputs: Record<string, unknown> };
}
// scripts/build-local.mjs is plain JavaScript (it is also the `pnpm build:local` command).
const { buildLocal } = (await import(pathToFileURL(join(ROOT, "scripts", "build-local.mjs")).href)) as {
  buildLocal(options: BuildOptions): Promise<BuildResult>;
};
const SCRATCH: string[] = [];

async function scratch(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  SCRATCH.push(dir);
  return dir;
}

after(async () => {
  for (const dir of SCRATCH.splice(0)) await rm(dir, { recursive: true, force: true });
});

// ---- in-process: runCli with a stub daemon -----------------------------------------------------------------------------------------

interface Seen {
  ctx?: CockpitContext;
  events: string[];
  lockAtClose?: boolean;
}
const SEEN_KEY = "__xoCockpitTest";
const seenNow = (): Seen => (globalThis as unknown as Record<string, Seen>)[SEEN_KEY] as Seen;

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)[SEEN_KEY];
  useEmbeddedRelay(undefined);
});

async function stubModule(body: string): Promise<string> {
  const dir = await scratch("xo-cockpit-stub-");
  const path = join(dir, "main.mjs");
  await writeFile(path, body);
  return path;
}

// A daemon that records what it was given and when it was closed.
const RECORDING_STUB = `
const seen = (globalThis.${SEEN_KEY} = { events: [] });
export async function startCockpit(ctx) {
  seen.ctx = ctx;
  seen.events.push("start");
  return {
    async close() {
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      seen.lockAtClose = existsSync(join(ctx.env.XO_DATA_DIR, "store.lock"));
      seen.events.push("cockpit.close");
    },
  };
}
`;

interface Harness {
  readonly out: string[];
  readonly err: string[];
  readonly signals: EventEmitter;
  readonly exits: number[];
  readonly exited: Promise<number>;
  readonly io: { stdout: { write(text: string): unknown }; stderr: { write(text: string): unknown } };
  readonly deps: { runtime: Record<string, unknown>; signals: EventEmitter; exit: (code: number) => void };
}

function harness(): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  const signals = new EventEmitter();
  let done: (code: number) => void = () => undefined;
  const exited = new Promise<number>((resolve) => (done = resolve));
  return {
    out,
    err,
    signals,
    exits,
    exited,
    io: { stdout: { write: (text) => out.push(text) }, stderr: { write: (text) => err.push(text) } },
    deps: {
      signals,
      exit: (code) => {
        exits.push(code);
        done(code);
      },
      // Cheap key derivation, no network, no background upkeep (tests only).
      runtime: { relay: { kdf: TEST_KDF, allowWeakKdf: true, fetch: offlineFetch, maintenance: false, isProcessAlive: () => false } },
    },
  };
}

const FRESH_KEY = "test-master-secret-QQQQ-0123456789";

describe("serve: the hook to the Cockpit daemon", () => {
  it("with no daemon in the build it says so, exits non-zero, and creates and starts nothing", async () => {
    const h = harness();
    const base = await scratch("xo-cockpit-none-");
    const dataDir = join(base, "data");
    const code = await runCli(["serve"], { XO_DATA_DIR: dataDir }, h.io, { ...h.deps, cockpitModule: join(base, "missing.mjs") });
    assert.equal(code, 1);
    assert.match(h.err.join(""), /this build has no Cockpit daemon/);
    assert.deepEqual(h.out, [], "stdout stays empty");
    await assert.rejects(stat(dataDir), "no data directory was created");
    assert.equal(h.signals.listenerCount("SIGTERM"), 0, "no signal handler was installed");
  });

  it("a module without a startCockpit export is treated as no daemon", async () => {
    const h = harness();
    const module = await stubModule("export const somethingElse = 1;\n");
    assert.equal(await runCli(["serve"], { XO_DATA_DIR: join(await scratch("xo-cockpit-x-"), "d") }, h.io, { ...h.deps, cockpitModule: module }), 1);
    assert.match(h.err.join(""), /no Cockpit daemon/);
  });

  it("a module that throws while loading is refused with its error code only, not its text", async () => {
    const h = harness();
    const module = await stubModule(`throw Object.assign(new Error("secret-in-message ${FRESH_KEY}"), { code: "E_LOAD" });\n`);
    const dataDir = join(await scratch("xo-cockpit-broken-"), "d");
    assert.equal(await runCli(["serve"], { XO_DATA_DIR: dataDir }, h.io, { ...h.deps, cockpitModule: module }), 1);
    const text = h.err.join("");
    assert.match(text, /could not be loaded \(E_LOAD\)/);
    assert.ok(!text.includes("secret-in-message") && !text.includes(FRESH_KEY));
    await assert.rejects(stat(dataDir));
  });

  it("a daemon that fails to start exits 1 with its code only and installs no signal handlers", async () => {
    const h = harness();
    const module = await stubModule(`export async function startCockpit() { throw Object.assign(new Error("port in use; token=abc123"), { code: "EADDRINUSE" }); }\n`);
    const dataDir = join(await scratch("xo-cockpit-fail-"), "d");
    assert.equal(await runCli(["serve", "--port", "1"], { XO_DATA_DIR: dataDir }, h.io, { ...h.deps, cockpitModule: module }), 1);
    const text = h.err.join("");
    assert.match(text, /could not start \(EADDRINUSE\)\. Nothing is listening/);
    assert.ok(!text.includes("abc123"));
    assert.equal(h.signals.listenerCount("SIGTERM"), 0);
  });

  it("starts the daemon with the arguments after serve, the runtime, no master key, and stdout untouched; SIGTERM closes the daemon first, then the runtime, and exits 0", async () => {
    const h = harness();
    const module = await stubModule(RECORDING_STUB);
    const dataDir = join(await scratch("xo-cockpit-ok-"), "data");
    const env = { XO_DATA_DIR: dataDir, XO_MASTER_KEY: FRESH_KEY, XO_MASTER_KEY_NEXT: `${FRESH_KEY}-next`, ENABLE_TRADING: "0" };
    process.env["XO_MASTER_KEY"] = FRESH_KEY;
    process.env["XO_MASTER_KEY_NEXT"] = `${FRESH_KEY}-next`;
    try {
      const code = await runCli(["serve", "--port", "0", "--agent-scope", "read,prepare"], env, h.io, { ...h.deps, cockpitModule: module });
      assert.equal(code, undefined, "serving: no exit code");
      const seen = seenNow();
      const ctx = seen.ctx as CockpitContext;
      assert.deepEqual(ctx.args, ["--port", "0", "--agent-scope", "read,prepare"]);
      assert.equal(ctx.env["XO_DATA_DIR"], dataDir);
      assert.equal(ctx.env["XO_MASTER_KEY"], undefined, "the daemon never sees the master key");
      assert.equal(ctx.env["XO_MASTER_KEY_NEXT"], undefined);
      assert.equal(process.env["XO_MASTER_KEY"], undefined, "and neither does this process's own environment");
      assert.equal(process.env["XO_MASTER_KEY_NEXT"], undefined);
      assert.equal(ctx.version, "0.2.0");
      // The runtime is the real one: it starts and the banner (from the runtime) reaches stderr, not stdout.
      const status = await ctx.runtime.start();
      assert.equal(status.state, "ready", status.state === "failed" ? status.message : status.state);
      assert.match(h.err.join(""), /xo-market local mode 0\.2\.0/);
      assert.ok(!h.err.join("").includes(FRESH_KEY), "the master key is nowhere on stderr");
      assert.deepEqual(h.out, []);
      assert.equal(h.signals.listenerCount("SIGINT"), 1);
      assert.equal(h.signals.listenerCount("SIGTERM"), 1);
      assert.equal(h.signals.listenerCount("SIGUSR2"), 1);
      // The process-wide relay client is the runtime's, as in stdio mode.
      assert.ok((await readdir(dataDir)).includes("store.lock"));
      h.signals.emit("SIGTERM");
      assert.equal(await h.exited, 0);
      assert.deepEqual(seen.events, ["start", "cockpit.close"]);
      assert.equal(seen.lockAtClose, true, "the daemon was closed while the runtime still held the data directory");
      assert.ok(!(await readdir(dataDir)).includes("store.lock"), "then the runtime released it");
      h.signals.emit("SIGINT");
      assert.deepEqual(h.exits, [0], "a second signal does nothing");
    } finally {
      delete process.env["XO_MASTER_KEY"];
      delete process.env["XO_MASTER_KEY_NEXT"];
    }
  });

  it("the daemon's kill button and SIGUSR2 are the same one-way switch, audited, idempotent, and taking effect on the next write", async () => {
    const h = harness();
    const module = await stubModule(RECORDING_STUB);
    const dataDir = join(await scratch("xo-cockpit-kill-"), "data");
    const code = await runCli(["serve"], { XO_DATA_DIR: dataDir, ENABLE_TRADING: "1", RELAY_ENFORCE_FLAG_FACTS: "0" }, h.io, { ...h.deps, cockpitModule: module });
    assert.equal(code, undefined);
    const ctx = seenNow().ctx as CockpitContext;
    const status = await ctx.runtime.start();
    assert.equal(status.state, "ready");
    if (status.state !== "ready") return;
    assert.equal(status.relay.flags().KILL, false);
    // A write route before the kill is not refused for the kill switch (it needs more than this, so any other refusal will do).
    const before = await status.relay.handler({ method: "POST", path: "/v1/order/cancel", bodyText: JSON.stringify({ owner: `0x${"11".repeat(20)}`, order_hash: `0x${"ab".repeat(32)}` }), signal: new AbortController().signal });
    assert.ok(!before.bodyText.includes("kill_switch"), before.bodyText);

    assert.equal(await ctx.engageKill("test button"), true);
    assert.equal(status.relay.flags().KILL, true);
    const after = await status.relay.handler({ method: "POST", path: "/v1/order/cancel", bodyText: JSON.stringify({ owner: `0x${"11".repeat(20)}`, order_hash: `0x${"ab".repeat(32)}` }), signal: new AbortController().signal });
    assert.match(after.bodyText, /kill_switch/);
    assert.equal(await ctx.engageKill("again"), true, "idempotent");

    // The signal does the same thing and says so on stderr.
    h.signals.emit("SIGUSR2");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(h.err.join(""), /kill switch engaged by signal/);
    // Reads still work.
    const health = await status.relay.client.get("/v1/health");
    assert.equal(health.ok && health.data.kill, true);

    const audit = await readFile(join(dataDir, "logs", "audit.log"), "utf8");
    assert.match(audit, /"KILL"/);
    assert.match(audit, /test button/);
    h.signals.emit("SIGTERM");
    assert.equal(await h.exited, 0);
  });

  it("a kill that arrives before the relay has started is not lost", async () => {
    const h = harness();
    const module = await stubModule(`
export async function startCockpit(ctx) {
  globalThis.${SEEN_KEY} = { ctx, events: [], early: await ctx.engageKill("early") };
  return { async close() {} };
}
`);
    const dataDir = join(await scratch("xo-cockpit-early-"), "data");
    assert.equal(await runCli(["serve"], { XO_DATA_DIR: dataDir }, h.io, { ...h.deps, cockpitModule: module }), undefined);
    const seen = seenNow() as Seen & { early: boolean };
    assert.equal(seen.early, true);
    const status = await (seen.ctx as CockpitContext).runtime.start();
    assert.equal(status.state === "ready" && status.relay.flags().KILL, true);
    h.signals.emit("SIGTERM");
    await h.exited;
  });

  it("with a relay that could not start the kill reports false instead of pretending, and never throws", async () => {
    const h = harness();
    const module = await stubModule(RECORDING_STUB);
    // A relative data directory is refused by the runtime, so there is no relay to kill (and nothing can write).
    assert.equal(await runCli(["serve"], { XO_DATA_DIR: "relative/dir" }, h.io, { ...h.deps, cockpitModule: module }), undefined);
    const ctx = seenNow().ctx as CockpitContext;
    assert.equal(await ctx.engageKill("nothing to kill"), false);
    h.signals.emit("SIGUSR2");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(h.err.join(""), /no relay is running/);
    h.signals.emit("SIGINT");
    assert.equal(await h.exited, 0);
  });

  it("a daemon whose close hangs cannot keep a stopped session alive: the process exits 1 after the grace period", async () => {
    const h = harness();
    const module = await stubModule(`export async function startCockpit() { return { close: () => new Promise(() => {}) }; }\n`);
    const dataDir = join(await scratch("xo-cockpit-hang-"), "data");
    await runCli(["serve"], { XO_DATA_DIR: dataDir }, h.io, { ...h.deps, stopGraceMs: 40, cockpitModule: module });
    h.signals.emit("SIGTERM");
    assert.equal(await h.exited, 1);
  });

  it("two stop signals in a row stop once", async () => {
    const h = harness();
    const module = await stubModule(RECORDING_STUB);
    const dataDir = join(await scratch("xo-cockpit-once-"), "data");
    await runCli(["serve"], { XO_DATA_DIR: dataDir }, h.io, { ...h.deps, cockpitModule: module });
    h.signals.emit("SIGTERM");
    h.signals.emit("SIGTERM");
    await h.exited;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(h.exits, [0]);
    assert.deepEqual(seenNow().events, ["start", "cockpit.close"]);
  });
});

describe("the other commands still behave", () => {
  it("--help lists serve and the kill signal; an unknown command is still refused with 2", async () => {
    const h = harness();
    assert.equal(await runCli(["--help"], {}, h.io, h.deps), 0);
    const text = h.out.join("");
    assert.match(text, /serve \[options\]/);
    assert.match(text, /kill -USR2/);
    const bad = harness();
    assert.equal(await runCli(["servee"], {}, bad.io, bad.deps), 2);
  });
});

// ---- a real bundle with a fake daemon in the graph (ask A2) -------------------------------------------------------------------------

// A scratch copy of the repo's code (src, relay, pm, sdk) with a bridge/main.ts of its own, so the real
// scripts/build-local.mjs resolves the dynamic import the way it will when the real daemon exists.
async function scratchRoot(withBridge: boolean): Promise<string> {
  const root = await scratch("xo-cockpit-root-");
  await cp(join(ROOT, "src"), join(root, "src"), { recursive: true });
  await cp(join(ROOT, "relay"), join(root, "relay"), { recursive: true });
  await cp(join(ROOT, "pm"), join(root, "pm"), { recursive: true });
  await cp(join(ROOT, "sdk"), join(root, "sdk"), { recursive: true });
  await symlink(join(ROOT, "node_modules"), join(root, "node_modules"));
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
  if (withBridge) {
    await mkdir(join(root, "bridge"));
    await writeFile(
      join(root, "bridge", "main.ts"),
      `import { createServer } from "node:net";
import type { CockpitContext, CockpitHandle } from "../src/local/cli.js";

// FAKE-DAEMON-MARKER: a stand-in for the Cockpit daemon in a scratch root.
export async function startCockpit(ctx: CockpitContext): Promise<CockpitHandle> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  ctx.stderr.write("fake-daemon listening args=" + JSON.stringify(ctx.args) + " key=" + String(ctx.env["XO_MASTER_KEY"]) + "\\n");
  return { close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
`,
    );
  }
  return root;
}

interface Proc {
  readonly err: () => string;
  readonly out: () => string;
  signal(name: NodeJS.Signals): void;
  until(text: string, ms?: number): Promise<void>;
  closed: Promise<number | null>;
  stdin: NodeJS.WritableStream;
}

function run(bundle: string, args: string[], env: Record<string, string>): Proc {
  const child = spawn(process.execPath, [bundle, ...args], { env: { PATH: process.env["PATH"] ?? "", NO_COLOR: "1", ...env } });
  let err = "";
  let out = "";
  child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
  child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
  const closed = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
  const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
  void closed.then(() => clearTimeout(timer));
  return {
    err: () => err,
    out: () => out,
    signal: (name) => child.kill(name),
    async until(text, ms = 15_000) {
      const deadline = Date.now() + ms;
      while (!err.includes(text) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(err.includes(text), `timed out waiting for ${text}; stderr so far:\n${err}`);
    },
    closed,
    stdin: child.stdin,
  };
}

describe("a bundle with a daemon in its graph", () => {
  it("includes bridge/main in the dist/local.mjs inputs (and evaluates it only through serve)", async () => {
    const root = await scratchRoot(true);
    const result = await buildLocal({ root, outfile: join(root, "dist", "local.mjs"), metafile: true, logLevel: "silent" });
    const inputs = Object.keys(result.metafile.inputs);
    assert.ok(inputs.includes("bridge/main.ts"), inputs.filter((name) => !name.startsWith("node_modules")).join("\n"));
    assert.ok(inputs.includes("src/local/cli.ts"));
    const bundle = await readFile(join(root, "dist", "local.mjs"), "utf8");
    assert.ok(bundle.includes("fake-daemon listening"));
  });

  it("builds the same bytes twice, with or without the daemon", async () => {
    for (const withBridge of [true, false]) {
      const root = await scratchRoot(withBridge);
      await buildLocal({ root, outfile: join(root, "dist", "a.mjs"), logLevel: "silent" });
      await buildLocal({ root, outfile: join(root, "dist", "b.mjs"), logLevel: "silent" });
      assert.deepEqual(await readFile(join(root, "dist", "a.mjs")), await readFile(join(root, "dist", "b.mjs")));
    }
  });

  it("without bridge/main.ts the build succeeds and `serve` says there is no daemon (exit 1, nothing created)", async () => {
    const root = await scratchRoot(false);
    await buildLocal({ root, outfile: join(root, "dist", "local.mjs"), logLevel: "silent" });
    const home = await scratch("xo-cockpit-home-");
    const proc = run(join(root, "dist", "local.mjs"), ["serve"], { HOME: home, XO_DATA_DIR: join(home, "data") });
    assert.equal(await proc.closed, 1);
    assert.match(proc.err(), /this build has no Cockpit daemon/);
    assert.equal(proc.out(), "");
    assert.deepEqual(await readdir(home), []);
  });

  it("`serve` runs the daemon with the arguments, without the master key; SIGUSR2 engages the kill (audited); SIGTERM stops cleanly and releases the lock", async () => {
    const root = await scratchRoot(true);
    await buildLocal({ root, outfile: join(root, "dist", "local.mjs"), logLevel: "silent" });
    const home = await scratch("xo-cockpit-run-");
    const dataDir = join(home, "data");
    const proc = run(join(root, "dist", "local.mjs"), ["serve", "--agent-scope", "read"], { HOME: home, XO_DATA_DIR: dataDir, XO_MASTER_KEY: FRESH_KEY });
    await proc.until("fake-daemon listening");
    await proc.until("xo-market local mode");
    assert.match(proc.err(), /args=\["--agent-scope","read"\] key=undefined/);
    assert.ok(!proc.err().includes(FRESH_KEY));
    assert.equal(proc.out(), "", "stdout is not used");
    proc.signal("SIGUSR2");
    await proc.until("kill switch engaged by signal");
    assert.match(await readFile(join(dataDir, "logs", "audit.log"), "utf8"), /"KILL"/);
    proc.signal("SIGTERM");
    assert.equal(await proc.closed, 0);
    assert.ok(!(await readdir(dataDir)).includes("store.lock"));
  });

  it("the stdio server also takes SIGUSR2 (R6) and still stops when stdin ends", async () => {
    const root = await scratchRoot(true);
    await buildLocal({ root, outfile: join(root, "dist", "local.mjs"), logLevel: "silent" });
    const home = await scratch("xo-cockpit-stdio-");
    const dataDir = join(home, "data");
    const proc = run(join(root, "dist", "local.mjs"), [], { HOME: home, XO_DATA_DIR: dataDir });
    await proc.until("xo-market local mode");
    proc.signal("SIGUSR2");
    await proc.until("kill switch engaged by signal");
    assert.match(await readFile(join(dataDir, "logs", "audit.log"), "utf8"), /"KILL"/);
    assert.ok(!proc.err().includes("fake-daemon"), "the daemon is not evaluated unless `serve` runs");
    proc.stdin.end();
    assert.equal(await proc.closed, 0);
  });

  it("the real repository's bundle matches whether bridge/main.ts exists yet: in the graph when it does, a stub when not", async () => {
    const out = await scratch("xo-cockpit-real-");
    const result = await buildLocal({ root: ROOT, outfile: join(out, "local.mjs"), metafile: true, logLevel: "silent" });
    const inputs = Object.keys(result.metafile.inputs);
    assert.equal(inputs.includes("bridge/main.ts"), existsSync(join(ROOT, "bridge", "main.ts")));
  });
});

// ---- the `shim` subcommand: the stdio front for a running daemon ---------------------------------------------------------------------------

describe("the shim subcommand", () => {
  it("prints its own usage and exits 0 for --help, and lists itself in the main usage", async () => {
    const h = harness();
    assert.equal(await runCli(["shim", "--help"], {}, h.io, h.deps), 0);
    assert.match(h.out.join(""), /forwards an MCP client's tool calls to the running Cockpit daemon/);
    const main = harness();
    assert.equal(await runCli(["--help"], {}, main.io, main.deps), 0);
    assert.match(main.out.join(""), /shim \[options\]/);
  });

  it("refuses an unknown option with exit 2 and starts nothing", async () => {
    const h = harness();
    assert.equal(await runCli(["shim", "--set-flag", "ENABLE_TRADING=1"], {}, h.io, h.deps), 2);
    assert.equal(h.exits.length, 0);
  });

  it("--check with no daemon says so and exits 1, without creating the data directory", async () => {
    const dir = await scratch("xo-shim-check-");
    const data = join(dir, "never-created");
    const h = harness();
    assert.equal(await runCli(["shim", "--check", "--data-dir", data], {}, h.io, h.deps), 1);
    assert.match(h.out.join(""), /daemon_not_running|token_missing/);
    assert.equal(existsSync(data), false);
  });
});
