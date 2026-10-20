// Runs one parsed command and returns what to show. The only code in the terminal that calls the daemon.
//
// Rules this file keeps:
//   - a command is a fixed plan of read calls (markets, market, book, positions) or no call at all (help, wallet,
//     signals, audit, clear); there is no path from typed text to a tool name or to a tool argument that the grammar
//     and the tools.ts builders did not produce;
//   - every tool answer is validated against its schema before anything is read from it; a failure is a result of
//     its own (a "schema violation" with the raw answer kept as plain text), never a partial table;
//   - the cross-checks an adapter would do are done here too: an answer for another market or another token is
//     refused, and order-book levels must already be best-first;
//   - money and share amounts stay exact decimal strings; sums and differences use core/money, never Number;
//   - an unknown is shown as unknown ("n/a"), never as 0.

import type { StatusResponse } from "@bridge/contract";

import type { z } from "zod/v4";

import { deriveKernelAccount } from "../../core/account";
import type { AddressBinding } from "../../core/bindings";
import { cmpQty, parseQty, subQty, toDec } from "../../core/money";
import type { VenueId } from "../../core/ports";
import { untrusted, type Untrusted } from "../../core/untrusted";
import { DaemonError, type DaemonClient } from "./client";
import { failure, type Failure, type ViolationDetail } from "./failure";
import type { BookSide, Command, CommandName } from "./grammar";
import type { AuditRow } from "./observer";
import type { StreamState } from "./stream";
import {
  TOOL_OUTPUT_SCHEMAS,
  marketArgs,
  orderbookArgs,
  positionsArgs,
  searchArgs,
  type BookQuote,
  type MarketOutput,
  type OrderbookOutput,
  type PositionsOutput,
  type SearchOutput,
  type TerminalTool,
  type ToolArgs,
} from "./tools";

// ---- the transcript's records --------------------------------------------------------------------------------------------------

export interface CallRecord {
  readonly id: number;
  // "xo_search" or "GET /ui/status": fixed text, never user or market text.
  readonly label: string;
  readonly args: ToolArgs | null;
  readonly status: "running" | "ok" | "failed" | "violation";
  readonly durationMs: number | null;
  readonly failure: Failure | null;
  // The plugin's text block and, for a violation, the raw answer. Untrusted: shown collapsed inside the slot.
  readonly text: Untrusted<string> | null;
  readonly raw: Untrusted<string> | null;
}

export const RAW_KEEP_CHARS = 4000;

// ---- views ---------------------------------------------------------------------------------------------------------------------

export interface LevelView {
  readonly price: string;
  readonly size: string;
  readonly cumulative: string;
}

// none: one side is empty, so there is no spread. book: both sides present and not crossed. crossed: the best bid is
// at or above the best ask (a fault or a stale read), shown as that and never as a spread.
export type SpreadTier = { readonly tier: "none" } | { readonly tier: "crossed" } | { readonly tier: "book"; readonly spread: string };

export interface BookView {
  readonly slot: "yes" | "no";
  readonly tokenId: string;
  readonly active: boolean | null;
  readonly bids: readonly LevelView[];
  readonly asks: readonly LevelView[];
  readonly totalLevels: { readonly bids: number; readonly asks: number };
  readonly cut: boolean;
  readonly spread: SpreadTier;
  readonly quote: BookQuote;
  readonly tick: string;
  readonly timestamp: string | null;
}

export interface BookResult {
  readonly slot: "yes" | "no";
  readonly view: BookView | null;
  readonly failure: Failure | null;
}

export interface WalletRow {
  readonly id: string;
  readonly label: Untrusted<string>;
  readonly kind: string;
  readonly chain: string;
  readonly address: string | null;
  readonly status: string;
  readonly venues: readonly VenueId[];
  readonly source: string;
  // The XO account an owner address derives to; an error in words when it cannot be derived; null for kinds that
  // are not owners.
  readonly derived: { readonly account: string } | { readonly problem: string } | null;
}

export type Outcome =
  | { readonly kind: "help"; readonly topic: CommandName | null }
  | { readonly kind: "status"; readonly status: StatusResponse }
  | { readonly kind: "markets"; readonly query: string; readonly data: SearchOutput }
  | { readonly kind: "market"; readonly data: MarketOutput }
  | { readonly kind: "book"; readonly market: MarketOutput; readonly books: readonly BookResult[] }
  | { readonly kind: "positions"; readonly data: PositionsOutput; readonly source: "typed" | "saved" }
  | { readonly kind: "positions_target"; readonly problem: "none" | "many" | "unusable"; readonly candidates: readonly string[] }
  | { readonly kind: "wallet"; readonly rows: readonly WalletRow[]; readonly persistence: "indexeddb" | "memory" | "unknown" }
  | { readonly kind: "signals" }
  | { readonly kind: "audit"; readonly rows: readonly AuditRow[]; readonly connection: StreamState | "idle" }
  | { readonly kind: "clear" }
  | { readonly kind: "failure"; readonly failure: Failure };

