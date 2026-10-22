import { READ_SERVICES, type ReadService } from "../app/headers.config.js";
import { decide, isRestrictedService, RESTRICTED_SERVICES, type Allowed, type OriginMap } from "./allowlist.js";
import { VenueStateTracker } from "../sdk/venues/state.js";
import { isBlockPage } from "../sdk/venues/transport.js";
import {
  BRIDGE_USER_AGENT,
  MAX_PROXY_RESPONSE_BYTES,
  PROXY_TIMEOUT_MS,
  READ_PROXY_PREFIX,
  readProxyResponseSchema,
  type BridgeErrorCode,
  type ReadProxyResponse,
} from "./contract.js";
import { defineRoute, fail, json, type BridgeModule, type BridgeModuleFactory, type DaemonHost, type FailureBody, type RouteContext } from "./server.js";

// The read proxy (docs/dapp-design.md 1.3 B4, 4.2, 4.8 R1/R3/R9/R10, 7.2 M1-3/M1-5/M1-6).
//
//   GET  /ui/read/<service>/<upstream path>?<upstream query>
//   POST /ui/read/<service>/<upstream path>      (JSON-RPC to a chain node, Hyperliquid /info, Polymarket CLOB batch reads)
//
// WHY IT EXISTS. The Cockpit page has `connect-src 'self'`, so it cannot reach a venue itself; and some venues
// (the XO orderbook, Limitless, Kalshi) give a browser no CORS answer at all. The daemon is an ordinary
// non-browser client, so it fetches them for the page: with the fixed User-Agent, no Origin, no Referer, no
// cookie, nothing from the caller's request. That is not a workaround of a block (R10): it is the same request
// the plugin's own client sends.
//
// WHAT IT DOES ON EVERY REQUEST, in this order (each is a test in bridge/test/proxy):
//   1. bridge/allowlist.ts decides: service, host, path, method, query and (POST) body shape. A refusal is a
//      fixed-text error with a code from the contract. Nothing has been sent yet.
//   2. A restricted-terms service (Kalshi, Quotient, Novig, Gemini) is refused with venue_disabled unless the
//      operator turned it on (XO_COCKPIT_VENUES). Their data is memory-only: this module imports no file API and
//      keeps no cache, so there is nothing to write (M1-6, and a test scans the source).
//   3. R9: a service paused after any 403, three 401s or three 429s in a row, or a web page served where JSON was
//      expected (10 minutes), or cooling down after a 429 with Retry-After, is refused with venue_paused and says until
//      when and why (details.reason, a PauseSignal). The rule is the SDK's (sdk/venues/state.ts), the same one the page
//      applies; the pause is announced once on stderr.
//   4. A per-service token bucket and a global in-flight cap (rate_limited, with Retry-After), so a runaway
//      page or agent cannot hammer a venue.
//   5. One request upstream: https, redirect: manual, a timeout (PROXY_TIMEOUT_MS) that also covers reading the
//      body, a size cap (MAX_PROXY_RESPONSE_BYTES) counted on decoded bytes. A 3xx is refused (redirect_refused),
//      never followed.
//   6. The answer is the contract's envelope for every upstream status whose body is JSON (a 404 or 429 is data
//      for the adapter, not a daemon error). The upstream body is parsed and re-serialised by the daemon: no
//      upstream header, cookie or raw byte reaches the page. A non-JSON body is upstream_not_json, except that a
//      401, 403 or 429 with a non-JSON body (a Cloudflare block page, say) is passed as an envelope with
//      `body: null` so the adapter still sees the status that drives its pause logic, and a web page served with a 2xx
//      (a bot wall or challenge page) is a block: the service is paused and the answer is venue_paused (block_page).
//
// Error messages are fixed daemon text. Upstream text, a URL or a header value is never quoted back, logged or
// stored.

// ---- upstream transport ---------------------------------------------------------------------------------------------

