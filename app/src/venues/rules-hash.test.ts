import { describe, expect, it } from "vitest";

import limitlessDetail from "./limitless/fixtures/market_detail_recorded.json";
import { rulesOf as limitlessRules } from "./limitless/map";
import { singleRowSchema as limitlessRowSchema } from "./limitless/schemas";

// A2: every reader fingerprints the FULL rule text and the other rule-bearing fields, never the capped display copy.
const HEAD = "Resolves Yes if the thing happens, as published. ".repeat(80);

describe("the rules hash covers more than the capped display text (A2)", () => {
  it("Limitless: a change after the display cut or in the expiry changes the hash", () => {
    // The recorded detail was trimmed of expirationTimestamp; live details carry it, and the fingerprint needs it.
    const base = limitlessRowSchema.parse({ ...limitlessDetail, expirationTimestamp: 1_800_000_000_000 });
    const withRules = (description: string, extra: Record<string, unknown> = {}) => limitlessRules(limitlessRowSchema.parse({ ...base, description, ...extra }));
    const one = withRules(`<p>${HEAD}ONE</p>`);
    const two = withRules(`<p>${HEAD}TWO</p>`);
    expect(one.text.value).toBe(two.text.value);
    expect(one.sha256).not.toBe(two.sha256);
    expect(withRules("Rules.", { expirationTimestamp: 1_800_000_000_000 }).sha256).not.toBe(withRules("Rules.", { expirationTimestamp: 1_800_000_060_000 }).sha256);
    expect(limitlessRules(limitlessRowSchema.parse({ ...base, description: "", expirationTimestamp: undefined })).sha256).toBe("");
  });
});
