import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import type { CockpitContext } from "../../../src/local/cli.js";
import type { LocalRuntime, LocalStatus } from "../../../src/local/runtime.js";
import {
  CockpitStartError,
  DAEMON_INFO_FILE,
  OPTIONAL_MODULE_NAMES,
  loadOptionalModules,
  parseCockpitArgs,
  startCockpit,
  startCockpitDaemon,
  type CockpitDaemonHandle,
} from "../../main.js";
import { AGENT_TOKEN_FILE, COCKPIT_DIR_NAME } from "../../auth.js";
import { AGENT_TOKEN_PATTERN, bridgeErrorResponseSchema } from "../../contract.js";
import { defineRoute, json, type BridgeModule } from "../../server.js";
import { createStaticSite } from "../../static.js";
import { bearer, captureStderr, fakeClock, postJson, seededRandom, send, type Captured } from "./helpers.js";

const status: BridgeModule = {
  name: "status",
  routes: [defineRoute({ method: "GET", path: "/ui/status", access: { scope: "read" }, handler: (ctx) => json({ kind: ctx.principal?.kind, scopes: ctx.principal?.scopes }) })],
};
const modules = [{ name: "status", source: status }];

let dir: string;
let dataDir: string;
let build: string;
let handles: CockpitDaemonHandle[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cockpit-main-"));
  dataDir = join(dir, "data");
  build = join(dir, "build");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(build);
  await writeFile(join(build, "index.html"), "<!doctype html><title>cockpit</title>");
  handles = [];
});
afterEach(async () => {
  for (const handle of handles) await handle.close();
  await rm(dir, { recursive: true, force: true });
});

function readyStatus(): LocalStatus {
  return { state: "ready", dataDir, dataDirCreated: false, relay: {} as never, masterKey: null };
}
function lockedStatus(): LocalStatus {
  return { state: "failed", code: "data_dir_locked", message: "locked", dataDir };
}

function context(runtimeStatus: LocalStatus, args: readonly string[] = [], stderr: Captured = captureStderr(), kill: (reason: string) => Promise<boolean> = async () => true): CockpitContext {
  const runtime: LocalRuntime = {
    handler: async () => ({ status: 200, bodyText: "{}" }),
    status: () => runtimeStatus,
    start: async () => runtimeStatus,
    close: async () => undefined,
  };
  return { args, env: {}, runtime, version: "0.0.0-test", stderr, engageKill: kill };
}

async function boot(ctx: CockpitContext, extra: Parameters<typeof startCockpitDaemon>[1] = {}): Promise<CockpitDaemonHandle> {
  const handle = await startCockpitDaemon(ctx, { modules, site: createStaticSite(build), clock: fakeClock(), random: seededRandom("main"), ...extra });
  handles.push(handle);
  return handle;
}

function tokenIn(text: string): string {
  const match = /NEW AGENT TOKEN[^\n]*\n\s+(cka_[A-Za-z0-9_-]{43})/.exec(text);
  assert.ok(match, "a new agent token is printed");
  return match[1] as string;
}

describe("arguments of `serve`", () => {
  it("defaults to a random port, read + prepare for the agent, no rotation, the built-in app dir", () => {
    assert.deepEqual(parseCockpitArgs([]), { agentScopes: ["read", "prepare"], rotateAgentToken: false, appDir: undefined, port: 0 });
  });
  it("reads every option in both spellings", () => {
    const abs = join(tmpdir(), "x");
    assert.deepEqual(parseCockpitArgs(["--agent-scope", "read,prepare,submit", "--rotate-agent-token", "--app-dir", abs, "--port", "48123"]), {
      agentScopes: ["read", "prepare", "submit"],
      rotateAgentToken: true,
      appDir: abs,
      port: 48123,
    });
    assert.deepEqual(parseCockpitArgs([`--agent-scope=read`, `--app-dir=${abs}`, "--port=40000"]), { agentScopes: ["read"], rotateAgentToken: false, appDir: abs, port: 40000 });
  });
  it("refuses anything it does not know, instead of ignoring it", () => {
    for (const bad of [
      ["--unknown"],
      ["serve"],
      ["--agent-scope"],
      ["--agent-scope", "admin"],
      ["--agent-scope", "--rotate-agent-token"],
      ["--app-dir", "relative/dir"],
      ["--port", "80"],
      ["--port", "70000"],
      ["--port", "abc"],
      ["--port"],
      ["--rotate-agent-token=1"],
      ["--set-flag", "ENABLE_TRADING=1"],
    ]) {
      assert.throws(() => parseCockpitArgs(bad), /./, JSON.stringify(bad));
    }
  });
});

