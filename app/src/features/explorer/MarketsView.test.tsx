// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Book, Result, AdapterError } from "../../core/ports";
import { withVenueEnabled } from "../../core/settings";
import { DEFAULT_SWITCHES } from "../../core/venue-policy";
import { act, allText, choose, click, cleanup, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { MarketsView } from "./MarketsView";
import { FakeError, book, fakeEntry, fakeServices, flush, mount, summary } from "./test-support";

afterEach(cleanup);

beforeAll(() => {
  const fromApp = createRequire(import.meta.url);
  const playwrightEntry = fromApp.resolve("@axe-core/playwright");
  const source = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library.
  new Function(source).call(window);
});

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit(form: HTMLFormElement): void {
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

const headers = (root: ParentNode): string[] => [...root.querySelectorAll("thead th")].map((th) => th.textContent ?? "");
const rowsOf = (root: ParentNode): HTMLTableRowElement[] => [...root.querySelectorAll<HTMLTableRowElement>("tbody tr")];
const tile = (root: ParentNode, kind: string, code?: string): Element | null => root.querySelector(`section[data-kind="${kind}"]${code === undefined ? "" : `[data-code="${code}"]`}`);

describe("the list", () => {
  it("shows one row per market with the fixed columns, units and labels", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Will it rain", prices: ["0.6", "0.4"] }), summary("xo", "m2", { title: "Second" })]], feeNote: "ceiling, unreconciled" });
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one", volume: { amount: "980.25", unit: "unknown", windowHours: 24 } })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo, pm]));
    expect(headers(container)).toEqual([
      "Venue",
      "Market",
      "Status",
      "Closes (UTC)",
      "Price (bid / ask, else display price)",
      "Spread",
      "Depth within 5c",
      "Volume (with unit)",
      "Fee model",
      "Links",
    ]);
    const rows = rowsOf(container);
    expect(rows).toHaveLength(3);
    const first = allText(rows[0] as Element);
    expect(first).toContain("XO Market");
    expect(first).toContain("Will it rain");
    expect(first).toContain("active");
    expect(first).toContain("2026-12-01 00:00 UTC");
    expect(first).toContain("Yes 60.0c");
    expect(first).toContain("No 40.0c");
    expect(first).toContain("display price, not executable");
    expect(first).toContain("$1,234.50 per 24 h");
    expect(first).toContain("ceiling, unreconciled");
    expect(first).toContain("no links");
    expect(allText(rows[2] as Element)).toContain("980.25 (unit not stated) per 24 h");
    expect(allText(rows[2] as Element)).not.toContain("$980");
    expect(allText(container)).toContain("3 markets shown from 2 venues");
  });

  it("shows an unknown price as no data, never as zero", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { prices: [null, null], volume: { amount: null, unit: "usd", windowHours: null }, closesAtUtc: null })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    const cells = [...row.querySelectorAll("td")].map((cell) => allText(cell));
    expect(cells.join(" | ")).not.toMatch(/0\.0c|\$0|\b0\b/);
    expect(row.querySelectorAll(".ui-missing").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps Yes and No as the sides by role and shows a team name beside them, as text", async () => {
    const outcomes = [
      { index: 0, role: "yes" as const, label: { untrusted: true as const, value: "Chiefs" }, tokenId: "a", displayPrice: "0.7" },
      { index: 1, role: "no" as const, label: { untrusted: true as const, value: "<b>Bills</b>" }, tokenId: "b", displayPrice: "0.3" },
    ];
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { outcomes })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    const cell = allText(must(container, "tbody tr"));
    expect(cell).toContain("Yes (Chiefs) 70.0c");
    expect(cell).toContain("No (<b>Bills</b>) 30.0c");
    expect(container.querySelector("tbody b")).toBeNull();
  });

  it("links each title to its market page and nowhere else", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "0xabc", { title: "Link me" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    const anchors = [...container.querySelectorAll("table a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(["/market/polymarket/0xabc"]);
  });

  it("gives a market whose id is outside the safe alphabet no link, only its inert title", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "bad id <x>", { title: "Odd id" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    expect(container.querySelectorAll("table a")).toHaveLength(0);
    expect(allText(container)).toContain("Odd id");
  });
});

describe("M0-2: venues the build cannot read are said, not emptied", () => {
  it("standalone: Limitless needs the Cockpit, Kalshi is off for restricted terms, XO books need the Cockpit", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1")]], books: { state: "needs_cockpit", what: "XO order books" } });
    const { container } = await mount(<MarketsView />, fakeServices([xo], { mode: "standalone" }));
    const limitless = tile(container, "needs-cockpit", "limitless");
    expect(limitless).not.toBeNull();
    expect(allText(limitless as Element)).toContain("Limitless: needs the Cockpit");
    expect(allText(limitless as Element)).toContain("different from an empty book");
    const kalshi = tile(container, "restricted", "kalshi");
    expect(allText(kalshi as Element)).toContain("Kalshi: off, restricted terms");
    expect(allText(kalshi as Element)).toContain("nothing was requested");
    expect(allText(kalshi as Element)).toContain("not an empty market list");
    expect(allText(tile(container, "needs-cockpit", "xo") as Element)).toContain("XO Market: needs the Cockpit");
    // The XO row itself says so where the spread would be.
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    expect(allText(row)).toContain("needs the Cockpit");
    expect(allText(row)).not.toMatch(/bid|ask/);
  });

  it("every restricted-terms venue is off, in both builds, until the user accepts its clause", async () => {
    for (const mode of ["standalone", "cockpit"] as const) {
      const { container } = await mount(<MarketsView />, fakeServices([fakeEntry("xo")], { mode }));
      for (const venue of ["kalshi", "gemini", "novig", "og", "udx"]) expect(tile(container, "restricted", venue), `${mode} ${venue}`).not.toBeNull();
      cleanup();
    }
  });

  it("a restricted venue switched on but not accepted stays off", async () => {
    const switches = withVenueEnabled(DEFAULT_SWITCHES, "gemini", true);
    const { container } = await mount(<MarketsView />, fakeServices([fakeEntry("xo")], { mode: "cockpit", switches }));
    expect(tile(container, "restricted", "gemini")).not.toBeNull();
  });

  it("a venue switched off in settings is not requested", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm], { switches: withVenueEnabled(DEFAULT_SWITCHES, "polymarket", false) }));
    expect(pm.listCalls).toHaveLength(0);
    expect(allText(tile(container, "switched-off", "polymarket") as Element)).toContain("nothing was requested");
    expect(rowsOf(container)).toHaveLength(0);
  });

  it("names the venues the screen does not cover", async () => {
    const { container } = await mount(<MarketsView />, fakeServices([fakeEntry("xo")]));
    expect(allText(container)).toMatch(/Not covered by this screen: .*World/);
  });
});

