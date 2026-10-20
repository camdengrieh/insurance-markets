import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DAEMON_INFO_FILE } from "../../main.js";
import {
  DAEMON_INFO_FILENAME,
  discoverDaemon,
  parseLoopbackOrigin,
  parseShimArgs,
  runShimCli,
  scrub,
  shimOptionsFrom,
  type ShimIo,
} from "../../shim.js";
import { CATALOG, TOKEN_A, TOKEN_B, scratch, startFakeDaemon } from "./helpers.js";

function io(): ShimIo & { out: string; err: string } {
  const sink = { out: "", err: "" };
  return Object.assign(sink, {
    stdout: { write: (text: string) => void (sink.out += text) },
    stderr: { write: (text: string) => void (sink.err += text) },
  });
}

describe("the daemon info file name", () => {
  it("is the one the daemon writes", () => {
    assert.equal(DAEMON_INFO_FILENAME, DAEMON_INFO_FILE);
  });
});

describe("parseLoopbackOrigin", () => {
  it("accepts exactly http://127.0.0.1:<port> and normalises it", () => {
    assert.equal(parseLoopbackOrigin("http://127.0.0.1:4321"), "http://127.0.0.1:4321");
    assert.equal(parseLoopbackOrigin("http://127.0.0.1:4321/"), "http://127.0.0.1:4321");
  });
  it("refuses everything else", () => {
    for (const bad of ["http://127.0.0.1", "http://127.0.0.1:0", "http://127.0.0.1:70000", "http://[::1]:4000", "http://0.0.0.0:4000", "http://127.0.0.1.evil.example:4000", "http://127.0.0.1:4000?x=1", "http://127.0.0.1:4000#a", "ftp://127.0.0.1:4000", "//127.0.0.1:4000", ""]) {
      assert.throws(() => parseLoopbackOrigin(bad), { name: "ShimError" }, bad);
    }
  });
});

describe("discoverDaemon", () => {
  it("prefers an explicit URL over the info file", async () => {
    const found = await discoverDaemon({ url: "http://127.0.0.1:5000", dataDir: "/nonexistent" });
    assert.deepEqual(found, { origin: "http://127.0.0.1:5000", via: "url" });
  });
  it("reads the port from the info file when its process is alive", async () => {
    const box = scratch();
    try {
      box.daemonFile({ port: 4567 });
      assert.deepEqual(await discoverDaemon({ dataDir: box.dir }), { origin: "http://127.0.0.1:4567", via: "daemon_file" });
    } finally {
      box.cleanup();
    }
  });
  it("rejects a malformed info file and one with an out-of-range port, without using it", async () => {
    for (const text of ["not json", "{}", JSON.stringify({ version: "1", port: 0, pid: 1, started_at: "x" }), JSON.stringify({ version: "1", port: 70000, pid: 1, started_at: "x" }), JSON.stringify({ version: "1", port: 5.5, pid: 1, started_at: "x" })]) {
      await assert.rejects(discoverDaemon({ dataDir: "/d", readFile: async () => text, pidAlive: () => true }), { name: "ShimError", code: "daemon_unreachable" }, text);
    }
  });
  it("reports not running for a missing file and for a dead pid", async () => {
    await assert.rejects(discoverDaemon({ dataDir: "/d", readFile: async () => Promise.reject(new Error("ENOENT")) }), { code: "daemon_not_running" });
    await assert.rejects(discoverDaemon({ dataDir: "/d", readFile: async () => JSON.stringify({ version: "1", port: 4000, pid: 2, started_at: "x" }), pidAlive: () => false }), { code: "daemon_not_running" });
  });
  it("needs an address from somewhere", async () => {
    await assert.rejects(discoverDaemon({}), { code: "daemon_not_running" });
  });
});

describe("scrub", () => {
  it("replaces agent and page token shapes anywhere in a string", () => {
    const text = scrub(`a ${TOKEN_A} b cku_${"x".repeat(43)} c ${TOKEN_B}`);
    assert.doesNotMatch(text, /ck[ua]_/);
    assert.equal(text.match(/\[removed\]/g)?.length, 3);
  });
});

describe("parseShimArgs", () => {
  it("reads the options", () => {
    assert.deepEqual(parseShimArgs(["--url", "http://127.0.0.1:1", "--data-dir", "/d", "--token-file", "/t", "--check"]), { url: "http://127.0.0.1:1", dataDir: "/d", tokenFile: "/t", check: true, help: false });
    assert.deepEqual(parseShimArgs([]), { check: false, help: false });
  });
  it("refuses a token on the command line, an unknown option and a missing value", () => {
    for (const argv of [["--token", TOKEN_A], [`--token=${TOKEN_A}`], ["--bogus"], ["--url"], ["--url", "--check"]]) {
      const parsed = parseShimArgs(argv);
      assert.ok("error" in parsed, argv.join(" ").slice(0, 20));
      assert.doesNotMatch(JSON.stringify(parsed), /cka_/);
    }
  });
});