describe("a writer instance", () => {
  it("listens on loopback, prints its state, the agent token once and the pairing link, and keeps only a hash", async () => {
    const stderr = captureStderr();
    const handle = await boot(context(readyStatus(), [], stderr));
    const port = handle.daemon.port;
    const text = stderr.text();
    assert.match(text, new RegExp(`listening on http://127\\.0\\.0\\.1:${port} \\(loopback only`));
    assert.match(text, /mode:   writer/);
    assert.match(text, new RegExp(`#pair=[0-9a-f]{32}`));
    const token = tokenIn(text);
    assert.match(token, AGENT_TOKEN_PATTERN);
    const cockpit = join(dataDir, COCKPIT_DIR_NAME);
    const stored = await readFile(join(cockpit, AGENT_TOKEN_FILE), "utf8");
    assert.equal(stored.includes(token), false);
    assert.equal(stored.includes(createHash("sha256").update(token).digest("hex")), true);
    // the agent token works with the default ceiling
    const reply = await send({ port, path: "/ui/status", headers: bearer(token) });
    assert.deepEqual(reply.json(), { kind: "agent", scopes: ["read", "prepare"] });
  });
  it("never writes to stdout", async () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await boot(context(readyStatus()));
    } finally {
      process.stdout.write = original;
    }
    assert.deepEqual(written, []);
  });
  it("writes daemon.json (no secret) and removes it on close", async () => {
    const handle = await boot(context(readyStatus()));
    const file = join(dataDir, COCKPIT_DIR_NAME, DAEMON_INFO_FILE);
    const info = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(info).sort(), ["pid", "port", "started_at", "version"]);
    assert.equal(info["port"], handle.daemon.port);
    assert.equal(info["pid"], process.pid);
    if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o600);
    await handle.close();
    await assert.rejects(stat(file));
    assert.deepEqual((await readdir(join(dataDir, COCKPIT_DIR_NAME))).filter((name) => name.startsWith("daemon")), []);
  });
  it("keeps the stored agent token on restart without printing it again, and rotates on request", async () => {
    const first = captureStderr();
    const firstHandle = await boot(context(readyStatus(), [], first));
    const token = tokenIn(first.text());
    await firstHandle.close();

    const second = captureStderr();
    const secondHandle = await boot(context(readyStatus(), [], second), { random: seededRandom("restart") });
    assert.equal(/NEW AGENT TOKEN/.test(second.text()), false);
    assert.match(second.text(), /stored agent token is in use/);
    assert.equal((await send({ port: secondHandle.daemon.port, path: "/ui/status", headers: bearer(token) })).status, 200);
    await secondHandle.close();

    const third = captureStderr();
    const thirdHandle = await boot(context(readyStatus(), ["--rotate-agent-token"], third), { random: seededRandom("rotate") });
    const rotated = tokenIn(third.text());
    assert.notEqual(rotated, token);
    assert.equal((await send({ port: thirdHandle.daemon.port, path: "/ui/status", headers: bearer(token) })).status, 401, "the old token is dead");
    assert.equal((await send({ port: thirdHandle.daemon.port, path: "/ui/status", headers: bearer(rotated) })).status, 200);
  });
  it("applies --agent-scope as the agent token's ceiling", async () => {
    const stderr = captureStderr();
    const handle = await boot(context(readyStatus(), ["--agent-scope", "read"], stderr));
    const reply = await send({ port: handle.daemon.port, path: "/ui/status", headers: bearer(tokenIn(stderr.text())) });
    assert.deepEqual(reply.json(), { kind: "agent", scopes: ["read"] });
    assert.match(stderr.text(), /ceiling scopes: read\n/);
  });
  it("says a submit ceiling still needs an open ARM window", async () => {
    const stderr = captureStderr();
    await boot(context(readyStatus(), ["--agent-scope", "read,prepare,submit"], stderr));
    assert.match(stderr.text(), /ceiling scopes: read, prepare, submit \(a submit also needs an open ARM window\)/);
  });
  it("pairs a page end to end and serves the app", async () => {
    const stderr = captureStderr();
    const handle = await boot(context(readyStatus(), [], stderr));
    const code = /#pair=([0-9a-f]{32})/.exec(stderr.text())?.[1] ?? "";
    const pair = await postJson(handle.daemon.port, "/ui/pair", { code });
    assert.equal(pair.status, 200);
    const page = await send({ port: handle.daemon.port, path: "/", headers: { accept: "text/html" } });
    assert.match(page.text, /<title>cockpit<\/title>/);
  });
  it("uses a fixed port when asked to", async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const free = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const handle = await boot(context(readyStatus(), ["--port", String(free)]));
    assert.equal(handle.daemon.port, free);
  });
  it("hands the kill switch through, and says false when it throws", async () => {
    const reasons: string[] = [];
    const handle = await boot(context(readyStatus(), [], captureStderr(), async (reason) => (reasons.push(reason), true)));
    assert.equal(await handle.daemon.host.engageKill("button"), true);
    assert.deepEqual(reasons, ["button"]);
    const broken = await boot(context(readyStatus(), [], captureStderr(), async () => {
      throw new Error("down");
    }));
    assert.equal(await broken.daemon.host.engageKill("button"), false);
  });
  it("tells the user when the app is not built, and still starts", async () => {
    const stderr = captureStderr();
    const handle = await boot(context(readyStatus(), [], stderr), { site: createStaticSite(join(dir, "missing-build")) });
    assert.match(stderr.text(), /app is not built/);
    assert.equal((await send({ port: handle.daemon.port, path: "/", headers: { accept: "text/html" } })).status, 404);
  });
  it("reports that no MCP endpoint is registered yet", async () => {
    const stderr = captureStderr();
    await boot(context(readyStatus(), [], stderr));
    assert.match(stderr.text(), /no MCP endpoint in this build/);
  });
});

