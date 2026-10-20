import * as z from "zod/v4";

// The wire shapes this client reads, as loose zod schemas. They check STRUCTURE only (is this an object, is that
// a string, is a boolean a boolean): a field the client relies on that is missing or has the wrong type refuses
// the ROW. Values (enums, ranges, scales) are judged by normalize.ts with specific reasons, because "unknown
// enum" and "out of range" must be told apart (M3-2). An extra field is ignored; nothing here interprets text.
//
// Provenance of the shapes: there is NO live capture of any paid response. Every field name below comes from the
// OpenAPI 20.5.0 summary in docs/research/12-quotient.md sections 5.1 to 5.3 (read by research, never called).
// The mispriced envelope ({markets, count}) is documented; the envelopes of /signals, /markets/lookup and the
// forecast route are NOT, and are guessed from the same naming. Tests label every fixture "synthetic-shape".

// A JSON number or a numeric string, judged later by units.ts. `null` and absent both mean "not given".
const numberish = z.union([z.number(), z.string()]).nullish();
const idish = z.union([z.string().min(1).max(200), z.number()]);

export const venueQuoteSchema = z.looseObject({
  venue: z.string().nullish(),
  market_id: idish.nullish(),
  yes_bid: numberish,
  yes_ask: numberish,
  yes_last: numberish,
  selected_probability: numberish,
  quote_method: z.string().nullish(),
  venue_timestamp: z.string().nullish(),
  observed_at: z.string().nullish(),
  freshness: z.string().nullish(),
});

const sampleSchema = z.looseObject({ n: numberish });

export const qualitySchema = z.looseObject({
  status: z.string().nullish(),
  tier: z.string().nullish(),
  basis: z.string().nullish(),
  assessment_source: z.string().nullish(),
  live: sampleSchema.nullish(),
  historical: sampleSchema.nullish(),
});

export const forecastStatusSchema = z.looseObject({
  state: z.string(),
  price_source: z.string().nullish(),
});

export const compactForecastSchema = z.looseObject({
  id: idish.nullish(),
  probability: z.unknown(),
  created_at: z.string(),
  thesis: z.string().nullish(),
  resolution_pathway: z.string().nullish(),
  delta_from_prior: numberish,
  quality: qualitySchema.nullish(),
});

const sportsBlockSchema = z.looseObject({ yes_side: z.string().nullish() });

// ---- GET /api/v1/markets/mispriced -> { markets: [...], count } ----------------------------------------------------

export const mispricedRowSchema = z.looseObject({
  venue: z.string(),
  marketKey: z.string(),
  nativeMarketId: idish,
  slug: z.string().nullish(),
  question: z.string(),
  q_coverage: z.string(),
  end_date: z.string().nullish(),
  quotient_odds: z.unknown(),
  market_odds: z.unknown(),
  venue_quote: venueQuoteSchema.nullish(),
  inDispute: z.boolean().nullish(),
  spread: z.unknown(),
  spread_direction: z.string(),
  forecast: compactForecastSchema,
  forecast_status: forecastStatusSchema.nullish(),
  sports: sportsBlockSchema.nullish(),
  last_updated: z.string().nullish(),
});

export const mispricedEnvelopeSchema = z.looseObject({ markets: z.array(z.unknown()), count: z.number().int().nonnegative().nullish() });

// ---- GET /api/v1/signals -> { signals: [...] } (envelope key guessed) ----------------------------------------------

const signalMarketSchema = z.looseObject({
  venue: z.string(),
  nativeMarketId: idish,
  marketKey: z.string(),
  question: z.string(),
  q_coverage: z.string(),
  end_date: z.string().nullish(),
});

const signalCommon = {
  id: idish,
  is_active: z.boolean().nullish(),
  in_play: z.boolean().nullish(),
  entry_eligible: z.boolean().nullish(),
  entry_status: z.string().nullish(),
  retired_reason: z.string().nullish(),
  forecast_updated_at: z.string().nullish(),
  published_at: z.string().nullish(),
  resolves_at: z.string().nullish(),
  forecast_status: forecastStatusSchema.nullish(),
  quality: qualitySchema.nullish(),
  conviction_tier: numberish,
  drawdown_risk_elevated: z.boolean().nullish(),
  capacity_usd_at_2c: numberish,
  capacity_basis: z.string().nullish(),
  thesis: z.string().nullish(),
};

export const standardSignalSchema = z.looseObject({
  ...signalCommon,
  side: z.string(),
  q_side: z.string().nullish(),
  latest_q: z.unknown(),
  entry_q: numberish,
  market_odds: numberish,
  live_priced: z.boolean().nullish(),
  priced_at: z.string().nullish(),
  venue_quote: venueQuoteSchema.nullish(),
  market: signalMarketSchema,
});

export const sportsListingSchema = z.looseObject({
  venue: z.string(),
  marketKey: z.string().nullish(),
  signal_side: z.string().nullish(),
  signal_outcome: z.string().nullish(),
  yes_outcome: z.string().nullish(),
  price: numberish,
  signal_available: z.boolean().nullish(),
  entry_eligible: z.boolean().nullish(),
  entry_status: z.string().nullish(),
});

export const sportsSignalSchema = z.looseObject({
  ...signalCommon,
  kind: z.literal("sports_game"),
  pick: z.looseObject({ probability: z.unknown() }),
  sports: sportsBlockSchema,
  markets: z.array(z.unknown()),
});

export const signalsEnvelopeSchema = z.looseObject({ signals: z.array(z.unknown()) });

// ---- GET /api/v1/markets/lookup -> { markets: [{ marketKey, venue, forecast, ... }] } (guessed) ---------------------

export const lookupRowSchema = z.looseObject({
  venue: z.string(),
  marketKey: z.string(),
  question: z.string().nullish(),
  q_coverage: z.string().nullish(),
  forecast: compactForecastSchema,
  sports: sportsBlockSchema.nullish(),
});
export const lookupEnvelopeSchema = z.looseObject({ markets: z.array(z.unknown()) });

// ---- the x402 challenge ----------------------------------------------------------------------------------------------------

export const challengeAcceptSchema = z.looseObject({
  scheme: z.unknown(),
  network: z.unknown(),
  amount: z.unknown(),
  asset: z.unknown(),
  payTo: z.unknown(),
  maxTimeoutSeconds: z.unknown(),
});

export const challengeSchema = z.looseObject({
  x402Version: z.unknown(),
  accepts: z.array(z.unknown()),
});

// Every route that is not an error answers a JSON object; anything else is drift.
export const jsonObjectSchema = z.looseObject({});
