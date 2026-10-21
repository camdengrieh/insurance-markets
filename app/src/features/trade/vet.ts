// Vetting a prepared item BEFORE the trade screen shows it as something an agent could sign.
//
// The daemon hands the page whatever the plugin returned, which is whatever the relay stored. This module is the
// page's own check of that item, in a fixed order, failing at the first problem with a fixed sentence:
//
//   1. the relay contract's strict schema for the item's route (a user operation or an order);
//   2. the kind and action are the ones the screen asked for (a creation item is never shown, O5);
//   3. the owner is the one asked for and the account is the one the page itself derives from it (M4-6);
//   4. the item is not out of time;
//   5. there is a decoded block, and its calls are on the closed template list with pinned destinations (M4-6, M4-7);
//   6. for an order, every term and the quote equal the ticket the user saw (M4-8);
//   7. verifyPreparedLocal rebuilds the digest, both tags and every summary line from the decoded fields, with the
//      plugin's own digest code: a changed digit anywhere is a mismatch (R1; M4-2);
//   8. the summary lines are plain printable ASCII.
//
// Nothing a failure prints comes from the item: the sentences are fixed here, and the one field path that is shown
// is checked against a small alphabet first. A failed item renders nothing and offers nothing (M4-7).

import { POST_ROUTES, SUMMARY_LINE_MAX_CHARS, type DecodedClobOrder, type DecodedOrder, type DecodedUserOp, type InnerHashKind } from "@shared/relay/contract";
import { isPinnedLimitlessExchange, polymarketBookOf } from "@shared/clob/venues";
import { deriveAccount } from "@shared/xo/account/derive";
import { CTF_EXCHANGE } from "@shared/xo/chain/constants";
import { ACTION_TITLES } from "@shared/xo/signing/lines";
import { verifyPreparedLocal } from "@shared/xo/signing/rebuild";
import { ORDER_CAP_FEE_BPS } from "@shared/xo/signing/amounts";

import { expectedClobQuote, type ClobTicket } from "./clob-ticket";
import { expectedQuote, type Ticket } from "./ticket";
import { isRenderableAction, renderCalls, type CallExpectations, type RenderedCall } from "./templates";

export type Expected =
  | { readonly kind: "deploy"; readonly owner: string; readonly allowanceAtomic: bigint | null }
  | { readonly kind: "revoke"; readonly owner: string }
  | { readonly kind: "redeem"; readonly owner: string; readonly conditionIds: readonly string[] }
  | { readonly kind: "withdraw"; readonly owner: string; readonly amountAtomic?: bigint }
  | { readonly kind: "order"; readonly owner: string; readonly ticket: Ticket }
  // A Polymarket or Limitless order: the maker is the owner itself (no derived account), the domain must be a pinned one.
  | { readonly kind: "clob_order"; readonly owner: string; readonly ticket: ClobTicket };

export const VET_CODES = [
  "schema",
  "kind",
  "action",
  "owner",
  "account",
  "expired",
  "not_derivable",
  "mismatch",
  "template",
  "ticket",
  "quote",
  "title_slot",
  "unsafe_text",
] as const;
export type VetCode = (typeof VET_CODES)[number];

export interface VetFailure {
  readonly ok: false;
  readonly code: VetCode;
  // A field path inside the item when there is one and it is made of safe characters; otherwise "".
  readonly field: string;
  // Fixed wording. Never contains a value from the item.
  readonly reason: string;
}

export interface OrderView {
  // "xo" for an XO order; the venue for a CLOB venue order.
  readonly venue: "xo" | "polymarket" | "limitless";
  readonly side: "BUY" | "SELL";
  readonly shares: string;
  readonly price: string;
  readonly tokenId: string;
  readonly tif: string;
  readonly postOnly: boolean;
  readonly ttlS: number | null;
  // null when the signed order carries no expiry (a Limitless order, a Polymarket GTC, FOK or FAK).
  readonly expiresAt: string | null;
  readonly principalUsd: string;
  readonly maxOutlayUsd: string | null;
  readonly minProceedsUsd: string | null;
  readonly capUsd: string;
  readonly feeBoundBps: number;
  readonly maker: string;
  readonly exchange: string;
}

