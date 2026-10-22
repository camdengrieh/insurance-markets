// Venue read state (docs/sdk-and-api-design.md section 6; docs/dapp-design.md 4.8 R9 and R10): whether a venue's own API
// can be asked right now, and if not, why. One rule for every host that reads a venue: the dApp's guarded fetch
// (app/src/core/fetch.ts), the Cockpit daemon's read proxy (bridge/proxy.ts) and, later, the API.
//
//   ok          the venue answers;
//   throttled   it asked us to slow down: a 429 with Retry-After cools the host down for that long, and three 429s in a
//               row pause it for VENUE_PAUSE_MS;
//   blocked     it refused us: any 403, three 401s in a row, or a web page served where JSON was expected (a block or
//               challenge page with a 2xx status) pause the host for VENUE_PAUSE_MS;
//   chain_only  the host declared that the venue's API is not asked at all; its rows come from the chain.
//
// Nothing here retries around a block, rotates egress or changes a header: a paused host stays paused until its window
// ends, and the caller refuses to send before then. Pure: no clock (every call takes nowMs), no network, no global.

import { formatUtc } from "../format.js";
import type { FetchLike, FetchResponseLike, VenueId } from "../model.js";
import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, type ReadService } from "./origins.js";
import { FetchError, isBlockPage, isFetchError, MAX_RETRY_AFTER_MS, parseRetryAfterMs } from "./transport.js";

// R9: three 429s or any 403 pause a host for ten minutes. Three 401s in a row are a revoked or refused key: a block.
export const VENUE_PAUSE_AFTER_429 = 3;
export const VENUE_PAUSE_AFTER_401 = 3;
export const VENUE_PAUSE_MS = 10 * 60 * 1000;

export const VENUE_READ_STATES = ["ok", "throttled", "blocked", "chain_only"] as const;
export type VenueReadStateKind = (typeof VENUE_READ_STATES)[number];

// What put a host in its state, as a closed token. The daemon reports these as its pause reasons.
export const THROTTLE_SIGNALS = [
  "retry_after", // a 429 with Retry-After, below the strike count
  "http_429_repeated", // the third 429 in a row
  "limited", // a reader reported RATE_LIMITED and no answer was seen here (the host's own budget, the daemon's limit)
] as const;
export type ThrottleSignal = (typeof THROTTLE_SIGNALS)[number];

export const BLOCK_SIGNALS = [
  "http_403",
  "http_401_repeated",
  "block_page", // a web page where JSON was expected, whatever its status
  "refused", // a reader reported VENUE_PAUSED and no answer was seen here (the daemon paused it, a 451 geoblock)
] as const;
export type BlockSignal = (typeof BLOCK_SIGNALS)[number];

export type PauseSignal = ThrottleSignal | BlockSignal;

export function isPauseSignal(value: unknown): value is PauseSignal {
  return typeof value === "string" && ((THROTTLE_SIGNALS as readonly string[]).includes(value) || (BLOCK_SIGNALS as readonly string[]).includes(value));
}

export type VenueReadState =
  | { readonly kind: "ok" }
  // `untilMs` is when a read may be sent again; null when the venue named no time.
  | { readonly kind: "throttled"; readonly signal: ThrottleSignal; readonly status: number | null; readonly atMs: number; readonly untilMs: number | null }
  // `status` is the HTTP status that tripped the block (200 for a block page served as success); null when not seen here.
  | { readonly kind: "blocked"; readonly signal: BlockSignal; readonly status: number | null; readonly atMs: number; readonly untilMs: number | null }
  // `reason` is a fixed sentence written by the host that declared it.
  | { readonly kind: "chain_only"; readonly reason: string };

export const READ_OK: VenueReadState = Object.freeze({ kind: "ok" });

// What a host saw from one upstream answer.
export interface UpstreamAnswer {
  readonly status: number;
  // The parsed Retry-After (parseRetryAfterMs), or null.
  readonly retryAfterMs: number | null;
  // The body was a web page where JSON was expected (transport.ts isBlockPage).
  readonly blockPage?: boolean;
}

