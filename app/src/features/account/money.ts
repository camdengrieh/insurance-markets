// Moving USDC into and out of the trading account (docs/unified-account-design.md section 1, "Money").
//
// Deposit: the funding wallet W signs a USDC transferWithAuthorization (EIP-3009) from W to E: typed data only, so a
// wallet that cannot send transactions (PayBox over WalletConnect) can still fund the account, and W pays no gas. E then
// submits it as a sponsored call (sponsor.ts). The EIP-712 domain is read from the token itself (name() and version()
// by eth_call) rather than written here, so a token upgrade that changes it cannot make the page ask for a signature the
// token would reject. Base and Polygon native USDC only.
//
// Withdraw: a sponsored ERC-20 transfer from E to W, or to an address the visitor types, checked by core/address.ts
// (EIP-55, look-alikes, no zero or protocol address) before anything is signed.
//
// Amounts are exact integers of USDC's 6 decimals throughout; nothing here is floating point.

import { bytesToHex, decodeFunctionResult, encodeFunctionData, erc20Abi, isAddressEqual, parseSignature, recoverTypedDataAddress, type Address, type Hex } from "viem";

import { checkEvmAddress, type AddressCheck, type EvmAddress, type SavedAddress } from "../../core/address";
import { decToAtomic } from "../../core/money";
import { WalletError, type WalletSigner } from "../../core/signer";
import { moneyChain, USDC_DECIMALS, type MoneyChainId } from "./constants";
import type { ChainCalls } from "./reads";
import { SponsorError, type Sponsor } from "./sponsor";

// ---- EIP-3009 ---------------------------------------------------------------------------------------------------------------

export const TRANSFER_WITH_AUTHORIZATION_TYPES = Object.freeze({
  TransferWithAuthorization: Object.freeze([
    Object.freeze({ name: "from", type: "address" }),
    Object.freeze({ name: "to", type: "address" }),
    Object.freeze({ name: "value", type: "uint256" }),
    Object.freeze({ name: "validAfter", type: "uint256" }),
    Object.freeze({ name: "validBefore", type: "uint256" }),
    Object.freeze({ name: "nonce", type: "bytes32" }),
  ]),
} as const);

export const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const VERSION_ABI = [{ type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] }] as const;

// How long W's authorization stays usable: long enough for a slow wallet prompt and a bundler, short enough that a
// signature nobody submitted soon stops being a standing order.
export const AUTHORIZATION_VALID_SECONDS = 3600;

export interface TokenDomain {
  readonly name: string;
  readonly version: string;
}

export interface TransferAuthorization {
  readonly chainId: number;
  readonly token: Address;
  readonly domain: TokenDomain;
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly validAfter: bigint;
  readonly validBefore: bigint;
  readonly nonce: Hex;
}

export function transferWithAuthorizationTypedData(auth: TransferAuthorization) {
  return {
    domain: { name: auth.domain.name, version: auth.domain.version, chainId: auth.chainId, verifyingContract: auth.token },
    types: { TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization.map((field) => ({ ...field })) },
    primaryType: "TransferWithAuthorization" as const,
    message: { from: auth.from, to: auth.to, value: auth.value, validAfter: auth.validAfter, validBefore: auth.validBefore, nonce: auth.nonce },
  };
}

export function transferWithAuthorizationCalldata(auth: TransferAuthorization, signature: Hex): Hex {
  const { r, s, yParity } = parseSignature(signature);
  return encodeFunctionData({
    abi: TRANSFER_WITH_AUTHORIZATION_ABI,
    functionName: "transferWithAuthorization",
    args: [auth.from, auth.to, auth.value, auth.validAfter, auth.validBefore, auth.nonce, 27 + yParity, r, s],
  });
}

function decodedString(abi: typeof VERSION_ABI | typeof erc20Abi, functionName: "version" | "name", data: Hex | null | undefined): string | null {
  if (data === null || data === undefined || data === "0x") return null;
  try {
    const value = decodeFunctionResult({ abi, functionName, data } as Parameters<typeof decodeFunctionResult>[0]);
    return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
  } catch {
    return null;
  }
}

