import { parseBook, topOfBook } from "../sdk/engine/books.js";
import { unknownFeeSpec } from "../sdk/engine/fee-specs.js";
import { quoteBook, type TradeSide } from "../sdk/engine/walk.js";
import type { DatasetLink } from "../sdk/links/dataset.js";
import type { Dec, VenueId } from "../sdk/model.js";
import { compareDecimal } from "../sdk/money/decimal.js";
import { cmp } from "../sdk/money/rational.js";
import type { Origin, TradeView } from "./markets.js";

// GET /v1/quote (docs/sdk-and-api-design.md section 4): the depth-walked fill of a stated size across a group's venues,
// after fees, best venue first. All the arithmetic is the SDK engine's (sdk/engine: the depth walk, the fee models and the
// fee-spec id), over the books the API reads for served venues only (markets.ts tradeView). It fails closed exactly as the
// engine does, and a little earlier:
//   - an unknown fee model, a stale or undated fee spec, or a parameter the model needs and the spec lacks: the walk is
//     shown, the fee and the net cost are null with the engine's code, and the leg is not executable;
//   - a complement book (arithmetic on the other outcome's book, not resting orders) is never executable;
//   - a crossed or locked book is refused outright, as the engine's normalisers refuse it: no number is quoted from it;
//   - a market the venue does not list as tradable, or a size the book cannot fill, is not executable.
// Every number carries its source and age: the book's (venue_api, chain or cache, with the time read), the fee spec's (where
// its parameters were read, when, and its time to live) and the market's.
//
// A group is a link from /v1/groups: approved (a person approved it) or proposed (a linker candidate, always labelled so and
// never presented as approved). Only an identity link is quoted, because only there is an outcome on one venue the same
// claim as the mapped outcome on another; near-identity and the other relations carry a recorded difference.

export const QUOTABLE_RELATIONS = ["identity"] as const;

export interface QuotableGroup {
  readonly link: DatasetLink;
  readonly state: "approved" | "proposed";
}

export interface LegQuote {
  readonly venue: VenueId;
  readonly marketId: string;
  // The leg's own outcome index that the requested outcome maps to; null when the map does not name it once.
  readonly outcomeIndex: number | null;
  readonly tokenId: string | null;
  readonly collateral: string | null;
  readonly executable: boolean;
  // 1 for the best executable leg; null for a leg that is not executable.
  readonly rank: number | null;
  readonly reasons: readonly string[];
  readonly quote: {
    readonly requestedSize: Dec;
    readonly filledSize: Dec;
    readonly complete: boolean;
    readonly bestPrice: Dec | null;
    readonly vwap: Dec | null;
    readonly notional: string;
    readonly fee: string | null;
    readonly netCost: string | null;
    readonly feeSpecId: string;
    readonly feePayer: string | null;
    readonly feeError: { readonly code: string; readonly detail: string } | null;
    readonly derived: "native" | "complement";
  } | null;
  readonly sources: {
    readonly market: Origin | null;
    readonly book: (Origin & { readonly bookAsOfMs?: number }) | null;
    readonly fee: {
      readonly read: Origin;
      readonly url: string | null;
      readonly field: string | null;
      readonly verifiedAt: string | null;
      readonly ttlSec: number | null;
      readonly ageMs: number | null;
    } | null;
  };
}

// The leg's outcome index for `outcome` (an index in the link's first leg): the one i with outcomeMap[i] === outcome.
export function legOutcomeIndex(outcomeMap: readonly number[], outcome: number): number | null {
  const found = outcomeMap.flatMap((value, index) => (value === outcome ? [index] : []));
  return found.length === 1 ? (found[0] as number) : null;
}

function unavailable(venue: VenueId, marketId: string, outcomeIndex: number | null, reason: string, market: Origin | null = null): LegQuote {
  return { venue, marketId, outcomeIndex, tokenId: null, collateral: null, executable: false, rank: null, reasons: [reason], quote: null, sources: { market, book: null, fee: null } };
}

export function legUnavailable(venue: VenueId, marketId: string, outcomeIndex: number | null, reason: string): LegQuote {
  return unavailable(venue, marketId, outcomeIndex, reason);
}

