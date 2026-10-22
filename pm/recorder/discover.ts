// Target discovery: builds the recorder's targets file from PUBLIC data, so a deployment needs no
// hand-written list. Everything goes through the recorder's own PoliteClient, so the allowlist,
// the per-host budgets, the User-Agent, backoff and the breaker apply exactly as for collection.
// GET only; no credentials; third-party text is never stored (only ids and, for group ids, a
// hash of an upstream slug).
//
// XO (api-mainnet.xo.market): active CLOB markets (marketType=2, ACTIVE) from the Data API list,
//   read with the shared XO decoders (sdk/venues/xo: strict per row; a malformed row is skipped, not
//   trusted).
//   List rows carry no event id, so each market's `rootEventSlug` is read from the by-slug detail
//   route (captured 2026-10-20: the list slug can be stale and 404 on that route; the by-contract
//   route returns the current slug, so a 404 falls back to contract -> slug). Both detail answers are
//   decoded by the same shared decoder (decodeMarketDetail, xoRootEventSlug). Answers are checked
//   against the conditionId and cached beside the targets file, so a market costs at most three
//   lookups once. Markets sharing a rootEventSlug become one same-venue group.
// Polymarket (gamma-api.polymarket.com): active events by 24 h volume. A neg-risk event (event
//   `negRisk` with a `negRiskMarketID`) becomes one group of its tradable markets; every other
//   event contributes a few individual markets. The events list and each nested market are read by
//   the shared Polymarket parser (sdk/venues/polymarket: parseEventsList, parseGammaMarket, statusOf,
//   tradableOf), so a market counts as tradable here exactly when the dApp would call it tradable.
//
// `exhaustive` is ALWAYS "unknown". The registry records exhaustiveFlag "no" for both venues
// (pm/registry/records.ts), XO states mutual exclusivity only in rules prose and its `neg_risk`
// is always false, and Polymarket's negRisk flag says "at most one Yes", not "exactly one". A
// human can edit a group to proven or by_rule; discovery rewrites the file, so such edits belong
// in a reviewed bundle instead.
//
// Caveat that cannot be removed from the data: a shared rootEventSlug means "same event", not
// "mutually exclusive" (a ladder of thresholds also shares one). Reports that treat a group as an
// exclusive set must be read with that in mind.
//
// The set is sized so that the projected requests per hour stay inside each host's budget with
// headroom (collection, retries and discovery itself share the budget) and the projected disk use
// stays inside maxDbBytes over the retention window.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { decodeMarketDetail, decodeMarketPage } from "../../sdk/venues/xo/api/client.js";
import { statusOf as xoStatusOf, xoRootEventSlug } from "../../sdk/venues/xo/index.js";
import { gammaVolume24h, parseEventsList, parseGammaMarket, statusOf as polyStatusOf, tradableOf, type GammaEventRow } from "../../sdk/venues/polymarket/index.js";
import { canonicalJson, sha256Hex } from "../links/canonical.js";
import type { Clock } from "./clock.js";
import type { HostBudget, RecorderConfig } from "./config.js";
import type { PoliteClient } from "./http.js";
import { bookIntervalMs, resolveIntervalMs, sliceFor } from "./plan.js";
import { MARKET_ID, targetKey, targetsFromFile } from "./targets.js";
import { urlOf, type RequestSpec, type Target } from "./types.js";
import { COLLECTORS } from "./venues/index.js";
import { isoToMs, isRecord } from "./venues/common.js";

const XO_DATA = "api-mainnet.xo.market";
const GAMMA = "gamma-api.polymarket.com";
const XO_MAX_TAKE = 50;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/;
const NEG_RISK_ID = /^0x[0-9a-fA-F]{64}$/;
const CONDITION = /^0x[0-9a-fA-F]{64}$/;
export const MAX_GROUP_SIZE = 64; // the targets file schema allows 2 to 64 members

export type DiscoverVenue = "xo" | "polymarket";

