import { randomInt } from "node:crypto";

import { RELAY_USER_AGENT } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { redactSecrets } from "../src/guardrails/audit.js";
import { sanitizeUntrusted } from "../src/guardrails/untrusted.js";
import { isoSecondOf } from "./audit.js";

// The only way the relay talks to a third party (docs/phase1-gap-closing.md section 9 A5, XS4).
//
// What it guarantees, each with a test:
//   - https only, to an allowlist of exact host names (and, for a shared host, a path prefix), with a
//     per-host method list. A redirect to anywhere else is refused, and POST/DELETE never follow one;
//   - one pinned User-Agent, insurance-markets-xo-plugin/0.2, and a short header allowlist. A caller
//     cannot set Host, Cookie, Referer, From, Authorization or a different User-Agent;
//   - at most 4 requests per second per host (a token bucket), 429 handling with Retry-After and a
//     cooldown, exponential backoff with a cap, and retries only for GET;
//   - Cloudflare challenges are recognised and are NOT worked around: the host is marked blocked, an
//     alert is raised, and nothing is retried until the block time has passed;
//   - a "requires key" latch on hosts documented as needing one (XO's RPC and bundler): the first
//     401 or 403 stops all traffic to that host. The relay never looks for a key;
//   - a circuit breaker per host, a response size cap that cancels the stream, and a time cap;
//   - `fetch` is injectable, so tests and the mock plug in without touching the allowlist logic.
//
// It never logs a URL, a query string or a header value: events carry host names and a purpose slug.
// (A Base RPC URL usually embeds an API key.)

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface AllowedHost {
  // Lower-case ASCII host name; no port, no IP literal.
  readonly host: string;
  // For a shared host: only paths below this prefix (starts and ends with "/").
  readonly pathPrefix?: string;
  readonly methods: readonly HttpMethod[];
  // XO documents a key for these hosts but serves them without one today. A 401 or 403 means the
  // door closed; latch and stop.
  readonly keyless?: boolean;
}

// Hosts named in docs/phase1-gap-closing.md 5.2 and note 23 (the two XO metadata buckets). A
// configured Base RPC and an optional declared self-host are added by the caller.
export const XO_UPSTREAM_HOSTS: readonly AllowedHost[] = Object.freeze([
  { host: "orderbooks.xo.market", methods: ["GET", "POST", "DELETE"] },
  { host: "api-mainnet.xo.market", methods: ["GET"] },
  { host: "explorer-mainnet.xo.market", methods: ["GET"], keyless: true },
  { host: "rpc-mainnet-2.xo.market", methods: ["GET", "POST"], keyless: true },
  { host: "mainnet-bundler.xo.market", methods: ["GET", "POST"], keyless: true },
  // The GCS bucket shares a host with everyone, so only its own path is allowed.
  { host: "storage.googleapis.com", pathPrefix: "/market-metadata-mainnet/", methods: ["GET"] },
  { host: "market-metadata-623756711122.s3.eu-west-1.amazonaws.com", methods: ["GET"] },
] as const satisfies readonly AllowedHost[]);

// No burst: requests to one host are scheduled at least 1000 / 4 = 250 ms apart, so any one-second
// window holds at most 4.
export const UPSTREAM_RPS = 4;
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 5_000;
export const DEFAULT_TOTAL_TIMEOUT_MS = 12_000;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_LOCAL_WAIT_MS = 5_000;
const MAX_REDIRECTS = 2;

export type UpstreamErrorKind =
  | "invalid_request"
  | "host_not_allowed"
  | "scheme"
  | "method_not_allowed"
  | "redirect_blocked"
  | "timeout"
  | "too_large"
  | "network"
  | "circuit_open"
  | "requires_key"
  | "rate_limited"
  | "cloudflare"
  | "aborted"
  | "invalid_json";

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly host: string;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(kind: UpstreamErrorKind, host: string, extra: { readonly status?: number; readonly retryAfterMs?: number } = {}) {
    super(`The request to ${host === "" ? "an upstream host" : host} failed (${kind}).`);
    this.name = "UpstreamError";
    this.kind = kind;
    this.host = host;
    this.status = extra.status;
    this.retryAfterMs = extra.retryAfterMs;
  }
}