export interface VettedItem {
  readonly ok: true;
  readonly kind: "userop" | "order" | "clob_order";
  readonly preparedId: string;
  readonly owner: string;
  readonly account: string;
  readonly action: string;
  readonly actionTitle: string;
  readonly expiresAt: string;
  readonly expiresAtMs: number;
  readonly secondsLeft: number;
  // The least time a signer needs; below it the hand-off is withheld (an order: 90 s, design 5.3 item 4).
  readonly signWindowOk: boolean;
  readonly digestTag: string;
  readonly innerTag: string;
  readonly innerKind: InnerHashKind;
  readonly covered: readonly string[];
  readonly unbound: readonly string[];
  readonly calls: readonly RenderedCall[];
  readonly order: OrderView | null;
  // The summary lines the rebuild reproduced exactly (so they are the lines the decoded fields produce).
  readonly lines: readonly string[];
  readonly reservedUsd: string;
  readonly dayRemainingUsd: string;
  readonly capabilities: Readonly<Record<string, "unknown" | "yes" | "no">>;
  // Relay warnings: text a stranger could have influenced. Render only inside the untrusted slot.
  readonly warnings: readonly string[];
  readonly userOpHash: string | null;
}

export type VetResult = VettedItem | VetFailure;

const SAFE_FIELD = /^[A-Za-z0-9_.[\]-]{1,80}$/;
const PRINTABLE_LINE = /^[\x20-\x7e]+$/;
const ORDER_MIN_SIGN_S = 90;
const USEROP_MIN_SIGN_S = 30;
const MAX_EDGE_FIXES = 80;

function failure(code: VetCode, reason: string, field = ""): VetFailure {
  return { ok: false, code, field: SAFE_FIELD.test(field) ? field : "", reason };
}

const lower = (value: string): string => value.toLowerCase();

function expectedAction(expected: Expected): readonly string[] {
  switch (expected.kind) {
    case "deploy":
      return ["deploy_enable_trading", "enable_trading"];
    case "revoke":
      return ["revoke_trading"];
    case "redeem":
      return ["redeem"];
    case "withdraw":
      return ["withdraw"];
    case "order":
    case "clob_order":
      return ["place_order"];
  }
}

function callExpectations(expected: Expected): CallExpectations {
  switch (expected.kind) {
    case "deploy":
      return { owner: expected.owner, allowanceAtomic: expected.allowanceAtomic };
    case "redeem":
      return { owner: expected.owner, conditionIds: expected.conditionIds };
    case "withdraw":
      return { owner: expected.owner, ...(expected.amountAtomic === undefined ? {} : { withdrawAtomic: expected.amountAtomic }) };
    default:
      return { owner: expected.owner };
  }
}

function linesAreSafe(lines: readonly string[]): boolean {
  return lines.every((line) => line.length > 0 && line.length <= SUMMARY_LINE_MAX_CHARS && PRINTABLE_LINE.test(line));
}

