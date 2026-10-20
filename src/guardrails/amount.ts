// Exact decimal-string to bigint helpers. Money and share amounts never touch floating point:
// a string is validated against a strict grammar and turned into an integer of atomic units.
// Every failure carries a fixed reason and never echoes the input, which may be attacker-shaped.

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

const MAX_DECIMAL_CHARS = 40;
// ASCII digits only, no sign, exponent, hex prefix, separators, spaces or trailing newline.
const DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

function fail(reason: string): { readonly ok: false; readonly reason: string } {
  return { ok: false, reason };
}

// Parses "12.5" with decimals=6 to 12500000n. Extra precision is rejected, never rounded.
export function parseDecimalAtomic(input: unknown, decimals: number): ParseResult<bigint> {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    return fail("unsupported token precision");
  }
  if (typeof input !== "string") return fail("amount must be a decimal string");
  if (input.length === 0 || input.length > MAX_DECIMAL_CHARS) {
    return fail(`amount must be 1 to ${MAX_DECIMAL_CHARS} characters`);
  }
  const match = DECIMAL.exec(input);
  if (match === null) {
    return fail(
      "amount must be a plain non-negative decimal string such as 12.5 (no signs, exponents, hex, separators or spaces)",
    );
  }
  const whole = match[1] ?? "";
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) return fail(`amount allows at most ${decimals} decimal places`);
  return { ok: true, value: BigInt(whole + fraction.padEnd(decimals, "0")) };
}

// Inverse of parseDecimalAtomic for messages: 12500000n with decimals=6 gives "12.5".
export function formatAtomic(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const fraction = (abs % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${abs / unit}${fraction === "" ? "" : `.${fraction}`}`;
}

// XO prices move in 0.001 steps, so a decimal price string maps to an integer tick count.
// "0.55" gives 550. Anything finer than a tick, or above 1, is rejected.
export function parsePriceTicks(input: unknown): ParseResult<number> {
  const parsed = parseDecimalAtomic(input, 3);
  if (!parsed.ok) return parsed;
  if (parsed.value > 1000n) return fail("price must not exceed 1");
  return { ok: true, value: Number(parsed.value) };
}