export interface UpstreamInit {
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly redirect: "manual";
  readonly cache: "no-store";
  readonly signal: AbortSignal;
}

export interface UpstreamResponse {
  readonly status: number;
  readonly type?: string;
  readonly headers: { get(name: string): string | null };
  readonly body: { getReader(): { read(): Promise<{ readonly done: boolean; readonly value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> } } | null;
}

export type UpstreamFetch = (url: string, init: UpstreamInit) => Promise<UpstreamResponse>;

// Looked up at call time so a test can stub the global.
const defaultFetch: UpstreamFetch = (url, init) => globalThis.fetch(url, init);

// ---- options ------------------------------------------------------------------------------------------------------------

export interface ServiceLimit {
  readonly perSecond: number;
  readonly burst: number;
}

// Under each venue's documented limit (design 4.6): the XO orderbook documents 5 requests per second, the XO
// Data API 100 per 10 s. A paid service is held lower.
const DEFAULT_LIMIT: ServiceLimit = { perSecond: 5, burst: 10 };
export const SERVICE_LIMITS: Readonly<Partial<Record<ReadService, ServiceLimit>>> = Object.freeze({
  xo_orderbook: { perSecond: 4, burst: 5 },
  xo_data: { perSecond: 8, burst: 10 },
  polymarket_gamma: { perSecond: 10, burst: 20 },
  polymarket_clob: { perSecond: 10, burst: 20 },
  polymarket_data: { perSecond: 10, burst: 20 },
  manifold: { perSecond: 8, burst: 10 },
  hyperliquid_info: { perSecond: 10, burst: 20 },
  quotient: { perSecond: 2, burst: 3 },
});

export interface ReadProxyOptions {
  readonly fetch?: UpstreamFetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly maxInFlight?: number;
  // Restricted-terms services the operator turned on. Everything else restricted stays off.
  readonly enabled?: Iterable<ReadService>;
  // Extra request headers for a service (a daemon-held key). Attached only to that service's own origin.
  readonly credentials?: (service: ReadService) => Readonly<Record<string, string>> | undefined;
  readonly limits?: Readonly<Partial<Record<ReadService, ServiceLimit>>>;
  // Tests that point the proxy at a loopback server. Never reachable from the wire.
  readonly origins?: OriginMap;
  readonly stderr?: { write(text: string): unknown };
}

export interface ProxyRequest {
  readonly service: string;
  readonly method: string;
  readonly path: string;
  readonly query: string;
  readonly body?: Uint8Array;
  readonly signal?: AbortSignal;
}

export type ProxyOutcome = { readonly ok: true; readonly envelope: ReadProxyResponse } | { readonly ok: false; readonly failure: FailureBody };

export interface VenueState {
  readonly enabled: boolean;
  readonly reason: "default_off" | "paused" | "none";
  readonly paused_until: string | null;
}

export interface ReadProxy {
  handle(request: ProxyRequest): Promise<ProxyOutcome>;
  // One row per service id, in the shape of the contract's status.venues.
  venues(): Readonly<Record<string, VenueState>>;
  isEnabled(service: ReadService): boolean;
  inFlight(): number;
  close(): void;
}

// ---- helpers ---------------------------------------------------------------------------------------------------------------

const CONTROL_STATUSES: ReadonlySet<number> = new Set([401, 403, 429]);
const MAX_RETRY_AFTER_S = 86_400;
const SAFE_HEADER_NAME = /^[a-z][a-z0-9-]{0,63}$/;
// A header the credentials hook may never set: they would let it override what the proxy guarantees.
const FORBIDDEN_CREDENTIAL_HEADERS: ReadonlySet<string> = new Set(["host", "origin", "referer", "cookie", "user-agent", "content-length", "content-type", "accept", "connection", "transfer-encoding"]);

function isoSecond(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Seconds, or an HTTP date. Null for anything else.
export function parseRetryAfterSeconds(value: string | null, nowMs: number): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^[0-9]{1,7}$/.test(text)) return Math.min(Number(text), MAX_RETRY_AFTER_S);
  const date = Date.parse(text);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(Math.ceil((date - nowMs) / 1000), 0), MAX_RETRY_AFTER_S);
}

