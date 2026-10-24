// Everything the trading account needs from the three venues, built once from the page's ports: each venue's activation
// (docs/unified-account-design.md section 3.1), its balance source, the one ticket's route and the Polymarket funding
// helper. The account feature takes the activations and balance sources from here (venueActivations,
// venueBalanceSources in services.tsx); the ticket takes the routes. Tests build a kit from fakes.

import type { AdapterDeps } from "../../../core/ports";
import type { VenueActivation } from "../../account/activation";
import type { BalanceSource } from "../../account/balances";
import type { TradingAccount } from "../../account/types";
import { limitlessActivation } from "./limitless/activation";
import { createLimitlessExecutor } from "./limitless/executor";
import { polymarketActivation, polymarketBalanceSource } from "./polymarket/activation";
import { fundPolymarketFromBase, type PolymarketFunding } from "./polymarket/bridge";
import { createPolymarketExecutor } from "./polymarket/executor";
import { createPolymarketRelayerClient } from "./polymarket/relayer";
import { limitlessRoute, polymarketRoute, xoRoute, type TicketRoute, type TradeVenue } from "./routes";
import type { DirectDeps, DirectResult } from "./types";
import { XoCredentialStore, type CredentialStorage } from "./xo/credentials";
import { XoRelayClient, type RelayFetch } from "./xo/relay";
import { createXoVenue, type XoVenueOptions } from "./xo/venue";

export interface VenueKitOptions {
  readonly direct: DirectDeps;
  // XO's chain reads go through the page's guarded fetch.
  readonly adapter: AdapterDeps;
  // Our markets API (core/markets-api.ts); null: every venue says it is not available and nothing is requested.
  readonly relayOrigin: string | null;
  // The XO relay client's fetch and the tab storage its credential lives in.
  readonly xoFetch: RelayFetch;
  readonly xoStorage: CredentialStorage | null;
  // Polling of relayer transactions and of XO's bundler (tests shorten them).
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
  readonly xo?: Pick<XoVenueOptions, "readReadiness" | "chainCall">;
}

export interface VenueKit {
  readonly activations: readonly VenueActivation[];
  readonly balances: readonly BalanceSource[];
  route(venue: TradeVenue): TicketRoute;
  activation(venue: TradeVenue): VenueActivation;
  // Moves USDC from the trading account on Base to the Polymarket wallet, through Polymarket's bridge.
  fundPolymarket(acct: TradingAccount, amountAtomic: bigint): Promise<DirectResult<PolymarketFunding>>;
}

export function createVenueKit(options: VenueKitOptions): VenueKit {
  const { direct, relayOrigin } = options;
  const polls = { ...(options.sleep === undefined ? {} : { sleep: options.sleep }), ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }), ...(options.maxPolls === undefined ? {} : { maxPolls: options.maxPolls }) };
  const polymarket = createPolymarketExecutor(direct);
  const limitless = createLimitlessExecutor(direct, relayOrigin);
  const relayer = relayOrigin === null ? null : createPolymarketRelayerClient(direct.http, relayOrigin);
  const xo = createXoVenue({
    relay: relayOrigin === null ? null : new XoRelayClient(relayOrigin, options.xoFetch),
    store: new XoCredentialStore(options.xoStorage),
    adapter: options.adapter,
    random: direct.randomBytes,
    ...(options.xo ?? {}),
    ...polls,
  });
  const activations: Readonly<Record<TradeVenue, VenueActivation>> = {
    xo: xo.activation,
    polymarket: polymarketActivation({ deps: direct, executor: polymarket, relayer, ...polls }),
    limitless: limitlessActivation(limitless),
  };
  const routes: Readonly<Record<TradeVenue, TicketRoute>> = {
    xo: xoRoute(xo),
    polymarket: polymarketRoute(direct, polymarket),
    limitless: limitlessRoute(limitless),
  };
  return {
    // The order activation runs them in: XO, then Polymarket, then Limitless.
    activations: [activations.xo, activations.polymarket, activations.limitless],
    // Limitless keeps no balance of its own beyond the key's USDC on Base, which the account counts itself; its open
    // positions are not readable through our relay, so it has no source here.
    balances: [polymarketBalanceSource(direct), xo.balance],
    route: (venue) => routes[venue],
    activation: (venue) => activations[venue],
    fundPolymarket: (acct, amountAtomic) => fundPolymarketFromBase(direct, relayer, acct, amountAtomic),
  };
}
