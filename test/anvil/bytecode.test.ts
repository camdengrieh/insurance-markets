import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { getContractAddress, hexToBytes, keccak256, type Hex } from "viem";

import {
  ECDSA_VALIDATOR,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  POLICY_PAYMASTER,
  XO_CHAIN_ID,
  BASE_CHAIN_ID,
} from "../../src/xo/chain/constants.js";
import {
  BYTECODE_ADDRESS,
  BYTECODE_NAMES,
  BytecodeError,
  EXPECTED_SIZE,
  NOTE_KECCAK_PREFIX,
  SENDER_CREATOR_ADDRESS,
  checkFixture,
  kernelCachedDomainSeparator,
  loadAllBytecode,
  loadBytecode,
  patchKernelImplementation,
  type BytecodeName,
} from "./bytecode.js";
import { TARGETS } from "../fixtures/bytecode/capture.js";

// Offline: no anvil, no network. These pin what the captured fixtures are, so a changed, truncated or
// swapped file fails here with a reason instead of surfacing as a puzzling EVM result.

const DIRECTORY = new URL("../fixtures/bytecode/", import.meta.url);
const files = (): string[] => readdirSync(DIRECTORY).sort();

function raw(name: BytecodeName): { hexText: string; sidecar: Record<string, unknown> } {
  return {
    hexText: readFileSync(new URL(`${name}.hex`, DIRECTORY), "utf8"),
    sidecar: JSON.parse(readFileSync(new URL(`${name}.json`, DIRECTORY), "utf8")) as Record<string, unknown>,
  };
}

const contains = (code: Hex, needle: string): boolean => code.includes(needle.toLowerCase().replace(/^0x/, ""));

describe("bytecode fixtures: what was captured", () => {
  it("has exactly the six contracts, each with a .hex and a .json, and nothing else but the capture script", () => {
    const expected = [...BYTECODE_NAMES.flatMap((name) => [`${name}.hex`, `${name}.json`]), "capture.ts"].sort();
    assert.deepEqual(files(), expected);
  });

  it("loads every fixture and matches the sizes the notes state", () => {
    const all = loadAllBytecode();
    for (const name of BYTECODE_NAMES) {
      const fixture = all[name];
      assert.equal(fixture.size, (fixture.code.length - 2) / 2);
      const expected = EXPECTED_SIZE[name];
      if (expected !== undefined) assert.equal(fixture.size, expected, name);
    }
    assert.equal(all["entrypoint-v07"].size, 16_035);
    assert.equal(all["kernel-factory"].size, 989);
    assert.equal(all["ecdsa-validator"].size, 1_819);
    assert.equal(all["kernel-implementation"].size, 22_784);
    assert.equal(all["policy-paymaster"].size, 7_309);
    assert.equal(all["sender-creator"].size, 451);
  });

  it("puts every contract at its pinned address, and the SenderCreator at the EntryPoint's first CREATE", () => {
    assert.equal(BYTECODE_ADDRESS["entrypoint-v07"], ENTRY_POINT_V07);
    assert.equal(BYTECODE_ADDRESS["kernel-factory"], KERNEL_FACTORY);
    assert.equal(BYTECODE_ADDRESS["ecdsa-validator"], ECDSA_VALIDATOR);
    assert.equal(BYTECODE_ADDRESS["kernel-implementation"], KERNEL_IMPLEMENTATION);
    assert.equal(BYTECODE_ADDRESS["policy-paymaster"], POLICY_PAYMASTER);
    assert.equal(SENDER_CREATOR_ADDRESS, getContractAddress({ from: ENTRY_POINT_V07, nonce: 1n }));
    assert.equal(loadBytecode("sender-creator").address, SENDER_CREATOR_ADDRESS);
    for (const name of BYTECODE_NAMES) assert.equal(JSON.parse(readFileSync(new URL(`${name}.json`, DIRECTORY), "utf8")).address, BYTECODE_ADDRESS[name]);
  });

  it("records where, when and how each file was captured (one explorer URL per contract)", () => {
    for (const name of BYTECODE_NAMES) {
      const { sidecar } = raw(name);
      assert.deepEqual(Object.keys(sidecar).sort(), ["address", "captured_at", "chain_id", "keccak256", "name", "sha256", "size", "source_field", "source_url"].sort());
      assert.equal(sidecar["captured_at"], "2026-10-19");
      assert.equal(sidecar["chain_id"], XO_CHAIN_ID);
      assert.equal(sidecar["source_field"], "deployed_bytecode");
      assert.equal(sidecar["source_url"], `https://explorer-mainnet.xo.market/api/v2/smart-contracts/${String(sidecar["address"])}`);
    }
  });

  it("keeps sha256 over the code bytes and keccak256 over the same bytes", () => {
    for (const name of BYTECODE_NAMES) {
      const { hexText, sidecar } = raw(name);
      const bytes = hexToBytes(hexText.trim() as Hex);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), sidecar["sha256"]);
      assert.equal(keccak256(hexText.trim() as Hex), sidecar["keccak256"]);
    }
  });

  it("agrees with the hashes the researchers printed from eth_getCode a day earlier (an independent source)", () => {
    for (const [name, prefix] of Object.entries(NOTE_KECCAK_PREFIX) as Array<[BytecodeName, string]>) {
      assert.ok(loadBytecode(name).keccak256.startsWith(prefix), name);
    }
    assert.equal(Object.keys(NOTE_KECCAK_PREFIX).length, 4);
  });

  it("is the capture script's own target list (names and addresses)", () => {
    assert.deepEqual(
      TARGETS.map((target) => target.name),
      [...BYTECODE_NAMES],
    );
    for (const target of TARGETS) assert.equal(target.address, BYTECODE_ADDRESS[target.name as BytecodeName]);
  });
});

