// Reports: the run summary printed by `once`/`run`, and the `report` subcommand over the files
// in --out. Ids, hashes, counts, scores and categories only.

import { buildBlocks } from "../../sdk/linker/block.js";
import { bandOf } from "../../sdk/linker/score.js";
import type { Bundle } from "../links/bundle.js";
import type { Link } from "../links/schema.js";
import type { Registry } from "../links/store.js";
import { LINKER_HANDLE } from "./constants.js";
import type { DiscoverResult } from "./discover.js";
import type { LinkerState, StoredMarket } from "./state.js";

export function scoreOf(link: Pick<Link, "proof">): number | null {
  for (const e of link.proof.evidence) {
    const m = /^s(\d{1,5})\./.exec(e.detail);
    if (e.method === "statistics_hint" && m !== null) return Number(m[1]);
  }
  return null;
}

function tally<T>(items: readonly T[], keyOf: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) m.set(keyOf(i), (m.get(keyOf(i)) ?? 0) + 1);
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

export function marketCountLines(markets: readonly StoredMarket[]): string[] {
  const lines: string[] = [];
  lines.push(`markets with features: ${markets.length}`);
  for (const [venue, n] of tally(markets, (m) => m.venue)) lines.push(`  venue ${venue}: ${n}`);
  for (const [cat, n] of tally(markets, (m) => m.category)) lines.push(`  category ${cat}: ${n}`);
  const blocks = buildBlocks(markets);
  lines.push(`blocks (category|week): ${blocks.length}`);
  for (const b of blocks.slice(0, 40)) lines.push(`  ${b.key}: ${b.markets.length}${b.truncated > 0 ? ` (+${b.truncated} beyond the block cap)` : ""}`);
  if (blocks.length > 40) lines.push(`  ... ${blocks.length - 40} more blocks`);
  return lines;
}

export function candidateLines(links: readonly Link[], limit = 25): string[] {
  const lines: string[] = [];
  const mine = links.filter((l) => l.state === "candidate");
  const ranked = [...mine].sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1) || (a.linkId < b.linkId ? -1 : 1));
  lines.push(`candidates (state candidate): ${mine.length}; by relation: ${tally(mine, (l) => l.relation).map(([k, n]) => `${k}=${n}`).join(", ") || "none"}`);
  for (const l of ranked.slice(0, limit)) {
    const s = scoreOf(l);
    lines.push(`  ${l.linkId} ${l.relation} score=${s === null ? "n/a" : `${s} (${bandOf(s)})`} proposedBy=${l.proposedBy.source}`);
    for (const leg of l.legs) lines.push(`    ${leg.venue}:${leg.marketId} rules=${leg.rulesSha256.slice(0, 16)} masked=${leg.maskedSha256.slice(0, 16)} close=${leg.closeUtc}`);
  }
  if (ranked.length > limit) lines.push(`  ... ${ranked.length - limit} more`);
  return lines;
}

export interface RunReportInput {
  readonly command: string;
  readonly at: string;
  readonly discovery: DiscoverResult;
  readonly pairs: number;
  readonly pairsSkipped: number;
  readonly pairsSiblings: number;
  readonly pairsSameVenue: number;
  readonly scored: { readonly candidates: number; readonly vetoed: number; readonly belowLine: number; readonly invalid: number };
  readonly groups: number;
  readonly proposed: readonly { readonly linkId: string; readonly kind: string }[];
  readonly existing: number;
  readonly refused: readonly { readonly linkId: string; readonly errors: readonly string[] }[];
  readonly capped: number;
  readonly vetoed: readonly { readonly linkId: string; readonly reason: string }[];
  readonly suspended: readonly { readonly linkId: string; readonly reason: string }[];
  readonly registry: Registry;
  readonly bundle: Bundle;
  readonly bundleChanged: boolean;
  readonly registryChanged: boolean;
  readonly markets: readonly StoredMarket[];
}

