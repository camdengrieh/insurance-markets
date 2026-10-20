import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InMemoryTransport } from "@modelcontextprotocol/server";

import { mintAgentToken } from "../../auth.js";
import { COCKPIT_DIR_NAME } from "../../auth.js";
import { createShimServer, DAEMON_INFO_FILENAME, type ShimOptions, type ToolDefinition } from "../../shim.js";
import { seededRandom } from "../server/helpers.js";

// Shared setup for the shim tests: a scripted fake Cockpit daemon on a real loopback socket, a temp data
// directory with the daemon's info file, token files, a fixed tool catalogue, and an MCP client wired to the
// shim over an in-memory transport (no stdio, no network beyond loopback).

export const TOKEN_A = mintAgentToken(seededRandom("shim-token-a"));
export const TOKEN_B = mintAgentToken(seededRandom("shim-token-b"));

export const CATALOG: readonly ToolDefinition[] = [
  { name: "xo_search", description: "Search markets.", inputSchema: { type: "object", properties: { query: { type: "string" } } }, annotations: { readOnlyHint: true } },
  { name: "xo_prepare_order", description: "Prepare an order.", inputSchema: { type: "object", properties: {} }, _meta: { "anthropic/requiresUserInteraction": true } },
  { name: "xo_submit_order", description: "Submit an order.", inputSchema: { type: "object", properties: {} }, _meta: { "anthropic/requiresUserInteraction": true } },
];

export function fixedCatalog(): () => Promise<readonly ToolDefinition[]> {
  return async () => CATALOG;
}

export interface Scratch {
  readonly dir: string;
  daemonFile(info: { port: number; pid?: number }): string;
  removeDaemonFile(): void;
  tokenFile(token: string, mode?: number): string;
  cleanup(): void;
}

