// The public https origin of the markets API (api/, deployed by deploy/aws behind CloudFront). The XO order relay the
// page trades through lives under it (/v1/relay/xo/clob/...): XO's order book sends no CORS headers for this page, so
// the page reaches it only through that relay.
//
// The CloudFront domain of the pm-workers stack (output ApiCloudFrontDomain, deployed 2026-10-23). It is also in
// connect-src (sdk/venues/origins.ts BROWSER_DIRECT_ORIGINS, then the generated vercel.json and _headers): change both
// together. With null the XO trading panel says "XO trading is not available in this build" and makes no request.
export const MARKETS_API_ORIGIN: string | null = "https://d380ewgt5p205l.cloudfront.net";
