import { keccak256 } from "viem";

import { RpcError, type Address, type Hex, type RpcPort, type RpcRequestOptions } from "./rpc.js";

// A pinned contract: an address taken from the venue's own published contract list (or a verified getter of a
// contract on that list), and the keccak256 of the runtime code eth_getCode returned for it on the day it was read.
// Every pin in sdk/chain/<venue>/ was captured by test/fixtures/chain-bytecode/capture.ts, which also recorded
// whether Sourcify's verified on-chain code equals it; test/chain-pins.test.ts re-hashes the recorded code and
// compares it with these pins.
//
// A reader that reads balances or results from a pinned contract checks the pin first (`createPinGuard`): the code at
// the address must still hash to the pinned value, and an EIP-1967 proxy's slot must still name the pinned
// implementation, whose code is checked too. A change fails closed; nothing is read from a contract that changed.

export const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

export interface ContractPin {
  readonly chainId: number;
  readonly name: string;
  readonly address: Address;
  // keccak256 of the runtime code and its size in bytes, as read on `readOn`.
  readonly codeHash: Hex;
  readonly codeSize: number;
  // For an EIP-1967 proxy, the implementation its slot named, pinned in turn.
  readonly implementation: ContractPin | null;
  // Where the address came from, and what verified the code.
  readonly source: string;
  readonly verified: string;
  readonly readOn: string;
}

export type PinCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "no_code" | "code_changed" | "implementation_changed" | "unreadable"; readonly contract: string };

function slotAddress(word: Hex): Address | null {
  if (!/^0x[0-9a-f]{64}$/.test(word) || !word.startsWith("0x000000000000000000000000")) return null;
  return `0x${word.slice(26)}` as Address;
}

export async function checkPin(port: RpcPort, pin: ContractPin, options?: RpcRequestOptions): Promise<PinCheck> {
  let code: Hex;
  try {
    code = await port.getCode(pin.address, options);
  } catch (error) {
    // A limit, a timeout or a refusal is not a verdict about the contract: thrown to the caller.
    if (error instanceof RpcError && (error.code === "invalid_response" || error.code === "upstream_error")) return { ok: false, reason: "unreadable", contract: pin.name };
    throw error;
  }
  if (code === "0x") return { ok: false, reason: "no_code", contract: pin.name };
  if ((code.length - 2) / 2 !== pin.codeSize || keccak256(code) !== pin.codeHash) return { ok: false, reason: "code_changed", contract: pin.name };
  if (pin.implementation === null) return { ok: true };
  const word = await port.getStorageAt(pin.address, EIP1967_IMPLEMENTATION_SLOT, options);
  const named = slotAddress(word);
  if (named === null || named !== pin.implementation.address.toLowerCase()) return { ok: false, reason: "implementation_changed", contract: pin.name };
  return checkPin(port, pin.implementation, options);
}

export interface PinGuard {
  // The check of each pin, made once per guard (a page session) and remembered, failure included. A thrown error
  // (the endpoint could not be asked) is not remembered.
  check(pin: ContractPin, options?: RpcRequestOptions): Promise<PinCheck>;
}

export function createPinGuard(port: RpcPort): PinGuard {
  const seen = new Map<string, PinCheck>();
  return {
    async check(pin, options) {
      const key = `${pin.chainId}:${pin.address.toLowerCase()}`;
      const known = seen.get(key);
      if (known !== undefined) return known;
      const result = await checkPin(port, pin, options);
      seen.set(key, result);
      return result;
    },
  };
}

// Plain words for a failed check, for a page or a log line.
export function pinFailureText(check: Exclude<PinCheck, { ok: true }>): string {
  switch (check.reason) {
    case "no_code":
      return `There is no contract at the pinned address of ${check.contract}; nothing was read from it.`;
    case "code_changed":
      return `The code at ${check.contract} is not the code pinned on the day it was checked; nothing was read from it.`;
    case "implementation_changed":
      return `${check.contract} now points at an implementation that was not pinned; nothing was read from it.`;
    case "unreadable":
      return `The code at ${check.contract} could not be read, so it could not be checked; nothing was read from it.`;
  }
}
