import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import { getAddress } from "viem";

import {
  APPROVE_CALLDATA_BYTES,
  APPROVE_SELECTOR,
  BASE_USDC,
  BASE_WARP_ROUTER,
  FUNDING_VALUE_WEI,
  HYPERLANE_DOMAIN_XO,
  MARKET_MANAGER,
  TRANSFER_REMOTE_CALLDATA_BYTES,
  TRANSFER_REMOTE_SELECTOR,
  XO_WARP_ROUTE,
  type Hex,
} from "../src/xo/chain/constants.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import {
  FUNDING_CHAIN,
  FundingCalldataError,
  MAX_FUNDING_ATOMIC,
  buildApproveCall,
  buildFundingCalls,
  buildTransferRemoteCall,
  decodeFundingCall,
  decodeFundingData,
  encodeApprove,
  encodeTransferRemote,
  isLeftPaddedRecipient,
  padRecipient,
  parseFundingAmount,
  recipientFromWord,
  requireFundingAmount,
  requireFundingRecipient,
  verifyFundingCall,
  type FundingCall,
} from "../src/xo/funding/calldata.js";
import { ACCOUNT, ACCOUNT_B, ANVIL_PAIRS, OWNER, OWNER_B, prng, randomHex } from "./funding-helpers.js";

// Calldata goldens. The hex strings below were produced by Foundry cast 1.7.1 offline:
//   cast calldata "approve(address,uint256)" <router> 5000000
//   cast calldata "transferRemote(uint32,bytes32,uint256)" 3223 <bytes32 recipient> <amount>
// The first two are also the worked example in docs/research/20-funding-route-verification.md section 4.
const GOLDEN_APPROVE_5 =
  "0x095ea7b300000000000000000000000054716a535c3b5616e3f0d4d5005fc4bb660cdf5f00000000000000000000000000000000000000000000000000000000004c4b40";
const GOLDEN_TRANSFER_SYNTHETIC_5 =
  "0x81b4e8b40000000000000000000000000000000000000000000000000000000000000c97000000000000000000000000333333333333333333333333333333333333333300000000000000000000000000000000000000000000000000000000004c4b40";
const GOLDEN_TRANSFER_ANVIL0_1 =
  "0x81b4e8b40000000000000000000000000000000000000000000000000000000000000c97000000000000000000000000b3729f7e1ab0b4a50e7de5599ecc321b8775d30d00000000000000000000000000000000000000000000000000000000000f4240";
// A synthetic recipient for the golden only (all 3s): it is not a derived account, so it goes through the
// low-level encoder, which checks the padding but not the owner.
const SYNTHETIC_WORD: Hex = `0x${"0".repeat(24)}${"33".repeat(20)}`;

