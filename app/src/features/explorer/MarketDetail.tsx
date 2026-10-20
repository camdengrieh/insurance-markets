// One market: rules as inert text, the venue's display price and its order book kept apart and labelled, fee model,
// times, and the placeholder for linked groups (docs/dapp-design.md 4.5, 7.2 M0-3, M0-8). Read-only.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "wouter";

import { pollIntervalFor, ttlFor } from "../../core/cache";
import { formatAge, parseIsoMs } from "../../core/format";
import type { AdapterError, Book, Level, Market, MarketRef, MarketSummary, Outcome, Prov, Result, VenueId } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { DEFAULT_SWITCHES, makeProv, type VenueSwitches } from "../../core/venue-policy";
import {
  Badge,
  Button,
  DataTable,
  ErrorTile,
  Missing,
  NeedsCockpitTile,
  ProvenanceStrip,
  Tile,
  UntrustedText,
  useNow,
  venueName,
} from "../../ui";
import type { DetailOutcome, ExplorerAdapter } from "./adapters";
import { venueStatusOf } from "./catalog";
import {
  CUSTODY_TEXT,
  MECHANISM_TEXT,
  VOID_TEXT,
  feeView,
  safeDecimal,
  safeReasons,
  tickLines,
} from "./describe";
import { DISPLAY_PRICE_CAPTION, SPREAD_LABEL, priceText, sizeText, statusInfo, utcText, viewBook, type BookView } from "./display";
import { FeedError, classifyError, type ClassifiedError } from "./feed";
import { BOOK_BUDGET_MS } from "./books";
import { parseMarketParams } from "./ids";
import { LinkGroupPlaceholder } from "./links";
import { useExplorerServices, type ExplorerServices } from "./services";
import { OutcomeName } from "./MarketTable";
import { VenueTile, provForMode } from "./VenuePanel";

const TOP_LEVELS = 5;
const SHA256 = /^[0-9a-f]{64}$/;

// ---- books -------------------------------------------------------------------------------------------------------------

function LevelsTable({ caption, levels }: { readonly caption: string; readonly levels: readonly Level[] }) {
  const shown = levels.slice(0, TOP_LEVELS);
  return (
    <DataTable
      caption={caption}
      rows={shown}
      rowKey={(level, index) => `${level.price}:${index}`}
      empty={<p className="explorer-note">{`${caption}: no orders on this side. No price is implied.`}</p>}
      columns={[
        { key: "price", header: "Price", render: (level) => priceText(level.price) },
        { key: "size", header: "Size", align: "end", render: (level) => sizeText(level.size) },
      ]}
    />
  );
}

function BookBlock({ venue, outcome, result, view }: { readonly venue: VenueId; readonly outcome: Outcome; readonly result: Result<Book, AdapterError> | undefined; readonly view: BookView | null }) {
  return (
    <div className="explorer-book" data-venue={venue} data-outcome={outcome.index}>
      <h4>
        Outcome {outcome.index + 1}: <OutcomeName outcome={outcome} />
      </h4>
      {result === undefined ? (
        <p role="status">No book was returned for this outcome.</p>
      ) : !result.ok ? (
        <ErrorTile code={result.error} venue={venue} heading="h4" />
      ) : view === null ? null : (
        <>
          <dl className="explorer-facts">
            <div>
              <dt>Best bid</dt>
              <dd>{view.bid ?? <Missing label="no bids" />}</dd>
            </div>
            <div>
              <dt>Best ask</dt>
              <dd>{view.ask ?? <Missing label="no asks" />}</dd>
            </div>
            <div>
              <dt>Spread</dt>
              <dd>
                {view.spread ?? <Missing label="no spread" />}
                <span className="explorer-caption">{SPREAD_LABEL[view.tier]}</span>
                {view.tierReason === null ? null : <span className="explorer-caption">{view.tierReason}</span>}
              </dd>
            </div>
            <div>
              <dt>Depth within 5 cents</dt>
              <dd>
                bids {view.depthBids ?? "none"}, asks {view.depthAsks ?? "none"}
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
          <div className="explorer-book-sides">
            <LevelsTable caption={`Outcome ${outcome.index + 1}: bids, highest first`} levels={result.value.bids} />
            <LevelsTable caption={`Outcome ${outcome.index + 1}: asks, lowest first`} levels={result.value.asks} />
          </div>
        </>
      )}
    </div>
  );
}

function Books({ services, entry, market }: { readonly services: ExplorerServices; readonly entry: ExplorerAdapter; readonly market: Market }) {
  const nowMs = useNow(10_000);
  const available = entry.books.state === "available";
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
  const asOf = (query.data ?? []).flatMap((result) => (result.ok ? [result.value.asOfMs] : []));
  const newest = asOf.length === 0 ? null : Math.max(...asOf);

  let body;
  if (entry.books.state === "needs_cockpit") {
    body = <NeedsCockpitTile venue={market.ref.venue} what={entry.books.what.toLowerCase()} heading="h4" />;
  } else if (entry.books.state === "none") {
    body = (
      <Tile tone="neutral" title="No order book" heading="h4" dataKind="no-book">
        <p>{entry.books.why}. The only price shown for this market is the venue's display price.</p>
      </Tile>
    );
  } else if (query.isPending) {
    body = <p role="status">Loading the order book.</p>;
  } else if (query.isError) {
    const error: ClassifiedError = query.error instanceof FeedError ? query.error.classified : classifyError(query.error);
    body =
      error.code === "NEEDS_COCKPIT" ? (
        <NeedsCockpitTile venue={market.ref.venue} what="order books" heading="h4" />
      ) : (
        <ErrorTile code={error.code} venue={market.ref.venue} heading="h4" onRetry={() => void query.refetch()} />
      );
  } else {
    body = (
      <>
        {market.outcomes.map((outcome, index) => {
          const result = query.data[index];
          return <BookBlock key={outcome.index} venue={market.ref.venue} outcome={outcome} result={result} view={result?.ok === true ? viewBook(market.ref.venue, result.value, nowMs) : null} />;
        })}
        <p className="explorer-note">
          {newest === null ? "" : `Newest book is from ${formatAge(nowMs, newest)}. `}
          <Button onClick={() => void query.refetch()} busy={query.isFetching}>
            Refresh the book
          </Button>
        </p>
      </>
    );
  }
  return (
    <section aria-labelledby="explorer-books-heading" className="explorer-section">
      <h3 id="explorer-books-heading">Order book</h3>
      {body}
    </section>
  );
}

