// Builders for the explorer's component tests: fake venue readers, a services record with an injected clock, and a
// mount helper with the providers the shell would supply. Pure code with no Node import (the boundary check treats
// every non-*.test file under app/src as bundled code); only test files import it.

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import type { AdapterCaps, AdapterError, Book, FeeSpec, Level, Market, MarketRef, MarketSummary, Outcome, OutcomeSummary, Prov, Result, Status, VenueId, VenueReadAdapter } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { DEFAULT_SWITCHES, type VenueSwitches } from "../../core/venue-policy";
import { AnnouncerProvider, ClockProvider, ModeProvider, SearchProvider, ShellStatusProvider, createAppQueryClient, useSearchQuery, type AppMode } from "../../ui";
import { act, render } from "../../ui/testing/dom";
import { SignalsServicesProvider } from "../signals/services";
import { makeRig as makeSignalsRig, type Rig as SignalsRig, type RigOptions as SignalsRigOptions } from "../signals/test-support";
import { TerminalServicesProvider } from "../terminal/services";
import { fakeServices as fakeTerminalServices, scriptedDaemon, type Daemon } from "../terminal/test-support";
import { TradeServicesProvider } from "../trade/services";
import { createTradeServices } from "../trade/services";
import type { BookAvailability, DetailOutcome, ExplorerAdapter, ListOutcome } from "./adapters";
import { MarketMemory, ExplorerServicesProvider, type ExplorerServices } from "./services";

export const NOW = Date.parse("2026-10-19T12:00:00.000Z");

export function summary(venue: VenueId, marketId: string, options: Partial<Omit<MarketSummary, "ref" | "title">> & { readonly title?: string; readonly prices?: readonly (string | null)[]; readonly native?: Record<string, string> } = {}): MarketSummary {
  const prices = options.prices ?? ["0.6", "0.4"];
  const outcomes: OutcomeSummary[] = prices.map((price, index) => ({
    index,
    role: prices.length === 2 ? (index === 0 ? "yes" : "no") : "label",
    label: untrusted(index === 0 ? "Yes" : index === 1 ? "No" : `Outcome ${index + 1}`),
    tokenId: `${marketId}-t${index}`,
    displayPrice: price,
  }));
  const prov: Prov = { venue, source: `test-${venue}`, fetchedAtMs: NOW - 5000, transport: "T0", freshness: "live", ttlMs: 30_000, license: "unknown" };
  return {
    ref: { venue, marketId, native: options.native ?? {} },
    title: untrusted(options.title ?? `Market ${marketId}`),
    status: options.status ?? "active",
    closesAtUtc: options.closesAtUtc === undefined ? "2026-12-01T00:00:00.000Z" : options.closesAtUtc,
    outcomes: options.outcomes ?? outcomes,
    volume: options.volume ?? { amount: "1234.5", unit: "usd", windowHours: 24 },
    prov: options.prov ?? prov,
    // The category verdict and the venue's own words are optional on a row: absent unless a test gives them.
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.categoryNative === undefined ? {} : { categoryNative: options.categoryNative }),
  };
}

const FEE: Omit<FeeSpec, "venue"> = {
  modelId: "unknown",
  payer: "buyer_adds_seller_withholds",
  paramsSource: { url: "test", field: "test", granularity: "market" },
  verifiedAt: "2026-10-19",
  ttlSec: 0,
};

export function market(venue: VenueId, marketId: string, options: { readonly title?: string; readonly rules?: string; readonly sources?: readonly string[]; readonly fee?: FeeSpec; readonly sha256?: string; readonly resolver?: string } = {}): Market {
  const outcomes: Outcome[] = [
    { index: 0, role: "yes", label: untrusted("Yes"), tokenId: `${marketId}-t0` },
    { index: 1, role: "no", label: untrusted("No"), tokenId: `${marketId}-t1` },
  ];
  return {
    ref: { venue, marketId, native: {} },
    title: untrusted(options.title ?? `Market ${marketId}`),
    outcomes,
    rules: {
      text: untrusted(options.rules ?? "Resolves Yes if the thing happens."),
      sha256: options.sha256 ?? "a".repeat(64),
      sources: options.sources ?? ["The league's published results page"],
      mechanism: "exchange",
      void: "refund",
      ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
      cutoffUtc: "2026-12-01T00:00:00.000Z",
    },
    status: "active",
    tradable: { ok: true, reasons: [] },
    timesUtc: { closesAt: "2026-12-01T00:00:00.000Z" },
    tick: "0.01",
    collateral: { symbol: "USDC", chain: "eip155:8453", decimals: 6, custody: "self" },
    fee: options.fee ?? { venue, ...FEE },
    prov: { fetchedAtMs: NOW - 1000, source: `test-${venue}`, adapterVersion: "test", schemaHash: "test" },
  };
}

