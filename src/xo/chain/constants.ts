// Pinned on-chain constants for XO (chain 3223) and Base (chain 8453). New code writes no contract
// address as a literal anywhere under src/ or relay/ except in this file, and imports from here;
// test/chain-constants.test.ts scans for violations. Three older files (src/guardrails/constants.ts,
// src/xo/signing/constants.ts, src/paybox.ts) still carry a few literals, and the same test proves each
// equals a constant below. Never accept one of these values from the agent, from market data, from an
// API response or from the environment.
//
// Source of every row: docs/phase1-gap-closing.md section 2.1 (and its section 9 amendments), which
// in turn cites the research notes:
//   [19] docs/research/19-smart-account-derivation.md   [20] ...20-funding-route-verification.md
//   [21] ...21-userop-templates.md                      [22] ...22-order-semantics-from-source.md
//   [23] ...23-creation-and-metadata-onchain.md         [01] ...01-xo-auth-signing.md
//   "V" after a key is that note's Verification section, which overrides the researcher.
// Do not copy an address from a note: seven strings in the notes and fixtures fail the EIP-55
// checksum (spec section 2.3). Every address below passes a strict check, and the test suite
// proves it for every exported address (including the ones nested in arrays and objects).
//
// Confidence tags, as in the spec after amendment A11:
//   H   read in a primary source and reproduced by a researcher and an independent verifier.
//   H*  H, and recomputed offline (checksum, selector, topic, derivation, init-code hash) in the
//       spec's Appendix A and again by test/chain-*.test.ts.
//   M   one pass, secondary source, or inference.
// Pin class:
//   PIN            compile in, never accept from outside.
//   PIN+TRIPWIRE   compile in, and src/xo/chain/tripwires.ts watches a mutable property.
//   READ           policy XO can edit; read it at runtime, the value here is only what was seen.

import type { Address, Hex } from "viem";

export type { Address, Hex };

// ---------------------------------------------------------------------------------------------
// A. Chains and signing domains
// ---------------------------------------------------------------------------------------------

// XO chain id 3223 (0xc97). H: eth_chainId on the RPC and the bundler, and the cached chain id
// 0x0c97 inside the Kernel implementation [19 sec 5.2], [21 sec 6]. PIN.
export const XO_CHAIN_ID = 3223;
export const XO_CHAIN_ID_HEX = "0xc97" as const;
// Base chain id. H: localDomain() on the Base router and Mailbox [20 sec 2.2]. PIN.
export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105" as const;
// Hyperlane domain ids equal the chain ids on both sides. H: [20 sec 2.2]. PIN.
export const HYPERLANE_DOMAIN_XO = 3223;
export const HYPERLANE_DOMAIN_BASE = 8453;

// Order EIP-712 domain. H: verified exchange source, owner recovery for 9 + 99 orders [22 b.3, V6].
export const ORDER_DOMAIN_NAME = "XO Market CLOB";
export const ORDER_DOMAIN_VERSION = "1";

// Kernel wrapper: Kernel(bytes32 hash) under ("Kernel", "0.3.1", 3223, the account). H: Kernel v3.1
// Constants.sol:60 and Kernel.sol:153-156; the 3223 bytecode separator was recomputed [19 sec 5.2].
export const KERNEL_DOMAIN_NAME = "Kernel";
export const KERNEL_DOMAIN_VERSION = "0.3.1";
export const KERNEL_WRAPPER_TYPE_STRING = "Kernel(bytes32 hash)";
// H*: keccak256 of the type string above (checked in test/chain-constants.test.ts).
export const KERNEL_WRAPPER_TYPEHASH = "0x1547321c374afde8a591d972a084b071c594c275e36724931ff96c25f2999c83" as const;

// ClobAuth (L1). M, per amendment A7: rests on XO's docs and our own vectors; the gateway has not
// accepted one of our signatures. The domain has no verifyingContract.
export const CLOB_AUTH_DOMAIN_NAME = "ClobAuthDomain";
export const CLOB_AUTH_DOMAIN_VERSION = "1";
export const CLOB_AUTH_TYPE_STRING = "ClobAuth(address address,string timestamp,uint256 nonce,string message)";
export const CLOB_AUTH_MESSAGE = "This message attests that I control the given wallet";

// ---------------------------------------------------------------------------------------------
// B. Account and UserOp stack (factory, validator and EntryPoint are byte-identical on Base)
// ---------------------------------------------------------------------------------------------

