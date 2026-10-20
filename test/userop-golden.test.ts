// Golden test: rebuild 22 REAL on-chain XO user operations (public chain data, test/fixtures/userop/golden-ops.json)
// from semantic parameters with src/xo/userop/ and compare byte for byte. This is the TypeScript port of the
// researcher's 158 checks (docs/research/fixtures/gaps/userop-templates/test_templates.mjs): per operation a
// generic callData re-encoding, an action-specific builder, the nonce, the account (deployments only), the
// three packed fields and the hash. 9 checks per deployment, 7 per ordinary operation and 6 per redeem from
// the operator account (no action-specific builder for that one): 3 x 9 + 17 x 7 + 2 x 6 = 158.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, maxUint256, parseAbi, type Hex } from "viem";
import { getUserOperationHash } from "viem/account-abstraction";

import { deriveAccount, buildInitCode } from "../src/xo/account/derive.js";
import { ANVIL_ACCOUNT_0_OWNER, ENTRY_POINT_V07, XO_CHAIN_ID } from "../src/xo/chain/constants.js";
import {
  UserOpError,
  assertActionShape,
  createMarketCalls,
  decodeAllowedCall,
  decodeExecute,
  encodeExecute,
  enableTradingCalls,
  explicitGas,
  kernelNonce,
  normalizeSignature,
  packUserOp,
  prepareUserOp,
  redeemCall,
  redeemCalls,
  userOpHash,
  verifyUserOpSignature,
  type Call,
  type PackedUserOp,
} from "./fixtures/userop/api.js";
import { loadGolden, toPacked, type GoldenOp } from "./fixtures/userop/golden.js";

const golden = loadGolden();

// Split and merge have no builder in src/ (out of scope for v0.2, UO13); the golden test keeps its own so
// the 158 checks still cover the operator-account operations that use them.
const SPLIT_MERGE_ABI = parseAbi([
  "function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)",
  "function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)",
]);

const MASK64 = (1n << 64n) - 1n;
const MASK160 = (1n << 160n) - 1n;

// A second, hand-written v0.7 hash (never imported from src/).
function handHash(op: PackedUserOp): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }],
      [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData), op.accountGasLimits, op.preVerificationGas, op.gasFees, keccak256(op.paymasterAndData)],
    ),
  );
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], [inner, ENTRY_POINT_V07, BigInt(XO_CHAIN_ID)]));
}

// Real fields sliced out of the saved hex by hand, so the packer is not fed its own output.
function realFields(g: GoldenOp) {
  const ag = g.op.accountGasLimits.slice(2);
  const gf = g.op.gasFees.slice(2);
  const pm = g.op.paymasterAndData.slice(2);
  return {
    verificationGasLimit: BigInt(`0x${ag.slice(0, 32)}`),
    callGasLimit: BigInt(`0x${ag.slice(32)}`),
    maxPriorityFeePerGas: BigInt(`0x${gf.slice(0, 32)}`),
    maxFeePerGas: BigInt(`0x${gf.slice(32)}`),
    paymaster:
      pm.length === 0
        ? null
        : {
            address: getAddress(`0x${pm.slice(0, 40)}`),
            verificationGasLimit: BigInt(`0x${pm.slice(40, 72)}`),
            postOpGasLimit: BigInt(`0x${pm.slice(72, 104)}`),
          },
  };
}

function expectedChecks(g: GoldenOp): number {
  if (g.action.startsWith("operator_account")) return 6;
  return g.op.initCode !== "0x" ? 9 : 7;
}

