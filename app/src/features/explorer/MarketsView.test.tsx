// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Book, Result, AdapterError } from "../../core/ports";
import { withVenueEnabled } from "../../core/settings";
import { DEFAULT_SWITCHES } from "../../core/venue-policy";
import { act, allText, choose, click, cleanup, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { heroTitle } from "./HeroBand";
import { MarketsView } from "./MarketsView";
import { FakeError, book, fakeEntry, fakeServices, flush, market, mount, summary } from "./test-support";

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
// A row is selected for the inspector by its venue cell's button (the whole row is the pointer target).
const inspectRow = (row: ParentNode): void => click(must(row, "button.explorer-row-select"));
const inspectorOf = (root: ParentNode): HTMLElement => must<HTMLElement>(root, "aside.explorer-inspector");
const HERO_H1 = /^Every open market this build can read\. [A-Z][a-z]+ venues?, one book at a time\.$/;

describe("the list", () => {
  it("shows one row per market with the fixed columns, units and labels", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Will it rain", prices: ["0.6", "0.4"] }), summary("xo", "m2", { title: "Second" })]], feeNote: "documented curve, larger of two rates" });
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one", volume: { amount: "980.25", unit: "unknown", windowHours: 24 } })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo, pm]));
    expect(headers(container)).toEqual(["Venue", "Market", "Category", "Yes bid / ask", "Spread", "Depth ±5¢", "Closes (UTC)", "Marks"]);
    const rows = rowsOf(container);
    expect(rows).toHaveLength(3);
    const first = allText(rows[0] as Element);
    expect(first).toContain("XO Market");
    expect(first).toContain("Will it rain");
    expect(first).toContain("2026-12-01 00:00");
    // One value per cell: a row with no loaded book says so in one phrase; display prices are not in the row.
    expect(first).toContain("no book loaded");
    expect(first).not.toContain("60.0c");
    // The first row is inspected on load: status, volume and the labelled display prices are in the inspector.
    const aside = inspectorOf(container);
    expect(aside.getAttribute("data-selected")).toBe("xo:m1");
    const head = allText(must(aside, ".explorer-inspector-head"));
    expect(head).toContain("active");
    expect(head).toContain("Yes 60.0c");
    expect(head).toContain("No 40.0c");
    expect(head).toContain("display price, not executable");
    expect(head).toContain("$1,234.50 per 24 h");
    // Every number, id and time is set in mono; the fee note and the link words live in the modal and the inspector.
    expect([...(rows[0] as Element).querySelectorAll(".ui-num")].map((node) => node.textContent)).toEqual(expect.arrayContaining(["2026-12-01 00:00"]));
    expect([...must(aside, ".explorer-inspector-head").querySelectorAll(".ui-num")].map((node) => node.textContent)).toEqual(expect.arrayContaining(["60.0c", "40.0c", "$1,234.50 per 24 h", "2026-12-01 00:00 UTC"]));
    inspectRow(rows[2] as Element);
    expect(allText(must(inspectorOf(container), ".explorer-inspector-head"))).toContain("980.25 (unit not stated) per 24 h");
    expect(allText(inspectorOf(container))).not.toContain("$980");
    expect(allText(must(container, '[data-testid="explorer-count"]'))).toBe("3 of 3 loaded rows · 2 venues · each venue at most 5 pages");
  });

  it("shows an unknown price as no data, never as zero", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { prices: [null, null], volume: { amount: null, unit: "usd", windowHours: null }, closesAtUtc: null })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    const cells = [...row.querySelectorAll("td")].map((cell) => allText(cell));
    expect(cells.join(" | ")).not.toMatch(/0\.0c|\$0|\b0\b/);
    // Spread, depth and close time.
    expect(row.querySelectorAll(".ui-missing").length).toBeGreaterThanOrEqual(3);
    // The display prices and the volume, in the inspector: no data, never zero.
    const head = must(inspectorOf(container), ".explorer-inspector-head");
    expect(allText(head)).not.toMatch(/0\.0c|\$0|\b0\b/);
    expect(head.querySelectorAll(".ui-missing").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps Yes and No as the sides by role and shows a team name beside them, as text", async () => {
    const outcomes = [
      { index: 0, role: "yes" as const, label: { untrusted: true as const, value: "Chiefs" }, tokenId: "a", displayPrice: "0.7" },
      { index: 1, role: "no" as const, label: { untrusted: true as const, value: "<b>Bills</b>" }, tokenId: "b", displayPrice: "0.3" },
    ];
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { outcomes })]] });
    const { container } = await mount(<MarketsView />, fakeServices([xo]));
    const cell = allText(must(inspectorOf(container), "[data-display-prices]"));
    expect(cell).toContain("Yes (Chiefs) 70.0c");
    expect(cell).toContain("No (<b>Bills</b>) 30.0c");
    expect(container.querySelector("aside b")).toBeNull();
  });

  it("links each title to its market address and nowhere else, and a plain click opens the modal in place", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "0xabc", { title: "Link me" })]], detail: { market: market("polymarket", "0xabc", { title: "Link me" }), notes: [], settlement: null } });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    const anchors = [...container.querySelectorAll("table a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(["/market/polymarket/0xabc"]);
    click(anchors[0] as Element);
    await flush(10);
    // The modal is over the unchanged surface: the table and its hero are still there, and the venues were not asked again.
    expect(allText(must(must(document.body, "[role='dialog']"), ".explorer-title"))).toBe("Link me");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    expect(pm.listCalls).toHaveLength(1);
  });

  it("the inks of the row marks follow the boards: held in the ink, link in the Yes blue, Q in the No rust", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    inspectRow(must(container, "tbody tr"));
    click(must(inspector(container), "button[aria-label='Watch this market']"));
    const marks = [...container.querySelectorAll("tbody tr .ui-mark")].map((mark) => [mark.textContent, mark.getAttribute("data-tone")]);
    expect(marks).toEqual([
      ["Q", "no"],
      ["watch", "ink"],
    ]);
  });

  it("gives a market whose id is outside the safe alphabet no link, only its inert title", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "bad id <x>", { title: "Odd id" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    expect(container.querySelectorAll("table a")).toHaveLength(0);
    expect(allText(container)).toContain("Odd id");
  });
});

