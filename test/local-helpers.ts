import assert from "node:assert/strict";
import { after } from "node:test";

import { Secret } from "../src/config.js";
import { createEmbeddedRelay, type EmbeddedRelay, type EmbeddedRelayOptions } from "../relay/embedded.js";
import { FakeClock, TEST_KDF, TEST_MASTER_SECRET, tempDir, type TempDir } from "./relay-core-helpers.js";

// Shared setup for the local-mode tests (test/local-*.test.ts). Not a test file.
//
// An embedded relay on a temp directory with a cheap key derivation (tests only), an injected clock,
// no background upkeep and no rate limit in the way, unless a test asks for the defaults. The master
// secret is a labelled TEST value. Nothing here touches the network; a test that needs XO gives the
// relay a fetch (the local mock, or a scripted fake).

// ---- no network, ever ---------------------------------------------------------------------------------------------------------

// Importing this file replaces globalThis.fetch for the test process: a request to anything but this
// machine is refused and recorded, and the file's tests fail at the end if one was attempted. The local
// mock and anvil listen on 127.0.0.1, so those pass through. Tests give the relay an explicit fetch as
// well (offlineFetch, or the mock's); this guard is the net underneath.
const realFetch = globalThis.fetch;
const blockedRequests: string[] = [];

export const offlineFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]") return realFetch(input, init);
  blockedRequests.push(`${(init?.method ?? "GET").toUpperCase()} ${url.host}`);
  throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("the test network guard refused this request"), { code: "ECONNREFUSED" }) });
};
globalThis.fetch = offlineFetch;

after(() => {
  assert.deepEqual(blockedRequests, [], "a test tried to reach the network");
});

// Returns what was refused so far and forgets it. A test that deliberately exercises "XO is unreachable"
// calls this and checks the hosts; anything left over fails the file.
export function takeBlockedRequests(): string[] {
  return blockedRequests.splice(0);
}

export const OPEN_RATES = {
  readRate: { capacity: 100_000, refillPerSecond: 100_000 },
  writeRate: { capacity: 100_000, refillPerSecond: 100_000 },
} as const;

// Anything with a clock and a sleep that moves it: a FakeClock, or an adapter over the mock's clock.
export interface TestClock {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface StartedEmbedded {
  readonly relay: EmbeddedRelay;
  readonly dir: TempDir;
  readonly clock: TestClock;
}

const relays: EmbeddedRelay[] = [];
const dirs: TempDir[] = [];

after(async () => {
  for (const relay of relays.splice(0)) await relay.close().catch(() => undefined);
  for (const dir of dirs.splice(0)) await dir.cleanup().catch(() => undefined);
});

export interface StartOptions extends Partial<Omit<EmbeddedRelayOptions, "dataDir" | "env" | "clock">> {
  readonly env?: Record<string, string>;
  readonly dir?: TempDir;
  readonly clock?: TestClock;
  // true keeps the relay's own request rates.
  readonly realRates?: boolean;
}

export async function startEmbedded(options: StartOptions = {}): Promise<StartedEmbedded> {
  let dir = options.dir;
  if (dir === undefined) {
    dir = await tempDir("local-");
    dirs.push(dir);
  }
  const clock = options.clock ?? new FakeClock("2026-10-19T12:00:00Z");
  const { env, dir: _dir, clock: _clock, realRates, ...rest } = options;
  const relay = await createEmbeddedRelay({
    dataDir: dir.dir,
    env: { RELAY_ENFORCE_FLAG_FACTS: "0", ...env },
    clock: clock.now,
    sleep: options.sleep ?? clock.sleep,
    masterSecret: new Secret(TEST_MASTER_SECRET),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    maintenance: false,
    // A data directory left by a simulated crash holds a lock with a pid that is alive (ours).
    isProcessAlive: () => false,
    fetch: offlineFetch,
    ...(realRates === true ? {} : { http: OPEN_RATES }),
    ...rest,
  });
  relays.push(relay);
  return { relay, dir, clock };
}
