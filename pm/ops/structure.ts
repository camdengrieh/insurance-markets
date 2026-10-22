// pm_check_structure: within-venue complement, partition and ladder checks for one group on
// injected books (docs/aggregation-design.md 5.2, 5.3, 5.7, 8.3, 9.1; docs/research/15 3.2, 3.3).
//
// Pure and offline: the caller (an adapter plus the tool layer) fetches books and passes them in
// with the clock. Nothing here does I/O, signs or places an order.
//
// What the result means. Every finding is an ALERT about a price relation, tagged with how far
// it was checked: mid prices only, top of book after fees, or a depth walk after fees. A label
// above indicative_discrepancy needs every gate to pass (fresh native books, usable fee models,
// known close and resolution times, no dispute flag, a net edge above tau). Anything unknown
// withholds the label and says why. No result is a promise of profit: voids, ties, disputes and
// the time between reading a price and trading it are not in the prices.
//
// Exhaustiveness. A set that is merely exclusive (Kalshi mutually_exclusive, augmented neg-risk)
// is never reported as summing to 1 and never gets the buy-every-YES basket; only the
// buy-every-NO basket is valid for it.

import { FIELD_LIMITS, sanitizeUntrusted } from "../../src/guardrails/untrusted.js";
import { repriceOrders, walkBasket, type BasketLeg, type BasketOutcome, type RepricedBasket } from "../../sdk/engine/basket.js";
import { complementBook, midPrice, parseBook, type ParsedBook } from "../../sdk/engine/books.js";
import { DEFAULTS, effectiveDays, lockRate } from "../../sdk/engine/edge.js";
import type { FeeErrorCode, FeeResult } from "../../sdk/engine/fees.js";
import { assignLabel, type EdgeLabel, type GateInput } from "../../sdk/engine/labels.js";
import {
  ONE,
  ZERO,
  add,
  cmp,
  dec,
  gt,
  ratFromDec,
  ratFromInt,
  rat,
  ratToDec,
  ratToDecExact,
  sub,
  sum,
  type Rational,
} from "../core/rational.js";
import {
  complementCheck,
  ladderCheck,
  partitionCheck,
  type PackageResult,
  type QuotedLeg,
  type RelationParams,
  type Rung,
} from "../../sdk/engine/relations.js";
import type { Book, Exhaustive, FeeSpec, GroupKind, Result, Status } from "../types.js";
import { isVenueId } from "../types.js";
import {
  MAX_GROUP_MEMBERS,
  MAX_LADDER_FINDINGS,
  STRUCTURE_CHECK_KINDS,
  STRUCTURE_DEFAULTS,
  STRUCTURE_SCHEMA_VERSION,
  type BookState,
  type CheckSummary,
  type DepthEdge,
  type Direction,
  type FindingVerdict,
  type MemberView,
  type PartitionFacts,
  type PriceBasis,
  type StructureCheckKind,
  type StructureErrorCode,
  type StructureFinding,
  type StructureGroup,
  type StructureMember,
  type StructureOptions,
  type StructureResult,
  type TopEdge,
} from "./structure-types.js";

export * from "./structure-types.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DAY_MS = 86_400_000n;
// A venue clock can run slightly ahead of ours; more than this is a bad timestamp.
const FUTURE_SKEW_MS = 5_000;
const MAX_CHECK_REASONS = 12;

export const STRUCTURE_NOTICE =
  "Alert only. Prices can move before any order fills, markets can void or resolve unexpectedly, and fees, lock-up and reserves are estimates. This tool places no orders and no profit is promised.";

const GROUP_KINDS: readonly GroupKind[] = ["neg_risk", "mutually_exclusive", "event", "series"];
const EXHAUSTIVE_VALUES: readonly Exhaustive[] = ["proven", "by_rule", "no", "unknown"];
const STATUS_VALUES: readonly Status[] = ["pending", "active", "paused", "closed", "determined", "disputed", "resolved", "voided", "unknown"];

type StructureResultOrError = Result<StructureResult, StructureErrorCode>;

function refuse(error: StructureErrorCode, detail: string): StructureResultOrError {
  return { ok: false, error, detail };
}

// ---------------------------------------------------------------------------------------------
// Options

interface Resolved {
  readonly nowMs: number;
  readonly tau: Rational;
  readonly hurdle: Rational;
  readonly reserve: Rational;
  readonly haircut: Rational;
  readonly maxBookAgeMs: number;
  readonly nearCloseMs: number;
  readonly maxQty: Rational | undefined;
  readonly walkDepth: boolean;
  readonly lockBase: "price" | "price_plus_fee";
  readonly checks: ReadonlySet<StructureCheckKind>;
  readonly lock: Rational;
  // Reasons that apply to every finding because the lock charge could not be known.
  readonly lockExtras: readonly string[];
  readonly rel: RelationParams;
}

function decOr(name: string, value: string | undefined, fallback: Rational, errors: string[]): Rational {
  if (value === undefined) return fallback;
  const parsed = ratFromDec(value);
  if (!parsed.ok) {
    errors.push(`${name} is not a plain decimal`);
    return fallback;
  }
  return parsed.value;
}

