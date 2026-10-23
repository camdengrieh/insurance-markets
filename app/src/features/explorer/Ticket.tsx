// The footer of the market modal (docs/dapp-design.md 4.5: no order-entry control unless the local build is paired
// with the daemon and the matching flag is on; Market.dc.html "ticket or worksheet").
//
//   XO, Polymarket, Limitless, Cockpit build   the trade desk's order ticket (features/trade): XO's prepares the Kernel
//                                              order through the daemon; the other two prepare the venue's own EIP-712
//                                              order for the wallet itself. All three sign and send nothing;
//   Polymarket, standalone                     the direct ticket (features/trade/direct): the visitor's own connected
//                                              wallet signs, and the page sends the order to the venue itself;
//   XO and Limitless, standalone               the caution tile: preparing needs the Cockpit;
//   every other venue                          a WORKSHEET: it sizes a limit order against the book and the caps with
//                                              exact arithmetic, prepares nothing and links nowhere. One honest sentence
//                                              says why this build has no path to that venue; the venue's own site is
//                                              named in words with the market's id; this page opens no outside link.

import { useState } from "react";

import { notional, parseQty, toDec } from "../../core/money";
import type { Market, MarketRef, VenueId } from "../../core/ports";
import { untrusted } from "../../core/untrusted";
import { Button, Field, Missing, Num, Tile, UntrustedText, useAppMode, useNow, venueName } from "../../ui";
import { usePairing } from "../terminal/usePairing";
import { useTradeServices } from "../trade/services";
import { TradeDesk, clobMarketFacts, type TokenChoice } from "../trade";
import { XoTradePanel, tradesDirectly } from "../trade/direct";
import { useWalletServices } from "../wallet/services";
import { priceText } from "./display";
import { isSafeMarketId } from "./ids";
import { useExplorerServices } from "./services";
import { VenueStateTile } from "./venue-state";

// Fixed app words only: "Yes", "No" or "Outcome 3", never the creator's label. `short` is what the ticket's side
// toggle shows after the side ("Buy Yes").
export function tokenChoicesOf(market: Market): TokenChoice[] {
  return market.outcomes
    .filter((outcome) => outcome.tokenId !== "")
    .map((outcome) => {
      const short = outcome.role === "yes" ? "Yes" : outcome.role === "no" ? "No" : `Outcome ${outcome.index + 1}`;
      const label = `Outcome ${outcome.index + 1}: ${outcome.role === "yes" ? "Yes" : outcome.role === "no" ? "No" : "labelled by the creator"}`;
      return outcome.role === "yes" || outcome.role === "no" ? { label, tokenId: outcome.tokenId, short, outcome: outcome.role } : { label, tokenId: outcome.tokenId, short };
    });
}

// The venues this build can prepare an order for from the modal.
export const TICKET_VENUES = ["xo", "polymarket", "limitless"] as const satisfies readonly VenueId[];
export type TicketVenue = (typeof TICKET_VENUES)[number];

export function hasTicket(venue: VenueId): venue is TicketVenue {
  return (TICKET_VENUES as readonly string[]).includes(venue);
}

// Why this build has no order path to a venue: one fixed sentence each, no venue text, no link.
export const NO_PATH_REASON: Readonly<Record<Exclude<VenueId, TicketVenue>, string>> = Object.freeze({
  polymarket_us: "Polymarket US is a fiat, KYC venue whose API keys come from its developer portal, not from a wallet signature.",
  kalshi: "Kalshi is a USD account with API-key signing; a wallet cannot trade there, and its developer terms forbid trading for others.",
  trueo: "Trueo orders are built on chain through contracts this build has not integrated.",
  world: "World has no public trading API this build has read.",
  hyperliquid: "Hyperliquid outcomes are HyperCore actions signed with its own scheme, which this build does not implement.",
  pascal: "Pascal orders use its own request-signing keys, which this build does not implement.",
  novig: "Novig has no public order API this build has read.",
  og: "OG has no public order API this build has read.",
  gemini: "Gemini is an exchange account with its own API keys, not a wallet-signed venue.",
  sx: "SX Bet orders use its own signing and market-maker flow, which this build does not implement.",
  udx: "Underdog Exchange has no public order API this build has read.",
  prophetx: "ProphetX is a KYC sportsbook exchange with its own API keys.",
  predictfun: "Predict.fun needs a venue-provisioned account and a JWT flow this build does not implement.",
  opinion: "Opinion needs its own smart-account provisioning this build does not implement.",
  manifold: "Manifold is play money: a signal, never a trade.",
  myriad: "Myriad orders are placed through its own API keys, which this build does not implement.",
});

export const PREPARE_NO_PATH = "Prepare order: no path to this venue in this build";
export const PREPARE_NEEDS_COCKPIT = "Prepare order: needs the Cockpit";
export const PREPARE_NOT_PAIRED = "Prepare order: not paired with your Cockpit";
export const PREPARE_LABEL = "Prepare order";
// The standalone build, for a venue the visitor's own wallet trades directly (features/trade/direct).
export const PREPARE_DIRECT = "Trade with your wallet";

