import * as z from "zod/v4";

import { DEC_PATTERN, MAX_DECIMAL_CHARS } from "../../money/decimal.js";
import { MAX_OUTCOME } from "./encoding.js";

// The Hyperliquid /info shapes this adapter understands, and where each comes from:
//   outcomeMeta  official docs sample (docs/research/fixtures/hyperliquid-hip-4-outcome-markets/
//                DOCS_NOT_LIVE_outcomeMeta_settledOutcome_shapes.json, NOT a live capture) plus the live
//                websocket outcomeMetaUpdates frames, whose outcomeCreated payload is the same spec;
//   l2Book       live websocket frames (ws_l2Book_yes_no_pair.json); the REST answer is documented to match;
//   allMids      live websocket frame keys (ws_allMids_outcome_keys.json); the REST answer is documented as
//                a flat coin to mid map;
//   settledOutcome  official docs sample only.
// POST /info was never called by any research stream, so NONE of these is verified against the REST route.
// Hence HYPERLIQUID_SHAPE_STATUS = unverified, and every parser fails closed.

const decimalString = z.string().regex(DEC_PATTERN).max(MAX_DECIMAL_CHARS);

export const sideSpecSchema = z.object({ name: z.string().max(200) });

export const outcomeSpecSchema = z.object({
  outcome: z.number().int().min(0).max(MAX_OUTCOME),
  name: z.string().max(500),
  description: z.string().max(4_000),
  // Exactly two sides: Yes then No (side 0 and 1 of the encoding).
  sideSpecs: z.tuple([sideSpecSchema, sideSpecSchema]),
  // Optional extras seen on live outcomeCreated frames. A malformed extra is ignored, not trusted.
  quoteToken: z.string().regex(/^[A-Za-z0-9]{1,16}$/).optional().catch(undefined),
  venue: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/).optional().catch(undefined),
  deployerFeeScale: decimalString.optional().catch(undefined),
});
export type OutcomeSpec = z.infer<typeof outcomeSpecSchema>;

export const questionSpecSchema = z.object({
  question: z.number().int().min(0).max(MAX_OUTCOME),
  name: z.string().max(500),
  description: z.string().max(4_000).optional(),
  fallbackOutcome: z.number().int().min(0).max(MAX_OUTCOME).nullish(),
  namedOutcomes: z.array(z.number().int().min(0).max(MAX_OUTCOME)).max(500),
  settledNamedOutcomes: z.array(z.number().int().min(0).max(MAX_OUTCOME)).max(500).optional(),
});
export type QuestionSpec = z.infer<typeof questionSpecSchema>;

export const MAX_OUTCOMES = 5_000;

// The envelope is checked as a whole; each row is then checked alone so one odd outcome is dropped, not fatal.
export const outcomeMetaEnvelopeSchema = z.object({
  outcomes: z.array(z.unknown()).max(MAX_OUTCOMES),
  questions: z.array(z.unknown()).max(MAX_OUTCOMES).nullish(),
});

const levelSchema = z.object({ px: z.string().max(40), sz: z.string().max(40), n: z.number().int().min(0).optional() });
export const l2BookSchema = z.object({
  coin: z.string().max(40),
  time: z.number().int().min(0).max(8_640_000_000_000_000),
  levels: z.tuple([z.array(levelSchema).max(200), z.array(levelSchema).max(200)]),
});

export const allMidsSchema = z.record(z.string(), z.unknown());

export const settledOutcomeSchema = z.object({
  spec: outcomeSpecSchema,
  settleFraction: decimalString,
  details: z.string().max(2_000).optional(),
});

export const SCHEMA_DESCRIPTOR =
  "hyperliquid-hip4-v1:outcomeMeta{outcomes[{outcome,name,description,sideSpecs[2]}],questions[]?};l2Book{coin,time,levels[2][{px,sz,n?}]};allMids{#enc:mid};settledOutcome{spec,settleFraction,details?}";
