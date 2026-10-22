// Open-market discovery for the linker: every open binary market of each allowlisted venue, as a
// feature record (hashes only). All requests go through the recorder's PoliteClient, so the host
// allowlist, per-host budgets, backoff, breaker and the fixed User-Agent apply unchanged. GET only.
//
// Every venue answer is read by that venue's one shared parser (sdk/venues/<venue>), the same code
// the dApp's readers run, so a market's status, group, void policy, category and rules fingerprint
// are what the dApp shows for it:
// XO: the list route carries `rules: {}`, so each market needs one detail read (by contract id),
//   decoded with the strict shared decoders (sdk/venues/xo/api/client.ts) and mapped by marketOf.
//   Detail reads are cached in the state file by rules hash and refreshed after DETAIL_REFRESH_MS,
//   capped per run; markets whose detail is not yet read are carried by their cached features or
//   skipped until the next run (resumable).
// Polymarket: Gamma /markets/keyset pages (parseKeysetPage, parseGammaMarket, normalizeMarket).
// Limitless: /markets/active pages (parseListBody, marketOf).
//
// Rule fields come from the shared builders (sdk/rules.ts xoRuleFields, polymarketRuleFields,
// limitlessRuleFields), and the pinned rules-v2 hash must equal the fingerprint the shared reader puts
// in Market.rules.sha256 (the one the dApp re-checks a leg against and pm_verify_link recomputes); a
// market where they differ is skipped, never pinned. Titles and rule text are used in memory only.

import { NO_CATEGORY, type CategoryVerdict } from "../../sdk/category.js";
import type { Market } from "../../sdk/model.js";
import { limitlessRuleFields, polymarketRuleFields, xoLossyRuleRead, xoRuleFields, type RuleRecord } from "../../sdk/rules.js";
import { marketOf as limitlessMarketOf, parseListBody } from "../../sdk/venues/limitless/index.js";
import { normalizeMarket, parseGammaMarket, parseKeysetPage } from "../../sdk/venues/polymarket/index.js";
import { decodeMarketDetail, decodeMarketPage } from "../../sdk/venues/xo/api/client.js";
import { marketOf as xoMarketOf, statusOf as xoStatusOf, xoRootEventSlug } from "../../sdk/venues/xo/index.js";
import { sha256Hex } from "../links/canonical.js";
import { canonicalizeRecord, hashCanonical } from "../links/hash.js";
import { marketId as marketIdSchema } from "../links/schema.js";
import type { Clock } from "../recorder/clock.js";
import type { PoliteClient } from "../recorder/http.js";
import type { RequestSpec } from "../recorder/types.js";
import { urlOf } from "../recorder/types.js";
import { LINKER_HOSTS, type LinkerVenue } from "./allowlist.js";
import {
  DETAIL_REFRESH_MS,
  LIMITLESS_PAGES,
  LIMITLESS_PAGE_SIZE,
  MAX_DETAIL_REQUESTS_PER_RUN,
  MIN_TIME_TO_CLOSE_MS,
  POLY_PAGES,
  POLY_PAGE_SIZE,
  XO_LIST_PAGES,
  XO_LIST_TAKE,
} from "./constants.js";
import { buildFeatures, featureKey, toUtcStamp, type MarketFeatures } from "./features.js";
import type { StoredMarket } from "./state.js";

export interface DiscoverOptions {
  readonly venues: readonly LinkerVenue[];
  readonly maxDetailRequests: number;
  readonly xoPages: number;
  readonly polyPages: number;
  readonly limitlessPages: number;
}

export const DEFAULT_DISCOVER: DiscoverOptions = {
  venues: ["xo", "polymarket", "limitless"],
  maxDetailRequests: MAX_DETAIL_REQUESTS_PER_RUN,
  xoPages: XO_LIST_PAGES,
  polyPages: POLY_PAGES,
  limitlessPages: LIMITLESS_PAGES,
};

export interface VenueCount {
  listed: number;
  open: number;
  featured: number;
  cached: number;
  skipped: Record<string, number>;
}

export interface DiscoverResult {
  readonly features: readonly StoredMarket[];
  readonly counts: Readonly<Record<LinkerVenue, VenueCount>>;
  readonly requests: number;
  // XO markets still waiting for a detail read (next run continues).
  readonly pendingDetail: number;
  readonly notes: readonly string[];
  // Per venue: whether the listing completed (a failed listing keeps the previous state rows).
  readonly complete: Readonly<Record<LinkerVenue, boolean>>;
}

