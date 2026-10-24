// The XO venue of the direct-execution layer (features/trade/direct): XO trading for the trading account, through the
// markets API's relay (core/markets-api.ts MARKETS_API_ORIGIN; api/xo-relay.ts on the server). venue.ts is what the
// rest of the page uses: the XO activation (account setup and sign-in), K(E)'s balance and the order calls of the one
// ticket. trader.ts and setup.ts are the flows underneath, without React.

export { createXoVenue, fromAction, XO_NOT_AVAILABLE, XO_STEP_SETUP, XO_STEP_ENABLE, XO_STEP_SIGN_IN, type XoVenue, type XoVenueOptions } from "./venue";
export { XoTrader, chainSupport, PAYBOX_CHAIN_WORDS, type ActionResult, type VenueAnswer, type XoTraderOptions } from "./trader";
// The account setup (deploy and enable trading, one user operation the key signs) without React.
export { XoAccountSetup, RAW_SIGNING_WORDS, type AllowanceChoice, type XoSetupOptions } from "./setup";
