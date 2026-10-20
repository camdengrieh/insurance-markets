// Per-venue position reads (docs/dapp-design.md 4.6; acceptance M2-5, M2-6, M2-7).
//
// Each reader turns one venue's answer into PortfolioRow[] and NEVER throws: a failure becomes a `failed` outcome
// for that venue and that address only, so the other venues keep rendering (M2-6). The readers add no network
// code of their own beyond the XO Data API and orderbook reads (xo-reads.ts): the others call the venue adapters,
// which take the same injected fetch.

import type { AdapterError, Book, Prov, Result, TokenRef, Transport, VenueId } from "../../core/ports";
import { checkEvmAddress } from "../../core/address";
import { qtyOfDec, type Qty } from "../../core/money";
import { untrustedField } from "../../core/untrusted";
import type { AdapterDeps } from "../../core/ports";
import { createPascalAdapter, type PascalAdapter } from "../../venues/pascal";
import { createPolymarketAdapter, DATA_ORIGIN, type PolymarketAdapter, type PolymarketPosition, type PositionQueryStatus } from "../../venues/polymarket";
import { createTrueoAdapter, type TrueoAdapter } from "../../venues/trueo";
import type { VenuePosition as SharedVenuePosition } from "../../venues/pascal";
import { createXoAdapter, type XoAdapter } from "../../venues/xo";
import { makeProv } from "../../core/venue-policy";
import { errorText } from "../../ui/Tiles";
import { failureOf } from "../wallet/failure";
import { makeRow, qtyOf } from "./rows";
import type { PlannedRead } from "./targets";
import { bidMark } from "./valuation";
import { FLAG_READS_DISAGREE, readXoAccount } from "./xo-reads";
import type { AddressResolution, PortfolioRow, RowStatus, VenueReadOk, VenueReadOutcome } from "./types";

// What the readers need from each adapter: positions, a profile lookup and books. Narrow on purpose, so a test
// supplies three methods and not a whole adapter.
export interface PortfolioAdapters {
  xo(): Pick<XoAdapter, "getBooks">;
  polymarket(): Pick<PolymarketAdapter, "getPositionsByAddress" | "lookupProxyWallet" | "getBooks">;
  trueo(): Pick<TrueoAdapter, "positionsByAddress">;
  pascal(): Pick<PascalAdapter, "positionsByAddress">;
}

// Lazily created, one instance each, so an adapter's own cache (Pascal's 6 MB snapshot) lives as long as the page.
export function createPortfolioAdapters(deps: AdapterDeps, mode: "standalone" | "cockpit"): PortfolioAdapters {
  let xo: XoAdapter | undefined;
  let polymarket: PolymarketAdapter | undefined;
  let trueo: TrueoAdapter | undefined;
  let pascal: PascalAdapter | undefined;
  return {
    xo: () => (xo ??= createXoAdapter(deps, { variant: mode })),
    polymarket: () => (polymarket ??= createPolymarketAdapter(deps, { transport: mode === "cockpit" ? "T1" : "T0" })),
    trueo: () => (trueo ??= createTrueoAdapter(deps)),
    pascal: () => (pascal ??= createPascalAdapter(deps, { transport: mode === "cockpit" ? "T1" : "T0" })),
  };
}

export interface ReadContext {
  readonly deps: AdapterDeps;
  readonly adapters: PortfolioAdapters;
  readonly mode: "standalone" | "cockpit";
}

export const MAX_MARKED_ROWS_PER_VENUE = 40;
const POSITIONS_TTL_MS = 30_000;

// Provenance for an answer that has no rows to carry it (an empty account is an answer, with a time and a route).
function readProv(ctx: ReadContext, venue: VenueId, source: string, transport: Transport): Prov {
  const now = ctx.deps.nowMs();
  return makeProv({ venue, source, fetchedAtMs: now, nowMs: now, ttlMs: POSITIONS_TTL_MS, transport });
}