export interface DiscoverDeps {
  readonly client: PoliteClient;
  readonly clock: Clock;
  readonly cache: ReadonlyMap<string, StoredMarket>;
  readonly options?: Partial<DiscoverOptions>;
  readonly signal?: AbortSignal;
}

const CONDITION = /^0x[0-9a-f]{64}$/;
const LIMITLESS_ORIGIN = `https://${LINKER_HOSTS.limitless}`;

function spec(host: string, path: string, query?: Record<string, string>): RequestSpec {
  return { host, path, ...(query === undefined ? {} : { query }), purpose: "resolve" };
}

export function xoListSpec(page: number): RequestSpec {
  return spec(LINKER_HOSTS.xo, "/api/markets", { marketType: "2", statuses: "ACTIVE", take: String(XO_LIST_TAKE), page: String(page), sortBy: "expiresAt", sortOrder: "ASC" });
}
export function xoDetailSpec(conditionId: string): RequestSpec {
  return spec(LINKER_HOSTS.xo, `/api/markets/contract/${encodeURIComponent(conditionId)}`);
}
export function polyKeysetSpec(cursor: string | null): RequestSpec {
  return spec(LINKER_HOSTS.polymarket, "/markets/keyset", { closed: "false", active: "true", limit: String(POLY_PAGE_SIZE), ...(cursor === null ? {} : { cursor }) });
}
export function limitlessListSpec(page: number): RequestSpec {
  return spec(LINKER_HOSTS.limitless, "/markets/active", { limit: String(LIMITLESS_PAGE_SIZE), page: String(page) });
}

// The request plan for dry-run: listing requests, plus the bounded detail reads.
export function dryRunLines(options: DiscoverOptions): string[] {
  const lines = ["pm-linker dry-run: no network calls; these are the requests a run would make, at most"];
  let n = 0;
  if (options.venues.includes("xo")) {
    for (let p = 1; p <= options.xoPages; p += 1) {
      lines.push(`  GET ${urlOf(xoListSpec(p))}`);
      n += 1;
    }
    lines.push(`  GET https://${LINKER_HOSTS.xo}/api/markets/contract/<conditionId>   (one per open market without a fresh cached rules hash; at most ${options.maxDetailRequests} per run)`);
  }
  if (options.venues.includes("polymarket")) {
    lines.push(`  GET ${urlOf(polyKeysetSpec(null))}   (then with cursor=<next_cursor>, at most ${options.polyPages} pages)`);
    n += options.polyPages;
  }
  if (options.venues.includes("limitless")) {
    for (let p = 1; p <= options.limitlessPages; p += 1) {
      lines.push(`  GET ${urlOf(limitlessListSpec(p))}`);
      n += 1;
    }
  }
  lines.push(`listing requests: at most ${n}; detail requests: at most ${options.venues.includes("xo") ? options.maxDetailRequests : 0}`);
  lines.push("user-agent: insurance-markets-research/0.1; GET only; the recorder's per-host budgets apply");
  lines.push("Kalshi, Quotient and every venue not on the allowlist are never contacted");
  return lines;
}

function count(): VenueCount {
  return { listed: 0, open: 0, featured: 0, cached: 0, skipped: {} };
}

function skip(c: VenueCount, reason: string): void {
  c.skipped[reason] = (c.skipped[reason] ?? 0) + 1;
}

interface Ctx {
  readonly deps: DiscoverDeps;
  readonly options: DiscoverOptions;
  readonly nowMs: number;
  readonly stamp: string;
  requests: number;
  readonly notes: string[];
}

async function getJson(ctx: Ctx, s: RequestSpec): Promise<{ ok: true; json: unknown } | { ok: false; reason: string; status: number | undefined; fatal: boolean }> {
  ctx.requests += 1;
  const r = await ctx.deps.client.get(s);
  if (r.ok) return { ok: true, json: r.json };
  return { ok: false, reason: r.reason, status: r.status, fatal: r.reason === "budget" || r.reason === "breaker_open" || r.reason === "refused_host" };
}

