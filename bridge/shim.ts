import { lstat, open } from "node:fs/promises";
import { join } from "node:path";

import { InMemoryTransport, ProtocolError, ProtocolErrorCode, Server } from "@modelcontextprotocol/server";
import { z } from "zod";

import { resolveDataDir } from "../src/local/paths.js";
import { COCKPIT_DIR_NAME } from "./auth.js";
import {
  AGENT_TOKEN_PATTERN,
  MAX_PROXY_RESPONSE_BYTES,
  MAX_REQUEST_BODY_BYTES,
  TOKEN_SCAN_PATTERN,
  bridgeErrorResponseSchema,
  toolCallResponseSchema,
  toolNameSchema,
} from "./contract.js";

// D6: the thin stdio MCP shim (dapp-design 3.2 and 7.4).
//
// An agent host that cannot reach a loopback HTTP MCP server (Claude Desktop, ChatGPT: NOT TESTED) spawns this
// process instead. It is NOT a second relay. It holds no ledger, no caps, no credentials and no flags: every
// tools/call is forwarded to the running Cockpit daemon with the persistent agent token, so the user's agent and
// the dApp share one data directory, one ledger and one set of caps. Without a daemon it answers every call with a
// clear error and never embeds a relay, because two writers on one data directory would reset caps per process.
//
// What it does, in order, on each call:
//   1. checks the call locally (tool name, argument size) so a malformed call never reaches the daemon;
//   2. finds the daemon (explicit URL, else <data dir>/cockpit/daemon.json) and checks that the thing listening
//      there answers like the Cockpit before the token is sent to it (401 `unauthorized` to an unauthenticated
//      request);
//   3. POSTs /ui/tool with `Authorization: Bearer <agent token>` to 127.0.0.1 and nowhere else;
//   4. maps the daemon's answer back to an MCP tool result.
//
// Retry rules (a tool call can move money, so nothing is resent unless it provably was not processed):
//   - connection refused: nothing was sent, so the daemon is looked up again once (it may have restarted on a
//     new port) and the call is retried once;
//   - 401: the daemon rejected the token before doing anything; the token is read again from its file (rotation)
//     and the call is retried once if the token changed;
//   - anything else that fails after the request left (reset, timeout, cancel, unreadable answer) is reported as
//     `outcome_unknown` and is NOT resent.
//
// The tool schemas come from the same registry the daemon serves (src/local/server.ts), so `tools/list` works
// while the daemon is down and the agent sees exactly the daemon's tools. Authorisation is the daemon's alone
// (class table, scope ceiling, ARM window, flags, kill): the shim decides nothing about what may run.
//
// Nothing here logs, returns or stores a token beyond the in-memory string; every text that leaves is scanned for
// token-shaped values. stdout carries MCP messages only; diagnostics go to stderr.

export const SHIM_VERSION = "0.1.0";
export const SHIM_SERVER_NAME = "xo-market-cockpit";
// Same name the daemon writes (bridge/main.ts DAEMON_INFO_FILE); a test pins the two together so they cannot drift.
export const DAEMON_INFO_FILENAME = "daemon.json";
export const TOKEN_ENV = "XO_COCKPIT_AGENT_TOKEN";
export const TOKEN_FILE_ENV = "XO_COCKPIT_AGENT_TOKEN_FILE";
export const URL_ENV = "XO_COCKPIT_URL";

// The daemon cuts a tool run off at 120 s (bridge/tool-classes.ts); wait a little longer so its answer arrives.
export const CALL_TIMEOUT_MS = 130_000;
export const IDENTITY_TIMEOUT_MS = 3_000;
const TOKEN_FILE_MAX_BYTES = 512;
const DAEMON_FILE_MAX_BYTES = 4_096;

// ---- failures ------------------------------------------------------------------------------------------------------------

