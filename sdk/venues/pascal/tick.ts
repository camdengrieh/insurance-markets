import type { Dec, TickRanges } from "../../model.js";

// Pascal's tick (research 4, section 2): `tick = max(10^(p_sigs - sig_figs), tick_size_min)` with
// `p' = min(p, 1 - p)` and `p_sigs` the number of digits left of the first significant figure of p' (0.15 has
// p_sigs 0, 0.093 has -1). So the grid is finest near 0 and 1 and coarsest at 0.5, symmetric about 0.5.
// All arithmetic is in millionths (prices have 6 decimals) as bigint; nothing is floating point.
//
// Checked against the recorded HOUSE_2026_CTRL.DEM book (sig figs 2, minimum 0.001): every bid and ask lies on
// the grid (tick.test.ts).

const ONE = 1_000_000n;
const POW10: bigint[] = [1n];
function pow10(n: number): bigint {
  while (POW10.length <= n) POW10.push((POW10[POW10.length - 1] ?? 1n) * 10n);
  return POW10[n] ?? 1n;
}

function digitsOf(value: bigint): number {
  return value.toString().length;
}

// Tick for a price given in millionths, in millionths.
export function tickMicroAt(priceMicro: bigint, sigFigs: number, minMicro: bigint): bigint {
  const mirrored = priceMicro < ONE - priceMicro ? priceMicro : ONE - priceMicro;
  if (mirrored <= 0n) return minMicro;
  // p' has d digits in millionths, so p_sigs = d - 6 and 10^(p_sigs - sf) dollars = 10^(d - sf) millionths.
  const exponent = digitsOf(mirrored) - sigFigs;
  const natural = exponent <= 0 ? 1n : pow10(exponent);
  return natural > minMicro ? natural : minMicro;
}

export function isOnGrid(priceMicro: bigint, sigFigs: number, minMicro: bigint): boolean {
  if (priceMicro <= 0n || priceMicro >= ONE) return false;
  return priceMicro % tickMicroAt(priceMicro, sigFigs, minMicro) === 0n;
}

function decOfMicro(value: bigint): Dec {
  const digits = value.toString().padStart(7, "0");
  const whole = digits.slice(0, digits.length - 6);
  const fraction = digits.slice(digits.length - 6).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

interface Segment {
  from: bigint;
  to: bigint;
  tick: bigint;
}

// The whole grid as ranges over 0.000001 to 0.999999, both ends inclusive, adjacent equal ticks merged. One
// range for the whole book comes back as a single Dec.
export function tickFor(sigFigs: number, minMicro: bigint): Dec | TickRanges {
  const segments: Segment[] = [];
  const half = ONE / 2n;
  // Low half: p in [10^(d-1), 10^d - 1], capped at 0.5.
  for (let digits = 1; digits <= 6; digits += 1) {
    const from = pow10(digits - 1);
    const to = pow10(digits) - 1n > half ? half : pow10(digits) - 1n;
    if (from > half) break;
    segments.push({ from, to, tick: tickMicroAt(from, sigFigs, minMicro) });
  }
  // High half mirrors it: p' = 1 - p.
  for (let digits = 6; digits >= 1; digits -= 1) {
    const mirroredFrom = pow10(digits - 1);
    const mirroredTo = pow10(digits) - 1n > half ? half : pow10(digits) - 1n;
    if (mirroredFrom > half) continue;
    const from = ONE - mirroredTo;
    const to = ONE - mirroredFrom;
    // 0.5 belongs to the low half already.
    const start = from <= half ? half + 1n : from;
    if (start > to) continue;
    segments.push({ from: start, to, tick: tickMicroAt(mirroredFrom, sigFigs, minMicro) });
  }
  segments.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.tick === segment.tick && last.to + 1n === segment.from) last.to = segment.to;
    else merged.push({ ...segment });
  }
  const only = merged[0];
  if (merged.length === 1 && only !== undefined) return decOfMicro(only.tick);
  return merged.map((segment) => ({ from: decOfMicro(segment.from), to: decOfMicro(segment.to), tick: decOfMicro(segment.tick) }));
}
