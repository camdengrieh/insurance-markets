// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../../../headers.config";
import { SERVICE_BUDGETS } from "../../core/budget";
import type { Env } from "../../core/env";
import { FakeRaw, FakeTimers, rawResponse } from "../../core/fakes";
import { act, allText, cleanup, must } from "../../ui/testing/dom";
import { recorded, keysetEnvelope } from "../../venues/polymarket/fixtures/load";
import { MarketsView } from "./MarketsView";
import { createExplorerServices } from "./services";
import { flush, mount } from "./test-support";

// The real readers over the real fetch ports (direct or through the daemon), a recording raw fetch and a frozen clock.
// Nothing here touches the network: the raw fetch is a fake that serves recorded XO fixtures and 404 for the rest.

afterEach(cleanup);

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "test", "fixtures", "xo");
const xoList = readFileSync(join(FIXTURES, "live-data-list-active.json"), "utf8");
const START = Date.parse("2026-10-19T12:00:00.000Z");

function envFor(raw: FakeRaw, timers = new FakeTimers(START), sleep: Env["sleep"] = async () => undefined): Env {
  return { rawFetch: raw.fetch, timers, nowMs: timers.clock, sleep, random: () => 0.5 };
}

function standaloneRaw(): FakeRaw {
  return new FakeRaw((url) => {
    const target = new URL(url);
    if (target.hostname === "api-mainnet.xo.market" && target.pathname === "/api/markets") return rawResponse({ body: xoList });
    return rawResponse({ status: 404, body: "{}" });
  });
}

