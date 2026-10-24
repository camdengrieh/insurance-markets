// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../test/fixtures/userop/anvil-test-keys";
import { allText, cleanup, click, choose, must, render, settle } from "../../../ui/testing/dom";
import { typeInto } from "../test-support";
import type { ActivationStatus, VenueActivation } from "../../account/activation";
import type { TradingAccount } from "../../account/types";
import type { VenueKit } from "./kit";
import { polymarketRoute, xoRoute, type TicketForm, type TicketMarket, type TicketRoute, type TradeVenue } from "./routes";
import { asLocal, fakeSigner } from "./testkit";
import { TradeTicket } from "./TradeTicket";
import { ok, refuse, type DirectCancelAnswer, type DirectOpenOrders, type DirectOrderAnswer, type DirectResult } from "./types";

// The one ticket against a scripted kit: the account and activation states it shows, the summary it works out with the
// venue's own amount rules, Place order and its answer, the open orders with a cancel each, and the venue as a detail.
// The kit's venue calls are fakes written here; the summaries are the real routes'.

afterEach(cleanup);

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const YES = "74545983764114334479013489209199340682364685758382950569413632147917995316991";
const NO = "61626535714832143963095226478401016279493533995883896169905600811367354846655";
const ORDER = `0x${"ab".repeat(32)}`;

const ACCOUNT: TradingAccount = { signer: asLocal(fakeSigner(OWNER)), address: OWNER.address, mode: "derived", funding: null };
const XO_MARKET: TicketMarket = { venue: "xo", marketId: `0x${"12".repeat(32)}`, facts: null, outcomes: [{ tokenId: YES, label: "Yes" }, { tokenId: NO, label: "No" }] };
const PM_MARKET: TicketMarket = { venue: "polymarket", marketId: `0x${"34".repeat(32)}`, facts: { venue: "polymarket", marketId: `0x${"34".repeat(32)}`, tick: "0.01", minSize: "5", polymarketBook: "ctf", fetchedAtMs: 0 }, outcomes: [{ tokenId: YES, label: "Yes" }, { tokenId: NO, label: "No" }] };

interface Script {
  status: ActivationStatus;
  readonly activated?: DirectResult<void>;
  readonly placed?: DirectResult<DirectOrderAnswer>;
  orders: DirectResult<DirectOpenOrders>;
  readonly cancel?: DirectResult<DirectCancelAnswer>;
}

function kitOf(script: Script, calls: string[] = [], forms: TicketForm[] = []): VenueKit {
  const activation = (venue: TradeVenue): VenueActivation => ({
    venue,
    status: async () => script.status,
    activate: async (_acct, progress) => {
      calls.push("activate");
      for (const step of script.status.state === "needs_activation" ? script.status.steps : []) progress(step);
      const result = script.activated ?? ok(undefined);
      if (result.ok) script.status = { state: "ready" };
      return result;
    },
  });
  const fake = (route: TicketRoute): TicketRoute => ({
    ...route,
    place: async (_acct, _market, form) => {
      calls.push("place");
      forms.push(form);
      return script.placed ?? ok({ orderId: ORDER, status: "live", venueText: null });
    },
    openOrders: async () => {
      calls.push("orders");
      return script.orders;
    },
    cancel: async (_acct, _market, id) => {
      calls.push(`cancel ${id}`);
      return script.cancel ?? ok({ canceled: [id], notCanceled: [] });
    },
  });
  const routes = { xo: fake(xoRoute({} as never)), polymarket: fake(polymarketRoute({} as never, {} as never)), limitless: fake(xoRoute({} as never)) };
  const activations = { xo: activation("xo"), polymarket: activation("polymarket"), limitless: activation("limitless") };
  return {
    activations: [],
    balances: [],
    route: (venue) => routes[venue],
    activation: (venue) => activations[venue],
    fundPolymarket: async () => refuse("not_logged_in", "Activate Polymarket trading first: your Polymarket wallet does not exist yet."),
  };
}

const NO_ORDERS: DirectResult<DirectOpenOrders> = ok({ orders: [], more: false });

