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
import { ClockProvider, ModeProvider, createAppQueryClient, type AppMode } from "../../ui";
import { act, render } from "../../ui/testing/dom";
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
  };
}

const FEE: FeeSpec = {
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
    fee: options.fee ?? FEE,
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
    getFeeSpec: async () => FEE,
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

// Mounts a screen under the providers the shell supplies, with a pinned clock and a memory router.
export async function mount(ui: ReactElement, services: ExplorerServices, path = "/") {
  const location = memoryLocation({ path });
  const client = createAppQueryClient();
  const rendered = render(
    <ModeProvider mode={services.mode}>
      <ClockProvider clock={{ now: services.nowMs }}>
        <QueryClientProvider client={client}>
          <ExplorerServicesProvider services={services}>
            <Router hook={location.hook}>{ui}</Router>
          </ExplorerServicesProvider>
        </QueryClientProvider>
      </ClockProvider>
    </ModeProvider>,
  );
  await flush();
  return { ...rendered, navigate: (to: string) => act(() => location.navigate(to)), client, location };
}
