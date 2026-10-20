// Kernel v3 nonce lanes: layout, first-op constant, getNonce call data, lane rules.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress, zeroAddress } from "viem";

import { ECDSA_VALIDATOR, ENTRY_POINT_V07, FIRST_OP_NONCE, GET_NONCE_SELECTOR, NONCE_KEY_SHIFT, USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import {
  UserOpError,
  assertDefaultRootLane,
  decodeGetNonceResult,
  decodeKernelNonce,
  firstOpNonce,
  getNonceCallData,
  kernelNonce,
  laneKeyFor,
  nextNonceAfter,
  nonceLaneKey,
} from "./fixtures/userop/api.js";
import { loadGolden } from "./fixtures/userop/golden.js";
import { word } from "./fixtures/userop/hand.js";
import { seededRandom } from "./fixtures/userop/prng.js";

function refused(run: () => unknown, code?: string): void {
  assert.throws(run, (error: unknown) => error instanceof UserOpError && (code === undefined || error.code === code), code ?? "a UserOpError");
}

describe("nonce layout", () => {
  it("the first-operation nonce is the pinned constant: validator in the identifier, lane 0, sequence 0", () => {
    assert.equal(NONCE_KEY_SHIFT, 64n);
    assert.equal(firstOpNonce(), BigInt(FIRST_OP_NONCE));
    assert.equal(kernelNonce({ sequence: 0n }), BigInt(FIRST_OP_NONCE));
    // written out by hand: 0x00 00 <validator 20 bytes> 0000 0000000000000000
    assert.equal(`0x${kernelNonce({ sequence: 0 }).toString(16).padStart(64, "0")}`, `0x0000${ECDSA_VALIDATOR.slice(2).toLowerCase()}${"00".repeat(10)}`);
  });

  it("places mode, type, identifier, key and sequence at the documented bit offsets", () => {
    const n = kernelNonce({ mode: 1, type: 2, validator: USDC_E_ADDRESS, key: 0x1234, sequence: 0xabcdef });
    const hex = n.toString(16).padStart(64, "0");
    assert.equal(hex.slice(0, 2), "01");
    assert.equal(hex.slice(2, 4), "02");
    assert.equal(`0x${hex.slice(4, 44)}`, USDC_E_ADDRESS.toLowerCase());
    assert.equal(hex.slice(44, 48), "1234");
    assert.equal(hex.slice(48), "0000000000abcdef");
  });

  it("round-trips 300 random nonces (seeded)", () => {
    const rng = seededRandom(21);
    for (let i = 0; i < 300; i += 1) {
      const parts = {
        mode: rng.below(256),
        type: rng.below(256),
        validator: `0x${rng.hex(20)}`,
        key: rng.below(0x10000),
        sequence: rng.bigint(64),
      };
      const nonce = kernelNonce(parts);
      assert.ok(nonce < 1n << 256n);
      assert.deepEqual(decodeKernelNonce(nonce), { mode: parts.mode, type: parts.type, identifier: getAddress(parts.validator), key: parts.key, sequence: parts.sequence });
    }
  });

  it("decodes the nonces of the 22 real operations: ECDSA validator or zeros, mode 0, type 0, the documented sequences", () => {
    const golden = loadGolden();
    const bySender = new Map<string, bigint[]>();
    for (const g of golden.ops) {
      const parts = decodeKernelNonce(BigInt(g.op.nonce));
      assert.equal(parts.mode, 0);
      assert.equal(parts.type, 0);
      assert.equal(parts.key, 0, "no real operation in the sample used another lane");
      assert.ok(parts.identifier === getAddress(ECDSA_VALIDATOR) || parts.identifier === zeroAddress, g.txHash);
      if (g.owner !== null) assert.equal(parts.identifier, getAddress(ECDSA_VALIDATOR));
      bySender.set(g.op.sender, [...(bySender.get(g.op.sender) ?? []), parts.sequence]);
    }
    // sequences from docs/research/21-userop-templates.md section 4.2 and 4.5
    const seq = (action: string): bigint[] => golden.ops.filter((g) => g.action === action).map((g) => decodeKernelNonce(BigInt(g.op.nonce)).sequence);
    assert.deepEqual(seq("redeemPositions_single"), [130n, 438n, 8n, 11564n, 1194n]);
    assert.deepEqual(seq("createConvictionMarket"), [10n, 872n, 873n]);
    assert.deepEqual(seq("enableTrading_firstOp_withAccountDeploy"), [0n, 0n, 0n]);
    for (const g of golden.ops.filter((x) => x.op.initCode !== "0x")) assert.equal(BigInt(g.op.nonce), firstOpNonce());
  });

  it("refuses values outside the field widths", () => {
    refused(() => kernelNonce({ sequence: 1n << 64n }), "invalid_integer");
    refused(() => kernelNonce({ sequence: -1n }), "invalid_integer");
    refused(() => kernelNonce({ sequence: 0n, key: 0x10000 }), "invalid_integer");
    refused(() => kernelNonce({ sequence: 0n, key: -1 }), "invalid_integer");
    refused(() => kernelNonce({ sequence: 0n, mode: 256 }), "invalid_integer");
    refused(() => kernelNonce({ sequence: 0n, type: 256 }), "invalid_integer");
    refused(() => kernelNonce({ sequence: 0.5 }), "invalid_integer");
    refused(() => kernelNonce({ sequence: 0n, validator: "0x1234" }), "invalid_address");
    refused(() => decodeKernelNonce(1n << 256n), "invalid_integer");
  });
});

describe("lanes and getNonce", () => {
  it("the EntryPoint key is the upper 192 bits, and a lane's key ignores the sequence", () => {
    const rng = seededRandom(22);
    for (let i = 0; i < 50; i += 1) {
      const key = rng.below(0x10000);
      const a = kernelNonce({ key, sequence: rng.bigint(64) });
      const b = kernelNonce({ key, sequence: rng.bigint(64) });
      assert.equal(nonceLaneKey(a), nonceLaneKey(b));
      assert.equal(nonceLaneKey(a), a >> 64n);
      assert.equal(nonceLaneKey(a), laneKeyFor({ key }));
      assert.ok(nonceLaneKey(a) < 1n << 192n);
    }
    assert.notEqual(laneKeyFor({ key: 0 }), laneKeyFor({ key: 0x32 }));
    assert.equal(laneKeyFor(), nonceLaneKey(firstOpNonce()));
  });

  it("getNonce(address,uint192) call data equals a hand-encoding", () => {
    const sender = USDC_E_ADDRESS;
    const data = getNonceCallData(sender);
    assert.equal(data.slice(0, 10), GET_NONCE_SELECTOR);
    assert.equal(data, `${GET_NONCE_SELECTOR}${word(sender)}${word(laneKeyFor())}`);
    assert.equal(getNonceCallData(sender, laneKeyFor({ key: 0x32 })), `${GET_NONCE_SELECTOR}${word(sender)}${word(laneKeyFor({ key: 0x32 }))}`);
    assert.equal((data.length - 2) / 2, 68);
    assert.notEqual(ENTRY_POINT_V07, zeroAddress);
  });

  it("refuses a bad sender or a key wider than 192 bits", () => {
    refused(() => getNonceCallData("0x1234"), "invalid_address");
    refused(() => getNonceCallData(USDC_E_ADDRESS, 1n << 192n), "invalid_integer");
    refused(() => getNonceCallData(USDC_E_ADDRESS, -1n), "invalid_integer");
  });

  it("decodes the getNonce result: exactly one 32-byte word", () => {
    assert.equal(decodeGetNonceResult(`0x${word(kernelNonce({ sequence: 131n }))}`), kernelNonce({ sequence: 131n }));
    refused(() => decodeGetNonceResult("0x00"), "invalid_hex");
    refused(() => decodeGetNonceResult(`0x${"00".repeat(33)}`), "invalid_hex");
    refused(() => decodeGetNonceResult(null), "invalid_hex");
  });

  it("the explorer-log fallback: last nonce plus one inside the same lane, never across a full lane", () => {
    const last = kernelNonce({ sequence: 130n });
    assert.equal(nextNonceAfter(last), kernelNonce({ sequence: 131n }));
    assert.equal(nonceLaneKey(nextNonceAfter(last)), nonceLaneKey(last));
    const laneTwo = kernelNonce({ key: 0x32, sequence: 5n });
    assert.equal(nextNonceAfter(laneTwo), kernelNonce({ key: 0x32, sequence: 6n }));
    refused(() => nextNonceAfter(kernelNonce({ sequence: (1n << 64n) - 1n })), "invalid_nonce");
    // a fresh sender has used nothing: the first nonce is key << 64, sequence 0 (getNonce returns it)
    assert.equal(kernelNonce({ sequence: 0n }) & ((1n << 64n) - 1n), 0n);
  });
});

describe("assertDefaultRootLane", () => {
  it("accepts mode 0, type 0, the pinned validator, any lane key", () => {
    for (const key of [0, 1, 0x32, 0xffff]) {
      const parts = assertDefaultRootLane(kernelNonce({ key, sequence: 7n }));
      assert.equal(parts.key, key);
    }
    assert.equal(assertDefaultRootLane(kernelNonce({ key: 0x32, sequence: 1n }), { key: 0x32 }).key, 0x32);
  });

  it("refuses enable mode, other validation types, another identifier and the wrong lane", () => {
    refused(() => assertDefaultRootLane(kernelNonce({ mode: 1, sequence: 0n })), "invalid_nonce");
    refused(() => assertDefaultRootLane(kernelNonce({ type: 1, sequence: 0n })), "invalid_nonce");
    refused(() => assertDefaultRootLane(kernelNonce({ type: 2, sequence: 0n })), "invalid_nonce");
    refused(() => assertDefaultRootLane(kernelNonce({ validator: zeroAddress, sequence: 0n })), "invalid_nonce");
    refused(() => assertDefaultRootLane(kernelNonce({ validator: USDC_E_ADDRESS, sequence: 0n })), "invalid_nonce");
    refused(() => assertDefaultRootLane(kernelNonce({ key: 1, sequence: 0n }), { key: 0 }), "invalid_nonce");
    refused(() => assertDefaultRootLane(kernelNonce({ key: 0, sequence: 0n }), { key: 0x10000 }), "invalid_nonce");
    refused(() => assertDefaultRootLane(1n << 256n), "invalid_nonce");
    refused(() => assertDefaultRootLane(-1n), "invalid_nonce");
  });

  it("a lane in the real world: the nonce key 0x0032 seen on chain is a valid lane for the same validator", () => {
    const n = kernelNonce({ key: 0x32, sequence: 5n });
    const hex = n.toString(16).padStart(64, "0");
    assert.equal(hex.slice(44, 48), "0032");
    assert.equal(assertDefaultRootLane(n).sequence, 5n);
  });
});