// Maps a failure to the relay's wire error. Fixed text; the host and kind go in details.
export function toRelayError(error: UpstreamError): RelayError {
  const details = { host: error.host, kind: error.kind };
  switch (error.kind) {
    case "requires_key":
      return new RelayError("upstream_requires_key", "An upstream host now asks for a key. The relay does not look for one.", details);
    case "rate_limited":
      return new RelayError("rate_limited", "The upstream host is rate limiting the relay. Try again later.", {
        ...details,
        retry_after_ms: error.retryAfterMs ?? null,
      });
    case "invalid_request":
    case "host_not_allowed":
    case "scheme":
    case "method_not_allowed":
      return new RelayError("internal", "The relay refused to send a request that is outside its allowlist.", details);
    default:
      return new RelayError("upstream_rejected", "The upstream host did not give a usable answer.", details);
  }
}

// Upstream text that may be shown to a human or an agent: short, sanitised, redacted.
export function sanitizeUpstreamText(text: string, maxChars = 200): string {
  return sanitizeUntrusted(redactSecrets(sanitizeUntrusted(text, { maxChars: 2000 }).text), { maxChars }).text;
}

export const UPSTREAM_STATES = ["ok", "degraded", "open_circuit", "requires_key", "blocked"] as const;
export type UpstreamState = (typeof UPSTREAM_STATES)[number];

export type UpstreamEvent =
  | { readonly type: "request"; readonly host: string; readonly purpose: string; readonly method: HttpMethod; readonly status: number | undefined; readonly ms: number; readonly failure: UpstreamErrorKind | undefined }
  | { readonly type: "state"; readonly host: string; readonly state: UpstreamState; readonly reason: string }
  | { readonly type: "requires_key"; readonly host: string }
  | { readonly type: "blocked"; readonly host: string };

export interface UpstreamRequest {
  readonly method: HttpMethod;
  // Absolute https URL. Never logged.
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  // A slug for events and counters: "orders_list", "bundler_estimate".
  readonly purpose: string;
  readonly timeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

export interface UpstreamResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly host: string;
  readonly durationMs: number;
}

export interface HostHealth {
  readonly state: UpstreamState;
  readonly errors: number;
  readonly last_error_at: string | null;
}

export interface Upstream {
  request(request: UpstreamRequest): Promise<UpstreamResponse>;
  // Parses a JSON body or throws UpstreamError("invalid_json").
  json(response: UpstreamResponse): unknown;
  // Shape of the contract's upstreamHealthSchema.
  health(): Record<string, HostHealth>;
  hostState(host: string): UpstreamState | undefined;
  hosts(): readonly AllowedHost[];
  // Operator action: forget a latch or block (the relay does this only on a half-open probe).
  clearLatch(host: string): void;
}

export interface UpstreamOptions {
  readonly hosts: readonly AllowedHost[];
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly jitter?: (maxMs: number) => number;
  readonly onEvent?: (event: UpstreamEvent) => void;
  readonly requestsPerSecond?: number;
  readonly maxRetries?: number;
  readonly backoffBaseMs?: number;
  readonly backoffCapMs?: number;
  readonly breakerThreshold?: number;
  readonly breakerOpenMs?: number;
  readonly blockedForMs?: number;
  readonly requiresKeyRetryMs?: number;
}

// Header names a caller may set. Everything else (Host, Cookie, Referer, From, Origin, Authorization,
// X-Forwarded-For, a different User-Agent) is refused, so nothing that identifies a person or a
// machine can ride along.
// The venue credential headers (relay/clob.ts): Polymarket's POLY_* L1 and L2 names and Limitless's lmts-* names.
const CALLER_HEADER = /^(?:accept|content-type|xo_api_key|xo_timestamp|xo_passphrase|xo_signature|xo_address|poly_address|poly_signature|poly_timestamp|poly_nonce|poly_api_key|poly_passphrase|lmts-api-key|lmts-timestamp|lmts-signature)$/i;
const XO_AUTH_HEADER = /^(?:xo_|poly_|lmts-)/i;
// eslint-disable-next-line no-control-regex
const HEADER_VALUE = /^[ -~]{0,4096}$/;
const PURPOSE = /^[a-z][a-z0-9_]{0,47}$/;

