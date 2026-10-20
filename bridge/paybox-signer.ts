import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

import type { FlagName } from "../src/relay/flags.js";
import {
  checkPreparedSign,
  digestTag,
  preparedSignSchema,
  signatureInputSchema,
  toPayboxIntent,
  type PayboxIntentOptions,
  type PayboxSignIntent,
  type PreparedKind,
  type PreparedSign,
} from "../src/relay/contract.js";
import { requireDerivedAccount } from "../src/xo/account/derive.js";
import type { Address, Hex } from "../src/xo/chain/constants.js";
import { verifyDigestSignature } from "../src/xo/userop/verify.js";
import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { armControllerOf, writeFlagsOf } from "./arming.js";
import { inboxPreparedSchema, inboxSignRequestSchema, inboxSignResponseSchema, isBridgeErrorCode, type BridgeErrorCode, type InboxState } from "./contract.js";
import { inboxOf } from "./inbox.js";
import { killControllerOf } from "./kill.js";
import { defineRoute, fail, json, type BridgeModule, type BridgeModuleFactory, type DaemonHost, type FailureBody, type RouteResult } from "./server.js";
import { createInProcessToolRunner, toolGateOf, type ToolRunner } from "./tool-classes.js";
import type { Principal } from "./auth.js";

// Path S2: the daemon is itself a PayBox client (docs/dapp-design.md 3.3, 5.3, 5.5 R8, 7.2 M5-3 and M5-4, work
// package D5). FLAG OFF by default. Nothing in this file runs until an operator turns it on, and nothing here is
// reachable from the page: `POST /ui/inbox/sign` is an agent-token route (bridge/tool-classes.ts ROUTE_RULES) that
// also needs the submit scope and an open ARM window.
//
// WHAT IT DOES, once, for one prepared item that is already in the inbox and whose card the user has been shown:
//   1. checks the item again, itself, from the stored relay record (`vetForSigning`, below). The check is not
//      "the inbox said verified": it is the same pure code the card uses, run here, plus the refusals that belong
//      to signing (only a `raw` or `typedData` intent, only the kinds the Cockpit offers, and an intent that hashes
//      to the digest the relay will check the signature against);
//   2. reads the credential's grant from PayBox and requires approval mode `always_approve` (M5-4) and that its
//      address is the item's owner;
//   3. asks PayBox to sign exactly `toPayboxIntent(sign)` and waits for the user's passkey approval in the PayBox
//      app (`--wait`; the daemon never sees a passkey);
//   4. recovers the signer from the answer over `expected_digest` and requires it to be the owner. A signature that
//      does not recover to the owner is dropped here, before anything else can see it;
//   5. hands the canonical 65-byte signature to the submit port (by default the plugin's own submit tools through
//      the tool gate, so the ARM window, the kill switch, the rate limits and the once-only ledger all apply) and
//      never to the page, the audit log or a response body.
//
// WHAT IT NEVER DOES. It takes no intent, digest or text from the request (the request is a prepared_id and
// nothing else). It signs no `message`, `transaction`, `authorization` or any other op. It does not read PayBox's
// config directory, token or key files, and it keeps nothing on disk. Its audit records carry the 8-character
// prepared id, the two tags, the token id, a fixed result word and the first 12 characters of a PayBox request
// reference, never a signature, key or token. It never spawns a shell; the only process it starts is the
// configured PayBox binary, with an argument array and an allowlisted environment.
//
// WHAT THE OPERATOR MUST HAVE SEEN BEFORE TURNING IT ON (the conditions are data: S2_ENABLE_CONDITIONS, below, and
// `ENABLE_PAYBOX_SIGNER=1` is not enough on its own; `PAYBOX_SIGNER_ACK_DT=DT1,DT3` states that both live tests
// were run and recorded). DT1 and DT3 are in docs/dapp-design.md 7.5. Until they are, nothing here is known to
// work with the real PayBox: the CLI's output shape and its credential listing are GUESSES, written to fail closed.

// ---- configuration ---------------------------------------------------------------------------------------------------

export const S2_FLAG = "ENABLE_PAYBOX_SIGNER";
export const S2_ACK_ENV = "PAYBOX_SIGNER_ACK_DT";
export const S2_ACK_VALUE = "DT1,DT3";
// The daemon's own PayBox client directory. Required, absolute, and not shared with any other PayBox client: the
// 30-day refresh token rotates on every use and replaying a rotated token revokes the client, so exactly one
// process may use it (docs/dapp-design.md 3.3).
export const S2_CONFIG_DIR_ENV = "PAYBOX_CONFIG_DIR";
export const S2_CREDENTIAL_ENV = "PAYBOX_SIGNER_CREDENTIAL";
export const S2_BIN_ENV = "PAYBOX_BIN";

export const S2_REQUIRED_ENV = [S2_CONFIG_DIR_ENV, S2_CREDENTIAL_ENV] as const;

export interface EnableCondition {
  readonly id: string;
  readonly test: "DT1" | "DT3";
  // What the recorded test result must show before the flag is turned on.
  readonly mustShow: string;
  // What in this file changes if the result is different from the assumption written here.
  readonly ifDifferent: string;
}

