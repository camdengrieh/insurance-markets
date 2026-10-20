import { hashTypedData, recoverMessageAddress, type Address, type Hex } from "viem";

import { preparedSignSchema, type PreparedSign } from "../../src/relay/contract.js";
import { deriveAccount } from "../../src/xo/account/derive.js";
import { buildKernelTypedData } from "../../src/xo/signing/kernel.js";
import { normalizeSignature } from "../../src/xo/userop/sign.js";
import { cleanLine } from "./lib/redact.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { parsePayboxSignature, recoverFor, type SignatureShape } from "./lib/signer.js";
import { PRECONDITION_DEDICATED } from "./lib/text.js";
import type { FactProposal, RunContext, TestResult, TestSpec } from "./lib/types.js";

// T0  PayBox signing probes                                                 docs/phase1-gap-closing.md section 6
//
// Settles: UO2, PB1 to PB4, the PayBox half of gate 8. Cost: $0. Touches no XO or Base service at all.
//
// It asks PayBox to sign things and checks, on this machine, what came back:
//   1. a dry run (check_operation_readiness) for request_wallet_sign with a raw and with a typedData intent;
//   2. request_wallet_sign op raw on a random 32-byte digest this script makes (with the 0x prefix; the bare
//      spelling too if the first is refused or you ask for both). The answer is recovered locally against the
//      credential's address, under the raw digest and under the EIP-191 spelling, and its SHAPE is recorded
//      (65 bytes, {signature}, {r, s, recovery_id}, {r, s, v}) with the recovery byte as PayBox gave it;
//   3. the same with op typedData: the Kernel wrapper, chain id 3223, the account of this credential as
//      verifyingContract (what XO's orders and logins need);
//   4. what you saw: the state PayBox showed first (pending_signature or pending_approval) and what the
//      signing window displayed for the digest.
//
// Stop rule: if raw cannot sign a digest, the write path is blocked on PayBox: stop and record it. The
// op message with the digest as hex is tried only then, as a fallback.
//
// Use a THROWAWAY PayBox credential for this test (it may be autonomous). It must never be the credential
// that will hold XO funds unless you accept what an autonomous grant means (amendment A4).

const SLUG = "t0-paybox-signing";

export const spec: TestSpec = {
  id: "T0",
  slug: SLUG,
  title: "PayBox signing probes",
  settles: ["UO2", "PB1", "PB2", "PB3", "PB4", "PayBox half of gate 8"],
  worstCaseUsd: "0",
  costNote: "nothing is spent and no XO or Base service is contacted",
  stopRule: "if raw cannot sign a digest, the write path is blocked on PayBox: stop; message is a fallback only if it accepts hex bytes",
  preconditions: [
    PRECONDITION_DEDICATED,
    "Use a THROWAWAY PayBox EVM credential for T0: it signs random digests, which an autonomous grant would do without asking. Its address is --owner.",
    "You know its credential_id (--credential-id) and can run PayBox tools (list_credentials, check_operation_readiness, request_wallet_sign) yourself or through your agent.",
    "No `pnpm relay` is running on the data directory you pass: T0 starts no relay, but it writes the capability facts there and a data directory has one owner at a time.",
  ],
  flagsToArm: [],
  steps: [
    { id: "setup", title: "Make a random digest and the Kernel typed data for this credential", calls: [{ via: "operator", method: "-", target: "no network: the digest is made here" }] },
    {
      id: "readiness",
      title: "PayBox dry runs: is request_wallet_sign ready for a raw and for a typedData intent?",
      calls: [{ via: "operator", method: "-", target: "PayBox check_operation_readiness (request_wallet_sign), once per intent", note: "nothing is signed" }],
    },
    {
      id: "raw",
      title: "request_wallet_sign op raw on the random digest, 0x spelling (and the bare spelling if refused or asked for)",
      calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent {op raw, rawSigningPayloadHex}" }],
    },
    {
      id: "typed",
      title: "request_wallet_sign op typedData: Kernel wrapper, chain id 3223",
      calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent {op typedData, typedData}" }],
    },
    { id: "observe", title: "What PayBox did: the first state and what the signing window showed", calls: [{ via: "operator", method: "-", target: "your observation, typed in" }] },
    {
      id: "fallback",
      title: "Only if raw could not sign: op message with the digest as hex text",
      calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent {op message}" }],
      when: "only if raw could not sign",
    },
  ],
  flags: [{ name: "both-prefixes", kind: "bool", help: "Also try the bare (no 0x) spelling of rawSigningPayloadHex even if the 0x spelling worked." }],
  needs: { relay: false, credentialStore: false, xoChain: false, baseChain: false, arrange: [] },
  writes: [],
  exposureUsd: () => "0",
  run,
};

