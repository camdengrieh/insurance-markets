import type { IncomingMessage, ServerResponse } from "node:http";

import { ERROR_STATUS, type ErrorCode } from "./app.js";
import { API_USER_AGENT } from "./upstream.js";
import { BodyTooLarge, FORWARDED_TYPE, JSON_TYPE, readBody, readCapped, relayOriginAllowed, type RelayContext } from "./xo-relay.js";

// What the unified-account routes share (docs/unified-account-design.md section 3.2): the paymaster (paymaster.ts), the
// Polymarket builder relay (polymarket-relay.ts), the bridge address route (polymarket-bridge.ts), the Limitless partner
// relay (limitless-relay.ts) and the account backup store (account-backup.ts). The same answer shape, CORS rule (the dApp's
// origin and the localhost dev servers, as the XO relay: xo-relay.ts relayOriginAllowed), body reading and one-request
// upstream forwarding as the XO relay, so every relay answers the same way.
//
// Rules every caller keeps:
//   - an operator credential (an API key, an HMAC secret) is added to the upstream request only, never echoed in an
//     answer, an error message or a log line; an upstream URL that carries a key (Pimlico's) is never logged either;
//   - one request upstream, no redirect followed, no credential mode, a deadline and a size cap on the answer, and only the
//     upstream status, body and (JSON or plain-text) content type passed back; nothing is retried;
//   - logs: the method, the route's label, the status and the time taken.

export interface RelayAnswer {
  readonly status: number;
  readonly body: Buffer;
  readonly contentType: string;
  readonly source: "upstream" | "refused" | "server";
  readonly headers?: Readonly<Record<string, string>>;
}

export function refusal(code: ErrorCode, message: string, headers?: Readonly<Record<string, string>>): RelayAnswer {
  return { status: ERROR_STATUS[code], body: Buffer.from(JSON.stringify({ error: { code, message } }), "utf8"), contentType: "application/json; charset=utf-8", source: "refused", ...(headers === undefined ? {} : { headers }) };
}

// An answer this server made itself (not forwarded): JSON with a status.
export function serverAnswer(status: number, value: unknown): RelayAnswer {
  return { status, body: Buffer.from(JSON.stringify(value), "utf8"), contentType: "application/json; charset=utf-8", source: "server" };
}

