// The link overlay: which approved cross-venue links name this market, checked against the live legs (M3-9, M3-10).
//
// Shows "no links" when no dataset is bundled, when the dataset was rejected, and when no approved link names the
// market. A link is shown with its proof level and state, and every leg's rules hash and close time are compared with
// what the venue says now: a changed hash or close time SUSPENDS the link in the page, with no model in the loop.
// The label on a link's spread never goes above `hedged_discrepancy` (and no spread is computed here at all, because
// the legs' order books are not read on this screen), and the "why not arbitrage" line is always present.

import { useEffect, useState } from "react";

import { Badge, Missing, formatUtc, useNow, venueName, type Tone } from "../../ui";
import { WHY_NOT_ARBITRAGE } from "./quotient";
import type { QuotientRow } from "./quotient";
import { DATASET_STALE_AFTER_DAYS, datasetAge, linksForLeg, type LinkLoad } from "./links/dataset";
import type { Link, LinkDataset } from "./links/schema";
import { linkLabel, verifyLink, type LegCheck, type LinkVerdict } from "./links/verify";
import type { LegReader } from "./services";
import { LINK_LABEL_REASON_TEXT, LINK_REASON_TEXT, LINK_STATE_TEXT, PROOF_TEXT, spreadLabelText } from "./words";

const REJECTION_TEXT: Readonly<Record<string, string>> = Object.freeze({
  not_an_object: "The bundled link file is not a link dataset.",
  schema: "The bundled link file does not match the dataset format (it may carry text it must not).",
  hash_mismatch: "The bundled link file does not match its own content hash, so none of it is used.",
});

export function keysOfRow(row: QuotientRow): string[] {
  const keys = new Set<string>();
  if (row.key !== null) keys.add(row.key);
  for (const listing of row.sports?.listings ?? []) if (listing.marketKey !== null) keys.add(listing.marketKey);
  return [...keys];
}

export function linksOfRow(dataset: LinkDataset, row: QuotientRow): { readonly shown: readonly Link[]; readonly hidden: number } {
  const byId = new Map<string, Link>();
  let hidden = 0;
  for (const key of keysOfRow(row)) {
    const found = linksForLeg(dataset, { quotientKey: key });
    for (const link of found.shown) byId.set(link.linkId, link);
    hidden = Math.max(hidden, found.hidden);
  }
  return { shown: [...byId.values()], hidden };
}

type Checking = { readonly checking: true } | { readonly checking: false; readonly verdict: LinkVerdict };

// Reads every leg once per link and mount, then verifies. A throwing reader is "unreadable", never a pass.
export function useLinkVerdict(link: Link, readLeg: LegReader, nowMs: () => number): Checking {
  const [state, setState] = useState<Checking>({ checking: true });
  useEffect(() => {
    let live = true;
    void Promise.all(link.legs.map((leg) => readLeg(leg).catch(() => ({ state: "unavailable" as const })))).then((observed) => {
      if (live) setState({ checking: false, verdict: verifyLink(link, observed, nowMs()) });
    });
    return () => {
      live = false;
    };
  }, [link, readLeg, nowMs]);
  return state;
}

const LEG_CHECK_TEXT: Readonly<Record<LegCheck, string>> = Object.freeze({ match: "matches", changed: "CHANGED", unavailable: "could not be compared" });
const LEG_CHECK_TONE: Readonly<Record<LegCheck, Tone>> = Object.freeze({ match: "ok", changed: "danger", unavailable: "warn" });

const VERDICT_TEXT: Readonly<Record<LinkVerdict["state"], { readonly tone: Tone; readonly text: string }>> = Object.freeze({
  verified: { tone: "ok", text: "verified now" },
  suspended: { tone: "danger", text: "SUSPENDED" },
  unverified: { tone: "warn", text: "not verified" },
  expired: { tone: "warn", text: "expired" },
});

