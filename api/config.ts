import { getAddress, isAddress } from "viem";

import { checkRpcUrl } from "../sdk/chain/rpc.js";
import { BASE_RPC_URL } from "../sdk/chain/limitless/constants.js";
import { POLYGON_RPC_URL } from "../sdk/chain/polymarket/constants.js";
import { XO_RPC_URL } from "../sdk/chain/xo/pins.js";

// The markets API's configuration from the environment (docs/sdk-and-api-design.md section 4, step 8 of section 9).
//
// Rules, as relay/config.ts keeps them:
//   - nothing here reads a file, and no issue ever prints a value: issues name the variable, because an RPC URL can
//     carry a provider key in its path;
//   - the free tier needs no secret: every variable has a working default except the data directory, which must be named
//     (so the index never lands in a default place inside a repository by accident);
//   - limits are compiled in and stated (README, GET /v1/health); the environment cannot raise them;
//   - which venues are read is code (api/markets.ts, every SDK reader that needs no key), never configuration;
//   - metering (step 9) has NO defaults for money: the payTo address and every price must be named, or the paid endpoints
//     answer "payments_not_configured"; route prepare is off unless the operator turns it on (API_ROUTE_PREPARE).

export const API_VERSION = "0.1.0";
export const DEFAULT_API_PORT = 8790;
export const DEFAULT_API_HOST = "127.0.0.1";

export const CHAIN_KEYS = ["polygon", "base", "xo"] as const;
export type ChainKey = (typeof CHAIN_KEYS)[number];

export const API_ENV = Object.freeze({
  host: "API_HOST",
  port: "API_PORT",
  dataDir: "API_DATA_DIR",
  corsOrigins: "API_CORS_ORIGINS",
  trustProxyHops: "API_TRUST_PROXY_HOPS",
  indexer: "API_INDEXER",
  chains: "API_CHAINS",
  fillRetentionDays: "API_FILL_RETENTION_DAYS",
  linksBundle: "API_LINKS_BUNDLE",
  linksPin: "API_LINKS_PIN",
  candidatesBundle: "API_CANDIDATES_BUNDLE",
  candidatesPin: "API_CANDIDATES_PIN",
  routePrepare: "API_ROUTE_PREPARE",
  publicUrl: "API_PUBLIC_URL",
  facilitatorUrl: "API_X402_FACILITATOR_URL",
  payTo: "API_X402_PAY_TO",
  network: "API_X402_NETWORK",
  priceQuote: "API_X402_PRICE_QUOTE",
  priceRoutePrepare: "API_X402_PRICE_ROUTE_PREPARE",
});

// POST /v1/route/prepare (docs/sdk-and-api-design.md section 4): "off" answers the fixed code route_prepare_not_enabled;
// "free" serves it at no charge (free-tier limits per client, or a key's); "paid" serves it to a subscription key whose tier
// includes it or for an x402 payment. Off by default: the operator's switch.
export const ROUTE_PREPARE_MODES = ["off", "free", "paid"] as const;
export type RoutePrepareMode = (typeof ROUTE_PREPARE_MODES)[number];

// The one x402 network the API takes payment on: Base mainnet (CAIP-2), where the USDC contract is pinned (api/x402.ts).
export const X402_NETWORKS = ["eip155:8453"] as const;
export type X402Network = (typeof X402_NETWORKS)[number];

// A price is USDC with at most 6 decimal places, more than zero and at most this many atomic units (10 USDC).
export const MAX_PRICE_ATOMIC = 10_000_000n;

export interface PaymentsConfig {
  // The public https origin clients reach this API at (the x402 resource URL is built from it).
  readonly publicUrl: string;
  // The facilitator's base URL; /verify and /settle are appended. Never printed.
  readonly facilitatorUrl: string;
  readonly payTo: `0x${string}`;
  readonly network: X402Network;
  // Atomic USDC units (6 decimals) per call; null: that endpoint has no price and is not sold.
  readonly prices: { readonly quote: bigint | null; readonly routePrepare: bigint | null };
}

