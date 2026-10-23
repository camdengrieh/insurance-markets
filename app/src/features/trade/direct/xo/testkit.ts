// Test support for the XO direct-execution tests: a wallet signer over a key made up for the tests, a fake relay that
// records every request and answers as XO would, and an in-memory Web Storage. Imported by *.test.ts(x) only; it
// contacts nothing.

import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, getAddress, type Address, type Hex, type TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { POLICY_PAYMASTER_ABI } from "@sdk/chain/xo/abi";
import { ENTRY_POINT_V07, POLICY_PAYMASTER } from "@sdk/chain/xo/constants";
import { deriveAccount } from "@sdk/trade/xo/account/derive";
import { userOpHash } from "@sdk/trade/xo/userop/hash";
import { fromRpcUserOperation } from "@shared/xo/userop/bundler";

import { WalletError, type WalletCapabilities, type WalletSigner } from "../../../../core/signer";
import type { CredentialStorage } from "./credentials";
import type { RelayFetch } from "./relay";

// A key that exists only in these tests.
export const TEST_KEY: Hex = `0x${"4c".repeat(32)}`;
// A reserved .invalid host: never resolvable, and every request to it goes to fakeRelay below.
const RELAY_HOST = "relay.test.invalid";
export const RELAY_ORIGIN = `https://${RELAY_HOST}`;
export const XO_NOW_S = 1_792_756_800;
export const TOKEN_ID = "52114319501245915516055106046884209969926127482827954674443846427813813222426";

export interface SignerCall {
  readonly method: "chainId" | "switchChain" | "signTypedData" | "signMessage" | "signRawMessage" | "sendTransaction";
  readonly arg?: unknown;
}

export interface FakeSignerOptions {
  readonly kind?: "injected" | "walletconnect";
  readonly chains?: WalletCapabilities["chains"];
  readonly startChain?: number;
  readonly switchError?: WalletError;
  readonly signError?: WalletError;
  // Sign with another key than the one the address names (a wallet answering for the wrong account).
  readonly signWith?: Hex;
  // capabilities.rawMessage (default: true for a browser wallet, false for WalletConnect).
  readonly rawMessage?: boolean;
  // How the wallet answers a raw-bytes request: sign as personal_sign does (default), sign the bytes with no EIP-191
  // prefix (a wallet doing something else than asked), or refuse as PayBox does.
  readonly rawMode?: "personal" | "unprefixed" | "refuse";
}

export interface FakeSigner extends WalletSigner {
  readonly calls: SignerCall[];
}

export function fakeSigner(options: FakeSignerOptions = {}): FakeSigner {
  const account = privateKeyToAccount(TEST_KEY);
  const signing = options.signWith === undefined ? account : privateKeyToAccount(options.signWith);
  const calls: SignerCall[] = [];
  let chain = options.startChain ?? 1;
  return {
    kind: options.kind ?? "injected",
    name: "Test wallet",
    address: getAddress(account.address),
    capabilities: { sendTransaction: options.kind !== "walletconnect", rawMessage: options.rawMessage ?? options.kind !== "walletconnect", chains: options.chains ?? "any" },
    calls,
    async chainId() {
      calls.push({ method: "chainId" });
      return chain;
    },
    async switchChain(chainId: number) {
      calls.push({ method: "switchChain", arg: chainId });
      if (options.switchError !== undefined) throw options.switchError;
      chain = chainId;
    },
    async signTypedData(data: TypedDataDefinition) {
      calls.push({ method: "signTypedData", arg: data });
      if (options.signError !== undefined) throw options.signError;
      const domainChain = (data.domain as { chainId?: number } | undefined)?.chainId;
      if (domainChain !== chain) throw new WalletError("failed", "the domain chain differs from the active chain");
      return signing.signTypedData(data as Parameters<typeof signing.signTypedData>[0]);
    },
    async signMessage(message: string) {
      calls.push({ method: "signMessage", arg: message });
      return signing.signMessage({ message });
    },
    async signRawMessage(raw: Hex) {
      calls.push({ method: "signRawMessage", arg: raw });
      if (options.signError !== undefined) throw options.signError;
      if (options.rawMode === "refuse") throw new WalletError("unsupported", "Your wallet refused to sign raw bytes over this connection.");
      if (options.rawMode === "unprefixed") return signing.sign({ hash: raw });
      return signing.signMessage({ message: { raw } });
    },
    async sendTransaction() {
      calls.push({ method: "sendTransaction" });
      throw new WalletError("unsupported", "not in these tests");
    },
  };
}

export interface RelayCall {
  readonly url: string;
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
  readonly init: RequestInit;
}

export interface FakeReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly text?: string;
  // "relay": the relay's own refusal (no x-xo-relay: upstream).
  readonly from?: "xo" | "relay";
}

export type Route = (call: RelayCall) => FakeReply | Promise<FakeReply> | undefined;

