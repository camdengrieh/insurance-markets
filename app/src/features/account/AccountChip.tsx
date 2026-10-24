import { Num } from "../../ui";
import { AccountDialog, shortAddress } from "./AccountPanel";
import { useTradingAccountControls } from "./context";

// The trading account's chip in the top bar, beside the wallet chip, in the same outlined shape. Locked it reads
// "Trading account"; open it shows the account's short address. It opens the account panel, which it renders, so any
// other entry point (the Connect modal) opens the same panel through useOpenTradingAccount(). Where the account is not
// offered (the Cockpit build) it renders nothing.

export const CHIP_LABEL = "Trading account";

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true" focusable="false">
      <path d="M14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM14 10h7M18 10v3M21 10v3" />
    </svg>
  );
}

export function AccountChip() {
  const controls = useTradingAccountControls();
  if (controls === null || controls.unavailable !== null) return null;
  const account = controls.account;
  return (
    <>
      <button
        type="button"
        className="ui-wallet-chip ac-chip"
        data-account={account === null ? "locked" : "open"}
        aria-haspopup="dialog"
        aria-label={account === null ? `${CHIP_LABEL}: create or unlock` : `${CHIP_LABEL} ${shortAddress(account.address)}: open the account panel`}
        onClick={controls.openPanel}
      >
        <KeyIcon />
        {account === null ? <span>{CHIP_LABEL}</span> : <Num>{shortAddress(account.address)}</Num>}
      </button>
      <AccountDialog />
    </>
  );
}
