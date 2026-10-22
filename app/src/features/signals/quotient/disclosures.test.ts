import { describe, expect, it } from "vitest";

import { LICENCE_CLAUSE_BODY, LICENCE_CLAUSE_QUOTES, SPREAD_LABELS, TRACK_RECORD_CAVEATS, WHY_NOT_ARBITRAGE, capSpreadLabel } from "./disclosures";

// No Quotient response body is committed (restricted terms), so the per-row disclosure tests were deleted. What stays
// needs no row: the fixed vocabulary, the licence clause and the track-record caveats.

describe("the spread vocabulary (M3-10)", () => {
  it("has no label above hedged_discrepancy and no arbitrage label", () => {
    expect(SPREAD_LABELS).toEqual(["indicative", "model_edge", "structural_violation", "hedged_discrepancy"]);
    expect(SPREAD_LABELS.join(" ")).not.toMatch(/arbitrage/);
  });

  it("clamps any other label to indicative", () => {
    for (const bad of ["executable_arbitrage", "arbitrage", "riskless", "", "HEDGED_DISCREPANCY", null, undefined, 7, {}]) expect(capSpreadLabel(bad)).toBe("indicative");
    for (const good of SPREAD_LABELS) expect(capSpreadLabel(good)).toBe(good);
  });

});

describe("the fixed vocabulary", () => {
  it("carries the why-not-arbitrage line", () => {
    expect(WHY_NOT_ARBITRAGE).toMatch(/not arbitrage/);
  });
});

describe("the licence clause and the track record", () => {
  it("quotes the terms and says Quotient is off until switched on, with no export", () => {
    expect(LICENCE_CLAUSE_QUOTES).toHaveLength(4);
    expect(LICENCE_CLAUSE_QUOTES.join(" ")).toContain("personal or internal business purposes");
    expect(LICENCE_CLAUSE_QUOTES.join(" ")).toContain("share or resell access");
    expect(LICENCE_CLAUSE_BODY).toMatch(/OFF/);
    expect(LICENCE_CLAUSE_BODY).toMatch(/no export/);
    expect(LICENCE_CLAUSE_BODY).toMatch(/not legal advice/);
  });

  it("states the favourable window must not be shown alone", () => {
    expect(TRACK_RECORD_CAVEATS.join(" ")).toMatch(/hypothetical/);
    expect(TRACK_RECORD_CAVEATS.join(" ")).toMatch(/all-time/);
    expect(TRACK_RECORD_CAVEATS.join(" ")).toMatch(/never the favourable one alone/);
  });
});
