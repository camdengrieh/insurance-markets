import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it, type TestContext } from "node:test";

import {
  concat,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  hashTypedData,
  keccak256,
  pad,
  parseAbi,
  parseEventLogs,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { getUserOperationHash } from "viem/account-abstraction";

import { buildInitCode, buildInitData, deriveAccount, validatorOwnerStorageKey } from "../src/xo/account/derive.js";
import { ECDSA_VALIDATOR_ABI, KERNEL_FACTORY_ABI, POLICY_PAYMASTER_ABI } from "../src/xo/chain/abi.js";
import * as C from "../src/xo/chain/constants.js";
import { KERNEL_TYPES, assembleWireSignature, buildKernelTypedData, hashOrder, kernelWrapDigest, type XoOrder } from "../src/xo/signing/index.js";
import { BYTECODE_NAMES, loadAllBytecode, loadBytecode, patchKernelImplementation } from "./anvil/bytecode.js";
import {
  PAYMASTER_ADMIN_ABI,
  PAYMASTER_REPLAY,
  TraceUnsupportedError,
  flattenFrames,
  startXoChain,
  testAccount,
  type CallFrame,
  type HandleOpsFailure,
  type HandleOpsSuccess,
  type XoChain,
} from "./anvil/chain.js";
import {
  MAX_UINT256,
  approveCall,
  asPaymasterOwner,
  buildOp,
  enableTradingCalls,
  seeded,
  setApprovalForAllCall,
  transferCall,
  transferRemoteCall,
} from "./anvil/scenarios.js";
import { findAnvil, startAnvil } from "./anvil/start.js";
import { CTF_STUB_ABI, EXCHANGE_STUB_ABI, USDCE_STUB_ABI, ctfStubRuntime, exchangeStubRuntime, usdceStubRuntime } from "./anvil/stubs.js";
import {
  encodeExecute,
  encodeExecuteRaw,
  entryPointNonceKey,
  flipByte,
  kernelNonce,
  malleate,
  packUserOp,
  signingDigests,
  splitSignature,
  userOpHash,
  withSignature,
  withV,
} from "./anvil/userop.js";

// What this file proves, against the REAL bytecode captured from the XO explorer on 2026-10-19
// (EntryPoint v0.7, SenderCreator, KernelFactory 0.3.1, ECDSA validator, Kernel 0.3.1, PolicyPaymaster)
// running on a local anvil with chain id 3223, with stub contracts for USDC.e, the exchange and the
// Conditional Tokens. It proves contract-level behaviour only. It proves nothing about XO's bundler,
// registry, orderbook or gateway, and nothing about gas of the real USDC.e or CTF (the targets are
// stubs; verification-gas facts are independent of them, call-gas facts are not).
//
// Keys: the public Anvil/Hardhat TEST mnemonic. Randomness: a keccak-seeded generator, no Math.random,
// no wall clock in any assertion (the chain starts at a fixed genesis timestamp).

const pairs = JSON.parse(readFileSync(new URL("./fixtures/chain/owner-account-pairs.json", import.meta.url), "utf8")) as {
  anvil: Array<{ index: number; owner: Address; account: Address }>;
};

const KERNEL_VIEW_ABI = parseAbi([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);
const MAGIC = "0x1626ba7e";
const INVALID = "0xffffffff";
// Kernel v3.1 custom errors (docs/research/19 sec 7.2 and V1): InvalidSignature(), InvalidValidator().
const INVALID_SIGNATURE_ERROR = "0x8baa579f";
const INVALID_VALIDATOR_ERROR = "0x682a6e7c";

// ---- fixture-wide state -------------------------------------------------------------------------------------

let chain: XoChain | null = null;
let skipReason: string | null = null;
let snapshotId = "";

before(async () => {
  const started = await startXoChain();
  if (started.ok) chain = started.chain;
  else skipReason = started.reason;
});

after(async () => {
  await chain?.stop();
});

// Every test starts from the freshly set up chain (anvil snapshots are single use).
beforeEach(async () => {
  if (chain === null) return;
  if (snapshotId !== "") await chain.revert(snapshotId);
  snapshotId = await chain.snapshot();
});

function need(): XoChain {
  if (chain === null) throw new Error("the chain is not running");
  return chain;
}

// it() that skips with the reason when anvil (or a fixture) is not available.
function chainTest(name: string, body: (c: XoChain) => Promise<void>): void {
  it(name, async (t: TestContext) => {
    if (skipReason !== null) return t.skip(skipReason);
    await body(need());
  });
}

// A test that reads the call tree: skipped (with the reason) on an anvil whose tracer does not provide one.
function traceTest(name: string, body: (c: XoChain) => Promise<void>): void {
  it(name, async (t: TestContext) => {
    if (skipReason !== null) return t.skip(skipReason);
    try {
      await body(need());
    } catch (error) {
      if (error instanceof TraceUnsupportedError) return t.skip(error.message);
      throw error;
    }
  });
}

const owner0 = testAccount(0);
const owner2 = testAccount(2);
const owner3 = testAccount(3);
const account0 = deriveAccount(owner0.address);

function landed(outcome: HandleOpsSuccess | HandleOpsFailure, expectExecution = true): HandleOpsSuccess {
  if (!outcome.ok) assert.fail(`the bundle was rejected: ${outcome.error.name} ${outcome.error.reason ?? ""} ${outcome.error.inner ?? ""}`);
  if (expectExecution) for (const op of outcome.ops) assert.equal(op.success, true, "the operation's execution succeeded");
  return outcome;
}

function rejected(outcome: { ok: true } | HandleOpsSuccess | HandleOpsFailure, code: string): HandleOpsFailure {
  if (outcome.ok) assert.fail(`expected ${code} but the bundle was accepted`);
  assert.equal(outcome.error.code, code, `${outcome.error.name}: ${outcome.error.reason ?? ""}`);
  return outcome;
}

async function codeOf(c: XoChain, address: Address): Promise<Hex> {
  return ((await c.publicClient.getCode({ address })) ?? "0x") as Hex;
}

// Deploys owner 0's account with an unsponsored, zero-fee first operation (Enable Trading) and returns
// the next sequence number.
async function deployAccount0(c: XoChain, signWith: "raw" | "eip191" = "raw"): Promise<bigint> {
  const { op } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, signWith });
  landed(await c.handleOps([op]));
  return 1n;
}

// The calls the account itself made to the stub targets (what Kernel's execute ran), in order.
function callsFrom(root: CallFrame, account: Address): Array<{ to: Address; input: Hex; type: string }> {
  const targets = new Set([C.USDC_E_ADDRESS, C.CONDITIONAL_TOKENS, C.CTF_EXCHANGE].map((address) => address.toLowerCase()));
  return flattenFrames(root)
    .filter((frame) => frame.from.toLowerCase() === account.toLowerCase() && frame.type === "CALL" && targets.has((frame.to ?? "").toLowerCase()))
    .map((frame) => ({ to: getAddress(frame.to as Address), input: frame.input, type: frame.type }));
}

// ---- start.ts ------------------------------------------------------------------------------------------------------

describe("anvil start: loopback, free port, clean stop, clean skip", () => {
  it("returns a loopback URL on a free port, answers with the chain id and is gone after stop()", async (t) => {
    const first = await startAnvil({ chainId: C.XO_CHAIN_ID });
    if (!first.ok) return t.skip(first.reason);
    const second = await startAnvil({ chainId: 31337 });
    try {
      assert.match(first.url, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.ok(first.port > 0 && first.port < 65536);
      assert.equal(await first.rpc("eth_chainId"), "0xc97");
      assert.ok(second.ok, "a second instance starts too");
      if (second.ok) {
        assert.notEqual(second.port, first.port, "each start picks its own free port");
        assert.equal(await second.rpc("eth_chainId"), "0x7a69");
      }
      assert.match(first.version, /\d+\.\d+\.\d+/);
    } finally {
      await first.stop();
      if (second.ok) await second.stop();
    }
    await assert.rejects(fetch(first.url, { method: "POST", signal: AbortSignal.timeout(2_000) }), "nothing listens on the port after stop()");
    await first.stop(); // a second stop() is harmless
  });

  it("does not listen on any non-loopback address", async (t) => {
    const started = await startAnvil({ chainId: C.XO_CHAIN_ID });
    if (!started.ok) return t.skip(started.reason);
    try {
      const external = Object.values(networkInterfaces())
        .flatMap((entries) => entries ?? [])
        .find((entry) => entry.family === "IPv4" && !entry.internal);
      if (external === undefined) return t.skip("no non-loopback interface on this machine to probe");
      await assert.rejects(
        fetch(`http://${external.address}:${String(started.port)}`, { method: "POST", signal: AbortSignal.timeout(2_000) }),
        "the node must not answer on a LAN address",
      );
    } finally {
      await started.stop();
    }
  });

  it("returns { ok: false, reason } instead of throwing when anvil is missing or broken", async () => {
    const savedPath = process.env["PATH"];
    const savedBin = process.env["XO_ANVIL_BIN"];
    try {
      delete process.env["XO_ANVIL_BIN"];
      process.env["PATH"] = "";
      const missing = await startAnvil({ chainId: C.XO_CHAIN_ID });
      assert.equal(missing.ok, false);
      if (!missing.ok) assert.match(missing.reason, /not installed/);
      assert.deepEqual(await findAnvil(), { reason: "anvil is not installed (no 'anvil' on PATH and XO_ANVIL_BIN is not set)" });

      process.env["XO_ANVIL_BIN"] = "/nonexistent/anvil";
      const broken = await startAnvil({ chainId: C.XO_CHAIN_ID });
      assert.equal(broken.ok, false);
      if (!broken.ok) assert.match(broken.reason, /did not answer --version/);
    } finally {
      if (savedPath === undefined) delete process.env["PATH"];
      else process.env["PATH"] = savedPath;
      if (savedBin === undefined) delete process.env["XO_ANVIL_BIN"];
      else process.env["XO_ANVIL_BIN"] = savedBin;
    }
  });

  // Runs test/anvil/leak-probe.ts in a child process and returns what it printed. `mode` "exit" makes it
  // leave without stop(); "wait" makes it wait for a signal, which the caller sends.
  async function probe(mode: "exit" | "wait", signal?: NodeJS.Signals): Promise<string> {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const script = fileURLToPath(new URL("./anvil/leak-probe.ts", import.meta.url));
    const child = spawn(process.execPath, ["--import", "tsx", script, ...(mode === "wait" ? ["wait"] : [])], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    const printed = new Promise<void>((resolve) => {
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("\n")) resolve();
      });
    });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    if (mode === "wait") {
      await printed;
      assert.ok(signal !== undefined);
      child.kill(signal);
    }
    await exited;
    return output;
  }

  async function assertGone(output: string): Promise<void> {
    const url = output.trim().split("\n")[0] ?? "";
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/, `the probe printed ${JSON.stringify(output)}`);
    // The kill is asynchronous with respect to the parent's exit; give it a moment.
    let answering = true;
    for (let attempt = 0; attempt < 50 && answering; attempt += 1) {
      answering = await fetch(url, { method: "POST", signal: AbortSignal.timeout(500) }).then(
        () => true,
        () => false,
      );
      if (answering) await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(answering, false, "the orphaned anvil must be killed");
  }

  it("a process that exits without calling stop() does not leave anvil behind", async (t) => {
    const found = await findAnvil();
    if ("reason" in found) return t.skip(found.reason);
    await assertGone(await probe("exit"));
  });

  it("a process that is interrupted or terminated does not leave anvil behind either", async (t) => {
    const found = await findAnvil();
    if ("reason" in found) return t.skip(found.reason);
    for (const signal of ["SIGTERM", "SIGINT"] as const) await assertGone(await probe("wait", signal));
  });
});

