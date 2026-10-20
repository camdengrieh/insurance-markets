// Bundled platform records for the P0/P1 venue set (docs/venue-census.md, aggregation-design 3.x,
// platform-registry-design 3.x, research notes 08/09/11).
//
// Honesty rules for this file:
//  - Nothing here was re-verified when the file was written. "verified" means the cited research
//    note recorded the fact at confidence H from a first-hand method; everything else is labelled
//    "unverified" by `sec()` and cannot gate (staleness.ts).
//  - Unknown is null or "unknown", never a guess. A list of regions is given only when the notes
//    give a complete list; otherwise it is null.
//  - No URL here is fetched by this module. Fee and reachability facts are pointers, not live data.

import { FEE_MODEL_BY_VENUE, feeSpecId, type RegistryVenueId } from "./ids.js";
import {
  SECTION_POLICY,
  type Confidence,
  type Method,
  type Section,
  type SectionKey,
} from "./staleness.js";
import {
  READ_CAP_KEYS,
  type ApiValue,
  type CapabilityFlag,
  type FeesValue,
  type PlatformRecord,
  type ReadCapKey,
} from "./types.js";

// Date the notes this registry was compiled from were last read (design doc and census).
export const REGISTRY_AS_OF = "2026-10-19";

const FIRST_HAND: readonly Method[] = ["primary_doc", "live_api", "onchain_read"];

function sec<T>(
  key: SectionKey,
  value: T,
  confidence: Confidence,
  method: Method,
  sources: readonly string[],
  crossChecked = false,
): Section<T> {
  return {
    value,
    meta: {
      lastVerified: REGISTRY_AS_OF,
      ttlDays: SECTION_POLICY[key].ttlDays,
      verifiedBy: "research-note (not re-verified when compiled)",
      method,
      confidence,
      verification: confidence === "H" && FIRST_HAND.includes(method) ? "verified" : "unverified",
      crossChecked,
      sources,
    },
  };
}

function caps(yes: readonly ReadCapKey[], no: readonly ReadCapKey[] = []): ApiValue["read"]["has"] {
  const out = {} as Record<ReadCapKey, CapabilityFlag>;
  for (const key of READ_CAP_KEYS) {
    out[key] = yes.includes(key) ? "yes" : no.includes(key) ? "no" : "unknown";
  }
  return out;
}

function fees(id: RegistryVenueId, f: Omit<FeesValue, "modelId" | "feeSpecId">): FeesValue {
  const modelId = FEE_MODEL_BY_VENUE[id];
  return { modelId, feeSpecId: feeSpecId(id, modelId), ...f };
}

const AD = "docs/aggregation-design.md";
const PRD = "docs/platform-registry-design.md";
const CENSUS = "docs/venue-census.md";
const N08 = "docs/research/08-venues-polymarket-kalshi.md";
const N09 = "docs/research/09-venues-onchain-clob.md";
const N11 = "docs/research/11-trueo.md";

