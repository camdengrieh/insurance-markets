// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_OWNER } from "@shared/xo/chain/constants";

import { act, allText, cleanup, click, must, press, render } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { CONNECT_TABS, DIALOG_TITLE, defaultTab } from "./ConnectDialog";
import { WALLET_EXAMPLES } from "./connect/ConnectTabs";
import { COCKPIT_WALLETCONNECT_BLOCKED, NOT_CONFIGURED } from "./connect/environment";
import { ACCOUNT_0, ACCOUNT_1, announcement, fakeSignClient, fakeTarget, fakeWallet, RpcFailure, session, testEnvironment } from "./connect/testkit";
import { WALLET_PANELS_SUMMARY } from "./WalletView";
import { WATCH_LABEL, WalletChip, shortAddress, watchedAddress } from "./WalletChip";
import { fakeNetwork } from "./testkit";
import { eventually, harness, setValue } from "./view-harness";
import type { WalletEnvironment } from "./connect/environment";

// The wallet chip and the Connect modal (docs/design/cockpit-v2 Connect). Three tabs: a browser wallet found through
// EIP-6963, WalletConnect (PayBox and phone wallets), and watching an address through the wallet's own store (with the
// wallet panels under a disclosure, since there is no Wallet page). A connected wallet shows above the tabs and in the
// chip. Every wallet here is a fake: an EIP-1193 object that signs with a public Anvil key, or a sign-client stand-in
// that never reaches a relay.

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8")).call(window);
  // jsdom has no 2D canvas; the QR component then paints nothing, which is what it does in any browser without one.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
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

function tab(label: string): HTMLButtonElement {
  const found = tabs().find((entry) => entry.textContent === label);
  if (found === undefined) throw new Error(`no tab ${label}`);
  return found;
}

function selectedPanel(): HTMLElement {
  return must<HTMLElement>(dialog(), '[role="tabpanel"]:not([hidden])');
}

async function mount(options: { readonly saved?: boolean; readonly wallet?: WalletEnvironment; readonly mode?: "standalone" | "cockpit" } = {}) {
  const net = fakeNetwork({ rpc: {}, get: {} });
  const h = harness({ net, mode: options.mode ?? "standalone", ...(options.wallet === undefined ? {} : { wallet: options.wallet }) });
  if (options.saved === true) {
    const added = await h.bindings.add({ address: OWNER, kind: "eoa", label: "Mine" });
    if (!added.ok) throw new Error("seed");
  }
  const view = render(h.wrap(<WalletChip />));
  await eventually(() => expect(chip(view.container).getAttribute("data-status")).toBe("ready"), act);
  return { h, net, ...view };
}

async function withWallet(options: { readonly chainId?: number } = {}) {
  const wallet = fakeWallet({ chainId: options.chainId ?? 137 });
  const target = fakeTarget([announcement(wallet, { name: "Test Wallet", rdns: "org.example.wallet" })]);
  const view = await mount({ wallet: testEnvironment({ target, projectId: null }) });
  return { wallet, target, ...view };
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

  it("opens on Browser wallet when one was found, else on WalletConnect", () => {
    expect(defaultTab(0)).toBe("walletconnect");
    expect(defaultTab(2)).toBe("browser");
  });
});

