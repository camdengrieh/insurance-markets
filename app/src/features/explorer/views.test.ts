import { describe, expect, it } from "vitest";

import { summary } from "./test-support";
import { DEFAULT_VIEW, VIEW_IDS, countsByView, filterByView, holdingKey, inView, isViewId, marksOf, quotientCovers, rowKeyOf, type RowMarks } from "./views";

// The views are filter states over loaded rows, computed from exact ids: a held row is joined on the venue and the
// outcome token, a linked row on an approved link's leg id, a signal row on the venue Quotient covers. Nothing here
// reads a title.

const marks = (partial: Partial<RowMarks>): RowMarks => ({ held: false, linked: false, signal: false, watched: false, ...partial });

describe("views", () => {
  it("has four ids with All first and as the default", () => {
    expect(VIEW_IDS).toEqual(["all", "held", "linked", "signals"]);
    expect(DEFAULT_VIEW).toBe("all");
    expect(isViewId("held")).toBe(true);
    expect(isViewId("portfolio")).toBe(false);
  });

  it("covers Polymarket, Polymarket US, Kalshi and Hyperliquid outcomes, not XO or Trueo", () => {
    expect(quotientCovers("polymarket")).toBe(true);
    expect(quotientCovers("polymarket_us")).toBe(true);
    expect(quotientCovers("kalshi")).toBe(true);
    expect(quotientCovers("hyperliquid")).toBe(true);
    expect(quotientCovers("xo")).toBe(false);
    expect(quotientCovers("trueo")).toBe(false);
    expect(quotientCovers("manifold")).toBe(false);
  });

  it("marks a row held by an exact venue and token join, case-insensitively, never by its title", () => {
    const row = summary("xo", "m1", { title: "Held market" });
    const context = { holdings: new Set([holdingKey("xo", "M1-T1")]), linkedRows: new Set<string>(), watched: new Set<string>() };
    expect(marksOf(row, context)).toEqual(marks({ held: true }));
    const other = summary("polymarket", "m1", { title: "Held market" });
    expect(marksOf(other, context).held).toBe(false);
    const empty = { ...row, outcomes: row.outcomes.map((outcome) => ({ ...outcome, tokenId: "" })) };
    expect(marksOf(empty, { ...context, holdings: new Set([holdingKey("xo", "")]) }).held).toBe(false);
  });

  it("marks linked and watched rows by their row key, and signal rows by venue coverage", () => {
    const row = summary("polymarket", "p1");
    const context = { holdings: new Set<string>(), linkedRows: new Set([rowKeyOf("polymarket", "p1")]), watched: new Set([rowKeyOf("polymarket", "p1")]) };
    expect(marksOf(row, context)).toEqual(marks({ linked: true, watched: true, signal: true }));
    expect(marksOf(summary("xo", "p1"), context)).toEqual(marks({}));
  });

  it("filters and counts every view from the marks", () => {
    const rows = [{ marks: marks({ held: true, signal: true }) }, { marks: marks({ linked: true }) }, { marks: marks({}) }];
    expect(countsByView(rows)).toEqual({ all: 3, held: 1, linked: 1, signals: 1 });
    expect(filterByView(rows, "held")).toHaveLength(1);
    expect(filterByView(rows, "all")).toHaveLength(3);
    expect(inView(marks({}), "signals")).toBe(false);
  });
});
