// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import { act, allText, cleanup, click, must, render, settle } from "../../ui/testing/dom";
import { resolveRoutes, type Loader } from "../../ui/routes";
import { runAxe } from "../../ui/testing/axe";
import { fakeNetwork } from "./testkit";
import { eventually, harness } from "./view-harness";
import { WalletServicesProvider } from "./services";
import { WalletChip } from "./WalletChip";
import { WALLET_PANELS_SUMMARY } from "./WalletView";

// There is no Wallet screen (docs/design/cockpit-v2 keeps three places: the surface, the modal, the dock). The
// wallet panels are reached from the chip in the top bar, inside the Connect modal's "Just watch an address" tab, in
// both builds, never gated behind the Cockpit; no route file claims /wallet, so that address is "not found".

const NO_ROUTES: Record<string, Loader> = {};

afterEach(cleanup);

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8")).call(window);
});

function dialog(): HTMLElement {
  return must<HTMLElement>(document.body, '[role="dialog"]');
}

async function unfold(root: HTMLElement): Promise<void> {
  const details = must<HTMLDetailsElement>(root, '[data-testid="wallet-panels"]');
  expect(must(details, "summary").textContent).toBe(WALLET_PANELS_SUMMARY);
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

describe("the wallet has no screen of its own", () => {
  it("no route file claims /wallet: the shell answers that address with its not-found page", async () => {
    const resolved = await resolveRoutes(NO_ROUTES);
    expect(resolved).toEqual([]);
    const net = fakeNetwork({ rpc: {}, get: {} });
    const h = harness({ net, mode: "standalone" });
    const location = memoryLocation({ path: "/wallet" });
    const view = render(
      <WalletServicesProvider services={h.services}>
        <App loaders={NO_ROUTES} mode="standalone" locationHook={location.hook} topBarEnd={<WalletChip />} />
      </WalletServicesProvider>,
    );
    await settle(10);
    await eventually(() => expect(view.container.querySelector("h1")).not.toBeNull(), act);
    expect(must(view.container, "h1").textContent).toBe("Page not found");
    view.unmount();
  });

  for (const mode of ["standalone", "cockpit"] as const) {
    it(`the chip in the top bar opens the Connect modal with the wallet panels, in the ${mode} build, not gated behind the Cockpit`, async () => {
      const net = fakeNetwork({ rpc: {}, get: {} });
      const h = harness({ net, mode });
      const location = memoryLocation({ path: "/" });
      const view = render(
        <WalletServicesProvider services={h.services}>
          <App loaders={NO_ROUTES} mode={mode} locationHook={location.hook} topBarEnd={<WalletChip />} />
        </WalletServicesProvider>,
      );
      await settle(10);
      await eventually(() => expect(must(view.container, "button.ui-wallet-chip").getAttribute("data-status")).toBe("ready"), act);
      click(must(view.container, "button.ui-wallet-chip"));
      await eventually(() => expect(allText(dialog())).toMatch(/Saved addresses/), act);
      expect(allText(dialog())).toMatch(/No addresses saved yet/);
      await unfold(dialog());
      await eventually(() => expect(allText(dialog())).toMatch(/Account map/), act);
      expect(allText(dialog())).toMatch(/No PayBox address saved/);
      expect(allText(dialog())).not.toMatch(/needs the Cockpit/);
      expect(view.container.querySelector("nav")).toBeNull();
      // Opening the modal and unfolding the panels asked nothing of any chain: there is no owner address yet.
      expect(net.calls).toEqual([]);
      view.unmount();
    });
  }

  for (const mode of ["standalone", "cockpit"] as const) {
    it(`the whole shell with the modal open on a saved address (${mode}) has no structural accessibility violations`, async () => {
      const net = fakeNetwork({ rpc: {}, get: {} });
      const h = harness({ net, mode });
      const added = await h.bindings.add({ address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", kind: "eoa", label: "Mine" });
      if (!added.ok) throw new Error("seed");
      await h.bindings.setVenues(added.binding.id, ["kalshi", "hyperliquid"]);
      const location = memoryLocation({ path: "/" });
      const view = render(
        <WalletServicesProvider services={h.services}>
          <App loaders={NO_ROUTES} mode={mode} locationHook={location.hook} topBarEnd={<WalletChip />} />
        </WalletServicesProvider>,
      );
      await settle(10);
      await eventually(() => expect(must(view.container, "button.ui-wallet-chip").getAttribute("data-status")).toBe("ready"), act);
      click(must(view.container, "button.ui-wallet-chip"));
      await eventually(() => expect(allText(dialog())).toMatch(/Saved addresses/), act);
      await unfold(dialog());
      await eventually(() => expect(dialog().querySelector('[data-testid="account-map"]')).not.toBeNull(), act);
      const violations = await runAxe(document.body, ["region"]);
      expect(violations.map((v) => `connect ${v.id}: ${v.help} @ ${v.targets.join(" | ")}`)).toEqual([]);
      view.unmount();
    });
  }
});
