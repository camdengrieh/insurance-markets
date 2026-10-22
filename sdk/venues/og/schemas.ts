import * as z from "zod/v4";

// OG's public FCM market-data routes (shapes recorded 2026-10-19). Every answer is an envelope
// {id, method, code, result}; code 0 is success. Only the fields this adapter reads are validated; extra fields are
// ignored. A field that does not fit is a drift.

// Event and instrument symbols go into request URLs and ids, so they are restricted to characters that need no escaping.
export const EVENT_SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
export const INSTRUMENT_SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
export const OPAQUE_CURSOR = /^[A-Za-z0-9_=-]{1,200}$/;
export const PREDICT_MARKET_ID = /^[0-9]{6,40}$/;

export const envelopeSchema = z.object({
  id: z.number().optional(),
  method: z.string().max(100).optional(),
  code: z.number().int(),
  message: z.string().max(500).optional(),
  result: z.unknown().optional(),
});

export const pageResultSchema = z.object({
  data: z.array(z.unknown()).max(5000),
  next_cursor: z.string().max(400).nullable().optional(),
});

export const eventRowSchema = z.object({ symbol: z.string().regex(EVENT_SYMBOL) });

const stringRecord = z.record(z.string().max(100), z.unknown());

export const instrumentSchema = z.object({
  symbol: z.string().regex(INSTRUMENT_SYMBOL),
  inst_type: z.string().max(40),
  display_name: z.string().max(1000).optional(),
  tradable: z.boolean().optional(),
  price_tick_size: z.string().max(16).optional(),
  qty_tick_size: z.string().max(16).optional(),
  underlying_symbol: z.string().regex(EVENT_SYMBOL),
  event_details: z
    .object({
      metaData: stringRecord.optional(),
      eventName: z.string().max(1000).nullable().optional(),
      attributes: stringRecord.optional(),
    })
    .optional(),
});
export type OgInstrument = z.infer<typeof instrumentSchema>;

// Prices and quantities are strings; a side with no quote is absent or "".
export const tickerSchema = z.object({
  i: z.string().regex(INSTRUMENT_SYMBOL),
  a: z.string().max(16).optional(),
  b: z.string().max(16).optional(),
  k: z.string().max(16).optional(),
  v: z.string().max(24).optional(),
  t: z.number().int().nonnegative().optional(),
});
export type OgTicker = z.infer<typeof tickerSchema>;

const levelSchema = z.tuple([z.string().max(16), z.string().max(24)]);
export const bookRowSchema = z.object({
  bids: z.array(levelSchema).max(200),
  asks: z.array(levelSchema).max(200),
  t: z.number().int().nonnegative().optional(),
});
export const bookResultSchema = z.object({
  data: z.array(z.unknown()).min(1).max(2),
  instrument_name: z.string().regex(INSTRUMENT_SYMBOL).optional(),
});

export const SCHEMA_DESCRIPTOR =
  "og fcm public v1: event{symbol} instrument{symbol inst_type tradable underlying_symbol price_tick_size event_details{metaData{NAME LEAGUE EVENT_DATE PARTICIPANT PREDICT_CATEGORY PREDICT_MARKET_ID PREDICT_CONTRACT_TYPE PREDICT_PERIOD_TYPE}}} ticker{i a b k v t} book{bids asks t}";