function castCalldata(signature: string, ...args: string[]): string | undefined {
  try {
    return execFileSync("cast", ["calldata", signature, ...args], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}
const CAST_PRESENT = castCalldata("approve(address,uint256)", BASE_WARP_ROUTER, "1") !== undefined;
const castOnly = CAST_PRESENT ? {} : { skip: "foundry cast is not on PATH; the pinned goldens above still run" };

const wordOf = (address: string): Hex => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as Hex;
const hex32 = (value: bigint): string => value.toString(16).padStart(64, "0");

describe("pinned shapes", () => {
  it("uses the two selectors and lengths of docs/research/20", () => {
    assert.equal(APPROVE_SELECTOR, "0x095ea7b3");
    assert.equal(TRANSFER_REMOTE_SELECTOR, "0x81b4e8b4");
    assert.equal(APPROVE_CALLDATA_BYTES, 68);
    assert.equal(TRANSFER_REMOTE_CALLDATA_BYTES, 100);
    assert.equal(FUNDING_CHAIN, "eip155:8453");
    assert.equal(FUNDING_VALUE_WEI, "0");
    assert.equal(HYPERLANE_DOMAIN_XO, 3223);
  });

  it("builds both calls with value 0 on Base, to the pinned token and router", () => {
    const calls = buildFundingCalls({ owner: OWNER, amount: 3n * 1_000_000n });
    assert.equal(calls.account, ACCOUNT);
    assert.equal(calls.approve.to, BASE_USDC);
    assert.equal(calls.transfer.to, BASE_WARP_ROUTER);
    for (const call of [calls.approve, calls.transfer]) {
      assert.equal(call.chain, "eip155:8453");
      assert.equal(call.value, "0");
    }
    assert.equal((calls.approve.data.length - 2) / 2, 68);
    assert.equal((calls.transfer.data.length - 2) / 2, 100);
  });
});

describe("calldata goldens (cast)", () => {
  it("approve(router, 5 USDC) is byte-identical to the recorded cast output", () => {
    assert.equal(encodeApprove(5_000_000n), GOLDEN_APPROVE_5);
    assert.equal(buildApproveCall(5_000_000n).data, GOLDEN_APPROVE_5);
  });

  it("transferRemote(3223, 0x3333..., 5 USDC) is byte-identical to the recorded cast output", () => {
    assert.equal(encodeTransferRemote(SYNTHETIC_WORD, 5_000_000n), GOLDEN_TRANSFER_SYNTHETIC_5);
  });

  it("transferRemote to the derived account of Anvil account 0 for 1 USDC matches the recorded cast output", () => {
    const call = buildTransferRemoteCall({ owner: OWNER, account: ACCOUNT, amount: 1_000_000n });
    assert.equal(call.data, GOLDEN_TRANSFER_ANVIL0_1);
  });

  it("matches a fresh cast run for fixed inputs", castOnly, () => {
    for (const amount of [1n, 999_999n, 1_000_000n, 2_500_000n, 3_000_000n, 50_000_000n, MAX_FUNDING_ATOMIC]) {
      assert.equal(encodeApprove(amount), castCalldata("approve(address,uint256)", BASE_WARP_ROUTER, amount.toString()), `approve ${amount}`);
    }
  });

  it("matches cast for the derived account of all ten Anvil owners at three amounts", castOnly, () => {
    assert.equal(ANVIL_PAIRS.length, 10);
    for (const pair of ANVIL_PAIRS) {
      for (const amount of [1n, 2_500_000n, 50_000_000n]) {
        const ours = buildTransferRemoteCall({ owner: pair.owner, account: deriveAccount(pair.owner), amount }).data;
        const theirs = castCalldata("transferRemote(uint32,bytes32,uint256)", "3223", wordOf(pair.account), amount.toString());
        assert.equal(ours, theirs, `${pair.index} ${amount}`);
      }
    }
  });
});

describe("the recipient word", () => {
  it("is the account in the low 20 bytes with 12 zero bytes above it", () => {
    const word = padRecipient(ACCOUNT);
    assert.equal(word.length, 66);
    assert.equal(word.slice(0, 26), `0x${"0".repeat(24)}`);
    assert.equal(word.slice(26), ACCOUNT.slice(2).toLowerCase());
    assert.equal(recipientFromWord(word), ACCOUNT);
    assert.equal(isLeftPaddedRecipient(word), true);
  });

  it("holds for 400 random owners and amounts (fixed seed): padded, round-trips, equals an independent encoding", () => {
    const next = prng(20_261_019);
    for (let i = 0; i < 400; i += 1) {
      const owner = getAddress(randomHex(next, 20));
      const account = deriveAccount(owner);
      const amount = 1n + BigInt(Math.floor(next() * 4_000_000_000)) * BigInt(1 + Math.floor(next() * 200));
      const calls = buildFundingCalls({ owner, amount });
      assert.equal(calls.account, account);
      const data = calls.transfer.data;
      // Independent layout: selector, domain word, recipient word, amount word.
      const expected = `0x81b4e8b4${hex32(3223n)}${"0".repeat(24)}${account.slice(2).toLowerCase()}${hex32(amount)}`;
      assert.equal(data, expected);
      // The upper 12 bytes of the recipient word (bytes 36 to 47 of the calldata) are zero.
      assert.equal(data.slice(2 + 2 * 36, 2 + 2 * 48), "0".repeat(24));
      const decoded = decodeFundingCall(calls.transfer);
      assert.deepEqual(decoded, { kind: "transfer", destination: 3223, recipientWord: padRecipient(account), recipient: account, amount });
      const approve = decodeFundingCall(calls.approve);
      assert.deepEqual(approve, { kind: "approve", spender: BASE_WARP_ROUTER, amount });
    }
  });

  it("refuses a word whose upper bytes are not zero", () => {
    const right = `0x${ACCOUNT.slice(2).toLowerCase()}${"0".repeat(24)}`;
    assert.equal(isLeftPaddedRecipient(right), false);
    assert.throws(() => recipientFromWord(right), (error) => error instanceof FundingCalldataError && error.code === "bad_padding");
    assert.throws(() => encodeTransferRemote(right, 1n), (error) => error instanceof FundingCalldataError && error.code === "bad_padding");
    for (let byte = 0; byte < 12; byte += 1) {
      const dirty = `0x${"0".repeat(byte * 2)}01${"0".repeat(22 - byte * 2)}${ACCOUNT.slice(2).toLowerCase()}`;
      assert.equal(isLeftPaddedRecipient(dirty), false, `byte ${byte}`);
    }
    assert.equal(isLeftPaddedRecipient("0x1234"), false);
  });

  it("refuses an account that is not a valid EIP-55 address", () => {
    assert.throws(() => padRecipient("0x1234"), (error) => error instanceof FundingCalldataError && error.code === "invalid_account");
    // Flip the case of the first letter: a mixed-case address with a wrong checksum.
    const at = ACCOUNT.slice(2).search(/[a-fA-F]/) + 2;
    const letter = ACCOUNT[at] as string;
    const bad = `${ACCOUNT.slice(0, at)}${letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()}${ACCOUNT.slice(at + 1)}`;
    assert.notEqual(bad, ACCOUNT);
    assert.throws(() => padRecipient(bad), (error) => error instanceof FundingCalldataError && error.code === "invalid_account");
  });
});

describe("recipient policy (FU3)", () => {
  const code = (run: () => unknown): string | undefined => {
    try {
      run();
    } catch (error) {
      return error instanceof FundingCalldataError ? error.code : `other:${String(error)}`;
    }
    return undefined;
  };

  it("accepts exactly the account derived from the owner", () => {
    assert.deepEqual(requireFundingRecipient(OWNER, ACCOUNT), { owner: OWNER, account: ACCOUNT });
    assert.deepEqual(requireFundingRecipient(OWNER_B, ACCOUNT_B), { owner: OWNER_B, account: ACCOUNT_B });
  });

  it("refuses the zero address", () => {
    assert.equal(code(() => requireFundingRecipient(OWNER, "0x0000000000000000000000000000000000000000")), "zero_recipient");
    assert.equal(code(() => buildTransferRemoteCall({ owner: OWNER, account: "0x0000000000000000000000000000000000000000", amount: 1n })), "zero_recipient");
  });

  it("refuses the owner EOA as recipient", () => {
    assert.equal(code(() => requireFundingRecipient(OWNER, OWNER)), "recipient_is_owner");
    assert.equal(code(() => requireFundingRecipient(OWNER, OWNER.toLowerCase())), "recipient_is_owner");
    assert.equal(code(() => buildTransferRemoteCall({ owner: OWNER, account: OWNER, amount: 1n })), "recipient_is_owner");
  });

  it("refuses an account derived from someone else's owner", () => {
    assert.equal(code(() => requireFundingRecipient(OWNER, ACCOUNT_B)), "recipient_not_derived");
    assert.equal(code(() => buildFundingCalls({ owner: OWNER, account: ACCOUNT_B, amount: 1n })), "recipient_not_derived");
  });

  it("refuses a protocol contract as recipient", () => {
    for (const contract of [BASE_WARP_ROUTER, XO_WARP_ROUTE, BASE_USDC, MARKET_MANAGER]) {
      assert.equal(code(() => requireFundingRecipient(OWNER, contract)), "recipient_protocol_contract", contract);
    }
  });

  it("refuses an owner that cannot own an account", () => {
    assert.equal(code(() => buildFundingCalls({ owner: "0x0000000000000000000000000000000000000000", amount: 1n })), "invalid_owner");
    assert.equal(code(() => buildFundingCalls({ owner: BASE_WARP_ROUTER, amount: 1n })), "invalid_owner");
    assert.equal(code(() => buildFundingCalls({ owner: "not an address", amount: 1n })), "invalid_owner");
    assert.equal(code(() => requireFundingRecipient("0x1234", ACCOUNT)), "invalid_owner");
  });

  it("derives the account from the owner and takes none from outside", () => {
    const calls = buildFundingCalls({ owner: OWNER_B, amount: 1n });
    assert.equal(calls.account, ACCOUNT_B);
    assert.equal(decodeFundingData(calls.transfer.data).kind, "transfer");
  });
});

describe("amounts", () => {
  it("parses decimal strings exactly", () => {
    assert.deepEqual(parseFundingAmount("1"), { ok: true, value: 1_000_000n });
    assert.deepEqual(parseFundingAmount("2.5"), { ok: true, value: 2_500_000n });
    assert.deepEqual(parseFundingAmount("0.000001"), { ok: true, value: 1n });
    assert.deepEqual(parseFundingAmount("1000000"), { ok: true, value: MAX_FUNDING_ATOMIC });
  });

  it("refuses zero, signs, exponents, separators, hex, extra decimals and non-strings", () => {
    for (const bad of ["0", "0.0", "-1", "+1", "1e6", "1,000", "0x10", "1.0000001", "", " 1", "1 ", "1\n", "١", ".5", "1.", "NaN", "Infinity"]) {
      const result = parseFundingAmount(bad);
      assert.equal(result.ok, false, JSON.stringify(bad));
    }
    for (const bad of [1, 1n, null, undefined, {}, ["1"]]) assert.equal(parseFundingAmount(bad).ok, false);
  });

  it("refuses an amount above the sanity bound, so an unlimited approve cannot be built", () => {
    assert.equal(parseFundingAmount("1000000.000001").ok, false);
    const unlimited = 2n ** 256n - 1n;
    for (const bad of [0n, -1n, MAX_FUNDING_ATOMIC + 1n, unlimited, 2n ** 128n]) {
      assert.throws(() => requireFundingAmount(bad), FundingCalldataError);
      assert.throws(() => encodeApprove(bad), FundingCalldataError);
      assert.throws(() => encodeTransferRemote(SYNTHETIC_WORD, bad), FundingCalldataError);
      assert.throws(() => buildFundingCalls({ owner: OWNER, amount: bad }), FundingCalldataError);
    }
    for (const bad of [1, "1", null, undefined, 1.5]) assert.throws(() => requireFundingAmount(bad), FundingCalldataError);
  });

  it("refuses a destination that is not a uint32", () => {
    for (const bad of [0, -1, 1.5, 2 ** 32, Number.NaN]) {
      assert.throws(() => encodeTransferRemote(SYNTHETIC_WORD, 1n, bad), (error) => error instanceof FundingCalldataError && error.code === "wrong_destination");
    }
  });
});

describe("verifyFundingCall: the last gate before PayBox", () => {
  const amount = 2_500_000n;
  const good = buildFundingCalls({ owner: OWNER, amount });
  const expected = { owner: OWNER, account: ACCOUNT, amount };
  const codeOf = (call: FundingCall, override: Partial<typeof expected> = {}): string | undefined => {
    try {
      verifyFundingCall(call, { ...expected, ...override });
    } catch (error) {
      return error instanceof FundingCalldataError ? error.code : `other:${String(error)}`;
    }
    return undefined;
  };

  it("accepts both good calls", () => {
    assert.equal(codeOf(good.approve), undefined);
    assert.equal(codeOf(good.transfer), undefined);
  });

  it("refuses a wrong chain", () => {
    assert.equal(codeOf({ ...good.approve, chain: "eip155:1" }), "wrong_chain");
    assert.equal(codeOf({ ...good.transfer, chain: "eip155:3223" }), "wrong_chain");
    assert.equal(codeOf({ ...good.transfer, chain: "eip155:08453" }), "wrong_chain");
  });

  it("refuses a non-zero value in any spelling", () => {
    for (const value of ["1", "1000000000000000000", "00", "0x0", "0.0", " 0", ""]) {
      assert.equal(codeOf({ ...good.transfer, value }), "value_not_zero", JSON.stringify(value));
    }
  });

  it("refuses a wrong router or token", () => {
    assert.equal(codeOf({ ...good.transfer, to: XO_WARP_ROUTE }), "wrong_target");
    assert.equal(codeOf({ ...good.transfer, to: BASE_USDC }), "wrong_target");
    assert.equal(codeOf({ ...good.approve, to: BASE_WARP_ROUTER }), "wrong_target");
  });

  it("refuses an approve for another spender", () => {
    const other = `${APPROVE_SELECTOR}${"0".repeat(24)}${ACCOUNT.slice(2).toLowerCase()}${hex32(amount)}` as Hex;
    assert.equal(codeOf({ ...good.approve, data: other }), "wrong_spender");
  });

  it("refuses a wrong destination domain", () => {
    for (const domain of [1, 8453, 3222, 3224]) {
      const data = encodeTransferRemote(padRecipient(ACCOUNT), amount, domain);
      assert.equal(codeOf({ ...good.transfer, data }), "wrong_destination", String(domain));
    }
  });

  it("refuses a wrong recipient, an owner recipient and a right-padded recipient", () => {
    assert.equal(codeOf({ ...good.transfer, data: encodeTransferRemote(padRecipient(ACCOUNT_B), amount) }), "wrong_recipient");
    assert.equal(codeOf({ ...good.transfer, data: encodeTransferRemote(wordOf(OWNER), amount) }), "wrong_recipient");
    const right = `0x81b4e8b4${hex32(3223n)}${ACCOUNT.slice(2).toLowerCase()}${"0".repeat(24)}${hex32(amount)}` as Hex;
    assert.equal(codeOf({ ...good.transfer, data: right }), "bad_padding");
  });

  it("refuses a wrong amount, in either call", () => {
    assert.equal(codeOf(good.approve, { amount: amount + 1n }), "wrong_amount");
    assert.equal(codeOf(good.transfer, { amount: amount - 1n }), "wrong_amount");
    assert.equal(codeOf(buildApproveCall(amount + 1n)), "wrong_amount");
  });

  it("refuses calldata that is not exactly one of the two calls", () => {
    for (const data of [
      "0x",
      "0x095ea7b3",
      `${good.approve.data}00`,
      `${good.transfer.data}00`,
      `${good.transfer.data.slice(0, -2)}`,
      `0xa9059cbb${good.approve.data.slice(10)}`,
      "0x095ea7b3zz",
    ]) {
      assert.equal(codeOf({ ...good.approve, data: data as Hex }), "bad_calldata", data.slice(0, 24));
      assert.equal(codeOf({ ...good.transfer, data: data as Hex }), "bad_calldata", data.slice(0, 24));
    }
  });

  it("refuses a call whose kind does not match its calldata", () => {
    assert.equal(codeOf({ ...good.approve, kind: "transfer" }), "bad_calldata");
    assert.equal(codeOf({ ...good.transfer, kind: "approve" }), "bad_calldata");
  });

  it("refuses non-canonical calldata: a destination word with bits above the uint32", () => {
    const rest = good.transfer.data.slice(2 + 8 + 64);
    // 2^32 + 3223 (a number viem still decodes, but not a uint32), and a word too big for a JS number.
    for (const word of [`${"0".repeat(55)}1${"00000c97"}`, `${"f".repeat(56)}${"00000c97"}`]) {
      const dirty = `${TRANSFER_REMOTE_SELECTOR}${word}${rest}` as Hex;
      assert.equal(dirty.length, good.transfer.data.length);
      assert.throws(() => decodeFundingData(dirty), (error) => error instanceof FundingCalldataError && error.code === "bad_calldata", word.slice(0, 12));
      assert.equal(codeOf({ ...good.transfer, data: dirty }), "bad_calldata");
    }
  });

  it("refuses non-canonical calldata: dirty padding above the spender address", () => {
    const dirty = `${APPROVE_SELECTOR}${"1".repeat(24)}${BASE_WARP_ROUTER.slice(2).toLowerCase()}${hex32(amount)}` as Hex;
    assert.equal(codeOf({ ...good.approve, data: dirty }), "bad_calldata");
  });

  it("refuses every single-nibble change to either call (mutation check)", () => {
    for (const call of [good.approve, good.transfer]) {
      for (let at = 2; at < call.data.length; at += 1) {
        const digit = call.data[at] as string;
        const replacement = digit === "0" ? "1" : "0";
        const mutated = `${call.data.slice(0, at)}${replacement}${call.data.slice(at + 1)}` as Hex;
        assert.notEqual(codeOf({ ...call, data: mutated }), undefined, `${call.kind} nibble ${at}`);
      }
    }
  });

  it("refuses when the request itself is wrong", () => {
    assert.equal(codeOf(good.transfer, { account: ACCOUNT_B }), "recipient_not_derived");
    assert.equal(codeOf(good.transfer, { amount: 0n }), "invalid_amount");
    assert.equal(codeOf(good.transfer, { owner: "0x0000000000000000000000000000000000000000" }), "invalid_owner");
  });
});

describe("decodeFundingData", () => {
  it("decodes upper-case hex the same as lower-case", () => {
    const call = buildFundingCalls({ owner: OWNER, amount: 7n }).transfer;
    const upper = `0x${call.data.slice(2).toUpperCase()}`;
    assert.deepEqual(decodeFundingData(upper), decodeFundingData(call.data));
  });

  it("refuses non-strings and non-hex", () => {
    for (const bad of [undefined, null, 5, {}, "095ea7b3", "0xzz", "0x123"]) {
      assert.throws(() => decodeFundingData(bad as string), (error) => error instanceof FundingCalldataError && error.code === "bad_calldata");
    }
  });
});
