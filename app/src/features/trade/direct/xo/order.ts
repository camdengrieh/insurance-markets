// An XO order from what the visitor typed, the body XO's POST /order takes, the cancel body, and XO's answers read
// back. The rules are the server-side flow's (relay/orders.ts): nonce 0, signature type 3, maker = signer = the XO
// account, beneficiary zero, identifier and metadata zero, a GTD expiry on XO's clock (5 minutes; at most an hour), a
// non-zero salt, amounts exact on the 0.001 tick and above the book's minimum size, wire signature 0x01 + validator +
// the 65 bytes (the documented form).

import { getAddress, type Address, type Hex } from "viem";

import { computeOrderAmounts, DEFAULT_MIN_SHARES_MICRO, formatMicro, formatTick, parsePriceToTick, type OrderAmounts } from "@sdk/trade/xo/amounts";
import { SIDE_BUY, SIDE_SELL, SIGNATURE_TYPE_XO_SMART_ACCOUNT, ZERO_ADDRESS, ZERO_BYTES16, ZERO_BYTES32 } from "@sdk/trade/xo/constants";
import { DEFAULT_ORDER_TTL_SECONDS, gtdExpirationFromTtl } from "@sdk/trade/xo/expiry";
import { orderToWire, type XoOrder } from "@sdk/trade/xo/order";
import { assembleWireSignature } from "@sdk/trade/xo/signature";

export type OrderSideWord = "BUY" | "SELL";

export interface OrderInput {
  readonly tokenId: string;
  readonly side: OrderSideWord;
  // Decimal text as typed: "0.42" and "10".
  readonly price: string;
  readonly shares: string;
}

export interface BookFacts {
  readonly tickSize: string | null;
  readonly minOrderSizeMicro: bigint | null;
  readonly bestBid: string | null;
  readonly bestAsk: string | null;
}

const TOKEN_ID = /^[0-9]{1,78}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,6}))?$/;

function decimalMicro(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) value = String(value);
  if (typeof value !== "string") return null;
  const match = DECIMAL.exec(value.trim());
  if (match === null) return null;
  return BigInt(match[1] as string) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
}

function bestLevel(levels: unknown, pick: "min" | "max"): string | null {
  if (!Array.isArray(levels)) return null;
  let best: number | null = null;
  for (const level of levels) {
    if (typeof level !== "object" || level === null) continue;
    const price = (level as Record<string, unknown>)["price"];
    if (typeof price !== "string") continue;
    let tick: number;
    try {
      tick = parsePriceToTick(price);
    } catch {
      continue;
    }
    if (best === null || (pick === "min" ? tick < best : tick > best)) best = tick;
  }
  return best === null ? null : formatTick(best);
}

// XO's GET /book answer, the fields an order needs. Anything unreadable is null, never a guess.
export function readBook(json: unknown): BookFacts {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { tickSize: null, minOrderSizeMicro: null, bestBid: null, bestAsk: null };
  const book = json as Record<string, unknown>;
  return {
    tickSize: typeof book["tick_size"] === "string" ? book["tick_size"] : null,
    minOrderSizeMicro: decimalMicro(book["min_order_size"]),
    bestBid: bestLevel(book["bids"], "max"),
    bestAsk: bestLevel(book["asks"], "min"),
  };
}

export class OrderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderInputError";
  }
}

// 6 random bytes, not zero (relay/orders.ts nonZeroSalt).
export function saltFrom(random: (bytes: number) => Uint8Array): bigint {
  for (let i = 0; i < 16; i++) {
    const bytes = random(6);
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value > 0n) return value;
  }
  throw new OrderInputError("The browser's random source gave only zeros.");
}

export function browserRandom(bytes: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

export interface BuiltOrder {
  readonly order: XoOrder;
  readonly amounts: OrderAmounts;
}

export function buildXoOrder(input: OrderInput, account: Address, nowSeconds: number, book: BookFacts, random: (bytes: number) => Uint8Array): BuiltOrder {
  if (!TOKEN_ID.test(input.tokenId)) throw new OrderInputError("The outcome token id is not a decimal number.");
  if (input.side !== "BUY" && input.side !== "SELL") throw new OrderInputError("Choose BUY or SELL.");
  if (book.tickSize !== null && book.tickSize !== "0.001") throw new OrderInputError(`This market's tick is ${book.tickSize}; orders here are built for XO's 0.001 tick only.`);
  const side = input.side === "BUY" ? SIDE_BUY : SIDE_SELL;
  const minShares = book.minOrderSizeMicro !== null && book.minOrderSizeMicro > DEFAULT_MIN_SHARES_MICRO ? book.minOrderSizeMicro : DEFAULT_MIN_SHARES_MICRO;
  let amounts: OrderAmounts;
  try {
    amounts = computeOrderAmounts({ side, price: input.price.trim(), shares: input.shares.trim(), constraints: { minSharesMicro: minShares } });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === "below_minimum") throw new OrderInputError(`The order is below XO's minimum: at least ${formatMicro(minShares)} shares and 0.30 USDC.`);
    if (code === "inexact_amount" || code === "invalid_size") throw new OrderInputError("At this price the share count does not give a whole number of micro-USDC; adjust the shares.");
    throw new OrderInputError("The price must be 0.001 to 0.999 in steps of 0.001, and the shares a positive decimal with at most 6 places.");
  }
  const expiration = gtdExpirationFromTtl(nowSeconds, DEFAULT_ORDER_TTL_SECONDS);
  const maker = getAddress(account);
  const order: XoOrder = {
    salt: saltFrom(random),
    maker,
    signer: maker,
    beneficiary: ZERO_ADDRESS,
    tokenId: BigInt(input.tokenId),
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration,
    nonce: 0n,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side,
    signatureType: SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  };
  return { order, amounts };
}

