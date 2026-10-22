// Per-venue position reads (docs/dapp-design.md 4.6; acceptance M2-5, M2-6, M2-7; docs/sdk-and-api-design.md section 9
// step 6).
//
// Each reader turns one venue's answer into PortfolioRow[] and NEVER throws: a failure becomes a `failed` outcome
// for that venue and that address only, so the other venues keep rendering (M2-6). XO, Polymarket and Limitless are
// read from the chain alone (chain-reads.ts: pinned ledgers over the public RPCs, no venue API); Pascal and Trueo
// through their venue adapters, which take the same injected fetch. A Polymarket signer's address also yields the
// wallets Polymarket created for it, derived and confirmed on chain (sdk/chain/polymarket/wallets.ts), one outcome each.

import type { AdapterError, Book, MarketSummary, Prov, Result, TokenRef, Transport, VenueId } from "../../core/ports";
import { qtyOfDec, type Qty } from "../../core/money";
import { untrustedField } from "../../core/untrusted";
import type { AdapterDeps } from "../../core/ports";
import { createPascalAdapter, type PascalAdapter } from "@sdk/venues/pascal";
import { createTrueoAdapter, type TrueoAdapter } from "@sdk/venues/trueo";
import type { VenuePosition as SharedVenuePosition } from "@sdk/venues/pascal";
import { makeProv } from "../../core/venue-policy";
import { errorText } from "../../ui/Tiles";
import { failureOf } from "../wallet/failure";
import { findPolymarketWallets, POLYMARKET_WALLET_KIND_TEXT, type PolymarketWalletCheck } from "@sdk/chain/polymarket/wallets";
import type { Address } from "@sdk/chain/rpc";
import { CHAIN_OF, createChainSession, readChainHoldings, type ChainSession, type ChainVenue } from "./chain-reads";
import { makeRow, qtyOf } from "./rows";
import type { PlannedRead } from "./targets";
import { bidMark } from "./valuation";
import { FLAG_READS_DISAGREE } from "./xo-reads";
import type { PortfolioRow, RowStatus, VenueReadOk, VenueReadOutcome } from "./types";

// What the readers need from each adapter: positions only. Narrow on purpose, so a test supplies one method and not a
// whole adapter. `chain` hands out one JSON-RPC session (port and pin guard) per chain for the chain readers; without
// it a session is built for each read.
export interface PortfolioAdapters {
  trueo(): Pick<TrueoAdapter, "positionsByAddress">;
  pascal(): Pick<PascalAdapter, "positionsByAddress">;
  chain?(chainId: number): ChainSession | null;
}

// Lazily created, one instance each, so an adapter's own cache (Pascal's 6 MB snapshot) and a chain session's pin
// checks live as long as the page.
export function createPortfolioAdapters(deps: AdapterDeps, mode: "standalone" | "cockpit"): PortfolioAdapters {
  let trueo: TrueoAdapter | undefined;
  let pascal: PascalAdapter | undefined;
  const sessions = new Map<number, ChainSession | null>();
  return {
    trueo: () => (trueo ??= createTrueoAdapter(deps)),
    pascal: () => (pascal ??= createPascalAdapter(deps, { transport: mode === "cockpit" ? "T1" : "T0" })),
    chain: (chainId) => {
      if (!sessions.has(chainId)) sessions.set(chainId, createChainSession(deps, chainId));
      return sessions.get(chainId) ?? null;
    },
  };
}

export interface ReadContext {
  readonly deps: AdapterDeps;
  readonly adapters: PortfolioAdapters;
  readonly mode: "standalone" | "cockpit";
  // The market rows this page has loaded: where the chain readers take their candidate token ids, titles and outcome
  // names from. Empty when none are loaded yet.
  readonly known?: readonly MarketSummary[];
}

export const MAX_MARKED_ROWS_PER_VENUE = 40;
const POSITIONS_TTL_MS = 30_000;

// Provenance for an answer that has no rows to carry it (an empty account is an answer, with a time and a route).
function readProv(ctx: ReadContext, venue: VenueId, source: string, transport: Transport): Prov {
  const now = ctx.deps.nowMs();
  return makeProv({ venue, source, fetchedAtMs: now, nowMs: now, ttlMs: POSITIONS_TTL_MS, transport });
}

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

// ---- XO, Polymarket and Limitless: the chain ---------------------------------------------------------------------------

function sessionOf(ctx: ReadContext, venue: ChainVenue): ChainSession | null {
  return ctx.adapters.chain?.(CHAIN_OF[venue]) ?? createChainSession(ctx.deps, CHAIN_OF[venue]);
}

function noRpc(plan: Extract<PlannedRead, { kind: "run" }>): VenueReadOutcome {
  return { kind: "unsupported", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, why: "This build names no public RPC for the venue's chain." };
}

async function readChain(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>, venue: ChainVenue): Promise<VenueReadOutcome> {
  const session = sessionOf(ctx, venue);
  if (session === null) return noRpc(plan);
  return readChainHoldings(ctx.deps, session, venue, plan, ctx.known ?? []);
}

