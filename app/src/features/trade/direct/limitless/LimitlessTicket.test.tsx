// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { ReactElement } from "react";
import { decodeFunctionData, encodeAbiParameters, parseAbi } from "viem";

import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { LIMITLESS_EXCHANGES } from "@sdk/trade/clob/venues";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { ConnectActionProvider, ModeProvider } from "../../../../ui";
import { allText, cleanup, click, must, render } from "../../../../ui/testing/dom";
import { SignerProvider } from "../../../wallet/connect/context";
import type { WalletSigner } from "../../../../core/signer";
import type { TokenChoice } from "../../ActionPanels";
import type { ClobMarketFacts } from "../../clob-ticket";
import { TradeServicesProvider } from "../../services";
import { makeRig, typeInto, until } from "../../test-support";
import { TradeDesk } from "../../TradeDesk";
import { credentialKey } from "../credentials";
import type { VenueResponse } from "../http";
import { createDirectServices, DirectServicesProvider } from "../services";
import { fakeChain, fakeSigner, fakeVenue, json, MemoryStorage, testDeps, type FakeVenue, type Route } from "../testkit";
import type { DirectDeps } from "../types";
import { createLimitlessExecutor } from "./executor";

// The Limitless ticket as a visitor meets it in the standalone build, through the trade desk the market modal hosts: a
// pasted token checked with Limitless and never shown back, a wallet that cannot send its approval, an order placed
// after its Signature Card, and a build with no markets API. A scripted relay and an in-memory Base node answer.

afterEach(() => cleanup());

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const SLUG = "will-it-rain-in-test-city-1792756800000";
const YES = "74545983764114334479013489209199340682364685758382950569413632147917995316991";
const NO = "61626535714832143963095226478401016279493533995883896169905600811367354846655";
const EXCHANGE = LIMITLESS_EXCHANGES[0]!;
const ORDER_ID = "6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203";
const TOKEN = { tokenId: "test-only-token-id-0001", secret: "dGVzdC1vbmx5LWxpbWl0bGVzcy1zZWNyZXQtMDAwMQ==" };
const RELAY = "/v1/relay/limitless";
const CHOICES: readonly TokenChoice[] = [
  { label: "Outcome 1: Yes", tokenId: YES, short: "Yes", outcome: "yes" },
  { label: "Outcome 2: No", tokenId: NO, short: "No", outcome: "no" },
];
const FACTS: ClobMarketFacts = { venue: "limitless", marketId: SLUG, tick: "0.001", minSize: "0", polymarketBook: null, fetchedAtMs: 0 };
const READS = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)", "function isApprovedForAll(address, address) view returns (bool)", "function balanceOf(address, uint256) view returns (uint256)"]);

function upstream(status: number, body: unknown): VenueResponse {
  return { ...json(status, body), marker: "upstream" };
}

function relay(over: Record<string, Route> = {}): FakeVenue {
  return fakeVenue({
    [`GET ${RELAY}/markets/${SLUG}`]: () => upstream(200, { slug: SLUG, tradeType: "clob", tokens: { yes: YES, no: NO }, venue: { exchange: EXCHANGE }, metadata: { fee: false } }),
    [`GET ${RELAY}/profiles/me`]: () => upstream(200, { id: 4242, account: OWNER.address, tradeWalletOption: "eoa", effectiveFeeRateBps: null }),
    [`GET /v1/markets/limitless/${SLUG}`]: () => json(200, { books: [{ tokenId: YES, book: { bids: [{ price: "0.48", size: "100" }], asks: [{ price: "0.53", size: "40" }], asOfMs: 1_792_755_560_000, derived: "native" } }] }),
    [`POST ${RELAY}/orders`]: () => upstream(201, { order: { id: ORDER_ID, status: "LIVE" }, execution: {} }),
    [`GET ${RELAY}/markets/${SLUG}/user-orders`]: () => upstream(200, []),
    ...over,
  });
}

