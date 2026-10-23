import { useCallback, useState } from "react";

import type { AddressBinding } from "../../core/bindings";
import { untrustedField } from "../../core/untrusted";
import { Num, UntrustedText, useRegisterConnectAction } from "../../ui";
import { chainName } from "./connect/chains";
import { shortAddress } from "./connect/ConnectTabs";
import { useWalletConnection } from "./connect/WalletConnectionProvider";
import { ConnectDialog } from "./ConnectDialog";
import { useBindingsState } from "./services";

// The wallet chip in the top bar (docs/design/cockpit-v2 Main). With a wallet connected it shows the short address in
// mono, the wallet's name (untrusted text, in its own slot, never in the button's label) and the chain, with a
// Disconnect button beside it. Otherwise it shows the watched address, or the words "Connect a wallet". It owns the
// Connect modal and registers the way to open it with the shell (ui/context useRegisterConnectAction), so a panel
// elsewhere on the page (the Holdings view's empty tiles) can open the same modal. A watched address is one the
// person saved on this machine (core/bindings.ts), drawn from the address itself, never from the saved label.

export { shortAddress };

export const WATCH_LABEL = "Connect a wallet";

// The address the chip shows when no wallet is connected: the first saved binding that has one. Null when nothing is
// watched.
export function watchedAddress(bindings: readonly AddressBinding[]): string | null {
  for (const binding of bindings) if (binding.address !== null) return binding.address;
  return null;
}

function ChipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true" focusable="false">
      <path d="M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2" />
    </svg>
  );
}

export function WalletChip() {
  const state = useBindingsState();
  const connection = useWalletConnection();
  const [open, setOpen] = useState(false);
  const openConnect = useCallback(() => setOpen(true), []);
  useRegisterConnectAction(openConnect);
  const signer = connection.signer;
  const watched = watchedAddress(state.bindings);
  const chain = connection.chainId === null ? null : chainName(connection.chainId);

  const chip =
    signer !== null ? (
      <button
        type="button"
        className="ui-wallet-chip"
        data-watched="none"
        data-connected={signer.kind}
        data-status={state.status}
        aria-haspopup="dialog"
        aria-label={`Connected wallet ${shortAddress(signer.address)}${chain === null ? "" : ` on ${chain}`}: open the connect options`}
        onClick={openConnect}
      >
        <ChipIcon />
        <Num>{shortAddress(signer.address)}</Num>
        <span className="ui-wallet-name">
          <UntrustedText value={untrustedField("generic", signer.name)} maxChars={24} />
        </span>
        {chain === null ? null : <span className="ui-wallet-chain">{chain}</span>}
      </button>
    ) : (
      <button
        type="button"
        className="ui-wallet-chip"
        data-watched={watched === null ? "none" : "address"}
        data-status={state.status}
        aria-haspopup="dialog"
        aria-label={watched === null ? `${WATCH_LABEL}: open the connect options` : `Watching ${shortAddress(watched)}: open the connect options`}
        onClick={openConnect}
      >
        <ChipIcon />
        {watched === null ? <span>{WATCH_LABEL}</span> : <Num>{shortAddress(watched)}</Num>}
      </button>
    );

  // One tree shape whether or not a wallet is connected, so the open modal stays mounted when a connection lands.
  return (
    <>
      <span className="ui-wallet-group">
        {chip}
        {signer === null ? null : (
          <button type="button" className="ui-wallet-disconnect" onClick={() => void connection.disconnect()} data-action="chip-disconnect">
            Disconnect
          </button>
        )}
      </span>
      <ConnectDialog open={open} onClose={() => setOpen(false)} state={state} />
    </>
  );
}
