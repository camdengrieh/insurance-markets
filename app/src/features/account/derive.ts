// Derived mode (docs/unified-account-design.md section 1, "Connect a wallet"): the connected wallet W signs one fixed
// EIP-712 message and the trading key is E = keccak256(signature) reduced modulo the secp256k1 group order. A wallet
// that signs deterministically (RFC 6979, which every mainstream EOA wallet uses) gives the same signature, so the same
// E, on any device, and nothing has to be stored or backed up.
//
// The rules that make that safe:
//   - the message has no chainId in its domain, so the wallet signs it on whatever chain it is on and E never depends
//     on the chain;
//   - the signature is first put in one canonical form (r, low s, v 27/28) so a wallet that answers with v 0/1 on one
//     transport and 27/28 on another still makes one E;
//   - it must recover to W over this exact message: a smart-contract wallet (no plain key) or an answer for some other
//     message is refused, because its "signature" need not be repeatable or secret;
//   - on first creation the wallet is asked twice and both answers must match; different answers mean the wallet does
//     not sign deterministically, and the page falls back to a passkey account and says so;
//   - a zero key is refused (the reduction lands on zero with negligible probability, but it is not a key).
//
// The signature is the key's seed: it is never stored, logged or sent. Only E's address is remembered (vault.ts).

import { hexToBigInt, isAddressEqual, keccak256, numberToHex, parseSignature, recoverTypedDataAddress, serializeSignature, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { WalletError, type WalletSigner } from "../../core/signer";

// The secp256k1 group order n.
export const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_ORDER = SECP256K1_ORDER / 2n;

// The one message. Changing any byte of it changes every derived account, so it is frozen: a new version would be a new
// constant beside this one, never an edit.
export const UNLOCK_TYPED_DATA = Object.freeze({
  domain: Object.freeze({ name: "insurance-markets trading account", version: "1" }),
  types: Object.freeze({
    Unlock: Object.freeze([
      Object.freeze({ name: "action", type: "string" }),
      Object.freeze({ name: "warning", type: "string" }),
    ]),
  }),
  primaryType: "Unlock",
  message: Object.freeze({
    action: "Unlock your trading account",
    warning: "Sign this only on the insurance-markets page. This signature controls your trading account and its funds.",
  }),
} as const);

// The typed data as the signer interface takes it (a fresh, mutable copy each time).
export function unlockTypedData() {
  return {
    domain: { ...UNLOCK_TYPED_DATA.domain },
    types: { Unlock: UNLOCK_TYPED_DATA.types.Unlock.map((field) => ({ ...field })) },
    primaryType: UNLOCK_TYPED_DATA.primaryType,
    message: { ...UNLOCK_TYPED_DATA.message },
  };
}

// The 65-byte canonical form: r, the low s, v 27 or 28. Null for anything that is not a 65-byte ECDSA signature.
export function canonicalSignature(signature: Hex): Hex | null {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  let parsed;
  try {
    parsed = parseSignature(signature);
  } catch {
    return null;
  }
  const r = hexToBigInt(parsed.r);
  let s = hexToBigInt(parsed.s);
  let yParity = parsed.yParity ?? (parsed.v === undefined ? undefined : Number(parsed.v) % 2 === 1 ? 0 : 1);
  if (yParity === undefined || r === 0n || r >= SECP256K1_ORDER || s === 0n || s >= SECP256K1_ORDER) return null;
  if (s > HALF_ORDER) {
    s = SECP256K1_ORDER - s;
    yParity = yParity === 0 ? 1 : 0;
  }
  return serializeSignature({ r: numberToHex(r, { size: 32 }), s: numberToHex(s, { size: 32 }), yParity });
}

// E from a canonical signature. Throws on a zero key.
export function keyFromSignature(signature: Hex): Hex {
  const scalar = hexToBigInt(keccak256(signature)) % SECP256K1_ORDER;
  if (scalar === 0n) throw new RangeError("the signature reduces to the zero key");
  return numberToHex(scalar, { size: 32 });
}

export type DeriveFailure =
  // The person declined in the wallet.
  | "rejected"
  // The wallet cannot sign typed data on this connection, or went away.
  | "unsupported"
  // The answer does not recover to the wallet over the message: a smart-contract wallet, or a wallet that signs
  // something else.
  | "not_plain_key"
  // Two answers to the same message differ: the wallet does not sign deterministically.
  | "not_deterministic"
  // The re-made account is not the one this wallet made before on this device.
  | "address_changed"
  | "failed";

export type DeriveResult =
  | { readonly ok: true; readonly key: Hex; readonly address: Address }
  | { readonly ok: false; readonly reason: DeriveFailure; readonly message: string };

function failure(reason: DeriveFailure, message: string): DeriveResult {
  return { ok: false, reason, message };
}

function walletFailure(error: unknown): DeriveResult {
  if (error instanceof WalletError) {
    if (error.code === "rejected") return failure("rejected", "You declined the signature in your wallet. Nothing was made.");
    if (error.code === "unsupported" || error.code === "disconnected" || error.code === "unsupported_chain") {
      return failure("unsupported", "Your wallet did not sign the unlock message on this connection. Nothing was made.");
    }
  }
  return failure("failed", "Your wallet did not complete the unlock signature. Nothing was made.");
}

async function oneSignature(wallet: WalletSigner): Promise<{ readonly ok: true; readonly signature: Hex } | { readonly ok: false; readonly result: DeriveResult }> {
  let raw: Hex;
  try {
    raw = await wallet.signTypedData(unlockTypedData());
  } catch (error) {
    return { ok: false, result: walletFailure(error) };
  }
  const canonical = typeof raw === "string" ? canonicalSignature(raw) : null;
  if (canonical === null) return { ok: false, result: failure("not_plain_key", "Your wallet answered with something that is not a plain key signature, so it cannot make a trading account. Create one with a passkey instead.") };
  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({ ...unlockTypedData(), signature: canonical });
  } catch {
    return { ok: false, result: failure("not_plain_key", "Your wallet's signature does not check out for this message, so it cannot make a trading account. Create one with a passkey instead.") };
  }
  if (!isAddressEqual(signer, wallet.address)) {
    return { ok: false, result: failure("not_plain_key", "Your wallet's signature is not from its own address (a smart-contract wallet signs that way), so it cannot make a trading account. Create one with a passkey instead.") };
  }
  return { ok: true, signature: canonical };
}

export interface DeriveOptions {
  // First creation on this device: ask twice and compare. Re-making a known account asks once.
  readonly confirm: boolean;
  // The account this wallet made before on this device, when there is one: the re-made one must equal it.
  readonly expected?: Address | null;
}

export async function deriveTradingKey(wallet: WalletSigner, options: DeriveOptions): Promise<DeriveResult> {
  const first = await oneSignature(wallet);
  if (!first.ok) return first.result;
  if (options.confirm) {
    const second = await oneSignature(wallet);
    if (!second.ok) return second.result;
    if (second.signature.toLowerCase() !== first.signature.toLowerCase()) {
      return failure("not_deterministic", "Your wallet gave two different signatures for the same message, so the account could not be made again from it later. Create one with a passkey instead; your wallet still funds it.");
    }
  }
  let key: Hex;
  try {
    key = keyFromSignature(first.signature);
  } catch {
    return failure("failed", "That signature cannot make a key. Create one with a passkey instead.");
  }
  const address = privateKeyToAccount(key).address;
  if (options.expected !== undefined && options.expected !== null && !isAddressEqual(options.expected, address)) {
    return failure("address_changed", "Your wallet's signature made a different account from the one it made before on this device. Nothing was opened.");
  }
  return { ok: true, key, address };
}
