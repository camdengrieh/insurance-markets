// Quotient's free track record, always shown with its caveats (docs/dapp-design.md 4.7: "show the favourable
// 60-day figure AND the all-time figure together"). The live field names of the snapshot were never captured, so
// nothing is extracted from it: the screen shows a bounded, sanitised excerpt in an untrusted slot, beside the
// caveats, which are fixed text and are shown whether or not the snapshot has been loaded.

import { Badge, Button, UntrustedText, formatAge, formatUtc } from "../../ui";
import { TRACK_RECORD_CAVEATS, type PerformanceSnapshot, type QuotientResult } from "../../venues/quotient";
import { ResultNotice } from "./Notices";

export interface TrackRecordProps {
  readonly result: QuotientResult<PerformanceSnapshot> | null;
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly nowMs: number;
  readonly onLoad: () => void;
  readonly onResetHalt: () => void;
}

export function TrackRecord({ result, enabled, busy, nowMs, onLoad, onResetHalt }: TrackRecordProps) {
  return (
    <section className="signals-section" aria-labelledby="signals-track-heading" data-section="track-record">
      <h2 id="signals-track-heading">Track record</h2>
      <ul className="signals-caveats" data-track-record-caveats="always">
        {TRACK_RECORD_CAVEATS.map((caveat) => (
          <li key={caveat}>{caveat}</li>
        ))}
      </ul>
      <p className="signals-actions">
        <Button onClick={onLoad} busy={busy} disabled={!enabled || busy} data-press-route="performance">
          Load Quotient's free track record (free)
        </Button>{" "}
        {enabled ? null : <Badge tone="neutral">turn Quotient on first</Badge>}
      </p>
      {result === null ? null : result.status !== "ok" ? (
        <ResultNotice result={result} onResetHalt={onResetHalt} />
      ) : (
        <div data-track-record="loaded">
          <p className="signals-note">
            Snapshot generated {result.data.generatedAtMs === null ? "at an unknown time" : `${formatUtc(result.data.generatedAtMs)}`}; fetched {formatUtc(result.fetchedAtMs)} ({formatAge(result.fetchedAtMs, nowMs)}). Shown unaltered
            as text, not interpreted: this project has never seen the live field names.
            {result.data.excerptTruncated ? " The excerpt is cut short." : ""}
          </p>
          <UntrustedText value={result.data.excerpt} maxChars={4000} block />
        </div>
      )}
    </section>
  );
}
