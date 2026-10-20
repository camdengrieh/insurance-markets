// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import { act, allText, cleanup, must, render, settle } from "../../ui/testing/dom";
import type { Loader } from "../../ui/routes";
import { resolveRoutes } from "../../ui/routes";
import { runAxe } from "../../ui/testing/axe";
import { fakeNetwork } from "./testkit";
import { eventually, harness } from "./view-harness";
import { WalletServicesProvider } from "./services";

// The two route files are discovered by the shell like any other screen (ui/route-types.ts): valid metadata, a
// fixed title for the h1, no market text anywhere in the title or navigation, and a working default component.

const loaders: Record<string, Loader> = {
  "./routes/portfolio.tsx": () => import("../../routes/portfolio"),
  "./routes/wallet.tsx": () => import("../../routes/wallet"),
};

afterEach(cleanup);

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8")).call(window);
});

describe("route files", () => {
  it("resolve with valid metadata, unique ids and paths, and navigation entries", async () => {
    const resolved = await resolveRoutes(loaders);
    expect(resolved.map((entry) => entry.status)).toEqual(["ok", "ok"]);
    const metas = resolved.flatMap((entry) => (entry.status === "ok" ? [entry.meta] : []));
    expect(metas.map((meta) => meta.id).sort()).toEqual(["portfolio", "wallet"]);
    expect(metas.map((meta) => meta.path).sort()).toEqual(["/portfolio", "/wallet"]);
    for (const meta of metas) {
      expect(meta.availability).toBe("any");
      expect(meta.nav?.label).toBe(meta.title);
      expect(meta.title).toMatch(/^[A-Za-z ]+$/);
    }
  });

  for (const mode of ["standalone", "cockpit"] as const) {
    it(`both screens render inside the shell (${mode}) under a fixed h1`, async () => {
      const net = fakeNetwork({ rpc: {}, get: {} });
      const h = harness({ net, mode });
      for (const path of ["/portfolio", "/wallet"]) {
        const location = memoryLocation({ path });
        const view = render(
          <WalletServicesProvider services={h.services}>
            <App loaders={loaders} mode={mode} locationHook={location.hook} />
          </WalletServicesProvider>,
        );
        await settle(10);
        await eventually(() => expect(view.container.querySelector("h1")).not.toBeNull(), act);
        expect(must(view.container, "h1").textContent).toBe(path === "/wallet" ? "Wallet" : "Portfolio");
        await eventually(() => expect(allText(view.container)).toMatch(path === "/wallet" ? /Saved addresses/ : /No addresses saved yet/), act);
        // Neither screen is gated behind the Cockpit: the read half works in the standalone build.
        expect(allText(view.container)).not.toMatch(/Wallet: needs the Cockpit|Portfolio: needs the Cockpit/);
        view.unmount();
      }
    });
  }

  for (const mode of ["standalone", "cockpit"] as const) {
    it(`the whole shell with a saved address on /wallet and /portfolio (${mode}) has no structural accessibility violations`, async () => {
      const net = fakeNetwork({ rpc: {}, get: {} });
      const h = harness({ net, mode });
      const added = await h.bindings.add({ address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", kind: "eoa", label: "Mine" });
      if (!added.ok) throw new Error("seed");
      await h.bindings.setVenues(added.binding.id, ["kalshi", "hyperliquid"]);
      for (const path of ["/wallet", "/portfolio"]) {
        const location = memoryLocation({ path });
        const view = render(
          <WalletServicesProvider services={h.services}>
            <App loaders={loaders} mode={mode} locationHook={location.hook} />
          </WalletServicesProvider>,
        );
        await eventually(() => expect(allText(view.container)).toMatch(path === "/wallet" ? /Account map/ : /Positions by venue/), act);
        await eventually(() => expect(view.container.querySelector(path === "/wallet" ? '[data-testid="account-map"]' : '[data-outcome="unsupported"]')).not.toBeNull(), act);
        const violations = await runAxe(view.container);
        expect(violations.map((v) => `${path} ${v.id}: ${v.help} @ ${v.targets.join(" | ")}`)).toEqual([]);
        view.unmount();
      }
    });
  }
});
