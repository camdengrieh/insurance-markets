import { useMemo, useState, type ReactNode } from "react";

import { CLOB_CAP_FEE_BPS } from "@sdk/trade/clob/venues";
import { formatMicro } from "@sdk/trade/clob/amounts";

import { untrustedField } from "../../../../core/untrusted";
import { Badge, Button, Disclosure, Field, Num, Tile, UntrustedText, useOpenConnect, type TileHeading } from "../../../../ui";
import { useWalletSigner } from "../../../wallet/connect/context";
import type { TokenChoice } from "../../ActionPanels";
import { CLOB_FEE_CEILING_TEXT, CLOB_SIZE_DECIMALS, CLOB_TICKET_SIDES, buildClobTicket, formatClobUsd, type ClobMarketFacts, type ClobTicket } from "../../clob-ticket";
import { KeyValues, Mono } from "../../components";
import { OrderBar, SideToggle, SignStrip, canToggle } from "../../OrderBar";
import { sideLabel, tifLabel, type SignCell } from "../../ticket";
import { DirectCardDialog } from "../DirectCard";
import { AnswerTile, OrdersBlock, RefusalText, RefusalTile, tileHeading } from "../DirectClobTicket";
import { atomicText } from "../polymarket/card";
import { fundingStop } from "../polymarket/funding";
import { useDirectServices } from "../services";
import type { DirectFunding } from "../types";
import { useDirectTicket, type Async, type DirectState } from "../useDirect";
import { NOT_AVAILABLE, type LimitlessExecutor } from "./executor";
import { LIMITLESS_DIRECT_TIFS } from "./order";
import { TOKEN_HELP, TOKEN_ID_LABEL, TOKEN_SECRET_LABEL } from "./words";

// The Limitless order ticket of the standalone build: the visitor's own wallet signs each order, the visitor's own
// Limitless API token signs each request in this tab, and our markets API's relay carries both to Limitless (which sends
// no CORS headers for this page). In order:
//   no relay        one tile: this build names no markets API, so nothing is offered or requested;
//   no wallet       one action: connect a wallet (the shell's Connect modal);
//   a wallet        the wallet read on Base (an EOA, or a refusal in words), then the token (pasted, checked with
//                   Limitless, kept for this tab), the wallet's USDC and approvals on Base with Approve when the wallet
//                   can send transactions, the ticket, and "Review and sign", which builds the order and opens its
//                   Signature Card; the wallet is asked only from the card, and Limitless's answer is shown after;
//   open orders     this market's resting orders for the token, each with Cancel.
// The Cockpit build never renders this: its writes stay behind the local daemon.

const EMPTY_FORM = { tokenId: "", side: "BUY", price: "", shares: "", tif: "GTC", ttlS: "", postOnly: false };

export interface LimitlessTicketProps {
  readonly facts: ClobMarketFacts;
  readonly tokenChoices?: readonly TokenChoice[] | undefined;
  readonly heading?: "h2" | "h4";
}

function ConnectPrompt({ heading }: { readonly heading: TileHeading }) {
  const openConnect = useOpenConnect();
  return (
    <Tile
      tone="info"
      title="Connect a wallet to trade"
      heading={heading}
      dataKind="direct"
      dataCode="no-wallet"
      actions={
        openConnect === null ? null : (
          <Button variant="primary" onClick={openConnect} data-action="direct-connect">
            Connect a wallet to trade
          </Button>
        )
      }
    >
      <p>
        A Limitless order is signed by your own wallet on Base and sent from this page, through our markets API&apos;s relay, to Limitless, with your own Limitless API token. Your wallet keeps its keys; this page shows every field on a Signature Card before
        your wallet is asked, and the relay holds no key and no token: it forwards what this tab signed.
      </p>
      {openConnect === null ? <p className="tr-note">Use the wallet button at the top of the page to connect.</p> : null}
    </Tile>
  );
}

