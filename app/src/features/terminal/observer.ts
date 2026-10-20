// What the observer pane knows: the daemon's posture, the latest status, the audit feed and every prepared item
// with its state, whoever asked for it (dapp-design 5.2 "Observer pane").
//
// A pure reducer over validated events, so the rules are testable without a page:
//   - nothing here is invented; a field is taken from the latest validated event or it stays unknown;
//   - items are keyed by prepared_id and only their state, requester and clock fields are kept. The prepared
//     payload (summary lines, digests) belongs to the Signature Card; this pane does not render it;
//   - the audit list is bounded, and an entry already seen (same seq) is not added twice;
//   - a state the contract does not allow as a move is still shown (the daemon's record wins), but is counted as a
//     "jump" so the pane can say the history is incomplete instead of looking tidy.

import { canTransition, type InboxItem, type InboxState, type Posture, type StatusResponse, type UiEvent } from "@bridge/contract";

import type { StreamState } from "./stream";

export const MAX_AUDIT_ENTRIES = 200;
export const MAX_ITEMS = 200;

export interface ObservedItem {
  readonly preparedId: string;
  readonly state: InboxState;
  // "ui", "terminal" or "agent:<8 hex>": a closed shape from the contract.
  readonly requestedBy: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
  // State changes that the contract's state machine does not list as a single move (a missed event).
  readonly jumps: number;
}

export interface AuditRow {
  readonly seq: number;
  readonly at: string;
  readonly type: string;
  readonly actor: string;
  // Fixed daemon wording (bridge/contract.ts auditFeedEntrySchema). Rendered as plain text.
  readonly summary: string;
}

export interface ObserverState {
  readonly connection: StreamState | "idle";
  readonly posture: Posture | null;
  readonly armedUntil: string | null;
  readonly status: StatusResponse | null;
  readonly items: readonly ObservedItem[];
  readonly audit: readonly AuditRow[];
  // Frames the page refused (they failed the contract) and inbox rows it could not validate.
  readonly violations: number;
  readonly invalidItems: number;
  readonly lastEventId: number | null;
  readonly lastBeatAt: string | null;
  readonly inboxLoaded: boolean;
}

export const INITIAL_OBSERVER: ObserverState = Object.freeze({
  connection: "idle",
  posture: null,
  armedUntil: null,
  status: null,
  items: [],
  audit: [],
  violations: 0,
  invalidItems: 0,
  lastEventId: null,
  lastBeatAt: null,
  inboxLoaded: false,
});

export type ObserverAction =
  | { readonly type: "connection"; readonly state: StreamState }
  | { readonly type: "inbox"; readonly items: readonly InboxItem[]; readonly invalid: number; readonly eventId: number }
  | { readonly type: "event"; readonly event: UiEvent }
  | { readonly type: "violation" }
  | { readonly type: "reset" };

function observedOf(item: InboxItem, jumps = 0): ObservedItem {
  return {
    preparedId: item.prepared_id,
    state: item.state,
    requestedBy: item.requested_by,
    kind: item.prepared.kind,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    expiresAt: item.expires_at,
    jumps,
  };
}

// Newest first, bounded. Items the daemon has finished with fall off the end first.
function bounded(items: readonly ObservedItem[]): readonly ObservedItem[] {
  return [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.preparedId < b.preparedId ? -1 : 1)).slice(0, MAX_ITEMS);
}

function withItem(items: readonly ObservedItem[], next: ObservedItem): readonly ObservedItem[] {
  return bounded([...items.filter((item) => item.preparedId !== next.preparedId), next]);
}

export function observerReducer(state: ObserverState, action: ObserverAction): ObserverState {
  switch (action.type) {
    case "reset":
      return INITIAL_OBSERVER;
    case "connection":
      return { ...state, connection: action.state };
    case "violation":
      return { ...state, violations: state.violations + 1 };
    case "inbox":
      return {
        ...state,
        items: bounded(action.items.map((item) => observedOf(item))),
        invalidItems: action.invalid,
        lastEventId: action.eventId,
        inboxLoaded: true,
      };
    case "event": {
      const event = action.event;
      const lastEventId = state.lastEventId === null || event.id > state.lastEventId ? event.id : state.lastEventId;
      switch (event.type) {
        case "status":
          return { ...state, lastEventId, status: event.status, posture: event.status.posture, armedUntil: event.status.armed_until };
        case "posture":
          return { ...state, lastEventId, posture: event.posture, armedUntil: event.armed_until };
        case "heartbeat":
          return { ...state, lastEventId, lastBeatAt: event.at };
        case "audit": {
          if (state.audit.some((row) => row.seq === event.entry.seq)) return { ...state, lastEventId };
          const row: AuditRow = { seq: event.entry.seq, at: event.entry.at, type: event.entry.type, actor: event.entry.actor, summary: event.entry.summary };
          return { ...state, lastEventId, audit: [...state.audit, row].sort((a, b) => a.seq - b.seq).slice(-MAX_AUDIT_ENTRIES) };
        }
        case "prepared": {
          const existing = state.items.find((item) => item.preparedId === event.item.prepared_id);
          const jumps = existing !== undefined && existing.state !== event.item.state && !canTransition(existing.state, event.item.state) ? existing.jumps + 1 : (existing?.jumps ?? 0);
          return { ...state, lastEventId, items: withItem(state.items, observedOf(event.item, jumps)) };
        }
        case "prepared_state": {
          const existing = state.items.find((item) => item.preparedId === event.prepared_id);
          // A state change for an item the page never saw cannot be shown honestly: it has no requester or kind.
          // The next inbox read brings the item in.
          if (existing === undefined) return { ...state, lastEventId };
          const jumped = existing.state !== event.state && !canTransition(existing.state, event.state);
          return {
            ...state,
            lastEventId,
            items: withItem(state.items, { ...existing, state: event.state, updatedAt: event.at, jumps: existing.jumps + (jumped ? 1 : 0) }),
          };
        }
      }
    }
  }
}