// ---- the page ----------------------------------------------------------------------------------------------------------

function TimeRow({ label, iso }: { readonly label: string; readonly iso: string | undefined }) {
  const text = utcText(iso);
  return (
    <div>
      <dt>{label}</dt>
      <dd>{text ?? <Missing label="not stated" />}</dd>
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
          <dd>{view.verifiedAt ?? <Missing label="no read date" />}</dd>
        </div>
      </dl>
      {entry.feeNote === null ? null : <p className="explorer-note">This fee is a ceiling that has not been reconciled with a real fill. No number on this page is net of fee, and no XO spread is shown as executable.</p>}
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
          <dd>{ticks.length === 0 ? <Missing label="not stated" /> : ticks.join("; ")}</dd>
        </div>
        <div>
          <dt>Smallest order (shares)</dt>
          <dd>{minSize ?? <Missing label="not stated" />}</dd>
        </div>
        <div>
          <dt>Money it settles in</dt>
          <dd>
            <UntrustedText value={untrusted(market.collateral.symbol)} field="tag" /> on {market.collateral.chain}, {market.collateral.decimals} decimals,{" "}
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
  return (
    <>
      <h2 className="explorer-title">
        <UntrustedText value={market.title} field="title" />
      </h2>
      <p>
        <Badge tone="neutral">{venueName(market.ref.venue)}</Badge> <Badge tone={info.tone}>{info.text}</Badge>
      </p>
      <ProvenanceStrip prov={prov} />
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
    </>
  );
}

function Loaded({ services, entry, marketRef: ref }: { readonly services: ExplorerServices; readonly entry: ExplorerAdapter; readonly marketRef: MarketRef }) {
  const summary = services.memory.get(ref.venue, ref.marketId);
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
    return error.code === "NEEDS_COCKPIT" ? <NeedsCockpitTile venue={ref.venue} what="this market" /> : <ErrorTile code={error.code} venue={ref.venue} onRetry={() => void query.refetch()} />;
  }
  const { market } = query.data;
  return (
    <div className="explorer-detail" data-venue={ref.venue}>
      <Header market={market} services={services} detail={query.data} />
      <section aria-labelledby="explorer-prices-heading" className="explorer-section">
        <h3 id="explorer-prices-heading">Prices</h3>
        <DisplayPrices summary={summary} />
      </section>
      <Books services={services} entry={entry} market={market} />
      <Rules market={market} />
      <Fees market={market} entry={entry} />
      <Terms market={market} />
      <section aria-labelledby="explorer-links-heading" className="explorer-section">
        <h3 id="explorer-links-heading">Linked groups</h3>
        <LinkGroupPlaceholder market={market.ref} heading="h4" />
      </section>
      {entry.shape !== null && entry.shape.status !== "verified" ? (
        <Tile tone="warn" title="Unproven: response shapes" heading="h3" dataKind="unproven" dataCode={ref.venue}>
          <p>{`The shapes this venue's answers were read in are unverified: ${entry.shape.summary}`}</p>
        </Tile>
      ) : null}
      {entry.clause === null ? null : (
        <Tile tone="info" title="Venue restriction" role="note" heading="h3">
          <p>{entry.clause}</p>
        </Tile>
      )}
    </div>
  );
}

export function MarketDetail({ params }: { readonly params: Readonly<Record<string, string | undefined>> }) {
  const services = useExplorerServices();
  const [switches, setSwitches] = useState<VenueSwitches | null>(null);
  useEffect(() => {
    let live = true;
    void services.loadSwitches().then(
      (loaded) => live && setSwitches(loaded),
      () => live && setSwitches(DEFAULT_SWITCHES),
    );
    return () => {
      live = false;
    };
  }, [services]);

  const parsed = parseMarketParams(params);
  if (parsed === null) {
    return (
      <>
        <ErrorTile code="NOT_FOUND" title="This is not a market address" message="The address does not name a venue and a market id this app can read, so nothing was requested." />
        <p>
          <Link href="/markets">Back to the Markets list</Link>
        </p>
      </>
    );
  }
  if (switches === null) return <p role="status">Loading your venue settings.</p>;
  const entry = services.adapters[parsed.venue];
  const status = venueStatusOf(parsed.venue, switches, services.mode, entry !== undefined);
  return (
    <div className="explorer">
      <p>
        <Link href="/markets">Back to the Markets list</Link>
      </p>
      {status.kind !== "active" || entry === undefined ? (
        <VenueTile row={{ venue: parsed.venue, status, adapter: entry, feed: undefined, selected: true }} mode={services.mode} />
      ) : (
        <Loaded services={services} entry={entry} marketRef={{ venue: parsed.venue, marketId: parsed.marketId, native: {} }} />
      )}
    </div>
  );
}
