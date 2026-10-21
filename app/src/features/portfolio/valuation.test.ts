import { describe, expect, it } from "vitest";

import { UnitMismatchError } from "../../core/errors";
import { fromBaseUnits, fromMicro, sumRows, toDec } from "../../core/money";
import { bidMark, MAX_BOOK_AGE_MS, summarize } from "./valuation";
import { NOW, book, q, row, seeded } from "./fixtures";

// M2-4: totals never add micro-units to dollars (property test), null is not zero, and the excluded-row count is
// printed (see panels.test.tsx for the printed text).

describe("bidMark", () => {
  const qty = q("shares", "10");

  it("marks at the best bid of the sorted book, exactly", () => {
    // The venue sends best-last; the mark must still be the highest bid.
    const mark = bidMark(qty, book([["0.40", "5"], ["0.55", "3"], ["0.50", "9"]], [["0.60", "2"]]), NOW, "usd");
    expect(mark.note).toBeNull();
    expect(toDec(mark.price as NonNullable<typeof mark.price>)).toBe("0.55");
    expect(toDec(mark.value as NonNullable<typeof mark.value>)).toBe("5.5");
    expect(mark.value?.unit).toBe("usd");
  });

  it("prices in the collateral it is told, never in another unit", () => {
    expect(bidMark(qty, book([["0.5", "1"]]), NOW, "usdc_e").value?.unit).toBe("usdc_e");
    expect(bidMark(qty, book([["0.5", "1"]]), NOW, "tyd").value?.unit).toBe("tyd");
  });

  it("an empty or one-sided book gives null with a reason, never 0 and never the ask", () => {
    for (const asks of [[], [["0.6", "5"]] as const]) {
      const mark = bidMark(qty, book([], asks), NOW, "usd");
      expect(mark.value).toBeNull();
      expect(mark.price).toBeNull();
      expect(mark.note).toMatch(/no bids/i);
    }
  });

  it("refuses a crossed, stale, synthetic or malformed book", () => {
    expect(bidMark(qty, book([["0.6", "1"]], [["0.5", "1"]]), NOW, "usd").note).toMatch(/crossed/);
    expect(bidMark(qty, book([["0.6", "1"]], [["0.7", "1"]], { asOfMs: NOW - MAX_BOOK_AGE_MS - 1 }), NOW, "usd").note).toMatch(/out of date/);
    expect(bidMark(qty, book([["0.6", "1"]], [], { derived: "complement" }), NOW, "usd").note).toMatch(/derived/);
    expect(bidMark(qty, book([["1.5", "1"]]), NOW, "usd").note).toMatch(/not valid/);
    expect(bidMark(qty, book([["0.5", "x"]]), NOW, "usd").value).toBeNull();
    expect(bidMark(q("shares", "0"), book([["0.5", "1"]]), NOW, "usd").value).toBeNull();
    expect(bidMark(q("usd", "10"), book([["0.5", "1"]]), NOW, "usd").value).toBeNull();
  });

  it("a book exactly at the age limit is still used", () => {
    expect(bidMark(qty, book([["0.5", "1"]], [], { asOfMs: NOW - MAX_BOOK_AGE_MS }), NOW, "usd").value).not.toBeNull();
  });
});

