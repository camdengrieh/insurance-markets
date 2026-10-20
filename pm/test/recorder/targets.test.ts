import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBundle, serializeBundle } from "../../links/bundle.js";
import { emptyRegistry } from "../../links/store.js";
import { loadTargets, targetsFromBundle, targetsFromFile, MARKET_ID } from "../../recorder/targets.js";
import { approve, complementCandidate, identityCandidate, leg, propose } from "../links/fixtures.js";
import { suspendLink } from "../../links/store.js";
import { tempDir } from "./helpers.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

function bundleText(build: (reg: ReturnType<typeof emptyRegistry>) => ReturnType<typeof emptyRegistry>, includeCandidates = true): { text: string; pin: string } {
  const reg = build(emptyRegistry());
  const b = buildBundle(reg, { createdAt: "2026-10-20T00:00:00Z", includeCandidates });
  assert.equal(b.ok, true);
  if (!b.ok) throw new Error("bundle");
  return { text: serializeBundle(b.value), pin: b.value.manifestSha256 };
}

test("approved and candidate links become targets with orientation and close hints", () => {
  const { text, pin } = bundleText((r0) => {
    let r = propose(r0, identityCandidate("0001")).registry;
    r = propose(r, complementCandidate("0020")).registry;
    return r;
  });
  const t = targetsFromBundle(text, { expectedManifestSha256: pin, allowSynthetic: true });
  assert.equal(t.ok, true);
  if (!t.ok) return;
  assert.equal(t.value.links.length, 2);
  assert.deepEqual(t.value.targets.map((x) => x.key).sort(), ["polymarket:SYNTHETIC-poly-0001", "xo:SYNTHETIC-xo-0001", "xo:SYNTHETIC-xo-0020-a", "xo:SYNTHETIC-xo-0020-b"]);
  const comp = t.value.links.find((l) => l.relation === "complement");
  assert.deepEqual(comp?.legs.map((l) => l.flip), [false, true], "outcomeMap [1,0] means leg B lists the opposite outcome first");
  assert.ok(t.value.targets.every((x) => x.closeHintMs === Date.parse("2026-12-31T23:59:00Z")));
});

test("candidates can be excluded; suspended and revoked links are never recorded", () => {
  const { text, pin } = bundleText((r0) => {
    const a = propose(r0, identityCandidate("0001"));
    const approved = approve(a.registry, a.link.linkId);
    const b = propose(approved, identityCandidate("0002"));
    const c = propose(b.registry, identityCandidate("0003"));
    const sus = suspendLink(approve(c.registry, c.link.linkId), c.link.linkId, "reviewer-a", "synthetic: stand down", { today: "2026-10-20" });
    assert.ok(sus.ok);
    return sus.ok ? sus.value : approved;
  });
  const opts = { expectedManifestSha256: pin, allowSynthetic: true };
  const all = targetsFromBundle(text, opts);
  const approvedOnly = targetsFromBundle(text, { ...opts, includeCandidates: false });
  assert.ok(all.ok && approvedOnly.ok);
  if (!all.ok || !approvedOnly.ok) return;
  assert.deepEqual(approvedOnly.value.links.map((l) => l.state), ["approved"]);
  assert.deepEqual(all.value.links.map((l) => l.state).sort(), ["approved", "candidate"]);
  assert.equal(all.value.skipped.inactiveLinks, 1);
});

test("a link with a Kalshi leg is skipped whole and leaves no trace of the Kalshi market", () => {
  const { text, pin } = bundleText((r0) => {
    const x = leg("xo", "xo-0900");
    const k = leg("kalshi", "KXSYNTH-0900", { rulesSha256: x.rulesSha256, maskedSha256: x.maskedSha256 });
    const withK = propose(r0, identityCandidate("0900", { legs: [x, k] }));
    return propose(withK.registry, identityCandidate("0001")).registry;
  });
  const t = targetsFromBundle(text, { expectedManifestSha256: pin, allowSynthetic: true });
  assert.ok(t.ok);
  if (!t.ok) return;
  assert.equal(t.value.skipped.linksWithRefusedLeg, 1);
  assert.equal(t.value.links.length, 1);
  const blob = JSON.stringify(t.value);
  assert.equal(/kalshi|KXSYNTH|xo-0900/i.test(blob), false, "neither the Kalshi id nor its XO partner is kept");
});

