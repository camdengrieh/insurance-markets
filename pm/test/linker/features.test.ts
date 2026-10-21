import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeatures, datesOf, entitiesOf, normaliseNumber, numbersOf, numbersOutsideDates, toUtcStamp, tokensOf } from "../../linker/features.js";

test("numbers normalise so the same amount written differently hashes alike", () => {
  assert.equal(normaliseNumber("80,000", undefined), "80000");
  assert.equal(normaliseNumber("80", "k"), "80000");
  assert.equal(normaliseNumber("1.5", "m"), "1500000");
  assert.equal(normaliseNumber("12", "%"), "12%");
  assert.equal(normaliseNumber("81742.9593000", undefined), "81742.9593");
  assert.deepEqual(numbersOf("above $80k or 80,000 by 12%"), ["12%", "80000"]);
});

test("dates are read in the common spellings and normalised to YYYY-MM-DD", () => {
  assert.deepEqual(datesOf("by December 31, 2026 or 2026-12-31 or 31 Dec 2026"), ["2026-12-31"]);
  assert.deepEqual(datesOf("on Oct 20"), ["0000-10-20"]);
  assert.deepEqual(datesOf("in March 2027"), ["2027-03-00"]);
  // Close fields: an ISO instant, an epoch-millisecond string, a time of day. None of them is a number.
  assert.deepEqual(datesOf("2026-12-31T05:00:00Z and 1798675200000"), ["2026-12-31"]);
  assert.deepEqual(numbersOutsideDates("above 80000 at 11:59 PM ET on 2026-12-31T05:00:00Z or 1798675200000"), ["80000"]);
});

test("tokens drop stopwords and short words; entities are capitalised words and acronyms", () => {
  assert.deepEqual(tokensOf("Will the BTC price be above ⟦NUM⟧ by ⟦DATE⟧?"), ["above", "btc", "date", "num", "price"]);
  assert.deepEqual(entitiesOf("Will Liverpool beat Villarreal? BTC says no"), ["btc", "liverpool", "villarreal"]);
});

test("a feature record holds hashes, not text", () => {
  const f = buildFeatures({
    venue: "xo",
    marketId: "0x" + "a".repeat(64),
    title: "SYNTHETIC Liverpool to win vs Villarreal on October 20, 2026",
    rulesCanonical: "SYNTHETIC resolves Yes if Liverpool wins by 2 goals",
    rulesSha256: "b".repeat(64),
    maskedSha256: "c".repeat(64),
    closeUtc: "2026-10-20T22:00:00Z",
    category: "sports",
    categoryConfidence: "native",
    voidPolicy: "unknown",
    resolverId: null,
    groupKey: null,
    groupKind: null,
    outcomes: 2,
  });
  const text = JSON.stringify(f);
  for (const word of ["Liverpool", "liverpool", "Villarreal", "SYNTHETIC", "goals", "October"]) assert.equal(text.includes(word), false, word);
  for (const list of [f.titleTokens, f.ruleTokens, f.numbers, f.dates, f.entities]) {
    assert.ok(list.every((h) => /^[0-9a-f]{12}$/.test(h)));
    assert.deepEqual(list, [...list].sort());
  }
  assert.ok(f.titleTokens.length >= 3);
  assert.equal(f.dates.length, 1);
  assert.equal(f.numbers.length, 1);
  // SYNTHETIC, Liverpool, Villarreal, October: capitalised words of the title.
  assert.equal(f.entities.length, 4);
});

test("UTC stamps come out in the registry's exact form", () => {
  assert.equal(toUtcStamp("2026-12-31T00:00:00.000Z"), "2026-12-31T00:00:00Z");
  assert.equal(toUtcStamp(1792476000000), "2026-10-20T06:00:00Z");
  assert.equal(toUtcStamp("1792476000"), "2026-10-20T06:00:00Z");
  assert.equal(toUtcStamp("not a date"), null);
  assert.equal(toUtcStamp(null), null);
});
