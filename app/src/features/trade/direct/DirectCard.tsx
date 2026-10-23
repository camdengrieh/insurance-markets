import type { ReactNode } from "react";

import { Badge, Button, Dialog } from "../../../ui";
import type { CardField, SignatureCardModel } from "./types";
import "../../signing/signing.css";

// The direct path's Signature Card (the pattern of features/signing/SignatureCard.tsx): before the wallet is asked
// anything, every field it will sign, in its order, with the exact value and fixed words that decode it; the fields that
// travel beside the signature, marked as not signed; the digest tag to compare with the wallet's own screen; and the most
// collateral that can leave the account. The card is built by this page from the order it made itself, so every value
// is app text or a number; nothing a venue or a market creator wrote is on it.

const GROUP_TEXT: Readonly<Record<CardField["group"], string>> = Object.freeze({
  domain: "Domain (who the signature is for)",
  message: "Message (signed)",
  contents: "The order inside the wrapper (signed)",
  wire: "Sent beside the signature (not signed)",
});

const GROUPS: readonly CardField["group"][] = ["domain", "message", "contents", "wire"];

function FieldTable({ group, fields }: { readonly group: CardField["group"]; readonly fields: readonly CardField[] }) {
  if (fields.length === 0) return null;
  return (
    <table className="signing-table" data-group={group}>
      <caption>{GROUP_TEXT[group]}</caption>
      <tbody>
        {fields.map((field) => (
          <tr key={`${group}-${field.name}`}>
            <th scope="row">{field.name}</th>
            <td>
              <code className="signing-code">{field.value}</code>
            </td>
            <td className="signing-muted">{field.meaning ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DirectCardBody({ card }: { readonly card: SignatureCardModel }) {
  return (
    <div className="signing-card" data-kind="direct-card">
      <ol className="signing-lines" aria-label="What this does">
        {card.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p>
        <strong>Most that can leave the account: </strong>
        {card.worstCase === null ? "nothing in collateral" : card.worstCase}
      </p>
      {card.digest === null || card.digestTag === null ? (
        <p className="tr-note">A transaction: compare the call data below with what your wallet shows before you approve it.</p>
      ) : (
        <p>
          <strong>Digest tag </strong>
          <code className="signing-tag" data-digest-tag="true">
            {card.digestTag}
          </code>{" "}
          <Badge tone="neutral">first 16 hex digits of {card.digest.length === 66 ? "the EIP-712 digest" : "the digest"}</Badge>
          <span className="ui-visually-hidden"> Full digest {card.digest}</span>
        </p>
      )}
      {GROUPS.map((group) => (
        <FieldTable key={group} group={group} fields={card.fields.filter((field) => field.group === group)} />
      ))}
    </div>
  );
}

export interface DirectCardDialogProps {
  readonly open: boolean;
  readonly card: SignatureCardModel | null;
  // Fixed words for the one action ("Sign in your wallet and send").
  readonly actionLabel: string;
  readonly busy: boolean;
  readonly onAction: () => void;
  readonly onClose: () => void;
  // A note under the card (a freshness reminder, a refusal from the last try).
  readonly note?: ReactNode;
}

export const DIRECT_CARD_LEDE = "Read every field, then decide. Your wallet shows the same request; nothing is signed or sent until you approve it there.";

export function DirectCardDialog({ open, card, actionLabel, busy, onAction, onClose, note }: DirectCardDialogProps) {
  if (card === null) return null;
  return (
    <Dialog open={open} title={card.title} lede={DIRECT_CARD_LEDE} onClose={onClose} dismissOnEscape={false} size="medium">
      <DirectCardBody card={card} />
      {note}
      <div className="ui-dialog-actions">
        <Button variant="primary" busy={busy} disabled={busy} onClick={onAction} data-action="direct-sign">
          {actionLabel}
        </Button>
        <Button disabled={busy} onClick={onClose} data-action="direct-close">
          Close without signing
        </Button>
      </div>
    </Dialog>
  );
}
