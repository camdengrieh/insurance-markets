// Public surface of the explorer feature (docs/dapp-design.md 7.4 work package E). The two screens are
// app/src/routes/markets.tsx and market.tsx; other features import from here, never from the sibling modules.
import "./explorer.css";

export { MarketsView, filterRows, sortRows, type SortKey } from "./MarketsView";
export { MarketDetail } from "./MarketDetail";
export { ExplorerServicesProvider, MarketMemory, createExplorerServices, setExplorerTokenSource, useExplorerServices, type ExplorerServices, type ExplorerServicesOptions } from "./services";
export { createExplorerAdapters, type BookAvailability, type DetailOutcome, type ExplorerAdapter, type ListOutcome, type ShapeStatusView } from "./adapters";
export { EXPLORER_VENUES, UNREPORTED_VENUES, venueStatusOf, type VenueStatus } from "./catalog";
export { classifyError, FeedError, MAX_PAGES_PER_VENUE, PAGE_SIZE, STATUS_FILTERS, useMarketFeed, type ClassifiedError, type FeedErrorCode, type FeedSelection, type StatusFilter, type VenueFeed } from "./feed";
export { BOOK_ROW_CAP, bookTargets, loadBooks, type BookEntry } from "./books";
export { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, STATUS_TEXT, depthWithin, headlineOutcome, priceText, statusInfo, utcText, viewBook, volumeText, type BookView, type SpreadTier } from "./display";
export { isSafeMarketId, marketHref, parseMarketParams, type MarketParams } from "./ids";
export { APPROVED_LINK_DATASET, LinkBadge, LinkGroupPlaceholder, linksFor } from "./links";
