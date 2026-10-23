import { APP_NAME } from "../../../ui/Shell";
import { WALLETCONNECT_RELAY_URL } from "../../../core/walletconnect";
import type { SignClientLike } from "./walletconnect-signer";

// Loads @walletconnect/sign-client (its own chunk, fetched from this page's origin only when the visitor starts
// WalletConnect or a stored session is restored) and starts it the way this page needs:
//   - the relay named explicitly (the CSP lists exactly it);
//   - telemetry off, so nothing is posted to the WalletConnect events endpoint;
//   - Verify registration replaced with a no-op. On a dApp it would load an iframe from the Verify server for every
//     request; this page's CSP blocks frames (default-src 'none'), so the iframe could only time out, five seconds per
//     request. The wallet then sees the page's origin as unverified, which is the truth: nothing vouches for it.
// The metadata names this page by its own origin and carries no icon (a wallet would fetch an icon from wherever it
// points; this page points it nowhere).

export interface SignClientInit {
  readonly projectId: string;
  readonly origin: string;
}

export async function loadSignClient({ projectId, origin }: SignClientInit): Promise<SignClientLike> {
  const { SignClient } = await import("@walletconnect/sign-client");
  const client = await SignClient.init({
    projectId,
    relayUrl: WALLETCONNECT_RELAY_URL,
    telemetryEnabled: false,
    logger: "error",
    metadata: {
      name: APP_NAME,
      description: "Prediction markets across venues. Your wallet keeps the keys; this page asks it to sign and shows you each request first.",
      url: origin,
      icons: [],
    },
  });
  const verify = client.core.verify as { register: (params: unknown) => Promise<string> };
  verify.register = async () => "";
  return client as unknown as SignClientLike;
}
