import * as z from "zod/v4";

// Schemas for the Underdog Exchange answers this adapter reads. Every field it relies on is validated; extra
// fields are ignored. A value that does not fit is a drift, never a guess: a row that fails is dropped and
// counted, an answer whose shape is wrong throws SCHEMA_DRIFT. Enrichment fields are read as `unknown`.
// Shapes: list, one market and the order book were recorded 2026-10-19 (fixtures/*_recorded.json), against API
// version 2026-07-15. The trade tape is not used.

// Tickers go into request paths: only characters that need no escaping, the daemon allowlist's `slug` shape.
export const TICKER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export const tickerSchema = z.string().regex(TICKER);

// Opaque page token taken from `next_page_url` (base64url without padding in the recorded answer).
export const PAGE_TOKEN = /^[A-Za-z0-9_=-]{1,512}$/;

export const listEnvelopeSchema = z.looseObject({
  markets: z.array(z.unknown()).max(1000),
  next_page_url: z.union([z.string().max(2_000), z.null()]).optional(),
});

export const marketEnvelopeSchema = z.looseObject({ market: z.unknown() });

export const rowSchema = z.looseObject({
  ticker: tickerSchema,
  description: z.string().min(1).max(10_000),
  expires_at: z.string().min(10).max(40),
  status: z.string().min(1).max(32),
  tick_size: z.string().max(16),
  minimum_price: z.string().max(16),
  maximum_price: z.string().max(16),
  // Parsed on their own (see map.ts). A combo carries `legs`.
  legs: z.unknown().optional(),
  external_ids: z.unknown().optional(),
});
export type UdxRow = z.infer<typeof rowSchema>;

// `[price, quantity]` pairs as decimal strings, YES space, best first.
const levelSchema = z.tuple([z.string().max(24), z.string().max(24)]);
export const bookEnvelopeSchema = z.looseObject({
  orderbook: z.looseObject({
    ticker: tickerSchema,
    bids: z.array(levelSchema).max(5_000),
    asks: z.array(levelSchema).max(5_000),
  }),
});
export type UdxBookBody = z.infer<typeof bookEnvelopeSchema>["orderbook"];