describe("bytecode fixtures: the captured contracts point at each other", () => {
  const all = loadAllBytecode();

  it("the EntryPoint embeds its SenderCreator's address (an immutable), which confirms the CREATE derivation", () => {
    assert.ok(contains(all["entrypoint-v07"].code, SENDER_CREATOR_ADDRESS));
    assert.equal(contains(all["entrypoint-v07"].code, KERNEL_FACTORY), false);
  });

  it("the factory embeds the Kernel implementation it deploys", () => {
    assert.ok(contains(all["kernel-factory"].code, KERNEL_IMPLEMENTATION));
  });

  it("the Kernel implementation embeds the EntryPoint, and the paymaster embeds the same EntryPoint", () => {
    assert.ok(contains(all["kernel-implementation"].code, ENTRY_POINT_V07));
    assert.ok(contains(all["policy-paymaster"].code, ENTRY_POINT_V07));
  });

  it("the Kernel implementation caches the domain separator for chain 3223 at the offset the notes give", () => {
    const code = all["kernel-implementation"].code;
    const separator = kernelCachedDomainSeparator(XO_CHAIN_ID);
    assert.equal(separator, "0x7adfec38273d2aa07123113bb5fd1e01003a75334e43b149b0eeee906e014409");
    assert.equal((code.indexOf(separator.slice(2)) - 2) / 2, 17_721);
    assert.equal(contains(code, kernelCachedDomainSeparator(BASE_CHAIN_ID)), false);
  });
});

describe("bytecode fixtures: tampering is caught", () => {
  const name: BytecodeName = "kernel-factory";
  const { hexText, sidecar } = raw(name);

  it("accepts the untouched fixture", () => {
    assert.equal(checkFixture(name, hexText, sidecar).size, 989);
  });

  it("refuses a flipped nibble, a truncation and an extension", () => {
    const flipped = `${hexText.slice(0, 20)}${hexText[20] === "0" ? "1" : "0"}${hexText.slice(21)}`;
    assert.throws(() => checkFixture(name, flipped, sidecar), BytecodeError);
    assert.throws(() => checkFixture(name, hexText.trim().slice(0, -2), sidecar), BytecodeError);
    assert.throws(() => checkFixture(name, `${hexText.trim()}00`, sidecar), BytecodeError);
  });

  it("refuses text that is not even-length 0x hex", () => {
    assert.throws(() => checkFixture(name, "", sidecar), /even-length/);
    assert.throws(() => checkFixture(name, "0x123", sidecar), /even-length/);
    assert.throws(() => checkFixture(name, hexText.trim().replace("0x", ""), sidecar), /even-length/);
    assert.throws(() => checkFixture(name, `${hexText.trim().slice(0, -2)}zz`, sidecar), /even-length/);
  });

  it("refuses a sidecar that lies: another name, address, chain, size or hash", () => {
    const mutations: Array<[string, Record<string, unknown>]> = [
      ["name", { ...sidecar, name: "kernel-implementation" }],
      ["address", { ...sidecar, address: ENTRY_POINT_V07 }],
      ["chain", { ...sidecar, chain_id: BASE_CHAIN_ID }],
      ["size", { ...sidecar, size: 990 }],
      ["sha256", { ...sidecar, sha256: "00".repeat(32) }],
      ["keccak256", { ...sidecar, keccak256: `0x${"11".repeat(32)}` }],
    ];
    for (const [label, mutated] of mutations) assert.throws(() => checkFixture(name, hexText, mutated), BytecodeError, label);
    const { source_url: _dropped, ...withoutUrl } = sidecar;
    assert.throws(() => checkFixture(name, hexText, withoutUrl), /no source_url/);
    assert.throws(() => checkFixture(name, hexText, null), /not a JSON object/);
    assert.throws(() => checkFixture(name, hexText, []), /not a JSON object/);
  });

  it("refuses code that is internally consistent but is not the contract the notes describe", () => {
    // A self-consistent forgery: other bytes with a matching sidecar. Size and the research hash prefix catch it.
    const other = "0x6001600055";
    const forged = {
      ...sidecar,
      size: 5,
      sha256: createHash("sha256").update(hexToBytes(other)).digest("hex"),
      keccak256: keccak256(other),
    };
    assert.throws(() => checkFixture(name, other, forged), /bytes the notes state/);
  });

  it("refuses the right size with other bytes through the research hash prefix", () => {
    const bytes = hexToBytes(hexText.trim() as Hex);
    bytes[500] = (bytes[500] ?? 0) ^ 0xff;
    const hex = `0x${Buffer.from(bytes).toString("hex")}`;
    const forged = { ...sidecar, sha256: createHash("sha256").update(bytes).digest("hex"), keccak256: keccak256(hex as Hex) };
    assert.throws(() => checkFixture(name, hex, forged), /prefix the research transcript printed/);
  });
});

