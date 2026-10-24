import assert from "node:assert/strict";
import { test } from "node:test";

import { createPublicClient, custom, encodeFunctionData, getAddress, parseAbi, type Address, type Hex } from "viem";
import { entryPoint08Address, toSimple7702SmartAccount } from "viem/account-abstraction";
import { base } from "viem/chains";

import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_CTF_EXCHANGE, LIMITLESS_NEG_RISK_ADAPTER_V3, LIMITLESS_USDC } from "../../sdk/chain/limitless/constants.js";
import { POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_CTF_EXCHANGE, POLYMARKET_NEG_RISK_ADAPTER, POLYMARKET_PUSD, POLYMARKET_USDC_E } from "../../sdk/chain/polymarket/constants.js";
import {
  BNB_USDC,
  CHAIN_POLICIES,
  checkSponsoredCall,
  checkSponsoredCalls,
  checkWalletCall,
  decodeAccountCalls,
  ENTRY_POINT_V08,
  MAX_CALLS,
  POLYGON_NATIVE_USDC,
  POLYMARKET_COLLATERAL_ONRAMP,
  PREDICT_EXCHANGES,
  SIMPLE_7702_ABI,
  SIMPLE_7702_DELEGATION_CODE,
  SIMPLE_7702_IMPLEMENTATION,
  type Call,
} from "../../api/sponsor-policy.js";
import { testKey } from "./unified-helpers.js";

// The gas sponsor's call policy (api/sponsor-policy.ts): the Simple7702Account callData decoder, every allowed call kind
// and the refusals, the Deposit Wallet batch rule, and that the constants are the ones viem and the SDK name.

const E = testKey("policy-e");
const W = testKey("policy-w");
const STRANGER: Address = getAddress("0x00000000000000000000000000000000000c0ffe");
const TOKEN_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);
const NONCE32 = `0x${"ab".repeat(32)}` as Hex;
const R32 = `0x${"cd".repeat(32)}` as Hex;

const approve = (spender: Address, amount = 10n ** 30n): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "approve", args: [spender, amount] });
const transfer = (to: Address, amount = 1_000_000n): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "transfer", args: [to, amount] });
const setApproval = (operator: Address): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "setApprovalForAll", args: [operator, true] });
const deposit3009 = (to: Address): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "transferWithAuthorization", args: [W.address, to, 5_000_000n, 0n, 2_000_000_000n, NONCE32, 27, R32, R32] });
const deposit3009Bytes = (to: Address): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "transferWithAuthorization", args: [W.address, to, 5_000_000n, 0n, 2_000_000_000n, NONCE32, `0x${"ef".repeat(65)}`] });
const receive3009 = (to: Address): Hex => encodeFunctionData({ abi: TOKEN_ABI, functionName: "receiveWithAuthorization", args: [W.address, to, 5_000_000n, 0n, 2_000_000_000n, NONCE32, 28, R32, R32] });

function execute(calls: ReadonlyArray<{ readonly to: Address; readonly data: Hex; readonly value?: bigint }>): Hex {
  if (calls.length === 1) {
    const [call] = calls as [{ to: Address; data: Hex; value?: bigint }];
    return encodeFunctionData({ abi: SIMPLE_7702_ABI, functionName: "execute", args: [call.to, call.value ?? 0n, call.data] });
  }
  return encodeFunctionData({ abi: SIMPLE_7702_ABI, functionName: "executeBatch", args: [calls.map((call) => ({ target: call.to, value: call.value ?? 0n, data: call.data }))] });
}

const base8453 = (deposits: string[] = []) => ({ policy: CHAIN_POLICIES[8453], sender: E.address, bridgeDeposits: new Set(deposits.map((d) => d.toLowerCase())) });
const call = (to: Address, data: Hex, value = 0n): Call => ({ to, data, value });

test("the constants are viem's own and the cited addresses are valid EIP-55", async () => {
  assert.equal(ENTRY_POINT_V08, entryPoint08Address);
  // viem builds the EIP-7702 authorization of its Simple7702Account for exactly this implementation (EntryPoint 0.8).
  const client = createPublicClient({ chain: base, transport: custom({ request: async () => Promise.reject(new Error("no network in this test")) }) });
  const account = await toSimple7702SmartAccount({ client, owner: E });
  assert.equal(account.authorization?.address, SIMPLE_7702_IMPLEMENTATION);
  assert.equal(account.entryPoint.address, ENTRY_POINT_V08);
  assert.equal(account.entryPoint.version, "0.8");
  assert.equal(SIMPLE_7702_DELEGATION_CODE, `0xef0100${SIMPLE_7702_IMPLEMENTATION.slice(2).toLowerCase()}`);
  for (const address of [SIMPLE_7702_IMPLEMENTATION, POLYGON_NATIVE_USDC, POLYMARKET_COLLATERAL_ONRAMP, BNB_USDC, ...PREDICT_EXCHANGES]) assert.equal(getAddress(address), address);
  // Every chain lists its USDC; Polygon also pUSD and USDC.e.
  assert.deepEqual([...CHAIN_POLICIES[137].tokens.keys()], [POLYMARKET_PUSD, POLYMARKET_USDC_E, POLYGON_NATIVE_USDC].map((a) => a.toLowerCase()));
  assert.deepEqual([...CHAIN_POLICIES[8453].tokens.keys()], [LIMITLESS_USDC.toLowerCase()]);
  assert.deepEqual([...CHAIN_POLICIES[56].tokens.keys()], [BNB_USDC.toLowerCase()]);
});

