import { useCallback, useState } from "react";

import type { AddressBinding } from "../../core/bindings";
import { Num, useRegisterConnectAction } from "../../ui";
import { ConnectDialog } from "./ConnectDialog";
import { useBindingsState } from "./services";

// The wallet chip in the top bar (docs/design/cockpit-v2 Main): the watched address in mono, shortened, or the
// words "Watch an address". It owns the Connect modal and registers the way to open it with the shell
// (ui/context useRegisterConnectAction), so a panel elsewhere on the page (the Holdings view's empty tiles) can
// open the same modal. The chip holds no key and makes no request; the address it shows is one the person saved on
// this machine (core/bindings.ts), and it is drawn from the address itself, never from the saved label.

export const WATCH_LABEL = "Watch an address";

// "0x5bb8…52a7": the first six and the last four characters of a long address; a short one is shown whole.
export function shortAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// The address the chip shows: the first saved binding that has one. Null when nothing is watched.
export function watchedAddress(bindings: readonly AddressBinding[]): string | null {
  for (const binding of bindings) if (binding.address !== null) return binding.address;
  return null;
}

export function WalletChip() {
  const state = useBindingsState();
  const [open, setOpen] = useState(false);
  const openConnect = useCallback(() => setOpen(true), []);
  useRegisterConnectAction(openConnect);
  const watched = watchedAddress(state.bindings);
  return (
    <>
      <button
        type="button"
        className="ui-wallet-chip"
        data-watched={watched === null ? "none" : "address"}
        data-status={state.status}
        aria-haspopup="dialog"
        aria-label={watched === null ? `${WATCH_LABEL}: open the connect options` : `Watching ${shortAddress(watched)}: open the connect options`}
        onClick={openConnect}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true" focusable="false">
          <path d="M3 7h18v12H3zM3 7l3-3h12l3 3M16 13h2" />
        </svg>
        {watched === null ? <span>{WATCH_LABEL}</span> : <Num>{shortAddress(watched)}</Num>}
      </button>
      <ConnectDialog open={open} onClose={() => setOpen(false)} state={state} />
    </>
  );
}