function goldenChecks(g: GoldenOp): number {
  let count = 0;
  const tag = g.txHash.slice(0, 12);
  const check = (label: string, built: unknown, real: unknown): void => {
    assert.equal(String(built).toLowerCase(), String(real).toLowerCase(), `${tag} ${label}`);
    count += 1;
  };
  const op = g.op;
  const decoded = decodeExecute(op.callData);
  const inner: readonly Call[] = decoded.calls;

  // 1) generic ERC-7579 re-encoding of whatever the real operation did
  check("callData (generic encodeExecute)", encodeExecute(inner), op.callData);

  // 2) action-specific builders
  let specific: Call[] | null = null;
  if (g.action.startsWith("enableTrading")) {
    specific = enableTradingCalls();
  } else if (g.action.startsWith("redeemPositions")) {
    specific = inner.map((c) => {
      const d = decodeAllowedCall(c);
      assert.equal(d.kind, "ctf_redeem");
      return d.kind === "ctf_redeem" ? redeemCall(d.conditionId, d.indexSets) : c;
    });
  } else if (g.action === "mergePositions" || g.action === "splitPosition") {
    const call = inner[0] as Call;
    const { args } = decodeFunctionData({ abi: SPLIT_MERGE_ABI, data: call.data });
    const [collateral, parent, conditionId, partition, amount] = args as readonly [Hex, Hex, Hex, readonly bigint[], bigint];
    specific = [
      {
        to: call.to,
        value: 0n,
        data: encodeFunctionData({ abi: SPLIT_MERGE_ABI, functionName: g.action, args: [collateral, parent, conditionId, [...partition], amount] }),
      },
    ];
  } else if (g.action === "createConvictionMarket") {
    const d = decodeAllowedCall(inner[1] as Call);
    assert.equal(d.kind, "create_market");
    if (d.kind === "create_market") {
      specific = createMarketCalls({ startsAt: d.startsAt, expiresAt: d.expiresAt, metadataUri: d.metadataUri, allowance: maxUint256 });
    }
  }
  if (specific !== null) check(`callData (action builder ${g.action})`, encodeExecute(specific), op.callData);

  // 3) nonce, split by hand
  const nonce = BigInt(op.nonce);
  const identifier = `0x${((nonce >> 80n) & MASK160).toString(16).padStart(40, "0")}`;
  check("nonce", kernelNonce({ sequence: nonce & MASK64, key: Number((nonce >> 64n) & 0xffffn), validator: identifier }).toString(), nonce.toString());

  // 4) account deployment: initCode and sender from the owner
  if (op.initCode !== "0x") {
    assert.ok(g.owner, "a deployment fixture names its owner");
    check("initCode (buildInitCode(owner) from chain-account)", buildInitCode(g.owner as string), op.initCode);
    check("sender == deriveAccount(owner)", deriveAccount(g.owner as string), op.sender);
  }

  // 5) packed fields and the hash
  const fields = realFields(g);
  const built = packUserOp({
    sender: op.sender,
    nonce,
    initCode: op.initCode,
    callData: op.callData,
    verificationGasLimit: fields.verificationGasLimit,
    callGasLimit: fields.callGasLimit,
    preVerificationGas: BigInt(op.preVerificationGas),
    maxPriorityFeePerGas: fields.maxPriorityFeePerGas,
    maxFeePerGas: fields.maxFeePerGas,
    paymaster: fields.paymaster,
  });
  check("accountGasLimits", built.accountGasLimits, op.accountGasLimits);
  check("gasFees", built.gasFees, op.gasFees);
  check("paymasterAndData", built.paymasterAndData, op.paymasterAndData);
  const hash = userOpHash(built);
  check("userOpHash == event (or the hand-written hash when the saved log page is truncated)", hash, g.eventUserOpHash ?? handHash(built));

  // Not counted: three more independent routes to the same hash.
  assert.equal(hash, handHash(built), `${tag} hand-written hash`);
  assert.equal(hash, g.userOpHash.toLowerCase(), `${tag} fixture hash`);
  const viemHash = getUserOperationHash({
    chainId: XO_CHAIN_ID,
    entryPointAddress: ENTRY_POINT_V07,
    entryPointVersion: "0.7",
    userOperation: {
      sender: op.sender,
      nonce,
      callData: op.callData,
      callGasLimit: fields.callGasLimit,
      verificationGasLimit: fields.verificationGasLimit,
      preVerificationGas: BigInt(op.preVerificationGas),
      maxFeePerGas: fields.maxFeePerGas,
      maxPriorityFeePerGas: fields.maxPriorityFeePerGas,
      ...(op.initCode === "0x" ? {} : { factory: `0x${op.initCode.slice(2, 42)}` as Hex, factoryData: `0x${op.initCode.slice(42)}` as Hex }),
      ...(fields.paymaster === null
        ? {}
        : {
            paymaster: fields.paymaster.address,
            paymasterData: "0x" as Hex,
            paymasterVerificationGasLimit: fields.paymaster.verificationGasLimit,
            paymasterPostOpGasLimit: fields.paymaster.postOpGasLimit,
          }),
      signature: op.signature,
    },
  });
  assert.equal(hash, viemHash.toLowerCase(), `${tag} viem getUserOperationHash`);
  return count;
}

describe("golden rebuilds of 22 real operations", () => {
  it("the fixture holds the 22 operations of the research examples", () => {
    assert.equal(golden.ops.length, 22);
    assert.equal(golden.entryPoint, ENTRY_POINT_V07);
    assert.equal(golden.chainId, 3223);
    assert.equal(new Set(golden.ops.map((g) => g.txHash)).size, 22);
  });

  for (const g of golden.ops) {
    it(`${g.action} ${g.txHash.slice(0, 12)}`, () => {
      assert.equal(goldenChecks(g), expectedChecks(g));
    });
  }

  it("the checks add up to the researcher's 158", () => {
    const total = golden.ops.reduce((sum, g) => sum + expectedChecks(g), 0);
    assert.equal(total, 158);
    // The same total from the shape of the fixture: 3 deployments x 9, 2 operator redeems x 6, 17 others x 7.
    assert.equal(golden.ops.filter((g) => g.op.initCode !== "0x").length, 3);
    assert.equal(golden.ops.filter((g) => g.action.startsWith("operator_account")).length, 2);
    assert.equal(3 * 9 + 2 * 6 + 17 * 7, 158);
  });
});

