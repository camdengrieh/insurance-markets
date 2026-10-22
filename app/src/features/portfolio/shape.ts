// "Synthetic-shape tested" labelling (acceptance M2-5; docs/dapp-design.md 10, DT8).
//
// A populated position answer was never observed live from Pascal, and the Trueo reads were tested against an
// in-memory chain. Until DT8 records a real populated read for a venue, every row from it is
// labelled, so nobody mistakes a tested parser for a verified source. This table is the only place that says a
// shape was observed; flipping a value is a reviewed change made after the live read, never a runtime setting.

import type { VenueId } from "../../core/ports";
import type { ShapeEvidence } from "./types";

// XO, Polymarket and Limitless rows come from the chain readers (chain-reads.ts), whose answers were recorded from
// the public RPCs on 2026-10-22 with a populated holding for each venue (sdk/chain/<venue>/fixtures and
// sdk/chain/readers.test.ts): a balance and a result are contract reads, not a venue's answer shape.
const OBSERVED_POPULATED: Readonly<Partial<Record<VenueId, boolean>>> = Object.freeze({
  xo: true,
  polymarket: true,
  limitless: true,
  pascal: false,
  trueo: false,
});

export function shapeEvidenceOf(venue: VenueId): ShapeEvidence {
  return OBSERVED_POPULATED[venue] === true ? "recorded" : "synthetic-shape tested";
}

export const SHAPE_LABEL_TEXT = "synthetic-shape tested";
export const SHAPE_EXPLANATION =
  "The parser for this venue's position answer was tested against example data written from its documentation. No real populated answer has been captured yet, so treat the figures as unconfirmed.";
