// What the Holdings view of the Markets surface needs from the portfolio readers: the positions of every watched
// address at the venues selected for it, and the set of (venue, outcome token) keys those positions name, so a
// market row can be marked "held" by an exact join and never by its title.
//
// Nothing is read until an address is watched AND a venue is selected for it (the plan says why otherwise), nothing
// polls, and a refresh is a button press (usePortfolio).

import { useMemo } from "react";

import { useBindingsState } from "../wallet/services";
import { usePortfolio, type PortfolioQuery } from "./usePortfolio";
import type { PortfolioRow, VenueReadOk, VenueReadOutcome } from "./types";

export type HoldingsState =
  // The saved addresses are still being read from the browser's own storage.
  | { readonly kind: "loading" }
  | { readonly kind: "no_address" }
  | { readonly kind: "no_venue" }
  | { readonly kind: "reading"; readonly query: PortfolioQuery }
  | { readonly kind: "error"; readonly query: PortfolioQuery }
  | { readonly kind: "ready"; readonly query: PortfolioQuery; readonly ok: readonly VenueReadOk[]; readonly others: readonly Exclude<VenueReadOutcome, VenueReadOk>[]; readonly rows: readonly PortfolioRow[] };

export interface Holdings {
  readonly state: HoldingsState;
  // holdingKey(venue, tokenId) of every position row with a token id. Empty until positions are read.
  readonly keys: ReadonlySet<string>;
  // How many addresses are watched (0 while loading).
  readonly addresses: number;
  readonly refresh: () => void;
}

function keyOf(venue: string, tokenId: string): string {
  return `${venue}:${tokenId.toLowerCase()}`;
}

export function useHoldings(): Holdings {
  const bindings = useBindingsState();
  const portfolio = usePortfolio(bindings.bindings, bindings.switches, bindings.status === "ready");

  const ok = useMemo(() => portfolio.outcomes.filter((outcome): outcome is VenueReadOk => outcome.kind === "ok"), [portfolio.outcomes]);
  const others = useMemo(() => portfolio.outcomes.filter((outcome): outcome is Exclude<VenueReadOutcome, VenueReadOk> => outcome.kind !== "ok"), [portfolio.outcomes]);
  const rows = useMemo(() => ok.flatMap((outcome) => outcome.rows), [ok]);
  const keys = useMemo(() => {
    const out = new Set<string>();
    for (const row of rows) if (row.tokenId !== null && row.tokenId !== "") out.add(keyOf(row.venue, row.tokenId));
    return out;
  }, [rows]);

  let state: HoldingsState;
  if (bindings.status === "loading") state = { kind: "loading" };
  else if (bindings.bindings.length === 0) state = { kind: "no_address" };
  else if (!bindings.bindings.some((binding) => binding.venues.length > 0)) state = { kind: "no_venue" };
  else if (portfolio.status === "error") state = { kind: "error", query: portfolio };
  else if (portfolio.status === "ready") state = { kind: "ready", query: portfolio, ok, others, rows };
  else state = { kind: "reading", query: portfolio };

  return { state, keys, addresses: bindings.bindings.length, refresh: portfolio.refresh };
}
