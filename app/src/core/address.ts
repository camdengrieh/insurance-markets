// Pasted-address validation and address-poisoning defence (acceptance M2-1; docs/dapp-design.md section 6 row 25).
//
// What a pasted address must pass before it becomes a binding:
//   - plain ASCII hex (an invisible or look-alike character is refused by name, not "invalid");
//   - EIP-55: all-lowercase is accepted (wallets and APIs emit it) and is flagged as unchecked; mixed case must
//     carry the exact checksum, a bad one is refused; all-uppercase carries no checksum and is refused;
//   - not the zero address, not a pinned protocol contract (the exchange, the factory, ... are never a wallet);
//   - never an ENS name (no resolution in the MVP).
// Against the saved addresses it warns when the first and last four hex digits match a DIFFERENT saved address
// (the poisoning pattern: a look-alike that shares the ends the eye checks), and says so when it is a duplicate.
// The full EIP-55 address is returned for every confirmation; shortening is the caller's table-only choice.

import { getAddress, isAddress } from "viem";

import { PINNED_CONTRACTS } from "@shared/xo/chain/constants";

export type EvmAddress = `0x${string}`;

export const ADDRESS_ERROR_CODES = [
  "empty",
  "too_long",
  "invisible_characters",
  "ens_not_supported",
  "not_an_address",
  "bad_checksum",
  "uppercase_unverified",
  "zero_address",
  "protocol_contract",
  "not_solana",
] as const;
export type AddressErrorCode = (typeof ADDRESS_ERROR_CODES)[number];

export const ADDRESS_WARNING_CODES = ["lowercase_unchecked", "lookalike", "duplicate", "burn_address"] as const;
export type AddressWarningCode = (typeof ADDRESS_WARNING_CODES)[number];

export interface AddressWarning {
  readonly code: AddressWarningCode;
  readonly message: string;
  // A warning that must be acknowledged before the address is saved.
  readonly requiresConfirmation: boolean;
  // The saved entry a lookalike or duplicate refers to.
  readonly otherId?: string;
}

export interface SavedAddress {
  readonly id: string;
  readonly address: string;
}

export type AddressCheck<A extends string> =
  | { readonly ok: true; readonly address: A; readonly form: "checksummed" | "lowercase" | "base58"; readonly warnings: readonly AddressWarning[]; readonly needsConfirmation: boolean }
  | { readonly ok: false; readonly code: AddressErrorCode; readonly message: string };

const MAX_PASTE_CHARS = 128;
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const PROTOCOL_ADDRESSES: ReadonlySet<string> = new Set(PINNED_CONTRACTS.map((entry) => entry.address.toLowerCase()));
const BURN_ADDRESSES: ReadonlySet<string> = new Set(["0x000000000000000000000000000000000000dead", "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead"]);
const ZERO = "0x0000000000000000000000000000000000000000";

function fail<A extends string>(code: AddressErrorCode, message: string): AddressCheck<A> {
  return { ok: false, code, message };
}

// ASCII whitespace around a paste is trimmed; nothing else is.
function trimPaste(text: string): string {
  return text.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
}

