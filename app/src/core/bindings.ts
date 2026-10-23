// The address-binding store (docs/dapp-design.md 4.3, 4.4; acceptance M2-1, M2-7, M2-8, M2-9). Browser only.
//
// A binding is an address the user wants the read model to look up: their PayBox EOA, the Kernel account derived
// from it, a venue proxy wallet, a Solana address. It holds NO key and NO credential, and nothing here can sign.
// Stored in IndexedDB in the user's own browser when available, in memory otherwise; never sent anywhere. The
// export is a plain JSON file of addresses and labels and refuses to import anything that looks like a secret.
//
// Privacy (shown on the binding screen): querying a venue by address tells that venue the user's IP and address,
// and positions are world-readable by address anyway. So a binding queries NO venue until the user selects it.

import { openDB } from "idb";
import { isAddress, verifyMessage, type Hex } from "viem";
import * as z from "zod/v4";

import { deriveAccount } from "@shared/xo/account/derive";

import { ACCOUNT_CHAINS, chainById, type AccountStatus } from "./account";
import { checkEvmAddress, checkSolanaAddress, type AddressWarning, type SavedAddress } from "./address";
import { sanitizeText } from "./untrusted";
import { VENUE_IDS, isVenueId } from "./venue-policy";
import type { VenueId } from "./ports";

export const BINDING_PRIVACY_NOTICE =
  "Looking up an address asks each venue you select about that address, so the venue sees your IP address and the address. Positions are public by address anyway. Nothing is sent to anyone else, and nothing is stored outside this browser.";

export const BINDING_KINDS = ["eoa", "kernel", "venue_proxy", "solana", "venue_account"] as const;
export type BindingKind = (typeof BINDING_KINDS)[number];

// "wallet_signed": the connected wallet signed a short text proving it controls the address (connect/proof.ts).
export const BINDING_SOURCES = ["pasted", "agent_import", "derived", "wallet_signed"] as const;
export type BindingSource = (typeof BINDING_SOURCES)[number];

export const MAX_PROOF_MESSAGE_CHARS = 1000;
// An EOA signature is 132 characters; a smart account's (ERC-1271, ERC-6492) can be much longer.
export const MAX_PROOF_SIGNATURE_CHARS = 20_000;

// The signed proof behind a "wallet_signed" binding. `verified` is true only when the signature recovers to the address
// as a plain key signature (EIP-191). A smart account signs through its contract (ERC-1271), which this page cannot
// check without a chain read, so its proof is kept with verified false rather than refused.
export const bindingProofSchema = z
  .object({
    method: z.literal("eip191_personal_sign"),
    verified: z.boolean(),
    signedAt: z.string().max(40),
    message: z.string().min(1).max(MAX_PROOF_MESSAGE_CHARS),
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(MAX_PROOF_SIGNATURE_CHARS),
  })
  .strict();
export type BindingProof = z.infer<typeof bindingProofSchema>;

const STATUSES = ["derived", "code-present", "venue-registered", "trading-enabled", "rpc-unreachable", "foreign-code"] as const satisfies readonly AccountStatus[];

export const MAX_BINDINGS = 200;
export const MAX_IMPORT_BYTES = 256 * 1024;
const MAX_LABEL_CHARS = 48;

export const addressBindingSchema = z
  .object({
    id: z.string().min(3).max(160),
    label: z.string().min(1).max(MAX_LABEL_CHARS),
    kind: z.enum(BINDING_KINDS),
    // "evm" (the same address on every EVM chain), "eip155:<id>", "solana" or "offchain".
    chain: z.string().regex(/^(?:evm|solana|offchain|eip155:[0-9]{1,9})$/),
    address: z.string().max(64).nullable(),
    derivedFrom: z
      .object({ bindingId: z.string().max(160), method: z.enum(["kernel_v3_1_create2", "venue_profile_lookup"]), verifiedAt: z.string().max(40).optional() })
      .strict()
      .optional(),
    status: z.enum(STATUSES),
    venues: z.array(z.enum(VENUE_IDS as [VenueId, ...VenueId[]])).max(30),
    source: z.enum(BINDING_SOURCES),
    proof: bindingProofSchema.optional(),
  })
  .strict()
  // A proof belongs to a wallet-signed EOA binding and to nothing else.
  .refine((binding) => (binding.source === "wallet_signed") === (binding.proof !== undefined) && (binding.proof === undefined || binding.kind === "eoa"));
