import * as z from "zod/v4";

// Strict-where-it-matters schemas for Pascal's answers. Every field the adapter reads is validated; extra
// fields are ignored (the venue adds fields without notice). A value that does not fit is a drift, never a
// guess: a row that fails is dropped and counted, an answer whose shape is wrong throws SCHEMA_DRIFT.
// Shapes: recorded 2026-10-19 for /markets and /books (fixtures/*_recorded.json); /accounts/{owner} is
// synthetic (the populated answer was never observed).

// "EVENT.MARKET", for example HOUSE_2026_CTRL.DEM or ANTH_IPO_MC_27DEC31_RNG.0_4T. The symbol goes into a
// request URL, so it is restricted to characters that need no escaping and must hold a dot.
export const SYMBOL = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
export const symbolSchema = z.string().max(96).regex(SYMBOL);

// All decimals are 6-dp strings. Non-negative.
const decSchema = z.string().max(24).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/);
const digitsSchema = z.string().max(20).regex(/^[0-9]+$/);
const signedIntSchema = z.string().max(20).regex(/^-?(?:0|[1-9][0-9]*)$/);
// Timestamps arrive as digit strings; a bare number is accepted too (the research note printed one).
const msSchema = z.union([digitsSchema, z.number().int().nonnegative()]);

// A millisecond timestamp as a number, or null when it is zero, absurd or not an integer.
export function msOf(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const ms = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(ms) && ms > 0 && ms < 1e14 ? ms : null;
}

// A price that may be absent on a one-sided market: missing, null and "" all mean "no price".
const optionalPriceSchema = z.union([decSchema, z.literal(""), z.null()]).optional();

export const envelopeSchema = z.looseObject({
  status: z.string().max(32),
  data: z.unknown().optional(),
  seq: z.union([digitsSchema, z.number().int().nonnegative()]).optional(),
  state_time_ms: msSchema.optional(),
  server_time_ms: msSchema.optional(),
});
export type Envelope = z.infer<typeof envelopeSchema>;

const referenceSchema = z.object({
  kind: z.literal("polymarket"),
  market_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,199}$/),
  condition_id: z.string().regex(/^0x[0-9a-f]{64}$/),
  market_outcome_token_id: z.string().regex(/^[0-9]{1,80}$/),
  reverse_outcome_token_id: z.string().regex(/^[0-9]{1,80}$/),
});
export type PascalReference = z.infer<typeof referenceSchema>;

const scalarSchema = z.object({
  lower: z.string().max(24),
  upper: z.string().max(24),
});

export const displayAttributesSchema = z.looseObject({
  event_description: z.string().max(2000).optional(),
  market_description: z.string().max(2000).optional(),
  expected_resolution_time_ms: msSchema.optional(),
  expected_event_start_time_ms: msSchema.optional(),
  // Parsed on their own so an unknown shape drops only the enrichment, not the market.
  reference: z.unknown().optional(),
  scalar: z.unknown().optional(),
  outcome_labels: z.unknown().optional(),
  tags: z.array(z.string().max(80)).max(40).optional(),
});

const volumeWindowSchema = z.looseObject({
  taker_buy_volume_notional: decSchema.optional(),
  taker_sell_volume_notional: decSchema.optional(),
});

export const marketRowSchema = z.looseObject({
  symbol: symbolSchema,
  taker_fee_rate: decSchema,
  maker_rebate_share: decSchema,
  tick_size_min: decSchema,
  tick_sig_figs: z.number().int().min(0).max(9),
  display_attributes: displayAttributesSchema.optional(),
  listing_ts_ms: msSchema.optional(),
  rules_url: z.string().max(1024).optional(),
  stats: z.looseObject({ last_24h: volumeWindowSchema.optional() }).optional(),
  best_bid: optionalPriceSchema,
  best_ask: optionalPriceSchema,
  mark_price: optionalPriceSchema,
});
export type MarketRow = z.infer<typeof marketRowSchema>;

export const marketsDataSchema = z.array(z.unknown());

export function parseReference(value: unknown): PascalReference | null {
  const parsed = referenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseScalar(value: unknown): { readonly lower: string; readonly upper: string } | null {
  const parsed = scalarSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---- books ------------------------------------------------------------------------------------------------------------------

const levelSchema = z.tuple([decSchema, decSchema]);
export const bookSchema = z.looseObject({
  bids: z.array(levelSchema).max(5000),
  asks: z.array(levelSchema).max(5000),
});
export const booksDataSchema = z.looseObject({ books: z.record(z.string().max(96), z.unknown()) });

// ---- account (SYNTHETIC SHAPE) --------------------------------------------------------------------------------------

// `collateral_usd` and `pending_deposits` are named in the docs. The position fields are NOT: the signed size
// (negative = short, as in the trades `*_position_size_prev` fields) is accepted under one of two names, and
// anything else fails closed. Replace with the recorded shape once DT8 has run.
export const accountPositionSchema = z.looseObject({
  symbol: symbolSchema,
  size: signedIntSchema.optional(),
  position_size: signedIntSchema.optional(),
});
export const accountDataSchema = z.looseObject({
  collateral_usd: decSchema.optional(),
  pending_deposits: decSchema.optional(),
  positions: z.array(z.unknown()).max(5000).optional(),
});
