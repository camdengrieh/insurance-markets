// What the page reads from Limitless's answers, checked field by field: the market record an order is built from, the
// visitor's own profile, and the visitor's orders on one market. Anything that does not have the expected shape is a
// refusal in fixed words, never a guess. The same reads and rules as the server-side flow (relay/clob.ts
// readLimitlessMarket), plus the profile, which the order's `ownerId` and, on a fee-enabled market, its signed fee
// rate come from (docs.limitless.exchange/api-reference/trading/create-order, read 2026-10-23: "ownerId ... is the `id`
// field returned by GET /profiles/me"; "On fee-enabled markets (`metadata.fee: true`), a signed order's `feeRateBps`
// must equal the order owner's `effectiveFeeRateBps` ... On fee-disabled markets, sign with `feeRateBps: 0`. On new
// trading venues (`venue.feeModuleType: "COLLATERAL"`), sign with `feeRateBps: 0` on every order").

import { formatMicro } from "@sdk/trade/clob/amounts";
import { isPinnedLimitlessExchange } from "@sdk/trade/clob/venues";
import { getAddress, type Address } from "viem";

import { venueText } from "../text";
import { refuse, ok, type DirectOpenOrder, type DirectResult } from "../types";

// sdk/venues/limitless/schemas.ts SLUG: the market ids the explorer shows for Limitless.
export const LIMITLESS_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export const LIMITLESS_ORDER_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const TOKEN_ID = /^[0-9]{1,78}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export interface LimitlessMarketFacts {
  readonly slug: string;
  readonly exchange: Address;
  readonly yesToken: string;
  readonly noToken: string;
  // "collateral": a COLLATERAL fee-module venue (sign 0); "off": metadata.fee false (sign 0); "on": metadata.fee true
  // (sign the owner's effectiveFeeRateBps).
  readonly fee: "collateral" | "off" | "on";
}

export function readLimitlessMarket(json: unknown, slug: string, tokenId: string): DirectResult<LimitlessMarketFacts> {
  const market = record(json);
  if (market === null) return refuse("venue_refused", "Limitless's market record could not be read, so the exchange to sign for is unknown. Nothing was built.");
  if (market["slug"] !== slug) return refuse("venue_refused", "Limitless answered with another market's record. Nothing was built.");
  if (market["tradeType"] !== "clob") return refuse("invalid_order", "This Limitless market is not an order book (CLOB) market, so no order is built for it.");
  const tokens = record(market["tokens"]);
  const yes = typeof tokens?.["yes"] === "string" && TOKEN_ID.test(tokens["yes"]) ? tokens["yes"] : null;
  const no = typeof tokens?.["no"] === "string" && TOKEN_ID.test(tokens["no"]) ? tokens["no"] : null;
  if (yes === null || no === null) return refuse("venue_refused", "Limitless's market record names no Yes and No tokens. Nothing was built.");
  if (tokenId !== yes && tokenId !== no) return refuse("invalid_order", "The outcome token is not one of this market's two tokens. Nothing was built.");
  const venue = record(market["venue"]);
  const exchange = typeof venue?.["exchange"] === "string" && /^0x[0-9a-fA-F]{40}$/.test(venue["exchange"]) ? venue["exchange"] : null;
  if (exchange === null) return refuse("venue_refused", "Limitless's market record names no exchange contract. Nothing was built.");
  if (!isPinnedLimitlessExchange(exchange)) return refuse("invalid_order", "This market's exchange is not the one this build is pinned to (the Limitless CTF Exchange on Base), so no order is signed for it.");
  const metadata = record(market["metadata"]);
  const fee: LimitlessMarketFacts["fee"] | null = venue?.["feeModuleType"] === "COLLATERAL" ? "collateral" : metadata?.["fee"] === false ? "off" : metadata?.["fee"] === true ? "on" : null;
  if (fee === null) return refuse("venue_refused", "Limitless's market record does not say whether the market charges a fee, so the fee rate to sign is unknown. Nothing was built.");
  return ok({ slug, exchange: getAddress(exchange), yesToken: yes, noToken: no, fee });
}

