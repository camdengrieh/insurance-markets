// The Quotient settings dialog: the one place the Quotient switch lives (R8: OFF by default, the licence clause
// shown FIRST), with the spend meter, the "Ask Quotient" calls, their results and the free track record. It is the
// former Signals screen inside a Dialog, opened from the Quotient line of the Markets surface; there is no Signals
// route any more. Every rule the screen held still holds (signals.test.tsx runs the same component).

import { Dialog } from "../../ui";
import { SignalsView } from "./SignalsView";

export interface QuotientSettingsDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export const QUOTIENT_SETTINGS_TITLE = "Quotient settings";

export function QuotientSettingsDialog({ open, onClose }: QuotientSettingsDialogProps) {
  return (
    <Dialog open={open} title={QUOTIENT_SETTINGS_TITLE} size="wide" lede="Off by default. Read the licence clause first; results stay in this tab's memory and are never exported." onClose={onClose}>
      <SignalsView />
    </Dialog>
  );
}
