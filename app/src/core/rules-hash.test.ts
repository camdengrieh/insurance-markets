import { describe, expect, it } from "vitest";

import { normalizeRuleField, rulesHashOf } from "./rules-hash";

describe("the shared rules hash (A2)", () => {
  it("is a 64-hex fingerprint, and empty when there is no rules text at all", () => {
    expect(rulesHashOf(["Resolves Yes if it rains."])).toMatch(/^[0-9a-f]{64}$/);
    expect(rulesHashOf(["", null, undefined])).toBe("");
    expect(rulesHashOf([])).toBe("");
  });

  it("does not care about markup, spacing or compatibility forms", () => {
    expect(rulesHashOf(["<p>Resolves   Yes\n if it rains.</p>"])).toBe(rulesHashOf(["Resolves Yes if it rains."]));
    expect(rulesHashOf(["ＡＢＣ"])).toBe(rulesHashOf(["ABC"]));
  });

  it("changes when a change falls after the 3000-character display cut", () => {
    const head = "x".repeat(3500);
    expect(rulesHashOf([`${head}A`])).not.toBe(rulesHashOf([`${head}B`]));
  });

  it("changes when any one field changes (a source, a date), and the field boundary matters", () => {
    const base = ["Resolves Yes if it rains.", "https://weather.example/a", "2026-12-01T00:00:00Z"];
    expect(rulesHashOf(base)).not.toBe(rulesHashOf([base[0], "https://weather.example/b", base[2]]));
    expect(rulesHashOf(base)).not.toBe(rulesHashOf([base[0], base[1], "2026-12-02T00:00:00Z"]));
    expect(rulesHashOf(["ab", "c"])).not.toBe(rulesHashOf(["a", "bc"]));
    // A field cannot smuggle text across the separator.
    expect(rulesHashOf(["a␟b", ""])).not.toBe(rulesHashOf(["a", "b"]));
    expect(normalizeRuleField("a␟b")).toBe("a b");
  });

  it("survives a hostile run of combining marks without blowing up", () => {
    const text = `a${"́".repeat(200_000)}`;
    expect(rulesHashOf([text])).toMatch(/^[0-9a-f]{64}$/);
  });
});