// ---- Polymarket: a signer's own address and the wallets derived from it -------------------------------------------------

const NO_WALLET = "No Polymarket wallet found for this signer.";

function walletLine(check: PolymarketWalletCheck, readElsewhere: boolean): string {
  const name = `${POLYMARKET_WALLET_KIND_TEXT[check.kind]} ${check.address}`;
  if (check.state !== "found") return `${name}: ${check.why ?? "not read."}`;
  return readElsewhere ? `${name}: found on chain; it is read under its own saved entry.` : `${name}: found on chain and read in its own section.`;
}

// The signer's own address is read as before; then its proxy wallet, Safe and Deposit Wallet are derived, each checked
// on chain (deployed with its factory's code, and for a Safe or Deposit Wallet owned by the signer), and every one found
// is read as its own outcome. None found is said in words, never shown as an empty table. `elsewhere` holds the
// addresses already read under their own saved entry, which are not read twice.
async function readPolymarketSigner(ctx: ReadContext, plan: Extract<PlannedRead, { kind: "run" }>, elsewhere: ReadonlySet<string>): Promise<VenueReadOutcome[]> {
  const session = sessionOf(ctx, "polymarket");
  if (session === null) return [noRpc(plan)];
  const known = ctx.known ?? [];
  const own = await settle(plan, () => readChainHoldings(ctx.deps, session, "polymarket", plan, known));
  let checks: readonly PolymarketWalletCheck[];
  try {
    checks = await findPolymarketWallets(session.port, plan.address as Address, { guard: session.guard });
  } catch (error) {
    // The page draws one tile per kind of outcome for an entry, so a second failure of the same kind is not repeated.
    const failed = failureOutcome(plan, error);
    return own.kind === failed.kind ? [own] : [own, failed];
  }
  const found = checks.filter((check) => check.state === "found");
  const lines = checks.map((check) => walletLine(check, elsewhere.has(check.address.toLowerCase())));
  const outcomes: VenueReadOutcome[] = [own.kind === "ok" ? { ...own, notes: [...own.notes, ...lines] } : own];
  const reads = found
    .filter((check) => !elsewhere.has(check.address.toLowerCase()))
    .map((check) => {
      const walletPlan = { ...plan, address: check.address };
      return settle(walletPlan, () => readChainHoldings(ctx.deps, session, "polymarket", walletPlan, known, { kind: check.kind, signer: plan.address }));
    });
  outcomes.push(...(await Promise.all(reads)));
  if (found.length === 0) {
    outcomes.push({
      kind: "unresolved",
      venue: "polymarket",
      bindingId: plan.binding.id,
      bindingLabel: plan.binding.label,
      why: `${NO_WALLET} Its proxy wallet, Safe and Deposit Wallet were derived from the address and checked on Polygon, with no Polymarket API: ${lines.join(" ")} If Polymarket shows you a wallet address, save it as its own entry.`,
    });
  }
  return outcomes;
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
    case "polymarket":
    case "limitless":
      return readChain(ctx, plan, plan.venue);
    case "pascal":
      return readPascal(ctx, plan);
    case "trueo":
      return readTrueo(ctx, plan);
    default:
      return { kind: "unsupported", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, why: "This build has no position reader for this venue." };
  }
}

// A thrown read, as the outcome of that venue and address only.
function failureOutcome(plan: Extract<PlannedRead, { kind: "run" }>, error: unknown): VenueReadOutcome {
  const failure = failureOf(error);
  if (failure.unauthorized) return { kind: "not_paired", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label };
  if (failure.needsCockpit) return { kind: "needs_cockpit", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, what: "positions for this address" };
  return { kind: "failed", venue: plan.venue, bindingId: plan.binding.id, bindingLabel: plan.binding.label, code: failure.code, retryAfterMs: failure.retryAfterMs };
}

async function settle(plan: Extract<PlannedRead, { kind: "run" }>, read: () => Promise<VenueReadOutcome>): Promise<VenueReadOutcome> {
  try {
    return await read();
  } catch (error) {
    return failureOutcome(plan, error);
  }
}

// Every read in parallel, each isolated: one throwing never changes another's outcome (M2-6). A Polymarket signer's
// read can give several outcomes (its own address and each wallet derived from it), in that order.
export async function readAll(ctx: ReadContext, planned: readonly PlannedRead[]): Promise<VenueReadOutcome[]> {
  const elsewhere = new Set(planned.flatMap((plan) => (plan.kind === "run" && plan.venue === "polymarket" ? [plan.address.toLowerCase()] : [])));
  const groups = await Promise.all(
    planned.map(async (plan): Promise<VenueReadOutcome[]> => {
      if (plan.kind === "skip") return [plan.outcome];
      if (plan.venue === "polymarket" && plan.binding.kind === "eoa") return readPolymarketSigner(ctx, plan, elsewhere);
      return [await settle(plan, () => runOne(ctx, plan))];
    }),
  );
  return groups.flat();
}

export function okOutcomes(outcomes: readonly VenueReadOutcome[]): VenueReadOk[] {
  return outcomes.filter((outcome): outcome is VenueReadOk => outcome.kind === "ok");
}