test("callData decodes from Simple7702Account execute and executeBatch only", () => {
  const one = decodeAccountCalls(execute([{ to: LIMITLESS_USDC, data: approve(LIMITLESS_CTF_EXCHANGE) }]));
  assert.ok(one.ok);
  assert.deepEqual(one.calls, [{ to: LIMITLESS_USDC, value: 0n, data: approve(LIMITLESS_CTF_EXCHANGE) }]);
  const two = decodeAccountCalls(execute([{ to: LIMITLESS_USDC, data: approve(LIMITLESS_CTF_EXCHANGE) }, { to: LIMITLESS_CONDITIONAL_TOKENS, data: setApproval(LIMITLESS_CTF_EXCHANGE) }]));
  assert.ok(two.ok);
  assert.equal(two.calls.length, 2);
  // What viem's own Simple7702 account encodes decodes the same way.
  for (const bad of ["0x", "0x1234", "zz", approve(LIMITLESS_CTF_EXCHANGE), `${execute([{ to: LIMITLESS_USDC, data: "0x" }]).slice(0, 20)}`]) {
    assert.equal(decodeAccountCalls(bad).ok, false, bad.slice(0, 20));
  }
  const empty = encodeFunctionData({ abi: SIMPLE_7702_ABI, functionName: "executeBatch", args: [[]] });
  assert.deepEqual(decodeAccountCalls(empty), { ok: false, reason: "The batch has no call." });
  const many = execute(Array.from({ length: MAX_CALLS + 1 }, () => ({ to: LIMITLESS_USDC, data: approve(LIMITLESS_CTF_EXCHANGE) })));
  assert.equal(decodeAccountCalls(many).ok, false);
});

test("allowed: venue approvals, position approvals, EIP-3009 deposits into the sender, transfers (bridge or withdrawal)", () => {
  const cases: Array<[Call, string, string[]?]> = [
    [call(LIMITLESS_USDC, approve(LIMITLESS_CTF_EXCHANGE)), "approve"],
    [call(LIMITLESS_USDC, approve(LIMITLESS_NEG_RISK_ADAPTER_V3)), "approve"],
    [call(LIMITLESS_CONDITIONAL_TOKENS, setApproval(LIMITLESS_NEG_RISK_ADAPTER_V3)), "set_approval_for_all"],
    [call(LIMITLESS_USDC, deposit3009(E.address)), "eip3009_deposit"],
    [call(LIMITLESS_USDC, deposit3009Bytes(E.address)), "eip3009_deposit"],
    [call(LIMITLESS_USDC, receive3009(E.address)), "eip3009_deposit"],
    [call(LIMITLESS_USDC, transfer(W.address)), "withdrawal"],
    [call(LIMITLESS_USDC, transfer(STRANGER)), "bridge_deposit", [STRANGER]],
  ];
  for (const [c, kind, deposits] of cases) {
    const verdict = checkSponsoredCall(c, base8453(deposits));
    assert.deepEqual(verdict, { ok: true, kind }, kind);
  }
  const polygon = { policy: CHAIN_POLICIES[137], sender: E.address, bridgeDeposits: new Set<string>() };
  assert.deepEqual(checkSponsoredCall(call(POLYMARKET_PUSD, approve(POLYMARKET_CTF_EXCHANGE)), polygon), { ok: true, kind: "approve" });
  assert.deepEqual(checkSponsoredCall(call(POLYMARKET_USDC_E, approve(POLYMARKET_COLLATERAL_ONRAMP)), polygon), { ok: true, kind: "approve" });
  assert.deepEqual(checkSponsoredCall(call(POLYMARKET_CONDITIONAL_TOKENS, setApproval(POLYMARKET_NEG_RISK_ADAPTER)), polygon), { ok: true, kind: "set_approval_for_all" });
  assert.deepEqual(checkSponsoredCall(call(POLYGON_NATIVE_USDC, deposit3009(E.address)), polygon), { ok: true, kind: "eip3009_deposit" });
  const bnb = { policy: CHAIN_POLICIES[56], sender: E.address, bridgeDeposits: new Set<string>() };
  assert.deepEqual(checkSponsoredCall(call(BNB_USDC, approve(PREDICT_EXCHANGES[0] as Address)), bnb), { ok: true, kind: "approve" });
  // A batch counts its withdrawals.
  const batch = checkSponsoredCalls([call(LIMITLESS_USDC, transfer(W.address)), call(LIMITLESS_USDC, transfer(STRANGER)), call(LIMITLESS_USDC, approve(LIMITLESS_CTF_EXCHANGE))], base8453());
  assert.ok(batch.ok);
  assert.equal(batch.withdrawals, 2);
});

