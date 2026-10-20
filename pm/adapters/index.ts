// pm/adapters: venue read adapters behind the common port (pm/types.ts VenueReadAdapter).
//
//   createAdapters(config)  one object per venue: XO and Polymarket live, Kalshi disabled unless
//                           the caller enables it AND acknowledges the current terms clause.
//
// Transport (fetch, clock, sleep) is injected; the host list of each adapter is fixed. Nothing in
// this folder can POST, sign, write a file or reach a host outside its allowlist.

import { XoClient } from "../../src/xo/client.js";
import { createDisabledAdapter } from "./disabled.js";
import { createKalshiAdapter, evaluateKalshiGate, type KalshiAdapterOptions, type KalshiGate, type KalshiGateStatus } from "./kalshi.js";
import { createPolymarketAdapter, type PolymarketAdapterOptions } from "./polymarket.js";
import { adapterDescriptor } from "./policy.js";
import type { TransportOptions } from "./transport.js";
import type { AdapterDescriptor, PmVenueAdapter } from "./types.js";
import { createXoAdapter, type XoAdapterOptions } from "./xo.js";

export * from "./errors.js";
export * from "./types.js";
export * from "./policy.js";
export { createDisabledAdapter } from "./disabled.js";
export { createXoAdapter, xoStatusOf, type XoAdapterOptions } from "./xo.js";
export { createPolymarketAdapter, parseBook as parsePolymarketBook, polymarketStatus, type PolymarketAdapterOptions } from "./polymarket.js";
export {
  createKalshiAdapter,
  evaluateKalshiGate,
  feeChangesVerdict,
  kalshiStatus,
  parseBatchBooks,
  KalshiDisabledError,
  type KalshiAdapterOptions,
  type KalshiGate,
  type KalshiGateStatus,
} from "./kalshi.js";
export { createJsonTransport, buildUrl, PLUGIN_USER_AGENT, RESEARCH_USER_AGENT, type JsonTransport, type TransportOptions } from "./transport.js";

export interface AdaptersConfig {
  readonly nowMs?: () => number;
  // Shared transport options (fetchImpl, clock, sleep, userAgent). allowedHosts is ignored.
  readonly http?: TransportOptions;
  // Kalshi stays off unless enabled with the acknowledgement.
  readonly kalshi?: KalshiGate;
  readonly kalshiOptions?: Omit<KalshiAdapterOptions, "http" | "nowMs">;
  // Optional prepared XO client, for sharing with the xo_* read tools.
  readonly xoClient?: XoClient;
}

export interface AdapterSet {
  readonly xo: PmVenueAdapter;
  readonly polymarket: PmVenueAdapter;
  readonly kalshi: PmVenueAdapter;
  readonly kalshiStatus: KalshiGateStatus;
  // Shown to the user when a restricted adapter is off or being switched on.
  readonly kalshiDisclosure: string | null;
  readonly descriptors: readonly AdapterDescriptor[];
}

export function createAdapters(config: AdaptersConfig = {}): AdapterSet {
  const nowMs = config.nowMs ?? Date.now;
  const http = config.http;
  const xoOptions: XoAdapterOptions = {
    nowMs,
    ...(config.xoClient === undefined ? {} : { client: config.xoClient }),
    ...(http === undefined ? {} : { http }),
  };
  const polyOptions: PolymarketAdapterOptions = { nowMs, ...(http === undefined ? {} : { http }) };
  const xo = createXoAdapter(xoOptions);
  const polymarket = createPolymarketAdapter(polyOptions);

  const status = evaluateKalshiGate(config.kalshi, nowMs());
  const descriptor = adapterDescriptor("kalshi", nowMs());
  const kalshi =
    status === "enabled"
      ? createKalshiAdapter(config.kalshi, { ...(config.kalshiOptions ?? {}), nowMs, ...(http === undefined ? {} : { http }) })
      : createDisabledAdapter(
          descriptor,
          status === "off"
            ? "Kalshi adapter is OFF by default (restricted data terms)"
            : "Kalshi adapter needs the current terms clause acknowledged before it can be enabled",
        );
  return {
    xo,
    polymarket,
    kalshi,
    kalshiStatus: status,
    kalshiDisclosure: descriptor.disclosure,
    descriptors: [xo.descriptor, polymarket.descriptor, kalshi.descriptor],
  };
}
