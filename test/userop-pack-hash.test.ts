// Packing, hashing, the mutation property, and prepareUserOp's rules.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress, keccak256, zeroAddress, type Hex } from "viem";
import { getUserOperationHash } from "viem/account-abstraction";

import { buildInitCode, deriveAccount } from "../src/xo/account/derive.js";
import {
  ANVIL_ACCOUNT_0_ACCOUNT,
  ANVIL_ACCOUNT_0_OWNER,
  ECDSA_VALIDATOR,
  ENTRY_POINT_V07,
  GAS_DEFAULTS,
  KERNEL_FACTORY,
  MARKET_MANAGER,
  POLICY_PAYMASTER,
  USEROP_INIT_CODE_BYTES,
  XO_CHAIN_ID,
  XO_WARP_ROUTE,
} from "../src/xo/chain/constants.js";
import { checkPreparedSign, digestTag, toPayboxIntent, toPayboxSignArgs } from "../src/relay/contract.js";
import {
  UserOpError,
  assertPackedStructure,
  assertXoShape,
  cancelMarketCall,
  createMarketCalls,
  enableTradingCalls,
  firstOpNonce,
  kernelNonce,
  packGasPair,
  packPaymasterAndData,
  packUserOp,
  packedFromJson,
  packedToJson,
  prepareUserOp,
  redeemCalls,
  respondToUpdateCall,
  revokeTradingCalls,
  signingDigests,
  unpackGasPair,
  unpackPaymasterAndData,
  unpackUserOp,
  userOpHash,
  userOpHashUnder,
  verifyUserOpSignature,
  withSignature,
  withdrawCalls,
  type PackedUserOp,
  type UserOpFields,
} from "./fixtures/userop/api.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { randomFields } from "./fixtures/userop/random-ops.js";
import { seededRandom } from "./fixtures/userop/prng.js";

function refused(run: () => unknown, code?: string, message?: RegExp): void {
  assert.throws(
    run,
    (error: unknown) => error instanceof UserOpError && (code === undefined || error.code === code) && (message === undefined || message.test(error.message)),
    `${code ?? "a UserOpError"} ${message ?? ""}`,
  );
}

const hex32 = (n: bigint): string => n.toString(16).padStart(32, "0");

