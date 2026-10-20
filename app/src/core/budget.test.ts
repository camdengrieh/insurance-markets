import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, READ_SERVICES } from "../../headers.config";
import { HostBudgets, MAX_RETRY_AFTER_MS, SERVICE_BUDGETS, TokenBucket, VenuePauses, backoffDelayMs, budgetForHost, parseRetryAfterMs, serviceForHost } from "./budget";

describe("TokenBucket", () => {
  it("lets a burst through, then spaces callers at the sustained rate", () => {
    const bucket = new TokenBucket({ burst: 5, perSecond: 5 }, 0);
    const waits: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      const slot = bucket.reserve(0, 10_000);
      expect(slot.ok).toBe(true);
      if (slot.ok) waits.push(slot.waitMs);
    }
    expect(waits).toEqual([0, 0, 0, 0, 0, 200, 400, 600]);
  });

  // M0-6: a burst of 100 searches against one host.
  it("a 100-request burst: exactly burst + rate x maxWait are admitted, the rest are refused, nothing is booked for them", () => {
    const bucket = new TokenBucket({ burst: 5, perSecond: 5 }, 0);
    const maxWaitMs = 5000;
    let admitted = 0;
    let refused = 0;
    let lastWait = 0;
    for (let index = 0; index < 100; index += 1) {
      const slot = bucket.reserve(0, maxWaitMs);
      if (slot.ok) {
        admitted += 1;
        expect(slot.waitMs).toBeGreaterThanOrEqual(lastWait);
        lastWait = slot.waitMs;
      } else {
        refused += 1;
        expect(slot.retryAfterMs).toBeGreaterThan(maxWaitMs);
      }
    }
    // 5 immediately plus 5 per second for 5 seconds.
    expect(admitted).toBe(30);
    expect(refused).toBe(70);
    expect(lastWait).toBeLessThanOrEqual(maxWaitMs);
  });

  it("never exceeds burst + rate x elapsed over a long run of immediate-only requests", () => {
    const bucket = new TokenBucket({ burst: 4, perSecond: 2 }, 0);
    let admitted = 0;
    for (let ms = 0; ms <= 30_000; ms += 7) {
      const slot = bucket.reserve(ms, 0);
      if (slot.ok) admitted += 1;
    }
    expect(admitted).toBeLessThanOrEqual(4 + 2 * 30 + 1);
    expect(admitted).toBeGreaterThanOrEqual(4 + 2 * 30 - 4);
  });

  it("a clock that goes backwards refunds nothing", () => {
    const bucket = new TokenBucket({ burst: 2, perSecond: 1 }, 10_000);
    expect(bucket.reserve(10_000, 0).ok).toBe(true);
    expect(bucket.reserve(10_000, 0).ok).toBe(true);
    expect(bucket.reserve(5_000, 0).ok).toBe(false);
    expect(bucket.reserve(10_000, 0).ok).toBe(false);
    expect(bucket.reserve(11_000, 0).ok).toBe(true);
  });

  it("supports fractional rates and refuses a bad spec", () => {
    const slow = new TokenBucket({ burst: 1, perSecond: 0.5 }, 0);
    slow.reserve(0, 0);
    const next = slow.reserve(0, 10_000);
    expect(next).toEqual({ ok: true, waitMs: 2000 });
    expect(() => new TokenBucket({ burst: 0, perSecond: 1 }, 0)).toThrow(RangeError);
    expect(() => new TokenBucket({ burst: 1, perSecond: 0 }, 0)).toThrow(RangeError);
    expect(() => new TokenBucket({ burst: 1, perSecond: 0.0001 }, 0)).toThrow(RangeError);
    expect(() => new TokenBucket({ burst: 1.5, perSecond: 1 }, 0)).toThrow(RangeError);
  });
});

describe("per-host budgets", () => {
  it("has a budget for every read service and maps every origin host to one", () => {
    for (const service of READ_SERVICES) expect(SERVICE_BUDGETS[service], service).toBeDefined();
    for (const entry of BROWSER_DIRECT_ORIGINS) {
      const host = new URL(entry.origin).host;
      expect(serviceForHost(host)).toBe(entry.service);
      expect(budgetForHost(host)).toEqual(SERVICE_BUDGETS[entry.service]);
    }
    for (const entry of DAEMON_ONLY_ORIGINS) {
      if (entry.service === null) continue;
      expect(serviceForHost(new URL(entry.origin).host)).toBe(entry.service);
    }
  });

  it("refuses a host that is not on the closed list", () => {
    let now = 0;
    const budgets = new HostBudgets(() => now);
    expect(budgets.reserve("evil.example", 5000)).toEqual({ ok: false, retryAfterMs: 0 });
    expect(budgets.reserve("api.paybox.sh", 5000)).toEqual({ ok: false, retryAfterMs: 0 });
    expect(budgetForHost("evil.example")).toBeUndefined();
    now += 1;
  });

  it("keeps a separate bucket per host", () => {
    const now = 0;
    const budgets = new HostBudgets(() => now);
    const a = new URL(BROWSER_DIRECT_ORIGINS[0]?.origin ?? "").host;
    const b = new URL(BROWSER_DIRECT_ORIGINS[1]?.origin ?? "").host;
    const burstA = SERVICE_BUDGETS[BROWSER_DIRECT_ORIGINS[0]?.service ?? "xo_data"].burst;
    for (let index = 0; index < burstA; index += 1) expect(budgets.reserve(a, 0).ok).toBe(true);
    expect(budgets.reserve(a, 0).ok).toBe(false);
    expect(budgets.reserve(b, 0).ok).toBe(true);
  });

  it("takes a per-host override for a user-supplied RPC", () => {
    const budgets = new HostBudgets(() => 0, { "rpc.example": { burst: 1, perSecond: 1 } });
    expect(budgets.reserve("rpc.example", 0).ok).toBe(true);
    expect(budgets.reserve("rpc.example", 0).ok).toBe(false);
  });
});

