import { useMemo, useState } from "react";

import type { ClobVenue } from "@shared/clob/venues";

import { Badge, Button, Disclosure, Field, Num, Tile, UnprovenTile, formatAge, useAnnounce, venueName } from "../../ui";
import { CompactPrepare, type PanelLayout } from "./ActionPanels";
import { CLOB_FEE_CEILING_TEXT, CLOB_SIZE_DECIMALS, CLOB_TICKET_SIDES, POLYMARKET_GTD_MIN_TTL_S, buildClobTicket, clobOverOrderCap, clobSignCells, expectedClobQuote, formatClobUsd, signedFieldsPreview, tifsFor, type ClobMarketFacts } from "./clob-ticket";
import { GateNote, KeyValues, Mono, ResultView, Working } from "./components";
import type { PanelContext } from "./context";
import { FACT_LABELS, gateFor, type Gate, type TradeAction } from "./facts";
import { usePrepare } from "./hooks";
import { prepareClobOrder } from "./prepare";
import type { TokenChoice } from "./ActionPanels";
import { SideToggle, SignStrip, canToggle } from "./OrderBar";
import { sideLabel, tifLabel } from "./ticket";

// The order ticket for a Polymarket or Limitless market: the venue counterpart of the XO OrderPanel (ActionPanels.tsx),
// which is left as it is. On Limitless the maker is the owner wallet itself. On Polymarket the relay reads, at prepare,
// whether the owner's Deposit Wallet is deployed on Polygon: if so it is the maker (signature type 3), otherwise the
// owner wallet is (type 0). The page never assumes either; the prepared item says which, and vet.ts checks it. The ticket shows the venue's tick and minimum size
// as the market record carries them, the worst case with the policy fee ceiling, the fields that will be signed
// ("what you sign": the typed data IS the order on these venues), and the provenance of the facts it used. It
// prepares through the clob_order tool (step prepare) and signs and sends nothing.

const ADDRESS_NEEDED = "Choose the owner address first.";

export interface ClobOrderPanelProps {
  readonly ctx: PanelContext;
  readonly facts: ClobMarketFacts;
  readonly tokenChoices?: readonly TokenChoice[];
  readonly heading?: "h2" | "h4";
  // "compact": the market modal's one-line bar with the rest under a disclosure. "full": the stacked form.
  readonly layout?: PanelLayout;
}

function actionFor(venue: ClobVenue): TradeAction {
  return venue === "polymarket" ? "polymarket_order" : "limitless_order";
}

