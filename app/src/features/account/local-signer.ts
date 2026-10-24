// The trading key E as a WalletSigner (core/signer.ts, kind "local"; docs/unified-account-design.md section 3.1), so
// every venue executor takes it exactly as it takes a connected wallet. It signs in this tab without a prompt:
// signTypedData, signMessage and signRawMessage sign with E; sendTransaction sends one sponsored call (sponsor.ts) and
// returns the transaction hash. It signs for Polygon, Base, BNB Chain and XO, and sends on the sponsored three only: XO's
// setup and orders go through XO's own bundler, where E signs the user-operation hash with signRawMessage.
//
// The key itself is held in the viem account's closure and nowhere on this object, so handing the signer to an executor
// hands over the ability to sign, not the key.

import { getAddress, type Hex, type LocalAccount, type TypedDataDefinition } from "viem";

import { WalletError, type TransactionRequest, type WalletCapabilities, type WalletSigner } from "../../core/signer";
import { BASE_CHAIN_ID, LOCAL_SIGNER_CHAIN_IDS, SPONSORED_CHAIN_IDS, XO_CHAIN_ID } from "./constants";
import { SponsorError, type Sponsor } from "./sponsor";

export interface LocalSigner extends WalletSigner {
  readonly kind: "local";
}

export const LOCAL_SIGNER_NAME = "Trading account";

export const LOCAL_CAPABILITIES: WalletCapabilities = Object.freeze({ sendTransaction: true, rawMessage: true, chains: LOCAL_SIGNER_CHAIN_IDS });

export interface LocalSignerOptions {
  readonly owner: LocalAccount;
  readonly sponsor: Sponsor;
}

function covers(chainId: number): boolean {
  return LOCAL_SIGNER_CHAIN_IDS.includes(chainId);
}

// The sponsor's refusal as the wallet error every executor already maps; the SponsorError (with the bundler's words and
// any transaction hash) stays reachable as its cause.
function walletErrorOf(error: SponsorError): WalletError {
  const code = error.code === "chain_not_sponsored" ? "unsupported_chain" : error.code === "not_available" || error.code === "delegated_elsewhere" ? "unsupported" : "failed";
  const wallet = new WalletError(code, error.message);
  Object.defineProperty(wallet, "cause", { value: error, enumerable: false });
  return wallet;
}

export function createLocalSigner(options: LocalSignerOptions): LocalSigner {
  const { owner, sponsor } = options;
  let current = BASE_CHAIN_ID as number;

  return {
    kind: "local",
    name: LOCAL_SIGNER_NAME,
    address: getAddress(owner.address),
    capabilities: LOCAL_CAPABILITIES,
    chainId: async () => current,
    async switchChain(chainId) {
      if (!covers(chainId)) throw new WalletError("unsupported_chain", "The trading account signs on Polygon, Base, BNB Chain and XO only.");
      current = chainId;
    },
    async signTypedData(data: TypedDataDefinition) {
      const domainChain = data.domain?.chainId;
      if (domainChain !== undefined) {
        const id = Number(domainChain);
        if (!covers(id)) throw new WalletError("unsupported_chain", "The trading account signs on Polygon, Base, BNB Chain and XO only.");
        current = id;
      }
      return owner.signTypedData(data);
    },
    signMessage: (message: string) => owner.signMessage({ message }),
    async signRawMessage(raw: Hex) {
      if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(raw)) throw new WalletError("failed", "That is not hex bytes.");
      return owner.signMessage({ message: { raw } });
    },
    async sendTransaction(tx: TransactionRequest) {
      if (tx.chainId === XO_CHAIN_ID) throw new WalletError("unsupported", "XO actions go through XO's own account setup, not through this sponsor.");
      if (!SPONSORED_CHAIN_IDS.includes(tx.chainId)) throw new WalletError("unsupported_chain", "Gas is sponsored on Polygon, Base and BNB Chain only.");
      try {
        return await sponsor.sendCalls(tx.chainId, [{ to: tx.to, data: tx.data, ...(tx.value === undefined ? {} : { value: tx.value }) }]);
      } catch (error) {
        if (error instanceof SponsorError) throw walletErrorOf(error);
        throw new WalletError("failed", "The sponsored action did not complete.");
      }
    },
  };
}