// EntryPoint v0.7 (16,035 B). H*: getUserOpHash equals the local hash for 7 + 3 ops [21 V1.1, sec 2]. PIN.
export const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
// KernelFactory 0.3.1 (989 B). H*: factory field of 2,626 of 2,628 AccountDeployed events [19 sec 0]. PIN.
export const KERNEL_FACTORY = "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419" as const;
// Kernel implementation 0.3.1 (22,784 B; differs from Base in 34 bytes). H: pinned by CREATE2 for
// 2,627 of 2,627 and by factory.implementation() [19 sec 5.2]. PIN.
export const KERNEL_IMPLEMENTATION = "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D" as const;
// ECDSA validator (1,819 B; no transferOwnership). H: root validator in 34 of 34 deployments [19 sec 3.2]. PIN.
export const ECDSA_VALIDATOR = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57" as const;
// ERC-1967 init-code hash for the implementation above. H*: [19 sec 5.1], recomputed from the layout
// in src/xo/account/derive.ts by test/chain-derive.test.ts. PIN.
export const ERC1967_INIT_CODE_HASH = "0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6" as const;
// Solady LibClone ERC-1967 proxy, as XO's factory deploys it. Creation code (95 bytes) =
// ERC1967_CREATION_PREFIX || implementation (20) || ERC1967_CREATION_MIDDLE || KERNEL_PROXY_RUNTIME_CODE:
// the constructor stores the implementation in the EIP-1967 slot and returns the 61-byte runtime. The
// runtime does not contain the implementation, so every Kernel account of this factory has the same
// code: an exact match is positive proof of a deployed Kernel proxy (an explorer's smart-contracts 404
// or is_contract flag proves nothing, docs/research/19 V2.1). H*: the runtime is the 61-byte code the
// researchers read from deployed accounts; the creation layout reproduces ERC1967_INIT_CODE_HASH.
export const ERC1967_CREATION_PREFIX = "0x603d3d8160223d3973" as const;
export const ERC1967_CREATION_MIDDLE = "0x60095155f3" as const;
export const KERNEL_PROXY_RUNTIME_CODE =
  "0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3" as const;
// EIP-1967 implementation slot = keccak256("eip1967.proxy.implementation") - 1. H*: standard value, the
// same 32 bytes sit inside the proxy runtime code and the init-code layout.
export const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

// The validator keeps `mapping(address kernel => owner)` at storage slot 0, so an account's owner sits at
// keccak256(abi.encode(kernel, 0)) in the validator's storage. H: state-override read-back on Base
// [19 sec 7.2]. Tests and an optional eth_getStorageAt owner check only.
export const ECDSA_VALIDATOR_OWNER_MAPPING_SLOT = 0n;

// Factory call. H*: rebuilt byte-identical for 34 of 34 deployments [19 sec 5].
export const FACTORY_CREATE_ACCOUNT_SELECTOR = "0xea6d13ac" as const;
export const KERNEL_INITIALIZE_SELECTOR = "0x3c3b752b" as const;
// VALIDATION_TYPE_VALIDATOR (0x01) in front of the validator address, a bytes21 root validator.
export const ROOT_VALIDATOR_TYPE_BYTE = "0x01" as const;
export const ACCOUNT_SALT = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
export const KERNEL_INIT_DATA_BYTES = 292;
// Counterfactual-account cost of the first UserOp: initCode is factory (20) + createAccount calldata (420).
export const USEROP_INIT_CODE_BYTES = 440;

// Test vector, public Anvil/Hardhat account 0 (address only, never a key). H*: [19 sec 5.3]; the Base
// factory's own getAddress returns the same account. Undeployed on 3223, deployed on Base.
export const ANVIL_ACCOUNT_0_OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
export const ANVIL_ACCOUNT_0_ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d" as const;

// Events on the account stack. H*: topics recomputed from the ABI fragments in abi.ts.
// OwnerRegistered(address indexed kernel, address indexed owner), emitted by ECDSA_VALIDATOR.
export const OWNER_REGISTERED_TOPIC = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca" as const;
// AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster),
// emitted by ENTRY_POINT_V07; topic2 = sender.
export const ACCOUNT_DEPLOYED_TOPIC = "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d" as const;
// UserOperationEvent, standard v0.7 signature on a byte-identical EntryPoint; topic2 = sender.
export const USER_OPERATION_EVENT_TOPIC = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f" as const;

// Nonce layout (32 bytes): mode 0x00, type 0x00 (root), identifier = validator (20 B), key (2 B),
// sequence (8 B). H*: 236 of 236 decoded; getNonce equals the log-derived next nonce [21 sec 3, V1.8, V2.3].
export const FIRST_OP_NONCE = "0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000" as const;
export const NONCE_KEY_SHIFT = 64n;
export const GET_NONCE_SELECTOR = "0x35567e1a" as const;
// execute(bytes32,bytes) and its modes: single 0x00 then zeros, batch 0x01 then zeros, execType 0 (revert).
// H: 22 real ops decoded and re-encoded [21 sec 3].
export const EXECUTE_SELECTOR = "0xe9ae5c53" as const;
export const EXEC_MODE_SINGLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
export const EXEC_MODE_BATCH = "0x0100000000000000000000000000000000000000000000000000000000000000" as const;
export const HANDLE_OPS_SELECTOR = "0x765e827f" as const;
// paymasterAndData = paymaster (20) + verification gas (16) + postOp gas (16), empty paymasterData.
export const PAYMASTER_AND_DATA_BYTES = 52;
// UserOp signature: 65 B (r, s, v), v in {27, 28}, low s, no prefix. H [21 sec 5, V1.2-3].
export const USEROP_SIGNATURE_BYTES = 65;