export interface ExecContext {
  readonly client: Pick<DaemonClient, "status" | "callTool">;
  readonly signal: AbortSignal;
  readonly nowMs: () => number;
  readonly loadBindings: () => Promise<{ readonly bindings: readonly AddressBinding[]; readonly persistence: "indexeddb" | "memory" | "unknown" }>;
  readonly audit: () => { readonly rows: readonly AuditRow[]; readonly connection: StreamState | "idle" };
  // Upserts one call record into the transcript (by id).
  readonly onCall: (record: CallRecord) => void;
  // The daemon refused the page's token.
  readonly onUnauthorized: () => void;
  readonly nextCallId: () => number;
}

// ---- one call ------------------------------------------------------------------------------------------------------------------

type CallResult<T> = { readonly ok: true; readonly data: T; readonly callId: number; readonly structured: unknown } | { readonly ok: false; readonly failure: Failure };

function failureOfError(error: unknown, ctx: ExecContext, tool: string): Failure {
  if (error instanceof DaemonError) {
    if (error.code === "unauthorized") ctx.onUnauthorized();
    switch (error.code) {
      case "not_paired":
        return failure("not_paired", { tool });
      case "unauthorized":
        return failure("session_expired", { tool, bridgeCode: error.bridgeCode });
      case "refused":
        return failure("daemon_refused", { tool, bridgeCode: error.bridgeCode, retryAfterS: error.retryAfterS });
      case "network":
      case "timeout":
      case "aborted":
      case "too_large":
      case "bad_response":
        return failure(error.code, { tool });
    }
  }
  return failure("network", { tool });
}

function rawText(value: unknown): Untrusted<string> {
  let text: string;
  try {
    text = JSON.stringify(value) ?? "";
  } catch {
    text = "";
  }
  return untrusted(text.slice(0, RAW_KEEP_CHARS));
}

async function callTool<T>(ctx: ExecContext, tool: TerminalTool, args: ToolArgs, schema: z.ZodType<T>): Promise<CallResult<T>> {
  const id = ctx.nextCallId();
  const started = ctx.nowMs();
  const base = { id, label: tool, args, durationMs: null, failure: null, text: null, raw: null } as const;
  ctx.onCall({ ...base, status: "running" });
  const elapsed = (): number => Math.max(0, ctx.nowMs() - started);
  let answer;
  try {
    answer = await ctx.client.callTool(tool, args, ctx.signal);
  } catch (error) {
    const problem = failureOfError(error, ctx, tool);
    ctx.onCall({ ...base, status: "failed", durationMs: elapsed(), failure: problem });
    return { ok: false, failure: problem };
  }
  const text = answer.text === null ? null : untrusted(answer.text);
  if (!answer.ok) {
    const problem = failure("tool_error", { tool, bridgeCode: answer.error?.code ?? null });
    ctx.onCall({ ...base, status: "failed", durationMs: answer.durationMs, failure: problem, text });
    return { ok: false, failure: problem };
  }
  const parsed = schema.safeParse(answer.structured);
  if (!parsed.success) {
    const problem = failure("schema_violation", { tool, detail: "shape" });
    ctx.onCall({ ...base, status: "violation", durationMs: answer.durationMs, failure: problem, text, raw: rawText(answer.structured) });
    return { ok: false, failure: problem };
  }
  ctx.onCall({ ...base, status: "ok", durationMs: answer.durationMs, text });
  return { ok: true, data: parsed.data, callId: id, structured: answer.structured };
}

// A cross-check failed after a call that validated: the answer is real but is not the answer to our question.
function markViolation(ctx: ExecContext, call: { readonly callId: number; readonly structured: unknown }, tool: TerminalTool, args: ToolArgs, detail: Exclude<ViolationDetail, "shape">): Failure {
  const problem = failure("schema_violation", { tool, detail });
  ctx.onCall({ id: call.callId, label: tool, args, status: "violation", durationMs: null, failure: problem, text: null, raw: rawText(call.structured) });
  return problem;
}

