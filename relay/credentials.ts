import { createHash, createHmac } from "node:crypto";
import { inspect } from "node:util";

import { concat, type Address, type Hex } from "viem";

import {
  AUTH_PREPARED_TTL_S,
  SAFETY_NOTICES,
  digestTag,
  typedDataSchema,
  type PostRequestParsed,
  type PostResponseInput,
  type PreparedSign,
  type TypedData,
} from "../src/relay/contract.js";
import { RelayError, isRelayError } from "../src/relay/errors.js";
import { AccountError, deriveAccount, parseOwner, requireDerivedAccount } from "../src/xo/account/derive.js";
import { deriveAccountState, gateConnect, type AccountStateResult, type RegistryObservation } from "../src/xo/account/state.js";
import { CLOB_AUTH_DOMAIN_NAME, CLOB_AUTH_DOMAIN_VERSION, CLOB_AUTH_MESSAGE, ECDSA_VALIDATOR, XO_CHAIN_ID } from "../src/xo/chain/constants.js";
import {
  ChainReadError,
  ExplorerLogReader,
  RpcReader,
  readAccountCode,
  readDeploymentLogs,
  readTradingEnabled,
  type CodeObservation,
  type DeploymentLogs,
  type ExplorerTransport,
  type RpcHttpResponse,
  type RpcTransport,
  type TradingEnabledRead,
} from "../src/xo/chain/reads.js";
import { buildClobAuthKernelTypedData, hashClobAuth } from "../src/xo/signing/clobauth.js";
import { canonicalString, decodeHmacSecret, type HmacCanonicalMode } from "../src/xo/signing/hmac.js";
import { kernelWrapDigest } from "../src/xo/signing/kernel.js";
import { formatMicro, parseMicroInteger } from "../src/xo/units.js";
import { verifyDigestSignature } from "../src/xo/userop/verify.js";
import type { SecretStore } from "./store.js";
import { isoSecondOf, type RelayAuditEvent } from "./audit.js";
import type { AccountDirectory, AccountReading } from "./health.js";
import { guardSubmit, guardWrite, type CapabilityRegistry } from "./capabilities.js";
import { NAMESPACES, StoreError, type DurableStore, type Json, type KeyedMutex } from "./store.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";
import { toRelayError, UpstreamError, type Upstream, type UpstreamResponse } from "./upstream.js";
import type { PreparedRecord } from "./prepared.js";
import type { DurableLedger } from "./ledger.js";
import type { RelayConfig } from "./config.js";
import type { AlertSink } from "./alerts.js";

// POST /v1/auth/prepare and POST /v1/auth/submit: the L1 (ClobAuth) login, the HMAC credential
// lifecycle, the probes that learn XO's undocumented HMAC details, and `signL2` for the modules that
// make signed (L2) calls. Also `createAccountDirectory`, the account reads behind POST
// /v1/account/status (the route itself is in health.ts).
//
// Spec: docs/phase1-gap-closing.md gate 1, 3.3 (AU rows), N2, N3, N6, A5 (credential store), A7, T2;
// notes 01 (a, b, f) and 22 (e, f, g, 14).
//
// The lifecycle, in the order it happens inside one submit (all under a per-account lock):
//
//   1. The owner's signature is checked against a digest recomputed from the stored fields, and the
//      prepared item is claimed (single use, `sending` marker on disk) BEFORE anything is sent.
//   2. A triplet already on disk ends the story: nothing is derived or created, we only validate it.
//   3. GET /auth/derive-api-key first. A full triplet in the answer is adopted. 404, or an answer
//      without a secret, goes on to step 4 once.
//   4. POST /auth/api-key at most ONCE per account, ever. A marker is made durable before the request,
//      and the triplet is persisted (encrypted, backup first, read back) the moment the answer is
//      parsed, before any log line, any probe, any other use.
//   5. One more derive, to learn whether XO shows the secret again (AU2).
//   6. Probe A (GET /auth/api-keys, at most 4 decoding/padding variants) and probe B (GET
//      /orders?limit=1, documented target then path-only), at most 6 failures per credential, spaced
//      1 s apart. Every result is a capability fact; a failure is never turned into a fact that could
//      be the credential's fault.
//
// What a crash leaves behind is deliberate: a durable "create started" marker, then the triplet. With
// the marker and no triplet the relay does not post again: it derives, and adopts the key only if XO
// re-sends the secret (AU2 yes). Otherwise the account has a key nobody can use and the relay says so
// (AU3: a lost secret is unrecoverable by us).
//
// Nothing here returns, logs or stores a triplet, an HMAC value or a signature outside the encrypted
// vault: responses carry a key tag (a hash prefix), audit lines carry shortened addresses.

// ---- constants ---------------------------------------------------------------------------------------------------

export const CREDENTIAL_FLOW_NS = "credential_flow";
export const TRIPLET_SECRET_NAME = "xo_triplet";
// The flag a connect needs. Credentials are part of the trading path (docs 5.9: xo_connect is enabled
// by T1 and T2); the flag gate lets the operator arm it for the live test itself.
export const CONNECT_FLAG = "ENABLE_TRADING" as const;
// Capability facts this module records (ids from the assumptions register).
export const FACT_DERIVE_SECRET = "AU2";
export const FACT_L1_FORM = "AU6";
export const FACT_HMAC_VARIANT = "OR10";
export const FACT_PAYBOX_TYPED_DATA = "PB2";

// Probe protocol (note 22 e.3): A has 4 variants, B has 2, and a credential that fails 6 times is
// parked instead of looped on. Probes are spaced at least a second apart.
export const PROBE_A_MAX = 4;
export const PROBE_B_MAX = 2;
export const PROBE_FAILURE_LIMIT = 6;
export const PROBE_SPACING_MS = 1_000;
// After this many L1 rejections (signature or timestamp) for one account the relay stops asking for
// signatures: failed-auth lockout behaviour at XO is NOT FOUND.
export const L1_REJECTION_LIMIT = 6;
// A create that started and left no triplet is only retried after this long and only if derive says no key exists.
export const CREATE_SETTLE_MS = 60_000;
const TIME_CACHE_MS = 20_000;
const REQUEST_TIMEOUT_MS = 5_000;
const ORDERBOOK = "https://orderbooks.xo.market";

// ---- small helpers -----------------------------------------------------------------------------------------------

const lower = (value: string): string => value.toLowerCase();
const shortAddress = (address: string): string => `${address.slice(0, 6)}...${address.slice(-4)}`;
const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;
const SECRET_TOKEN = /^[\x21-\x7e]{1,1024}$/;
const SERVER_SECONDS = /^[1-9][0-9]{0,11}$/;

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The key tag: a hash prefix of the API key id. It identifies a key in status output without being
// any part of the credential.
export function keyTagOf(apiKey: string): string {
  return createHash("sha256").update(`xo-key-tag:${apiKey}`).digest("hex").slice(0, 12);
}

// ---- L1 variants (amendment A7) -------------------------------------------------------------------------------------

// What the owner signs (kernel-on: the Kernel-wrapped ClobAuth digest, what an ERC-1271 check on the
// Kernel account verifies; kernel-off: the plain ClobAuth digest), what XO_SIGNATURE carries
// (sig-86: 0x01 + validator + 65 bytes, the documented form; sig-66: 0x00 + 65 bytes; sig-65: the
// bare 65 bytes) and whether XO_ADDRESS is sent. The default is the documented form. A fact (AU6)
// selects another; the relay itself only ever steps sig-86 to sig-66 (same 65 bytes, no new approval).
export const L1_WRAPS = ["kernel-on", "kernel-off"] as const;
export const L1_SIGS = ["sig-86", "sig-66", "sig-65"] as const;
export const L1_ADDRS = ["addr-yes", "addr-no"] as const;
export type L1Wrap = (typeof L1_WRAPS)[number];
export type L1Sig = (typeof L1_SIGS)[number];
export type L1Addr = (typeof L1_ADDRS)[number];
export interface L1Variant {
  readonly wrap: L1Wrap;
  readonly sig: L1Sig;
  readonly addr: L1Addr;
}
export const DEFAULT_L1_VARIANT: L1Variant = Object.freeze({ wrap: "kernel-on", sig: "sig-86", addr: "addr-yes" });

export function formatL1Variant(variant: L1Variant): string {
  return `${variant.wrap}:${variant.sig}:${variant.addr}`;
}

export function parseL1Variant(token: string | undefined): L1Variant | undefined {
  if (token === undefined) return undefined;
  const [wrap, sig, addr, ...rest] = token.split(":");
  if (rest.length > 0 || wrap === undefined || sig === undefined || addr === undefined) return undefined;
  if (!(L1_WRAPS as readonly string[]).includes(wrap) || !(L1_SIGS as readonly string[]).includes(sig) || !(L1_ADDRS as readonly string[]).includes(addr)) return undefined;
  return { wrap: wrap as L1Wrap, sig: sig as L1Sig, addr: addr as L1Addr };
}

// The variant to prepare with: the AU6 fact's value unless it was rejected (state no) or is not a
// token this code knows; otherwise the documented form.
export function selectL1Variant(capabilities: CapabilityRegistry | undefined): L1Variant {
  const fact = capabilities?.fact(FACT_L1_FORM);
  if (fact === undefined || fact.state === "no") return DEFAULT_L1_VARIANT;
  return parseL1Variant(fact.value) ?? DEFAULT_L1_VARIANT;
}

// The step the relay may take on its own after an explicit signature rejection: the default 86-byte
// form to the 66-byte root form, with the same 65 signature bytes. Anything else needs a new signature.
function signatureLadder(variant: L1Variant, pinned: boolean): L1Sig[] {
  if (pinned || variant.sig !== "sig-86") return [variant.sig];
  return ["sig-86", "sig-66"];
}

