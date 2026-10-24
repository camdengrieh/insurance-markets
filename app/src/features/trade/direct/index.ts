// The direct path: the trading account (docs/unified-account-design.md) trades on XO, Polymarket and Limitless from the
// standalone build. The trading key E signs in the visitor's browser; each venue is reached from the browser itself
// (Polymarket's order book) or through our markets API's relays (XO's order book and bundler, Limitless's partner
// relay, Polymarket's relayer and bridge), which add our operator credentials and never see a key.
//
// What the rest of the page uses:
//   TradeTicket            the one ticket for every tradable market (outcome, side, amount and price, order type, a
//                          summary, Place order, the open orders with a cancel each);
//   venueActivations       each venue's activation, for the trading account's "Activate trading";
//   venueBalanceSources    what each venue holds for the account, for the one balance.
// The executors (polymarket/, limitless/, xo/) keep the interface in types.ts and receive the account's signer as
// their wallet.

export { TradeTicket, type TradeTicketProps } from "./TradeTicket";
export { registerVenues, venueActivations, venueBalanceSources, VenueKitProvider, useVenueKit, createBrowserVenueKit } from "./services";
export { createVenueKit, type VenueKit, type VenueKitOptions } from "./kit";
export { TRADE_VENUES, isTradeVenue, VENUE_NAME, type TradeVenue, type TicketMarket, type TicketOutcome } from "./routes";

// Whether the standalone build offers a venue's ticket to the trading account.
export function tradesDirectly(venue: string): boolean {
  return venue === "xo" || venue === "polymarket" || venue === "limitless";
}
