// Starts a throwaway local anvil on 127.0.0.1 and hands back its URL and a stop() that kills it.
//
// Rules this file keeps (project ground rules for tests that need a node):
//   - binds 127.0.0.1 only, on a free port picked at runtime (never a fixed port)
//   - quiet (--silent) and with a fixed hardfork, so the EVM rules do not depend on the installed anvil
//   - if anvil is missing or will not start, it returns { ok: false, reason } and the caller skips
//     with that reason; it never throws for an environment problem
//   - every child is tracked and killed on stop(), and again from a process 'exit' hook as a net
//     for a test run that dies before its after() hook
//
// Which binary: XO_ANVIL_BIN if set; otherwise every `anvil` found on PATH is asked for its version
// and the newest wins (a machine can carry an old cargo-installed anvil in front of a current
// foundryup one, and the old one is a slower, less complete debug_* implementation).

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { delimiter, join } from "node:path";

export interface AnvilOptions {
  readonly chainId: number;
  // Default cancun. Pinned because the account stack uses nothing newer and a pinned fork keeps gas
  // numbers comparable between anvil versions.
  readonly hardfork?: string;
  // Genesis timestamp (unix seconds). Fixed by default so a run does not depend on today's date.
  readonly genesisTimestamp?: number;
  readonly startupTimeoutMs?: number;
}

export interface AnvilHandle {
  readonly ok: true;
  readonly url: string;
  readonly port: number;
  readonly chainId: number;
  readonly version: string;
  readonly binary: string;
  rpc<T = unknown>(method: string, params?: readonly unknown[]): Promise<T>;
  stop(): Promise<void>;
}

export interface AnvilUnavailable {
  readonly ok: false;
  readonly reason: string;
}

export type AnvilStart = AnvilHandle | AnvilUnavailable;

// 2026-10-19T00:00:00Z.
export const DEFAULT_GENESIS_TIMESTAMP = 1_792_368_000;

const children = new Set<ChildProcess>();
let exitHookInstalled = false;

function killAll(): void {
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

// A normal exit and an interrupt both kill every child. Node does not emit 'exit' for SIGINT or
// SIGTERM, so without the signal handlers a Ctrl-C of a test run would leave anvil running. After the
// children are gone the signal is re-raised so the process ends the way it would have (unless another
// handler of this process is in charge of that signal).
function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once("exit", killAll);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.once(signal, () => {
      killAll();
      if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(): string[] {
  const names = process.platform === "win32" ? ["anvil.exe"] : ["anvil"];
  const seen = new Set<string>();
  const found: string[] = [];
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    if (dir === "") continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (!isExecutable(candidate)) continue;
      let real = candidate;
      try {
        real = realpathSync(candidate);
      } catch {
        // keep the unresolved path
      }
      if (seen.has(real)) continue;
      seen.add(real);
      found.push(candidate);
    }
  }
  return found;
}

function parseVersion(text: string): [number, number, number] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionOf(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binary, ["--version"], { timeout: 5_000 }, (error, stdout) => {
      if (error !== null) return resolve(null);
      const firstLine = stdout.split("\n")[0] ?? "";
      resolve(parseVersion(firstLine) === null ? null : firstLine.trim());
    });
  });
}

function newer(a: [number, number, number], b: [number, number, number]): boolean {
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
  }
  return false;
}

export async function findAnvil(): Promise<{ binary: string; version: string } | { reason: string }> {
  const override = process.env["XO_ANVIL_BIN"];
  const candidates = override !== undefined && override !== "" ? [override] : pathCandidates();
  if (candidates.length === 0) {
    return { reason: "anvil is not installed (no 'anvil' on PATH and XO_ANVIL_BIN is not set)" };
  }
  let best: { binary: string; version: string; parsed: [number, number, number] } | null = null;
  for (const binary of candidates) {
    const version = await versionOf(binary);
    const parsed = version === null ? null : parseVersion(version);
    if (version === null || parsed === null) continue;
    if (best === null || newer(parsed, best.parsed)) best = { binary, version, parsed };
  }
  if (best === null) return { reason: "anvil was found but did not answer --version" };
  return { binary: best.binary, version: best.version };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => (port === 0 ? reject(new Error("no free port")) : resolve(port)));
    });
  });
}

export async function jsonRpc<T>(url: string, method: string, params: readonly unknown[] = []): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: T; error?: { code: number; message: string; data?: unknown } };
  if (body.error !== undefined) {
    const error = new Error(`${method}: ${body.error.message}`) as Error & { code?: number; data?: unknown };
    error.code = body.error.code;
    error.data = body.error.data;
    throw error;
  }
  return body.result as T;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    await Promise.race([exited, sleep(3_000)]);
    if (child.exitCode === null && child.signalCode === null) {
      const killed = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGKILL");
      await Promise.race([killed, sleep(2_000)]);
    }
  }
  children.delete(child);
}

async function attempt(binary: string, version: string, options: AnvilOptions): Promise<AnvilHandle | string> {
  const port = await freePort();
  const url = `http://127.0.0.1:${String(port)}`;
  const args = [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    String(options.chainId),
    "--hardfork",
    options.hardfork ?? "cancun",
    "--timestamp",
    String(options.genesisTimestamp ?? DEFAULT_GENESIS_TIMESTAMP),
    "--silent",
  ];
  const child = spawn(binary, args, { stdio: "ignore" });
  children.add(child);
  installExitHook();
  // An object, not a `let`: the two handlers assign it after TypeScript has narrowed a plain variable.
  const failure: { reason: string | null } = { reason: null };
  child.once("error", (error) => {
    failure.reason = `anvil could not be started: ${error.message}`;
  });
  child.once("exit", (code, signal) => {
    failure.reason ??= `anvil exited early (code ${String(code)}, signal ${String(signal)})`;
  });
  const deadline = Date.now() + (options.startupTimeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    if (failure.reason !== null) {
      children.delete(child);
      return failure.reason;
    }
    try {
      const reported = await jsonRpc<string>(url, "eth_chainId");
      if (BigInt(reported) === BigInt(options.chainId)) {
        return {
          ok: true,
          url,
          port,
          chainId: options.chainId,
          version,
          binary,
          rpc: <T>(method: string, params: readonly unknown[] = []) => jsonRpc<T>(url, method, params),
          stop: () => stopChild(child),
        };
      }
      await stopChild(child);
      return "anvil answered with an unexpected chain id";
    } catch {
      // not listening yet
    }
    await sleep(50);
  }
  await stopChild(child);
  return "anvil did not answer in time";
}

export async function startAnvil(options: AnvilOptions): Promise<AnvilStart> {
  const found = await findAnvil();
  if ("reason" in found) return { ok: false, reason: found.reason };
  let last = "anvil could not be started";
  // A port can be taken between picking and binding; try a few fresh ones.
  for (let tries = 0; tries < 3; tries += 1) {
    const result = await attempt(found.binary, found.version, options);
    if (typeof result !== "string") return result;
    last = result;
  }
  return { ok: false, reason: last };
}
