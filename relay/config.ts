import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { loadConfig, Secret, type GuardrailConfig } from "../src/config.js";
import { parseDecimalAtomic } from "../src/guardrails/amount.js";
import { USDC_E_DECIMALS } from "../src/guardrails/constants.js";
import { RELAY_PENDING_AFTER_MS } from "../src/relay/contract.js";
import { RelayError } from "../src/relay/errors.js";
import { FLAG_NAMES, parseFlags, type FlagEnv, type Flags, type WriteFlagName } from "../src/relay/flags.js";
import { checkMasterSecret, MAX_MASTER_SECRET_CHARS, MIN_MASTER_SECRET_CHARS } from "./crypto.js";
import type { RelayContext, RelayServices } from "./types.js";

// Relay configuration from the environment (docs/phase1-gap-closing.md D6, D8, section 9 A5).
//
// Rules, each with a test:
//   - nothing here reads a file, and nothing prints a value: issues name the variable, never its
//     content, because a mis-set variable could hold a secret;
//   - the relay binds to 127.0.0.1 only (the host is not configurable);
//   - the data directory must be named explicitly, so encrypted secrets can never land in a default
//     place inside a repository by accident;
//   - the master secret comes from an environment variable or an interactive prompt, never a file;
//   - with the credential store on (the default) the relay refuses to start without a master secret;
//   - caps come from src/config.ts ($10 per order and $50 per day, env-configurable, clamped to the
//     compiled-in ceilings); the relay-only caps below can be lowered by the environment but never
//     raised above their compiled-in value;
//   - there is no creation cadence cap (user decision, 2026-10-19).

export const RELAY_BIND_HOST = "127.0.0.1" as const;
export const DEFAULT_RELAY_PORT = 8787;
export const RELAY_VERSION = "0.2.0";

// A creation seed is a $10.00 stake with the 1.08 fee multiplier (amendment A3).
export const CREATION_SEED_CAP_ATOMIC = 10_800_000n;
// Total funded until the exit test passes (D3), then a separate daily funding cap (A10).
export const FUNDING_TEST_CAP_ATOMIC = 10_000_000n;
export const FUNDING_DAILY_CAP_ATOMIC = 50_000_000n;

export const RELAY_ENV = Object.freeze({
  port: "RELAY_PORT",
  dataDir: "RELAY_DATA_DIR",
  masterKey: "RELAY_MASTER_KEY",
  masterKeyPrompt: "RELAY_MASTER_KEY_PROMPT",
  credentialStore: "RELAY_CREDENTIAL_STORE",
  relayKey: "XO_RELAY_KEY",
  relayKeyNext: "XO_RELAY_KEY_NEXT",
  arm: "RELAY_ARM",
  enforceFlagFacts: "RELAY_ENFORCE_FLAG_FACTS",
  ackTripwires: "RELAY_ACK_TRIPWIRES",
  baseRpcUrl: "RELAY_BASE_RPC_URL",
  selfHost: "RELAY_SELF_HOST",
  seedCapUsd: "RELAY_SEED_CAP_USD",
  fundingTestCapUsd: "RELAY_FUNDING_TEST_CAP_USD",
  fundingDailyCapUsd: "RELAY_FUNDING_DAILY_CAP_USD",
  alertHook: "RELAY_ALERT_HOOK",
  alertCommand: "RELAY_ALERT_COMMAND",
  tripwireIntervalS: "RELAY_TRIPWIRE_INTERVAL_S",
});

export interface RateLimitSpec {
  // Burst size.
  readonly capacity: number;
  readonly refillPerSecond: number;
}

export interface RelayHttpConfig {
  readonly bodyLimitBytes: number;
  // The relay answers (with `pending` if it has to) by this time; the work carries on in the background.
  readonly requestBudgetMs: number;
  // The caller's signal aborts at this point at the latest.
  readonly hardDeadlineMs: number;
  readonly headersTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly maxHeaderBytes: number;
  readonly shutdownGraceMs: number;
  readonly readRate: RateLimitSpec;
  readonly writeRate: RateLimitSpec;
  // Failed X-Relay-Key checks per client address.
  readonly authFailureRate: RateLimitSpec;
}

