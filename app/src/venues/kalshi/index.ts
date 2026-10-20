export { createKalshiAdapter, type KalshiAdapter, type KalshiOptions, type KalshiReadReport } from "./adapter";
export {
  KALSHI_ADAPTER_VERSION,
  KALSHI_FEE_STATUS,
  KALSHI_FEE_UNCHECKED,
  KALSHI_READ_SERVICE,
  KALSHI_TERMS_NOTE,
  KALSHI_VERIFICATION,
  registeredOrigin as kalshiRegisteredOrigin,
} from "./constants";
export { AdapterFailure, isAdapterFailure } from "./errors";
export { parseTokenId, tokenIdOf, type Side } from "./map";
