import type { IncomingMessage } from "node:http";

import { getAddress, isAddress } from "viem";

import type { AccountStore } from "./account-store.js";
import type { RateLimitSpec } from "./config.js";
import { PROOF_HEADER, verifyProof } from "./proof.js";
import { isAnswer, isRecord, jsonHeaders, noBody, originRefusal, rateLimited, readJsonBody, refusal, requestTarget, routeOwner, serverAnswer, type RelayAnswer, type RouteOwner } from "./relay-http.js";
import { XO_RELAY_LIMITS, type RelayContext } from "./xo-relay.js";

// /v1/account-backup/<credentialIdHex>: the encrypted copy of a generated trading key (docs/unified-account-design.md
// section 1, "Create one"): the page encrypts E with a key derived from a passkey's WebAuthn PRF output and keeps the
// ciphertext here, keyed by the passkey's credential id, so a synced passkey on another device can find it again. The
// server cannot decrypt it and never looks inside.
//
//   PUT /v1/account-backup/<credentialIdHex>   x-im-proof for `address` (proof.ts)
//       { "version", "credentialId", "address", "iv", "ciphertext" }              201 { credentialId, stored: true }
//       The proof's account must be the body's `address` (E) and the body's `credentialId` the path's. Write-once: a slot
//       that holds the same record answers 200 (a retry); one that holds another answers 409 already_stored and is never
//       overwritten (so nobody who learns a credential id can replace a backup).
//   GET /v1/account-backup/<credentialIdHex>   200 the stored record, exactly those five fields; or 404 not_found
//
// The credential id in the path is lower-case hex of 16 to 512 bytes (WebAuthn credential ids are at least 16 bytes); the
// body's may be the same hex (any case, optional 0x) or the same bytes in base64url. `iv` and `ciphertext` are 0x hex or
// base64 text; `version` a whole number or a short word; the whole body at most BACKUP_MAX_BYTES. Off unless
// API_ACCOUNT_BACKUP=on; per client, both methods share one bucket. Logs: method, route, status, time; never an id, an
// address or a body.

export const BACKUP_PREFIX = "/v1/account-backup";
export const BACKUP_MAX_BYTES = 4096;
export const BACKUP_FIELDS = ["version", "credentialId", "address", "iv", "ciphertext"] as const;
const CREDENTIAL_ID = /^(?:[0-9a-f]{2}){16,512}$/;
const HEX_TEXT = /^0x((?:[0-9a-fA-F]{2})+)$/;
const BASE64_TEXT = /^[A-Za-z0-9+/_-]+={0,2}$/;
const VERSION_WORD = /^[A-Za-z0-9._-]{1,32}$/;

export interface BackupOptions {
  readonly enabled: boolean;
  readonly store: AccountStore;
  readonly limit: RateLimitSpec;
  readonly maxUrlChars: number;
}

// The decoded length of a field, or null when it is neither: "0x" then hex, or else base64 (whose alphabet holds every
// hex digit, so the prefix is what says hex).
export function blobBytes(blob: string): number | null {
  if (blob.startsWith("0x")) {
    const hex = HEX_TEXT.exec(blob);
    return hex === null ? null : (hex[1] as string).length / 2;
  }
  if (!BASE64_TEXT.test(blob)) return null;
  const body = blob.replace(/=+$/, "");
  if (body.length % 4 === 1) return null;
  return Math.floor((body.length * 3) / 4);
}

// Whether the body's credential id names the same bytes as the path's lower-case hex.
export function sameCredential(bodyId: string, pathHex: string): boolean {
  const hex = bodyId.startsWith("0x") ? bodyId.slice(2) : bodyId;
  if (/^(?:[0-9a-fA-F]{2})+$/.test(hex) && hex.toLowerCase() === pathHex) return true;
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(bodyId)) return false;
  return Buffer.from(bodyId.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("hex") === pathHex;
}

type Checked = { readonly ok: true; readonly record: Readonly<Record<(typeof BACKUP_FIELDS)[number], unknown>> } | { readonly ok: false; readonly answer: RelayAnswer };

