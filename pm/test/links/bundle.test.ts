import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBundle, serializeBundle, validateBundle, type Bundle } from "../../links/bundle.js";
import { canonicalSha256 } from "../../links/canonical.js";
import { loadShippedBundle } from "../../links/shipped.js";
import { SHIPPED_BUNDLE_JSON, SHIPPED_BUNDLE_PIN } from "../../links/shipped-data.js";
import { emptyRegistry } from "../../links/store.js";
import { sampleRegistry } from "./fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "../../links/data");
const CREATED = "2026-10-20T00:00:00Z";

function built(includeCandidates = true): Bundle {
  const { registry } = sampleRegistry();
  const b = buildBundle(registry, { createdAt: CREATED, includeCandidates });
  assert.equal(b.ok, true, b.ok ? "" : b.errors.join("; "));
  if (!b.ok) throw new Error("unreachable");
  return b.value;
}

function opts(b: Bundle) {
  return { expectedManifestSha256: b.manifestSha256, allowSynthetic: true };
}

function mutate(b: Bundle, f: (copy: any) => void): unknown {
  const copy = JSON.parse(JSON.stringify(b));
  f(copy);
  return copy;
}

test("bundle build is deterministic and round-trips through the validator", () => {
  const a = built();
  const b = built();
  assert.equal(serializeBundle(a), serializeBundle(b));
  const reparsed = validateBundle(serializeBundle(a), opts(a));
  assert.equal(reparsed.ok, true, reparsed.ok ? "" : reparsed.errors.join("; "));
  assert.equal(a.manifest.counts.approved, 2);
  assert.equal(a.manifest.counts.candidate, 1);
  assert.equal(a.manifest.synthetic, true);
  assert.equal(a.manifestSha256, canonicalSha256(a.manifest));
});

test("candidates are left out unless asked for", () => {
  const without = built(false);
  assert.equal(without.manifest.counts.candidate, 0);
  assert.equal(without.links.length, 2);
});

test("links are sorted by id regardless of registry order", () => {
  const { registry } = sampleRegistry();
  const reversed = { ...registry, links: [...registry.links].reverse() };
  const a = buildBundle(registry, { createdAt: CREATED, includeCandidates: true });
  const b = buildBundle(reversed, { createdAt: CREATED, includeCandidates: true });
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.equal(a.value.manifestSha256, b.value.manifestSha256);
});

test("a pin is required, and a wrong pin is refused", () => {
  const b = built();
  assert.equal(validateBundle(serializeBundle(b), { allowSynthetic: true }).ok, false);
  assert.equal(validateBundle(serializeBundle(b), { allowSynthetic: true, unpinned: true }).ok, true);
  const wrong = validateBundle(serializeBundle(b), { expectedManifestSha256: "0".repeat(64), allowSynthetic: true });
  assert.equal(wrong.ok, false);
  assert.ok(!wrong.ok && wrong.errors.some((e) => e.includes("pinned hash")));
});

test("synthetic fixtures are refused unless a test opts in", () => {
  const b = built();
  const r = validateBundle(serializeBundle(b), { expectedManifestSha256: b.manifestSha256 });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("synthetic fixtures are not allowed")));
});

test("tampering with a record is caught by the record hash, then the manifest", () => {
  const b = built();
  const editedRecord = mutate(b, (c) => {
    c.links[0].basis.cutoffDeltaMinutes = 99;
  });
  const r1 = validateBundle(editedRecord, opts(b));
  assert.equal(r1.ok, false);
  assert.ok(!r1.ok && r1.errors.some((e) => e.includes("record hash mismatch")));

  // an attacker who also fixes the entry still breaks the manifest hash / pin
  const fixedEntry = mutate(b, (c) => {
    c.links[0].basis.cutoffDeltaMinutes = 99;
    c.manifest.entries[0].recordSha256 = canonicalSha256(c.links[0]);
  });
  const r2 = validateBundle(fixedEntry, opts(b));
  assert.equal(r2.ok, false);
  assert.ok(!r2.ok && r2.errors.some((e) => e.includes("manifestSha256")));

  // and fixing the manifest hash too still fails the out-of-band pin
  const fixedAll = mutate(b, (c) => {
    c.links[0].basis.cutoffDeltaMinutes = 99;
    c.manifest.entries[0].recordSha256 = canonicalSha256(c.links[0]);
    c.manifestSha256 = canonicalSha256(c.manifest);
  });
  const r3 = validateBundle(fixedAll, opts(b));
  assert.equal(r3.ok, false);
  assert.ok(!r3.ok && r3.errors.some((e) => e.includes("pinned hash")));
});

test("flipping a candidate to approved inside a bundle is caught even if hashes are fixed", () => {
  const b = built();
  const idx = b.links.findIndex((l) => l.state === "candidate");
  const forged = mutate(b, (c) => {
    c.links[idx].state = "approved";
    c.links[idx].tierCap = "hedged_discrepancy";
    c.manifest.entries[idx].state = "approved";
    c.manifest.entries[idx].recordSha256 = canonicalSha256(c.links[idx]);
    c.manifest.counts.candidate -= 1;
    c.manifest.counts.approved += 1;
    c.manifestSha256 = canonicalSha256(c.manifest);
  });
  const r = validateBundle(forged, { expectedManifestSha256: (forged as { manifestSha256: string }).manifestSha256, allowSynthetic: true });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("approved links need 1 approval")));
});