describe("the real operations through the rest of the stack", () => {
  it("decode as canonical single or batch executions of the expected size", () => {
    for (const g of golden.ops) {
      const d = decodeExecute(g.op.callData);
      const expectedCalls: Record<string, number | undefined> = {
        enableTrading_firstOp_withAccountDeploy: 2,
        redeemPositions_single: 1,
        mergePositions: 1,
        splitPosition: 1,
        createConvictionMarket: 2,
        operator_account_raw_signature_redeem: 1,
      };
      if (g.action === "redeemPositions_batch_noPaymaster") {
        assert.ok(d.calls.length === 62 || d.calls.length === 73, `bot batches carry 62 or 73 redeems, got ${d.calls.length}`);
        assert.equal(d.mode, "batch");
      } else {
        assert.equal(d.calls.length, expectedCalls[g.action], g.action);
        assert.equal(d.mode, d.calls.length === 1 ? "single" : "batch");
      }
    }
  });

  it("every real signature is already canonical: 65 bytes, v 27 or 28, low s", () => {
    for (const g of golden.ops) {
      const n = normalizeSignature(g.op.signature);
      assert.equal(n.signature, g.op.signature.toLowerCase());
      assert.equal(n.rewroteV, false);
      assert.equal(n.flippedHighS, false);
    }
  });

  it("verifies the owner under the EIP-191 form for every XO-app operation (the raw form matches none)", async () => {
    let checked = 0;
    for (const g of golden.ops.filter((x) => x.owner !== null)) {
      const result = await verifyUserOpSignature({ op: toPacked(g), signature: g.op.signature, expectedOwner: g.owner as string });
      assert.ok(result.ok, `${g.txHash.slice(0, 12)} ${result.ok ? "" : result.message}`);
      if (result.ok) {
        assert.equal(result.form, "eip191", g.txHash);
        assert.equal(result.userOpHash, g.userOpHash);
        assert.equal(result.signedOp.signature, g.op.signature);
      }
      checked += 1;
    }
    assert.equal(checked, 14);
  });

  it("verifies XO's operator accounts under the RAW digest, with one stable signer per era", async () => {
    const operators = golden.ops.filter((g) => g.owner === null);
    assert.equal(operators.length, 8);
    for (const g of operators) {
      const op = toPacked(g);
      const result = await verifyUserOpSignature({ op, signature: g.op.signature, expectedOwner: g.operatorSigner as string, requireDerivedSender: false });
      assert.ok(result.ok, g.txHash);
      if (result.ok) assert.equal(result.form, "raw");
      // The operator account is not derived from its signer: with the default binding it is refused.
      const bound = await verifyUserOpSignature({ op, signature: g.op.signature, expectedOwner: g.operatorSigner as string });
      assert.ok(!bound.ok && bound.code === "sender_mismatch");
    }
    const signers = (action: string): Set<string> => new Set(operators.filter((g) => g.action === action).map((g) => g.operatorSigner as string));
    assert.equal(signers("mergePositions").size, 1);
    assert.equal(signers("splitPosition").size, 1);
    // the two raw-signature redeems come from the same account and signer as the merges
    assert.deepEqual([...signers("operator_account_raw_signature_redeem")], [...signers("mergePositions")]);
    assert.notDeepEqual([...signers("splitPosition")], [...signers("mergePositions")]);
  });

  it("rejects an operation's signature against another operation's owner", async () => {
    const [a, b] = golden.ops.filter((x) => x.owner !== null && x.op.initCode !== "0x");
    assert.ok(a && b && a.owner !== b.owner);
    const op = toPacked(a);
    const wrongOwner = await verifyUserOpSignature({ op, signature: a.op.signature, expectedOwner: b.owner as string, requireDerivedSender: false });
    assert.ok(!wrongOwner.ok && wrongOwner.code === "owner_mismatch");
    const swapped = await verifyUserOpSignature({ op, signature: b.op.signature, expectedOwner: a.owner as string });
    assert.ok(!swapped.ok && swapped.code === "owner_mismatch");
  });

  it("puts the real enable-trading, redeem, create calls on the closed list and refuses split and merge", () => {
    for (const g of golden.ops) {
      const calls = decodeExecute(g.op.callData).calls;
      const onList = calls.map((c) => {
        try {
          decodeAllowedCall(c);
          return true;
        } catch (error) {
          assert.ok(error instanceof UserOpError && error.code === "forbidden_call");
          return false;
        }
      });
      if (g.action === "splitPosition" || g.action === "mergePositions") assert.deepEqual(onList, [false], `${g.action} is out of scope`);
      else assert.ok(onList.every(Boolean), `${g.action} stays on the list`);
    }
  });

  it("maps every real shape to its action and refuses a wrong label", () => {
    for (const g of golden.ops) {
      const calls = decodeExecute(g.op.callData).calls;
      const owner = (g.owner ?? ANVIL_ACCOUNT_0_OWNER) as string;
      if (g.action.startsWith("enableTrading")) {
        assertActionShape("deploy_enable_trading", calls, owner);
        assert.throws(() => assertActionShape("revoke_trading", calls, owner), (e) => e instanceof UserOpError && e.code === "forbidden_call");
      } else if (g.action === "createConvictionMarket") {
        assertActionShape("create_market", calls, owner);
        assert.throws(() => assertActionShape("enable_trading", calls, owner), UserOpError);
      } else if (g.action === "redeemPositions_single") {
        assertActionShape("redeem", calls, owner);
        assert.throws(() => assertActionShape("cancel_market", calls, owner), UserOpError);
      }
    }
  });
});

