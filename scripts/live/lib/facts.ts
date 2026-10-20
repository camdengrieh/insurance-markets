import { CapabilityRegistry, FLAG_PREREQUISITES, type CapabilityFact } from "../../../relay/capabilities.js";
import { openRelayStorage } from "../../../relay/store.js";
import type { FactProposal, TestSpec } from "./types.js";

// Recording what a run found out (docs/phase1-gap-closing.md amendment A11: a flag flips only through a
// recorded capability fact plus an operator confirmation).
//
// A run PROPOSES facts. Nothing is recorded until the operator types the confirmation phrase, which names
// the test and the verdict, so it cannot be given by reflex or by an agent that was not told what the run
// found. The facts go into the relay's own register (relay/capabilities.ts) with source "operator", in the
// relay's data directory; the relay reads them at its next start, and a write flag becomes effective only
// when every fact in FLAG_PREREQUISITES for it is "yes" (or the operator arms it for a run).

// Facts the run proposes, minus the ones that would record nothing ("unknown" is not a result).
export function recordable(facts: readonly FactProposal[]): readonly FactProposal[] {
  return facts.filter((fact) => fact.state !== "unknown");
}

// The phrase that confirms the run's own fact: RECORD T1=yes.
export function recordPhrase(spec: TestSpec, facts: readonly FactProposal[]): string | undefined {
  const items = recordable(facts);
  if (items.length === 0) return undefined;
  const own = items.find((fact) => fact.id === spec.id) ?? items[0];
  return own === undefined ? undefined : `RECORD ${own.id}=${own.state}`;
}

export interface RecordOutcome {
  readonly recorded: readonly string[];
  readonly failed: readonly { readonly id: string; readonly reason: string }[];
}

export async function recordFacts(registry: CapabilityRegistry, facts: readonly FactProposal[]): Promise<RecordOutcome> {
  const recorded: string[] = [];
  const failed: { id: string; reason: string }[] = [];
  for (const fact of recordable(facts)) {
    try {
      await registry.record({ id: fact.id, state: fact.state, source: "operator", note: fact.note, ...(fact.value === undefined ? {} : { value: fact.value }) });
      recorded.push(`${fact.id}=${fact.state}`);
    } catch (error) {
      failed.push({ id: fact.id, reason: error instanceof Error ? error.message.slice(0, 160) : "refused" });
    }
  }
  return { recorded, failed };
}

// For a test that runs no relay (T0): opens the data directory's durable store for the time of the call.
export async function withStandaloneRegistry<T>(dir: string, now: () => number, fn: (registry: CapabilityRegistry) => Promise<T>): Promise<T> {
  const storage = await openRelayStorage({ dir, now });
  try {
    const registry = await CapabilityRegistry.open({ store: storage.state, now });
    return await fn(registry);
  } finally {
    await storage.close();
  }
}

export interface FlagStatus {
  readonly flag: string;
  readonly needs: readonly { readonly id: string; readonly state: string }[];
  readonly unlocked: boolean;
}

// Which write flags the recorded facts unlock (a flag is effective only if the environment also has it on).
export function flagStatus(facts: readonly CapabilityFact[]): readonly FlagStatus[] {
  const stateOf = (id: string): string => facts.find((fact) => fact.id === id)?.state ?? "unknown";
  return Object.entries(FLAG_PREREQUISITES).map(([flag, ids]) => {
    const needs = ids.map((id) => ({ id, state: stateOf(id) }));
    return { flag, needs, unlocked: needs.every((entry) => entry.state === "yes") };
  });
}
