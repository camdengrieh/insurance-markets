// Stub contracts for the chain harness, built with the mini assembler in asm.ts.
//
// They stand in for contracts whose real code is not part of the harness. Each says plainly what it
// is, and none of them claims to be the real thing:
//
//   USDC.e        a PLAIN ERC-20, not FiatToken v2.2. Real USDC.e differs on allowance handling and
//                 has a blacklist and pausing (spec A9); this stub has neither. transferFrom always
//                 lowers the allowance (as FiatToken does, with no "unlimited" shortcut). mint() is
//                 open to everyone, which only a test chain can allow.
//   Conditional   a minimal ERC-1155-shaped stub: setApprovalForAll / isApprovedForAll with the real
//   Tokens        ApprovalForAll event, payoutDenominator with a test-only setter, and
//                 redeemPositions that reverts while the condition is unresolved and otherwise only
//                 records who redeemed which condition. No outcome tokens, no payouts.
//   Exchange      nonces(address) = 0 (the observed state: no NonceIncremented log has ever been
//                 emitted) and isValid1271(maker, hash, signature), which reproduces ONLY the final
//                 step of the real signature-type-3 check (docs/research/19 sec 7.1):
//                 maker.code.length > 0 and a Solady-style ERC-1271 STATICCALL whose first return
//                 word must be 0x1626ba7e followed by zeros. Orders, fills and fees do not exist.
//
// Unknown selectors revert, so a wrong call fails loudly instead of being swallowed.

import { encodeAbiParameters, parseAbi, toEventSelector, toFunctionSelector, type Hex } from "viem";

import { Assembler } from "./asm.js";

export const STUB_NOTICE = {
  usdce: "PLAIN ERC-20 TEST STUB. Not FiatToken v2.2: no blacklist, no pause, open mint.",
  ctf: "MINIMAL CONDITIONAL TOKENS STUB. Approvals and a redeem recorder only; no outcome tokens.",
  exchange: "MINIMAL EXCHANGE STUB. nonces() is 0 and isValid1271() replays only the final ERC-1271 step.",
} as const;

export const USDCE_STUB_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function mint(address to, uint256 value)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

export const CTF_STUB_ABI = parseAbi([
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
  "function stubSetPayoutDenominator(bytes32 conditionId, uint256 denominator)",
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
  "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
  "event StubRedeemPositions(address indexed caller, bytes32 indexed conditionId)",
]);

export const EXCHANGE_STUB_ABI = parseAbi([
  "function nonces(address user) view returns (uint128)",
  "function isValid1271(address maker, bytes32 hash, bytes signature) view returns (bool)",
]);

const ADDRESS_MASK: Hex = `0x${"ff".repeat(20)}`;
// 0x1626ba7e followed by 28 zero bytes: the first word a successful isValidSignature returns.
const MAGIC_WORD: Hex = `0x1626ba7e${"00".repeat(28)}`;

// ---- assembler macros. Each comment shows the stack, top on the right. -----------------------

function mask(a: Assembler): Assembler {
  return a.pushBytes(ADDRESS_MASK).op("AND");
}

// calldata word i as it is (a uint256 or bytes32)
function arg(a: Assembler, index: number): Assembler {
  return a.push(4 + 32 * index).op("CALLDATALOAD");
}

// calldata word i as a clean address
function argAddr(a: Assembler, index: number): Assembler {
  return mask(arg(a, index));
}

// [key] -> [keccak256(key . base)]  (the storage slot of mapping[key] at slot `base`)
function mapSlot(a: Assembler, base: number): void {
  a.push(0).op("MSTORE").push(base).push(32).op("MSTORE").push(64).push(0).op("SHA3");
}

// [inner, key] -> [keccak256(key . inner)]  (the slot of mapping[outer][key] once `inner` is known)
function nestedSlot(a: Assembler): void {
  a.push(0).op("MSTORE").push(32).op("MSTORE").push(64).push(0).op("SHA3");
}

// [word] -> return it
function returnWord(a: Assembler): void {
  a.push(0).op("MSTORE").push(32).push(0).op("RETURN");
}

