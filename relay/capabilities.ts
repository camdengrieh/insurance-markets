import { RelayError } from "../src/relay/errors.js";
import { requireFlag, type FlagName, type Flags, type WriteFlagName } from "../src/relay/flags.js";
import { sanitizeUntrusted } from "../src/guardrails/untrusted.js";
import { redactSecrets } from "../src/guardrails/audit.js";
import { isoSecondOf, type RelayAudit } from "./audit.js";
import type { TripwireChecker, TripwireRegistry } from "./alerts.js";
import { NAMESPACES, type DurableStore } from "./store.js";
import type { RelayContext } from "./types.js";

// Capability facts, the flag gate and the write guards (docs/phase1-gap-closing.md sections 3, 4, 8
// D8 and 9 A11).
//
// A capability fact is one assumption-register row (AD5, UO7, FU6, ...) or live test (T1, T3a, ...)
// with a state (unknown, yes, no), where it came from (a probe the relay ran, or the operator saying
// so), a timestamp and a short note. The default is "unknown" and unknown means "behave as if it were
// no". Facts are durable: a restart keeps them.
//
// Flags (src/relay/flags.ts) are the operator's switches in the environment. A11 says a flag flips only
// through a recorded fact plus an operator confirmation, so the relay adds a gate on top: a write flag
// is effective only when the environment has it ON and either
//   - every fact in FLAG_PREREQUISITES for it is recorded as "yes" (the test result is in), or
//   - the operator armed that flag for this run (RELAY_ARM), which is the confirmation that lets the
//     live test itself run before any result exists.
// The gate can be switched off with RELAY_ENFORCE_FLAG_FACTS=0 (the banner then says so).
// KILL is never gated: it comes from the environment, or from a signal while the relay runs.

export const CAPABILITY_ID = /^(?:(?:AD|UO|OR|AU|FU|CR|PB|XS)[0-9]{1,2}|T[0-9][a-c]?)$/;
export const CAPABILITY_SOURCES = ["probe", "operator"] as const;
export type CapabilitySource = (typeof CAPABILITY_SOURCES)[number];
export type CapabilityStateValue = "unknown" | "yes" | "no";

export interface CapabilityFact {
  readonly id: string;
  readonly state: CapabilityStateValue;
  readonly source: CapabilitySource;
  readonly recordedAt: string;
  readonly note: string | undefined;
  // A selected variant for facts that pick between alternatives (an HMAC decoding, an L1 form).
  readonly value: string | undefined;
}

type StoredFact = {
  state: string;
  source: string;
  atMs: number;
  note: string | null;
  value: string | null;
  history: { state: string; source: string; atMs: number }[];
};

export interface RecordFactInput {
  readonly id: string;
  readonly state: CapabilityStateValue;
  readonly source: CapabilitySource;
  readonly note?: string;
  readonly value?: string;
}

export interface CapabilityRegistryOptions {
  readonly store: DurableStore;
  readonly now?: () => number;
  readonly audit?: RelayAudit;
}

const VALUE = /^[A-Za-z0-9._:-]{1,64}$/;
const MAX_HISTORY = 20;

export class CapabilityRegistry {
  readonly #store: DurableStore;
  readonly #now: () => number;
  readonly #audit: RelayAudit | undefined;
  readonly #facts = new Map<string, CapabilityFact>();

  private constructor(options: CapabilityRegistryOptions) {
    this.#store = options.store;
    this.#now = options.now ?? Date.now;
    this.#audit = options.audit;
  }