test("refused: value, unlisted token, spender or operator, self-calls, other functions, 3009 to someone else, other chain's contracts", () => {
  const refusals: Array<[Call, RegExp]> = [
    [call(LIMITLESS_USDC, approve(LIMITLESS_CTF_EXCHANGE), 1n), /no native value/],
    [call(STRANGER, approve(LIMITLESS_CTF_EXCHANGE)), /not a token the sponsor lists/],
    [call(LIMITLESS_USDC, approve(STRANGER)), /spender is not a listed venue contract/],
    [call(LIMITLESS_CONDITIONAL_TOKENS, setApproval(STRANGER)), /operator is not a listed venue contract/],
    [call(LIMITLESS_CTF_EXCHANGE, setApproval(LIMITLESS_CTF_EXCHANGE)), /not a position contract/],
    [call(E.address, approve(LIMITLESS_CTF_EXCHANGE)), /does not call the account itself/],
    [call(LIMITLESS_USDC, encodeFunctionData({ abi: TOKEN_ABI, functionName: "transferFrom", args: [W.address, STRANGER, 1n] })), /not one the sponsor pays for/],
    [call(LIMITLESS_USDC, "0x"), /not one the sponsor pays for/],
    [call(LIMITLESS_USDC, deposit3009(STRANGER)), /pays the account that sends it/],
    [call(LIMITLESS_USDC, transfer("0x0000000000000000000000000000000000000000")), /zero address/],
    // A Polygon exchange approved on Base, and a Limitless exchange approved with Polygon's pUSD policy.
    [call(LIMITLESS_USDC, approve(POLYMARKET_CTF_EXCHANGE)), /spender is not a listed venue contract/],
  ];
  for (const [c, reason] of refusals) {
    const verdict = checkSponsoredCall(c, base8453());
    assert.equal(verdict.ok, false, reason.source);
    assert.match(verdict.ok ? "" : verdict.reason, reason);
  }
  const polygon = { policy: CHAIN_POLICIES[137], sender: E.address, bridgeDeposits: new Set<string>() };
  assert.equal(checkSponsoredCall(call(POLYMARKET_PUSD, approve(LIMITLESS_CTF_EXCHANGE)), polygon).ok, false);
  // pUSD and USDC.e have no EIP-3009 here.
  assert.match((checkSponsoredCall(call(POLYMARKET_PUSD, deposit3009(E.address)), polygon) as { reason: string }).reason, /EIP-3009/);
  const batch = checkSponsoredCalls([call(LIMITLESS_USDC, approve(LIMITLESS_CTF_EXCHANGE)), call(LIMITLESS_USDC, approve(STRANGER))], base8453());
  assert.equal(batch.ok ? -1 : batch.index, 1);
});

test("a Deposit Wallet batch call: listed targets, approvals to listed spenders, transfers only back to the owner", () => {
  assert.deepEqual(checkWalletCall(call(POLYMARKET_PUSD, approve(POLYMARKET_CTF_EXCHANGE)), E.address), { ok: true });
  assert.deepEqual(checkWalletCall(call(POLYMARKET_PUSD, transfer(E.address)), E.address), { ok: true });
  assert.deepEqual(checkWalletCall(call(POLYMARKET_CONDITIONAL_TOKENS, setApproval(POLYMARKET_CTF_EXCHANGE)), E.address), { ok: true });
  // Any function on the adapters and position contracts (redeem, split, merge, wrap).
  assert.deepEqual(checkWalletCall(call(POLYMARKET_NEG_RISK_ADAPTER, "0xdeadbeef"), E.address), { ok: true });
  assert.deepEqual(checkWalletCall(call(POLYMARKET_COLLATERAL_ONRAMP, "0x12345678"), E.address), { ok: true });
  for (const [c, reason] of [
    [call(POLYMARKET_PUSD, transfer(STRANGER)), /only to the wallet's owner/],
    [call(POLYMARKET_PUSD, approve(STRANGER)), /not a listed venue contract/],
    [call(POLYMARKET_CONDITIONAL_TOKENS, setApproval(STRANGER)), /operator is not a listed/],
    [call(POLYMARKET_CTF_EXCHANGE, "0x12345678"), /not a contract this relay lets/],
    [call(STRANGER, "0x"), /not a contract this relay lets/],
    [call(POLYMARKET_PUSD, approve(POLYMARKET_CTF_EXCHANGE), 1n), /no native value/],
    [call(POLYMARKET_PUSD, encodeFunctionData({ abi: TOKEN_ABI, functionName: "transferFrom", args: [W.address, E.address, 1n] })), /Only approve and transfer/],
  ] as Array<[Call, RegExp]>) {
    const verdict = checkWalletCall(c, E.address);
    assert.match(verdict.ok ? "" : verdict.reason, reason);
  }
});
