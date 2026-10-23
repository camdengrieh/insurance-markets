// The public https origin of the markets API (api/, deployed by deploy/aws behind CloudFront). The XO order relay the
// page trades through lives under it (/v1/relay/xo/clob/...): XO's order book sends no CORS headers for this page, so
// the page reaches it only through that relay.
//
// null in this build: the API's host is known only after it is deployed. Setting it is one change together with the
// CSP: put the origin here AND in connect-src (headers.config.ts, then the generated vercel.json and _headers). While
// it is null the XO trading panel says "XO trading is not available in this build" and makes no request.
export const MARKETS_API_ORIGIN: string | null = null;
