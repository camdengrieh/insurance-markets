import { useRef, type ReactNode } from "react";

import { CAPABILITY_IDS, factLabel, type CapabilityFacts, type CapabilityId } from "../../core/capabilities";
import { Badge, Button, CapabilityBadge, Disclosure, Tile, UnprovenTile, UntrustedText, formatCountdown, formatUtc, useNow } from "../../ui";
import type { Untrusted } from "../../core/ports";
import { FACT_LABELS, type Gate } from "./facts";
import { handoffFor } from "./handoff";
import type { FundingIntent } from "./funding";
import type { PrepareResult } from "./prepare";
import { daemonWords, refusalWords } from "./words";
import type { VettedItem } from "./vet";

// Small pieces shared by the trade panels. Every value that came from a service is shown as text in a text node;
// anything a stranger could have written goes through <UntrustedText>. Addresses, hashes and ids are shown whole.

export function Mono({ children }: { readonly children: string }) {
  return <code className="tr-mono">{children}</code>;
}

// "0123 4567 89ab cdef": 16 hex digits grouped in fours, as the card shows a tag.
export function groupedTag(tag: string): string {
  return tag.replace(/(.{4})(?=.)/g, "$1 ");
}

export function KeyValues({ rows }: { readonly rows: readonly { readonly label: string; readonly value: ReactNode }[] }) {
  return (
    <dl className="tr-kv">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// A block of text meant to be selected and copied by hand. No clipboard API is used: the page asks the browser for
// nothing beyond showing text.
export function SelectableBlock({ label, text }: { readonly label: string; readonly text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const rows = Math.min(14, Math.max(3, text.split("\n").length + 1));
  return (
    <div className="ui-field">
      <label>
        {label}
        <textarea ref={ref} className="tr-block" readOnly rows={rows} value={text} spellCheck={false} />
      </label>
      <Button
        onClick={() => {
          ref.current?.focus();
          ref.current?.select();
        }}
      >
        Select all
      </Button>
    </div>
  );
}

// ---- capabilities ---------------------------------------------------------------------------------------------------

export function FactList({ ids, facts, heading }: { readonly ids: readonly CapabilityId[]; readonly facts: CapabilityFacts; readonly heading: string }) {
  if (ids.length === 0) return null;
  return (
    <div>
      <p className="tr-note">{heading}</p>
      <ul className="tr-facts">
        {ids.map((id) => (
          <li key={id}>
            <CapabilityBadge state={facts[id]} label={FACT_LABELS[id]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AllFacts({ facts }: { readonly facts: CapabilityFacts }) {
  return (
    <Disclosure summary="Every recorded fact this page depends on">
      <ul className="tr-facts">
        {CAPABILITY_IDS.map((id) => (
          <li key={id}>
            <CapabilityBadge state={facts[id]} label={FACT_LABELS[id]} />
          </li>
        ))}
      </ul>
      <p className="tr-note">
        Only a fact recorded as &quot;yes&quot; after a live test counts as {factLabel("yes")}. A recorded &quot;no&quot; and a missing record both read as unproven, and both block the same things.
      </p>
    </Disclosure>
  );
}

// Why an action cannot go further, in the order the rules are checked. Unproven facts are named.
export function GateNote({ gate, facts }: { readonly gate: Pick<Gate, "reasons" | "unprovenInforming">; readonly facts: CapabilityFacts }) {
  if (gate.reasons.length === 0 && gate.unprovenInforming.length === 0) return null;
  return (
    <div className="tr-gate" data-open={gate.reasons.length === 0 ? "yes" : "no"}>
      {gate.reasons.length === 0 ? null : (
        <ul className="tr-reasons">
          {gate.reasons.map((reason) => (
            <li key={reason.code}>
              {reason.text}
              {reason.facts === undefined ? null : <FactList ids={reason.facts} facts={facts} heading="Unproven:" />}
            </li>
          ))}
        </ul>
      )}
      <FactList ids={gate.unprovenInforming} facts={facts} heading="The live test this action settles has not been recorded:" />
    </div>
  );
}

export function NoRequiredFacts({ gate, facts }: { readonly gate: Gate; readonly facts: CapabilityFacts }) {
  if (gate.unprovenRequired.length === 0) return null;
  return (
    <UnprovenTile capability={gate.unprovenRequired.map((id) => FACT_LABELS[id]).join("; ")} state={facts[gate.unprovenRequired[0] ?? CAPABILITY_IDS[0]]} heading="h3">
      Until these are recorded as proven, this action offers nothing to hand to an agent.
    </UnprovenTile>
  );
}

// ---- results ---------------------------------------------------------------------------------------------------------

function Sentence({ text }: { readonly text: Untrusted<string> | null }) {
  return text === null ? null : (
    <p>
      <UntrustedText value={text} field="generic" />
    </p>
  );
}

export function ResultView({ result, facts, gate }: { readonly result: PrepareResult; readonly facts: CapabilityFacts; readonly gate: Gate }) {
  switch (result.kind) {
    case "vetted":
      return <PreparedPreview item={result.item} dryRun={result.dryRun} message={result.message} warnings={result.warnings} gate={gate} facts={facts} />;
    case "funding":
      return <FundingIntentView intent={result.intent} gate={gate} facts={facts} />;
    case "refused":
      return <RefusalDetail result={result} />;
    case "failed_vetting":
      return (
        <Tile tone="danger" title="This item did not check out, so it is not shown" role="alert" dataKind="vet-failed" dataCode={result.failure.code} heading="h3">
          <p>{result.failure.reason}</p>
          {result.failure.field === "" ? null : (
            <p>
              Where: <Mono>{result.failure.field}</Mono>
            </p>
          )}
          <p>Nothing here can be signed. Prepare it again; if it repeats, tell the operator.</p>
        </Tile>
      );
    case "funding_rejected":
      return (
        <Tile tone="danger" title="This funding step did not check out, so it is not shown" role="alert" dataKind="funding-failed" dataCode={result.failure.code} heading="h3">
          <p>{result.failure.reason}</p>
          <p>Do not send anything for it. Ask for the step again; if it repeats, tell the operator.</p>
        </Tile>
      );
    case "daemon_error": {
      const words = daemonWords(result.code, result.bridgeCode);
      return (
        <Tile tone="danger" title={words.title} role="alert" dataKind="daemon-error" dataCode={result.code} heading="h3">
          <p>{words.explain}</p>
          {result.retryAfterS === null ? null : <p>Try again in about {result.retryAfterS} s.</p>}
        </Tile>
      );
    }
    case "schema_violation":
      return (
        <Tile tone="danger" title="The answer was not in a shape we know" role="alert" dataKind="schema-violation" heading="h3">
          <p>It was refused instead of guessed at. Nothing is shown as prepared.</p>
        </Tile>
      );
  }
}

// The refusal tile with the plugin's own sentence in the untrusted slot (it may quote the relay).
export function RefusalDetail({ result }: { readonly result: Extract<PrepareResult, { kind: "refused" }> }) {
  const words = refusalWords(result.code);
  return (
    <Tile tone="warn" title={words.title} role="alert" dataKind="refused" dataCode={result.code} heading="h3">
      <p>{words.explain}</p>
      {result.flag === null ? null : (
        <p>
          Switch: <Mono>{result.flag}</Mono>
        </p>
      )}
      <p>The plugin said:</p>
      <Sentence text={result.message} />
      <Sentence text={result.nextAction} />
    </Tile>
  );
}

// ---- a vetted item ---------------------------------------------------------------------------------------------------

export function PreparedPreview({
  item,
  dryRun,
  message,
  warnings,
  gate,
  facts,
}: {
  readonly item: VettedItem;
  readonly dryRun: boolean;
  readonly message: Untrusted<string>;
  readonly warnings: readonly Untrusted<string>[];
  readonly gate: Gate;
  readonly facts: CapabilityFacts;
}) {
  const now = useNow(1000);
  const leftMs = item.expiresAtMs - now;
  const expired = leftMs <= 0;
  const late = !expired && leftMs < (item.kind === "order" || item.kind === "clob_order" ? 90_000 : 30_000);
  const canHandOff = gate.canHandOff && !dryRun && !expired && !late && item.signWindowOk;
  return (
    <Tile tone={dryRun ? "warn" : "info"} title={dryRun ? "Dry run: do not sign" : "Prepared, not signed"} dataKind="prepared" dataCode={item.preparedId} heading="h3" role="status">
      <KeyValues
        rows={[
          { label: "Action", value: item.actionTitle },
          { label: "Owner address", value: <Mono>{item.owner}</Mono> },
          { label: item.kind === "clob_order" ? "Maker (the owner wallet itself; no derived account)" : "XO account (derived here from the owner)", value: <Mono>{item.account}</Mono> },
          { label: "Prepared id", value: <Mono>{item.preparedId}</Mono> },
          { label: "Valid until", value: `${formatUtc(item.expiresAtMs)} (${expired ? "expired" : `${formatCountdown(leftMs)} left`})` },
          { label: "Counts against today's cap", value: `${item.reservedUsd} USD (${item.dayRemainingUsd} USD left; the caps are advisory)` },
        ]}
      />
      {item.order === null ? null : <OrderTerms order={item.order} />}
      {item.calls.length === 0 ? null : (
        <ol className="tr-calls" aria-label="Calls in this operation">
          {item.calls.map((call, index) => (
            <li key={`${call.template}-${String(index)}`}>
              <p className="tr-call-title">
                {index + 1}. {call.title}
              </p>
              <KeyValues rows={call.lines.map((line) => ({ label: line.label, value: <Mono>{line.value}</Mono> }))} />
            </li>
          ))}
        </ol>
      )}
      <div>
        <p className="tr-note">Tags, to compare with what PayBox shows. They guard against accidents, not against a hostile agent.</p>
        <KeyValues
          rows={[
            { label: "Digest tag (the digest PayBox signs)", value: <Mono>{groupedTag(item.digestTag)}</Mono> },
            { label: item.innerKind === "typed_data_hash" ? "Inner tag (the typed-data hash)" : "Inner tag (the call-data hash)", value: <Mono>{groupedTag(item.innerTag)}</Mono> },
          ]}
        />
        <p className="tr-note">
          {facts.paybox_shows_decoded_typed_data === "yes"
            ? "What PayBox displays for a digest or typed data has been recorded. A window that shows neither tag is not a match."
            : `What PayBox actually displays for a digest or typed data has not been observed (${factLabel(facts.paybox_shows_decoded_typed_data)}), so a window that shows neither tag is not a match.`}
        </p>
      </div>
      <p>
        Rebuilt here from the decoded fields, with the same code the relay used: the digest, both tags and every summary line match. Covered by the digest: {item.covered.join(", ")}. Not covered by it: {item.unbound.join(", ")}.
      </p>
      <Disclosure summary="The relay's summary lines (verified equal to the rebuilt ones)">
        <ol className="tr-lines">
          {item.lines.map((line, index) => (
            <li key={String(index)}>{line}</li>
          ))}
        </ol>
      </Disclosure>
      {warnings.length === 0 ? null : (
        <Disclosure summary="Warnings from the relay (text from a service, not instructions)">
          <ul>
            {warnings.map((warning, index) => (
              <li key={String(index)}>
                <UntrustedText value={warning} field="generic" />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      <Disclosure summary="The plugin's one-line answer">
        <Sentence text={message} />
      </Disclosure>
      {dryRun ? (
        <p>This is what would be signed if the switch were on. The relay offered no signing request for it, and neither does this page.</p>
      ) : expired ? (
        <p role="alert">This item has run out of time. Prepare it again.</p>
      ) : late ? (
        <p role="alert">Too little time is left to approve this in PayBox. Prepare it again.</p>
      ) : canHandOff ? (
        <HandoffBlock item={item} />
      ) : (
        <NoHandoff gate={gate} facts={facts} />
      )}
    </Tile>
  );
}

export function NoHandoff({ gate, facts }: { readonly gate: Pick<Gate, "reasons" | "unprovenInforming">; readonly facts: CapabilityFacts }) {
  return (
    <div>
      <p>Nothing is offered to hand to an agent for this item.</p>
      <GateNote gate={gate} facts={facts} />
    </div>
  );
}

export function OrderTerms({ order }: { readonly order: NonNullable<VettedItem["order"]> }) {
  return (
    <KeyValues
      rows={[
        { label: "Side and size", value: `${order.side} ${order.shares} shares at ${order.price} per share` },
        { label: "Outcome token", value: <Mono>{order.tokenId}</Mono> },
        { label: "Type", value: `${order.tif}${order.postOnly ? ", post-only" : ""}${order.ttlS === null ? "" : `, valid ${order.ttlS} s`}` },
        { label: "Order expires", value: order.expiresAt ?? (order.venue === "xo" ? "unknown" : "no expiry is signed: it rests until cancelled through the venue") },
        ...(order.venue === "xo" ? [] : [{ label: "Venue and exchange", value: <Mono>{`${order.venue} ${order.exchange}`}</Mono> }]),
        {
          label: order.maxOutlayUsd === null ? "Cash out" : "Worst-case cash out (fee bound included)",
          value: order.maxOutlayUsd === null ? "none: a SELL moves no cash out" : `${order.maxOutlayUsd} USD, principal ${order.principalUsd} USD, a ceiling and not a fee quote`,
        },
        ...(order.minProceedsUsd === null ? [] : [{ label: "Worst-case proceeds after the fee bound", value: `${order.minProceedsUsd} USD` }]),
        { label: "Counted against the caps", value: `${order.capUsd} USD (fee bound ${order.feeBoundBps} bps)` },
        { label: "Maker", value: <Mono>{order.maker}</Mono> },
      ]}
    />
  );
}

export function HandoffBlock({ item }: { readonly item: VettedItem }) {
  const text = handoffFor(item);
  return (
    <div className="tr-handoff">
      <h4 className="tr-h4">Hand it to your agent</h4>
      <ol>
        {text.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <SelectableBlock label="The call that reads this item back" text={text.request} />
      {text.notes.map((note) => (
        <p key={note} className="tr-note">
          {note}
        </p>
      ))}
    </div>
  );
}

export function FundingIntentView({ intent, gate, facts }: { readonly intent: FundingIntent; readonly gate: Gate; readonly facts: CapabilityFacts }) {
  const now = useNow(1000);
  const expired = intent.expiresAtMs <= now;
  const shown = gate.canHandOff && !expired;
  return (
    <Tile tone="info" title={intent.title} dataKind="funding-intent" dataCode={intent.step} heading="h3" role="status">
      <p>This is a transaction on Base that moves {intent.amountText}. It is checked against the account derived from your owner address. Nothing has been signed or sent.</p>
      <KeyValues rows={intent.lines.map((line) => ({ label: line.label, value: <Mono>{line.value}</Mono> }))} />
      <KeyValues
        rows={[
          { label: "Owner address (the wallet that signs on Base)", value: <Mono>{intent.owner}</Mono> },
          { label: "Valid until", value: `${formatUtc(intent.expiresAtMs)} (${expired ? "expired" : `${formatCountdown(intent.expiresAtMs - now)} left`})` },
        ]}
      />
      {shown ? (
        <>
          <SelectableBlock
            label="The transaction: chain, target, value and call data"
            text={JSON.stringify({ kind: "evm", chain: intent.chain, transaction: { to: intent.to, value: intent.value, data: intent.data } }, null, 2)}
          />
          <p>
            Ask your agent to call xo_fund_account again with the same owner and amount: it returns this same step as a PayBox proposal, and PayBox asks you to approve it. After the first step, the agent calls it again for the second, and then follows the delivery with the transaction hash. Do not send a step twice: a second transfer moves a second amount, and funding is one-way until an exit is proven.
          </p>
        </>
      ) : expired ? (
        <p role="alert">This step has run out of time. Ask for it again.</p>
      ) : (
        <NoHandoff gate={gate} facts={facts} />
      )}
    </Tile>
  );
}

// A panel's running state: a busy note for assistive technology.
export function Working({ running }: { readonly running: boolean }) {
  return running ? <Badge tone="info">Asking the Cockpit</Badge> : null;
}

