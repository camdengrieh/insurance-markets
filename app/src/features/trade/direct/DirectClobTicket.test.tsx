// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReactElement } from "react";
import { decodeFunctionData, encodeAbiParameters, parseAbi, type Hex } from "viem";

import { POLYMARKET_PUSD } from "@sdk/chain/polymarket/constants";
import { hashPolymarketOrder } from "@sdk/trade/clob/polymarket/order";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../test/fixtures/userop/anvil-test-keys";
import { ConnectActionProvider, ModeProvider, useRegisterConnectAction } from "../../../ui";
import { allText, cleanup, click, must, render } from "../../../ui/testing/dom";
import { SignerProvider } from "../../wallet/connect/context";
import type { WalletSigner } from "../../../core/signer";
import type { TokenChoice } from "../ActionPanels";
import type { ClobMarketFacts } from "../clob-ticket";
import { TradeServicesProvider } from "../services";
import { makeRig, typeInto, until } from "../test-support";
import { TradeDesk } from "../TradeDesk";
import { credentialKey } from "./credentials";
import { createDirectServices, DirectServicesProvider } from "./services";
import { fakeChain, fakeSigner, fakeVenue, json, MemoryStorage, testDeps, type FakeVenue } from "./testkit";

// The direct ticket as a visitor meets it in the standalone build, through the trade desk the market modal hosts: no
// wallet, a wallet that cannot send transactions, logged out, logged in, an order placed, and a venue that says no.
// A scripted venue and an in-memory chain answer; nothing leaves the test.

afterEach(() => cleanup());

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const CONDITION = `0x${"5a".repeat(32)}`;
const YES = "71321045679252212594626385532706912750332728571942532289631379312455583992563";
const NO = "48331043336612883890938759509493159234755048973500640148014422747788308965732";
const CHOICES: readonly TokenChoice[] = [
  { label: "Outcome 1: Yes", tokenId: YES, short: "Yes", outcome: "yes" },
  { label: "Outcome 2: No", tokenId: NO, short: "No", outcome: "no" },
];
const FACTS: ClobMarketFacts = { venue: "polymarket", marketId: CONDITION, tick: "0.01", minSize: "5", polymarketBook: "ctf", fetchedAtMs: 0 };
const CREDENTIALS = { apiKey: "00000000-test-only-0000-000000000000", secret: "dGVzdC1vbmx5LXNlY3JldC0_Pz8-Pj4tYnl0ZXMtMDE=", passphrase: "test-only-passphrase" };
const READS = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)", "function isApprovedForAll(address, address) view returns (bool)", "function balanceOf(address, uint256) view returns (uint256)"]);

function chainWith(holdings: { readonly pusd: bigint; readonly allowance: bigint }) {
  return fakeChain({
    call: (to, data) => {
      const { functionName, args } = decodeFunctionData({ abi: READS, data });
      if (to === POLYMARKET_PUSD.toLowerCase() && functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [holdings.pusd]);
      if (functionName === "allowance") return encodeAbiParameters([{ type: "uint256" }], [holdings.allowance]);
      if (functionName === "isApprovedForAll") return encodeAbiParameters([{ type: "bool" }], [false]);
      if (functionName === "balanceOf" && args?.length === 2) return encodeAbiParameters([{ type: "uint256" }], [0n]);
      return null;
    },
  });
}

function venue(post: (orderId: Hex) => ReturnType<typeof json> = (orderId) => json(200, { success: true, orderID: orderId, status: "live" })): FakeVenue {
  return fakeVenue({
    "GET /time": () => ({ status: 200, text: "1792755563" }),
    "GET /book": () => json(200, { market: CONDITION, tick_size: "0.01", min_order_size: "5", bids: [{ price: "0.5", size: "10" }], asks: [{ price: "0.53", size: "10" }] }),
    "GET /auth/derive-api-key": () => json(200, CREDENTIALS),
    "GET /data/orders": () => json(200, { data: [{ id: `0x${"ab".repeat(32)}`, side: "BUY", price: "0.4", original_size: "20", size_matched: "0", status: "LIVE" }], next_cursor: "LTE=" }),
    "POST /order": (request) => {
      const wire = (JSON.parse(request.body ?? "{}") as { order: Record<string, string | number> }).order;
      const id = hashPolymarketOrder(
        {
          salt: BigInt(wire["salt"] as number),
          maker: wire["maker"] as `0x${string}`,
          signer: wire["signer"] as `0x${string}`,
          tokenId: BigInt(wire["tokenId"] as string),
          makerAmount: BigInt(wire["makerAmount"] as string),
          takerAmount: BigInt(wire["takerAmount"] as string),
          side: wire["side"] === "BUY" ? 0 : 1,
          signatureType: wire["signatureType"] as number,
          timestamp: BigInt(wire["timestamp"] as string),
          metadata: wire["metadata"] as Hex,
          builder: wire["builder"] as Hex,
        },
        "ctf",
      );
      return post(id);
    },
  });
}

