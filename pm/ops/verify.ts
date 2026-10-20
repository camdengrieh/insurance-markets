// pm_verify_link as a pure function over injected leg sources (docs/market-linking-design.md
// section 10.1, aggregation-design 8.3 "Rules: recompute rules.sha256, close time, status per leg
// every call; mismatch suspends the link").
//
// For both (all) legs of a link it re-reads the live market and recomputes: rules hash and masked
// hash (from the venue's raw rule-bearing fields, with the pm/links recipes), status, close time,
// resolver id, void policy, outcome count, tick and fee model. The verdict is `ok` only when every
// pin holds and nothing is unknown; anything missing, mismatched or unreadable gives `suspended`
// with machine-readable reasons. There is no repair path: a verdict never edits the registry. The
// shipped dataset changes only through a human running the approval CLI.
//
// Reasons name fields and codes, never market text. The hashes echoed in the report are 64-hex
// digests. Restricted-terms rule text (Kalshi) is hashed in memory and never returned.

import * as z from "zod/v4";
import { checkFeeSpec } from "../core/fees.js";
import { entityTableSha256, hashRuleRecord, type MaskOptions } from "../links/hash.js";
import { verifyLegPins, type LiveLegState, type PinMismatch } from "../links/pins.js";
import type { Bundle } from "../links/bundle.js";
import type { Link } from "../links/schema.js";
import type { Outcome } from "../links/store.js";
import type { AdapterError, Market, Result, Status, VenueId } from "../types.js";
import {
  failure,
  feeRegistryCheck,
  guarded,
  isoSecond,
  normaliseMarketId,
  tickProblem,
  timeoutOf,
  type GuardedFailure,
  type OpsContext,
  type OpsFailure,
} from "./quote.js";

// ---------------------------------------------------------------------------------------------
// Ports

export interface LiveLeg {
  readonly market: Market;
  // The venue's raw rule-bearing fields (RULE_FIELDS[venue] in pm/links/hash.ts) from the same
  // read, so both hashes can be recomputed. null = the adapter cannot supply them: the hashes are
  // then unknown and the link is suspended.
  readonly ruleRecord: Readonly<Record<string, unknown>> | null;
}

export type LegFetchError = AdapterError | GuardedFailure;

export type LegFetcher = (ref: { readonly venue: VenueId; readonly marketId: string }) => Promise<Result<LiveLeg, LegFetchError>>;

// Builds a LegFetcher from the injected adapters. `ruleRecordOf` extracts the raw rule fields the
// adapter kept for the market; a throw or null means "unavailable".
export function legFetcherFromAdapters(
  ctx: OpsContext,
  ruleRecordOf: (market: Market) => Readonly<Record<string, unknown>> | null,
): LegFetcher {
  return async (ref) => {
    const adapter = ctx.adapter(ref.venue);
    if (adapter === undefined) return { ok: false, error: "NOT_SUPPORTED", detail: "no adapter is enabled for this venue" };
    const got = await guarded(() => adapter.getMarket({ venue: ref.venue, marketId: ref.marketId, native: {} }), timeoutOf(ctx));
    if (!got.ok) return got;
    let ruleRecord: Readonly<Record<string, unknown>> | null = null;
    try {
      ruleRecord = ruleRecordOf(got.value);
    } catch {
      ruleRecord = null;
    }
    return { ok: true, value: { market: got.value, ruleRecord } };
  };
}

// ---------------------------------------------------------------------------------------------
// Input and output

export const verifyInputSchema = z.strictObject({
  link_id: z.string().regex(/^lnk_[0-9a-f]{32}$/, "link_id must look like lnk_ plus 32 hex characters"),
});
export type VerifyInput = z.infer<typeof verifyInputSchema>;

export type ReasonKind = "link_state" | "pin" | "live_data" | "market_state" | "fee" | "tick" | "structure";

export interface VerifyReason {
  readonly kind: ReasonKind;
  readonly code: string;
  // null for link-level reasons.
  readonly legIndex: number | null;
  // True when a retry could clear it (a paused market, an unreadable leg); false for a changed
  // pin or a state only a human can change.
  readonly transient: boolean;
}

