import { describe, expect, it } from "vitest";

import { qrModules } from "./PairingQr";

// The pairing QR's module matrix: square, with the quiet zone, and the three finder patterns where a scanner looks.

const URI = `wc:${"b".repeat(64)}@2?relay-protocol=irn&symKey=${"c".repeat(64)}&expiryTimestamp=1761220000`;

function finderAt(modules: boolean[][], top: number, left: number): boolean {
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      const ring = y === 0 || y === 6 || x === 0 || x === 6;
      const core = y >= 2 && y <= 4 && x >= 2 && x <= 4;
      if (modules[top + y]?.[left + x] !== (ring || core)) return false;
    }
  }
  return true;
}

describe("the pairing QR", () => {
  it("encodes a full pairing link into a square matrix with a four-module quiet zone and three finder patterns", () => {
    const modules = qrModules(URI);
    const size = modules.length;
    expect(modules.every((row) => row.length === size)).toBe(true);
    // A version 7 to 11 symbol for a link of this length at level M (45 to 61 modules) plus 2 x 4 of quiet zone.
    expect(size - 8).toBeGreaterThanOrEqual(45);
    expect(size - 8).toBeLessThanOrEqual(61);
    expect((size - 8 - 17) % 4).toBe(0);
    expect(modules[0]?.some(Boolean)).toBe(false);
    expect(modules.at(-1)?.some(Boolean)).toBe(false);
    expect(finderAt(modules, 4, 4)).toBe(true);
    expect(finderAt(modules, 4, size - 11)).toBe(true);
    expect(finderAt(modules, size - 11, 4)).toBe(true);
    expect(finderAt(modules, size - 11, size - 11)).toBe(false);
  });

  it("is deterministic and differs for another link", () => {
    expect(qrModules(URI)).toEqual(qrModules(URI));
    expect(qrModules(URI.replace("b", "d"))).not.toEqual(qrModules(URI));
  });
});
