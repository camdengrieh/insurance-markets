// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "./App";
import type { Untrusted } from "./core/ports";
import { click, cleanup, act, allText, must, render, settle } from "./ui/testing/dom";
import type { AppMode } from "./ui/context";
import type { Loader } from "./ui/routes";
import type { RouteProps } from "./ui/route-types";
import { THEME_STORAGE_KEY } from "./ui/theme";
import { UntrustedText } from "./ui/UntrustedText";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

const hostile: Untrusted<string> = { untrusted: true, value: '<img src=x onerror=alert(1)> javascript:alert(1)' };

function screen(id: string, path: string, title: string, body: (props: RouteProps) => React.ReactNode, extra: Record<string, unknown> = {}): Loader {
  return async () => ({ route: { id, path, title, ...extra }, default: (props: RouteProps) => <section aria-label={id}>{body(props)}</section> });
}

const loaders: Record<string, Loader> = {
  "./routes/markets.tsx": screen("markets", "/markets", "Markets", () => <h2>Market list</h2>, { nav: { label: "Markets", order: 1 } }),
  "./routes/portfolio.tsx": screen("portfolio", "/portfolio", "Portfolio", () => <h2>Positions</h2>, { nav: { label: "Portfolio", order: 2 } }),
  "./routes/market.tsx": screen("market", "/market/:venue/:marketId", "Market", ({ params }) => (
    <>
      <h2>
        <UntrustedText value={hostile} field="title" />
      </h2>
      <p data-testid="params">{`${params.venue}|${params.marketId}`}</p>
    </>
  )),
  "./routes/terminal.tsx": screen("terminal", "/terminal", "Terminal", () => <h2>Console</h2>, { nav: { label: "Terminal", order: 9 }, availability: "cockpit" }),
};

async function mountApp(options: { loaders?: Record<string, Loader>; mode?: AppMode; path?: string } = {}) {
  const location = memoryLocation({ path: options.path ?? "/" });
  const rendered = render(<App loaders={options.loaders ?? loaders} mode={options.mode ?? "cockpit"} locationHook={location.hook} />);
  await settle();
  return { ...rendered, navigate: (to: string) => act(() => location.navigate(to)) };
}

const h1s = (root: ParentNode) => [...root.querySelectorAll("h1")].map((h) => h.textContent);

