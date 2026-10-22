import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it, type TestContext } from "node:test";

import { concatHex, decodeFunctionResult, encodeFunctionData, keccak256, pad, parseAbi, stringToHex, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  DEPOSIT_WALLET_DOMAIN_CALL,
  DEPOSIT_WALLET_OWNER_CALL,
  decodeDepositWalletOwner,
  depositWalletAddress,
  depositWalletArgs,
  depositWalletDomainMatches,
  depositWalletInitCode,
  depositWalletRuntimeCode,
  type DepositWalletProxy,
} from "../src/clob/polymarket/deposit-wallet.js";
import { hashPolymarketDepositWalletOrder, hashPolymarketOrder, wrapPolymarketDepositWalletSignature, type PolymarketOrder } from "../src/clob/polymarket/order.js";
import { POLYMARKET_EXCHANGES } from "../src/clob/venues.js";
import {
  POLYMARKET_DEPOSIT_WALLET_BEACON,
  POLYMARKET_DEPOSIT_WALLET_BEACON_IMPLEMENTATION,
  POLYMARKET_DEPOSIT_WALLET_FACTORY,
  POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION,
} from "../src/xo/chain/constants.js";
import { startAnvil, type AnvilHandle } from "./anvil/start.js";

// What this file proves, on a local anvil with chain id 137 and the REAL runtime bytecode of Polymarket's Deposit Wallet
// implementations and beacon (test/fixtures/polymarket-bytecode: each a Sourcify exact match on chain 137 and equal to
// eth_getCode on 2026-10-21; size, sha256 and keccak256 are re-checked on load):
//   1. the creation code src/clob/polymarket/deposit-wallet.ts derives, run by CREATE2 from the factory's address,
//      lands at the derived address and leaves exactly the derived runtime code, in both forms (UUPS and beacon);
//   2. the wallet then answers owner() and eip712Domain() the way the relay's checks expect;
//   3. the signature this build makes for a type-3 order (the owner's signature over the TypedDataSign digest, wrapped
//      with the exchange domain separator, the contents hash and the Order type string) passes the wallet's own
//      isValidSignature for the order hash when called the way the exchange calls it, and a wrong one does not.
// It does NOT run Polymarket's factory (its operator role and its deploy() are not exercised: a 28-byte CREATE2 stub
// stands at the factory's address), the exchange contract, or the venue's gateway. The wallet's owner is set by calling
// its own initialize(), as the factory does in the same transaction. Nothing here touches a network beyond 127.0.0.1.

const FIXTURES = new URL("./fixtures/polymarket-bytecode/", import.meta.url);

interface Fixture {
  readonly address: Address;
  readonly code: Hex;
}

function loadFixture(name: string, expectedAddress: Address): Fixture {
  const code = readFileSync(new URL(`${name}.hex`, FIXTURES), "utf8").trim().toLowerCase() as Hex;
  const sidecar = JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), "utf8")) as Record<string, unknown>;
  assert.match(code, /^0x(?:[0-9a-f]{2})+$/, `${name}: not hex`);
  const bytes = Buffer.from(code.slice(2), "hex");
  assert.equal(sidecar["address"], expectedAddress, `${name}: address`);
  assert.equal(sidecar["chain_id"], 137, `${name}: chain`);
  assert.equal(sidecar["size"], bytes.length, `${name}: size`);
  assert.equal(sidecar["sha256"], createHash("sha256").update(bytes).digest("hex"), `${name}: sha256`);
  assert.equal(sidecar["keccak256"], keccak256(code), `${name}: keccak256`);
  assert.equal(sidecar["sourcify_match"], "exact_match", `${name}: Sourcify match`);
  return { address: expectedAddress, code };
}

// A CREATE2 deployer: calldata = salt (32 bytes) || creation code; returns the created address.
//   CALLDATASIZE PUSH1 0x20 SWAP1 SUB DUP1 PUSH1 0x20 PUSH1 0 CALLDATACOPY PUSH1 0 CALLDATALOAD SWAP1 PUSH1 0 PUSH1 0
//   CREATE2 PUSH1 0 MSTORE PUSH1 0x20 PUSH1 0 RETURN
const CREATE2_STUB: Hex = "0x36602090038060206000376000359060006000f560005260206000f3";
const EIP1967_IMPLEMENTATION_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
// Solady UpgradeableBeacon's implementation slot, kept by DepositWalletBeacon (src/DepositWalletBeacon.sol in the beacon's
// verified source: `_UPGRADEABLE_BEACON_IMPLEMENTATION_SLOT = 0x911c5a209f08d5ec5e`).
const BEACON_IMPLEMENTATION_SLOT: Hex = pad("0x911c5a209f08d5ec5e", { size: 32 });
const ERC1271_MAGIC = "0x1626ba7e";