function AccountBlock({ state, heading }: { readonly state: DirectState; readonly heading: TileHeading }) {
  const { readiness, account } = state;
  if (readiness.phase !== "done") return <p role="status">Reading your wallet on Base.</p>;
  if (!readiness.result.ok) {
    return (
      <RefusalTile
        refusal={readiness.result.refusal}
        title="Your wallet cannot trade on Limitless from here"
        heading={heading}
        actions={
          <Button onClick={state.rereadAccount} data-action="direct-reread-account">
            Read again
          </Button>
        }
      />
    );
  }
  return (
    <div data-direct-account={account?.signatureType ?? "none"}>
      {account === null ? null : (
        <KeyValues
          rows={[
            { label: "Maker", value: <span>{account.label} <Mono>{account.maker}</Mono></span> },
            { label: "Signature type", value: "0 (EOA)" },
          ]}
        />
      )}
      {readiness.result.value.notes.map((note) => (
        <p key={note} className="tr-note" role="note">
          {note}
        </p>
      ))}
    </div>
  );
}

function TokenBlock({ state, executor, heading }: { readonly state: DirectState; readonly executor: LimitlessExecutor; readonly heading: TileHeading }) {
  // What the visitor types, handed to the executor on submit and cleared at once; never shown back.
  const [pastedId, setPastedId] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  if (state.session !== null) {
    return (
      <div className="tr-inline" data-direct="logged-in">
        <p>
          Your Limitless API token <Mono>{state.session.keyTag}</Mono> <Badge tone="neutral">yours, kept for this tab only</Badge>
        </p>
        <Button onClick={state.doLogout} data-action="direct-logout">
          Forget it in this tab
        </Button>
      </div>
    );
  }
  const running = state.login.phase === "running";
  const submit = (): void => {
    const id = pastedId;
    const key = pastedKey;
    setPastedId("");
    setPastedKey("");
    state.doLoginWith((who) => executor.connect(who, id, key));
  };
  return (
    <Tile
      tone="info"
      title="Use your Limitless API token"
      heading={heading}
      dataKind="direct"
      dataCode="logged-out"
      actions={
        <Button variant="primary" busy={running} disabled={running || pastedId.trim() === "" || pastedKey.trim() === ""} onClick={submit} data-action="direct-login">
          Check and use this token
        </Button>
      }
    >
      <p>{TOKEN_HELP}</p>
      <div className="tr-grid">
        <Field label={TOKEN_ID_LABEL}>{(id) => <input id={id} className="ui-input" autoComplete="off" spellCheck={false} value={pastedId} onChange={(event) => setPastedId(event.target.value)} data-field="token-id" />}</Field>
        <Field label={TOKEN_SECRET_LABEL}>{(id) => <input id={id} className="ui-input" type="password" autoComplete="off" spellCheck={false} value={pastedKey} onChange={(event) => setPastedKey(event.target.value)} data-field="token-key" />}</Field>
      </div>
      {state.login.phase === "done" && !state.login.result.ok ? <RefusalText refusal={state.login.result.refusal} /> : null}
    </Tile>
  );
}

function amountText(value: bigint | null, decimals: number, unit: string): ReactNode {
  return value === null ? "could not be read" : <Num>{`${atomicText(value, decimals)} ${unit}`}</Num>;
}