describe("M0-2: venues the build cannot read are said, not emptied", () => {
  it("standalone: Limitless is read through our markets API, Kalshi is off for restricted terms, XO books need the Cockpit", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1")]], books: { state: "needs_cockpit", what: "XO order books" } });
    const { container } = await mount(<MarketsView />, fakeServices([xo], { mode: "standalone" }));
    // No Cockpit tile for Limitless: this build reads it through our markets API (here with no reader in the fakes).
    expect(tile(container, "needs-cockpit", "limitless")).toBeNull();
    expect(allText(container)).not.toContain("Limitless: needs the Cockpit");
    const kalshi = tile(container, "restricted", "kalshi");
    expect(allText(kalshi as Element)).toContain("Kalshi: off, restricted terms");
    expect(allText(kalshi as Element)).toContain("nothing was requested");
    expect(allText(kalshi as Element)).toContain("not an empty market list");
    expect(allText(tile(container, "needs-cockpit", "xo") as Element)).toContain("XO Market: needs the Cockpit");
    // The XO row itself says so where the price would be, and has no spread or depth.
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    expect(allText(must(row, '[data-col="price"]'))).toBe("book via Cockpit");
    expect(must(row, '[data-col="price"] [data-book]').getAttribute("data-book")).toBe("needs_cockpit");
    expect(must(row, '[data-col="spread"] .ui-missing')).not.toBeNull();
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
    const alerts = [...container.querySelectorAll('section[role="alert"]')];
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
    // A throttle is the venue's state with its reason, not an error panel; with no end time given, it may be asked again.
    expect(tile(container, "venue-state", "throttled")).not.toBeNull();
    expect(tile(container, "error")).toBeNull();
    fail = false;
    click(must(container, '[data-kind="venue-state"] button'));
    await flush();
    expect(allText(container)).toContain("Back again");
    expect(tile(container, "venue-state")).toBeNull();
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
    expect(allText(must(container, 'li.explorer-venue[data-venue="polymarket"]'))).toContain("Refine your search");
    expect(must(container, 'li.explorer-venue[data-venue="polymarket"]').querySelector('[data-truncated="true"]')).not.toBeNull();
    expect(must(container, 'li.explorer-venue[data-venue="xo"]').querySelector('[data-truncated="true"]')).toBeNull();
  });
});

