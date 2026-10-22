// Public surface of the XO read adapter. Import from here, not from the sibling modules.
//
// The XO Data API and orderbook client with its strict decoders (XoClient, decodeMarketPage, decodeMarketDetail,
// decodeBook, lifecycleOf, resolveTakerFee, ...) is ./api/client.js, its transport ./api/http.js, its types
// ./api/types.js and its exact number helpers ./api/units.js. The adapter below decodes through them, and so do
// the plugin (src/xo/client.ts, which adds Node's fetch and clock) and pm/adapters/xo.ts.
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
export {
  ADAPTER_VERSION,
  XO_COLLATERAL,
  XO_FEE_STATUS,
  XO_SCHEMA_HASH,
  XO_TICK,
  bookOf,
  feeSpecOf,
  marketOf,
  rulesSha256,
  statusOf,
  statusOfLifecycle,
  summaryOf,
  type MarketDetailResult,
} from "./map.js";
export { XO_DATA_ORIGIN, XO_ORDERBOOK_ORIGIN } from "./urls.js";
export { XoClient, type XoClientOptions } from "./api/client.js";
export { XoError, XoHttp } from "./api/http.js";

// The event a market belongs to: `rootEventSlug` on the detail and by-slug routes (recorded in
// fixtures/data-market-by-slug.json). The detail decoder does not model events, so this one field is read here, on
// its own: a plain slug or null, never free text. Hosts use it only as a grouping key (the linker and the recorder
// hash it before storing anything).
const ROOT_EVENT_SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/;

export function xoRootEventSlug(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const root = (body as { readonly rootEventSlug?: unknown }).rootEventSlug;
  return typeof root === "string" && ROOT_EVENT_SLUG.test(root) ? root : null;
}
