// The re-typing rule for lines that did not come from the person's own keystrokes (docs/dapp-design.md 5.6,
// acceptance M5-7), and the deterministic checks a model's proposal must pass first.
//
// WHY. A line that was pasted, filled in by the page, or proposed by a model may have been shaped by text a stranger
// wrote (a market title, a rule, an error body). A person who only presses Enter on such a line approves whatever it
// says. So for those lines the person must TYPE the things that matter, the market id and the size, and the typed
// values must equal the line's. Typing them is what makes the person look.
//
// A line the person typed or recalled from their own history needs nothing extra: the person wrote it.
//
// Pure code: no DOM, no network, no clock.

import { cmpQty, parseQty, type QtyUnit } from "../../../core/money";
import { buildTicket, overOrderCap } from "../../trade/ticket";
import { describePrepare, routeLine, type PrepareCommand } from "./grammar";

// typed and recalled come from the person's own hands. The rest may have been shaped by someone else.
export const LINE_ORIGINS = ["typed", "recalled", "pasted", "filled", "proposal"] as const;
export type LineOrigin = (typeof LINE_ORIGINS)[number];

export function isTainted(origin: LineOrigin): boolean {
  return origin === "pasted" || origin === "filled" || origin === "proposal";
}

// What has to be typed again, per command. `expected` is the canonical text; the check compares meaning, not spelling
// (0x hex ignores case, "10" equals "10.0").
export type RetypeKey = "market" | "size" | "owner" | "order";

export interface RetypeField {
  readonly key: RetypeKey;
  readonly label: string;
  readonly expected: string;
  readonly kind: "hex" | "hex_list" | "amount" | "word";
  readonly unit: QtyUnit | null;
}

// `owner` is the address the command will act for (resolved before this is called); revoke has nothing else to retype.
export function retypeFieldsOf(command: PrepareCommand, owner: string | null): readonly RetypeField[] {
  switch (command.name) {
    case "order":
      return [
        { key: "market", label: "Re-type the market id", expected: command.marketId, kind: "hex", unit: null },
        { key: "size", label: "Re-type the size in shares", expected: command.shares, kind: "amount", unit: "shares" },
      ];
    case "redeem":
      return [
        { key: "market", label: "Re-type every market id, separated by spaces", expected: command.marketIds.join(" "), kind: "hex_list", unit: null },
        { key: "size", label: "Re-type how many markets", expected: String(command.marketIds.length), kind: "amount", unit: "shares" },
      ];
    case "fund":
      return [{ key: "size", label: "Re-type the amount in USDC", expected: command.amount, kind: "amount", unit: "usd" }];
    case "deploy":
      return [
        command.allowance.kind === "unlimited"
          ? { key: "size", label: 'Re-type the allowance: the word "unlimited"', expected: "unlimited", kind: "word", unit: null }
          : { key: "size", label: "Re-type the allowance in USDC.e", expected: command.allowance.usd, kind: "amount", unit: "usd" },
      ];
    case "cancel":
      return [{ key: "order", label: "Re-type the order hash", expected: command.orderHash, kind: "hex", unit: null }];
    case "revoke":
      return [{ key: "owner", label: "Re-type the owner address", expected: owner ?? "", kind: "hex", unit: null }];
  }
}

export type Retyped = Readonly<Partial<Record<RetypeKey, string>>>;

function sameText(field: RetypeField, typed: string): boolean {
  const text = typed.trim();
  if (field.expected === "") return false;
  switch (field.kind) {
    case "hex":
      return text.toLowerCase() === field.expected.toLowerCase();
    case "word":
      return text.toLowerCase() === field.expected.toLowerCase();
    case "hex_list": {
      const left = text.toLowerCase().split(/[\s,]+/).filter((word) => word !== "").sort();
      const right = field.expected.toLowerCase().split(" ").sort();
      return left.length === right.length && left.every((word, index) => word === right[index]);
    }
    case "amount": {
      if (field.unit === null) return false;
      const a = parseQty(field.unit, text);
      const b = parseQty(field.unit, field.expected);
      return a !== null && b !== null && cmpQty(a, b) === 0;
    }
  }
}

