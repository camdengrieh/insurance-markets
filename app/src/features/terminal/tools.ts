// The only tools this terminal can ask the daemon to run, and the page-side schema of each answer.
//
// THE LIST IS CLOSED. TerminalTool names four read-class plugin tools. The type has no other member, callTool
// accepts only that type, and a test compares the list with the daemon's class table (bridge/tool-classes.ts):
// every name here must be classed `read` there. Adding a tool means adding a name here AND a schema below AND
// a renderer; nothing generic exists, so there is no way to type a tool name and have it called.
//
// ANSWERS ARE UNTRUSTED. The daemon passes the plugin's structuredContent through. The page validates it against
// the schemas below before rendering anything (dapp-design 5.2 "Transcript"). An object with a field the schema
// does not name keeps only the named fields, so an unknown field is never rendered. A missing or malformed field
// makes the whole answer a "schema violation" entry. Every string a market creator can write arrives as the
// plugin's { text, trust, flags } object and leaves this file as the Untrusted<string> brand, which only the
// untrusted-text component renders.

import * as z from "zod/v4";

import { TRUST_LABEL } from "@shared/guardrails/untrusted";
import { KNOWN_MARKET_STATUSES } from "@sdk/venues/xo/api/types";

import { parseQty } from "../../core/money";
import { untrustedField, type Untrusted } from "../../core/untrusted";
import { parseIsoMs } from "../../core/format";

export const TERMINAL_TOOLS = ["xo_search", "xo_get_market", "xo_orderbook", "xo_positions"] as const;
export type TerminalTool = (typeof TERMINAL_TOOLS)[number];

export function isTerminalTool(name: string): name is TerminalTool {
  return (TERMINAL_TOOLS as readonly string[]).includes(name);
}

export type ToolArgs = Readonly<Record<string, string | number>>;

// Argument builders. The plugin's own input schemas are the second check; these produce only values the grammar
// already validated (market id, decimal token id, lowercase address, bounded text).
export const SEARCH_LIMIT = 10;
export const BOOK_DEPTH = 10;

export function searchArgs(query: string): ToolArgs {
  return { query, status: "ACTIVE", limit: SEARCH_LIMIT, page: 1 };
}
export function marketArgs(conditionId: string): ToolArgs {
  return { condition_id: conditionId };
}
export function orderbookArgs(tokenId: string): ToolArgs {
  return { token_id: tokenId, depth: BOOK_DEPTH };
}
export function positionsArgs(address: string): ToolArgs {
  return { address };
}

// ---- building blocks -------------------------------------------------------------------------------------------------

// Flags the shared sanitiser can raise. They are shown as chips and never used to allow anything.
export const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  "instruction-like", "tool-reference", "role-marker", "url", "wallet-address", "hex-blob", "code-fence", "markup",
  "markdown-link", "mixed-script", "had-bidi-controls", "had-tag-chars", "had-invisible-chars", "had-control-chars",
  "had-excess-combining-marks", "non-string-input", "input-oversize", "empty-after-sanitize",
]);

export type UntrustedLimit = "title" | "outcome" | "category" | "description" | "rules" | "generic";

export interface WireText {
  readonly text: Untrusted<string>;
  readonly flags: readonly string[];
}

const wireTextShape = z.object({
  text: z.string().max(70_000),
  trust: z.literal(TRUST_LABEL),
  flags: z.array(z.string().max(48)).max(32),
});

// The plugin's untrusted-content object, re-sanitised at this edge and branded.
function wireText(limit: UntrustedLimit) {
  return wireTextShape.transform(
    (value): WireText => ({
      text: untrustedField(limit, value.text),
      flags: value.flags.filter((flag) => KNOWN_FLAGS.has(flag)),
    }),
  );
}

// A bare string from the plugin (a warning, a reason, a note). The plugin writes them, but some quote market
// text, so they leave as untrusted too.
function looseText(limit: UntrustedLimit = "generic") {
  return z.string().max(4000).transform((value): Untrusted<string> => untrustedField(limit, value));
}

// An exact plain decimal, as the plugin sends prices, sizes and USD amounts. Kept as the string; arithmetic is
// done with core/money when a comparison is needed.
const decimal = z.string().refine((value) => parseQty("price", value, { maxScale: 18 }) !== null, "a plain non-negative decimal");
const condition = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "a market id");
const tokenId = z.string().regex(/^[1-9][0-9]{0,77}$/, "an outcome token id");
const iso = z.string().refine((value) => parseIsoMs(value) !== null, "an ISO timestamp");
// Closed lists, so a status word is one of ours and never text a stranger chose. A word outside the list is a
// schema violation, not a guess.
const marketStatus = z.enum([...KNOWN_MARKET_STATUSES, "unknown"]);
const lifecycle = z.enum([
  "pending", "open", "paused", "expired_unresolved", "review_required", "resolved_provisional", "settled", "closed_no_winner", "voided", "cancelled", "unknown",
]);
const feeStatus = z.enum(["agree", "disagree", "effective_only", "fee_rate_only", "unknown"]);
const count = z.number().int().min(0).max(1_000_000);
const slot = z.enum(["yes", "no"]);

const level = z.object({ price: decimal, size: decimal });