// The token's own EIP-712 name and version; null when either read fails.
export async function readTokenDomain(calls: ChainCalls, chainId: number, token: Address): Promise<TokenDomain | null> {
  let answers: ReadonlyArray<Hex | null>;
  try {
    answers = await calls(chainId, [
      { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "name" }) },
      { to: token, data: encodeFunctionData({ abi: VERSION_ABI, functionName: "version" }) },
    ]);
  } catch {
    return null;
  }
  const name = decodedString(erc20Abi, "name", answers[0]);
  const version = decodedString(VERSION_ABI, "version", answers[1]);
  return name === null || version === null ? null : { name, version };
}

// USDC balances in base units, one per holder; null where the read failed.
export async function readUsdcBalances(calls: ChainCalls, chainId: MoneyChainId, holders: readonly Address[]): Promise<ReadonlyArray<bigint | null>> {
  const chain = moneyChain(chainId);
  if (chain === undefined) return holders.map(() => null);
  let answers: ReadonlyArray<Hex | null>;
  try {
    answers = await calls(chainId, holders.map((holder) => ({ to: chain.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [holder] }) })));
  } catch {
    return holders.map(() => null);
  }
  return holders.map((_, index) => {
    const data = answers[index];
    return data !== null && data !== undefined && /^0x[0-9a-fA-F]{64}$/.test(data) ? BigInt(data) : null;
  });
}

// ---- amounts and destinations ------------------------------------------------------------------------------------------------

export type AmountCheck = { readonly ok: true; readonly value: bigint } | { readonly ok: false; readonly message: string };

// A USDC amount typed by the visitor, as base units. More than 6 decimals is refused, not rounded.
export function parseUsdcAmount(text: string): AmountCheck {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, message: "Enter an amount." };
  const parsed = decToAtomic(trimmed, USDC_DECIMALS);
  if (!parsed.ok) return { ok: false, message: "Enter an amount like 25 or 25.50, with at most 6 decimals." };
  if (parsed.value <= 0n) return { ok: false, message: "Enter an amount above zero." };
  return { ok: true, value: parsed.value };
}

export function checkWithdrawDestination(input: unknown, saved: readonly SavedAddress[] = []): AddressCheck<EvmAddress> {
  return checkEvmAddress(input, saved, { role: "wallet" });
}

// ---- the two actions ---------------------------------------------------------------------------------------------------------

export type MoneyResult = { readonly ok: true; readonly transactionHash: Hex } | { readonly ok: false; readonly message: string; readonly detail: string | null; readonly transactionHash: Hex | null };

function refused(message: string, detail: string | null = null, transactionHash: Hex | null = null): MoneyResult {
  return { ok: false, message, detail, transactionHash };
}

function sponsorRefusal(error: unknown): MoneyResult {
  if (error instanceof SponsorError) return refused(error.message, error.detail, error.transactionHash);
  return refused("The sponsored action did not complete. Check your balance before trying again.");
}

export interface DepositInput {
  readonly funding: WalletSigner;
  readonly account: Address;
  readonly sponsor: Sponsor;
  readonly calls: ChainCalls;
  readonly chainId: MoneyChainId;
  readonly value: bigint;
  readonly nowMs: number;
  readonly randomBytes: (length: number) => Uint8Array;
}