function Opener({ onOpen }: { readonly onOpen: () => void }) {
  useRegisterConnectAction(onOpen);
  return null;
}

function mount(signer: WalletSigner | null, v: FakeVenue, chain = chainWith({ pusd: 100_000_000n, allowance: 1_000_000_000n }), options: { readonly loggedIn?: boolean; readonly onOpen?: () => void; readonly clobMarket?: boolean } = {}) {
  const storage = new MemoryStorage();
  if (options.loggedIn === true) storage.setItem(credentialKey("polymarket", OWNER.address), JSON.stringify(CREDENTIALS));
  const direct = createDirectServices(testDeps(v, chain, storage));
  const rig = makeRig();
  const ui: ReactElement = (
    <ModeProvider mode="standalone">
      <ConnectActionProvider>
        {options.onOpen === undefined ? null : <Opener onOpen={options.onOpen} />}
        <TradeServicesProvider services={rig.services}>
          <DirectServicesProvider services={direct}>
            <SignerProvider signer={signer}>
              <TradeDesk panels="order" heading="h4" tokenChoices={CHOICES} {...(options.clobMarket === false ? {} : { clobMarket: FACTS })} />
            </SignerProvider>
          </DirectServicesProvider>
        </TradeServicesProvider>
      </ConnectActionProvider>
    </ModeProvider>
  );
  return { ...render(ui), storage, rig };
}

function inputLabelled(root: ParentNode, label: string): HTMLInputElement {
  const found = [...root.querySelectorAll("label")].find((element) => (element.textContent ?? "").trim() === label);
  if (found === undefined) throw new Error(`no label ${label}`);
  return must<HTMLInputElement>(root, `#${CSS.escape(found.htmlFor)}`);
}

function buttonNamed(root: ParentNode, name: RegExp): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((element) => name.test(element.textContent ?? ""));
  if (found === undefined) throw new Error(`no button ${String(name)}`);
  return found;
}

async function fillOrder(container: HTMLElement): Promise<void> {
  typeInto(inputLabelled(container, "Limit price"), "0.52");
  typeInto(inputLabelled(container, "Size · shares"), "10");
  await until(() => !buttonNamed(container, /Review and sign/).disabled);
}

