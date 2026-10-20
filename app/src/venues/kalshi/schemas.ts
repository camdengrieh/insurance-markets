import * as z from "zod/v4";

// Schemas for the Kalshi answers this adapter reads. Every field it relies on is validated; extra fields are
// ignored (the venue adds fields without notice). A value that does not fit is a drift, never a guess: a row
// that fails is dropped and counted, an answer whose shape is wrong throws SCHEMA_DRIFT. Enrichment fields are
// read as `unknown` and parsed on their own.
// Shapes follow the documented payloads (list rows, order book `orderbook_fp`, exchange status, event, series). No
// response body is committed; the opt-in live suite checks the shapes. The single-market answer is assumed to be { market: row }.

// Tickers go into request paths: only characters that need no escaping, the daemon allowlist's `slug` shape.
export const TICKER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
export const tickerSchema = z.string().regex(TICKER);

// Opaque pagination cursor (base64url-like). It goes into a query string, so the alphabet is closed.
export const CURSOR = /^[A-Za-z0-9_=-]{1,512}$/;

export const listEnvelopeSchema = z.looseObject({
  markets: z.array(z.unknown()).max(1000),
  cursor: z.union([z.string().max(600), z.null()]).optional(),
});

export const marketEnvelopeSchema = z.looseObject({ market: z.unknown() });

export const rowHeadSchema = z.looseObject({ ticker: tickerSchema, market_type: z.string().max(32) });

export const priceRangeSchema = z.looseObject({
  start: z.string().max(16),
  end: z.string().max(16),
  step: z.string().max(16),
});

export const rowSchema = z.looseObject({
  ticker: tickerSchema,
  event_ticker: tickerSchema,
  title: z.string().min(1).max(2000),
  status: z.string().min(1).max(32),
  market_type: z.string().min(1).max(32),
  close_time: z.string().min(10).max(40),
  price_ranges: z.array(priceRangeSchema).min(1).max(16),
  rules_primary: z.string().max(20_000),
  // Parsed on their own (see map.ts).
  rules_secondary: z.unknown().optional(),
  yes_sub_title: z.unknown().optional(),
  no_sub_title: z.unknown().optional(),
  open_time: z.unknown().optional(),
  expected_expiration_time: z.unknown().optional(),
  latest_expiration_time: z.unknown().optional(),
  can_close_early: z.unknown().optional(),
  result: z.unknown().optional(),
  last_price_dollars: z.unknown().optional(),
  volume_24h_fp: z.unknown().optional(),
});
export type KalshiRow = z.infer<typeof rowSchema>;

// `[price, size]` pairs as decimal strings. Kalshi sends the best level last; the adapter sorts explicitly.
const levelSchema = z.tuple([z.string().max(24), z.string().max(24)]);
export const bookEnvelopeSchema = z.looseObject({
  orderbook_fp: z.looseObject({
    yes_dollars: z.union([z.array(levelSchema).max(5_000), z.null()]),
    no_dollars: z.union([z.array(levelSchema).max(5_000), z.null()]),
  }),
});
export type KalshiBookBody = z.infer<typeof bookEnvelopeSchema>["orderbook_fp"];

export const exchangeStatusSchema = z.looseObject({
  exchange_active: z.boolean(),
  trading_active: z.boolean(),
});

export const eventEnvelopeSchema = z.looseObject({
  event: z.looseObject({ event_ticker: tickerSchema, series_ticker: tickerSchema }),
});

export const seriesEnvelopeSchema = z.looseObject({
  series: z.looseObject({ ticker: tickerSchema, fee_type: z.string().max(64), fee_multiplier: z.number() }),
});
