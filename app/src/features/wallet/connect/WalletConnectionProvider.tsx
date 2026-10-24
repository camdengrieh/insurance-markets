import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { WalletErrorCode, WalletSigner } from "../../../core/signer";
import { requestedNamespaces, type SessionLike } from "../../../core/walletconnect";
import { useAppMode } from "../../../ui/context";
import { SignerProvider } from "./context";
import { NOT_CONFIGURED, defaultWalletEnvironment, type WalletEnvironment } from "./environment";
import { cleanWalletName, discoverWallets, type DiscoveredWallet, type Eip1193Provider } from "./eip6963";
import { walletErrorOf } from "./errors";
import { accountsOf, chainIdOf, createInjectedSigner } from "./injected";
import { createWalletConnectSigner, peerName, type SignClientLike, type WalletConnectSigner } from "./walletconnect-signer";

// The page's one wallet connection (docs/dapp-paybox-web.md route F, plus browser wallets). It owns:
//   - discovery of browser wallets (EIP-6963), silent: it asks no wallet for anything;
//   - the active connection, a browser wallet or a WalletConnect session, and its account and chain changes;
//   - reconnecting after a reload without a prompt: eth_accounts for the last browser wallet, or the stored
//     WalletConnect session (sign-client keeps its sessions in this browser's storage; nothing leaves it);
//   - disconnecting;
// and renders SignerProvider with the current signer, so a screen gets it through useWalletSigner(). An account change
// replaces the signer with a new object; an empty account list, a disconnect event or a deleted or expired session
// ends the connection.

export type ConnectVia = "injected" | "walletconnect";

export type ConnectionPhase =
  | { readonly kind: "idle" }
  | { readonly kind: "restoring"; readonly via: ConnectVia }
  | { readonly kind: "connecting"; readonly via: "injected"; readonly walletId: string }
  // Waiting for a wallet to approve the pairing; uri is null until the client has minted it.
  | { readonly kind: "pairing"; readonly uri: string | null }
  | { readonly kind: "connected"; readonly via: ConnectVia };

export interface ConnectionError {
  readonly via: ConnectVia;
  readonly code: WalletErrorCode;
  readonly message: string;
}

export interface WalletConnectState {
  readonly status: "ready" | "not_configured" | "blocked";
  // Why it cannot start, in words; null when ready.
  readonly reason: string | null;
}

export interface WalletConnection {
  readonly wallets: readonly DiscoveredWallet[];
  // True until the first discovery round (and its window.ethereum fallback) is over.
  readonly discovering: boolean;
  readonly phase: ConnectionPhase;
  readonly signer: WalletSigner | null;
  // The chain the connected wallet is on, as last reported; null when not known.
  readonly chainId: number | null;
  readonly error: ConnectionError | null;
  readonly walletConnect: WalletConnectState;
  readonly host: string;
  readonly origin: string;
  readonly now: () => number;
  connectInjected(walletId: string): Promise<void>;
  startWalletConnect(): Promise<void>;
  cancelWalletConnect(): void;
  disconnect(): Promise<void>;
}

export const LAST_WALLET_KEY = "xo-cockpit.wallet.last";

type Remembered = { readonly via: "injected"; readonly walletId: string } | { readonly via: "walletconnect"; readonly topic: string };

function readRemembered(raw: string | null): Remembered | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { via?: unknown; walletId?: unknown; topic?: unknown };
    if (value.via === "injected" && typeof value.walletId === "string" && value.walletId.length <= 120) return { via: "injected", walletId: value.walletId };
    if (value.via === "walletconnect" && typeof value.topic === "string" && /^[0-9a-f]{64}$/.test(value.topic)) return { via: "walletconnect", topic: value.topic };
  } catch {
    // Not ours, or damaged: forgotten below.
  }
  return null;
}

const IDLE: ConnectionPhase = { kind: "idle" };

// The phase that matches the connection as it stands (after a failed or cancelled attempt).
function phaseOf(signer: WalletSigner | null): ConnectionPhase {
  // A connection's signer is never the trading account's local one; the mapping only keeps the type total.
  return signer === null ? IDLE : { kind: "connected", via: signer.kind === "walletconnect" ? "walletconnect" : "injected" };
}

function walletConnectState(environment: WalletEnvironment): WalletConnectState {
  if (environment.walletConnect.blocked !== null) return { status: "blocked", reason: environment.walletConnect.blocked };
  if (environment.walletConnect.projectId === null) return { status: "not_configured", reason: NOT_CONFIGURED };
  return { status: "ready", reason: null };
}

