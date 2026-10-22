import { concat, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, encodePacked, getAddress, getCreate2Address, keccak256, parseAbi, slice } from "viem";

import { DEPOSIT_WALLET_OWNER_CALL, decodeDepositWalletOwner, depositWalletCandidates } from "../../trade/clob/polymarket/deposit-wallet.js";
import { pinFailureText, type PinGuard } from "../pins.js";
import type { Address, Hex, RpcPort, RpcRequestOptions } from "../rpc.js";
import { POLYMARKET_PROXY_WALLET_FACTORY, POLYMARKET_PROXY_WALLET_IMPLEMENTATION, POLYMARKET_SAFE_FACTORY, POLYMARKET_SAFE_SINGLETON, POLYMARKET_WALLET_PINS } from "./constants.js";

// The wallets Polymarket creates for a signer, derived from the signer's address alone (no Polymarket API), and the
// on-chain checks that say whether each one exists and belongs to the signer. Polymarket has three kinds
// (docs.polymarket.com/trading/wallets-auth.md "Wallet Types", read 2026-10-22): the Proxy Wallet (email and Google
// accounts, signature type 1), the Safe Wallet (browser-wallet accounts, signature type 2) and the Deposit Wallet
// (every account wallet deployed on or after 2026-05-04, signature type 3, derived in
// sdk/trade/clob/polymarket/deposit-wallet.ts). Each is a CREATE2 address of a factory on Polymarket's contract list
// (docs.polymarket.com/resources/contracts.md "Wallet Factory Contracts", read 2026-10-22), pinned in constants.ts.
//
// Proxy Wallet, from three official sources that agree (all read 2026-10-22):
//   - github.com/Polymarket/builder-relayer-client src/builder/derive.ts deriveProxyWallet and src/constants/index.ts
//     PROXY_INIT_CODE_HASH (commit 9fe05143091b34fb9615b50d992b647b7964b0da), and its Python twin
//     github.com/Polymarket/py-builder-relayer-client derive_proxy_wallet (commit 4968df278eebd933f47e530669ed517a896c9897):
//       salt = keccak256(abi.encodePacked(signer)), address = CREATE2(factory, salt, PROXY_INIT_CODE_HASH);
//   - the factory's verified source, github.com/Polymarket/proxy-factories packages/proxy-factory (commit
//     7137c021e6954d671095f77c94afc3d083d10a84) ProxyWalletFactory.makeWallet and FactoryLib.computeCreationCode, the
//     same contract Sourcify matches at the factory address: the init code is a 99-byte clone stub naming the factory
//     and the implementation, followed by abi.encodeWithSignature("cloneConstructor(bytes)", "");
//   - github.com/Polymarket/polymarket-sdk src/proxyWallet.ts getProxyWalletAddress and its ten vectors in
//     test/proxywallet_address.ts (commit 87c00cd1256f61038f1f60397456846b5ebc6b73).
//   The init code built below from FactoryLib, with the implementation the factory's getImplementation() returned,
//   hashes to the relayer client's constant, and the ten polymarket-sdk vectors derive (wallets.test.ts). Two of those
//   vector wallets held, on 2026-10-22, exactly the clone runtime below (eth_getCode over the public Polygon RPC). The
//   wallet's own owner slot holds the factory, not the signer (ProxyWallet.initialize is called by the factory, which
//   keeps the access control), so the signer is bound to the wallet by the CREATE2 salt alone: code at the derived
//   address can only have been put there by the pinned factory with this signer's salt.
//
// Safe Wallet, from the same sources (all read 2026-10-22):
//   - builder-relayer-client deriveSafe and SAFE_INIT_CODE_HASH, py-builder-relayer-client `derive` and its vector
//     tests/builder/test_derive.py test_derive_safe:
//       salt = keccak256(abi.encode(signer)), address = CREATE2(safeFactory, salt, SAFE_INIT_CODE_HASH);
//   - proxy-factories packages/safe-factory SafeProxyFactory.sol (Sourcify exact match at the factory address):
//     getSalt(user) = keccak256(abi.encode(user)), init code = GnosisSafeProxy creation code ++ abi.encode(masterCopy),
//     and createProxy sets the recovered signer as the Safe's only owner.
//   The deployed factory's own computeProxyAddress() returned the py-builder-relayer-client vector's Safe on 2026-10-22,
//   its getContractBytecode() hashed to SAFE_INIT_CODE_HASH and is SAFE_PROXY_CREATION_CODE below followed by the
//   pinned singleton, and the vector's Safe held the runtime below and listed the vector's signer in getOwners(). A Safe
//   can change its owners, so a Safe is read only when getOwners() lists the signer, and only while its singleton slot
//   names the pinned singleton (getOwners runs that code).
//
// PORTABLE: no node:* import. The page bundles this file.