// The authorization W will be asked to sign, read and checked against W's balance first. Signs nothing.
export async function prepareDeposit(input: Omit<DepositInput, "sponsor">): Promise<{ readonly ok: true; readonly auth: TransferAuthorization } | { readonly ok: false; readonly message: string }> {
  const chain = moneyChain(input.chainId);
  if (chain === undefined) return { ok: false, message: "Deposits are taken in USDC on Base or Polygon." };
  if (input.value <= 0n) return { ok: false, message: "Enter an amount above zero." };
  const domain = await readTokenDomain(input.calls, chain.chainId, chain.usdc);
  if (domain === null) return { ok: false, message: `The USDC contract on ${chain.name} could not be read, so nothing was signed. Try again in a moment.` };
  const [balance] = await readUsdcBalances(input.calls, chain.chainId, [input.funding.address]);
  if (balance === null || balance === undefined) return { ok: false, message: `Your wallet's USDC balance on ${chain.name} could not be read, so nothing was signed.` };
  if (balance < input.value) return { ok: false, message: `Your wallet holds less USDC on ${chain.name} than that amount.` };
  const nonceBytes = input.randomBytes(32);
  if (nonceBytes.length !== 32) return { ok: false, message: "The browser gave no random bytes for the authorization." };
  const nowSeconds = BigInt(Math.floor(input.nowMs / 1000));
  return {
    ok: true,
    auth: {
      chainId: chain.chainId,
      token: chain.usdc,
      domain,
      from: input.funding.address,
      to: input.account,
      value: input.value,
      validAfter: 0n,
      validBefore: nowSeconds + BigInt(AUTHORIZATION_VALID_SECONDS),
      nonce: bytesToHex(nonceBytes),
    },
  };
}

export async function deposit(input: DepositInput): Promise<MoneyResult> {
  const prepared = await prepareDeposit(input);
  if (!prepared.ok) return refused(prepared.message);
  const typed = transferWithAuthorizationTypedData(prepared.auth);
  let signature: Hex;
  try {
    signature = await input.funding.signTypedData(typed);
  } catch (error) {
    if (error instanceof WalletError && error.code === "rejected") return refused("You declined the deposit in your wallet. Nothing moved.");
    if (error instanceof WalletError && error.code === "unsupported_chain") return refused("Your wallet would not sign for this chain. Nothing moved.");
    return refused("Your wallet did not sign the deposit. Nothing moved.");
  }
  let signer: Address | null = null;
  try {
    signer = await recoverTypedDataAddress({ ...typed, signature });
  } catch {
    signer = null;
  }
  if (signer === null || !isAddressEqual(signer, input.funding.address)) {
    return refused("Your wallet's signature is not a plain key signature from its own address, which this deposit needs. Nothing moved.");
  }
  try {
    const hash = await input.sponsor.sendCalls(prepared.auth.chainId, [{ to: prepared.auth.token, data: transferWithAuthorizationCalldata(prepared.auth, signature) }]);
    return { ok: true, transactionHash: hash };
  } catch (error) {
    return sponsorRefusal(error);
  }
}

export interface WithdrawInput {
  readonly account: Address;
  readonly sponsor: Sponsor;
  readonly calls: ChainCalls;
  readonly chainId: MoneyChainId;
  readonly to: Address;
  readonly value: bigint;
}

export function withdrawCall(chainId: MoneyChainId, to: Address, value: bigint): { readonly to: Address; readonly data: Hex } | null {
  const chain = moneyChain(chainId);
  if (chain === undefined) return null;
  return { to: chain.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, value] }) };
}

export async function withdraw(input: WithdrawInput): Promise<MoneyResult> {
  const chain = moneyChain(input.chainId);
  const call = withdrawCall(input.chainId, input.to, input.value);
  if (chain === undefined || call === null) return refused("Withdrawals are made in USDC on Base or Polygon.");
  if (input.value <= 0n) return refused("Enter an amount above zero.");
  if (isAddressEqual(input.to, input.account)) return refused("That is the trading account itself.");
  const [balance] = await readUsdcBalances(input.calls, input.chainId, [input.account]);
  if (balance === null || balance === undefined) return refused(`The trading account's USDC balance on ${chain.name} could not be read, so nothing was sent.`);
  if (balance < input.value) return refused(`The trading account holds less USDC on ${chain.name} than that amount.`);
  try {
    return { ok: true, transactionHash: await input.sponsor.sendCalls(input.chainId, [call]) };
  } catch (error) {
    return sponsorRefusal(error);
  }
}