export function book(venue: VenueId, tokenId: string, bids: readonly (readonly [string, string])[], asks: readonly (readonly [string, string])[], options: { readonly asOfMs?: number; readonly derived?: Book["derived"] } = {}): Book {
  const level = ([price, size]: readonly [string, string]): Level => ({ price, size });
  return { token: { venue, tokenId }, bids: bids.map(level), asks: asks.map(level), asOfMs: options.asOfMs ?? NOW - 1000, derived: options.derived ?? "native" };
}

export class FakeError extends Error {
  readonly code: AdapterError;
  readonly retryAfterMs: number | null = null;
  constructor(code: AdapterError, message = "boom <img src=x onerror=alert(1)>") {
    super(message);
    this.code = code;
  }
}

export interface FakeOptions {
  readonly pages?: readonly (readonly MarketSummary[])[];
  readonly listError?: unknown;
  readonly refused?: number;
  // The venue says more results exist than it returned and gave no cursor (a cut-off text search).
  readonly truncated?: boolean;
  readonly detail?: DetailOutcome | ((ref: MarketRef) => DetailOutcome | Promise<DetailOutcome>);
  readonly detailError?: unknown;
  readonly books?: BookAvailability;
  readonly getBooks?: (tokenIds: readonly string[]) => ReadonlyArray<Result<Book, AdapterError>>;
  readonly search?: boolean;
  readonly feeNote?: string | null;
  readonly shape?: ExplorerAdapter["shape"];
  readonly clause?: string | null;
}

export interface FakeEntry extends ExplorerAdapter {
  readonly listCalls: Array<{ readonly text: string | undefined; readonly cursor: string | undefined; readonly statuses: readonly Status[] | undefined }>;
  readonly detailCalls: MarketRef[];
  readonly bookCalls: string[][];
}

export function fakeEntry(venue: VenueId, options: FakeOptions = {}): FakeEntry {
  const pages = options.pages ?? [[]];
  const listCalls: FakeEntry["listCalls"] = [];
  const detailCalls: MarketRef[] = [];
  const bookCalls: string[][] = [];
  const caps: AdapterCaps = { listMarkets: true, search: options.search ?? true, getMarket: true, getBook: true, getBooksBatch: false, getFeeSpec: true, getResolution: false, getPositionsByAddress: false, stream: false };
  const adapter: VenueReadAdapter = {
    id: venue,
    caps,
    listMarkets: async () => ({ items: [], next: null }),
    getMarket: async () => market(venue, "x"),
    getBooks: async (tokens) => {
      bookCalls.push(tokens.map((token) => token.tokenId));
      if (options.getBooks === undefined) return tokens.map(() => ({ ok: false as const, error: "NOT_FOUND" as AdapterError }));
      return options.getBooks(tokens.map((token) => token.tokenId));
    },
    getFeeSpec: async () => ({ venue, ...FEE }),
    health: async () => ({ ok: true, notes: [] }),
  };
  return {
    id: venue,
    adapter,
    books: options.books ?? { state: "available" },
    listCalls,
    detailCalls,
    bookCalls,
    async list(q): Promise<ListOutcome> {
      listCalls.push({ text: q.text, cursor: q.cursor, statuses: q.statuses });
      if (options.listError !== undefined) throw options.listError;
      const index = q.cursor === undefined ? 0 : Number(q.cursor);
      const items = pages[index] ?? [];
      const next = index + 1 < pages.length ? String(index + 1) : null;
      return { page: { items, next }, refused: index === 0 ? (options.refused ?? 0) : 0, truncated: index === 0 && next === null && (options.truncated ?? false) };
    },
    async detail(ref): Promise<DetailOutcome> {
      detailCalls.push(ref);
      if (options.detailError !== undefined) throw options.detailError;
      const detail = options.detail;
      if (typeof detail === "function") return detail(ref);
      return detail ?? { market: market(venue, ref.marketId), notes: [], settlement: null };
    },
    deadlineFor: (nowMs, budgetMs) => nowMs + budgetMs,
    feeNote: options.feeNote ?? null,
    shape: options.shape ?? null,
    clause: options.clause ?? null,
  };
}

