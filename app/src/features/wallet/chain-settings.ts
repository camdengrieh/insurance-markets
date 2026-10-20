// Which chains the wallet map lists (docs/dapp-design.md 7.2 M2-8: "the same derived account is listed per
// enabled chain"). Chain ids only, no address and no balance, so it may live in the user's IndexedDB.

import * as z from "zod/v4";

import { ACCOUNT_CHAINS, chainById, type AccountChain } from "../../core/account";
import type { RecordStore } from "../../core/bindings";

const CHAINS_ID = "wallet_chains";
const schema = z.object({ id: z.literal(CHAINS_ID), chainIds: z.array(z.number().int().positive()).max(32) }).strict();

// Default: every chain the account map knows, so a new user sees the whole map, each row with its own state.
export const DEFAULT_ENABLED_CHAINS: readonly number[] = Object.freeze(ACCOUNT_CHAINS.map((chain) => chain.chainId));

export function chainsFromIds(ids: readonly number[]): readonly AccountChain[] {
  // Registry order, not storage order, and only chains the app knows: an unknown stored id is dropped.
  return ACCOUNT_CHAINS.filter((chain) => ids.includes(chain.chainId));
}

export async function loadEnabledChains(store: RecordStore): Promise<readonly number[]> {
  try {
    for (const raw of await store.getAll()) {
      const parsed = schema.safeParse(raw);
      if (parsed.success) return Object.freeze(parsed.data.chainIds.filter((id) => chainById(id) !== undefined));
    }
  } catch {
    // Unreadable storage means the defaults.
  }
  return DEFAULT_ENABLED_CHAINS;
}

export async function saveEnabledChains(store: RecordStore, chainIds: readonly number[]): Promise<void> {
  await store.put({ id: CHAINS_ID, chainIds: chainIds.filter((id) => chainById(id) !== undefined) });
}

export function toggleChain(current: readonly number[], chainId: number, enabled: boolean): readonly number[] {
  const rest = current.filter((id) => id !== chainId);
  return Object.freeze(enabled && chainById(chainId) !== undefined ? [...rest, chainId] : rest);
}
