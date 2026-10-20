import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS } from "../../../headers.config";
import { fakeFetch } from "../limitless/fixtures/fake-fetch";
import { DISCLOSURE_VERSION, type VenueSwitches } from "../../core/venue-policy";
import { registeredOrigin as kalshiOrigin } from "../kalshi/constants";
import { registeredOrigin as limitlessOrigin } from "../limitless/constants";
import { registeredOrigin as sxOrigin } from "../sx/constants";
import { registeredOrigin as udxOrigin } from "../udx/constants";
import { createKalshiAdapter } from "./index";
import { createUdxAdapter } from "../udx/index";

// Source rules for the four daemon-fetch adapters (limitless, kalshi, sx, udx), enforced as tests so a violation
// fails here before the build-level checks do. They back R3 and R5 (restricted data is memory-only and never
// exported), R10 (nothing works around a block) and the single-source-of-truth rule for hosts. Comments may name
// a banned thing to forbid it, so they are stripped first.

const venuesDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENUES = ["limitless", "kalshi", "sx", "udx"] as const;

function strip(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function production(venue: string): Array<{ readonly name: string; readonly code: string }> {
  const dir = join(venuesDir, venue);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
    .map((entry) => ({ name: `${venue}/${entry.name}`, code: strip(readFileSync(join(dir, entry.name), "utf8")) }));
}

const files = VENUES.flatMap((venue) => production(venue));

describe("source hygiene across limitless, kalshi, sx and udx", () => {
  it("scans the files it should", () => {
    const names = files.map((file) => file.name);
    for (const venue of VENUES) for (const expected of ["adapter.ts", "map.ts", "http.ts", "schemas.ts", "constants.ts", "errors.ts", "index.ts"]) expect(names).toContain(`${venue}/${expected}`);
  });

  it("names no host at all: every host comes from headers.config.ts", () => {
    for (const { name, code } of files) {
      expect([...code.matchAll(/(?:https?|wss?):\/\/[A-Za-z0-9.-]+/g)].map((m) => m[0]), name).toEqual([]);
      expect(code, name).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });

  it("imports no storage and touches none, and keeps no cookie, history or location", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\b(?:indexedDB|localStorage|sessionStorage|openDB|caches|navigator\.storage|document\.cookie)\b/);
      expect(code, name).not.toMatch(/from\s+["'](?:idb|node:fs|fs|node:)/);
      expect(code, name).not.toMatch(/\b(?:history|location)\.(?:push|replace|assign|href|hash|search)/);
      expect(code, name).not.toMatch(/core\/(?:bindings|settings|cache)/);
    }
  });

  it("has no export, share, copy, download or print path (R5)", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\b(?:Blob|createObjectURL|FileReader|showSaveFilePicker|saveAs|window\.open|navigator\.clipboard|navigator\.share|execCommand|window\.print)\b/);
      expect(code, name).not.toMatch(/\.csv\b|\btoCsv\b|\btext\/csv\b|\bdownload\b/i);
      expect(code, name).not.toMatch(/\bconsole\./);
    }
  });

  it("makes no request of its own, and sets no identity header (R10)", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|globalThis\.fetch|window\.fetch)\b/);
      expect(code, name).not.toMatch(/(?<![.\w])fetch\s*\(/);
      expect(code, name).not.toMatch(/["'`](?:origin|referer|user-agent|cookie|authorization|x-[a-z-]*key)["'`]/i);
      expect(code, name).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
    }
  });

  it("reaches no signed or account route and has no way to sign, order or pay", () => {
    for (const { name, code } of files) {
      expect(code, name).not.toMatch(/\/portfolio|\/orders\b|\/fills|\/settlements|\/balance|user-orders|\/positions-v3|\/orders-v3|odds\/best|fees-v3|\/trades|snapshot\/market/);
      expect(code, name).not.toMatch(/signTypedData|personal_sign|eth_sign|privateKey|writeContract|sendTransaction|\bPOST\b|method:\s*["'](?:POST|PUT|DELETE|PATCH)/);
    }
  });

  it("parses upstream JSON in one place per venue, behind the size cap", () => {
    for (const venue of VENUES) {
      const parsing = production(venue).filter((file) => /JSON\.parse/.test(file.code)).map((file) => file.name);
      // map.ts of SX Bet also reads the JSON string a crypto market carries in `marketMeta`.
      expect(parsing.filter((name) => !name.endsWith("/http.ts") && name !== "sx/map.ts"), venue).toEqual([]);
    }
  });
});