// The order's terms against the ticket the user saw.
function checkOrder(decoded: DecodedOrder, quote: { readonly price: string; readonly shares: string; readonly max_outlay_usd: string; readonly fee_bound_bps: number; readonly expires_at: string }, reservedUsd: string, ticket: Ticket): VetFailure | null {
  const want = expectedQuote(ticket);
  const order = decoded.order;
  const terms = decoded.terms;
  if (order.token_id !== ticket.tokenId) return failure("ticket", "The order is for a different outcome token than the ticket.", "decoded.order.token_id");
  if (terms.side !== ticket.side || order.side !== (ticket.side === "BUY" ? 0 : 1)) return failure("ticket", "The order is on the other side from the ticket.", "decoded.terms.side");
  if (terms.price !== want.price) return failure("ticket", "The order's price differs from the ticket.", "decoded.terms.price");
  if (terms.shares !== want.shares) return failure("ticket", "The order's size differs from the ticket.", "decoded.terms.shares");
  if (decoded.params.tif !== ticket.tif) return failure("ticket", "The order's type differs from the ticket.", "decoded.params.tif");
  if (decoded.params.post_only !== ticket.postOnly) return failure("ticket", "The order's post-only setting differs from the ticket.", "decoded.params.post_only");
  if (decoded.params.purpose !== "trade") return failure("ticket", "The order is not an ordinary trade.", "decoded.params.purpose");
  if (ticket.ttlS !== null && decoded.params.ttl_s !== ticket.ttlS) return failure("ticket", "The order's life differs from the ticket.", "decoded.params.ttl_s");
  // M4-8: the outlay the ticket showed is the relay's quote, digit for digit; so are the cap and the fee bound.
  if (quote.price !== want.price || quote.shares !== want.shares) return failure("quote", "The quote's price or size differs from the ticket.", "quote");
  if (quote.max_outlay_usd !== want.maxOutlayUsd) return failure("quote", "The quote's worst-case outlay differs from the ticket's.", "quote.max_outlay_usd");
  if (terms.cap_usd !== want.reservedUsd || reservedUsd !== want.reservedUsd) return failure("quote", "The amount counted against the caps differs from the ticket's.", "caps.reserved_usd");
  if (quote.fee_bound_bps !== ORDER_CAP_FEE_BPS || terms.fee_bound_bps !== ORDER_CAP_FEE_BPS) return failure("quote", "The fee bound is not the 1,000 bps ceiling the ticket used.", "quote.fee_bound_bps");
  if ((terms.max_outlay_usd ?? "0") !== want.maxOutlayUsd) return failure("quote", "The decoded outlay differs from the ticket's.", "decoded.terms.max_outlay_usd");
  return null;
}

// A venue order's terms against the ticket the user saw, and its domain against the pinned exchanges.
function checkClobOrder(decoded: DecodedClobOrder, quote: { readonly venue: string; readonly price: string; readonly shares: string; readonly max_outlay_usd: string; readonly fee_bound_bps: number; readonly expires_at: string | null }, reservedUsd: string, ticket: ClobTicket): VetFailure | null {
  const want = expectedClobQuote(ticket);
  const order = decoded.order;
  const terms = decoded.terms;
  if (decoded.venue !== ticket.venue || order.venue !== ticket.venue || quote.venue !== ticket.venue) return failure("ticket", "The order is for a different venue than the ticket.", "decoded.venue");
  if (order.token_id !== ticket.tokenId) return failure("ticket", "The order is for a different outcome token than the ticket.", "decoded.order.token_id");
  if (terms.side !== ticket.side || order.side !== (ticket.side === "BUY" ? 0 : 1)) return failure("ticket", "The order is on the other side from the ticket.", "decoded.terms.side");
  if (terms.price !== want.price) return failure("ticket", "The order's price differs from the ticket.", "decoded.terms.price");
  if (terms.shares !== want.shares) return failure("ticket", "The order's size differs from the ticket.", "decoded.terms.shares");
  if (decoded.params.market_id.toLowerCase() !== ticket.marketId.toLowerCase()) return failure("ticket", "The order names a different market than the ticket.", "decoded.params.market_id");
  if (decoded.params.tif !== ticket.tif) return failure("ticket", "The order's type differs from the ticket.", "decoded.params.tif");
  if (decoded.params.post_only !== ticket.postOnly) return failure("ticket", "The order's post-only setting differs from the ticket.", "decoded.params.post_only");
  if (ticket.ttlS !== null && decoded.params.ttl_s !== ticket.ttlS) return failure("ticket", "The order's life differs from the ticket.", "decoded.params.ttl_s");
  if (decoded.params.tick !== ticket.tick) return failure("ticket", "The order was checked against a different tick than the ticket shows.", "decoded.params.tick");
  if (quote.price !== want.price || quote.shares !== want.shares) return failure("quote", "The quote's price or size differs from the ticket.", "quote");
  if (quote.max_outlay_usd !== want.maxOutlayUsd) return failure("quote", "The quote's worst-case outlay differs from the ticket's.", "quote.max_outlay_usd");
  if (terms.cap_usd !== want.reservedUsd || reservedUsd !== want.reservedUsd) return failure("quote", "The amount counted against the caps differs from the ticket's.", "caps.reserved_usd");
  if (quote.fee_bound_bps !== ticket.feeBps || terms.fee_bound_bps !== ticket.feeBps) return failure("quote", "The fee ceiling is not the policy ceiling the ticket used.", "quote.fee_bound_bps");
  if ((terms.max_outlay_usd ?? "0") !== want.maxOutlayUsd) return failure("quote", "The decoded outlay differs from the ticket's.", "decoded.terms.max_outlay_usd");
  if (decoded.venue === "polymarket" && polymarketBookOf(decoded.domain.version, decoded.domain.verifying_contract) === undefined) return failure("template", "The order is bound to a contract other than Polymarket's pinned exchanges.", "decoded.domain");
  if (decoded.venue === "limitless" && !isPinnedLimitlessExchange(decoded.domain.verifying_contract)) return failure("template", "The order is bound to a contract other than Limitless's pinned exchange.", "decoded.domain");
  return null;
}