export type AddressBinding = z.infer<typeof addressBindingSchema>;

// ---- storage backends ----------------------------------------------------------------------------------------------------

export type StoredRecord = { readonly id: string } & Readonly<Record<string, unknown>>;

export interface RecordStore {
  readonly persistence: "indexeddb" | "memory";
  getAll(): Promise<unknown[]>;
  put(record: StoredRecord): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export function createMemoryRecordStore(): RecordStore {
  const records = new Map<string, unknown>();
  return {
    persistence: "memory",
    async getAll() {
      return [...records.values()].map((record) => structuredClone(record));
    },
    async put(record) {
      records.set(record.id, structuredClone(record));
    },
    async delete(id) {
      records.delete(id);
    },
    async clear() {
      records.clear();
    },
  };
}

// The slice of an idb database the store uses, so a test can fake it.
export interface IdbLike {
  getAll(storeName: string): Promise<unknown[]>;
  put(storeName: string, value: unknown): Promise<unknown>;
  delete(storeName: string, key: string): Promise<void>;
  clear(storeName: string): Promise<void>;
}

export function createIdbRecordStore(db: IdbLike, storeName: string): RecordStore {
  return {
    persistence: "indexeddb",
    getAll: () => db.getAll(storeName),
    put: async (record) => {
      await db.put(storeName, record);
    },
    delete: (id) => db.delete(storeName, id),
    clear: () => db.clear(storeName),
  };
}

export const DB_NAME = "xo-cockpit";
export const BINDINGS_STORE = "bindings";
export const SETTINGS_STORE = "settings";

export interface OpenedStores {
  readonly bindings: RecordStore;
  readonly settings: RecordStore;
  readonly persistence: "indexeddb" | "memory";
}

// Opens the user's own IndexedDB. Any failure (private window, blocked site data, no IndexedDB, a quota error)
// falls back to memory, and the page renders the same without it.
export async function openStores(): Promise<OpenedStores> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
    const db = await openDB(DB_NAME, 1, {
      upgrade(upgrade) {
        upgrade.createObjectStore(BINDINGS_STORE, { keyPath: "id" });
        upgrade.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      },
    });
    const like: IdbLike = {
      getAll: (store) => db.getAll(store),
      put: (store, value) => db.put(store, value),
      delete: (store, key) => db.delete(store, key),
      clear: (store) => db.clear(store),
    };
    return { bindings: createIdbRecordStore(like, BINDINGS_STORE), settings: createIdbRecordStore(like, SETTINGS_STORE), persistence: "indexeddb" };
  } catch {
    return { bindings: createMemoryRecordStore(), settings: createMemoryRecordStore(), persistence: "memory" };
  }
}

// ---- the store -----------------------------------------------------------------------------------------------------------

export type BindingError =
  | "invalid_address"
  | "confirmation_required"
  | "duplicate"
  | "too_many"
  | "unknown_binding"
  | "wrong_kind"
  | "unknown_chain"
  | "unknown_venue"
  | "import_rejected";

export type BindingResult =
  | { readonly ok: true; readonly binding: AddressBinding; readonly warnings: readonly AddressWarning[] }
  | { readonly ok: false; readonly error: BindingError; readonly message: string; readonly warnings?: readonly AddressWarning[] };

function failure(error: BindingError, message: string, warnings?: readonly AddressWarning[]): BindingResult {
  return { ok: false, error, message, ...(warnings === undefined ? {} : { warnings }) };
}

function cleanLabel(raw: unknown, fallback: string): string {
  const text = sanitizeText("generic", typeof raw === "string" ? raw : "").text.value.slice(0, MAX_LABEL_CHARS).trim();
  return text === "" ? fallback : text;
}

function bindingId(kind: BindingKind, chain: string, address: string): string {
  const key = address.startsWith("0x") ? address.toLowerCase() : address;
  return `${kind}:${chain}:${key}`;
}

// Suggestions only: nothing is applied automatically (a binding queries no venue until the user selects it).
export function suggestedVenues(kind: BindingKind): readonly VenueId[] {
  switch (kind) {
    case "eoa":
      return ["limitless", "trueo", "hyperliquid"];
    case "kernel":
      return ["xo"];
    case "venue_proxy":
      return ["polymarket"];
    case "solana":
      return ["pascal"];
    case "venue_account":
      return [];
  }
}

