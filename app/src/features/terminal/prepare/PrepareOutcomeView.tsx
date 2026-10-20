import { useLocation } from "wouter";

import { Badge, Button, Tile, UntrustedText } from "../../../ui";
import { FactList, GateNote, KeyValues, Mono, ResultView, SelectableBlock } from "../../trade/components";
import { ACTION_NEEDS } from "../../trade/facts";
import { daemonWords, refusalWords } from "../../trade/words";
import type { RunOutcome } from "./run";

// How a finished prepare command is shown. Everything here is fixed wording; the plugin's and the relay's own
// sentences appear only inside the untrusted slot (trade/components.tsx does that for the prepared item). The page
// never offers a way to sign or send: a prepared item ends in the Signature Card on the Signing screen, and the person
// hands it to their own agent.

export const SIGNING_PATH = "/signing";

function OpenCardButton() {
  const [, navigate] = useLocation();
  return (
    <p>
      <Button variant="primary" onClick={() => navigate(SIGNING_PATH)}>
        Open the Signature Card
      </Button>{" "}
      <span className="terminal-muted">The Signing screen shows this item as a card, rechecks it from the daemon&apos;s own record and records your decision. It never signs.</span>
    </p>
  );
}

function ActionName({ outcome }: { readonly outcome: Extract<RunOutcome, { kind: "gated" }> }) {
  return <>{outcome.action === "cancel" ? "Cancel an order" : ACTION_NEEDS[outcome.action].title}</>;
}

export function PrepareOutcomeView({ outcome }: { readonly outcome: RunOutcome }) {
  switch (outcome.kind) {
    case "refused_here":
      return (
        <Tile tone="warn" title="Not prepared" role="alert" dataKind="prepare-refused" dataCode={outcome.code} heading="h3">
          <p>{outcome.message}</p>
          {outcome.retype === undefined ? null : (
            <ul aria-label="To type again">
              {outcome.retype.fields.map((field) => (
                <li key={field.key} data-state={outcome.retype?.mismatched.includes(field.key) ? "mismatch" : outcome.retype?.missing.includes(field.key) ? "missing" : "ok"}>
                  {field.label}
                </li>
              ))}
            </ul>
          )}
          {outcome.issues === undefined || outcome.issues.length === 0 ? null : (
            <ul aria-label="What is wrong with the order">
              {outcome.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </Tile>
      );
    case "gated":
      return (
        <Tile tone="warn" title="Not prepared: the server would refuse this" role="alert" dataKind="prepare-gated" dataCode={outcome.action} heading="h3">
          <p>
            <ActionName outcome={outcome} />, for owner <Mono>{outcome.owner}</Mono>.
          </p>
          {outcome.readOnly ? (
            <p>
              <Badge tone="neutral">read-only</Badge> Every write switch is off at the plugin and the relay, so this daemon only reads. The operator switches writes on in the daemon&apos;s environment; this page cannot.
            </p>
          ) : null}
          <GateNote gate={{ reasons: outcome.reasons, unprovenInforming: outcome.unprovenInforming }} facts={outcome.facts} />
        </Tile>
      );
    case "account_unread": {
      const failure = outcome.failure;
      if (failure.kind === "refused") {
        const words = refusalWords(failure.code);
        return (
          <Tile tone="danger" title={words.title} role="alert" dataKind="prepare-account-unread" dataCode={failure.code} heading="h3">
            <p>{words.explain} The account could not be read, so nothing was prepared. The plugin said:</p>
            <p>
              <UntrustedText value={failure.message} field="generic" />
            </p>
          </Tile>
        );
      }
      if (failure.kind === "daemon_error") {
        const words = daemonWords(failure.code, failure.bridgeCode);
        return (
          <Tile tone="danger" title={words.title} role="alert" dataKind="prepare-account-unread" dataCode={failure.code} heading="h3">
            <p>{words.explain} The account could not be read, so nothing was prepared.</p>
          </Tile>
        );
      }
      return (
        <Tile tone="danger" title={failure.kind === "wrong_subject" ? "The answer was about another account" : "The answer was not in a shape we know"} role="alert" dataKind="prepare-account-unread" dataCode={failure.kind} heading="h3">
          <p>It was refused instead of used. Nothing was prepared.</p>
        </Tile>
      );
    }
    case "handoff":
      return (
        <Tile tone="info" title="Cancel call for your agent. Nothing was sent." role="status" dataKind="prepare-handoff" dataCode="cancel" heading="h3">
          <KeyValues rows={[{ label: "Owner", value: <Mono>{outcome.owner}</Mono> }, { label: "Order hash", value: <Mono>{outcome.orderHash}</Mono> }]} />
          <SelectableBlock label="The call your agent makes" text={outcome.call} />
          <p>
            Cancelling asks XO to drop the order. It does not invalidate the signed order on chain; that stays valid until it expires. Sending needs an agent token started with the submit scope and an open ARM window. This terminal has neither.
          </p>
          <FactList ids={outcome.unprovenInforming} facts={outcome.facts} heading="The live test this settles has not been recorded:" />
        </Tile>
      );
    case "prepared":
      return (
        <div className="ui-stack" data-kind="prepare-result" data-action={outcome.action}>
          {outcome.quote === null ? null : (
            <Tile tone="info" title="What this page computed before asking" role="note" dataKind="prepare-ticket" heading="h3">
              <KeyValues
                rows={[
                  { label: "Price", value: outcome.quote.price },
                  { label: "Shares", value: outcome.quote.shares },
                  { label: "Most cash that can leave (a ceiling)", value: `${outcome.quote.maxOutlayUsd} USD` },
                  { label: "Counts against the advisory caps", value: `${outcome.quote.reservedUsd} USD` },
                  { label: "Fee bound", value: `${String(outcome.quote.feeBoundBps)} bps` },
                ]}
              />
              <p>The relay&apos;s quote must equal these digit for digit, or the item is not shown.</p>
            </Tile>
          )}
          <ResultView result={outcome.result} facts={outcome.facts} gate={outcome.gate} />
          {outcome.openCard === null ? null : <OpenCardButton />}
        </div>
      );
  }
}
