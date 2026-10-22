// Fixed facts about the two EIP-712 CLOB venues the Cockpit can prepare orders for besides XO. Everything here was
// read from a primary source named beside it; a value that can change at runtime (a market's tick, its minimum size,
// its exchange on Limitless) is read live by the relay and only CHECKED against what is pinned here.
//
// PORTABLE: no node:* import. The page bundles this file (the ticket shows the venue's tick and exchange).

import type { Address } from "viem";

import { LIMITLESS_CTF_EXCHANGE, POLYMARKET_CTF_EXCHANGE, POLYMARKET_EXCHANGE_V3, POLYMARKET_NEG_RISK_EXCHANGE } from "../../chain/xo/constants.js";

export const CLOB_VENUES = ["polymarket", "limitless"] as const;
export type ClobVenue = (typeof CLOB_VENUES)[number];

export function isClobVenue(value: unknown): value is ClobVenue {
  return typeof value === "string" && (CLOB_VENUES as readonly string[]).includes(value);
}

// Polygon mainnet and Base mainnet (docs.polymarket.com/resources/contracts.md: "All addresses below are on Polygon
// mainnet (chain ID 137)"; docs.limitless.exchange/developers/eip712-signing: chainId 8453).
export const CLOB_CHAIN_IDS: Readonly<Record<ClobVenue, 137 | 8453>> = Object.freeze({ polymarket: 137, limitless: 8453 });

// Both venues settle in a 6-decimal collateral: Polymarket in pUSD (docs.polymarket.com/migrate/polymarket-v2: pUSD
// backed by USDC), Limitless in native USDC on Base (eip712-signing: "USDC and shares both use 6 decimals").
export const CLOB_COLLATERAL_DECIMALS = 6;
export const CLOB_COLLATERAL_SYMBOL: Readonly<Record<ClobVenue, string>> = Object.freeze({ polymarket: "pUSD", limitless: "USDC" });

// ---- Polymarket ------------------------------------------------------------------------------------------------------------
//
// docs.polymarket.com/trading/place-orders.md (read 2026-10-21): the EIP-712 domain name is "Polymarket CTF Exchange" on
// chain 137; the version and verifyingContract depend on the order book a market trades on:
//   - Protocol V2 book (Gamma `version: "v2"`): version "3", verifyingContract POLYMARKET_EXCHANGE_V3
//   - CTF book, neg_risk false:                  version "2", verifyingContract POLYMARKET_CTF_EXCHANGE
//   - CTF book, neg_risk true:                   version "2", verifyingContract POLYMARKET_NEG_RISK_EXCHANGE
// The three addresses also appear on docs.polymarket.com/resources/contracts.md (Exchange V3 proxy, CTF Exchange, Neg
// Risk CTF Exchange). The literals themselves live in sdk/chain/xo/constants.ts, the one file that may hold one.
export const POLYMARKET_BOOKS = ["v2", "ctf", "neg_risk"] as const;
export type PolymarketBook = (typeof POLYMARKET_BOOKS)[number];

export const POLYMARKET_ORDER_DOMAIN_NAME = "Polymarket CTF Exchange";
export const POLYMARKET_EXCHANGES: Readonly<Record<PolymarketBook, { readonly version: "2" | "3"; readonly verifyingContract: Address }>> = Object.freeze({
  v2: { version: "3", verifyingContract: POLYMARKET_EXCHANGE_V3 },
  ctf: { version: "2", verifyingContract: POLYMARKET_CTF_EXCHANGE },
  neg_risk: { version: "2", verifyingContract: POLYMARKET_NEG_RISK_EXCHANGE },
});

// Which book a (version, verifyingContract) pair names, or undefined when it is none of the three pinned ones.
export function polymarketBookOf(version: string, verifyingContract: string): PolymarketBook | undefined {
  const wanted = verifyingContract.toLowerCase();
  for (const book of POLYMARKET_BOOKS) {
    const entry = POLYMARKET_EXCHANGES[book];
    if (entry.version === version && entry.verifyingContract.toLowerCase() === wanted) return book;
  }
  return undefined;
}