export function fakeServices(entries: readonly ExplorerAdapter[], options: { readonly mode?: AppMode; readonly switches?: VenueSwitches; readonly nowMs?: () => number } = {}): ExplorerServices {
  const adapters: Partial<Record<VenueId, ExplorerAdapter>> = {};
  for (const entry of entries) adapters[entry.id] = entry;
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    mode: options.mode ?? "standalone",
    nowMs: options.nowMs ?? (() => NOW),
    adapters,
    loadSwitches: async () => options.switches ?? DEFAULT_SWITCHES,
    memory: new MarketMemory(),
    pollBooks: false,
  };
}

// Lets pending promises AND the query library's scheduled notifications (it batches on a zero-delay timer) run.
export async function flush(rounds = 6): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

// Flushes until the predicate holds (dynamic imports and queries settle on their own schedule), then once more.
// Waits by wall-clock time, not by a count of ticks: a cold dynamic import on a slow or loaded machine takes as long as
// it takes (TM-12), and the limit only exists so a broken test ends.
export async function until(predicate: () => boolean, limitMs = 15_000): Promise<void> {
  const started = performance.now();
  while (!predicate() && performance.now() - started < limitMs) await flush(1);
  await flush(2);
}

// The top bar's search field, as the shell renders it: the surface reads the shared text and filters loaded rows.
// A test types here exactly as a person types in the shell's field.
export function TestSearchField() {
  const { query, setQuery } = useSearchQuery();
  return (
    <label>
      Search titles
      <input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
    </label>
  );
}

export interface MountOptions {
  readonly path?: string;
  // The Signals rig (Quotient session, scripted fetch, spy store). A fresh one with Quotient off by default.
  readonly signals?: SignalsRigOptions | SignalsRig;
  // The pairing code the fake daemon accepts. Undefined (the default): not paired, and nothing is asked of it.
  readonly pairCode?: string;
  readonly daemon?: Daemon;
}

// Mounts a screen under the providers the shell supplies, with a pinned clock and a memory router, plus the other
// features' injected services (Quotient session, the fake daemon the trade desk would pair with) so no test reaches a
// browser global.
export async function mount(ui: ReactElement, services: ExplorerServices, pathOrOptions: string | MountOptions = "/") {
  const options: MountOptions = typeof pathOrOptions === "string" ? { path: pathOrOptions } : pathOrOptions;
  const location = memoryLocation({ path: options.path ?? "/" });
  const client = createAppQueryClient();
  const signals: SignalsRig = options.signals !== undefined && "session" in options.signals ? options.signals : makeSignalsRig({ mode: services.mode, ...(options.signals ?? {}) });
  const daemon = options.daemon ?? scriptedDaemon();
  const { services: terminal } = fakeTerminalServices({ daemon, code: options.pairCode, bindings: [] });
  const trade = createTradeServices(terminal);
  const rendered = render(
    <ModeProvider mode={services.mode}>
      <ClockProvider clock={{ now: services.nowMs }}>
        <QueryClientProvider client={client}>
          <AnnouncerProvider>
            <SearchProvider>
              <ShellStatusProvider>
                <ExplorerServicesProvider services={services}>
                  <SignalsServicesProvider services={signals.services}>
                    <TerminalServicesProvider services={terminal}>
                      <TradeServicesProvider services={trade}>
                        <Router hook={location.hook}>
                          <TestSearchField />
                          {ui}
                        </Router>
                      </TradeServicesProvider>
                    </TerminalServicesProvider>
                  </SignalsServicesProvider>
                </ExplorerServicesProvider>
              </ShellStatusProvider>
            </SearchProvider>
          </AnnouncerProvider>
        </QueryClientProvider>
      </ClockProvider>
    </ModeProvider>,
  );
  await flush();
  return { ...rendered, navigate: (to: string) => act(() => location.navigate(to)), client, location, signals, daemon };
}
