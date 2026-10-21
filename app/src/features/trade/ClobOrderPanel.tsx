import { useMemo, useState } from "react";

import type { ClobVenue } from "@shared/clob/venues";

import { Badge, Button, Field, Tile, UnprovenTile, formatAge, useAnnounce, venueName } from "../../ui";
import { CLOB_FEE_CEILING_TEXT, CLOB_SIZE_DECIMALS, POLYMARKET_GTD_MIN_TTL_S, buildClobTicket, clobOverOrderCap, expectedClobQuote, formatClobUsd, signedFieldsPreview, tifsFor, type ClobMarketFacts } from "./clob-ticket";
import { GateNote, KeyValues, Mono, ResultView, Working } from "./components";
import type { PanelContext } from "./context";
import { FACT_LABELS, gateFor, type Gate, type TradeAction } from "./facts";
import { usePrepare } from "./hooks";
import { prepareClobOrder } from "./prepare";
import type { TokenChoice } from "./ActionPanels";

// The order ticket for a Polymarket or Limitless market: the venue counterpart of the XO OrderPanel (ActionPanels.tsx),
// which is left as it is. The maker is the owner wallet itself. The ticket shows the venue's tick and minimum size
// as the market record carries them, the worst case with the policy fee ceiling, the fields that will be signed
// ("what you sign": the typed data IS the order on these venues), and the provenance of the facts it used. It
// prepares through the clob_order tool (step prepare) and signs and sends nothing.

const ADDRESS_NEEDED = "Choose the owner address first.";

export interface ClobOrderPanelProps {
  readonly ctx: PanelContext;
  readonly facts: ClobMarketFacts;
  readonly tokenChoices?: readonly TokenChoice[];
  readonly heading?: "h2" | "h4";
}

function actionFor(venue: ClobVenue): TradeAction {
  return venue === "polymarket" ? "polymarket_order" : "limitless_order";
}

