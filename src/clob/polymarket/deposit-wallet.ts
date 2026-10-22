// Polymarket's Deposit Wallet: the smart-contract wallet every Polymarket account deployed on or after 2026-05-04 trades
// from (docs.polymarket.com/trading/wallets-auth.md, read 2026-10-21). An order from it is signature type 3 (POLY_1271):
// maker and signer are both the wallet, and the exchange accepts it only when `signer == maker`, the maker has code and
// the wallet's ERC-1271 check passes (Polymarket/ctf-exchange-v2 src/exchange/mixins/Signatures.sol
// _verifyPoly1271Signature, commit ccc0596074f4dfd62c944fbca4de252893b82b4b: "(signer == maker) &&
// maker.code.length > 0 && SignatureCheckerLib.isValidSignatureNow(maker, hash, signature)").
//
// How a client learns the wallet of an owner EOA. There is no API field this build relies on; the address is a pure
// function of the owner, by CREATE2 from Polymarket's factory, and comes in two forms:
//
//   walletId = bytes32(owner)                     (left-padded; wallets-auth.md "walletId = bytes32(signer)")
//   args     = abi.encode(factory, walletId)
//   salt     = keccak256(args)
//   beacon wallet (deployed after the 2026-06-29 upgrade): CREATE2(factory, salt, initCodeHashERC1967BeaconProxy(beacon, args))
//   UUPS wallet   (deployed before it):                   CREATE2(factory, salt, initCodeHashERC1967(implementation, args))
//
// The beacon form is the algorithm wallets-auth.md publishes ("Deposit Wallets deployed before the June 29, 2026
// upgrade use a UUPS proxy. Deposit Wallets deployed after the upgrade use a beacon proxy"). The UUPS form is the one
// the verified factory source deploys (Sourcify chain 137, src/DepositWalletFactory.sol `deploy`:
// `LibClone.deployDeterministicERC1967(implementation_, args, keccak256(args))`) and the one the official client
// derives (npm @polymarket/client 0.13.0 src/wallet.ts deriveUupsDepositWalletAddress / deriveBeaconDepositWalletAddress).
// Both were checked against the chain on 2026-10-21 over the Polygon public RPC (sdk/venues/origins.ts rpc_polygon):
// the live factory's predictWalletAddress for the public Hardhat test address equals the beacon form here, and every
// WalletDeployed event of the factory in two 3,000-block windows (blocks 93,929,442 to 93,932,442: 725 events, 2 of
// them UUPS; blocks 95,729,774 to 95,732,774: 1,361 events, 2 of them UUPS) re-derives with the form its
// `implementation` field names, with walletId equal to the owner in every one; eth_getCode at ten of those wallets
// (both forms) equalled depositWalletRuntimeCode exactly. UUPS-form deployments appear in both windows, so the form
// cannot be inferred from a date: both addresses are always checked.
//
// Being derivable is not being deployed. Nothing here reads the chain: the relay reads eth_getCode at both addresses
// and requires the code there to be EXACTLY the proxy runtime below (which embeds the factory and the owner's id), then
// reads owner() and eip712Domain() from it (relay/clob.ts). The rebuild and the plugin use only the pure part: an
// account named as an owner's Deposit Wallet must be one of the two addresses derived here (never taken on trust).
//
// PORTABLE: no node:* import. The page bundles this file.

import { concat, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, getAddress, getCreate2Address, keccak256, numberToHex, pad, parseAbi, type Address, type Hex } from "viem";

import { POLYMARKET_DEPOSIT_WALLET_BEACON, POLYMARKET_DEPOSIT_WALLET_FACTORY, POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION } from "../../xo/chain/constants.js";

// The wallet's own EIP-712 domain (src/DepositWallet.sol _domainNameAndVersion: name = "DepositWallet", version = "1",
// in both the UUPS implementation and the current beacon implementation, each a Sourcify exact match on chain 137).
export const DEPOSIT_WALLET_DOMAIN_NAME = "DepositWallet";
export const DEPOSIT_WALLET_DOMAIN_VERSION = "1";

export type DepositWalletProxy = "beacon" | "uups";
export const DEPOSIT_WALLET_PROXIES: readonly DepositWalletProxy[] = Object.freeze(["beacon", "uups"]);

// Solady LibClone, as vendored in the verified DepositWallet sources (lib/solady/src/utils/LibClone.sol):
// initCodeHashERC1967(address implementation, bytes args) and initCodeHashERC1967BeaconProxy(address beacon, bytes args).
// The creation code is   prefix(10) || target(20) || middle || tail1(32) || tail2(32) || args,
// prefix = 0x61003d3d8160233d3973 + (args.length << 56) for the ERC-1967 proxy and 0x6100523d8160233d3973 + (args.length
// << 56) for the beacon proxy; the constructor copies everything from byte 0x23 on as the runtime.
const ERC1967_PREFIX = 0x61003d3d8160233d3973n;
const ERC1967_MIDDLE: Hex = "0x6009";
const ERC1967_TAIL1: Hex = "0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076";
const ERC1967_TAIL2: Hex = "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3";
const BEACON_PREFIX = 0x6100523d8160233d3973n;
const BEACON_MIDDLE: Hex = "0x60195155f3363d3d373d3d363d602036600436635c60da";
const BEACON_TAIL1: Hex = "0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c";
const BEACON_TAIL2: Hex = "0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3";
// The runtime starts at byte 0x23 of the creation code: 3 bytes into the ERC-1967 tail1 (after 0x5155f3) and 5 bytes
// into the beacon middle (after 0x60195155f3).
const RUNTIME_OFFSET = 0x23;

function lowerHex(value: string): Hex {
  return value.toLowerCase() as Hex;
}

