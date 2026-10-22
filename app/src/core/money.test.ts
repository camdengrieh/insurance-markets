import { describe, expect, it } from "vitest";

import { UnitMismatchError } from "./errors";
import {
  addQty,
  cmpQty,
  decFromNumber,
  eqQty,
  fromBaseUnits,
  fromMicro,
  isZero,
  mulBps,
  negQty,
  notional,
  parseQty,
  roundQty,
  subQty,
  sumRows,
  toBaseUnits,
  toDec,
  toFixedText,
  toMicro,
  zero,
  type Qty,
  type QtyUnit,
  type TotalRow,
} from "./money";

// Fixed-seed generator: the same sequence on every run.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function q(unit: QtyUnit, text: string): Qty {
  const parsed = parseQty(unit, text, { allowNegative: true });
  if (parsed === null) throw new Error(`bad fixture ${text}`);
  return parsed;
}

describe("parseQty", () => {
  it("parses plain decimals exactly and normalises trailing zeros", () => {
    expect(toDec(q("usd", "0.534"))).toBe("0.534");
    expect(toDec(q("usd", "12.500"))).toBe("12.5");
    expect(toDec(q("usd", "0"))).toBe("0");
    expect(toDec(q("usd", "0.000000"))).toBe("0");
    expect(toDec(q("usd", "-1.5"))).toBe("-1.5");
    expect(toDec(q("shares", "123456789012345678901234567890.000001"))).toBe("123456789012345678901234567890.000001");
  });

  it("refuses everything that is not an exact plain decimal", () => {
    for (const bad of ["", " 1", "1 ", "1e3", "1E3", "0x10", ".5", "5.", "+1", "1,000", "1_000", "01", "00.5", "-", "--1", "1.2.3", "NaN", "Infinity", "１２", "1 ", "٣"]) {
      expect(parseQty("usd", bad, { allowNegative: true }), JSON.stringify(bad)).toBeNull();
    }
    expect(parseQty("usd", 5)).toBeNull();
    expect(parseQty("usd", null)).toBeNull();
    expect(parseQty("usd", undefined)).toBeNull();
    expect(parseQty("usd", "1".repeat(41))).toBeNull();
  });

  it("refuses a negative number unless asked, and refuses more places than the limit", () => {
    expect(parseQty("usd", "-1")).toBeNull();
    expect(parseQty("usd", "0.1234567", { maxScale: 6 })).toBeNull();
    // Trailing zeros count as places (the shared grammar, sdk/money/decimal.ts): "0.1234560" carries seven.
    expect(parseQty("usd", "0.1234560", { maxScale: 6 })).toBeNull();
    expect(toDec(parseQty("usd", "0.123450", { maxScale: 6 }) as Qty)).toBe("0.12345");
    expect(parseQty("usd", `0.${"1".repeat(19)}`)).toBeNull();
  });

  it("treats -0 as zero", () => {
    const z = q("usd", "-0.00");
    expect(isZero(z)).toBe(true);
    expect(toDec(z)).toBe("0");
  });
});

describe("micro-units and base units", () => {
  it("turns XO micro-unit integers into real quantities at once", () => {
    expect(toDec(fromMicro("usd", "670000") as Qty)).toBe("0.67");
    expect(toDec(fromMicro("shares", "1500000") as Qty)).toBe("1.5");
    expect(toDec(fromMicro("shares", "1") as Qty)).toBe("0.000001");
    expect(fromMicro("usd", "0.67")).toBeNull();
    expect(fromMicro("usd", "-5")).toBeNull();
    expect(fromMicro("usd", "1e6")).toBeNull();
    expect(fromMicro("usd", 670000)).toBeNull();
    expect(toDec(fromMicro("usd", 670000n) as Qty)).toBe("0.67");
  });

  it("handles 18-decimal tokens and Limitless 1e6 sizes", () => {
    expect(toDec(fromBaseUnits("shares", "1000000000000000000", 18) as Qty)).toBe("1");
    expect(toDec(fromBaseUnits("shares", "1", 18) as Qty)).toBe("0.000000000000000001");
    expect(fromBaseUnits("shares", "5", 37)).toBeNull();
  });

  it("converts back to base units only when exact", () => {
    expect(toMicro(q("usd", "0.67"))).toBe(670000n);
    expect(toMicro(q("usd", "0.0000001"))).toBeNull();
    expect(toBaseUnits(q("usd", "1.5"), 18)).toBe(1_500_000_000_000_000_000n);
  });

  it("a raw micro integer parsed as dollars is a different number from the same integer read as micro", () => {
    const asDollars = parseQty("usd", "670000") as Qty;
    const asMicro = fromMicro("usd", "670000") as Qty;
    expect(toDec(asDollars)).toBe("670000");
    expect(toDec(asMicro)).toBe("0.67");
    expect(eqQty(asDollars, asMicro)).toBe(false);
  });
});

