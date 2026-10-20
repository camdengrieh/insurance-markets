import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { formatUtc } from "../../core/format";
import { Badge, Button, ErrorTile, Tile, useAnnounce, useAppMode, useClock } from "../../ui";
import { CallLine, OutcomeCard } from "./cards";
import { describeCommand, MAX_LINE_CHARS, normalizeLine, parseLine, type Command, type ParseRefusal } from "./grammar";
import { execute, type CallRecord, type ExecContext, type Outcome } from "./execute";
import { ObserverPane } from "./ObserverPane";
import { PAIR_REASON_TEXT, type PairReason } from "./session";
import { useTerminalServices, type TerminalServices } from "./services";
import { useObserver } from "./useObserver";

// The read terminal (docs/dapp-design.md 5.2, J1). A line is parsed by a fixed grammar (grammar.ts), run as a fixed
// plan of read calls (execute.ts) and shown by per-tool renderers (cards.tsx). There is no model, no scripting and
// no way to name a tool. Pasted line breaks are flattened and a paste never runs anything; only Enter does.

export const MAX_ENTRIES = 60;
export const MAX_HISTORY = 50;

type Pairing = { readonly phase: "checking" } | { readonly phase: "ready" } | { readonly phase: "unpaired"; readonly reason: PairReason } | { readonly phase: "expired" };

interface Entry {
  readonly id: number;
  readonly atMs: number;
  readonly line: string;
  readonly notices: readonly string[];
  readonly refusal: ParseRefusal | null;
  readonly command: Command | null;
  readonly calls: readonly CallRecord[];
  readonly outcome: Outcome | null;
  readonly running: boolean;
}

type EntryAction =
  | { readonly type: "add"; readonly entry: Entry }
  | { readonly type: "call"; readonly entryId: number; readonly record: CallRecord }
  | { readonly type: "finish"; readonly entryId: number; readonly outcome: Outcome }
  | { readonly type: "clear" };

function entriesReducer(entries: readonly Entry[], action: EntryAction): readonly Entry[] {
  switch (action.type) {
    case "add":
      return [action.entry, ...entries].slice(0, MAX_ENTRIES);
    case "clear":
      return [];
    case "call":
      return entries.map((entry) => {
        if (entry.id !== action.entryId) return entry;
        const exists = entry.calls.some((call) => call.id === action.record.id);
        return { ...entry, calls: exists ? entry.calls.map((call) => (call.id === action.record.id ? action.record : call)) : [...entry.calls, action.record] };
      });
    case "finish":
      return entries.map((entry) => (entry.id === action.entryId ? { ...entry, running: false, outcome: action.outcome } : entry));
  }
}

function PairingNotice({ pairing }: { readonly pairing: Pairing }) {
  if (pairing.phase === "ready") return null;
  if (pairing.phase === "checking") {
    return (
      <Tile tone="info" title="Connecting to the daemon" heading="h2" dataKind="pairing" dataCode="checking">
        <p>Checking whether this page already has a session.</p>
      </Tile>
    );
  }
  const text = pairing.phase === "expired" ? "The daemon no longer accepts this page's session (it expired, or the daemon restarted). Reload the page to have the daemon print a fresh pair link." : PAIR_REASON_TEXT[pairing.reason];
  return <ErrorTile code="NOT_PAIRED" title="Not paired with the daemon" message={text} heading="h2" />;
}