  static async open(options: CapabilityRegistryOptions): Promise<CapabilityRegistry> {
    const registry = new CapabilityRegistry(options);
    for (const [id, stored] of options.store.list<StoredFact>(NAMESPACES.capabilities)) {
      const state = stored.state;
      const source = stored.source;
      if (!CAPABILITY_ID.test(id) || (state !== "unknown" && state !== "yes" && state !== "no") || (source !== "probe" && source !== "operator")) continue;
      registry.#facts.set(id, {
        id,
        state,
        source,
        recordedAt: isoSecondOf(stored.atMs),
        note: stored.note ?? undefined,
        value: stored.value ?? undefined,
      });
    }
    return registry;
  }

  state(id: string): CapabilityStateValue {
    return this.#facts.get(id)?.state ?? "unknown";
  }

  fact(id: string): CapabilityFact | undefined {
    return this.#facts.get(id);
  }

  value(id: string): string | undefined {
    return this.#facts.get(id)?.value;
  }

  all(): CapabilityFact[] {
    return [...this.#facts.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  // The map the contract puts on a Prepared item: the facts a call depends on, "unknown" if unrecorded.
  snapshot(ids: readonly string[]): Record<string, CapabilityStateValue> {
    return Object.fromEntries(ids.map((id) => [id, this.state(id)]));
  }

  async record(input: RecordFactInput): Promise<CapabilityFact> {
    if (!CAPABILITY_ID.test(input.id)) throw new RelayError("invalid_request", "That is not a capability id from the assumptions register.");
    if (input.state !== "unknown" && input.state !== "yes" && input.state !== "no") throw new RelayError("invalid_request", "A capability state is unknown, yes or no.");
    if (!(CAPABILITY_SOURCES as readonly string[]).includes(input.source)) throw new RelayError("invalid_request", "A capability source is probe or operator.");
    if (input.value !== undefined && !VALUE.test(input.value)) throw new RelayError("invalid_request", "A capability value is a short token.");
    const existing = this.#facts.get(input.id);
    // A probe may always take a "yes" back, but it may not overrule an operator's "no" with a "yes".
    if (existing?.source === "operator" && existing.state === "no" && input.source === "probe" && input.state === "yes") {
      throw new RelayError("precondition_failed", "An operator recorded this as no; only the operator can change it to yes.", { id: input.id });
    }
    const atMs = this.#now();
    const note = input.note === undefined ? undefined : sanitizeUntrusted(redactSecrets(sanitizeUntrusted(input.note, { maxChars: 1000 }).text), { maxChars: 200 }).text;
    const previous = this.#store.get<StoredFact>(NAMESPACES.capabilities, input.id);
    const history = [...(previous?.history ?? []), { state: input.state, source: input.source, atMs }].slice(-MAX_HISTORY);
    const stored: StoredFact = {
      state: input.state,
      source: input.source,
      atMs,
      note: note ?? null,
      value: input.value ?? null,
      history,
    };
    await this.#store.set(NAMESPACES.capabilities, input.id, stored);
    const fact: CapabilityFact = { id: input.id, state: input.state, source: input.source, recordedAt: isoSecondOf(atMs), note, value: input.value };
    this.#facts.set(input.id, fact);
    await this.#audit?.write({ ev: "capability", code: input.id.toLowerCase(), state: input.state, outcome: "ok", note: `${input.source}${note === undefined ? "" : `: ${note}`}`, sync: true });
    return fact;
  }
}

// ---- the flag gate ------------------------------------------------------------------------------------------------

// Which recorded test results unlock each write flag for normal use (docs/phase1-gap-closing.md 5.9).
// Several of these flags are needed to RUN the test that produces the result (T1 submits an operation,
// T3a funds, T4 withdraws, T6 creates); for that first run the operator arms the flag.
export const FLAG_PREREQUISITES: Readonly<Record<WriteFlagName, readonly string[]>> = Object.freeze({
  ENABLE_USEROP_SUBMIT: Object.freeze(["T1"]),
  ENABLE_TRADING: Object.freeze(["T1", "T2", "T3b"]),
  ENABLE_FUNDING: Object.freeze(["T1"]),
  ENABLE_WITHDRAW: Object.freeze(["T4"]),
  XO_ENABLE_CREATE: Object.freeze(["T6"]),
  ENABLE_SELF_HOSTED_METADATA: Object.freeze(["T6"]),
});

export interface FlagExplanation {
  readonly flag: WriteFlagName;
  readonly envOn: boolean;
  readonly armed: boolean;
  readonly prerequisites: ReadonlyArray<{ readonly id: string; readonly state: CapabilityStateValue }>;
  readonly effective: boolean;
  readonly reason: "off_in_environment" | "kill_switch" | "armed" | "prerequisites_met" | "prerequisites_missing" | "not_enforced";
}

export interface FlagGateOptions {
  readonly envFlags: Flags;
  readonly armed: readonly WriteFlagName[];
  readonly registry: CapabilityRegistry;
  readonly enforce: boolean;
  readonly audit?: RelayAudit;
}

export class FlagGate {
  readonly #env: Flags;
  readonly #armed: ReadonlySet<WriteFlagName>;
  readonly #registry: CapabilityRegistry;
  readonly #enforce: boolean;
  readonly #audit: RelayAudit | undefined;
  #killLatched = false;

  constructor(options: FlagGateOptions) {
    this.#env = options.envFlags;
    this.#armed = new Set(options.armed);
    this.#registry = options.registry;
    this.#enforce = options.enforce;
    this.#audit = options.audit;
  }

  // Switches every write off until the process restarts (the SIGUSR2 handler calls this). It only
  // ever turns the kill switch on.
  async engageKill(reason: string): Promise<void> {
    if (this.#killLatched) return;
    this.#killLatched = true;
    await this.#audit?.write({ ev: "flag", flag: "KILL", state: "engaged", outcome: "ok", note: reason, sync: true });
  }

  get killEngaged(): boolean {
    return this.#env.KILL || this.#killLatched;
  }

  explain(): FlagExplanation[] {
    const kill = this.killEngaged;
    const out: FlagExplanation[] = [];
    for (const flag of Object.keys(FLAG_PREREQUISITES) as WriteFlagName[]) {
      const prerequisites = FLAG_PREREQUISITES[flag].map((id) => ({ id, state: this.#registry.state(id) }));
      const armed = this.#armed.has(flag);
      const envOn = this.#env[flag] === true;
      const met = prerequisites.every((entry) => entry.state === "yes");
      let reason: FlagExplanation["reason"];
      let effective: boolean;
      if (!envOn) {
        effective = false;
        reason = "off_in_environment";
      } else if (kill) {
        effective = false;
        reason = "kill_switch";
      } else if (!this.#enforce) {
        effective = true;
        reason = "not_enforced";
      } else if (met) {
        effective = true;
        reason = "prerequisites_met";
      } else if (armed) {
        effective = true;
        reason = "armed";
      } else {
        effective = false;
        reason = "prerequisites_missing";
      }
      out.push({ flag, envOn, armed, prerequisites, effective, reason });
    }
    return out;
  }

  // What RelayContext.flags() returns. Computed on every call, so a fact recorded or a kill engaged
  // while the relay runs takes effect on the next request.
  effective(): Flags {
    const result: Record<FlagName, boolean> = { ...this.#env, KILL: this.killEngaged };
    for (const entry of this.explain()) result[entry.flag] = entry.effective;
    return Object.freeze(result);
  }
}

// ---- guards the write handlers call ------------------------------------------------------------------------------------

// Refuses a write when the kill switch is on, the flag is off, a tripwire is tripped, or the relay's
// own audit log cannot be written (an unaudited write is refused). Synchronous: it uses latched state.
export function guardWrite(context: RelayContext, flag: WriteFlagName): void {
  requireFlag(context.flags(), flag);
  context.services.tripwires?.assertWritable();
  if (context.services.audit !== undefined && !context.services.audit.healthy()) {
    throw new RelayError("internal", "The relay audit log cannot be written, so writes are refused.");
  }
}

// guardWrite plus a fresh run of the tripwire checkers: tripwires are re-checked at submit, not only
// at prepare. A checker that cannot decide counts as a refusal (fail closed). The kill switch is read
// again after the checks, because they take time.
export async function guardSubmit(context: RelayContext, flag: WriteFlagName, timeoutMs?: number): Promise<void> {
  guardWrite(context, flag);
  const tripwires: TripwireRegistry | undefined = context.services.tripwires;
  const checkers: readonly TripwireChecker[] = context.services.tripwireCheckers ?? [];
  if (tripwires !== undefined && checkers.length > 0) {
    const result = await tripwires.recheck(checkers, timeoutMs === undefined ? {} : { timeoutMs });
    if (result.unverified.length > 0) {
      throw new RelayError("tripwire", "A pinned on-chain property could not be verified just now, so the write is refused.", {
        unverified: [...result.unverified],
      });
    }
  }
  guardWrite(context, flag);
}

declare module "./types.js" {
  interface RelayServices {
    readonly capabilities?: CapabilityRegistry;
    readonly flagGate?: FlagGate;
  }
}
