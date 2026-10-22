import type { ZodType } from "zod/v4";

import { relayEndpoint, type GuardrailConfig, type Secret } from "../config.js";
import { sanitizeUntrusted } from "../guardrails/untrusted.js";
import {
  GET_ROUTES,
  POST_ROUTES,
  RELAY_CLIENT_TIMEOUT_MS,
  RELAY_KEY_HEADER,
  RELAY_USER_AGENT,
  errorResponseSchema,
  isPostPath,
  matchGetRoute,
  type GetPath,
  type GetResponse,
  type PostPath,
  type PostRequest,
  type PostResponse,
  type RelayCallOptions,
  type RelayClient,
  type RelayFailure,
  type RelayResult,
} from "./contract.js";
import type { ErrorCode } from "./errors.js";

// The plugin's only way to talk to the relay (docs/phase1-gap-closing.md section 5.4 and 5.2).
// Tools depend on the RelayClient interface from contract.ts, never on fetch.
//
// What it guarantees, each with a test in test/relay-client.test.ts:
//   - It never throws. Every outcome is a RelayResult with a stable error code from errors.ts.
//   - Every request body is checked against the contract's request schema before anything is sent,
//     and every response against its response schema; a response that does not validate is dropped
//     (the caller gets a coded failure, never a half-trusted object). A response that echoes a
//     different owner or hash than the request asked about is dropped too.
//   - Headers are fixed: the User-Agent from contract.ts, accept, content-type on POST and the relay
//     key. No cookies, no referrer, no credentials mode, no redirects (a redirect is refused, so the
//     key can only ever reach the configured origin).
//   - One hard timeout for the whole call, request and body: 8 s, and a caller may ask for less but
//     never more (a hosted plugin call is killed at 10 s). A cap on the size of every answer
//     (requests are bounded by their schemas). No retries: a POST must never be resent and the
//     caller decides about a GET.
//   - The relay key is read from its Secret only to build the header. No log line, error message,
//     detail or thrown value contains it, and text that came from the relay is scrubbed of it.
//   - No node:* import and no Node-only global, so the plugin bundle stays portable: it uses
//     globalThis.fetch (looked up at call time, so a test can stub it).
//
// SECURITY NOTE ON THE KEY: PayBox documents plugin environment variables as non-sensitive plain
// text shared by every installer (docs/research/06-paybox-platform.md section 2), and secrets as
// host-scoped brokered headers. So XO_RELAY_KEY in the plugin's environment suits a relay on 127.0.0.1
// and a key generated for this machine; for a relay that other people can reach, the key is visible to
// everyone with portal access (the spec allows this for a single-tenant relay, docs/safety.md and
// docs/quickstart.md say so). A multi-tenant deployment must not do this; it needs a brokered secret (a header PayBox attaches to
// the relay host), and a multi-tenant relay needs an owner-signed challenge on top (phase 1 spec,
// invariant 6 and amendment A5). This client does not implement either; it requires both URL and key.
//
// Error mapping (the body's `error.code` is authoritative whenever the relay sent a valid one):
//   no URL/key, a bad URL or key, a refused redirect,
//   or a connection that never opened        -> relay_not_configured (nothing was sent)
//   a body that fails the request schema     -> invalid_request (nothing was sent)
//   401 / 403 / 404 / 429 / other 4xx, no valid error body
//                                            -> unauthorized / not_found / rate_limited / invalid_request
//   timeout, dropped connection, 5xx without a valid error body, a response that fails its schema,
//   an oversize or unreadable body, a cancel mid-flight
//                                            -> ambiguous for a call that changes relay state (the
//                                               outcome is unknown: never resend), internal for a
//                                               read (nothing changed: trying again is safe)

// The in-process ("embedded") transport: the relay's own route pipeline called as a function, with no
// socket, no URL and no relay key. A request and a reply carry what HTTP would, so every rule below
// (schema checks, error mapping, the echo check, scrubbing) is the same code path for both transports.
export interface EmbeddedRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  // The JSON body of a POST, already serialised from a request that passed its schema.
  readonly bodyText: string | undefined;
  // Aborts when the call times out or the caller cancels, like a dropped connection.
  readonly signal: AbortSignal;
}

export interface EmbeddedReply {
  readonly status: number;
  readonly bodyText: string;
}

