// Polymarket read adapter (docs/dapp-design.md 7.4 work package C2). Read-only: no order, no signature, no key.
export { createPolymarketAdapter } from "./adapter";
export type {
  ListResult,
  PolymarketAdapter,
  PolymarketAdapterOptions,
  PositionsPage,
  PositionsQuery,
  RejectedRow,
  TokenCrossCheck,
} from "./adapter";
export { bestAsk, bestBid, complementBook, parseBook } from "./book";
export {
  ADAPTER_VERSION,
  CLOB_ORIGIN,
  COLLATERAL,
  DATA_ORIGIN,
  DOCUMENTED_LIMITS_PER_10S,
  GAMMA_ORIGIN,
  GEOBLOCK_FACTS,
  TTL_MS,
} from "./constants";
export { codeOf, isPolymarketError, PolymarketError } from "./errors";
export { GEOBLOCK_UNCHECKED_REASON, parseGeoblock, uncheckedGeoblock } from "./geoblock";
export type { GeoblockStatus } from "./geoblock";
export { selectTokenIds } from "./ids";
export type { Ledger, TokenIds } from "./ids";
export { gammaSchemaHash, resolutionSignal, rulesHash } from "./normalize";
export { parsePositionRow, POSITION_QUERY_STATUSES, resolveOutcome, statusOfRow } from "./positions";
export type { PolymarketPosition, PositionQueryStatus, PositionStatus } from "./positions";