export function ClobOrderPanel({ ctx, facts, tokenChoices, heading = "h2" }: ClobOrderPanelProps) {
  const Heading = heading;
  const announce = useAnnounce();
  const venue = facts.venue;
  const name = venueName(venue);
  const action = actionFor(venue);
  const tifs = tifsFor(venue);
  const [form, setForm] = useState({ tokenId: tokenChoices?.[0]?.tokenId ?? "", side: "BUY", price: "", shares: "", tif: "GTC", ttlS: "", postOnly: false });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((current) => ({ ...current, [key]: value }));
  const built = useMemo(() => buildClobTicket(form, facts), [form, facts]);
  const touched = form.price !== "" || form.shares !== "";
  const owner = ctx.owner;
  const ticket = built.ok ? built.ticket : null;
  const over = ticket === null ? null : clobOverOrderCap(ticket, ctx.account?.caps.max_order_usd ?? null);
  const want = ticket === null ? null : expectedClobQuote(ticket);
  const gate: Gate = gateFor(action, ctx.gateInput);
  const { result, running, run } = usePrepare(ctx.refreshAccount);
  const blocked = owner === null ? ADDRESS_NEEDED : ticket === null ? "Complete the ticket first." : over === true ? "This order counts more than the per-order cap allows. Lower the size or price." : null;
  const usable = gate.canPrepare && blocked === null;
  const signed = ticket === null ? [] : signedFieldsPreview(ticket, facts, owner);
  const age = formatAge(facts.fetchedAtMs, ctx.services.nowMs());
  return (
    <section className="tr-section" aria-labelledby="tr-clob-order-h" data-testid="clob-order" data-venue={venue}>
      <Heading id="tr-clob-order-h">Order ticket</Heading>
      <p>
        A {name} order is signed by your wallet itself (an EOA order, signature type 0): there is no smart-account wrapper, so the typed data PayBox shows is the order, field by field. This page prepares it through the Cockpit and never signs or sends. The numbers
        below are worked out here with the plugin&apos;s own rules and compared, digit for digit, with what the relay quotes.
      </p>
      <UnprovenTile capability={`${name} order path`} state={ctx.facts[action === "polymarket_order" ? "polymarket_first_order_accepted" : "limitless_first_order_accepted"]} heading={heading === "h4" ? "h4" : "h3"}>
        No live test has recorded an order on {name} from this build. Until the operator records one, nothing is handed to an agent: the ticket and the prepare path are shown so they can be checked, never as a green light.
      </UnprovenTile>
      <div className="tr-grid">
        {tokenChoices === undefined || tokenChoices.length === 0 ? (
          <Field label="Outcome token id">{(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" spellCheck={false} value={form.tokenId} onChange={(event) => set("tokenId", event.target.value.trim())} />}</Field>
        ) : (
          <Field label="Outcome">
            {(id) => (
              <select id={id} className="ui-select" value={form.tokenId} onChange={(event) => set("tokenId", event.target.value)}>
                {tokenChoices.map((choice) => (
                  <option key={choice.tokenId} value={choice.tokenId}>
                    {choice.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Side">
          {(id) => (
            <select id={id} className="ui-select" value={form.side} onChange={(event) => set("side", event.target.value)}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          )}
        </Field>
        <Field label={`Price per share (on the ${facts.tick} tick)`}>{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={form.price} onChange={(event) => set("price", event.target.value.trim())} />}</Field>
        <Field label={`Shares (at most ${CLOB_SIZE_DECIMALS} decimals${facts.minSize === "0" ? "" : `, at least ${facts.minSize}`})`}>{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={form.shares} onChange={(event) => set("shares", event.target.value.trim())} />}</Field>
        <Field label="Type">
          {(id) => (
            <select id={id} className="ui-select" value={form.tif} onChange={(event) => set("tif", event.target.value)}>
              {tifs.map((tif) => (
                <option key={tif} value={tif}>
                  {tif}
                </option>
              ))}
            </select>
          )}
        </Field>
        {venue === "polymarket" ? (
          <Field label={`Life in seconds (GTD only, ${POLYMARKET_GTD_MIN_TTL_S} or more; empty = the relay's default)`}>{(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" value={form.ttlS} onChange={(event) => set("ttlS", event.target.value.trim())} />}</Field>
        ) : null}
      </div>
      <label className="tr-check">
        <input type="checkbox" checked={form.postOnly} onChange={(event) => set("postOnly", event.target.checked)} /> Post-only (GTC or GTD orders only)
      </label>
      {!built.ok && touched ? (
        <ul className="tr-issues" aria-label="Problems with the ticket">
          {built.issues.map((issue) => (
            <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {ticket === null || want === null ? null : (
        <Tile tone="info" title="What this ticket would cost, at most" heading={heading === "h4" ? "h4" : "h3"} dataKind="ticket" dataCode={venue} role="status">
          <KeyValues
            rows={[
              { label: "Order", value: `${ticket.side} ${ticket.shares} shares at ${ticket.price}` },
              { label: "Principal", value: `${formatClobUsd(ticket.principalAtomic)} USD` },
              ticket.maxOutlayAtomic === null ? { label: "Cash out", value: "none: a SELL moves no cash out" } : { label: `Worst-case cash out (principal plus the ${CLOB_FEE_CEILING_TEXT})`, value: `${want.maxOutlayUsd} USD` },
              ...(ticket.minProceedsAtomic === null ? [] : [{ label: "Worst-case proceeds after the fee ceiling", value: `${formatClobUsd(ticket.minProceedsAtomic)} USD` }]),
              { label: "Counted against the caps", value: `${want.reservedUsd} USD` },
              { label: "Tick and minimum size", value: `${facts.tick}; ${facts.minSize === "0" ? "no minimum stated" : `${facts.minSize} shares`}` },
            ]}
          />
          <p className="tr-note">The fee is a policy ceiling, not the venue&apos;s quote; no net-of-fee number is shown. {ticket.tif === "GTC" ? "A GTC order carries no signed expiry: it rests until it is cancelled through the venue, and this build cannot cancel it." : ticket.tif === "GTD" ? "The expiry is a wire field the venue enforces; it is not in the signed order." : "A fill-or-kill type fills at once or not at all; no expiry is signed."}</p>
          {over === true ? <p role="alert">This is above the per-order cap of {ctx.account?.caps.max_order_usd} USD.</p> : over === null ? <p className="tr-note">The per-order cap is not known until the account has been read.</p> : null}
          <p className="tr-note" data-provenance="ticket">
            Tick and minimum size as the market record carries them, read from {name} ({age}). The relay reads them again at prepare and refuses an order that differs.
          </p>
        </Tile>
      )}
      {signed.length === 0 ? null : (
        <Tile tone="neutral" title="What you sign" heading={heading === "h4" ? "h4" : "h3"} dataKind="what-you-sign" dataCode={venue}>
          <p className="tr-note">The EIP-712 Order struct, as the relay will build it. Every value below is visible in the signing window; the ones marked are chosen by the relay when it prepares.</p>
          <KeyValues rows={signed.map((line) => ({ label: line.label, value: line.fromRelay === true ? <span>{line.value} <Badge tone="neutral">set by the relay</Badge></span> : /^0x[0-9a-fA-F]{40}$/.test(line.value) || /^[0-9]+$/.test(line.value) ? <Mono>{line.value}</Mono> : line.value }))} />
        </Tile>
      )}
      <div className="ui-stack">
        <GateNote gate={gate} facts={ctx.facts} />
        {gate.unprovenRequired.length === 0 ? null : <p className="tr-note">{gate.unprovenRequired.map((id) => FACT_LABELS[id]).join("; ")}</p>}
        {blocked === null ? null : <p role="note">{blocked}</p>}
        <div className="tr-actions">
          <Button
            variant="primary"
            disabled={!usable || running}
            busy={running}
            onClick={() => {
              if (owner === null || ticket === null) return;
              announce(`Prepare this ${name} order: asking the Cockpit to prepare it`);
              run((signal) => prepareClobOrder({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner, ticket }, signal));
            }}
          >
            Prepare this {name} order
          </Button>
          <Working running={running} />
          {gate.canPrepare ? null : <Badge tone="neutral">unavailable</Badge>}
        </div>
        {result === null ? null : <ResultView result={result} facts={ctx.facts} gate={gate} />}
      </div>
    </section>
  );
}
