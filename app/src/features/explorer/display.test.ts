import { describe, expect, it } from "vitest";

import { toDec } from "../../core/money";
import type { Book, MarketSummary } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { DISPLAY_PRICE_CAPTION, STATUS_TEXT, depthWithin, headlineOutcome, priceText, statusInfo, utcText, viewBook, volumeText } from "./display";
import { book, NOW } from "./test-support";

describe("statusInfo", () => {
  it("has words for every status and fails closed for anything else", () => {
    expect(Object.keys(STATUS_TEXT).sort()).toEqual(["active", "closed", "determined", "disputed", "paused", "pending", "resolved", "unknown", "voided"]);
    for (const bad of ["ACTIVE", "open", "", "__proto__", "constructor", undefined, null, 7]) expect(statusInfo(bad).text).toBe("status unknown");
    expect(statusInfo("active").tone).toBe("ok");
    expect(statusInfo("determined").text).toBe("outcome proposed");
  });
});

describe("priceText (null is not zero)", () => {
  it("prints cents with one decimal, exactly", () => {
    expect(priceText("0.534")).toBe("53.4c");
    expect(priceText("0.5")).toBe("50.0c");
    expect(priceText("0")).toBe("0.0c");
    expect(priceText("1")).toBe("100.0c");
    expect(priceText("0.0005")).toBe("0.0c");
  });

  it("returns null, never a number, for a missing, malformed or out-of-range price", () => {
    for (const bad of [null, undefined, "", "abc", "1.2", "-0.1", "NaN", "0x1", "1e-1", " 0.5"]) expect(priceText(bad as string | null | undefined)).toBeNull();
  });
});

describe("volumeText", () => {
  it("states the unit and the window", () => {
    expect(volumeText({ amount: "1234.5", unit: "usd", windowHours: 24 })).toBe("$1,234.50 per 24 h");
    expect(volumeText({ amount: "10", unit: "usdc_e", windowHours: null })).toBe("10.00 USDC.e");
    expect(volumeText({ amount: "1500", unit: "shares", windowHours: null })).toBe("1,500.00 shares");
  });

  it("never calls an unknown unit dollars", () => {
    const text = volumeText({ amount: "980.25", unit: "unknown", windowHours: 24 });
    expect(text).toBe("980.25 (unit not stated) per 24 h");
    expect(text).not.toContain("$");
  });

  it("is null when the venue reports none or something that is not a decimal", () => {
    expect(volumeText({ amount: null, unit: "usd", windowHours: 24 })).toBeNull();
    expect(volumeText({ amount: "lots", unit: "usd", windowHours: 24 })).toBeNull();
    expect(volumeText({ amount: "<b>1</b>", unit: "unknown", windowHours: null })).toBeNull();
    expect(volumeText({ amount: "5", unit: "gold" as never, windowHours: null })).toBeNull();
  });
});

describe("utcText", () => {
  it("is always UTC and null for a bad time", () => {
    expect(utcText("2026-12-01T18:30:00.000Z")).toBe("2026-12-01 18:30 UTC");
    expect(utcText("2026-12-01T13:30:00-05:00")).toBe("2026-12-01 18:30 UTC");
    for (const bad of [null, undefined, "", "soon", "2026-13-45"]) expect(utcText(bad)).toBeNull();
  });
});

describe("headlineOutcome", () => {
  it("picks the yes role, else the first outcome, never by label", () => {
    const outcomes = [
      { index: 0, role: "label", label: untrusted("Yes"), tokenId: "a", displayPrice: "0.1" },
      { index: 1, role: "yes", label: untrusted("No"), tokenId: "b", displayPrice: "0.9" },
    ] as MarketSummary["outcomes"];
    expect(headlineOutcome(outcomes)?.tokenId).toBe("b");
    expect(headlineOutcome([outcomes[0] as MarketSummary["outcomes"][number]])?.tokenId).toBe("a");
    expect(headlineOutcome([])).toBeNull();
  });
});

describe("depthWithin (exact, five cents)", () => {
  const b = book("polymarket", "t", [["0.50", "10"], ["0.46", "5.5"], ["0.45", "100"], ["0.44", "7"]], [["0.52", "3"], ["0.56", "4"], ["0.57", "9"]]);
  it("sums sizes within 0.05 of each best price, inclusive", () => {
    const depth = depthWithin(b);
    expect(depth.bids === null ? null : toDec(depth.bids)).toBe("115.5");
    // 0.52 + 0.05 = 0.57 is inside the window; 0.58 would not be.
    expect(depth.asks === null ? null : toDec(depth.asks)).toBe("16");
  });

  it("gives null, not zero, for an empty side", () => {
    expect(depthWithin(book("polymarket", "t", [], [["0.5", "1"]])).bids).toBeNull();
    expect(depthWithin(book("polymarket", "t", [["0.5", "1"]], [])).asks).toBeNull();
  });

  it("refuses a size that is not a decimal rather than summing around it", () => {
    expect(depthWithin(book("polymarket", "t", [["0.5", "lots"]], [])).bids).toBeNull();
  });
});

describe("viewBook tiers (M0-8 and the spread labels)", () => {
  const two = (venue: "xo" | "polymarket", extra: { asOfMs?: number; derived?: Book["derived"] } = {}) =>
    book(venue, "t", [["0.50", "10"]], [["0.54", "10"]], extra);

  it("a fresh native book with both sides is a book spread", () => {
    const view = viewBook("polymarket", two("polymarket"), NOW);
    expect(view.tier).toBe("book");
    expect(view.spread).toBe("4.0c");
    expect(view.bid).toBe("50.0c");
    expect(view.ask).toBe("54.0c");
    expect(view.tierReason).toBeNull();
  });

  it("an XO book is never above indicative, however fresh (M0-8)", () => {
    const view = viewBook("xo", two("xo"), NOW);
    expect(view.tier).toBe("indicative");
    expect(view.tierReason).toMatch(/unreconciled/);
    expect(view.spread).toBe("4.0c");
  });

  it("a stale, an old or an undated book is indicative", () => {
    expect(viewBook("polymarket", two("polymarket", { asOfMs: NOW - 40_000 }), NOW).tier).toBe("indicative");
    expect(viewBook("polymarket", two("polymarket", { asOfMs: NOW - 10 * 60_000 }), NOW).tier).toBe("indicative");
    expect(viewBook("polymarket", two("polymarket", { asOfMs: Number.NaN }), NOW).tier).toBe("indicative");
  });

  it("a complement-derived book is indicative", () => {
    expect(viewBook("polymarket", two("polymarket", { derived: "complement" }), NOW).tier).toBe("indicative");
  });

  it("a crossed book has no spread and says why", () => {
    const view = viewBook("polymarket", book("polymarket", "t", [["0.60", "1"]], [["0.55", "1"]]), NOW);
    expect(view.tier).toBe("none");
    expect(view.spread).toBeNull();
    expect(view.crossed).toBe(true);
    expect(view.tierReason).toMatch(/stale or broken/);
  });

  it("a one-sided book has no spread: not zero and not a full-width one", () => {
    const view = viewBook("polymarket", book("polymarket", "t", [["0.60", "1"]], []), NOW);
    expect(view.tier).toBe("none");
    expect(view.spread).toBeNull();
    expect(view.ask).toBeNull();
    expect(view.depthAsks).toBeNull();
  });
});

describe("constants", () => {
  it("states that a display price is not executable", () => {
    expect(DISPLAY_PRICE_CAPTION).toBe("display price, not executable");
  });
});