interface RawProbe {
  readonly prefix: "0x" | "bare";
  readonly accepted: boolean;
  readonly shape: SignatureShape;
  readonly recoveryByte: number | undefined;
  readonly form: "raw" | "eip191" | "none";
  readonly note: string;
}

function textOf(raw: unknown): string {
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    for (const key of ["error", "message", "reason"]) if (typeof record[key] === "string") return cleanLine(record[key], 200);
  }
  return typeof raw === "string" ? cleanLine(raw, 200) : "an answer that is not a signature";
}

async function analyse(digest: Hex, raw: unknown, owner: Address): Promise<Omit<RawProbe, "prefix">> {
  const parsed = parsePayboxSignature(raw);
  if (parsed.input === undefined) return { accepted: false, shape: "unrecognised", recoveryByte: undefined, form: "none", note: `no signature in the answer (${textOf(raw)})` };
  let signature: Hex;
  try {
    signature = normalizeSignature(parsed.input).signature;
  } catch {
    return { accepted: false, shape: parsed.shape, recoveryByte: parsed.recoveryByte, form: "none", note: "the signature is not well formed" };
  }
  const recovery = await recoverFor(digest, signature, owner);
  return {
    accepted: recovery.form !== "none",
    shape: parsed.shape,
    recoveryByte: parsed.recoveryByte,
    form: recovery.form,
    note: recovery.form === "none" ? `it recovers to ${recovery.recovered ?? "nothing"}, not to the credential ${owner}` : `it recovers the credential under the ${recovery.form} digest`,
  };
}

function hide(ctx: RunContext, raw: unknown): void {
  if (typeof raw === "string") ctx.hide(raw);
  else if (typeof raw === "object" && raw !== null) for (const value of Object.values(raw as Record<string, unknown>)) hide(ctx, value);
}