export interface AddInput {
  readonly label?: string;
  readonly address: string;
  readonly kind: "eoa" | "venue_proxy" | "solana";
  readonly source?: "pasted" | "agent_import";
  // The user acknowledged a look-alike or burn-address warning.
  readonly confirm?: boolean;
  readonly venues?: readonly VenueId[];
}

export class BindingsStore {
  readonly #store: RecordStore;

  constructor(store: RecordStore) {
    this.#store = store;
  }

  get persistence(): "indexeddb" | "memory" {
    return this.#store.persistence;
  }

  // Valid stored bindings. A record that no longer passes the schema is skipped, never repaired.
  async list(): Promise<AddressBinding[]> {
    const out: AddressBinding[] = [];
    for (const raw of await this.#store.getAll()) {
      const parsed = addressBindingSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data);
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  async #savedAddresses(): Promise<SavedAddress[]> {
    return (await this.list()).flatMap((binding) => (binding.address === null ? [] : [{ id: binding.id, address: binding.address }]));
  }

  async add(input: AddInput): Promise<BindingResult> {
    const existing = await this.list();
    if (existing.length >= MAX_BINDINGS) return failure("too_many", "Too many saved addresses.");
    const venues = input.venues ?? [];
    if (!venues.every((venue) => isVenueId(venue))) return failure("unknown_venue", "Unknown venue.");
    const saved = await this.#savedAddresses();
    const solana = input.kind === "solana";
    const checked = solana ? checkSolanaAddress(input.address, saved) : checkEvmAddress(input.address, saved, { role: "wallet" });
    if (!checked.ok) return failure("invalid_address", checked.message);
    if (checked.warnings.some((warning) => warning.code === "duplicate")) return failure("duplicate", "This address is already saved.", checked.warnings);
    if (checked.needsConfirmation && input.confirm !== true) {
      return failure("confirmation_required", "Check the warnings and confirm to save this address.", checked.warnings);
    }
    const chain = solana ? "solana" : "evm";
    const binding: AddressBinding = {
      id: bindingId(input.kind, chain, checked.address),
      label: cleanLabel(input.label, solana ? "Solana address" : input.kind === "eoa" ? "PayBox address" : "Venue wallet"),
      kind: input.kind,
      chain,
      address: checked.address,
      status: "derived",
      venues: [...new Set(venues)],
      source: input.source ?? "pasted",
    };
    await this.#store.put(binding);
    return { ok: true, binding, warnings: checked.warnings };
  }

  // The connected wallet's address with the signed proof behind it (connect/proof.ts made and checked the proof; this
  // re-checks the shape and the address). An address already saved as a pasted EOA keeps its label and venue choice
  // and gains the proof; a newer proof replaces an older one.
  async addSigned(input: { readonly address: string; readonly proof: BindingProof; readonly label?: string }): Promise<BindingResult> {
    const proof = bindingProofSchema.safeParse(input.proof);
    if (!proof.success) return failure("invalid_address", "The signed proof is not in the expected form.");
    const checked = checkEvmAddress(input.address, [], { role: "wallet" });
    if (!checked.ok) return failure("invalid_address", checked.message);
    if (!proof.data.message.includes(checked.address)) return failure("invalid_address", "The signed text does not name this address.");
    const id = bindingId("eoa", "evm", checked.address);
    const existing = (await this.list()).find((binding) => binding.id === id);
    if (existing !== undefined) return this.#update(id, (binding) => ({ ...binding, source: "wallet_signed", proof: proof.data }));
    const others = await this.list();
    if (others.length >= MAX_BINDINGS) return failure("too_many", "Too many saved addresses.");
    const binding: AddressBinding = {
      id,
      label: cleanLabel(input.label, "Connected wallet"),
      kind: "eoa",
      chain: "evm",
      address: checked.address,
      status: "derived",
      venues: [],
      source: "wallet_signed",
      proof: proof.data,
    };
    await this.#store.put(binding);
    return { ok: true, binding, warnings: checked.warnings };
  }

