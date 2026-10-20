// Exact decimal helpers for strings. No arithmetic on floats: a JSON number is turned into a decimal string
// once (toFixed is a correctly rounded decimal expansion, not arithmetic) and everything after that is
// string or bigint work.
//
// Local copy: core/ owns the app-wide money helpers, but an adapter cannot depend on a module another stream
// is still writing. Swap for core/ when it lands (the functions are small and pure).

const DEC = /^(0|[1-9]\d*)(\.\d+)?$/;

export function isDec(value: string): boolean {
  return DEC.test(value);
}

// "629.0" -> "629", "0.50" -> "0.5". Throws on a string that is not a plain non-negative decimal.
export function canonDec(value: string): string {
  if (!DEC.test(value)) throw new Error("not a decimal");
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" ? "0" : trimmed;
}

// A finite, non-negative JSON number as a canonical decimal string with at most `dp` decimals, or null.
export function numberToDec(value: number, dp: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1e21) return null;
  return canonDec(value.toFixed(dp));
}

function parts(value: string): { int: string; frac: string } {
  const dot = value.indexOf(".");
  return dot === -1 ? { int: value, frac: "" } : { int: value.slice(0, dot), frac: value.slice(dot + 1) };
}

function toScaled(value: string, scale: number): bigint {
  const { int, frac } = parts(value);
  return BigInt(int + frac.padEnd(scale, "0"));
}

// Exact comparison of two decimal strings: negative, zero or positive.
export function compareDec(a: string, b: string): number {
  const scale = Math.max(parts(a).frac.length, parts(b).frac.length);
  const x = toScaled(a, scale);
  const y = toScaled(b, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

// 1 - value for a decimal in [0, 1], exactly; null outside that range.
export function complementOfOne(value: string): string | null {
  if (!DEC.test(value)) return null;
  const scale = parts(value).frac.length;
  const one = 10n ** BigInt(scale);
  const scaled = toScaled(value, scale);
  if (scaled > one) return null;
  const rest = (one - scaled).toString().padStart(scale + 1, "0");
  const int = rest.slice(0, rest.length - scale);
  const frac = rest.slice(rest.length - scale);
  return canonDec(scale === 0 ? int : `${int}.${frac}`);
}