describe("M1-8: a second process on the same data directory serves reads only and says so", () => {
  it("is read only: says why, makes no files, mints read-scope tokens and refuses the rest", async () => {
    const stderr = captureStderr();
    const handle = await boot(context(lockedStatus(), ["--rotate-agent-token", "--agent-scope", "read,prepare,submit"], stderr));
    const text = stderr.text();
    assert.equal(handle.role, "read_only");
    assert.match(text, /mode:   READ ONLY: another xo-market process owns the data directory, so this one serves reads only/);
    assert.match(text, /Nothing can be prepared or sent from here/);
    assert.match(text, /--rotate-agent-token ignored/);
    assert.equal(/NEW AGENT TOKEN/.test(text), false);
    assert.deepEqual(await readdir(dataDir), [], "nothing was written to the data directory");
    const code = /#pair=([0-9a-f]{32})/.exec(text)?.[1] ?? "";
    const pair = await postJson(handle.daemon.port, "/ui/pair", { code });
    assert.deepEqual((pair.json() as { scopes: string[] }).scopes, ["read"]);
    const token = (pair.json() as { token: string }).token;
    assert.deepEqual((await send({ port: handle.daemon.port, path: "/ui/status", headers: bearer(token) })).json(), { kind: "ui", scopes: ["read"] });
  });
  it("accepts the writer's stored agent token with the read scope only", async () => {
    const writerErr = captureStderr();
    const writer = await boot(context(readyStatus(), ["--agent-scope", "read,prepare,submit"], writerErr));
    const token = tokenIn(writerErr.text());
    const reader = await boot(context(lockedStatus(), ["--agent-scope", "read,prepare,submit"]));
    assert.deepEqual((await send({ port: reader.daemon.port, path: "/ui/status", headers: bearer(token) })).json(), { kind: "agent", scopes: ["read"] });
    assert.deepEqual((await send({ port: writer.daemon.port, path: "/ui/status", headers: bearer(token) })).json(), { kind: "agent", scopes: ["read", "prepare", "submit"] });
    // the reader wrote no daemon.json of its own and did not touch the writer's
    const info = JSON.parse(await readFile(join(dataDir, COCKPIT_DIR_NAME, DAEMON_INFO_FILE), "utf8")) as { port: number };
    assert.equal(info.port, writer.daemon.port);
    await reader.close();
    assert.equal(JSON.parse(await readFile(join(dataDir, COCKPIT_DIR_NAME, DAEMON_INFO_FILE), "utf8")).port, writer.daemon.port);
  });
  it("does the same when the relay failed for another reason or there is no data directory", async () => {
    const stderr = captureStderr();
    const handle = await boot(context({ state: "failed", code: "wrong_master_key", message: "x", dataDir: null }, [], stderr));
    assert.equal(handle.role, "read_only");
    assert.match(stderr.text(), /the local relay did not start \(wrong_master_key\), so this instance serves reads only/);
    assert.deepEqual(await readdir(dataDir), []);
  });
  it("turns to read only if the relay stops being ready", async () => {
    let current: LocalStatus = readyStatus();
    const stderr = captureStderr();
    const ctx = context(current, [], stderr);
    const runtime: LocalRuntime = { ...ctx.runtime, status: () => current };
    const handle = await boot({ ...ctx, runtime });
    const code = /#pair=([0-9a-f]{32})/.exec(stderr.text())?.[1] ?? "";
    const token = (await postJson(handle.daemon.port, "/ui/pair", { code })).json() as { token: string };
    assert.deepEqual((await send({ port: handle.daemon.port, path: "/ui/status", headers: bearer(token.token) })).json(), { kind: "ui", scopes: ["read", "prepare"] });
    current = lockedStatus();
    assert.deepEqual((await send({ port: handle.daemon.port, path: "/ui/status", headers: bearer(token.token) })).json(), { kind: "ui", scopes: ["read"] });
  });
});