// PolicyPaymaster (verified source). H*; PIN+TRIPWIRE (paused, policy probes).
export const POLICY_PAYMASTER = "0x2353B23D8F329fD3cEC0d21652F14208248A439d" as const;
export const CHECK_POLICY_SELECTOR = "0xb591eaca" as const;
export const PAYMASTER_PAUSED_SELECTOR = "0x5c975abb" as const;
export const PAYMASTER_DAILY_TX_LIMIT_SELECTOR = "0xda023b31" as const;
export const PAYMASTER_REMAINING_DAILY_TXS_SELECTOR = "0xad1e92ea" as const;
// Owner on 2026-10-18 after 5 handovers. Informational: the owner can pause or narrow the allowlist at
// will, which is why the policy is probed at runtime rather than trusted. H (dated), READ.
export const PAYMASTER_OWNER_OBSERVED = "0x0498B2632c3D2bb24DaB53717f0e74DDEE46DE2f" as const;
// A never-seen sender the policy probes ask about (any address works: the policy is sender-agnostic).
export const PAYMASTER_PROBE_ACCOUNT = "0x7777777777777777777777777777777777777777" as const;
export const PAYMASTER_DAILY_TX_LIMIT_OBSERVED = 10_000n;

// Fee fields: maxFeePerGas = maxPriorityFeePerGas = 0 (236 of 236). H, PIN as the default.
export const DEFAULT_MAX_FEE_PER_GAS = 0n;
export const DEFAULT_MAX_PRIORITY_FEE_PER_GAS = 0n;

// Gas defaults (verification / call / preVerification; paymaster verification / postOp), copied from
// real ops [21 sec 8.1]. They are defaults, not requirements: larger round limits also land [21 V2.5]
// and the bundler's own estimate is preferred when it is available [21 V4.1]. H, except where marked M.
export interface GasDefaults {
  readonly verificationGasLimit: bigint;
  readonly callGasLimit: bigint;
  readonly preVerificationGas: bigint;
  readonly paymasterVerificationGasLimit: bigint;
  readonly paymasterPostOpGasLimit: bigint;
}
export const GAS_DEFAULTS: Readonly<Record<"deployAndEnableTrading" | "enableTrading" | "redeemOne" | "createMarket", GasDefaults>> =
  Object.freeze({
    deployAndEnableTrading: Object.freeze({
      verificationGasLimit: 297_342n,
      callGasLimit: 74_916n,
      preVerificationGas: 56_214n,
      paymasterVerificationGasLimit: 40_262n,
      paymasterPostOpGasLimit: 26_478n,
    }),
    // Already-deployed Enable Trading was not observed: 87,869 / 74,916 / about 51,200 is M.
    enableTrading: Object.freeze({
      verificationGasLimit: 87_869n,
      callGasLimit: 74_916n,
      preVerificationGas: 51_200n,
      paymasterVerificationGasLimit: 40_262n,
      paymasterPostOpGasLimit: 26_478n,
    }),
    redeemOne: Object.freeze({
      verificationGasLimit: 87_869n,
      callGasLimit: 126_186n,
      preVerificationGas: 51_195n,
      paymasterVerificationGasLimit: 40_262n,
      paymasterPostOpGasLimit: 26_478n,
    }),
    createMarket: Object.freeze({
      verificationGasLimit: 105_442n,
      callGasLimit: 1_100_000n,
      preVerificationGas: 55_814n,
      paymasterVerificationGasLimit: 40_262n,
      paymasterPostOpGasLimit: 26_478n,
    }),
  });
// Batched redeems: callGasLimit grows by about 35,000 per extra redeem plus a 100,000 margin; and
// preVerificationGas by about 7.5 gas (15/2) per extra calldata byte. M (four data points) [21 sec 8.1].
export const REDEEM_CALL_GAS_PER_EXTRA_REDEEM = 35_000n;
export const REDEEM_CALL_GAS_MARGIN = 100_000n;
export const PRE_VERIFICATION_GAS_PER_EXTRA_BYTE = Object.freeze({ numerator: 15n, denominator: 2n });

// ---------------------------------------------------------------------------------------------
// C. Exchange, collateral and orders
// ---------------------------------------------------------------------------------------------

// CTF Exchange proxy, the order domain's verifyingContract. H; PIN+TRIPWIRE (a second Upgraded log).
export const CTF_EXCHANGE = "0x4bC5E872256D12E6017dfe466E04c867DC761B77" as const;
// Implementation (solc 0.8.28, verified 2026-08-10). Exactly one Upgraded(address) event ever.
export const EXCHANGE_IMPLEMENTATION = "0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED" as const;
export const EXCHANGE_UPGRADE_TX = "0x834910095e4d91e5503f754b0f73d3cf5ec1393d14a334e1e9f9f7a8ceee37ad" as const;
// Upgraded(address indexed implementation); topic1 = the implementation. H*.
export const UPGRADED_TOPIC = "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b" as const;

