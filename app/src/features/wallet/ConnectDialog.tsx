import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button, Dialog, Num, Tile } from "../../ui";
import type { BindingsState } from "./services";
import { WalletView } from "./WalletView";

// The Connect modal (docs/design/cockpit-v2 Connect; the facts are docs/dapp-paybox-web.md section 0). Three
// tabs: pair with PayBox over WalletConnect (route F), sign in with PayBox through one function (route B1), or
// just watch an address. No connection is made in this build: the first two tabs explain their route, name its
// cautions and have their one button disabled with the reason in its label; the only working action is watching
// an address, through the wallet panels (WalletView: saved addresses, and under a disclosure the account map,
// balances and funding steps). There is no Wallet page: this tab is where an address is watched. Nothing here
// names a PayBox host, holds a key or makes a request. Layout per the board: outlined tabs over a 2 px rule, each
// route in two columns, and one bordered footer row with the sentence on the left and Not now on the right.

export type ConnectTab = "pair" | "signin" | "watch";

export const CONNECT_TABS: ReadonlyArray<{ readonly id: ConnectTab; readonly label: string }> = [
  { id: "pair", label: "Pair with PayBox (WalletConnect)" },
  { id: "signin", label: "Sign in with PayBox (one function on this site)" },
  { id: "watch", label: "Just watch an address" },
];

// The working tab is the one shown first.
const DEFAULT_TAB: ConnectTab = "watch";

export const NOT_BUILT = "not built in this build";
export const DIALOG_TITLE = "Use your PayBox wallet here";
export const DIALOG_LEDE =
  "PayBox keeps the keys. This page only ever asks it to sign, and shows you each request first. Neither route has completed a signature for this project yet, and this build connects neither: the two tabs explain them. Watching an address works.";
export const FOOTER_TEXT = "Connecting changes nothing about what this page can send. Every write is still a Signature Card you approve.";

// Route F, read first-hand in PayBox's web bundle on 2026-10-20 and never run (dapp-paybox-web.md 0, item 1).
const PAIR_FACTS: ReadonlyArray<{ readonly label: string; readonly value: ReactNode }> = [
  { label: "Signs", value: "text messages and EIP-712 typed data" },
  {
    label: "Chains",
    value: (
      <Num>
        {["1", "10", "56", "137", "999", "4663", "5042", "8453", "42161", "43114"].join(" ")}
      </Num>
    ),
  },
  {
    label: "Cannot",
    value: (
      <>
        raw digests, transactions, anything on chain <Num>3223</Num> (XO)
      </>
    ),
  },
  { label: "Author runs", value: "nothing; one relay project id registered once" },
  { label: "Gives this page", value: "your address, a signed proof you control it, a signing layer for the day a write path exists" },
];

// Route B1, a decision record dated 2026-10-20; nothing built or run (dapp-paybox-web.md 0, item 2).
const SIGNIN_FACTS: ReadonlyArray<{ readonly label: string; readonly value: ReactNode }> = [
  {
    label: "Signs",
    value: (
      <>
        whatever PayBox&apos;s API accepts, raw digests and chain <Num>3223</Num> included, if PayBox honours our requests
      </>
    ),
  },
  { label: "Biggest unknown", value: "whether PayBox's approve page completes a request made by a client that is not PayBox's own app" },
  { label: "Author runs", value: "one function, one sealing secret, a kill switch, incident duty" },
  { label: "Never", value: "holds a key or a passkey, stores a token, proxies a venue" },
];

// One route as two columns (Connect.dc.html): the steps, the button and the caution on the left, the panel-filled
// "What this route can do" on the right. One column below 680 px.
function Route({ children, facts }: { readonly children: ReactNode; readonly facts: ReactNode }) {
  return (
    <div className="wl-route">
      <div className="wl-route-steps">{children}</div>
      {facts}
    </div>
  );
}