describe("search and filters (the top bar's field narrows loaded rows; the button asks the venues)", () => {
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
    expect(allText(must(container, '[data-testid="explorer-count"]'))).toContain("1 of 3 loaded rows");
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
    expect(allText(must(container, 'li.explorer-venue[data-venue="trueo"]'))).toContain("cannot search by text, so it was not asked");
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
    const box = must<HTMLInputElement>(container, 'li.explorer-venue[data-venue="polymarket"] input[type="checkbox"]');
    click(box);
    await flush();
    expect(rowsOf(container)).toHaveLength(1);
    expect(allText(container)).not.toContain("Poly one");
    expect(allText(must(container, 'li.explorer-venue[data-venue="polymarket"]'))).toContain("not requested");
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
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load books")) as Element;
    expect(button.textContent).toBe("Load books for the first 10 visible rows");
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
    // Depth within five cents: one combined figure (10 + 20 shares), its split is in the inspector's book.
    expect(allText(must(first, '[data-col="depth"]'))).toBe("30.00 shares");
    const eleventh = rowsOf(container).find((row) => allText(row).includes("Row 11")) as Element;
    expect(allText(must(eleventh, '[data-col="price"]'))).toBe("no book loaded");
    const manifold = rowsOf(container).find((row) => allText(row).includes("Manifold")) as Element;
    expect(allText(manifold)).toContain("no order book");
  });

  it("never shows an XO spread as executable, even with a fresh Cockpit book (M0-8)", async () => {
    const xo = fakeEntry("xo", {
      pages: [[summary("xo", "m1")]],
      getBooks: (ids) => ids.map((id) => ({ ok: true as const, value: book("xo", id, [["0.50", "10"]], [["0.54", "20"]]) })),
    });
    const { container } = await mount(<MarketsView />, fakeServices([xo], { mode: "cockpit" }));
    click([...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load books")) as Element);
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
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load books")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(xo.bookCalls).toHaveLength(0);
  });

  it("a book for another token is refused, not shown", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]], getBooks: () => [{ ok: true as const, value: book("polymarket", "someone-elses", [["0.1", "1"]], [["0.2", "1"]]) }] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    click([...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load books")) as Element);
    await flush();
    const row = must<HTMLTableRowElement>(container, "tbody tr");
    expect(allText(row)).toContain("book: The venue answered in a shape we do not recognise");
    expect(allText(row)).not.toContain("10.0c");
  });

  it("an empty book and an unreachable venue read differently in the row", async () => {
    const a = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]], getBooks: () => [{ ok: false as const, error: "EMPTY_BOOK" as const }] });
    const b = fakeEntry("pascal", { pages: [[summary("pascal", "S1")]], getBooks: () => [{ ok: false as const, error: "TIMEOUT" as const }] });
    const { container } = await mount(<MarketsView />, fakeServices([a, b]));
    click([...container.querySelectorAll("button")].find((x) => x.textContent?.startsWith("Load books")) as Element);
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
    click([...container.querySelectorAll("button")].find((x) => x.textContent?.startsWith("Load books")) as Element);
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

// ---- the one surface: views, inspector, modal, Quotient ------------------------------------------------------------------

const buttonWith = (root: ParentNode, pattern: RegExp): HTMLButtonElement => {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => pattern.test(candidate.textContent ?? ""));
  if (found === undefined) throw new Error(`no button ${String(pattern)}`);
  return found;
};
const chip = (root: ParentNode, view: string): HTMLButtonElement => must<HTMLButtonElement>(root, `.ui-chip[data-view="${view}"]`);
const inspector = (root: ParentNode): HTMLElement => must<HTMLElement>(root, "aside.explorer-inspector");

