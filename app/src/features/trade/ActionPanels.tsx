import { useMemo, useState, type ReactNode } from "react";

import { formatAtomic, parseDecimalAtomic } from "@shared/guardrails/amount";
import { USDC_E_DECIMALS } from "@shared/xo/chain/constants";

import { Badge, Button, Field, Tile, useAnnounce } from "../../ui";
import { GateNote, KeyValues, Mono, ResultView, Working } from "./components";
import type { PanelContext } from "./context";
import { gateFor, type Gate, type TradeAction } from "./facts";
import { usePrepare } from "./hooks";
import { prepareDeploy, prepareFunding, prepareOrder, prepareRedeem, prepareRevoke, type PrepareResult } from "./prepare";
import { TICKET_SIDES, TICKET_TIFS, buildTicket, expectedQuote, overOrderCap, usdText } from "./ticket";

// The five panels that ask the plugin to PREPARE something. Each one: shows what is being asked, applies its gate
// (switches, kill switch, recorded facts), calls one prepare tool through prepare.ts, and shows the vetted result.
// A panel never signs, never sends and never holds a signature. What comes back is an item to hand to an agent.

// The heading level of a panel's section, decided by the desk's host: h2 on a page, h4 inside the market modal.
export type PanelHeading = "h2" | "h4";

function Section({ id, title, children, heading = "h2" }: { readonly id: string; readonly title: string; readonly children: ReactNode; readonly heading?: PanelHeading }) {
  const Heading = heading;
  return (
    <section className="tr-section" aria-labelledby={`tr-${id}-h`} data-testid={id}>
      <Heading id={`tr-${id}-h`}>{title}</Heading>
      {children}
    </section>
  );
}

interface PreparePanelProps {
  readonly ctx: PanelContext;
  readonly action: TradeAction;
  readonly label: string;
  // Why the Prepare button is not usable for a reason that is the form's own (a bad amount), or null.
  readonly blockedBy: string | null;
  readonly start: (signal: AbortSignal) => Promise<PrepareResult>;
  readonly children?: ReactNode;
}

// The gate note, the button and the result: the same for every action.
function PrepareBody({ ctx, action, label, blockedBy, start, children }: PreparePanelProps) {
  const announce = useAnnounce();
  const gate: Gate = gateFor(action, ctx.gateInput);
  const { result, running, run } = usePrepare(ctx.refreshAccount);
  const usable = gate.canPrepare && blockedBy === null;
  return (
    <div className="ui-stack">
      {children}
      <GateNote gate={gate} facts={ctx.facts} />
      {blockedBy === null ? null : <p role="note">{blockedBy}</p>}
      <div className="tr-actions">
        <Button
          variant="primary"
          disabled={!usable || running}
          busy={running}
          onClick={() => {
            announce(`${label}: asking the Cockpit to prepare it`);
            run(start);
          }}
        >
          {label}
        </Button>
        <Working running={running} />
        {gate.canPrepare ? null : <Badge tone="neutral">unavailable</Badge>}
      </div>
      {result === null ? null : <ResultView result={result} facts={ctx.facts} gate={gate} />}
    </div>
  );
}

const ADDRESS_NEEDED = "Choose the owner address first.";

// ---- deploy and enable trading ------------------------------------------------------------------------------------------

