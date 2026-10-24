// The one balance the account panel shows (docs/unified-account-design.md section 1, "Money"): a sum of lines, each a
// dollar amount in millionths (USDC, pUSD and XO's USDC.e all have 6 decimals). The account's own lines are E's USDC on
// Base and Polygon; the venues add theirs (a Polymarket wallet's pUSD, the XO account's balance, open positions) through
// registerBalanceSource, from their side, so this module imports nothing of theirs.
//
// A line whose read failed is null and is never counted as zero: the total then says it is incomplete.

import type { Address } from "viem";

import { MONEY_CHAINS } from "./constants";
import { readUsdcBalances } from "./money";
import type { ChainCalls } from "./reads";
import type { TradingAccount } from "./types";

export interface BalanceLine {
  // Stable across reads, unique within its source ("usdc-8453").
  readonly id: string;
  // Fixed app words: "USDC on Base", "Polymarket cash".
  readonly label: string;
  // US dollars in millionths; null when the read failed.
  readonly micros: bigint | null;
}

export interface BalanceSource {
  readonly id: string;
  read(acct: TradingAccount): Promise<readonly BalanceLine[]>;
}

const sources: BalanceSource[] = [];
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of [...listeners]) listener();
}

// Adds a source (or replaces the one with the same id). Returns a function that removes it again.
export function registerBalanceSource(source: BalanceSource): () => void {
  const index = sources.findIndex((entry) => entry.id === source.id);
  if (index === -1) sources.push(source);
  else sources[index] = source;
  changed();
  return () => {
    const at = sources.indexOf(source);
    if (at !== -1) {
      sources.splice(at, 1);
      changed();
    }
  };
}

export function balanceSources(): readonly BalanceSource[] {
  return [...sources];
}

export function subscribeBalanceSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The account's own USDC on Base and Polygon.
export function accountUsdcSource(calls: ChainCalls): BalanceSource {
  return {
    id: "account-usdc",
    async read(acct) {
      return Promise.all(
        MONEY_CHAINS.map(async (chain) => {
          const [micros] = await readUsdcBalances(calls, chain.chainId, [acct.address as Address]);
          return { id: `usdc-${chain.chainId}`, label: `USDC on ${chain.name}`, micros: micros ?? null };
        }),
      );
    },
  };
}

export interface BalanceTotal {
  readonly micros: bigint;
  // False when any line could not be read: the total is then a floor, not the balance.
  readonly complete: boolean;
}

export function totalOf(lines: readonly BalanceLine[]): BalanceTotal {
  let micros = 0n;
  let complete = true;
  for (const line of lines) {
    if (line.micros === null) complete = false;
    else micros += line.micros;
  }
  return { micros, complete };
}

// Every line from the account's own source and every registered one. A source that throws contributes one unread line.
export async function readAllBalances(acct: TradingAccount, own: BalanceSource, extra: readonly BalanceSource[]): Promise<readonly BalanceLine[]> {
  const all = [own, ...extra.filter((source) => source.id !== own.id)];
  const results = await Promise.all(
    all.map(async (source): Promise<readonly BalanceLine[]> => {
      try {
        return await source.read(acct);
      } catch {
        return [{ id: `${source.id}-unread`, label: "A venue balance", micros: null }];
      }
    }),
  );
  return results.flat();
}