describe("one venue failing leaves the others rendering", () => {
  it("shows a typed error tile for the failed venue and keeps the rest", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Still here" })]] });
    const pm = fakeEntry("polymarket", { listError: new FakeError("TIMEOUT") });
    const { container } = await mount(<MarketsView />, fakeServices([xo, pm]));
    expect(allText(container)).toContain("Still here");
    const alerts = [...container.querySelectorAll('[role="alert"]')];
    expect(alerts).toHaveLength(1);
    expect(allText(alerts[0] as Element)).toContain("Polymarket: The venue did not answer in time");
    // The error's own message may quote upstream text: it is never shown.
    expect(allText(container)).not.toContain("boom");
    expect(container.querySelector("img")).toBeNull();
  });

  it("tells an empty answer from a failure", async () => {
    const mani = fakeEntry("manifold", { pages: [[]] });
    const pas = fakeEntry("pascal", { listError: new FakeError("SCHEMA_DRIFT") });
    const { container } = await mount(<MarketsView />, fakeServices([mani, pas]));
    expect(allText(tile(container, "empty") as Element)).toContain("a real empty answer, not a failure");
    expect(allText(tile(container, "error", "SCHEMA_DRIFT") as Element)).toContain("shape we do not recognise");
    expect(rowsOf(container)).toHaveLength(0);
  });

  it("an unknown failure gets words that do not guess", async () => {
    const pm = fakeEntry("polymarket", { listError: new Error("ECONNRESET with a secret") });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    expect(allText(tile(container, "error", "UNKNOWN") as Element)).toContain("Something went wrong");
    expect(allText(container)).not.toContain("ECONNRESET");
  });

  it("retry asks the venue again", async () => {
    let fail = true;
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Back again" })]] });
    const original = pm.list.bind(pm);
    const flaky = { ...pm, list: async (q: Parameters<typeof pm.list>[0]) => (fail ? Promise.reject(new FakeError("RATE_LIMITED")) : original(q)) };
    const { container } = await mount(<MarketsView />, fakeServices([flaky]));
    expect(tile(container, "error", "RATE_LIMITED")).not.toBeNull();
    fail = false;
    click(must(container, '[data-kind="error"] button'));
    await flush();
    expect(allText(container)).toContain("Back again");
    expect(tile(container, "error")).toBeNull();
  });

  it("reports rows the reader refused", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1")]], refused: 3 });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    expect(allText(container)).toContain("3 rows refused (unreadable shape)");
  });
});

