import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { concatHex, encodeAbiParameters, getAddress, hexToBytes, keccak256, pad, sliceHex, type Address, type Hex } from "viem";

import {
  DEPOSIT_WALLET_DOMAIN_CALL,
  DEPOSIT_WALLET_OWNER_CALL,
  clobAccountOf,
  decodeDepositWalletOwner,
  depositWalletAddress,
  depositWalletArgs,
  depositWalletCandidates,
  depositWalletDomainMatches,
  depositWalletInitCode,
  depositWalletProxyOf,
  depositWalletRuntimeCode,
} from "../src/clob/polymarket/deposit-wallet.js";
import { POLYMARKET_DEPOSIT_WALLET_BEACON, POLYMARKET_DEPOSIT_WALLET_FACTORY, POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION } from "../src/xo/chain/constants.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";

// The Deposit Wallet address derivation. Offline: no network. The one chain fact here was read on 2026-10-21 over the
// Polygon public RPC and is written down as a constant: the live factory's predictWalletAddress for the public test
// address 0 (it answers the beacon form). The rest is checked against an emulation of Solady LibClone's own assembly
// (initCodeHashERC1967 and initCodeHashERC1967BeaconProxy, lib/solady/src/utils/LibClone.sol in the verified
// DepositWallet sources), written out statement by statement, so the concatenation in the code under test is checked
// against the memory layout the factory's compiler actually hashes. test/clob-deposit-wallet-anvil.test.ts runs the
// creation code on an EVM.

const TEST_OWNER = ANVIL_TEST_ACCOUNTS[0]!.address;
// eth_call to the factory on 2026-10-21: predictWalletAddress(0x58CA..., bytes32(test address 0)).
const LIVE_PREDICTED_BEACON_WALLET = "0xBc0fF067b7740Eff76C1ca93c875Ba6B890d6B50";

// ---- an EVM memory emulator, for Solady's assembly ---------------------------------------------------------------------------

class Memory {
  readonly bytes = new Uint8Array(4096);
  mstore(offset: number, word: bigint): void {
    const masked = word & ((1n << 256n) - 1n);
    const hex = masked.toString(16).padStart(64, "0");
    this.bytes.set(hexToBytes(`0x${hex}`), offset);
  }
  mload(offset: number): bigint {
    return BigInt(`0x${Buffer.from(this.bytes.slice(offset, offset + 32)).toString("hex")}`);
  }
  keccak(offset: number, length: number): Hex {
    return keccak256(this.bytes.slice(offset, offset + length));
  }
  copyArgs(args: Hex, to: number): number {
    const data = hexToBytes(args);
    this.bytes.set(data, to);
    return data.length;
  }
}

const M = 0x200;

// LibClone.initCodeHashERC1967(address implementation, bytes memory args), statement by statement.
function soladyInitCodeHashERC1967(implementation: Address, args: Hex): Hex {
  const mem = new Memory();
  const n = mem.copyArgs(args, M + 0x60);
  mem.mstore(M + 0x40, 0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3n);
  mem.mstore(M + 0x20, 0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076n);
  mem.mstore(0x16, 0x6009n);
  mem.mstore(0x14, BigInt(implementation));
  mem.mstore(0x00, 0x61003d3d8160233d3973n + (BigInt(n) << 56n));
  mem.mstore(M, mem.mload(0x16));
  return mem.keccak(M, n + 0x60);
}

// LibClone.initCodeHashERC1967BeaconProxy(address beacon, bytes memory args), statement by statement.
function soladyInitCodeHashERC1967BeaconProxy(beacon: Address, args: Hex): Hex {
  const mem = new Memory();
  const n = mem.copyArgs(args, M + 0x8b);
  mem.mstore(M + 0x6b, 0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3n);
  mem.mstore(M + 0x4b, 0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cn);
  mem.mstore(M + 0x2b, 0x60195155f3363d3d373d3d363d602036600436635c60dan);
  mem.mstore(M + 0x14, BigInt(beacon));
  mem.mstore(M, 0x6100523d8160233d3973n + (BigInt(n) << 56n));
  return mem.keccak(M + 0x16, n + 0x75);
}

// CREATE2 by hand: keccak256(0xff ++ deployer ++ salt ++ initCodeHash)[12:].
function create2ByHand(deployer: Address, salt: Hex, initCodeHash: Hex): Address {
  return getAddress(sliceHex(keccak256(concatHex(["0xff", deployer, salt, initCodeHash])), 12));
}

