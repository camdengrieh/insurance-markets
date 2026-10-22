// ABI fragments for exactly the calls and events the plan uses, and nothing else. Each fragment is a
// human-readable signature parsed by viem, so the selector or topic is computed, never typed by hand;
// test/chain-abi.test.ts recomputes every one and compares it with the values pinned in constants.ts
// and with an independent table taken from docs/phase1-gap-closing.md section 2.1.
//
// A fragment here is not permission to build a call. The *_DECODE_ONLY_ABI arrays hold operator and
// role-gated functions (spec section 2.2): they exist so a decoder can name a selector and so a test
// can prove no builder uses it. Call builders (src/xo/userop/calls.ts) take only the other arrays.

import { parseAbi } from "viem";

// ---- account stack --------------------------------------------------------------------------

// Kernel v3.1. initialize is called through KernelFactory.createAccount; execute is the ERC-7579
// entry the UserOp's callData targets (single and batch modes, see constants.ts).
export const KERNEL_ABI = parseAbi([
  "function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)",
  "function execute(bytes32 execMode, bytes executionCalldata) payable",
]);

export const KERNEL_FACTORY_ABI = parseAbi([
  "function createAccount(bytes data, bytes32 salt) payable returns (address)",
  "function getAddress(bytes data, bytes32 salt) view returns (address)",
  "function implementation() view returns (address)",
]);

// ERC-4337 v0.7 EntryPoint. PackedUserOperation is the on-chain packed form (accountGasLimits and
// gasFees are two 16-byte halves in one word, high half first).
export const ENTRY_POINT_ABI = parseAbi([
  "struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }",
  "function getNonce(address sender, uint192 key) view returns (uint256 nonce)",
  "function handleOps(PackedUserOperation[] ops, address beneficiary)",
  "function getUserOpHash(PackedUserOperation userOp) view returns (bytes32)",
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
  "event AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)",
]);

export const ECDSA_VALIDATOR_ABI = parseAbi([
  "function ecdsaValidatorStorage(address kernel) view returns (address owner)",
  "event OwnerRegistered(address indexed kernel, address indexed owner)",
]);

// ---- tokens ---------------------------------------------------------------------------------

// Circle USDC on Base and USDC.e on XO share this surface.
export const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

// Conditional Tokens (Gnosis CTF, ERC-1155). redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2]).
export const CONDITIONAL_TOKENS_ABI = parseAbi([
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
  "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
  "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
  "event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)",
]);

// ---- funding ---------------------------------------------------------------------------------

// Hyperlane warp route (HypERC20Collateral on Base, HypFiatToken on XO), TokenRouter surface only.
// quoteTransferRemote returns three Quote structs: native gas, token amount, external fee.
export const WARP_ROUTER_ABI = parseAbi([
  "struct Quote { address token; uint256 amount; }",
  "function token() view returns (address)",
  "function routers(uint32 _domain) view returns (bytes32)",
  "function mailbox() view returns (address)",
  "function interchainSecurityModule() view returns (address)",
  "function localDomain() view returns (uint32)",
  "function quoteTransferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) view returns (Quote[] quotes)",
  "function transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable returns (bytes32 messageId)",
  "event SentTransferRemote(uint32 indexed destination, bytes32 indexed recipient, uint256 amountOrId)",
  "event ReceivedTransferRemote(uint32 indexed origin, bytes32 indexed recipient, uint256 amountOrId)",
]);

export const MAILBOX_ABI = parseAbi([
  "function delivered(bytes32 _id) view returns (bool)",
  "function defaultHook() view returns (address)",
  "function requiredHook() view returns (address)",
  "function defaultIsm() view returns (address)",
  "event DispatchId(bytes32 indexed messageId)",
  "event ProcessId(bytes32 indexed messageId)",
]);

// ---- paymaster -------------------------------------------------------------------------------

export const POLICY_PAYMASTER_ABI = parseAbi([
  "function checkPolicy(address account, address target, bytes4 selector) view returns (bool allowed, string reason)",
  "function paused() view returns (bool)",
  "function dailyTxLimit() view returns (uint256)",
  "function getRemainingDailyTxs(address account) view returns (uint256)",
]);

// ---- exchange --------------------------------------------------------------------------------

// ERC-1967 Upgraded, emitted by the exchange proxy and by the market manager (UUPS).
export const UPGRADED_EVENT_ABI = parseAbi(["event Upgraded(address indexed implementation)"]);

