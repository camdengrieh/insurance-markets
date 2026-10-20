import { createContext, useContext, useMemo, type ReactNode } from "react";

import { NO_FACTS, type CapabilityFacts } from "../../core/capabilities";
import { useAppMode, type AppMode } from "../../ui";
import { useTerminalServices, type TerminalServices } from "../terminal/services";
import type { PageSession } from "../terminal/session";
import { TradeClient } from "./client";

// Everything the trade screens need from the outside, in one record, so a test injects a fake daemon, a fake clock
// and an in-memory address book. The session is the terminal screen's shared one: the pairing code can be exchanged
// only once per page load, so there must be exactly one place that does it (the same rule as the signing screen).

export interface OwnerChoice {
  readonly id: string;
  // The user's own label for the address. Still shown only in the untrusted slot.
  readonly label: string;
  readonly address: string;
}

export interface TradeServices {
  readonly mode: AppMode;
  readonly nowMs: () => number;
  readonly client: Pick<TradeClient, "callTool" | "hasToken">;
  readonly session: Pick<PageSession, "pair" | "token" | "forget">;
  // The saved addresses that can own an XO account (kind "eoa"). Loaded once per mount.
  readonly loadOwners: () => Promise<readonly OwnerChoice[]>;
  // The page's own record of live-test facts (docs/dapp-design.md 7.1). The default is everything unknown.
  readonly facts: () => CapabilityFacts;
}

// The shell's session client registers where the recorded facts live (the same convention as the other screens).
// Until it does, every fact reads "unknown" and every capability shows "unproven".
let externalFacts: (() => CapabilityFacts) | null = null;

export function setTradeFactsSource(source: (() => CapabilityFacts) | null): void {
  externalFacts = source;
}

export interface TradeServicesOptions {
  readonly facts?: () => CapabilityFacts;
}

export function createTradeServices(terminal: TerminalServices, options: TradeServicesOptions = {}): TradeServices {
  const client = new TradeClient({ rawFetch: terminal.stream.rawFetch, timers: terminal.stream.timers, getToken: terminal.stream.getToken });
  let owners: Promise<readonly OwnerChoice[]> | null = null;
  return {
    mode: terminal.mode,
    nowMs: terminal.nowMs,
    client,
    session: terminal.session,
    loadOwners: () => {
      owners ??= terminal
        .loadBindings()
        .then(({ bindings }) => bindings.filter((binding) => binding.kind === "eoa" && binding.address !== null).map((binding) => ({ id: binding.id, label: binding.label, address: binding.address as string })))
        .catch(() => []);
      return owners;
    },
    facts: options.facts ?? (() => externalFacts?.() ?? NO_FACTS),
  };
}

const ServicesContext = createContext<TradeServices | null>(null);

export function TradeServicesProvider({ services, children }: { readonly services: TradeServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useTradeServices(): TradeServices {
  const provided = useContext(ServicesContext);
  const mode = useAppMode();
  const terminal = useTerminalServices(mode);
  return useMemo(() => provided ?? createTradeServices(terminal), [provided, terminal]);
}