describe("packing", () => {
  it("accountGasLimits and gasFees are two 16-byte halves, high first (hand-built)", () => {
    const rng = seededRandom(31);
    for (let i = 0; i < 50; i += 1) {
      const f = randomFields(rng);
      const packed = packUserOp(f);
      assert.equal(packed.accountGasLimits, `0x${hex32(f.verificationGasLimit)}${hex32(f.callGasLimit)}`);
      assert.equal(packed.gasFees, `0x${hex32(f.maxPriorityFeePerGas)}${hex32(f.maxFeePerGas)}`);
      assert.equal(
        packed.paymasterAndData,
        f.paymaster === null ? "0x" : `0x${POLICY_PAYMASTER.slice(2).toLowerCase()}${hex32(f.paymaster.verificationGasLimit)}${hex32(f.paymaster.postOpGasLimit)}`,
      );
      assert.equal(packed.paymasterAndData === "0x" ? 0 : (packed.paymasterAndData.length - 2) / 2, f.paymaster === null ? 0 : 52);
    }
  });

  it("unpackUserOp inverts packUserOp for 100 random operations", () => {
    const rng = seededRandom(32);
    for (let i = 0; i < 100; i += 1) {
      const f = randomFields(rng);
      assert.deepEqual(unpackUserOp(packUserOp(f)), { ...f, signature: "0x" });
    }
  });

  it("the gas halves reach the uint128 limit and not beyond", () => {
    const max = (1n << 128n) - 1n;
    assert.deepEqual(unpackGasPair(packGasPair(max, 0n)), [max, 0n]);
    assert.deepEqual(unpackGasPair(packGasPair(0n, max)), [0n, max]);
    refused(() => packGasPair(max + 1n, 0n), "invalid_integer");
    refused(() => packGasPair(0n, -1n), "invalid_integer");
    refused(() => unpackGasPair("0x00"), "invalid_hex");
  });

  it("the paymaster is the pinned PolicyPaymaster and paymasterData is empty", () => {
    assert.equal(packPaymasterAndData({ address: POLICY_PAYMASTER, verificationGasLimit: 1n, postOpGasLimit: 2n }).length, 2 + 104);
    refused(() => packPaymasterAndData({ address: ANVIL_ACCOUNT_0_OWNER, verificationGasLimit: 1n, postOpGasLimit: 2n }), "sponsorship_refused");
    refused(() => packPaymasterAndData({ address: zeroAddress, verificationGasLimit: 1n, postOpGasLimit: 2n }), "sponsorship_refused");
    assert.equal(unpackPaymasterAndData("0x"), null);
    refused(() => unpackPaymasterAndData(`${packPaymasterAndData({ address: POLICY_PAYMASTER, verificationGasLimit: 1n, postOpGasLimit: 2n })}00`), "invalid_userop");
    refused(() => unpackPaymasterAndData("0x1234"), "invalid_userop");
  });

  it("refuses shapes XO's stack does not accept", () => {
    const rng = seededRandom(33);
    const base = randomFields(rng, { deploy: true, paymaster: true });
    packUserOp(base);
    const initCode = base.initCode;
    refused(() => packUserOp({ ...base, initCode: initCode.slice(0, initCode.length - 2) as Hex }), "invalid_userop");
    refused(() => packUserOp({ ...base, initCode: `${initCode}00` as Hex }), "invalid_userop");
    refused(() => packUserOp({ ...base, initCode: `0x${"11".repeat(20)}${initCode.slice(42)}` as Hex }), "invalid_userop"); // another factory
    refused(() => packUserOp({ ...base, initCode: `${initCode.slice(0, 42)}12345678${initCode.slice(50)}` as Hex }), "invalid_userop"); // another selector
    refused(() => packUserOp({ ...base, callData: "0x12345678" }), "invalid_userop");
    refused(() => packUserOp({ ...base, callData: "0x" }), "invalid_userop");
    refused(() => packUserOp({ ...base, signature: `0x${"11".repeat(64)}` }), "invalid_userop");
    refused(() => packUserOp({ ...base, signature: `0x${"11".repeat(66)}` }), "invalid_userop");
    refused(() => packUserOp({ ...base, sender: "0x1234" as Hex }), "invalid_address");
    refused(() => packUserOp({ ...base, nonce: 1n << 256n }), "invalid_integer");
    refused(() => packUserOp({ ...base, preVerificationGas: -1n }), "invalid_integer");
    refused(() => packUserOp({ ...base, maxFeePerGas: 1n << 128n }), "invalid_integer");
    refused(() => packUserOp({ ...base, paymaster: { address: POLICY_PAYMASTER, verificationGasLimit: 1n << 128n, postOpGasLimit: 0n } }), "invalid_integer");
    assert.equal(packUserOp({ ...base, signature: `0x${"11".repeat(65)}` }).signature.length, 132);
  });

  it("the structural check is looser than the XO check, on purpose", () => {
    const packed = packUserOp(randomFields(seededRandom(34), { paymaster: true }));
    const foreign: PackedUserOp = { ...packed, paymasterAndData: `0x${"22".repeat(52)}` };
    assertPackedStructure(foreign);
    refused(() => assertXoShape(foreign), "sponsorship_refused");
    refused(() => assertPackedStructure({ ...packed, accountGasLimits: "0x1234" as Hex }), "invalid_hex");
    refused(() => assertPackedStructure(null as unknown as PackedUserOp), "invalid_userop");
  });

  it("round-trips through the JSON form a store uses, and refuses a tampered one", () => {
    const rng = seededRandom(35);
    for (let i = 0; i < 20; i += 1) {
      const packed = packUserOp(randomFields(rng));
      const json = JSON.parse(JSON.stringify(packedToJson(packed))) as ReturnType<typeof packedToJson>;
      assert.deepEqual(packedFromJson(json), packed);
      assert.equal(userOpHash(packedFromJson(json)), userOpHash(packed));
    }
    const json = packedToJson(packUserOp(randomFields(rng)));
    refused(() => packedFromJson({ ...json, nonce: "0x10" }), "invalid_integer");
    refused(() => packedFromJson({ ...json, nonce: "01" }), "invalid_integer");
    refused(() => packedFromJson({ ...json, preVerificationGas: "-1" }), "invalid_integer");
    refused(() => packedFromJson({ ...json, callData: "0x12345678" }), "invalid_userop");
    refused(() => packedFromJson(null as unknown as typeof json), "invalid_userop");
  });

  it("withSignature attaches a 65-byte signature and nothing else", () => {
    const packed = packUserOp(randomFields(seededRandom(36)));
    const signed = withSignature(packed, `0x${"ab".repeat(65)}`);
    assert.equal(signed.signature, `0x${"ab".repeat(65)}`);
    assert.deepEqual({ ...signed, signature: "0x" }, packed);
    refused(() => withSignature(packed, `0x${"ab".repeat(64)}`), "invalid_userop");
  });
});

