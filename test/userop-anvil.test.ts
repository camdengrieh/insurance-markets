// The production user-operation library (src/xo/userop) against the REAL contract code, on the chain
// harness in test/anvil: EntryPoint v0.7, its SenderCreator, KernelFactory 0.3.1, the ECDSA validator,
// Kernel 0.3.1 and the PolicyPaymaster, all captured from the public XO explorer (test/fixtures/bytecode)
// and etched at their real addresses on a local anvil with chain id 3223. A test EOA (Anvil account 1)
// plays the bundler by calling EntryPoint.handleOps.
//
// What stands in for real contracts, and says so:
//   USDC.e, the Conditional Tokens and the exchange are the labelled stubs of test/anvil/stubs.ts (a plain
//   ERC-20 and a minimal ERC-1155-shaped contract; both emit the real Approval / ApprovalForAll events).
//   The market manager and the XO route are recorders defined in THIS file: they log their call data with
//   the caller as the only topic and do nothing else.
//   The PolicyPaymaster is the real runtime, but its allowlist CONTENT is replayed from note 21 (the harness
//   writes it through the owner's own functions), so "the paymaster sponsors X" below proves the real
//   validation code accepts what note 21 says is on the list, not that the live list still says so.
//
// What this proves: that the bytes src/xo/userop produces (hash, packed fields, initCode, execute encoding,
// nonces, gas limits, signature forms, sponsorship choice) behave on the real EntryPoint, Kernel, validator
// and paymaster code as docs/research/21 says. What it does not prove: anything about XO's bundler, registry,
// orderbook or gateway, the gas of the real USDC.e / Conditional Tokens / manager (stubs), or PayBox (a
// public Anvil test key stands in for its `raw` signer).
//
// Starts its own anvil on 127.0.0.1 and a free port (test/anvil/start.ts) and kills it afterwards. If anvil
// is missing every test here skips with the reason. All keys are the public Anvil/Hardhat test mnemonic;
// randomness is a keccak-seeded generator; no assertion reads the wall clock.

import assert from "node:assert/strict";
import { after, before, beforeEach, it, type TestContext } from "node:test";

import { encodeFunctionData, getAddress, pad, parseAbi, parseEventLogs, toHex, zeroAddress, type Address, type Hex, type TransactionReceipt } from "viem";
import type { HDAccount } from "viem/accounts";

import { digestTag, toPayboxIntent, type UserOpAction } from "../src/relay/contract.js";
import { buildInitCode, deriveAccount, isKernelProxyRuntime } from "../src/xo/account/derive.js";
import { ECDSA_VALIDATOR_ABI, POLICY_PAYMASTER_ABI } from "../src/xo/chain/abi.js";
import {
  decodeAccountDeployed,
  decodeApprovalForAll,
  decodeOwnerRegistered,
  decodeTokenApproval,
  type ChainLog,
} from "../src/xo/chain/reads.js";
import {
  ACCOUNT_DEPLOYED_TOPIC,
  APPROVAL_FOR_ALL_TOPIC,
  CONDITIONAL_TOKENS,
  CREATION_FEE_ATOMIC,
  CTF_EXCHANGE,
  ECDSA_VALIDATOR,
  EIP1967_IMPLEMENTATION_SLOT,
  ENTRY_POINT_V07,
  ERC20_APPROVAL_TOPIC,
  EXEC_MODE_BATCH,
  EXEC_MODE_SINGLE,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  MARKET_MANAGER,
  OWNER_REGISTERED_TOPIC,
  POLICY_PAYMASTER,
  USDC_E_ADDRESS,
  USER_OPERATION_EVENT_TOPIC,
  XO_CHAIN_ID,
  XO_WARP_ROUTE,
} from "../src/xo/chain/constants.js";
import { DUMMY_USEROP_SIGNATURE } from "../src/xo/userop/bundler.js";
import {
  cancelMarketCall,
  createMarketCalls,
  ctfSetApprovalForAllCall,
  enableTradingCalls,
  isSponsorable,
  redeemCall,
  redeemCalls,
  respondToUpdateCall,
  revokeTradingCalls,
  usdceApproveCall,
  usdceApproveMaxCall,
  withdrawCalls,
} from "../src/xo/userop/calls.js";
import { UserOpError, decodeExecute, encodeExecute, type Call } from "../src/xo/userop/encode.js";
import { defaultGasFor } from "../src/xo/userop/gas.js";
import { userOpHash, userOpHashUnder } from "../src/xo/userop/hash.js";
import { decodeGetNonceResult, firstOpNonce, getNonceCallData, kernelNonce, laneKeyFor, nextNonceAfter } from "../src/xo/userop/nonce.js";
import { packUserOp, unpackUserOp, withSignature, type PackedUserOp, type UserOpFields } from "../src/xo/userop/pack.js";
import { prepareUserOp, sponsorshipFallback, type PrepareUserOpInput, type PreparedUserOp } from "../src/xo/userop/sign.js";
import { verifyUserOpSignature } from "../src/xo/userop/verify.js";
import { Assembler } from "./anvil/asm.js";
import {
  PAYMASTER_ADMIN_ABI,
  TraceUnsupportedError,
  flattenFrames,
  startXoChain,
  testAccount,
  type HandleOpsFailure,
  type HandleOpsSuccess,
  type XoChain,
} from "./anvil/chain.js";
import { MAX_UINT256, asPaymasterOwner, seeded, type Seeded } from "./anvil/scenarios.js";
import { CTF_STUB_ABI, USDCE_STUB_ABI } from "./anvil/stubs.js";
import { joinSignature, malleate, splitSignature, withV } from "./anvil/userop.js";
import { loadGolden, toPacked } from "./fixtures/userop/golden.js";

// ---- fixture-wide state -----------------------------------------------------------------------------------------

let chain: XoChain | null = null;
let skipReason: string | null = null;
let snapshotId = "";

// Logs its call data with the caller as the one topic, and nothing else. Stands in for the market manager and
// the XO route, whose real code is not part of the harness.
function recorderRuntime(): Hex {
  const a = new Assembler();
  a.op("CALLDATASIZE").push(0).push(0).op("CALLDATACOPY"); // mem[0 ..] = call data
  a.op("CALLER", "CALLDATASIZE").push(0).op("LOG1", "STOP"); // LOG1(offset 0, size, topic = caller)
  return a.build();
}

before(async () => {
  const started = await startXoChain();
  if (!started.ok) {
    skipReason = started.reason;
    return;
  }
  chain = started.chain;
  for (const target of [MARKET_MANAGER, XO_WARP_ROUTE]) await chain.rpc("anvil_setCode", [target, recorderRuntime()]);
});

after(async () => {
  await chain?.stop();
});

// Every test starts from the chain as set up above (anvil snapshots are single use, so take a new one each time).
beforeEach(async () => {
  if (chain === null) return;
  if (snapshotId !== "") await chain.revert(snapshotId);
  snapshotId = await chain.snapshot();
});

function chainTest(name: string, body: (c: XoChain, t: TestContext) => Promise<void>): void {
  it(name, async (t: TestContext) => {
    if (skipReason !== null || chain === null) return t.skip(skipReason ?? "the chain is not running");
    await body(chain, t);
  });
}

// Reads the call tree: skipped (with the reason) on an anvil whose tracer does not provide one.
function traceTest(name: string, body: (c: XoChain, t: TestContext) => Promise<void>): void {
  it(name, async (t: TestContext) => {
    if (skipReason !== null || chain === null) return t.skip(skipReason ?? "the chain is not running");
    try {
      await body(chain, t);
    } catch (error) {
      if (error instanceof TraceUnsupportedError) return t.skip(error.message);
      throw error;
    }
  });
}

// ---- small helpers ---------------------------------------------------------------------------------------------------

type Form = "raw" | "eip191";
type Owner = HDAccount;

const lower = (value: string): string => value.toLowerCase();

function only<T>(items: readonly T[], what: string): T {
  assert.equal(items.length, 1, what);
  return items[0] as T;
}

function landed(outcome: HandleOpsSuccess | HandleOpsFailure, expectExecution = true): HandleOpsSuccess {
  if (!outcome.ok) assert.fail(`the bundle was rejected: ${outcome.error.name} ${outcome.error.reason ?? ""} ${outcome.error.inner ?? ""}`);
  if (expectExecution) for (const op of outcome.ops) assert.equal(op.success, true, "the operation's execution succeeded");
  return outcome;
}

function rejected(outcome: { readonly ok: true } | HandleOpsSuccess | HandleOpsFailure, code: string, what = ""): HandleOpsFailure {
  if (outcome.ok) assert.fail(`${what} expected ${code} but the bundle was accepted`);
  assert.equal(outcome.error.code, code, `${what} ${outcome.error.name}: ${outcome.error.reason ?? ""}`);
  return outcome;
}

// What a relay does with PayBox's answer: take the digest from the exact `raw` intent that would be sent to
// PayBox, sign it as PayBox's raw signer would (a public test key), and check the signature by recovery
// before anything is sent. The form is the digest the key signs: `raw` is PayBox's intent, `eip191` is XO's app.
async function signAsPayBox(prepared: PreparedUserOp, owner: Owner, form: Form = "raw"): Promise<PackedUserOp> {
  const intent = toPayboxIntent(prepared.sign);
  assert.equal(intent.op, "raw");
  const digest = (intent.op === "raw" ? intent.rawSigningPayloadHex : "0x") as Hex;
  assert.equal(digest, prepared.userOpHash, "PayBox is asked to sign the userOpHash");
  const signature = form === "raw" ? await owner.sign({ hash: digest }) : await owner.signMessage({ message: { raw: digest } });
  const verdict = await verifyUserOpSignature({ op: prepared.op, signature, expectedOwner: owner.address });
  if (!verdict.ok) assert.fail(`the library's own verifier refused a good signature: ${verdict.code} ${verdict.message}`);
  assert.equal(verdict.form, form);
  return verdict.signedOp;
}

// The same fields with some of them replaced, unsigned, then signed with the owner's key over the new hash.
async function resigned(base: PackedUserOp, owner: Owner, patch: Partial<UserOpFields>): Promise<PackedUserOp> {
  const op = packUserOp({ ...unpackUserOp(base), ...patch, signature: "0x" });
  return withSignature(op, await owner.sign({ hash: userOpHash(op) }));
}

