import { MemoryStore, freshnessOf, type TimerApi } from "../cache.js";
import { decFromNumber, parseQty, cmpQty, type Qty } from "../../money/qty.js";
import type { AdapterDeps, Dec, Prov, Untrusted, VenueId } from "../../model.js";
import { untrustedField } from "../../text.js";
import { AdapterFailure, getJson, resolveDeadline } from "../novig/shared.js";
import {
  DEFILLAMA_MAX_BODY_CHARS,
  DEFILLAMA_ORIGIN,
  DEFILLAMA_TTL_MS,
  DEFILLAMA_VOLUME_PATH,
  DEFILLAMA_VOLUME_QUERY,
  KNOWN_PREDICTION_SLUGS,
  PREDICTION_CATEGORY,
  VENUE_BY_SLUG,
} from "./constants.js";
import { envelopeSchema, rowSchema } from "./schemas.js";

// DefiLlama volume and liveness. Not a venue (no markets, no books): a keyless registry read, so it has its own small
// client and not a VenueReadAdapter. One GET, an envelope check, strict row parsing, exact decimals, a one-hour
// memory cache. Nothing is written anywhere.

export type Liveness = "traded_24h" | "traded_7d" | "traded_30d" | "no_volume" | "unknown";

export interface VolumeRow {
  readonly slug: string;
  readonly name: Untrusted<string>;
  // The app's venue id when the slug is a known join, else null.
  readonly venue: VenueId | null;
  readonly chains: readonly Untrusted<string>[];
  // USD volume as adapter-reported by DefiLlama; null is "not reported", never 0.
  readonly volume24h: Dec | null;
  readonly volume7d: Dec | null;
  readonly volume30d: Dec | null;
  // "no_volume" says only that DefiLlama's adapter reported none in the window; it is not a verdict that the venue
  // is dead (some adapters lag), and not a claim that the venue is alive.
  readonly liveness: Liveness;
}

// Provenance of a publisher that is not a venue: the venue is null.
export interface DefiLlamaProv extends Omit<Prov, "venue"> {
  readonly venue: null;
  readonly publisher: "defillama";
}

export interface VolumeReport {
  readonly rows: readonly VolumeRow[];
  // Rows that carried a category other than prediction markets, or no category and an unknown slug.
  readonly filteredOut: number;
  // Prediction rows whose shape did not fit (a figure that is not a number, a negative, an unsafe integer).
  readonly rejected: number;
  readonly fetchedAtMs: number;
  readonly prov: DefiLlamaProv;
}

export interface DefiLlamaOptions {
  readonly transport?: "T0" | "T1";
  readonly timers?: TimerApi;
}

export interface DefiLlamaClient {
  predictionVolumes(options?: { readonly fresh?: boolean; readonly deadlineMs?: number }): Promise<VolumeReport>;
  // The row for one app venue, or null when DefiLlama lists none for it.
  livenessOf(venue: VenueId, options?: { readonly fresh?: boolean; readonly deadlineMs?: number }): Promise<VolumeRow | null>;
  clearMemory(): void;
}

const KNOWN = new Set(KNOWN_PREDICTION_SLUGS);

// A non-negative JSON number as an exact decimal; null for "not reported"; undefined for a value that is not usable
// (negative, NaN, unsafe integer, absurd exponent), which rejects the row.
function figureOf(value: unknown): Dec | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || value < 0) return undefined;
  const dec = decFromNumber(value);
  return dec === null ? undefined : dec;
}

function qtyOf(dec: Dec | null): Qty | null {
  return dec === null ? null : parseQty("usd", dec, { maxScale: 18 });
}

function livenessOf(v24: Dec | null, v7: Dec | null, v30: Dec | null): Liveness {
  if (v24 === null && v7 === null && v30 === null) return "unknown";
  const positive = (dec: Dec | null): boolean => {
    const q = qtyOf(dec);
    return q !== null && q.atomic > 0n;
  };
  if (positive(v24)) return "traded_24h";
  if (positive(v7)) return "traded_7d";
  if (positive(v30)) return "traded_30d";
  return "no_volume";
}

