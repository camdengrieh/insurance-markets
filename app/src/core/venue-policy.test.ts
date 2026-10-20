import { describe, expect, it } from "vitest";

import { createMemoryRecordStore } from "./bindings";
import type { VenueId } from "./ports";
import { loadVenueSwitches, saveVenueSwitches, withDisclosureAccepted, withVenueDisabled, withVenueEnabled } from "./settings";
import {
  DEFAULT_SWITCHES,
  DISCLOSURE_VERSION,
  UNKNOWN_VENUE_POLICY,
  VENUE_IDS,
  isMemoryOnly,
  isVenueId,
  makeProv,
  venuePolicy,
  venueState,
  type VenueSwitches,
} from "./venue-policy";

const RESTRICTED: VenueId[] = ["kalshi", "gemini", "og", "novig", "udx"];

describe("venue policy table", () => {
  it("covers every venue id exactly once and fails closed for anything else", () => {
    expect(new Set(VENUE_IDS).size).toBe(VENUE_IDS.length);
    expect(VENUE_IDS).toHaveLength(19);
    for (const id of VENUE_IDS) expect(venuePolicy(id).id).toBe(id);
    for (const bad of ["", "unknown", "KALSHI", "__proto__", "constructor", "toString", 5, null, undefined]) {
      expect(venuePolicy(bad)).toBe(UNKNOWN_VENUE_POLICY);
      expect(isVenueId(bad)).toBe(false);
    }
    expect(UNKNOWN_VENUE_POLICY.defaultEnabled).toBe(false);
    expect(UNKNOWN_VENUE_POLICY.restricted).toBe(true);
  });

  it("marks the F5 venues restricted, OFF by default, memory-only, with a clause", () => {
    for (const id of RESTRICTED) {
      const policy = venuePolicy(id);
      expect(policy.restricted, id).toBe(true);
      expect(policy.defaultEnabled, id).toBe(false);
      expect(policy.tier, id).toBe("restricted_off");
      expect(policy.license, id).toBe("own_use_only");
      expect(policy.clause, id).toContain("not legal advice");
      expect(isMemoryOnly(id), id).toBe(true);
    }
  });

  it("treats a venue with no stated licence as memory-only and only on-chain reads as open", () => {
    for (const id of VENUE_IDS) {
      if (venuePolicy(id).license === "unknown") expect(isMemoryOnly(id), id).toBe(true);
    }
    expect(venuePolicy("trueo").license).toBe("open");
    expect(isMemoryOnly("trueo")).toBe(false);
    expect(isMemoryOnly("nonsense")).toBe(true);
  });

  it("a clause exists exactly for restricted venues", () => {
    for (const id of VENUE_IDS) {
      const policy = venuePolicy(id);
      expect(policy.clause !== null, id).toBe(policy.restricted);
    }
  });

  it("records the measured transports", () => {
    expect(venuePolicy("xo").transport).toBe("T0");
    expect(venuePolicy("xo").bookTransport).toBe("T1");
    expect(venuePolicy("limitless").needsCockpit).toBe(true);
    expect(venuePolicy("kalshi").transport).toBe("T1");
    expect(venuePolicy("polymarket").needsCockpit).toBe(false);
    expect(venuePolicy("trueo").transport).toBe("T0-RPC");
  });
});

