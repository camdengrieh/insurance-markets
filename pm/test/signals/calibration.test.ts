import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOG_HANDLING_NOTICE,
  MAX_LOG_RECORDS,
  emptyLog,
  logSnapshot,
  parseLog,
  recordResolution,
  scoreLog,
  serializeLog,
  snapshotId,
  type CalibrationLog,
  type SnapshotInput,
} from "../../signals/index.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function snap(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    fingerprintParts: ["polymarket:SYNTHETIC-1001", "SYN-FORECAST-ID-1", "2026-10-20T06:00:00Z"],
    target: { venue: "xo", marketId: "SYNTHETIC-xo-0001", outcomeIndex: 0 },
    qForOutcome: "0.62",
    ownMid: "0.55",
    forecastAgeMs: 6 * HOUR + 1234,
    leadMs: 5 * DAY + 5 * HOUR,
    sports: false,
    recordedAtMs: 1_760_961_600_000,
    ...overrides,
  };
}

function add(log: CalibrationLog, input: SnapshotInput): { log: CalibrationLog; id: string } {
  const r = logSnapshot(log, input);
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) throw new Error("unreachable");
  return { log: r.value.log, id: r.value.id };
}

describe("snapshot logging stores derived numbers only", () => {
  it("TM-02: the log is reversible and says so: q = mid + qMinusMid, so it is agent memory only", () => {
    const { log } = add(emptyLog(), snap());
    const rec = log.records[0]!;
    assert.equal(rec.mid, "0.55");
    assert.equal(rec.qMinusMid, "0.07");
    // 0.55 + 0.07 = 0.62, the probability that was passed in.
    assert.equal(snap().qForOutcome, "0.62");
    assert.match(LOG_HANDLING_NOTICE, /reversible/);
    assert.match(LOG_HANDLING_NOTICE, /mid plus qMinusMid equals the Quotient probability/);
    assert.match(LOG_HANDLING_NOTICE, /own memory/);
    assert.match(LOG_HANDLING_NOTICE, /do not write it/);
  });

  it("records the difference to our own mid, not Quotient's probability or identifiers", () => {
    const { log } = add(emptyLog(), snap());
    const rec = log.records[0];
    assert.deepEqual(
      { ...rec, id: "x" },
      {
        v: 1,
        id: "x",
        recordedAtMs: 1_760_961_600_000,
        venue: "xo",
        marketId: "SYNTHETIC-xo-0001",
        outcomeIndex: 0,
        mid: "0.55",
        qMinusMid: "0.07",
        forecastAgeHours: 6,
        leadDays: 5,
        sports: false,
        resolved: null,
      },
    );
    const text = serializeLog(log);
    for (const forbidden of ["0.62", "SYN-FORECAST-ID-1", "polymarket:SYNTHETIC-1001", "2026-10-20T06:00:00Z", "quotient", "thesis", "question", "marketKey"]) {
      assert.equal(text.includes(forbidden), false, forbidden);
    }
  });

  it("keeps a negative difference signed", () => {
    const { log } = add(emptyLog(), snap({ qForOutcome: "0.4", ownMid: "0.55" }));
    assert.equal(log.records[0]?.qMinusMid, "-0.15");
  });

  it("de-duplicates the same forecast for the same target and does not mutate the log", () => {
    const first = add(emptyLog(), snap());
    const again = logSnapshot(first.log, snap({ recordedAtMs: 1_760_961_900_000 }));
    assert.ok(again.ok);
    if (!again.ok) throw new Error("unreachable");
    assert.equal(again.value.duplicate, true);
    assert.equal(again.value.log.records.length, 1);
    const other = add(first.log, snap({ fingerprintParts: ["polymarket:SYNTHETIC-1001", "SYN-FORECAST-ID-2", "2026-10-20T09:00:00Z"] }));
    assert.equal(other.log.records.length, 2);
    assert.equal(first.log.records.length, 1);
  });

  it("is deterministic and id depends on forecast and target only", () => {
    const a = snapshotId(snap());
    assert.equal(a, snapshotId(snap({ recordedAtMs: 5 })));
    assert.notEqual(a, snapshotId(snap({ target: { venue: "xo", marketId: "SYNTHETIC-xo-0001", outcomeIndex: 1 } })));
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it("refuses bad probabilities, empty fingerprints and a full log", () => {
    for (const bad of [{ qForOutcome: "1.5" }, { ownMid: "-0.1" }, { ownMid: "abc" }, { qForOutcome: "0.5e1" }, { fingerprintParts: [] }, { fingerprintParts: [""] }]) {
      const r = logSnapshot(emptyLog(), snap(bad));
      assert.equal(r.ok, false, JSON.stringify(bad));
      if (r.ok) throw new Error("unreachable");
      assert.equal(r.error, "BAD_INPUT");
    }
    const r = logSnapshot(emptyLog(), snap({ target: { venue: "xo", marketId: "bad id with spaces", outcomeIndex: 0 } }));
    assert.equal(r.ok, false);
    let log = emptyLog();
    log = { version: 1, records: Array.from({ length: MAX_LOG_RECORDS }, (_, i) => ({ ...(add(emptyLog(), snap({ fingerprintParts: [`f${i}`] })).log.records[0] as CalibrationLog["records"][number]) })) };
    const full = logSnapshot(log, snap({ fingerprintParts: ["one-more"] }));
    assert.ok(!full.ok && full.error === "LOG_FULL");
  });

  it("buckets unknown age and lead as null, not zero", () => {
    const { log } = add(emptyLog(), snap({ forecastAgeMs: null, leadMs: null }));
    assert.equal(log.records[0]?.forecastAgeHours, null);
    assert.equal(log.records[0]?.leadDays, null);
  });
});

describe("log validation (the agent hands it back, so it is untrusted)", () => {
  it("round-trips through JSON", () => {
    const { log } = add(emptyLog(), snap());
    const parsed = parseLog(JSON.parse(serializeLog(log)));
    assert.ok(parsed.ok);
    if (!parsed.ok) throw new Error("unreachable");
    assert.deepEqual(parsed.value, log);
  });

  it("rejects extra fields, so raw Quotient fields cannot be smuggled back into the log", () => {
    const { log } = add(emptyLog(), snap());
    const rec = log.records[0] as object;
    for (const extra of [{ q: "0.62" }, { marketKey: "polymarket:1" }, { thesis: "x" }, { forecastId: "abc" }]) {
      const r = parseLog({ version: 1, records: [{ ...rec, ...extra }] });
      assert.equal(r.ok, false, JSON.stringify(extra));
    }
    assert.equal(parseLog({ version: 1, records: [], extra: 1 }).ok, false);
  });

  it("rejects bad versions, ids, venues, scales and duplicate ids", () => {
    const { log } = add(emptyLog(), snap());
    const rec = log.records[0] as CalibrationLog["records"][number];
    const bads: unknown[] = [
      null,
      { version: 2, records: [] },
      { version: 1, records: [{ ...rec, id: "XYZ" }] },
      { version: 1, records: [{ ...rec, venue: "nowhere" }] },
      { version: 1, records: [{ ...rec, mid: "1.5" }] },
      { version: 1, records: [{ ...rec, qMinusMid: "1e-3" }] },
      { version: 1, records: [{ ...rec, resolved: 2 }] },
      { version: 1, records: [rec, rec] },
    ];
    for (const b of bads) assert.equal(parseLog(b).ok, false, JSON.stringify(b));
  });
});

describe("resolution", () => {
  it("records once and never overwrites", () => {
    const { log, id } = add(emptyLog(), snap());
    const r = recordResolution(log, id, 1);
    assert.ok(r.ok);
    if (!r.ok) throw new Error("unreachable");
    assert.equal(r.value.records[0]?.resolved, 1);
    assert.equal(log.records[0]?.resolved, null);
    const again = recordResolution(r.value, id, 0);
    assert.ok(!again.ok && again.error === "ALREADY_RESOLVED");
    const unknown = recordResolution(log, "0".repeat(16), 1);
    assert.ok(!unknown.ok && unknown.error === "UNKNOWN_ID");
  });
});

// 200 snapshots at mid 0.5. d = +0.1 for 100 (55 resolve YES), d = -0.1 for 100 (45 resolve YES).
// sum((o-m)d) = 1.0, sum(d^2) = 2.0, so lambda = 0.5 exactly; Q and market Brier are 0.25 and 0.25.
function synthetic(n: number): CalibrationLog {
  let log = emptyLog();
  const half = n / 2;
  for (let i = 0; i < n; i++) {
    const up = i < half;
    const k = up ? i : i - half;
    const q = up ? "0.6" : "0.4";
    const yesCount = Math.round(half * (up ? 0.55 : 0.45));
    const s = add(log, snap({ fingerprintParts: [`fp-${i}`], qForOutcome: q, ownMid: "0.5", leadMs: 3 * DAY }));
    const r = recordResolution(s.log, s.id, k < yesCount ? 1 : 0);
    assert.ok(r.ok);
    if (!r.ok) throw new Error("unreachable");
    log = r.value;
  }
  return log;
}

describe("scoring and shrinkage", () => {
  it("estimates lambda exactly from 200 resolved snapshots", () => {
    const score = scoreLog(synthetic(200));
    assert.equal(score.scored, 200);
    assert.equal(score.lambdaRaw, "0.5");
    assert.equal(score.lambdaUsed, "0.5");
    assert.equal(score.lambdaBasis, "estimated_clamped_0_1");
    assert.equal(score.brierMarket, "0.25");
    assert.equal(score.brierQ, "0.25");
    assert.equal(score.advantage, "0");
  });

  it("keeps the default 0.25 below 200 resolved snapshots, whatever the estimate says", () => {
    const score = scoreLog(synthetic(198));
    assert.equal(score.scored, 198);
    assert.notEqual(score.lambdaRaw, null);
    assert.equal(score.lambdaRaw, "0.4545"); // 54 and 45 of 99: sum((o-m)d)/sum(d^2) = 0.9/1.98
    assert.equal(score.lambdaUsed, "0.25");
    assert.equal(score.lambdaBasis, "default_until_200_resolved");
    assert.match(score.note, /default shrinkage/);
  });

  it("reports no score and the default when nothing has resolved", () => {
    const { log } = add(emptyLog(), snap());
    const s = scoreLog(log);
    assert.equal(s.scored, 0);
    assert.equal(s.brierQ, null);
    assert.equal(s.advantage, null);
    assert.equal(s.lambdaUsed, "0.25");
  });

  it("computes small-sample Brier scores exactly", () => {
    // mid 0.5, q 0.75, resolved YES: market 0.25, Q 0.0625; second: q 0.25 resolved YES: Q 0.5625.
    let log = emptyLog();
    for (const [i, q] of [[0, "0.75"], [1, "0.25"]] as const) {
      const s = add(log, snap({ fingerprintParts: [`s${i}`], qForOutcome: q, ownMid: "0.5" }));
      const r = recordResolution(s.log, s.id, 1);
      assert.ok(r.ok);
      if (!r.ok) throw new Error("unreachable");
      log = r.value;
    }
    const s = scoreLog(log);
    assert.equal(s.brierMarket, "0.25");
    assert.equal(s.brierQ, "0.3125");
    assert.equal(s.advantage, "-0.0625");
  });

  it("excludes sports and short-lead snapshots unless asked", () => {
    let log = emptyLog();
    const inputs: [string, Partial<SnapshotInput>][] = [
      ["a", { leadMs: 3 * DAY }],
      ["b", { leadMs: 3 * HOUR }],
      ["c", { sports: true, leadMs: 3 * DAY }],
      ["d", { leadMs: null }],
    ];
    for (const [name, o] of inputs) {
      const s = add(log, snap({ fingerprintParts: [name], ...o }));
      const r = recordResolution(s.log, s.id, 1);
      assert.ok(r.ok);
      if (!r.ok) throw new Error("unreachable");
      log = r.value;
    }
    assert.equal(scoreLog(log).scored, 3);
    assert.equal(scoreLog(log, { includeSports: true }).scored, 4);
    assert.equal(scoreLog(log, { minLeadDays: 2 }).scored, 1);
    assert.equal(scoreLog(log, { minLeadDays: 2, includeSports: true }).scored, 2);
  });

  it("clamps a negative estimate to zero and falls back when there is no variation", () => {
    let neg = emptyLog();
    for (let i = 0; i < 200; i++) {
      const s = add(neg, snap({ fingerprintParts: [`n${i}`], qForOutcome: "0.6", ownMid: "0.5", leadMs: 3 * DAY }));
      const r = recordResolution(s.log, s.id, 0); // Q always wrong
      assert.ok(r.ok);
      if (!r.ok) throw new Error("unreachable");
      neg = r.value;
    }
    const sn = scoreLog(neg);
    assert.equal(sn.lambdaRaw, "-5");
    assert.equal(sn.lambdaUsed, "0");
    let flat = emptyLog();
    for (let i = 0; i < 200; i++) {
      const s = add(flat, snap({ fingerprintParts: [`z${i}`], qForOutcome: "0.5", ownMid: "0.5", leadMs: 3 * DAY }));
      const r = recordResolution(s.log, s.id, 1);
      assert.ok(r.ok);
      if (!r.ok) throw new Error("unreachable");
      flat = r.value;
    }
    const sf = scoreLog(flat);
    assert.equal(sf.lambdaRaw, null);
    assert.equal(sf.lambdaBasis, "default_no_variation");
    assert.equal(sf.lambdaUsed, "0.25");
  });
});