  // The Kernel account derived from an EOA binding, one binding per requested chain (M2-8). The address is
  // recomputed here from the owner; nothing from outside is trusted.
  async addDerivedKernel(eoaBindingId: string, chainIds: readonly number[] = ACCOUNT_CHAINS.map((entry) => entry.chainId)): Promise<readonly BindingResult[]> {
    const owner = (await this.list()).find((binding) => binding.id === eoaBindingId);
    if (owner === undefined || owner.address === null) return [failure("unknown_binding", "No such saved address.")];
    if (owner.kind !== "eoa") return [failure("wrong_kind", "Only an EOA address owns a derived account.")];
    const account = deriveAccount(owner.address);
    const results: BindingResult[] = [];
    for (const chainId of chainIds) {
      const entry = chainById(chainId);
      if (entry === undefined) {
        results.push(failure("unknown_chain", `Chain ${chainId} is not supported.`));
        continue;
      }
      const id = bindingId("kernel", entry.caip2, account);
      const binding: AddressBinding = {
        id,
        label: `${entry.name} account`,
        kind: "kernel",
        chain: entry.caip2,
        address: account,
        derivedFrom: { bindingId: owner.id, method: "kernel_v3_1_create2" },
        status: "derived",
        venues: entry.isXo ? ["xo"] : [],
        source: "derived",
      };
      await this.#store.put(binding);
      results.push({ ok: true, binding, warnings: [] });
    }
    return results;
  }

  async #update(id: string, change: (binding: AddressBinding) => AddressBinding | BindingResult): Promise<BindingResult> {
    const current = (await this.list()).find((binding) => binding.id === id);
    if (current === undefined) return failure("unknown_binding", "No such saved address.");
    const next = change(current);
    if ("ok" in next) return next;
    await this.#store.put(next);
    return { ok: true, binding: next, warnings: [] };
  }

  // Which venues are queried for this binding (M2-9). Replaces the list.
  async setVenues(id: string, venues: readonly string[]): Promise<BindingResult> {
    if (!venues.every((venue) => isVenueId(venue))) return failure("unknown_venue", "Unknown venue.");
    return this.#update(id, (binding) => ({ ...binding, venues: [...new Set(venues as readonly VenueId[])] }));
  }

  async setStatus(id: string, status: AccountStatus): Promise<BindingResult> {
    return this.#update(id, (binding) => ({ ...binding, status }));
  }

  async rename(id: string, label: string): Promise<BindingResult> {
    return this.#update(id, (binding) => ({ ...binding, label: cleanLabel(label, binding.label) }));
  }

  async remove(id: string): Promise<void> {
    await this.#store.delete(id);
  }

  // "Wipe local data".
  async clear(): Promise<void> {
    await this.#store.clear();
  }

  // ---- export and import ----------------------------------------------------------------------------------------------

  async exportJson(): Promise<string> {
    return `${JSON.stringify({ format: "xo-cockpit-bindings", version: 1, bindings: await this.list() }, null, 2)}\n`;
  }

  // Never deletes and never replaces: an id that is already saved is left exactly as the user has it. The file is
  // not trusted for anything but an address and a label: every record is held to the rules add() applies (the id
  // must be the id of its own kind, chain and address; a look-alike, burn address or duplicate refuses the file,
  // since an import has nobody to confirm it), the label is cleaned, and source, status and venue selection are set
  // here, never taken from the file. Refuses the whole file on the first problem, and refuses anything that looks
  // like a secret (a 64-hex private key, a seed phrase label) before parsing it.
  async importJson(
    text: string,
  ): Promise<{ readonly ok: true; readonly imported: number; readonly skipped: number } | { readonly ok: false; readonly error: BindingError; readonly message: string }> {
    const reject = (message: string): { ok: false; error: BindingError; message: string } => ({ ok: false, error: "import_rejected", message });
    if (typeof text !== "string" || text.length === 0) return reject("Empty file.");
    if (text.length > MAX_IMPORT_BYTES) return reject("The file is too large.");
    if (looksLikeSecret(text)) return reject("The file looks like it contains a secret. It was not read.");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return reject("Not valid JSON.");
    }
    const file = z.object({ format: z.literal("xo-cockpit-bindings"), version: z.literal(1), bindings: z.array(z.unknown()).max(MAX_BINDINGS) }).strict().safeParse(json);
    if (!file.success) return reject("Not a bindings file.");
    const accepted: AddressBinding[] = [];
    const stored = await this.list();
    let skipped = 0;
    for (const raw of file.data.bindings) {
      const parsed = addressBindingSchema.safeParse(raw);
      if (!parsed.success) return reject("A saved address has an unknown or invalid field.");
      const incoming = parsed.data;
      if (incoming.address !== null && incoming.id !== bindingId(incoming.kind, incoming.chain, incoming.address)) {
        return reject("A saved address in the file has an id that does not match its address.");
      }
      const known = [...stored, ...accepted];
      const same = known.find((entry) => entry.id === incoming.id);
      if (same !== undefined) {
        // The id embeds the address, so a match with another address can only be a forged or null-address id.
        if (same.address !== incoming.address) return reject("A saved address in the file reuses the id of a different saved address.");
        skipped += 1;
        continue;
      }
      const checked = verifyBinding(incoming, known);
      if (checked !== null) return reject(checked);
      if (incoming.kind !== "kernel" && incoming.address !== null) {
        const saved = known.flatMap((entry) => (entry.address === null ? [] : [{ id: entry.id, address: entry.address }]));
        const result = incoming.kind === "solana" ? checkSolanaAddress(incoming.address, saved) : checkEvmAddress(incoming.address, saved, { role: "wallet" });
        if (!result.ok) return reject("An address in the file is not valid.");
        if (result.warnings.some((warning) => warning.code === "duplicate" || warning.requiresConfirmation)) {
          return reject("An address in the file looks like, or is, a different saved address. Add it by hand to check it.");
        }
      }
      const kernel = incoming.kind === "kernel";
      // A wallet-signed proof survives an import only when it checks out again here as a plain key signature over a
      // text that names the address. Anything else (an unverified smart-account proof included) comes in as pasted.
      const proof = incoming.proof;
      if (proof !== undefined && incoming.address !== null && proof.verified && proof.message.includes(incoming.address) && (await proofRecovers(incoming.address, proof))) {
        accepted.push({ id: incoming.id, label: cleanLabel(incoming.label, "Imported address"), kind: "eoa", chain: incoming.chain, address: incoming.address, status: "derived", venues: [], source: "wallet_signed", proof });
        continue;
      }
      accepted.push({
        id: incoming.id,
        label: cleanLabel(incoming.label, kernel ? "Derived account" : "Imported address"),
        kind: incoming.kind,
        chain: incoming.chain,
        address: incoming.address,
        // Only a derivation this code just recomputed is kept; a venue lookup claim cannot be checked here.
        ...(kernel && incoming.derivedFrom !== undefined ? { derivedFrom: incoming.derivedFrom } : {}),
        status: "derived",
        venues: [],
        source: kernel ? "derived" : "pasted",
      });
    }
    for (const binding of accepted) await this.#store.put(binding);
    return { ok: true, imported: accepted.length, skipped };
  }
}

