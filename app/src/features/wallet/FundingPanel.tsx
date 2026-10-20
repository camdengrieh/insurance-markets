import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, EmptyTile, ErrorTile, Field, Tile } from "../../ui";
import { useAccountMap } from "./AccountMapPanel";
import { readFundingReads } from "./funding-reads";
import { FUNDING_FACTS, planFunding, type DecodedStep } from "./funding-view";
import { useWalletServices } from "./services";

// Decoded funding steps, DISPLAY ONLY (docs/dapp-design.md 4.5 Wallet and 7.2 M2). Nothing here signs or sends: the
// two Base calls are built with the plugin's own calldata code, which derives the recipient from the owner, and
// decoded again into plain lines with the full addresses. The destination is the derived XO account and cannot be
// edited. While the account is not a proven deposit target the screen says "do not send".

function Step({ step }: { readonly step: DecodedStep }) {
  return (
    <li className="wl-step" data-step={step.kind}>
      <h3>{step.title}</h3>
      <p className="pf-note">
        On chain <code>{step.chain}</code>. Decoded from the call data.
      </p>
      <dl className="wl-facts">
        {step.lines.map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export function FundingPanel({ owner, chainIds }: { readonly owner: string; readonly chainIds: readonly number[] }) {
  const services = useWalletServices();
  const [amount, setAmount] = useState("");
  const map = useAccountMap(owner, chainIds);
  const mapped = map.data?.ok === true ? map.data.map : null;
  const reads = useQuery({
    queryKey: ["funding-reads", services.mode, owner, mapped?.account ?? ""],
    queryFn: () => readFundingReads(services.deps, owner, (mapped as NonNullable<typeof mapped>).account),
    enabled: mapped !== null,
  });
  const xoRow = mapped?.rows.find((row) => row.chain.isXo) ?? null;
  const plan = planFunding({
    owner,
    amountText: amount,
    baseUsdcBalance: reads.data?.baseUsdcBalance ?? null,
    allowance: reads.data?.allowance ?? null,
    xoBalance: reads.data?.xoBalance ?? null,
    // No baseline is kept by this screen, so it can never claim a transfer arrived.
    xoBalanceBefore: null,
    deposit: xoRow?.deposit ?? null,
  });

  return (
    <div className="ui-stack" data-testid="funding">
      <Tile tone="warn" title="Display only" role="note" heading="h3" dataKind="display-only">
        <p>
          This screen cannot sign or send anything. It shows what two Base transactions would do, so you can compare them with what your PayBox agent proposes. Sending is done by your agent, one
          call at a time.
        </p>
      </Tile>
      <Field label="Amount of USDC to move from Base to XO">
        {(id) => <input id={id} className="ui-input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} autoComplete="off" />}
      </Field>
      {amount.trim() === "" ? (
        <EmptyTile title="Enter an amount" heading="h3">
          <p>No steps are shown until you type the amount of USDC to move. Nothing is pre-filled.</p>
        </EmptyTile>
      ) : !plan.ok ? (
        <ErrorTile code="UNKNOWN" title="These steps cannot be shown" message={plan.message} heading="h3" />
      ) : (
        <>
          {plan.blockers.length === 0 ? null : (
            <Tile tone="danger" title="Do not send yet" heading="h3" role="alert" dataKind="blocked">
              <ul>
                {plan.blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </Tile>
          )}
          <p>
            The destination is fixed to your derived XO account <code data-testid="funding-destination">{plan.account}</code>, computed from the owner <code>{plan.owner}</code>. It cannot be changed here.
          </p>
          <ol className="wl-steps">
            {plan.steps.map((step) => (
              <Step key={step.kind} step={step} />
            ))}
          </ol>
          <p data-testid="funding-next">
            {plan.next === null ? (
              <>
                <Badge tone="warn">next step not known</Badge> The Base balance or the allowance could not be read, so the screen does not suggest which step comes first.
              </>
            ) : (
              <>
                <Badge tone={plan.next.step === "blocked" ? "danger" : "info"}>{plan.next.step}</Badge> {plan.next.detail}
              </>
            )}
          </p>
          <p className="pf-note">
            Pinned: token <code>{FUNDING_FACTS.token}</code>, router <code>{FUNDING_FACTS.router}</code>, destination domain {FUNDING_FACTS.destinationDomain}, chain {FUNDING_FACTS.chain}. Every call
            has a native value of 0.
          </p>
        </>
      )}
    </div>
  );
}
