// "Synthetic-shape tested" labelling (acceptance M2-5; docs/dapp-design.md 10, DT8).
//
// A populated position answer was never observed live from XO, Polymarket or Pascal, and the Trueo reads were
// tested against an in-memory chain. Until DT8 records a real populated read for a venue, every row from it is
// labelled, so nobody mistakes a tested parser for a verified source. This table is the only place that says a
// shape was observed; flipping a value is a reviewed change made after the live read, never a runtime setting.

import type { VenueId } from "../../core/ports";
import type { ShapeEvidence } from "./types";

const OBSERVED_POPULATED: Readonly<Partial<Record<VenueId, boolean>>> = Object.freeze({
  xo: false,
  polymarket: false,
  pascal: false,
  trueo: false,
});

export function shapeEvidenceOf(venue: VenueId): ShapeEvidence {
  return OBSERVED_POPULATED[venue] === true ? "recorded" : "synthetic-shape tested";
}

export const SHAPE_LABEL_TEXT = "synthetic-shape tested";
export const SHAPE_EXPLANATION =
  "The parser for this venue's position answer was tested against example data written from its documentation. No real populated answer has been captured yet, so treat the figures as unconfirmed.";
