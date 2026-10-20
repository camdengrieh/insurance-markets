// Scenario helpers shared by the harness tests (and available to later streams that build on the
// harness): the calls XO's own app sends, a signed-op builder, a seeded generator, and the
// PolicyPaymaster owner's admin calls. All keys are the public Anvil test keys.

import { encodeFunctionData, getAddress, hexToBigInt, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";

import { deriveAccount, buildInitCode } from "../../src/xo/account/derive.js";
import {
  ACCOUNT_SALT,
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE,
  ENTRY_POINT_V07,
  GAS_DEFAULTS,
  POLICY_PAYMASTER,
  PAYMASTER_OWNER_OBSERVED,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
  XO_WARP_ROUTE,
  type GasDefaults,
} from "../../src/xo/chain/constants.js";
import { PAYMASTER_ADMIN_ABI, type XoChain } from "./chain.js";
import {
  encodeExecute,
  kernelNonce,
  packUserOp,
  signEip191,
  signRaw,
  userOpHash,
  withSignature,
  type Call,
  type PackedUserOp,
  type SigningAccount,
} from "./userop.js";

export const MAX_UINT256 = 2n ** 256n - 1n;

const ERC20_APPROVE_ABI = parseAbi(["function approve(address spender, uint256 value) returns (bool)", "function transfer(address to, uint256 value) returns (bool)"]);
const CTF_APPROVAL_ABI = parseAbi(["function setApprovalForAll(address operator, bool approved)"]);
const ROUTE_ABI = parseAbi(["function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32)"]);

export const approveCall = (spender: Address = CTF_EXCHANGE, amount: bigint = MAX_UINT256, token: Address = USDC_E_ADDRESS): Call => ({
  target: token,
  data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [spender, amount] }),
});

export const transferCall = (to: Address, amount: bigint, token: Address = USDC_E_ADDRESS): Call => ({
  target: token,
  data: encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "transfer", args: [to, amount] }),
});

export const setApprovalForAllCall = (operator: Address = CTF_EXCHANGE, approved = true): Call => ({
  target: CONDITIONAL_TOKENS,
  data: encodeFunctionData({ abi: CTF_APPROVAL_ABI, functionName: "setApprovalForAll", args: [operator, approved] }),
});

// XO's own "Enable Trading": one batch of USDC.e.approve(exchange, max) and CTF.setApprovalForAll(exchange, true).
export const enableTradingCalls = (): Call[] => [approveCall(), setApprovalForAllCall()];

// A call the PolicyPaymaster refuses (outbound transferRemote on the XO route).
export const transferRemoteCall = (): Call => ({
  target: XO_WARP_ROUTE,
  data: encodeFunctionData({ abi: ROUTE_ABI, functionName: "transferRemote", args: [8453, `0x${"00".repeat(32)}`, 1n] }),
});

export type OwnerAccount = SigningAccount & { readonly address: Address };

export interface SignedOpOptions {
  readonly owner: OwnerAccount;
  readonly chain: XoChain;
  readonly calls: readonly Call[];
  readonly sequence?: bigint;
  readonly key?: number;
  readonly validatorId?: Address;
  readonly init?: boolean;
  readonly sponsored?: boolean;
  readonly gas?: GasDefaults;
  readonly verificationGasLimit?: bigint;
  readonly callGasLimit?: bigint;
  readonly paymasterVerificationGasLimit?: bigint;
  readonly paymasterPostOpGasLimit?: bigint;
  readonly mode?: Hex;
  // "raw" signs the userOpHash as it is, "eip191" signs its personal_sign hash (what XO's app does).
  readonly signWith?: "raw" | "eip191" | "none";
  readonly signer?: OwnerAccount;
  readonly callData?: Hex;
  readonly initCode?: Hex;
}

export interface BuiltOp {
  readonly op: PackedUserOp;
  readonly unsigned: PackedUserOp;
  readonly hash: Hex;
  readonly account: Address;
}

