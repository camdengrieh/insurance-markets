import { rm } from "node:fs/promises";
import { join } from "node:path";
import { AUTH_PREPARED_TTL_S, type Prepared, type PostResponse, type RelayFailure, type RelayResult, type SignatureInput } from "../../../src/relay/contract.js";
import { formatAtomic, parseDecimalAtomic } from "../../../src/guardrails/amount.js";
import { normalizeSignature } from "../../../src/xo/userop/sign.js";
import type { Hex } from "viem";
import { upstreamExplorerTransport } from "../../../relay/credentials.js";
import { ExplorerLogReader } from "../../../src/xo/chain/reads.js";
import { cleanLine } from "./redact.js";
import { parsePayboxSignature, recoverFor, type ParsedSignature } from "./signer.js";
import { Refusal, type RunContext, type SignAnswer } from "./types.js";

// Procedures several tests share, written once so the tests (and the mock's set-up) take the same steps.

export type AccountStatus = PostResponse<"/v1/account/status">;

export class StepFailed extends Refusal {
  readonly failure: RelayFailure;
  readonly httpStatus: number;
  constructor(label: string, failure: RelayFailure, httpStatus: number) {
    super(failure.code, `${label}: ${cleanLine(failure.message, 240)}${failure.details === undefined ? "" : ` ${cleanLine(JSON.stringify(failure.details), 240)}`}`);
    this.failure = failure;
    this.httpStatus = httpStatus;
  }
}

// A relay answer that must be a success. Anything else ends the test as inconclusive, with the relay's own words.
export function expectOk<T>(label: string, result: RelayResult<T>): T {
  if (!result.ok) throw new StepFailed(label, result.error, result.status);
  return result.data;
}

export const usd = (micro: bigint): string => formatAtomic(micro, 6);

export function parseUsdMicro(text: string): bigint | undefined {
  const parsed = parseDecimalAtomic(text, 6);
  return parsed.ok ? parsed.value : undefined;
}

export async function accountStatus(ctx: RunContext): Promise<AccountStatus> {
  return expectOk("account status", await ctx.client.post("/v1/account/status", { owner: ctx.owner }));
}

export function describeStatus(status: AccountStatus): string {
  return `state ${status.state}, registered ${String(status.registered)}, trading_enabled ${status.trading_enabled}, balance ${status.balance_usd ?? "unread"} USD, credentials ${status.credentials.state}`;
}

// ---- signing --------------------------------------------------------------------------------------------------------

export interface SignedItem {
  readonly input: SignatureInput;
  readonly parsed: ParsedSignature;
  readonly answer: SignAnswer;
  // The form the signature recovers the owner under, from the script's own check before anything is sent.
  readonly form: "raw" | "eip191";
}

function hideAll(ctx: RunContext, value: unknown, depth = 0): void {
  if (depth > 4) return;
  if (typeof value === "string") ctx.hide(value);
  else if (Array.isArray(value)) for (const entry of value) hideAll(ctx, entry, depth + 1);
  else if (typeof value === "object" && value !== null) for (const entry of Object.values(value as Record<string, unknown>)) hideAll(ctx, entry, depth + 1);
}

// Shows the item to the signer, reads the answer, and checks that it really is the owner's signature over the
// digest the relay will check BEFORE the caller sends it anywhere. A wrong credential or an altered digest
// ends here, with nothing submitted and no prepared item spent.
export async function signItem(
  ctx: RunContext,
  prepared: Pick<Prepared, "sign" | "summary" | "owner">,
  label: string,
  options: { readonly validForS?: number; readonly rawHexPrefix?: "0x" | "none" } = {},
): Promise<SignedItem> {
  if (prepared.owner.toLowerCase() !== ctx.owner.toLowerCase()) throw new Refusal("owner_mismatch", "The relay prepared this item for a different owner than the one this run is for. Nothing is signed.");
  const answer = await ctx.signer.sign({
    label,
    sign: prepared.sign,
    digestTag: prepared.summary.digest_tag,
    summaryLines: prepared.summary.lines,
    ...(options.validForS === undefined ? {} : { validForS: options.validForS }),
    ...(options.rawHexPrefix === undefined ? {} : { rawHexPrefix: options.rawHexPrefix }),
  });
  hideAll(ctx, answer.raw);
  const parsed = parsePayboxSignature(answer.raw);
  if (parsed.input === undefined) throw new Refusal("signature_unreadable", "What came back is not a signature the relay can read (a 65-byte hex string, or r and s with a recovery id). Nothing was sent.");
  let normalized: Hex;
  try {
    normalized = normalizeSignature(parsed.input).signature;
  } catch {
    throw new Refusal("signature_invalid", "The signature is not well formed (r, s or the recovery byte are out of range). Nothing was sent.");
  }
  hideAll(ctx, normalized);
  const recovery = await recoverFor(prepared.sign.expected_digest as Hex, normalized, ctx.owner);
  if (recovery.form === "none") {
    throw new Refusal("owner_mismatch", `The signature does not belong to the owner ${ctx.owner} for this digest (it recovers to ${recovery.recovered ?? "nothing"}). Wrong PayBox credential, or PayBox signed something else. Nothing was sent.`);
  }
  return { input: parsed.input, parsed, answer, form: recovery.form };
}