export const SHIM_ERROR_CODES = [
  "daemon_not_running", // nothing is listening / daemon.json is missing or stale
  "daemon_unreachable", // the address is unusable or the daemon could not be asked
  "daemon_identity", // something answered, but not like the Cockpit; the token was not sent
  "token_missing", // no agent token is configured
  "token_invalid", // the configured token is not a well-formed agent token, or its file is unsafe
  "token_rejected", // the daemon refused the token (rotated, revoked or wrong)
  "request_invalid", // the call was refused locally before anything was sent
  "outcome_unknown", // the request left and no usable answer came back: the call may have run
  "response_invalid", // the daemon answered with something outside its contract
  "tool_unknown", // not in the tool catalogue
  "catalog_unavailable", // the tool definitions could not be loaded
] as const;
export type ShimErrorCode = (typeof SHIM_ERROR_CODES)[number];

export class ShimError extends Error {
  readonly code: ShimErrorCode;
  constructor(code: ShimErrorCode, message: string) {
    super(message);
    this.name = "ShimError";
    this.code = code;
  }
}

const TOKEN_LIKE = new RegExp(TOKEN_SCAN_PATTERN.source, "g");

// Every string that leaves the shim passes through here: a token-shaped value is replaced, whatever its source.
export function scrub(text: string): string {
  return text.replace(TOKEN_LIKE, "[removed]");
}

// ---- tool catalogue -----------------------------------------------------------------------------------------------------

// A tool as `tools/list` shows it. Kept as the plain MCP object (input/output JSON schemas, annotations and the
// `_meta` marker anthropic/requiresUserInteraction) so a client sees what the daemon's own tools say.
export interface ToolDefinition {
  readonly name: string;
  readonly [key: string]: unknown;
}
export type ToolCatalog = () => Promise<readonly ToolDefinition[]>;

// Registers the plugin's tools in this process (no network, no file, no relay) and reads their definitions over a
// linked in-memory transport. Loaded on first use.
export function inProcessCatalog(): ToolCatalog {
  return async () => {
    const { createLocalMcpServer } = await import("../src/local/server.js");
    const server = createLocalMcpServer();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    try {
      const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), 10_000);
        timer.unref?.();
        clientSide.onmessage = (message) => {
          if ((message as { id?: unknown }).id === 1) {
            clearTimeout(timer);
            resolve(message as unknown as Record<string, unknown>);
          }
        };
        void clientSide
          .start()
          .then(() =>
            clientSide.send({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/list",
              params: {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                  "io.modelcontextprotocol/clientInfo": { name: SHIM_SERVER_NAME, version: SHIM_VERSION },
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              },
            } as never),
          )
          .catch(reject);
      });
      const tools = (reply["result"] as { tools?: unknown } | undefined)?.tools;
      if (!Array.isArray(tools)) throw new Error("no tools");
      return tools.filter((tool): tool is ToolDefinition => typeof tool === "object" && tool !== null && typeof (tool as { name?: unknown }).name === "string");
    } finally {
      await clientSide.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  };
}

// ---- the agent token ----------------------------------------------------------------------------------------------------

// The daemon stores only a hash of the agent token and prints the plaintext once, so the user keeps it: in a file
// (preferred: it can be replaced after `--rotate-agent-token` and the shim picks the new one up on the next 401) or
// in the client's environment (fixed for the life of the shim process).
export interface TokenSource {
  readonly kind: "file" | "env" | "none";
  // The current token. Throws ShimError token_missing / token_invalid.
  get(): Promise<string>;
  // Reads the source again (file only). Returns the token when it changed from `previous`, else null.
  reload(previous: string): Promise<string | null>;
}

function checkToken(value: string, where: string): string {
  const token = value.trim();
  if (!AGENT_TOKEN_PATTERN.test(token)) {
    throw new ShimError("token_invalid", `${where} does not hold an agent token (it must look like cka_ followed by 43 characters). Nothing was sent.`);
  }
  return token;
}

export function envTokenSource(value: string | undefined): TokenSource {
  if (value === undefined || value.trim() === "") return noTokenSource();
  return {
    kind: "env",
    async get() {
      return checkToken(value, TOKEN_ENV);
    },
    async reload() {
      return null;
    },
  };
}

export function noTokenSource(): TokenSource {
  return {
    kind: "none",
    async get() {
      throw new ShimError(
        "token_missing",
        `No agent token is configured. Set ${TOKEN_FILE_ENV} to a file that holds the token the daemon printed (or pass --token-file), or set ${TOKEN_ENV}. The daemon prints it once at \`serve\`; \`serve --rotate-agent-token\` makes a new one.`,
      );
    },
    async reload() {
      return null;
    },
  };
}

