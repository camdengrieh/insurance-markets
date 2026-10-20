import assert from "node:assert/strict";
import { test } from "node:test";
import { pinCheckFingerprint, verifyLegPins, type LiveLegState } from "../../links/pins.js";
import { sampleRegistry } from "./fixtures.js";

function liveFor(link: { legs: readonly { rulesSha256: string; maskedSha256: string; closeUtc: string; resolverId: string | null }[] }): LiveLegState[] {
  return link.legs.map((l) => ({
    rulesSha256: l.rulesSha256,
    maskedSha256: l.maskedSha256,
    closeUtc: l.closeUtc,
    resolverId: l.resolverId,
    status: "active",
  }));
}

test("matching live state passes", () => {
  const { registry } = sampleRegistry();
  for (const link of registry.links) assert.deepEqual(verifyLegPins(link, liveFor(link)), { ok: true });
});

test("a forced change to any pinned field on any leg suspends every approved link", () => {
  const { registry } = sampleRegistry();
  const approved = registry.links.filter((l) => l.state === "approved");
  assert.ok(approved.length >= 2);
  const fields: (keyof LiveLegState)[] = ["rulesSha256", "maskedSha256", "closeUtc", "status"];
  for (const link of approved) {
    for (let i = 0; i < link.legs.length; i++) {
      for (const field of fields) {
        const live = liveFor(link);
        live[i] = { ...live[i]!, [field]: field === "closeUtc" ? "2026-12-30T00:00:00Z" : field === "status" ? "closed" : "f".repeat(64) };
        const r = verifyLegPins(link, live);
        assert.equal(r.ok, false, `${link.linkId} leg ${i} ${field}`);
        if (!r.ok) assert.ok(r.reasons.some((x) => x.legIndex === i && x.field === field && x.code === "mismatch"));
      }
    }
  }
});

test("missing live values fail closed", () => {
  const { registry } = sampleRegistry();
  const link = registry.links[0]!;
  const live = liveFor(link);
  const r1 = verifyLegPins(link, [live[0]!]);
  assert.equal(r1.ok, false);
  const r2 = verifyLegPins(link, [live[0]!, undefined]);
  assert.equal(r2.ok, false);
  const r3 = verifyLegPins(link, [live[0]!, { ...live[1]!, rulesSha256: null }]);
  assert.equal(r3.ok, false);
  const r4 = verifyLegPins(link, [live[0]!, { ...live[1]!, status: null }]);
  assert.equal(r4.ok, false);
});

test("a pinned resolver must match; an unpinned one is not compared", () => {
  const { registry } = sampleRegistry();
  const link = registry.links[0]!;
  const pinned = { ...link, legs: link.legs.map((l, i) => (i === 0 ? { ...l, resolverId: "SYNTHETIC-resolver" } : l)) };
  const live = liveFor(pinned);
  assert.deepEqual(verifyLegPins(pinned, live), { ok: true });
  live[0] = { ...live[0]!, resolverId: "SYNTHETIC-other-resolver" };
  assert.equal(verifyLegPins(pinned, live).ok, false);
  live[0] = { ...live[0]!, resolverId: null };
  assert.equal(verifyLegPins(pinned, live).ok, false);
  // unpinned leg 1 ignores whatever the live side says
  const live2 = liveFor(link);
  live2[1] = { ...live2[1]!, resolverId: "SYNTHETIC-anything" };
  assert.deepEqual(verifyLegPins(link, live2), { ok: true });
});

test("status other than active is refused unless the caller widens it", () => {
  const { registry } = sampleRegistry();
  const link = registry.links[0]!;
  const live = liveFor(link).map((l) => ({ ...l, status: "paused" }));
  assert.equal(verifyLegPins(link, live).ok, false);
  assert.equal(verifyLegPins(link, live, { acceptableStatuses: ["active", "paused"] }).ok, true);
});

test("reasons name fields only and the fingerprint is stable", () => {
  const { registry } = sampleRegistry();
  const link = registry.links[0]!;
  const live = liveFor(link);
  live[0] = { ...live[0]!, rulesSha256: "a".repeat(64) };
  const r = verifyLegPins(link, live);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(r).includes("a".repeat(64)), false);
  assert.equal(pinCheckFingerprint(r), pinCheckFingerprint(verifyLegPins(link, live)));
  assert.equal(pinCheckFingerprint({ ok: true }), "ok");
});
