// Making, unlocking and backing up a trading account: the steps behind the panel's buttons, free of React so they can be
// tested with fake services. Each returns a value (never throws for anything the visitor can meet), with fixed app words.
//
// An open account is the key in memory for this tab only (an `OpenKey`): it is never written anywhere in the clear,
// "Lock" drops it, and a reload needs the wallet signature or the passkey again.

import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex, PrivateKeyAccount } from "viem";

import type { WalletSigner } from "../../core/signer";
import { deriveTradingKey, type DeriveFailure } from "./derive";
import { createLocalSigner, type LocalSigner } from "./local-signer";
import type { AccountServices } from "./services";
import type { Sponsor } from "./sponsor";
import { derivedRecordId, generatedRecordId, type AccountRecord, type AccountStore, type GeneratedRecord } from "./store";
import type { TradingAccountMode } from "./types";
import { newTradingKey, openTradingKey, sealTradingKey, wrappingKeyFromPrf, type SealedKey } from "./vault";

export interface OpenKey {
  readonly mode: TradingAccountMode;
  readonly address: Address;
  readonly signer: LocalSigner;
  readonly sponsor: Sponsor;
  // The wallet a derived account was made from; null for a generated one.
  readonly madeFrom: Address | null;
  // The generated account's record id (for its backup state); null for a derived one.
  readonly recordId: string | null;
  // The key, for the explicit export only. The panel asks for a confirmation before it calls this.
  reveal(): Hex;
}

export type SessionResult =
  | { readonly ok: true; readonly key: OpenKey; readonly notice: string | null }
  | { readonly ok: false; readonly reason: DeriveFailure | "no_prf" | "cancelled" | "not_found" | "storage" | "failed"; readonly message: string };

function openKey(services: AccountServices, privateKey: Hex, mode: TradingAccountMode, madeFrom: Address | null, recordId: string | null): OpenKey {
  const owner: PrivateKeyAccount = privateKeyToAccount(privateKey);
  const sponsor = services.sponsorFor(owner);
  const signer = createLocalSigner({ owner, sponsor });
  return { mode, address: owner.address, signer, sponsor, madeFrom, recordId, reveal: () => privateKey };
}

// ---- derived ----------------------------------------------------------------------------------------------------------------

// Makes (or re-makes) the account from the connected wallet. Asks twice when this device has no record of the wallet.
export async function openFromWallet(services: AccountServices, store: AccountStore, wallet: WalletSigner): Promise<SessionResult> {
  let records: readonly AccountRecord[] = [];
  try {
    records = await store.list();
  } catch {
    records = [];
  }
  const known = records.find((record) => record.kind === "derived" && record.id === derivedRecordId(wallet.address));
  const expected = known?.kind === "derived" ? known.address : null;
  const derived = await deriveTradingKey(wallet, { confirm: known === undefined, expected });
  if (!derived.ok) return { ok: false, reason: derived.reason, message: derived.message };
  let notice: string | null = null;
  if (known === undefined) {
    try {
      await store.put({ id: derivedRecordId(wallet.address), kind: "derived", funding: wallet.address, address: derived.address, createdAt: new Date(services.nowMs()).toISOString() });
    } catch {
      notice = "This browser could not remember the account, so next time your wallet will be asked to sign twice again. The account itself is the same.";
    }
  }
  return { ok: true, key: openKey(services, derived.key, "derived", wallet.address, null), notice };
}

// ---- generated --------------------------------------------------------------------------------------------------------------

export type BackupState = { readonly kind: "saved" } | { readonly kind: "not_saved"; readonly message: string };

async function sealWith(services: AccountServices, credentialId: string, prf: Uint8Array, privateKey: Hex): Promise<SealedKey> {
  const wrappingKey = await wrappingKeyFromPrf(services.subtle, prf, credentialId);
  return sealTradingKey({ subtle: services.subtle, wrappingKey, credentialId, privateKey, randomBytes: services.randomBytes });
}

