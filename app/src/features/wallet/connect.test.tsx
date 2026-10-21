// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_OWNER } from "@shared/xo/chain/constants";

import { act, allText, cleanup, click, must, press, render } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { CONNECT_TABS, NOT_BUILT } from "./ConnectDialog";
import { WALLET_PANELS_SUMMARY } from "./WalletView";
import { WATCH_LABEL, WalletChip, shortAddress, watchedAddress } from "./WalletChip";
import { fakeNetwork } from "./testkit";
import { eventually, harness, setValue } from "./view-harness";

// The wallet chip and the Connect modal (docs/design/cockpit-v2 Connect). No connection is made in this build:
// two tabs explain a route and carry a disabled button that says so; the third watches an address through the
// wallet's own store and holds the wallet panels (account map, balances, funding steps) under a disclosure, since
// there is no Wallet page. The chip shows the watched address in mono, or asks for one.

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8")).call(window);
});

afterEach(cleanup);

const OWNER = ANVIL_ACCOUNT_0_OWNER;

function chip(container: HTMLElement): HTMLButtonElement {
  return must<HTMLButtonElement>(container, "button.ui-wallet-chip");
}

function dialog(): HTMLElement {
  return must<HTMLElement>(document.body, '[role="dialog"]');
}

function tabs(): HTMLButtonElement[] {
  return [...dialog().querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function selectedPanel(): HTMLElement {
  return must<HTMLElement>(dialog(), '[role="tabpanel"]:not([hidden])');
}

async function mount(options: { readonly saved?: boolean } = {}) {
  const net = fakeNetwork({ rpc: {}, get: {} });
  const h = harness({ net, mode: "standalone" });
  if (options.saved === true) {
    const added = await h.bindings.add({ address: OWNER, kind: "eoa", label: "Mine" });
    if (!added.ok) throw new Error("seed");
  }
  const view = render(h.wrap(<WalletChip />));
  await eventually(() => expect(chip(view.container).getAttribute("data-status")).toBe("ready"), act);
  return { h, net, ...view };
}

describe("the words", () => {
  it("shortens an address to its ends and keeps a short one whole", () => {
    expect(shortAddress(OWNER)).toBe(`${OWNER.slice(0, 6)}…${OWNER.slice(-4)}`);
    expect(shortAddress("abc")).toBe("abc");
  });

  it("watches the first saved binding that has an address", () => {
    expect(watchedAddress([])).toBeNull();
    expect(watchedAddress([{ id: "a", label: "x", kind: "eoa", chain: "evm", address: null, status: "derived", venues: [], source: "pasted" }])).toBeNull();
    expect(watchedAddress([{ id: "a", label: "x", kind: "eoa", chain: "evm", address: OWNER, status: "derived", venues: [], source: "pasted" }])).toBe(OWNER);
  });
});

describe("the chip", () => {
  it("asks for an address when none is saved, and shows the saved one in mono otherwise, never its label", async () => {
    const empty = await mount();
    expect(allText(chip(empty.container))).toBe(WATCH_LABEL);
    expect(chip(empty.container).getAttribute("data-watched")).toBe("none");
    empty.unmount();
    const saved = await mount({ saved: true });
    await eventually(() => expect(chip(saved.container).getAttribute("data-watched")).toBe("address"), act);
    expect(allText(chip(saved.container))).toBe(shortAddress(OWNER));
    expect(chip(saved.container).querySelector(".ui-num")).not.toBeNull();
    expect(allText(chip(saved.container))).not.toContain("Mine");
    expect(saved.net.calls).toEqual([]);
  });

  it("opens the Connect modal, which closes from Not now, from Escape, and gives focus back to the chip", async () => {
    const view = await mount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => chip(view.container).focus());
    click(chip(view.container));
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(allText(must(dialog(), "h2"))).toBe("Use your PayBox wallet here");
    click(must(dialog(), 'button[data-action="not-now"]'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(chip(view.container));
    click(chip(view.container));
    press(dialog(), "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("the three tabs", () => {
  it("are a tab list of the three routes, with the working one shown first and the arrow keys moving between them", async () => {
    const view = await mount();
    click(chip(view.container));
    expect(tabs().map((tab) => tab.textContent)).toEqual(CONNECT_TABS.map((tab) => tab.label));
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    expect(allText(selectedPanel())).toContain("needs no key and no PayBox connection");
    press(must(dialog(), '[role="tablist"]'), "ArrowRight");
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    press(must(dialog(), '[role="tablist"]'), "End");
    expect(tabs().map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    for (const tab of tabs()) expect(tab.getAttribute("aria-controls")).toBe(selectedPanel().id.replace(/-panel-[a-z]+$/, `-panel-${tab.id.split("-tab-")[1] ?? ""}`));
  });

  it("Pair with PayBox explains route F with its cautions and facts, names no PayBox host, mints no link and has its button off with the reason", async () => {
    const view = await mount();
    click(chip(view.container));
    click(tabs()[0] as HTMLButtonElement);
    const panel = selectedPanel();
    const text = allText(panel);
    expect(text).toContain("Open PayBox's WalletConnect page");
    expect(text).toContain("autonomous grant");
    expect(text).toContain("could request typed-data signatures with no prompt");
    expect(text).toContain("text messages and EIP-712 typed data");
    expect(text).toContain("1 10 56 137 999 4663 5042 8453 42161 43114");
    expect(text).toContain("anything on chain 3223 (XO)");
    expect(text).toContain("never run");
    expect(text).toContain("Pairing link: none");
    expect(text).not.toMatch(/paybox\.sh|wc:|https?:/i);
    const start = must<HTMLButtonElement>(panel, 'button[data-action="pair-start"]');
    expect(start.disabled).toBe(true);
    expect(start.textContent).toBe(`Start: ${NOT_BUILT}`);
    expect(panel.querySelector('[data-kind="connect-caution"][data-code="pair"]')).not.toBeNull();
    expect(panel.querySelector("a, input, textarea")).toBeNull();
    expect(view.net.calls).toEqual([]);
  });

  it("Sign in with PayBox explains route B1 the same way, with its button off", async () => {
    const view = await mount();
    click(chip(view.container));
    click(tabs()[1] as HTMLButtonElement);
    const panel = selectedPanel();
    const text = allText(panel);
    expect(text).toContain("60-minute token in a sealed cookie");
    expect(text).toContain("PayBox's own approve page");
    expect(text).toContain("It cannot sign alone");
    expect(text).toContain("raw digests and chain 3223 included");
    expect(text).toContain("nothing built or run");
    expect(text).not.toMatch(/paybox\.sh|https?:/i);
    const start = must<HTMLButtonElement>(panel, 'button[data-action="signin-start"]');
    expect(start.disabled).toBe(true);
    expect(start.textContent).toBe(`Sign in with PayBox: ${NOT_BUILT}`);
    expect(panel.querySelector('[data-kind="connect-caution"][data-code="signin"]')).not.toBeNull();
    expect(panel.querySelector("a, input, textarea")).toBeNull();
    expect(view.net.calls).toEqual([]);
  });

  it("Just watch an address saves an address through the wallet's own store and checks, the chip follows, and the wallet panels are folded under it", async () => {
    const view = await mount();
    click(chip(view.container));
    const panel = selectedPanel();
    expect(allText(panel)).toContain("Bindings stay on this machine");
    expect(allText(panel)).toContain("No addresses saved yet");
    // No link to a retired Wallet page: the panels are here, folded, and mount nothing until opened.
    expect(panel.querySelector("a")).toBeNull();
    const folded = must<HTMLDetailsElement>(panel, '[data-testid="wallet-panels"]');
    expect(must(folded, "summary").textContent).toBe(WALLET_PANELS_SUMMARY);
    expect(folded.open).toBe(false);
    expect(folded.querySelector("#wl-map")).toBeNull();
    act(() => {
      folded.open = true;
      folded.dispatchEvent(new Event("toggle"));
    });
    expect(must(folded, "#wl-map").textContent).toBe("Account map");
    expect(allText(folded)).toContain("No PayBox address saved");
    // The modal's headings step down one level at a time from its title.
    expect([...panel.querySelectorAll("h2")]).toHaveLength(0);
    // Folded again, the panels are gone: unfolding them later with an address saved is what reads the chains, not saving.
    act(() => {
      folded.open = false;
      folded.dispatchEvent(new Event("toggle"));
    });
    expect(folded.querySelector("#wl-map")).toBeNull();
    const address = must<HTMLInputElement>(panel, "input");
    setValue(address, OWNER, act);
    click(must(panel, 'button[type="submit"]'));
    await eventually(() => expect(allText(selectedPanel())).toContain("Saved."), act);
    expect((await view.h.bindings.list()).map((binding) => binding.address)).toEqual([OWNER]);
    await eventually(() => expect(allText(chip(view.container))).toBe(shortAddress(OWNER)), act);
    // Saving an address looked nothing up.
    expect(view.net.calls).toEqual([]);
  });

  it("refuses an address that fails the checks, in words, and saves nothing", async () => {
    const view = await mount();
    click(chip(view.container));
    const panel = selectedPanel();
    setValue(must<HTMLInputElement>(panel, "input"), "0x1234", act);
    click(must(panel, 'button[type="submit"]'));
    await eventually(() => expect(selectedPanel().querySelector('[data-testid="add-result"]')).not.toBeNull(), act);
    expect(must(selectedPanel(), '[data-testid="add-result"]').getAttribute("role")).toBe("alert");
    expect(await view.h.bindings.list()).toEqual([]);
    expect(allText(chip(view.container))).toBe(WATCH_LABEL);
  });

  it("the modal has no structural accessibility violations on any tab", async () => {
    const view = await mount({ saved: true });
    click(chip(view.container));
    for (const index of [2, 0, 1]) {
      click(tabs()[index] as HTMLButtonElement);
      const violations = await runAxe(dialog());
      expect(violations.map((violation) => `${index} ${violation.id}: ${violation.targets.join(" | ")}`)).toEqual([]);
    }
  });
});
