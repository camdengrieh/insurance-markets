import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MAX_RULE_CHARS,
  canonicalizeFields,
  canonicalizeRecord,
  decodeEntities,
  entityTableSha256,
  hashRuleRecord,
  maskRuleText,
  type FieldValue,
} from "../../links/hash.js";
import { canonicalJson, canonicalPretty, sha256Hex } from "../../links/canonical.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(readFileSync(join(HERE, "../../links/golden/hash-vectors.json"), "utf8")) as {
  synthetic: boolean;
  rulesV2: { name: string; fields: FieldValue[]; canonical: string; sha256: string }[];
  maskV1: { name: string; canonical: string; entities?: string[]; masked: string; sha256: string }[];
  records: { name: string; venue: string; record: Record<string, unknown>; canonical: string; rulesSha256: string; maskedSha256: string }[];
};

function independentSha(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

test("golden vectors are labelled synthetic", () => {
  assert.equal(vectors.synthetic, true);
});

test("rules-v2 golden vectors: canonical text and hash", () => {
  assert.ok(vectors.rulesV2.length >= 9);
  for (const v of vectors.rulesV2) {
    const r = canonicalizeFields(v.fields);
    assert.equal(r.ok, true, v.name);
    if (!r.ok) continue;
    assert.equal(r.value.text, v.canonical, v.name);
    assert.equal(r.value.rulesSha256, v.sha256, v.name);
    // independent of the implementation's own hashing helper
    assert.equal(independentSha(v.canonical), v.sha256, v.name);
  }
});

test("mask-v1 golden vectors: masked text and hash", () => {
  for (const v of vectors.maskV1) {
    const masked = maskRuleText(v.canonical, { entities: v.entities ?? [] });
    assert.equal(masked, v.masked, v.name);
    assert.equal(independentSha(masked), v.sha256, v.name);
  }
});

test("per-venue record vectors", () => {
  for (const v of vectors.records) {
    const h = hashRuleRecord(v.venue, v.record);
    assert.equal(h.ok, true, v.name);
    if (!h.ok) continue;
    assert.equal(h.value.canonical, v.canonical, v.name);
    assert.equal(h.value.rulesSha256, v.rulesSha256, v.name);
    assert.equal(h.value.maskedSha256, v.maskedSha256, v.name);
  }
});

test("the venue recipe ignores fields that are not rule-bearing", () => {
  const base = vectors.records.find((r) => r.name === "xo");
  assert.ok(base);
  const changedTitle = hashRuleRecord("xo", { ...base.record, title: "something else entirely" });
  assert.equal(changedTitle.ok && changedTitle.value.rulesSha256, base.rulesSha256);
  const changedRules = hashRuleRecord("xo", { ...base.record, rules: `${String(base.record.rules)} (edited)` });
  assert.equal(changedRules.ok, true);
  assert.notEqual(changedRules.ok && changedRules.value.rulesSha256, base.rulesSha256);
});

test("an absent rule field is an error, a null field is an empty slot", () => {
  const rec = { description: "text", resolutionSource: null, endDate: "2026-12-31" };
  assert.equal(hashRuleRecord("polymarket", rec).ok, true);
  const { endDate: _e, ...missing } = rec;
  const r = canonicalizeRecord("polymarket", missing);
  assert.deepEqual(r.ok ? null : r.error, "MISSING_FIELD");
});

test("unknown venue has no recipe and fails closed", () => {
  const r = canonicalizeRecord("opinion", { rules: "x" });
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.error, "NO_RECIPE");
});

test("bad field types, floats and objects are refused", () => {
  assert.equal(canonicalizeFields([1.5]).ok, false);
  assert.equal(canonicalizeFields([{ a: 1 } as unknown as FieldValue]).ok, false);
  assert.equal(canonicalizeFields([["ok", {} as unknown as string]]).ok, false);
});

test("all-empty rule fields refuse to pin nothing", () => {
  const r = canonicalizeFields(["", null, "   "]);
  assert.equal(r.ok, false);
  assert.equal(r.ok ? "" : r.error, "EMPTY");
});