describe("the views are filter states of one table, never screens", () => {
  const build = () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Xo one" })]], books: { state: "needs_cockpit", what: "XO order books" } });
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" }), summary("polymarket", "p2", { title: "Poly two" })]] });
    return { xo, pm, services: fakeServices([xo, pm]) };
  };

  it("counts every view from the loaded rows and marks Q rows by venue coverage", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    expect(chip(container, "all").getAttribute("aria-pressed")).toBe("true");
    expect(allText(chip(container, "all"))).toBe("All3");
    expect(allText(chip(container, "held"))).toBe("Holdings0");
    expect(allText(chip(container, "linked"))).toBe("Linked0");
    expect(allText(chip(container, "signals"))).toBe("Signals2");
    const marks = rowsOf(container).map((row) => allText(row.querySelector("[data-label='Marks']") as Element));
    expect(marks).toEqual(["none", "Q", "Q"]);
  });

  it("Signals narrows to the venues Quotient covers and says the switch is off, licence first", async () => {
    const { services, xo, pm } = build();
    const { container } = await mount(<MarketsView />, services);
    click(chip(container, "signals"));
    expect(rowsOf(container)).toHaveLength(2);
    expect(allText(must(container, '[data-testid="explorer-count"]'))).toContain("2 of 3 loaded rows in Signals");
    expect(allText(must(container, "[data-view-note='signals']"))).toContain("Quotient is off: the licence clause comes first");
    expect(must(container, ".explorer-list h2").textContent).toBe("Signals");
    // A chip never requests anything.
    expect(xo.listCalls).toHaveLength(1);
    expect(pm.listCalls).toHaveLength(1);
  });

  it("Linked is empty, in words, while no link dataset is approved", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    click(chip(container, "linked"));
    expect(rowsOf(container)).toHaveLength(0);
    expect(allText(must(container, "[data-view-note='linked']"))).toContain("This build bundles no link file");
    expect(allText(tile(container, "empty") as Element)).toContain("No linked market among the loaded rows");
  });

  it("Holdings says no address is watched and reads nothing", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    click(chip(container, "held"));
    await flush();
    expect(rowsOf(container)).toHaveLength(0);
    expect(allText(must(container, "[data-view-note='held']"))).toContain("No address is watched");
    expect(allText(must(container, "[data-holdings]"))).toContain("No address watched");
    // There is no Wallet page: the words point to the Connect modal, and no link leaves the surface.
    expect(allText(must(container, "[data-holdings]"))).toContain("wallet chip in the top bar");
    expect(container.querySelector("[data-holdings] a")).toBeNull();
  });

  it("the hero facts are computed, never sample counts", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    const facts = allText(must(container, ".ui-hero-facts"));
    expect(facts).toContain("no address watched");
    expect(facts).toContain("Linked groups0 no link dataset in this build");
    expect(facts).toContain("Quotientoff licence first");
    // The h1 names the venues this build reads with the current settings: computed, never a fixed word.
    const readable = container.querySelectorAll("li.explorer-venue").length;
    expect(readable).toBeGreaterThan(0);
    expect(must(container, "h1").textContent).toBe(heroTitle(readable));
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    // The phone's label repeats computed figures only, and is hidden from assistive technology.
    const compact = must(container, ".ui-hero-compact");
    expect(compact.getAttribute("aria-hidden")).toBe("true");
    expect(allText(compact)).toBe(`${readable} venues · 3 rows`);
    // The rules' inks follow the boards: Held in the ink, Linked groups in the Yes blue, Quotient in the No rust.
    expect([...container.querySelectorAll(".ui-hero-fact")].map((fact) => fact.getAttribute("data-tone"))).toEqual(["ink", "yes", "no"]);
  });
});

