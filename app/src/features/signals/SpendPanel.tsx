// The spend meter (M3 "spend meter"). It counts what a keyed call is charged by the price table; Quotient's own
// ledger is authoritative and the credit on the key is the hard cap. It lives in this tab's memory only.

import { Field, Tile } from "../../ui";
import type { SpendSnapshot } from "../../venues/quotient";
import { usdLabel } from "./figures";

// The user's own daily limit can only go down from the client's budget.
export const OWN_LIMIT_CHOICES: readonly string[] = Object.freeze(["2", "1", "0.5", "0.25", "0.1", "0.05"]);

export interface SpendPanelProps {
  readonly spend: SpendSnapshot | null;
  readonly keyed: boolean;
  readonly ownLimit: string;
  readonly onOwnLimit: (value: string) => void;
}

export function SpendPanel({ spend, keyed, ownLimit, onOwnLimit }: SpendPanelProps) {
  return (
    <Tile tone="neutral" title="Spend meter" heading="h2" role="note" dataKind="signals-spend" dataCode={keyed ? "keyed" : "no-key"}>
      {spend === null ? (
        <p data-spend="none">{keyed ? "Nothing has been charged in this tab yet." : "With no key nothing is charged: a paid request only shows its price."}</p>
      ) : (
        <dl className="signals-facts" data-spend="counted">
          <div>
            <dt>This tab (estimate)</dt>
            <dd>{usdLabel(spend.sessionUsd)}</dd>
          </div>
          <div>
            <dt>Today of the client budget</dt>
            <dd>
              {usdLabel(spend.todayUsd)} of {usdLabel(spend.dailyBudgetUsd)}
            </dd>
          </div>
          <div>
            <dt>Per-call limit</dt>
            <dd>{usdLabel(spend.perCallLimitUsd)}</dd>
          </div>
          <div>
            <dt>Paid calls</dt>
            <dd>{spend.paidCalls}</dd>
          </div>
        </dl>
      )}
      <Field label="My own limit for today (USD)">
        {(id) => (
          <select id={id} className="ui-select" value={ownLimit} onChange={(event) => onOwnLimit(event.currentTarget.value)}>
            {OWN_LIMIT_CHOICES.map((value) => (
              <option key={value} value={value}>
                {usdLabel(value)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <p className="signals-note">
        An estimate counted from the price table, kept in this tab's memory only, so a reload resets it. Quotient's own ledger is the record, and the credit left on your key is the hard cap. No call is made on a timer: every
        paid call is a press.
      </p>
    </Tile>
  );
}
