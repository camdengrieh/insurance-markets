// The XO venue of the direct-execution layer (features/trade/direct): XO trading with the visitor's own wallet, through
// the markets API's relay (core/markets-api.ts MARKETS_API_ORIGIN; api/xo-relay.ts on the server).
//
// The registry gets one object: `xoDirectExecutor()`. Its `availability` answers, without any request, whether this
// build and this wallet session can trade on XO at all (and why not, in words); `Panel` is the whole XO surface
// (readiness, login, ticket for one outcome, open orders and cancel, the Signature Card, XO's answers); `createTrader`
// is the same flow without React, for a caller that renders its own.

import type { WalletSigner } from "../../../../core/signer";
import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import { chainSupport, XoTrader, type XoTraderOptions } from "./trader";
import { NOT_AVAILABLE_TEXT, XoTradePanel, type XoTradePanelProps } from "./XoTradePanel";

export type XoAvailability = { readonly available: true } | { readonly available: false; readonly reason: string };

export interface XoDirectExecutor {
  readonly venue: "xo";
  readonly label: "XO";
  // The chain every XO signature's domain names; the wallet is switched to it before it signs.
  readonly chainId: 3223;
  availability(signer: WalletSigner | null, relayOrigin?: string | null): XoAvailability;
  readonly Panel: (props: XoTradePanelProps) => ReturnType<typeof XoTradePanel>;
  createTrader(options: XoTraderOptions): XoTrader;
}

export function xoAvailability(signer: WalletSigner | null, relayOrigin: string | null = MARKETS_API_ORIGIN): XoAvailability {
  if (relayOrigin === null) return { available: false, reason: NOT_AVAILABLE_TEXT };
  if (signer === null) return { available: false, reason: "Connect a wallet to trade on XO." };
  const support = chainSupport(signer);
  return support.ok ? { available: true } : { available: false, reason: support.words };
}

export function xoDirectExecutor(): XoDirectExecutor {
  return {
    venue: "xo",
    label: "XO",
    chainId: 3223,
    availability: xoAvailability,
    Panel: XoTradePanel,
    createTrader: (options) => new XoTrader(options),
  };
}

export { XoTradePanel, NOT_AVAILABLE_TEXT, type XoTradePanelProps };
export { XoTrader, chainSupport, PAYBOX_CHAIN_WORDS, type ActionResult, type VenueAnswer, type XoTraderOptions } from "./trader";