describe("Deposit Wallet address derivation", () => {
  it("the beacon form equals what Polymarket's live factory predicted on 2026-10-21 for the public test address 0", () => {
    assert.equal(depositWalletAddress(TEST_OWNER, "beacon"), LIVE_PREDICTED_BEACON_WALLET);
  });

  it("args are abi.encode(factory, bytes32(owner)) and the salt is their keccak256 (wallets-auth.md)", () => {
    const args = depositWalletArgs(TEST_OWNER);
    assert.equal(args, encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [POLYMARKET_DEPOSIT_WALLET_FACTORY, pad(TEST_OWNER, { size: 32 })]).toLowerCase());
    assert.equal((args.length - 2) / 2, 64);
  });

  it("both creation codes hash to what Solady's assembly hashes, and both addresses are CREATE2 from the factory by hand", () => {
    for (const owner of ANVIL_TEST_ACCOUNTS.slice(0, 4).map((account) => account.address)) {
      const args = depositWalletArgs(owner);
      const salt = keccak256(args);
      const uupsHash = soladyInitCodeHashERC1967(POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION, args);
      const beaconHash = soladyInitCodeHashERC1967BeaconProxy(POLYMARKET_DEPOSIT_WALLET_BEACON, args);
      assert.equal(keccak256(depositWalletInitCode(owner, "uups")), uupsHash);
      assert.equal(keccak256(depositWalletInitCode(owner, "beacon")), beaconHash);
      assert.equal(depositWalletAddress(owner, "uups"), create2ByHand(POLYMARKET_DEPOSIT_WALLET_FACTORY, salt, uupsHash));
      assert.equal(depositWalletAddress(owner, "beacon"), create2ByHand(POLYMARKET_DEPOSIT_WALLET_FACTORY, salt, beaconHash));
      assert.notEqual(depositWalletAddress(owner, "uups"), depositWalletAddress(owner, "beacon"));
    }
  });

  it("the runtime code is the creation code from byte 0x23, 125 bytes (UUPS) or 146 bytes (beacon), ending in the owner's args", () => {
    const args = depositWalletArgs(TEST_OWNER);
    const uups = depositWalletRuntimeCode(TEST_OWNER, "uups");
    const beacon = depositWalletRuntimeCode(TEST_OWNER, "beacon");
    assert.equal((uups.length - 2) / 2, 125);
    assert.equal((beacon.length - 2) / 2, 146);
    assert.equal(uups, sliceHex(depositWalletInitCode(TEST_OWNER, "uups"), 0x23));
    assert.equal(beacon, sliceHex(depositWalletInitCode(TEST_OWNER, "beacon"), 0x23));
    // The ERC-1967 proxy reads its implementation from the EIP-1967 slot; the beacon proxy from the beacon slot.
    assert.ok(uups.startsWith("0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"));
    assert.ok(beacon.startsWith("0x363d3d373d3d363d602036600436635c60da1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"));
    assert.ok(uups.endsWith(args.slice(2)));
    assert.ok(beacon.endsWith(args.slice(2)));
  });

  it("names which form an address is for an owner, and nothing else", () => {
    const [beacon, uups] = depositWalletCandidates(TEST_OWNER);
    assert.equal(beacon?.proxy, "beacon");
    assert.equal(uups?.proxy, "uups");
    assert.equal(depositWalletProxyOf(TEST_OWNER, LIVE_PREDICTED_BEACON_WALLET.toLowerCase()), "beacon");
    assert.equal(depositWalletProxyOf(TEST_OWNER, depositWalletAddress(TEST_OWNER, "uups")), "uups");
    assert.equal(depositWalletProxyOf(TEST_OWNER, TEST_OWNER), null);
    assert.equal(depositWalletProxyOf(ANVIL_TEST_ACCOUNTS[1]!.address, LIVE_PREDICTED_BEACON_WALLET), null, "another owner's wallet is not this owner's");
    assert.equal(clobAccountOf(TEST_OWNER, TEST_OWNER.toLowerCase()), TEST_OWNER);
    assert.equal(clobAccountOf(TEST_OWNER, LIVE_PREDICTED_BEACON_WALLET), LIVE_PREDICTED_BEACON_WALLET);
    assert.equal(clobAccountOf(TEST_OWNER, ANVIL_TEST_ACCOUNTS[1]!.address), null);
  });
});

describe("Deposit Wallet reads", () => {
  const wallet = LIVE_PREDICTED_BEACON_WALLET as Address;
  const domain = (over: Partial<{ fields: Hex; name: string; version: string; chainId: bigint; verifyingContract: Address; salt: Hex; extensions: bigint[] }> = {}): Hex =>
    encodeAbiParameters(
      [{ type: "bytes1" }, { type: "string" }, { type: "string" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint256[]" }],
      [over.fields ?? "0x0f", over.name ?? "DepositWallet", over.version ?? "1", over.chainId ?? 137n, over.verifyingContract ?? wallet, over.salt ?? `0x${"00".repeat(32)}`, over.extensions ?? []],
    );

  it("calls owner() and eip712Domain() by their selectors", () => {
    assert.equal(DEPOSIT_WALLET_OWNER_CALL, "0x8da5cb5b");
    assert.equal(DEPOSIT_WALLET_DOMAIN_CALL, "0x84b0196e");
  });

  it("accepts exactly the DepositWallet version 1 domain on chain 137 at the wallet itself", () => {
    assert.equal(depositWalletDomainMatches(domain(), wallet, 137), true);
    assert.equal(depositWalletDomainMatches(domain({ name: "Other" }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches(domain({ version: "2" }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches(domain({ chainId: 80002n }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches(domain({ verifyingContract: TEST_OWNER }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches(domain({ salt: `0x${"01".repeat(32)}` }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches(domain({ fields: "0x1f" }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches(domain({ extensions: [1n] }), wallet, 137), false);
    assert.equal(depositWalletDomainMatches("0x", wallet, 137), false);
  });

  it("decodes owner() and refuses an answer that is not an address", () => {
    assert.equal(decodeDepositWalletOwner(pad(TEST_OWNER.toLowerCase() as Hex, { size: 32 })), TEST_OWNER);
    assert.equal(decodeDepositWalletOwner("0x"), null);
  });
});
