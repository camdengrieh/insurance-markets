import { cleanLine } from "./text";

// An outcome's `description` is a structured string written by the market's deployer, for example
//   class:priceBinary|underlying:BTC|expiry:20260503-0600|targetPrice:78213|period:1d
//   perp:BTC|priceDescription:BTC-USDC perp mark|seconds:60|threshold:82444|time:20261019-0145
// Both forms appear in the research captures (docs sample and live outcomeMetaUpdates frames). The text is
// untrusted data. It is parsed only to find a close time and to render a readable, non-semantic title; no
// rule or payoff is inferred from it, except the one documented class `priceBinary` (see mechanismOf).

export interface SpecPair {
  readonly key: string;
  readonly value: string;
}

const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

// `key:value|key:value`, or null when any part is not of that form or a key repeats (then the text is shown
// as plain text and nothing is read from it).
export function parseSpec(description: string): readonly SpecPair[] | null {
  if (description === "" || description.length > 4_000) return null;
  const pairs: SpecPair[] = [];
  const seen = new Set<string>();
  for (const part of description.split("|")) {
    const colon = part.indexOf(":");
    if (colon <= 0) return null;
    const key = part.slice(0, colon);
    if (!KEY.test(key) || seen.has(key)) return null;
    seen.add(key);
    pairs.push({ key, value: part.slice(colon + 1) });
  }
  return pairs;
}

export function valueOf(pairs: readonly SpecPair[] | null, key: string): string | undefined {
  return pairs?.find((pair) => pair.key === key)?.value;
}

// `YYYYMMDD-HHMM`, UTC (the daily markets settle at 06:00 UTC and live templates expire minutes ahead of
// the capture clock). Returns an ISO string, or null for anything that is not a real minute.
export function parseSpecTime(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(value);
  if (match === null) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const exact =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute;
  return exact ? date.toISOString() : null;
}

// The close time of a market: the spec's `expiry`, else its `time`.
export function closeOf(pairs: readonly SpecPair[] | null): string | null {
  return parseSpecTime(valueOf(pairs, "expiry")) ?? parseSpecTime(valueOf(pairs, "time"));
}

// The one resolution fact taken from the notes as established (census, official docs): a recurring
// `priceBinary` market settles by the protocol to the HyperCore mark price, with no third-party oracle.
// Everything else (deployer-settled templates, sports, rates) is "unknown" here.
export function isProtocolMarkClass(pairs: readonly SpecPair[] | null): boolean {
  return valueOf(pairs, "class") === "priceBinary";
}

export const TITLE_MAX = 300;

// A readable title that claims nothing: the deployer's name, then the spec's own keys and values.
export function titleOf(name: string, description: string, pairs: readonly SpecPair[] | null): string {
  const head = cleanLine(name, 100);
  const tail = pairs === null ? cleanLine(description, 200) : pairs.map((pair) => `${pair.key}=${cleanLine(pair.value, 60)}`).join(", ");
  const joined = head === "" ? tail : tail === "" ? head : pairs === null ? `${head} - ${tail}` : `${head}: ${tail}`;
  return cleanLine(joined, TITLE_MAX);
}
