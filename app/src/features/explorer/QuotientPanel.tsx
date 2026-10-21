// Quotient on the Markets surface (docs/dapp-design.md 4.7, M3). Two shapes:
//
//   QuotientLine   the inspector's one line, by coverage state: "off, licence first" (with the way to the settings),
//                  "not covered: via link only" (XO, Trueo and every other venue Quotient does not cover), or
//                  "covered" with the way to the market modal;
//   QuotientPanel  the modal's panel: the same state, and for a covered market with a known Quotient market key a
//                  paid lookup that runs ONLY from the press of the button that shows its price (M3-5). Its rows
//                  render through the Signals feature's RowCard, which carries every disclosure of 4.7 with the
//                  number (M3-7), the link overlay and the provenance; a 402 is "payment required" and the page
//                  never pays (M3-1). The "why this is not arbitrage" line is always present (M3-10).
//
// The join is by Quotient's marketKey, never by question text: this build knows the key only for Polymarket
// (`polymarket:<gamma id>`), so every other covered venue says "no join key" instead of guessing one. A row that
// Quotient returns about another market is counted and not shown.

import { useCallback, useState, useSyncExternalStore } from "react";

import type { MarketRef, VenueId } from "../../core/ports";
import { Badge, Button, Num, Tile, useNow, venueName } from "../../ui";
import { MARKET_KEY, ROUTES, WHY_NOT_ARBITRAGE, approvalFor, qNumber, type QuotientResult, type QuotientRow, type RowSet } from "../../venues/quotient";
import { ResultNotice, RowCard, pointsText, probabilityText, useSignalsServices, usdLabel, type LinkLoad, type SessionSnapshot } from "../signals";
import { quotientCovers } from "./views";

export type QuotientState = "loading" | "off" | "on";

export function quotientStateOf(snapshot: Pick<SessionSnapshot, "loaded" | "enabled">): QuotientState {
  if (!snapshot.loaded) return "loading";
  return snapshot.enabled ? "on" : "off";
}

// Quotient's marketKey for a market this build can join, or null. Polymarket's key is its Gamma id, which the
// reader keeps in `native.gammaId`; no other venue's key format is pinned by a recorded answer, so none is built.
export function quotientKeyFor(ref: Pick<MarketRef, "venue" | "native">): string | null {
  if (ref.venue === "polymarket") {
    const gammaId = ref.native["gammaId"];
    if (typeof gammaId === "string" && /^[0-9]{1,30}$/.test(gammaId)) {
      const key = `polymarket:${gammaId}`;
      return MARKET_KEY.test(key) ? key : null;
    }
  }
  return null;
}