describe("a cut-off search (A1)", () => {
  it("says more results exist and to refine the search, and offers no Load more", async () => {
    const polymarket = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Election one" })]], truncated: true });
    const complete = fakeEntry("xo", { pages: [[summary("xo", "m1")]] });
    const { container } = await mount(<MarketsView />, fakeServices([polymarket, complete]));
    expect(allText(must(container, '[data-venue="polymarket"]'))).toContain("Refine your search");
    expect(must(container, '[data-venue="polymarket"]').querySelector('[data-truncated="true"]')).not.toBeNull();
    expect(must(container, '[data-venue="xo"]').querySelector('[data-truncated="true"]')).toBeNull();
  });
});

describe("search and filters", () => {
  const build = () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Rain tomorrow" }), summary("xo", "m2", { title: "Snow tomorrow" })]] });
    const trueo = fakeEntry("trueo", { pages: [[summary("trueo", "8453:0xAa", { title: "Trueo thing" })]], search: false });
    return { xo, trueo, services: fakeServices([xo, trueo]) };
  };

  it("typing narrows the loaded rows and sends nothing", async () => {
    const { xo, trueo, services } = build();
    const { container } = await mount(<MarketsView />, services);
    const input = must<HTMLInputElement>(container, 'input[type="search"]');
    for (const value of ["r", "ra", "rai", "rain"]) typeInto(input, value);
    expect(rowsOf(container)).toHaveLength(1);
    expect(allText(container)).toContain("1 market shown of 3 loaded");
    expect(xo.listCalls).toHaveLength(1);
    expect(trueo.listCalls).toHaveLength(1);
    expect(xo.listCalls.every((call) => call.text === undefined)).toBe(true);
  });

  it("pressing the button asks only the venues that can search, and says so for the rest", async () => {
    const { xo, trueo, services } = build();
    const { container } = await mount(<MarketsView />, services);
    typeInto(must(container, 'input[type="search"]'), "  rain  ");
    submit(must(container, "form"));
    await flush();
    expect(xo.listCalls.map((call) => call.text)).toEqual([undefined, "rain"]);
    // Trueo cannot search by text: it is not asked, and the panel says it was not.
    expect(trueo.listCalls).toHaveLength(1);
    expect(allText(must(container, '[data-venue="trueo"]'))).toContain("cannot search by text, so it was not asked");
  });

  it("clearing the search lists everything again", async () => {
    const { xo, services } = build();
    const { container } = await mount(<MarketsView />, services);
    typeInto(must(container, 'input[type="search"]'), "rain");
    submit(must(container, "form"));
    await flush();
    click([...container.querySelectorAll("button")].find((b) => b.textContent === "Clear search") as Element);
    await flush();
    expect(must<HTMLInputElement>(container, 'input[type="search"]').value).toBe("");
    expect(rowsOf(container)).toHaveLength(3);
    // The plain list is still fresh in the cache, so nothing is asked a third time.
    expect(xo.listCalls.map((call) => call.text)).toEqual([undefined, "rain"]);
  });

  it("the status filter changes what the venues are asked for", async () => {
    const { xo, services } = build();
    const { container } = await mount(<MarketsView />, services);
    expect(xo.listCalls[0]?.statuses).toEqual(["active"]);
    choose(must<HTMLSelectElement>(container, "select"), "resolved");
    await flush();
    expect(xo.listCalls.at(-1)?.statuses).toEqual(["resolved"]);
  });

  it("orders by closing time, with unknown last, and offers no price ranking", async () => {
    const xo = fakeEntry("xo", {
      pages: [[summary("xo", "late", { title: "Late", closesAtUtc: "2027-01-01T00:00:00Z" }), summary("xo", "none", { title: "Undated", closesAtUtc: null }), summary("xo", "soon", { title: "Soon", closesAtUtc: "2026-11-01T00:00:00Z" })]],
    });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    expect(rowsOf(container).map((row) => allText(row).match(/Late|Undated|Soon/)?.[0])).toEqual(["Soon", "Late", "Undated"]);
    const sortOptions = [...container.querySelectorAll("select")[1]?.querySelectorAll("option") ?? []].map((o) => o.textContent ?? "");
    expect(sortOptions.join(" ")).not.toMatch(/price|volume|trade/i);
  });

  it("unchecking a venue stops asking it and removes its rows", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" })]] });
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Xo one" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo, pm]));
    expect(rowsOf(container)).toHaveLength(2);
    const box = must<HTMLInputElement>(container, '[data-venue="polymarket"] input[type="checkbox"]');
    click(box);
    await flush();
    expect(rowsOf(container)).toHaveLength(1);
    expect(allText(container)).not.toContain("Poly one");
    expect(allText(must(container, '[data-venue="polymarket"]'))).toContain("not requested");
    const before = pm.listCalls.length;
    typeInto(must(container, 'input[type="search"]'), "x");
    submit(must(container, "form"));
    await flush();
    expect(pm.listCalls.length).toBe(before);
  });
});