// ---- the harness itself ----------------------------------------------------------------------------------------------

describe("harness: the real code is installed at the real addresses", () => {
  chainTest("runs chain 3223 and installs byte-for-byte the captured code for all six contracts", async (c) => {
    assert.equal(BigInt(await c.rpc<Hex>("eth_chainId")), 3223n);
    const all = loadAllBytecode();
    for (const name of BYTECODE_NAMES) {
      assert.equal(await codeOf(c, all[name].address), all[name].code, name);
    }
  });

  chainTest("installs the stubs and nothing else at the stubbed addresses", async (c) => {
    assert.equal(await codeOf(c, C.USDC_E_ADDRESS), usdceStubRuntime());
    assert.equal(await codeOf(c, C.CONDITIONAL_TOKENS), ctfStubRuntime());
    assert.equal(await codeOf(c, C.CTF_EXCHANGE), exchangeStubRuntime());
    // contracts the harness does not model stay empty
    for (const address of [C.MARKET_MANAGER, C.XO_WARP_ROUTE, C.BASE_WARP_ROUTER]) assert.equal(await codeOf(c, address), "0x");
    // the account of Anvil account 0 is not deployed until a UserOp does it
    assert.equal(await codeOf(c, C.ANVIL_ACCOUNT_0_ACCOUNT), "0x");
  });

  chainTest("the test mnemonic yields the ten well-known Anvil addresses, and the bundler is not an owner under test", async (c) => {
    assert.equal(owner0.address, C.ANVIL_ACCOUNT_0_OWNER);
    for (const pair of pairs.anvil) assert.equal(testAccount(pair.index).address, pair.owner, `anvil ${String(pair.index)}`);
    assert.equal(c.bundler.address, testAccount(1).address);
    assert.ok((await c.publicClient.getBalance({ address: c.bundler.address })) > 10n ** 18n);
    assert.equal(await c.publicClient.getBalance({ address: account0 }), 0n, "the smart account has no native balance and needs none");
    assert.throws(() => testAccount(10));
    assert.throws(() => testAccount(-1));
  });

  chainTest("the block clock starts at the fixed genesis timestamp and can be moved", async (c) => {
    const start = await c.blockTimestamp();
    assert.ok(start >= 1_792_368_000 && start < 1_792_368_000 + 600, "no dependence on today's date");
    await c.setNextBlockTimestamp(1_792_368_000 + 86_400 * 3);
    assert.equal(await c.blockTimestamp(), 1_792_368_000 + 86_400 * 3);
  });

  chainTest("snapshot and revert undo state, which the tests rely on", async (c) => {
    const snapshot = await c.snapshot();
    await c.anvil.rpc("anvil_setBalance", [account0, toHex(5n)]);
    assert.equal(await c.publicClient.getBalance({ address: account0 }), 5n);
    await c.revert(snapshot);
    assert.equal(await c.publicClient.getBalance({ address: account0 }), 0n);
    await assert.rejects(c.revert("0xdeadbeef"), /refused/);
    snapshotId = await c.snapshot();
  });
});

// ---- userOpHash --------------------------------------------------------------------------------------------------------

describe("userOpHash: three implementations and the real EntryPoint agree", () => {
  chainTest("matches viem's getUserOperationHash and the real EntryPoint.getUserOpHash for seeded random operations", async (c) => {
    const random = seeded("userop-hash-v1");
    for (let index = 0; index < 24; index += 1) {
      const withInit = random.below(2) === 1;
      const withPaymaster = random.below(2) === 1;
      const factory = random.address();
      const factoryData = random.bytes(4 + random.below(200));
      const paymasterData = random.below(2) === 1 ? random.bytes(random.below(40)) : "0x";
      const parts = {
        sender: random.address(),
        nonce: random.word() % 2n ** 256n,
        callData: random.bytes(random.below(300)),
        verificationGasLimit: random.word() % 2n ** 100n,
        callGasLimit: random.word() % 2n ** 100n,
        preVerificationGas: random.word() % 2n ** 100n,
        maxPriorityFeePerGas: random.word() % 2n ** 100n,
        maxFeePerGas: random.word() % 2n ** 100n,
        ...(withInit ? { initCode: concat([factory, factoryData]) } : {}),
        ...(withPaymaster
          ? { paymaster: { address: random.address(), verificationGasLimit: random.word() % 2n ** 100n, postOpGasLimit: random.word() % 2n ** 100n, data: paymasterData } }
          : {}),
      };
      const op = packUserOp(parts);
      const mine = userOpHash(op, { entryPoint: C.ENTRY_POINT_V07, chainId: C.XO_CHAIN_ID });
      const onchain = await c.entryPointGetUserOpHash(op);
      const viemHash = getUserOperationHash({
        chainId: C.XO_CHAIN_ID,
        entryPointAddress: C.ENTRY_POINT_V07,
        entryPointVersion: "0.7",
        userOperation: {
          sender: parts.sender,
          nonce: parts.nonce,
          callData: parts.callData,
          callGasLimit: parts.callGasLimit,
          verificationGasLimit: parts.verificationGasLimit,
          preVerificationGas: parts.preVerificationGas,
          maxFeePerGas: parts.maxFeePerGas,
          maxPriorityFeePerGas: parts.maxPriorityFeePerGas,
          ...(withInit ? { factory, factoryData } : {}),
          ...(withPaymaster
            ? {
                paymaster: parts.paymaster?.address as Address,
                paymasterVerificationGasLimit: parts.paymaster?.verificationGasLimit as bigint,
                paymasterPostOpGasLimit: parts.paymaster?.postOpGasLimit as bigint,
                paymasterData,
              }
            : {}),
          signature: "0x",
        },
      });
      assert.equal(mine, onchain, `op ${String(index)}: the harness hash equals the EntryPoint's`);
      assert.equal(mine, viemHash, `op ${String(index)}: the harness hash equals viem's`);
    }
  });

  chainTest("changes with every field except the signature, and binds the chain and the EntryPoint", async (c) => {
    const { unsigned } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true, signWith: "none" });
    const context = { entryPoint: C.ENTRY_POINT_V07, chainId: C.XO_CHAIN_ID };
    const base = userOpHash(unsigned, context);
    assert.equal(userOpHash(withSignature(unsigned, `0x${"11".repeat(65)}`), context), base, "the signature is not hashed");
    const mutated = [
      { ...unsigned, sender: owner2.address },
      { ...unsigned, nonce: unsigned.nonce + 1n },
      { ...unsigned, initCode: "0x" as Hex },
      { ...unsigned, callData: `${unsigned.callData}00` as Hex },
      { ...unsigned, accountGasLimits: `0x${"00".repeat(31)}01` as Hex },
      { ...unsigned, preVerificationGas: unsigned.preVerificationGas + 1n },
      { ...unsigned, gasFees: `0x${"00".repeat(31)}01` as Hex },
      { ...unsigned, paymasterAndData: "0x" as Hex },
    ];
    for (const op of mutated) assert.notEqual(userOpHash(op, context), base);
    assert.notEqual(userOpHash(unsigned, { ...context, chainId: C.BASE_CHAIN_ID }), base, "chain id is in the hash");
    assert.notEqual(userOpHash(unsigned, { ...context, entryPoint: owner2.address }), base, "entry point is in the hash");
  });

  chainTest("the two signing digests are the hash itself and its EIP-191 personal_sign hash", async () => {
    const hash: Hex = keccak256("0x01");
    const digests = signingDigests(hash);
    assert.equal(digests.raw, hash);
    assert.equal(digests.eip191, keccak256(concat([toHex("\x19Ethereum Signed Message:\n32"), hash])));
    assert.notEqual(digests.raw, digests.eip191);
  });
});

// ---- account derivation against the real factory ------------------------------------------------------------------------

