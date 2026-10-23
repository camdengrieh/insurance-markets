import assert from "node:assert/strict";
import { test } from "node:test";
import { blockKey, bucketOf, buildBlocks, pairsOf, sameNativeGroup, sameVenueDifferentTitle } from "../../../sdk/linker/block.js";
import { MAX_BLOCK_SIZE } from "../../../sdk/linker/constants.js";
import type { MarketFeatures } from "../../../sdk/linker/features.js";

function f(id: string, category: string, closeUtc: string, venue: MarketFeatures["venue"] = "xo"): MarketFeatures {
  return { venue, marketId: id, titleTokens: [], ruleTokens: [], numbers: [], dates: [], entities: [], rulesSha256: "a".repeat(64), maskedSha256: "b".repeat(64), titleSha256: "c".repeat(64), closeUtc, category, categoryConfidence: "none", voidPolicy: "unknown", resolverId: null, groupKey: null, groupKind: null, outcomes: 2 };
}

test("blocks are category plus close-week; pairs are drawn inside a block and with the next week only", () => {
  const w0 = "2026-12-28T00:00:00Z"; // Monday-ish week bucket edges do not matter, only equal buckets
  const b0 = bucketOf(w0);
  const sameWeek = new Date((b0 * 7 * 24 * 60 + 60) * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const nextWeek = new Date(((b0 + 1) * 7 * 24 * 60 + 60) * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const twoWeeks = new Date(((b0 + 2) * 7 * 24 * 60 + 60) * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const markets = [f("d", "sports", twoWeeks), f("a", "sports", sameWeek), f("b", "sports", sameWeek, "polymarket"), f("c", "sports", nextWeek), f("e", "crypto", sameWeek)];
  const blocks = buildBlocks(markets);
  assert.deepEqual(blocks.map((b) => b.key), [blockKey("crypto", b0), blockKey("sports", b0), blockKey("sports", b0 + 1), blockKey("sports", b0 + 2)]);
  const { pairs, skipped } = pairsOf(blocks);
  assert.equal(skipped, 0);
  const names = pairs.map((p) => `${p.a.marketId}${p.b.marketId}`);
  // Inside the week (keys sorted: polymarket:b before xo:a), across to the next week, then the week after;
  // never a-d (two weeks apart), never e (crypto) with sports.
  assert.deepEqual(names, ["ba", "bc", "ac", "cd"]);
});

test("a market with no category (other) is compared with every category of its bucket and the next, once", () => {
  const close = "2026-12-31T00:00:00Z";
  const b0 = bucketOf(close);
  const next = new Date(((b0 + 1) * 7 * 24 * 60 + 60) * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const ms = [f("s", "sports", close), f("o", "other", close, "polymarket"), f("c", "crypto", close), f("n", "sports", next), f("p", "other", next)];
  const { pairs } = pairsOf(buildBlocks(ms));
  const names = pairs.map((p) => [p.a.marketId, p.b.marketId].sort().join("")).sort();
  // this week: crypto-other, sports-other; next week: sports-other; across: sports-sports', crypto-other', sports-other', other-other', other-sports'
  assert.deepEqual(names, ["co", "os", "np", "ns", "cp", "ps", "op", "no"].sort());
  assert.equal(new Set(names).size, names.length, "each unordered pair once");
});

test("the pair order does not depend on the input order", () => {
  const close = "2026-12-31T00:00:00Z";
  const ms = [f("x", "other", close), f("y", "other", close), f("z", "other", close)];
  const one = pairsOf(buildBlocks(ms)).pairs.map((p) => `${p.a.marketId}${p.b.marketId}`);
  const two = pairsOf(buildBlocks([...ms].reverse())).pairs.map((p) => `${p.a.marketId}${p.b.marketId}`);
  assert.deepEqual(one, two);
  assert.deepEqual(one, ["xy", "xz", "yz"]);
});

test("an oversized block is truncated and says so", () => {
  const close = "2026-12-31T00:00:00Z";
  const ms = Array.from({ length: MAX_BLOCK_SIZE + 5 }, (_, i) => f(`m${String(i).padStart(4, "0")}`, "other", close));
  const [block] = buildBlocks(ms);
  assert.equal(block?.markets.length, MAX_BLOCK_SIZE);
  assert.equal(block?.truncated, 5);
});

test("siblings of one native group are never paired, and are counted; the same group key on two venues still pairs", () => {
  const close = "2026-12-31T00:00:00Z";
  const g = "0x" + "9".repeat(64);
  const sib = (id: string, venue: MarketFeatures["venue"] = "polymarket"): MarketFeatures => ({ ...f(id, "politics", close, venue), groupKey: g, groupKind: "neg_risk" });
  const markets = [sib("a"), sib("b"), sib("c"), f("d", "politics", close, "polymarket"), sib("e", "xo")];
  const { pairs, siblings, skipped } = pairsOf(buildBlocks(markets));
  assert.equal(skipped, 0);
  assert.equal(siblings, 3); // a-b, a-c, b-c
  const names = pairs.map((p) => [p.a.marketId, p.b.marketId].sort().join("")).sort();
  assert.deepEqual(names, ["ad", "ae", "bd", "be", "cd", "ce", "de"]);
  assert.equal(sameNativeGroup(sib("a"), sib("b")), true);
  assert.equal(sameNativeGroup(sib("a"), sib("e", "xo")), false);
  assert.equal(sameNativeGroup(f("x", "politics", close), f("y", "politics", close)), false); // no group: not siblings
});

test("two markets of one venue pair only when their titles are identical; across venues titles may differ", () => {
  const close = "2026-12-31T00:00:00Z";
  const t = (id: string, venue: MarketFeatures["venue"], title: string): MarketFeatures => ({ ...f(id, "sports", close, venue), titleSha256: title.repeat(64) });
  // a and b: one venue, sibling outcomes with different titles; c: a relisting of a; d: another venue.
  const markets = [t("a", "limitless", "1"), t("b", "limitless", "2"), t("c", "limitless", "1"), t("d", "xo", "3")];
  const { pairs, sameVenue, siblings } = pairsOf(buildBlocks(markets));
  assert.equal(siblings, 0);
  assert.equal(sameVenue, 2); // a-b, b-c
  const names = pairs.map((p) => [p.a.marketId, p.b.marketId].sort().join("")).sort();
  assert.deepEqual(names, ["ac", "ad", "bd", "cd"]);
  assert.equal(sameVenueDifferentTitle(t("a", "limitless", "1"), t("b", "limitless", "2")), true);
  assert.equal(sameVenueDifferentTitle(t("a", "limitless", "1"), t("d", "xo", "3")), false);
});
