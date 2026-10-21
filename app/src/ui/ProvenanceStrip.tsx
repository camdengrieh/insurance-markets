import type { Freshness, Prov, Transport } from "../core/ports";
import { useNow } from "./context";
import { formatAge, formatUtc, toIso } from "./format-time";
import { venueName } from "./venue-names";

// Provenance is one mono line, wherever a number is: "venue · source · transport · fetched (age) · freshness",
// plus "own use only: memory only, no export" when the licence says so. dapp-design 4.5: "Every screen has a
// provenance strip (venue, transport, fetched-at, freshness)". Every word here is fixed app text; `source` is
// the adapter's own name for its endpoint, never anything a venue sent.

const TRANSPORT_TEXT: Readonly<Record<Transport, string>> = Object.freeze({
  T0: "browser direct",
  "T0-RPC": "public RPC",
  T1: "via the Cockpit",
  T2: "via the Cockpit, your key",
  T3: "imported from your agent",
});

const FRESHNESS_TEXT: Readonly<Record<Freshness, string>> = Object.freeze({
  live: "live",
  recent: "recent",
  stale: "stale",
  unknown: "freshness unknown",
});

export const OWN_USE_TEXT = "own use only: memory only, no export";

function Separator() {
  return (
    <span className="ui-provenance-sep" aria-hidden="true">
      {" · "}
    </span>
  );
}

export function ProvenanceStrip({ prov }: { readonly prov: Prov }) {
  const now = useNow(10_000);
  const freshness = Object.hasOwn(FRESHNESS_TEXT, prov.freshness) ? FRESHNESS_TEXT[prov.freshness] : FRESHNESS_TEXT.unknown;
  const transport = Object.hasOwn(TRANSPORT_TEXT, prov.transport) ? TRANSPORT_TEXT[prov.transport] : "unknown route";
  const source = typeof prov.source === "string" && prov.source.trim() !== "" ? prov.source.trim() : null;
  return (
    <p className="ui-provenance" role="group" aria-label={`Source of this data: ${venueName(prov.venue)}`} data-venue={prov.venue} data-freshness={prov.freshness}>
      <span className="ui-provenance-item">{venueName(prov.venue)}</span>
      {source === null ? null : (
        <>
          <Separator />
          <span className="ui-provenance-item">{source}</span>
        </>
      )}
      <Separator />
      <span className="ui-provenance-item">{transport}</span>
      <Separator />
      <span className="ui-provenance-item">
        <time dateTime={toIso(prov.fetchedAtMs)}>{formatUtc(prov.fetchedAtMs)}</time> ({formatAge(prov.fetchedAtMs, now)})
      </span>
      <Separator />
      <span className="ui-provenance-item" data-freshness={prov.freshness}>
        {freshness}
      </span>
      {prov.license === "own_use_only" ? (
        <>
          <Separator />
          <span className="ui-provenance-item">{OWN_USE_TEXT}</span>
        </>
      ) : null}
    </p>
  );
}

// The design's name for the same line.
export const ProvenanceLine = ProvenanceStrip;