export interface LegVerification {
  readonly index: number;
  readonly venue: VenueId;
  readonly marketId: string;
  readonly fetched: boolean;
  readonly status: Status | null;
  readonly tradable: boolean | null;
  readonly closeUtc: { readonly pinned: string; readonly live: string | null; readonly matches: boolean };
  readonly rulesSha256: { readonly pinned: string; readonly live: string | null; readonly matches: boolean };
  readonly maskedSha256: { readonly pinned: string; readonly live: string | null; readonly matches: boolean };
  readonly resolverId: { readonly pinned: string | null; readonly live: string | null; readonly matches: boolean | null };
  readonly voidPolicy: { readonly pinned: string; readonly live: string | null; readonly matches: boolean };
  readonly outcomeCount: { readonly pinned: number; readonly live: number | null; readonly matches: boolean };
  readonly tick: { readonly problem: string | null };
  readonly fee: {
    readonly specId: string | null;
    readonly modelId: string | null;
    readonly usable: boolean;
    readonly registryModelMatches: boolean | null;
    readonly registryStatus: string | null;
  };
}

export interface VerifyReport {
  readonly linkId: string;
  readonly verdict: "ok" | "suspended";
  readonly linkState: Link["state"];
  readonly reasons: readonly VerifyReason[];
  // Non-blocking facts the reader should see next to the verdict.
  readonly warnings: readonly string[];
  readonly legs: readonly LegVerification[];
  readonly checkedAtMs: number;
  readonly scope: string;
}

export type VerifyOutcome = { readonly ok: true; readonly value: VerifyReport } | OpsFailure;

export interface VerifyOptions {
  // Entity alias table behind the masked hash. Used only when the bundle manifest pins one.
  readonly entities?: readonly string[];
  // entityTableSha256 from the bundle manifest. A string requires `entities` with an equal
  // fingerprint; null or undefined means the pins were computed without an entity table.
  readonly manifestEntityTableSha256?: string | null;
}

const SCOPE =
  "The verdict applies to this call only. The shipped link registry changes only when a human runs the approval CLI.";

// ---------------------------------------------------------------------------------------------
// Live state

function lowerHex(id: string): string {
  return normaliseMarketId(id);
}

function liveClose(market: Market): string | null {
  const text = market.timesUtc.closesAt;
  if (text === undefined) return null;
  const ms = Date.parse(text);
  // A sub-second part is kept (and therefore mismatches the second-resolution pin): fail closed.
  return isoSecond(ms);
}

interface LegWork {
  readonly live: LiveLeg | undefined;
  readonly fetchError: LegFetchError | undefined;
}

export interface VerifyDetailed {
  readonly report: VerifyReport;
  // The live reads, index-aligned with link.legs, for callers that go on to price the legs.
  readonly live: readonly (LiveLeg | undefined)[];
}

function reasonOf(m: PinMismatch): VerifyReason {
  const legIndex = m.legIndex < 0 ? null : m.legIndex;
  if (m.field === "status") return { kind: "market_state", code: `status_${m.code}`, legIndex, transient: true };
  if (m.field === "live_state" || m.code === "missing") {
    return { kind: "live_data", code: `${m.field}_${m.code}`, legIndex, transient: true };
  }
  return { kind: "pin", code: `${m.field}_${m.code}`, legIndex, transient: false };
}