type Push = (a: Assembler) => void;

// [v] -> [v]; reverts when balance[from] < v, otherwise lowers it
function debit(a: Assembler, from: Push): void {
  from(a); //                          [v, from]
  mapSlot(a, 0); //                    [v, fromSlot]
  a.op("DUP1", "SLOAD"); //            [v, fromSlot, fromBal]
  a.op("DUP3", "DUP2", "LT"); //       [v, fromSlot, fromBal, fromBal < v]
  a.jumpi("fail"); //                  [v, fromSlot, fromBal]
  a.op("DUP3", "SWAP1", "SUB"); //     [v, fromSlot, fromBal - v]
  a.op("SWAP1", "SSTORE"); //          [v]
}

// [v] -> [v]; raises balance[to] by v
function credit(a: Assembler, to: Push): void {
  to(a); //                            [v, to]
  mapSlot(a, 0); //                    [v, toSlot]
  a.op("DUP1", "SLOAD"); //            [v, toSlot, toBal]
  a.op("DUP3", "ADD"); //              [v, toSlot, toBal + v]
  a.op("SWAP1", "SSTORE"); //          [v]
}

// [v] -> []; emits Transfer(from, to, v)
function emitTransfer(a: Assembler, from: Push, to: Push): void {
  a.push(0).op("MSTORE"); //           []        mem[0] = v
  to(a); //                            [to]      topic2
  from(a); //                          [to, from] topic1
  a.pushBytes(toEventSelector("event Transfer(address indexed from, address indexed to, uint256 value)"));
  a.push(32).push(0).op("LOG3");
}

const pushCaller: Push = (a) => {
  a.op("CALLER");
};
const pushZero: Push = (a) => {
  a.push(0);
};

interface Fn {
  readonly signature: string;
  readonly label: string;
  body(a: Assembler): void;
}

function build(fns: readonly Fn[], tail?: (a: Assembler) => void): Hex {
  const a = new Assembler();
  a.op("CALLVALUE").jumpi("fail"); //                       no ether
  a.push(0).op("CALLDATALOAD").push(0xe0).op("SHR"); //     [selector]
  for (const fn of fns) {
    a.op("DUP1").pushBytes(toFunctionSelector(fn.signature)).op("EQ").jumpi(fn.label);
  }
  a.label("fail").push(0).op("DUP1", "REVERT"); //          unknown selector, or a failed check
  for (const fn of fns) {
    a.label(fn.label).op("POP");
    fn.body(a);
  }
  tail?.(a);
  return a.build();
}

// A function that returns a fixed ABI-encoded string stored after the code.
function staticString(label: string, text: string): { fn: Fn; data: (a: Assembler) => void } {
  const blob = encodeAbiParameters([{ type: "string" }], [text]);
  const size = (blob.length - 2) / 2;
  return {
    fn: {
      signature: `${label}()`,
      label,
      body: (a) => {
        a.push(size).ref(`${label}_data`).push(0).op("CODECOPY");
        a.push(size).push(0).op("RETURN");
      },
    },
    data: (a) => {
      a.mark(`${label}_data`).data(blob);
    },
  };
}

// ---- USDC.e (plain ERC-20) ---------------------------------------------------------------------

