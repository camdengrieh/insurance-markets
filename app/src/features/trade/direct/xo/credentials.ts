// The visitor's own XO L2 credential (API key, secret, passphrase), which XO returns to the visitor's browser after the
// ClobAuth login. It is the visitor's: it is kept in this tab's memory and in sessionStorage (so a reload of the same tab
// keeps the login), keyed by the owner and its XO account. Never localStorage, never IndexedDB, never sent anywhere but
// in the HMAC of the visitor's own requests, never logged and never rendered. Closing the tab ends it; "Forget" ends it
// at once. The relay never sees the secret: only the signature made with it.

import type { L2Credentials } from "./hmac";

const KEY_PREFIX = "xo-l2:";
const HEADER_TOKEN = /^[\x21-\x7e]{1,512}$/;
const SECRET_TOKEN = /^[A-Za-z0-9+/_=-]{1,1024}$/;

// The part of Web Storage this uses; sessionStorage in the page, a fake in tests.
export interface CredentialStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// The credential as an object that prints as nothing useful: JSON.stringify, String() and template literals all give
// "[redacted]". Only `serialize` (for sessionStorage) and `forSigning` (for hmac.ts) reveal it.
export class XoCredential {
  readonly #apiKey: string;
  readonly #secret: string;
  readonly #passphrase: string;

  private constructor(apiKey: string, secret: string, passphrase: string) {
    this.#apiKey = apiKey;
    this.#secret = secret;
    this.#passphrase = passphrase;
    Object.freeze(this);
  }

  // Null for anything that is not a usable credential. XO's answer may name the key apiKey or api_key.
  static from(value: unknown): XoCredential | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const apiKey = record["apiKey"] ?? record["api_key"];
    const secret = record["secret"];
    const passphrase = record["passphrase"];
    if (typeof apiKey !== "string" || !HEADER_TOKEN.test(apiKey)) return null;
    if (typeof secret !== "string" || !SECRET_TOKEN.test(secret)) return null;
    if (typeof passphrase !== "string" || !HEADER_TOKEN.test(passphrase)) return null;
    return new XoCredential(apiKey, secret, passphrase);
  }

  forSigning(): L2Credentials {
    return { apiKey: this.#apiKey, secret: this.#secret, passphrase: this.#passphrase };
  }

  serialize(): string {
    return JSON.stringify({ apiKey: this.#apiKey, secret: this.#secret, passphrase: this.#passphrase });
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }
}

function keyOf(owner: string, account: string): string {
  return `${KEY_PREFIX}${owner.toLowerCase()}:${account.toLowerCase()}`;
}

export class XoCredentialStore {
  readonly #memory = new Map<string, XoCredential>();
  readonly #storage: CredentialStorage | null;

  constructor(storage: CredentialStorage | null) {
    this.#storage = storage;
  }

  get(owner: string, account: string): XoCredential | null {
    const key = keyOf(owner, account);
    const held = this.#memory.get(key);
    if (held !== undefined) return held;
    let raw: string | null = null;
    try {
      raw = this.#storage?.getItem(key) ?? null;
    } catch {
      raw = null;
    }
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const credential = XoCredential.from(parsed);
    if (credential === null) {
      this.forget(owner, account);
      return null;
    }
    this.#memory.set(key, credential);
    return credential;
  }

  put(owner: string, account: string, credential: XoCredential): void {
    const key = keyOf(owner, account);
    this.#memory.set(key, credential);
    try {
      this.#storage?.setItem(key, credential.serialize());
    } catch {
      // Storage full or blocked: the credential lives in this tab's memory only.
    }
  }

  forget(owner: string, account: string): void {
    const key = keyOf(owner, account);
    this.#memory.delete(key);
    try {
      this.#storage?.removeItem(key);
    } catch {
      // Nothing more to do: the memory copy is gone.
    }
  }
}

// This tab's sessionStorage, or null where the browser blocks it (the credential then lives in memory only).
export function tabSessionStorage(): CredentialStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
