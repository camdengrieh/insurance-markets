// Injected time source. Production uses the system clock; tests use ManualClock so backoff,
// rate limits and cadence are deterministic and instant.

export interface Clock {
  nowMs(): number;
  // Resolves after `ms` of (possibly simulated) time, or early if the signal aborts.
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const systemClock: Clock = {
  nowMs: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted === true) return resolve();
      const timer = setTimeout(done, Math.max(0, ms));
      function done(): void {
        signal?.removeEventListener("abort", done);
        clearTimeout(timer);
        resolve();
      }
      signal?.addEventListener("abort", done, { once: true });
    }),
};

// Sleeping advances the clock by exactly the requested time, so a test can assert the total
// simulated wait without waiting.
export class ManualClock implements Clock {
  private t: number;
  readonly sleeps: number[] = [];
  constructor(startMs: number) {
    this.t = startMs;
  }
  nowMs(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  set(ms: number): void {
    this.t = ms;
  }
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) return Promise.resolve();
    const step = Math.max(0, ms);
    this.sleeps.push(step);
    this.t += step;
    return Promise.resolve();
  }
}

// Small deterministic generator (mulberry32) for backoff jitter in tests; production passes
// Math.random.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