describe("account derivation: the production derive module against the real KernelFactory bytecode", () => {
  chainTest("factory.implementation() is the pinned implementation, and getAddress equals deriveAccount for 50 owners", async (c) => {
    const implementation = await c.publicClient.readContract({ address: C.KERNEL_FACTORY, abi: KERNEL_FACTORY_ABI, functionName: "implementation" });
    assert.equal(implementation, C.KERNEL_IMPLEMENTATION);
    const random = seeded("derive-v1");
    const owners = [...pairs.anvil.map((pair) => pair.owner), ...Array.from({ length: 40 }, () => random.address())];
    assert.equal(new Set(owners).size, 50);
    const accounts = new Set<Address>();
    for (const owner of owners) {
      const derived = deriveAccount(owner);
      const initData = buildInitData(owner);
      const viaGetAddress = await c.publicClient.readContract({ address: C.KERNEL_FACTORY, abi: KERNEL_FACTORY_ABI, functionName: "getAddress", args: [initData, C.ACCOUNT_SALT] });
      assert.equal(viaGetAddress, derived, `getAddress for ${owner}`);
      // createAccount, simulated: the address the factory would really deploy
      const simulated = await c.anvil.rpc<Hex>("eth_call", [
        { from: owner3.address, to: C.KERNEL_FACTORY, data: encodeFunctionData({ abi: KERNEL_FACTORY_ABI, functionName: "createAccount", args: [initData, C.ACCOUNT_SALT] }) },
        "latest",
      ]);
      assert.equal(getAddress(`0x${simulated.slice(-40)}`), derived, `createAccount for ${owner}`);
      accounts.add(derived);
    }
    assert.equal(accounts.size, 50, "distinct owners give distinct accounts");
    for (const pair of pairs.anvil) assert.equal(deriveAccount(pair.owner), pair.account);
  });

  chainTest("Anvil account 0 maps to the spec's vector on the real factory", async (c) => {
    assert.equal(account0, C.ANVIL_ACCOUNT_0_ACCOUNT);
    const initData = buildInitData(C.ANVIL_ACCOUNT_0_OWNER);
    assert.equal(
      await c.publicClient.readContract({ address: C.KERNEL_FACTORY, abi: KERNEL_FACTORY_ABI, functionName: "getAddress", args: [initData, C.ACCOUNT_SALT] }),
      C.ANVIL_ACCOUNT_0_ACCOUNT,
    );
    // a different salt (index) gives a different account, so the pinned salt 0 matters
    const other = await c.publicClient.readContract({ address: C.KERNEL_FACTORY, abi: KERNEL_FACTORY_ABI, functionName: "getAddress", args: [initData, pad("0x01", { size: 32 })] });
    assert.notEqual(other, C.ANVIL_ACCOUNT_0_ACCOUNT);
  });

  chainTest("buildInitCode equals an independent encoding of factory ++ createAccount(initialize(...), 0)", async () => {
    const independent = concat([
      C.KERNEL_FACTORY.toLowerCase() as Hex,
      encodeFunctionData({
        abi: parseAbi(["function createAccount(bytes data, bytes32 salt)"]),
        functionName: "createAccount",
        args: [
          encodeFunctionData({
            abi: parseAbi(["function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)"]),
            functionName: "initialize",
            args: [concat(["0x01", C.ECDSA_VALIDATOR.toLowerCase() as Hex]), zeroAddress, owner0.address, "0x", []],
          }),
          `0x${"00".repeat(32)}`,
        ],
      }),
    ]);
    assert.equal(buildInitCode(owner0.address), independent.toLowerCase());
    assert.equal((independent.length - 2) / 2, C.USEROP_INIT_CODE_BYTES);
  });

  chainTest("createAccount is permissionless, idempotent, and always installs the owner named in the data", async (c) => {
    const stranger = owner3.address;
    const data = encodeFunctionData({ abi: KERNEL_FACTORY_ABI, functionName: "createAccount", args: [buildInitData(owner0.address), C.ACCOUNT_SALT] });
    assert.equal(await codeOf(c, account0), "0x");
    const created = await c.sendFrom(stranger, C.KERNEL_FACTORY, data);
    assert.equal(created.status, "success");
    assert.equal(await codeOf(c, account0), C.KERNEL_PROXY_RUNTIME_CODE, "a stranger deployed the account");
    assert.equal(await c.publicClient.readContract({ address: C.ECDSA_VALIDATOR, abi: ECDSA_VALIDATOR_ABI, functionName: "ecdsaValidatorStorage", args: [account0] }), owner0.address);
    // the second call returns the same address and changes nothing
    const again = await c.sendFrom(stranger, C.KERNEL_FACTORY, data);
    assert.equal(again.status, "success");
    assert.equal(await c.publicClient.readContract({ address: C.ECDSA_VALIDATOR, abi: ECDSA_VALIDATOR_ABI, functionName: "ecdsaValidatorStorage", args: [account0] }), owner0.address);
    // the stranger cannot take the account by naming itself: a different owner is a different address
    const mine = await c.sendFrom(stranger, C.KERNEL_FACTORY, encodeFunctionData({ abi: KERNEL_FACTORY_ABI, functionName: "createAccount", args: [buildInitData(stranger), C.ACCOUNT_SALT] }));
    assert.equal(mine.status, "success");
    assert.notEqual(deriveAccount(stranger), account0);
    assert.equal(await c.publicClient.readContract({ address: C.ECDSA_VALIDATOR, abi: ECDSA_VALIDATOR_ABI, functionName: "ecdsaValidatorStorage", args: [account0] }), owner0.address);
    // an already deployed account then runs its first UserOp without initCode, and refuses a second deployment
    const { op } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls() });
    landed(await c.handleOps([op]));
    const { op: again2 } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sequence: 1n });
    rejected(await c.handleOps([again2]), "AA10");
  });
});

// ---- deployment by initCode: the Anvil account 0 vector ---------------------------------------------------------------------

describe("initCode: the first UserOp deploys the predicted account", () => {
  chainTest("deploys 0xB3729F7e... for Anvil account 0, registers the owner, and leaves the proxy layout the notes describe", async (c) => {
    assert.equal(await codeOf(c, C.ANVIL_ACCOUNT_0_ACCOUNT), "0x", "undeployed before");
    const { op, account, hash } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true });
    assert.equal(account, C.ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(op.nonce, BigInt(C.FIRST_OP_NONCE));
    assert.equal(await c.getNonce(account, entryPointNonceKey(op.nonce)), BigInt(C.FIRST_OP_NONCE), "a fresh sender is at sequence 0 of its lane");

    const out = landed(await c.handleOps([op]));
    assert.deepEqual(out.deployments, [{ userOpHash: hash, sender: C.ANVIL_ACCOUNT_0_ACCOUNT, factory: C.KERNEL_FACTORY, paymaster: zeroAddress }]);
    assert.equal(out.ops[0]?.userOpHash, hash);
    assert.equal(out.ops[0]?.actualGasCost, 0n, "zero fee, zero prefund");

    assert.equal(await codeOf(c, account), C.KERNEL_PROXY_RUNTIME_CODE, "the 61-byte ERC-1967 proxy");
    assert.equal(
      await c.publicClient.getStorageAt({ address: account, slot: C.EIP1967_IMPLEMENTATION_SLOT }),
      pad(C.KERNEL_IMPLEMENTATION.toLowerCase() as Hex, { size: 32 }),
    );
    assert.equal(await c.publicClient.readContract({ address: C.ECDSA_VALIDATOR, abi: ECDSA_VALIDATOR_ABI, functionName: "ecdsaValidatorStorage", args: [account] }), owner0.address);
    // the validator keeps the owner at keccak256(abi.encode(account, 0))
    assert.equal(
      await c.publicClient.getStorageAt({ address: C.ECDSA_VALIDATOR, slot: validatorOwnerStorageKey(account) }),
      pad(owner0.address.toLowerCase() as Hex, { size: 32 }),
    );
    // OwnerRegistered(kernel, owner) was emitted by the validator, once, in this transaction
    const registered = parseEventLogs({ abi: ECDSA_VALIDATOR_ABI, logs: out.receipt.logs.filter((log) => log.address.toLowerCase() === C.ECDSA_VALIDATOR.toLowerCase()) });
    assert.equal(registered.length, 1);
    assert.deepEqual(registered[0]?.args, { kernel: account, owner: owner0.address });
    assert.equal(out.receipt.logs.some((log) => log.topics[0] === C.OWNER_REGISTERED_TOPIC), true);
    assert.equal(out.receipt.logs.some((log) => log.topics[0] === C.ACCOUNT_DEPLOYED_TOPIC), true);
    // the nonce moved by one
    assert.equal(await c.getNonce(account, entryPointNonceKey(op.nonce)), BigInt(C.FIRST_OP_NONCE) + 1n);
  });

  traceTest("the call tree is EntryPoint -> SenderCreator -> factory -> CREATE2 -> initialize -> validator.onInstall, then the batch", async (c) => {
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true });
    const out = landed(await c.handleOps([op]));
    const frames = flattenFrames(await c.callTrace(out.txHash));
    const pick = (predicate: (frame: CallFrame) => boolean): CallFrame | undefined => frames.find(predicate);
    const createSender = pick((f) => f.input.startsWith("0x570e1a36"));
    assert.equal(createSender?.from.toLowerCase(), C.ENTRY_POINT_V07.toLowerCase(), "EntryPoint calls the SenderCreator");
    const creator = loadAllBytecode()["sender-creator"].address;
    assert.equal(getAddress(createSender?.to as Address), creator);
    const createAccount = pick((f) => f.input.startsWith(C.FACTORY_CREATE_ACCOUNT_SELECTOR));
    assert.equal(createAccount?.from.toLowerCase(), creator.toLowerCase(), "the SenderCreator calls the factory");
    assert.equal(getAddress(createAccount?.to as Address), C.KERNEL_FACTORY);
    assert.equal(createAccount?.input.toLowerCase(), `0x${buildInitCode(owner0.address).slice(2 + 40)}`, "the factory call is the initCode minus the factory address");
    const create2 = pick((f) => f.type === "CREATE2");
    assert.equal(create2?.from.toLowerCase(), C.KERNEL_FACTORY.toLowerCase());
    assert.equal(getAddress(create2?.to as Address), account);
    const initialize = pick((f) => f.input.startsWith(C.KERNEL_INITIALIZE_SELECTOR) && f.type === "CALL");
    assert.equal(initialize?.input.toLowerCase(), buildInitData(owner0.address));
    assert.ok(frames.some((f) => f.type === "CALL" && f.from.toLowerCase() === account.toLowerCase() && f.to?.toLowerCase() === C.ECDSA_VALIDATOR.toLowerCase()), "the account installs its validator");
  });

  chainTest("a sender that is not the account the initCode creates is refused (AA14), as are a missing account (empty revert) and a factory without code (AA13)", async (c) => {
    // owner 0's account address, but the initCode of owner 2: the factory builds a different account
    const wrongInit = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, initCode: buildInitCode(owner2.address) });
    rejected(await c.handleOps([wrongInit.op]), "AA14");
    // no initCode and no account: v0.7 has no AA20 code; the call to an address without code reverts with no data
    const noInit = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls() });
    const missing = await c.handleOps([noInit.op]);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error.name, "EmptyRevert");
    // a factory address with no code
    const nowhere = concat([pad("0xbeef", { size: 20 }), `0x${buildInitCode(owner0.address).slice(2 + 40)}`]);
    const noFactory = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, initCode: nowhere });
    rejected(await c.handleOps([noFactory.op]), "AA13");
    assert.equal(await codeOf(c, account0), "0x", "nothing was deployed by any refused attempt");
  });

  chainTest("a second deployment of the same account is refused (AA10) and the first-op nonce rule holds (AA25)", async (c) => {
    const seq = await deployAccount0(c);
    const again = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sequence: seq });
    rejected(await c.handleOps([again.op]), "AA10");
    const replay = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), sequence: 0n });
    rejected(await c.handleOps([replay.op]), "AA25");
  });

  chainTest("a first operation at sequence 1 is refused before anything is deployed (AA25)", async (c) => {
    const skipAhead = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sequence: 1n });
    rejected(await c.handleOps([skipAhead.op]), "AA25");
    assert.equal(await codeOf(c, account0), "0x");
  });

  chainTest("the gas defaults for the deploying operation: enough at 297,342 verification gas, too little at 200,000", async (c) => {
    // These are verification-gas facts of the real EntryPoint, factory, proxy and Kernel code; they do not
    // depend on the stubbed call targets. 297,342 is the value XO's app uses (docs/research/21 sec 8.1).
    const attempt = async (verificationGasLimit: bigint) => {
      const { op } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, verificationGasLimit });
      return c.simulateHandleOps([op]);
    };
    assert.equal((await attempt(C.GAS_DEFAULTS.deployAndEnableTrading.verificationGasLimit)).ok, true);
    assert.equal((await attempt(250_000n)).ok, true);
    rejected(await attempt(200_000n), "AA26");
    rejected(await attempt(150_000n), "AA13");
  });
});

