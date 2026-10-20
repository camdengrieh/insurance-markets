// Shape drift (spec amendment A9). Two uses of one structural comparison:
//
//   1. the mock against the recordings: every read surface the mock serves is requested and its JSON shape
//      is diffed against the recorded fixtures in test/fixtures/xo (checkMockAgainstFixtures). If someone
//      edits a catalogue builder and a key goes missing, this fails.
//   2. recorded live responses against the recordings: compareDirectoryToFixtures(dir) diffs responses a
//      person saved from the real service (one JSON file per fixture, same file name) against the fixtures.
//      It reads local files only and makes no request. If XO changes a response shape, this reports it.
//
// What "shape" means: the set of JSON kinds at each position (null, boolean, number, object, array, and for
// strings: numeric text, hex text, ISO date-time, empty, other text) and the keys of every object. Values
// are ignored; an empty array matches any array; a key seen in only some elements of an array is optional.

import { fixture } from "../fixtures/xo/load.js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { MarketSpec } from "./catalog.js";
import type { ListenerName, MockXo } from "./server.js";

// ---- shapes ---------------------------------------------------------------------------------------------------------

export interface ShapeNode {
  // Sorted, unique. "null", "boolean", "number", "string:numeric", "string:hex", "string:iso", "string:empty",
  // "string:text", "array", "object".
  readonly kinds: readonly string[];
  // Merged shape of the elements, when "array" is a kind and at least one array had elements.
  readonly items?: ShapeNode;
  // Keys, when "object" is a kind. `optional` is true when some object at this position lacks the key.
  readonly props?: Readonly<Record<string, { readonly node: ShapeNode; readonly optional: boolean }>>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "boolean":
      return "boolean";
    case "number":
      return "number";
    case "string":
      if (value === "") return "string:empty";
      if (/^-?\d+(?:\.\d+)?$/.test(value)) return "string:numeric";
      if (/^0x[0-9a-fA-F]*$/.test(value)) return "string:hex";
      if (ISO.test(value)) return "string:iso";
      return "string:text";
    case "object":
      return "object";
    default:
      return typeof value;
  }
}

// One shape for all the values seen at one position.
export function inferShape(values: readonly unknown[]): ShapeNode {
  const kinds = [...new Set(values.map(kindOf))].sort();
  const arrays = values.filter(Array.isArray) as unknown[][];
  const elements = arrays.flat();
  const objects = values.filter((value) => typeof value === "object" && value !== null && !Array.isArray(value)) as Record<string, unknown>[];
  const out: { kinds: string[]; items?: ShapeNode; props?: Record<string, { node: ShapeNode; optional: boolean }> } = { kinds };
  if (elements.length > 0) out.items = inferShape(elements);
  if (objects.length > 0) {
    const keys = [...new Set(objects.flatMap((object) => Object.keys(object)))];
    const props: Record<string, { node: ShapeNode; optional: boolean }> = {};
    for (const key of keys) {
      const having = objects.filter((object) => key in object);
      props[key] = { node: inferShape(having.map((object) => object[key])), optional: having.length < objects.length };
    }
    out.props = props;
  }
  return out;
}

export interface ShapeDifference {
  readonly path: string;
  readonly problem: "missing_key" | "extra_key" | "kind_changed";
  readonly expected: string;
  readonly actual: string;
}

export interface DiffOptions {
  // true: the non-null kinds at each position must be EQUAL. false (default): the actual kinds must be a subset
  // of the expected kinds (a recording shows only some of the kinds a position can take).
  readonly strictKinds?: boolean;
  // Keys that may be absent from the actual shape although the fixtures carry them (paths like "$.convictionSeed").
  readonly optionalPaths?: readonly string[];
}

