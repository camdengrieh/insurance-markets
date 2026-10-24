// What the page reads from the answers of Limitless and of our partner relay, checked field by field: the market record
// an order is built from, the sign-in text the trading key signs once, the profile id the relay registered, the
// account's orders on one market, and a fee-rate refusal. Anything that does not have the expected shape is a refusal in
// fixed words, never a guess. The market rules are the server-side flow's (relay/clob.ts readLimitlessMarket); the fee
// rule is Limitless's (docs.limitless.exchange/api-reference/trading/create-order, read 2026-10-23: "On fee-enabled
// markets (`metadata.fee: true`), a signed order's `feeRateBps` must equal the order owner's `effectiveFeeRateBps` ...
// On fee-disabled markets, sign with `feeRateBps: 0`. On new trading venues (`venue.feeModuleType: "COLLATERAL"`), sign
// with `feeRateBps: 0` on every order"). A partner cannot read a sub-account's rate, so on a fee-enabled market the
// executor signs the rate it last learned for the account (0 at first) and re-signs once with the rate a
// FEE_RATE_MISMATCH refusal names (note 44 section 3.1 step 3).

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
  // (sign the owner's effective fee rate).
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

// GET /auth/signing-message, through the relay: Limitless's own ownership text with its nonce (note 44 section 2.1:
// "Sign the live text, not a template"). The relay passes it on as plain text; a JSON {message} is read too. Anything
// that is not printable text of a sane length is refused: it is about to be signed.
const SIGNING_TEXT = /^[\x20-\x7e\n\r\t]{16,2000}$/;

export function readSigningMessage(text: string, json: unknown): DirectResult<string> {
  const fromJson = record(json)?.["message"];
  const message = typeof fromJson === "string" ? fromJson : json === undefined ? text : null;
  if (message === null || !SIGNING_TEXT.test(message)) return refuse("venue_refused", "Limitless's sign-in text could not be read, so nothing was signed.");
  return ok(message);
}

// POST register: {profileId}, a positive whole number (the sub-account's Limitless profile id).
export function readProfileId(json: unknown): DirectResult<number> {
  const id = record(json)?.["profileId"];
  const value = typeof id === "string" && /^[1-9][0-9]{0,15}$/.test(id) ? Number(id) : id;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return refuse("venue_refused", "Our markets API's answer about your Limitless registration could not be read.");
  return ok(value);
}

// 400 {"code":"FEE_RATE_MISMATCH","expectedFeeRateBps":n} on a legacy fee market: the rate the venue expects. null when
// the answer is anything else.
export function feeRateMismatch(json: unknown): number | null {
  const body = record(json);
  const rate = body?.["expectedFeeRateBps"];
  if (body?.["code"] !== "FEE_RATE_MISMATCH" || typeof rate !== "number" || !Number.isSafeInteger(rate) || rate < 0 || rate > 10_000) return null;
  return rate;
}

// A raw 6-decimal amount Limitless serialises as a decimal string ("20000000"), as micro units; null when it is not one.
function rawMicro(raw: unknown): bigint | null {
  if (typeof raw !== "string" || !/^[0-9]{1,30}(?:\.0+)?$/.test(raw)) return null;
  return BigInt(raw.split(".")[0] ?? "0");
}

function priceText(raw: unknown): string | null {
  return typeof raw === "string" && /^[0-9](?:\.[0-9]{1,6})?$/.test(raw) ? raw : null;
}

// The account's orders on one market: "a bare, newest-first array" of UserOrder (OpenAPI, read 2026-10-23), passed on
// by the relay; a {data | orders: [...]} wrapper is read too.
export function readLimitlessOrders(json: unknown, limit: number): DirectResult<{ readonly orders: readonly DirectOpenOrder[]; readonly more: boolean }> {
  const wrapped = record(json);
  const list = Array.isArray(json) ? json : (wrapped?.["data"] ?? wrapped?.["orders"]);
  if (!Array.isArray(list)) return refuse("venue_refused", "Limitless's order list could not be read.");
  const orders: DirectOpenOrder[] = [];
  for (const entry of list) {
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
  return ok({ orders, more: list.length >= limit });
}

// A venue's refusal, as the words it gave: OpenAPI "Validation failures use a `message` array; business failures usually
// use a string". The relay's own refusals carry {error: {message}}.
export function limitlessMessage(json: unknown, text: string): string | null {
  const body = record(json);
  const message = body?.["message"];
  if (typeof message === "string") return venueText(message);
  if (Array.isArray(message)) return venueText(message.filter((part) => typeof part === "string").join("; "));
  const error = body?.["error"];
  if (typeof error === "string") return venueText(error);
  const nested = record(error)?.["message"];
  if (typeof nested === "string") return venueText(nested);
  return venueText(text);
}
