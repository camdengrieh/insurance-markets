// What this browser remembers about trading accounts, in its own IndexedDB (through idb, as core/bindings.ts does), in
// a database of its own so the address book's schema never has to change for it:
//   derived    the wallet W and the account E it made: an address pair, no secret. It tells the page to ask W once
//              (not twice) next time and to check the re-made E against the one remembered.
//   generated  the sealed key (vault.ts): ciphertext that only the passkey opens, its credential id, E's address and
//              whether the encrypted backup reached our API.
// Nothing here is a key. When IndexedDB is not available (a private window, blocked site data) the store lives in memory
// for this tab, and the page says that a generated account would not survive a reload there unless its backup saved.

import { openDB } from "idb";
import { getAddress, isAddress, type Address } from "viem";
import * as z from "zod/v4";

import { sealedKeySchema, type SealedKey } from "./vault";

export const ACCOUNT_DB_NAME = "xo-cockpit-account";
const STORE = "accounts";
const MAX_RECORDS = 32;

const addressSchema = z.string().refine((value) => isAddress(value, { strict: false }));

const derivedSchema = z
  .object({ id: z.string().max(80), kind: z.literal("derived"), funding: addressSchema, address: addressSchema, createdAt: z.string().max(40) })
  .strict();
const generatedSchema = z
  .object({ id: z.string().max(2100), kind: z.literal("generated"), sealed: sealedKeySchema, backup: z.enum(["saved", "not_saved"]), createdAt: z.string().max(40) })
  .strict();

export type DerivedRecord = { readonly id: string; readonly kind: "derived"; readonly funding: Address; readonly address: Address; readonly createdAt: string };
export type GeneratedRecord = { readonly id: string; readonly kind: "generated"; readonly sealed: SealedKey; readonly backup: "saved" | "not_saved"; readonly createdAt: string };
export type AccountRecord = DerivedRecord | GeneratedRecord;

export function derivedRecordId(funding: Address): string {
  return `derived:${funding.toLowerCase()}`;
}

export function generatedRecordId(credentialId: string): string {
  return `generated:${credentialId}`;
}

export function parseAccountRecord(raw: unknown): AccountRecord | null {
  const derived = derivedSchema.safeParse(raw);
  if (derived.success) {
    const funding = getAddress(derived.data.funding);
    return derived.data.id === derivedRecordId(funding) ? { ...derived.data, funding, address: getAddress(derived.data.address) } : null;
  }
  const generated = generatedSchema.safeParse(raw);
  if (generated.success && generated.data.id === generatedRecordId(generated.data.sealed.credentialId)) {
    return { ...generated.data, sealed: { ...generated.data.sealed, address: getAddress(generated.data.sealed.address) } };
  }
  return null;
}

export interface AccountStore {
  readonly persistence: "indexeddb" | "memory";
  // Every readable record; unreadable ones are skipped, never repaired.
  list(): Promise<readonly AccountRecord[]>;
  put(record: AccountRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export function createMemoryAccountStore(): AccountStore {
  const records = new Map<string, AccountRecord>();
  return {
    persistence: "memory",
    list: async () => [...records.values()],
    put: async (record) => {
      if (!records.has(record.id) && records.size >= MAX_RECORDS) throw new RangeError("too many trading accounts on this device");
      records.set(record.id, record);
    },
    remove: async (id) => {
      records.delete(id);
    },
  };
}

// The user's own IndexedDB, or memory when it cannot be opened.
export async function openAccountStore(): Promise<AccountStore> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
    const db = await openDB(ACCOUNT_DB_NAME, 1, {
      upgrade(upgrade) {
        upgrade.createObjectStore(STORE, { keyPath: "id" });
      },
    });
    return {
      persistence: "indexeddb",
      list: async () => {
        const out: AccountRecord[] = [];
        for (const raw of await db.getAll(STORE)) {
          const record = parseAccountRecord(raw);
          if (record !== null) out.push(record);
        }
        return out;
      },
      put: async (record) => {
        if ((await db.count(STORE)) >= MAX_RECORDS && (await db.get(STORE, record.id)) === undefined) throw new RangeError("too many trading accounts on this device");
        await db.put(STORE, record);
      },
      remove: async (id) => {
        await db.delete(STORE, id);
      },
    };
  } catch {
    return createMemoryAccountStore();
  }
}