export interface DiscoverOptions {
  // Per venue, in targets (a group counts all its members).
  readonly maxShortPerVenue: number;
  readonly maxRegularPerVenue: number;
  readonly xoPages: number;
  readonly polyPages: number;
  readonly polyPageSize: number;
  // Upper bound on by-slug and by-contract requests per run; the rest are finished by later runs.
  readonly maxXoLookupRequests: number;
  readonly maxMarketsPerLooseEvent: number;
  // Share of each host's budget that the steady-state collection may use.
  readonly headroom: number;
  // Share of maxDbBytes that retention days of data may use.
  readonly diskFraction: number;
}

export const DEFAULT_DISCOVER: DiscoverOptions = {
  maxShortPerVenue: 30,
  maxRegularPerVenue: 250,
  xoPages: 10,
  polyPages: 12,
  polyPageSize: 5,
  maxXoLookupRequests: 300,
  maxMarketsPerLooseEvent: 5,
  headroom: 0.6,
  diskFraction: 0.8,
};

// ---------------------------------------------------------------------------------------------
// Sizing

export interface HostProjection {
  readonly host: string;
  readonly perHour: number;
  readonly worstCasePerHour: number;
}

// Same arithmetic as buildDryRun (a test holds them equal): requests per hour per host, now and
// with every target on the short cadence.
export function projectLoad(cfg: RecorderConfig, targets: readonly Target[], nowMs: number): HostProjection[] {
  const rate = new Map<string, { now: number; worst: number }>();
  const per = (ms: number): number => 3_600_000 / ms;
  const bump = (host: string, a: number, b: number): void => {
    const c = rate.get(host) ?? { now: 0, worst: 0 };
    rate.set(host, { now: c.now + a, worst: c.worst + b });
  };
  for (const t of targets) {
    const col = COLLECTORS[t.venue];
    const slice = sliceFor(t.closeHintMs, nowMs, cfg);
    const resolveEvery = resolveIntervalMs(slice, cfg);
    const bookEvery = bookIntervalMs(slice, cfg);
    for (const spec of col.resolvePlan(t.marketId)) bump(spec.host, per(resolveEvery), per(cfg.shortResolveIntervalSec * 1000));
    const book = col.bookTarget(t.marketId);
    bump(book.host, per(bookEvery), per(cfg.shortIntervalSec * 1000));
  }
  return [...rate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([host, r]) => ({ host, perHour: Math.ceil(r.now), worstCasePerHour: Math.ceil(r.worst) }));
}

// Order-of-magnitude disk estimate (RUN.md: about 1.3 KB per snapshot at 20 levels per side).
export function estimateBytesPerDay(cfg: RecorderConfig, targets: readonly Target[], nowMs: number): number {
  const snapshotBytes = 100 + 60 * cfg.depthLevels;
  const stateBytes = 400;
  let total = 0;
  for (const t of targets) {
    const slice = sliceFor(t.closeHintMs, nowMs, cfg);
    total += (86_400_000 / bookIntervalMs(slice, cfg)) * snapshotBytes + (86_400_000 / resolveIntervalMs(slice, cfg)) * stateBytes;
  }
  return Math.ceil(total);
}

function fits(cfg: RecorderConfig, targets: readonly Target[], nowMs: number, opts: DiscoverOptions): boolean {
  for (const p of projectLoad(cfg, targets, nowMs)) {
    const b = cfg.hostBudgets[p.host] as HostBudget;
    if (p.perHour > b.maxPerHour * opts.headroom || p.perHour / 3600 > b.rps * opts.headroom) return false;
    // All-short worst case must still be inside the full budget.
    if (p.worstCasePerHour > b.maxPerHour || p.worstCasePerHour / 3600 > b.rps) return false;
  }
  return estimateBytesPerDay(cfg, targets, nowMs) * cfg.retentionDays <= cfg.maxDbBytes * opts.diskFraction;
}

// ---------------------------------------------------------------------------------------------
// Units: a same-venue group, or one market

interface Unit {
  readonly venue: DiscoverVenue;
  readonly groupId: string | null;
  readonly ids: readonly string[];
  readonly closes: readonly (number | null)[];
  readonly volume: number;
  incumbent: boolean;
}

function earliestClose(u: Unit): number {
  let best = Number.POSITIVE_INFINITY;
  for (const c of u.closes) if (c !== null && c < best) best = c;
  return best;
}

function shortCount(u: Unit, nowMs: number, cfg: RecorderConfig): number {
  return u.closes.filter((c) => sliceFor(c, nowMs, cfg) === "short").length;
}

