// The category chip row under the view chips: "All categories" plus one chip per category that has at least one
// loaded row in the current view (categories.ts). Same 44 px chip as the views (ui Chip), aria-pressed, the count
// in mono; pressing one narrows the table and never requests anything. On a phone the row scrolls sideways
// (explorer.css .explorer-category-chips) so the table never wraps.

import { CATEGORIES, CATEGORY_LABEL, type Category } from "../../core/category";
import { Chip } from "../../ui";
import { ALL_CATEGORIES, ALL_CATEGORIES_LABEL, type CategoryFilter } from "./categories";

export interface CategoryChipsProps {
  readonly category: CategoryFilter;
  // Counts of the rows in the current view, by category; null until the rows are loaded.
  readonly counts: ReadonlyMap<Category, number> | null;
  // The rows in the current view, all categories; null until loaded.
  readonly total: number | null;
  readonly onCategory: (category: CategoryFilter) => void;
}

export function CategoryChips({ category, counts, total, onCategory }: CategoryChipsProps) {
  // The pressed chip stays even when its count fell to zero, so the filter is never hidden while it is on.
  const shown = CATEGORIES.filter((id) => (counts?.get(id) ?? 0) > 0 || id === category);
  return (
    <div className="ui-chips explorer-chips explorer-category-chips" role="group" aria-label="Category">
      <Chip pressed={category === ALL_CATEGORIES} count={total === null ? undefined : total} onClick={() => onCategory(ALL_CATEGORIES)} data-category="all">
        {ALL_CATEGORIES_LABEL}
      </Chip>
      {shown.map((id) => (
        <Chip key={id} pressed={category === id} count={counts === null ? undefined : (counts.get(id) ?? 0)} onClick={() => onCategory(id)} data-category={id}>
          {CATEGORY_LABEL[id]}
        </Chip>
      ))}
    </div>
  );
}