interface HostRuntime {
  readonly entry: AllowedHost;
  // The earliest time the next request to this host may leave (slot scheduling).
  nextFree: number;
  cooldownUntil: number;
  requests: number;
  errors: number;
  lastErrorAt: number | undefined;
  consecutiveFailures: number;
  circuitOpenUntil: number;
  probing: boolean;
  requiresKeyAt: number | undefined;
  blockedAt: number | undefined;
  lastState: UpstreamState;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseRetryAfter(value: string | undefined, nowMs: number): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^[0-9]{1,6}$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.min(date - nowMs, MAX_RETRY_AFTER_MS));
}

const CLOUDFLARE_BODY = /cloudflare|just a moment|attention required|cf-chl|cf_chl/i;

// A challenge page is answered before the origin sees the request. A 5xx that merely passes through
// Cloudflare is the origin's own answer, and for a POST or DELETE the origin may already have acted on
// it, so only the cf-mitigated header (set by Cloudflare itself) makes such a 5xx a "challenge".
function looksLikeCloudflare(method: string, status: number, headers: Readonly<Record<string, string>>, body: string): boolean {
  if (status !== 403 && status !== 503) return false;
  if (headers["cf-mitigated"] !== undefined) return true;
  if (status === 503 && method !== "GET") return false;
  const server = (headers["server"] ?? "").toLowerCase();
  const html = (headers["content-type"] ?? "").toLowerCase().includes("text/html");
  const marker = CLOUDFLARE_BODY.test(body.slice(0, 4096));
  // A plain HTML 503 from the origin behind Cloudflare is not a challenge: it needs the challenge wording.
  if (status === 503) return marker && html;
  if (server.startsWith("cloudflare") && (html || marker)) return true;
  return marker && html;
}