describe("R9 pauses", () => {
  const HOST = "external-api.kalshi.com";

  it("pauses a host for ten minutes after any 403", () => {
    const pauses = new VenuePauses();
    expect(pauses.check(HOST, 0)).toEqual({ paused: false });
    pauses.record(HOST, 403, 1000, null);
    expect(pauses.check(HOST, 1001)).toEqual({ paused: true, untilMs: 1000 + 600_000, reason: "forbidden" });
    expect(pauses.check(HOST, 1000 + 599_999).paused).toBe(true);
    expect(pauses.check(HOST, 1000 + 600_000)).toEqual({ paused: false });
  });

  it("pauses after three consecutive 429s, and a success in between resets the count", () => {
    const pauses = new VenuePauses();
    pauses.record(HOST, 429, 0, null);
    pauses.record(HOST, 429, 1, null);
    expect(pauses.check(HOST, 2).paused).toBe(false);
    pauses.record(HOST, 200, 3, null);
    pauses.record(HOST, 429, 4, null);
    pauses.record(HOST, 429, 5, null);
    expect(pauses.check(HOST, 6).paused).toBe(false);
    pauses.record(HOST, 429, 7, null);
    expect(pauses.check(HOST, 8)).toEqual({ paused: true, untilMs: 7 + 600_000, reason: "rate_limited" });
  });

  it("caps a Retry-After handed straight to record(), not only one read by the parser (TM-11)", () => {
    const pauses = new VenuePauses();
    pauses.record(HOST, 429, 0, MAX_RETRY_AFTER_MS * 40);
    expect(pauses.check(HOST, 1)).toEqual({ paused: true, untilMs: MAX_RETRY_AFTER_MS, reason: "retry_after" });
  });

  it("honours Retry-After as a cooldown, and a longer pause is never shortened", () => {
    const pauses = new VenuePauses();
    pauses.record(HOST, 429, 0, 30_000);
    expect(pauses.check(HOST, 10_000)).toEqual({ paused: true, untilMs: 30_000, reason: "retry_after" });
    pauses.record(HOST, 403, 10_000, null);
    pauses.record(HOST, 429, 11_000, 1000);
    expect(pauses.check(HOST, 20_000)).toEqual({ paused: true, untilMs: 10_000 + 600_000, reason: "forbidden" });
  });

  it("keeps hosts apart and reset clears everything", () => {
    const pauses = new VenuePauses();
    pauses.record(HOST, 403, 0, null);
    expect(pauses.check("api.novig.com", 1).paused).toBe(false);
    pauses.reset();
    expect(pauses.check(HOST, 1).paused).toBe(false);
  });

  it("takes custom thresholds", () => {
    const pauses = new VenuePauses({ after429: 1, pauseMs: 5000 });
    pauses.record(HOST, 429, 0, null);
    expect(pauses.check(HOST, 4999).paused).toBe(true);
    expect(pauses.check(HOST, 5000).paused).toBe(false);
  });
});

describe("backoff and Retry-After", () => {
  it("is full-jitter exponential with a cap, and deterministic for an injected random source", () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(500);
    expect(backoffDelayMs(3, () => 0.5)).toBe(4000);
    expect(backoffDelayMs(10, () => 0.999999)).toBe(59_999);
    expect(backoffDelayMs(2, () => 0)).toBe(0);
    expect(backoffDelayMs(5, () => 0.25, { baseMs: 100, capMs: 1000 })).toBe(250);
    // A broken random source cannot produce a negative or huge wait.
    expect(backoffDelayMs(2, () => Number.NaN)).toBe(0);
    expect(backoffDelayMs(2, () => 7)).toBe(0);
    expect(backoffDelayMs(-5, () => 0.5)).toBe(500);
  });

  it("parses delay-seconds and HTTP dates, and nothing else", () => {
    expect(parseRetryAfterMs("120", 0)).toBe(120_000);
    expect(parseRetryAfterMs(" 5 ", 0)).toBe(5000);
    expect(parseRetryAfterMs("99999999", 0)).toBe(86_400_000);
    expect(parseRetryAfterMs("Mon, 19 Oct 2026 09:31:00 GMT", Date.UTC(2026, 9, 19, 9, 30, 0))).toBe(60_000);
    expect(parseRetryAfterMs("Mon, 19 Oct 2026 09:29:00 GMT", Date.UTC(2026, 9, 19, 9, 30, 0))).toBe(0);
    expect(parseRetryAfterMs("soon", 0)).toBeNull();
    expect(parseRetryAfterMs("-5", 0)).toBeNull();
    expect(parseRetryAfterMs("1.5", 0)).toBeNull();
    expect(parseRetryAfterMs(null, 0)).toBeNull();
    expect(parseRetryAfterMs(undefined, 0)).toBeNull();
  });
});
