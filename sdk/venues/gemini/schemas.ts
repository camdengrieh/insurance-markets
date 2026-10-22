import * as z from "zod/v4";

// Gemini's public events route (shapes recorded 2026-10-19). The spec warns that only documented fields are stable,
// so only the fields this adapter reads are validated; extra fields are ignored. A field that does not fit is a
// drift. An event with one bad contract is dropped whole, because a categorical event missing an outcome would read as
// a complete set.

// Event tickers and instrument symbols go into request URLs and ids, so they are restricted to characters that need
// no escaping. REST returns GEMI-CTRLUSHOU-DEM; the WebSocket echoes lower case. Compare case-insensitively.
export const TICKER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
export const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const decimalText = z.string().max(24).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,8})?$/);
const isoText = z.string().max(40);

// Prices: a missing side is absent or an empty object on a settled contract.
const sideSchema = z.object({ yes: z.string().max(16).optional(), no: z.string().max(16).optional() });
export const pricesSchema = z.object({
  buy: sideSchema.optional(),
  sell: sideSchema.optional(),
  bestBid: z.string().max(16).optional(),
  bestAsk: z.string().max(16).optional(),
  lastTradePrice: z.string().max(16).optional(),
});
export type GeminiPrices = z.infer<typeof pricesSchema>;

export const contractSchema = z.object({
  id: z.string().max(64),
  label: z.string().max(400),
  // A rich-text document: read with richTextOf, never rendered as markup.
  description: z.unknown().optional(),
  prices: pricesSchema.optional(),
  status: z.string().max(40),
  marketState: z.string().max(40).optional(),
  ticker: z.string().max(64),
  instrumentSymbol: z.string().regex(SYMBOL),
  createdAt: isoText.optional(),
  expiryDate: isoText.optional(),
  resolutionSide: z.string().max(16).optional(),
  resolvedAt: isoText.optional(),
  termsAndConditionsUrl: z.string().max(2048).optional(),
  isCombo: z.boolean().optional(),
  priceIncrement: decimalText.optional(),
  quantityIncrement: decimalText.optional(),
  quantityMinimum: decimalText.optional(),
  sortOrder: z.number().int().optional(),
});
export type GeminiContract = z.infer<typeof contractSchema>;

export const eventSchema = z.object({
  id: z.string().max(64),
  title: z.string().max(1000),
  type: z.enum(["binary", "categorical"]),
  category: z.string().max(100).optional(),
  ticker: z.string().regex(TICKER),
  status: z.string().max(40),
  createdAt: isoText.optional(),
  expiryDate: isoText.optional(),
  startTime: isoText.optional(),
  description: z.string().max(20_000).optional(),
  termsLink: z.string().max(2048).optional(),
  template: z.string().max(64).optional(),
  volume: decimalText.optional(),
  volume24h: decimalText.optional(),
  isLive: z.boolean().optional(),
  contracts: z.array(z.unknown()).min(1).max(500),
  // Child events (spreads, totals, props) are counted, not read.
  events: z.array(z.unknown()).max(2000).optional(),
});
export type GeminiEventShell = z.infer<typeof eventSchema>;

export const listSchema = z.object({
  data: z.array(z.unknown()).max(500),
  pagination: z.object({ limit: z.number().int().nonnegative().optional(), offset: z.number().int().nonnegative().optional(), total: z.number().int().nonnegative().optional() }).optional(),
});

export const SCHEMA_DESCRIPTOR =
  "gemini predictions v1: event{id title type ticker status expiryDate description termsLink template volume24h contracts[]} contract{label description prices{bestBid bestAsk lastTradePrice} status marketState instrumentSymbol resolutionSide priceIncrement quantityMinimum}";