export function fileTokenSource(path: string, platform: NodeJS.Platform = process.platform): TokenSource {
  const read = async (): Promise<string> => {
    let stats;
    try {
      stats = await lstat(path);
    } catch {
      throw new ShimError("token_missing", "The agent token file could not be found. Check the path in --token-file or " + TOKEN_FILE_ENV + ".");
    }
    if (!stats.isFile()) throw new ShimError("token_invalid", "The agent token path is not a regular file (links are not followed). Nothing was sent.");
    // A token that other users can read is not a secret: refuse it, like the daemon refuses an open data directory.
    if (platform !== "win32" && (stats.mode & 0o077) !== 0) {
      throw new ShimError("token_invalid", "The agent token file can be read by other users. Run chmod 600 on it. Nothing was sent.");
    }
    if (stats.size > TOKEN_FILE_MAX_BYTES) throw new ShimError("token_invalid", "The agent token file is too large to be a token file.");
    let text: string;
    try {
      const handle = await open(path, "r");
      try {
        text = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    } catch {
      throw new ShimError("token_missing", "The agent token file could not be read.");
    }
    return checkToken(text, "The agent token file");
  };
  return {
    kind: "file",
    get: read,
    async reload(previous) {
      try {
        const next = await read();
        return next !== previous ? next : null;
      } catch {
        return null;
      }
    },
  };
}

// ---- finding the daemon ---------------------------------------------------------------------------------------------------

export interface DaemonTarget {
  readonly origin: string; // http://127.0.0.1:<port>
  readonly via: "url" | "daemon_file";
}

// The token is only ever sent to the loopback address 127.0.0.1 over plain http, at a port. Nothing else parses.
export function parseLoopbackOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ShimError("daemon_unreachable", "The daemon address is not a URL. Use http://127.0.0.1:<port>.");
  }
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username !== "" ||
    url.password !== "" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new ShimError("daemon_unreachable", "The daemon address must be exactly http://127.0.0.1:<port>. The agent token is never sent anywhere else.");
  }
  return `http://127.0.0.1:${port}`;
}

const daemonFileSchema = z
  .object({
    version: z.string().max(64),
    port: z.number().int().min(1).max(65_535),
    pid: z.number().int().positive(),
    started_at: z.string().max(64),
  })
  .passthrough();

export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to someone else. ESRCH: gone.
    return (error as { code?: unknown }).code === "EPERM";
  }
}

export interface DiscoverOptions {
  readonly url?: string;
  readonly dataDir?: string;
  readonly readFile?: (path: string) => Promise<string>;
  readonly pidAlive?: (pid: number) => boolean;
}

export async function discoverDaemon(options: DiscoverOptions): Promise<DaemonTarget> {
  if (options.url !== undefined && options.url !== "") return { origin: parseLoopbackOrigin(options.url), via: "url" };
  if (options.dataDir === undefined) {
    throw new ShimError("daemon_not_running", "No daemon address is configured. Set XO_COCKPIT_URL or XO_DATA_DIR (the shim reads <data dir>/cockpit/daemon.json).");
  }
  const file = join(options.dataDir, COCKPIT_DIR_NAME, DAEMON_INFO_FILENAME);
  let text: string;
  try {
    text = await (options.readFile ?? ((path: string) => readBounded(path, DAEMON_FILE_MAX_BYTES)))(file);
  } catch {
    throw notRunning("No running Cockpit daemon was found for this data directory.");
  }
  let parsed;
  try {
    parsed = daemonFileSchema.parse(JSON.parse(text));
  } catch {
    throw new ShimError("daemon_unreachable", "The daemon's info file is not readable as one. Restart the daemon.");
  }
  if (!(options.pidAlive ?? pidIsAlive)(parsed.pid)) {
    throw notRunning("The daemon's info file is left over from a daemon that has stopped.");
  }
  return { origin: `http://127.0.0.1:${parsed.port}`, via: "daemon_file" };
}

