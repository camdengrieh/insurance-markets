import * as z from "zod/v4";

// Schemas for the Kalshi answers the shared parser reads (parse.ts). Every field it relies on is validated; extra
// fields are ignored (the venue adds fields without notice). A value that does not fit is a drift, never a guess: a
// row that fails is dropped and counted, an answer whose shape is wrong is SCHEMA_DRIFT. Enrichment fields are read
// as `unknown` and parsed on their own.
// Shapes follow the documented payloads (list rows, order book `orderbook_fp`, exchange status, event, series). No
// response body is committed; the opt-in live suites check the shapes. The single-market answer is assumed to be
// { market: row }. The batch order-book answer was never captured (parse.ts parseBatchBooks reads it tolerantly).

// Tickers go into request paths: only characters that need no escaping. At most 100 characters: the dApp reader
// allowed 200 and the pm adapter 100, and the merged parser keeps the stricter bound (the daemon allowlist's `slug`
// shape admits both).
export const TICKER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
export const tickerSchema = z.string().regex(TICKER);

// Opaque pagination cursor (base64url-like). It goes into a query string, so the alphabet is closed.
export const CURSOR = /^[A-Za-z0-9_=-]{1,512}$/;

export const listEnvelopeSchema = z.looseObject({
  markets: z.array(z.unknown()).max(1000),
  cursor: z.union([z.string().max(600), z.null()]).optional(),
});

export const marketEnvelopeSchema = z.looseObject({ market: z.unknown() });

// First look at a row: enough to tell a binary market from a scalar or a combo before anything else is required.
export const rowHeadSchema = z.looseObject({ ticker: tickerSchema, market_type: z.string().max(32), mve_collection_ticker: z.unknown().optional() });

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
  exchange_index: z.unknown().optional(),
  // A combo (multivariate) leg names its collection here; such a market is not modelled.
  mve_collection_ticker: z.unknown().optional(),
});
export type KalshiRow = z.infer<typeof rowSchema>;

// `[price, size]` pairs as decimal strings. Kalshi sends the best level last; the parser sorts explicitly. A side
// with no orders is null (the documented shape); a missing side is a drift.
const levelSchema = z.tuple([z.string().max(24), z.string().max(24)]);
export const bookBodySchema = z.looseObject({
  yes_dollars: z.union([z.array(levelSchema).max(5_000), z.null()]),
  no_dollars: z.union([z.array(levelSchema).max(5_000), z.null()]),
});
export type KalshiBookBody = z.infer<typeof bookBodySchema>;
export const bookEnvelopeSchema = z.looseObject({ orderbook_fp: bookBodySchema });

export const exchangeStatusSchema = z.looseObject({
  exchange_active: z.boolean(),
  trading_active: z.boolean(),
  // Per-shard flags, read only to count inactive shards.
  exchange_index_statuses: z.unknown().optional(),
});

export const eventEnvelopeSchema = z.looseObject({
  event: z.looseObject({
    event_ticker: tickerSchema,
    series_ticker: tickerSchema,
    mutually_exclusive: z.unknown().optional(),
    settlement_sources: z.unknown().optional(),
  }),
});

export const seriesEnvelopeSchema = z.looseObject({
  series: z.looseObject({
    ticker: tickerSchema,
    fee_type: z.string().max(64),
    fee_multiplier: z.number(),
    settlement_sources: z.unknown().optional(),
  }),
});
