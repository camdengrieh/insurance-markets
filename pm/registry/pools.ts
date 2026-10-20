// Pool derivation (docs/platform-registry-design.md 3.10). Pools, not venues, are the unit of
// independence: records whose books are shared (same_book, routes_to) collapse into one pool.
// mirror_of and settles_on never merge pools. Pure and deterministic.

import { isRegistryVenueId, type RegistryVenueId } from "./ids.js";
import type { LiquidityLink } from "./types.js";

export interface PoolInput {
  readonly id: RegistryVenueId;
  readonly liquidityLinks: readonly LiquidityLink[];
}

export interface PoolResult {
  // Maps every input id to its pool representative (the smallest id in the pool).
  readonly poolOf: ReadonlyMap<RegistryVenueId, RegistryVenueId>;
  // Link targets that are not in the input set, or non-registry ids. Fail closed: reported, never merged.
  readonly dangling: readonly string[];
}

export function derivePools(inputs: readonly PoolInput[]): PoolResult {
  const parent = new Map<RegistryVenueId, RegistryVenueId>();
  for (const input of inputs) parent.set(input.id, input.id);

  const find = (x: RegistryVenueId): RegistryVenueId => {
    let root = x;
    for (;;) {
      const next = parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    return root;
  };

  const dangling: string[] = [];
  for (const input of inputs) {
    for (const link of input.liquidityLinks) {
      if (!isRegistryVenueId(link.target) || !parent.has(link.target)) {
        dangling.push(`${input.id}->${String(link.target)}`);
        continue;
      }
      if (link.relation !== "same_book" && link.relation !== "routes_to") continue;
      const a = find(input.id);
      const b = find(link.target);
      if (a === b) continue;
      // Keep the smaller id as the root so the representative is stable regardless of order.
      if (a < b) parent.set(b, a);
      else parent.set(a, b);
    }
  }

  const poolOf = new Map<RegistryVenueId, RegistryVenueId>();
  for (const input of inputs) poolOf.set(input.id, find(input.id));
  return { poolOf, dangling };
}
