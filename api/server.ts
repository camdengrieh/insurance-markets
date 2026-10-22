import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import { ApiError, ERROR_STATUS, type Api, type ErrorCode } from "./app.js";
import type { ApiConfig, RateLimitSpec } from "./config.js";
import { checkBody, ServingViolation, type ServingPolicy } from "./serving.js";

// The API's HTTP server: node:http, no framework (relay/server.ts is the pattern).
//
// Pipeline, in this order:
//   1. shutting down: 503;
//   2. the method: GET and HEAD, and OPTIONS for a CORS preflight; anything else is 405;
//   3. size: a URL over the limit is 414; a request that declares or sends a body is 413 (every free route is a GET);
//   4. the client address (the socket's, or X-Forwarded-For through exactly the configured number of proxies) and its
//      token bucket for the route's class: over the limit is 429 with Retry-After;
//   5. the route and its query, validated; then the handler;
//   6. every 2xx body is walked by the serving check (serving.ts) before it is sent.
// Errors are JSON with a fixed code: { "error": { "code", "message" } }. Every answer carries x-request-id, cache-control
// no-store (no shared cache may present an old answer as new), nosniff and no-referrer; CORS headers only for a configured
// origin.

interface Bucket {
  tokens: number;
  at: number;
}

// Token buckets per key with a bounded table (least recently used goes first).
export class TokenBuckets {
  readonly #buckets = new Map<string, Bucket>();
  readonly #max: number;
  constructor(max = 20_000) {
    this.#max = max;
  }
  take(key: string, spec: RateLimitSpec, nowMs: number): { readonly allowed: boolean; readonly retryAfterMs: number; readonly remaining: number } {
    const bucket = this.#buckets.get(key) ?? { tokens: spec.capacity, at: nowMs };
    bucket.tokens = Math.min(spec.capacity, bucket.tokens + (Math.max(0, nowMs - bucket.at) * spec.refillPerSecond) / 1000);
    bucket.at = nowMs;
    let result;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      result = { allowed: true, retryAfterMs: 0, remaining: Math.floor(bucket.tokens) };
    } else {
      result = { allowed: false, retryAfterMs: Math.ceil(((1 - bucket.tokens) * 1000) / spec.refillPerSecond), remaining: 0 };
    }
    this.#buckets.delete(key);
    this.#buckets.set(key, bucket);
    while (this.#buckets.size > this.#max) {
      const oldest = this.#buckets.keys().next().value;
      if (oldest === undefined) break;
      this.#buckets.delete(oldest);
    }
    return result;
  }
}

// The client address: the socket's, or, behind `hops` proxies that each append to X-Forwarded-For, the entry the
// outermost trusted proxy saw. A header with fewer entries than hops is not trusted.
export function clientAddress(req: IncomingMessage, hops: number): string {
  const socket = (req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
  if (hops === 0) return socket;
  const raw = req.headers["x-forwarded-for"];
  const header = Array.isArray(raw) ? raw.join(",") : raw;
  if (typeof header !== "string") return socket;
  const parts = header.split(",").map((part) => part.trim()).filter((part) => part !== "");
  const entry = parts[parts.length - hops];
  if (entry === undefined || entry.length > 64 || !/^[0-9A-Fa-f:.]+$/.test(entry)) return socket;
  return entry.replace(/^::ffff:/, "");
}

export interface ServerOptions {
  readonly api: Api;
  readonly config: ApiConfig;
  readonly policy: ServingPolicy;
  readonly nowMs?: () => number;
  readonly log?: (line: string) => void;
}

export interface RunningServer {
  readonly port: number;
  readonly origin: string;
  close(): Promise<void>;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

function errorReply(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>, headers?: Readonly<Record<string, string>>): Reply {
  return { status: ERROR_STATUS[code], body: { error: details === undefined ? { code, message } : { code, message, details } }, ...(headers === undefined ? {} : { headers }) };
}

type Route = { readonly kind: "health" | "venues" | "markets" | "groups" } | { readonly kind: "market"; readonly venue: string; readonly id: string };

function route(path: string): Route | null {
  switch (path) {
    case "/v1/health":
      return { kind: "health" };
    case "/v1/venues":
      return { kind: "venues" };
    case "/v1/markets":
      return { kind: "markets" };
    case "/v1/groups":
      return { kind: "groups" };
  }
  const match = /^\/v1\/markets\/([a-z_]{1,40})\/([^/]{1,200})$/.exec(path);
  if (match === null) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2] as string);
  } catch {
    return null;
  }
  return { kind: "market", venue: match[1] as string, id };
}