function baseWith(holdings: { readonly usdc: bigint; readonly allowance: bigint }) {
  return fakeChain({
    call: (to, data) => {
      const { functionName } = decodeFunctionData({ abi: READS, data });
      if (to === LIMITLESS_USDC.toLowerCase() && functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [holdings.usdc]);
      if (to === LIMITLESS_USDC.toLowerCase() && functionName === "allowance") return encodeAbiParameters([{ type: "uint256" }], [holdings.allowance]);
      if (to === LIMITLESS_CONDITIONAL_TOKENS.toLowerCase() && functionName === "isApprovedForAll") return encodeAbiParameters([{ type: "bool" }], [false]);
      if (to === LIMITLESS_CONDITIONAL_TOKENS.toLowerCase()) return encodeAbiParameters([{ type: "uint256" }], [0n]);
      return null;
    },
  });
}

function mount(signer: WalletSigner | null, v: FakeVenue, options: { readonly loggedIn?: boolean; readonly chain?: ReturnType<typeof baseWith>; readonly relayOrigin?: string | null } = {}) {
  const storage = new MemoryStorage();
  if (options.loggedIn === true) storage.setItem(credentialKey("limitless", OWNER.address), JSON.stringify(TOKEN));
  const deps: DirectDeps = testDeps(v, options.chain ?? baseWith({ usdc: 100_000_000n, allowance: 1_000_000_000n }), storage);
  const base = createDirectServices(deps);
  // The page's registry builds the executor with the build's markets API; a test may take it away.
  const direct = options.relayOrigin === null ? { ...base, executor: ((venue: string) => (venue === "limitless" ? createLimitlessExecutor(deps, null) : base.executor(venue as "polymarket"))) as typeof base.executor } : base;
  const rig = makeRig();
  const ui: ReactElement = (
    <ModeProvider mode="standalone">
      <ConnectActionProvider>
        <TradeServicesProvider services={rig.services}>
          <DirectServicesProvider services={direct}>
            <SignerProvider signer={signer}>
              <TradeDesk panels="order" heading="h4" tokenChoices={CHOICES} clobMarket={FACTS} />
            </SignerProvider>
          </DirectServicesProvider>
        </TradeServicesProvider>
      </ConnectActionProvider>
    </ModeProvider>
  );
  return { ...render(ui), storage };
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

describe("the Limitless ticket in the standalone build", () => {
  it("with no wallet: one action, and nothing is requested", async () => {
    const v = relay();
    const { container } = mount(null, v);
    await until(() => allText(container).includes("Connect a wallet to trade"));
    expect(container.querySelector("[data-testid='direct-ticket'][data-venue='limitless'][data-direct='no-wallet']")).not.toBeNull();
    expect(allText(container)).toContain("through our markets API's relay");
    expect(allText(container)).not.toMatch(/needs the Cockpit/);
    expect(v.requests).toEqual([]);
  });

  it("a build with no markets API says so and asks nothing", async () => {
    const v = relay();
    const { container } = mount(fakeSigner(OWNER), v, { relayOrigin: null });
    await until(() => allText(container).includes("Limitless trading is not available in this build"));
    expect(v.requests).toEqual([]);
  });

  it("a pasted token is checked with Limitless, kept for this tab, cleared from the form and never shown back", async () => {
    const v = relay();
    const { container, storage } = mount(fakeSigner(OWNER), v);
    await until(() => allText(container).includes("Use your Limitless API token"));
    expect(allText(container)).toContain("your wallet itself");
    expect(allText(must(container, "[data-direct='blocked']"))).toBe("Paste your Limitless API token first.");
    typeInto(inputLabelled(container, "Token id"), TOKEN.tokenId);
    typeInto(inputLabelled(container, "Token secret"), TOKEN.secret);
    expect(inputLabelled(container, "Token secret").type).toBe("password");
    click(buttonNamed(container, /Check and use this token/));
    await until(() => container.querySelector("[data-direct='logged-in']") !== null);
    expect(allText(container)).toMatch(/Your Limitless API token li[0-9a-f]{8}/);
    expect(storage.items.has(credentialKey("limitless", OWNER.address))).toBe(true);
    expect(container.innerHTML).not.toContain(TOKEN.secret);
    expect(container.innerHTML).not.toContain(TOKEN.tokenId);
    expect(v.requests.filter((request) => request.url.includes("/profiles/me"))).toHaveLength(1);
    // The open orders appear once a token is held.
    await until(() => container.querySelector("[data-direct='orders']") !== null);
    click(buttonNamed(container, /Forget it in this tab/));
    await until(() => allText(container).includes("Use your Limitless API token"));
    expect(storage.items.size).toBe(0);
  });

  it("a token Limitless refuses is not kept, and its words come back as a stranger's text", async () => {
    const v = relay({ [`GET ${RELAY}/profiles/me`]: () => upstream(401, { message: "Invalid or expired token" }) });
    const { container, storage } = mount(fakeSigner(OWNER), v);
    await until(() => allText(container).includes("Use your Limitless API token"));
    typeInto(inputLabelled(container, "Token id"), TOKEN.tokenId);
    typeInto(inputLabelled(container, "Token secret"), TOKEN.secret);
    click(buttonNamed(container, /Check and use this token/));
    await until(() => allText(container).includes("Limitless refused this token"));
    expect(must(container, "[data-code='logged-out'] [data-trust]").textContent).toBe("Invalid or expired token");
    expect(storage.items.size).toBe(0);
  });

  it("a wallet that cannot send transactions: a USDC approval it needs is explained in words, with no button", async () => {
    const signer = fakeSigner(OWNER, { capabilities: { sendTransaction: false } });
    const { container } = mount(signer, relay(), { loggedIn: true, chain: baseWith({ usdc: 100_000_000n, allowance: 0n }) });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    expect(allText(must(container, "[data-direct='funding']"))).toContain("USDC held by your wallet (Base, read now)100 USDC");
    typeInto(inputLabelled(container, "Limit price"), "0.52");
    typeInto(inputLabelled(container, "Size · shares"), "10");
    await until(() => container.querySelector("[data-direct='approve-blocked']") !== null);
    expect(allText(must(container, "[data-direct='blocked']"))).toMatch(/USDC of the maker's; this order needs 5.2. Approve first/);
    expect(allText(must(container, "[data-direct='approve-blocked']"))).toMatch(/PayBox over WalletConnect/);
    expect(container.querySelector("[data-action='direct-approve-exact']")).toBeNull();
  });

  it("Review and sign shows the Signature Card first; the wallet is asked from it; Limitless's answer is shown", async () => {
    const v = relay();
    const signer = fakeSigner(OWNER);
    const { container } = mount(signer, v, { loggedIn: true });
    await until(() => container.querySelector("[data-direct='funding']") !== null);
    typeInto(inputLabelled(container, "Limit price"), "0.52");
    typeInto(inputLabelled(container, "Size · shares"), "10");
    await until(() => !buttonNamed(container, /Review and sign/).disabled);
    click(buttonNamed(container, /Review and sign/));
    await until(() => document.body.querySelector("[role='dialog']") !== null);
    const dialog = must<HTMLElement>(document.body, "[role='dialog']");
    expect(allText(dialog)).toContain("Sign a Limitless BUY order");
    for (const field of ["salt", "maker", "signer", "taker", "tokenId", "makerAmount", "takerAmount", "expiration", "nonce", "feeRateBps", "side", "signatureType", "verifyingContract", "orderType", "ownerId", "marketSlug"]) expect(allText(dialog)).toContain(field);
    expect(allText(dialog)).toContain("best bid 0.48, best ask 0.53");
    expect(signer.typedData).toEqual([]);
    expect(v.requests.some((request) => request.method === "POST")).toBe(false);
    click(buttonNamed(dialog, /Sign in your wallet and send/));
    await until(() => allText(container).includes("Limitless accepted the order"));
    expect(signer.typedData).toHaveLength(1);
    expect(v.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(allText(must(container, "[data-kind='direct-answer']"))).toContain(ORDER_ID);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });
});
