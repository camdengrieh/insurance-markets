// Calibration logging helper (aggregation-design 7 and AGG-2): "log your own snapshots at fetch
// time and score against resolutions", because Quotient's as_of reads and CSV cannot prove there
// was no back-fill (research 12, section 7.4).
//
// Quotient's terms bar copying and redistributing its outputs, so this log keeps no Quotient
// forecast id, signal id, market key, question, thesis, quote or timestamp, and no probability
// field. It does keep, per snapshot:
//   - qMinusMid: Q's probability for the scored outcome minus OUR OWN mid,
//   - mid: our own book mid, and the resolved outcome (0 or 1) from the venue,
//   - coarse buckets (forecast age in whole hours, lead days, a sports flag),
//   - a one-way fingerprint of the forecast identity, used only to de-duplicate snapshots.
//
// HONEST LIMIT (TM-02): mid and qMinusMid together are exactly Q (q = mid + qMinusMid, which is how
// scoreLog rebuilds it). Scoring a Brier loss or a shrinkage weight needs Q, so the log cannot be
// non-invertible and still useful. Treat every record as containing Quotient's probability: the
// log is for the agent's own memory and the user's own internal calibration only, and must not be
// written to a shared file, committed, published or sent to a third party (LOG_HANDLING_NOTICE).
//
// The log is a plain JSON value that the AGENT holds and passes back in (the plugin keeps no state
// across calls); this module has no file or network access at all.

import { createHash } from "node:crypto";
import * as z from "zod/v4";
import { DEFAULTS } from "../core/edge.js";
import {
  ONE,
  ZERO,
  add,
  cmp,
  div,
  mul,
  rat,
  ratFromDec,
  ratFromInt,
  ratToDec,
  ratToDecExact,
  sub,
  type Rational,
} from "../core/rational.js";
import { VENUE_IDS } from "../types.js";

export const CALIBRATION_VERSION = 1;

// Shown wherever a log is handed to the agent.
export const LOG_HANDLING_NOTICE =
  "This log is reversible: each record's mid plus qMinusMid equals the Quotient probability. Keep it in the agent's own memory for your own calibration; do not write it to a shared file, commit, publish or send it to anyone.";
export const MAX_LOG_RECORDS = 2000;

const dec01 = z.string().regex(/^(0(\.[0-9]{1,18})?|1(\.0{1,18})?)$/);
const sdec = z.string().regex(/^-?(0|[1-9][0-9]{0,2})(\.[0-9]{1,18})?$/);

export const calibrationRecordSchema = z.strictObject({
  v: z.literal(CALIBRATION_VERSION),
  id: z.string().regex(/^[0-9a-f]{16}$/),
  recordedAtMs: z.int().min(0).max(8_640_000_000_000_000),
  venue: z.enum(VENUE_IDS),
  marketId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:\-]{0,199}$/),
  outcomeIndex: z.int().min(0).max(31),
  mid: dec01,
  qMinusMid: sdec,
  forecastAgeHours: z.int().min(0).max(100_000).nullable(),
  leadDays: z.int().min(0).max(100_000).nullable(),
  sports: z.boolean(),
  resolved: z.union([z.literal(0), z.literal(1)]).nullable(),
});
export type CalibrationRecord = z.infer<typeof calibrationRecordSchema>;

export const calibrationLogSchema = z.strictObject({
  version: z.literal(CALIBRATION_VERSION),
  records: z.array(calibrationRecordSchema).max(MAX_LOG_RECORDS),
});
export type CalibrationLog = z.infer<typeof calibrationLogSchema>;

export function emptyLog(): CalibrationLog {
  return { version: CALIBRATION_VERSION, records: [] };
}

export type LogError = "BAD_LOG" | "BAD_INPUT" | "LOG_FULL" | "UNKNOWN_ID" | "ALREADY_RESOLVED";
export type LogResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LogError; readonly detail: string };

