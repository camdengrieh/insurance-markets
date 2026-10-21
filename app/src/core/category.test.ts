import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CATEGORIES, CATEGORY_LABEL, NO_CATEGORY, categorise } from "./category";

// app/src/core/category.ts is a byte-for-byte mirror of pm/core/category.ts: the bundle may not import pm/ (the
// boundary check), and the linker in pm/ depends on the very same tables, so the two files must never drift. The
// hash is of the whole file, so a comment change on one side fails here too, on purpose.

const sha256 = (path: URL): string => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("the category module mirrors pm/core/category.ts", () => {
  it("is byte-identical to the pm module", () => {
    const app = new URL("./category.ts", import.meta.url);
    const pm = new URL("../../../pm/core/category.ts", import.meta.url);
    expect(sha256(app)).toBe(sha256(pm));
  });

  it("imports nothing, so it is safe in the bundle and in pm/ alike", () => {
    const source = readFileSync(new URL("./category.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });

  it("exports the contract the surface relies on", () => {
    expect(CATEGORIES).toHaveLength(9);
    expect(CATEGORIES[CATEGORIES.length - 1]).toBe("other");
    for (const category of CATEGORIES) expect(CATEGORY_LABEL[category]).toMatch(/^[A-Z][a-z ]*$/);
    expect(categorise({ venue: "xo", native: ["SPORTS", "Football", "football"] })).toEqual({ category: "sports", confidence: "native", matched: ["common:sports"] });
    expect(categorise({ venue: "xo", native: [] })).toEqual(NO_CATEGORY);
  });
});