describe("hosts come from headers.config.ts (single source of truth)", () => {
  const rows = [...BROWSER_DIRECT_ORIGINS, ...DAEMON_ONLY_ORIGINS];

  it("resolves the registered origin of Limitless and Kalshi to exactly the entry in the file", () => {
    for (const [venue, lookup] of [["limitless", limitlessOrigin], ["kalshi", kalshiOrigin]] as const) {
      const entries = rows.filter((row) => row.venue === venue && row.service !== null);
      expect(entries, venue).toHaveLength(1);
      expect(lookup(venue), venue).toBe(entries[0]?.origin);
    }
  });

  it("resolves SX Bet and UDX to an origin only if the file has one entry for them", () => {
    const row = (origin: string, venue: string, service: string | null = venue) => ({ origin, venue, service });
    for (const [venue, lookup] of [["sx", sxOrigin], ["udx", udxOrigin], ["limitless", limitlessOrigin], ["kalshi", kalshiOrigin]] as const) {
      expect(lookup(venue, []), venue).toBeNull();
      expect(lookup(venue, [row("https://api.example.test", venue)]), venue).toBe("https://api.example.test");
      expect(lookup(venue, [row("https://api.example.test", venue), row("https://api.example.test", venue)]), venue).toBe("https://api.example.test");
      // Two different origins are ambiguous, a host-less entry is not a service, and a plain-http one is no origin.
      expect(lookup(venue, [row("https://a.example.test", venue), row("https://b.example.test", venue)]), venue).toBeNull();
      expect(lookup(venue, [row("https://api.example.test", venue, null)]), venue).toBeNull();
      expect(lookup(venue, [row("http://api.example.test", venue)]), venue).toBeNull();
      expect(lookup(venue, [row("https://api.example.test/path", venue)]), venue).toBeNull();
      expect(lookup(venue, [row("https://user@api.example.test", venue)]), venue).toBeNull();
      expect(lookup(venue, [row("https://api.example.test", "xo")]), venue).toBeNull();
    }
  });
});

describe("restricted adapters keep nothing (Kalshi, UDX: R3, M1-6)", () => {
  const ON = (venue: string): VenueSwitches => ({ enabled: { [venue]: true }, disclosureAccepted: { [venue]: DISCLOSURE_VERSION } });
  const NOW = Date.parse("2026-10-19T12:00:00Z");

  it("touches no storage API during a full session, and asks the venue again for a repeated read", async () => {
    const trapped = ["indexedDB", "localStorage", "sessionStorage", "caches"];
    const touched: string[] = [];
    const saved = new Map(trapped.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const name of trapped) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          touched.push(name);
          throw new Error(`${name} must not be touched`);
        },
      });
    }
    try {
      // No Kalshi payload is committed: the venue answers an empty object, which the adapter rejects as a wrong
      // shape. Only the number of requests and the absence of storage use matter here.
      const kalshiTicker = "KXTEST-1";
      const k = fakeFetch({
        "GET https://external-api.kalshi.com/trade-api/v2/markets?": { json: {} },
        [`GET https://external-api.kalshi.com/trade-api/v2/markets/${kalshiTicker}/orderbook`]: { json: {} },
      });
      const kalshi = createKalshiAdapter({ fetch: k.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => ON("kalshi") });
      const swallow = async (read: Promise<unknown>) => {
        try {
          await read;
        } catch {
          // A wrong-shape answer is expected here.
        }
      };
      await swallow(kalshi.listMarkets({}));
      await swallow(kalshi.listMarkets({}));
      await kalshi.getBooks([{ venue: "kalshi", tokenId: `${kalshiTicker}#yes` }], { deadlineMs: 5_000 });
      await kalshi.getBooks([{ venue: "kalshi", tokenId: `${kalshiTicker}#yes` }], { deadlineMs: 5_000 });
      // No cache: four reads, four requests.
      expect(k.calls).toHaveLength(4);

      // No UDX response is committed (restricted terms): wrong-shape answers still prove nothing is stored or cached.
      const udxTicker = "ticker-under-test";
      const u = fakeFetch({
        "GET https://udx.example.test/markets?": { json: {} },
        [`GET https://udx.example.test/markets/${udxTicker}/orderbook`]: { json: {} },
      });
      const udx = createUdxAdapter({ fetch: u.fetch, nowMs: () => NOW }, { build: "cockpit", switches: () => ON("udx"), origin: "https://udx.example.test" });
      await swallow(udx.listMarkets({}));
      await swallow(udx.listMarkets({}));
      await udx.getBooks([{ venue: "udx", tokenId: `${udxTicker}#yes` }], { deadlineMs: 5_000 });
      await udx.getBooks([{ venue: "udx", tokenId: `${udxTicker}#yes` }], { deadlineMs: 5_000 });
      expect(u.calls).toHaveLength(4);
    } finally {
      for (const name of trapped) {
        const descriptor = saved.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
    }
    expect(touched).toEqual([]);
  });
});