export interface RelayLimits {
  readonly maxOrderAtomic: bigint;
  readonly maxDailyAtomic: bigint;
  readonly seedCapAtomic: bigint;
  readonly fundingTestCapAtomic: bigint;
  readonly fundingDailyCapAtomic: bigint;
}

export interface RelayConfig {
  readonly host: typeof RELAY_BIND_HOST;
  readonly port: number;
  // Undefined means the operator did not name one, which is a startup error.
  readonly dataDir: string | undefined;
  readonly credentialStore: boolean;
  readonly keys: { readonly current: Secret | undefined; readonly next: Secret | undefined };
  // The flags as the environment says them. What is effective also depends on recorded facts.
  readonly flags: Flags;
  readonly armedFlags: readonly WriteFlagName[];
  readonly enforceFlagFacts: boolean;
  readonly acknowledgedTripwires: readonly string[];
  readonly guardrails: GuardrailConfig;
  readonly limits: RelayLimits;
  readonly http: RelayHttpConfig;
  // Secret: a Base RPC URL usually embeds an API key.
  readonly baseRpcUrl: Secret | undefined;
  readonly selfHostUrl: string | undefined;
  readonly alertHookEnabled: boolean;
  readonly alertCommand: string | undefined;
  readonly tripwireIntervalS: number;
}

export interface RelayConfigIssue {
  readonly variable: string;
  // Never contains the raw value.
  readonly message: string;
  // A fatal issue stops the relay from starting.
  readonly fatal: boolean;
}

export interface LoadedRelayConfig {
  readonly config: RelayConfig;
  readonly issues: readonly RelayConfigIssue[];
  readonly fatal: readonly RelayConfigIssue[];
}

export class RelayConfigError extends Error {
  readonly issues: readonly RelayConfigIssue[];

  constructor(issues: readonly RelayConfigIssue[]) {
    super(`The relay cannot start: ${issues.map((issue) => `${issue.variable}: ${issue.message}`).join(" ")}`);
    this.name = "RelayConfigError";
    this.issues = issues;
  }
}

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

function read(env: FlagEnv, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function boolVar(env: FlagEnv, name: string, fallback: boolean, issues: RelayConfigIssue[]): boolean {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const word = raw.toLowerCase();
  if (TRUTHY.has(word)) return true;
  if (FALSY.has(word)) return false;
  issues.push({ variable: name, message: `${name} was not a recognised word; using ${fallback ? "ON" : "OFF"}.`, fatal: false });
  return fallback;
}

// A cap that the environment may lower but never raise above the compiled-in value.
function lowerOnlyUsd(env: FlagEnv, name: string, ceiling: bigint, issues: RelayConfigIssue[]): bigint {
  const raw = read(env, name);
  if (raw === undefined) return ceiling;
  const parsed = parseDecimalAtomic(raw, USDC_E_DECIMALS);
  if (!parsed.ok) {
    issues.push({ variable: name, message: `${name} must be a plain decimal USD amount; using the default.`, fatal: false });
    return ceiling;
  }
  if (parsed.value > ceiling) {
    issues.push({ variable: name, message: `${name} is above the compiled-in ceiling; using the ceiling.`, fatal: false });
    return ceiling;
  }
  return parsed.value;
}

// Same grammar the plugin uses for XO_RELAY_KEY (src/config.ts), so one key works on both sides.
const RELAY_KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{16,256}$/;
// eslint-disable-next-line no-control-regex
const URL_UNSAFE = /[\u0000- \u007f-\u009f\\]/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function parseHttpsHost(raw: string): URL | undefined {
  if (raw.length > 2048 || URL_UNSAFE.test(raw)) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase();
  // A name with a dot; no IP literal, no localhost, no user info.
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || host === "" || !host.includes(".") || IPV4.test(host) || host.startsWith("[") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    return undefined;
  }
  return url;
}

export interface LoadRelayConfigOptions {
  // False for the in-process (embedded) relay, which has no HTTP listener and so no shared key to
  // check. Default true: the HTTP relay answers nobody without one.
  readonly requireRelayKey?: boolean;
}

