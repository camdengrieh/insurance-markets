import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

// scripts/build-local.mjs is the `pnpm build:local` command; the tests build with the same function.
const { buildLocal } = (await import(pathToFileURL(fileURLToPath(new URL("../scripts/build-local.mjs", import.meta.url))).href)) as {
  buildLocal(options: { outfile: string; metafile?: boolean; logLevel?: "silent" | "warning" }): Promise<{ metafile: { inputs: Record<string, unknown> } }>;
};

// dist/local.mjs, built here into a scratch directory (never into dist/), run in fresh processes with a
// stripped environment: the start-up block, the tool list and how fast it comes, the data directory it
// leaves behind, two processes on one directory, and shutdown. Also the other direction: the hosted
// plugin bundle must not be able to reach the local mode or the relay, and must still pass the PayBox
// starter's conformance check. No network is used: the one relay-backed tool called is an offline read.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRATCH: string[] = [];
let localBundle = "";
let pluginBundle = "";

async function scratch(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  SCRATCH.push(dir);
  return dir;
}

// The same options as `pnpm build` (the hosted plugin). The local bundle goes through scripts/build-local.mjs.
async function bundle(entry: string, outfile: string): Promise<string> {
  if (entry === "src/local.ts") {
    await buildLocal({ outfile, logLevel: "silent" });
    return outfile;
  }
  await build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    minify: true,
    outfile,
    logLevel: "silent",
  });
  return outfile;
}

const sha = async (path: string): Promise<string> => createHash("sha256").update(await readFile(path)).digest("hex");

before(async () => {
  const dir = await scratch("xo-local-bundle-");
  localBundle = await bundle("src/local.ts", join(dir, "local.mjs"));
  pluginBundle = await bundle("src/plugin.ts", join(dir, "plugin.mjs"));
});
after(async () => {
  for (const dir of SCRATCH.splice(0)) await rm(dir, { recursive: true, force: true });
});

interface CallLocal {
  (bundlePath: string, requests: Array<{ method: string; params: unknown }>, options?: Record<string, unknown>): Promise<{
    answers: Array<{ result?: Record<string, unknown>; error?: { message: string } }>;
    initialize?: { result?: { protocolVersion?: string; serverInfo?: { name?: string } } };
    logs: string;
    home: string;
    ms: number;
  }>;
}

async function callLocal(): Promise<CallLocal> {
  const module = (await import(pathToFileURL(join(ROOT, "scripts", "call-local.mjs")).href)) as { callLocal: CallLocal };
  return module.callLocal;
}

const toolNames = (answer: { result?: Record<string, unknown> }): string[] => ((answer.result?.["tools"] as Array<{ name: string }>) ?? []).map((tool) => tool.name).sort();