describe("shell structure", () => {
  // The v2 shell has no navigation bar: the header carries the brand link to "/", the search field and the
  // mode words; the Overview at "/" (shown only while no route claims that path) lists the fixed-path screens.
  it("has the landmarks, a skip link, the brand link, the search field, no nav and exactly one h1", async () => {
    const { container } = await mountApp();
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("main#main")).not.toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    expect(container.querySelector("nav")).toBeNull();
    expect(must(container, 'header a[href="/"]').textContent).toContain("Cockpit");
    const search = must<HTMLInputElement>(container, 'header input[type="search"]');
    expect(must(container, `label[for="${search.id}"]`).textContent).toContain("Search loaded rows");
    expect(must(container, ".ui-skip-link").textContent).toBe("Skip to content");
    expect(h1s(container)).toEqual(["Overview"]);
    expect(document.title).toBe("Overview · XO Cockpit");
  });

  it("the overview lists the fixed-path screens in nav order as links and a screen keeps its own title", async () => {
    const { container, navigate } = await mountApp();
    const links = [...must(container, "main").querySelectorAll("ul a")];
    expect(links.map((a) => a.textContent)).toEqual(["Markets", "Portfolio", "Terminal"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/markets", "/portfolio", "/terminal"]);
    navigate("/portfolio");
    expect(h1s(container)).toEqual(["Portfolio"]);
    expect(container.querySelector("main ul a")).toBeNull();
  });

  it("shows a build with no screens as an empty overview, not an error", async () => {
    const { container } = await mountApp({ loaders: {} });
    expect(h1s(container)).toEqual(["Overview"]);
    expect(allText(container)).toContain("No screens are installed in this build");
    expect(container.querySelector('main [role="alert"]')).toBeNull();
  });

  it("says the build is the standalone explorer or the Cockpit", async () => {
    const standalone = await mountApp({ mode: "standalone" });
    expect(allText(standalone.container.querySelector("header") as Element)).toContain("Standalone explorer");
    expect(allText(standalone.container.querySelector("footer") as Element)).toContain("Read-only. Holds no key");
    cleanup();
    const cockpit = await mountApp({ mode: "cockpit" });
    expect(allText(cockpit.container.querySelector("header") as Element)).toContain("Local Cockpit");
  });

  it("renders a status strip only when one is supplied", async () => {
    const without = await mountApp();
    expect(without.container.querySelector(".ui-statusbar")).toBeNull();
    cleanup();
    const location = memoryLocation({ path: "/" });
    const { container } = render(<App loaders={{}} mode="cockpit" locationHook={location.hook} statusBar={<span>OBSERVE</span>} />);
    await settle();
    expect(must(container, '[aria-label="Session status"]').textContent).toBe("OBSERVE");
  });
});

describe("navigation", () => {
  it("keeps the browser's focus on first load", async () => {
    await mountApp({ path: "/markets" });
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the new h1, sets the title and announces politely", async () => {
    const { container, navigate } = await mountApp();
    click(must(container, 'main a[href="/markets"]'));
    expect(h1s(container)).toEqual(["Markets"]);
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("Markets");
    expect(document.title).toBe("Markets · XO Cockpit");
    expect(must(document, '[data-live="polite"]').textContent?.trim()).toBe("Markets page");
    navigate("/portfolio");
    expect(h1s(container)).toEqual(["Portfolio"]);
    expect(document.activeElement?.textContent).toBe("Portfolio");
  });

  it("passes route params to the screen", async () => {
    const { container } = await mountApp({ path: "/market/polymarket/0xabc" });
    expect(must(container, '[data-testid="params"]').textContent).toBe("polymarket|0xabc");
    expect(h1s(container)).toEqual(["Market"]);
  });

  it("shows page-not-found with a way back", async () => {
    const { container } = await mountApp({ path: "/nope/nothing" });
    expect(h1s(container)).toEqual(["Page not found"]);
    expect(container.querySelector('main a[href="/"]')).not.toBeNull();
  });

  it("the skip link focuses main and does not change the location", async () => {
    const { container } = await mountApp({ path: "/markets" });
    click(must(container, ".ui-skip-link"));
    expect(document.activeElement).toBe(must(container, "main"));
    expect(h1s(container)).toEqual(["Markets"]);
  });
});

describe("availability", () => {
  it("standalone: a Cockpit-only screen shows the tile and never mounts the screen", async () => {
    const mounted = vi.fn();
    const only = { "./routes/terminal.tsx": async () => ({ route: { id: "terminal", path: "/terminal", title: "Terminal", nav: { label: "Terminal", order: 1 }, availability: "cockpit" }, default: () => { mounted(); return <p>console</p>; } }) };
    const { container, navigate } = await mountApp({ loaders: only, mode: "standalone", path: "/terminal" });
    expect(h1s(container)).toEqual(["Terminal"]);
    expect(allText(container)).toContain("needs the Cockpit");
    expect(mounted).not.toHaveBeenCalled();
    navigate("/");
    expect(h1s(container)).toEqual(["Overview"]);
    expect(allText(must(container, "main ul"))).toContain("Terminal (needs the Cockpit)");
    expect(mounted).not.toHaveBeenCalled();
  });

  it("cockpit: the same screen renders", async () => {
    const { container } = await mountApp({ mode: "cockpit", path: "/terminal" });
    expect(allText(must(container, "main"))).toContain("Console");
    expect(allText(must(container, "main"))).not.toContain("needs the Cockpit");
  });
});

describe("failure isolation", () => {
  it("a screen that crashes shows a tile, keeps the shell, and recovers on navigation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crashing = {
      ...loaders,
      "./routes/crash.tsx": async () => ({
        route: { id: "crash", path: "/crash", title: "Crash", nav: { label: "Crash", order: 3 } },
        default: () => {
          throw new TypeError("upstream said <img src=x onerror=alert(1)>");
        },
      }),
    };
    const { container, navigate } = await mountApp({ loaders: crashing, path: "/crash" });
    const main = must(container, "main");
    expect(main.querySelector('[data-code="ROUTE_CRASHED"]')).not.toBeNull();
    expect(allText(main)).toContain("The rest of the app is fine");
    expect(allText(main)).toContain("TypeError");
    expect(allText(main)).not.toContain("upstream said");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('header a[href="/"]')).not.toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    navigate("/markets");
    expect(h1s(container)).toEqual(["Markets"]);
    expect(main.querySelector('[data-code="ROUTE_CRASHED"]')).toBeNull();
  });

  it("a route file that fails to load is reported on every page and the others still work", async () => {
    const broken = {
      ...loaders,
      "./routes/broken.tsx": async () => {
        throw new Error("<b>boom</b>");
      },
      "./routes/dup.tsx": screen("markets", "/dup", "Dup", () => null),
    };
    const { container } = await mountApp({ loaders: broken, path: "/portfolio" });
    expect(allText(container)).toContain("screens could not be loaded");
    const text = allText(must(container, "main details"));
    expect(text).toContain("broken.tsx was skipped: the screen could not be loaded");
    expect(text).toContain("dup.tsx was skipped: another screen uses the same route id");
    expect(container.querySelector("b")).toBeNull();
    expect(h1s(container)).toEqual(["Portfolio"]);
  });
});

