import * as z from "zod/v4";

// Schemas for the SX Bet answers this adapter reads. Every field it relies on is validated; extra fields are
// ignored. A value that does not fit is a drift, never a guess: a row that fails is dropped and counted, an
// answer whose shape is wrong throws SCHEMA_DRIFT. Enrichment fields are read as `unknown`.
// Shapes: list, find and the legacy order book were recorded 2026-10-19 (fixtures/*_recorded.json).
// Trade-tape rows carry bettor addresses and names; that route is not used and is not modelled.

export const MARKET_HASH = /^0x[0-9a-fA-F]{64}$/;
export const marketHashSchema = z.string().regex(MARKET_HASH);

// Opaque pagination key (a hex id in the recorded answer). It goes into a query string: closed alphabet.
export const PAGE_KEY = /^[A-Za-z0-9_=-]{1,512}$/;

const successEnvelope = <T extends z.ZodType>(data: T) => z.looseObject({ status: z.literal("success"), data });

export const listEnvelopeSchema = successEnvelope(
  z.looseObject({
    markets: z.array(z.unknown()).max(1000),
    nextKey: z.union([z.string().max(600), z.null()]).optional(),
  }),
);

export const findEnvelopeSchema = successEnvelope(z.array(z.unknown()).max(100));

export const rowSchema = z.looseObject({
  status: z.string().min(1).max(32),
  marketHash: marketHashSchema,
  outcomeOneName: z.string().min(1).max(500),
  outcomeTwoName: z.string().min(1).max(500),
  tradingModes: z.array(z.string().max(32)).max(8),
  // Parsed on their own (see map.ts).
  teamOneName: z.unknown().optional(),
  teamTwoName: z.unknown().optional(),
  leagueLabel: z.unknown().optional(),
  sportLabel: z.unknown().optional(),
  gameTime: z.unknown().optional(),
  marketMeta: z.unknown().optional(),
  line: z.unknown().optional(),
});
export type SxRow = z.infer<typeof rowSchema>;

// A level: odds and stake as digit strings (odds times 1e20; stake in USDC base units).
const digits = z.string().regex(/^[0-9]{1,40}$/);
const levelSchema = z.looseObject({ percentageOdds: digits, size: digits });

export const bookEnvelopeSchema = successEnvelope(
  z.looseObject({
    marketHash: marketHashSchema,
    outcomeOne: z.array(levelSchema).max(5_000),
    outcomeTwo: z.array(levelSchema).max(5_000),
    version: z.union([z.string().max(64), z.null()]).optional(),
  }),
);
export type SxBookBody = z.infer<typeof bookEnvelopeSchema>["data"];

export const metadataEnvelopeSchema = successEnvelope(z.looseObject({ chainId: z.number().int() }));

// `marketMeta` on crypto markets is a JSON string; only the expiry is read.
export const marketMetaSchema = z.looseObject({ expiresAt: z.string().max(40) });