// ---- connecting (T2's core, also the mock's set-up for the tests that need credentials) ------------------------------------

export interface ConnectOutcome {
  readonly keyTag: string;
  readonly preparedExpiresAt: string;
}

export async function connectCredentials(ctx: RunContext, steps: { readonly prepare?: () => void; readonly sign?: () => void; readonly submit?: () => void } = {}): Promise<ConnectOutcome> {
  steps.prepare?.();
  const prepared = expectOk("auth/prepare", await ctx.client.post("/v1/auth/prepare", { owner: ctx.owner }));
  ctx.observe("digest_tag", prepared.summary.digest_tag);
  steps.sign?.();
  const signed = await signItem(ctx, prepared, "XO login (the ClobAuth digest, wrapped for your smart account)", { validForS: AUTH_PREPARED_TTL_S });
  steps.submit?.();
  const submitted = expectOk("auth/submit", await ctx.client.post("/v1/auth/submit", { prepared_id: prepared.prepared_id, signature: signed.input }));
  return { keyTag: submitted.key_tag, preparedExpiresAt: prepared.expires_at };
}

// ---- following a user operation ---------------------------------------------------------------------------------------------

export type UserOpTerminal = "included" | "failed" | "rejected" | "ambiguous" | "unknown" | "submitted";

export interface UserOpWatch {
  readonly state: UserOpTerminal;
  readonly txHash: string | undefined;
  readonly detail: string | undefined;
  readonly timedOut: boolean;
}

// Polls GET /v1/userop/:hash until the operation is included, failed, rejected or ambiguous, or the time is up.
export async function waitForUserOp(ctx: RunContext, hash: string, timeoutMs: number, everyMs = 10_000): Promise<UserOpWatch> {
  const outcome = await ctx.poll<UserOpWatch>(
    `user operation ${hash.slice(0, 12)}...`,
    async () => {
      const status = expectOk("userop status", await ctx.client.get(`/v1/userop/${hash.toLowerCase()}` as `/v1/userop/0x${string}`));
      const state = status.state as UserOpTerminal;
      const done = state === "included" || state === "failed" || state === "rejected" || state === "ambiguous";
      return { done, value: { state, txHash: status.tx_hash, detail: status.detail, timedOut: false } };
    },
    { timeoutMs, everyMs },
  );
  return { ...outcome.value, timedOut: outcome.timedOut };
}

// ---- reading the chain through the relay's own upstream client (paced, pinned user agent, printed) -------------------

export function explorerFor(ctx: RunContext): ExplorerLogReader {
  const services = ctx.services;
  if (services === undefined) throw new Refusal("no_relay", "This test runs without a relay and cannot read through one.");
  return new ExplorerLogReader({ transport: upstreamExplorerTransport(services.services.upstream) });
}

// What T0 recorded about PayBox's raw intent, if anything: "bare" means the hex goes without 0x.
export function rawPrefixFromFacts(ctx: RunContext): "0x" | "none" | undefined {
  const value = ctx.services?.services.capabilities.value("PB1");
  if (value === undefined) return undefined;
  if (value.includes(".bare.")) return "none";
  if (value.includes(".0x.")) return "0x";
  return undefined;
}

// ---- the restore drill (A5: T2 is gated on a verified restore) -----------------------------------------------------------------

export interface DrillResult {
  readonly ok: boolean;
  readonly detail: string;
}

// Proves, on THIS data directory and THIS master secret, that a sealed secret survives losing its primary
// file: put (backup first, then primary, both read back), verify the backup, delete the primary from disk,
// restore it from the newest backup, read it back and compare. Uses a pseudo account that no owner has.
export async function restoreDrill(ctx: RunContext): Promise<DrillResult> {
  const services = ctx.services;
  const secrets = services?.services.secrets;
  const dataDir = services?.services.config.dataDir;
  if (secrets === undefined || dataDir === undefined) return { ok: false, detail: "the credential store is off, so there is nothing to restore from" };
  const account = `0x${"0".repeat(39)}1`;
  const name = "restore_drill";
  const value = `restore-drill-${Buffer.from(ctx.random(12)).toString("hex")}`;
  ctx.hide(value);
  try {
    await secrets.put(account, name, value, { replace: true });
    if (!(await secrets.verifyBackup(account, name))) return { ok: false, detail: "the encrypted backup does not match the primary right after writing it" };
    await rm(join(dataDir, "secrets", `${account}.${name}.enc`), { force: true });
    if (await secrets.has(account, name)) return { ok: false, detail: "the drill could not remove the primary file" };
    await secrets.restore(account, name);
    const back = await secrets.get(account, name);
    if (back === undefined || back.reveal() !== value) return { ok: false, detail: "the restored secret differs from the original" };
    return { ok: true, detail: "wrote a secret (backup first), lost its primary file, restored it from the backup and read it back equal" };
  } catch (error) {
    return { ok: false, detail: `the drill failed (${error instanceof Error ? error.name : "error"})` };
  }
}
