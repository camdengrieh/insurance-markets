// Defensive helpers shared by the venue parsers. Third-party JSON is untrusted: every field is
// type-checked, strings are reduced to fixed vocabularies or validated decimals before storage,
// and no free text (titles, descriptions, rules) is ever kept.

import type { BookFlag, BookLevelPair, MarketStatusCode } from "../types.js";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function field(o: unknown, key: string): unknown {
  return isRecord(o) ? o[key] : undefined;
}

// Canonical non-negative decimal: no sign, no exponent, no leading or trailing zeros. null if the
// input is anything else. Numbers are accepted only when their shortest text form has no exponent.
export function canonDec(input: unknown): string | null {
  let text: string;
  if (typeof input === "string") text = input.trim();
  else if (typeof input === "number" && Number.isFinite(input)) text = String(input);
  else return null;
  if (!/^\d{1,30}(\.\d{1,30})?$/.test(text)) return null;
  const [intPart = "0", frac = ""] = text.split(".");
  const i = intPart.replace(/^0+(?=\d)/, "");
  const f = frac.replace(/0+$/, "");
  return f === "" ? i : `${i}.${f}`;
}

// Strictly between 0 and 1, canonical.
export function canonPrice(input: unknown): string | null {
  const d = canonDec(input);
  return d !== null && /^0\.\d+$/.test(d) ? d : null;
}

function scaled(d: string, places: number): bigint {
  const [i = "0", f = ""] = d.split(".");
  return BigInt(i + f.padEnd(places, "0"));
}

export function cmpDec(a: string, b: string): -1 | 0 | 1 {
  const places = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const x = scaled(a, places);
  const y = scaled(b, places);
  return x < y ? -1 : x > y ? 1 : 0;
}

// Raw integer count in base units to a decimal share count (Limitless sizes are 6-decimal).
export function fromBaseUnits(input: unknown, decimals: number): string | null {
  let n: bigint;
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || input < 0) return null;
    n = BigInt(input);
  } else if (typeof input === "string" && /^\d{1,40}$/.test(input.trim())) {
    n = BigInt(input.trim());
  } else return null;
  const s = n.toString().padStart(decimals + 1, "0");
  return canonDec(`${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals)}`);
}

export function msFromUnknown(input: unknown): number | null {
  const n = typeof input === "string" && /^\d{10,16}$/.test(input.trim()) ? Number(input.trim()) : typeof input === "number" ? input : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  // Seconds versus milliseconds: anything below 1e11 is a Unix time in seconds.
  return n < 100_000_000_000 ? n * 1000 : n;
}

export function isoToMs(input: unknown): number | null {
  if (typeof input !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(input)) return null;
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : null;
}

export function safeToken(input: unknown): string | null {
  return typeof input === "string" && /^[0-9A-Za-z_.:-]{1,100}$/.test(input) ? input : null;
}

export function safeHash(input: unknown): string | null {
  return typeof input === "string" && /^(0x)?[0-9A-Za-z]{8,128}$/.test(input) ? input : null;
}

export function safeTick(input: unknown): string | null {
  const d = canonDec(input);
  return d !== null && /^0\.\d+$/.test(d) ? d : null;
}

export type SidedInput = readonly { readonly price: unknown; readonly size: unknown }[];

export interface ParsedSides {
  readonly bids: BookLevelPair[];
  readonly asks: BookLevelPair[];
  readonly flags: BookFlag[];
  readonly nBids: number;
  readonly nAsks: number;
}

// Validates, sorts (bids high to low, asks low to high), truncates and flags. The input order is
// compared with the venue's declared convention only to raise `unsorted_input`; the stored order
// is always canonical. Levels are not merged or dropped silently: bad ones are counted in a flag.
export function parseSides(
  rawBids: SidedInput,
  rawAsks: SidedInput,
  convention: "best_first" | "best_last",
  depth: number,
  sizeOf: (v: unknown) => string | null = canonDec,
  priceOf: (v: unknown) => string | null = canonPrice,
): ParsedSides {
  const flags = new Set<BookFlag>();
  const side = (raw: SidedInput, descending: boolean): BookLevelPair[] => {
    const levels: BookLevelPair[] = [];
    for (const l of raw) {
      const price = priceOf(l.price);
      const size = sizeOf(l.size);
      if (price === null || size === null) {
        flags.add("bad_level");
        continue;
      }
      if (cmpDec(size, "0") === 0) continue;
      levels.push([price, size]);
    }
    const input = levels.map((l) => l[0]);
    levels.sort((a, b) => (descending ? -cmpDec(a[0], b[0]) : cmpDec(a[0], b[0])));
    const wantFirstBest = convention === "best_first";
    const expected = wantFirstBest ? levels.map((l) => l[0]) : [...levels].reverse().map((l) => l[0]);
    if (input.length > 1 && input.some((p, i) => p !== expected[i])) flags.add("unsorted_input");
    for (let i = 1; i < levels.length; i += 1) if (levels[i - 1]?.[0] === levels[i]?.[0]) flags.add("duplicate_price");
    return levels;
  };
  const bids = side(rawBids, true);
  const asks = side(rawAsks, false);
  if (bids.length === 0) flags.add("empty_bids");
  if (asks.length === 0) flags.add("empty_asks");
  const b = bids[0];
  const a = asks[0];
  if (b !== undefined && a !== undefined && cmpDec(b[0], a[0]) >= 0) flags.add("crossed");
  if (bids.length > depth || asks.length > depth) flags.add("truncated");
  return { bids: bids.slice(0, depth), asks: asks.slice(0, depth), flags: [...flags].sort(), nBids: bids.length, nAsks: asks.length };
}

export function statusFromWords(word: unknown, table: Readonly<Record<string, MarketStatusCode>>): MarketStatusCode {
  return typeof word === "string" ? (table[word.toUpperCase()] ?? "unknown") : "unknown";
}