describe("start failures", () => {
  it("refuses bad options with a message on stderr, a coded error, and nothing listening or written", async () => {
    const stderr = captureStderr();
    await assert.rejects(boot(context(readyStatus(), ["--agent-scope", "admin"], stderr)), (error: unknown) => error instanceof CockpitStartError && error.code === "usage");
    assert.match(stderr.text(), /^error: The scope list must name only/);
    assert.equal(/listening/.test(stderr.text()), false);
    assert.deepEqual(await readdir(dataDir), []);
  });
  it("stops, with the module's name but not its message, when a route module throws", async () => {
    const stderr = captureStderr();
    const boom = { name: "boom", source: () => { throw new Error("a request body was here"); } };
    await assert.rejects(boot(context(readyStatus(), [], stderr), { modules: [boom] }), (error: unknown) => error instanceof CockpitStartError && error.code === "module_failed" && !error.message.includes("request body"));
    assert.match(stderr.text(), /could not start \(module_failed: boom\)/);
    assert.equal(stderr.text().includes("request body"), false);
  });
  it("stops when a route is not in the contract", async () => {
    const stderr = captureStderr();
    const bad = { name: "bad", source: { name: "bad", routes: [defineRoute({ method: "GET", path: "/ui/secret", access: { scope: "read" }, handler: () => json({}) })] } };
    await assert.rejects(boot(context(readyStatus(), [], stderr), { modules: [bad] }), (error: unknown) => error instanceof CockpitStartError && error.code === "route_invalid");
  });
  it("stops when the port is taken", async () => {
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, "127.0.0.1", resolve));
    const port = (taken.address() as { port: number }).port;
    try {
      await assert.rejects(boot(context(readyStatus(), ["--port", String(port)])), (error: unknown) => error instanceof CockpitStartError && error.code === "listen_failed");
    } finally {
      await new Promise<void>((resolve) => taken.close(() => resolve()));
    }
  });
});