// ERC-20 Approval(address indexed owner, address indexed spender, uint256 value) on USDC.e and ERC-1155
// ApprovalForAll(address indexed account, address indexed operator, bool approved) on Conditional
// Tokens: the two logs that say "Enable Trading happened" (topic1 = account, topic2 = exchange).
// Standard signatures. H*: recomputed from the fragments in abi.ts.
export const ERC20_APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925" as const;
export const APPROVAL_FOR_ALL_TOPIC = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31" as const;

// USDC.e "Bridged USDC (XO)", 6 decimals. H [20 sec 3.4]. PIN.
export const USDC_E_ADDRESS = "0x80c12230ce677e6f304027a14780Edd2A829ab0c" as const;
export const USDC_E_DECIMALS = 6;
export const USDC_E_ATOMIC_PER_UNIT = 1_000_000n;
// Conditional Tokens (source not verified on the explorer; standard Gnosis selectors match). H (address). PIN.
export const CONDITIONAL_TOKENS = "0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909" as const;

// Outcome shares are 6-decimal micro-shares: "1000000" is one share. H [01 units].
export const SHARE_DECIMALS = 6;
export const SHARE_MICRO_PER_SHARE = 1_000_000n;

// Order identity: signatureType 3, signer == maker == the account, beneficiary, identifier and
// metadata zero. H: Signatures.sol:123-130, 600 of 600 [22 b.1, A23]. PIN.
export const SIGNATURE_TYPE_XO_SMART_ACCOUNT = 3;
// Order nonce: 0. Only an admin-only incrementNonceFor writes the counter (never call it). H*.
export const ORDER_NONCE = 0n;
export const EXCHANGE_NONCES_SELECTOR = "0x7ecebe00" as const;
export const INCREMENT_NONCE_FOR_SELECTOR = "0xbfb66376" as const;
// NonceIncremented(address indexed user, uint128 oldNonce, uint128 newNonce, address indexed admin);
// topic1 = the maker. Any log means the counter moved. H*.
export const NONCE_INCREMENTED_TOPIC = "0xc3ab8769b052bec3201cd16265d258ccc297277e8d91d562d5b5e399d5f8cca0" as const;

// Wire signature: default 0x01 + validator + sig65 (86 B); fallback 0x00 + sig65 (66 B) only after an
// explicit signature rejection. H: 595 of 600 and 1 of 600 settled [22 b.3].
export const WIRE_SIGNATURE_PREFIX = "0x01" as const;
export const WIRE_SIGNATURE_FALLBACK_PREFIX = "0x00" as const;
export const WIRE_SIGNATURE_BYTES = 86;
export const WIRE_SIGNATURE_FALLBACK_BYTES = 66;

// Fee bound: maxFeeRateBps = 800 (set 0 to 800 in MAX_FEE_RATE_SET_TX on 2026-08-10); hard ceiling
// constant 1000 (Fees.sol:26, :62-67). H. PIN+TRIPWIRE (MaxFeeRateUpdated above 800).
export const MAX_FEE_RATE_BPS = 800;
export const FEE_RATE_CEILING_BPS = 1000;
export const MAX_FEE_RATE_SET_TX = "0xf3b293c6454ab0e5bf6ad633e2d186857117b93fbca6bc76cfcfb8d5edb4e6ae" as const;
// MaxFeeRateUpdated(uint256 previousMaxFeeRateBps, uint256 newMaxFeeRateBps), both in data. H*.
export const MAX_FEE_RATE_UPDATED_TOPIC = "0x3b0628c08a7360081d719329ff580ace85680788ec349e5f2b95788e262fd61d" as const;

// Price and size grid: tick 0.001, integer tick t in [1, 999]; BUY makerAmount = S*t/1000 and
// takerAmount = S; SELL the reverse; S a multiple of 1,000 micro-shares; both amounts above zero
// (takerAmount 0 crosses everything). H [22 c, sec 9.3].
export const PRICE_TICK_DENOMINATOR = 1000;
export const MIN_PRICE_TICK = 1;
export const MAX_PRICE_TICK = 999;
export const SHARE_STEP_MICRO = 1_000n;
// validateOrder(order): a free public-view pre-flight when an RPC is open. H*; optional.
export const VALIDATE_ORDER_SELECTOR = "0x5451c7a4" as const;

// ---------------------------------------------------------------------------------------------
// D. Creation (v0.3)
// ---------------------------------------------------------------------------------------------

