// One page's Quotient session: the on/off gate, how a key reaches Quotient, and the clients built from them.
//
// What is stored, and where (M3-4):
//   - The gate (on or off, when the licence clause was acknowledged, which clause) goes to the settings store in
//     IndexedDB. It holds no Quotient data: three plain fields.
//   - A key typed into the standalone page lives in a private field of this object. It is never stored, never put
//     in a URL, an attribute or an error, and is dropped when Quotient is switched off or the tab is hidden.
//   - Results are held by the screen's React state and the client's memory store, and nowhere else.
//
// The gate that the client reads is a live object (getters), so switching it off stops every client at once and the
// spend meter of a keyed client survives a switch off and on in the same tab.

import * as z from "zod/v4";

import type { RecordStore } from "../../core/bindings";
import type { AdapterDeps, Dec } from "../../core/ports";
import {
  LICENCE_CLAUSE_SOURCE,
  createQuotientClient,
  type KeyAccess,
  type QuotientClient,
  type QuotientGate,
} from "./quotient";
import type { SpendSnapshot } from "./quotient";

export type AccessChoice = "none" | "key";

const GATE_ID = "quotient_gate";

const gateRecordSchema = z
  .object({
    id: z.literal(GATE_ID),
    enabled: z.boolean(),
    acknowledgedAtMs: z.number().int().nonnegative().nullable(),
    // Which wording of the clause was acknowledged. A changed clause asks again.
    clause: z.string().max(300),
  })
  .strict();

export interface SessionSnapshot {
  // False until the stored gate has been read. Until then Quotient counts as OFF.
  readonly loaded: boolean;
  readonly enabled: boolean;
  readonly acknowledgedAtMs: number | null;
  readonly access: AccessChoice;
  readonly hasKey: boolean;
  readonly spend: SpendSnapshot | null;
  // Bumped when memory is dropped, so a screen can tell that held results are gone.
  readonly epoch: number;
}

export interface SessionOptions {
  readonly mode: "standalone" | "cockpit";
  readonly deps: AdapterDeps;
  // The settings store; an unreadable one means the defaults (OFF).
  readonly settings: () => Promise<RecordStore>;
}

export class SignalsSession {
  readonly #mode: "standalone" | "cockpit";
  readonly #deps: AdapterDeps;
  readonly #settings: () => Promise<RecordStore>;
  readonly #listeners = new Set<() => void>();
  readonly #clients = new Map<AccessChoice, QuotientClient>();
  #loaded = false;
  #enabled = false;
  #ackMs: number | null = null;
  #access: AccessChoice = "none";
  #key: string | undefined;
  #epoch = 0;
  #snapshot: SessionSnapshot;

  // The live view of the gate that every client reads on every call.
  readonly #gate: QuotientGate;

  constructor(options: SessionOptions) {
    this.#mode = options.mode;
    this.#deps = options.deps;
    this.#settings = options.settings;
    const isOn = (): boolean => this.#loaded && this.#enabled;
    const acknowledged = (): number | null => (this.#loaded ? this.#ackMs : null);
    this.#gate = {
      get enabled() {
        return isOn();
      },
      get licenceAcknowledgedAtMs() {
        return acknowledged();
      },
    };
    this.#snapshot = this.#makeSnapshot();
  }

  // ---- observable state (useSyncExternalStore) ----------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): SessionSnapshot => this.#snapshot;

  #makeSnapshot(): SessionSnapshot {
    const keyed = this.#clients.get("key");
    return Object.freeze({
      loaded: this.#loaded,
      enabled: this.#loaded && this.#enabled && this.#ackMs !== null,
      acknowledgedAtMs: this.#ackMs,
      access: this.#access,
      hasKey: this.#key !== undefined,
      spend: keyed === undefined ? null : keyed.status().spend,
      epoch: this.#epoch,
    });
  }

  #emit(): void {
    this.#snapshot = this.#makeSnapshot();
    for (const listener of [...this.#listeners]) listener();
  }

  // ---- the gate ---------------------------------------------------------------------------------------------------------

  async load(): Promise<void> {
    try {
      const store = await this.#settings();
      for (const raw of await store.getAll()) {
        const parsed = gateRecordSchema.safeParse(raw);
        if (!parsed.success) continue;
        // On only when it says on, carries an acknowledgement, and that was of the clause as it reads now.
        if (parsed.data.enabled && parsed.data.acknowledgedAtMs !== null && parsed.data.clause === LICENCE_CLAUSE_SOURCE) {
          this.#enabled = true;
          this.#ackMs = parsed.data.acknowledgedAtMs;
        }
      }
    } catch {
      // Storage that cannot be read means OFF.
    }
    this.#loaded = true;
    this.#emit();
  }

  async #persist(): Promise<void> {
    try {
      const store = await this.#settings();
      await store.put({ id: GATE_ID, enabled: this.#enabled, acknowledgedAtMs: this.#ackMs, clause: LICENCE_CLAUSE_SOURCE });
    } catch {
      // The switch still works for this tab; it just does not survive a reload.
    }
  }

  // Switching on is the acknowledgement of the licence clause: the screen shows the clause first and calls this
  // only from the button that says so.
  async enable(): Promise<void> {
    this.#loaded = true;
    this.#enabled = true;
    this.#ackMs = this.#deps.nowMs();
    this.#emit();
    await this.#persist();
  }

  async disable(): Promise<void> {
    this.#enabled = false;
    // Forgetting the acknowledgement makes the next switch-on show the clause again.
    this.#ackMs = null;
    this.dropMemory();
    await this.#persist();
  }

  // ---- how a key reaches Quotient --------------------------------------------------------------------------------------

  setAccess(choice: AccessChoice): void {
    this.#access = choice;
    if (choice === "none") this.#key = undefined;
    this.#emit();
  }

  // Holds the value as typed; the client checks its shape on every call and refuses one that does not look like a key.
  setKey(value: string): void {
    this.#key = value.length === 0 ? undefined : value;
    this.#emit();
  }

  clearKey(): void {
    this.#key = undefined;
    this.#emit();
  }

  // The client for the current access choice. Created once per choice, so a keyed client's meter lasts the tab.
  client(): QuotientClient {
    const choice = this.#access;
    let client = this.#clients.get(choice);
    if (client === undefined) {
      let access: KeyAccess;
      if (choice === "none") access = { mode: "none" };
      else if (this.#mode === "cockpit") access = { mode: "daemon" };
      else access = { mode: "page_memory", getKey: () => this.#key };
      client = createQuotientClient(this.#deps, { build: this.#mode, gate: this.#gate, access });
      this.#clients.set(choice, client);
    }
    return client;
  }

  // Today's estimated spend, for the screen's own limit check.
  spentTodayUsd(): Dec {
    return this.#clients.get("key")?.status().spend.todayUsd ?? "0";
  }

  // Drops everything held in memory: client caches, the key. The meter is kept (it is a count, not Quotient data).
  dropMemory(): void {
    for (const client of this.#clients.values()) client.clearMemory();
    this.#key = undefined;
    this.#epoch += 1;
    this.#emit();
  }

  // The refresh after a call, so the meter shows in the next render.
  touch(): void {
    this.#emit();
  }
}
