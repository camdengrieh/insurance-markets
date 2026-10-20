// The single source of truth for every origin the app may name and for both Content-Security-Policies
// (docs/dapp-design.md sections 1.3 B7, 5.4 and 7.2 W0).
//
// Two builds of one app:
//   standalone  the read-only explorer, a static release asset the user serves themselves. It reads the
//               CORS-open hosts below directly from the browser and has no connection to any daemon.
//   cockpit     the build the local daemon serves from 127.0.0.1. `connect-src 'self'`: every upstream read
//               goes through the daemon's allowlisted read proxy, so a compromised page cannot exfiltrate.
//
// Generated from this file (and drift-tested by scripts/check-csp.mjs): vercel.json and
// scripts/examples/*. The daemon's static server imports this module directly. The Vite config reads it
// for the build output directories.
//
// This module is loaded by Node's built-in type stripping (scripts) and by Vite (config), and imported by
// the daemon, so it uses erasable TypeScript only, imports nothing and touches no global.

export type BuildTarget = "standalone" | "cockpit";
export const BUILD_TARGETS: readonly BuildTarget[] = /*#__PURE__*/ Object.freeze(["standalone", "cockpit"] as const);

// Where each build is written, relative to app/. The daemon serves OUT_DIRS.cockpit.
export const OUT_DIRS: Readonly<Record<BuildTarget, string>> = /*#__PURE__*/ Object.freeze({
  standalone: "dist/standalone",
  cockpit: "dist/cockpit",
});

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

// Hosts that must appear nowhere in the app source or bundle, with the reason. The check fails on any hit.
export const NEVER_IN_APP_HOSTS: Readonly<Record<string, string>> = /*#__PURE__*/ Object.freeze({
  "api.paybox.sh": "a browser page is never a PayBox client (its CORS answers only https://app.paybox.sh)",
  "app.paybox.sh": "no PayBox web surface is used or embedded",
  "api.trueo.com": "Trueo's terms bar automation of its API; read Base on-chain instead",
});

export type CspDirectives = Readonly<Record<string, readonly string[]>>;

const COMMON_DIRECTIVES: CspDirectives = /*#__PURE__*/ Object.freeze({
  "default-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "require-trusted-types-for": ["'script'"],
  "trusted-types": ["'none'"],
});

// `upgrade-insecure-requests` is deliberately absent: both builds can be served over plain http from
// 127.0.0.1, and every connect-src entry is https by construction (check-csp.mjs enforces that).
export function cspDirectives(target: BuildTarget): CspDirectives {
  const connect =
    target === "cockpit" ? ["'self'"] : ["'self'", ...BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin)];
  return Object.freeze({ ...COMMON_DIRECTIVES, "connect-src": Object.freeze(connect) });
}

const DIRECTIVE_ORDER: readonly string[] = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "base-uri",
  "form-action",
  "object-src",
  "frame-ancestors",
  "require-trusted-types-for",
  "trusted-types",
];

export function cspHeaderValue(target: BuildTarget): string {
  const directives = cspDirectives(target);
  return DIRECTIVE_ORDER.map((name) => `${name} ${(directives[name] ?? []).join(" ")}`).join("; ");
}

// camera, microphone, geolocation, payment and USB denied (dapp-design 8.2); the page needs none.
export const PERMISSIONS_POLICY =
  "accelerometer=(), autoplay=(), bluetooth=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), payment=(), serial=(), usb=()";

export interface HeaderPair {
  readonly key: string;
  readonly value: string;
}

export function securityHeaders(target: BuildTarget): readonly HeaderPair[] {
  return Object.freeze([
    { key: "Content-Security-Policy", value: cspHeaderValue(target) },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ]);
}

// ---- generated example files for people who serve the standalone build themselves -----------------

// The generated files carry no timestamp, so regenerating is byte-stable and a diff means a change.
export const GENERATED_FILES: readonly string[] = /*#__PURE__*/ Object.freeze([
  "vercel.json",
  "scripts/examples/headers.json",
  "scripts/examples/_headers",
  "scripts/examples/nginx.conf.example",
  "scripts/examples/Caddyfile.example",
]);

function headerMap(target: BuildTarget): Record<string, string> {
  return Object.fromEntries(securityHeaders(target).map((pair) => [pair.key, pair.value]));
}

export function renderGeneratedFiles(): Readonly<Record<string, string>> {
  const standalone = securityHeaders("standalone");
  const vercel = {
    // Example for a user who deploys the standalone explorer to their own Vercel account. The author deploys nothing.
    buildCommand: "pnpm run build:standalone",
    installCommand: "pnpm install --frozen-lockfile",
    outputDirectory: OUT_DIRS.standalone,
    headers: [{ source: "/(.*)", headers: standalone.map((pair) => ({ key: pair.key, value: pair.value })) }],
  };
  const snapshot = { standalone: headerMap("standalone"), cockpit: headerMap("cockpit") };
  const netlify = ["# Generated by scripts/check-csp.mjs --write from headers.config.ts. Do not edit.", "/*", ...standalone.map((pair) => `  ${pair.key}: ${pair.value}`), ""].join("\n");
  const nginx = [
    "# Generated by scripts/check-csp.mjs --write from headers.config.ts. Do not edit.",
    "# Put these inside the server block that serves dist/standalone.",
    ...standalone.map((pair) => `add_header ${pair.key} "${pair.value}" always;`),
    "",
  ].join("\n");
  const caddy = [
    "# Generated by scripts/check-csp.mjs --write from headers.config.ts. Do not edit.",
    "# Put this inside the site block that serves dist/standalone.",
    "header {",
    ...standalone.map((pair) => `  ${pair.key} "${pair.value}"`),
    "}",
    "",
  ].join("\n");
  return Object.freeze({
    "vercel.json": `${JSON.stringify(vercel, null, 2)}\n`,
    "scripts/examples/headers.json": `${JSON.stringify(snapshot, null, 2)}\n`,
    "scripts/examples/_headers": netlify,
    "scripts/examples/nginx.conf.example": nginx,
    "scripts/examples/Caddyfile.example": caddy,
  });
}