// Per chain: API_RPC_<CHAIN> (comma-separated https URLs, tried in order), API_START_BLOCK_<CHAIN>, API_CONFIRMATIONS_<CHAIN>.
export function chainVariable(kind: "RPC" | "START_BLOCK" | "CONFIRMATIONS", chain: ChainKey): string {
  return `API_${kind}_${chain.toUpperCase()}`;
}

// The public RPCs the SDK already names for each chain (sdk/venues/origins.ts): keyless, so the free tier runs with none.
export const DEFAULT_RPC: Readonly<Record<ChainKey, readonly string[]>> = Object.freeze({
  polygon: [POLYGON_RPC_URL],
  base: [BASE_RPC_URL],
  xo: [XO_RPC_URL],
});

// Blocks behind the head before a block is indexed (reorg safety). The defaults are the depth the SDK's chain recordings
// settle at; the environment may raise them, or lower them to the floor.
export const DEFAULT_CONFIRMATIONS: Readonly<Record<ChainKey, number>> = Object.freeze({ polygon: 64, base: 64, xo: 64 });
export const MIN_CONFIRMATIONS = 12;
export const MAX_CONFIRMATIONS = 5_000;
export const MAX_RPC_URLS = 4;

export interface RateLimitSpec {
  // Burst size.
  readonly capacity: number;
  readonly refillPerSecond: number;
}

export interface ApiHttpLimits {
  readonly maxUrlChars: number;
  readonly maxHeaderBytes: number;
  // Every free route is a GET: a request that declares or sends a body is refused. POST /v1/route/prepare alone takes a
  // JSON body of at most this many bytes.
  readonly maxBodyBytes: number;
  readonly headersTimeoutMs: number;
  readonly requestTimeoutMs: number;
  // An upstream read started for a request is abandoned at this point; the answer then comes from the cache, stated.
  readonly upstreamBudgetMs: number;
  readonly shutdownGraceMs: number;
  // Per client address. `markets` covers both market routes; `reads` every other free route; `paid` the quote and route
  // prepare routes for a caller without a key (a 402 answer counts too). A subscription key brings its own limit.
  readonly markets: RateLimitSpec;
  readonly reads: RateLimitSpec;
  readonly paid: RateLimitSpec;
  // How long the facilitator's /verify and /settle may take.
  readonly facilitatorTimeoutMs: number;
}

export const API_LIMITS: ApiHttpLimits = Object.freeze({
  maxUrlChars: 1_024,
  // An x402 PAYMENT-SIGNATURE header from a smart account can be several kilobytes.
  maxHeaderBytes: 16 * 1024,
  maxBodyBytes: 16_384,
  headersTimeoutMs: 5_000,
  requestTimeoutMs: 20_000,
  upstreamBudgetMs: 8_000,
  shutdownGraceMs: 5_000,
  markets: Object.freeze({ capacity: 20, refillPerSecond: 0.5 }),
  reads: Object.freeze({ capacity: 60, refillPerSecond: 1 }),
  paid: Object.freeze({ capacity: 30, refillPerSecond: 0.5 }),
  facilitatorTimeoutMs: 10_000,
});

export interface ChainConfig {
  readonly chain: ChainKey;
  // Never printed: a provider key can sit in the path.
  readonly rpcUrls: readonly string[];
  readonly startBlock: bigint | null;
  readonly confirmations: number;
}

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  readonly dataDir: string | undefined;
  readonly corsOrigins: readonly string[];
  readonly trustProxyHops: number;
  readonly indexer: boolean;
  readonly chains: readonly ChainConfig[];
  readonly fillRetentionDays: number;
  readonly links: { readonly bundle: string; readonly pin: string } | null;
  readonly candidates: { readonly bundle: string; readonly pin: string } | null;
  readonly routePrepare: RoutePrepareMode;
  // Null when no payment variable is set: the paid endpoints then answer payments_not_configured (a key still works).
  readonly payments: PaymentsConfig | null;
  readonly limits: ApiHttpLimits;
}

