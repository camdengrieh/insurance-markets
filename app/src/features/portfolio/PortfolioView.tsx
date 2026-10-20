import { Link } from "wouter";

import { venuePolicy } from "../../core/venue-policy";
import {
  Badge,
  Button,
  DataTable,
  Disclosure,
  EmptyTile,
  ErrorTile,
  Missing,
  NeedsCockpitTile,
  ProvenanceStrip,
  RestrictedTermsTile,
  Tile,
  UntrustedText,
  venueName,
  type Column,
  type Tone,
} from "../../ui";
import { untrusted } from "../../core/untrusted";
import { useBindingsState } from "../wallet/services";
import { moneyText, sharesText, signedMoneyText } from "./format";
import { SHAPE_EXPLANATION, SHAPE_LABEL_TEXT } from "./shape";
import { summarize, type SymbolTotal } from "./valuation";
import { usePortfolio } from "./usePortfolio";
import type { PortfolioRow, RowStatus, VenueReadOk, VenueReadOutcome } from "./types";

const STATUS_TEXT: Readonly<Record<RowStatus, { readonly text: string; readonly tone: Tone }>> = Object.freeze({
  open: { text: "open", tone: "info" },
  claimable: { text: "claimable", tone: "ok" },
  resolved_unclaimed: { text: "settled, not claimed", tone: "warn" },
  voided_refund: { text: "voided, refund due", tone: "warn" },
  lost: { text: "lost", tone: "neutral" },
  closed: { text: "closed", tone: "neutral" },
  unknown: { text: "state not known", tone: "warn" },
});

// ---- totals -----------------------------------------------------------------------------------------------------

function TotalLine({ total, noun }: { readonly total: SymbolTotal; readonly noun: string }) {
  return (
    <li>
      <strong>{total.total === null ? <Missing label="no priced position" /> : moneyText(total.total, total.symbol)}</strong>
      {total.total === null ? ` ${total.symbol}` : ""} {`from ${total.included} ${noun}`}
      {total.excluded > 0 ? `; ${total.excluded} more ${total.excluded === 1 ? "has" : "have"} no figure and ${total.excluded === 1 ? "is" : "are"} left out` : ""}
    </li>
  );
}

export function TotalsPanel({ rows }: { readonly rows: readonly PortfolioRow[] }) {
  const totals = summarize(rows);
  if (totals.rows === 0) return null;
  return (
    <Tile tone="neutral" title="Totals" role="note" dataKind="totals">
      <p>
        Every figure is counted in the asset the venue uses, and each asset has its own total. There is no single net-worth figure: a pUSD, USDC, USDC.e and TYD amount are different assets, and a
        position with no price is left out and counted, never counted as zero.
      </p>
      <h3>Open positions at the best bid</h3>
      {totals.value.length === 0 ? (
        <p>No open positions.</p>
      ) : (
        <ul data-testid="totals-value">
          {totals.value.map((total) => (
            <TotalLine key={total.symbol} total={total} noun="open positions" />
          ))}
        </ul>
      )}
      <p data-testid="totals-excluded">
        {totals.excludedFromValue === 0 ? "Every open position has a price." : `${totals.excludedFromValue} of ${totals.valueRows} open positions have no price and are not in these totals.`}
      </p>
      <h3>Settled positions with something to collect</h3>
      {totals.claimable.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul data-testid="totals-claimable">
          {totals.claimable.map((total) => (
            <TotalLine key={total.symbol} total={total} noun="settled positions" />
          ))}
        </ul>
      )}
      {totals.excludedFromClaimable > 0 ? <p>{totals.excludedFromClaimable} settled positions have no amount and are not in the claimable totals. Claiming happens on the venue; this app does not claim.</p> : null}
      {totals.otherRows > 0 ? <p>{totals.otherRows} lost, closed or unrecognised positions are listed but are in no total.</p> : null}
    </Tile>
  );
}

// ---- one venue's table ---------------------------------------------------------------------------------------------

