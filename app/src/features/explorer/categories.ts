// The category filter of the one Markets table: a second chip row under the view chips (views.ts). A chip is a
// FILTER STATE over the rows already loaded, composed with the view and the search text; it never requests
// anything and never touches the URL. Every count is computed from loaded rows.
//
// A row's category is the fixed-taxonomy verdict its adapter attached (core/category.ts, mirrored from
// pm/core/category.ts): matched deterministically against the venue's own category words or the title's words,
// never assigned by a model. A row without a verdict (an adapter that has no source) reads as "Other", unassigned.

import { CATEGORIES, CATEGORY_LABEL, NO_CATEGORY, isCategory, type Category, type CategoryVerdict } from "../../core/category";
import type { MarketSummary } from "../../core/ports";

export type CategoryFilter = "all" | Category;

export const ALL_CATEGORIES: CategoryFilter = "all";
export const ALL_CATEGORIES_LABEL = "All categories";

export function isCategoryFilter(value: unknown): value is CategoryFilter {
  return value === "all" || isCategory(value);
}

// The verdict a row carries, or the "none" verdict. A verdict naming a category outside the closed list (a bug, a
// tampered value) reads as "other", never as a category it is not.
export function verdictOf(summary: Pick<MarketSummary, "category">): CategoryVerdict {
  const verdict = summary.category ?? NO_CATEGORY;
  return isCategory(verdict.category) ? verdict : NO_CATEGORY;
}

export function categoryOfRow(summary: Pick<MarketSummary, "category">): Category {
  return verdictOf(summary).category;
}

export function categoryLabelOf(summary: Pick<MarketSummary, "category">): string {
  return CATEGORY_LABEL[categoryOfRow(summary)];
}

export function inCategory(summary: Pick<MarketSummary, "category">, filter: CategoryFilter): boolean {
  return filter === "all" || categoryOfRow(summary) === filter;
}

export function filterByCategory<Row extends { readonly summary: Pick<MarketSummary, "category"> }>(rows: readonly Row[], filter: CategoryFilter): Row[] {
  return rows.filter((row) => inCategory(row.summary, filter));
}

// One count per category that has at least one row, in the taxonomy's order. A category with no row is absent.
export function countsByCategory(rows: ReadonlyArray<{ readonly summary: Pick<MarketSummary, "category"> }>): ReadonlyMap<Category, number> {
  const tally = new Map<Category, number>();
  for (const row of rows) {
    const category = categoryOfRow(row.summary);
    tally.set(category, (tally.get(category) ?? 0) + 1);
  }
  const ordered = new Map<Category, number>();
  for (const category of CATEGORIES) {
    const count = tally.get(category);
    if (count !== undefined && count > 0) ordered.set(category, count);
  }
  return ordered;
}

// Where the verdict came from, in words, for the inspector line "Category: <label> · <source>".
export const CATEGORY_SOURCE_TEXT: Readonly<Record<CategoryVerdict["confidence"], string>> = Object.freeze({
  native: "from the venue's taxonomy",
  keyword: "from title keywords",
  none: "unassigned",
});

export function categorySourceText(verdict: CategoryVerdict): string {
  return Object.hasOwn(CATEGORY_SOURCE_TEXT, verdict.confidence) ? CATEGORY_SOURCE_TEXT[verdict.confidence] : CATEGORY_SOURCE_TEXT.none;
}

export function categoryEmptyWords(filter: Category): { readonly title: string; readonly body: string } {
  const label = CATEGORY_LABEL[filter];
  return {
    title: `No market in ${label} among the loaded rows`,
    body: `None of the loaded rows is categorised as ${label}. A category comes from the venue's own category words or from the title's words, matched against a fixed list; nothing is guessed.`,
  };
}
