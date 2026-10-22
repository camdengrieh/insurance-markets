// Test helpers for the linker: a loopback world playing the three allowlisted venues in their REAL
// response shapes (the recorded fixtures under sdk/venues/*/fixtures are the templates, because
// discovery reads them with the shared venue parsers), filled with SYNTHETIC market text that is labelled as such. Nothing here can
// reach a real host; ids are derived from a label by hashing so no real market is ever named.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_RECORDABLE_HOSTS } from "../../recorder/allowlist.js";
import { ManualClock } from "../../recorder/clock.js";
import { mustConfig, type RecorderConfig } from "../../recorder/config.js";
import { startHost, tempDir, type FakeHost, type Handler } from "../recorder/helpers.js";

export { tempDir };

export const T0 = Date.parse("2026-10-20T12:00:00Z");
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..");

export function syntheticHex(label: string): string {
  return `0x${createHash("sha256").update(`SYNTHETIC:${label}`).digest("hex")}`;
}

export interface SynthMarket {
  readonly venue: "xo" | "polymarket" | "limitless";
  readonly id: string;
  readonly title: string;
  readonly rules: string;
  readonly closeIso: string;
  // XO: categoryPath names; Limitless: categories. Polymarket keyset rows carry none.
  readonly tags?: readonly string[];
  readonly groupKey?: string; // XO rootEventSlug, Polymarket negRiskMarketID
  readonly status?: string;
  readonly outcomes?: readonly string[];
  readonly detailStatus?: number;
}

export function synth(venue: SynthMarket["venue"], label: string, extra: Partial<SynthMarket> = {}): SynthMarket {
  const id = venue === "limitless" ? `synthetic-${label}` : syntheticHex(`${venue}:${label}`);
  return {
    venue,
    id,
    title: `SYNTHETIC ${label}`,
    rules: `SYNTHETIC rules for ${label}. Resolves Yes if the synthetic event happens by the close.`,
    closeIso: "2026-12-31T00:00:00.000Z",
    ...extra,
  };
}

let rowId = 70_000;

// XO list row (Data API /api/markets): the real envelope and row shape; list rows carry rules: {}.
export function xoListRow(m: SynthMarket): Record<string, unknown> {
  rowId += 1;
  return {
    id: rowId,
    createdAt: "2026-10-18T12:03:07.741Z",
    updatedAt: "2026-10-20T05:07:29.264Z",
    contractMarketId: m.id,
    conditionId: m.id,
    marketContractAddress: "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307",
    versionId: 3,
    createMarketBlockTimestamp: "2026-10-18T12:03:05.000Z",
    creatorId: 1,
    title: m.title,
    slug: `synthetic-${rowId}`,
    rules: {},
    categoryPath: (m.tags ?? ["SPORTS"]).map((name, i) => ({ id: i + 1, name, slug: null })),
    type: 2,
    totalVolume: "0",
    totalVolumeInUSD: "0",
    status: m.status ?? "ACTIVE",
    startsAt: "2026-10-18T12:02:56.000Z",
    expiresAt: m.closeIso,
    resolvedAt: null,
    resolutionSources: ["https://example.invalid/synthetic"],
    resolutionType: "MANUAL",
    resolutionFlagCount: 0,
    outcomes: [
      { id: rowId * 10, marketId: rowId, outcomeTokenId: `${rowId}1`, title: "Yes", currentPrice: "500000", index: 0 },
      { id: rowId * 10 + 1, marketId: rowId, outcomeTokenId: `${rowId}2`, title: "No", currentPrice: "500000", index: 1 },
    ],
    reviewStatus: "APPROVE",
  };
}

export function xoDetailBody(m: SynthMarket, listRow: Record<string, unknown>): Record<string, unknown> {
  return {
    ...listRow,
    rules: { description: m.rules, outcomeRules: [] },
    resolverAddress: "0x000000000000000000000000000000000000dEaD",
    ...(m.groupKey === undefined ? {} : { rootEventSlug: m.groupKey }),
    effectiveFeeConfig: { eligible: true, curveModel: "FLAT_BPS", takerFeeBps: 400, makerFeeBps: 0 },
  };
}

// Gamma /markets/keyset row: the captured row's fields (sdk/venues/polymarket/fixtures).
export function gammaKeysetRow(m: SynthMarket): Record<string, unknown> {
  rowId += 1;
  const nr = m.groupKey;
  return {
    id: String(rowId),
    question: m.title,
    conditionId: m.id,
    slug: `synthetic-${rowId}`,
    resolutionSource: "",
    endDate: m.closeIso.replace(".000Z", "Z"),
    description: m.rules,
    outcomes: JSON.stringify(m.outcomes ?? ["Yes", "No"]),
    active: (m.status ?? "active") === "active",
    closed: m.status === "closed",
    archived: false,
    resolvedBy: "0x157Ce2d672854c848c9b79C49a8Cc6cc89176a49",
    enableOrderBook: true,
    clobTokenIds: JSON.stringify([`${rowId}1`, `${rowId}2`]),
    orderPriceMinTickSize: 0.001,
    umaBond: "500",
    acceptingOrders: true,
    negRisk: nr !== undefined,
    ...(nr === undefined ? {} : { negRiskMarketID: nr }),
    events: [{ id: String(rowId + 1000), slug: `synthetic-event-${rowId}` }],
    version: "v1",
  };
}

