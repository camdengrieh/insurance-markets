import { describe, expect, it } from "vitest";

import { normalizeLevels, spreadOf, topOfBook } from "./book";
import type { Level } from "./ports";

const lv = (price: string, size: string): Level => ({ price, size });

describe("normalizeLevels", () => {
  it("sorts bids descending and asks ascending whatever order the venue sent", () => {
    const input = [lv("0.52", "10"), lv("0.55", "1"), lv("0.5", "3"), lv("0.534", "2")];
    expect(normalizeLevels(input, "bids").levels.map((level) => level.price)).toEqual(["0.55", "0.534", "0.52", "0.5"]);
    expect(normalizeLevels(input, "asks").levels.map((level) => level.price)).toEqual(["0.5", "0.52", "0.534", "0.55"]);
  });

  it("compares as numbers, not as text", () => {
    const sorted = normalizeLevels([lv("0.1", "1"), lv("0.09", "1"), lv("0.2", "1"), lv("0.100", "1")], "asks").levels.map((level) => level.price);
    expect(sorted).toEqual(["0.09", "0.1", "0.100", "0.2"]);
  });

  it("drops and counts what is not an exact in-range level, and never repairs it", () => {
    const result = normalizeLevels(
      [lv("0.5", "1"), lv("1e-1", "1"), lv("1.01", "1"), lv("-0.1", "1"), lv("0.5", "0"), lv("0.5", "-3"), lv("abc", "1"), lv("0.5", "x"), lv(".5", "1"), lv("0.6", "2")],
      "bids",
    );
    expect(result.levels).toEqual([lv("0.6", "2"), lv("0.5", "1")]);
    expect(result.invalid).toBe(8);
  });

  it("accepts the price bounds 0 and 1, keeps equal prices in input order and does not merge them", () => {
    const result = normalizeLevels([lv("1", "1"), lv("0", "1"), lv("0.5", "1"), lv("0.5", "2")], "asks");
    expect(result.levels).toEqual([lv("0", "1"), lv("0.5", "1"), lv("0.5", "2"), lv("1", "1")]);
    expect(result.invalid).toBe(0);
  });

  it("does not change its input", () => {
    const input = [lv("0.2", "1"), lv("0.1", "1")];
    normalizeLevels(input, "asks");
    expect(input).toEqual([lv("0.2", "1"), lv("0.1", "1")]);
  });
});

describe("top of book and spread", () => {
  it("finds the best bid and ask and the exact spread", () => {
    const bids = [lv("0.52", "1"), lv("0.5", "1")];
    const asks = [lv("0.534", "1"), lv("0.6", "1")];
    const top = topOfBook(bids, asks);
    expect(top.bid).toEqual(lv("0.52", "1"));
    expect(top.ask).toEqual(lv("0.534", "1"));
    expect(top.crossed).toBe(false);
    expect(spreadOf(bids, asks)).toBe("0.014");
  });

  it("has no spread for a one-sided or empty book, and none for a crossed or locked one", () => {
    expect(spreadOf([], [lv("0.5", "1")])).toBeNull();
    expect(spreadOf([lv("0.5", "1")], [])).toBeNull();
    expect(spreadOf([], [])).toBeNull();
    expect(topOfBook([lv("0.6", "1")], [lv("0.5", "1")]).crossed).toBe(true);
    expect(spreadOf([lv("0.6", "1")], [lv("0.5", "1")])).toBeNull();
    expect(topOfBook([lv("0.5", "1")], [lv("0.5", "1")]).crossed).toBe(true);
    expect(spreadOf([lv("0.5", "1")], [lv("0.5", "1")])).toBeNull();
  });

  it("treats an unparseable top level as crossed rather than guessing", () => {
    expect(topOfBook([lv("zz", "1")], [lv("0.5", "1")]).crossed).toBe(true);
  });
});