// The agent passes the log back in as tool input: treat it as untrusted and validate it fully.
export function parseLog(input: unknown): LogResult<CalibrationLog> {
  const p = calibrationLogSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "BAD_LOG", detail: p.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "log"}: ${i.message}`).join("; ") };
  const ids = new Set(p.data.records.map((r) => r.id));
  if (ids.size !== p.data.records.length) return { ok: false, error: "BAD_LOG", detail: "duplicate record id" };
  return { ok: true, value: p.data };
}

// Deterministic JSON for the agent to hold. Contains derived numbers only.
export function serializeLog(log: CalibrationLog): string {
  return JSON.stringify({ version: log.version, records: log.records.map((r) => orderRecord(r)) });
}

function orderRecord(r: CalibrationRecord): CalibrationRecord {
  return {
    v: r.v,
    id: r.id,
    recordedAtMs: r.recordedAtMs,
    venue: r.venue,
    marketId: r.marketId,
    outcomeIndex: r.outcomeIndex,
    mid: r.mid,
    qMinusMid: r.qMinusMid,
    forecastAgeHours: r.forecastAgeHours,
    leadDays: r.leadDays,
    sports: r.sports,
    resolved: r.resolved,
  };
}

export interface SnapshotInput {
  // Parts that identify the forecast (for example market key, forecast id, created_at). They are
  // hashed into a short one-way fingerprint and then discarded.
  readonly fingerprintParts: readonly string[];
  // The market in OUR venue whose outcome is being scored (an XO market, usually).
  readonly target: { readonly venue: (typeof VENUE_IDS)[number]; readonly marketId: string; readonly outcomeIndex: number };
  // Q's probability for that same outcome, as returned by the link join. Used once, not stored.
  readonly qForOutcome: string;
  // Our own book mid for the same outcome, at fetch time.
  readonly ownMid: string;
  readonly forecastAgeMs: number | null;
  // Time from now until the target market's own close, in ms.
  readonly leadMs: number | null;
  readonly sports: boolean;
  readonly recordedAtMs: number;
}

function toDec01(value: string): Rational | null {
  const r = ratFromDec(value);
  return r.ok && cmp(r.value, ONE) <= 0 ? r.value : null;
}

function signed(r: Rational): string {
  const neg = r.n < 0n;
  const t = ratToDecExact(neg ? { n: -r.n, d: r.d } : r);
  return t === null ? "0" : neg ? `-${t}` : t;
}

export function snapshotId(input: Pick<SnapshotInput, "fingerprintParts" | "target">): string {
  const fp = createHash("sha256").update(input.fingerprintParts.join("\u0000"), "utf8").digest("hex");
  return createHash("sha256")
    .update(`snap\u0000${fp}\u0000${input.target.venue}\u0000${input.target.marketId}\u0000${input.target.outcomeIndex}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

export function logSnapshot(
  log: CalibrationLog,
  input: SnapshotInput,
): LogResult<{ readonly log: CalibrationLog; readonly id: string; readonly duplicate: boolean }> {
  const q = toDec01(input.qForOutcome);
  const mid = toDec01(input.ownMid);
  if (q === null || mid === null) return { ok: false, error: "BAD_INPUT", detail: "qForOutcome and ownMid must be decimals between 0 and 1" };
  if (input.fingerprintParts.length === 0 || input.fingerprintParts.some((p) => p.length === 0 || p.length > 400)) {
    return { ok: false, error: "BAD_INPUT", detail: "fingerprintParts must be 1 or more non-empty strings" };
  }
  const id = snapshotId(input);
  if (log.records.some((r) => r.id === id)) return { ok: true, value: { log, id, duplicate: true } };
  if (log.records.length >= MAX_LOG_RECORDS) return { ok: false, error: "LOG_FULL", detail: `log holds at most ${MAX_LOG_RECORDS} records; score and prune it` };
  const midText = ratToDecExact(mid);
  if (midText === null) return { ok: false, error: "BAD_INPUT", detail: "ownMid is not an exact decimal" };
  const hours = input.forecastAgeMs === null ? null : Math.floor(Math.max(0, input.forecastAgeMs) / 3_600_000);
  const days = input.leadMs === null ? null : Math.floor(Math.max(0, input.leadMs) / 86_400_000);
  const record: CalibrationRecord = {
    v: CALIBRATION_VERSION,
    id,
    recordedAtMs: input.recordedAtMs,
    venue: input.target.venue,
    marketId: input.target.marketId,
    outcomeIndex: input.target.outcomeIndex,
    mid: midText,
    qMinusMid: signed(sub(q, mid)),
    forecastAgeHours: hours,
    leadDays: days,
    sports: input.sports,
    resolved: null,
  };
  const checked = calibrationRecordSchema.safeParse(record);
  if (!checked.success) return { ok: false, error: "BAD_INPUT", detail: "snapshot fields are out of range" };
  return { ok: true, value: { log: { version: log.version, records: [...log.records, checked.data] }, id, duplicate: false } };
}

