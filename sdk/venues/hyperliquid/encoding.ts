// HIP-4 outcome identity (docs/research/09-venues-onchain-clob.md section 2.6, official asset-ids page, H):
//   encoding = 10 * outcome + side      side 0 = Yes, side 1 = No
//   coin  `#<encoding>`   the name an order book is requested by (info `l2Book`, `allMids` keys)
//   token `+<encoding>`   the name a balance appears under (spot state)
//   asset id = 100_000_000 + encoding   the number an order action carries
// Outcome numbers are venue-assigned integers. They are never parsed out of market text.

export const OUTCOME_ASSET_ID_BASE = 100_000_000;
// 10 * outcome + 1 must stay a safe integer.
export const MAX_OUTCOME = 900_000_000_000;

export type Side = 0 | 1;

export interface OutcomeToken {
  readonly outcome: number;
  readonly side: Side;
  readonly encoding: number;
}

export function isOutcomeNumber(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_OUTCOME;
}

// A market id on this adapter is the decimal outcome number, nothing else.
export function outcomeFromMarketId(marketId: string): number | null {
  if (!/^(?:0|[1-9]\d{0,11})$/.test(marketId)) return null;
  const outcome = Number(marketId);
  return isOutcomeNumber(outcome) ? outcome : null;
}

export function encodingOf(outcome: number, side: Side): number {
  return outcome * 10 + side;
}

export const coinOf = (encoding: number): string => `#${encoding}`;
export const tokenOf = (encoding: number): string => `+${encoding}`;
export const assetIdOf = (encoding: number): number => OUTCOME_ASSET_ID_BASE + encoding;

// Accepts `#<enc>` or `+<enc>` and nothing else. The last digit must be a side (0 or 1).
export function parseOutcomeToken(tokenId: string): OutcomeToken | null {
  const match = /^[#+](0|[1-9]\d{0,12})$/.exec(tokenId);
  if (match === null) return null;
  const encoding = Number(match[1]);
  if (!Number.isSafeInteger(encoding)) return null;
  const side = encoding % 10;
  if (side !== 0 && side !== 1) return null;
  const outcome = (encoding - side) / 10;
  return isOutcomeNumber(outcome) ? { outcome, side, encoding } : null;
}