export type RetypeCheck =
  | { readonly ok: true; readonly required: boolean }
  | { readonly ok: false; readonly missing: readonly RetypeKey[]; readonly mismatched: readonly RetypeKey[] };

// For a line the person wrote, nothing is required. For any other line every field must be re-typed and equal.
export function checkRetype(fields: readonly RetypeField[], origin: LineOrigin, retyped: Retyped): RetypeCheck {
  if (!isTainted(origin)) return { ok: true, required: false };
  const missing: RetypeKey[] = [];
  const mismatched: RetypeKey[] = [];
  for (const field of fields) {
    const typed = retyped[field.key];
    if (typed === undefined || typed.trim() === "") missing.push(field.key);
    else if (!sameText(field, typed)) mismatched.push(field.key);
  }
  return missing.length === 0 && mismatched.length === 0 ? { ok: true, required: true } : { ok: false, missing, mismatched };
}

// ---- proposals ---------------------------------------------------------------------------------------------------------

export interface ProposalContext {
  // Market ids (condition ids, lower case) the proposer actually read this session.
  readonly readMarkets: ReadonlySet<string>;
  // The per-order cap the account read reported, a decimal string, or null when it was not read.
  readonly maxOrderUsd: string | null;
}

export const PROPOSAL_REFUSALS = ["unparsable", "not_prepare", "owner_chosen", "unread_market", "bad_ticket", "over_cap", "cap_unknown"] as const;
export type ProposalRefusal = (typeof PROPOSAL_REFUSALS)[number];

export type ProposalCheck =
  | { readonly ok: true; readonly command: PrepareCommand; readonly line: string; readonly origin: "proposal" }
  | { readonly ok: false; readonly code: ProposalRefusal; readonly message: string };

const REFUSAL_TEXT: Readonly<Record<ProposalRefusal, string>> = Object.freeze({
  unparsable: "The proposal is not one line of this terminal's language.",
  not_prepare: "A proposal may only be a prepare command (order, cancel, redeem, fund, deploy, revoke). Reads, flags, caps and sessions are never proposed.",
  owner_chosen: "A proposal may not choose the owner address. The owner is the one you saved.",
  unread_market: "The proposal names a market the proposer did not read in this session.",
  bad_ticket: "The proposed order is not a valid order.",
  over_cap: "The proposed order is larger than the per-order cap.",
  cap_unknown: "The per-order cap is not known, so the size cannot be checked.",
});

function refusal(code: ProposalRefusal): ProposalCheck {
  return { ok: false, code, message: REFUSAL_TEXT[code] };
}

// The deterministic check from the design: one action only (the grammar takes exactly one command), every market id
// is one the proposer read, the size is inside the cap. Passing it only lets the proposal reach the input box as an
// unsent line; it still needs the re-typing rule and the person's Enter.
export function checkProposal(line: unknown, context: ProposalContext): ProposalCheck {
  const routed = routeLine(line);
  if (!routed.ok) return refusal("unparsable");
  if (routed.route !== "prepare") return refusal("not_prepare");
  const command = routed.command;
  if (command.from !== null) return refusal("owner_chosen");
  const marketIds = command.name === "order" ? [command.marketId] : command.name === "redeem" ? command.marketIds : [];
  if (!marketIds.every((id) => context.readMarkets.has(id.toLowerCase()))) return refusal("unread_market");
  if (command.name === "order") {
    // The cap does not depend on the token, so a placeholder token id is enough to compute it.
    const built = buildTicket({ tokenId: "1", side: command.side, price: command.price, shares: command.shares, tif: command.tif, ttlS: command.ttlS, postOnly: command.postOnly });
    if (!built.ok) return refusal("bad_ticket");
    const over = overOrderCap(built.ticket, context.maxOrderUsd);
    if (over === null) return refusal("cap_unknown");
    if (over) return refusal("over_cap");
  }
  return { ok: true, command, line: describePrepare(command), origin: "proposal" };
}
