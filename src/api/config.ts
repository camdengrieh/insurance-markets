import { parseDecimalAtomic } from "../guardrails/amount.js";
import type { ConfigIssue, EnvLike } from "../config.js";

// API mode (docs/sdk-and-api-design.md sections 4 and 8): where the hosted markets API is, and the two facts a paid call
// is checked against. Plain environment variables, like src/config.ts, and loaded the same way: never throws, a
// malformed value is reported in `issues` without repeating it, and a malformed value turns the part it belongs to off.
//
//   MARKETS_API_URL              the API's base URL. Unset means API mode is off: the api_* tools are not registered and
//                                nothing in the plugin contacts the API. There is no default, because no API is deployed.
//                                https only, the default port, no user name, password, query or fragment; a path prefix
//                                is kept. In the PayBox portal the same host must be one of the plugin's network hosts.
//   MARKETS_API_PAY_TO           the address the API's own x402 challenges must name as the payee (USDC on Base).
//   MARKETS_API_MAX_PAYMENT_USDC the most one paid call may ask for, in USDC (for example 0.05).
//
// The paid tools need all three: a challenge whose payee or amount cannot be checked against the operator's own values
// is never turned into a payment proposal. None of the three is a secret (the API takes no key from the plugin).

export const API_ENV = Object.freeze({
  url: "MARKETS_API_URL",
  payTo: "MARKETS_API_PAY_TO",
  maxPaymentUsdc: "MARKETS_API_MAX_PAYMENT_USDC",
} as const);

// USDC on Base has 6 decimals.
export const USDC_DECIMALS = 6;

export interface ApiConfig {
  // Normalised base URL (no trailing slash). Absent when unset or refused.
  readonly baseUrl?: string;
  // Lower-case 0x address. Absent when unset or refused.
  readonly payTo?: string;
  // Atomic USDC (6 decimals). Absent when unset or refused.
  readonly maxPaymentAtomic?: bigint;
}

export interface LoadedApiConfig {
  readonly config: ApiConfig;
  readonly issues: readonly ConfigIssue[];
}

const MAX_URL_CHARS = 2048;
// Whitespace, control characters and backslashes never belong in a configured URL.
const URL_UNSAFE = /[\u0000- \u007f-\u009f\\]/;
// Lower-case DNS labels only: no IP literal, no wildcard, no trailing dot.
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PATH_PREFIX = /^(?:\/[A-Za-z0-9._~-]+)*$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

function read(env: EnvLike, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// Whether the operator asked for API mode at all (the variable is set, valid or not). The tools are registered on this,
// so a mistyped URL is reported by the tools instead of silently leaving them out.
export function apiModeRequested(env: EnvLike): boolean {
  return read(env, API_ENV.url) !== undefined;
}

// The normalised base URL, or undefined plus an issue that never repeats the value.
export function apiUrlVar(env: EnvLike, issues: ConfigIssue[]): string | undefined {
  const raw = read(env, API_ENV.url);
  if (raw === undefined) return undefined;
  const refuse = (): undefined => {
    issues.push({
      variable: API_ENV.url,
      kind: "invalid",
      message: `${API_ENV.url} must be an https URL on the default port with a host name, and no user name, password, query or fragment; API mode stays off.`,
    });
    return undefined;
  };
  if (raw.length > MAX_URL_CHARS || URL_UNSAFE.test(raw) || raw.includes("?") || raw.includes("#") || raw.includes("@")) return refuse();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse();
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return refuse();
  if (!HOSTNAME.test(url.hostname) || /^[0-9.]+$/.test(url.hostname) || !PATH_PREFIX.test(path)) return refuse();
  return `${url.origin}${path}`;
}

function payToVar(env: EnvLike, issues: ConfigIssue[]): string | undefined {
  const raw = read(env, API_ENV.payTo);
  if (raw === undefined) return undefined;
  if (!ADDRESS.test(raw) || raw.toLowerCase() === ZERO_ADDRESS) {
    issues.push({ variable: API_ENV.payTo, kind: "invalid", message: `${API_ENV.payTo} must be one 0x address (40 hex digits, not zero); paid calls stay off.` });
    return undefined;
  }
  return raw.toLowerCase();
}

function maxPaymentVar(env: EnvLike, issues: ConfigIssue[]): bigint | undefined {
  const raw = read(env, API_ENV.maxPaymentUsdc);
  if (raw === undefined) return undefined;
  const parsed = parseDecimalAtomic(raw, USDC_DECIMALS);
  if (!parsed.ok || parsed.value === 0n) {
    issues.push({
      variable: API_ENV.maxPaymentUsdc,
      kind: "invalid",
      message: `${API_ENV.maxPaymentUsdc} must be a plain decimal USDC amount above zero with at most 6 places, such as 0.05; paid calls stay off.`,
    });
    return undefined;
  }
  return parsed.value;
}

export function loadApiConfig(env: EnvLike): LoadedApiConfig {
  try {
    const issues: ConfigIssue[] = [];
    const baseUrl = apiUrlVar(env, issues);
    const payTo = payToVar(env, issues);
    const maxPaymentAtomic = maxPaymentVar(env, issues);
    const config: ApiConfig = Object.freeze({
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(payTo === undefined ? {} : { payTo }),
      ...(maxPaymentAtomic === undefined ? {} : { maxPaymentAtomic }),
    });
    return { config, issues };
  } catch {
    // An unreadable environment is an unknown state: API mode off.
    return { config: Object.freeze({}), issues: [{ variable: "*", kind: "invalid", message: "The environment could not be read; API mode stays off." }] };
  }
}