export const S2_ENABLE_CONDITIONS: readonly EnableCondition[] = Object.freeze([
  {
    id: "dt1_raw_allowed",
    test: "DT1",
    mustShow:
      "check_operation_readiness reports `raw` available to the dedicated credential's grant for a 32-byte digest, and a `raw` sign over one digest completes. PayBox's docs call `raw` an escape hatch; whether a grant can permit it is NOT FOUND. Every userop and ClobAuth item is signed as `raw`.",
    ifDifferent: "If `raw` is refused, S2 cannot sign user operations or the XO login. A `message` fallback for user operations is not implemented here and would need its own review.",
  },
  {
    id: "dt1_typed_data_allowed",
    test: "DT1",
    mustShow: "A `typedData` sign of a Kernel-wrapped order (chain id 3223) completes, and the signature recovers to the credential's address over hashTypedData of that typed data.",
    ifDifferent: "If typed data for chain 3223 is refused, orders cannot be signed by S2; the item kind `order` must then be taken out of S2_ALLOWED_KINDS.",
  },
  {
    id: "dt1_output_shape",
    test: "DT1",
    mustShow: "The signature shape (65 bytes, or r and s with v or a recovery id), how a 0x prefix is handled, whether the result is high-s, and whether signing the same digest twice recovers to the same signer.",
    ifDifferent: "normalizeSignature accepts the three documented shapes and flips high-s; anything else is refused as paybox_output_invalid. Set rawHexPrefix to `none` in createSignerModule if PayBox wants the digest without 0x.",
  },
  {
    id: "dt1_signature_form",
    test: "DT1",
    mustShow:
      "Which digest the signature recovers over for a `raw` intent: the digest itself (form `raw`) or its EIP-191 wrapping (form `eip191`). This adapter accepts either for a raw intent and reports it, and requires form `raw` for a typedData intent.",
    ifDifferent: "If PayBox always applies the EIP-191 prefix to `raw`, the relay's validator must accept that form for orders and logins too, which is a separate finding (UO1).",
  },
  {
    id: "dt1_grant_limits",
    test: "DT1",
    mustShow: "Whether any threshold or policy applies to wallet-sign intents on the grant, and what the approval screen shows for a raw digest and for typed data (this fixes the two-tag wording, M4-12).",
    ifDifferent: "Wording only; no code here depends on it.",
  },
  {
    id: "dt3_login_and_pairing",
    test: "DT3",
    mustShow: "`paybox login` (device code) and `paybox connect` (pbxk1 key pairing) complete in a separate PAYBOX_CONFIG_DIR, with only the dedicated credential granted, in mode always_approve.",
    ifDifferent: "No S2: the daemon cannot act as a PayBox client, and S1 (the agent signs) stays the only path.",
  },
  {
    id: "dt3_sign_command",
    test: "DT3",
    mustShow:
      "`paybox sign --credential <id> --intent '<json>' --wait` completes under always_approve for `message`, then `raw` and `typedData`, and the exact stdout shape. parseSignOutput is a guess (JSON with a `signature`, `result.signature` or r/s/v, or a bare 0x hex); replace it with the recorded shape. Also whether a `--json` flag is needed.",
    ifDifferent: "Until the recorded shape is wired in, any other output is refused as paybox_output_invalid and nothing is sent.",
  },
  {
    id: "dt3_credential_listing",
    test: "DT3",
    mustShow:
      "The CLI command that lists the client's credentials with their approval_mode and address, and its output. The default argv (credentials list --json) and the field names (credential_id or id, approval_mode, address) are GUESSES; a different real shape makes S2 refuse every request (credential_unreadable), which is safe.",
    ifDifferent: "Change CREDENTIAL_LIST_ARGV and parseCredentials to the recorded command and fields.",
  },
  {
    id: "dt3_failure_modes",
    test: "DT3",
    mustShow: "What a declined approval, an expired approval and a revoked client look like (exit code and stdout), so they can be told apart from a missing binary.",
    ifDifferent: "Every non-zero exit is paybox_failed today; a decline is only recognised if the JSON output says so.",
  },
  {
    id: "dt3_single_process",
    test: "DT3",
    mustShow: "Two processes on one PAYBOX_CONFIG_DIR confirm the single-process rule (the rotating refresh token). This adapter serialises its own calls and the daemon owns the data directory alone; nothing else may use the directory.",
    ifDifferent: "If a lock is needed, it belongs in the PayBox config directory, which this file never touches.",
  },
  {
    id: "dt3_api_key_variant",
    test: "DT3",
    mustShow: "Whether a personal API key (pbx_live_...) can drive `sign --wait` without the pbxk1 pairing, with what scope, and without the rotation hazard.",
    ifDifferent: "Only the login step in the runbook changes; this adapter never reads either secret.",
  },
]);

// What the Cockpit may ask S2 to sign. `create` (a new market) is not offered: the creation UI is not shipped (O5).
export const S2_ALLOWED_KINDS = ["userop", "order", "auth"] as const satisfies readonly PreparedKind[];
export const S2_ALLOWED_OPS = ["raw", "typedData"] as const;

// The relay's write flag that the matching submit needs; signing for a path that is switched off wastes an approval.
const SUBMIT_FLAG: Readonly<Record<(typeof S2_ALLOWED_KINDS)[number], FlagName>> = Object.freeze({
  userop: "ENABLE_USEROP_SUBMIT",
  order: "ENABLE_TRADING",
  auth: "ENABLE_TRADING",
});

// The least life an item may have left when PayBox is asked, and when the signature is back and about to be sent.
// An order needs at least 90 s at submit (phase1-gap-closing 5.2); the start margin adds a minute for the approval.
// An XO login lives about 90 s in all. Design choices (L), not measured.
export const START_MARGIN_MS: Readonly<Record<(typeof S2_ALLOWED_KINDS)[number], number>> = Object.freeze({ userop: 45_000, order: 150_000, auth: 45_000 });
export const SUBMIT_MARGIN_MS: Readonly<Record<(typeof S2_ALLOWED_KINDS)[number], number>> = Object.freeze({ userop: 10_000, order: 90_000, auth: 15_000 });
// Each PayBox request costs the user a passkey prompt, so a compromised agent must not be able to spam them.
export const MAX_REQUESTS_PER_ITEM = 3;
export const MAX_REQUESTS_PER_WINDOW = 10;
export const REQUEST_WINDOW_MS = 10 * 60 * 1000;

const TRUTHY = new Set(["1", "true", "yes", "on"]);
type Env = Readonly<Record<string, string | undefined>>;

// Anything that is not a recognised "on" word is off, like every other flag.
export function s2FlagOn(env: Env): boolean {
  const raw = env[S2_FLAG];
  return typeof raw === "string" && TRUTHY.has(raw.trim().toLowerCase());
}

export function s2Acknowledged(env: Env): boolean {
  const raw = env[S2_ACK_ENV];
  if (typeof raw !== "string") return false;
  const words = raw
    .split(",")
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word !== "");
  const wanted = S2_ACK_VALUE.split(",");
  return words.length === wanted.length && wanted.every((word) => words.includes(word));
}

const CREDENTIAL_ID = /^[A-Za-z0-9_-]{4,64}$/;
const BIN_PATTERN = /^[A-Za-z0-9._/\\:-]{1,200}$/;

export interface SignerReadiness {
  readonly flag: boolean;
  readonly acknowledged: boolean;
  // Names of the environment variables that are missing or malformed (never their values).
  readonly missing: readonly string[];
  readonly ready: boolean;
}

