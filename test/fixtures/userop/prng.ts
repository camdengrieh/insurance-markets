// A tiny seeded generator for property-style tests: same seed, same sequence, on every machine and every
// run. (No Math.random and no clock anywhere in these tests.)

export interface Prng {
  // Next 32-bit unsigned integer.
  next(): number;
  // Integer in [0, bound).
  below(bound: number): number;
  // `count` bytes as lower-case hex without a prefix.
  hex(count: number): string;
  bigint(bits: number): bigint;
}

// mulberry32
export function seededRandom(seed: number): Prng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    next,
    below: (bound) => next() % bound,
    hex: (count) => Array.from({ length: count }, () => (next() & 0xff).toString(16).padStart(2, "0")).join(""),
    bigint: (bits) => {
      let n = 0n;
      for (let i = 0; i < bits; i += 32) n = (n << 32n) | BigInt(next());
      return n & ((1n << BigInt(bits)) - 1n);
    },
  };
}