export function usdceStubRuntime(): Hex {
  const name = staticString("name", "Bridged USDC (XO) [TEST STUB, plain ERC-20]");
  const symbol = staticString("symbol", "USDC.e");
  const fns: Fn[] = [
    name.fn,
    symbol.fn,
    { signature: "decimals()", label: "decimals", body: (a) => { a.push(6); returnWord(a); } },
    { signature: "totalSupply()", label: "totalSupply", body: (a) => { a.push(2).op("SLOAD"); returnWord(a); } },
    {
      signature: "balanceOf(address)",
      label: "balanceOf",
      body: (a) => {
        argAddr(a, 0);
        mapSlot(a, 0);
        a.op("SLOAD");
        returnWord(a);
      },
    },
    {
      signature: "allowance(address,address)",
      label: "allowance",
      body: (a) => {
        argAddr(a, 0);
        mapSlot(a, 1); //              [inner]
        argAddr(a, 1); //              [inner, spender]
        nestedSlot(a);
        a.op("SLOAD");
        returnWord(a);
      },
    },
    {
      signature: "approve(address,uint256)",
      label: "approve",
      body: (a) => {
        a.op("CALLER");
        mapSlot(a, 1); //              [inner]
        argAddr(a, 0); //              [inner, spender]
        nestedSlot(a); //              [slot]
        arg(a, 1); //                  [slot, value]
        a.op("SWAP1", "SSTORE"); //    []
        arg(a, 1).push(0).op("MSTORE"); // mem[0] = value
        argAddr(a, 0); //              [spender]   topic2
        a.op("CALLER"); //             [spender, owner] topic1
        a.pushBytes(toEventSelector("event Approval(address indexed owner, address indexed spender, uint256 value)"));
        a.push(32).push(0).op("LOG3");
        a.push(1);
        returnWord(a);
      },
    },
    {
      signature: "transfer(address,uint256)",
      label: "transfer",
      body: (a) => {
        arg(a, 1); //                  [v]
        debit(a, pushCaller);
        credit(a, (b) => argAddr(b, 0));
        emitTransfer(a, pushCaller, (b) => argAddr(b, 0));
        a.push(1);
        returnWord(a);
      },
    },
    {
      signature: "transferFrom(address,address,uint256)",
      label: "transferFrom",
      body: (a) => {
        argAddr(a, 0);
        mapSlot(a, 1); //              [inner(from)]
        a.op("CALLER");
        nestedSlot(a); //              [allowanceSlot]
        a.op("DUP1", "SLOAD"); //      [slot, allowed]
        arg(a, 2); //                  [slot, allowed, v]
        a.op("DUP1", "DUP3", "LT"); // [slot, allowed, v, allowed < v]
        a.jumpi("fail"); //            [slot, allowed, v]
        a.op("DUP1", "DUP3", "SUB"); //[slot, allowed, v, allowed - v]
        a.op("DUP4", "SSTORE"); //     [slot, allowed, v]
        a.op("SWAP1", "POP", "SWAP1", "POP"); // [v]
        debit(a, (b) => argAddr(b, 0));
        credit(a, (b) => argAddr(b, 1));
        emitTransfer(a, (b) => argAddr(b, 0), (b) => argAddr(b, 1));
        a.push(1);
        returnWord(a);
      },
    },
    {
      signature: "mint(address,uint256)",
      label: "mint",
      body: (a) => {
        arg(a, 1); //                  [v]
        credit(a, (b) => argAddr(b, 0));
        a.push(2).op("SLOAD", "DUP2", "ADD").push(2).op("SSTORE"); // totalSupply += v
        emitTransfer(a, pushZero, (b) => argAddr(b, 0));
        a.op("STOP");
      },
    },
  ];
  return build(fns, (a) => {
    name.data(a);
    symbol.data(a);
  });
}

// ---- Conditional Tokens (minimal) ----------------------------------------------------------------

