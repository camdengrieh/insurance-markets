// DefiLlama (api.llama.fi): the de facto registry of prediction-market venues, used here for ONE thing: 24 hour, 7 day
// and 30 day volume and a liveness signal per venue, joined on DefiLlama's slug.
// Source: docs/research/14-platform-of-platforms.md section 2.1, docs/dapp-design.md 4.6.
//
// Keyless and CORS-open. No licence is stated for the data and the repos carry none, so it is read at read time, kept in
// memory and never exported (licence "unknown"). The volumes are adapter-reported, their methodology differs per venue,
// and points-farming venues inflate them: they are context, never a ranking of quality and never a price.

import type { VenueId } from "../../core/ports";

export const DEFILLAMA_ORIGIN = "https://api.llama.fi";
// headers.config.ts READ_SERVICES id the Cockpit's fetch maps this origin onto.
export const DEFILLAMA_READ_SERVICE = "defillama";
export const DEFILLAMA_ADAPTER_VERSION = "defillama-0.1";

// The route: daily volume of every DefiLlama "dexs" adapter, without the chart series. The /protocols list (TVL,
// dead flags) was 9.3 MB on 2026-10-18, above the Cockpit proxy's 8 MiB cap, so it is not used.
export const DEFILLAMA_VOLUME_PATH = "/overview/dexs";
export const DEFILLAMA_VOLUME_QUERY = "excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";

// 1 hour (core/cache.ts CACHE_POLICY.defillama): the route is daily data.
export const DEFILLAMA_TTL_MS = 60 * 60_000;
export const DEFILLAMA_MAX_BODY_CHARS = 8_000_000;

// The category value of a prediction-market row.
export const PREDICTION_CATEGORY = "Prediction Market";

// DefiLlama slug -> the app's venue id, for the venues the app knows. Anything else joins to null: shown by its own
// name, never guessed onto a venue.
export const VENUE_BY_SLUG: Readonly<Record<string, VenueId>> = Object.freeze({
  "xo-market": "xo",
  trueo: "trueo",
  kalshi: "kalshi",
  "polymarket-international": "polymarket",
  "polymarket-us": "polymarket_us",
  "limitless-exchange": "limitless",
  "hyperliquid-outcomes": "hyperliquid",
  "sx-bet-v3": "sx",
  "myriad-markets": "myriad",
  "predict-fun": "predictfun",
  opinion: "opinion",
  world: "world",
});

// Slugs recorded as prediction markets on 2026-10-18. Used only when a volume row carries no `category` field at all
// (the live shape of that field was not checked): a row whose category is present decides by that, and a row without
// one is accepted only if its slug is on this list.
export const KNOWN_PREDICTION_SLUGS: readonly string[] = Object.freeze([
  "kalshi",
  "polymarket-us",
  "polymarket-international",
  "predict-fun",
  "opinion",
  "magicmarkets",
  "xo-market",
  "predictstreet",
  "hyperliquid-outcomes",
  "turboflow-prediction-markets",
  "sx-bet-v3",
  "polymarket-combos",
  "world",
  "pancakeswap-prediction",
  "overtime",
  "sport.fun",
  "limitless-exchange",
  "azuro",
  "alpha-arcade",
  "myriad-markets",
  "pred",
  "predictex",
  "closer",
  "trueo",
]);

export const DEFILLAMA_TERMS_NOTE =
  "DefiLlama (as read): keyless public API; no licence is stated for the data. Volumes are adapter-reported, methodologies differ per venue and points-farming venues inflate them. Context only.";

export const DEFILLAMA_VERIFICATION = Object.freeze({
  rows: "numbers recorded 2026-10-18 from the research's reduced list",
  shape: "the live /overview/dexs envelope, its `category` field and its size were NOT checked; the opt-in drift suite (APP_LIVE=1) was written and not executed",
  tvl: "not read: /protocols is above the proxy's body cap",
});