async function readBounded(path: string, max: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const stats = await handle.stat();
    if (stats.size > max) throw new Error("too large");
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

function notRunning(reason: string): ShimError {
  return new ShimError(
    "daemon_not_running",
    `${reason} Start it in your own terminal with \`node dist/local.mjs serve\` (same data directory) and call again. This shim never starts a daemon or an embedded relay itself: a second writer would reset the daily caps.`,
  );
}

// ---- talking to the daemon ------------------------------------------------------------------------------------------------

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

function causeCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return "";
}

// ECONNREFUSED is the one failure that proves the request never reached a daemon.
function wasNotSent(error: unknown): boolean {
  return causeCode(error) === "ECONNREFUSED";
}

async function readCapped(response: Response, max: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type Sent =
  | { readonly kind: "answer"; readonly status: number; readonly body: unknown }
  | { readonly kind: "not_sent" }
  | { readonly kind: "lost"; readonly cancelled: boolean };

export interface LinkOptions {
  readonly url?: string;
  readonly dataDir?: string;
  readonly tokens: TokenSource;
  readonly fetch?: FetchFn;
  readonly readFile?: (path: string) => Promise<string>;
  readonly pidAlive?: (pid: number) => boolean;
  readonly callTimeoutMs?: number;
  readonly identityTimeoutMs?: number;
}

export type CallOutcome =
  | { readonly kind: "result"; readonly result: ToolResult }
  | { readonly kind: "failure"; readonly code: ShimErrorCode | string; readonly message: string; readonly details?: Record<string, unknown> };

export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly isError: boolean;
  readonly _meta?: Record<string, unknown>;
}

const SHIM_META_KEY = "xo.market/cockpit-shim";

export function failureResult(code: string, message: string, extra: Record<string, unknown> = {}): ToolResult {
  const text = scrub(`[cockpit shim] ${code}: ${message}`);
  return { isError: true, content: [{ type: "text", text }], _meta: { [SHIM_META_KEY]: { code, ...extra } } };
}

export class DaemonLink {
  readonly #options: LinkOptions;
  readonly #fetch: FetchFn;
  #target: DaemonTarget | undefined;
  #verified = false;
  #token: string | undefined;