export function ClobOrderPanel({ ctx, facts, tokenChoices, heading = "h2", layout = "full" }: ClobOrderPanelProps) {
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
  const tile = heading === "h4" ? "h4" : "h3";
  const intro =
    venue === "polymarket" ? (
      <p>
        A Polymarket order is signed by your wallet. Which account makes it is read from Polygon when the order is prepared: your Polymarket Deposit Wallet (the default account for Polymarket accounts deployed since 2026-05-04) when one is deployed and owned by your wallet, signature type 3, and PayBox
        then shows a TypedDataSign wrapper with the order nested in it; otherwise your wallet itself, signature type 0, and PayBox shows the order field by field. This page prepares it through the Cockpit and never signs or sends. The numbers below are worked out
        here with the plugin&apos;s own rules and compared, digit for digit, with what the relay quotes.
      </p>
    ) : (
      <p>
        A {name} order is signed by your wallet itself (an EOA order, signature type 0): there is no smart-account wrapper, so the typed data PayBox shows is the order, field by field. This page prepares it through the Cockpit and never signs or sends. The
        numbers below are worked out here with the plugin&apos;s own rules and compared, digit for digit, with what the relay quotes.
      </p>
    );
  const unproven = (
    <UnprovenTile capability={`${name} order path`} state={ctx.facts[action === "polymarket_order" ? "polymarket_first_order_accepted" : "limitless_first_order_accepted"]} heading={tile}>
      No live test has recorded an order on {name} from this build. Until the operator records one, nothing is handed to an agent: the ticket and the prepare path are shown so they can be checked, never as a green light.
    </UnprovenTile>
  );
  const tokenField =
    tokenChoices === undefined || tokenChoices.length === 0 ? (
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
    );
  const sideField = (
    <Field label="Side">
      {(id) => (
        <select id={id} className="ui-select" value={form.side} onChange={(event) => set("side", event.target.value)}>
          {CLOB_TICKET_SIDES.map((side) => (
            <option key={side} value={side}>
              {sideLabel(side)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
  const typeField = (
    <Field label="Type">
      {(id) => (
        <select id={id} className="ui-select" value={form.tif} onChange={(event) => set("tif", event.target.value)}>
          {tifs.map((tif) => (
            <option key={tif} value={tif}>
              {tifLabel(tif)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
  const lifeField =
    venue === "polymarket" ? (
      <Field label={`Life in seconds (GTD only, ${POLYMARKET_GTD_MIN_TTL_S} or more; empty = the relay's default)`}>{(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" value={form.ttlS} onChange={(event) => set("ttlS", event.target.value.trim())} />}</Field>
    ) : null;
  const postOnly = (
    <label className="tr-check">
      <input type="checkbox" checked={form.postOnly} onChange={(event) => set("postOnly", event.target.checked)} /> Post-only (GTC or GTD orders only)
    </label>
  );
  const issues =
    !built.ok && touched ? (
      <ul className="tr-issues" aria-label="Problems with the ticket">
        {built.issues.map((issue) => (
          <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
        ))}
      </ul>
    ) : null;
  const cost =
    ticket === null || want === null ? null : (
      <Tile tone="info" title="What this ticket would cost, at most" heading={tile} dataKind="ticket" dataCode={venue} role="status">
        <KeyValues
          rows={[
            { label: "Order", value: `${sideLabel(ticket.side)} ${ticket.shares} shares at ${ticket.price}` },
            { label: "Principal", value: `${formatClobUsd(ticket.principalAtomic)} USD` },
            ticket.maxOutlayAtomic === null ? { label: "Cash out", value: "none: a sell moves no cash out" } : { label: `Worst-case cash out (principal plus the ${CLOB_FEE_CEILING_TEXT})`, value: `${want.maxOutlayUsd} USD` },
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
    );
  const everyField =
    signed.length === 0 ? null : (
      <Tile tone="neutral" title="What you sign" heading={tile} dataKind="what-you-sign" dataCode={venue}>
        <p className="tr-note">The EIP-712 Order struct, as the relay will build it. Every value below is visible in the signing window; the ones marked are chosen by the relay when it prepares{venue === "polymarket" ? ", including which account is the maker" : ""}.</p>
        <KeyValues rows={signed.map((line) => ({ label: line.label, value: line.fromRelay === true ? <span>{line.value} <Badge tone="neutral">set by the relay</Badge></span> : /^0x[0-9a-fA-F]{40}$/.test(line.value) || /^[0-9]+$/.test(line.value) ? <Mono>{line.value}</Mono> : line.value }))} />
      </Tile>
    );
  const unprovenRequired = gate.unprovenRequired.length === 0 ? null : <p className="tr-note">{gate.unprovenRequired.map((id) => FACT_LABELS[id]).join("; ")}</p>;
  const start = (signal: AbortSignal) => prepareClobOrder({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner: owner as string, ticket: ticket as NonNullable<typeof ticket> }, signal);

  if (layout === "compact") {
    return (
      <section className="tr-section" aria-labelledby="tr-clob-order-h" data-testid="clob-order" data-venue={venue} data-layout="compact">
        <Heading id="tr-clob-order-h" className="ui-visually-hidden">
          Order ticket
        </Heading>
        <CompactPrepare
          ctx={ctx}
          action={action}
          label={`Prepare this ${name} order`}
          blockedBy={blocked}
          start={start}
          bar={
            <>
              {canToggle(tokenChoices) ? <SideToggle choices={tokenChoices} tokenId={form.tokenId} side={form.side} onPick={(tokenId) => set("tokenId", tokenId)} /> : tokenField}
              <Field label="Limit price">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" value={form.price} onChange={(event) => set("price", event.target.value.trim())} />}</Field>
              <Field label="Size · shares">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" value={form.shares} onChange={(event) => set("shares", event.target.value.trim())} />}</Field>
              <SignStrip cells={clobSignCells(ticket, facts, form.side)} />
            </>
          }
          below={
            <>
              <p className="tr-bar-note">
                {venue === "polymarket" ? "A Polymarket order is signed by your wallet; the maker (your Deposit Wallet or your wallet) is read from Polygon at prepare, and PayBox shows every field of the order." : `A ${name} order is signed by your wallet itself, so PayBox shows every field of the order.`} Price on the <Num>{facts.tick}</Num> tick; size in shares with at most {CLOB_SIZE_DECIMALS} decimals
                {facts.minSize === "0" ? "" : <>, at least <Num>{facts.minSize}</Num></>}, as the market record read from {name} ({age}) carries them. The page prepares; you sign in PayBox; nothing is sent from here.
              </p>
              {issues}
              {unprovenRequired}
            </>
          }
          more={
            <Disclosure summary="Order options, the worst case and every signed field">
              {intro}
              {unproven}
              <div className="tr-grid">
                {sideField}
                {typeField}
                {lifeField}
              </div>
              {postOnly}
              {cost}
              {everyField}
            </Disclosure>
          }
        />
      </section>
    );
  }

  return (
    <section className="tr-section" aria-labelledby="tr-clob-order-h" data-testid="clob-order" data-venue={venue}>
      <Heading id="tr-clob-order-h">Order ticket</Heading>
      {intro}
      {unproven}
      <div className="tr-grid">
        {tokenField}
        {sideField}
        <Field label={`Price per share (on the ${facts.tick} tick)`}>{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={form.price} onChange={(event) => set("price", event.target.value.trim())} />}</Field>
        <Field label={`Shares (at most ${CLOB_SIZE_DECIMALS} decimals${facts.minSize === "0" ? "" : `, at least ${facts.minSize}`})`}>{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={form.shares} onChange={(event) => set("shares", event.target.value.trim())} />}</Field>
        {typeField}
        {lifeField}
      </div>
      {postOnly}
      {issues}
      {cost}
      {everyField}
      <div className="ui-stack">
        <GateNote gate={gate} facts={ctx.facts} />
        {unprovenRequired}
        {blocked === null ? null : <p role="note">{blocked}</p>}
        <div className="tr-actions">
          <Button
            variant="primary"
            disabled={!usable || running}
            busy={running}
            onClick={() => {
              if (owner === null || ticket === null) return;
              announce(`Prepare this ${name} order: asking the Cockpit to prepare it`);
              run(start);
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
