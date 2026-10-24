import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isAddressEqual } from "viem";

import { useAppMode } from "../../ui/context";
import { useWalletSigner } from "../wallet/connect/context";
import type { PrfSupport } from "./passkey";
import { createBrowserAccountServices, type AccountServices } from "./services";
import { createWithPasskey, openFromWallet, retryBackup, unlockWithPasskey, type BackupState, type OpenKey, type SessionResult } from "./session";
import type { AccountRecord, AccountStore } from "./store";
import type { TradingAccount } from "./types";

// The page's one trading account (docs/unified-account-design.md 3.1). The provider holds the open key for this tab,
// what this browser remembers about accounts (store.ts), and the panel's open state; useTradingAccount() gives every
// screen the account (null until it is made or unlocked), and useTradingAccountControls() gives the account panel its
// buttons. The funding wallet is the connected wallet (useWalletSigner): for a derived account only the wallet it was
// made from, for a generated one whichever wallet is connected.

export type AccountBusy = "wallet" | "passkey_create" | "passkey_unlock" | "backup";

export interface TradingAccountControls {
  // Why the account is not offered in this build; null when it is.
  readonly unavailable: string | null;
  readonly account: TradingAccount | null;
  readonly open: OpenKey | null;
  // Accounts this browser remembers (no keys): derived wallets and sealed passkey accounts.
  readonly records: readonly AccountRecord[];
  readonly persistence: AccountStore["persistence"] | null;
  readonly prf: PrfSupport;
  readonly busy: AccountBusy | null;
  readonly error: { readonly message: string; readonly offerPasskey: boolean } | null;
  readonly notice: string | null;
  readonly backup: BackupState | null;
  readonly services: AccountServices;
  readonly panelOpen: boolean;
  openPanel(): void;
  closePanel(): void;
  openWithWallet(): Promise<void>;
  createWithPasskey(): Promise<void>;
  unlockWithPasskey(recordId: string | null): Promise<void>;
  retryBackup(): Promise<void>;
  lock(): void;
}

const Context = createContext<TradingAccountControls | null>(null);

export interface TradingAccountProviderProps {
  // Test seam; production builds the browser's services for this build's mode on first render.
  readonly services?: AccountServices;
  readonly children: ReactNode;
}

export function TradingAccountProvider({ services: given, children }: TradingAccountProviderProps) {
  const mode = useAppMode();
  const services = useMemo(() => given ?? createBrowserAccountServices(mode), [given, mode]);
  const wallet = useWalletSigner();
  const [store, setStore] = useState<AccountStore | null>(null);
  const [records, setRecords] = useState<readonly AccountRecord[]>([]);
  const [prf, setPrf] = useState<PrfSupport>("unknown");
  const [open, setOpen] = useState<OpenKey | null>(null);
  const [busy, setBusy] = useState<AccountBusy | null>(null);
  const [error, setError] = useState<TradingAccountControls["error"]>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const reload = useCallback(async (target: AccountStore) => {
    try {
      const list = await target.list();
      if (live.current) setRecords(list);
    } catch {
      if (live.current) setRecords([]);
    }
  }, []);

  // Open the store and ask about passkey support once, and only where the account is offered.
  useEffect(() => {
    if (services.unavailable !== null) return;
    let current = true;
    void services.openStore().then(async (opened) => {
      if (!current) return;
      setStore(opened);
      await reload(opened);
    });
    void services.passkey.support().then((support) => {
      if (current) setPrf(support);
    });
    return () => {
      current = false;
    };
  }, [services, reload]);

  const settle = useCallback(
    async (result: SessionResult, target: AccountStore, extra?: BackupState) => {
      if (!live.current) return;
      if (result.ok) {
        setOpen(result.key);
        setError(null);
        setNotice(result.notice);
        setBackup(extra ?? null);
      } else {
        setError({ message: result.message, offerPasskey: result.reason === "not_deterministic" || result.reason === "not_plain_key" });
        if (result.reason === "no_prf") setPrf("no");
      }
      await reload(target);
    },
    [reload],
  );

  const openWithWallet = useCallback(async () => {
    if (store === null || wallet === null || busy !== null) return;
    setBusy("wallet");
    setError(null);
    try {
      await settle(await openFromWallet(services, store, wallet), store);
    } finally {
      if (live.current) setBusy(null);
    }
  }, [store, wallet, busy, services, settle]);

  const createPasskeyAccount = useCallback(async () => {
    if (store === null || busy !== null) return;
    setBusy("passkey_create");
    setError(null);
    try {
      const result = await createWithPasskey(services, store);
      await settle(result, store, result.ok ? result.backup : undefined);
    } finally {
      if (live.current) setBusy(null);
    }
  }, [store, busy, services, settle]);

  const unlockPasskeyAccount = useCallback(
    async (recordId: string | null) => {
      if (store === null || busy !== null) return;
      setBusy("passkey_unlock");
      setError(null);
      try {
        const result = await unlockWithPasskey(services, store, recordId);
        const record = result.ok ? (await store.list().catch(() => [])).find((entry) => entry.id === result.key.recordId) : undefined;
        await settle(result, store, record?.kind === "generated" ? (record.backup === "saved" ? { kind: "saved" } : { kind: "not_saved", message: "The encrypted backup has not been saved yet." }) : undefined);
      } finally {
        if (live.current) setBusy(null);
      }
    },
    [store, busy, services, settle],
  );

  const retry = useCallback(async () => {
    if (store === null || open === null || busy !== null) return;
    setBusy("backup");
    try {
      const state = await retryBackup(services, store, open);
      if (live.current) setBackup(state);
      await reload(store);
    } finally {
      if (live.current) setBusy(null);
    }
  }, [store, open, busy, services, reload]);

  const lock = useCallback(() => {
    setOpen(null);
    setBackup(null);
    setNotice(null);
    setError(null);
  }, []);

  const account = useMemo<TradingAccount | null>(() => {
    if (open === null) return null;
    const funding = wallet === null ? null : open.madeFrom === null || isAddressEqual(open.madeFrom, wallet.address) ? wallet : null;
    return { signer: open.signer, address: open.address, mode: open.mode, funding };
  }, [open, wallet]);

  const value = useMemo<TradingAccountControls>(
    () => ({
      unavailable: services.unavailable,
      account,
      open,
      records,
      persistence: store?.persistence ?? null,
      prf,
      busy,
      error,
      notice,
      backup,
      services,
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
      openWithWallet,
      createWithPasskey: createPasskeyAccount,
      unlockWithPasskey: unlockPasskeyAccount,
      retryBackup: retry,
      lock,
    }),
    [services, account, open, records, store, prf, busy, error, notice, backup, panelOpen, openWithWallet, createPasskeyAccount, unlockPasskeyAccount, retry, lock],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// The trading account, or null until it is made or unlocked in this tab (and always null with no provider above).
export function useTradingAccount(): TradingAccount | null {
  return useContext(Context)?.account ?? null;
}

// The account panel's controls; null with no provider above.
export function useTradingAccountControls(): TradingAccountControls | null {
  return useContext(Context);
}

// Opens the account panel from anywhere (the Connect modal's entry point); null where the account is not offered.
export function useOpenTradingAccount(): (() => void) | null {
  const controls = useContext(Context);
  if (controls === null || controls.unavailable !== null) return null;
  return controls.openPanel;
}
