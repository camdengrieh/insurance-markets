// Test support for the trading account: wallets over keys made up for the tests, fake chain reads, a fake sponsor, and a
// fake bundler, paymaster and chain behind viem custom transports that check every user operation the way the real ones
// would (sender, EIP-7702 authorization, the EIP-712 user-operation signature). Imported by *.test.ts(x) only; it contacts
// nothing.

import {
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  erc20Abi,
  getAddress,
  HttpRequestError,
  isAddressEqual,
  parseAbi,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type Transport,
  type TypedDataDefinition,
} from "viem";
import { entryPoint08Address, getUserOperationTypedData } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { recoverAuthorizationAddress } from "viem/utils";

import { WalletError, type WalletSigner } from "../../core/signer";
import type { BackupClient } from "./backup";
import type { PasskeyPort, PasskeyResult, PrfSupport } from "./passkey";
import type { ChainCalls, ReadCall } from "./reads";
import type { AccountServices } from "./services";
import type { Sponsor, SponsorCall } from "./sponsor";
import { createMemoryAccountStore, type AccountStore } from "./store";
import type { SealedKey } from "./vault";

// Keys that exist only in these tests.
export const WALLET_KEY: Hex = `0x${"5a".repeat(32)}`;
export const OTHER_KEY: Hex = `0x${"6b".repeat(32)}`;
export const TRADING_KEY: Hex = `0x${"7c".repeat(32)}`;

export interface FakeWalletOptions {
  readonly key?: Hex;
  // "deterministic": RFC 6979 like every mainstream wallet (a test of a wallet with random nonces turns on viem's signing
  // entropy in a file of its own). "other_key": signs with a key that is not the address's (a smart-contract wallet's
  // answer looks like this to a plain recovery).
  readonly mode?: "deterministic" | "other_key";
  // Answer with v as 0/1 instead of 27/28.
  readonly lowV?: boolean;
  readonly error?: WalletError;
}

export interface FakeWallet extends WalletSigner {
  readonly typedRequests: TypedDataDefinition[];
}

// secp256k1 order, for the malleated twin of a signature (same key, different bytes).
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export function fakeWallet(options: FakeWalletOptions = {}): FakeWallet {
  const account = privateKeyToAccount(options.key ?? WALLET_KEY);
  const signing = options.mode === "other_key" ? privateKeyToAccount(OTHER_KEY) : account;
  const typedRequests: TypedDataDefinition[] = [];
  return {
    kind: "injected",
    name: "Test wallet",
    address: getAddress(account.address),
    capabilities: { sendTransaction: false, rawMessage: true, chains: "any" },
    typedRequests,
    chainId: async () => 8453,
    switchChain: async () => undefined,
    async signTypedData(data) {
      typedRequests.push(data);
      if (options.error !== undefined) throw options.error;
      let signature = await signing.signTypedData(data as Parameters<typeof signing.signTypedData>[0]);
      if (options.lowV === true) signature = `${signature.slice(0, 130)}${signature.endsWith("1b") ? "00" : "01"}` as Hex;
      return signature;
    },
    signMessage: (message) => signing.signMessage({ message }),
    signRawMessage: (raw) => signing.signMessage({ message: { raw } }),
    sendTransaction: async () => {
      throw new WalletError("unsupported", "not in these tests");
    },
  };
}

// The high-s form of a 65-byte signature (same key, same message; a wallet could answer either).
export function highS(signature: Hex): Hex {
  const r = signature.slice(2, 66);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = Number.parseInt(signature.slice(130), 16);
  const flipped = (N - s).toString(16).padStart(64, "0");
  return `0x${r}${flipped}${(v === 27 ? 28 : 27).toString(16)}`;
}

// ---- chain reads ----------------------------------------------------------------------------------------------------------------

export interface FakeToken {
  readonly name: string;
  readonly version: string;
  readonly balances: Map<string, bigint>;
}

