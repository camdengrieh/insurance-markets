// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_ACCOUNT, ANVIL_ACCOUNT_0_OWNER, BASE_USDC, KERNEL_PROXY_RUNTIME_CODE } from "@shared/xo/chain/constants";

import { BINDING_PRIVACY_NOTICE } from "../../core/bindings";
import { act, allText, cleanup, click, must, render, settle } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { WalletView as WalletPanelsView, type WalletHeading } from "./WalletView";
import { FetchError } from "../../core/fetch";
import { useBindingsState } from "./services";
import { fakeNetwork, type FakeChain } from "./testkit";
import { eventually, harness, setValue } from "./view-harness";

// The wallet panels end to end in jsdom, as the Connect modal hosts them: the binding screen (M2-1, M2-9), and under
// the disclosure the account map (M2-2, M2-3, M2-8), balances, decoded funding steps, hostile text, and a structural
// accessibility audit. The folded panels mount only once the disclosure is opened, so nothing is read on its own.

// The host the Connect modal is: it reads the bindings state and hands it to the view.
function WalletView({ heading }: { readonly heading?: WalletHeading }) {
  const state = useBindingsState();
  return <WalletPanelsView state={state} heading={heading} />;
}

// Opens the folded panels the way a person does, so the account map, balances and funding steps mount.
async function unfold(container: HTMLElement): Promise<void> {
  await eventually(() => expect(container.querySelector('[data-testid="wallet-panels"]')).not.toBeNull(), act);
  const details = must<HTMLDetailsElement>(container, '[data-testid="wallet-panels"]');
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

let axeSource = "";
beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  axeSource = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(axeSource).call(window);
});
afterEach(cleanup);

const OWNER = ANVIL_ACCOUNT_0_OWNER;
const ACCOUNT = ANVIL_ACCOUNT_0_ACCOUNT;

const HOSTS = { xo: "rpc-mainnet-2.xo.market", base: "base-rpc.publicnode.com", polygon: "polygon-bor-rpc.publicnode.com", bnb: "bsc-rpc.publicnode.com", hyper: "rpc.hyperliquid.xyz" };

function network(overrides: Partial<Record<keyof typeof HOSTS, FakeChain>> = {}) {
  const deployed: FakeChain = { codes: { [ACCOUNT.toLowerCase()]: KERNEL_PROXY_RUNTIME_CODE }, multicall: true, batch: true };
  const base: FakeChain = {
    multicall: true,
    batch: true,
    codes: { [ACCOUNT.toLowerCase()]: KERNEL_PROXY_RUNTIME_CODE },
    native: { [OWNER.toLowerCase()]: 2n * 10n ** 18n },
    tokens: { [BASE_USDC.toLowerCase()]: { [OWNER.toLowerCase()]: 9_000_000n } },
  };
  return fakeNetwork({
    rpc: {
      [HOSTS.xo]: overrides.xo ?? deployed,
      [HOSTS.base]: overrides.base ?? base,
      [HOSTS.polygon]: overrides.polygon ?? { multicall: true, batch: true },
      [HOSTS.bnb]: overrides.bnb ?? { multicall: true, batch: true },
      [HOSTS.hyper]: overrides.hyper ?? { multicall: true, batch: true },
    },
    get: {
      ["explorer-mainnet.xo.market/api/v2/addresses/" + ACCOUNT]: () => ({ status: 404, body: {} }),
      ["explorer-mainnet.xo.market/api/v2/addresses/" + ACCOUNT + "/token-balances"]: () => ({ status: 404, body: {} }),
      "orderbooks.xo.market/balance-allowance": () => ({ status: 404 }),
    },
  });
}

async function addAddress(view: ReturnType<typeof render>, address: string, label?: string): Promise<void> {
  const input = must<HTMLInputElement>(view.container, 'input[autocomplete="off"]');
  setValue(input, address, act);
  if (label !== undefined) {
    const labelInput = [...view.container.querySelectorAll<HTMLInputElement>("input.ui-input")].find((candidate) => candidate.maxLength === 48);
    if (labelInput === undefined) throw new Error("no label input");
    setValue(labelInput, label, act);
  }
  click(must(view.container, 'button[type="submit"]'));
  await settle(10);
}