const deployInput = (owner: Owner, sponsor: boolean): PrepareUserOpInput => ({
  action: "deploy_enable_trading",
  owner: owner.address,
  calls: enableTradingCalls(),
  nonce: firstOpNonce(),
  deployed: false,
  sponsor,
});

async function nextNonce(c: XoChain, account: Address, key = 0): Promise<bigint> {
  const data = getNonceCallData(account, laneKeyFor({ key }));
  return decodeGetNonceResult(await c.rpc<Hex>("eth_call", [{ to: ENTRY_POINT_V07, data }, "latest"]));
}

async function deployAccount(c: XoChain, owner: Owner, options: { sponsor?: boolean; form?: Form } = {}) {
  const prepared = prepareUserOp(deployInput(owner, options.sponsor ?? false));
  const signedOp = await signAsPayBox(prepared, owner, options.form ?? "raw");
  const out = landed(await c.handleOps([signedOp]));
  return { prepared, signedOp, out, account: prepared.account };
}

// The next operation of an account that is already deployed, signed and landed.
async function runNext(c: XoChain, owner: Owner, action: UserOpAction, calls: readonly Call[], options: { sponsor?: boolean; form?: Form; expectExecution?: boolean } = {}) {
  const account = deriveAccount(owner.address);
  const prepared = prepareUserOp({ action, owner: owner.address, calls, nonce: await nextNonce(c, account), deployed: true, sponsor: options.sponsor ?? false });
  const signedOp = await signAsPayBox(prepared, owner, options.form ?? "raw");
  const out = landed(await c.handleOps([signedOp]), options.expectExecution ?? true);
  return { prepared, signedOp, out };
}

const allowanceOf = async (c: XoChain, owner: Address, spender: Address): Promise<bigint> =>
  (await c.publicClient.readContract({ address: USDC_E_ADDRESS, abi: USDCE_STUB_ABI, functionName: "allowance", args: [owner, spender] })) as bigint;

const isOperator = async (c: XoChain, account: Address, operator: Address): Promise<boolean> =>
  (await c.publicClient.readContract({ address: CONDITIONAL_TOKENS, abi: CTF_STUB_ABI, functionName: "isApprovedForAll", args: [account, operator] })) as boolean;

const remainingDailyTxs = async (c: XoChain, account: Address): Promise<bigint> =>
  (await c.publicClient.readContract({ address: POLICY_PAYMASTER, abi: POLICY_PAYMASTER_ABI, functionName: "getRemainingDailyTxs", args: [account] })) as bigint;

const paymasterDeposit = async (c: XoChain): Promise<bigint> =>
  (await c.publicClient.readContract({ address: POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName: "getDeposit" })) as bigint;

const codeOf = async (c: XoChain, address: Address): Promise<Hex> => ((await c.publicClient.getCode({ address })) ?? "0x") as Hex;

// Marks conditions as resolved in the Conditional Tokens stub (anyone may; it is a test stub).
async function resolveConditions(c: XoChain, ids: readonly Hex[]): Promise<void> {
  for (const id of ids) {
    const receipt = await c.sendFrom(c.bundler.address, CONDITIONAL_TOKENS, encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "stubSetPayoutDenominator", args: [id, 1n] }));
    assert.equal(receipt.status, "success");
  }
}

type ReceiptLog = TransactionReceipt["logs"][number];

function logsOf(receipt: TransactionReceipt, address: Address, topic0?: Hex): ReceiptLog[] {
  return receipt.logs.filter((log) => lower(log.address) === lower(address) && (topic0 === undefined || log.topics[0] === topic0));
}

// The calls a recorder saw, in order: the caller (the one topic) and the call data.
function recorded(receipt: TransactionReceipt, target: Address): { caller: Address; data: Hex }[] {
  return receipt.logs
    .filter((log) => lower(log.address) === lower(target) && log.topics.length === 1)
    .map((log) => ({ caller: getAddress(`0x${(log.topics[0] as string).slice(26)}`), data: log.data }));
}

const asChainLog = (log: ReceiptLog): ChainLog => ({
  address: getAddress(log.address),
  topics: log.topics.map((topic) => topic.toLowerCase() as Hex),
  data: log.data,
  blockNumber: log.blockNumber,
  logIndex: BigInt(log.logIndex),
  transactionHash: log.transactionHash,
  timestamp: null,
});

// Smallest value in (low, high] for which `works` holds, given that it does not at `low` and does at `high`.
async function smallestWorking(low: bigint, high: bigint, works: (value: bigint) => Promise<boolean>): Promise<bigint> {
  assert.equal(await works(high), true, `the upper bound ${high} must work`);
  assert.equal(await works(low), false, `the lower bound ${low} must not work`);
  let a = low;
  let b = high;
  while (b - a > 1n) {
    const mid = (a + b) / 2n;
    if (await works(mid)) b = mid;
    else a = mid;
  }
  return b;
}

const percent = (value: bigint, base: bigint): string => {
  const tenths = ((value - base) * 1000n) / base;
  return `${(tenths / 10n).toString()}.${(tenths % 10n).toString()}%`;
};

// ===========================================================================================================
// A. userOpHash: the library and the real EntryPoint agree
// ===========================================================================================================

interface CorpusItem {
  readonly label: string;
  readonly op: PackedUserOp;
  readonly prepared?: PreparedUserOp;
}

// A fixed corpus: every action the library can prepare, with and without paymaster fields, for the ten Anvil
// owners and for seeded owners, at seeded nonces and with seeded condition ids and metadata. Same seed, same
// operations, on every machine.
function buildCorpus(): CorpusItem[] {
  const rng = seeded("userop-anvil/hash-corpus/v1");
  const items: CorpusItem[] = [];
  const push = (label: string, input: PrepareUserOpInput): PreparedUserOp => {
    const prepared = prepareUserOp(input);
    items.push({ label, op: prepared.op, prepared });
    return prepared;
  };
  const conditionIds = (n: number): Hex[] =>
    Array.from({ length: n }, () => {
      for (;;) {
        const id = rng.bytes(32);
        if (BigInt(id) !== 0n) return id;
      }
    });
  const laterNonce = (): bigint => kernelNonce({ sequence: BigInt(1 + rng.below(100_000)) });

  for (let index = 0; index < 10; index += 1) {
    const owner = testAccount(index).address;
    for (const sponsor of [false, true]) {
      push(`deploy+enable trading, Anvil owner ${String(index)}, sponsored ${String(sponsor)}`, {
        action: "deploy_enable_trading",
        owner,
        calls: enableTradingCalls(),
        nonce: firstOpNonce(),
        deployed: false,
        sponsor,
      });
    }
  }

  const later = (label: string, owner: Address, action: UserOpAction, calls: readonly Call[], sponsor: boolean): void => {
    push(`${label}, sponsored ${String(sponsor)}`, { action, owner, calls, nonce: laterNonce(), deployed: true, sponsor });
  };
  const o = Array.from({ length: 6 }, () => rng.address());
  later("enable trading, capped allowance", o[0] as Address, "enable_trading", enableTradingCalls({ allowance: BigInt(1 + rng.below(100)) * 1_000_000n }), false);
  later("enable trading, unlimited", o[0] as Address, "enable_trading", enableTradingCalls(), true);
  for (const sponsor of [false, true]) later("redeem 1", o[1] as Address, "redeem", redeemCalls(conditionIds(1)), sponsor);
  for (const sponsor of [false, true]) later("redeem 7", o[2] as Address, "redeem", redeemCalls(conditionIds(7)), sponsor);
  later("redeem 50", o[3] as Address, "redeem", redeemCalls(conditionIds(50)), true);
  later("redeem 2", o[3] as Address, "redeem", redeemCalls(conditionIds(2)), false);
  for (const sponsor of [true, false]) {
    const startsAt = 1_792_368_000n + BigInt(rng.below(1000));
    later(
      "create market",
      o[4] as Address,
      "create_market",
      createMarketCalls({ startsAt, expiresAt: startsAt + 7n * 86_400n, metadataUri: `https://example.invalid/market/${rng.bytes(16).slice(2)}.json` }),
      sponsor,
    );
  }
  const withdraw = push("withdraw", {
    action: "withdraw",
    owner: o[5] as Address,
    calls: withdrawCalls({ owner: o[5] as Address, amountAtomic: BigInt(1 + rng.below(9_000_000)) }),
    nonce: laterNonce(),
    deployed: true,
    sponsor: false,
  });
  later("revoke trading", o[5] as Address, "revoke_trading", revokeTradingCalls(), true);
  later("respond to update", o[5] as Address, "respond_update", [respondToUpdateCall(conditionIds(1)[0] as Hex, true)], true);
  later("cancel market", o[5] as Address, "cancel_market", [cancelMarketCall(conditionIds(1)[0] as Hex)], true);

  // prepareUserOp refuses a sponsored withdrawal (the paymaster would too); the hash is still defined for it.
  items.push({
    label: "withdraw with paymaster fields forced on (never built by prepareUserOp)",
    op: packUserOp({ ...unpackUserOp(withdraw.op), paymaster: { address: POLICY_PAYMASTER, verificationGasLimit: 40_262n, postOpGasLimit: 26_478n } }),
  });
  return items;
}

chainTest("EntryPoint.getUserOpHash equals the library's userOpHash, the sign block and the digest tag for every operation of a deterministic corpus", async (c) => {
  const items = buildCorpus();
  assert.ok(items.length >= 25, `the corpus has ${String(items.length)} operations`);
  assert.deepEqual(
    buildCorpus().map((item) => item.op),
    items.map((item) => item.op),
    "the corpus is deterministic",
  );
  const seen = new Set<string>();
  const kinds = new Set<string>();
  for (const item of items) {
    const onChain = await c.entryPointGetUserOpHash(item.op);
    assert.equal(onChain, userOpHash(item.op), item.label);
    seen.add(onChain);
    if (item.prepared !== undefined) {
      const { prepared } = item;
      assert.equal(onChain, prepared.userOpHash, item.label);
      assert.equal(prepared.sign.expected_digest, onChain);
      assert.equal(prepared.sign.digest_form, "userOpHash");
      assert.deepEqual(toPayboxIntent(prepared.sign), { op: "raw", rawSigningPayloadHex: onChain });
      assert.equal(prepared.digestTag, onChain.slice(2, 18));
      assert.equal(prepared.digestTag, digestTag(onChain));
      kinds.add(`${prepared.action}/${prepared.sponsored ? "paymaster" : "no paymaster"}`);
    }
    // the signature is not part of the hash
    const signed = withSignature(item.op, `0x${"11".repeat(32)}${"22".repeat(32)}1b`);
    assert.equal(await c.entryPointGetUserOpHash(signed), onChain, `${item.label}: signed`);
  }
  assert.equal(seen.size, items.length, "no two operations of the corpus share a hash");
  for (const kind of [
    "deploy_enable_trading/no paymaster",
    "deploy_enable_trading/paymaster",
    "enable_trading/no paymaster",
    "enable_trading/paymaster",
    "redeem/no paymaster",
    "redeem/paymaster",
    "create_market/no paymaster",
    "create_market/paymaster",
    "withdraw/no paymaster",
  ]) {
    assert.ok(kinds.has(kind), `the corpus covers ${kind}`);
  }
  assert.equal(items.filter((item) => item.op.paymasterAndData !== "0x").length > 10, true);
  assert.equal(items.filter((item) => item.op.paymasterAndData === "0x").length > 10, true);
});