describe("prepareUserOp rebuilds real operations exactly (with their own gas limits)", () => {
  function reproduce(g: GoldenOp) {
    const owner = g.owner as string;
    const f = realFields(g);
    const gas = explicitGas({
      verificationGasLimit: f.verificationGasLimit,
      callGasLimit: f.callGasLimit,
      preVerificationGas: BigInt(g.op.preVerificationGas),
      paymasterVerificationGasLimit: f.paymaster?.verificationGasLimit ?? 40_262n,
      paymasterPostOpGasLimit: f.paymaster?.postOpGasLimit ?? 26_478n,
    });
    const decoded = decodeExecute(g.op.callData).calls;
    const deploy = g.op.initCode !== "0x";
    let action: "deploy_enable_trading" | "redeem" | "create_market";
    let calls: Call[];
    if (g.action.startsWith("enableTrading")) {
      action = "deploy_enable_trading";
      calls = enableTradingCalls();
    } else if (g.action === "redeemPositions_single") {
      action = "redeem";
      calls = redeemCalls(
        decoded.map((c) => {
          const d = decodeAllowedCall(c);
          return d.kind === "ctf_redeem" ? d.conditionId : "0x";
        }) as Hex[],
      );
    } else {
      action = "create_market";
      const d = decodeAllowedCall(decoded[1] as Call);
      calls = d.kind === "create_market" ? createMarketCalls({ startsAt: d.startsAt, expiresAt: d.expiresAt, metadataUri: d.metadataUri, allowance: maxUint256 }) : [];
    }
    return prepareUserOp({ action, owner, calls, nonce: BigInt(g.op.nonce), deployed: !deploy, sponsor: f.paymaster !== null, gas });
  }

  for (const g of golden.ops.filter((x) => x.action === "enableTrading_firstOp_withAccountDeploy" || x.action === "redeemPositions_single" || x.action === "createConvictionMarket")) {
    it(`${g.action} ${g.txHash.slice(0, 12)}: same operation, same hash, raw intent over that hash`, () => {
      const p = reproduce(g);
      assert.equal(p.op.sender.toLowerCase(), g.op.sender);
      assert.equal(p.op.initCode, g.op.initCode);
      assert.equal(p.op.callData, g.op.callData);
      assert.equal(p.op.accountGasLimits, g.op.accountGasLimits);
      assert.equal(p.op.gasFees, g.op.gasFees);
      assert.equal(p.op.paymasterAndData, g.op.paymasterAndData);
      assert.equal(p.op.signature, "0x");
      assert.equal(p.userOpHash, g.userOpHash);
      assert.deepEqual(p.sign, { intent: { op: "raw", rawSigningPayloadHex: g.userOpHash }, expected_digest: g.userOpHash, digest_form: "userOpHash" });
      assert.equal(p.digestTag, g.userOpHash.slice(2, 18));
      assert.equal(p.deploys, g.op.initCode !== "0x");
    });
  }

  it("refuses the bots' 62- and 73-call redeem batches: the plugin caps one operation at 50 redeems", () => {
    const g = golden.ops.find((x) => x.action === "redeemPositions_batch_noPaymaster") as GoldenOp;
    const calls = decodeExecute(g.op.callData).calls;
    assert.ok(calls.length > 50);
    assert.throws(() => assertActionShape("redeem", calls, g.owner as string), (e) => e instanceof UserOpError && e.code === "forbidden_call");
  });
});
