// The market modal (docs/design/cockpit-v2 Market.dc.html; docs/dapp-design.md 4.5, 7.2 M0-3, M0-8), over the
// Markets table: rules as inert text, the venue's display price and its order book kept apart and labelled, both
// sides of the book (the No side implied as 1 minus Yes only when the venue gives no No book, and labelled so), fee
// model, times and terms, the linked legs as candidates with the permanent "why this is never arbitrage" line, the
// Quotient panel with every disclosure, and the footer ticket (XO, Polymarket and Limitless in the Cockpit) or worksheet. Read-only apart from
// what the trade desk prepares through the daemon; nothing here signs or sends.
//
// It is the existing ui/Dialog (role=dialog, focus trapped, Escape closes, the rest of the page inert) and absorbs the
// sections of the former market page; a deep link /market/:venue/:id opens it over the table.
//
// Layout (Market.dc.html): the dialog keeps its fixed h2 "Market" (small, for the accessible name); below it one meta
// row (venue, status, close time, provenance) and the market title in a 26 px well (untrusted text, never a heading);
// then three columns [Order book | Same question elsewhere | Quotient]; the cautions; the one-line order ticket; and
// the display price, rules, fees, times and terms under one disclosure. It closes with the 44 px close button only.

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

import { pollIntervalFor, ttlFor } from "../../core/cache";
import { parseIsoMs } from "../../core/format";
import type { AdapterError, Book, Market, MarketRef, MarketSummary, Outcome, Prov, Result, VenueId } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { makeProv, type VenueSwitches } from "../../core/venue-policy";
import { Badge, Button, DataTable, Dialog, Disclosure, Missing, NeedsCockpitTile, Num, ProvenanceLine, Tile, UntrustedText, VenueMark, renderableUntrusted, useNow, venueName } from "../../ui";
import { BookProvenance } from "./BookPanel";
import { LevelRows } from "./levels";
import type { LinkLoad } from "../signals/links/dataset";
import type { LegReader } from "../signals/services";
import type { DetailOutcome, ExplorerAdapter } from "./adapters";
import { venueStatusOf } from "./catalog";
import { CUSTODY_TEXT, MECHANISM_TEXT, VOID_TEXT, feeView, safeDecimal, safeReasons, tickLines } from "./describe";
import { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, impliedComplement, priceText, statusInfo, utcText, viewBook, volumeText, type BookView, type ImpliedSide } from "./display";
import { FeedError, classifyError, type ClassifiedError } from "./feed";
import { VenueErrorTile, VenueStateTile } from "./venue-state";
import { BOOK_BUDGET_MS } from "./books";
import type { MarketParams } from "./ids";
import { OutcomeName } from "./MarketTable";
import { QuotientPanel, quotientStateOf, useQuotientSnapshot } from "./QuotientPanel";
import { SameQuestion, linkCountsText, type LegTitleOf } from "./SameQuestion";
import { useExplorerServices, type ExplorerServices } from "./services";
import { Ticket, hasTicket } from "./Ticket";
import { VenueTile, provForMode } from "./VenuePanel";
import { quotientCovers } from "./views";
import "./dialog.css";

const TOP_LEVELS = 5;
const SHA256 = /^[0-9a-f]{64}$/;

export const MARKET_DIALOG_TITLE = "Market";
export const IMPLIED_NO_TEXT = "No side implied as 1 minus the Yes side: implied, not a quote";
export const FEE_CEILING_TEXT = "This fee is a ceiling that has not been reconciled with a real fill. No number on this page is net of fee, and no XO spread is shown as executable.";
export const DETAILS_SUMMARY = "Display price, rules, fees, times and terms";

// ---- books -------------------------------------------------------------------------------------------------------------

// The side's name as fixed app text ("Yes", "No", "Outcome 3"): a heading never carries venue text. A creator's own
// label, when it says something other than the fixed word, sits under it in the untrusted slot.
function sideName(outcome: Outcome): string {
  return outcome.role === "yes" ? "Yes" : outcome.role === "no" ? "No" : `Outcome ${outcome.index + 1}`;
}