describe("optional route modules", () => {
  let fixtures: string;
  beforeEach(async () => {
    fixtures = join(dir, "fixtures");
    await mkdir(fixtures);
  });
  const load = (name: string, file: string) => ({ name, load: () => import(pathToFileURL(file).href) });

  it("skips a module whose file is absent and one with no bridgeModule export, and loads the rest in order", async () => {
    await writeFile(join(fixtures, "first.mjs"), "export const bridgeModule = { name: 'first' };\n");
    await writeFile(join(fixtures, "second.mjs"), "export const bridgeModule = () => ({ name: 'second' });\n");
    await writeFile(join(fixtures, "library.mjs"), "export const helper = 1;\n");
    const loaded = await loadOptionalModules([
      load("proxy", join(fixtures, "missing", "proxy.mjs")),
      load("first", join(fixtures, "first.mjs")),
      load("library", join(fixtures, "library.mjs")),
      load("second", join(fixtures, "second.mjs")),
    ]);
    assert.deepEqual(loaded.map((entry) => entry.name), ["first", "second"]);
  });
  it("stops on a module that is present but fails to load, or whose own import is missing", async () => {
    await writeFile(join(fixtures, "syntax.mjs"), "export const = ;\n");
    await writeFile(join(fixtures, "needs-missing.mjs"), "import './gone.mjs';\nexport const bridgeModule = { name: 'x' };\n");
    await assert.rejects(loadOptionalModules([load("syntax", join(fixtures, "syntax.mjs"))]), (error: unknown) => error instanceof CockpitStartError && error.code === "module_load_failed");
    await assert.rejects(loadOptionalModules([load("needs-missing", join(fixtures, "needs-missing.mjs"))]), (error: unknown) => error instanceof CockpitStartError && error.code === "module_load_failed");
  });
  it("lists the files the other bridge streams own, audit adapter first", () => {
    assert.deepEqual(OPTIONAL_MODULE_NAMES, ["audit-adapter", "tool-classes", "arming", "kill", "proxy", "events", "status", "inbox", "paybox-signer"]);
  });
  it("discovers whatever of those files exist in this checkout without throwing", async () => {
    const found = await loadOptionalModules();
    for (const entry of found) assert.ok(OPTIONAL_MODULE_NAMES.includes(entry.name));
  });
  it("exports startCockpit with the shape src/local/cli.ts calls", async () => {
    const stderr = captureStderr();
    const handle = await startCockpit(context(readyStatus(), [], stderr));
    assert.equal(typeof handle.close, "function");
    await handle.close();
    await handle.close();
  });
});

describe("stderr hygiene", () => {
  it("quotes no request text, token or pairing code beyond the one link and the one agent token", async () => {
    const stderr = captureStderr();
    const handle = await boot(context(readyStatus(), [], stderr));
    const before = stderr.text();
    const code = /#pair=([0-9a-f]{32})/.exec(before)?.[1] ?? "";
    const token = tokenIn(before);
    const pair = await postJson(handle.daemon.port, "/ui/pair", { code });
    const ui = (pair.json() as { token: string }).token;
    await send({ port: handle.daemon.port, path: "/ui/nothing", headers: bearer(ui) });
    await postJson(handle.daemon.port, "/ui/pair", { code: "9".repeat(32) });
    const after = stderr.text().slice(before.length);
    assert.equal(after.includes(code), false);
    assert.equal(after.includes(ui), false);
    assert.equal(after.includes(token), false);
    assert.equal(bridgeErrorResponseSchema.safeParse((await send({ port: handle.daemon.port, path: "/ui/status" })).json()).success, true);
  });
});
