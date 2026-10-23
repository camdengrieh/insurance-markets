// Where the visitor's own venue credential lives while they trade: this tab's memory, mirrored to sessionStorage so a
// reload in the same tab keeps the session. Never localStorage, IndexedDB or a cookie: closing the tab ends it, and
// another tab or a later visit starts logged out. Keyed by venue and by the wallet address that made it, so a second
// wallet connected in the same tab never sees the first one's credential.
//
// The credential is the visitor's own, derived from their own wallet signature, and it goes nowhere but the venue that
// issued it. This module never logs it, never puts it in the DOM and never returns it to anything but the executor.

// The slice of Web Storage this uses. Every call is guarded: a storage that throws (a privacy mode, a sandboxed frame)
// leaves the memory copy working.
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CredentialStore {
  get(venue: string, address: string): string | null;
  set(venue: string, address: string, value: string): void;
  remove(venue: string, address: string): void;
}

const PREFIX = "xo-direct";

export function credentialKey(venue: string, address: string): string {
  return `${PREFIX}:${venue}:${address.toLowerCase()}`;
}

export function createCredentialStore(storage: SessionStorageLike | null): CredentialStore {
  const memory = new Map<string, string>();
  return {
    get(venue, address) {
      const key = credentialKey(venue, address);
      const held = memory.get(key);
      if (held !== undefined) return held;
      if (storage === null) return null;
      try {
        const stored = storage.getItem(key);
        if (stored !== null) memory.set(key, stored);
        return stored;
      } catch {
        return null;
      }
    },
    set(venue, address, value) {
      const key = credentialKey(venue, address);
      memory.set(key, value);
      if (storage === null) return;
      try {
        storage.setItem(key, value);
      } catch {
        // The memory copy still holds it for this page's life.
      }
    },
    remove(venue, address) {
      const key = credentialKey(venue, address);
      memory.delete(key);
      if (storage === null) return;
      try {
        storage.removeItem(key);
      } catch {
        // Nothing else holds it.
      }
    },
  };
}
