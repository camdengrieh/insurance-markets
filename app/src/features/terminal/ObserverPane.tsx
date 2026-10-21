import { ARM_MAX_MINUTES, type InboxState, type Posture } from "@bridge/contract";

import { formatUtc, parseIsoMs } from "../../core/format";
import { untrusted } from "../../core/untrusted";
import { Badge, DataTable, DitherBar, EmptyTile, Missing, Num, Tile, UntrustedText, formatCountdown, useNow, type Column, type Tone } from "../../ui";
import type { ObservedItem, ObserverState } from "./observer";
import type { StreamState } from "./stream";

// The observer pane: a second screen for the user's own agent (dapp-design 5.2). It shows the daemon's posture,
// every prepared item with its state, whoever asked for it, and the latest audit entries. It only displays what
// validated events said. It never signs, rejects or sends: those belong to the signing inbox, and arming is done at
// the Cockpit itself (the pane shows the window it was told about; there is no arm control on the page).

// The ARM bar is drawn against the longest window the daemon can open; the words beside it carry the exact time.
const ARM_SCALE_MS = ARM_MAX_MINUTES * 60_000;

export const OPEN_ITEM_STATES: readonly InboxState[] = ["prepared", "shown"];

export function openItemCount(items: readonly { readonly state: InboxState }[]): number {
  return items.filter((item) => OPEN_ITEM_STATES.includes(item.state)).length;
}

const CONNECTION_TEXT: Readonly<Record<ObserverState["connection"], { readonly text: string; readonly tone: Tone }>> = {
  idle: { text: "not connected", tone: "neutral" },
  connecting: { text: "connecting", tone: "info" },
  live: { text: "live", tone: "ok" },
  reconnecting: { text: "reconnecting: what you see may be out of date", tone: "warn" },
  resyncing: { text: "reading the inbox again", tone: "info" },
  unauthorized: { text: "the session is no longer valid: the feed stopped", tone: "danger" },
  stopped: { text: "stopped", tone: "neutral" },
};

const STATE_TEXT: Readonly<Record<InboxState, { readonly text: string; readonly tone: Tone }>> = {
  prepared: { text: "prepared, not yet shown", tone: "info" },
  shown: { text: "shown on a card", tone: "info" },
  signed: { text: "signed", tone: "warn" },
  submitted: { text: "submitted", tone: "warn" },
  accepted: { text: "accepted", tone: "ok" },
  rejected: { text: "rejected", tone: "neutral" },
  expired: { text: "expired", tone: "neutral" },
  ambiguous: { text: "ambiguous: do not resend", tone: "danger" },
};

const KIND_TEXT: Readonly<Record<string, string>> = { userop: "user operation", order: "order", auth: "login", create: "market creation" };

export const POSTURE_TONE: Readonly<Record<string, Tone>> = { OBSERVE: "info", PREPARE: "info", ARMED: "warn", KILLED: "danger" };

// The daemon's posture enum in sentence case: nothing on screen is set in upper case. A value outside the enum (a
// newer daemon) is said to be one, never printed raw.
export const POSTURE_WORD: Readonly<Record<Posture, string>> = { OBSERVE: "observe", PREPARE: "read and prepare", ARMED: "armed", KILLED: "killed" };

export function postureWord(posture: string): string {
  return Object.hasOwn(POSTURE_WORD, posture) ? POSTURE_WORD[posture as Posture] : "a posture this page has no word for";
}

function requesterText(requestedBy: string): string {
  if (requestedBy === "ui") return "this page";
  if (requestedBy === "terminal") return "the terminal";
  return `agent token ${requestedBy.slice("agent:".length)}`;
}

function when(iso: string): string {
  const ms = parseIsoMs(iso);
  return ms === null ? "n/a" : formatUtc(ms, true);
}