describe("userOpHash", () => {
  it("equals viem's own getUserOperationHash for 100 random operations (seeded)", () => {
    const rng = seededRandom(41);
    for (let i = 0; i < 100; i += 1) {
      const f = randomFields(rng);
      const packed = packUserOp(f);
      const viemHash = getUserOperationHash({
        chainId: XO_CHAIN_ID,
        entryPointAddress: ENTRY_POINT_V07,
        entryPointVersion: "0.7",
        userOperation: {
          sender: f.sender,
          nonce: f.nonce,
          callData: f.callData,
          callGasLimit: f.callGasLimit,
          verificationGasLimit: f.verificationGasLimit,
          preVerificationGas: f.preVerificationGas,
          maxFeePerGas: f.maxFeePerGas,
          maxPriorityFeePerGas: f.maxPriorityFeePerGas,
          ...(f.initCode === "0x" ? {} : { factory: `0x${f.initCode.slice(2, 42)}` as Hex, factoryData: `0x${f.initCode.slice(42)}` as Hex }),
          ...(f.paymaster === null
            ? {}
            : { paymaster: f.paymaster.address, paymasterData: "0x" as Hex, paymasterVerificationGasLimit: f.paymaster.verificationGasLimit, paymasterPostOpGasLimit: f.paymaster.postOpGasLimit }),
          signature: "0x",
        },
      });
      assert.equal(userOpHash(packed), viemHash.toLowerCase(), `op ${i}`);
    }
  });

  it("commits to the chain and the EntryPoint, and ignores the signature", () => {
    const packed = packUserOp(randomFields(seededRandom(42), { paymaster: true }));
    const h = userOpHash(packed);
    assert.equal(userOpHashUnder(packed, ENTRY_POINT_V07, BigInt(XO_CHAIN_ID)), h);
    assert.notEqual(userOpHashUnder(packed, ENTRY_POINT_V07, 8453n), h);
    assert.notEqual(userOpHashUnder(packed, ENTRY_POINT_V07, 1n), h);
    assert.notEqual(userOpHashUnder(packed, ANVIL_ACCOUNT_0_OWNER, BigInt(XO_CHAIN_ID)), h);
    assert.equal(userOpHash({ ...packed, signature: `0x${"cd".repeat(65)}` }), h);
    assert.match(h, /^0x[0-9a-f]{64}$/);
  });

  it("hashes paymasterAndData in full, including the two gas limits", () => {
    const f = randomFields(seededRandom(43), { paymaster: true });
    const a = userOpHash(packUserOp(f));
    const b = userOpHash(packUserOp({ ...f, paymaster: { ...(f.paymaster as NonNullable<UserOpFields["paymaster"]>), postOpGasLimit: (f.paymaster?.postOpGasLimit ?? 0n) + 1n } }));
    const c = userOpHash(packUserOp({ ...f, paymaster: null }));
    assert.equal(new Set([a, b, c]).size, 3);
  });

  it("the two signing digests are the hash itself and its EIP-191 form", () => {
    const h = userOpHash(packUserOp(randomFields(seededRandom(44))));
    const d = signingDigests(h);
    assert.equal(d.raw, h);
    assert.equal(d.eip191, keccak256(`0x19457468657265756d205369676e6564204d6573736167653a0a3332${h.slice(2)}`));
    assert.notEqual(d.eip191, d.raw);
  });
});

// The owner is public Anvil account 0; its keys are in test/fixtures/userop/anvil-test-keys.ts.
const OWNER_ACCOUNT = ANVIL_TEST_ACCOUNTS[0] as (typeof ANVIL_TEST_ACCOUNTS)[number];

function preparedDeploy(sponsor = true) {
  return prepareUserOp({
    action: "deploy_enable_trading",
    owner: OWNER_ACCOUNT.address,
    calls: enableTradingCalls(),
    nonce: firstOpNonce(),
    deployed: false,
    sponsor,
  });
}

