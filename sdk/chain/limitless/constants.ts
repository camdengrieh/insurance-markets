import type { ContractPin } from "../pins.js";

// Limitless on Base (chain 8453): the contracts that hold positions, settle fills and resolve markets. Every address
// is the strict EIP-55 form and was taken from Limitless's own contract list,
//   docs.limitless.exchange/user-guide/smart-contracts.md (read 2026-10-22),
// which says to query all three venue versions ("Each processes active trades"). Each was then checked against the
// deployed code: test/fixtures/chain-bytecode/capture.ts read eth_getCode over the public RPC below on 2026-10-22 and
// Sourcify's verified on-chain code for the same address; the two were equal for every contract here (Sourcify
// exact_match for the exchanges, adapters and wrapped collateral, match for Conditional Tokens).
// test/chain-pins.test.ts re-hashes the recorded code. On 2026-10-22 every exchange's getCtf() named either the pinned
// Conditional Tokens (simple markets) or its version's pinned NegRisk Adapter, and every getCollateral() named Base
// USDC. NO address ever comes from market text or an API answer: a market's `venue.exchange` is only ever CHECKED
// against this list.

export const BASE_CHAIN_ID = 8453;
// The public RPC the standalone build may call (sdk/venues/origins.ts rpc_base).
export const BASE_RPC_URL = "https://base-rpc.publicnode.com/";

const LIST = "docs.limitless.exchange/user-guide/smart-contracts.md (read 2026-10-22)";
const READ_ON = "2026-10-22";

export const LIMITLESS_CONDITIONAL_TOKENS = "0xC9c98965297Bc527861c898329Ee280632B76e18" as const;
// Native USDC on Base, the collateral of simple markets ("Key token addresses").
export const LIMITLESS_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
// Simple markets, venue versions 1 to 3.
export const LIMITLESS_CTF_EXCHANGE_V1 = "0xa4409D988CA2218d956BeEFD3874100F444f0DC3" as const;
export const LIMITLESS_CTF_EXCHANGE_V2 = "0xF1De958F8641448A5ba78c01f434085385Af096D" as const;
export const LIMITLESS_CTF_EXCHANGE = "0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5" as const;
// NegRisk markets, venue versions 1 to 3: exchange, adapter and the wrapped collateral their positions derive from.
export const LIMITLESS_NEG_RISK_EXCHANGE_V1 = "0x5a38afc17F7E97ad8d6C547ddb837E40B4aEDfC6" as const;
export const LIMITLESS_NEG_RISK_EXCHANGE_V2 = "0x46e607D3f4a8494B0aB9b304d1463e2F4848891d" as const;
export const LIMITLESS_NEG_RISK_EXCHANGE_V3 = "0xe3E00BA3a9888d1DE4834269f62ac008b4BB5C47" as const;
export const LIMITLESS_NEG_RISK_ADAPTER_V1 = "0xb8DAA4C8C9f690396f671BB601727A4c3741340C" as const;
export const LIMITLESS_NEG_RISK_ADAPTER_V2 = "0x7afeB946986211950d17f24176039F12c2aB2436" as const;
export const LIMITLESS_NEG_RISK_ADAPTER_V3 = "0x6151EF8368b6316c1aa3C68453EF083ad31E712D" as const;
// The list prints the v1 wrapped collateral in lower case; this is its EIP-55 form.
export const LIMITLESS_WRAPPED_COLLATERAL_V1 = "0x5d6C6a4fEA600E0b1A3Ab3eF711060310E27886A" as const;
export const LIMITLESS_WRAPPED_COLLATERAL_V2 = "0x428F0FC93221A9957dC667baa07E62d50c6b8c03" as const;
export const LIMITLESS_WRAPPED_COLLATERAL_V3 = "0xBd8Ff5Ac78A3739037FEaA18278cC157C4798B01" as const;

export const LIMITLESS_SHARE_DECIMALS = 6;

function pin(name: string, address: `0x${string}`, codeHash: `0x${string}`, codeSize: number, contract: string, kind: "match" | "exact_match" = "exact_match"): ContractPin {
  return Object.freeze({
    chainId: BASE_CHAIN_ID,
    name,
    address,
    codeHash,
    codeSize,
    implementation: null,
    source: LIST,
    verified: `Sourcify ${kind} (${contract}); its on-chain code equals eth_getCode`,
    readOn: READ_ON,
  });
}