function CreatorLabel({ outcome }: { readonly outcome: Outcome }) {
  if (outcome.role !== "label") {
    const shown = renderableUntrusted(outcome.label, { field: "outcome" });
    if (shown === null || shown.trim() === "" || shown.trim().toLowerCase() === sideName(outcome).toLowerCase()) return null;
  }
  return (
    <p className="explorer-caption mk-side-label">
      Named by the venue: <OutcomeName outcome={outcome} />
    </p>
  );
}

function BookBlock({ venue, outcome, result, view, implied, nowMs }: { readonly venue: VenueId; readonly outcome: Outcome; readonly result: Result<Book, AdapterError> | undefined; readonly view: BookView | null; readonly implied: ImpliedSide | null; readonly nowMs: number }) {
  return (
    <div className="explorer-book" data-venue={venue} data-outcome={outcome.index} data-role={outcome.role} data-implied={implied === null ? undefined : "true"}>
      <div className="mk-side-head">
        <h4 className="mk-side-name">{sideName(outcome)}</h4>
        {implied !== null ? (
          <dl className="mk-bidask">
            <div>
              <dt>Implied bid</dt>
              <dd>{implied.bid === null ? <Missing label="no Yes ask to imply from" /> : <Num>{implied.bid}</Num>}</dd>
            </div>
            <div>
              <dt>Implied ask</dt>
              <dd>{implied.ask === null ? <Missing label="no Yes bid to imply from" /> : <Num>{implied.ask}</Num>}</dd>
            </div>
          </dl>
        ) : view === null ? null : (
          <dl className="mk-bidask">
            <div>
              <dt>Best bid</dt>
              <dd>{view.bid === null ? <Missing label="no bids" /> : <Num>{view.bid}</Num>}</dd>
            </div>
            <div>
              <dt>Best ask</dt>
              <dd>{view.ask === null ? <Missing label="no asks" /> : <Num>{view.ask}</Num>}</dd>
            </div>
          </dl>
        )}
      </div>
      <CreatorLabel outcome={outcome} />
      {implied !== null ? (
        <p className="explorer-caption">
          <Badge tone="warn">implied, not a quote</Badge> {IMPLIED_NO_TEXT}. The venue gave no book for this side; nothing can be filled at these numbers.
        </p>
      ) : result === undefined ? (
        <p role="status">No book was returned for this outcome.</p>
      ) : !result.ok ? (
        <VenueErrorTile venue={venue} error={{ code: result.error, retryAfterMs: null }} what="order books" heading="h4" />
      ) : view === null ? null : (
        <>
          <div className="explorer-book-sides">
            <LevelRows caption={`Outcome ${outcome.index + 1}: bids, highest first`} levels={result.value.bids} side="bids" top={TOP_LEVELS} />
            <LevelRows caption={`Outcome ${outcome.index + 1}: asks, lowest first`} levels={result.value.asks} side="asks" top={TOP_LEVELS} />
          </div>
          <dl className="explorer-facts mk-book-facts">
            <div>
              <dt>Spread</dt>
              <dd>
                {view.spread === null ? <Missing label="no spread" /> : <Num>{view.spread}</Num>}
                <span className="explorer-caption">{SPREAD_LABEL[view.tier]}</span>
                {view.tierReason === null ? null : <span className="explorer-caption">{view.tierReason}</span>}
              </dd>
            </div>
            <div>
              <dt>Depth within 5 cents</dt>
              <dd>
                bids <Num>{view.depthBids ?? "none"}</Num>, asks <Num>{view.depthAsks ?? "none"}</Num>
              </dd>
            </div>
            <div>
              <dt>Freshness</dt>
              <dd>
                <Badge tone={view.freshness === "live" ? "ok" : "warn"}>{view.freshness === "unknown" ? "freshness unknown" : view.freshness}</Badge>
                {result.value.derived === "complement" ? <Badge tone="warn">derived from the other side, not executable</Badge> : null}
              </dd>
            </div>
          </dl>
          <BookProvenance venue={venue} book={result.value} nowMs={nowMs} />
        </>
      )}
    </div>
  );
}