// 30 day volume descending (exact), unreported last, then slug, so the order is deterministic.
function compareRows(a: VolumeRow, b: VolumeRow): number {
  const left = qtyOf(a.volume30d);
  const right = qtyOf(b.volume30d);
  if (left !== null && right !== null) {
    const order = cmpQty(right, left);
    if (order !== 0) return order;
  } else if (left !== null) {
    return -1;
  } else if (right !== null) {
    return 1;
  }
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export function createDefiLlamaClient(deps: AdapterDeps, options: DefiLlamaOptions = {}): DefiLlamaClient {
  const transport = options.transport ?? "T0";
  const storeOptions = { nowMs: deps.nowMs, ...(options.timers === undefined ? {} : { timers: options.timers }) };
  // Unknown licence: memory only (sdk/venues/cache.ts canPersist refuses it for market data).
  const store = new MemoryStore<VolumeReport>("defillama", storeOptions);
  let inflight: Promise<VolumeReport> | undefined;

  async function load(deadlineMs: number | undefined): Promise<VolumeReport> {
    const body = await getJson(deps, "defillama", {
      url: `${DEFILLAMA_ORIGIN}${DEFILLAMA_VOLUME_PATH}?${DEFILLAMA_VOLUME_QUERY}`,
      deadlineAtMs: resolveDeadline(deadlineMs, deps.nowMs(), 30_000),
      maxBodyChars: DEFILLAMA_MAX_BODY_CHARS,
    });
    const envelope = envelopeSchema.safeParse(body);
    if (!envelope.success) throw new AdapterFailure("defillama", "SCHEMA_DRIFT", "envelope");
    const rows: VolumeRow[] = [];
    let filteredOut = 0;
    let rejected = 0;
    const seen = new Set<string>();
    for (const raw of envelope.data.protocols) {
      const parsed = rowSchema.safeParse(raw);
      if (!parsed.success) {
        // A row so malformed that it has no usable name or slug cannot be classified; it is counted as filtered.
        filteredOut += 1;
        continue;
      }
      const row = parsed.data;
      // The category decides when it is there; without one, only a slug recorded as a prediction market is accepted.
      const isPrediction = row.category === undefined ? KNOWN.has(row.slug) : row.category === PREDICTION_CATEGORY;
      if (!isPrediction) {
        filteredOut += 1;
        continue;
      }
      const v24 = figureOf(row.total24h);
      const v7 = figureOf(row.total7d);
      const v30 = figureOf(row.total30d);
      if (v24 === undefined || v7 === undefined || v30 === undefined || seen.has(row.slug)) {
        rejected += 1;
        continue;
      }
      seen.add(row.slug);
      rows.push({
        slug: row.slug,
        name: untrustedField("title", row.name, "defillama"),
        venue: Object.hasOwn(VENUE_BY_SLUG, row.slug) ? (VENUE_BY_SLUG[row.slug] as VenueId) : null,
        chains: (row.chains ?? []).slice(0, 20).map((chain) => untrustedField("tag", chain, "defillama")),
        volume24h: v24,
        volume7d: v7,
        volume30d: v30,
        liveness: livenessOf(v24, v7, v30),
      });
    }
    // Rows that were there but none usable is a changed shape (or a changed category), not "no prediction markets".
    if (envelope.data.protocols.length > 0 && rows.length === 0) throw new AdapterFailure("defillama", "SCHEMA_DRIFT", "no_prediction_rows");
    rows.sort(compareRows);
    const now = deps.nowMs();
    return {
      rows,
      filteredOut,
      rejected,
      fetchedAtMs: now,
      prov: {
        venue: null,
        publisher: "defillama",
        source: `${DEFILLAMA_ORIGIN}${DEFILLAMA_VOLUME_PATH}`,
        fetchedAtMs: now,
        transport,
        freshness: freshnessOf(now, DEFILLAMA_TTL_MS, now),
        ttlMs: DEFILLAMA_TTL_MS,
        // No licence is stated: memory only, never exported.
        license: "unknown",
      },
    };
  }

  async function predictionVolumes(opts: { readonly fresh?: boolean; readonly deadlineMs?: number } = {}): Promise<VolumeReport> {
    if (opts.fresh !== true) {
      const cached = store.get("volumes");
      if (cached !== undefined) {
        // Freshness is recomputed against the clock now, so an old report reads as "recent" or "stale", not "live".
        const now = deps.nowMs();
        return { ...cached, prov: { ...cached.prov, freshness: freshnessOf(cached.fetchedAtMs, DEFILLAMA_TTL_MS, now) } };
      }
    }
    // Identical concurrent reads share one request.
    if (inflight === undefined) {
      inflight = load(opts.deadlineMs)
        .then((report) => {
          store.set("volumes", report, DEFILLAMA_TTL_MS);
          return report;
        })
        .finally(() => {
          inflight = undefined;
        });
    }
    return inflight;
  }

  return {
    predictionVolumes,
    livenessOf: async (venue, opts) => (await predictionVolumes(opts)).rows.find((row) => row.venue === venue) ?? null,
    clearMemory: () => store.clear(),
  };
}