export function diffShapes(expected: ShapeNode, actual: ShapeNode, options: DiffOptions = {}, path = "$"): ShapeDifference[] {
  const out: ShapeDifference[] = [];
  const strict = options.strictKinds === true;
  // Null is nullability, not shape: a field that is null in one row and text in another is the same field.
  // A position that is only ever null in one of the two is a wildcard (nothing to compare it with).
  const want = expected.kinds.filter((kind) => kind !== "null");
  const have = actual.kinds.filter((kind) => kind !== "null");
  if (want.length === 0 || have.length === 0) return out;
  const outside = have.filter((kind) => !want.includes(kind));
  const absent = strict ? want.filter((kind) => !have.includes(kind)) : [];
  if (outside.length > 0 || absent.length > 0) {
    out.push({ path, problem: "kind_changed", expected: want.join("|"), actual: have.join("|") });
    return out;
  }
  if (expected.items !== undefined && actual.items !== undefined) out.push(...diffShapes(expected.items, actual.items, options, `${path}[]`));
  if (expected.props !== undefined && actual.props !== undefined) {
    for (const [key, wantProp] of Object.entries(expected.props)) {
      const haveProp = actual.props[key];
      const here = `${path}.${key}`;
      if (haveProp === undefined) {
        if (!wantProp.optional && !(options.optionalPaths ?? []).includes(here)) {
          out.push({ path: here, problem: "missing_key", expected: wantProp.node.kinds.join("|"), actual: "absent" });
        }
        continue;
      }
      out.push(...diffShapes(wantProp.node, haveProp.node, options, here));
    }
    for (const key of Object.keys(actual.props)) {
      if (expected.props[key] === undefined) out.push({ path: `${path}.${key}`, problem: "extra_key", expected: "absent", actual: (actual.props[key] as { node: ShapeNode }).node.kinds.join("|") });
    }
  }
  return out;
}

export function formatDifferences(differences: readonly ShapeDifference[]): string {
  return differences.map((d) => `${d.path}: ${d.problem} (expected ${d.expected}, got ${d.actual})`).join("\n");
}

// The merged shape of the named fixtures (test/fixtures/xo).
export function fixtureShape(names: readonly string[]): ShapeNode {
  return inferShape(names.map((name) => fixture(name)));
}

export function compareToFixtures(actual: unknown, names: readonly string[], options: DiffOptions = {}): ShapeDifference[] {
  return diffShapes(fixtureShape(names), inferShape([actual]), options);
}

// ---- recorded live responses against the fixtures ----------------------------------------------------------------------

export interface DirectoryDrift {
  // Fixture names that had a recording in the directory.
  readonly checked: readonly string[];
  // Fixture names with no recording (nothing to compare).
  readonly unrecorded: readonly string[];
  // Recordings whose shape differs from the fixture of the same name.
  readonly drift: readonly { readonly name: string; readonly differences: readonly ShapeDifference[] }[];
  // Files in the directory that match no fixture name.
  readonly unknown: readonly string[];
}

const FIXTURE_DIRECTORY = new URL("../fixtures/xo/", import.meta.url);

export function fixtureNames(): string[] {
  return readdirSync(FIXTURE_DIRECTORY)
    .filter((name) => name.endsWith(".json") && name !== "MANIFEST.json")
    .sort();
}

// `directory` holds responses saved from the real service, each named like the fixture it should match.
// Reads local files only. A recording that is not valid JSON is reported as drift.
export function compareDirectoryToFixtures(directory: string, options: DiffOptions = {}): DirectoryDrift {
  const names = fixtureNames();
  const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
  const checked: string[] = [];
  const drift: { name: string; differences: ShapeDifference[] }[] = [];
  for (const name of names) {
    if (!files.includes(name)) continue;
    checked.push(name);
    let recorded: unknown;
    try {
      recorded = JSON.parse(readFileSync(join(directory, name), "utf8")) as unknown;
    } catch {
      drift.push({ name, differences: [{ path: "$", problem: "kind_changed", expected: "valid JSON", actual: "unparsable" }] });
      continue;
    }
    const differences = compareToFixtures(recorded, [name], options);
    if (differences.length > 0) drift.push({ name, differences });
  }
  return {
    checked,
    unrecorded: names.filter((name) => !files.includes(name)),
    drift,
    unknown: files.filter((name) => !names.includes(name)),
  };
}

// ---- the mock against the fixtures ----------------------------------------------------------------------------------------

