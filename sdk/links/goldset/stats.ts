// Small statistics helpers for the gold-set report. These are estimates about classifiers, not
// money, so ordinary floating point is fine here.

export const Z_95 = 1.96;

export interface Bound {
  readonly k: number;
  readonly n: number;
  // Null when n is 0: an empty denominator is unknown, never zero.
  readonly point: number | null;
  readonly lower: number | null;
  readonly upper: number | null;
}

export function wilson(k: number, n: number, z = Z_95): Bound {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new Error("wilson: need integers with 0 <= k <= n");
  }
  if (n === 0) return { k, n, point: null, lower: null, upper: null };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { k, n, point: p, lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}

// Smallest sample size whose Wilson lower bound reaches `target` with at most `failures` misses.
// Zero failures at 0.97 gives 125 (design 13.1). Null if the target is out of reach.
export function requiredSampleSize(target: number, failures: number, z = Z_95): number | null {
  for (let n = failures + 1; n <= 200_000; n++) {
    const b = wilson(n - failures, n, z);
    if (b.lower !== null && b.lower >= target) return n;
  }
  return null;
}

// Cohen's kappa for two raters over categorical labels. Null when there are no pairs or the
// expected agreement is 1 (a single category), where kappa is undefined.
export function cohenKappa(pairs: readonly (readonly [string, string])[]): number | null {
  const n = pairs.length;
  if (n === 0) return null;
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  let agree = 0;
  for (const [a, b] of pairs) {
    countA.set(a, (countA.get(a) ?? 0) + 1);
    countB.set(b, (countB.get(b) ?? 0) + 1);
    if (a === b) agree += 1;
  }
  const observed = agree / n;
  let expected = 0;
  for (const [label, ca] of countA) expected += (ca / n) * ((countB.get(label) ?? 0) / n);
  if (expected >= 1) return null;
  return (observed - expected) / (1 - expected);
}