export function useQuotientSnapshot(): SessionSnapshot {
  const { session } = useSignalsServices();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

export const QUOTIENT_OFF_TEXT = "Quotient is off: the licence clause comes first. Nothing has been requested from it.";
export const QUOTIENT_NOT_COVERED_TEXT = "Quotient does not cover this venue. A Q number reaches this market only through an approved link to a covered twin (shown as via link, with the link's proof and state), and none is approved.";

// ---- the inspector's line ------------------------------------------------------------------------------------------------

export function QuotientLine({ venue, state, onOpenSettings, onOpenMarket }: { readonly venue: VenueId; readonly state: QuotientState; readonly onOpenSettings: () => void; readonly onOpenMarket?: () => void }) {
  if (state === "loading") {
    return (
      <p className="explorer-quotient" data-quotient="loading">
        <Badge tone="neutral">off</Badge> Quotient stays off until your setting has been read.
      </p>
    );
  }
  if (state === "off") {
    return (
      <div className="explorer-quotient" data-quotient="off">
        <p>
          <Badge tone="warn">off</Badge> licence first. {QUOTIENT_OFF_TEXT}
        </p>
        <Button onClick={onOpenSettings}>Quotient settings</Button>
      </div>
    );
  }
  if (!quotientCovers(venue)) {
    return (
      <p className="explorer-quotient" data-quotient="not-covered">
        <Badge tone="neutral">not covered</Badge> via link only: {QUOTIENT_NOT_COVERED_TEXT}
      </p>
    );
  }
  return (
    <div className="explorer-quotient" data-quotient="covered">
      <p>
        <Badge tone="ok">covered</Badge> Quotient covers {venueName(venue)}. Open the market to look this one up; nothing is requested until you press that button.
      </p>
      {onOpenMarket === undefined ? null : <Button onClick={onOpenMarket}>Open market</Button>}
    </div>
  );
}

// ---- the modal's panel -------------------------------------------------------------------------------------------------

// The two figure blocks of Market.dc.html, drawn only from a row Quotient really returned about this market and only
// when the row's orientation is proven (qNumber): no block, no figure and no placeholder otherwise. The second block
// is the row's own gap to the quote it carries, named as that and never as an executable edge. The row card below
// carries every disclosure.
export function QuotientFigures({ row }: { readonly row: QuotientRow }) {
  const number = qNumber(row);
  if (!number.shown) return null;
  return (
    <div className="mk-q-figures" data-q-figures="true">
      <div className="mk-q-figure" data-rule="no">
        <p className="mk-q-label">{number.about.outcome === "yes" ? "Model q · Yes" : "Model q · the linked outcome"}</p>
        <p className="mk-q-value">
          <Num>{probabilityText(number.value)}</Num>
        </p>
        <p className="mk-q-sub">a model's estimate, not a price</p>
      </div>
      {row.spread === null ? null : (
        <div className="mk-q-figure" data-rule="ink">
          <p className="mk-q-label">Gap to the quote on the row</p>
          <p className="mk-q-value">
            <Num>{pointsText(row.spread)}</Num>
          </p>
          <p className="mk-q-sub">{row.spreadDirection === "q_higher" ? "the estimate is above the quote" : row.spreadDirection === "q_lower" ? "the estimate is below the quote" : "direction not given"}; not an executable edge, size and fees not applied</p>
        </div>
      )}
    </div>
  );
}

export interface QuotientPanelProps {
  readonly market: MarketRef;
  readonly linkLoad: LinkLoad | null;
  readonly onOpenSettings: () => void;
}

export function QuotientPanel({ market, linkLoad, onOpenSettings }: QuotientPanelProps) {
  const services = useSignalsServices();
  const { session } = services;
  const snapshot = useQuotientSnapshot();
  const state = quotientStateOf(snapshot);
  const nowMs = useNow(15_000);
  const [result, setResult] = useState<QuotientResult<RowSet> | null>(null);
  const [busy, setBusy] = useState(false);
  const key = quotientKeyFor(market);
  const keyed = snapshot.access === "key";
  const price = usdLabel(ROUTES.lookup.priceUsd);

  const lookup = useCallback(async (): Promise<void> => {
    if (key === null) return;
    setBusy(true);
    try {
      setResult(await session.client().lookup({ marketKeys: [key] }, { approval: approvalFor("lookup"), refresh: result !== null }));
    } finally {
      setBusy(false);
      session.touch();
    }
  }, [key, session, result]);

  let body;
  if (state === "loading") {
    body = (
      <Tile tone="neutral" title="Quotient: checking your setting" heading="h4" dataKind="quotient" dataCode="loading">
        <p>Quotient stays off until the setting has been read.</p>
      </Tile>
    );
  } else if (state === "off") {
    body = (
      <Tile tone="warn" title="Quotient is off" heading="h4" dataKind="quotient" dataCode="off" actions={<Button onClick={onOpenSettings}>Quotient settings</Button>}>
        <p>{QUOTIENT_OFF_TEXT} Switch it on in the settings after reading the licence clause; results stay in this tab's memory and are never exported.</p>
      </Tile>
    );
  } else if (!quotientCovers(market.venue)) {
    body = (
      <Tile tone="neutral" title={`Not covered: ${venueName(market.venue)}`} heading="h4" dataKind="quotient" dataCode="not-covered">
        <p>{QUOTIENT_NOT_COVERED_TEXT}</p>
      </Tile>
    );
  } else if (key === null) {
    body = (
      <Tile tone="neutral" title={`No join key for this ${venueName(market.venue)} market`} heading="h4" dataKind="quotient" dataCode="no-key">
        <p>Quotient covers {venueName(market.venue)}, but this build knows no Quotient market key for this market, and a key is never guessed from the title. Nothing was requested.</p>
      </Tile>
    );
  } else {
    const rows = result?.status === "ok" ? result.data.rows : [];
    const about = rows.filter((row) => row.key === key || (row.nativeMarketId !== null && row.nativeMarketId.toLowerCase() === market.marketId.toLowerCase()));
    const elsewhere = rows.length - about.length;
    body = (
      <div data-quotient="covered">
        <p className="explorer-note">
          Joined by Quotient's market key <code className="explorer-id">{key}</code>, never by the question text. {keyed ? "Your key is attached, so a press is charged." : "With no key a paid press only shows the price."}
        </p>
        <p className="explorer-actions">
          <Button variant="primary" busy={busy} disabled={busy} onClick={() => void lookup()} data-press-route="lookup">
            {keyed ? (result === null ? `Look up this market on Quotient: about ${price}` : `Look it up again: a new charge of about ${price}`) : `Ask Quotient about this market (about ${price}, shows the price only)`}
          </Button>
        </p>
        {result === null ? (
          <p className="explorer-note">Nothing has been requested for this market. This is not an empty answer from Quotient.</p>
        ) : result.status !== "ok" ? (
          <ResultNotice result={result} onResetHalt={() => session.client().resetHalt()} />
        ) : (
          <div className="signals-rows" data-results="lookup">
            {about.length === 0 ? <p>Quotient answered and no row is about this market. That is an answer, not a zero.</p> : null}
            {about.map((row) => (
              <div key={row.rowId} className="mk-q-row">
                <QuotientFigures row={row} />
                <RowCard row={row} route="lookup" nowMs={nowMs} allowExperimental={false} linkLoad={linkLoad} readLeg={services.readLeg} clock={services.nowMs} />
              </div>
            ))}
            {elsewhere > 0 ? <p className="explorer-note">{`${elsewhere} row${elsewhere === 1 ? "" : "s"} about other markets came back and ${elsewhere === 1 ? "is" : "are"} not shown.`}</p> : null}
            {result.charged ? <p className="explorer-note">{`This call was charged, about ${price} by the price table.`}</p> : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="explorer-quotient-panel">
      {body}
      <p className="explorer-note">Quotient figures sit beside the venue's prices and are never blended into a score of ours. No order is placed from a Quotient number. Not investment advice.</p>
      <p className="explorer-why" data-why-not-arbitrage="quotient">
        {WHY_NOT_ARBITRAGE}
      </p>
    </div>
  );
}