export const CTF_EXCHANGE_ABI = parseAbi([
  "struct Order { uint256 salt; address maker; address signer; address beneficiary; uint256 tokenId; uint256 makerAmount; uint256 takerAmount; uint256 expiration; uint128 nonce; bytes16 identifier; bytes32 metadata; uint8 side; uint8 signatureType; bytes signature; }",
  "function nonces(address usr) view returns (uint128)",
  "function validateOrder(Order order) view",
  "event NonceIncremented(address indexed user, uint128 oldNonce, uint128 newNonce, address indexed admin)",
  "event MaxFeeRateUpdated(uint256 previousMaxFeeRateBps, uint256 newMaxFeeRateBps)",
]);

// Admin-only. Never build a call from this: the exchange's nonce counter has never moved and only an
// XO admin can move it. Kept so a decoder can name the selector and a test can prove it is not used.
export const CTF_EXCHANGE_DECODE_ONLY_ABI = parseAbi(["function incrementNonceFor(address user)"]);

// ---- creation --------------------------------------------------------------------------------

// The three calls the plan builds, the views the pre-flight reads, and the six events the review loop
// follows. Data layouts are in docs/research/23-creation-and-metadata-onchain.md V3.5.
export const MARKET_MANAGER_ABI = parseAbi([
  "function createConvictionMarket(uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI) returns (bytes32 conditionId)",
  "function respondToUpdateRequest(bytes32 conditionId, bool acceptUpdate)",
  "function cancelMarket(bytes32 conditionId)",
  "function authority() view returns (address)",
  "function CONFIG_MANAGER() view returns (address)",
  "event CLOBMarketCreated(bytes32 indexed conditionId, address indexed creator, bytes32 questionId, uint256 outcome1TokenId, uint256 outcome2TokenId, address collateralToken, address resolver, uint40 startsAt, uint40 expiresAt, uint16 creatorFeeBps, string metadataURI, uint8 marketType)",
  "event MarketReviewed(bytes32 indexed conditionId, uint8 decision, string suggestedMetaDataURI, string extraNotes, uint40 suggestedExpiresAt, uint40 suggestionExpiresAt)",
  "event MarketCreationFeeCharged(bytes32 indexed conditionId, address indexed creator, address collateralToken, uint256 fee)",
  "event UpdateRequestResponded(bytes32 indexed conditionId, address owner, bool accepted, string metaDataURI)",
  "event MarketCancelledByOwner(bytes32 indexed conditionId, address owner)",
  "event MetadataUpdated(bytes32 indexed conditionId, string newURI)",
]);

// Oracle and XO-infrastructure functions. Decoding only; absent from every allowlist.
export const MARKET_MANAGER_DECODE_ONLY_ABI = parseAbi([
  "function reviewMarket(bytes32 conditionId, uint8 decision, string suggestedMetaDataURI, string extraNotes, uint40 suggestedExpiresAt, uint40 suggestionExpiresAt)",
  "function createConvictionMarketFor(address creator, uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI) returns (bytes32 conditionId)",
  "function updateMetadata(bytes32 conditionId, string metadataURI)",
]);

export const ACCESS_MANAGER_ABI = parseAbi([
  "function canCall(address caller, address target, bytes4 selector) view returns (bool immediate, uint32 delay)",
]);

// collateralConfig returns eight static words; decoding them all as uint256 (bool first) is exact for
// every value seen, whatever the narrower on-chain types are.
export const CONFIG_MANAGER_ABI = parseAbi([
  "function collateralConfig(address collateralToken) view returns (bool allowed, uint256 minInitialCollateralAmount, uint256 minCreatorFeeBps, uint256 maxFeeCollateralAmount, uint256 maxCreatorFeeBps, uint256 minTradeSizeInCollateral, uint256 maxTradeSizeInCollateral, uint256 marketCreationFee)",
]);

// Every fragment array in one table, so the tests (and a reviewer) can see the whole surface.
export const ALL_ABIS = Object.freeze({
  KERNEL_ABI,
  KERNEL_FACTORY_ABI,
  ENTRY_POINT_ABI,
  ECDSA_VALIDATOR_ABI,
  ERC20_ABI,
  CONDITIONAL_TOKENS_ABI,
  WARP_ROUTER_ABI,
  MAILBOX_ABI,
  POLICY_PAYMASTER_ABI,
  UPGRADED_EVENT_ABI,
  CTF_EXCHANGE_ABI,
  CTF_EXCHANGE_DECODE_ONLY_ABI,
  MARKET_MANAGER_ABI,
  MARKET_MANAGER_DECODE_ONLY_ABI,
  ACCESS_MANAGER_ABI,
  CONFIG_MANAGER_ABI,
});
