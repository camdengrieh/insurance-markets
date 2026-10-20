// Polite, read-only HTTP client for the recorder.
//
// - GET only; there is no method parameter and no request body.
// - Hosts outside the allowlist are refused before any socket is opened.
// - One fixed generic User-Agent, no cookies, no auth, no referer, redirects are errors.
// - Per-host token bucket, hourly request budget, shared backoff after 429/5xx/network errors
//   (Retry-After honoured, exponential with jitter), and a circuit breaker per host.
// - Response bodies are size-capped; the Date header is returned so the caller can log clock skew.
// Time, randomness and fetch are injected, so tests run instantly and offline.

import { isAllowedHost, RESEARCH_USER_AGENT } from "./allowlist.js";
import type { Clock } from "./clock.js";
import type { RecorderConfig } from "./config.js";
import { urlOf, type EventKind, type RequestSpec } from "./types.js";

export type HttpFailure =
  | "refused_host"
  | "budget"
  | "breaker_open"
  | "timeout"
  | "network"
  | "too_large"
  | "bad_json"
  | "redirect"
  | "http_error";

export type HttpOutcome =
  | {
      readonly ok: true;
      readonly status: number;
      readonly json: unknown;
      readonly startMs: number;
      readonly endMs: number;
      // Server Date header (whole seconds), or null.
      readonly serverDateMs: number | null;
      readonly bytes: number;
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly reason: HttpFailure;
      readonly status?: number;
      readonly startMs: number;
      readonly endMs: number;
      readonly attempts: number;
    };

export interface HostCounters {
  requests: number;
  ok: number;
  errors: number;
  throttled: number;
  backoffMs: number;
}

export type ClientEvent = (kind: EventKind, host: string | null, detail: string) => void;

export interface ClientDeps {
  readonly config: Pick<RecorderConfig, "hostBudgets" | "hostBases" | "backoff" | "breaker" | "requestTimeoutMs" | "maxBodyBytes">;
  readonly clock: Clock;
  readonly fetchImpl?: typeof fetch;
  readonly rng?: () => number;
  readonly onEvent?: ClientEvent;
  readonly signal?: AbortSignal;
}

interface HostState {
  tokens: number;
  refilledMs: number;
  penaltyUntilMs: number;
  consecutiveFailures: number;
  breakerUntilMs: number;
  hourStartMs: number;
  hourCount: number;
  counters: HostCounters;
}

function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (/^\d{1,6}$/.test(trimmed)) return Number(trimmed) * 1000;
  const when = Date.parse(trimmed);
  return Number.isFinite(when) ? Math.max(0, when - nowMs) : null;
}

export class PoliteClient {
  private readonly hosts = new Map<string, HostState>();
  private readonly fetchImpl: typeof fetch;
  private readonly rng: () => number;

  constructor(private readonly deps: ClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.rng = deps.rng ?? Math.random;
  }

  private emit(kind: EventKind, host: string | null, detail: string): void {
    this.deps.onEvent?.(kind, host, detail);
  }

  private state(host: string): HostState {
    let s = this.hosts.get(host);
    if (s === undefined) {
      const b = this.deps.config.hostBudgets[host];
      const now = this.deps.clock.nowMs();
      s = {
        tokens: b?.burst ?? 1,
        refilledMs: now,
        penaltyUntilMs: 0,
        consecutiveFailures: 0,
        breakerUntilMs: 0,
        hourStartMs: now,
        hourCount: 0,
        counters: { requests: 0, ok: 0, errors: 0, throttled: 0, backoffMs: 0 },
      };
      this.hosts.set(host, s);
    }
    return s;
  }

  counters(): ReadonlyMap<string, Readonly<HostCounters>> {
    return new Map([...this.hosts].map(([h, s]) => [h, { ...s.counters }]));
  }

  resetCounters(): void {
    for (const s of this.hosts.values()) s.counters = { requests: 0, ok: 0, errors: 0, throttled: 0, backoffMs: 0 };
  }

  // Waits for a token; returns false when the hourly budget is spent.
  private async acquire(host: string): Promise<boolean> {
    const budget = this.deps.config.hostBudgets[host];
    if (budget === undefined) return false;
    const s = this.state(host);
    const clock = this.deps.clock;
    for (;;) {
      if (this.deps.signal?.aborted === true) return false;
      const now = clock.nowMs();
      // A clock that moved backwards must not turn into a long sleep or a frozen budget window.
      if (now < s.refilledMs) s.refilledMs = now;
      if (now < s.hourStartMs) s.hourStartMs = now;
      if (s.penaltyUntilMs - now > this.deps.config.backoff.maxMs) s.penaltyUntilMs = now + this.deps.config.backoff.maxMs;
      if (now - s.hourStartMs >= 3_600_000) {
        s.hourStartMs = now;
        s.hourCount = 0;
      }
      if (s.hourCount >= budget.maxPerHour) return false;
      if (now < s.penaltyUntilMs) {
        await clock.sleep(s.penaltyUntilMs - now, this.deps.signal);
        continue;
      }
      s.tokens = Math.min(budget.burst, s.tokens + ((now - s.refilledMs) / 1000) * budget.rps);
      s.refilledMs = now;
      if (s.tokens >= 1) {
        s.tokens -= 1;
        s.hourCount += 1;
        return true;
      }
      await clock.sleep(Math.ceil(((1 - s.tokens) / budget.rps) * 1000), this.deps.signal);
    }
  }