export async function buildOp(options: SignedOpOptions): Promise<BuiltOp> {
  const account = deriveAccount(options.owner.address);
  const gas = options.gas ?? (options.init === true ? GAS_DEFAULTS.deployAndEnableTrading : GAS_DEFAULTS.enableTrading);
  const unsigned = packUserOp({
    sender: account,
    nonce: kernelNonce({ sequence: options.sequence ?? 0n, key: options.key ?? 0, ...(options.validatorId !== undefined ? { validator: options.validatorId } : {}) }),
    initCode: options.initCode ?? (options.init === true ? buildInitCode(options.owner.address) : "0x"),
    callData: options.callData ?? encodeExecute(options.calls, options.mode),
    verificationGasLimit: options.verificationGasLimit ?? gas.verificationGasLimit,
    callGasLimit: options.callGasLimit ?? gas.callGasLimit,
    preVerificationGas: gas.preVerificationGas,
    ...(options.sponsored === true
      ? {
          paymaster: {
            address: POLICY_PAYMASTER,
            verificationGasLimit: options.paymasterVerificationGasLimit ?? gas.paymasterVerificationGasLimit,
            postOpGasLimit: options.paymasterPostOpGasLimit ?? gas.paymasterPostOpGasLimit,
          },
        }
      : {}),
  });
  const hash = userOpHash(unsigned, { entryPoint: ENTRY_POINT_V07, chainId: options.chain.chainId });
  const how = options.signWith ?? "raw";
  if (how === "none") return { op: unsigned, unsigned, hash, account };
  const signer = options.signer ?? options.owner;
  const signature = how === "raw" ? await signRaw(signer, hash) : await signEip191(signer, hash);
  return { op: withSignature(unsigned, signature), unsigned, hash, account };
}

// The PolicyPaymaster's owner, impersonated on the local chain (no key exists or is needed).
export async function asPaymasterOwner<T>(chain: XoChain, body: (send: (functionName: string, args: readonly unknown[]) => Promise<void>) => Promise<T>): Promise<T> {
  await chain.anvil.rpc("anvil_impersonateAccount", [PAYMASTER_OWNER_OBSERVED]);
  await chain.anvil.rpc("anvil_setBalance", [PAYMASTER_OWNER_OBSERVED, toHex(10n ** 18n)]);
  try {
    return await body(async (functionName, args) => {
      const receipt = await chain.sendFrom(
        PAYMASTER_OWNER_OBSERVED,
        POLICY_PAYMASTER,
        encodeFunctionData({ abi: PAYMASTER_ADMIN_ABI, functionName: functionName as never, args: args as never }),
      );
      if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
    });
  } finally {
    await chain.anvil.rpc("anvil_stopImpersonatingAccount", [PAYMASTER_OWNER_OBSERVED]);
  }
}

// ---- a seeded generator (no Math.random, no clock) ---------------------------------------------------

export interface Seeded {
  word(): bigint;
  below(limit: number): number;
  bytes(length: number): Hex;
  address(): Address;
  pick<T>(items: readonly T[]): T;
}

// keccak256(seed ++ counter): deterministic, independent of the platform, and plenty uniform for tests.
export function seeded(seed: string): Seeded {
  let counter = 0n;
  const word = (): bigint => {
    counter += 1n;
    return hexToBigInt(keccak256(toHex(`${seed}:${counter.toString()}`)));
  };
  return {
    word,
    below: (limit) => Number(word() % BigInt(limit)),
    bytes: (length) => {
      let out = "";
      while (out.length < length * 2) out += word().toString(16).padStart(64, "0");
      return `0x${out.slice(0, length * 2)}` as Hex;
    },
    address: () => {
      const candidate = getAddress(`0x${(word() & ((1n << 160n) - 1n)).toString(16).padStart(40, "0")}`);
      return candidate;
    },
    pick: <T>(items: readonly T[]): T => items[Number(word() % BigInt(items.length))] as T,
  };
}

export const KERNEL_CHAIN_ID = XO_CHAIN_ID;
export { ACCOUNT_SALT };
