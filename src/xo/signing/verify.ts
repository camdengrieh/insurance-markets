import { isAddressEqual, recoverAddress, recoverMessageAddress, type Address, type Hex } from "viem";

import { ZERO_ADDRESS } from "./constants.js";
import { hashClobAuth, type ClobAuthFields } from "./clobauth.js";
import { SigningError, type SigningErrorCode } from "./errors.js";
import { kernelWrapDigest } from "./kernel.js";
import { hashOrder, type AssertOrderOptions, type XoOrder } from "./order.js";
import {
  normalizeEcdsaSignature,
  parseWireSignature,
  type ParseOptions,
  type WireSignatureForm,
} from "./signature.js";
import { normalizeAddress } from "./validate.js";

export type VerifyFailureCode = SigningErrorCode | "owner_mismatch" | "unrecoverable_signature";

// Which 32 bytes the owner key signed. Both validate on the deployed ECDSA validator, which accepts
// ECDSA over the Kernel-wrapped digest as it stands ("raw", what the docs' sample and a PayBox `raw` or
// `typedData` intent produce) and ECDSA over its EIP-191 personal-sign envelope ("eip191", what XO's own
// app signs: 62 of 62 classifiable makers) [docs/research/22 (b), 19 sec 7.2]. The verifier tells them
// apart by recovery, so a relay can report which one it saw and a gateway that prefers one form can be
// diagnosed.
export const DIGEST_SIGNATURE_FORMS = ["raw", "eip191"] as const;
export type DigestSignatureForm = (typeof DIGEST_SIGNATURE_FORMS)[number];

export type VerifyFailure = { ok: false; code: VerifyFailureCode; message: string };

export type VerifySuccess = {
  ok: true;
  // Address recovered from the signature; equals the expected owner.
  owner: Address;
  // The hash the exchange passes to isValidSignature (order hash, or ClobAuth digest).
  innerHash: Hex;
  // The Kernel-wrapped digest the owner key actually signed (or, for "eip191", signed the EIP-191
  // envelope of).
  wrappedDigest: Hex;
  // Which form recovered to the expected owner.
  digestForm: DigestSignatureForm;
  // Canonical 65-byte r||s||v (v is 27 or 28).
  ecdsa: Hex;
  // Set when a wire signature was verified.
  form?: WireSignatureForm;
  // Set with `form`: the canonical wire string (v of 27 or 28, lower-case). Submit this one.
  canonicalWire?: Hex;
};

export type VerifyResult = VerifySuccess | VerifyFailure;

function fail(error: unknown): VerifyFailure {
  if (error instanceof SigningError) return { ok: false, code: error.code, message: error.message };
  throw error;
}

// Recovers under one digest form. Returns undefined when no public key recovers from the signature.
async function recoverUnder(form: DigestSignatureForm, wrappedDigest: Hex, ecdsa: Hex): Promise<Address | undefined> {
  try {
    return form === "raw"
      ? await recoverAddress({ hash: wrappedDigest, signature: ecdsa })
      : await recoverMessageAddress({ message: { raw: wrappedDigest }, signature: ecdsa });
  } catch {
    return undefined;
  }
}

function normaliseForms(forms: readonly DigestSignatureForm[] | undefined): readonly DigestSignatureForm[] {
  const wanted = forms ?? DIGEST_SIGNATURE_FORMS;
  const known = DIGEST_SIGNATURE_FORMS.filter((form) => wanted.includes(form));
  if (known.length === 0 || known.length !== new Set(wanted).size) {
    // A caller bug, not bad input from a peer: it throws instead of returning a verdict.
    throw new TypeError("digestForms must name raw, eip191 or both");
  }
  return known;
}