// Records the venue's own resolution of the scored outcome (1 happened, 0 did not).
export function recordResolution(log: CalibrationLog, id: string, outcome: 0 | 1): LogResult<CalibrationLog> {
  const idx = log.records.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, error: "UNKNOWN_ID", detail: "no snapshot with that id" };
  const rec = log.records[idx] as CalibrationRecord;
  if (rec.resolved !== null) return { ok: false, error: "ALREADY_RESOLVED", detail: "resolution is recorded once and never overwritten" };
  const records = log.records.map((r, i) => (i === idx ? { ...r, resolved: outcome } : r));
  return { ok: true, value: { version: log.version, records } };
}

export interface ScoreOptions {
  // Only score snapshots taken at least this many whole days before the target market closed
  // (Quotient shows no edge distinguishable from zero in the last day).
  readonly minLeadDays?: number;
  readonly includeSports?: boolean;
}

export interface Score {
  readonly snapshots: number;
  readonly resolved: number;
  readonly scored: number;
  // Mean Brier score of the market mid and of Q, and market minus Q (positive means Q was better).
  readonly brierMarket: string | null;
  readonly brierQ: string | null;
  readonly advantage: string | null;
  // Least-squares shrinkage of Q toward the mid: lambda = sum((o-m)(q-m)) / sum((q-m)^2).
  readonly lambdaRaw: string | null;
  readonly lambdaUsed: string;
  readonly lambdaBasis: "default_until_200_resolved" | "estimated_clamped_0_1" | "default_no_variation";
  readonly note: string;
}

export const MIN_RESOLVED_FOR_LAMBDA = DEFAULTS.minResolvedForecastsForLambda;

export function scoreLog(log: CalibrationLog, options: ScoreOptions = {}): Score {
  const resolved = log.records.filter((r) => r.resolved !== null);
  const scored = resolved.filter(
    (r) => (options.includeSports === true || !r.sports) && (options.minLeadDays === undefined || (r.leadDays !== null && r.leadDays >= options.minLeadDays)),
  );
  const n = scored.length;
  const defaultLambda = ratToDec(DEFAULTS.lambdaQ, 6, "half_up");
  if (n === 0) {
    return {
      snapshots: log.records.length,
      resolved: resolved.length,
      scored: 0,
      brierMarket: null,
      brierQ: null,
      advantage: null,
      lambdaRaw: null,
      lambdaUsed: defaultLambda,
      lambdaBasis: "default_until_200_resolved",
      note: "No resolved snapshots in scope; the default shrinkage applies.",
    };
  }
  let bm = ZERO;
  let bq = ZERO;
  let num = ZERO;
  let den = ZERO;
  for (const r of scored) {
    const m = ratFromDec(r.mid);
    const d = ratFromDec(r.qMinusMid.replace(/^-/, ""));
    if (!m.ok || !d.ok) continue;
    const diff = r.qMinusMid.startsWith("-") ? { n: -d.value.n, d: d.value.d } : d.value;
    const o = ratFromInt(r.resolved as 0 | 1);
    const q = add(m.value, diff);
    bm = add(bm, mul(sub(m.value, o), sub(m.value, o)));
    bq = add(bq, mul(sub(q, o), sub(q, o)));
    num = add(num, mul(sub(o, m.value), diff));
    den = add(den, mul(diff, diff));
  }
  const count = rat(BigInt(n));
  const meanM = div(bm, count);
  const meanQ = div(bq, count);
  const raw = cmp(den, ZERO) === 0 ? null : div(num, den);
  const clamped = raw === null ? null : cmp(raw, ZERO) < 0 ? ZERO : cmp(raw, ONE) > 0 ? ONE : raw;
  const enough = n >= MIN_RESOLVED_FOR_LAMBDA;
  const lambdaBasis: Score["lambdaBasis"] = !enough ? "default_until_200_resolved" : clamped === null ? "default_no_variation" : "estimated_clamped_0_1";
  const used = enough && clamped !== null ? clamped : DEFAULTS.lambdaQ;
  return {
    snapshots: log.records.length,
    resolved: resolved.length,
    scored: n,
    brierMarket: ratToDec(meanM, 6, "half_up"),
    brierQ: ratToDec(meanQ, 6, "half_up"),
    advantage: ratToDec(sub(meanM, meanQ), 6, "half_up"),
    lambdaRaw: raw === null ? null : ratToDec(raw, 4, "half_up"),
    lambdaUsed: ratToDec(used, 4, "half_up"),
    lambdaBasis,
    note: enough
      ? "Estimated from your own logged snapshots; it is a noisy estimate and a clamped one."
      : `Fewer than ${MIN_RESOLVED_FOR_LAMBDA} scored resolved snapshots: the default shrinkage ${defaultLambda} still applies, whatever the estimate says.`,
  };
}
