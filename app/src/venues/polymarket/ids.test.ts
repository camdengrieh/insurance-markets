import { describe, expect, it } from "vitest";

import { selectTokenIds, isTokenId } from "./ids";
import { recorded } from "./fixtures/load";

// Acceptance M0-1: clobTokenIds versus positionIds are chosen by the market's `version`, never by which list exists.

const CLOB = ["111", "222"];
const POSITIONS = ["333", "444"];

describe("outcome token ids by market version", () => {
  it("uses clobTokenIds for v1 even when positionIds is also present and different", () => {
    const result = selectTokenIds({ version: "v1", clobTokenIds: CLOB, positionIds: POSITIONS, outcomeCount: 2 });
    expect(result).toEqual({ ok: true, ledger: "ctf_v1", ids: CLOB });
  });

  it("uses positionIds for v2 even when clobTokenIds is also present", () => {
    const result = selectTokenIds({ version: "v2", clobTokenIds: CLOB, positionIds: POSITIONS, outcomeCount: 2 });
    expect(result).toEqual({ ok: true, ledger: "protocol_v2", ids: POSITIONS });
  });

  it("holds on the recorded v1 rows that carry both lists (the hazard exists in live data)", () => {
    const rows = recorded.marketsList();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row["version"]).toBe("v1");
      const clob = JSON.parse(row["clobTokenIds"] as string) as string[];
      const positions = row["positionIds"] as string[];
      expect(positions).not.toEqual(clob);
      expect(selectTokenIds({ version: "v1", clobTokenIds: clob, positionIds: positions, outcomeCount: 2 })).toMatchObject({ ok: true, ids: clob });
    }
  });

  it("fails closed on a missing or unknown version instead of guessing a ledger", () => {
    for (const version of [undefined, null, "", "v3", "V1", "1"]) {
      const result = selectTokenIds({ version, clobTokenIds: CLOB, positionIds: POSITIONS, outcomeCount: 2 });
      expect(result.ok).toBe(false);
    }
  });

  it("fails closed when the chosen list is missing, the wrong length or malformed", () => {
    expect(selectTokenIds({ version: "v2", clobTokenIds: CLOB, positionIds: null, outcomeCount: 2 }).ok).toBe(false);
    expect(selectTokenIds({ version: "v1", clobTokenIds: ["1"], positionIds: null, outcomeCount: 2 }).ok).toBe(false);
    expect(selectTokenIds({ version: "v1", clobTokenIds: ["1", "x"], positionIds: null, outcomeCount: 2 }).ok).toBe(false);
    expect(selectTokenIds({ version: "v1", clobTokenIds: ["1", "01"], positionIds: null, outcomeCount: 2 }).ok).toBe(false);
    expect(selectTokenIds({ version: "v1", clobTokenIds: ["5", "5"], positionIds: null, outcomeCount: 2 }).ok).toBe(false);
    const tooBig = (2n ** 256n).toString();
    expect(selectTokenIds({ version: "v1", clobTokenIds: ["1", tooBig], positionIds: null, outcomeCount: 2 }).ok).toBe(false);
  });

  it("accepts the largest 256-bit id as a decimal string", () => {
    expect(isTokenId((2n ** 256n - 1n).toString())).toBe(true);
    expect(isTokenId("0x10")).toBe(false);
  });
});