function failure(code: BridgeErrorCode, message: string, extra: { details?: FailureBody["details"]; retryAfterS?: number } = {}): ProxyOutcome {
  return { ok: false, failure: { code, message, ...extra } };
}

interface Bucket {
  tokens: number;
  at: number;
}

class Abort extends Error {
  constructor(readonly reason: "timeout" | "client") {
    super(reason);
  }
}

// Rejects as soon as the signal aborts, even when the promise (a stubbed fetch) ignores the signal.
function abortable<T>(promise: Promise<T>, signal: AbortSignal, reasonOf: () => Abort): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(reasonOf());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(reasonOf());
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

// ---- the proxy ------------------------------------------------------------------------------------------------------------------

export function createReadProxy(options: ReadProxyOptions = {}): ReadProxy {
  const upstream = options.fetch ?? defaultFetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? PROXY_TIMEOUT_MS;
  const maxBytes = options.maxResponseBytes ?? MAX_PROXY_RESPONSE_BYTES;
  const maxInFlight = options.maxInFlight ?? 16;
  const stderr = options.stderr;
  const enabled = new Set<ReadService>([...(options.enabled ?? [])].filter(isRestrictedService));
  // The venue state rule, keyed by service id (sdk/venues/state.ts).
  const states = new VenueStateTracker();
  const buckets = new Map<ReadService, Bucket>();
  let active = 0;
  let closed = false;

  const limitOf = (service: ReadService): ServiceLimit => options.limits?.[service] ?? SERVICE_LIMITS[service] ?? DEFAULT_LIMIT;

  function take(service: ReadService): number | undefined {
    const limit = limitOf(service);
    const at = now();
    const bucket = buckets.get(service) ?? { tokens: limit.burst, at };
    bucket.tokens = Math.min(limit.burst, bucket.tokens + (Math.max(0, at - bucket.at) / 1000) * limit.perSecond);
    bucket.at = at;
    buckets.set(service, bucket);
    if (bucket.tokens < 1) return Math.max(1, Math.ceil((1 - bucket.tokens) / limit.perSecond));
    bucket.tokens -= 1;
    return undefined;
  }

  // Seconds left of a pause or a cooldown, and what tripped it, or undefined.
  function blockedFor(service: ReadService): { readonly seconds: number; readonly reason: string } | undefined {
    const at = now();
    const pause = states.check(service, at);
    return pause.paused ? { seconds: Math.ceil((pause.untilMs - at) / 1000), reason: pause.signal } : undefined;
  }

  // Feeds one answer to the rule, and announces a pause (not a Retry-After cooldown) once, when it begins or grows.
  function record(service: ReadService, status: number, retryAfterS: number | null, blockPage = false): void {
    const at = now();
    const before = states.check(service, at);
    states.record(service, { status, retryAfterMs: retryAfterS === null ? null : retryAfterS * 1000, blockPage }, at);
    const after = states.check(service, at);
    if (!after.paused || after.signal === "retry_after") return;
    if (before.paused && before.signal === after.signal && before.untilMs === after.untilMs) return;
    // Fixed text and a service id from our own closed list: no upstream text.
    stderr?.write(`xo-market cockpit: reads from ${service} are paused for ${Math.round((after.untilMs - at) / 60_000)} minutes (${after.signal}). Nothing is retried around it.\n`);
  }

  function headersFor(allowed: Allowed): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": BRIDGE_USER_AGENT,
    };
    if (allowed.method === "POST") headers["content-type"] = "application/json";
    // A daemon-held credential, attached to this service's own origin only. Anything that could override the
    // headers above, or smuggle a line break, is dropped.
    const extra = options.credentials?.(allowed.service);
    for (const [name, value] of Object.entries(extra ?? {})) {
      const key = name.toLowerCase();
      if (!SAFE_HEADER_NAME.test(key) || FORBIDDEN_CREDENTIAL_HEADERS.has(key) || typeof value !== "string" || value === "" || /[\r\n\u0000]/.test(value)) continue;
      headers[key] = value;
    }
    return headers;
  }

  async function readCapped(response: UpstreamResponse, signal: AbortSignal, reasonOf: () => Abort): Promise<Uint8Array | "too_large"> {
    const declared = Number(response.headers.get("content-length"));
    const reader = response.body?.getReader();
    if (Number.isFinite(declared) && declared > maxBytes) {
      void reader?.cancel().catch(() => undefined);
      return "too_large";
    }
    if (reader === undefined) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const part = await abortable(reader.read(), signal, reasonOf);
        if (part.done) break;
        if (part.value === undefined) continue;
        total += part.value.byteLength;
        if (total > maxBytes) {
          void reader.cancel().catch(() => undefined);
          return "too_large";
        }
        chunks.push(part.value);
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  }

  async function send(allowed: Allowed, outer: AbortSignal | undefined): Promise<ProxyOutcome> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuter = (): void => controller.abort();
    if (outer?.aborted === true) controller.abort();
    else outer?.addEventListener("abort", onOuter, { once: true });
    const reasonOf = (): Abort => new Abort(timedOut ? "timeout" : "client");
    const service = allowed.service;
    try {
      const response = await abortable(
        upstream(allowed.url, {
          method: allowed.method,
          headers: headersFor(allowed),
          ...(allowed.body === undefined ? {} : { body: allowed.body }),
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        }),
        controller.signal,
        reasonOf,
      );
      const status = response.status;
      const retryAfterS = parseRetryAfterSeconds(response.headers.get("retry-after"), now());
      // The status is recorded before the body is looked at: a block page that is not JSON still pauses.
      if (status === 0 || response.type === "opaqueredirect" || response.type === "opaque" || (status >= 300 && status < 400)) {
        void response.body?.getReader().cancel().catch(() => undefined);
        return failure("redirect_refused", "The upstream answered with a redirect, which is never followed.", { details: { service } });
      }
      record(service, status, retryAfterS);
      const bytes = await readCapped(response, controller.signal, reasonOf);
      if (bytes === "too_large") return failure("response_too_large", "The upstream answer is larger than the proxy allows.", { details: { service } });

      let body: unknown;
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      // A web page where JSON was expected, served as success: a block, not a body to pass on.
      if (status >= 200 && status < 300 && isBlockPage(response.headers.get("content-type"), text)) {
        record(service, status, retryAfterS, true);
        const blocked = blockedFor(service);
        return failure("venue_paused", "Reads from this venue are paused: it answered with a web page instead of data.", {
          details: { service, reason: "block_page" },
          ...(blocked === undefined ? {} : { retryAfterS: blocked.seconds }),
        });
      }
      if (text.trim() === "") {
        if (status === 204 || CONTROL_STATUSES.has(status)) body = null;
        else return failure("upstream_not_json", "The upstream answer is not JSON.", { details: { service, upstream_status: status } });
      } else {
        try {
          body = JSON.parse(text);
        } catch {
          if (!CONTROL_STATUSES.has(status)) return failure("upstream_not_json", "The upstream answer is not JSON.", { details: { service, upstream_status: status } });
          body = null;
        }
      }
      const at = now();
      const fields = {
        service,
        upstream_status: status,
        fetched_at: isoSecond(at),
        fetched_at_ms: at,
        bytes: bytes.byteLength,
        retry_after_s: retryAfterS,
      };
      // The body is JSON by construction (JSON.parse); the envelope's own fields are checked against the contract.
      if (!readProxyResponseSchema.omit({ body: true }).safeParse(fields).success) return failure("internal", "The daemon could not build the read-proxy answer.");
      const envelope = { ...fields, body } as ReadProxyResponse;
      return { ok: true, envelope };
    } catch (error) {
      if (error instanceof Abort) {
        // A client that went away gets no answer anyway; the code only matters for the timeout.
        return failure("upstream_timeout", "The upstream did not answer in time.", { details: { service, reason: error.reason === "timeout" ? "timeout" : "client_gone" } });
      }
      return failure("upstream_timeout", "The upstream could not be reached.", { details: { service, reason: "network" } });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    }
  }

  async function handle(request: ProxyRequest): Promise<ProxyOutcome> {
    if (closed) return failure("precondition_failed", "The read proxy is shutting down.");
    const verdict = decide(
      { service: request.service, method: request.method, path: request.path, query: request.query, body: request.body },
      options.origins === undefined ? {} : { origins: options.origins },
    );
    if (!verdict.ok) return failure(verdict.code, verdict.message);
    const allowed = verdict.allowed;
    if (allowed.restricted && !enabled.has(allowed.service)) {
      return failure("venue_disabled", "This venue has restricted terms and is off. The operator turns it on at start (XO_COCKPIT_VENUES).", { details: { service: allowed.service, reason: "default_off" } });
    }
    const blocked = blockedFor(allowed.service);
    if (blocked !== undefined) {
      return failure("venue_paused", "Reads from this venue are paused after it refused or limited earlier requests.", {
        details: { service: allowed.service, reason: blocked.reason },
        retryAfterS: blocked.seconds,
      });
    }
    const wait = take(allowed.service);
    if (wait !== undefined) return failure("rate_limited", "Too many reads for this venue. Try again shortly.", { details: { service: allowed.service }, retryAfterS: wait });
    if (active >= maxInFlight) return failure("rate_limited", "Too many reads are in flight.", { details: { service: allowed.service }, retryAfterS: 1 });
    active += 1;
    try {
      return await send(allowed, request.signal);
    } finally {
      active -= 1;
    }
  }

  return {
    handle,
    venues: () => {
      const out: Record<string, VenueState> = {};
      for (const service of READ_SERVICES) {
        const restrictedOff = isRestrictedService(service) && !enabled.has(service);
        const blocked = blockedFor(service);
        out[service] = {
          enabled: !restrictedOff && blocked === undefined,
          reason: restrictedOff ? "default_off" : blocked !== undefined ? "paused" : "none",
          paused_until: !restrictedOff && blocked !== undefined ? isoSecond(now() + blocked.seconds * 1000) : null,
        };
      }
      return out;
    },
    isEnabled: (service) => !isRestrictedService(service) || enabled.has(service),
    inFlight: () => active,
    close: () => {
      closed = true;
    },
  };
}

