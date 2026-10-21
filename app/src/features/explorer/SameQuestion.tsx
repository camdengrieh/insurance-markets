// "Same question elsewhere": the other legs of every approved link that names a market, as CANDIDATES (docs/dapp-
// design.md 4.5 "Linked groups", M3-9, M3-10), and below them the links the linker PROPOSED that no person has
// approved (docs/linker-runbook.md section 8). A candidate is never proof, a proposal even less so; no spread is
// drawn between candidates or proposals, the legs are re-checked against what the venues say now (a changed
// rules hash or close time suspends the link), and the "why this is never arbitrage" line is permanent. With no
// dataset bundled, the words say so.

import { useCallback } from "react";

import { Badge, DataTable, Num, venueName, type Tone } from "../../ui";
import type { MarketRef } from "../../core/ports";
import { WHY_NOT_ARBITRAGE } from "../../venues/quotient";
import { rulesComparable, type LinkLoad } from "../signals/links/dataset";
import { useLinkVerdict } from "../signals/LinkOverlay";
import type { LegReader } from "../signals/services";
import { LINK_STATE_TEXT, PROOF_TEXT, bandText } from "../signals/words";
import { LinkGroupPlaceholder, candidatesFor, type LinkCandidate } from "./links";

export const NO_APPROVED_LINK = "No approved link. A link exists only after a person approves it; until then no spread is shown and nothing is called an edge.";
export const CANDIDATES_NOTE = "Candidates come from approved links only, by id and hash, never from question text. A candidate becomes a leg only after a person approves the link and the rules hashes match. Until then no spread block is drawn.";
export const PROPOSED_HEADING = "Proposed by the linker (not approved)";
export const PROPOSED_NOTE =
  "A proposal is a statistical similarity of titles and rules that a scheduled job wrote into the registry. No person has approved it, so it is not a link: no price, no spread and no edge is shown for it, and it is never arbitrage.";
export const RULES_NOT_COMPARABLE = "The dataset's rules fingerprints use another recipe than this page, so the re-check compares close time and status only and cannot compare the rules.";

const VERDICT: Readonly<Record<string, { readonly tone: Tone; readonly text: string }>> = Object.freeze({
  verified: { tone: "ok", text: "verified now" },
  suspended: { tone: "danger", text: "suspended" },
  unverified: { tone: "warn", text: "not verified" },
  expired: { tone: "warn", text: "expired" },
});

function CheckedNow({ candidate, readLeg, nowMs, label = "" }: { readonly candidate: LinkCandidate; readonly readLeg: LegReader; readonly nowMs: () => number; readonly label?: string }) {
  const checked = useLinkVerdict(candidate.link, readLeg, nowMs);
  if (checked.checking) return <Badge tone="neutral">checking the legs</Badge>;
  const words = VERDICT[checked.verdict.state] ?? VERDICT.unverified;
  return (
    <Badge tone={words?.tone ?? "warn"}>
      {label}
      {words?.text ?? "not verified"}
    </Badge>
  );
}

// A reader that withholds the rules hash: when the dataset was hashed with another recipe, a comparison would
// report a change that is only a recipe difference. Unknown never counts as a match (verify.ts).
function useReaderFor(readLeg: LegReader, comparable: boolean): LegReader {
  return useCallback<LegReader>(
    async (leg) => {
      const seen = await readLeg(leg);
      if (comparable || seen.state !== "read") return seen;
      return { ...seen, rulesSha256: null };
    },
    [readLeg, comparable],
  );
}

function ProposedTier({ proposed, readLeg, nowMs, comparable, variant }: { readonly proposed: readonly LinkCandidate[]; readonly readLeg: LegReader; readonly nowMs: () => number; readonly comparable: boolean; readonly variant: "compact" | "full" }) {
  const reader = useReaderFor(readLeg, comparable);
  if (proposed.length === 0) return null;
  const heading = variant === "compact" ? <p className="explorer-caption">{PROPOSED_HEADING}</p> : <h5 className="explorer-caption">{PROPOSED_HEADING}</h5>;
  return (
    <div className="explorer-proposed" data-links="proposed" data-count={proposed.length}>
      {heading}
      <ul className="explorer-candidates" data-proposed-list="true">
        {proposed.map((candidate) => (
          <li key={`${candidate.link.linkId}:${candidate.leg.venue}:${candidate.leg.nativeId}`} data-proposed-id={candidate.link.linkId}>
            {venueName(candidate.leg.venue)} <Num>{candidate.leg.nativeId}</Num> <Badge tone="neutral">{candidate.leg.category ?? "category not given"}</Badge>{" "}
            <Badge tone="info">{bandText(candidate.link.band)}</Badge> <Badge tone="neutral">{candidate.link.relation.replaceAll("_", " ")}</Badge>{" "}
            <Badge tone="neutral">{LINK_STATE_TEXT[candidate.link.state] ?? "state not shown"}</Badge> <CheckedNow candidate={candidate} readLeg={reader} nowMs={nowMs} label="re-checked now: " />
          </li>
        ))}
      </ul>
      <p className="explorer-note">{PROPOSED_NOTE}</p>
      {comparable ? null : <p className="explorer-note">{RULES_NOT_COMPARABLE}</p>}
      <p className="explorer-why" data-why-not-arbitrage="proposed">
        {WHY_NOT_ARBITRAGE}
      </p>
    </div>
  );
}

