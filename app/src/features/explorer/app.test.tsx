// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import type { Loader } from "../../ui/routes";
import { act, allText, click, cleanup, must, render } from "../../ui/testing/dom";
import { ExplorerServicesProvider } from "./services";
import { fakeEntry, fakeServices, flush, market, summary, until } from "./test-support";

afterEach(cleanup);

// The real route files, loaded the way the shell's glob loads them.
const loaders: Record<string, Loader> = {
  "./routes/markets.tsx": () => import("../../routes/markets"),
  "./routes/market.tsx": () => import("../../routes/market"),
};

const HOSTILE = '<img src=x onerror=alert(1)> javascript:alert(1)';

async function mountApp(mode: "standalone" | "cockpit") {
  const xo = fakeEntry("xo", {
    pages: [[summary("xo", "0xabc", { title: HOSTILE })]],
    detail: { market: market("xo", "0xabc", { title: HOSTILE }), notes: [], settlement: null },
    books: { state: "needs_cockpit", what: "XO order books" },
  });
  const services = fakeServices([xo], { mode });
  const location = memoryLocation({ path: "/markets" });
  const rendered = render(
    <ExplorerServicesProvider services={services}>
      <App loaders={loaders} mode={mode} locationHook={location.hook} clock={{ now: services.nowMs }} />
    </ExplorerServicesProvider>,
  );
  await until(() => rendered.container.querySelector("tbody tr") !== null);
  return { ...rendered, location, xo };
}

describe("the explorer's routes inside the shell", () => {
  it("adds Markets to the navigation and not the market page, and works in both builds", async () => {
    for (const mode of ["standalone", "cockpit"] as const) {
      const { container } = await mountApp(mode);
      expect([...container.querySelectorAll("nav a")].map((a) => a.textContent)).toEqual(["Overview", "Markets"]);
      expect(must(container, "h1").textContent).toBe("Markets");
      expect(document.title).toBe("Markets · XO Cockpit");
      expect(container.querySelector('[data-kind="needs-cockpit"][data-code="page"]')).toBeNull();
      expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
      cleanup();
    }
  });

  it("opens a market from its title; the h1 and document title stay fixed app text", async () => {
    const { container } = await mountApp("standalone");
    const link = must<HTMLAnchorElement>(container, "tbody a");
    expect(link.getAttribute("href")).toBe("/market/xo/0xabc");
    click(link);
    await flush(10);
    expect(must(container, "h1").textContent).toBe("Market");
    expect(document.title).toBe("Market · XO Cockpit");
    // The creator's text is in the page, inside the untrusted slot, and nowhere a heading or title could carry it.
    expect(allText(must(container, "h2.explorer-title"))).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
    expect(document.title).not.toContain("img");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(allText(must(container, "h1"))).not.toContain("img");
  });

  it("goes back to the list from the market page", async () => {
    const { container, location } = await mountApp("standalone");
    act(() => location.navigate("/market/xo/0xabc"));
    await flush(10);
    click(must(container, "a[href='/markets']"));
    await flush(10);
    expect(must(container, "h1").textContent).toBe("Markets");
  });

  it("an address that names no market is a typed 'not found', not a blank page", async () => {
    const { container, location, xo } = await mountApp("standalone");
    act(() => location.navigate("/market/xo/%3Cimg%20src%3Dx%3E"));
    await flush(10);
    expect(must(container, "h1").textContent).toBe("Market");
    expect(allText(container)).toContain("This is not a market address");
    expect(xo.detailCalls).toHaveLength(0);
  });
});
