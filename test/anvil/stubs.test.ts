import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { concat, encodeFunctionData, keccak256, pad, toHex, zeroAddress, type Abi, type Address, type Hex } from "viem";

import { CONDITIONAL_TOKENS, CTF_EXCHANGE, USDC_E_ADDRESS } from "../../src/xo/chain/constants.js";
import { Assembler } from "./asm.js";
import { startXoChain, testAccount, type XoChain } from "./chain.js";
import { CTF_STUB_ABI, EXCHANGE_STUB_ABI, STUB_NOTICE, USDCE_STUB_ABI, ctfStubRuntime, exchangeStubRuntime, usdceStubRuntime } from "./stubs.js";

// The stub contracts are hand-assembled (no Solidity compiler in this project), so each behaviour the
// other tests rely on is proved here against a real EVM. The failing cases matter as much as the
// passing ones: a stub that silently accepted a bad call would hide bugs in the code under test.

let chain: XoChain | null = null;
let skipReason: string | null = null;
let snapshotId = "";

const alice = testAccount(2).address;
const bob = testAccount(3).address;
const carol = testAccount(4).address;
const MAX = 2n ** 256n - 1n;

before(async () => {
  const started = await startXoChain({ paymaster: false });
  if (started.ok) chain = started.chain;
  else skipReason = started.reason;
});

after(async () => {
  await chain?.stop();
});

// Every test starts from the freshly set up chain: revert to the last snapshot (anvil snapshots are
// single use) and take a new one.
beforeEach(async () => {
  if (chain === null) return;
  if (snapshotId !== "") await chain.revert(snapshotId);
  snapshotId = await chain.snapshot();
});

// An indexed address as it appears in a log topic: lower-case, left-padded to 32 bytes.
const topic = (address: string): Hex => pad(address.toLowerCase() as Hex, { size: 32 });

function need(): XoChain {
  if (chain === null) throw new Error("chain not started");
  return chain;
}

const read = <T>(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): Promise<T> =>
  need().publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

async function send(from: Address, to: Address, abi: Abi, functionName: string, args: readonly unknown[], value?: bigint) {
  const data = encodeFunctionData({ abi, functionName, args });
  return need().sendFrom(from, to, data, value === undefined ? {} : { value });
}

// A failing call mines as a reverted transaction when an explicit gas limit is given.
async function reverts(from: Address, to: Address, data: Hex, value?: bigint): Promise<boolean> {
  try {
    await need().anvil.rpc("eth_call", [{ from, to, data, ...(value !== undefined ? { value: toHex(value) } : {}) }, "latest"]);
    return false;
  } catch {
    return true;
  }
}

describe("harness stubs: the notices say what they are", () => {
  it("labels all three stubs as stubs", () => {
    for (const notice of Object.values(STUB_NOTICE)) assert.match(notice, /STUB/);
    assert.match(STUB_NOTICE.usdce, /Not FiatToken/);
  });

  it("builds deterministic runtime code (same bytes every time)", () => {
    assert.equal(usdceStubRuntime(), usdceStubRuntime());
    assert.equal(ctfStubRuntime(), ctfStubRuntime());
    assert.equal(exchangeStubRuntime(), exchangeStubRuntime());
    for (const code of [usdceStubRuntime(), ctfStubRuntime(), exchangeStubRuntime()]) assert.ok((code.length - 2) / 2 < 1500, "stubs stay small");
  });

  it("the assembler resolves labels and refuses undefined or duplicate ones", () => {
    const code = new Assembler().push(1).jumpi("end").op("STOP").label("end").op("STOP").build();
    assert.equal(code, "0x600161000757005b00");
    assert.throws(() => new Assembler().jump("nowhere").build(), /undefined label/);
    assert.throws(() => new Assembler().label("a").label("a").build(), /duplicate label/);
    assert.throws(() => new Assembler().push(-1n), /negative/);
    assert.throws(() => new Assembler().push(2n ** 256n), /wider/);
  });
});

