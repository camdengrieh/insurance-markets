import { describe, expect, it } from "vitest";

import { EMPTY_REGISTRY, PLATFORM_ID_BY_VENUE, geoListsComplete, parseRegistry, readFact, readVenueFact, stalenessOf, type Registry, type SectionMeta } from "./registry";
import { VENUE_IDS } from "./venue-policy";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 19);

// Synthetic fixtures: the shape of the registry design, with invented values. They test the reader, not any venue.
function meta(overrides: Partial<SectionMeta> = {}): SectionMeta {
  return {
    last_verified: "2026-10-19",
    ttl_days: 30,
    verified_by: "human:test",
    method: "primary_doc",
    confidence: "H",
    sources: [{ url: "https://example.org/terms", retrieved: "2026-10-19" }],
    ...overrides,
  };
}

function geo(overrides: Partial<SectionMeta> = {}, extra: Record<string, unknown> = {}) {
  return {
    meta: meta(overrides),
    us_persons: "blocked",
    geo_model: "global_restrictions",
    restricted_iso2: ["US", "GB"],
    allowed_iso2: null,
    enforcement: "ip",
    bots_policy: "allowed",
    wash_trading_prohibited: true,
    ...extra,
  };
}

function file(platforms: unknown[], schemaVersion = "0.2.0") {
  return { schema_version: schemaVersion, registry_version: "2026.10.19-1", platforms };
}

function load(platforms: unknown[]): Registry {
  return parseRegistry(file(platforms)).registry;
}

describe("parseRegistry", () => {
  it("loads valid records and reports none dropped", () => {
    const parsed = parseRegistry(file([{ platform_id: "xo", record_depth: "full", regulation_geo: geo() }, { platform_id: "limitless" }]));
    expect(parsed.issues).toEqual([]);
    expect([...parsed.registry.platforms.keys()]).toEqual(["xo", "limitless"]);
    expect(parsed.registry.registryVersion).toBe("2026.10.19-1");
  });

  it("drops a record with an unknown enum value, and that platform then reads as unknown", () => {
    const parsed = parseRegistry(file([{ platform_id: "xo", regulation_geo: geo({}, { us_persons: "mostly_allowed" }) }, { platform_id: "good", regulation_geo: geo() }]));
    expect(parsed.registry.platforms.has("xo")).toBe(false);
    expect(parsed.registry.platforms.has("good")).toBe(true);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.where).toBe("xo");
    expect(readFact(parsed.registry, "xo", "regulation_geo", "display", NOW)).toEqual({ known: false, reason: "no_platform" });
  });

  it("drops records with a missing source, a bad date, a bad ttl or an over-long quote", () => {
    const cases = [
      { platform_id: "a", regulation_geo: geo({ sources: [] }) },
      { platform_id: "b", regulation_geo: geo({ last_verified: "19/10/2026" }) },
      { platform_id: "c", regulation_geo: geo({ ttl_days: 0 }) },
      { platform_id: "d", regulation_geo: geo({ sources: [{ url: "https://example.org", retrieved: "2026-10-19", quote: Array(30).fill("word").join(" ") }] }) },
      { platform_id: "e", regulation_geo: geo({ confidence: "Z" as never }) },
      { platform_id: "Bad Id", regulation_geo: geo() },
      "not an object",
      null,
    ];
    const parsed = parseRegistry(file(cases));
    expect(parsed.registry.platforms.size).toBe(0);
    expect(parsed.issues).toHaveLength(cases.length);
  });

  it("drops both copies of a duplicate platform id", () => {
    const parsed = parseRegistry(file([{ platform_id: "xo" }, { platform_id: "xo" }]));
    expect(parsed.registry.platforms.size).toBe(0);
    expect(parsed.issues[0]?.problem).toContain("duplicate");
  });

  it("refuses a file that is not a registry or has an unsupported major version", () => {
    for (const bad of [null, 5, "x", {}, { schema_version: "0.2", registry_version: "x" }, file([], "oops")]) {
      expect(parseRegistry(bad).registry).toBe(EMPTY_REGISTRY);
    }
    const future = parseRegistry(file([{ platform_id: "xo" }], "1.0.0"));
    expect(future.registry).toBe(EMPTY_REGISTRY);
    expect(future.issues[0]?.problem).toContain("major");
  });

  it("ignores fields it does not know in a section (additive minor versions)", () => {
    const parsed = parseRegistry(file([{ platform_id: "xo", future_family: { a: 1 }, regulation_geo: geo({}, { new_field: "x" }) }]));
    expect(parsed.issues).toEqual([]);
    expect(parsed.registry.platforms.get("xo")?.regulation_geo).toBeDefined();
  });
});