test("unknown fields and enums are refused at bundle level", () => {
  const b = built();
  assert.equal(validateBundle(mutate(b, (c) => { c.extra = 1; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.manifest.extra = 1; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.links[0].surprise = true; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.links[0].legs[0].title = "market title"; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.links[0].state = "pending"; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.links[0].tierCap = "executable_arbitrage"; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.manifest.restrictedData = "everything"; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.formatVersion = 2; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.manifest.recipes.rulesHash = "rules-v1"; }), opts(b)).ok, false);
});

test("order, duplicates, counts and entry coverage are enforced", () => {
  const b = built();
  assert.equal(validateBundle(mutate(b, (c) => { c.links.reverse(); c.manifest.entries.reverse(); }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.links.push(c.links[0]); }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.manifest.counts.approved += 1; }), opts(b)).ok, false);
  assert.equal(validateBundle(mutate(b, (c) => { c.manifest.entries.pop(); }), opts(b)).ok, false);
});

test("a restricted-venue quote smuggled into a bundle is refused", () => {
  const { registry } = sampleRegistry();
  const c = buildBundle(registry, { createdAt: CREATED });
  assert.ok(c.ok);
  if (!c.ok) return;
  const forged = mutate(c.value, (x) => {
    const link = x.links[0];
    link.legs[1].venue = "kalshi";
    link.proof.evidence.push({ method: "template", detail: "d", legIndex: 1, quote: "text copied from a Kalshi rule" });
  });
  const r = validateBundle(forged, { unpinned: true, allowSynthetic: true });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("restricted venue kalshi")));
});

test("oversize and non-JSON input fail closed", () => {
  assert.equal(validateBundle("{not json", { unpinned: true }).ok, false);
  assert.equal(validateBundle("x".repeat(5 * 1024 * 1024), { unpinned: true }).ok, false);
  assert.equal(validateBundle(null, { unpinned: true }).ok, false);
  assert.equal(validateBundle("[]", { unpinned: true }).ok, false);
});

test("an empty registry makes a valid empty, non-synthetic bundle", () => {
  const e = buildBundle(emptyRegistry(), { createdAt: CREATED });
  assert.ok(e.ok);
  if (e.ok) {
    assert.equal(e.value.links.length, 0);
    assert.equal(e.value.manifest.synthetic, false);
  }
});

test("shipped bundle: EMPTY approved set, pinned, loads, matches the files on disk", () => {
  const loaded = loadShippedBundle();
  assert.equal(loaded.ok, true, loaded.ok ? "" : loaded.errors.join("; "));
  if (!loaded.ok) return;
  assert.equal(loaded.value.manifest.counts.approved, 0);
  assert.equal(loaded.value.manifest.counts.candidate, 0);
  assert.equal(loaded.value.links.length, 0);
  assert.equal(loaded.value.manifest.synthetic, false);
  assert.equal(loaded.value.manifestSha256, SHIPPED_BUNDLE_PIN);
  assert.equal(readFileSync(join(DATA, "links.bundle.json"), "utf8"), SHIPPED_BUNDLE_JSON);
  assert.equal(readFileSync(join(DATA, "links.bundle.pin"), "utf8").trim(), SHIPPED_BUNDLE_PIN);
});

test("no invented data ships: the raw shipped bundle lists no link, no manifest entry and no entity table", () => {
  const raw = JSON.parse(SHIPPED_BUNDLE_JSON) as { links: unknown[]; manifest: { entries: unknown[]; entityTableSha256: unknown; counts: Record<string, number> } };
  assert.deepEqual(raw.links, []);
  assert.deepEqual(raw.manifest.entries, []);
  assert.equal(raw.manifest.entityTableSha256, null);
  assert.deepEqual(Object.values(raw.manifest.counts), [0, 0, 0, 0]);
  // The generated constant and the file on disk are the same, so neither can carry a link the other lacks.
  const onDisk = JSON.parse(readFileSync(join(DATA, "links.bundle.json"), "utf8")) as { links: unknown[] };
  assert.deepEqual(onDisk.links, []);
  // The check has teeth: a bundle with one link is not empty.
  const withLink = built();
  assert.ok(withLink.links.length > 0);
});

test("the working registry shipped in the repo is empty", () => {
  const reg = JSON.parse(readFileSync(join(DATA, "registry.json"), "utf8")) as { links: unknown[]; events: unknown[] };
  assert.equal(reg.links.length, 0);
  assert.equal(reg.events.length, 0);
});

test("shipped bundle with a changed byte fails its pin", () => {
  const tampered = SHIPPED_BUNDLE_JSON.replace('"createdAt": "2026-10-20T00:00:00Z"', '"createdAt": "2026-10-21T00:00:00Z"');
  assert.notEqual(tampered, SHIPPED_BUNDLE_JSON);
  assert.equal(validateBundle(tampered, { expectedManifestSha256: SHIPPED_BUNDLE_PIN }).ok, false);
});

test("TM-17: the shipped loader enforces the pin itself: a tampered bundle, a wrong pin and a missing pin are all refused", () => {
  const tampered = SHIPPED_BUNDLE_JSON.replace('"createdAt": "2026-10-20T00:00:00Z"', '"createdAt": "2026-10-21T00:00:00Z"');
  assert.notEqual(tampered, SHIPPED_BUNDLE_JSON);
  assert.equal(loadShippedBundle({ json: tampered, pin: SHIPPED_BUNDLE_PIN }).ok, false);
  assert.equal(loadShippedBundle({ json: SHIPPED_BUNDLE_JSON, pin: "0".repeat(64) }).ok, false);
  assert.equal(loadShippedBundle({ json: SHIPPED_BUNDLE_JSON, pin: "" }).ok, false);
  assert.equal(loadShippedBundle({ json: SHIPPED_BUNDLE_JSON, pin: SHIPPED_BUNDLE_PIN }).ok, true);
});