describe("USDC.e stub: a plain ERC-20", () => {
  it("answers the metadata calls", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    assert.equal(await read<string>(USDC_E_ADDRESS, USDCE_STUB_ABI, "name"), "Bridged USDC (XO) [TEST STUB, plain ERC-20]");
    assert.equal(await read<string>(USDC_E_ADDRESS, USDCE_STUB_ABI, "symbol"), "USDC.e");
    assert.equal(await read<number>(USDC_E_ADDRESS, USDCE_STUB_ABI, "decimals"), 6);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "totalSupply"), 0n);
  });

  it("mints, moves balances and emits Transfer", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const minted = await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "mint", [alice, 1_000_000n]);
    assert.equal(minted.status, "success");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [alice]), 1_000_000n);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "totalSupply"), 1_000_000n);
    const transferLog = minted.logs[0];
    assert.equal(transferLog?.address.toLowerCase(), USDC_E_ADDRESS.toLowerCase());
    assert.equal(transferLog?.topics[0], keccak256(toHex("Transfer(address,address,uint256)")));
    assert.equal(transferLog?.topics[1], topic(zeroAddress));
    assert.equal(transferLog?.topics[2], topic(alice));
    assert.equal(transferLog?.data, pad(toHex(1_000_000n), { size: 32 }));

    const moved = await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "transfer", [bob, 400_000n]);
    assert.equal(moved.status, "success");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [alice]), 600_000n);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [bob]), 400_000n);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "totalSupply"), 1_000_000n);
    assert.equal(moved.logs[0]?.topics[1], topic(alice));
    assert.equal(moved.logs[0]?.topics[2], topic(bob));
  });

  it("refuses to move more than the balance, and leaves every balance untouched", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "mint", [alice, 100n]);
    const data = encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "transfer", args: [bob, 101n] });
    assert.equal(await reverts(alice, USDC_E_ADDRESS, data), true);
    const mined = await need().sendFrom(alice, USDC_E_ADDRESS, data);
    assert.equal(mined.status, "reverted");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [alice]), 100n);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [bob]), 0n);
    // exactly the balance is fine, and a self transfer changes nothing
    assert.equal((await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "transfer", [alice, 100n])).status, "success");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [alice]), 100n);
    assert.equal((await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "transfer", [bob, 100n])).status, "success");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [alice]), 0n);
  });

  it("approve sets a per-spender allowance, emits Approval and overwrites", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const approved = await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "approve", [CTF_EXCHANGE, MAX]);
    assert.equal(approved.status, "success");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "allowance", [alice, CTF_EXCHANGE]), MAX);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "allowance", [alice, bob]), 0n, "another spender is untouched");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "allowance", [bob, CTF_EXCHANGE]), 0n, "another owner is untouched");
    const log = approved.logs[0];
    assert.equal(log?.topics[0], keccak256(toHex("Approval(address,address,uint256)")));
    assert.equal(log?.topics[1], topic(alice));
    assert.equal(log?.topics[2], topic(CTF_EXCHANGE));
    assert.equal(log?.data, pad(toHex(MAX), { size: 32 }));
    await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "approve", [CTF_EXCHANGE, 0n]);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "allowance", [alice, CTF_EXCHANGE]), 0n);
  });

  it("transferFrom needs an allowance, spends it, and spends it even when it was the maximum", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "mint", [alice, 1_000n]);
    const pull = encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "transferFrom", args: [alice, carol, 300n] });
    assert.equal(await reverts(bob, USDC_E_ADDRESS, pull), true, "no allowance");
    await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "approve", [bob, 200n]);
    assert.equal(await reverts(bob, USDC_E_ADDRESS, pull), true, "allowance 200 < 300");
    await send(alice, USDC_E_ADDRESS, USDCE_STUB_ABI, "approve", [bob, MAX]);
    const done = await need().sendFrom(bob, USDC_E_ADDRESS, pull);
    assert.equal(done.status, "success");
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [alice]), 700n);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "balanceOf", [carol]), 300n);
    assert.equal(await read<bigint>(USDC_E_ADDRESS, USDCE_STUB_ABI, "allowance", [alice, bob]), MAX - 300n, "FiatToken style: no unlimited shortcut");
    // enough allowance but not enough balance
    const tooMuch = encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "transferFrom", args: [alice, carol, 701n] });
    assert.equal(await reverts(bob, USDC_E_ADDRESS, tooMuch), true);
  });

  it("rejects ether, short calldata and unknown selectors", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const balanceOf = encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "balanceOf", args: [alice] });
    assert.equal(await reverts(alice, USDC_E_ADDRESS, balanceOf, 1n), true, "non-payable");
    assert.equal(await reverts(alice, USDC_E_ADDRESS, "0x"), true, "no selector");
    assert.equal(await reverts(alice, USDC_E_ADDRESS, "0xdeadbeef"), true, "unknown selector");
    assert.equal(await reverts(alice, USDC_E_ADDRESS, concat([balanceOf, "0x00"])), false, "trailing bytes are ignored like the ABI decoder does");
  });
});