// The No side is implied only for a binary market whose Yes book has both sides and whose No book the venue did not
// give (missing, empty or failed). A venue that serves two real books gets no implied figure.
export function impliedFor(market: Market, outcome: Outcome, results: ReadonlyArray<Result<Book, AdapterError>>): ImpliedSide | null {
  if (outcome.role !== "no" || market.outcomes.length !== 2) return null;
  const own = results[market.outcomes.indexOf(outcome)];
  if (own !== undefined && own.ok && (own.value.bids.length > 0 || own.value.asks.length > 0)) return null;
  const yesIndex = market.outcomes.findIndex((candidate) => candidate.role === "yes");
  const yes = yesIndex === -1 ? undefined : results[yesIndex];
  if (yes === undefined || !yes.ok || yes.value.bids.length === 0 || yes.value.asks.length === 0) return null;
  return impliedComplement(yes.value);
}

// The fee line of the book column (Market.dc.html's caution tile): the venue's fee status in words, never a number
// net of fee. The full fee facts sit under the details disclosure.
function FeeCaution({ market, entry }: { readonly market: Market; readonly entry: ExplorerAdapter }) {
  const view = feeView(market.fee);
  if (entry.feeNote !== null) {
    return (
      <Tile tone="warn" title={`Fee: ${entry.feeNote}`} heading="h4" dataKind="fee" dataCode="ceiling">
        <p>{FEE_CEILING_TEXT}</p>
      </Tile>
    );
  }
  if (!view.known) {
    return (
      <Tile tone="warn" title="Fee model: unknown, fails closed" heading="h4" dataKind="fee" dataCode="unknown">
        <p>This build cannot read this venue&apos;s fee model, so no number on this page is net of fee. Size on the book only.</p>
      </Tile>
    );
  }
  return <p className="explorer-note">{`Fee model: ${view.model}. No number in this column is net of fee.`}</p>;
}

function Books({ services, entry, market, summary }: { readonly services: ExplorerServices; readonly entry: ExplorerAdapter; readonly market: Market; readonly summary: MarketSummary | undefined }) {
  const nowMs = useNow(10_000);
  // A venue that cannot be asked now (throttled, blocked or chain only) is not asked for books, and says why.
  const readState = services.venueState(market.ref.venue, nowMs);
  const available = entry.books.state === "available" && readState.kind === "ok";
  const query = useQuery({
    queryKey: ["explorer", "books", services.id, market.ref.venue, market.ref.marketId] as const,
    enabled: available,
    staleTime: ttlFor("book_foreground"),
    refetchInterval: services.pollBooks ? (pollIntervalFor("book_foreground", false) as number | false) : false,
    queryFn: async (): Promise<ReadonlyArray<Result<Book, AdapterError>>> => {
      try {
        return await entry.adapter.getBooks(
          market.outcomes.map((outcome) => ({ venue: market.ref.venue, tokenId: outcome.tokenId, marketId: market.ref.marketId })),
          { deadlineMs: entry.deadlineFor(services.nowMs(), BOOK_BUDGET_MS) },
        );
      } catch (error) {
        throw new FeedError(classifyError(error));
      }
    },
  });
  let body;
  if (entry.books.state === "needs_cockpit") {
    body = <NeedsCockpitTile venue={market.ref.venue} what={entry.books.what.toLowerCase()} heading="h4" />;
  } else if (entry.books.state === "none") {
    body = (
      <Tile tone="neutral" title="No order book" heading="h4" dataKind="no-book">
        <p>{entry.books.why}. The only price shown for this market is the venue's display price.</p>
      </Tile>
    );
  } else if (readState.kind !== "ok") {
    body = <VenueStateTile venue={market.ref.venue} state={readState} nowMs={nowMs} heading="h4" kept="No book is shown and none is asked for until reads may be sent again; an earlier book is never shown as live." />;
  } else if (query.isPending) {
    body = <p role="status">Loading the order book.</p>;
  } else if (query.isError) {
    const error: ClassifiedError = query.error instanceof FeedError ? query.error.classified : classifyError(query.error);
    body = <VenueErrorTile venue={market.ref.venue} error={error} what="order books" heading="h4" onRetry={() => void query.refetch()} />;
  } else {
    const volume = summary === undefined ? null : volumeText(summary.volume);
    body = (
      <>
        <div className="mk-book-sides">
          {market.outcomes.map((outcome, index) => {
            const result = query.data[index];
            const implied = impliedFor(market, outcome, query.data);
            return <BookBlock key={outcome.index} venue={market.ref.venue} outcome={outcome} result={result} view={result?.ok === true ? viewBook(market.ref.venue, result.value, nowMs) : null} implied={implied} nowMs={nowMs} />;
          })}
        </div>
        {volume === null ? null : (
          <dl className="mk-strip">
            <div>
              <dt>Volume, as the venue lists it</dt>
              <dd>
                <Num>{volume}</Num>
              </dd>
            </div>
          </dl>
        )}
      </>
    );
  }
  const loaded = available && !query.isPending && !query.isError;
  return (
    <section aria-labelledby="explorer-books-heading" className="explorer-section mk-col" data-col="book">
      <h3 id="explorer-books-heading">Order book</h3>
      <p className="mk-col-note">{loaded ? `top ${TOP_LEVELS} levels a side, as the venue returned them` : "no levels loaded"}</p>
      {body}
      <FeeCaution market={market} entry={entry} />
      {loaded ? (
        <p className="mk-col-actions">
          <Button onClick={() => void query.refetch()} busy={query.isFetching}>
            Refresh the book
          </Button>
        </p>
      ) : null}
    </section>
  );
}

