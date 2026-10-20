// Loads the captured runtime bytecode fixtures (test/fixtures/bytecode/*.hex with a .json sidecar)
// and refuses to hand out anything that does not match its sidecar and the facts the research notes
// state about it. A hand edit of a .hex file, a truncated checkout or a wrong address fails here,
// loudly, instead of turning into a confusing EVM failure later.
//
// Capture: test/fixtures/bytecode/capture.ts (public GET to the explorer, 2026-10-19).
//
// The Base variant (chain 8453) is DERIVED, not captured. The notes say that the EntryPoint,
// KernelFactory and ECDSA validator are byte-identical on Base and that the Kernel implementation
// differs in 34 bytes only: a cached 32-byte EIP-712 domain separator and the chain id inside a
// PUSH32 (docs/research/19 sec 5.2, 21 V1.4). patchKernelImplementation() makes exactly that change
// to the 3223 code. No Base bytecode was fetched (the capture budget was one host, the XO explorer),
// so the Base variant is unverified against the real Base contracts.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { bytesToHex, encodeAbiParameters, getContractAddress, hexToBytes, keccak256, toBytes, type Address, type Hex } from "viem";

import {
  ECDSA_VALIDATOR,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  POLICY_PAYMASTER,
  XO_CHAIN_ID,
} from "../../src/xo/chain/constants.js";

export const BYTECODE_NAMES = [
  "entrypoint-v07",
  "sender-creator",
  "kernel-factory",
  "ecdsa-validator",
  "kernel-implementation",
  "policy-paymaster",
] as const;

export type BytecodeName = (typeof BYTECODE_NAMES)[number];

// The EntryPoint's first CREATE (a contract's nonce starts at 1): its SenderCreator helper.
export const SENDER_CREATOR_ADDRESS: Address = getContractAddress({ from: ENTRY_POINT_V07, nonce: 1n });

export const BYTECODE_ADDRESS: Readonly<Record<BytecodeName, Address>> = Object.freeze({
  "entrypoint-v07": ENTRY_POINT_V07,
  "sender-creator": SENDER_CREATOR_ADDRESS,
  "kernel-factory": KERNEL_FACTORY,
  "ecdsa-validator": ECDSA_VALIDATOR,
  "kernel-implementation": KERNEL_IMPLEMENTATION,
  "policy-paymaster": POLICY_PAYMASTER,
});

// Sizes in bytes, from docs/phase1-gap-closing.md section 2.1 and docs/research/21 V1.4. The
// SenderCreator size is not stated in the notes (it is recorded by the capture, 451 bytes).
export const EXPECTED_SIZE: Readonly<Partial<Record<BytecodeName, number>>> = Object.freeze({
  "entrypoint-v07": 16_035,
  "kernel-factory": 989,
  "ecdsa-validator": 1_819,
  "kernel-implementation": 22_784,
  "policy-paymaster": 7_309,
});

// First 8 bytes of keccak256(runtime code) as printed by the researchers' own eth_getCode comparison
// on 2026-10-18 (docs/research/fixtures/gaps/userop-templates/transcripts/09_code_identity_xo_vs_base.txt).
// An independent check on the explorer capture: a different source, a day earlier. The paymaster's
// code was compared byte for byte with the explorer's verified deployed_bytecode (21 V1.4) and the
// SenderCreator has no such transcript line.
export const NOTE_KECCAK_PREFIX: Readonly<Partial<Record<BytecodeName, string>>> = Object.freeze({
  "entrypoint-v07": "0x8db5ff695839d655",
  "kernel-factory": "0xeecde6f459d0ecad",
  "ecdsa-validator": "0x2f8b585e669feb67",
  "kernel-implementation": "0xbe68788047b84fca",
});

export interface BytecodeFixture {
  readonly name: BytecodeName;
  readonly address: Address;
  readonly chainId: number;
  readonly size: number;
  readonly sha256: string;
  readonly keccak256: Hex;
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly code: Hex;
}

interface Sidecar {
  name: string;
  address: string;
  chain_id: number;
  size: number;
  sha256: string;
  keccak256: string;
  source_url: string;
  captured_at: string;
}

const DIRECTORY = new URL("../fixtures/bytecode/", import.meta.url);

export class BytecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BytecodeError";
  }
}

