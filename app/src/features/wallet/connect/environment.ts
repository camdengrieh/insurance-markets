import { WALLETCONNECT_PROJECT_ID, isProjectId } from "../../../core/walletconnect";
import type { AppMode } from "../../../ui/context";
import type { DiscoveryTarget } from "./eip6963";
import { loadSignClient } from "./walletconnect-client";
import type { SignClientLike } from "./walletconnect-signer";

// Everything the wallet connection takes from outside the page's own code: the window it listens on for wallets, the
// storage that remembers the last wallet, and how WalletConnect is started. Production passes the real ones
// (defaultWalletEnvironment); tests pass fakes, so no test reaches a relay or a browser extension.

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WalletConnectSetup {
  // The Reown project id, or null when this build has none.
  readonly projectId: string | null;
  // Why WalletConnect cannot run in this build at all, in words, or null.
  readonly blocked: string | null;
  readonly load: (projectId: string) => Promise<SignClientLike>;
}

export interface WalletEnvironment {
  readonly target: DiscoveryTarget | null;
  readonly storage: KeyValueStorage | null;
  readonly walletConnect: WalletConnectSetup;
  // This page's origin and host, for the WalletConnect metadata and the signed address proof.
  readonly origin: string;
  readonly host: string;
  readonly now: () => number;
  readonly fallbackDelayMs?: number;
}

export const COCKPIT_WALLETCONNECT_BLOCKED =
  "WalletConnect is off in this local build: its policy lets the page talk only to its own server (connect-src 'self'), so the page cannot reach the WalletConnect relay. Use a browser wallet here, or open the hosted page.";

export const NOT_CONFIGURED = "WalletConnect is not configured in this build";

// Browser storage can be missing or throw (a private window, blocked site data); the connection then simply does not
// remember the last wallet.
function safeLocalStorage(): KeyValueStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (storage === undefined) return null;
    return {
      getItem: (key) => {
        try {
          return storage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, value);
        } catch {
          // Not remembered; nothing else changes.
        }
      },
      removeItem: (key) => {
        try {
          storage.removeItem(key);
        } catch {
          // As above.
        }
      },
    };
  } catch {
    return null;
  }
}

export function defaultWalletEnvironment(mode: AppMode): WalletEnvironment {
  const hasWindow = typeof window !== "undefined";
  const origin = hasWindow ? window.location.origin : "";
  return {
    target: hasWindow ? (window as unknown as DiscoveryTarget) : null,
    storage: safeLocalStorage(),
    walletConnect: {
      projectId: isProjectId(WALLETCONNECT_PROJECT_ID) ? WALLETCONNECT_PROJECT_ID : null,
      blocked: mode === "cockpit" ? COCKPIT_WALLETCONNECT_BLOCKED : null,
      load: (projectId) => loadSignClient({ projectId, origin }),
    },
    origin,
    host: hasWindow ? window.location.host : "",
    now: () => Date.now(),
  };
}
