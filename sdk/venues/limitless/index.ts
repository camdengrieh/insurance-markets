// Limitless: the dApp's reader (createLimitlessAdapter) and the one shared parser (parse.ts, map.ts, schemas.ts), exported
// so every host that reads Limitless rows and books can use it.

import type { LimitlessRow } from "./schemas.js";

export { createLimitlessAdapter, type LimitlessAdapter, type LimitlessOptions, type LimitlessReadReport } from "./adapter.js";
export {
  BASE_USDC_LOWER as LIMITLESS_BASE_USDC,
  LIMITLESS_ADAPTER_VERSION,
  LIMITLESS_CHAIN,
  LIMITLESS_LIST_PAGE_MAX,
  LIMITLESS_READ_SERVICE,
  LIMITLESS_TERMS_NOTE,
  LIMITLESS_VERIFICATION,
  registeredOrigin as limitlessRegisteredOrigin,
} from "./constants.js";
export { AdapterFailure, isAdapterFailure } from "./errors.js";
export {
  COLLATERAL as LIMITLESS_COLLATERAL,
  LIMITLESS_SCHEMA_HASH,
  bookOf,
  categoryNativeOf,
  categoryOf,
  displayPrices,
  expiryMs,
  isClob,
  isModelled,
  marketOf,
  parseBook,
  priceOfNumber,
  rulesOf,
  sharesOfNumber,
  statusOf,
  summaryOf,
  winnerIndex,
  type ParsedBook,
  type RawLevel,
  type TokenPair,
} from "./map.js";
export {
  parseBookBody,
  parseDetailBody,
  parseListBody,
  type LimitlessBookRead,
  type LimitlessListCounts,
  type LimitlessListRead,
  type Parsed,
  type ParsedList,
} from "./parse.js";
export { SLUG as LIMITLESS_SLUG, bookSchema, listEnvelopeSchema, rowHeadSchema, singleRowSchema, type LimitlessBookBody, type LimitlessRow } from "./schemas.js";

// The market's fee switch, `metadata.fee` (a boolean in the recorded detail, fixtures/market_detail_recorded.json), or
// null when absent or not a boolean. It says only whether a fee applies, never its parameters, so no fee model may be
// built from it.
export function limitlessFeeFlag(row: Pick<LimitlessRow, "metadata">): boolean | null {
  const metadata = row.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)["fee"];
  return typeof value === "boolean" ? value : null;
}