type LocalVerdict = ReturnType<typeof verifyPreparedLocal>;

// The plugin trims the white space at the two ends of each summary line before it hands the item on (its text
// cleaner), and the relay indents a few lines (a redeem's condition list). So the received line can differ from the
// rebuilt one by edge white space ONLY. That one difference is restored from the rebuild, line by line; anything else
// (a digit, a letter, a changed order) is still a mismatch. The lines returned are the rebuilt ones.
function verifyIgnoringLineEdges(raw: unknown): { readonly verdict: LocalVerdict; readonly lines: readonly string[] } {
  const received = raw as { readonly summary?: { readonly lines?: readonly unknown[] } };
  let candidate: unknown = raw;
  let lines: string[] = Array.isArray(received.summary?.lines) ? received.summary.lines.map(String) : [];
  for (let round = 0; round <= MAX_EDGE_FIXES; round += 1) {
    const verdict = verifyPreparedLocal(candidate);
    if (verdict.ok) return { verdict, lines };
    const match = /^summary\.lines\[(\d{1,3})\]$/.exec(verdict.field);
    const index = match === null ? -1 : Number(match[1]);
    const want = "expected" in verdict ? verdict.expected : undefined;
    if (index < 0 || index >= lines.length || want === undefined || want.trim() !== lines[index]?.trim() || want === lines[index]) return { verdict, lines };
    lines = lines.map((line, position) => (position === index ? want : line));
    const clone = structuredClone(raw) as { summary: { lines: string[] } };
    clone.summary.lines = lines;
    candidate = clone;
  }
  return { verdict: verifyPreparedLocal(candidate), lines };
}

