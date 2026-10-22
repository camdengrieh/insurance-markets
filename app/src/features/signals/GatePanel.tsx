// The Quotient switch (R8: default OFF, with the licence clause shown FIRST) and how a key reaches Quotient.
// Nothing here requests anything. The key box hands its value to the session and clears itself; the value is never
// rendered, stored or put in a URL.

import { useRef, useState } from "react";

import { Badge, Button, Field, Tile, formatUtc } from "../../ui";
import { LICENCE_CLAUSE_BODY, LICENCE_CLAUSE_QUOTES, LICENCE_CLAUSE_SOURCE, LICENCE_CLAUSE_TITLE, QUOTIENT_SHAPE_STATUS } from "./quotient";
import type { AccessChoice, SessionSnapshot, SignalsSession } from "./session";

export function ShapeStatus() {
  if (QUOTIENT_SHAPE_STATUS.status === "verified") return null;
  return (
    <Tile tone="warn" title="Unproven: Quotient's response formats" heading="h2" dataKind="signals-shape" dataCode="unverified">
      <p>
        {QUOTIENT_SHAPE_STATUS.evidence} Until a person runs the live check and records the result, every Quotient figure is shown as unproven, and a response that does not match is refused instead of
        guessed at.
      </p>
      <details>
        <summary>What has not been checked</summary>
        <ul>
          {QUOTIENT_SHAPE_STATUS.unverified.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </Tile>
  );
}

export function GatePanel({ session, snapshot, mode }: { readonly session: SignalsSession; readonly snapshot: SessionSnapshot; readonly mode: "standalone" | "cockpit" }) {
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyInput = useRef<HTMLInputElement | null>(null);

  if (!snapshot.loaded) {
    return (
      <Tile tone="neutral" title="Quotient: checking your setting" heading="h2" dataKind="signals-gate" dataCode="loading">
        <p>Quotient stays off until the setting has been read.</p>
      </Tile>
    );
  }

  if (!snapshot.enabled) {
    return (
      <Tile tone="warn" title="Quotient is off" heading="h2" dataKind="signals-gate" dataCode="off">
        <p>
          Nothing has been requested from Quotient. This screen shows Quotient's forecasts only after you switch it on, and only for you. Read the clause first.
        </p>
        <h3 className="signals-subhead">{LICENCE_CLAUSE_TITLE}</h3>
        <ul data-licence-clause="quotes">
          {LICENCE_CLAUSE_QUOTES.map((quote) => (
            <li key={quote}>"{quote}"</li>
          ))}
        </ul>
        <p className="signals-note">Source: {LICENCE_CLAUSE_SOURCE}.</p>
        <p>{LICENCE_CLAUSE_BODY}</p>
        <label className="signals-check">
          <input type="checkbox" checked={read} onChange={(event) => setRead(event.currentTarget.checked)} />
          <span>I have read this and want to turn Quotient on for my own use.</span>
        </label>
        <p>
          <Button
            variant="primary"
            disabled={!read}
            busy={busy}
            onClick={() => {
              setBusy(true);
              void session.enable().finally(() => setBusy(false));
            }}
          >
            Turn Quotient on
          </Button>
        </p>
      </Tile>
    );
  }

  return (
    <Tile
      tone="ok"
      title="Quotient is on"
      heading="h2"
      dataKind="signals-gate"
      dataCode="on"
      actions={
        <Button
          onClick={() => {
            setRead(false);
            void session.disable();
          }}
        >
          Turn Quotient off and forget what is held
        </Button>
      }
    >
      <p>
        Switched on {snapshot.acknowledgedAtMs === null ? "" : `at ${formatUtc(snapshot.acknowledgedAtMs)}, `}after you read the licence clause. Results are kept in this tab's memory only and are dropped when you close the tab, after 15 idle minutes, or when you turn it off.
      </p>
      <fieldset className="signals-access">
        <legend>How requests reach Quotient</legend>
        <label className="signals-check">
          <input type="radio" name="signals-access" value="none" checked={snapshot.access === "none"} onChange={() => session.setAccess("none" satisfies AccessChoice)} />
          <span>No key. A paid request shows the price and stops. You can import what your own agent paid for.</span>
        </label>
        <label className="signals-check">
          <input type="radio" name="signals-access" value="key" checked={snapshot.access === "key"} onChange={() => session.setAccess("key" satisfies AccessChoice)} />
          <span>{mode === "cockpit" ? "Use my Quotient key, which the Cockpit holds. This page never sees it." : "Use my own Quotient key, held in this tab's memory only."}</span>
        </label>
      </fieldset>
      {snapshot.access === "key" && mode === "standalone" ? (
        <div className="signals-key">
          <Field label="Quotient key (kept in this tab's memory only)">
            {(id) => <input id={id} ref={keyInput} className="ui-input" type="password" autoComplete="off" spellCheck={false} maxLength={256} />}
          </Field>
          <p className="signals-actions">
            <Button
              onClick={() => {
                const input = keyInput.current;
                if (input === null) return;
                session.setKey(input.value.trim());
                input.value = "";
              }}
            >
              Hold this key
            </Button>
            <Button onClick={() => session.clearKey()} disabled={!snapshot.hasKey}>
              Forget the key
            </Button>{" "}
            <Badge tone={snapshot.hasKey ? "ok" : "neutral"}>{snapshot.hasKey ? "a key is held in memory" : "no key held"}</Badge>
          </p>
          <p className="signals-note">A key in a web page is exposed to anything that can run code in it. The Cockpit holds the key instead, so prefer that. The key is sent only to Quotient's own address and is never written anywhere.</p>
        </div>
      ) : null}
      {snapshot.access === "key" && mode === "cockpit" ? (
        <p className="signals-note">The Cockpit adds your key to the request. If it holds none, a paid request answers "payment required".</p>
      ) : null}
    </Tile>
  );
}
