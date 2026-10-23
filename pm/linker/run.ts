// One tick of the linker: discover -> features -> retire stale -> block -> score -> propose ->
// registry -> bundle -> state. Pure orchestration over injected clock, client and paths; the
// report lines it returns are the only place Quotient agreement may appear.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBlocks, pairsOf } from "../../sdk/linker/block.js";
import { groupCandidates, scoreCandidates } from "../../sdk/linker/candidates.js";
import { featureKey, toUtcStamp } from "../../sdk/linker/features.js";
import { canonicalJson, canonicalPretty } from "../../sdk/hash.js";
import { buildBundle, serializeBundle, validateBundle, type Bundle } from "../links/bundle.js";
import { nodeFileEnv, readRegistry, writeRegistry } from "../links/registry-file.js";
import type { Registry } from "../links/store.js";
import type { Clock } from "../recorder/clock.js";
import { writeAtomic } from "../recorder/discover.js";
import type { PoliteClient } from "../recorder/http.js";
import type { EnvLike } from "../signals/flag.js";
import type { ParseKind } from "../signals/parse.js";
import { assertPersistable, isLinkerVenue, type LinkerVenue } from "./allowlist.js";
import { proposeAll, retireStale } from "./candidates.js";
import { BUNDLE_FILE, GROUPS_FILE, PIN_FILE, STATE_FILE } from "./constants.js";
import { discover, type DiscoverOptions } from "./discover.js";
import { quotientLines } from "./quotient.js";
import { runReportLines } from "./report.js";
import { readState, writeState, type LinkerState, type RunSummary, type StoredMarket } from "./state.js";

export interface RunDeps {
  readonly command: "once" | "run";
  readonly registryPath: string;
  readonly outDir: string;
  readonly clock: Clock;
  readonly client: PoliteClient;
  readonly venues: readonly LinkerVenue[];
  readonly discover?: Partial<DiscoverOptions>;
  readonly env: EnvLike;
  readonly quotientBody: { readonly text: string; readonly kind: ParseKind } | null;
  readonly signal?: AbortSignal;
  // Tests only: lets SYNTHETIC- market ids form a bundle. Not reachable from the command line.
  readonly allowSynthetic?: boolean;
}

export interface RunResult {
  readonly ok: boolean;
  readonly lines: readonly string[];
  readonly manifestSha256: string | null;
  readonly bundleChanged: boolean;
  readonly proposed: number;
}

function readPreviousBundle(path: string, pinPath: string, allowSynthetic: boolean): Bundle | null {
  if (!existsSync(path) || !existsSync(pinPath)) return null;
  try {
    const r = validateBundle(readFileSync(path, "utf8"), { expectedManifestSha256: readFileSync(pinPath, "utf8").trim(), allowSynthetic });
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

function sameEntries(a: Bundle, b: Bundle): boolean {
  return canonicalJson(a.manifest.entries) === canonicalJson(b.manifest.entries);
}

// Every leg of every link that the linker writes out must be on the allowlist, whatever the
// registry held: the bundle writer is the last gate before disk.
export function assertBundlePersistable(bundle: Bundle): void {
  for (const link of bundle.links) for (const leg of link.legs) assertPersistable(leg.venue);
}

interface GroupsFile {
  readonly format: "pm-linker-structure-groups";
  readonly version: 1;
  readonly groups: readonly { readonly venue: string; readonly key: string; readonly kind: "neg_risk" | "event"; readonly exhaustive: "unknown"; readonly membersComplete: false; readonly memberIds: readonly string[] }[];
}

// Within-venue groups as pm_check_structure inputs minus the books: a caller fetches books and
// fills StructureMember records from these ids. Exhaustive is always unknown here.
export function structureGroups(markets: readonly StoredMarket[]): GroupsFile {
  const byKey = new Map<string, { venue: string; kind: "neg_risk" | "event"; ids: string[] }>();
  for (const m of [...markets].sort((a, b) => (featureKey(a) < featureKey(b) ? -1 : 1))) {
    if (m.groupKey === null || m.groupKind === null) continue;
    const key = `${m.venue}|${m.groupKey}`;
    const g = byKey.get(key);
    if (g === undefined) byKey.set(key, { venue: m.venue, kind: m.groupKind, ids: [m.marketId] });
    else g.ids.push(m.marketId);
  }
  const groups = [...byKey.entries()]
    .filter(([, g]) => g.ids.length >= 2)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, g]) => ({ venue: g.venue, key: key.slice(g.venue.length + 1), kind: g.kind, exhaustive: "unknown" as const, membersComplete: false as const, memberIds: g.ids }));
  for (const g of groups) assertPersistable(g.venue);
  return { format: "pm-linker-structure-groups", version: 1, groups };
}