function field(container: HTMLElement, label: string): HTMLInputElement {
  const labels = [...container.querySelectorAll("label")].filter((entry) => allText(entry) === label);
  const id = labels[0]?.getAttribute("for");
  return must<HTMLInputElement>(container, `#${CSS.escape(id ?? "missing")}`);
}

function button(container: HTMLElement, action: string): HTMLButtonElement {
  return must<HTMLButtonElement>(container, `[data-action='${action}']`);
}

describe("before trading", () => {
  it("asks for the account first, with one action that opens its setup", async () => {
    let opened = 0;
    const calls: string[] = [];
    const { container } = render(<TradeTicket market={XO_MARKET} account={null} onSetupAccount={() => (opened += 1)} kit={kitOf({ status: { state: "ready" }, orders: NO_ORDERS }, calls)} />);
    expect(must(container, "[data-testid='trade-ticket']").getAttribute("data-state")).toBe("no-account");
    expect(allText(container)).toContain("Set up your account");
    click(button(container, "setup-account"));
    expect(opened).toBe(1);
    expect(calls).toEqual([]);
    // Without a setup to open the action is there but disabled; no placeholder words.
    cleanup();
    const bare = render(<TradeTicket market={XO_MARKET} account={null} onSetupAccount={null} kit={kitOf({ status: { state: "ready" }, orders: NO_ORDERS })} />);
    expect(button(bare.container, "setup-account").disabled).toBe(true);
  });

  it("lists the venue's steps, runs them on Activate trading with a progress list, then shows the ticket", async () => {
    const calls: string[] = [];
    const script: Script = { status: { state: "needs_activation", steps: ["Create your Polymarket wallet", "Sign in to Polymarket's order book"] }, orders: NO_ORDERS };
    const { container } = render(<TradeTicket market={PM_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf(script, calls)} />);
    await settle();
    expect(must(container, "[data-testid='trade-ticket']").getAttribute("data-state")).toBe("needs-activation");
    expect(allText(container)).toContain("Activate trading on Polymarket");
    expect(allText(container)).toContain("Create your Polymarket wallet");
    click(button(container, "activate"));
    await settle(10);
    expect(calls).toContain("activate");
    expect(must(container, "[data-testid='trade-ticket']").getAttribute("data-state")).toBe("ready");
  });

  it("says why a venue is not available, and why an activation failed, in words", async () => {
    const { container } = render(<TradeTicket market={PM_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf({ status: { state: "unavailable", reason: "Polymarket trading is not available in this build: it names no markets API to relay through." }, orders: NO_ORDERS })} />);
    await settle();
    expect(must(container, "[data-testid='trade-ticket']").getAttribute("data-state")).toBe("unavailable");
    expect(allText(container)).toContain("it names no markets API to relay through");
    cleanup();
    const failing = render(<TradeTicket market={PM_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf({ status: { state: "needs_activation", steps: ["Create your Polymarket wallet"] }, activated: refuse("venue_refused", "Polymarket's relayer did not accept creating your Polymarket wallet (HTTP 400)."), orders: NO_ORDERS })} />);
    await settle();
    click(button(failing.container, "activate"));
    await settle(10);
    expect(allText(failing.container)).toContain("Trading was not activated");
    expect(allText(failing.container)).toContain("did not accept creating your Polymarket wallet");
  });
});

