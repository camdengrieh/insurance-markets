import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import { parseIsoMs } from "../../core/format";
import type { PageSessionState } from "../../session";
import { Num, formatAge, formatCountdown, useAppMode, useNow } from "../../ui";
import { SigningView, isOpenItem, type OpenCardRequest } from "../signing/SigningView";
import { useSigningServices, type SigningServices } from "../signing/services";
import { INITIAL_SIGNING, signingReducer, type SigningAction, type SigningState } from "../signing/store";
import { isDaemonError } from "./client";
import { DockActionsProvider, type DockActions } from "./dock-context";
import { INITIAL_OBSERVER, observerReducer, type ObserverState } from "./observer";
import { ObserverPane, openItemCount, postureWord } from "./ObserverPane";
import { PairingNotice } from "./PairingNotice";
import { PrepareConsole } from "./prepare";
import { useTerminalServices, type TerminalServices } from "./services";
import { runEventStream, type StreamState } from "./stream";
import { TerminalView } from "./TerminalView";
import { usePairing, type Pairing } from "./usePairing";
import "./terminal.css";
import "../signing/signing.css";

// The terminal dock (docs/design/cockpit-v2 Signing and Main): the page's footer strip, and the panel it expands
// into. The strip says, in words and mono numbers, what the daemon is doing: whether this page is paired, the
// agent's feed state and posture, how many prepared items wait for a person, whether an ARM window is open and
// for how long, the caps the relay stated on the newest open item, and when the inbox was last read. The panel
// holds the read terminal (transcript and command line) and the prepare console on the left, the observer pane
// and the signing inbox on the right; the Signature Card opens as a modal over everything.
//
// The one event stream of the page lives here. Nothing else subscribes: the terminal, the observer pane and the
// inbox list receive the dock's state through props. The stream is open only while the dock is expanded AND the
// page is paired, as it was for the Terminal screen (one connection per token, nothing in the background): collapsing
// the dock closes it and resets what it showed, which is why the collapsed strip says "not watching" instead of
// repeating numbers that would go stale. Opening it reads the inbox once and then follows the stream.
//
// The standalone build has no daemon: its strip says so and the dock has no panel. Nothing here signs, sends,
// arms or kills; arming happens at the Cockpit and the page only shows the window it is told about.

export interface DockProps {
  // The page's one session (src/session.ts), started at load. Without it the dock pairs the way the terminal
  // screen did (a test seam; main.tsx always passes it).
  readonly session?: Promise<PageSessionState>;
  readonly services?: TerminalServices;
  readonly signing?: SigningServices;
}

export const STANDALONE_STRIP_TEXT = "Read-only explorer. No daemon, nothing to prepare.";
export const NOT_WATCHING_TEXT = "not watching: open the dock to follow the agent";

const FEED_WORD: Readonly<Record<StreamState | "idle", string>> = {
  idle: "not connected",
  connecting: "connecting",
  live: "live",
  reconnecting: "reconnecting",
  resyncing: "reading the inbox again",
  unauthorized: "feed stopped",
  stopped: "stopped",
};

export function pairingWords(pairing: Pairing): string {
  switch (pairing.phase) {
    case "checking":
      return "checking the session";
    case "ready":
      return pairing.carriedOver ? "paired · read and prepare, never submit · from earlier in this tab" : "paired · read and prepare, never submit";
    case "unpaired":
      return "not paired";
    case "expired":
      return "session expired";
  }
}

interface DockFeed {
  readonly observer: ObserverState;
  readonly inbox: SigningState;
  readonly dispatchInbox: (action: SigningAction) => void;
  readonly lastReadMs: number | null;
}