describe("Conditional Tokens stub", () => {
  const condition: Hex = keccak256(toHex("a test condition"));
  const exchange = CTF_EXCHANGE;

  it("setApprovalForAll stores the flag per (account, operator) and emits the real event", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    assert.equal(await read<boolean>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "isApprovedForAll", [alice, exchange]), false);
    const set = await send(alice, CONDITIONAL_TOKENS, CTF_STUB_ABI, "setApprovalForAll", [exchange, true]);
    assert.equal(set.status, "success");
    assert.equal(await read<boolean>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "isApprovedForAll", [alice, exchange]), true);
    assert.equal(await read<boolean>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "isApprovedForAll", [bob, exchange]), false);
    assert.equal(await read<boolean>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "isApprovedForAll", [alice, bob]), false);
    const log = set.logs[0];
    assert.equal(log?.topics[0], keccak256(toHex("ApprovalForAll(address,address,bool)")));
    assert.equal(log?.topics[1], topic(alice));
    assert.equal(log?.topics[2], topic(exchange));
    assert.equal(log?.data, pad("0x01", { size: 32 }));
    await send(alice, CONDITIONAL_TOKENS, CTF_STUB_ABI, "setApprovalForAll", [exchange, false]);
    assert.equal(await read<boolean>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "isApprovedForAll", [alice, exchange]), false);
  });

  it("redeemPositions reverts while the condition is unresolved and records the redeemer afterwards", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const redeem = encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "redeemPositions", args: [USDC_E_ADDRESS, `0x${"00".repeat(32)}`, condition, [1n, 2n]] });
    assert.equal(await reverts(alice, CONDITIONAL_TOKENS, redeem), true);
    assert.equal(await read<bigint>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "payoutDenominator", [condition]), 0n);
    await send(bob, CONDITIONAL_TOKENS, CTF_STUB_ABI, "stubSetPayoutDenominator", [condition, 1n]);
    assert.equal(await read<bigint>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "payoutDenominator", [condition]), 1n);
    const other: Hex = keccak256(toHex("another condition"));
    assert.equal(await read<bigint>(CONDITIONAL_TOKENS, CTF_STUB_ABI, "payoutDenominator", [other]), 0n, "other conditions stay unresolved");
    const mined = await need().sendFrom(alice, CONDITIONAL_TOKENS, redeem);
    assert.equal(mined.status, "success");
    const log = mined.logs[0];
    assert.equal(log?.topics[0], keccak256(toHex("StubRedeemPositions(address,bytes32)")));
    assert.equal(log?.topics[1], topic(alice));
    assert.equal(log?.topics[2], condition);
  });

  it("rejects ether and unknown selectors", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const approve = encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "setApprovalForAll", args: [exchange, true] });
    assert.equal(await reverts(alice, CONDITIONAL_TOKENS, approve, 1n), true);
    assert.equal(await reverts(alice, CONDITIONAL_TOKENS, "0xdeadbeef"), true);
  });
});

// A tiny ERC-1271 mock: returns the magic word only when it was called with exactly the hash, the
// signature length and the first signature word it was built to expect, so it proves that the
// exchange stub lays the isValidSignature(bytes32,bytes) call out the way a real ABI decoder reads it.
function oneToOneMock(hash: Hex, signature: Hex): Hex {
  const length = (signature.length - 2) / 2;
  const firstWord = signature.slice(0, 66) as Hex;
  const a = new Assembler();
  // selector, hash, offset 0x40, length and first word must all match; otherwise return zero
  a.push(0).op("CALLDATALOAD").push(0xe0).op("SHR").push(0x1626ba7e).op("EQ", "ISZERO").jumpi("bad");
  a.push(4).op("CALLDATALOAD").pushBytes(hash).op("EQ", "ISZERO").jumpi("bad");
  a.push(36).op("CALLDATALOAD").push(0x40).op("EQ", "ISZERO").jumpi("bad");
  a.push(68).op("CALLDATALOAD").push(length).op("EQ", "ISZERO").jumpi("bad");
  a.push(100).op("CALLDATALOAD").pushBytes(firstWord).op("EQ", "ISZERO").jumpi("bad");
  a.pushBytes(`0x1626ba7e${"00".repeat(28)}`).push(0).op("MSTORE").push(32).push(0).op("RETURN");
  a.label("bad").push(0).push(0).op("MSTORE").push(32).push(0).op("RETURN");
  return a.build();
}