function Facts({ title, rows, source }: { readonly title: string; readonly rows: ReadonlyArray<{ readonly label: string; readonly value: ReactNode }>; readonly source: string }) {
  return (
    <section className="wl-route-facts">
      <h3>{title}</h3>
      <dl className="wl-facts">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="pf-note">{source}</p>
    </section>
  );
}

function PairTab() {
  return (
    <Route facts={<Facts title="What this route can do" rows={PAIR_FACTS} source="Read first-hand in PayBox's web bundle on 2026-10-20; never run." />}>
      <ol className="wl-steps-list">
        <li>Copy the pairing link below.</li>
        <li>Open PayBox&apos;s WalletConnect page in the tab where you are signed in to PayBox and paste it.</li>
        <li>Approve once. Keep that PayBox tab open while you use this page.</li>
      </ol>
      <p className="pf-note" data-kind="pairing-link">
        Pairing link: none. This build holds no WalletConnect client, so it mints no link.
      </p>
      <div>
        <Button variant="primary" disabled aria-disabled="true" data-action="pair-start">
          Start: {NOT_BUILT}
        </Button>
      </div>
      <Tile tone="warn" title="An autonomous grant" heading="h3" role="note" dataKind="connect-caution" dataCode="pair">
        <p>
          PayBox creates this session as an autonomous grant and says it will sign without asking again. While your PayBox tab is open, a compromised page could request typed-data signatures with no prompt. Pair from a dedicated PayBox credential.
        </p>
      </Tile>
    </Route>
  );
}

function SignInTab() {
  return (
    <Route facts={<Facts title="What this route can do" rows={SIGNIN_FACTS} source="Decision record dated 2026-10-20; nothing built or run." />}>
      <ol className="wl-steps-list">
        <li>Sign in with PayBox. One small function on this site would run the sign-in and keep a 60-minute token in a sealed cookie; nothing is stored.</li>
        <li>Each signature request would open PayBox&apos;s own approve page in a new tab.</li>
        <li>Approve there; the result comes back here and is checked against the intent tag.</li>
      </ol>
      <div>
        <Button variant="primary" disabled aria-disabled="true" data-action="signin-start">
          Sign in with PayBox: {NOT_BUILT}
        </Button>
      </div>
      <Tile tone="warn" title="What the function would see" heading="h3" role="note" dataKind="connect-caution" dataCode="signin">
        <p>
          The function sees your PayBox token in memory for the length of a request. If this deploy were compromised it could raise approval prompts in your PayBox app. It cannot sign alone. A public kill switch would be part of it.
        </p>
      </Tile>
    </Route>
  );
}

function WatchTab({ state }: { readonly state: BindingsState }) {
  return (
    <div className="ui-stack">
      <p>
        Paste an address to see its positions and books across venues. Positions are public by address on XO, Polymarket, Limitless, Trueo and Pascal, so this needs no key and no PayBox connection.
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
  const [tab, setTab] = useState<ConnectTab>(DEFAULT_TAB);
  const baseId = useId();

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
    setTab(target.id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <Dialog open={open} title={DIALOG_TITLE} lede={DIALOG_LEDE} onClose={onClose} size="medium">
      <div className="wl-tabs" role="tablist" aria-label="Ways to use PayBox here" onKeyDown={onKeyDown}>
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
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {CONNECT_TABS.map((entry) => (
        <div key={entry.id} role="tabpanel" id={`${baseId}-panel-${entry.id}`} aria-labelledby={`${baseId}-tab-${entry.id}`} className="wl-tab-panel" hidden={tab !== entry.id} tabIndex={0}>
          {entry.id === "pair" ? <PairTab /> : entry.id === "signin" ? <SignInTab /> : <WatchTab state={state} />}
        </div>
      ))}
      <div className="wl-connect-footer">
        <p>{FOOTER_TEXT}</p>
        <Button onClick={onClose} data-action="not-now">
          Not now
        </Button>
      </div>
    </Dialog>
  );
}
