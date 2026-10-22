// Field-level sources for list rows (docs/sdk-and-api-design.md sections 6 and 7): which of a row's fields came from the
// venue's API, which from the chain and which from an earlier read, and the reason for each field that has no value.
//
// When a venue is blocked or read from the chain only, its rows keep every field the chain can supply (the settlement,
// read from the pinned Conditional Tokens or Polymarket's Protocol V2 modules) and the fields only the venue holds (its
// display prices and volume; its order book, which no list row carries) become null with the stated reason. A value
// kept from an earlier read is labelled "cache" with its age, never shown as live. Pure apart from the injected port.

import { freshnessOf } from "./cache.js";
import { venueStateReason, type VenueReadState } from "./state.js";
import type { ChainResolution, FieldOrigin, FieldSources, MarketSummary, SourcedSummary, VenueId } from "../model.js";
import type { PinGuard, ContractPin } from "../chain/pins.js";
import { pinFailureText } from "../chain/pins.js";
import { readCtfPayouts, readModuleResults, type ResolutionSource } from "../chain/positions.js";
import type { Hex, RpcPort, RpcRequestOptions } from "../chain/rpc.js";
import { polymarketTargets } from "../chain/polymarket/reads.js";
import { limitlessTargets } from "../chain/limitless/reads.js";
import { xoTargets } from "../chain/xo/positions.js";

// ---- the chain a venue settles on ------------------------------------------------------------------------------------------

export type ChainReadVenue = "polymarket" | "limitless" | "xo";

export interface ChainOfVenue {
  readonly chainId: 137 | 8453 | 3223;
  // The read-proxy service of the public RPC the dApp names for that chain (sdk/venues/origins.ts).
  readonly rpcService: "rpc_polygon" | "rpc_base" | "xo_rpc";
  // Fixed words for the field's origin.
  readonly via: string;
}

export const CHAIN_OF_VENUE: Readonly<Record<ChainReadVenue, ChainOfVenue>> = Object.freeze({
  polymarket: { chainId: 137, rpcService: "rpc_polygon", via: "Polygon 137" },
  limitless: { chainId: 8453, rpcService: "rpc_base", via: "Base 8453" },
  xo: { chainId: 3223, rpcService: "xo_rpc", via: "XO chain 3223" },
});

export function isChainReadVenue(venue: VenueId): venue is ChainReadVenue {
  return Object.hasOwn(CHAIN_OF_VENUE, venue);
}

// At most this many rows of one venue have their settlement read in one call.
export const MAX_CHAIN_ROWS = 50;

// ---- one row's sources -----------------------------------------------------------------------------------------------------

// The settlement of one row read from the chain, or why it was not.
export type ChainField = { readonly ok: true; readonly resolution: ChainResolution; readonly asOfMs: number; readonly via: string } | { readonly ok: false; readonly reason: string };

export const CHAIN_NOT_ASKED = "Not read from the chain: the venue's own API answered.";
export const CHAIN_NOT_ON_CHAIN = "This venue does not settle on a chain this app reads.";

export interface SourceOptions {
  readonly state: VenueReadState;
  // The host's display name for the venue, for the stated reason.
  readonly name: string;
  readonly nowMs: number;
  // True when the row is from the read that just succeeded; false when it is kept from an earlier read.
  readonly fresh: boolean;
  // The row's settlement from the chain; null when the chain was not asked.
  readonly chain: ChainField | null;
}

function withheld(state: VenueReadState, name: string, nowMs: number): string | null {
  if (state.kind !== "blocked" && state.kind !== "chain_only") return null;
  return venueStateReason(state, name, nowMs);
}

