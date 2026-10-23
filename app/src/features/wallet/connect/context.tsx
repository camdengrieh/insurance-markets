import { createContext, useContext, type ReactNode } from "react";

import type { WalletSigner } from "../../../core/signer";

// The one place a screen gets the connected wallet. null when nothing is connected (watching an address is not
// a connection: it signs nothing). The connection itself (discovery, WalletConnect sessions, account and chain
// changes) lives in the provider that renders this context; tests pass a fake signer through SignerProvider.

const SignerContext = createContext<WalletSigner | null>(null);

export function SignerProvider({ signer, children }: { readonly signer: WalletSigner | null; readonly children: ReactNode }) {
  return <SignerContext.Provider value={signer}>{children}</SignerContext.Provider>;
}

export function useWalletSigner(): WalletSigner | null {
  return useContext(SignerContext);
}