// One subscription, two reducers: the observer pane's view of the events and the inbox's (full items, so the card
// can check them). The inbox is read once per connection through the signing client, and again when an event
// names an item the page has not seen.
function useDockFeed(terminal: TerminalServices, signing: SigningServices, active: boolean, onUnauthorized: () => void): DockFeed {
  const [observer, dispatchObserver] = useReducer(observerReducer, INITIAL_OBSERVER);
  const [inbox, dispatchInbox] = useReducer(signingReducer, INITIAL_SIGNING);
  const [lastReadMs, setLastReadMs] = useState<number | null>(null);
  const readRef = useRef<(() => Promise<number | null>) | null>(null);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const read = async (): Promise<number | null> => {
      try {
        const snapshot = await signing.client.inbox(controller.signal);
        if (controller.signal.aborted) return null;
        dispatchObserver({ type: "inbox", items: snapshot.items, invalid: snapshot.invalid, eventId: snapshot.eventId });
        dispatchInbox({ type: "inbox", items: snapshot.items, invalid: snapshot.invalid, eventId: snapshot.eventId });
        setLastReadMs(terminal.nowMs());
        return snapshot.eventId;
      } catch (error) {
        if (isDaemonError(error) && error.code === "unauthorized") onUnauthorized();
        return null;
      }
    };
    readRef.current = read;
    void runEventStream(
      terminal.stream,
      {
        onState: (next) => {
          if (controller.signal.aborted) return;
          dispatchObserver({ type: "connection", state: next });
          dispatchInbox({ type: "connection", state: next });
          if (next === "unauthorized") onUnauthorized();
        },
        onEvent: (event) => {
          if (controller.signal.aborted) return;
          dispatchObserver({ type: "event", event });
          dispatchInbox({ type: "event", event });
        },
        onViolation: () => {
          if (controller.signal.aborted) return;
          dispatchObserver({ type: "violation" });
          dispatchInbox({ type: "violation" });
        },
        resync: read,
      },
      controller.signal,
    );
    return () => {
      controller.abort();
      readRef.current = null;
      dispatchObserver({ type: "reset" });
      dispatchInbox({ type: "reset" });
      setLastReadMs(null);
    };
  }, [terminal, signing, active, onUnauthorized]);

  useEffect(() => {
    if (inbox.staleRead) void readRef.current?.();
  }, [inbox.staleRead]);

  const stableDispatch = useCallback((action: SigningAction): void => dispatchInbox(action), []);
  return { observer, inbox, dispatchInbox: stableDispatch, lastReadMs };
}

function Chevron({ open }: { readonly open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" aria-hidden="true" focusable="false">
      {open ? <path d="M5 15l7-7 7 7" /> : <path d="M5 9l7 7 7-7" />}
    </svg>
  );
}

// The facts of the strip while the dock watches the daemon. Every number is the daemon's or the relay's, named
// as such; a value that is not known is said to be not known. "armed: no" is said only when the daemon has stated a
// posture other than armed; an armed posture whose window end is missing or unreadable says so instead of "no".
export function armedWords(posture: ObserverState["posture"], armLeftMs: number | null): ReactNode {
  if (posture === null) return "armed: not known yet";
  if (posture !== "ARMED") return "armed: no";
  if (armLeftMs === null) return "armed: yes · window end not stated";
  return (
    <>
      armed: yes · <Num>{formatCountdown(armLeftMs)}</Num> left
    </>
  );
}

function StripFacts({ feed, nowMs }: { readonly feed: DockFeed; readonly nowMs: number }) {
  const { observer, inbox, lastReadMs } = feed;
  const armedMs = observer.posture === "ARMED" && observer.armedUntil !== null ? parseIsoMs(observer.armedUntil) : null;
  const armLeft = armedMs === null ? null : Math.max(0, armedMs - nowMs);
  const newestOpen = inbox.items.find(isOpenItem) ?? null;
  const killed = observer.posture === "KILLED" || observer.status?.kill === true;
  return (
    <>
      <p className="dock-fact" data-fact="agent">
        agent · {FEED_WORD[observer.connection]} · posture {observer.posture === null ? "not known yet" : postureWord(observer.posture)}
      </p>
      <p className="dock-fact" data-fact="armed">
        {killed ? "killed: one-way, only a restart clears it" : armedWords(observer.posture, armLeft)}
      </p>
      <p className="dock-fact" data-fact="caps">
        {newestOpen === null ? (
          "caps: no open item reports them"
        ) : (
          <>
            caps, as the relay states them: this item counts <Num>{newestOpen.prepared.caps.reserved_usd}</Num> USD · <Num>{newestOpen.prepared.caps.day_remaining_usd}</Num> USD left today
          </>
        )}
      </p>
      <p className="dock-fact" data-fact="read">
        {lastReadMs === null ? "inbox not read yet" : `last read ${formatAge(lastReadMs, nowMs)}`}
      </p>
    </>
  );
}