// place-orders.md: tick sizes 0.1 to 0.0001 with the decimals an order's price, size and amount may carry. The 0.005
// and 0.0025 rows are listed there too; a market's live tick (GET /book tick_size) is what the relay checks against.
export interface PolymarketTickRule {
  readonly tick: string;
  readonly priceDecimals: number;
  readonly sizeDecimals: number;
  readonly amountDecimals: number;
}
export const POLYMARKET_TICK_RULES: readonly PolymarketTickRule[] = Object.freeze([
  { tick: "0.1", priceDecimals: 1, sizeDecimals: 2, amountDecimals: 3 },
  { tick: "0.01", priceDecimals: 2, sizeDecimals: 2, amountDecimals: 4 },
  { tick: "0.005", priceDecimals: 3, sizeDecimals: 2, amountDecimals: 5 },
  { tick: "0.0025", priceDecimals: 4, sizeDecimals: 2, amountDecimals: 6 },
  { tick: "0.001", priceDecimals: 3, sizeDecimals: 2, amountDecimals: 5 },
  { tick: "0.0001", priceDecimals: 4, sizeDecimals: 2, amountDecimals: 6 },
]);

export function polymarketTickRule(tick: string): PolymarketTickRule | undefined {
  return POLYMARKET_TICK_RULES.find((rule) => rule.tick === tick);
}

// Signature types (trading/wallets-auth.md WalletType enum; place-orders.md "signatureType: 0 = EOA, 1 = Proxy, 2 = Safe,
// 3 = Deposit Wallet"; Polymarket/ctf-exchange-v2 src/exchange/libraries/Structs.sol SignatureType: EOA, POLY_PROXY,
// POLY_GNOSIS_SAFE, POLY_1271). Two are built: 0 (the owner EOA is the maker) and 3 (the owner's Deposit Wallet is the
// maker; the owner signs an ERC-7739 TypedDataSign wrapper, sdk/trade/clob/polymarket/order.ts). Which one an owner gets is
// read from Polygon by the relay (sdk/trade/clob/polymarket/deposit-wallet.ts, relay/clob.ts), never assumed. Proxy (1) and
// Safe (2) accounts are not built and are refused.
export const POLYMARKET_SIGNATURE_TYPE_EOA = 0;
export const POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET = 3;

// Polymarket's documented geoblock (docs.polymarket.com llms-full geoblock section, read in docs/research/08 section
// 2.11 and docs/research/37 section 4.2): "Orders submitted from blocked regions will be rejected"; the check is
// `GET /api/geoblock` on polymarket.com (the site), not on an API host this relay is allowed to reach. The relay
// therefore never claims the caller may trade: it records the fact as unknown and lets the venue's own refusal (a 403)
// pause the venue, exactly as the read adapter does (sdk/venues/polymarket/geoblock.ts).
export const POLYMARKET_GEOBLOCK_NOTE =
  "Polymarket decides eligibility by the requesting IP and rejects orders from blocked regions. This relay does not check, mask or route around it; a venue refusal pauses the venue.";

// ---- Limitless -------------------------------------------------------------------------------------------------------------
//
// docs.limitless.exchange/developers/eip712-signing (read 2026-10-21): domain name "Limitless CTF Exchange", version
// "1", chainId 8453, verifyingContract "from the market's venue data via GET /markets/:slug" (venue.exchange).
export const LIMITLESS_ORDER_DOMAIN_NAME = "Limitless CTF Exchange";
export const LIMITLESS_ORDER_DOMAIN_VERSION = "1";

// The exchange addresses this relay will sign for. The venue publishes one per market (`venue.exchange`); an address
// that is not on this list is refused, never signed for. The one entry is the `venue.exchange` of the first active
// market returned by a keyless GET /markets/active?limit=1, whose source is a Sourcify exact match of `CTFExchange`
// (docs/research/37-aa-venue-accounts.md section 4.5). Adding an address here is a reviewed change.
export const LIMITLESS_EXCHANGES: readonly Address[] = Object.freeze([LIMITLESS_CTF_EXCHANGE]);

