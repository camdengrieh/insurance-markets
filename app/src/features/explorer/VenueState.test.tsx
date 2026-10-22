// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createPinGuard } from "@sdk/chain/pins";
import { loadRecording, replayPort } from "@sdk/chain/fixtures/load";
import { KNOWN_MARKETS } from "@sdk/chain/fixtures/scenarios";
import { VENUE_PAUSE_MS, type VenueReadState } from "@sdk/venues/state";

import type { OutcomeSummary, VenueId } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { allText, cleanup, click, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { MarketsView } from "./MarketsView";
import { FakeError, NOW, fakeEntry, fakeServices, flush, mount, summary, until } from "./test-support";

// A venue that is blocked, throttled or read from the chain only (docs/sdk-and-api-design.md section 6): its rows stay
// in the list with the fields the chain and earlier reads can supply and the reason the rest are empty, and it drops out
// of books and order preparation. The chain answers are the recorded Polygon exchanges of sdk/chain/polymarket/fixtures.

afterEach(cleanup);

beforeAll(() => {
  const fromApp = createRequire(import.meta.url);
  const playwrightEntry = fromApp.resolve("@axe-core/playwright");
  const source = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library.
  new Function(source).call(window);
});

const tile = (root: ParentNode, kind: string, code?: string): Element | null => root.querySelector(`section[data-kind="${kind}"]${code === undefined ? "" : `[data-code="${code}"]`}`);
const rowsOf = (root: ParentNode): HTMLTableRowElement[] => [...root.querySelectorAll<HTMLTableRowElement>("tbody tr")];

// A Polymarket market the chain recording covers: closed and resolved on Polygon (payouts [0, 1]: No won).
const RESOLVED = KNOWN_MARKETS.polymarketNegRisk;

function resolvedRow() {
  const outcomes: OutcomeSummary[] = [
    { index: 0, role: "yes", label: untrusted("Yes"), tokenId: RESOLVED.clobTokenIds[0] as string, displayPrice: "0.01" },
    { index: 1, role: "no", label: untrusted("No"), tokenId: RESOLVED.clobTokenIds[1] as string, displayPrice: "0.99" },
  ];
  return summary("polymarket", RESOLVED.conditionId, { title: "Kept market", outcomes, native: { ledger: "ctf_v1", negRisk: "true" } });
}

const BLOCKED: VenueReadState = { kind: "blocked", signal: "http_403", status: 403, atMs: NOW, untilMs: NOW + VENUE_PAUSE_MS };

function polygonSession() {
  const { port } = replayPort(loadRecording("polymarket"));
  return { port, guard: createPinGuard(port) };
}

function stateOf(venue: VenueId, state: VenueReadState) {
  return (asked: VenueId): VenueReadState => (asked === venue ? state : { kind: "ok" });
}

describe("a blocked venue", () => {
  async function blockedSurface() {
    const pm = fakeEntry("polymarket", { listError: new FakeError("VENUE_PAUSED") });
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "XO row" })]] });
    const services = fakeServices([xo, pm], { venueState: stateOf("polymarket", BLOCKED), chainSession: (venue) => (venue === "polymarket" ? polygonSession() : null) });
    // A row Polymarket answered earlier in this visit.
    services.memory.put(resolvedRow());
    const view = await mount(<MarketsView />, services);
    await until(() => (view.container.querySelector('[data-source="chain"]') !== null));
    return { ...view, pm, xo };
  }

  it("shows its kept rows with the chain's settlement and the stated reason, not an error panel", async () => {
    const { container } = await blockedSurface();
    expect(tile(container, "error")).toBeNull();
    const state = tile(container, "venue-state", "blocked");
    expect(state).not.toBeNull();
    expect(allText(state as Element)).toContain("Polymarket blocked our reads at 2026-10-19 12:00 UTC: 403.");
    expect(allText(state as Element)).toContain("reads may be sent again after 2026-10-19 12:10 UTC");
    // Nothing is retried while the block lasts.
    expect((state as Element).querySelector("button")).toBeNull();
    expect(container.querySelector('li.explorer-venue[data-venue="polymarket"]')?.getAttribute("data-state")).toBe("degraded");

    const row = rowsOf(container).find((candidate) => allText(candidate).includes("Kept market")) as HTMLTableRowElement;
    expect(row).toBeDefined();
    // The book drops out with its reason; the row says it is cached and that its settlement came from the chain.
    expect(must(row, '[data-col="price"] [data-book="withheld"]')).toBeDefined();
    expect(allText(must(row, '[data-col="price"]'))).toContain("Polymarket blocked our reads");
    expect(row.querySelector('[data-source="cache"]')).not.toBeNull();
    expect(row.querySelector('[data-source="chain"]')).not.toBeNull();
    // The other venue still renders.
    expect(rowsOf(container).some((candidate) => allText(candidate).includes("XO row"))).toBe(true);
  });

  it("the inspector states every field's source: cache with its age, the chain, and the reason for the rest", async () => {
    const { container } = await blockedSurface();
    const row = rowsOf(container).find((candidate) => allText(candidate).includes("Kept market")) as HTMLTableRowElement;
    click(must(row, "button.explorer-row-select"));
    await flush();
    const aside = must(container, "aside.explorer-inspector");
    const sources = must(aside, "[data-sources]");
    expect(allText(must(sources, '[data-field="title"]'))).toContain("cached from a read 5 s ago, not live");
    expect(allText(must(sources, '[data-field="displayPrice"]'))).toContain("Polymarket blocked our reads at 2026-10-19 12:00 UTC: 403");
    expect(allText(must(sources, '[data-field="resolution"]'))).toContain("resolved on chain: No paid in full");
    expect(allText(must(sources, '[data-field="resolution"]'))).toContain("chain (Polygon 137)");
    expect(allText(must(sources, '[data-field="status"]'))).toContain("chain (Polygon 137)");
    // The status shown is the chain's, and the venue's display price is not shown as if live.
    expect(allText(aside)).toContain("resolved");
    expect(allText(must(aside, "[data-display-prices]"))).not.toMatch(/99\.0c|1\.0c/);
    // No book, and no order preparation for a venue that cannot be asked.
    expect(must(aside, 'section[data-kind="book-withheld"]')).toBeDefined();
    expect(aside.querySelector('[data-prepare="venue-not-read"]')).not.toBeNull();
  });

  it("drops out of book loading: its rows are never asked for a book", async () => {
    const { container, pm, xo } = await blockedSurface();
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.startsWith("Load books")) as HTMLButtonElement;
    expect(button.textContent).toBe("Load books for the 1 visible row");
    click(button);
    await flush();
    expect(pm.bookCalls).toEqual([]);
    expect(xo.bookCalls).toEqual([["m1-t0"]]);
  });

  it("with nothing kept, says so and lists nothing for it", async () => {
    const pm = fakeEntry("polymarket", { listError: new FakeError("VENUE_PAUSED") });
    const { container } = await mount(<MarketsView />, fakeServices([pm], { venueState: stateOf("polymarket", BLOCKED) }));
    expect(allText(tile(container, "venue-state", "blocked") as Element)).toContain("No Polymarket rows were read earlier in this visit, so none are shown");
    expect(rowsOf(container)).toHaveLength(0);
  });

  it("is axe clean", async () => {
    const { container } = await blockedSurface();
    const violations = await runAxe(container);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});

