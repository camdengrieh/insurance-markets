// The trading account as every other part of the page sees it (docs/unified-account-design.md section 3.1). Types only,
// so a venue executor, an activation or a balance source can name them without pulling in the provider.

import type { Address } from "viem";

import type { WalletSigner } from "../../core/signer";
import type { LocalSigner } from "./local-signer";

// How E came to be: "derived" from one fixed signature of the connected wallet (re-made from that wallet on any device),
// or "generated" in this browser and kept encrypted under a passkey.
export type TradingAccountMode = "derived" | "generated";

export interface TradingAccount {
  // Signs with E in this tab, without a prompt. Its sendTransaction sends one sponsored call (sponsor.ts).
  readonly signer: LocalSigner;
  // E, checksummed: the one identity every venue sees.
  readonly address: Address;
  readonly mode: TradingAccountMode;
  // W, the connected wallet that funds the account and receives withdrawals; null while no wallet is connected (or, for
  // a derived account, while a different wallet from the one it was made from is connected).
  readonly funding: WalletSigner | null;
}