describe("the inspector", () => {
  const books = (tokenIds: readonly string[]): ReadonlyArray<Result<Book, AdapterError>> => tokenIds.map((id) => ({ ok: true as const, value: book("polymarket", id, [["0.50", "10"]], [["0.54", "20"]]) }));

  it("inspects the first row on load, names itself by aria-label only, and shows provenance, the title slot, the book and the actions", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" }), summary("polymarket", "p2", { title: "Poly two" })]], getBooks: books });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    const aside = inspector(container);
    expect(aside.getAttribute("aria-label")).toBe("Inspector");
    expect(aside.querySelector("h2")).toBeNull();
    // The first row shown is inspected on load; nothing was requested for it.
    expect(aside.getAttribute("data-selected")).toBe("polymarket:p1");
    expect(must(container, "tbody tr").getAttribute("data-selected")).toBe("true");
    expect(must(container, "tbody tr button.explorer-row-select").getAttribute("aria-current")).toBe("true");
    // A click anywhere on another row selects it, as its venue button does from the keyboard.
    const second = rowsOf(container)[1] as HTMLTableRowElement;
    click(must(second, '[data-col="category"]'));
    expect(aside.getAttribute("data-selected")).toBe("polymarket:p2");
    expect(must(second, "button.explorer-row-select").getAttribute("aria-current")).toBe("true");
    inspectRow(must(container, "tbody tr"));
    expect(aside.getAttribute("data-selected")).toBe("polymarket:p1");
    // The select button's name is "Inspect", the title slot's text and the venue.
    const select = must(must(container, "tbody tr"), "button.explorer-row-select");
    const names = (select.getAttribute("aria-labelledby") ?? "").split(" ").map((id) => allText(document.getElementById(id) as Element));
    expect(names).toEqual(["Inspect", "Poly one", "on Polymarket"]);
    expect(allText(must(aside, ".explorer-title"))).toBe("Poly one");
    expect(allText(must(aside, ".ui-provenance"))).toContain("browser direct");
    expect(allText(aside)).toContain("has not been loaded in this visit");
    // The row's book, on request only.
    expect(pm.bookCalls).toHaveLength(0);
    click(buttonWith(aside, /Load this order book/));
    await flush();
    expect(pm.bookCalls).toEqual([["p1-t0"]]);
    expect(allText(aside)).toContain("bid 50.0c / ask 54.0c");
    expect(allText(aside)).toContain("Yes bids, highest first");
    // Same question elsewhere and the Quotient line, in words, each heading with its note on the right.
    expect([...aside.querySelectorAll(".explorer-section-head")].map((head) => allText(head))).toEqual(["Order bookbest levels; the modal has the rest", "Same question elsewherecandidates, not proof", "Quotientcovered · off"]);
    expect(allText(aside)).toContain("No approved link.");
    expect(must(aside, "[data-quotient]").getAttribute("data-quotient")).toBe("off");
    expect(allText(aside)).toContain("licence first");
    // Actions: open, trade (a Polymarket row trades with the visitor's own wallet in the standalone build), watch.
    expect(buttonWith(aside, /^Open market$/).disabled).toBe(false);
    expect(buttonWith(aside, /Trade with your wallet/).disabled).toBe(false);
    expect(buttonWith(aside, /Trade with your wallet/).getAttribute("data-prepare")).toBe("direct");
  });

  it("Watch marks the row in memory and sends nothing", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" })]] });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    const before = pm.listCalls.length;
    const watch = must<HTMLButtonElement>(inspector(container), "button[aria-label='Watch this market']");
    expect(watch.getAttribute("aria-pressed")).toBe("false");
    expect(allText(document.getElementById(watch.getAttribute("aria-describedby") ?? "") as Element)).toContain("memory only");
    click(watch);
    expect(allText(must(container, "tbody tr [data-label='Marks']"))).toContain("watch");
    expect(must(inspector(container), "button[aria-label='Watch this market']").getAttribute("aria-pressed")).toBe("true");
    expect(pm.listCalls.length).toBe(before);
  });

  it("XO in the standalone build: trade with your wallet; the Cockpit build unpaired: not paired", async () => {
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1")]], books: { state: "needs_cockpit", what: "XO order books" } });
    const standalone = await mount(<MarketsView />, fakeServices([xo]));
    expect(buttonWith(inspector(standalone.container), /Trade with your wallet/).disabled).toBe(false);
    cleanup();
    const cockpit = await mount(<MarketsView />, fakeServices([fakeEntry("xo", { pages: [[summary("xo", "m1")]] })], { mode: "cockpit" }));
    const prepare = buttonWith(inspector(cockpit.container), /Prepare order/);
    expect(prepare.disabled).toBe(true);
    expect(prepare.textContent).toBe("Prepare order: not paired with your Cockpit");
    expect(cockpit.daemon.toolCalls).toEqual([]);
  });

  it("Open market opens the modal over the table without leaving the page, and closing it comes back", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" })]], detail: { market: market("polymarket", "p1", { title: "Poly one" }), notes: [], settlement: null }, getBooks: books });
    const { container } = await mount(<MarketsView />, fakeServices([pm]));
    click(buttonWith(inspector(container), /^Open market$/));
    await flush(10);
    const dialog = must(document.body, "[role='dialog']");
    expect(must(dialog, "h2").textContent).toBe("Market");
    expect(allText(must(dialog, ".explorer-title"))).toBe("Poly one");
    expect(allText(dialog)).toContain("Rules fingerprint (sha256");
    expect(pm.detailCalls).toHaveLength(1);
    // The table is still mounted underneath: nothing navigated and nothing was asked of the venues again.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(pm.listCalls).toHaveLength(1);
    click(must(dialog, "button.ui-dialog-close"));
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
  });

  it("the Quotient settings dialog opens from the Quotient line with the switch off and the clause first", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1")]] });
    const { container, signals } = await mount(<MarketsView />, fakeServices([pm]));
    click(buttonWith(inspector(container), /^Quotient settings$/));
    const dialog = must(document.body, "[role='dialog']");
    expect(must(dialog, "h2").textContent).toBe("Quotient settings");
    expect(must(dialog, "[data-kind='signals-gate']").getAttribute("data-code")).toBe("off");
    expect(allText(dialog)).toContain("Quotient's terms limit what you may do with its output");
    expect(signals.fake.calls).toHaveLength(0);
  });
});

