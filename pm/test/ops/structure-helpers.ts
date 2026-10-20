// Builders shared by the pm_check_structure tests. Not a test file.
import type { FeeSource } from "../../core/fee-specs.js";
import { polymarketFeeSpec } from "../../core/fee-specs.js";
import { ratFromDec, mul, neg, ratToDec, type Rational } from "../../core/rational.js";
import type { Book, Exhaustive, FeeSpec, GroupKind, Status, VenueId } from "../../types.js";
import { untrusted } from "../../types.js";
import type { RungSpec, StructureGroup, StructureMember } from "../../ops/structure-types.js";

export const NOW_MS = Date.parse("2026-10-20T12:00:00Z");
export const DAY_MS = 86_400_000;

export const SOURCE: FeeSource = {
  url: "https://example.invalid/fees",
  field: "feeSchedule",
  granularity: "market",
  verifiedAt: "2026-10-19",
  ttlSec: 365 * 24 * 3600,
};

export const poly = (rate: string): FeeSpec => polymarketFeeSpec({ rate, source: SOURCE });

export type Levels = readonly (readonly [string, string])[];

export function book(
  venue: VenueId,
  tokenId: string,
  bids: Levels,
  asks: Levels,
  opts: { asOfMs?: number; derived?: "native" | "complement" } = {},
): Book {
  return {
    token: { venue, tokenId },
    bids: bids.map(([price, size]) => ({ price, size })),
    asks: asks.map(([price, size]) => ({ price, size })),
    convention: "best_first",
    asOfMs: opts.asOfMs ?? NOW_MS - 1_000,
    derived: opts.derived ?? "native",
  };
}

export interface MemberOpts {
  readonly venue?: VenueId;
  readonly yes?: { bids: Levels; asks: Levels } | Book | null;
  readonly no?: { bids: Levels; asks: Levels } | Book | null;
  readonly fee?: FeeSpec;
  readonly status?: Status;
  readonly tradable?: boolean;
  readonly closesAtMs?: number | null;
  readonly disputeOrProposal?: boolean;
  readonly label?: string;
  readonly asOfMs?: number;
  readonly rung?: RungSpec;
  readonly rulesPin?: { pinned: string; current: string };
}

function asBook(venue: VenueId, tokenId: string, src: MemberOpts["yes"], asOfMs: number | undefined): Book | null {
  if (src === undefined || src === null) return null;
  if ("token" in src) return src;
  return book(venue, tokenId, src.bids, src.asks, asOfMs === undefined ? {} : { asOfMs });
}

export function member(id: string, o: MemberOpts = {}): StructureMember {
  const venue = o.venue ?? "polymarket";
  return {
    id,
    label: untrusted(o.label ?? `Outcome ${id}`),
    status: o.status ?? "active",
    tradable: o.tradable ?? true,
    closesAtMs: o.closesAtMs === undefined ? NOW_MS + 30 * DAY_MS : o.closesAtMs,
    disputeOrProposal: o.disputeOrProposal ?? false,
    yes: asBook(venue, `${id}-yes`, o.yes, o.asOfMs),
    no: asBook(venue, `${id}-no`, o.no, o.asOfMs),
    fee: o.fee ?? poly("0.04"),
    ...(o.rung === undefined ? {} : { rung: o.rung }),
    ...(o.rulesPin === undefined ? {} : { rulesPin: o.rulesPin }),
  };
}

export interface GroupOpts {
  readonly venue?: VenueId;
  readonly key?: string;
  readonly kind?: GroupKind;
  readonly exhaustive?: Exhaustive;
  readonly membersComplete?: boolean;
  readonly resolutionAtMs?: number | null;
  readonly disputeTail?: { probability: string; deltaDays: string };
}

export function group(members: readonly StructureMember[], o: GroupOpts = {}): StructureGroup {
  return {
    venue: o.venue ?? "polymarket",
    key: o.key ?? "event-1",
    kind: o.kind ?? "neg_risk",
    exhaustive: o.exhaustive ?? "by_rule",
    membersComplete: o.membersComplete ?? true,
    members,
    resolutionAtMs: o.resolutionAtMs === undefined ? NOW_MS + 30 * DAY_MS : o.resolutionAtMs,
    ...(o.disputeTail === undefined ? {} : { disputeTail: o.disputeTail }),
  };
}

// A book pair that quotes `ask` with a bid 2 cents below, depth 100 shares.
export function quote(ask: string, size = "100", spread = "0.02"): { bids: Levels; asks: Levels } {
  const a = ratFromDec(ask);
  const s = ratFromDec(spread);
  if (!a.ok || !s.ok) throw new Error("bad quote fixture");
  const bid = ratToDec({ n: a.value.n * s.value.d - s.value.n * a.value.d, d: a.value.d * s.value.d }, 6, "half_up");
  return { bids: [[bid, size]], asks: [[ask, size]] };
}

// No friction at all: isolates the pure price relation.
export const FRICTIONLESS = { tau: "0", hurdleApy: "0", reservePerShare: "0" } as const;

export function times(value: string, factor: string, places: number): string {
  const negative = value.startsWith("-");
  const v = ratFromDec(negative ? value.slice(1) : value);
  const f = ratFromDec(factor);
  if (!v.ok || !f.ok) throw new Error("bad decimal");
  const product: Rational = mul(v.value, f.value);
  return ratToDec(negative ? neg(product) : product, places, "half_up");
}
