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
// the daemon, so it uses erasable TypeScript only, imports only the SDK's host registry (with its .ts
// extension, which Node's type stripping needs) and touches no global.

export type BuildTarget = "standalone" | "cockpit";
export const BUILD_TARGETS: readonly BuildTarget[] = /*#__PURE__*/ Object.freeze(["standalone", "cockpit"] as const);

// Where each build is written, relative to app/. The daemon serves OUT_DIRS.cockpit.
export const OUT_DIRS: Readonly<Record<BuildTarget, string>> = /*#__PURE__*/ Object.freeze({
  standalone: "dist/standalone",
  cockpit: "dist/cockpit",
});

// The venue host registry (services, browser-direct and daemon-only origins) lives in the SDK with the readers
// that name those hosts (sdk/venues/origins.ts). It is re-exported here, where the CSP is built from it.
import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../sdk/venues/origins.ts";

export { READ_SERVICES, BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, type DaemonOnlyEntry, type OriginEntry, type ReadService } from "../sdk/venues/origins.ts";

// Hosts that must appear nowhere in the app source or bundle, with the reason. The check fails on any hit.
export const NEVER_IN_APP_HOSTS: Readonly<Record<string, string>> = /*#__PURE__*/ Object.freeze({
  "api.paybox.sh": "a browser page is never a PayBox client (its CORS answers only https://app.paybox.sh)",
  "api.trueo.com": "Trueo's terms bar automation of its API; read Base on-chain instead",
});

// Hosts the page names only as the target of a link the visitor follows themselves (an <a href> into a new tab). The
// page never requests them, so they may never be in a CSP; check-csp and check-origins hold both rules.
export const LINK_ONLY_HOSTS: Readonly<Record<string, string>> = /*#__PURE__*/ Object.freeze({
  "app.paybox.sh": "the WalletConnect tab's 'Open in PayBox' link (PayBox's own /wc page, which takes the pairing link); nothing is embedded or fetched",
});

// The wallet relay (docs/dapp-paybox-web.md route F). WalletConnect v2 carries the encrypted session messages between
// this page and the visitor's wallet over one WebSocket to Reown's relay. It is the only non-https origin a CSP may
// list, and only the standalone build lists it: the Cockpit build keeps connect-src 'self', so WalletConnect is off
// there. The sign-client's other hosts are turned off or are never reached by a dApp (core/walletconnect.ts).
export interface WalletRelayOrigin {
  readonly origin: string;
  readonly note: string;
}

export const WALLET_RELAY_ORIGINS: readonly WalletRelayOrigin[] = /*#__PURE__*/ Object.freeze([
  { origin: "wss://relay.walletconnect.org", note: "WalletConnect v2 relay (Reown): end-to-end encrypted session messages to and from the visitor's wallet; @walletconnect/core's default relay" },
]);

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
// 127.0.0.1, and every connect-src entry is https by construction apart from the wallet relay's wss origin
// (check-csp.mjs enforces both).
export function cspDirectives(target: BuildTarget): CspDirectives {
  const connect =
    target === "cockpit"
      ? ["'self'"]
      : ["'self'", ...BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin), ...WALLET_RELAY_ORIGINS.map((entry) => entry.origin)];
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