export function signerReadiness(env: Env): SignerReadiness {
  const missing: string[] = [];
  const dir = env[S2_CONFIG_DIR_ENV];
  if (typeof dir !== "string" || dir.trim() === "" || !isAbsolute(dir.trim()) || dir.includes("\0")) missing.push(S2_CONFIG_DIR_ENV);
  const credential = env[S2_CREDENTIAL_ENV];
  if (typeof credential !== "string" || !CREDENTIAL_ID.test(credential.trim())) missing.push(S2_CREDENTIAL_ENV);
  const bin = env[S2_BIN_ENV];
  if (bin !== undefined && bin.trim() !== "" && !BIN_PATTERN.test(bin.trim())) missing.push(S2_BIN_ENV);
  const flag = s2FlagOn(env);
  const acknowledged = s2Acknowledged(env);
  return { flag, acknowledged, missing, ready: flag && acknowledged && missing.length === 0 };
}

// ---- vetting: the only way to get something the signing path will sign ------------------------------------------------------

export type VetReason =
  | "item_invalid"
  | "op_not_allowed"
  | "kind_not_allowed"
  | "sign_invalid"
  | "intent_digest_mismatch"
  | "not_verified"
  | "verification_mismatch"
  | "account_mismatch"
  | "expired";

export interface VetRefusal {
  readonly ok: false;
  readonly reason: VetReason;
  // A path inside the item, or a fixed word; never item text.
  readonly field?: string;
}

export interface VettedForSigning {
  readonly preparedId: string;
  readonly kind: (typeof S2_ALLOWED_KINDS)[number];
  readonly owner: Address;
  readonly account: Address;
  readonly op: (typeof S2_ALLOWED_OPS)[number];
  readonly sign: PreparedSign;
  // Exactly what PayBox is asked to sign: the output of toPayboxIntent, nothing else.
  readonly intent: PayboxSignIntent;
  readonly expectedDigest: Hex;
  readonly digestTag: string;
  readonly innerTag: string | undefined;
  readonly expiresAtMs: number;
  readonly covered: readonly string[];
  readonly unbound: readonly string[];
}

export type VetResult = { readonly ok: true; readonly vetted: VettedForSigning } | VetRefusal;

// Objects made by vetForSigning and by nothing else. The path refuses anything that is not in here, so a caller
// cannot hand it an intent it built itself.
const VETTED = new WeakSet<object>();

const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_.[\]]{0,79}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refuse(reason: VetReason, field?: string): VetRefusal {
  return field !== undefined && FIELD_PATH.test(field) ? { ok: false, reason, field } : { ok: false, reason };
}

export interface VetOptions {
  readonly nowMs: number;
  readonly intentOptions?: PayboxIntentOptions;
}

// Pure. `item` is untrusted (it comes from a stored record that a relay, a tool or a page may have shaped); every
// check below runs on it again whatever the inbox concluded earlier.
export function vetForSigning(item: unknown, options: VetOptions): VetResult {
  if (!isRecord(item)) return refuse("item_invalid", "item");
  // The op and the kind come first, from the raw item, so the refusal names the real reason instead of a schema issue.
  const rawSign = item["sign"];
  const rawIntent = isRecord(rawSign) ? rawSign["intent"] : undefined;
  const op = isRecord(rawIntent) ? rawIntent["op"] : undefined;
  if (op !== "raw" && op !== "typedData") return refuse("op_not_allowed", "sign.intent.op");
  const kind = item["kind"];
  if (typeof kind !== "string" || !(S2_ALLOWED_KINDS as readonly string[]).includes(kind)) return refuse("kind_not_allowed", "kind");
  const allowedKind = kind as (typeof S2_ALLOWED_KINDS)[number];

  const sign = preparedSignSchema.safeParse(rawSign);
  if (!sign.success) return refuse("sign_invalid", "sign");
  const hashes = checkPreparedSign(sign.data);
  if (!hashes.ok) return refuse("intent_digest_mismatch", "sign.intent");

  const parsed = inboxPreparedSchema.safeParse(item);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return refuse("item_invalid", first === undefined ? "item" : first.path.map(String).join("."));
  }
  const prepared = parsed.data;

  // The same rebuild the card runs. Only a full match passes: no decoded block ("not derivable") is refused too.
  const verdict = verifyPreparedLocal(item);
  if (!verdict.ok) return verdict.status === "not_derivable" ? refuse("not_verified", verdict.field) : refuse("verification_mismatch", verdict.field);

  try {
    requireDerivedAccount(prepared.owner, prepared.account);
  } catch {
    return refuse("account_mismatch", "account");
  }

  const expiresAtMs = Date.parse(prepared.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs - options.nowMs < START_MARGIN_MS[allowedKind]) return refuse("expired", "expires_at");

  let intent: PayboxSignIntent;
  try {
    intent = toPayboxIntent(sign.data, options.intentOptions);
  } catch {
    return refuse("intent_digest_mismatch", "sign.intent");
  }
  const vetted: VettedForSigning = Object.freeze({
    preparedId: prepared.prepared_id,
    kind: allowedKind,
    owner: prepared.owner as Address,
    account: prepared.account as Address,
    op,
    sign: sign.data,
    intent,
    expectedDigest: sign.data.expected_digest.toLowerCase() as Hex,
    digestTag: digestTag(sign.data.expected_digest),
    innerTag: prepared.summary.inner_hash_tag,
    expiresAtMs,
    covered: verdict.covered,
    unbound: verdict.unbound,
  });
  VETTED.add(vetted);
  return { ok: true, vetted };
}

// ---- the PayBox client port ---------------------------------------------------------------------------------------------------

export const CLIENT_FAILURES = ["paybox_missing", "paybox_timeout", "paybox_failed", "paybox_declined", "paybox_output_invalid", "credential_unreadable", "aborted"] as const;
export type ClientFailureCode = (typeof CLIENT_FAILURES)[number];
export interface ClientFailure {
  readonly ok: false;
  readonly code: ClientFailureCode;
}

export interface ClientCredential {
  readonly ok: true;
  // As PayBox reports it ("always_approve", "autonomous", "iframe", ...). Compared exactly.
  readonly approvalMode: string | null;
  readonly address: string | null;
}

export interface ClientSigned {
  readonly ok: true;
  // Whatever PayBox returned; the path validates it.
  readonly signature: unknown;
  readonly requestRef?: string;
}

// The seam between this file and PayBox. The shipped implementation spawns the CLI (createPayboxCliClient). A test
// passes a fake; no test calls PayBox. An SDK-based client would implement the same two methods.
export interface PayboxClient {
  credential(credentialId: string, signal: AbortSignal): Promise<ClientCredential | ClientFailure>;
  sign(request: { readonly credentialId: string; readonly intent: PayboxSignIntent; readonly timeoutMs: number }, signal: AbortSignal): Promise<ClientSigned | ClientFailure>;
}