describe("prepareUserOp", () => {
  it("builds the deploying operation: the account derived from the owner, initCode from chain-account, first nonce", () => {
    const p = preparedDeploy();
    assert.equal(OWNER_ACCOUNT.address, ANVIL_ACCOUNT_0_OWNER);
    assert.equal(p.account, ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(p.op.sender, ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(p.op.initCode, buildInitCode(OWNER_ACCOUNT.address));
    assert.equal((p.op.initCode.length - 2) / 2, USEROP_INIT_CODE_BYTES);
    assert.equal(p.op.initCode.slice(0, 42), KERNEL_FACTORY.toLowerCase());
    assert.equal(p.op.nonce, firstOpNonce());
    assert.equal(p.deploys, true);
    assert.equal(p.sponsored, true);
    assert.equal(p.op.signature, "0x");
  });

  it("every Anvil owner's deploying operation carries exactly buildInitCode(owner) and its own derived sender", () => {
    const seen = new Set<string>();
    for (const account of ANVIL_TEST_ACCOUNTS) {
      const p = prepareUserOp({ action: "deploy_enable_trading", owner: account.address, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true });
      assert.equal(p.op.initCode, buildInitCode(account.address));
      assert.equal(p.op.sender, deriveAccount(account.address));
      seen.add(p.op.sender);
      seen.add(p.userOpHash);
    }
    assert.equal(seen.size, 20, "ten distinct accounts and ten distinct hashes");
  });

  it("uses zero fees, the pinned paymaster and the observed gas limits for a deployment", () => {
    const p = preparedDeploy();
    const d = unpackUserOp(p.op);
    assert.equal(d.maxFeePerGas, 0n);
    assert.equal(d.maxPriorityFeePerGas, 0n);
    assert.equal(p.op.gasFees, `0x${"00".repeat(32)}`);
    assert.equal(d.paymaster?.address, POLICY_PAYMASTER);
    assert.equal(d.paymaster?.verificationGasLimit, GAS_DEFAULTS.deployAndEnableTrading.paymasterVerificationGasLimit);
    assert.equal(d.paymaster?.postOpGasLimit, GAS_DEFAULTS.deployAndEnableTrading.paymasterPostOpGasLimit);
    assert.equal(d.verificationGasLimit, 297_342n);
    assert.equal(d.callGasLimit, 74_916n);
    assert.ok(d.preVerificationGas >= 56_214n, "never below the observed figure");
    assert.equal(p.plan.source, "defaults");
    assert.equal(p.plan.basis, "observed");
  });

  it("without a paymaster the operation says so", () => {
    const p = preparedDeploy(false);
    assert.equal(p.op.paymasterAndData, "0x");
    assert.equal(p.sponsored, false);
  });

  it("hands PayBox a raw intent over the userOpHash and keeps the expected digest on the relay side", () => {
    const p = preparedDeploy();
    assert.equal(p.userOpHash, userOpHash(p.op));
    assert.deepEqual(p.sign, { intent: { op: "raw", rawSigningPayloadHex: p.userOpHash }, expected_digest: p.userOpHash, digest_form: "userOpHash" });
    assert.deepEqual(checkPreparedSign(p.sign), { ok: true });
    assert.deepEqual(toPayboxIntent(p.sign), { op: "raw", rawSigningPayloadHex: p.userOpHash });
    assert.deepEqual(toPayboxSignArgs("credential-1", p.sign), { credential_id: "credential-1", intent: { op: "raw", rawSigningPayloadHex: p.userOpHash } });
    assert.equal(p.digestTag, digestTag(p.userOpHash));
    assert.equal(p.digestTag.length, 16);
    assert.equal(p.digestTag, p.userOpHash.slice(2, 18));
  });

  it("is deterministic", () => {
    assert.deepEqual(preparedDeploy().op, preparedDeploy().op);
    assert.equal(preparedDeploy().userOpHash, preparedDeploy().userOpHash);
  });

  it("derives the account itself: a supplied account must match, and is never used", () => {
    const mk = (suppliedAccount: string | null) =>
      prepareUserOp({ action: "deploy_enable_trading", owner: ANVIL_ACCOUNT_0_OWNER, suppliedAccount, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true });
    assert.equal(mk(ANVIL_ACCOUNT_0_ACCOUNT).account, ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(mk(ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase()).account, ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(mk(null).account, ANVIL_ACCOUNT_0_ACCOUNT);
    refused(() => mk(ANVIL_ACCOUNT_0_OWNER), "sender_mismatch"); // the owner EOA is not the account
    refused(() => mk(deriveAccount((ANVIL_TEST_ACCOUNTS[1] as (typeof ANVIL_TEST_ACCOUNTS)[number]).address)), "sender_mismatch");
    refused(() => mk(MARKET_MANAGER), "sender_mismatch");
    refused(() => mk("0x1234"), "invalid_address");
  });

  it("refuses an owner that is not a wallet", () => {
    const mk = (owner: string) => prepareUserOp({ action: "deploy_enable_trading", owner, calls: enableTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true });
    refused(() => mk(zeroAddress), "invalid_address");
    refused(() => mk(MARKET_MANAGER), "invalid_address");
    refused(() => mk(XO_WARP_ROUTE), "invalid_address");
    refused(() => mk("not an address"), "invalid_address");
  });

  it("deploys exactly when the account is not deployed, and only as deploy_enable_trading", () => {
    const enable = (deployed: boolean, action: "deploy_enable_trading" | "enable_trading") =>
      prepareUserOp({ action, owner: ANVIL_ACCOUNT_0_OWNER, calls: enableTradingCalls(), nonce: deployed ? kernelNonce({ sequence: 1n }) : firstOpNonce(), deployed, sponsor: true });
    assert.equal(enable(true, "enable_trading").op.initCode, "0x");
    assert.equal(enable(true, "enable_trading").deploys, false);
    refused(() => enable(false, "enable_trading"), "invalid_userop", /not deployed: the first operation must be deploy_enable_trading/);
    refused(() => enable(true, "deploy_enable_trading"), "invalid_userop", /already deployed/);
    refused(
      () => prepareUserOp({ action: "redeem", owner: ANVIL_ACCOUNT_0_OWNER, calls: redeemCalls([`0x${"11".repeat(32)}`]), nonce: firstOpNonce(), deployed: false, sponsor: true }),
      "invalid_userop",
      /first operation must be deploy_enable_trading/,
    );
    refused(
      () => prepareUserOp({ action: "revoke_trading", owner: ANVIL_ACCOUNT_0_OWNER, calls: revokeTradingCalls(), nonce: firstOpNonce(), deployed: false, sponsor: true }),
      "invalid_userop",
    );
  });

  it("a deploying operation needs the first-operation nonce; every nonce must be in the default root lane", () => {
    const mk = (nonce: bigint, deployed: boolean) =>
      prepareUserOp({ action: deployed ? "enable_trading" : "deploy_enable_trading", owner: ANVIL_ACCOUNT_0_OWNER, calls: enableTradingCalls(), nonce, deployed, sponsor: true });
    refused(() => mk(kernelNonce({ sequence: 1n }), false), "invalid_nonce");
    refused(() => mk(kernelNonce({ key: 1, sequence: 0n }), false), "invalid_nonce");
    refused(() => mk(kernelNonce({ mode: 1, sequence: 5n }), true), "invalid_nonce");
    refused(() => mk(kernelNonce({ validator: zeroAddress, sequence: 5n }), true), "invalid_nonce");
    refused(() => mk(kernelNonce({ type: 1, sequence: 5n }), true), "invalid_nonce");
    assert.equal(mk(kernelNonce({ key: 0x32, sequence: 5n }), true).op.nonce, kernelNonce({ key: 0x32, sequence: 5n }));
    assert.equal(kernelNonce({ sequence: 0n }), BigInt(`0x${ECDSA_VALIDATOR.slice(2)}${"00".repeat(10)}`));
  });

  it("refuses calls that do not belong to the action, and anything outside the closed list", () => {
    const base = { owner: ANVIL_ACCOUNT_0_OWNER, nonce: kernelNonce({ sequence: 3n }), deployed: true, sponsor: true };
    refused(() => prepareUserOp({ ...base, action: "redeem", calls: enableTradingCalls() }), "forbidden_call");
    refused(() => prepareUserOp({ ...base, action: "enable_trading", calls: revokeTradingCalls() }), "forbidden_call");
    refused(() => prepareUserOp({ ...base, action: "cancel_market", calls: [respondToUpdateCall(`0x${"11".repeat(32)}`, true)] }), "forbidden_call");
    refused(() => prepareUserOp({ ...base, action: "cancel_market", calls: [{ to: MARKET_MANAGER, value: 0n, data: "0x4cbe35ee" }] }), "forbidden_call");
    refused(() => prepareUserOp({ ...base, action: "cancel_market", calls: [{ ...cancelMarketCall(`0x${"11".repeat(32)}`), value: 1n }] }), "forbidden_call");
    refused(() => prepareUserOp({ ...base, action: "cancel_market", calls: [] }), "invalid_call");
    assert.equal(prepareUserOp({ ...base, action: "cancel_market", calls: [cancelMarketCall(`0x${"11".repeat(32)}`)] }).decoded[0]?.kind, "cancel_market");
  });

  it("never sponsors a withdrawal (the paymaster refuses transferRemote) and builds it without a paymaster", () => {
    const base = { action: "withdraw" as const, owner: ANVIL_ACCOUNT_0_OWNER, calls: withdrawCalls({ owner: ANVIL_ACCOUNT_0_OWNER, amountAtomic: 5_000_000n }), nonce: kernelNonce({ sequence: 9n }), deployed: true };
    refused(() => prepareUserOp({ ...base, sponsor: true }), "sponsorship_refused", /send without a paymaster/);
    const p = prepareUserOp({ ...base, sponsor: false });
    assert.equal(p.op.paymasterAndData, "0x");
    assert.equal(p.sponsored, false);
    assert.equal(p.plan.basis, "unobserved");
    // a withdrawal to somebody else's address is not the owner's withdrawal
    refused(
      () => prepareUserOp({ ...base, sponsor: false, calls: withdrawCalls({ owner: (ANVIL_TEST_ACCOUNTS[2] as (typeof ANVIL_TEST_ACCOUNTS)[number]).address, amountAtomic: 5_000_000n }) }),
      "forbidden_call",
    );
  });

  it("the other actions prepare with their own call shapes (smoke)", () => {
    const base = { owner: ANVIL_ACCOUNT_0_OWNER, nonce: kernelNonce({ sequence: 4n }), deployed: true, sponsor: true };
    const create = prepareUserOp({ ...base, action: "create_market", calls: createMarketCalls({ startsAt: 100n, expiresAt: 200n, metadataUri: "https://example.invalid/m.json" }) });
    assert.equal(create.decoded[1]?.kind, "create_market");
    assert.equal(unpackUserOp(create.op).callGasLimit, GAS_DEFAULTS.createMarket.callGasLimit);
    const redeem = prepareUserOp({ ...base, action: "redeem", calls: redeemCalls([`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, `0x${"33".repeat(32)}`]) });
    assert.equal(unpackUserOp(redeem.op).callGasLimit, 126_186n + 35_000n * 2n + 100_000n);
    const respond = prepareUserOp({ ...base, action: "respond_update", calls: [respondToUpdateCall(`0x${"11".repeat(32)}`, false)] });
    assert.equal(respond.plan.basis, "unobserved");
    const revoke = prepareUserOp({ ...base, action: "revoke_trading", calls: revokeTradingCalls() });
    assert.equal(revoke.decoded.length, 2);
  });
});

describe("mutation: any changed byte changes the hash and the verifier rejects", () => {
  // Public Anvil account 0 signs the unsigned operation, in each of the two digest forms.
  async function signed(p: ReturnType<typeof preparedDeploy>, form: "raw" | "eip191") {
    const signature = form === "raw" ? await OWNER_ACCOUNT.sign({ hash: p.userOpHash }) : await OWNER_ACCOUNT.signMessage({ message: { raw: p.userOpHash } });
    return signature;
  }

  function flipHex(hex: string, byteIndex: number): string {
    const body = hex.slice(2);
    const flipped = (Number.parseInt(body.slice(byteIndex * 2, byteIndex * 2 + 2), 16) ^ 0x01).toString(16).padStart(2, "0");
    return `0x${body.slice(0, byteIndex * 2)}${flipped}${body.slice(byteIndex * 2 + 2)}`;
  }

  // Every field of the packed operation, as hex, with a function that rebuilds the operation from a changed hex.
  const FIELDS: readonly { name: string; get: (op: PackedUserOp) => string; set: (op: PackedUserOp, hex: string) => PackedUserOp }[] = [
    { name: "sender", get: (op) => op.sender.toLowerCase(), set: (op, hex) => ({ ...op, sender: getAddress(hex) }) },
    { name: "nonce", get: (op) => `0x${op.nonce.toString(16).padStart(64, "0")}`, set: (op, hex) => ({ ...op, nonce: BigInt(hex) }) },
    { name: "initCode", get: (op) => op.initCode, set: (op, hex) => ({ ...op, initCode: hex as Hex }) },
    { name: "callData", get: (op) => op.callData, set: (op, hex) => ({ ...op, callData: hex as Hex }) },
    { name: "accountGasLimits", get: (op) => op.accountGasLimits, set: (op, hex) => ({ ...op, accountGasLimits: hex as Hex }) },
    { name: "preVerificationGas", get: (op) => `0x${op.preVerificationGas.toString(16).padStart(64, "0")}`, set: (op, hex) => ({ ...op, preVerificationGas: BigInt(hex) }) },
    { name: "gasFees", get: (op) => op.gasFees, set: (op, hex) => ({ ...op, gasFees: hex as Hex }) },
    { name: "paymasterAndData", get: (op) => op.paymasterAndData, set: (op, hex) => ({ ...op, paymasterAndData: hex as Hex }) },
  ];

  for (const form of ["eip191", "raw"] as const) {
    it(`flipping each byte of every hashed field of a deploying operation (${form}-signed) changes the hash and fails verification`, async () => {
      const p = preparedDeploy();
      const signature = await signed(p, form);
      const good = await verifyUserOpSignature({ op: p.op, signature, expectedOwner: OWNER_ACCOUNT.address });
      assert.ok(good.ok && good.form === form, "the untouched operation verifies in the form it was signed");
      let flips = 0;
      for (const field of FIELDS) {
        const original = field.get(p.op);
        const bytes = (original.length - 2) / 2;
        for (let i = 0; i < bytes; i += 1) {
          const mutated = field.set(p.op, flipHex(original, i));
          assert.notEqual(userOpHash(mutated), p.userOpHash, `${field.name}[${i}] must change the hash`);
          const result = await verifyUserOpSignature({ op: mutated, signature, expectedOwner: OWNER_ACCOUNT.address });
          assert.equal(result.ok, false, `${field.name}[${i}] must fail verification`);
          // For these fields the shape is untouched, so the SIGNATURE is what stops the operation.
          const signatureOnly = ["nonce", "accountGasLimits", "preVerificationGas", "gasFees"].includes(field.name) || (field.name === "callData" && i >= 4);
          if (signatureOnly && !result.ok) assert.equal(result.code, "owner_mismatch", `${field.name}[${i}]`);
          flips += 1;
        }
      }
      // sender 20 + nonce 32 + initCode 440 + callData + 2 x 32 gas words + pvg 32 + paymasterAndData 52
      assert.equal(flips, 20 + 32 + 440 + (p.op.callData.length - 2) / 2 + 32 + 32 + 32 + 52);
    });
  }

  it("control: re-signing a changed operation makes it verify, so the rejections above are about the signature", async () => {
    const p = preparedDeploy();
    for (const field of FIELDS.filter((f) => ["nonce", "accountGasLimits", "preVerificationGas", "gasFees", "callData"].includes(f.name))) {
      const original = field.get(p.op);
      for (const i of [(original.length - 2) / 2 - 1, 5, 17]) {
        if (i < 0 || i >= (original.length - 2) / 2) continue;
        const mutated = field.set(p.op, flipHex(original, i));
        const hash = userOpHash(mutated);
        const result = await verifyUserOpSignature({ op: mutated, signature: await OWNER_ACCOUNT.signMessage({ message: { raw: hash } }), expectedOwner: OWNER_ACCOUNT.address });
        if (field.name === "callData" && i < 4) continue;
        assert.ok(result.ok, `${field.name}[${i}] re-signed`);
      }
    }
  });

  it("flipping any byte of the 65-byte signature fails verification", async () => {
    const p = preparedDeploy();
    const signature = await signed(p, "eip191");
    for (let i = 0; i < 65; i += 1) {
      const result = await verifyUserOpSignature({ op: p.op, signature: flipHex(signature, i), expectedOwner: OWNER_ACCOUNT.address });
      assert.equal(result.ok, false, `signature byte ${i}`);
    }
  });

  it("the signature is not part of the hash: a re-signed operation has the same hash", async () => {
    const p = preparedDeploy();
    const a = withSignature(p.op, await signed(p, "raw"));
    const b = withSignature(p.op, await signed(p, "eip191"));
    assert.notEqual(a.signature, b.signature);
    assert.equal(userOpHash(a), userOpHash(b));
    assert.equal(userOpHash(a), p.userOpHash);
  });
});
