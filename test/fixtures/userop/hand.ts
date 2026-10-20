// Hand-written ABI encodings, deliberately NOT using viem's encoder, so the tests compare the builders in
// src/xo/userop/ with an independent second opinion. Layout rules used (Solidity ABI, head/tail):
//   every static value is one 32-byte word; a dynamic value (bytes, string, array) is an offset in the head
//   and `length word + data right-padded to 32 bytes` (or the elements) in the tail.
// Selectors are literals taken from the spec (docs/phase1-gap-closing.md section 2.1) and re-derived with
// `cast sig` while writing this file.

export const SEL = Object.freeze({
  approve: "095ea7b3",
  setApprovalForAll: "a22cb465",
  redeemPositions: "01b7037c",
  createConvictionMarket: "7f54a7a2",
  respondToUpdateRequest: "1de5facd",
  cancelMarket: "bdb83289",
  transferRemote: "81b4e8b4",
  execute: "e9ae5c53",
});

const strip = (hex: string): string => (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();

// A static word from a number or a hex value, left-padded with zeros.
export function word(value: bigint | number | string): string {
  if (typeof value === "string") return strip(value).padStart(64, "0");
  return BigInt(value).toString(16).padStart(64, "0");
}

// Data right-padded with zeros to a multiple of 32 bytes.
export function padRight(hex: string): string {
  const h = strip(hex);
  return h.padEnd(Math.ceil(h.length / 64) * 64, "0");
}

// length word + padded data
export function bytesTail(hex: string): string {
  const h = strip(hex);
  return word(h.length / 2) + padRight(h);
}

export function utf8Hex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const approveData = (spender: string, amount: bigint): string => `0x${SEL.approve}${word(spender)}${word(amount)}`;

export const setApprovalForAllData = (operator: string, approved: boolean): string => `0x${SEL.setApprovalForAll}${word(operator)}${word(approved ? 1 : 0)}`;

export function redeemData(collateral: string, parent: string, conditionId: string, indexSets: readonly bigint[]): string {
  return `0x${SEL.redeemPositions}${word(collateral)}${word(parent)}${word(conditionId)}${word(0x80)}${word(indexSets.length)}${indexSets.map((v) => word(v)).join("")}`;
}

export function createMarketData(startsAt: bigint, expiresAt: bigint, collateral: string, uri: string): string {
  const text = utf8Hex(uri);
  return `0x${SEL.createConvictionMarket}${word(startsAt)}${word(expiresAt)}${word(collateral)}${word(0x80)}${bytesTail(text)}`;
}

export const respondData = (conditionId: string, accept: boolean): string => `0x${SEL.respondToUpdateRequest}${word(conditionId)}${word(accept ? 1 : 0)}`;

export const cancelData = (conditionId: string): string => `0x${SEL.cancelMarket}${word(conditionId)}`;

export const transferRemoteData = (domain: number, recipient: string, amount: bigint): string => `0x${SEL.transferRemote}${word(domain)}${word(recipient)}${word(amount)}`;

export interface HandCall {
  readonly to: string;
  readonly value: bigint;
  readonly data: string;
}

// execute(bytes32 mode, bytes executionCalldata), single mode: executionCalldata = target (20) ++ value (32) ++ data.
export function executeSingleData(call: HandCall): string {
  const exec = strip(call.to) + word(call.value) + strip(call.data);
  return `0x${SEL.execute}${word(0)}${word(0x40)}${bytesTail(exec)}`;
}

// execute(bytes32 mode, bytes executionCalldata), batch mode: executionCalldata = abi.encode(Execution[]) where
// Execution = (address target, uint256 value, bytes callData).
export function executeBatchData(calls: readonly HandCall[]): string {
  const elements = calls.map((c) => word(c.to) + word(c.value) + word(0x60) + bytesTail(c.data));
  let offset = calls.length * 32; // the array's offset table is `n` words, offsets count from the first word after the length
  const table: string[] = [];
  for (const element of elements) {
    table.push(word(offset));
    offset += element.length / 2;
  }
  const exec = word(0x20) + word(calls.length) + table.join("") + elements.join("");
  const mode = `01${"00".repeat(31)}`;
  return `0x${SEL.execute}${mode}${word(0x40)}${bytesTail(exec)}`;
}

// The same address with the case of its first letter flipped: a wrong EIP-55 checksum (test input only).
export function badChecksum(address: string): `0x${string}` {
  const index = address.slice(2).search(/[a-fA-F]/) + 2;
  const ch = address[index] ?? "a";
  const flipped = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  return `${address.slice(0, index)}${flipped}${address.slice(index + 1)}` as `0x${string}`;
}
