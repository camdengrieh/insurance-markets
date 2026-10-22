// Public surface of the explorer feature (docs/dapp-design.md 7.4 work package E). The screens are
// app/src/routes/home.tsx, markets.tsx (the surface) and market.tsx (the surface with the market modal open);
// other features import from here, never from the sibling modules.
import "./explorer.css";

export { MarketsView, filterRows, sortRows, TABLE_CAPTION, type MarketsViewProps, type SortKey } from "./MarketsView";
export { MarketDialog, MARKET_DIALOG_TITLE, IMPLIED_NO_TEXT, impliedFor, type MarketDialogProps } from "./MarketDialog";
export { Inspector, INSPECTOR_EMPTY, type InspectorProps } from "./Inspector";
export { ExplorerHero, heroFacts, HERO_LEDE, type HeroCounts } from "./HeroBand";
export { ViewChips } from "./ViewChips";
export { CategoryChips, type CategoryChipsProps } from "./CategoryChips";
export { ALL_CATEGORIES, ALL_CATEGORIES_LABEL, CATEGORY_SOURCE_TEXT, categoryEmptyWords, categoryLabelOf, categoryOfRow, categorySourceText, countsByCategory, filterByCategory, inCategory, isCategoryFilter, verdictOf, type CategoryFilter } from "./categories";
export { BookPanel, type BookPanelProps } from "./BookPanel";
export { SameQuestion, NO_APPROVED_LINK, CANDIDATES_NOTE, type SameQuestionProps } from "./SameQuestion";
export { QuotientPanel, QuotientLine, quotientKeyFor, quotientStateOf, useQuotientSnapshot, QUOTIENT_OFF_TEXT, QUOTIENT_NOT_COVERED_TEXT, type QuotientState } from "./QuotientPanel";
export { Ticket, Worksheet, PrepareOrderAction, tokenChoicesOf, hasTicket, NO_PATH_REASON, TICKET_VENUES, PREPARE_LABEL, PREPARE_NEEDS_COCKPIT, PREPARE_NOT_PAIRED, PREPARE_NO_PATH } from "./Ticket";
export { VIEW_IDS, VIEW_LABELS, DEFAULT_VIEW, QUOTIENT_COVERED_VENUES, countsByView, filterByView, holdingKey, inView, isViewId, marksOf, quotientCovers, rowKeyOf, NO_MARKS, type MarkContext, type RowMarks, type ViewId } from "./views";
export { ExplorerServicesProvider, MarketMemory, createExplorerServices, setExplorerTokenSource, useExplorerServices, type ExplorerServices, type ExplorerServicesOptions } from "./services";
export { createExplorerAdapters, type BookAvailability, type DetailOutcome, type ExplorerAdapter, type ListOutcome, type ShapeStatusView } from "./adapters";
export { EXPLORER_VENUES, UNREPORTED_VENUES, venueStatusOf, type VenueStatus } from "./catalog";
export { classifyError, FeedError, MAX_PAGES_PER_VENUE, PAGE_SIZE, STATUS_FILTERS, useMarketFeed, type ClassifiedError, type FeedErrorCode, type FeedSelection, type StatusFilter, type VenueFeed } from "./feed";
export { BOOK_ROW_CAP, bookTargets, loadBooks, type BookEntry } from "./books";
export { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, STATUS_TEXT, depthWithin, headlineOutcome, impliedComplement, priceText, statusInfo, utcText, viewBook, volumeText, type BookView, type ImpliedSide, type SpreadTier } from "./display";
export { isSafeMarketId, marketHref, parseMarketParams, type MarketParams } from "./ids";
export { LinkGroupEmpty, candidatesFor, linkedRowKeys, type CandidateLookup, type LinkCandidate } from "./links";
