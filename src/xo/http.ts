import { untrusted, type UntrustedString, type XoErrorKind } from "./types.js";

// Transport for the two public XO hosts. GET only, no credentials, no cookies, no redirects.
// Everything that can go wrong maps to an XoError whose message is built from our own fixed
// text: upstream bodies are attacker-influenced (a Data API 404 even echoes the request query)
// and never reach `message`.

export const XO_ORDERBOOK_HOST = "orderbooks.xo.market";
export const XO_DATA_API_HOST = "api-mainnet.xo.market";
export const XO_EXPLORER_HOST = "explorer-mainnet.xo.market";
// What a client allows when its caller names no hosts: the two read APIs the v0.1 tools use. The explorer
// host is NOT in this default: v0.1 tests pin it as blocked, and nothing in the read tools needs it.
const DEFAULT_ALLOWED_HOSTS: readonly string[] = [XO_ORDERBOOK_HOST, XO_DATA_API_HOST];
// What the plugin passes when it also reads chain logs (src/xo/chain/reads.ts). The relay passes its own,
// larger set from its own code (the bundler, the RPC hosts, the metadata buckets).
export const XO_PLUGIN_HOSTS: readonly string[] = [XO_ORDERBOOK_HOST, XO_DATA_API_HOST, XO_EXPLORER_HOST];

// Cloudflare 403s the default Python UA; Node's fetch sends "node". Always identify ourselves.
export const XO_USER_AGENT = "insurance-markets-xo-plugin/0.2";
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 3000;
export const DEFAULT_DEADLINE_MS = 8000;
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
// The orderbook documents 5 requests per second; 250 ms keeps us at 4.
export const DEFAULT_MIN_INTERVAL_MS = 250;
export const DEFAULT_MAX_REQUESTS_PER_HOST = 100;

const ERROR_BODY_CAP_BYTES = 16 * 1024;
const UPSTREAM_MESSAGE_MAX_CHARS = 200;
const RETRY_BACKOFF_MS = 300;
const DEFAULT_RATE_LIMIT_WAIT_MS = 500;
// A retry must leave at least this much of the deadline for the attempt itself.
const MIN_RETRY_WINDOW_MS = 500;
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

export interface XoErrorDetails {
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly host?: string;
  readonly path?: string;
  readonly upstreamMessage?: UntrustedString;
  readonly cause?: unknown;
}

export class XoError extends Error {
  readonly kind: XoErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly host: string | undefined;
  readonly path: string | undefined;
  // Short excerpt of an upstream error message, branded because it is not ours. Never part of
  // `message`; include it in output only after sanitizing.
  readonly upstreamMessage: UntrustedString | undefined;

