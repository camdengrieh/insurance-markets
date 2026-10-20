import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import * as z from "zod/v4";

import {
  AGENT_TOKEN_PATTERN,
  PAIR_CODE_TTL_S,
  TOKEN_SCOPES,
  UI_TOKEN_PATTERN,
  pairCodeSchema,
  type TokenKind,
  type TokenScope,
} from "./contract.js";

// Tokens, pairing and the agent token file of the Cockpit daemon (docs/dapp-design.md section 5.4, 6 row 7).
//
//   ui token     `cku_` + 43 base64url characters (256 bits). Minted by one pairing exchange, held by the page,
//                kept in memory here (never written), at most MAX_UI_TOKENS live, expires after UI_TOKEN_TTL_MS.
//                Scopes: read and prepare, never submit.
//   agent token  `cka_` + 43 base64url characters. Persistent: only its SHA-256 is stored, in
//                <data dir>/cockpit/agent-token.json (mode 0600). The plaintext is shown once, when it is
//                created or rotated. Its scopes are a ceiling chosen at daemon start.
//   pairing      one 128-bit code (32 hex) printed in a URL fragment on stderr. Valid for PAIR_CODE_TTL_S, used
//                once, locked after MAX_PAIR_ATTEMPTS wrong tries. The code is kept only as a hash.
//
// Every comparison goes through constantTimeEqual (digests of fixed length), and every live token is compared
// on every request, so neither the position of a match nor a shared prefix shows in the time taken.
//
// `submit` is never granted here. Scopes are ceilings; the open ARM window (bridge/arming.ts) is what lets a
// submit-class call through.

export const UI_TOKEN_PREFIX = "cku_";
export const AGENT_TOKEN_PREFIX = "cka_";
export const MAX_UI_TOKENS = 8;
export const UI_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_PAIR_ATTEMPTS = 5;
export const AGENT_TOKEN_FILE = "agent-token.json";
export const COCKPIT_DIR_NAME = "cockpit";

export type RandomBytes = (size: number) => Uint8Array;
export type Clock = () => number;

export const defaultRandom: RandomBytes = (size) => nodeRandomBytes(size);

function sha256(text: string): Buffer {
  return createHash("sha256").update(text, "utf8").digest();
}

// Compares two strings without leaking where they differ or how long they are: both are hashed to 32 bytes
// first, then compared with timingSafeEqual.
export function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function mintUiToken(random: RandomBytes): string {
  return `${UI_TOKEN_PREFIX}${base64url(random(32))}`;
}

export function mintAgentToken(random: RandomBytes): string {
  return `${AGENT_TOKEN_PREFIX}${base64url(random(32))}`;
}

export function mintPairCode(random: RandomBytes): string {
  return hex(random(16));
}

// The id of a token is the first 8 hex digits of its SHA-256: safe to log, and it is the `agent:<id>` of the
// inbox's requested_by. It reveals nothing usable about the token.
export function tokenId(token: string): string {
  return sha256(token).toString("hex").slice(0, 8);
}

export function parseBearer(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]{1,128})$/i.exec(header);
  return match?.[1];
}

// ---- scopes ---------------------------------------------------------------------------------------------------------

export const DEFAULT_AGENT_SCOPES: readonly TokenScope[] = Object.freeze(["read", "prepare"] as const);
export const UI_SCOPES: readonly TokenScope[] = Object.freeze(["read", "prepare"] as const);

export class ScopeListError extends Error {
  constructor() {
    super("The scope list must name only: read, prepare, submit (comma separated).");
    this.name = "ScopeListError";
  }
}

// "read,prepare,submit" -> ["read","prepare","submit"]. `read` is always included (every token can read).
// An unknown word is refused rather than ignored: a typo must not silently narrow or widen the ceiling.
export function parseScopeList(text: string): readonly TokenScope[] {
  const words = text.split(",").map((word) => word.trim()).filter((word) => word !== "");
  if (words.length === 0) throw new ScopeListError();
  const out = new Set<TokenScope>(["read"]);
  for (const word of words) {
    if (!(TOKEN_SCOPES as readonly string[]).includes(word)) throw new ScopeListError();
    out.add(word as TokenScope);
  }
  return TOKEN_SCOPES.filter((scope) => out.has(scope));
}

export type InstanceRole = "writer" | "read_only";

// A scope ceiling applied to an instance: a read-only instance (it does not own the data directory, or its
// relay did not start) serves reads and nothing else, whatever the token says.
export function effectiveScopes(ceiling: readonly TokenScope[], instance: InstanceRole): readonly TokenScope[] {
  return instance === "read_only" ? ["read"] : ceiling;
}