// The pause as the dApp's guarded fetch has always read it: paused or not, until when, and a short reason.
export type PauseReason = "forbidden" | "unauthorized" | "block_page" | "refused" | "rate_limited" | "retry_after" | "limited";
export type PauseState = { readonly paused: false } | { readonly paused: true; readonly untilMs: number; readonly reason: PauseReason; readonly signal: PauseSignal };

const PAUSE_REASON: Readonly<Record<PauseSignal, PauseReason>> = Object.freeze({
  http_403: "forbidden",
  http_401_repeated: "unauthorized",
  block_page: "block_page",
  refused: "refused",
  http_429_repeated: "rate_limited",
  retry_after: "retry_after",
  limited: "limited",
});

export interface VenueStateOptions {
  readonly after429?: number;
  readonly after401?: number;
  readonly pauseMs?: number;
  // The longest Retry-After honoured; anything longer is treated as this long.
  readonly maxRetryAfterMs?: number;
}

interface Held {
  readonly kind: "throttled" | "blocked";
  readonly signal: PauseSignal;
  readonly status: number | null;
  readonly atMs: number;
  readonly untilMs: number;
}

// The state of each key a host reads through: a host name in the browser, a service id in the daemon. Keys are compared
// case-insensitively.
export class VenueStateTracker {
  readonly #after429: number;
  readonly #after401: number;
  readonly #pauseMs: number;
  readonly #maxRetryAfterMs: number;
  readonly #strikes429 = new Map<string, number>();
  readonly #strikes401 = new Map<string, number>();
  readonly #held = new Map<string, Held>();
  readonly #chainOnly = new Map<string, string>();

  constructor(options: VenueStateOptions = {}) {
    this.#after429 = options.after429 ?? VENUE_PAUSE_AFTER_429;
    this.#after401 = options.after401 ?? VENUE_PAUSE_AFTER_401;
    this.#pauseMs = options.pauseMs ?? VENUE_PAUSE_MS;
    this.#maxRetryAfterMs = options.maxRetryAfterMs ?? MAX_RETRY_AFTER_MS;
  }

