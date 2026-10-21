import * as z from "zod/v4";

// Schemas for the Limitless answers this adapter reads. Every field it relies on is validated; extra fields are
// ignored (the venue adds fields without notice). A value that does not fit is a drift, never a guess: a row
// that fails is dropped and counted, an answer whose shape is wrong throws SCHEMA_DRIFT. Enrichment fields are
// read as `unknown` and parsed on their own, so an odd optional field drops only itself, not the market.
// Shapes: market detail and order book recorded 2026-10-19 (fixtures/*_recorded.json). The list envelope is
// inferred (LIMITLESS_VERIFICATION.list_envelope).

// The slug goes into a request path, so it is restricted to characters that need no escaping. It matches the
// daemon allowlist's own `slug` placeholder.
export const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export const slugSchema = z.string().regex(SLUG);
export const tokenIdSchema = z.string().regex(/^[0-9]{1,78}$/);

export const listEnvelopeSchema = z.looseObject({
  data: z.array(z.unknown()).max(500),
  totalMarketsCount: z.unknown().optional(),
});

// First look at a row: enough to tell a single market from a group before anything else is required of it.
export const rowHeadSchema = z.looseObject({
  slug: slugSchema,
  marketType: z.string().max(32),
});

export const singleRowSchema = z.looseObject({
  slug: slugSchema,
  title: z.string().min(1).max(4000),
  status: z.string().min(1).max(32),
  tradeType: z.string().min(1).max(32),
  marketType: z.string().min(1).max(32),
  collateralToken: z.looseObject({
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    decimals: z.number().int().min(0).max(36),
    symbol: z.string().max(32),
  }),
  tokens: z.looseObject({ yes: tokenIdSchema, no: tokenIdSchema }),
  // Parsed on their own (see map.ts).
  description: z.unknown().optional(),
  prices: z.unknown().optional(),
  winningOutcomeIndex: z.unknown().optional(),
  volumeFormatted: z.unknown().optional(),
  expirationTimestamp: z.unknown().optional(),
  metadata: z.unknown().optional(),
  // The venue's category and tag words (strings in the capture); read for the fixed-taxonomy match only.
  categories: z.unknown().optional(),
  tags: z.unknown().optional(),
});
export type LimitlessRow = z.infer<typeof singleRowSchema>;

const levelSchema = z.looseObject({
  price: z.number(),
  size: z.number(),
  side: z.string().max(8).optional(),
});

// The public book is the YES side only (docs/research/09 section 2.3); `tokenId` names the token it belongs to.
export const bookSchema = z.looseObject({
  bids: z.array(levelSchema).max(5_000),
  asks: z.array(levelSchema).max(5_000),
  tokenId: tokenIdSchema,
});
export type LimitlessBookBody = z.infer<typeof bookSchema>;
