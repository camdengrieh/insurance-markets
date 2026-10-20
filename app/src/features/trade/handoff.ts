// What the page tells a person to ask their agent. The page signs nothing and sends nothing: a prepared item is
// signed in PayBox (the human approves there) and submitted by an agent with a submit-scope token while the human
// holds an ARM window open (docs/dapp-design.md 3.3 path S1, 5.4). This file only writes down, as fixed text, the
// calls the agent makes, with the ids the screen already vetted. It builds text; it calls nothing.
//
// The tool names below appear in this file and nowhere else in the feature: hygiene.test.ts scans the rest of the
// source for them, so no other file can turn the page into a sender.

import type { VettedItem } from "./vet";

const PREPARED_ID = /^[0-9a-f]{32}$/;
const ORDER_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const GET_PREPARED_TOOL = "xo_get_prepared";
export const SUBMIT_USEROP_TOOL = "xo_submit_userop";
export const SUBMIT_ORDER_TOOL = "xo_submit_order";
export const CANCEL_ORDER_TOOL = "xo_cancel_order";

function need(pattern: RegExp, value: string, what: string): string {
  if (!pattern.test(value)) throw new Error(`${what} is not in the expected form`);
  return value;
}

// The exact call an agent makes to read the stored item back from the relay instead of trusting this page.
export function getPreparedCall(preparedId: string): string {
  return JSON.stringify({ tool: GET_PREPARED_TOOL, arguments: { prepared_id: need(PREPARED_ID, preparedId, "the prepared id") } }, null, 2);
}

export function submitToolFor(kind: VettedItem["kind"]): typeof SUBMIT_USEROP_TOOL | typeof SUBMIT_ORDER_TOOL {
  return kind === "order" ? SUBMIT_ORDER_TOOL : SUBMIT_USEROP_TOOL;
}

export interface HandoffText {
  readonly request: string;
  readonly steps: readonly string[];
  readonly notes: readonly string[];
}

export function handoffFor(item: VettedItem): HandoffText {
  const id = need(PREPARED_ID, item.preparedId, "the prepared id");
  const inner = item.innerKind === "typed_data_hash" ? "the typed-data hash" : "the call-data hash";
  return {
    request: getPreparedCall(id),
    steps: [
      `Ask your agent to read this item back from the relay with ${GET_PREPARED_TOOL} (the call is above), and to confirm it shows the same owner, account and tags as this page.`,
      `Compare the digest tag ${item.digestTag} and the second tag ${item.innerTag} (${inner}) with what PayBox shows when it asks you to approve. They guard against accidents, not against a hostile agent.`,
      `Approve in PayBox only if it matches. The agent then sends the signature with ${submitToolFor(item.kind)}.`,
      "Sending needs an agent token started with the submit scope and an open ARM window. This page has neither and cannot send.",
    ],
    notes: ["A signature is a bearer instrument for this one item until it expires. A cancel or a reject on a screen does not invalidate it on chain."],
  };
}

// The call an agent makes to cancel an open order. Cancelling asks XO to drop the order; it does not invalidate the
// signed order on chain, which stays valid until its expiry (revoking trading is the on-chain stop).
export function cancelCall(owner: string, orderHash: string): string {
  return JSON.stringify({ tool: CANCEL_ORDER_TOOL, arguments: { owner: need(ADDRESS, owner, "the owner"), order_hash: need(ORDER_HASH, orderHash, "the order hash") } }, null, 2);
}
