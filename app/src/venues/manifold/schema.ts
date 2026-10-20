import * as z from "zod/v4";

// The Manifold shapes this adapter understands, taken from the recorded fixtures (fixtures/*.json, captured
// 2026-10-19 with user ids stripped) and docs/research/09-venues-onchain-clob.md section 2.10. Anything
// outside them is skipped (a kind of market this adapter does not model) or fails closed (SCHEMA_DRIFT).
// Unknown keys are ignored, never trusted.

// Ids end up in a URL path, so only the characters Manifold uses are accepted.
export const MARKET_ID = /^[A-Za-z0-9_-]{1,64}$/;

const marketId = z.string().regex(MARKET_ID);
const nonNegative = z.number().min(0);
// A slow JSON number, never an object or string: a string where a number belongs is drift.
const timeMs = z.number().int().min(0).max(8_640_000_000_000_000);

// First pass: is this a row we model at all? A row that fails THIS is drift; a row that passes but is not
// a play-money binary market is skipped.
export const kindSchema = z.object({
  id: marketId,
  outcomeType: z.string().min(1).max(40),
  token: z.string().min(1).max(20).optional(),
});

export const OUTCOME_TYPE_BINARY = "BINARY";
export const TOKEN_MANA = "MANA";

export const binaryRowSchema = z.object({
  id: marketId,
  question: z.string().min(1).max(4_000),
  outcomeType: z.literal(OUTCOME_TYPE_BINARY),
  mechanism: z.string().regex(/^[a-z0-9-]{1,24}$/),
  probability: z.number().min(0).max(1),
  isResolved: z.boolean(),
  token: z.string().min(1).max(20),
  pool: z.object({ YES: nonNegative, NO: nonNegative }).optional(),
  volume: nonNegative.optional(),
  volume24Hours: nonNegative.optional(),
  totalLiquidity: nonNegative.optional(),
  closeTime: timeMs.nullish(),
  createdTime: timeMs.nullish(),
  lastUpdatedTime: timeMs.nullish(),
  resolutionTime: timeMs.nullish(),
  resolution: z.string().max(40).nullish(),
  // Only the detail route is known to carry these (not in the recorded fixture, so unverified).
  textDescription: z.string().max(200_000).nullish(),
});
export type BinaryRow = z.infer<typeof binaryRowSchema>;

export const searchResponseSchema = z.array(z.unknown()).max(1_000);

// What the parser expects, hashed into Market.prov.schemaHash so a change here is visible downstream.
export const SCHEMA_DESCRIPTOR =
  "manifold-binary-v1:id,question,outcomeType=BINARY,mechanism,probability[0,1],isResolved,token=MANA,pool?,volume?,volume24Hours?,totalLiquidity?,closeTime?,createdTime?,lastUpdatedTime?,resolutionTime?,resolution?,textDescription?";