export interface ApiConfigIssue {
  readonly variable: string;
  // Never contains the raw value.
  readonly message: string;
  readonly fatal: boolean;
}

export interface LoadedApiConfig {
  readonly config: ApiConfig;
  readonly issues: readonly ApiConfigIssue[];
  readonly fatal: readonly ApiConfigIssue[];
}

export type ApiEnv = Readonly<Record<string, string | undefined>>;

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function read(env: ApiEnv, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function wholeNumber(raw: string, min: number, max: number): number | null {
  if (!/^(0|[1-9][0-9]{0,8})$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

// An exact browser origin: https on a named host (or http on localhost / 127.0.0.1 for a local dApp), no path.
export function parseOrigin(raw: string): string | null {
  if (raw.length > 200 || CONTROL.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !local) return null;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || (url.pathname !== "/" && url.pathname !== "")) return null;
  if (!local && (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(url.hostname) || IPV4.test(url.hostname))) return null;
  return url.origin;
}

function filePath(env: ApiEnv, name: string, issues: ApiConfigIssue[]): string | undefined {
  const raw = read(env, name);
  if (raw === undefined) return undefined;
  if (raw.length > 1024 || CONTROL.test(raw)) {
    issues.push({ variable: name, message: `${name} is not a usable path; ignoring it.`, fatal: false });
    return undefined;
  }
  return raw;
}

// An https URL with no credentials, query or fragment (http only on loopback, for a facilitator run beside the API in a test).
export function parseServiceUrl(raw: string, allowPath: boolean): string | null {
  if (raw.length > 300 || CONTROL.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const loopback = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !loopback) return null;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  if (!allowPath && url.pathname !== "/") return null;
  const text = url.toString();
  return text.endsWith("/") ? text.slice(0, -1) : text;
}

// "0.01" USDC to atomic units (6 decimals); null for anything that is not a plain positive decimal within the cap.
export function parsePrice(raw: string): bigint | null {
  const match = /^(0|[1-9][0-9]{0,5})(?:\.([0-9]{1,6}))?$/.exec(raw);
  if (match === null) return null;
  const atomic = BigInt(match[1] as string) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return atomic > 0n && atomic <= MAX_PRICE_ATOMIC ? atomic : null;
}

const PAYMENT_VARIABLES = [API_ENV.publicUrl, API_ENV.facilitatorUrl, API_ENV.payTo, API_ENV.network, API_ENV.priceQuote, API_ENV.priceRoutePrepare] as const;

function loadPayments(env: ApiEnv, fatal: (variable: string, message: string) => void): PaymentsConfig | null {
  if (PAYMENT_VARIABLES.every((name) => read(env, name) === undefined)) return null;
  let ok = true;
  const need = (name: string, message: string): string | undefined => {
    const value = read(env, name);
    if (value === undefined) {
      fatal(name, `${name} is required once any payment variable is set: ${message}`);
      ok = false;
    }
    return value;
  };
  const rawPublic = need(API_ENV.publicUrl, "the public https origin of this API");
  const rawFacilitator = need(API_ENV.facilitatorUrl, "the x402 facilitator's base URL");
  const rawPayTo = need(API_ENV.payTo, "the address that receives payments; there is no default");
  const rawNetwork = need(API_ENV.network, `one of ${X402_NETWORKS.join(", ")}`);
  const publicUrl = rawPublic === undefined ? null : parseServiceUrl(rawPublic, false);
  if (rawPublic !== undefined && (publicUrl === null || !publicUrl.startsWith("https://"))) {
    fatal(API_ENV.publicUrl, "API_PUBLIC_URL must be an https origin with no path, query or credentials.");
    ok = false;
  }
  const facilitatorUrl = rawFacilitator === undefined ? null : parseServiceUrl(rawFacilitator, true);
  if (rawFacilitator !== undefined && facilitatorUrl === null) {
    fatal(API_ENV.facilitatorUrl, "API_X402_FACILITATOR_URL must be an https URL with no query or credentials (http only on 127.0.0.1 or localhost).");
    ok = false;
  }
  let payTo: `0x${string}` | null = null;
  if (rawPayTo !== undefined) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(rawPayTo) || /^0x0{40}$/.test(rawPayTo)) {
      fatal(API_ENV.payTo, "API_X402_PAY_TO must be a non-zero 20-byte hex address.");
      ok = false;
    } else if (!isAddress(rawPayTo, { strict: true })) {
      // All lower case passes; mixed case must carry a valid EIP-55 checksum (a typo is refused, never repaired).
      fatal(API_ENV.payTo, "API_X402_PAY_TO has a wrong EIP-55 checksum.");
      ok = false;
    } else payTo = getAddress(rawPayTo);
  }
  let network: X402Network | null = null;
  if (rawNetwork !== undefined) {
    if ((X402_NETWORKS as readonly string[]).includes(rawNetwork)) network = rawNetwork as X402Network;
    else {
      fatal(API_ENV.network, `API_X402_NETWORK must be ${X402_NETWORKS.join(" or ")} (Base mainnet, where the USDC contract is pinned).`);
      ok = false;
    }
  }
  const price = (name: string): bigint | null => {
    const raw = read(env, name);
    if (raw === undefined) return null;
    const value = parsePrice(raw);
    if (value === null) {
      fatal(name, `${name} must be a USDC amount above 0 and at most 10, with at most 6 decimal places (for example 0.01).`);
      ok = false;
    }
    return value;
  };
  const prices = { quote: price(API_ENV.priceQuote), routePrepare: price(API_ENV.priceRoutePrepare) };
  if (!ok || publicUrl === null || facilitatorUrl === null || payTo === null || network === null) return null;
  return Object.freeze({ publicUrl, facilitatorUrl, payTo, network, prices: Object.freeze(prices) });
}

