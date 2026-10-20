// Exact descriptive statistics over rationals. Nearest-rank quantiles, no interpolation, no
// floating point. Output values are decimal strings.

import { cmp, ratToDec, type Rational } from "../core/rational.js";

export interface Dist {
  readonly n: number;
  readonly min: string;
  readonly p05: string;
  readonly p25: string;
  readonly p50: string;
  readonly p75: string;
  readonly p95: string;
  readonly max: string;
}

export function quantileSorted(sorted: readonly Rational[], q: number): Rational {
  if (sorted.length === 0) throw new RangeError("empty sample");
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length)));
  return sorted[rank - 1] as Rational;
}

export function dist(values: readonly Rational[], places = 6): Dist | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => cmp(a, b));
  const f = (v: Rational): string => ratToDec(v, places, "half_even");
  return {
    n: sorted.length,
    min: f(sorted[0] as Rational),
    p05: f(quantileSorted(sorted, 0.05)),
    p25: f(quantileSorted(sorted, 0.25)),
    p50: f(quantileSorted(sorted, 0.5)),
    p75: f(quantileSorted(sorted, 0.75)),
    p95: f(quantileSorted(sorted, 0.95)),
    max: f(sorted[sorted.length - 1] as Rational),
  };
}

export interface CountDist {
  readonly n: number;
  readonly median: number;
  readonly p90: number;
  readonly max: number;
}

export function countDist(values: readonly number[]): CountDist | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length, Math.max(1, Math.ceil(q * s.length))) - 1] as number;
  return { n: s.length, median: at(0.5), p90: at(0.9), max: s[s.length - 1] as number };
}

// Splits a time-ordered series into runs where `flag` holds, never joining observations that are
// further apart than maxGapMs (a recorder gap ends a run: persistence across a gap is unknown).
export interface Episode {
  readonly startMs: number;
  readonly endMs: number;
  readonly nObs: number;
}

// A point may carry its own `gapMs`: the longest silence allowed AFTER it (the same rule gap
// detection uses, so a report never counts a gap and then bridges it). Without one, `maxGapMs` applies.
export function episodes(
  series: readonly { readonly tMs: number; readonly flag: boolean; readonly gapMs?: number }[],
  maxGapMs: number,
): Episode[] {
  const out: Episode[] = [];
  let cur: { startMs: number; endMs: number; nObs: number } | null = null;
  let prevT: number | null = null;
  let prevLimit = maxGapMs;
  for (const p of series) {
    const broken = prevT !== null && p.tMs - prevT > prevLimit;
    if (cur !== null && (broken || !p.flag)) {
      out.push(cur);
      cur = null;
    }
    if (p.flag) {
      if (cur === null) cur = { startMs: p.tMs, endMs: p.tMs, nObs: 1 };
      else {
        cur.endMs = p.tMs;
        cur.nObs += 1;
      }
    }
    prevT = p.tMs;
    prevLimit = p.gapMs ?? maxGapMs;
  }
  if (cur !== null) out.push(cur);
  return out;
}
