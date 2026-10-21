import type { ReactNode } from "react";

import { Missing } from "../../ui";
import type { TokenChoice } from "./ActionPanels";
import { sideLabel, type SignCell } from "./ticket";

// The pieces of the one-line order ticket (docs/design/cockpit-v2 Market.dc.html): the segmented side-and-outcome
// toggle, the compact "What you sign" strip and the bar that holds them. The toggle only picks the outcome token;
// the side stays the form's own wire value (BUY or SELL), so a press here builds exactly the request the select did.

// A toggle needs a short fixed word per outcome ("Yes", "No", "Outcome 3"); a long list stays a select.
export const MAX_TOGGLE_CHOICES = 4;

export function canToggle(choices: readonly TokenChoice[] | undefined): choices is readonly TokenChoice[] {
  return choices !== undefined && choices.length > 0 && choices.length <= MAX_TOGGLE_CHOICES;
}

export function SideToggle({ choices, tokenId, side, onPick }: { readonly choices: readonly TokenChoice[]; readonly tokenId: string; readonly side: string; readonly onPick: (tokenId: string) => void }) {
  const verb = sideLabel(side);
  return (
    <div className="tr-toggle" role="group" aria-label="Side and outcome">
      {choices.map((choice) => (
        <button key={choice.tokenId} type="button" className="tr-toggle-button" data-outcome={choice.outcome ?? "label"} aria-pressed={choice.tokenId === tokenId} onClick={() => onPick(choice.tokenId)}>
          {`${verb} ${choice.short ?? choice.label}`}
        </button>
      ))}
    </div>
  );
}

// Four mono cells: domain, side · type, maker → taker, fee ceiling (in the caution colour, with words). A value the
// ticket cannot give yet is a dash with its reason read aloud; nothing is filled in as an example.
export function SignStrip({ cells }: { readonly cells: readonly SignCell[] }) {
  return (
    <div className="tr-sign" role="group" aria-label="What you sign">
      <dl>
        {cells.map((cell) => (
          <div key={cell.label} data-caution={cell.caution === true ? "true" : undefined}>
            <dt>{cell.label}</dt>
            <dd>
              {cell.value === null ? <Missing label={cell.missing ?? "not known yet"} /> : <span className="tr-sign-value">{cell.value}</span>}
              {cell.note === undefined ? null : <span className="tr-sign-note">{cell.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// The bar: controls on the left, the Prepare action pushed to the right; it wraps on a narrow screen.
export function OrderBar({ children, action }: { readonly children: ReactNode; readonly action: ReactNode }) {
  return (
    <div className="tr-bar">
      {children}
      <div className="tr-bar-action">{action}</div>
    </div>
  );
}
