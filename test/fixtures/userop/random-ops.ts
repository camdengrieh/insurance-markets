// Seeded random packed operations for property tests (never Math.random).

import { getAddress, type Hex } from "viem";

import { buildInitCode, deriveAccount } from "../../../src/xo/account/derive.js";
import { POLICY_PAYMASTER } from "../../../src/xo/chain/constants.js";
import { encodeExecute, kernelNonce, type Call, type UserOpFields } from "./api.js";
import type { Prng } from "./prng.js";

export function randomFields(rng: Prng, options: { deploy?: boolean; paymaster?: boolean } = {}): UserOpFields {
  const owner = getAddress(`0x${rng.hex(20)}`);
  const deploy = options.deploy ?? rng.below(2) === 0;
  const calls: Call[] = Array.from({ length: 1 + rng.below(3) }, () => ({
    to: getAddress(`0x${rng.hex(20)}`),
    value: 0n,
    data: `0x${rng.hex(rng.below(120))}` as Hex,
  }));
  return {
    sender: deriveAccount(owner),
    nonce: kernelNonce({ sequence: rng.bigint(40), key: rng.below(0x100) }),
    initCode: deploy ? buildInitCode(owner) : "0x",
    callData: encodeExecute(calls),
    verificationGasLimit: rng.bigint(40),
    callGasLimit: rng.bigint(40),
    preVerificationGas: rng.bigint(40),
    maxPriorityFeePerGas: rng.below(3) === 0 ? rng.bigint(30) : 0n,
    maxFeePerGas: rng.below(3) === 0 ? rng.bigint(30) : 0n,
    paymaster: (options.paymaster ?? rng.below(2) === 0) ? { address: POLICY_PAYMASTER, verificationGasLimit: rng.bigint(30), postOpGasLimit: rng.bigint(30) } : null,
  };
}
