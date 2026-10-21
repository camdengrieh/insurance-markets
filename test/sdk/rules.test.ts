import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Hex } from "../../sdk/hash.js";
import {
  RULES_HASH_RECIPE,
  hashRuleRecord,
  kalshiRuleFields,
  limitlessRuleFields,
  polymarketRuleFields,
  rulesFingerprint,
  rulesFingerprintOfFields,
  udxRuleFields,
  xoRuleFields,
  type XoRuleDetail,
} from "../../sdk/rules.js";

test("sha256Hex is plain SHA-256 over UTF-8, lowercase hex, in every runtime", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("the recipe id is rules-v2, the one the linker writes into its export", () => {
  assert.equal(RULES_HASH_RECIPE, "rules-v2");
});

const XO: XoRuleDetail = {
  rules: { description: "Resolves Yes if A.", outcomeRules: [{ outcomeIndex: 0, rule: "A" }, { outcomeIndex: 1, rule: "not A" }], outcomeRulesTotal: 2 },
  resolutionSources: ["https://example.org/a"],
  resolutionSourcesTotal: 1,
  resolverAddress: "0x0000000000000000000000000000000000000001",
  expiresAt: "2027-01-01T00:00:00Z",
  omissions: [],
};

test("each venue's builder feeds exactly the record the linker hashes, so the fingerprints agree", () => {
  const cases = [
    { venue: "polymarket", record: polymarketRuleFields({ description: "Rules <b>here</b>.", resolutionSource: "https://example.org", endDate: "2027-01-01T00:00:00Z" }) },
    { venue: "limitless", record: limitlessRuleFields({ description: "<p>Rules.</p>", expirationTimestamp: 1_800_000_000_000 }) },
    { venue: "kalshi", record: kalshiRuleFields({ rules_primary: "If A.", close_time: "2027-01-01T00:00:00Z" }) },
    { venue: "udx", record: udxRuleFields({ description: "If A.", expires_at: "2027-01-01T00:00:00Z" }) },
    { venue: "xo", record: xoRuleFields(XO) },
  ] as const;
  for (const { venue, record } of cases) {
    assert.ok(record !== null, venue);
    const direct = hashRuleRecord(venue, record);
    assert.ok(direct.ok, venue);
    assert.equal(rulesFingerprint(venue, record), direct.value.rulesSha256, venue);
    assert.match(rulesFingerprint(venue, record), /^[0-9a-f]{64}$/);
  }
});

test("a record that cannot be hashed honestly has no fingerprint, never a hash of what was kept", () => {
  assert.equal(polymarketRuleFields({ description: null, endDate: "2027-01-01T00:00:00Z" }), null);
  assert.equal(polymarketRuleFields({ description: "Rules." }), null);
  assert.equal(limitlessRuleFields({ description: "Rules." }), null);
  assert.equal(kalshiRuleFields({ rules_primary: "If A." }), null);
  assert.equal(xoRuleFields({ ...XO, rules: { ...XO.rules, outcomeRulesTotal: 3 } }), null);
  assert.equal(xoRuleFields({ ...XO, omissions: ["rules.description was longer than 3000 characters and was cut"] }), null);
  assert.equal(xoRuleFields({ ...XO, rules: { description: null, outcomeRules: [], outcomeRulesTotal: 0 } }), null);
  assert.equal(rulesFingerprint("polymarket", null), "");
  assert.equal(rulesFingerprintOfFields(["", null]), "");
});

test("any edit to a rule-bearing field changes the fingerprint; markup is kept as text", () => {
  const a = rulesFingerprint("limitless", limitlessRuleFields({ description: "<p>Rules.</p>", expirationTimestamp: 1 }));
  assert.notEqual(a, rulesFingerprint("limitless", limitlessRuleFields({ description: "<p>Rules.</p>", expirationTimestamp: 2 })));
  assert.notEqual(a, rulesFingerprint("limitless", limitlessRuleFields({ description: "Rules.", expirationTimestamp: 1 })));
  assert.equal(rulesFingerprintOfFields(["x​y"]), rulesFingerprintOfFields(["xy"]));
});