export interface L1HeaderInput {
  readonly account: Address;
  readonly timestamp: string;
  // Canonical 65 bytes (v 27 or 28, low s), already verified against the owner.
  readonly sig65: Hex;
  readonly variant: L1Variant;
  readonly sig?: L1Sig;
}

// XO_NONCE is left out: nonce 0 is its documented default, and the signed struct carries 0.
export function assembleL1Headers(input: L1HeaderInput): Record<string, string> {
  if (!/^0x[0-9a-f]{130}$/.test(input.sig65)) throw new RelayError("internal", "An L1 signature has to be 65 canonical bytes.");
  if (!SERVER_SECONDS.test(input.timestamp)) throw new RelayError("internal", "An L1 timestamp is unix seconds.");
  const form = input.sig ?? input.variant.sig;
  const body = input.sig65.slice(2);
  const wire: Hex =
    form === "sig-86" ? concat(["0x01", lower(ECDSA_VALIDATOR) as Hex, `0x${body}`]) : form === "sig-66" ? concat(["0x00", `0x${body}`]) : input.sig65;
  const headers: Record<string, string> = { XO_SIGNATURE: wire, XO_TIMESTAMP: input.timestamp };
  if (input.variant.addr === "addr-yes") headers["XO_ADDRESS"] = input.account;
  return headers;
}

// ---- L2 variants (note 22 e, OR10) ---------------------------------------------------------------------------------------

export const L2_KEYS = ["b64url", "raw"] as const;
export const L2_PADS = ["padded", "stripped"] as const;
export const L2_TARGETS = ["path-with-query", "path-only"] as const;
export type L2Key = (typeof L2_KEYS)[number];
export type L2Pad = (typeof L2_PADS)[number];
export type L2Target = (typeof L2_TARGETS)[number];
export interface L2Variant {
  readonly key: L2Key;
  readonly pad: L2Pad;
  readonly target: L2Target;
  readonly addr: L1Addr;
}

export interface L2Known {
  readonly key?: L2Key;
  readonly pad?: L2Pad;
  readonly target?: L2Target;
  readonly addr?: L1Addr;
}

// The OR10 fact's value: "<key>-<pad>:<target or unknown>:<addr>", for example
// "b64url-padded:path-with-query:addr-yes". The target is "unknown" until probe B has run.
export function formatL2Token(variant: { readonly key: L2Key; readonly pad: L2Pad; readonly target?: L2Target; readonly addr?: L1Addr }): string {
  return `${variant.key}-${variant.pad}:${variant.target ?? "unknown"}:${variant.addr ?? "addr-yes"}`;
}

export function parseL2Token(token: string | undefined): L2Known | undefined {
  if (token === undefined) return undefined;
  const [decode, target, addr, ...rest] = token.split(":");
  if (rest.length > 0 || decode === undefined || target === undefined || addr === undefined) return undefined;
  const [key, pad, ...more] = decode.split("-");
  if (more.length > 0 || !(L2_KEYS as readonly string[]).includes(key ?? "") || !(L2_PADS as readonly string[]).includes(pad ?? "")) return undefined;
  if (target !== "unknown" && !(L2_TARGETS as readonly string[]).includes(target)) return undefined;
  if (!(L1_ADDRS as readonly string[]).includes(addr)) return undefined;
  return { key: key as L2Key, pad: pad as L2Pad, ...(target === "unknown" ? {} : { target: target as L2Target }), addr: addr as L1Addr };
}

function l2KnownFromFacts(capabilities: CapabilityRegistry | undefined): L2Known {
  const fact = capabilities?.fact(FACT_HMAC_VARIANT);
  if (fact === undefined || fact.state === "no") return {};
  return parseL2Token(fact.value) ?? {};
}

// base64url(HMAC-SHA256(key, message)). `b64url` decodes the secret first (either alphabet, with or
// without padding); `raw` uses the secret's own bytes. `stripped` drops the '=' padding of the output.
export function l2Signature(secret: string, variant: { readonly key: L2Key; readonly pad: L2Pad }, message: string): string {
  const key = variant.key === "raw" ? Buffer.from(secret, "utf8") : decodeHmacSecret(secret);
  const digest = createHmac("sha256", key).update(message, "utf8").digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
  return variant.pad === "stripped" ? digest.replace(/=+$/, "") : digest;
}

// ---- the credential triplet --------------------------------------------------------------------------------------------

// In memory only, for as long as a call needs it. It prints as nothing useful anywhere.
export class HmacTriplet {
  readonly #apiKey: string;
  readonly #secret: string;
  readonly #passphrase: string;

  constructor(apiKey: string, secret: string, passphrase: string) {
    this.#apiKey = apiKey;
    this.#secret = secret;
    this.#passphrase = passphrase;
    Object.freeze(this);
  }

  // Null for anything that is not a usable triplet: strings, printable, no spaces, bounded.
  static from(value: unknown): HmacTriplet | null {
    if (!isRecord(value)) return null;
    const { apiKey, secret, passphrase } = value;
    if (typeof apiKey !== "string" || !HEADER_TOKEN.test(apiKey)) return null;
    if (typeof secret !== "string" || !SECRET_TOKEN.test(secret)) return null;
    if (typeof passphrase !== "string" || !HEADER_TOKEN.test(passphrase)) return null;
    return new HmacTriplet(apiKey, secret, passphrase);
  }