describe("exchange stub", () => {
  const hash: Hex = keccak256(toHex("an order hash"));
  const signature = concat(["0x01", `0x${"ab".repeat(20)}`, `0x${"cd".repeat(65)}`]) as Hex; // 86 bytes, like the wire form
  const mock: Address = pad("0xa11ce", { size: 20 });

  it("nonces() is zero for everyone", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    assert.equal(await read<bigint>(CTF_EXCHANGE, EXCHANGE_STUB_ABI, "nonces", [alice]), 0n);
    assert.equal(await read<bigint>(CTF_EXCHANGE, EXCHANGE_STUB_ABI, "nonces", [zeroAddress]), 0n);
  });

  it("isValid1271 forwards exactly (hash, signature) and accepts only the magic value", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    await need().anvil.rpc("anvil_setCode", [mock, oneToOneMock(hash, signature)]);
    const valid = (maker: Address, h: Hex, sig: Hex): Promise<boolean> => read<boolean>(CTF_EXCHANGE, EXCHANGE_STUB_ABI, "isValid1271", [maker, h, sig]);
    assert.equal(await valid(mock, hash, signature), true);
    // each deviation is seen by the mock and answered with zero
    assert.equal(await valid(mock, keccak256(toHex("another hash")), signature), false, "wrong hash");
    assert.equal(await valid(mock, hash, concat([signature, "0x00"]) as Hex), false, "longer signature");
    assert.equal(await valid(mock, hash, `0x${signature.slice(2, -2)}` as Hex), false, "shorter signature");
    assert.equal(await valid(mock, hash, concat(["0x02", `0x${signature.slice(4)}`]) as Hex), false, "different first word");
    // an address with no code is not a valid maker, whatever the signature
    assert.equal(await valid(alice, hash, signature), false, "maker.code.length == 0");
  });

  it("is not fooled by a hash that starts with 28 zero bytes: the reply buffer begins as the call's own selector word", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const crafted: Hex = `0x${"00".repeat(28)}deadbeef`;
    const valid = (maker: Address): Promise<boolean> => read<boolean>(CTF_EXCHANGE, EXCHANGE_STUB_ABI, "isValid1271", [maker, crafted, signature]);
    // 1. A contract that answers with no data at all. Memory word 0 still holds 0x1626ba7e ++ hash[0..28], which
    //    equals the magic word for this hash, so only the returndatasize check keeps the stub from saying "valid".
    const silent = pad("0x51e47", { size: 20 });
    await need().anvil.rpc("anvil_setCode", [silent, new Assembler().op("STOP").build()]);
    assert.equal(await valid(silent), false);
    // 2. The identity precompile (address 4) has no code but echoes its input, whose first word is that same
    //    magic word. Only the maker.code.length > 0 check keeps the stub from saying "valid".
    assert.equal(await need().publicClient.getCode({ address: pad("0x04", { size: 20 }) }), undefined);
    assert.equal(await valid(pad("0x04", { size: 20 })), false);
  });

  it("is false when the maker reverts, returns the wrong word or returns too little", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const reverting = new Assembler().push(0).op("DUP1", "REVERT").build();
    const wrongWord = new Assembler().push(1).push(0).op("MSTORE").push(32).push(0).op("RETURN").build();
    const short = new Assembler().push(0x1626ba7e).push(0).op("MSTORE").push(4).push(28).op("RETURN").build();
    const empty = new Assembler().op("STOP").build();
    const cases: Array<[Address, Hex]> = [
      [pad("0xdead", { size: 20 }), reverting],
      [pad("0xbeef", { size: 20 }), wrongWord],
      [pad("0xc0de", { size: 20 }), short],
      [pad("0xface", { size: 20 }), empty],
    ];
    for (const [address, code] of cases) {
      await need().anvil.rpc("anvil_setCode", [address, code]);
      assert.equal(await read<boolean>(CTF_EXCHANGE, EXCHANGE_STUB_ABI, "isValid1271", [address, hash, signature]), false, address);
    }
  });
});
