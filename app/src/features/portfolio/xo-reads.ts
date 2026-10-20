// XO positions by Kernel account (docs/dapp-design.md 4.3, 4.6; acceptance M2-5, M2-6).
//
// XO keys positions by the SMART ACCOUNT, never by the owner EOA (18 of 18 owner lookups returned no account), so
// the only address ever asked about here is the account derived from the owner.
//
//   Standalone build  the Data API `/users/portfolio` (CORS-open): titles, cost, the venue's own value. No order
//                     books, so nothing is marked: value is null with the reason "needs the Cockpit".
//   Cockpit build     adds the orderbook `/positions` (the authoritative holdings read, micro-shares), `/claimable`
//                     and the registry check. Sizes from the two reads are compared; a disagreement is flagged and
//                     the row is not marked.
//
// The populated shape of both reads was never observed live (DT8): the parsers are strict about what they read, a
// row that does not match is counted and dropped, and every row is labelled "synthetic-shape tested". Units: the
// Data API and the orderbook send micro-shares and micro-USDC.e integers; they become exact quantities here at
// once (fromMicro), and the venue's JSON numbers go through decFromNumber, never through float arithmetic.

import * as z from "zod/v4";

import { AdapterException } from "../../core/errors";
import { decFromNumber, fromMicro, negQty, notional, parseQty, signOf, subQty, type Qty } from "../../core/money";
import type { AdapterDeps, Prov } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import { makeProv } from "../../core/venue-policy";
import { XO_DATA_ORIGIN, XO_ORDERBOOK_ORIGIN } from "../../venues/xo";
import { getJson } from "./http";
import { shapeEvidenceOf } from "./shape";
import type { PortfolioRow, RowStatus } from "./types";

export const XO_COLLATERAL_UNIT = "usdc_e" as const;
export const XO_POSITIONS_TTL_MS = 30_000;
// Two scopes, because the default scope returns only the legacy AMM slice: onlyClob (types 2 and 3) and withPulse
// (the only scope that returns the user-created Conviction type 4). Rows are de-duplicated by token id.
export const XO_PORTFOLIO_SCOPES = ["onlyClob", "withPulse"] as const;
export const XO_PORTFOLIO_TAKE = 50;
export const XO_PORTFOLIO_MAX_PAGES = 3;
export const FLAG_READS_DISAGREE = "XO's two reads disagree about this size, so it is not priced.";

const tokenId = z.string().regex(/^[1-9][0-9]{0,77}$/);
const conditionId = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const micro = z.string().regex(/^(0|[1-9][0-9]{0,40})$/);
const decimalish = z.union([z.number(), z.string().max(60), z.null()]).optional();

const positionSchema = z.looseObject({
  shareAmount: micro,
  collateralAmount: micro.nullish(),
  entryValue: decimalish,
  currentValue: decimalish,
  pnl: decimalish,
  hasClaimed: z.boolean().nullish(),
  outcome: z.looseObject({ title: z.string().max(500).nullish(), outcomeTokenId: tokenId.nullish() }).nullish(),
});
const entrySchema = z.looseObject({
  contractMarketId: conditionId,
  title: z.string().max(1000),
  status: z.string().max(40),
  winningOutcomeId: z.union([z.number().int(), z.null()]).optional(),
  positions: z.array(z.unknown()).max(100),
});
const portfolioSchema = z.looseObject({
  data: z.array(z.unknown()).max(200),
  meta: z.looseObject({ hasNextPage: z.boolean().optional() }).optional(),
});
const orderbookPositions = z.looseObject({
  cash_balance: micro,
  positions: z.array(z.looseObject({ token_id: tokenId, balance: micro, reserved: micro })).max(1000),
});
const claimableSchema = z.looseObject({
  claimable: z.array(z.looseObject({ market_id: conditionId, outcome: z.enum(["Yes", "No"]), token_id: tokenId, balance: micro, refund_reason: z.string().max(64) })).max(1000),
});

