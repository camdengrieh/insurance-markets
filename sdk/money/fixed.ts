// Exact fixed-point values: bigint units plus an explicit scale, and the bridge to and from decimal strings.
// Floating point is never used for money, prices or share counts. `null` means unknown and is never zero.

import { formatAtomic, parseDecimalAtomic } from "./amount.js";

// Exact fixed-point value: the real number is units / 10^scale. Scale is 0..18 so it round-trips
// through the guardrail parser. Fixed values with different scales are never mixed implicitly;
// use `alignFixed` first. Micro-units (scale 6) are never added to dollars (scale 0) by accident
// because the scale travels with the value.
export interface Fixed {
  readonly units: bigint;
  readonly scale: number;
}

export type FixedResult =
  | { readonly ok: true; readonly value: Fixed }
  | { readonly ok: false; readonly reason: string };

// Reuses the same strict grammar as the money guardrail (src/guardrails/amount.ts). Extra
// precision beyond `scale` is rejected, never rounded.
export function decToFixed(input: unknown, scale: number): FixedResult {
  const parsed = parseDecimalAtomic(input, scale);
  return parsed.ok ? { ok: true, value: { units: parsed.value, scale } } : parsed;
}

// 534000n at scale 6 gives "0.534". Negative values keep their sign (edges can be negative).
export function fixedToDec(value: Fixed): string {
  return formatAtomic(value.units, value.scale);
}

// Rescales upward exactly (always lossless). Returns null when the target scale is smaller and
// the value would lose digits, so callers must handle precision loss explicitly.
export function rescaleFixed(value: Fixed, scale: number): Fixed | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) return null;
  if (scale >= value.scale) {
    return { units: value.units * 10n ** BigInt(scale - value.scale), scale };
  }
  const divisor = 10n ** BigInt(value.scale - scale);
  return value.units % divisor === 0n ? { units: value.units / divisor, scale } : null;
}

// Three-way compare across scales without rounding. Returns -1, 0 or 1.
export function compareFixed(a: Fixed, b: Fixed): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale);
  const x = a.units * 10n ** BigInt(scale - a.scale);
  const y = b.units * 10n ** BigInt(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}
