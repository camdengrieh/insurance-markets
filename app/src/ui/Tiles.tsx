import type { ReactNode } from "react";

import type { AdapterError, Untrusted, VenueId } from "../core/ports";
import { Badge, Button, type Tone } from "./primitives";
import { UntrustedText } from "./UntrustedText";
import { venueName } from "./venue-names";

// Placeholder tiles for everything a screen cannot show as data. The rule behind all of them: a missing,
// blocked, off or unproven thing is SAID, in words, in the place the data would be. It is never an empty
// table, a zero, or a blank that looks like "no liquidity" (dapp-design 4.1 principle 4).

// A tile sits directly under the page's h1 by default (h2); pass h3 or h4 when nesting it deeper, so heading
// levels only ever go down by one (axe heading-order).
export type TileHeading = "h2" | "h3" | "h4";

export interface TileProps {
  readonly tone?: Tone;
  readonly title: string;
  readonly heading?: TileHeading;
  readonly role?: "status" | "alert" | "note";
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly dataKind?: string;
  readonly dataCode?: string;
}

export function Tile({ tone = "neutral", title, heading = "h2", role = "status", actions, children, dataKind, dataCode }: TileProps) {
  const Heading = heading;
  return (
    <section className="ui-tile" data-tone={tone} data-kind={dataKind} data-code={dataCode} role={role === "note" ? undefined : role}>
      <Heading className="ui-tile-title">{title}</Heading>
      <div className="ui-tile-body">{children}</div>
      {actions === undefined ? null : <div className="ui-tile-actions">{actions}</div>}
    </section>
  );
}

// ---- errors ---------------------------------------------------------------------------------------------------

export interface ErrorText {
  readonly title: string;
  readonly explain: string;
}

// Typed Record: the compiler fails when ports.ts adds an AdapterError, so every code has words.
export const ADAPTER_ERROR_TEXT: Readonly<Record<AdapterError, ErrorText>> = Object.freeze({
  RATE_LIMITED: { title: "The venue asked us to slow down", explain: "Requests to this venue are paused for a while. Nothing is wrong with your data." },
  STALE: { title: "This data is out of date", explain: "The last answer is older than this screen allows, so it is not shown as current." },
  NOT_SUPPORTED: { title: "Not supported by this venue", explain: "This venue does not offer this information. It is not zero and not empty; it does not exist here." },
  SCHEMA_DRIFT: { title: "The venue answered in a shape we do not recognise", explain: "The answer was refused instead of guessed at. The venue may have changed its format." },
  VENUE_PAUSED: { title: "This venue is paused", explain: "It refused repeated requests, so requests stop for ten minutes. Nothing retries around the refusal." },
  NOT_FOUND: { title: "Not found", explain: "The venue has no record of this market or address." },
  TIMEOUT: { title: "The venue did not answer in time", explain: "This is an unreachable venue, which is different from an empty one. Try again in a moment." },
  EMPTY_BOOK: { title: "No orders at the moment", explain: "The venue answered and the book is empty. That is not the same as an unreachable venue, and there is no price to show." },
});

const FALLBACK_ERROR: ErrorText = { title: "Something went wrong", explain: "The reason is not one this screen knows, so it is not guessed at." };

export function errorText(code: string | undefined): ErrorText {
  return code !== undefined && Object.hasOwn(ADAPTER_ERROR_TEXT, code) ? ADAPTER_ERROR_TEXT[code as AdapterError] : FALLBACK_ERROR;
}

export interface ErrorTileProps {
  // An AdapterError for a venue read, or any short app-owned code (for example ROUTE_CRASHED).
  readonly code?: string;
  readonly venue?: VenueId;
  // Overrides the words for a code the app owns. Never put market text here; use `detail`.
  readonly title?: string;
  readonly message?: string;
  // Anything a stranger could have written (an upstream message) goes here and is shown in the untrusted slot.
  readonly detail?: Untrusted<string>;
  readonly onRetry?: () => void;
  readonly heading?: TileHeading;
}

export function ErrorTile({ code, venue, title, message, detail, onRetry, heading }: ErrorTileProps) {
  const text = errorText(code);
  const label = venue === undefined ? (title ?? text.title) : `${venueName(venue)}: ${title ?? text.title}`;
  return (
    <Tile tone="danger" title={label} role="alert" dataKind="error" dataCode={code ?? "UNKNOWN"} heading={heading} actions={onRetry === undefined ? undefined : <Button onClick={onRetry}>Try again</Button>}>
      <p>{message ?? text.explain}</p>
      {detail === undefined ? null : (
        <p>
          Venue message: <UntrustedText value={detail} field="generic" />
        </p>
      )}
    </Tile>
  );
}

