// The public https origin of the markets API (api/, deployed by deploy/aws behind CloudFront). The XO order relay the
// page trades through lives under it (/v1/relay/xo/clob/...): XO's order book sends no CORS headers for this page, so
// the page reaches it only through that relay. Limitless sends none either: the standalone build reads its markets from
// this API (/v1/markets?venue=limitless, core/markets-api-limitless.ts) and trades through its Limitless relay
// (/v1/relay/limitless/..., features/trade/direct/limitless).
//
// The CloudFront domain of the pm-workers stack (output ApiCloudFrontDomain, deployed 2026-10-23). It is also in
// connect-src (sdk/venues/origins.ts BROWSER_DIRECT_ORIGINS, then the generated vercel.json and _headers): change both
// together. With null the XO trading panel says "XO trading is not available in this build", the Limitless ticket says
// the same for Limitless, Limitless reads need the Cockpit again, and none of them makes a request.
export const MARKETS_API_ORIGIN: string | null = "https://d380ewgt5p205l.cloudfront.net";