describe("summarize", () => {
  it("adds only rows with a value, per collateral symbol, and counts the rest", () => {
    const rows = [
      row({ id: "1", value: "5.50" }),
      row({ id: "2", value: "4.50" }),
      row({ id: "3", value: null }),
      row({ id: "4", collateral: "usdc_e", value: "1.250000" }),
      row({ id: "5", collateral: "tyd", value: null }),
    ];
    const totals = summarize(rows);
    expect(totals.valueRows).toBe(5);
    expect(totals.excludedFromValue).toBe(2);
    const bySymbol = new Map(totals.value.map((total) => [total.symbol, total] as const));
    expect(toDec(bySymbol.get("pUSD")?.total as NonNullable<unknown> as never)).toBe("10");
    expect(bySymbol.get("pUSD")).toMatchObject({ included: 2, excluded: 1 });
    expect(bySymbol.get("USDC.e")).toMatchObject({ included: 1, excluded: 0 });
    // No row of TYD had a value: the total is null ("no data"), not 0.
    expect(bySymbol.get("TYD")?.total).toBeNull();
    expect(bySymbol.get("TYD")).toMatchObject({ included: 0, excluded: 1 });
  });

  it("keeps two dollar-like assets apart: pUSD and USDC are never added", () => {
    const totals = summarize([row({ id: "1", value: "5", symbol: "pUSD" }), row({ id: "2", value: "7", symbol: "USDC" })]);
    expect(totals.value.map((total) => [total.symbol, toDec(total.total as never)])).toEqual([
      ["pUSD", "5"],
      ["USDC", "7"],
    ]);
  });

  it("puts each row in exactly one bucket, so the counts add up", () => {
    const rows = [
      row({ id: "open", status: "open", value: "1" }),
      row({ id: "claim", status: "claimable", claimable: "2" }),
      row({ id: "settled", status: "resolved_unclaimed", claimable: null }),
      row({ id: "void", status: "voided_refund", claimable: null }),
      row({ id: "lost", status: "lost" }),
      row({ id: "closed", status: "closed" }),
      row({ id: "unknown", status: "unknown" }),
    ];
    const totals = summarize(rows);
    expect(totals.valueRows + totals.claimableRows + totals.otherRows).toBe(rows.length);
    expect(totals.valueRows).toBe(1);
    expect(totals.claimableRows).toBe(3);
    expect(totals.excludedFromClaimable).toBe(2);
    expect(totals.otherRows).toBe(3);
  });

  it("a settled row's claimable amount never lands in the open-position value total", () => {
    const totals = summarize([row({ id: "claim", status: "claimable", value: "9", claimable: "2" })]);
    expect(totals.value).toEqual([]);
    expect(toDec(totals.claimable[0]?.total as never)).toBe("2");
  });

  it("an empty portfolio has no totals at all, not a total of 0", () => {
    const totals = summarize([]);
    expect(totals.value).toEqual([]);
    expect(totals.claimable).toEqual([]);
    expect(totals.rows).toBe(0);
  });

  it("property: 500 random portfolios total to the exact micro-unit sum, whatever mix of dollars and micro integers went in", () => {
    const next = seeded(20261019);
    for (let round = 0; round < 500; round += 1) {
      const count = 1 + Math.floor(next() * 12);
      let expectedMicro = 0n;
      const rows = Array.from({ length: count }, (_, index) => {
        const micro = BigInt(Math.floor(next() * 5_000_000_000));
        const fromRaw = next() < 0.5;
        // Half the rows come in as a micro-unit integer string (XO), half as a dollar decimal string (Polymarket).
        const value = fromRaw ? fromMicro("usdc_e", micro.toString()) : q("usdc_e", `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, "0")}`);
        expectedMicro += micro;
        return { ...row({ id: String(index), collateral: "usdc_e" }), value };
      });
      const total = summarize(rows).value[0]?.total;
      expect(total, `round ${round}`).not.toBeNull();
      // 670000 micro is 0.67 dollars: converting back to micro must give the exact integer sum, no drift.
      expect((total as NonNullable<typeof total>).atomic * 10n ** BigInt(6 - (total as NonNullable<typeof total>).scale)).toBe(expectedMicro);
    }
  });

  it("a raw micro integer is 0.67, never 670000, once it is a quantity", () => {
    const value = fromMicro("usd", "670000");
    expect(toDec(value as never)).toBe("0.67");
    expect(toDec(sumRows([{ unit: "usd", value }, { unit: "usd", value: fromMicro("usd", "330000") }])[0]?.total as never)).toBe("1");
  });

  it("mixing units is a programming error that throws, it never produces a number", () => {
    expect(() => sumRows([{ unit: "usd", value: q("tyd", "1") }])).toThrow(UnitMismatchError);
    expect(() => summarize([{ ...row({ id: "bad", collateral: "usd" }), value: q("tyd", "1") }])).toThrow(UnitMismatchError);
  });

  it("base-unit helpers refuse what is not an exact integer", () => {
    expect(fromBaseUnits("usd", "1.5", 6)).toBeNull();
    expect(fromBaseUnits("usd", "-1", 6)).toBeNull();
    expect(fromBaseUnits("usd", 12, 6)).toBeNull();
    // A bigint is exact, but a negative one is still not a base-unit amount (TM-11).
    expect(fromBaseUnits("usd", -1n, 6)).toBeNull();
    expect(toDec(fromBaseUnits("usd", 1_500_000n, 6) as never)).toBe("1.5");
  });
});
