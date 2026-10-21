// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import type { Loader } from "../../ui/routes";
import { act, allText, cleanup, click, must, render } from "../../ui/testing/dom";
import { SignalsServicesProvider } from "../signals/services";
import { makeRig } from "../signals/test-support";
import { ExplorerServicesProvider } from "./services";
import { fakeEntry, fakeServices, flush, market, summary, until } from "./test-support";

afterEach(cleanup);

// The real route files, loaded the way the shell's glob loads them: the surface at "/" and "/markets", the deep link.
const loaders: Record<string, Loader> = {
  "./routes/home.tsx": () => import("../../routes/home"),
  "./routes/markets.tsx": () => import("../../routes/markets"),
  "./routes/market.tsx": () => import("../../routes/market"),
};

const HOSTILE = '<img src=x onerror=alert(1)> javascript:alert(1)';
// The hero band's h1: a sentence naming the number of venues this build reads (HeroBand.tsx heroTitle).
const HERO_H1 = /^Every open market this build can read\. [A-Z][a-z]+ venues?, one book at a time\.$/;

async function mountApp(mode: "standalone" | "cockpit", path = "/markets") {
  const xo = fakeEntry("xo", {
    pages: [[summary("xo", "0xabc", { title: HOSTILE })]],
    detail: { market: market("xo", "0xabc", { title: HOSTILE }), notes: [], settlement: null },
    books: { state: "needs_cockpit", what: "XO order books" },
  });
  const services = fakeServices([xo], { mode });
  const signals = makeRig({ mode });
  const location = memoryLocation({ path, record: true });
  const rendered = render(
    <ExplorerServicesProvider services={services}>
      <SignalsServicesProvider services={signals.services}>
        <App loaders={loaders} mode={mode} locationHook={location.hook} clock={{ now: services.nowMs }} />
      </SignalsServicesProvider>
    </ExplorerServicesProvider>,
  );
  await until(() => rendered.container.querySelector("tbody tr") !== null);
  return { ...rendered, location, xo };
}

describe("the explorer's routes inside the shell", () => {
  it("is the surface at the start and at /markets, with no navigation bar, in both builds", async () => {
    for (const mode of ["standalone", "cockpit"] as const) {
      for (const path of ["/", "/markets"]) {
        const { container } = await mountApp(mode, path);
        expect(container.querySelector("nav")).toBeNull();
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        expect(must(container, "h1").textContent).toMatch(HERO_H1);
        expect(document.title).toBe("Markets · XO Cockpit");
        expect(container.querySelector('[data-kind="needs-cockpit"][data-code="page"]')).toBeNull();
        expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
        // The top bar's search field is the one search box; the surface renders none of its own.
        expect(container.querySelectorAll('input[type="search"]')).toHaveLength(1);
        cleanup();
      }
    }
  });

  it("opens a market from its title in the modal, in place: the route, the h1 and the document title do not change", async () => {
    const { container, location } = await mountApp("standalone");
    const link = must<HTMLAnchorElement>(container, "tbody a");
    expect(link.getAttribute("href")).toBe("/market/xo/0xabc");
    click(link);
    await flush(10);
    expect(location.history.at(-1)).toBe("/markets");
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    expect(document.title).toBe("Markets · XO Cockpit");
    const dialog = must(document.body, "[role='dialog']");
    // The creator's text is in the modal, inside the untrusted slot, and nowhere a heading or title could carry it.
    expect(allText(must(dialog, ".explorer-title"))).toContain("<img src=x onerror=alert(1)>");
    expect(document.body.querySelector("img")).toBeNull();
    expect(document.title).not.toContain("img");
    expect(document.body.querySelectorAll("h1")).toHaveLength(1);
    expect(allText(must(container, "h1"))).not.toContain("img");
    expect(allText(must(dialog, "h2"))).toBe("Market");
  });

  it("a deep link shows the same surface, hero band and all, under the modal; closing it goes to the start", async () => {
    const { container, location } = await mountApp("standalone");
    act(() => location.navigate("/market/xo/0xabc"));
    await flush(10);
    expect(document.title).toBe("Market · XO Cockpit");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    expect(container.querySelector(".ui-hero")).not.toBeNull();
    const dialog = must(document.body, "[role='dialog']");
    click(must(dialog, "button.ui-dialog-close"));
    await flush(10);
    expect(location.history.at(-1)).toBe("/");
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });

  it("an address that names no market is a typed 'not found' over the list, not a blank page", async () => {
    const { container, location, xo } = await mountApp("standalone");
    act(() => location.navigate("/market/xo/%3Cimg%20src%3Dx%3E"));
    await flush(10);
    expect(must(container, "h1").textContent).toMatch(HERO_H1);
    expect(allText(container)).toContain("This is not a market address");
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(xo.detailCalls).toHaveLength(0);
  });
});
