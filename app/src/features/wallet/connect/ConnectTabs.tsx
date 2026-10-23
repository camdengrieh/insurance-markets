import { useState, type ReactNode } from "react";

import { EXTERNAL_LINK_REL, untrustedField } from "../../../core/untrusted";
import { payboxPairingUrl } from "../../../core/walletconnect";
import { Badge, Button, Num, Tile, UntrustedText } from "../../../ui";
import type { BindingsState } from "../services";
import { chainName } from "./chains";
import type { DiscoveredWallet } from "./eip6963";
import { PairingQr } from "./PairingQr";
import { saveSignedAddress } from "./proof";
import { useWalletConnection } from "./WalletConnectionProvider";

// The two connect tabs of the Connect modal and the connected-wallet panel above them (ConnectDialog.tsx lays them
// out). A wallet's name is untrusted text: it is rendered only through UntrustedText, never into an attribute; its
// icon only through <img> and only when it is a data: image (eip6963.ts safeWalletIcon).

// Wallets the empty state names, so a visitor without one knows what to look for. Fixed app text.
export const WALLET_EXAMPLES = "MetaMask, Rabby, Coinbase Wallet or Rainbow";

export function shortAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function WalletName({ text }: { readonly text: string }) {
  return <UntrustedText value={untrustedField("generic", text)} maxChars={40} />;
}

// ---- Browser wallet -------------------------------------------------------------------------------------------------------

function WalletRow({ wallet, busy, disabled, onPick }: { readonly wallet: DiscoveredWallet; readonly busy: boolean; readonly disabled: boolean; readonly onPick: () => void }) {
  return (
    <li className="wl-wallet">
      <Button onClick={onPick} busy={busy} disabled={disabled} data-action="connect-injected" data-wallet={wallet.via === "eip6963" ? "eip6963" : "fallback"}>
        {wallet.icon === null ? <span className="wl-wallet-icon" aria-hidden="true" /> : <img className="wl-wallet-icon" src={wallet.icon} alt="" width={24} height={24} decoding="async" />}
        <UntrustedText value={wallet.name} maxChars={40} />
      </Button>
    </li>
  );
}

export function BrowserWalletTab() {
  const connection = useWalletConnection();
  const { wallets, discovering, phase, signer, error } = connection;
  const pending = phase.kind === "connecting" ? phase.walletId : null;
  const connected = signer !== null;
  return (
    <div className="ui-stack" data-kind="browser-wallets">
      <p>Connect a wallet extension installed in this browser. It asks you to approve the connection, and again for every signature or transaction.</p>
      {wallets.length === 0 ? (
        discovering ? (
          <p role="status">Looking for wallets in this browser.</p>
        ) : (
          <Tile tone="neutral" title="No browser wallet was found" heading="h3" dataKind="no-wallet">
            <p>
              Nothing in this browser announced itself as a wallet. Install an extension such as {WALLET_EXAMPLES}, then reload this page. On a phone, or with PayBox, use the WalletConnect tab.
            </p>
          </Tile>
        )
      ) : (
        <ul className="wl-wallets" aria-label="Wallets found in this browser">
          {wallets.map((wallet) => (
            <WalletRow key={wallet.id} wallet={wallet} busy={pending === wallet.id} disabled={connected || (pending !== null && pending !== wallet.id)} onPick={() => void connection.connectInjected(wallet.id)} />
          ))}
        </ul>
      )}
      {connected ? <p className="pf-note">A wallet is connected. Disconnect it first to connect another.</p> : null}
      {pending !== null ? (
        <p role="status" className="pf-note">
          Approve the connection in your wallet&apos;s window.
        </p>
      ) : null}
      {error !== null && error.via === "injected" ? (
        <Tile tone={error.code === "rejected" ? "neutral" : "warn"} title={error.code === "rejected" ? "Not connected" : "The wallet did not connect"} heading="h3" role="alert" dataKind="connect-error" dataCode={error.code}>
          <p>{error.message}</p>
        </Tile>
      ) : null}
    </div>
  );
}

// ---- WalletConnect --------------------------------------------------------------------------------------------------------