// ---- the signing path -----------------------------------------------------------------------------------------------------------

export const SIGNING_FAILURES = [
  ...CLIENT_FAILURES,
  "not_vetted",
  "credential_not_always_approve",
  "credential_owner_mismatch",
  "signature_invalid",
  "owner_mismatch",
  "form_not_allowed",
] as const;
export type SigningFailureCode = (typeof SIGNING_FAILURES)[number];

export type SigningResult =
  | {
      readonly ok: true;
      // Canonical 65 bytes (v 27 or 28, low s) that recovers to the owner over the item's digest.
      readonly signature: Hex;
      readonly form: "raw" | "eip191";
      readonly requestRef: string | undefined;
      readonly rewroteV: boolean;
      readonly flippedHighS: boolean;
    }
  | { readonly ok: false; readonly code: SigningFailureCode; readonly requested: boolean };

export interface SignOptions {
  readonly credentialId: string;
  // The longest the user has to approve. PayBox is not asked to wait longer than this.
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  // Called once, just before PayBox is asked to sign (never when the credential check refuses).
  readonly onRequest?: () => void;
}

export interface SigningPath {
  readonly id: string;
  sign(vetted: VettedForSigning, options: SignOptions): Promise<SigningResult>;
}

const REF_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const REF_SECRET_PREFIX = /^(?:pbxk1|pbx_|sk-|qt_|bearer|ghp_|xox)/i;
export function cleanRequestRef(value: unknown): string | undefined {
  return typeof value === "string" && REF_PATTERN.test(value) && !REF_SECRET_PREFIX.test(value) ? value : undefined;
}

// Calls to the client run one at a time: the client's token rotates on every use, so two concurrent uses of one
// config directory could revoke it.
class Serial {
  #tail: Promise<unknown> = Promise.resolve();
  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.#tail.then(task, task);
    this.#tail = next.catch(() => undefined);
    return next;
  }
}

export class PayboxSigningPath implements SigningPath {
  readonly id = "paybox_client";
  readonly #client: PayboxClient;
  readonly #serial = new Serial();

  constructor(client: PayboxClient) {
    this.#client = client;
  }

  sign(vetted: VettedForSigning, options: SignOptions): Promise<SigningResult> {
    return this.#serial.run(() => this.#sign(vetted, options));
  }

  async #sign(vetted: VettedForSigning, options: SignOptions): Promise<SigningResult> {
    const refused = (code: SigningFailureCode, requested = false): SigningResult => ({ ok: false, code, requested });
    // Only what vetForSigning made. Also re-checks the two facts this path exists to enforce, in case a vetted
    // object was ever built some other way.
    if (!VETTED.has(vetted)) return refused("not_vetted");
    if ((vetted.op !== "raw" && vetted.op !== "typedData") || vetted.intent.op !== vetted.op) return refused("not_vetted");
    if (!checkPreparedSign(vetted.sign).ok) return refused("not_vetted");
    if (options.signal.aborted) return refused("aborted");

    const credential = await this.#guard(() => this.#client.credential(options.credentialId, options.signal));
    if (!credential.ok) return refused(credential.code);
    // M5-4: S2 runs on a credential in always_approve and on no other mode ("autonomous" and "iframe" included).
    if (credential.approvalMode !== "always_approve") return refused("credential_not_always_approve");
    // An unknown address is refused as well: a wrong credential would cost the user an approval for nothing.
    if (typeof credential.address !== "string" || credential.address.toLowerCase() !== vetted.owner.toLowerCase()) return refused("credential_owner_mismatch");
    if (options.signal.aborted) return refused("aborted");

    options.onRequest?.();
    const answer = await this.#guard(() => this.#client.sign({ credentialId: options.credentialId, intent: vetted.intent, timeoutMs: options.timeoutMs }, options.signal));
    if (!answer.ok) return refused(answer.code, true);

    // Recover the signer over the digest the relay will check, and require the owner. Nothing leaves this method
    // unless it passed.
    const checked = await verifyDigestSignature({ userOpHash: vetted.expectedDigest, signature: answer.signature, expectedOwner: vetted.owner });
    if (!checked.ok) return refused(checked.code === "owner_mismatch" ? "owner_mismatch" : "signature_invalid", true);
    // A typed-data signature is over the EIP-712 digest itself. The EIP-191 form is only conceivable for `raw`.
    if (vetted.op === "typedData" && checked.form !== "raw") return refused("form_not_allowed", true);
    return {
      ok: true,
      signature: checked.signature,
      form: checked.form,
      requestRef: cleanRequestRef(answer.requestRef),
      rewroteV: checked.rewroteV,
      flippedHighS: checked.flippedHighS,
    };
  }

  // A client that throws is a failed client: the error text is never kept (it could hold anything).
  async #guard<T extends ClientCredential | ClientSigned | ClientFailure>(call: () => Promise<T>): Promise<T | ClientFailure> {
    try {
      return await call();
    } catch {
      return { ok: false, code: "paybox_failed" };
    }
  }
}

// ---- the CLI client -------------------------------------------------------------------------------------------------------------

export interface CliCommand {
  readonly bin: string;
  readonly args: readonly string[];
}
export interface CliRunOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly signal: AbortSignal;
}
export type CliRun =
  | { readonly kind: "exit"; readonly code: number | null; readonly stdout: string; readonly truncated: boolean }
  | { readonly kind: "timeout" }
  | { readonly kind: "aborted" }
  | { readonly kind: "spawn_failed"; readonly missing: boolean };
export type CliRunner = (command: CliCommand, options: CliRunOptions) => Promise<CliRun>;

export const MAX_CLI_STDOUT_BYTES = 64 * 1024;
// Environment variables the child may see. Everything else, including the vault master key, the relay key and any
// NODE_OPTIONS, stays behind. HOME is deliberately absent: PAYBOX_CONFIG_DIR says where the client lives.
const CHILD_ENV_KEYS = ["PATH", "LANG", "LC_ALL", "TZ", "TMPDIR", "TEMP", "TMP", "SystemRoot", "ComSpec", "PATHEXT"] as const;

export function childEnvFor(base: Env, configDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CHILD_ENV_KEYS) {
    const value = base[key];
    if (typeof value === "string" && !value.includes("\0")) out[key] = value;
  }
  out[S2_CONFIG_DIR_ENV] = configDir;
  out["NO_COLOR"] = "1";
  return out;
}