// Limitless /markets/active row: the captured envelope { data, totalMarketsCount } and row fields.
export function limitlessRow(m: SynthMarket): Record<string, unknown> {
  rowId += 1;
  return {
    id: rowId,
    slug: m.id,
    title: m.title,
    description: `<p>${m.rules}</p>`,
    expirationTimestamp: Date.parse(m.closeIso),
    expirationDate: "Dec 31, 2026",
    status: m.status ?? "FUNDED",
    expired: false,
    hidden: false,
    marketType: "single",
    tradeType: "clob",
    categories: [...(m.tags ?? ["Crypto"])],
    tags: [],
    tokens: { yes: `${rowId}1`, no: `${rowId}2` },
    collateralToken: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, symbol: "USDC" },
    conditionId: syntheticHex(`limitless-cond:${m.id}`),
    groupId: null,
  };
}

export interface World {
  readonly clock: ManualClock;
  readonly hosts: Record<string, FakeHost>;
  readonly markets: SynthMarket[];
  config(overrides?: Record<string, unknown>): RecorderConfig;
  configFile(dir: string): string;
  close(): Promise<void>;
}

export async function startWorld(specs: readonly SynthMarket[], clockStart = T0): Promise<World> {
  const clock = new ManualClock(clockStart);
  const markets = [...specs];
  const xoRows = new Map<string, Record<string, unknown>>();
  const hosts: Record<string, FakeHost> = {};
  const nf = { status: 404, body: { statusCode: 404, message: "not found" } };
  const handlers: Record<string, Handler> = {
    "api-mainnet.xo.market": (_r, u) => {
      const xo = markets.filter((m) => m.venue === "xo");
      if (u.pathname === "/api/markets") {
        const page = Number(u.searchParams.get("page") ?? "1");
        const take = Number(u.searchParams.get("take") ?? "50");
        const rows = xo.slice((page - 1) * take, page * take).map((m) => {
          const row = xoRows.get(m.id) ?? xoListRow(m);
          xoRows.set(m.id, row);
          return row;
        });
        const pageCount = Math.max(1, Math.ceil(xo.length / take));
        return { body: { data: rows, meta: { page, take, itemCount: xo.length, pageCount, hasPreviousPage: page > 1, hasNextPage: page < pageCount } } };
      }
      const hit = /^\/api\/markets\/contract\/(.+)$/.exec(u.pathname);
      const m = hit === null ? undefined : xo.find((x) => x.id === decodeURIComponent(hit[1] ?? ""));
      if (m === undefined) return nf;
      if (m.detailStatus !== undefined) return { status: m.detailStatus, body: {} };
      const row = xoRows.get(m.id) ?? xoListRow(m);
      xoRows.set(m.id, row);
      return { body: xoDetailBody(m, row) };
    },
    "orderbooks.xo.market": () => nf,
    "gamma-api.polymarket.com": (_r, u) => {
      if (u.pathname !== "/markets/keyset") return { body: [] };
      const poly = markets.filter((m) => m.venue === "polymarket");
      const limit = Number(u.searchParams.get("limit") ?? "100");
      const cursor = u.searchParams.get("cursor");
      const start = cursor === null ? 0 : Number(cursor);
      const rows = poly.slice(start, start + limit).map(gammaKeysetRow);
      const next = start + limit < poly.length ? String(start + limit) : null;
      return { body: { $schema: "https://example.invalid/schema", markets: rows, ...(next === null ? {} : { next_cursor: next }) } };
    },
    "clob.polymarket.com": () => nf,
    "api.limitless.exchange": (_r, u) => {
      if (u.pathname !== "/markets/active") return nf;
      const lim = markets.filter((m) => m.venue === "limitless");
      const limit = Number(u.searchParams.get("limit") ?? "25");
      const page = Number(u.searchParams.get("page") ?? "1");
      return { body: { data: lim.slice((page - 1) * limit, page * limit).map(limitlessRow), totalMarketsCount: lim.length } };
    },
  };
  for (const h of ALL_RECORDABLE_HOSTS) hosts[h] = await startHost(handlers[h] as Handler, () => clock.nowMs());
  const bases = (): Record<string, string> => Object.fromEntries(Object.entries(hosts).map(([h, f]) => [h, f.base]));
  return {
    clock,
    hosts,
    markets,
    config: (overrides = {}) => mustConfig({ dbPath: ":memory:", hostBases: bases(), backoff: { baseMs: 1000, maxMs: 60_000, factor: 2, jitter: 0, maxAttempts: 3 }, ...overrides }),
    configFile: (dir) => {
      const path = join(dir, "linker-config.json");
      writeFile(path, JSON.stringify({ hostBases: bases(), backoff: { baseMs: 1000, maxMs: 5000, factor: 2, jitter: 0, maxAttempts: 2 } }));
      return path;
    },
    close: async () => {
      for (const h of Object.values(hosts)) await h.close();
    },
  };
}

import { writeFileSync } from "node:fs";
function writeFile(path: string, text: string): void {
  writeFileSync(path, text);
}

export function readFixture(relative: string): unknown {
  return JSON.parse(readFileSync(join(REPO, relative), "utf8")) as unknown;
}

export function totalSeen(world: World, host?: string): number {
  return Object.entries(world.hosts)
    .filter(([h]) => host === undefined || h === host)
    .reduce((a, [, f]) => a + f.seen.length, 0);
}