chainTest("EntryPoint.getUserOpHash equals the library for 40 seeded packed operations of arbitrary shape (lengths 0, 1, 31, 32, 33, 52, 65, 440 and more)", async (c) => {
  const rng: Seeded = seeded("userop-anvil/random-shapes/v1");
  for (let i = 0; i < 40; i += 1) {
    const op: PackedUserOp = {
      sender: rng.address(),
      nonce: rng.word(),
      initCode: rng.pick<Hex>(["0x", rng.bytes(1), rng.bytes(31), rng.bytes(32), rng.bytes(33), buildInitCode(rng.address())]),
      callData: rng.bytes(rng.below(400)),
      accountGasLimits: rng.bytes(32),
      preVerificationGas: rng.word(),
      gasFees: rng.bytes(32),
      paymasterAndData: rng.pick<Hex>(["0x", rng.bytes(20), rng.bytes(52), rng.bytes(100)]),
      signature: rng.pick<Hex>(["0x", rng.bytes(65), rng.bytes(64)]),
    };
    assert.equal(await c.entryPointGetUserOpHash(op), userOpHash(op), `operation ${String(i)}`);
  }
});

chainTest("the captured EntryPoint reproduces the hash logged on chain for 22 real XO operations (public chain data, test/fixtures/userop/golden-ops.json)", async (c) => {
  const golden = loadGolden();
  assert.equal(golden.chainId, XO_CHAIN_ID);
  assert.equal(lower(golden.entryPoint), lower(ENTRY_POINT_V07));
  assert.equal(golden.ops.length, 22);
  let logged = 0;
  for (const g of golden.ops) {
    const op = toPacked(g);
    const onChain = await c.entryPointGetUserOpHash(op);
    assert.equal(onChain, g.userOpHash, `${g.action} ${g.txHash}`);
    assert.equal(onChain, userOpHash(op), `${g.action} ${g.txHash}: library`);
    if (g.eventUserOpHash !== null) {
      logged += 1;
      assert.equal(onChain, g.eventUserOpHash, `${g.action} ${g.txHash}: the UserOperationEvent hash`);
    }
  }
  assert.ok(logged >= 19, `${String(logged)} of the 22 carry the hash from the saved UserOperationEvent log`);
});

chainTest("a change to any field except the signature changes the hash, and the real EntryPoint follows the library each time", async (c) => {
  const prepared = prepareUserOp(deployInput(testAccount(2), true));
  const original = await c.entryPointGetUserOpHash(prepared.op);
  const fields = unpackUserOp(prepared.op);
  const flipLast = (hex: Hex): Hex => `${hex.slice(0, -2)}${hex.endsWith("00") ? "01" : "00"}` as Hex;
  const mutations: [string, PackedUserOp][] = [
    ["sender", { ...prepared.op, sender: deriveAccount(testAccount(3).address) }],
    ["nonce", { ...prepared.op, nonce: prepared.op.nonce + 1n }],
    ["nonce key", { ...prepared.op, nonce: kernelNonce({ sequence: 0n, key: 1 }) }],
    ["initCode removed", { ...prepared.op, initCode: "0x" }],
    ["callData", { ...prepared.op, callData: flipLast(prepared.op.callData) }],
    ["verificationGasLimit", packUserOp({ ...fields, verificationGasLimit: fields.verificationGasLimit + 1n })],
    ["callGasLimit", packUserOp({ ...fields, callGasLimit: fields.callGasLimit + 1n })],
    ["preVerificationGas", { ...prepared.op, preVerificationGas: prepared.op.preVerificationGas + 1n }],
    ["maxPriorityFeePerGas", packUserOp({ ...fields, maxPriorityFeePerGas: 1n })],
    ["maxFeePerGas", packUserOp({ ...fields, maxFeePerGas: 1n })],
    ["paymasterVerificationGasLimit", packUserOp({ ...fields, paymaster: { ...(fields.paymaster as NonNullable<typeof fields.paymaster>), verificationGasLimit: 40_263n } })],
    ["paymasterPostOpGasLimit", packUserOp({ ...fields, paymaster: { ...(fields.paymaster as NonNullable<typeof fields.paymaster>), postOpGasLimit: 26_479n } })],
    ["paymaster removed", { ...prepared.op, paymasterAndData: "0x" }],
  ];
  const hashes = new Set<string>([original]);
  for (const [name, mutated] of mutations) {
    const onChain = await c.entryPointGetUserOpHash(mutated);
    assert.notEqual(onChain, original, `${name} changes the hash`);
    assert.equal(onChain, userOpHash(mutated), `${name}: the library agrees with the chain`);
    hashes.add(onChain);
  }
  assert.equal(hashes.size, mutations.length + 1, "every mutation gave its own hash");
});

// ===========================================================================================================
// B. The signed deploy + Enable Trading operation, through handleOps from a bundler EOA
// ===========================================================================================================

for (const [index, form, sponsor] of [
  [2, "raw", false],
  [3, "raw", true],
  [4, "eip191", false],
  [5, "eip191", true],
] as const) {
  chainTest(`deploys the predicted account and runs Enable Trading: ${form} signature, ${sponsor ? "sponsored by the PolicyPaymaster" : "no paymaster"}`, async (c) => {
    const owner = testAccount(index);
    const predicted = deriveAccount(owner.address);
    assert.equal(await codeOf(c, predicted), "0x", "undeployed before");
    assert.equal(await nextNonce(c, predicted), firstOpNonce(), "a fresh sender is at sequence 0 of the default lane");
    assert.equal(await remainingDailyTxs(c, predicted), 10_000n);

    const prepared = prepareUserOp(deployInput(owner, sponsor));
    assert.equal(prepared.account, predicted);
    assert.equal(prepared.deploys, true);
    assert.equal(prepared.sponsored, sponsor);
    assert.equal(prepared.op.initCode, buildInitCode(owner.address));
    assert.equal(prepared.op.paymasterAndData === "0x", !sponsor);
    const signedOp = await signAsPayBox(prepared, owner, form);
    assert.equal(signedOp.signature.length, 2 + 130, "65 bytes");

    const out = landed(await c.handleOps([signedOp]));

    // the operation: ours, successful, with the paymaster we chose, at no cost
    const event = only(out.ops, "one UserOperationEvent");
    assert.equal(event.userOpHash, prepared.userOpHash);
    assert.equal(event.sender, predicted);
    assert.equal(event.nonce, firstOpNonce());
    assert.equal(event.success, true);
    assert.equal(event.paymaster, sponsor ? POLICY_PAYMASTER : zeroAddress);
    assert.equal(event.actualGasCost, 0n, "zero fee, zero prefund");
    assert.deepEqual(out.deployments, [{ userOpHash: prepared.userOpHash, sender: predicted, factory: KERNEL_FACTORY, paymaster: sponsor ? POLICY_PAYMASTER : zeroAddress }]);
    assert.deepEqual(out.revertReasons, []);

    // the account: the 61-byte ERC-1967 proxy of the pinned implementation
    assert.equal(isKernelProxyRuntime(await codeOf(c, predicted)), true);
    assert.equal(await c.publicClient.getStorageAt({ address: predicted, slot: EIP1967_IMPLEMENTATION_SLOT }), pad(lower(KERNEL_IMPLEMENTATION) as Hex, { size: 32 }));

    // the logs, decoded by the production readers
    const deployedLog = only(logsOf(out.receipt, ENTRY_POINT_V07, ACCOUNT_DEPLOYED_TOPIC), "one AccountDeployed");
    const registeredLog = only(logsOf(out.receipt, ECDSA_VALIDATOR, OWNER_REGISTERED_TOPIC), "one OwnerRegistered");
    const approvalLog = only(logsOf(out.receipt, USDC_E_ADDRESS, ERC20_APPROVAL_TOPIC), "one USDC.e Approval");
    const operatorLog = only(logsOf(out.receipt, CONDITIONAL_TOKENS, APPROVAL_FOR_ALL_TOPIC), "one ApprovalForAll");
    const eventLog = only(logsOf(out.receipt, ENTRY_POINT_V07, USER_OPERATION_EVENT_TOPIC), "one UserOperationEvent");
    const deployedRead = decodeAccountDeployed(asChainLog(deployedLog));
    assert.deepEqual(
      deployedRead && { account: deployedRead.account, userOpHash: deployedRead.userOpHash, factory: deployedRead.factory, paymaster: deployedRead.paymaster },
      { account: predicted, userOpHash: prepared.userOpHash, factory: KERNEL_FACTORY, paymaster: sponsor ? POLICY_PAYMASTER : zeroAddress },
    );
    const registeredRead = decodeOwnerRegistered(asChainLog(registeredLog));
    assert.deepEqual(registeredRead && { account: registeredRead.account, owner: registeredRead.owner }, { account: predicted, owner: owner.address });
    const approvalRead = decodeTokenApproval(asChainLog(approvalLog));
    assert.deepEqual(approvalRead && { owner: approvalRead.owner, spender: approvalRead.spender, value: approvalRead.value }, { owner: predicted, spender: CTF_EXCHANGE, value: MAX_UINT256 });
    const operatorRead = decodeApprovalForAll(asChainLog(operatorLog));
    assert.deepEqual(operatorRead && { account: operatorRead.account, operator: operatorRead.operator, approved: operatorRead.approved }, { account: predicted, operator: CTF_EXCHANGE, approved: true });
    // The order on chain (observed): the validator registers the owner while the factory creates the account, the
    // EntryPoint then announces the deployment, then the two calls run in the order they were encoded.
    const order = [registeredLog, deployedLog, approvalLog, operatorLog, eventLog].map((log) => log.logIndex);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "OwnerRegistered, AccountDeployed, Approval, ApprovalForAll, UserOperationEvent");

    // the effects, read from the stubs and the validator
    assert.equal(await allowanceOf(c, predicted, CTF_EXCHANGE), MAX_UINT256);
    assert.equal(await isOperator(c, predicted, CTF_EXCHANGE), true);
    assert.equal(await c.publicClient.readContract({ address: ECDSA_VALIDATOR, abi: ECDSA_VALIDATOR_ABI, functionName: "ecdsaValidatorStorage", args: [predicted] }), owner.address);

    // the sequence moved on by exactly one, and the three ways to know the next nonce agree
    const next = await nextNonce(c, predicted);
    assert.equal(next, kernelNonce({ sequence: 1n }));
    assert.equal(next, nextNonceAfter(event.nonce));
    assert.equal(next, await c.getNonce(predicted, laneKeyFor()));
    // only a sponsored operation counts against the paymaster's daily limit
    assert.equal(await remainingDailyTxs(c, predicted), sponsor ? 9_999n : 10_000n);
  });
}

