// pm_compare_market as a pure function over injected adapters, leg sources and the link bundle
// (docs/aggregation-design.md 9.1, 5.0, 5.1, 5.6, 5.7; docs/market-linking-design.md 10.1).
//
// For one market (usually XO, by id or slug as the adapter accepts it) it finds the bundled links,
// re-verifies each (verify.ts), and for a verified two-leg identity, near-identity or complement
// link reads both books and reports: the relation, basis and divergence axes, both books, an
// INDICATIVE discrepancy with its full friction stack, a twin-price reference, and the reasons it
// is not an arbitrage.
//
// What this is NOT, on purpose:
//   - It never reports a guaranteed profit. `executable_arbitrage` is not a value this module can
//     produce (it is off until the D2 promotion rule holds).
//   - A label is never above the link's tier cap. With no gold-set class gate (none is shipped)
//     the cap is `indicative_discrepancy`, so that is what comes out.
//   - A suspended or failed verification withholds the numbers entirely.
//   - A candidate link (not human-approved) is priced for information only and labelled
//     indicative with the reason `link_not_verified`.
//   - Relations other than a two-leg identity, near-identity or complement (ladders, partitions,
//     related) are described but not priced here; use the structure checks for those.
// Every unknown fails closed: a missing book side, an unusable fee model or an unresolved basis
// gives `null` numbers and a reason, never zero.

import * as z from "zod/v4";
import { UNTRUSTED_DATA_NOTICE, type UntrustedContent } from "../../src/guardrails/untrusted.js";
import { levelEdge, repriceOrders, type LevelEdge } from "../../sdk/engine/basket.js";
import { parseBook, type ParsedBook } from "../../sdk/engine/books.js";
import { walkImplication } from "../../sdk/engine/depth.js";
import { DEFAULTS, lockRate } from "../../sdk/engine/edge.js";
import { checkFeeSpec } from "../../sdk/engine/fees.js";
import { feeSpecId } from "../../sdk/engine/fee-specs.js";
import { assignLabel, haircutForBasis, type BasisInfo } from "../../sdk/engine/labels.js";
import {
  ZERO,
  add,
  cmp,
  dec,
  div,
  rat,
  ratFromDec,
  ratToDec,
  ratioOrNull,
  sub,
  type Rational,
  type SDec,
} from "../core/rational.js";
import { walkBook } from "../../sdk/engine/walk.js";
import type { Bundle } from "../links/bundle.js";
import { lookupLinks, type LookupItem } from "../links/lookup.js";
import { UNPRICED_AXES, type DivergenceAxis, type Link, type Tier } from "../links/schema.js";
import type { ClassGates } from "../links/tier.js";
import type { Outcome } from "../links/store.js";
import { VENUE_IDS, isVenueId, type BasisAxis, type Market, type OutcomeRef, type Status, type VenueId } from "../types.js";
import {
  FUTURE_SKEW_MS,
  QUOTE_VALID_MS,
  bookSha256,
  dataTermsOf,
  failure,
  feeRegistryCheck,
  fetchBookForOutcome,
  guarded,
  marketIdText,
  normaliseMarketId,
  showRat,
  sizeText,
  timeoutOf,
  untrustedSlot,
  type DataTerms,
  type OpsContext,
  type OpsFailure,
} from "./quote.js";
import {
  verifyLinkDetailed,
  type LegFetcher,
  type LiveLeg,
  type VerifyReason,
  type VerifyReport,
} from "./verify.js";

// ---------------------------------------------------------------------------------------------
// Parameters (D = starting points from the design, to calibrate; not findings)

export const COMPARE_DEFAULTS = {
  // Links compared per call (about 3 requests per link, design 8.2).
  maxLinks: 3,
  // Basis plus legging reserve per share, 1.0 cent (Example 1).
  reservePerShare: dec("0.01"),
  // Within this window of the earliest close no label above indicative is given (D).
  nearCloseMs: 24 * 60 * 60 * 1000,
  defaultSize: "10",
  levelsShown: 5,
} as const;

// ---------------------------------------------------------------------------------------------
// Input and context

export const compareInputSchema = z.strictObject({
  // Defaults to "xo". The market may be given by id or by the slug the adapter accepts.
  venue: z.enum(VENUE_IDS).optional(),
  market_id: marketIdText,
  // Shares to depth-walk for the sized estimate (default 10).
  size: sizeText.optional(),
  // Also price candidate links (never human-approved; always labelled indicative).
  include_candidates: z.boolean().optional(),
});
export type CompareInput = z.infer<typeof compareInputSchema>;

export interface CompareContext extends OpsContext {
  readonly fetchLeg: LegFetcher;
  readonly dataset: Outcome<Bundle> | Bundle;
  // Class gates from a gold-set evaluation. Absent = nothing may be labelled above indicative.
  readonly gates?: ClassGates;
  readonly entities?: readonly string[];
}

// ---------------------------------------------------------------------------------------------
// Output

export interface BookLevelView {
  readonly price: SDec;
  readonly size: SDec;
}

