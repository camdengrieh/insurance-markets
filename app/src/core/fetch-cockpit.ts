// The Cockpit build's fetch port (docs/dapp-design.md 4.1 principle 3, 5.4): the page's CSP is
// `connect-src 'self'`, so every upstream read becomes GET/POST /ui/read/<service>/<path>?<query> on the daemon.
// The service comes from resolveUpstream (core/fetch.ts), the same closed lists that build the CSP, and the
// daemon's answer is the read-proxy envelope of bridge/contract.ts, unwrapped here into an ordinary response so
// adapters cannot tell the two builds apart.
//
// The page holds a `ui` bearer token, never a venue credential: this port sends the token and a JSON body, and
// nothing else. Venue credentials (Quotient key, Kalshi key) live in the daemon.

import { MAX_PROXY_RESPONSE_BYTES, bridgeErrorResponseSchema, readProxyPath, readProxyResponseSchema } from "@bridge/contract";

import { type ReadService } from "../../headers.config";
import type { TimerApi } from "./cache";
import { DEFAULT_TIMEOUT_MS, FetchError, checkPost, createDirectFetch, internals, resolveUpstream, translateTransportError, type RawFetch, type RawInit } from "./fetch";
import type { FetchLike, FetchResponseLike } from "./ports";

// The envelope adds a few hundred bytes around the upstream body.
const ENVELOPE_SLACK_BYTES = 64 * 1024;

export interface CockpitFetchOptions {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  // The ui token, read at call time (it is set after pairing). null before pairing.
  readonly getToken: () => string | null;
  readonly timeoutMs?: number;
}

// The path the page requests for an upstream URL: the single mapping, exported for tests and for the terminal.
export function readProxyRequestFor(upstreamUrl: string): { readonly service: ReadService; readonly requestPath: string } {
  const target = resolveUpstream(upstreamUrl);
  return { service: target.service, requestPath: readProxyPath(target.service, target.path, target.query) };
}

export function createCockpitFetch(options: CockpitFetchOptions): FetchLike {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (input, init) => {
    const target = resolveUpstream(input);
    const post = init?.method === "POST";
    if (post) checkPost(target, init?.body);
    const token = options.getToken();
    if (token === null || token === "") throw new FetchError("unauthorized", "the Cockpit is not paired", { service: target.service });
    const requestPath = readProxyPath(target.service, target.path, target.query);
    const deadline = new internals.Deadline(options.timers, timeoutMs, init?.signal);
    const rawInit: RawInit = {
      method: post ? "POST" : "GET",
      headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(post ? { "content-type": "application/json" } : {}) },
      ...(post && init?.body !== undefined ? { body: init.body } : {}),
      signal: deadline.signal,
      credentials: "omit",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      mode: "cors",
    };
    try {
      const response = await deadline.race(options.rawFetch(requestPath, rawInit));
      if (internals.isRedirect(response)) throw new FetchError("redirect", "the daemon redirected; redirects are never followed", { service: target.service });
      const text = await internals.readCapped(response, MAX_PROXY_RESPONSE_BYTES + ENVELOPE_SLACK_BYTES, deadline, target.service);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new FetchError("bad_envelope", "the daemon's answer is not JSON", { service: target.service });
      }
      if (!response.ok) {
        const failure = bridgeErrorResponseSchema.safeParse(json);
        if (!failure.success) throw new FetchError("bad_envelope", "the daemon's error answer is not the contract's shape", { service: target.service });
        const retryS = failure.data.error.retry_after_s;
        // A daemon pause names what tripped it (sdk/venues/state.ts PauseSignal); the guarded fetch holds the same pause.
        const reason = failure.data.error.details?.["reason"];
        throw new FetchError("bridge", "the daemon refused the read", {
          service: target.service,
          bridgeCode: failure.data.error.code,
          retryAfterMs: retryS === undefined ? null : retryS * 1000,
          signal: typeof reason === "string" ? reason : null,
        });
      }
      const envelope = readProxyResponseSchema.safeParse(json);
      if (!envelope.success || envelope.data.service !== target.service) {
        throw new FetchError("bad_envelope", "the daemon's read-proxy answer does not match the contract", { service: target.service });
      }
      return unwrapEnvelope(envelope.data.upstream_status, envelope.data.body, envelope.data.retry_after_s);
    } catch (error) {
      throw translateTransportError(error, deadline, target.service);
    } finally {
      deadline.done();
    }
  };
}

// The upstream status, body and Retry-After as an ordinary response.
function unwrapEnvelope(status: number, body: unknown, retryAfterS: number | null): FetchResponseLike {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "retry-after" && retryAfterS !== null ? String(retryAfterS) : name.toLowerCase() === "content-type" ? "application/json" : null) },
    async json(): Promise<unknown> {
      return body;
    },
    async text(): Promise<string> {
      return text;
    },
  };
}

export type AppBuildMode = "standalone" | "cockpit";

export interface AppFetchOptions {
  readonly mode: AppBuildMode;
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  readonly getToken: () => string | null;
  readonly timeoutMs?: number;
}

// The shell's one call: the port for this build. Wrap the result with createGuardedFetch.
export function createAppFetch(options: AppFetchOptions): FetchLike {
  if (options.mode === "cockpit") {
    return createCockpitFetch({ rawFetch: options.rawFetch, timers: options.timers, getToken: options.getToken, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
  }
  return createDirectFetch({ rawFetch: options.rawFetch, timers: options.timers, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) });
}