describe("the chip", () => {
  it("asks to connect when nothing is connected or saved, and shows the saved address in mono otherwise, never its label", async () => {
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
    expect(allText(must(dialog(), "h2"))).toBe(DIALOG_TITLE);
    click(must(dialog(), 'button[data-action="not-now"]'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(chip(view.container));
    click(chip(view.container));
    press(dialog(), "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("the tabs", () => {
  it("are a tab list of the three ways, opening on WalletConnect when no browser wallet was found, with the arrow keys moving between them", async () => {
    const view = await mount();
    click(chip(view.container));
    expect(tabs().map((entry) => entry.textContent)).toEqual(CONNECT_TABS.map((entry) => entry.label));
    expect(CONNECT_TABS.map((entry) => entry.label)).toEqual(["Browser wallet", "WalletConnect (PayBox, phone wallets)", "Just watch an address"]);
    expect(tabs().map((entry) => entry.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    press(must(dialog(), '[role="tablist"]'), "ArrowRight");
    expect(tabs().map((entry) => entry.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    press(must(dialog(), '[role="tablist"]'), "Home");
    expect(tabs().map((entry) => entry.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    for (const entry of tabs()) expect(entry.getAttribute("aria-controls")).toBe(selectedPanel().id.replace(/-panel-[a-z]+$/, `-panel-${entry.id.split("-tab-")[1] ?? ""}`));
  });

  it("Browser wallet says in words that none was found, and names a few", async () => {
    const view = await mount({ wallet: testEnvironment({ target: fakeTarget(), projectId: null }) });
    click(chip(view.container));
    click(tab("Browser wallet"));
    await eventually(() => expect(selectedPanel().querySelector('[data-kind="no-wallet"]')).not.toBeNull(), act);
    expect(allText(selectedPanel())).toContain("No browser wallet was found");
    expect(allText(selectedPanel())).toContain(WALLET_EXAMPLES);
    expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).toBeNull();
  });

  it("Browser wallet lists each wallet found as a button with its name as text and its data: icon, and opens first when one is found", async () => {
    const view = await withWallet();
    click(chip(view.container));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).not.toBeNull(), act);
    expect(tabs().map((entry) => entry.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    const button = must<HTMLButtonElement>(selectedPanel(), 'button[data-action="connect-injected"]');
    expect(allText(button)).toBe("Test Wallet");
    expect(must(button, ".ui-untrusted").textContent).toBe("Test Wallet");
    expect(must<HTMLImageElement>(button, "img").getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(button.getAttribute("aria-label")).toBeNull();
    // Discovery asked the wallet for nothing.
    expect(view.wallet.calls).toEqual([]);
  });

  it("connects a browser wallet, shows it in the chip and above the tabs, and disconnects from the chip", async () => {
    const view = await withWallet({ chainId: 137 });
    click(chip(view.container));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).not.toBeNull(), act);
    click(must(selectedPanel(), 'button[data-action="connect-injected"]'));
    await eventually(() => expect(chip(view.container).getAttribute("data-connected")).toBe("injected"), act);
    expect(view.wallet.calls.map((call) => call.method)).toEqual(["eth_requestAccounts", "eth_chainId"]);
    expect(allText(chip(view.container))).toBe(`${shortAddress(ACCOUNT_0.address)}Test WalletPolygon`);
    expect(chip(view.container).getAttribute("aria-label")).toBe(`Connected wallet ${shortAddress(ACCOUNT_0.address)} on Polygon: open the connect options`);
    const connected = must(dialog(), '[data-kind="connected"]');
    expect(allText(connected)).toContain(ACCOUNT_0.address);
    expect(allText(connected)).toContain("sign and send transactions");
    expect(must(dialog(), 'button[data-action="not-now"]').textContent).toBe("Close");
    click(must(view.container, 'button[data-action="chip-disconnect"]'));
    await eventually(() => expect(chip(view.container).getAttribute("data-connected")).toBeNull(), act);
    expect(allText(chip(view.container))).toBe(WATCH_LABEL);
    expect(dialog().querySelector('[data-kind="connected"]')).toBeNull();
  });

  it("says in words when the wallet declines the connection", async () => {
    const view = await withWallet();
    view.wallet.failNext.set("eth_requestAccounts", new RpcFailure(4001, "User rejected the request."));
    click(chip(view.container));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).not.toBeNull(), act);
    click(must(selectedPanel(), 'button[data-action="connect-injected"]'));
    await eventually(() => expect(selectedPanel().querySelector('[data-kind="connect-error"]')).not.toBeNull(), act);
    expect(must(selectedPanel(), '[data-kind="connect-error"]').getAttribute("data-code")).toBe("rejected");
    expect(allText(selectedPanel())).toContain("You declined the request in your wallet.");
    expect(chip(view.container).getAttribute("data-connected")).toBeNull();
  });

  it("WalletConnect says plainly when this build is not configured, with its button off and saying why", async () => {
    const view = await mount({ wallet: testEnvironment({ target: null, projectId: null }) });
    click(chip(view.container));
    const panel = selectedPanel();
    const start = must<HTMLButtonElement>(panel, 'button[data-action="walletconnect-start"]');
    expect(start.disabled).toBe(true);
    expect(start.textContent).toBe(NOT_CONFIGURED);
    expect(NOT_CONFIGURED).toBe("WalletConnect is not configured in this build");
    expect(allText(panel)).toContain("WalletConnect is not configured in this build: it has no WalletConnect project id");
    // What PayBox over WalletConnect cannot do, in plain words.
    expect(allText(panel)).toContain("send transactions, or sign anything on chain 3223 (XO)");
    expect(allText(panel)).toContain("1 10 56 137 999 4663 5042 8453 42161 43114");
    expect(panel.querySelector('[data-kind="connect-caution"][data-code="pair"]')).not.toBeNull();
  });

  it("WalletConnect is off in the Cockpit build, which keeps connect-src 'self', and says why", async () => {
    const view = await mount({ mode: "cockpit", wallet: testEnvironment({ target: null, blocked: COCKPIT_WALLETCONNECT_BLOCKED }) });
    click(chip(view.container));
    const panel = selectedPanel();
    expect(must<HTMLButtonElement>(panel, 'button[data-action="walletconnect-start"]').disabled).toBe(true);
    expect(allText(panel)).toContain("connect-src 'self'");
  });

  it("WalletConnect mints a pairing link, shows it as a QR and as text with Copy and Open in PayBox, and connects PayBox as a signer that sends no transactions", async () => {
    const client = fakeSignClient();
    const wallet = testEnvironment({ target: null, client });
    const view = await mount({ wallet });
    click(chip(view.container));
    expect(wallet.loads).toEqual([]);
    click(must(selectedPanel(), 'button[data-action="walletconnect-start"]'));
    await eventually(() => expect(selectedPanel().querySelector('[data-kind="pairing-link"]')).not.toBeNull(), act);
    expect(wallet.loads).toEqual(["0123456789abcdef0123456789abcdef"]);
    expect(client.connects).toEqual([{ eip155: { chains: ["eip155:137", "eip155:8453", "eip155:3223", "eip155:1"], methods: ["eth_signTypedData_v4", "personal_sign", "eth_sendTransaction", "wallet_switchEthereumChain"], events: ["accountsChanged", "chainChanged"] } }]);
    const panel = selectedPanel();
    const uri = must(panel, '[data-kind="pairing-link"]').textContent ?? "";
    expect(uri.startsWith("wc:")).toBe(true);
    const qr = must<HTMLCanvasElement>(panel, "canvas.wl-qr");
    expect(qr.getAttribute("role")).toBe("img");
    expect(Number(qr.getAttribute("data-modules"))).toBeGreaterThan(21);
    const open = must<HTMLAnchorElement>(panel, 'a[data-action="open-paybox"]');
    expect(new URL(open.href).searchParams.get("uri")).toBe(uri);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toContain("noopener");
    expect(open.getAttribute("rel")).toContain("noreferrer");
    expect(panel.querySelector('button[data-action="copy-pairing-link"]')).not.toBeNull();

    await act(async () => client.approve(session({ name: "PayBox" })));
    await eventually(() => expect(chip(view.container).getAttribute("data-connected")).toBe("walletconnect"), act);
    expect(allText(chip(view.container))).toBe(`${shortAddress(ACCOUNT_0.address)}PayBoxPolygon`);
    const connected = must(dialog(), '[data-kind="connected"]');
    expect(allText(connected)).toContain("it does not send transactions");
    expect(allText(connected)).toContain("on Polygon, Base");
    // Disconnecting ends the session for both sides.
    click(must(connected, 'button[data-action="disconnect"]'));
    await eventually(() => expect(client.disconnects).toEqual([session().topic]), act);
    expect(chip(view.container).getAttribute("data-connected")).toBeNull();
  });

  it("Cancel abandons a pairing, and a session approved afterwards is ended rather than kept unseen", async () => {
    const client = fakeSignClient();
    const view = await mount({ wallet: testEnvironment({ target: null, client }) });
    click(chip(view.container));
    click(must(selectedPanel(), 'button[data-action="walletconnect-start"]'));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="walletconnect-cancel"]')).not.toBeNull(), act);
    click(must(selectedPanel(), 'button[data-action="walletconnect-cancel"]'));
    expect(selectedPanel().querySelector('[data-kind="pairing-link"]')).toBeNull();
    await act(async () => client.approve(session()));
    await eventually(() => expect(client.disconnects).toEqual([session().topic]), act);
    expect(chip(view.container).getAttribute("data-connected")).toBeNull();
  });

  it("Just watch an address saves an address through the wallet's own store and checks, the chip follows, and the wallet panels are folded under it", async () => {
    const view = await mount();
    click(chip(view.container));
    click(tab("Just watch an address"));
    const panel = selectedPanel();
    expect(allText(panel)).toContain("Bindings stay on this machine");
    expect(allText(panel)).toContain("No addresses saved yet");
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
    expect([...panel.querySelectorAll("h2")]).toHaveLength(0);
    act(() => {
      folded.open = false;
      folded.dispatchEvent(new Event("toggle"));
    });
    expect(folded.querySelector("#wl-map")).toBeNull();
    setValue(must<HTMLInputElement>(panel, "input"), OWNER, act);
    click(must(panel, 'button[type="submit"]'));
    await eventually(() => expect(allText(selectedPanel())).toContain("Saved."), act);
    expect((await view.h.bindings.list()).map((binding) => binding.address)).toEqual([OWNER]);
    await eventually(() => expect(allText(chip(view.container))).toBe(shortAddress(OWNER)), act);
    expect(view.net.calls).toEqual([]);
  });

  it("refuses an address that fails the checks, in words, and saves nothing", async () => {
    const view = await mount();
    click(chip(view.container));
    click(tab("Just watch an address"));
    const panel = selectedPanel();
    setValue(must<HTMLInputElement>(panel, "input"), "0x1234", act);
    click(must(panel, 'button[type="submit"]'));
    await eventually(() => expect(selectedPanel().querySelector('[data-testid="add-result"]')).not.toBeNull(), act);
    expect(must(selectedPanel(), '[data-testid="add-result"]').getAttribute("role")).toBe("alert");
    expect(await view.h.bindings.list()).toEqual([]);
    expect(allText(chip(view.container))).toBe(WATCH_LABEL);
  });

  it("the modal has no structural accessibility violations on any tab, connected or not", async () => {
    const view = await withWallet();
    click(chip(view.container));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).not.toBeNull(), act);
    for (const index of [0, 1, 2]) {
      click(tabs()[index] as HTMLButtonElement);
      const violations = await runAxe(dialog());
      expect(violations.map((violation) => `${index} ${violation.id}: ${violation.targets.join(" | ")}`)).toEqual([]);
    }
    click(tabs()[0] as HTMLButtonElement);
    click(must(selectedPanel(), 'button[data-action="connect-injected"]'));
    await eventually(() => expect(dialog().querySelector('[data-kind="connected"]')).not.toBeNull(), act);
    const violations = await runAxe(dialog());
    expect(violations.map((violation) => `${violation.id}: ${violation.targets.join(" | ")}`)).toEqual([]);
  });
});

describe("Save this address", () => {
  it("asks the browser wallet to sign the short proof, checks it, and saves the address as wallet-signed and verified", async () => {
    const view = await withWallet({ chainId: 8453 });
    click(chip(view.container));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).not.toBeNull(), act);
    click(must(selectedPanel(), 'button[data-action="connect-injected"]'));
    await eventually(() => expect(dialog().querySelector('button[data-action="save-signed-address"]')).not.toBeNull(), act);
    click(must(dialog(), 'button[data-action="save-signed-address"]'));
    await eventually(() => expect(dialog().querySelector('[data-kind="save-result"]')).not.toBeNull(), act);
    expect(must(dialog(), '[data-kind="save-result"]').getAttribute("data-verified")).toBe("true");
    const sign = view.wallet.calls.find((call) => call.method === "personal_sign");
    expect(sign).toBeDefined();
    const [saved] = await view.h.bindings.list();
    expect(saved?.address).toBe(ACCOUNT_0.address);
    expect(saved?.source).toBe("wallet_signed");
    expect(saved?.proof?.verified).toBe(true);
    expect(saved?.proof?.message).toContain("page.test wants you to sign in with your Ethereum account:");
    expect(saved?.proof?.message).toContain("Prove you control this address for this page. This signs nothing else.");
    expect(saved?.proof?.message).toContain("Chain ID: 8453");
    // The chip shows the connected wallet, not the saved address.
    expect(allText(chip(view.container))).toContain(shortAddress(ACCOUNT_0.address));
  });

  it("keeps a signature that does not recover to the address (a smart account) as unverified, in words", async () => {
    const client = fakeSignClient();
    // The wallet answers with a valid signature by another key: what an ERC-1271 account's owner signature looks like
    // to a page that only does ecrecover.
    client.answer = (method, params) => (method === "personal_sign" ? ACCOUNT_1.signMessage({ message: { raw: (params as [`0x${string}`])[0] } }) : null);
    const view = await mount({ wallet: testEnvironment({ target: null, client }) });
    click(chip(view.container));
    click(must(selectedPanel(), 'button[data-action="walletconnect-start"]'));
    await eventually(() => expect(selectedPanel().querySelector('[data-kind="pairing-link"]')).not.toBeNull(), act);
    await act(async () => client.approve(session()));
    await eventually(() => expect(dialog().querySelector('button[data-action="save-signed-address"]')).not.toBeNull(), act);
    click(must(dialog(), 'button[data-action="save-signed-address"]'));
    await eventually(() => expect(dialog().querySelector('[data-kind="save-result"]')).not.toBeNull(), act);
    const result = must(dialog(), '[data-kind="save-result"]');
    expect(result.getAttribute("data-verified")).toBe("false");
    expect(allText(result)).toContain("marked unverified");
    const [saved] = await view.h.bindings.list();
    expect(saved?.source).toBe("wallet_signed");
    expect(saved?.proof?.verified).toBe(false);
    expect(client.requests.at(-1)?.method).toBe("personal_sign");
  });

  it("says so when the wallet declines, and saves nothing", async () => {
    const view = await withWallet();
    click(chip(view.container));
    await eventually(() => expect(selectedPanel().querySelector('button[data-action="connect-injected"]')).not.toBeNull(), act);
    click(must(selectedPanel(), 'button[data-action="connect-injected"]'));
    await eventually(() => expect(dialog().querySelector('button[data-action="save-signed-address"]')).not.toBeNull(), act);
    view.wallet.failNext.set("personal_sign", new RpcFailure(4001, "User rejected"));
    click(must(dialog(), 'button[data-action="save-signed-address"]'));
    await eventually(() => expect(dialog().querySelector('[data-kind="save-result"]')).not.toBeNull(), act);
    expect(allText(must(dialog(), '[data-kind="save-result"]'))).toBe("Not saved. You declined the request in your wallet.");
    expect(await view.h.bindings.list()).toEqual([]);
  });
});