describe("binding screen (M2-1, M2-9)", () => {
  it("M2-9: states the privacy cost before anything is saved, and queries no venue until one is selected", async () => {
    const net = network();
    const h = harness({ net });
    const view = render(h.wrap(<WalletView />));
    await eventually(() => expect(allText(view.container)).toContain("What looking up an address costs"), act);
    expect(allText(view.container)).toContain(BINDING_PRIVACY_NOTICE);
    await addAddress(view, OWNER, "My PayBox");
    await eventually(() => expect(allText(view.container)).toContain("Ask these venues about this address"), act);
    // Saved, with no venue ticked: nothing was asked of any venue.
    const boxes = [...view.container.querySelectorAll<HTMLInputElement>('.wl-venues input[type="checkbox"]')].filter((box) => box.id.includes(":"));
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every((box) => !box.checked)).toBe(true);
    const saved = await h.bindings.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.venues).toEqual([]);
    expect(net.calls.some((call) => ["gamma-api.polymarket.com", "data-api.polymarket.com", "data.pascal.trade", "api-mainnet.xo.market"].includes(call.url.hostname))).toBe(false);
  });

  it("M2-9: venues are chosen per saved address, kinds that do not fit are disabled, and the choice is stored", async () => {
    const net = network();
    const h = harness({ net });
    await h.bindings.add({ address: OWNER, kind: "eoa", label: "Mine" });
    const view = render(h.wrap(<WalletView />));
    await eventually(() => expect(must(view.container, ".wl-binding")).toBeTruthy(), act);
    const binding = must(view.container, ".wl-binding");
    const box = (venue: string) => must<HTMLInputElement>(binding, `input[id$=":${venue}"]`);
    // An EOA is offered XO, Polymarket and Trueo; Pascal needs a Solana address.
    expect(box("xo").disabled).toBe(false);
    expect(box("polymarket").disabled).toBe(false);
    expect(box("trueo").disabled).toBe(false);
    expect(box("pascal").disabled).toBe(true);
    click(box("polymarket"));
    await settle(10);
    expect((await h.bindings.list())[0]?.venues).toEqual(["polymarket"]);
    click(box("polymarket"));
    await settle(10);
    expect((await h.bindings.list())[0]?.venues).toEqual([]);
  });

  it("M2-1: a bad checksum, a name and a protocol contract are refused with a reason, and nothing is saved", async () => {
    const h = harness({ net: network() });
    const view = render(h.wrap(<WalletView />));
    await eventually(() => expect(view.container.querySelector('button[type="submit"]')).not.toBeNull(), act);
    // One letter flipped in case: valid hex, wrong checksum (built here so no bad literal sits in the source).
    const badChecksum = OWNER.replace("0xf39F", "0xF39F");
    for (const [address, expected] of [
      [badChecksum, /checksum/],
      ["vitalik.eth", /not resolved/],
      ["0x0000000000000000000000000000000000000000", /zero address/],
      ["0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419", /protocol contract/],
      ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266​", /invisible/],
    ] as const) {
      await addAddress(view, address);
      await eventually(() => expect(must(view.container, '[data-testid="add-result"]').textContent ?? "").toMatch(expected), act);
    }
    expect(await h.bindings.list()).toEqual([]);
  });

  it("M2-1: a look-alike of a saved address needs confirmation and shows both full addresses", async () => {
    const h = harness({ net: network() });
    await h.bindings.add({ address: OWNER, kind: "eoa", label: "Mine" });
    const view = render(h.wrap(<WalletView />));
    await eventually(() => expect(view.container.querySelector(".wl-binding")).not.toBeNull(), act);
    // Same first and last four hex digits as the saved address, different middle.
    const lookalike = "0xf39f" + "1".repeat(32) + "2266";
    await addAddress(view, lookalike);
    await eventually(() => expect(must(view.container, '[data-testid="add-result"]').textContent ?? "").toMatch(/starts and ends like/), act);
    const result = must(view.container, '[data-testid="add-result"]');
    // Both addresses are printed in full for comparison; nothing is saved yet.
    expect(result.textContent).toContain(OWNER);
    expect(result.textContent).toContain(lookalike.slice(0, 6));
    expect((await h.bindings.list()).length).toBe(1);
    const confirm = [...result.querySelectorAll("button")].find((button) => /compared every character/.test(button.textContent ?? ""));
    expect(confirm).toBeDefined();
    if (confirm === undefined) throw new Error("no confirm button");
    click(confirm);
    await eventually(async () => expect((await h.bindings.list()).length).toBeGreaterThan(0), act);
    await settle(10);
    expect((await h.bindings.list()).length).toBe(2);
  });

  it("a hostile label is shown as inert text", async () => {
    const h = harness({ net: network() });
    await h.bindings.add({ address: OWNER, kind: "eoa", label: "<img src=x onerror=alert(1)>" });
    const view = render(h.wrap(<WalletView />));
    await eventually(() => expect(view.container.querySelector(".wl-binding")).not.toBeNull(), act);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("[onerror]")).toBeNull();
    expect(must(view.container, ".wl-binding").textContent).toContain("<img");
  });

  it("an import that looks like a secret is refused, and an imported hostile label is rendered inert", async () => {
    const h = harness({ net: network() });
    const view = render(h.wrap(<WalletView />));
    await eventually(() => expect(view.container.querySelector("details")).not.toBeNull(), act);
    const details = [...view.container.querySelectorAll("details")].find((node) => /Export, import/.test(node.textContent ?? ""));
    if (details === undefined) throw new Error("no import section");
    const area = must<HTMLTextAreaElement>(details, "textarea:not([readonly])");
    setValue(area, `{"private_key":"${"ab".repeat(32)}"}`, act);
    const importButton = [...details.querySelectorAll("button")].find((button) => button.textContent === "Import");
    if (importButton === undefined) throw new Error("no import button");
    click(importButton);
    await settle(10);
    expect(allText(details)).toMatch(/looks like it contains a secret/);
    expect(await h.bindings.list()).toEqual([]);

    // A well-formed file whose label is markup: accepted as data, shown as text.
    const file = { format: "xo-cockpit-bindings", version: 1, bindings: [{ id: `eoa:evm:${OWNER.toLowerCase()}`, label: "<img src=x onerror=alert(1)>\u202e", kind: "eoa", chain: "evm", address: OWNER, status: "derived", venues: [], source: "pasted" }] };
    setValue(area, JSON.stringify(file), act);
    click(importButton);
    await eventually(() => expect(view.container.querySelector(".wl-binding")).not.toBeNull(), act);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("[onerror]")).toBeNull();
    expect(must(view.container, ".wl-binding").textContent).not.toContain("\u202e");
  });
});

