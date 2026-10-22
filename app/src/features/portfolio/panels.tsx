// The Holdings view's library (docs/dapp-design.md 4.5 Portfolio; acceptance M2-4 to M2-7): the totals panel, one
// venue's positions table and the tile for every read that returned no table. The Markets surface renders them under
// the table in the Holdings view; there is no Portfolio screen any more. Every rule the old screen held still holds:
// no single blended net worth without the exclusion count, a position with no price is counted and left out (never
// zero), market text only through the untrusted slot, and a venue that could not be read is said in words.

import { venuePolicy } from "../../core/venue-policy";
import { Badge, Button, DataTable, Disclosure, EmptyTile, ErrorTile, Missing, NeedsCockpitTile, Num, ProvenanceStrip, RestrictedTermsTile, Tile, UntrustedText, useOpenConnect, venueName, type Column, type TileHeading, type Tone } from "../../ui";
import { untrusted } from "../../core/untrusted";
import { moneyText, sharesText, signedMoneyText } from "./format";
import { SHAPE_EXPLANATION, SHAPE_LABEL_TEXT } from "./shape";
import { summarize, type SymbolTotal } from "./valuation";
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
      <strong>{total.total === null ? <Missing label="no priced position" /> : <Num>{moneyText(total.total, total.symbol)}</Num>}</strong>
      {total.total === null ? ` ${total.symbol}` : ""} {`from ${total.included} ${noun}`}
      {total.excluded > 0 ? `; ${total.excluded} more ${total.excluded === 1 ? "has" : "have"} no figure and ${total.excluded === 1 ? "is" : "are"} left out` : ""}
    </li>
  );
}

export function TotalsPanel({ rows, heading = "h2" }: { readonly rows: readonly PortfolioRow[]; readonly heading?: TileHeading }) {
  const totals = summarize(rows);
  if (totals.rows === 0) return null;
  const Sub = heading === "h4" ? "h5" : heading === "h3" ? "h4" : "h3";
  return (
    <Tile tone="neutral" title="Totals" role="note" dataKind="totals" heading={heading}>
      <p>
        Every figure is counted in the asset the venue uses, and each asset has its own total. There is no single net-worth figure: a pUSD, USDC, USDC.e and TYD amount are different assets, and a
        position with no price is left out and counted, never counted as zero.
      </p>
      <Sub>Open positions at the best bid</Sub>
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
      <Sub>Settled positions with something to collect</Sub>
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
  if (resolution.wallet !== undefined) {
    return (
      <p data-testid="resolution">
        Asked about <code>{resolution.address}</code>, your {resolution.wallet.kind}: derived from the signer <code>{resolution.wallet.signer}</code> and confirmed on chain.
      </p>
    );
  }
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

export function VenueSection({ outcome, heading = "h3" }: { readonly outcome: VenueReadOk; readonly heading?: "h3" | "h4" }) {
  const label = `${venueName(outcome.venue)}: ${outcome.bindingLabel}`;
  const Heading = heading;
  const tileHeading: TileHeading = heading === "h3" ? "h4" : "h4";
  return (
    <section className="pf-venue" aria-label={label} data-venue={outcome.venue}>
      <Heading>
        {venueName(outcome.venue)}{" "}
        <span className="pf-binding">
          for <UntrustedText value={untrusted(outcome.bindingLabel)} field="generic" />
        </span>
      </Heading>
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
              {fact.label}: {fact.value === null ? <Missing label="not read" /> : <Num>{moneyText(fact.value, fact.symbol)}</Num>}
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
        empty={
          <EmptyTile title={`${venueName(outcome.venue)}: no positions found`} heading={tileHeading}>
            <p>The venue answered and lists no positions for this address. That is an answer, not a failure and not a zero balance.</p>
          </EmptyTile>
        }
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

export function OutcomeTile({ outcome, onRetry, heading = "h3" }: { readonly outcome: Exclude<VenueReadOutcome, VenueReadOk>; readonly onRetry: () => void; readonly heading?: TileHeading }) {
  const where = <UntrustedText value={untrusted(outcome.bindingLabel)} field="generic" />;
  switch (outcome.kind) {
    case "failed":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="failed">
          <ErrorTile code={outcome.code === "UNKNOWN" ? undefined : outcome.code} venue={outcome.venue} heading={heading} onRetry={onRetry} />
          <p className="pf-note">For {where}. The other venues are not affected.</p>
        </div>
      );
    case "needs_cockpit":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="needs_cockpit">
          <NeedsCockpitTile venue={outcome.venue} what={outcome.what} heading={heading} />
        </div>
      );
    case "not_paired":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="not_paired">
          <Tile tone="warn" title={`${venueName(outcome.venue)}: this page is not paired with your Cockpit`} heading={heading} dataKind="not-paired">
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
            <RestrictedTermsTile venue={outcome.venue} clause={policy.clause} heading={heading} />
          ) : (
            <Tile tone="neutral" title={`${venueName(outcome.venue)}: off`} heading={heading} dataKind="off">
              <p>{OFF_TEXT[outcome.reason]}</p>
            </Tile>
          )}
        </div>
      );
    }
    case "unsupported":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="unsupported">
          <Tile tone="info" title={`${venueName(outcome.venue)}: positions not shown`} heading={heading} dataKind="unsupported">
            <p>{outcome.why}</p>
          </Tile>
        </div>
      );
    case "unresolved":
      return (
        <div className="pf-tile" data-venue={outcome.venue} data-outcome="unresolved">
          <Tile tone="warn" title={`${venueName(outcome.venue)}: wallet not found`} heading={heading} dataKind="unresolved">
            <p>{outcome.why}</p>
          </Tile>
        </div>
      );
  }
}

// The empty states of the Holdings view, in words, with the way to the Connect modal: there is no Wallet page, the
// modal's "Just watch an address" tab is where an address is watched and its venues chosen. The button is drawn only
// when a Connect modal is registered on the page (ui/context useOpenConnect); the words name the way regardless.
export function NoAddressWatched({ heading = "h3" }: { readonly heading?: TileHeading }) {
  const openConnect = useOpenConnect();
  return (
    <EmptyTile title="No address watched" heading={heading} actions={openConnect === null ? undefined : <Button onClick={openConnect}>Watch an address</Button>}>
      <p>Positions are read by address. Watch an address from the wallet chip in the top bar (Just watch an address) and choose which venues to ask about it. Nothing is asked of any venue until you do.</p>
    </EmptyTile>
  );
}

export function NoVenueSelected({ heading = "h3" }: { readonly heading?: TileHeading }) {
  const openConnect = useOpenConnect();
  return (
    <EmptyTile title="No venue selected for any address" heading={heading} actions={openConnect === null ? undefined : <Button onClick={openConnect}>Choose venues</Button>}>
      <p>Your watched addresses are not looked up anywhere yet. Choose the venues to ask about each address from the wallet chip in the top bar (Just watch an address).</p>
    </EmptyTile>
  );
}
