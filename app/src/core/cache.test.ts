import { describe, expect, it } from "vitest";

import {
  CACHE_CLASSES,
  CACHE_POLICY,
  DATA_KINDS,
  IDLE_DROP_MS,
  InflightDedupe,
  MemoryStore,
  PersistenceRefused,
  assertPersistable,
  canPersist,
  clearAllMemoryOnly,
  clearMemoryOnlyOnPageHide,
  freshnessOf,
  licensePolicy,
  memoryOnlyStoreCount,
  pollIntervalFor,
  ttlFor,
  type DataKind,
  type PageHideTarget,
  type TimerApi,
} from "./cache";
import type { LicenseClass } from "./ports";

class FakeTimers implements TimerApi {
  readonly pending = new Map<number, { at: number; run: () => void }>();
  now = 0;
  #next = 1;
  setTimeout(handler: () => void, ms: number): unknown {
    const id = this.#next++;
    this.pending.set(id, { at: this.now + ms, run: handler });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  advance(ms: number): void {
    this.now += ms;
    for (const [id, timer] of [...this.pending]) {
      if (timer.at <= this.now) {
        this.pending.delete(id);
        timer.run();
      }
    }
  }
}

describe("freshness bands", () => {
  const ttl = 15_000;
  it("is live within the ttl, recent within 3x, stale beyond", () => {
    expect(freshnessOf(1000, ttl, 1000 + 15_000)).toBe("live");
    expect(freshnessOf(1000, ttl, 1000 + 15_001)).toBe("recent");
    expect(freshnessOf(1000, ttl, 1000 + 45_000)).toBe("recent");
    expect(freshnessOf(1000, ttl, 1000 + 45_001)).toBe("stale");
  });

  it("is unknown without a usable time, with a future time, or without a positive ttl", () => {
    expect(freshnessOf(null, ttl, 5000)).toBe("unknown");
    expect(freshnessOf(undefined, ttl, 5000)).toBe("unknown");
    expect(freshnessOf(Number.NaN, ttl, 5000)).toBe("unknown");
    expect(freshnessOf(10_000, ttl, 5000)).toBe("unknown");
    expect(freshnessOf(1000, 0, 5000)).toBe("unknown");
    expect(freshnessOf(1000, -1, 5000)).toBe("unknown");
    // A little clock skew is tolerated.
    expect(freshnessOf(6000, ttl, 5000)).toBe("live");
  });
});

describe("cache classes", () => {
  it("every class has a positive ttl and no class polls in a hidden tab", () => {
    for (const name of CACHE_CLASSES) {
      expect(ttlFor(name)).toBeGreaterThan(0);
      expect(pollIntervalFor(name, true)).toBe(false);
      expect(CACHE_POLICY[name].pollWhenHidden).toBe(false);
    }
  });

  it("matches the design table", () => {
    expect(ttlFor("book_foreground")).toBe(15_000);
    expect(ttlFor("book_offscreen")).toBe(60_000);
    expect(pollIntervalFor("book_foreground", false)).toBe(15_000);
    expect(ttlFor("market_list")).toBe(300_000);
    expect(ttlFor("defillama")).toBe(3_600_000);
  });

  it("Quotient lists are manual by default and never faster than five minutes", () => {
    expect(pollIntervalFor("quotient_lists", false)).toBe(false);
    expect(ttlFor("quotient_lists")).toBeGreaterThanOrEqual(300_000);
    expect(pollIntervalFor("market_list", false)).toBe(false);
  });
});

describe("what may be persisted", () => {
  const LICENSES: LicenseClass[] = ["own_use_only", "attribution", "open", "unknown"];

  it("never persists restricted-terms data, whatever the kind", () => {
    for (const kind of DATA_KINDS) {
      if (kind === "binding" || kind === "setting") continue;
      expect(canPersist(kind, "own_use_only"), kind).toBe(false);
    }
  });

  it("unknown licence persists only reference tables", () => {
    const allowed = DATA_KINDS.filter((kind) => canPersist(kind, "unknown"));
    expect(allowed.sort()).toEqual(["binding", "registry", "setting"]);
  });

  it("open and attribution data persist except raw market data", () => {
    for (const license of ["open", "attribution"] as const) {
      expect(canPersist("own_account", license)).toBe(true);
      expect(canPersist("fee_snapshot", license)).toBe(true);
      expect(canPersist("market_data", license)).toBe(false);
    }
  });

  it("the user's own bindings and settings hold no venue data, so they always persist", () => {
    for (const license of LICENSES) {
      expect(canPersist("binding", license)).toBe(true);
      expect(canPersist("setting", license)).toBe(true);
    }
  });

  it("refuses an unknown kind or licence", () => {
    expect(canPersist("whatever" as DataKind, "open")).toBe(false);
    expect(canPersist("own_account", "whatever" as LicenseClass)).toBe(false);
  });

  it("assertPersistable throws PersistenceRefused", () => {
    expect(() => assertPersistable("market_data", "own_use_only")).toThrow(PersistenceRefused);
    expect(() => assertPersistable("binding", "own_use_only")).not.toThrow();
  });

  it("licensePolicy fails closed", () => {
    expect(licensePolicy("own_use_only")).toEqual({ memoryOnly: true, exportable: false });
    expect(licensePolicy("unknown")).toEqual({ memoryOnly: true, exportable: false });
    expect(licensePolicy("open")).toEqual({ memoryOnly: false, exportable: true });
    expect(licensePolicy("nonsense" as LicenseClass)).toEqual({ memoryOnly: true, exportable: false });
  });
});

describe("MemoryStore", () => {
  it("expires entries by ttl", () => {
    let now = 0;
    const store = new MemoryStore<string>("t1", { nowMs: () => now });
    store.set("a", "x", 1000);
    expect(store.get("a")).toBe("x");
    now = 999;
    expect(store.get("a")).toBe("x");
    now = 1000;
    expect(store.get("a")).toBeUndefined();
    expect(store.size).toBe(0);
    store.dispose();
  });

  it("drops everything after 15 idle minutes, even entries with a long ttl", () => {
    let now = 0;
    const store = new MemoryStore<string>("t2", { nowMs: () => now });
    store.set("a", "x", 10 * IDLE_DROP_MS);
    now = IDLE_DROP_MS - 1;
    expect(store.get("a")).toBe("x");
    now += IDLE_DROP_MS;
    expect(store.get("a")).toBeUndefined();
    expect(store.size).toBe(0);
    store.dispose();
  });

  it("arms an idle timer that wipes the store without any access", () => {
    const timers = new FakeTimers();
    const store = new MemoryStore<string>("t3", { nowMs: () => timers.now, timers });
    store.set("a", "x", 100 * IDLE_DROP_MS);
    expect(store.size).toBe(1);
    timers.advance(IDLE_DROP_MS - 1);
    expect(store.size).toBe(1);
    timers.advance(1);
    expect(store.size).toBe(0);
    store.dispose();
  });

  it("a read resets the idle timer", () => {
    const timers = new FakeTimers();
    const store = new MemoryStore<string>("t4", { nowMs: () => timers.now, timers });
    store.set("a", "x", 100 * IDLE_DROP_MS);
    timers.advance(IDLE_DROP_MS - 10);
    expect(store.get("a")).toBe("x");
    timers.advance(IDLE_DROP_MS - 10);
    expect(store.size).toBe(1);
    timers.advance(10);
    expect(store.size).toBe(0);
    store.dispose();
  });

  it("cannot be serialised, logged or inspected into its contents (R3)", () => {
    const store = new MemoryStore<{ secret: string }>("kalshi books", { nowMs: () => 0 });
    store.set("k", { secret: "KALSHI-ORDERBOOK-BODY" }, 1000);
    expect(JSON.stringify(store)).toBe('"[memory-only store: kalshi books]"');
    expect(JSON.stringify({ wrapped: store })).not.toContain("KALSHI-ORDERBOOK-BODY");
    expect(String(store)).not.toContain("KALSHI-ORDERBOOK-BODY");
    expect(`${store}`).toBe("[memory-only store: kalshi books]");
    expect(Object.keys(store)).toEqual(["label"]);
    expect(Object.getOwnPropertyNames(store)).not.toContain("entries");
    const inspect = (store as unknown as Record<symbol, () => string>)[Symbol.for("nodejs.util.inspect.custom")]?.() ?? "";
    expect(inspect).not.toContain("KALSHI-ORDERBOOK-BODY");
    store.dispose();
  });

  it("evicts the least recently used entry past its size cap", () => {
    let now = 0;
    const store = new MemoryStore<number>("t5", { nowMs: () => now, maxEntries: 2 });
    store.set("a", 1, 10_000);
    now = 1;
    store.set("b", 2, 10_000);
    now = 2;
    expect(store.get("a")).toBe(1);
    now = 3;
    store.set("c", 3, 10_000);
    expect(store.get("b")).toBeUndefined();
    expect(store.get("a")).toBe(1);
    expect(store.get("c")).toBe(3);
    store.dispose();
  });

  it("a non-positive ttl stores nothing", () => {
    const store = new MemoryStore<number>("t6", { nowMs: () => 0 });
    store.set("a", 1, 0);
    store.set("b", 2, -5);
    expect(store.size).toBe(0);
    store.dispose();
  });

  it("clearAllMemoryOnly wipes every store, and pagehide triggers it", () => {
    const before = memoryOnlyStoreCount();
    const one = new MemoryStore<string>("t7", { nowMs: () => 0 });
    const two = new MemoryStore<string>("t8", { nowMs: () => 0 });
    expect(memoryOnlyStoreCount()).toBe(before + 2);
    one.set("a", "x", 1000);
    two.set("a", "y", 1000);
    clearAllMemoryOnly();
    expect(one.size + two.size).toBe(0);

    one.set("a", "x", 1000);
    let listener: (() => void) | undefined;
    const target: PageHideTarget = {
      addEventListener: (_type, fn) => {
        listener = fn;
      },
      removeEventListener: (_type, fn) => {
        if (listener === fn) listener = undefined;
      },
    };
    const remove = clearMemoryOnlyOnPageHide(target);
    expect(listener).toBeDefined();
    listener?.();
    expect(one.size).toBe(0);
    remove();
    expect(listener).toBeUndefined();
    one.dispose();
    two.dispose();
    expect(memoryOnlyStoreCount()).toBe(before);
  });
});

describe("InflightDedupe", () => {
  it("shares one promise between identical requests and fetches again afterwards", async () => {
    const dedupe = new InflightDedupe();
    let calls = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = async (): Promise<number> => {
      calls += 1;
      await gate;
      return calls;
    };
    const first = dedupe.run("k", load);
    const second = dedupe.run("k", load);
    const other = dedupe.run("other", load);
    expect(dedupe.size).toBe(2);
    release?.();
    expect(await first).toBe(await second);
    await other;
    expect(calls).toBe(2);
    expect(dedupe.size).toBe(0);
    expect(await dedupe.run("k", async () => 99)).toBe(99);
  });

  it("clears the entry when the load fails", async () => {
    const dedupe = new InflightDedupe();
    await expect(dedupe.run("k", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(dedupe.size).toBe(0);
    expect(await dedupe.run("k", async () => 1)).toBe(1);
  });
});