// ---- UserOp signatures on the real validator ------------------------------------------------------------------------------------

describe("UserOp signatures: what the deployed ECDSA validator accepts and refuses", () => {
  chainTest("accepts the owner's signature over the raw hash and over its EIP-191 hash", async (c) => {
    const seq = await deployAccount0(c);
    for (const signWith of ["raw", "eip191"] as const) {
      const { op } = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 7n)], sequence: seq, signWith });
      assert.equal((await c.simulateHandleOps([op])).ok, true, signWith);
    }
  });

  chainTest("lands each form, in either order, and the nonce moves by one each time", async (c) => {
    await deployAccount0(c, "eip191"); // the deploy itself is signed the way XO's app signs
    const a = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 7n)], sequence: 1n, signWith: "raw" });
    const b = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 8n)], sequence: 2n, signWith: "eip191" });
    landed(await c.handleOps([a.op]));
    landed(await c.handleOps([b.op]));
    assert.equal(await c.getNonce(account0, entryPointNonceKey(kernelNonce())), BigInt(C.FIRST_OP_NONCE) + 3n);
    assert.equal(
      await c.publicClient.readContract({ address: C.USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account0, C.CTF_EXCHANGE] }),
      8n,
    );
  });

  chainTest("refuses a wrong owner, in both forms (AA24)", async (c) => {
    const seq = await deployAccount0(c);
    for (const signWith of ["raw", "eip191"] as const) {
      const { op } = await buildOp({ chain: c, owner: owner0, signer: owner2, calls: [approveCall()], sequence: seq, signWith });
      rejected(await c.simulateHandleOps([op]), "AA24");
    }
  });

  chainTest("refuses a recovery byte of 0, 1, 29 or 0xff as InvalidSignature (AA23 with 0x8baa579f), never as a different signer", async (c) => {
    const seq = await deployAccount0(c);
    const { unsigned, hash } = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq, signWith: "none" });
    const raw = await owner0.sign({ hash });
    const eip191 = await owner0.signMessage({ message: { raw: hash } });
    for (const good of [raw, eip191]) {
      const parity = good.endsWith("1b") ? 0 : good.endsWith("1c") ? 1 : -1;
      assert.ok(parity === 0 || parity === 1, "viem signs with v of 27 or 28");
      for (const v of [parity, 29, 0xff, 2]) {
        const outcome = await c.simulateHandleOps([withSignature(unsigned, withV(good, v))]);
        const failure = rejected(outcome, "AA23");
        assert.equal(failure.error.inner?.slice(0, 10), INVALID_SIGNATURE_ERROR, `v=${String(v)}`);
      }
    }
  });

  chainTest("a flipped bit anywhere in the signature is refused: AA24 (another signer) or AA23 (not recoverable)", async (c) => {
    const seq = await deployAccount0(c);
    const { unsigned, hash } = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq, signWith: "none" });
    for (const good of [await owner0.sign({ hash }), await owner0.signMessage({ message: { raw: hash } })]) {
      for (let index = 0; index < 65; index += 1) {
        const outcome = await c.simulateHandleOps([withSignature(unsigned, flipByte(good, index))]);
        assert.equal(outcome.ok, false, `byte ${String(index)}`);
        if (!outcome.ok) assert.ok(outcome.error.code === "AA24" || outcome.error.code === "AA23", `byte ${String(index)}: ${outcome.error.code ?? outcome.error.name}`);
      }
    }
  });

  chainTest("refuses wrong lengths and an all-zero signature, reads 64 bytes as EIP-2098, and refuses a signature over another operation (AA24)", async (c) => {
    const seq = await deployAccount0(c);
    const { unsigned, hash } = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq, signWith: "none" });
    const good = await owner0.sign({ hash });
    for (const bad of ["0x", `${good}00`, `0x${"00".repeat(65)}`, `0x${"00".repeat(66)}`] as Hex[]) {
      rejected(await c.simulateHandleOps([withSignature(unsigned, bad)]), "AA23");
    }
    // 64 bytes are read as an EIP-2098 compact signature (r, yParity << 255 | s). The proper compact form of
    // the owner's signature is therefore accepted, and plain truncation (dropping v) is accepted only when
    // the recovery parity happens to be 0 (v = 27); otherwise it recovers another address.
    for (const form of [good, await owner0.signMessage({ message: { raw: hash } })]) {
      const parts = splitSignature(form);
      const compact = `0x${parts.r.toString(16).padStart(64, "0")}${(parts.s | (BigInt(parts.v - 27) << 255n)).toString(16).padStart(64, "0")}` as Hex;
      assert.equal((await c.simulateHandleOps([withSignature(unsigned, compact)])).ok, true, "the compact form of a valid signature is valid");
      const truncated = (await c.simulateHandleOps([withSignature(unsigned, form.slice(0, 2 + 128) as Hex)])).ok;
      assert.equal(truncated, parts.v === 27, "a truncated signature works only for parity 0");
    }
    const other = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 99n)], sequence: seq, signWith: "none" });
    rejected(await c.simulateHandleOps([withSignature(other.unsigned, good)]), "AA24");
  });

  chainTest("a signature made for chain 8453 or for a different EntryPoint does not verify on chain 3223 (AA24)", async (c) => {
    const seq = await deployAccount0(c);
    const { unsigned } = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq, signWith: "none" });
    const otherChain = userOpHash(unsigned, { entryPoint: C.ENTRY_POINT_V07, chainId: C.BASE_CHAIN_ID });
    rejected(await c.simulateHandleOps([withSignature(unsigned, await owner0.sign({ hash: otherChain }))]), "AA24");
    const otherEntryPoint = userOpHash(unsigned, { entryPoint: pad("0xe0", { size: 20 }), chainId: C.XO_CHAIN_ID });
    rejected(await c.simulateHandleOps([withSignature(unsigned, await owner0.sign({ hash: otherEntryPoint }))]), "AA24");
  });

  chainTest("a landed operation cannot be replayed: its nonce is spent (AA25)", async (c) => {
    const seq = await deployAccount0(c);
    const { op } = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq });
    landed(await c.handleOps([op]));
    rejected(await c.handleOps([op]), "AA25");
  });

  chainTest("observation: the malleated high-s twin of a valid signature is ALSO accepted on chain", async (c) => {
    // The deployed validator does not reject high-s. Low-s normalisation is therefore a hygiene rule of
    // the relay (src/xo/signing/signature.ts refuses high-s), not something the contract enforces. The
    // twin cannot be replayed because the nonce binds, but a verifier must not assume otherwise.
    const seq = await deployAccount0(c);
    const { unsigned, hash } = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq, signWith: "none" });
    for (const good of [await owner0.sign({ hash }), await owner0.signMessage({ message: { raw: hash } })]) {
      const twin = malleate(good);
      assert.notEqual(twin, good);
      assert.equal((await c.simulateHandleOps([withSignature(unsigned, twin)])).ok, true);
    }
    const twin = malleate(await owner0.sign({ hash }));
    landed(await c.handleOps([withSignature(unsigned, twin)]));
  });
});

