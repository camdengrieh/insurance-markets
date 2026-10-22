// Exact number and identifier helpers for the XO read APIs. Nothing here uses floating point:
// prices, share sizes and USDC amounts are decimal strings parsed to bigint "micro" units
// (1e6 = 1.0 probability, 1 USDC or 1 share). Parsers return null instead of throwing so a
// decoder can attach its own path to the failure, and they never echo the input. The grammar, the conversion and the
// rounding are the shared ones in sdk/money/decimal.ts.

import { atomicToDec, canonicalDec, decToAtomic, parseAtomicInteger, pow10, roundDiv } from "../../../money/decimal.js";

export const MICRO_DECIMALS = 6;
export const MICRO = 1_000_000n;
// XO ticks are 0.001, so valid book prices are 1000 to 999000 micro.
export const TICK_MICRO = 1_000n;

const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BARE_ADDRESS = /^[0-9a-fA-F]{40}$/;
// ERC-1155 position ids are U256 decimal strings (up to 78 digits).
const TOKEN_ID = /^[1-9][0-9]{0,77}$/;

// "0.534" -> 534000n. More than `maxDecimals` fractional digits is rejected, trailing zeros included ("0.5340000"
// carries seven), never rounded away.
export function parseDecimalToMicro(text: unknown, maxDecimals = MICRO_DECIMALS): bigint | null {
  if (!Number.isInteger(maxDecimals) || maxDecimals < 0 || maxDecimals > MICRO_DECIMALS) return null;
  const parsed = decToAtomic(text, maxDecimals);
  return parsed.ok ? parsed.value * pow10(MICRO_DECIMALS - maxDecimals) : null;
}

// The same for a value the XO API sent: an exact value padded with zeros ("0.5000000") is the value it states, so
// the padding is dropped before the place check. Only payload fields use this; amounts a caller types stay strict.
export function parseVenueDecimalToMicro(text: unknown): bigint | null {
  const canonical = canonicalDec(text);
  return canonical === null ? null : parseDecimalToMicro(canonical);
}

// "670000" -> 670000n. Integer strings only; used for values the API already sends in micro
// units (Data API prices, positions, balances).
export function parseMicroInteger(text: unknown): bigint | null {
  return parseAtomicInteger(text);
}

// 534000n -> "0.534", 1000000n -> "1", 0n -> "0". Trailing zeros are trimmed.
export function formatMicro(value: bigint): string {
  return atomicToDec(value, MICRO_DECIMALS);
}

// Midpoint of two prices, floored. XO prices sit on 1000-micro ticks, so the sum of two valid
// prices is even and the floor is exact.
export function midpointMicro(bid: bigint, ask: bigint): bigint {
  return (bid + ask) / 2n;
}

// Taker fee upper bound in micro-USDC: C * bps/10000 * p * (1 - p), rounded UP. The docs give
// this curve (guides/fees) but not the rounding mode, so ceil is the conservative choice.
// sizeMicro is micro-shares; priceMicro is micro-probability.
export function feeUpperBoundMicro(sizeMicro: bigint, priceMicro: bigint, feeBps: number): bigint {
  if (sizeMicro < 0n || priceMicro < 0n || priceMicro > MICRO) {
    throw new RangeError("size and price must be non-negative and price at most 1");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new RangeError("feeBps must be an integer from 0 to 10000");
  }
  return roundDiv(sizeMicro * BigInt(feeBps) * priceMicro * (MICRO - priceMicro), pow10(16), "ceil");
}

// Returns the lowercase 0x address, or null for anything that is not 0x plus 40 hex digits.
export function normalizeAddress(text: unknown): string | null {
  return typeof text === "string" && ADDRESS.test(text) ? text.toLowerCase() : null;
}

// The orderbook returns `smart_account` as 40 hex digits without the 0x prefix.
export function normalizeBareAddress(text: unknown): string | null {
  return typeof text === "string" && BARE_ADDRESS.test(text) ? `0x${text.toLowerCase()}` : null;
}

export function normalizeConditionId(text: unknown): string | null {
  return typeof text === "string" && CONDITION_ID.test(text) ? text.toLowerCase() : null;
}

export function isTokenId(text: unknown): text is string {
  return typeof text === "string" && TOKEN_ID.test(text);
}