export interface BookView {
  readonly venue: VenueId;
  readonly marketId: string;
  readonly outcome: { readonly index: number; readonly role: OutcomeRef["role"]; readonly label: UntrustedContent };
  readonly derived: "native" | "complement";
  readonly asOfMs: number;
  readonly ageMs: number;
  readonly bookSha256: string;
  readonly bids: readonly BookLevelView[];
  readonly asks: readonly BookLevelView[];
  readonly feeSpecId: string;
  readonly dataTerms: DataTerms;
}

export interface Stack {
  readonly gross: SDec;
  readonly fees: SDec;
  readonly lock: SDec;
  readonly reserve: SDec;
  // null = the basis is unresolved, so no haircut can be priced and no net is given.
  readonly haircut: SDec | null;
  readonly net: SDec | null;
  readonly feeShareOfGross: string | null;
}

export type DirectionName = "sell_queried_buy_twin" | "buy_queried_sell_twin";

export interface DirectionResult {
  readonly direction: DirectionName;
  readonly sellAt: SDec | null;
  readonly buyAt: SDec | null;
  readonly stack: Stack | null;
  readonly unavailable: string | null;
}

export interface Discrepancy {
  readonly perShare: true;
  readonly queriedMid: SDec | null;
  readonly twinMid: SDec | null;
  // queriedMid - twinMid, before any friction. Mid gaps are not executable.
  readonly midGap: SDec | null;
  readonly directions: readonly DirectionResult[];
  readonly best: DirectionName | null;
  readonly assumptions: {
    readonly holdDays: string;
    readonly hurdleApy: string;
    readonly reservePerShare: string;
    readonly haircutPerShare: string | null;
    readonly disputeTail: "not_modelled";
  };
  readonly sizedByDepth: {
    readonly requestedShares: string;
    readonly shares: SDec;
    // Net for the walked lot after the venues' order-level fee rounding (Kalshi rounds up to the
    // cent, XO and Polymarket round their own way): the figure a fill would actually leave.
    readonly net: SDec;
    // The same lot with the smooth per-share fee the walk uses to decide where to stop.
    readonly netBeforeOrderRounding: SDec;
    readonly capital: SDec;
    readonly stopReason: string;
  } | null;
}

export interface FairValueReference {
  readonly kind: "twin_mid_reference";
  readonly note: string;
  // Probability of the queried outcome implied by each venue's mid (twin mid oriented through
  // the link's outcome map).
  readonly queriedMid: string;
  readonly twinMid: string;
  readonly consensusMid: string;
  readonly quality: "approved_link_pins_verified" | "indicative_candidate";
}

export type CompareLabel = "indicative_discrepancy" | "hedged_discrepancy";

export interface ComparisonItem {
  readonly linkId: string;
  readonly relation: Link["relation"];
  readonly linkState: Link["state"];
  readonly tierCap: Tier;
  readonly tierCapReasons: readonly string[];
  readonly basis: {
    readonly class: Link["basis"]["class"];
    readonly cutoffDeltaMinutes: number | null;
    readonly axes: readonly { readonly axis: DivergenceAxis; readonly severity: string; readonly legA: number; readonly legB: number }[];
  };
  readonly verification: {
    readonly verdict: VerifyReport["verdict"];
    // Reasons other than the link's own state (a candidate always has link_state reasons).
    readonly reasons: readonly VerifyReason[];
    readonly warnings: readonly string[];
  };
  readonly status: "priced" | "withheld" | "not_priced";
  // Why numbers are absent, when they are.
  readonly withheldReasons: readonly string[];
  readonly twin: { readonly venue: VenueId; readonly marketId: string } | null;
  readonly books: { readonly queried: BookView; readonly twin: BookView } | null;
  readonly discrepancy: Discrepancy | null;
  readonly fairValue: FairValueReference | null;
  // Never above tierCap; indicative whenever any gate fails.
  readonly label: CompareLabel;
  readonly whyNotArbitrage: {
    readonly guaranteedProfitClaimed: false;
    readonly executableTierEnabled: false;
    readonly reasonCodes: readonly string[];
    readonly explanation: readonly string[];
  };
}

export interface CompareResult {
  readonly queried: {
    readonly venue: VenueId;
    readonly marketId: string;
    readonly title: UntrustedContent;
    readonly status: Status;
    readonly closesAt: string | null;
  };
  readonly links: {
    readonly considered: number;
    readonly compared: number;
    readonly truncated: boolean;
    readonly withdrawn: readonly { readonly linkId: string; readonly label: string }[];
  };
  readonly comparisons: readonly ComparisonItem[];
  readonly notes: readonly string[];
  readonly readOnly: true;
  readonly guaranteedProfitClaimed: false;
  readonly executableTierEnabled: false;
  readonly untrustedNotice: string;
}

export type CompareOutcome = { readonly ok: true; readonly value: CompareResult } | OpsFailure;

// ---------------------------------------------------------------------------------------------
// Reasons in words (fixed text, no market text)

