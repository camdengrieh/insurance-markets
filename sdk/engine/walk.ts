// Depth walk: price a stated size against one side of a normalised book (section 5.1). The best
// level is not the price you get for any real size, so quotes always come from a walk.
//
// A buy consumes asks from the lowest price up; a sell consumes bids from the highest down.
// The VWAP is an exact rational; the decimal shown to a user rounds against the trader (a buy
// vwap rounds up, a sell vwap rounds down) so a displayed price never flatters the trade.

import type { Book, Dec, FeeSpec, Quote } from "../model.js";
import { checkFeeSpec, orderFee, type FeeErrorCode, type FeeRole } from "./fees.js";
import { feeSpecId } from "./fee-specs.js";
import { parseBook, type ParsedBook, type ParsedLevel } from "./books.js";
import {
  ZERO,
  add,
  cmp,
  div,
  min,
  mul,
  ratFromDec,
  ratToDec,
  ratToDecExact,
  sub,
  sum,
  type Rational,
  type SDec,
} from "../money/rational.js";

export type TradeSide = "buy" | "sell";

export interface WalkFill {
  readonly price: Rational;
  readonly qty: Rational;
}

export interface Walk {
  readonly side: TradeSide;
  readonly requested: Rational;
  readonly filled: Rational;
  readonly fills: readonly WalkFill[];
  // Sum of price x qty over the fills (collateral units).
  readonly notional: Rational;
  readonly best: Rational | null;
  // Price of the last level touched.
  readonly worst: Rational | null;
  readonly vwap: Rational | null;
  // True when the full requested size was available (within the limit price, if any).
  readonly complete: boolean;
}

export function walkLevels(levels: readonly ParsedLevel[], side: TradeSide, size: Rational, limit?: Rational): Walk {
  if (cmp(size, ZERO) <= 0) throw new RangeError("walk size must be positive");
  const fills: WalkFill[] = [];
  let remaining = size;
  for (const level of levels) {
    if (cmp(remaining, ZERO) <= 0) break;
    if (limit !== undefined && (side === "buy" ? cmp(level.price, limit) > 0 : cmp(level.price, limit) < 0)) break;
    const qty = min(remaining, level.size);
    fills.push({ price: level.price, qty });
    remaining = sub(remaining, qty);
  }
  const filled = sum(fills.map((f) => f.qty));
  const notional = sum(fills.map((f) => mul(f.price, f.qty)));
  return {
    side,
    requested: size,
    filled,
    fills,
    notional,
    best: fills[0]?.price ?? null,
    worst: fills[fills.length - 1]?.price ?? null,
    vwap: cmp(filled, ZERO) > 0 ? div(notional, filled) : null,
    complete: cmp(remaining, ZERO) <= 0,
  };
}

export function walkBook(book: ParsedBook, side: TradeSide, size: Rational, limit?: Rational): Walk {
  return walkLevels(side === "buy" ? book.asks : book.bids, side, size, limit);
}

// ---------------------------------------------------------------------------------------------
// Quote

const VWAP_SCALE = 9;

export interface QuoteDetail {
  readonly quote: Quote;
  readonly walk: Walk;
  // A complement-derived book is arithmetic, not resting orders, so it can be shown but never
  // executed against.
  readonly executable: boolean;
  readonly complete: boolean;
  readonly notional: SDec;
  // Order-level fee with the venue's rounding. Null when the fee model is unknown or stale.
  readonly fee: SDec | null;
  // Buy: notional + fee. Sell: notional - fee. Null when the fee is null.
  readonly netCost: SDec | null;
  readonly feeError: { readonly code: FeeErrorCode; readonly detail: string } | null;
}

export type QuoteError = { readonly ok: false; readonly reason: string };

export function quoteBook(
  book: Book,
  side: TradeSide,
  requestedSize: Dec,
  spec: FeeSpec,
  nowMs: number,
  role: FeeRole = "taker",
): { readonly ok: true; readonly value: QuoteDetail } | QuoteError {
  const size = ratFromDec(requestedSize);
  if (!size.ok || cmp(size.value, ZERO) <= 0) return { ok: false, reason: "size must be a positive decimal" };
  const parsed = parseBook(book);
  if (!parsed.ok) return { ok: false, reason: `malformed book: ${parsed.detail ?? parsed.error}` };
  const walk = walkBook(parsed.value, side, size.value);

  let fee: Rational | null = null;
  let feeError: QuoteDetail["feeError"] = null;
  const usable = checkFeeSpec(spec, nowMs);
  if (!usable.ok) {
    feeError = { code: usable.code, detail: usable.detail };
  } else if (walk.fills.length > 0) {
    const computed = orderFee(spec, role, side, walk.fills);
    if (computed.ok) fee = computed.value;
    else feeError = { code: computed.code, detail: computed.detail };
  } else {
    fee = ZERO;
  }

  const filledText = ratToDecExact(walk.filled) ?? "0";
  const quote: Quote = {
    token: book.token,
    side,
    requestedSize: ratToDecExact(size.value) ?? requestedSize,
    filledSize: filledText,
    bestPrice: walk.best === null ? null : (ratToDecExact(walk.best) ?? null),
    vwap: walk.vwap === null ? null : ratToDec(walk.vwap, VWAP_SCALE, side === "buy" ? "ceil" : "floor"),
    feeSpecId: feeSpecId(spec),
    derived: book.derived,
    asOfMs: book.asOfMs,
  };
  const netCost = fee === null ? null : side === "buy" ? add(walk.notional, fee) : sub(walk.notional, fee);
  return {
    ok: true,
    value: {
      quote,
      walk,
      executable: book.derived === "native" && walk.complete && feeError === null,
      complete: walk.complete,
      notional: ratToDecExact(walk.notional) ?? "0",
      fee: fee === null ? null : ratToDecExact(fee),
      netCost: netCost === null ? null : ratToDecExact(netCost),
      feeError,
    },
  };
}
