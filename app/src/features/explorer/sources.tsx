// Where each field of a row came from (docs/sdk-and-api-design.md section 6): the venue's API, the chain, or a value kept
// from an earlier read in this visit, with its age; or, for a field with no value, the stated reason. A kept value says
// "cached" and is never shown as live.

import type { ChainResolution, FieldOrigin, FieldSources, OutcomeSummary, SummaryField } from "../../core/ports";
import { formatAge } from "../../core/format";
import { Num } from "../../ui";
import { OutcomeName } from "./MarketTable";

export const FIELD_LABELS: Readonly<Record<SummaryField, string>> = Object.freeze({
  title: "Title",
  outcomes: "Outcomes",
  status: "Status",
  closesAt: "Close time",
  displayPrice: "Display price",
  volume: "Volume",
  resolution: "Settlement",
});

const FIELD_ORDER: readonly SummaryField[] = ["title", "outcomes", "status", "closesAt", "displayPrice", "volume", "resolution"];

// "venue API, read 12 s ago", "chain (Polygon 137), read 3 s ago", "cached from a read 4 min ago, not live", or the reason.
export function originText(origin: FieldOrigin, nowMs: number): string {
  if (origin.source === null) return origin.reason;
  const age = formatAge(nowMs, origin.asOfMs);
  switch (origin.source) {
    case "venue_api":
      return `venue API, read ${age}`;
    case "chain":
      return `chain${origin.via === undefined ? "" : ` (${origin.via})`}, read ${age}`;
    case "cache":
      return `cached from a read ${age}, not live`;
  }
}

// Whether a row mixes sources (a kept row, a field from the chain, a field withheld with a reason). A row read just now
// from the venue's API has one source, which its provenance line already states.
export function mixedSources(fields: FieldSources | null): boolean {
  if (fields === null) return false;
  return FIELD_ORDER.some((field) => (field === "resolution" ? fields.resolution.source === "chain" : fields[field].source !== "venue_api"));
}

export function SettlementLine({ resolution, outcomes }: { readonly resolution: ChainResolution; readonly outcomes: readonly OutcomeSummary[] }) {
  if (resolution.state === "unresolved") return <>not resolved on chain yet</>;
  const winner = resolution.winningIndex === null ? undefined : outcomes.find((outcome) => outcome.index === resolution.winningIndex);
  if (winner !== undefined) {
    return (
      <>
        resolved on chain: <OutcomeName outcome={winner} /> paid in full
      </>
    );
  }
  return (
    <>
      resolved on chain: payouts <Num>{resolution.payouts.join(" / ")}</Num> over <Num>{resolution.denominator}</Num>
    </>
  );
}

export function FieldSourcesList({ fields, resolution, outcomes, nowMs }: { readonly fields: FieldSources; readonly resolution: ChainResolution | null; readonly outcomes: readonly OutcomeSummary[]; readonly nowMs: number }) {
  return (
    <dl className="explorer-sources" data-sources="">
      {FIELD_ORDER.map((field) => {
        const origin = fields[field];
        return (
          <div key={field} className="explorer-source" data-field={field} data-source={origin.source ?? "none"}>
            <dt>{FIELD_LABELS[field]}</dt>
            <dd>
              {field === "resolution" && resolution !== null ? (
                <>
                  <SettlementLine resolution={resolution} outcomes={outcomes} />
                  {` · ${originText(origin, nowMs)}`}
                </>
              ) : (
                originText(origin, nowMs)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
