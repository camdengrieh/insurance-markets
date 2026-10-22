import type { ReactNode } from "react";

import type { AdapterError, Untrusted, VenueId } from "../core/ports";
import { Badge, Button, type Tone } from "./primitives";
import { UntrustedText } from "./UntrustedText";
import { venueName } from "./venue-names";

// State tiles for everything a screen cannot show as data. The rule behind all of them: a missing,
// blocked, off or unproven thing is SAID, in words, in the place the data would be. It is never an empty
// table, a zero, or a blank that looks like "no liquidity" (dapp-design 4.1 principle 4).
//
// All of them are ONE shape, the caution tile (docs/design/cockpit-v2/System.dc.html): a dashed strong line,
// no fill, a glyph in the margin and words. Unproven, needs-the-Cockpit, restricted terms, refused and empty
// are told apart by their words (and by data-kind for tests), never by a coloured fill. The tone decides the
// glyph: the caution triangle for warn, danger and info; a plain square for neutral and ok.

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

const CAUTION_TONES: ReadonlySet<Tone> = new Set<Tone>(["warn", "danger", "info"]);

// The amber glyph: a triangle with a stroke, square caps, 18 px. Decorative; the title carries the meaning.
function CautionGlyph({ caution }: { readonly caution: boolean }) {
  return (
    <svg className="ui-tile-glyph" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden="true" focusable="false">
      {caution ? <path d="M12 3l10 18H2zM12 10v5M12 18v1" /> : <path d="M4 4h16v16H4zM8 12h8" />}
    </svg>
  );
}

export function CautionTile({ tone = "neutral", title, heading = "h2", role = "status", actions, children, dataKind, dataCode }: TileProps) {
  const Heading = heading;
  const caution = CAUTION_TONES.has(tone);
  return (
    <section className="ui-tile" data-tone={tone} data-caution={caution ? "true" : undefined} data-kind={dataKind} data-code={dataCode} role={role === "note" ? undefined : role}>
      <CautionGlyph caution={caution} />
      <div className="ui-tile-text">
        <Heading className="ui-tile-title">{title}</Heading>
        <div className="ui-tile-body">{children}</div>
        {actions === undefined ? null : <div className="ui-tile-actions">{actions}</div>}
      </div>
    </section>
  );
}

// The name every screen already uses; the same shape.
export function Tile(props: TileProps) {
  return <CautionTile {...props} />;
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
    <CautionTile tone="danger" title={label} role="alert" dataKind="error" dataCode={code ?? "UNKNOWN"} heading={heading} actions={onRetry === undefined ? undefined : <Button onClick={onRetry}>Try again</Button>}>
      <p>{message ?? text.explain}</p>
      {detail === undefined ? null : (
        <p>
          Venue message: <UntrustedText value={detail} field="generic" />
        </p>
      )}
    </CautionTile>
  );
}

// ---- empty ----------------------------------------------------------------------------------------------------

export function EmptyTile({ title = "Nothing here yet", children, heading, actions }: { readonly title?: string; readonly children?: ReactNode; readonly heading?: TileHeading; readonly actions?: ReactNode }) {
  return (
    <CautionTile tone="neutral" title={title} dataKind="empty" heading={heading} actions={actions}>
      {children ?? <p>There is nothing to show. This is an empty result, not an error and not a zero.</p>}
    </CautionTile>
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
    <CautionTile tone="warn" title={`Unproven: ${capability}`} dataKind="unproven" dataCode={state === "no" ? "no" : "unknown"} heading={heading}>
      <p>
        {children ?? "No live test has confirmed this works, so it stays switched off and nothing is attempted."}
        {state === "no" ? " A live test recorded that it does not work." : ""}
      </p>
    </CautionTile>
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
    <CautionTile
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
    </CautionTile>
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
    <CautionTile tone="info" title={`${subject}: needs the Cockpit`} dataKind="needs-cockpit" dataCode={venue ?? "page"} heading={heading} actions={actions}>
      <p>
        A browser cannot read {what} on its own: the venue does not allow requests from web pages. The local Cockpit can. Until then nothing is shown here, which is different from an empty book.
      </p>
    </CautionTile>
  );
}