function intOr(name: string, value: number | undefined, fallback: number, min: number, errors: string[]): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min) {
    errors.push(`${name} must be an integer of at least ${min}`);
    return fallback;
  }
  return value;
}

function resolveOptions(group: StructureGroup, options: StructureOptions, nowMs: number): Result<Resolved, StructureErrorCode> {
  const errors: string[] = [];
  const tau = decOr("tau", options.tau, DEFAULTS.tau, errors);
  const hurdle = decOr("hurdleApy", options.hurdleApy, DEFAULTS.hurdleApy, errors);
  const reserve = decOr("reservePerShare", options.reservePerShare, dec(STRUCTURE_DEFAULTS.reservePerShare), errors);
  const haircut = decOr("haircutPerShare", options.haircutPerShare, ZERO, errors);
  const maxQty = options.maxQty === undefined ? undefined : decOr("maxQty", options.maxQty, ZERO, errors);
  if (maxQty !== undefined && cmp(maxQty, ZERO) <= 0) errors.push("maxQty must be positive");
  const maxBookAgeMs = intOr("maxBookAgeMs", options.maxBookAgeMs, STRUCTURE_DEFAULTS.maxBookAgeMs, 1, errors);
  const nearCloseMs = intOr("nearCloseMs", options.nearCloseMs, STRUCTURE_DEFAULTS.nearCloseMs, 0, errors);
  const lockBase = options.lockBase ?? "price_plus_fee";
  if (lockBase !== "price" && lockBase !== "price_plus_fee") errors.push("lockBase is not recognised");

  const checks = new Set<StructureCheckKind>();
  for (const c of options.checks ?? STRUCTURE_CHECK_KINDS) {
    if (!(STRUCTURE_CHECK_KINDS as readonly string[]).includes(c)) errors.push("unknown check kind");
    else checks.add(c);
  }
  if (checks.size === 0) errors.push("at least one check is needed");

  // Capital lock to the latest plausible resolution, with the dispute tail when supplied.
  const lockExtras: string[] = [];
  let lock = ZERO;
  if (group.resolutionAtMs === null || !Number.isSafeInteger(group.resolutionAtMs)) {
    // Unknown lock: the edge is shown without it but can never be labelled structural.
    lockExtras.push("lock_unknown");
  } else {
    let ms = group.resolutionAtMs - nowMs;
    if (ms < 0) {
      lockExtras.push("resolution_time_past");
      ms = 0;
    }
    let days = rat(BigInt(ms), DAY_MS);
    if (group.disputeTail !== undefined) {
      const p = ratFromDec(group.disputeTail.probability);
      const delta = ratFromDec(group.disputeTail.deltaDays);
      if (!p.ok || !delta.ok || cmp(p.value, ONE) > 0) errors.push("disputeTail is not a probability and a day count");
      else days = effectiveDays(days, p.value, delta.value);
    }
    lock = lockRate(hurdle, days);
  }

  if (errors.length > 0) return { ok: false, error: "INPUT_INVALID", detail: errors.join("; ") };
  return {
    ok: true,
    value: {
      nowMs,
      tau,
      hurdle,
      reserve,
      haircut,
      maxBookAgeMs,
      nearCloseMs,
      maxQty,
      walkDepth: options.walkDepth !== false,
      lockBase,
      checks,
      lock,
      lockExtras,
      rel: { lockRate: lock, lockBase, reservePerShare: reserve, haircutPerShare: haircut, nowMs },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Book views

interface BookView {
  readonly state: BookState;
  readonly native: boolean;
  readonly asOfMs: number | null;
  readonly parsed: ParsedBook | null;
  readonly bid: Rational | null;
  readonly ask: Rational | null;
  readonly mid: Rational | null;
}

const BLOCKING: ReadonlySet<BookState> = new Set(["empty", "no_book", "stale", "time_invalid", "crossed", "malformed"]);

function blocked(v: BookView): boolean {
  return BLOCKING.has(v.state);
}

function emptyView(state: BookState): BookView {
  return { state, native: false, asOfMs: null, parsed: null, bid: null, ask: null, mid: null };
}

// `synthetic` forces native=false: a book computed from the other side is never a resting book.
function bookView(book: Book | null, nowMs: number, maxAgeMs: number, synthetic: boolean): BookView {
  if (book === null) return emptyView("no_book");
  const parsed = parseBook(book);
  const asOf = Number.isSafeInteger(book.asOfMs) ? book.asOfMs : null;
  if (!parsed.ok) return { ...emptyView("malformed"), asOfMs: asOf };
  const base = { native: !synthetic && book.derived === "native", asOfMs: asOf, parsed: parsed.value };
  const bid = parsed.value.bids[0]?.price ?? null;
  const ask = parsed.value.asks[0]?.price ?? null;
  const shell = { ...base, bid, ask, mid: null };
  if (asOf === null || asOf > nowMs + FUTURE_SKEW_MS) return { ...shell, state: "time_invalid" };
  if (nowMs - asOf > maxAgeMs) return { ...shell, state: "stale" };
  if (bid === null && ask === null) return { ...shell, state: "empty" };
  if (bid !== null && ask !== null && cmp(bid, ask) >= 0) return { ...shell, state: "crossed" };
  const mid = midPrice(parsed.value);
  if (bid === null) return { ...shell, state: "ask_only" };
  if (ask === null) return { ...shell, state: "bid_only" };
  return { ...shell, state: "ok", mid };
}

interface MV {
  readonly m: StructureMember;
  readonly ref: string;
  readonly yes: BookView;
  readonly no: BookView;
  readonly noKind: "native" | "derived" | "missing";
  readonly resolvedYes: Book | null;
}

function buildMember(m: StructureMember, index: number, group: StructureGroup, ctx: Resolved): MV {
  const yes = bookView(m.yes, ctx.nowMs, ctx.maxBookAgeMs, false);
  let no: BookView;
  let noKind: MV["noKind"];
  if (m.no !== null) {
    no = bookView(m.no, ctx.nowMs, ctx.maxBookAgeMs, false);
    noKind = no.native ? "native" : "derived";
  } else if (m.yes !== null && yes.parsed !== null) {
    const synthetic = complementBook(m.yes, { venue: group.venue, tokenId: `${m.id}#no` });
    no = bookView(synthetic, ctx.nowMs, ctx.maxBookAgeMs, true);
    noKind = "derived";
  } else {
    no = emptyView("no_book");
    noKind = "missing";
  }
  return { m, ref: `m${index}`, yes, no, noKind, resolvedYes: m.yes };
}

// ---------------------------------------------------------------------------------------------
// Formatting (money never goes through floats; costs round up, gross and net round down)

const DISPLAY_PLACES = 9;
const down = (r: Rational): string => ratToDec(r, DISPLAY_PLACES, "floor");
const up = (r: Rational): string => ratToDec(r, DISPLAY_PLACES, "ceil");
const exact = (r: Rational): string => ratToDecExact(r) ?? ratToDec(r, DISPLAY_PLACES, "half_up");

function topEdge(edge: { gross: Rational; fees: Rational; lock: Rational; reserve: Rational; haircut: Rational; net: Rational }): TopEdge {
  return {
    gross: down(edge.gross),
    fees: up(edge.fees),
    lock: up(edge.lock),
    reserve: up(edge.reserve),
    haircut: up(edge.haircut),
    net: down(edge.net),
  };
}

// ---------------------------------------------------------------------------------------------
// Finding evaluation

interface DepthRun {
  readonly outcome: BasketOutcome;
  readonly repriced: RepricedBasket;
}

interface Pkg {
  readonly id: string;
  readonly check: StructureCheckKind;
  readonly direction: Direction;
  readonly members: readonly MV[];
  readonly books: readonly BookView[];
  // Hard preconditions; any entry makes the finding unavailable and nothing is priced.
  readonly pre: readonly string[];
  readonly midGap: Rational | null;
  readonly price: () => PackageResult;
  // Extra reasons that cap the label at indicative without blocking the numbers.
  readonly extras: readonly string[];
  readonly depth: (() => FeeResult<DepthRun>) | null;
  readonly caveats: readonly string[];
}

function feeCodeOf(r: PackageResult): FeeErrorCode | null {
  return r.kind === "error" ? r.code : null;
}

function depthEdge(run: DepthRun): DepthEdge {
  const t = run.outcome.totals;
  return {
    qty: down(t.qty),
    capital: up(t.capital),
    gross: down(t.gross),
    fees: up(t.fees),
    lock: up(t.lock),
    reserve: up(t.reserve),
    haircut: up(t.haircut),
    fixedCost: up(t.fixedCost),
    net: down(t.net),
    returnOnCapital: t.returnOnCapital === null ? null : down(t.returnOnCapital),
    netAfterOrderRounding: down(run.repriced.net),
    stopReason: run.outcome.stopReason,
  };
}

function gateInput(ctx: Resolved, group: StructureGroup, pkg: Pkg, net: Rational | null, feesUsable: boolean, depthComplete: boolean): GateInput {
  const pins = pkg.members.every((x) => x.m.rulesPin === undefined || x.m.rulesPin.pinned.toLowerCase() === x.m.rulesPin.current.toLowerCase());
  const asOfs = pkg.books.map((b) => b.asOfMs);
  let skewMs: number | null = null;
  if (asOfs.length > 0 && asOfs.every((a): a is number => a !== null)) skewMs = Math.max(...asOfs) - Math.min(...asOfs);
  return {
    kind: "within_venue_structure",
    net,
    tau: ctx.tau,
    rulesHashesUnchanged: pins,
    allTradable: pkg.members.every((x) => x.m.tradable && x.m.status === "active"),
    nearClose: pkg.members.some((x) => x.m.closesAtMs !== null && x.m.closesAtMs - ctx.nowMs <= ctx.nearCloseMs),
    disputeOrProposalFlag: pkg.members.some((x) => x.m.disputeOrProposal || x.m.status === "disputed"),
    booksNative: pkg.books.every((b) => b.native),
    depthComplete,
    skewMs,
    feesUsable,
    exhaustive: group.exhaustive,
    // Preconditions already refused any direction that exhaustiveness or exclusivity forbids.
    directionAllowed: true,
  };
}

function finding(
  pkg: Pkg,
  verdict: FindingVerdict,
  label: EdgeLabel | null,
  basis: PriceBasis,
  parts: { midGap?: Rational | null; top?: TopEdge | null; depth?: DepthEdge | null; reasons?: readonly string[] },
): StructureFinding {
  const midGap = parts.midGap ?? null;
  return {
    id: pkg.id,
    check: pkg.check,
    direction: pkg.direction,
    members: pkg.members.map((x) => x.ref),
    verdict,
    label,
    basis,
    midGap: midGap === null ? null : down(midGap),
    top: parts.top ?? null,
    depth: parts.depth ?? null,
    booksNative: pkg.books.length > 0 && pkg.books.every((b) => b.native),
    reasons: [...new Set(parts.reasons ?? [])],
    caveats: pkg.caveats,
  };
}

function evaluate(ctx: Resolved, group: StructureGroup, pkg: Pkg): StructureFinding {
  if (pkg.pre.length > 0) return finding(pkg, "unavailable", null, "none", { reasons: pkg.pre });

  const priced = pkg.price();
  const midAlert = pkg.midGap !== null && gt(pkg.midGap, ctx.tau);
  const top = priced.kind === "ok" ? priced.edge : null;
  const net = top === null ? null : top.net;
  const feeCode = feeCodeOf(priced);
  const costReasons: string[] = [];
  if (priced.kind === "error") costReasons.push(`fee_error:${priced.code}`);
  if (priced.kind === "unavailable") costReasons.push("package_unavailable");

  const netAbove = net !== null && gt(net, ctx.tau);
  if (!netAbove && !midAlert) {
    if (top === null) {
      return finding(pkg, "unavailable", null, pkg.midGap === null ? "none" : "mid", { midGap: pkg.midGap, reasons: costReasons });
    }
    return finding(pkg, "no_edge", null, "top_of_book_after_fees", { midGap: pkg.midGap, top: topEdge(top), reasons: [] });
  }

  // Something looks off. Run depth for a real candidate, then the gates.
  let depth: DepthRun | null = null;
  const reasons: string[] = [...costReasons];
  if (netAbove && ctx.walkDepth && pkg.depth !== null) {
    const run = pkg.depth();
    if (run.ok) depth = run.value;
    else reasons.push(`depth_walk_failed:${run.code}`);
  }
  const depthComplete = depth !== null && depth.outcome.steps.length > 0;
  const gates = gateInput(ctx, group, pkg, net, feeCode === null && top !== null, depthComplete);
  const decision = assignLabel(gates);
  reasons.push(...decision.reasons, ...pkg.extras, ...ctx.lockExtras);
  if (pkg.members.some((x) => x.m.closesAtMs === null)) reasons.push("close_time_unknown");
  if (depth !== null && cmp(depth.repriced.net, ZERO) <= 0) reasons.push("net_not_positive_after_order_rounding");

  // Any reason at all, gate or extra, caps the label at indicative.
  const labelled: EdgeLabel = decision.label === "structural_violation" && reasons.length === 0 ? "structural_violation" : "indicative_discrepancy";
  const basis: PriceBasis = depth !== null ? "depth_walk_after_fees" : top !== null ? "top_of_book_after_fees" : "mid";
  return finding(pkg, netAbove ? "candidate" : "mid_gap_only", labelled, basis, {
    midGap: pkg.midGap,
    top: top === null ? null : topEdge(top),
    depth: depth === null ? null : depthEdge(depth),
    reasons,
  });
}

// ---------------------------------------------------------------------------------------------
// Depth walk helper

function walk(ctx: Resolved, legs: readonly BasketLeg[], payoff: Rational): () => FeeResult<DepthRun> {
  return () => {
    const outcome = walkBasket(legs, {
      guaranteedPayoff: payoff,
      tau: ctx.tau,
      lockRate: ctx.lock,
      lockBase: ctx.lockBase,
      reservePerShare: ctx.reserve,
      haircutPerShare: ctx.haircut,
      ...(ctx.maxQty === undefined ? {} : { maxQty: ctx.maxQty }),
      nowMs: ctx.nowMs,
    });
    if (!outcome.ok) return outcome;
    const repriced = repriceOrders(legs, outcome.value);
    if (!repriced.ok) return repriced;
    return { ok: true, value: { outcome: outcome.value, repriced: repriced.value } };
  };
}

function leg(id: string, side: "buy" | "sell", view: BookView, spec: FeeSpec): BasketLeg {
  const levels = view.parsed === null ? [] : side === "buy" ? view.parsed.asks : view.parsed.bids;
  return { id, side, levels, spec };
}

// Reasons for a view that cannot be priced at all.
function blockReasons(members: readonly MV[], pick: (m: MV) => BookView): string[] {
  const out: string[] = [];
  for (const m of members) {
    const v = pick(m);
    if (blocked(v)) out.push(`${v.state}:${m.ref}`);
  }
  return out;
}

function missingSide(members: readonly MV[], pick: (m: MV) => BookView, side: "bid" | "ask"): string[] {
  const out: string[] = [];
  for (const m of members) {
    const v = pick(m);
    if (blocked(v)) continue;
    if ((side === "ask" ? v.ask : v.bid) === null) out.push(`no_${side}:${m.ref}`);
  }
  return out;
}

function sumOrNull(values: readonly (Rational | null)[]): Rational | null {
  const present: Rational[] = [];
  for (const v of values) {
    if (v === null) return null;
    present.push(v);
  }
  return sum(present);
}

// ---------------------------------------------------------------------------------------------
// Tally

class Tally {
  candidates = 0;
  midGapOnly = 0;
  noEdge = 0;
  unavailable = 0;
  readonly reasons = new Set<string>();

  add(f: StructureFinding): void {
    if (f.verdict === "candidate") this.candidates += 1;
    else if (f.verdict === "mid_gap_only") this.midGapOnly += 1;
    else if (f.verdict === "no_edge") this.noEdge += 1;
    else this.unavailable += 1;
    // Reasons without the member ref, so a 60-member group does not list 60 near-duplicates.
    if (f.verdict === "unavailable") for (const r of f.reasons) this.reasons.add(r.replace(/:m\d+$/, ""));
  }

  summary(kind: StructureCheckKind, extra: readonly string[] = [], status: CheckSummary["status"] = "evaluated"): CheckSummary {
    const items = this.candidates + this.midGapOnly + this.noEdge + this.unavailable;
    return {
      kind,
      status,
      itemsEvaluated: items,
      candidates: this.candidates,
      midGapOnly: this.midGapOnly,
      noEdge: this.noEdge,
      unavailable: this.unavailable,
      reasons: [...new Set([...extra, ...this.reasons])].slice(0, MAX_CHECK_REASONS),
    };
  }
}

function notApplicable(kind: StructureCheckKind, reason: string, status: CheckSummary["status"] = "not_applicable"): CheckSummary {
  return { kind, status, itemsEvaluated: 0, candidates: 0, midGapOnly: 0, noEdge: 0, unavailable: 0, reasons: [reason] };
}

// ---------------------------------------------------------------------------------------------
// Complement: YES + NO of one market

const COMPLEMENT_CAVEATS = ["void_or_fifty_fifty_possible"] as const;

function quoted(id: string, yes: BookView, spec: FeeSpec): QuotedLeg {
  return { id, bid: yes.bid, ask: yes.ask, spec };
}

function complementFindings(ctx: Resolved, group: StructureGroup, members: readonly MV[]): { findings: StructureFinding[]; summary: CheckSummary } {
  const tally = new Tally();
  const findings: StructureFinding[] = [];
  let skippedDerived = 0;
  for (const mv of members) {
    // A NO side computed from the YES book cannot disagree with it, so there is nothing to check.
    if (mv.noKind !== "native") {
      skippedDerived += 1;
      continue;
    }
    const cc = complementCheck(quoted(`${mv.ref}:yes`, mv.yes, mv.m.fee), quoted(`${mv.ref}:no`, mv.no, mv.m.fee), ctx.rel);
    const sidePre = (side: "bid" | "ask"): string[] => [
      ...blockReasons([mv], (x) => x.yes),
      ...blockReasons([mv], (x) => x.no).map((r) => `no_side_${r}`),
      ...missingSide([mv], (x) => x.yes, side),
      ...missingSide([mv], (x) => x.no, side).map((r) => `no_side_${r}`),
    ];
    const midYes = mv.yes.mid;
    const midNo = mv.no.mid;
    const mids = midYes === null || midNo === null ? null : add(midYes, midNo);
    // On a venue whose books mirror each other a positive gross gap is a stale print or a
    // crossed book, not an edge (docs/research/15 3.2 b1), so the label stays indicative.
    const suspect = cc.grossGapSuspect ? ["gross_gap_on_complement_pair_suspect"] : [];
    const base = { id: "", check: "complement" as const, members: [mv], extras: suspect, depth: null, caveats: COMPLEMENT_CAVEATS };
    const long: Pkg = {
      ...base,
      id: `complement:${mv.ref}:long`,
      direction: "buy_yes_and_no",
      books: [mv.yes, mv.no],
      pre: sidePre("ask"),
      midGap: mids === null ? null : sub(ONE, mids),
      price: () => cc.long,
      depth: ctx.walkDepth
        ? walk(ctx, [leg(`${mv.ref}:yes`, "buy", mv.yes, mv.m.fee), leg(`${mv.ref}:no`, "buy", mv.no, mv.m.fee)], ONE)
        : null,
    };
    const short: Pkg = {
      ...base,
      id: `complement:${mv.ref}:short`,
      direction: "sell_yes_and_no",
      books: [mv.yes, mv.no],
      pre: sidePre("bid"),
      midGap: mids === null ? null : sub(mids, ONE),
      price: () => cc.short,
      depth: ctx.walkDepth
        ? walk(ctx, [leg(`${mv.ref}:yes`, "sell", mv.yes, mv.m.fee), leg(`${mv.ref}:no`, "sell", mv.no, mv.m.fee)], ratFromInt(-1))
        : null,
    };
    for (const pkg of [long, short]) {
      const f = evaluate(ctx, group, pkg);
      tally.add(f);
      if (f.verdict === "candidate" || f.verdict === "mid_gap_only") findings.push(f);
    }
  }
  const extra = skippedDerived > 0 ? [`no_native_no_book:${skippedDerived}`] : [];
  if (tally.candidates + tally.midGapOnly + tally.noEdge + tally.unavailable === 0) {
    return { findings, summary: notApplicable("complement", extra[0] ?? "no_members") };
  }
  return { findings, summary: tally.summary("complement", extra) };
}

// ---------------------------------------------------------------------------------------------
// Partition: exactly one (exhaustive) or at most one (exclusive) of n members resolves YES

const PARTITION_CAVEATS = ["void_or_fifty_fifty_possible", "dispute_lockup_possible"] as const;

function isExclusive(kind: GroupKind): boolean {
  return kind === "neg_risk" || kind === "mutually_exclusive";
}

function partitionFindings(
  ctx: Resolved,
  group: StructureGroup,
  members: readonly MV[],
): { findings: StructureFinding[]; summary: CheckSummary; facts: PartitionFacts | null } {
  const n = members.length;
  if (!isExclusive(group.kind)) {
    // An "event" or "series" grouping says nothing about exclusivity, so no partition claim.
    return { findings: [], summary: notApplicable("partition", `group_not_declared_exclusive:${group.kind}`, "refused"), facts: null };
  }
  if (n < 2) return { findings: [], summary: notApplicable("partition", "partition_needs_two_members"), facts: null };

  const exhaustive = group.exhaustive === "proven" || group.exhaustive === "by_rule";
  const yesBlock = blockReasons(members, (m) => m.yes);
  const noBlock = blockReasons(members, (m) => m.no);
  const yesMids = members.map((m) => m.yes.mid);
  const facts: PartitionFacts = {
    n,
    expectedSum: exhaustive ? "1" : "at_most_1",
    sumAsk: yesBlock.length > 0 ? null : orNull(sumOrNull(members.map((m) => m.yes.ask)), exact),
    sumBid: yesBlock.length > 0 ? null : orNull(sumOrNull(members.map((m) => m.yes.bid)), exact),
    sumMid: yesBlock.length > 0 ? null : orNull(sumOrNull(yesMids), exact),
  };

  const legs: QuotedLeg[] = members.map((m) => ({
    id: m.ref,
    bid: m.yes.bid,
    ask: m.yes.ask,
    spec: m.m.fee,
    // The NO ask comes from the NO book (native, or 1 - yes bid when derived).
    noAsk: m.no.ask,
  }));
  const pc = partitionCheck(legs, group.exhaustive, ctx.rel);

  const longPre: string[] = [];
  if (!exhaustive) longPre.push(`long_basket_needs_exhaustive_set:exhaustive=${group.exhaustive}`);
  if (!group.membersComplete) longPre.push("members_incomplete");
  longPre.push(...yesBlock, ...missingSide(members, (m) => m.yes, "ask"));
  const yesMidSum = sumOrNull(yesMids);
  const long: Pkg = {
    id: "partition:long",
    check: "partition",
    direction: "buy_all_yes",
    members,
    books: members.map((m) => m.yes),
    pre: longPre,
    midGap: yesMidSum === null ? null : sub(ONE, yesMidSum),
    price: () => pc.long,
    extras: [],
    depth: ctx.walkDepth ? walk(ctx, members.map((m) => leg(m.ref, "buy", m.yes, m.m.fee)), ONE) : null,
    caveats: PARTITION_CAVEATS,
  };

  const noMidSum = sumOrNull(members.map((m) => m.no.mid));
  const short: Pkg = {
    id: "partition:short",
    check: "partition",
    direction: "buy_all_no",
    members,
    books: members.map((m) => m.no),
    pre: [...noBlock, ...missingSide(members, (m) => m.no, "ask")],
    midGap: noMidSum === null ? null : sub(ratFromInt(n - 1), noMidSum),
    price: () => pc.short,
    // The arithmetic holds on the supplied subset, but the group is not proven complete, so the
    // finding is a signal about those members only: never the strongest label.
    extras: group.membersComplete ? [] : ["member_list_not_proven_complete"],
    depth: ctx.walkDepth ? walk(ctx, members.map((m) => leg(`${m.ref}:no`, "buy", m.no, m.m.fee)), ratFromInt(n - 1)) : null,
    caveats: PARTITION_CAVEATS,
  };

  const tally = new Tally();
  const findings = [long, short].map((pkg) => evaluate(ctx, group, pkg));
  for (const f of findings) tally.add(f);
  return { findings, summary: tally.summary("partition"), facts };
}

function orNull<T>(value: T | null, f: (v: T) => string): string | null {
  return value === null ? null : f(value);
}

// ---------------------------------------------------------------------------------------------
// Ladder: nested thresholds and dates (A implies B, so p_A <= p_B)

const LADDER_CAVEATS = ["per_rung_resolution", "tie_rules_unchecked", "void_or_fifty_fifty_possible"] as const;

function ladderFindings(
  ctx: Resolved,
  group: StructureGroup,
  members: readonly MV[],
): { findings: StructureFinding[]; summary: CheckSummary; omitted: number } {
  const withRung = members.filter((m) => m.m.rung !== undefined);
  if (withRung.length < 2) {
    return { findings: [], summary: notApplicable("ladder", "ladder_metadata_missing"), omitted: 0 };
  }
  const usable = withRung.filter((m) => !blocked(m.yes));
  const excluded = withRung.length - usable.length;
  const byRef = new Map(usable.map((m) => [m.ref, m] as const));
  const rungs: Rung[] = [];
  for (const m of usable) {
    const r = m.m.rung;
    const strike = r === undefined ? null : ratFromDec(r.strike);
    if (r === undefined || strike === null || !strike.ok) continue;
    rungs.push({ quote: quoted(m.ref, m.yes, m.m.fee), strike: strike.value, deadlineMs: r.deadlineMs, direction: r.direction, kind: r.kind });
  }
  const lc = ladderCheck(rungs, ctx.rel);

  const tally = new Tally();
  const emitted: { f: StructureFinding; net: Rational | null }[] = [];
  for (const pair of lc.pairs) {
    const a = byRef.get(pair.antecedent);
    const b = byRef.get(pair.consequent);
    if (a === undefined || b === undefined) continue;
    const midGap = a.yes.mid === null || b.yes.mid === null ? null : sub(a.yes.mid, b.yes.mid);
    const pkg: Pkg = {
      id: `ladder:${a.ref}>${b.ref}`,
      check: "ladder",
      direction: "sell_stronger_buy_weaker",
      members: [a, b],
      books: [a.yes, b.yes],
      pre: [...missingSide([a], (x) => x.yes, "bid"), ...missingSide([b], (x) => x.yes, "ask")],
      midGap,
      price: () => pair.result,
      extras: [],
      depth: ctx.walkDepth ? walk(ctx, [leg(a.ref, "sell", a.yes, a.m.fee), leg(b.ref, "buy", b.yes, b.m.fee)], ZERO) : null,
      caveats: LADDER_CAVEATS,
    };
    const f = evaluate(ctx, group, pkg);
    tally.add(f);
    if (f.verdict === "candidate" || f.verdict === "mid_gap_only") {
      emitted.push({ f, net: pair.result.kind === "ok" ? pair.result.edge.net : null });
    }
  }
  // Best first: candidates by net edge, then mid-only alerts.
  emitted.sort((x, y) => {
    if (x.f.verdict !== y.f.verdict) return x.f.verdict === "candidate" ? -1 : 1;
    if (x.net === null || y.net === null) return x.net === y.net ? 0 : x.net === null ? 1 : -1;
    return -cmp(x.net, y.net);
  });
  const kept = emitted.slice(0, MAX_LADDER_FINDINGS).map((e) => e.f);
  const extra: string[] = [];
  if (excluded > 0) extra.push(`blocked_books_excluded:${excluded}`);
  if (lc.incomparablePairs > 0) extra.push(`incomparable_pairs:${lc.incomparablePairs}`);
  if (lc.pairsChecked === 0) return { findings: [], summary: notApplicable("ladder", "no_comparable_rungs"), omitted: 0 };
  return { findings: kept, summary: tally.summary("ladder", extra), omitted: emitted.length - kept.length };
}

// ---------------------------------------------------------------------------------------------
// Input validation

function validate(group: StructureGroup): StructureResultOrError | null {
  if (!isVenueId(group.venue)) return refuse("INPUT_INVALID", "unknown venue id");
  if (typeof group.key !== "string" || !SAFE_ID.test(group.key)) return refuse("UNSAFE_ID", "group key has characters outside the safe set");
  if (!GROUP_KINDS.includes(group.kind)) return refuse("INPUT_INVALID", "unknown group kind");
  if (!EXHAUSTIVE_VALUES.includes(group.exhaustive)) return refuse("INPUT_INVALID", "unknown exhaustive value");
  if (typeof group.membersComplete !== "boolean") return refuse("INPUT_INVALID", "membersComplete must be a boolean");
  if (group.members.length < 1) return refuse("TOO_FEW_MEMBERS", "a group needs at least one member");
  if (group.members.length > MAX_GROUP_MEMBERS) {
    return refuse("GROUP_TOO_LARGE", `group has more than ${MAX_GROUP_MEMBERS} members; page or narrow it first`);
  }
  const seen = new Set<string>();
  for (const [i, m] of group.members.entries()) {
    if (typeof m.id !== "string" || !SAFE_ID.test(m.id)) return refuse("UNSAFE_ID", `member ${i} id has characters outside the safe set`);
    if (seen.has(m.id)) return refuse("DUPLICATE_ID", `member ${i} repeats an earlier id`);
    seen.add(m.id);
    if (!STATUS_VALUES.includes(m.status)) return refuse("INPUT_INVALID", `member ${i} has an unknown status`);
    if (m.closesAtMs !== null && !Number.isSafeInteger(m.closesAtMs)) return refuse("INPUT_INVALID", `member ${i} closesAtMs is not an integer`);
    for (const book of [m.yes, m.no]) {
      if (book !== null && book.token.venue !== group.venue) {
        return refuse("VENUE_MISMATCH", `member ${i} has a book from another venue; this tool is within-venue only`);
      }
    }
    if (m.yes !== null && m.no !== null && m.yes.token.tokenId === m.no.token.tokenId) {
      return refuse("INPUT_INVALID", `member ${i} uses the same token for YES and NO`);
    }
    if (m.rung !== undefined) {
      if (!ratFromDec(m.rung.strike).ok || !Number.isSafeInteger(m.rung.deadlineMs)) return refuse("INPUT_INVALID", `member ${i} rung is malformed`);
      if (m.rung.direction !== "above" && m.rung.direction !== "below") return refuse("INPUT_INVALID", `member ${i} rung direction is unknown`);
      if (m.rung.kind !== "terminal" && m.rung.kind !== "touch") return refuse("INPUT_INVALID", `member ${i} rung kind is unknown`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Entry point

function viewOf(mv: MV, group: StructureGroup, ctx: Resolved): MemberView {
  const m = mv.m;
  return {
    ref: mv.ref,
    id: m.id,
    label: sanitizeUntrusted(m.label.value, { maxChars: FIELD_LIMITS.title, source: `${group.venue.replace(/_/g, "-")}-market` }),
    status: m.status,
    tradable: m.tradable,
    yesBook: mv.yes.state,
    noBook: mv.noKind,
    ageMs: mv.yes.asOfMs === null ? null : Math.max(0, ctx.nowMs - mv.yes.asOfMs),
    bid: orNull(mv.yes.bid, exact),
    ask: orNull(mv.yes.ask, exact),
    mid: orNull(mv.yes.mid, exact),
  };
}

export function checkStructure(group: StructureGroup, options: StructureOptions, nowMs: number): StructureResultOrError {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) return refuse("INPUT_INVALID", "nowMs must be a positive integer");
  const invalid = validate(group);
  if (invalid !== null) return invalid;
  const resolved = resolveOptions(group, options, nowMs);
  if (!resolved.ok) return resolved;
  const ctx = resolved.value;

  const members = group.members.map((m, i) => buildMember(m, i, group, ctx));
  const findings: StructureFinding[] = [];
  const checks: CheckSummary[] = [];
  let partition: PartitionFacts | null = null;
  let omitted = 0;

  if (ctx.checks.has("partition")) {
    const p = partitionFindings(ctx, group, members);
    findings.push(...p.findings);
    checks.push(p.summary);
    partition = p.facts;
  }
  if (ctx.checks.has("complement")) {
    const c = complementFindings(ctx, group, members);
    findings.push(...c.findings);
    checks.push(c.summary);
  }
  if (ctx.checks.has("ladder")) {
    const l = ladderFindings(ctx, group, members);
    findings.push(...l.findings);
    checks.push(l.summary);
    omitted = l.omitted;
  }

  const alerts = findings.filter((f) => f.verdict === "candidate" || f.verdict === "mid_gap_only");
  const highest: EdgeLabel | null = alerts.some((f) => f.label === "structural_violation")
    ? "structural_violation"
    : alerts.some((f) => f.label === "indicative_discrepancy")
      ? "indicative_discrepancy"
      : null;

  return {
    ok: true,
    value: {
      schema: STRUCTURE_SCHEMA_VERSION,
      group: {
        venue: group.venue,
        key: group.key,
        kind: group.kind,
        exhaustive: group.exhaustive,
        membersComplete: group.membersComplete,
        memberCount: group.members.length,
      },
      asOfMs: nowMs,
      params: {
        tau: exact(ctx.tau),
        hurdleApy: exact(ctx.hurdle),
        reservePerShare: exact(ctx.reserve),
        haircutPerShare: exact(ctx.haircut),
        maxBookAgeMs: ctx.maxBookAgeMs,
        nearCloseMs: ctx.nearCloseMs,
      },
      members: members.map((m) => viewOf(m, group, ctx)),
      partition,
      checks,
      findings,
      summary: { alerts: alerts.length, highestLabel: highest, ladderFindingsOmitted: omitted },
      notice: STRUCTURE_NOTICE,
    },
  };
}