describe("paging", () => {
  it("loads the next page on request and stops when there is none", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "a")], [summary("polymarket", "b")]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    expect(rowsOf(container)).toHaveLength(1);
    const more = [...container.querySelectorAll("button")].find((b) => b.textContent === "Load more from Polymarket") as Element;
    click(more);
    await flush();
    expect(rowsOf(container)).toHaveLength(2);
    expect(pm.listCalls.map((call) => call.cursor)).toEqual([undefined, "1"]);
    expect([...container.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Load more"))).toBe(false);
  });

  it("caps the fan-out at five pages per venue", async () => {
    const pages = Array.from({ length: 8 }, (_, index) => [summary("polymarket", `p${index}`)]);
    const pm = fakeEntry("polymarket", { pages });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    for (let index = 0; index < 6; index += 1) {
      const button = [...container.querySelectorAll("button")].find((b) => /Load more|Page limit/.test(b.textContent ?? ""));
      if (button === undefined || (button as HTMLButtonElement).disabled) break;
      click(button);
      await flush();
    }
    expect(rowsOf(container)).toHaveLength(5);
    expect(pm.listCalls).toHaveLength(5);
    const last = [...container.querySelectorAll("button")].find((b) => b.textContent === "Page limit reached") as HTMLButtonElement;
    expect(last.disabled).toBe(true);
  });

  it("a failed next page is reported without losing the rows", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "a")], [summary("polymarket", "b")]] });
    const flaky = { ...pm, list: async (q: Parameters<typeof pm.list>[0]) => (q.cursor === undefined ? pm.list(q) : Promise.reject(new FakeError("TIMEOUT"))) };
    const { container } = await mount(<MarketsView />, fakeServices([flaky]));
    click([...container.querySelectorAll("button")].find((b) => b.textContent === "Load more from Polymarket") as Element);
    await flush();
    expect(rowsOf(container)).toHaveLength(1);
    expect(allText(container)).toContain("More Polymarket markets could not be loaded (timeout)");
  });
});

