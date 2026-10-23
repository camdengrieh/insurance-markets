import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { Button, Dialog } from "../../ui";
import { BrowserWalletTab, ConnectedPanel, WalletConnectTab } from "./connect/ConnectTabs";
import { useWalletConnection } from "./connect/WalletConnectionProvider";
import type { BindingsState } from "./services";
import { WalletView } from "./WalletView";
import "./wallet.css";

// The Connect modal (docs/design/cockpit-v2 Connect; the PayBox facts are docs/dapp-paybox-web.md section 0). Three
// tabs: a browser wallet found through EIP-6963, WalletConnect (PayBox and phone wallets, route F), or just watch an
// address. The connection itself lives in connect/ (WalletConnectionProvider); this file only lays it out. When a
// wallet is connected, its panel sits above the tabs with "Save this address" and Disconnect. Watching an address
// still works through the wallet panels (WalletView: saved addresses, and under a disclosure the account map,
// balances and funding steps); there is no Wallet page. Layout per the board: outlined tabs over a 2 px rule, each
// route in two columns, and one bordered footer row with the sentence on the left and Not now on the right.

export type ConnectTab = "browser" | "walletconnect" | "watch";

export const CONNECT_TABS: ReadonlyArray<{ readonly id: ConnectTab; readonly label: string }> = [
  { id: "browser", label: "Browser wallet" },
  { id: "walletconnect", label: "WalletConnect (PayBox, phone wallets)" },
  { id: "watch", label: "Just watch an address" },
];

export const DIALOG_TITLE = "Connect a wallet";
export const DIALOG_LEDE =
  "Your wallet keeps the keys. This page only asks it to sign, and your wallet shows you each request before anything happens. Watching an address needs no wallet at all.";
export const FOOTER_TEXT = "Connecting lets this page ask your wallet for signatures. Nothing is signed or sent until you approve it in the wallet.";

// Browser wallet when one was found, else WalletConnect.
export function defaultTab(walletsFound: number): ConnectTab {
  return walletsFound > 0 ? "browser" : "walletconnect";
}

function WatchTab({ state }: { readonly state: BindingsState }) {
  return (
    <div className="ui-stack">
      <p>
        Paste an address to see its positions and books across venues. Positions are public by address on XO, Polymarket, Limitless, Trueo and Pascal, so this needs no key and no wallet connection.
      </p>
      <p className="pf-note">Checked for EIP-55 and look-alike characters before any request. Bindings stay on this machine.</p>
      <WalletView state={state} heading="h3" />
    </div>
  );
}

export interface ConnectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: BindingsState;
}

export function ConnectDialog({ open, onClose, state }: ConnectDialogProps) {
  const connection = useWalletConnection();
  const found = connection.wallets.length;
  const [chosen, setChosen] = useState<ConnectTab | null>(null);
  const tab = chosen ?? defaultTab(found);
  const baseId = useId();

  // Each opening starts from the default tab, which follows what discovery found.
  useEffect(() => {
    if (!open) setChosen(null);
  }, [open]);

  // Arrow keys move between tabs; Home and End jump to the ends. A tab is selected when it is focused.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = CONNECT_TABS.findIndex((entry) => entry.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % CONNECT_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + CONNECT_TABS.length) % CONNECT_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = CONNECT_TABS.length - 1;
    else return;
    event.preventDefault();
    const target = CONNECT_TABS[next];
    if (target === undefined) return;
    setChosen(target.id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <Dialog open={open} title={DIALOG_TITLE} lede={DIALOG_LEDE} onClose={onClose} size="medium">
      <ConnectedPanel state={state} />
      <div className="wl-tabs" role="tablist" aria-label="Ways to connect" onKeyDown={onKeyDown}>
        {CONNECT_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${entry.id}`}
            className="wl-tab"
            aria-selected={tab === entry.id}
            aria-controls={`${baseId}-panel-${entry.id}`}
            tabIndex={tab === entry.id ? 0 : -1}
            onClick={() => setChosen(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {CONNECT_TABS.map((entry) => (
        <div key={entry.id} role="tabpanel" id={`${baseId}-panel-${entry.id}`} aria-labelledby={`${baseId}-tab-${entry.id}`} className="wl-tab-panel" hidden={tab !== entry.id} tabIndex={0}>
          {tab !== entry.id ? null : entry.id === "browser" ? <BrowserWalletTab /> : entry.id === "walletconnect" ? <WalletConnectTab /> : <WatchTab state={state} />}
        </div>
      ))}
      <div className="wl-connect-footer">
        <p>{FOOTER_TEXT}</p>
        <Button onClick={onClose} data-action="not-now">
          {connection.signer === null ? "Not now" : "Close"}
        </Button>
      </div>
    </Dialog>
  );
}
