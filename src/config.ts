import { parseDecimalAtomic } from "./guardrails/amount.js";
import { USDC_E_DECIMALS } from "./guardrails/constants.js";

// Guardrail configuration from plain environment variables.
//
// Honest scope (gate-results risk B2): these values are read by the plugin process, so they bind
// what the plugin prepares and submits. They do not bind an agent that holds an autonomous PayBox
// grant and can call request_wallet_sign directly. Treat them as advisory against that agent; the
// real boundary is the wallet grant's approval mode plus any author-operated relay.
//
// loadConfig never throws. A missing, malformed or absurd value falls back to the compiled-in
// default and is reported in `issues`. A value above the compiled-in ceiling is clamped to it,
// so a tampered variable cannot raise a cap past the ceiling.
//
// There is deliberately no cap on how many markets are created per day (user decision,
// 2026-10-19). The brakes on creation are the $50 daily USD cap (the fee and the seed count),
// per-attempt approval and the creation switch, which is off by default.
//
// XO_RELAY_URL and XO_RELAY_KEY say where the author-operated relay is and how to talk to it.
// The key is a secret: it is held in a Secret wrapper that prints as "[redacted]" and is read only
// with reveal(), it is never echoed into an issue message, and nothing in this module logs it.

export const ENV = Object.freeze({
  maxOrderUsd: "XO_MAX_ORDER_USD",
  maxDailyUsd: "XO_MAX_DAILY_USD",
  priceBandTicks: "XO_PRICE_BAND_TICKS",
  quoteTtlSeconds: "XO_QUOTE_TTL_SECONDS",
  orderExpirySeconds: "XO_ORDER_EXPIRY_SECONDS",
  killSwitch: "XO_KILL_SWITCH",
  enableCreate: "XO_ENABLE_CREATE",
  relayUrl: "XO_RELAY_URL",
  relayKey: "XO_RELAY_KEY",
} as const);

// A value that must not leak: String(), template literals, JSON.stringify and util.inspect all
// print "[redacted]". The only way to read it is reveal(), which only the relay client calls.
const REDACTED = "[redacted]";
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}

export interface GuardrailConfig {
  // USDC.e atomic units (6 decimals).
  readonly maxOrderAtomic: bigint;
  readonly maxDailyAtomic: bigint;
  // Allowed distance of a limit price from the reference price, in 0.001 ticks.
  readonly priceBandTicks: number;
  readonly quoteTtlSeconds: number;
  // Signed orders are bearer instruments, so every order gets a short non-zero expiration.
  readonly orderExpirySeconds: number;
  // Any truthy XO_KILL_SWITCH disables every write-adjacent tool. Reads stay allowed.
  readonly killSwitch: boolean;
  // Creation is off until the author turns it on: XO's ToS allows one market per calendar week
  // for a badge holder (gate-results section 3.3, decision 5). There is no per-day creation cap.
  readonly createEnabled: boolean;
  // The relay, when one is configured. Absent means "no relay": every write tool then says so.
  // https, or http only to 127.0.0.1 or localhost. No credentials, query or fragment in the URL.
  readonly relayUrl?: string;
  // Secret. Absent when unset or malformed. Never printed; see Secret.
  readonly relayKey?: Secret;
}

// Author decisions (docs/plan.md): $10 per order, $50 per day. No creation cadence cap.
export const DEFAULTS: GuardrailConfig = Object.freeze({
  maxOrderAtomic: 10_000_000n,
  maxDailyAtomic: 50_000_000n,
  priceBandTicks: 50,
  quoteTtlSeconds: 120,
  orderExpirySeconds: 600,
  killSwitch: false,
  createEnabled: false,
});

// Absolute ceilings, compiled in. No environment value can exceed them.
//  - Order $100: ten times the default. Even a fully tampered variable can lose at most $100 in one
//    order, and XO's median deposit was about $16 [03], so no legitimate agent needs more.
//  - Day $500: five orders at the ceiling. About 30 times the median deposit; a deliberately large
//    but bounded exposure for one account.
//  - Price band 200 ticks (20 cents), quote TTL 10 minutes, order expiry 1 hour: bearer orders
//    must not stay live for long.
export const CEILINGS = Object.freeze({
  maxOrderAtomic: 100_000_000n,
  maxDailyAtomic: 500_000_000n,
  priceBandTicks: 200,
  quoteTtlSeconds: 600,
  orderExpirySeconds: 3600,
});