describe("staleness (platform-registry-design 3.5)", () => {
  const at = (days: number) => NOW + days * DAY;

  it("is fresh up to the ttl, stale up to twice the ttl, then expired", () => {
    const m = meta({ ttl_days: 30 });
    expect(stalenessOf(m, at(0))).toBe("fresh");
    expect(stalenessOf(m, at(30))).toBe("fresh");
    expect(stalenessOf(m, at(30) + 1)).toBe("stale");
    expect(stalenessOf(m, at(60))).toBe("stale");
    expect(stalenessOf(m, at(60) + 1)).toBe("expired");
  });

  it("does not trust a verification date in the future", () => {
    expect(stalenessOf(meta({ last_verified: "2026-10-25" }), NOW)).toBe("expired");
    expect(stalenessOf(meta({ last_verified: "2026-10-20" }), NOW)).toBe("fresh");
    expect(stalenessOf(meta(), Number.NaN)).toBe("expired");
  });
});

describe("readFact", () => {
  const registry = load([
    { platform_id: "fresh", regulation_geo: geo() },
    { platform_id: "stale", regulation_geo: geo({ last_verified: "2026-08-25" }) },
    { platform_id: "expired", regulation_geo: geo({ last_verified: "2026-01-01" }) },
    { platform_id: "medium", regulation_geo: geo({ confidence: "M" }) },
    { platform_id: "medium-checked", regulation_geo: geo({ confidence: "M", cross_checked: true }) },
    { platform_id: "low", regulation_geo: geo({ confidence: "L" }) },
    { platform_id: "claim", regulation_geo: geo({ method: "vendor_claim", confidence: "H" }) },
    { platform_id: "no-section" },
  ]);
  const read = (id: string, purpose: "display" | "screen" | "gate") => readFact(registry, id, "regulation_geo", purpose, NOW);

  it("answers unknown for a missing registry, platform or section", () => {
    expect(readFact(null, "fresh", "regulation_geo", "display", NOW)).toEqual({ known: false, reason: "no_registry" });
    expect(readFact(undefined, "fresh", "regulation_geo", "display", NOW)).toEqual({ known: false, reason: "no_registry" });
    expect(readFact(EMPTY_REGISTRY, "fresh", "regulation_geo", "display", NOW)).toEqual({ known: false, reason: "no_registry" });
    expect(read("nobody", "display")).toEqual({ known: false, reason: "no_platform" });
    expect(read("no-section", "display")).toEqual({ known: false, reason: "no_section" });
    expect(readFact(registry, "fresh", "fees", "display", NOW)).toEqual({ known: false, reason: "no_section" });
  });

  it("returns a fresh value with its date and age for every purpose", () => {
    for (const purpose of ["display", "screen", "gate"] as const) {
      const fact = read("fresh", purpose);
      expect(fact.known).toBe(true);
      if (!fact.known) continue;
      expect(fact.staleness).toBe("fresh");
      expect(fact.lastVerified).toBe("2026-10-19");
      expect(fact.ageDays).toBe(0);
      expect(fact.degraded).toBe(false);
      expect(fact.value.restricted_iso2).toEqual(["US", "GB"]);
    }
  });

  it("shows a stale value, degraded, for display and screening but blocks it as a gate", () => {
    for (const purpose of ["display", "screen"] as const) {
      const fact = read("stale", purpose);
      expect(fact.known && fact.degraded).toBe(true);
      expect(fact.known && fact.ageDays).toBe(55);
    }
    expect(read("stale", "gate")).toEqual({ known: false, reason: "stale_for_gate" });
  });

  it("hides an expired value everywhere", () => {
    for (const purpose of ["display", "screen", "gate"] as const) expect(read("expired", purpose)).toEqual({ known: false, reason: "expired" });
  });

  it("lets only high-confidence, or medium with a cross-check, gate; vendor claims and low never do", () => {
    expect(read("fresh", "gate").known).toBe(true);
    expect(read("medium", "gate")).toEqual({ known: false, reason: "not_gate_grade" });
    expect(read("medium-checked", "gate").known).toBe(true);
    expect(read("low", "gate")).toEqual({ known: false, reason: "not_gate_grade" });
    expect(read("claim", "gate")).toEqual({ known: false, reason: "not_gate_grade" });
    // They may still be displayed and screened.
    expect(read("low", "display").known).toBe(true);
    expect(read("claim", "screen").known).toBe(true);
  });

  it("maps every venue id to a platform id and reads through it", () => {
    for (const venue of VENUE_IDS) expect(PLATFORM_ID_BY_VENUE[venue]).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(new Set(Object.values(PLATFORM_ID_BY_VENUE)).size).toBe(VENUE_IDS.length);
    const byVenue = load([{ platform_id: "hyperliquid-outcomes", regulation_geo: geo() }]);
    expect(readVenueFact(byVenue, "hyperliquid", "regulation_geo", "display", NOW).known).toBe(true);
    expect(readVenueFact(byVenue, "xo", "regulation_geo", "display", NOW).known).toBe(false);
  });

  it("computes geography completeness only from a fresh, listed value", () => {
    expect(geoListsComplete(read("fresh", "display"))).toBe(true);
    expect(geoListsComplete(read("stale", "display"))).toBe(false);
    expect(geoListsComplete(read("expired", "display"))).toBe(false);
    const open = load([{ platform_id: "open", regulation_geo: geo({}, { restricted_iso2: null, allowed_iso2: null }) }]);
    expect(geoListsComplete(readFact(open, "open", "regulation_geo", "display", NOW))).toBe(false);
  });
});