describe("account map, balances and funding steps", () => {
  async function withOwner(net = network(), mode: "cockpit" | "standalone" = "cockpit") {
    const h = harness({ net, mode });
    await h.bindings.add({ address: OWNER, kind: "eoa", label: "Mine" });
    const view = render(h.wrap(<WalletView />));
    // Folded: nothing has been asked of any chain yet.
    await eventually(() => expect(view.container.querySelector('[data-testid="wallet-panels"]')).not.toBeNull(), act);
    expect(view.container.querySelector('[data-testid="account-map"]')).toBeNull();
    expect(net.calls).toEqual([]);
    await unfold(view.container);
    await eventually(() => expect(view.container.querySelector('[data-testid="account-map"]')).not.toBeNull(), act);
    return { h, view, net };
  }

  it("M2-2: shows the owner and the derived account in full", async () => {
    const { view } = await withOwner();
    expect(must(view.container, '[data-testid="owner-address"]').textContent).toBe(OWNER);
    expect(must(view.container, '[data-testid="derived-account"]').textContent).toBe("0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d");
    expect(allText(view.container)).toMatch(/address map, not yet a usable multichain wallet/);
  });

  it("M2-8: the account is listed on every chain with its own state; M2-3 wording", async () => {
    const { view } = await withOwner(network({ bnb: { down: true } }));
    const table = must(view.container, '[data-testid="account-map"] table');
    const rows = [...table.querySelectorAll("tbody tr")];
    expect(rows.length).toBe(10);
    const rowOf = (name: string) => rows.find((row) => row.querySelector("th")?.textContent?.startsWith(name));
    expect(rowOf("Base")?.textContent).toMatch(/code present/);
    expect(rowOf("Polygon")?.textContent).toMatch(/counterfactual, not deployed/);
    // The unreachable chain never says "undeployed" or "counterfactual".
    const bnb = rowOf("BNB Chain")?.textContent ?? "";
    expect(bnb).toMatch(/RPC unreachable/);
    expect(bnb).not.toMatch(/undeployed|not deployed|counterfactual/i);
    // A chain this build has no RPC for is said to be unchecked.
    expect(rowOf("Arbitrum")?.textContent).toMatch(/no public RPC for this chain, so nothing was checked/);
  });

  it("M2-3: a deployed Base account is a deposit target; XO is not until door (a) is proven", async () => {
    const { view } = await withOwner();
    const rows = [...must(view.container, '[data-testid="account-map"] table').querySelectorAll("tbody tr")];
    const base = rows.find((row) => row.querySelector("th")?.textContent?.startsWith("Base"));
    const xo = rows.find((row) => row.querySelector("th")?.textContent?.startsWith("XO"));
    expect(base?.textContent).toMatch(/Deposit target\?|yes/);
    expect(base?.querySelectorAll("td")[1]?.textContent).toMatch(/yes/);
    expect(xo?.querySelectorAll("td")[1]?.textContent).toMatch(/not yet/);
    expect(xo?.textContent).toMatch(/door a/);
  });

  it("anything not recorded as yes shows 'unproven'", async () => {
    const { view } = await withOwner();
    const list = must(view.container, ".wl-capabilities");
    const items = [...list.querySelectorAll("li")];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => /unproven/.test(item.textContent ?? ""))).toBe(true);
    expect(list.textContent).not.toMatch(/: proven/);
  });

  it("balances: each chain on its own; a chain without a public RPC says so; nothing is summed", async () => {
    const { view } = await withOwner();
    await eventually(() => expect(allText(must(view.container, '[data-testid="balances"]'))).toContain("9"), act);
    const balances = must(view.container, '[data-testid="balances"]');
    expect(balances.textContent).toMatch(/This build has no public RPC for this chain/);
    expect(balances.textContent).toMatch(/Balances are not added together/);
    const base = must(balances, '[data-chain="eip155:8453"]');
    expect(base.textContent).toMatch(/Owner address/);
    expect(base.textContent).toMatch(/9 USDC/);
    expect(base.textContent).toMatch(/2 ETH/);
  });

  it("balances: one unreachable chain fails on its own", async () => {
    const { view } = await withOwner(network({ polygon: { down: true } }));
    await eventually(() => expect(must(view.container, '[data-chain="eip155:137"]').textContent).toMatch(/did not answer/), act);
    expect(must(view.container, '[data-chain="eip155:8453"]').textContent).toMatch(/9 USDC/);
  });

  it("funding: the amount starts empty and no steps are shown until one is typed", async () => {
    const { view } = await withOwner();
    await eventually(() => expect(view.container.querySelector('[data-testid="funding"] input')).not.toBeNull(), act);
    const funding = must(view.container, '[data-testid="funding"]');
    expect(must<HTMLInputElement>(funding, "input").value).toBe("");
    expect(funding.textContent).toContain("Enter an amount");
    expect(funding.textContent).not.toContain("Step 1: approve the exact amount");
    expect(funding.querySelector('[data-testid="funding-destination"]')).toBeNull();
    expect(funding.querySelector('[data-testid="funding-next"]')).toBeNull();
  });

  it("funding steps are decoded, display only, and the destination is the derived account", async () => {
    const { view } = await withOwner();
    await eventually(() => expect(view.container.querySelector('[data-testid="funding"] input')).not.toBeNull(), act);
    setValue(must<HTMLInputElement>(view.container, '[data-testid="funding"] input'), "3", act);
    await eventually(() => expect(view.container.querySelector('[data-testid="funding-destination"]')).not.toBeNull(), act);
    const funding = must(view.container, '[data-testid="funding"]');
    expect(funding.textContent).toMatch(/cannot sign or send anything/);
    expect(must(funding, '[data-testid="funding-destination"]').textContent).toBe(ACCOUNT);
    expect(funding.textContent).toContain("Step 1: approve the exact amount");
    expect(funding.textContent).toContain("Step 2: send to your XO account");
    // XO is not a proven deposit target (door a), so the screen says not to send yet.
    expect(funding.textContent).toMatch(/Do not send yet/);
    // There is no control that sends or signs anything on this screen.
    const labels = [...funding.querySelectorAll("button")].map((button) => button.textContent ?? "");
    expect(labels.filter((label) => /sign|send|submit|approve/i.test(label))).toEqual([]);
  });

  it("funding: a bad amount is refused in words and no steps are shown", async () => {
    const { view } = await withOwner();
    await eventually(() => expect(view.container.querySelector('[data-testid="funding"] input')).not.toBeNull(), act);
    const input = must<HTMLInputElement>(view.container, '[data-testid="funding"] input');
    setValue(input, "1e6", act);
    await eventually(() => expect(must(view.container, '[data-testid="funding"]').textContent).toMatch(/These steps cannot be shown/), act);
    expect(view.container.querySelector('[data-testid="funding-destination"]')).toBeNull();
  });

  it("a Cockpit page that is not paired says so for the account map and the balances", async () => {
    const net = network();
    const unpaired = { ...net, fetch: async () => { throw new FetchError("unauthorized", "the Cockpit is not paired"); } };
    const { view } = await withOwner(unpaired as unknown as ReturnType<typeof network>);
    expect(must(view.container, '[data-testid="account-map"]').textContent).toMatch(/not paired with your Cockpit/);
    await eventually(() => expect(must(view.container, '[data-testid="balances"]').textContent).toMatch(/not paired with your Cockpit/), act);
    // Nothing is called "undeployed" or empty just because nothing could be read.
    expect(must(view.container, '[data-testid="account-map"]').textContent).not.toMatch(/undeployed/i);
  });

  it("the account map is dated, says it does not compute a Polymarket wallet, and offers the XO registration only through the Cockpit", async () => {
    const { view } = await withOwner(network(), "standalone");
    const map = must(view.container, '[data-testid="account-map"]');
    expect(must(map, '[data-testid="account-map-read"]').textContent).toMatch(/UTC/);
    expect(must(map, '[data-testid="polymarket-wallet-note"]').textContent).toMatch(/does not compute a Polymarket wallet/);
    expect(must(map, '[data-testid="polymarket-wallet-note"]').textContent).toMatch(/derives the signer's Polymarket proxy wallet, Safe and Deposit Wallet .* with no Polymarket API/);
    expect(map.textContent).toMatch(/XO Market: needs the Cockpit/);
  });

  it("no PayBox address saved: says what to do instead of an empty map", async () => {
    const h = harness({ net: network() });
    const view = render(h.wrap(<WalletView />));
    await unfold(view.container);
    await eventually(() => expect(allText(view.container)).toContain("No PayBox address saved"), act);
    expect(view.container.querySelector('[data-testid="account-map"]')).toBeNull();
  });
});