// Values below these are treated as invalid rather than clamped up, for the time-like settings:
// a 1 second quote or a 0 second order expiry is unusable, not a tighter policy.
export const FLOORS = Object.freeze({
  priceBandTicks: 1,
  quoteTtlSeconds: 10,
  orderExpirySeconds: 60,
});

export interface ConfigIssue {
  readonly variable: string;
  readonly kind: "invalid" | "clamped_to_ceiling" | "clamped_to_daily_cap" | "unrecognised_flag";
  // Never contains the raw value: a mis-set variable could hold something secret.
  readonly message: string;
}

export interface LoadedConfig {
  readonly config: GuardrailConfig;
  readonly issues: readonly ConfigIssue[];
}

export type EnvLike = Readonly<Record<string, string | undefined>>;

const MAX_RAW_CHARS = 64;
const FALSY = new Set(["0", "false", "no", "off"]);
const TRUTHY = new Set(["1", "true", "yes", "on"]);

function read(env: EnvLike, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function usd(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const cents = (atomic % 1_000_000n) / 10_000n;
  return cents === 0n ? `${whole}` : `${whole}.${cents.toString().padStart(2, "0")}`;
}

function usdVar(
  env: EnvLike,
  name: string,
  fallback: bigint,
  ceiling: bigint,
  issues: ConfigIssue[],
): bigint {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const parsed = parseDecimalAtomic(raw, USDC_E_DECIMALS);
  if (!parsed.ok) {
    issues.push({
      variable: name,
      kind: "invalid",
      message: `${name} must be a plain decimal USD amount such as 10 or 12.5; using the default ${usd(fallback)}.`,
    });
    return fallback;
  }
  if (parsed.value > ceiling) {
    issues.push({
      variable: name,
      kind: "clamped_to_ceiling",
      message: `${name} is above the compiled-in ceiling; using ${usd(ceiling)}.`,
    });
    return ceiling;
  }
  return parsed.value;
}

function intVar(
  env: EnvLike,
  name: string,
  fallback: number,
  floor: number,
  ceiling: number,
  issues: ConfigIssue[],
): number {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const valid = raw.length <= MAX_RAW_CHARS && /^(0|[1-9][0-9]{0,8})$/.test(raw);
  const value = valid ? Number(raw) : Number.NaN;
  if (!valid || value < floor) {
    issues.push({
      variable: name,
      kind: "invalid",
      message: `${name} must be a whole number from ${floor} to ${ceiling}; using the default ${fallback}.`,
    });
    return fallback;
  }
  if (value > ceiling) {
    issues.push({
      variable: name,
      kind: "clamped_to_ceiling",
      message: `${name} is above the compiled-in ceiling; using ${ceiling}.`,
    });
    return ceiling;
  }
  return value;
}

// Kill switch fails closed: only an explicit falsy word turns it off; any other text turns it on.
function killSwitchVar(env: EnvLike, issues: ConfigIssue[]): boolean {
  const raw = read(env, ENV.killSwitch);
  if (raw === undefined) return false;
  const word = raw.toLowerCase();
  if (FALSY.has(word)) return false;
  if (!TRUTHY.has(word)) {
    issues.push({
      variable: ENV.killSwitch,
      kind: "unrecognised_flag",
      message: `${ENV.killSwitch} was not a recognised word; treating it as ON (writes disabled).`,
    });
  }
  return true;
}

// Creation fails closed too: only an explicit truthy word turns it on.
function enableCreateVar(env: EnvLike, issues: ConfigIssue[]): boolean {
  const raw = read(env, ENV.enableCreate);
  if (raw === undefined) return false;
  const word = raw.toLowerCase();
  if (TRUTHY.has(word)) return true;
  if (!FALSY.has(word)) {
    issues.push({
      variable: ENV.enableCreate,
      kind: "unrecognised_flag",
      message: `${ENV.enableCreate} was not a recognised word; treating it as OFF (creation disabled).`,
    });
  }
  return false;
}

const MAX_URL_CHARS = 2048;
// Whitespace, control characters and backslashes never belong in a configured URL.
const URL_UNSAFE = /[\u0000-\u0020\u007f-\u009f\\]/;
// http is allowed only to this machine: a relay key must not cross a network in clear text.
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

// Returns the normalised base URL (no trailing slash), or undefined plus an issue. The issue text
// never repeats the value: a URL can carry a token.
function relayUrlVar(env: EnvLike, issues: ConfigIssue[]): string | undefined {
  const raw = read(env, ENV.relayUrl);
  if (raw === undefined) return undefined;
  const refuse = (): undefined => {
    issues.push({
      variable: ENV.relayUrl,
      kind: "invalid",
      message: `${ENV.relayUrl} must be an https URL, or an http URL to 127.0.0.1 or localhost, with no user name, password, query or fragment; treating the relay as not configured.`,
    });
    return undefined;
  };
  if (raw.length > MAX_URL_CHARS || URL_UNSAFE.test(raw) || raw.includes("?") || raw.includes("#")) return refuse();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse();
  }
  const host = url.hostname.toLowerCase();
  const secure = url.protocol === "https:";
  const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTS.has(host);
  if ((!secure && !loopbackHttp) || host === "" || url.username !== "" || url.password !== "") return refuse();
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

// A header-safe token of 16 to 256 characters (base64, base64url or hex all fit).
const RELAY_KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{16,256}$/;

function relayKeyVar(env: EnvLike, issues: ConfigIssue[]): Secret | undefined {
  const raw = read(env, ENV.relayKey);
  if (raw === undefined) return undefined;
  if (!RELAY_KEY_PATTERN.test(raw)) {
    issues.push({
      variable: ENV.relayKey,
      kind: "invalid",
      message: `${ENV.relayKey} must be 16 to 256 characters from A-Z a-z 0-9 . _ ~ + / = -; treating the relay key as not set.`,
    });
    return undefined;
  }
  return new Secret(raw);
}

// The relay is usable only with both parts. Anything less means "no relay" (relay_not_configured).
export function relayEndpoint(config: GuardrailConfig): { readonly baseUrl: string; readonly key: Secret } | undefined {
  return typeof config.relayUrl === "string" && config.relayKey instanceof Secret
    ? { baseUrl: config.relayUrl, key: config.relayKey }
    : undefined;
}

export function loadConfig(env: EnvLike = process.env): LoadedConfig {
  try {
    const issues: ConfigIssue[] = [];
    const maxDailyAtomic = usdVar(
      env,
      ENV.maxDailyUsd,
      DEFAULTS.maxDailyAtomic,
      CEILINGS.maxDailyAtomic,
      issues,
    );
    let maxOrderAtomic = usdVar(
      env,
      ENV.maxOrderUsd,
      DEFAULTS.maxOrderAtomic,
      CEILINGS.maxOrderAtomic,
      issues,
    );
    // A single order must never be allowed to exceed the day.
    if (maxOrderAtomic > maxDailyAtomic) {
      issues.push({
        variable: ENV.maxOrderUsd,
        kind: "clamped_to_daily_cap",
        message: `${ENV.maxOrderUsd} is above the daily cap; using ${usd(maxDailyAtomic)}.`,
      });
      maxOrderAtomic = maxDailyAtomic;
    }
    const relayUrl = relayUrlVar(env, issues);
    const relayKey = relayKeyVar(env, issues);
    const config: GuardrailConfig = Object.freeze({
      maxOrderAtomic,
      maxDailyAtomic,
      priceBandTicks: intVar(
        env,
        ENV.priceBandTicks,
        DEFAULTS.priceBandTicks,
        FLOORS.priceBandTicks,
        CEILINGS.priceBandTicks,
        issues,
      ),
      quoteTtlSeconds: intVar(
        env,
        ENV.quoteTtlSeconds,
        DEFAULTS.quoteTtlSeconds,
        FLOORS.quoteTtlSeconds,
        CEILINGS.quoteTtlSeconds,
        issues,
      ),
      orderExpirySeconds: intVar(
        env,
        ENV.orderExpirySeconds,
        DEFAULTS.orderExpirySeconds,
        FLOORS.orderExpirySeconds,
        CEILINGS.orderExpirySeconds,
        issues,
      ),
      killSwitch: killSwitchVar(env, issues),
      createEnabled: enableCreateVar(env, issues),
      ...(relayUrl === undefined ? {} : { relayUrl }),
      ...(relayKey === undefined ? {} : { relayKey }),
    });
    return { config, issues };
  } catch {
    // An unreadable environment is an unknown state, so fail closed: defaults with writes off.
    return {
      config: Object.freeze({ ...DEFAULTS, killSwitch: true }),
      issues: [
        {
          variable: "*",
          kind: "invalid",
          message: "The environment could not be read; using defaults with the kill switch ON.",
        },
      ],
    };
  }
}
