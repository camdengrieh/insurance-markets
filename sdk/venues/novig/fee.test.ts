import { describe, expect, it } from "vitest";

import { parseQty, toDec, type Qty } from "../../money/qty.js";
import { takerFeeUsd } from "./fee.js";

const price = (text: string): Qty => parseQty("price", text) as Qty;
const shares = (text: string): Qty => parseQty("shares", text) as Qty;

describe("Novig taker fee c * P * (1 - P) * N", () => {
  it("reproduces the worked values of the research note at c = 0.06 (100 shares)", () => {
    expect(toDec(takerFeeUsd(price("0.06"), price("0.5"), shares("100")) as Qty)).toBe("1.5");
    expect(toDec(takerFeeUsd(price("0.06"), price("0.3"), shares("100")) as Qty)).toBe("1.26");
    expect(toDec(takerFeeUsd(price("0.06"), price("0.7"), shares("100")) as Qty)).toBe("1.26");
    expect(toDec(takerFeeUsd(price("0.06"), price("0.1"), shares("100")) as Qty)).toBe("0.54");
  });

  it("rounds half up to $0.00001, never to a cent", () => {
    // 0.06 * 0.333 * 0.667 * 0.01 = 0.000133266 -> 0.00013
    expect(toDec(takerFeeUsd(price("0.06"), price("0.333"), shares("0.01")) as Qty)).toBe("0.00013");
    // exactly half: 0.10 * 0.5 * 0.5 * 0.0002 = 0.000005 -> 0.00001 (half rounds up)
    expect(toDec(takerFeeUsd(price("0.1"), price("0.5"), shares("0.0002")) as Qty)).toBe("0.00001");
    // below half: 0.10 * 0.5 * 0.5 * 0.00019 = 0.00000475 -> 0
    expect(toDec(takerFeeUsd(price("0.1"), price("0.5"), shares("0.00019")) as Qty)).toBe("0");
  });

  it("is exact for large fills (no floating point)", () => {
    expect(toDec(takerFeeUsd(price("0.07"), price("0.123"), shares("123456789.01")) as Qty)).toBe("932218.51011");
  });

  it("returns null for a price at or outside the open unit interval, a negative coefficient and wrong units", () => {
    expect(takerFeeUsd(price("0.06"), price("1"), shares("1"))).toBeNull();
    expect(takerFeeUsd(price("0.06"), price("0"), shares("1"))).toBeNull();
    expect(takerFeeUsd(price("0.06"), price("1.2"), shares("1"))).toBeNull();
    expect(takerFeeUsd(parseQty("price", "-0.06", { allowNegative: true }) as Qty, price("0.5"), shares("1"))).toBeNull();
    expect(takerFeeUsd(parseQty("usd", "0.06") as Qty, price("0.5"), shares("1"))).toBeNull();
    expect(takerFeeUsd(price("0.06"), price("0.5"), parseQty("usd", "1") as Qty)).toBeNull();
  });
});