function columnsFor(): readonly Column<PortfolioRow>[] {
  return [
    { key: "market", header: "Market", rowHeader: true, render: (row) => <UntrustedText value={row.market} field="title" clamp={2} /> },
    { key: "outcome", header: "Outcome", render: (row) => (row.outcome === null ? null : <UntrustedText value={row.outcome} field="outcome" clamp={1} />) },
    {
      key: "status",
      header: "State",
      render: (row) => (
        <>
          <Badge tone={STATUS_TEXT[row.status].tone}>{STATUS_TEXT[row.status].text}</Badge>
          {row.flags.length === 0 ? null : (
            <ul className="pf-flags">
              {row.flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    { key: "qty", header: "Size", align: "end", render: (row) => (row.qty === null ? null : sharesText(row.qty)) },
    {
      key: "value",
      header: "Value at best bid",
      align: "end",
      render: (row) =>
        row.status !== "open" ? null : row.value !== null ? (
          moneyText(row.value, row.collateralSymbol)
        ) : (
          <span>
            <Missing label="not priced" /> <span className="pf-note">{row.valueNote ?? "No price."}</span>
          </span>
        ),
    },
    {
      key: "claimable",
      header: "Claimable",
      align: "end",
      render: (row) =>
        row.status === "open" || row.status === "lost" || row.status === "closed" ? null : (
          <span>
            {row.claimable === null ? <Missing label="no amount" /> : moneyText(row.claimable, row.collateralSymbol)}
            {row.claimNote === null ? null : <span className="pf-note"> {row.claimNote}</span>}
          </span>
        ),
    },
    { key: "cost", header: "Cost", align: "end", render: (row) => (row.cost === null ? null : moneyText(row.cost, row.collateralSymbol)) },
    { key: "pnl", header: "Profit or loss (venue-reported)", align: "end", render: (row) => (row.pnl === null ? null : signedMoneyText(row.pnl, row.collateralSymbol)) },
    { key: "reference", header: "Venue's own value (reference only)", align: "end", render: (row) => (row.reference === null ? null : moneyText(row.reference, row.collateralSymbol)) },
  ];
}

function ResolutionLine({ outcome }: { readonly outcome: VenueReadOk }) {
  const resolution = outcome.resolution;
  if (resolution === null) return null;
  const how =
    resolution.source === "profile_lookup"
      ? "the wallet named by the venue's own profile lookup for your address"
      : resolution.source === "derived"
        ? "the account derived from your address"
        : "the address you saved";
  return (
    <p data-testid="resolution">
      Asked about <code>{resolution.address}</code>, {how}.
      {resolution.candidate === null ? null : (
        <>
          {" "}
          Candidate (derived, not confirmed, never used to look anything up): <code>{resolution.candidate}</code>.
        </>
      )}
    </p>
  );
}

export function VenueSection({ outcome }: { readonly outcome: VenueReadOk }) {
  const label = `${venueName(outcome.venue)}: ${outcome.bindingLabel}`;
  return (
    <section className="pf-venue" aria-label={label} data-venue={outcome.venue}>
      <h3>
        {venueName(outcome.venue)} <span className="pf-binding">for <UntrustedText value={untrusted(outcome.bindingLabel)} field="generic" /></span>
      </h3>
      {outcome.prov === null ? null : <ProvenanceStrip prov={outcome.prov} />}
      <ResolutionLine outcome={outcome} />
      <p>
        <Badge tone="warn">{SHAPE_LABEL_TEXT}</Badge>{" "}
        <Disclosure summary="What this label means">
          <p>{SHAPE_EXPLANATION}</p>
        </Disclosure>
      </p>
      {outcome.facts.length === 0 ? null : (
        <ul>
          {outcome.facts.map((fact) => (
            <li key={fact.label}>
              {fact.label}: {fact.value === null ? <Missing label="not read" /> : moneyText(fact.value, fact.symbol)}
            </li>
          ))}
        </ul>
      )}
      <DataTable
        caption={`${venueName(outcome.venue)} positions`}
        captionHidden
        columns={columnsFor()}
        rows={outcome.rows}
        rowKey={(row) => row.id}
        empty={<EmptyTile title={`${venueName(outcome.venue)}: no positions found`} heading="h4"><p>The venue answered and lists no positions for this address. That is an answer, not a failure and not a zero balance.</p></EmptyTile>}
      />
      {outcome.rejected > 0 ? <p>{outcome.rejected} rows from the venue did not match the expected shape and were left out.</p> : null}
      {outcome.partial ? <p>The venue has more rows than were read. The list and the totals may be incomplete.</p> : null}
      {outcome.notListed.length > 0 ? <p>Not listed: {[...new Set(outcome.notListed)].join("; ")}.</p> : null}
      {outcome.notes.map((note) => (
        <p key={note} className="pf-note">
          {note}
        </p>
      ))}
    </section>
  );
}

// ---- tiles for everything that is not a table --------------------------------------------------------------------------

const OFF_TEXT = {
  switched_off: "This venue is switched off in settings, so nothing was asked of it.",
  not_available: "This venue is not available in this release.",
  unknown_venue: "This venue is not one the app knows.",
  restricted_off: "",
} as const;

function OutcomeTile({ outcome, onRetry }: { readonly outcome: Exclude<VenueReadOutcome, VenueReadOk>; readonly onRetry: () => void }) {
  const where = <UntrustedText value={untrusted(outcome.bindingLabel)} field="generic" />;
  switch (outcome.kind) {
    case "failed":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="failed">
          <ErrorTile code={outcome.code === "UNKNOWN" ? undefined : outcome.code} venue={outcome.venue} heading="h3" onRetry={onRetry} />
          <p className="pf-note">For {where}. The other venues are not affected.</p>
        </div>
      );
    case "needs_cockpit":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="needs_cockpit">
          <NeedsCockpitTile venue={outcome.venue} what={outcome.what} heading="h3" />
        </div>
      );
    case "not_paired":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="not_paired">
          <Tile tone="warn" title={`${venueName(outcome.venue)}: this page is not paired with your Cockpit`} heading="h3" dataKind="not-paired">
            <p>
              Nothing was read. In the Cockpit build every read goes through your local Cockpit, which needs this page to be paired with it. Open the pairing link your Cockpit printed when it started, then
              refresh.
            </p>
          </Tile>
        </div>
      );
    case "off": {
      const policy = venuePolicy(outcome.venue);
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="off">
          {outcome.reason === "restricted_off" && policy.clause !== null ? (
            <RestrictedTermsTile venue={outcome.venue} clause={policy.clause} heading="h3" />
          ) : (
            <Tile tone="neutral" title={`${venueName(outcome.venue)}: off`} heading="h3" dataKind="off">
              <p>{OFF_TEXT[outcome.reason]}</p>
            </Tile>
          )}
        </div>
      );
    }
    case "unsupported":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="unsupported">
          <Tile tone="info" title={`${venueName(outcome.venue)}: positions not shown`} heading="h3" dataKind="unsupported">
            <p>{outcome.why}</p>
          </Tile>
        </div>
      );
    case "unresolved":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="unresolved">
          <Tile tone="warn" title={`${venueName(outcome.venue)}: wallet not found`} heading="h3" dataKind="unresolved">
            <p>{outcome.why}</p>
          </Tile>
        </div>
      );
  }
}