// XOClobMarketManager proxy (UUPS, upgraded once) and its implementation. H; PIN+TRIPWIRE (implementation slot).
export const MARKET_MANAGER = "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307" as const;
export const MANAGER_IMPLEMENTATION = "0x60a10A0C0885628e413afFA4F62F3e942f11fcda" as const;
// AccessManager: canCall(address,address,bytes4) returned (true, 0) for 0x7f54a7a2 at block ~12.61M. H [23 V1].
export const ACCESS_MANAGER = "0x414Ea2dA101008Fc9d59Fb4EC43431910cB936f5" as const;
// CONFIG_MANAGER: collateralConfig(USDC.e).marketCreationFee = 1,000,000. H [23 V3.2]; the fee is READ.
export const CONFIG_MANAGER = "0x7bFf30281075Ee095A3bDf14a70a36dAed9075B1" as const;
// XO oracle and the market NFT (proxy and implementation). H [23 V6, V3.3]. Informational.
export const XO_ORACLE = "0xdb3206Bde18aeBd1b84657B98B9E0f55e0f95648" as const;
export const MARKET_NFT = "0x83933Bf3af4Bd7F0ccA2e776ef9b55851C0eD098" as const;
export const MARKET_NFT_IMPLEMENTATION = "0xf214AA7f356065F97375c9f762F3c2388c92A319" as const;

// Selectors. Only the first three are ever built into a call; the "never" selectors exist so that a
// decoder can name them and an allowlist test can prove they are absent. H*.
export const CREATE_CONVICTION_MARKET_SELECTOR = "0x7f54a7a2" as const;
export const RESPOND_TO_UPDATE_REQUEST_SELECTOR = "0x1de5facd" as const;
export const CANCEL_MARKET_SELECTOR = "0xbdb83289" as const;
export const REVIEW_MARKET_SELECTOR_NEVER_CALL = "0x4cbe35ee" as const;
export const CREATE_CONVICTION_MARKET_FOR_SELECTOR_NEVER_CALL = "0x507cedd3" as const;
export const UPDATE_METADATA_SELECTOR_NEVER_CALL = "0xa375765e" as const;
export const ACCESS_MANAGER_CAN_CALL_SELECTOR = "0xb7009613" as const;
export const MANAGER_AUTHORITY_SELECTOR = "0xbf7e214f" as const;
export const MANAGER_CONFIG_MANAGER_SELECTOR = "0x6d64c83f" as const;
export const COLLATERAL_CONFIG_SELECTOR = "0x0cc248ad" as const;

// Manager events. H*: recomputed from the saved verified ABI; 60 review logs cross-decoded with 0
// mismatches [23 sec 2]. CLOBMarketCreated topic1 = conditionId, topic2 = creator; MarketReviewed
// topic1 = conditionId. Data layouts: [23 V3.5].
export const CLOB_MARKET_CREATED_TOPIC = "0xfc777083d83af2d598c4ee0de93a86199dec7742d0001485cb6e25bc8c3b16c8" as const;
export const MARKET_REVIEWED_TOPIC = "0xab43af6d7c659e1ce1dfdc8a80d94af9f6b085793b380ddd2e8a0d1b6d3ba27f" as const;
export const MARKET_CREATION_FEE_CHARGED_TOPIC = "0xe9927345bdffcfbc768aecc0c516a76565447079fc0dab2b1e5f2c28e91dcf2e" as const;
export const UPDATE_REQUEST_RESPONDED_TOPIC = "0xd875fbcccd09683c3f5634238cfc5441c0c702ec33c6d705dd181524212ac74b" as const;
export const MARKET_CANCELLED_BY_OWNER_TOPIC = "0xa594ccd17afec32aa8a5584fd61eb38872adbb5948e5de67a3046bcc9236e2ea" as const;
export const METADATA_UPDATED_TOPIC = "0xe36c73fd13989812054eaa73a813bdd65752bda9044a9bdac079e4143c6ab7bd" as const;

// Enums, fee and encodings. H [23 sec 1, sec 9, V3.4]. The creation fee is non-refundable; create uses
// Kernel batch mode, respond and cancel use single mode.
export const REVIEW_DECISION = Object.freeze({ APPROVE: 0, REJECT: 1, UPDATE_REQUIRED: 2 } as const);
export const MARKET_STATUS = Object.freeze({
  PENDING: 0,
  CANCELLED: 1,
  ACTIVE: 2,
  PAUSED: 3,
  RESOLVED: 4,
  CLOSED: 5,
  UPDATE_REQUIRED: 6,
  VOIDED: 7,
  VOIDED_CLOSED: 8,
} as const);
export const MARKET_TYPE_CLOB_CONVICTION = 4;
export const CREATION_FEE_ATOMIC = 1_000_000n;

// ---------------------------------------------------------------------------------------------
// E. Funding (Base to XO)
// ---------------------------------------------------------------------------------------------

