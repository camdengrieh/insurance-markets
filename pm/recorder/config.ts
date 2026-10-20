// Recorder configuration: closed schema, conservative defaults, hard ceilings.
//
// Per-host budgets stay well below each venue's documented limits (docs/research/02, 08, 09), and
// a configured budget above the ceiling is refused rather than clamped, so an operator notices.
// Hosts and venues come from allowlist.ts; they cannot be added here.

import * as z from "zod/v4";
import { ALL_RECORDABLE_HOSTS, RECORDABLE_VENUES, isRecordableVenue, refusalReason, type RecVenue } from "./allowlist.js";

export interface HostBudget {
  // Sustained requests per second.
  readonly rps: number;
  readonly burst: number;
  readonly maxPerHour: number;
}

// Default budgets and the ceilings (about half the documented public limits).
export const HOST_DEFAULTS: Readonly<Record<string, HostBudget>> = {
  "orderbooks.xo.market": { rps: 2, burst: 2, maxPerHour: 6000 }, // documented 5 rps
  "api-mainnet.xo.market": { rps: 1, burst: 2, maxPerHour: 3000 },
  "gamma-api.polymarket.com": { rps: 2, burst: 4, maxPerHour: 6000 }, // documented 300 to 900 per 10 s
  "clob.polymarket.com": { rps: 5, burst: 5, maxPerHour: 15000 }, // documented 1,500 per 10 s for /book
  "api.limitless.exchange": { rps: 2, burst: 2, maxPerHour: 4000 }, // numeric limit NOT FOUND: stay low
};
export const HOST_CEILINGS: Readonly<Record<string, HostBudget>> = {
  "orderbooks.xo.market": { rps: 3, burst: 5, maxPerHour: 10000 },
  "api-mainnet.xo.market": { rps: 2, burst: 4, maxPerHour: 6000 },
  "gamma-api.polymarket.com": { rps: 10, burst: 20, maxPerHour: 30000 },
  "clob.polymarket.com": { rps: 20, burst: 40, maxPerHour: 60000 },
  "api.limitless.exchange": { rps: 4, burst: 8, maxPerHour: 8000 },
};

export const MIN_INTERVAL_SEC = 60;

const posInt = z.number().int().positive();
const budgetSchema = z.strictObject({
  rps: z.number().positive(),
  burst: z.number().int().min(1).max(100),
  maxPerHour: posInt,
});

const loopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/;

export const configSchema = z.strictObject({
  dbPath: z.string().min(1).max(512).default("pm/recorder/data/recorder.sqlite"),
  venues: z.array(z.string()).default([...RECORDABLE_VENUES]),
  // Regular cadence, and the faster cadence for markets closing within shortHorizonSec.
  intervalSec: z.number().int().min(MIN_INTERVAL_SEC).default(3600),
  shortIntervalSec: z.number().int().min(MIN_INTERVAL_SEC).default(300),
  shortHorizonSec: posInt.default(72 * 3600),
  resolveIntervalSec: z.number().int().min(MIN_INTERVAL_SEC).default(3600),
  shortResolveIntervalSec: z.number().int().min(MIN_INTERVAL_SEC).default(900),
  // Polling stops this long after a market's close.
  postCloseGraceSec: z.number().int().min(0).default(6 * 3600),
  depthLevels: z.number().int().min(1).max(200).default(20),
  maxTargets: z.number().int().min(1).max(20000).default(2000),
  retentionDays: z.number().int().min(7).max(3650).default(45),
  maxDbBytes: z.number().int().min(1_000_000).default(2 * 1024 ** 3),
  // A gap is flagged when consecutive snapshots are more than gapFactor intervals apart.
  gapFactor: z.number().min(1.5).max(20).default(2.5),
  // Stop starting new jobs in a tick after this long; leftovers stay due.
  maxTickMs: posInt.default(10 * 60_000),
  loopTickSec: z.number().int().min(1).max(600).default(15),
  skewLogEverySec: z.number().int().min(10).default(300),
  skewWarnMs: z.number().int().min(100).default(1500),
  requestTimeoutMs: z.number().int().min(500).max(120_000).default(15_000),
  maxBodyBytes: z.number().int().min(1024).max(32 * 1024 * 1024).default(4 * 1024 * 1024),
  backoff: z
    .strictObject({
      baseMs: posInt.default(1000),
      maxMs: posInt.default(300_000),
      factor: z.number().min(1.1).max(10).default(2),
      jitter: z.number().min(0).max(0.9).default(0.2),
      maxAttempts: z.number().int().min(1).max(8).default(4),
    })
    .default({ baseMs: 1000, maxMs: 300_000, factor: 2, jitter: 0.2, maxAttempts: 4 }),
  breaker: z
    .strictObject({ failures: z.number().int().min(1).max(100).default(5), cooldownMs: posInt.default(600_000) })
    .default({ failures: 5, cooldownMs: 600_000 }),
  hostBudgets: z.record(z.string(), budgetSchema).default({}),
  // Test hook: send a host's requests to a loopback server instead. Anything but a loopback
  // http origin is refused, so this cannot redirect traffic to a third party.
  hostBases: z.record(z.string(), z.string()).default({}),
});
export type RecorderConfig = Omit<z.infer<typeof configSchema>, "venues" | "hostBudgets"> & {
  readonly venues: readonly RecVenue[];
  // Fully resolved for every allowed host (defaults merged in).
  readonly hostBudgets: Readonly<Record<string, HostBudget>>;
};