// Whether an EIP-191 signature over the proof text recovers to the address. Offline (ecrecover only); a malformed
// signature is false, never an exception.
export async function proofRecovers(address: string, proof: Pick<BindingProof, "message" | "signature">): Promise<boolean> {
  if (!isAddress(address, { strict: false }) || !/^0x[0-9a-fA-F]+$/.test(proof.signature)) return false;
  try {
    return await verifyMessage({ address, message: proof.message, signature: proof.signature as Hex });
  } catch {
    return false;
  }
}

// A 64-hex string (a private key), an extended-key prefix, or words that name a secret.
const SECRET_SHAPES: readonly RegExp[] = [
  /(?<![0-9a-fA-F])(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/,
  /\b(?:xprv|yprv|zprv)[1-9A-HJ-NP-Za-km-z]{20,}/,
  /\b(?:mnemonic|seed phrase|private[ _-]?key|secret[ _-]?key)\b/i,
];

export function looksLikeSecret(text: string): boolean {
  return SECRET_SHAPES.some((pattern) => pattern.test(text));
}

// Re-checks an imported binding against the same rules as a pasted one. Returns a reason, or null if fine.
function verifyBinding(binding: AddressBinding, earlier: readonly AddressBinding[]): string | null {
  if (binding.address !== null) {
    if (binding.kind === "solana") {
      if (!checkSolanaAddress(binding.address).ok) return "A Solana address in the file is not valid.";
    } else {
      const checked = checkEvmAddress(binding.address, [], { role: "wallet" });
      if (!checked.ok) return "An address in the file is not valid.";
      if (checked.address !== binding.address) return "An address in the file is not in its checksummed form.";
    }
  }
  if (binding.kind === "kernel") {
    // A derived account must equal the derivation from its owner; a file cannot assert a different account.
    const owner = earlier.find((candidate) => candidate.id === binding.derivedFrom?.bindingId);
    if (owner === undefined || owner.address === null || binding.address === null) return "A derived account in the file has no owner before it.";
    if (deriveAccount(owner.address) !== binding.address) return "A derived account in the file does not match its owner.";
  }
  return null;
}