export function loadApiConfig(env: ApiEnv): LoadedApiConfig {
  const issues: ApiConfigIssue[] = [];
  const fatal = (variable: string, message: string): void => {
    issues.push({ variable, message, fatal: true });
  };

  let host = DEFAULT_API_HOST;
  const rawHost = read(env, API_ENV.host);
  if (rawHost !== undefined) {
    if (IPV4.test(rawHost) || rawHost === "::" || rawHost === "::1") host = rawHost;
    else fatal(API_ENV.host, "API_HOST must be an IPv4 address (0.0.0.0 for every interface), :: or ::1.");
  }

  let port = DEFAULT_API_PORT;
  const rawPort = read(env, API_ENV.port);
  if (rawPort !== undefined) {
    const value = wholeNumber(rawPort, 0, 65_535);
    if (value === null) fatal(API_ENV.port, "API_PORT must be a whole number from 0 to 65535 (0 picks a free port).");
    else port = value;
  }

  let dataDir: string | undefined;
  const rawDir = read(env, API_ENV.dataDir);
  if (rawDir === undefined) fatal(API_ENV.dataDir, "API_DATA_DIR must name the directory for the chain index; there is no default.");
  else if (rawDir.length > 1024 || CONTROL.test(rawDir)) fatal(API_ENV.dataDir, "API_DATA_DIR is not a usable path.");
  else dataDir = rawDir;

  const corsOrigins: string[] = [];
  const rawCors = read(env, API_ENV.corsOrigins);
  if (rawCors !== undefined) {
    for (const part of rawCors.split(",")) {
      const entry = part.trim();
      if (entry === "") continue;
      const origin = parseOrigin(entry);
      if (origin === null) issues.push({ variable: API_ENV.corsOrigins, message: "API_CORS_ORIGINS holds an entry that is not an exact https origin; ignoring it.", fatal: false });
      else if (!corsOrigins.includes(origin)) corsOrigins.push(origin);
    }
  }

  let trustProxyHops = 0;
  const rawHops = read(env, API_ENV.trustProxyHops);
  if (rawHops !== undefined) {
    const value = wholeNumber(rawHops, 0, 3);
    if (value === null) fatal(API_ENV.trustProxyHops, "API_TRUST_PROXY_HOPS must be 0, 1, 2 or 3 (the proxies in front that append X-Forwarded-For).");
    else trustProxyHops = value;
  }

  let indexer = true;
  const rawIndexer = read(env, API_ENV.indexer);
  if (rawIndexer !== undefined) {
    const word = rawIndexer.toLowerCase();
    if (TRUTHY.has(word)) indexer = true;
    else if (FALSY.has(word)) indexer = false;
    else issues.push({ variable: API_ENV.indexer, message: "API_INDEXER was not a recognised word; using ON.", fatal: false });
  }

  let wanted: ChainKey[] = [...CHAIN_KEYS];
  const rawChains = read(env, API_ENV.chains);
  if (rawChains !== undefined) {
    const parts = rawChains.split(",").map((part) => part.trim().toLowerCase()).filter((part) => part !== "");
    if (parts.length === 0 || parts.some((part) => !(CHAIN_KEYS as readonly string[]).includes(part))) {
      fatal(API_ENV.chains, "API_CHAINS must be a comma-separated subset of polygon, base and xo.");
    } else wanted = CHAIN_KEYS.filter((chain) => parts.includes(chain));
  }

  const chains: ChainConfig[] = [];
  for (const chain of wanted) {
    const rpcVar = chainVariable("RPC", chain);
    let rpcUrls: string[] = [...DEFAULT_RPC[chain]];
    const rawRpc = read(env, rpcVar);
    if (rawRpc !== undefined) {
      const urls: string[] = [];
      let bad = false;
      for (const part of rawRpc.split(",")) {
        const entry = part.trim();
        if (entry === "") continue;
        try {
          const checked = checkRpcUrl(entry);
          // The API never talks plain http to a remote node; loopback is for a node of our own on the same host.
          if (!urls.includes(checked)) urls.push(checked);
        } catch {
          bad = true;
        }
      }
      if (bad || urls.length === 0 || urls.length > MAX_RPC_URLS) fatal(rpcVar, `${rpcVar} must list 1 to ${MAX_RPC_URLS} https RPC URLs (no user name, password, query or fragment).`);
      else rpcUrls = urls;
    }
    const startVar = chainVariable("START_BLOCK", chain);
    let startBlock: bigint | null = null;
    const rawStart = read(env, startVar);
    if (rawStart !== undefined) {
      if (/^(0|[1-9][0-9]{0,11})$/.test(rawStart)) startBlock = BigInt(rawStart);
      else fatal(startVar, `${startVar} must be a block number.`);
    }
    const confVar = chainVariable("CONFIRMATIONS", chain);
    let confirmations = DEFAULT_CONFIRMATIONS[chain];
    const rawConf = read(env, confVar);
    if (rawConf !== undefined) {
      const value = wholeNumber(rawConf, MIN_CONFIRMATIONS, MAX_CONFIRMATIONS);
      if (value === null) issues.push({ variable: confVar, message: `${confVar} must be a whole number from ${MIN_CONFIRMATIONS} to ${MAX_CONFIRMATIONS}; using ${confirmations}.`, fatal: false });
      else confirmations = value;
    }
    chains.push(Object.freeze({ chain, rpcUrls: Object.freeze(rpcUrls), startBlock, confirmations }));
  }

  let fillRetentionDays = 7;
  const rawRetention = read(env, API_ENV.fillRetentionDays);
  if (rawRetention !== undefined) {
    const value = wholeNumber(rawRetention, 1, 90);
    if (value === null) issues.push({ variable: API_ENV.fillRetentionDays, message: "API_FILL_RETENTION_DAYS must be a whole number from 1 to 90; using 7.", fatal: false });
    else fillRetentionDays = value;
  }

  const pair = (bundleVar: string, pinVar: string): { bundle: string; pin: string } | null => {
    const bundle = filePath(env, bundleVar, issues);
    const pin = filePath(env, pinVar, issues);
    if (bundle === undefined && pin === undefined) return null;
    if (bundle === undefined || pin === undefined) {
      issues.push({ variable: bundle === undefined ? bundleVar : pinVar, message: `${bundleVar} and ${pinVar} are set together or not at all; ignoring both.`, fatal: false });
      return null;
    }
    return Object.freeze({ bundle, pin });
  };

  let routePrepare: RoutePrepareMode = "off";
  const rawRoute = read(env, API_ENV.routePrepare);
  if (rawRoute !== undefined) {
    if ((ROUTE_PREPARE_MODES as readonly string[]).includes(rawRoute)) routePrepare = rawRoute as RoutePrepareMode;
    else fatal(API_ENV.routePrepare, "API_ROUTE_PREPARE must be off, free or paid.");
  }
  const payments = loadPayments(env, fatal);

  const config: ApiConfig = Object.freeze({
    host,
    port,
    dataDir,
    corsOrigins: Object.freeze(corsOrigins),
    trustProxyHops,
    indexer,
    chains: Object.freeze(chains),
    fillRetentionDays,
    links: pair(API_ENV.linksBundle, API_ENV.linksPin),
    candidates: pair(API_ENV.candidatesBundle, API_ENV.candidatesPin),
    routePrepare,
    payments,
    limits: API_LIMITS,
  });
  return { config, issues, fatal: issues.filter((issue) => issue.fatal) };
}