describe("market text", () => {
  it("a screen showing a hostile title stays inert and the title never reaches the document title or the announcer", async () => {
    const { container } = await mountApp({ path: "/market/xo/1" });
    expect(container.querySelector("main img, main a[href^='javascript'], main script")).toBeNull();
    expect(must(container, ".ui-untrusted").textContent).toContain("<img src=x onerror=alert(1)>");
    expect(document.title).toBe("Market · XO Cockpit");
    expect(must(document, '[data-live="polite"]').textContent).not.toContain("img");
  });
});

describe("theme", () => {
  // The 44 x 44 half-circle button steps system -> light -> dark -> system; its name says the current and next choice.
  const toggle = (root: ParentNode): HTMLButtonElement => must<HTMLButtonElement>(root, "button.ui-theme-toggle");

  it("applies and remembers a manual choice, and a system choice clears it", async () => {
    const { container } = await mountApp();
    expect(toggle(container).getAttribute("data-theme-choice")).toBe("system");
    expect(toggle(container).getAttribute("aria-label")).toBe("Switch theme: now system, next light");
    click(toggle(container));
    click(toggle(container));
    expect(toggle(container).getAttribute("data-theme-choice")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    click(toggle(container));
    expect(toggle(container).getAttribute("data-theme-choice")).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("reads a saved choice and ignores a bad one", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const saved = await mountApp();
    expect(toggle(saved.container).getAttribute("data-theme-choice")).toBe("dark");
    cleanup();
    window.localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    const bad = await mountApp();
    expect(toggle(bad.container).getAttribute("data-theme-choice")).toBe("system");
  });

  it("still works when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { container } = await mountApp();
    expect(toggle(container).getAttribute("data-theme-choice")).toBe("system");
    click(toggle(container));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("the top bar search", () => {
  it("keeps one search field with a words-only hint, and a 44 px button that unfolds it on a phone", async () => {
    const { container } = await mountApp();
    const input = must<HTMLInputElement>(container, "header input[type='search']");
    expect(input.getAttribute("placeholder")).toBe("Search loaded markets");
    const toggle = must<HTMLButtonElement>(container, "header button.ui-search-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Search loaded rows");
    const slot = must(container, `#${CSS.escape(toggle.getAttribute("aria-controls") ?? "")}`);
    expect(slot.contains(input)).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(slot.getAttribute("data-open")).toBe("false");
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(slot.getAttribute("data-open")).toBe("true");
    click(toggle);
    expect(slot.getAttribute("data-open")).toBe("false");
  });
});

describe("no inline styles or HTML sinks", () => {
  it("renders the whole shell without a style attribute or a style element", async () => {
    const { container } = await mountApp({ path: "/market/xo/1" });
    expect(container.querySelector("[style]")).toBeNull();
    expect(document.querySelector("style")).toBeNull();
  });
});