export interface Principal {
  readonly kind: TokenKind;
  // First 8 hex of the token's SHA-256.
  readonly id: string;
  // Effective scopes at the time of the request (ceiling intersected with the instance role).
  readonly scopes: readonly TokenScope[];
  // The `requested_by` value used in the inbox and the audit feed.
  readonly requestedBy: "ui" | `agent:${string}`;
}

// ---- the agent token file -------------------------------------------------------------------------------------------

const agentFileSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[0-9a-f]{8}$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    created_at: z.string().max(40),
  })
  .strict();

export interface AgentTokenLoad {
  readonly outcome: "loaded" | "created" | "rotated";
  // Present only when a new token was just made (created or rotated): shown once, never stored.
  readonly token?: string;
  // The file was readable by others and was tightened to 0600.
  readonly tightened?: boolean;
}

export interface AgentTokenStoreOptions {
  // <data dir>/cockpit, created 0700.
  readonly dir: string;
  readonly random?: RandomBytes;
  readonly clock?: Clock;
  readonly platform?: NodeJS.Platform;
}

export class AgentTokenStore {
  readonly #dir: string;
  readonly #random: RandomBytes;
  readonly #clock: Clock;
  readonly #platform: NodeJS.Platform;

  constructor(options: AgentTokenStoreOptions) {
    this.#dir = options.dir;
    this.#random = options.random ?? defaultRandom;
    this.#clock = options.clock ?? Date.now;
    this.#platform = options.platform ?? process.platform;
  }

  get file(): string {
    return join(this.#dir, AGENT_TOKEN_FILE);
  }

  async #read(): Promise<{ readonly id: string; readonly sha256: string; readonly tightened: boolean } | undefined> {
    let info;
    try {
      info = await stat(this.file);
    } catch {
      return undefined;
    }
    if (!info.isFile()) return undefined;
    let tightened = false;
    if (this.#platform !== "win32" && (info.mode & 0o077) !== 0) {
      await chmod(this.file, 0o600).catch(() => undefined);
      tightened = true;
    }
    try {
      const parsed = agentFileSchema.safeParse(JSON.parse(await readFile(this.file, "utf8")));
      return parsed.success ? { id: parsed.data.id, sha256: parsed.data.sha256, tightened } : undefined;
    } catch {
      return undefined;
    }
  }

