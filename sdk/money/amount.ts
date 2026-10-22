// The money guardrail's view of the decimal grammar (sdk/money/decimal.ts): a user-supplied amount string becomes an
// integer of atomic units for a token of at most 18 decimals. Money and share amounts never touch floating point.
// Every failure carries a fixed reason and never echoes the input, which may be attacker-shaped.

import { MAX_DECIMAL_CHARS, atomicToDec, decToAtomic, type DecimalFailure } from "./decimal.js";

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

// Most decimals a token amount may carry here (ERC-20 tokens top out at 18).
export const MAX_TOKEN_DECIMALS = 18;

function fail(reason: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason };
}

function reasonFor(failure: DecimalFailure, decimals: number): string {
  switch (failure) {
    case "not_text":
      return "amount must be a decimal string";
    case "length":
      return `amount must be 1 to ${MAX_DECIMAL_CHARS} characters`;
    case "precision":
      return `amount allows at most ${decimals} decimal places`;
    case "decimals":
      return "unsupported token precision";
    case "grammar":
    case "sign":
      return "amount must be a plain non-negative decimal string such as 12.5 (no signs, exponents, hex, separators or spaces)";
  }
}

// Parses "12.5" with decimals=6 to 12500000n. Extra precision is rejected, never rounded.
export function parseDecimalAtomic(input: unknown, decimals: number): ParseResult<bigint> {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_TOKEN_DECIMALS) {
    return fail("unsupported token precision");
  }
  const parsed = decToAtomic(input, decimals);
  return parsed.ok ? parsed : fail(reasonFor(parsed.failure, decimals));
}

// Inverse of parseDecimalAtomic for messages: 12500000n with decimals=6 gives "12.5".
export function formatAtomic(value: bigint, decimals: number): string {
  return atomicToDec(value, decimals);
}

// XO prices move in 0.001 steps, so a decimal price string maps to an integer tick count.
// "0.55" gives 550. Anything finer than a tick, or above 1, is rejected.
export function parsePriceTicks(input: unknown): ParseResult<number> {
  const parsed = parseDecimalAtomic(input, 3);
  if (!parsed.ok) return parsed;
  if (parsed.value > 1000n) return fail("price must not exceed 1");
  return { ok: true, value: Number(parsed.value) };
}