// Vets one tool answer's `prepared` value. `nowMs` is the page's clock.
export function vetPrepared(raw: unknown, expected: Expected, nowMs: number): VetResult {
  // 1. schema, by the route the item came from.
  const isOrder = expected.kind === "order";
  const isClob = expected.kind === "clob_order";
  const parsed = isClob ? POST_ROUTES["/v1/clob/order/prepare"].response.safeParse(raw) : isOrder ? POST_ROUTES["/v1/order/prepare"].response.safeParse(raw) : POST_ROUTES["/v1/userop/prepare"].response.safeParse(raw);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.map(String).join(".") ?? "";
    return failure("schema", "The item does not match the relay's contract for this kind of item.", path);
  }
  const item = parsed.data;

  // 2. kind and action.
  if (item.kind === "create") return failure("kind", "A market creation item is never shown here.", "kind");
  if (isClob ? item.kind !== "clob_order" : isOrder ? item.kind !== "order" : item.kind !== "userop") return failure("kind", "The item is a different kind from the one asked for.", "kind");
  const decoded = item.decoded;

  // 3. owner and account. On a CLOB venue the maker is the owner itself; on XO it is the account derived from it.
  if (lower(item.owner) !== lower(expected.owner)) return failure("owner", "The item is for a different owner address than the one chosen.", "owner");
  let derived: string;
  if (isClob) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(expected.owner)) return failure("owner", "The owner address cannot own an account.", "owner");
    derived = expected.owner;
    if (lower(item.account) !== lower(expected.owner)) return failure("account", "The item's account is not the owner wallet itself, which is the maker on this venue.", "account");
  } else {
    try {
      derived = deriveAccount(expected.owner);
    } catch {
      return failure("owner", "The owner address cannot own an account.", "owner");
    }
    if (lower(item.account) !== lower(derived)) return failure("account", "The item's account is not the account derived from the owner.", "account");
  }

  // 4. time.
  const expiresAtMs = Date.parse(item.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return failure("expired", "The item is out of time. Prepare it again.", "expires_at");

  // 5. a decoded block, then the closed call list.
  if (decoded === undefined) return failure("not_derivable", "The relay sent no decoded block, so the digest cannot be rebuilt here. Nothing is shown as ready to sign.", "decoded");
  if (decoded.owner.toLowerCase() !== lower(expected.owner) || lower(decoded.account) !== lower(derived)) return failure("account", "The decoded block names a different owner or account.", "decoded.account");

  let calls: readonly RenderedCall[] = [];
  let order: OrderView | null = null;
  let action: string;
  if (decoded.kind === "userop" && !isOrder) {
    const block: DecodedUserOp = decoded;
    action = block.action;
    if (!expectedAction(expected).includes(action)) return failure("action", "The operation is a different action from the one asked for.", "decoded.action");
    if (!isRenderableAction(action)) return failure("action", "This kind of operation is not shown here.", "decoded.action");
    if (block.display.title_slot !== null) return failure("title_slot", "The operation carries market text, which these screens never show.", "decoded.display.title_slot");
    if (lower(block.userop.sender) !== lower(derived)) return failure("account", "The operation's sender is not the derived account.", "decoded.userop.sender");
    const rendered = renderCalls(action, block.calls, callExpectations(expected));
    if (!rendered.ok) return failure("template", rendered.reason, rendered.index >= 0 ? `decoded.calls[${String(rendered.index)}]` : "decoded.calls");
    calls = rendered.calls;
  } else if (decoded.kind === "order" && isOrder) {
    action = decoded.action;
    if (!("quote" in item) || "venue" in item.quote) return failure("schema", "The order carries no quote.", "quote");
    const ticketIssue = checkOrder(decoded, item.quote, item.caps.reserved_usd, expected.ticket);
    if (ticketIssue !== null) return ticketIssue;
    if (lower(decoded.order.maker) !== lower(derived) || lower(decoded.order.signer) !== lower(derived)) return failure("account", "The order's maker or signer is not the derived account.", "decoded.order.maker");
    if (decoded.order.beneficiary !== "0x0000000000000000000000000000000000000000") return failure("account", "The order redirects its proceeds.", "decoded.order.beneficiary");
    if (lower(decoded.exchange) !== lower(CTF_EXCHANGE)) return failure("template", "The order is bound to a contract other than the exchange.", "decoded.exchange");
    order = {
      venue: "xo",
      side: decoded.terms.side,
      shares: decoded.terms.shares,
      price: decoded.terms.price,
      tokenId: decoded.order.token_id,
      tif: decoded.params.tif,
      postOnly: decoded.params.post_only,
      ttlS: decoded.params.ttl_s,
      expiresAt: decoded.terms.expires_at,
      principalUsd: decoded.terms.principal_usd,
      maxOutlayUsd: decoded.terms.max_outlay_usd,
      minProceedsUsd: decoded.terms.min_proceeds_usd,
      capUsd: decoded.terms.cap_usd,
      feeBoundBps: decoded.terms.fee_bound_bps,
      maker: decoded.order.maker,
      exchange: decoded.exchange,
    };
    if (order.expiresAt === null || Date.parse(order.expiresAt) <= nowMs) return failure("expired", "The order's own expiry has passed. Prepare it again.", "decoded.terms.expires_at");
  } else if (decoded.kind === "clob_order" && isClob) {
    action = decoded.action;
    if (!("quote" in item) || !("venue" in item.quote)) return failure("schema", "The order carries no quote.", "quote");
    const ticketIssue = checkClobOrder(decoded, item.quote, item.caps.reserved_usd, expected.ticket);
    if (ticketIssue !== null) return ticketIssue;
    if (lower(decoded.order.maker) !== lower(expected.owner) || lower(decoded.order.signer) !== lower(expected.owner)) return failure("account", "The order's maker or signer is not the owner wallet.", "decoded.order.maker");
    order = {
      venue: decoded.venue,
      side: decoded.terms.side,
      shares: decoded.terms.shares,
      price: decoded.terms.price,
      tokenId: decoded.order.token_id,
      tif: decoded.params.tif,
      postOnly: decoded.params.post_only,
      ttlS: decoded.params.ttl_s,
      expiresAt: decoded.terms.expires_at,
      principalUsd: decoded.terms.principal_usd,
      maxOutlayUsd: decoded.terms.max_outlay_usd,
      minProceedsUsd: decoded.terms.min_proceeds_usd,
      capUsd: decoded.terms.cap_usd,
      feeBoundBps: decoded.terms.fee_bound_bps,
      maker: decoded.order.maker,
      exchange: decoded.domain.verifying_contract,
    };
    if (order.expiresAt !== null && Date.parse(order.expiresAt) <= nowMs) return failure("expired", "The order's own expiry has passed. Prepare it again.", "decoded.terms.expires_at");
  } else {
    return failure("kind", "The decoded block is for a different kind of item.", "decoded.kind");
  }

  // 7. the rebuild: digest, typed-data hash, both tags and every summary line, from the decoded fields.
  const checked = verifyIgnoringLineEdges(raw);
  const verdict = checked.verdict;
  if (!verdict.ok) {
    if (verdict.status === "not_derivable") return failure("not_derivable", "The digest cannot be rebuilt from the relay's data. Nothing is shown as ready to sign.", verdict.field);
    return failure("mismatch", "Rebuilding the digest, tags and summary from the decoded fields does not reproduce what the relay sent. Do not sign it.", verdict.field);
  }

  // 8. plain text only.
  if (!linesAreSafe(checked.lines)) return failure("unsafe_text", "A summary line holds characters that are not plain printable text.", "summary.lines");

  const secondsLeft = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
  return {
    ok: true,
    kind: isClob ? "clob_order" : isOrder ? "order" : "userop",
    preparedId: item.prepared_id,
    owner: item.owner,
    account: item.account,
    action,
    actionTitle: action === "place_order" ? "Place an order" : ACTION_TITLES[action as keyof typeof ACTION_TITLES],
    expiresAt: item.expires_at,
    expiresAtMs,
    secondsLeft,
    signWindowOk: secondsLeft >= (isOrder || isClob ? ORDER_MIN_SIGN_S : USEROP_MIN_SIGN_S),
    digestTag: verdict.digest_tag,
    innerTag: verdict.inner_hash_tag,
    innerKind: isOrder || isClob ? "typed_data_hash" : "call_data",
    covered: verdict.covered,
    unbound: verdict.unbound,
    calls,
    order,
    lines: checked.lines,
    reservedUsd: item.caps.reserved_usd,
    dayRemainingUsd: item.caps.day_remaining_usd,
    capabilities: item.capabilities,
    warnings: item.warnings,
    userOpHash: "user_op_hash" in item ? item.user_op_hash : null,
  };
}