const EXPLANATIONS: Readonly<Record<string, string>> = {
  executable_tier_disabled: "The executable-arbitrage tier is disabled until the promotion rule is met, so nothing here can be called arbitrage.",
  legs_not_atomic: "The two legs sit on separate venues and cannot be filled atomically; one can move or fail while the other fills.",
  capital_locked_until_resolution: "Capital is locked in both legs until the later resolution, including any dispute delay, which is not modelled.",
  basis_not_identical: "The linked rules are not word-for-word identical; the legs can settle differently, so the pair is a hedge with basis risk, not a lock.",
  fees_take_most_of_gross: "Taker fees take at least half of the gross gap.",
  gross_gap_not_positive: "At the best bid and ask there is no crossing: buying one side and selling the other costs more than it returns before fees.",
  link_not_verified: "The link is not an approved, verified link; a candidate is a guess about how the markets relate.",
  rules_hash_changed: "A live rules hash differs from the pinned one.",
  not_tradable: "At least one market is not active and tradable.",
  near_close: "A market is within 24 hours of its close.",
  dispute_or_proposal_flag: "A market is disputed or has a pending resolution proposal.",
  books_not_native: "At least one book is derived from the other side rather than real resting orders.",
  depth_incomplete: "The book does not hold the requested size on the side needed.",
  fee_model_unverified: "A fee model is unknown, stale, or not backed by the venue registry (for example the XO fee sources conflict).",
  skew_unknown: "The two books carry no comparable timestamps.",
  leg_skew_too_large: "The two books were read too far apart in time.",
  net_edge_unknown: "The net edge cannot be computed (a fee, side or haircut is unknown).",
  net_edge_not_above_tau: "After fees, capital lock, reserve and resolution-risk haircut the net edge is not above the 0.5 cent threshold.",
  basis_unresolved: "The basis has an unpriced axis, so the pair is never labelled hedged.",
  basis_unknown: "The basis class is not usable for pricing.",
  book_stale: "A book is older than 60 seconds or time-stamped in the future.",
  tier_cap: "The link's tier cap (class gate, structure or state) is below hedged.",
  not_binary: "Both markets must be binary to compare one outcome against its twin.",
  outcome_map_unresolvable: "The link's outcome map does not name a twin outcome.",
  outcome_role_mismatch: "The mapped outcomes do not have the roles the relation needs (an identity link pairs Yes with Yes, a complement pairs Yes with No), so the map or the venue's outcome order is wrong.",
  book_crossed: "A book is crossed or locked (best bid at or above best ask), which is a corrupt or mid-update state; nothing is priced from it.",
  depth_net_below_tau: "Only part of the requested size clears the minimum net edge after fees, lock, reserve and order rounding; the rest of the book is unprofitable.",
  depth_walk_failed: "The depth walk could not be priced (a fee model failed).",
  venue_book_stale: "The venue's own timestamp on a book is older than 60 seconds.",
  venue_time_from_future: "The venue's own timestamp on a book is in the future.",
  venue_time_invalid: "The venue's own timestamp on a book is not a usable time.",
  book_unavailable: "A book could not be read.",
  relation_not_priced_here: "This relation is described but not priced by this tool.",
  verification_suspended: "The link failed live verification, so no numbers are given.",
};

function explain(codes: readonly string[]): string[] {
  return codes.map((c) => {
    const base = c.split(":")[0] ?? c;
    return EXPLANATIONS[c] ?? EXPLANATIONS[base] ?? "A gate failed (see the reason code).";
  });
}

// ---------------------------------------------------------------------------------------------
// Basis mapping (links vocabulary to the pm-core haircut vocabulary)

const TIMING_AXES: readonly DivergenceAxis[] = ["timing_cutoff", "window_start", "early_close"];

// Unpriced or fatal axes map to condition_scope, which has no haircut: such a pair is never
// labelled hedged. Timing axes get the timing haircut, the rest the settlement-source haircut.
export function basisInfoOf(link: Pick<Link, "basis">): BasisInfo | undefined {
  if (link.basis.class === "different") return undefined;
  const axes = new Set<BasisAxis>();
  for (const a of link.basis.axes) {
    if (a.severity === "fatal" || UNPRICED_AXES.includes(a.axis)) axes.add("condition_scope");
    else if (TIMING_AXES.includes(a.axis)) axes.add("timing");
    else axes.add("source");
  }
  return { class: link.basis.class, axes: [...axes] };
}

// ---------------------------------------------------------------------------------------------
// Pricing

function view(book: ParsedBook, market: Market, venue: VenueId, outcome: OutcomeRef, hash: string, nowMs: number, ctx: OpsContext): BookView {
  const levels = (ls: ParsedBook["bids"]): BookLevelView[] =>
    ls.slice(0, COMPARE_DEFAULTS.levelsShown).map((l) => ({ price: showRat(l.price), size: showRat(l.size) }));
  return {
    venue,
    marketId: market.ref.marketId,
    outcome: {
      index: outcome.index,
      role: outcome.role,
      label: untrustedSlot(venue, "outcome", outcome.label.value),
    },
    derived: book.derived,
    asOfMs: book.asOfMs,
    ageMs: nowMs - book.asOfMs,
    bookSha256: hash,
    bids: levels(book.bids),
    asks: levels(book.asks),
    feeSpecId: feeSpecId(market.fee),
    dataTerms: dataTermsOf(ctx, venue),
  };
}