function toTargets(units: readonly Unit[]): Target[] {
  const out = new Map<string, Target>();
  for (const u of units) {
    u.ids.forEach((id, i) => {
      const key = targetKey(u.venue, id);
      if (!out.has(key)) out.set(key, { key, venue: u.venue, marketId: id, closeHintMs: u.closes[i] ?? null });
    });
  }
  return [...out.values()];
}

// Priority: units with markets closing soon first (they are where short-lived gaps show), then by
// volume; units already in the previous file go first inside each class so a series is not broken
// by a market drifting across a cap.
function rank(units: Unit[], nowMs: number, cfg: RecorderConfig): Unit[] {
  const isShort = (u: Unit): number => (shortCount(u, nowMs, cfg) > 0 ? 0 : 1);
  return units.sort((a, b) => {
    const s = isShort(a) - isShort(b);
    if (s !== 0) return s;
    const i = Number(b.incumbent) - Number(a.incumbent);
    if (i !== 0) return i;
    if (isShort(a) === 0) {
      const c = earliestClose(a) - earliestClose(b);
      if (c !== 0 && Number.isFinite(c)) return c;
    }
    const v = b.volume - a.volume;
    if (v !== 0) return v;
    return (a.ids[0] ?? "") < (b.ids[0] ?? "") ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------------------------
// Files

export interface TargetsFileJson {
  readonly format: "pm-recorder-targets";
  readonly version: 1;
  readonly groups: readonly { readonly groupId: string; readonly venue: DiscoverVenue; readonly exhaustive: "unknown"; readonly marketIds: readonly string[] }[];
  readonly markets: readonly { readonly venue: DiscoverVenue; readonly marketId: string }[];
}

function buildFile(units: readonly Unit[]): TargetsFileJson {
  const groups = units
    .filter((u) => u.groupId !== null)
    .map((u) => ({ groupId: u.groupId as string, venue: u.venue, exhaustive: "unknown" as const, marketIds: [...new Set(u.ids)].sort() }))
    .sort((a, b) => (a.groupId < b.groupId ? -1 : 1));
  const inGroup = new Set(groups.flatMap((g) => g.marketIds.map((id) => targetKey(g.venue, id))));
  const markets = units
    .filter((u) => u.groupId === null)
    .flatMap((u) => u.ids.map((id) => ({ venue: u.venue, marketId: id })))
    .filter((m) => !inGroup.has(targetKey(m.venue, m.marketId)))
    .sort((a, b) => (targetKey(a.venue, a.marketId) < targetKey(b.venue, b.marketId) ? -1 : 1));
  const seen = new Set<string>();
  const unique = markets.filter((m) => (seen.has(targetKey(m.venue, m.marketId)) ? false : (seen.add(targetKey(m.venue, m.marketId)), true)));
  return { format: "pm-recorder-targets", version: 1, groups, markets: unique };
}

export function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* nothing to clean */
    }
    throw error;
  }
}

export function cachePathFor(targetsPath: string): string {
  return `${targetsPath}.discover-cache.json`;
}

interface CacheFile {
  readonly format: "pm-recorder-discover-cache";
  readonly version: 1;
  // conditionId -> group key (hash of the upstream rootEventSlug) or null for a standalone market.
  readonly xoRoots: Record<string, string | null>;
}

function readCache(path: string): Map<string, string | null> {
  try {
    const j = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(j) || j["format"] !== "pm-recorder-discover-cache" || !isRecord(j["xoRoots"])) return new Map();
    const out = new Map<string, string | null>();
    for (const [k, v] of Object.entries(j["xoRoots"])) {
      if (CONDITION.test(k) && (v === null || (typeof v === "string" && /^[0-9a-f]{16}$/.test(v)))) out.set(k, v);
    }
    return out;
  } catch {
    return new Map();
  }
}