export function portfolioUrl(account: string, scope: (typeof XO_PORTFOLIO_SCOPES)[number], page: number): string {
  const query = new URLSearchParams({ user: account, take: String(XO_PORTFOLIO_TAKE), page: String(page), marketScope: scope });
  return `${XO_DATA_ORIGIN}/api/users/portfolio?${query.toString()}`;
}

export function orderbookUrl(path: "/positions" | "/claimable", account: string): string {
  return `${XO_ORDERBOOK_ORIGIN}${path}?address=${account}`;
}

export const FLAG_UNIT_UNCONFIRMED = "XO's value and profit-and-loss figures for this position are not shown: their unit (dollars or micro-units) could not be confirmed from the same answer.";

// The Data API's money fields come in two possible units and no recorded answer says which (DT8). `collateralAmount`
// is a micro-unit integer string. `entryValue` is the same quantity as the cost, so comparing the two settles the
// family of units the answer uses: equal to the cost in dollars means dollars; equal to the cost in micro-units means
// micro-units. Anything else (no entry value, or one that matches neither) leaves the unit unconfirmed, and then
// `currentValue` and `pnl` are not shown at all rather than guessed at.
type MoneyUnit = "dollars" | "micro";

function textOfMoney(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? decFromNumber(value) : typeof value === "string" ? value : null;
}

function unitOfPosition(collateralAmount: string | null | undefined, entryValue: unknown): MoneyUnit | null {
  if (collateralAmount === null || collateralAmount === undefined) return null;
  const cost = fromMicro(XO_COLLATERAL_UNIT, collateralAmount);
  // The same digits read as dollars: what `entryValue` would be if it were sent in micro-units too.
  const costDigits = parseQty(XO_COLLATERAL_UNIT, collateralAmount);
  const entryText = textOfMoney(entryValue);
  const entry = entryText === null ? null : parseQty(XO_COLLATERAL_UNIT, entryText);
  if (cost === null || costDigits === null || entry === null || cost.atomic === 0n) return null;
  const same = (a: Qty, b: Qty): boolean => subQty(a, b).atomic === 0n;
  if (same(entry, cost)) return "dollars";
  return same(entry, costDigits) ? "micro" : null;
}

// A figure in the confirmed unit, exact. Micro-unit text must be an integer string (a sign is allowed for PnL).
function moneyIn(unit: MoneyUnit, value: unknown): Qty | null {
  const text = textOfMoney(value);
  if (text === null) return null;
  if (unit === "dollars") return parseQty(XO_COLLATERAL_UNIT, text, { allowNegative: true });
  const negative = text.startsWith("-");
  const micro = fromMicro(XO_COLLATERAL_UNIT, negative ? text.slice(1) : text);
  return micro === null ? null : negative ? negQty(micro) : micro;
}

function statusOf(raw: string, winningOutcomeId: number | null | undefined): RowStatus {
  switch (raw.toUpperCase()) {
    case "ACTIVE":
    case "PAUSED":
      return "open";
    case "RESOLVED":
      return "resolved_unclaimed";
    case "CLOSED":
      // Closed with a winner is settled; closed without one is waiting for resolution.
      return winningOutcomeId === null || winningOutcomeId === undefined ? "closed" : "resolved_unclaimed";
    case "VOIDED":
      return "voided_refund";
    default:
      // PENDING, CANCELLED and anything new: not guessed at.
      return "unknown";
  }
}

export interface XoRowContext {
  readonly bindingId: string;
  readonly account: string;
  readonly nowMs: number;
  readonly prov: Prov;
}

export interface XoRead {
  readonly rows: PortfolioRow[];
  readonly rejected: number;
  readonly notListed: string[];
  readonly notes: string[];
  readonly partial: boolean;
  // null: not read (the standalone build never reads it).
  readonly cash: Qty | null;
  readonly profile: "found" | "none";
  // Where and when this was read, for the provenance strip even when there are no rows.
  readonly prov: Prov;
}