  constructor(kind: XoErrorKind, message: string, details: XoErrorDetails = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "XoError";
    this.kind = kind;
    this.status = details.status;
    this.retryAfterMs = details.retryAfterMs;
    this.host = details.host;
    this.path = details.path;
    this.upstreamMessage = details.upstreamMessage;
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpOptions {
  // Defaults to globalThis.fetch looked up at call time, so tests can stub the global.
  readonly fetchImpl?: FetchLike;
  // A string replaces the default. null sends no User-Agent header at all, for a browser: a script-set
  // user-agent is not CORS-safelisted and would add a preflight (docs/dapp-design.md A5). Leaving it out
  // (undefined) keeps the default insurance-markets-xo-plugin string.
  readonly userAgent?: string | null;
  // Exact lower-case hostnames this client may reach (https, port 443, no userinfo). Defaults to the two
  // read APIs. Wildcards, ports and empty entries are rejected at construction, so a typo cannot widen
  // the list.
  readonly allowedHosts?: readonly string[];
  readonly attemptTimeoutMs?: number;
  readonly deadlineMs?: number;
  readonly maxBodyBytes?: number;
  readonly minIntervalMs?: number;
  readonly maxRequestsPerHost?: number;
  // Optional ceiling on the whole client's lifetime, measured from construction. Composite reads
  // make several requests in a row; this keeps them inside the plugin's own time limit.
  readonly totalBudgetMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const defaultNow = (): number => performance.now();

// A hostname list is configuration, so it is validated like input: lower-case DNS labels only, which rules
// out wildcards, ports, paths, userinfo, IP literals and the empty string.
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function parseAllowedHosts(hosts: readonly string[]): ReadonlySet<string> {
  if (hosts.length === 0) throw new RangeError("allowedHosts must not be empty");
  for (const host of hosts) {
    if (!HOSTNAME.test(host) || /^[0-9.]+$/.test(host)) {
      throw new RangeError("allowedHosts entries must be exact lower-case hostnames");
    }
  }
  return new Set(hosts);
}

function positive(name: string, value: number | undefined, fallback: number, allowZero = false): number {
  const chosen = value ?? fallback;
  if (!Number.isFinite(chosen) || chosen < 0 || (!allowZero && chosen === 0)) {
    throw new RangeError(`${name} must be a ${allowZero ? "non-negative" : "positive"} finite number`);
  }
  return chosen;
}

// Rejects with the signal's reason as soon as it aborts, even when the underlying promise (an
// injected fetch stub, for instance) ignores the signal.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Seconds, or an HTTP date. Returns null for anything else.
function parseRetryAfterHeader(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^[0-9]{1,7}$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(trimmed);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(date - nowMs, 0), MAX_RETRY_AFTER_MS);
}

function extractUpstreamMessage(json: unknown): UntrustedString | undefined {
  if (!isRecord(json)) return undefined;
  const candidate = json["message"] ?? json["error"];
  const text = Array.isArray(candidate) ? candidate.find((item) => typeof item === "string") : candidate;
  if (typeof text !== "string" || text.length === 0) return undefined;
  return untrusted(text.slice(0, UPSTREAM_MESSAGE_MAX_CHARS));
}

function isRetryable(error: XoError): boolean {
  return (
    error.kind === "timeout" ||
    error.kind === "rate_limited" ||
    (error.kind === "upstream_error" && error.status !== undefined && error.status >= 500)
  );
}

interface HostState {
  nextSlot: number;
  requests: number;
}

export class XoHttp {
  private readonly fetchImpl: FetchLike;
  private readonly userAgent: string | null;
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly attemptTimeoutMs: number;
  private readonly deadlineMs: number;
  private readonly maxBodyBytes: number;
  private readonly minIntervalMs: number;
  private readonly maxRequestsPerHost: number;
  private readonly budgetEndsAt: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly hosts = new Map<string, HostState>();

  constructor(options: HttpOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.userAgent = options.userAgent === undefined ? XO_USER_AGENT : options.userAgent;
    this.allowedHosts = parseAllowedHosts(options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS);
    this.attemptTimeoutMs = positive("attemptTimeoutMs", options.attemptTimeoutMs, DEFAULT_ATTEMPT_TIMEOUT_MS);
    this.deadlineMs = positive("deadlineMs", options.deadlineMs, DEFAULT_DEADLINE_MS);
    this.maxBodyBytes = positive("maxBodyBytes", options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES);
    this.minIntervalMs = positive("minIntervalMs", options.minIntervalMs, DEFAULT_MIN_INTERVAL_MS, true);
    this.maxRequestsPerHost = positive("maxRequestsPerHost", options.maxRequestsPerHost, DEFAULT_MAX_REQUESTS_PER_HOST);
    this.now = options.now ?? defaultNow;
    this.sleep = options.sleep ?? defaultSleep;
    this.budgetEndsAt =
      options.totalBudgetMs === undefined ? Number.POSITIVE_INFINITY : this.now() + positive("totalBudgetMs", options.totalBudgetMs, 0);
  }

  // Attempts sent so far per host (retries count). For budget reporting.
  requestCounts(): Readonly<Record<string, number>> {
    return Object.fromEntries([...this.hosts].map(([host, state]) => [host, state.requests]));
  }

  // Throws "blocked" before any request is made for a URL that is not HTTPS to one of the allowed
  // exact hostnames. The check runs on the parsed URL, so userinfo tricks, suffix hosts, trailing
  // dots and custom ports are all rejected.
  checkUrl(raw: string | URL): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new XoError("blocked", "URL could not be parsed");
    }
    if (url.protocol !== "https:") throw new XoError("blocked", "only https URLs are allowed");
    if (url.username !== "" || url.password !== "") throw new XoError("blocked", "URL credentials are not allowed");
    if (url.port !== "") throw new XoError("blocked", "custom ports are not allowed");
    if (!this.allowedHosts.has(url.hostname)) throw new XoError("blocked", "host is not on the XO allowlist");
    return url;
  }

  // GET the URL and return parsed JSON. Every non-2xx, timeout, oversize or non-JSON outcome
  // throws an XoError. At most one retry, for 429, 5xx and timeouts, and only if the overall
  // deadline still has room.
  async getJson(raw: string | URL): Promise<unknown> {
    const url = this.checkUrl(raw);
    const deadlineAt = Math.min(this.now() + this.deadlineMs, this.budgetEndsAt);
    for (let attemptNo = 0; ; attemptNo += 1) {
      try {
        return await this.attempt(url, deadlineAt);
      } catch (error) {
        if (!(error instanceof XoError)) throw error;
        if (attemptNo >= 1 || !isRetryable(error)) throw error;
        const wait = error.kind === "rate_limited" ? (error.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS) : RETRY_BACKOFF_MS;
        if (wait + MIN_RETRY_WINDOW_MS > deadlineAt - this.now()) throw error;
        await this.sleep(wait);
      }
    }
  }

  private hostState(host: string): HostState {
    let state = this.hosts.get(host);
    if (state === undefined) {
      state = { nextSlot: 0, requests: 0 };
      this.hosts.set(host, state);
    }
    return state;
  }