function readPrevious(path: string): { text: string; units: Unit[] } | null {
  try {
    const text = readFileSync(path, "utf8");
    const r = targetsFromFile(text);
    if (!r.ok) return null;
    const units: Unit[] = [];
    const inGroup = new Set<string>();
    for (const g of r.value.groups) {
      const ids = g.members.map((m) => m.slice(g.venue.length + 1));
      for (const m of g.members) inGroup.add(m);
      units.push({ venue: g.venue as DiscoverVenue, groupId: g.groupId, ids, closes: ids.map(() => null), volume: 0, incumbent: true });
    }
    for (const t of r.value.targets) {
      if (!inGroup.has(t.key) && (t.venue === "xo" || t.venue === "polymarket")) {
        units.push({ venue: t.venue, groupId: null, ids: [t.marketId], closes: [null], volume: 0, incumbent: true });
      }
    }
    return { text, units };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Request plan (also used by --dry)

export function listRequests(opts: DiscoverOptions, venues: readonly string[]): RequestSpec[] {
  const out: RequestSpec[] = [];
  if (venues.includes("xo")) for (let p = 1; p <= opts.xoPages; p += 1) out.push(xoListSpec(p));
  if (venues.includes("polymarket")) for (let p = 0; p < opts.polyPages; p += 1) out.push(polyEventsSpec(p, opts.polyPageSize));
  return out;
}

function xoListSpec(page: number): RequestSpec {
  return {
    host: XO_DATA,
    path: "/api/markets",
    query: { marketType: "2", statuses: "ACTIVE", take: String(XO_MAX_TAKE), page: String(page), sortBy: "expiresAt", sortOrder: "ASC" },
    purpose: "resolve",
  };
}

function polyEventsSpec(page: number, size: number): RequestSpec {
  return {
    host: GAMMA,
    path: "/events",
    query: { active: "true", closed: "false", limit: String(size), offset: String(page * size), order: "volume24hr", ascending: "false" },
    purpose: "resolve",
  };
}

export function dryDiscoverLines(cfg: RecorderConfig, opts: DiscoverOptions): string[] {
  const venues = cfg.venues.filter((v) => v === "xo" || v === "polymarket");
  const reqs = listRequests(opts, venues);
  const lines = ["pm-recorder discover (dry): no network calls; these are the requests it would make, at most"];
  for (const r of reqs) lines.push(`  GET ${urlOf(r)}`);
  const lookups = venues.includes("xo") ? opts.maxXoLookupRequests : 0;
  if (venues.includes("xo")) {
    lines.push(`  GET https://${XO_DATA}/api/markets/slug/<slug of each active market not yet cached>   (rootEventSlug; one request, or three after a 404)`);
    lines.push(`  GET https://${XO_DATA}/api/markets/contract/<conditionId>   (only after a 404 on the slug route)`);
  }
  lines.push(`listing requests: ${reqs.length}; lookup requests: at most ${lookups} per run (cached afterwards); total at most ${reqs.length + lookups}`);
  lines.push(`user-agent: insurance-markets-research/0.1; GET only; same per-host budgets as collection`);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Discovery

export interface DiscoverDeps {
  readonly config: RecorderConfig;
  readonly client: PoliteClient;
  readonly clock: Clock;
  readonly outPath: string;
  readonly options?: Partial<DiscoverOptions>;
  readonly signal?: AbortSignal;
}

export interface DiscoverResult {
  readonly ok: boolean;
  readonly written: boolean;
  readonly requests: number;
  // XO markets whose group could not be looked up yet (retry sooner).
  readonly pendingLookups: number;
  readonly counts: { readonly groups: number; readonly markets: number; readonly targets: number; readonly xo: number; readonly polymarket: number; readonly short: number };
  readonly load: readonly HostProjection[];
  readonly bytesPerDay: number;
  readonly lines: readonly string[];
}

interface Counter {
  requests: number;
}

async function getJson(deps: DiscoverDeps, spec: RequestSpec, counter: Counter): Promise<{ ok: true; json: unknown } | { ok: false; status: number | undefined; reason: string }> {
  counter.requests += 1;
  const r = await deps.client.get(spec);
  return r.ok ? { ok: true, json: r.json } : { ok: false, status: r.status, reason: r.reason };
}

interface XoRow {
  readonly conditionId: string;
  readonly slug: string;
  readonly closeMs: number | null;
  readonly volume: number;
}

async function fetchXoActive(deps: DiscoverDeps, opts: DiscoverOptions, counter: Counter, notes: string[]): Promise<{ rows: XoRow[]; complete: boolean }> {
  const rows: XoRow[] = [];
  const now = deps.clock.nowMs();
  const seen = new Set<string>();
  for (let page = 1; page <= opts.xoPages; page += 1) {
    const r = await getJson(deps, xoListSpec(page), counter);
    if (!r.ok) {
      notes.push(`xo list page ${page} failed (${r.reason})`);
      return { rows, complete: false };
    }
    let decoded;
    try {
      decoded = decodeMarketPage(r.json, XO_MAX_TAKE);
    } catch {
      notes.push(`xo list page ${page} could not be decoded`);
      return { rows, complete: false };
    }
    if (decoded.skipped.length > 0) notes.push(`xo list page ${page}: ${decoded.skipped.length} rows skipped by the decoder`);
    for (const m of decoded.markets) {
      if (m.kind !== "clob" || xoStatusOf(m, now) !== "active" || !CONDITION.test(m.conditionId) || seen.has(m.conditionId)) continue;
      seen.add(m.conditionId);
      rows.push({
        conditionId: m.conditionId,
        slug: m.slug,
        closeMs: m.expiresAt === null ? null : isoToMs(m.expiresAt),
        volume: m.totalVolumeUsdMicro === null ? 0 : Number(m.totalVolumeUsdMicro) / 1e6,
      });
    }
    if (!decoded.meta.hasNextPage) return { rows, complete: true };
  }
  notes.push(`xo list stopped at ${opts.xoPages} pages`);
  return { rows, complete: true };
}

const rootKey = (root: string): string => sha256Hex(`xo-root:${root}`).slice(0, 16);

// A by-slug or by-contract answer through the shared detail decoder; null when it does not decode.
function decodeDetail(json: unknown): ReturnType<typeof decodeMarketDetail> | null {
  try {
    return decodeMarketDetail(json);
  } catch {
    return null;
  }
}

// One by-slug read, checked against the conditionId it must describe.
async function slugLookup(
  deps: DiscoverDeps,
  slug: string,
  conditionId: string,
  counter: Counter,
): Promise<{ state: "ok"; key: string | null } | { state: "not_found" } | { state: "failed"; fatal: boolean }> {
  const r = await getJson(deps, { host: XO_DATA, path: `/api/markets/slug/${encodeURIComponent(slug)}`, purpose: "resolve" }, counter);
  if (!r.ok) {
    if (r.status === 404) return { state: "not_found" };
    return { state: "failed", fatal: r.reason === "budget" || r.reason === "breaker_open" || r.reason === "refused_host" };
  }
  const detail = decodeDetail(r.json);
  if (detail === null || detail.conditionId.toLowerCase() !== conditionId.toLowerCase()) return { state: "not_found" };
  const root = xoRootEventSlug(r.json);
  return { state: "ok", key: root === null ? null : rootKey(root) };
}

async function resolveRoot(deps: DiscoverDeps, row: XoRow, counter: Counter): Promise<{ state: "ok"; key: string | null } | { state: "pending"; fatal: boolean }> {
  let slugs = SLUG.test(row.slug) ? [row.slug] : [];
  if (slugs.length > 0) {
    const a = await slugLookup(deps, row.slug, row.conditionId, counter);
    if (a.state === "ok") return a;
    if (a.state === "failed") return { state: "pending", fatal: a.fatal };
  }
  // The list slug is stale or unusable: ask the by-contract route for the current one.
  const c = await getJson(deps, { host: XO_DATA, path: `/api/markets/contract/${encodeURIComponent(row.conditionId)}`, purpose: "resolve" }, counter);
  if (!c.ok) {
    if (c.status === 404) return { state: "ok", key: null };
    return { state: "pending", fatal: c.reason === "budget" || c.reason === "breaker_open" || c.reason === "refused_host" };
  }
  const detail = decodeDetail(c.json);
  const current = detail !== null && detail.conditionId.toLowerCase() === row.conditionId.toLowerCase() ? detail.slug : null;
  slugs = current !== null && SLUG.test(current) && current !== row.slug ? [current] : [];
  if (slugs.length === 0) return { state: "ok", key: null };
  const b = await slugLookup(deps, slugs[0] as string, row.conditionId, counter);
  if (b.state === "ok") return b;
  if (b.state === "failed") return { state: "pending", fatal: b.fatal };
  return { state: "ok", key: null };
}

async function xoUnits(
  deps: DiscoverDeps,
  opts: DiscoverOptions,
  cache: Map<string, string | null>,
  counter: Counter,
  notes: string[],
): Promise<{ units: Unit[]; complete: boolean; pending: number }> {
  const { rows, complete } = await fetchXoActive(deps, opts, counter, notes);
  const active = new Set(rows.map((r) => r.conditionId));
  for (const k of [...cache.keys()]) if (!active.has(k)) cache.delete(k);
  const start = counter.requests;
  let stop = false;
  let pending = 0;
  for (const row of rows) {
    if (cache.has(row.conditionId)) continue;
    if (stop || deps.signal?.aborted === true || counter.requests - start >= opts.maxXoLookupRequests) {
      pending += 1;
      continue;
    }
    const r = await resolveRoot(deps, row, counter);
    if (r.state === "ok") cache.set(row.conditionId, r.key);
    else {
      pending += 1;
      if (r.fatal) stop = true;
    }
  }
  const byKey = new Map<string, XoRow[]>();
  const singles: XoRow[] = [];
  for (const row of rows) {
    const key = cache.get(row.conditionId);
    if (typeof key === "string") byKey.set(key, [...(byKey.get(key) ?? []), row]);
    else singles.push(row);
  }
  const units: Unit[] = [];
  const unit = (groupId: string | null, members: readonly XoRow[]): Unit => ({
    venue: "xo",
    groupId,
    ids: members.map((m) => m.conditionId),
    closes: members.map((m) => m.closeMs),
    volume: members.reduce((a, m) => a + m.volume, 0),
    incumbent: false,
  });
  for (const [key, members] of [...byKey].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (members.length >= 2 && members.length <= MAX_GROUP_SIZE) units.push(unit(`xo-evt-${key}`, members));
    else for (const m of members) units.push(unit(null, [m]));
  }
  for (const m of singles) units.push(unit(null, [m]));
  return { units, complete, pending };
}

// ---- Polymarket ----

interface PolyMarket {
  readonly id: string;
  readonly closeMs: number | null;
  readonly volume: number;
  readonly negRiskMarketID: string | null;
}

// One nested market through the shared parser: recordable when the dApp would call it tradable, its version names a
// token ledger, and outcome 0 is not No (the collector follows outcome 0 and refuses a market that lists No first).
function polyMarket(row: unknown, eventEndMs: number | null, nowMs: number): PolyMarket | null {
  const parsed = parseGammaMarket(row);
  if (!parsed.ok) return null;
  const m = parsed.value;
  const id = m.conditionId.toLowerCase();
  if (!MARKET_ID.test(id)) return null;
  if (!tradableOf(m, polyStatusOf(m, nowMs)).ok) return null;
  if (m.version !== "v1" && m.version !== "v2") return null;
  if (m.outcomes[0]?.toLowerCase() === "no" && m.outcomes[1]?.toLowerCase() === "yes") return null;
  const end = isoToMs(m.endDate);
  return { id, closeMs: end ?? eventEndMs, volume: gammaVolume24h(m) ?? 0, negRiskMarketID: m.negRisk === true && typeof m.negRiskMarketID === "string" ? m.negRiskMarketID : null };
}

function negRiskIdOf(e: GammaEventRow): string | null {
  return e.negRisk === true && typeof e.negRiskMarketID === "string" && NEG_RISK_ID.test(e.negRiskMarketID) ? e.negRiskMarketID : null;
}

async function polyUnits(deps: DiscoverDeps, opts: DiscoverOptions, counter: Counter, notes: string[]): Promise<{ units: Unit[]; complete: boolean }> {
  const units: Unit[] = [];
  const loose = new Set<string>();
  let complete = true;
  for (let page = 0; page < opts.polyPages; page += 1) {
    const r = await getJson(deps, polyEventsSpec(page, opts.polyPageSize), counter);
    if (!r.ok) {
      notes.push(`polymarket events page ${page + 1} failed (${r.reason})`);
      complete = false;
      break;
    }
    const list = parseEventsList(r.json);
    if (!list.ok) {
      notes.push(`polymarket events page ${page + 1} is not a list`);
      complete = false;
      break;
    }
    if (list.rejected > 0) notes.push(`polymarket events page ${page + 1}: ${list.rejected} events skipped by the parser`);
    const now = deps.clock.nowMs();
    for (const e of list.events) {
      if (e.active !== true || e.closed === true) continue;
      const eventEnd = isoToMs(e.endDate);
      const eventVolume = typeof e.volume24hr === "number" && Number.isFinite(e.volume24hr) ? e.volume24hr : 0;
      const nrId = negRiskIdOf(e);
      const markets: PolyMarket[] = [];
      for (const m of e.markets) {
        const pm = polyMarket(m, eventEnd, now);
        // In a neg-risk event only markets of that event's own neg-risk id are one exclusive set.
        if (pm === null) continue;
        if (nrId !== null && pm.negRiskMarketID !== nrId) continue;
        markets.push(pm);
      }
      if (nrId !== null && markets.length >= 2) {
        if (markets.length > MAX_GROUP_SIZE) {
          notes.push(`a neg-risk event with ${markets.length} tradable markets exceeds the group limit of ${MAX_GROUP_SIZE} and was skipped`);
          continue;
        }
        units.push({
          venue: "polymarket",
          groupId: `pm-nr-${sha256Hex(`pm-negrisk:${nrId.toLowerCase()}`).slice(0, 16)}`,
          ids: markets.map((m) => m.id),
          closes: markets.map((m) => m.closeMs),
          volume: eventVolume,
          incumbent: false,
        });
        continue;
      }
      const top = [...markets].sort((a, b) => b.volume - a.volume).slice(0, opts.maxMarketsPerLooseEvent);
      for (const m of top) {
        if (loose.has(m.id)) continue;
        loose.add(m.id);
        units.push({ venue: "polymarket", groupId: null, ids: [m.id], closes: [m.closeMs], volume: m.volume, incumbent: false });
      }
    }
    if (list.events.length + list.rejected < opts.polyPageSize) break;
  }
  return { units, complete };
}

// ---------------------------------------------------------------------------------------------

function mergeVenueFromPrevious(fresh: Unit[], previous: Unit[] | undefined, venue: DiscoverVenue, complete: boolean): Unit[] {
  if (complete || previous === undefined) return fresh;
  const kept = previous.filter((u) => u.venue === venue);
  return kept.length > 0 ? kept : fresh;
}

export async function discover(deps: DiscoverDeps): Promise<DiscoverResult> {
  const opts: DiscoverOptions = { ...DEFAULT_DISCOVER, ...(deps.options ?? {}) };
  const cfg = deps.config;
  const now = deps.clock.nowMs();
  const counter: Counter = { requests: 0 };
  const notes: string[] = [];
  const prev = readPrevious(deps.outPath);
  const cachePath = cachePathFor(deps.outPath);
  const cache = readCache(cachePath);
  const venues = cfg.venues.filter((v): v is DiscoverVenue => v === "xo" || v === "polymarket");

  let units: Unit[] = [];
  let pending = 0;
  let anyComplete = false;
  if (venues.includes("xo")) {
    const x = await xoUnits(deps, opts, cache, counter, notes);
    pending = x.pending;
    anyComplete ||= x.complete;
    units.push(...mergeVenueFromPrevious(x.units, prev?.units, "xo", x.complete && x.units.length > 0));
  }
  if (venues.includes("polymarket")) {
    const p = await polyUnits(deps, opts, counter, notes);
    anyComplete ||= p.complete;
    units.push(...mergeVenueFromPrevious(p.units, prev?.units, "polymarket", p.complete && p.units.length > 0));
  }

  // Incumbents: anything that was in the previous file and is still offered.
  const before = new Set(prev?.units.flatMap((u) => u.ids.map((id) => targetKey(u.venue, id))) ?? []);
  for (const u of units) u.incumbent = u.ids.some((id) => before.has(targetKey(u.venue, id)));

  // Fill the per-venue pools, then trim the lowest priority units until budgets and disk fit.
  const chosen = new Map<DiscoverVenue, Unit[]>();
  for (const venue of venues) {
    const ranked = rank(
      units.filter((u) => u.venue === venue),
      now,
      cfg,
    );
    let short = 0;
    let regular = 0;
    const picks: Unit[] = [];
    for (const u of ranked) {
      const s = shortCount(u, now, cfg);
      const r = u.ids.length - s;
      if (short + s > opts.maxShortPerVenue || regular + r > opts.maxRegularPerVenue) continue;
      short += s;
      regular += r;
      picks.push(u);
    }
    chosen.set(venue, picks);
  }
  const order: Unit[] = [];
  const lists = venues.map((v) => [...(chosen.get(v) ?? [])]);
  for (let i = 0; lists.some((l) => l.length > i); i += 1) for (const l of lists) if (l[i] !== undefined) order.push(l[i] as Unit);
  // order is highest priority first, interleaved across venues; trim from the end.
  let keep = order.length;
  const targetsOf = (n: number): Target[] => toTargets(order.slice(0, n));
  while (keep > 0 && (targetsOf(keep).length > cfg.maxTargets || !fits(cfg, targetsOf(keep), now, opts))) keep -= 1;
  const finalUnits = order.slice(0, keep);
  const targets = toTargets(finalUnits);
  const file = buildFile(finalUnits);
  const text = `${JSON.stringify(file, null, 2)}\n`;

  const load = projectLoad(cfg, targets, now);
  const bytesPerDay = estimateBytesPerDay(cfg, targets, now);
  const shortN = targets.filter((t) => sliceFor(t.closeHintMs, now, cfg) === "short").length;
  const counts = {
    groups: file.groups.length,
    markets: file.markets.length,
    targets: targets.length,
    xo: targets.filter((t) => t.venue === "xo").length,
    polymarket: targets.filter((t) => t.venue === "polymarket").length,
    short: shortN,
  };
  const lines: string[] = [];
  lines.push(`discover: ${counts.targets} targets (${counts.xo} xo, ${counts.polymarket} polymarket; ${shortN} closing within ${Math.round(cfg.shortHorizonSec / 3600)} h) in ${counts.groups} groups and ${counts.markets} single markets; ${counter.requests} requests`);
  for (const p of load) {
    const b = cfg.hostBudgets[p.host] as HostBudget;
    lines.push(`  ${p.host}: ${p.perHour}/h now, ${p.worstCasePerHour}/h all-short; budget ${b.maxPerHour}/h (planned at most ${Math.floor(b.maxPerHour * opts.headroom)}/h)`);
  }
  lines.push(`  disk: about ${(bytesPerDay / 1e6).toFixed(1)} MB per day, ${((bytesPerDay * cfg.retentionDays) / 1e6).toFixed(0)} MB over ${cfg.retentionDays} days (cap ${(cfg.maxDbBytes / 1e6).toFixed(0)} MB)`);
  if (pending > 0) lines.push(`  ${pending} xo markets have no group lookup yet; they are recorded singly and retried on the next run`);
  for (const n of notes) lines.push(`  note: ${n}`);

  // Never replace a good file with an empty or invalid one.
  const valid = targetsFromFile(text);
  if (targets.length === 0 || !valid.ok || !anyComplete) {
    lines.push(!valid.ok ? "discover: output failed validation; the previous targets file is kept" : "discover: nothing usable was found; the previous targets file is kept");
    return { ok: false, written: false, requests: counter.requests, pendingLookups: pending, counts, load, bytesPerDay, lines };
  }
  writeAtomic(deps.outPath, text);
  const cacheFile: CacheFile = { format: "pm-recorder-discover-cache", version: 1, xoRoots: Object.fromEntries([...cache].sort(([a], [b]) => (a < b ? -1 : 1))) };
  writeAtomic(cachePath, `${canonicalJson(cacheFile)}\n`);
  lines.push(`discover: wrote ${deps.outPath}`);
  return { ok: true, written: true, requests: counter.requests, pendingLookups: pending, counts, load, bytesPerDay, lines };
}

// Age of the targets file in ms by its modification time (real wall clock), or null when absent.
export function fileAgeMs(path: string): number | null {
  try {
    return existsSync(path) ? Math.max(0, Date.now() - statSync(path).mtimeMs) : null;
  } catch {
    return null;
  }
}