// ---- books -----------------------------------------------------------------------------------------------------------------------

function levelsView(levels: OrderbookOutput["bids"]): readonly LevelView[] {
  return levels.slice(0, 5).map((entry) => ({ price: entry.price, size: entry.size, cumulative: entry.cumulative_size }));
}

// Best-first, strictly: bids fall, asks rise. A book that is not is refused rather than re-sorted, because a
// re-sorted book hides that the source is not what it claims to be.
export function levelsInOrder(levels: OrderbookOutput["bids"], direction: "bids" | "asks"): boolean {
  for (let index = 1; index < levels.length; index += 1) {
    const before = parseQty("price", levels[index - 1]?.price);
    const after = parseQty("price", levels[index]?.price);
    if (before === null || after === null) return false;
    const order = cmpQty(before, after);
    if (direction === "bids" ? order <= 0 : order >= 0) return false;
  }
  return true;
}

export function spreadOf(quote: BookQuote): SpreadTier {
  const bid = quote.best_bid === null ? null : parseQty("price", quote.best_bid.price);
  const ask = quote.best_ask === null ? null : parseQty("price", quote.best_ask.price);
  if (bid === null || ask === null) return { tier: "none" };
  if (cmpQty(bid, ask) >= 0) return { tier: "crossed" };
  return { tier: "book", spread: toDec(subQty(ask, bid)) };
}

export function bookViewOf(output: OrderbookOutput, slot: "yes" | "no"): BookView {
  return {
    slot,
    tokenId: output.token_id,
    active: output.orderbook_active,
    bids: levelsView(output.bids),
    asks: levelsView(output.asks),
    totalLevels: output.levels_total,
    cut: output.truncated || output.bids.length > 5 || output.asks.length > 5,
    spread: spreadOf(output.quote),
    quote: output.quote,
    tick: output.tick_size,
    timestamp: output.quote.book_timestamp,
  };
}

async function readBook(ctx: ExecContext, market: MarketOutput, slot: "yes" | "no"): Promise<BookResult> {
  const outcome = market.market.outcomes.find((entry) => entry.slot === slot);
  if (outcome === undefined) return { slot, view: null, failure: failure("schema_violation", { tool: "xo_orderbook", detail: "shape" }) };
  const args = orderbookArgs(outcome.token_id);
  const result = await callTool(ctx, "xo_orderbook", args, TOOL_OUTPUT_SCHEMAS.xo_orderbook);
  if (!result.ok) return { slot, view: null, failure: result.failure };
  if (result.data.token_id !== outcome.token_id) return { slot, view: null, failure: markViolation(ctx, result, "xo_orderbook", args, "different_token") };
  if (result.data.condition_id.toLowerCase() !== market.market.condition_id.toLowerCase()) return { slot, view: null, failure: markViolation(ctx, result, "xo_orderbook", args, "different_market") };
  if (!levelsInOrder(result.data.bids, "bids") || !levelsInOrder(result.data.asks, "asks")) return { slot, view: null, failure: markViolation(ctx, result, "xo_orderbook", args, "levels_out_of_order") };
  return { slot, view: bookViewOf(result.data, slot), failure: null };
}

function slotsFor(side: BookSide): readonly ("yes" | "no")[] {
  return side === "both" ? ["yes", "no"] : [side];
}

// ---- wallet and positions (local, nothing is looked up) ---------------------------------------------------------------------------------

export function walletRowsOf(bindings: readonly AddressBinding[]): readonly WalletRow[] {
  return bindings.map((binding) => {
    let derived: WalletRow["derived"] = null;
    if (binding.kind === "eoa" && binding.address !== null) {
      const result = deriveKernelAccount(binding.address);
      derived = result.ok ? { account: result.account } : { problem: result.message };
    }
    return {
      id: binding.id,
      label: untrusted(binding.label),
      kind: binding.kind,
      chain: binding.chain,
      address: binding.address,
      status: binding.status,
      venues: binding.venues,
      source: binding.source,
      derived,
    };
  });
}

// The XO account to read when the user types no address: the account derived from each saved owner (or a saved
// Kernel account) that the user selected XO for. A saved address is not asked about any venue the user did not
// pick, so a binding without XO is not a candidate.
export function positionsTargetOf(bindings: readonly AddressBinding[]): { readonly accounts: readonly string[]; readonly unusable: number } {
  const accounts = new Set<string>();
  let unusable = 0;
  for (const binding of bindings) {
    if (!binding.venues.includes("xo") || binding.address === null) continue;
    if (binding.kind === "eoa") {
      const result = deriveKernelAccount(binding.address);
      if (result.ok) accounts.add(result.account.toLowerCase());
      else unusable += 1;
    } else if (binding.kind === "kernel" || binding.kind === "venue_account") {
      if (/^0x[0-9a-fA-F]{40}$/.test(binding.address)) accounts.add(binding.address.toLowerCase());
      else unusable += 1;
    }
  }
  return { accounts: [...accounts].sort(), unusable };
}

