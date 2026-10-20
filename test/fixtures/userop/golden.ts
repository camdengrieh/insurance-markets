// Loader for golden-ops.json: 22 real XO user operations (public on-chain data, see the file's _comment).

import { readFileSync } from "node:fs";

import type { Hex } from "viem";

import type { PackedUserOp } from "../../../src/xo/userop/pack.js";

export interface GoldenOp {
  readonly action: string;
  readonly txHash: Hex;
  readonly blockNumber: number;
  // Computed with a hand-written v0.7 hash when the fixture was made; equals the UserOperationEvent hash.
  readonly userOpHash: Hex;
  // The hash in the saved UserOperationEvent log, or null when the explorer page was truncated.
  readonly eventUserOpHash: Hex | null;
  // Owner known from the deployment initCode or an OwnerRegistered log; null for operator-run accounts.
  readonly owner: Hex | null;
  // For operator-run accounts: the address the RAW digest recovers to. It is the same across their ops.
  readonly operatorSigner: Hex | null;
  readonly signatureForm: "raw" | "eip191";
  readonly op: {
    readonly sender: Hex;
    readonly nonce: string;
    readonly initCode: Hex;
    readonly callData: Hex;
    readonly accountGasLimits: Hex;
    readonly preVerificationGas: string;
    readonly gasFees: Hex;
    readonly paymasterAndData: Hex;
    readonly signature: Hex;
  };
}

export interface GoldenFile {
  readonly _comment: string;
  readonly entryPoint: Hex;
  readonly chainId: number;
  readonly ops: readonly GoldenOp[];
}

export function loadGolden(): GoldenFile {
  return JSON.parse(readFileSync(new URL("./golden-ops.json", import.meta.url), "utf8")) as GoldenFile;
}

// The saved fields as a PackedUserOp (the signature is the real one).
export function toPacked(g: GoldenOp): PackedUserOp {
  return {
    sender: g.op.sender as PackedUserOp["sender"],
    nonce: BigInt(g.op.nonce),
    initCode: g.op.initCode,
    callData: g.op.callData,
    accountGasLimits: g.op.accountGasLimits,
    preVerificationGas: BigInt(g.op.preVerificationGas),
    gasFees: g.op.gasFees,
    paymasterAndData: g.op.paymasterAndData,
    signature: g.op.signature,
  };
}