// The row as it may be shown, with the origin of each field. A venue-only field of a blocked or chain-only venue is
// nulled with the reason; a kept row is "cache" and its provenance never says "live".
export function sourceSummary(summary: MarketSummary, options: SourceOptions): SourcedSummary {
  const asOfMs = summary.prov.fetchedAtMs;
  const base: FieldOrigin = options.fresh ? { source: "venue_api", asOfMs } : { source: "cache", asOfMs };
  const reason = withheld(options.state, options.name, options.nowMs);
  const venueOnly: FieldOrigin = reason === null ? base : { source: null, reason };
  const chain = options.chain;
  const resolution: FieldOrigin = chain === null ? { source: null, reason: CHAIN_NOT_ASKED } : chain.ok ? { source: "chain", asOfMs: chain.asOfMs, via: chain.via } : { source: null, reason: chain.reason };
  const settled = chain !== null && chain.ok && chain.resolution.state === "resolved";
  const status: FieldOrigin = settled ? { source: "chain", asOfMs: chain.asOfMs, via: chain.via } : base;

  const freshness = options.fresh ? summary.prov.freshness : freshnessOf(asOfMs, summary.prov.ttlMs, options.nowMs);
  const shown: MarketSummary = {
    ...summary,
    status: settled ? "resolved" : summary.status,
    outcomes: reason === null ? summary.outcomes : summary.outcomes.map((outcome) => ({ ...outcome, displayPrice: null })),
    volume: reason === null ? summary.volume : { ...summary.volume, amount: null },
    // A kept row is never "live", whatever it was when it was read.
    prov: { ...summary.prov, freshness: !options.fresh && freshness === "live" ? "recent" : freshness },
  };
  const fields: FieldSources = { title: base, outcomes: base, status, closesAt: base, displayPrice: venueOnly, volume: venueOnly, resolution };
  return { summary: shown, fields, resolution: chain !== null && chain.ok ? chain.resolution : null };
}

// ---- settlement from the chain ---------------------------------------------------------------------------------------------

export interface ChainSessionLike {
  readonly port: RpcPort;
  readonly guard: PinGuard;
}

function keyOf(marketId: string): string {
  return marketId.toLowerCase();
}

// The resolution source of each outcome of each row, in outcome order, or why the row cannot be read. XO and Polymarket
// rows name their condition (the market id), checked by deriving the listed token ids from it; Limitless rows are
// looked up in its exchanges' token registries, each answer confirmed by derivation (sdk/chain/limitless).
async function sourcesOf(venue: ChainReadVenue, rows: readonly MarketSummary[], port: RpcPort, options?: RpcRequestOptions): Promise<Map<string, readonly ResolutionSource[] | string>> {
  const out = new Map<string, readonly ResolutionSource[] | string>();
  if (venue === "limitless") {
    const ids = rows.flatMap((row) => row.outcomes.map((outcome) => outcome.tokenId));
    const { targets } = await limitlessTargets(port, ids, options);
    const byId = new Map(targets.map((target) => [target.tokenId.toString(), target.resolution]));
    for (const row of rows) {
      const sources = row.outcomes.map((outcome) => byId.get(outcome.tokenId) ?? null);
      out.set(keyOf(row.ref.marketId), sources.every((source): source is ResolutionSource => source !== null) ? sources : "The chain does not say which condition this market's tokens belong to.");
    }
    return out;
  }
  for (const row of rows) {
    const tokenIds = row.outcomes.map((outcome) => outcome.tokenId);
    const result =
      venue === "xo"
        ? xoTargets({ conditionId: row.ref.marketId, tokenIds })
        : polymarketTargets({
            conditionId: row.ref.marketId,
            ledger: row.ref.native["ledger"] === "protocol_v2" ? "protocol_v2" : "ctf_v1",
            negRisk: row.ref.native["negRisk"] === "true" ? true : row.ref.native["negRisk"] === "false" ? false : null,
            tokenIds,
          });
    if (!result.ok) out.set(keyOf(row.ref.marketId), result.why);
    else {
      const sources = result.targets.map((target) => target.resolution);
      out.set(keyOf(row.ref.marketId), sources.every((source): source is ResolutionSource => source !== null) ? sources : "The chain does not say which condition this market's tokens belong to.");
    }
  }
  return out;
}

function resolutionOf(numerators: readonly bigint[], denominator: bigint): ChainResolution {
  const winners = numerators.flatMap((value, index) => (value === denominator ? [index] : []));
  return { state: "resolved", payouts: numerators.map((value) => value.toString()), denominator: denominator.toString(), winningIndex: winners.length === 1 ? (winners[0] as number) : null };
}