export function DeployPanel({ ctx, heading }: { readonly ctx: PanelContext; readonly heading?: PanelHeading }) {
  const [mode, setMode] = useState<"unlimited" | "capped">("unlimited");
  const [capped, setCapped] = useState("");
  const deployed = ctx.account !== null && ctx.account.state !== "undeployed" && ctx.account.state !== "unknown";
  const enabled = ctx.account?.trading_enabled.status === "enabled";
  const parsed = useMemo(() => {
    if (mode === "unlimited") return { ok: true as const, atomic: null, text: null };
    const value = parseDecimalAtomic(capped, USDC_E_DECIMALS);
    if (!value.ok || value.value <= 0n) return { ok: false as const };
    return { ok: true as const, atomic: value.value, text: formatAtomic(value.value, USDC_E_DECIMALS) };
  }, [mode, capped]);
  const title = deployed ? "Enable trading" : "Deploy the account and enable trading";
  const owner = ctx.owner;
  return (
    <Section id="deploy" title={title} heading={heading}>
      <p>
        One operation the owner signs once: {deployed ? "" : "deploy the XO account if it is not deployed, then "}allow XO's exchange to spend USDC.e from the account and to move its position tokens. Which of the two it is comes from the account&apos;s
        state, read just now.
      </p>
      {enabled ? <p role="note">Trading already reads as enabled on this account.</p> : null}
      <fieldset className="tr-fieldset">
        <legend>Allowance</legend>
        <label className="tr-check">
          <input type="radio" name="tr-allowance" checked={mode === "unlimited"} onChange={() => setMode("unlimited")} /> XO&apos;s own unlimited approval
        </label>
        <label className="tr-check">
          <input type="radio" name="tr-allowance" checked={mode === "capped"} onChange={() => setMode("capped")} /> A capped allowance
        </label>
        {mode === "capped" ? (
          <Field label="Capped allowance in USDC.e">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={capped} onChange={(event) => setCapped(event.target.value)} />}</Field>
        ) : (
          <p className="tr-note">An unlimited approval exposes the whole balance to a future exchange upgrade. Keep balances small.</p>
        )}
      </fieldset>
      <PrepareBody
        ctx={ctx}
        action="deploy"
        label={deployed ? "Prepare enabling trading" : "Prepare deploy and enable trading"}
        blockedBy={owner === null ? ADDRESS_NEEDED : parsed.ok ? null : "The capped allowance is a plain USDC.e amount above zero, with up to six places."}
        start={(signal) => prepareDeploy({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner: owner as string, allowanceUsd: parsed.ok ? parsed.text : null, allowanceAtomic: parsed.ok ? parsed.atomic : null }, signal)}
      />
    </Section>
  );
}

// ---- revoke ---------------------------------------------------------------------------------------------------------------

export function RevokePanel({ ctx, heading }: { readonly ctx: PanelContext; readonly heading?: PanelHeading }) {
  const owner = ctx.owner;
  return (
    <Section id="revoke" title="Revoke trading" heading={heading}>
      <p>One operation the owner signs: set the exchange&apos;s USDC.e allowance to 0 and remove it as operator of the position tokens. It is the on-chain stop. Orders already signed stay valid until they expire, so keep them short.</p>
      <PrepareBody
        ctx={ctx}
        action="revoke"
        label="Prepare revoking trading"
        blockedBy={owner === null ? ADDRESS_NEEDED : null}
        start={(signal) => prepareRevoke({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner: owner as string }, signal)}
      />
    </Section>
  );
}

// ---- redeem ---------------------------------------------------------------------------------------------------------------

const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
const MAX_REDEEM = 50;