export function createUpstream(options: UpstreamOptions): Upstream {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const jitter = options.jitter ?? ((max: number) => (max <= 0 ? 0 : randomInt(0, max + 1)));
  const rps = options.requestsPerSecond ?? UPSTREAM_RPS;
  const maxRetries = options.maxRetries ?? 2;
  const backoffBase = options.backoffBaseMs ?? 500;
  const backoffCap = options.backoffCapMs ?? 8_000;
  const breakerThreshold = options.breakerThreshold ?? 5;
  const breakerOpenMs = options.breakerOpenMs ?? 30_000;
  const blockedForMs = options.blockedForMs ?? 15 * 60_000;
  const requiresKeyRetryMs = options.requiresKeyRetryMs ?? 30 * 60_000;

  const runtimes = new Map<string, HostRuntime>();
  for (const entry of options.hosts) {
    const host = entry.host.toLowerCase();
    if (!/^[a-z0-9.-]{1,253}$/.test(host) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) throw new Error("An upstream host must be a DNS name.");
    if (entry.pathPrefix !== undefined && !(entry.pathPrefix.startsWith("/") && entry.pathPrefix.endsWith("/"))) {
      throw new Error("A path prefix starts and ends with a slash.");
    }
    // Two entries for one host are merged by method; the narrower path prefix is not supported.
    if (runtimes.has(host)) throw new Error("An upstream host is listed twice.");
    runtimes.set(host, {
      entry: { ...entry, host },
      nextFree: 0,
      cooldownUntil: 0,
      requests: 0,
      errors: 0,
      lastErrorAt: undefined,
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
      probing: false,
      requiresKeyAt: undefined,
      blockedAt: undefined,
      lastState: "ok",
    });
  }

  function emit(event: UpstreamEvent): void {
    try {
      options.onEvent?.(event);
    } catch {
      // A broken listener must not break a request.
    }
  }

  function stateOf(runtime: HostRuntime, nowMs: number): UpstreamState {
    if (runtime.requiresKeyAt !== undefined && nowMs - runtime.requiresKeyAt < requiresKeyRetryMs) return "requires_key";
    if (runtime.blockedAt !== undefined && nowMs - runtime.blockedAt < blockedForMs) return "blocked";
    if (runtime.circuitOpenUntil > nowMs) return "open_circuit";
    // Degraded: the last call failed, or the host asked us to slow down and we are still waiting.
    if (runtime.consecutiveFailures > 0 || runtime.cooldownUntil > nowMs) return "degraded";
    return "ok";
  }

  function noteState(runtime: HostRuntime, reason: string): void {
    const state = stateOf(runtime, now());
    if (state !== runtime.lastState) {
      runtime.lastState = state;
      emit({ type: "state", host: runtime.entry.host, state, reason });
    }
  }

  function recordFailure(runtime: HostRuntime, reason: string): void {
    const nowMs = now();
    runtime.errors += 1;
    runtime.lastErrorAt = nowMs;
    runtime.consecutiveFailures += 1;
    if (runtime.consecutiveFailures >= breakerThreshold) runtime.circuitOpenUntil = nowMs + breakerOpenMs;
    noteState(runtime, reason);
  }

  function recordSuccess(runtime: HostRuntime): void {
    runtime.consecutiveFailures = 0;
    runtime.circuitOpenUntil = 0;
    noteState(runtime, "success");
  }

  // Parses and checks one URL against the allowlist and the method list.
  function check(rawUrl: string, method: HttpMethod): { readonly url: URL; readonly runtime: HostRuntime } {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new UpstreamError("invalid_request", "");
    }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") throw new UpstreamError("scheme", host);
    if (url.username !== "" || url.password !== "" || url.port !== "") throw new UpstreamError("host_not_allowed", host);
    const runtime = runtimes.get(host);
    if (runtime === undefined) throw new UpstreamError("host_not_allowed", host);
    const prefix = runtime.entry.pathPrefix;
    if (prefix !== undefined && !url.pathname.startsWith(prefix)) throw new UpstreamError("host_not_allowed", host);
    if (!runtime.entry.methods.includes(method)) throw new UpstreamError("method_not_allowed", host);
    return { url, runtime };
  }

  function buildHeaders(request: UpstreamRequest, forHost: string): Record<string, string> {
    const headers: Record<string, string> = { "user-agent": RELAY_USER_AGENT, accept: "application/json" };
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      if (!CALLER_HEADER.test(name) || typeof value !== "string" || !HEADER_VALUE.test(value)) {
        throw new UpstreamError("invalid_request", forHost);
      }
      headers[name.toLowerCase()] = value;
    }
    if (request.body !== undefined && headers["content-type"] === undefined) headers["content-type"] = "application/json";
    return headers;
  }

  // Reserves the next free slot for this host and waits for it. Slots are 1000 / rps apart and are
  // handed out in arrival order, so callers queue fairly and none can jump ahead; a host in cooldown
  // after a 429 has no slot before the cooldown ends.
  async function acquire(runtime: HostRuntime, signal: AbortSignal | undefined): Promise<void> {
    const nowMs = now();
    const slot = Math.max(nowMs, runtime.nextFree, runtime.cooldownUntil);
    const wait = slot - nowMs;
    if (wait > MAX_LOCAL_WAIT_MS) throw new UpstreamError("rate_limited", runtime.entry.host, { retryAfterMs: wait });
    runtime.nextFree = slot + Math.ceil(1000 / rps);
    if (wait <= 0) return;
    try {
      await sleep(wait, signal);
    } catch {
      throw new UpstreamError("aborted", runtime.entry.host);
    }
  }

  async function readBody(response: Response, maxBytes: number, host: string): Promise<string> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new UpstreamError("too_large", host);
    }
    if (response.body === null) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new UpstreamError("too_large", host);
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(joined);
  }

  function headerRecord(response: Response): Record<string, string> {
    const out: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      out[name.toLowerCase()] = value;
    });
    return out;
  }

  // One attempt, following at most MAX_REDIRECTS hops for GET.
  async function attemptOnce(request: UpstreamRequest, attemptTimeoutMs: number, maxBytes: number, started: number): Promise<UpstreamResponse> {
    let target = check(request.url, request.method);
    let headers = buildHeaders(request, target.runtime.entry.host);
    let hops = 0;
    for (;;) {
      const runtime = target.runtime;
      const host = runtime.entry.host;
      const nowMs = now();
      // Fail fast on a latch, a block or an open circuit; allow one probe once the time has passed.
      if (runtime.requiresKeyAt !== undefined) {
        if (nowMs - runtime.requiresKeyAt < requiresKeyRetryMs) throw new UpstreamError("requires_key", host);
        runtime.requiresKeyAt = undefined;
      }
      if (runtime.blockedAt !== undefined) {
        if (nowMs - runtime.blockedAt < blockedForMs) throw new UpstreamError("cloudflare", host, { retryAfterMs: blockedForMs - (nowMs - runtime.blockedAt) });
        runtime.blockedAt = undefined;
      }
      if (runtime.circuitOpenUntil > nowMs) throw new UpstreamError("circuit_open", host, { retryAfterMs: runtime.circuitOpenUntil - nowMs });
      const halfOpen = runtime.circuitOpenUntil !== 0 && runtime.circuitOpenUntil <= nowMs;
      if (halfOpen) {
        if (runtime.probing) throw new UpstreamError("circuit_open", host);
        runtime.probing = true;
      }
      try {
        await acquire(runtime, request.signal);
        runtime.requests += 1;

        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, attemptTimeoutMs);
        timer.unref();
        const onCallerAbort = (): void => controller.abort();
        if (request.signal?.aborted === true) controller.abort();
        request.signal?.addEventListener("abort", onCallerAbort, { once: true });
        let response: Response;
        let body: string;
        try {
          try {
            response = await fetchImpl(target.url.toString(), {
              method: request.method,
              headers,
              ...(request.body === undefined ? {} : { body: request.body }),
              redirect: "manual",
              cache: "no-store",
              credentials: "omit",
              referrerPolicy: "no-referrer",
              signal: controller.signal,
            });
            body = await readBody(response, maxBytes, host);
          } catch (error) {
            if (error instanceof UpstreamError) throw error;
            throw new UpstreamError(timedOut ? "timeout" : request.signal?.aborted === true ? "aborted" : "network", host);
          }
        } finally {
          clearTimeout(timer);
          request.signal?.removeEventListener("abort", onCallerAbort);
        }

        const responseHeaders = headerRecord(response);
        const status = response.status;

        // Redirects: only GET, only to another allowlisted https URL, never carrying XO_* headers
        // to a different host.
        if (status >= 300 && status < 400 && responseHeaders["location"] !== undefined) {
          if (request.method !== "GET" || hops >= MAX_REDIRECTS) throw new UpstreamError("redirect_blocked", host, { status });
          let next: { readonly url: URL; readonly runtime: HostRuntime };
          try {
            next = check(new URL(responseHeaders["location"], target.url).toString(), "GET");
          } catch {
            throw new UpstreamError("redirect_blocked", host, { status });
          }
          if (next.runtime.entry.host !== host) {
            headers = Object.fromEntries(Object.entries(headers).filter(([name]) => !XO_AUTH_HEADER.test(name)));
          }
          hops += 1;
          target = next;
          continue;
        }

        if (status === 429) {
          const retryAfterMs = parseRetryAfter(responseHeaders["retry-after"], now()) ?? 1_000;
          runtime.cooldownUntil = Math.max(runtime.cooldownUntil, now() + retryAfterMs);
          throw new UpstreamError("rate_limited", host, { status, retryAfterMs });
        }
        if (looksLikeCloudflare(request.method, status, responseHeaders, body)) {
          runtime.blockedAt = now();
          emit({ type: "blocked", host });
          throw new UpstreamError("cloudflare", host, { status });
        }
        if ((status === 401 || status === 403) && runtime.entry.keyless === true) {
          runtime.requiresKeyAt = now();
          emit({ type: "requires_key", host });
          throw new UpstreamError("requires_key", host, { status });
        }

        if (status >= 500) recordFailure(runtime, `http_${status}`);
        else recordSuccess(runtime);
        return { status, ok: status >= 200 && status < 300, headers: responseHeaders, body, host, durationMs: Math.max(0, now() - started) };
      } finally {
        if (halfOpen) runtime.probing = false;
      }
    }
  }

  async function request(input: UpstreamRequest): Promise<UpstreamResponse> {
    if (!PURPOSE.test(input.purpose)) throw new UpstreamError("invalid_request", "");
    const started = now();
    const attemptTimeoutMs = input.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS;
    const totalTimeoutMs = input.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    // Only a GET may be repeated on its own. A POST or DELETE that failed may or may not have been
    // processed; deciding what to do next is the caller's job (never an automatic resend).
    const retries = input.method === "GET" ? maxRetries : 0;
    let attempt = 0;
    for (;;) {
      let host = "";
      try {
        host = new URL(input.url).hostname.toLowerCase();
      } catch {
        // check() below reports it.
      }
      try {
        const response = await attemptOnce(input, attemptTimeoutMs, maxBytes, started);
        emit({ type: "request", host: response.host, purpose: input.purpose, method: input.method, status: response.status, ms: response.durationMs, failure: undefined });
        if (response.status >= 500 && attempt < retries) {
          attempt += 1;
          const wait = Math.min(backoffCap, backoffBase * 2 ** (attempt - 1)) + jitter(Math.floor(backoffBase / 2));
          if (now() - started + wait > totalTimeoutMs) return response;
          await sleep(wait, input.signal).catch(() => undefined);
          continue;
        }
        return response;
      } catch (error) {
        const failure = error instanceof UpstreamError ? error : new UpstreamError("network", host);
        emit({ type: "request", host: failure.host, purpose: input.purpose, method: input.method, status: failure.status, ms: Math.max(0, now() - started), failure: failure.kind });
        const runtime = runtimes.get(failure.host);
        if (runtime !== undefined && (failure.kind === "timeout" || failure.kind === "network" || failure.kind === "too_large")) {
          recordFailure(runtime, failure.kind);
        } else if (runtime !== undefined && (failure.kind === "rate_limited" || failure.kind === "cloudflare" || failure.kind === "requires_key")) {
          runtime.errors += 1;
          runtime.lastErrorAt = now();
          noteState(runtime, failure.kind);
        }
        const retryable = failure.kind === "network" || failure.kind === "timeout" || failure.kind === "rate_limited";
        if (retryable && attempt < retries) {
          const hinted = failure.kind === "rate_limited" ? failure.retryAfterMs : undefined;
          attempt += 1;
          const backoff = Math.min(backoffCap, backoffBase * 2 ** (attempt - 1)) + jitter(Math.floor(backoffBase / 2));
          const wait = Math.min(Math.max(hinted ?? 0, backoff), MAX_RETRY_AFTER_MS);
          if (now() - started + wait <= totalTimeoutMs) {
            await sleep(wait, input.signal).catch(() => undefined);
            if (input.signal?.aborted === true) throw new UpstreamError("aborted", failure.host);
            continue;
          }
        }
        throw failure;
      }
    }
  }

  return {
    request,
    json(response) {
      try {
        return JSON.parse(response.body) as unknown;
      } catch {
        throw new UpstreamError("invalid_json", response.host);
      }
    },
    health() {
      const nowMs = now();
      const out: Record<string, HostHealth> = {};
      for (const [host, runtime] of [...runtimes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        out[host] = {
          state: stateOf(runtime, nowMs),
          errors: runtime.errors,
          last_error_at: runtime.lastErrorAt === undefined ? null : isoSecondOf(runtime.lastErrorAt),
        };
      }
      return out;
    },
    hostState(host) {
      const runtime = runtimes.get(host.toLowerCase());
      return runtime === undefined ? undefined : stateOf(runtime, now());
    },
    hosts: () => [...runtimes.values()].map((runtime) => runtime.entry),
    clearLatch(host) {
      const runtime = runtimes.get(host.toLowerCase());
      if (runtime === undefined) return;
      runtime.requiresKeyAt = undefined;
      runtime.blockedAt = undefined;
      runtime.circuitOpenUntil = 0;
      runtime.consecutiveFailures = 0;
      noteState(runtime, "cleared");
    },
  };
}

declare module "./types.js" {
  interface RelayServices {
    readonly upstream?: Upstream;
  }
}