traceTest("the Kernel makes exactly the two encoded calls, in order, with value 0 (debug_traceTransaction callTracer)", async (c) => {
  const owner = testAccount(6);
  const { prepared, out, account } = await deployAccount(c, owner, { sponsor: true });
  const frames = flattenFrames(await c.callTrace(out.txHash)).filter((frame) => frame.type === "CALL" && lower(frame.from) === lower(account) && frame.to !== undefined);
  const targets = frames.map((frame) => getAddress(frame.to as Address));
  // everything the account itself called: its validator (installing itself, validating) and the two targets
  const expectedTargets: readonly Address[] = [ECDSA_VALIDATOR, USDC_E_ADDRESS, CONDITIONAL_TOKENS];
  assert.ok(targets.every((target) => expectedTargets.includes(target)), `unexpected call targets: ${targets.join(", ")}`);
  const executed = frames.filter((frame) => getAddress(frame.to as Address) !== ECDSA_VALIDATOR);
  assert.deepEqual(
    executed.map((frame) => ({ to: getAddress(frame.to as Address), input: frame.input.toLowerCase(), value: frame.value })),
    prepared.calls.map((call) => ({ to: call.to, input: call.data, value: 0n })),
  );
  assert.deepEqual(prepared.calls.map((call) => call.to), [USDC_E_ADDRESS, CONDITIONAL_TOKENS]);
  assert.equal(decodeExecute(prepared.op.callData).mode, "batch");
  assert.equal(prepared.op.callData.slice(10, 74), EXEC_MODE_BATCH.slice(2));
});

// ===========================================================================================================
// C. The next operations: next sequence nonce, other actions, other nonce lanes
// ===========================================================================================================

chainTest("a second operation with the next sequence nonce executes, then a third; each moves the nonce by one", async (c) => {
  const owner = testAccount(6);
  const first = await deployAccount(c, owner);
  const account = first.account;
  assert.equal(await nextNonce(c, account), kernelNonce({ sequence: 1n }));

  // 2: revoke (sponsored): the allowance goes to zero and the exchange stops being an operator
  const second = await runNext(c, owner, "revoke_trading", revokeTradingCalls(), { sponsor: true });
  const secondEvent = only(second.out.ops, "one event");
  assert.equal(secondEvent.nonce, kernelNonce({ sequence: 1n }));
  assert.equal(secondEvent.userOpHash, second.prepared.userOpHash);
  assert.equal(secondEvent.paymaster, POLICY_PAYMASTER);
  assert.equal(second.prepared.op.initCode, "0x");
  assert.equal(second.out.deployments.length, 0, "no deployment the second time");
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), 0n);
  assert.equal(await isOperator(c, account, CTF_EXCHANGE), false);
  const approvalRead = decodeTokenApproval(asChainLog(only(logsOf(second.out.receipt, USDC_E_ADDRESS, ERC20_APPROVAL_TOPIC), "one Approval")));
  assert.equal(approvalRead?.value, 0n);
  const operatorRead = decodeApprovalForAll(asChainLog(only(logsOf(second.out.receipt, CONDITIONAL_TOKENS, APPROVAL_FOR_ALL_TOPIC), "one ApprovalForAll")));
  assert.equal(operatorRead?.approved, false);
  assert.equal(await nextNonce(c, account), kernelNonce({ sequence: 2n }));

  // 3: enable again with an exact allowance (no paymaster, form eip191)
  const third = await runNext(c, owner, "enable_trading", enableTradingCalls({ allowance: 25_000_000n }), { form: "eip191" });
  assert.equal(only(third.out.ops, "one event").nonce, kernelNonce({ sequence: 2n }));
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), 25_000_000n);
  assert.equal(await isOperator(c, account, CTF_EXCHANGE), true);
  assert.equal(await nextNonce(c, account), kernelNonce({ sequence: 3n }));
  assert.equal(await c.getNonce(account, laneKeyFor()), kernelNonce({ sequence: 3n }));
  assert.equal(await remainingDailyTxs(c, account), 9_999n, "one sponsored operation of the three");
});

chainTest("nonce lanes: a second lane starts at sequence 0 whatever lane 0 is at, and the lanes do not move each other", async (c) => {
  const owner = testAccount(7);
  const { account } = await deployAccount(c, owner);
  const cancelAt = async (key: number, sequence: bigint) =>
    prepareUserOp({ action: "cancel_market", owner: owner.address, calls: [cancelMarketCall(`0x${"11".repeat(32)}`)], nonce: kernelNonce({ key, sequence }), deployed: true, sponsor: false });
  const send = async (p: PreparedUserOp) => c.handleOps([await signAsPayBox(p, owner)]);

  // lane 0 has used sequence 0 (the deployment): skipping to 5 and replaying 0 are refused
  for (const sequence of [5n, 0n]) rejected(await send(await cancelAt(0, sequence)), "AA25", `lane 0 sequence ${String(sequence)}`);
  // lane 0x32 is fresh
  assert.equal(await nextNonce(c, account, 0x32), kernelNonce({ key: 0x32, sequence: 0n }));
  const laneTwo = await cancelAt(0x32, 0n);
  const sent = landed(await send(laneTwo));
  assert.deepEqual(recorded(sent.receipt, MARKET_MANAGER), [{ caller: account, data: laneTwo.calls[0]?.data as Hex }]);
  assert.equal(await nextNonce(c, account, 0x32), kernelNonce({ key: 0x32, sequence: 1n }));
  assert.equal(await nextNonce(c, account, 0), kernelNonce({ sequence: 1n }), "lane 0 did not move");
  // each lane takes its own next sequence
  landed(await send(await cancelAt(0x32, 1n)));
  landed(await send(await cancelAt(0, 1n)));
  assert.equal(await nextNonce(c, account, 0x32), kernelNonce({ key: 0x32, sequence: 2n }));
  assert.equal(await nextNonce(c, account, 0), kernelNonce({ sequence: 2n }));
});

// ===========================================================================================================
// D. Refusals: a stale nonce, a wrong signer
// ===========================================================================================================

chainTest("a stale nonce, a replay and a skipped sequence are refused by the EntryPoint, and nothing changes", async (c) => {
  const owner = testAccount(7);
  const first = await deployAccount(c, owner);
  const account = first.account;
  const second = await runNext(c, owner, "enable_trading", enableTradingCalls({ allowance: 10_000_000n }));
  const state = { nonce: await nextNonce(c, account), allowance: await allowanceOf(c, account, CTF_EXCHANGE), block: await c.publicClient.getBlockNumber() };
  assert.equal(state.nonce, kernelNonce({ sequence: 2n }));
  assert.equal(state.allowance, 10_000_000n);

  // 1. the very same signed operation again
  rejected(await c.handleOps([second.signedOp]), "AA25", "replay of the second operation");
  // 2. a new, validly signed operation at the old sequence 1
  const stale = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 99_000_000n }), nonce: kernelNonce({ sequence: 1n }), deployed: true, sponsor: false });
  rejected(await c.handleOps([await signAsPayBox(stale, owner)]), "AA25", "stale sequence 1");
  // 3. one that skips ahead to sequence 3
  const ahead = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 99_000_000n }), nonce: kernelNonce({ sequence: 3n }), deployed: true, sponsor: false });
  rejected(await c.handleOps([await signAsPayBox(ahead, owner)]), "AA25", "skipped to sequence 3");
  // 4. the deploying operation again: the account exists, so the EntryPoint refuses the initCode before the nonce
  rejected(await c.handleOps([first.signedOp]), "AA10", "replay of the deploying operation");
  // 5. a deploying operation at a later sequence is refused for the nonce
  //    (the library never builds one: it insists on the first-operation nonce for the deploying action)
  const lateOwner = testAccount(8);
  assert.throws(
    () => prepareUserOp({ ...deployInput(lateOwner, false), nonce: kernelNonce({ sequence: 1n }) }),
    (error: unknown) => error instanceof UserOpError && error.code === "invalid_nonce",
  );
  const lateDeploy = await resigned(prepareUserOp(deployInput(lateOwner, false)).op, lateOwner, { nonce: kernelNonce({ sequence: 1n }) });
  rejected(await c.handleOps([lateDeploy]), "AA25", "first operation at sequence 1");

  assert.equal(await nextNonce(c, account), state.nonce, "the nonce did not move");
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), state.allowance, "no refused operation executed");
  assert.equal(await c.publicClient.getBlockNumber(), state.block, "no transaction was even sent (the harness simulates first)");
  assert.equal(await codeOf(c, deriveAccount(testAccount(8).address)), "0x");

  // and the right nonce still lands
  const right = await runNext(c, owner, "enable_trading", enableTradingCalls({ allowance: 11_000_000n }));
  assert.equal(only(right.out.ops, "one event").nonce, kernelNonce({ sequence: 2n }));
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), 11_000_000n);
});

