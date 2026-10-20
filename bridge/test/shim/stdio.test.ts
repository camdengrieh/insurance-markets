import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { TOKEN_A, freePort, okAnswer, scratch, startFakeDaemon, type FakeDaemon, type Scratch } from "./helpers.js";

// The shim as a real child process speaking MCP over stdio, with the default catalogue (the plugin's real tools)
// and a fake daemon: what an MCP client such as Claude Desktop would see.

const LAUNCHER = fileURLToPath(new URL("./shim-main.ts", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const ERA = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "stdio-test", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

interface Peer {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stdout: string[];
  stderr(): string;
  send(message: unknown): void;
  reply(id: number, timeoutMs?: number): Promise<Record<string, unknown>>;
  end(): Promise<number | null>;
}

function launch(args: readonly string[], env: Record<string, string>, raw = false): Peer {
  const child = spawn(process.execPath, ["--import", "tsx", LAUNCHER, ...args], { cwd: ROOT, env: { PATH: process.env["PATH"] ?? "", ...env }, stdio: ["pipe", "pipe", "pipe"] });
  const stdout: string[] = [];
  const errors: string[] = [];
  let buffer = "";
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  const seen = new Map<number, Record<string, unknown>>();
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim() === "") continue;
      stdout.push(line);
      if (raw) continue;
      const message = JSON.parse(line) as Record<string, unknown>;
      const id = message["id"];
      if (typeof id === "number") {
        seen.set(id, message);
        waiting.get(id)?.(message);
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString("utf8")));
  return {
    child,
    stdout,
    stderr: () => errors.join(""),
    send: (message) => void child.stdin.write(`${JSON.stringify(message)}\n`),
    reply: (id, timeoutMs = 20_000) =>
      new Promise((resolve, reject) => {
        const existing = seen.get(id);
        if (existing !== undefined) return resolve(existing);
        const timer = setTimeout(() => reject(new Error(`no reply to ${id}`)), timeoutMs);
        waiting.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
      }),
    end: () =>
      new Promise((resolve) => {
        child.once("exit", (code) => resolve(code));
        child.stdin.end();
        setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
      }),
  };
}

describe("over stdio", () => {
  let box: Scratch;
  let daemon: FakeDaemon;
  let peer: Peer | undefined;
  beforeEach(async () => {
    box = scratch();
    daemon = await startFakeDaemon();
  });
  afterEach(async () => {
    if (peer !== undefined && peer.child.exitCode === null) await peer.end();
    await daemon.close();
    box.cleanup();
  });

  const env = (): Record<string, string> => ({ XO_DATA_DIR: box.dir, XO_COCKPIT_URL: daemon.origin, XO_COCKPIT_AGENT_TOKEN_FILE: box.tokenFile(TOKEN_A) });

  it("lists the plugin's tools, forwards a call, and writes only MCP messages to stdout", async () => {
    peer = launch([], env());
    peer.send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: ERA } });
    const listed = (await peer.reply(1))["result"] as { tools: Array<{ name: string }> };
    assert.ok(listed.tools.length >= 20);
    assert.ok(listed.tools.some((tool) => tool.name === "xo_search"));

    daemon.onTool = (request) => ({ body: okAnswer(request.tool, { outcome: "ok" }, "found") });
    peer.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "xo_search", arguments: { query: "bond" }, _meta: ERA } });
    const called = (await peer.reply(2))["result"] as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(called.isError, false);
    assert.equal(called.content[0]?.text, "found");
    assert.ok(peer.stdout.every((line) => (JSON.parse(line) as { jsonrpc?: string }).jsonrpc === "2.0"), "stdout is MCP only");
    assert.doesNotMatch(peer.stderr(), /cka_/);
    assert.equal(await peer.end(), 0, "exits 0 when the client closes stdin");
  });

  it("serves the 2025-era initialize handshake too", async () => {
    peer = launch([], env());
    peer.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "legacy", version: "0" } } });
    const init = (await peer.reply(1))["result"] as { serverInfo: { name: string }; capabilities: { tools?: unknown } };
    assert.equal(init.serverInfo.name, "xo-market-cockpit");
    assert.ok(init.capabilities.tools);
    peer.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    peer.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "xo_search", arguments: {} } });
    const called = (await peer.reply(2))["result"] as { isError: boolean };
    assert.equal(called.isError, false);
  });

  it("with no daemon running, answers the call with a clear error and keeps serving", async () => {
    await daemon.close();
    peer = launch([], { ...env(), XO_COCKPIT_URL: `http://127.0.0.1:${await freePort()}` });
    peer.send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "xo_search", arguments: {}, _meta: ERA } });
    const called = (await peer.reply(1))["result"] as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(called.isError, true);
    assert.match(called.content[0]?.text ?? "", /daemon_not_running/);
    peer.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: ERA } });
    assert.ok(((await peer.reply(2))["result"] as { tools: unknown[] }).tools.length > 0);
  });

  it("--check reports a healthy daemon, a missing one and a refused token, and never prints the token", async () => {
    const good = launch(["--check"], env(), true);
    let out = "";
    good.child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    assert.equal(await good.end(), 0);
    assert.match(out, /accepts the agent token/);
    assert.doesNotMatch(out, /cka_/);

    daemon.accepted = "cka_" + "z".repeat(43);
    const refused = launch(["--check"], env(), true);
    let refusedOut = "";
    refused.child.stdout.on("data", (chunk: Buffer) => (refusedOut += chunk.toString("utf8")));
    assert.equal(await refused.end(), 1);
    assert.match(refusedOut, /token_rejected/);
    assert.doesNotMatch(refusedOut, /cka_/);

    await daemon.close();
    const missing = launch(["--check"], env(), true);
    let missingOut = "";
    missing.child.stdout.on("data", (chunk: Buffer) => (missingOut += chunk.toString("utf8")));
    assert.equal(await missing.end(), 1);
    assert.match(missingOut, /daemon_not_running/);
  });
});