export async function runOnce(deps: RunDeps): Promise<RunResult> {
  const nowMs = deps.clock.nowMs();
  const at = toUtcStamp(nowMs) ?? "1970-01-01T00:00:00Z";
  const today = at.slice(0, 10);
  const statePath = join(deps.outDir, STATE_FILE);
  const bundlePath = join(deps.outDir, BUNDLE_FILE);
  const pinPath = join(deps.outDir, PIN_FILE);

  const reg = readRegistry(nodeFileEnv, deps.registryPath);
  if (!reg.ok) return { ok: false, lines: [`registry refused: ${reg.errors.join("; ")}`], manifestSha256: null, bundleChanged: false, proposed: 0 };
  const registryBefore: Registry = reg.value;
  const state: LinkerState = readState(statePath);

  // ---- discover ----
  const cache = new Map(Object.entries(state.markets));
  const discovery = await discover({ client: deps.client, clock: deps.clock, cache, options: { ...(deps.discover ?? {}), venues: deps.venues }, ...(deps.signal === undefined ? {} : { signal: deps.signal }) });
  const seen = new Map<string, StoredMarket>();
  for (const f of discovery.features) seen.set(featureKey(f), f);
  // A venue whose listing failed keeps its recent rows (resumable); rows unseen for a week go.
  const kept: Record<string, StoredMarket> = {};
  for (const [key, m] of cache) {
    if (seen.has(key)) continue;
    const venueComplete = isLinkerVenue(m.venue) ? discovery.complete[m.venue] : true;
    const age = nowMs - Date.parse(m.seenAt);
    if (!venueComplete && age < 7 * 86_400_000 && Date.parse(m.closeUtc) > nowMs) kept[key] = m;
  }
  const markets = [...discovery.features, ...Object.values(kept)].sort((a, b) => (featureKey(a) < featureKey(b) ? -1 : 1));

  // ---- retire stale, then propose ----
  const retired = retireStale(registryBefore, seen, nowMs, today);
  const blocks = buildBlocks(markets);
  const { pairs, skipped: pairsSkipped, siblings: pairsSiblings, sameVenue: pairsSameVenue } = pairsOf(blocks);
  const scored = scoreCandidates(pairs);
  const groups = groupCandidates(markets);
  const proposals = proposeAll(
    retired.registry,
    [...scored.candidates.map((c) => ({ input: c.input, linkId: c.linkId, kind: c.input.relation, source: "statistics" as const })), ...groups.map((g) => ({ input: g.input, linkId: g.linkId, kind: g.kind, source: g.source }))],
    today,
  );
  const registryAfter = proposals.registry;
  const registryChanged = canonicalJson(registryAfter) !== canonicalJson(registryBefore);

  // ---- bundle ----
  const built = buildBundle(registryAfter, { createdAt: at, includeCandidates: true });
  if (!built.ok) return { ok: false, lines: [`bundle refused: ${built.errors.join("; ")}`], manifestSha256: null, bundleChanged: false, proposed: 0 };
  if (built.value.manifest.synthetic && deps.allowSynthetic !== true) {
    return { ok: false, lines: ["bundle refused: synthetic market ids cannot be written by the linker"], manifestSha256: null, bundleChanged: false, proposed: 0 };
  }
  assertBundlePersistable(built.value);
  const previous = readPreviousBundle(bundlePath, pinPath, deps.allowSynthetic === true);
  // Same links, same pins: the earlier file (and its createdAt) stands, so a re-run is a no-op.
  const bundle = previous !== null && sameEntries(previous, built.value) ? previous : built.value;
  const bundleChanged = bundle === built.value && (previous === null || previous.manifestSha256 !== built.value.manifestSha256);

  // ---- write (registry first, then bundle, then state) ----
  if (registryChanged) writeRegistry(nodeFileEnv, deps.registryPath, registryAfter);
  if (bundleChanged) {
    writeAtomic(bundlePath, serializeBundle(bundle));
    writeAtomic(pinPath, `${bundle.manifestSha256}\n`);
  }
  const summary: RunSummary = {
    at,
    command: deps.command,
    requests: discovery.requests,
    markets: markets.length,
    pairs: pairs.length,
    proposed: proposals.proposed.length,
    existing: proposals.existing,
    refused: proposals.refused.length,
    vetoed: retired.vetoed.length,
    suspended: retired.suspended.length,
    bundleChanged,
    manifestSha256: bundle.manifestSha256,
  };
  const nextState: LinkerState = { ...state, markets: Object.fromEntries(markets.map((m) => [featureKey(m), m])), runs: [...state.runs, summary] };
  writeState(statePath, nextState);
  writeAtomic(join(deps.outDir, GROUPS_FILE), `${canonicalPretty(structureGroups(markets))}\n`);

  // ---- report (stdout only; the Quotient lines live nowhere else) ----
  const lines = runReportLines({
    command: deps.command,
    at,
    discovery,
    pairs: pairs.length,
    pairsSkipped,
    pairsSiblings,
    pairsSameVenue,
    scored: { candidates: scored.candidates.length, vetoed: scored.vetoed, belowLine: scored.belowLine, invalid: scored.invalid },
    groups: groups.length,
    proposed: proposals.proposed,
    existing: proposals.existing,
    refused: proposals.refused,
    capped: proposals.capped,
    vetoed: retired.vetoed,
    suspended: retired.suspended,
    registry: registryAfter,
    bundle,
    bundleChanged,
    registryChanged,
    markets,
  });
  lines.push(
    ...quotientLines({
      env: deps.env,
      bodyText: deps.quotientBody?.text ?? null,
      kind: deps.quotientBody?.kind ?? "mispriced",
      candidates: registryAfter.links.filter((l) => l.state === "candidate"),
      nowMs,
    }),
  );
  return { ok: true, lines, manifestSha256: bundle.manifestSha256, bundleChanged, proposed: proposals.proposed.length };
}