describe("Hyperliquid is unverified", () => {
  it("shows an unproven tile and the venue restriction beside its markets", async () => {
    const hl = fakeEntry("hyperliquid", {
      pages: [[summary("hyperliquid", "1")]],
      shape: { status: "unverified", summary: "Response shapes come from the docs samples." },
      clause: "Excluded Persons may not use this venue.",
    });
    const { container } = await mount(<MarketsView />, fakeServices([hl]));
    const unproven = tile(container, "unproven") as Element;
    expect(allText(unproven)).toContain("Unproven: Hyperliquid response shapes");
    expect(allText(unproven)).toContain("unverified");
    expect(allText(tile(container, "venue-clause", "hyperliquid") as Element)).toContain("Excluded Persons may not use this venue.");
    expect(allText(tile(container, "venue-clause", "hyperliquid") as Element)).toContain("no eligibility verdict");
  });
});

describe("order books for the visible rows", () => {
  const books = (tokenIds: readonly string[]): ReadonlyArray<Result<Book, AdapterError>> =>
    tokenIds.map((id) => ({ ok: true as const, value: book("polymarket", id, [["0.50", "10"]], [["0.54", "20"]]) }));

  it("asks once, for the first ten rows that can have one, and labels the numbers", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => summary("polymarket", `p${index}`, { title: `Row ${index}` }));
    const pm = fakeEntry("polymarket", { pages: [rows], getBooks: books });
    const mani = fakeEntry("manifold", { pages: [[summary("manifold", "mm")]], books: { state: "none", why: "Manifold is a play-money venue with no order book" } });
    const { container } = await mount(<MarketsView />, fakeServices([pm, mani]));
    expect(pm.bookCalls).toHaveLength(0);
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load order books")) as Element;
    expect(button.textContent).toBe("Load order books for the first 10 rows");
    click(button);
    await flush();
    expect(pm.bookCalls).toHaveLength(1);
    expect(pm.bookCalls[0]).toHaveLength(10);
    // The headline outcome (yes) of each row.
    expect(pm.bookCalls[0]?.[0]).toBe("p0-t0");
    const first = rowsOf(container).find((row) => allText(row).includes("Row 0")) as Element;
    expect(allText(first)).toContain("bid 50.0c / ask 54.0c");
    expect(allText(first)).toContain("4.0c");
    expect(allText(first)).toContain("book spread (size and fees not applied)");
    expect(allText(first)).toContain("bids 10.00");
    expect(allText(first)).toContain("asks 20.00");
    const eleventh = rowsOf(container).find((row) => allText(row).includes("Row 11")) as Element;
    expect(allText(eleventh)).toContain("display price, not executable");
    const manifold = rowsOf(container).find((row) => allText(row).includes("Manifold")) as Element;
    expect(allText(manifold)).toContain("no order book");
  });

  it("never shows an XO spread as executable, even with a fresh Cockpit book (M0-8)", async () => {
    const xo = fakeEntry("xo", {
      pages: [[summary("xo", "m1")]],
      getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("xo", id, [["0.50", "10"]], [["0.54", "20"]]) })),
    });
    const { container } = await mount(<MarketsView />, fakeServices([xo], { mode: "cockpit" }));
    click([...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load order books")) as Element);
    await flush();
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    expect(allText(row)).toContain("indicative spread, not executable");
    expect(allText(row)).toContain("unreconciled");
    expect(allText(row)).not.toContain("book spread");
    expect(allText(row)).not.toMatch(/executable spread/);
  });

  it("does not offer books where no visible row can have one", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1")]], books: { state: "needs_cockpit", what: "XO order books" } });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load order books")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(xo.bookCalls).toHaveLength(0);
  });

  it("a book for another token is refused, not shown", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]], getBooks: () => [{ ok: true as const, value: book("polymarket", "someone-elses", [["0.1", "1"]], [["0.2", "1"]]) }] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    click([...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load order books")) as Element);
    await flush();
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    expect(allText(row)).toContain("book: The venue answered in a shape we do not recognise");
    expect(allText(row)).not.toContain("10.0c");
  });

  it("an empty book and an unreachable venue read differently in the row", async () => {
    const a = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]], getBooks: () => [{ ok: false as const, error: "EMPTY_BOOK" as const }] });
    const b = fakeEntry("pascal", { pages: [[summary("pascal", "S1")]], getBooks: () => [{ ok: false as const, error: "TIMEOUT" as const }] });
    const { container } = await mount(<MarketsView />, fakeServices([a, b]));
    click([...container.querySelectorAll("button")].find((x) => x.textContent?.startsWith("Load order books")) as Element);
    await flush();
    const texts = rowsOf(container).map((row) => allText(row));
    expect(texts.find((t) => t.includes("Polymarket"))).toContain("No orders at the moment");
    expect(texts.find((t) => t.includes("Pascal"))).toContain("did not answer in time");
  });

  it("a book request that throws marks the rows, and nothing else changes", async () => {
    const pm = fakeEntry("polymarket", {
      pages: [[summary("polymarket", "p1")]],
      getBooks: () => {
        throw new FakeError("RATE_LIMITED");
      },
    });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    click([...container.querySelectorAll("button")].find((x) => x.textContent?.startsWith("Load order books")) as Element);
    await flush();
    expect(allText(must(container, "tbody tr"))).toContain("book: The venue asked us to slow down");
  });
});

