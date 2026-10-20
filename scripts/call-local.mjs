// Dev harness for the local mode, not part of the PayBox starter. Starts dist/local.mjs in a fresh process
// with a stripped environment, speaks MCP to it over stdio the way a desktop client does, prints the
// answer and the process's stderr (the start-up block), and stops it.
//   pnpm build:local && node scripts/call-local.mjs --list
//   pnpm build:local && node scripts/call-local.mjs <tool> '{"name":"value"}' [--env NAME=value ...] [--modern]
// The parent environment is never forwarded. HOME and XO_DATA_DIR point at a throwaway directory unless
// you pass --env XO_DATA_DIR=... yourself. The default handshake is the standard `initialize` one;
// --modern sends the stateless form the PayBox runner uses.
import { mkdtemp, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { withProcess } from "./process.mjs";
import { ConformanceError, release } from "./report.mjs";

const MAX_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

// One conversation with a fresh dist/local.mjs.
//   requests: [{ method, params }] sent in order; the answers come back in the same order.
//   options.env: extra environment variables (null removes one); options.keepData: do not delete the throwaway directory.
//   options.modern: stateless per-request form instead of the initialize handshake.
//   options.waitFor: keep the process up until this text has appeared on stderr (at most 15 s).
export async function callLocal(bundle, requests, options = {}) {
  const home = await mkdtemp(resolve(tmpdir(), "xo-local-call-"));
  const logs = [];
  const answers = [];
  let initialize;
  try {
    const env = {
      HOME: home,
      NODE_ENV: "production",
      NO_COLOR: "1",
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
      XO_DATA_DIR: join(home, "data"),
      ...(options.env ?? {}),
    };
    // A null value removes a variable (so a test can run with no XO_DATA_DIR at all).
    for (const [name, value] of Object.entries(env)) if (value === null) delete env[name];
    const startedAt = performance.now();
    await withProcess(process.execPath, [bundle], { cwd: home, env }, async (child, closed, stop) => {
      let stdoutBytes = 0;
      let stderrBytes = 0;
      child.stdout.on("data", (chunk) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > MAX_STDOUT_BYTES) stop(`stdout exceeded ${MAX_STDOUT_BYTES} bytes`, "limit_exceeded");
      });
      child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > MAX_STDERR_BYTES) stop(`stderr exceeded ${MAX_STDERR_BYTES} bytes`, "limit_exceeded");
        logs.push(chunk.toString("utf8"));
      });
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      const iterator = lines[Symbol.asyncIterator]();
      const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
      const receive = async (id) => {
        for (;;) {
          const next = await iterator.next();
          if (next.done) throw new ConformanceError("the server exited before answering", "startup_failed");
          let message;
          try {
            message = JSON.parse(next.value);
          } catch {
            throw new ConformanceError("stdout held something that is not JSON (stdout is the protocol channel)", "protocol_invalid");
          }
          if (message?.id === id) return message;
        }
      };
      try {
        let nextId = 1;
        if (options.modern !== true) {
          const id = nextId++;
          send({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "xo-call-local", version: "0" } } });
          const init = await receive(id);
          if (init.error !== undefined) throw new ConformanceError(`initialize failed: ${init.error.message}`, "startup_failed");
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          initialize = init;
        }
        for (const request of requests) {
          const id = nextId++;
          const params =
            options.modern === true
              ? {
                  ...request.params,
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": release.protocolVersion,
                    "io.modelcontextprotocol/clientInfo": { name: "xo-call-local", version: "0" },
                    "io.modelcontextprotocol/clientCapabilities": {},
                  },
                }
              : request.params;
          send({ jsonrpc: "2.0", id, method: request.method, params });
          answers.push(await receive(id));
        }
        // The start-up block is written when the relay is ready, which can be after the first answer.
        if (options.waitFor !== undefined) {
          const until = Date.now() + 15_000;
          while (!logs.join("").includes(options.waitFor) && Date.now() < until) await new Promise((done) => setTimeout(done, 25));
        }
        return answers;
      } finally {
        lines.close();
      }
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return { answers, initialize, logs: logs.join(""), home, ms: Math.round(performance.now() - startedAt) };
  } finally {
    if (options.keepData !== true) await rm(home, { recursive: true, force: true });
  }
}

function usage(message) {
  console.error(`${message}\nUsage: node scripts/call-local.mjs --list [--modern]\n       node scripts/call-local.mjs <tool> [json-arguments] [--env NAME=value ...] [--modern]`);
  process.exit(2);
}

function parseArguments(argv) {
  const env = {};
  const positional = [];
  let list = false;
  let modern = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") list = true;
    else if (arg === "--modern") modern = true;
    else if (arg === "--env") {
      const pair = argv[index + 1] ?? "";
      index += 1;
      const split = pair.indexOf("=");
      if (split < 1) usage("--env needs NAME=value");
      env[pair.slice(0, split)] = pair.slice(split + 1);
    } else positional.push(arg);
  }
  if (list) {
    if (positional.length > 0) usage("--list takes no tool name");
    return { request: { method: "tools/list", params: {} }, env, modern };
  }
  const [tool, rawArguments = "{}", ...extra] = positional;
  if (!tool || extra.length > 0) usage("Give exactly one tool name and optional JSON arguments");
  let parsed;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    usage("Arguments must be valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) usage("Arguments must be a JSON object");
  return { request: { method: "tools/call", params: { name: tool, arguments: parsed } }, env, modern };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const parsed = parseArguments(process.argv.slice(2));
  const bundle = resolve(process.cwd(), "dist/local.mjs");
  try {
    realpathSync(bundle);
  } catch {
    console.error("dist/local.mjs not found; run pnpm build:local first");
    process.exit(2);
  }
  try {
    const { answers, logs, ms } = await callLocal(bundle, [parsed.request], { env: parsed.env, modern: parsed.modern, waitFor: "xo-market local mode" });
    const response = answers[0];
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    if (logs) console.error(`[local stderr]\n${logs}`);
    console.error(`[call] ${parsed.request.method} finished in ${ms} ms`);
    if ("error" in response || response.result?.isError === true) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof ConformanceError ? error.code : "call_failed";
    console.error(`[call] failed (${code}): ${error instanceof Error ? error.message : "could not complete the call"}`);
    process.exitCode = 1;
  }
}
