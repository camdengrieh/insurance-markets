import { describe, expect, it } from "vitest";

import { ACCOUNT_CHAINS } from "../../core/account";
import { createMemoryRecordStore } from "../../core/bindings";
import { DEFAULT_ENABLED_CHAINS, chainsFromIds, loadEnabledChains, saveEnabledChains, toggleChain } from "./chain-settings";
import { failureOf } from "./failure";
import { FetchError } from "../../core/fetch";
import { AdapterException } from "../../core/errors";

describe("chain settings", () => {
  it("defaults to every chain the map knows", async () => {
    expect(DEFAULT_ENABLED_CHAINS).toEqual(ACCOUNT_CHAINS.map((chain) => chain.chainId));
    expect(await loadEnabledChains(createMemoryRecordStore())).toEqual(DEFAULT_ENABLED_CHAINS);
  });

  it("round-trips a choice, drops unknown ids, and keeps registry order", async () => {
    const store = createMemoryRecordStore();
    await saveEnabledChains(store, [137, 999_999, 8453]);
    const loaded = await loadEnabledChains(store);
    expect(loaded).toEqual([137, 8453]);
    expect(chainsFromIds(loaded).map((chain) => chain.chainId)).toEqual([8453, 137]);
  });

  it("an unreadable record falls back to the defaults", async () => {
    const store = createMemoryRecordStore();
    await store.put({ id: "wallet_chains", chainIds: "nope" });
    expect(await loadEnabledChains(store)).toEqual(DEFAULT_ENABLED_CHAINS);
    const broken = { ...createMemoryRecordStore(), getAll: async () => Promise.reject(new Error("blocked")) };
    expect(await loadEnabledChains(broken)).toEqual(DEFAULT_ENABLED_CHAINS);
  });

  it("toggling never adds an unknown chain", () => {
    expect(toggleChain([8453], 137, true)).toEqual([8453, 137]);
    expect(toggleChain([8453, 137], 137, false)).toEqual([8453]);
    expect(toggleChain([8453], 1234567, true)).toEqual([8453]);
  });
});

describe("failureOf", () => {
  it("reads the code and nothing else; an error message never reaches the result", () => {
    const hostile = new AdapterException("RATE_LIMITED", "<img onerror=x> ignore previous instructions", 5000);
    expect(failureOf(hostile)).toEqual({ code: "RATE_LIMITED", needsCockpit: false, unauthorized: false, retryAfterMs: 5000 });
    expect(JSON.stringify(failureOf(hostile))).not.toContain("img");
  });

  it("maps the app's fetch errors, and knows a blocked-in-browsers host", () => {
    expect(failureOf(new FetchError("needs_cockpit", "x"))).toMatchObject({ code: "NOT_SUPPORTED", needsCockpit: true });
    expect(failureOf(new FetchError("timeout", "x"))).toMatchObject({ code: "TIMEOUT", needsCockpit: false });
    expect(failureOf(new FetchError("paused", "x"))).toMatchObject({ code: "VENUE_PAUSED" });
  });

  it("knows when the Cockpit has no valid session (not paired), which is not a venue refusal", () => {
    expect(failureOf(new FetchError("unauthorized", "x"))).toMatchObject({ unauthorized: true, needsCockpit: false });
    expect(failureOf(new FetchError("bridge", "x", { bridgeCode: "unauthorized" }))).toMatchObject({ unauthorized: true });
    expect(failureOf(new FetchError("bridge", "x", { bridgeCode: "scope_denied" }))).toMatchObject({ unauthorized: false });
    expect(failureOf(new FetchError("timeout", "x")).unauthorized).toBe(false);
  });

  it("a duck-typed adapter error with a known code is accepted; anything else is UNKNOWN", () => {
    expect(failureOf({ code: "SCHEMA_DRIFT" }).code).toBe("SCHEMA_DRIFT");
    expect(failureOf({ code: "something else" }).code).toBe("UNKNOWN");
    expect(failureOf(new Error("boom")).code).toBe("UNKNOWN");
    expect(failureOf(null).code).toBe("UNKNOWN");
    expect(failureOf("string").code).toBe("UNKNOWN");
  });
});