test("a bundle needs its pin: a missing, wrong or tampered hash is refused", () => {
  const { text, pin } = bundleText((r) => propose(r, identityCandidate("0001")).registry);
  const none = targetsFromBundle(text, { allowSynthetic: true });
  assert.equal(none.ok, false);
  const wrong = targetsFromBundle(text, { expectedManifestSha256: "0".repeat(64), allowSynthetic: true });
  assert.equal(wrong.ok, false);
  const tampered = targetsFromBundle(text.replace("SYNTHETIC-xo-0001", "SYNTHETIC-xo-9999"), { expectedManifestSha256: pin, allowSynthetic: true });
  assert.equal(tampered.ok, false);
  assert.equal(targetsFromBundle(text, { expectedManifestSha256: pin }).ok, false, "synthetic bundles are refused unless a test opts in");
  assert.equal(targetsFromBundle("not json", { unpinned: true }).ok, false);
  assert.equal(targetsFromBundle(text, { unpinned: true, allowSynthetic: true }).ok, true, "--unpinned is an explicit opt-out");
});

test("targets file: groups and markets are validated, refused venues are a hard error", () => {
  const ok = targetsFromFile(JSON.stringify({ format: "pm-recorder-targets", version: 1, groups: [{ groupId: "fed-oct", venue: "polymarket", exhaustive: "by_rule", marketIds: ["0xaa", "0xbb", "0xbb", "0xcc"] }], markets: [{ venue: "xo", marketId: "0xdd" }] }));
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.value.groups[0]?.members, ["polymarket:0xaa", "polymarket:0xbb", "polymarket:0xcc"]);
    assert.equal(ok.value.targets.length, 4);
  }
  const bad = (input: unknown, re: RegExp): void => {
    const r = targetsFromFile(JSON.stringify(input));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.errors.join("\n"), re);
  };
  const base = { format: "pm-recorder-targets", version: 1 };
  bad({ ...base, markets: [{ venue: "kalshi", marketId: "KXFED" }] }, /Developer Agreement/);
  bad({ ...base, groups: [{ groupId: "g", venue: "kalshi", marketIds: ["a", "b"] }] }, /Developer Agreement/);
  bad({ ...base, markets: [{ venue: "quotient", marketId: "m1" }] }, /redistribution/);
  bad({ ...base, groups: [{ groupId: "g", venue: "limitless", marketIds: ["a", "b"] }] }, /xo and polymarket only/);
  bad({ ...base, markets: [{ venue: "xo", marketId: "../../etc/passwd" }] }, /marketId/);
  bad({ ...base, markets: [{ venue: "xo", marketId: "a b" }] }, /marketId/);
  bad({ ...base, markets: [{ venue: "xo", marketId: "0xaa?x=1" }] }, /marketId/);
  bad({ ...base, extra: 1 }, /Unrecognized/i);
  bad({ format: "other", version: 1 }, /format/);
  assert.equal(targetsFromFile("{").ok, false);
  assert.equal(MARKET_ID.test("0xabc.def:1-2_3".replace("_", "-")), true);
});

test("loadTargets merges files, filters venues and enforces maxTargets without leaking paths", () => {
  const dir = tempDir();
  try {
    const f = join(dir.path, "targets.json");
    writeFileSync(f, JSON.stringify({ format: "pm-recorder-targets", version: 1, markets: [{ venue: "xo", marketId: "m1" }, { venue: "limitless", marketId: "s1" }] }));
    const r = loadTargets({ targetsPath: f, maxTargets: 10, venues: ["xo"] });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.value.targets.map((t) => t.key), ["xo:m1"]);
    const tooMany = loadTargets({ targetsPath: f, maxTargets: 1, venues: ["xo", "limitless"] });
    assert.equal(tooMany.ok, false);
    const missing = loadTargets({ targetsPath: join(dir.path, "nope.json"), maxTargets: 10, venues: ["xo"] });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.errors.join("").includes(dir.path), false, "error text does not echo filesystem paths");
  } finally {
    dir.remove();
  }
});
