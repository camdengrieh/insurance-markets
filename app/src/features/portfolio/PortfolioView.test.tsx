// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AddressBinding } from "../../core/bindings";
import { recorded, SENATE_YES } from "../../venues/polymarket/fixtures/load";
import { act, allText, cleanup, must, render } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { fakeNetwork, type FakeNetwork } from "../wallet/testkit";
import { eventually, harness } from "../wallet/view-harness";
import { PortfolioView, VenueSection } from "./PortfolioView";
import { prov, row } from "./fixtures";
import type { VenueReadOk } from "./types";
import { FetchError } from "../../core/fetch";
import type { PortfolioAdapters } from "./readers";

// The portfolio screen in jsdom: acceptance M2-4 (the excluded count is printed), M2-5 (synthetic-shape label),
// M2-6 (one venue failing leaves the others), M2-7 (candidate wording), hostile text, and structure.

let axeSource = "";
beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  axeSource = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(axeSource).call(window);
});
afterEach(cleanup);

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function network(options: { xoStatus?: number } = {}): FakeNetwork {
  // No populated positions answer and no public profile were ever captured (a funded wallet and a real person's
  // profile), so Polymarket answers the empty cases: no profile for the address.
  return fakeNetwork({
    get: {
      "gamma-api.polymarket.com/public-profile": () => ({ status: 404 }),
      "data-api.polymarket.com/v2/positions": () => ({ body: { data: [], pagination: { limit: 100, offset: null, has_more: false, next_cursor: null } } }),
      "clob.polymarket.com/book": (url) => (url.searchParams.get("token_id") === SENATE_YES ? { body: recorded.senateBook() } : { status: 404 }),
      "api-mainnet.xo.market/api/users/portfolio": () => ({ status: options.xoStatus ?? 503 }),
    },
  });
}

async function seed(h: ReturnType<typeof harness>, venues: AddressBinding["venues"], label = "Mine"): Promise<void> {
  const added = await h.bindings.add({ address: OWNER, kind: "eoa", label });
  if (!added.ok) throw new Error("seed");
  await h.bindings.setVenues(added.binding.id, venues);
}

