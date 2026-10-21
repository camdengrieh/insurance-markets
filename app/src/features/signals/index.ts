// Public surface of the Signals feature (docs/dapp-design.md 7.4 work package G). There is no Signals screen: the
// Markets surface opens the Quotient settings dialog from its Quotient line and renders RowCards in its market
// modal. Other features import from here, never from the sibling modules.
import "./signals.css";

export { SignalsView, COVERAGE_FILTERS, type CoverageFilter } from "./SignalsView";
export { QuotientSettingsDialog, QUOTIENT_SETTINGS_TITLE, type QuotientSettingsDialogProps } from "./QuotientSettingsDialog";
export { ResultNotice, RejectedRows } from "./Notices";
export { ShapeStatus } from "./GatePanel";
export { VENUE_OF_QUOTIENT, QUOTIENT_VENUE_NAMES, quotientVenueName } from "./words";
export { RowCard, type RowCardProps } from "./RowCard";
export { SignalsServicesProvider, createSignalsServices, legReaderOver, setSignalsTokenSource, useSignalsServices, type LegReader, type SignalsServices, type SignalsServicesOptions } from "./services";
export { SignalsSession, type AccessChoice, type SessionOptions, type SessionSnapshot } from "./session";
export { LinkOverlay, keysOfRow, linksOfRow, useLinkVerdict, type LinkOverlayProps } from "./LinkOverlay";
export {
  APP_RULES_RECIPE,
  DATASET_STALE_AFTER_DAYS,
  NO_LINK_DATASET,
  canonicalJson,
  contentHash,
  datasetAge,
  isProposed,
  linksForLeg,
  loadBundledLinks,
  parseLinkDataset,
  pinDataset,
  proposedForLeg,
  rulesComparable,
  showsInDefaultView,
  type DatasetRejection,
  type LegMatch,
  type LinkIndex,
  type LinkLoad,
} from "./links/dataset";
export { LINK_BANDS, LINK_PROOFS, LINK_RELATIONS, LINK_STATES, linkDatasetSchema, linkSchema, type Link, type LinkBand, type LinkDataset, type LinkLeg } from "./links/schema";
export { linkLabel, verifyLink, type LegObservation, type LinkLabelReason, type LinkReason, type LinkVerdict } from "./links/verify";
export { pointsText, probabilityText, usdLabel } from "./figures";