export type EmbeddedHandler = (request: EmbeddedRequest) => Promise<EmbeddedReply>;

export interface RelayClientOptions {
  // Missing or invalid values make every call fail with relay_not_configured; nothing is sent.
  readonly baseUrl?: string | undefined;
  readonly key?: Secret | undefined;
  readonly fetch?: typeof fetch;
  // When set, calls go to this handler and baseUrl, key and fetch are not used.
  readonly embedded?: EmbeddedHandler | undefined;
}

export const RELAY_CLIENT_LIMITS = Object.freeze({
  // A successful body. The largest legitimate answer (500 open orders) is far below this.
  maxResponseBytes: 1024 * 1024,
  // An error body is read only to find the code and a short message.
  maxErrorBodyBytes: 16 * 1024,
  maxRetryAfterMs: 10 * 60 * 1000,
});

const KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{16,256}$/;
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);
const MAX_URL_CHARS = 2048;
const URL_UNSAFE = /[\u0000- \u007f-\u009f\\]/;
const MAX_TEXT_CHARS = 500;
const MAX_DETAIL_ENTRIES = 20;
const REDACTED = "[redacted]";
// These POSTs only read. A failed one changed nothing on the relay, so a retry is safe.
const READ_ONLY_POSTS: ReadonlySet<string> = new Set(["/v1/account/status", "/v1/orders/list", "/v1/creation/track"]);
// Request fields the relay must echo back unchanged.
const ECHOED_FIELDS = ["owner", "order_hash", "funding_id", "condition_id"] as const;

type DetailValue = string | number | boolean | null | readonly string[];
type Details = Record<string, DetailValue>;
type Method = "GET" | "POST";

// How long one call may take: the default, or the caller's value when it is shorter. Never longer
// than RELAY_CLIENT_TIMEOUT_MS, so the tool keeps room inside the 10 s plugin budget.
export function effectiveTimeoutMs(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested) || requested <= 0) return RELAY_CLIENT_TIMEOUT_MS;
  return Math.min(Math.max(1, Math.floor(requested)), RELAY_CLIENT_TIMEOUT_MS);
}

function failure(status: number, code: ErrorCode, message: string, details?: Details): RelayResult<never> {
  const error: RelayFailure =
    details === undefined || Object.keys(details).length === 0 ? { code, message } : { code, message, details };
  return { ok: false, status, error };
}

// ---- where the relay is -------------------------------------------------------------------------------------

type Target =
  | { readonly ok: true; readonly origin: string; readonly basePath: string; readonly key: Secret | undefined }
  | { readonly ok: false; readonly missing: readonly string[]; readonly invalid: readonly string[] };

// Same rules as src/config.ts, applied again here because a caller can hand this module any value.
function parseBaseUrl(raw: string): { origin: string; basePath: string } | undefined {
  if (raw.length > MAX_URL_CHARS || URL_UNSAFE.test(raw) || raw.includes("?") || raw.includes("#")) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const secure = url.protocol === "https:";
  const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  if ((!secure && !loopbackHttp) || url.hostname === "" || url.username !== "" || url.password !== "") return undefined;
  return { origin: url.origin, basePath: url.pathname.replace(/\/+$/, "") };
}

function keyShape(key: unknown): "missing" | "invalid" | "ok" {
  if (key === undefined || key === null) return "missing";
  try {
    const reveal = (key as { reveal?: unknown }).reveal;
    if (typeof reveal !== "function") return "invalid";
    const value: unknown = reveal.call(key);
    return typeof value === "string" && KEY_PATTERN.test(value) ? "ok" : "invalid";
  } catch {
    return "invalid";
  }
}

function resolveTarget(options: RelayClientOptions): Target {
  if (options.embedded !== undefined) return { ok: true, origin: "embedded:relay", basePath: "", key: undefined };
  const missing: string[] = [];
  const invalid: string[] = [];
  let parsed: { origin: string; basePath: string } | undefined;
  if (options.baseUrl === undefined || options.baseUrl === "") {
    missing.push("XO_RELAY_URL");
  } else {
    parsed = typeof options.baseUrl === "string" ? parseBaseUrl(options.baseUrl) : undefined;
    if (parsed === undefined) invalid.push("XO_RELAY_URL");
  }
  const shape = keyShape(options.key);
  if (shape === "missing") missing.push("XO_RELAY_KEY");
  else if (shape === "invalid") invalid.push("XO_RELAY_KEY");
  if (missing.length > 0 || invalid.length > 0 || parsed === undefined || options.key === undefined) {
    return { ok: false, missing, invalid };
  }
  return { ok: true, origin: parsed.origin, basePath: parsed.basePath, key: options.key };
}

