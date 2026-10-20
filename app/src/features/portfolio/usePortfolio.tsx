import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AddressBinding } from "../../core/bindings";
import type { VenueSwitches } from "../../core/venue-policy";
import { useWalletServices, type WalletServices } from "../wallet/services";
import { createPortfolioAdapters, readAll, type PortfolioAdapters } from "./readers";
import { planReads, type PlannedRead } from "./targets";
import type { VenueReadOutcome } from "./types";

// Tests (and any future wiring) may supply the adapters; the real ones are built from the page's injected fetch.
const AdaptersContext = createContext<PortfolioAdapters | null>(null);

export function PortfolioAdaptersProvider({ adapters, children }: { readonly adapters: PortfolioAdapters; readonly children: ReactNode }) {
  return <AdaptersContext.Provider value={adapters}>{children}</AdaptersContext.Provider>;
}

function useAdapters(services: WalletServices): PortfolioAdapters {
  const provided = useContext(AdaptersContext);
  return useMemo(() => provided ?? createPortfolioAdapters(services.deps, services.mode), [provided, services]);
}

export interface PortfolioQuery {
  readonly planned: readonly PlannedRead[];
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly outcomes: readonly VenueReadOutcome[];
  readonly fetching: boolean;
  readonly refresh: () => void;
  readonly updatedAtMs: number | null;
}

// Reads the positions of every saved address at the venues the user selected for it. Nothing is read until the
// user has selected a venue, nothing polls, and a refresh is a button press (a hidden tab makes no requests).
export function usePortfolio(bindings: readonly AddressBinding[], switches: VenueSwitches, ready: boolean): PortfolioQuery {
  const services = useWalletServices();
  const adapters = useAdapters(services);
  const planned = useMemo(() => planReads(bindings, switches, services.mode), [bindings, switches, services.mode]);
  // The key names what is read, so adding or removing a venue for an address refetches and nothing else does.
  const key = planned.map((item) => `${item.kind}:${item.venue}:${item.binding.id}:${item.kind === "run" ? item.address : item.outcome.kind}`).join("|");

  const query = useQuery({
    queryKey: ["portfolio", services.mode, key],
    queryFn: () => readAll({ deps: services.deps, adapters, mode: services.mode }, planned),
    enabled: ready && planned.length > 0,
  });

  const outcomes = query.data ?? [];
  return {
    planned,
    status: !ready ? "loading" : planned.length === 0 ? "idle" : query.isError ? "error" : query.data === undefined ? "loading" : "ready",
    outcomes,
    fetching: query.isFetching,
    refresh: () => void query.refetch(),
    updatedAtMs: query.dataUpdatedAt === 0 ? null : query.dataUpdatedAt,
  };
}