// Base warp router (proxy) and implementation (HypERC20Collateral 11.1.0, Sourcify exact match on the
// implementation). H; PIN+TRIPWIRE (EIP-1967 implementation slot equals the known one).
export const BASE_WARP_ROUTER = "0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F" as const;
export const BASE_ROUTER_IMPLEMENTATION = "0x5b3F32417d651d47ebAEb079e8cf28B479b0926a" as const;
// Circle USDC on Base, 6 decimals. H [20 sec 3.4]. PIN.
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_USDC_DECIMALS = 6;
// XO warp route (proxy) and implementation (HypFiatToken 11.1.0). Note 20 prints the proxy with a bad
// checksum in two places; this is the EIP-55 form. H.
export const XO_WARP_ROUTE = "0x9090463546d725F6ecE5D1A4B27bEB929D5d1983" as const;
export const XO_ROUTE_IMPLEMENTATION = "0xdc4b86B0f3Abfc461a9A03a94B347D6F5DA8D052" as const;
// One Mailbox, one hook and one ISM serve both chains. H*; PIN (preflight equality). The notes print
// the Mailbox and the third validator with bad checksums; these are the EIP-55 forms.
export const HYPERLANE_MAILBOX = "0xfDd96df1b2D4354DbB1070815819DB47469Ca470" as const;
export const HYPERLANE_HOOK = "0xf9a84A5e63e7335D44E132775B1244462e08E449" as const;
export const HYPERLANE_ISM = "0xb429F39836eC9BD6b0fEDD999Bf49991592BB8Ff" as const;
export const HYPERLANE_ISM_THRESHOLD = 2;
export const HYPERLANE_ISM_VALIDATORS: readonly [Address, Address, Address] = Object.freeze([
  "0xafBd7650D0A47621e66dC005da466395CFc8B889",
  "0x3D5dAEFB696DEd2e12847B5341Ea66eD77CaC7d4",
  "0xA6c998F0DB2b56D7a63FAF30a9B677C8B9b6faab",
] as const);

// Calls. approve on Circle USDC with spender = router and amount = exact; transferRemote on the router
// with (3223, account left-padded to 32 bytes, amount). value is "0" on both. H* [20 sec 4, V B].
export const APPROVE_SELECTOR = "0x095ea7b3" as const;
export const TRANSFER_REMOTE_SELECTOR = "0x81b4e8b4" as const;
export const FUNDING_VALUE_WEI = "0";
export const APPROVE_CALLDATA_BYTES = 68;
export const TRANSFER_REMOTE_CALLDATA_BYTES = 100;
// Preflight views. H*.
export const ROUTER_TOKEN_SELECTOR = "0xfc0c546a" as const;
export const ROUTER_ROUTERS_SELECTOR = "0x2ead72f6" as const;
export const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e" as const;
export const ERC20_BALANCE_OF_SELECTOR = "0x70a08231" as const;
export const ROUTER_QUOTE_TRANSFER_REMOTE_SELECTOR = "0x8bd90b82" as const;
export const MAILBOX_DELIVERED_SELECTOR = "0xe495f1d4" as const;
// quoteTransferRemote(3223, recipient, amount) = [(0x0, 0), (USDC, amount), (USDC, 0)]; quoteGasPayment
// is 0; scale 1/1; destinationGas 68,000. H [20 sec 3.1, V item 5].
export const ROUTE_DESTINATION_GAS = 68_000n;
// DispatchId / ProcessId: diagnostics only. H*.
export const DISPATCH_ID_TOPIC = "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a" as const;
export const PROCESS_ID_TOPIC = "0x1cae38cdd3d3919489272725a5ae62a4f48b2989b0dae843d3c279fee18073a9" as const;
// Delivery timing, for polling only: Base to XO median 14 s, p90 24 s, max 27 s (n = 253); XO to Base
// 12 / 14 / 18 s (n = 230). Poll for 10 minutes, then report pending, never resend. H (samples).
export const DELIVERY_TIMING_S = Object.freeze({
  baseToXo: Object.freeze({ median: 14, p90: 24, max: 27 }),
  xoToBase: Object.freeze({ median: 12, p90: 14, max: 18 }),
});
export const DELIVERY_POLL_TIMEOUT_S = 600;

// ---------------------------------------------------------------------------------------------
// F. Operating limits and windows
// ---------------------------------------------------------------------------------------------

export const OPERATING_LIMITS = Object.freeze({
  // L1 accepted at -110 and +120, rejected at -125 and +150: about plus or minus 120 s. Design for 60 s.
  l1TimestampWindowS: 120,
  l1DesignWindowS: 60,
  // L2 window plus or minus 30 s, aligned with GET /time (bare integer seconds).
  l2TimestampWindowS: 30,
  // Taker delay 500 ms (3 s live sports); expired GTD swept about 10 s after the deadline.
  takerDelayMs: 500,
  takerDelaySportsMs: 3_000,
  gtdSweepS: 10,
  // Own throttle: 4 requests per second per host (the orderbook documents 5).
  requestsPerSecondPerHost: 4,
  // Explorer getLogs returns at most this many rows and ignores `page`.
  explorerLogRowCap: 1_000,
  // PayBox plugin: 10 s per call, 16 hosts.
  pluginCallBudgetMs: 10_000,
  pluginMaxHosts: 16,
});

// ---------------------------------------------------------------------------------------------
// Assembled objects (for callers that want the domains as values)
// ---------------------------------------------------------------------------------------------

export const ORDER_DOMAIN = Object.freeze({
  name: ORDER_DOMAIN_NAME,
  version: ORDER_DOMAIN_VERSION,
  chainId: XO_CHAIN_ID,
  verifyingContract: CTF_EXCHANGE,
});