// ---- nonce and execute -------------------------------------------------------------------------------------------------------------

describe("nonces and execute: single, batch, lanes, atomicity", () => {
  chainTest("getNonce(sender, key) returns key<<64 | sequence, and the key is the top 192 bits of the nonce", async (c) => {
    const nonce = kernelNonce({ sequence: 5n, key: 0x32 });
    assert.equal(nonce & 0xffff_ffff_ffff_ffffn, 5n);
    assert.equal(entryPointNonceKey(nonce), nonce >> 64n);
    assert.equal(kernelNonce(), BigInt(C.FIRST_OP_NONCE), "harness and constants agree on the first-op nonce");
    assert.equal(await c.getNonce(account0, entryPointNonceKey(nonce)), entryPointNonceKey(nonce) << 64n);
    assert.equal(await c.getNonce(owner2.address, 0n), 0n, "an unknown sender is at zero");
  });

  chainTest("single mode: the call lands and its effects are exactly the encoded call's", async (c) => {
    const seq = await deployAccount0(c);
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 12_345n)], sequence: seq });
    assert.equal(op.callData.slice(0, 10), C.EXECUTE_SELECTOR);
    assert.equal(op.callData.slice(10, 74), C.EXEC_MODE_SINGLE.slice(2));
    const out = landed(await c.handleOps([op]));
    assert.equal(await c.publicClient.readContract({ address: C.USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, C.CTF_EXCHANGE] }), 12_345n);
    const log = parseEventLogs({ abi: USDCE_STUB_ABI, logs: out.receipt.logs }).find((event) => event.eventName === "Approval");
    assert.deepEqual(log?.args, { owner: account, spender: C.CTF_EXCHANGE, value: 12_345n });
  });

  traceTest("single mode: the account makes exactly one call to a target, as encoded", async (c) => {
    const seq = await deployAccount0(c);
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 12_345n)], sequence: seq });
    const out = landed(await c.handleOps([op]));
    const calls = callsFrom(await c.callTrace(out.txHash), account);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.to, C.USDC_E_ADDRESS);
    const decoded = decodeFunctionData({ abi: USDCE_STUB_ABI, data: calls[0]?.input as Hex });
    assert.equal(decoded.functionName, "approve");
    assert.deepEqual(decoded.args, [C.CTF_EXCHANGE, 12_345n]);
  });

  chainTest("batch mode: Enable Trading sets the allowance and the approval, logs in call order", async (c) => {
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true });
    assert.equal(op.callData.slice(10, 74), C.EXEC_MODE_BATCH.slice(2));
    const out = landed(await c.handleOps([op]));
    assert.equal(await c.publicClient.readContract({ address: C.USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, C.CTF_EXCHANGE] }), MAX_UINT256);
    assert.equal(await c.publicClient.readContract({ address: C.CONDITIONAL_TOKENS, abi: CTF_STUB_ABI, functionName: "isApprovedForAll", args: [account, C.CTF_EXCHANGE] }), true);
    const topics = out.receipt.logs.filter((log) => [C.USDC_E_ADDRESS, C.CONDITIONAL_TOKENS].some((address) => address === getAddress(log.address))).map((log) => log.topics[0]);
    assert.deepEqual(topics, [C.ERC20_APPROVAL_TOPIC, C.APPROVAL_FOR_ALL_TOPIC]);
  });

  traceTest("batch mode: the account calls USDC.e.approve(exchange, max) and then CTF.setApprovalForAll(exchange, true), nothing else", async (c) => {
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true });
    const out = landed(await c.handleOps([op]));
    const calls = callsFrom(await c.callTrace(out.txHash), account);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.to, C.USDC_E_ADDRESS);
    assert.deepEqual(decodeFunctionData({ abi: USDCE_STUB_ABI, data: calls[0]?.input as Hex }).args, [C.CTF_EXCHANGE, MAX_UINT256]);
    assert.equal(calls[1]?.to, C.CONDITIONAL_TOKENS);
    assert.deepEqual(decodeFunctionData({ abi: CTF_STUB_ABI, data: calls[1]?.input as Hex }).args, [C.CTF_EXCHANGE, true]);
  });

  chainTest("a batch is all or nothing: one failing call undoes the others, the nonce is still spent", async (c) => {
    const seq = await deployAccount0(c);
    // the account holds no USDC.e, so the second call (transfer) reverts; the first (approve) must be undone
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 777n), transferCall(owner2.address, 1n)], sequence: seq });
    const before = await c.getNonce(account, entryPointNonceKey(op.nonce));
    const out = landed(await c.handleOps([op]), false);
    assert.equal(out.ops[0]?.success, false, "the operation's execution failed");
    // (the stub reverts with no data, so the EntryPoint has no revert reason to report)
    // approve to the exchange was set by deployAccount0 (max); the rolled-back 777 must not have replaced it
    assert.equal(await c.publicClient.readContract({ address: C.USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account, C.CTF_EXCHANGE] }), MAX_UINT256);
    assert.equal(await c.getNonce(account, entryPointNonceKey(op.nonce)), before + 1n, "a failed execution still consumes the nonce");
  });

  chainTest("the same batch with enough balance succeeds (the failure above was the transfer, nothing else)", async (c) => {
    const seq = await deployAccount0(c);
    await c.sendFrom(owner2.address, C.USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [account0, 5n] }));
    const { op } = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 777n), transferCall(owner2.address, 5n)], sequence: seq });
    landed(await c.handleOps([op]));
    assert.equal(await c.publicClient.readContract({ address: C.USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [account0, C.CTF_EXCHANGE] }), 777n);
    assert.equal(await c.publicClient.readContract({ address: C.USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "balanceOf", args: [owner2.address] }), 5n);
  });

  chainTest("redeem shape: redeemPositions on the CTF stub reverts while unresolved and lands once resolved", async (c) => {
    const seq = await deployAccount0(c);
    const condition = keccak256(toHex("condition-1"));
    const redeem = {
      target: C.CONDITIONAL_TOKENS,
      data: encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "redeemPositions", args: [C.USDC_E_ADDRESS, `0x${"00".repeat(32)}`, condition, [1n, 2n]] }),
    } as const;
    const first = await buildOp({ chain: c, owner: owner0, calls: [redeem], sequence: seq });
    const failed = landed(await c.handleOps([first.op]), false);
    assert.equal(failed.ops[0]?.success, false, "unresolved: the execution reverts");
    await c.sendFrom(owner2.address, C.CONDITIONAL_TOKENS, encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "stubSetPayoutDenominator", args: [condition, 1n] }));
    const second = await buildOp({ chain: c, owner: owner0, calls: [redeem], sequence: seq + 1n });
    const ok = landed(await c.handleOps([second.op]));
    const event = parseEventLogs({ abi: CTF_STUB_ABI, logs: ok.receipt.logs }).find((entry) => entry.eventName === "StubRedeemPositions");
    assert.deepEqual(event?.args, { caller: account0, conditionId: condition });
  });

  chainTest("nonce lanes: key 0x0032 is independent of key 0, each lane has its own sequence, gaps and replays are refused (AA25)", async (c) => {
    const seq = await deployAccount0(c);
    const lane = async (sequence: bigint, key: number) => buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 50n + BigInt(key))], sequence, key });
    // lane 0x32 starts at sequence 0 even though lane 0 is at 1
    rejected(await c.simulateHandleOps([(await lane(1n, 0x32)).op]), "AA25");
    landed(await c.handleOps([(await lane(0n, 0x32)).op]));
    landed(await c.handleOps([(await lane(seq, 0)).op]));
    rejected(await c.handleOps([(await lane(0n, 0x32)).op]), "AA25");
    landed(await c.handleOps([(await lane(1n, 0x32)).op]));
    assert.equal(await c.getNonce(account0, entryPointNonceKey(kernelNonce({ key: 0x32 }))), (entryPointNonceKey(kernelNonce({ key: 0x32 })) << 64n) + 2n);
    assert.equal(await c.getNonce(account0, entryPointNonceKey(kernelNonce())), BigInt(C.FIRST_OP_NONCE) + 2n);
  });

  chainTest("the validator identifier in the nonce is part of the lane: an all-zero identifier is its own lane and the root validator still signs (as the operator account's ops do)", async (c) => {
    await deployAccount0(c);
    const zero = await buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 4n)], sequence: 0n, validatorId: zeroAddress });
    landed(await c.handleOps([zero.op]));
    // sequence 1 on that lane is next; sequence 1 on a fresh lane is not
    rejected(await c.simulateHandleOps([(await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: 5n, validatorId: zeroAddress })).op]), "AA25");
  });

  chainTest("a validation type or mode in the nonce that the account has not set up is refused (AA23), never treated as root", async (c) => {
    const seq = await deployAccount0(c);
    const base = await buildOp({ chain: c, owner: owner0, calls: [approveCall()], sequence: seq, signWith: "none" });
    // The Kernel validates before the EntryPoint checks the lane's sequence, so the sequence is irrelevant here.
    const variants: Array<[string, bigint, string | undefined]> = [
      ["type 0x01 (a validator that is not installed as a regular validator)", base.unsigned.nonce | (1n << 240n), INVALID_VALIDATOR_ERROR],
      ["type 0x02 (permission)", base.unsigned.nonce | (2n << 240n), undefined],
      ["type 0x03", base.unsigned.nonce | (3n << 240n), undefined],
      ["mode 0x01 (enable mode)", base.unsigned.nonce | (1n << 248n), undefined],
    ];
    for (const [label, nonce, innerSelector] of variants) {
      const op = { ...base.unsigned, nonce };
      const hash = userOpHash(op, { entryPoint: C.ENTRY_POINT_V07, chainId: C.XO_CHAIN_ID });
      const failure = rejected(await c.simulateHandleOps([withSignature(op, await owner0.sign({ hash }))]), "AA23");
      if (innerSelector !== undefined) assert.equal(failure.error.inner?.slice(0, 10), innerSelector, label);
    }
  });

  chainTest("two operations from two accounts share one bundle; one bad operation fails the whole bundle and names its index", async (c) => {
    const a = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true });
    const b = await buildOp({ chain: c, owner: owner2, calls: enableTradingCalls(), init: true });
    const out = landed(await c.handleOps([a.op, b.op]));
    assert.deepEqual(out.deployments.map((d) => d.sender).sort(), [a.account, b.account].sort());
    assert.equal(out.ops.length, 2);
    assert.notEqual(a.account, b.account);

    const valid = await buildOp({ chain: c, owner: owner3, calls: enableTradingCalls(), init: true });
    const bad = await buildOp({ chain: c, owner: owner3, signer: owner2, calls: enableTradingCalls(), init: true });
    const good = await buildOp({ chain: c, owner: testAccount(4), calls: enableTradingCalls(), init: true });
    const failure = rejected(await c.handleOps([good.op, bad.op]), "AA24");
    assert.equal(failure.error.opIndex, 1n);
    assert.equal(await codeOf(c, good.account), "0x", "the good operation did not land either");
    assert.equal((await c.simulateHandleOps([valid.op])).ok, true, "the same operation alone is fine");
  });
});