function stackOf(edge: LevelEdge, haircut: Rational | null): Stack {
  const share = cmp(edge.gross, ZERO) > 0 ? ratioOrNull(edge.fees, edge.gross) : null;
  return {
    gross: showRat(edge.gross),
    fees: showRat(edge.fees),
    lock: showRat(edge.lock),
    reserve: showRat(edge.reserve),
    haircut: haircut === null ? null : showRat(haircut),
    net: haircut === null ? null : showRat(edge.net),
    feeShareOfGross: share === null ? null : ratToDec(share, 4, "half_up"),
  };
}

interface Priced {
  readonly discrepancy: Discrepancy;
  readonly bestNet: Rational | null;
  // Net per share the label gate sees: the lower of the top-of-book net and the walked lot's net
  // after order rounding. Null when no lot could be priced.
  readonly gateNet: Rational | null;
  readonly bestGross: Rational | null;
  readonly feeShare: Rational | null;
  readonly depthComplete: boolean;
  readonly feesUsable: boolean;
  readonly reasons: readonly string[];
}

interface Side {
  readonly market: Market;
  readonly book: ParsedBook;
}

function priceIdentity(
  q: Side,
  o: Side,
  link: Link,
  size: Rational,
  sizeText_: string,
  ctx: OpsContext,
): Priced {
  const reasons: string[] = [];
  const basis = basisInfoOf(link);
  const haircut = basis === undefined ? null : haircutForBasis(basis);

  // Hold period: now to the latest pinned close (the dispute tail is not modelled).
  const latestClose = Math.max(...link.legs.map((l) => Date.parse(l.closeUtc)));
  const ms = Math.max(0, Math.floor(latestClose - ctx.nowMs));
  const days = div(rat(BigInt(ms), 1n), rat(86_400_000n, 1n));
  const lock = lockRate(DEFAULTS.hurdleApy, days);

  const feesUsable =
    checkFeeSpec(q.market.fee, ctx.nowMs).ok &&
    checkFeeSpec(o.market.fee, ctx.nowMs).ok &&
    feeRegistryCheck(ctx, q.market.ref.venue, q.market.fee).gateOk &&
    feeRegistryCheck(ctx, o.market.ref.venue, o.market.fee).gateOk;

  const bidQ = q.book.bids[0]?.price ?? null;
  const askQ = q.book.asks[0]?.price ?? null;
  const bidO = o.book.bids[0]?.price ?? null;
  const askO = o.book.asks[0]?.price ?? null;
  const midOf = (b: Rational | null, a: Rational | null): Rational | null =>
    b === null || a === null ? null : div(add(b, a), rat(2n, 1n));
  const midQ = midOf(bidQ, askQ);
  const midO = midOf(bidO, askO);

  const params = {
    guaranteedPayoff: ZERO,
    lockRate: lock,
    lockBase: "price" as const,
    reservePerShare: COMPARE_DEFAULTS.reservePerShare,
    haircutPerShare: haircut ?? ZERO,
    nowMs: ctx.nowMs,
  };

  const direction = (
    name: DirectionName,
    sell: { side: Side; price: Rational | null; id: string },
    buy: { side: Side; price: Rational | null; id: string },
  ): { result: DirectionResult; edge: LevelEdge | null } => {
    if (sell.price === null || buy.price === null) {
      return {
        result: { direction: name, sellAt: null, buyAt: null, stack: null, unavailable: "a side of a book is empty" },
        edge: null,
      };
    }
    const edge = levelEdge(
      [
        { id: sell.id, side: "sell", price: sell.price, spec: sell.side.market.fee },
        { id: buy.id, side: "buy", price: buy.price, spec: buy.side.market.fee },
      ],
      params,
    );
    if (!edge.ok) {
      return {
        result: {
          direction: name,
          sellAt: showRat(sell.price),
          buyAt: showRat(buy.price),
          stack: null,
          unavailable: `fee_unusable:${edge.code}`,
        },
        edge: null,
      };
    }
    return {
      result: { direction: name, sellAt: showRat(sell.price), buyAt: showRat(buy.price), stack: stackOf(edge.value, haircut), unavailable: null },
      edge: edge.value,
    };
  };

  const a = direction("sell_queried_buy_twin", { side: q, price: bidQ, id: "queried" }, { side: o, price: askO, id: "twin" });
  const b = direction("buy_queried_sell_twin", { side: o, price: bidO, id: "twin" }, { side: q, price: askQ, id: "queried" });

  const candidates: { name: DirectionName; edge: LevelEdge }[] = [];
  if (a.edge !== null) candidates.push({ name: "sell_queried_buy_twin", edge: a.edge });
  if (b.edge !== null) candidates.push({ name: "buy_queried_sell_twin", edge: b.edge });
  let best: { name: DirectionName; edge: LevelEdge } | null = null;
  for (const c of candidates) {
    const key = haircut === null ? c.edge.gross : c.edge.net;
    const bestKey = best === null ? null : haircut === null ? best.edge.gross : best.edge.net;
    if (best === null || (bestKey !== null && cmp(key, bestKey) > 0)) best = c;
  }

  // Depth: can the stated size be filled on both legs of the best direction, and does the whole
  // lot (not just the top level) still clear tau after order-level fee rounding?
  let depthComplete = false;
  let sized: Discrepancy["sizedByDepth"] = null;
  let gateNet: Rational | null = best === null || haircut === null ? null : best.edge.net;
  if (best !== null) {
    const sellSide = best.name === "sell_queried_buy_twin" ? q : o;
    const buySide = best.name === "sell_queried_buy_twin" ? o : q;
    const sellWalk = walkBook(sellSide.book, "sell", size);
    const buyWalk = walkBook(buySide.book, "buy", size);
    depthComplete = sellWalk.complete && buyWalk.complete;
    if (haircut !== null) {
      const walked = walkImplication(
        { id: "sell", book: sellSide.book, spec: sellSide.market.fee },
        { id: "buy", book: buySide.book, spec: buySide.market.fee },
        { tau: DEFAULTS.tau, lockRate: lock, lockBase: "price", reservePerShare: COMPARE_DEFAULTS.reservePerShare, haircutPerShare: haircut, maxQty: size, nowMs: ctx.nowMs },
      );
      const repriced = walked.ok
        ? repriceOrders(
            [
              { id: "sell", side: "sell", levels: sellSide.book.bids, spec: sellSide.market.fee },
              { id: "buy", side: "buy", levels: buySide.book.asks, spec: buySide.market.fee },
            ],
            walked.value.outcome,
          )
        : null;
      if (walked.ok && repriced !== null && repriced.ok) {
        const t = walked.value.outcome.totals;
        sized = {
          requestedShares: sizeText_,
          shares: showRat(t.qty),
          net: showRat(repriced.value.net),
          netBeforeOrderRounding: showRat(t.net),
          capital: showRat(t.capital),
          stopReason: walked.value.outcome.stopReason,
        };
        if (cmp(t.qty, ZERO) > 0) {
          const perShare = div(repriced.value.net, t.qty);
          gateNet = gateNet === null || cmp(perShare, gateNet) < 0 ? perShare : gateNet;
        } else if (gateNet !== null && cmp(gateNet, DEFAULTS.tau) > 0) {
          // The top level looks good but not one share clears tau once priced as a lot: the net is
          // known to be no better than tau, which is what the gate must see.
          gateNet = DEFAULTS.tau;
        }
        if (cmp(t.qty, size) < 0 && depthComplete && gateNet !== null && cmp(best.edge.net, DEFAULTS.tau) > 0) {
          reasons.push("depth_net_below_tau");
        }
      } else {
        gateNet = null;
        reasons.push("depth_walk_failed");
      }
    }
  } else {
    reasons.push("net_edge_unknown");
  }

  const bestEdge = best?.edge ?? null;
  const gapOk = midQ !== null && midO !== null;
  const discrepancy: Discrepancy = {
    perShare: true,
    queriedMid: midQ === null ? null : showRat(midQ),
    twinMid: midO === null ? null : showRat(midO),
    midGap: gapOk ? showRat(sub(midQ, midO)) : null,
    directions: [a.result, b.result],
    best: best?.name ?? null,
    assumptions: {
      holdDays: ratToDec(days, 4, "half_up"),
      hurdleApy: showRat(DEFAULTS.hurdleApy),
      reservePerShare: showRat(COMPARE_DEFAULTS.reservePerShare),
      haircutPerShare: haircut === null ? null : showRat(haircut),
      disputeTail: "not_modelled",
    },
    sizedByDepth: sized,
  };
  return {
    discrepancy,
    bestNet: bestEdge === null || haircut === null ? null : bestEdge.net,
    gateNet,
    bestGross: bestEdge?.gross ?? null,
    feeShare: bestEdge !== null && cmp(bestEdge.gross, ZERO) > 0 ? ratioOrNull(bestEdge.fees, bestEdge.gross) : null,
    depthComplete,
    feesUsable,
    reasons,
  };
}

