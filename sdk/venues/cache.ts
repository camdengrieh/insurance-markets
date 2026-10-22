// Cache policy (docs/dapp-design.md 4.8 R3 to R5, research 26 section 11):
//   - freshness bands from a TTL (live within ttl, recent within 3x, stale beyond, unknown when the time is
//     missing or in the future);
//   - which data may be written to disk at all (canPersist): restricted-terms and unknown-licence data never;
//   - a memory-only store that drops everything after 15 idle minutes and on page hide, and cannot be
//     serialised, logged or put into a URL by accident;
//   - in-flight de-duplication so identical requests in one tick share one promise;
//   - poll intervals that stop in a hidden tab.
//
// Pure: the clock and the timers are injected.

import type { Freshness, LicenseClass } from "../model.js";

// ---- TTLs and poll intervals (design defaults, research 26 section 11.2) ------------------------------------------

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export const CACHE_CLASSES = [
  "market_list",
  "market_detail",
  "book_foreground",
  "book_offscreen",
  "positions_open",
  "positions_background",
  "balances_chain",
  "fills",
  "trueo_state",
  "defillama",
  "fee_snapshot",
  "quotient_performance",
  "quotient_lists",
] as const;
export type CacheClass = (typeof CACHE_CLASSES)[number];

export interface CachePolicy {
  readonly ttlMs: number;
  // null: never polled on its own (user-initiated or manual refresh only).
  readonly pollMs: number | null;
  // Whether a hidden tab may poll this class. Always false today; the field makes the rule visible.
  readonly pollWhenHidden: false;
}

export const CACHE_POLICY: Readonly<Record<CacheClass, CachePolicy>> = Object.freeze({
  market_list: { ttlMs: 5 * MINUTE_MS, pollMs: null, pollWhenHidden: false },
  market_detail: { ttlMs: 5 * MINUTE_MS, pollMs: null, pollWhenHidden: false },
  book_foreground: { ttlMs: 15 * SECOND_MS, pollMs: 15 * SECOND_MS, pollWhenHidden: false },
  book_offscreen: { ttlMs: 60 * SECOND_MS, pollMs: 60 * SECOND_MS, pollWhenHidden: false },
  positions_open: { ttlMs: 30 * SECOND_MS, pollMs: 30 * SECOND_MS, pollWhenHidden: false },
  positions_background: { ttlMs: 5 * MINUTE_MS, pollMs: 5 * MINUTE_MS, pollWhenHidden: false },
  balances_chain: { ttlMs: 60 * SECOND_MS, pollMs: 60 * SECOND_MS, pollWhenHidden: false },
  fills: { ttlMs: 60 * SECOND_MS, pollMs: 60 * SECOND_MS, pollWhenHidden: false },
  trueo_state: { ttlMs: 30 * SECOND_MS, pollMs: 30 * SECOND_MS, pollWhenHidden: false },
  defillama: { ttlMs: HOUR_MS, pollMs: null, pollWhenHidden: false },
  fee_snapshot: { ttlMs: 30 * 24 * HOUR_MS, pollMs: null, pollWhenHidden: false },
  // Quotient lists: 5 to 15 minutes and MANUAL by default, never faster. The free performance snapshot 30 to 60.
  quotient_performance: { ttlMs: 30 * MINUTE_MS, pollMs: null, pollWhenHidden: false },
  quotient_lists: { ttlMs: 5 * MINUTE_MS, pollMs: null, pollWhenHidden: false },
});

export function ttlFor(cacheClass: CacheClass): number {
  return CACHE_POLICY[cacheClass].ttlMs;
}

// For a query library's `refetchInterval`: false in a hidden tab and for classes that are manual.
export function pollIntervalFor(cacheClass: CacheClass, hidden: boolean): number | false {
  if (hidden) return false;
  return CACHE_POLICY[cacheClass].pollMs ?? false;
}

// A hidden tab does no polling. Pass `document` (or any object with a visibilityState). Only an explicit
// "hidden" counts as hidden: a missing document (a test, a worker) polls as foreground.
export function isHidden(doc: { readonly visibilityState?: string } | undefined): boolean {
  return doc?.visibilityState === "hidden";
}

// ---- freshness bands ------------------------------------------------------------------------------------------------------

