// Public surface of the wallet package (docs/dapp-design.md 7.4 WP F). There is no Wallet screen: the Connect modal
// (opened from the wallet chip in the top bar) hosts the wallet panels in its "Just watch an address" tab.
export { WalletView, WalletPanels, WALLET_PANELS_SUMMARY, type WalletViewProps, type WalletHeading } from "./WalletView";
export { BindingsPanel } from "./BindingsPanel";
export { WalletChip, shortAddress, watchedAddress, WATCH_LABEL } from "./WalletChip";
export { ConnectDialog, CONNECT_TABS, NOT_BUILT, DIALOG_TITLE, DIALOG_LEDE, FOOTER_TEXT, type ConnectTab, type ConnectDialogProps } from "./ConnectDialog";
export { AccountMapPanel, CapabilityList, useAccountMap } from "./AccountMapPanel";
export { BalancesPanel } from "./BalancesPanel";
export { FundingPanel } from "./FundingPanel";
export { loadAccountMap, readXoRegistration, type AccountMap, type AccountMapInput, type AccountMapResult, type ChainState } from "./account-map";
export { CHAIN_TOKENS, atomicText, nativeSymbol, readChainBalances, readExplorerBalances, type BalanceRow, type ChainBalancesState, type ExplorerBalances } from "./balances";
export { DEFAULT_ENABLED_CHAINS, chainsFromIds, loadEnabledChains, saveEnabledChains, toggleChain } from "./chain-settings";
export { failureOf, isAdapterErrorCode, type Failure } from "./failure";
export { readFundingReads, type FundingReads } from "./funding-reads";
export { FUNDING_FACTS, planFunding, type DecodedStep, type FundingInputs, type FundingPlan } from "./funding-view";
export { MULTICALL3_ADDRESS, createChainReader, rpcUrlOf, uintOf, type ChainReader, type ReadOp, type ReadResult } from "./rpc";
export { WalletServicesProvider, createDefaultServices, useBindingsState, useWalletServices, type BindingsState, type TokenSource, type WalletServices } from "./services";
