// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { CategoryVerdict } from "../../core/category";
import { untrusted } from "../../core/untrusted";
import { act, allText, click, cleanup, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { MarketsView } from "./MarketsView";
import { fakeEntry, fakeServices, flush, mount, summary } from "./test-support";

// The category chip row: a second row of filter states under the view chips, computed from the verdict each loaded
// row carries, composed with the view and the search text. It never requests anything and never touches the URL.

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

const native = (category: CategoryVerdict["category"]): CategoryVerdict => ({ category, confidence: "native", matched: [`common:${category}`] });
const keyword = (category: CategoryVerdict["category"], phrase: string): CategoryVerdict => ({ category, confidence: "keyword", matched: [`keyword:${phrase}`] });

const rowsOf = (root: ParentNode): HTMLTableRowElement[] => [...root.querySelectorAll<HTMLTableRowElement>("tbody tr")];
const chipRow = (root: ParentNode): HTMLElement => must<HTMLElement>(root, '[role="group"][aria-label="Category"]');
const chips = (root: ParentNode): HTMLButtonElement[] => [...chipRow(root).querySelectorAll<HTMLButtonElement>(".ui-chip")];
const chip = (root: ParentNode, category: string): HTMLButtonElement => must<HTMLButtonElement>(chipRow(root), `.ui-chip[data-category="${category}"]`);
const viewChip = (root: ParentNode, view: string): HTMLButtonElement => must<HTMLButtonElement>(root, `.ui-chip[data-view="${view}"]`);
const buttonWith = (root: ParentNode, pattern: RegExp): HTMLButtonElement => {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => pattern.test(candidate.textContent ?? ""));
  if (found === undefined) throw new Error(`no button ${String(pattern)}`);
  return found;
};
const inspector = (root: ParentNode): HTMLElement => must<HTMLElement>(root, "aside.explorer-inspector");
const HOSTILE = '<img src=x onerror=alert(1)> SPORTS <script>alert(2)</script>';

function build() {
  const xo = fakeEntry("xo", {
    pages: [
      [
        summary("xo", "m1", { title: "Election night", category: native("politics"), categoryNative: untrusted("POLITICS") }),
        summary("xo", "m2", { title: "Cup final", category: native("sports"), categoryNative: untrusted(HOSTILE) }),
      ],
    ],
    books: { state: "needs_cockpit", what: "XO order books" },
  });
  const pm = fakeEntry("polymarket", {
    pages: [[summary("polymarket", "p1", { title: "Rate cut by March", category: keyword("economics", "rate cut") }), summary("polymarket", "p2", { title: "Senate seat", category: native("politics") })]],
  });
  // A venue whose reader attaches no verdict: its rows are "Other", unassigned.
  const mani = fakeEntry("manifold", { pages: [[summary("manifold", "mm", { title: "Play money thing" })]], books: { state: "none", why: "no order book" } });
  return { xo, pm, mani, services: fakeServices([xo, pm, mani]) };
}