// Reads the settlement of up to MAX_CHAIN_ROWS rows of one venue, keyed by market id (lower case). Every contract is
// checked against its pin first (once per guard); a row whose contract fails, or whose answer is unreadable, gets the
// reason instead. Throws only when the endpoint cannot be asked at all (an RpcError), which the caller states.
export async function readChainResolutions(
  venue: ChainReadVenue,
  rows: readonly MarketSummary[],
  session: ChainSessionLike,
  nowMs: () => number,
  options?: RpcRequestOptions,
): Promise<Map<string, ChainField>> {
  const own = rows.filter((row) => row.ref.venue === venue).slice(0, MAX_CHAIN_ROWS);
  const out = new Map<string, ChainField>();
  if (own.length === 0) return out;
  const via = CHAIN_OF_VENUE[venue].via;
  const sources = await sourcesOf(venue, own, session.port, options);

  const ctf = new Map<string, { pin: ContractPin; conditions: Hex[] }>();
  const modules = new Map<string, { pin: ContractPin; conditions: Hex[] }>();
  for (const entry of sources.values()) {
    if (typeof entry === "string") continue;
    for (const source of entry) {
      const pin = source.kind === "ctf" ? source.ledger : source.module;
      const table = source.kind === "ctf" ? ctf : modules;
      const slot = table.get(pin.address.toLowerCase()) ?? { pin, conditions: [] };
      slot.conditions.push(source.conditionId);
      table.set(pin.address.toLowerCase(), slot);
    }
  }
  const refused = new Map<string, string>();
  const payouts = new Map<string, Awaited<ReturnType<typeof readCtfPayouts>>>();
  for (const [key, { pin, conditions }] of ctf) {
    const check = await session.guard.check(pin, options);
    if (!check.ok) refused.set(key, pinFailureText(check));
    else payouts.set(key, await readCtfPayouts(session.port, pin.address, conditions, options));
  }
  const results = new Map<string, Awaited<ReturnType<typeof readModuleResults>>>();
  for (const [key, { pin, conditions }] of modules) {
    const check = await session.guard.check(pin, options);
    if (!check.ok) refused.set(key, pinFailureText(check));
    else results.set(key, await readModuleResults(session.port, pin.address, conditions, options));
  }
  const asOfMs = nowMs();

  for (const row of own) {
    const key = keyOf(row.ref.marketId);
    const entry = sources.get(key);
    if (entry === undefined) continue;
    if (typeof entry === "string") {
      out.set(key, { ok: false, reason: entry });
      continue;
    }
    const first = entry[0];
    if (first === undefined || entry.some((source) => source.kind !== first.kind || source.conditionId !== first.conditionId) || entry.some((source, index) => source.outcomeIndex !== index)) {
      out.set(key, { ok: false, reason: "The market's outcomes are not the outcomes of one condition in order." });
      continue;
    }
    const pinKey = (first.kind === "ctf" ? first.ledger : first.module).address.toLowerCase();
    const why = refused.get(pinKey);
    if (why !== undefined) {
      out.set(key, { ok: false, reason: why });
      continue;
    }
    if (first.kind === "ctf") {
      const read = payouts.get(pinKey)?.get(first.conditionId);
      if (read === null || read === undefined) out.set(key, { ok: false, reason: "The condition's payout could not be read from Conditional Tokens." });
      else if (read.state === "unresolved") out.set(key, { ok: true, resolution: { state: "unresolved" }, asOfMs, via });
      else if (read.numerators.length !== entry.length) out.set(key, { ok: false, reason: "The condition's outcome count does not match the market's." });
      else out.set(key, { ok: true, resolution: resolutionOf(read.numerators, read.denominator), asOfMs, via });
    } else {
      const read = results.get(pinKey)?.get(first.conditionId);
      if (read === null || read === undefined) out.set(key, { ok: false, reason: "The module's result could not be read." });
      else if (read.length === 0) out.set(key, { ok: true, resolution: { state: "unresolved" }, asOfMs, via });
      else if (read.length !== entry.length || read.reduce((sum, value) => sum + value, 0n) !== first.denominator) out.set(key, { ok: false, reason: "The module's result is not a vector over its denominator." });
      else out.set(key, { ok: true, resolution: resolutionOf(read, first.denominator), asOfMs, via });
    }
  }
  return out;
}