  // Slots are reserved synchronously, so concurrent callers queue up behind each other.
  private async throttle(state: HostState, deadlineAt: number, where: { host: string; path: string }): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, state.nextSlot);
    state.nextSlot = slot + this.minIntervalMs;
    const wait = slot - now;
    if (wait <= 0) return;
    if (slot >= deadlineAt) throw new XoError("timeout", "deadline reached while waiting for a rate-limit slot", where);
    await this.sleep(wait);
  }

  private async attempt(url: URL, deadlineAt: number): Promise<unknown> {
    const where = { host: url.hostname, path: url.pathname };
    const state = this.hostState(url.hostname);
    if (state.requests >= this.maxRequestsPerHost) {
      throw new XoError("blocked", "request budget for this host is exhausted", where);
    }
    // Reserve the slot before the first await: callers started in the same tick (a tool call
    // reads several books in parallel) must not all pass the check against the same count.
    state.requests += 1;
    let remaining: number;
    try {
      await this.throttle(state, deadlineAt, where);
      remaining = deadlineAt - this.now();
      if (remaining <= 0) throw new XoError("timeout", "overall deadline reached", where);
    } catch (error) {
      // Nothing was sent, so the slot goes back.
      state.requests -= 1;
      throw error;
    }

    // AbortSignal.timeout needs a whole number of milliseconds.
    const signal = AbortSignal.timeout(Math.max(1, Math.floor(Math.min(this.attemptTimeoutMs, remaining))));
    let response: Response;
    try {
      response = await abortable(
        this.fetchImpl(url.toString(), {
          method: "GET",
          headers: this.userAgent === null ? { accept: "application/json" } : { "user-agent": this.userAgent, accept: "application/json" },
          redirect: "error",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal,
        }),
        signal,
      );
    } catch (cause) {
      if (signal.aborted) throw new XoError("timeout", "request timed out", { ...where, cause });
      throw new XoError("upstream_error", "request failed before a response arrived", { ...where, cause });
    }

    if (response.status >= 200 && response.status < 300) {
      const text = await this.readText(response, this.maxBodyBytes, signal, where);
      try {
        return JSON.parse(text) as unknown;
      } catch (cause) {
        throw new XoError("invalid_response", "response body is not valid JSON", { ...where, status: response.status, cause });
      }
    }
    throw await this.errorFor(response, signal, where);
  }

  private async errorFor(response: Response, signal: AbortSignal, where: { host: string; path: string }): Promise<XoError> {
    const status = response.status;
    let body: unknown;
    try {
      body = JSON.parse(await this.readText(response, ERROR_BODY_CAP_BYTES, signal, where)) as unknown;
    } catch {
      // The body is only used for hints; an unreadable one changes nothing.
      body = undefined;
    }
    const upstreamMessage = extractUpstreamMessage(body);
    const base = { ...where, status, ...(upstreamMessage === undefined ? {} : { upstreamMessage }) };
    if (status === 429) {
      const fromHeader = parseRetryAfterHeader(response.headers.get("retry-after"), Date.now());
      const bodyMs = isRecord(body) ? body["retry_after_ms"] : undefined;
      const fromBody = typeof bodyMs === "number" && Number.isFinite(bodyMs) && bodyMs >= 0 ? Math.min(Math.floor(bodyMs), MAX_RETRY_AFTER_MS) : null;
      const retryAfterMs = fromHeader ?? fromBody;
      return new XoError("rate_limited", "upstream rate limit reached (HTTP 429)", {
        ...base,
        ...(retryAfterMs === null ? {} : { retryAfterMs }),
      });
    }
    if (status === 404) return new XoError("not_found", "upstream returned HTTP 404", base);
    if (status >= 300 && status < 400) return new XoError("upstream_error", `unexpected redirect (HTTP ${status}) refused`, base);
    if (status === 403) {
      return new XoError("upstream_error", "upstream returned HTTP 403 (blocked by the edge; check the User-Agent)", base);
    }
    return new XoError("upstream_error", `upstream returned HTTP ${status}`, base);
  }

  // Stream-reads the body and aborts the moment it passes `cap` bytes, so an oversized or
  // endless response never sits in memory.
  private async readText(
    response: Response,
    cap: number,
    signal: AbortSignal,
    where: { host: string; path: string },
  ): Promise<string> {
    const ctx = { ...where, status: response.status };
    const tooLarge = () => new XoError("invalid_response", `response body exceeds ${cap} bytes`, ctx);
    const declared = response.headers.get("content-length");
    if (declared !== null && /^[0-9]{1,15}$/.test(declared) && Number(declared) > cap) {
      await response.body?.cancel().catch(() => undefined);
      throw tooLarge();
    }
    if (response.body === null) return "";
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
        if (total > cap) throw tooLarge();
        chunks.push(value);
      }
    } catch (cause) {
      if (cause instanceof XoError) throw cause;
      if (signal.aborted) throw new XoError("timeout", "request timed out while reading the body", { ...ctx, cause });
      throw new XoError("upstream_error", "body read failed", { ...ctx, cause });
    } finally {
      if (!finished) await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new XoError("invalid_response", "response body is not valid UTF-8", { ...ctx, cause });
    }
  }
}
