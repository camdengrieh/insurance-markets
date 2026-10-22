import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

import {
  CONTRACT_ROUTE_KEYS,
  GET_ROUTES,
  isPostPath,
  matchGetRoute,
  POST_ROUTES,
  RELAY_KEY_HEADER,
  type RouteKey,
} from "../src/relay/contract.js";
import { ERROR_HTTP_STATUS, RelayError, toRelayErrorBody, type ErrorCode, type RelayErrorBody } from "../src/relay/errors.js";
import type { Flags } from "../src/relay/flags.js";
import { checkHost, checkOrigin, isLoopbackAddress, normaliseClientAddress, TokenBuckets, type RelayKeyring } from "./auth.js";
import type { RelayAudit } from "./audit.js";
import { DEFAULT_HTTP, RELAY_BIND_HOST, type RelayHttpConfig } from "./config.js";
import { checkOwnerScopedRead, OWNER_WRITE_ROUTES, SUBMIT_ROUTES, type OwnerGate } from "./owners.js";
import { keepPreparedAnswer, withDecodedBlock } from "./prepared.js";
import { routes as defaultRoutes } from "./routes.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";

// The relay's HTTP server (docs/phase1-gap-closing.md sections 5.4 and 9 A5, D6).
//
// Pipeline, in this order, each step with a test:
//   1. the peer must be a loopback address, the Host must be the bound address and any Origin must be
//      the relay's own (DNS rebinding and CSRF to localhost end here);
//   2. too many failed key checks from one address are refused before the key is even looked at;
//   3. X-Relay-Key, in constant time, with a second key accepted during rotation;
//   4. the route: unknown path is `not_found`, a known path with the wrong method is a 405;
//   5. the kill switch refuses every write route (and a route that is not on the read list counts as
//      a write route, so a route added to the contract later is refused until it is classified);
//   6. a per-address, per-endpoint token bucket;
//   7. the body: a size cap, JSON only, strict schema validation against src/relay/contract.ts;
//   8. the handler, answered within the request budget (6 s): if it is still running, the caller gets
//      `pending` and the handler finishes in the background. The response is validated against the
//      contract before it is sent, and anything that is not a RelayError becomes a fixed `internal`.
//
// Every response carries `x-request-id`, `cache-control: no-store` and no CORS header, ever.

// Read routes: they change nothing and reserve nothing. Anything else is a write route.
export const READ_ROUTE_KEYS: ReadonlySet<RouteKey> = new Set<RouteKey>([
  "GET /v1/health",
  "GET /v1/userop/:hash",
  "GET /v1/order/:hash",
  "GET /v1/prepared/:id",
  "POST /v1/account/status",
  "POST /v1/orders/list",
  "POST /v1/creation/track",
]);
export const WRITE_ROUTE_KEYS: readonly RouteKey[] = Object.freeze(CONTRACT_ROUTE_KEYS.filter((key) => !READ_ROUTE_KEYS.has(key)));
const WRITE_SET: ReadonlySet<string> = new Set(WRITE_ROUTE_KEYS);

export interface ServerOptions {
  readonly keyring: RelayKeyring;
  readonly services: RelayServices;
  // Read on every request: the effective flags (kill switch included).
  readonly flags: () => Flags;
  readonly routes?: RouteTable;
  readonly now?: () => number;
  readonly newRequestId?: () => string;
  readonly audit?: RelayAudit;
  // Which owners may start writes (relay/owners.ts). Absent: any owner, as a bare test relay does.
  readonly owners?: OwnerGate;
  // 0 picks a free port.
  readonly port: number;
  readonly http?: Partial<RelayHttpConfig>;
}

export interface RunningServer {
  readonly host: typeof RELAY_BIND_HOST;
  readonly port: number;
  readonly origin: string;
  // Number of requests whose handler has not finished (including ones answered `pending`).
  inflight(): number;
  // Stops accepting, lets running handlers finish for up to the grace period, then closes.
  close(options?: { readonly graceMs?: number }): Promise<void>;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly code?: ErrorCode;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

const JSON_CONTENT_TYPE = /^application\/json\s*(?:;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;
const PENDING_BODY = {
  error: { code: "pending", message: "Still in flight. The relay is finishing this in the background; poll the status route." },
} as const;

function errorReply(code: ErrorCode, message: string, details?: RelayErrorBody["details"], status?: number): Reply {
  const body: RelayErrorBody = details === undefined ? { code, message } : { code, message, details };
  return { status: status ?? ERROR_HTTP_STATUS[code], body: { error: body }, code };
}

function replyFromError(error: unknown): Reply {
  const body = toRelayErrorBody(error);
  return { status: ERROR_HTTP_STATUS[body.code], body: { error: body }, code: body.code };
}

// A path made only of safe characters, no query, no fragment, no traversal.
function parseTarget(raw: string | undefined): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: "query" | "shape" } {
  if (raw === undefined || raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//")) return { ok: false, reason: "shape" };
  if (raw.includes("?") || raw.includes("#")) return { ok: false, reason: "query" };
  if (!/^\/[A-Za-z0-9/_:.-]*$/.test(raw) || raw.includes("..") || raw.includes("//")) return { ok: false, reason: "shape" };
  return { ok: true, path: raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw };
}

// JSON.parse keeps a key named __proto__ as plain data. The schemas would ignore it, but a request
// that carries one is either broken or probing, so it is refused outright. Iterative, so a deeply
// nested body cannot exhaust the stack.
function hasForbiddenKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current !== "object" || current === null) continue;
    visited += 1;
    if (visited > 20_000) return true;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const key of Object.keys(current)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
      stack.push((current as Record<string, unknown>)[key]);
    }
  }
  return false;
}