// The owner's walletId: the address left-padded to 32 bytes.
export function depositWalletId(owner: Address): Hex {
  return pad(lowerHex(getAddress(owner)), { size: 32 });
}

// abi.encode(factory, walletId): the 64 immutable bytes appended to the proxy, and the preimage of the CREATE2 salt.
export function depositWalletArgs(owner: Address): Hex {
  return lowerHex(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [POLYMARKET_DEPOSIT_WALLET_FACTORY, depositWalletId(owner)]));
}

function argsLength(args: Hex): bigint {
  return BigInt((args.length - 2) / 2);
}

// The proxy's creation code for an owner, in either form.
export function depositWalletInitCode(owner: Address, proxy: DepositWalletProxy): Hex {
  const args = depositWalletArgs(owner);
  if (proxy === "uups") {
    const prefix = numberToHex(ERC1967_PREFIX + (argsLength(args) << 56n), { size: 10 });
    return lowerHex(concat([prefix, lowerHex(POLYMARKET_DEPOSIT_WALLET_UUPS_IMPLEMENTATION), ERC1967_MIDDLE, ERC1967_TAIL1, ERC1967_TAIL2, args]));
  }
  const prefix = numberToHex(BEACON_PREFIX + (argsLength(args) << 56n), { size: 10 });
  return lowerHex(concat([prefix, lowerHex(POLYMARKET_DEPOSIT_WALLET_BEACON), BEACON_MIDDLE, BEACON_TAIL1, BEACON_TAIL2, args]));
}

// The exact code eth_getCode returns at a deployed wallet: the creation code from byte 0x23 on (125 bytes for the
// UUPS proxy, 146 for the beacon proxy). It embeds the factory and the owner's walletId, so a code match is positive
// proof that the wallet at that address was created by Polymarket's factory for this owner's id.
export function depositWalletRuntimeCode(owner: Address, proxy: DepositWalletProxy): Hex {
  const init = depositWalletInitCode(owner, proxy);
  return `0x${init.slice(2 + RUNTIME_OFFSET * 2)}`;
}

export function depositWalletAddress(owner: Address, proxy: DepositWalletProxy): Address {
  return getCreate2Address({ from: POLYMARKET_DEPOSIT_WALLET_FACTORY, salt: keccak256(depositWalletArgs(owner)), bytecodeHash: keccak256(depositWalletInitCode(owner, proxy)) });
}

export interface DepositWalletCandidate {
  readonly proxy: DepositWalletProxy;
  readonly address: Address;
  readonly runtimeCode: Hex;
}

// Both addresses an owner's Deposit Wallet can have. At most one is expected to hold code.
export function depositWalletCandidates(owner: Address): readonly DepositWalletCandidate[] {
  return DEPOSIT_WALLET_PROXIES.map((proxy) => ({ proxy, address: depositWalletAddress(owner, proxy), runtimeCode: depositWalletRuntimeCode(owner, proxy) }));
}

// Which form `account` is of `owner`'s Deposit Wallet, or null when it is neither derived address.
export function depositWalletProxyOf(owner: Address, account: string): DepositWalletProxy | null {
  const wanted = account.toLowerCase();
  for (const candidate of depositWalletCandidates(owner)) {
    if (candidate.address.toLowerCase() === wanted) return candidate.proxy;
  }
  return null;
}

// ---- the two reads the relay makes on a deployed wallet --------------------------------------------------------------------

// owner() (src/libraries/Ownable.sol) and eip712Domain() (Solady EIP712, ERC-5267), both views on the wallet.
export const DEPOSIT_WALLET_READ_ABI = parseAbi([
  "function owner() view returns (address)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

export const DEPOSIT_WALLET_OWNER_CALL: Hex = encodeFunctionData({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "owner" });
export const DEPOSIT_WALLET_DOMAIN_CALL: Hex = encodeFunctionData({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "eip712Domain" });

// The owner() answer, or null when it does not decode.
export function decodeDepositWalletOwner(data: Hex): Address | null {
  try {
    return getAddress(decodeFunctionResult({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "owner", data }));
  } catch {
    return null;
  }
}

// True when the eip712Domain() answer is exactly the domain the TypedDataSign wrapper names: fields 0x0f (name,
// version, chainId, verifyingContract), "DepositWallet", "1", the chain, the wallet itself, a zero salt, no extensions.
// Solady's ERC1271 nested-EIP-712 check rebuilds that domain from these same values, so a wallet whose domain differs
// would refuse the signature this build makes; the relay refuses first instead.
export function depositWalletDomainMatches(data: Hex, wallet: Address, chainId: number): boolean {
  try {
    const [fields, name, version, chain, verifyingContract, salt, extensions] = decodeFunctionResult({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "eip712Domain", data });
    return (
      fields.toLowerCase() === "0x0f" &&
      name === DEPOSIT_WALLET_DOMAIN_NAME &&
      version === DEPOSIT_WALLET_DOMAIN_VERSION &&
      chain === BigInt(chainId) &&
      verifyingContract.toLowerCase() === wallet.toLowerCase() &&
      /^0x0{64}$/.test(salt) &&
      extensions.length === 0
    );
  } catch {
    return false;
  }
}

// The account a CLOB venue item may name for an owner: the owner itself, or one of the owner's two derived Deposit
// Wallet addresses. Anything else is null. Which of them an item may use (and whether it is deployed) is decided by the
// rebuild (signature type) and the relay (chain read); this only stops an arbitrary address from being accepted.
export function clobAccountOf(owner: Address, account: string): Address | null {
  if (account.toLowerCase() === owner.toLowerCase()) return getAddress(owner);
  return depositWalletProxyOf(owner, account) === null ? null : getAddress(account);
}