  constructor(options: LinkOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  // Drops what is remembered about the daemon, so the next call looks again (a restarted daemon has a new port).
  forget(): void {
    this.#target = undefined;
    this.#verified = false;
  }

  async #locate(): Promise<DaemonTarget> {
    if (this.#target === undefined) {
      this.#target = await discoverDaemon({
        ...(this.#options.url === undefined ? {} : { url: this.#options.url }),
        ...(this.#options.dataDir === undefined ? {} : { dataDir: this.#options.dataDir }),
        ...(this.#options.readFile === undefined ? {} : { readFile: this.#options.readFile }),
        ...(this.#options.pidAlive === undefined ? {} : { pidAlive: this.#options.pidAlive }),
      });
      this.#verified = false;
    }
    return this.#target;
  }

  async #send(target: DaemonTarget, path: string, init: { readonly method: "GET" | "POST"; readonly body?: string; readonly token?: string; readonly timeoutMs: number; readonly signal?: AbortSignal }): Promise<Sent> {
    // `connection: close`: no pooled socket. A pooled socket to a daemon that has since restarted fails with a reset
    // that looks like "sent but no answer"; a fresh connection fails with ECONNREFUSED, which proves nothing was sent.
    const headers: Record<string, string> = { accept: "application/json", connection: "close" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.token !== undefined) headers["authorization"] = `Bearer ${init.token}`;
    const timeout = AbortSignal.timeout(init.timeoutMs);
    const signal = init.signal === undefined ? timeout : AbortSignal.any([timeout, init.signal]);
    let response: Response;
    try {
      response = await this.#fetch(`${target.origin}${path}`, {
        method: init.method,
        headers,
        ...(init.body === undefined ? {} : { body: init.body }),
        // A redirect would carry the bearer token to wherever it points.
        redirect: "manual",
        signal,
      });
    } catch (error) {
      if (wasNotSent(error)) return { kind: "not_sent" };
      return { kind: "lost", cancelled: init.signal?.aborted === true };
    }
    let text: string | null;
    try {
      text = await readCapped(response, MAX_PROXY_RESPONSE_BYTES);
    } catch {
      return { kind: "lost", cancelled: init.signal?.aborted === true };
    }
    if (text === null) return { kind: "answer", status: response.status, body: undefined };
    let body: unknown;
    try {
      body = text === "" ? undefined : (JSON.parse(text) as unknown);
    } catch {
      body = undefined;
    }
    return { kind: "answer", status: response.status, body };
  }

  // Before the token is sent anywhere, the listener must answer an unauthenticated request the way the daemon does:
  // 401 with the contract's error body and code `unauthorized`.
  async #verify(target: DaemonTarget): Promise<"ok" | "not_sent" | "silent" | "not_cockpit"> {
    const sent = await this.#send(target, "/ui/status", { method: "GET", timeoutMs: this.#options.identityTimeoutMs ?? IDENTITY_TIMEOUT_MS });
    if (sent.kind === "not_sent") return "not_sent";
    // No answer at all (reset, timeout): nothing that could be the Cockpit replied. The token has not been sent.
    if (sent.kind === "lost") return "silent";
    if (sent.status !== 401) return "not_cockpit";
    const parsed = bridgeErrorResponseSchema.safeParse(sent.body);
    return parsed.success && parsed.data.error.code === "unauthorized" ? "ok" : "not_cockpit";
  }

  async #currentToken(): Promise<string> {
    this.#token ??= await this.#options.tokens.get();
    return this.#token;
  }

  // Is a Cockpit daemon there, and does it accept the token? For `--check` and diagnostics; sends no tool call.
  async check(): Promise<{ readonly ok: true; readonly origin: string; readonly via: DaemonTarget["via"] } | { readonly ok: false; readonly code: ShimErrorCode; readonly message: string }> {
    try {
      const outcome = await this.#connect();
      const token = await this.#currentToken();
      const sent = await this.#send(outcome, "/ui/status", { method: "GET", token, timeoutMs: this.#options.identityTimeoutMs ?? IDENTITY_TIMEOUT_MS });
      if (sent.kind !== "answer") throw new ShimError("daemon_unreachable", "The daemon did not answer.");
      // 200: status route present. 404: authenticated, but no module serves /ui/status in this build.
      if (sent.status === 200 || sent.status === 404) return { ok: true, origin: outcome.origin, via: outcome.via };
      if (sent.status === 401) throw new ShimError("token_rejected", rejectedText(this.#options.tokens.kind));
      throw new ShimError("daemon_unreachable", `The daemon answered with HTTP ${sent.status} to a status request.`);
    } catch (error) {
      if (error instanceof ShimError) return { ok: false, code: error.code, message: scrub(error.message) };
      return { ok: false, code: "daemon_unreachable", message: "The daemon could not be asked." };
    }
  }

  async #connect(): Promise<DaemonTarget> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = await this.#locate();
      if (this.#verified) return target;
      const verdict = await this.#verify(target);
      if (verdict === "ok") {
        this.#verified = true;
        return target;
      }
      this.forget();
      if (verdict === "silent") {
        throw new ShimError("daemon_unreachable", `Something is at ${target.origin} but it did not answer in time, so the agent token was not sent. Is the daemon starting up or stopped? Try again.`);
      }
      if (verdict === "not_cockpit") {
        throw new ShimError("daemon_identity", `Something is listening at ${target.origin} but it did not answer like the Cockpit daemon, so the agent token was not sent. Check the address or restart the daemon.`);
      }
      if (attempt === 1) throw notRunning(`Nothing is listening at ${target.origin}.`);
    }
    throw notRunning("The daemon is not running.");
  }

  async callTool(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallOutcome> {
    let body: string;
    try {
      body = JSON.stringify({ tool, args });
    } catch {
      return { kind: "failure", code: "request_invalid", message: "The arguments could not be encoded as JSON. Nothing was sent." };
    }
    if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
      return { kind: "failure", code: "request_invalid", message: `The arguments are larger than ${MAX_REQUEST_BODY_BYTES} bytes. Nothing was sent.` };
    }
    let tokenReloaded = false;
    let reconnected = false;
    for (;;) {
      let target: DaemonTarget;
      let token: string;
      try {
        target = await this.#connect();
        token = await this.#currentToken();
      } catch (error) {
        if (error instanceof ShimError) return { kind: "failure", code: error.code, message: error.message };
        return { kind: "failure", code: "daemon_unreachable", message: "The daemon could not be reached." };
      }
      const sent = await this.#send(target, "/ui/tool", { method: "POST", body, token, timeoutMs: this.#options.callTimeoutMs ?? CALL_TIMEOUT_MS, ...(signal === undefined ? {} : { signal }) });
      if (sent.kind === "not_sent") {
        // Provably not delivered: look the daemon up again once; it may have restarted on another port.
        this.forget();
        if (!reconnected) {
          reconnected = true;
          continue;
        }
        return { kind: "failure", code: "daemon_not_running", message: notRunning(`Nothing is listening at ${target.origin}.`).message };
      }
      if (sent.kind === "lost") {
        return {
          kind: "failure",
          code: "outcome_unknown",
          message: sent.cancelled
            ? "The call was cancelled after it was sent. It may still have run. Check the Cockpit page or the tool's status before sending it again."
            : "The daemon did not return an answer after the request was sent. The call may have run. Do not resend it blindly: check the Cockpit page (inbox and audit) or the tool's status first.",
        };
      }
      if (sent.status === 401) {
        const reloaded = tokenReloaded ? null : await this.#options.tokens.reload(token);
        tokenReloaded = true;
        if (reloaded !== null) {
          this.#token = reloaded;
          continue;
        }
        return { kind: "failure", code: "token_rejected", message: rejectedText(this.#options.tokens.kind) };
      }
      return this.#interpret(sent.status, sent.body);
    }
  }

  #interpret(status: number, body: unknown): CallOutcome {
    if (status === 200) {
      const parsed = toolCallResponseSchema.safeParse(body);
      if (!parsed.success) {
        // The daemon answered 200 and the call may have run; say so rather than "error".
        return { kind: "failure", code: "response_invalid", message: "The daemon's answer did not match its contract, so it was not used. The call may have run. Check the Cockpit page before sending it again." };
      }
      return { kind: "result", result: toToolResult(parsed.data) };
    }
    const error = bridgeErrorResponseSchema.safeParse(body);
    if (error.success) {
      const { code, message, details, retry_after_s } = error.data.error;
      return {
        kind: "failure",
        code,
        message: `${message}${retry_after_s === undefined ? "" : ` Retry after ${retry_after_s} s.`}`,
        ...(details === undefined ? {} : { details }),
      };
    }
    return { kind: "failure", code: "response_invalid", message: `The daemon answered HTTP ${status} with a body outside its contract.` };
  }
}

function rejectedText(kind: TokenSource["kind"]): string {
  const how =
    kind === "file"
      ? "The token file was read again and has not changed. Put the current token in it (`serve --rotate-agent-token` prints a new one once)."
      : `The token comes from ${TOKEN_ENV}, which cannot change while the shim runs. Update it (or use ${TOKEN_FILE_ENV}) and restart the agent's connection.`;
  return `The daemon rejected the agent token: it was rotated, revoked or is wrong. ${how}`;
}

function toToolResult(response: z.infer<typeof toolCallResponseSchema>): ToolResult {
  const structured = response.structured;
  const isObject = typeof structured === "object" && structured !== null && !Array.isArray(structured);
  let text = response.text;
  if (text === null || text === "") {
    if (structured !== null) text = JSON.stringify(structured);
    else if (response.error !== null) text = `${response.error.code}: ${response.error.message}`;
    else text = "";
  }
  return {
    isError: !response.ok,
    content: [{ type: "text", text: scrub(text) }],
    ...(isObject ? { structuredContent: JSON.parse(scrub(JSON.stringify(structured))) as Record<string, unknown> } : {}),
  };
}

// ---- the MCP server -------------------------------------------------------------------------------------------------------

export interface ShimOptions extends Omit<LinkOptions, "tokens"> {
  readonly tokens: TokenSource;
  readonly catalog?: ToolCatalog;
  // Share one link across server instances (the stdio entry may build two: one per protocol era).
  readonly link?: DaemonLink;
  // Diagnostics only (never a token, never a request body). Default: ignore.
  readonly log?: (line: string) => void;
}

const INSTRUCTIONS =
  "These are the XO Market Cockpit tools. Each call is forwarded to the Cockpit daemon that is running on this computer, which holds the ledger, the caps and the flags; this connection holds none of them. If a call says the daemon is not running, ask the user to start it in their own terminal. A write needs the user to arm the Cockpit page first. If a call says outcome_unknown, do not send it again before checking the Cockpit page.";

export interface ShimServer {
  readonly server: Server;
  readonly link: DaemonLink;
}

// Loads the definitions once; a failed load is not remembered, so the next call tries again.
export function memoCatalog(catalog: ToolCatalog): ToolCatalog {
  let loaded: Promise<readonly ToolDefinition[]> | undefined;
  return () => {
    loaded ??= catalog().catch((error: unknown) => {
      loaded = undefined;
      throw error;
    });
    return loaded;
  };
}

export function createShimServer(options: ShimOptions): ShimServer {
  const link = options.link ?? new DaemonLink(options);
  const tools = memoCatalog(options.catalog ?? inProcessCatalog());

  const server = new Server({ name: SHIM_SERVER_NAME, version: SHIM_VERSION }, { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS });

  server.setRequestHandler("tools/list", async () => {
    try {
      return { tools: [...(await tools())] } as never;
    } catch {
      options.log?.("tool definitions could not be loaded");
      throw new ProtocolError(ProtocolErrorCode.InternalError, "The tool definitions could not be loaded.");
    }
  });

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const name = request.params.name;
    const rawArgs = request.params.arguments;
    if (!toolNameSchema.safeParse(name).success) {
      return failureResult("request_invalid", "The tool name is not valid. Nothing was sent.") as never;
    }
    let known: readonly ToolDefinition[];
    try {
      known = await tools();
    } catch {
      return failureResult("catalog_unavailable", "The tool definitions could not be loaded, so the call was not checked or sent.") as never;
    }
    if (!known.some((tool) => tool.name === name)) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, "Unknown tool.");
    }
    if (rawArgs !== undefined && (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs))) {
      return failureResult("request_invalid", "The arguments must be a JSON object. Nothing was sent.") as never;
    }
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    if (Object.keys(args).some((key) => key === "" || key.length > 64)) {
      return failureResult("request_invalid", "An argument name is empty or longer than 64 characters. Nothing was sent.") as never;
    }
    const outcome = await link.callTool(name, args, ctx.mcpReq.signal);
    if (outcome.kind === "result") return outcome.result as never;
    options.log?.(`call refused or failed: ${outcome.code}`);
    return failureResult(outcome.code, outcome.message, outcome.details === undefined ? {} : { details: outcome.details }) as never;
  });

  return { server, link };
}