function safeFieldName(part: PropertyKey): string {
  return String(part).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
}

export async function startRelayServer(options: ServerOptions): Promise<RunningServer> {
  const http: RelayHttpConfig = { ...DEFAULT_HTTP, ...options.http };
  const now = options.now ?? Date.now;
  const table = options.routes ?? defaultRoutes;
  const newRequestId = options.newRequestId ?? ((): string => `req_${randomBytes(6).toString("hex")}`);
  const buckets = new TokenBuckets();
  const background = new Set<Promise<unknown>>();
  let closing = false;
  let boundPort = 0;

  const server: Server = createServer({ maxHeaderSize: http.maxHeaderBytes, keepAlive: true }, (req, res) => {
    const task = handle(req, res).catch(() => {
      // handle() answers every request itself; this only keeps an unexpected throw from becoming
      // an unhandled rejection. The socket is closed rather than left half-answered.
      if (!res.headersSent) {
        try {
          send(res, errorReply("internal", "The relay failed unexpectedly. Nothing was sent."), "req_unknown");
        } catch {
          res.destroy();
        }
      } else res.destroy();
    });
    background.add(task);
    void task.finally(() => background.delete(task));
  });
  server.headersTimeout = http.headersTimeoutMs;
  server.requestTimeout = http.requestTimeoutMs;
  server.keepAliveTimeout = 5_000;
  server.on("clientError", (_error, socket: Socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    else socket.destroy();
  });

  function send(res: ServerResponse, reply: Reply, requestId: string, closeConnection = false): void {
    const payload = Buffer.from(JSON.stringify(reply.body), "utf8");
    const headers: Record<string, string | number> = {
      "content-type": "application/json; charset=utf-8",
      "content-length": payload.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
      ...reply.extraHeaders,
    };
    if (closeConnection || closing) headers["connection"] = "close";
    res.writeHead(reply.status, headers);
    res.end(payload);
  }

  function readBody(req: IncomingMessage, limit: number): Promise<Buffer | "too_large" | "aborted"> {
    return new Promise((resolve) => {
      const declared = Number(req.headers["content-length"]);
      if (Number.isFinite(declared) && declared > limit) {
        resolve("too_large");
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      const done = (value: Buffer | "too_large" | "aborted"): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > limit) {
          done("too_large");
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => done(Buffer.concat(chunks)));
      req.on("error", () => done("aborted"));
      req.on("close", () => done("aborted"));
    });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = now();
    const requestId = newRequestId();
    let routeKey: RouteKey | undefined;
    let replied: Reply | undefined;
    const reply = (value: Reply, closeConnection = false): void => {
      replied = value;
      send(res, value, requestId, closeConnection);
    };
    const note = (outcome: "ok" | "refused" | "error" | "pending", final: Reply | undefined = replied): void => {
      void options.audit?.write({
        ev: outcome === "refused" ? "refused" : "request",
        rid: requestId,
        route: routeKey ?? "unmatched",
        status: final?.status ?? 200,
        ...(final?.code === undefined ? {} : { code: final.code }),
        outcome,
        ms: Math.max(0, now() - startedAt),
      });
    };

    // 0. Shutting down.
    if (closing) {
      reply(errorReply("internal", "The relay is shutting down.", undefined, 503), true);
      return;
    }
    // 1. Peer, Host, Origin.
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      reply(errorReply("unauthorized", "This relay answers only on the loopback interface."), true);
      note("refused");
      return;
    }
    const secFetchSite = typeof req.headers["sec-fetch-site"] === "string" ? req.headers["sec-fetch-site"] : undefined;
    const originHeader = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
    if (!checkHost(req.headers["host"], boundPort) || !checkOrigin(originHeader, secFetchSite, boundPort)) {
      reply(errorReply("unauthorized", "The Host or Origin header is not this relay's address."), true);
      note("refused");
      return;
    }
    const client = normaliseClientAddress(req.socket.remoteAddress);

    // 2. Brute-force limit on the key.
    const failureKey = `authfail|${client}`;
    const blocked = buckets.take(failureKey, http.authFailureRate, now(), true);
    if (!blocked.allowed) {
      reply({ ...errorReply("rate_limited", "Too many failed key checks. Wait before trying again."), extraHeaders: { "retry-after": String(Math.max(1, Math.ceil(blocked.retryAfterMs / 1000))) } }, true);
      note("refused");
      return;
    }

    // 3. The key.
    const keyHeader = req.headers[RELAY_KEY_HEADER];
    const matched = options.keyring.verify(typeof keyHeader === "string" ? keyHeader : undefined);
    if (matched === undefined) {
      buckets.take(failureKey, http.authFailureRate, now());
      reply(errorReply("unauthorized", "Missing or wrong X-Relay-Key."), true);
      void options.audit?.write({ ev: "auth_failure", rid: requestId, outcome: "refused", code: "unauthorized" });
      return;
    }

    // 4. The route.
    const target = parseTarget(req.url);
    if (!target.ok) {
      reply(errorReply("invalid_request", target.reason === "query" ? "These routes take no query string." : "The request path is not valid."), true);
      note("refused");
      return;
    }
    const method = req.method ?? "";
    let getParams: Readonly<Record<string, string>> = {};
    if (method === "POST" && isPostPath(target.path)) {
      routeKey = `POST ${target.path}`;
    } else if (method === "GET") {
      const matchedGet = matchGetRoute(target.path);
      if (matchedGet !== undefined) {
        routeKey = `GET ${matchedGet.route}`;
        getParams = matchedGet.params;
      }
    }
    if (routeKey === undefined) {
      const otherMethod = isPostPath(target.path) || matchGetRoute(target.path) !== undefined;
      reply(
        otherMethod
          ? { ...errorReply("invalid_request", "That route does not take this method.", undefined, 405), extraHeaders: { allow: isPostPath(target.path) ? "POST" : "GET" } }
          : errorReply("not_found", "No such route."),
        true,
      );
      note("refused");
      return;
    }

    // 5. The kill switch.
    const flags = options.flags();
    if (WRITE_SET.has(routeKey) && flags.KILL !== false) {
      reply(errorReply("kill_switch", "The kill switch is on: every write is disabled. Reads still work."), true);
      note("refused");
      return;
    }

    // 6. Per-endpoint rate limit.
    const limit = buckets.take(`${client}|${routeKey}`, WRITE_SET.has(routeKey) ? http.writeRate : http.readRate, now());
    if (!limit.allowed) {
      reply({ ...errorReply("rate_limited", "Too many requests for this endpoint. Slow down."), extraHeaders: { "retry-after": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) } }, true);
      note("refused");
      return;
    }

    const handler = (table as Readonly<Record<string, unknown>>)[routeKey];
    if (typeof handler !== "function") {
      reply(errorReply("not_implemented", "This route is in the contract but has no handler yet."), true);
      note("refused");
      return;
    }

    // 7. The body.
    let input: unknown;
    if (method === "POST") {
      const contentType = req.headers["content-type"];
      if (typeof contentType !== "string" || !JSON_CONTENT_TYPE.test(contentType)) {
        reply(errorReply("invalid_request", "Send a JSON body with content-type application/json.", undefined, 415), true);
        note("refused");
        return;
      }
      const body = await readBody(req, http.bodyLimitBytes);
      if (body === "too_large") {
        reply(errorReply("invalid_request", "The request body is too large.", { reason: "body_too_large", limit_bytes: http.bodyLimitBytes }, 413), true);
        note("refused");
        return;
      }
      if (body === "aborted") {
        res.destroy();
        return;
      }
      let json: unknown;
      try {
        json = JSON.parse(body.toString("utf8"));
      } catch {
        reply(errorReply("invalid_request", "The body is not valid JSON."));
        note("refused");
        return;
      }
      if (hasForbiddenKey(json)) {
        reply(errorReply("invalid_request", "The body contains a key that is not allowed."));
        note("refused");
        return;
      }
      const schema = POST_ROUTES[routeKey.slice(5) as keyof typeof POST_ROUTES].request;
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.slice(0, 8).map((issue) => issue.path.map(safeFieldName).join(".") || "(body)"))];
        reply(errorReply("invalid_request", "The request does not match the contract.", { fields }));
        note("refused");
        return;
      }
      input = parsed.data;
    } else {
      const parsed = GET_ROUTES[routeKey.slice(4) as keyof typeof GET_ROUTES].params.safeParse(getParams);
      if (!parsed.success) {
        reply(errorReply("invalid_request", "The path parameter does not match the contract."));
        note("refused");
        return;
      }
      input = parsed.data;
    }

    // Which owners this relay serves (single tenant): the relay key alone does not name a wallet.
    if (options.owners !== undefined && OWNER_WRITE_ROUTES.has(routeKey)) {
      try {
        options.owners.checkRoute(routeKey, (input as { owner: string }).owner);
      } catch (error) {
        reply(replyFromError(error));
        note("refused");
        return;
      }
    }
    // A read of a stored item answers only for an owner this relay serves; any other owner's item is not found.
    try {
      checkOwnerScopedRead(options.owners, routeKey, input, options.services);
    } catch (error) {
      reply(replyFromError(error));
      note("refused");
      return;
    }
    const submitted = SUBMIT_ROUTES.has(routeKey) ? (input as { prepared_id: string }).prepared_id : undefined;

    // 8. The handler, with the answer-by budget.
    const controller = new AbortController();
    const hardTimer = setTimeout(() => controller.abort(), http.hardDeadlineMs);
    hardTimer.unref();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    const context: RelayContext = {
      flags: options.flags,
      now,
      requestId,
      signal: controller.signal,
      services: options.services,
    };
    const responseSchema =
      method === "POST"
        ? POST_ROUTES[routeKey.slice(5) as keyof typeof POST_ROUTES].response
        : GET_ROUTES[routeKey.slice(4) as keyof typeof GET_ROUTES].response;

    const work: Promise<Reply> = (async (): Promise<Reply> => {
      try {
        const answered = await (handler as (body: unknown, context: RelayContext) => Promise<unknown>)(input, context);
        // R1: an item from a module that predates the decoded block gets one here, or goes on without.
        const output = await withDecodedBlock(routeKey, answered, options.services);
        const checked = responseSchema.safeParse(output);
        if (!checked.success) {
          void options.audit?.write({ ev: "error", rid: requestId, route: routeKey, code: "response_invalid", outcome: "error" });
          return errorReply("internal", "The relay produced an answer that does not match its contract. Nothing was sent.");
        }
        // R9: a prepared item is kept as it is sent, so GET /v1/prepared/{id} can return exactly this answer.
        await keepPreparedAnswer(routeKey, checked.data, options.services);
        if (submitted !== undefined) await options.owners?.bindAfterSubmit(submitted).catch(() => undefined);
        return { status: 200, body: checked.data };
      } catch (error) {
        if (!(error instanceof RelayError)) {
          void options.audit?.write({ ev: "error", rid: requestId, route: routeKey, code: "handler_threw", outcome: "error", note: error instanceof Error ? error.name : "non_error" });
        }
        return replyFromError(error);
      } finally {
        clearTimeout(hardTimer);
      }
    })();

    let budgetTimer: NodeJS.Timeout | undefined;
    const budget = new Promise<"pending">((resolve) => {
      budgetTimer = setTimeout(() => resolve("pending"), http.requestBudgetMs);
    });
    const first = await Promise.race([work, budget]);
    clearTimeout(budgetTimer);
    if (first === "pending") {
      reply({ status: ERROR_HTTP_STATUS.pending, body: PENDING_BODY, code: "pending" });
      note("pending");
      // The handler carries on. Keep it in the set so shutdown waits for it.
      const late = work.then((final) => {
        void options.audit?.write({
          ev: "request",
          rid: requestId,
          route: routeKey ?? "unmatched",
          status: final.status,
          ...(final.code === undefined ? {} : { code: final.code }),
          outcome: final.status < 400 ? "ok" : "error",
          state: "completed_late",
          ms: Math.max(0, now() - startedAt),
        });
      });
      background.add(late);
      void late.finally(() => background.delete(late));
      return;
    }
    if (res.destroyed || res.writableEnded) return;
    reply(first);
    note(first.status < 400 ? "ok" : first.status >= 500 ? "error" : "refused");
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: RELAY_BIND_HOST, port: options.port, exclusive: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  if (address.address !== RELAY_BIND_HOST) {
    server.close();
    throw new Error("The relay bound to an address other than 127.0.0.1.");
  }
  boundPort = address.port;

  return {
    host: RELAY_BIND_HOST,
    port: boundPort,
    origin: `http://${RELAY_BIND_HOST}:${boundPort}`,
    inflight: () => background.size,
    async close(closeOptions = {}) {
      if (closing) return;
      closing = true;
      const graceMs = closeOptions.graceMs ?? http.shutdownGraceMs;
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      const deadline = new Promise<"deadline">((resolve) => {
        const timer = setTimeout(() => resolve("deadline"), graceMs);
        timer.unref();
      });
      const idle = (async (): Promise<"idle"> => {
        while (background.size > 0) await Promise.allSettled([...background]);
        return "idle";
      })();
      const winner = await Promise.race([idle, deadline]);
      server.closeIdleConnections();
      if (winner === "deadline") server.closeAllConnections();
      await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 1_000).unref())]);
      server.closeAllConnections();
    },
  };
}