export function fakeChainCalls(tokens: Record<number, Record<string, FakeToken>>, log: Array<{ chainId: number; call: ReadCall }> = []): ChainCalls {
  const versionAbi = parseAbi(["function version() view returns (string)"]);
  return async (chainId, calls) =>
    calls.map((call) => {
      log.push({ chainId, call });
      const token = tokens[chainId]?.[call.to.toLowerCase()];
      if (token === undefined) return null;
      const decoded = (() => {
        try {
          return decodeFunctionData({ abi: [...erc20Abi, ...versionAbi], data: call.data });
        } catch {
          return null;
        }
      })();
      if (decoded === null) return null;
      if (decoded.functionName === "name") return encodeFunctionResult({ abi: erc20Abi, functionName: "name", result: token.name });
      if (decoded.functionName === "version") return encodeFunctionResult({ abi: versionAbi, functionName: "version", result: token.version });
      if (decoded.functionName === "balanceOf") {
        const holder = (decoded.args as readonly [Address])[0];
        return encodeAbiParameters([{ type: "uint256" }], [token.balances.get(holder.toLowerCase()) ?? 0n]);
      }
      return null;
    });
}

// ---- sponsor --------------------------------------------------------------------------------------------------------------------

export interface FakeSponsor extends Sponsor {
  readonly sent: Array<{ chainId: number; calls: readonly SponsorCall[] }>;
}

export function fakeSponsor(answer: (chainId: number, calls: readonly SponsorCall[]) => Promise<Hex> = async () => `0x${"ab".repeat(32)}`): FakeSponsor {
  const sent: Array<{ chainId: number; calls: readonly SponsorCall[] }> = [];
  return {
    sent,
    async sendCalls(chainId, calls) {
      sent.push({ chainId, calls });
      return answer(chainId, calls);
    },
  };
}

// ---- a fake chain, bundler and paymaster ----------------------------------------------------------------------------------------

// A reserved .invalid host: never resolvable; only named in the fake route errors below.
const PAYMASTER_HOST = "paymaster.test.invalid";
export const FAKE_PAYMASTER: Address = getAddress(`0x${"9d".repeat(20)}`);
export const FAKE_TX_HASH: Hex = `0x${"5e".repeat(32)}`;
export const FAKE_USEROP_HASH: Hex = `0x${"4f".repeat(32)}`;

export interface RpcRequestLog {
  readonly method: string;
  readonly params: readonly unknown[];
}

export interface FakeNetworkOptions {
  // E's code on the chain: "0x" (not delegated), the delegation designator, or something else.
  readonly code: Hex;
  readonly txCount?: number;
  readonly success?: boolean;
  // The paymaster route answers every request with this HTTP status instead.
  readonly paymasterStatus?: number;
}

export interface FakeNetwork {
  readonly chain: typeof base;
  readonly rpc: Transport;
  readonly paymaster: Transport;
  readonly rpcLog: RpcRequestLog[];
  readonly bundlerLog: RpcRequestLog[];
  // Every user operation the bundler accepted, with what it checked.
  readonly accepted: Array<{ readonly userOp: Record<string, unknown>; readonly signer: Address; readonly authorizationSigner: Address | null }>;
}

function quantity(value: number | bigint): Hex {
  return `0x${value.toString(16)}`;
}

