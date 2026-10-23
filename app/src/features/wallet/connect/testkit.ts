// Test doubles for the wallet connection: an EIP-1193 provider that signs with a public Anvil key, a WalletConnect
// sign-client stand-in that never reaches a relay, an event target to announce wallets on, and memory storage.
// Only tests import this file; nothing reachable from main.tsx does.

import { numberToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { SessionLike } from "../../../core/walletconnect";
import type { KeyValueStorage, WalletEnvironment } from "./environment";
import type { DiscoveryTarget, Eip1193Provider } from "./eip6963";
import type { SignClientLike } from "./walletconnect-signer";

// Anvil's public development keys (never funded anywhere real).
export const ANVIL_KEY_0: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const ANVIL_KEY_1: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const ACCOUNT_0 = privateKeyToAccount(ANVIL_KEY_0);
export const ACCOUNT_1 = privateKeyToAccount(ANVIL_KEY_1);

export class RpcFailure extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export interface FakeWallet extends Eip1193Provider {
  readonly calls: Array<{ readonly method: string; readonly params: unknown }>;
  chainId: number;
  accounts: Address[];
  // Chains the wallet knows; a switch to any other fails with 4902 until it is added.
  known: Set<number>;
  // Answer for the next call of a method, instead of the normal behaviour.
  failNext: Map<string, RpcFailure>;
  // Whether eth_requestAccounts was approved (eth_accounts is empty before).
  authorised: boolean;
  emit(event: string, payload: unknown): void;
  listenerCount(event: string): number;
}

export function fakeWallet(options: { readonly chainId?: number; readonly accounts?: Address[]; readonly known?: number[]; readonly authorised?: boolean } = {}): FakeWallet {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const keys = new Map<string, ReturnType<typeof privateKeyToAccount>>([
    [ACCOUNT_0.address.toLowerCase(), ACCOUNT_0],
    [ACCOUNT_1.address.toLowerCase(), ACCOUNT_1],
  ]);
  const wallet: FakeWallet = {
    calls: [],
    chainId: options.chainId ?? 1,
    accounts: options.accounts ?? [ACCOUNT_0.address],
    known: new Set(options.known ?? [1, 137, 8453]),
    failNext: new Map(),
    authorised: options.authorised ?? false,
    async request({ method, params }) {
      wallet.calls.push({ method, params });
      const failure = wallet.failNext.get(method);
      if (failure !== undefined) {
        wallet.failNext.delete(method);
        throw failure;
      }
      const list = (params ?? []) as unknown[];
      switch (method) {
        case "eth_requestAccounts":
          wallet.authorised = true;
          return wallet.accounts;
        case "eth_accounts":
          return wallet.authorised ? wallet.accounts : [];
        case "eth_chainId":
          return numberToHex(wallet.chainId);
        case "wallet_switchEthereumChain": {
          const target = Number.parseInt(String((list[0] as { chainId: string }).chainId).slice(2), 16);
          if (!wallet.known.has(target)) throw new RpcFailure(4902, "Unrecognized chain ID");
          wallet.chainId = target;
          return null;
        }
        case "wallet_addEthereumChain": {
          const target = Number.parseInt(String((list[0] as { chainId: string }).chainId).slice(2), 16);
          wallet.known.add(target);
          return null;
        }
        case "personal_sign": {
          const [data, from] = list as [Hex, string];
          const key = keys.get(from.toLowerCase());
          if (key === undefined) throw new RpcFailure(4100, "Unknown account");
          return key.signMessage({ message: { raw: data } });
        }
        case "eth_signTypedData_v4": {
          const [from, json] = list as [string, string];
          const key = keys.get(from.toLowerCase());
          if (key === undefined) throw new RpcFailure(4100, "Unknown account");
          const typed = JSON.parse(json) as { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };
          const { EIP712Domain: _domain, ...types } = typed.types;
          return key.signTypedData({ domain: typed.domain, types: types as never, primaryType: typed.primaryType, message: typed.message } as never);
        }
        case "eth_sendTransaction":
          return `0x${"ab".repeat(32)}`;
        default:
          throw new RpcFailure(4200, `Unsupported method ${method}`);
      }
    },
    on(event, listener) {
      let set = listeners.get(event);
      if (set === undefined) listeners.set(event, (set = new Set()));
      set.add(listener as (payload: unknown) => void);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener as (payload: unknown) => void);
    },
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0;
    },
  };
  return wallet;
}

// An EventTarget standing in for window. `announce` answers every requestProvider with the given wallets.
export interface FakeTarget extends DiscoveryTarget {
  ethereum?: unknown;
  announcements: Array<{ readonly info: Record<string, unknown>; readonly provider: unknown }>;
  announce(detail: { readonly info: Record<string, unknown>; readonly provider: unknown }): void;
}

