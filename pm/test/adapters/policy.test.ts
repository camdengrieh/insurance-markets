import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADAPTER_VENUES,
  HARD_RESTRICTED,
  RestrictedDataError,
  adapterDescriptor,
  assertMayPersist,
  isAdapterVenue,
  mayPersist,
} from "../../adapters/index.js";
import { getPlatform } from "../../registry/registry.js";
import { NOW } from "./helpers.js";

describe("adapter data-terms policy", () => {
  it("lets XO and Polymarket data persist while their registry terms are fresh, and turns them on by default", () => {
    for (const venue of ["xo", "polymarket"] as const) {
      const d = adapterDescriptor(venue, NOW);
      assert.equal(d.restrictedTerms, false, venue);
      assert.equal(d.mayPersist, true);
      assert.equal(d.mayExport, true);
      assert.equal(d.recordable, true);
      assert.equal(d.defaultEnabled, true);
      assert.equal(d.disclosure, null);
      assert.equal(d.termsReason, "none_found");
    }
  });

  it("treats stale terms as restricted: imposing a restriction never needs fresh data", () => {
    const later = Date.parse("2031-01-01T00:00:00Z");
    for (const venue of ["xo", "polymarket"] as const) {
      const d = adapterDescriptor(venue, later);
      assert.equal(d.mayPersist, false, venue);
      assert.equal(d.recordable, false);
      assert.equal(d.defaultEnabled, false);
      assert.notEqual(d.disclosure, null);
    }
  });

  it("keeps Kalshi restricted whatever the registry says", () => {
    assert.ok(HARD_RESTRICTED.has("kalshi"));
    for (const at of [NOW, Date.parse("2031-01-01T00:00:00Z")]) {
      const d = adapterDescriptor("kalshi", at);
      assert.deepEqual(
        [d.restrictedTerms, d.memoryOnly, d.mayPersist, d.mayExport, d.recordable, d.defaultEnabled],
        [true, true, false, false, false, false],
      );
      assert.equal(d.termsReason, "restricted");
    }
    // The registry agrees today; if it ever stops agreeing the floor still holds.
    assert.equal(getPlatform("kalshi")?.dataTerms.value.restricted, "restricted");
  });

  it("assertMayPersist throws for restricted and unknown venues and passes for XO", () => {
    assert.doesNotThrow(() => assertMayPersist("xo", NOW));
    assert.doesNotThrow(() => assertMayPersist("polymarket", NOW, "export"));
    for (const action of ["persist", "export"] as const) {
      assert.throws(() => assertMayPersist("kalshi", NOW, action), RestrictedDataError);
      assert.throws(() => assertMayPersist("quotient", NOW, action), RestrictedDataError);
      assert.throws(() => assertMayPersist("", NOW, action), RestrictedDataError);
    }
    assert.equal(mayPersist("kalshi", NOW), false);
    assert.equal(mayPersist("xo", NOW), true);
    assert.equal(mayPersist("limitless", NOW), false);
  });

  it("lists only the three adapter venues", () => {
    assert.deepEqual([...ADAPTER_VENUES], ["xo", "polymarket", "kalshi"]);
    assert.equal(isAdapterVenue("kalshi"), true);
    assert.equal(isAdapterVenue("trueo"), false);
  });

  it("pins each adapter to hosts that the platform registry also lists, and nothing else", () => {
    for (const venue of ADAPTER_VENUES) {
      const d = adapterDescriptor(venue, NOW);
      const rec = getPlatform(venue);
      const apiBase = rec?.identity.value.urls.apiBase ?? [];
      assert.ok(d.hosts.length > 0);
      for (const host of d.hosts) {
        assert.match(host, /^[a-z0-9.-]+$/);
        assert.ok(apiBase.some((u) => new URL(u).hostname === host), `${venue}: ${host}`);
      }
    }
    assert.deepEqual(adapterDescriptor("xo", NOW).hosts, ["orderbooks.xo.market", "api-mainnet.xo.market"]);
    assert.deepEqual(adapterDescriptor("polymarket", NOW).hosts, ["gamma-api.polymarket.com", "clob.polymarket.com"]);
  });

  it("clauseSha256 is the hash of the clause text, so an acknowledgement proves the clause was read", () => {
    const d = adapterDescriptor("kalshi", NOW);
    assert.match(d.clauseSha256, /^[0-9a-f]{64}$/);
    assert.notEqual(d.clauseSha256, adapterDescriptor("xo", NOW).clauseSha256);
    assert.ok(d.disclosure?.includes("never written to disk"));
  });
});
