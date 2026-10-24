// The connected wallet as every write path in the page sees it (browser wallets found through EIP-6963, and
// WalletConnect v2 sessions, which is how PayBox and phone wallets connect). The wallet keeps the keys: the page
// only ever asks it to sign or send, and every request is shown on a Signature Card first. Nothing here is a key,
// and nothing here talks to a venue.
//
// A wallet is a different trust zone from the page: its name and anything it returns are untrusted text, and an
// address is used only after the page checks it (core/address.ts).

import type { Address, Hex, TypedDataDefinition } from "viem";

// "local" is the page's own trading key (features/account, docs/unified-account-design.md 3.1), not a connected wallet:
// it signs in this tab without a prompt, and its sendTransaction sends one sponsored call.
export type WalletKind = "injected" | "walletconnect" | "local";

export type WalletErrorCode =
  // The person declined in the wallet (EIP-1193 4001).
  | "rejected"
  // The wallet cannot do this at all (PayBox over WalletConnect signs no transactions; EIP-1193 4200).
  | "unsupported"
  // The wallet will not sign for, or switch to, this chain (EIP-1193 4901/4902, or a chain outside the session).
  | "unsupported_chain"
  // The session ended or the wallet went away (EIP-1193 4900, a WalletConnect session deleted or expired).
  | "disconnected"
  // Anything else; the message says what the wallet answered, cleaned.
  | "failed";

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export interface WalletCapabilities {
  // Whether the wallet sends transactions. Browser wallets do; PayBox over WalletConnect does not (it signs text
  // and EIP-712 typed data only, docs/dapp-paybox-web.md section 0), and a WalletConnect session that did not
  // grant eth_sendTransaction does not either.
  readonly sendTransaction: boolean;
  // Whether the wallet can be asked to personal_sign raw bytes (signRawMessage). Browser wallets can. A WalletConnect
  // session can only when it approved personal_sign, and even then the wallet may refuse bytes that are not text:
  // PayBox signs valid UTF-8 text only (docs/dapp-paybox-web.md section 0) and answers such a request with a refusal,
  // which the signer reports as WalletError("unsupported").
  readonly rawMessage: boolean;
  // The chains the wallet will sign for: the session's approved chains for WalletConnect, "any" for a browser
  // wallet (it can be asked to switch to, or add, a chain).
  readonly chains: readonly number[] | "any";
}

export interface TransactionRequest {
  readonly chainId: number;
  readonly to: Address;
  readonly data: Hex;
  readonly value?: bigint;
}

export interface WalletSigner {
  readonly kind: WalletKind;
  // The wallet's own display name (EIP-6963 info.name, or the WalletConnect peer's metadata name). Untrusted text.
  readonly name: string;
  // The connected account, checksummed. A wallet that changes account ends this signer; a new one is made.
  readonly address: Address;
  readonly capabilities: WalletCapabilities;
  chainId(): Promise<number>;
  // Rejects with WalletError("unsupported_chain") when the wallet will not switch to, or add, the chain.
  switchChain(chainId: number): Promise<void>;
  // Switches to data.domain.chainId first when the wallet is on another chain (wallets refuse a typed-data domain
  // whose chainId differs from the active chain).
  signTypedData(data: TypedDataDefinition): Promise<Hex>;
  signMessage(message: string): Promise<Hex>;
  // EIP-191 personal_sign of the given bytes as bytes, not of their hex spelling as text: the signature is over
  // keccak256("\x19Ethereum Signed Message:\n" + len + bytes). This is what an ERC-4337 user operation for an XO (Kernel
  // v3.1) account is signed with: the owner signs the 32-byte userOpHash this way, as XO's own app does, and the
  // account's ECDSA validator accepts it (sdk/trade/xo/userop/verify.ts). Rejects with WalletError("unsupported") when
  // capabilities.rawMessage is false or the wallet refuses binary data.
  signRawMessage(raw: Hex): Promise<Hex>;
  // Rejects with WalletError("unsupported") when capabilities.sendTransaction is false. Returns the transaction hash.
  sendTransaction(tx: TransactionRequest): Promise<Hex>;
}