// ---- operator settings from the environment -------------------------------------------------------------------------------

export const ENABLED_VENUES_ENV = "XO_COCKPIT_VENUES";
export const QUOTIENT_KEY_ENV = "XO_COCKPIT_QUOTIENT_KEY";
const QUOTIENT_KEY = /^qt_[A-Za-z0-9_-]{8,200}$/;

export interface ParsedVenues {
  readonly enabled: readonly ReadService[];
  readonly ignored: number;
}

// XO_COCKPIT_VENUES=kalshi,quotient. Only restricted-terms services can be named; anything else is ignored (and
// counted, so the caller can say so without echoing the text).
export function parseEnabledVenues(value: string | undefined): ParsedVenues {
  if (value === undefined || value.trim() === "") return { enabled: [], ignored: 0 };
  const enabled: ReadService[] = [];
  let ignored = 0;
  for (const part of value.split(",")) {
    const name = part.trim().toLowerCase();
    if (name === "") continue;
    const match = RESTRICTED_SERVICES.find((service) => service === name);
    if (match === undefined) ignored += 1;
    else if (!enabled.includes(match)) enabled.push(match);
  }
  return { enabled, ignored };
}

// ---- the route module ----------------------------------------------------------------------------------------------------------

const proxies = new WeakMap<DaemonHost, ReadProxy>();

