// Request discipline (docs/dapp-design.md 4.8 R9 and R10, research 26 section 11, 28 section 5.3):
//   - one token bucket per upstream HOST, so ten adapters (or a 100-search burst) cannot exceed what the
//     venue publishes (M0-6);
//   - a pause after three 429 answers or any 403, and a cooldown that honours Retry-After (R9), by the SDK's venue
//     state rule (sdk/venues/state.ts);
//   - jittered exponential backoff with an injected random source;
//   - nothing here retries around a block (R10): a paused host stays paused.
//
// Integer arithmetic only (tokens are counted in micro-tokens), an injected clock, no timers: the caller
// decides how to wait (core/fetch.ts injects `sleep`). The numbers below are DESIGN DEFAULTS chosen under the
// published limits as read in aggregation-design 8.2 and research 26 section 11.2; where a venue gives no
// figure the default is deliberately low.

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, type ReadService } from "../../headers.config";

export type Clock = () => number;

export interface BudgetSpec {
  // Tokens available at once.
  readonly burst: number;
  // Sustained refill, tokens per second (at most three decimals).
  readonly perSecond: number;
}

const MICRO_PER_TOKEN = 1_000_000;

function microPerMs(perSecond: number): number {
  const scaled = perSecond * 1000;
  if (!(perSecond > 0) || Math.abs(scaled - Math.round(scaled)) > 1e-6) throw new RangeError("perSecond must be positive with at most three decimals");
  return Math.round(scaled);
}

export type Reservation = { readonly ok: true; readonly waitMs: number } | { readonly ok: false; readonly retryAfterMs: number };

export class TokenBucket {
  readonly spec: BudgetSpec;
  #capacity: number;
  #perMs: number;
  #level: number;
  #updatedMs: number;

  constructor(spec: BudgetSpec, nowMs: number) {
    if (!Number.isInteger(spec.burst) || spec.burst < 1 || spec.burst > 10_000) throw new RangeError("burst must be an integer from 1 to 10000");
    this.spec = spec;
    this.#capacity = spec.burst * MICRO_PER_TOKEN;
    this.#perMs = microPerMs(spec.perSecond);
    this.#level = this.#capacity;
    this.#updatedMs = nowMs;
  }

  #refill(nowMs: number): void {
    // A clock that goes backwards adds nothing; it never removes tokens either.
    const elapsed = Math.max(0, nowMs - this.#updatedMs);
    this.#level = Math.min(this.#capacity, this.#level + elapsed * this.#perMs);
    this.#updatedMs = Math.max(this.#updatedMs, nowMs);
  }