function blank(ctx: XoRowContext, base: { id: string; market: string; outcome: string | null; tokenId: string | null; qty: Qty | null; status: RowStatus }): PortfolioRow {
  return {
    id: base.id,
    venue: "xo",
    bindingId: ctx.bindingId,
    holder: ctx.account,
    market: untrustedField("title", base.market, "xo"),
    outcome: base.outcome === null ? null : untrustedField("outcome", base.outcome, "xo"),
    tokenId: base.tokenId,
    qty: base.qty,
    free: null,
    reserved: null,
    status: base.status,
    collateral: XO_COLLATERAL_UNIT,
    collateralSymbol: "USDC.e",
    value: null,
    valueBasis: "none",
    valueNote: null,
    claimable: null,
    claimSource: "none",
    claimNote: null,
    cost: null,
    pnl: null,
    pnlSource: "unavailable",
    reference: null,
    shape: shapeEvidenceOf("xo"),
    flags: [],
    prov: ctx.prov,
  };
}

// ---- the Data API ---------------------------------------------------------------------------------------------------

interface Counters {
  rejected: number;
  readonly notListed: string[];
  readonly notes: string[];
}

async function readPortfolio(deps: AdapterDeps, ctx: XoRowContext, read: Counters): Promise<{ rows: Map<string, PortfolioRow>; partial: boolean; found: boolean }> {
  const rows = new Map<string, PortfolioRow>();
  let partial = false;
  let found = false;
  let anyScopeOk = false;
  let lastError: unknown;
  for (const scope of XO_PORTFOLIO_SCOPES) {
    try {
      for (let page = 1; page <= XO_PORTFOLIO_MAX_PAGES; page += 1) {
        const answer = await getJson(deps, portfolioUrl(ctx.account, scope, page), { notFoundIsAnswer: true });
        // 404: XO has no profile for this account. That is an answer (it has not traded), not an error.
        if (answer.status === "not_found") break;
        found = true;
        const envelope = portfolioSchema.safeParse(answer.body);
        if (!envelope.success) throw new AdapterException("SCHEMA_DRIFT", "portfolio_envelope");
        let usable = 0;
        for (const raw of envelope.data.data) {
          const entry = entrySchema.safeParse(raw);
          if (!entry.success) {
            read.rejected += 1;
            continue;
          }
          usable += 1;
          const status = statusOf(entry.data.status, entry.data.winningOutcomeId);
          entry.data.positions.forEach((rawPosition, index) => {
            const position = positionSchema.safeParse(rawPosition);
            if (!position.success) {
              read.rejected += 1;
              return;
            }
            const shares = fromMicro("shares", position.data.shareAmount);
            const token = position.data.outcome?.outcomeTokenId ?? null;
            if (shares === null) {
              read.rejected += 1;
              return;
            }
            if (position.data.hasClaimed === true) {
              read.notListed.push("a position that was already claimed");
              return;
            }
            if (shares.atomic === 0n) {
              read.notListed.push("a position with no shares");
              return;
            }
            const key = token ?? `${entry.data.contractMarketId}:${scope}:${page}:${index}`;
            if (rows.has(key)) return;
            const row = blank(ctx, {
              id: `xo:3223:${ctx.account}:${key}`,
              market: entry.data.title,
              outcome: position.data.outcome?.title ?? null,
              tokenId: token,
              qty: shares,
              status,
            });
            const unit = unitOfPosition(position.data.collateralAmount, position.data.entryValue);
            const hasFigures = textOfMoney(position.data.currentValue) !== null || textOfMoney(position.data.pnl) !== null;
            const pnl = unit === null ? null : moneyIn(unit, position.data.pnl);
            rows.set(key, {
              ...row,
              cost: position.data.collateralAmount === null || position.data.collateralAmount === undefined ? null : fromMicro(XO_COLLATERAL_UNIT, position.data.collateralAmount),
              reference: unit === null ? null : moneyIn(unit, position.data.currentValue),
              pnl,
              pnlSource: pnl === null ? "unavailable" : "venue_reported",
              flags: unit === null && hasFigures ? [FLAG_UNIT_UNCONFIRMED] : row.flags,
            });
          });
        }
        if (envelope.data.data.length > 0 && usable === 0) throw new AdapterException("SCHEMA_DRIFT", "portfolio_rows");
        if (envelope.data.meta?.hasNextPage !== true) break;
        if (page === XO_PORTFOLIO_MAX_PAGES) partial = true;
      }
      // A scope counts as read only when it finished without an error (a 404 "no profile" is a finished read).
      anyScopeOk = true;
    } catch (error) {
      lastError = error;
      read.notes.push(`XO's portfolio read for the "${scope}" scope failed, so this list may be missing positions.`);
      partial = true;
    }
  }
  // Every scope failing is a failure of the whole read; one failing is a partial answer.
  if (!anyScopeOk) throw lastError instanceof Error ? lastError : new AdapterException("TIMEOUT", "portfolio");
  return { rows, partial, found };
}