// What PayBox over WalletConnect does (dapp-paybox-web.md 0 and 1.1 F, read in PayBox's web bundle on 2026-10-20).
const PAYBOX_FACTS: ReadonlyArray<{ readonly label: string; readonly value: ReactNode }> = [
  { label: "PayBox signs", value: "text messages and EIP-712 typed data" },
  { label: "PayBox chains", value: <Num>{["1", "10", "56", "137", "999", "4663", "5042", "8453", "42161", "43114"].join(" ")}</Num> },
  {
    label: "PayBox cannot",
    value: (
      <>
        send transactions, or sign anything on chain <Num>3223</Num> (XO)
      </>
    ),
  },
  { label: "Phone wallets", value: "whatever they approve when you pair; this page shows it once connected" },
  { label: "This page asks for", value: "signing text and typed data, sending transactions and switching chains, on Polygon, Base, XO and Ethereum; every item optional" },
];

type CopyState = "idle" | "copied" | "failed";
const COPY_IDLE: CopyState = "idle";

function CopyLink({ uri }: { readonly uri: string }) {
  const [copied, setCopied] = useState<CopyState>(COPY_IDLE);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <>
      <Button onClick={() => void copy()} data-action="copy-pairing-link">
        Copy pairing link
      </Button>
      {copied === "idle" ? null : (
        <span role="status" className="pf-note">
          {copied === "copied" ? "Copied." : "This browser did not allow copying; select the link above instead."}
        </span>
      )}
    </>
  );
}

