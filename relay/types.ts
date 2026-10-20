import type {
  GetParams,
  GetResponseInput,
  GetRoute,
  PostPath,
  PostRequestParsed,
  PostResponseInput,
} from "../src/relay/contract.js";
import type { Flags } from "../src/relay/flags.js";

// Types shared by the relay's modules (Wave 0, frozen). The contract with the plugin lives in
// src/relay/contract.ts; this file is the relay-side half: what a route handler looks like.

// What the server gives every handler. Owners add their services (store, ledger, upstream, ...)
// by interface merging from their own module, so no stream has to edit this file:
//
//   declare module "./types.js" {
//     interface RelayServices { readonly store: Store }
//   }
//
// The empty interface is intentional: it exists to be merged into.
export interface RelayServices {}

export interface RelayContext {
  // A getter, not a snapshot: the kill switch can be flipped while the relay runs. Read it at the
  // moment of the write, and again at submit (invariant 3).
  readonly flags: () => Flags;
  // Epoch milliseconds from an injectable clock. Handlers never call Date.now() themselves.
  readonly now: () => number;
  readonly requestId: string;
  // Aborted when the caller disconnects or the request budget is spent.
  readonly signal: AbortSignal;
  readonly services: RelayServices;
}

// A handler receives the body already validated by the contract's request schema (defaults
// applied) and returns the body of the response, which the server validates against the
// contract's response schema before sending. To refuse, throw a RelayError from
// src/relay/errors.ts; the server turns it into { error: { code, message } }.
export type PostHandler<P extends PostPath> = (
  body: PostRequestParsed<P>,
  context: RelayContext,
) => Promise<PostResponseInput<P>>;

export type GetHandler<R extends GetRoute> = (
  params: GetParams<R>,
  context: RelayContext,
) => Promise<GetResponseInput<R>>;

// Keys are "POST /v1/order/prepare" or "GET /v1/order/:hash". A table may hold any subset of the
// contract's routes; routes.ts merges the tables and the server answers not_implemented for the
// rest. A handler module exports `routes: RouteTable`.
export type RouteTable = {
  readonly [P in PostPath as `POST ${P}`]?: PostHandler<P>;
} & {
  readonly [R in GetRoute as `GET ${R}`]?: GetHandler<R>;
};
