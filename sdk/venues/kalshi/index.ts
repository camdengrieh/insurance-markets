// Kalshi: the dApp's reader (createKalshiAdapter) and the one shared parser every host uses (parse.ts, map.ts).
// RESTRICTED TERMS: whoever calls these keeps the values in memory only and never records or exports them; the
// gates that decide who may call (sdk/venues/policy.ts, pm/adapters/policy.ts) are unchanged by sharing the parser.

export { createKalshiAdapter, type KalshiAdapter, type KalshiOptions, type KalshiReadReport } from "./adapter.js";
export {
  KALSHI_ADAPTER_VERSION,
  KALSHI_API_PREFIX,
  KALSHI_FEE_STATUS,
  KALSHI_FEE_UNCHECKED,
  KALSHI_LIST_STATUS,
  KALSHI_READ_SERVICE,
  KALSHI_TERMS_NOTE,
  KALSHI_VERIFICATION,
  registeredOrigin as kalshiRegisteredOrigin,
} from "./constants.js";
export { AdapterFailure, isAdapterFailure } from "./errors.js";
export {
  COLLATERAL as KALSHI_COLLATERAL,
  KALSHI_SCHEMA_HASH,
  KALSHI_TOKEN_SEPARATOR,
  bookOf,
  feeInputsOf,
  feeSpecOf,
  isModelled,
  kalshiStatus,
  marketOf,
  parseTokenId,
  statusOf,
  summaryOf,
  tickRangesOf,
  tokenIdOf,
  type KalshiEvent,
  type KalshiFeeInputs,
  type KalshiMarketContext,
  type KalshiSeries,
  type RawLevel,
  type Side,
  type TokenSeparator,
} from "./map.js";
export {
  feeChangesVerdict,
  parseBatchBooks,
  parseBookEnvelope,
  parseEventBody,
  parseExchangeStatus,
  parseListBody,
  parseMarketBody,
  parseSeriesBody,
  readBook,
  type KalshiBookRead,
  type KalshiExchangeStatus,
  type KalshiListCounts,
  type KalshiListRead,
  type KalshiMarketRead,
  type Parsed,
  type ParsedList,
} from "./parse.js";
export { CURSOR as KALSHI_CURSOR, TICKER as KALSHI_TICKER, type KalshiBookBody, type KalshiRow } from "./schemas.js";