function openEnough(closeUtc: string, nowMs: number): boolean {
  const ms = Date.parse(closeUtc);
  return Number.isFinite(ms) && ms - nowMs >= MIN_TIME_TO_CLOSE_MS;
}

interface Built {
  readonly venue: LinkerVenue;
  readonly marketId: string;
  readonly title: string;
  // The shared rule record (sdk/rules.ts) and the market the shared reader built from the same answer.
  readonly ruleFields: RuleRecord;
  readonly market: Market;
  readonly closeUtc: string;
  readonly groupKey: string | null;
  readonly groupKind: MarketFeatures["groupKind"];
  readonly outcomes: number;
}

// Hash with the rules-v2 recipe and build the feature record; null with a reason when unhashable or when the hash
// is not the fingerprint the shared reader shows for the market.
function featuresOf(b: Built, stamp: string): { ok: true; value: StoredMarket } | { ok: false; reason: string } {
  const canon = canonicalizeRecord(b.venue, b.ruleFields);
  if (!canon.ok) return { ok: false, reason: `rules_${canon.error.toLowerCase()}` };
  const hashes = hashCanonical(canon.value);
  if (hashes.rulesSha256 !== b.market.rules.sha256) return { ok: false, reason: "rules_fingerprint_mismatch" };
  const cat: CategoryVerdict = b.market.category ?? NO_CATEGORY;
  const resolver = b.market.rules.resolver?.toLowerCase() ?? null;
  const f = buildFeatures({
    venue: b.venue,
    marketId: b.marketId,
    title: b.title,
    rulesCanonical: hashes.canonical,
    rulesSha256: hashes.rulesSha256,
    maskedSha256: hashes.maskedSha256,
    closeUtc: b.closeUtc,
    category: cat.category,
    categoryConfidence: cat.confidence,
    voidPolicy: b.market.rules.void,
    resolverId: resolver !== null && validId(resolver) ? resolver : null,
    groupKey: b.groupKey,
    groupKind: b.groupKind,
    outcomes: b.outcomes,
  });
  return { ok: true, value: { ...f, seenAt: stamp, detailAt: stamp } };
}

function validId(id: string): boolean {
  return marketIdSchema.safeParse(id).success;
}

// ---- XO ----

