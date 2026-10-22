// A venue that is throttled, blocked or read from the chain only is a state with a reason, not an error
// (docs/sdk-and-api-design.md section 6). The words come from the SDK (sdk/venues/state.ts venueStateReason), so the
// page, the Cockpit and the API say the same sentence: "Polymarket blocked our reads at 2026-10-22 12:03 UTC: 403".
// A blocked venue stays in the list with what the chain and earlier reads can supply; it drops out of books and order
// preparation, because there is no book to quote. Nothing here retries around a block: "Try again" appears only once
// the pause has ended (or the venue named no end), and it asks once.

import { useState } from "react";

import { stateOfAdapterError, venueStateNext, venueStateReason, READ_OK, type VenueReadState } from "@sdk/venues/state";

import type { VenueId } from "../../core/ports";
import { Badge, Button, ErrorTile, NeedsCockpitTile, Tile, useNow, venueName, type TileHeading, type Tone } from "../../ui";
import type { ClassifiedError } from "./feed";
import { useExplorerServices } from "./services";

// The error codes that are a venue state rather than a failure of this read.
export function isStateCode(code: string): boolean {
  return code === "RATE_LIMITED" || code === "VENUE_PAUSED";
}

export const STATE_WORDS: Readonly<Record<VenueReadState["kind"], string>> = Object.freeze({ ok: "read", throttled: "throttled", blocked: "blocked", chain_only: "chain only" });

const STATE_TONE: Readonly<Record<VenueReadState["kind"], Tone>> = Object.freeze({ ok: "ok", throttled: "warn", blocked: "warn", chain_only: "info" });

// The state a page shows for a venue: what the guarded fetch saw, or, when it saw nothing (a daemon pause, a reader's
// own mapping), the state the error code implies, dated when the error was seen.
export function stateFor(tracked: VenueReadState, error: ClassifiedError | null, atMs: number): VenueReadState {
  if (tracked.kind !== "ok") return tracked;
  if (error === null || !isStateCode(error.code)) return READ_OK;
  return stateOfAdapterError(error.code, error.retryAfterMs, atMs);
}

// The reason the order book of a venue cannot be read now, or null when it can.
export function bookWithheldReason(state: VenueReadState, venue: VenueId, nowMs: number): string | null {
  return venueStateReason(state, venueName(venue), nowMs);
}

// Whether "Try again" may be offered: the pause is over, or the venue named no end. Never while a pause runs.
export function mayAskAgain(state: VenueReadState, nowMs: number): boolean {
  if (state.kind === "ok") return true;
  if (state.kind === "chain_only") return false;
  return state.untilMs === null || state.untilMs <= nowMs;
}

export function VenueStateBadge({ state }: { readonly state: VenueReadState }) {
  return <Badge tone={STATE_TONE[state.kind]}>{STATE_WORDS[state.kind]}</Badge>;
}

export interface VenueStateTileProps {
  readonly venue: VenueId;
  readonly state: VenueReadState;
  readonly nowMs: number;
  // What the screen still shows for this venue, in fixed words (rows kept from earlier reads, the chain's fields).
  readonly kept?: string;
  readonly onRetry?: () => void;
  readonly heading?: TileHeading;
}

export function VenueStateTile({ venue, state, nowMs, kept, onRetry, heading = "h3" }: VenueStateTileProps) {
  const name = venueName(venue);
  const reason = venueStateReason(state, name, nowMs);
  if (reason === null) return null;
  const next = venueStateNext(state, nowMs);
  const retry = onRetry !== undefined && mayAskAgain(state, nowMs);
  return (
    <Tile
      tone={STATE_TONE[state.kind]}
      title={`${name}: ${STATE_WORDS[state.kind]}`}
      heading={heading}
      role="status"
      dataKind="venue-state"
      dataCode={state.kind}
      actions={retry ? <Button onClick={onRetry}>Try again</Button> : undefined}
    >
      <p data-venue-reason={venue}>{`${reason}.`}</p>
      {next === null ? null : <p>{next}</p>}
      {kept === undefined ? null : <p>{kept}</p>}
    </Tile>
  );
}

// A venue read that failed, in the right words: a throttle or block is its state with the reason, a Cockpit-only read
// is the "needs the Cockpit" tile, anything else is the typed error tile.
export function VenueErrorTile({ venue, error, what, onRetry, heading = "h4" }: { readonly venue: VenueId; readonly error: ClassifiedError; readonly what: string; readonly onRetry?: () => void; readonly heading?: TileHeading }) {
  const services = useExplorerServices();
  const nowMs = useNow(10_000);
  // When the error was first shown: the time a derived block is dated with.
  const [seenAt] = useState(() => services.nowMs());
  if (error.code === "NEEDS_COCKPIT") return <NeedsCockpitTile venue={venue} what={what} heading={heading} />;
  if (isStateCode(error.code)) {
    const state = stateFor(services.venueState(venue, nowMs), error, seenAt);
    return <VenueStateTile venue={venue} state={state} nowMs={nowMs} heading={heading} {...(onRetry === undefined ? {} : { onRetry })} />;
  }
  return <ErrorTile code={error.code} venue={venue} heading={heading} {...(onRetry === undefined ? {} : { onRetry })} />;
}
