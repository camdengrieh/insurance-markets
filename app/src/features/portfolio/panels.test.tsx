// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AddressBinding } from "../../core/bindings";
import { FetchError } from "../../core/fetch";
import { recorded, SENATE_YES } from "../../venues/polymarket/fixtures/load";
import { ConnectActionProvider, useRegisterConnectAction } from "../../ui";
import { act, allText, cleanup, click, must, render } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { fakeNetwork, type FakeNetwork } from "../wallet/testkit";
import { eventually, harness } from "../wallet/view-harness";
import { prov, row } from "./fixtures";
import { useHoldings } from "./holdings";
import { NoAddressWatched, NoVenueSelected, OutcomeTile, TotalsPanel, VenueSection } from "./panels";
import type { PortfolioAdapters } from "./readers";
import type { VenueReadOk } from "./types";

// The Holdings view's library in jsdom: acceptance M2-4 (the excluded count is printed), M2-5 (synthetic-shape
// label), M2-6 (one venue failing leaves the others), M2-7 (candidate wording), hostile text, and structure. The
// screen that used to host these panels is gone; the Markets surface's Holdings view renders them, and this host
// stands in for it.

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

// What the Holdings view renders from the hook, without the rest of the Markets surface.
function HoldingsHost() {
  const holdings = useHoldings();
  const { state } = holdings;
  switch (state.kind) {
    case "loading":
      return <p role="status">Loading your watched addresses</p>;
    case "no_address":
      return <NoAddressWatched />;
    case "no_venue":
      return <NoVenueSelected />;
    case "reading":
      return <p role="status">Reading positions</p>;
    case "error":
      return <p role="alert">The positions could not be read</p>;
    case "ready":
      return (
        <div>
          <p data-testid="held-keys">{holdings.keys.size}</p>
          <TotalsPanel rows={state.rows} />
          {state.ok.map((outcome) => (
            <VenueSection key={`${outcome.venue}:${outcome.bindingId}`} outcome={outcome} />
          ))}
          {state.others.map((outcome) => (
            <OutcomeTile key={`${outcome.kind}:${outcome.venue}:${outcome.bindingId}`} outcome={outcome} onRetry={holdings.refresh} />
          ))}
        </div>
      );
  }
}

describe("the Holdings view's library", () => {
  it("no watched address: says so and points to the Connect modal, with a button only when one is registered", async () => {
    const h = harness({ net: network(), mode: "standalone" });
    const alone = render(h.wrap(<HoldingsHost />));
    await eventually(() => expect(allText(alone.container)).toContain("No address watched"), act);
    expect(allText(alone.container)).toContain("wallet chip in the top bar");
    // No Connect modal on this page: no link to a retired page, no dead button.
    expect(alone.container.querySelector("a")).toBeNull();
    expect([...alone.container.querySelectorAll("button")].map((button) => button.textContent)).not.toContain("Watch an address");
    alone.unmount();
    let opened = 0;
    function Chip() {
      useRegisterConnectAction(() => {
        opened += 1;
      });
      return null;
    }
    const view = render(
      h.wrap(
        <ConnectActionProvider>
          <Chip />
          <HoldingsHost />
        </ConnectActionProvider>,
      ),
    );
    await eventually(() => expect(allText(view.container)).toContain("No address watched"), act);
    const button = [...view.container.querySelectorAll("button")].find((candidate) => candidate.textContent === "Watch an address");
    if (button === undefined) throw new Error("no Watch an address button");
    click(button);
    expect(opened).toBe(1);
  });

  it("an address with no venue selected reads nothing", async () => {
    const net = network();
    const h = harness({ net, mode: "standalone" });
    await seed(h, []);
    const view = render(h.wrap(<HoldingsHost />));
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
    for (const cell of cells) expect(cell.querySelector("[data-trust]")).not.toBeNull();
    expect(document.title).not.toContain("onerror");
  });

  it("M2-4: the totals print the excluded count and never a zero for a missing price", () => {
    const h = harness({ net: network(), mode: "standalone" });
    const { container } = render(h.wrap(<TotalsPanel rows={[row({ id: "1", value: "1" }), row({ id: "2", value: null })]} />));
    expect(allText(must(container, '[data-testid="totals-excluded"]'))).toBe("1 of 2 open positions have no price and are not in these totals.");
    expect(allText(container)).not.toMatch(/\$0\.00/);
  });

  it("has no structural accessibility violations with a table", async () => {
    const h = harness({ net: network(), mode: "standalone" });
    const { container } = render(
      <main>
        <h1>Markets</h1>
        <h2>Positions</h2>
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
    const view = render(h.wrap(<HoldingsHost />));
    await eventually(() => expect(view.container.querySelector('[data-outcome="off"]')).not.toBeNull(), act);
    expect(must(view.container, '[data-outcome="off"]').textContent).toMatch(/off, restricted terms/);
    expect(net.calls).toHaveLength(0);
  });

  it("a venue that needs the Cockpit says so, and a venue with no reader says that instead of showing an empty table", async () => {
    const net = network();
    const h = harness({ net, mode: "standalone" });
    await seed(h, ["limitless", "hyperliquid"]);
    const view = render(h.wrap(<HoldingsHost />));
    await eventually(() => expect(view.container.querySelector('[data-outcome="needs_cockpit"]')).not.toBeNull(), act);
    expect(must(view.container, '[data-outcome="needs_cockpit"]').textContent).toMatch(/needs the Cockpit/);
    expect(must(view.container, '[data-outcome="unsupported"]').textContent).toMatch(/no position reader/);
    expect(view.container.querySelector("table")).toBeNull();
    expect(must(view.container, '[data-testid="held-keys"]').textContent).toBe("0");
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
      pascal: () => ({
        positionsByAddress: async () => {
          throw new Error("unused");
        },
      }),
    };
    const h = harness({ net: network(), mode: "cockpit", adapters });
    await h.bindings.add({ address: OWNER, kind: "venue_proxy", label: "Wallet" }).then(async (added) => {
      if (added.ok) await h.bindings.setVenues(added.binding.id, ["polymarket"]);
    });
    const view = render(h.wrap(<HoldingsHost />));
    await eventually(() => expect(view.container.querySelector('[data-outcome="not_paired"]')).not.toBeNull(), act);
    expect(must(view.container, '[data-outcome="not_paired"]').textContent).toMatch(/not paired with your Cockpit/);
    expect(view.container.querySelector('[data-outcome="failed"]')).toBeNull();
  });
});