  private baseFor(host: string): string {
    return this.deps.config.hostBases[host] ?? `https://${host}`;
  }

  private async readBody(res: Response): Promise<{ text: string; bytes: number } | "too_large"> {
    const max = this.deps.config.maxBodyBytes;
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > max) return "too_large";
    if (res.body === null) return { text: "", bytes: 0 };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      chunks.push(value);
    }
    return { text: Buffer.concat(chunks).toString("utf8"), bytes: total };
  }

  async get(spec: RequestSpec): Promise<HttpOutcome> {
    const clock = this.deps.clock;
    const startMs = clock.nowMs();
    const fail = (reason: HttpFailure, attempts: number, status?: number): HttpOutcome => ({
      ok: false,
      reason,
      ...(status === undefined ? {} : { status }),
      startMs,
      endMs: clock.nowMs(),
      attempts,
    });
    if (!isAllowedHost(spec.host) || !spec.path.startsWith("/")) {
      this.emit("refused", null, `host not on the allowlist: ${spec.host.slice(0, 60)}`);
      return fail("refused_host", 0);
    }
    const s = this.state(spec.host);
    const cfg = this.deps.config;
    if (clock.nowMs() < s.breakerUntilMs) return fail("breaker_open", 0);
    if (s.breakerUntilMs !== 0 && clock.nowMs() >= s.breakerUntilMs) {
      // Half-open: one more failure re-opens the breaker.
      s.breakerUntilMs = 0;
      s.consecutiveFailures = Math.max(0, cfg.breaker.failures - 1);
    }

    const url = urlOf(spec, this.baseFor(spec.host));
    let lastReason: HttpFailure = "network";
    let lastStatus: number | undefined;
    for (let attempt = 1; attempt <= cfg.backoff.maxAttempts; attempt += 1) {
      if (!(await this.acquire(spec.host))) {
        this.emit("budget", spec.host, "hourly request budget spent or stopped");
        return fail("budget", attempt - 1);
      }
      s.counters.requests += 1;
      let retryHeader: string | null = null;
      let retryable = false;
      try {
        const t0 = clock.nowMs();
        const res = await this.fetchImpl(url, {
          method: "GET",
          redirect: "error",
          headers: { "user-agent": RESEARCH_USER_AGENT, accept: "application/json" },
          signal: AbortSignal.timeout(cfg.requestTimeoutMs),
        });
        const body = await this.readBody(res);
        const t1 = clock.nowMs();
        if (body === "too_large") {
          s.counters.errors += 1;
          return fail("too_large", attempt, res.status);
        }
        if (res.status === 429 || res.status >= 500) {
          lastReason = "http_error";
          lastStatus = res.status;
          retryable = true;
          retryHeader = res.headers.get("retry-after");
          if (res.status === 429) s.counters.throttled += 1;
        } else if (res.status < 200 || res.status >= 300) {
          // 3xx (never followed), 404 and other 4xx: not a host failure, not retried.
          s.counters.errors += 1;
          return fail("http_error", attempt, res.status);
        } else {
          let json: unknown;
          try {
            json = JSON.parse(body.text) as unknown;
          } catch {
            s.counters.errors += 1;
            return fail("bad_json", attempt, res.status);
          }
          s.counters.ok += 1;
          s.consecutiveFailures = 0;
          const dateHeader = res.headers.get("date");
          const parsedDate = dateHeader === null ? Number.NaN : Date.parse(dateHeader);
          return {
            ok: true,
            status: res.status,
            json,
            startMs: t0,
            endMs: t1,
            serverDateMs: Number.isFinite(parsedDate) ? parsedDate : null,
            bytes: body.bytes,
            attempts: attempt,
          };
        }
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
        if (name === "TimeoutError" || name === "AbortError") lastReason = "timeout";
        else if (/redirect/i.test(error instanceof Error ? error.message : "") || /redirect/i.test(cause)) {
          s.counters.errors += 1;
          return fail("redirect", attempt);
        } else lastReason = "network";
        lastStatus = undefined;
        retryable = true;
      }
      s.counters.errors += 1;
      if (!retryable || attempt === cfg.backoff.maxAttempts) break;
      const fromHeader = retryAfterMs(retryHeader, clock.nowMs());
      const exp = Math.min(cfg.backoff.maxMs, cfg.backoff.baseMs * cfg.backoff.factor ** (attempt - 1));
      const jittered = exp * (1 + cfg.backoff.jitter * (this.rng() * 2 - 1));
      const delay = Math.min(cfg.backoff.maxMs, Math.max(fromHeader ?? 0, Math.round(jittered)));
      s.counters.backoffMs += delay;
      s.penaltyUntilMs = Math.max(s.penaltyUntilMs, clock.nowMs() + delay);
      this.emit("backoff", spec.host, `attempt=${attempt} reason=${lastReason}${lastStatus === undefined ? "" : ` status=${lastStatus}`} wait_ms=${delay}`);
    }
    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= cfg.breaker.failures) {
      s.breakerUntilMs = clock.nowMs() + cfg.breaker.cooldownMs;
      this.emit("breaker_open", spec.host, `after ${s.consecutiveFailures} failed calls; cooldown_ms=${cfg.breaker.cooldownMs}`);
    }
    return fail(lastReason, cfg.backoff.maxAttempts, lastStatus);
  }
}
