// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "./App";
import type { Untrusted } from "./core/ports";
import { choose, click, cleanup, act, allText, must, render, settle } from "./ui/testing/dom";
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
  it("has the landmarks, a skip link, a labelled nav and exactly one h1", async () => {
    const { container } = await mountApp();
    expect(container.querySelector("header")).not.toBeNull();
    expect(container.querySelector("main#main")).not.toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
    expect(must(container, "nav").getAttribute("aria-label")).toBe("Primary");
    expect(must(container, ".ui-skip-link").textContent).toBe("Skip to content");
    expect(h1s(container)).toEqual(["Overview"]);
    expect(document.title).toBe("Overview · XO Cockpit");
  });

  it("lists the screens in nav order and marks the current one", async () => {
    const { container, navigate } = await mountApp();
    const labels = [...container.querySelectorAll("nav a")].map((a) => a.textContent);
    expect(labels).toEqual(["Overview", "Markets", "Portfolio", "Terminal"]);
    expect(container.querySelector('nav a[aria-current="page"]')?.textContent).toBe("Overview");
    navigate("/portfolio");
    expect(container.querySelector('nav a[aria-current="page"]')?.textContent).toBe("Portfolio");
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
    click(must(container, 'nav a[href="/markets"]'));
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
    const { container } = await mountApp({ loaders: only, mode: "standalone", path: "/terminal" });
    expect(h1s(container)).toEqual(["Terminal"]);
    expect(allText(container)).toContain("needs the Cockpit");
    expect(mounted).not.toHaveBeenCalled();
    expect(allText(must(container, "nav"))).toContain("(needs the Cockpit)");
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
    expect(container.querySelector("nav")).not.toBeNull();
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
  it("applies and remembers a manual choice, and a system choice clears it", async () => {
    const { container } = await mountApp();
    const select = must<HTMLSelectElement>(container, "select");
    expect(select.value).toBe("system");
    choose(select, "dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    choose(select, "system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("reads a saved choice and ignores a bad one", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const saved = await mountApp();
    expect(must<HTMLSelectElement>(saved.container, "select").value).toBe("dark");
    cleanup();
    window.localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    const bad = await mountApp();
    expect(must<HTMLSelectElement>(bad.container, "select").value).toBe("system");
  });

  it("still works when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const { container } = await mountApp();
    const select = must<HTMLSelectElement>(container, "select");
    expect(select.value).toBe("system");
    choose(select, "light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("no inline styles or HTML sinks", () => {
  it("renders the whole shell without a style attribute or a style element", async () => {
    const { container } = await mountApp({ path: "/market/xo/1" });
    expect(container.querySelector("[style]")).toBeNull();
    expect(document.querySelector("style")).toBeNull();
  });
});