// ---- command line ---------------------------------------------------------------------------------------------------------

export interface ShimArgs {
  readonly url?: string;
  readonly dataDir?: string;
  readonly tokenFile?: string;
  readonly check: boolean;
  readonly help: boolean;
}

export const SHIM_USAGE = `xo-market cockpit shim: forwards an MCP client's tool calls to the running Cockpit daemon.

usage: shim [--data-dir <abs path>] [--url http://127.0.0.1:<port>] [--token-file <path>] [--check]

  --data-dir    where the daemon's data directory is (default: the same place \`serve\` uses; XO_DATA_DIR)
  --url         the daemon's address, instead of reading <data dir>/cockpit/daemon.json (${URL_ENV})
  --token-file  a file (mode 600) that holds the agent token the daemon printed (${TOKEN_FILE_ENV})
                or set ${TOKEN_ENV} in the client's environment
  --check       say whether the daemon is running and accepts the token, then exit

This process holds no ledger or key. It never starts a daemon or an embedded relay.
`;

export function parseShimArgs(argv: readonly string[]): ShimArgs | { readonly error: string } {
  let url: string | undefined;
  let dataDir: string | undefined;
  let tokenFile: string | undefined;
  let check = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    const value = (): string | undefined => {
      index += 1;
      return argv[index];
    };
    if (arg === "--check") check = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--url" || arg === "--data-dir" || arg === "--token-file") {
      const next = value();
      if (next === undefined || next === "" || next.startsWith("--")) return { error: `${arg} needs a value.` };
      if (arg === "--url") url = next;
      else if (arg === "--data-dir") dataDir = next;
      else tokenFile = next;
    } else if (arg === "--token" || arg.startsWith("--token=")) {
      // A token on the command line would show in the process list.
      return { error: `Pass the token in a file (--token-file) or in ${TOKEN_ENV}, not on the command line.` };
    } else return { error: `Unknown option ${arg.slice(0, 40)}.` };
  }
  return { ...(url === undefined ? {} : { url }), ...(dataDir === undefined ? {} : { dataDir }), ...(tokenFile === undefined ? {} : { tokenFile }), check, help };
}

