// An optional per-listener request limiter, off by default. The real orderbook documents 5 requests per second
// and the Data API 100 per 10 s (50 by its own header), and neither limit was ever seen to bite at 20 concurrent
// requests (docs/research/02), so the mock does not enforce one unless a test turns it on.
//
// The window is measured on the mock clock, which only moves when a test moves it: requests made at the same
// clock time all count, and the limit lifts when the test advances the clock past the window.

import type { MockClock } from "./clock.js";
import { dataApiErrors, orderbookErrors } from "./errors.js";
import type { BeforeRoute, MockReply } from "./listener.js";
import { iso } from "./catalog.js";

export interface RateLimit {
  readonly limit: number;
  readonly windowMs: number;
}

export class RateLimiter {
  private readonly limits = new Map<string, RateLimit>();
  private readonly seen = new Map<string, number[]>();
  private limitedCount = 0;

  constructor(private readonly clock: MockClock) {}

  set(listener: string, limit: RateLimit | null): void {
    if (limit === null) {
      this.limits.delete(listener);
      this.seen.delete(listener);
      return;
    }
    if (!Number.isInteger(limit.limit) || limit.limit < 1 || !Number.isInteger(limit.windowMs) || limit.windowMs < 1) {
      throw new RangeError("a rate limit needs a positive integer limit and window");
    }
    this.limits.set(listener, limit);
    this.seen.set(listener, []);
  }

  get limited(): number {
    return this.limitedCount;
  }

  before(listener: string): BeforeRoute {
    return (): MockReply | undefined => {
      const limit = this.limits.get(listener);
      if (limit === undefined) return undefined;
      const now = this.clock.nowMs();
      const recent = (this.seen.get(listener) ?? []).filter((at) => at > now - limit.windowMs);
      if (recent.length >= limit.limit) {
        this.seen.set(listener, recent);
        this.limitedCount += 1;
        const retryAfterMs = Math.max(1, (recent[0] as number) + limit.windowMs - now);
        return listener === "dataApi" ? dataApiErrors.rateLimited(iso(now), retryAfterMs) : orderbookErrors.rateLimited(retryAfterMs);
      }
      recent.push(now);
      this.seen.set(listener, recent);
      return undefined;
    };
  }
}
