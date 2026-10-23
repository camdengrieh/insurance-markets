// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";

import { deriveAccount } from "@sdk/trade/xo/account/derive";

import type { AdapterDeps } from "../../../../core/ports";
import { SignerProvider } from "../../../wallet/connect/context";
import { act, allText, cleanup, click, must, render, settle } from "../../../../ui/testing/dom";
import type { XoReadiness } from "./readiness";
import { CREDENTIAL, fakeRelay, fakeSigner, fixedRandom, memoryStorage, RELAY_ORIGIN, TOKEN_ID, type FakeSigner } from "./testkit";
import { PAYBOX_CHAIN_WORDS } from "./trader";
import { NOT_AVAILABLE_TEXT, XoTradePanel } from "./XoTradePanel";

// The panel's states: no relay in this build, no wallet, a session that cannot sign on 3223, the readiness lines, and the
// login with the Signature Card shown BEFORE the wallet is asked and XO's answer after.

afterEach(cleanup);

const deps: AdapterDeps = {
  fetch: async () => {
    throw new Error("no chain reads in these tests");
  },
  nowMs: () => 0,
};

function readiness(overrides: Partial<XoReadiness> = {}) {
  return async (_relay: unknown, owner: Address, account: Address): Promise<XoReadiness> => ({ owner, account, deployed: "yes", registered: true, usdcMicro: 25_000_000n, allowanceMicro: 10n ** 30n, sellApproved: true, ...overrides });
}

// WebCrypto and the fake relay resolve on real tasks, not only microtasks: wait for the DOM, at most 2 s.
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  expect(check()).toBe(true);
}

function button(container: HTMLElement, action: string): HTMLButtonElement {
  return must<HTMLButtonElement>(container, `button[data-action=${action}]`);
}

describe("why the panel cannot trade", () => {
  it("says XO trading is not available in this build while the relay origin is null, and sends nothing", () => {
    const fetchImpl = vi.fn();
    const { container } = render(<XoTradePanel deps={deps} relayOrigin={null} signer={fakeSigner()} fetchImpl={fetchImpl} />);
    expect(must(container, "[data-testid=xo-direct]").getAttribute("data-state")).toBe("unavailable");
    expect(allText(container)).toContain(NOT_AVAILABLE_TEXT);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks for a wallet when none is connected (read from the shared signer context)", () => {
    const { container } = render(
      <SignerProvider signer={null}>
        <XoTradePanel deps={deps} relayOrigin={RELAY_ORIGIN} fetchImpl={fakeRelay().fetch} />
      </SignerProvider>,
    );
    expect(must(container, "[data-testid=xo-direct]").getAttribute("data-state")).toBe("no-wallet");
    expect(allText(container)).toContain("Connect a wallet to trade on XO");
  });

  it("refuses a PayBox (WalletConnect) session without chain 3223 in plain words", () => {
    const relay = fakeRelay();
    const signer = fakeSigner({ kind: "walletconnect", chains: [8453] });
    const { container } = render(
      <SignerProvider signer={signer}>
        <XoTradePanel deps={deps} relayOrigin={RELAY_ORIGIN} fetchImpl={relay.fetch} />
      </SignerProvider>,
    );
    expect(must(container, "[data-testid=xo-direct]").getAttribute("data-state")).toBe("chain-unsupported");
    expect(allText(container)).toContain(PAYBOX_CHAIN_WORDS);
    expect(relay.calls).toEqual([]);
    expect(signer.calls).toEqual([]);
  });
});

