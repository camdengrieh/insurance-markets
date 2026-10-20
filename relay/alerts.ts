import { spawn } from "node:child_process";

import { redactSecrets } from "../src/guardrails/audit.js";
import { sanitizeUntrusted } from "../src/guardrails/untrusted.js";
import { RelayError } from "../src/relay/errors.js";
import { isoSecondOf, type RelayAudit, type RotatingLog } from "./audit.js";
import { NAMESPACES, type DurableStore } from "./store.js";

// Alerts and tripwires (docs/phase1-gap-closing.md section 9 A5, risk register items 3 and 7).
//
//   AlertSink       a file (JSON lines, rotated) and an optional command hook that is OFF unless the
//                   operator names an executable and switches it on. The hook runs without a shell, with
//                   an empty environment (no master secret, no relay key reaches it), a time limit, a
//                   per-alert cooldown and an hourly ceiling. Alert text is fixed wording written by this
//                   project; it is sanitised and redacted anyway.
//   TripwireRegistry  the durable state of "a pinned on-chain property changed". While any tripwire is
//                   tripped the relay is read-only. A tripwire clears only by the operator naming it at
//                   start-up, never by itself and never because a later check looks fine.

export type AlertSeverity = "info" | "warn" | "critical";

export interface AlertInput {
  // A stable slug; repeats of the same id within the dedupe window are counted, not re-sent.
  readonly id: string;
  readonly severity: AlertSeverity;
  // Fixed project wording. Never market text, never an upstream body.
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface AlertRecord {
  readonly ts: string;
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly repeats: number;
}

export interface AlertSink {
  raise(alert: AlertInput): Promise<void>;
  recent(limit?: number): readonly AlertRecord[];
  readonly hookEnabled: boolean;
  hookRuns(): number;
  hookFailures(): number;
  // Resolves when every hook started so far has finished.
  idle(): Promise<void>;
  close(): Promise<void>;
}

export type HookRunner = (command: string, payload: string, options: { readonly timeoutMs: number }) => Promise<{ readonly ok: boolean }>;

// A fixed, empty-ish environment: the hook gets nothing the relay holds.
export const runAlertHook: HookRunner = (command, payload, { timeoutMs }) =>
  new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok });
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, [], { stdio: ["pipe", "ignore", "ignore"], env: { PATH: "/usr/bin:/bin" }, shell: false, windowsHide: true });
    } catch {
      resolve({ ok: false });
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(false);
    }, timeoutMs);
    timer.unref();
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(payload);
  });

export interface AlertSinkOptions {
  readonly log: RotatingLog;
  readonly now?: () => number;
  readonly dedupeWindowMs?: number;
  readonly hook?: { readonly command: string; readonly run?: HookRunner; readonly timeoutMs?: number };
  readonly hookCooldownMs?: number;
  readonly hookMaxPerHour?: number;
  readonly audit?: RelayAudit;
  // Known secret strings (relay keys, the master secret), blanked out of every alert.
  readonly scrub?: () => readonly string[];
}

const SLUG = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_RECENT = 50;

function cleanText(value: string, maxChars: number, scrub: readonly string[] = []): string {
  let text = value;
  for (const secret of scrub) {
    if (secret.length >= 8) text = text.split(secret).join("[redacted]");
  }
  const sanitized = sanitizeUntrusted(text, { maxChars: 2000 }).text;
  return sanitizeUntrusted(redactSecrets(sanitized), { maxChars }).text;
}