// ---- ERC-1271 with the exact order wire bytes ------------------------------------------------------------------------------------------

function makeOrder(account: Address, salt: bigint, tokenId: bigint, shares: bigint, tick: bigint): XoOrder {
  return {
    salt,
    maker: account,
    signer: account,
    beneficiary: zeroAddress,
    tokenId,
    makerAmount: (shares * tick) / 1000n,
    takerAmount: shares,
    expiration: 1_792_368_300n,
    nonce: 0n,
    identifier: `0x${"00".repeat(16)}`,
    metadata: `0x${"00".repeat(32)}`,
    side: 0,
    signatureType: 3,
  };
}

async function isValidSignature(c: XoChain, account: Address, hash: Hex, signature: Hex): Promise<{ result: Hex } | { revert: Hex }> {
  const data = encodeFunctionData({ abi: KERNEL_VIEW_ABI, functionName: "isValidSignature", args: [hash, signature] });
  try {
    const returned = await c.anvil.rpc<Hex>("eth_call", [{ to: account, data }, "latest"]);
    return { result: decodeFunctionResult({ abi: KERNEL_VIEW_ABI, functionName: "isValidSignature", data: returned }) };
  } catch (error) {
    const reverted = (error as { data?: unknown }).data;
    return { revert: typeof reverted === "string" ? (reverted as Hex) : "0x" };
  }
}

describe("ERC-1271: K.isValidSignature(orderHash, 0x01 + validator + sig65) on the real Kernel", () => {
  const order = (account: Address): XoOrder => makeOrder(account, 424242n, 7n, 10_000_000n, 500n);

  chainTest("returns 0x1626ba7e for the exact 86 wire bytes the relay sends, signed raw or EIP-191 over the Kernel-wrapped digest", async (c) => {
    await deployAccount0(c);
    const orderHash = hashOrder(order(account0));
    const digest = kernelWrapDigest(orderHash, account0);
    for (const sign of ["raw", "eip191"] as const) {
      const signature = sign === "raw" ? await owner0.sign({ hash: digest }) : await owner0.signMessage({ message: { raw: digest } });
      const wire = assembleWireSignature(signature);
      assert.equal((wire.length - 2) / 2, C.WIRE_SIGNATURE_BYTES);
      assert.equal(wire.slice(0, 4), C.WIRE_SIGNATURE_PREFIX);
      assert.equal(wire.slice(4, 44), C.ECDSA_VALIDATOR.slice(2).toLowerCase());
      assert.deepEqual(await isValidSignature(c, account0, orderHash, wire), { result: MAGIC }, sign);
    }
  });

  chainTest("the typedData route yields the same signature as the raw digest route, and the same verdict", async (c) => {
    await deployAccount0(c);
    const orderHash = hashOrder(order(account0));
    const typed = buildKernelTypedData(orderHash, account0);
    const viaTypedData = await owner0.signTypedData({ domain: typed.domain, types: { Kernel: typed.types.Kernel }, primaryType: "Kernel", message: typed.message });
    const viaRaw = await owner0.sign({ hash: kernelWrapDigest(orderHash, account0) });
    assert.equal(viaTypedData, viaRaw);
    assert.deepEqual(await isValidSignature(c, account0, orderHash, assembleWireSignature(viaTypedData)), { result: MAGIC });
  });

  chainTest("the fallback form 0x00 + sig65 (66 bytes, root validator) is also valid on chain", async (c) => {
    await deployAccount0(c);
    const orderHash = hashOrder(order(account0));
    const signature = await owner0.sign({ hash: kernelWrapDigest(orderHash, account0) });
    const wire = assembleWireSignature(signature, { form: "kernel-root-0x00" });
    assert.equal((wire.length - 2) / 2, C.WIRE_SIGNATURE_FALLBACK_BYTES);
    assert.deepEqual(await isValidSignature(c, account0, orderHash, wire), { result: MAGIC });
    // ... but not with the validator address left in (86 bytes behind a 0x00 prefix)
    const clumsy = `0x00${C.ECDSA_VALIDATOR.slice(2).toLowerCase()}${signature.slice(2)}` as Hex;
    const outcome = await isValidSignature(c, account0, orderHash, clumsy);
    assert.ok("revert" in outcome || (outcome as { result: Hex }).result === INVALID);
  });

  chainTest("the Kernel states the domain the wrapper uses: (Kernel, 0.3.1, 3223, the account)", async (c) => {
    await deployAccount0(c);
    const [fields, name, version, chainId, verifyingContract, salt, extensions] = await c.publicClient.readContract({
      address: account0,
      abi: KERNEL_VIEW_ABI,
      functionName: "eip712Domain",
    });
    assert.equal(fields, "0x0f");
    assert.equal(name, C.KERNEL_DOMAIN_NAME);
    assert.equal(version, C.KERNEL_DOMAIN_VERSION);
    assert.equal(chainId, BigInt(C.XO_CHAIN_ID));
    assert.equal(verifyingContract, account0);
    assert.equal(salt, `0x${"00".repeat(32)}`);
    assert.deepEqual(extensions, []);
  });

  chainTest("refuses (0xffffffff) a wrong owner, a flipped byte, a signature over the unwrapped hash, and one wrapped for another account or chain", async (c) => {
    await deployAccount0(c);
    const orderHash = hashOrder(order(account0));
    const digest = kernelWrapDigest(orderHash, account0);
    const good = await owner0.sign({ hash: digest });
    const otherAccount = deriveAccount(owner2.address);
    const otherChainDigest = hashTypedData({ domain: { name: "Kernel", version: "0.3.1", chainId: C.BASE_CHAIN_ID, verifyingContract: account0 }, types: KERNEL_TYPES, primaryType: "Kernel", message: { hash: orderHash } });
    const cases: Array<[string, Hex]> = [
      ["wrong owner", await owner2.sign({ hash: digest })],
      ["wrong owner, EIP-191", await owner2.signMessage({ message: { raw: digest } })],
      ["flipped byte", flipByte(good, 40)],
      ["unwrapped order hash, raw", await owner0.sign({ hash: orderHash })],
      ["unwrapped order hash, EIP-191", await owner0.signMessage({ message: { raw: orderHash } })],
      ["wrapped for another account", await owner0.sign({ hash: kernelWrapDigest(orderHash, otherAccount) })],
      ["wrapped for chain 8453", await owner0.sign({ hash: otherChainDigest })],
      ["signature of another order", await owner0.sign({ hash: kernelWrapDigest(hashOrder(makeOrder(account0, 1n, 7n, 10_000_000n, 500n)), account0) })],
    ];
    for (const [label, signature] of cases) {
      assert.deepEqual(await isValidSignature(c, account0, orderHash, assembleWireSignature(signature)), { result: INVALID }, label);
    }
    // the right signature on a different hash is refused too
    assert.deepEqual(await isValidSignature(c, account0, keccak256("0x1234"), assembleWireSignature(good)), { result: INVALID });
  });

  chainTest("reverts on a recovery byte of 0 or 1, an unknown validator, an unknown prefix and an empty signature", async (c) => {
    await deployAccount0(c);
    const orderHash = hashOrder(order(account0));
    const good = await owner0.sign({ hash: kernelWrapDigest(orderHash, account0) });
    const validator = C.ECDSA_VALIDATOR.slice(2).toLowerCase();
    const wireWith = (prefix: string, v: Hex) => `0x${prefix}${validator}${v.slice(2)}` as Hex;
    const parity = withV(good, good.endsWith("1b") ? 0 : 1);
    const outcomes = {
      parityV: await isValidSignature(c, account0, orderHash, wireWith("01", parity)),
      wrongValidator: await isValidSignature(c, account0, orderHash, `0x01${"11".repeat(20)}${good.slice(2)}` as Hex),
      prefix02: await isValidSignature(c, account0, orderHash, wireWith("02", good)),
      empty: await isValidSignature(c, account0, orderHash, "0x"),
    };
    assert.ok("revert" in outcomes.parityV && outcomes.parityV.revert.startsWith(INVALID_SIGNATURE_ERROR), "v of 0 or 1 is InvalidSignature");
    assert.ok("revert" in outcomes.wrongValidator && outcomes.wrongValidator.revert.startsWith(INVALID_VALIDATOR_ERROR), "an unknown validator is InvalidValidator");
    assert.ok("revert" in outcomes.prefix02, "prefix 0x02 reverts");
    assert.ok("revert" in outcomes.empty, "an empty signature reverts");
    // the production assembler never sends these: it turns a parity v into 27 or 28 and pins the validator,
    // and the repaired wire validates
    assert.deepEqual(await isValidSignature(c, account0, orderHash, assembleWireSignature(parity)), { result: MAGIC });
  });

  chainTest("an undeployed account cannot trade: the exchange check needs code at the maker (AD6), and a deployed one then passes", async (c) => {
    const orderHash = hashOrder(order(account0));
    const wire = assembleWireSignature(await owner0.sign({ hash: kernelWrapDigest(orderHash, account0) }));
    const check = () => c.publicClient.readContract({ address: C.CTF_EXCHANGE, abi: EXCHANGE_STUB_ABI, functionName: "isValid1271", args: [account0, orderHash, wire] });
    assert.equal(await check(), false, "no code at the maker");
    // an empty address answers a call with no data at all, which is not the magic value either
    const data = encodeFunctionData({ abi: KERNEL_VIEW_ABI, functionName: "isValidSignature", args: [orderHash, wire] });
    assert.equal(await c.anvil.rpc<Hex>("eth_call", [{ to: account0, data }, "latest"]), "0x");
    await deployAccount0(c);
    assert.equal(await check(), true);
    // another owner's signature through the same exchange path
    const foreign = assembleWireSignature(await owner2.sign({ hash: kernelWrapDigest(orderHash, account0) }));
    assert.equal(await c.publicClient.readContract({ address: C.CTF_EXCHANGE, abi: EXCHANGE_STUB_ABI, functionName: "isValid1271", args: [account0, orderHash, foreign] }), false);
  });

  chainTest("seeded property: 24 random orders from 3 owners validate, raw and EIP-191, and fail for any other account", async (c) => {
    const owners = [owner0, owner2, owner3];
    for (const owner of owners) {
      const { op } = await buildOp({ chain: c, owner, calls: enableTradingCalls(), init: true });
      landed(await c.handleOps([op]));
    }
    const random = seeded("erc1271-v1");
    for (let index = 0; index < 24; index += 1) {
      const owner = owners[index % owners.length] as (typeof owners)[number];
      const account = deriveAccount(owner.address);
      const shares = BigInt(1 + random.below(5000)) * 1000n;
      const tick = BigInt(1 + random.below(999));
      const hash = hashOrder(makeOrder(account, random.word() % 2n ** 64n, random.word() % 2n ** 128n, shares, tick));
      const digest = kernelWrapDigest(hash, account);
      const raw = assembleWireSignature(await owner.sign({ hash: digest }));
      const eip191 = assembleWireSignature(await owner.signMessage({ message: { raw: digest } }));
      assert.deepEqual(await isValidSignature(c, account, hash, raw), { result: MAGIC }, `order ${String(index)} raw`);
      assert.deepEqual(await isValidSignature(c, account, hash, eip191), { result: MAGIC }, `order ${String(index)} eip191`);
      const next = deriveAccount((owners[(index + 1) % owners.length] as (typeof owners)[number]).address);
      assert.deepEqual(await isValidSignature(c, next, hash, raw), { result: INVALID }, `order ${String(index)} on another account`);
    }
  });
});