export function scratch(): Scratch {
  const dir = mkdtempSync(join(tmpdir(), "shim-test-"));
  const cockpit = join(dir, COCKPIT_DIR_NAME);
  mkdirSync(cockpit, { recursive: true, mode: 0o700 });
  return {
    dir,
    daemonFile(info) {
      const file = join(cockpit, DAEMON_INFO_FILENAME);
      writeFileSync(file, `${JSON.stringify({ version: "0.0.0-test", port: info.port, pid: info.pid ?? process.pid, started_at: "2026-10-19T12:00:00.000Z" })}\n`, { mode: 0o600 });
      return file;
    },
    removeDaemonFile() {
      rmSync(join(cockpit, DAEMON_INFO_FILENAME), { force: true });
    },
    tokenFile(token, mode = 0o600) {
      const file = join(dir, "agent-token");
      writeFileSync(file, `${token}\n`, { mode });
      chmodSync(file, mode);
      return file;
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ---- the fake daemon -----------------------------------------------------------------------------------------------------

export interface SeenRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
}

export interface ToolReply {
  readonly status?: number;
  readonly body?: unknown;
  // Closes the socket without answering (the request already arrived).
  readonly drop?: boolean;
  // Never answers.
  readonly hang?: boolean;
}

export interface FakeDaemon {
  readonly port: number;
  readonly origin: string;
  readonly seen: SeenRequest[];
  // Tokens the daemon accepts; replace it to simulate a rotation.
  accepted: string;
  // What POST /ui/tool answers (default: a plain success).
  onTool: (request: { readonly tool: string; readonly args: Record<string, unknown> }, seen: SeenRequest) => ToolReply;
  // Behaviour of the unauthenticated identity probe.
  identity: "cockpit" | "wrong_status" | "wrong_body";
  close(): Promise<void>;
}

export function okAnswer(tool: string, structured: unknown = { outcome: "ok" }, text: string | null = "done"): unknown {
  return { tool, tool_class: "read", ok: true, duration_ms: 3, structured, text, error: null };
}

export function errorBody(code: string, message = "refused", extra: Record<string, unknown> = {}): unknown {
  return { error: { code, message, ...extra } };
}

export async function startFakeDaemon(options: { readonly port?: number } = {}): Promise<FakeDaemon> {
  const seen: SeenRequest[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const state: FakeDaemon = {
    port: 0,
    origin: "",
    seen,
    accepted: TOKEN_A,
    onTool: (request) => ({ status: 200, body: okAnswer(request.tool) }),
    identity: "cockpit",
    close: async () => undefined,
  };
  const server: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const record: SeenRequest = { method: req.method ?? "", path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      seen.push(record);
      const reply = (status: number, body: unknown): void => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const authorised = req.headers["authorization"] === `Bearer ${state.accepted}`;
      if (req.url === "/ui/status") {
        if (!authorised && req.headers["authorization"] === undefined) {
          if (state.identity === "wrong_status") return reply(200, { hello: "not the cockpit" });
          if (state.identity === "wrong_body") return reply(401, { nope: true });
          return reply(401, errorBody("unauthorized", "A valid bearer token is required."));
        }
        return authorised ? reply(404, errorBody("not_found", "No such route.")) : reply(401, errorBody("unauthorized", "A valid bearer token is required."));
      }
      if (req.url === "/ui/tool" && req.method === "POST") {
        if (!authorised) return reply(401, errorBody("unauthorized", "A valid bearer token is required."));
        const parsed = JSON.parse(record.body) as { tool: string; args: Record<string, unknown> };
        const answer = state.onTool(parsed, record);
        if (answer.hang === true) return;
        if (answer.drop === true) {
          req.socket.destroy();
          return;
        }
        return reply(answer.status ?? 200, answer.body ?? okAnswer(parsed.tool));
      }
      return reply(404, errorBody("not_found", "No such route."));
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  Object.assign(state, {
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  });
  return state;
}

// A port with nothing listening on it.
export async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

// ---- an MCP client for the shim ------------------------------------------------------------------------------------------

export interface McpReply {
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number; readonly message: string };
}

export interface ShimClient {
  request(method: string, params?: Record<string, unknown>, signalAbort?: () => void): Promise<McpReply>;
  call(name: string, args?: Record<string, unknown>): Promise<McpReply>;
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
  // Sends a call and returns before it finishes, with the id to cancel.
  begin(name: string, args?: Record<string, unknown>): { readonly id: number; readonly done: Promise<McpReply> };
  cancel(id: number): Promise<void>;
  close(): Promise<void>;
}

const ERA = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "shim-test", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};

export async function connectShim(options: ShimOptions): Promise<ShimClient & { readonly shim: ReturnType<typeof createShimServer> }> {
  const shim = createShimServer({ catalog: fixedCatalog(), ...options });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await shim.server.connect(serverSide);
  const pending = new Map<number, (reply: McpReply) => void>();
  clientSide.onmessage = (message) => {
    const id = (message as { id?: unknown }).id;
    if (typeof id === "number") pending.get(id)?.(message as unknown as McpReply);
  };
  await clientSide.start();
  let next = 1;
  const begin = (method: string, params: Record<string, unknown>): { id: number; done: Promise<McpReply> } => {
    const id = next++;
    const done = new Promise<McpReply>((resolve) => {
      pending.set(id, resolve);
    });
    void clientSide.send({ jsonrpc: "2.0", id, method, params: { ...params, _meta: ERA } } as never);
    return { id, done };
  };
  return {
    shim,
    request: (method, params = {}) => begin(method, params).done,
    call: (name, args = {}) => begin("tools/call", { name, arguments: args }).done,
    begin: (name, args = {}) => begin("tools/call", { name, arguments: args }),
    async notify(method, params = {}) {
      await clientSide.send({ jsonrpc: "2.0", method, params } as never);
    },
    async cancel(id) {
      await clientSide.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: id, reason: "test", _meta: ERA } } as never);
    },
    async close() {
      await clientSide.close().catch(() => undefined);
      await shim.server.close().catch(() => undefined);
    },
  };
}

export function textOf(reply: McpReply): string {
  const content = reply.result?.["content"] as Array<{ text?: string }> | undefined;
  return (content ?? []).map((part) => part.text ?? "").join("\n");
}

export function shimCode(reply: McpReply): string | undefined {
  const meta = reply.result?.["_meta"] as Record<string, { code?: string }> | undefined;
  return meta?.["xo.market/cockpit-shim"]?.code;
}
