// Row and book builders for the portfolio tests. Pure code, no Node import. Nothing here is application code.

import { fromBaseUnits, parseQty, type Qty } from "../../core/money";
import type { Book, Prov } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { makeRow } from "./rows";
import type { CollateralUnit, PortfolioRow, RowStatus } from "./types";

export const NOW = 1_760_875_200_000;

export const prov: Prov = { venue: "polymarket", source: "test", fetchedAtMs: NOW, transport: "T0", freshness: "live", ttlMs: 30_000, license: "unknown" };

export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

export const q = (unit: Qty["unit"], text: string): Qty => must(parseQty(unit, text, { allowNegative: true }));

type Plain = Omit<Partial<PortfolioRow>, "id" | "status" | "collateral" | "value" | "claimable" | "qty" | "market">;

export function row(overrides: { id: string; status?: RowStatus; collateral?: CollateralUnit; symbol?: string; value?: string | null; claimable?: string | null; qty?: string | null; market?: string } & Plain): PortfolioRow {
  const collateral = overrides.collateral ?? "usd";
  const { id, status, symbol, value, claimable, qty, market, ...rest } = overrides;
  return {
    ...makeRow({
      id,
      venue: "polymarket",
      bindingId: "binding-1",
      holder: "0x1111111111111111111111111111111111111111",
      market: untrusted(market ?? "A market"),
      outcome: untrusted("Yes"),
      tokenId: `token-${id}`,
      qty: qty === null ? null : q("shares", qty ?? "10"),
      status: status ?? "open",
      collateral,
      collateralSymbol: symbol ?? (collateral === "usd" ? "pUSD" : collateral === "usdc_e" ? "USDC.e" : "TYD"),
      prov,
    }),
    value: value === undefined || value === null ? null : q(collateral, value),
    valueBasis: value === undefined || value === null ? "none" : "bid",
    claimable: claimable === undefined || claimable === null ? null : q(collateral, claimable),
    claimSource: claimable === undefined || claimable === null ? "none" : "settlement",
    ...rest,
  };
}

export function book(bids: ReadonlyArray<readonly [string, string]>, asks: ReadonlyArray<readonly [string, string]> = [], overrides: Partial<Book> = {}): Book {
  return {
    token: { venue: "polymarket", tokenId: "t" },
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    asOfMs: NOW,
    derived: "native",
    ...overrides,
  };
}

// A tiny seeded generator (mulberry32) so a property test is reproducible.
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { fromBaseUnits };