const WALLET_ABI = parseAbi(["function initialize(address _owner)", "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);

// TEST-ONLY keys, derived here from fixed constants, never funded, never used anywhere else.
const TEST_ONLY_OWNER = privateKeyToAccount(keccak256(stringToHex("insurance-markets TEST-ONLY deposit wallet owner key; never funded")));
const TEST_ONLY_STRANGER = privateKeyToAccount(keccak256(stringToHex("insurance-markets TEST-ONLY stranger key; never funded")));
const ZERO32: Hex = `0x${"00".repeat(32)}`;

let anvil: AnvilHandle | null = null;
let skipReason: string | null = null;
let sender: Address;

before(async () => {
  // The current beacon implementation was compiled for osaka (its Sourcify compiler settings); the UUPS one for cancun.
  const started = await startAnvil({ chainId: 137, hardfork: "osaka" });
  if (!started.ok) {
    skipReason = started.reason;
    return;
  }
  anvil = started;
  const accounts = await anvil.rpc<Address[]>("eth_accounts");
  sender = accounts[0] as Address;
});

after(async () => {
  await anvil?.stop();
});

function chain(t: TestContext): AnvilHandle | null {
  if (anvil === null) {
    t.skip(skipReason ?? "anvil is not available");
    return null;
  }
  return anvil;
}

async function send(node: AnvilHandle, to: Address, data: Hex): Promise<void> {
  const hash = await node.rpc<Hex>("eth_sendTransaction", [{ from: sender, to, data, gas: toHex(3_000_000) }]);
  const receipt = await node.rpc<{ status: Hex }>("eth_getTransactionReceipt", [hash]);
  assert.equal(receipt.status, "0x1", `transaction to ${to} failed`);
}

async function call(node: AnvilHandle, to: Address, data: Hex, from?: Address): Promise<Hex> {
  return node.rpc<Hex>("eth_call", [{ to, data, ...(from === undefined ? {} : { from }) }, "latest"]);
}

// Deploys the owner's wallet in one form through the CREATE2 stub at the factory's address and initialises its owner.
async function deployWallet(node: AnvilHandle, proxy: DepositWalletProxy): Promise<Address> {
  await node.rpc("anvil_setCode", [POLYMARKET_DEPOSIT_WALLET_FACTORY, CREATE2_STUB]);
  const salt = keccak256(depositWalletArgs(TEST_ONLY_OWNER.address));
  await send(node, POLYMARKET_DEPOSIT_WALLET_FACTORY, concatHex([salt, depositWalletInitCode(TEST_ONLY_OWNER.address, proxy)]));
  const wallet = depositWalletAddress(TEST_ONLY_OWNER.address, proxy);
  assert.equal((await node.rpc<Hex>("eth_getCode", [wallet, "latest"])).toLowerCase(), depositWalletRuntimeCode(TEST_ONLY_OWNER.address, proxy), "CREATE2 from the factory address lands at the derived address with the derived runtime");
  await send(node, wallet, encodeFunctionData({ abi: WALLET_ABI, functionName: "initialize", args: [TEST_ONLY_OWNER.address] }));
  return wallet;
}

function order(wallet: Address, over: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    salt: 123456789n,
    maker: wallet,
    signer: wallet,
    tokenId: 74611051635435493013469257818411865069553882173471237703549469284847187679089n,
    makerAmount: 5_200_000n,
    takerAmount: 10_000_000n,
    side: 0,
    signatureType: 3,
    timestamp: 1792411200000n,
    metadata: ZERO32,
    builder: ZERO32,
    ...over,
  };
}

// The wallet's answer, or "reverted" (the exchange's SignatureCheckerLib counts a revert as an invalid signature too).
async function isValid(node: AnvilHandle, wallet: Address, hash: Hex, signature: Hex): Promise<string> {
  // From the exchange's address, the way the exchange calls it (any caller other than the factory takes the nested path).
  let data: Hex;
  try {
    data = await call(node, wallet, encodeFunctionData({ abi: WALLET_ABI, functionName: "isValidSignature", args: [hash, signature] }), POLYMARKET_EXCHANGES.v2.verifyingContract);
  } catch (error) {
    if (error instanceof Error && /execution reverted/.test(error.message)) return "reverted";
    throw error;
  }
  return decodeFunctionResult({ abi: WALLET_ABI, functionName: "isValidSignature", data });
}

async function checkWallet(node: AnvilHandle, wallet: Address): Promise<void> {
  assert.equal(decodeDepositWalletOwner(await call(node, wallet, DEPOSIT_WALLET_OWNER_CALL)), TEST_ONLY_OWNER.address);
  assert.ok(depositWalletDomainMatches(await call(node, wallet, DEPOSIT_WALLET_DOMAIN_CALL), wallet, 137), "the wallet's eip712Domain() is the one the relay requires");

  const theOrder = order(wallet);
  const orderHash = hashPolymarketOrder(theOrder, "v2");
  const inner = await TEST_ONLY_OWNER.sign({ hash: hashPolymarketDepositWalletOrder(theOrder, "v2") });
  const wrapped = wrapPolymarketDepositWalletSignature(inner, theOrder, "v2");
  assert.equal(await isValid(node, wallet, orderHash, wrapped), ERC1271_MAGIC, "the wrapped owner signature is valid for the order hash");

  // Refusals, each by the wallet itself.
  const strangerInner = await TEST_ONLY_STRANGER.sign({ hash: hashPolymarketDepositWalletOrder(theOrder, "v2") });
  assert.notEqual(await isValid(node, wallet, orderHash, wrapPolymarketDepositWalletSignature(strangerInner, theOrder, "v2")), ERC1271_MAGIC, "another key");
  assert.notEqual(await isValid(node, wallet, orderHash, inner), ERC1271_MAGIC, "the bare 65-byte signature (the exchange is not the factory, so only the nested path counts)");
  const plainOrderSignature = await TEST_ONLY_OWNER.sign({ hash: orderHash });
  assert.notEqual(await isValid(node, wallet, orderHash, plainOrderSignature), ERC1271_MAGIC, "a signature over the order hash itself");
  assert.notEqual(await isValid(node, wallet, orderHash, wrapPolymarketDepositWalletSignature(inner, theOrder, "ctf")), ERC1271_MAGIC, "a wrapper naming another exchange");
  assert.notEqual(await isValid(node, wallet, hashPolymarketOrder(order(wallet, { makerAmount: 5_300_000n }), "v2"), wrapped), ERC1271_MAGIC, "another order's hash");
}

describe("Polymarket Deposit Wallet on a local EVM (real bytecode, chain id 137)", () => {
  it("UUPS form with the UUPS-era implementation: derived address and runtime, owner, domain, and the wrapped signature", async (t) => {
    const node = chain(t);
    if (node === null) return;
    const implementation = loadFixture("deposit-wallet-uups-implementation", POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION);
    await node.rpc("anvil_setCode", [implementation.address, implementation.code]);
    const wallet = await deployWallet(node, "uups");
    assert.equal((await node.rpc<Hex>("eth_getStorageAt", [wallet, EIP1967_IMPLEMENTATION_SLOT, "latest"])).toLowerCase(), pad(implementation.address.toLowerCase() as Hex, { size: 32 }), "the proxy's constructor stored the implementation");
    await checkWallet(node, wallet);
  });

  it("beacon form with the real beacon and its current implementation: derived address and runtime, owner, domain, and the wrapped signature", async (t) => {
    const node = chain(t);
    if (node === null) return;
    const beacon = loadFixture("deposit-wallet-beacon", POLYMARKET_DEPOSIT_WALLET_BEACON);
    const implementation = loadFixture("deposit-wallet-beacon-implementation", POLYMARKET_DEPOSIT_WALLET_BEACON_IMPLEMENTATION);
    await node.rpc("anvil_setCode", [beacon.address, beacon.code]);
    await node.rpc("anvil_setStorageAt", [beacon.address, BEACON_IMPLEMENTATION_SLOT, pad(implementation.address.toLowerCase() as Hex, { size: 32 })]);
    await node.rpc("anvil_setCode", [implementation.address, implementation.code]);
    const wallet = await deployWallet(node, "beacon");
    await checkWallet(node, wallet);
  });
});
