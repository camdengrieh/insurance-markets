import * as z from "zod/v4";

// The wire shapes this adapter reads, as zod schemas. They are loose on purpose: an unknown extra field is
// ignored (Gamma rows carry about 100 keys), a field the adapter relies on that is missing or has the wrong type
// is a SCHEMA_DRIFT. Third-party text is data and is never interpreted here.
//
// Provenance of each shape:
//   recorded  a live capture 2026-10-18 in docs/research/fixtures/polymarket (note 08 section 11)
//   unverified the route and field names come from the Data API v2 OpenAPI as quoted in note 26 section 4.3, or
//             from the Gamma docs; NO live capture exists, so no test fixture stands for them.

// Gamma sends arrays as JSON text ("[\"Yes\", \"No\"]") on markets and as real arrays on some fields (positionIds).
// Accept either; anything else is not a list.
function parseJsonList(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
const stringList = z.preprocess(parseJsonList, z.array(z.string()));

const numeric = z.union([z.number(), z.string()]);

export const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
export const TOKEN_ID = /^(?:0|[1-9][0-9]{0,77})$/;
export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const idString = z.union([z.string().min(1).max(40), z.number().int()]).transform(String);

// ---- Gamma (recorded: gamma_market_by_slug, gamma_markets_list, gamma_events_keyset, gamma_public_search) --------

const gammaEventSchema = z.looseObject({
  id: idString.nullish(),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  negRisk: z.boolean().nullish(),
  negRiskMarketID: z.string().nullish(),
  version: z.string().nullish(),
  // The event's ticker and its series ({slug, ticker, ...} objects in the capture): read loosely, for the
  // fixed-taxonomy match only, so an odd shape never fails the whole market.
  ticker: z.unknown().optional(),
  series: z.unknown().optional(),
});

// Every Polymarket market is binary: two outcomes, two complementary tokens (a neg-risk set is several binary
// markets). A row with any other count is refused (the pm adapter's rule, the stricter of the two readers merged
// here). A question longer than 2000 characters or an outcome label longer than 200 is drift, not text to show.
export const gammaMarketSchema = z.looseObject({
  id: idString,
  question: z.string().max(2000),
  conditionId: z.string().regex(CONDITION_ID),
  slug: z.string().min(1).max(300),
  outcomes: stringList.pipe(z.array(z.string().max(200)).length(2)),
  outcomePrices: stringList.nullish(),
  clobTokenIds: stringList.nullish(),
  positionIds: stringList.nullish(),
  version: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  acceptingOrders: z.boolean().nullish(),
  enableOrderBook: z.boolean().nullish(),
  restricted: z.boolean().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  updatedAt: z.string().nullish(),
  description: z.string().nullish(),
  resolutionSource: z.string().nullish(),
  resolvedBy: z.string().nullish(),
  volume: numeric.nullish(),
  volumeNum: z.number().nullish(),
  orderPriceMinTickSize: numeric.nullish(),
  orderMinSize: numeric.nullish(),
  negRisk: z.boolean().nullish(),
  negRiskMarketID: z.string().nullish(),
  questionID: z.string().nullish(),
  umaResolutionStatus: z.string().nullish(),
  // The UMA status history as JSON text ("[\"proposed\", \"resolved\"]" in the recorded events keyset); read in
  // normalize.ts resolutionSignal, where an unreadable value is an unknown signal, never a dropped one.
  umaResolutionStatuses: z.unknown().optional(),
  resolutionStatus: z.string().nullish(),
  umaBond: numeric.nullish(),
  umaReward: numeric.nullish(),
  feesEnabled: z.boolean().nullish(),
  feeSchedule: z
    .looseObject({
      exponent: numeric,
      rate: numeric,
      takerOnly: z.boolean(),
    })
    .nullish(),
  events: z.array(gammaEventSchema).nullish(),
});
export type GammaMarket = z.infer<typeof gammaMarketSchema>;
export type GammaEvent = z.infer<typeof gammaEventSchema>;

// GET /markets/keyset: {markets, next_cursor} (note 08 2.2). SYNTHETIC envelope: the capture holds the rows (a
// bare list from the legacy /markets route) and the events keyset envelope, not this envelope. The rows inside are
// parsed one at a time so one bad row does not hide the page.
export const gammaMarketsKeysetSchema = z.looseObject({
  markets: z.array(z.unknown()),
  next_cursor: z.string().max(2048).nullish(),
});

// GET /public-search: {events:[{..., markets:[...]}], pagination:{hasMore,totalResults}} (recorded).
export const gammaSearchSchema = z.looseObject({
  events: z.array(
    z.looseObject({
      id: idString.nullish(),
      slug: z.string().nullish(),
      title: z.string().nullish(),
      description: z.string().nullish(),
      negRisk: z.boolean().nullish(),
      negRiskMarketID: z.string().nullish(),
      markets: z.array(z.unknown()).nullish(),
    }),
  ),
  pagination: z.looseObject({ hasMore: z.boolean() }),
});

// GET /public-profile?address= (SYNTHETIC shape): only the proxy wallet is read; every personal field is ignored.
export const gammaProfileSchema = z.looseObject({
  proxyWallet: z.string().regex(ADDRESS).nullish(),
});

// ---- CLOB (recorded: clob_book, clob_market_info) ------------------------------------------------------------------

const levelSchema = z.looseObject({ price: z.string(), size: z.string() });

// A side longer than this is not a book this reader trusts itself to sort (the pm adapter's cap).
export const MAX_BOOK_LEVELS = 5000;

export const clobBookSchema = z.looseObject({
  market: z.string().nullish(),
  asset_id: z.string().regex(TOKEN_ID),
  timestamp: z.union([z.string(), z.number()]).nullish(),
  hash: z.string().max(128).nullish(),
  bids: z.array(levelSchema).max(MAX_BOOK_LEVELS),
  asks: z.array(levelSchema).max(MAX_BOOK_LEVELS),
});
export type ClobBookWire = z.infer<typeof clobBookSchema>;

// GET /clob-markets/{conditionId}: abbreviated keys (note 08 2.9, recorded clob_market_info). Read: `c` (condition
// id), `t` (the engine's token list: id and outcome label per entry), `mts` (tick), `mos` (minimum order size), `ao`
// (accepting orders) and `fd` (fee details). `mbf`/`tbf` are signing-era fields and are never read.
export const clobMarketInfoSchema = z.looseObject({
  c: z.string().regex(CONDITION_ID),
  t: z.array(z.looseObject({ t: z.string().regex(TOKEN_ID), o: z.string().max(200) })).max(8),
  mts: numeric.nullish(),
  mos: numeric.nullish(),
  ao: z.boolean().nullish(),
  fd: z
    .looseObject({
      r: numeric,
      e: numeric,
      to: z.boolean(),
    })
    .nullish(),
});

// ---- Data API v2 ---------------------------------------------------------------------------------------------------

const paginationSchema = z.looseObject({
  has_more: z.boolean(),
  next_cursor: z.string().max(2048).nullish(),
});

// GET /v2/positions: the envelope is the one recorded for /v2/trades ({data, pagination}); the ROW is SYNTHETIC
// (named in the OpenAPI as quoted in note 26 4.3, never captured). Rows are parsed one at a time.
export const positionsEnvelopeSchema = z.looseObject({
  data: z.array(z.unknown()),
  pagination: paginationSchema,
});

export const positionRowSchema = z.looseObject({
  proxy_wallet: z.string().nullish(),
  token_id: z.string().regex(TOKEN_ID),
  condition_id: z.string().regex(CONDITION_ID),
  current_size: numeric,
  avg_price: numeric.nullish(),
  entry_cost_usdc: numeric.nullish(),
  entry_fees_usdc: numeric.nullish(),
  total_cost_usdc: numeric.nullish(),
  current_price: numeric.nullish(),
  current_value: numeric.nullish(),
  realized_pnl: numeric.nullish(),
  unrealized_pnl: numeric.nullish(),
  total_pnl: numeric.nullish(),
  status: z.string().nullish(),
  redeemable: z.boolean().nullish(),
  mergeable: z.boolean().nullish(),
  negative_risk: z.boolean().nullish(),
  title: z.string().nullish(),
  slug: z.string().nullish(),
  event_slug: z.string().nullish(),
  outcome: z.string().nullish(),
  outcome_index: z.number().int().nullish(),
  opposite_token_id: z.string().regex(TOKEN_ID).nullish(),
  end_date: z.string().nullish(),
});
export type PositionRowWire = z.infer<typeof positionRowSchema>;

// GET /v2/tokens?condition= (recorded: data_v2_tokens, one row).
export const tokensEnvelopeSchema = z.looseObject({
  data: z.array(
    z.looseObject({
      token_id: z.string().regex(TOKEN_ID),
      condition_id: z.string().regex(CONDITION_ID),
      module: z.string().nullish(),
      clob_index: z.number().int().nullish(),
      opposite_token_id: z.string().regex(TOKEN_ID).nullish(),
    }),
  ),
});

// GET polymarket.com/api/geoblock (shape from the documentation; no capture exists, because the answer echoes the caller's IP address).
export const geoblockSchema = z.looseObject({
  blocked: z.boolean(),
  country: z.string().max(8).nullish(),
  region: z.string().max(16).nullish(),
});
