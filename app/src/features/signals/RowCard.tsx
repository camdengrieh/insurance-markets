// One Quotient row, with everything that must sit next to its number.
//
// What this component guarantees (each has a test in signals.test.tsx):
//   - The probability appears only through qNumber(). While the orientation is unproven, no probability, spread,
//     direction, delta or price of the row is printed: a hidden number stays hidden everywhere (M3-6).
//   - All fourteen disclosures from disclosuresFor() are rendered with every row, in the DOM and visible (M3-7).
//   - The spread label is capped by capSpreadLabel and is `indicative` or `model_edge` here, and the "why not
//     arbitrage" line is part of the disclosures and part of the link section (M3-10).
//   - Every string written by Quotient (the question, the side, the quality basis) is shown through UntrustedText.
//   - There is no copy, share, download or export control of any kind (M3-8).

import { Badge, Missing, UntrustedText, formatAge, formatUtc, toIso, venueName, type Tone } from "../../ui";
import {
  DISCLOSURE_KEYS,
  allPass,
  capSpreadLabel,
  disclosuresFor,
  gatesOf,
  labelFor,
  qNumber,
  type Gate,
  type QuotientRow,
  type RouteId,
} from "../../venues/quotient";
import { LinkOverlay } from "./LinkOverlay";
import { pointsText, probabilityText } from "./figures";
import type { LinkLoad } from "./links/dataset";
import type { LegReader } from "./services";
import { COVERAGE_BADGE, gateLabel, gateReasonText, orientationText, quotientVenueName, spreadLabelText } from "./words";

const DISCLOSURE_LABELS: Readonly<Record<(typeof DISCLOSURE_KEYS)[number], string>> = Object.freeze({
  forecastTime: "When",
  coverage: "Coverage",
  quality: "Quality",
  qualityBasis: "Quality basis (written by Quotient)",
  quote: "Quote",
  notExecutableEdge: "Not an executable edge",
  hypotheticalPerformance: "Performance figures",
  smallEdge: "Size of the edge",
  perCallCost: "Cost",
  notAdvice: "Not advice",
  noAffiliation: "Affiliation",
  attribution: "Source",
  noAutoTrade: "No trading from this number",
  whyNotArbitrage: "Why this is not arbitrage",
});

const TRANSPORT_TEXT: Readonly<Record<string, string>> = Object.freeze({
  T0: "browser direct",
  T2: "via the Cockpit, your key",
  T3: "imported from your agent",
});

const FRESHNESS_TONE: Readonly<Record<string, Tone>> = Object.freeze({ live: "ok", recent: "info", stale: "warn", unknown: "warn" });

export interface RowCardProps {
  readonly row: QuotientRow;
  readonly route: RouteId;
  readonly nowMs: number;
  readonly allowExperimental: boolean;
  readonly linkLoad: LinkLoad | null;
  readonly readLeg: LegReader;
  readonly clock: () => number;
}

function GateList({ gates }: { readonly gates: readonly Gate[] }) {
  return (
    <ul className="signals-gates" aria-label="Checks on this row">
      {gates.map((gate) => (
        <li key={gate.name} data-gate={gate.name} data-pass={gate.pass ? "yes" : "no"}>
          <Badge tone={gate.pass ? "ok" : "warn"}>{gate.pass ? "passes" : "fails"}</Badge> <strong>{gateLabel(gate.name)}</strong>
          {gate.reason === null ? null : <span>: {gateReasonText(gate.reason)}</span>}
        </li>
      ))}
    </ul>
  );
}