async function run(ctx: RunContext): Promise<TestResult> {
  const facts: FactProposal[] = [];
  const owner = ctx.owner;

  ctx.step("setup");
  const digestBytes = ctx.random(32);
  const digest = `0x${Buffer.from(digestBytes).toString("hex")}` as Hex;
  const innerBytes = ctx.random(32);
  const inner = `0x${Buffer.from(innerBytes).toString("hex")}` as Hex;
  const account = deriveAccount(owner);
  const rawSign: PreparedSign = preparedSignSchema.parse({ intent: { op: "raw", rawSigningPayloadHex: digest }, expected_digest: digest, digest_form: "userOpHash" });
  const typed = buildKernelTypedData(inner, account);
  const typedDigest = hashTypedData(typed as unknown as Parameters<typeof hashTypedData>[0]);
  const typedSign: PreparedSign = preparedSignSchema.parse({ intent: { op: "typedData", typedData: JSON.parse(JSON.stringify(typed)) as unknown }, expected_digest: typedDigest, digest_form: "kernelWrappedClobAuth" });
  ctx.observe("credential", `${owner} (its XO account would be ${account})`);
  ctx.observe("raw digest", digest);
  ctx.observe("typed data digest", typedDigest);

  ctx.step("readiness");
  const readyRaw = await ctx.signer.probe("readiness_raw");
  const readyTyped = await ctx.signer.probe("readiness_typed_data");
  ctx.observe("readiness raw", readyRaw);
  ctx.observe("readiness typedData", readyTyped);

  ctx.step("raw");
  const attempts: RawProbe[] = [];
  const tryRaw = async (prefix: "0x" | "bare"): Promise<RawProbe> => {
    const answer = await ctx.signer.sign({
      label: `raw digest, ${prefix === "0x" ? "with the 0x prefix" : "bare hex, no 0x prefix"}`,
      sign: rawSign,
      digestTag: digest.slice(2, 18),
      summaryLines: ["A random 32-byte digest made by the kit. It is not a transaction, an order or a user operation. Signing it commits you to nothing."],
      rawHexPrefix: prefix === "0x" ? "0x" : "none",
    });
    hide(ctx, answer.raw);
    const analysis = await analyse(digest, answer.raw, owner);
    const probe: RawProbe = { prefix, ...analysis };
    attempts.push(probe);
    ctx.observe(`raw (${prefix})`, probe.accepted ? `signed; shape ${probe.shape}; recovery byte ${probe.recoveryByte === undefined ? "?" : String(probe.recoveryByte)}; ${probe.note}` : `NOT signed: ${probe.note}`);
    return probe;
  };
  const first = await tryRaw("0x");
  const askBoth = ctx.opts.extra["both-prefixes"] === true;
  if (!first.accepted || askBoth) await tryRaw("bare");
  const good = attempts.find((attempt) => attempt.accepted);

  let rawRefused = false;
  if (good === undefined) {
    rawRefused = true;
    facts.push({ id: "T0", state: "no", note: "request_wallet_sign op raw could not sign a digest (neither spelling): the write path is blocked on PayBox." });
    facts.push({ id: "PB1", state: "no", note: `raw refused: ${attempts.map((attempt) => `${attempt.prefix}: ${attempt.note}`).join("; ").slice(0, 150)}` });
    facts.push({ id: "UO2", state: "no", note: "raw returned no usable signature" });
  } else {
    const prefixToken = attempts.some((attempt) => attempt.prefix === "0x" && attempt.accepted) ? "0x" : "bare";
    facts.push({ id: "PB1", state: "yes", value: `rawSigningPayloadHex.${prefixToken}.${good.shape}`.slice(0, 64), note: `request_wallet_sign op raw signed a random digest; field rawSigningPayloadHex, ${prefixToken === "0x" ? "with" : "without"} the 0x prefix; answer shape ${good.shape}.` });
    const asIs = good.form === "raw";
    facts.push({
      id: "UO2",
      state: asIs ? "yes" : "no",
      value: `${good.form}.${good.shape}.rec${good.recoveryByte === undefined ? "x" : String(good.recoveryByte)}`.slice(0, 64),
      note: asIs ? `raw signs the digest as it is; answer shape ${good.shape}, recovery byte ${good.recoveryByte === undefined ? "unknown" : String(good.recoveryByte)}.` : "PayBox signed under the EIP-191 prefix, not the digest as it is. The relay accepts both forms, so nothing breaks.",
    });
  }

  ctx.step("typed");
  if (rawRefused) ctx.say("   (raw is refused, so only the typedData probe still teaches something)");
  const typedAnswer = await ctx.signer.sign({
    label: "typed data: Kernel(bytes32 hash), chain id 3223, verifying contract = your XO account",
    sign: typedSign,
    digestTag: typedDigest.slice(2, 18),
    summaryLines: ["A random 32-byte value wrapped the way XO's logins and orders are. It is not an order. Signing it commits you to nothing."],
  });
  hide(ctx, typedAnswer.raw);
  const typedAnalysis = await analyse(typedDigest, typedAnswer.raw, owner);
  ctx.observe("typedData", typedAnalysis.accepted ? `signed; shape ${typedAnalysis.shape}; ${typedAnalysis.note}` : `NOT signed: ${typedAnalysis.note}`);
  facts.push(
    typedAnalysis.accepted
      ? { id: "PB2", state: "yes", value: "chain3223.kernel", note: "typedData with chain id 3223 and a foreign verifying contract (the Kernel wrapper) was signed." }
      : { id: "PB2", state: "no", note: `typedData with chain id 3223 was not signed (${typedAnalysis.note}). The relay then asks for raw signatures.`.slice(0, 190) },
  );

  ctx.step("observe");
  const mode = await ctx.signer.probe("credential_mode");
  const state = await ctx.signer.probe("approval_state");
  const window = await ctx.signer.probe("window_shows");
  ctx.observe("credential mode", mode);
  ctx.observe("first state", state);
  ctx.observe("signing window", window);
  if (mode === "autonomous" && (state === "pending_signature" || state === "pending_approval")) {
    facts.push({
      id: "PB3",
      state: state === "pending_signature" ? "yes" : "no",
      value: state,
      note: state === "pending_signature" ? "Under an autonomous grant request_wallet_sign went straight to pending_signature: no human saw it." : "Even under an autonomous grant PayBox asked for approval first.",
    });
  } else {
    ctx.observe("PB3", `not tested: the credential is ${mode}, and PB3 is about an autonomous grant`);
  }
  if (window === "digest" || window === "typed_fields" || window === "little") {
    facts.push({
      id: "PB4",
      state: window === "little" ? "yes" : "no",
      value: window,
      note: window === "little" ? "The signing window shows little for a digest: the digest_tag comparison is the only check an approver has." : `The signing window shows ${window.replace("_", " ")}: an approver can compare it with digest_tag.`,
    });
  }

  if (rawRefused) {
    ctx.step("fallback");
    const message = digest;
    const answer = await ctx.signer.sign({
      label: "fallback: op message with the digest as hex text",
      sign: rawSign,
      message,
      digestTag: digest.slice(2, 18),
      summaryLines: ["The fallback: sign the digest's hex as a message. Only worth it if raw is refused."],
    });
    hide(ctx, answer.raw);
    const parsed = parsePayboxSignature(answer.raw);
    let worked = false;
    if (parsed.input !== undefined) {
      const signature = normalizeSignature(parsed.input).signature;
      worked = (await recoverMessageAddress({ message, signature }).catch(() => undefined))?.toLowerCase() === owner.toLowerCase();
    }
    ctx.observe("message fallback", worked ? "signed (EIP-191 over the hex text), but that is NOT a signature over the 32 bytes the chain checks" : "also refused");
    facts.push({ id: "PB1", state: "no", value: worked ? "fallback.message.text" : "none", note: worked ? "raw is refused; message signs the hex as text, which does not authorise a user operation" : "raw and message are both refused" });
  }

  const passed = good !== undefined;
  if (passed) facts.push({ id: "T0", state: "yes", note: `PayBox signed a raw digest (${good.prefix === "0x" ? "0x" : "bare"} spelling, shape ${good.shape}); typedData with chain 3223 ${typedAnalysis.accepted ? "worked" : "was refused"}.` });
  return {
    verdict: passed ? "pass" : "stopped",
    summary: passed
      ? `PayBox raw signing works: ${good.prefix === "0x" ? "with" : "without"} the 0x prefix, answered as ${good.shape}. typedData with chain 3223 ${typedAnalysis.accepted ? "also works" : "was refused (the relay will ask for raw signatures)"}.`
      : "STOP RULE: PayBox could not sign a raw digest. The write path is blocked on PayBox until this changes.",
    facts: dedupe(facts),
    observations: ctx.observations(),
  };
}

// The fallback may add a second PB1; the later one wins.
function dedupe(facts: readonly FactProposal[]): readonly FactProposal[] {
  const byId = new Map<string, FactProposal>();
  for (const fact of facts) byId.set(fact.id, fact);
  return [...byId.values()];
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