// A new random key under a new passkey: sealed, stored on this device, then backed up (best effort).
export async function createWithPasskey(services: AccountServices, store: AccountStore): Promise<SessionResult & { readonly backup?: BackupState }> {
  const passkey = await services.passkey.create();
  if (!passkey.ok) return { ok: false, reason: passkey.reason, message: passkey.message };
  const privateKey = newTradingKey();
  let sealed: SealedKey;
  try {
    sealed = await sealWith(services, passkey.credentialId, passkey.prf, privateKey);
  } catch {
    return { ok: false, reason: "failed", message: "The browser could not encrypt the new key. Nothing was made." };
  }
  const recordId = generatedRecordId(passkey.credentialId);
  const key = openKey(services, privateKey, "generated", null, recordId);
  const backup = await backUp(services, sealed, key);
  const record: GeneratedRecord = { id: recordId, kind: "generated", sealed, backup: backup.kind, createdAt: new Date(services.nowMs()).toISOString() };
  try {
    await store.put(record);
  } catch {
    if (backup.kind !== "saved") {
      return { ok: false, reason: "storage", message: "This browser could not store the encrypted key and the backup did not save either, so the account would be lost on reload. Nothing was kept." };
    }
  }
  const notice =
    store.persistence === "memory"
      ? backup.kind === "saved"
        ? "This browser is not keeping site data, so the encrypted key lives in this tab and in the backup only."
        : "This browser is not keeping site data and the backup did not save: export your key now, or the account is lost when this tab closes."
      : null;
  return { ok: true, key, notice, backup };
}

export async function backUp(services: AccountServices, sealed: SealedKey, key: Pick<OpenKey, "address" | "signer">): Promise<BackupState> {
  const outcome = await services.backup.put(sealed, key.signer);
  return outcome.ok ? { kind: "saved" } : { kind: "not_saved", message: outcome.message };
}

// Retries the backup of a stored generated account and records the outcome.
export async function retryBackup(services: AccountServices, store: AccountStore, key: OpenKey): Promise<BackupState> {
  if (key.recordId === null) return { kind: "not_saved", message: "Only an account made with a passkey has a backup." };
  const record = (await store.list()).find((entry) => entry.id === key.recordId);
  if (record === undefined || record.kind !== "generated") return { kind: "not_saved", message: "This device has no encrypted copy of the key to back up." };
  const state = await backUp(services, record.sealed, key);
  try {
    await store.put({ ...record, backup: state.kind });
  } catch {
    // The backup itself is what matters; the local mark is a convenience.
  }
  return state;
}

// Unlocks a generated account with its passkey. With a record id, the stored ciphertext; without one (another device,
// cleared site data), whichever passkey the person picks and that passkey's backup from our API.
export async function unlockWithPasskey(services: AccountServices, store: AccountStore, recordId: string | null): Promise<SessionResult> {
  let records: readonly AccountRecord[] = [];
  try {
    records = await store.list();
  } catch {
    records = [];
  }
  const chosen = recordId === null ? undefined : records.find((record) => record.id === recordId && record.kind === "generated");
  const passkey = await services.passkey.assert(chosen?.kind === "generated" ? chosen.sealed.credentialId : null);
  if (!passkey.ok) return { ok: false, reason: passkey.reason, message: passkey.message };
  let sealed: SealedKey | null = null;
  const local = records.find((record) => record.kind === "generated" && record.sealed.credentialId === passkey.credentialId);
  if (local?.kind === "generated") sealed = local.sealed;
  let restored = false;
  if (sealed === null) {
    const remote = await services.backup.get(passkey.credentialId);
    if (remote.kind === "none") return { ok: false, reason: "not_found", message: "That passkey has no trading account on this device, and the account server has no backup for it." };
    if (remote.kind === "unreachable") return { ok: false, reason: "not_found", message: `That passkey has no trading account on this device, and the backup could not be fetched: ${remote.message}` };
    sealed = remote.sealed;
    restored = true;
  }
  let opened;
  try {
    opened = await openTradingKey(services.subtle, await wrappingKeyFromPrf(services.subtle, passkey.prf, passkey.credentialId), sealed);
  } catch {
    return { ok: false, reason: "failed", message: "The browser could not decrypt the key." };
  }
  if (!opened.ok) {
    return { ok: false, reason: "failed", message: opened.reason === "wrong_passkey" ? "That passkey does not open this account's key." : "The stored key is damaged and was not opened." };
  }
  const id = generatedRecordId(passkey.credentialId);
  let notice: string | null = null;
  if (restored) {
    try {
      await store.put({ id, kind: "generated", sealed, backup: "saved", createdAt: new Date(services.nowMs()).toISOString() });
      notice = "Restored from your encrypted backup and kept on this device.";
    } catch {
      notice = "Restored from your encrypted backup. This browser could not keep a copy, so you will restore it again next time.";
    }
  }
  return { ok: true, key: openKey(services, opened.privateKey, "generated", null, id), notice };
}
