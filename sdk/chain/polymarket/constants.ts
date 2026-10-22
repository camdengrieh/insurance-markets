import type { ContractPin } from "../pins.js";

// Polymarket on Polygon (chain 137): the contracts that hold positions, settle fills and resolve markets. Every address
// is the strict EIP-55 form and was taken from Polymarket's own contract list,
//   docs.polymarket.com/resources/contracts.md (read 2026-10-22),
// or from a getter of a contract on that list whose source is verified (named per entry). Each was then checked
// against the deployed code: test/fixtures/chain-bytecode/capture.ts read eth_getCode over the public RPC below on
// 2026-10-22, and Sourcify's verified on-chain code for the same address, and the two were equal for every contract
// with a Sourcify entry. The minimal proxies have no Sourcify entry of their own; their EIP-1967 slot names an
// implementation that does, and both are pinned. test/chain-pins.test.ts re-hashes the recorded code.
//
// Two position systems exist (docs.polymarket.com/resources/onchain-position-data.md, read 2026-10-22). A market's
// Gamma `version` says which: "v1" positions are Conditional Tokens ids (ERC-1155 on CONDITIONAL_TOKENS), "v2" ones are
// Polymarket Protocol V2 position ids (ERC-1155 on POSITION_MANAGER). NO address ever comes from market text, an API
// answer or a model.

export const POLYGON_CHAIN_ID = 137;
// The public RPC the standalone build may call (sdk/venues/origins.ts rpc_polygon).
export const POLYGON_RPC_URL = "https://polygon-bor-rpc.publicnode.com/";

const LIST = "docs.polymarket.com/resources/contracts.md (read 2026-10-22)";
const READ_ON = "2026-10-22";

// ---- CTF system ("v1" markets) ----
export const POLYMARKET_CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
export const POLYMARKET_CTF_EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B" as const;
export const POLYMARKET_NEG_RISK_EXCHANGE = "0xe2222d279d744050d28e00520010520000310F59" as const;
// "Neg Risk Adapter (CTF negative-risk approvals)": prepares negative-risk conditions and wraps their collateral.
export const POLYMARKET_NEG_RISK_ADAPTER = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296" as const;
export const POLYMARKET_CTF_COLLATERAL_ADAPTER = "0xAdA100Db00Ca00073811820692005400218FcE1f" as const;
// The collateral a CTF position id is derived from. USDC.e: USDCE() of the CtfCollateralAdapter and col() of the
// NegRiskAdapter (both Sourcify exact matches) returned it on 2026-10-22. The wrapped collateral of negative-risk
// markets: wcol() of the NegRiskAdapter, the same day. The venue's own token ids for a plain and a negative-risk market
// derive from these exactly (sdk/chain/readers.test.ts).
export const POLYMARKET_USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
export const POLYMARKET_WRAPPED_COLLATERAL = "0x3A3BD7bb9528E159577F7C2e685CC81A765002E2" as const;
// The UMA CTF adapters, the oracles that report CTF results (the "UmaCtfAdapter" rows of the list). The list prints a
// third, "v1.0.0", at the address it also calls the UMA Optimistic Oracle; that row is ambiguous and is not pinned.
export const POLYMARKET_UMA_CTF_ADAPTER_V3_1 = "0x157Ce2d672854c848c9b79C49a8Cc6cc89176a49" as const;
export const POLYMARKET_UMA_CTF_ADAPTER_V2 = "0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74" as const;

// ---- Polymarket Protocol V2 ("v2" markets) ----
export const POLYMARKET_EXCHANGE_V3 = "0xe3333700cA9d93003F00f0F71f8515005F6c00Aa" as const;
export const POLYMARKET_EXCHANGE_V3_IMPLEMENTATION = "0x641b40ec414a076b9e79E703Fc7BF4EBEC248Bb7" as const;
export const POLYMARKET_POSITION_MANAGER = "0x006F54F7f9A22e0000CC2AB60031000000ae9fEF" as const;
export const POLYMARKET_POSITION_MANAGER_IMPLEMENTATION = "0xCc5De1e9D14a7AB75E872E23FC9D605518Bac2D0" as const;
export const POLYMARKET_BINARY_MODULE = "0x1000008dD9001B968442c1000017eaE6E0dA00Ba" as const;
export const POLYMARKET_BINARY_MODULE_IMPLEMENTATION = "0xf6428c0B5fa9361c0708CDdb95468cf54C56e9A2" as const;
export const POLYMARKET_NEG_RISK_MODULE = "0x200000900045e3B6259600682756002200028933" as const;
export const POLYMARKET_NEG_RISK_MODULE_IMPLEMENTATION = "0x39a5B01a100edF811f2748aa37B1313715Ded70e" as const;

// Position ids of the CTF system, like every Conditional Tokens id, carry 6-decimal collateral units.
export const POLYMARKET_SHARE_DECIMALS = 6;

function pin(name: string, address: `0x${string}`, codeHash: `0x${string}`, codeSize: number, verified: string, source: string = LIST, implementation: ContractPin | null = null): ContractPin {
  return Object.freeze({ chainId: POLYGON_CHAIN_ID, name, address, codeHash, codeSize, implementation, source, verified, readOn: READ_ON });
}

