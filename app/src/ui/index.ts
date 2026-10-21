// Public surface of the shell package, for screens under app/src/routes and app/src/features.
//
//   Route contract    RouteMeta, RouteProps, RouteModule (route-types.ts); `hero: true` for a HeroBand screen
//   Market text       UntrustedText: the only way market text is rendered
//   Caution tiles     one shape (CautionTile = Tile) behind ErrorTile, EmptyTile, UnprovenTile, CapabilityGate,
//                     CapabilityBadge, RestrictedTermsTile, NeedsCockpitTile
//   Data              DataTable, Missing, Num (every number, id, hash, time), ProvenanceStrip / ProvenanceLine
//   Dither            DitherDefs (rendered once by the Shell), DitherBar, DitherField, ditherFill
//   Surface           HeroBand (h1 + facts beside the field), Chip (a view state), Mark (an outlined word),
//                     VenueMark, SearchField
//   Controls          Button (default, primary, danger), Badge, Disclosure, Field, Dialog (narrow, wide, sheet)
//   Accessibility     VisuallyHidden, useAnnounce
//   Context           useAppMode, useClock, useNow, useSearchQuery (the top bar's text), useReportVenueCount,
//                     useOpenConnect / useRegisterConnectAction (the one way to open the Connect modal)
export type { RouteMeta, RouteProps, RouteModule, RouteParams, NavMeta } from "./route-types";
export { UntrustedText, isUntrustedString, renderableUntrusted, UNTRUSTED_CAPTION, type UntrustedTextProps } from "./UntrustedText";
export {
  Tile,
  CautionTile,
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
  type TileProps,
  type TileHeading,
} from "./Tiles";
export { DataTable, type Column, type DataTableProps } from "./DataTable";
export { Dialog, type DialogProps, type DialogSize } from "./Dialog";
export { ProvenanceStrip, ProvenanceLine, OWN_USE_TEXT } from "./ProvenanceStrip";
export { DitherDefs, DitherBar, DitherField, ditherFill, DITHER_STEPS, type DitherStep, type DitherTone, type DitherBarProps, type DitherFieldProps } from "./dither";
export { HeroBand, type HeroBandProps, type HeroFact } from "./HeroBand";
export { Badge, Button, Chip, Disclosure, Field, Mark, Missing, Num, SearchField, VenueMark, type Tone, type MarkTone, type ButtonProps, type ChipProps, type SearchFieldProps } from "./primitives";
export { VisuallyHidden, AnnouncerProvider, useAnnounce, type Announce, type AnnouncePriority } from "./a11y";
export {
  useAppMode,
  useClock,
  useNow,
  useSearchQuery,
  useVenueCount,
  useReportVenueCount,
  useOpenConnect,
  useRegisterConnectAction,
  ModeProvider,
  ClockProvider,
  SearchProvider,
  ShellStatusProvider,
  ConnectActionProvider,
  systemClock,
  appModeFromEnv,
  type AppMode,
  type Clock,
  type SearchState,
  type VenueCount,
} from "./context";
export { APP_NAME, BRAND, type ShellProps } from "./Shell";
export { formatAge, formatUtc, formatCountdown, toIso } from "./format-time";
export { VENUE_NAMES, venueName } from "./venue-names";
export { createAppQueryClient } from "./query-client";
export { consumePairingCode } from "./pairing-fragment";
