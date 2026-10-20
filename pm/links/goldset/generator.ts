// Candidate generators plug in here. A generator maps unlabelled pairs to verdicts; it can only
// PROPOSE (via store.proposeLink, which writes a candidate) or VETO. Nothing in this folder
// imports approve.ts, and a test reads the sources to keep it that way.

import type { LinkLeg, CandidateInput } from "../schema.js";
import type { Prediction } from "./format.js";

export interface PairInput {
  readonly pairId: string;
  readonly a: LinkLeg;
  readonly b: LinkLeg;
}

export type CandidateGenerator = (pairs: readonly PairInput[]) => Prediction[];

// Baseline for tests and for measuring "is anything better than nothing": two different venues,
// byte-identical rule hashes and equal outcome counts link as identity with no axes; equal masked
// hashes with different rules abstain (a human must read the difference); everything else rejects.
// It cannot see orientation, so it only ever claims the identity map. Do not use it to approve.
export const exactRulesBaseline: CandidateGenerator = (pairs) =>
  pairs.map((p): Prediction => {
    if (p.a.venue === p.b.venue || p.a.outcomeMap.length !== p.b.outcomeMap.length) {
      return { pairId: p.pairId, verdict: "reject" };
    }
    if (p.a.rulesSha256 === p.b.rulesSha256) {
      return {
        pairId: p.pairId,
        verdict: "link",
        relation: "identity",
        outcomeMap: p.a.outcomeMap.map((_, i) => i),
        axes: [],
      };
    }
    if (p.a.maskedSha256 === p.b.maskedSha256) return { pairId: p.pairId, verdict: "abstain" };
    return { pairId: p.pairId, verdict: "reject" };
  });

export type CandidateBuild =
  | { readonly ok: true; readonly input: CandidateInput }
  | { readonly ok: false; readonly reason: string };

// Turns a link verdict into input for `proposeLink`. Only axis-free identity verdicts convert:
// anything with axes needs a human to write the typed differences.
export function candidateFromPrediction(pair: PairInput, prediction: Prediction, validUntil: string): CandidateBuild {
  if (prediction.verdict !== "link") return { ok: false, reason: "not a link verdict" };
  if (prediction.relation !== "identity" || (prediction.axes ?? []).length > 0) {
    return { ok: false, reason: "only axis-free identity verdicts convert; a human must type the rest" };
  }
  const map = prediction.outcomeMap ?? [];
  if (map.length !== pair.b.outcomeMap.length) return { ok: false, reason: "outcome map length mismatch" };
  const legB: LinkLeg = { ...pair.b, outcomeMap: map };
  const closeDelta = Math.abs(Date.parse(pair.a.closeUtc) - Date.parse(pair.b.closeUtc)) / 60_000;
  if (!Number.isInteger(closeDelta)) return { ok: false, reason: "close times are not whole minutes apart" };
  return {
    ok: true,
    input: {
      relation: "identity",
      legs: [{ ...pair.a, outcomeMap: pair.a.outcomeMap.map((_, i) => i) }, legB],
      basis: { class: "identical", axes: [], cutoffDeltaMinutes: closeDelta === 0 ? 0 : null },
      proof: {
        level: "P1_slot_equal",
        evidence: [{ method: "slot_equal", detail: "byte-identical rules hash on both legs" }],
      },
      validUntil,
      synthetic: pair.a.marketId.startsWith("SYNTHETIC-") && pair.b.marketId.startsWith("SYNTHETIC-"),
    },
  };
}