// What a screen sees with no provider above it: nothing connected, nothing to connect with.
const NO_CONNECTION: WalletConnection = {
  wallets: [],
  discovering: false,
  phase: IDLE,
  signer: null,
  chainId: null,
  error: null,
  walletConnect: { status: "blocked", reason: "Wallet connection is not available on this screen." },
  host: "",
  origin: "",
  now: () => Date.now(),
  connectInjected: async () => undefined,
  startWalletConnect: async () => undefined,
  cancelWalletConnect: () => undefined,
  disconnect: async () => undefined,
};

const ConnectionContext = createContext<WalletConnection>(NO_CONNECTION);

export function useWalletConnection(): WalletConnection {
  return useContext(ConnectionContext);
}

export interface WalletConnectionProviderProps {
  // Test seam; production uses the real window, storage and WalletConnect client for this build.
  readonly environment?: WalletEnvironment;
  readonly children: ReactNode;
}

export function WalletConnectionProvider({ environment: given, children }: WalletConnectionProviderProps) {
  const mode = useAppMode();
  const environment = useMemo(() => given ?? defaultWalletEnvironment(mode), [given, mode]);
  const [wallets, setWallets] = useState<readonly DiscoveredWallet[]>([]);
  const [discovering, setDiscovering] = useState(environment.target !== null);
  const [phase, setPhase] = useState<ConnectionPhase>(IDLE);
  const [signer, setSigner] = useState<WalletSigner | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<ConnectionError | null>(null);

  // Bumped by every start, cancel and disconnect, so an answer that arrives late for an abandoned attempt is ignored.
  const attempt = useRef(0);
  // Removes the listeners of the active connection.
  const detach = useRef<(() => void) | null>(null);
  const client = useRef<Promise<SignClientLike> | null>(null);
  const clientListeners = useRef(false);
  const current = useRef<WalletSigner | null>(null);
  const restoredInjected = useRef(false);

  const remember = useCallback((value: Remembered | null) => {
    if (value === null) environment.storage?.removeItem(LAST_WALLET_KEY);
    else environment.storage?.setItem(LAST_WALLET_KEY, JSON.stringify(value));
  }, [environment]);

  const settle = useCallback((next: WalletSigner | null, via: ConnectVia | null, chain: number | null) => {
    current.current = next;
    setSigner(next);
    setChainId(chain);
    setPhase(next === null || via === null ? IDLE : { kind: "connected", via });
  }, []);

  // Ends the connection on this page (the wallet itself is told only for WalletConnect, by disconnect()).
  const end = useCallback(() => {
    attempt.current += 1;
    detach.current?.();
    detach.current = null;
    remember(null);
    settle(null, null, null);
  }, [remember, settle]);

  // ---- browser wallets ----------------------------------------------------------------------------------------------------

  const adoptInjected = useCallback((wallet: DiscoveredWallet, address: WalletSigner["address"], chain: number | null) => {
    detach.current?.();
    const provider: Eip1193Provider = wallet.provider;
    let active = createInjectedSigner({ provider, name: wallet.nameText, address });
    const onAccounts = (raw: unknown): void => {
      const accounts = accountsOf(raw);
      const first = accounts[0];
      if (first === undefined) {
        end();
        return;
      }
      if (first === active.address) return;
      active = createInjectedSigner({ provider, name: wallet.nameText, address: first });
      current.current = active;
      setSigner(active);
    };
    const onChain = (raw: unknown): void => setChainId(chainIdOf(raw));
    const onDisconnect = (): void => end();
    provider.on?.("accountsChanged", onAccounts as (...args: never[]) => void);
    provider.on?.("chainChanged", onChain as (...args: never[]) => void);
    provider.on?.("disconnect", onDisconnect as (...args: never[]) => void);
    detach.current = () => {
      provider.removeListener?.("accountsChanged", onAccounts as (...args: never[]) => void);
      provider.removeListener?.("chainChanged", onChain as (...args: never[]) => void);
      provider.removeListener?.("disconnect", onDisconnect as (...args: never[]) => void);
    };
    remember({ via: "injected", walletId: wallet.id });
    settle(active, "injected", chain);
  }, [end, remember, settle]);

  const readChain = async (provider: Eip1193Provider): Promise<number | null> => {
    try {
      return chainIdOf(await provider.request({ method: "eth_chainId" }));
    } catch {
      return null;
    }
  };

  const connectInjected = useCallback(async (walletId: string) => {
    const wallet = wallets.find((entry) => entry.id === walletId);
    if (wallet === undefined) return;
    const mine = ++attempt.current;
    setError(null);
    setPhase({ kind: "connecting", via: "injected", walletId });
    try {
      const accounts = accountsOf(await wallet.provider.request({ method: "eth_requestAccounts" }));
      const first = accounts[0];
      if (mine !== attempt.current) return;
      if (first === undefined) throw new Error("The wallet shared no account.");
      const chain = await readChain(wallet.provider);
      if (mine !== attempt.current) return;
      adoptInjected(wallet, first, chain);
    } catch (caught) {
      if (mine !== attempt.current) return;
      const mapped = walletErrorOf(caught);
      setError({ via: "injected", code: mapped.code, message: mapped.message });
      setPhase(phaseOf(current.current));
    }
  }, [wallets, adoptInjected]);

  // Discovery, once per environment.
  useEffect(() => {
    if (environment.target === null) {
      setDiscovering(false);
      return undefined;
    }
    return discoverWallets(
      environment.target,
      (list, done) => {
        setWallets(list);
        if (done) setDiscovering(false);
      },
      environment.fallbackDelayMs === undefined ? {} : { fallbackDelayMs: environment.fallbackDelayMs },
    );
  }, [environment]);

  // Reconnect the last browser wallet without a prompt, once it has announced itself.
  useEffect(() => {
    if (restoredInjected.current || current.current !== null) return;
    const remembered = readRemembered(environment.storage?.getItem(LAST_WALLET_KEY) ?? null);
    if (remembered?.via !== "injected") return;
    const wallet = wallets.find((entry) => entry.id === remembered.walletId);
    if (wallet === undefined) return;
    restoredInjected.current = true;
    const mine = ++attempt.current;
    setPhase({ kind: "restoring", via: "injected" });
    void (async () => {
      try {
        const first = accountsOf(await wallet.provider.request({ method: "eth_accounts" }))[0];
        if (mine !== attempt.current) return;
        if (first === undefined) {
          setPhase(IDLE);
          return;
        }
        const chain = await readChain(wallet.provider);
        if (mine === attempt.current) adoptInjected(wallet, first, chain);
      } catch {
        if (mine === attempt.current) setPhase(IDLE);
      }
    })();
  }, [wallets, environment, adoptInjected]);

  // ---- WalletConnect --------------------------------------------------------------------------------------------------------

  const wcState = useMemo(() => walletConnectState(environment), [environment]);

  const adoptSession = useCallback((sign: SignClientLike, session: SessionLike, options: { address?: WalletSigner["address"]; chainId?: number } = {}): boolean => {
    const name = cleanWalletName(peerName(session)).text;
    const next = createWalletConnectSigner({ client: sign, session, name, ...options });
    if (next === null) return false;
    detach.current?.();
    detach.current = null;
    remember({ via: "walletconnect", topic: session.topic });
    settle(next, "walletconnect", options.chainId ?? next.facts.chains[0] ?? null);
    return true;
  }, [remember, settle]);

  const getClient = useCallback((): Promise<SignClientLike> => {
    const projectId = environment.walletConnect.projectId;
    if (projectId === null || environment.walletConnect.blocked !== null) return Promise.reject(new Error(NOT_CONFIGURED));
    client.current ??= environment.walletConnect.load(projectId).catch((caught: unknown) => {
      client.current = null;
      throw caught;
    });
    return client.current.then((sign) => {
      if (!clientListeners.current) {
        clientListeners.current = true;
        // Session-level events for whichever session is active. Each looks the active signer up when it fires.
        const activeFor = (topic: unknown): WalletConnectSigner | null => {
          const active = current.current as WalletConnectSigner | null;
          return active !== null && active.kind === "walletconnect" && active.topic === topic ? active : null;
        };
        sign.on("session_delete", ((payload: { topic?: unknown }) => {
          if (activeFor(payload?.topic) !== null) end();
        }) as (payload: never) => void);
        sign.on("session_expire", ((payload: { topic?: unknown }) => {
          if (activeFor(payload?.topic) !== null) end();
        }) as (payload: never) => void);
        sign.on("session_update", ((payload: { topic?: unknown }) => {
          const active = activeFor(payload?.topic);
          if (active === null) return;
          const session = sign.session.getAll().find((entry) => entry.topic === active.topic);
          if (session === undefined || !adoptSession(sign, session, { address: active.address })) end();
        }) as (payload: never) => void);
        sign.on("session_event", ((payload: { topic?: unknown; params?: { event?: { name?: unknown; data?: unknown } } }) => {
          const active = activeFor(payload?.topic);
          const event = payload?.params?.event;
          if (active === null || event === undefined) return;
          if (event.name === "chainChanged") {
            const chain = chainIdOf(event.data);
            if (chain !== null && active.facts.chains.includes(chain)) {
              active.noteChain(chain);
              setChainId(chain);
            }
          } else if (event.name === "accountsChanged") {
            const raw = Array.isArray(event.data) ? event.data.map((entry) => (typeof entry === "string" ? entry.split(":").pop() : entry)) : [];
            const first = accountsOf(raw).find((address) => active.facts.addresses.includes(address));
            if (first === undefined || first === active.address) return;
            const session = sign.session.getAll().find((entry) => entry.topic === active.topic);
            if (session !== undefined) void active.chainId().then((chain) => adoptSession(sign, session, { address: first, chainId: chain }));
          }
        }) as (payload: never) => void);
      }
      return sign;
    });
  }, [environment, end, adoptSession]);

  const startWalletConnect = useCallback(async () => {
    if (wcState.status !== "ready") return;
    const mine = ++attempt.current;
    setError(null);
    setPhase({ kind: "pairing", uri: null });
    try {
      const sign = await getClient();
      if (mine !== attempt.current) return;
      const { uri, approval } = await sign.connect({ optionalNamespaces: requestedNamespaces() });
      if (mine !== attempt.current) return;
      setPhase({ kind: "pairing", uri: typeof uri === "string" && uri.startsWith("wc:") ? uri : null });
      const session = await approval();
      if (mine !== attempt.current) {
        // Approved after the visitor cancelled: end that session at once rather than keep it unseen.
        void sign.disconnect({ topic: session.topic, reason: { code: 6000, message: "User disconnected." } }).catch(() => undefined);
        return;
      }
      if (!adoptSession(sign, session)) {
        void sign.disconnect({ topic: session.topic, reason: { code: 5100, message: "No eip155 account approved." } }).catch(() => undefined);
        throw new Error("The wallet approved no Ethereum account this page can use.");
      }
    } catch (caught) {
      if (mine !== attempt.current) return;
      const mapped = walletErrorOf(caught);
      setError({ via: "walletconnect", code: mapped.code, message: mapped.message });
      setPhase(IDLE);
    }
  }, [wcState.status, getClient, adoptSession]);

  const cancelWalletConnect = useCallback(() => {
    attempt.current += 1;
    setPhase(phaseOf(current.current));
  }, []);

  // Restore a stored WalletConnect session at load. The client (and its relay connection) starts only when this
  // browser holds a session from an earlier visit.
  useEffect(() => {
    const remembered = readRemembered(environment.storage?.getItem(LAST_WALLET_KEY) ?? null);
    if (remembered?.via !== "walletconnect") return;
    if (walletConnectState(environment).status !== "ready") return;
    const mine = ++attempt.current;
    setPhase({ kind: "restoring", via: "walletconnect" });
    void getClient()
      .then((sign) => {
        if (mine !== attempt.current) return;
        const nowSeconds = Math.floor(environment.now() / 1000);
        const session = sign.session.getAll().find((entry) => entry.topic === remembered.topic && entry.expiry > nowSeconds);
        if (session === undefined || !adoptSession(sign, session)) {
          remember(null);
          setPhase(IDLE);
        }
      })
      .catch(() => {
        if (mine === attempt.current) setPhase(IDLE);
      });
    // Once per environment: getClient, adoptSession and remember are stable for it.
  }, [environment]);

  const disconnect = useCallback(async () => {
    const active = current.current;
    end();
    setError(null);
    if (active?.kind === "walletconnect" && client.current !== null) {
      const topic = (active as WalletConnectSigner).topic;
      try {
        const sign = await client.current;
        await sign.disconnect({ topic, reason: { code: 6000, message: "User disconnected." } });
      } catch {
        // The session is forgotten on this page either way; the wallet drops it when it next hears from the relay.
      }
    }
  }, [end]);

  // Listeners go when the provider does.
  useEffect(() => () => detach.current?.(), []);

  const value = useMemo<WalletConnection>(
    () => ({
      wallets,
      discovering,
      phase,
      signer,
      chainId,
      error,
      walletConnect: wcState,
      host: environment.host,
      origin: environment.origin,
      now: environment.now,
      connectInjected,
      startWalletConnect,
      cancelWalletConnect,
      disconnect,
    }),
    [wallets, discovering, phase, signer, chainId, error, wcState, environment, connectInjected, startWalletConnect, cancelWalletConnect, disconnect],
  );

  return (
    <ConnectionContext.Provider value={value}>
      <SignerProvider signer={signer}>{children}</SignerProvider>
    </ConnectionContext.Provider>
  );
}