function Provenance({ row, nowMs }: { readonly row: QuotientRow; readonly nowMs: number }) {
  const prov = row.prov;
  const freshness = Object.hasOwn(FRESHNESS_TONE, prov.freshness) ? prov.freshness : "unknown";
  return (
    <div className="ui-provenance" role="group" aria-label="Source of this row">
      <dl>
        <div className="ui-provenance-item">
          <dt>Published by</dt>
          <dd>Quotient</dd>
        </div>
        <div className="ui-provenance-item">
          <dt>About</dt>
          <dd>{prov.venue === null ? quotientVenueName(null) : venueName(prov.venue)}</dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Via</dt>
          <dd>{TRANSPORT_TEXT[prov.transport] ?? "unknown route"}</dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Fetched</dt>
          <dd>
            <time dateTime={toIso(prov.fetchedAtMs)}>{formatUtc(prov.fetchedAtMs)}</time> ({formatAge(prov.fetchedAtMs, nowMs)})
          </dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Freshness</dt>
          <dd>
            <Badge tone={FRESHNESS_TONE[freshness] ?? "warn"}>{freshness === "unknown" ? "freshness unknown" : freshness}</Badge>
          </dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Terms</dt>
          <dd>
            <Badge tone="warn">own use only: memory only, no export</Badge>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function RowCard({ row, route, nowMs, allowExperimental, linkLoad, readLeg, clock }: RowCardProps) {
  const gates = gatesOf(row, { nowMs, allowExperimental });
  const clear = allPass(gates);
  const label = capSpreadLabel(labelFor(gates));
  const disclosures = disclosuresFor(row, nowMs, route);
  const number = qNumber(row);
  const quote = row.quote;
  const coverage = row.coverage === null ? "coverage not stated" : COVERAGE_BADGE[row.coverage];

  return (
    <article className="signals-row" data-row-kind={row.kind} data-demoted={clear ? "no" : "yes"} data-number={number.shown ? "shown" : "hidden"}>
      <header className="signals-row-head">
        <h4 className="signals-row-title">{row.question === null ? <span>Sports game</span> : <UntrustedText value={row.question} field="title" clamp={2} />}</h4>
        <p className="signals-badges">
          <Badge tone="info">{quotientVenueName(row.venue)}</Badge>{" "}
          <Badge tone={row.coverage === "forecasting" ? "ok" : "warn"}>{coverage}</Badge>{" "}
          <Badge tone={clear ? "ok" : "warn"}>{clear ? "all checks pass" : "demoted: a check fails"}</Badge>
          {row.venue === "kalshi" ? (
            <>
              {" "}
              <Badge tone="warn">Kalshi data: memory only, no export</Badge>
            </>
          ) : null}
          {linkLoad !== null && linkLoad.state !== "loaded" ? (
            <>
              {" "}
              <Badge tone="neutral">no links</Badge>
            </>
          ) : null}
        </p>
      </header>

      {row.sports?.yesSide ? (
        <p>
          The probabilities on this row are about: <UntrustedText value={row.sports.yesSide} field="outcome" />
        </p>
      ) : null}

      <dl className="signals-facts">
        <div>
          <dt>Quotient's estimate</dt>
          <dd data-field="q">
            {number.shown ? (
              <>
                <span className="signals-figure">{probabilityText(number.value)}</span> that {number.about.outcome === "yes" ? "the venue's YES outcome" : "the linked outcome"} happens. A model's estimate, not a price.
              </>
            ) : (
              <span data-number-hidden={number.reason}>Number hidden. {orientationText(number.reason)}</span>
            )}
          </dd>
        </div>
        {number.shown ? (
          <>
            <div>
              <dt>Selected venue quote</dt>
              <dd data-field="quote">
                {quote === null || quote.probability === null ? (
                  <Missing label="no quote with this row" />
                ) : (
                  <>
                    <span className="signals-figure">{probabilityText(quote.probability)}</span> ({quote.method === null ? "method not stated" : quote.method}). Not an executable price.
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Gap between the estimate and the quote</dt>
              <dd data-field="gap">
                {row.spread === null ? (
                  <Missing label="no gap given" />
                ) : (
                  <>
                    <span className="signals-figure">{pointsText(row.spread)}</span>
                    {row.spreadDirection === "q_higher" ? ", the estimate is above the quote" : row.spreadDirection === "q_lower" ? ", the estimate is below the quote" : ", direction not given"}.
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Label</dt>
              <dd data-field="label" data-spread-label={label}>
                <Badge tone="warn">{label.replaceAll("_", " ")}</Badge> {spreadLabelText(label)}
              </dd>
            </div>
            <div>
              <dt>Change since the prior forecast</dt>
              <dd data-field="delta">{row.forecast.deltaFromPrior === null ? <Missing label="no prior forecast given" /> : <span className="signals-figure">{pointsText(row.forecast.deltaFromPrior)}</span>}</dd>
            </div>
          </>
        ) : null}
        {row.signal === null ? null : (
          <>
            <div>
              <dt>Conviction tier</dt>
              <dd>{row.signal.convictionTier === null ? <Missing label="not stated" /> : `${row.signal.convictionTier} of 3`}</dd>
            </div>
            <div>
              <dt>Depth near the price (USD)</dt>
              <dd>{row.signal.capacityUsdAt2c === null ? <Missing label="not stated" /> : `$${row.signal.capacityUsdAt2c}`}</dd>
            </div>
          </>
        )}
      </dl>

      {row.sports === null || row.sports.listings.length === 0 ? null : (
        <div>
          <h5 className="signals-subhead">Listings of this game</h5>
          <ul className="signals-listings">
            {row.sports.listings.map((listing, index) => (
              <li key={`${listing.venue}:${listing.marketKey ?? index}`}>
                {quotientVenueName(listing.venue)}: {listing.signalAvailable === false ? "no signal available" : listing.entryEligible === true ? "entry eligible" : "entry not eligible"}
                {number.shown && listing.price !== null ? `, price ${probabilityText(listing.price)} for the ${listing.signalSide ?? "signal"} side` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <GateList gates={gates} />

      <LinkOverlay row={row} load={linkLoad} readLeg={readLeg} nowMs={clock} />

      <div className="signals-disclosure-block">
        <h5 className="signals-subhead">Read this with the number</h5>
        <ul className="signals-disclosures">
          {DISCLOSURE_KEYS.map((key) => (
            <li key={key} data-disclosure={key}>
              <strong>{DISCLOSURE_LABELS[key]}:</strong>{" "}
              {key === "qualityBasis" ? (
                disclosures.qualityBasis === null ? (
                  <Missing label="no basis given" />
                ) : (
                  <UntrustedText value={disclosures.qualityBasis} field="generic" />
                )
              ) : (
                disclosures[key]
              )}
            </li>
          ))}
        </ul>
      </div>

      <Provenance row={row} nowMs={nowMs} />
    </article>
  );
}
