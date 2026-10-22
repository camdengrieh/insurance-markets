// What the recorder does with values the shared venue parsers (sdk/venues/<venue>) have already read: reduce them to
// its own stored vocabulary (canonical decimal strings, fixed status codes, sorted and truncated book sides) before
// storage. Venue payloads themselves are never read here; no free text (titles, descriptions, rules) is ever kept.

import { canonicalDec, compareDecimal } from "../../../sdk/money/decimal.js";
import type { Status } from "../../../sdk/model.js";
import type { BookFlag, BookLevelPair, MarketStatusCode } from "../types.js";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Canonical non-negative decimal: no sign, no exponent, no leading or trailing zeros. null if the
// input is anything else. Numbers are accepted only when their shortest text form has no exponent.
export function canonDec(input: unknown): string | null {
  let text: string;
  if (typeof input === "string") text = input.trim();
  else if (typeof input === "number" && Number.isFinite(input)) text = String(input);
  else return null;
  if (!/^\d{1,30}(\.\d{1,30})?$/.test(text)) return null;
  // Leading zeros are the one form a venue sends that the shared grammar refuses; drop them, then canonicalise there.
  return canonicalDec(text.replace(/^0+(?=\d)/, ""));
}

// Strictly between 0 and 1, canonical.
export function canonPrice(input: unknown): string | null {
  const d = canonDec(input);
  return d !== null && /^0\.\d+$/.test(d) ? d : null;
}

// Both sides are canonDec output; anything else is a programming error, not data.
export function cmpDec(a: string, b: string): -1 | 0 | 1 {
  const order = compareDecimal(a, b);
  if (order === null) throw new RangeError("cmpDec needs canonical decimals");
  return order;
}

export function isoToMs(input: unknown): number | null {
  if (typeof input !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(input)) return null;
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : null;
}

export function safeHash(input: unknown): string | null {
  return typeof input === "string" && /^(0x)?[0-9A-Za-z]{8,128}$/.test(input) ? input : null;
}

export function safeTick(input: unknown): string | null {
  const d = canonDec(input);
  return d !== null && /^0\.\d+$/.test(d) ? d : null;
}

// The shared status table (sdk/model.ts Status, as each venue's parser decides it) in the recorder's stored
// vocabulary. "closed" and "resolved" retire a target; "expired" (open past its close time) keeps it for the
// post-close grace period. A provisional result ("determined": XO RESOLVED, a Polymarket UMA proposal) retires the
// target once the market has stopped trading; while the venue still says it accepts orders (a Polymarket proposal
// on a market whose flags are still open) the book is live, so it is recorded like an open market and the grace
// period applies. A dispute is not a state the recorder models, so it is "unknown", as is everything the shared
// table does not know.
export function recorderStatus(status: Status, closeMs: number | null, nowMs: number, acceptingOrders: boolean | null = null): MarketStatusCode {
  switch (status) {
    case "active":
      return closeMs !== null && closeMs <= nowMs ? "expired" : "active";
    case "pending":
      return "pending";
    case "paused":
      return "paused";
    case "closed":
    case "voided":
      return "closed";
    case "determined":
      if (acceptingOrders === true) return closeMs !== null && closeMs <= nowMs ? "expired" : "active";
      return "resolved";
    case "resolved":
      return "resolved";
    case "disputed":
    case "unknown":
      return "unknown";
  }
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
// compared with the declared convention only to raise `unsorted_input`; the stored order
// is always canonical. Levels are not merged or dropped silently: bad ones are counted in a flag.
// The collectors hand it levels the shared parsers have already validated and sorted best first, so for them only
// the empty, duplicate and truncation flags can still arise.
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