describe("a throttled venue", () => {
  it("says when it may be asked again and offers no retry before then", async () => {
    const throttled: VenueReadState = { kind: "throttled", signal: "retry_after", status: 429, atMs: NOW, untilMs: NOW + 30_000 };
    const pm = fakeEntry("polymarket", { listError: new FakeError("RATE_LIMITED") });
    const { container } = await mount(<MarketsView />, fakeServices([pm], { venueState: stateOf("polymarket", throttled) }));
    const state = tile(container, "venue-state", "throttled") as Element;
    expect(allText(state)).toContain("Polymarket throttled our reads (429): retry after 30 s.");
    expect(state.querySelector("button")).toBeNull();
    expect(tile(container, "error")).toBeNull();
  });

  it("whose list was read keeps its rows live and only its books wait", async () => {
    const throttled: VenueReadState = { kind: "throttled", signal: "http_429_repeated", status: 429, atMs: NOW, untilMs: NOW + VENUE_PAUSE_MS };
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Fresh row" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm], { venueState: stateOf("polymarket", throttled) }));
    const row = rowsOf(container)[0] as HTMLTableRowElement;
    expect(allText(row)).toContain("Fresh row");
    expect(row.querySelector('[data-source="cache"]')).toBeNull();
    expect(row.querySelector('[data-book="withheld"]')).not.toBeNull();
    expect(allText(tile(container, "venue-state", "throttled") as Element)).toContain("its order books are not asked while this lasts");
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.startsWith("Load books")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe("a chain-only venue", () => {
  it("is never asked, and says it is read from the chain only", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]] });
    const chainOnly: VenueReadState = { kind: "chain_only", reason: "this test declares its API unused." };
    const services = fakeServices([pm], { venueState: stateOf("polymarket", chainOnly), chainSession: () => polygonSession() });
    services.memory.put(resolvedRow());
    const { container } = await mount(<MarketsView />, services);
    await until(() => container.querySelector('[data-source="chain"]') !== null);
    expect(pm.listCalls).toHaveLength(0);
    expect(allText(tile(container, "venue-state", "chain_only") as Element)).toContain("Polymarket is read from the chain only: this test declares its API unused.");
    expect(rowsOf(container).some((row) => allText(row).includes("Kept market"))).toBe(true);
  });
});