// ---- the orderbook (Cockpit only) ----------------------------------------------------------------------------------

async function readOrderbookPositions(deps: AdapterDeps, ctx: XoRowContext): Promise<{ cash: Qty | null; positions: Array<{ tokenId: string; balance: Qty; reserved: Qty }> }> {
  const answer = await getJson(deps, orderbookUrl("/positions", ctx.account));
  if (answer.status !== "ok") throw new AdapterException("NOT_FOUND", "positions");
  const parsed = orderbookPositions.safeParse(answer.body);
  if (!parsed.success) throw new AdapterException("SCHEMA_DRIFT", "positions_shape");
  const positions: Array<{ tokenId: string; balance: Qty; reserved: Qty }> = [];
  for (const row of parsed.data.positions) {
    const balance = fromMicro("shares", row.balance);
    const reserved = fromMicro("shares", row.reserved);
    if (balance === null || reserved === null || reserved.atomic > balance.atomic) throw new AdapterException("SCHEMA_DRIFT", "positions_row");
    positions.push({ tokenId: row.token_id, balance, reserved });
  }
  return { cash: fromMicro(XO_COLLATERAL_UNIT, parsed.data.cash_balance), positions };
}

async function readClaimable(deps: AdapterDeps, ctx: XoRowContext) {
  const answer = await getJson(deps, orderbookUrl("/claimable", ctx.account));
  if (answer.status !== "ok") throw new AdapterException("NOT_FOUND", "claimable");
  const parsed = claimableSchema.safeParse(answer.body);
  if (!parsed.success) throw new AdapterException("SCHEMA_DRIFT", "claimable_shape");
  return parsed.data.claimable;
}

const ONE = parseQty("price", "1");

// ---- the whole read ---------------------------------------------------------------------------------------------------