  get tag(): string {
    return keyTagOf(this.#apiKey);
  }

  get apiKey(): string {
    return this.#apiKey;
  }

  // Can this secret be used with the `b64url` decoding at all? If not, the variant is skipped without a request.
  canDecode(): boolean {
    try {
      decodeHmacSecret(this.#secret);
      return true;
    } catch {
      return false;
    }
  }

  // The four XO_* headers.
  headers(variant: { readonly key: L2Key; readonly pad: L2Pad }, timestamp: string, message: string): Record<string, string> {
    return {
      XO_API_KEY: this.#apiKey,
      XO_TIMESTAMP: timestamp,
      XO_PASSPHRASE: this.#passphrase,
      XO_SIGNATURE: l2Signature(this.#secret, variant, message),
    };
  }

  serialize(): string {
    return JSON.stringify({ apiKey: this.#apiKey, secret: this.#secret, passphrase: this.#passphrase });
  }

  // Compare to another triplet's secret without exposing either.
  sameSecret(other: HmacTriplet): boolean {
    return this.#secret === other.#secret && this.#passphrase === other.#passphrase && this.#apiKey === other.#apiKey;
  }

  hasSecret(): boolean {
    return this.#secret.length > 0;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [inspect.custom](): string {
    return "[redacted]";
  }
}

// ---- durable lifecycle record ----------------------------------------------------------------------------------------------

export type CredentialState = "none" | "stored" | "validated" | "failed";
export type CreateOutcome = "none" | "pending" | "stored" | "limit_reached" | "ambiguous" | "unusable";

// One record per account, in its own namespace, written together with the status record the
// account-status route reads (NAMESPACES.credentialStatus: { state, key_tag }).
type FlowRecord = {
  v: 1;
  state: CredentialState;
  keyTag: string | null;
  // POST /auth/api-key requests made that may have minted a key. Never more than 1.
  createAttempts: number;
  createOutcome: CreateOutcome;
  createStartedAtMs: number | null;
  limitReached: boolean;
  // L1 signatures XO refused (signature or timestamp).
  l1Rejections: number;
  // Signed GETs that came back 401, and the probe A variants that were tried and failed.
  probeFailures: number;
  probeVariantsFailed: string[];
  updatedAtMs: number;
};

const EMPTY_FLOW: FlowRecord = {
  v: 1,
  state: "none",
  keyTag: null,
  createAttempts: 0,
  createOutcome: "none",
  createStartedAtMs: null,
  limitReached: false,
  l1Rejections: 0,
  probeFailures: 0,
  probeVariantsFailed: [],
  updatedAtMs: 0,
};

function readFlow(state: DurableStore, account: string): FlowRecord {
  const stored = state.get<Json>(CREDENTIAL_FLOW_NS, lower(account));
  if (!isRecord(stored) || stored["v"] !== 1) return { ...EMPTY_FLOW, probeVariantsFailed: [] };
  const states: readonly unknown[] = ["none", "stored", "validated", "failed"];
  const outcomes: readonly unknown[] = ["none", "pending", "stored", "limit_reached", "ambiguous", "unusable"];
  const failed = stored["probeVariantsFailed"];
  return {
    v: 1,
    state: states.includes(stored["state"]) ? (stored["state"] as CredentialState) : "none",
    keyTag: typeof stored["keyTag"] === "string" ? stored["keyTag"] : null,
    createAttempts: stored["createAttempts"] === 1 ? 1 : 0,
    createOutcome: outcomes.includes(stored["createOutcome"]) ? (stored["createOutcome"] as CreateOutcome) : "none",
    createStartedAtMs: typeof stored["createStartedAtMs"] === "number" ? stored["createStartedAtMs"] : null,
    limitReached: stored["limitReached"] === true,
    l1Rejections: typeof stored["l1Rejections"] === "number" ? stored["l1Rejections"] : 0,
    probeFailures: typeof stored["probeFailures"] === "number" ? stored["probeFailures"] : 0,
    probeVariantsFailed: Array.isArray(failed) ? failed.filter((entry): entry is string => typeof entry === "string") : [],
    updatedAtMs: typeof stored["updatedAtMs"] === "number" ? stored["updatedAtMs"] : 0,
  };
}

async function writeFlow(state: DurableStore, account: string, next: FlowRecord, nowMs: number): Promise<FlowRecord> {
  const record: FlowRecord = { ...next, updatedAtMs: nowMs };
  await state.transact(() => ({
    ops: [
      { ns: CREDENTIAL_FLOW_NS, key: lower(account), value: record },
      { ns: NAMESPACES.credentialStatus, key: lower(account), value: { state: record.state, key_tag: record.keyTag } },
    ],
    result: undefined,
  }));
  return record;
}

// ---- options and the environment of one call -------------------------------------------------------------------------

export type CredentialStep =
  | "l1_derive_done"
  | "create_marker_written"
  | "create_response_received"
  | "triplet_persisted"
  | "flow_stored"
  | "probe_a_done"
  | "validated";

export interface CredentialOptions {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly probeSpacingMs?: number;
  readonly requestTimeoutMs?: number;
  readonly createSettleMs?: number;
  // An XO RPC URL (https) for the account reads at prepare time. Optional: the explorer logs are enough.
  readonly rpcUrl?: string;
  // TEST SEAM. Called after each named step; a test that throws here stops the flow at that point, the
  // way a crash would. Production passes nothing.
  readonly onStep?: (step: CredentialStep) => void | Promise<void>;
}

type CallContext = Pick<RelayContext, "services" | "now">;

interface Env {
  readonly services: RelayServices;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly spacingMs: number;
  readonly timeoutMs: number;
  readonly settleMs: number;
  readonly options: CredentialOptions;
}

function envFor(context: CallContext, options: CredentialOptions): Env {
  return {
    services: context.services,
    now: context.now,
    sleep: options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    spacingMs: options.probeSpacingMs ?? PROBE_SPACING_MS,
    timeoutMs: options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    settleMs: options.createSettleMs ?? CREATE_SETTLE_MS,
    options,
  };
}

interface Core {
  readonly upstream: Upstream;
  readonly state: DurableStore;
  readonly locks: KeyedMutex;
  readonly secrets: SecretStore | undefined;
  readonly capabilities: CapabilityRegistry | undefined;
}

function coreOf(env: Env): Core {
  const { upstream, state, locks, secrets, capabilities } = env.services;
  if (upstream === undefined || state === undefined || locks === undefined) {
    throw new RelayError("internal", "The credential module needs the upstream client, the state store and the lock table.");
  }
  return { upstream, state, locks, secrets, capabilities };
}

async function audit(env: Env, event: RelayAuditEvent): Promise<void> {
  await env.services.audit?.write(event);
}

async function alert(env: Env, id: string, severity: "info" | "warn" | "critical", message: string): Promise<void> {
  const sink: AlertSink | undefined = env.services.alerts;
  await sink?.raise({ id, severity, message }).catch(() => undefined);
}

async function step(env: Env, name: CredentialStep): Promise<void> {
  await env.options.onStep?.(name);
}

// A fact must never break the flow that learned it.
async function recordFact(
  env: Env,
  fact: { readonly id: string; readonly state: "unknown" | "yes" | "no"; readonly note: string; readonly value?: string },
): Promise<void> {
  const registry = env.services.capabilities;
  if (registry === undefined) return;
  const existing = registry.fact(fact.id);
  if (existing !== undefined && existing.state === fact.state && existing.value === fact.value && existing.source === "probe") return;
  try {
    await registry.record({ id: fact.id, state: fact.state, source: "probe", note: fact.note, ...(fact.value === undefined ? {} : { value: fact.value }) });
  } catch {
    // An operator's recorded answer wins over a probe; nothing to do.
  }
}

function mapAccountError(error: unknown): never {
  if (error instanceof AccountError) {
    if (error.code === "account_mismatch" || error.code === "account_is_owner") {
      throw new RelayError("account_mismatch", "The account does not belong to this owner. The relay derives it from the owner.");
    }
    throw new RelayError("invalid_request", "That owner address cannot be used.");
  }
  throw error;
}

// ---- XO server time -----------------------------------------------------------------------------------------------------

interface ClockSample {
  readonly offsetMs: number;
  readonly atLocalMs: number;
}
const clockSamples = new WeakMap<object, ClockSample>();

// L1 and L2 timestamps are XO's seconds, not ours: the windows (about 120 s, 30 s) are measured on
// its clock. GET /time is a bare integer. The offset is cached briefly; a fresh read is always
// available.
async function serverSeconds(env: Env, options: { readonly fresh?: boolean; readonly signal?: AbortSignal } = {}): Promise<number> {
  const { upstream } = coreOf(env);
  const localNow = env.now();
  const sample = clockSamples.get(upstream);
  if (options.fresh !== true && sample !== undefined && localNow >= sample.atLocalMs && localNow - sample.atLocalMs <= TIME_CACHE_MS) {
    return Math.floor((localNow + sample.offsetMs) / 1000);
  }
  let seconds: number | undefined;
  try {
    const response = await upstream.request({
      method: "GET",
      url: `${ORDERBOOK}/time`,
      purpose: "clock",
      timeoutMs: env.timeoutMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (response.ok) {
      const text = response.body.trim();
      if (SERVER_SECONDS.test(text)) seconds = Number(text);
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw toRelayError(error);
    throw error;
  }
  if (seconds === undefined) {
    throw new RelayError("upstream_rejected", "XO did not return a usable server time, so nothing was signed.", { reason: "time_unusable" });
  }
  clockSamples.set(upstream, { offsetMs: seconds * 1000 - localNow, atLocalMs: localNow });
  return seconds;
}

// ---- account reads (chain-account's modules over the relay's upstream client) ----------------------------------------------

export function upstreamExplorerTransport(upstream: Upstream, options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {}): ExplorerTransport {
  return {
    async getJson(url) {
      const response = await upstream.request({
        method: "GET",
        url,
        purpose: "explorer_logs",
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (!response.ok) throw new ChainReadError("upstream_error", "explorer request failed");
      return upstream.json(response);
    },
  };
}

// The RpcReader latches "requires key" on a 401 or 403 status; the upstream client latches on a thrown
// requires_key. Both end in the same place: no more requests.
export function upstreamRpcTransport(upstream: Upstream, options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {}): RpcTransport {
  return {
    async postJson(url, body): Promise<RpcHttpResponse> {
      try {
        const response = await upstream.request({
          method: "POST",
          url,
          purpose: "xo_rpc_read",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        return { status: response.status, body: jsonOf(response.body) ?? response.body };
      } catch (error) {
        if (error instanceof UpstreamError && error.kind === "requires_key") return { status: 401, body: "" };
        throw error;
      }
    },
  };
}

interface ChainSources {
  readonly explorer: ExplorerLogReader;
  readonly rpc: RpcReader | undefined;
}

function chainSources(upstream: Upstream, options: { readonly rpcUrl?: string; readonly timeoutMs?: number; readonly signal?: AbortSignal }): ChainSources {
  const transportOptions = { ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }), ...(options.signal === undefined ? {} : { signal: options.signal }) };
  return {
    explorer: new ExplorerLogReader({ transport: upstreamExplorerTransport(upstream, transportOptions) }),
    rpc: options.rpcUrl === undefined ? undefined : new RpcReader({ transport: upstreamRpcTransport(upstream, transportOptions), url: options.rpcUrl }),
  };
}

// A chain read that ended because the host now asks for a key is the relay's "requires key" outcome;
// anything else is an unreadable input, which the state machine turns into "unknown".
function rethrowRequiresKey(error: unknown): void {
  const cause = error instanceof ChainReadError ? error.cause : error;
  if (cause instanceof UpstreamError && cause.kind === "requires_key") throw toRelayError(cause);
}

async function readLogsSafely(sources: ChainSources, account: Address): Promise<DeploymentLogs | null> {
  try {
    return await readDeploymentLogs(sources.explorer, account);
  } catch (error) {
    rethrowRequiresKey(error);
    if (error instanceof ChainReadError || error instanceof UpstreamError) return null;
    throw error;
  }
}

async function readCodeSafely(sources: ChainSources, account: Address): Promise<CodeObservation | null> {
  if (sources.rpc === undefined || sources.rpc.requiresKey) return null;
  try {
    return await readAccountCode(sources.rpc, account);
  } catch (error) {
    if (error instanceof ChainReadError || error instanceof UpstreamError) return null;
    throw error;
  }
}

// GET /balance-allowance for the ACCOUNT address (never the owner: it answers null for every owner,
// AD3). Returns the registry observation the state machine wants and the orderbook balance.
async function readRegistry(upstream: Upstream, account: string, options: { readonly timeoutMs?: number; readonly signal?: AbortSignal }): Promise<{ readonly registry: RegistryObservation; readonly balanceMicro: bigint | null }> {
  const unavailable = { registry: { kind: "unavailable" } as RegistryObservation, balanceMicro: null };
  try {
    const response = await upstream.request({
      method: "GET",
      url: `${ORDERBOOK}/balance-allowance?address=${lower(account)}`,
      purpose: "registry",
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok) return unavailable;
    const body = jsonOf(response.body);
    if (!isRecord(body)) return unavailable;
    const smart = body["smart_account"];
    if (smart !== null && smart !== undefined && typeof smart !== "string") return unavailable;
    const balance = parseMicroInteger(body["balance"]);
    return { registry: { kind: "read", smartAccount: smart ?? null }, balanceMicro: balance };
  } catch (error) {
    if (error instanceof UpstreamError) return unavailable;
    throw error;
  }
}

export interface AccountSnapshot {
  readonly result: AccountStateResult;
  readonly tradingEnabled: TradingEnabledRead | null;
  readonly balanceMicro: bigint | null;
}

export interface ReadAccountOptions {
  readonly rpcUrl?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  // Skip the registry and trading reads (a connect only needs to know the account is deployed).
  readonly deploymentOnly?: boolean;
}

export async function readAccountSnapshot(upstream: Upstream, owner: Address, account: Address, options: ReadAccountOptions = {}): Promise<AccountSnapshot> {
  const sources = chainSources(upstream, options);
  const [logs, code] = await Promise.all([readLogsSafely(sources, account), readCodeSafely(sources, account)]);
  const registry = options.deploymentOnly === true ? { registry: { kind: "unavailable" } as RegistryObservation, balanceMicro: null } : await readRegistry(upstream, account, options);
  const result = deriveAccountState({ owner, suppliedAccount: account, logs, code, registry: registry.registry });
  let tradingEnabled: TradingEnabledRead | null = null;
  if (options.deploymentOnly !== true && result.deployed === "yes") {
    tradingEnabled = await readTradingEnabled({ explorer: sources.explorer, ...(sources.rpc === undefined ? {} : { rpc: sources.rpc }) }, account).catch((error: unknown) => {
      rethrowRequiresKey(error);
      return null;
    });
  }
  return { result, tradingEnabled, balanceMicro: registry.balanceMicro };
}

export interface AccountDirectoryOptions {
  // A thunk lets the directory be handed to createRelay before the relay's own upstream client exists.
  readonly upstream: Upstream | (() => Upstream);
  readonly rpcUrl?: string;
  readonly timeoutMs?: number;
}

// The `accounts` service POST /v1/account/status reads (health.ts). Never invents an answer: a state
// the observations cannot support (the contract has no "unknown") is a refusal that says so.
export function createAccountDirectory(options: AccountDirectoryOptions): AccountDirectory {
  const upstreamOf = (): Upstream => (typeof options.upstream === "function" ? options.upstream() : options.upstream);
  return {
    derive(owner) {
      try {
        return deriveAccount(parseOwner(owner));
      } catch (error) {
        return mapAccountError(error);
      }
    },
    async read(owner, account, { signal }): Promise<AccountReading> {
      let parsedOwner: Address;
      let parsedAccount: Address;
      try {
        parsedOwner = parseOwner(owner);
        parsedAccount = requireDerivedAccount(parsedOwner, account);
      } catch (error) {
        return mapAccountError(error);
      }
      const snapshot = await readAccountSnapshot(upstreamOf(), parsedOwner, parsedAccount, {
        signal,
        ...(options.rpcUrl === undefined ? {} : { rpcUrl: options.rpcUrl }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
      return describeSnapshot(snapshot);
    },
  };
}

function describeSnapshot(snapshot: AccountSnapshot): AccountReading {
  const { result } = snapshot;
  if (result.state === "unknown") {
    throw new RelayError("precondition_failed", "The account's state could not be established from the chain and the registry, so nothing is reported.", {
      reason: "account_state_unknown",
      anomalies: [...result.anomalies],
    });
  }
  const trading =
    result.state === "undeployed" ? "no" : snapshot.tradingEnabled === null ? "unknown" : snapshot.tradingEnabled.state === "enabled" ? "yes" : snapshot.tradingEnabled.state === "disabled" ? "no" : "unknown";
  return {
    state: result.state,
    registered: result.state === "registered",
    trading_enabled: trading,
    balance_usd: result.state === "registered" && snapshot.balanceMicro !== null ? formatMicro(snapshot.balanceMicro) : null,
  };
}

// ---- classifying XO's answers -------------------------------------------------------------------------------------------------

function textOfError(body: string): string {
  const parsed = jsonOf(body);
  if (isRecord(parsed) && typeof parsed["error"] === "string") return parsed["error"];
  return body;
}

type L1Outcome =
  | { readonly kind: "ok"; readonly body: unknown }
  // The request was authenticated and there is no key: derive's 404.
  | { readonly kind: "none" }
  | { readonly kind: "signature" }
  | { readonly kind: "timestamp" }
  | { readonly kind: "limit" }
  // Some other definite refusal: the request was not processed.
  | { readonly kind: "refused"; readonly status: number }
  // A response arrived but it is a server error: whether the work happened is unknown.
  | { readonly kind: "server"; readonly status: number }
  // No usable response. `processed` says whether the request may have been processed.
  | { readonly kind: "failed"; readonly error: UpstreamError; readonly maybeProcessed: boolean };

// Errors after which XO cannot have acted on the request (nothing sent, or an answer that refuses to act).
const NOT_PROCESSED_KINDS: ReadonlySet<string> = new Set(["rate_limited", "cloudflare", "requires_key", "redirect_blocked", "circuit_open", "host_not_allowed", "method_not_allowed", "scheme", "invalid_request"]);

async function l1Request(env: Env, method: "GET" | "POST", path: string, headers: Record<string, string>, purpose: string): Promise<L1Outcome> {
  const { upstream } = coreOf(env);
  try {
    const response = await upstream.request({
      method,
      url: `${ORDERBOOK}${path}`,
      purpose,
      headers: method === "POST" ? { ...headers, "content-type": "application/json" } : headers,
      ...(method === "POST" ? { body: "{}" } : {}),
      timeoutMs: env.timeoutMs,
    });
    if (response.ok) {
      const body = jsonOf(response.body);
      if (body === undefined) return { kind: "failed", error: new UpstreamError("invalid_json", response.host), maybeProcessed: true };
      return { kind: "ok", body };
    }
    const text = textOfError(response.body);
    if (response.status === 404 && method === "GET") return { kind: "none" };
    if (response.status === 401) {
      if (/timestamp/i.test(text)) return { kind: "timestamp" };
      if (/signature|ecdsa|1271/i.test(text)) return { kind: "signature" };
      return { kind: "refused", status: 401 };
    }
    if (response.status === 400 && /limit/i.test(text)) return { kind: "limit" };
    if (response.status >= 500) return { kind: "server", status: response.status };
    return { kind: "refused", status: response.status };
  } catch (error) {
    if (error instanceof UpstreamError) return { kind: "failed", error, maybeProcessed: !NOT_PROCESSED_KINDS.has(error.kind) };
    throw error;
  }
}

// ---- the vault ----------------------------------------------------------------------------------------------------------------

async function readTriplet(secrets: SecretStore, account: string): Promise<HmacTriplet | null> {
  const stored = await secrets.get(lower(account), TRIPLET_SECRET_NAME);
  if (stored === undefined) return null;
  return HmacTriplet.from(jsonOf(stored.reveal()));
}

// Backup first, primary second, both read back (SecretStore.put). One retry with `replace` covers a
// failed first write that left a partial primary behind. If both fail the secret exists only in memory
// and must not be used.
async function persistTriplet(secrets: SecretStore, account: string, triplet: HmacTriplet): Promise<void> {
  const value = triplet.serialize();
  try {
    await secrets.put(lower(account), TRIPLET_SECRET_NAME, value);
  } catch (first) {
    // An existing secret is never overwritten: that would destroy a working credential.
    if (first instanceof StoreError && first.code === "exists") throw first;
    try {
      await secrets.put(lower(account), TRIPLET_SECRET_NAME, value, { replace: true });
    } catch {
      throw first;
    }
  }
}

// A crash between persisting the triplet and recording it leaves the vault ahead of the durable record.
// This brings the record in line with the vault (no network). It never changes anything the vault does
// not show: a record that says "validated" or "failed" keeps saying so.
async function healFlow(env: Env, account: string): Promise<FlowRecord> {
  const core = coreOf(env);
  const flow = readFlow(core.state, account);
  if (core.secrets === undefined) return flow;
  const triplet = await readTriplet(core.secrets, account);
  if (triplet === null) return flow;
  if (flow.state !== "none" && flow.keyTag === triplet.tag && flow.createOutcome === "stored") return flow;
  return writeFlow(core.state, account, { ...flow, state: flow.state === "none" ? "stored" : flow.state, keyTag: triplet.tag, createOutcome: "stored" }, env.now());
}

// Run once at start-up: for every account the lifecycle ever touched, make the durable record agree with
// the vault. Returns the accounts it changed.
export async function healCredentialStates(context: CallContext, options: CredentialOptions = {}): Promise<string[]> {
  const env = envFor(context, options);
  const core = coreOf(env);
  const healed: string[] = [];
  for (const account of core.state.keys(CREDENTIAL_FLOW_NS)) {
    await core.locks.run(`creds:${account}`, async () => {
      const before = readFlow(core.state, account);
      const after = await healFlow(env, account);
      if (after.state !== before.state || after.keyTag !== before.keyTag || after.createOutcome !== before.createOutcome) healed.push(account);
    });
  }
  return healed;
}

// ---- the L2 probes (note 22 e.3) -----------------------------------------------------------------------------------------------

interface ProbeRun {
  readonly validated: boolean;
  // True when the run stopped on something other than a 401 (a transient failure, an unexpected status).
  readonly inconclusive: boolean;
}

interface L2Plan {
  readonly key: L2Key;
  readonly pad: L2Pad;
  readonly target: L2Target;
  readonly addr: L1Addr;
}

function buildL2Message(timestamp: string, method: string, path: string, query: string | undefined, body: string | undefined, target: L2Target): string {
  const mode: HmacCanonicalMode = target;
  return canonicalString({ timestamp, method, requestPath: query === undefined || query === "" ? path : `${path}?${query}`, ...(body === undefined ? {} : { body }), canonicalMode: mode });
}

function l2UrlOf(path: string, query: string | undefined): string {
  return `${ORDERBOOK}${path}${query === undefined || query === "" ? "" : `?${query}`}`;
}

// One signed GET for a probe. Returns the HTTP status, or null for a transport failure.
async function probeGet(env: Env, account: string, triplet: HmacTriplet, plan: L2Plan, path: string, query: string | undefined, purpose: string): Promise<number | null> {
  const { upstream } = coreOf(env);
  const timestamp = String(await serverSeconds(env));
  const message = buildL2Message(timestamp, "GET", path, query, undefined, plan.target);
  const headers = triplet.headers(plan, timestamp, message);
  if (plan.addr === "addr-yes") headers["XO_ADDRESS"] = account;
  try {
    const response = await upstream.request({ method: "GET", url: l2UrlOf(path, query), headers, purpose, timeoutMs: env.timeoutMs });
    return response.status;
  } catch (error) {
    if (error instanceof UpstreamError) return null;
    throw error;
  }
}

const PROBE_A_LADDER: ReadonlyArray<{ readonly key: L2Key; readonly pad: L2Pad }> = [
  { key: "b64url", pad: "padded" },
  { key: "b64url", pad: "stripped" },
  { key: "raw", pad: "padded" },
  { key: "raw", pad: "stripped" },
];

const variantKey = (variant: { readonly key: L2Key; readonly pad: L2Pad }): string => `${variant.key}-${variant.pad}`;

// Validates a stored triplet and learns the global HMAC facts. Safe to call again: it resumes from
// the durable counters, never repeats a variant that already failed for this credential, and never
// spends more than the failure budget. Runs under the account lock.
async function runProbes(env: Env, account: string, triplet: HmacTriplet, flowIn: FlowRecord): Promise<{ readonly flow: FlowRecord; readonly run: ProbeRun }> {
  const core = coreOf(env);
  let flow = flowIn;
  const known = l2KnownFromFacts(env.services.capabilities);
  const addr: L1Addr = known.addr ?? "addr-yes";
  let first = true;
  const space = async (): Promise<void> => {
    if (!first) await env.sleep(env.spacingMs);
    first = false;
  };
  const failuresLeft = (): number => PROBE_FAILURE_LIMIT - flow.probeFailures;
  const fail = async (variant: string): Promise<void> => {
    flow = await writeFlow(core.state, account, { ...flow, probeFailures: flow.probeFailures + 1, probeVariantsFailed: [...flow.probeVariantsFailed, variant] }, env.now());
  };
  const exhausted = async (): Promise<{ readonly flow: FlowRecord; readonly run: ProbeRun }> => {
    flow = await writeFlow(core.state, account, { ...flow, state: "failed" }, env.now());
    await alert(env, "credentials_probe_budget_spent", "warn", `The stored XO credential for ${shortAddress(account)} was refused and the relay has nothing left to try. It stopped probing and will not loop.`);
    await audit(env, { ev: "refused", account, state: "probe_budget_spent", outcome: "refused" });
    return { flow, run: { validated: false, inconclusive: false } };
  };

  if (flow.state === "failed") return { flow, run: { validated: false, inconclusive: false } };
  if (failuresLeft() <= 0) return exhausted();

  // A decoding learned from an earlier credential applies to every account: it is XO's behaviour.
  let decode: { readonly key: L2Key; readonly pad: L2Pad } | undefined = known.key !== undefined && known.pad !== undefined ? { key: known.key, pad: known.pad } : undefined;
  let validated = flow.state === "validated";
  let inconclusive = false;

  // Probe A: GET /auth/api-keys has no query, so it isolates the key, passphrase, decoding and padding.
  if (!validated) {
    // A key that cannot be base64-decoded cannot be a "b64url" credential: it is skipped without a request.
    const candidates = (decode !== undefined ? [decode] : PROBE_A_LADDER.filter((entry) => !flow.probeVariantsFailed.includes(variantKey(entry))))
      .filter((entry) => entry.key !== "b64url" || triplet.canDecode())
      .slice(0, PROBE_A_MAX);
    // Every variant already failed (or cannot apply to this secret): there is nothing left to try.
    if (candidates.length === 0) return exhausted();
    for (const candidate of candidates) {
      if (failuresLeft() <= 0) return exhausted();
      await space();
      const status = await probeGet(env, account, triplet, { ...candidate, target: "path-with-query", addr }, "/auth/api-keys", undefined, "auth_probe_a");
      if (status === 200) {
        decode = candidate;
        validated = true;
        flow = await writeFlow(core.state, account, { ...flow, state: "validated" }, env.now());
        await recordFact(env, { id: FACT_HMAC_VARIANT, state: "unknown", value: formatL2Token({ ...candidate, addr }), note: `GET /auth/api-keys accepted the ${variantKey(candidate)} HMAC; the request target is not known yet.` });
        break;
      }
      if (status === 401) {
        await fail(variantKey(candidate));
        continue;
      }
      // Anything else (a timeout, a 5xx, an odd status) says nothing about the variant: stop, do not burn the budget.
      inconclusive = true;
      break;
    }
    await step(env, "probe_a_done");
    if (!validated) {
      if (inconclusive) return { flow, run: { validated: false, inconclusive: true } };
      // Every candidate came back 401. With the whole ladder tried the credential is parked; a single
      // known variant that failed leaves the credential stored, and the failure budget bounds the retries.
      if (decode === undefined || failuresLeft() <= 0) return exhausted();
      return { flow, run: { validated: false, inconclusive: false } };
    }
  }

  // Probe B: only a request with a query string tells the two targets apart. The documented form first.
  if (decode !== undefined && known.target === undefined) {
    const order: readonly L2Target[] = (["path-with-query", "path-only"] as const).filter((target) => !flow.probeVariantsFailed.includes(`target-${target}`));
    let learned: L2Target | undefined;
    for (const target of order.slice(0, PROBE_B_MAX)) {
      if (failuresLeft() <= 0) break;
      await space();
      const status = await probeGet(env, account, triplet, { ...decode, target, addr }, "/orders", "limit=1", "auth_probe_b");
      if (status === 200) {
        learned = target;
        break;
      }
      if (status === 401) {
        await fail(`target-${target}`);
        continue;
      }
      inconclusive = true;
      break;
    }
    if (learned !== undefined) {
      await recordFact(env, { id: FACT_HMAC_VARIANT, state: "yes", value: formatL2Token({ ...decode, target: learned, addr }), note: `GET /orders?limit=1 accepted the ${learned} target.` });
    }
  }
  await step(env, "validated");
  return { flow, run: { validated, inconclusive } };
}

// ---- the connect lifecycle -------------------------------------------------------------------------------------------------------

interface ConnectInput {
  readonly owner: Address;
  readonly account: Address;
  readonly timestamp: string;
  readonly variant: L1Variant;
  readonly sig65: Hex;
}

interface ConnectResult {
  readonly keyTag: string;
  readonly state: CredentialState;
}

// A pinned variant (selected by a fact rather than the default) is never stepped automatically.
function ladderFor(env: Env, variant: L1Variant): L1Sig[] {
  const fact = env.services.capabilities?.fact(FACT_L1_FORM);
  const pinned = fact !== undefined && fact.state !== "no" && parseL1Variant(fact.value) !== undefined;
  return signatureLadder(variant, pinned);
}

async function recordL1Accepted(env: Env, variant: L1Variant, sig: L1Sig): Promise<void> {
  await recordFact(env, {
    id: FACT_L1_FORM,
    state: "yes",
    value: formatL1Variant({ ...variant, sig }),
    note: `XO accepted an L1 signature in the ${formatL1Variant({ ...variant, sig })} form.`,
  });
}

function l1Refusal(outcome: L1Outcome, forms: readonly L1Sig[]): RelayError {
  switch (outcome.kind) {
    case "signature":
      return new RelayError("upstream_rejected", "XO refused the L1 login signature. The login must be signed again.", { reason: "l1_signature_rejected", forms_tried: [...forms] });
    case "timestamp":
      return new RelayError("upstream_rejected", "XO says the L1 login timestamp is too old or too far ahead. Prepare it again and sign within the deadline.", { reason: "l1_timestamp_rejected" });
    case "failed":
      return outcome.error.kind === "rate_limited" || outcome.error.kind === "requires_key" ? toRelayError(outcome.error) : new RelayError("upstream_rejected", "XO did not answer the L1 request.", { reason: "l1_unreachable", kind: outcome.error.kind });
    case "server":
      return new RelayError("upstream_rejected", "XO answered the L1 request with a server error.", { reason: "l1_server_error", status: outcome.status });
    case "refused":
      return new RelayError("upstream_rejected", "XO refused the L1 request.", { reason: "l1_refused", status: outcome.status });
    case "limit":
      return new RelayError("precondition_failed", "XO says the account already has the maximum number of API keys.", { reason: "key_limit_reached" });
    default:
      return new RelayError("internal", "Unexpected L1 outcome.");
  }
}

// Reads a triplet out of an XO answer; apiKey alone (no secret) is the "derive without secret" shape.
function tripletFromBody(body: unknown): { readonly triplet: HmacTriplet | null; readonly apiKeyOnly: boolean } {
  if (!isRecord(body)) return { triplet: null, apiKeyOnly: false };
  const triplet = HmacTriplet.from(body);
  if (triplet !== null) return { triplet, apiKeyOnly: false };
  const secretMissing = (body["secret"] === undefined || body["secret"] === null || body["secret"] === "") && typeof body["apiKey"] === "string" && HEADER_TOKEN.test(body["apiKey"]);
  return { triplet: null, apiKeyOnly: secretMissing };
}

async function adopt(env: Env, account: string, triplet: HmacTriplet, flow: FlowRecord, outcome: CreateOutcome): Promise<FlowRecord> {
  const core = coreOf(env);
  if (core.secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off.", { reason: "credential_store_off" });
  // A record has to exist before the triplet does, so a crash right after the write can be found and healed.
  await writeFlow(core.state, account, flow, env.now());
  // PERSIST FIRST. Nothing below runs until the triplet is on disk, read back and backed up.
  try {
    await persistTriplet(core.secrets, account, triplet);
  } catch {
    await writeFlow(core.state, account, { ...flow, createOutcome: "unusable" }, env.now()).catch(() => undefined);
    await alert(env, "credential_persist_failed", "critical", `A new XO credential for ${shortAddress(account)} could not be stored. It exists at XO but the relay cannot use or recover it. The relay will not create another.`);
    throw new RelayError("internal", "The credential could not be stored safely, so it was not used.", { reason: "persist_failed" });
  }
  await step(env, "triplet_persisted");
  const next = await writeFlow(core.state, account, { ...flow, state: "stored", keyTag: triplet.tag, createOutcome: outcome }, env.now());
  await step(env, "flow_stored");
  return next;
}

// Everything a submit does after the signature checked out and the item was claimed. Runs under the
// account lock. Returns when the credential is stored (validated or not); throws a RelayError for
// every definite failure.
async function connect(env: Env, input: ConnectInput): Promise<ConnectResult> {
  const core = coreOf(env);
  const { account } = input;
  const secrets = core.secrets;
  if (secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off, so credentials cannot be kept.", { reason: "credential_store_off" });
  let flow = readFlow(core.state, account);

  // 2. A stored triplet ends the story. This is also the crash-after-persist path: heal the record and validate.
  const existing = await readTriplet(secrets, account);
  if (existing !== null) {
    flow = await healFlow(env, account);
    const probed = await runProbes(env, account, existing, flow);
    return finish(existing, probed.flow);
  }
  if (await secrets.has(lower(account), TRIPLET_SECRET_NAME)) {
    // The file exists but does not open or parse: a stored secret that cannot be read must never be replaced silently.
    throw new RelayError("internal", "A stored credential exists but cannot be read. The operator has to restore it from the backup.", { reason: "stored_credential_unreadable" });
  }

  if (flow.limitReached) throw new RelayError("precondition_failed", "XO says the account already has the maximum number of API keys, and none is stored here.", { reason: "key_limit_reached" });
  if (flow.l1Rejections >= L1_REJECTION_LIMIT) throw new RelayError("precondition_failed", "XO refused the L1 login too many times. The relay stopped asking.", { reason: "l1_rejections_exhausted" });

  const ladder = ladderFor(env, input.variant);

  // 3. Derive first, never create first.
  let derived: L1Outcome = { kind: "none" };
  let working: L1Sig = ladder[0] ?? input.variant.sig;
  for (const sig of ladder) {
    working = sig;
    derived = await l1Request(env, "GET", "/auth/derive-api-key", assembleL1Headers({ account: input.account, timestamp: input.timestamp, sig65: input.sig65, variant: input.variant, sig }), "auth_derive");
    if (derived.kind !== "signature") break;
  }
  await step(env, "l1_derive_done");
  if (derived.kind === "signature" || derived.kind === "timestamp") {
    flow = await writeFlow(core.state, account, { ...flow, l1Rejections: flow.l1Rejections + 1 }, env.now());
    if (derived.kind === "signature") {
      await recordFact(env, { id: FACT_L1_FORM, state: "no", note: `XO refused the L1 signature in the ${ladder.join(" and ")} form(s).` });
    }
    if (flow.l1Rejections >= L1_REJECTION_LIMIT) await alert(env, "l1_rejections_exhausted", "warn", `XO refused the L1 login for ${shortAddress(account)} ${L1_REJECTION_LIMIT} times. The relay stopped asking for signatures.`);
    throw l1Refusal(derived, ladder);
  }
  if (derived.kind !== "ok" && derived.kind !== "none") throw l1Refusal(derived, ladder);
  // Any answer past the signature check means XO accepted this form.
  await recordL1Accepted(env, input.variant, working);

  let derivedTriplet: HmacTriplet | null = null;
  if (derived.kind === "ok") {
    const parsed = tripletFromBody(derived.body);
    if (parsed.triplet !== null) {
      derivedTriplet = parsed.triplet;
      await recordFact(env, { id: FACT_DERIVE_SECRET, state: "yes", note: "GET /auth/derive-api-key returned a full triplet." });
    } else if (parsed.apiKeyOnly) {
      await recordFact(env, { id: FACT_DERIVE_SECRET, state: "no", note: "GET /auth/derive-api-key returned a key without its secret." });
    } else {
      // An answer in no known shape could hide an existing key. Creating on top of it is not worth a guess.
      throw new RelayError("upstream_rejected", "XO's derive answer was not in a form the relay knows, so nothing was created.", { reason: "derive_answer_unknown" });
    }
  }

  // A recovery path: a create was started earlier and left no triplet.
  const interrupted = flow.createAttempts >= 1 && (flow.createOutcome === "pending" || flow.createOutcome === "ambiguous" || flow.createOutcome === "unusable");

  if (derivedTriplet !== null) {
    const stored = await adopt(env, account, derivedTriplet, flow, "stored");
    await audit(env, { ev: "upstream", host: "orderbooks.xo.market", account, state: interrupted ? "credential_recovered" : "credential_adopted", outcome: "ok", note: `key ${stored.keyTag ?? ""}` });
    const probed = await runProbes(env, account, derivedTriplet, stored);
    return finish(derivedTriplet, probed.flow);
  }

  // 4. Create, at most once per account.
  if (interrupted) {
    const ageMs = flow.createStartedAtMs === null ? 0 : env.now() - flow.createStartedAtMs;
    if (derived.kind === "ok" || flow.createOutcome === "unusable") {
      flow = await writeFlow(core.state, account, { ...flow, state: "failed" }, env.now());
      await alert(env, "credential_secret_unrecoverable", "critical", `The account ${shortAddress(account)} has an XO API key whose secret the relay does not have and XO will not show again. It cannot be recovered by this relay.`);
      throw new RelayError("precondition_failed", "A key exists at XO but its secret is not stored and XO does not show it again. The relay will not create another key.", { reason: "secret_not_recoverable" });
    }
    if (ageMs < env.settleMs) {
      throw new RelayError("precondition_failed", "An earlier key creation may still be settling. Try again in a minute.", { reason: "create_settling" });
    }
    // derive says no key exists and the earlier request is old: it did not mint one. One create is still allowed.
    flow = await writeFlow(core.state, account, { ...flow, createAttempts: 0, createOutcome: "none", createStartedAtMs: null }, env.now());
  }
  if (flow.createAttempts >= 1) {
    throw new RelayError("precondition_failed", "The relay already made its one key creation for this account.", { reason: "create_already_done" });
  }

  // The marker is durable BEFORE the request leaves: a crash after this line leaves a record that says a key may exist.
  flow = await writeFlow(core.state, account, { ...flow, createAttempts: 1, createOutcome: "pending", createStartedAtMs: env.now() }, env.now());
  await step(env, "create_marker_written");
  const created = await l1Request(env, "POST", "/auth/api-key", assembleL1Headers({ account: input.account, timestamp: input.timestamp, sig65: input.sig65, variant: input.variant, sig: working }), "auth_create");
  await step(env, "create_response_received");

  if (created.kind === "ok") {
    const parsed = tripletFromBody(created.body);
    if (parsed.triplet === null) {
      // A key was minted and the answer is unusable: it can never be used, and must not be created again.
      await writeFlow(core.state, account, { ...flow, createOutcome: "unusable" }, env.now());
      await alert(env, "credential_create_unusable", "critical", `XO minted an API key for ${shortAddress(account)} but the answer did not carry a usable triplet. The relay will not create another.`);
      throw new RelayError("ambiguous", "XO created a key but the answer could not be used. The relay will not create another.", { reason: "create_answer_unusable" });
    }
    const stored = await adopt(env, account, parsed.triplet, flow, "stored");
    await audit(env, { ev: "upstream", host: "orderbooks.xo.market", account, state: "credential_created", outcome: "ok", note: `key ${stored.keyTag ?? ""}` });
    // 5. Does XO show the secret again? The same L1 headers, one more derive. Anything but a clear answer records nothing.
    const again = await l1Request(env, "GET", "/auth/derive-api-key", assembleL1Headers({ account: input.account, timestamp: input.timestamp, sig65: input.sig65, variant: input.variant, sig: working }), "auth_derive");
    if (again.kind === "ok") {
      const second = tripletFromBody(again.body);
      if (second.triplet !== null) {
        await recordFact(env, { id: FACT_DERIVE_SECRET, state: "yes", note: "GET /auth/derive-api-key returned the full triplet after the key was created." });
        if (second.triplet.apiKey === parsed.triplet.apiKey && !second.triplet.sameSecret(parsed.triplet)) {
          await alert(env, "derive_secret_differs", "warn", `Derive returned a different secret for the key the relay created for ${shortAddress(account)}. The stored one is kept.`);
        }
      } else if (second.apiKeyOnly) {
        await recordFact(env, { id: FACT_DERIVE_SECRET, state: "no", note: "GET /auth/derive-api-key returned the key without its secret after creation." });
      }
    }
    const probed = await runProbes(env, account, parsed.triplet, stored);
    return finish(parsed.triplet, probed.flow);
  }

  // Not a success. Decide whether the request can have minted a key.
  const processed = created.kind === "failed" ? created.maybeProcessed : created.kind === "server";
  if (processed) {
    await writeFlow(core.state, account, { ...flow, createOutcome: "ambiguous" }, env.now());
    await alert(env, "credential_create_ambiguous", "critical", `The key creation for ${shortAddress(account)} got no usable answer. A key may exist at XO. The relay will not create another; it will try to recover this one with derive.`);
    await audit(env, { ev: "send_result", account, state: "credential_create_ambiguous", outcome: "ambiguous" });
    throw new RelayError("ambiguous", "The key creation got no usable answer, so a key may exist. The relay will not create another.", { reason: "create_outcome_unknown" });
  }
  // Definitely not processed: the one creation is not spent.
  if (created.kind === "limit") {
    await writeFlow(core.state, account, { ...flow, createAttempts: 0, createOutcome: "limit_reached", createStartedAtMs: null, limitReached: true }, env.now());
    await alert(env, "credential_key_limit", "warn", `XO says ${shortAddress(account)} already has the maximum number of API keys and the relay has none of them.`);
    throw l1Refusal(created, [working]);
  }
  const rejections = created.kind === "signature" || created.kind === "timestamp" ? flow.l1Rejections + 1 : flow.l1Rejections;
  await writeFlow(core.state, account, { ...flow, createAttempts: 0, createOutcome: "none", createStartedAtMs: null, l1Rejections: rejections }, env.now());
  throw l1Refusal(created, [working]);
}

// After probes: a credential XO refused for good is reported, not hidden behind "stored".
function finish(triplet: HmacTriplet, flow: FlowRecord): ConnectResult {
  if (flow.state === "failed") {
    throw new RelayError("upstream_rejected", "The credential was stored but XO refused every HMAC form the relay tried. It will not be probed again.", { reason: "credentials_rejected", key_tag: triplet.tag });
  }
  return { keyTag: triplet.tag, state: flow.state };
}

// ---- resuming validation without a new signature (for modules that need L2) -------------------------------------------------------

export interface CredentialReadiness {
  readonly state: CredentialState;
  readonly keyTag: string | null;
  // The HMAC variant is recorded (OR10) and the credential was accepted at least once.
  readonly ready: boolean;
}

export function credentialReadiness(services: RelayServices, account: string): CredentialReadiness {
  const state = services.state;
  const flow = state === undefined ? EMPTY_FLOW : readFlow(state, account);
  const known = l2KnownFromFacts(services.capabilities);
  return { state: flow.state, keyTag: flow.keyTag, ready: flow.state === "validated" && known.key !== undefined && known.pad !== undefined };
}

// Runs the probes again for a stored, unvalidated credential (a transient failure ended the first run).
// No signature is needed: L2 is HMAC. Returns the readiness afterwards.
export async function ensureCredentialsReady(context: CallContext, account: string, options: CredentialOptions = {}): Promise<CredentialReadiness> {
  const env = envFor(context, options);
  const core = coreOf(env);
  if (core.secrets === undefined) return credentialReadiness(env.services, account);
  const secrets = core.secrets;
  await core.locks.run(`creds:${lower(account)}`, async () => {
    const flow = await healFlow(env, account);
    if (flow.state === "none" || flow.state === "failed") return;
    const known = l2KnownFromFacts(env.services.capabilities);
    if (flow.state === "validated" && known.target !== undefined) return;
    const triplet = await readTriplet(secrets, account);
    if (triplet === null) return;
    await runProbes(env, account, triplet, flow);
  });
  return credentialReadiness(env.services, account);
}

// ---- L2 signing, for the modules that call XO with the user's credentials ------------------------------------------------------

export interface L2SignRequest {
  // The smart account the credential belongs to.
  readonly account: string;
  readonly method: "GET" | "POST" | "DELETE";
  // A path with no query string, such as "/order".
  readonly path: string;
  // The query string without '?'. The design avoids queries on signed requests (note 22 e.3).
  readonly query?: string;
  // The exact bytes that will be sent as the body.
  readonly body?: string;
  // Only the probes pass this.
  readonly variant?: Partial<L2Variant>;
}

// What a signed call needs, and nothing that prints. The headers are handed to the upstream client and
// nowhere else.
export class SignedL2 {
  readonly url: string;
  readonly timestamp: string;
  readonly variant: L2Variant;
  readonly #headers: Record<string, string>;

  constructor(url: string, timestamp: string, variant: L2Variant, headers: Record<string, string>) {
    this.url = url;
    this.timestamp = timestamp;
    this.variant = variant;
    this.#headers = { ...headers };
    Object.freeze(this);
  }

  get headers(): Record<string, string> {
    return { ...this.#headers };
  }

  toJSON(): { readonly url: string; readonly headers: string } {
    return { url: this.url, headers: "[redacted]" };
  }

  [inspect.custom](): string {
    return `SignedL2 { url: ${this.url}, headers: [redacted] }`;
  }
}

function resolveL2Variant(capabilities: CapabilityRegistry | undefined, request: L2SignRequest): L2Variant {
  const known = l2KnownFromFacts(capabilities);
  const key = request.variant?.key ?? known.key;
  const pad = request.variant?.pad ?? known.pad;
  if (key === undefined || pad === undefined) {
    throw new RelayError("capability_unknown", "The HMAC decoding for XO's signed requests is not recorded yet. Connect the account and let the probes run first.", { id: FACT_HMAC_VARIANT });
  }
  const hasQuery = request.query !== undefined && request.query !== "";
  const target = request.variant?.target ?? known.target;
  if (hasQuery && target === undefined) {
    throw new RelayError("capability_unknown", "Whether XO signs the query string is not recorded yet, so a request with a query is not signed.", { id: FACT_HMAC_VARIANT });
  }
  return { key, pad, target: target ?? "path-with-query", addr: request.variant?.addr ?? known.addr ?? "addr-yes" };
}

// Signs one request with the account's stored credential and XO's server time. Pessimistic until the
// facts are recorded: no decoding fact means no signature, and a query string needs the target fact.
// The caller sends the result through the upstream client (never with the request's own abort signal
// for a write: an aborted write is an ambiguous one).
export async function signL2(context: CallContext, request: L2SignRequest, options: CredentialOptions = {}): Promise<SignedL2> {
  const env = envFor(context, options);
  const core = coreOf(env);
  if (core.secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off.", { reason: "credential_store_off" });
  if (request.path.includes("?") || request.path.includes("#")) throw new RelayError("internal", "A signed path carries no query string; pass it as `query`.");
  const flow = readFlow(core.state, request.account);
  if (flow.state === "failed") throw new RelayError("precondition_failed", "The stored XO credential was refused for good. The operator has to look at it.", { reason: "credentials_failed" });
  const triplet = await readTriplet(core.secrets, request.account);
  if (triplet === null) throw new RelayError("precondition_failed", "No XO credential is stored for this account. Connect it first.", { reason: "credentials_missing" });
  const variant = resolveL2Variant(env.services.capabilities, request);
  if (variant.key === "b64url" && !triplet.canDecode()) {
    throw new RelayError("precondition_failed", "The stored secret cannot be used with the recorded HMAC decoding.", { reason: "secret_not_decodable" });
  }
  const timestamp = String(await serverSeconds(env));
  const message = buildL2Message(timestamp, request.method, request.path, request.query, request.body, variant.target);
  const headers = triplet.headers(variant, timestamp, message);
  if (variant.addr === "addr-yes") headers["XO_ADDRESS"] = request.account;
  return new SignedL2(l2UrlOf(request.path, request.query), timestamp, variant, headers);
}

export interface L2CallRequest extends L2SignRequest {
  readonly purpose: string;
  readonly timeoutMs?: number;
  // For reads only. Never for a write.
  readonly signal?: AbortSignal;
}

// Sign and send: the one way another module should make an authenticated XO call.
export async function l2Request(context: CallContext, request: L2CallRequest, options: CredentialOptions = {}): Promise<UpstreamResponse> {
  const { upstream } = coreOf(envFor(context, options));
  const signed = await signL2(context, request, options);
  return upstream.request({
    method: request.method,
    url: signed.url,
    headers: request.body === undefined ? signed.headers : { ...signed.headers, "content-type": "application/json" },
    ...(request.body === undefined ? {} : { body: request.body }),
    purpose: request.purpose,
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
}

// ---- prepare -------------------------------------------------------------------------------------------------------------------------

type PrepareBody = PostRequestParsed<"/v1/auth/prepare">;
type SubmitBody = PostRequestParsed<"/v1/auth/submit">;
type PreparedBody = PostResponseInput<"/v1/auth/prepare">;

const PAYLOAD_VERSION = 1;

interface AuthPayload {
  readonly v: number;
  readonly timestamp: string;
  readonly nonce: string;
  readonly variant: string;
}

function parsePayload(payload: Json): { readonly timestamp: string; readonly variant: L1Variant } {
  if (!isRecord(payload) || payload["v"] !== PAYLOAD_VERSION || payload["nonce"] !== "0") throw new RelayError("internal", "The prepared login record is not in a known form.");
  const timestamp = payload["timestamp"];
  const variant = parseL1Variant(typeof payload["variant"] === "string" ? payload["variant"] : undefined);
  if (typeof timestamp !== "string" || !SERVER_SECONDS.test(timestamp) || variant === undefined) throw new RelayError("internal", "The prepared login record is not in a known form.");
  return { timestamp, variant };
}

// The two digests: the ClobAuth digest and the one the owner signs (wrapped for the Kernel account, or
// the same digest when the Kernel wrapper is off).
export function buildLoginDigests(account: Address, timestamp: string, variant: L1Variant): { readonly inner: Hex; readonly signed: Hex } {
  const inner = hashClobAuth({ address: account, timestamp, nonce: 0n });
  return { inner, signed: variant.wrap === "kernel-on" ? kernelWrapDigest(inner, account) : inner };
}

function authSign(account: Address, timestamp: string, variant: L1Variant, signed: Hex, typedDataPreferred: boolean): PreparedSign {
  if (!typedDataPreferred) {
    return { intent: { op: "raw", rawSigningPayloadHex: signed }, expected_digest: signed, digest_form: "kernelWrappedClobAuth" };
  }
  let typed: TypedData;
  if (variant.wrap === "kernel-on") {
    typed = typedDataSchema.parse(JSON.parse(JSON.stringify(buildClobAuthKernelTypedData({ address: account, timestamp, nonce: 0n }))));
  } else {
    typed = typedDataSchema.parse({
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
        ],
        ClobAuth: [
          { name: "address", type: "address" },
          { name: "timestamp", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "message", type: "string" },
        ],
      },
      primaryType: "ClobAuth",
      domain: { name: CLOB_AUTH_DOMAIN_NAME, version: CLOB_AUTH_DOMAIN_VERSION, chainId: XO_CHAIN_ID },
      message: { address: account, timestamp, nonce: 0, message: CLOB_AUTH_MESSAGE },
    });
  }
  return { intent: { op: "typedData", typedData: typed }, expected_digest: signed, digest_form: "kernelWrappedClobAuth" };
}

async function dayRemainingUsd(services: RelayServices, account: string): Promise<string> {
  const config: RelayConfig | undefined = services.config;
  const ledger: DurableLedger | undefined = services.ledger;
  if (config === undefined) return "0";
  try {
    const spent = ledger === undefined ? 0n : (await ledger.usageDetail(lower(account))).spentAtomic;
    const left = config.limits.maxDailyAtomic - spent;
    return formatMicro(left < 0n ? 0n : left);
  } catch {
    return "0";
  }
}

async function prepareAuth(body: PrepareBody, context: RelayContext, options: CredentialOptions): Promise<PreparedBody> {
  guardWrite(context, CONNECT_FLAG);
  const env = envFor(context, options);
  const core = coreOf(env);
  const prepared = env.services.prepared;
  if (prepared === undefined) throw new RelayError("internal", "The relay service \"prepared\" is not available.");
  if (core.secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off, so the relay cannot keep XO credentials.", { reason: "credential_store_off" });

  let owner: Address;
  let account: Address;
  try {
    owner = parseOwner(body.owner);
    account = requireDerivedAccount(owner, body.account);
  } catch (error) {
    return mapAccountError(error);
  }

  const flow = await core.locks.run(`creds:${lower(account)}`, () => healFlow(env, account));
  if (flow.state === "failed") throw new RelayError("precondition_failed", "The stored XO credential was refused for good. The operator has to look at it.", { reason: "credentials_failed" });
  if (flow.state === "stored" || flow.state === "validated" || (await core.secrets.has(lower(account), TRIPLET_SECRET_NAME))) {
    throw new RelayError("precondition_failed", "XO credentials are already stored for this account, so no new login signature is needed.", { reason: "credentials_already_stored", key_tag: flow.keyTag });
  }
  if (flow.limitReached) throw new RelayError("precondition_failed", "XO says the account already has the maximum number of API keys, and none is stored here.", { reason: "key_limit_reached" });
  if (flow.l1Rejections >= L1_REJECTION_LIMIT) throw new RelayError("precondition_failed", "XO refused the L1 login too many times. The relay stopped asking for signatures.", { reason: "l1_rejections_exhausted" });
  // A key may exist at XO whose secret was lost. Only derive can bring it back, and only if XO re-sends
  // secrets; when that is recorded as no, another signature would buy nothing.
  const lostKey = flow.createAttempts >= 1 && (flow.createOutcome === "pending" || flow.createOutcome === "ambiguous" || flow.createOutcome === "unusable");
  if (lostKey && env.services.capabilities?.state(FACT_DERIVE_SECRET) === "no") {
    throw new RelayError("precondition_failed", "A key was created for this account but its secret is not stored, and XO does not show secrets again. It cannot be recovered by this relay.", { reason: "secret_not_recoverable" });
  }

  // L1 is verified by ERC-1271 on the account, which needs code (AU6): positive proof of deployment only.
  const snapshot = await readAccountSnapshot(core.upstream, owner, account, {
    deploymentOnly: true,
    signal: context.signal,
    timeoutMs: env.timeoutMs,
    ...(options.rpcUrl === undefined ? {} : { rpcUrl: options.rpcUrl }),
  });
  const gate = gateConnect(snapshot.result);
  if (!gate.allowed) {
    throw new RelayError("precondition_failed", gate.message, { reason: gate.code === "undeployed" ? "account_not_deployed" : "account_state_unknown" });
  }

  const variant = selectL1Variant(env.services.capabilities);
  const seconds = await serverSeconds(env, { fresh: true, signal: context.signal });
  const timestamp = String(seconds);
  const { signed } = buildLoginDigests(account, timestamp, variant);
  const typedData = env.services.capabilities?.state(FACT_PAYBOX_TYPED_DATA) !== "no";
  const sign = authSign(account, timestamp, variant, signed, typedData);

  const record = await prepared.create({
    kind: "auth",
    owner,
    account,
    digest: signed,
    digestForm: "kernelWrappedClobAuth",
    payload: { v: PAYLOAD_VERSION, timestamp, nonce: "0", variant: formatL1Variant(variant) } satisfies AuthPayload,
    ttlS: AUTH_PREPARED_TTL_S,
  });

  const wrapped = variant.wrap === "kernel-on";
  const lines = [
    "Connect your XO smart account: sign a ClobAuth login. This is not a payment and moves no funds.",
    `Account ${shortAddress(account)}, owner ${shortAddress(owner)}.`,
    wrapped ? "The login is signed through your Kernel smart account (Kernel-wrapped digest)." : "The login is signed as a plain ClobAuth digest (no Kernel wrapper).",
    "The relay uses it to fetch or create your XO API key once, and keeps that key encrypted. It never shows it to anyone.",
    `Sign within ${AUTH_PREPARED_TTL_S} seconds: XO accepts the login for about two minutes.`,
    SAFETY_NOTICES.digestTag,
  ];
  const warnings = [
    "Whoever can sign this login can also create XO API keys for this account.",
    SAFETY_NOTICES.approvalMode,
    SAFETY_NOTICES.dedicatedCredential,
    SAFETY_NOTICES.advisoryCaps,
  ];
  return {
    prepared_id: record.id,
    kind: "auth",
    owner,
    account,
    expires_at: isoSecondOf(record.expiresAtMs),
    sign,
    summary: { lines, digest_tag: digestTag(signed) },
    caps: { reserved_usd: "0", day_remaining_usd: await dayRemainingUsd(env.services, account) },
    capabilities: env.services.capabilities?.snapshot([FACT_DERIVE_SECRET, FACT_L1_FORM, FACT_HMAC_VARIANT, FACT_PAYBOX_TYPED_DATA]) ?? {},
    warnings,
  };
}

// ---- submit ---------------------------------------------------------------------------------------------------------------------------

async function submitAuth(body: SubmitBody, context: RelayContext, options: CredentialOptions): Promise<PostResponseInput<"/v1/auth/submit">> {
  await guardSubmit(context, CONNECT_FLAG);
  const env = envFor(context, options);
  const core = coreOf(env);
  const prepared = env.services.prepared;
  if (prepared === undefined) throw new RelayError("internal", "The relay service \"prepared\" is not available.");
  if (core.secrets === undefined) throw new RelayError("precondition_failed", "The credential store is off, so the relay cannot keep XO credentials.", { reason: "credential_store_off" });

  const record: PreparedRecord = prepared.require(body.prepared_id);
  if (record.kind !== "auth") throw new RelayError("not_found", "No such login to submit (it may have expired or never existed).");

  // Invariants 1 and 3: the account is the one derived from the owner, and the digest is recomputed from the
  // stored fields, never taken from the record or the caller. A signature is only looked at while the item
  // is still unspent; a spent or expired one gets its own error from beginSend below.
  let owner: Address;
  let account: Address;
  try {
    owner = parseOwner(record.owner);
    account = requireDerivedAccount(owner, record.account);
  } catch (error) {
    return mapAccountError(error);
  }
  const { timestamp, variant } = parsePayload(record.payload);
  const { signed } = buildLoginDigests(account, timestamp, variant);
  if (signed.toLowerCase() !== record.digest.toLowerCase()) throw new RelayError("internal", "The prepared login no longer matches its digest, so nothing was sent.");

  let sig65: Hex | undefined;
  if (record.state === "prepared") {
    if (env.now() >= record.expiresAtMs) throw new RelayError("expired", "This login expired. Prepare it again and sign within the deadline.");
    const verified = await verifyDigestSignature({ userOpHash: signed, signature: body.signature, expectedOwner: owner });
    if (!verified.ok) {
      await prepared.noteFailedAttempt(record.id);
      await audit(env, { ev: "refused", account, preparedId: record.id, state: "login_signature_refused", code: verified.code, outcome: "refused" });
      if (verified.code === "owner_mismatch") throw new RelayError("owner_mismatch", "The signature is not from the owner of this account.");
      if (verified.code === "signature_invalid") throw new RelayError("signature_invalid", "The signature is not a valid 65-byte signature.");
      throw new RelayError("invalid_request", "The signature could not be checked.");
    }
    sig65 = verified.signature;
  }

  // One claim per prepared item. The marker is on disk before any request leaves.
  await prepared.beginSend(record.id);
  if (sig65 === undefined) throw new RelayError("internal", "A claimed login has no verified signature.");
  const verifiedSignature: Hex = sig65;

  try {
    const result = await core.locks.run(`creds:${lower(account)}`, () => connect(env, { owner, account, timestamp, variant, sig65: verifiedSignature }));
    await prepared.resolve(record.id, "accepted", "credentials_stored");
    return { credentials: "stored", key_tag: result.keyTag };
  } catch (error) {
    if (isRelayError(error)) {
      const outcome = error.code === "ambiguous" ? "ambiguous" : "rejected";
      await prepared.resolve(record.id, outcome, outcome === "ambiguous" ? "create_outcome_unknown" : "login_refused").catch(() => undefined);
    } else {
      await prepared.resolve(record.id, "ambiguous", "unexpected_failure").catch(() => undefined);
    }
    throw error;
  }
}

// ---- the routes -------------------------------------------------------------------------------------------------------------------------

export function createCredentialRoutes(options: CredentialOptions = {}): RouteTable {
  return {
    "POST /v1/auth/prepare": (body, context) => prepareAuth(body, context, options),
    "POST /v1/auth/submit": (body, context) => submitAuth(body, context, options),
  };
}

export const routes: RouteTable = createCredentialRoutes();