describe("the account and the login", () => {
  async function mount(signer: FakeSigner, options: { readonly overrides?: Partial<XoReadiness>; readonly routes?: Parameters<typeof fakeRelay>[0]; readonly storage?: ReturnType<typeof memoryStorage> } = {}) {
    const relay = fakeRelay(options.routes);
    const storage = options.storage ?? memoryStorage();
    const view = render(<XoTradePanel deps={deps} relayOrigin={RELAY_ORIGIN} signer={signer} fetchImpl={relay.fetch} storage={storage} random={fixedRandom} readReadiness={readiness(options.overrides)} outcome={{ tokenId: TOKEN_ID, label: "Yes" }} />);
    await act(async () => {
      await settle();
    });
    return { ...view, relay, storage };
  }

  it("states an undeployed account and why this page cannot deploy it, with the login off", async () => {
    const { container } = await mount(fakeSigner(), { overrides: { deployed: "no", registered: false, allowanceMicro: 0n, sellApproved: false, usdcMicro: 0n } });
    const text = allText(must(container, "[data-testid=xo-readiness]"));
    expect(text).toContain("is not deployed on XO's chain yet");
    expect(text).toContain("signed over its 32-byte hash");
    expect(text).toContain("XO's own app");
    expect(button(container, "login").disabled).toBe(true);
  });

  it("shows the Signature Card before the wallet is asked, then XO's answer, and keeps the credential in this tab", async () => {
    const signer = fakeSigner({ startChain: 3223 });
    const { container, relay, storage } = await mount(signer, { routes: { "GET /auth/derive-api-key": () => ({ status: 404, body: { error: "no key" } }), "POST /auth/api-key": () => ({ body: CREDENTIAL }) } });
    expect(allText(container)).toContain(deriveAccount(signer.address));
    expect(button(container, "login").disabled).toBe(false);
    await act(async () => {
      click(button(container, "login"));
      await settle();
    });
    const card = must(container, "[data-testid=xo-signature-card]");
    expect(card.getAttribute("data-kind")).toBe("login");
    expect(allText(card)).toContain("Kernel 0.3.1, chain 3223");
    expect(signer.calls.some((call) => call.method === "signTypedData")).toBe(false);
    expect(relay.calls.map((call) => call.path)).toEqual(["/time"]);
    await act(async () => {
      click(button(container, "sign"));
      await settle(10);
    });
    expect(signer.calls.filter((call) => call.method === "signTypedData")).toHaveLength(1);
    expect(container.querySelector("[data-testid=xo-signature-card]")).toBeNull();
    const answer = must(container, "[data-testid=xo-answer]");
    expect(answer.getAttribute("data-state")).toBe("done");
    expect(allText(answer)).toContain("XO created an API credential");
    expect(allText(answer)).toContain("HTTP 200 from XO (through the relay)");
    expect(allText(container)).not.toContain(CREDENTIAL.secret);
    expect(container.querySelector("[data-testid=xo-answer-body]")).toBeNull();
    expect(must(container, "[data-testid=xo-login]").getAttribute("data-logged-in")).toBe("true");
    expect(storage.items.size).toBe(1);
  });

  it("Do not sign sends nothing and says so", async () => {
    const signer = fakeSigner({ startChain: 3223 });
    const { container, relay } = await mount(signer);
    await act(async () => {
      click(button(container, "login"));
      await settle();
    });
    await act(async () => {
      click(button(container, "decline"));
      await settle();
    });
    expect(must(container, "[data-testid=xo-answer]").getAttribute("data-state")).toBe("declined");
    expect(signer.calls.some((call) => call.method === "signTypedData")).toBe(false);
    expect(relay.calls.map((call) => call.path)).toEqual(["/time"]);
  });

  it("keeps the order button off until a side, a price and shares are chosen, and never prefills them", async () => {
    const storage = memoryStorage();
    const signer = fakeSigner({ startChain: 3223 });
    storage.setItem(`xo-l2:${signer.address.toLowerCase()}:${deriveAccount(signer.address).toLowerCase()}`, JSON.stringify(CREDENTIAL));
    const { container } = await mount(signer, { storage });
    expect(must(container, "[data-testid=xo-login]").getAttribute("data-logged-in")).toBe("true");
    const ticket = must(container, "[data-testid=xo-ticket]");
    for (const input of ticket.querySelectorAll("input.ui-input")) expect((input as HTMLInputElement).value).toBe("");
    for (const radio of ticket.querySelectorAll("input[type=radio]")) expect((radio as HTMLInputElement).checked).toBe(false);
    expect(button(container, "review-order").disabled).toBe(true);
  });

  it("places an order: the card first, the wallet second, XO's answer and the open orders after; then a cancel without the wallet", async () => {
    const storage = memoryStorage();
    const signer = fakeSigner({ startChain: 3223 });
    storage.setItem(`xo-l2:${signer.address.toLowerCase()}:${deriveAccount(signer.address).toLowerCase()}`, JSON.stringify(CREDENTIAL));
    const hash = `0x${"9a".repeat(32)}`;
    let cancelled = false;
    const { container, relay } = await mount(signer, {
      storage,
      routes: {
        "GET /book": () => ({ body: { tick_size: "0.001", min_order_size: "5", asks: [{ price: "0.43", size: "10" }], bids: [] } }),
        "POST /order": () => ({ body: { success: true, orderID: hash, status: "live" } }),
        "GET /orders": () => ({ body: cancelled ? [] : [{ order_hash: hash, side: "BUY", price: "0.42", original_size: "10", size_matched: "0", status: "LIVE" }] }),
        "DELETE /order": () => ((cancelled = true), { body: { canceled: [hash], notCanceled: {} } }),
      },
    });
    const ticket = must(container, "[data-testid=xo-ticket]");
    act(() => {
      click(must(ticket, "input[type=radio][value=BUY]"));
    });
    const [priceInput, sharesInput] = [...ticket.querySelectorAll<HTMLInputElement>("input.ui-input")];
    for (const [input, value] of [[priceInput, "0.42"], [sharesInput, "10"]] as const) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setter?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(button(container, "review-order").disabled).toBe(false);
    await act(async () => {
      click(button(container, "review-order"));
      await settle(10);
    });
    const card = must(container, "[data-testid=xo-signature-card]");
    expect(card.getAttribute("data-kind")).toBe("order");
    expect(allText(card)).toContain("Buy 10 shares at 0.42 on XO");
    expect(allText(card)).toContain("Best ask on XO's book when this card was built");
    expect(signer.calls.some((call) => call.method === "signTypedData")).toBe(false);
    expect(relay.calls.some((call) => call.method === "POST")).toBe(false);
    act(() => {
      click(button(container, "sign"));
    });
    await until(() => container.querySelector("[data-testid=xo-answer]") !== null && container.querySelector("[data-testid=xo-orders]") !== null);
    const answer = must(container, "[data-testid=xo-answer]");
    expect(answer.getAttribute("data-state")).toBe("done");
    expect(allText(answer)).toContain("XO accepted the order");
    expect(allText(must(container, "[data-testid=xo-answer-body]"))).toContain(hash);
    const row = must(container, `[data-testid=xo-orders] tr[data-hash="${hash}"]`);
    const signaturesBefore = signer.calls.filter((call) => call.method === "signTypedData").length;
    act(() => {
      click(must<HTMLButtonElement>(row, "button[data-action=cancel-order]"));
    });
    await until(() => allText(container).includes("XO cancelled the order"));
    expect(signer.calls.filter((call) => call.method === "signTypedData")).toHaveLength(signaturesBefore);
    expect(allText(container)).toContain("No open orders on XO for this account.");
  });
});