function FundingBlock({ state, funding, ticket, blocker, heading }: { readonly state: DirectState; readonly funding: Async<DirectFunding>; readonly ticket: ClobTicket | null; readonly blocker: string | null; readonly heading: TileHeading }) {
  if (funding.phase !== "done") return funding.phase === "running" ? <p role="status">Reading your USDC and approvals on Base.</p> : null;
  if (!funding.result.ok) {
    return (
      <RefusalTile
        refusal={funding.result.refusal}
        title="Balances and approvals could not be read"
        heading={heading}
        actions={
          <Button onClick={state.rereadFunding} data-action="direct-reread-funding">
            Read again
          </Button>
        }
      />
    );
  }
  const value = funding.result.value;
  const needed = ticket === null ? undefined : value.approvals.find((approval) => approval.neededFor === ticket.side);
  const short = ticket === null || needed === undefined ? false : ticket.side === "BUY" ? needed.allowance !== null && needed.allowance < ticket.amounts.makerAmount : needed.granted === false;
  return (
    <div data-direct="funding">
      <KeyValues
        rows={[
          { label: "USDC held by your wallet (Base, read now)", value: amountText(value.collateralBalance, value.collateralDecimals, "USDC") },
          ...(value.shareBalance === null ? [] : [{ label: "Shares of this outcome held by your wallet", value: amountText(value.shareBalance, 6, "shares") }]),
          ...value.approvals.map((approval) => ({
            label: approval.label,
            value: approval.granted === null ? "could not be read" : approval.allowance !== null ? amountText(approval.allowance, value.collateralDecimals, "USDC") : approval.granted ? "granted" : "not granted",
          })),
        ]}
      />
      <p className="tr-note">
        Funding (USDC on Base) is done from your wallet or Limitless&apos;s own app; this page only reads the balance.{" "}
        <Button onClick={state.rereadFunding} data-action="direct-reread-funding">
          Read again
        </Button>
      </p>
      {ticket === null || needed === undefined || !short ? null : blocker !== null ? (
        <p role="note" data-direct="approve-blocked">
          {blocker}
        </p>
      ) : (
        <div className="tr-actions" data-direct="approve">
          {ticket.side === "BUY" ? (
            <>
              <Button onClick={() => state.openApproval(needed, { kind: "exact", atomic: ticket.maxOutlayAtomic ?? ticket.amounts.makerAmount })} data-action="direct-approve-exact">
                {`Approve ${formatClobUsd(ticket.maxOutlayAtomic ?? ticket.amounts.makerAmount)} USDC for this order`}
              </Button>
              <Button onClick={() => state.openApproval(needed, { kind: "unlimited" })} data-action="direct-approve-unlimited">
                Approve USDC without a limit
              </Button>
            </>
          ) : (
            <Button onClick={() => state.openApproval(needed, { kind: "unlimited" })} data-action="direct-approve-operator">
              Approve the exchange to move your outcome tokens
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// The compact "What you sign" strip, from the ticket alone (the exchange and fee rate are read again before signing).
function signCells(ticket: ClobTicket | null, side: string): SignCell[] {
  const amounts = ticket === null ? null : ticket.side === "BUY" ? `${formatMicro(ticket.amounts.makerAmount)} USDC → ${formatMicro(ticket.amounts.takerAmount)} shares` : `${formatMicro(ticket.amounts.makerAmount)} shares → ${formatMicro(ticket.amounts.takerAmount)} USDC`;
  return [
    { label: "domain", value: "Limitless CTF Exchange v1 · 8453", note: "checked against the market's record before signing" },
    { label: "side · type", value: `${side === "SELL" ? "SELL" : "BUY"} · type 0` },
    { label: "maker → taker", value: amounts, missing: "complete the ticket first" },
    { label: "fee rate", value: "0 or your profile's rate", note: "read from Limitless before signing", caution: true },
  ];
}

function outcomeWords(choices: readonly TokenChoice[] | undefined, tokenId: string): string | null {
  const choice = choices?.find((entry) => entry.tokenId === tokenId);
  return choice === undefined ? null : (choice.short ?? choice.label);
}

export function LimitlessTicket({ facts, tokenChoices, heading = "h4" }: LimitlessTicketProps) {
  const signer = useWalletSigner();
  const services = useDirectServices();
  const executor: LimitlessExecutor = services.executor("limitless");
  const tile = tileHeading(heading);
  if (!executor.available) {
    return (
      <section className="tr-section" data-testid="direct-ticket" data-venue="limitless" data-direct="unavailable">
        <Tile tone="info" title="Limitless trading is not available in this build" heading={tile} dataKind="direct" dataCode="unavailable">
          <p>{NOT_AVAILABLE}</p>
        </Tile>
      </section>
    );
  }
  if (signer === null) {
    return (
      <section className="tr-section" data-testid="direct-ticket" data-venue="limitless" data-direct="no-wallet">
        <ConnectPrompt heading={tile} />
      </section>
    );
  }
  return <ConnectedTicket executor={executor} facts={facts} tokenChoices={tokenChoices} heading={heading} />;
}

function ConnectedTicket({ executor, facts, tokenChoices, heading }: { readonly executor: LimitlessExecutor; readonly facts: ClobMarketFacts; readonly tokenChoices: readonly TokenChoice[] | undefined; readonly heading: "h2" | "h4" }) {
  const Heading = heading;
  const tile = tileHeading(heading);
  const signer = useWalletSigner();
  const [form, setForm] = useState({ ...EMPTY_FORM, tokenId: tokenChoices?.[0]?.tokenId ?? "" });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((previous) => ({ ...previous, [key]: value }));
  const state = useDirectTicket(signer, executor, facts, form.tokenId);
  const built = useMemo(() => buildClobTicket(form, facts), [form, facts]);
  const ticket = built.ok ? built.ticket : null;
  const touched = form.price !== "" || form.shares !== "";
  const account = state.account;
  const funding = state.funding;
  const approvalBlocker = signer === null ? null : executor.approvalBlocker(signer);
  const stop = ticket === null || funding.phase !== "done" || !funding.result.ok ? null : fundingStop(funding.result.value, ticket.side, ticket.amounts.makerAmount);
  const blocked =
    account === null
      ? "Your wallet on Base is not read yet."
      : state.session === null
        ? "Paste your Limitless API token first."
        : ticket === null
          ? "Complete the ticket first."
          : funding.phase !== "done"
            ? "Reading your balance and approvals."
            : !funding.result.ok
              ? "Your balance and approvals could not be read."
              : stop;
  const reviewing = state.review.phase === "running";
  const prepared = state.review.phase === "done" && state.review.result.ok ? state.review.result.value : null;
  const choices: readonly TokenChoice[] = tokenChoices ?? [];

  const tokenField =
    tokenChoices === undefined || tokenChoices.length === 0 ? (
      <Field label="Outcome token id">{(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" spellCheck={false} value={form.tokenId} onChange={(event) => set("tokenId", event.target.value.trim())} />}</Field>
    ) : canToggle(tokenChoices) ? (
      <SideToggle choices={tokenChoices} tokenId={form.tokenId} side={form.side} onPick={(tokenId) => set("tokenId", tokenId)} />
    ) : (
      <Field label="Outcome">
        {(id) => (
          <select id={id} className="ui-select" value={form.tokenId} onChange={(event) => set("tokenId", event.target.value)}>
            {choices.map((choice) => (
              <option key={choice.tokenId} value={choice.tokenId}>
                {choice.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    );

  return (
    <section className="tr-section" aria-labelledby="tr-direct-h" data-testid="direct-ticket" data-venue="limitless" data-direct={state.session === null ? "logged-out" : "logged-in"}>
      <Heading id="tr-direct-h" className="ui-visually-hidden">
        Order ticket
      </Heading>
      <p className="tr-bar-note">
        Connected: <Mono>{signer?.address ?? ""}</Mono>
        {signer === null ? null : (
          <>
            {" "}
            (<UntrustedText value={untrustedField("generic", signer.name)} maxChars={40} />)
          </>
        )}
        . Orders are signed by your wallet and go from this page through our markets API&apos;s relay to Limitless.
      </p>
      <AccountBlock state={state} heading={tile} />
      {state.readiness.phase === "done" && state.readiness.result.ok ? (
        <>
          <TokenBlock state={state} executor={executor} heading={tile} />
          <OrderBar
            action={
              <Button
                variant="primary"
                busy={reviewing}
                disabled={blocked !== null || reviewing}
                onClick={() => {
                  if (ticket !== null) state.doReview(ticket, outcomeWords(tokenChoices, form.tokenId));
                }}
                data-action="direct-review"
              >
                Review and sign
              </Button>
            }
          >
            {tokenField}
            <Field label="Limit price">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" value={form.price} onChange={(event) => set("price", event.target.value.trim())} />}</Field>
            <Field label="Size · shares">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" value={form.shares} onChange={(event) => set("shares", event.target.value.trim())} />}</Field>
            <SignStrip cells={signCells(ticket, form.side)} />
          </OrderBar>
          {blocked === null ? null : (
            <p role="note" data-direct="blocked">
              {blocked}
            </p>
          )}
          <FundingBlock state={state} funding={funding} ticket={ticket} blocker={approvalBlocker} heading={tile} />
          {state.approvalAnswer === null ? null : state.approvalAnswer.ok ? (
            <p role="status" data-direct="approval-sent">
              Your wallet sent the approval, transaction <Mono>{state.approvalAnswer.value}</Mono>. Read again once it is included in a block.
            </p>
          ) : (
            <RefusalTile refusal={state.approvalAnswer.refusal} title="The approval was not sent" heading={tile} />
          )}
          {!built.ok && touched ? (
            <ul className="tr-issues" aria-label="Problems with the ticket">
              {built.issues.map((issue) => (
                <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
          {state.review.phase === "done" && !state.review.result.ok ? <RefusalTile refusal={state.review.result.refusal} title="The order was not prepared" heading={tile} /> : null}
          {state.answer === null ? null : <AnswerTile answer={state.answer} heading={tile} venue="Limitless" />}
          <Disclosure summary="Order options and the worst case">
            <div className="tr-grid">
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
              <Field label="Type">
                {(id) => (
                  <select id={id} className="ui-select" value={form.tif} onChange={(event) => set("tif", event.target.value)}>
                    {LIMITLESS_DIRECT_TIFS.map((tif) => (
                      <option key={tif} value={tif}>
                        {tifLabel(tif)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <label className="tr-check">
              <input type="checkbox" checked={form.postOnly} onChange={(event) => set("postOnly", event.target.checked)} /> Post-only (GTC orders only)
            </label>
            {ticket === null ? null : (
              <KeyValues
                rows={[
                  { label: "Order", value: `${sideLabel(ticket.side)} ${ticket.shares} shares at ${ticket.price}` },
                  { label: "Principal", value: `${formatClobUsd(ticket.principalAtomic)} USDC` },
                  ticket.maxOutlayAtomic === null ? { label: "Cash out", value: "none: a sell moves no USDC out" } : { label: `Worst-case cash out (principal plus the ${CLOB_FEE_CEILING_TEXT})`, value: `${formatClobUsd(ticket.maxOutlayAtomic)} USDC` },
                  { label: "Tick", value: `${facts.tick} (Limitless takes at most three price decimals)` },
                ]}
              />
            )}
            <p className="tr-note">
              Price on the <Num>{facts.tick}</Num> tick; size in shares with at most {CLOB_SIZE_DECIMALS} decimals. The fee shown is the {CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps policy ceiling, not Limitless&apos;s quote; the signed fee rate is
              read from Limitless before your wallet is asked. A GTC order rests until it fills or you cancel it below; a FOK order is not offered here.
            </p>
          </Disclosure>
          <Disclosure summary="Your open orders on this market">
            <OrdersBlock state={state} heading={tile} venue="Limitless" loggedOut="Paste your Limitless API token to list and cancel your open orders on this market." />
          </Disclosure>
        </>
      ) : null}
      <DirectCardDialog
        open={prepared !== null}
        card={prepared?.card ?? null}
        actionLabel="Sign in your wallet and send"
        busy={state.placing}
        onAction={state.doPlace}
        onClose={state.closeReview}
        note={state.answer !== null && !state.answer.ok ? <RefusalText refusal={state.answer.refusal} /> : <p className="tr-note">The order is sent once, right after your wallet signs it; this card expires two minutes after it was built.</p>}
      />
      <DirectCardDialog open={state.approval !== null} card={state.approval?.card ?? null} actionLabel="Send from your wallet" busy={state.approving} onAction={state.doApprove} onClose={state.closeApproval} note={state.approvalAnswer !== null && !state.approvalAnswer.ok ? <RefusalText refusal={state.approvalAnswer.refusal} /> : null} />
    </section>
  );
}
