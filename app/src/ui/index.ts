// Public surface of the shell package, for screens under app/src/routes and app/src/features.
//
//   Route contract    RouteMeta, RouteProps, RouteModule (route-types.ts)
//   Market text       UntrustedText: the only way market text is rendered
//   Placeholder tiles ErrorTile, EmptyTile, UnprovenTile, CapabilityGate, CapabilityBadge, RestrictedTermsTile,
//                     NeedsCockpitTile, Tile
//   Data              DataTable, Missing, ProvenanceStrip
//   Controls          Button, Badge, Disclosure, Field, Dialog
//   Accessibility     VisuallyHidden, useAnnounce
//   Context           useAppMode, useClock, useNow
export type { RouteMeta, RouteProps, RouteModule, RouteParams, NavMeta } from "./route-types";
export { UntrustedText, isUntrustedString, renderableUntrusted, UNTRUSTED_CAPTION, type UntrustedTextProps } from "./UntrustedText";
export {
  Tile,
  ErrorTile,
  EmptyTile,
  UnprovenTile,
  CapabilityGate,
  CapabilityBadge,
  RestrictedTermsTile,
  NeedsCockpitTile,
  ADAPTER_ERROR_TEXT,
  errorText,
  isProven,
  type CapabilityState,
} from "./Tiles";
export { DataTable, type Column, type DataTableProps } from "./DataTable";
export { Dialog, type DialogProps } from "./Dialog";
export { ProvenanceStrip } from "./ProvenanceStrip";
export { Badge, Button, Disclosure, Field, Missing, type Tone, type ButtonProps } from "./primitives";
export { VisuallyHidden, AnnouncerProvider, useAnnounce, type Announce, type AnnouncePriority } from "./a11y";
export { useAppMode, useClock, useNow, ModeProvider, ClockProvider, systemClock, appModeFromEnv, type AppMode, type Clock } from "./context";
export { formatAge, formatUtc, formatCountdown, toIso } from "./format-time";
export { VENUE_NAMES, venueName } from "./venue-names";
export { createAppQueryClient } from "./query-client";
export { consumePairingCode } from "./pairing-fragment";
