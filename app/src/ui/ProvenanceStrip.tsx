import type { Freshness, Prov, Transport } from "../core/ports";
import { Badge, type Tone } from "./primitives";
import { useNow } from "./context";
import { formatAge, formatUtc, toIso } from "./format-time";
import { venueName } from "./venue-names";

// The strip every screen shows above its data: where it came from, how it travelled, when, and how fresh.
// dapp-design 4.5: "Every screen has a provenance strip (venue, transport, fetched-at, freshness)".

const TRANSPORT_TEXT: Readonly<Record<Transport, string>> = Object.freeze({
  T0: "browser direct",
  "T0-RPC": "public RPC",
  T1: "via the Cockpit",
  T2: "via the Cockpit, your key",
  T3: "imported from your agent",
});

const FRESHNESS: Readonly<Record<Freshness, { readonly tone: Tone; readonly text: string }>> = Object.freeze({
  live: { tone: "ok", text: "live" },
  recent: { tone: "info", text: "recent" },
  stale: { tone: "warn", text: "stale" },
  unknown: { tone: "warn", text: "freshness unknown" },
});

export function ProvenanceStrip({ prov }: { readonly prov: Prov }) {
  const now = useNow(10_000);
  const freshness = Object.hasOwn(FRESHNESS, prov.freshness) ? FRESHNESS[prov.freshness] : FRESHNESS.unknown;
  const transport = Object.hasOwn(TRANSPORT_TEXT, prov.transport) ? TRANSPORT_TEXT[prov.transport] : "unknown route";
  return (
    <div className="ui-provenance" role="group" aria-label={`Source of this data: ${venueName(prov.venue)}`} data-venue={prov.venue}>
      <dl>
        <div className="ui-provenance-item">
          <dt>Venue</dt>
          <dd>{venueName(prov.venue)}</dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Via</dt>
          <dd>{transport}</dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Fetched</dt>
          <dd>
            <time dateTime={toIso(prov.fetchedAtMs)}>{formatUtc(prov.fetchedAtMs)}</time> ({formatAge(prov.fetchedAtMs, now)})
          </dd>
        </div>
        <div className="ui-provenance-item">
          <dt>Freshness</dt>
          <dd>
            <Badge tone={freshness.tone}>{freshness.text}</Badge>
          </dd>
        </div>
        {prov.license === "own_use_only" ? (
          <div className="ui-provenance-item">
            <dt>Terms</dt>
            <dd>
              <Badge tone="warn">own use only: memory only, no export</Badge>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