function rpcFields(op: Record<string, unknown>) {
  const big = (key: string): bigint | undefined => (typeof op[key] === "string" ? BigInt(op[key] as string) : undefined);
  const auth = op.eip7702Auth as { address: Address; chainId: Hex; nonce: Hex; r: Hex; s: Hex; yParity: Hex } | undefined;
  return {
    sender: op.sender as Address,
    nonce: big("nonce") ?? 0n,
    callData: op.callData as Hex,
    callGasLimit: big("callGasLimit") ?? 0n,
    verificationGasLimit: big("verificationGasLimit") ?? 0n,
    preVerificationGas: big("preVerificationGas") ?? 0n,
    maxFeePerGas: big("maxFeePerGas") ?? 0n,
    maxPriorityFeePerGas: big("maxPriorityFeePerGas") ?? 0n,
    ...(typeof op.factory === "string" ? { factory: op.factory as Address, factoryData: (op.factoryData as Hex | undefined) ?? "0x" } : {}),
    ...(typeof op.paymaster === "string"
      ? { paymaster: op.paymaster as Address, paymasterData: op.paymasterData as Hex, paymasterVerificationGasLimit: big("paymasterVerificationGasLimit") ?? 0n, paymasterPostOpGasLimit: big("paymasterPostOpGasLimit") ?? 0n }
      : {}),
    signature: op.signature as Hex,
    ...(auth === undefined ? {} : { authorization: { address: auth.address, chainId: Number(BigInt(auth.chainId)), nonce: Number(BigInt(auth.nonce)), r: auth.r, s: auth.s, yParity: Number(BigInt(auth.yParity)) } }),
  };
}

export function fakeNetwork(owner: Address, options: FakeNetworkOptions): FakeNetwork {
  const rpcLog: RpcRequestLog[] = [];
  const bundlerLog: RpcRequestLog[] = [];
  const accepted: FakeNetwork["accepted"] = [];
  const chainId = base.id;
  let lastOp: Record<string, unknown> | null = null;

  const rpc = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      const list = (params ?? []) as unknown[];
      rpcLog.push({ method, params: list });
      if (method === "eth_chainId") return quantity(chainId);
      if (method === "eth_getCode") return options.code;
      if (method === "eth_getTransactionCount") return quantity(options.txCount ?? 0);
      if (method === "eth_call") {
        const call = list[0] as { to: Address; data: Hex };
        if (isAddressEqual(call.to, entryPoint08Address)) return encodeAbiParameters([{ type: "uint256" }], [0n]);
        return "0x";
      }
      throw new Error(`the fake chain does not answer ${method}`);
    },
  });

  const paymaster = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      const list = (params ?? []) as unknown[];
      bundlerLog.push({ method, params: list });
      if (options.paymasterStatus !== undefined) {
        throw new HttpRequestError({ url: `https://${PAYMASTER_HOST}`, status: options.paymasterStatus, body: { method } });
      }
      if (method === "eth_chainId") return quantity(chainId);
      if (method === "pimlico_getUserOperationGasPrice") {
        const tier = { maxFeePerGas: quantity(2_000_000n), maxPriorityFeePerGas: quantity(1_000_000n) };
        return { slow: tier, standard: tier, fast: tier };
      }
      if (method === "pm_getPaymasterStubData") {
        return { paymaster: FAKE_PAYMASTER, paymasterData: "0x", paymasterVerificationGasLimit: quantity(60_000), paymasterPostOpGasLimit: quantity(1) };
      }
      if (method === "pm_getPaymasterData") return { paymaster: FAKE_PAYMASTER, paymasterData: `0x${"11".repeat(65)}`, paymasterVerificationGasLimit: quantity(60_000), paymasterPostOpGasLimit: quantity(1) };
      if (method === "eth_estimateUserOperationGas") {
        return { callGasLimit: quantity(80_000), verificationGasLimit: quantity(90_000), preVerificationGas: quantity(50_000), paymasterVerificationGasLimit: quantity(60_000), paymasterPostOpGasLimit: quantity(1) };
      }
      if (method === "eth_sendUserOperation") {
        const op = list[0] as Record<string, unknown>;
        const entryPoint = list[1] as Address;
        if (!isAddressEqual(entryPoint, entryPoint08Address)) throw new Error("wrong entry point");
        const fields = rpcFields(op);
        const typed = getUserOperationTypedData({ chainId, entryPointAddress: entryPoint08Address, userOperation: fields as never });
        const signer = await recoverTypedDataAddress({ ...typed, signature: fields.signature } as never);
        const authorization = (fields as { authorization?: { address: Address; chainId: number; nonce: number; r: Hex; s: Hex; yParity: number } }).authorization;
        const authorizationSigner = authorization === undefined ? null : await recoverAuthorizationAddress({ authorization });
        if (!isAddressEqual(signer, owner)) throw new Error("the user operation is not signed by its sender");
        accepted.push({ userOp: op, signer, authorizationSigner });
        lastOp = op;
        return FAKE_USEROP_HASH;
      }
      if (method === "eth_getUserOperationReceipt") {
        if (lastOp === null) return null;
        return {
          userOpHash: FAKE_USEROP_HASH,
          entryPoint: entryPoint08Address,
          sender: lastOp.sender,
          nonce: lastOp.nonce,
          paymaster: FAKE_PAYMASTER,
          actualGasCost: quantity(1),
          actualGasUsed: quantity(1),
          success: options.success ?? true,
          ...(options.success === false ? { reason: "0x" } : {}),
          logs: [],
          receipt: {
            transactionHash: FAKE_TX_HASH,
            transactionIndex: "0x0",
            blockHash: `0x${"22".repeat(32)}`,
            blockNumber: "0x10",
            from: FAKE_PAYMASTER,
            to: entryPoint08Address,
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            contractAddress: null,
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            status: options.success === false ? "0x0" : "0x1",
            effectiveGasPrice: "0x1",
            type: "0x4",
          },
        };
      }
      throw new Error(`the fake bundler does not answer ${method}`);
    },
  });

  return { chain: base, rpc, paymaster, rpcLog, bundlerLog, accepted };
}