// The adapters disagree about what `deadlineMs` means (ports.ts does not say): XO reads it as a duration, Polymarket
// as an absolute time on the injected clock. Each reader passes the form its adapter reads.
export const BOOK_DEADLINE_MS = 15_000;
export const MAX_POSITION_PAGES = 3;

// ---- marking --------------------------------------------------------------------------------------------------------

function noteForCode(code: AdapterError | "UNKNOWN", needsCockpit: boolean): string {
  if (needsCockpit) return "This venue's order book is read through the Cockpit only.";
  return `No price: ${errorText(code === "UNKNOWN" ? undefined : code).title.toLowerCase()}.`;
}

// Prices the open rows of one venue at the best bid of that venue's own book. Rows that cannot be priced keep
// value null with a reason; none is priced from a different source.
export async function markWithBids(
  rows: readonly PortfolioRow[],
  venue: VenueId,
  fetchBooks: ((tokens: TokenRef[]) => Promise<ReadonlyArray<Result<Book, AdapterError>>>) | null,
  nowMs: number,
  unavailableNote: string,
): Promise<PortfolioRow[]> {
  const candidates = rows.filter((row) => row.status === "open" && row.qty !== null && row.tokenId !== null && !row.flags.includes(FLAG_READS_DISAGREE));
  const chosen = candidates.slice(0, MAX_MARKED_ROWS_PER_VENUE);
  const chosenIds = new Set(chosen.map((row) => row.id));
  const results = new Map<string, Result<Book, AdapterError> | { ok: false; error: AdapterError | "UNKNOWN"; needsCockpit: boolean }>();
  if (fetchBooks !== null && chosen.length > 0) {
    try {
      const answers = await fetchBooks(chosen.map((row) => ({ venue, tokenId: row.tokenId as string })));
      chosen.forEach((row, index) => {
        const answer = answers[index];
        results.set(row.id, answer ?? { ok: false, error: "UNKNOWN", needsCockpit: false });
      });
    } catch (error) {
      const failure = failureOf(error);
      for (const row of chosen) results.set(row.id, { ok: false, error: failure.code, needsCockpit: failure.needsCockpit });
    }
  }
  return rows.map((row) => {
    if (row.status !== "open") return row;
    if (row.flags.includes(FLAG_READS_DISAGREE)) return { ...row, valueNote: FLAG_READS_DISAGREE };
    if (row.qty === null || row.tokenId === null) return { ...row, valueNote: "The size or the token is not known, so it is not priced." };
    if (fetchBooks === null) return { ...row, valueNote: unavailableNote };
    if (!chosenIds.has(row.id)) return { ...row, valueNote: `Only the first ${MAX_MARKED_ROWS_PER_VENUE} positions of a venue are priced at a time.` };
    const answer = results.get(row.id);
    if (answer === undefined) return { ...row, valueNote: "No book was returned for this token." };
    if (!answer.ok) {
      const code = answer.error;
      const needsCockpit = "needsCockpit" in answer ? answer.needsCockpit : false;
      return { ...row, valueNote: noteForCode(code, needsCockpit) };
    }
    const mark = bidMark(row.qty, answer.value, nowMs, row.collateral);
    return mark.value === null ? { ...row, valueNote: mark.note } : { ...row, value: mark.value, valueBasis: "bid" as const, valueNote: null };
  });
}

// ---- XO -------------------------------------------------------------------------------------------------------------