  async #write(token: string): Promise<void> {
    await mkdir(this.#dir, { recursive: true, mode: 0o700 });
    if (this.#platform !== "win32") await chmod(this.#dir, 0o700).catch(() => undefined);
    const body = `${JSON.stringify({ version: 1, id: tokenId(token), sha256: sha256(token).toString("hex"), created_at: new Date(this.#clock()).toISOString() })}\n`;
    const temp = `${this.file}.tmp-${process.pid}-${hex(this.#random(4))}`;
    const handle = await open(temp, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temp, this.file);
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  // A writer instance: keeps the stored token, makes one if there is none or the file is unusable, or
  // replaces it when `rotate` is set (the old token stops working at once).
  async ensure(rotate: boolean): Promise<AgentTokenLoad & { readonly hash: { readonly id: string; readonly sha256: string } }> {
    const existing = await this.#read();
    if (existing !== undefined && !rotate) {
      return { outcome: "loaded", hash: { id: existing.id, sha256: existing.sha256 }, ...(existing.tightened ? { tightened: true } : {}) };
    }
    const token = mintAgentToken(this.#random);
    await this.#write(token);
    return {
      outcome: existing === undefined ? "created" : "rotated",
      token,
      hash: { id: tokenId(token), sha256: sha256(token).toString("hex") },
    };
  }

  // A read-only instance: never writes, uses the stored token if there is one.
  async peek(): Promise<{ readonly id: string; readonly sha256: string } | undefined> {
    const existing = await this.#read();
    return existing === undefined ? undefined : { id: existing.id, sha256: existing.sha256 };
  }
}

// ---- the live token table ----------------------------------------------------------------------------------------------

export interface PairingGrant {
  readonly code: string;
  readonly expiresAtMs: number;
}

export type RedeemResult =
  | { readonly ok: true; readonly token: string; readonly principal: Omit<Principal, "scopes"> }
  | { readonly ok: false; readonly reason: "invalid" | "expired" };

export interface AuthOptions {
  readonly clock?: Clock;
  readonly random?: RandomBytes;
  // The role right now; read at every request, so a relay that stops starting turns the scopes down at once.
  readonly instance: () => InstanceRole;
  // The ceiling of the agent token. Default read + prepare. Never exceeds what TOKEN_SCOPES lists.
  readonly agentScopes?: readonly TokenScope[];
  // The stored agent token's id and hash (from AgentTokenStore), if there is one.
  readonly agentHash?: { readonly id: string; readonly sha256: string };
}

interface LiveUiToken {
  readonly digest: Buffer;
  readonly id: string;
  readonly expiresAtMs: number;
}

export class Auth {
  readonly #clock: Clock;
  readonly #random: RandomBytes;
  readonly #instance: () => InstanceRole;
  readonly #agentScopes: readonly TokenScope[];
  #agent: { readonly id: string; readonly digest: Buffer } | undefined;
  #uiTokens: LiveUiToken[] = [];
  #pairing: { readonly digest: Buffer; readonly expiresAtMs: number; attempts: number } | undefined;

  constructor(options: AuthOptions) {
    this.#clock = options.clock ?? Date.now;
    this.#random = options.random ?? defaultRandom;
    this.#instance = options.instance;
    this.#agentScopes = Object.freeze([...(options.agentScopes ?? DEFAULT_AGENT_SCOPES)]);
    if (options.agentHash !== undefined) this.setAgentHash(options.agentHash);
  }

  get agentScopes(): readonly TokenScope[] {
    return this.#agentScopes;
  }

  instance(): InstanceRole {
    return this.#instance();
  }

  setAgentHash(hash: { readonly id: string; readonly sha256: string } | undefined): void {
    this.#agent = hash === undefined ? undefined : { id: hash.id, digest: Buffer.from(hash.sha256, "hex") };
  }

  hasAgentToken(): boolean {
    return this.#agent !== undefined;
  }

  // -- pairing --

  // Issues a new code, replacing any code that was not used yet.
  issuePairing(): PairingGrant {
    const code = mintPairCode(this.#random);
    const expiresAtMs = this.#clock() + PAIR_CODE_TTL_S * 1000;
    this.#pairing = { digest: sha256(code), expiresAtMs, attempts: 0 };
    return { code, expiresAtMs };
  }

  // True while a code is outstanding (issued, unused, in time, not locked).
  pairingOpen(): boolean {
    return this.#pairing !== undefined && this.#clock() < this.#pairing.expiresAtMs;
  }

  redeemPairing(code: string): RedeemResult {
    const active = this.#pairing;
    if (active === undefined) return { ok: false, reason: "invalid" };
    if (this.#clock() >= active.expiresAtMs) {
      this.#pairing = undefined;
      return { ok: false, reason: "expired" };
    }
    if (!pairCodeSchema.safeParse(code).success || !timingSafeEqual(active.digest, sha256(code))) {
      active.attempts += 1;
      // Five wrong tries burn the code: the user gets a fresh one by reloading the page.
      if (active.attempts >= MAX_PAIR_ATTEMPTS) this.#pairing = undefined;
      return { ok: false, reason: "invalid" };
    }
    this.#pairing = undefined;
    const token = mintUiToken(this.#random);
    this.#uiTokens.push({ digest: sha256(token), id: tokenId(token), expiresAtMs: this.#clock() + UI_TOKEN_TTL_MS });
    while (this.#uiTokens.length > MAX_UI_TOKENS) this.#uiTokens.shift();
    return { ok: true, token, principal: { kind: "ui", id: tokenId(token), requestedBy: "ui" } };
  }

  // -- authentication --

  // Resolves an Authorization header to a principal, or undefined. Compares against every live token.
  authenticate(header: string | undefined): Principal | undefined {
    const token = parseBearer(header);
    if (token === undefined) return undefined;
    const now = this.#clock();
    this.#uiTokens = this.#uiTokens.filter((entry) => entry.expiresAtMs > now);
    const digest = sha256(token);
    const role = this.#instance();
    let found: Principal | undefined;
    if (UI_TOKEN_PATTERN.test(token)) {
      for (const entry of this.#uiTokens) {
        if (timingSafeEqual(entry.digest, digest) && found === undefined) {
          found = { kind: "ui", id: entry.id, scopes: effectiveScopes(UI_SCOPES, role), requestedBy: "ui" };
        }
      }
    } else if (AGENT_TOKEN_PATTERN.test(token)) {
      const agent = this.#agent;
      if (agent !== undefined && timingSafeEqual(agent.digest, digest)) {
        found = { kind: "agent", id: agent.id, scopes: effectiveScopes(this.#agentScopes, role), requestedBy: `agent:${agent.id}` };
      }
    }
    return found;
  }

  // Drops every ui token and the pairing code (shutdown).
  wipe(): void {
    this.#uiTokens = [];
    this.#pairing = undefined;
    this.#agent = undefined;
  }
}