// The Kernel wrapper domain minus verifyingContract, which is the account being signed for.
export const KERNEL_DOMAIN_BASE = Object.freeze({
  name: KERNEL_DOMAIN_NAME,
  version: KERNEL_DOMAIN_VERSION,
  chainId: XO_CHAIN_ID,
});

export const CLOB_AUTH_DOMAIN = Object.freeze({
  name: CLOB_AUTH_DOMAIN_NAME,
  version: CLOB_AUTH_DOMAIN_VERSION,
  chainId: XO_CHAIN_ID,
});

// Paymaster policy as seen on 2026-10-18 (checkPolicy for a never-seen address). READ: the policy is
// editable by the paymaster owner at any time, so tripwires.ts compares a fresh probe with this list
// and reports a change; it never treats this table as the source of truth. H (dated) [21 V1.10].
export interface PaymasterPolicyProbe {
  readonly label: string;
  readonly target: Address;
  readonly selector: Hex;
  readonly allowed: boolean;
}
export const PAYMASTER_POLICY_PROBES: readonly PaymasterPolicyProbe[] = Object.freeze([
  { label: "USDC.e approve (global)", target: USDC_E_ADDRESS, selector: APPROVE_SELECTOR, allowed: true },
  { label: "USDC.e transfer", target: USDC_E_ADDRESS, selector: "0xa9059cbb", allowed: true },
  { label: "USDC.e transferFrom", target: USDC_E_ADDRESS, selector: "0x23b872dd", allowed: false },
  { label: "CTF setApprovalForAll", target: CONDITIONAL_TOKENS, selector: "0xa22cb465", allowed: true },
  { label: "CTF redeemPositions", target: CONDITIONAL_TOKENS, selector: "0x01b7037c", allowed: true },
  { label: "CTF splitPosition", target: CONDITIONAL_TOKENS, selector: "0x72ce4275", allowed: true },
  { label: "CTF mergePositions", target: CONDITIONAL_TOKENS, selector: "0x9e7212ad", allowed: true },
  { label: "CTF safeBatchTransferFrom", target: CONDITIONAL_TOKENS, selector: "0x2eb2c2d6", allowed: false },
  { label: "manager createConvictionMarket", target: MARKET_MANAGER, selector: CREATE_CONVICTION_MARKET_SELECTOR, allowed: true },
  { label: "manager respondToUpdateRequest", target: MARKET_MANAGER, selector: RESPOND_TO_UPDATE_REQUEST_SELECTOR, allowed: true },
  { label: "manager cancelMarket", target: MARKET_MANAGER, selector: CANCEL_MARKET_SELECTOR, allowed: true },
  { label: "manager updateMetadata", target: MARKET_MANAGER, selector: UPDATE_METADATA_SELECTOR_NEVER_CALL, allowed: false },
  { label: "route transferRemote", target: XO_WARP_ROUTE, selector: TRANSFER_REMOTE_SELECTOR, allowed: false },
  { label: "exchange incrementNonce", target: CTF_EXCHANGE, selector: "0x627cdcb9", allowed: false },
] as const satisfies readonly PaymasterPolicyProbe[]);

