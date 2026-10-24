// Public surface of the trading account (docs/unified-account-design.md section 3.1), for the venue executors, the trade
// ticket and the shell. Everything a venue needs is here; nothing here imports a venue, so a venue module may import
// this one freely.
//
//   The account      useTradingAccount() -> TradingAccount | null; TradingAccount, TradingAccountMode
//   The signer       LocalSigner (a WalletSigner of kind "local"), createLocalSigner, LOCAL_CAPABILITIES
//   Sponsored gas    Sponsor, SponsorCall, SponsorError, createSponsor, SPONSORED_CHAIN_IDS
//   Activation       VenueActivation, ActivationStatus, ActivationProgress, ActivationResult, VENUE_ACTIVATIONS,
//                    registerVenueActivation, subscribeVenueActivations, runActivations, checkActivations
//   Balance          BalanceSource, BalanceLine, registerBalanceSource
//   Ownership proof  ownershipProof, proofText, PROOF_HEADER (the x-im-proof header of design 3.3)
//   Shell            TradingAccountProvider, AccountChip, AccountDialog, useOpenTradingAccount
export type { TradingAccount, TradingAccountMode } from "./types";
export { useTradingAccount, useTradingAccountControls, useOpenTradingAccount, TradingAccountProvider, type TradingAccountControls } from "./context";
export { createLocalSigner, LOCAL_CAPABILITIES, LOCAL_SIGNER_NAME, type LocalSigner } from "./local-signer";
export { createSponsor, SponsorError, type Sponsor, type SponsorCall, type SponsorErrorCode } from "./sponsor";
export { BNB_CHAIN_ID, LOCAL_SIGNER_CHAIN_IDS, MONEY_CHAINS, POLYGON_USDC, SPONSORED_CHAIN_IDS, USDC_DECIMALS } from "./constants";
export {
  VENUE_ACTIVATIONS,
  registerVenueActivation,
  subscribeVenueActivations,
  runActivations,
  checkActivations,
  type VenueActivation,
  type ActivationStatus,
  type ActivationProgress,
  type ActivationResult,
  type ActivationRow,
} from "./activation";
export { registerBalanceSource, subscribeBalanceSources, balanceSources, totalOf, type BalanceSource, type BalanceLine, type BalanceTotal } from "./balances";
export { ownershipProof, proofText, PROOF_HEADER, type ProofSigner } from "./proof";
export { AccountChip } from "./AccountChip";
export { AccountDialog } from "./AccountPanel";
