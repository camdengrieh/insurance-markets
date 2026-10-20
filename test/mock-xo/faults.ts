// Fault injection: the `faults` switch (spec 5.5 category B, "429 with retry_after_ms, 5xx, timeouts,
// truncated JSON"). It is not part of either profile: both columns say "none", and a test turns a fault on.
//
//   switches.set("faults", "5xx")           every request to every listener fails until it is set back
//   faults.inject("429-retry-after", { count: 2, listeners: ["orderbook"] })
//                                           the next two orderbook requests fail, then the switch returns
//                                           to "none" by itself
//
// What each fault looks like on the wire:
//   429-retry-after  HTTP 429 with a Retry-After header and the body of that host (retry_after_ms)
//   5xx              HTTP 503 with the body of that host
//   timeout          the connection stays open and nothing is sent
//   truncated-json   HTTP 200 whose JSON body stops in the middle

import type { MockClock } from "./clock.js";
import { dataApiErrors, orderbookErrors } from "./errors.js";
import type { AfterRoute, BeforeRoute, MockReply, MockRequest } from "./listener.js";
import { iso } from "./catalog.js";
import type { SwitchStore } from "./profile.js";
import type { MockSwitchValue } from "./switches.js";

export type FaultKind = "429-retry-after" | "5xx" | "timeout" | "truncated-json";

export interface InjectOptions {
  // How many requests fail before the switch returns to "none". Omitted: until the switch is changed.
  readonly count?: number;
  // Which listeners are affected ("orderbook", "dataApi", "explorer", "xoRpc", "baseRpc", "bundler"). Omitted: all.
  readonly listeners?: readonly string[];
  // The retry hint of a 429, in ms (default 1000).
  readonly retryAfterMs?: number;
  // "before" (default): the request fails before the server does anything. "after": the server does its work
  // (an order is accepted, a UserOp lands) and then the RESPONSE is replaced by the fault, which is how a write
  // becomes ambiguous. Only POST, PUT and DELETE requests are affected; every other request passes untouched.
  readonly when?: "before" | "after";
}

const WRITE_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "DELETE"]);

export class FaultInjector {
  private remaining: number | null = null;
  private scope: ReadonlySet<string> | null = null;
  private retryAfterMs = 1000;
  private injectedCount = 0;
  private when: "before" | "after" = "before";
  private readonly deferred = new WeakSet<MockRequest>();

  constructor(
    private readonly switches: SwitchStore,
    private readonly clock: MockClock,
  ) {
    // Any direct change of the switch replaces an earlier injection's limits.
    switches.onChange((name) => {
      if (name === "faults") {
        this.remaining = null;
        this.scope = null;
        this.when = "before";
      }
    });
  }

  get injected(): number {
    return this.injectedCount;
  }

  inject(kind: FaultKind, options: InjectOptions = {}): void {
    if (options.count !== undefined && (!Number.isInteger(options.count) || options.count < 1)) throw new RangeError("count must be a positive integer");
    this.switches.set("faults", kind);
    this.remaining = options.count ?? null;
    this.scope = options.listeners === undefined ? null : new Set(options.listeners);
    this.retryAfterMs = options.retryAfterMs ?? 1000;
    this.when = options.when ?? "before";
  }

  clear(): void {
    this.switches.set("faults", "none");
  }

  // The hook for one listener.
  before(listener: string): BeforeRoute {
    return (request) => {
      const mode = this.switches.get("faults");
      if (mode === "none") return undefined;
      if (this.scope !== null && !this.scope.has(listener)) return undefined;
      if (this.when === "after") {
        // The fault waits for the handler's answer; only writes are affected.
        if (WRITE_METHODS.has(request.method)) this.deferred.add(request);
        return undefined;
      }
      return this.consume(mode, listener);
    };
  }

  // The hook that replaces the answer of a write whose fault was set to "after".
  after(listener: string): AfterRoute {
    return (request) => {
      if (!this.deferred.delete(request)) return undefined;
      const mode = this.switches.get("faults");
      if (mode === "none") return undefined;
      return this.consume(mode, listener);
    };
  }

  private consume(mode: Exclude<MockSwitchValue<"faults">, "none">, listener: string): MockReply {
    this.injectedCount += 1;
    const reply = this.replyFor(mode, listener);
    if (this.remaining !== null) {
      this.remaining -= 1;
      if (this.remaining <= 0) this.switches.set("faults", "none");
    }
    return reply;
  }

  private replyFor(mode: Exclude<MockSwitchValue<"faults">, "none">, listener: string): MockReply {
    const stamp = iso(this.clock.nowMs());
    switch (mode) {
      case "429-retry-after":
        if (listener === "orderbook") return orderbookErrors.rateLimited(this.retryAfterMs);
        if (listener === "dataApi") return dataApiErrors.rateLimited(stamp, this.retryAfterMs);
        return {
          status: 429,
          json: { error: "rate limit exceeded", retry_after_ms: this.retryAfterMs },
          headers: { "retry-after": String(Math.max(1, Math.ceil(this.retryAfterMs / 1000))) },
        };
      case "5xx":
        if (listener === "orderbook") return orderbookErrors.serverError();
        if (listener === "dataApi") return dataApiErrors.serverError();
        return { status: 503, json: { error: "upstream unavailable" } };
      case "timeout":
        return { status: 200, hang: true };
      case "truncated-json":
        return { status: 200, text: '{"status":"1","message":"OK","result":[{"truncated"', headers: { "content-type": "application/json" } };
    }
  }
}