// ---- services --------------------------------------------------------------------------------------------------------------------

export const TEST_CREDENTIAL = "0a0b0c0d";
export const TEST_PRF = new Uint8Array(32).fill(3);

export interface FakePasskeyOptions {
  readonly support?: PrfSupport;
  readonly createResult?: PasskeyResult;
  // Which credential the authenticator answers with on an assertion (default: the one asked for, or TEST_CREDENTIAL).
  readonly assertAs?: string;
}

export function fakePasskey(options: FakePasskeyOptions = {}): PasskeyPort & { readonly asked: Array<string | null> } {
  const asked: Array<string | null> = [];
  return {
    asked,
    support: async () => options.support ?? "yes",
    create: async () => options.createResult ?? { ok: true, credentialId: TEST_CREDENTIAL, prf: TEST_PRF },
    assert: async (credentialId) => {
      asked.push(credentialId);
      if ((options.support ?? "yes") === "no") return { ok: false, reason: "no_prf", message: "no prf" };
      return { ok: true, credentialId: options.assertAs ?? credentialId ?? TEST_CREDENTIAL, prf: TEST_PRF };
    },
  };
}

export function memoryBackup(options: { readonly failPut?: string } = {}): BackupClient & { readonly blobs: Map<string, SealedKey> } {
  const blobs = new Map<string, SealedKey>();
  return {
    blobs,
    put: async (sealed) => {
      if (options.failPut !== undefined) return { ok: false, message: options.failPut };
      blobs.set(sealed.credentialId, sealed);
      return { ok: true };
    },
    get: async (credentialId) => {
      const found = blobs.get(credentialId);
      return found === undefined ? { kind: "none" } : { kind: "found", sealed: found };
    },
  };
}

export interface FakeServicesOptions {
  readonly unavailable?: string | null;
  readonly store?: AccountStore;
  readonly passkey?: PasskeyPort;
  readonly backup?: BackupClient;
  readonly calls?: ChainCalls;
  readonly sponsor?: Sponsor;
}

export function fakeServices(options: FakeServicesOptions = {}): AccountServices {
  const store = options.store ?? createMemoryAccountStore();
  return {
    unavailable: options.unavailable ?? null,
    openStore: async () => store,
    passkey: options.passkey ?? fakePasskey(),
    backup: options.backup ?? memoryBackup(),
    calls: options.calls ?? fakeChainCalls({}),
    sponsorFor: () => options.sponsor ?? fakeSponsor(),
    subtle: globalThis.crypto.subtle,
    randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
    nowMs: () => 1_792_756_800_000,
  };
}