export interface ShapeCheck {
  readonly id: string;
  readonly listener: ListenerName;
  // Built after the mock exists, so a path can name a catalogue market.
  readonly request: (mock: MockXo) => string;
  readonly fixtures: readonly string[];
  readonly options?: DiffOptions;
  // Runs before the request (extra state, a switch, a fault).
  readonly setup?: (mock: MockXo) => void | Promise<void>;
  readonly expectStatus?: number;
  // What the check rests on, for the README and the report.
  readonly basis: "recorded" | "synthetic fixture";
}

export const DRIFT_SEEDS: Readonly<Record<string, MarketSpec>> = Object.freeze({
  "drift-empty-book": { seed: "drift-empty-book", title: "Drift check, empty book", kind: "clob", status: "ACTIVE" },
  "drift-traded": { seed: "drift-traded", title: "Drift check, traded", kind: "clob", status: "ACTIVE" },
});

function ensureMarket(mock: MockXo, seed: keyof typeof DRIFT_SEEDS): ReturnType<MockXo["state"]["addMarket"]> {
  const spec = DRIFT_SEEDS[seed] as MarketSpec;
  const existing = mock.state.markets.find((market) => market.seed === spec.seed);
  return existing ?? mock.state.addMarket(spec);
}

const seeded = (mock: MockXo, seed: string) => {
  const market = mock.state.markets.find((entry) => entry.seed === seed);
  if (market === undefined) throw new Error(`catalogue market ${seed} is missing`);
  return market;
};

const DUMMY_ADDRESS = "0xCAFE000000000000000000000000000000000A11";