export function rateLimited(spec: { readonly capacity: number; readonly refillPerSecond: number }, retryAfterMs: number, what: string): RelayAnswer {
  const perMinute = Math.round(spec.refillPerSecond * 60 * 100) / 100;
  return refusal("rate_limited", `Too many requests ${what}: ${spec.capacity} at once, then ${perMinute} a minute.`, { "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) });
}

// Every answer says who made it in a marker header: "upstream" (the venue or provider answered, passed on), "refused"
// (this server refused before or instead of sending) or "server" (this server answered itself, e.g. a stored profile id).
// The marker is x-im-relay; the Limitless relay keeps the x-limitless-relay name the dApp already reads.
export const DEFAULT_MARKER = "x-im-relay";

export function writeAnswer(req: IncomingMessage, res: ServerResponse, answer: RelayAnswer, context: RelayContext, label: string, started: number, marker: string = DEFAULT_MARKER): void {
  const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
  const headers: Record<string, string | number> = {
    "content-type": answer.contentType,
    "content-length": answer.body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-request-id": context.requestId,
    [marker]: answer.source,
    ...answer.headers,
  };
  if (origin !== undefined) {
    headers["vary"] = "Origin";
    if (relayOriginAllowed(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-expose-headers"] = `x-request-id, retry-after, ${marker}`;
    }
  }
  if (context.closing()) headers["connection"] = "close";
  res.writeHead(answer.status, headers);
  res.end(req.method === "HEAD" ? undefined : answer.body);
  context.log(`${req.method ?? "?"} ${label} ${answer.status} ${Math.max(0, context.nowMs() - started)}ms`);
}

export interface PreflightGrant {
  readonly label: string;
  readonly methods: readonly string[];
  readonly headers: readonly string[];
}

// A CORS preflight: 204, and the grant only for the dApp's origins and a known route.
export function writePreflight(req: IncomingMessage, res: ServerResponse, context: RelayContext, grant: PreflightGrant | null, fallbackLabel: string, started: number, maxAgeS: number): void {
  const origin = typeof req.headers["origin"] === "string" ? req.headers["origin"] : undefined;
  const allowed = origin !== undefined && relayOriginAllowed(origin) && grant !== null;
  res.writeHead(204, {
    "cache-control": "no-store",
    "x-request-id": context.requestId,
    ...(origin === undefined ? {} : { vary: "Origin" }),
    ...(allowed
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": [...grant.methods, "OPTIONS"].join(", "),
          "access-control-allow-headers": grant.headers.join(", "),
          "access-control-max-age": String(maxAgeS),
        }
      : {}),
  });
  res.end();
  context.log(`OPTIONS ${grant === null ? fallbackLabel : grant.label} 204 ${Math.max(0, context.nowMs() - started)}ms`);
}

export interface Target {
  readonly url: URL;
  // The path exactly as sent (no normalisation), and the raw query ("" or "?..."), exactly as sent.
  readonly rawPath: string;
  readonly search: string;
}

// The request target, refused unless it is a plain absolute path the server's own normalised path equals (no dot segment,
// escape, fragment or trailing slash to normalise away: what is matched is what is checked and forwarded).
export function requestTarget(req: IncomingMessage, path: string, maxUrlChars: number): Target | RelayAnswer {
  const rawUrl = req.url ?? "";
  if (rawUrl.length > maxUrlChars) return refusal("uri_too_long", `The request target is longer than ${maxUrlChars} characters.`);
  let url: URL;
  try {
    url = new URL(rawUrl, "http://api.invalid");
  } catch {
    return refusal("invalid_request", "The request target is not valid.");
  }
  if (!rawUrl.startsWith("/") || rawUrl.startsWith("//") || url.hash !== "" || url.pathname !== path) return refusal("invalid_request", "The request target is not valid.");
  const rawPath = rawUrl.split("?", 1)[0] ?? "";
  if (rawPath !== path) return refusal("invalid_request", "The request target is not valid.");
  return { url, rawPath, search: rawUrl.length > rawPath.length ? rawUrl.slice(rawPath.length) : "" };
}

export function isAnswer(value: unknown): value is RelayAnswer {
  return typeof value === "object" && value !== null && "status" in value && "body" in value && "source" in value;
}

// The Origin rule: a request with an Origin must carry one of the dApp's; one without (a server or curl) is served.
export function originRefusal(req: IncomingMessage, who: string): RelayAnswer | null {
  const origin = req.headers["origin"];
  if (origin !== undefined && (typeof origin !== "string" || !relayOriginAllowed(origin))) return refusal("origin_not_allowed", `${who} answers the dApp's own origin only.`);
  return null;
}

// No body on a route that takes none.
export function noBody(req: IncomingMessage): RelayAnswer | null {
  const declared = req.headers["content-length"];
  if ((declared !== undefined && declared !== "0") || req.headers["transfer-encoding"] !== undefined) return refusal("payload_too_large", "This route takes no request body.");
  return null;
}

// The JSON headers check a body route makes before anything is read.
export function jsonHeaders(req: IncomingMessage, max: number): RelayAnswer | null {
  const type = req.headers["content-type"];
  if (typeof type !== "string" || !JSON_TYPE.test(type.trim())) return refusal("unsupported_media_type", "The body must be application/json.");
  const declared = req.headers["content-length"];
  if (declared !== undefined && (!/^[0-9]{1,9}$/.test(declared) || Number(declared) > max)) return refusal("payload_too_large", `The body is larger than ${max} bytes.`);
  return null;
}

export interface JsonBody {
  readonly raw: Buffer;
  readonly value: unknown;
}

// The body, at most `max` bytes, parsed as JSON.
export async function readJsonBody(req: IncomingMessage, max: number): Promise<JsonBody | RelayAnswer> {
  let raw: Buffer;
  try {
    raw = await readBody(req, max);
  } catch (error) {
    if (error instanceof BodyTooLarge) return refusal("payload_too_large", `The body is larger than ${max} bytes.`);
    return refusal("invalid_request", "The body could not be read.");
  }
  try {
    return { raw, value: JSON.parse(raw.toString("utf8")) as unknown };
  } catch {
    return refusal("invalid_request", "The body is not JSON.");
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ForwardOptions {
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  // Who is asked, for the refusal messages ("Pimlico", "Polymarket's relayer").
  readonly who: string;
  // What a timeout means for this request.
  readonly timeoutWords: string;
}

// One request upstream. Returns the answer, or the refusal that stands for it. The target is never put in a message.
export async function forward(target: string, method: string, headers: Readonly<Record<string, string>>, body: Buffer | string | undefined, options: ForwardOptions): Promise<RelayAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let response: Response;
    try {
      response = await options.fetchImpl(target, {
        method,
        headers: { "user-agent": API_USER_AGENT, ...headers },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : new Uint8Array(body) }),
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return refusal("upstream_timeout", options.timeoutWords);
      return refusal("upstream_unreachable", `${options.who} could not be reached.`);
    }
    if (response.status >= 300 && response.status < 400) return refusal("upstream_invalid", `${options.who} answered with a redirect; it is not followed.`);
    let text: Buffer | null;
    try {
      text = await readCapped(response, options.maxResponseBytes);
    } catch {
      return refusal(controller.signal.aborted ? "upstream_timeout" : "upstream_unreachable", `${options.who}'s answer could not be read in full.`);
    }
    if (text === null) return refusal("upstream_invalid", `${options.who}'s answer is larger than ${options.maxResponseBytes} bytes.`);
    const upstreamType = response.headers.get("content-type")?.trim() ?? "";
    return { status: response.status, body: text, contentType: FORWARDED_TYPE.test(upstreamType) ? upstreamType : "text/plain; charset=utf-8", source: "upstream" };
  } finally {
    clearTimeout(timer);
  }
}

// The JSON value of an upstream answer's body, or null.
export function parseUpstream(answer: RelayAnswer): unknown {
  if (answer.source !== "upstream") return null;
  try {
    return JSON.parse(answer.body.toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

export interface RouteOwner {
  // True when the path is this route's (whether or not it is on): the server hands it over whole.
  owns(path: string): boolean;
  handle(req: IncomingMessage, res: ServerResponse, path: string, context: RelayContext): Promise<void>;
}

// The common frame: OPTIONS, then the answer (any throw becomes "internal", stated as unknown outcome), then the write.
export function routeOwner(prefix: string, options: {
  readonly preflight: (path: string) => PreflightGrant | null;
  readonly answer: (req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void) => Promise<RelayAnswer>;
  readonly internalWords: string;
  readonly maxAgeS: number;
  readonly marker?: string;
}): RouteOwner {
  return {
    owns(path) {
      return path === prefix || path.startsWith(`${prefix}/`);
    },
    async handle(req, res, path, context) {
      const started = context.nowMs();
      let label = `${prefix}/:unmatched`;
      if (req.method === "OPTIONS") {
        writePreflight(req, res, context, options.preflight(path), label, started, options.maxAgeS);
        return;
      }
      let result: RelayAnswer;
      try {
        result = await options.answer(req, path, context, (value) => {
          label = value;
        });
      } catch {
        result = refusal("internal", options.internalWords);
      }
      writeAnswer(req, res, result, context, label, started, options.marker ?? DEFAULT_MARKER);
    },
  };
}