const bookQuote = z.object({
  best_bid: level.nullable(),
  best_ask: level.nullable(),
  spread: decimal.nullable(),
  midpoint: decimal.nullable(),
  midpoint_reliable: z.boolean(),
  last_trade_price: decimal.nullable(),
  bid_depth_near_touch_shares: decimal,
  ask_depth_near_touch_shares: decimal,
  thin: z.array(z.enum(["no_bids", "no_asks", "wide_spread", "crossed"])).max(4),
});
export type BookQuote = z.infer<typeof bookQuote>;

const outcomeQuote = bookQuote.extend({ slot, token_id: tokenId });

// ---- xo_search ------------------------------------------------------------------------------------------------------

const listOutcome = z.object({ slot, title: wireText("outcome"), token_id: tokenId, display_price: decimal.nullable() });

const marketRow = z.object({
  condition_id: condition,
  title: wireText("title"),
  status: marketStatus,
  lifecycle,
  open_by_metadata: z.boolean(),
  expires_at: iso.nullable(),
  total_volume_usd: decimal.nullable(),
  outcomes: z.array(listOutcome).length(2),
});

export const searchOutput = z.object({
  markets: z.array(marketRow).max(50),
  page_info: z.object({ page: count, limit: count, returned: count, has_next_page: z.boolean() }),
  skipped_rows: z.object({ count }),
  warnings: z.array(looseText()).max(10),
});
export type SearchOutput = z.infer<typeof searchOutput>;

// ---- xo_get_market ----------------------------------------------------------------------------------------------------

const detailOutcome = z.object({ slot, title: wireText("outcome"), token_id: tokenId });

export const marketOutput = z.object({
  market: z.object({
    condition_id: condition,
    title: wireText("title"),
    status: marketStatus,
    lifecycle,
    open_by_metadata: z.boolean(),
    starts_at: iso.nullable(),
    expires_at: iso.nullable(),
    resolved_at: iso.nullable(),
    winning_outcome: z.object({ index: z.number().int().min(0).max(1), slot }).nullable(),
    total_volume_usd: decimal.nullable(),
    outcomes: z.array(detailOutcome).length(2),
    description: wireText("description").nullable(),
    rules: z.object({
      description: wireText("rules").nullable(),
      outcome_rules: z.array(z.object({ outcome_index: z.number().int().min(0).max(1), slot, rule: wireText("rules") })).max(8),
    }),
    resolution_sources: z.array(wireText("generic")).max(8),
    resolution_type: wireText("generic").nullable(),
  }),
  tradability: z.object({
    verdict: z.enum(["open_with_book", "thin_book", "not_open", "unknown"]),
    reasons: z.array(looseText()).max(12),
    open_by_metadata: z.boolean(),
    orderbook_active: z.boolean().nullable(),
  }),
  quote: z.object({ yes: outcomeQuote.nullable(), no: outcomeQuote.nullable(), unavailable_reason: looseText().nullable() }),
  fees: z.object({
    taker_fee_bps: z.number().int().min(0).max(10_000).nullable(),
    maker_fee_bps: z.number().int().min(-10_000).max(10_000).nullable(),
    status: feeStatus,
    usable_for_quoting: z.boolean(),
  }),
  warnings: z.array(looseText()).max(10),
});
export type MarketOutput = z.infer<typeof marketOutput>;

// ---- xo_orderbook -----------------------------------------------------------------------------------------------------

const bookLevel = z.object({ price: decimal, size: decimal, cumulative_size: decimal });

export const orderbookOutput = z.object({
  token_id: tokenId,
  condition_id: condition,
  slot: z.enum(["yes", "no", "unknown"]),
  orderbook_active: z.boolean().nullable(),
  bids: z.array(bookLevel).max(100),
  asks: z.array(bookLevel).max(100),
  levels_total: z.object({ bids: count, asks: count }),
  truncated: z.boolean(),
  quote: bookQuote.extend({ book_timestamp: z.string().max(64).nullable() }),
  tick_size: decimal,
  warnings: z.array(looseText()).max(10),
});
export type OrderbookOutput = z.infer<typeof orderbookOutput>;

// ---- xo_positions -----------------------------------------------------------------------------------------------------

const positionRow = z.object({
  token_id: tokenId,
  shares: decimal,
  reserved_shares: decimal,
  free_shares: decimal,
  market: z
    .object({ condition_id: condition, title: wireText("title"), status: marketStatus, outcome_title: wireText("outcome").nullable() })
    .nullable(),
});

export const positionsOutput = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  cash_balance_usdc_e: decimal,
  positions: z.array(positionRow).max(100),
  positions_total: count,
  positions_returned: count,
  truncated: z.boolean(),
  upstream_truncated: z.boolean(),
  labels: z.enum(["profile_loaded", "no_xo_profile", "unavailable"]),
  warnings: z.array(looseText()).max(10),
});
export type PositionsOutput = z.infer<typeof positionsOutput>;

// One schema per tool: the table callTool consults. A tool without an entry cannot exist (TerminalTool is closed).
export const TOOL_OUTPUT_SCHEMAS = {
  xo_search: searchOutput,
  xo_get_market: marketOutput,
  xo_orderbook: orderbookOutput,
  xo_positions: positionsOutput,
} as const satisfies Record<TerminalTool, z.ZodType>;

export type ToolOutput<T extends TerminalTool> = z.output<(typeof TOOL_OUTPUT_SCHEMAS)[T]>;