  // Takes one token now, or books one for the future. A caller that would wait longer than `maxWaitMs` gets
  // ok:false and nothing is booked. Booked tokens go into debt, so the n-th caller of a burst waits
  // (n - burst) / rate and the sustained rate never exceeds the spec.
  reserve(nowMs: number, maxWaitMs: number): Reservation {
    this.#refill(nowMs);
    if (this.#level >= MICRO_PER_TOKEN) {
      this.#level -= MICRO_PER_TOKEN;
      return { ok: true, waitMs: 0 };
    }
    const waitMs = Math.ceil((MICRO_PER_TOKEN - this.#level) / this.#perMs);
    if (waitMs > maxWaitMs) return { ok: false, retryAfterMs: waitMs };
    this.#level -= MICRO_PER_TOKEN;
    return { ok: true, waitMs };
  }

  // Whole tokens available right now (for tests and the settings screen).
  available(nowMs: number): number {
    this.#refill(nowMs);
    return Math.max(0, Math.floor(this.#level / MICRO_PER_TOKEN));
  }
}

// ---- the per-service defaults ---------------------------------------------------------------------------------------

export const SERVICE_BUDGETS: Readonly<Record<ReadService, BudgetSpec>> = Object.freeze({
  // XO orderbook: public 5 req/s; the relay uses 4. Daemon-only, so this applies to the Cockpit page's calls.
  xo_orderbook: { burst: 4, perSecond: 4 },
  // XO Data API: 100 req/10 s documented, x-ratelimit-limit 50 observed, a 429 after about 35 requests in 20 s.
  xo_data: { burst: 8, perSecond: 1.5 },
  xo_explorer: { burst: 10, perSecond: 5 },
  xo_rpc: { burst: 10, perSecond: 5 },
  // Polymarket: Gamma 300 to 900 per 10 s, /book 1,500 per 10 s, /books 500 per 10 s, Data v2 800 per 10 s.
  polymarket_gamma: { burst: 20, perSecond: 20 },
  polymarket_clob: { burst: 20, perSecond: 20 },
  polymarket_data: { burst: 20, perSecond: 20 },
  // Polymarket US: 25 req/s per IP.
  polymarket_us: { burst: 10, perSecond: 10 },
  manifold: { burst: 10, perSecond: 5 },
  // Pascal and Hyperliquid publish nothing usable here: low.
  pascal: { burst: 4, perSecond: 2 },
  hyperliquid_info: { burst: 10, perSecond: 5 },
  hyperliquid_rpc: { burst: 10, perSecond: 5 },
  defillama: { burst: 2, perSecond: 1 },
  // Quotient standard is 20 rps, but output is manual and paid: a page never needs more than this.
  quotient: { burst: 2, perSecond: 2 },
  // Restricted-terms venues: as gentle as a human clicking.
  novig: { burst: 2, perSecond: 1 },
  gemini: { burst: 2, perSecond: 1 },
  // Limitless publishes no number; Kalshi's anonymous limit is NOT FOUND.
  limitless: { burst: 4, perSecond: 2 },
  kalshi: { burst: 2, perSecond: 1 },
  // Public RPCs are shared and rate-limited.
  // Our markets API's XO relay: 60 requests a minute per client (api/xo-relay.ts); the page stays under it.
  markets_api: { burst: 10, perSecond: 0.9 },
  rpc_base: { burst: 10, perSecond: 5 },
  rpc_polygon: { burst: 10, perSecond: 5 },
  rpc_bnb: { burst: 10, perSecond: 5 },
});

function hostOf(origin: string): string {
  return new URL(origin).host;
}

// hostname -> its service id, over every origin the app may name (browser-direct and daemon-only).
const SERVICE_BY_HOST: ReadonlyMap<string, ReadService> = new Map(
  [
    ...BROWSER_DIRECT_ORIGINS.map((entry) => [hostOf(entry.origin), entry.service] as const),
    ...DAEMON_ONLY_ORIGINS.flatMap((entry) => (entry.service === null ? [] : [[hostOf(entry.origin), entry.service] as const])),
  ],
);

// The budget for an upstream host, or undefined for a host that is not on the closed list (callers refuse it).
export function budgetForHost(host: string): BudgetSpec | undefined {
  const service = SERVICE_BY_HOST.get(host.toLowerCase());
  return service === undefined ? undefined : SERVICE_BUDGETS[service];
}

export function serviceForHost(host: string): ReadService | undefined {
  return SERVICE_BY_HOST.get(host.toLowerCase());
}

export class HostBudgets {
  readonly #buckets = new Map<string, TokenBucket>();
  readonly #nowMs: Clock;
  readonly #override: Readonly<Record<string, BudgetSpec>>;

  // `override` is for tests and for a user-supplied RPC: host -> spec.
  constructor(nowMs: Clock, override: Readonly<Record<string, BudgetSpec>> = {}) {
    this.#nowMs = nowMs;
    this.#override = override;
  }

  // Unknown host: ok:false with a zero retry, so the caller refuses instead of waiting for nothing.
  reserve(host: string, maxWaitMs: number): Reservation {
    const key = host.toLowerCase();
    const now = this.#nowMs();
    let bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      const spec = this.#override[key] ?? budgetForHost(key);
      if (spec === undefined) return { ok: false, retryAfterMs: 0 };
      bucket = new TokenBucket(spec, now);
      this.#buckets.set(key, bucket);
    }
    return bucket.reserve(now, maxWaitMs);
  }
}

// ---- R9: pause after repeated 429 or any 403, honour Retry-After ------------------------------------------------

// The rule lives in the SDK (sdk/venues/state.ts) so the page, the Cockpit daemon and the API share one
// implementation: a 403, three 401s in a row or a web page served where JSON was expected block a host; a 429 with
// Retry-After cools it down and three 429s in a row pause it; a paused host stays paused for its window. The page keys
// it by upstream host.
export {
  VenueStateTracker as VenuePauses,
  venueReadState,
  type PauseReason,
  type PauseState,
  type VenueReadState,
  type VenueStateOptions as PauseOptions,
} from "@sdk/venues/state";
export { MAX_RETRY_AFTER_MS, parseRetryAfterMs } from "@sdk/venues/transport";

// ---- backoff and Retry-After ----------------------------------------------------------------------------------------------

export interface BackoffOptions {
  readonly baseMs?: number;
  readonly capMs?: number;
}

// "Full jitter": a uniform wait in [0, min(cap, base * 2^attempt)). `random` returns [0, 1) and is injected so
// tests are deterministic. Used by the query layer's retry; nothing retries a 403.
export function backoffDelayMs(attempt: number, random: () => number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 1000;
  const cap = options.capMs ?? 60_000;
  const exponent = Math.min(Math.max(Math.floor(attempt), 0), 30);
  const ceiling = Math.min(cap, base * 2 ** exponent);
  const unit = random();
  const clamped = unit >= 0 && unit < 1 ? unit : 0;
  return Math.floor(clamped * ceiling);
}