export function ObserverPane({ state, connection }: { readonly state: ObserverState; readonly connection?: StreamState | "idle" }) {
  const armed = state.posture === "ARMED" && state.armedUntil !== null;
  const now = useNow(armed ? 1000 : 30_000);
  const link = CONNECTION_TEXT[connection ?? state.connection];
  const armedMs = state.armedUntil === null ? null : parseIsoMs(state.armedUntil);
  const armLeftMs = armed && armedMs !== null ? Math.max(0, armedMs - now) : null;

  const columns: readonly Column<ObservedItem>[] = [
    { key: "id", header: "Item", rowHeader: true, render: (row) => <code>{row.preparedId.slice(0, 8)}</code> },
    { key: "kind", header: "Kind", render: (row) => KIND_TEXT[row.kind] ?? "other" },
    { key: "by", header: "Requested by", render: (row) => requesterText(row.requestedBy) },
    {
      key: "state",
      header: "State",
      render: (row) => (
        <>
          <Badge tone={STATE_TEXT[row.state].tone}>{STATE_TEXT[row.state].text}</Badge>
          {row.jumps > 0 ? <span className="terminal-muted">{" some earlier steps were missed"}</span> : null}
        </>
      ),
    },
    { key: "expires", header: "Expires (UTC)", render: (row) => <Num>{when(row.expiresAt)}</Num> },
  ];

  return (
    <section className="terminal-observer" aria-labelledby="terminal-observer-title">
      <h2 id="terminal-observer-title">Observer</h2>
      <p>
        What the daemon is doing, whoever asked: your agent&apos;s prepared items and the audit feed. This pane only shows. To review or reject an item, use the signing screen.
      </p>
      <dl className="terminal-facts">
        <div className="terminal-pair">
          <dt>Feed</dt>
          <dd>
            <Badge tone={link.tone}>{link.text}</Badge>
          </dd>
        </div>
        <div className="terminal-pair">
          <dt>Posture</dt>
          <dd>
            {state.posture === null ? (
              <Missing label="not known yet" />
            ) : (
              <Badge tone={POSTURE_TONE[state.posture] ?? "neutral"}>{postureWord(state.posture)}</Badge>
            )}
            {armLeftMs !== null ? (
              <span>
                {" "}
                <Num>{formatCountdown(armLeftMs)}</Num> left
              </span>
            ) : null}
          </dd>
        </div>
        <div className="terminal-pair">
          <dt>ARM window</dt>
          <dd>
            {armLeftMs === null ? (
              <span>none open: arming is done at your Cockpit, never from this page</span>
            ) : (
              <span className="terminal-arm">
                <Num>{formatCountdown(armLeftMs)}</Num>
                <DitherBar value={armLeftMs / ARM_SCALE_MS} tone="yes" />
              </span>
            )}
          </dd>
        </div>
        <div className="terminal-pair">
          <dt>Inbox</dt>
          <dd>
            {state.inboxLoaded ? (
              <>
                <Num>{String(openItemCount(state.items))}</Num> open
              </>
            ) : (
              <Missing label="not read yet" />
            )}
          </dd>
        </div>
        <div className="terminal-pair">
          <dt>Audit rows received</dt>
          <dd>
            <Num>{String(state.audit.length)}</Num> since this page connected
          </dd>
        </div>
        <div className="terminal-pair">
          <dt>Kill switch</dt>
          <dd>{state.status === null ? <Missing label="not known yet" /> : state.status.kill ? <Badge tone="danger">on</Badge> : <Badge tone="neutral">off</Badge>}</dd>
        </div>
        <div className="terminal-pair">
          <dt>Audit chain head</dt>
          <dd>{state.status?.audit_head == null ? <Missing label="not known yet" /> : <code>{state.status.audit_head.slice(0, 16)}</code>}</dd>
        </div>
      </dl>
      {state.violations > 0 || state.invalidItems > 0 ? (
        <p className="terminal-warning" role="status">
          {`${String(state.violations)} event(s) and ${String(state.invalidItems)} inbox item(s) did not match the contract and were not shown.`}
        </p>
      ) : null}

      <h3>Prepared items</h3>
      <DataTable
        caption="Prepared items held by the daemon"
        captionHidden
        columns={columns}
        rows={state.items}
        rowKey={(row) => row.preparedId}
        empty={
          <EmptyTile title="No prepared items" heading="h4">
            {state.inboxLoaded
              ? "The daemon holds none. With every write flag off, nothing is ever prepared."
              : "The inbox has not been read yet, so nothing is known about prepared items."}
          </EmptyTile>
        }
      />

      <h3>Recent audit entries</h3>
      {state.audit.length === 0 ? (
        <Tile tone="neutral" title="Nothing received yet" heading="h4" dataKind="empty">
          <p>No audit entry has arrived since this page connected. That does not mean nothing happened before.</p>
        </Tile>
      ) : (
        <ol className="terminal-audit">
          {state.audit
            .slice(-8)
            .reverse()
            .map((row) => (
              <li key={row.seq}>
                <span className="terminal-muted">
                  <Num>{`#${String(row.seq)}`}</Num> <Num>{when(row.at)}</Num>{" "}
                </span>
                <code>{row.type}</code> {row.actor === "system" ? "system" : requesterText(row.actor)}: <UntrustedText value={untrusted(row.summary)} />
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
