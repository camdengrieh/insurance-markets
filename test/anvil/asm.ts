// A very small EVM assembler, only so the harness can ship its stub contracts (a plain ERC-20, a
// Conditional Tokens stub, an exchange stub) without a Solidity compiler: this project has none and
// must not fetch one. It does three things: names for the opcodes the stubs use, PUSH sizing, and
// labels with two-byte jump targets (stubs stay far below 64 KiB).
//
// It is test tooling. Nothing under src/ or relay/ imports it, and the stubs it builds are exercised
// against viem and a real EVM in test/anvil/stubs.test.ts, so a mistake here shows up there.

import { bytesToHex, hexToBytes, type Hex } from "viem";

const OPCODES = {
  STOP: 0x00,
  ADD: 0x01,
  MUL: 0x02,
  SUB: 0x03,
  DIV: 0x04,
  LT: 0x10,
  GT: 0x11,
  EQ: 0x14,
  ISZERO: 0x15,
  AND: 0x16,
  OR: 0x17,
  SHL: 0x1b,
  SHR: 0x1c,
  SHA3: 0x20,
  ADDRESS: 0x30,
  CALLER: 0x33,
  CALLVALUE: 0x34,
  CALLDATALOAD: 0x35,
  CALLDATASIZE: 0x36,
  CALLDATACOPY: 0x37,
  CODECOPY: 0x39,
  EXTCODESIZE: 0x3b,
  RETURNDATASIZE: 0x3d,
  RETURNDATACOPY: 0x3e,
  POP: 0x50,
  MLOAD: 0x51,
  MSTORE: 0x52,
  SLOAD: 0x54,
  SSTORE: 0x55,
  JUMP: 0x56,
  JUMPI: 0x57,
  GAS: 0x5a,
  JUMPDEST: 0x5b,
  DUP1: 0x80,
  DUP2: 0x81,
  DUP3: 0x82,
  DUP4: 0x83,
  DUP5: 0x84,
  DUP6: 0x85,
  DUP7: 0x86,
  SWAP1: 0x90,
  SWAP2: 0x91,
  SWAP3: 0x92,
  LOG0: 0xa0,
  LOG1: 0xa1,
  LOG2: 0xa2,
  LOG3: 0xa3,
  LOG4: 0xa4,
  CALL: 0xf1,
  RETURN: 0xf3,
  STATICCALL: 0xfa,
  REVERT: 0xfd,
} as const;

export type OpName = keyof typeof OPCODES;

type Item =
  | { readonly kind: "bytes"; readonly bytes: Uint8Array }
  | { readonly kind: "label"; readonly name: string; readonly jumpdest: boolean }
  | { readonly kind: "ref"; readonly name: string };

export class Assembler {
  private readonly items: Item[] = [];

  op(...names: OpName[]): this {
    for (const name of names) this.items.push({ kind: "bytes", bytes: Uint8Array.of(OPCODES[name]) });
    return this;
  }

  // Smallest PUSHn that holds the value (PUSH1 0x00 for zero; PUSH0 is avoided so the output runs on
  // any hardfork).
  push(value: bigint | number | Hex): this {
    let bytes: Uint8Array;
    if (typeof value === "string") {
      bytes = hexToBytes(value);
      if (bytes.length === 0 || bytes.length > 32) throw new Error("push: 1 to 32 bytes");
    } else {
      let remaining = BigInt(value);
      if (remaining < 0n) throw new Error("push: negative value");
      const out: number[] = [];
      while (remaining > 0n) {
        out.unshift(Number(remaining & 0xffn));
        remaining >>= 8n;
      }
      if (out.length === 0) out.push(0);
      if (out.length > 32) throw new Error("push: value wider than 32 bytes");
      bytes = Uint8Array.from(out);
    }
    this.items.push({ kind: "bytes", bytes: Uint8Array.of(0x5f + bytes.length, ...bytes) });
    return this;
  }

  // A fixed-width PUSH (keeps leading zero bytes), for selectors and topics that must keep their width.
  pushBytes(value: Hex): this {
    const bytes = hexToBytes(value);
    if (bytes.length === 0 || bytes.length > 32) throw new Error("pushBytes: 1 to 32 bytes");
    this.items.push({ kind: "bytes", bytes: Uint8Array.of(0x5f + bytes.length, ...bytes) });
    return this;
  }

  // A JUMPDEST at this position, addressable by name.
  label(name: string): this {
    this.items.push({ kind: "label", name, jumpdest: true });
    return this;
  }

  // A position that is not a JUMPDEST (the start of a data section for CODECOPY).
  mark(name: string): this {
    this.items.push({ kind: "label", name, jumpdest: false });
    return this;
  }

  // PUSH2 <address of label>.
  ref(name: string): this {
    this.items.push({ kind: "ref", name });
    return this;
  }

  jump(name: string): this {
    return this.ref(name).op("JUMP");
  }

  jumpi(name: string): this {
    return this.ref(name).op("JUMPI");
  }

  // Raw bytes (a data section after the last STOP, RETURN or REVERT).
  data(bytes: Hex): this {
    this.items.push({ kind: "bytes", bytes: hexToBytes(bytes) });
    return this;
  }

  build(): Hex {
    const positions = new Map<string, number>();
    let position = 0;
    for (const item of this.items) {
      if (item.kind === "bytes") position += item.bytes.length;
      else if (item.kind === "ref") position += 3;
      else {
        if (positions.has(item.name)) throw new Error(`duplicate label ${item.name}`);
        positions.set(item.name, position);
        if (item.jumpdest) position += 1;
      }
    }
    if (position > 0xffff) throw new Error("program larger than 64 KiB");
    const out: number[] = [];
    for (const item of this.items) {
      if (item.kind === "bytes") out.push(...item.bytes);
      else if (item.kind === "ref") {
        const target = positions.get(item.name);
        if (target === undefined) throw new Error(`undefined label ${item.name}`);
        out.push(0x61, (target >> 8) & 0xff, target & 0xff);
      } else if (item.jumpdest) out.push(OPCODES.JUMPDEST);
    }
    return bytesToHex(Uint8Array.from(out));
  }

  // Offset of a label in the built program (for a CODECOPY of a data section, resolved by ref()).
  get length(): number {
    let size = 0;
    for (const item of this.items) {
      if (item.kind === "bytes") size += item.bytes.length;
      else if (item.kind === "ref") size += 3;
      else if (item.jumpdest) size += 1;
    }
    return size;
  }
}