describe("the ticket", () => {
  it("works out the summary with the venue's rules, places the order once and shows the answer; the venue is a detail", async () => {
    const calls: string[] = [];
    const forms: TicketForm[] = [];
    const { container } = render(<TradeTicket market={PM_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf({ status: { state: "ready" }, orders: NO_ORDERS }, calls, forms)} />);
    await settle();
    expect(button(container, "place-order").disabled).toBe(true);
    expect(allText(container)).toContain("Enter a price and a number of shares");
    click([...container.querySelectorAll("button")].find((entry) => allText(entry) === "No")!);
    typeInto(field(container, "Price per share"), "0.52");
    typeInto(field(container, "Shares"), "10");
    const summary = allText(must(container, "[data-ticket='summary']"));
    expect(summary).toContain("Buy 10 shares of No at 0.52");
    expect(summary).toMatch(/You pay\s*5.2 pUSD, at most 5.72 pUSD with fees/);
    expect(summary).toMatch(/Each share pays\s*1 pUSD if No wins/);
    expect(allText(must(container, "[data-ticket='venue']"))).toContain("Venue: Polymarket.");
    choose(must<HTMLSelectElement>(container, "select"), "FAK");
    expect(allText(must(container, "[data-ticket='summary']"))).toContain("Fill now");
    click(button(container, "place-order"));
    await settle(10);
    expect(calls.filter((call) => call === "place")).toHaveLength(1);
    expect(forms[0]).toEqual({ tokenId: NO, side: "BUY", price: "0.52", shares: "10", tif: "FAK" });
    expect(allText(container)).toContain("Order placed");
    expect(allText(container)).toContain(ORDER);
  });

  it("names what is wrong with the ticket, and shows a refusal with the venue's own words through the untrusted slot", async () => {
    const { container } = render(<TradeTicket market={XO_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf({ status: { state: "ready" }, placed: refuse("venue_refused", "XO did not accept the order (HTTP 400). Its answer is below.", "not enough balance"), orders: NO_ORDERS })} />);
    await settle();
    typeInto(field(container, "Price per share"), "1.5");
    typeInto(field(container, "Shares"), "10");
    expect(allText(must(container, "[aria-label='Problems with the ticket']"))).toContain("0.001 to 0.999");
    expect(button(container, "place-order").disabled).toBe(true);
    typeInto(field(container, "Price per share"), "0.42");
    // XO has one order type: no select.
    expect(container.querySelector("select")).toBeNull();
    click([...container.querySelectorAll("button")].find((entry) => allText(entry) === "Sell")!);
    expect(allText(must(container, "[data-ticket='summary']"))).toMatch(/You receive\s*4.2 USDC.e before fees, at least 3.78 USDC.e after/);
    click(button(container, "place-order"));
    await settle(10);
    expect(allText(container)).toContain("The order was not placed");
    expect(allText(container)).toContain("not enough balance");
  });

  it("lists the open orders on this market and cancels one", async () => {
    const calls: string[] = [];
    const script: Script = { status: { state: "ready" }, orders: ok({ orders: [{ id: ORDER, side: "BUY", price: "0.52", originalSize: "10", sizeMatched: "4", tokenId: YES, maker: null, status: "live", outcome: null }], more: false }) };
    const { container } = render(<TradeTicket market={PM_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf(script, calls)} />);
    await settle();
    const row = must(container, `[data-order-id='${ORDER}']`);
    expect(allText(row)).toContain("Buy 10 at 0.52, 4 filled");
    click(must(row, "[data-action='cancel-order']"));
    await settle(10);
    expect(calls).toContain(`cancel ${ORDER}`);
    expect(allText(must(container, `[data-order-id='${ORDER}']`))).toContain("cancelled");
    expect(calls.filter((call) => call === "orders").length).toBeGreaterThanOrEqual(2);
  });

  it("offers moving USDC from Base for a Polymarket market only, and shows why it did not happen", async () => {
    const pm = render(<TradeTicket market={PM_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf({ status: { state: "ready" }, orders: NO_ORDERS })} />);
    await settle();
    typeInto(field(pm.container, "USDC to move"), "5");
    click(button(pm.container, "fund-polymarket"));
    await settle(10);
    expect(allText(must(pm.container, "[data-ticket='fund-refused']"))).toContain("Activate Polymarket trading first");
    cleanup();
    const xo = render(<TradeTicket market={XO_MARKET} account={ACCOUNT} onSetupAccount={null} kit={kitOf({ status: { state: "ready" }, orders: NO_ORDERS })} />);
    await settle();
    expect(xo.container.querySelector("[data-action='fund-polymarket']")).toBeNull();
  });
});