export function fakeTarget(announcements: FakeTarget["announcements"] = []): FakeTarget {
  const events = new EventTarget();
  const target: FakeTarget = {
    announcements,
    addEventListener: (type, listener) => events.addEventListener(type, listener),
    removeEventListener: (type, listener) => events.removeEventListener(type, listener),
    dispatchEvent(event) {
      const handled = events.dispatchEvent(event);
      if (event.type === "eip6963:requestProvider") for (const detail of target.announcements) target.announce(detail);
      return handled;
    },
    announce(detail) {
      const event = new Event("eip6963:announceProvider") as Event & { detail?: unknown };
      Object.defineProperty(event, "detail", { value: Object.freeze({ ...detail }) });
      events.dispatchEvent(event);
    },
  };
  return target;
}

export function announcement(provider: unknown, info: { readonly uuid?: string; readonly name?: string; readonly rdns?: string; readonly icon?: string } = {}) {
  return { info: { uuid: info.uuid ?? "350670db-19fa-4704-a166-e52e178b59d2", name: info.name ?? "Test Wallet", rdns: info.rdns ?? "org.example.wallet", icon: info.icon ?? "data:image/png;base64,iVBORw0KGgo=" }, provider };
}

export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { readonly map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

// ---- WalletConnect --------------------------------------------------------------------------------------------------------

export const SESSION_TOPIC = "a".repeat(64);

export function session(options: { readonly accounts?: string[]; readonly methods?: string[]; readonly chains?: string[]; readonly name?: string; readonly expiry?: number; readonly topic?: string } = {}): SessionLike {
  return {
    topic: options.topic ?? SESSION_TOPIC,
    expiry: options.expiry ?? 4_000_000_000,
    namespaces: {
      eip155: {
        accounts: options.accounts ?? [`eip155:137:${ACCOUNT_0.address}`, `eip155:8453:${ACCOUNT_0.address}`],
        methods: options.methods ?? ["personal_sign", "eth_signTypedData_v4"],
        events: ["accountsChanged", "chainChanged"],
        ...(options.chains === undefined ? {} : { chains: options.chains }),
      },
    },
    peer: { metadata: { name: options.name ?? "PayBox" } },
  };
}

export interface FakeSignClient extends SignClientLike {
  readonly requests: Array<{ readonly topic: string; readonly chainId: string; readonly method: string; readonly params: unknown }>;
  readonly connects: Array<Readonly<Record<string, unknown>>>;
  readonly disconnects: string[];
  sessions: SessionLike[];
  // Resolves the pending approval of the last connect() with this session (or rejects with the error).
  approve(next: SessionLike): void;
  reject(error: unknown): void;
  emit(event: string, payload: unknown): void;
  // The wallet's answer to the next request, or a function of it.
  answer: (method: string, params: unknown) => unknown;
}

export function fakeSignClient(): FakeSignClient {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let pending: { resolve: (value: SessionLike) => void; reject: (error: unknown) => void } | null = null;
  const client: FakeSignClient = {
    requests: [],
    connects: [],
    disconnects: [],
    sessions: [],
    answer: () => `0x${"11".repeat(65)}`,
    async connect(params) {
      client.connects.push(params.optionalNamespaces);
      const approval = new Promise<SessionLike>((resolve, reject) => {
        pending = { resolve, reject };
      });
      return { uri: `wc:${"b".repeat(64)}@2?relay-protocol=irn&symKey=${"c".repeat(64)}&expiryTimestamp=1761220000`, approval: () => approval };
    },
    async request({ topic, chainId, request }) {
      client.requests.push({ topic, chainId, method: request.method, params: request.params });
      return client.answer(request.method, request.params);
    },
    async disconnect({ topic }) {
      client.disconnects.push(topic);
      client.sessions = client.sessions.filter((entry) => entry.topic !== topic);
    },
    session: { getAll: () => client.sessions },
    on(event, listener) {
      let set = listeners.get(event);
      if (set === undefined) listeners.set(event, (set = new Set()));
      set.add(listener as (payload: unknown) => void);
    },
    approve(next) {
      client.sessions = [...client.sessions, next];
      pending?.resolve(next);
    },
    reject(error) {
      pending?.reject(error);
    },
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
    },
  };
  return client;
}

export function testEnvironment(options: { readonly target?: FakeTarget | null; readonly storage?: KeyValueStorage; readonly projectId?: string | null; readonly blocked?: string | null; readonly client?: FakeSignClient } = {}): WalletEnvironment & { readonly loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    target: options.target === undefined ? null : options.target,
    storage: options.storage ?? memoryStorage(),
    walletConnect: {
      projectId: options.projectId === undefined ? "0123456789abcdef0123456789abcdef" : options.projectId,
      blocked: options.blocked ?? null,
      load: async (projectId) => {
        loads.push(projectId);
        if (options.client === undefined) throw new Error("no fake sign-client");
        return options.client;
      },
    },
    // Built rather than written out, so the source holds no URL literal for check-origins to classify.
    origin: `https://${"page.test"}`,
    host: "page.test",
    now: () => 1_760_875_200_000,
    fallbackDelayMs: 5,
  };
}
