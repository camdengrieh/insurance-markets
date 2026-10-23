// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../test/fixtures/userop/anvil-test-keys";
import { createCredentialStore, credentialKey } from "./credentials";
import { createPolymarketExecutor } from "./polymarket/executor";
import { fakeChain, fakeSigner, fakeVenue, json, testDeps } from "./testkit";

// The visitor's venue credential: this tab's memory and sessionStorage, keyed by venue and wallet address, never
// localStorage. A second wallet in the same tab never sees the first one's.

const A = ANVIL_TEST_ACCOUNTS[0]!;
const B = ANVIL_TEST_ACCOUNTS[1]!;
const VALUE = JSON.stringify({ apiKey: "00000000-test-only-0000-000000000000", secret: "dGVzdC1vbmx5", passphrase: "test-only" });

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("the credential store", () => {
  it("keys by venue and by address, whatever the address's case", () => {
    const store = createCredentialStore(sessionStorage);
    store.set("polymarket", A.address, VALUE);
    expect(store.get("polymarket", A.address.toLowerCase())).toBe(VALUE);
    expect(store.get("polymarket", B.address)).toBeNull();
    expect(store.get("limitless", A.address)).toBeNull();
    expect(sessionStorage.getItem(credentialKey("polymarket", A.address))).toBe(VALUE);
    expect(credentialKey("polymarket", A.address)).toBe(`xo-direct:polymarket:${A.address.toLowerCase()}`);
    store.remove("polymarket", A.address);
    expect(store.get("polymarket", A.address)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("survives a reload of the same tab (a new store over the same sessionStorage), and keeps working in memory when storage throws", () => {
    createCredentialStore(sessionStorage).set("polymarket", A.address, VALUE);
    expect(createCredentialStore(sessionStorage).get("polymarket", A.address)).toBe(VALUE);
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    const store = createCredentialStore(broken);
    store.set("polymarket", A.address, VALUE);
    expect(store.get("polymarket", A.address)).toBe(VALUE);
    store.remove("polymarket", A.address);
    expect(store.get("polymarket", A.address)).toBeNull();
  });

  it("a login stores the visitor's credential in sessionStorage under that wallet only, and nothing in localStorage", async () => {
    const venue = fakeVenue({ "GET /time": () => ({ status: 200, text: "1792755563" }), "GET /auth/derive-api-key": () => json(200, JSON.parse(VALUE)) });
    const executor = createPolymarketExecutor(testDeps(venue, fakeChain({}), sessionStorage));
    expect((await executor.login(fakeSigner(A))).ok).toBe(true);
    expect(Object.keys(sessionStorage)).toEqual([credentialKey("polymarket", A.address)]);
    expect(localStorage.length).toBe(0);
    expect(executor.session(fakeSigner(B))).toBeNull();
    expect(executor.session(fakeSigner(A))).not.toBeNull();
  });
});