describe("the derived Base variant of the Kernel implementation", () => {
  const original = loadBytecode("kernel-implementation").code;

  it("changes exactly 34 bytes: the cached domain separator and the cached chain id", () => {
    const { code, patch } = patchKernelImplementation(original, XO_CHAIN_ID, BASE_CHAIN_ID);
    assert.equal(patch.changedBytes, 34);
    assert.equal(patch.separatorOffset, 17_721);
    assert.equal(patch.chainIdOffset, 17_819);
    assert.equal(code.length, original.length);
    assert.equal(code.slice(2 + 2 * 17_721, 2 + 2 * (17_721 + 32)), kernelCachedDomainSeparator(BASE_CHAIN_ID).slice(2));
    assert.equal(code.slice(2 + 2 * 17_819, 2 + 2 * 17_821), "2105");
    // The two figures the research verifier printed for Base: separator ce0363f2...86ca and chain id 0x2105.
    const separator = kernelCachedDomainSeparator(BASE_CHAIN_ID);
    assert.ok(separator.startsWith("0xce0363f2") && separator.endsWith("86ca"));
  });

  it("is reversible, and refuses to patch code that does not look like the 3223 Kernel", () => {
    const base = patchKernelImplementation(original, XO_CHAIN_ID, BASE_CHAIN_ID).code;
    assert.equal(patchKernelImplementation(base, BASE_CHAIN_ID, XO_CHAIN_ID).code, original);
    assert.throws(() => patchKernelImplementation(base, XO_CHAIN_ID, BASE_CHAIN_ID), /expected one cached domain separator/);
    assert.throws(() => patchKernelImplementation(loadBytecode("kernel-factory").code, XO_CHAIN_ID, BASE_CHAIN_ID), BytecodeError);
    assert.throws(() => patchKernelImplementation(original, XO_CHAIN_ID, 70_000), /65535/);
  });

  it("refuses a second copy of the separator or of the chain id push (it will not guess which one to rewrite)", () => {
    const separator = kernelCachedDomainSeparator(XO_CHAIN_ID).slice(2);
    assert.throws(() => patchKernelImplementation(`${original}${separator}` as Hex, XO_CHAIN_ID, BASE_CHAIN_ID), /expected one cached domain separator, found 2/);
    const push = `7f${"00".repeat(30)}0c9746`;
    assert.throws(() => patchKernelImplementation(`${original}${push}` as Hex, XO_CHAIN_ID, BASE_CHAIN_ID), /expected one cached chain id, found 2/);
  });

  it("refuses when the separator is present but the chain id push is not found", () => {
    // The byte after the push is CHAINID (0x46); turn it into 0x47 (BASEFEE... any other opcode).
    const at = 2 + 2 * 17_821;
    assert.equal(original.slice(at, at + 2), "46");
    const broken = `${original.slice(0, at)}47${original.slice(at + 2)}` as Hex;
    assert.throws(() => patchKernelImplementation(broken, XO_CHAIN_ID, BASE_CHAIN_ID), /expected one cached chain id/);
  });
});