const hostsOf = (raw: FakeRaw): string[] => [...new Set(raw.calls.map((call) => new URL(call.url).hostname))].sort();
const directHosts = BROWSER_DIRECT_ORIGINS.map((entry) => new URL(entry.origin).hostname);
const daemonOnlyHosts = DAEMON_ONLY_ORIGINS.map((entry) => new URL(entry.origin).hostname);

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("standalone build with the real readers", () => {
  it("M0-4 and M0-2: reads only CORS-open hosts, never the XO book host, Limitless or Kalshi", async () => {
    const raw = standaloneRaw();
    const services = createExplorerServices({ mode: "standalone", env: envFor(raw) });
    const { container } = await mount(<MarketsView />, services);
    await flush(10);

    expect(raw.calls.length).toBeGreaterThan(0);
    for (const host of hostsOf(raw)) expect(directHosts, `request to ${host}`).toContain(host);
    for (const host of daemonOnlyHosts) expect(hostsOf(raw)).not.toContain(host);
    // No credentials, cookies or referrer ride along with any read.
    for (const call of raw.calls) {
      expect(call.init.credentials).toBe("omit");
      expect(call.init.referrerPolicy).toBe("no-referrer");
      expect(JSON.stringify(call.init.headers ?? {}).toLowerCase()).not.toMatch(/authorization|cookie|user-agent/);
    }

    // XO rows came from the recorded list; their prices are display prices, and the book is "needs the Cockpit".
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows.length).toBe(5);
    const xoRow = rows[0] as Element;
    expect(allText(xoRow)).toContain("XO Market");
    // M0-1 at the screen: the Data API's micro-unit price 394000 is 39.4c, and a micro-unit volume is never dollars.
    expect(allText(xoRow)).toContain("Yes 39.4c");
    expect(allText(xoRow)).toContain("$306,091.82");
    expect(allText(xoRow)).not.toMatch(/394000|306091829184|306,091,829,184/);
    expect(allText(xoRow)).toContain("display price, not executable");
    expect(allText(xoRow)).toContain("needs the Cockpit");
    expect(allText(xoRow)).not.toMatch(/bid \d|ask \d/);
    expect(container.querySelector('section[data-kind="needs-cockpit"][data-code="xo"]')).not.toBeNull();
    expect(container.querySelector('section[data-kind="needs-cockpit"][data-code="limitless"]')).not.toBeNull();
    expect(container.querySelector('section[data-kind="restricted"][data-code="kalshi"]')).not.toBeNull();

    // The other venues answered 404: each is a typed error tile, and XO still rendered (the others do not hide it).
    expect(container.querySelectorAll('section[data-kind="error"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('li.explorer-venue[data-venue="xo"]')).not.toBeNull();
  });

  it("M0-6: a 100-search burst stays inside the per-host budget", async () => {
    const raw = standaloneRaw();
    const services = createExplorerServices({ mode: "standalone", env: envFor(raw) });
    const { container } = await mount(<MarketsView />, services);
    await flush(10);
    const input = must<HTMLInputElement>(container, 'input[type="search"]');
    const form = must<HTMLFormElement>(container, "form");
    for (let index = 0; index < 100; index += 1) {
      typeInto(input, `query ${index}`);
      act(() => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
    }
    await flush(20);

    const xoCalls = raw.calls.filter((call) => new URL(call.url).hostname === "api-mainnet.xo.market").length;
    const spec = SERVICE_BUDGETS.xo_data;
    // With the clock frozen, a call may be booked ahead by at most the 5 s the guard will wait: burst + 5 s of refill.
    const ceiling = spec.burst + Math.floor(spec.perSecond * 5);
    expect(xoCalls).toBeGreaterThan(0);
    expect(xoCalls).toBeLessThanOrEqual(ceiling);
    // The searches that were refused locally are shown as a typed error for XO (the XO reader reports the local
    // throttle as a pause, which is its own mapping), never as an empty market list.
    const tile = container.querySelector('section[data-kind="error"][data-code="RATE_LIMITED"], section[data-kind="error"][data-code="VENUE_PAUSED"]');
    expect(tile).not.toBeNull();
    expect(container.querySelector('li.explorer-venue[data-venue="xo"]')?.getAttribute("data-state")).toBe("error");
    expect(container.querySelector('section[data-kind="empty"]')).toBeNull();
  });
});

describe("Polymarket token ids (M0-1)", () => {
  it("asks the book for clobTokenIds on a v1 market, not for positionIds", async () => {
    const rows = recorded.marketsList();
    const raw = new FakeRaw((url) => {
      const target = new URL(url);
      if (target.hostname === "gamma-api.polymarket.com" && target.pathname === "/markets/keyset") return rawResponse({ body: JSON.stringify(keysetEnvelope(rows, null)) });
      return rawResponse({ status: 404, body: "{}" });
    });
    const services = createExplorerServices({ mode: "standalone", env: envFor(raw) });
    const { container } = await mount(<MarketsView />, services);
    await flush(10);
    const polymarketRows = [...container.querySelectorAll("tbody tr")].filter((row) => allText(row).includes("Polymarket"));
    expect(polymarketRows.length).toBeGreaterThan(0);
    const clobIds = new Set<string>();
    const positionIds = new Set<string>();
    for (const row of rows) {
      expect(row["version"]).toBe("v1");
      for (const id of JSON.parse(String(row["clobTokenIds"])) as string[]) clobIds.add(id);
      for (const id of row["positionIds"] as string[]) positionIds.add(id);
    }
    for (const id of clobIds) expect(positionIds.has(id)).toBe(false);
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load order books")) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    act(() => button.click());
    await flush(10);
    const asked = raw.calls.map((call) => new URL(call.url)).filter((url) => url.hostname === "clob.polymarket.com" && url.pathname === "/book").map((url) => url.searchParams.get("token_id"));
    expect(asked.length).toBeGreaterThan(0);
    for (const id of asked) {
      expect(clobIds.has(id ?? ""), `asked for ${id}`).toBe(true);
      expect(positionIds.has(id ?? "")).toBe(false);
    }
  });
});

describe("Cockpit build with the real readers", () => {
  const TOKEN = `cku_${"A".repeat(43)}`;

  function envelope(service: string, body: unknown): string {
    return JSON.stringify({ service, upstream_status: 200, fetched_at: "2026-10-19T12:00:00Z", fetched_at_ms: START, bytes: 10, retry_after_s: null, body });
  }

  it("every read is a same-origin call to the daemon with the ui token; no upstream host is named in a request", async () => {
    const raw = new FakeRaw((url) => {
      const path = new URL(url, "http://127.0.0.1").pathname;
      if (path.startsWith("/ui/read/xo_data/api/markets")) return rawResponse({ body: envelope("xo_data", JSON.parse(xoList)) });
      return rawResponse({ status: 502, body: JSON.stringify({ error: { code: "upstream_unavailable", message: "x" } }) });
    });
    const services = createExplorerServices({ mode: "cockpit", env: envFor(raw), getToken: () => TOKEN });
    const { container } = await mount(<MarketsView />, services);
    await flush(10);
    expect(raw.calls.length).toBeGreaterThan(0);
    for (const call of raw.calls) {
      expect(call.url.startsWith("/ui/read/"), call.url).toBe(true);
      expect((call.init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${TOKEN}`);
    }
    expect([...container.querySelectorAll("tbody tr")].length).toBe(5);
    // XO books are available in this build (the daemon reads them); the button is offered.
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Load order books")) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    // Limitless is read through the daemon too: its request goes to the proxy under its own service id, and the reply
    // here (a 502) is shown as a failure, not as an empty list.
    expect(raw.calls.some((call) => call.url.startsWith("/ui/read/limitless/"))).toBe(true);
    expect(container.querySelector('section[data-kind="no-reader"][data-code="limitless"]')).toBeNull();
    expect([...container.querySelectorAll('section[data-kind="error"]')].some((tile) => allText(tile).includes("Limitless"))).toBe(true);
  });

  it("before pairing nothing is sent and each venue says it cannot be read", async () => {
    const raw = new FakeRaw();
    const services = createExplorerServices({ mode: "cockpit", env: envFor(raw), getToken: () => null });
    const { container } = await mount(<MarketsView />, services);
    await flush(10);
    expect(raw.calls).toHaveLength(0);
    expect(container.querySelectorAll('section[data-kind="error"][data-code="NOT_SUPPORTED"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});

describe("the real services", () => {
  it("build seven readers and make no request until a screen asks", () => {
    const raw = new FakeRaw();
    const services = createExplorerServices({ mode: "standalone", env: envFor(raw) });
    expect(Object.keys(services.adapters).sort()).toEqual(["hyperliquid", "limitless", "manifold", "pascal", "polymarket", "trueo", "xo"]);
    expect(raw.calls).toHaveLength(0);
  });

  it("XO books need the Cockpit in the standalone build and are available in the Cockpit build", () => {
    const env = envFor(new FakeRaw());
    expect(createExplorerServices({ mode: "standalone", env }).adapters.xo?.books.state).toBe("needs_cockpit");
    expect(createExplorerServices({ mode: "cockpit", env, getToken: () => null }).adapters.xo?.books.state).toBe("available");
  });

  it("the readers disagree about deadlines and the services know each one", () => {
    const env = envFor(new FakeRaw());
    const { adapters } = createExplorerServices({ mode: "standalone", env });
    expect(adapters.xo?.deadlineFor(START, 8000)).toBe(8000);
    expect(adapters.polymarket?.deadlineFor(START, 8000)).toBe(START + 8000);
  });
});