async function readXo(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>): Promise<VenueReadOutcome> {
  const read = await readXoAccount(ctx.deps, { bindingId: plan.binding.id, account: plan.address, cockpit: ctx.mode === "cockpit" });
  const cockpit = ctx.mode === "cockpit";
  const rows = await markWithBids(read.rows, "xo", cockpit ? (tokens) => ctx.adapters.xo().getBooks(tokens, { deadlineMs: BOOK_DEADLINE_MS }) : null, ctx.deps.nowMs(), "XO's order books are read through the Cockpit only, so this position is listed without a price.");
  const resolution: AddressResolution = { source: plan.resolution === "derived_kernel" ? "derived" : "pasted", address: plan.address, candidate: null };
  return {
    kind: "ok",
    venue: "xo",
    bindingId: plan.binding.id,
    bindingLabel: plan.binding.label,
    holder: plan.address,
    rows,
    rejected: read.rejected,
    notListed: read.notListed,
    notes: [...read.notes, "XO's own current value is shown as a reference only: the venue's display price is not a price anyone can sell at."],
    prov: read.prov,
    partial: read.partial,
    facts: read.cash === null ? [] : [{ label: "XO cash balance (from the order book)", value: read.cash, symbol: "USDC.e" }],
    resolution,
  };
}

// ---- Polymarket -------------------------------------------------------------------------------------------------------

const POLYMARKET_STATUS: Readonly<Record<PolymarketPosition["status"], RowStatus>> = Object.freeze({ open: "open", claimable: "claimable", lost: "lost", closed: "closed" });

function polymarketRow(position: PolymarketPosition, plan: Extract<PlannedRead, { kind: "run" }>, wallet: string): PortfolioRow {
  const status = POLYMARKET_STATUS[position.status];
  const reference = qtyOf("usd", position.value);
  return makeRow({
    id: position.id,
    venue: "polymarket",
    bindingId: plan.binding.id,
    holder: wallet,
    market: position.title ?? untrustedField("generic", position.market.marketId, "polymarket"),
    outcome: position.outcome.label,
    tokenId: position.outcome.tokenId,
    qty: qtyOf("shares", position.qty),
    status,
    collateral: "usd",
    collateralSymbol: position.collateral.symbol,
    prov: position.prov,
    cost: qtyOf("usd", position.cost.total),
    pnl: qtyOf("usd", position.pnl.total),
    pnlSource: position.pnl.source === "venue_reported" ? "venue_reported" : "unavailable",
    reference,
    // A redeemable position's figure is the venue's own; this app does not recompute a settlement it cannot see.
    claimable: status === "claimable" ? reference : null,
    claimSource: status === "claimable" && reference !== null ? "venue_reported" : "none",
    claimNote: status === "claimable" ? "The amount is Polymarket's own figure." : null,
  });
}

async function readPolymarket(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>): Promise<VenueReadOutcome> {
  const adapter = ctx.adapters.polymarket();
  const base = { venue: "polymarket" as const, bindingId: plan.binding.id, bindingLabel: plan.binding.label };
  let wallet = plan.address;
  let source: AddressResolution["source"] = "pasted";
  if (plan.resolution === "profile_lookup") {
    // The derived deposit-wallet address is never used to query anything (M2-7): the venue's own profile lookup, or
    // a pasted wallet, is the authority.
    const looked = await adapter.lookupProxyWallet(plan.address);
    if (!looked.ok) {
      if (looked.error === "NOT_FOUND") {
        return { kind: "unresolved", ...base, why: "Polymarket has no profile for this address. If you trade there, paste your Polymarket wallet address as its own saved entry." };
      }
      return { kind: "failed", ...base, code: looked.error, retryAfterMs: null };
    }
    const checked = checkEvmAddress(looked.value.proxyWallet, [], { role: "any" });
    if (!checked.ok) return { kind: "failed", ...base, code: "SCHEMA_DRIFT", retryAfterMs: null };
    wallet = checked.address;
    source = "profile_lookup";
  }

  const rows: PortfolioRow[] = [];
  let rejected = 0;
  let partial = false;
  const statuses: readonly PositionQueryStatus[] = ["OPEN", "REDEEMABLE"];
  for (const status of statuses) {
    let cursor: string | undefined;
    for (let page = 1; page <= MAX_POSITION_PAGES; page += 1) {
      const result = await adapter.getPositionsByAddress(wallet, { status, bindingId: plan.binding.id, ...(cursor === undefined ? {} : { cursor }) });
      rejected += result.rejected.length;
      for (const item of result.items) rows.push(polymarketRow(item, plan, wallet));
      if (result.next === null) break;
      if (page === MAX_POSITION_PAGES) partial = true;
      cursor = result.next;
    }
  }
  const unique = [...new Map(rows.map((row) => [row.id, row] as const)).values()];
  const marked = await markWithBids(unique, "polymarket", (tokens) => adapter.getBooks(tokens, { deadlineMs: ctx.deps.nowMs() + BOOK_DEADLINE_MS }), ctx.deps.nowMs(), "No book source.");
  return {
    kind: "ok",
    ...base,
    holder: wallet,
    rows: marked,
    rejected,
    notListed: [],
    notes: ["Polymarket's own current value is shown as a reference only; the value column is the best bid on its order book."],
    prov: marked[0]?.prov ?? readProv(ctx, "polymarket", `${DATA_ORIGIN}/v2/positions`, ctx.mode === "cockpit" ? "T1" : "T0"),
    partial,
    facts: [],
    resolution: { source, address: wallet, candidate: null },
  };
}

