import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { BindingsStore, createMemoryRecordStore, type OpenedStores } from "../../core/bindings";
import { NO_FACTS, type CapabilityFacts } from "../../core/capabilities";
import { AnnouncerProvider } from "../../ui/a11y";
import { ClockProvider, ModeProvider, type AppMode } from "../../ui/context";
import { PortfolioAdaptersProvider } from "../portfolio/usePortfolio";
import type { PortfolioAdapters } from "../portfolio/readers";
import type { FakeNetwork } from "./testkit";
import { WalletServicesProvider, type WalletServices } from "./services";

// What the screen tests wrap a view in: a query client that never retries, in-memory storage, a fake network, a
// fixed clock and a memory router. Test support only (nothing reachable from main.tsx imports it).

export interface Harness {
  readonly stores: OpenedStores;
  readonly bindings: BindingsStore;
  readonly services: WalletServices;
  readonly wrap: (children: ReactNode) => ReactElement;
}

export function harness(options: { net: FakeNetwork; mode?: AppMode; nowMs?: number; facts?: CapabilityFacts; adapters?: PortfolioAdapters; path?: string }): Harness {
  const mode = options.mode ?? "cockpit";
  const nowMs = options.nowMs ?? 1_760_875_200_000;
  const stores: OpenedStores = { bindings: createMemoryRecordStore(), settings: createMemoryRecordStore(), persistence: "memory" };
  const services: WalletServices = { mode, deps: { fetch: options.net.fetch, nowMs: () => nowMs }, stores: async () => stores, facts: options.facts ?? NO_FACTS };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false } } });
  const location = memoryLocation({ path: options.path ?? "/" });
  const wrap = (children: ReactNode): ReactElement => (
    <ModeProvider mode={mode}>
      <ClockProvider clock={{ now: () => nowMs }}>
        <QueryClientProvider client={client}>
          <AnnouncerProvider>
            <Router hook={location.hook}>
              <WalletServicesProvider services={services}>
                {options.adapters === undefined ? children : <PortfolioAdaptersProvider adapters={options.adapters}>{children}</PortfolioAdaptersProvider>}
              </WalletServicesProvider>
            </Router>
          </AnnouncerProvider>
        </QueryClientProvider>
      </ClockProvider>
    </ModeProvider>
  );
  return { stores, bindings: new BindingsStore(stores.bindings), services, wrap };
}

// Types text into a controlled React input the way a user does.
export function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string, act: (callback: () => void) => void): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) throw new Error("no value setter");
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// Waits (in real time, a few ms at a time, inside act) until `check` stops throwing. TanStack Query hands results
// to React through a zero-delay timer, so microtask settling alone is not enough.
export async function eventually(check: () => void, act: (callback: () => Promise<void>) => Promise<void>, tries = 200): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      check();
      return;
    } catch (error) {
      last = error;
    }
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    });
  }
  throw last instanceof Error ? last : new Error("condition not met");
}