describe("M0-3: hostile market text renders inert", () => {
  const HOSTILE = '<img src=x onerror=alert(1)> <a href="javascript:alert(1)">click</a> <script>alert(2)</script>';

  it("shows the title as text inside the untrusted slot and creates no element from it", async () => {
    const xo = fakeEntry("xo", {
      pages: [
        [
          summary("xo", "m1", {
            title: HOSTILE,
            outcomes: [{ index: 0, role: "label", label: { untrusted: true, value: '<svg onload=alert(3)>Team' }, tokenId: "t", displayPrice: "0.5" }],
          }),
        ],
      ],
    });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("svg[onload]")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect([...container.querySelectorAll("*")].some((el) => el.getAttributeNames().some((name) => name.startsWith("on")))).toBe(false);
    const slot = must(container, "tbody .ui-untrusted");
    expect(slot.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(must(container, "tbody a").getAttribute("href")).toBe("/market/xo/m1");
    expect(allText(container)).toContain("<svg onload=alert(3)>Team");
  });

  it("an unbranded string in a market field is withheld, not displayed", async () => {
    const bad = summary("xo", "m1");
    const xo = fakeEntry("xo", { pages: [[{ ...bad, title: "plain string" as never }]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    expect(allText(container)).toContain("[text withheld: not marked untrusted]");
    expect(allText(container)).not.toContain("plain string");
  });

  it("a row labelled with another venue is dropped, not mislabelled", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("polymarket", "p1", { title: "Wrong venue" }), summary("xo", "m1", { title: "Right venue" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    expect(allText(container)).toContain("Right venue");
    expect(allText(container)).not.toContain("Wrong venue");
  });
});

describe("accessibility (structure; contrast and layout belong to the browser suite)", () => {
  it("the loaded list with its tiles has no axe violations", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Rain" })]], books: { state: "needs_cockpit", what: "XO order books" } });
    const pm = fakeEntry("polymarket", { listError: new FakeError("TIMEOUT") });
    const hl = fakeEntry("hyperliquid", { pages: [[summary("hyperliquid", "1")]], shape: { status: "unverified", summary: "x" }, clause: "A clause." });
    const { container } = await mount(
      <main>
        <h1>Markets</h1>
        <MarketsView />
      </main>,
      fakeServices([xo, pm, hl]),
    );
    const violations = await runAxe(container);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
