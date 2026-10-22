export { createNovigAdapter, sharesOfQty, type NovigAdapter, type NovigMarketDetail, type NovigOptions, type NovigReadReport } from "./adapter.js";
export {
  NOVIG_ADAPTER_VERSION,
  NOVIG_API_BASE,
  NOVIG_DEFAULT_MARKET_TYPES,
  NOVIG_ORIGIN,
  NOVIG_READ_SERVICE,
  NOVIG_TERMS_NOTE,
  NOVIG_TICK_RANGES,
  NOVIG_VERIFICATION,
} from "./constants.js";
export { takerFeeUsd } from "./fee.js";
export { NOVIG_SCHEMA_HASH } from "./map.js";
export { AdapterFailure, assertEnabled, isAdapterFailure, type GateOptions } from "./shared.js";