describe("venueState", () => {
  it("enables the day-zero venues by default", () => {
    for (const id of ["xo", "polymarket", "manifold", "pascal", "trueo", "hyperliquid"] as const) {
      expect(venueState(id, DEFAULT_SWITCHES, "standalone"), id).toEqual({ enabled: true });
      expect(venueState(id, DEFAULT_SWITCHES, "cockpit"), id).toEqual({ enabled: true });
    }
  });

  it("shows 'needs the Cockpit' for a daemon venue in the standalone build and enables it in the Cockpit", () => {
    expect(venueState("limitless", DEFAULT_SWITCHES, "standalone")).toEqual({ enabled: false, reason: "needs_cockpit" });
    expect(venueState("limitless", DEFAULT_SWITCHES, "cockpit")).toEqual({ enabled: true });
  });

  it("keeps a restricted venue OFF until it is both switched on and its current clause accepted (M0-2)", () => {
    for (const id of RESTRICTED) {
      expect(venueState(id, DEFAULT_SWITCHES, "standalone"), id).toEqual({ enabled: false, reason: "restricted_off" });
      expect(venueState(id, DEFAULT_SWITCHES, "cockpit"), id).toEqual({ enabled: false, reason: "restricted_off" });
      const switchedOnly = withVenueEnabled(DEFAULT_SWITCHES, id, true);
      expect(venueState(id, switchedOnly, "cockpit"), id).toEqual({ enabled: false, reason: "restricted_off" });
      const acceptedOnly = withDisclosureAccepted(DEFAULT_SWITCHES, id);
      expect(venueState(id, acceptedOnly, "cockpit"), id).toEqual({ enabled: false, reason: "restricted_off" });
    }
  });

  it("enables a restricted venue only with both, and then still needs the Cockpit where the host is daemon-only", () => {
    const both = withDisclosureAccepted(withVenueEnabled(DEFAULT_SWITCHES, "gemini", true), "gemini");
    expect(venueState("gemini", both, "standalone")).toEqual({ enabled: true });
    const kalshi = withDisclosureAccepted(withVenueEnabled(DEFAULT_SWITCHES, "kalshi", true), "kalshi");
    expect(venueState("kalshi", kalshi, "standalone")).toEqual({ enabled: false, reason: "needs_cockpit" });
    expect(venueState("kalshi", kalshi, "cockpit")).toEqual({ enabled: true });
  });

  it("an acceptance of an older clause version does not count, and switching off forgets the acceptance", () => {
    const stale: VenueSwitches = { enabled: { kalshi: true }, disclosureAccepted: { kalshi: "0" } };
    expect(DISCLOSURE_VERSION).not.toBe("0");
    expect(venueState("kalshi", stale, "cockpit")).toEqual({ enabled: false, reason: "restricted_off" });
    const accepted = withDisclosureAccepted(withVenueEnabled(DEFAULT_SWITCHES, "kalshi", true), "kalshi");
    const off = withVenueDisabled(accepted, "kalshi");
    expect(off.disclosureAccepted.kalshi).toBeUndefined();
    expect(venueState("kalshi", withVenueEnabled(off, "kalshi", true), "cockpit")).toEqual({ enabled: false, reason: "restricted_off" });
  });

  it("a user can switch an open venue off, and a not-built or unknown venue is never available", () => {
    expect(venueState("polymarket", withVenueEnabled(DEFAULT_SWITCHES, "polymarket", false), "standalone")).toEqual({ enabled: false, reason: "switched_off" });
    expect(venueState("polymarket_us", DEFAULT_SWITCHES, "standalone")).toEqual({ enabled: false, reason: "switched_off" });
    expect(venueState("polymarket_us", withVenueEnabled(DEFAULT_SWITCHES, "polymarket_us", true), "standalone")).toEqual({ enabled: true });
    expect(venueState("world", withVenueEnabled(DEFAULT_SWITCHES, "world", true), "cockpit")).toEqual({ enabled: false, reason: "not_available" });
    expect(venueState("prophetx", withDisclosureAccepted(withVenueEnabled(DEFAULT_SWITCHES, "prophetx", true), "prophetx"), "cockpit")).toEqual({ enabled: false, reason: "not_available" });
    expect(venueState("nonsense", DEFAULT_SWITCHES, "cockpit")).toEqual({ enabled: false, reason: "unknown_venue" });
  });

  it("only a restricted venue has a clause to accept; other changes are ignored", () => {
    expect(withDisclosureAccepted(DEFAULT_SWITCHES, "polymarket")).toBe(DEFAULT_SWITCHES);
    expect(withDisclosureAccepted(DEFAULT_SWITCHES, "nonsense")).toBe(DEFAULT_SWITCHES);
    expect(withVenueEnabled(DEFAULT_SWITCHES, "nonsense", true)).toBe(DEFAULT_SWITCHES);
    expect(withVenueDisabled(DEFAULT_SWITCHES, "nonsense")).toBe(DEFAULT_SWITCHES);
  });
});

describe("venue switch persistence", () => {
  it("round-trips through a record store and reads defaults from empty or damaged storage", async () => {
    const store = createMemoryRecordStore();
    expect(await loadVenueSwitches(store)).toBe(DEFAULT_SWITCHES);
    const switches = withDisclosureAccepted(withVenueEnabled(DEFAULT_SWITCHES, "kalshi", true), "kalshi");
    await saveVenueSwitches(store, switches);
    expect(await loadVenueSwitches(store)).toEqual(switches);

    const damaged = createMemoryRecordStore();
    await damaged.put({ id: "venue_switches", enabled: { kalshi: "yes" }, disclosureAccepted: {} });
    expect(await loadVenueSwitches(damaged)).toBe(DEFAULT_SWITCHES);
    await damaged.put({ id: "venue_switches", enabled: { not_a_venue: true }, disclosureAccepted: {} });
    expect(await loadVenueSwitches(damaged)).toBe(DEFAULT_SWITCHES);

    const broken = { ...createMemoryRecordStore(), getAll: () => Promise.reject(new Error("storage blocked")) };
    expect(await loadVenueSwitches(broken)).toBe(DEFAULT_SWITCHES);
  });
});

describe("makeProv", () => {
  it("takes the licence from the policy table, never from the caller, and computes freshness", () => {
    const prov = makeProv({ venue: "kalshi", source: "kalshi/markets", fetchedAtMs: 1000, nowMs: 2000, ttlMs: 5000 });
    expect(prov).toEqual({ venue: "kalshi", source: "kalshi/markets", fetchedAtMs: 1000, transport: "T1", freshness: "live", ttlMs: 5000, license: "own_use_only" });
    const stale = makeProv({ venue: "trueo", source: "base/getCurrentStatus", fetchedAtMs: 0, nowMs: 100_000, ttlMs: 10_000, venueTsMs: 5, transport: "T0-RPC" });
    expect(stale.freshness).toBe("stale");
    expect(stale.license).toBe("open");
    expect(stale.venueTsMs).toBe(5);
    expect(makeProv({ venue: "xo", source: "s", fetchedAtMs: 0, nowMs: 1, ttlMs: 0 }).freshness).toBe("unknown");
  });
});