export function WalletConnectTab() {
  const connection = useWalletConnection();
  const { phase, signer, error, walletConnect } = connection;
  const pairing = phase.kind === "pairing" ? phase : null;
  const restoring = phase.kind === "restoring" && phase.via === "walletconnect";
  const startLabel = walletConnect.status === "ready" ? (signer !== null ? "Start WalletConnect: disconnect the connected wallet first" : "Start WalletConnect") : walletConnect.status === "not_configured" ? walletConnect.reason : "WalletConnect is off in this build";
  return (
    <div className="wl-route" data-kind="walletconnect">
      <div className="wl-route-steps">
        <ol className="wl-steps-list">
          <li>Start WalletConnect. This page makes a one-time pairing link.</li>
          <li>Phone wallet: scan the code. PayBox: open the link in PayBox (or paste it on PayBox&apos;s WalletConnect page), in the tab where you are signed in.</li>
          <li>Approve in the wallet. With PayBox, keep that PayBox tab open while you use this page.</li>
        </ol>
        {walletConnect.status !== "ready" ? (
          <p className="pf-note" data-kind="walletconnect-unavailable">
            {walletConnect.status === "not_configured" ? `${walletConnect.reason}: it has no WalletConnect project id, so it cannot reach the relay.` : walletConnect.reason}
          </p>
        ) : null}
        {pairing === null ? (
          <div>
            <Button variant="primary" onClick={() => void connection.startWalletConnect()} disabled={walletConnect.status !== "ready" || signer !== null || restoring} data-action="walletconnect-start">
              {restoring ? "Restoring your earlier WalletConnect session" : startLabel}
            </Button>
          </div>
        ) : pairing.uri === null ? (
          <p role="status">Making a pairing link.</p>
        ) : (
          <div className="wl-pairing" data-kind="pairing">
            <PairingQr uri={pairing.uri} />
            <p className="pf-note">Pairing link (valid for a few minutes, for one wallet):</p>
            <code className="wl-pairing-link" data-kind="pairing-link">
              {pairing.uri}
            </code>
            <div className="wl-pairing-actions">
              <CopyLink uri={pairing.uri} />
              <a className="ui-button" data-variant="default" href={payboxPairingUrl(pairing.uri)} target="_blank" rel={EXTERNAL_LINK_REL} data-action="open-paybox">
                Open in PayBox (new tab)
              </a>
              <Button onClick={connection.cancelWalletConnect} data-action="walletconnect-cancel">
                Cancel
              </Button>
            </div>
            <p role="status" className="pf-note">
              Waiting for a wallet to approve.
            </p>
          </div>
        )}
        {error !== null && error.via === "walletconnect" ? (
          <Tile tone={error.code === "rejected" ? "neutral" : "warn"} title={error.code === "rejected" ? "Not connected" : "WalletConnect did not connect"} heading="h3" role="alert" dataKind="connect-error" dataCode={error.code}>
            <p>{error.message}</p>
          </Tile>
        ) : null}
        <Tile tone="warn" title="PayBox signs without asking again" heading="h3" role="note" dataKind="connect-caution" dataCode="pair">
          <p>
            PayBox creates this session as an autonomous grant and says it will sign without asking again. While your PayBox tab is open, a compromised page could request typed-data signatures with no prompt. Pair from a dedicated PayBox credential, and disconnect when you are done.
          </p>
        </Tile>
      </div>
      <section className="wl-route-facts">
        <h3>What WalletConnect can do here</h3>
        <dl className="wl-facts">
          {PAYBOX_FACTS.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="pf-note">PayBox facts read first-hand in PayBox&apos;s web bundle on 2026-10-20. The pairing travels through the WalletConnect relay, end-to-end encrypted; the session is kept in this browser.</p>
      </section>
    </div>
  );
}

// ---- the connected wallet ----------------------------------------------------------------------------------------------------

type SaveState = { readonly kind: "idle" } | { readonly kind: "busy" } | { readonly kind: "done"; readonly verified: boolean } | { readonly kind: "failed"; readonly message: string };

export function ConnectedPanel({ state }: { readonly state: BindingsState }) {
  const connection = useWalletConnection();
  const { signer, chainId } = connection;
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  if (signer === null) return null;
  const chains = signer.capabilities.chains;
  const store = state.store;

  async function onSave(): Promise<void> {
    if (signer === null || store === null) return;
    setSave({ kind: "busy" });
    const outcome = await saveSignedAddress(signer, store, { host: connection.host, origin: connection.origin, nowIso: new Date(connection.now()).toISOString() });
    if (outcome.ok) {
      setSave({ kind: "done", verified: outcome.verified });
      await state.refresh();
    } else {
      setSave({ kind: "failed", message: outcome.message });
    }
  }

  return (
    <section className="wl-connected" aria-labelledby="wl-connected-title" data-kind="connected" data-via={signer.kind}>
      <h3 id="wl-connected-title">Connected wallet</h3>
      <dl className="wl-facts">
        <div>
          <dt>Wallet</dt>
          <dd>
            <WalletName text={signer.name} /> <Badge tone="neutral">{signer.kind === "injected" ? "browser wallet" : "WalletConnect"}</Badge>
          </dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>
            <Num>{signer.address}</Num>
          </dd>
        </div>
        <div>
          <dt>Chain</dt>
          <dd>{chainId === null ? "not reported by the wallet" : <>{chainName(chainId)} (<Num>{String(chainId)}</Num>)</>}</dd>
        </div>
        <div>
          <dt>Can</dt>
          <dd>
            {signer.capabilities.sendTransaction ? "sign and send transactions" : "sign text and typed data; it does not send transactions"}
            {chains === "any" ? "; switch to any chain it knows" : <>; on {chains.map(chainName).join(", ")}</>}
          </dd>
        </div>
      </dl>
      <div className="wl-connected-actions">
        <Button onClick={() => void onSave()} busy={save.kind === "busy"} disabled={store === null} data-action="save-signed-address">
          {store === null ? "Save this address: the address book is still opening" : "Save this address"}
        </Button>
        <Button onClick={() => void connection.disconnect()} data-action="disconnect">
          Disconnect
        </Button>
      </div>
      <p className="pf-note">
        Saving asks your wallet to sign one short text that proves you control this address for this page. It signs nothing else, costs nothing and is kept only in this browser.
        {signer.kind === "injected" ? " Disconnecting forgets the wallet on this page; to revoke the page's access entirely, use your wallet's list of connected sites." : " Disconnecting ends the WalletConnect session for both sides."}
      </p>
      {save.kind === "done" ? (
        <p role="status" data-kind="save-result" data-verified={save.verified ? "true" : "false"}>
          {save.verified ? "Saved. The signature checks out for this address." : "Saved, marked unverified: the signature is not a plain key signature for this address, which is what a smart account gives. This page cannot check a smart account's signature without a chain read."}
        </p>
      ) : save.kind === "failed" ? (
        <p role="alert" data-kind="save-result">
          Not saved. {save.message}
        </p>
      ) : null}
    </section>
  );
}
