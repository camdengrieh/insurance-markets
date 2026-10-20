import { hashTypedData, isHex, recoverAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

import { toPayboxSignArgs, type SignatureInput, type TypedData } from "../../../src/relay/contract.js";
import { cleanLine, type Printer } from "./redact.js";
import { Refusal, type BaseCall, type BaseWallet, type SignAnswer, type SignAsk, type Signer } from "./types.js";

// Who signs. On the live target it is PayBox, driven by hand: the script prints the exact
// request_wallet_sign arguments (the relay's own intent, unchanged), the operator runs them in PayBox
// and pastes what PayBox returned. On the mock target a stand-in signs with a PUBLIC Anvil test key and
// answers in whichever shape and prefix rules the rehearsal asks for.

// ---- reading what PayBox returned ----------------------------------------------------------------------------

export type SignatureShape = "sig65" | "object_signature" | "rs_recovery_id" | "rs_v" | "wrapped_sig65" | "wrapped_rs_recovery_id" | "wrapped_rs_v" | "unrecognised";

export interface ParsedSignature {
  readonly shape: SignatureShape;
  // Ready for the relay's submit routes when the shape was recognised.
  readonly input: SignatureInput | undefined;
  // The recovery byte as PayBox gave it (0, 1, 27 or 28), when it gave one.
  readonly recoveryByte: number | undefined;
}

const HEX65 = /^0x[0-9a-fA-F]{130}$/;
const HEX32 = /^(?:0x)?[0-9a-fA-F]{64}$/;
const WRAPPER_KEYS = ["output", "result", "artifact", "data", "signature"] as const;

function asHex32(value: unknown): Hex | undefined {
  if (typeof value !== "string" || !HEX32.test(value)) return undefined;
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function recoveryOf(value: unknown): 0 | 1 | 27 | 28 | undefined {
  const number = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  return number === 0 || number === 1 || number === 27 || number === 28 ? number : undefined;
}

// Accepts what the notes say PayBox may return: a 65-byte hex string, {signature}, {r, s, recovery_id}
// (or recoveryId, or v), alone or inside one wrapper level. Anything else is "unrecognised", never guessed.
export function parsePayboxSignature(raw: unknown): ParsedSignature {
  return parseLevel(raw, 0, false);
}

function parseLevel(raw: unknown, depth: number, wrapped: boolean): ParsedSignature {
  const none: ParsedSignature = { shape: "unrecognised", input: undefined, recoveryByte: undefined };
  if (depth > 2) return none;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (HEX65.test(text)) {
      const byte = Number.parseInt(text.slice(130, 132), 16);
      return { shape: wrapped ? "wrapped_sig65" : "sig65", input: text, recoveryByte: byte };
    }
    if (text.startsWith("{") || text.startsWith('"')) {
      try {
        return parseLevel(JSON.parse(text) as unknown, depth + 1, wrapped);
      } catch {
        return none;
      }
    }
    return none;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return none;
  const record = raw as Record<string, unknown>;
  const r = asHex32(record["r"]);
  const s = asHex32(record["s"]);
  if (r !== undefined && s !== undefined) {
    const recovery = recoveryOf(record["recovery_id"] ?? record["recoveryId"]);
    if (recovery !== undefined) return { shape: wrapped ? "wrapped_rs_recovery_id" : "rs_recovery_id", input: { r, s, recovery_id: recovery }, recoveryByte: recovery };
    const v = recoveryOf(record["v"]);
    if (v !== undefined) return { shape: wrapped ? "wrapped_rs_v" : "rs_v", input: { r, s, v }, recoveryByte: v };
    return none;
  }
  for (const key of WRAPPER_KEYS) {
    const inner = record[key];
    if (inner === undefined) continue;
    const parsed = parseLevel(inner, depth + 1, true);
    if (parsed.shape === "unrecognised") continue;
    // {signature: "0x..."} is its own shape because it is the one the notes expect for typedData.
    if (key === "signature" && parsed.shape === "wrapped_sig65") return { ...parsed, shape: "object_signature" };
    return parsed;
  }
  return none;
}

// ---- the stand-in for PayBox (mock target) -----------------------------------------------------------------------

export interface SimulatedPayboxOptions {
  // How the signature comes back.
  readonly shape?: "sig65" | "object_signature" | "rs_recovery_id" | "rs_v";
  // Which rawSigningPayloadHex spellings it accepts.
  readonly acceptsRawPrefix?: "0x" | "none" | "both";
  readonly acceptsTypedData?: boolean;
  // Sign with a different key than the owner's (a wrong-signer rehearsal).
  readonly signWith?: PrivateKeyAccount;
  // raw refuses everything; message still works (the fallback T0 probes).
  readonly rawBroken?: boolean;
  // What the stand-in says about PayBox when asked.
  readonly credentialMode?: "autonomous" | "iframe" | "always_approve" | "paybox";
  readonly approvalState?: "pending_signature" | "pending_approval";
  readonly windowShows?: "digest" | "typed_fields" | "little";
}

export function simulatedSigner(owner: PrivateKeyAccount, options: SimulatedPayboxOptions = {}): Signer {
  const shape = options.shape ?? "sig65";
  const accepts = options.acceptsRawPrefix ?? "both";
  const key = options.signWith ?? owner;
  return {
    kind: "simulated",
    owner: owner.address,
    async probe(question) {
      switch (question) {
        case "readiness_raw":
        case "readiness_typed_data":
          return "ready (the stand-in has no PayBox to ask)";
        case "credential_mode":
          return options.credentialMode ?? "autonomous";
        case "approval_state":
          return options.approvalState ?? "pending_signature";
        case "window_shows":
          return options.windowShows ?? "little";
      }
    },
    async sign(ask: SignAsk): Promise<SignAnswer> {
      if (ask.message !== undefined) {
        return { raw: shaped(await key.signMessage({ message: ask.message }), shape) };
      }
      const args = toPayboxSignArgs("simulated-credential", ask.sign, ask.rawHexPrefix === undefined ? {} : { rawHexPrefix: ask.rawHexPrefix });
      let signature: Hex;
      if (args.intent.op === "raw") {
        if (options.rawBroken === true) return { raw: { error: "this stand-in cannot sign a raw digest" } };
        const bare = !args.intent.rawSigningPayloadHex.startsWith("0x");
        if ((bare && accepts === "0x") || (!bare && accepts === "none")) {
          return { raw: { error: `rawSigningPayloadHex ${bare ? "without" : "with"} the 0x prefix is not accepted by this stand-in` } };
        }
        const digest = (bare ? `0x${args.intent.rawSigningPayloadHex}` : args.intent.rawSigningPayloadHex) as Hex;
        signature = await key.sign({ hash: digest });
      } else {
        if (options.acceptsTypedData === false) return { raw: { error: "typedData with this domain is not accepted by this stand-in" } };
        signature = await key.signTypedData(args.intent.typedData as unknown as Parameters<PrivateKeyAccount["signTypedData"]>[0]);
      }
      return { raw: shaped(signature, shape) };
    },
  };
}

function shaped(signature: Hex, shape: "sig65" | "object_signature" | "rs_recovery_id" | "rs_v"): unknown {
  if (shape === "sig65") return signature;
  if (shape === "object_signature") return { signature };
  const r = `0x${signature.slice(2, 66)}`;
  const s = `0x${signature.slice(66, 130)}`;
  const v = Number.parseInt(signature.slice(130, 132), 16);
  return shape === "rs_recovery_id" ? { r, s, recovery_id: v === 27 || v === 28 ? v - 27 : v } : { r, s, v };
}

// ---- PayBox by hand (live target) ---------------------------------------------------------------------------------

export interface OperatorSignerOptions {
  readonly owner: Address;
  readonly credentialId: string;
  readonly printer: Printer;
  readonly hide: (value: string | undefined) => void;
  // false: do not ask for a note about the signing window.
  readonly askNote?: boolean;
}

export function operatorSigner(options: OperatorSignerOptions): Signer {
  const { printer } = options;
  return {
    kind: "operator",
    owner: options.owner,
    async probe(question) {
      const text: Record<string, string> = {
        readiness_raw: "Run PayBox check_operation_readiness for request_wallet_sign with the raw intent shown above (a dry run: nothing is signed). What did it say? ",
        readiness_typed_data: "Run PayBox check_operation_readiness for request_wallet_sign with the typedData intent shown above (a dry run). What did it say? ",
        credential_mode: "What is the approval mode of this PayBox credential (autonomous, iframe, always_approve or paybox)? ",
        approval_state: "After you submitted a request_wallet_sign, what state did PayBox show first (pending_signature or pending_approval)? ",
        window_shows: "What did the signing window show you for the digest (digest, typed_fields or little)? ",
      };
      const answer = await printer.ask(text[question] ?? "Answer: ");
      return answer === undefined || answer.trim() === "" ? "unknown" : cleanLine(answer.trim(), 120);
    },
    async sign(ask: SignAsk): Promise<SignAnswer> {
      const args =
        ask.message !== undefined
          ? { credential_id: options.credentialId, intent: { op: "message", message: ask.message } }
          : toPayboxSignArgs(options.credentialId, ask.sign, ask.rawHexPrefix === undefined ? {} : { rawHexPrefix: ask.rawHexPrefix });
      printer.heading(`SIGN: ${ask.label}`);
      printer.line(`digest_tag ${ask.digestTag}  (the first 16 hex digits of what is signed; compare it with the signing window)`);
      for (const line of ask.summaryLines) printer.line(`  ${cleanLine(line, 300)}`);
      if (ask.validForS !== undefined) printer.line(`This item is good for about ${String(ask.validForS)} seconds. Sign it promptly.`);
      printer.line("Call PayBox request_wallet_sign with EXACTLY these arguments (do not edit, re-encode or re-hash anything):");
      printer.line(JSON.stringify(args, null, 2));
      const answer = await printer.ask("Paste what PayBox returned (the signature, or the JSON it gave) on one line, then press Enter: ");
      if (answer === undefined || answer.trim() === "") throw new Refusal("no_signature", "No signature was pasted. Nothing was sent.");
      options.hide(answer.trim());
      let raw: unknown = answer.trim();
      if (answer.trim().startsWith("{") || answer.trim().startsWith('"')) {
        try {
          raw = JSON.parse(answer.trim()) as unknown;
        } catch {
          raw = answer.trim();
        }
      }
      collectSecrets(raw, options.hide);
      let operatorNote: string | undefined;
      if (options.askNote === true) {
        const note = await printer.ask("What did the signing window show? (one line, or Enter to skip): ");
        if (note !== undefined && note.trim() !== "") operatorNote = cleanLine(note, 300);
      }
      return { raw, ...(operatorNote === undefined ? {} : { operatorNote }) };
    },
  };
}

// Every string inside a pasted answer is hidden from later output.
function collectSecrets(value: unknown, hide: (value: string | undefined) => void, depth = 0): void {
  if (depth > 4) return;
  if (typeof value === "string") hide(value);
  else if (Array.isArray(value)) for (const entry of value) collectSecrets(entry, hide, depth + 1);
  else if (typeof value === "object" && value !== null) for (const entry of Object.values(value as Record<string, unknown>)) collectSecrets(entry, hide, depth + 1);
}

// ---- Base transactions by hand (live target) ----------------------------------------------------------------------

export function operatorBaseWallet(options: { readonly printer: Printer; readonly hide: (value: string | undefined) => void }): BaseWallet {
  const { printer } = options;
  return {
    kind: "operator",
    async send(call: BaseCall): Promise<Hex | undefined> {
      printer.heading(`SEND ON BASE: ${call.label}`);
      printer.line("Send exactly this transaction from the OWNER address (the PayBox credential). Change nothing:");
      printer.line(JSON.stringify({ chain: call.chain, to: call.to, value: call.value, data: call.data }, null, 2));
      printer.line("Options: a PayBox transaction proposal for the same call, or request_wallet_sign with op transaction and broadcast it yourself.");
      const answer = await printer.ask("Paste the Base transaction hash once it is mined (Enter if this is an approve that is already mined): ");
      if (answer === undefined) throw new Refusal("no_input", "No answer was given. Nothing more is sent.");
      const text = answer.trim();
      if (text === "") return undefined;
      if (!/^0x[0-9a-fA-F]{64}$/.test(text)) throw new Refusal("bad_tx_hash", "That is not a 32-byte transaction hash. Nothing more is sent.");
      return text as Hex;
    },
  };
}

// ---- checks used by T0 and the signers' tests ----------------------------------------------------------------------

export interface Recovery {
  // Which spelling of the digest the signature recovers the owner under.
  readonly form: "raw" | "eip191" | "none";
  readonly recovered: Address | undefined;
}

// Recovers the signer of a 65-byte signature over `digest`, as the raw digest and as an EIP-191 message.
export async function recoverFor(digest: Hex, signature: Hex, expected: Address): Promise<Recovery> {
  const attempts: Array<readonly ["raw" | "eip191", () => Promise<Address>]> = [
    ["raw", () => recoverAddress({ hash: digest, signature })],
    ["eip191", () => recoverMessageAddress({ message: { raw: digest }, signature })],
  ];
  let first: Address | undefined;
  for (const [form, recover] of attempts) {
    try {
      const address = await recover();
      first ??= address;
      if (address.toLowerCase() === expected.toLowerCase()) return { form, recovered: address };
    } catch {
      // not a valid signature under this spelling
    }
  }
  return { form: "none", recovered: first };
}

export function typedDataDigest(data: TypedData): Hex {
  return hashTypedData(data as unknown as Parameters<typeof hashTypedData>[0]);
}

export function looksLikeHex(value: unknown): value is Hex {
  return typeof value === "string" && isHex(value);
}