// ---- the screen ------------------------------------------------------------------------------------------------------------

export function PortfolioView() {
  const state = useBindingsState();
  const portfolio = usePortfolio(state.bindings, state.switches, state.status === "ready");

  if (state.status === "loading") return <p role="status">Loading your saved addresses</p>;

  if (state.bindings.length === 0) {
    return (
      <EmptyTile title="No addresses saved yet" actions={<Link href="/wallet">Add an address</Link>}>
        <p>
          Positions are read by address. Save your PayBox address on the Wallet screen and choose which venues to ask about it. Nothing is asked of any venue until you do.
        </p>
      </EmptyTile>
    );
  }

  const selected = state.bindings.some((binding) => binding.venues.length > 0);
  if (!selected) {
    return (
      <EmptyTile title="No venue selected for any address" actions={<Link href="/wallet">Choose venues</Link>}>
        <p>Your saved addresses are not looked up anywhere yet. Choose the venues to ask about each address on the Wallet screen.</p>
      </EmptyTile>
    );
  }

  const ok = portfolio.outcomes.filter((outcome): outcome is VenueReadOk => outcome.kind === "ok");
  const others = portfolio.outcomes.filter((outcome): outcome is Exclude<VenueReadOutcome, VenueReadOk> => outcome.kind !== "ok");
  const rows = ok.flatMap((outcome) => outcome.rows);

  return (
    <div className="ui-stack pf-root">
      <p>
        Positions are looked up by address at the venues you selected for each address. Each venue is asked on its own: if one does not answer, the others still show.{" "}
        <Link href="/wallet">Change addresses and venues</Link>
      </p>
      <div>
        <Button onClick={portfolio.refresh} busy={portfolio.fetching}>
          Refresh
        </Button>
      </div>
      {portfolio.status === "loading" ? <p role="status">Reading positions</p> : null}
      {portfolio.status === "error" ? <ErrorTile code="UNKNOWN" title="The positions could not be read" message="Nothing was read. Try again." onRetry={portfolio.refresh} /> : null}
      {portfolio.status === "ready" ? <TotalsPanel rows={rows} /> : null}
      {portfolio.status === "ready" ? <h2>Positions by venue</h2> : null}
      {ok.map((outcome) => (
        <VenueSection key={`${outcome.venue}:${outcome.bindingId}:${outcome.holder}`} outcome={outcome} />
      ))}
      {others.map((outcome) => (
        <OutcomeTile key={`${outcome.kind}:${outcome.venue}:${outcome.bindingId}`} outcome={outcome} onRetry={portfolio.refresh} />
      ))}
    </div>
  );
}
