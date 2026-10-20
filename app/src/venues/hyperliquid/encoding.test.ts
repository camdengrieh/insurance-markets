import { describe, expect, it } from "vitest";

import { assetIdOf, coinOf, encodingOf, outcomeFromMarketId, parseOutcomeToken, tokenOf } from "./encoding";
import { closeOf, isProtocolMarkClass, parseSpec, parseSpecTime, titleOf, valueOf } from "./spec";

describe("outcome identity", () => {
  it("builds coin, token and asset id from outcome and side", () => {
    // Recorded pair: outcome 3600 is coins #36000 (Yes) and #36001 (No).
    expect(encodingOf(3600, 0)).toBe(36_000);
    expect(encodingOf(3600, 1)).toBe(36_001);
    expect(coinOf(36_000)).toBe("#36000");
    expect(tokenOf(36_001)).toBe("+36001");
    expect(assetIdOf(36_000)).toBe(100_036_000);
  });

  it("parses a coin or a token back to outcome and side", () => {
    expect(parseOutcomeToken("#36001")).toEqual({ outcome: 3600, side: 1, encoding: 36_001 });
    expect(parseOutcomeToken("+142310")).toEqual({ outcome: 14_231, side: 0, encoding: 142_310 });
    expect(parseOutcomeToken("#0")).toEqual({ outcome: 0, side: 0, encoding: 0 });
  });

  it("refuses everything that is not a coin or token of a real side", () => {
    for (const bad of ["", "#", "36000", "#36002", "#3600a", "#-1", "# 1", "#01", "#36000 ", "BTC", "@107", "#1e3", "#99999999999999999", "0x24", "+", "##1"]) {
      expect(parseOutcomeToken(bad)).toBeNull();
    }
  });

  it("accepts a market id only as a plain decimal outcome number", () => {
    expect(outcomeFromMarketId("3600")).toBe(3600);
    expect(outcomeFromMarketId("0")).toBe(0);
    for (const bad of ["", "-1", "01", "1.5", "1e3", "abc", "36 00", "9".repeat(13), "../1"]) expect(outcomeFromMarketId(bad)).toBeNull();
  });
});

describe("outcome spec text", () => {
  it("parses the two recorded forms into key and value pairs", () => {
    const docs = parseSpec("class:priceBinary|underlying:HYPE|expiry:20260310-1100|targetPrice:34.5|period:3m");
    expect(docs?.map((pair) => pair.key)).toEqual(["class", "underlying", "expiry", "targetPrice", "period"]);
    expect(valueOf(docs, "targetPrice")).toBe("34.5");
    const live = parseSpec("perp:BTC|priceDescription:BTC-USDC perp mark|seconds:60|threshold:82444|time:20261019-0145");
    expect(valueOf(live, "priceDescription")).toBe("BTC-USDC perp mark");
  });

  it("keeps a colon inside a value", () => {
    expect(valueOf(parseSpec("a:b:c|d:e"), "a")).toBe("b:c");
  });

  it("treats anything that is not key:value as plain text and reads nothing from it", () => {
    for (const text of ["", "No change", "a:1|b", "1a:2", "a:1|a:2", "|", "a:1|", "x".repeat(4_001)]) expect(parseSpec(text)).toBeNull();
  });

  it("reads a close time only from a real UTC minute", () => {
    expect(parseSpecTime("20260503-0600")).toBe("2026-05-03T06:00:00.000Z");
    for (const bad of ["20261340-0600", "20260230-0600", "20260503-2500", "20260503-0660", "2026050-0600", "", "20260503", "2026-05-03", undefined]) {
      expect(parseSpecTime(bad)).toBeNull();
    }
    expect(closeOf(parseSpec("expiry:20260503-0600|time:20260101-0000"))).toBe("2026-05-03T06:00:00.000Z");
    expect(closeOf(parseSpec("time:20261019-0145"))).toBe("2026-10-19T01:45:00.000Z");
    expect(closeOf(parseSpec("expiry:oops"))).toBeNull();
  });

  it("claims a settlement mechanism only for the documented recurring class", () => {
    expect(isProtocolMarkClass(parseSpec("class:priceBinary|underlying:BTC"))).toBe(true);
    expect(isProtocolMarkClass(parseSpec("class:sports|underlying:BTC"))).toBe(false);
    expect(isProtocolMarkClass(parseSpec("perp:BTC|time:20261019-0145"))).toBe(false);
    expect(isProtocolMarkClass(null)).toBe(false);
  });

  it("builds a title that restates the spec and nothing more", () => {
    expect(titleOf("Recurring", "class:priceBinary|underlying:BTC", parseSpec("class:priceBinary|underlying:BTC"))).toBe(
      "Recurring: class=priceBinary, underlying=BTC",
    );
    expect(titleOf("Fed decision", "No change", null)).toBe("Fed decision - No change");
    expect(titleOf("", "", null)).toBe("");
    expect(titleOf("x".repeat(500), "", null).length).toBeLessThanOrEqual(101);
  });
});