// Core check shared by orders and ClobAuth: recompute the wrapped digest from trusted inputs,
// recover the signer from the relayed 65 bytes under each accepted digest form, require it to equal
// the expected owner under at least one, and say which one.
async function recoverAndCompare(
  innerHash: Hex,
  smartAccount: Address,
  ecdsaInput: unknown,
  expectedOwnerInput: unknown,
  digestForms: readonly DigestSignatureForm[] | undefined,
): Promise<VerifyResult> {
  const expectedOwner = normalizeAddress(expectedOwnerInput, "expectedOwner");
  if (isAddressEqual(expectedOwner, ZERO_ADDRESS)) {
    throw new SigningError("invalid_address", "expectedOwner must not be the zero address");
  }
  const forms = normaliseForms(digestForms);
  const ecdsa = normalizeEcdsaSignature(ecdsaInput);
  const wrappedDigest = kernelWrapDigest(innerHash, smartAccount);
  const recovered: Array<{ form: DigestSignatureForm; owner: Address }> = [];
  for (const form of forms) {
    const owner = await recoverUnder(form, wrappedDigest, ecdsa);
    if (owner === undefined) continue;
    if (isAddressEqual(owner, expectedOwner)) return { ok: true, owner, innerHash, wrappedDigest, digestForm: form, ecdsa };
    recovered.push({ form, owner });
  }
  if (recovered.length === 0) {
    return { ok: false, code: "unrecoverable_signature", message: "no public key recovers from this signature" };
  }
  return {
    ok: false,
    code: "owner_mismatch",
    message: `signature recovers to ${recovered.map((entry) => `${entry.owner} (${entry.form})`).join(" or ")}, not the expected owner ${expectedOwner}`,
  };
}

export type VerifyOrderEcdsaInput = {
  order: XoOrder;
  // The 65-byte r||s||v a wallet returned for the Kernel typed data.
  ecdsa: Hex;
  expectedOwner: Address;
  orderOptions?: AssertOrderOptions;
  // Which digest forms may match. Default both.
  digestForms?: readonly DigestSignatureForm[];
};

// Distrusts a relayed signature: the order hash is rebuilt here from the stored order fields,
// never taken from the caller, so a signature over any other order fails with owner_mismatch.
export async function verifyOrderEcdsa(input: VerifyOrderEcdsaInput): Promise<VerifyResult> {
  try {
    const innerHash = hashOrder(input.order, input.orderOptions);
    return await recoverAndCompare(innerHash, input.order.maker, input.ecdsa, input.expectedOwner, input.digestForms);
  } catch (error) {
    return fail(error);
  }
}

export type VerifyOrderWireInput = Omit<VerifyOrderEcdsaInput, "ecdsa"> & {
  // The full order.signature that would go on the wire.
  signature: Hex;
  parseOptions?: ParseOptions;
};

export async function verifyOrderWireSignature(input: VerifyOrderWireInput): Promise<VerifyResult> {
  try {
    const parsed = parseWireSignature(input.signature, input.parseOptions);
    const innerHash = hashOrder(input.order, input.orderOptions);
    const result = await recoverAndCompare(innerHash, input.order.maker, parsed.ecdsa, input.expectedOwner, input.digestForms);
    return result.ok ? { ...result, form: parsed.form, canonicalWire: parsed.canonicalWire } : result;
  } catch (error) {
    return fail(error);
  }
}

export type VerifyClobAuthEcdsaInput = {
  fields: ClobAuthFields;
  ecdsa: Hex;
  expectedOwner: Address;
  // Which digest forms may match. Default both.
  digestForms?: readonly DigestSignatureForm[];
};

export async function verifyClobAuthEcdsa(input: VerifyClobAuthEcdsaInput): Promise<VerifyResult> {
  try {
    const innerHash = hashClobAuth(input.fields);
    return await recoverAndCompare(innerHash, input.fields.address, input.ecdsa, input.expectedOwner, input.digestForms);
  } catch (error) {
    return fail(error);
  }
}

export type VerifyClobAuthWireInput = Omit<VerifyClobAuthEcdsaInput, "ecdsa"> & {
  signature: Hex;
  parseOptions?: ParseOptions;
};

export async function verifyClobAuthWireSignature(input: VerifyClobAuthWireInput): Promise<VerifyResult> {
  try {
    const parsed = parseWireSignature(input.signature, input.parseOptions);
    const innerHash = hashClobAuth(input.fields);
    const result = await recoverAndCompare(innerHash, input.fields.address, parsed.ecdsa, input.expectedOwner, input.digestForms);
    return result.ok ? { ...result, form: parsed.form, canonicalWire: parsed.canonicalWire } : result;
  } catch (error) {
    return fail(error);
  }
}