test("oversize rule text is refused, not truncated", () => {
  const r = canonicalizeFields(["a".repeat(MAX_RULE_CHARS + 1)]);
  assert.equal(r.ok ? "" : r.error, "TOO_LONG");
  assert.equal(canonicalizeFields(["a".repeat(MAX_RULE_CHARS)]).ok, true);
});

test("a separator character inside a field cannot fake a field boundary", () => {
  const split = canonicalizeFields(["a", "b"]);
  const forged = canonicalizeFields(["a␟b"]);
  assert.equal(split.ok && forged.ok, true);
  if (split.ok && forged.ok) assert.notEqual(split.value.rulesSha256, forged.value.rulesSha256);
});

test("case and wording changes change the rules hash", () => {
  const a = canonicalizeFields(["Resolves YES if A wins."]);
  const b = canonicalizeFields(["resolves yes if A wins."]);
  const c = canonicalizeFields(["Resolves YES if A wins!"]);
  assert.equal(a.ok && b.ok && c.ok, true);
  if (a.ok && b.ok && c.ok) {
    assert.notEqual(a.value.rulesSha256, b.value.rulesSha256);
    assert.notEqual(a.value.rulesSha256, c.value.rulesSha256);
  }
});

test("zero-width and bidi characters do not change the hash", () => {
  const a = canonicalizeFields(["Resolves YES"]);
  const b = canonicalizeFields(["Re​solves‮ YES⁠"]);
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) assert.equal(a.value.rulesSha256, b.value.rulesSha256);
});

test("rules-v2 keeps markup as literal text, so no span of the record can be hidden from the pin", () => {
  // LS-1: v1 deleted "<x ..." up to the next ">" (or to the end), so these pairs shared a hash.
  const base = { description: "Resolves YES if A<B holds", resolutionSource: "https://x.example/1", endDate: "2026-12-31T00:00:00Z" };
  const a = hashRuleRecord("polymarket", base);
  const b = hashRuleRecord("polymarket", { ...base, resolutionSource: "https://CHANGED.example/2", endDate: "2027-06-30T00:00:00Z" });
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) {
    assert.notEqual(a.value.rulesSha256, b.value.rulesSha256);
    assert.ok(a.value.canonical.includes("A<B holds"));
    assert.ok(a.value.canonical.includes("x.example/1"));
  }
  const k1 = hashRuleRecord("kalshi", { rules_primary: "YES if x<y", rules_secondary: "one", close_time: "2026-12-31T23:59:00Z" });
  const k2 = hashRuleRecord("kalshi", { rules_primary: "YES if x<y", rules_secondary: "two", close_time: "2027-01-31T23:59:00Z" });
  assert.equal(k1.ok && k2.ok, true);
  if (k1.ok && k2.ok) assert.notEqual(k1.value.rulesSha256, k2.value.rulesSha256);
});

test("rules-v2: an unterminated or pseudo tag does not swallow later text", () => {
  const open = (tail: string) => canonicalizeFields([`keep <b unterminated ${tail}`]);
  const o1 = open("alpha");
  const o2 = open("beta");
  assert.equal(o1.ok && o2.ok, true);
  if (o1.ok && o2.ok) assert.notEqual(o1.value.rulesSha256, o2.value.rulesSha256);
  const p1 = canonicalizeFields(["YES if price <x and volume is high; Source: foo > bar"]);
  const p2 = canonicalizeFields(["YES if price <x and volume is low; Source: foo > bar"]);
  assert.equal(p1.ok && p2.ok, true);
  if (p1.ok && p2.ok) assert.notEqual(p1.value.rulesSha256, p2.value.rulesSha256);
  // comments and script bodies are text too: editing inside them changes the pin
  const c1 = canonicalizeFields(["a<!-- one -->b"]);
  const c2 = canonicalizeFields(["a<!-- two -->b"]);
  assert.equal(c1.ok && c2.ok, true);
  if (c1.ok && c2.ok) assert.notEqual(c1.value.rulesSha256, c2.value.rulesSha256);
});