// Every pinned contract in one table, built from the constants above. For documentation, monitoring
// and the tests; consumers still import the individual constants.
export type PinClass = "PIN" | "PIN+TRIPWIRE" | "READ" | "INFO";
export interface PinnedContract {
  readonly name: string;
  readonly address: Address;
  readonly chain: "xo" | "base";
  readonly pin: PinClass;
}
export const PINNED_CONTRACTS: readonly PinnedContract[] = Object.freeze([
  { name: "ENTRY_POINT_V07", address: ENTRY_POINT_V07, chain: "xo", pin: "PIN" },
  { name: "KERNEL_FACTORY", address: KERNEL_FACTORY, chain: "xo", pin: "PIN" },
  { name: "KERNEL_IMPLEMENTATION", address: KERNEL_IMPLEMENTATION, chain: "xo", pin: "PIN" },
  { name: "ECDSA_VALIDATOR", address: ECDSA_VALIDATOR, chain: "xo", pin: "PIN" },
  { name: "POLICY_PAYMASTER", address: POLICY_PAYMASTER, chain: "xo", pin: "PIN+TRIPWIRE" },
  { name: "CTF_EXCHANGE", address: CTF_EXCHANGE, chain: "xo", pin: "PIN+TRIPWIRE" },
  { name: "EXCHANGE_IMPLEMENTATION", address: EXCHANGE_IMPLEMENTATION, chain: "xo", pin: "PIN+TRIPWIRE" },
  { name: "USDC_E_ADDRESS", address: USDC_E_ADDRESS, chain: "xo", pin: "PIN" },
  { name: "CONDITIONAL_TOKENS", address: CONDITIONAL_TOKENS, chain: "xo", pin: "PIN" },
  { name: "MARKET_MANAGER", address: MARKET_MANAGER, chain: "xo", pin: "PIN+TRIPWIRE" },
  { name: "MANAGER_IMPLEMENTATION", address: MANAGER_IMPLEMENTATION, chain: "xo", pin: "PIN+TRIPWIRE" },
  { name: "ACCESS_MANAGER", address: ACCESS_MANAGER, chain: "xo", pin: "PIN" },
  { name: "CONFIG_MANAGER", address: CONFIG_MANAGER, chain: "xo", pin: "PIN" },
  { name: "XO_ORACLE", address: XO_ORACLE, chain: "xo", pin: "INFO" },
  { name: "MARKET_NFT", address: MARKET_NFT, chain: "xo", pin: "INFO" },
  { name: "MARKET_NFT_IMPLEMENTATION", address: MARKET_NFT_IMPLEMENTATION, chain: "xo", pin: "INFO" },
  { name: "XO_WARP_ROUTE", address: XO_WARP_ROUTE, chain: "xo", pin: "PIN" },
  { name: "XO_ROUTE_IMPLEMENTATION", address: XO_ROUTE_IMPLEMENTATION, chain: "xo", pin: "PIN" },
  { name: "HYPERLANE_MAILBOX (XO)", address: HYPERLANE_MAILBOX, chain: "xo", pin: "PIN" },
  { name: "BASE_WARP_ROUTER", address: BASE_WARP_ROUTER, chain: "base", pin: "PIN+TRIPWIRE" },
  { name: "BASE_ROUTER_IMPLEMENTATION", address: BASE_ROUTER_IMPLEMENTATION, chain: "base", pin: "PIN+TRIPWIRE" },
  { name: "BASE_USDC", address: BASE_USDC, chain: "base", pin: "PIN" },
  { name: "HYPERLANE_MAILBOX (Base)", address: HYPERLANE_MAILBOX, chain: "base", pin: "PIN" },
  { name: "HYPERLANE_HOOK", address: HYPERLANE_HOOK, chain: "base", pin: "PIN" },
  { name: "HYPERLANE_ISM", address: HYPERLANE_ISM, chain: "base", pin: "PIN" },
] as const satisfies readonly PinnedContract[]);

// ---- the CLOB venues besides XO (not XO contracts) ----------------------------------------------------------------
//
// src/clob/venues.ts names these with their sources (docs.polymarket.com/resources/contracts and trading/place-orders,
// read 2026-10-21; docs/research/37-aa-venue-accounts.md section 4.5 for Limitless). They live here only because this
// file is the one that may hold an address literal (test/chain-constants.test.ts); they are not pinned contracts of
// XO's chain and are not on any tripwire. Polygon mainnet (137) for Polymarket, Base mainnet (8453) for Limitless.
export const POLYMARKET_EXCHANGE_V3 = "0xe3333700cA9d93003F00f0F71f8515005F6c00Aa" as const;
export const POLYMARKET_CTF_EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B" as const;
export const POLYMARKET_NEG_RISK_EXCHANGE = "0xe2222d279d744050d28e00520010520000310F59" as const;
export const LIMITLESS_CTF_EXCHANGE = "0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5" as const;

// Polymarket's Deposit Wallet (signature type 3, POLY_1271), Polygon mainnet (137). Used by src/clob/polymarket/
// deposit-wallet.ts to derive an owner's wallet address and by the relay to confirm it on chain. Sources:
//   - factory and beacon: docs.polymarket.com/trading/wallets-auth.md "Derive a Deposit Wallet Address" (read
//     2026-10-21): "factory = 0x00000000000Fb5C9ADea0298D729A0CB3823Cc07", "beacon = 0x7A18EDfe055488A3128f01F563e5B479D92ffc3a";
//     the same two values are the production `walletDerivation` of the official client, npm @polymarket/client 0.13.0
//     (github.com/Polymarket/ts-sdk packages/client, src/environments.ts).
//   - UUPS implementation (wallets deployed before the beacon upgrade): @polymarket/client 0.13.0 environments.ts
//     `depositWalletImplementation`; Sourcify exact match (creation and runtime) on chain 137, contract
//     src/DepositWallet.sol, verified 2026-05-01. The factory's own `implementation()` returned it on 2026-10-21.
//   - current beacon implementation: what the beacon's `implementation()` returned on 2026-10-21 over the Polygon
//     public RPC (sdk/venues/origins.ts rpc_polygon); Sourcify exact match on chain 137, verified 2026-07-28. Used
//     only by the anvil test; nothing at runtime depends on which implementation the beacon serves (the relay reads
//     the wallet's own eip712Domain() instead).
export const POLYMARKET_DEPOSIT_WALLET_FACTORY = "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07" as const;
export const POLYMARKET_DEPOSIT_WALLET_BEACON = "0x7A18EDfe055488A3128f01F563e5B479D92ffc3a" as const;
export const POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION = "0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB" as const;
export const POLYMARKET_DEPOSIT_WALLET_BEACON_IMPLEMENTATION = "0xf7f27C29e60fe6325beF8dA7F93250353d2e3294" as const;
