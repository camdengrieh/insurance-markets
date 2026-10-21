import { describe, expect, it } from "vitest";

import { NO_CATEGORY, type CategoryVerdict } from "../../core/category";
import { ALL_CATEGORIES, categoryEmptyWords, categoryLabelOf, categoryOfRow, categorySourceText, countsByCategory, filterByCategory, inCategory, isCategoryFilter, verdictOf } from "./categories";
import { summary } from "./test-support";

// The category filter is a state over loaded rows, computed from each row's fixed-taxonomy verdict; a row without
// one reads as "Other", unassigned, and a verdict outside the closed list reads as "Other" too.

const native = (category: CategoryVerdict["category"]): CategoryVerdict => ({ category, confidence: "native", matched: [`common:${category}`] });

describe("categories", () => {
  it("reads a missing or tampered verdict as Other, unassigned", () => {
    expect(verdictOf(summary("xo", "m1"))).toEqual(NO_CATEGORY);
    expect(categoryLabelOf(summary("xo", "m1"))).toBe("Other");
    expect(categorySourceText(verdictOf(summary("xo", "m1")))).toBe("unassigned");
    const tampered = summary("xo", "m2", { category: { category: "weapons" as never, confidence: "native", matched: [] } });
    expect(categoryOfRow(tampered)).toBe("other");
    expect(verdictOf(tampered)).toEqual(NO_CATEGORY);
    expect(categorySourceText({ category: "sports", confidence: "surely" as never, matched: [] })).toBe("unassigned");
  });

  it("filters by the verdict, with 'all' letting every row through", () => {
    const rows = [
      { summary: summary("xo", "a", { category: native("politics") }) },
      { summary: summary("polymarket", "b", { category: { category: "crypto", confidence: "keyword", matched: ["keyword:btc"] } }) },
      { summary: summary("manifold", "c") },
    ];
    expect(filterByCategory(rows, ALL_CATEGORIES)).toHaveLength(3);
    expect(filterByCategory(rows, "politics").map((row) => row.summary.ref.marketId)).toEqual(["a"]);
    expect(filterByCategory(rows, "other").map((row) => row.summary.ref.marketId)).toEqual(["c"]);
    expect(filterByCategory(rows, "weather")).toEqual([]);
    expect(inCategory(rows[1]?.summary as never, "crypto")).toBe(true);
    expect(isCategoryFilter("all")).toBe(true);
    expect(isCategoryFilter("crypto")).toBe(true);
    expect(isCategoryFilter("Crypto")).toBe(false);
  });

  it("counts only the categories that have a row, in the taxonomy's order", () => {
    const rows = [
      { summary: summary("xo", "a", { category: native("sports") }) },
      { summary: summary("xo", "b", { category: native("politics") }) },
      { summary: summary("xo", "c", { category: native("sports") }) },
      { summary: summary("manifold", "d") },
    ];
    expect([...countsByCategory(rows)]).toEqual([
      ["politics", 1],
      ["sports", 2],
      ["other", 1],
    ]);
    expect(countsByCategory([]).size).toBe(0);
  });

  it("has words for each source and for an empty category", () => {
    expect(categorySourceText(native("sports"))).toBe("from the venue's taxonomy");
    expect(categorySourceText({ category: "sports", confidence: "keyword", matched: [] })).toBe("from title keywords");
    expect(categoryEmptyWords("science_tech").title).toBe("No market in Science and tech among the loaded rows");
    expect(categoryEmptyWords("science_tech").body).toContain("nothing is guessed");
  });
});