// ---- Pascal and Trueo (positions come marked from the adapter) -----------------------------------------------------------

type SharedPosition = SharedVenuePosition;

const SHARED_STATUS: Readonly<Record<SharedPosition["status"], RowStatus | "skip">> = Object.freeze({
  open: "open",
  resolved_unclaimed: "resolved_unclaimed",
  claimable: "claimable",
  claimed: "skip",
  voided_refund: "voided_refund",
  lost: "lost",
  closed: "closed",
});

function sharedRow(position: SharedPosition, plan: Extract<PlannedRead, { kind: "run" }>, unit: "usd" | "tyd", symbol: string, qtyUnit: "shares" | "contracts"): PortfolioRow | null {
  const status = SHARED_STATUS[position.status];
  if (status === "skip") return null;
  const value = qtyOf(unit, position.value);
  const settled = status === "claimable" || status === "voided_refund" || status === "resolved_unclaimed";
  const markIsBid = position.mark.basis === "bid";
  return makeRow({
    id: position.id,
    venue: position.market.venue,
    bindingId: plan.binding.id,
    holder: plan.address,
    market: untrustedField("generic", position.market.marketId, position.market.venue),
    outcome: position.outcome.role === "label" ? untrustedField("generic", position.outcome.tokenId ?? `outcome ${position.outcome.index}`, position.market.venue) : untrustedField("outcome", position.outcome.role === "yes" ? "Yes" : "No"),
    tokenId: position.outcome.tokenId ?? null,
    qty: qtyOf(qtyUnit, position.qty),
    free: qtyOf(qtyUnit, position.free),
    reserved: qtyOf(qtyUnit, position.reserved),
    status,
    collateral: unit,
    collateralSymbol: symbol,
    prov: position.prov,
    // An open position's value is a bid mark the adapter computed from the venue's own book. A settled one is the
    // settlement value and counts as claimable, not as value.
    value: status === "open" && markIsBid ? value : null,
    valueBasis: status === "open" && markIsBid && value !== null ? "bid" : "none",
    valueNote: status === "open" && !(markIsBid && value !== null) ? "No executable price: the market is paused, one-sided or has no bids." : null,
    claimable: settled ? value : null,
    claimSource: settled && value !== null ? "settlement" : "none",
    claimNote: settled ? "Computed from the market's settlement, not from a venue-reported figure." : null,
    cost: qtyOf(unit, position.cost.total),
    pnl: qtyOf(unit, position.pnl.total),
    pnlSource: position.pnl.source,
  });
}

