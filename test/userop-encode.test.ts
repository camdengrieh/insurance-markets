// ERC-7579 execute encoding: single and batch against a hand-encoding, strict decoding, and refusals.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import { CONDITIONAL_TOKENS, EXECUTE_SELECTOR, EXEC_MODE_BATCH, EXEC_MODE_SINGLE, USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import {
  MAX_CALLS_PER_OP,
  UserOpError,
  decodeExecute,
  encodeExecute,
  encodeExecuteBatch,
  encodeExecuteSingle,
  normalizeCall,
  requireAddress,
  requireHex,
  requireUint,
  type Call,
} from "./fixtures/userop/api.js";
import { badChecksum, executeBatchData, executeSingleData, word } from "./fixtures/userop/hand.js";
import { seededRandom } from "./fixtures/userop/prng.js";

function refused(run: () => unknown, code?: string): void {
  assert.throws(run, (error: unknown) => error instanceof UserOpError && (code === undefined || error.code === code), code ?? "a UserOpError");
}

function randomCall(rng: ReturnType<typeof seededRandom>): Call {
  const dataLength = rng.below(5) === 0 ? 0 : rng.below(200);
  return {
    to: `0x${rng.hex(20)}` as Hex,
    value: rng.below(3) === 0 ? rng.bigint(64) : 0n,
    data: `0x${rng.hex(dataLength)}` as Hex,
  };
}

describe("pinned execution encoding", () => {
  it("uses the selector and modes the spec pins", () => {
    assert.equal(EXECUTE_SELECTOR, "0xe9ae5c53");
    assert.equal(EXEC_MODE_SINGLE, `0x${"00".repeat(32)}`);
    assert.equal(EXEC_MODE_BATCH, `0x01${"00".repeat(31)}`);
    assert.equal(encodeExecute([{ to: USDC_E_ADDRESS, value: 0n, data: "0x" }]).slice(0, 10), EXECUTE_SELECTOR);
  });
});

describe("encodeExecute against a hand-encoding (seeded)", () => {
  it("single mode: target ++ value ++ data, for 60 random calls (empty data, big values, odd lengths)", () => {
    const rng = seededRandom(11);
    for (let i = 0; i < 60; i += 1) {
      const call = randomCall(rng);
      assert.equal(encodeExecuteSingle(call), executeSingleData(call), `call ${i}`);
      assert.equal(encodeExecute([call]), executeSingleData(call));
    }
  });

  it("batch mode: abi.encode((address,uint256,bytes)[]), for 40 random lists of 1 to 9 calls", () => {
    const rng = seededRandom(12);
    for (let i = 0; i < 40; i += 1) {
      const calls = Array.from({ length: 1 + rng.below(9) }, () => randomCall(rng));
      assert.equal(encodeExecuteBatch(calls), executeBatchData(calls), `list ${i}`);
      if (calls.length > 1) assert.equal(encodeExecute(calls), executeBatchData(calls));
    }
  });

  it("is lower-case whatever the spelling of the input", () => {
    const call: Call = { to: CONDITIONAL_TOKENS, value: 0n, data: "0xABCDEF" };
    const out = encodeExecute([call]);
    assert.equal(out, out.toLowerCase());
    assert.equal(normalizeCall(call).data, "0xabcdef");
  });

  it("a hundred-odd call batch encodes (the bots' 73-call redeems land on chain)", () => {
    const rng = seededRandom(13);
    const calls = Array.from({ length: 73 }, () => ({ to: CONDITIONAL_TOKENS, value: 0n, data: `0x${rng.hex(196)}` as Hex }));
    assert.equal(encodeExecuteBatch(calls), executeBatchData(calls));
    assert.equal(decodeExecute(encodeExecuteBatch(calls)).calls.length, 73);
  });
});

