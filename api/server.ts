import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import { ApiError, ERROR_STATUS, type Api, type ErrorCode } from "./app.js";
import type { ApiConfig, RateLimitSpec } from "./config.js";
import type { Gate, Meter, Ticket } from "./metering.js";
import { createXoRelay } from "./xo-relay.js";

// The API's HTTP server: node:http, no framework (relay/server.ts is the pattern).
//
// Pipeline, in this order:
//   1. shutting down: 503;
//   2. the method: GET and HEAD on the free routes, GET on /v1/quote, POST on /v1/route/prepare, and OPTIONS for a CORS
//      preflight; anything else is 405;
//   3. size: a URL over the limit is 414; a GET that declares or sends a body is 413; the POST takes JSON only (415
//      otherwise) of at most the stated bytes (413);
//   4. a key in Authorization: Bearer, if any (metering.ts): a bad, revoked or expired key is 401 on every route;
//   5. the rate limit: the key's own bucket, or the client address's (the socket's, or X-Forwarded-For through exactly the
//      configured number of proxies) for the route's class: over the limit is 429 with Retry-After;
//   6. the route and its query or body, validated; on a paid route the metering gate (a key's tier, or an x402 payment
//      verified before the handler runs); then the handler;
//   7. a paid call is settled only after a good answer, and never after a failed one.
// A path under /v1/relay/ is handed whole to the XO order relay (xo-relay.ts) right after step 1: it has its own
// methods, CORS rule, size limit and rate limit, takes no key and is never metered.
// Errors are JSON with a fixed code: { "error": { "code", "message" } }; a 402 carries the x402 PaymentRequired object as
// its body and, base64, in PAYMENT-REQUIRED. Every answer carries x-request-id, cache-control no-store (no shared cache may
// present an old answer as new), nosniff and no-referrer; CORS headers only for a configured origin.

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
  readonly meter: Meter;
  readonly nowMs?: () => number;
  readonly log?: (line: string) => void;
  // The XO relay's outbound fetch (globalThis.fetch in main.ts; a fake upstream in tests). Without one the relay
  // answers upstream_unreachable for every forwarded call.
  readonly relayFetch?: typeof fetch;
  // Tests only: the relay's upstream deadline (XO_RELAY_LIMITS in xo-relay.ts otherwise).
  readonly relayUpstreamTimeoutMs?: number;
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

type Route =
  | { readonly kind: "health" | "venues" | "markets" | "groups" | "quote" | "route_prepare" }
  | { readonly kind: "market"; readonly venue: string; readonly id: string };

export const ROUTE_PREPARE_PATH = "/v1/route/prepare";

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
    case "/v1/quote":
      return { kind: "quote" };
    case ROUTE_PREPARE_PATH:
      return { kind: "route_prepare" };
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

// The methods a path answers, for 405 and the CORS preflight.
function allowedMethods(path: string): string {
  if (path === ROUTE_PREPARE_PATH) return "POST, OPTIONS";
  if (path === "/v1/quote") return "GET, OPTIONS";
  return "GET, HEAD, OPTIONS";
}

function normalPath(rawUrl: string): string {
  try {
    const pathname = new URL(rawUrl, "http://api.invalid").pathname;
    return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  } catch {
    return "";
  }
}

class BodyError extends Error {
  readonly code: "payload_too_large" | "invalid_request";
  constructor(code: "payload_too_large" | "invalid_request", message: string) {
    super(message);
    this.code = code;
  }
}

// The request body as JSON, at most `max` bytes.
function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      total += chunk.length;
      if (total > max) {
        done = true;
        reject(new BodyError("payload_too_large", `The body is larger than ${max} bytes.`));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch {
        reject(new BodyError("invalid_request", "The body is not JSON."));
      }
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      reject(new BodyError("invalid_request", "The body could not be read."));
    });
  });
}