// The inspector's "Prepare order" action: enabled for a row of a venue with a ticket when the page holds a session with
// the daemon, or, in the standalone build, when the venue trades directly with the visitor's own wallet; otherwise
// disabled with the reason in its label. The standalone page never builds a daemon client.
export function PrepareOrderAction({ venue, onPrepare }: { readonly venue: MarketRef["venue"]; readonly onPrepare: () => void }) {
  const mode = useAppMode();
  if (!hasTicket(venue)) {
    return (
      <Button disabled data-prepare="no-path">
        {PREPARE_NO_PATH}
      </Button>
    );
  }
  if (mode !== "cockpit") {
    if (tradesDirectly(venue)) {
      return (
        <Button onClick={onPrepare} data-prepare="direct">
          {PREPARE_DIRECT}
        </Button>
      );
    }
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
  const venue = market.ref.venue;
  const name = venueName(venue);
  const reason = hasTicket(venue) ? "This market's venue has a ticket in the Cockpit build; this worksheet only sizes." : NO_PATH_REASON[venue];
  const priceQty = PRICE.test(price) ? parseQty("price", price) : null;
  const sharesQty = SHARES.test(shares) ? parseQty("shares", shares) : null;
  const cost = priceQty === null || sharesQty === null ? null : notional(sharesQty, priceQty, "usd");
  return (
    <div className="explorer-worksheet" data-ticket="worksheet" data-venue={venue}>
      <p data-no-path="reason">
        This build has no order path to {name}: {reason} The ticket is a worksheet: it sizes a limit order against the book and prepares nothing. To trade on {name}, open the venue&apos;s own site and find this market by its id{" "}
        {isSafeMarketId(market.ref.marketId) ? <code className="explorer-id">{market.ref.marketId}</code> : <Missing label="id not shown: outside the safe alphabet" />}; this page opens no outside link.
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
          <dd>{`${name}'s fee is not applied here; see the fees under the details below.`}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---- the footer ----------------------------------------------------------------------------------------------------------

export function Ticket({ market }: { readonly market: Market }) {
  const mode = useAppMode();
  const services = useExplorerServices();
  const nowMs = useNow(10_000);
  const venue = market.ref.venue;
  if (!hasTicket(venue)) return <Worksheet market={market} />;
  const name = venueName(venue);
  // A venue that cannot be asked now has no book to quote: it drops out of order preparation and says why.
  const readState = services.venueState(venue, nowMs);
  if (readState.kind !== "ok") {
    return <VenueStateTile venue={venue} state={readState} nowMs={nowMs} heading="h4" kept="No order is prepared while this lasts: there is no book to quote." />;
  }
  // A venue with a direct executor trades from the standalone build with the visitor's own wallet (the desk routes it).
  if (mode !== "cockpit" && !tradesDirectly(venue)) {
    return (
      <Tile tone="info" title="Prepare order: needs the Cockpit" heading="h4" dataKind="ticket" dataCode="needs-cockpit">
        <p>
          {venue === "xo" ? "An XO order is prepared through the local Cockpit only, and signed in PayBox." : `A ${name} order is prepared through the local Cockpit only (it reads the market and builds the venue's own order for your wallet), and signed in PayBox.`} This page prepares nothing on its own and
          never signs or sends.
        </p>
      </Tile>
    );
  }
  if (venue === "xo" && mode !== "cockpit") {
    return (
      <div data-ticket="xo">
        <XoWalletTicket market={market} />
      </div>
    );
  }
  if (venue === "xo") {
    return (
      <div data-ticket="xo">
        <TradeDesk panels="order" tokenChoices={tokenChoicesOf(market)} heading="h4" />
      </div>
    );
  }
  const facts = clobMarketFacts(market);
  if (facts === null) {
    return (
      <Tile tone="warn" title={`${name}: the market record does not carry a tick this build can build on`} heading="h4" dataKind="ticket" dataCode="no-tick">
        <p>The order ticket needs the market&apos;s price step as a plain decimal from the venue&apos;s record. Without it nothing is prepared.</p>
      </Tile>
    );
  }
  return (
    <div data-ticket={venue}>
      <TradeDesk panels="order" tokenChoices={tokenChoicesOf(market)} clobMarket={facts} heading="h4" />
    </div>
  );
}

// The standalone build's XO ticket: the visitor's own wallet signs, through the markets API's relay (trade/direct/xo).
// The panel trades one outcome; the visitor picks which.
function XoWalletTicket({ market }: { readonly market: Market }) {
  const { deps } = useWalletServices();
  const choices = tokenChoicesOf(market);
  const [tokenId, setTokenId] = useState<string | null>(choices[0]?.tokenId ?? null);
  const chosen = choices.find((choice) => choice.tokenId === tokenId) ?? null;
  return (
    <div className="ui-stack">
      {choices.length > 1 ? (
        <div className="tr-toggle" role="group" aria-label="Outcome to trade">
          {choices.map((choice) => (
            <button key={choice.tokenId} type="button" className="tr-toggle-button" data-outcome={choice.outcome ?? "label"} aria-pressed={choice.tokenId === tokenId} onClick={() => setTokenId(choice.tokenId)}>
              {choice.short ?? choice.label}
            </button>
          ))}
        </div>
      ) : null}
      <XoTradePanel deps={deps} outcome={chosen === null ? null : { tokenId: chosen.tokenId, label: chosen.label }} />
    </div>
  );
}