export function loadRelayConfig(env: FlagEnv, options: LoadRelayConfigOptions = {}): LoadedRelayConfig {
  const requireRelayKey = options.requireRelayKey !== false;
  const issues: RelayConfigIssue[] = [];
  const fatal = (variable: string, message: string): void => {
    issues.push({ variable, message, fatal: true });
  };
  try {
    // Caps and the plugin-side switches. The XO_RELAY_URL issues belong to the plugin, not the relay.
    const loaded = loadConfig(env);
    for (const issue of loaded.issues) {
      if (issue.variable === "XO_RELAY_URL" || issue.variable === "XO_RELAY_KEY") continue;
      issues.push({ variable: issue.variable, message: issue.message, fatal: false });
    }
    const guardrails = loaded.config;

    const parsedFlags = parseFlags(env);
    for (const issue of parsedFlags.issues) issues.push({ variable: issue.variable, message: issue.message, fatal: false });

    // Port.
    let port = DEFAULT_RELAY_PORT;
    const rawPort = read(env, RELAY_ENV.port);
    if (rawPort !== undefined) {
      if (/^(0|[1-9][0-9]{0,4})$/.test(rawPort) && Number(rawPort) <= 65_535) port = Number(rawPort);
      else fatal(RELAY_ENV.port, "RELAY_PORT must be a whole number from 0 to 65535 (0 picks a free port).");
    }

    // Data directory.
    const rawDir = read(env, RELAY_ENV.dataDir);
    let dataDir: string | undefined;
    if (rawDir === undefined) {
      fatal(RELAY_ENV.dataDir, "RELAY_DATA_DIR must name the directory for the relay's state; there is no default.");
      // eslint-disable-next-line no-control-regex
    } else if (rawDir.length > 1024 || /[\u0000-\u001f\u007f]/.test(rawDir)) {
      fatal(RELAY_ENV.dataDir, "RELAY_DATA_DIR is not a usable path.");
    } else {
      dataDir = rawDir;
    }

    // Relay keys. The in-process relay has no listener, so its keys are not read at all.
    let current: Secret | undefined;
    let next: Secret | undefined;
    if (requireRelayKey) {
      const currentRaw = read(env, RELAY_ENV.relayKey);
      const nextRaw = read(env, RELAY_ENV.relayKeyNext);
      if (currentRaw === undefined) fatal(RELAY_ENV.relayKey, "XO_RELAY_KEY is required: the relay answers nobody without a key.");
      else if (!RELAY_KEY_PATTERN.test(currentRaw)) fatal(RELAY_ENV.relayKey, "XO_RELAY_KEY must be 16 to 256 characters from A-Z a-z 0-9 . _ ~ + / = -.");
      else current = new Secret(currentRaw);
      if (nextRaw !== undefined) {
        if (!RELAY_KEY_PATTERN.test(nextRaw)) fatal(RELAY_ENV.relayKeyNext, "XO_RELAY_KEY_NEXT must be 16 to 256 characters from A-Z a-z 0-9 . _ ~ + / = -.");
        else if (nextRaw === currentRaw) fatal(RELAY_ENV.relayKeyNext, "XO_RELAY_KEY_NEXT must differ from XO_RELAY_KEY.");
        else next = new Secret(nextRaw);
      }
    }

    const credentialStore = boolVar(env, RELAY_ENV.credentialStore, true, issues);
    const enforceFlagFacts = boolVar(env, RELAY_ENV.enforceFlagFacts, true, issues);

    // Flags the operator arms for a test run.
    const armed: WriteFlagName[] = [];
    const armRaw = read(env, RELAY_ENV.arm);
    if (armRaw !== undefined) {
      for (const part of armRaw.split(",")) {
        const name = part.trim();
        if (name === "") continue;
        if ((FLAG_NAMES as readonly string[]).includes(name) && name !== "KILL") armed.push(name as WriteFlagName);
        else issues.push({ variable: RELAY_ENV.arm, message: "RELAY_ARM names something that is not a write flag; ignoring it.", fatal: false });
      }
    }

    const acknowledged: string[] = [];
    const ackRaw = read(env, RELAY_ENV.ackTripwires);
    if (ackRaw !== undefined) {
      for (const part of ackRaw.split(",")) {
        const id = part.trim();
        if (/^[a-z][a-z0-9_]{0,47}$/.test(id)) acknowledged.push(id);
        else if (id !== "") issues.push({ variable: RELAY_ENV.ackTripwires, message: "RELAY_ACK_TRIPWIRES holds an id that is not valid; ignoring it.", fatal: false });
      }
    }

    // Upstream extras.
    let baseRpcUrl: Secret | undefined;
    const baseRaw = read(env, RELAY_ENV.baseRpcUrl);
    if (baseRaw !== undefined) {
      if (parseHttpsHost(baseRaw) === undefined) issues.push({ variable: RELAY_ENV.baseRpcUrl, message: "RELAY_BASE_RPC_URL must be an https URL to a named host, with no user name or password; ignoring it.", fatal: false });
      else baseRpcUrl = new Secret(baseRaw);
    }
    let selfHostUrl: string | undefined;
    const selfRaw = read(env, RELAY_ENV.selfHost);
    if (selfRaw !== undefined) {
      const parsed = parseHttpsHost(selfRaw);
      if (parsed === undefined || parsed.search !== "" || parsed.hash !== "") issues.push({ variable: RELAY_ENV.selfHost, message: "RELAY_SELF_HOST must be an https URL to a named host with no query or fragment; ignoring it.", fatal: false });
      else selfHostUrl = `${parsed.origin}${parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`}`;
    }

    // Alert hook: off unless asked for twice (the switch and the command).
    const hookSwitch = boolVar(env, RELAY_ENV.alertHook, false, issues);
    let alertCommand: string | undefined;
    const commandRaw = read(env, RELAY_ENV.alertCommand);
    if (commandRaw !== undefined) {
      // eslint-disable-next-line no-control-regex
      if (!commandRaw.startsWith("/") || commandRaw.length > 512 || /[\u0000-\u001f\u007f]/.test(commandRaw)) {
        issues.push({ variable: RELAY_ENV.alertCommand, message: "RELAY_ALERT_COMMAND must be an absolute path to an executable; ignoring it.", fatal: false });
      } else alertCommand = commandRaw;
    }
    if (hookSwitch && alertCommand === undefined) issues.push({ variable: RELAY_ENV.alertHook, message: "RELAY_ALERT_HOOK is on but no valid RELAY_ALERT_COMMAND is set; the hook stays off.", fatal: false });

    let tripwireIntervalS = 60;
    const intervalRaw = read(env, RELAY_ENV.tripwireIntervalS);
    if (intervalRaw !== undefined) {
      if (/^[1-9][0-9]{0,4}$/.test(intervalRaw) && Number(intervalRaw) >= 5 && Number(intervalRaw) <= 86_400) tripwireIntervalS = Number(intervalRaw);
      else issues.push({ variable: RELAY_ENV.tripwireIntervalS, message: "RELAY_TRIPWIRE_INTERVAL_S must be a whole number from 5 to 86400; using 60.", fatal: false });
    }

    const limits: RelayLimits = {
      maxOrderAtomic: guardrails.maxOrderAtomic,
      maxDailyAtomic: guardrails.maxDailyAtomic,
      seedCapAtomic: lowerOnlyUsd(env, RELAY_ENV.seedCapUsd, CREATION_SEED_CAP_ATOMIC, issues),
      fundingTestCapAtomic: lowerOnlyUsd(env, RELAY_ENV.fundingTestCapUsd, FUNDING_TEST_CAP_ATOMIC, issues),
      fundingDailyCapAtomic: lowerOnlyUsd(env, RELAY_ENV.fundingDailyCapUsd, FUNDING_DAILY_CAP_ATOMIC, issues),
    };

    const config: RelayConfig = Object.freeze({
      host: RELAY_BIND_HOST,
      port,
      dataDir,
      credentialStore,
      keys: Object.freeze({ current, next }),
      flags: parsedFlags.flags,
      armedFlags: Object.freeze([...new Set(armed)]),
      enforceFlagFacts,
      acknowledgedTripwires: Object.freeze([...new Set(acknowledged)]),
      guardrails,
      limits: Object.freeze(limits),
      http: DEFAULT_HTTP,
      baseRpcUrl,
      selfHostUrl,
      alertHookEnabled: hookSwitch && alertCommand !== undefined,
      alertCommand,
      tripwireIntervalS,
    });
    return { config, issues, fatal: issues.filter((issue) => issue.fatal) };
  } catch {
    const message = "The environment could not be read; the relay will not start.";
    const failure: RelayConfigIssue = { variable: "*", message, fatal: true };
    return {
      config: Object.freeze({
        host: RELAY_BIND_HOST,
        port: DEFAULT_RELAY_PORT,
        dataDir: undefined,
        credentialStore: true,
        keys: Object.freeze({ current: undefined, next: undefined }),
        flags: Object.freeze({ ...parseFlags({}).flags, KILL: true }),
        armedFlags: Object.freeze([]),
        enforceFlagFacts: true,
        acknowledgedTripwires: Object.freeze([]),
        guardrails: Object.freeze({ ...loadConfig({}).config, killSwitch: true }),
        limits: Object.freeze({
          maxOrderAtomic: 0n,
          maxDailyAtomic: 0n,
          seedCapAtomic: 0n,
          fundingTestCapAtomic: 0n,
          fundingDailyCapAtomic: 0n,
        }),
        http: DEFAULT_HTTP,
        baseRpcUrl: undefined,
        selfHostUrl: undefined,
        alertHookEnabled: false,
        alertCommand: undefined,
        tripwireIntervalS: 60,
      }),
      issues: [failure],
      fatal: [failure],
    };
  }
}

export const DEFAULT_HTTP: RelayHttpConfig = Object.freeze({
  bodyLimitBytes: 64 * 1024,
  requestBudgetMs: RELAY_PENDING_AFTER_MS,
  hardDeadlineMs: 25_000,
  headersTimeoutMs: 5_000,
  requestTimeoutMs: 15_000,
  maxHeaderBytes: 8 * 1024,
  shutdownGraceMs: 10_000,
  readRate: Object.freeze({ capacity: 30, refillPerSecond: 15 }),
  writeRate: Object.freeze({ capacity: 6, refillPerSecond: 2 }),
  authFailureRate: Object.freeze({ capacity: 5, refillPerSecond: 5 / 60 }),
});

// Throws RelayConfigError listing every fatal issue; returns the config otherwise.
export function assertStartable(loaded: LoadedRelayConfig, hasMasterSecret: boolean): RelayConfig {
  const problems = [...loaded.fatal];
  if (loaded.config.credentialStore && !hasMasterSecret) {
    problems.push({
      variable: RELAY_ENV.masterKey,
      message: "The credential store is on, so a master secret is required: set RELAY_MASTER_KEY or answer the prompt. Set RELAY_CREDENTIAL_STORE=off to run without credentials.",
      fatal: true,
    });
  }
  if (problems.length > 0) throw new RelayConfigError(problems);
  return loaded.config;
}

// ---- the master secret ------------------------------------------------------------------------------------------

export interface MasterSecretPrompt {
  isTTY(): boolean;
  prompt(message: string): Promise<string>;
}

export type MasterSecretResult =
  | { readonly ok: true; readonly secret: Secret; readonly source: "env" | "prompt" }
  | { readonly ok: false; readonly code: "missing" | "too_short" | "too_long" | "same_as_relay_key" | "mismatch"; readonly message: string };

// Reads the master secret from RELAY_MASTER_KEY, or asks for it on a terminal. It never reads a
// file. `confirm` asks twice (first start, when the secret is being chosen).
export async function resolveMasterSecret(
  env: FlagEnv,
  relayKeys: readonly (Secret | undefined)[],
  io?: MasterSecretPrompt,
  confirm = false,
): Promise<MasterSecretResult> {
  const stripLineEnd = (value: string): string => value.replace(/[\r\n]+$/, "");
  let value = typeof env[RELAY_ENV.masterKey] === "string" ? stripLineEnd(env[RELAY_ENV.masterKey] as string) : "";
  let source: "env" | "prompt" = "env";
  if (value === "") {
    const wantsPrompt = TRUTHY.has((read(env, RELAY_ENV.masterKeyPrompt) ?? "").toLowerCase());
    if (io === undefined || !(wantsPrompt || io.isTTY())) {
      return { ok: false, code: "missing", message: "No master secret: set RELAY_MASTER_KEY or run the relay on a terminal to be asked." };
    }
    source = "prompt";
    value = stripLineEnd(await io.prompt("Relay master secret: "));
    if (confirm) {
      const again = stripLineEnd(await io.prompt("Repeat the master secret: "));
      if (again !== value) return { ok: false, code: "mismatch", message: "The two entries differ." };
    }
  }
  try {
    checkMasterSecret(value);
  } catch {
    return value.length < MIN_MASTER_SECRET_CHARS
      ? { ok: false, code: "too_short", message: `The master secret must be at least ${MIN_MASTER_SECRET_CHARS} characters.` }
      : { ok: false, code: "too_long", message: `The master secret must be at most ${MAX_MASTER_SECRET_CHARS} characters.` };
  }
  for (const key of relayKeys) {
    if (key !== undefined && key.reveal() === value) {
      return { ok: false, code: "same_as_relay_key", message: "The master secret must not be the same as a relay key." };
    }
  }
  return { ok: true, secret: new Secret(value), source };
}

// Terminal prompt with the typed characters hidden.
export function createTtyPrompt(input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stderr): MasterSecretPrompt {
  return {
    isTTY: () => input.isTTY === true,
    prompt: (message) =>
      new Promise<string>((resolve, reject) => {
        output.write(message);
        let muted = false;
        const sink = new Writable({
          write(chunk, encoding, callback) {
            if (!muted) output.write(chunk, encoding);
            callback();
          },
        });
        const reader = createInterface({ input, output: sink, terminal: true });
        let answered = false;
        reader.on("close", () => {
          if (!answered) reject(new Error("The prompt was closed before an answer was given."));
        });
        muted = true;
        reader.question("", (answer) => {
          answered = true;
          reader.close();
          output.write("\n");
          resolve(answer);
        });
      }),
  };
}

// ---- looking up services from a handler ------------------------------------------------------------------------------

// Handlers get optional services (the interface is merged into by each module and some tests build
// a context without them). Use this to fetch one and fail with `internal` if it was not wired.
export function needService<K extends keyof RelayServices>(context: RelayContext, key: K): NonNullable<RelayServices[K]> {
  const value = context.services[key];
  if (value === undefined || value === null) {
    throw new RelayError("internal", `The relay service "${String(key)}" is not available.`);
  }
  return value as NonNullable<RelayServices[K]>;
}

declare module "./types.js" {
  interface RelayServices {
    readonly config?: RelayConfig;
  }
}

// A one-screen summary for the start-up banner. Booleans and words only: no key, no URL, no path.
export function describeConfig(config: RelayConfig, effective: Flags): string[] {
  const usd = (atomic: bigint): string => `${atomic / 1_000_000n}.${(atomic % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0")}`;
  const lines = [
    config.keys.current === undefined ? "bind: none (in-process relay, no listener, no relay key)" : `bind: ${config.host} (loopback only)`,
    `credential store: ${config.credentialStore ? "on" : "off"}`,
    ...(config.keys.current === undefined ? [] : [`relay keys: ${config.keys.next === undefined ? "1 accepted" : "2 accepted (rotation in progress)"}`]),
    `kill switch: ${effective.KILL ? "ON (every write refused)" : "off"}`,
    `flag prerequisites: ${config.enforceFlagFacts ? "enforced" : "NOT enforced"}`,
    `caps: order $${usd(config.limits.maxOrderAtomic)}, day $${usd(config.limits.maxDailyAtomic)}, seed $${usd(config.limits.seedCapAtomic)}, funding total $${usd(config.limits.fundingTestCapAtomic)}, funding day $${usd(config.limits.fundingDailyCapAtomic)}`,
    `alert hook: ${config.alertHookEnabled ? "on" : "off"}`,
  ];
  for (const name of FLAG_NAMES) {
    if (name === "KILL") continue;
    const armed = config.armedFlags.includes(name);
    lines.push(`flag ${name}: env ${config.flags[name] ? "on" : "off"}, effective ${effective[name] ? "on" : "off"}${armed ? ", armed" : ""}`);
  }
  return lines;
}