test("rules-v2 uses NFC: superscript and plain digits are different questions (LS-7)", () => {
  for (const [x, y] of [["limit 10² units", "limit 102 units"], ["threshold 10⁶", "threshold 106"], ["5²", "52"]] as const) {
    const a = canonicalizeFields([x]);
    const b = canonicalizeFields([y]);
    assert.equal(a.ok && b.ok, true, x);
    if (a.ok && b.ok) assert.notEqual(a.value.rulesSha256, b.value.rulesSha256, x);
  }
  // canonically equivalent forms still agree
  const composed = canonicalizeFields(["caf\u00e9"]);
  const decomposed = canonicalizeFields(["cafe\u0301"]);
  assert.equal(composed.ok && decomposed.ok, true);
  if (composed.ok && decomposed.ok) assert.equal(composed.value.rulesSha256, decomposed.value.rulesSha256);
  // the masked template key may fold compatibility forms
  assert.equal(maskRuleText("limit 10²"), maskRuleText("limit 102"));
});

test("an entity cannot decode into a field separator", () => {
  const split = canonicalizeFields(["a", "b"]);
  const forged = canonicalizeFields(["a&#9247;b"]);
  assert.equal(split.ok && forged.ok, true);
  if (split.ok && forged.ok) assert.notEqual(split.value.rulesSha256, forged.value.rulesSha256);
});

test("stripped-HTML-only input is no longer treated as empty", () => {
  assert.equal(canonicalizeFields(["<p> </p>"]).ok, true);
});

test("decodeEntities decodes once and ignores invalid entities", () => {
  assert.equal(decodeEntities("&amp;lt;"), "&lt;");
  assert.equal(decodeEntities("&#65;&#x42;"), "AB");
  assert.equal(decodeEntities("&#0;&#xD800;&#99999999;&bogus;"), "&#0;&#xD800;&#99999999;&bogus;");
});

test("masked hash ignores dates, times, numbers, venue names and listed entities", () => {
  const a = "Arsenal win on 5 March 2026 at 20:00 UTC per Polymarket, margin 3%.";
  const b = "Chelsea win on 9 April 2027 at 19:30 ET per Kalshi, margin 12%.";
  const entities = ["Arsenal", "Chelsea"];
  assert.equal(maskRuleText(a, { entities }), maskRuleText(b, { entities }));
  // without the entity table the clubs still differ
  assert.notEqual(maskRuleText(a), maskRuleText(b));
});

test("masked hash still tells different clauses apart", () => {
  const stay = "If postponed the market remains open for 14 days.";
  const void14 = "If postponed the market is void after 14 days.";
  assert.notEqual(maskRuleText(stay), maskRuleText(void14));
});

test("masking hides a number but the rules hash keeps it (template key, not equality)", () => {
  const d14 = canonicalizeFields(["Void after 14 days."]);
  const d30 = canonicalizeFields(["Void after 30 days."]);
  assert.equal(d14.ok && d30.ok, true);
  if (d14.ok && d30.ok) {
    assert.notEqual(d14.value.rulesSha256, d30.value.rulesSha256);
    assert.equal(maskRuleText(d14.value.text), maskRuleText(d30.value.text));
  }
});

test("literal marker characters in input cannot forge a marker", () => {
  const masked = maskRuleText("⟦NUM⟧ 5");
  assert.equal(masked.includes("⟦NUM⟧ ⟦NUM⟧"), false);
  assert.equal(masked, "NUM ⟦NUM⟧");
});

test("entity table fingerprint is order and duplicate independent", () => {
  assert.equal(entityTableSha256(["b", "a", "a"]), entityTableSha256(["a", "b"]));
  assert.notEqual(entityTableSha256(["a"]), entityTableSha256(["a", "b"]));
});

test("canonical JSON: sorted keys, no floats, plain objects only", () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, "x"], c: undefined }), '{"a":[true,null,"x"],"b":1}');
  assert.throws(() => canonicalJson({ a: 1.5 }));
  assert.throws(() => canonicalJson({ a: Number.NaN }));
  assert.throws(() => canonicalJson(new Date()));
  assert.throws(() => canonicalJson({ a: 10n as unknown as number }));
  assert.equal(sha256Hex(canonicalJson({ a: 1 })), independentSha('{"a":1}'));
  assert.equal(canonicalPretty({ b: [], a: { c: 1 } }), '{\n  "a": {\n    "c": 1\n  },\n  "b": []\n}');
});
