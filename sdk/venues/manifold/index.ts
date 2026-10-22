export {
  MANIFOLD_ADAPTER_VERSION,
  MANIFOLD_API_BASE,
  MANIFOLD_ORIGIN,
  MANIFOLD_RATE_LIMIT_PER_MINUTE,
  MANIFOLD_READ_SERVICE,
  MANIFOLD_SCHEMA_HASH,
  MANIFOLD_TERMS_NOTE,
  createManifoldAdapter,
  statusOfRow,
  type ManifoldAdapter,
  type ManifoldReadReport,
} from "./adapter.js";
export { AdapterFailure, isAdapterFailure } from "./errors.js";