describe("the category chip row", () => {
  it("shows All categories and one chip per category with a loaded row, counted, in the taxonomy's order", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    expect(chips(container).map((c) => [c.getAttribute("data-category"), allText(c), c.getAttribute("aria-pressed")])).toEqual([
      ["all", "All categories5", "true"],
      ["politics", "Politics2", "false"],
      ["sports", "Sports1", "false"],
      ["economics", "Economics1", "false"],
      ["other", "Other1", "false"],
    ]);
    // Counts are set in mono, the labels are sentence case, and the row is under the view chips, not beside them.
    expect([...chipRow(container).querySelectorAll(".ui-num")].map((n) => n.textContent)).toEqual(["5", "2", "1", "1", "1"]);
    for (const c of chips(container)) expect(allText(c)).not.toMatch(/[A-Z]{2}/);
    const viewRow = must(container, '[role="group"][aria-label="View"]');
    expect(viewRow.compareDocumentPosition(chipRow(container)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the table has a narrow category column with the label only, never the venue's words", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    expect([...container.querySelectorAll("thead th")].map((th) => th.textContent)).toContain("Category");
    const cells = rowsOf(container).map((row) => allText(must(row, '[data-col="category"]')));
    expect(cells.sort()).toEqual(["Economics", "Other", "Politics", "Politics", "Sports"]);
    expect(allText(container)).not.toContain("<img");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("pressing a chip narrows the table, says so in the count line, requests nothing and leaves the URL alone", async () => {
    const { services, xo, pm } = build();
    const href = window.location.href;
    const { container } = await mount(<MarketsView />, services);
    click(chip(container, "politics"));
    expect(rowsOf(container)).toHaveLength(2);
    expect(allText(must(container, '[data-testid="explorer-count"]'))).toContain("2 markets shown in Politics of 5 loaded");
    expect(chip(container, "politics").getAttribute("aria-pressed")).toBe("true");
    expect(chip(container, "all").getAttribute("aria-pressed")).toBe("false");
    expect(must(container, ".explorer").getAttribute("data-category")).toBe("politics");
    expect(xo.listCalls).toHaveLength(1);
    expect(pm.listCalls).toHaveLength(1);
    expect(window.location.href).toBe(href);
    expect(chipRow(container).querySelector("a")).toBeNull();
    click(chip(container, "all"));
    expect(rowsOf(container)).toHaveLength(5);
    expect(allText(must(container, '[data-testid="explorer-count"]'))).toContain("5 markets shown from 3 venues");
  });

  it("composes with the view chips and the search text, and the counts follow the view", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    click(viewChip(container, "signals"));
    // Signals shows Polymarket rows only: Politics 1, Economics 1, and no Sports or Other chip.
    expect(chips(container).map((c) => allText(c))).toEqual(["All categories2", "Politics1", "Economics1"]);
    click(chip(container, "politics"));
    expect(rowsOf(container)).toHaveLength(1);
    expect(allText(must(container, '[data-testid="explorer-count"]'))).toContain("1 market shown in the Signals view in Politics of 5 loaded");
    typeInto(must<HTMLInputElement>(container, 'input[type="search"]'), "nothing matches");
    expect(rowsOf(container)).toHaveLength(0);
    expect(allText(container)).toContain("No market in Politics among the loaded rows");
    typeInto(must<HTMLInputElement>(container, 'input[type="search"]'), "senate");
    expect(rowsOf(container)).toHaveLength(1);
    // Back to All with the category still on: both Politics rows, the chip still pressed.
    typeInto(must<HTMLInputElement>(container, 'input[type="search"]'), "");
    click(viewChip(container, "all"));
    expect(rowsOf(container)).toHaveLength(2);
    expect(chip(container, "politics").getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the pressed chip when its count falls to zero, so the filter is never hidden while on", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    click(chip(container, "sports"));
    click(viewChip(container, "signals"));
    expect(chips(container).map((c) => allText(c))).toEqual(["All categories2", "Politics1", "Sports0", "Economics1"]);
    expect(rowsOf(container)).toHaveLength(0);
    expect(allText(container)).toContain("No market in Sports among the loaded rows");
  });

  it("the inspector says the category, where it came from, and the venue's own words only as untrusted text", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    const cup = rowsOf(container).find((row) => allText(row).includes("Cup final")) as Element;
    click(buttonWith(cup, /^Inspect$/));
    const line = must(inspector(container), ".explorer-category-line");
    expect(line.getAttribute("data-category")).toBe("sports");
    expect(line.getAttribute("data-category-source")).toBe("native");
    expect(allText(line)).toContain("Category: Sports · from the venue's taxonomy · venue says");
    const slot = must(line, ".ui-untrusted");
    expect(slot.textContent).toContain("<img src=x onerror=alert(1)> SPORTS");
    expect(line.querySelector("img")).toBeNull();
    expect(line.querySelector("script")).toBeNull();
    // A keyword verdict and an unassigned row say so, and show no venue words when there are none.
    const rate = rowsOf(container).find((row) => allText(row).includes("Rate cut")) as Element;
    click(buttonWith(rate, /^Inspect$/));
    expect(allText(must(inspector(container), ".explorer-category-line"))).toBe("Category: Economics · from title keywords");
    const play = rowsOf(container).find((row) => allText(row).includes("Play money")) as Element;
    click(buttonWith(play, /^Inspect$/));
    expect(allText(must(inspector(container), ".explorer-category-line"))).toBe("Category: Other · unassigned");
  });

  it("pressing a chip drops a selection it does not show and keeps one it does", async () => {
    const { services } = build();
    const { container } = await mount(<MarketsView />, services);
    const cup = rowsOf(container).find((row) => allText(row).includes("Cup final")) as Element;
    click(buttonWith(cup, /^Inspect$/));
    expect(inspector(container).getAttribute("data-selected")).toBe("xo:m2");
    click(chip(container, "politics"));
    expect(inspector(container).getAttribute("data-selected")).toBe("none");
    expect(container.querySelector("tbody tr[data-selected='true']")).toBeNull();
    const election = rowsOf(container).find((row) => allText(row).includes("Election night")) as Element;
    click(buttonWith(election, /^Inspect$/));
    click(chip(container, "all"));
    expect(inspector(container).getAttribute("data-selected")).toBe("xo:m1");
  });

  it("the chips are 44 px buttons with aria-pressed, and the loaded surface has no axe violations", async () => {
    const { services } = build();
    const { container } = await mount(
      <main>
        <h1>Markets</h1>
        <MarketsView />
      </main>,
      services,
    );
    for (const c of chips(container)) {
      expect(c.tagName).toBe("BUTTON");
      expect(c.getAttribute("type")).toBe("button");
      expect(["true", "false"]).toContain(c.getAttribute("aria-pressed"));
    }
    click(chip(container, "politics"));
    await flush();
    const violations = await runAxe(container);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