// For the status route (D3/D4): the venue switches the proxy holds, in the contract's `venues` shape. Undefined
// when no proxy is registered on that host.
export function venueSwitchesOf(host: DaemonHost): Readonly<Record<string, VenueState>> | undefined {
  return proxies.get(host)?.venues();
}

export function readProxyOf(host: DaemonHost): ReadProxy | undefined {
  return proxies.get(host);
}

function readRoute(proxy: ReadProxy, method: "GET" | "POST") {
  const handler = async (ctx: RouteContext<unknown>) => {
    const rest = ctx.path.slice(READ_PROXY_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash === -1) return fail("path_not_allowed", "That path is not on the read proxy's list for this service.");
    const outcome = await proxy.handle({
      service: rest.slice(0, slash),
      method,
      path: rest.slice(slash),
      query: ctx.query,
      ...(method === "POST" ? { body: ctx.rawBody } : {}),
      signal: ctx.signal,
    });
    if (!outcome.ok) return fail(outcome.failure.code, outcome.failure.message, { ...(outcome.failure.details === undefined ? {} : { details: outcome.failure.details }), ...(outcome.failure.retryAfterS === undefined ? {} : { retryAfterS: outcome.failure.retryAfterS }) });
    return json(outcome.envelope);
  };
  return defineRoute(method === "GET" ? { method, path: READ_PROXY_PREFIX, access: { scope: "read" }, handler } : { method, path: READ_PROXY_PREFIX, access: { scope: "read" }, body: "raw", handler });
}