export interface LimitlessProfile {
  readonly id: number;
  readonly account: Address;
  // null when the profile has no rank (it cannot sign on a fee-enabled market).
  readonly feeRateBps: number | null;
}

// The token's own profile, checked to be this wallet's and in EOA trading mode (a smart-wallet profile makes the venue
// refuse self-signed orders: eip712-signing "Trading wallet mode").
export function readLimitlessProfile(json: unknown, wallet: Address): DirectResult<LimitlessProfile> {
  const profile = record(json);
  const id = profile?.["id"];
  const account = profile?.["account"];
  if (profile === null || typeof id !== "number" || !Number.isSafeInteger(id) || id < 1 || typeof account !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(account)) {
    return refuse("venue_refused", "Limitless's answer about this token's profile could not be read.");
  }
  if (account.toLowerCase() !== wallet.toLowerCase()) return refuse("account_refused", `This token belongs to another Limitless account (${getAddress(account)}), not the connected wallet. Create a token while signed in to Limitless with this wallet.`);
  if (profile["tradeWalletOption"] === "smartWallet") return refuse("account_refused", "Your Limitless profile trades from its smart wallet, and Limitless refuses orders your own wallet signs in that mode. Switch the profile to EOA trading in Limitless's own app, then try again.");
  const rate = profile["effectiveFeeRateBps"];
  const feeRateBps = typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0 && rate <= 10_000 ? rate : null;
  if (rate !== null && rate !== undefined && feeRateBps === null) return refuse("venue_refused", "Limitless's answer gives a fee rate this page does not read.");
  return ok({ id, account: getAddress(account), feeRateBps });
}

// A raw 6-decimal amount Limitless serialises as a decimal string ("20000000"), as micro units; null when it is not one.
function rawMicro(raw: unknown): bigint | null {
  if (typeof raw !== "string" || !/^[0-9]{1,30}(?:\.0+)?$/.test(raw)) return null;
  return BigInt(raw.split(".")[0] ?? "0");
}

function priceText(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9](?:\.[0-9]{1,6})?$/.test(raw) ? raw : null;
}

// GET /markets/{slug}/user-orders: "a bare, newest-first array" of UserOrder (OpenAPI, read 2026-10-23).
export function readLimitlessOrders(json: unknown, limit: number): DirectResult<{ readonly orders: readonly DirectOpenOrder[]; readonly more: boolean }> {
  if (!Array.isArray(json)) return refuse("venue_refused", "Limitless's order list could not be read.");
  const orders: DirectOpenOrder[] = [];
  for (const entry of json) {
    const row = record(entry);
    const id = row?.["id"];
    if (row === null || typeof id !== "string" || !LIMITLESS_ORDER_ID.test(id)) continue;
    const side = row["side"] === "BUY" || row["side"] === "SELL" ? row["side"] : null;
    const original = rawMicro(row["originalSize"]);
    const remaining = rawMicro(row["remainingSize"]);
    orders.push({
      id,
      side,
      price: priceText(row["price"]),
      originalSize: original === null ? null : formatMicro(original),
      sizeMatched: original !== null && remaining !== null && remaining <= original ? formatMicro(original - remaining) : null,
      tokenId: typeof row["token"] === "string" && TOKEN_ID.test(row["token"]) ? row["token"] : null,
      maker: null,
      status: venueText(row["status"]),
      outcome: null,
    });
  }
  return ok({ orders, more: json.length >= limit });
}

// A venue's refusal, as the words it gave: OpenAPI "Validation failures use a `message` array; business failures usually
// use a string".
export function limitlessMessage(json: unknown, text: string): string | null {
  const body = record(json);
  const message = body?.["message"];
  if (typeof message === "string") return venueText(message);
  if (Array.isArray(message)) return venueText(message.filter((part) => typeof part === "string").join("; "));
  const error = body?.["error"];
  if (typeof error === "string") return venueText(error);
  return venueText(text);
}