function notConfigured(target: Extract<Target, { ok: false }>): RelayResult<never> {
  const details: Details = {};
  if (target.missing.length > 0) details["missing"] = [...target.missing];
  if (target.invalid.length > 0) details["invalid"] = [...target.invalid];
  return failure(
    0,
    "relay_not_configured",
    "The XO relay is not configured: XO_RELAY_URL and XO_RELAY_KEY must both be set to valid values. Nothing was sent, and write tools cannot work until they are.",
    details,
  );
}

// ---- text that came from the relay -----------------------------------------------------------------------------

// Control and bidi characters go first, then the key (so an interleaved invisible character cannot
// hide it from the redaction), then the length cap.
function scrub(text: string, secret: string): string {
  const cleaned = sanitizeUntrusted(text, { maxChars: MAX_TEXT_CHARS, source: "relay" }).text;
  return secret === "" ? cleaned : cleaned.split(secret).join(REDACTED);
}

function scrubDetails(details: Readonly<Record<string, unknown>> | undefined, secret: string): Details | undefined {
  if (details === undefined) return undefined;
  const out: Details = {};
  for (const [name, value] of Object.entries(details).slice(0, MAX_DETAIL_ENTRIES)) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) continue;
    if (typeof value === "string") out[name] = scrub(value, secret);
    else if (Array.isArray(value)) out[name] = value.filter((item): item is string => typeof item === "string").slice(0, MAX_DETAIL_ENTRIES).map((item) => scrub(item, secret));
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[name] = value;
  }
  return out;
}

// ---- failures that carry no relay error body ---------------------------------------------------------------------

type Reason =
  | "timeout"
  | "network"
  | "aborted"
  | "invalid_response"
  | "response_too_large"
  | "server_error"
  | "body_read_failed";

const REASON_TEXT: Readonly<Record<Reason, string>> = Object.freeze({
  timeout: "The relay did not answer within the time limit.",
  network: "The connection to the relay failed before a full answer arrived.",
  aborted: "The call was cancelled before the relay answered.",
  invalid_response: "The relay's answer did not match the expected format and was discarded.",
  response_too_large: "The relay's answer was larger than the size limit and was discarded.",
  server_error: "The relay answered with a server error and no valid error body.",
  body_read_failed: "The relay's answer could not be read.",
});

function indefinite(status: number, retrySafe: boolean, reason: Reason): RelayResult<never> {
  const tail = retrySafe
    ? "Nothing was changed; trying again is safe."
    : "The outcome is unknown: do not resend this request; check its status first.";
  return failure(status, retrySafe ? "internal" : "ambiguous", `${REASON_TEXT[reason]} ${tail}`, { reason, retry_safe: retrySafe });
}

function retryAfterMs(header: string | null): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (!/^[0-9]{1,7}$/.test(trimmed)) return undefined;
  return Math.min(Number(trimmed) * 1000, RELAY_CLIENT_LIMITS.maxRetryAfterMs);
}

function fromStatus(status: number, retrySafe: boolean, header: string | null): RelayResult<never> {
  if (status === 401 || status === 403) {
    return failure(
      status,
      "unauthorized",
      "The relay refused the request: the relay key is wrong or not allowed. Check XO_RELAY_KEY.",
      { reason: "http_status", http_status: status },
    );
  }
  if (status === 404) {
    return failure(status, "not_found", "The relay has no such route or item.", { reason: "http_status", http_status: status });
  }
  if (status === 429) {
    const wait = retryAfterMs(header);
    return failure(status, "rate_limited", "The relay is rate limiting this client; wait before trying again.", {
      reason: "http_status",
      http_status: status,
      ...(wait === undefined ? {} : { retry_after_ms: wait }),
    });
  }
  if (status >= 400 && status < 500) {
    return failure(status, "invalid_request", "The relay rejected the request without an error body.", {
      reason: "http_status",
      http_status: status,
    });
  }
  return indefinite(status, retrySafe, "server_error");
}