export const LIMITLESS_PINS = Object.freeze({
  conditionalTokens: pin("Limitless Conditional Tokens", LIMITLESS_CONDITIONAL_TOKENS, "0x490112daa6f9710eff7dff64da7f28052b59d26f0a91be00d18a8ca20a77b351", 16005, "ConditionalTokens", "match"),
  usdc: pin("USDC (Base)", LIMITLESS_USDC, "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab", 1852, "FiatTokenProxy"),
  exchangeV1: pin("Limitless CTF Exchange v1", LIMITLESS_CTF_EXCHANGE_V1, "0x412e63fef5e907ffc4fd8e5e9e1e39df54074e5c40d07195d5d05e37bcb4a25c", 19300, "CTFExchange"),
  exchangeV2: pin("Limitless CTF Exchange v2", LIMITLESS_CTF_EXCHANGE_V2, "0x5c6a1ef30f05928d3085d46a276d6817915533ea48f8583f9715e38817eb147e", 17060, "CTFExchange"),
  exchangeV3: pin("Limitless CTF Exchange v3", LIMITLESS_CTF_EXCHANGE, "0x8b89a2843f44dedfadf79cda35108339991ead46c2cfe7017b2c3149da5bfd24", 17178, "CTFExchange"),
  negRiskExchangeV1: pin("Limitless NegRisk CTF Exchange v1", LIMITLESS_NEG_RISK_EXCHANGE_V1, "0x4201369660af926de36359e59d099429bd24703ca38e7ae597e671cc061539ca", 19366, "NegRiskCtfExchange"),
  negRiskExchangeV2: pin("Limitless NegRisk CTF Exchange v2", LIMITLESS_NEG_RISK_EXCHANGE_V2, "0x382b87e55362fddfdd9928d96854563422f98cef37216e8d4431db331fd330f7", 17060, "NegRiskCtfExchange"),
  negRiskExchangeV3: pin("Limitless NegRisk CTF Exchange v3", LIMITLESS_NEG_RISK_EXCHANGE_V3, "0x1d26885eb0cc2fd17c3ba8d661ed545f4e39b4b67cd3b0bac5e266d83d6e9f52", 17178, "NegRiskCtfExchange"),
  negRiskAdapterV1: pin("Limitless NegRisk Adapter v1", LIMITLESS_NEG_RISK_ADAPTER_V1, "0x55f104271b431363f9dfa6c4f7a5c0d15e23cf6fe020b5bcb5d4926e30c37b31", 17258, "NegRiskAdapter"),
  negRiskAdapterV2: pin("Limitless NegRisk Adapter v2", LIMITLESS_NEG_RISK_ADAPTER_V2, "0x2c45e13cd3bda5c499d2d5c7ac23143a927e736d325c5d295756732899f65d39", 14595, "NegRiskAdapter"),
  negRiskAdapterV3: pin("Limitless NegRisk Adapter v3", LIMITLESS_NEG_RISK_ADAPTER_V3, "0xe20a2e6cd5228c0f7e75bb7aadfd73213e914ebeca9d4bf3b45d5e4831a49473", 14595, "NegRiskAdapter"),
  wrappedCollateralV1: pin("Limitless Wrapped Collateral v1", LIMITLESS_WRAPPED_COLLATERAL_V1, "0xb6cd69801fcdc3044bcea5904b3e7ee8f4dd261a1e6b4f8f59228399660f3f70", 4914, "WrappedCollateral"),
  wrappedCollateralV2: pin("Limitless Wrapped Collateral v2", LIMITLESS_WRAPPED_COLLATERAL_V2, "0x40caf8d8ec7134688a992ba288292bc1d3dc0263c953e4220efd2fed10c5fccf", 3981, "WrappedCollateral"),
  wrappedCollateralV3: pin("Limitless Wrapped Collateral v3", LIMITLESS_WRAPPED_COLLATERAL_V3, "0xc91b0f8d5085c9743639aa686b239c736f012280fa789be589c89f33fe9e8f45", 3981, "WrappedCollateral"),
});

// Every exchange, in venue-version order: the ones a token's condition is looked up on (getConditionId).
export const LIMITLESS_EXCHANGES: readonly `0x${string}`[] = Object.freeze([
  LIMITLESS_CTF_EXCHANGE_V1,
  LIMITLESS_CTF_EXCHANGE_V2,
  LIMITLESS_CTF_EXCHANGE,
  LIMITLESS_NEG_RISK_EXCHANGE_V1,
  LIMITLESS_NEG_RISK_EXCHANGE_V2,
  LIMITLESS_NEG_RISK_EXCHANGE_V3,
]);

// The collaterals a Limitless position id can be derived from: USDC for simple markets, a version's wrapped
// collateral for NegRisk markets.
export const LIMITLESS_COLLATERALS: readonly `0x${string}`[] = Object.freeze([LIMITLESS_USDC, LIMITLESS_WRAPPED_COLLATERAL_V1, LIMITLESS_WRAPPED_COLLATERAL_V2, LIMITLESS_WRAPPED_COLLATERAL_V3]);