export function createAlertSink(options: AlertSinkOptions): AlertSink {
  const now = options.now ?? Date.now;
  const dedupeWindowMs = options.dedupeWindowMs ?? 60_000;
  const cooldownMs = options.hookCooldownMs ?? 5 * 60_000;
  const maxPerHour = options.hookMaxPerHour ?? 20;
  const hook = options.hook;
  const lastSeen = new Map<string, { at: number; repeats: number }>();
  const lastHook = new Map<string, number>();
  const hookTimes: number[] = [];
  const recent: AlertRecord[] = [];
  const running = new Set<Promise<unknown>>();
  let hookRuns = 0;
  let hookFailures = 0;

  function maybeRunHook(record: AlertRecord, nowMs: number): void {
    if (hook === undefined) return;
    const previous = lastHook.get(record.id);
    if (previous !== undefined && nowMs - previous < cooldownMs) return;
    while (hookTimes.length > 0 && nowMs - (hookTimes[0] as number) > 3_600_000) hookTimes.shift();
    if (hookTimes.length >= maxPerHour) return;
    lastHook.set(record.id, nowMs);
    hookTimes.push(nowMs);
    hookRuns += 1;
    const run = hook.run ?? runAlertHook;
    const payload = JSON.stringify({ id: record.id, severity: record.severity, message: record.message, ts: record.ts });
    const task = run(hook.command, payload, { timeoutMs: hook.timeoutMs ?? 5_000 }).then(
      (result) => {
        if (!result.ok) hookFailures += 1;
      },
      () => {
        hookFailures += 1;
      },
    );
    running.add(task);
    void task.finally(() => running.delete(task));
  }

  return {
    hookEnabled: hook !== undefined,
    async raise(alert) {
      const nowMs = now();
      const id = SLUG.test(alert.id) ? alert.id : "invalid_alert_id";
      const severity: AlertSeverity = alert.severity === "info" || alert.severity === "warn" || alert.severity === "critical" ? alert.severity : "warn";
      const seen = lastSeen.get(id);
      if (seen !== undefined && nowMs - seen.at < dedupeWindowMs) {
        seen.repeats += 1;
        return;
      }
      const repeats = seen?.repeats ?? 0;
      lastSeen.set(id, { at: nowMs, repeats: 0 });
      if (lastSeen.size > 500) lastSeen.delete(lastSeen.keys().next().value as string);
      const scrub = options.scrub?.() ?? [];
      const record: AlertRecord = { ts: isoSecondOf(nowMs), id, severity, message: cleanText(String(alert.message), 300, scrub), repeats };
      const details: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(alert.details ?? {}).slice(0, 8)) {
        if (!SLUG.test(key)) continue;
        details[key] = typeof value === "string" ? cleanText(value, 120, scrub) : typeof value === "number" || typeof value === "boolean" ? value : "invalid";
      }
      recent.push(record);
      if (recent.length > MAX_RECENT) recent.shift();
      try {
        await options.log.append(JSON.stringify({ v: 1, ...record, details }), { sync: severity === "critical" });
      } catch {
        // An unwritable alert file must not break the request that raised it. The audit log notes it.
        await options.audit?.write({ ev: "error", code: "alert_write_failed", outcome: "error" });
      }
      await options.audit?.write({ ev: "alert", code: id, state: severity, outcome: "ok" });
      maybeRunHook(record, nowMs);
    },
    recent: (limit = 10) => recent.slice(-Math.max(0, Math.min(limit, MAX_RECENT))),
    hookRuns: () => hookRuns,
    hookFailures: () => hookFailures,
    async idle() {
      while (running.size > 0) await Promise.allSettled([...running]);
    },
    async close() {
      while (running.size > 0) await Promise.allSettled([...running]);
      await options.log.close();
    },
  };
}

// ---- tripwires ------------------------------------------------------------------------------------------------------

export interface TripwireFinding {
  readonly id: string;
  // Fixed wording: what changed, not what an upstream said.
  readonly detail: string;
}

export interface TripwireChecker {
  readonly id: string;
  // Resolves to a finding when a pinned property changed, undefined when it is as pinned. Throws when
  // it could not tell.
  check(signal: AbortSignal): Promise<TripwireFinding | undefined>;
}

export interface TripwireSnapshot {
  readonly ok: boolean;
  readonly tripped: ReadonlyArray<{ readonly id: string; readonly detail: string; readonly since: string }>;
}

export interface RecheckResult {
  readonly snapshot: TripwireSnapshot;
  // Checkers that could not decide (error or timeout). Not latched, but a submit must not go ahead.
  readonly unverified: readonly string[];
}

interface TripRecord {
  readonly [key: string]: string | number;
  readonly detail: string;
  readonly sinceMs: number;
}

export interface TripwireRegistryOptions {
  readonly store: DurableStore;
  readonly now?: () => number;
  readonly alerts?: AlertSink;
  readonly audit?: RelayAudit;
  // Ids the operator acknowledged at start-up (RELAY_ACK_TRIPWIRES).
  readonly acknowledge?: readonly string[];
}

