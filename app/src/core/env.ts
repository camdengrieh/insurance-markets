// The browser's side of the injected dependencies, and the one call the shell makes to get an adapter's
// `deps` (ports.ts AdapterDeps). Everything that touches a global lives in createBrowserEnv() and is read
// lazily, so importing this module in a test or a worker touches nothing.

import { HostBudgets, VenuePauses, type Clock } from "./budget";
import type { TimerApi } from "./cache";
import { createGuardedFetch, type GuardedFetch, type RawFetch } from "./fetch";
import { createAppFetch, type AppBuildMode } from "./fetch-cockpit";
import type { AdapterDeps } from "./ports";

export interface Env {
  readonly rawFetch: RawFetch;
  readonly timers: TimerApi;
  readonly nowMs: Clock;
  readonly sleep: (ms: number) => Promise<void>;
  // [0, 1), for backoff jitter only. Not for anything secret.
  readonly random: () => number;
}

export function createBrowserEnv(): Env {
  const timers: TimerApi = {
    setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  return {
    rawFetch: (input, init) => globalThis.fetch(input, init),
    timers,
    nowMs: () => Date.now(),
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        timers.setTimeout(resolve, ms);
      }),
    random: () => Math.random(),
  };
}

export interface AdapterDepsOptions {
  readonly mode: AppBuildMode;
  // The Cockpit's ui token, read at call time. Ignored by the standalone build.
  readonly getToken?: () => string | null;
  readonly env?: Env;
  readonly budgets?: HostBudgets;
  readonly pauses?: VenuePauses;
  readonly timeoutMs?: number;
}

export interface BuiltDeps extends AdapterDeps {
  // The guarded port, for the settings screen (pauses, budgets) and for tests.
  readonly guarded: GuardedFetch;
}

// The port for this build (direct or through the daemon), wrapped with the per-host budget, the R9 pause and
// Retry-After handling, plus the clock. One instance per page: the budgets and pauses it holds are the page's.
export function createAdapterDeps(options: AdapterDepsOptions): BuiltDeps {
  const env = options.env ?? createBrowserEnv();
  const inner = createAppFetch({
    mode: options.mode,
    rawFetch: env.rawFetch,
    timers: env.timers,
    getToken: options.getToken ?? (() => null),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const guarded = createGuardedFetch({
    inner,
    nowMs: env.nowMs,
    sleep: env.sleep,
    budgets: options.budgets ?? new HostBudgets(env.nowMs),
    pauses: options.pauses ?? new VenuePauses(),
  });
  return { fetch: guarded, nowMs: env.nowMs, guarded };
}