// ---- the real PolicyPaymaster -------------------------------------------------------------------------------------------------------------

describe("PolicyPaymaster: the real code with the 2026-10-18 allowlist replayed from the notes", () => {
  const check = (c: XoChain, target: Address, selector: Hex, account: Address = C.PAYMASTER_PROBE_ACCOUNT) =>
    c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [account, target, selector] }) as Promise<readonly [boolean, string]>;

  chainTest("starts not paused, with the observed owner and daily limit, a deposit in the EntryPoint, and a never-seen sender with 10,000 left", async (c) => {
    const read = (functionName: "owner" | "paused" | "dailyTxLimit" | "getDeposit") => c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName });
    assert.equal(await read("owner"), C.PAYMASTER_OWNER_OBSERVED);
    assert.equal(await read("paused"), false);
    assert.equal(await read("dailyTxLimit"), C.PAYMASTER_DAILY_TX_LIMIT_OBSERVED);
    assert.equal(await read("getDeposit"), 100n * 10n ** 18n);
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "getRemainingDailyTxs", args: [C.PAYMASTER_PROBE_ACCOUNT] }), 10_000n);
  });

  chainTest("answers checkPolicy exactly as the 14 probes of 2026-10-18 did, with the contract's own reasons", async (c) => {
    assert.equal(C.PAYMASTER_POLICY_PROBES.length, 14);
    for (const probe of C.PAYMASTER_POLICY_PROBES) {
      const [allowed, reason] = await check(c, probe.target, probe.selector);
      assert.equal(allowed, probe.allowed, probe.label);
      if (!probe.allowed) assert.equal(reason, "Contract/selector not allowed", probe.label);
      else assert.ok(["Globally allowed selector", "Allowed selector on contract"].includes(reason), `${probe.label}: ${reason}`);
    }
  });

  chainTest("the scope of each entry is what the notes say: approve is global, the rest are per target", async (c) => {
    const anywhere = pad("0xabc123", { size: 20 });
    // approve is sponsored on any target (global)
    assert.deepEqual(await check(c, anywhere, C.APPROVE_SELECTOR), [true, "Globally allowed selector"]);
    // setApprovalForAll only for the Conditional Tokens contract
    assert.equal((await check(c, C.CONDITIONAL_TOKENS, "0xa22cb465"))[0], true);
    assert.equal((await check(c, anywhere, "0xa22cb465"))[0], false);
    assert.equal((await check(c, C.USDC_E_ADDRESS, "0xa22cb465"))[0], false);
    // USDC.e transfer yes, on an unlisted target no, transferFrom no
    assert.equal((await check(c, C.USDC_E_ADDRESS, "0xa9059cbb"))[0], true);
    assert.equal((await check(c, anywhere, "0xa9059cbb"))[0], false);
    assert.equal((await check(c, C.USDC_E_ADDRESS, "0x23b872dd"))[0], false);
    // safeTransferFrom yes, safeBatchTransferFrom no
    assert.equal((await check(c, C.CONDITIONAL_TOKENS, "0xf242432a"))[0], true);
    assert.equal((await check(c, C.CONDITIONAL_TOKENS, "0x2eb2c2d6"))[0], false);
    // the manager: create / respond / cancel yes (and createConvictionMarketFor passes the paymaster), updateMetadata no
    for (const entry of PAYMASTER_REPLAY.filter((candidate) => candidate.target === C.MARKET_MANAGER)) assert.equal((await check(c, C.MARKET_MANAGER, entry.selector))[0], true, entry.label);
    assert.equal((await check(c, C.MARKET_MANAGER, C.UPDATE_METADATA_SELECTOR_NEVER_CALL))[0], false);
    // outbound transferRemote and the exchange's incrementNonce are not sponsored
    assert.equal((await check(c, C.XO_WARP_ROUTE, C.TRANSFER_REMOTE_SELECTOR))[0], false);
    assert.equal((await check(c, C.CTF_EXCHANGE, "0x627cdcb9"))[0], false);
  });

  chainTest("sponsors the deploying Enable Trading operation with the observed gas limits, at zero fee, and counts it", async (c) => {
    const { op, account } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true });
    assert.equal(op.paymasterAndData.length, 2 + 2 * C.PAYMASTER_AND_DATA_BYTES);
    const out = landed(await c.handleOps([op]));
    assert.equal(out.ops[0]?.paymaster, C.POLICY_PAYMASTER);
    assert.equal(out.deployments[0]?.paymaster, C.POLICY_PAYMASTER);
    assert.equal(out.ops[0]?.actualGasCost, 0n);
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName: "getDailyUsage", args: [account] }), 1n);
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "getRemainingDailyTxs", args: [account] }), 9_999n);
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName: "getDeposit" }), 100n * 10n ** 18n, "zero fee spends no deposit");
  });

  chainTest("gas: the paymaster's postOp limit is 26,478 on the first sponsored operation of a UTC day and 5,958 is enough afterwards (note 21 sec 4.2, now seen on real code)", async (c) => {
    const first = (postOp: bigint) => buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true, paymasterPostOpGasLimit: postOp });
    // too little for the first write of the day: the operation is included but its execution is reverted
    for (const tooLow of [20_000n, 10_000n, 5_958n]) {
      const snapshot = await c.snapshot();
      const { op } = await first(tooLow);
      const out = landed(await c.handleOps([op]), false);
      assert.equal(out.ops[0]?.success, false, `postOp ${String(tooLow)} on the first op of the day`);
      await c.revert(snapshot);
    }
    landed(await c.handleOps([(await first(26_478n)).op]));
    // later the same day the counter is already non-zero: 5,958 is enough, 3,000 is not
    const next = (postOp: bigint, sequence: bigint) => buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 3n)], sequence, sponsored: true, paymasterPostOpGasLimit: postOp });
    const snapshot = await c.snapshot();
    assert.equal(landed(await c.handleOps([(await next(3_000n, 1n)).op]), false).ops[0]?.success, false);
    await c.revert(snapshot);
    landed(await c.handleOps([(await next(5_958n, 1n)).op]));
  });

  chainTest("gas: the paymaster verification limit 40,262 is enough and 20,000 is not (AA33)", async (c) => {
    const attempt = async (limit: bigint) => {
      const { op } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true, paymasterVerificationGasLimit: limit });
      return c.simulateHandleOps([op]);
    };
    assert.equal((await attempt(C.GAS_DEFAULTS.deployAndEnableTrading.paymasterVerificationGasLimit)).ok, true);
    rejected(await attempt(20_000n), "AA33");
  });

  chainTest("refuses a call it does not sponsor, alone or inside a batch with allowed calls (AA34), while the EntryPoint itself would accept the same operation unsponsored", async (c) => {
    const seq = await (async () => {
      const { op } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true });
      landed(await c.handleOps([op]));
      return 1n;
    })();
    const sponsored = (calls: ReturnType<typeof enableTradingCalls>, sequence = seq) => buildOp({ chain: c, owner: owner0, calls, sequence, sponsored: true, gas: C.GAS_DEFAULTS.enableTrading });
    rejected(await c.handleOps([(await sponsored([transferRemoteCall()])).op]), "AA34");
    rejected(await c.handleOps([(await sponsored([approveCall(), transferRemoteCall()])).op]), "AA34");
    rejected(await c.handleOps([(await sponsored([transferRemoteCall(), approveCall()])).op]), "AA34");
    // UO8 at contract level: the same call without a paymaster is not refused by the EntryPoint
    const unsponsored = await buildOp({ chain: c, owner: owner0, calls: [transferRemoteCall()], sequence: seq, gas: C.GAS_DEFAULTS.enableTrading });
    assert.equal((await c.simulateHandleOps([unsponsored.op])).ok, true);
    // an allowed call still passes
    landed(await c.handleOps([(await sponsored([approveCall(C.CTF_EXCHANGE, 5n), setApprovalForAllCall()])).op]));
  });

  chainTest("refuses call data it cannot classify: a delegatecall mode, an unknown mode, a batch that is not a batch, an empty batch, and call data shorter than a selector (AA34)", async (c) => {
    const { op: deployOp } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true });
    landed(await c.handleOps([deployOp]));
    const withData = async (callData: Hex) => (await buildOp({ chain: c, owner: owner0, calls: [], callData, sequence: 1n, sponsored: true, gas: C.GAS_DEFAULTS.enableTrading })).op;
    const cases: Array<[string, Hex]> = [
      ["delegatecall mode 0xff", encodeExecuteRaw(`0xff${"00".repeat(31)}`, "0x")],
      ["unknown mode 0x02", encodeExecuteRaw(`0x02${"00".repeat(31)}`, "0x")],
      ["batch mode over a single-call body", encodeExecute([approveCall()], `0x01${"00".repeat(31)}`)],
      ["empty batch", encodeExecuteRaw(`0x01${"00".repeat(31)}`, `0x${"20".padStart(64, "0")}${"0".repeat(64)}`)],
      ["too short", "0xe9ae5c"],
      ["an unknown account selector", "0xdeadbeef"],
    ];
    for (const [label, callData] of cases) {
      const outcome = await c.simulateHandleOps([await withData(callData)]);
      assert.equal(outcome.ok, false, label);
      if (!outcome.ok) assert.equal(outcome.error.code, "AA34", label);
    }
  });

  chainTest("pausing it refuses everything it would sponsor (AA34), and unpausing restores it", async (c) => {
    await asPaymasterOwner(c, async (send) => {
      await send("pause", []);
    });
    const { op } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true });
    rejected(await c.handleOps([op]), "AA34");
    const [allowedWhilePaused] = await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [C.PAYMASTER_PROBE_ACCOUNT, C.USDC_E_ADDRESS, C.APPROVE_SELECTOR] });
    assert.equal(allowedWhilePaused, true, "checkPolicy ignores the pause flag, so a tripwire must read paused() separately");
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName: "paused" }), true);
    await asPaymasterOwner(c, async (send) => {
      await send("unpause", []);
    });
    landed(await c.handleOps([op]));
  });

  chainTest("the daily limit is per sender and per UTC day: at the limit the operation is refused, the next day it is sponsored again", async (c) => {
    const { op: deployOp } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true });
    landed(await c.handleOps([deployOp]));
    await asPaymasterOwner(c, async (send) => {
      await send("setDailyTxLimit", [1n]);
    });
    const next = (sequence: bigint) => buildOp({ chain: c, owner: owner0, calls: [approveCall(C.CTF_EXCHANGE, 9n)], sequence, sponsored: true, gas: C.GAS_DEFAULTS.enableTrading });
    rejected(await c.handleOps([(await next(1n)).op]), "AA34");
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "getRemainingDailyTxs", args: [account0] }), 0n);
    // another sender has its own counter
    const other = await buildOp({ chain: c, owner: owner2, calls: enableTradingCalls(), init: true, sponsored: true });
    landed(await c.handleOps([other.op]));
    // the next UTC day resets it
    await c.increaseTime(86_400);
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "getRemainingDailyTxs", args: [account0] }), 1n);
    landed(await c.handleOps([(await next(1n)).op]));
  });

  chainTest("an address on the unlimited list bypasses the allowlist and the limit (the contract's documented bypass), which is why a tripwire watches the owner's edits", async (c) => {
    const { op: deployOp } = await buildOp({ chain: c, owner: owner0, calls: enableTradingCalls(), init: true, sponsored: true });
    landed(await c.handleOps([deployOp]));
    const refused = await buildOp({ chain: c, owner: owner0, calls: [transferRemoteCall()], sequence: 1n, sponsored: true, gas: C.GAS_DEFAULTS.enableTrading });
    rejected(await c.simulateHandleOps([refused.op]), "AA34");
    await asPaymasterOwner(c, async (send) => {
      await send("setUnlimitedAddress", [account0, true]);
    });
    assert.equal((await c.simulateHandleOps([refused.op])).ok, true);
    assert.equal(await c.publicClient.readContract({ address: C.POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "getRemainingDailyTxs", args: [account0] }), MAX_UINT256);
  });
});