async function discoverXo(ctx: Ctx, out: StoredMarket[], c: VenueCount): Promise<{ complete: boolean; pending: number }> {
  interface Row {
    readonly conditionId: string;
    readonly closeUtc: string;
  }
  const rows: Row[] = [];
  const seen = new Set<string>();
  let complete = false;
  for (let page = 1; page <= ctx.options.xoPages; page += 1) {
    const r = await getJson(ctx, xoListSpec(page));
    if (!r.ok) {
      ctx.notes.push(`xo list page ${page} failed (${r.reason})`);
      break;
    }
    let decoded;
    try {
      decoded = decodeMarketPage(r.json, XO_LIST_TAKE);
    } catch {
      ctx.notes.push(`xo list page ${page} could not be decoded`);
      break;
    }
    c.listed += decoded.markets.length + decoded.skipped.length;
    for (let i = 0; i < decoded.skipped.length; i += 1) skip(c, "list_row_undecodable");
    for (const m of decoded.markets) {
      if (m.kind !== "clob") {
        skip(c, "not_clob");
        continue;
      }
      if (xoStatusOf(m, ctx.nowMs) !== "active") {
        skip(c, "not_open");
        continue;
      }
      const id = m.conditionId.toLowerCase();
      if (!CONDITION.test(id) && !validId(id)) {
        skip(c, "bad_id");
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const close = toUtcStamp(m.expiresAt);
      if (close === null || !openEnough(close, ctx.nowMs)) {
        skip(c, "closes_too_soon");
        continue;
      }
      rows.push({ conditionId: id, closeUtc: close });
    }
    if (!decoded.meta.hasNextPage) {
      complete = true;
      break;
    }
    if (page === ctx.options.xoPages) complete = true;
  }
  c.open = rows.length;
  let detailReads = 0;
  let pending = 0;
  let stop = false;
  for (const row of rows) {
    const key = `xo:${row.conditionId}`;
    const cached = ctx.deps.cache.get(key);
    const fresh = cached !== undefined && ctx.nowMs - Date.parse(cached.detailAt) < DETAIL_REFRESH_MS && cached.closeUtc === row.closeUtc;
    if (fresh) {
      out.push({ ...cached, seenAt: ctx.stamp });
      c.cached += 1;
      continue;
    }
    if (stop || ctx.deps.signal?.aborted === true || detailReads >= ctx.options.maxDetailRequests) {
      pending += 1;
      if (cached !== undefined) {
        out.push({ ...cached, seenAt: ctx.stamp });
        c.cached += 1;
      }
      continue;
    }
    detailReads += 1;
    const r = await getJson(ctx, xoDetailSpec(row.conditionId));
    if (!r.ok) {
      if (r.fatal) stop = true;
      pending += 1;
      skip(c, `detail_${r.reason}`);
      if (cached !== undefined) out.push({ ...cached, seenAt: ctx.stamp });
      continue;
    }
    let detail;
    try {
      detail = decodeMarketDetail(r.json);
    } catch {
      skip(c, "detail_undecodable");
      continue;
    }
    if (detail.conditionId.toLowerCase() !== row.conditionId) {
      skip(c, "detail_id_mismatch");
      continue;
    }
    // Rule fields exactly as every client assembles them for the rules-v2 recipe (sdk/rules.ts).
    const ruleFields = xoRuleFields(detail);
    if (ruleFields === null) {
      skip(c, xoLossyRuleRead(detail) !== null ? "rules_lossy_read" : "rules_missing_field");
      continue;
    }
    const root = xoRootEventSlug(r.json);
    const groupKey = root === null ? null : `xo-evt-${sha256Hex(`xo-root:${root}`).slice(0, 16)}`;
    const built = featuresOf(
      {
        venue: "xo",
        marketId: row.conditionId,
        title: String(detail.title),
        ruleFields,
        market: xoMarketOf(detail, ctx.nowMs, ctx.nowMs).market,
        closeUtc: row.closeUtc,
        groupKey,
        groupKind: groupKey === null ? null : "event",
        outcomes: 2,
      },
      ctx.stamp,
    );
    if (!built.ok) {
      skip(c, built.reason);
      continue;
    }
    out.push(built.value);
    c.featured += 1;
  }
  return { complete, pending };
}

// ---- Polymarket ----

async function discoverPoly(ctx: Ctx, out: StoredMarket[], c: VenueCount): Promise<boolean> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < ctx.options.polyPages; page += 1) {
    const spec = polyKeysetSpec(cursor);
    const r = await getJson(ctx, spec);
    if (!r.ok) {
      ctx.notes.push(`polymarket keyset page ${page + 1} failed (${r.reason})`);
      return false;
    }
    const keyset = parseKeysetPage(r.json);
    if (!keyset.ok) {
      ctx.notes.push(`polymarket keyset page ${page + 1} is not a keyset envelope`);
      return false;
    }
    for (const row of keyset.rows) {
      c.listed += 1;
      // The shared row shape: exactly two outcomes, a condition id, the flags and fields typed.
      const parsed = parseGammaMarket(row);
      if (!parsed.ok) {
        skip(c, "row_refused");
        continue;
      }
      const raw = parsed.value;
      const id = raw.conditionId.toLowerCase();
      if (!CONDITION.test(id) && !validId(id)) {
        skip(c, "bad_id");
        continue;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const normalized = normalizeMarket(raw, { nowMs: ctx.nowMs, transport: "T0", source: urlOf(spec) });
      if (!normalized.ok) {
        skip(c, "market_refused");
        continue;
      }
      const market = normalized.value;
      // Tradable as the shared reader decides it: status active (flags and the UMA history), accepting orders, book on.
      if (!market.tradable.ok) {
        skip(c, "not_open");
        continue;
      }
      const close = toUtcStamp(market.timesUtc.closesAt);
      if (close === null || !openEnough(close, ctx.nowMs)) {
        skip(c, "closes_too_soon");
        continue;
      }
      c.open += 1;
      const ruleFields = polymarketRuleFields(raw);
      if (ruleFields === null) {
        skip(c, "rules_missing_field");
        continue;
      }
      // The shared group key (polymarket:neg_risk:<id>); an event is not a group the linker proposes from.
      const group = market.group?.kind === "neg_risk" ? market.group.key.toLowerCase() : null;
      const built = featuresOf(
        {
          venue: "polymarket",
          marketId: id,
          title: raw.question,
          ruleFields,
          market,
          closeUtc: close,
          groupKey: group,
          groupKind: group === null ? null : "neg_risk",
          outcomes: raw.outcomes.length,
        },
        ctx.stamp,
      );
      if (!built.ok) {
        skip(c, built.reason);
        continue;
      }
      out.push(built.value);
      c.featured += 1;
    }
    if (keyset.next === null || keyset.rows.length === 0) return true;
    cursor = keyset.next;
  }
  return true;
}

