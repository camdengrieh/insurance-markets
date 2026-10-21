// The footer of the market modal (docs/dapp-design.md 4.5: no order-entry control unless the local build is paired
// with the daemon and the matching flag is on; Market.dc.html "ticket or worksheet").
//
//   XO, Cockpit build   the trade desk's order ticket (features/trade), which prepares through the daemon and signs
//                       and sends nothing; the market's own outcome tokens are the choices;
//   XO, standalone      the caution tile: preparing needs the Cockpit;
//   every other venue   a WORKSHEET: it sizes a limit order against the book and the caps with exact arithmetic,
//                       prepares nothing and links nowhere. The venue's own site is named in words with the market's
//                       id; this page opens no outside link.

import { useState } from "react";

import { notional, parseQty, toDec } from "../../core/money";
import type { Market, MarketRef } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { Button, Field, Missing, Num, Tile, UntrustedText, useAppMode, venueName } from "../../ui";
import { usePairing } from "../terminal/usePairing";
import { useTradeServices } from "../trade/services";
import { TradeDesk, type TokenChoice } from "../trade";
import { priceText } from "./display";
import { isSafeMarketId } from "./ids";

export function tokenChoicesOf(market: Market): TokenChoice[] {
  return market.outcomes
    .filter((outcome) => outcome.tokenId !== "")
    .map((outcome) => ({ label: `Outcome ${outcome.index + 1}: ${outcome.role === "yes" ? "Yes" : outcome.role === "no" ? "No" : "labelled by the creator"}`, tokenId: outcome.tokenId }));
}

export const PREPARE_XO_ONLY = "Prepare order: XO only in this build";
export const PREPARE_NEEDS_COCKPIT = "Prepare order: needs the Cockpit";
export const PREPARE_NOT_PAIRED = "Prepare order: not paired with your Cockpit";
export const PREPARE_LABEL = "Prepare order";

// The inspector's "Prepare order" action in the Cockpit build: enabled only for an XO row when the page holds a
// session with the daemon; otherwise disabled with the reason in its label. Rendered only in the Cockpit build, so
// the standalone page never builds a daemon client.
export function PrepareOrderAction({ venue, onPrepare }: { readonly venue: MarketRef["venue"]; readonly onPrepare: () => void }) {
  const mode = useAppMode();
  if (venue !== "xo") {
    return (
      <Button disabled data-prepare="xo-only">
        {PREPARE_XO_ONLY}
      </Button>
    );
  }
  if (mode !== "cockpit") {
    return (
      <Button disabled data-prepare="needs-cockpit">
        {PREPARE_NEEDS_COCKPIT}
      </Button>
    );
  }
  return <PairedPrepareAction onPrepare={onPrepare} />;
}

// The same pairing hook the dock and the trade desk use, so the words agree everywhere: ready once the page holds a
// session (an exchange in flight when this mounts resolves here too), and "not paired" after the daemon refuses it.
function PairedPrepareAction({ onPrepare }: { readonly onPrepare: () => void }) {
  const services = useTradeServices();
  const mode = useAppMode();
  const { pairing } = usePairing(services, mode);
  const paired = pairing.phase === "ready";
  return (
    <Button disabled={!paired} onClick={onPrepare} data-prepare={paired ? "ready" : "not-paired"}>
      {paired ? PREPARE_LABEL : PREPARE_NOT_PAIRED}
    </Button>
  );
}

// ---- the worksheet -------------------------------------------------------------------------------------------------------

const PRICE = /^0\.[0-9]{1,3}$/;
const SHARES = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

export function Worksheet({ market }: { readonly market: Market }) {
  const [price, setPrice] = useState("");
  const [shares, setShares] = useState("");
  const name = venueName(market.ref.venue);
  const priceQty = PRICE.test(price) ? parseQty("price", price) : null;
  const sharesQty = SHARES.test(shares) ? parseQty("shares", shares) : null;
  const cost = priceQty === null || sharesQty === null ? null : notional(sharesQty, priceQty, "usd");
  return (
    <div className="explorer-worksheet" data-ticket="worksheet">
      <p>
        This build prepares orders on XO only. For a {name} market the ticket is a worksheet: it sizes a limit order against the book and prepares nothing. To trade on {name}, open the venue's own site and find this market by its
        id {isSafeMarketId(market.ref.marketId) ? <code className="explorer-id">{market.ref.marketId}</code> : <Missing label="id not shown: outside the safe alphabet" />}; this page opens no outside link.
      </p>
      <div className="explorer-worksheet-grid">
        <Field label="Limit price per share (0.001 to 0.999)">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={price} onChange={(event) => setPrice(event.currentTarget.value.trim())} />}</Field>
        <Field label="Size in shares">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={shares} onChange={(event) => setShares(event.currentTarget.value.trim())} />}</Field>
      </div>
      <dl className="explorer-facts">
        <div>
          <dt>Price</dt>
          <dd>{priceQty === null ? "not a price in range" : <Num>{priceText(price) ?? price}</Num>}</dd>
        </div>
        <div>
          <dt>Cost at this price, no fee applied</dt>
          <dd>
            {cost === null ? (
              "enter a price and a size"
            ) : (
              <>
                <Num>{toDec(cost)}</Num> <UntrustedText value={untrusted(market.collateral.symbol)} field="tag" /> at a face value of 1.00 per share
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Fees</dt>
          <dd>{`${name}'s fee is not applied here; see the Fees section above.`}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---- the footer ----------------------------------------------------------------------------------------------------------

export function Ticket({ market }: { readonly market: Market }) {
  const mode = useAppMode();
  if (market.ref.venue !== "xo") return <Worksheet market={market} />;
  if (mode !== "cockpit") {
    return (
      <Tile tone="info" title="Prepare order: needs the Cockpit" heading="h4" dataKind="ticket" dataCode="needs-cockpit">
        <p>An XO order is prepared through the local Cockpit only, and signed in PayBox. This page prepares nothing on its own and never signs or sends.</p>
      </Tile>
    );
  }
  return (
    <div data-ticket="xo">
      <TradeDesk panels="order" tokenChoices={tokenChoicesOf(market)} heading="h4" />
    </div>
  );
}