describe("structure", () => {
  it("has no structural accessibility violations with an address saved", async () => {
    const net = network();
    const h = harness({ net });
    await h.bindings.add({ address: OWNER, kind: "eoa", label: "Mine" });
    // As the Connect modal hosts it: under an h2, with the sections at h3.
    const { container } = render(
      <main>
        <h1>Markets</h1>
        <h2>Use your PayBox wallet here</h2>
        {h.wrap(<WalletView heading="h3" />)}
      </main>,
    );
    await unfold(container);
    expect(container.querySelectorAll("h2")).toHaveLength(1);
    await eventually(() => expect(container.querySelector('[data-testid="funding"] input')).not.toBeNull(), act);
    await eventually(() => expect(allText(container)).toContain("9 USDC"), act);
    const empty = await runAxe(container, ["region"]);
    expect(empty.map((v) => `${v.id}: ${v.help} @ ${v.targets.join(" | ")}`)).toEqual([]);
    setValue(must<HTMLInputElement>(container, '[data-testid="funding"] input'), "3", act);
    await eventually(() => expect(container.querySelector('[data-testid="funding-destination"]')).not.toBeNull(), act);
    const violations = await runAxe(container, ["region"]);
    expect(violations.map((v) => `${v.id}: ${v.help} @ ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
