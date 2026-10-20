import { describe, expect, it } from "vitest";

import type { TickRanges } from "../../core/ports";
import { decodeBase58, isSolanaAddress } from "./base58";
import { isOnGrid, tickFor, tickMicroAt } from "./tick";

function micro(dec: string): bigint {
  const [whole = "0", fraction = ""] = dec.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

describe("pascal tick: max(10^(p_sigs - sig_figs), tick_size_min) on p' = min(p, 1 - p)", () => {
  it("is symmetric about one half and finest near 0 and 1", () => {
    // Two significant figures, floor 0.001 (HOUSE_2026_CTRL.DEM).
    expect(tickMicroAt(905_000n, 2, 1000n)).toBe(1000n); // p' = 0.095
    expect(tickMicroAt(95_000n, 2, 1000n)).toBe(1000n);
    expect(tickMicroAt(890_000n, 2, 1000n)).toBe(10_000n); // p' = 0.11
    expect(tickMicroAt(110_000n, 2, 1000n)).toBe(10_000n);
    expect(tickMicroAt(500_000n, 2, 1000n)).toBe(10_000n);
    // Three significant figures never go below the floor here.
    expect(tickMicroAt(500_000n, 3, 1000n)).toBe(1000n);
    expect(tickMicroAt(123_000n, 1, 1000n)).toBe(100_000n);
  });

  it("agrees with the range table at the boundaries of every decade and on a dense sweep, for several parameter pairs", () => {
    const pairs: Array<[number, bigint]> = [
      [2, 1000n],
      [3, 1000n],
      [1, 1000n],
      [2, 100n],
      [4, 1n],
      [0, 10_000n],
    ];
    const prices = new Set<bigint>();
    for (let price = 1n; price < 1_000_000n; price += 997n) prices.add(price);
    for (let digits = 0; digits <= 6; digits += 1) {
      const edge = 10n ** BigInt(digits);
      for (const delta of [-2n, -1n, 0n, 1n, 2n]) {
        for (const candidate of [edge + delta, 1_000_000n - edge + delta]) if (candidate > 0n && candidate < 1_000_000n) prices.add(candidate);
      }
    }
    for (const [sigFigs, floor] of pairs) {
      const table = tickFor(sigFigs, floor);
      const ranges: TickRanges = typeof table === "string" ? [{ from: "0.000001", to: "0.999999", tick: table }] : table;
      const mismatches: string[] = [];
      for (const price of prices) {
        const range = ranges.find((r) => price >= micro(r.from) && price <= micro(r.to));
        if (range === undefined || micro(range.tick) !== tickMicroAt(price, sigFigs, floor)) mismatches.push(`price ${price} sf ${sigFigs} floor ${floor}`);
      }
      expect(mismatches).toEqual([]);
    }
  });

  it("returns one Dec when the grid is flat, and adjacent equal ranges are merged", () => {
    expect(tickFor(3, 1000n)).toBe("0.001");
    const table = tickFor(2, 1000n);
    expect(Array.isArray(table)).toBe(true);
    if (typeof table === "string") return;
    expect(table.map((r) => r.tick)).toEqual(["0.001", "0.01", "0.001"]);
    // Ranges are contiguous over 0.000001 to 0.999999.
    for (let i = 1; i < table.length; i += 1) expect(micro(table[i]?.from ?? "0")).toBe(micro(table[i - 1]?.to ?? "0") + 1n);
  });

  it("rejects 0, 1 and anything outside (0, 1) as off-grid", () => {
    expect(isOnGrid(0n, 2, 1000n)).toBe(false);
    expect(isOnGrid(1_000_000n, 2, 1000n)).toBe(false);
    expect(isOnGrid(-5n, 2, 1000n)).toBe(false);
    expect(isOnGrid(500_000n, 2, 1000n)).toBe(true);
    expect(isOnGrid(500_001n, 2, 1000n)).toBe(false);
  });
});

describe("pascal owner address: 32-byte base58 only", () => {
  it("accepts a real key shape and the all-zero key", () => {
    expect(isSolanaAddress("So11111111111111111111111111111111111111112")).toBe(true);
    expect(isSolanaAddress("11111111111111111111111111111111")).toBe(true);
    expect(decodeBase58("11111111111111111111111111111111")?.length).toBe(32);
  });

  it("rejects every character outside the alphabet, wrong lengths, URL syntax and hex addresses", () => {
    for (const bad of ["0".repeat(44), "I".repeat(44), "l".repeat(44), "O".repeat(44), "a/b", "..", " ", "", "1".repeat(45), "1".repeat(31), "So11111111111111111111111111111111111111112 ", "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d"]) {
      expect(isSolanaAddress(bad), bad).toBe(false);
    }
    expect(isSolanaAddress(undefined)).toBe(false);
    expect(isSolanaAddress(42)).toBe(false);
  });

  it("rejects text that decodes to the wrong number of bytes", () => {
    // 44 characters of 'z' decode to more than 32 bytes.
    expect(decodeBase58("z".repeat(44))?.length).toBeGreaterThan(32);
    expect(isSolanaAddress("z".repeat(44))).toBe(false);
  });
});