// ---------------------------------------------------------------------------------------------
// One link

interface LinkCompareEnv {
  readonly ctx: CompareContext;
  readonly memoFetch: LegFetcher;
  readonly queried: { readonly venue: VenueId; readonly marketId: string };
  readonly size: Rational;
  readonly sizeText: string;
  readonly manifestEntityTableSha256: string | null;
}

function skeleton(link: Link, item: LookupItem, verification: VerifyReport): Omit<ComparisonItem, "status" | "withheldReasons" | "twin" | "books" | "discrepancy" | "fairValue" | "label" | "whyNotArbitrage"> {
  return {
    linkId: link.linkId,
    relation: link.relation,
    linkState: link.state,
    tierCap: item.effectiveTierCap,
    tierCapReasons: item.tierCapReasons,
    basis: {
      class: link.basis.class,
      cutoffDeltaMinutes: link.basis.cutoffDeltaMinutes,
      axes: link.basis.axes.map((x) => ({ axis: x.axis, severity: x.severity, legA: x.legA, legB: x.legB })),
    },
    verification: {
      verdict: verification.verdict,
      reasons: verification.reasons.filter((r) => r.kind !== "link_state"),
      warnings: verification.warnings,
    },
  };
}

function whyNot(codes: readonly string[], cross: boolean, basisIdentical: boolean, feeShare: Rational | null, grossPositive: boolean | null): ComparisonItem["whyNotArbitrage"] {
  const all = [...codes, "executable_tier_disabled", "capital_locked_until_resolution"];
  if (cross) all.push("legs_not_atomic");
  if (!basisIdentical) all.push("basis_not_identical");
  if (feeShare !== null && cmp(feeShare, rat(1n, 2n)) >= 0) all.push("fees_take_most_of_gross");
  if (grossPositive === false) all.push("gross_gap_not_positive");
  const unique = [...new Set(all)];
  return {
    guaranteedProfitClaimed: false,
    executableTierEnabled: false,
    reasonCodes: unique,
    explanation: explain(unique),
  };
}