export type PolymarketWalletKind = "proxy" | "safe" | "deposit_beacon" | "deposit_uups";

export const POLYMARKET_WALLET_KINDS: readonly PolymarketWalletKind[] = Object.freeze(["proxy", "safe", "deposit_beacon", "deposit_uups"]);

// The relayer client's published init code hashes (builder-relayer-client src/constants/index.ts, above). Kept to be
// compared with: the derivation hashes the init code it builds, and wallets.test.ts checks the two are equal.
export const PUBLISHED_PROXY_INIT_CODE_HASH: Hex = "0xd21df8dc65880a8606f09fe0ce3df9b8869287ab0b058be05aa9e8af6330a00b";
export const PUBLISHED_SAFE_INIT_CODE_HASH: Hex = "0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf";

function lowerHex(value: string): Hex {
  return value.toLowerCase() as Hex;
}

// ---- Proxy Wallet -----------------------------------------------------------------------------------------------------

// FactoryLib.computeCreationCode(deployer, target): 13 bytes, the deployer, 31 bytes, the target, 15 bytes, then the
// clone constructor's call data. The constructor delegates cloneConstructor(bytes) to the deployer and copies 0x2d
// bytes from offset 0x36 as the runtime: an EIP-1167 minimal proxy to the target.
const CLONE_HEAD: Hex = "0x3d3d606380380380913d393d73";
const CLONE_MIDDLE: Hex = "0x5af4602a57600080fd5b602d8060366000396000f3363d3d373d3d3d363d73";
const CLONE_TAIL: Hex = "0x5af43d82803e903d91602b57fd5bf3";
const CLONE_RUNTIME_OFFSET = 0x36;
const CLONE_RUNTIME_SIZE = 0x2d;
const CLONE_CONSTRUCTOR_ABI = parseAbi(["function cloneConstructor(bytes)"]);

export function proxyWalletInitCode(): Hex {
  const constructorCall = encodeFunctionData({ abi: CLONE_CONSTRUCTOR_ABI, functionName: "cloneConstructor", args: ["0x"] });
  return lowerHex(concat([CLONE_HEAD, lowerHex(POLYMARKET_PROXY_WALLET_FACTORY), CLONE_MIDDLE, lowerHex(POLYMARKET_PROXY_WALLET_IMPLEMENTATION), CLONE_TAIL, constructorCall]));
}

// The exact code eth_getCode returns at a deployed proxy wallet (45 bytes, naming the pinned implementation).
export const PROXY_WALLET_RUNTIME_CODE: Hex = lowerHex(slice(proxyWalletInitCode(), CLONE_RUNTIME_OFFSET, CLONE_RUNTIME_OFFSET + CLONE_RUNTIME_SIZE));

export function proxyWalletSalt(signer: Address): Hex {
  return keccak256(encodePacked(["address"], [getAddress(signer)]));
}

export function proxyWalletAddress(signer: Address): Address {
  return getCreate2Address({ from: POLYMARKET_PROXY_WALLET_FACTORY, salt: proxyWalletSalt(signer), bytecodeHash: keccak256(proxyWalletInitCode()) });
}

// ---- Safe Wallet -------------------------------------------------------------------------------------------------------

// type(GnosisSafeProxy).creationCode as the factory returns it from proxyCreationCode() (369 bytes, read 2026-10-22;
// GnosisSafeProxy of @gnosis.pm/safe-contracts 1.3.0 compiled with solc 0.8.4). Its constructor stores the singleton
// passed as the one argument in slot 0 and copies 0x7c bytes from offset 0xf5 as the runtime.
export const SAFE_PROXY_CREATION_CODE: Hex =
  "0x608060405234801561001057600080fd5b5060405161017138038061017183398101604081905261002f916100b9565b6001600160a01b0381166100945760405162461bcd60e51b815260206004820152602260248201527f496e76616c69642073696e676c65746f6e20616464726573732070726f766964604482015261195960f21b606482015260840160405180910390fd5b600080546001600160a01b0319166001600160a01b03929092169190911790556100e7565b6000602082840312156100ca578081fd5b81516001600160a01b03811681146100e0578182fd5b9392505050565b607c806100f56000396000f3fe6080604052600080546001600160a01b0316813563530ca43760e11b1415602857808252602082f35b3682833781823684845af490503d82833e806041573d82fd5b503d81f3fea264697066735822122015938e3bf2c49f5df5c1b7f9569fa85cc5d6f3074bb258a2dc0c7e299bc9e33664736f6c63430008040033";
