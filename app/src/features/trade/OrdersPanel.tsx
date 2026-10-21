import { useState } from "react";

import type { CapabilityFacts } from "../../core/capabilities";
import { Button, DataTable, Disclosure, Missing, type Column } from "../../ui";
import { ReadFailureTile } from "./AccountPanel";
import { GateNote, Mono, SelectableBlock } from "./components";
import type { PanelContext } from "./context";
import { gateForCancel } from "./facts";
import { cancelCall } from "./handoff";
import { useOrders } from "./hooks";
import type { OpenOrder } from "./tools";

// Open orders, read from XO through the plugin, and the call an agent makes to cancel one. Cancelling is the agent's
// act (a submit-class tool with an open ARM window): this page offers the exact call as text and sends nothing.
// A cancel asks XO to drop the order. It does not invalidate the signed order on chain; only its expiry, or revoking
// trading, does that.

function orderColumns(onPick: (hash: string) => void, picked: string | null, canHandOff: boolean): readonly Column<OpenOrder>[] {
  return [
    { key: "side", header: "Side", render: (row) => row.side, rowHeader: true },
    { key: "price", header: "Price", render: (row) => row.price, align: "end" },
    { key: "remaining", header: "Shares left", render: (row) => `${row.remaining_shares} of ${row.original_shares}`, align: "end" },
    { key: "token", header: "Outcome token", render: (row) => <Mono>{row.token_id}</Mono> },
    { key: "hash", header: "Order hash", render: (row) => <Mono>{row.order_hash}</Mono> },
    { key: "expires", header: "Expires", render: (row) => (row.expires_at === null ? <Missing label="not given" /> : row.expires_at) },
    {
      key: "act",
      header: "Cancel",
      render: (row) =>
        canHandOff ? (
          <Button onClick={() => onPick(row.order_hash)} aria-pressed={picked === row.order_hash}>
            Show the cancel call
          </Button>
        ) : (
          <span>unavailable</span>
        ),
    },
  ];
}

export function OrdersPanel({ ctx, heading = "h2" }: { readonly ctx: PanelContext; readonly heading?: "h2" | "h4" }) {
  const Heading = heading;
  const { state, refresh } = useOrders(ctx.services, ctx.owner, ctx.account !== null);
  const [picked, setPicked] = useState<string | null>(null);
  const cancel = gateForCancel(ctx.gateInput);
  const facts: CapabilityFacts = ctx.facts;
  const owner = ctx.owner;
  return (
    <section className="tr-section" aria-labelledby="tr-orders-h" data-testid="orders">
      <Heading id="tr-orders-h">Open orders</Heading>
      {owner === null || ctx.account === null ? (
        <p>Read an account first to list its open orders.</p>
      ) : state.phase !== "done" ? (
        <p role="status">Reading open orders through the Cockpit.</p>
      ) : !state.value.ok ? (
        <ReadFailureTile failure={state.value} what="Open orders could not be read" heading={heading === "h2" ? "h3" : "h4"} />
      ) : (
        <div className="ui-stack">
          <DataTable
            caption="Open orders on this account"
            columns={orderColumns(setPicked, picked, cancel.canHandOff)}
            rows={state.value.data.orders}
            rowKey={(row) => row.order_hash}
            empty={<p>No open orders were listed for this account. That is what XO answered, not a guess.</p>}
          />
          {state.value.data.truncated ? <p className="tr-note">More orders exist than are listed ({state.value.data.total} in all).</p> : null}
          {cancel.canHandOff ? null : <GateNote gate={cancel} facts={facts} />}
          {picked === null || !cancel.canHandOff || !state.value.data.orders.some((row) => row.order_hash === picked) ? null : (
            <div className="tr-handoff">
              <p>Ask your agent to run this call. It needs an agent token started with the submit scope and an open ARM window, and this page has neither.</p>
              <SelectableBlock label="The cancel call" text={cancelCall(owner, picked)} />
              <p className="tr-note">Cancelling asks XO to drop the order. The signed order stays valid on chain until it expires; revoking trading is the on-chain stop.</p>
            </div>
          )}
          <Disclosure summary="About this list">
            <p>
              Read from XO by the plugin and checked against the schema on this page. A result of &quot;none&quot; is XO&apos;s answer. If the list could not be read, that is shown above in its place, never as an empty list.
            </p>
          </Disclosure>
        </div>
      )}
      <div>
        <Button onClick={refresh} disabled={owner === null || ctx.account === null}>
          Read open orders again
        </Button>
      </div>
    </section>
  );
}
