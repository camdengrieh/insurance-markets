import assert from "node:assert/strict";
import { test } from "node:test";
import { BAND_GOOD_BPS, BAND_STRONG_BPS, CANDIDATE_MIN_BPS, CLOSE_WINDOW_MINUTES, NEAR_CLOSE_MINUTES } from "../../../sdk/linker/constants.js";
import { buildFeatures, type FeatureInput, type MarketFeatures } from "../../../sdk/linker/features.js";
import { agreementBps, bandOf, closeProximityBps, evidenceCode, jaccardBps, scorePair } from "../../../sdk/linker/score.js";

function feat(title: string, rules: string, over: Partial<FeatureInput> = {}): MarketFeatures {
  const base: FeatureInput = {
    venue: "xo",
    marketId: "0x" + "1".repeat(64),
    title,
    rulesCanonical: rules,
    rulesSha256: "a".repeat(64),
    maskedSha256: "b".repeat(64),
    closeUtc: "2026-12-31T00:00:00Z",
    category: "other",
    categoryConfidence: "none",
    voidPolicy: "unknown",
    resolverId: null,
    groupKey: null,
    groupKind: null,
    outcomes: 2,
  };
  return buildFeatures({ ...base, ...over });
}

test("jaccard and agreement in basis points", () => {
  assert.equal(jaccardBps([], []), 0);
  assert.equal(jaccardBps(["a", "b"], ["a", "b"]), 10000);
  assert.equal(jaccardBps(["a", "b"], ["b", "c"]), 3333);
  assert.equal(agreementBps([], []), 5000);
  assert.equal(agreementBps(["a"], []), 2500);
  assert.equal(agreementBps(["a"], ["a"]), 10000);
});

test("close proximity is full within an hour, zero at a week, monotone between", () => {
  assert.equal(closeProximityBps(null), 0);
  assert.equal(closeProximityBps(0), 10000);
  assert.equal(closeProximityBps(NEAR_CLOSE_MINUTES), 10000);
  assert.equal(closeProximityBps(CLOSE_WINDOW_MINUTES), 0);
  let last = 10000;
  for (let d = NEAR_CLOSE_MINUTES; d <= CLOSE_WINDOW_MINUTES; d += 600) {
    const v = closeProximityBps(d);
    assert.ok(v <= last);
    last = v;
  }
});

test("scores are symmetric", () => {
  const a = feat("SYNTHETIC Alpha beats Beta on Dec 31, 2026", "resolves yes if alpha beats beta by 2 points", { rulesSha256: "a".repeat(64) });
  const b = feat("SYNTHETIC Beta loses to Alpha on Dec 31, 2026", "resolves yes if beta loses to alpha by 2 points", { venue: "polymarket", rulesSha256: "c".repeat(64), maskedSha256: "d".repeat(64), closeUtc: "2026-12-31T05:00:00Z" });
  const ab = scorePair(a, b);
  const ba = scorePair(b, a);
  assert.deepEqual(ab, ba);
  assert.equal(ab.closeDeltaMinutes, 300);
});

test("adding a shared title token never lowers the score (monotone)", () => {
  const base = feat("SYNTHETIC alpha beta gamma", "x", { rulesSha256: "a".repeat(64) });
  const other = (title: string) => feat(title, "y", { venue: "polymarket", rulesSha256: "c".repeat(64), maskedSha256: "d".repeat(64) });
  let last = -1;
  for (const title of ["SYNTHETIC delta", "SYNTHETIC alpha delta", "SYNTHETIC alpha beta delta", "SYNTHETIC alpha beta gamma delta", "SYNTHETIC alpha beta gamma"]) {
    const s = scorePair(base, other(title)).bps;
    assert.ok(s >= last, `${title}: ${s} >= ${last}`);
    last = s;
  }
});

test("identical rule text and the same question short-circuit to 10000; threshold edges decide proposability", () => {
  const a = feat("SYNTHETIC one", "same rules", { rulesSha256: "e".repeat(64), maskedSha256: "f".repeat(64) });
  const b = feat("SYNTHETIC one", "same rules", { venue: "polymarket", rulesSha256: "e".repeat(64), maskedSha256: "f".repeat(64) });
  const s = scorePair(a, b);
  assert.equal(s.bps, 10000);
  assert.equal(s.identicalRules, true);
  assert.equal(s.sameQuestion, true);
  assert.equal(s.proposable, true);
  assert.equal(bandOf(10000), "strong");
  assert.equal(bandOf(BAND_STRONG_BPS), "strong");
  assert.equal(bandOf(BAND_STRONG_BPS - 1), "good");
  assert.equal(bandOf(BAND_GOOD_BPS), "good");
  assert.equal(bandOf(BAND_GOOD_BPS - 1), "weak");
  assert.equal(bandOf(CANDIDATE_MIN_BPS - 1), "weak");
});