// ---- the derived Base variant -----------------------------------------------------------------------------------------------------------------------

describe("Base variant (chain 8453): DERIVED bytecode, unverified against the real Base contracts", () => {
  let base: XoChain | null = null;
  let baseSkip: string | null = null;
  let baseSnapshot = "";

  before(async () => {
    const started = await startXoChain({ kind: "base" });
    if (started.ok) base = started.chain;
    else baseSkip = started.reason;
  });

  after(async () => {
    await base?.stop();
  });

  beforeEach(async () => {
    if (base === null) return;
    if (baseSnapshot !== "") await base.revert(baseSnapshot);
    baseSnapshot = await base.snapshot();
  });

  function baseTest(name: string, body: (c: XoChain) => Promise<void>): void {
    it(name, async (t: TestContext) => {
      if (baseSkip !== null) return t.skip(baseSkip);
      if (base === null) throw new Error("the Base chain is not running");
      await body(base);
    });
  }

  // A call to an address with no code: nothing happens, so the operation does not need any stub (there are none on Base).
  const NOOP_CALL = { target: owner3.address, data: "0x" as Hex };

  baseTest("carries the account stack only: the patched Kernel implementation and no paymaster or stubs", async (c) => {
    assert.equal(BigInt(await c.rpc<Hex>("eth_chainId")), 8453n);
    const all = loadAllBytecode();
    for (const name of ["entrypoint-v07", "sender-creator", "kernel-factory", "ecdsa-validator"] as const) assert.equal(await codeOf(c, all[name].address), all[name].code, name);
    assert.equal(await codeOf(c, C.KERNEL_IMPLEMENTATION), patchKernelImplementation(loadBytecode("kernel-implementation").code, C.XO_CHAIN_ID, C.BASE_CHAIN_ID).code);
    assert.notEqual(await codeOf(c, C.KERNEL_IMPLEMENTATION), loadBytecode("kernel-implementation").code);
    for (const address of [C.POLICY_PAYMASTER, C.USDC_E_ADDRESS, C.CONDITIONAL_TOKENS, C.CTF_EXCHANGE]) assert.equal(await codeOf(c, address), "0x");
  });

  baseTest("derives the same account for Anvil account 0, as the notes say the real Base factory does, and deploys it", async (c) => {
    assert.equal(
      await c.publicClient.readContract({ address: C.KERNEL_FACTORY, abi: KERNEL_FACTORY_ABI, functionName: "getAddress", args: [buildInitData(owner0.address), C.ACCOUNT_SALT] }),
      C.ANVIL_ACCOUNT_0_ACCOUNT,
    );
    const { op, hash } = await buildOp({ chain: c, owner: owner0, calls: [NOOP_CALL], init: true });
    assert.equal(hash, userOpHash(op, { entryPoint: C.ENTRY_POINT_V07, chainId: C.BASE_CHAIN_ID }), "the hash binds chain 8453 on this chain");
    assert.notEqual(hash, userOpHash(op, { entryPoint: C.ENTRY_POINT_V07, chainId: C.XO_CHAIN_ID }));
    assert.equal(hash, await c.entryPointGetUserOpHash(op), "and so does the EntryPoint on this chain");
    landed(await c.handleOps([op]));
    assert.equal(await codeOf(c, C.ANVIL_ACCOUNT_0_ACCOUNT), C.KERNEL_PROXY_RUNTIME_CODE);
  });

  baseTest("signs and verifies under the Base domain (chain 8453), and not under the XO domain", async (c) => {
    const { op } = await buildOp({ chain: c, owner: owner0, calls: [NOOP_CALL], init: true });
    landed(await c.handleOps([op]));
    const [, name, version, chainId, verifyingContract] = await c.publicClient.readContract({ address: account0, abi: KERNEL_VIEW_ABI, functionName: "eip712Domain" });
    assert.deepEqual([name, version, chainId, verifyingContract], ["Kernel", "0.3.1", 8453n, account0]);
    const hash = keccak256("0xba5e");
    const wrapFor = (chainId: number) => hashTypedData({ domain: { name: "Kernel", version: "0.3.1", chainId, verifyingContract: account0 }, types: KERNEL_TYPES, primaryType: "Kernel", message: { hash } });
    assert.deepEqual(await isValidSignature(c, account0, hash, assembleWireSignature(await owner0.sign({ hash: wrapFor(C.BASE_CHAIN_ID) }))), { result: MAGIC });
    assert.deepEqual(await isValidSignature(c, account0, hash, assembleWireSignature(await owner0.sign({ hash: wrapFor(C.XO_CHAIN_ID) }))), { result: INVALID });
  });
});