export function RedeemPanel({ ctx, heading }: { readonly ctx: PanelContext; readonly heading?: PanelHeading }) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [typed, setTyped] = useState("");
  const entries = ctx.account?.claimable.entries ?? [];
  const conditions = useMemo(() => {
    const byId = new Map<string, { readonly reasons: Set<string>; readonly lines: string[] }>();
    for (const entry of entries) {
      const id = entry.condition_id.toLowerCase();
      const slot = byId.get(id) ?? { reasons: new Set<string>(), lines: [] };
      slot.reasons.add(entry.reason);
      slot.lines.push(`${entry.shares} shares of ${entry.outcome}`);
      byId.set(id, slot);
    }
    return [...byId.entries()];
  }, [entries]);
  const toggle = (id: string): void => setPicked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const addTyped = (): void => {
    const text = typed.trim();
    if (CONDITION_ID.test(text) && !picked.includes(text.toLowerCase())) setPicked((current) => [...current, text.toLowerCase()]);
    setTyped("");
  };
  const owner = ctx.owner;
  const blocked = owner === null ? ADDRESS_NEEDED : picked.length === 0 ? "Pick at least one market to redeem." : picked.length > MAX_REDEEM ? `A redeem covers at most ${MAX_REDEEM} markets.` : null;
  return (
    <Section id="redeem" title="Redeem resolved positions" heading={heading}>
      <p>One operation the owner signs: redeem the chosen markets for USDC.e. XO refuses a market whose payout is not final, and the plugin says so. The list below is a hint, not the on-chain rule.</p>
      {conditions.length === 0 ? (
        <p>{ctx.account === null ? "Read the account to see claimable positions." : ctx.account.claimable.available ? "No claimable positions were found." : "The claimable read failed, so nothing can be listed. You can still add a market id by hand."}</p>
      ) : (
        <ul className="tr-pick" aria-label="Claimable markets">
          {conditions.map(([id, info]) => (
            <li key={id}>
              <label className="tr-check">
                <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} />{" "}
                <span>
                  <Mono>{id}</Mono> {info.lines.join(", ")}. {[...info.reasons].map((reason) => (reason === "resolved_winner" ? "Resolved, winning side." : reason === "voided_refund" ? "Voided: a refund (the refund rule is free text and unproven)." : "Reason not known.")).join(" ")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="tr-inline">
        <Field label="Add a market (condition) id by hand">{(id) => <input id={id} className="ui-input" autoComplete="off" spellCheck={false} value={typed} onChange={(event) => setTyped(event.target.value)} />}</Field>
        <Button onClick={addTyped} disabled={!CONDITION_ID.test(typed.trim())}>
          Add
        </Button>
      </div>
      {picked.filter((id) => !conditions.some(([known]) => known === id)).length === 0 ? null : (
        <p className="tr-note">Added by hand: {picked.filter((id) => !conditions.some(([known]) => known === id)).join(", ")}</p>
      )}
      <PrepareBody
        ctx={ctx}
        action="redeem"
        label={`Prepare redeeming ${picked.length} market${picked.length === 1 ? "" : "s"}`}
        blockedBy={blocked}
        start={(signal) => prepareRedeem({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner: owner as string, conditionIds: picked }, signal)}
      />
    </Section>
  );
}

// ---- funding --------------------------------------------------------------------------------------------------------------

export function FundPanel({ ctx, heading }: { readonly ctx: PanelContext; readonly heading?: PanelHeading }) {
  const [amount, setAmount] = useState("");
  const owner = ctx.owner;
  return (
    <Section id="fund" title="Fund the XO account from Base" heading={heading}>
      <p>
        Two Base transactions, one at a time: an exact-amount approval to the Hyperlane router, then the transfer to your XO account. The destination is the account derived from your owner address; it is not an input here and cannot be edited. This
        page shows each step as an intent for your agent to put to PayBox. It sends nothing.
      </p>
      <Field label="Amount of USDC to move from Base to XO">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} />}</Field>
      <p className="tr-note">Funding is one-way until a way out of XO has been proven. Start with a small test amount of your own choosing.</p>
      <PrepareBody
        ctx={ctx}
        action="fund"
        label="Prepare the next funding step"
        blockedBy={owner === null ? ADDRESS_NEEDED : amount.trim() === "" ? "Enter the amount first." : null}
        start={(signal) => prepareFunding({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner: owner as string, amountText: amount.trim() }, signal)}
      />
    </Section>
  );
}

// ---- the order ticket -----------------------------------------------------------------------------------------------------

// An outcome token the host already knows (the market modal passes the market's own outcomes). The label is fixed
// app text ("Outcome 1: Yes"), never the creator's label.
export interface TokenChoice {
  readonly label: string;
  readonly tokenId: string;
}

export function OrderPanel({ ctx, tokenChoices, heading }: { readonly ctx: PanelContext; readonly tokenChoices?: readonly TokenChoice[]; readonly heading?: PanelHeading }) {
  const [form, setForm] = useState({ tokenId: tokenChoices?.[0]?.tokenId ?? "", side: "BUY", price: "", shares: "", tif: "GTD", ttlS: "", postOnly: false });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((current) => ({ ...current, [key]: value }));
  const built = useMemo(() => buildTicket(form), [form]);
  const touched = form.tokenId !== "" || form.price !== "" || form.shares !== "";
  const owner = ctx.owner;
  const ticket = built.ok ? built.ticket : null;
  const over = ticket === null ? null : overOrderCap(ticket, ctx.account?.caps.max_order_usd ?? null);
  const want = ticket === null ? null : expectedQuote(ticket);
  const blocked = owner === null ? ADDRESS_NEEDED : ticket === null ? "Complete the ticket first." : over === true ? "This order counts more than the per-order cap allows. Lower the size or price." : null;
  return (
    <Section id="order" title="Order ticket" heading={heading}>
      <p>
        An order is prepared here and signed in PayBox; this page does neither. The numbers below are worked out here with the plugin&apos;s own rules and are compared, digit for digit, with what the relay quotes. If they differ, the item is not
        shown.
      </p>
      <div className="tr-grid">
        {tokenChoices === undefined || tokenChoices.length === 0 ? (
          <Field label="Outcome token id">
            {(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" spellCheck={false} value={form.tokenId} onChange={(event) => set("tokenId", event.target.value.trim())} />}
          </Field>
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
              {TICKET_SIDES.map((side) => (
                <option key={side} value={side}>
                  {side}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Price per share (0.001 to 0.999)">
          {(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={form.price} onChange={(event) => set("price", event.target.value.trim())} />}
        </Field>
        <Field label="Shares">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={form.shares} onChange={(event) => set("shares", event.target.value.trim())} />}</Field>
        <Field label="Type">
          {(id) => (
            <select id={id} className="ui-select" value={form.tif} onChange={(event) => set("tif", event.target.value)}>
              {TICKET_TIFS.map((tif) => (
                <option key={tif} value={tif}>
                  {tif}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Life in seconds (empty = the relay's default)">
          {(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" value={form.ttlS} onChange={(event) => set("ttlS", event.target.value.trim())} />}
        </Field>
      </div>
      <label className="tr-check">
        <input type="checkbox" checked={form.postOnly} onChange={(event) => set("postOnly", event.target.checked)} /> Post-only (GTD orders only)
      </label>
      {!built.ok && touched ? (
        <ul className="tr-issues" aria-label="Problems with the ticket">
          {built.issues.map((issue) => (
            <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {ticket === null || want === null ? null : (
        <Tile tone="info" title="What this ticket would cost, at most" heading={heading === "h4" ? "h4" : "h3"} dataKind="ticket" role="status">
          <KeyValues
            rows={[
              { label: "Order", value: `${ticket.side} ${ticket.shares} shares at ${ticket.price}` },
              { label: "Principal", value: `${usdText(ticket.principalAtomic)} USD` },
              ticket.maxOutlayAtomic === null
                ? { label: "Cash out", value: "none: a SELL moves no cash out" }
                : { label: "Worst-case cash out (principal plus the 1,000 bps fee ceiling)", value: `${want.maxOutlayUsd} USD` },
              ...(ticket.minProceedsAtomic === null ? [] : [{ label: "Worst-case proceeds after the fee ceiling", value: `${usdText(ticket.minProceedsAtomic)} USD` }]),
              { label: "Counted against the caps", value: `${want.reservedUsd} USD` },
            ]}
          />
          <p className="tr-note">The fee is a ceiling, not a quote: XO&apos;s real fee has not been reconciled with a fill. A signed order cannot be cancelled on chain; it stays valid until it expires.</p>
          {over === true ? <p role="alert">This is above the per-order cap of {ctx.account?.caps.max_order_usd} USD.</p> : over === null ? <p className="tr-note">The per-order cap is not known until the account has been read.</p> : null}
        </Tile>
      )}
      <PrepareBody
        ctx={ctx}
        action="order"
        label="Prepare this order"
        blockedBy={blocked}
        start={(signal) => prepareOrder({ client: ctx.services.client, nowMs: ctx.services.nowMs }, { owner: owner as string, ticket: ticket as NonNullable<typeof ticket> }, signal)}
      />
    </Section>
  );
}
