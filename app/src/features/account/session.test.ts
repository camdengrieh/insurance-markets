import { describe, expect, it } from "vitest";

import { createWithPasskey, openFromWallet, retryBackup, unlockWithPasskey } from "./session";
import { createMemoryAccountStore, derivedRecordId } from "./store";
import { fakePasskey, fakeServices, fakeWallet, memoryBackup, TEST_CREDENTIAL } from "./testkit";

// The steps behind the panel's buttons, with fake services: a passkey that answers with fixed PRF bytes, an in-memory
// backup server and an in-memory store.

describe("opening from the wallet", () => {
  it("asks twice the first time, remembers the pair, then asks once and re-makes the same account", async () => {
    const store = createMemoryAccountStore();
    const services = fakeServices({ store });
    const first = fakeWallet();
    const created = await openFromWallet(services, store, first);
    expect(created.ok).toBe(true);
    expect(first.typedRequests).toHaveLength(2);
    const records = await store.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: derivedRecordId(first.address), kind: "derived", funding: first.address });
    const again = fakeWallet();
    const unlocked = await openFromWallet(services, store, again);
    expect(again.typedRequests).toHaveLength(1);
    expect(created.ok && unlocked.ok && created.key.address === unlocked.key.address).toBe(true);
    if (created.ok) {
      expect(created.key.mode).toBe("derived");
      expect(created.key.signer.kind).toBe("local");
      expect(created.key.madeFrom).toBe(first.address);
    }
  });

  it("stores nothing secret: the record is an address pair", async () => {
    const store = createMemoryAccountStore();
    const result = await openFromWallet(fakeServices({ store }), store, fakeWallet());
    if (!result.ok) throw new Error("expected an account");
    expect(JSON.stringify(await store.list())).not.toContain(result.key.reveal().slice(2));
  });
});

describe("a passkey account", () => {
  it("is created, sealed, stored and backed up, and unlocks again with the same passkey", async () => {
    const store = createMemoryAccountStore();
    const backup = memoryBackup();
    const services = fakeServices({ store, backup });
    const created = await createWithPasskey(services, store);
    if (!created.ok) throw new Error(created.message);
    expect(created.backup).toEqual({ kind: "saved" });
    expect(backup.blobs.get(TEST_CREDENTIAL)?.address).toBe(created.key.address);
    const records = await store.list();
    expect(records[0]).toMatchObject({ kind: "generated", backup: "saved" });
    expect(JSON.stringify(records)).not.toContain(created.key.reveal().slice(2));
    const unlocked = await unlockWithPasskey(services, store, records[0]?.id ?? null);
    expect(unlocked.ok && unlocked.key.address === created.key.address && unlocked.key.reveal() === created.key.reveal()).toBe(true);
  });

  it("restores on a new device from the backup alone", async () => {
    const backup = memoryBackup();
    const first = createMemoryAccountStore();
    const created = await createWithPasskey(fakeServices({ store: first, backup }), first);
    if (!created.ok) throw new Error(created.message);
    const fresh = createMemoryAccountStore();
    const restored = await unlockWithPasskey(fakeServices({ store: fresh, backup }), fresh, null);
    expect(restored).toMatchObject({ ok: true, notice: expect.stringMatching(/Restored/) });
    expect(restored.ok && restored.key.address === created.key.address).toBe(true);
    expect(await fresh.list()).toHaveLength(1);
  });

  it("keeps working and says so when the backup cannot be saved, and the retry records success", async () => {
    const store = createMemoryAccountStore();
    const failing = memoryBackup({ failPut: "The account server does not offer backups yet, so the encrypted backup was not saved." });
    const created = await createWithPasskey(fakeServices({ store, backup: failing }), store);
    if (!created.ok) throw new Error(created.message);
    expect(created.backup).toMatchObject({ kind: "not_saved", message: expect.stringMatching(/does not offer backups yet/) });
    expect((await store.list())[0]).toMatchObject({ backup: "not_saved" });
    const working = memoryBackup();
    expect(await retryBackup(fakeServices({ store, backup: working }), store, created.key)).toEqual({ kind: "saved" });
    expect((await store.list())[0]).toMatchObject({ backup: "saved" });
  });

  it("refuses without PRF, and when a picked passkey has neither a local copy nor a backup", async () => {
    const store = createMemoryAccountStore();
    const noPrf = await createWithPasskey(fakeServices({ store, passkey: fakePasskey({ createResult: { ok: false, reason: "no_prf", message: "no prf" } }) }), store);
    expect(noPrf).toMatchObject({ ok: false, reason: "no_prf" });
    const unknown = await unlockWithPasskey(fakeServices({ store }), store, null);
    expect(unknown).toMatchObject({ ok: false, reason: "not_found" });
    expect(await store.list()).toHaveLength(0);
  });
});