export async function startApiServer(options: ServerOptions): Promise<RunningServer> {
  const { api, config, policy } = options;
  const limits = config.limits;
  const nowMs = options.nowMs ?? Date.now;
  const log = options.log ?? (() => undefined);
  const buckets = new TokenBuckets();
  const inflight = new Set<Promise<void>>();
  let closing = false;

  function send(req: IncomingMessage, res: ServerResponse, reply: Reply, requestId: string): void {
    const payload = Buffer.from(JSON.stringify(reply.body), "utf8");
    const headers: Record<string, string | number> = {
      "content-type": "application/json; charset=utf-8",
      "content-length": payload.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-request-id": requestId,
      ...reply.headers,
    };
    const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
    if (origin !== undefined && config.corsOrigins.includes(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-expose-headers"] = "x-request-id, retry-after";
    }
    if (origin !== undefined) headers["vary"] = "Origin";
    if (closing) headers["connection"] = "close";
    res.writeHead(reply.status, headers);
    res.end(req.method === "HEAD" ? undefined : payload);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = nowMs();
    const requestId = `req_${randomBytes(6).toString("hex")}`;
    let label = "unmatched";
    const reply = (value: Reply): void => {
      send(req, res, value, requestId);
      log(`${req.method ?? "?"} ${label} ${value.status} ${Math.max(0, nowMs() - started)}ms`);
    };
    if (closing) return reply(errorReply("shutting_down", "The API is shutting down."));

    const method = req.method ?? "";
    if (method === "OPTIONS") {
      const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
      const allowed = origin !== undefined && config.corsOrigins.includes(origin);
      res.writeHead(204, {
        "cache-control": "no-store",
        "x-request-id": requestId,
        ...(origin === undefined ? {} : { vary: "Origin" }),
        ...(allowed ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, HEAD, OPTIONS", "access-control-max-age": "600" } : {}),
      });
      res.end();
      return;
    }
    if (method !== "GET" && method !== "HEAD") return reply(errorReply("method_not_allowed", "Only GET and HEAD are served.", undefined, { allow: "GET, HEAD, OPTIONS" }));
    const rawUrl = req.url ?? "";
    if (rawUrl.length > limits.maxUrlChars) return reply(errorReply("uri_too_long", `The request target is longer than ${limits.maxUrlChars} characters.`));
    const declared = req.headers["content-length"];
    if ((declared !== undefined && declared !== "0") || req.headers["transfer-encoding"] !== undefined) {
      return reply(errorReply("payload_too_large", "These routes take no request body."));
    }
    let url: URL;
    try {
      url = new URL(rawUrl, "http://api.invalid");
    } catch {
      return reply(errorReply("invalid_request", "The request target is not valid."));
    }
    if (!rawUrl.startsWith("/") || rawUrl.startsWith("//") || url.hash !== "") return reply(errorReply("invalid_request", "The request target is not valid."));
    const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    const matched = route(path);
    if (matched === null) return reply(errorReply("not_found", "No such route."));
    label = matched.kind === "market" ? "/v1/markets/:venue/:id" : path;

    const client = clientAddress(req, config.trustProxyHops);
    const cls = matched.kind === "market" || matched.kind === "markets" ? "markets" : "reads";
    const spec = cls === "markets" ? limits.markets : limits.reads;
    const taken = buckets.take(`${cls}|${client}`, spec, nowMs());
    const limitHeader = `${spec.capacity};w=${Math.round(spec.capacity / spec.refillPerSecond)}`;
    if (!taken.allowed) {
      return reply(
        errorReply("rate_limited", `Too many requests: ${spec.capacity} at once, then ${spec.refillPerSecond * 60} a minute per client for this route class.`, undefined, {
          "retry-after": String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))),
          "ratelimit-policy": limitHeader,
        }),
      );
    }

    try {
      if (matched.kind !== "markets" && [...url.searchParams.keys()].length > 0) throw new ApiError("invalid_request", "This route takes no query.");
      let body: unknown;
      switch (matched.kind) {
        case "health":
          body = api.health();
          break;
        case "venues":
          body = api.venues();
          break;
        case "markets":
          body = await api.listMarkets(url.searchParams);
          break;
        case "market":
          body = await api.market(matched.venue, matched.id);
          break;
        case "groups":
          body = api.groups();
          break;
      }
      checkBody(policy, body);
      return reply({ status: 200, body, headers: { "ratelimit-policy": limitHeader } });
    } catch (error) {
      if (error instanceof ApiError) return reply(errorReply(error.code, error.message, error.details));
      if (error instanceof ServingViolation) log(`serving check refused an answer on ${label}`);
      else log(`handler failed on ${label}: ${error instanceof Error ? error.name : "non-error"}`);
      return reply(errorReply("internal", "The API failed to answer. Nothing was sent."));
    }
  }

  const server: Server = createServer({ maxHeaderSize: limits.maxHeaderBytes, keepAlive: true }, (req, res) => {
    const task = handle(req, res).catch(() => {
      if (!res.headersSent) res.destroy();
    });
    inflight.add(task);
    void task.finally(() => inflight.delete(task));
  });
  server.headersTimeout = limits.headersTimeoutMs;
  server.requestTimeout = limits.requestTimeoutMs;
  server.keepAliveTimeout = 5_000;
  server.on("clientError", (_error, socket: Socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    else socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: config.host, port: config.port }, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
  return {
    port: address.port,
    origin: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}`,
    async close() {
      if (closing) return;
      closing = true;
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      const deadline = new Promise<void>((resolve) => setTimeout(resolve, limits.shutdownGraceMs).unref());
      await Promise.race([Promise.allSettled([...inflight]).then(() => undefined), deadline]);
      server.closeAllConnections();
      await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 1_000).unref())]);
    },
  };
}
