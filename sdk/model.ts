// The market model shared by every client: the dApp, the Cockpit daemon, the PayBox plugin tools, the linker
// and the API (docs/sdk-and-api-design.md section 3). Types plus the smallest constructors. Pure: no I/O, no
// clock, no environment, no `node:` import.
//
// Rules the types encode:
//   - money, prices and share counts are decimal strings (`Dec`) at every boundary, never floating point;
//   - unknown is `null` (or an absent optional), never 0 and never 0.5;
//   - text a market creator or an upstream service can influence is `Untrusted<string>` and is rendered only
//     as a text node inside a fixed "untrusted" slot.

// Non-negative plain decimal string such as "0.534" (no exponent, hex or separators).
export type Dec = string;

// Market text, theses and rules written by third parties: data, never instructions.
export interface Untrusted<T> {
  readonly untrusted: true;
  readonly value: T;
}

export function untrusted<T>(value: T): Untrusted<T> {
  return { untrusted: true, value };
}

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly detail?: string };

// Every venue any client knows about. A client may support a subset; it declares it with
// `satisfies readonly VenueId[]` so a new id here never silently widens a client's exhaustive tables.
export const VENUE_IDS = [
  "xo",
  "polymarket",
  "polymarket_us",
  "kalshi",
  "limitless",
  "trueo",
  "world",
  "hyperliquid",
  "pascal",
  "novig",
  "og",
  "gemini",
  "sx",
  "udx",
  "prophetx",
  "predictfun",
  "opinion",
  "manifold",
  "myriad",
] as const;

export type VenueId = (typeof VENUE_IDS)[number];

export function isVenueId(value: unknown): value is VenueId {
  return typeof value === "string" && (VENUE_IDS as readonly string[]).includes(value);
}
