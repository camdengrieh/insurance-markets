export { createNovigAdapter, sharesOfQty, type NovigAdapter, type NovigMarketDetail, type NovigOptions, type NovigReadReport } from "./adapter";
export {
  NOVIG_ADAPTER_VERSION,
  NOVIG_API_BASE,
  NOVIG_DEFAULT_MARKET_TYPES,
  NOVIG_ORIGIN,
  NOVIG_READ_SERVICE,
  NOVIG_TERMS_NOTE,
  NOVIG_TICK_RANGES,
  NOVIG_VERIFICATION,
} from "./constants";
export { takerFeeUsd } from "./fee";
export { NOVIG_SCHEMA_HASH } from "./map";
export { AdapterFailure, assertEnabled, isAdapterFailure, type GateOptions } from "./shared";
