import { describe, expect, it } from "vitest";

import listCaptured from "./fixtures/markets_active_list_captured_2026-10-20.json";
import { categoryNativeOf, categoryOf, marketOf, summaryOf } from "./map.js";
import { singleRowSchema } from "./schemas.js";

// The category each Limitless row carries, from the captured active list (2026-10-20): "Minutely" / "5 min" /
// "15 min" style rows are the venue's automated crypto price windows and read as crypto from the venue's own words.

const NOW = 1_792_368_171_000;
const ORIGIN = "https://api.limitless.exchange";
const rows = listCaptured.data.map((row) => singleRowSchema.parse(row));

describe("limitless rows carry a category", () => {
  it("reads every captured minute-window row as crypto, from the categories, at native confidence", () => {
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      const verdict = categoryOf(row);
      expect(verdict.category).toBe("crypto");
      expect(verdict.confidence).toBe("native");
    }
    expect(categoryOf(rows[0] as (typeof rows)[number]).matched).toEqual(["limitless:minutely"]);
    expect(categoryOf(rows[1] as (typeof rows)[number]).matched).toEqual(["common:crypto"]);
  });

  it("attaches the verdict and the venue's category words (not the tags) to the summary and the market", () => {
    const first = rows[0] as (typeof rows)[number];
    const summary = summaryOf(first, ORIGIN, NOW);
    const market = marketOf(first, ORIGIN, NOW);
    expect(summary.category).toEqual(categoryOf(first));
    expect(market.category).toEqual(categoryOf(first));
    expect(summary.categoryNative).toEqual({ untrusted: true, value: "Minutely, 5 min" });
    expect(market.categoryNative).toEqual(summary.categoryNative);
    expect(JSON.stringify(summary.category)).not.toContain("Lumy");
  });

  it("reads an odd shape as no words, never as a crash", () => {
    const odd = { ...(rows[0] as (typeof rows)[number]), categories: "Crypto", tags: [null, 3, { name: "Lumy" }, { other: 1 }] };
    expect(categoryNativeOf(odd)).toBeUndefined();
    expect(categoryOf(odd).matched).toEqual(["limitless:lumy"]);
    const none = { ...(rows[0] as (typeof rows)[number]), categories: undefined, tags: undefined, title: "Nothing the table knows" };
    expect(categoryOf(none)).toEqual({ category: "other", confidence: "none", matched: [] });
  });
});