// Clock skew tolerated before a "future" fetch time is treated as unknown rather than live.
const SKEW_MS = 2000;

// live: within ttl. recent: up to 3x ttl. stale: beyond. unknown: no usable time or a ttl that is not positive
// (a stale or unknown book can never produce a spread tier above `indicative`, research 26 11.3).
export function freshnessOf(fetchedAtMs: number | null | undefined, ttlMs: number, nowMs: number): Freshness {
  if (fetchedAtMs === null || fetchedAtMs === undefined || !Number.isFinite(fetchedAtMs) || !Number.isFinite(nowMs)) return "unknown";
  if (!(ttlMs > 0)) return "unknown";
  const age = nowMs - fetchedAtMs;
  if (age < -SKEW_MS) return "unknown";
  if (age <= ttlMs) return "live";
  if (age <= 3 * ttlMs) return "recent";
  return "stale";
}

// ---- what may be persisted ---------------------------------------------------------------------------------------------

// What a stored value is, which decides whether disk is allowed:
//   binding / setting   the user's own address book and switches: no venue data inside;
//   own_account         the user's own positions, orders and fills (R4);
//   registry / fee_snapshot  reference tables we ship or read;
//   immutable_body      an immutable upstream body (a forecast by id);
//   market_data         public market lists, books, prices.
export const DATA_KINDS = ["binding", "setting", "own_account", "registry", "fee_snapshot", "immutable_body", "market_data"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

export interface LicensePolicy {
  // Must stay in memory (R3).
  readonly memoryOnly: boolean;
  // May appear in an export, a share link or a screenshot helper (R5). Never true for restricted data.
  readonly exportable: boolean;
}

// own_use_only and unknown are memory-only and never exportable (fail closed). attribution data may be
// persisted but is exportable only with its attribution, which the exporter must supply; open data is free.
export function licensePolicy(license: LicenseClass): LicensePolicy {
  switch (license) {
    case "open":
      return { memoryOnly: false, exportable: true };
    case "attribution":
      return { memoryOnly: false, exportable: true };
    case "own_use_only":
    case "unknown":
      return { memoryOnly: true, exportable: false };
    default:
      return { memoryOnly: true, exportable: false };
  }
}

// The single gate in front of every disk write (IndexedDB, files). "No persistence of restricted-terms data":
// own_use_only never reaches disk, whatever the kind, except the user's own bindings and settings, which hold
// no venue data. unknown reaches disk only as a binding, setting or registry table.
export function canPersist(kind: DataKind, license: LicenseClass): boolean {
  if (!(DATA_KINDS as readonly string[]).includes(kind)) return false;
  if (kind === "binding" || kind === "setting") return true;
  switch (license) {
    case "own_use_only":
      return false;
    case "unknown":
      return kind === "registry";
    case "attribution":
    case "open":
      return kind !== "market_data";
    default:
      return false;
  }
}

export class PersistenceRefused extends Error {
  readonly kind: DataKind;
  readonly license: LicenseClass;
  constructor(kind: DataKind, license: LicenseClass) {
    super(`refusing to persist ${kind} data with license ${license}`);
    this.name = "PersistenceRefused";
    this.kind = kind;
    this.license = license;
  }
}

export function assertPersistable(kind: DataKind, license: LicenseClass): void {
  if (!canPersist(kind, license)) throw new PersistenceRefused(kind, license);
}

// ---- memory-only store -------------------------------------------------------------------------------------------------

export interface TimerApi {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const IDLE_DROP_MS = 15 * MINUTE_MS;
export const DEFAULT_MAX_ENTRIES = 500;

interface Entry<V> {
  value: V;
  expiresAtMs: number;
  lastUsedMs: number;
}

export interface MemoryStoreOptions {
  readonly nowMs: () => number;
  readonly idleDropMs?: number;
  readonly maxEntries?: number;
  // When given, the store arms a timer that drops everything after the idle period.
  readonly timers?: TimerApi;
}

const registry = new Set<MemoryStore<unknown>>();

// Holds restricted-license data (Kalshi, Gemini, OG, UDX, Novig, ProphetX, Quotient lists). The map is a
// private field, the object serialises to a fixed string, and it prints as a fixed string, so a JSON snapshot,
// a console log or an error report can never carry its contents (R3, research 26 11.4). Entries expire by TTL,
// the whole store is dropped after 15 idle minutes, and clearAllMemoryOnly() wipes every store (page hide, the
// "clear" control).
export class MemoryStore<V> {
  readonly label: string;
  readonly #entries = new Map<string, Entry<V>>();
  readonly #nowMs: () => number;
  readonly #idleDropMs: number;
  readonly #maxEntries: number;
  readonly #timers: TimerApi | undefined;
  #timer: unknown;
  #lastTouchMs: number;

  constructor(label: string, options: MemoryStoreOptions) {
    this.label = label;
    this.#nowMs = options.nowMs;
    this.#idleDropMs = options.idleDropMs ?? IDLE_DROP_MS;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#timers = options.timers;
    this.#lastTouchMs = options.nowMs();
    registry.add(this as MemoryStore<unknown>);
  }

  #touch(now: number): void {
    this.#lastTouchMs = now;
    if (this.#timers === undefined) return;
    if (this.#timer !== undefined) this.#timers.clearTimeout(this.#timer);
    this.#timer = this.#timers.setTimeout(() => {
      this.#timer = undefined;
      this.sweep();
    }, this.#idleDropMs);
  }

  // Drops expired entries, and everything if the store has been idle for the idle period.
  sweep(): void {
    const now = this.#nowMs();
    if (now - this.#lastTouchMs >= this.#idleDropMs) {
      this.#entries.clear();
      return;
    }
    for (const [key, entry] of this.#entries) {
      if (now >= entry.expiresAtMs) this.#entries.delete(key);
    }
  }

  get(key: string): V | undefined {
    const now = this.#nowMs();
    if (now - this.#lastTouchMs >= this.#idleDropMs) this.#entries.clear();
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (now >= entry.expiresAtMs) {
      this.#entries.delete(key);
      return undefined;
    }
    entry.lastUsedMs = now;
    this.#touch(now);
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    const now = this.#nowMs();
    if (now - this.#lastTouchMs >= this.#idleDropMs) this.#entries.clear();
    if (!(ttlMs > 0)) {
      this.#entries.delete(key);
      return;
    }
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAtMs: now + ttlMs, lastUsedMs: now });
    while (this.#entries.size > this.#maxEntries) {
      // Evict the least recently used entry.
      let oldestKey: string | undefined;
      let oldest = Infinity;
      for (const [candidate, entry] of this.#entries) {
        if (entry.lastUsedMs < oldest) {
          oldest = entry.lastUsedMs;
          oldestKey = candidate;
        }
      }
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
    this.#touch(now);
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
    if (this.#timer !== undefined && this.#timers !== undefined) this.#timers.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  get size(): number {
    return this.#entries.size;
  }

  // JSON.stringify, structured logging and error reporters see this and nothing else.
  toJSON(): string {
    return `[memory-only store: ${this.label}]`;
  }

  toString(): string {
    return this.toJSON();
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toJSON();
  }

  dispose(): void {
    this.clear();
    registry.delete(this as MemoryStore<unknown>);
  }
}

// Wipes every memory-only store: wire to `pagehide` and to the settings "clear" control.
export function clearAllMemoryOnly(): void {
  for (const store of registry) store.clear();
}

export function memoryOnlyStoreCount(): number {
  return registry.size;
}

// Minimal event-target shape so tests need no DOM.
export interface PageHideTarget {
  addEventListener(type: "pagehide", listener: () => void): void;
  removeEventListener(type: "pagehide", listener: () => void): void;
}

// Returns the function that removes the listener.
export function clearMemoryOnlyOnPageHide(target: PageHideTarget): () => void {
  const listener = (): void => clearAllMemoryOnly();
  target.addEventListener("pagehide", listener);
  return () => target.removeEventListener("pagehide", listener);
}

// ---- in-flight de-duplication ----------------------------------------------------------------------------------------

// Identical requests in one tick share one promise; the entry is removed when it settles, so a later call
// fetches again (the TTL decides whether to use a stored value first).
export class InflightDedupe {
  readonly #inflight = new Map<string, Promise<unknown>>();

  run<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.#inflight.get(key);
    if (existing !== undefined) return existing as Promise<T>;
    const promise = (async () => {
      try {
        return await load();
      } finally {
        this.#inflight.delete(key);
      }
    })();
    this.#inflight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.#inflight.size;
  }
}