describe("decFromNumber", () => {
  it("expands JSON numbers exactly and refuses what it cannot", () => {
    expect(decFromNumber(0.534)).toBe("0.534");
    expect(decFromNumber(12)).toBe("12");
    expect(decFromNumber(-3.25)).toBe("-3.25");
    expect(decFromNumber(1e-7)).toBe("0.0000001");
    expect(decFromNumber(1.5e-7)).toBe("0.00000015");
    expect(decFromNumber(2e21)).toBeNull();
    expect(decFromNumber(Number.MAX_SAFE_INTEGER + 2)).toBeNull();
    expect(decFromNumber(Number.NaN)).toBeNull();
    expect(decFromNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(decFromNumber("1")).toBeNull();
    expect(decFromNumber(1e-40)).toBeNull();
  });
});

describe("arithmetic", () => {
  it("adds, subtracts and compares exactly across scales", () => {
    const a = q("usd", "0.1");
    const b = q("usd", "0.2");
    expect(toDec(addQty(a, b))).toBe("0.3");
    expect(toDec(subQty(a, b))).toBe("-0.1");
    expect(cmpQty(addQty(a, b), q("usd", "0.3"))).toBe(0);
    expect(cmpQty(a, b)).toBe(-1);
    expect(toDec(negQty(a))).toBe("-0.1");
  });

  it("refuses to combine different units", () => {
    expect(() => addQty(q("usd", "1"), q("shares", "1"))).toThrow(UnitMismatchError);
    expect(() => addQty(q("usd", "1"), q("usdc_e", "1"))).toThrow(UnitMismatchError);
    expect(() => addQty(q("usd", "1"), q("tyd", "1"))).toThrow(UnitMismatchError);
    expect(() => cmpQty(q("usd", "1"), q("price", "1"))).toThrow(UnitMismatchError);
  });

  it("rejects a bare bigint or string where a quantity is required (compile-time)", () => {
    // @ts-expect-error a raw bigint is not a quantity
    expect(() => addQty(670000n, q("usd", "1"))).toThrow();
    // @ts-expect-error a decimal string is not a quantity
    expect(() => addQty("1", q("usd", "1"))).toThrow();
  });

  it("multiplies shares by a price into a collateral amount without rounding", () => {
    expect(toDec(notional(q("shares", "12.5"), q("price", "0.534"), "usd"))).toBe("6.675");
    expect(toDec(notional(q("shares", "0.000001"), q("price", "0.001"), "usdc_e"))).toBe("0.000000001");
    expect(() => notional(q("usd", "1"), q("price", "0.5"), "usd")).toThrow(UnitMismatchError);
    expect(() => notional(q("shares", "1"), q("usd", "0.5"), "usd")).toThrow(UnitMismatchError);
    expect(() => notional(q("shares", "1"), q("price", "0.5"), "shares")).toThrow(UnitMismatchError);
  });

  it("applies basis points exactly", () => {
    expect(toDec(mulBps(q("usd", "100"), 800))).toBe("8");
    expect(toDec(mulBps(q("usd", "5.5"), 1000))).toBe("0.55");
    expect(() => mulBps(q("usd", "1"), -1)).toThrow(RangeError);
    expect(() => mulBps(q("usd", "1"), 1.5)).toThrow(RangeError);
  });

  it("rounds by an explicit mode on the magnitude", () => {
    const v = q("usd", "-1.005");
    expect(toDec(roundQty(v, 2, "down"))).toBe("-1");
    expect(toDec(roundQty(v, 2, "up"))).toBe("-1.01");
    expect(toDec(roundQty(v, 2, "half_up"))).toBe("-1.01");
    expect(toDec(roundQty(q("usd", "1.004"), 2, "half_up"))).toBe("1");
    expect(roundQty(q("usd", "1.5"), 4, "down")).toEqual(q("usd", "1.5"));
  });
});

describe("text", () => {
  it("prints fixed places and flags a non-zero value that rounds to zero", () => {
    expect(toFixedText(q("usd", "1234.5"), 2, "down", { thousands: true }).text).toBe("1,234.50");
    expect(toFixedText(q("usd", "0.004"), 2, "down")).toEqual({ text: "0.00", roundedToZero: true });
    expect(toFixedText(q("usd", "0"), 2)).toEqual({ text: "0.00", roundedToZero: false });
    // The default rounds toward zero: a display never rounds money up in the venue's favour (TM-11).
    expect(toFixedText(q("usd", "1.999"), 2).text).toBe("1.99");
    expect(toFixedText(q("usd", "-1.999"), 2).text).toBe("-1.99");
    expect(toFixedText(q("usd", "1.005"), 2).text).toBe("1.00");
    expect(toFixedText(q("usd", "-0.999"), 2, "half_up").text).toBe("-1.00");
    expect(toFixedText(q("usd", "5"), 0).text).toBe("5");
    expect(toFixedText(q("usd", "5"), 2, "down", { plus: true }).text).toBe("+5.00");
  });
});

describe("sumRows: null is not zero, units never mix", () => {
  it("counts excluded rows and returns null for an empty sum", () => {
    const rows: TotalRow[] = [
      { unit: "usd", value: q("usd", "1.25") },
      { unit: "usd", value: null },
      { unit: "usd", value: q("usd", "2.5") },
      { unit: "tyd", value: null },
      { unit: "usdc_e", value: q("usdc_e", "7") },
    ];
    const totals = sumRows(rows);
    expect(totals.map((t) => [t.unit, t.total === null ? null : toDec(t.total), t.included, t.excluded])).toEqual([
      ["usd", "3.75", 2, 1],
      ["tyd", null, 0, 1],
      ["usdc_e", "7", 1, 0],
    ]);
    expect(sumRows([])).toEqual([]);
  });

  it("throws when a row carries another unit than it claims", () => {
    expect(() => sumRows([{ unit: "usd", value: q("shares", "1") }])).toThrow(UnitMismatchError);
  });

  // M2-4 property: for many random portfolios, mixed dollar strings and micro-unit integers always total
  // to the exact bigint sum in micro-dollars, and no total is ever 10^6 off.
  it("property: totals of dollars and micro-unit rows equal the exact micro sum (500 random portfolios)", () => {
    const random = mulberry32(20261019);
    for (let round = 0; round < 500; round += 1) {
      const rows: TotalRow[] = [];
      let expectedMicro = 0n;
      let included = 0;
      let excluded = 0;
      const count = 1 + Math.floor(random() * 12);
      for (let index = 0; index < count; index += 1) {
        const kind = random();
        if (kind < 0.15) {
          rows.push({ unit: "usd", value: null });
          excluded += 1;
          continue;
        }
        const micro = BigInt(Math.floor(random() * 5_000_000_000));
        expectedMicro += micro;
        included += 1;
        if (kind < 0.6) {
          // The venue sent micro-units.
          rows.push({ unit: "usd", value: fromMicro("usd", micro.toString()) });
        } else {
          // The venue sent dollars with up to six places.
          const dollars = `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, "0")}`;
          rows.push({ unit: "usd", value: parseQty("usd", dollars) });
        }
      }
      const [total] = sumRows(rows);
      expect(total?.included).toBe(included);
      expect(total?.excluded).toBe(excluded);
      if (included === 0) {
        expect(total?.total).toBeNull();
      } else {
        expect(toMicro(total?.total ?? zero("usd"))).toBe(expectedMicro);
      }
    }
  });
});