// A fake of the markets API's relay. `routes` answer by "METHOD /path"; /time answers XO_NOW_S unless overridden.
export function fakeRelay(routes: Readonly<Record<string, Route>> = {}): { readonly fetch: RelayFetch; readonly calls: RelayCall[] } {
  const calls: RelayCall[] = [];
  const fetchImpl: RelayFetch = async (url, init) => {
    const parsed = new URL(url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const path = parsed.pathname.replace(/^\/v1\/relay\/xo\/clob/, "");
    const call: RelayCall = { url, path, method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : null, init };
    calls.push(call);
    // The bundler route is keyed by its full path ("POST /v1/relay/xo/bundler"), the order-book routes by XO's path.
    const route = routes[`${call.method} ${path.startsWith("/orders/") ? "/orders/:hash" : path}`];
    const reply = (await route?.(call)) ?? (path === "/time" ? { text: String(XO_NOW_S) } : { status: 404, body: { error: "not found" } });
    const text = reply.text ?? JSON.stringify(reply.body ?? {});
    return new Response(text, { status: reply.status ?? 200, headers: { "content-type": reply.text === undefined ? "application/json" : "text/plain", ...(reply.from === "relay" ? { "x-xo-relay": "refused" } : { "x-xo-relay": "upstream" }) } });
  };
  return { fetch: fetchImpl, calls };
}

// ---- XO's bundler behind the relay ------------------------------------------------------------------------------------

export interface BundlerRequest {
  readonly id: unknown;
  readonly method: string;
  readonly params: readonly unknown[];
}

// A JSON-RPC result, a JSON-RPC error, or a whole relay reply (a refusal by the relay itself, say).
export type BundlerReply = { readonly result: unknown } | { readonly error: { readonly code: number; readonly message: string } } | { readonly reply: FakeReply };

// The route for POST /v1/relay/xo/bundler: answers each JSON-RPC request with the handler for its method, echoing the
// id as a bundler does. A method with no handler gets the bundler's "method not found".
export function fakeBundler(handlers: Readonly<Record<string, (request: BundlerRequest) => BundlerReply | Promise<BundlerReply>>>, seen: BundlerRequest[] = []): Route {
  return async (call) => {
    const body = JSON.parse(call.body ?? "null") as { id: unknown; method: string; params: unknown[] };
    const request: BundlerRequest = { id: body.id, method: body.method, params: body.params };
    seen.push(request);
    const handler = handlers[body.method];
    const answer: BundlerReply = handler === undefined ? { error: { code: -32601, message: "method not found" } } : await handler(request);
    if ("reply" in answer) return answer.reply;
    return { body: { jsonrpc: "2.0", id: body.id, ...answer } };
  };
}

// A made-up transaction hash for the receipts below.
export const TEST_TX: Hex = `0x${"77".repeat(32)}`;

export interface SetupBundlerOptions {
  readonly estimate?: (request: BundlerRequest) => BundlerReply;
  readonly send?: (request: BundlerRequest) => BundlerReply;
  // The receipt answers in order; after the list, the last one repeats. Default: one null, then the success.
  readonly receipts?: ReadonlyArray<"none" | "ok" | "reverted">;
}

// A bundler for the account setup: an estimate, a send that answers the operation's own hash (as XO's bundler does), and
// receipts for the test's own account.
export function fakeSetupBundler(options: SetupBundlerOptions = {}): { readonly route: Route; readonly seen: BundlerRequest[] } {
  const seen: BundlerRequest[] = [];
  let polls = 0;
  const receipts = options.receipts ?? ["none", "ok"];
  const account = getAddress(deriveAccount(ownerAddress()));
  const route = fakeBundler(
    {
      eth_estimateUserOperationGas: options.estimate ?? (() => ({ result: { preVerificationGas: "0xd000", verificationGasLimit: "0x50000", callGasLimit: "0x20000", paymasterVerificationGasLimit: "0x9000", paymasterPostOpGasLimit: "0x6000" } })),
      eth_sendUserOperation: options.send ?? ((request) => ({ result: userOpHash(fromRpcUserOperation(request.params[0])) })),
      eth_getUserOperationReceipt: (request) => {
        const step = receipts[Math.min(polls, receipts.length - 1)];
        polls += 1;
        if (step === "none") return { result: null };
        const success = step === "ok";
        return {
          result: { userOpHash: request.params[0], sender: account, nonce: "0x0", success, actualGasCost: "0x0", actualGasUsed: "0x1", ...(success ? {} : { reason: "AA reverted: test" }), receipt: { transactionHash: TEST_TX, blockNumber: "0x10" } },
        };
      },
    },
    seen,
  );
  return { route, seen };
}

export interface ChainCallLike {
  readonly to: Address;
  readonly data: Hex;
}

// XO's chain for the account setup's eth_calls: EntryPoint.getNonce answers `nonce`, the PolicyPaymaster answers paused()
// and checkPolicy() as told; anything else reverts. `down` makes every read fail at the transport.
export function fakeXoChain(options: { readonly nonce?: bigint; readonly paused?: boolean; readonly policy?: boolean; readonly down?: boolean } = {}) {
  const seen: ChainCallLike[] = [];
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  const call = async (calls: readonly ChainCallLike[]): Promise<ReadonlyArray<Hex | null>> => {
    if (options.down === true) throw new TypeError("Failed to fetch");
    seen.push(...calls);
    return calls.map((entry) => {
      if (same(entry.to, ENTRY_POINT_V07)) return encodeAbiParameters([{ type: "uint256" }], [options.nonce ?? 0n]);
      if (!same(entry.to, POLICY_PAYMASTER)) return null;
      const decoded = decodeFunctionData({ abi: POLICY_PAYMASTER_ABI, data: entry.data });
      if (decoded.functionName === "paused") return encodeFunctionResult({ abi: POLICY_PAYMASTER_ABI, functionName: "paused", result: options.paused ?? false });
      if (decoded.functionName === "checkPolicy") return encodeFunctionResult({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", result: [options.policy ?? true, ""] });
      return null;
    });
  };
  return { call, seen };
}

export function memoryStorage(): CredentialStorage & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

// A fixed random source for salts (non-zero).
export function fixedRandom(bytes: number): Uint8Array {
  return Uint8Array.from({ length: bytes }, (_, index) => index + 1);
}

export const CREDENTIAL = Object.freeze({ apiKey: "11111111-2222-3333-4444-555555555555", secret: "c2VjcmV0LWZvci10ZXN0cy1vbmx5LTEyMzQ1Ng==", passphrase: "test-passphrase-only" });

export function ownerAddress(): Address {
  return getAddress(privateKeyToAccount(TEST_KEY).address);
}
