import { createWalletClient, custom, getAddress, isAddress, numberToHex, type Address, type Hex, type TypedDataDefinition } from "viem";

import { WalletError, type TransactionRequest, type WalletSigner } from "../../../core/signer";
import { addableChain, chainName } from "./chains";
import type { Eip1193Provider } from "./eip6963";
import { guard, rpcCodeOf, walletErrorOf } from "./errors";

// A browser wallet (an EIP-1193 provider found through EIP-6963) as a WalletSigner, through viem's wallet client.
// The wallet holds the key and shows its own prompt for every request; this object only forwards the request and
// maps the answer. It can be asked to switch to, or add, any chain (capabilities.chains "any"), and it sends
// transactions.

// Accounts as a wallet returns them: the checksummed addresses that pass the format check, in order. Anything else
// in the list is dropped (a wallet's answer is untrusted).
export function accountsOf(raw: unknown): Address[] {
  if (!Array.isArray(raw)) return [];
  const out: Address[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(entry) || !isAddress(entry, { strict: false })) continue;
    const address = getAddress(entry);
    if (!out.includes(address)) out.push(address);
  }
  return out;
}

// A chain id as a wallet reports it ("0x89", or sometimes a decimal number). null when it is not one.
export function chainIdOf(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const value = /^0x[0-9a-fA-F]{1,13}$/.test(raw) ? Number.parseInt(raw.slice(2), 16) : /^[0-9]{1,16}$/.test(raw) ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function hexOf(raw: unknown, what: string): Hex {
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]*$/.test(raw)) throw new WalletError("failed", `The wallet returned something that is not a ${what}.`);
  return raw as Hex;
}

export interface InjectedSignerInput {
  readonly provider: Eip1193Provider;
  // The wallet's name, already cleaned (DiscoveredWallet.nameText). Untrusted text all the same.
  readonly name: string;
  readonly address: Address;
}

export function createInjectedSigner({ provider, name, address }: InjectedSignerInput): WalletSigner {
  // retryCount 0: a retried request would raise a second prompt in the wallet.
  const client = createWalletClient({ account: address, transport: custom(provider, { retryCount: 0 }) });

  async function chainId(): Promise<number> {
    const id = chainIdOf(await guard(() => provider.request({ method: "eth_chainId" })));
    if (id === null) throw new WalletError("failed", "The wallet did not say which chain it is on.");
    return id;
  }

  async function switchChain(target: number): Promise<void> {
    try {
      await client.switchChain({ id: target });
    } catch (error) {
      // 4902: the wallet does not know the chain. Offer it, when the page has a public RPC for it, then switch.
      if (rpcCodeOf(error) !== 4902) {
        const mapped = walletErrorOf(error);
        throw mapped.code === "failed" ? new WalletError("unsupported_chain", `Your wallet did not switch to ${chainName(target)}. ${mapped.message}`) : mapped;
      }
      const chain = addableChain(target);
      if (chain === null) throw new WalletError("unsupported_chain", `Your wallet does not know ${chainName(target)}, and this page has no public endpoint to offer it.`);
      await guard(() => client.addChain({ chain }));
      // Most wallets switch when they add a chain; ask again only if this one did not.
      if ((await chainId()) !== target) await guard(() => client.switchChain({ id: target }));
    }
    if ((await chainId()) !== target) throw new WalletError("unsupported_chain", `Your wallet stayed off ${chainName(target)}.`);
  }

  async function ensureChain(target: number): Promise<void> {
    if ((await chainId()) !== target) await switchChain(target);
  }

  return Object.freeze({
    kind: "injected" as const,
    name,
    address,
    capabilities: Object.freeze({ sendTransaction: true, chains: "any" as const }),
    chainId,
    switchChain,
    async signTypedData(data: TypedDataDefinition): Promise<Hex> {
      const domainChain = data.domain?.chainId;
      if (domainChain !== undefined) await ensureChain(Number(domainChain));
      const signature = await guard(() => client.signTypedData({ ...(data as TypedDataDefinition<Record<string, unknown>, string>), account: address }));
      return hexOf(signature, "signature");
    },
    async signMessage(message: string): Promise<Hex> {
      return hexOf(await guard(() => client.signMessage({ account: address, message })), "signature");
    },
    async sendTransaction(tx: TransactionRequest): Promise<Hex> {
      await ensureChain(tx.chainId);
      // Sent as given, without a gas estimate or nonce from the page: the wallet fills those and shows the result.
      const params = { from: address, to: tx.to, data: tx.data, ...(tx.value === undefined ? {} : { value: numberToHex(tx.value) }) };
      const hash = await guard(() => provider.request({ method: "eth_sendTransaction", params: [params] }));
      return hexOf(hash, "transaction hash");
    },
  });
}
