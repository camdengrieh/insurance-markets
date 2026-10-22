// Deterministic XO smart-account derivation: the account is a pure function of the owner address.
//
//   initData(owner) = initialize(0x01 || ECDSA_VALIDATOR, address(0), owner, 0x, [])      (292 bytes)
//   account         = CREATE2(KERNEL_FACTORY, keccak256(initData ++ bytes32(0)), ERC1967_INIT_CODE_HASH)
//
// Source: docs/research/19-smart-account-derivation.md sec 5 (Kernel v3.1 KernelFactory.getAddress,
// 2,627 of 2,627 on-chain accounts re-derive; the live Base factory agrees) and the spec's Appendix A.4.
// Index 0 only: one account per owner (AD9). Nothing here reads the network or a clock, and nothing
// accepts an account address from outside without comparing it to this derivation (AD1).

import { concat, encodeAbiParameters, encodeFunctionData, getAddress, getCreate2Address, isAddress, keccak256, zeroAddress } from "viem";

import { KERNEL_ABI, KERNEL_FACTORY_ABI } from "../../../chain/xo/abi.js";
import {
  ACCOUNT_SALT,
  ECDSA_VALIDATOR,
  ECDSA_VALIDATOR_OWNER_MAPPING_SLOT,
  ERC1967_CREATION_MIDDLE,
  ERC1967_CREATION_PREFIX,
  ERC1967_INIT_CODE_HASH,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  KERNEL_PROXY_RUNTIME_CODE,
  PINNED_CONTRACTS,
  ROOT_VALIDATOR_TYPE_BYTE,
  type Address,
  type Hex,
} from "../../../chain/xo/constants.js";


export type AccountErrorCode =
  | "invalid_address" // not a 20-byte hex address, or a mixed-case string with a bad EIP-55 checksum
  | "zero_owner" // the zero address cannot own an account
  | "protocol_contract_owner" // the owner is a pinned protocol contract (never a wallet)
  | "account_mismatch" // a supplied account differs from the one derived from the owner
  | "account_is_owner"; // the supplied "account" is the owner EOA itself

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.name = "AccountError";
    this.code = code;
  }
}

const PROTOCOL_ADDRESSES: ReadonlySet<string> = new Set(PINNED_CONTRACTS.map((c) => c.address.toLowerCase()));

// Strict EIP-55 parse. All-lowercase passes (wallets and APIs often emit it); anything with an upper
// case letter must carry the exact checksum, so a typo or a copy from the seven bad strings listed in
// spec section 2.3 is refused. Returns the checksummed form.
export function parseAddress(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: true })) {
    throw new AccountError("invalid_address", "not a valid EIP-55 address");
  }
  return getAddress(value);
}

// An owner is any non-zero EOA-looking address except a pinned protocol contract. (The validator
// accepts any non-zero 20 bytes; refusing the pinned contracts only guards against an injected value
// such as the exchange or the factory being passed off as a wallet.)
export function parseOwner(value: unknown): Address {
  const owner = parseAddress(value);
  if (owner === zeroAddress) throw new AccountError("zero_owner", "the zero address cannot own an account");
  if (PROTOCOL_ADDRESSES.has(owner.toLowerCase())) {
    throw new AccountError("protocol_contract_owner", "the owner is a pinned protocol contract");
  }
  return owner;
}

// initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig).
// rootValidator = VALIDATION_TYPE_VALIDATOR (0x01) || the ECDSA validator; no hook; validatorData is the
// 20-byte owner; empty hookData and initConfig. 292 bytes with selector 0x3c3b752b.
export function buildInitData(owner: string): Hex {
  const parsed = parseOwner(owner);
  // Lower-case hex throughout: viem keeps the case of a hex string it is handed, and an address pasted
  // into the root validator would otherwise leave checksum letters inside the bytes.
  return encodeFunctionData({
    abi: KERNEL_ABI,
    functionName: "initialize",
    args: [concat([ROOT_VALIDATOR_TYPE_BYTE, ECDSA_VALIDATOR.toLowerCase() as Hex]), zeroAddress, parsed, "0x", []],
  }).toLowerCase() as Hex;
}