describe("decodeExecute is the strict inverse", () => {
  it("round-trips 100 random single and batch encodings and reports the mode", () => {
    const rng = seededRandom(14);
    for (let i = 0; i < 100; i += 1) {
      const calls = Array.from({ length: 1 + rng.below(6) }, () => randomCall(rng)).map((c) => normalizeCall(c));
      const single = rng.below(2) === 0;
      const encoded = single ? encodeExecuteSingle(calls[0] as Call) : encodeExecuteBatch(calls);
      const decoded = decodeExecute(encoded);
      assert.equal(decoded.mode, single ? "single" : "batch");
      assert.deepEqual(decoded.calls, single ? [calls[0]] : calls);
    }
  });

  it("accepts upper-case hex input and reports calls in canonical form", () => {
    const call: Call = { to: USDC_E_ADDRESS, value: 7n, data: "0x1234" };
    const upper = `0x${encodeExecute([call]).slice(2).toUpperCase()}`;
    assert.deepEqual(decodeExecute(upper).calls, [{ ...call }]);
  });

  const call: Call = { to: USDC_E_ADDRESS, value: 0n, data: `0x${"ab".repeat(70)}` };
  const single = encodeExecuteSingle(call);
  const batch = encodeExecuteBatch([call, call]);

  it("refuses another selector, odd hex and non-hex", () => {
    refused(() => decodeExecute(`0x12345678${single.slice(10)}`), "invalid_calldata");
    refused(() => decodeExecute("0x"), "invalid_calldata");
    refused(() => decodeExecute(`${single}0`), "invalid_hex");
    refused(() => decodeExecute("not hex"), "invalid_hex");
    refused(() => decodeExecute(123), "invalid_hex");
    refused(() => decodeExecute(null), "invalid_hex");
  });

  it("refuses every execution mode except single and batch with revert-on-failure", () => {
    const withMode = (mode: string, from: Hex): Hex => `0x${EXECUTE_SELECTOR.slice(2)}${mode}${from.slice(10 + 64)}` as Hex;
    const modes = [
      `01${"00".repeat(31)}`.replace(/^01/, "ff"), // delegatecall
      `00${"00".repeat(31)}`.replace(/^0000/, "0001"), // try-mode
      `${"00".repeat(2)}${"11".repeat(4)}${"00".repeat(26)}`, // unused bytes set
      `${"00".repeat(6)}${"22".repeat(4)}${"00".repeat(22)}`, // mode selector set
      `${"00".repeat(10)}${"33".repeat(22)}`, // payload set
      `02${"00".repeat(31)}`, // unknown call type
    ];
    for (const mode of modes) {
      refused(() => decodeExecute(withMode(mode, single)), "unsupported_mode");
      refused(() => decodeExecute(withMode(mode, batch)), "unsupported_mode");
    }
  });

  it("refuses trailing bytes, non-canonical padding and truncation", () => {
    refused(() => decodeExecute(`${single}00`), "invalid_calldata");
    refused(() => decodeExecute(`${batch}${"00".repeat(32)}`), "invalid_calldata");
    refused(() => decodeExecute(single.slice(0, single.length - 2)));
    refused(() => decodeExecute(batch.slice(0, batch.length - 64)));
    // data is 70 bytes: the last 26 bytes of its final word are padding, which must be zero
    const dirty = `${single.slice(0, single.length - 2)}01` as Hex;
    refused(() => decodeExecute(dirty), "invalid_calldata");
    const dirtyBatch = `${batch.slice(0, batch.length - 2)}01` as Hex;
    refused(() => decodeExecute(dirtyBatch), "invalid_calldata");
  });

  it("refuses a single payload shorter than target and value, and an empty batch", () => {
    refused(() => decodeExecute(`0x${EXECUTE_SELECTOR.slice(2)}${word(0)}${word(0x40)}${word(51)}${"00".repeat(64)}`), "invalid_calldata");
    const emptyBatch = `0x${EXECUTE_SELECTOR.slice(2)}${EXEC_MODE_BATCH.slice(2)}${word(0x40)}${word(64)}${word(0x20)}${word(0)}`;
    refused(() => decodeExecute(emptyBatch), "invalid_calldata");
  });

  it("every one-byte change to an encoding is refused or decodes to different calls", () => {
    const rng = seededRandom(15);
    const calls = [randomCall(rng), randomCall(rng)].map((c) => normalizeCall(c));
    for (const encoded of [encodeExecuteSingle(calls[0] as Call), encodeExecuteBatch(calls)]) {
      const original = JSON.stringify(decodeExecute(encoded), (_, v) => (typeof v === "bigint" ? v.toString() : v));
      for (let i = 4; i < (encoded.length - 2) / 2; i += 1) {
        const hex = encoded.slice(2);
        const flipped = (Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ 0x80).toString(16).padStart(2, "0");
        const mutated = `0x${hex.slice(0, i * 2)}${flipped}${hex.slice(i * 2 + 2)}` as Hex;
        let result: string | null;
        try {
          result = JSON.stringify(decodeExecute(mutated), (_, v) => (typeof v === "bigint" ? v.toString() : v));
        } catch (error) {
          assert.ok(error instanceof UserOpError, `only UserOpError escapes (byte ${i}: ${String(error)})`);
          result = null;
        }
        assert.notEqual(result, original, `byte ${i}`);
      }
    }
  });
});

describe("encoding refusals", () => {
  const ok: Call = { to: USDC_E_ADDRESS, value: 0n, data: "0x" };

  it("refuses an empty list and too many calls", () => {
    assert.equal(MAX_CALLS_PER_OP, 128, "the structural ceiling is a pinned number, not a moving target");
    refused(() => encodeExecute([]), "invalid_call");
    refused(() => encodeExecuteBatch([]), "invalid_call");
    refused(() => encodeExecute(Array.from({ length: MAX_CALLS_PER_OP + 1 }, () => ok)), "invalid_call");
    assert.equal(decodeExecute(encodeExecute(Array.from({ length: MAX_CALLS_PER_OP }, () => ok))).calls.length, MAX_CALLS_PER_OP);
  });

  it("refuses a bad target, value or data", () => {
    refused(() => encodeExecute([{ ...ok, to: "0x1234" as Hex }]), "invalid_address");
    refused(() => encodeExecute([{ ...ok, to: badChecksum(CONDITIONAL_TOKENS) }]), "invalid_address");
    refused(() => encodeExecute([{ ...ok, value: -1n }]), "invalid_integer");
    refused(() => encodeExecute([{ ...ok, value: 1n << 256n }]), "invalid_integer");
    refused(() => encodeExecute([{ ...ok, value: 1.5 as unknown as bigint }]), "invalid_integer");
    refused(() => encodeExecute([{ ...ok, data: "0x123" as Hex }]), "invalid_hex");
    refused(() => encodeExecute([{ ...ok, data: "zz" as Hex }]), "invalid_hex");
    refused(() => encodeExecute([null as unknown as Call]), "invalid_call");
  });

  it("the validation helpers are strict", () => {
    assert.equal(requireUint(5, "n", 8), 5n);
    refused(() => requireUint(256, "n", 8), "invalid_integer");
    refused(() => requireUint(Number.NaN, "n", 8), "invalid_integer");
    refused(() => requireUint("5", "n", 8), "invalid_integer");
    refused(() => requireHex("0x00", "h", { bytes: 2 }), "invalid_hex");
    assert.equal(requireHex("0xAB", "h", { bytes: 1 }), "0xab");
    assert.equal(requireAddress(USDC_E_ADDRESS.toLowerCase(), "a"), USDC_E_ADDRESS);
    refused(() => requireAddress(USDC_E_ADDRESS.toUpperCase().replace("0X", "0x"), "a"), "invalid_address");
  });
});