// Spawns with an argument array, no shell, no stdin, and kills the process on timeout, abort or too much output.
// The child's stderr is read and thrown away: it may say anything, and nothing here depends on it.
export const defaultCliRunner: CliRunner = (command, options) =>
  new Promise<CliRun>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command.bin, [...command.args], { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...options.env }, windowsHide: true });
    } catch {
      resolve({ kind: "spawn_failed", missing: false });
      return;
    }
    let settled = false;
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const finish = (result: CliRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const stop = (): void => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    };
    const timer = setTimeout(() => {
      stop();
      finish({ kind: "timeout" });
    }, Math.max(1, options.timeoutMs));
    timer.unref();
    const onAbort = (): void => {
      stop();
      finish({ kind: "aborted" });
    };
    if (options.signal.aborted) {
      onAbort();
      return;
    }
    options.signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error: NodeJS.ErrnoException) => finish({ kind: "spawn_failed", missing: error.code === "ENOENT" }));
    child.stdout?.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > options.maxStdoutBytes) {
        truncated = true;
        stop();
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.on("data", () => undefined);
    child.on("close", (code) => finish({ kind: "exit", code, stdout: Buffer.concat(chunks).toString("utf8"), truncated }));
  });

// GUESS (DT3): the command that lists the client's credentials. See S2_ENABLE_CONDITIONS dt3_credential_listing.
export const CREDENTIAL_LIST_ARGV: readonly string[] = Object.freeze(["credentials", "list", "--json"]);

export interface CliClientOptions {
  readonly configDir: string;
  readonly bin?: string;
  // Arguments placed before the command (tests run `node script.mjs`; production leaves it empty).
  readonly binArgs?: readonly string[];
  readonly baseEnv: Env;
  readonly run?: CliRunner;
  readonly credentialArgv?: readonly string[];
  // How long a credential listing may take (a read; the user is not involved).
  readonly readTimeoutMs?: number;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const DECLINED_WORDS = new Set(["rejected", "declined", "denied", "cancelled", "canceled", "expired"]);

// GUESS (DT3). Looks for the signature in the places a CLI is likely to put it; the caller validates the shape.
export function parseSignOutput(stdout: string): { readonly signature: unknown; readonly requestRef?: string } | { readonly declined: true } | undefined {
  const text = stdout.trim();
  if (text === "") return undefined;
  if (/^0x[0-9a-fA-F]{130}$/.test(text)) return { signature: text };
  const data = parseJson(text);
  if (typeof data === "string") return /^0x[0-9a-fA-F]{130}$/.test(data) ? { signature: data } : undefined;
  if (!isRecord(data)) return undefined;
  const nested = isRecord(data["result"]) ? data["result"] : undefined;
  const refValue = data["request_id"] ?? data["requestId"] ?? data["id"] ?? nested?.["request_id"];
  const requestRef = cleanRequestRef(refValue);
  const withRef = (signature: unknown): { signature: unknown; requestRef?: string } => (requestRef === undefined ? { signature } : { signature, requestRef });
  for (const candidate of [data["signature"], nested?.["signature"]]) {
    if (candidate !== undefined && signatureInputSchema.safeParse(candidate).success) return withRef(candidate);
  }
  if (signatureInputSchema.safeParse(data).success) return withRef(data);
  const status = data["status"] ?? nested?.["status"];
  if (typeof status === "string" && DECLINED_WORDS.has(status.toLowerCase())) return { declined: true };
  return undefined;
}

// GUESS (DT3). A list, or an object holding one; each entry names its id, approval_mode and address.
export function parseCredentials(stdout: string, credentialId: string): ClientCredential | undefined {
  const data = parseJson(stdout.trim());
  const list = Array.isArray(data) ? data : isRecord(data) ? (["credentials", "items", "data"].map((key) => data[key]).find(Array.isArray) as unknown[] | undefined) : undefined;
  if (list === undefined) return undefined;
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const id = entry["credential_id"] ?? entry["id"];
    if (id !== credentialId) continue;
    const mode = entry["approval_mode"];
    const address = entry["address"];
    return { ok: true, approvalMode: typeof mode === "string" ? mode : null, address: typeof address === "string" ? address : null };
  }
  return undefined;
}

export function createPayboxCliClient(options: CliClientOptions): PayboxClient {
  const run = options.run ?? defaultCliRunner;
  const bin = options.bin ?? "paybox";
  const binArgs = options.binArgs ?? [];
  const env = childEnvFor(options.baseEnv, options.configDir);
  const credentialArgv = options.credentialArgv ?? CREDENTIAL_LIST_ARGV;
  const readTimeoutMs = options.readTimeoutMs ?? 30_000;
  const failureOf = (result: CliRun): ClientFailure | undefined => {
    switch (result.kind) {
      case "timeout":
        return { ok: false, code: "paybox_timeout" };
      case "aborted":
        return { ok: false, code: "aborted" };
      case "spawn_failed":
        return { ok: false, code: result.missing ? "paybox_missing" : "paybox_failed" };
      case "exit":
        if (result.truncated) return { ok: false, code: "paybox_output_invalid" };
        return undefined;
    }
  };
  return {
    async credential(credentialId, signal) {
      const result = await run({ bin, args: [...binArgs, ...credentialArgv] }, { env, timeoutMs: readTimeoutMs, maxStdoutBytes: MAX_CLI_STDOUT_BYTES, signal });
      const failure = failureOf(result);
      if (failure !== undefined) return failure;
      if (result.kind !== "exit" || result.code !== 0) return { ok: false, code: "paybox_failed" };
      return parseCredentials(result.stdout, credentialId) ?? { ok: false, code: "credential_unreadable" };
    },
    async sign(request, signal) {
      // The documented form (docs.paybox.sh/sdk-cli, as quoted in docs/dapp-design.md 3.3). One argv element per
      // value: the intent is JSON in a single argument, never interpolated into a command line.
      const args = [...binArgs, "sign", "--credential", request.credentialId, "--intent", JSON.stringify(request.intent), "--wait"];
      const result = await run({ bin, args }, { env, timeoutMs: request.timeoutMs, maxStdoutBytes: MAX_CLI_STDOUT_BYTES, signal });
      const failure = failureOf(result);
      if (failure !== undefined) return failure;
      if (result.kind !== "exit") return { ok: false, code: "paybox_failed" };
      const parsed = parseSignOutput(result.stdout);
      if (result.code !== 0) return { ok: false, code: parsed !== undefined && "declined" in parsed ? "paybox_declined" : "paybox_failed" };
      if (parsed === undefined) return { ok: false, code: "paybox_output_invalid" };
      if ("declined" in parsed) return { ok: false, code: "paybox_declined" };
      return { ok: true, ...parsed };
    },
  };
}

