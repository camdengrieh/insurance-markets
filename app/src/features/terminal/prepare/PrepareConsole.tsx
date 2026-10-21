import { useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import { formatUtc } from "../../../core/format";
import { Badge, Button, ErrorTile, Field, NeedsCockpitTile, Tile, useAnnounce, useAppMode, useClock } from "../../../ui";
import { useTradeServices, type TradeServices } from "../../trade/services";
import { MAX_LINE_CHARS, normalizeLine } from "../grammar";
import { useTerminalServices, type TerminalServices } from "../services";
import { describePrepare, PREPARE_HELP, PREPARE_VERBS, routeLine, type PrepareCommand, type PrepareRefusal } from "./grammar";
import { PrepareOutcomeView } from "./PrepareOutcomeView";
import { marketReaderOver, runPrepare, type RunDeps, type RunOutcome } from "./run";
import { checkProposal, checkRetype, isTainted, retypeFieldsOf, type LineOrigin, type ProposalContext, type Retyped } from "./taint";

// The prepare console (docs/dapp-design.md 5.2 "Prepare", J2). One line at a time, a closed grammar (grammar.ts), a
// gate that speaks before anything is prepared, the re-typing rule for lines that were not typed by hand (taint.ts)
// and a checked result that ends in the Signature Card. It signs nothing and sends nothing, and it has no model.
//
// A paste is flattened to one line and put in the box; it never runs. Only Enter or Run runs a line.

export const MAX_PREPARE_ENTRIES = 30;
const MAX_HISTORY = 30;

interface Entry {
  readonly id: number;
  readonly atMs: number;
  readonly origin: LineOrigin;
  readonly text: string;
  readonly notices: readonly string[];
  readonly refusal: PrepareRefusal | null;
  readonly readCommand: string | null;
  readonly command: PrepareCommand | null;
  readonly outcome: RunOutcome | null;
  readonly running: boolean;
}

interface HistoryItem {
  readonly line: string;
  readonly origin: LineOrigin;
}

export interface ProposalInput {
  readonly line: string;
  readonly context: ProposalContext;
}

export interface PrepareConsoleProps {
  readonly terminal?: TerminalServices;
  readonly trade?: TradeServices;
  // A model's proposal. It is checked deterministically and, if it passes, put in the box UNSENT with a banner.
  readonly proposal?: ProposalInput | null;
  // False when the host (the dock) already shows the one "not paired" tile for every panel it holds.
  readonly showPairingNotice?: boolean;
}

const ORIGIN_TEXT: Readonly<Record<LineOrigin, string>> = Object.freeze({
  typed: "typed by you",
  recalled: "recalled from your earlier lines",
  pasted: "pasted",
  filled: "filled in by the page",
  proposal: "proposed",
});

export function PrepareConsole({ terminal: terminalProvided, trade: tradeProvided, proposal = null, showPairingNotice = true }: PrepareConsoleProps) {
  const mode = useAppMode();
  const clock = useClock();
  const announce = useAnnounce();
  const terminalFallback = useTerminalServices(mode);
  const tradeFallback = useTradeServices();
  const terminal = terminalProvided ?? terminalFallback;
  const trade = tradeProvided ?? tradeFallback;
  const inputId = useId();
  const hintId = useId();
  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [line, setLine] = useState("");
  const [origin, setOrigin] = useState<LineOrigin>("typed");
  const [retyped, setRetyped] = useState<Retyped>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [soleOwner, setSoleOwner] = useState<string | null>(null);
  const [pairedOnce, setPairedOnce] = useState(false);
  const history = useRef<HistoryItem[]>([]);
  const cursor = useRef(-1);

  const deps: RunDeps = useMemo(
    () => ({ client: trade.client, nowMs: trade.nowMs, facts: trade.facts, loadOwners: trade.loadOwners, readMarket: marketReaderOver(terminal.client) }),
    [trade, terminal],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // Ride the page's one session; the terminal screen normally pairs first and this is then a no-op.
  useEffect(() => {
    if (mode !== "cockpit") return;
    if (terminal.session.token() !== null) {
      setPairedOnce(true);
      return;
    }
    let cancelled = false;
    void terminal.session.pair().then((outcome) => {
      if (!cancelled && outcome.ok) setPairedOnce(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, terminal]);

  useEffect(() => {
    let cancelled = false;
    void trade.loadOwners().then((owners) => {
      if (!cancelled) setSoleOwner(owners.length === 1 ? (owners[0]?.address ?? null) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [trade]);

  // A proposal fills the box, unsent, and is marked as one: it always needs the re-typing.
  const [proposalNote, setProposalNote] = useState<string | null>(null);
  useEffect(() => {
    if (proposal === null) return;
    const checked = checkProposal(proposal.line, proposal.context);
    if (!checked.ok) {
      setProposalNote(`A proposal was not accepted: ${checked.message}`);
      return;
    }
    setLine(checked.line);
    setOrigin("proposal");
    setRetyped({});
    setProposalNote("A proposal was put in the box. It has not run. Read it, type the items below again, then press Run.");
  }, [proposal]);

  const routed = useMemo(() => (line.trim() === "" ? null : routeLine(line)), [line]);
  const parsed = routed !== null && routed.ok && routed.route === "prepare" ? routed.command : null;
  const fields = useMemo(() => (parsed === null ? [] : retypeFieldsOf(parsed, parsed.from ?? soleOwner)), [parsed, soleOwner]);
  const retypeState = useMemo(() => checkRetype(fields, origin, retyped), [fields, origin, retyped]);
  const needsRetype = parsed !== null && isTainted(origin);

  const run = useCallback(
    async (text: string, textOrigin: LineOrigin, typedAgain: Retyped): Promise<void> => {
      const normalized = normalizeLine(text);
      const result = routeLine(text);
      const id = (idRef.current += 1);
      const notices: string[] = [];
      if (normalized.flattened) notices.push("Line breaks in the text were turned into spaces, so it ran as one line.");
      if (normalized.strippedInvisible) notices.push("Invisible or direction-changing characters were removed from the line.");
      const base: Entry = {
        id,
        atMs: clock.now(),
        origin: textOrigin,
        text: normalized.tooLong ? "" : normalized.line,
        notices,
        refusal: result.ok ? null : result,
        readCommand: result.ok && result.route === "read" ? result.command.name : null,
        command: result.ok && result.route === "prepare" ? result.command : null,
        outcome: null,
        running: result.ok && result.route === "prepare",
      };
      if (normalized.line !== "") {
        history.current = [{ line: normalized.line, origin: textOrigin }, ...history.current.filter((item) => item.line !== normalized.line)].slice(0, MAX_HISTORY);
      }
      cursor.current = -1;
      setEntries((current) => [base, ...current].slice(0, MAX_PREPARE_ENTRIES));
      if (!result.ok || result.route !== "prepare") {
        announce("That line was not run. See the transcript for why.", "polite");
        return;
      }
      setRunning(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let outcome: RunOutcome;
      try {
        outcome = await runPrepare({ command: result.command, origin: textOrigin, retyped: typedAgain }, deps, controller.signal);
      } catch {
        // runPrepare turns every expected failure into an outcome; this is a programming error. Say so, with no detail.
        outcome = { kind: "refused_here", code: "market_unreadable", message: "The command did not complete and its effect is unknown. Nothing is shown as prepared." };
      }
      if (controller.signal.aborted) return;
      setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, running: false, outcome } : entry)));
      setRunning(false);
      announce(outcome.kind === "prepared" && outcome.openCard !== null ? "Prepared. Open the Signature Card to read it." : "The command finished. See the transcript.", outcome.kind === "prepared" ? "polite" : "assertive");
    },
    [announce, clock, deps],
  );

  function reset(): void {
    setLine("");
    setOrigin("typed");
    setRetyped({});
    setNotice(null);
    setProposalNote(null);
  }

  function submit(event: { preventDefault(): void }): void {
    event.preventDefault();
    if (running || line.trim() === "") return;
    if (parsed !== null && !retypeState.ok) return;
    const text = line;
    const textOrigin = origin;
    const typedAgain = retyped;
    reset();
    void run(text, textOrigin, typedAgain);
  }

  function onChange(value: string): void {
    setLine(value);
    setRetyped({});
    // Editing a pasted or proposed line does not make it the person's own: only emptying the box starts over.
    if (value === "") reset();
    else if (origin === "recalled") setOrigin("typed");
  }

  // A paste is flattened to one line and put in the box. It never runs, and it makes the line "pasted".
  function onPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData("text/plain");
    event.preventDefault();
    const flat = normalizeLine(pasted);
    const input = event.currentTarget;
    const start = input.selectionStart ?? line.length;
    const end = input.selectionEnd ?? line.length;
    setLine(`${line.slice(0, start)}${flat.line}${line.slice(end)}`.slice(0, MAX_LINE_CHARS * 2));
    setOrigin("pasted");
    setRetyped({});
    setNotice(
      flat.flattened
        ? "The pasted text had line breaks. They became spaces and nothing ran. A pasted line needs its market id and size typed again."
        : "Pasted text may have been shaped by someone else, so its market id and size must be typed again. Nothing ran.",
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const past = history.current;
    if (past.length === 0) return;
    event.preventDefault();
    const next = event.key === "ArrowUp" ? Math.min(cursor.current + 1, past.length - 1) : cursor.current - 1;
    cursor.current = next;
    const item = next < 0 ? undefined : past[next];
    // A recalled line is only put in the box. It keeps the origin it had when it was first entered.
    setLine(item?.line ?? "");
    setOrigin(item === undefined ? "typed" : isTainted(item.origin) ? item.origin : "recalled");
    setRetyped({});
  }

  if (mode !== "cockpit") return <NeedsCockpitTile what="the prepare console, which prepares items through the local daemon" />;

  const paired = pairedOnce || trade.client.hasToken();
  const blockedReason = parsed !== null && !retypeState.ok ? "Type the items below again to enable Run." : null;
  return (
    <section className="terminal-console prepare-console" aria-labelledby={`${inputId}-h`} data-testid="prepare-console">
      <h2 id={`${inputId}-h`}>Prepare</h2>
      <p className="terminal-lead">
        Commands that ask the relay to prepare something for you to sign: {PREPARE_VERBS.join(", ")}. This console prepares only. It never signs, sends, arms, kills or changes a flag, a cap or a setting, and it has no model. All write paths are off until the operator
        switches them on; a command that the server would refuse says so before anything is asked.
      </p>
      {paired || !showPairingNotice ? null : <ErrorTile code="NOT_PAIRED" title="Not paired with the daemon" message="Open the pair link the daemon printed, or reload this page. Until then nothing can be prepared." heading="h3" />}
      <form className="terminal-form" onSubmit={submit} aria-describedby={hintId}>
        <div className="ui-field">
          <label htmlFor={inputId}>Prepare command</label>
          <input
            id={inputId}
            className="ui-input terminal-input"
            type="text"
            value={line}
            maxLength={MAX_LINE_CHARS * 2}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
          />
        </div>
        <Button type="submit" variant="primary" busy={running} disabled={line.trim() === "" || blockedReason !== null}>
          Run
        </Button>
      </form>
      <p id={hintId} className="terminal-muted">
        One line at a time. Pasting only fills the box; press Enter or Run to run it. Usage: {PREPARE_VERBS.map((verb) => PREPARE_HELP[verb].usage).join(" | ")}
      </p>
      {notice === null ? null : (
        <p className="terminal-warning" role="status" data-kind="paste-notice">
          {notice}
        </p>
      )}
      {proposalNote === null ? null : (
        <p className="terminal-warning" role="status" data-kind="proposal-note">
          {proposalNote}
        </p>
      )}
      {parsed === null ? null : (
        <p className="terminal-muted" data-kind="origin">
          This line was <strong>{ORIGIN_TEXT[origin]}</strong>.
        </p>
      )}
      {!needsRetype ? null : (
        <fieldset className="prepare-retype" data-kind="retype">
          <legend>This line was not typed by hand. Type these again to confirm them.</legend>
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              {(id) => (
                <input
                  id={id}
                  className="ui-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={retyped[field.key] ?? ""}
                  onChange={(event) => setRetyped((current) => ({ ...current, [field.key]: event.target.value }))}
                  aria-invalid={!retypeState.ok && retypeState.mismatched.includes(field.key) ? true : undefined}
                />
              )}
            </Field>
          ))}
          {retypeState.ok ? (
            <p role="status">
              <Badge tone="ok">matches</Badge> You can run it now.
            </p>
          ) : retypeState.mismatched.length > 0 ? (
            <p role="alert">What you typed does not match the line yet.</p>
          ) : null}
        </fieldset>
      )}
      <ol className="terminal-log" aria-label="Prepare transcript, newest first">
        {entries.map((entry) => (
          <li key={entry.id} className="terminal-entry" data-running={entry.running ? "true" : undefined}>
            <p className="terminal-entry-head">
              <span className="terminal-muted">{formatUtc(entry.atMs)}</span> <Badge tone="neutral">you</Badge>{" "}
              {entry.command !== null ? <code>{describePrepare(entry.command)}</code> : entry.text === "" ? <span>(the line was too long to show)</span> : <code>{entry.text}</code>}{" "}
              {entry.command === null ? null : <span className="terminal-muted">({ORIGIN_TEXT[entry.origin]})</span>}
              {entry.running ? <span className="terminal-muted"> running</span> : null}
            </p>
            {entry.notices.map((text) => (
              <p key={text} className="terminal-warning">
                {text}
              </p>
            ))}
            {entry.refusal === null ? null : <ErrorTile code={`REFUSED_${entry.refusal.kind.toUpperCase()}`} title="Not run" message={entry.refusal.message} heading="h3" />}
            {entry.readCommand === null ? null : (
              <Tile tone="info" title="That is a read command" role="note" dataKind="read-command" heading="h3">
                <p>This console only prepares. Run {entry.readCommand} in the read terminal.</p>
              </Tile>
            )}
            {entry.outcome === null ? null : <PrepareOutcomeView outcome={entry.outcome} />}
          </li>
        ))}
      </ol>
    </section>
  );
}
