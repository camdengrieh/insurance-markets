// Dev harness, not part of the PayBox starter. Runs one MCP request against dist/plugin.mjs the
// way the hosted sandbox does: a fresh process, a 10 s limit, and a stripped environment.
//   pnpm build && node scripts/call.mjs --list
//   pnpm build && node scripts/call.mjs <tool> '{"name":"value"}' [--env NAME=value ...]
// The parent environment is never forwarded; pass plugin config explicitly with --env.
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";

import { withProcess } from "./process.mjs";
import { ConformanceError, release } from "./report.mjs";

const MAX_STDOUT_BYTES = 256 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const TIMEOUT_MS = 10_000;
const REQUEST_ID = 1;

function usage(message) {
  console.error(`${message}\nUsage: node scripts/call.mjs --list\n       node scripts/call.mjs <tool> [json-arguments] [--env NAME=value ...]`);
  process.exit(2);
}

function parseArguments(argv) {
  const env = {};
  const positional = [];
  let list = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      list = true;
    } else if (arg === "--env") {
      const pair = argv[index + 1] ?? "";
      index += 1;
      const split = pair.indexOf("=");
      if (split < 1) usage("--env needs NAME=value");
      env[pair.slice(0, split)] = pair.slice(split + 1);
    } else {
      positional.push(arg);
    }
  }
  if (list) {
    if (positional.length > 0) usage("--list takes no tool name");
    return { method: "tools/list", params: {}, env };
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
  return { method: "tools/call", params: { name: tool, arguments: parsed }, env };
}

async function callPlugin(artifact, request) {
  const home = await mkdtemp(resolve(tmpdir(), "paybox-plugin-call-"));
  const logs = [];
  try {
    const response = await withProcess(process.execPath, [artifact], {
      cwd: dirname(artifact),
      env: { HOME: home, NODE_ENV: "production", NO_COLOR: "1", PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", ...request.env },
    }, async (child, closed, stop) => {
      let stdoutBytes = 0;
      let stderrBytes = 0;
      child.stdout.on("data", (chunk) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > MAX_STDOUT_BYTES) stop(`plugin stdout exceeded ${MAX_STDOUT_BYTES} bytes`, "limit_exceeded");
      });
      child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > MAX_STDERR_BYTES) stop(`plugin stderr exceeded ${MAX_STDERR_BYTES} bytes`, "limit_exceeded");
        logs.push(chunk.toString("utf8"));
      });
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
      try {
        child.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0", id: REQUEST_ID, method: request.method,
          params: { ...request.params, _meta: {
            "io.modelcontextprotocol/protocolVersion": release.protocolVersion,
            "io.modelcontextprotocol/clientInfo": { name: "xo-paybox-plugin-call", version: release.version },
            "io.modelcontextprotocol/clientCapabilities": {},
          } },
        })}\n`);
        for await (const line of lines) {
          let message;
          try {
            message = JSON.parse(line);
          } catch {
            throw new ConformanceError("plugin stdout contained non-JSON output", "protocol_invalid");
          }
          if (message?.id === REQUEST_ID) return message;
        }
        throw new ConformanceError("plugin exited before returning a response", "startup_failed");
      } finally {
        lines.close();
      }
    }, TIMEOUT_MS);
    return { response, logs: logs.join("") };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

const request = parseArguments(process.argv.slice(2));
const artifact = resolve(process.cwd(), "dist/plugin.mjs");
try {
  await access(artifact);
} catch {
  console.error("dist/plugin.mjs not found; run pnpm build first");
  process.exit(2);
}

const started = performance.now();
try {
  const { response, logs } = await callPlugin(artifact, request);
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  if (logs) console.error(`[plugin stderr]\n${logs}`);
  console.error(`[call] ${request.method} finished in ${Math.round(performance.now() - started)} ms`);
  if ("error" in response || response.result?.isError === true) process.exitCode = 1;
} catch (error) {
  // process.mjs can throw EPERM on macOS when the plugin already exited; keep the real cause visible.
  const code = error instanceof ConformanceError ? error.code : "call_failed";
  const message = error instanceof Error ? error.message : "Could not complete the call";
  console.error(`[call] failed (${code}): ${message}`);
  process.exitCode = 1;
}