const SAFE_RUNTIME_OFFSET = 0xf5;
const SAFE_RUNTIME_SIZE = 0x7c;

export function safeInitCode(): Hex {
  return lowerHex(concat([SAFE_PROXY_CREATION_CODE, encodeAbiParameters([{ type: "address" }], [POLYMARKET_SAFE_SINGLETON])]));
}

// The exact code eth_getCode returns at a deployed Safe (124 bytes; the singleton lives in slot 0, not in the code).
export const SAFE_PROXY_RUNTIME_CODE: Hex = lowerHex(slice(SAFE_PROXY_CREATION_CODE, SAFE_RUNTIME_OFFSET, SAFE_RUNTIME_OFFSET + SAFE_RUNTIME_SIZE));

export function safeSalt(signer: Address): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }], [getAddress(signer)]));
}

export function safeAddress(signer: Address): Address {
  return getCreate2Address({ from: POLYMARKET_SAFE_FACTORY, salt: safeSalt(signer), bytecodeHash: keccak256(safeInitCode()) });
}

// ---- every candidate -----------------------------------------------------------------------------------------------------

export interface PolymarketWalletCandidate {
  readonly kind: PolymarketWalletKind;
  readonly address: Address;
  // What eth_getCode must return at the address for the wallet to count as deployed by its factory.
  readonly runtimeCode: Hex;
}

// The four addresses a signer's Polymarket wallet can have. Being derivable is not being deployed: see
// findPolymarketWallets.
export function polymarketWalletCandidates(signer: Address): readonly PolymarketWalletCandidate[] {
  const owner = getAddress(signer);
  const deposit = depositWalletCandidates(owner);
  return [
    { kind: "proxy", address: proxyWalletAddress(owner), runtimeCode: PROXY_WALLET_RUNTIME_CODE },
    { kind: "safe", address: safeAddress(owner), runtimeCode: SAFE_PROXY_RUNTIME_CODE },
    ...deposit.map((candidate) => ({ kind: candidate.proxy === "beacon" ? ("deposit_beacon" as const) : ("deposit_uups" as const), address: candidate.address, runtimeCode: lowerHex(candidate.runtimeCode) })),
  ];
}

export const POLYMARKET_WALLET_KIND_TEXT: Readonly<Record<PolymarketWalletKind, string>> = Object.freeze({
  proxy: "Polymarket proxy wallet",
  safe: "Polymarket Safe wallet",
  deposit_beacon: "Polymarket Deposit Wallet",
  deposit_uups: "Polymarket Deposit Wallet (earlier form)",
});

// ---- the on-chain checks ----------------------------------------------------------------------------------------------------

export type PolymarketWalletState =
  // Deployed by its factory for this signer, and (Safe, Deposit Wallet) owned by the signer: its positions are the signer's.
  | "found"
  // No code at the derived address: the wallet was never created.
  | "not_deployed"
  // Code that is not the factory's wallet code (not expected to happen: CREATE2 ties the address to the init code).
  | "foreign_code"
  // A Safe whose getOwners() does not list the signer, or a Deposit Wallet whose owner() is another address.
  | "not_owner"
  // A Safe whose singleton slot or singleton code is not the pinned one, so its getOwners() is not trusted.
  | "singleton_not_pinned"
  // The node did not answer for this address, or answered something that does not decode.
  | "unreadable";

export interface PolymarketWalletCheck {
  readonly kind: PolymarketWalletKind;
  readonly address: Address;
  readonly state: PolymarketWalletState;
  // Fixed words for every state but "found".
  readonly why: string | null;
}

const SAFE_ABI = parseAbi(["function getOwners() view returns (address[])"]);
const SAFE_OWNERS_CALL: Hex = encodeFunctionData({ abi: SAFE_ABI, functionName: "getOwners" });
const SLOT_ZERO: Hex = `0x${"00".repeat(32)}`;