// Codes of a connection that never opened (or a TLS handshake that failed): nothing was sent.
const NOT_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);
const TLS_FAILED = /^(?:ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_|SELF_SIGNED_|UNABLE_TO_)/;

function errorCodes(error: unknown, depth = 0): string[] {
  if (depth > 3 || typeof error !== "object" || error === null) return [];
  const own = error as { code?: unknown; cause?: unknown; errors?: unknown };
  const found: string[] = typeof own.code === "string" ? [own.code] : [];
  if (Array.isArray(own.errors)) for (const inner of own.errors.slice(0, 8)) found.push(...errorCodes(inner, depth + 1));
  return found.concat(errorCodes(own.cause, depth + 1));
}

function neverConnected(error: unknown): boolean {
  const codes = errorCodes(error);
  return codes.length > 0 && codes.every((code) => NOT_CONNECTED.has(code) || TLS_FAILED.test(code));
}

// ---- reading a body under a cap ----------------------------------------------------------------------------------------

// Rejects as soon as the signal aborts, even when the promise (an injected fetch, say) ignores it.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(new Error("aborted"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

type BodyRead = { readonly text: string } | { readonly fail: "response_too_large" | "body_read_failed" };

function dropBody(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}

// Streams the body and stops the moment it passes `cap` bytes, so an endless answer never sits in
// memory. Throws only when the signal aborts.
async function readCapped(response: Response, cap: number, signal: AbortSignal): Promise<BodyRead> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^[0-9]{1,15}$/.test(declared) && Number(declared) > cap) {
    dropBody(response);
    return { fail: "response_too_large" };
  }
  if (response.body === null) return { text: "" };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) {
        finished = true;
        break;
      }
      total += value.byteLength;
      if (total > cap) return { fail: "response_too_large" };
      chunks.push(value);
    }
  } catch (cause) {
    if (signal.aborted) throw cause;
    return { fail: "body_read_failed" };
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { fail: "body_read_failed" };
  }
}