export function isPinnedLimitlessExchange(address: string): boolean {
  const wanted = address.toLowerCase();
  return LIMITLESS_EXCHANGES.some((entry) => entry.toLowerCase() === wanted);
}

// eip712-signing: "signatureType: 0 means an EOA signature"; nonce "must be 0"; expiration "must be 0"; taker is the zero
// address for open orders; feeRateBps 0 on COLLATERAL fee-module venues, otherwise the owner's effectiveFeeRateBps.
export const LIMITLESS_SIGNATURE_TYPE_EOA = 0;

// The venue's price tick: one venue-wide rule, with no per-market field. Sources (read 2026-10-21):
//   - the Limitless OpenAPI (docs.limitless.exchange/openapi.json), schema Order.price: "Decimal price with at
//     most three places; price × contracts must equal the collateral amount exactly as an integer", minimum 0.001,
//     maximum 0.999, multipleOf 0.001;
//   - docs.limitless.exchange/api-reference/trading/create-order.md: "price is required and may have at most
//     three decimal places, so prices run from 0.001 to 0.999. The collateral equation must be exact";
//   - the official SDK, npm @limitless-exchange/sdk 1.3.0: DEFAULT_PRICE_TICK = 1e-3, the client constructs its
//     OrderBuilder with 1e-3, and the builder refuses a price off the tick and shares that are not a multiple of
//     sharesStep = priceScale / tickInt (1,000 raw units, 0.001 shares, at this tick).
// This relay's own grid is stricter on size (two size decimals, so shares are a multiple of 0.01, which is a multiple
// of 0.001) and checks the product exactly (sdk/trade/clob/amounts.ts), and it checks the shares step explicitly as well.
export const LIMITLESS_PRICE_TICK = "0.001";

// create-order.md: "makerAmount must be at least 100 raw units; this is the API's only order-size floor"; the OpenAPI
// Order.makerAmount has "minimum": 100. Raw 6-decimal units (collateral for a BUY, contracts for a SELL).
export const LIMITLESS_MIN_MAKER_AMOUNT = 100n;

// Limitless terms as read (docs/research/09 section 2.3, ToS 2026-09-15): not available in the United States, Ontario or
// Alberta; automation through the API is invited. Shown as a dated fact, never as an eligibility verdict.
export const LIMITLESS_GEOBLOCK_NOTE =
  "Limitless is not available for trading to users in the United States, Ontario or Alberta (terms as read 2026-09-15). This relay does not check, mask or route around that; a venue refusal pauses the venue.";

// ---- shared policy ---------------------------------------------------------------------------------------------------------

// The fee ceiling every CLOB order is capped with. A POLICY figure, not a venue quote: Polymarket's taker fee is
// `C x rate x p x (1 - p)` with no documented hard bound this repository verified, and Limitless documents 0.40 to 3.00
// percent on CLOB buys. 1,000 bps is above both and equals the ceiling XO orders are capped with, so the worst case a
// BUY can cost is its principal plus 10 percent, and a SELL nets at least 90 percent of its proceeds.
export const CLOB_CAP_FEE_BPS = 1000;

// The venue's orderType vocabulary. Polymarket: GTC, GTD, FOK, FAK (place-orders.md). Limitless: GTC, FAK, FOK
// (programmatic-api); GTD is refused there because its orders must carry expiration 0.
export const CLOB_TIFS = ["GTC", "GTD", "FOK", "FAK"] as const;
export type ClobTif = (typeof CLOB_TIFS)[number];
export const LIMITLESS_TIFS: readonly ClobTif[] = Object.freeze(["GTC", "FAK", "FOK"]);
export const POLYMARKET_TIFS: readonly ClobTif[] = Object.freeze(["GTC", "GTD", "FOK", "FAK"]);

export function venueDisplayName(venue: ClobVenue): string {
  return venue === "polymarket" ? "Polymarket" : "Limitless";
}
