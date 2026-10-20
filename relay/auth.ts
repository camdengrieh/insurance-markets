import type { Secret } from "../src/config.js";
import type { RateLimitSpec } from "./config.js";
import { constantTimeEqual } from "./crypto.js";

// Local-only authentication for the relay's HTTP server (docs/phase1-gap-closing.md section 9 A5,
// D6): the pieces are pure functions and small classes so each refusal can be tested without a socket.
//
//   - X-Relay-Key: a shared secret compared in constant time. Two keys are accepted while one is
//     being rotated in (XO_RELAY_KEY and XO_RELAY_KEY_NEXT); both are always compared, so a match on
//     the second takes no longer than a match on the first;
//   - Host and Origin: only the bound address. A browser tab on a hostile page (DNS rebinding, CSRF
//     to localhost) sends a different Host or an Origin, and is refused. A request with no Origin is
//     a plain client and is fine;
//   - the peer must be a loopback address, as a last defence if the bind were ever wrong;
//   - rate limits are token buckets keyed by client address and endpoint, plus a stricter bucket for
//     failed key checks so the key cannot be guessed at speed.

export type KeyMatch = "current" | "next";

export class RelayKeyring {
  readonly #current: Secret;
  readonly #next: Secret | undefined;

  constructor(current: Secret, next?: Secret) {
    this.#current = current;
    this.#next = next;
  }

  get rotating(): boolean {
    return this.#next !== undefined;
  }

  // Which key matched, or undefined. Never short-circuits between the two comparisons.
  verify(header: string | undefined): KeyMatch | undefined {
    const presented = typeof header === "string" && header.length <= 512 ? header : "";
    const matchesCurrent = constantTimeEqual(presented, this.#current.reveal());
    const matchesNext = this.#next === undefined ? false : constantTimeEqual(presented, this.#next.reveal());
    if (presented === "") return undefined;
    if (matchesCurrent) return "current";
    if (matchesNext) return "next";
    return undefined;
  }

  // The strings a log scrubber must never let through.
  secrets(): string[] {
    return this.#next === undefined ? [this.#current.reveal()] : [this.#current.reveal(), this.#next.reveal()];
  }
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  if (address === "::1") return true;
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  return /^127(?:\.\d{1,3}){3}$/.test(plain);
}

export function normaliseClientAddress(address: string | undefined): string {
  if (address === undefined) return "unknown";
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

export function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

export function checkHost(hostHeader: string | undefined, port: number): boolean {
  if (typeof hostHeader !== "string") return false;
  const host = hostHeader.toLowerCase();
  return allowedHosts(port).includes(host);
}

// Origin must be absent (a plain client) or exactly the relay's own. "null" (a sandboxed frame) and
// anything else are refused. Sec-Fetch-Site, which browsers add, must say same-origin or none.
export function checkOrigin(originHeader: string | undefined, secFetchSite: string | undefined, port: number): boolean {
  if (secFetchSite !== undefined && secFetchSite !== "same-origin" && secFetchSite !== "none") return false;
  if (originHeader === undefined) return true;
  const origin = originHeader.toLowerCase();
  return allowedHosts(port).some((host) => origin === `http://${host}`);
}

export interface TakeResult {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

interface Bucket {
  tokens: number;
  at: number;
}

// Token buckets with a bounded table: when it is full, the least recently used entry goes.
export class TokenBuckets {
  readonly #buckets = new Map<string, Bucket>();
  readonly #maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.#maxEntries = maxEntries;
  }

  get size(): number {
    return this.#buckets.size;
  }

  // Takes one token. `peek` looks without taking.
  take(key: string, spec: RateLimitSpec, nowMs: number, peek = false): TakeResult {
    const known = this.#buckets.get(key);
    const bucket: Bucket = known ?? { tokens: spec.capacity, at: nowMs };
    const elapsed = Math.max(0, nowMs - bucket.at);
    bucket.tokens = Math.min(spec.capacity, bucket.tokens + (elapsed * spec.refillPerSecond) / 1000);
    bucket.at = nowMs;
    let result: TakeResult;
    if (bucket.tokens >= 1) {
      if (!peek) bucket.tokens -= 1;
      result = { allowed: true, retryAfterMs: 0 };
    } else {
      result = { allowed: false, retryAfterMs: Math.ceil(((1 - bucket.tokens) * 1000) / spec.refillPerSecond) };
    }
    // Re-insert so the map order is recency order.
    this.#buckets.delete(key);
    this.#buckets.set(key, bucket);
    while (this.#buckets.size > this.#maxEntries) {
      const oldest = this.#buckets.keys().next().value;
      if (oldest === undefined) break;
      this.#buckets.delete(oldest);
    }
    return result;
  }
}

declare module "./types.js" {
  interface RelayServices {
    readonly keyring?: RelayKeyring;
  }
}