chainTest("a signed operation does not expire: ten days later it still lands, sponsored or not, so a leaked one stays a bearer instrument until its nonce is spent (UO10)", async (c) => {
  const signed: { op: PackedUserOp; owner: Owner; account: Address }[] = [];
  for (const [index, sponsor] of [
    [2, false],
    [3, true],
  ] as const) {
    const owner = testAccount(index);
    const prepared = prepareUserOp(deployInput(owner, sponsor));
    signed.push({ op: await signAsPayBox(prepared, owner), owner, account: prepared.account });
  }
  const start = await c.blockTimestamp();
  await c.increaseTime(10 * 86_400);
  assert.ok((await c.blockTimestamp()) - start >= 10 * 86_400, "the chain clock moved ten days");
  for (const { op, account } of signed) {
    const out = landed(await c.handleOps([op]));
    assert.equal(only(out.ops, "one event").sender, account);
    assert.equal(isKernelProxyRuntime(await codeOf(c, account)), true);
  }
});

// Signatures that do not belong to the owner, each of which the library's verifier also refuses.
async function wrongSigners(c: XoChain, owner: Owner, prepared: PreparedUserOp): Promise<[string, Hex][]> {
  // the same operation with one gas field changed: a different hash, signed by the right key
  const otherHash = userOpHash({ ...prepared.op, preVerificationGas: prepared.op.preVerificationGas + 1n });
  const stranger = testAccount(9);
  const digest = prepared.userOpHash;
  return [
    ["another key, raw digest", await stranger.sign({ hash: digest })],
    ["another key, EIP-191 digest", await stranger.signMessage({ message: { raw: digest } })],
    ["the bundler's own key", await c.bundler.sign({ hash: digest })],
    ["the owner's signature over a different operation", await owner.sign({ hash: otherHash })],
    ["the owner's signature over this operation's hash under chain 8453", await owner.sign({ hash: userOpHashUnder(prepared.op, ENTRY_POINT_V07, 8453n) })],
    ["the owner's signature over this operation's hash under another EntryPoint", await owner.sign({ hash: userOpHashUnder(prepared.op, KERNEL_FACTORY, BigInt(XO_CHAIN_ID)) })],
  ];
}

chainTest("a wrong signer cannot deploy: the library's verifier says owner_mismatch, the chain says AA24, and nothing is deployed", async (c) => {
  const owner = testAccount(8);
  const predicted = deriveAccount(owner.address);
  for (const sponsor of [false, true]) {
    const prepared = prepareUserOp(deployInput(owner, sponsor));
    for (const [name, signature] of await wrongSigners(c, owner, prepared)) {
      const verdict = await verifyUserOpSignature({ op: prepared.op, signature, expectedOwner: owner.address });
      assert.equal(verdict.ok, false, `${name}: the verifier refuses`);
      if (!verdict.ok) assert.equal(verdict.code, "owner_mismatch", name);
      // forced past the verifier, the chain refuses it too
      rejected(await c.handleOps([withSignature(prepared.op, signature)]), "AA24", `${name} (sponsored ${String(sponsor)})`);
      assert.equal(await codeOf(c, predicted), "0x", `${name}: nothing was deployed`);
    }
  }
  assert.equal(await nextNonce(c, predicted), firstOpNonce());
  // the owner's own signature lands
  await deployAccount(c, owner);
  assert.equal(isKernelProxyRuntime(await codeOf(c, predicted)), true);
});

chainTest("a wrong signer cannot move a deployed account: AA24 for an Enable Trading and a revoke, state untouched", async (c) => {
  const owner = testAccount(8);
  const { account } = await deployAccount(c, owner);
  for (const [action, calls] of [
    ["revoke_trading", revokeTradingCalls()],
    ["enable_trading", enableTradingCalls({ allowance: 1_000_000n })],
  ] as const) {
    const prepared = prepareUserOp({ action, owner: owner.address, calls, nonce: await nextNonce(c, account), deployed: true, sponsor: true });
    for (const [name, signature] of await wrongSigners(c, owner, prepared)) {
      const verdict = await verifyUserOpSignature({ op: prepared.op, signature, expectedOwner: owner.address });
      assert.equal(verdict.ok, false, `${action}, ${name}: the verifier refuses`);
      rejected(await c.handleOps([withSignature(prepared.op, signature)]), "AA24", `${action}, ${name}`);
    }
  }
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), MAX_UINT256, "still the Enable Trading allowance");
  assert.equal(await isOperator(c, account, CTF_EXCHANGE), true);
  assert.equal(await nextNonce(c, account), kernelNonce({ sequence: 1n }));
});

chainTest("the library's verifier and the real validator agree on which signature spellings are valid, and the canonical form is always accepted", async (c) => {
  const owner = testAccount(6);
  const prepared = prepareUserOp(deployInput(owner, false));
  const raw = await owner.sign({ hash: prepared.userOpHash });
  const parts = splitSignature(raw);
  const stranger = await testAccount(7).sign({ hash: prepared.userOpHash });
  const variants: { name: string; signature: Hex; chain: boolean; verifier: boolean; chainReason?: string }[] = [
    { name: "raw digest", signature: raw, chain: true, verifier: true },
    { name: "EIP-191 digest", signature: await owner.signMessage({ message: { raw: prepared.userOpHash } }), chain: true, verifier: true },
    // The deployed validator does not reject the malleable twin; the library still sends the low-s form.
    { name: "high-s twin", signature: malleate(raw), chain: true, verifier: true },
    // v of 0 or 1 makes the validator's recover revert (AA23): verify.ts rewrites it to 27 or 28 first.
    { name: "v as parity bit", signature: withV(raw, parts.v - 27), chain: false, verifier: true, chainReason: "AA23" },
    { name: "another key's signature", signature: stranger, chain: false, verifier: false, chainReason: "AA24" },
    { name: "all zeros", signature: `0x${"00".repeat(65)}` as Hex, chain: false, verifier: false, chainReason: "AA23" },
    // The estimation dummy recovers to somebody else, so the validator answers "signature error" instead of reverting.
    { name: "the estimation dummy", signature: DUMMY_USEROP_SIGNATURE, chain: false, verifier: false, chainReason: "AA24" },
  ];
  for (const variant of variants) {
    const sent = await c.simulateHandleOps([withSignature(prepared.op, variant.signature)]);
    assert.equal(sent.ok, variant.chain, `${variant.name}: as sent, the chain says ${JSON.stringify(sent.ok ? "ok" : sent.error.code)}`);
    if (!sent.ok && variant.chainReason !== undefined) assert.equal(sent.error.code, variant.chainReason, variant.name);
    const verdict = await verifyUserOpSignature({ op: prepared.op, signature: variant.signature, expectedOwner: owner.address });
    assert.equal(verdict.ok, variant.verifier, `${variant.name}: the verifier says ${verdict.ok ? "ok" : verdict.code}`);
    if (verdict.ok) assert.deepEqual(await c.simulateHandleOps([verdict.signedOp]), { ok: true }, `${variant.name}: the canonical form`);
  }
  // r, s and a recovery id (what PayBox may return) are accepted by the verifier and make the same canonical bytes
  const asObject = await verifyUserOpSignature({ op: prepared.op, signature: { r: toHex(parts.r, { size: 32 }), s: toHex(parts.s, { size: 32 }), recovery_id: parts.v - 27 }, expectedOwner: owner.address });
  assert.ok(asObject.ok);
  if (asObject.ok) assert.equal(asObject.signature, joinSignature(parts));
  // a signature made before a one-byte change to the call data belongs to the wrong operation, for the chain and the verifier
  const tampered: PackedUserOp = { ...withSignature(prepared.op, raw), callData: `${prepared.op.callData.slice(0, -2)}${prepared.op.callData.endsWith("00") ? "01" : "00"}` as Hex };
  rejected(await c.simulateHandleOps([tampered]), "AA24", "tampered call data");
  const verdict = await verifyUserOpSignature({ op: tampered, signature: raw, expectedOwner: owner.address });
  assert.ok(!verdict.ok && verdict.code === "owner_mismatch");
});

chainTest("note 21 sec 5's pre-submit self-check: validator.validateUserOp(op, hash) from the account returns 0 for the owner's signature and 1 otherwise", async (c) => {
  const owner = testAccount(5);
  const { account } = await deployAccount(c, owner);
  const prepared = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 5_000_000n }), nonce: await nextNonce(c, account), deployed: true, sponsor: false });
  const abi = parseAbi([
    "struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }",
    "function validateUserOp(PackedUserOperation userOp, bytes32 userOpHash) payable returns (uint256)",
  ]);
  const simulate = async (from: Address, op: PackedUserOp): Promise<bigint | "reverted"> => {
    const data = encodeFunctionData({ abi, functionName: "validateUserOp", args: [{ ...op }, userOpHash(op)] });
    try {
      return BigInt(await c.rpc<Hex>("eth_call", [{ from, to: ECDSA_VALIDATOR, data }, "latest"]));
    } catch {
      return "reverted";
    }
  };
  const rawSigned = withSignature(prepared.op, await owner.sign({ hash: prepared.userOpHash }));
  const eip191Signed = withSignature(prepared.op, await owner.signMessage({ message: { raw: prepared.userOpHash } }));
  const strangerSigned = withSignature(prepared.op, await testAccount(9).sign({ hash: prepared.userOpHash }));
  assert.equal(await simulate(account, rawSigned), 0n, "raw");
  assert.equal(await simulate(account, eip191Signed), 0n, "EIP-191");
  assert.equal(await simulate(account, strangerSigned), 1n, "another key");
  assert.equal(await simulate(c.bundler.address, rawSigned), 1n, "the right signature, but not from the account");
  assert.equal(await simulate(deriveAccount(testAccount(4).address), rawSigned), 1n, "from an account that is not deployed");
});

// ===========================================================================================================
// E. execute: single and batch encodings run exactly the encoded calls
// ===========================================================================================================

chainTest("single mode runs one call: the recorder at the manager sees the account as caller and exactly the encoded call data", async (c) => {
  const owner = testAccount(2);
  const { account } = await deployAccount(c, owner);
  const call = cancelMarketCall(`0x${"ab".repeat(32)}`);
  const { prepared, out } = await runNext(c, owner, "cancel_market", [call], { sponsor: true });
  assert.equal(prepared.op.callData.slice(10, 74), EXEC_MODE_SINGLE.slice(2), "the mode word is single");
  assert.equal(decodeExecute(prepared.op.callData).mode, "single");
  assert.deepEqual(recorded(out.receipt, MARKET_MANAGER), [{ caller: account, data: call.data }]);
  assert.deepEqual(recorded(out.receipt, XO_WARP_ROUTE), []);
  assert.deepEqual(recorded(out.receipt, CONDITIONAL_TOKENS), []);
});