describe("the two bundles", () => {
  it("builds the same bytes every time", async () => {
    const dir = await scratch("xo-local-bundle-twice-");
    const again = await bundle("src/local.ts", join(dir, "local.mjs"));
    assert.equal(await sha(again), await sha(localBundle));
    const plugin = await bundle("src/plugin.ts", join(dir, "plugin.mjs"));
    assert.equal(await sha(plugin), await sha(pluginBundle));
  });

  it("keeps the local mode and the relay out of the hosted plugin: nothing the plugin imports reaches them, and its bundle has no file, socket or process access", async () => {
    const graph = new Set<string>();
    const visit = async (file: string): Promise<void> => {
      if (graph.has(file)) return;
      graph.add(file);
      const text = await readFile(join(ROOT, file), "utf8");
      for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
        const target = relative(ROOT, resolve(dirname(join(ROOT, file)), (match[1] as string).replace(/\.js$/, ".ts"))).split("\\").join("/");
        await visit(target);
      }
    };
    await visit("src/plugin.ts");
    assert.ok(graph.size > 40, "the walk found the plugin's files");
    const forbidden = [...graph].filter((file) => file === "src/local.ts" || file.startsWith("src/local/") || file.startsWith("relay/") || file.startsWith("bridge/"));
    assert.deepEqual(forbidden, []);
    const text = await readFile(pluginBundle, "utf8");
    for (const word of ["node:fs", "node:http", "node:net", "node:child_process", "master.key", "store.lock", "XO_DATA_DIR", "XO_MASTER_KEY"]) {
      assert.ok(!text.includes(word), `dist/plugin.mjs mentions ${word}`);
    }
    // The other direction, so the walk is not vacuous: the local entry does reach the relay.
    const local = new Set<string>();
    const visitLocal = async (file: string): Promise<void> => {
      if (local.has(file)) return;
      // bridge/main.ts is imported dynamically and may not exist yet (the build then uses an empty stub).
      if (!existsSync(join(ROOT, file))) return;
      local.add(file);
      const text2 = await readFile(join(ROOT, file), "utf8");
      for (const match of text2.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
        await visitLocal(relative(ROOT, resolve(dirname(join(ROOT, file)), (match[1] as string).replace(/\.js$/, ".ts"))).split("\\").join("/"));
      }
    };
    await visitLocal("src/local.ts");
    assert.ok(local.has("relay/embedded.ts") && local.has("relay/main.ts"));
  });

  it("the hosted plugin bundle's real input list (esbuild metafile) has nothing from bridge/, relay/ or the local mode, and the Cockpit's code is not in its text", async () => {
    const dir = await scratch("xo-local-meta-");
    const result = await build({
      entryPoints: [join(ROOT, "src/plugin.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      minify: true,
      outfile: join(dir, "plugin.mjs"),
      metafile: true,
      logLevel: "silent",
    });
    const inputs = Object.keys(result.metafile.inputs);
    assert.ok(inputs.length > 40 && inputs.includes("src/plugin.ts"));
    assert.deepEqual(
      inputs.filter((file) => file.startsWith("bridge/") || file.startsWith("relay/") || file.startsWith("src/local/") || file === "src/local.ts" || file.startsWith("app/")),
      [],
    );
    const text = await readFile(join(dir, "plugin.mjs"), "utf8");
    for (const word of ["startCockpit", "ui/arm", "ui/pair", "ui/kill", "agent-scope"]) assert.ok(!text.includes(word), `dist/plugin.mjs mentions ${word}`);
  });

  it("the local bundle's input list holds the daemon exactly when bridge/main.ts exists, and always the relay", async () => {
    const dir = await scratch("xo-local-meta2-");
    const result = await buildLocal({ outfile: join(dir, "local.mjs"), metafile: true, logLevel: "silent" });
    const inputs = Object.keys(result.metafile.inputs);
    assert.ok(inputs.includes("relay/embedded.ts"));
    assert.equal(inputs.some((file) => file.startsWith("bridge/")), existsSync(join(ROOT, "bridge", "main.ts")));
  });

  it("still passes the PayBox starter conformance check (run on the freshly built plugin bundle, in a scratch root)", async () => {
    const root = await scratch("xo-local-conformance-");
    await mkdir(join(root, "dist"));
    await copyFile(pluginBundle, join(root, "dist", "plugin.mjs"));
    await copyFile(join(ROOT, "paybox-plugin.json"), join(root, "paybox-plugin.json"));
    const result = await new Promise<{ code: number | null; out: string }>((resolveRun) => {
      const child = spawn(process.execPath, [join(ROOT, "scripts", "conformance.mjs")], { cwd: root, env: { PATH: process.env["PATH"] ?? "", HOME: root, NO_COLOR: "1" } });
      let out = "";
      child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
      child.on("close", (code) => resolveRun({ code, out }));
    });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /passed/);
  });

  it("contains no personal identifier and no home-directory path", async () => {
    const text = await readFile(localBundle, "utf8");
    const handle = ["cam", "den", "grieh"].join("");
    assert.ok(!new RegExp(handle, "i").test(text));
    assert.ok(!/\/(?:Users|home)\/(?!example\b)[A-Za-z][\w.-]*\//.test(text.replace(/\/Users\/\*|\/home\/\*/g, "")), "a home directory path is baked in");
    assert.ok(!/claude-\d{2,}/.test(text) && !text.includes(["", "private", "tmp", ""].join("/")));
    assert.ok(text.includes("insurance-markets-xo-plugin/0.2"), "the fixed User-Agent is the only identity");
  });
});

describe("running dist/local.mjs in a fresh process with an empty environment", () => {
  it("answers the standard handshake and lists the same tools as the hosted plugin, quickly, with the start-up block on stderr", async () => {
    const call = await callLocal();
    const local = await call(localBundle, [{ method: "tools/list", params: {} }], { env: { XO_DATA_DIR: null }, waitFor: "xo-market local mode" });
    assert.equal(local.initialize?.result?.serverInfo?.name, "xo-market");
    const names = toolNames(local.answers[0] as never);
    // The hosted bundle registers the write tools only when a relay URL is set (the 256 KiB tools/list limit).
    const hosted = await call(pluginBundle, [{ method: "tools/list", params: {} }], { modern: true, env: { XO_DATA_DIR: null, XO_RELAY_URL: "http://127.0.0.1:9" } });
    assert.deepEqual(names, toolNames(hosted.answers[0] as never), "one tool set in two modes");
    assert.ok(names.length >= 21);
    // The tool list does not wait for the relay: process start, handshake and list in well under 3 s.
    assert.ok(local.ms < 3_000, `took ${local.ms} ms`);
    assert.match(local.logs, /xo-market local mode 0\.2\.0/);
    assert.match(local.logs, /xo-market-plugin/);
    assert.ok(local.logs.includes(local.home), "the default data directory is under the home it was given");
    assert.match(local.logs, /all write paths are OFF/);
    assert.match(local.logs, /advisory against a compromised or prompt-injected agent/);
    assert.match(local.logs, /dedicated PayBox credential/);
    assert.match(local.logs, /approval-gated signing/);
    assert.ok(!/error/i.test(local.logs), local.logs);
  });

  it("also answers the stateless form the PayBox runner uses", async () => {
    const call = await callLocal();
    const result = await call(localBundle, [{ method: "tools/list", params: {} }], { modern: true, env: { XO_DATA_DIR: null } });
    assert.ok(toolNames(result.answers[0] as never).length >= 21);
  });

  it("leaves a private data directory and a key that appears nowhere else", async () => {
    const call = await callLocal();
    let report: { modes: Record<string, string>; key: string } | undefined;
    const result = await call(localBundle, [{ method: "tools/call", params: { name: "xo_order_status", arguments: { order_hash: `0x${"cd".repeat(32)}` } } }], {
      waitFor: "xo-market local mode",
      keepData: true,
      env: {},
    });
    const answer = result.answers[0];
    assert.equal(answer?.result?.["isError"] === true, false, JSON.stringify(answer));
    assert.match(JSON.stringify(answer), /no_record/);
    const dataDir = join(result.home, "data");
    try {
      const modes: Record<string, string> = {};
      const walk = async (rel: string): Promise<void> => {
        for (const entry of await readdir(join(dataDir, rel), { withFileTypes: true })) {
          const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
          modes[path] = ((await stat(join(dataDir, path))).mode & 0o777).toString(8);
          if (entry.isDirectory()) await walk(path);
        }
      };
      await walk("");
      report = { modes, key: (await readFile(join(dataDir, "master.key"), "utf8")).trim() };
      if (process.platform !== "win32") {
        assert.equal((await stat(dataDir)).mode & 0o777, 0o700);
        for (const [path, mode] of Object.entries(report.modes)) {
          const directory = (await stat(join(dataDir, path))).isDirectory();
          assert.equal(mode, directory ? "700" : "600", `${path} has mode ${mode}`);
        }
      }
      assert.match(report.key, /^[0-9a-f]{64}$/);
      assert.ok(!result.logs.includes(report.key), "the key is not on stderr");
      assert.ok(!JSON.stringify(result.answers).includes(report.key), "the key is not on stdout");
      for (const [path] of Object.entries(report.modes)) {
        if (path === "master.key" || (await stat(join(dataDir, path))).isDirectory()) continue;
        assert.ok(!(await readFile(join(dataDir, path))).includes(Buffer.from(report.key)), `${path} holds the key`);
      }
      assert.ok(Object.keys(report.modes).includes("secrets/keyring.json"));
    } finally {
      await rm(result.home, { recursive: true, force: true });
    }
  });

  it("refuses to write into a hosted-style home that has no usable data directory, and still lists the tools", async () => {
    const call = await callLocal();
    const result = await call(localBundle, [{ method: "tools/list", params: {} }], { env: { XO_DATA_DIR: "relative/dir" }, waitFor: "could not start its relay" });
    assert.ok(toolNames(result.answers[0] as never).length >= 21);
    assert.match(result.logs, /could not start its relay: XO_DATA_DIR must be an absolute path/);
    const status = await call(localBundle, [{ method: "tools/call", params: { name: "xo_order_status", arguments: { order_hash: `0x${"cd".repeat(32)}` } } }], { env: { XO_DATA_DIR: "relative/dir" } });
    const text = JSON.stringify(status.answers[0]);
    assert.match(text, /precondition_failed|not running/);
  });
});

describe("one data directory, one process", () => {
  interface Running {
    readonly child: ChildProcessWithoutNullStreams;
    stderr(): string;
    request(message: Record<string, unknown>): Promise<Record<string, unknown>>;
    stop(): Promise<number | null>;
  }

  function start(env: Record<string, string>): Running {
    const child = spawn(process.execPath, [localBundle], { env: { PATH: process.env["PATH"] ?? "", NO_COLOR: "1", ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    let out = "";
    const waiting = new Map<number, (message: Record<string, unknown>) => void>();
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      for (;;) {
        const newline = out.indexOf("\n");
        if (newline < 0) break;
        const line = out.slice(0, newline);
        out = out.slice(newline + 1);
        const message = JSON.parse(line) as Record<string, unknown>;
        const resolveWaiting = waiting.get(Number(message["id"]));
        if (resolveWaiting !== undefined) resolveWaiting(message);
      }
    });
    let nextId = 1;
    const exited = new Promise<number | null>((resolveExit) => child.on("close", (code) => resolveExit(code)));
    return {
      child,
      stderr: () => err,
      request: (message) =>
        new Promise((resolveRequest) => {
          const id = nextId++;
          waiting.set(id, resolveRequest);
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...message })}\n`);
        }),
      async stop() {
        child.stdin.end();
        const timer = setTimeout(() => child.kill("SIGKILL"), 8_000);
        const code = await exited;
        clearTimeout(timer);
        return code;
      },
    };
  }

  async function until(check: () => boolean, ms = 10_000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!check() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 20));
    assert.ok(check(), "timed out waiting");
  }

  it("a second process on the same directory says why it cannot write, still serves the tool list, and the first is unharmed; both stop cleanly and release the lock", async () => {
    const home = await scratch("xo-local-two-");
    const env = { HOME: home, XO_DATA_DIR: join(home, "data") };
    const first = start(env);
    const init = (running: Running) => running.request({ method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } });
    await init(first);
    first.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    await until(() => first.stderr().includes("xo-market local mode"));
    const second = start(env);
    await init(second);
    second.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    await until(() => second.stderr().includes("could not start its relay"));
    assert.match(second.stderr(), /Another xo-market process is already using this data directory/);
    const listed = await second.request({ method: "tools/list", params: {} });
    assert.ok(((listed["result"] as { tools: unknown[] }).tools.length) >= 21);
    const refused = await second.request({ method: "tools/call", params: { name: "xo_order_status", arguments: { order_hash: `0x${"cd".repeat(32)}` } } });
    assert.match(JSON.stringify(refused), /not running|precondition_failed/);
    const fine = await first.request({ method: "tools/call", params: { name: "xo_order_status", arguments: { order_hash: `0x${"cd".repeat(32)}` } } });
    assert.match(JSON.stringify(fine), /no_record/);
    assert.equal(await second.stop(), 0);
    assert.ok((await readdir(join(home, "data"))).includes("store.lock"), "the first process still holds the directory");
    assert.equal(await first.stop(), 0);
    assert.ok(!(await readdir(join(home, "data"))).includes("store.lock"), "the lock is released on a clean stop");
  });

  it("stops on SIGTERM too, with exit code 0, and releases the lock", async () => {
    const home = await scratch("xo-local-term-");
    const running = start({ HOME: home, XO_DATA_DIR: join(home, "data") });
    await until(() => running.stderr().includes("xo-market local mode"));
    running.child.kill("SIGTERM");
    const code = await new Promise<number | null>((done) => running.child.on("close", (value) => done(value)));
    assert.equal(code, 0);
    assert.ok(!(await readdir(join(home, "data"))).includes("store.lock"));
  });
});

describe("the one-shot commands", () => {
  async function run(args: string[], env: Record<string, string>): Promise<{ code: number | null; out: string; err: string }> {
    return new Promise((resolveRun) => {
      const child = spawn(process.execPath, [localBundle, ...args], { env: { PATH: process.env["PATH"] ?? "", NO_COLOR: "1", ...env } });
      let out = "";
      let err = "";
      child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf8")));
      child.on("close", (code) => resolveRun({ code, out, err }));
    });
  }

  it("--help and --version print and exit 0", async () => {
    const help = await run(["--help"], {});
    assert.equal(help.code, 0);
    for (const word of ["XO_DATA_DIR", "XO_MASTER_KEY", "XO_OWNER", "rotate-master-key", "advisory"]) assert.ok(help.out.includes(word), word);
    assert.deepEqual([(await run(["--version"], {})).out.trim(), (await run(["bogus"], {})).code], ["0.2.0", 2]);
  });

  it("check says what would be used and creates nothing", async () => {
    const home = await scratch("xo-local-check-");
    const result = await run(["check"], { HOME: home, XO_DATA_DIR: join(home, "data"), ENABLE_TRADING: "1" });
    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /will be created, mode 0700/);
    assert.match(result.out, /a key file will be created/);
    assert.match(result.out, /write flags on: ENABLE_TRADING/);
    assert.deepEqual(await readdir(home), [], "check wrote nothing");
    const bad = await run(["check"], { HOME: home, XO_DATA_DIR: join(home, "data"), XO_OWNER: "nonsense-value" });
    assert.equal(bad.code, 2);
    assert.ok(!bad.err.includes("nonsense-value"));
  });

  it("rotate-master-key re-seals under a new key and the server then starts with it", async () => {
    const home = await scratch("xo-local-rotate-");
    const env = { HOME: home, XO_DATA_DIR: join(home, "data") };
    // Run the server once so the data directory and its key exist.
    const first = spawn(process.execPath, [localBundle], { env: { PATH: process.env["PATH"] ?? "", ...env } });
    let banner = "";
    first.stderr.on("data", (chunk: Buffer) => (banner += chunk.toString("utf8")));
    const deadline = Date.now() + 10_000;
    while (!banner.includes("xo-market local mode") && Date.now() < deadline) await new Promise((done) => setTimeout(done, 20));
    first.stdin.end();
    await new Promise((done) => first.on("close", done));
    const before = (await readFile(join(home, "data", "master.key"), "utf8")).trim();
    const rotated = await run(["rotate-master-key"], env);
    assert.equal(rotated.code, 0, rotated.err);
    assert.match(rotated.out, /Re-sealed 0 secret\(s\) for 0 account\(s\)/);
    const after = (await readFile(join(home, "data", "master.key"), "utf8")).trim();
    assert.notEqual(after, before);
    assert.ok(!rotated.out.includes(after) && !rotated.out.includes(before) && !rotated.err.includes(after));
    // The rotated directory starts again.
    const second = spawn(process.execPath, [localBundle], { env: { PATH: process.env["PATH"] ?? "", ...env } });
    let again = "";
    second.stderr.on("data", (chunk: Buffer) => (again += chunk.toString("utf8")));
    const deadline2 = Date.now() + 10_000;
    while (!again.includes("xo-market local mode") && Date.now() < deadline2) await new Promise((done) => setTimeout(done, 20));
    second.stdin.end();
    await new Promise((done) => second.on("close", done));
    assert.match(again, /xo-market local mode 0\.2\.0/);
    assert.ok(!again.includes("created now"));
  });
});