// The look-alike key: the first four and last four hex digits after 0x (EVM), or characters (base58).
export function poisoningKey(address: string): string | null {
  if (HEX_ADDRESS.test(address)) {
    const hex = address.slice(2).toLowerCase();
    return `${hex.slice(0, 4)}..${hex.slice(-4)}`;
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return `${address.slice(0, 4)}..${address.slice(-4)}`;
  return null;
}

function poisoningWarnings(address: string, saved: readonly SavedAddress[]): AddressWarning[] {
  const warnings: AddressWarning[] = [];
  const key = poisoningKey(address);
  const same = HEX_ADDRESS.test(address) ? address.toLowerCase() : address;
  for (const entry of saved) {
    const other = HEX_ADDRESS.test(entry.address) ? entry.address.toLowerCase() : entry.address;
    if (other === same) {
      warnings.push({ code: "duplicate", message: "This address is already saved.", requiresConfirmation: false, otherId: entry.id });
      continue;
    }
    if (key !== null && poisoningKey(entry.address) === key) {
      warnings.push({
        code: "lookalike",
        message: "This address starts and ends like a different saved address. Compare every character before saving: look-alike addresses are used to steal funds.",
        requiresConfirmation: true,
        otherId: entry.id,
      });
    }
  }
  return warnings;
}

export interface EvmAddressOptions {
  // "wallet" (default) refuses a pinned protocol contract; "any" allows one (a contract the user reads, never a deposit target).
  readonly role?: "wallet" | "any";
}

export function checkEvmAddress(input: unknown, saved: readonly SavedAddress[] = [], options: EvmAddressOptions = {}): AddressCheck<EvmAddress> {
  if (typeof input !== "string") return fail("not_an_address", "Paste an address as text.");
  const text = trimPaste(input);
  if (text.length === 0) return fail("empty", "Paste an address.");
  if (text.length > MAX_PASTE_CHARS) return fail("too_long", "That is too long to be an address.");
  if (/[^ -~]/.test(text)) {
    return fail("invisible_characters", "The text contains invisible or non-ASCII characters. Copy the address again from its source.");
  }
  if (/\.eth$/i.test(text) || /^[a-z0-9-]+\.[a-z]{2,}$/i.test(text)) return fail("ens_not_supported", "Names are not resolved. Paste the 0x address.");
  if (!HEX_ADDRESS.test(text)) return fail("not_an_address", "An EVM address is 0x followed by 40 hex digits.");
  const body = text.slice(2);
  const hasLower = /[a-f]/.test(body);
  const hasUpper = /[A-F]/.test(body);
  let form: "checksummed" | "lowercase" = "checksummed";
  if (hasLower && hasUpper) {
    if (!isAddress(text, { strict: true })) return fail("bad_checksum", "The upper and lower case letters do not match the EIP-55 checksum. A character is wrong or the address was altered.");
  } else if (hasUpper) {
    return fail("uppercase_unverified", "All-upper-case hex carries no checksum. Copy the checksummed form from your wallet.");
  } else if (hasLower) {
    form = "lowercase";
  }
  const lower = text.toLowerCase();
  if (lower === ZERO) return fail("zero_address", "The zero address is not a wallet.");
  if ((options.role ?? "wallet") === "wallet" && PROTOCOL_ADDRESSES.has(lower)) {
    return fail("protocol_contract", "That is a protocol contract, not a wallet.");
  }
  const address = getAddress(text);
  const warnings: AddressWarning[] = [];
  if (form === "lowercase") {
    warnings.push({ code: "lowercase_unchecked", message: "All lower case has no checksum, so a typo cannot be detected. Compare it with the source.", requiresConfirmation: false });
  }
  if (BURN_ADDRESSES.has(lower)) {
    warnings.push({ code: "burn_address", message: "This looks like a burn address. Funds sent there are lost.", requiresConfirmation: true });
  }
  warnings.push(...poisoningWarnings(address, saved));
  return { ok: true, address, form, warnings, needsConfirmation: warnings.some((warning) => warning.requiresConfirmation) };
}

// ---- Solana (Pascal owner pubkey, USDC balance) -----------------------------------------------------------------------------

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Exact byte length of a base58 string, or null when it has a character outside the alphabet.
export function base58ByteLength(text: string): number | null {
  let value = 0n;
  for (const char of text) {
    const digit = BASE58.indexOf(char);
    if (digit === -1) return null;
    value = value * 58n + BigInt(digit);
  }
  let bytes = 0;
  while (value > 0n) {
    bytes += 1;
    value >>= 8n;
  }
  let leadingZeros = 0;
  for (const char of text) {
    if (char !== "1") break;
    leadingZeros += 1;
  }
  return bytes + leadingZeros;
}

export function checkSolanaAddress(input: unknown, saved: readonly SavedAddress[] = []): AddressCheck<string> {
  if (typeof input !== "string") return fail("not_solana", "Paste an address as text.");
  const text = trimPaste(input);
  if (text.length === 0) return fail("empty", "Paste an address.");
  if (text.length > MAX_PASTE_CHARS) return fail("too_long", "That is too long to be an address.");
  if (/[^ -~]/.test(text)) {
    return fail("invisible_characters", "The text contains invisible or non-ASCII characters. Copy the address again from its source.");
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) || base58ByteLength(text) !== 32) {
    return fail("not_solana", "A Solana address is 32 to 44 base58 characters that decode to 32 bytes.");
  }
  const warnings = poisoningWarnings(text, saved);
  return { ok: true, address: text, form: "base58", warnings, needsConfirmation: warnings.some((warning) => warning.requiresConfirmation) };
}