const SOURCIFY = (kind: "match" | "exact_match", contract: string): string => `Sourcify ${kind} (${contract}); its on-chain code equals eth_getCode`;
const MINIMAL_PROXY = "a 61-byte ERC-1967 minimal proxy (no Sourcify entry); its slot names the pinned implementation";

export const POLYMARKET_PINS = Object.freeze({
  conditionalTokens: pin("Polymarket Conditional Tokens", POLYMARKET_CONDITIONAL_TOKENS, "0xbe524e094025c2a1122ccfbe3264e29fe662d7e0ae518b6926135c814405eceb", 15007, SOURCIFY("match", "ConditionalTokens")),
  ctfExchange: pin("Polymarket CTF Exchange", POLYMARKET_CTF_EXCHANGE, "0xa08da89bbac2063dfa6a705e70314d218d40fb2b2a6405442297c241fcd58401", 21037, SOURCIFY("match", "CTFExchange")),
  negRiskExchange: pin("Polymarket Neg Risk CTF Exchange", POLYMARKET_NEG_RISK_EXCHANGE, "0x04b857d48dcc38b3d484239569dc96a7a6c39bbb90ed2461227fc6e50ed5787d", 21037, SOURCIFY("match", "CTFExchange")),
  negRiskAdapter: pin("Polymarket Neg Risk Adapter", POLYMARKET_NEG_RISK_ADAPTER, "0x10798bfdebdc3b8727171551b1287ee4c87b486045ed51a6ddc94e34f66560a1", 17258, SOURCIFY("exact_match", "NegRiskAdapter")),
  ctfCollateralAdapter: pin("Polymarket CtfCollateralAdapter", POLYMARKET_CTF_COLLATERAL_ADAPTER, "0x93b965351d01c1a128821ac79fc98a18105daefb46bda0d1e5b52306d713aa4f", 11096, SOURCIFY("exact_match", "CtfCollateralAdapter")),
  usdcE: pin("USDC.e (Polygon)", POLYMARKET_USDC_E, "0xa97604bff5b11d790aca38bf9f6189369ea260f08365b428fc2ef73390fddcef", 2037, SOURCIFY("match", "UChildERC20Proxy"), "USDCE() of the CtfCollateralAdapter and col() of the NegRiskAdapter, read 2026-10-22"),
  wrappedCollateral: pin("Polymarket WrappedCollateral", POLYMARKET_WRAPPED_COLLATERAL, "0x99c62168488983e6ac023c62a6dca53acc7e8e902849fb72a9b08f29545dc474", 4914, SOURCIFY("exact_match", "WrappedCollateral"), "wcol() of the NegRiskAdapter, read 2026-10-22"),
  umaCtfAdapterV3_1: pin("Polymarket UmaCtfAdapter v3.1.0", POLYMARKET_UMA_CTF_ADAPTER_V3_1, "0xe44d7e53a84493f6b71255e19f42f7cea9b8be486492fee80529c75d75f61579", 16185, SOURCIFY("match", "UmaCtfAdapter")),
  umaCtfAdapterV2: pin("Polymarket UmaCtfAdapter v2.0.0", POLYMARKET_UMA_CTF_ADAPTER_V2, "0x18957c31c3b8369c5737be2d9ea2a3cccade4ec22a5fef043a2526bc9627cc3e", 14139, SOURCIFY("exact_match", "UmaCtfAdapter")),
  exchangeV3: pin(
    "Polymarket Exchange (Protocol V2)",
    POLYMARKET_EXCHANGE_V3,
    "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
    61,
    MINIMAL_PROXY,
    LIST,
    pin("Polymarket Exchange implementation", POLYMARKET_EXCHANGE_V3_IMPLEMENTATION, "0x42b8522e8b56d0587bc02e66a37e43614911580ded1c676a925f5373c7f2fcd6", 22256, SOURCIFY("match", "Exchange")),
  ),
  positionManager: pin(
    "Polymarket PositionManager",
    POLYMARKET_POSITION_MANAGER,
    "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
    61,
    MINIMAL_PROXY,
    LIST,
    pin("Polymarket PositionManager implementation", POLYMARKET_POSITION_MANAGER_IMPLEMENTATION, "0x4f3ca1f933ee48546581d8ee28506e5c5b89d08e50900ff880603cedcde14c9e", 10235, SOURCIFY("match", "PositionManager")),
  ),
  binaryModule: pin(
    "Polymarket BinaryModule",
    POLYMARKET_BINARY_MODULE,
    "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
    61,
    MINIMAL_PROXY,
    LIST,
    pin("Polymarket BinaryModule implementation", POLYMARKET_BINARY_MODULE_IMPLEMENTATION, "0xe378ba6d5142d89ab97c857f762043f2a388b9d2049fe1b79b5694881a3d445a", 23189, SOURCIFY("match", "BinaryModule")),
  ),
  negRiskModule: pin(
    "Polymarket NegRiskModule",
    POLYMARKET_NEG_RISK_MODULE,
    "0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d",
    61,
    MINIMAL_PROXY,
    LIST,
    pin("Polymarket NegRiskModule implementation", POLYMARKET_NEG_RISK_MODULE_IMPLEMENTATION, "0xd4e04b562d38982ce9e51ecffaa1b7260cac7c9cce782a7d4bb3ae0512ee061a", 28479, SOURCIFY("match", "NegRiskModule")),
  ),
});