// ---- the sections -----------------------------------------------------------------------------------------------------

function TimeRow({ label, iso }: { readonly label: string; readonly iso: string | undefined }) {
  const text = utcText(iso);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{text === null ? <Missing label="not stated" /> : <Num>{text}</Num>}</dd>
    </div>
  );
}

function DisplayPrices({ summary }: { readonly summary: MarketSummary | undefined }) {
  if (summary === undefined) {
    return (
      <p className="explorer-note">
        The venue's display price comes from the market list and has not been loaded in this visit. Open this market from the <Link href="/markets">Markets list</Link> to see it.
      </p>
    );
  }
  return (
    <>
      <DataTable
        caption="Display price per outcome"
        rows={summary.outcomes}
        rowKey={(outcome) => String(outcome.index)}
        columns={[
          { key: "outcome", header: "Outcome", rowHeader: true, render: (outcome) => <OutcomeName outcome={outcome} /> },
          { key: "price", header: "Display price", align: "end", render: (outcome) => priceText(outcome.displayPrice) },
        ]}
      />
      <p className="explorer-note">{`The venue lists these beside the market: ${DISPLAY_PRICE_CAPTION}. They are not an order book and not a price you can trade at.`}</p>
    </>
  );
}

function Rules({ market }: { readonly market: Market }) {
  const { rules } = market;
  const hash = SHA256.test(rules.sha256) ? rules.sha256 : null;
  return (
    <section aria-labelledby="explorer-rules-heading" className="explorer-section">
      <h3 id="explorer-rules-heading">Rules</h3>
      <UntrustedText value={rules.text} field="rules" block />
      <dl className="explorer-facts">
        <div>
          <dt>Rules fingerprint (sha256 of the text above, whitespace collapsed)</dt>
          <dd>{hash === null ? <Missing label="no rules text to fingerprint" /> : <code className="explorer-hash">{hash}</code>}</dd>
        </div>
        <div>
          <dt>How it resolves</dt>
          <dd>{Object.hasOwn(MECHANISM_TEXT, rules.mechanism) ? MECHANISM_TEXT[rules.mechanism] : MECHANISM_TEXT.unknown}</dd>
        </div>
        <div>
          <dt>If voided</dt>
          <dd>{Object.hasOwn(VOID_TEXT, rules.void) ? VOID_TEXT[rules.void] : VOID_TEXT.unknown}</dd>
        </div>
        <div>
          <dt>Can close early</dt>
          <dd>{rules.canCloseEarly === undefined ? "not stated" : rules.canCloseEarly ? "yes" : "no"}</dd>
        </div>
        <TimeRow label="Rules cutoff (UTC)" iso={rules.cutoffUtc} />
        <TimeRow label="Rules window starts (UTC)" iso={rules.windowStartUtc} />
        {rules.resolver === undefined ? null : (
          <div>
            <dt>Resolver (set by the creator: data, not a guarantee)</dt>
            <dd>
              <UntrustedText value={untrusted(rules.resolver)} field="generic" clamp={1} />
            </dd>
          </div>
        )}
      </dl>
      <h4>Resolution sources</h4>
      {rules.sources.length === 0 ? (
        <p className="explorer-note">No sources are listed.</p>
      ) : (
        <ul className="explorer-sources">
          {rules.sources.slice(0, 10).map((source, index) => (
            <li key={index}>
              <UntrustedText value={untrusted(source)} field="generic" clamp={2} />
            </li>
          ))}
        </ul>
      )}
      <p className="explorer-note">Sources are shown as text. This page never opens a link taken from market text.</p>
    </section>
  );
}

