import * as z from "zod/v4";

// Schemas for the parts of Novig's public catalog this adapter reads (shapes recorded 2026-10-19). Extra fields are
// ignored; a field that does not fit is a drift. A row that fails is dropped and counted by the caller, never guessed.

// Event, market, outcome, order and trade ids are UUID-like. They go into request URLs, so they are restricted to
// characters that need no escaping.
export const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const idSchema = z.string().regex(ID);

// Market types and statuses are closed upper-case vocabularies. A value outside the shape is a row to drop.
const ENUM = /^[A-Z0-9_]{1,64}$/;
const enumSchema = z.string().regex(ENUM);

const decimalText = z.string().max(24).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/);
const msSchema = z.number().int().positive().max(1e14);

export const eventSchema = z.object({
  eventId: idSchema,
  description: z.string().max(1000),
  sport: z.string().max(64).optional(),
  league: z.string().max(64).optional(),
  status: z.string().max(40),
  startsTs: msSchema.optional(),
});
export type NovigEvent = z.infer<typeof eventSchema>;

export const outcomeSchema = z.object({
  outcomeId: idSchema,
  name: z.string().max(400),
  // TBD, WIN, LOSS, PUSH, or a bare decimal (an FMV price).
  status: z.string().max(40),
});

export const feeSchema = z.object({
  coefficient: decimalText,
  makerCredit: decimalText.optional(),
  charged: z.string().max(40),
});

export const marketSchema = z.object({
  marketId: idSchema,
  description: z.string().max(1000),
  eventId: idSchema,
  marketType: enumSchema,
  strike: decimalText.optional(),
  status: z.string().max(40),
  voids: z.string().max(40).optional(),
  startsTs: msSchema.optional(),
  fee: feeSchema.optional(),
  outcomes: z.array(outcomeSchema).min(2).max(32),
});
export type NovigMarket = z.infer<typeof marketSchema>;

// A page: rows are validated one by one so a single odd row drops itself and not the page.
export const pageSchema = z.object({
  items: z.array(z.unknown()).max(5000),
  next: z.string().max(200).nullable().optional(),
});

export const orderSchema = z.object({
  orderId: z.string().max(64).optional(),
  price: z.string().max(16),
  qty: z.number().int().nonnegative().max(1e12),
});

export const bookSchema = z.object({
  marketId: idSchema,
  seq: z.number().int().nonnegative().optional(),
  orders: z.record(idSchema, z.array(orderSchema).max(100)),
});
export type NovigBook = z.infer<typeof bookSchema>;

export const typeListSchema = z.array(z.string().max(64)).max(1000);

// Compact description of what is read, hashed into Market.prov.schemaHash so a change to this adapter's reading
// shows as a different hash.
export const SCHEMA_DESCRIPTOR =
  "novig public v3: event{eventId description status startsTs} market{marketId description eventId marketType strike status voids fee{coefficient makerCredit charged} outcomes[{outcomeId name status}]} book{orders{outcomeId:[price qty]}}";