const cache = new Map<BytecodeName, BytecodeFixture>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Checks one fixture (the .hex text and the parsed .json sidecar) against the sidecar and against what
// the notes state. Exported so the tests can feed it tampered input.
export function checkFixture(name: BytecodeName, hexText: string, sidecarValue: unknown): BytecodeFixture {
  const fail = (what: string): never => {
    throw new BytecodeError(`${name}: ${what}`);
  };
  const hex = hexText.trim().toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})+$/.test(hex)) fail("the .hex file is not even-length 0x hex");
  if (!isRecord(sidecarValue)) return fail("the sidecar is not a JSON object");
  const sidecar = sidecarValue as unknown as Sidecar;
  for (const key of ["name", "address", "chain_id", "size", "sha256", "keccak256", "source_url", "captured_at"] as const) {
    if (sidecar[key] === undefined) fail(`the sidecar has no ${key}`);
  }
  const code = hex as Hex;
  const bytes = hexToBytes(code);
  if (sidecar.name !== name) fail("sidecar names a different contract");
  if (typeof sidecar.address !== "string" || sidecar.address.toLowerCase() !== BYTECODE_ADDRESS[name].toLowerCase()) fail("sidecar address is not the pinned address");
  if (sidecar.chain_id !== XO_CHAIN_ID) fail("sidecar is not for chain 3223");
  if (sidecar.size !== bytes.length) fail(`size ${String(bytes.length)} differs from the sidecar's ${String(sidecar.size)}`);
  if (createHash("sha256").update(bytes).digest("hex") !== sidecar.sha256) fail("sha256 differs from the sidecar");
  if (keccak256(code) !== sidecar.keccak256) fail("keccak256 differs from the sidecar");
  const expected = EXPECTED_SIZE[name];
  if (expected !== undefined && bytes.length !== expected) fail(`size ${String(bytes.length)} is not the ${String(expected)} bytes the notes state`);
  const prefix = NOTE_KECCAK_PREFIX[name];
  if (prefix !== undefined && !keccak256(code).startsWith(prefix)) fail("keccak256 does not start with the prefix the research transcript printed");
  return Object.freeze({
    name,
    address: BYTECODE_ADDRESS[name],
    chainId: sidecar.chain_id,
    size: bytes.length,
    sha256: sidecar.sha256,
    keccak256: sidecar.keccak256 as Hex,
    sourceUrl: sidecar.source_url,
    capturedAt: sidecar.captured_at,
    code,
  });
}

export function loadBytecode(name: BytecodeName): BytecodeFixture {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  let hexText: string;
  let sidecar: unknown;
  try {
    hexText = readFileSync(new URL(`${name}.hex`, DIRECTORY), "utf8");
    sidecar = JSON.parse(readFileSync(new URL(`${name}.json`, DIRECTORY), "utf8"));
  } catch (error) {
    throw new BytecodeError(`bytecode fixture ${name} is missing or unreadable (${error instanceof Error ? error.message : String(error)}); capture it with test/fixtures/bytecode/capture.ts`);
  }
  const fixture = checkFixture(name, hexText, sidecar);
  cache.set(name, fixture);
  return fixture;
}

export function loadAllBytecode(): Readonly<Record<BytecodeName, BytecodeFixture>> {
  const entries = BYTECODE_NAMES.map((name) => [name, loadBytecode(name)] as const);
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<BytecodeName, BytecodeFixture>>;
}

// ---- the derived Base variant of the Kernel implementation -------------------------------------------

// keccak256(abi.encode(EIP712DomainTypehash, keccak("Kernel"), keccak("0.3.1"), chainId, implementation)):
// the separator Kernel caches for its own implementation address (docs/research/19 sec 5.2).
export function kernelCachedDomainSeparator(chainId: number, implementation: Address = KERNEL_IMPLEMENTATION): Hex {
  const typeHash = keccak256(toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [typeHash, keccak256(toBytes("Kernel")), keccak256(toBytes("0.3.1")), BigInt(chainId), implementation],
    ),
  );
}

function findAll(haystack: Uint8Array, needle: Uint8Array): number[] {
  const hits: number[] = [];
  outer: for (let index = 0; index + needle.length <= haystack.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    hits.push(index);
  }
  return hits;
}

export interface KernelChainPatch {
  readonly separatorOffset: number;
  readonly chainIdOffset: number;
  readonly changedBytes: number;
}

// Rewrites the two chain-dependent immutables of the Kernel implementation: the cached domain
// separator (32 bytes) and the cached chain id, a PUSH32 whose last two bytes are the id and which is
// followed by CHAINID (0x46). Throws unless each is found exactly once. Returns the new code and where
// the changes were made.
export function patchKernelImplementation(code: Hex, fromChainId: number, toChainId: number): { code: Hex; patch: KernelChainPatch } {
  if (fromChainId > 0xffff || toChainId > 0xffff) throw new BytecodeError("chain ids above 65535 need a different patch");
  const bytes = hexToBytes(code);
  const fromSeparator = hexToBytes(kernelCachedDomainSeparator(fromChainId));
  const toSeparator = hexToBytes(kernelCachedDomainSeparator(toChainId));
  const separatorHits = findAll(bytes, fromSeparator);
  if (separatorHits.length !== 1) throw new BytecodeError(`expected one cached domain separator, found ${String(separatorHits.length)}`);
  const separatorOffset = separatorHits[0] as number;

  // PUSH32 (0x7f), 30 zero bytes, the two chain id bytes, then CHAINID (0x46).
  const pattern = new Uint8Array(34);
  pattern[0] = 0x7f;
  pattern[31] = (fromChainId >> 8) & 0xff;
  pattern[32] = fromChainId & 0xff;
  pattern[33] = 0x46;
  const chainHits = findAll(bytes, pattern);
  if (chainHits.length !== 1) throw new BytecodeError(`expected one cached chain id, found ${String(chainHits.length)}`);
  const chainIdOffset = (chainHits[0] as number) + 31;

  const patched = Uint8Array.from(bytes);
  patched.set(toSeparator, separatorOffset);
  patched[chainIdOffset] = (toChainId >> 8) & 0xff;
  patched[chainIdOffset + 1] = toChainId & 0xff;
  let changed = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== patched[index]) changed += 1;
  }
  return { code: bytesToHex(patched), patch: { separatorOffset, chainIdOffset, changedBytes: changed } };
}