export async function readXoAccount(deps: AdapterDeps, input: { readonly bindingId: string; readonly account: string; readonly cockpit: boolean }): Promise<XoRead> {
  const nowMs = deps.nowMs();
  const prov = makeProv({ venue: "xo", source: "xo_data:/users/portfolio", fetchedAtMs: nowMs, nowMs, ttlMs: XO_POSITIONS_TTL_MS, transport: input.cockpit ? "T1" : "T0" });
  const ctx: XoRowContext = { bindingId: input.bindingId, account: input.account, nowMs, prov };
  const read: Counters = { rejected: 0, notListed: [], notes: [] };

  const portfolio = await readPortfolio(deps, ctx, read);
  const rows = portfolio.rows;
  let partial = portfolio.partial;

  if (!input.cockpit) {
    read.notes.push("Order books, what XO says is claimable and the registry are read through the Cockpit only, so positions are listed here without a price.");
    return { ...read, rows: [...rows.values()], partial, cash: null, profile: portfolio.found ? "found" : "none", prov };
  }

  // Cockpit: the orderbook's positions are the authoritative holdings read. A failure here is a partial answer for
  // that read only; the Data API rows stay.
  const orderbookProv = makeProv({ venue: "xo", source: "xo_orderbook:/positions", fetchedAtMs: nowMs, nowMs, ttlMs: XO_POSITIONS_TTL_MS, transport: "T1" });
  let cash: Qty | null = null;
  try {
    const book = await readOrderbookPositions(deps, ctx);
    cash = book.cash;
    for (const held of book.positions) {
      if (held.balance.atomic === 0n) continue;
      const existing = rows.get(held.tokenId);
      if (existing === undefined) {
        // Held but unknown to the Data API read: no market information, so no status. Fail closed.
        rows.set(held.tokenId, {
          ...blank({ ...ctx, prov: orderbookProv }, { id: `xo:3223:${ctx.account}:${held.tokenId}`, market: "Unknown market", outcome: null, tokenId: held.tokenId, qty: held.balance, status: "unknown" }),
          free: subShares(held.balance, held.reserved),
          reserved: held.reserved,
          valueNote: "XO's order book lists this token but the Data API does not describe its market, so its state is not known.",
        });
        continue;
      }
      const agrees = existing.qty !== null && existing.qty.atomic === held.balance.atomic && existing.qty.scale === held.balance.scale;
      rows.set(held.tokenId, {
        ...existing,
        qty: held.balance,
        free: subShares(held.balance, held.reserved),
        reserved: held.reserved,
        flags: agrees ? existing.flags : [...existing.flags, FLAG_READS_DISAGREE],
      });
    }
    // A Data API row for a token the orderbook does not list: the two reads disagree about it.
    const listed = new Set(book.positions.filter((held) => held.balance.atomic > 0n).map((held) => held.tokenId));
    for (const [key, row] of rows) {
      if (row.tokenId !== null && !listed.has(row.tokenId) && row.status === "open") rows.set(key, { ...row, flags: [...row.flags, FLAG_READS_DISAGREE] });
    }
  } catch (error) {
    read.notes.push("XO's order book holdings could not be read, so sizes come from the Data API only.");
    partial = true;
    if (rows.size === 0 && !portfolio.found) throw error;
  }

  try {
    for (const claim of await readClaimable(deps, ctx)) {
      const balance = fromMicro("shares", claim.balance);
      if (balance === null || balance.atomic === 0n) continue;
      const existing = rows.get(claim.token_id);
      const base = existing ?? blank({ ...ctx, prov: orderbookProv }, { id: `xo:3223:${ctx.account}:${claim.token_id}`, market: "Unknown market", outcome: claim.outcome, tokenId: claim.token_id, qty: balance, status: "unknown" });
      const winner = claim.refund_reason === "resolved_winner";
      const voided = claim.refund_reason === "voided_refund";
      rows.set(claim.token_id, {
        ...base,
        status: winner ? "claimable" : voided ? "voided_refund" : "resolved_unclaimed",
        // A winning share pays one USDC.e. A voided market's refund rule is free text that is not parsed here.
        claimable: winner && ONE !== null ? notional(balance, ONE, XO_COLLATERAL_UNIT) : null,
        claimSource: winner ? "settlement" : "none",
        claimNote: winner
          ? "A hint from XO. Redeeming works on chain only once the market has resolved there."
          : voided
            ? "The market was voided. XO's refund rule is not read here, so no amount is claimed."
            : "XO did not give a reason this app recognises, so no amount is claimed.",
      });
    }
  } catch {
    read.notes.push("What XO says is claimable could not be read, so settled positions show no claimable amount.");
    partial = true;
  }

  return { ...read, rows: [...rows.values()], partial, cash, profile: portfolio.found || rows.size > 0 ? "found" : "none", prov: cash === null ? prov : orderbookProv };
}

// balance minus reserved, in shares; null if reserved exceeds balance (already refused when the answer is parsed).
function subShares(balance: Qty, reserved: Qty): Qty | null {
  const free = subQty(balance, reserved);
  return signOf(free) < 0 ? null : free;
}