type Env = Readonly<Record<string, string | undefined>>;

export interface ShimIo {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

// Settings from arguments first, then the environment. The token never comes from the command line.
export function shimOptionsFrom(args: ShimArgs, env: Env): ShimOptions {
  const tokenFile = args.tokenFile ?? env[TOKEN_FILE_ENV];
  const tokens = tokenFile !== undefined && tokenFile !== "" ? fileTokenSource(tokenFile) : envTokenSource(env[TOKEN_ENV]);
  const url = args.url ?? env[URL_ENV];
  const dataDir = args.dataDir ?? (url === undefined || url === "" ? resolveDataDir(env as Record<string, string | undefined>) : undefined);
  return { tokens, ...(url === undefined || url === "" ? {} : { url }), ...(dataDir === undefined ? {} : { dataDir }) };
}

export interface ShimHandle {
  close(): Promise<void>;
}

export interface ShimDeps {
  // Tests: replaces serveStdio, so no real stdio is touched.
  readonly serve?: (factory: () => Server, onError: (error: Error) => void) => ShimHandle;
  readonly catalog?: ToolCatalog;
  readonly fetch?: FetchFn;
}

// Returns an exit code for the one-shot forms (--help, --check, a bad option), or undefined and a handle once the
// shim is serving MCP on stdio. The caller exits when stdin ends.
export async function runShimCli(
  argv: readonly string[],
  env: Env = process.env,
  io: ShimIo = { stdout: process.stdout, stderr: process.stderr },
  deps: ShimDeps = {},
): Promise<{ readonly exit: number } | { readonly handle: ShimHandle }> {
  const args = parseShimArgs(argv);
  if ("error" in args) {
    io.stderr.write(`error: ${args.error}\n${SHIM_USAGE}`);
    return { exit: 2 };
  }
  if (args.help) {
    io.stdout.write(SHIM_USAGE);
    return { exit: 0 };
  }
  let options: ShimOptions;
  try {
    options = shimOptionsFrom(args, env);
  } catch (error) {
    io.stderr.write(`error: ${error instanceof Error ? scrub(error.message) : "the data directory could not be resolved"}\n`);
    return { exit: 2 };
  }
  options = { ...options, ...(deps.catalog === undefined ? {} : { catalog: deps.catalog }), ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }) };
  if (args.check) {
    const verdict = await new DaemonLink(options).check();
    if (verdict.ok) {
      io.stdout.write(`ok: the Cockpit daemon at ${verdict.origin} accepts the agent token.\n`);
      return { exit: 0 };
    }
    io.stdout.write(`${verdict.code}: ${verdict.message}\n`);
    return { exit: 1 };
  }
  const log = (line: string): void => {
    io.stderr.write(`xo-market cockpit shim: ${scrub(line)}\n`);
  };
  // One link and one catalogue for the whole process, however many server instances the stdio entry asks for.
  const link = new DaemonLink(options);
  const catalog = memoCatalog(options.catalog ?? inProcessCatalog());
  const factory = (): Server => createShimServer({ ...options, catalog, link, log }).server;
  const handle = deps.serve !== undefined ? deps.serve(factory, () => log("protocol error")) : await serveOverStdio(factory, log);
  return { handle };
}

async function serveOverStdio(factory: () => Server, log: (line: string) => void): Promise<ShimHandle> {
  const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
  return serveStdio(factory as never, {
    // The class of the problem only: a message could quote a request.
    onerror: (error) => log(`protocol error (${error.name})`),
  });
}