export const SHAPE_CHECKS: readonly ShapeCheck[] = [
  // ---- orderbook ----
  { id: "orderbook /time", listener: "orderbook", request: () => "/time", fixtures: ["orderbook-time.json"], options: { strictKinds: true }, basis: "recorded" },
  { id: "orderbook /health", listener: "orderbook", request: () => "/health", fixtures: ["orderbook-health.json"], options: { strictKinds: true }, basis: "recorded" },
  { id: "orderbook /version", listener: "orderbook", request: () => "/version", fixtures: ["orderbook-version.json"], options: { strictKinds: true }, basis: "recorded" },
  { id: "orderbook /trading-state", listener: "orderbook", request: () => "/trading-state", fixtures: ["orderbook-trading-state.json"], options: { strictKinds: true }, basis: "recorded" },
  {
    id: "orderbook /tick-size",
    listener: "orderbook",
    request: (mock) => `/tick-size?token_id=${seeded(mock, "clob-active-a").yesTokenId}`,
    fixtures: ["orderbook-tick-size.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /neg-risk",
    listener: "orderbook",
    request: (mock) => `/neg-risk?token_id=${seeded(mock, "clob-active-a").yesTokenId}`,
    fixtures: ["orderbook-neg-risk.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /book two-sided",
    listener: "orderbook",
    request: (mock) => `/book?token_id=${seeded(mock, "clob-active-a").yesTokenId}`,
    fixtures: ["orderbook-book.json", "live-orderbook-book-two-sided.json", "live-orderbook-book-fractional.json", "live-orderbook-book-no-token.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /book empty",
    listener: "orderbook",
    request: (mock) => `/book?token_id=${ensureMarket(mock, "drift-empty-book").yesTokenId}`,
    setup: (mock) => {
      const market = ensureMarket(mock, "drift-empty-book");
      mock.state.setBook(market.yesTokenId, { bids: [], asks: [] });
    },
    fixtures: ["live-orderbook-book-empty.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /markets/{cid}",
    listener: "orderbook",
    request: (mock) => `/markets/${seeded(mock, "clob-active-a").conditionId}`,
    fixtures: ["orderbook-market-by-condition.json", "live-orderbook-market-fee-400.json", "live-orderbook-market-fractional.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /price BUY",
    listener: "orderbook",
    request: (mock) => `/price?side=BUY&token_id=${seeded(mock, "clob-active-a").yesTokenId}`,
    fixtures: ["orderbook-price-buy.json", "live-orderbook-price-buy-two-sided.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /price SELL",
    listener: "orderbook",
    request: (mock) => `/price?side=SELL&token_id=${seeded(mock, "clob-active-a").yesTokenId}`,
    fixtures: ["orderbook-price-sell.json", "live-orderbook-price-sell-two-sided.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /price empty side",
    listener: "orderbook",
    request: (mock) => `/price?side=BUY&token_id=${ensureMarket(mock, "drift-empty-book").yesTokenId}`,
    setup: (mock) => {
      const market = ensureMarket(mock, "drift-empty-book");
      mock.state.setBook(market.yesTokenId, { bids: [], asks: [] });
    },
    fixtures: ["live-orderbook-price-empty-side.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /last-trade-price",
    listener: "orderbook",
    request: (mock) => `/last-trade-price?token_id=${ensureMarket(mock, "drift-traded").yesTokenId}`,
    setup: (mock) => {
      const market = ensureMarket(mock, "drift-traded");
      mock.state.setBook(market.yesTokenId, { lastTrade: { price: "0.394", side: "SELL" } });
    },
    fixtures: ["orderbook-last-trade-price.json", "live-orderbook-last-trade-price.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /fee-rate",
    listener: "orderbook",
    request: (mock) => `/fee-rate?token_id=${seeded(mock, "conviction-active").yesTokenId}`,
    fixtures: ["orderbook-fee-rate.json", "live-orderbook-fee-rate-zero-type4.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /balance-allowance (not registered)",
    listener: "orderbook",
    request: () => `/balance-allowance?address=${DUMMY_ADDRESS}`,
    fixtures: ["orderbook-balance-allowance-dummy-address.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /positions",
    listener: "orderbook",
    request: () => `/positions?address=${DUMMY_ADDRESS}`,
    fixtures: ["orderbook-positions-dummy-address.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook /claimable",
    listener: "orderbook",
    request: () => `/claimable?address=${DUMMY_ADDRESS}`,
    fixtures: ["orderbook-claimable-dummy-address.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook 400 bad token",
    listener: "orderbook",
    request: () => "/book?token_id=abc",
    fixtures: ["orderbook-error-400-bad-token.json"],
    expectStatus: 400,
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook 404 no book",
    listener: "orderbook",
    request: () => "/book?token_id=1",
    fixtures: ["orderbook-error-404-book-unknown-token.json"],
    expectStatus: 404,
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook 404 unknown market",
    listener: "orderbook",
    request: () => `/markets/0x${"00".repeat(32)}`,
    fixtures: ["orderbook-error-404-market-unknown.json"],
    expectStatus: 404,
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "orderbook 401 orders",
    listener: "orderbook",
    request: () => "/orders",
    fixtures: ["orderbook-error-401-orders.json"],
    expectStatus: 401,
    options: { strictKinds: true },
    basis: "recorded",
  },
  // ---- Data API ----
  {
    id: "data /markets active CLOB",
    listener: "dataApi",
    request: () => "/api/markets?marketType=2&statuses=ACTIVE&take=3",
    fixtures: ["data-markets-list.json", "live-data-list-active.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets search",
    listener: "dataApi",
    request: () => "/api/markets?marketType=2&statuses=ACTIVE&search=Mock&take=5",
    fixtures: ["data-markets-search.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets closed CLOB",
    listener: "dataApi",
    request: () => "/api/markets?marketType=2&statuses=CLOSED&take=3",
    fixtures: ["data-markets-closed-resolved.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets paused conviction",
    listener: "dataApi",
    request: () => "/api/markets?marketType=4&statuses=PAUSED&take=3",
    fixtures: ["live-data-list-paused.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets resolved conviction",
    listener: "dataApi",
    request: () => "/api/markets?marketType=4&statuses=RESOLVED&take=3",
    fixtures: ["live-data-list-resolved.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets update required",
    listener: "dataApi",
    request: () => "/api/markets?marketType=2&statuses=UPDATE_REQUIRED&take=3",
    fixtures: ["live-data-list-update-required.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets voided conviction",
    listener: "dataApi",
    request: () => "/api/markets?marketType=4&statuses=VOIDED&take=3",
    fixtures: ["live-data-list-voided.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets voided-closed CLOB",
    listener: "dataApi",
    request: () => "/api/markets?marketType=2&statuses=VOIDED_CLOSED&take=3",
    fixtures: ["live-data-list-voided-closed.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets/contract/{cid} CLOB, 4% taker fee",
    listener: "dataApi",
    request: (mock) => `/api/markets/contract/${seeded(mock, "clob-active-b").conditionId}`,
    fixtures: ["live-data-detail-fee-400.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets/contract/{cid} CLOB, flat 0 bps",
    listener: "dataApi",
    request: (mock) => `/api/markets/contract/${seeded(mock, "clob-active-a").conditionId}`,
    fixtures: ["data-market-by-slug.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets/contract/{cid} Conviction",
    listener: "dataApi",
    request: (mock) => `/api/markets/contract/${seeded(mock, "conviction-active").conditionId}`,
    fixtures: ["data-market-by-contract-conviction.json", "live-data-detail-fractional.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data /markets/slug/{slug}",
    listener: "dataApi",
    request: (mock) => `/api/markets/slug/${seeded(mock, "clob-active-a").slug}`,
    fixtures: ["data-market-by-slug.json"],
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data 404 market",
    listener: "dataApi",
    request: () => "/api/markets/99999999",
    fixtures: ["data-error-404-market.json"],
    expectStatus: 404,
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data 404 portfolio",
    listener: "dataApi",
    request: () => `/api/users/portfolio?user=${DUMMY_ADDRESS}`,
    fixtures: ["data-error-404-user-portfolio.json"],
    expectStatus: 404,
    options: { strictKinds: true },
    basis: "recorded",
  },
  {
    id: "data 400 take over max",
    listener: "dataApi",
    request: () => "/api/markets?take=100",
    fixtures: ["data-error-400-take-over-max.json"],
    expectStatus: 400,
    options: { strictKinds: true },
    basis: "recorded",
  },
];

// Fixtures the mock does not serve (read endpoints not built), each with the reason. The completeness test
// requires every fixture to be either in a check above or in this table.
export const UNSERVED_FIXTURES: Readonly<Record<string, string>> = Object.freeze({
  "orderbook-live-activity.json": "GET /live-activity is not built (no client uses it)",
  "orderbook-last-trades-prices.json": "GET /last-trades-prices is not built (no client uses it)",
  "orderbook-markets.json": "the orderbook's own market list (GET /markets) is not built; the Data API list is",
  "orderbook-midpoint.json": "GET /midpoint is not built (the client derives mid from the book)",
  "orderbook-spread.json": "GET /spread is not built (the client derives it from the book)",
  "orderbook-prices-history.json": "GET /prices-history is not built",
  "data-market-by-contract-pulse.json": "Pulse markets (type 3) are out of scope",
  "data-pulse-markets.json": "Pulse markets (type 3) are out of scope",
  "data-liquidity-rewards-earning-pools.json": "liquidity rewards are out of scope",
  "data-liquidity-rewards-market-config.json": "liquidity rewards are out of scope",
});

export interface ShapeCheckResult {
  readonly id: string;
  readonly status: number;
  readonly differences: readonly ShapeDifference[];
}

// Runs every check against a mock and returns one result per check. A check whose status is not the expected
// one (200 unless it says otherwise) reports that as a difference.
export async function checkMockAgainstFixtures(mock: MockXo, checks: readonly ShapeCheck[] = SHAPE_CHECKS): Promise<ShapeCheckResult[]> {
  const results: ShapeCheckResult[] = [];
  for (const check of checks) {
    await check.setup?.(mock);
    const path = check.request(mock);
    const response = await globalThis.fetch(`${mock.urls[check.listener]}${path}`, { headers: { accept: "application/json" } });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      results.push({ id: check.id, status: response.status, differences: [{ path: "$", problem: "kind_changed", expected: "JSON", actual: "unparsable body" }] });
      continue;
    }
    const differences = compareToFixtures(body, check.fixtures, check.options ?? {});
    const expected = check.expectStatus ?? 200;
    if (response.status !== expected) differences.unshift({ path: "$status", problem: "kind_changed", expected: String(expected), actual: String(response.status) });
    results.push({ id: check.id, status: response.status, differences });
  }
  return results;
}