export async function startApiServer(options: ServerOptions): Promise<RunningServer> {
  const { api, config, meter } = options;
  const limits = config.limits;
  const nowMs = options.nowMs ?? Date.now;
  const log = options.log ?? (() => undefined);
  const buckets = new TokenBuckets();
  const relay = createXoRelay({
    enabled: config.xoRelay,
    limit: limits.relay,
    maxUrlChars: limits.maxUrlChars,
    ...(options.relayUpstreamTimeoutMs === undefined ? {} : { upstreamTimeoutMs: options.relayUpstreamTimeoutMs }),
    fetchImpl: options.relayFetch ?? (async () => Promise.reject(new Error("no relay fetch"))),
  });
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
      headers["access-control-expose-headers"] = "x-request-id, retry-after, payment-required, payment-response";
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
    const rawUrl = req.url ?? "";
    const path = normalPath(rawUrl);
    if (relay.owns(path)) {
      return relay.handle(req, res, path, {
        requestId,
        client: clientAddress(req, config.trustProxyHops),
        nowMs,
        takeToken: (key, spec) => buckets.take(key, spec, nowMs()),
        closing: () => closing,
        log,
      });
    }
    if (method === "OPTIONS") {
      const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
      const allowed = origin !== undefined && config.corsOrigins.includes(origin);
      res.writeHead(204, {
        "cache-control": "no-store",
        "x-request-id": requestId,
        ...(origin === undefined ? {} : { vary: "Origin" }),
        ...(allowed
          ? {
              "access-control-allow-origin": origin,
              "access-control-allow-methods": allowedMethods(path),
              "access-control-allow-headers": "authorization, content-type, payment-signature",
              "access-control-max-age": "600",
            }
          : {}),
      });
      res.end();
      return;
    }
    const isPost = path === ROUTE_PREPARE_PATH;
    const methodOk = isPost ? method === "POST" : path === "/v1/quote" ? method === "GET" : method === "GET" || method === "HEAD";
    if (!methodOk) {
      return reply(errorReply("method_not_allowed", `This route answers ${allowedMethods(path).replace(", OPTIONS", "")} only.`, undefined, { allow: allowedMethods(path) }));
    }
    if (rawUrl.length > limits.maxUrlChars) return reply(errorReply("uri_too_long", `The request target is longer than ${limits.maxUrlChars} characters.`));
    const declared = req.headers["content-length"];
    if (!isPost && ((declared !== undefined && declared !== "0") || req.headers["transfer-encoding"] !== undefined)) {
      return reply(errorReply("payload_too_large", "These routes take no request body."));
    }
    if (isPost) {
      const type = req.headers["content-type"];
      if (typeof type !== "string" || !/^application\/json(\s*;\s*charset=utf-8)?$/i.test(type.trim())) return reply(errorReply("unsupported_media_type", "The body must be application/json."));
      if (declared !== undefined && (!/^[0-9]{1,9}$/.test(declared) || Number(declared) > limits.maxBodyBytes)) return reply(errorReply("payload_too_large", `The body is larger than ${limits.maxBodyBytes} bytes.`));
    }
    let url: URL;
    try {
      url = new URL(rawUrl, "http://api.invalid");
    } catch {
      return reply(errorReply("invalid_request", "The request target is not valid."));
    }
    if (!rawUrl.startsWith("/") || rawUrl.startsWith("//") || url.hash !== "") return reply(errorReply("invalid_request", "The request target is not valid."));
    const matched = route(path);
    if (matched === null) return reply(errorReply("not_found", "No such route."));
    label = matched.kind === "market" ? "/v1/markets/:venue/:id" : path;

    const auth = meter.authenticate(req.headers["authorization"]);
    if (auth.kind === "refused") return reply(errorReply("unauthorized", auth.message, undefined, { "www-authenticate": "Bearer" }));
    const paid = matched.kind === "quote" || matched.kind === "route_prepare";
    const client = clientAddress(req, config.trustProxyHops);
    const cls = matched.kind === "market" || matched.kind === "markets" ? "markets" : paid ? "paid" : "reads";
    const spec = auth.kind === "key" ? auth.limit : cls === "markets" ? limits.markets : cls === "paid" ? limits.paid : limits.reads;
    const taken = buckets.take(auth.kind === "key" ? `key|${auth.row.id}` : `${cls}|${client}`, spec, nowMs());
    const limitHeader = `${spec.capacity};w=${Math.round(spec.capacity / spec.refillPerSecond)}`;
    if (!taken.allowed) {
      return reply(
        errorReply("rate_limited", auth.kind === "key" ? `Too many requests for this key: ${spec.capacity} at once, then ${Math.round(spec.refillPerSecond * 60)} a minute.` : `Too many requests: ${spec.capacity} at once, then ${spec.refillPerSecond * 60} a minute per client for this route class.`, undefined, {
          "retry-after": String(Math.max(1, Math.ceil(taken.retryAfterMs / 1000))),
          "ratelimit-policy": limitHeader,
        }),
      );
    }

    let body: unknown = undefined;
    if (isPost) {
      try {
        body = await readJson(req, limits.maxBodyBytes);
      } catch (error) {
        if (error instanceof BodyError) return reply(errorReply(error.code, error.message));
        return reply(errorReply("invalid_request", "The body could not be read."));
      }
    }

    let ticket: Ticket | null = null;
    if (paid) {
      // A malformed request is refused before any payment is asked for (route prepare: unless it is off, which says so).
      if (matched.kind === "quote" || config.routePrepare !== "off") {
        try {
          api.checkPaid(matched.kind, url.searchParams, body);
        } catch (error) {
          if (error instanceof ApiError) return reply(errorReply(error.code, error.message, error.details));
          throw error;
        }
      }
      let gate: Gate;
      try {
        gate = await meter.gate({ route: matched.kind, path, target: `${url.pathname}${url.search}`, paymentHeader: req.headers["payment-signature"] }, auth);
      } catch {
        log(`metering failed on ${label}`);
        return reply(errorReply("internal", "The API failed to answer. Nothing was charged."));
      }
      if (gate.kind === "reply") return reply(gate.reply);
      if (gate.kind === "paid") ticket = gate.ticket;
    }

    let answer: unknown;
    try {
      if (matched.kind !== "markets" && matched.kind !== "quote" && [...url.searchParams.keys()].length > 0) throw new ApiError("invalid_request", "This route takes no query.");
      switch (matched.kind) {
        case "health":
          answer = { ...api.health(), metering: meter.describe() };
          break;
        case "venues":
          answer = api.venues();
          break;
        case "markets":
          answer = await api.listMarkets(url.searchParams);
          break;
        case "market":
          answer = await api.market(matched.venue, matched.id);
          break;
        case "groups":
          answer = api.groups();
          break;
        case "quote":
          answer = await api.quote(url.searchParams);
          break;
        case "route_prepare":
          answer = await api.routePrepare(body);
          break;
      }
    } catch (error) {
      // A failed answer is never settled: the payment's claim is released and nothing is charged.
      if (ticket !== null) meter.release(ticket);
      if (error instanceof ApiError) return reply(errorReply(error.code, error.message, error.details));
      log(`handler failed on ${label}: ${error instanceof Error ? error.name : "non-error"}`);
      return reply(errorReply("internal", "The API failed to answer. Nothing was sent."));
    }
    if (ticket === null) return reply({ status: 200, body: answer, headers: { "ratelimit-policy": limitHeader } });
    let settled;
    try {
      settled = await meter.settle(ticket);
    } catch {
      log(`settlement failed on ${label}`);
      return reply({ status: 200, body: answer, headers: { "ratelimit-policy": limitHeader } });
    }
    if (!settled.deliver) return reply(settled.reply);
    return reply({ status: 200, body: answer, headers: { "ratelimit-policy": limitHeader, ...settled.headers } });
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
