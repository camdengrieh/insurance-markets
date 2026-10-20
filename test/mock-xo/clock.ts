// The mock's injected clock. Nothing in the mock reads Date.now(): every timestamp it serves (GET /time,
// book timestamps, error timestamps, lazy-fill delays, rate-limit windows, order expiry, taker delays,
// bundle and delivery times) comes from here, so a test decides what time it is and moves it by hand.
// The clock only goes forward.
//
// sleepMs(ms) is how a handler "waits" without a real timer: it resolves when the clock has been moved
// ms forward from the moment of the call. A request that the test never lets time pass for stays open
// until the client gives up, which is exactly the shape of a slow upstream (the taker delay of the write
// mock uses it). cancelWaiters() releases every waiter with false (test teardown), so a handler left
// over from one test cannot act in the next.

import { DEFAULT_GENESIS_TIMESTAMP } from "../anvil/start.js";

export interface MockClock {
  nowMs(): number;
  // Whole seconds (floor), what GET /time returns.
  nowSeconds(): number;
  // Moves the clock forward. Returns the new time in ms.
  advanceMs(ms: number): number;
  advance(seconds: number): number;
  // Jumps forward to an absolute time. Moving backwards throws.
  set(ms: number): void;
  // Resolves true once the clock is `ms` later than now; false when cancelWaiters() ran first.
  sleepMs(ms: number): Promise<boolean>;
  cancelWaiters(): void;
  waiterCount(): number;
}

// One hour after the chain harness' fixed genesis (2026-10-19T00:00:00Z), so a chain that starts at its
// default genesis is always behind the mock's clock and can be synced up to it, never past it.
export const MOCK_EPOCH_SECONDS = DEFAULT_GENESIS_TIMESTAMP + 3_600;

interface Waiter {
  readonly dueMs: number;
  readonly resolve: (elapsed: boolean) => void;
}

export function createMockClock(startMs: number = MOCK_EPOCH_SECONDS * 1000): MockClock {
  if (!Number.isSafeInteger(startMs) || startMs < 0) throw new RangeError("clock start must be a non-negative integer of milliseconds");
  let now = startMs;
  let waiters: Waiter[] = [];
  const release = (): void => {
    const due = waiters.filter((waiter) => waiter.dueMs <= now);
    if (due.length === 0) return;
    waiters = waiters.filter((waiter) => waiter.dueMs > now);
    for (const waiter of due) waiter.resolve(true);
  };
  const advanceMs = (ms: number): number => {
    if (!Number.isFinite(ms) || ms < 0 || !Number.isInteger(ms)) throw new RangeError("the clock only moves forward by a non-negative whole number of milliseconds");
    now += ms;
    release();
    return now;
  };
  return {
    nowMs: () => now,
    nowSeconds: () => Math.floor(now / 1000),
    advanceMs,
    advance: (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("the clock only moves forward");
      return advanceMs(Math.round(seconds * 1000));
    },
    set: (ms) => {
      if (!Number.isSafeInteger(ms) || ms < now) throw new RangeError("the clock does not move backwards");
      now = ms;
      release();
    },
    sleepMs: (ms) => {
      if (!Number.isFinite(ms) || ms < 0) return Promise.reject(new RangeError("sleepMs takes a non-negative number of milliseconds"));
      return new Promise<boolean>((resolve) => {
        if (ms === 0) {
          resolve(true);
          return;
        }
        waiters.push({ dueMs: now + Math.round(ms), resolve });
      });
    },
    cancelWaiters: () => {
      const pending = waiters;
      waiters = [];
      for (const waiter of pending) waiter.resolve(false);
    },
    waiterCount: () => waiters.length,
  };
}