// One leg, priced by the engine.
export function quoteLeg(args: { readonly venue: VenueId; readonly marketId: string; readonly outcomeIndex: number; readonly view: TradeView }, side: TradeSide, size: Dec, nowMs: number): LegQuote {
  const { venue, marketId, outcomeIndex, view } = args;
  const outcome = view.market.outcomes.find((o) => o.index === outcomeIndex);
  if (outcome === undefined) return unavailable(venue, marketId, outcomeIndex, "The market has no outcome at the index the link maps to.", view.marketOrigin);
  const row = view.books.find((b) => b.tokenId === outcome.tokenId);
  const spec = view.fee;
  const feeSource = {
    read: view.feeOrigin,
    url: spec?.paramsSource.url ?? null,
    field: spec?.paramsSource.field ?? null,
    verifiedAt: spec?.verifiedAt ?? null,
    ttlSec: spec?.ttlSec ?? null,
    ageMs: spec === null ? null : Number.isFinite(Date.parse(spec.verifiedAt)) ? Math.max(0, nowMs - Date.parse(spec.verifiedAt)) : null,
  };
  const base = { venue, marketId, outcomeIndex, tokenId: outcome.tokenId, collateral: view.market.collateral.symbol };
  if (row === undefined || row.book === null) {
    const reason = row === undefined || row.source.source !== null ? "The book was not read." : row.source.reason;
    return { ...base, executable: false, rank: null, reasons: [reason], quote: null, sources: { market: view.marketOrigin, book: row?.source ?? null, fee: feeSource } };
  }
  const book = row.book;
  const bookSource = { ...row.source, bookAsOfMs: book.asOfMs };
  const parsed = parseBook(book);
  if (!parsed.ok) return { ...base, executable: false, rank: null, reasons: [`The book is malformed (${parsed.detail ?? parsed.error}); nothing is quoted from it.`], quote: null, sources: { market: view.marketOrigin, book: bookSource, fee: feeSource } };
  const top = topOfBook(parsed.value);
  if (top.bid !== null && top.ask !== null && cmp(top.bid, top.ask) >= 0) {
    return { ...base, executable: false, rank: null, reasons: ["The book is crossed or locked (best bid at or above best ask), which the engine refuses as corrupt or mid-update; nothing is quoted from it."], quote: null, sources: { market: view.marketOrigin, book: bookSource, fee: feeSource } };
  }
  // No fee read: the engine is handed a spec whose model is unknown, so it fails closed with MODEL_UNKNOWN.
  const usedSpec = spec ?? unknownFeeSpec(venue, { url: "none", field: "none", granularity: "market", verifiedAt: new Date(nowMs).toISOString(), ttlSec: 1 });
  const result = quoteBook(book, side, size, usedSpec, nowMs);
  if (!result.ok) return { ...base, executable: false, rank: null, reasons: [`The engine refused the quote: ${result.reason}.`], quote: null, sources: { market: view.marketOrigin, book: bookSource, fee: feeSource } };
  const detail = result.value;
  const reasons: string[] = [];
  if (book.derived === "complement") reasons.push("The book is the complement of the other outcome's book (arithmetic, not resting orders): never executable.");
  if (!detail.complete) reasons.push(`The book holds less than the size: ${detail.quote.filledSize} of ${detail.quote.requestedSize} filled.`);
  if (detail.feeError !== null) reasons.push(`The fee is not known (${detail.feeError.code}: ${detail.feeError.detail}), so no net cost is stated.`);
  if (spec === null && view.feeOrigin.source === null) reasons.push(view.feeOrigin.reason);
  if (!view.market.tradable.ok) reasons.push(`The venue does not list the market as tradable${view.market.tradable.reasons.length > 0 ? `: ${view.market.tradable.reasons.join("; ")}` : ""}.`);
  const executable = detail.executable && view.market.tradable.ok;
  return {
    ...base,
    executable,
    rank: null,
    reasons,
    quote: {
      requestedSize: detail.quote.requestedSize,
      filledSize: detail.quote.filledSize,
      complete: detail.complete,
      bestPrice: detail.quote.bestPrice,
      vwap: detail.quote.vwap,
      notional: detail.notional,
      fee: detail.fee,
      netCost: detail.netCost,
      feeSpecId: detail.quote.feeSpecId,
      feePayer: spec?.payer ?? null,
      feeError: detail.feeError,
      derived: detail.quote.derived,
    },
    sources: { market: view.marketOrigin, book: bookSource, fee: feeSource },
  };
}

// Best venue first: executable legs by net cost (a buy pays least first, a sell receives most first), then every other leg
// in the link's order, unranked. Ties keep the link's order.
export function rankLegs(legs: readonly LegQuote[], side: TradeSide): LegQuote[] {
  const executable = legs
    .map((leg, order) => ({ leg, order }))
    .filter((entry) => entry.leg.executable && entry.leg.quote?.netCost !== null && entry.leg.quote?.netCost !== undefined);
  executable.sort((a, b) => {
    const c = compareDecimal(a.leg.quote?.netCost, b.leg.quote?.netCost, { allowNegative: true }) ?? 0;
    return c !== 0 ? (side === "buy" ? c : -c) : a.order - b.order;
  });
  const ranked = executable.map((entry, index) => ({ ...entry.leg, rank: index + 1 }));
  const rest = legs.filter((leg) => !executable.some((entry) => entry.leg === leg)).map((leg) => ({ ...leg, executable: false, rank: null }));
  return [...ranked, ...rest];
}

export function groupLabel(group: QuotableGroup): Record<string, unknown> {
  const link = group.link;
  return {
    linkId: link.linkId,
    relation: link.relation,
    state: group.state,
    ...(group.state === "approved"
      ? { approval: "A person approved this link (a recorded approval in the link registry)." }
      : { approval: "Proposed: a linker candidate that no person has approved. The legs may not settle alike.", ...(link.band === undefined ? {} : { band: link.band }) }),
    proof: link.proof,
    validUntil: link.validUntil,
  };
}