const XO: PlatformRecord = {
  id: "xo",
  depth: "full",
  adapterVenueId: "xo",
  adapterPriority: "P0",
  identity: sec(
    "identity",
    {
      name: "XO Market",
      aliases: ["XO"],
      jurisdiction: null,
      urls: {
        docs: "https://docs.xo.market",
        apiBase: ["https://orderbooks.xo.market", "https://api-mainnet.xo.market/api"],
      },
      externalIds: { defillamaId: 8020 },
    },
    "H",
    "live_api",
    [`${AD}#3.2`, `${PRD}#1.2`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${AD}#3.2`]),
  kind: sec(
    "kind",
    { operatorType: "onchain_clob", scope: "general", moneyType: "real", negRisk: "no" },
    "H",
    "live_api",
    [`${AD}#3.2`],
  ),
  collateral: sec(
    "collateral",
    { chain: "eip155:3223", asset: "USDC.e", decimals: 6, custody: "smart_account" },
    "H",
    "live_api",
    [`${AD}#2.3`],
  ),
  fees: sec(
    "fees",
    fees("xo", {
      formula: "fee = C x (feeBps / 10000) x p x (1 - p) per filled leg",
      paramsSource: {
        url: "https://orderbooks.xo.market/fee-rate",
        field: "base_fee",
        granularity: "token",
      },
      secondarySource: {
        url: "https://api-mainnet.xo.market/api",
        field: "effectiveFeeConfig.takerFeeBps",
        granularity: "market",
      },
      // Two live sources disagree (base_fee 0 versus 400/800 bps): never label executable until
      // one real fill reconciles them. Confidence M with no cross-check keeps this off the gate.
      status: "conflicted",
      useRule: "max_of_sources_until_fill_reconciled",
      indicative: { taker_bps_typical: "400", maker_rebate_share: "0.35" },
    }),
    "M",
    "live_api",
    [`${AD}#3.3`, `${PRD}#3.7`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "blocked",
      geoModel: "global_restrictions",
      restrictedRegions: ["US", "GB", "FR", "SG", "CA-ON"],
      enforcement: ["ip"],
      kyc: "unknown",
      botsPolicy: "conditional",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`, `${AD}#10`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "full",
        has: caps(["listMarkets", "getMarket", "getBook", "getResolution", "getPositionsByAddress"]),
      },
      trade: { exists: "yes", signing: "eip712" },
    },
    "M",
    "primary_doc",
    [`${AD}#3.2`, `${AD}#3.5`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E2",
      proof: "none",
      humanOnboardingSteps: [
        "Create the XO smart account in the XO web app; no programmatic path is documented.",
        "Make the PayBox wallet the Kernel owner of that account (untested).",
        "Fund the account in the app; there is no public funding path.",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${AD}#3.5`, `${AD}#6.2`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "C", tierByVolume: "C", depthDowngraded: false },
    "M",
    "third_party",
    [`${AD}#3.2`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["xo_manual_modra"],
      oracleCluster: null,
      void: "refund",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`],
  ),
  links: sec(
    "links",
    { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] },
    "M",
    "derived",
    [`${PRD}#4.2`],
  ),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "conditionId", groupFields: ["eventSlug", "rootEventSlug"], exhaustiveFlag: "no" },
    "M",
    "live_api",
    [`${AD}#2.1`, `${AD}#3.2`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "none_found",
      clause:
        "XO terms bar scraping for unauthorized purposes; no data-use restriction was recorded, but the terms are undated.",
    },
    "M",
    "primary_doc",
    [`${AD}#10`],
  ),
};

const POLYMARKET: PlatformRecord = {
  id: "polymarket",
  depth: "full",
  adapterVenueId: "polymarket",
  adapterPriority: "P0",
  identity: sec(
    "identity",
    {
      name: "Polymarket",
      aliases: ["Polymarket International"],
      jurisdiction: null,
      urls: {
        docs: null,
        apiBase: [
          "https://gamma-api.polymarket.com",
          "https://clob.polymarket.com",
          "https://data-api.polymarket.com",
        ],
      },
      externalIds: { defillamaId: null },
    },
    "H",
    "live_api",
    [`${AD}#3.2`, `${AD}#1.5`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${AD}#3.2`]),
  kind: sec(
    "kind",
    { operatorType: "onchain_clob", scope: "general", moneyType: "real", negRisk: "yes" },
    "H",
    "live_api",
    [`${AD}#3.2`, `${N08}#2`],
  ),
  collateral: sec(
    "collateral",
    { chain: "eip155:137", asset: "pUSD", decimals: 6, custody: "self" },
    "H",
    "live_api",
    [`${AD}#2.3`],
  ),
  fees: sec(
    "fees",
    fees("polymarket", {
      formula: "fee = C x rate x p x (1 - p), taker only, 5 dp rounding; fail closed if exponent is not 1",
      paramsSource: {
        url: "https://gamma-api.polymarket.com/markets",
        field: "feeSchedule",
        granularity: "market",
      },
      secondarySource: null,
      status: "verified",
      useRule: "read_live",
      indicative: {
        rate_crypto: "0.07",
        rate_politics_finance_tech: "0.04",
        rate_other: "0.05",
        rate_geopolitics: "0",
      },
    }),
    "H",
    "live_api",
    [`${AD}#3.3`, `${N08}#2.7`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "close_only",
      geoModel: "global_restrictions",
      restrictedRegions: null,
      enforcement: ["ip"],
      kyc: "unknown",
      botsPolicy: "unknown",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`, `${AD}#10`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "full",
        has: caps([
          "listMarkets",
          "search",
          "getMarket",
          "getBook",
          "getBooksBatch",
          "getFeeSpec",
          "getResolution",
          "getPositionsByAddress",
        ]),
      },
      trade: { exists: "yes", signing: "eip712" },
    },
    "H",
    "live_api",
    [`${AD}#3.2`, `${N08}#2`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E2",
      proof: "none",
      humanOnboardingSteps: [
        "Create L2 API credentials with your own wallet in your own client.",
        "Run the geoblock check from your own network before any order; never relay for restricted users.",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${AD}#3.5`, `${AD}#6.2`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "A", tierByVolume: "A", depthDowngraded: false },
    "M",
    "third_party",
    [`${AD}#3.2`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["uma_oo", "chainlink"],
      oracleCluster: "uma",
      void: "fifty_fifty",
      discretionarySettlement: "unknown",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`],
  ),
  links: sec(
    "links",
    {
      liquidityLinks: [],
      inboundFrontEnds: ["metamask-predictions", "jupiter-prediction"],
      nativeCrossRefs: [],
    },
    "M",
    "third_party",
    [`${PRD}#4.2`],
  ),
  marketIdentity: sec(
    "marketIdentity",
    {
      idField: "conditionId",
      groupFields: ["negRiskMarketID", "eventId", "slug"],
      exhaustiveFlag: "no",
    },
    "H",
    "live_api",
    [`${AD}#2.1`, `${N08}#2`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "none_found",
      clause:
        "No data-use restriction was recorded; the terms page is client-rendered and was not fully read.",
    },
    "L",
    "derived",
    [`${AD}#10`],
  ),
};

const KALSHI: PlatformRecord = {
  id: "kalshi",
  depth: "full",
  adapterVenueId: "kalshi",
  adapterPriority: "P0",
  identity: sec(
    "identity",
    {
      name: "Kalshi",
      aliases: [],
      jurisdiction: "US",
      urls: {
        docs: null,
        apiBase: [
          "https://external-api.kalshi.com/trade-api/v2",
          "https://api.elections.kalshi.com/trade-api/v2",
        ],
      },
      externalIds: { defillamaId: null },
    },
    "H",
    "live_api",
    [`${AD}#1.5`, `${AD}#3.2`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${AD}#3.2`]),
  kind: sec(
    "kind",
    { operatorType: "regulated_exchange", scope: "general", moneyType: "real", negRisk: "no" },
    "H",
    "primary_doc",
    [`${AD}#3.2`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "USD", decimals: null, custody: "venue" },
    "H",
    "primary_doc",
    [`${AD}#3.5`],
  ),
  fees: sec(
    "fees",
    fees("kalshi", {
      formula: "fee = ceil_6dp(0.07 x M x C x p x (1 - p)) plus a rounding fee, minus accumulator rebate",
      paramsSource: {
        url: "https://external-api.kalshi.com/trade-api/v2/series",
        field: "fee_type,fee_multiplier",
        granularity: "series",
      },
      secondarySource: {
        url: "https://external-api.kalshi.com/trade-api/v2/events/fee_changes",
        field: "fee_changes",
        granularity: "event",
      },
      status: "verified",
      useRule: "read_live",
      indicative: { taker_rate: "0.07", maker_rate: "0.0175" },
    }),
    // Taker rate is derivable from Kalshi's own worked example and matches an independent feed;
    // the maker rate and combo multiplier are weaker, hence M with a recorded cross-check.
    "M",
    "derived",
    [`${AD}#3.3`, `${N08}#4.10`],
    true,
  ),
  geo: sec(
    "geo",
    {
      usPersons: "allowed",
      geoModel: "checked_at_point_of_use",
      restrictedRegions: null,
      enforcement: ["attestation", "kyc"],
      kyc: "yes",
      botsPolicy: "conditional",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`, `${AD}#10`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "key_for_some",
        publicKeyless: "yes",
        depth: "full",
        has: caps(["listMarkets", "getMarket", "getBook"], ["search"]),
      },
      trade: { exists: "yes", signing: "rsa_pss" },
    },
    "M",
    "primary_doc",
    [`${AD}#3.2`, `${N08}#4`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E4",
      proof: "none",
      humanOnboardingSteps: [
        "Open and fund a KYC'd Kalshi account yourself.",
        "Place orders manually; a PayBox wallet cannot sign Kalshi requests.",
      ],
      unattendedOk: "no",
    },
    "M",
    "derived",
    [`${AD}#3.5`, `${AD}#6.2`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "A", tierByVolume: "A", depthDowngraded: false },
    "M",
    "third_party",
    [`${AD}#3.2`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "unknown",
      earlyClosePossible: "yes",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`],
  ),
  links: sec(
    "links",
    {
      liquidityLinks: [],
      inboundFrontEnds: ["robinhood", "jupiter-prediction", "dflow"],
      nativeCrossRefs: [],
    },
    "L",
    "third_party",
    [`${PRD}#4.2`],
  ),
  marketIdentity: sec(
    "marketIdentity",
    {
      idField: "ticker",
      groupFields: ["event_ticker", "series_ticker"],
      exhaustiveFlag: "no",
    },
    "H",
    "live_api",
    [`${AD}#2.1`, `${N08}#4`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "restricted",
      clause:
        "Kalshi Developer Agreement limits API data to the member's own trading and bars caching and aggregating; data is memory-only and never exported.",
    },
    "M",
    "primary_doc",
    [`${AD}#10`, `${N08}#4.9`],
  ),
};

const TRUEO: PlatformRecord = {
  id: "trueo",
  depth: "full",
  adapterVenueId: "trueo",
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "Trueo",
      aliases: ["TrueMarkets"],
      jurisdiction: "WS",
      urls: { docs: null, apiBase: [] },
      externalIds: { defillamaId: 5251 },
    },
    "M",
    "third_party",
    [`${AD}#3.2`, `${PRD}#1.2`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${AD}#3.2`]),
  kind: sec(
    "kind",
    { operatorType: "onchain_amm", scope: "general", moneyType: "real", negRisk: "unknown" },
    "H",
    "onchain_read",
    [`${AD}#3.2`, `${N11}#1`],
  ),
  collateral: sec(
    "collateral",
    // TYD is not USD (convertToAssets); decimals 6 for the payment token, 18 for outcome tokens.
    { chain: "eip155:8453", asset: "TYD", decimals: 6, custody: "self" },
    "H",
    "onchain_read",
    [`${AD}#2.3`],
  ),
  fees: sec(
    "fees",
    fees("trueo", {
      formula: "Uniswap LP fee + hook fee (feeNumerator / 10000) + price impact + launchpad 5%",
      // The live hook fee value was not found, so no live parameter source is recorded.
      paramsSource: null,
      secondarySource: null,
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { lp_fee_typical: "0.008", launchpad_fee: "0.05" },
    }),
    "M",
    "onchain_read",
    [`${AD}#3.3`, `${N11}#6`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "blocked",
      geoModel: "global_restrictions",
      restrictedRegions: null,
      enforcement: ["unknown"],
      kyc: "unknown",
      botsPolicy: "unknown",
      washTradingProhibited: "unknown",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`, `${N11}#13`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "onchain_rpc",
        publicKeyless: "no",
        depth: "amm_pool",
        has: caps(["getMarket"], ["getBook"]),
      },
      trade: { exists: "yes", signing: "evm_tx" },
    },
    "M",
    "onchain_read",
    [`${AD}#3.2`, `${N11}#7`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E1",
      proof: "none",
      humanOnboardingSteps: [
        "The first buy is 2 to 3 proposals (approve to Permit2, Permit2 approve, adapter execute).",
        "Launchpad deposit needs a Permit2 signature in calldata (an E2 step).",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${AD}#3.5`, `${AD}#6.2`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "X", tierByVolume: "X", depthDowngraded: false },
    "M",
    "third_party",
    [`${AD}#3.2`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["optimistic_council"],
      oracleCluster: null,
      void: "fifty_fifty",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`, `${N11}#5.3`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "M", "derived", [
    `${PRD}#4.2`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "chainId:marketAddress", groupFields: [], exhaustiveFlag: "unknown" },
    "M",
    "onchain_read",
    [`${AD}#2.1`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "none_found",
      clause:
        "On-chain reads only. The app JSON and the undocumented api host are scraping-barred and must not be used.",
    },
    "M",
    "primary_doc",
    [`${AD}#10`, `${N11}#13`],
  ),
};

const LIMITLESS: PlatformRecord = {
  id: "limitless",
  depth: "full",
  adapterVenueId: "limitless",
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "Limitless",
      aliases: ["Limitless Exchange"],
      jurisdiction: null,
      urls: { docs: null, apiBase: ["https://api.limitless.exchange"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "live_api",
    [`${AD}#1.5`, `${N09}#2.3`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${AD}#3.2`]),
  kind: sec(
    "kind",
    { operatorType: "onchain_clob", scope: "general", moneyType: "real", negRisk: "unknown" },
    "H",
    "live_api",
    [`${N09}#2.3`],
  ),
  collateral: sec(
    "collateral",
    { chain: "eip155:8453", asset: "USDC", decimals: 6, custody: "self" },
    "H",
    "live_api",
    [`${AD}#2.3`],
  ),
  fees: sec(
    "fees",
    fees("limitless", {
      formula: "buy 0.40% to 3.00% by price, paid in outcome tokens; sell 0.42% to 1.50% in USDC; takers only",
      paramsSource: {
        url: "https://api.limitless.exchange",
        field: "venue.feeModuleType",
        granularity: "market",
      },
      secondarySource: null,
      status: "verified",
      useRule: "read_live",
      indicative: { buy_min: "0.004", buy_max: "0.03", sell_min: "0.0042", sell_max: "0.015" },
    }),
    "H",
    "live_api",
    [`${AD}#3.3`, `${N09}#2.3`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "blocked",
      geoModel: "global_restrictions",
      restrictedRegions: null,
      enforcement: ["unknown"],
      kyc: "unknown",
      botsPolicy: "allowed",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`, `${AD}#10`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "yes_side_only",
        has: caps(["listMarkets", "getMarket", "getBook"]),
      },
      trade: { exists: "yes", signing: "eip712" },
    },
    "M",
    "primary_doc",
    [`${AD}#3.2`, `${N09}#2.3`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E2",
      proof: "none",
      humanOnboardingSteps: [
        "Create Limitless API credentials in your own client (UI, or the headless Privy token route, still open).",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${AD}#3.5`, `${AD}#6.2`],
  ),
  liquidity: sec(
    "liquidity",
    // Tier D by volume, X by depth (best-bid depth at most about $90 on top-volume books).
    { tier: "X", tierByVolume: "D", depthDowngraded: true },
    "M",
    "third_party",
    [`${AD}#3.2`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["pyth", "chainlink", "external_parity"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "unknown",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${AD}#3.4`],
  ),
  links: sec(
    "links",
    {
      liquidityLinks: [
        { relation: "mirror_of", target: "polymarket" },
        { relation: "settles_on", target: "polymarket" },
      ],
      inboundFrontEnds: [],
      nativeCrossRefs: [
        "metadata.externalSlug",
        "externalProvider",
        "isPolyArbitrage",
        "externalRulesWatch.rulesHash",
      ],
    },
    "M",
    "live_api",
    [`${AD}#3.2`, `${PRD}#3.10`],
  ),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "slug", groupFields: [], exhaustiveFlag: "unknown" },
    "M",
    "live_api",
    [`${AD}#2.1`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "none_found",
      clause: "Terms dated 2026-09-15 allow bots with rules; no data-use restriction was recorded.",
    },
    "M",
    "primary_doc",
    [`${AD}#10`],
  ),
};

const PASCAL: PlatformRecord = {
  id: "pascal",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "Pascal",
      aliases: [],
      jurisdiction: null,
      urls: { docs: "https://docs.pascal.trade", apiBase: ["https://data.pascal.trade"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "live_api",
    [`${CENSUS}#pascal`],
  ),
  status: sec("status", { state: "beta" }, "M", "derived", [`${CENSUS}#pascal`]),
  kind: sec(
    "kind",
    { operatorType: "onchain_hybrid_clob", scope: "general", moneyType: "real", negRisk: "no" },
    "H",
    "live_api",
    [`${CENSUS}#pascal`],
  ),
  collateral: sec(
    "collateral",
    { chain: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", asset: "USDC", decimals: 6, custody: "self" },
    "H",
    "primary_doc",
    [`${CENSUS}#pascal`],
  ),
  fees: sec(
    "fees",
    fees("pascal", {
      formula: "fee = size x price x (1 - price) x taker_fee_rate, paid by the taker",
      paramsSource: {
        url: "https://data.pascal.trade/api/v1/markets",
        field: "taker_fee_rate",
        granularity: "market",
      },
      secondarySource: null,
      status: "verified",
      useRule: "read_live",
      indicative: { taker_fee_rate_default: "0.02", maker_rebate_share_default: "0.25" },
    }),
    "H",
    "live_api",
    [`${CENSUS}#pascal`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "blocked",
      geoModel: "global_restrictions",
      restrictedRegions: [
        "AU", "BE", "FR", "DE", "IT", "NL", "CA-ON", "PL", "CA-QC", "RU", "SG", "TW", "TH", "GB", "US",
      ],
      enforcement: ["ip"],
      kyc: "unknown",
      botsPolicy: "conditional",
      washTradingProhibited: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#pascal`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "full",
        has: caps(["listMarkets", "getMarket", "getBook", "getBooksBatch", "getFeeSpec"]),
      },
      trade: { exists: "yes", signing: "ed25519" },
    },
    "H",
    "live_api",
    [`${CENSUS}#pascal`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "unknown",
      proof: "none",
      humanOnboardingSteps: [
        "Fund the Pascal deposit address with Solana USDC (reasoned, not exercised).",
        "Orders need a registered hot Ed25519 trading key; PayBox permit signing is untested.",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${CENSUS}#pascal`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "D", tierByVolume: "D", depthDowngraded: false },
    "M",
    "third_party",
    [`${CENSUS}#pascal`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange", "external_parity"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#pascal`],
  ),
  links: sec(
    "links",
    {
      liquidityLinks: [{ relation: "settles_on", target: "polymarket" }],
      inboundFrontEnds: [],
      nativeCrossRefs: ["display_attributes.reference"],
    },
    "M",
    "live_api",
    [`${CENSUS}#pascal`],
  ),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "symbol", groupFields: ["event_prefix"], exhaustiveFlag: "no" },
    "M",
    "live_api",
    [`${CENSUS}#pascal`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "unknown",
      clause:
        "The Pascal Platform Data clause may bar commercial aggregator use; this is unresolved, so treat the data as restricted.",
    },
    "L",
    "primary_doc",
    [`${CENSUS}#pascal`],
  ),
};

const SXBET: PlatformRecord = {
  id: "sxbet",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "SX Bet",
      aliases: ["SX"],
      jurisdiction: null,
      urls: { docs: "https://docs.sx.bet", apiBase: ["https://api.sx.bet"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "live_api",
    [`${CENSUS}#sx-bet`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${CENSUS}#sx-bet`]),
  kind: sec(
    "kind",
    { operatorType: "sportsbook_exchange", scope: "sports_only", moneyType: "real", negRisk: "unknown" },
    "H",
    "primary_doc",
    [`${CENSUS}#sx-bet`],
  ),
  collateral: sec(
    "collateral",
    { chain: "eip155:4162", asset: "USDC", decimals: 6, custody: "smart_account" },
    "H",
    "primary_doc",
    [`${CENSUS}#sx-bet`],
  ),
  fees: sec(
    "fees",
    fees("sxbet", {
      formula: "taker pays takerPayoutFee x (1 - p) per $1 of payout on a win; default 1% of net profit",
      // Rates come from a per-account route, so no market-level live source is recorded.
      paramsSource: null,
      secondarySource: null,
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { taker_profit_fee: "0.01", maker_profit_fee: "0", parlay_fee: "0.05" },
    }),
    "M",
    "primary_doc",
    [`${CENSUS}#sx-bet`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "blocked",
      geoModel: "global_restrictions",
      restrictedRegions: null,
      enforcement: ["unknown"],
      kyc: "unknown",
      botsPolicy: "conditional",
      washTradingProhibited: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#sx-bet`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "key_for_some",
        publicKeyless: "yes",
        depth: "unknown",
        has: caps(["listMarkets", "getMarket"]),
      },
      trade: { exists: "yes", signing: "eip712" },
    },
    "M",
    "primary_doc",
    [`${CENSUS}#sx-bet`, `${AD}#3.2`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "unknown",
      proof: "none",
      humanOnboardingSteps: [
        "Create the account, deploy the proxy wallet and make the API key in the SX web app.",
        "SX Rollup (4162) is not in the PayBox chain catalog; funding is a web flow.",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${CENSUS}#sx-bet`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "C", tierByVolume: "C", depthDowngraded: false },
    "M",
    "third_party",
    [`${AD}#3.2`, `${CENSUS}#sx-bet`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "refund",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#sx-bet`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "M", "derived", [
    `${CENSUS}#sx-bet`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "marketHash", groupFields: ["eventId", "leagueId", "sportId"], exhaustiveFlag: "unknown" },
    "M",
    "live_api",
    [`${CENSUS}#sx-bet`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "unknown",
      clause:
        "SX terms bar robots and scrapers while the developer docs invite bots; the wording is undated and unresolved.",
    },
    "L",
    "primary_doc",
    [`${CENSUS}#sx-bet`],
  ),
};

const HYPERLIQUID: PlatformRecord = {
  id: "hyperliquid",
  depth: "full",
  adapterVenueId: "hyperliquid",
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "Hyperliquid HIP-4 Outcomes",
      aliases: ["HIP-4"],
      jurisdiction: null,
      urls: {
        docs: "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api",
        apiBase: ["https://api.hyperliquid.xyz"],
      },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${CENSUS}#hyperliquid-outcomes-hip-4`]),
  kind: sec(
    "kind",
    { operatorType: "onchain_clob", scope: "unknown", moneyType: "real", negRisk: "unknown" },
    "M",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
  collateral: sec(
    "collateral",
    { chain: "hyperliquid:hypercore", asset: "USDC", decimals: null, custody: "self" },
    "M",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
  fees: sec(
    "fees",
    // No numeric outcome rate is published and the "currently zero" claim is stale: fail closed.
    fees("hyperliquid", {
      formula: null,
      paramsSource: null,
      secondarySource: null,
      status: "unknown",
      useRule: "fail_closed",
      indicative: {},
    }),
    "L",
    "third_party",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`, `${N09}#2.6`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "blocked",
      geoModel: "global_restrictions",
      restrictedRegions: null,
      enforcement: ["unknown"],
      kyc: "unknown",
      botsPolicy: "conditional",
      washTradingProhibited: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
  api: sec(
    "api",
    {
      // Reads are POST /info only, so no keyless GET capability is claimed.
      read: { auth: "none", publicKeyless: "unknown", depth: "unknown", has: caps([]) },
      trade: { exists: "yes", signing: "l1_action" },
    },
    "M",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`, `${AD}#3.2`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "unknown",
      proof: "none",
      humanOnboardingSteps: [
        "Approve an agent wallet with one typed-data signature and hold its key locally (untested in PayBox).",
      ],
      unattendedOk: "unknown",
    },
    "M",
    "derived",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`, `${AD}#3.5`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "C", tierByVolume: "C", depthDowngraded: false },
    "M",
    "third_party",
    [`${AD}#3.2`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["protocol_mark"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "M", "derived", [
    `${PRD}#4.2`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: null, groupFields: [], exhaustiveFlag: "unknown" },
    "L",
    "derived",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "unknown",
      clause:
        "Hyperliquid terms limit bots to reasonable usage and exclude persons by a changing list; no data-use clause was recorded.",
    },
    "L",
    "primary_doc",
    [`${CENSUS}#hyperliquid-outcomes-hip-4`],
  ),
};

const MANIFOLD: PlatformRecord = {
  id: "manifold",
  depth: "light",
  adapterVenueId: "manifold",
  adapterPriority: "P2",
  identity: sec(
    "identity",
    {
      name: "Manifold",
      aliases: [],
      jurisdiction: null,
      urls: { docs: "https://docs.manifold.markets/api", apiBase: ["https://api.manifold.markets/v0"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${N09}#2.10`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${AD}#3.2`]),
  kind: sec(
    "kind",
    { operatorType: "play_money", scope: "general", moneyType: "play", negRisk: "unknown" },
    "H",
    "primary_doc",
    [`${N09}#2.10`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "mana", decimals: null, custody: "venue" },
    "H",
    "primary_doc",
    [`${N09}#2.10`],
  ),
  fees: sec(
    "fees",
    fees("manifold", {
      formula: null,
      paramsSource: null,
      secondarySource: null,
      status: "unknown",
      useRule: "fail_closed",
      indicative: {},
    }),
    "L",
    "derived",
    [`${N09}#2.10`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "unknown",
      geoModel: "unknown",
      restrictedRegions: null,
      enforcement: ["unknown"],
      kyc: "unknown",
      botsPolicy: "allowed",
      washTradingProhibited: "unknown",
    },
    "H",
    "primary_doc",
    [`${N09}#2.10`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "unknown",
        has: caps(["listMarkets", "search", "getMarket"], ["getBook"]),
      },
      trade: { exists: "yes", signing: "bearer_key" },
    },
    "H",
    "primary_doc",
    [`${N09}#2.10`],
  ),
  reachability: sec(
    "reachability",
    { class: "E5", proof: "none", humanOnboardingSteps: [], unattendedOk: "no" },
    "M",
    "derived",
    [`${N09}#2.10`],
  ),
  liquidity: sec(
    "liquidity",
    // Play money: dollar tiers do not apply, so it never ranks as a deep pool.
    { tier: "X", tierByVolume: "X", depthDowngraded: false },
    "M",
    "derived",
    [`${N09}#2.10`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["unknown"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "unknown",
      earlyClosePossible: "unknown",
    },
    "L",
    "derived",
    [`${N09}#2.10`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "M", "derived", [
    `${PRD}#4.2`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "id", groupFields: [], exhaustiveFlag: "unknown" },
    "M",
    "primary_doc",
    [`${N09}#2.10`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "none_found",
      clause: "The API licence allows bots but bars using API data to train commercial AI models without a licence.",
    },
    "H",
    "primary_doc",
    [`${N09}#2.10`],
  ),
};

const PROPHETX: PlatformRecord = {
  id: "prophetx",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "ProphetX",
      aliases: [],
      jurisdiction: "US",
      urls: { docs: "https://docs.prophetx.co", apiBase: ["https://cash.api.prophetx.co/partner"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${CENSUS}#prophetx`]),
  kind: sec(
    "kind",
    { operatorType: "regulated_exchange", scope: "sports_only", moneyType: "real", negRisk: "unknown" },
    "H",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "USD", decimals: null, custody: "venue" },
    "H",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  fees: sec(
    "fees",
    fees("prophetx", {
      formula: "straight trades: 2% of net gains per market; parlays use a separate taker curve",
      paramsSource: null,
      secondarySource: null,
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { straight_net_gain_fee: "0.02" },
    }),
    "M",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "allowed",
      geoModel: "checked_at_point_of_use",
      restrictedRegions: null,
      enforcement: ["kyc", "device_location"],
      kyc: "yes",
      botsPolicy: "conditional",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "key_required",
        publicKeyless: "no",
        depth: "unknown",
        has: caps(["listMarkets", "getMarket"]),
      },
      trade: { exists: "yes", signing: "bearer_key" },
    },
    "M",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E4",
      proof: "none",
      humanOnboardingSteps: [
        "Open a KYC'd ProphetX account and make an API key pair yourself; no wallet can sign its orders.",
      ],
      unattendedOk: "no",
    },
    "M",
    "derived",
    [`${CENSUS}#prophetx`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "unknown", tierByVolume: "unknown", depthDowngraded: false },
    "L",
    "derived",
    [`${CENSUS}#prophetx`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "refund",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "L", "derived", [
    `${CENSUS}#prophetx`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: null, groupFields: [], exhaustiveFlag: "unknown" },
    "L",
    "derived",
    [`${CENSUS}#prophetx`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "restricted",
      clause:
        "ProphetX rules limit market data to internal business use with no redistribution; data is memory-only and never exported.",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#prophetx`],
  ),
};

const GEMINI: PlatformRecord = {
  id: "gemini",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "Gemini Predictions",
      aliases: ["Gemini Titan DCM"],
      jurisdiction: "US",
      urls: {
        docs: "https://developer.gemini.com/prediction-markets/market-data.md",
        apiBase: ["https://api.gemini.com"],
      },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${CENSUS}#gemini-predictions`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${CENSUS}#gemini-predictions`]),
  kind: sec(
    "kind",
    { operatorType: "regulated_exchange", scope: "general", moneyType: "real", negRisk: "unknown" },
    "H",
    "primary_doc",
    [`${CENSUS}#gemini-predictions`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "USD", decimals: null, custody: "venue" },
    "H",
    "primary_doc",
    [`${CENSUS}#gemini-predictions`],
  ),
  fees: sec(
    "fees",
    fees("gemini", {
      formula: "taker 0.07 x C x P x (1 - P); maker 0.0175 x C x P x (1 - P); rounded up to the cent",
      paramsSource: {
        url: "https://www.gemini.com/fees/predictions",
        field: "fee schedule page",
        granularity: "category",
      },
      secondarySource: null,
      // A documentation page, not a machine-readable live source.
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { taker_rate: "0.07", maker_rate: "0.0175" },
    }),
    "H",
    "primary_doc",
    [`${CENSUS}#gemini-predictions`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "allowed",
      geoModel: "unknown",
      restrictedRegions: null,
      enforcement: ["kyc"],
      kyc: "yes",
      botsPolicy: "conditional",
      washTradingProhibited: "unknown",
    },
    "M",
    "third_party",
    [`${CENSUS}#gemini-predictions`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "unknown",
        has: caps(["listMarkets", "search", "getMarket"]),
      },
      trade: { exists: "yes", signing: "hmac" },
    },
    "H",
    "live_api",
    [`${CENSUS}#gemini-predictions`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E4",
      proof: "none",
      humanOnboardingSteps: [
        "Open a KYC'd Gemini account, accept the prediction terms and make an HMAC API key yourself.",
      ],
      unattendedOk: "no",
    },
    "M",
    "derived",
    [`${CENSUS}#gemini-predictions`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "C", tierByVolume: "C", depthDowngraded: false },
    "M",
    "live_api",
    [`${CENSUS}#gemini-predictions`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#gemini-predictions`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "L", "derived", [
    `${CENSUS}#gemini-predictions`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "eventTicker", groupFields: [], exhaustiveFlag: "unknown" },
    "M",
    "live_api",
    [`${CENSUS}#gemini-predictions`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "restricted",
      clause:
        "Gemini states its market data is proprietary under a separate Market Data Agreement; data is memory-only and never exported.",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#gemini-predictions`],
  ),
};

const OG: PlatformRecord = {
  id: "og",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P0",
  identity: sec(
    "identity",
    {
      name: "OG (Crypto.com Derivatives North America)",
      aliases: ["OG.com", "Nadex", "CDNA"],
      jurisdiction: "US",
      urls: {
        docs: "https://exchange-developer.crypto.com/fcm-b2c/v1/docs/api/rest-introduction",
        apiBase: ["https://api.crypto.com/fcm/v1/public"],
      },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${CENSUS}#og-crypto-com-nadex`]),
  kind: sec(
    "kind",
    { operatorType: "regulated_exchange", scope: "general", moneyType: "real", negRisk: "unknown" },
    "H",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "USD", decimals: null, custody: "venue" },
    "H",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  fees: sec(
    "fees",
    fees("og", {
      formula:
        "most markets: taker 0.07 x C x P x (1 - P), maker 0.0175 x C x P x (1 - P); crypto, FX and index ladders: $0.02 per contract",
      paramsSource: null,
      secondarySource: null,
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { taker_rate: "0.07", maker_rate: "0.0175", flat_per_contract_usd: "0.02" },
    }),
    "H",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "allowed",
      geoModel: "checked_at_point_of_use",
      restrictedRegions: null,
      enforcement: ["kyc"],
      kyc: "yes",
      botsPolicy: "conditional",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "none",
        publicKeyless: "yes",
        depth: "unknown",
        has: caps(["listMarkets", "getMarket"]),
      },
      trade: { exists: "yes", signing: "hmac" },
    },
    "H",
    "live_api",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E4",
      proof: "none",
      humanOnboardingSteps: [
        "API trading needs FCM onboarding, conformance tests and written sign-off from the exchange.",
      ],
      unattendedOk: "no",
    },
    "M",
    "derived",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  liquidity: sec(
    "liquidity",
    { tier: "unknown", tierByVolume: "unknown", depthDowngraded: false },
    "L",
    "derived",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "L", "derived", [
    `${CENSUS}#og-crypto-com-nadex`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: null, groupFields: [], exhaustiveFlag: "unknown" },
    "L",
    "derived",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "unknown",
      clause:
        "OG API use needs FCM onboarding and conformance sign-off; the data-use clause was not read, so treat the data as restricted.",
    },
    "L",
    "primary_doc",
    [`${CENSUS}#og-crypto-com-nadex`],
  ),
};

const NOVIG: PlatformRecord = {
  id: "novig",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P0",
  identity: sec(
    "identity",
    {
      name: "Novig",
      aliases: ["Ludlow Exchange"],
      jurisdiction: "US",
      urls: { docs: "https://docs.novig.com", apiBase: ["https://api.novig.com"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [`${CENSUS}#novig`]),
  kind: sec(
    "kind",
    { operatorType: "regulated_exchange", scope: "sports_only", moneyType: "real", negRisk: "unknown" },
    "H",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "USD", decimals: 5, custody: "venue" },
    "H",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  fees: sec(
    "fees",
    fees("novig", {
      formula:
        "taker only: fee = c x P x (1 - P) x N cents; game-market fees apply only while the event is live",
      paramsSource: null,
      secondarySource: null,
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { c_game: "0.06", c_futures: "0.06", maker_credit_share: "0.5" },
    }),
    "H",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "allowed",
      geoModel: "allowlist",
      restrictedRegions: null,
      enforcement: ["ip", "device_location", "kyc"],
      kyc: "yes",
      botsPolicy: "conditional",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "key_for_some",
        publicKeyless: "yes",
        depth: "full",
        has: caps(["listMarkets", "getMarket", "getBook"]),
      },
      trade: { exists: "yes", signing: "ed25519" },
    },
    "H",
    "live_api",
    [`${CENSUS}#novig`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E4",
      proof: "none",
      humanOnboardingSteps: [
        "Open a KYC'd US Novig account and register your own trading key; orders cannot be signed by a PayBox EVM wallet.",
      ],
      unattendedOk: "no",
    },
    "M",
    "derived",
    [`${CENSUS}#novig`],
  ),
  liquidity: sec(
    "liquidity",
    // Tier B by straight-book volume; displayed depth at the touch is thin, so one tier down.
    { tier: "C", tierByVolume: "B", depthDowngraded: true },
    "M",
    "third_party",
    [`${CENSUS}#novig`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "last_traded_price",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "L", "derived", [
    `${CENSUS}#novig`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "outcomeId", groupFields: ["event", "league"], exhaustiveFlag: "unknown" },
    "M",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "unknown",
      clause:
        "Whether the terms allow redistributing prices from the public routes is an open question, so treat the data as restricted.",
    },
    "L",
    "primary_doc",
    [`${CENSUS}#novig`],
  ),
};

const UDX: PlatformRecord = {
  id: "udx",
  depth: "full",
  adapterVenueId: null,
  adapterPriority: "P1",
  identity: sec(
    "identity",
    {
      name: "Underdog Exchange (UDX)",
      aliases: ["UDX", "Aristotle Exchange"],
      jurisdiction: "US",
      urls: { docs: null, apiBase: ["https://api.underdogexchange.com"] },
      externalIds: { defillamaId: null },
    },
    "H",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  status: sec("status", { state: "live" }, "M", "derived", [
    `${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`,
  ]),
  kind: sec(
    "kind",
    { operatorType: "regulated_exchange", scope: "sports_only", moneyType: "real", negRisk: "unknown" },
    "M",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  collateral: sec(
    "collateral",
    { chain: "offchain", asset: "USD", decimals: null, custody: "venue" },
    "H",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  fees: sec(
    "fees",
    fees("udx", {
      formula:
        "taker round(0.07 x C x P x (1 - P)); maker round(0.0175 x C x P x (1 - P)); nearest cent, ties to even",
      paramsSource: null,
      secondarySource: null,
      status: "docs_only",
      useRule: "fail_closed",
      indicative: { taker_rate: "0.07", maker_rate: "0.0175" },
    }),
    "H",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  geo: sec(
    "geo",
    {
      usPersons: "allowed",
      geoModel: "checked_at_point_of_use",
      restrictedRegions: null,
      enforcement: ["device_location", "kyc"],
      kyc: "yes",
      botsPolicy: "conditional",
      washTradingProhibited: "yes",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  api: sec(
    "api",
    {
      read: {
        auth: "key_for_some",
        publicKeyless: "yes",
        depth: "full",
        has: caps(["listMarkets", "getMarket", "getBook"]),
      },
      trade: { exists: "yes", signing: "rsa_pss" },
    },
    "H",
    "live_api",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  reachability: sec(
    "reachability",
    {
      class: "E4",
      proof: "none",
      humanOnboardingSteps: [
        "Open a KYC'd UDX account linked to an Underdog Fantasy account and fund it by ACH; orders use an RSA-PSS key no wallet can produce.",
      ],
      unattendedOk: "no",
    },
    "M",
    "derived",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  liquidity: sec(
    "liquidity",
    // Tier A by headline notional, but about 80% of it is combos with no book: one tier down.
    { tier: "B", tierByVolume: "A", depthDowngraded: true },
    "M",
    "third_party",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  resolution: sec(
    "resolution",
    {
      mechanisms: ["exchange"],
      oracleCluster: null,
      void: "unknown",
      discretionarySettlement: "yes",
      earlyClosePossible: "unknown",
    },
    "M",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  links: sec("links", { liquidityLinks: [], inboundFrontEnds: [], nativeCrossRefs: [] }, "L", "derived", [
    `${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`,
  ]),
  marketIdentity: sec(
    "marketIdentity",
    { idField: "ticker", groupFields: [], exhaustiveFlag: "unknown" },
    "M",
    "live_api",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
  dataTerms: sec(
    "dataTerms",
    {
      restricted: "unknown",
      clause:
        "UDX terms bar automated access other than approved APIs; the data-use clause is unresolved, so treat the data as restricted.",
    },
    "L",
    "primary_doc",
    [`${CENSUS}#underdog-exchange-udx-aristotle-exchange-dcm-inc-dco-inc`],
  ),
};

// Order is part of the contract: it fixes the listing order and the canonical hash input.
export const PLATFORM_RECORDS: readonly PlatformRecord[] = Object.freeze([
  XO,
  POLYMARKET,
  KALSHI,
  TRUEO,
  LIMITLESS,
  PASCAL,
  SXBET,
  HYPERLIQUID,
  MANIFOLD,
  PROPHETX,
  GEMINI,
  OG,
  NOVIG,
  UDX,
]);