  // Feed every upstream answer. A 2xx or 3xx that is data clears the strikes. A 403 or a block page blocks at once. A
  // 401 or a 429 adds a strike, and the third in a row blocks (401) or pauses (429) for the full window; a 429 that
  // named a Retry-After also cools the host down for that long. Any other status (404, 5xx) changes nothing.
  record(key: string, answer: UpstreamAnswer, nowMs: number): void {
    const id = key.toLowerCase();
    const { status } = answer;
    if (answer.blockPage === true) {
      this.#hold(id, { kind: "blocked", signal: "block_page", status, atMs: nowMs, untilMs: nowMs + this.#pauseMs });
      this.#clearStrikes(id);
      return;
    }
    if (status === 403) {
      this.#hold(id, { kind: "blocked", signal: "http_403", status, atMs: nowMs, untilMs: nowMs + this.#pauseMs });
      this.#clearStrikes(id);
      return;
    }
    if (status === 401) {
      const strikes = (this.#strikes401.get(id) ?? 0) + 1;
      if (strikes >= this.#after401) {
        this.#hold(id, { kind: "blocked", signal: "http_401_repeated", status, atMs: nowMs, untilMs: nowMs + this.#pauseMs });
        this.#strikes401.delete(id);
        return;
      }
      this.#strikes401.set(id, strikes);
      return;
    }
    if (status === 429) {
      const retry = answer.retryAfterMs !== null && answer.retryAfterMs > 0 ? Math.min(answer.retryAfterMs, this.#maxRetryAfterMs) : null;
      const strikes = (this.#strikes429.get(id) ?? 0) + 1;
      if (strikes >= this.#after429) {
        this.#hold(id, { kind: "throttled", signal: "http_429_repeated", status, atMs: nowMs, untilMs: nowMs + Math.max(this.#pauseMs, retry ?? 0) });
        this.#strikes429.delete(id);
        return;
      }
      this.#strikes429.set(id, strikes);
      if (retry !== null) this.#hold(id, { kind: "throttled", signal: "retry_after", status, atMs: nowMs, untilMs: nowMs + retry });
      return;
    }
    if (status >= 200 && status < 400) this.#clearStrikes(id);
  }

  // A pause learnt from somewhere other than an answer seen here: the daemon's own pause (its reason is a PauseSignal)
  // or a reader's RATE_LIMITED / VENUE_PAUSED. `untilMs` null holds it for the full window.
  hold(key: string, signal: PauseSignal, nowMs: number, untilMs: number | null, status: number | null = null): void {
    const blocked = (BLOCK_SIGNALS as readonly string[]).includes(signal);
    const end = untilMs ?? nowMs + this.#pauseMs;
    this.#hold(key.toLowerCase(), { kind: blocked ? "blocked" : "throttled", signal, status, atMs: nowMs, untilMs: Math.max(nowMs, Math.min(end, nowMs + this.#maxRetryAfterMs)) });
  }

  // The state of one key now. A declared chain_only wins; a pause whose window has ended is dropped.
  state(key: string, nowMs: number): VenueReadState {
    const id = key.toLowerCase();
    const chainOnly = this.#chainOnly.get(id);
    if (chainOnly !== undefined) return { kind: "chain_only", reason: chainOnly };
    const held = this.#current(id, nowMs);
    if (held === undefined) return READ_OK;
    return held.kind === "blocked"
      ? { kind: "blocked", signal: held.signal as BlockSignal, status: held.status, atMs: held.atMs, untilMs: held.untilMs }
      : { kind: "throttled", signal: held.signal as ThrottleSignal, status: held.status, atMs: held.atMs, untilMs: held.untilMs };
  }

  // Whether a request to this key must be refused before it is sent, until when, and why.
  check(key: string, nowMs: number): PauseState {
    const held = this.#current(key.toLowerCase(), nowMs);
    if (held === undefined) return { paused: false };
    return { paused: true, untilMs: held.untilMs, reason: PAUSE_REASON[held.signal], signal: held.signal };
  }

  // The venue's API is not asked at all; `reason` is a fixed sentence the host writes. Requests are not refused here
  // (the host does not send them); the state says so.
  declareChainOnly(key: string, reason: string): void {
    this.#chainOnly.set(key.toLowerCase(), reason);
  }

  clearChainOnly(key: string): void {
    this.#chainOnly.delete(key.toLowerCase());
  }

  reset(): void {
    this.#strikes429.clear();
    this.#strikes401.clear();
    this.#held.clear();
    this.#chainOnly.clear();
  }

  #current(id: string, nowMs: number): Held | undefined {
    const held = this.#held.get(id);
    if (held === undefined) return undefined;
    if (nowMs >= held.untilMs) {
      this.#held.delete(id);
      return undefined;
    }
    return held;
  }

  #clearStrikes(id: string): void {
    this.#strikes429.delete(id);
    this.#strikes401.delete(id);
  }

  // A longer pause is never shortened by a later, shorter one, and a block is never turned into a throttle while it
  // lasts (a later throttle that ends later only extends it). A block that lands during a throttle replaces it.
  #hold(id: string, next: Held): void {
    const current = this.#held.get(id);
    if (current === undefined || next.atMs >= current.untilMs) {
      this.#held.set(id, next);
      return;
    }
    if (current.kind === "throttled" && next.kind === "blocked") {
      this.#held.set(id, { ...next, untilMs: Math.max(next.untilMs, current.untilMs) });
      return;
    }
    if (next.untilMs <= current.untilMs) return;
    // The same kind, or a throttle over a block, that ends later: the later end wins; a block keeps when it began.
    this.#held.set(id, current.kind === "blocked" ? { ...current, untilMs: next.untilMs } : next);
  }
}

// ---- a venue over its hosts --------------------------------------------------------------------------------------------