// ---- the submit port -----------------------------------------------------------------------------------------------------------

export type SubmitOutcome =
  | { readonly outcome: "submitted" | "pending" }
  // The effect is unknown: never resend, reconcile by hash.
  | { readonly outcome: "ambiguous" }
  // Nothing was sent. `code` is a relay or bridge error code when the refusal had one.
  | { readonly outcome: "refused" | "error"; readonly code?: string };

export interface SubmitRequest {
  readonly principal: Principal;
  readonly kind: (typeof S2_ALLOWED_KINDS)[number];
  readonly preparedId: string;
  readonly signature: Hex;
  readonly signal: AbortSignal;
}

// Where a verified signature goes. It is the only place the signature is handed to.
export interface SubmitPort {
  submit(request: SubmitRequest): Promise<SubmitOutcome>;
}

const SUBMIT_TOOL: Readonly<Record<(typeof S2_ALLOWED_KINDS)[number], string>> = Object.freeze({
  userop: "xo_submit_userop",
  order: "xo_submit_order",
  auth: "xo_connect",
});

// The plugin's own submit tools, in this process, through the tool gate: the class table, the scope check, the ARM
// window, the kill switch, the rate limits, the once-only ledger and the `agent.call` audit event all apply to this
// send exactly as they do to an agent's own call.
export function gateSubmitPort(host: DaemonHost, runner: ToolRunner | (() => ToolRunner) = createInProcessToolRunner): SubmitPort {
  let resolved: ToolRunner | undefined;
  const runnerOf = (): ToolRunner => (resolved ??= typeof runner === "function" ? runner() : runner);
  return {
    async submit(request) {
      const tool = SUBMIT_TOOL[request.kind];
      const args: Record<string, unknown> = request.kind === "auth" ? { step: "submit", prepared_id: request.preparedId, signature: request.signature } : { prepared_id: request.preparedId, signature: request.signature };
      const admission = toolGateOf(host).admit(request.principal, tool, args);
      if (!admission.ok) return { outcome: "refused", code: admission.failure.code };
      const result = await runnerOf().call(tool, args, request.signal);
      const outcome = admission.settle(result);
      // A call that was cut off or threw may have reached the relay: its effect is unknown, never "refused".
      if (result.thrown === true) return { outcome: "ambiguous" };
      const structured = isRecord(result.structured) ? result.structured : undefined;
      const code = typeof structured?.["code"] === "string" ? structured["code"] : undefined;
      switch (outcome) {
        case "ok":
          return { outcome: "submitted" };
        case "pending":
          return { outcome: "pending" };
        case "ambiguous":
          return { outcome: "ambiguous" };
        case "refused":
          return code === undefined ? { outcome: "refused" } : { outcome: "refused", code };
        default:
          return code === undefined ? { outcome: "error" } : { outcome: "error", code };
      }
    },
  };
}

// ---- the module ----------------------------------------------------------------------------------------------------------------------

export interface SignerInbox {
  hasSource(): boolean;
  get(id: string): { readonly state: InboxState; readonly prepared: unknown } | undefined;
  verificationOf(id: string): { readonly status: string } | undefined;
  markSigned(id: string): { readonly ok: boolean };
}

export interface SignerModuleOptions {
  // The signing path. Default: the PayBox CLI, built on first use from the environment (so a missing or bad
  // configuration refuses requests and never stops the daemon from starting).
  readonly path?: SigningPath | ((host: DaemonHost) => SigningPath);
  // Default: the plugin's submit tools through the tool gate.
  readonly submit?: SubmitPort | ((host: DaemonHost) => SubmitPort);
  // Default: the host's inbox.
  readonly inbox?: SignerInbox | ((host: DaemonHost) => SignerInbox);
  // Passed to toPayboxIntent. PayBox's handling of a 0x prefix is a DT1 result.
  readonly intentOptions?: PayboxIntentOptions;
  // Tests give the CLI client a scripted runner or a fake binary.
  readonly cli?: Partial<Pick<CliClientOptions, "run" | "bin" | "binArgs" | "credentialArgv">>;
}

const SIGN_TEXT = {
  denied: "This route is for the user's agent token with the submit scope.",
  readOnly: "This instance serves reads only, so it cannot sign.",
  kill: "The kill switch is on: every write is disabled.",
  off: "The PayBox signer (path S2) is off. It is switched on only by the operator, from the daemon's own environment.",
  notArmed: "Signing needs an open ARM window. Ask the user to arm the Cockpit.",
} as const;

function refusal(code: BridgeErrorCode, message: string, details?: FailureBody["details"], retryAfterS?: number): RouteResult {
  return fail(code, message, { ...(details === undefined ? {} : { details }), ...(retryAfterS === undefined ? {} : { retryAfterS }) });
}

const VET_TEXT: Readonly<Record<VetReason, string>> = Object.freeze({
  item_invalid: "The stored item does not match the relay contract, so it is not signed.",
  op_not_allowed: "Only a raw or typedData intent can be signed here.",
  kind_not_allowed: "This kind of item is not signed by the Cockpit.",
  sign_invalid: "The stored signing block is not valid, so it is not signed.",
  intent_digest_mismatch: "The intent does not hash to the digest the signature will be checked against, so it is not signed.",
  not_verified: "The item cannot be verified independently (no decoded block), so it is not signed.",
  verification_mismatch: "The item does not rebuild to its digest, tags and summary, so it is not signed.",
  account_mismatch: "The item's account is not the one derived from its owner, so it is not signed.",
  expired: "The item has too little time left to be approved and sent. Prepare it again.",
});

const SIGNING_TEXT: Readonly<Record<SigningFailureCode, string>> = Object.freeze({
  paybox_missing: "The PayBox command line tool was not found.",
  paybox_timeout: "PayBox did not answer in time. Nothing was sent.",
  paybox_failed: "PayBox could not sign. Nothing was sent.",
  paybox_declined: "The approval was declined or expired in PayBox. Nothing was sent.",
  paybox_output_invalid: "PayBox answered in a form this software does not recognise, so it was dropped. Nothing was sent.",
  credential_unreadable: "The PayBox credential could not be read, so nothing was signed.",
  aborted: "The request was cancelled before PayBox answered. Nothing was sent.",
  not_vetted: "The item was not checked for signing, so it is not signed.",
  credential_not_always_approve: "The signer credential is not in approval mode always_approve, so S2 is disabled for it.",
  credential_owner_mismatch: "The signer credential's address is not the item's owner, so nothing was signed.",
  signature_invalid: "PayBox returned something that is not a valid signature, so it was dropped. Nothing was sent.",
  owner_mismatch: "PayBox's signature does not recover to the item's owner, so it was dropped. Nothing was sent.",
  form_not_allowed: "PayBox signed a different digest form than a typed-data intent allows, so it was dropped. Nothing was sent.",
});