export function runReportLines(r: RunReportInput): string[] {
  const lines: string[] = [];
  lines.push(`pm-linker ${r.command} at ${r.at}: ${r.discovery.requests} requests, ${r.markets.length} markets with features, ${r.pairs} pairs scored${r.pairsSiblings > 0 ? `, ${r.pairsSiblings} same-group sibling pairs left out` : ""}${r.pairsSameVenue > 0 ? `, ${r.pairsSameVenue} same-venue pairs with different titles left out` : ""}${r.pairsSkipped > 0 ? ` (${r.pairsSkipped} beyond the pair cap)` : ""}`);
  for (const [venue, c] of Object.entries(r.discovery.counts)) {
    const skipped = Object.entries(c.skipped)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, n]) => `${k}=${n}`)
      .join(", ");
    lines.push(`  ${venue}: listed ${c.listed}, open ${c.open}, featured ${c.featured}, from cache ${c.cached}${skipped === "" ? "" : `, skipped ${skipped}`}${r.discovery.complete[venue as keyof typeof r.discovery.complete] ? "" : " (listing incomplete)"}`);
  }
  if (r.discovery.pendingDetail > 0) lines.push(`  xo: ${r.discovery.pendingDetail} markets still need a detail read; the next run continues`);
  for (const n of r.discovery.notes) lines.push(`  note: ${n}`);
  lines.push(...marketCountLines(r.markets));
  lines.push(`pairs above the line: ${r.scored.candidates}; vetoed: ${r.scored.vetoed}; below the line: ${r.scored.belowLine}; not a valid two-leg link: ${r.scored.invalid}; native groups: ${r.groups}`);
  lines.push(`proposed: ${r.proposed.length} (${tally(r.proposed, (p) => p.kind).map(([k, n]) => `${k}=${n}`).join(", ") || "none"}); already in the registry: ${r.existing}; refused by the invariants: ${r.refused.length}; beyond the per-run cap: ${r.capped}`);
  for (const f of r.refused.slice(0, 10)) lines.push(`  refused ${f.linkId}: ${f.errors.slice(0, 2).join("; ")}`);
  lines.push(`vetoed stale candidates: ${r.vetoed.length}; approved links suspended for review: ${r.suspended.length}`);
  for (const v of r.vetoed.slice(0, 10)) lines.push(`  vetoed ${v.linkId}: ${v.reason}`);
  for (const s of r.suspended) lines.push(`  SUSPENDED ${s.linkId}: ${s.reason} (a person must look at this)`);
  const c = r.bundle.manifest.counts;
  lines.push(`registry ${r.registryChanged ? "written" : "unchanged"}; bundle ${r.bundleChanged ? "written" : "unchanged"}: manifest ${r.bundle.manifestSha256} approved=${c.approved} candidate=${c.candidate} suspended=${c.suspended} revoked=${c.revoked}`);
  lines.push(...candidateLines(r.registry.links.filter((l) => l.proposedBy.id === LINKER_HANDLE || l.state === "candidate"), 15));
  lines.push("every candidate is proposed, not approved: only a person can approve a link (tsx pm/links/cli.ts review/approve)");
  return lines;
}

export function stateReportLines(state: LinkerState, registry: Registry | null, bundle: Bundle | null): string[] {
  const lines: string[] = ["pm-linker report"];
  const markets = Object.values(state.markets);
  lines.push(...marketCountLines(markets));
  const last = state.runs[state.runs.length - 1];
  if (last === undefined) lines.push("runs: none recorded");
  else lines.push(`last run: ${last.at} ${last.command} requests=${last.requests} markets=${last.markets} pairs=${last.pairs} proposed=${last.proposed} existing=${last.existing} refused=${last.refused} vetoed=${last.vetoed} suspended=${last.suspended} bundleChanged=${String(last.bundleChanged)}`);
  if (bundle !== null) {
    const c = bundle.manifest.counts;
    lines.push(`bundle: manifest ${bundle.manifestSha256} created ${bundle.manifest.createdAt} approved=${c.approved} candidate=${c.candidate} suspended=${c.suspended} revoked=${c.revoked}`);
    lines.push(...candidateLines(bundle.links));
  } else if (registry !== null) {
    lines.push(...candidateLines(registry.links));
  } else lines.push("no bundle and no registry to report on");
  return lines;
}