describe("portfolio screen", () => {
  it("no saved address: says so and points to the wallet screen", async () => {
    const h = harness({ net: network(), mode: "standalone" });
    const view = render(h.wrap(<PortfolioView />));
    await eventually(() => expect(allText(view.container)).toContain("No addresses saved yet"), act);
    expect(must(view.container, "a").getAttribute("href")).toBe("/wallet");
  });

  it("an address with no venue selected reads nothing", async () => {
    const net = network();
    const h = harness({ net, mode: "standalone" });
    await seed(h, []);
    const view = render(h.wrap(<PortfolioView />));
    await eventually(() => expect(allText(view.container)).toContain("No venue selected for any address"), act);
    expect(net.calls).toHaveLength(0);
  });

  it("M2-7: a derived candidate, if one is ever supplied, is labelled 'candidate' and 'never used to look anything up'", () => {
    const outcome: VenueReadOk = {
      kind: "ok",
      venue: "polymarket",
      bindingId: "b",
      bindingLabel: "Mine",
      holder: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      rows: [row({ id: "1", value: "1" })],
      rejected: 0,
      notListed: [],
      notes: [],
      prov,
      partial: false,
      facts: [],
      resolution: { source: "profile_lookup", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", candidate: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
    };
    const h = harness({ net: network(), mode: "standalone" });
    const view = render(h.wrap(<VenueSection outcome={outcome} />));
    const text = must(view.container, '[data-testid="resolution"]').textContent ?? "";
    expect(text).toMatch(/Candidate \(derived, not confirmed, never used to look anything up\)/);
    expect(text).toContain("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  });

  // Rows below are inline unit inputs for the rendering code (the venue answers are not involved).
  const okOutcome = (rows: VenueReadOk["rows"]): VenueReadOk => ({
    kind: "ok",
    venue: "polymarket",
    bindingId: "b",
    bindingLabel: "Mine",
    holder: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    rows,
    rejected: 0,
    notListed: [],
    notes: [],
    prov,
    partial: false,
    facts: [],
    resolution: { source: "pasted", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", candidate: null },
  });

  it("hostile market text is inert: no element, no handler, no link, only text", async () => {
    const hostile = "<img src=x onerror=alert(1)> and a [link](javascript:alert(1))";
    const h = harness({ net: network(), mode: "standalone" });
    const view = render(h.wrap(<VenueSection outcome={okOutcome([row({ id: "1", value: "1", market: hostile }), row({ id: "2", value: "2", market: hostile })])} />));
    const section = must(view.container, 'section[data-venue="polymarket"]');
    expect(section.querySelector("img")).toBeNull();
    expect(section.querySelector("[onerror]")).toBeNull();
    expect(section.querySelector('a[href^="javascript"]')).toBeNull();
    expect(section.textContent).toContain("<img src=x onerror=alert(1)>");
    // Every market cell is inside the marked untrusted slot.
    const cells = [...section.querySelectorAll("tbody th")];
    expect(cells.length).toBe(2);
    for (const cell of cells) expect(cell.querySelector('[data-trust]')).not.toBeNull();
    expect(document.title).not.toContain("onerror");
  });

  it("has no structural accessibility violations with a table", async () => {
    const h = harness({ net: network(), mode: "standalone" });
    const { container } = render(
      <main>
        <h1>Portfolio</h1>
        <h2>Venues</h2>
        {h.wrap(<VenueSection outcome={okOutcome([row({ id: "1", value: "1" }), row({ id: "2", value: null })])} />)}
      </main>,
    );
    const violations = await runAxe(container, ["region"]);
    expect(violations.map((v) => `${v.id}: ${v.help} @ ${v.targets.join(" | ")}`)).toEqual([]);
  });

  it("a restricted-terms venue shows 'off: restricted terms' and asks nothing", async () => {
    const net = network();
    const h = harness({ net, mode: "cockpit" });
    await seed(h, ["kalshi"]);
    const view = render(h.wrap(<PortfolioView />));
    await eventually(() => expect(view.container.querySelector('[data-outcome="off"]')).not.toBeNull(), act);
    expect(must(view.container, '[data-outcome="off"]').textContent).toMatch(/off, restricted terms/);
    expect(net.calls).toHaveLength(0);
  });

  it("a venue that needs the Cockpit says so, and a venue with no reader says that instead of showing an empty table", async () => {
    const net = network();
    const h = harness({ net, mode: "standalone" });
    await seed(h, ["limitless", "hyperliquid"]);
    const view = render(h.wrap(<PortfolioView />));
    await eventually(() => expect(view.container.querySelector('[data-outcome="needs_cockpit"]')).not.toBeNull(), act);
    expect(must(view.container, '[data-outcome="needs_cockpit"]').textContent).toMatch(/needs the Cockpit/);
    expect(must(view.container, '[data-outcome="unsupported"]').textContent).toMatch(/no position reader/);
    expect(view.container.querySelector("table")).toBeNull();
  });

  it("a Cockpit page that is not paired says so, in words, instead of a venue error", async () => {
    const adapters: PortfolioAdapters = {
      xo: () => ({ getBooks: async () => [] }),
      polymarket: () => ({
        getPositionsByAddress: async () => {
          throw new FetchError("unauthorized", "x");
        },
        lookupProxyWallet: async () => ({ ok: false, error: "NOT_FOUND" }),
        getBooks: async () => [],
      }),
      trueo: () => ({ positionsByAddress: async () => ({ positions: [], unmarked: 0, claims: [], scanned: 0, skipped: [] }) }),
      pascal: () => ({ positionsByAddress: async () => { throw new Error("unused"); } }),
    };
    const h = harness({ net: network(), mode: "cockpit", adapters });
    await h.bindings.add({ address: OWNER, kind: "venue_proxy", label: "Wallet" }).then(async (added) => {
      if (added.ok) await h.bindings.setVenues(added.binding.id, ["polymarket"]);
    });
    const view = render(h.wrap(<PortfolioView />));
    await eventually(() => expect(view.container.querySelector('[data-outcome="not_paired"]')).not.toBeNull(), act);
    expect(must(view.container, '[data-outcome="not_paired"]').textContent).toMatch(/not paired with your Cockpit/);
    expect(view.container.querySelector('[data-outcome="failed"]')).toBeNull();
  });

});
