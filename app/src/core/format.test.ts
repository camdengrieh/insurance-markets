import { describe, expect, it } from "vitest";

import { NULL_TEXT, formatAge, formatDurationMs, formatPercent, formatPriceCents, formatQty, formatUsd, formatUtc, parseIsoMs, shortAddress } from "./format";
import { parseQty, type Qty, type QtyUnit } from "./money";

function q(unit: QtyUnit, text: string): Qty {
  const parsed = parseQty(unit, text, { allowNegative: true });
  if (parsed === null) throw new Error(`bad fixture ${text}`);
  return parsed;
}

describe("formatQty", () => {
  it("prints a missing value as n/a, never as zero", () => {
    expect(formatQty(null)).toBe(NULL_TEXT);
    expect(formatUsd(null)).toBe("n/a");
    expect(formatQty(q("usd", "0"))).toBe("$0.00");
  });

  it("labels the unit and groups thousands", () => {
    expect(formatQty(q("usd", "1234567.891"))).toBe("$1,234,567.89");
    expect(formatQty(q("usdc_e", "12.5"))).toBe("12.50 USDC.e");
    expect(formatQty(q("tyd", "3"))).toBe("3.00 TYD");
    expect(formatQty(q("shares", "12.5"))).toBe("12.50 shares");
    expect(formatQty(q("shares", "12.123456"), { places: 6 })).toBe("12.123456 shares");
    expect(formatQty(q("usd", "-5.5"))).toBe("-$5.50");
    expect(formatQty(q("usd", "5.5"), { plus: true })).toBe("+$5.50");
  });

  it("never shows a non-zero amount as zero", () => {
    expect(formatQty(q("usd", "0.004"))).toBe("<$0.01");
    expect(formatQty(q("usd", "-0.004"))).toBe("-<$0.01");
    expect(formatQty(q("shares", "0.0000001"), { places: 6 })).toBe("<0.000001 shares");
  });

  it("rounds toward zero by default and half-up on request", () => {
    expect(formatQty(q("usd", "1.999"))).toBe("$1.99");
    expect(formatQty(q("usd", "1.995"), { mode: "half_up" })).toBe("$2.00");
  });

  it("formatUsd refuses another unit", () => {
    expect(() => formatUsd(q("usdc_e", "1"))).toThrow(RangeError);
  });
});

describe("prices and probabilities", () => {
  it("prints cents and percent with one decimal", () => {
    expect(formatPriceCents(q("price", "0.534"))).toBe("53.4c");
    expect(formatPriceCents(q("price", "0.5"))).toBe("50.0c");
    expect(formatPriceCents(q("price", "1"))).toBe("100.0c");
    expect(formatPriceCents(q("price", "0.001"))).toBe("0.1c");
    expect(formatPercent(q("price", "0.534"))).toBe("53.4%");
    expect(formatPercent(q("price", "0"))).toBe("0.0%");
    expect(formatPriceCents(null)).toBe("n/a");
    expect(formatPercent(null)).toBe("n/a");
  });

  it("does not turn an out-of-range price into a percent", () => {
    expect(formatPercent(q("price", "1.5"))).toBe("n/a");
    expect(formatPercent(q("price", "-0.1"))).toBe("n/a");
    expect(formatPriceCents(q("price", "2"))).toBe("2.000");
  });
});

describe("time", () => {
  it("prints UTC, never local time", () => {
    expect(formatUtc(Date.UTC(2026, 9, 19, 9, 30, 5))).toBe("2026-10-19 09:30:05 UTC");
    expect(formatUtc(Date.UTC(2026, 9, 19, 9, 30, 5), false)).toBe("2026-10-19 09:30 UTC");
    expect(formatUtc(null)).toBe("n/a");
    expect(formatUtc(Number.NaN)).toBe("n/a");
  });

  it("parses ISO timestamps strictly and reads a bare date-time as UTC", () => {
    expect(parseIsoMs("2026-10-19T09:30:05Z")).toBe(Date.UTC(2026, 9, 19, 9, 30, 5));
    expect(parseIsoMs("2026-10-19T09:30:05+02:00")).toBe(Date.UTC(2026, 9, 19, 7, 30, 5));
    expect(parseIsoMs("2026-10-19T09:30:05")).toBe(Date.UTC(2026, 9, 19, 9, 30, 5));
    expect(parseIsoMs("2026-10-19")).toBe(Date.UTC(2026, 9, 19));
    expect(parseIsoMs("tomorrow")).toBeNull();
    expect(parseIsoMs("2026-13-45T00:00:00Z")).toBeNull();
    expect(parseIsoMs(12345)).toBeNull();
    expect(parseIsoMs("")).toBeNull();
  });

  it("prints ages and flags a time in the future", () => {
    const now = 1_000_000_000_000;
    expect(formatAge(now, now - 12_000)).toBe("12 s ago");
    expect(formatAge(now, now - 5 * 60_000)).toBe("5 min ago");
    expect(formatAge(now, now - 3 * 3_600_000)).toBe("3 h ago");
    expect(formatAge(now, now - 5 * 86_400_000)).toBe("5 d ago");
    expect(formatAge(now, now + 60_000)).toBe("in the future");
    expect(formatAge(now, null)).toBe("n/a");
    expect(formatDurationMs(45_000)).toBe("45 s");
    expect(formatDurationMs(10 * 60_000)).toBe("10 min");
    expect(formatDurationMs(-1)).toBe("n/a");
  });
});

describe("addresses", () => {
  it("shortens only a well-formed address", () => {
    expect(shortAddress("0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d")).toBe("0xB3729F...75d30d");
    expect(shortAddress("not an address")).toBe("n/a");
  });
});