describe("the direct ticket in the standalone build", () => {
  it("with no wallet: one action, connect a wallet, which opens the page's Connect modal; nothing is requested", async () => {
    const v = venue();
    const onOpen = vi.fn();
    const { container } = mount(null, v, undefined, { onOpen });
    await until(() => allText(container).includes("Connect a wallet to trade"));
    expect(container.querySelector("[data-testid='direct-ticket'][data-direct='no-wallet']")).not.toBeNull();
    expect(allText(container)).not.toMatch(/needs the Cockpit/);
    click(buttonNamed(container, /Connect a wallet to trade/));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(v.requests).toEqual([]);
  });

  it("logged out: reads the account, offers the login, and logs in with the wallet's signature", async () => {
    const v = venue();
    const signer = fakeSigner(OWNER);
    const { container, storage } = mount(signer, v);
    await until(() => allText(container).includes("Log in to Polymarket"));
    expect(allText(container)).toContain("your wallet itself");
    expect(buttonNamed(container, /Review and sign/).disabled).toBe(true);
    expect(allText(must(container, "[data-direct='blocked']"))).toBe("Log in to Polymarket first.");
    click(buttonNamed(container, /^Log in to Polymarket$/));
    await until(() => allText(container).includes("Logged in to Polymarket in this tab"));
    expect(signer.typedData).toHaveLength(1);
    expect(storage.items.has(credentialKey("polymarket", OWNER.address))).toBe(true);
    expect(allText(container)).toMatch(/credential po[0-9a-f]{8}/);
    // The open orders list appears once logged in.
    await until(() => (container.querySelector("[data-direct='orders']") ?? null) !== null);
    expect(allText(must(container, "[data-direct='orders']"))).toContain("0.4");
  });

  it("a wallet that cannot send transactions: an approval it needs is explained in words, with no button", async () => {
    const signer = fakeSigner(OWNER, { capabilities: { sendTransaction: false } });
    const { container } = mount(signer, venue(), chainWith({ pusd: 100_000_000n, allowance: 0n }), { loggedIn: true });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    typeInto(inputLabelled(container, "Limit price"), "0.52");
    typeInto(inputLabelled(container, "Size · shares"), "10");
    await until(() => container.querySelector("[data-direct='approve-blocked']") !== null);
    expect(allText(must(container, "[data-direct='blocked']"))).toMatch(/Approve first/);
    expect(allText(must(container, "[data-direct='approve-blocked']"))).toMatch(/signs but does not send transactions/);
    expect(container.querySelector("[data-action='direct-approve-exact']")).toBeNull();
    expect(buttonNamed(container, /Review and sign/).disabled).toBe(true);
  });

  it("a wallet that sends: the approval opens its own card before the wallet is asked", async () => {
    const signer = fakeSigner(OWNER, { txHash: `0x${"77".repeat(32)}` });
    const { container } = mount(signer, venue(), chainWith({ pusd: 100_000_000n, allowance: 0n }), { loggedIn: true });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    typeInto(inputLabelled(container, "Limit price"), "0.52");
    typeInto(inputLabelled(container, "Size · shares"), "10");
    await until(() => container.querySelector("[data-action='direct-approve-exact']") !== null);
    click(must(container, "[data-action='direct-approve-exact']"));
    const dialog = must<HTMLElement>(document.body, "[role='dialog']");
    expect(allText(dialog)).toContain("approve(address spender, uint256 amount)");
    expect(allText(dialog)).toContain("5.72 pUSD, this order's worst case");
    expect(signer.transactions).toEqual([]);
    click(buttonNamed(dialog, /Send from your wallet/));
    await until(() => container.querySelector("[data-direct='approval-sent']") !== null);
    expect(signer.transactions).toHaveLength(1);
  });

  it("logged in: Review and sign shows the Signature Card first; the wallet is asked from the card; the venue's answer is shown", async () => {
    const v = venue();
    const signer = fakeSigner(OWNER);
    const { container } = mount(signer, v, undefined, { loggedIn: true });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    await fillOrder(container);
    click(buttonNamed(container, /Review and sign/));
    await until(() => document.body.querySelector("[role='dialog']") !== null);
    const dialog = must<HTMLElement>(document.body, "[role='dialog']");
    expect(allText(dialog)).toContain("Sign a Polymarket BUY order");
    for (const field of ["salt", "maker", "signer", "tokenId", "makerAmount", "takerAmount", "side", "signatureType", "timestamp", "metadata", "builder", "verifyingContract", "orderType"]) expect(allText(dialog)).toContain(field);
    expect(allText(dialog)).toContain("Most that can leave the account: 5.72 pUSD");
    expect(must(dialog, "[data-digest-tag='true']").textContent).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
    expect(signer.typedData).toEqual([]);
    expect(v.requests.some((request) => request.method === "POST")).toBe(false);

    click(buttonNamed(dialog, /Sign in your wallet and send/));
    await until(() => allText(container).includes("Polymarket accepted the order"));
    expect(signer.typedData).toHaveLength(1);
    expect(v.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(allText(must(container, "[data-kind='direct-answer']"))).toMatch(/Order id ?0x[0-9a-f]{64}/);
    expect(allText(must(container, "[data-kind='direct-answer']"))).toContain("live");
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });

  it("a venue that says no: its words are shown as a stranger's text, and the page says the order was not placed", async () => {
    const v = venue(() => json(200, { success: false, errorMsg: "not enough balance / allowance" }));
    const { container } = mount(fakeSigner(OWNER), v, undefined, { loggedIn: true });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    await fillOrder(container);
    click(buttonNamed(container, /Review and sign/));
    await until(() => document.body.querySelector("[role='dialog']") !== null);
    click(buttonNamed(must(document.body, "[role='dialog']"), /Sign in your wallet and send/));
    await until(() => allText(container).includes("The order was not placed"));
    const refusal = must<HTMLElement>(container, "[data-kind='direct-refusal'][data-code='venue_refused']");
    expect(allText(refusal)).toContain("Polymarket did not accept the order.");
    expect(must(refusal, "[data-trust]").textContent).toBe("not enough balance / allowance");
  });

  it("a wallet that declines keeps the card open with the reason, and nothing is sent", async () => {
    const v = venue();
    const { container } = mount(fakeSigner(OWNER, { signs: "reject" }), v, undefined, { loggedIn: true });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    await fillOrder(container);
    click(buttonNamed(container, /Review and sign/));
    await until(() => document.body.querySelector("[role='dialog']") !== null);
    click(buttonNamed(must(document.body, "[role='dialog']"), /Sign in your wallet and send/));
    await until(() => allText(must(document.body, "[role='dialog']")).includes("You declined the order in your wallet"));
    expect(v.requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("an account the chain cannot read is a refusal with Read again, never a guess", async () => {
    const { container } = mount(fakeSigner(OWNER), venue(), fakeChain({ down: true }));
    await until(() => container.querySelector("[data-kind='direct-refusal'][data-code='chain_unreadable']") !== null);
    expect(container.querySelector("[data-action='direct-review']")).toBeNull();
    expect(container.querySelector("[data-action='direct-reread-account']")).not.toBeNull();
  });

  it("everything else on the desk still needs the Cockpit in this build", async () => {
    const { container } = mount(fakeSigner(OWNER), venue(), undefined, { clobMarket: false });
    expect(allText(container)).toMatch(/needs the Cockpit/);
    expect(container.querySelector("[data-testid='direct-ticket']")).toBeNull();
  });
});
