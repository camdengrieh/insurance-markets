// What the signing screen knows: the daemon's inbox records (full, so the card can check them), and the posture.
//
// A pure reducer over validated inputs, so the rules are testable without a page:
//   - an item is only ever taken from a validated inbox read or event, or from the daemon's answer to a decision;
//   - the daemon's record wins: a later record replaces the earlier one for the same id, and a state the page
//     only guessed is never kept;
//   - a state change for an item the page never saw cannot be shown honestly (it has no payload), so it is
//     reported through `unknownIds` and the next inbox read brings the item in.

import { INBOX_STATES, type InboxItem, type InboxState, type Posture, type UiEvent } from "@bridge/contract";

import type { StreamState } from "../terminal/stream";

export const MAX_ITEMS = 200;

export interface SigningState {
  readonly connection: StreamState | "idle";
  readonly items: readonly InboxItem[];
  readonly invalid: number;
  readonly violations: number;
  readonly posture: Posture | null;
  readonly armedUntil: string | null;
  readonly kill: boolean;
  readonly instance: "writer" | "read_only" | null;
  readonly lastEventId: number | null;
  readonly loaded: boolean;
  // A state change arrived for an id that is not in `items`: read the inbox again.
  readonly staleRead: boolean;
}

export const INITIAL_SIGNING: SigningState = Object.freeze({
  connection: "idle",
  items: [],
  invalid: 0,
  violations: 0,
  posture: null,
  armedUntil: null,
  kill: false,
  instance: null,
  lastEventId: null,
  loaded: false,
  staleRead: false,
});

export type SigningAction =
  | { readonly type: "connection"; readonly state: StreamState }
  | { readonly type: "inbox"; readonly items: readonly InboxItem[]; readonly invalid: number; readonly eventId: number }
  | { readonly type: "event"; readonly event: UiEvent }
  | { readonly type: "replace"; readonly item: InboxItem }
  | { readonly type: "violation" }
  | { readonly type: "reset" };

const OPEN: readonly InboxState[] = ["prepared", "shown"];

// Open items first (the ones that need a person), then newest change first, then id: a stable order.
export function ordered(items: readonly InboxItem[]): readonly InboxItem[] {
  return [...items]
    .sort((a, b) => {
      const openA = OPEN.includes(a.state) ? 0 : 1;
      const openB = OPEN.includes(b.state) ? 0 : 1;
      if (openA !== openB) return openA - openB;
      if (a.updated_at !== b.updated_at) return a.updated_at < b.updated_at ? 1 : -1;
      return a.prepared_id < b.prepared_id ? -1 : a.prepared_id > b.prepared_id ? 1 : 0;
    })
    .slice(0, MAX_ITEMS);
}

function upsert(items: readonly InboxItem[], next: InboxItem): readonly InboxItem[] {
  return ordered([...items.filter((item) => item.prepared_id !== next.prepared_id), next]);
}

function newer(id: number, current: number | null): number {
  return current === null || id > current ? id : current;
}

export function signingReducer(state: SigningState, action: SigningAction): SigningState {
  switch (action.type) {
    case "reset":
      return INITIAL_SIGNING;
    case "connection":
      return { ...state, connection: action.state };
    case "violation":
      return { ...state, violations: state.violations + 1 };
    case "inbox":
      return { ...state, items: ordered(action.items), invalid: action.invalid, lastEventId: action.eventId, loaded: true, staleRead: false };
    case "replace":
      return { ...state, items: upsert(state.items, action.item) };
    case "event": {
      const event = action.event;
      const lastEventId = newer(event.id, state.lastEventId);
      switch (event.type) {
        case "status":
          return { ...state, lastEventId, posture: event.status.posture, armedUntil: event.status.armed_until, kill: event.status.kill || event.status.posture === "KILLED", instance: event.status.instance };
        case "posture":
          // Kill is one-way: a later posture never clears it.
          return { ...state, lastEventId, posture: event.posture, armedUntil: event.armed_until, kill: state.kill || event.posture === "KILLED" };
        case "heartbeat":
          return { ...state, lastEventId };
        case "audit":
          return { ...state, lastEventId };
        case "prepared":
          return { ...state, lastEventId, items: upsert(state.items, event.item) };
        case "prepared_state": {
          const existing = state.items.find((item) => item.prepared_id === event.prepared_id);
          if (existing === undefined) return { ...state, lastEventId, staleRead: true };
          if (!INBOX_STATES.includes(event.state)) return { ...state, lastEventId };
          return { ...state, lastEventId, items: upsert(state.items, { ...existing, state: event.state, result: event.result, updated_at: event.at }) };
        }
      }
    }
  }
}
