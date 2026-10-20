// Public surface of the XO read adapter. Import from here, not from the sibling modules.
export {
  createXoAdapter,
  xoBookAvailability,
  xoCaps,
  xoStatusesFor,
  xoVariantForMode,
  type BookAvailability,
  type DetailedPage,
  type SkippedListRow,
  type XoAdapter,
  type XoAdapterOptions,
  type XoVariant,
} from "./adapter.js";
export { XoAdapterError, isXoAdapterError } from "./errors.js";
export { ADAPTER_VERSION, XO_COLLATERAL, XO_FEE_STATUS, XO_SCHEMA_HASH, XO_TICK, rulesSha256, type MarketDetailResult } from "./map.js";
export { XO_DATA_ORIGIN, XO_ORDERBOOK_ORIGIN } from "./urls.js";
