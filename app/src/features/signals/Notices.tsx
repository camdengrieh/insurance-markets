// What a call that did not return rows looks like. Every text here is written by this project or by the Quotient
// client (fixed strings); nothing is copied from a response. A 402 is "payment required", and this page never pays.

import { Badge, Button, Tile } from "../../ui";
import type { QuotientResult, RowRefusal, RowSet } from "./quotient";
import { usdLabel } from "./figures";
import { refusalCodeText } from "./words";

const MAX_LISTED = 20;

const MISMATCH_FIELD_TEXT: Readonly<Record<string, string>> = Object.freeze({
  x402Version: "payment protocol version",
  scheme: "payment scheme",
  network: "network",
  asset: "token",
  payTo: "payee",
  maxTimeoutSeconds: "time limit",
  amount: "amount",
  resource: "resource",
  accepts: "payment options",
  challenge_inconsistent: "the two copies of the request",
});

export function RejectedRows({ rejected }: { readonly rejected: readonly RowRefusal[] }) {
  if (rejected.length === 0) return null;
  return (
    <details className="signals-rejected" data-rejected={rejected.length}>
      <summary>
        {rejected.length} row{rejected.length === 1 ? " was" : "s were"} refused and are not shown
      </summary>
      <p className="signals-note">A row with a value this client does not know, a number out of range or two numbers that disagree is refused whole. Refused is not the same as zero.</p>
      <ul>
        {rejected.slice(0, MAX_LISTED).map((item, index) => (
          <li key={`${item.field}:${index}`}>
            <code>{item.field}</code>: {refusalCodeText(item.code)}
          </li>
        ))}
      </ul>
      {rejected.length > MAX_LISTED ? <p className="signals-note">{rejected.length - MAX_LISTED} more not listed.</p> : null}
    </details>
  );
}

export interface ResultNoticeProps {
  readonly result: Exclude<QuotientResult<RowSet>, { readonly status: "ok" }>;
  readonly onResetHalt: () => void;
}

export function ResultNotice({ result, onResetHalt }: ResultNoticeProps) {
  switch (result.status) {
    case "payment_required":
      return (
        <Tile tone="info" title="Payment required" heading="h3" dataKind="signals-result" dataCode="payment_required">
          <p>{result.text}</p>
          <p>
            Quotient's request asks for <strong>{usdLabel(result.verdict.amountUsd)}</strong> in {result.verdict.settlementAsset} (the table price is {usdLabel(result.verdict.tableUsd)}).
            {result.verdict.priceChanged ? " The price differs from the table, so check it before you pay anywhere." : ""} The payee, token, network and time limit match what this app pins.
          </p>
          <p>Nothing was paid and nothing will be paid from this page.</p>
        </Tile>
      );
    case "hard_stop":
      return (
        <Tile
          tone="danger"
          title="Hard stop: the payment request does not match"
          heading="h3"
          role="alert"
          dataKind="signals-result"
          dataCode="hard_stop"
          actions={<Button onClick={onResetHalt}>Reset the stop</Button>}
        >
          <p>{result.text}</p>
          <ul>
            {result.verdict.mismatches.map((mismatch) => (
              <li key={`${mismatch.field}:${mismatch.detail}`}>
                <Badge tone="danger">{MISMATCH_FIELD_TEXT[mismatch.field] ?? "a field"}</Badge> {mismatch.detail}
              </li>
            ))}
          </ul>
          <p>Reset only if you have looked into why. A wrong payee or an inflated price is how a paid API is abused.</p>
        </Tile>
      );
    case "refused":
      return (
        <Tile tone="warn" title="Not requested" heading="h3" dataKind="signals-result" dataCode={result.reason}>
          <p>{result.text}</p>
        </Tile>
      );
    case "failed_closed":
      return (
        <Tile tone="danger" title="Failed closed" heading="h3" role="alert" dataKind="signals-result" dataCode={result.reason}>
          <p>{result.text}</p>
          <RejectedRows rejected={result.rejected} />
        </Tile>
      );
    case "unavailable":
      return (
        <Tile tone="warn" title="Quotient could not answer" heading="h3" dataKind="signals-result" dataCode={result.reason}>
          <p>{result.text}</p>
          {result.retryAfterMs === null ? null : <p>Wait about {Math.max(1, Math.ceil(result.retryAfterMs / 1000))} seconds before trying again.</p>}
        </Tile>
      );
  }
}