async function compareLink(link: Link, item: LookupItem, env: LinkCompareEnv): Promise<ComparisonItem> {
  const { ctx } = env;
  const detailed = await verifyLinkDetailed(link, ctx, env.memoFetch, {
    manifestEntityTableSha256: env.manifestEntityTableSha256,
    ...(ctx.entities === undefined ? {} : { entities: ctx.entities }),
  });
  const base = skeleton(link, item, detailed.report);
  const nonStateReasons = detailed.report.reasons.filter((r) => r.kind !== "link_state");
  const cross = new Set(link.legs.map((l) => l.venue)).size > 1;
  const basisIdentical = link.basis.class === "identical" && link.basis.axes.length === 0;
  const withheld = (status: "withheld" | "not_priced", codes: string[]): ComparisonItem => ({
    ...base,
    status,
    withheldReasons: codes,
    twin: null,
    books: null,
    discrepancy: null,
    fairValue: null,
    label: "indicative_discrepancy",
    whyNotArbitrage: whyNot(codes, cross, basisIdentical, null, null),
  });

  if (nonStateReasons.length > 0) return withheld("withheld", ["verification_suspended", ...nonStateReasons.map((r) => `${r.kind}:${r.code}`)]);

  const priceable = (link.relation === "identity" || link.relation === "near_identity" || link.relation === "complement") && link.legs.length === 2;
  if (!priceable) return withheld("not_priced", ["relation_not_priced_here"]);

  const qi = link.legs.findIndex((l) => l.venue === env.queried.venue && normaliseMarketId(l.marketId) === env.queried.marketId);
  const qLeg = link.legs[qi];
  const oLeg = link.legs[1 - qi];
  const qLive: LiveLeg | undefined = detailed.live[qi];
  const oLive: LiveLeg | undefined = detailed.live[1 - qi];
  if (qi < 0 || qLeg === undefined || oLeg === undefined || qLive === undefined || oLive === undefined) {
    return withheld("withheld", ["book_unavailable"]);
  }
  // Compare the queried market's first outcome with the twin outcome the link maps it to.
  const iq = 0;
  const shared = qLeg.outcomeMap[iq];
  const jo = shared === undefined ? -1 : oLeg.outcomeMap.indexOf(shared);
  if (qLive.market.outcomes.length !== 2 || oLive.market.outcomes.length !== 2) return withheld("not_priced", ["not_binary"]);
  if (jo < 0) return withheld("not_priced", ["outcome_map_unresolvable"]);

  // pm reads only its own venues; a live market naming any other has no adapter here.
  const qVenue = isVenueId(qLive.market.ref.venue) ? qLive.market.ref.venue : null;
  const oVenue = isVenueId(oLive.market.ref.venue) ? oLive.market.ref.venue : null;
  const qAdapter = qVenue === null ? undefined : ctx.adapter(qVenue);
  const oAdapter = oVenue === null ? undefined : ctx.adapter(oVenue);
  const qOutcome = qLive.market.outcomes.find((x) => x.index === iq);
  const oOutcome = oLive.market.outcomes.find((x) => x.index === jo);
  if (qVenue === null || oVenue === null || qAdapter === undefined || oAdapter === undefined || qOutcome === undefined || oOutcome === undefined) {
    return withheld("withheld", ["book_unavailable"]);
  }
  // The outcome map is a human judgement made against a venue's outcome order, which the pins do
  // not cover. Where both outcomes carry a yes/no role, they must agree with the relation: equal
  // for identity and near-identity, opposite for a complement. A "label" role makes no claim.
  const yesNo = (r: OutcomeRef["role"]): boolean => r === "yes" || r === "no";
  if (yesNo(qOutcome.role) && yesNo(oOutcome.role)) {
    const same = qOutcome.role === oOutcome.role;
    if (link.relation === "complement" ? same : !same) return withheld("withheld", ["outcome_role_mismatch"]);
  }
  const [qb, ob] = await Promise.all([
    fetchBookForOutcome(ctx, qAdapter, qLive.market, qOutcome),
    fetchBookForOutcome(ctx, oAdapter, oLive.market, oOutcome),
  ]);
  if (!qb.ok || !ob.ok) return withheld("withheld", ["book_unavailable"]);
  const qParsed = parseBook(qb.book);
  const oParsed = parseBook(ob.book);
  if (!qParsed.ok || !oParsed.ok) return withheld("withheld", ["book_unavailable"]);
  // Adapters reject crossed ladders, but a corrupt or mid-update book is never priced, whatever
  // produced it (same rule as pm_get_quote).
  for (const parsed of [qParsed.value, oParsed.value]) {
    const bid = parsed.bids[0];
    const ask = parsed.asks[0];
    if (bid !== undefined && ask !== undefined && cmp(bid.price, ask.price) >= 0) return withheld("withheld", ["book_crossed"]);
  }

  const q: Side = { market: qLive.market, book: qParsed.value };
  const o: Side = { market: oLive.market, book: oParsed.value };
  const priced = priceIdentity(q, o, link, env.size, env.sizeText, ctx);

  // Gates. Anything extra to the pm-core gates is listed as its own reason.
  const extra: string[] = [...priced.reasons];
  const ageOk = (asOf: number): boolean => Number.isFinite(asOf) && ctx.nowMs - asOf <= QUOTE_VALID_MS && ctx.nowMs - asOf >= -FUTURE_SKEW_MS;
  if (!ageOk(qb.book.asOfMs) || !ageOk(ob.book.asOfMs)) extra.push("book_stale");
  // The venue's own timestamp, where it has one: a book can be fetched just now and still old.
  for (const book of [qb.book, ob.book]) {
    if (book.venueTsMs === undefined) continue;
    if (!Number.isFinite(book.venueTsMs)) extra.push("venue_time_invalid");
    else if (ctx.nowMs - book.venueTsMs > QUOTE_VALID_MS) extra.push("venue_book_stale");
    else if (ctx.nowMs - book.venueTsMs < -FUTURE_SKEW_MS) extra.push("venue_time_from_future");
  }

  const earliestClose = Math.min(...link.legs.map((l) => Date.parse(l.closeUtc)));
  const skew = Number.isFinite(qb.book.asOfMs) && Number.isFinite(ob.book.asOfMs) ? Math.abs(qb.book.asOfMs - ob.book.asOfMs) : null;
  const basis = basisInfoOf(link);
  const decision = assignLabel({
    kind: "cross_venue_pair",
    net: priced.gateNet,
    tau: DEFAULTS.tau,
    rulesHashesUnchanged: detailed.report.legs.every((l) => l.rulesSha256.matches && l.maskedSha256.matches),
    allTradable: [q.market, o.market].every((m) => m.status === "active" && m.tradable.ok),
    nearClose: earliestClose - ctx.nowMs < COMPARE_DEFAULTS.nearCloseMs,
    disputeOrProposalFlag: [q.market, o.market].some((m) => m.status === "disputed"),
    booksNative: q.book.derived === "native" && o.book.derived === "native",
    depthComplete: priced.depthComplete,
    skewMs: skew,
    feesUsable: priced.feesUsable,
    linkState: link.state === "approved" ? "verified" : link.state === "candidate" ? "candidate" : "none",
    ...(basis === undefined ? {} : { basis }),
  });
  const reasons = [...decision.reasons, ...extra];
  // The label can only be lowered by the cap, never raised.
  let label: CompareLabel = decision.label === "hedged_discrepancy" ? "hedged_discrepancy" : "indicative_discrepancy";
  if (label === "hedged_discrepancy" && (item.effectiveTierCap !== "hedged_discrepancy" || link.state !== "approved" || extra.length > 0)) {
    label = "indicative_discrepancy";
    if (item.effectiveTierCap !== "hedged_discrepancy") reasons.push("tier_cap");
  }

  const mids = priced.discrepancy;
  let fairValue: FairValueReference | null = null;
  if (mids.queriedMid !== null && mids.twinMid !== null) {
    const a = ratFromDec(mids.queriedMid);
    const b = ratFromDec(mids.twinMid);
    if (a.ok && b.ok) {
      fairValue = {
        kind: "twin_mid_reference",
        note: "Mid prices of the queried outcome and its linked twin. A reference point for judging price, not a forecast, not executable, and not adjusted for basis risk.",
        queriedMid: ratToDec(a.value, 6, "half_up"),
        twinMid: ratToDec(b.value, 6, "half_up"),
        consensusMid: ratToDec(div(add(a.value, b.value), rat(2n, 1n)), 6, "half_up"),
        quality: link.state === "approved" ? "approved_link_pins_verified" : "indicative_candidate",
      };
    }
  }

  return {
    ...base,
    status: "priced",
    withheldReasons: [],
    twin: { venue: oVenue, marketId: o.market.ref.marketId },
    books: {
      queried: view(q.book, q.market, qVenue, qOutcome, bookSha256(qb.book), ctx.nowMs, ctx),
      twin: view(o.book, o.market, oVenue, oOutcome, bookSha256(ob.book), ctx.nowMs, ctx),
    },
    discrepancy: priced.discrepancy,
    fairValue,
    label,
    whyNotArbitrage: whyNot(
      [...new Set(reasons)],
      cross,
      basisIdentical,
      priced.feeShare,
      priced.bestGross === null ? null : cmp(priced.bestGross, ZERO) > 0,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Entry point

export async function compareMarket(rawInput: unknown, ctx: CompareContext): Promise<CompareOutcome> {
  const parsed = compareInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure("BAD_INPUT", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  const input = parsed.data;
  const venue: VenueId = input.venue ?? "xo";
  if (ctx.adapter(venue) === undefined) return failure("VENUE_UNAVAILABLE", "no adapter is enabled for this venue");
  const dataset: Outcome<Bundle> = "format" in ctx.dataset ? { ok: true, value: ctx.dataset } : ctx.dataset;
  if (!dataset.ok) return failure("DATASET_UNAVAILABLE", "the link dataset failed validation, so link coverage is unknown");
  const bundle = dataset.value;

  const sizeLiteral = input.size ?? COMPARE_DEFAULTS.defaultSize;
  const size = ratFromDec(sizeLiteral);
  if (!size.ok) return failure("BAD_INPUT", "size is not a decimal");

  // Each market is read once per call, however many links name it.
  const cache = new Map<string, ReturnType<LegFetcher>>();
  const memoFetch: LegFetcher = (ref) => {
    const key = `${ref.venue}:${normaliseMarketId(ref.marketId)}`;
    let hit = cache.get(key);
    if (hit === undefined) {
      hit = ctx.fetchLeg({ venue: ref.venue, marketId: ref.marketId });
      cache.set(key, hit);
    }
    return hit;
  };

  const got = await guarded(() => memoFetch({ venue, marketId: normaliseMarketId(input.market_id) }), timeoutOf(ctx));
  if (!got.ok) return failure("MARKET_UNAVAILABLE", `${got.error}`);
  if (!got.value.ok) return failure("MARKET_UNAVAILABLE", got.value.error);
  const queriedMarket = got.value.value.market;
  if (queriedMarket.ref.venue !== venue) return failure("MARKET_UNAVAILABLE", "the adapter returned a market from another venue");
  const canonicalId = normaliseMarketId(queriedMarket.ref.marketId);
  // The slug or id the caller gave and the canonical one share one read.
  cache.set(`${venue}:${canonicalId}`, Promise.resolve(got.value));

  const looked = lookupLinks(
    bundle,
    {
      venue,
      marketId: canonicalId,
      includeCandidates: input.include_candidates === true,
      detail: false,
    },
    { now: new Date(ctx.nowMs), ...(ctx.gates === undefined ? {} : { gates: ctx.gates }) },
  );
  if (!looked.ok) return failure("BAD_INPUT", looked.detail);

  const items = [...looked.value.approved, ...looked.value.candidates];
  const chosen = items.slice(0, COMPARE_DEFAULTS.maxLinks);
  const env: LinkCompareEnv = {
    ctx,
    memoFetch,
    queried: { venue, marketId: canonicalId },
    size: size.value,
    sizeText: sizeLiteral,
    manifestEntityTableSha256: bundle.manifest.entityTableSha256,
  };
  const comparisons: ComparisonItem[] = [];
  for (const item of chosen) {
    const link = bundle.links.find((l) => l.linkId === item.linkId);
    if (link === undefined) continue;
    comparisons.push(await compareLink(link, item, env));
  }

  const notes: string[] = [];
  if (items.length === 0) {
    notes.push("No approved link covers this market in the bundled dataset. Absence of a link is not evidence that no twin exists; nothing was compared.");
  }
  if (items.length > chosen.length) notes.push(`Only the first ${COMPARE_DEFAULTS.maxLinks} links were compared to keep the request count low.`);
  notes.push(
    "Read-only. A discrepancy here is indicative: it is not an arbitrage, not a guaranteed profit, and nothing in this plugin places the trades.",
  );
  if (ctx.gates === undefined) notes.push("No gold-set class gate has been evaluated, so no label above indicative is possible.");

  return {
    ok: true,
    value: {
      queried: {
        venue,
        marketId: canonicalId,
        title: untrustedSlot(venue, "title", queriedMarket.title.value),
        status: queriedMarket.status,
        closesAt: queriedMarket.timesUtc.closesAt ?? null,
      },
      links: {
        considered: items.length,
        compared: comparisons.length,
        truncated: items.length > chosen.length,
        withdrawn: looked.value.withdrawn.map((w) => ({ linkId: w.linkId, label: w.label })),
      },
      comparisons,
      notes,
      readOnly: true,
      guaranteedProfitClaimed: false,
      executableTierEnabled: false,
      untrustedNotice: UNTRUSTED_DATA_NOTICE,
    },
  };
}
