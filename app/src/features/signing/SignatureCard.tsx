import { useId, useState } from "react";

import type { InboxItem, Posture } from "@bridge/contract";

import { NO_FACTS, isProven, type CapabilityFacts } from "../../core/capabilities";
import { formatUtc } from "../../core/format";
import { sanitizeText } from "../../core/untrusted";
import { Badge, Button, Disclosure, Tile, UntrustedText, formatCountdown, useAnnounce } from "../../ui";
import { ChecksList, DecodedView, FreshnessText, MismatchDetail, SummaryLines, TagsPanel } from "./CardParts";
import { GATE_REASON_TEXT, RELAY_CAPABILITY_FACT, S2_ENABLED_IN_THIS_BUILD, copyGate, signGate, type ApprovalMode, type CardEvaluation, type GateResult } from "./card";
import type { ReconcileResult } from "./client";
import { AUTONOMOUS_BANNER, KIND_TEXT, REMINDERS, STATE_TEXT, VERIFICATION_TEXT, requesterText } from "./words";

// The Signature Card (dapp-design 5.3). It renders ONLY the daemon's record of the relay's Prepared item (the summary
// lines, the decoded block, the tags), never any text this page or the agent was given another way, and it never
// sends a signature: path S1 means the user's own agent asks PayBox to sign and then submits. The buttons are Reject (a
// decision recorded by the daemon), Copy intent (puts the exact intent on the clipboard) and Sign with PayBox (path S2,
// off in this build).

export interface SignatureCardProps {
  readonly record: InboxItem;
  readonly evaluation: CardEvaluation;
  readonly nowMs: number;
  readonly posture: Posture | null;
  readonly armedUntilMs: number | null;
  readonly kill: boolean;
  readonly instance: "writer" | "read_only" | null;
  readonly approvalMode: ApprovalMode;
  // Locally recorded capability facts. A capability the relay lists is "proven" here only if one of these says yes.
  readonly facts?: CapabilityFacts;
  readonly onReject: () => Promise<boolean>;
  readonly onCopy: (text: string) => Promise<boolean>;
  readonly onReconcile: (kind: "userop" | "order", hash: string) => Promise<ReconcileResult | null>;
  readonly notice: string | null;
}

function Reasons({ gate, id }: { readonly gate: GateResult; readonly id: string }) {
  if (gate.enabled) return null;
  return (
    <ul id={id} className="signing-reasons">
      {gate.reasons.map((reason) => (
        <li key={reason} data-reason={reason}>
          {GATE_REASON_TEXT[reason]}
        </li>
      ))}
    </ul>
  );
}

function hashToReconcile(record: InboxItem): { readonly kind: "userop" | "order"; readonly hash: string } | null {
  const { result, prepared } = record;
  if (result?.order_hash !== undefined) return { kind: "order", hash: result.order_hash };
  if (result?.user_op_hash !== undefined) return { kind: "userop", hash: result.user_op_hash };
  if ("user_op_hash" in prepared) return { kind: "userop", hash: prepared.user_op_hash };
  return null;
}