export interface VenueKeys {
  readonly hosts: readonly string[];
  readonly services: readonly ReadService[];
}

const KEYS_BY_VENUE: ReadonlyMap<string, VenueKeys> = (() => {
  const out = new Map<string, { hosts: string[]; services: ReadService[] }>();
  const add = (venue: string, origin: string, service: ReadService | null): void => {
    const entry = out.get(venue) ?? { hosts: [], services: [] };
    entry.hosts.push(new URL(origin).host.toLowerCase());
    if (service !== null) entry.services.push(service);
    out.set(venue, entry);
  };
  for (const entry of BROWSER_DIRECT_ORIGINS) add(entry.venue, entry.origin, entry.service);
  for (const entry of DAEMON_ONLY_ORIGINS) add(entry.venue, entry.origin, entry.service);
  return out;
})();

// The hosts and read-proxy services of a venue's own API (sdk/venues/origins.ts). Chain RPC hosts belong to no venue.
export function venueKeys(venue: VenueId): VenueKeys {
  return KEYS_BY_VENUE.get(venue) ?? { hosts: [], services: [] };
}

const RANK: Readonly<Record<VenueReadStateKind, number>> = Object.freeze({ ok: 0, throttled: 1, blocked: 2, chain_only: 3 });

// The worst of several states: chain_only (declared) over blocked over throttled over ok; between two of a kind, the
// one that lasts longer (for a block, the earlier one keeps its time, so "blocked at" names the first refusal).
export function worstState(states: readonly VenueReadState[]): VenueReadState {
  let worst: VenueReadState = READ_OK;
  for (const state of states) {
    if (RANK[state.kind] > RANK[worst.kind]) worst = state;
    else if (state.kind === worst.kind && (state.kind === "throttled" || state.kind === "blocked") && (worst.kind === "throttled" || worst.kind === "blocked")) {
      const later = (state.untilMs ?? Number.POSITIVE_INFINITY) > (worst.untilMs ?? Number.POSITIVE_INFINITY);
      if (later) worst = { ...state, atMs: Math.min(state.atMs, worst.atMs) } as VenueReadState;
    }
  }
  return worst;
}

// One venue's state over every key the tracker holds for it: the venue id itself (a declared chain_only), its hosts
// (keyed "host") or its read-proxy services (keyed "service").
export function venueReadState(tracker: VenueStateTracker, venue: VenueId, nowMs: number, keyedBy: "host" | "service" = "host"): VenueReadState {
  const keys = venueKeys(venue);
  const own = tracker.state(venue, nowMs);
  if (own.kind === "chain_only") return own;
  return worstState([own, ...(keyedBy === "host" ? keys.hosts : keys.services).map((key) => tracker.state(key, nowMs))]);
}

// A state from a reader's error code, when the tracker saw no answer (a daemon pause, a reader's own mapping, a geoblock
// status). Anything other than RATE_LIMITED or VENUE_PAUSED is not a venue state: ok.
export function stateOfAdapterError(code: string, retryAfterMs: number | null, atMs: number): VenueReadState {
  const untilMs = retryAfterMs !== null && retryAfterMs > 0 ? atMs + Math.min(retryAfterMs, MAX_RETRY_AFTER_MS) : null;
  if (code === "RATE_LIMITED") return { kind: "throttled", signal: "limited", status: null, atMs, untilMs };
  if (code === "VENUE_PAUSED") return { kind: "blocked", signal: "refused", status: null, atMs, untilMs };
  return READ_OK;
}

// ---- the stated reason ----------------------------------------------------------------------------------------------------

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