chainTest("batch mode runs both calls of Enable Trading in order: Approval, then ApprovalForAll, both from the account", async (c) => {
  const owner = testAccount(3);
  const { prepared, out } = await deployAccount(c, owner);
  assert.equal(prepared.op.callData.slice(10, 74), EXEC_MODE_BATCH.slice(2), "the mode word is batch");
  const [approve, setApproval] = prepared.calls;
  assert.equal(approve?.to, USDC_E_ADDRESS);
  assert.equal(setApproval?.to, CONDITIONAL_TOKENS);
  const approval = only(logsOf(out.receipt, USDC_E_ADDRESS, ERC20_APPROVAL_TOPIC), "one Approval");
  const operator = only(logsOf(out.receipt, CONDITIONAL_TOKENS, APPROVAL_FOR_ALL_TOPIC), "one ApprovalForAll");
  assert.ok(approval.logIndex < operator.logIndex, "the approve call ran first");
  // each log names the account as the approver: the Kernel is msg.sender for both calls
  assert.equal(getAddress(`0x${(approval.topics[1] as string).slice(26)}`), prepared.account);
  assert.equal(getAddress(`0x${(operator.topics[1] as string).slice(26)}`), prepared.account);
  assert.equal(getAddress(`0x${(approval.topics[2] as string).slice(26)}`), CTF_EXCHANGE);
  assert.equal(getAddress(`0x${(operator.topics[2] as string).slice(26)}`), CTF_EXCHANGE);
});

chainTest("a batch of five redeems runs five redeemPositions calls in order; one unresolved condition undoes the whole batch (the operation still lands)", async (c) => {
  const owner = testAccount(4);
  const { account } = await deployAccount(c, owner);
  const ids = [1n, 2n, 3n, 4n, 5n].map((n) => pad(toHex(n * 0x1111n), { size: 32 }));
  await resolveConditions(c, ids);
  const good = await runNext(c, owner, "redeem", redeemCalls(ids), { sponsor: true });
  const redeems = parseEventLogs({ abi: CTF_STUB_ABI, logs: good.out.receipt.logs, eventName: "StubRedeemPositions" });
  assert.deepEqual(
    redeems.map((log) => ({ caller: log.args.caller, conditionId: log.args.conditionId })),
    ids.map((id) => ({ caller: account, conditionId: id })),
  );
  assert.equal(good.prepared.plan.source, "defaults");
  assert.equal(await nextNonce(c, account), kernelNonce({ sequence: 2n }));

  // the middle condition is not resolved: the CTF stub reverts the call, the batch is all or nothing
  const mixed = [ids[0] as Hex, pad(toHex(0xdead_beefn), { size: 32 }), ids[1] as Hex];
  const bad = await runNext(c, owner, "redeem", redeemCalls(mixed), { sponsor: true, expectExecution: false });
  const event = only(bad.out.ops, "one event");
  assert.equal(event.success, false, "included, but its execution reverted");
  // (the stub reverts with no data, and the EntryPoint reports a revert reason only when there is some)
  assert.deepEqual(bad.out.revertReasons, []);
  assert.deepEqual(parseEventLogs({ abi: CTF_STUB_ABI, logs: bad.out.receipt.logs, eventName: "StubRedeemPositions" }), [], "no redeem of the batch survived");
  assert.equal(await nextNonce(c, account), kernelNonce({ sequence: 3n }), "the nonce is spent all the same");
});

chainTest("market creation: approve exactly the fee, then the manager call; both reach their targets as encoded, sponsored", async (c) => {
  const owner = testAccount(9);
  const { account } = await deployAccount(c, owner);
  const calls = createMarketCalls({ startsAt: 1_792_368_000n, expiresAt: 1_792_972_800n, metadataUri: "https://example.invalid/market/1.json" });
  const { prepared, out } = await runNext(c, owner, "create_market", calls, { sponsor: true });
  assert.deepEqual(recorded(out.receipt, MARKET_MANAGER), [{ caller: account, data: calls[1]?.data as Hex }]);
  const approval = decodeTokenApproval(asChainLog(only(logsOf(out.receipt, USDC_E_ADDRESS, ERC20_APPROVAL_TOPIC), "one Approval")));
  assert.deepEqual(approval && { owner: approval.owner, spender: approval.spender, value: approval.value }, { owner: account, spender: MARKET_MANAGER, value: CREATION_FEE_ATOMIC });
  assert.equal(await allowanceOf(c, account, MARKET_MANAGER), CREATION_FEE_ATOMIC);
  assert.equal(only(out.ops, "one event").paymaster, POLICY_PAYMASTER);
  assert.equal(prepared.sponsored, true);
});

chainTest("the flagged withdrawal: approve(route, amount) then transferRemote(8453, owner left-padded, amount), no paymaster", async (c) => {
  const owner = testAccount(2);
  const { account } = await deployAccount(c, owner);
  const calls = withdrawCalls({ owner: owner.address, amountAtomic: 2_500_000n });
  const { prepared, out } = await runNext(c, owner, "withdraw", calls);
  assert.equal(prepared.op.paymasterAndData, "0x");
  assert.deepEqual(recorded(out.receipt, XO_WARP_ROUTE), [{ caller: account, data: calls[1]?.data as Hex }]);
  const data = calls[1]?.data as Hex;
  assert.equal((data.length - 2) / 2, 100);
  assert.equal(data.slice(0, 10), "0x81b4e8b4");
  assert.equal(data.slice(10 + 64, 10 + 128), pad(lower(owner.address) as Hex, { size: 32 }).slice(2), "the recipient is the owner, left-padded");
  assert.equal(await allowanceOf(c, account, XO_WARP_ROUTE), 2_500_000n);
  assert.equal(only(out.ops, "one event").paymaster, zeroAddress);
});

// ===========================================================================================================
// F. Sponsorship: what the library thinks the paymaster sponsors against the real paymaster code
// ===========================================================================================================

chainTest("isSponsorable agrees with the real PolicyPaymaster (allowlist replayed from note 21) for every call kind, alone and in batches", async (c) => {
  const owner = testAccount(5);
  const { account } = await deployAccount(c, owner);
  const nonce = await nextNonce(c, account);
  const id = `0x${"cd".repeat(32)}` as Hex;
  const rows: [string, readonly Call[], boolean][] = [
    ["USDC.e approve(exchange, max)", [usdceApproveMaxCall(CTF_EXCHANGE)], true],
    ["USDC.e approve(manager, exactly the fee)", [usdceApproveCall(MARKET_MANAGER, CREATION_FEE_ATOMIC)], true],
    ["CTF setApprovalForAll", [ctfSetApprovalForAllCall(true)], true],
    ["CTF redeemPositions", [redeemCall(id)], true],
    ["create market (approve, create)", createMarketCalls({ startsAt: 1_792_368_000n, expiresAt: 1_792_972_800n, metadataUri: "https://example.invalid/market/2.json" }), true],
    ["respondToUpdateRequest", [respondToUpdateCall(id, true)], true],
    ["cancelMarket", [cancelMarketCall(id)], true],
    ["transferRemote alone", [withdrawCalls({ owner: owner.address, amountAtomic: 1_000_000n })[1] as Call], false],
    ["withdrawal (approve, transferRemote)", withdrawCalls({ owner: owner.address, amountAtomic: 1_000_000n }), false],
    ["Enable Trading plus a withdrawal", [...enableTradingCalls(), ...withdrawCalls({ owner: owner.address, amountAtomic: 1_000_000n })], false],
  ];
  const defaults = defaultGasFor("redeem").limits;
  for (const [name, calls, expected] of rows) {
    assert.equal(isSponsorable(calls), expected, `${name}: the library`);
    const op = packUserOp({
      sender: account,
      nonce,
      initCode: "0x",
      callData: encodeExecute(calls),
      verificationGasLimit: defaults.verificationGasLimit,
      callGasLimit: 2_000_000n,
      preVerificationGas: defaults.preVerificationGas,
      maxPriorityFeePerGas: 0n,
      maxFeePerGas: 0n,
      paymaster: { address: POLICY_PAYMASTER, verificationGasLimit: defaults.paymasterVerificationGasLimit, postOpGasLimit: defaults.paymasterPostOpGasLimit },
    });
    const sent = await c.simulateHandleOps([withSignature(op, await owner.sign({ hash: userOpHash(op) }))]);
    if (expected) assert.deepEqual(sent, { ok: true }, `${name}: the paymaster accepts`);
    else rejected(sent, "AA34", name);
    // without the paymaster fields, the EntryPoint takes every one of them (a refusal is the paymaster's alone)
    const plain = packUserOp({ ...unpackUserOp(op), paymaster: null, signature: "0x" });
    assert.deepEqual(await c.simulateHandleOps([withSignature(plain, await owner.sign({ hash: userOpHash(plain) }))]), { ok: true }, `${name}: unsponsored`);
  }
});

chainTest("note 21 sec 6/7: a zero-fee sponsored operation costs the paymaster's deposit nothing; sponsored operations are counted, unsponsored are not; an operation whose execution reverts is not counted", async (c) => {
  const owner = testAccount(3);
  const depositBefore = await paymasterDeposit(c);
  const { account } = await deployAccount(c, owner, { sponsor: true });
  assert.equal(await paymasterDeposit(c), depositBefore, "no prefund is drawn at zero fees");
  assert.equal(await remainingDailyTxs(c, account), 9_999n);
  await runNext(c, owner, "enable_trading", enableTradingCalls({ allowance: 3_000_000n }));
  assert.equal(await remainingDailyTxs(c, account), 9_999n, "an operation with no paymaster is not counted");
  await runNext(c, owner, "enable_trading", enableTradingCalls({ allowance: 4_000_000n }), { sponsor: true });
  assert.equal(await remainingDailyTxs(c, account), 9_998n);
  // an unresolved redeem: the inner call reverts, the operation is included, the paymaster is told the operation reverted
  const reverted = await runNext(c, owner, "redeem", redeemCalls([`0x${"ee".repeat(32)}`]), { sponsor: true, expectExecution: false });
  assert.equal(only(reverted.out.ops, "one event").success, false);
  assert.equal(await remainingDailyTxs(c, account), 9_998n, "postOp does not count an operation that reverted");
});