// ---- the commands ----------------------------------------------------------------------------------------------------------------------

export async function execute(command: Command, ctx: ExecContext): Promise<Outcome> {
  switch (command.name) {
    case "help":
      return { kind: "help", topic: command.topic };
    case "clear":
      return { kind: "clear" };
    case "signals":
      return { kind: "signals" };
    case "audit": {
      const snapshot = ctx.audit();
      return { kind: "audit", rows: snapshot.rows.slice(-command.rows), connection: snapshot.connection };
    }
    case "wallet": {
      const loaded = await ctx.loadBindings();
      return { kind: "wallet", rows: walletRowsOf(loaded.bindings), persistence: loaded.persistence };
    }
    case "status": {
      const id = ctx.nextCallId();
      const started = ctx.nowMs();
      const base = { id, label: "GET /ui/status", args: null, durationMs: null, failure: null, text: null, raw: null } as const;
      ctx.onCall({ ...base, status: "running" });
      try {
        const status = await ctx.client.status(ctx.signal);
        ctx.onCall({ ...base, status: "ok", durationMs: Math.max(0, ctx.nowMs() - started) });
        return { kind: "status", status };
      } catch (error) {
        const problem = failureOfError(error, ctx, "status");
        ctx.onCall({ ...base, status: "failed", durationMs: Math.max(0, ctx.nowMs() - started), failure: problem });
        return { kind: "failure", failure: problem };
      }
    }
    case "markets": {
      const result = await callTool(ctx, "xo_search", searchArgs(command.query), TOOL_OUTPUT_SCHEMAS.xo_search);
      return result.ok ? { kind: "markets", query: command.query, data: result.data } : { kind: "failure", failure: result.failure };
    }
    case "market": {
      const args = marketArgs(command.id);
      const result = await callTool(ctx, "xo_get_market", args, TOOL_OUTPUT_SCHEMAS.xo_get_market);
      if (!result.ok) return { kind: "failure", failure: result.failure };
      if (result.data.market.condition_id.toLowerCase() !== command.id) {
        return { kind: "failure", failure: markViolation(ctx, result, "xo_get_market", args, "different_market") };
      }
      return { kind: "market", data: result.data };
    }
    case "book": {
      const args = marketArgs(command.id);
      const market = await callTool(ctx, "xo_get_market", args, TOOL_OUTPUT_SCHEMAS.xo_get_market);
      if (!market.ok) return { kind: "failure", failure: market.failure };
      if (market.data.market.condition_id.toLowerCase() !== command.id) {
        return { kind: "failure", failure: markViolation(ctx, market, "xo_get_market", args, "different_market") };
      }
      const books: BookResult[] = [];
      // One book at a time: the daemon limits reads per minute and the venue limits per second.
      for (const slot of slotsFor(command.side)) {
        if (ctx.signal.aborted) break;
        books.push(await readBook(ctx, market.data, slot));
      }
      return { kind: "book", market: market.data, books };
    }
    case "positions": {
      let address = command.address;
      let source: "typed" | "saved" = "typed";
      if (address === null) {
        const loaded = await ctx.loadBindings();
        const target = positionsTargetOf(loaded.bindings);
        if (target.accounts.length !== 1) {
          return { kind: "positions_target", problem: target.accounts.length === 0 ? (target.unusable > 0 ? "unusable" : "none") : "many", candidates: target.accounts };
        }
        address = target.accounts[0] ?? null;
        source = "saved";
        if (address === null) return { kind: "positions_target", problem: "none", candidates: [] };
      }
      const args = positionsArgs(address);
      const result = await callTool(ctx, "xo_positions", args, TOOL_OUTPUT_SCHEMAS.xo_positions);
      if (!result.ok) return { kind: "failure", failure: result.failure };
      // An answer about another address is not an answer to the question.
      if (result.data.address.toLowerCase() !== address.toLowerCase()) {
        return { kind: "failure", failure: markViolation(ctx, result, "xo_positions", args, "different_address") };
      }
      return { kind: "positions", data: result.data, source };
    }
  }
}
