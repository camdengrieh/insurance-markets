// Shared test helpers for pm/core. Not a test file.
import assert from "node:assert/strict";
import type { BookLevel, TokenRef } from "../../types.js";
import type { FeeSource } from "../../core/fee-specs.js";
import type { ParsedLevel } from "../../core/books.js";
import { dec, ratToDec, type Rational, type RoundMode } from "../../core/rational.js";

// Fixed clock: every fee spec below was "verified" a day before and lives for a year.
export const NOW_MS = Date.parse("2026-10-20T00:00:00Z");

export const SOURCE: FeeSource = {
  url: "https://example.invalid/fees",
  field: "feeSchedule",
  granularity: "market",
  verifiedAt: "2026-10-19",
  ttlSec: 365 * 24 * 3600,
};

export const YES: TokenRef = { venue: "xo", tokenId: "yes-token" };
export const NO: TokenRef = { venue: "xo", tokenId: "no-token" };

export function level(price: string, size: string): BookLevel {
  return { price, size };
}

export function ladder(levels: readonly (readonly [string, string])[]): ParsedLevel[] {
  return levels.map(([p, s]) => ({ price: dec(p), size: dec(s) }));
}

// Rounded decimal text of a rational for comparing against a documented figure.
export function at(value: Rational | null, places: number, mode: RoundMode = "half_up"): string {
  assert.notEqual(value, null);
  return ratToDec(value as Rational, places, mode);
}

// Deterministic PRNG (mulberry32) for property tests. Integer arithmetic only.
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  };
}

// Uniform integer in [lo, hi] from a raw 32-bit draw.
export function int(rand: () => number, lo: number, hi: number): number {
  return lo + (rand() % (hi - lo + 1));
}
