// The registry of venue hosts: every upstream origin a venue reader may name, which service id it is, and whether
// a browser may call it directly. Pure data. The dApp builds its CSP from it (app/headers.config.ts), the
// Cockpit's read proxy builds its allowlist from it (bridge/allowlist.ts), and each reader in sdk/venues builds
// its absolute upstream URLs from it. Adding a host is a reviewed change to this file.

// Closed list of upstream services the Cockpit's read proxy can reach (GET /ui/read/<service>/...). One
// service is one origin. bridge/contract.ts builds its zod enum from this list, bridge/allowlist.ts maps
// each id to its origin and allowed paths, and the Cockpit's fetch maps an absolute upstream URL back to
// its service. Adding a service is a reviewed change to this file.
export const READ_SERVICES = [
  "xo_data",
  "xo_explorer",
  "xo_rpc",
  "xo_orderbook",
  "polymarket_gamma",
  "polymarket_clob",
  "polymarket_data",
  "polymarket_us",
  "manifold",
  "pascal",
  "hyperliquid_info",
  "hyperliquid_rpc",
  "defillama",
  "quotient",
  "novig",
  "gemini",
  "limitless",
  "kalshi",
  "rpc_base",
  "rpc_polygon",
  "rpc_bnb",
  "markets_api",
] as const;
export type ReadService = (typeof READ_SERVICES)[number];

export interface OriginEntry {
  readonly origin: string;
  readonly service: ReadService;
  readonly venue: string;
  // T0 = browser-direct, no credential. T0-RPC = public JSON-RPC (dapp-design section 4.2).
  readonly transport: "T0" | "T0-RPC";
  readonly note: string;
}

// Hosts a browser may call directly (a measured access-control-allow-origin, 2026-10-19). Only the
// standalone build lists them. https only, no wildcard, no port. A host is added here by a reviewed
// change that also regenerates the checked-in headers.
export const BROWSER_DIRECT_ORIGINS: readonly OriginEntry[] = /*#__PURE__*/ Object.freeze([
  { origin: "https://api-mainnet.xo.market", service: "xo_data", venue: "xo", transport: "T0", note: "XO Data API: markets, rules, portfolio by Kernel account" },
  { origin: "https://explorer-mainnet.xo.market", service: "xo_explorer", venue: "xo", transport: "T0", note: "XO explorer: chain 3223 balances and transfers" },
  { origin: "https://rpc-mainnet-2.xo.market", service: "xo_rpc", venue: "xo", transport: "T0-RPC", note: "XO chain 3223 JSON-RPC (eth_getCode for account state); stability and key policy unknown" },
  { origin: "https://gamma-api.polymarket.com", service: "polymarket_gamma", venue: "polymarket", transport: "T0", note: "Polymarket Gamma markets and public-profile lookup" },
  { origin: "https://clob.polymarket.com", service: "polymarket_clob", venue: "polymarket", transport: "T0", note: "Polymarket CLOB books and fee rates" },
  { origin: "https://data-api.polymarket.com", service: "polymarket_data", venue: "polymarket", transport: "T0", note: "Polymarket Data API v2 (v1 retires 2026-10-24)" },
  { origin: "https://gateway.polymarket.us", service: "polymarket_us", venue: "polymarket_us", transport: "T0", note: "Polymarket US public gateway; US-only product, labelled" },
  { origin: "https://api.manifold.markets", service: "manifold", venue: "manifold", transport: "T0", note: "Manifold public API" },
  { origin: "https://data.pascal.trade", service: "pascal", venue: "pascal", transport: "T0", note: "Pascal markets, books, accounts by owner pubkey" },
  { origin: "https://api.hyperliquid.xyz", service: "hyperliquid_info", venue: "hyperliquid", transport: "T0", note: "Hyperliquid /info (POST response CORS untested)" },
  { origin: "https://rpc.hyperliquid.xyz", service: "hyperliquid_rpc", venue: "hyperliquid", transport: "T0-RPC", note: "HyperEVM public RPC" },
  { origin: "https://d380ewgt5p205l.cloudfront.net", service: "markets_api", venue: "xo", transport: "T0", note: "Our markets API (deploy/aws, CloudFront): the XO order and bundler relay and the Limitless relay the wallet path trades through, and the Limitless reads of the standalone build; CORS for this page only (measured 2026-10-23)" },
  { origin: "https://api.llama.fi", service: "defillama", venue: "defillama", transport: "T0", note: "DefiLlama protocols: liveness and 30-day volume" },
  { origin: "https://quotient-api-gateway.onrender.com", service: "quotient", venue: "quotient", transport: "T0", note: "Quotient gateway: OFF by default; free routes or a user-pasted key; licence clause shown first" },
  { origin: "https://api.novig.com", service: "novig", venue: "novig", transport: "T0", note: "Novig public catalog: restricted terms, flag OFF, memory-only" },
  { origin: "https://api.gemini.com", service: "gemini", venue: "gemini", transport: "T0", note: "Gemini Predictions public events: restricted terms, flag OFF, memory-only" },
  { origin: "https://base-rpc.publicnode.com", service: "rpc_base", venue: "chain", transport: "T0-RPC", note: "Base public RPC (Trueo reads, balances)" },
  { origin: "https://polygon-bor-rpc.publicnode.com", service: "rpc_polygon", venue: "chain", transport: "T0-RPC", note: "Polygon public RPC" },
  { origin: "https://bsc-rpc.publicnode.com", service: "rpc_bnb", venue: "chain", transport: "T0-RPC", note: "BNB Chain public RPC" },
]);

export interface DaemonOnlyEntry {
  readonly origin: string;
  // null: a host the daemon uses internally but the read proxy never forwards to (the bundler).
  readonly service: ReadService | null;
  readonly venue: string;
  readonly note: string;
}

// Hosts the app source may NAME (an adapter builds absolute upstream URLs and the Cockpit's fetch maps
// them onto the daemon's read proxy) but a browser may never be given a CSP entry for. They are blocked
// for browsers or restricted by terms, so only the daemon's allowlist (bridge/allowlist.ts) may call them.
export const DAEMON_ONLY_ORIGINS: readonly DaemonOnlyEntry[] = /*#__PURE__*/ Object.freeze([
  { origin: "https://orderbooks.xo.market", service: "xo_orderbook", venue: "xo", note: "XO orderbook: no allow-origin for third-party origins" },
  { origin: "https://mainnet-bundler.xo.market", service: null, venue: "xo", note: "XO bundler: preflight without allow-origin; submit is daemon-side" },
  { origin: "https://api.limitless.exchange", service: "limitless", venue: "limitless", note: "Limitless: no allow-origin" },
  { origin: "https://external-api.kalshi.com", service: "kalshi", venue: "kalshi", note: "Kalshi: 403 whenever an Origin is sent; restricted terms, OFF and memory-only" },
]);