export function ctfStubRuntime(): Hex {
  const fns: Fn[] = [
    {
      signature: "setApprovalForAll(address,bool)",
      label: "setApprovalForAll",
      body: (a) => {
        a.op("CALLER");
        mapSlot(a, 0); //              [inner]
        argAddr(a, 0); //              [inner, operator]
        nestedSlot(a); //              [slot]
        arg(a, 1).op("ISZERO", "ISZERO"); // [slot, flag]
        a.op("DUP1").push(0).op("MSTORE"); // mem[0] = flag
        a.op("SWAP1", "SSTORE"); //    []
        argAddr(a, 0); //              [operator]  topic2
        a.op("CALLER"); //             [operator, account] topic1
        a.pushBytes(toEventSelector("event ApprovalForAll(address indexed account, address indexed operator, bool approved)"));
        a.push(32).push(0).op("LOG3", "STOP");
      },
    },
    {
      signature: "isApprovedForAll(address,address)",
      label: "isApprovedForAll",
      body: (a) => {
        argAddr(a, 0);
        mapSlot(a, 0); //              [inner]
        argAddr(a, 1);
        nestedSlot(a);
        a.op("SLOAD");
        returnWord(a);
      },
    },
    {
      signature: "payoutDenominator(bytes32)",
      label: "payoutDenominator",
      body: (a) => {
        arg(a, 0);
        mapSlot(a, 1);
        a.op("SLOAD");
        returnWord(a);
      },
    },
    {
      signature: "stubSetPayoutDenominator(bytes32,uint256)",
      label: "stubSetPayoutDenominator",
      body: (a) => {
        arg(a, 1); //                  [denominator]
        arg(a, 0);
        mapSlot(a, 1); //              [denominator, slot]
        a.op("SSTORE", "STOP");
      },
    },
    {
      signature: "redeemPositions(address,bytes32,bytes32,uint256[])",
      label: "redeemPositions",
      body: (a) => {
        arg(a, 2);
        mapSlot(a, 1);
        a.op("SLOAD", "ISZERO");
        a.jumpi("fail"); //            unresolved condition: revert, as the real contract does
        arg(a, 2); //                  [conditionId] topic2
        a.op("CALLER"); //             [conditionId, caller] topic1
        a.pushBytes(toEventSelector("event StubRedeemPositions(address indexed caller, bytes32 indexed conditionId)"));
        a.push(0).push(0).op("LOG3", "STOP");
      },
    },
  ];
  return build(fns);
}

// ---- Exchange (minimal) ----------------------------------------------------------------------------

export function exchangeStubRuntime(): Hex {
  const fns: Fn[] = [
    { signature: "nonces(address)", label: "nonces", body: (a) => { a.push(0); returnWord(a); } },
    {
      signature: "isValid1271(address,bytes32,bytes)",
      label: "isValid1271",
      body: (a) => {
        // calldata: [4] maker [36] hash [68] offset of the signature (from byte 4) [100] length [132] bytes
        argAddr(a, 0); //                                 [maker]
        a.op("DUP1", "EXTCODESIZE", "ISZERO").jumpi("invalid"); // maker.code.length > 0
        arg(a, 2).push(4).op("ADD"); //                   [maker, lengthPos]
        a.op("DUP1", "CALLDATALOAD"); //                  [maker, lengthPos, length]
        // memory: isValidSignature(bytes32,bytes) calldata = selector, hash, 0x40, length, bytes
        a.pushBytes(MAGIC_WORD).push(0).op("MSTORE"); //  mem[0] = selector (rest zero)
        arg(a, 1).push(4).op("MSTORE"); //                mem[4] = hash
        a.push(0x40).push(36).op("MSTORE"); //            mem[36] = offset of the bytes
        a.op("DUP1").push(68).op("MSTORE"); //            mem[68] = length
        a.op("DUP1"); //                                  [maker, lengthPos, length, length]
        a.op("DUP3").push(32).op("ADD"); //               [.., length, length, lengthPos + 32]
        a.push(100).op("CALLDATACOPY"); //                mem[100..] = signature bytes
        // staticcall(gas, maker, 0, 100 + length, 0, 32)
        a.push(32).push(0); //                            retSize, retOffset
        a.op("DUP3").push(100).op("ADD"); //              argsSize = 100 + length
        a.push(0); //                                     argsOffset
        a.op("DUP7", "GAS", "STATICCALL"); //             [maker, lengthPos, length, success]
        a.op("ISZERO").jumpi("invalid");
        a.op("RETURNDATASIZE").push(31).op("LT", "ISZERO").jumpi("invalid"); // returndatasize >= 32
        a.push(0).op("MLOAD").pushBytes(MAGIC_WORD).op("EQ", "ISZERO").jumpi("invalid");
        a.push(1);
        returnWord(a);
        a.label("invalid").push(0);
        returnWord(a);
      },
    },
  ];
  return build(fns);
}