test("the proposal line is inclusive: a pair exactly at the line is proposable, one below is not", () => {
  // Same title words, same date, same close, different rules with no shared words and no numbers:
  // title 10000, rules 0, numbers 5000 (both empty), dates 10000, entities 10000, close 10000.
  const a = feat("SYNTHETIC Alpha Beta on 2026-12-31", "lorem ipsum dolor", { rulesSha256: "1".repeat(64), maskedSha256: "2".repeat(64) });
  const b = feat("SYNTHETIC Alpha Beta on 2026-12-31", "sit amet consectetur", { venue: "polymarket", rulesSha256: "3".repeat(64), maskedSha256: "4".repeat(64) });
  const s = scorePair(a, b);
  assert.equal(s.bps, Math.floor((35 * 10000 + 20 * 0 + 15 * 5000 + 10 * 10000 + 10 * 10000 + 10 * 10000) / 100));
  assert.equal(s.proposable, s.bps >= CANDIDATE_MIN_BPS);
  // Far-apart closes drop the close term to 0 and the date term stays: a pair just under the line.
  const c = feat("SYNTHETIC Alpha Beta", "lorem ipsum dolor", { rulesSha256: "1".repeat(64), maskedSha256: "2".repeat(64), closeUtc: "2026-12-01T00:00:00Z" });
  const d = feat("SYNTHETIC Alpha Beta", "sit amet consectetur", { venue: "polymarket", rulesSha256: "3".repeat(64), maskedSha256: "4".repeat(64), closeUtc: "2027-01-01T00:00:00Z" });
  const t = scorePair(c, d);
  assert.equal(t.bps, Math.floor((35 * 10000 + 15 * 5000 + 10 * 5000 + 10 * 10000) / 100));
  assert.equal(t.bps < CANDIDATE_MIN_BPS, true);
  assert.equal(t.proposable, false);
});

test("hard vetoes: disjoint numbers, or disjoint dates with closes far apart", () => {
  const a = feat("SYNTHETIC BTC above 80000 on Dec 31, 2026", "x", { rulesSha256: "1".repeat(64) });
  const b = feat("SYNTHETIC BTC above 90000 on Dec 31, 2026", "x", { venue: "polymarket", rulesSha256: "2".repeat(64) });
  assert.deepEqual(scorePair(a, b).vetoes, ["number_disagreement"]);
  const c = feat("SYNTHETIC Alpha by Dec 31, 2026", "x", { rulesSha256: "1".repeat(64), closeUtc: "2026-12-31T00:00:00Z" });
  const d = feat("SYNTHETIC Alpha by Jun 30, 2027", "x", { venue: "polymarket", rulesSha256: "2".repeat(64), closeUtc: "2027-06-30T00:00:00Z" });
  assert.deepEqual(scorePair(c, d).vetoes, ["date_disagreement"]);
  assert.equal(scorePair(c, d).proposable, false);
});

test("the evidence code is a short code without spaces (fit for a restricted leg too)", () => {
  const a = feat("SYNTHETIC one", "same rules", { rulesSha256: "e".repeat(64) });
  const b = feat("SYNTHETIC two", "other rules", { venue: "polymarket", rulesSha256: "f".repeat(64), closeUtc: "2027-01-01T00:00:00Z" });
  const code = evidenceCode(scorePair(a, b));
  assert.match(code, /^[A-Za-z0-9][A-Za-z0-9_:.+/-]{0,39}$/);
  assert.match(code, /^s\d+\.t\d+\.r\d+\.n\d+\.d\d+\.c\d+h$/);
});

test("identical rule text with different questions is scored, not short-circuited, and the vetoes still apply", () => {
  // Sibling outcomes of one event: the venue's rule fields (here the shared event description) are
  // identical, only the question differs.
  const rules = "This market resolves to the candidate who wins the 2028 election";
  const a = feat("Will Alice Example win the 2028 election?", rules, { venue: "polymarket", rulesSha256: "e".repeat(64), maskedSha256: "f".repeat(64) });
  const b = feat("Will Bob Example win the 2028 election?", rules, { venue: "polymarket", marketId: "0x" + "2".repeat(64), rulesSha256: "e".repeat(64), maskedSha256: "f".repeat(64) });
  const s = scorePair(a, b);
  assert.equal(s.identicalRules, true);
  assert.equal(s.sameQuestion, false);
  assert.ok(s.bps < 10000, `${s.bps}`);
  // Different numbers in the questions now veto even with identical rules.
  const rateRules = "This market resolves on the official published rate";
  const c = feat("Will the rate be above 4%?", rateRules, { rulesSha256: "e".repeat(64), maskedSha256: "f".repeat(64) });
  const d = feat("Will the rate be above 5%?", rateRules, { venue: "polymarket", rulesSha256: "e".repeat(64), maskedSha256: "f".repeat(64) });
  assert.deepEqual(scorePair(c, d).vetoes, ["number_disagreement"]);
  assert.equal(scorePair(c, d).proposable, false);
});
