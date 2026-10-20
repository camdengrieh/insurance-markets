import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeeSpec } from "../../types.js";
import { polymarketFeeSpec } from "../../core/fee-specs.js";
import {
  bucketCheck,
  complementCheck,
  implicationCheck,
  ladderCheck,
  partitionCheck,
  rungImplies,
  type PackageResult,
  type QuotedLeg,
  type Rung,
} from "../../core/relations.js";
import { dec } from "../../core/rational.js";
import { NOW_MS, SOURCE, at } from "./helpers.js";

const P0 = polymarketFeeSpec({ rate: "0", source: SOURCE });
const P4 = polymarketFeeSpec({ rate: "0.04", source: SOURCE });
const rp = { nowMs: NOW_MS };

function q(id: string, bid: string | null, ask: string | null, spec: FeeSpec = P0, noAsk?: string | null): QuotedLeg {
  return {
    id,
    bid: bid === null ? null : dec(bid),
    ask: ask === null ? null : dec(ask),
    spec,
    ...(noAsk === undefined ? {} : { noAsk: noAsk === null ? null : dec(noAsk) }),
  };
}

function net(r: PackageResult): string {
  assert.equal(r.kind, "ok", r.kind === "ok" ? "" : JSON.stringify(r));
  return r.kind === "ok" ? at(r.edge.net, 6) : "";
}

test("complement: a normal pair has negative net; a positive gross gap is flagged as a stale print", () => {
  const normal = complementCheck(q("yes", "0.46", "0.48"), q("no", "0.51", "0.54"), rp);
  assert.equal(net(normal.long), "-0.02");
  assert.equal(net(normal.short), "-0.03");
  assert.equal(normal.grossGapSuspect, false);
  // asks summing to 0.98: on a mirrored venue this cannot persist
  const crossed = complementCheck(q("yes", "0.46", "0.48"), q("no", "0.51", "0.50"), rp);
  assert.equal(net(crossed.long), "0.02");
  assert.equal(crossed.grossGapSuspect, true);
  // fees can eat the gross gap but the suspicion is about the gross
  const fee = complementCheck(q("yes", null, "0.47", P4), q("no", null, "0.51", P4), rp);
  assert.equal(net(fee.long), "0.00004");
  assert.equal(fee.short.kind, "unavailable");
});

test("partition: long needs exhaustiveness, short is always offered, sums are reported", () => {
  const legs = [q("a", "0.28", "0.30", P4), q("b", "0.32", "0.34", P4), q("c", "0.30", "0.33", P4)];
  const exhaustive = partitionCheck(legs, "by_rule", rp);
  assert.equal(at(exhaustive.sumAsk, 2), "0.97");
  assert.equal(at(exhaustive.sumBid, 2), "0.9");
  // 1 - 0.97 - 0.04 x (0.21 + 0.2244 + 0.2211) = 0.03 - 0.02622
  assert.equal(net(exhaustive.long), "0.00378");
  assert.equal(net(exhaustive.short), "-0.125168"); // 0.9 - 1 - 0.04 x (0.2016 + 0.2176 + 0.21) on the NO legs
  for (const kind of ["no", "unknown"] as const) {
    const r = partitionCheck(legs, kind, rp);
    assert.equal(r.long.kind, "unavailable");
    assert.equal(r.short.kind, "ok");
  }
  assert.equal(partitionCheck(legs, "proven", rp).long.kind, "ok");
});

test("partition: exclusive-but-not-exhaustive (Senate control) never offers the long basket", () => {
  // asks sum to 1.02 (a third outcome exists); bids sum to 1.00
  const legs = [q("dem", "0.62", "0.63"), q("rep", "0.38", "0.39")];
  const r = partitionCheck(legs, "no", rp);
  assert.equal(at(r.sumAsk, 2), "1.02");
  assert.equal(r.long.kind, "unavailable");
  assert.equal(net(r.short), "0");
  // asks that DO sum below 1 are still not an arbitrage when the set is not exhaustive
  const cheap = partitionCheck([q("x", "0.30", "0.31"), q("y", "0.30", "0.31")], "no", rp);
  assert.equal(cheap.long.kind, "unavailable");
});

test("partition short uses a native NO ask when the venue publishes one", () => {
  const legs = [q("a", "0.40", "0.45", P0, "0.58"), q("b", "0.35", "0.40", P0, "0.63")];
  // buy both NOs: 0.58 + 0.63 = 1.21 against a payoff of 1
  assert.equal(net(partitionCheck(legs, "no", rp).short), "-0.21");
  // without noAsk the mirrored price 1 - bid is used: 0.60 + 0.65
  assert.equal(net(partitionCheck([q("a", "0.40", "0.45"), q("b", "0.35", "0.40")], "no", rp).short), "-0.25");
});

test("partition: fewer than two outcomes or a missing quote is unavailable, never zero", () => {
  assert.equal(partitionCheck([q("a", "0.4", "0.5")], "proven", rp).long.kind, "unavailable");
  const missing = partitionCheck([q("a", null, "0.4"), q("b", null, null)], "proven", rp);
  assert.equal(missing.long.kind, "unavailable");
  assert.equal(missing.sumAsk, null);
  assert.equal(missing.short.kind, "unavailable");
});

test("a stale fee spec surfaces as an error result, not as a number", () => {
  const stale: FeeSpec = { ...P4, verifiedAt: "2020-01-01", ttlSec: 60 };
  const r = complementCheck(q("yes", null, "0.4", stale), q("no", null, "0.4", stale), rp);
  assert.equal(r.long.kind, "error");
  if (r.long.kind === "error") assert.equal(r.long.code, "SPEC_STALE");
});