export function SignatureCard({ record, evaluation, nowMs, posture, armedUntilMs, kill, instance, approvalMode, facts = NO_FACTS, onReject, onCopy, onReconcile, notice }: SignatureCardProps) {
  const announce = useAnnounce();
  const copyReasonsId = useId();
  const signReasonsId = useId();
  const [busy, setBusy] = useState<"reject" | "copy" | "reconcile" | null>(null);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const [reconciled, setReconciled] = useState<ReconcileResult | "failed" | null>(null);

  const { item, verification } = evaluation;
  const words = VERIFICATION_TEXT[verification];
  const stateWords = STATE_TEXT[record.state];
  const remaining = formatCountdown(evaluation.freshness.msLeft);
  const copy = copyGate(evaluation, record.state);
  // An ARM window whose end has passed is not open, whatever the last event said.
  const effectivePosture: Posture | null = posture === "ARMED" && (armedUntilMs === null || armedUntilMs <= nowMs) ? "OBSERVE" : posture;
  const sign = signGate({ evaluation, itemState: record.state, posture: effectivePosture, kill, instance, s2Enabled: S2_ENABLED_IN_THIS_BUILD, approvalMode });
  const mismatchIndex = evaluation.mismatch?.status === "mismatch" ? /^summary\.lines\[([0-9]+)\]$/.exec(evaluation.mismatch.field)?.[1] : undefined;
  const canReject = record.state === "prepared" || record.state === "shown" || record.state === "signed";
  const reconcileTarget = record.state === "ambiguous" ? hashToReconcile(record) : null;

  const reject = async (): Promise<void> => {
    setBusy("reject");
    const ok = await onReject();
    setBusy(null);
    announce(ok ? "Rejected. The daemon recorded it." : "The daemon did not accept the rejection.", "assertive");
  };
  const copyIntent = async (): Promise<void> => {
    if (evaluation.intentJson === null || !copy.enabled) return;
    setBusy("copy");
    const ok = await onCopy(evaluation.intentJson);
    setBusy(null);
    setCopied(ok ? "ok" : "failed");
    announce(ok ? "Copied the intent." : "Could not copy. Select the text in the intent box instead.");
  };
  const reconcile = async (): Promise<void> => {
    if (reconcileTarget === null) return;
    setBusy("reconcile");
    const result = await onReconcile(reconcileTarget.kind, reconcileTarget.hash);
    setBusy(null);
    setReconciled(result ?? "failed");
  };

  return (
    <article className="signing-card" data-verification={verification} data-state={record.state} aria-labelledby={`card-${record.prepared_id}`}>
      <header className="signing-card-head">
        <h3 id={`card-${record.prepared_id}`}>
          {item === null ? "Unreadable item" : KIND_TEXT[item.kind] ?? "Prepared item"} <code>{record.prepared_id.slice(0, 8)}</code>
        </h3>
        <p>
          Requested by: {requesterText(record.requested_by)}. State: <Badge tone={stateWords.tone}>{stateWords.text}</Badge> <FreshnessText evaluation={evaluation} remaining={remaining} />
        </p>
        <p className="signing-muted">{stateWords.explain}</p>
        {evaluation.freshness.expiresAtMs === null ? null : (
          <p className="signing-muted">
            Expires <time dateTime={new Date(evaluation.freshness.expiresAtMs).toISOString()}>{formatUtc(evaluation.freshness.expiresAtMs)}</time>.
          </p>
        )}
      </header>

      <div className="signing-verdict" role={verification === "failed" ? "alert" : "status"} data-tone={words.tone}>
        <h4>{words.title}</h4>
        <p>{words.explain}</p>
        {evaluation.mismatch === null ? null : <MismatchDetail mismatch={evaluation.mismatch} />}
      </div>

      {approvalMode === "autonomous" ? (
        <p className="signing-banner" role="alert" data-kind="autonomous">
          {AUTONOMOUS_BANNER}
        </p>
      ) : null}

      <ChecksList checks={evaluation.checks} />

      {item === null ? (
        <p>This item does not satisfy the relay's contract, so none of its text is shown. Reject it and ask the agent to prepare a new one.</p>
      ) : (
        <>
          <section aria-labelledby={`lines-${record.prepared_id}`}>
            <h4 id={`lines-${record.prepared_id}`}>What you would approve (the relay's summary)</h4>
            <SummaryLines lines={item.summary.lines} mismatchIndex={mismatchIndex === undefined ? null : Number(mismatchIndex)} />
            {item.quote === undefined ? null : (
              <p>
                Quote: <code>{item.quote.shares}</code> shares at <code>{item.quote.price}</code>, worst-case cash out <code>{item.quote.max_outlay_usd}</code> USD (fee bound <code>{item.quote.fee_bound_bps}</code> bps). Fee figures are a ceiling until a real fill has been compared.
              </p>
            )}
            <p>
              Caps, as the relay states them: this item counts <code>{item.caps.reserved_usd}</code> USD, <code>{item.caps.day_remaining_usd}</code> USD left today.{" "}
              {item.kind === "order" && verification === "verified"
                ? "The amount this order counts was checked here against its signed terms; the amount left today is the relay's own figure."
                : "These figures are the relay's claim; this page did not check them."}{" "}
              {REMINDERS.advisoryCaps}
            </p>
          </section>

          {evaluation.decoded === null ? null : (
            <Disclosure summary="Decoded fields" defaultOpen>
              <DecodedView decoded={evaluation.decoded} covered={evaluation.covered} unbound={evaluation.unbound} />
            </Disclosure>
          )}

          <TagsPanel evaluation={evaluation} />

          {Object.keys(item.capabilities).length === 0 ? null : (
            <section aria-labelledby={`caps-${record.prepared_id}`}>
              <h4 id={`caps-${record.prepared_id}`}>What is proven</h4>
              <ul className="signing-caps">
                {Object.keys(item.capabilities).map((name) => {
                  // The relay's word is not a record. Only a fact recorded on this machine can say proven.
                  const fact = RELAY_CAPABILITY_FACT[name];
                  const proven = fact !== undefined && isProven(facts[fact]);
                  return (
                    <li key={name}>
                      <Badge tone={proven ? "ok" : "warn"}>{`${name}: ${proven ? "proven" : "unproven"}`}</Badge>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {item.warnings.length === 0 ? null : (
            <section aria-labelledby={`warn-${record.prepared_id}`}>
              <h4 id={`warn-${record.prepared_id}`}>Warnings from the relay</h4>
              <ul>
                {item.warnings.map((warning, index) => (
                  <li key={index}>
                    <UntrustedText value={sanitizeText("generic", warning).text} maxChars={600} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="signing-intent" aria-labelledby={`intent-${record.prepared_id}`}>
        <h4 id={`intent-${record.prepared_id}`}>The intent for PayBox request_wallet_sign</h4>
        {evaluation.intentJson === null ? (
          <p data-intent="withheld">Withheld: either a check failed or there is no intent that hashes to the digest, so there is nothing safe to hand to a signer.</p>
        ) : (
          <>
            <p>Pass this to request_wallet_sign unchanged, as its intent. Do not edit it. Your agent signs it with your PayBox credential; this page never signs or submits.</p>
            <pre className="signing-pre" tabIndex={0} aria-label="Exact intent for request_wallet_sign" data-intent="shown">
              {evaluation.intentJson}
            </pre>
          </>
        )}
      </section>

      <section className="signing-reminders" aria-labelledby={`remind-${record.prepared_id}`}>
        <h4 id={`remind-${record.prepared_id}`}>Before you approve in PayBox</h4>
        <ul>
          <li>{REMINDERS.dedicated}</li>
          <li>{REMINDERS.approvalMode}</li>
          <li>{REMINDERS.digestTag}</li>
        </ul>
      </section>

      <div className="signing-actions" role="group" aria-label="Actions">
        <Button onClick={() => void reject()} disabled={!canReject} busy={busy === "reject"}>
          Reject
        </Button>
        <Button variant="primary" onClick={() => void copyIntent()} disabled={!copy.enabled} busy={busy === "copy"} aria-describedby={copy.enabled ? undefined : copyReasonsId}>
          Copy intent
        </Button>
        <Button disabled aria-disabled="true" aria-describedby={signReasonsId} data-action="sign-s2">
          Sign with PayBox (S2)
        </Button>
      </div>
      <Reasons gate={copy} id={copyReasonsId} />
      <div className="signing-s2" data-s2="off">
        <p>Sign with PayBox from this page (path S2) is off in this build.</p>
        <Reasons gate={sign} id={signReasonsId} />
      </div>
      {copied === null ? null : <p role="status">{copied === "ok" ? "Copied. Paste it unchanged as the intent of request_wallet_sign." : "Could not copy. Select the text in the intent box and copy it yourself."}</p>}
      {notice === null ? null : <p role="status" className="signing-muted">{notice}</p>}

      {record.state === "ambiguous" ? (
        <Tile tone="danger" title="Ambiguous result: do not resend" heading="h4" role="alert" dataKind="ambiguous">
          <p>It is not known whether XO took this. Sending it again could do it twice. Check its status by hash instead; that is a read, not a send.</p>
          {reconcileTarget === null ? (
            <p>The record carries no hash to check.</p>
          ) : (
            <p>
              <Button onClick={() => void reconcile()} busy={busy === "reconcile"}>
                Check status by hash
              </Button>
            </p>
          )}
          {reconciled === null ? null : reconciled === "failed" ? (
            <p role="status">The status could not be read.</p>
          ) : (
            <p role="status">
              Status of <code className="signing-code">{reconciled.hash}</code>: <code>{reconciled.state}</code>
              {reconciled.detail === null ? null : (
                <>
                  {" "}
                  <UntrustedText value={sanitizeText("generic", reconciled.detail).text} maxChars={300} />
                </>
              )}
            </p>
          )}
        </Tile>
      ) : null}

      {record.result === null ? null : (
        <p className="signing-muted">
          Result recorded by the daemon:{" "}
          {record.result.user_op_hash === undefined ? null : <>user operation <code className="signing-code">{record.result.user_op_hash}</code> </>}
          {record.result.order_hash === undefined ? null : <>order <code className="signing-code">{record.result.order_hash}</code> </>}
          {record.result.tx_hash === undefined ? null : <>transaction <code className="signing-code">{record.result.tx_hash}</code> </>}
          {record.result.detail === undefined ? null : <UntrustedText value={sanitizeText("generic", record.result.detail).text} maxChars={300} />}
        </p>
      )}
    </article>
  );
}