function LinkItem({ link, readLeg, nowMs }: { readonly link: Link; readonly readLeg: LegReader; readonly nowMs: () => number }) {
  const checked = useLinkVerdict(link, readLeg, nowMs);
  const verdict = checked.checking ? null : checked.verdict;
  // No order books are read on this screen, so no spread is computed and the label can only be `indicative`.
  const label = verdict === null ? null : linkLabel(link, verdict, { bothAvailable: false });
  return (
    <li className="signals-link" data-link-state={verdict?.state ?? "checking"}>
      <p>
        <Badge tone="info">{PROOF_TEXT[link.proof] ?? "proof level not shown"}</Badge> <Badge tone="neutral">{LINK_STATE_TEXT[link.state] ?? "state not shown"}</Badge>{" "}
        {verdict === null ? <Badge tone="neutral">checking the legs now</Badge> : <Badge tone={VERDICT_TEXT[verdict.state].tone}>{VERDICT_TEXT[verdict.state].text}</Badge>}
      </p>
      <p className="signals-note">
        Relation: {link.relation.replaceAll("_", " ")}. Basis: {link.basis.class.replaceAll("_", " ")}
        {link.basis.axes.length > 0 ? `, differing in ${link.basis.axes.map((axis) => axis.replaceAll("_", " ")).join(" and ")}` : ""}. Valid until {formatUtc(Date.parse(link.validUntil))}.
      </p>
      <ul className="signals-legs">
        {link.legs.map((leg, index) => {
          const seen = verdict?.legs[index];
          return (
            <li key={`${leg.venue}:${leg.nativeId}`}>
              <strong>{venueName(leg.venue)}</strong> <code>{leg.nativeId}</code>: rules text{" "}
              {seen === undefined ? <Missing label="not checked yet" /> : <Badge tone={LEG_CHECK_TONE[seen.rules]}>{LEG_CHECK_TEXT[seen.rules]}</Badge>}, close time{" "}
              {seen === undefined ? <Missing label="not checked yet" /> : <Badge tone={LEG_CHECK_TONE[seen.close]}>{LEG_CHECK_TEXT[seen.close]}</Badge>}
            </li>
          );
        })}
      </ul>
      {verdict === null || verdict.reasons.length === 0 ? null : (
        <ul className="signals-reasons">
          {verdict.reasons.map((reason) => (
            <li key={reason}>{LINK_REASON_TEXT[reason]}</li>
          ))}
        </ul>
      )}
      {label === null ? null : (
        <p data-spread-label={label.label}>
          Spread label: <Badge tone="warn">{label.label.replaceAll("_", " ")}</Badge> {spreadLabelText(label.label)}; {LINK_LABEL_REASON_TEXT[label.reason]}.
        </p>
      )}
    </li>
  );
}

export interface LinkOverlayProps {
  readonly row: QuotientRow;
  readonly load: LinkLoad | null;
  readonly readLeg: LegReader;
  readonly nowMs: () => number;
}

// The text under every row, whether or not a link exists: the "why not arbitrage" line is not optional.
export function LinkOverlay({ row, load, readLeg, nowMs }: LinkOverlayProps) {
  const now = useNow(60_000);
  let body;
  if (load === null) {
    body = <p className="signals-note">Looking for approved links…</p>;
  } else if (load.state === "absent") {
    body = (
      <p data-links="absent">
        <Badge tone="neutral">no links</Badge> No link dataset is bundled, because no person has approved one yet. This market is not shown next to any other venue, and nothing guesses a link from similar titles.
      </p>
    );
  } else if (load.state === "rejected") {
    body = (
      <p data-links="rejected">
        <Badge tone="warn">no links</Badge> {REJECTION_TEXT[load.reason] ?? REJECTION_TEXT.schema}
      </p>
    );
  } else {
    const { shown, hidden } = linksOfRow(load.dataset, row);
    const age = datasetAge(load.dataset, now);
    body = (
      <div data-links={shown.length === 0 ? "none" : "some"}>
        {shown.length === 0 ? (
          <p>
            <Badge tone="neutral">no links</Badge> No approved link names this market.
          </p>
        ) : (
          <ul className="signals-links">
            {shown.map((link) => (
              <LinkItem key={link.linkId} link={link} readLeg={readLeg} nowMs={nowMs} />
            ))}
          </ul>
        )}
        {hidden > 0 ? <p className="signals-note">{hidden} more candidate link{hidden === 1 ? " is" : "s are"} not shown: a candidate is never proof.</p> : null}
        <p className="signals-note">
          Link dataset released {load.dataset.release}
          {age.days === null ? "" : ` (${age.days} days ago)`}.
          {age.stale ? ` It is older than ${DATASET_STALE_AFTER_DAYS} days, so treat it as possibly out of date.` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="signals-links-section">
      <h5 className="signals-subhead">Linked markets</h5>
      {body}
      <p className="signals-why" data-why-not-arbitrage="true">
        {WHY_NOT_ARBITRAGE}
      </p>
    </div>
  );
}

