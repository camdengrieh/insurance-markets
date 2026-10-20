// Deterministic stratified sampling of the pairs a generator surfaces, for labelling (design 13.1:
// sample what the system would surface, not random pairs). Fixed seed in, same sample out.

// mulberry32: small, fast, well-known 32-bit PRNG. Not for security.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sampled<T> {
  readonly stratum: string;
  readonly item: T;
}

// Up to `perStratum` items from each stratum, chosen by a seeded shuffle of the id-sorted items so
// the result does not depend on input order.
export function stratifiedSample<T>(
  items: readonly T[],
  stratumOf: (item: T) => string,
  idOf: (item: T) => string,
  perStratum: number,
  seed: number,
): Sampled<T>[] {
  if (!Number.isInteger(perStratum) || perStratum < 0) throw new Error("perStratum must be a non-negative integer");
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = stratumOf(item);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [item]);
    else list.push(item);
  }
  const rng = mulberry32(seed);
  const out: Sampled<T>[] = [];
  for (const stratum of [...groups.keys()].sort()) {
    const list = [...(groups.get(stratum) as T[])].sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0));
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = list[i] as T;
      list[i] = list[j] as T;
      list[j] = tmp;
    }
    for (const item of list.slice(0, perStratum)) out.push({ stratum, item });
  }
  return out;
}
