import { describe, expect, it } from "vitest";

import { parseIsoMs } from "../../core/format";
import { OG_FEE_TTL_SEC, OG_FEE_VERIFIED_AT, OG_FLAT_FEE_CATEGORIES, OG_PUBLIC_PATH } from "./constants";

describe("OG constants", () => {
  it("name no host: the origin is supplied by the caller from headers.config.ts", () => {
    expect(OG_PUBLIC_PATH).toMatch(/^\/[a-z0-9/]+$/);
    expect(OG_PUBLIC_PATH).not.toContain("//");
  });

  it("carry a documented fee date that parses and a finite lifetime", () => {
    expect(parseIsoMs(OG_FEE_VERIFIED_AT)).not.toBeNull();
    expect(OG_FEE_TTL_SEC).toBeGreaterThan(0);
  });

  it("list the flat-fee categories in lower case, the form they are compared in", () => {
    for (const category of OG_FLAT_FEE_CATEGORIES) expect(category).toBe(category.toLowerCase());
  });
});
