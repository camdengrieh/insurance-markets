import type { ChainKey } from "../config.js";
import { CONDITION_RESOLUTION_TOPIC } from "../../sdk/chain/ctf.js";
import { orderFilledTopic, type FillShape } from "../../sdk/chain/fills.js";
import type { ContractPin } from "../../sdk/chain/pins.js";
import type { Hex } from "../../sdk/chain/rpc.js";
import { LIMITLESS_PINS, LIMITLESS_SHARE_DECIMALS } from "../../sdk/chain/limitless/constants.js";
import { POLYMARKET_PINS, POLYMARKET_SHARE_DECIMALS } from "../../sdk/chain/polymarket/constants.js";
import { SHARE_DECIMALS as XO_SHARE_DECIMALS, USDC_E_DECIMALS as XO_USDC_DECIMALS } from "../../sdk/chain/xo/constants.js";
import { XO_PINS } from "../../sdk/chain/xo/pins.js";
import { CONDITION_PREPARATION_TOPIC, MODULE_CONDITION_RESOLVED_TOPIC } from "./events.js";

// What the indexer reads on each chain (docs/sdk-and-api-design.md section 7). Every contract is a pin from the SDK
// (sdk/chain/<venue>/constants.ts, sdk/chain/xo/pins.ts): an address from the venue's own contract list whose deployed
// code was checked, and which the indexer checks again (createPinGuard) before it reads a single log. No address comes
// from configuration, a venue answer or market text.
//
//   exchange  OrderFilled, decoded by the SDK's verified fragment for its shape (sdk/chain/fills.ts)
//   ledger    Conditional Tokens: ConditionResolution (payouts) and ConditionPreparation (condition creation)
//   module    Polymarket Protocol V2's BinaryModule and NegRiskModule: ConditionResolved (results in parts per million)

export type ContractRole = "exchange" | "ledger" | "module";

export interface IndexedContract {
  readonly pin: ContractPin;
  readonly role: ContractRole;
  // Exchanges only.
  readonly shape?: FillShape;
  // Exchanges only: the decimals of the collateral and of the outcome shares its fills move, where both are pinned. Null:
  // a fill's amounts are stored but no price is stated from them.
  readonly decimals?: { readonly collateral: number; readonly shares: number } | null;
}

export interface ChainSpec {
  readonly key: ChainKey;
  readonly chainId: number;
  // Fixed words for a field's origin.
  readonly via: string;
  readonly venue: "polymarket" | "limitless" | "xo";
  readonly contracts: readonly IndexedContract[];
  // Blocks per eth_getLogs: where a new chain starts, and the most it grows to (the RPC port refuses more than 10,000).
  readonly initialSpan: number;
  readonly maxSpan: number;
  // Between two passes.
  readonly tickMs: number;
}

export const CHAIN_SPECS: Readonly<Record<ChainKey, ChainSpec>> = Object.freeze({
  polygon: {
    key: "polygon",
    chainId: 137,
    via: "Polygon 137",
    venue: "polymarket",
    contracts: [
      // USDC.e (6 decimals) against Conditional Tokens shares (POLYMARKET_SHARE_DECIMALS).
      { pin: POLYMARKET_PINS.ctfExchange, role: "exchange", shape: "polymarket", decimals: { collateral: 6, shares: POLYMARKET_SHARE_DECIMALS } },
      { pin: POLYMARKET_PINS.negRiskExchange, role: "exchange", shape: "polymarket", decimals: { collateral: 6, shares: POLYMARKET_SHARE_DECIMALS } },
      // Protocol V2: its collateral and position decimals are not pinned, so no price is stated from its fills.
      { pin: POLYMARKET_PINS.exchangeV3, role: "exchange", shape: "polymarket", decimals: null },
      { pin: POLYMARKET_PINS.conditionalTokens, role: "ledger" },
      { pin: POLYMARKET_PINS.binaryModule, role: "module" },
      { pin: POLYMARKET_PINS.negRiskModule, role: "module" },
    ],
    // Polymarket settles many fills a block: start small and let the span adapt.
    initialSpan: 5,
    maxSpan: 200,
    tickMs: 6_000,
  },
  base: {
    key: "base",
    chainId: 8453,
    via: "Base 8453",
    venue: "limitless",
    contracts: [
      ...[LIMITLESS_PINS.exchangeV1, LIMITLESS_PINS.exchangeV2, LIMITLESS_PINS.exchangeV3, LIMITLESS_PINS.negRiskExchangeV1, LIMITLESS_PINS.negRiskExchangeV2, LIMITLESS_PINS.negRiskExchangeV3].map(
        (pin): IndexedContract => ({ pin, role: "exchange", shape: "limitless", decimals: { collateral: 6, shares: LIMITLESS_SHARE_DECIMALS } }),
      ),
      { pin: LIMITLESS_PINS.conditionalTokens, role: "ledger" },
    ],
    initialSpan: 200,
    maxSpan: 2_000,
    tickMs: 10_000,
  },
  xo: {
    key: "xo",
    chainId: 3223,
    via: "XO chain 3223",
    venue: "xo",
    contracts: [
      { pin: XO_PINS.ctfExchange, role: "exchange", shape: "xo", decimals: { collateral: XO_USDC_DECIMALS, shares: XO_SHARE_DECIMALS } },
      { pin: XO_PINS.conditionalTokens, role: "ledger" },
    ],
    initialSpan: 500,
    maxSpan: 5_000,
    tickMs: 10_000,
  },
} satisfies Record<ChainKey, ChainSpec>);

// The topic0 alternatives of one chain's eth_getLogs filter.
export function topicsOf(spec: ChainSpec): Hex[] {
  const out = new Set<Hex>();
  for (const contract of spec.contracts) {
    if (contract.role === "exchange" && contract.shape !== undefined) out.add(orderFilledTopic(contract.shape));
    if (contract.role === "ledger") {
      out.add(CONDITION_RESOLUTION_TOPIC);
      out.add(CONDITION_PREPARATION_TOPIC);
    }
    if (contract.role === "module") out.add(MODULE_CONDITION_RESOLVED_TOPIC);
  }
  return [...out];
}

export function chainSpecById(chainId: number): ChainSpec | null {
  return Object.values(CHAIN_SPECS).find((spec) => spec.chainId === chainId) ?? null;
}