function Fees({ market, entry }: { readonly market: Market; readonly entry: ExplorerAdapter }) {
  const view = feeView(market.fee);
  return (
    <section aria-labelledby="explorer-fees-heading" className="explorer-section">
      <h3 id="explorer-fees-heading">Fees</h3>
      <dl className="explorer-facts">
        <div>
          <dt>Fee model</dt>
          <dd>
            {view.model}
            {view.known ? null : <Badge tone="warn">unknown: fails closed</Badge>}
          </dd>
        </div>
        {entry.feeNote === null ? null : (
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone="warn">{entry.feeNote}</Badge>
            </dd>
          </div>
        )}
        {view.lines.length === 0 ? null : (
          <div>
            <dt>Parameters</dt>
            <dd>
              <ul>
                {view.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt>Who pays</dt>
          <dd>{view.payer}</dd>
        </div>
        <div>
          <dt>Parameters read</dt>
          <dd>{view.verifiedAt === null ? <Missing label="no read date" /> : <Num>{view.verifiedAt}</Num>}</dd>
        </div>
      </dl>
      {entry.feeNote === null ? null : <p className="explorer-note">The fee is a ceiling: see the order book column. No number on this page is net of fee.</p>}
    </section>
  );
}

function Terms({ market }: { readonly market: Market }) {
  const ticks = tickLines(market.tick);
  const minSize = safeDecimal(market.minSize);
  const reasons = safeReasons(market.tradable.reasons);
  return (
    <section aria-labelledby="explorer-terms-heading" className="explorer-section">
      <h3 id="explorer-terms-heading">Times and terms</h3>
      <dl className="explorer-facts">
        <TimeRow label="Opens (UTC)" iso={market.timesUtc.opensAt} />
        <TimeRow label="Closes (UTC)" iso={market.timesUtc.closesAt} />
        <TimeRow label="Expected result (UTC)" iso={market.timesUtc.expectedResolutionAt} />
        <TimeRow label="Latest result (UTC)" iso={market.timesUtc.latestResolutionAt} />
        <div>
          <dt>Open for trading, by the venue's metadata</dt>
          <dd>
            <Badge tone={market.tradable.ok ? "ok" : "warn"}>{market.tradable.ok ? "open (metadata only, not a quote)" : "not open"}</Badge>
            {reasons.length === 0 ? null : <span className="explorer-caption">{reasons.join("; ")}</span>}
          </dd>
        </div>
        <div>
          <dt>Price step</dt>
          <dd>{ticks.length === 0 ? <Missing label="not stated" /> : <Num>{ticks.join("; ")}</Num>}</dd>
        </div>
        <div>
          <dt>Smallest order (shares)</dt>
          <dd>{minSize === null ? <Missing label="not stated" /> : <Num>{minSize}</Num>}</dd>
        </div>
        <div>
          <dt>Money it settles in</dt>
          <dd>
            <UntrustedText value={untrusted(market.collateral.symbol)} field="tag" /> on <Num>{market.collateral.chain}</Num>, <Num>{String(market.collateral.decimals)}</Num> decimals,{" "}
            {Object.hasOwn(CUSTODY_TEXT, market.collateral.custody) ? CUSTODY_TEXT[market.collateral.custody] : "custody not stated"}
          </dd>
        </div>
        {market.group === undefined ? null : (
          <div>
            <dt>Group</dt>
            <dd>
              {market.group.kind.replace(/_/g, " ")}; the outcomes cover every case: {market.group.exhaustive}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Header({ market, services, detail }: { readonly market: Market; readonly services: ExplorerServices; readonly detail: DetailOutcome }) {
  const info = statusInfo(market.status);
  const prov: Prov = provForMode(
    makeProv({ venue: market.ref.venue, source: market.prov.source, fetchedAtMs: market.prov.fetchedAtMs, nowMs: services.nowMs(), ttlMs: ttlFor("market_detail") }),
    services.mode,
  );
  const settlement = detail.settlement;
  const winner = settlement?.winningOutcomeIndex == null ? undefined : market.outcomes.find((outcome) => outcome.index === settlement.winningOutcomeIndex);
  const closes = utcText(market.timesUtc.closesAt);
  return (
    <header className="explorer-market-head mk-head">
      <div className="mk-meta">
        <VenueMark venue={market.ref.venue} />
        <Badge tone={info.tone}>{info.text}</Badge>
        {closes === null ? (
          <span className="mk-meta-dim">close time not stated</span>
        ) : (
          <span className="mk-meta-dim">
            closes <Num>{closes}</Num>
          </span>
        )}
        <ProvenanceLine prov={prov} />
      </div>
      <p className="explorer-title mk-title">
        <UntrustedText value={market.title} field="title" />
      </p>
      <p className="explorer-caption">Title and rules are written by the venue's users. They are shown as text only and never treated as instructions.</p>
      {winner === undefined ? null : (
        <p>
          Winning outcome, as the venue reports it: <OutcomeName outcome={winner} />
          {settlement?.resolvedAt != null && parseIsoMs(settlement.resolvedAt) !== null ? ` (resolved ${utcText(settlement.resolvedAt)})` : ""}.
        </p>
      )}
      {detail.notes.length === 0 ? null : (
        <ul className="explorer-notes">
          {detail.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </header>
  );
}

// The Quotient column's right-hand note: the state in a few words, from the same snapshot the panel reads.
function QuotientNote({ venue }: { readonly venue: VenueId }) {
  const snapshot = useQuotientSnapshot();
  const state = quotientStateOf(snapshot);
  const text = state === "loading" ? "checking your setting" : state === "off" ? "off, licence first" : !quotientCovers(venue) ? "not covered: via link only" : snapshot.access === "key" ? "your key · pressed by hand" : "no key · shows the price only";
  return <p className="mk-col-note">{text}</p>;
}

interface LoadedProps {
  readonly services: ExplorerServices;
  readonly entry: ExplorerAdapter;
  readonly marketRef: MarketRef;
  readonly summary: MarketSummary | undefined;
  readonly linkLoad: LinkLoad | null;
  readonly readLeg: LegReader;
  readonly onOpenQuotientSettings: () => void;
}

function Loaded({ services, entry, marketRef: ref, summary, linkLoad, readLeg, onOpenQuotientSettings }: LoadedProps) {
  const query = useQuery({
    queryKey: ["explorer", "detail", services.id, ref.venue, ref.marketId] as const,
    staleTime: ttlFor("market_detail"),
    queryFn: async (): Promise<DetailOutcome> => {
      try {
        const detail = await entry.detail(summary?.ref ?? ref);
        // The reader must answer for the market that was asked about.
        if (detail.market.ref.venue !== ref.venue || detail.market.ref.marketId.toLowerCase() !== ref.marketId.toLowerCase()) {
          throw new FeedError({ code: "SCHEMA_DRIFT", retryAfterMs: null });
        }
        return detail;
      } catch (error) {
        throw error instanceof FeedError ? error : new FeedError(classifyError(error));
      }
    },
  });
  if (query.isPending) return <p role="status">Loading the market.</p>;
  if (query.isError) {
    const error: ClassifiedError = query.error instanceof FeedError ? query.error.classified : classifyError(query.error);
    return <VenueErrorTile venue={ref.venue} error={error} what="this market" heading="h3" onRetry={() => void query.refetch()} />;
  }
  const { market } = query.data;
  const counts = linkCountsText(linkLoad, market.ref);
  // A leg's title, only from a list row this visit already holds; nothing is requested to find one.
  const titleOf: LegTitleOf = (venue, marketId) => services.memory.get(venue, marketId)?.title ?? null;
  return (
    <div className="explorer-detail" data-venue={ref.venue}>
      <Header market={market} services={services} detail={query.data} />
      <div className="mk-grid">
        <Books services={services} entry={entry} market={market} summary={summary} />
        <section aria-labelledby="explorer-links-heading" className="explorer-section mk-col" data-col="links">
          <h3 id="explorer-links-heading">Same question elsewhere</h3>
          <p className="mk-col-note">{counts ?? "candidates, not proof"}</p>
          <SameQuestion market={market.ref} load={linkLoad} readLeg={readLeg} nowMs={services.nowMs} variant="full" heading="h4" titleOf={titleOf} />
        </section>
        <section aria-labelledby="explorer-quotient-heading" className="explorer-section mk-col" data-col="quotient">
          <h3 id="explorer-quotient-heading">Quotient</h3>
          <QuotientNote venue={market.ref.venue} />
          <QuotientPanel market={summary?.ref ?? market.ref} linkLoad={linkLoad} onOpenSettings={onOpenQuotientSettings} />
        </section>
      </div>
      {entry.shape !== null && entry.shape.status !== "verified" ? (
        <div className="mk-band">
          <Tile tone="warn" title="Unproven: response shapes" heading="h3" dataKind="unproven" dataCode={ref.venue}>
            <p>{`The shapes this venue's answers were read in are unverified: ${entry.shape.summary}`}</p>
          </Tile>
        </div>
      ) : null}
      {entry.clause === null ? null : (
        <div className="mk-band">
          <Tile tone="info" title="Venue restriction" role="note" heading="h3">
            <p>{entry.clause}</p>
          </Tile>
        </div>
      )}
      <section aria-labelledby="explorer-ticket-heading" className="explorer-section explorer-ticket mk-ticket">
        <h3 id="explorer-ticket-heading">{hasTicket(market.ref.venue) ? "Order ticket" : "Worksheet"}</h3>
        <Ticket market={market} />
      </section>
      <div className="mk-band mk-details">
        <Disclosure summary={DETAILS_SUMMARY}>
          <section aria-labelledby="explorer-prices-heading" className="explorer-section">
            <h3 id="explorer-prices-heading">Display price</h3>
            <DisplayPrices summary={summary} />
          </section>
          <Rules market={market} />
          <Fees market={market} entry={entry} />
          <Terms market={market} />
        </Disclosure>
      </div>
    </div>
  );
}

// ---- the dialog ---------------------------------------------------------------------------------------------------------

export interface MarketDialogProps {
  readonly market: MarketParams;
  // The list row, when this visit loaded it (the display price and the full reference live there).
  readonly summary: MarketSummary | undefined;
  readonly switches: VenueSwitches;
  readonly linkLoad: LinkLoad | null;
  readonly readLeg: LegReader;
  readonly onClose: () => void;
  readonly onOpenQuotientSettings: () => void;
}

export function MarketDialog({ market, summary, switches, linkLoad, readLeg, onClose, onOpenQuotientSettings }: MarketDialogProps) {
  const services = useExplorerServices();
  const entry = services.adapters[market.venue];
  const status = venueStatusOf(market.venue, switches, services.mode, entry !== undefined);
  const blocked = status.kind !== "active" || entry === undefined;
  // The loaded modal carries venue and status in its own meta row; the venue tile alone gets them as the lede.
  const lede = blocked ? `${venueName(market.venue)} · ${summary === undefined ? "market" : statusInfo(summary.status).text}` : undefined;
  return (
    <Dialog open title={MARKET_DIALOG_TITLE} lede={lede} size="wide" onClose={onClose}>
      <div className="explorer explorer-modal mk" data-blocked={blocked ? "true" : undefined}>
        {blocked ? (
          <VenueTile row={{ venue: market.venue, status, adapter: entry, feed: undefined, selected: true }} mode={services.mode} />
        ) : (
          <Loaded services={services} entry={entry} marketRef={{ venue: market.venue, marketId: market.marketId, native: {} }} summary={summary} linkLoad={linkLoad} readLeg={readLeg} onOpenQuotientSettings={onOpenQuotientSettings} />
        )}
      </div>
    </Dialog>
  );
}
