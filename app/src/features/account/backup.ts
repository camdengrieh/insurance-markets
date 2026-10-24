// The encrypted backup of a generated trading key on our markets API: PUT and GET
// `${MARKETS_API_ORIGIN}/v1/account-backup/<credentialIdHex>`. The body is the sealed key (vault.ts), which the server
// cannot open: it has neither the passkey nor its PRF output. The PUT carries E's ownership proof (proof.ts) so nobody
// else can overwrite it.
//
// Best effort, and said so: a failed PUT leaves the account working on this device, marked "backup not saved", and the
// page tells the visitor to export the key. A GET that fails is "could not reach", never "no backup".

import type { Address, Hex } from "viem";

import { ownershipProof, PROOF_HEADER } from "./proof";
import { parseSealedKey, type SealedKey } from "./vault";

export type BackupFetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "text">>;

export const BACKUP_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 16_384;

export type BackupPutResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type BackupGetResult =
  | { readonly kind: "found"; readonly sealed: SealedKey }
  | { readonly kind: "none" }
  | { readonly kind: "unreachable"; readonly message: string };

export interface BackupClient {
  put(sealed: SealedKey, signer: { readonly address: Address; signMessage(message: string): Promise<Hex> }): Promise<BackupPutResult>;
  get(credentialId: string): Promise<BackupGetResult>;
}

export interface BackupOptions {
  // null: no markets API in this build, so no backup.
  readonly origin: string | null;
  readonly fetch: BackupFetch;
  readonly nowMs: () => number;
  readonly timeoutMs?: number;
}

function pathOf(credentialId: string): string {
  return `/v1/account-backup/${credentialId}`;
}

export function createBackupClient(options: BackupOptions): BackupClient {
  const timeoutMs = options.timeoutMs ?? BACKUP_TIMEOUT_MS;

  async function send(url: string, init: RequestInit): Promise<{ readonly status: number; readonly text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await options.fetch(url, { ...init, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store", signal: controller.signal });
      const text = await response.text();
      return { status: response.status, text: text.length > MAX_BODY_CHARS ? "" : text };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async put(sealed, signer) {
      if (options.origin === null) return { ok: false, message: "This build has no account server, so the encrypted backup was not saved." };
      const path = pathOf(sealed.credentialId);
      const body = JSON.stringify(sealed);
      try {
        const proof = await ownershipProof(signer, { method: "PUT", path, body, nowMs: options.nowMs() });
        const answer = await send(`${options.origin}${path}`, { method: "PUT", headers: { "content-type": "application/json", [PROOF_HEADER]: proof }, body });
        if (answer.status >= 200 && answer.status < 300) return { ok: true };
        if (answer.status === 404 || answer.status === 405) return { ok: false, message: "The account server does not offer backups yet, so the encrypted backup was not saved." };
        return { ok: false, message: `The account server refused the backup (HTTP ${answer.status}).` };
      } catch {
        return { ok: false, message: "The account server could not be reached, so the encrypted backup was not saved." };
      }
    },

    async get(credentialId) {
      if (options.origin === null) return { kind: "unreachable", message: "This build has no account server to restore from." };
      try {
        const answer = await send(`${options.origin}${pathOf(credentialId)}`, { method: "GET" });
        if (answer.status === 404) return { kind: "none" };
        if (answer.status < 200 || answer.status >= 300) return { kind: "unreachable", message: `The account server answered HTTP ${answer.status}.` };
        let parsed: unknown;
        try {
          parsed = JSON.parse(answer.text);
        } catch {
          return { kind: "unreachable", message: "The account server's answer is not a backup." };
        }
        const sealed = parseSealedKey(parsed);
        if (sealed === null || sealed.credentialId !== credentialId) return { kind: "unreachable", message: "The account server's answer is not a backup for this passkey." };
        return { kind: "found", sealed };
      } catch {
        return { kind: "unreachable", message: "The account server could not be reached." };
      }
    },
  };
}