export class ApiConfigError extends Error {
  readonly issues: readonly ApiConfigIssue[];
  constructor(issues: readonly ApiConfigIssue[]) {
    super(`The API cannot start: ${issues.map((issue) => `${issue.variable}: ${issue.message}`).join(" ")}`);
    this.name = "ApiConfigError";
    this.issues = issues;
  }
}

export function assertStartable(loaded: LoadedApiConfig): ApiConfig {
  if (loaded.fatal.length > 0) throw new ApiConfigError(loaded.fatal);
  return loaded.config;
}

// A one-screen summary for the start-up banner. Words and counts only: no URL, no path.
export function describeConfig(config: ApiConfig): string[] {
  return [
    `bind: ${config.host}:${config.port}`,
    `cors origins: ${config.corsOrigins.length === 0 ? "none (browsers cannot read answers)" : String(config.corsOrigins.length)}`,
    `trusted proxy hops: ${config.trustProxyHops}`,
    `indexer: ${config.indexer ? "on" : "off"}`,
    ...config.chains.map((chain) => `chain ${chain.chain}: ${chain.rpcUrls.length} rpc url(s), ${chain.confirmations} confirmations, start ${chain.startBlock === null ? "at the safe head on first run" : "at a configured block"}`),
    `fill retention: ${config.fillRetentionDays} days`,
    `approved links: ${config.links === null ? "none configured" : "bundle configured"}; candidates: ${config.candidates === null ? "none configured" : "bundle configured"}`,
    `limits: markets ${config.limits.markets.capacity} burst, ${config.limits.markets.refillPerSecond * 60}/min; other reads ${config.limits.reads.capacity} burst, ${config.limits.reads.refillPerSecond * 60}/min per client`,
    `route prepare: ${config.routePrepare}`,
    `payments: ${
      config.payments === null
        ? "not configured (paid endpoints answer payments_not_configured unless a key is sent)"
        : `x402 on ${config.payments.network}; quote ${config.payments.prices.quote === null ? "not sold" : "priced"}, route prepare ${config.payments.prices.routePrepare === null ? "not sold" : "priced"}`
    }`,
  ];
}