export class TripwireRegistry {
  readonly #store: DurableStore;
  readonly #now: () => number;
  readonly #alerts: AlertSink | undefined;
  readonly #audit: RelayAudit | undefined;
  readonly #tripped = new Map<string, TripRecord>();
  readonly acknowledged: readonly string[];

  private constructor(options: TripwireRegistryOptions, acknowledged: readonly string[]) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#alerts = options.alerts;
    this.#audit = options.audit;
    this.acknowledged = acknowledged;
  }

  static async open(options: TripwireRegistryOptions): Promise<TripwireRegistry> {
    const cleared: string[] = [];
    const registry = new TripwireRegistry(options, cleared);
    for (const [id, value] of options.store.list<TripRecord>(NAMESPACES.tripwires)) {
      if (typeof value.detail === "string" && typeof value.sinceMs === "number") registry.#tripped.set(id, value);
    }
    for (const id of options.acknowledge ?? []) {
      if (await registry.acknowledge(id)) cleared.push(id);
    }
    return registry;
  }

  isTripped(): boolean {
    return this.#tripped.size > 0;
  }

  snapshot(): TripwireSnapshot {
    const tripped = [...this.#tripped.entries()]
      .map(([id, record]) => ({ id, detail: record.detail, since: isoSecondOf(record.sinceMs) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { ok: tripped.length === 0, tripped };
  }

  // Latches a tripwire (durably) and raises one alert the first time. Returns true when newly tripped.
  async trip(finding: TripwireFinding): Promise<boolean> {
    if (!SLUG.test(finding.id)) throw new RelayError("internal", "A tripwire id must be a lower-case slug.");
    if (this.#tripped.has(finding.id)) return false;
    const detail = cleanText(finding.detail, 300);
    const record: TripRecord = { detail, sinceMs: this.#now() };
    await this.#store.set(NAMESPACES.tripwires, finding.id, record);
    this.#tripped.set(finding.id, record);
    await this.#audit?.write({ ev: "tripwire", code: finding.id, outcome: "refused", note: detail, sync: true });
    await this.#alerts?.raise({
      id: `tripwire_${finding.id}`.slice(0, 48),
      severity: "critical",
      message: `A pinned property changed (${finding.id}). The relay is read-only until the operator acknowledges it.`,
    });
    return true;
  }

  // The operator's act. Returns true if the tripwire existed.
  async acknowledge(id: string): Promise<boolean> {
    if (!this.#tripped.has(id)) return false;
    await this.#store.delete(NAMESPACES.tripwires, id);
    this.#tripped.delete(id);
    await this.#audit?.write({ ev: "tripwire", code: id, state: "acknowledged", outcome: "ok", sync: true });
    return true;
  }

  // Refuses while anything is tripped. Fixed text; the ids are in details.
  assertWritable(): void {
    if (this.#tripped.size === 0) return;
    throw new RelayError("tripwire", "A pinned on-chain property changed, so the relay is read-only until the operator acknowledges it.", {
      tripped: [...this.#tripped.keys()].sort(),
    });
  }

  // Runs the checkers (each with a time limit) and latches what they find.
  async recheck(checkers: readonly TripwireChecker[], options: { readonly timeoutMs?: number } = {}): Promise<RecheckResult> {
    const timeoutMs = options.timeoutMs ?? 5_000;
    const unverified: string[] = [];
    await Promise.all(
      checkers.map(async (checker) => {
        const controller = new AbortController();
        let timer: NodeJS.Timeout | undefined;
        try {
          const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("tripwire check timed out"));
            }, timeoutMs);
            timer.unref();
          });
          const finding = await Promise.race([checker.check(controller.signal), timeout]);
          if (finding !== undefined) await this.trip(finding);
        } catch {
          unverified.push(checker.id);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      }),
    );
    return { snapshot: this.snapshot(), unverified: unverified.sort() };
  }
}

declare module "./types.js" {
  interface RelayServices {
    readonly alerts?: AlertSink;
    readonly tripwires?: TripwireRegistry;
    readonly tripwireCheckers?: readonly TripwireChecker[];
  }
}