export function checkRecord(value: unknown, pathId: string): Checked {
  const bad = (message: string): Checked => ({ ok: false, answer: refusal("invalid_request", message) });
  if (!isRecord(value) || Object.keys(value).some((key) => !(BACKUP_FIELDS as readonly string[]).includes(key)) || BACKUP_FIELDS.some((key) => !(key in value))) {
    return bad(`The body is { ${BACKUP_FIELDS.join(", ")} } and nothing else.`);
  }
  const { version, credentialId, address, iv, ciphertext } = value;
  if (!((typeof version === "number" && Number.isSafeInteger(version) && version >= 0) || (typeof version === "string" && VERSION_WORD.test(version)))) return bad("version is a whole number or a short word.");
  if (typeof credentialId !== "string" || !sameCredential(credentialId, pathId)) return bad("credentialId is not the credential id in the path.");
  if (typeof address !== "string" || !isAddress(address, { strict: false })) return bad("address is not an address.");
  for (const [name, field] of [["iv", iv], ["ciphertext", ciphertext]] as const) {
    if (typeof field !== "string") return bad(`${name} is 0x hex or base64 text.`);
    const bytes = blobBytes(field);
    if (bytes === null || bytes === 0) return bad(`${name} is 0x hex or base64 text.`);
  }
  return { ok: true, record: { version, credentialId, address: getAddress(address), iv, ciphertext } };
}

export function createAccountBackup(options: BackupOptions): RouteOwner {
  async function answer(req: IncomingMessage, path: string, context: RelayContext, setLabel: (label: string) => void): Promise<RelayAnswer> {
    if (!options.enabled) return refusal("relay_not_enabled", "The account backup store is not enabled on this server.");
    const match = /^\/v1\/account-backup\/([^/]+)$/.exec(path);
    if (match === null) return refusal("not_found", `The backup store is ${BACKUP_PREFIX}/<credentialIdHex>.`);
    setLabel(`${BACKUP_PREFIX}/:credentialId`);
    const credentialId = match[1] as string;
    if (!CREDENTIAL_ID.test(credentialId)) return refusal("invalid_request", "The credential id is lower-case hex of 16 to 512 bytes.");
    const origin = originRefusal(req, "The backup store");
    if (origin !== null) return origin;
    const target = requestTarget(req, path, options.maxUrlChars);
    if (isAnswer(target)) return target;
    if (req.method !== "GET" && req.method !== "PUT") return refusal("method_not_allowed", "The backup store answers GET and PUT only.", { allow: "GET, PUT, OPTIONS" });
    if (target.search !== "") return refusal("invalid_request", "The backup store takes no query.");
    if (req.method === "GET") {
      const none = noBody(req);
      if (none !== null) return none;
    } else {
      const headers = jsonHeaders(req, BACKUP_MAX_BYTES);
      if (headers !== null) return headers;
    }
    const taken = context.takeToken(`backup|${context.client}`, options.limit);
    if (!taken.allowed) return rateLimited(options.limit, taken.retryAfterMs, "to the backup store from this client");
    if (req.method === "GET") {
      const row = options.store.backup(credentialId);
      if (row === null) return refusal("not_found", "No backup is stored for this credential.");
      return serverAnswer(200, JSON.parse(row.blob) as unknown);
    }
    const body = await readJsonBody(req, BACKUP_MAX_BYTES);
    if (isAnswer(body)) return body;
    const checked = checkRecord(body.value, credentialId);
    if (!checked.ok) return checked.answer;
    const proof = await verifyProof({ header: req.headers[PROOF_HEADER], method: "PUT", path: target.rawPath, search: target.search, body: body.raw, nowMs: context.nowMs(), account: checked.record.address as string });
    if (!proof.ok) return refusal(proof.code, proof.message);
    const stored = JSON.stringify(checked.record);
    if (options.store.putBackup(credentialId, stored, context.nowMs())) return serverAnswer(201, { credentialId, stored: true });
    const existing = options.store.backup(credentialId);
    if (existing !== null && existing.blob === stored) return serverAnswer(200, { credentialId, stored: true });
    return refusal("already_stored", "A backup is already stored for this credential; it is written once and never replaced.");
  }

  return routeOwner(BACKUP_PREFIX, {
    preflight: (path) => (options.enabled && /^\/v1\/account-backup\/[0-9a-f]+$/.test(path) ? { label: `${BACKUP_PREFIX}/:credentialId`, methods: ["GET", "PUT"], headers: ["content-type", PROOF_HEADER] } : null),
    answer,
    internalWords: "The backup store failed to answer. Whether the backup was stored is not known: read it back.",
    maxAgeS: XO_RELAY_LIMITS.preflightMaxAgeS,
  });
}
