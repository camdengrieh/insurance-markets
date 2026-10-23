import { getTypesForEIP712Domain, numberToHex, serializeTypedData, stringToHex, validateTypedData, type Address, type Hex, type TypedDataDefinition } from "viem";

import { WalletError, type TransactionRequest, type WalletSigner } from "../../../core/signer";
import { sessionFacts, type SessionFacts, type SessionLike } from "../../../core/walletconnect";
import { chainName } from "./chains";
import { guard } from "./errors";

// A WalletConnect v2 session as a WalletSigner. The wallet (PayBox, or a phone wallet) holds the key; every request
// goes to it through the relay, end-to-end encrypted, and it answers or refuses. What the session approved is what
// the signer offers: its chains, and eth_sendTransaction only when the wallet granted it (PayBox does not).
//
// WalletConnect has no "current chain" of its own: each request names its chain. The signer keeps one, starting at
// the first approved chain; switchChain moves it within the approved chains (asking the wallet too when the session
// granted wallet_switchEthereumChain) and refuses any other chain.

// The slice of @walletconnect/sign-client the page uses, so tests can stand in for it without a relay.
export interface SignClientLike {
  connect(params: { readonly optionalNamespaces: Readonly<Record<string, unknown>> }): Promise<{ readonly uri?: string; readonly approval: () => Promise<SessionLike> }>;
  request(params: { readonly topic: string; readonly chainId: string; readonly request: { readonly method: string; readonly params: unknown } }): Promise<unknown>;
  disconnect(params: { readonly topic: string; readonly reason: { readonly code: number; readonly message: string } }): Promise<void>;
  readonly session: { getAll(): SessionLike[] };
  on(event: string, listener: (payload: never) => void): unknown;
  off?(event: string, listener: (payload: never) => void): unknown;
  removeListener?(event: string, listener: (payload: never) => void): unknown;
}

// The wallet's name from the session's peer metadata, or the generic words. Untrusted text either way.
export function peerName(session: SessionLike): string {
  const raw = session.peer?.metadata?.name;
  return typeof raw === "string" && raw.trim() !== "" ? raw : "WalletConnect wallet";
}

function hexOf(raw: unknown, what: string): Hex {
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]*$/.test(raw)) throw new WalletError("failed", `The wallet returned something that is not a ${what}.`);
  return raw as Hex;
}

export interface WalletConnectSigner extends WalletSigner {
  readonly topic: string;
  readonly facts: SessionFacts;
  // The wallet said it moved to this chain (a chainChanged session event). Ignored for a chain outside the session.
  noteChain(chainId: number): void;
}

export interface WalletConnectSignerInput {
  readonly client: SignClientLike;
  readonly session: SessionLike;
  // The account to use, when the wallet approved several (a later accountsChanged event). Must be in the session.
  readonly address?: Address;
  readonly chainId?: number;
  readonly name: string;
}

// null when the session holds no usable eip155 account.
export function createWalletConnectSigner({ client, session, address, chainId, name }: WalletConnectSignerInput): WalletConnectSigner | null {
  const found = sessionFacts(session);
  if (found === null) return null;
  const facts: SessionFacts = found;
  const account = address !== undefined && facts.addresses.includes(address) ? address : facts.address;
  let current = chainId !== undefined && facts.chains.includes(chainId) ? chainId : (facts.chains[0] as number);

  function approved(target: number): void {
    if (!facts.chains.includes(target)) {
      throw new WalletError("unsupported_chain", `Your wallet did not approve ${chainName(target)} for this connection. It approved ${facts.chains.map(chainName).join(", ")}.`);
    }
  }

  async function ask(target: number, method: string, params: unknown): Promise<unknown> {
    approved(target);
    if (!facts.methods.includes(method)) throw new WalletError("unsupported", "Your wallet did not approve this kind of request for this connection.");
    return guard(() => client.request({ topic: session.topic, chainId: `eip155:${target}`, request: { method, params } }));
  }

  return Object.freeze({
    kind: "walletconnect" as const,
    name,
    address: account,
    topic: session.topic,
    facts,
    capabilities: Object.freeze({ sendTransaction: facts.sendTransaction, chains: Object.freeze([...facts.chains]) }),
    noteChain(next: number): void {
      if (facts.chains.includes(next)) current = next;
    },
    async chainId(): Promise<number> {
      return current;
    },
    async switchChain(target: number): Promise<void> {
      approved(target);
      if (target === current) return;
      if (facts.switchChain) await ask(current, "wallet_switchEthereumChain", [{ chainId: numberToHex(target) }]);
      current = target;
    },
    async signTypedData(data: TypedDataDefinition): Promise<Hex> {
      // Wallets refuse a typed-data domain on another chain than the request's (PayBox among them), so the request
      // goes out on the domain's chain.
      const domainChain = data.domain?.chainId;
      const target = domainChain === undefined ? current : Number(domainChain);
      approved(target);
      // The EIP712Domain type is derived from the domain's fields, as viem's own signTypedData does; without it the
      // serialised domain would be empty.
      const typed = data as TypedDataDefinition<Record<string, unknown>, string>;
      const types = { EIP712Domain: getTypesForEIP712Domain({ domain: typed.domain }), ...(typed.types as Record<string, unknown>) };
      let payload: string;
      try {
        validateTypedData({ ...typed, types } as never);
        payload = serializeTypedData({ ...typed, types } as never);
      } catch {
        throw new WalletError("failed", "This page built typed data that does not match its own types; nothing was sent to the wallet.");
      }
      const signature = hexOf(await ask(target, "eth_signTypedData_v4", [account, payload]), "signature");
      current = target;
      return signature;
    },
    async signMessage(message: string): Promise<Hex> {
      // personal_sign takes the UTF-8 text hex-encoded, then the address. PayBox signs only text that is valid UTF-8,
      // which a JavaScript string always encodes to.
      return hexOf(await ask(current, "personal_sign", [stringToHex(message), account]), "signature");
    },
    async sendTransaction(tx: TransactionRequest): Promise<Hex> {
      if (!facts.sendTransaction) {
        throw new WalletError("unsupported", "This wallet signs messages over WalletConnect but does not send transactions (PayBox refuses them).");
      }
      const params = { from: account, to: tx.to, data: tx.data, ...(tx.value === undefined ? {} : { value: numberToHex(tx.value) }) };
      const hash = hexOf(await ask(tx.chainId, "eth_sendTransaction", [params]), "transaction hash");
      current = tx.chainId;
      return hash;
    },
  });
}