describe("shimOptionsFrom", () => {
  it("takes the token file over the environment token and the URL over the data directory", async () => {
    const box = scratch();
    try {
      const file = box.tokenFile(TOKEN_B);
      const options = shimOptionsFrom({ check: false, help: false }, { XO_COCKPIT_AGENT_TOKEN: TOKEN_A, XO_COCKPIT_AGENT_TOKEN_FILE: file, XO_COCKPIT_URL: "http://127.0.0.1:1234", XO_DATA_DIR: box.dir });
      assert.equal(options.tokens.kind, "file");
      assert.equal(await options.tokens.get(), TOKEN_B);
      assert.equal(options.url, "http://127.0.0.1:1234");
      assert.equal(options.dataDir, undefined);
    } finally {
      box.cleanup();
    }
  });
  it("uses the same data directory resolution as `serve` when only XO_DATA_DIR is set", () => {
    const options = shimOptionsFrom({ check: false, help: false }, { XO_DATA_DIR: "/srv/xo-data" });
    assert.equal(options.dataDir, "/srv/xo-data");
    assert.equal(options.tokens.kind, "none");
  });
});

describe("runShimCli", () => {
  it("prints usage for --help and exits 0 without touching anything", async () => {
    const sink = io();
    const outcome = await runShimCli(["--help"], {}, sink);
    assert.deepEqual(outcome, { exit: 0 });
    assert.match(sink.out, /holds no ledger or key/);
  });
  it("exits 2 with usage on a bad option and never echoes a token passed on the command line", async () => {
    const sink = io();
    const outcome = await runShimCli(["--token", TOKEN_A], {}, sink);
    assert.deepEqual(outcome, { exit: 2 });
    assert.doesNotMatch(sink.err + sink.out, /cka_/);
  });
  it("--check says healthy when the daemon is up and accepts the token", async () => {
    const daemon = await startFakeDaemon();
    try {
      const sink = io();
      const outcome = await runShimCli(["--check"], { XO_COCKPIT_URL: daemon.origin, XO_COCKPIT_AGENT_TOKEN: TOKEN_A }, sink);
      assert.deepEqual(outcome, { exit: 0 });
      assert.match(sink.out, /accepts the agent token/);
      assert.ok(daemon.seen.every((request) => request.method === "GET"), "a check sends no tool call");
    } finally {
      await daemon.close();
    }
  });
  it("--check with no token says so and exits 1", async () => {
    const daemon = await startFakeDaemon();
    try {
      const sink = io();
      const outcome = await runShimCli(["--check"], { XO_COCKPIT_URL: daemon.origin }, sink);
      assert.deepEqual(outcome, { exit: 1 });
      assert.match(sink.out, /token_missing/);
    } finally {
      await daemon.close();
    }
  });
  it("serving hands the entry a server factory and starts no daemon, relay or file", async () => {
    const sink = io();
    let factory: (() => unknown) | undefined;
    const outcome = await runShimCli([], { XO_COCKPIT_URL: "http://127.0.0.1:1", XO_COCKPIT_AGENT_TOKEN: TOKEN_A }, sink, {
      catalog: async () => CATALOG,
      serve: (make) => {
        factory = make;
        return { close: async () => undefined };
      },
    });
    assert.ok("handle" in outcome);
    assert.equal(typeof factory, "function");
    assert.equal(sink.out, "", "stdout is the MCP channel and carries nothing from the CLI");
  });
});

describe("source rules", () => {
  const source = readFileSync(fileURLToPath(new URL("../../shim.ts", import.meta.url)), "utf8");

  it("never writes to stdout, console or the process directly, and never prints a token variable", () => {
    assert.doesNotMatch(source, /console\./);
    assert.doesNotMatch(source, /process\.stdout\.write/);
    // Diagnostics go through log(), whose argument is a fixed phrase or an error class.
    assert.doesNotMatch(source, /log\?\.\(`[^`]*\$\{(?:token|body|text)/);
  });
  it("contains no host other than the loopback address, no relay and no spawn", () => {
    const hosts = [...source.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((match) => match[0]);
    for (const host of hosts) assert.match(host, /127\.0\.0\.1|localhost/, host);
    assert.doesNotMatch(source, /createLocalRuntime|useEmbeddedRelay|child_process|node:net/);
  });
  it("carries no personal identifier or home path", () => {
    const handle = ["cam", "den"].join("");
    assert.doesNotMatch(source, new RegExp(handle, "i"));
    assert.doesNotMatch(source, /\/Users\/|\/home\/|claude-\d{3}/);
  });
  it("sends the token only in the Authorization header of requests it builds itself, with redirects off", () => {
    assert.match(source, /redirect: "manual"/);
    assert.equal(source.match(/authorization/g)?.length, 1);
  });
});