export function TerminalView({ services: provided }: { readonly services?: TerminalServices }) {
  const mode = useAppMode();
  const clock = useClock();
  const announce = useAnnounce();
  const fallback = useTerminalServices(mode);
  const services = provided ?? fallback;
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(0);
  const callIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [pairing, setPairing] = useState<Pairing>({ phase: "checking" });
  const [line, setLine] = useState("");
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [entries, dispatch] = useReducer(entriesReducer, []);
  const [running, setRunning] = useState(false);
  const history = useRef<string[]>([]);
  const cursor = useRef<number>(-1);

  const onUnauthorized = useCallback((): void => {
    services.session.forget();
    setPairing({ phase: "expired" });
  }, [services]);

  // Pair once, on arrival: a token already held (this tab or the shell's session client) wins; otherwise the pairing
  // code the page was opened with is exchanged.
  useEffect(() => {
    let cancelled = false;
    if (mode !== "cockpit") {
      setPairing({ phase: "unpaired", reason: "no_code" });
      return;
    }
    if (services.session.token() !== null) {
      setPairing({ phase: "ready" });
      return;
    }
    void services.session.pair().then((outcome) => {
      if (cancelled) return;
      setPairing(outcome.ok ? { phase: "ready" } : { phase: "unpaired", reason: outcome.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [services, mode]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const observer = useObserver(services, pairing.phase === "ready", onUnauthorized);
  const observerRef = useRef(observer);
  observerRef.current = observer;

  const run = useCallback(
    async (text: string): Promise<void> => {
      const normalized = normalizeLine(text);
      const parsed = parseLine(text);
      const entryId = (idRef.current += 1);
      const notices: string[] = [];
      if (normalized.flattened) notices.push("Line breaks in the pasted text were turned into spaces, so it ran as one line.");
      if (normalized.strippedInvisible) notices.push("Invisible or direction-changing characters were removed from the line.");
      const base: Entry = {
        id: entryId,
        atMs: clock.now(),
        line: normalized.tooLong ? "" : normalized.line,
        notices,
        refusal: parsed.ok ? null : parsed,
        command: parsed.ok ? parsed.command : null,
        calls: [],
        outcome: null,
        running: parsed.ok,
      };
      if (normalized.line !== "") {
        history.current = [normalized.line, ...history.current.filter((entry) => entry !== normalized.line)].slice(0, MAX_HISTORY);
      }
      cursor.current = -1;
      if (!parsed.ok) {
        if (parsed.kind !== "empty") dispatch({ type: "add", entry: base });
        announce("That line was not run. See the transcript for why.", "polite");
        return;
      }
      if (parsed.command.name === "clear") {
        dispatch({ type: "clear" });
        announce("Transcript cleared.", "polite");
        return;
      }
      dispatch({ type: "add", entry: base });
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;
      const context: ExecContext = {
        client: services.client,
        signal: controller.signal,
        nowMs: () => clock.now(),
        loadBindings: services.loadBindings,
        audit: () => ({ rows: observerRef.current.audit, connection: observerRef.current.connection }),
        onCall: (record) => dispatch({ type: "call", entryId, record }),
        onUnauthorized,
        nextCallId: () => (callIdRef.current += 1),
      };
      let outcome: Outcome;
      try {
        outcome = await execute(parsed.command, context);
      } catch {
        // execute turns every expected failure into an outcome; this is a programming error. Say so, with no detail.
        outcome = { kind: "failure", failure: { kind: "bad_response", bridgeCode: null, retryAfterS: null, tool: null, detail: null } };
      }
      if (controller.signal.aborted) return;
      dispatch({ type: "finish", entryId, outcome });
      setRunning(false);
      announce(outcome.kind === "failure" ? `${parsed.command.name} did not complete.` : `${parsed.command.name} finished.`, outcome.kind === "failure" ? "assertive" : "polite");
    },
    [announce, clock, onUnauthorized, services],
  );

  function submit(event: { preventDefault(): void }): void {
    event.preventDefault();
    if (running || line.trim() === "") return;
    const text = line;
    setLine("");
    setPasteNotice(null);
    void run(text);
  }

  // A paste is flattened to one line and put in the box. It never runs: only Enter does.
  function onPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData("text/plain");
    event.preventDefault();
    const flat = normalizeLine(pasted);
    const input = event.currentTarget;
    const start = input.selectionStart ?? line.length;
    const end = input.selectionEnd ?? line.length;
    const next = `${line.slice(0, start)}${flat.line}${line.slice(end)}`.slice(0, MAX_LINE_CHARS * 2);
    setLine(next);
    setPasteNotice(
      flat.flattened
        ? "The pasted text had line breaks. They became spaces and nothing ran. Check the line, then press Enter to run it."
        : flat.strippedInvisible
          ? "Invisible or direction-changing characters were removed from the pasted text. Nothing ran."
          : null,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const past = history.current;
    if (past.length === 0) return;
    event.preventDefault();
    const nextCursor = event.key === "ArrowUp" ? Math.min(cursor.current + 1, past.length - 1) : cursor.current - 1;
    cursor.current = nextCursor;
    // A recalled line is only put in the box. It is never run until Enter.
    setLine(nextCursor < 0 ? "" : (past[nextCursor] ?? ""));
  }

  const prefill = useCallback((command: string): void => {
    setLine(command);
    setPasteNotice(null);
    inputRef.current?.focus();
  }, []);

  const ready = pairing.phase === "ready";
  const rows = useMemo(() => entries, [entries]);

  return (
    <div className="terminal">
      <p className="terminal-lead">
        A read-only terminal for the local daemon. It looks things up and shows them. It has no model, no scripts and no way to prepare, sign, send, fund, withdraw or cancel, and it
        never changes a flag, a cap or a setting. Type <code>help</code> for the commands.
      </p>
      <PairingNotice pairing={pairing} />
      <ObserverPane state={observer} />
      <section className="terminal-console" aria-labelledby="terminal-console-title">
        <h2 id="terminal-console-title">Terminal</h2>
        <form className="terminal-form" onSubmit={submit} aria-describedby={hintId}>
          <div className="ui-field">
            <label htmlFor={inputId}>Command</label>
            <input
              ref={inputRef}
              id={inputId}
              className="ui-input terminal-input"
              type="text"
              value={line}
              maxLength={MAX_LINE_CHARS * 2}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={!ready}
              onChange={(event) => setLine(event.target.value)}
              onPaste={onPaste}
              onKeyDown={onKeyDown}
            />
          </div>
          <Button type="submit" variant="primary" busy={running} disabled={!ready || line.trim() === ""}>
            Run
          </Button>
        </form>
        <p id={hintId} className="terminal-muted">
          One line at a time. Pasting only fills the box; press Enter or Run to run it. Arrow keys recall earlier lines without running them.
        </p>
        {pasteNotice === null ? null : (
          <p className="terminal-warning" role="status" data-kind="paste-notice">
            {pasteNotice}
          </p>
        )}
        <ol className="terminal-log" aria-label="Transcript, newest first">
          {rows.map((entry) => (
            <li key={entry.id} className="terminal-entry" data-running={entry.running ? "true" : undefined}>
              <p className="terminal-entry-head">
                <span className="terminal-muted">{formatUtc(entry.atMs)}</span> <Badge tone="neutral">you</Badge>{" "}
                {entry.command !== null ? <code>{describeCommand(entry.command)}</code> : entry.line === "" ? <span>(the line was too long to show)</span> : <code>{entry.line}</code>}
                {entry.running ? <span className="terminal-muted"> running</span> : null}
              </p>
              {entry.notices.map((notice) => (
                <p key={notice} className="terminal-warning">
                  {notice}
                </p>
              ))}
              {entry.refusal === null ? null : <ErrorTile code={`REFUSED_${entry.refusal.kind.toUpperCase()}`} title="Not run" message={entry.refusal.message} heading="h3" />}
              {entry.calls.length === 0 ? null : (
                <ul className="terminal-calls" aria-label="Calls made for this command">
                  {entry.calls.map((record) => (
                    <CallLine key={record.id} record={record} />
                  ))}
                </ul>
              )}
              {entry.outcome === null ? null : <OutcomeCard outcome={entry.outcome} onPrefill={prefill} />}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