function check(candidate: PolymarketWalletCandidate, state: PolymarketWalletState, why: string | null): PolymarketWalletCheck {
  return { kind: candidate.kind, address: candidate.address, state, why };
}

function safeOwners(data: Hex): readonly string[] | null {
  try {
    return decodeFunctionResult({ abi: SAFE_ABI, functionName: "getOwners", data }).map((owner) => owner.toLowerCase());
  } catch {
    return null;
  }
}

// For each candidate wallet of `signer`: is it deployed (eth_getCode equal to its factory's wallet code) and, for a Safe
// or a Deposit Wallet, is the signer its owner (getOwners() lists it; owner() is it). Reads eth_getCode,
// eth_getStorageAt and eth_call only. A per-address failure is that address's "unreadable"; a limit, a timeout or a
// refused endpoint is thrown, as every chain read does. With a guard, the Safe singleton's code is checked against its
// pin before any getOwners() answer is used.
export async function findPolymarketWallets(port: RpcPort, signer: Address, options: { readonly guard?: PinGuard; readonly request?: RpcRequestOptions } = {}): Promise<readonly PolymarketWalletCheck[]> {
  const owner = getAddress(signer);
  const candidates = polymarketWalletCandidates(owner);
  const codes = await port.requestMany(
    candidates.map((candidate) => ({ method: "eth_getCode" as const, params: [candidate.address, "latest"] })),
    options.request,
  );
  const deployed: PolymarketWalletCandidate[] = [];
  const out = new Map<PolymarketWalletCandidate, PolymarketWalletCheck>();
  candidates.forEach((candidate, index) => {
    const code = codes[index];
    if (code === undefined || !code.ok) out.set(candidate, check(candidate, "unreadable", "The node did not return the code at this address."));
    else if (code.result === "0x") out.set(candidate, check(candidate, "not_deployed", "There is no contract at this derived address: the wallet was never created."));
    else if (code.result !== candidate.runtimeCode) out.set(candidate, check(candidate, "foreign_code", "The contract at this address is not the factory's wallet, so it was not read."));
    else deployed.push(candidate);
  });

  for (const candidate of deployed) {
    if (candidate.kind === "proxy") {
      out.set(candidate, check(candidate, "found", null));
      continue;
    }
    if (candidate.kind === "safe") {
      const slot = await port.getStorageAt(candidate.address, SLOT_ZERO, options.request);
      if (slot !== lowerHex(`0x${"00".repeat(12)}${POLYMARKET_SAFE_SINGLETON.slice(2)}`)) {
        out.set(candidate, check(candidate, "singleton_not_pinned", "This Safe no longer runs the singleton it was created with, so its owner list is not trusted and it was not read."));
        continue;
      }
      if (options.guard !== undefined) {
        const pinned = await options.guard.check(POLYMARKET_WALLET_PINS.safeSingleton, options.request);
        if (!pinned.ok) {
          out.set(candidate, check(candidate, "singleton_not_pinned", pinFailureText(pinned)));
          continue;
        }
      }
    }
    const [answer] = await port.callMany([{ to: candidate.address, data: candidate.kind === "safe" ? SAFE_OWNERS_CALL : DEPOSIT_WALLET_OWNER_CALL }], options.request);
    if (answer === undefined || !answer.ok) {
      out.set(candidate, check(candidate, "unreadable", "The wallet did not answer who owns it, so it was not read."));
      continue;
    }
    if (candidate.kind === "safe") {
      const owners = safeOwners(answer.data);
      if (owners === null) out.set(candidate, check(candidate, "unreadable", "The Safe's owner list did not decode, so it was not read."));
      else if (!owners.includes(owner.toLowerCase())) out.set(candidate, check(candidate, "not_owner", "A Safe exists at this address, but this signer is not among its owners, so it was not read."));
      else out.set(candidate, check(candidate, "found", null));
      continue;
    }
    const current = decodeDepositWalletOwner(answer.data);
    if (current === null) out.set(candidate, check(candidate, "unreadable", "The Deposit Wallet's owner() did not decode, so it was not read."));
    else if (current !== owner) out.set(candidate, check(candidate, "not_owner", "A Deposit Wallet exists at this address, but its owner() is another address, so it was not read."));
    else out.set(candidate, check(candidate, "found", null));
  }
  return candidates.map((candidate) => out.get(candidate) as PolymarketWalletCheck);
}