test("implication: sell the antecedent at its bid, buy the consequent at its ask", () => {
  assert.equal(net(implicationCheck(q("G", "0.35", "0.36"), q("N", "0.33", "0.34"), rp)), "0.01");
  // 4% fees on both legs more than remove a 1 cent gap
  assert.equal(Number(net(implicationCheck(q("G", "0.35", "0.36", P4), q("N", "0.33", "0.34", P4), rp))) < 0, true);
  assert.equal(implicationCheck(q("G", null, "0.36"), q("N", "0.33", "0.34"), rp).kind, "unavailable");
});

// ---------------------------------------------------------------------------------------------
// ladders

const day = (d: number): number => Date.UTC(2026, 9, d);
function rung(id: string, strike: string, deadlineMs: number, opts: Partial<Rung> = {}, bid: string | null = "0.5", ask: string | null = "0.5"): Rung {
  return { quote: q(id, bid, ask), strike: dec(strike), deadlineMs, direction: "above", kind: "touch", ...opts };
}

test("terminal ladders compare only on the same deadline; a higher strike is the stronger event", () => {
  const hi = rung("hi", "100", day(31), { kind: "terminal" });
  const lo = rung("lo", "90", day(31), { kind: "terminal" });
  assert.equal(rungImplies(hi, lo), true);
  assert.equal(rungImplies(lo, hi), false);
  assert.equal(rungImplies(hi, rung("lo-later", "90", day(30), { kind: "terminal" })), false);
  assert.equal(rungImplies(hi, rung("same", "100", day(31), { kind: "terminal" })), false);
  // "below" markets reverse the strike order
  assert.equal(rungImplies(rung("b90", "90", day(31), { kind: "terminal", direction: "below" }), rung("b100", "100", day(31), { kind: "terminal", direction: "below" })), true);
});

test("touch ladders are a lattice: strike and deadline must both agree, else incomparable", () => {
  const eth2900Oct = rung("eth2900-oct", "2900", day(31));
  const eth3000Dec = rung("eth3000-dec", "3000", Date.UTC(2026, 11, 31));
  assert.equal(rungImplies(eth2900Oct, eth3000Dec), false);
  assert.equal(rungImplies(eth3000Dec, eth2900Oct), false);
  const eth3000Oct = rung("eth3000-oct", "3000", day(31));
  assert.equal(rungImplies(eth3000Oct, eth2900Oct), true); // harder strike, same date
  assert.equal(rungImplies(eth3000Oct, rung("eth2900-dec", "2900", Date.UTC(2026, 11, 31))), true); // harder and earlier
  assert.equal(rungImplies(eth2900Oct, rung("eth2900-dec", "2900", Date.UTC(2026, 11, 31))), true); // same strike, earlier deadline
  assert.equal(rungImplies(rung("x", "2900", day(31)), rung("y", "2900", day(31))), false);
  // touch versus terminal semantics and above versus below are never mixed
  assert.equal(rungImplies(rung("t", "3000", day(31)), rung("m", "2900", day(31), { kind: "terminal" })), false);
  assert.equal(rungImplies(rung("u", "3000", day(31)), rung("d", "2900", day(31), { direction: "below" })), false);
});

test("ladderCheck finds the violated rung pair and counts incomparable pairs", () => {
  const rungs = [
    rung("k100", "100", day(31), { kind: "terminal" }, "0.50", "0.52"), // harder rung bids 0.50
    rung("k90", "90", day(31), { kind: "terminal" }, "0.44", "0.45"), // easier rung asks 0.45
    rung("k80", "80", day(31), { kind: "terminal" }, "0.60", "0.62"),
    rung("other-date", "95", day(30), { kind: "terminal" }),
  ];
  const r = ladderCheck(rungs, rp);
  assert.equal(r.pairsChecked, 3);
  assert.equal(r.incomparablePairs, 3);
  assert.equal(r.violations.length, 1);
  const v = r.violations[0];
  assert.equal(v?.antecedent, "k100");
  assert.equal(v?.consequent, "k90");
  assert.equal(net(v?.result ?? { kind: "unavailable", reason: "" }), "0.05");
});

test("a coherent ladder has no violations", () => {
  const rungs = [
    rung("k100", "100", day(31), { kind: "terminal" }, "0.30", "0.32"),
    rung("k90", "90", day(31), { kind: "terminal" }, "0.45", "0.47"),
    rung("k80", "80", day(31), { kind: "terminal" }, "0.60", "0.62"),
  ];
  const r = ladderCheck(rungs, rp);
  assert.equal(r.pairsChecked, 3);
  assert.equal(r.violations.length, 0);
});

test("bucket = difference of two ladder rungs: replication gaps in both directions", () => {
  // G(90) = bucket[90,100) + G(100)
  const easier = q("g90", "0.60", "0.62");
  const harder = q("g100", "0.28", "0.30");
  const rich = bucketCheck(q("bkt", "0.28", "0.30"), easier, harder, rp);
  // long bucket: sell G90 at 0.60, buy bucket 0.30 and G100 0.30 -> 0.00
  assert.equal(net(rich.longBucket), "0");
  const cheap = bucketCheck(q("bkt", "0.28", "0.25"), easier, harder, rp);
  assert.equal(net(cheap.longBucket), "0.05");
  // short bucket: buy G90 0.62, sell bucket 0.28 and G100 0.28 -> -0.06
  assert.equal(net(rich.shortBucket), "-0.06");
  const dear = bucketCheck(q("bkt", "0.36", "0.38"), q("g90", "0.60", "0.62"), q("g100", "0.28", "0.30"), rp);
  assert.equal(net(dear.shortBucket), "0.02");
});
