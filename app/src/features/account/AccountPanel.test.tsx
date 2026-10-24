// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { BASE_USDC } from "@sdk/chain/xo/constants";

import type { WalletSigner } from "../../core/signer";
import { ConnectActionProvider, ModeProvider, type AppMode } from "../../ui/context";
import { runAxe } from "../../ui/testing/axe";
import { act, allText, cleanup, click, must, render } from "../../ui/testing/dom";
import { SignerProvider } from "../wallet/connect/context";
import { eventually } from "../wallet/view-harness";
import { CHIP_LABEL, AccountChip } from "./AccountChip";
import { formatDollars, PANEL_TITLE } from "./AccountPanel";
import { TradingAccountProvider } from "./context";
import type { AccountServices } from "./services";
import { fakeChainCalls, fakePasskey, fakeServices, fakeWallet } from "./testkit";

// The account chip and panel in a DOM: the two ways in, the open account's address, balance and actions, the export
// gate, and the Cockpit build, where the account is not offered. Every service is a fake (no network, no WebAuthn).

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8")).call(window);
});

afterEach(cleanup);

function page(services: AccountServices, wallet: WalletSigner | null, mode: AppMode = "standalone"): ReactElement {
  return (
    <ModeProvider mode={mode}>
      <SignerProvider signer={wallet}>
        <ConnectActionProvider>
          <TradingAccountProvider services={services}>
            <AccountChip />
          </TradingAccountProvider>
        </ConnectActionProvider>
      </SignerProvider>
    </ModeProvider>
  );
}

function chip(container: HTMLElement): HTMLButtonElement {
  return must<HTMLButtonElement>(container, "button.ac-chip");
}

function dialog(): HTMLElement {
  return must<HTMLElement>(document.body, '[role="dialog"]');
}

function button(action: string): HTMLButtonElement {
  return must<HTMLButtonElement>(dialog(), `[data-action="${action}"]`);
}

const waitFor = (check: () => void) => eventually(check, act);

describe("the account chip and panel", () => {
  it("offers both ways in, and opens a passkey account with its address, balance and actions", async () => {
    const wallet = fakeWallet();
    const calls = fakeChainCalls({ 8453: { [BASE_USDC.toLowerCase()]: { name: "USD Coin", version: "2", balances: new Map() } } });
    const { container } = render(page(fakeServices({ calls }), wallet));
    expect(chip(container).textContent).toContain(CHIP_LABEL);
    click(chip(container));
    expect(dialog().textContent).toContain(PANEL_TITLE);
    await waitFor(() => expect(button("account-wallet").textContent).toMatch(/^Create with 0x/));
    expect(button("account-passkey-create").textContent).toBe("Create with passkey");
    await waitFor(() => expect(button("account-passkey-create").disabled).toBe(false));
    expect(await runAxe(dialog())).toEqual([]);

    click(button("account-passkey-create"));
    await waitFor(() => expect(allText(dialog())).toContain("Your account"));
    const text = allText(dialog());
    expect(text).toContain("a passkey");
    expect(text).toContain("an encrypted copy is saved on our server");
    expect(text).toContain("No market needs a setup step from this account yet.");
    expect(chip(container).dataset.account).toBe("open");
    await waitFor(() => expect(must(dialog(), '[data-kind="balance-total"]').textContent).toContain("$0.00"));
    // Base read, Polygon not: the total says it is incomplete rather than claiming zero.
    expect(must(dialog(), '[data-kind="balance-total"]').textContent).toContain("at least");
    // A passkey account is funded by whichever wallet is connected.
    expect(button("deposit").textContent).toBe("Deposit from your wallet");
    expect(await runAxe(dialog())).toEqual([]);
  });

  it("opens a derived account from the connected wallet, which then funds it", async () => {
    const wallet = fakeWallet();
    const { container } = render(page(fakeServices(), wallet));
    click(chip(container));
    await waitFor(() => expect(button("account-wallet").disabled).toBe(false));
    click(button("account-wallet"));
    await waitFor(() => expect(allText(dialog())).toContain("Your account"));
    expect(wallet.typedRequests).toHaveLength(2);
    expect(allText(dialog())).toContain("From your wallet");
    expect(button("deposit").textContent).toBe("Deposit from your wallet");
  });

  it("falls back to a passkey account, and says why, when the wallet cannot make one", async () => {
    const { container } = render(page(fakeServices(), fakeWallet({ mode: "other_key" })));
    click(chip(container));
    await waitFor(() => expect(button("account-wallet").disabled).toBe(false));
    click(button("account-wallet"));
    await waitFor(() => expect(must(dialog(), '[data-kind="account-error"]').textContent).toMatch(/smart-contract wallet/));
    click(button("account-passkey-fallback"));
    await waitFor(() => expect(allText(dialog())).toContain("Your account"));
    expect(allText(dialog())).toContain("a passkey");
    expect(document.querySelector('[data-kind="account-error"]')).toBeNull();
  });

  it("shows the key only after the explicit confirmation, and hides it again", async () => {
    const { container } = render(page(fakeServices(), null));
    click(chip(container));
    await waitFor(() => expect(button("account-passkey-create").disabled).toBe(false));
    click(button("account-passkey-create"));
    await waitFor(() => expect(allText(dialog())).toContain("Your account"));
    expect(button("export-show").disabled).toBe(true);
    expect(document.querySelector('[data-kind="exported-key"]')).toBeNull();
    const confirm = must<HTMLInputElement>(dialog(), ".ui-disclosure .ac-confirm input");
    act(() => confirm.click());
    expect(button("export-show").disabled).toBe(false);
    click(button("export-show"));
    expect(must(dialog(), '[data-kind="exported-key"]').textContent).toMatch(/^0x[0-9a-f]{64}$/);
    click(button("export-hide"));
    expect(document.querySelector('[data-kind="exported-key"]')).toBeNull();
    // Locking forgets the key.
    click(button("account-lock"));
    expect(chip(container).dataset.account).toBe("locked");
  });

  it("says plainly when this browser cannot make a passkey account, and offers Connect", async () => {
    const { container } = render(page(fakeServices({ passkey: fakePasskey({ support: "no" }) }), null));
    click(chip(container));
    await waitFor(() => expect(must(dialog(), '[data-kind="no-prf"]').textContent).toContain("This browser cannot create a trading account with a passkey"));
    expect(button("account-connect-instead").textContent).toBe("Connect a wallet");
    expect(dialog().querySelector('[data-action="account-passkey-create"]')).toBeNull();
  });

  it("is not offered in the Cockpit build", () => {
    const { container } = render(page(fakeServices({ unavailable: "not here" }), null, "cockpit"));
    expect(container.querySelector("button.ac-chip")).toBeNull();
  });
});

describe("formatDollars", () => {
  it("floors millionths to the cent with exact integers", () => {
    expect(formatDollars(0n)).toBe("$0.00");
    expect(formatDollars(12_345_678n)).toBe("$12.34");
    expect(formatDollars(1_234_567_890_000n)).toBe("$1,234,567.89");
  });
});