export interface SameQuestionProps {
  readonly market: Pick<MarketRef, "venue" | "marketId">;
  readonly load: LinkLoad | null;
  readonly readLeg: LegReader;
  readonly nowMs: () => number;
  // compact: the inspector's list. full: the modal's legs table with Proof and State columns.
  readonly variant: "compact" | "full";
  readonly heading?: "h3" | "h4";
}

export function SameQuestion({ market, load, readLeg, nowMs, variant, heading = "h4" }: SameQuestionProps) {
  const lookup = candidatesFor(load, market);
  const comparable = load !== null && load.state === "loaded" ? rulesComparable(load.dataset) : true;
  let body;
  let proposed = null;
  if (lookup.state === "rejected") {
    body = <p data-links="rejected">The bundled link file was refused whole (it does not match its format or its own hash), so no candidate is shown.</p>;
  } else if (lookup.state === "no_dataset" || lookup.state === "none_for_market") {
    body = variant === "compact" ? <p data-links="none">{NO_APPROVED_LINK}</p> : <LinkGroupPlaceholder market={{ ...market, native: {} }} heading={heading} />;
  } else {
    proposed = <ProposedTier proposed={lookup.proposed} readLeg={readLeg} nowMs={nowMs} comparable={comparable} variant={variant} />;
    if (lookup.candidates.length === 0) {
      // Proposals only: the approved tier is honestly empty above them.
      body = <p data-links="none">{NO_APPROVED_LINK}</p>;
    } else if (variant === "compact") {
      body = (
        <ul className="explorer-candidates" data-links="candidates">
          {lookup.candidates.map((candidate) => (
            <li key={`${candidate.link.linkId}:${candidate.leg.venue}:${candidate.leg.nativeId}`}>
              {venueName(candidate.leg.venue)} <Num>{candidate.leg.nativeId}</Num> <Badge tone="info">{PROOF_TEXT[candidate.link.proof] ?? "proof level not shown"}</Badge>{" "}
              <Badge tone="neutral">{LINK_STATE_TEXT[candidate.link.state] ?? "state not shown"}</Badge>
            </li>
          ))}
        </ul>
      );
    } else {
      body = (
        <div data-links="candidates">
          <DataTable
            caption="Candidates from approved links"
            rows={lookup.candidates}
            rowKey={(candidate) => `${candidate.link.linkId}:${candidate.leg.venue}:${candidate.leg.nativeId}`}
            columns={[
              { key: "venue", header: "Venue", rowHeader: true, render: (candidate) => venueName(candidate.leg.venue) },
              { key: "listing", header: "Listing (the venue's id)", render: (candidate) => <Num>{candidate.leg.nativeId}</Num> },
              { key: "relation", header: "Relation", render: (candidate) => candidate.link.relation.replaceAll("_", " ") },
              { key: "proof", header: "Proof", render: (candidate) => PROOF_TEXT[candidate.link.proof] ?? "proof level not shown" },
              { key: "state", header: "State", render: (candidate) => LINK_STATE_TEXT[candidate.link.state] ?? "state not shown" },
              { key: "checked", header: "Checked now", render: (candidate) => <CheckedNow candidate={candidate} readLeg={readLeg} nowMs={nowMs} /> },
            ]}
          />
          {lookup.hidden > 0 ? <p className="explorer-note">{`${lookup.hidden} more candidate link${lookup.hidden === 1 ? " is" : "s are"} not shown: a candidate is never proof.`}</p> : null}
          <p className="explorer-note">No price is shown for a candidate here: nothing draws a spread between two markets that no person has linked.</p>
        </div>
      );
    }
  }
  return (
    <div className="explorer-same-question">
      {variant === "compact" ? <p className="explorer-caption">candidates, not proof</p> : <p className="explorer-note">{CANDIDATES_NOTE}</p>}
      {body}
      {proposed}
      {variant === "full" ? (
        <p className="explorer-why" data-why-not-arbitrage="market">
          {WHY_NOT_ARBITRAGE}
        </p>
      ) : null}
    </div>
  );
}
