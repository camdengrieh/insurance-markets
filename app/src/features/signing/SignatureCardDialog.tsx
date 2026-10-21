import { Button, Dialog } from "../../ui";
import { SignatureCard, type SignatureCardProps } from "./SignatureCard";

// The Signature Card as a 760 px modal over the terminal dock (docs/design/cockpit-v2 Signing). Escape does not close
// it and the backdrop never does: a card is left by one of its own buttons, so a decision is always deliberate.
// Closing records nothing; Reject is the only decision the page can record. The card body is SignatureCard as is.

export interface SignatureCardDialogProps extends SignatureCardProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export const CARD_DIALOG_TITLE = "Signature card";
export const CARD_DIALOG_LEDE = "Read the card, then decide. Closing it records nothing; only Reject is recorded, and this page never signs.";

export function SignatureCardDialog({ open, onClose, ...card }: SignatureCardDialogProps) {
  return (
    <Dialog open={open} title={CARD_DIALOG_TITLE} lede={CARD_DIALOG_LEDE} onClose={onClose} dismissOnEscape={false} size="medium">
      <SignatureCard {...card} />
      <div className="ui-dialog-actions">
        <Button onClick={onClose} data-action="close-card">
          Close the card (no decision)
        </Button>
      </div>
    </Dialog>
  );
}