describe("a deep link opens the market modal over the table", () => {
  it("renders the same surface, hero band included, with the modal for the market named; a bad address is a typed not-found", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" })]], detail: { market: market("polymarket", "p1", { title: "Poly one" }), notes: [], settlement: null } });
    const { container } = await mount(<MarketsView market={{ venue: "polymarket", marketId: "p1" }} />, fakeServices([pm]));
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    expect(container.querySelector(".ui-hero")).not.toBeNull();
    const dialog = must(document.body, "[role='dialog']");
    expect(allText(must(dialog, ".explorer-title"))).toBe("Poly one");
    cleanup();
    const bad = await mount(<MarketsView invalidAddress />, fakeServices([pm]));
    expect(allText(bad.container)).toContain("This is not a market address");
    expect(must(bad.container, "h1").textContent).toMatch(HERO_H1);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });
});

describe("switching a view drops a selection the new view does not show", () => {
  it("falls back to the first row of the next view when the inspected row is not in it, and keeps it when it is", async () => {
    const pm = fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" }), summary("polymarket", "p2", { title: "Poly two" })]] });
    const xo = fakeEntry("xo", { pages: [[summary("xo", "m1", { title: "Xo one" })]], books: { state: "needs_cockpit", what: "XO order books" } });
    const { container } = await mount(<MarketsView />, fakeServices([pm, xo]));
    const xoRow = rowsOf(container).find((row) => allText(row).includes("Xo one")) as Element;
    inspectRow(xoRow);
    expect(inspector(container).getAttribute("data-selected")).toBe("xo:m1");
    // Signals shows Polymarket rows only: the XO selection is gone from the table and from the inspector alike, and
    // the first row the view shows is inspected instead.
    click(chip(container, "signals"));
    expect(container.querySelectorAll("tbody tr[data-selected='true']")).toHaveLength(1);
    expect(inspector(container).getAttribute("data-selected")).toBe(`polymarket:${rowsOf(container)[0]?.textContent?.includes("Poly one") === true ? "p1" : "p2"}`);
    click(chip(container, "all"));
    const pmRow = rowsOf(container).find((row) => allText(row).includes("Poly two")) as Element;
    inspectRow(pmRow);
    click(chip(container, "signals"));
    expect(inspector(container).getAttribute("data-selected")).toBe("polymarket:p2");
    expect(must(container, "tbody tr[data-selected='true']").textContent).toContain("Poly two");
  });
});