export type ConfigResult = { readonly ok: true; readonly value: RecorderConfig } | { readonly ok: false; readonly errors: string[] };

export function parseConfig(input: unknown): ConfigResult {
  const parsed = configSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  const c = parsed.data;
  const errors: string[] = [];

  const venues: RecVenue[] = [];
  for (const v of c.venues) {
    if (!isRecordableVenue(v)) errors.push(`venue "${v.slice(0, 40)}" refused: ${refusalReason(v)}`);
    else if (!venues.includes(v)) venues.push(v);
  }
  if (venues.length === 0 && errors.length === 0) errors.push("at least one venue is required");

  const budgets: Record<string, HostBudget> = {};
  for (const host of ALL_RECORDABLE_HOSTS) budgets[host] = HOST_DEFAULTS[host] as HostBudget;
  for (const [host, b] of Object.entries(c.hostBudgets)) {
    const ceiling = HOST_CEILINGS[host];
    if (ceiling === undefined) {
      errors.push(`hostBudgets.${host.slice(0, 60)}: host is not on the recorder allowlist`);
      continue;
    }
    if (b.rps > ceiling.rps || b.burst > ceiling.burst || b.maxPerHour > ceiling.maxPerHour) {
      errors.push(`hostBudgets.${host}: above the ceiling (${ceiling.rps} rps, burst ${ceiling.burst}, ${ceiling.maxPerHour}/h)`);
      continue;
    }
    budgets[host] = b;
  }
  for (const [host, base] of Object.entries(c.hostBases)) {
    if (!ALL_RECORDABLE_HOSTS.includes(host)) errors.push(`hostBases.${host.slice(0, 60)}: host is not on the recorder allowlist`);
    else if (!loopback.test(base)) errors.push(`hostBases.${host}: only a loopback http origin (127.0.0.1, localhost, [::1]) is accepted`);
  }
  if (c.shortIntervalSec > c.intervalSec) errors.push("shortIntervalSec must not exceed intervalSec");
  if (c.shortResolveIntervalSec > c.resolveIntervalSec) errors.push("shortResolveIntervalSec must not exceed resolveIntervalSec");
  if (c.backoff.baseMs > c.backoff.maxMs) errors.push("backoff.baseMs must not exceed backoff.maxMs");
  if (/^\s*$/.test(c.dbPath) || c.dbPath.includes("\0")) errors.push("dbPath is invalid");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { ...c, venues, hostBudgets: budgets } };
}

export function mustConfig(input: unknown): RecorderConfig {
  const r = parseConfig(input);
  if (!r.ok) throw new Error(`invalid recorder config: ${r.errors.join("; ")}`);
  return r.value;
}