const CODE_WORD = /^[a-z0-9_]{1,48}$/;

interface RequestBookkeeping {
  readonly perItem: Map<string, number>;
  readonly recent: number[];
  readonly inFlight: Set<string>;
}

export function createSignerModule(options: SignerModuleOptions = {}): BridgeModuleFactory {
  return (host: DaemonHost): BridgeModule => {
    const book: RequestBookkeeping = { perItem: new Map(), recent: [], inFlight: new Set() };
    const closer = new AbortController();
    host.onClose(() => closer.abort());
    let pathMemo: SigningPath | undefined;
    let submitMemo: SubmitPort | undefined;
    const inbox = (): SignerInbox => (typeof options.inbox === "function" ? options.inbox(host) : (options.inbox ?? inboxOf(host)));
    const submitPort = (): SubmitPort => (submitMemo ??= typeof options.submit === "function" ? options.submit(host) : (options.submit ?? gateSubmitPort(host)));
    const pathOf = (): SigningPath => {
      if (pathMemo !== undefined) return pathMemo;
      if (options.path !== undefined) {
        pathMemo = typeof options.path === "function" ? options.path(host) : options.path;
        return pathMemo;
      }
      const configDir = (host.env[S2_CONFIG_DIR_ENV] ?? "").trim();
      const binEnv = (host.env[S2_BIN_ENV] ?? "").trim();
      pathMemo = new PayboxSigningPath(
        createPayboxCliClient({ configDir, baseEnv: host.env, ...(binEnv === "" ? {} : { bin: binEnv }), ...options.cli }),
      );
      return pathMemo;
    };

    const audit = (ev: "signer.request" | "signer.result", principal: Principal, vetted: VettedForSigning | undefined, preparedId: string | undefined, extra: { outcome?: "ok" | "refused" | "error" | "ambiguous" | "pending"; code?: string; requestRef?: string | undefined; verdict?: string; field?: string }): void => {
      host.emitAudit({
        ev,
        tokenId: principal.id,
        ...(preparedId === undefined ? {} : { preparedId }),
        ...(vetted === undefined ? {} : { digestTag: vetted.digestTag, ...(vetted.innerTag === undefined ? {} : { innerTag: vetted.innerTag }) }),
        ...(extra.outcome === undefined ? {} : { outcome: extra.outcome }),
        ...(extra.code === undefined || !CODE_WORD.test(extra.code) ? {} : { code: extra.code }),
        ...(extra.requestRef === undefined ? {} : { requestRef: extra.requestRef }),
        ...(extra.verdict === undefined ? {} : { verdict: extra.verdict }),
        ...(extra.field === undefined ? {} : { field: extra.field }),
      });
    };

    // Says once, at start, what state S2 is in. Fixed text; no value from the environment is printed.
    const readiness = signerReadiness(host.env);
    if (readiness.flag) {
      const state = readiness.ready ? "READY" : !readiness.acknowledged ? `NOT READY (${S2_ACK_ENV} must be ${S2_ACK_VALUE}, which states that DT1 and DT3 were run and recorded)` : `NOT READY (set ${readiness.missing.join(", ")})`;
      host.stderr.write(`cockpit: the PayBox signer (path S2) is ${state}. It is unproven until DT1 and DT3 are recorded.\n`);
    }

    return {
      name: "paybox-signer",
      routes: [
        defineRoute({
          method: "POST",
          path: "/ui/inbox/sign",
          access: { scope: "submit" },
          // Agent tokens only, as the class table says; a page token never holds submit.
          kinds: ["agent"],
          body: inboxSignRequestSchema,
          handler: async (ctx) => {
            const principal = ctx.principal;
            if (principal === null) return refusal("unauthorized", "A valid bearer token is required.");
            const id = ctx.body.prepared_id;
            const short = id.slice(0, 8);
            const deny = (result: RouteResult, code: string, vetted?: VettedForSigning, field?: string): RouteResult => {
              audit("signer.result", principal, vetted, short, { outcome: "refused", code, ...(field === undefined ? {} : { field }) });
              return result;
            };

            if (!principal.scopes.includes("submit")) return deny(refusal("scope_denied", SIGN_TEXT.denied), "scope_denied");
            if (host.instance() !== "writer") return deny(refusal("scope_denied", SIGN_TEXT.readOnly), "read_only");
            if (killControllerOf(host).engaged()) return deny(refusal("kill_switch", SIGN_TEXT.kill), "kill_switch");

            const state = signerReadiness(host.env);
            if (!state.flag) return deny(refusal("flag_off", SIGN_TEXT.off, { flag: S2_FLAG }), "flag_off");
            if (!state.acknowledged) return deny(refusal("precondition_failed", "S2 needs the operator to state that the PayBox tests DT1 and DT3 were run.", { reason: "dt_not_acknowledged", env: S2_ACK_ENV }), "dt_not_acknowledged");
            if (state.missing.length > 0) return deny(refusal("precondition_failed", "S2 is not configured.", { reason: "signer_not_configured", missing: [...state.missing] }), "signer_not_configured");
            if (!armControllerOf(host).isArmed()) return deny(refusal("not_armed", SIGN_TEXT.notArmed), "not_armed");

            const store = inbox();
            // The relay cross-check is what makes the stored item the relay's record. Without it, S2 does not sign.
            if (!store.hasSource()) return deny(refusal("precondition_failed", "The inbox is not connected to the relay's records, so nothing is signed.", { reason: "relay_source_missing" }), "relay_source_missing");
            const entry = store.get(id);
            if (entry === undefined) return deny(refusal("not_found", "No such prepared item in the inbox."), "not_found");
            if (entry.state !== "shown") return deny(refusal("precondition_failed", "The item can be signed only after its card was shown and while it is open.", { reason: "bad_state", state: entry.state }), "bad_state");
            if (store.verificationOf(id)?.status !== "verified") return deny(refusal("precondition_failed", VET_TEXT.not_verified, { reason: "not_verified" }), "not_verified");

            const nowMs = host.clock();
            const vet = vetForSigning(entry.prepared, { nowMs, ...(options.intentOptions === undefined ? {} : { intentOptions: options.intentOptions }) });
            if (!vet.ok) {
              const code = vet.reason === "expired" ? "expired" : "precondition_failed";
              return deny(refusal(code, VET_TEXT[vet.reason], { reason: vet.reason, ...(vet.field === undefined ? {} : { field: vet.field }) }), vet.reason, undefined, vet.field);
            }
            const vetted = vet.vetted;
            if (vetted.preparedId !== id) return deny(refusal("precondition_failed", VET_TEXT.item_invalid, { reason: "item_invalid" }), "item_invalid");
            const relayFlag = SUBMIT_FLAG[vetted.kind];
            // The relay's effective flag, not the environment's request: a flag the relay holds back signs nothing (DS-3).
            if (writeFlagsOf(host)[relayFlag] !== true) return deny(refusal("flag_off", "The relay write path this item needs is off, so nothing is signed.", { flag: relayFlag }), "flag_off", vetted);

            // Prompt budget: every PayBox request is a passkey prompt for the user.
            book.recent.splice(0, book.recent.length, ...book.recent.filter((at) => at > nowMs - REQUEST_WINDOW_MS));
            if ((book.perItem.get(id) ?? 0) >= MAX_REQUESTS_PER_ITEM || book.recent.length >= MAX_REQUESTS_PER_WINDOW) {
              const oldest = book.recent[0] ?? nowMs;
              return deny(refusal("rate_limited", "Too many approval requests. Wait before asking PayBox again.", { reason: "approval_prompts" }, Math.max(1, Math.ceil((oldest + REQUEST_WINDOW_MS - nowMs) / 1000))), "rate_limited", vetted);
            }
            // One approval prompt at a time: the user answers one request on their phone before another is put to them.
            if (book.inFlight.size > 0) return deny(refusal("precondition_failed", "Another signature is waiting for approval in PayBox.", { reason: "signing_in_progress" }), "signing_in_progress", vetted);
            book.inFlight.add(id);

            try {
              const deadlineMs = vetted.expiresAtMs - SUBMIT_MARGIN_MS[vetted.kind] - nowMs;
              const signal = AbortSignal.any([ctx.signal, closer.signal]);
              const credentialId = (host.env[S2_CREDENTIAL_ENV] ?? "").trim();
              let requestedAt: number | undefined;
              const signed = await pathOf().sign(vetted, {
                credentialId,
                timeoutMs: deadlineMs,
                signal,
                onRequest: () => {
                  requestedAt = host.clock();
                  book.perItem.set(id, (book.perItem.get(id) ?? 0) + 1);
                  book.recent.push(requestedAt);
                  audit("signer.request", principal, vetted, short, { outcome: "pending", verdict: "match" });
                },
              });
              if (!signed.ok) {
                audit("signer.result", principal, vetted, short, { outcome: "refused", code: signed.code });
                const code: BridgeErrorCode = signed.code === "owner_mismatch" ? "owner_mismatch" : signed.code === "signature_invalid" || signed.code === "form_not_allowed" ? "signature_invalid" : "precondition_failed";
                return refusal(code, SIGNING_TEXT[signed.code], { reason: signed.code, requested: signed.requested });
              }

              // The wait was long and the world moved: everything that allowed this is checked again before the
              // signature goes anywhere.
              const after = host.clock();
              const again = ((): RouteResult | undefined => {
                if (killControllerOf(host).engaged()) return refusal("kill_switch", SIGN_TEXT.kill);
                if (!armControllerOf(host).isArmed()) return refusal("not_armed", SIGN_TEXT.notArmed);
                if (!signerReadiness(host.env).flag) return refusal("flag_off", SIGN_TEXT.off, { flag: S2_FLAG });
                if (vetted.expiresAtMs - after < SUBMIT_MARGIN_MS[vetted.kind]) return refusal("expired", VET_TEXT.expired, { reason: "expired" });
                if (store.get(id)?.state !== "shown") return refusal("precondition_failed", "The item was rejected or changed while PayBox was asked, so the signature was dropped.", { reason: "changed_while_signing" });
                return undefined;
              })();
              if (again !== undefined) {
                audit("signer.result", principal, vetted, short, { outcome: "refused", code: "dropped_after_signing", requestRef: signed.requestRef });
                return again;
              }
              // shown -> signed, only for an item whose own check is "verified" (the inbox enforces both).
              if (!store.markSigned(id).ok) {
                audit("signer.result", principal, vetted, short, { outcome: "refused", code: "dropped_after_signing", requestRef: signed.requestRef });
                return refusal("precondition_failed", "The item could not be marked signed, so the signature was dropped.", { reason: "changed_while_signing" });
              }

              // Only daemon shutdown can cut the send short: a page that disconnects must not turn a send into an unknown.
              // A port that throws may have sent: the effect is unknown, so it is reported as ambiguous, never as refused.
              const sent: SubmitOutcome = await submitPort()
                .submit({ principal, kind: vetted.kind, preparedId: id, signature: signed.signature, signal: closer.signal })
                .catch((): SubmitOutcome => ({ outcome: "ambiguous" }));
              audit("signer.result", principal, vetted, short, {
                outcome: sent.outcome === "submitted" ? "ok" : sent.outcome,
                ...("code" in sent && sent.code !== undefined ? { code: sent.code } : {}),
                requestRef: signed.requestRef,
              });
              if (sent.outcome === "ambiguous") {
                return refusal("ambiguous", "The send may or may not have happened. Do not sign or send this item again; check its status.", { reason: "ambiguous" });
              }
              if (sent.outcome === "refused" || sent.outcome === "error") {
                const code: BridgeErrorCode = sent.code !== undefined && isBridgeErrorCode(sent.code) ? sent.code : "precondition_failed";
                return refusal(code, "The signature was made but the send was refused. It was not stored; prepare the item again.", { reason: sent.outcome === "refused" ? "submit_refused" : "submit_failed" });
              }
              return json(inboxSignResponseSchema.parse({ prepared_id: id, state: store.get(id)?.state ?? "signed", detail: sent.outcome }));
            } finally {
              book.inFlight.delete(id);
            }
          },
        }),
      ],
      close: () => {
        closer.abort();
      },
    };
  };
}

// Loaded by bridge/main.ts like every other module. With the flag off (the default) the route still exists and
// answers `flag_off`, so a client learns that S2 is off instead of getting a 404.
export const bridgeModule: BridgeModuleFactory = (host) => createSignerModule()(host);