// ---- Limitless ----

async function discoverLimitless(ctx: Ctx, out: StoredMarket[], c: VenueCount): Promise<boolean> {
  const seen = new Set<string>();
  for (let page = 1; page <= ctx.options.limitlessPages; page += 1) {
    const r = await getJson(ctx, limitlessListSpec(page));
    if (!r.ok) {
      ctx.notes.push(`limitless active page ${page} failed (${r.reason})`);
      return false;
    }
    const list = parseListBody(r.json, LIMITLESS_ORIGIN, ctx.nowMs, page, LIMITLESS_PAGE_SIZE);
    if (!list.ok) {
      ctx.notes.push(`limitless active page ${page} refused by the shared parser (${list.detail})`);
      return false;
    }
    c.listed += list.value.rows.length + list.value.rejected.length;
    for (const rejected of list.value.rejected) skip(c, rejected.reason);
    for (const row of list.value.rows) {
      const slug = row.slug;
      if (!validId(slug)) {
        skip(c, "bad_id");
        continue;
      }
      if (seen.has(slug)) continue;
      seen.add(slug);
      const market = limitlessMarketOf(row, LIMITLESS_ORIGIN, ctx.nowMs);
      if (market.status !== "active") {
        skip(c, "not_open");
        continue;
      }
      const close = toUtcStamp(market.timesUtc.closesAt);
      if (close === null || !openEnough(close, ctx.nowMs)) {
        skip(c, "closes_too_soon");
        continue;
      }
      c.open += 1;
      const ruleFields = limitlessRuleFields(row);
      if (ruleFields === null) {
        skip(c, "rules_missing_field");
        continue;
      }
      const built = featuresOf(
        { venue: "limitless", marketId: slug, title: row.title, ruleFields, market, closeUtc: close, groupKey: null, groupKind: null, outcomes: 2 },
        ctx.stamp,
      );
      if (!built.ok) {
        skip(c, built.reason);
        continue;
      }
      out.push(built.value);
      c.featured += 1;
    }
    if (!list.value.hasMore) return true;
  }
  return true;
}

export async function discover(deps: DiscoverDeps): Promise<DiscoverResult> {
  const options: DiscoverOptions = { ...DEFAULT_DISCOVER, ...(deps.options ?? {}) };
  const nowMs = deps.clock.nowMs();
  const ctx: Ctx = { deps, options, nowMs, stamp: toUtcStamp(nowMs) ?? "1970-01-01T00:00:00Z", requests: 0, notes: [] };
  const features: StoredMarket[] = [];
  const counts: Record<LinkerVenue, VenueCount> = { xo: count(), polymarket: count(), limitless: count() };
  const complete: Record<LinkerVenue, boolean> = { xo: false, polymarket: false, limitless: false };
  let pendingDetail = 0;
  if (options.venues.includes("xo")) {
    const r = await discoverXo(ctx, features, counts.xo);
    complete.xo = r.complete;
    pendingDetail = r.pending;
  }
  if (options.venues.includes("polymarket")) complete.polymarket = await discoverPoly(ctx, features, counts.polymarket);
  if (options.venues.includes("limitless")) complete.limitless = await discoverLimitless(ctx, features, counts.limitless);
  // One record per market; a later duplicate never replaces an earlier one.
  const byKey = new Map<string, StoredMarket>();
  for (const f of features) if (!byKey.has(featureKey(f))) byKey.set(featureKey(f), f);
  return {
    features: [...byKey.values()].sort((a, b) => (featureKey(a) < featureKey(b) ? -1 : 1)),
    counts,
    requests: ctx.requests,
    pendingDetail,
    notes: ctx.notes,
    complete,
  };
}
