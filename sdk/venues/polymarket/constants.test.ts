import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../origins.js";
import { CLOB_ORIGIN, DATA_ORIGIN, GAMMA_ORIGIN, GEOBLOCK_FACTS } from "./constants.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const sources = readdirSync(here)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({ name, text: readFileSync(`${here}${name}`, "utf8") }));

describe("origins and the single host registry", () => {
  it("the three origins are exactly the Polymarket entries of sdk/venues/origins.ts", () => {
    const entries = BROWSER_DIRECT_ORIGINS.filter((entry) => entry.venue === "polymarket");
    expect(entries.map((entry) => [entry.service, entry.origin]).sort()).toEqual(
      [
        ["polymarket_clob", CLOB_ORIGIN],
        ["polymarket_data", DATA_ORIGIN],
        ["polymarket_gamma", GAMMA_ORIGIN],
      ].sort(),
    );
    for (const entry of entries) expect(entry.transport).toBe("T0");
  });

  it("no source file names a host outside those three", () => {
    const known = new Set([...BROWSER_DIRECT_ORIGINS, ...DAEMON_ONLY_ORIGINS].map((entry) => new URL(entry.origin).hostname));
    const allowed = new Set(["gamma-api.polymarket.com", "clob.polymarket.com", "data-api.polymarket.com"]);
    for (const { name, text } of sources) {
      for (const match of text.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)/g)) {
        const host = (match[1] ?? "").toLowerCase();
        expect(allowed.has(host), `${name} names ${host}`).toBe(true);
        expect(known.has(host)).toBe(true);
      }
    }
  });
});

describe("the adapter is read-only code", () => {
  it("has no write method, no body, no Node module and no global access", () => {
    for (const { name, text } of sources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, name).not.toMatch(/["']POST["']|["']PUT["']|["']DELETE["']|["']PATCH["']/);
      expect(code, name).not.toMatch(/\bbody\s*:/);
      expect(code, name).not.toMatch(/from ["']node:/);
      expect(code, name).not.toMatch(/\b(?:window|document|localStorage|sessionStorage|indexedDB|globalThis|process)\b/);
      expect(code, name).not.toMatch(/\b(?:innerHTML|outerHTML|dangerouslySetInnerHTML|eval|new Function)\b/);
      expect(code, name).not.toMatch(/(?<![.\w])fetch\(/);
      expect(code, name).not.toMatch(/\b(?:cookie|credentials|authorization|api[-_]?key|secret|private[-_]?key)\b/i);
    }
  });

  it("does not write the host, the home directory, a username or an e-mail anywhere", () => {
    for (const { name, text } of sources) {
      expect(text, name).not.toMatch(/\/Users\/|\/home\/|@[a-z0-9-]+\.[a-z]{2,}\b/i);
    }
  });
});

describe("geoblock facts are dated and are not a verdict", () => {
  it("carry a date, a source and the close-only definition", () => {
    expect(GEOBLOCK_FACTS.asOf).toBe("2026-10-18");
    expect(GEOBLOCK_FACTS.source).toContain("geoblock");
    expect(GEOBLOCK_FACTS.closeOnlyFrontendAndApi).toContain("US");
    expect(GEOBLOCK_FACTS.note).toMatch(/not an eligibility verdict/);
    expect(GEOBLOCK_FACTS.note).toMatch(/Close-only means/);
  });
});
