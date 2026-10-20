import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confidenceAllowsGate,
  freshness,
  gateUsable,
  parseIsoDate,
  readSection,
  sectionAgeMs,
  type Section,
  type SectionMeta,
} from "../../registry/staleness.js";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-19T00:00:00Z");

function meta(over: Partial<SectionMeta> = {}): SectionMeta {
  return {
    lastVerified: "2026-10-19",
    ttlDays: 30,
    verifiedBy: "test",
    method: "live_api",
    confidence: "H",
    verification: "verified",
    crossChecked: false,
    sources: ["docs/x.md"],
    ...over,
  };
}
const section = (m: SectionMeta): Section<string> => ({ meta: m, value: "v" });

test("parseIsoDate accepts real dates only", () => {
  assert.equal(parseIsoDate("2026-10-19"), T0);
  for (const bad of ["2026-02-30", "2026-13-01", "2026-1-1", "2026-10-19T00:00:00Z", "", "20261019"]) {
    assert.equal(parseIsoDate(bad), null, bad);
  }
});

test("freshness boundaries: fresh at ttl, stale up to 2x ttl, expired after", () => {
  const m = meta({ ttlDays: 10 });
  assert.equal(freshness(m, T0), "fresh");
  assert.equal(freshness(m, T0 + 10 * DAY), "fresh");
  assert.equal(freshness(m, T0 + 10 * DAY + 1), "stale");
  assert.equal(freshness(m, T0 + 20 * DAY), "stale");
  assert.equal(freshness(m, T0 + 20 * DAY + 1), "expired");
});

test("undatable, future-dated, bad ttl and non-finite clocks are expired (fail closed)", () => {
  assert.equal(freshness(meta({ lastVerified: "not-a-date" }), T0), "expired");
  assert.equal(freshness(meta(), T0 - 1), "expired");
  assert.equal(sectionAgeMs(meta(), T0 - 1), null);
  assert.equal(freshness(meta({ ttlDays: 0 }), T0), "expired");
  assert.equal(freshness(meta({ ttlDays: 1.5 }), T0), "expired");
  assert.equal(freshness(meta(), Number.NaN), "expired");
  assert.equal(freshness(meta(), Number.POSITIVE_INFINITY), "expired");
});

test("gate confidence: H verified passes; M needs a cross-check; L, D and vendor claims never pass", () => {
  assert.equal(confidenceAllowsGate(meta()), true);
  assert.equal(confidenceAllowsGate(meta({ confidence: "M", verification: "unverified" })), false);
  assert.equal(confidenceAllowsGate(meta({ confidence: "M", verification: "unverified", crossChecked: true })), true);
  assert.equal(confidenceAllowsGate(meta({ confidence: "L", verification: "unverified", crossChecked: true })), false);
  assert.equal(confidenceAllowsGate(meta({ confidence: "D", verification: "unverified", crossChecked: true })), false);
  assert.equal(confidenceAllowsGate(meta({ method: "vendor_claim", crossChecked: true })), false);
  // H that is not labelled verified does not pass either.
  assert.equal(confidenceAllowsGate(meta({ verification: "unverified" })), false);
});

test("gateUsable needs fresh and confident", () => {
  assert.equal(gateUsable(meta(), T0 + DAY), true);
  assert.equal(gateUsable(meta({ ttlDays: 1 }), T0 + 2 * DAY), false); // stale
  assert.equal(gateUsable(meta({ confidence: "L", verification: "unverified" }), T0), false);
});

test("readSection: display shows stale with age, hides expired", () => {
  const m = meta({ ttlDays: 10 });
  const fresh = readSection(section(m), "display", T0 + DAY);
  assert.equal(fresh.usable, true);
  assert.equal(fresh.label, "ok");
  const stale = readSection(section(m), "display", T0 + 15 * DAY);
  assert.equal(stale.usable, true);
  if (stale.usable) {
    assert.equal(stale.label, "degraded");
    assert.equal(stale.ageDays, 15);
  }
  const expired = readSection(section(m), "display", T0 + 25 * DAY);
  assert.equal(expired.usable, false);
  assert.equal(expired.value, null);
  assert.equal(expired.label, "unknown");
});

test("readSection: screen degrades stale, gate blocks stale and low confidence", () => {
  const m = meta({ ttlDays: 10 });
  const stale = T0 + 15 * DAY;
  assert.equal(readSection(section(m), "screen", stale).usable, true);
  const gate = readSection(section(m), "gate", stale);
  assert.equal(gate.usable, false);
  assert.equal(gate.value, null);
  const weak = meta({ confidence: "M", verification: "unverified" });
  const weakGate = readSection(section(weak), "gate", T0);
  assert.equal(weakGate.usable, false);
  assert.equal(readSection(section(weak), "display", T0).usable, true);
  assert.equal(readSection(section(m), "gate", T0).usable, true);
});