async function readPascal(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>): Promise<VenueReadOutcome> {
  const result = await ctx.adapters.pascal().positionsByAddress(plan.address, { bindingId: plan.binding.id });
  const rows = result.positions.flatMap((position) => {
    const row = sharedRow(position, plan, "usd", "USDC", "contracts");
    return row === null ? [] : [row];
  });
  const facts: Array<{ label: string; value: Qty | null; symbol: string }> = [];
  if (result.account !== null) {
    facts.push({ label: "Pascal collateral", value: qtyOfDec("usd", result.account.collateralUsd), symbol: "USDC" });
    facts.push({ label: "Pascal pending deposits", value: qtyOfDec("usd", result.account.pendingDepositsUsd), symbol: "USDC" });
  }
  return {
    kind: "ok",
    venue: "pascal",
    bindingId: plan.binding.id,
    bindingLabel: plan.binding.label,
    holder: plan.address,
    rows,
    rejected: 0,
    notListed: result.registered ? [] : ["Pascal has no account for this address. That is an answer, not an error."],
    notes: ["A short position is marked at one minus the best ask, which is the bid of its own side."],
    prov: result.prov,
    partial: false,
    facts,
    resolution: { source: "pasted", address: plan.address, candidate: null },
  };
}

async function readTrueo(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>): Promise<VenueReadOutcome> {
  const result = await ctx.adapters.trueo().positionsByAddress(plan.address, { bindingId: plan.binding.id });
  const disagree = new Set(result.claims.filter((claim) => claim.venuePositionAgrees === false).map((claim) => claim.marketId));
  const rows = result.positions.flatMap((position) => {
    const row = sharedRow(position, plan, "tyd", "TYD", "shares");
    if (row === null) return [];
    return [disagree.has(position.market.marketId) ? { ...row, flags: [...row.flags, "Trueo's own position read differs from the token balances."] } : row];
  });
  return {
    kind: "ok",
    venue: "trueo",
    bindingId: plan.binding.id,
    bindingLabel: plan.binding.label,
    holder: plan.address,
    rows,
    rejected: 0,
    notListed: result.skipped.length === 0 ? [] : [`${result.skipped.length} markets were not read`],
    notes: ["Trueo amounts are in TYD, an ERC-4626 share, not in dollars. Values are what selling the whole holding would return now."],
    prov: rows[0]?.prov ?? readProv(ctx, "trueo", "eth_call:8453", "T0-RPC"),
    partial: result.skipped.length > 0,
    facts: [],
    resolution: { source: "pasted", address: plan.address, candidate: null },
  };
}

// ---- the fan-out ---------------------------------------------------------------------------------------------------------

async function runOne(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>): Promise<VenueReadOutcome> {
  switch (plan.venue) {
    case "xo":
      return readXo(ctx, plan);
    case "polymarket":
      return readPolymarket(ctx, plan);
    case "pascal":
      return readPascal(ctx, plan);
    case "trueo":
      return readTrueo(ctx, plan);
    default:
      return { kind: "unsupported", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, why: "This build has no position reader for this venue." };
  }
}

// Every read in parallel, each isolated: one throwing never changes another's outcome (M2-6).
export async function readAll(ctx: ReadContext, planned: readonly PlannedRead[]): Promise<VenueReadOutcome[]> {
  return Promise.all(
    planned.map(async (plan): Promise<VenueReadOutcome> => {
      if (plan.kind === "skip") return plan.outcome;
      try {
        return await runOne(ctx, plan);
      } catch (error) {
        const failure = failureOf(error);
        if (failure.unauthorized) return { kind: "not_paired", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label };
        if (failure.needsCockpit) return { kind: "needs_cockpit", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, what: "positions for this address" };
        return { kind: "failed", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, code: failure.code, retryAfterMs: failure.retryAfterMs };
      }
    }),
  );
}

export function okOutcomes(outcomes: readonly VenueReadOutcome[]): VenueReadOk[] {
  return outcomes.filter((outcome): outcome is VenueReadOk => outcome.kind === "ok");
}