// ---- empty ----------------------------------------------------------------------------------------------------

export function EmptyTile({ title = "Nothing here yet", children, heading, actions }: { readonly title?: string; readonly children?: ReactNode; readonly heading?: TileHeading; readonly actions?: ReactNode }) {
  return (
    <Tile tone="neutral" title={title} dataKind="empty" heading={heading} actions={actions}>
      {children ?? <p>There is nothing to show. This is an empty result, not an error and not a zero.</p>}
    </Tile>
  );
}

// ---- unproven capabilities ------------------------------------------------------------------------------------

// What the operator recorded for a capability (the relay's capability facts). Only "yes" counts as proven;
// "no", "unknown", a missing value or anything else shows "unproven" (dapp-design 7.1, common to every slice).
export type CapabilityState = "yes" | "no" | "unknown";

export function isProven(state: unknown): state is "yes" {
  return state === "yes";
}

export function CapabilityBadge({ state, label }: { readonly state: unknown; readonly label: string }) {
  if (isProven(state)) return <Badge tone="ok">{`${label}: proven`}</Badge>;
  return <Badge tone="warn">{`${label}: unproven${state === "no" ? " (recorded: no)" : ""}`}</Badge>;
}

export function UnprovenTile({ capability, state, children, heading }: { readonly capability: string; readonly state?: unknown; readonly children?: ReactNode; readonly heading?: TileHeading }) {
  return (
    <Tile tone="warn" title={`Unproven: ${capability}`} dataKind="unproven" dataCode={state === "no" ? "no" : "unknown"} heading={heading}>
      <p>
        {children ?? "No live test has confirmed this works, so it stays switched off and nothing is attempted."}
        {state === "no" ? " A live test recorded that it does not work." : ""}
      </p>
    </Tile>
  );
}

// Shows its children only when the capability is recorded as "yes"; otherwise the unproven tile. Gating UI
// is not a security control (the daemon enforces the flags); it keeps the screen from implying something
// works that nobody has shown to work.
export function CapabilityGate({ state, capability, children, heading }: { readonly state: unknown; readonly capability: string; readonly children: ReactNode; readonly heading?: TileHeading }) {
  if (isProven(state)) return <>{children}</>;
  return <UnprovenTile capability={capability} state={state} heading={heading} />;
}

// ---- venue availability ---------------------------------------------------------------------------------------

export interface RestrictedTermsTileProps {
  readonly venue: VenueId;
  // The clause in plain words, written by us (for example "its developer agreement bars caching and
  // aggregating beyond your own trading"). Never copied from the venue's response.
  readonly clause: string;
  readonly enabled?: boolean;
  readonly actions?: ReactNode;
  readonly heading?: TileHeading;
}

export function RestrictedTermsTile({ venue, clause, enabled = false, actions, heading }: RestrictedTermsTileProps) {
  const name = venueName(venue);
  return (
    <Tile
      tone="warn"
      title={enabled ? `${name}: on, memory only` : `${name}: off, restricted terms`}
      dataKind="restricted"
      dataCode={venue}
      heading={heading}
      actions={actions}
    >
      <p>
        {enabled
          ? `${name} is on at your request. Its data stays in memory only, is dropped when you close the tab, and has no export.`
          : `${name} is off by default and nothing was requested from it. This is not an empty market list.`}
      </p>
      <p>Why: {clause}</p>
    </Tile>
  );
}

export interface NeedsCockpitTileProps {
  readonly venue?: VenueId;
  readonly what?: string;
  readonly actions?: ReactNode;
  readonly heading?: TileHeading;
}

export function NeedsCockpitTile({ venue, what = "this data", actions, heading }: NeedsCockpitTileProps) {
  const subject = venue === undefined ? "This screen" : venueName(venue);
  return (
    <Tile tone="info" title={`${subject}: needs the Cockpit`} dataKind="needs-cockpit" dataCode={venue ?? "page"} heading={heading} actions={actions}>
      <p>
        A browser cannot read {what} on its own: the venue does not allow requests from web pages. The local Cockpit can. Until then nothing is shown here, which is different from an empty book.
      </p>
    </Tile>
  );
}