export interface ProxyModuleOptions extends Omit<ReadProxyOptions, "stderr" | "now"> {
  readonly name?: string;
}

// The factory behind `bridgeModule`, with the proxy's options exposed for tests (a scripted upstream fetch).
export function createProxyModule(options: ProxyModuleOptions = {}): BridgeModuleFactory {
  return (host): BridgeModule => {
    const fromEnv = parseEnabledVenues(host.env[ENABLED_VENUES_ENV]);
    if (fromEnv.ignored > 0) host.stderr.write(`xo-market cockpit: ${ENABLED_VENUES_ENV} named ${fromEnv.ignored} item(s) that are not restricted-terms venues; they were ignored.\n`);
    const enabled = options.enabled === undefined ? fromEnv.enabled : [...options.enabled];
    if (enabled.length > 0) {
      host.stderr.write(`xo-market cockpit: restricted-terms venues turned on by the operator: ${enabled.join(", ")}. Their data is kept in memory only; the daemon stores none of it.\n`);
    }
    let quotientKey: string | undefined;
    const rawKey = host.env[QUOTIENT_KEY_ENV];
    if (rawKey !== undefined && rawKey !== "") {
      if (QUOTIENT_KEY.test(rawKey)) quotientKey = rawKey;
      else host.stderr.write(`xo-market cockpit: ${QUOTIENT_KEY_ENV} is set but does not look like a Quotient key; it is not used.\n`);
    }
    const proxy = createReadProxy({
      ...options,
      now: host.clock,
      stderr: host.stderr,
      enabled,
      credentials: options.credentials ?? ((service) => (service === "quotient" && quotientKey !== undefined ? { "x-quotient-api-key": quotientKey } : undefined)),
    });
    proxies.set(host, proxy);
    return {
      name: options.name ?? "proxy",
      routes: [readRoute(proxy, "GET"), readRoute(proxy, "POST")],
      close: () => {
        proxy.close();
        proxies.delete(host);
      },
    };
  };
}

export const bridgeModule: BridgeModuleFactory = createProxyModule();