function isJsonContent(header: string | null): boolean {
  return header !== null && /^application\/json\s*(?:;|$)/i.test(header.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lower(value: unknown): string | undefined {
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

// A relay that answers about a different owner, order, funding or condition than the one asked
// about is wrong or hostile; the answer is not used.
function echoMatches(
  match: { readonly kind: "post"; readonly body: unknown } | { readonly kind: "get"; readonly hash: string | undefined; readonly field: string | undefined },
  data: unknown,
): boolean {
  if (!isRecord(data)) return false;
  if (match.kind === "get") {
    if (match.hash === undefined || match.field === undefined) return true;
    return lower(data[match.field]) === match.hash.toLowerCase();
  }
  if (!isRecord(match.body)) return true;
  for (const field of ECHOED_FIELDS) {
    const asked = lower(match.body[field]);
    const got = lower(data[field]);
    if (asked !== undefined && got !== undefined && asked !== got) return false;
  }
  return true;
}

// ---- one call ---------------------------------------------------------------------------------------------------------------

interface Planned {
  readonly url: string;
  readonly bodyText: string | undefined;
  readonly response: ZodType;
  readonly retrySafe: boolean;
  readonly match: Parameters<typeof echoMatches>[0];
}

function invalidRequest(fields: readonly string[]): RelayResult<never> {
  return failure(0, "invalid_request", "The request does not match the relay contract. Nothing was sent.", {
    fields: fields.slice(0, 5),
  });
}

function issueFields(error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] }): string[] {
  return error.issues.slice(0, 5).map((issue) => (issue.path.map((part) => String(part)).join(".") || "(body)").slice(0, 80));
}

function plan(target: Extract<Target, { ok: true }>, method: Method, path: string, body: unknown): Planned | RelayResult<never> {
  const base = `${target.origin}${target.basePath}`;
  if (method === "POST") {
    if (!isPostPath(path)) return invalidRequest(["(path)"]);
    const route: { readonly request: ZodType; readonly response: ZodType } = POST_ROUTES[path];
    const checked = route.request.safeParse(body);
    if (!checked.success) return invalidRequest(issueFields(checked.error));
    let bodyText: string | undefined;
    try {
      bodyText = JSON.stringify(body);
    } catch {
      bodyText = undefined;
    }
    // The schemas bound every field, so a valid body is always small; this only guards a bug.
    if (bodyText === undefined) return invalidRequest(["(body)"]);
    return { url: `${base}${path}`, bodyText, response: route.response, retrySafe: READ_ONLY_POSTS.has(path), match: { kind: "post", body } };
  }
  const matched = matchGetRoute(path);
  if (matched === undefined) return invalidRequest(["(path)"]);
  const route: { readonly params: ZodType; readonly response: ZodType } = GET_ROUTES[matched.route];
  const params = route.params.safeParse(matched.params);
  if (!params.success) return invalidRequest(["(path)"]);
  // The answer must be about the id in the path: the order or operation hash, or the prepared item's id.
  const field = matched.route === "/v1/order/:hash" ? "order_hash" : matched.route === "/v1/userop/:hash" ? "user_op_hash" : matched.route === "/v1/prepared/:id" ? "prepared_id" : undefined;
  const asked = matched.route === "/v1/prepared/:id" ? matched.params["id"] : matched.params["hash"];
  return {
    url: `${base}${path}`,
    bodyText: undefined,
    response: route.response,
    retrySafe: true,
    match: { kind: "get", hash: asked, field },
  };
}

async function perform(
  options: RelayClientOptions,
  target: Target,
  method: Method,
  path: string,
  body: unknown,
  callOptions: RelayCallOptions | undefined,
): Promise<RelayResult<unknown>> {
  if (!target.ok) return notConfigured(target);
  const planned = plan(target, method, path, body);
  if (!("url" in planned)) return planned;
  const { retrySafe } = planned;
  const secret = target.key?.reveal() ?? "";

  const callerSignal = callOptions?.signal;
  // A function, so the narrowing from this first check does not hide a later abort from the compiler.
  const callerAborted = (): boolean => callerSignal?.aborted === true;
  if (callerAborted()) {
    return failure(0, "internal", "The call was cancelled before it was sent. Nothing was sent.", { reason: "aborted", retry_safe: true });
  }

  // One clock for the whole call. It is started before the request leaves and stopped in `finally`.
  const controller = new AbortController();
  const clock = { timedOut: false };
  const timer = setTimeout(() => {
    clock.timedOut = true;
    controller.abort();
  }, effectiveTimeoutMs(callOptions?.timeoutMs));
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const signal = controller.signal;

  try {
    const embedded = options.embedded;
    const fetchImpl: typeof fetch =
      embedded !== undefined
        ? async () => {
            const reply = await embedded({ method, path, bodyText: planned.bodyText, signal });
            return new Response(reply.bodyText, { status: reply.status, headers: { "content-type": "application/json; charset=utf-8" } });
          }
        : (options.fetch ?? ((input, init) => globalThis.fetch(input, init)));
    const headers: Record<string, string> = {
      "user-agent": RELAY_USER_AGENT,
      accept: "application/json",
      ...(target.key === undefined ? {} : { [RELAY_KEY_HEADER]: secret }),
    };
    if (planned.bodyText !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      const pending = fetchImpl(planned.url, {
        method,
        headers,
        ...(planned.bodyText === undefined ? {} : { body: planned.bodyText }),
        // A redirect is refused below, never followed: the key goes to the configured origin only.
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      });
      pending.then(
        (late) => {
          if (signal.aborted) dropBody(late);
        },
        () => undefined,
      );
      response = await abortable(pending, signal);
    } catch (cause) {
      if (clock.timedOut) return indefinite(0, retrySafe, "timeout");
      if (callerAborted()) return indefinite(0, retrySafe, "aborted");
      if (neverConnected(cause)) {
        return failure(
          0,
          "relay_not_configured",
          "The relay could not be reached. Nothing was sent; check XO_RELAY_URL and that the relay is running.",
          { reason: "unreachable" },
        );
      }
      return indefinite(0, retrySafe, "network");
    }

    const status = response.status;
    if ((status >= 300 && status < 400) || response.type === "opaqueredirect") {
      dropBody(response);
      return failure(
        status,
        "relay_not_configured",
        "XO_RELAY_URL answered with a redirect, which is refused. Set it to the final address of the relay.",
        { reason: "redirect_refused" },
      );
    }

    const ok = status >= 200 && status < 300;
    const contentType = response.headers.get("content-type");
    const waitHeader = response.headers.get("retry-after");
    let read: BodyRead;
    try {
      read = await readCapped(response, ok ? RELAY_CLIENT_LIMITS.maxResponseBytes : RELAY_CLIENT_LIMITS.maxErrorBodyBytes, signal);
    } catch {
      return indefinite(status, retrySafe, clock.timedOut ? "timeout" : "aborted");
    }
    // An oversize or unreadable body on an error status still falls through to the status mapping.
    let parsed: unknown;
    if ("text" in read && isJsonContent(contentType)) {
      try {
        parsed = JSON.parse(read.text);
      } catch {
        parsed = undefined;
      }
    }
    if (!ok && "fail" in read) return fromStatus(status, retrySafe, waitHeader);
    if ("fail" in read) return indefinite(status, retrySafe, read.fail);

    if (ok) {
      const valid = planned.response.safeParse(parsed);
      if (valid.success) {
        return echoMatches(planned.match, valid.data) ? { ok: true, status, data: valid.data } : indefinite(status, retrySafe, "invalid_response");
      }
    }
    const envelope = errorResponseSchema.safeParse(parsed);
    if (envelope.success) {
      const { code, message, details } = envelope.data.error;
      const text = scrub(message, secret);
      const cleanDetails = scrubDetails(details, secret) ?? {};
      if (code === "rate_limited" && cleanDetails["retry_after_ms"] === undefined) {
        const wait = retryAfterMs(waitHeader);
        if (wait !== undefined) cleanDetails["retry_after_ms"] = wait;
      }
      return failure(status, code, text === "" ? "The relay refused the request." : text, cleanDetails);
    }
    return ok ? indefinite(status, retrySafe, "invalid_response") : fromStatus(status, retrySafe, waitHeader);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

function safely(run: () => Promise<RelayResult<unknown>>): Promise<RelayResult<unknown>> {
  // A bug in this module must not become a throw in a tool, and must not echo a thrown value
  // (which could hold request headers) either.
  return run().catch(() =>
    failure(0, "internal", "The relay client failed unexpectedly. Check the relay's status before sending anything again.", { reason: "client_error" }),
  );
}

// Builds a client. Construction makes no network call and never throws. When the URL or key is
// missing or invalid, every call returns relay_not_configured without sending anything.
export function createRelayClient(options: RelayClientOptions): RelayClient {
  const target = resolveTarget(options);
  return {
    post<P extends PostPath>(path: P, body: PostRequest<P>, callOptions?: RelayCallOptions): Promise<RelayResult<PostResponse<P>>> {
      return safely(() => perform(options, target, "POST", path, body, callOptions)) as Promise<RelayResult<PostResponse<P>>>;
    },
    get<P extends GetPath>(path: P, callOptions?: RelayCallOptions): Promise<RelayResult<GetResponse<P>>> {
      return safely(() => perform(options, target, "GET", path, undefined, callOptions)) as Promise<RelayResult<GetResponse<P>>>;
    },
  };
}

// A client for the in-process relay: no URL, no key, no network. Same guarantees as the HTTP client.
export function createEmbeddedRelayClient(handler: EmbeddedHandler): RelayClient {
  return createRelayClient({ embedded: handler });
}

// Local mode only. dist/local.mjs calls this once at start-up with its in-process relay, and from then on
// every tool that builds its client from the configuration (all of them, including ones written later)
// talks to that relay instead of an HTTP one. dist/plugin.mjs never calls it, so the hosted plugin keeps
// reading XO_RELAY_URL and XO_RELAY_KEY. Pass undefined to switch back (tests).
let processEmbedded: EmbeddedHandler | undefined;
export function useEmbeddedRelay(handler: EmbeddedHandler | undefined): void {
  processEmbedded = handler;
}

// The same, from the loaded plugin configuration (XO_RELAY_URL and XO_RELAY_KEY).
export function createRelayClientFromConfig(config: GuardrailConfig, fetchImpl?: typeof fetch): RelayClient {
  if (processEmbedded !== undefined) return createEmbeddedRelayClient(processEmbedded);
  const endpoint = relayEndpoint(config);
  return createRelayClient({
    baseUrl: endpoint?.baseUrl,
    key: endpoint?.key,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}