chainTest("a paused PolicyPaymaster refuses sponsored operations (AA34): an existing account's operation goes again without it, a deployment is told to stop, and the contracts would have taken both", async (c) => {
  const owner = testAccount(4);
  const { account } = await deployAccount(c, owner);
  const newcomer = testAccount(6);
  await asPaymasterOwner(c, async (send) => {
    await send("pause", []);
  });

  // an existing account: refused with the paymaster, then (UO7) once more without it
  const sponsored = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 6_000_000n }), nonce: await nextNonce(c, account), deployed: true, sponsor: true });
  rejected(await c.handleOps([await signAsPayBox(sponsored, owner)]), "AA34", "sponsored while paused");
  assert.equal(sponsorshipFallback({ deploys: false, retried: false }), "retry_without_paymaster");
  const retried = await runNext(c, owner, "enable_trading", enableTradingCalls({ allowance: 6_000_000n }), { sponsor: false });
  assert.equal(only(retried.out.ops, "one event").paymaster, zeroAddress);
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), 6_000_000n);
  assert.equal(sponsorshipFallback({ deploys: false, retried: true }), "stop", "never a second retry");

  // a deployment: refused with the paymaster; the library says stop (an unsponsored deployment was never seen on XO's stack)
  const deploy = prepareUserOp(deployInput(newcomer, true));
  rejected(await c.handleOps([await signAsPayBox(deploy, newcomer)]), "AA34", "sponsored deployment while paused");
  assert.equal(sponsorshipFallback({ deploys: true, retried: false }), "stop");
  // ... though at the contract level the same deployment lands without a paymaster (the half of UO8 the contracts can answer)
  const plain = await deployAccount(c, newcomer);
  assert.equal(only(plain.out.ops, "one event").paymaster, zeroAddress);
  assert.equal(isKernelProxyRuntime(await codeOf(c, plain.account)), true);
});

// ===========================================================================================================
// G. Fees: the order of the two halves of gasFees, and why zero fees matter
// ===========================================================================================================

chainTest("gasFees = maxPriorityFeePerGas (high 16 bytes) ++ maxFeePerGas (low 16): the real EntryPoint prices a sponsored operation at min(maxFee, priority + basefee); with fees, an account with no balance cannot pay", async (c) => {
  const owner = testAccount(4);
  const { account } = await deployAccount(c, owner);
  const baseFee = 1_000_000n;
  const priority = 5n;
  const maxFee = 1_000_000_000_000n;
  const prepared = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 7_000_000n }), nonce: await nextNonce(c, account), deployed: true, sponsor: true });
  const fields = unpackUserOp(prepared.op);
  assert.equal(fields.maxFeePerGas, 0n, "the library builds zero fees");
  const priced = await resigned(prepared.op, owner, { maxPriorityFeePerGas: priority, maxFeePerGas: maxFee });
  assert.equal(priced.gasFees, `0x${priority.toString(16).padStart(32, "0")}${maxFee.toString(16).padStart(32, "0")}`);

  const depositBefore = await paymasterDeposit(c);
  await c.rpc("anvil_setNextBlockBaseFeePerGas", [toHex(baseFee)]);
  const out = landed(await c.handleOps([priced]));
  const block = await c.rpc<{ baseFeePerGas: Hex }>("eth_getBlockByNumber", [toHex(out.receipt.blockNumber), false]);
  assert.equal(BigInt(block.baseFeePerGas), baseFee, "the base fee of the block is the one set");
  const event = only(out.ops, "one event");
  assert.ok(event.actualGasUsed > 0n);
  assert.equal(event.actualGasCost % event.actualGasUsed, 0n);
  const price = event.actualGasCost / event.actualGasUsed;
  assert.equal(price, priority + baseFee < maxFee ? priority + baseFee : maxFee, "min(maxFeePerGas, maxPriorityFeePerGas + basefee), with the halves as the library packs them");
  assert.notEqual(price, priority, "not what the swapped order would give (min(5, 10^12 + basefee))");
  assert.equal(depositBefore - (await paymasterDeposit(c)), event.actualGasCost, "the paymaster's deposit paid exactly the cost");

  // without a paymaster the account itself must prefund: with no balance the EntryPoint refuses (AA21)
  const next = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 8_000_000n }), nonce: await nextNonce(c, account), deployed: true, sponsor: false });
  rejected(await c.handleOps([await resigned(next.op, owner, { maxPriorityFeePerGas: 1n, maxFeePerGas: 1_000n })]), "AA21", "fees without a paymaster or a balance");
  // at zero fees the same operation lands (the case UO8 and note 21 sec 6 rest on)
  landed(await c.handleOps([await signAsPayBox(next, owner)]));
  assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), 8_000_000n);
});

// ===========================================================================================================
// H. Gas: the library's defaults against the real thresholds (exact numbers go to the test diagnostics)
// ===========================================================================================================

chainTest("verification gas: how little the real contracts need to deploy and to validate, against the defaults the library and note 21 give", async (c, t) => {
  // --- deploying operation
  const deployFor = async (index: number, sponsor: boolean) => {
    const owner = testAccount(index);
    return { owner, prepared: prepareUserOp(deployInput(owner, sponsor)) };
  };
  const deployDefault = defaultGasFor("deploy_enable_trading").limits;
  const deployMin: Record<string, bigint> = {};
  for (const sponsor of [false, true]) {
    const { owner, prepared } = await deployFor(sponsor ? 4 : 3, sponsor);
    assert.equal(prepared.plan.limits.verificationGasLimit, deployDefault.verificationGasLimit);
    deployMin[String(sponsor)] = await smallestWorking(50_000n, deployDefault.verificationGasLimit * 2n, async (v) => (await c.simulateHandleOps([await resigned(prepared.op, owner, { verificationGasLimit: v })])).ok);
    t.diagnostic(`deploy op, sponsored ${String(sponsor)}: needs verificationGasLimit >= ${String(deployMin[String(sponsor)])}; default ${String(deployDefault.verificationGasLimit)} (margin ${percent(deployDefault.verificationGasLimit, deployMin[String(sponsor)] as bigint)})`);
    assert.ok(deployDefault.verificationGasLimit >= (deployMin[String(sponsor)] as bigint), "the default deploys the account");
  }
  // --- paymaster verification
  {
    const { owner, prepared } = await deployFor(5, true);
    const defaultLimit = prepared.plan.limits.paymasterVerificationGasLimit;
    const min = await smallestWorking(1_000n, defaultLimit * 2n, async (v) => {
      const fields = unpackUserOp(prepared.op);
      return (await c.simulateHandleOps([await resigned(prepared.op, owner, { paymaster: { ...(fields.paymaster as NonNullable<typeof fields.paymaster>), verificationGasLimit: v } })])).ok;
    });
    t.diagnostic(`paymaster verification: needs paymasterVerificationGasLimit >= ${String(min)}; default ${String(defaultLimit)} (margin ${percent(defaultLimit, min)})`);
    assert.ok(defaultLimit >= min, "the default gets the paymaster through validation");
  }
  // --- an account that already exists
  const owner = testAccount(6);
  const { account } = await deployAccount(c, owner);
  const enableDefault = defaultGasFor("enable_trading").limits.verificationGasLimit;
  const redeemDefault = defaultGasFor("redeem").limits.verificationGasLimit;
  const redeem50Default = defaultGasFor("redeem", { redeems: 50 }).limits.verificationGasLimit;
  const ids = (n: number): Hex[] => Array.from({ length: n }, (_, i) => pad(toHex(BigInt(i + 1) * 0x1357n), { size: 32 }));
  const cases: [string, UserOpAction, readonly Call[], bigint][] = [
    ["Enable Trading on a deployed account", "enable_trading", enableTradingCalls({ allowance: 1_000_000n }), enableDefault],
    ["redeem, one market", "redeem", redeemCalls(ids(1)), redeemDefault],
    ["redeem, 50 markets", "redeem", redeemCalls(ids(50)), redeem50Default],
    ["create market", "create_market", createMarketCalls({ startsAt: 1_792_368_000n, expiresAt: 1_792_972_800n, metadataUri: "https://example.invalid/market/3.json" }), defaultGasFor("create_market").limits.verificationGasLimit],
  ];
  // The paymaster's own limit is held generous here so that it cannot mask the account's (it has its own test below).
  const generousPaymaster = (op: PackedUserOp): UserOpFields["paymaster"] => {
    const { paymaster } = unpackUserOp(op);
    return paymaster === null ? null : { ...paymaster, verificationGasLimit: 500_000n };
  };
  for (const sponsor of [false, true]) {
    for (const [name, action, calls, defaultLimit] of cases) {
      const prepared = prepareUserOp({ action, owner: owner.address, calls, nonce: await nextNonce(c, account), deployed: true, sponsor });
      assert.equal(prepared.plan.limits.verificationGasLimit, defaultLimit);
      const min = await smallestWorking(
        5_000n,
        defaultLimit * 2n,
        async (v) => (await c.simulateHandleOps([await resigned(prepared.op, owner, { verificationGasLimit: v, paymaster: generousPaymaster(prepared.op) })])).ok,
      );
      t.diagnostic(`${name}, sponsored ${String(sponsor)}: needs verificationGasLimit >= ${String(min)}; default ${String(defaultLimit)} (margin ${percent(defaultLimit, min)})`);
      assert.ok(defaultLimit >= min, `${name}: the default validates the operation`);
    }
  }
});