// The exact text POSTed to /order; the L2 signature covers these bytes. `ecdsa` is the wallet's 65 bytes; the wire form
// is 0x01 + the Kernel ECDSA validator + the canonical 65 bytes (v 27/28, low s).
export function orderPostBody(order: XoOrder, ecdsa: Hex): string {
  const signature = assembleWireSignature(ecdsa, { form: "kernel-validator-0x01" });
  return JSON.stringify({ order: { ...orderToWire(order), signature }, orderType: "GTD" });
}

// DELETE /order takes the order's hash as orderID (the first form the server-side flow sends).
export function cancelBody(orderHash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(orderHash)) throw new OrderInputError("An order hash is 32 bytes of hex.");
  return JSON.stringify({ orderID: orderHash.toLowerCase() });
}

export interface OpenOrderRow {
  readonly hash: string;
  readonly tokenId: string | null;
  readonly side: OrderSideWord | null;
  readonly price: string | null;
  readonly originalShares: string | null;
  readonly matchedShares: string | null;
  readonly status: string | null;
  readonly expiresAtS: number | null;
}

const STATUS_WORD = /^[A-Za-z_]{1,32}$/;

// GET /orders: an array, or { data | orders: [...] }. Rows without a readable hash are skipped; every other field is
// null when it is not in a known shape (a stranger's text is never shown as a value).
export function readOpenOrders(json: unknown): OpenOrderRow[] | null {
  const list = Array.isArray(json) ? json : typeof json === "object" && json !== null ? ((json as Record<string, unknown>)["data"] ?? (json as Record<string, unknown>)["orders"]) : undefined;
  if (!Array.isArray(list)) return null;
  const rows: OpenOrderRow[] = [];
  for (const raw of list.slice(0, 500)) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const hash = row["order_hash"] ?? row["orderHash"] ?? row["hash"];
    if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) continue;
    const token = row["asset_id"] ?? row["token_id"] ?? row["assetId"];
    const sideText = typeof row["side"] === "string" ? row["side"].toUpperCase() : "";
    const priceText = row["price"];
    let price: string | null = null;
    if (typeof priceText === "string") {
      try {
        price = formatTick(parsePriceToTick(priceText));
      } catch {
        price = null;
      }
    }
    const original = decimalMicro(row["original_size"] ?? row["originalSize"]);
    const matched = decimalMicro(row["size_matched"] ?? row["sizeMatched"] ?? "0");
    const status = row["status"];
    const expiry = typeof row["expiration"] === "string" || typeof row["expiration"] === "number" ? Number(row["expiration"]) : NaN;
    rows.push({
      hash: hash.toLowerCase(),
      tokenId: typeof token === "string" && TOKEN_ID.test(token) ? token : null,
      side: sideText === "BUY" || sideText === "SELL" ? sideText : null,
      price,
      originalShares: original === null ? null : formatMicro(original),
      matchedShares: matched === null ? null : formatMicro(matched),
      status: typeof status === "string" && STATUS_WORD.test(status) ? status.toUpperCase() : null,
      expiresAtS: Number.isSafeInteger(expiry) && expiry > 0 ? expiry : null,
    });
  }
  return rows;
}

export type CancelReading = { readonly state: "cancelled" | "not_cancelled" | "unreadable"; readonly reason: string | null };

const REASON_WORDS = ["already filled", "not found", "not owner", "already canceled", "already cancelled", "expired"] as const;

// DELETE /order answers { canceled: [...], notCanceled: { <id>: <reason> } }. The reason is matched against known words
// only; XO's own text is not shown as a value.
export function readCancel(json: unknown, orderHash: string): CancelReading {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { state: "unreadable", reason: null };
  const record = json as Record<string, unknown>;
  const canceled = Array.isArray(record["canceled"]) ? record["canceled"] : [];
  if (canceled.some((entry) => typeof entry === "string" && entry.toLowerCase() === orderHash.toLowerCase())) return { state: "cancelled", reason: null };
  const not = typeof record["notCanceled"] === "object" && record["notCanceled"] !== null ? (record["notCanceled"] as Record<string, unknown>) : {};
  const text = Object.values(not).filter((entry): entry is string => typeof entry === "string").join(" ").toLowerCase();
  const reason = REASON_WORDS.find((word) => text.includes(word)) ?? null;
  if (canceled.length > 0 && Object.keys(not).length === 0) return { state: "cancelled", reason: null };
  return { state: Object.keys(not).length > 0 ? "not_cancelled" : "unreadable", reason };
}