// The UserOp initCode of an account's first operation: factory (20 bytes) || createAccount(initData, 0).
// 440 bytes. Only valid while the account is undeployed, and only for the sender deriveAccount(owner)
// returns (the userop stream refuses any other pairing).
export function buildInitCode(owner: string): Hex {
  return concat([
    KERNEL_FACTORY.toLowerCase() as Hex,
    encodeFunctionData({ abi: KERNEL_FACTORY_ABI, functionName: "createAccount", args: [buildInitData(owner), ACCOUNT_SALT] }),
  ]).toLowerCase() as Hex;
}

// Solady LibClone ERC-1967 proxy creation code for `implementation` (95 bytes). The constructor stores
// the implementation in the EIP-1967 slot and returns the 61-byte runtime (constants.ts).
export function proxyInitCode(implementation: Address = KERNEL_IMPLEMENTATION): Hex {
  return concat([ERC1967_CREATION_PREFIX, implementation.toLowerCase() as Hex, ERC1967_CREATION_MIDDLE, KERNEL_PROXY_RUNTIME_CODE]);
}

export function proxyInitCodeHash(implementation: Address = KERNEL_IMPLEMENTATION): Hex {
  return keccak256(proxyInitCode(implementation));
}

// The 61 bytes every Kernel account from this factory has on chain. A code observation that equals
// this is positive proof of a deployed Kernel proxy; any other non-empty code is not.
export function isKernelProxyRuntime(code: string): boolean {
  return code.toLowerCase() === KERNEL_PROXY_RUNTIME_CODE;
}

// The CREATE2 salt the factory uses: keccak256(initData || bytes32(0)).
export function accountCreate2Salt(owner: string): Hex {
  return keccak256(concat([buildInitData(owner), ACCOUNT_SALT]));
}

// The counterfactual (or deployed) account for an owner. Checksummed.
export function deriveAccount(owner: string): Address {
  return getCreate2Address({ from: KERNEL_FACTORY, salt: accountCreate2Salt(owner), bytecodeHash: ERC1967_INIT_CODE_HASH });
}

export interface AccountParts {
  readonly owner: Address;
  readonly account: Address;
  readonly initData: Hex;
  readonly create2Salt: Hex;
  readonly initCode: Hex;
}

// Everything a UserOp builder needs about the account, from one validated owner.
export function describeAccount(owner: string): AccountParts {
  const parsed = parseOwner(owner);
  const initData = buildInitData(parsed);
  const create2Salt = keccak256(concat([initData, ACCOUNT_SALT]));
  return {
    owner: parsed,
    account: getCreate2Address({ from: KERNEL_FACTORY, salt: create2Salt, bytecodeHash: ERC1967_INIT_CODE_HASH }),
    initData,
    create2Salt,
    initCode: buildInitCode(parsed),
  };
}

// Never trust an account address that came from outside (the model, a tool argument, an API): derive
// it from the owner and compare (AD1). Returns the derived account when `supplied` is absent or equal.
export function requireDerivedAccount(owner: string, supplied?: string | null): Address {
  const derived = deriveAccount(owner);
  if (supplied === undefined || supplied === null) return derived;
  const parsed = parseAddress(supplied);
  if (parsed.toLowerCase() === parseOwner(owner).toLowerCase()) {
    throw new AccountError("account_is_owner", "the supplied account is the owner address, not the smart account");
  }
  if (parsed !== derived) throw new AccountError("account_mismatch", "the supplied account is not the account derived from the owner");
  return derived;
}

// The storage key under which the ECDSA validator holds an account's owner (eth_getStorageAt on the
// validator address). Pure; the read itself, if an RPC is open, is the caller's.
export function validatorOwnerStorageKey(account: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [parseAddress(account), ECDSA_VALIDATOR_OWNER_MAPPING_SLOT]));
}