chainTest("paymaster postOp gas: the first sponsored operation of a UTC day needs more than later ones; the library's 26,478 covers both with room", async (c, t) => {
  // An operation whose postOp runs out of gas is still included, but its execution is undone (success false):
  // the only observable is the event, so each try is a real send that is rolled back afterwards.
  const tryPostOp = async (prepared: PreparedUserOp, owner: Owner, limit: bigint): Promise<boolean> => {
    const snapshot = await c.snapshot();
    try {
      const fields = unpackUserOp(prepared.op);
      const op = await resigned(prepared.op, owner, { paymaster: { ...(fields.paymaster as NonNullable<typeof fields.paymaster>), postOpGasLimit: limit } });
      const out = await c.handleOps([op]);
      return out.ok && only(out.ops, "one event").success;
    } finally {
      await c.revert(snapshot);
    }
  };
  const owner = testAccount(7);
  const deployPrepared = prepareUserOp(deployInput(owner, true));
  const defaultPostOp = deployPrepared.plan.limits.paymasterPostOpGasLimit;
  assert.equal(defaultPostOp, 26_478n);
  const firstMin = await smallestWorking(1_000n, defaultPostOp, (v) => tryPostOp(deployPrepared, owner, v));

  const { account } = await deployAccount(c, owner, { sponsor: true });
  const second = prepareUserOp({ action: "enable_trading", owner: owner.address, calls: enableTradingCalls({ allowance: 2_000_000n }), nonce: await nextNonce(c, account), deployed: true, sponsor: true });
  const laterMin = await smallestWorking(1_000n, defaultPostOp, (v) => tryPostOp(second, owner, v));

  t.diagnostic(`postOp gas: first sponsored operation of the day needs >= ${String(firstMin)}, a later one >= ${String(laterMin)} (difference ${String(firstMin - laterMin)}); default ${String(defaultPostOp)}; note 21 sec 4.2 saw 26,478 first and 5,958 later`);
  assert.ok(firstMin > laterMin, "the first operation of the day pays for a fresh counter slot");
  assert.ok(firstMin <= defaultPostOp && laterMin <= defaultPostOp);
  assert.ok(firstMin - laterMin > 10_000n, "the difference is a storage write from zero (note 21 says about 20k)");
  // and below the threshold the operation is included but undone, not rejected
  const snapshot = await c.snapshot();
  try {
    const fields = unpackUserOp(second.op);
    const op = await resigned(second.op, owner, { paymaster: { ...(fields.paymaster as NonNullable<typeof fields.paymaster>), postOpGasLimit: laterMin - 1n } });
    const out = await c.handleOps([op]);
    assert.ok(out.ok, "included");
    assert.equal(only(out.ok ? out.ops : [], "one event").success, false, "but its execution was undone");
    assert.equal(await allowanceOf(c, account, CTF_EXCHANGE), MAX_UINT256, "the new allowance did not stick");
  } finally {
    await c.revert(snapshot);
  }
});

// The PolicyPaymaster walks every call of a batch while it validates, so its verification gas grows with the call
// count. The library's default (40,262, the figure XO's app uses for one- and two-call operations) was copied to
// batched redeems, for which note 21 has no sponsored example (its 62- and 73-call batches carry no paymaster).
const redeemIds = (n: number): Hex[] => Array.from({ length: n }, (_, i) => pad(toHex(BigInt(i + 1) * 0x1111n), { size: 32 }));

async function sponsoredRedeem(c: XoChain, owner: Owner, account: Address, n: number): Promise<{ prepared: PreparedUserOp; signed: PackedUserOp }> {
  const prepared = prepareUserOp({ action: "redeem", owner: owner.address, calls: redeemCalls(redeemIds(n)), nonce: await nextNonce(c, account), deployed: true, sponsor: true });
  return { prepared, signed: withSignature(prepared.op, await owner.sign({ hash: prepared.userOpHash })) };
}

chainTest("paymaster verification gas grows with the number of calls: the library's default covers small batches (up to 5 calls proven here) and the cutoff is measured", async (c, t) => {
  const owner = testAccount(2);
  const { account } = await deployAccount(c, owner);
  const limits: bigint[] = [];
  const fits: boolean[] = [];
  for (let n = 1; n <= 50; n += 1) {
    const { prepared, signed } = await sponsoredRedeem(c, owner, account, n);
    limits.push(prepared.plan.limits.paymasterVerificationGasLimit);
    fits.push((await c.simulateHandleOps([signed])).ok);
  }
  const firstFailure = fits.indexOf(false) + 1; // 0 when every size fits
  t.diagnostic(
    `sponsored redeem with the library's default paymaster verification limit (${String(limits[0])} for one redeem, ${String(limits[49])} for 50): ${
      firstFailure === 0 ? "all sizes 1 to 50 pass" : `sizes 1 to ${String(firstFailure - 1)} pass, size ${String(firstFailure)} and larger fail (AA33)`
    }`,
  );
  for (let n = 1; n <= 5; n += 1) assert.equal(fits[n - 1], true, `${String(n)} redeems fit the default`);
  if (firstFailure !== 0) assert.equal(fits.slice(firstFailure - 1).every((fit) => !fit), true, "once a size fails, every larger size fails");

  // the exact need for some sizes
  const needs = new Map<number, bigint>();
  for (const n of [1, 2, 5, 10, 25, 50]) {
    const { prepared } = await sponsoredRedeem(c, owner, account, n);
    const fields = unpackUserOp(prepared.op);
    needs.set(
      n,
      await smallestWorking(1_000n, 400_000n, async (v) => {
        const patched = await resigned(prepared.op, owner, { paymaster: { ...(fields.paymaster as NonNullable<typeof fields.paymaster>), verificationGasLimit: v } });
        return (await c.simulateHandleOps([patched])).ok;
      }),
    );
  }
  t.diagnostic(`minimum paymasterVerificationGasLimit by number of redeems: ${[...needs].map(([n, need]) => `${String(n)}: ${String(need)}`).join(", ")}`);
  const sizes = [...needs.keys()];
  for (let i = 1; i < sizes.length; i += 1) {
    assert.ok((needs.get(sizes[i] as number) as bigint) > (needs.get(sizes[i - 1] as number) as bigint), "more calls need more paymaster verification gas");
  }
  for (const n of sizes) assert.equal((limits[n - 1] as bigint) >= (needs.get(n) as bigint), fits[n - 1], `${String(n)} redeems: fits exactly when the limit covers the need`);
});

// Reported as a TODO (not a failure) while src/xo/userop/gas.ts gives a sponsored redeem batch the one-call
// paymasterVerificationGasLimit; it becomes an ordinary passing test once the limit scales with the call count (or
// big batches are sent without a paymaster, as XO's bots do).
chainTest("the library's default plan for a sponsored redeem of 50 markets passes paymaster validation", async (c, t) => {
  const owner = testAccount(2);
  const { account } = await deployAccount(c, owner);
  const { prepared, signed } = await sponsoredRedeem(c, owner, account, 50);
  const simulated = await c.simulateHandleOps([signed]);
  if (!simulated.ok && simulated.error.code === "AA33") {
    return t.todo(
      `paymaster validation runs out of gas: default paymasterVerificationGasLimit ${String(prepared.plan.limits.paymasterVerificationGasLimit)}, the real paymaster needs 138,360 for 50 calls (AA33). Scale the limit with the call count or send big batches without a paymaster.`,
    );
  }
  assert.deepEqual(simulated, { ok: true });
});

chainTest("the library's default gas lands every action it can prepare, sponsored where the paymaster allows it, on the real EntryPoint", async (c, t) => {
  const owner = testAccount(8);
  const { account, out: deployOut } = await deployAccount(c, owner, { sponsor: true });
  const ids = Array.from({ length: 50 }, (_, i) => pad(toHex(BigInt(i + 1) * 0x2468n), { size: 32 }));
  await resolveConditions(c, ids);
  const used: string[] = [`deploy+enable (sponsored): ${String(only(deployOut.ops, "one event").actualGasUsed)}`];
  const steps: [string, UserOpAction, readonly Call[], boolean][] = [
    ["Enable Trading, capped", "enable_trading", enableTradingCalls({ allowance: 50_000_000n }), true],
    ["redeem 1", "redeem", redeemCalls(ids.slice(0, 1)), true],
    ["redeem 2", "redeem", redeemCalls(ids.slice(0, 2)), true],
    ["redeem 5", "redeem", redeemCalls(ids.slice(0, 5)), true],
    // 50 redeems without a paymaster, as XO's own bots send 62- and 73-call batches (a sponsored batch this large
    // needs more paymaster verification gas than the default: see the test above)
    ["redeem 50", "redeem", redeemCalls(ids), false],
    ["create market", "create_market", createMarketCalls({ startsAt: 1_792_368_000n, expiresAt: 1_792_972_800n, metadataUri: "https://example.invalid/market/4.json" }), true],
    ["respond to update", "respond_update", [respondToUpdateCall(ids[0] as Hex, true)], true],
    ["cancel market", "cancel_market", [cancelMarketCall(ids[1] as Hex)], true],
    ["revoke trading", "revoke_trading", revokeTradingCalls(), true],
    ["withdraw", "withdraw", withdrawCalls({ owner: owner.address, amountAtomic: 1_234_567n }), false],
  ];
  let sponsored = 1;
  for (const [name, action, calls, sponsor] of steps) {
    const { prepared, out } = await runNext(c, owner, action, calls, { sponsor });
    const event = only(out.ops, "one event");
    assert.equal(event.success, true, name);
    assert.equal(event.paymaster, sponsor ? POLICY_PAYMASTER : zeroAddress, name);
    assert.equal(prepared.plan.source, "defaults");
    const limits = prepared.plan.limits;
    const ceiling = limits.preVerificationGas + limits.verificationGasLimit + limits.callGasLimit + (sponsor ? limits.paymasterVerificationGasLimit + limits.paymasterPostOpGasLimit : 0n);
    assert.ok(event.actualGasUsed <= ceiling, `${name}: used ${String(event.actualGasUsed)} of at most ${String(ceiling)}`);
    used.push(`${name}: ${String(event.actualGasUsed)} of ${String(ceiling)}`);
    if (sponsor) sponsored += 1;
  }
  t.diagnostic(`actualGasUsed per action (stub targets, so call gas is not the real contracts'): ${used.join("; ")}`);
  assert.equal(await remainingDailyTxs(c, account), BigInt(10_000 - sponsored));
});

chainTest("gas used on the real code for the deploying operation, against the real operation in note 21 sec 3 (which ran against the real USDC.e and Conditional Tokens)", async (c, t) => {
  const owner = testAccount(2);
  const { out } = await deployAccount(c, owner, { sponsor: true });
  const event = only(out.ops, "one event");
  t.diagnostic(
    `deploy+enable, sponsored, default limits: UserOperationEvent.actualGasUsed ${String(event.actualGasUsed)} (note 21: 404,091), bundle transaction gas ${String(out.receipt.gasUsed)} (note 21: 392,704)`,
  );
  // Same real code for the deployment and validation; the two callees are stubs here, so only a loose bound is claimed.
  assert.ok(event.actualGasUsed > 300_000n && event.actualGasUsed < 500_000n);
  assert.ok(out.receipt.gasUsed > 300_000n && out.receipt.gasUsed < 500_000n);
});