export function Dock({ session, services: provided, signing: signingProvided }: DockProps) {
  const mode = useAppMode();
  const fallback = useTerminalServices(mode);
  const terminal = provided ?? fallback;
  const signingFallback = useSigningServices();
  const signing = signingProvided ?? signingFallback;
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<OpenCardRequest | null>(null);
  const seq = useRef(0);

  const { pairing, onUnauthorized } = usePairing(terminal, mode, { enabled: mode === "cockpit", ...(session === undefined ? {} : { session }) });
  const ready = pairing.phase === "ready";
  // The stream is open only while the dock is expanded and the page is paired (see the note at the top).
  const feed = useDockFeed(terminal, signing, mode === "cockpit" && open && ready, onUnauthorized);
  const nowMs = useNow(open ? 1000 : 60_000);

  const openCard = useCallback((preparedId: string | null): void => {
    seq.current += 1;
    setOpen(true);
    setRequest({ seq: seq.current, preparedId });
  }, []);
  const actions: DockActions = useMemo(() => ({ openCard }), [openCard]);

  if (mode !== "cockpit") {
    return (
      <div className="ui-container ui-dock-strip" data-dock="standalone">
        <p>{STANDALONE_STRIP_TEXT}</p>
      </div>
    );
  }

  const openCount = feed.observer.inboxLoaded ? openItemCount(feed.observer.items) : null;
  const watching = open && ready;

  return (
    <DockActionsProvider actions={actions}>
      <div className="ui-container ui-dock-strip dock-strip" data-dock={open ? "open" : "closed"}>
        <button type="button" className="dock-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((current) => !current)}>
          <Chevron open={open} />
          <span>{open ? "Close the dock" : "Open the dock"}</span>
        </button>
        <p className="dock-fact" data-fact="session" role={pairing.phase === "unpaired" || pairing.phase === "expired" ? "alert" : "status"}>
          {pairingWords(pairing)}
        </p>
        {watching ? (
          <>
            {openCount === null ? null : openCount === 0 ? (
              <p className="dock-fact" data-fact="items">
                <Num>0</Num> prepared items
              </p>
            ) : (
              <button type="button" className="dock-count" data-fact="items" onClick={() => openCard(null)}>
                <Num>{String(openCount)}</Num> prepared item{openCount === 1 ? "" : "s"}: open the card
              </button>
            )}
            <StripFacts feed={feed} nowMs={nowMs} />
          </>
        ) : (
          <p className="dock-fact ui-dock-muted" data-fact="idle">
            {ready ? NOT_WATCHING_TEXT : "nothing to watch until this page is paired"}
          </p>
        )}
      </div>
      <div id={panelId} className="dock-panel" hidden={!open}>
        <div className="ui-container dock-panel-inner">
          <PairingNotice pairing={pairing} heading="h2" />
          <div className="dock-columns">
            <div className="dock-column" data-column="terminal">
              <TerminalView services={terminal} feed={{ pairing, observer: feed.observer, onUnauthorized }} />
              <PrepareConsole terminal={terminal} showPairingNotice={false} />
            </div>
            <div className="dock-column" data-column="observer">
              <ObserverPane state={feed.observer} />
              <SigningView services={signing} feed={{ state: feed.inbox, dispatch: feed.dispatchInbox, pairing, onUnauthorized }} openRequest={request} />
            </div>
          </div>
        </div>
      </div>
    </DockActionsProvider>
  );
}
