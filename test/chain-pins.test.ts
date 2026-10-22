import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hexToBytes, keccak256, toFunctionSelector, type Hex } from "viem";

import { CTF_ABI } from "../sdk/chain/ctf.js";
import { LIMITLESS_PINS } from "../sdk/chain/limitless/constants.js";
import { MULTICALL3_PINS } from "../sdk/chain/multicall.js";
import type { ContractPin } from "../sdk/chain/pins.js";
import { POLYMARKET_PINS, POLYMARKET_WALLET_PINS } from "../sdk/chain/polymarket/constants.js";
import { XO_PINS } from "../sdk/chain/xo/pins.js";

// The chain readers' pins (sdk/chain/<venue>) against the runtime code test/fixtures/chain-bytecode/capture.ts read on
// 2026-10-22. Every recorded .hex file is re-hashed, so a hand edit of a pin or of a recording fails here.

const DIR = fileURLToPath(new URL("./fixtures/chain-bytecode/", import.meta.url));

interface Sidecar {
  readonly name: string;
  readonly address: string;
  readonly chain_id: number;
  readonly size: number;
  readonly sha256: string;
  readonly keccak256: string;
  readonly eip1967_implementation: string | null;
  readonly sourcify_match: string | null;
  readonly sourcify_onchain_equals_rpc: boolean | null;
  readonly captured_at: string;
}

const recorded = ["polygon", "base", "xo"].flatMap((folder) =>
  readdirSync(`${DIR}${folder}`)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const sidecar = JSON.parse(readFileSync(`${DIR}${folder}/${file}`, "utf8")) as Sidecar;
      const code = readFileSync(`${DIR}${folder}/${file.replace(/\.json$/, ".hex")}`, "utf8").trim() as Hex;
      return { sidecar, code };
    }),
);

const pins: ContractPin[] = [...Object.values(POLYMARKET_PINS), ...Object.values(POLYMARKET_WALLET_PINS), ...Object.values(LIMITLESS_PINS), ...Object.values(XO_PINS), ...Object.values(MULTICALL3_PINS)].flatMap((pin) =>
  pin.implementation === null ? [pin] : [pin, pin.implementation],
);

function recordingOf(pin: ContractPin) {
  return recorded.find(({ sidecar }) => sidecar.chain_id === pin.chainId && sidecar.address.toLowerCase() === pin.address.toLowerCase());
}

describe("chain reader pins", () => {
  it("every recording's code hashes to what its sidecar says", () => {
    assert.ok(recorded.length >= 41, `only ${recorded.length} recordings`);
    for (const { sidecar, code } of recorded) {
      const bytes = hexToBytes(code);
      assert.equal(bytes.length, sidecar.size, sidecar.name);
      assert.equal(keccak256(code), sidecar.keccak256, sidecar.name);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), sidecar.sha256, sidecar.name);
      assert.equal(sidecar.captured_at, "2026-10-22");
    }
  });

  it("every pin has a recording with the same code hash, size and implementation", () => {
    for (const pin of pins) {
      const found = recordingOf(pin);
      assert.ok(found !== undefined, `${pin.name}: no recording`);
      assert.equal(pin.codeHash, found.sidecar.keccak256, pin.name);
      assert.equal(pin.codeSize, found.sidecar.size, pin.name);
      assert.equal(pin.implementation?.address ?? null, found.sidecar.eip1967_implementation, pin.name);
    }
  });

  it("every pin outside XO's chain is backed by Sourcify's verified on-chain code, or is a proxy whose implementation is", () => {
    for (const pin of pins.filter((entry) => entry.chainId !== 3223)) {
      const found = recordingOf(pin);
      assert.ok(found !== undefined, pin.name);
      if (found.sidecar.eip1967_implementation !== null) {
        assert.equal(found?.sidecar.sourcify_match, null, pin.name);
        continue;
      }
      assert.ok(found.sidecar.sourcify_match === "match" || found.sidecar.sourcify_match === "exact_match", pin.name);
      assert.equal(found.sidecar.sourcify_onchain_equals_rpc, true, pin.name);
    }
  });

  it("XO's Conditional Tokens, which has no verified source, dispatches every function the readers call", () => {
    const found = recordingOf(XO_PINS.conditionalTokens);
    assert.ok(found !== undefined);
    for (const entry of CTF_ABI) {
      if (entry.type !== "function") continue;
      // A Solidity dispatcher compares the calldata selector with PUSH4 <selector>; a selector with leading zero
      // bytes is pushed shorter (balanceOf, 0x00fdd58e, is PUSH3 fdd58e).
      const selector = toFunctionSelector(entry).slice(2);
      const significant = selector.replace(/^(?:00)+/, "");
      const push = (0x5f + significant.length / 2).toString(16);
      assert.ok(found.code.includes(`${push}${significant}`), `${entry.name} (${selector}) is not dispatched`);
    }
  });
});
