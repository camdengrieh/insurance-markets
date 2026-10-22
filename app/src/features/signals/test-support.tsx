// Builders for the Signals tests: a services record with scripted fetch and fixed clock, a spy settings store, and a
// mount helper with the providers the shell supplies. Pure code with no Node import (the boundary check treats every
// non-*.test file under app/src as bundled code); only test files import it.

import type { ReactElement } from "react";

import { createMemoryRecordStore, type RecordStore, type StoredRecord } from "../../core/bindings";
import { ClockProvider, ModeProvider, type AppMode } from "../../ui";
import { act, render } from "../../ui/testing/dom";
import { NOW, depsOf, fakeFetch, type FakeFetch, type FakeRoute } from "./quotient/fixtures/fake-fetch";
import type { LinkLoad } from "./links/dataset";
import { SignalsServicesProvider, type LegReader, type SignalsServices } from "./services";
import { SignalsSession } from "./session";

export { NOW };
export const TEST_KEY = "qt_TESTKEY_0123456789abcdef";

export interface SpyStore extends RecordStore {
  // Every record ever written, as the JSON text that would reach IndexedDB.
  readonly written: string[];
}

export function spyStore(): SpyStore {
  const inner = createMemoryRecordStore();
  const written: string[] = [];
  return {
    persistence: "memory",
    written,
    getAll: () => inner.getAll(),
    put: async (record: StoredRecord) => {
      written.push(JSON.stringify(record));
      await inner.put(record);
    },
    delete: (id) => inner.delete(id),
    clear: () => inner.clear(),
  };
}

export interface RigOptions {
  readonly routes?: Readonly<Record<string, FakeRoute>>;
  readonly mode?: AppMode;
  readonly links?: LinkLoad;
  readonly readLeg?: LegReader;
  readonly store?: SpyStore;
}

export interface Rig {
  readonly services: SignalsServices;
  readonly fake: FakeFetch;
  readonly clock: { now: number };
  readonly store: SpyStore;
  readonly session: SignalsSession;
}

export function makeRig(options: RigOptions = {}): Rig {
  const fake = fakeFetch(options.routes ?? {});
  const clock = { now: NOW };
  const store = options.store ?? spyStore();
  const mode = options.mode ?? "standalone";
  const deps = depsOf(fake, clock);
  const session = new SignalsSession({ mode, deps, settings: async () => store });
  const services: SignalsServices = {
    id: "test",
    mode,
    nowMs: deps.nowMs,
    session,
    loadLinks: async () => options.links ?? { state: "absent" },
    readLeg: options.readLeg ?? (async () => ({ state: "unavailable" })),
  };
  return { services, fake, clock, store, session };
}

export async function flush(rounds = 6): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

// Waits by wall-clock time, not by a count of ticks: a cold dynamic import on a slow or loaded machine takes as long as
// it takes (TM-12), and the limit only exists so a broken test ends.
export async function until(predicate: () => boolean, limitMs = 15_000): Promise<void> {
  const started = performance.now();
  while (!predicate() && performance.now() - started < limitMs) await flush(1);
  await flush(2);
}

export function mountWith(ui: ReactElement, rig: Rig) {
  return render(
    <ModeProvider mode={rig.services.mode}>
      <ClockProvider clock={{ now: () => rig.clock.now }}>
        <SignalsServicesProvider services={rig.services}>{ui}</SignalsServicesProvider>
      </ClockProvider>
    </ModeProvider>,
  );
}