// The reason in fixed words, naming the venue (`name` is the host's display name for it). Null for ok. Every client
// shows the same sentence: "Polymarket blocked our reads at 2026-10-22 12:03 UTC: 403".
export function venueStateReason(state: VenueReadState, name: string, nowMs: number): string | null {
  switch (state.kind) {
    case "ok":
      return null;
    case "chain_only":
      return `${name} is read from the chain only: ${state.reason}`;
    case "throttled": {
      const wait = state.untilMs === null ? null : state.untilMs - nowMs;
      const tail = wait === null ? "no retry time was given" : wait > 0 ? `retry after ${seconds(wait)} s` : "its pause has ended";
      // "limited": a reader said RATE_LIMITED and no 429 was seen here (the host's own request budget, the daemon's).
      if (state.signal === "limited") return `Reads from ${name} are rate limited: ${tail}`;
      const why = state.signal === "http_429_repeated" ? " (429 three times in a row)" : " (429)";
      return `${name} throttled our reads${why}: ${tail}`;
    }
    case "blocked": {
      const at = formatUtc(state.atMs, false);
      const what =
        state.signal === "block_page"
          ? `it served a web page where data was expected${state.status === null ? "" : ` (status ${state.status})`}`
          : state.signal === "http_401_repeated"
            ? "401 three times in a row"
            : state.status !== null
              ? String(state.status)
              : "the read was refused";
      return `${name} blocked our reads at ${at}: ${what}`;
    }
  }
}

// What happens next, in fixed words: when reads may be sent again. Never "we will try another way".
export function venueStateNext(state: VenueReadState, nowMs: number): string | null {
  if (state.kind === "chain_only") return "Its API is not asked; fields only the venue holds stay empty.";
  if (state.kind === "ok") return null;
  if (state.untilMs === null || state.untilMs <= nowMs) return "Nothing is retried around it; the next read asks once.";
  return `Nothing is retried around it; reads may be sent again after ${formatUtc(state.untilMs, false)}.`;
}

// ---- a fetch that keeps the rule -----------------------------------------------------------------------------------------

export interface StateGuardOptions {
  readonly inner: FetchLike;
  readonly tracker: VenueStateTracker;
  readonly nowMs: () => number;
  // The key a URL is tracked under. The default is its host.
  readonly keyOf?: (url: string) => string;
}

function hostKey(url: string): string {
  return new URL(url).host.toLowerCase();
}

// A response whose body has been read once, so it can be checked for a block page and still be parsed by the reader.
function buffered(response: FetchResponseLike, text: string): FetchResponseLike {
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    async json(): Promise<unknown> {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new FetchError("not_json", "the response body is not JSON");
      }
    },
    async text(): Promise<string> {
      return text;
    },
  };
}

// The rule around any FetchLike, for a host that has no budget of its own (the API, the test kit): refuse a paused key
// before sending, record every answer, and turn a web page served with a 2xx into a "blocked" FetchError (recorded as a
// block). The dApp's guarded fetch and the daemon's proxy apply the same rule inside their own transports.
export function createStateGuardedFetch(options: StateGuardOptions): FetchLike {
  const keyOf = options.keyOf ?? hostKey;
  return async (input, init) => {
    const key = keyOf(input);
    const pause = options.tracker.check(key, options.nowMs());
    if (pause.paused) {
      throw new FetchError("paused", `this host is paused (${pause.reason})`, { retryAfterMs: Math.max(0, pause.untilMs - options.nowMs()), signal: pause.signal });
    }
    let response: FetchResponseLike;
    try {
      response = await options.inner(input, init);
    } catch (error) {
      if (isFetchError(error) && error.code === "blocked") options.tracker.record(key, { status: 200, retryAfterMs: null, blockPage: true }, options.nowMs());
      throw error;
    }
    const now = options.nowMs();
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"), now);
    if (response.status >= 200 && response.status < 300) {
      const text = await response.text();
      if (isBlockPage(response.headers.get("content-type"), text)) {
        options.tracker.record(key, { status: response.status, retryAfterMs, blockPage: true }, now);
        throw new FetchError("blocked", "the venue answered with a web page instead of data", { signal: "block_page" });
      }
      options.tracker.record(key, { status: response.status, retryAfterMs }, now);
      return buffered(response, text);
    }
    options.tracker.record(key, { status: response.status, retryAfterMs }, now);
    return response;
  };
}