export async function verifyLinkDetailed(
  link: Link,
  ctx: OpsContext,
  fetchLeg: LegFetcher,
  options: VerifyOptions = {},
): Promise<VerifyDetailed> {
  const reasons: VerifyReason[] = [];
  const warnings: string[] = [];
  const add = (r: VerifyReason): void => {
    reasons.push(r);
  };

  if (link.state !== "approved") add({ kind: "link_state", code: `state_${link.state}`, legIndex: null, transient: false });
  const validUntil = Date.parse(link.validUntil);
  if (!Number.isFinite(validUntil) || ctx.nowMs >= validUntil) {
    add({ kind: "link_state", code: "expired", legIndex: null, transient: false });
  }

  // Entity table: the masked hash is only reproducible with the table the bundle pinned.
  const pinnedTable = options.manifestEntityTableSha256 ?? null;
  let mask: MaskOptions = {};
  let maskUsable = true;
  if (pinnedTable !== null) {
    const entities = options.entities;
    if (entities === undefined || entityTableSha256(entities) !== pinnedTable) {
      maskUsable = false;
      add({ kind: "structure", code: "entity_table_mismatch", legIndex: null, transient: false });
    } else {
      mask = { entities };
    }
  }

  // Fetch every leg; one failed leg never hides the others.
  const timeoutMs = timeoutOf(ctx);
  const work: LegWork[] = await Promise.all(
    link.legs.map(async (leg): Promise<LegWork> => {
      const got = await guarded(() => fetchLeg({ venue: leg.venue, marketId: leg.marketId }), timeoutMs);
      if (!got.ok) return { live: undefined, fetchError: got.error };
      if (!got.value.ok) return { live: undefined, fetchError: got.value.error };
      return { live: got.value.value, fetchError: undefined };
    }),
  );

  const states: (LiveLegState | undefined)[] = [];
  const legReports: LegVerification[] = [];

  link.legs.forEach((leg, index) => {
    const w = work[index];
    const live = w?.live;
    if (live === undefined) {
      states.push(undefined);
      if (w?.fetchError !== undefined) {
        add({ kind: "live_data", code: `leg_fetch_${w.fetchError.toLowerCase()}`, legIndex: index, transient: true });
      }
      legReports.push({
        index,
        venue: leg.venue,
        marketId: leg.marketId,
        fetched: false,
        status: null,
        tradable: null,
        closeUtc: { pinned: leg.closeUtc, live: null, matches: false },
        rulesSha256: { pinned: leg.rulesSha256, live: null, matches: false },
        maskedSha256: { pinned: leg.maskedSha256, live: null, matches: false },
        resolverId: { pinned: leg.resolverId, live: null, matches: leg.resolverId === null ? null : false },
        voidPolicy: { pinned: leg.voidPolicy, live: null, matches: false },
        outcomeCount: { pinned: leg.outcomeMap.length, live: null, matches: false },
        tick: { problem: "tick_unread" },
        fee: { specId: null, modelId: null, usable: false, registryModelMatches: null, registryStatus: null },
      });
      return;
    }

    const market = live.market;
    // The market the adapter returned must be the one the link pins.
    if (market.ref.venue !== leg.venue || lowerHex(market.ref.marketId) !== lowerHex(leg.marketId)) {
      add({ kind: "structure", code: "market_identity_mismatch", legIndex: index, transient: false });
    }

    let rulesLive: string | null = null;
    let maskedLive: string | null = null;
    if (live.ruleRecord !== null) {
      const hashed = hashRuleRecord(leg.venue, live.ruleRecord, mask);
      if (hashed.ok) {
        rulesLive = hashed.value.rulesSha256;
        maskedLive = maskUsable ? hashed.value.maskedSha256 : null;
      }
    }
    const closeLive = liveClose(market);
    const resolverLive = market.rules.resolver === undefined ? null : lowerHex(market.rules.resolver);
    const state: LiveLegState = {
      rulesSha256: rulesLive,
      maskedSha256: maskedLive,
      closeUtc: closeLive,
      resolverId: resolverLive,
      status: market.status,
    };
    states.push(state);

    const voidMatches = market.rules.void === leg.voidPolicy;
    if (!voidMatches) {
      add(
        market.rules.void === "unknown"
          ? { kind: "live_data", code: "voidPolicy_missing", legIndex: index, transient: true }
          : { kind: "pin", code: "voidPolicy_mismatch", legIndex: index, transient: false },
      );
    }
    const countMatches = market.outcomes.length === leg.outcomeMap.length;
    if (!countMatches) add({ kind: "structure", code: "outcome_count_mismatch", legIndex: index, transient: false });
    if (!market.tradable.ok) add({ kind: "market_state", code: "not_tradable", legIndex: index, transient: true });
    if (closeLive !== null && Date.parse(closeLive) <= ctx.nowMs) {
      add({ kind: "market_state", code: "past_close", legIndex: index, transient: false });
    }

    const problem = tickProblem(market.tick);
    if (problem !== null) add({ kind: "tick", code: problem, legIndex: index, transient: false });

    const feeCheck = checkFeeSpec(market.fee, ctx.nowMs);
    if (!feeCheck.ok) {
      add({ kind: "fee", code: `fee_${feeCheck.code.toLowerCase()}`, legIndex: index, transient: feeCheck.code === "SPEC_STALE" });
    }
    const registry = feeRegistryCheck(ctx, leg.venue, market.fee);
    if (registry.modelMatches === false) {
      add({ kind: "fee", code: "fee_model_registry_mismatch", legIndex: index, transient: false });
    }
    for (const flag of registry.flags) {
      if (flag !== "fee_model_registry_mismatch") warnings.push(`leg${index}:${flag}`);
    }

    legReports.push({
      index,
      venue: leg.venue,
      marketId: leg.marketId,
      fetched: true,
      status: market.status,
      tradable: market.tradable.ok,
      closeUtc: { pinned: leg.closeUtc, live: closeLive, matches: closeLive === leg.closeUtc },
      rulesSha256: { pinned: leg.rulesSha256, live: rulesLive, matches: rulesLive === leg.rulesSha256 },
      maskedSha256: { pinned: leg.maskedSha256, live: maskedLive, matches: maskedLive === leg.maskedSha256 },
      resolverId: {
        pinned: leg.resolverId,
        live: resolverLive,
        matches: leg.resolverId === null ? null : resolverLive === leg.resolverId,
      },
      voidPolicy: { pinned: leg.voidPolicy, live: market.rules.void, matches: voidMatches },
      outcomeCount: { pinned: leg.outcomeMap.length, live: market.outcomes.length, matches: countMatches },
      tick: { problem },
      fee: {
        specId: market.fee.id,
        modelId: market.fee.modelId,
        usable: feeCheck.ok && registry.modelMatches !== false,
        registryModelMatches: registry.modelMatches,
        registryStatus: registry.registryStatus,
      },
    });
  });

  const pins = verifyLegPins(link, states);
  if (!pins.ok) for (const m of pins.reasons) add(reasonOf(m));

  if (link.legs.some((l) => l.venue === "xo")) warnings.push("creator_allowlist_not_rechecked");

  // De-duplicate identical reasons (a failed fetch also shows up as missing pins).
  const seen = new Set<string>();
  const unique = reasons.filter((r) => {
    const key = `${r.kind}|${r.code}|${r.legIndex ?? "-"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const report: VerifyReport = {
    linkId: link.linkId,
    verdict: unique.length === 0 ? "ok" : "suspended",
    linkState: link.state,
    reasons: unique,
    warnings: [...new Set(warnings)],
    legs: legReports,
    checkedAtMs: ctx.nowMs,
    scope: SCOPE,
  };
  return { report, live: work.map((w) => w.live) };
}

export async function verifyLink(
  link: Link,
  ctx: OpsContext,
  fetchLeg: LegFetcher,
  options: VerifyOptions = {},
): Promise<VerifyReport> {
  return (await verifyLinkDetailed(link, ctx, fetchLeg, options)).report;
}

// Tool entry point: finds the link in the bundle by id. A missing bundle or link fails closed
// (there is nothing to verify, which is not the same as "ok").
export async function verifyLinkById(
  rawInput: unknown,
  bundle: Outcome<Bundle> | Bundle,
  ctx: OpsContext,
  fetchLeg: LegFetcher,
  options: Omit<VerifyOptions, "manifestEntityTableSha256"> = {},
): Promise<VerifyOutcome> {
  const parsed = verifyInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("BAD_INPUT", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  const resolved: Outcome<Bundle> = "format" in bundle ? { ok: true, value: bundle } : bundle;
  if (!resolved.ok) return failure("DATASET_UNAVAILABLE", "the link dataset failed validation");
  const link = resolved.value.links.find((l) => l.linkId === parsed.data.link_id);
  if (link === undefined) return failure("LINK_NOT_FOUND", "no link with that id in the dataset");
  const report = await verifyLink(link, ctx, fetchLeg, {
    ...options,
    manifestEntityTableSha256: resolved.value.manifest.entityTableSha256,
  });
  return { ok: true, value: report };
}
