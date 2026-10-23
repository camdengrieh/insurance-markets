import { useMemo, useState, type ReactNode } from "react";

import { CLOB_CAP_FEE_BPS, POLYMARKET_EXCHANGES } from "@sdk/trade/clob/venues";
import { formatMicro } from "@sdk/trade/clob/amounts";

import { untrustedField } from "../../../core/untrusted";
import { Badge, Button, Disclosure, Field, Num, Tile, UntrustedText, useOpenConnect, type TileHeading } from "../../../ui";
import { useWalletSigner } from "../../wallet/connect/context";
import type { TokenChoice } from "../ActionPanels";
import { CLOB_FEE_CEILING_TEXT, CLOB_SIZE_DECIMALS, CLOB_TICKET_SIDES, POLYMARKET_GTD_MIN_TTL_S, buildClobTicket, formatClobUsd, tifsFor, type ClobMarketFacts, type ClobTicket } from "../clob-ticket";
import { KeyValues, Mono } from "../components";
import { OrderBar, SideToggle, SignStrip, canToggle } from "../OrderBar";
import { sideLabel, tifLabel, type SignCell } from "../ticket";
import { DirectCardDialog } from "./DirectCard";
import { LimitlessTicket } from "./limitless/LimitlessTicket";
import { atomicText } from "./polymarket/card";
import type { PolymarketExecutor } from "./polymarket/executor";
import { fundingStop } from "./polymarket/funding";
import { useDirectServices } from "./services";
import type { DirectFunding, DirectRefusal, DirectResult } from "./types";
import { useDirectPolymarket, type Async, type DirectState } from "./useDirect";

// The order ticket of the standalone build for a venue with a direct executor (Polymarket here; Limitless in
// limitless/LimitlessTicket.tsx, which this file routes to and lends its blocks): the visitor's own
// wallet signs and this page sends the signed order to the venue from the visitor's browser. Nothing goes through a
// server of the author's. In order:
//   no wallet       one action: connect a wallet (the shell's Connect modal);
//   a wallet        the account it trades from, read from Polygon (or a refusal in words), then the venue login (the
//                   visitor's own API credential, kept for this tab), the maker's pUSD and approvals, the ticket, and
//                   "Review and sign", which builds the order and opens its Signature Card; the wallet is asked only from
//                   the card, and the venue's answer is shown after;
//   open orders     this market's resting orders for the wallet's credential, each with Cancel.
// The Cockpit build never renders this: its writes stay behind the local daemon.

const EMPTY_FORM = { tokenId: "", side: "BUY", price: "", shares: "", tif: "GTC", ttlS: "", postOnly: false };

export interface DirectClobTicketProps {
  readonly facts: ClobMarketFacts;
  readonly tokenChoices?: readonly TokenChoice[];
  readonly heading?: "h2" | "h4";
}

export function tileHeading(heading: "h2" | "h4"): TileHeading {
  return heading === "h2" ? "h3" : "h4";
}

export function RefusalText({ refusal }: { readonly refusal: DirectRefusal }) {
  return (
    <>
      <p>{refusal.message}</p>
      {refusal.venueText === null ? null : (
        <p>
          The answer, as written: <UntrustedText value={untrustedField("generic", refusal.venueText)} maxChars={300} />
        </p>
      )}
    </>
  );
}

export function RefusalTile({ refusal, title, heading, actions }: { readonly refusal: DirectRefusal; readonly title: string; readonly heading: TileHeading; readonly actions?: ReactNode }) {
  return (
    <Tile tone={refusal.code === "venue_ambiguous" ? "warn" : "danger"} title={title} heading={heading} role="alert" dataKind="direct-refusal" dataCode={refusal.code} actions={actions}>
      <RefusalText refusal={refusal} />
    </Tile>
  );
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
        A Polymarket order is signed by your own wallet and sent from this page straight to Polymarket. Your wallet keeps its keys; this page shows every field on a Signature Card before your wallet is asked, and the author of this page holds no key, no
        credential and sees no request.
      </p>
      {openConnect === null ? <p className="tr-note">Use the wallet button at the top of the page to connect.</p> : null}
    </Tile>
  );
}

function AccountBlock({ state, heading }: { readonly state: DirectState; readonly heading: TileHeading }) {
  const { readiness, accounts, account } = state;
  if (readiness.phase !== "done") return <p role="status">Reading your Polymarket account on Polygon.</p>;
  if (!readiness.result.ok) {
    return (
      <RefusalTile
        refusal={readiness.result.refusal}
        title="Your Polymarket account could not be used"
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
      {accounts.length > 1 ? (
        <Field label="Trade from">
          {(id) => (
            <select id={id} className="ui-select" value={String(accounts.indexOf(account ?? accounts[0]!))} onChange={(event) => state.pickAccount(Number(event.target.value))}>
              {accounts.map((entry, index) => (
                <option key={entry.maker} value={String(index)}>{`${entry.label}, ${entry.maker.slice(0, 6)}…${entry.maker.slice(-4)}`}</option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      {account === null ? null : (
        <KeyValues
          rows={[
            { label: "Maker", value: <span>{account.label} <Mono>{account.maker}</Mono></span> },
            { label: "Signature type", value: String(account.signatureType) },
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

function LoginBlock({ state, heading }: { readonly state: DirectState; readonly heading: TileHeading }) {
  if (state.session !== null) {
    return (
      <div className="tr-inline" data-direct="logged-in">
        <p>
          Logged in to Polymarket in this tab, credential <Mono>{state.session.keyTag}</Mono>{" "}
          <Badge tone="neutral">yours, kept for this tab only</Badge>
        </p>
        <Button onClick={state.doLogout} data-action="direct-logout">
          Log out of this tab
        </Button>
      </div>
    );
  }
  const running = state.login.phase === "running";
  return (
    <Tile
      tone="info"
      title="Log in to Polymarket"
      heading={heading}
      dataKind="direct"
      dataCode="logged-out"
      actions={
        <Button variant="primary" busy={running} disabled={running} onClick={state.doLogin} data-action="direct-login">
          Log in to Polymarket
        </Button>
      }
    >
      <p>
        Your wallet will be asked to sign Polymarket&apos;s login message (EIP-712 ClobAuth on chain 137: your address, the venue&apos;s current time, nonce 0 and the words &quot;This message attests that I control the given wallet&quot;). It moves no funds. Polymarket
        answers with your own API credential, the one polymarket.com would use; this page keeps it in this tab only, sends it nowhere but Polymarket and forgets it when the tab closes.
      </p>
      {state.login.phase === "done" && !state.login.result.ok ? <RefusalText refusal={state.login.result.refusal} /> : null}
    </Tile>
  );
}

function amountText(value: bigint | null, decimals: number, unit: string): ReactNode {
  return value === null ? "could not be read" : <Num>{`${atomicText(value, decimals)} ${unit}`}</Num>;
}

function FundingBlock({ state, funding, ticket, blocker, heading }: { readonly state: DirectState; readonly funding: Async<DirectFunding>; readonly ticket: ClobTicket | null; readonly blocker: string | null; readonly heading: TileHeading }) {
  if (funding.phase !== "done") return funding.phase === "running" ? <p role="status">Reading the maker&apos;s pUSD and approvals on Polygon.</p> : null;
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
  return (
    <div data-direct="funding">
      <KeyValues
        rows={[
          { label: "pUSD held by the maker (Polygon, read now)", value: amountText(value.collateralBalance, value.collateralDecimals, "pUSD") },
          ...(value.shareBalance === null ? [] : [{ label: "Shares of this outcome held by the maker", value: amountText(value.shareBalance, 6, "shares") }]),
          ...value.approvals.map((approval) => ({
            label: approval.label,
            value: approval.granted === null ? "could not be read" : approval.allowance !== null ? amountText(approval.allowance, value.collateralDecimals, "pUSD") : approval.granted ? "granted" : "not granted",
          })),
        ]}
      />
      <p className="tr-note">
        Funding Polymarket (moving USDC to Polygon and wrapping it to pUSD) is done on Polymarket&apos;s own site or by your wallet; this page only reads the balance.{" "}
        <Button onClick={state.rereadFunding} data-action="direct-reread-funding">
          Read again
        </Button>
      </p>
      {ticket === null ? null : <ApprovalActions state={state} funding={value} ticket={ticket} blocker={blocker} />}
    </div>
  );
}

function ApprovalActions({ state, funding, ticket, blocker }: { readonly state: DirectState; readonly funding: DirectFunding; readonly ticket: ClobTicket; readonly blocker: string | null }) {
  const needed = funding.approvals.find((approval) => approval.neededFor === ticket.side);
  if (needed === undefined) return null;
  const short = ticket.side === "BUY" ? needed.allowance !== null && needed.allowance < ticket.amounts.makerAmount : needed.granted === false;
  if (!short) return null;
  if (blocker !== null) {
    return (
      <p role="note" data-direct="approve-blocked">
        {blocker}
      </p>
    );
  }
  return (
    <div className="tr-actions" data-direct="approve">
      {ticket.side === "BUY" ? (
        <>
          <Button onClick={() => state.openApproval(needed, { kind: "exact", atomic: ticket.maxOutlayAtomic ?? ticket.amounts.makerAmount })} data-action="direct-approve-exact">
            {`Approve ${formatClobUsd(ticket.maxOutlayAtomic ?? ticket.amounts.makerAmount)} pUSD for this order`}
          </Button>
          <Button onClick={() => state.openApproval(needed, { kind: "unlimited" })} data-action="direct-approve-unlimited">
            Approve pUSD without a limit
          </Button>
        </>
      ) : (
        <Button onClick={() => state.openApproval(needed, { kind: "unlimited" })} data-action="direct-approve-operator">
          Approve the exchange to move your outcome tokens
        </Button>
      )}
    </div>
  );
}

export function AnswerTile({ answer, heading, venue = "Polymarket" }: { readonly answer: DirectResult<{ readonly orderId: string; readonly status: string; readonly venueText: string | null }>; readonly heading: TileHeading; readonly venue?: string }) {
  if (!answer.ok) return <RefusalTile refusal={answer.refusal} title={answer.refusal.code === "venue_ambiguous" ? "The order's outcome is unknown" : "The order was not placed"} heading={heading} />;
  return (
    <Tile tone="ok" title={`${venue} accepted the order`} heading={heading} role="status" dataKind="direct-answer" dataCode={answer.value.status}>
      <KeyValues
        rows={[
          { label: "Order id", value: <Mono>{answer.value.orderId}</Mono> },
          { label: "Status, as the venue reported it", value: <Mono>{answer.value.status}</Mono> },
        ]}
      />
      {answer.value.venueText === null ? null : (
        <p>
          The venue added: <UntrustedText value={untrustedField("generic", answer.value.venueText)} maxChars={300} />
        </p>
      )}
    </Tile>
  );
}

export function OrdersBlock({ state, heading, venue = "Polymarket", loggedOut = "Log in to list and cancel your open orders on this market." }: { readonly state: DirectState; readonly heading: TileHeading; readonly venue?: string; readonly loggedOut?: string }) {
  const { orders } = state;
  if (state.session === null) return <p className="tr-note">{loggedOut}</p>;
  if (orders.phase !== "done") return <p role="status">Listing your open orders on this market.</p>;
  if (!orders.result.ok) {
    return (
      <RefusalTile
        refusal={orders.result.refusal}
        title="Your open orders could not be listed"
        heading={heading}
        actions={
          <Button onClick={state.rereadOrders} data-action="direct-reread-orders">
            List again
          </Button>
        }
      />
    );
  }
  const list = orders.result.value;
  return (
    <div data-direct="orders">
      {list.orders.length === 0 ? <p>No open orders on this market for this credential.</p> : null}
      {list.orders.length === 0 ? null : (
        <table className="signing-table" aria-label="Your open orders on this market">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Side, price, size</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.orders.map((order) => {
              const cancel = state.cancels[order.id];
              return (
                <tr key={order.id} data-order-id={order.id}>
                  <td>
                    <Mono>{`${order.id.slice(0, 10)}…${order.id.slice(-6)}`}</Mono>
                  </td>
                  <td>
                    {order.side ?? "side not given"} <Num>{order.originalSize ?? "?"}</Num> at <Num>{order.price ?? "?"}</Num>
                    {order.sizeMatched === null ? null : (
                      <>
                        , <Num>{order.sizeMatched}</Num> matched
                      </>
                    )}
                  </td>
                  <td>{order.status === null ? "not given" : <UntrustedText value={untrustedField("generic", order.status)} maxChars={40} />}</td>
                  <td>
                    {cancel?.phase === "done" ? (
                      cancel.result.ok ? (
                        cancel.result.value.canceled.includes(order.id) ? (
                          "cancelled"
                        ) : (
                          <span>
                            not cancelled: <UntrustedText value={untrustedField("generic", cancel.result.value.notCanceled.find((entry) => entry.id === order.id)?.reason ?? "no reason given")} maxChars={120} />
                          </span>
                        )
                      ) : (
                        <RefusalText refusal={cancel.result.refusal} />
                      )
                    ) : (
                      <Button busy={cancel?.phase === "running"} disabled={cancel?.phase === "running"} onClick={() => state.doCancel(order.id)} data-action="direct-cancel">
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {list.more ? <p className="tr-note">{`${venue} has more orders than the first page shown here.`}</p> : null}
      <Button onClick={state.rereadOrders} data-action="direct-reread-orders">
        List again
      </Button>
    </div>
  );
}

// The compact "What you sign" strip, from the ticket and the account the chain named (no relay is in the way).
function directSignCells(ticket: ClobTicket | null, facts: ClobMarketFacts, side: string, signatureType: number | null): SignCell[] {
  const book = facts.polymarketBook ?? "ctf";
  const amounts = ticket === null ? null : ticket.side === "BUY" ? `${formatMicro(ticket.amounts.makerAmount)} pUSD → ${formatMicro(ticket.amounts.takerAmount)} shares` : `${formatMicro(ticket.amounts.makerAmount)} shares → ${formatMicro(ticket.amounts.takerAmount)} pUSD`;
  return [
    { label: "domain", value: `Polymarket CTF Exchange v${POLYMARKET_EXCHANGES[book].version} · 137`, note: "checked against the live book before signing" },
    { label: "side · type", value: signatureType === null ? null : `${side === "SELL" ? "SELL" : "BUY"} · type ${signatureType}`, missing: "read your account first" },
    { label: "maker → taker", value: amounts, missing: "complete the ticket first" },
    { label: "fee ceiling", value: `${CLOB_CAP_FEE_BPS.toLocaleString("en-US")} bps`, note: "policy ceiling, not the venue's quote", caution: true },
  ];
}

function outcomeWords(choices: readonly TokenChoice[] | undefined, tokenId: string): string | null {
  const choice = choices?.find((entry) => entry.tokenId === tokenId);
  return choice === undefined ? null : (choice.short ?? choice.label);
}

export function DirectClobTicket({ facts, tokenChoices, heading = "h4" }: DirectClobTicketProps) {
  const signer = useWalletSigner();
  const services = useDirectServices();
  const executor: PolymarketExecutor = services.executor("polymarket");
  const tile = tileHeading(heading);
  // Limitless has its own ticket (a pasted API token instead of a login signature, Base instead of Polygon, our
  // markets API's relay in between); it shares this file's blocks.
  if (facts.venue === "limitless") return <LimitlessTicket facts={facts} tokenChoices={tokenChoices} heading={heading} />;
  if (facts.venue !== "polymarket") return null;
  if (signer === null) {
    return (
      <section className="tr-section" data-testid="direct-ticket" data-venue={facts.venue} data-direct="no-wallet">
        <ConnectPrompt heading={tile} />
      </section>
    );
  }
  return <ConnectedTicket executor={executor} facts={facts} tokenChoices={tokenChoices} heading={heading} />;
}

function ConnectedTicket({ executor, facts, tokenChoices, heading }: { readonly executor: PolymarketExecutor; readonly facts: ClobMarketFacts; readonly tokenChoices: readonly TokenChoice[] | undefined; readonly heading: "h2" | "h4" }) {
  const Heading = heading;
  const tile = tileHeading(heading);
  const signer = useWalletSigner();
  const [form, setForm] = useState({ ...EMPTY_FORM, tokenId: tokenChoices?.[0]?.tokenId ?? "" });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((previous) => ({ ...previous, [key]: value }));
  const state = useDirectPolymarket(signer, executor, facts, form.tokenId);
  const built = useMemo(() => buildClobTicket(form, facts), [form, facts]);
  const ticket = built.ok ? built.ticket : null;
  const touched = form.price !== "" || form.shares !== "";
  const account = state.account;
  const funding = state.funding;
  const approvalBlocker = signer === null || account === null ? null : executor.approvalBlocker(signer, account);
  const stop = ticket === null || funding.phase !== "done" || !funding.result.ok ? null : fundingStop(funding.result.value, ticket.side, ticket.amounts.makerAmount);
  const blocked =
    account === null
      ? "Your Polymarket account is not read yet."
      : state.session === null
        ? "Log in to Polymarket first."
        : ticket === null
          ? "Complete the ticket first."
          : funding.phase !== "done"
            ? "Reading the maker's balance and approvals."
            : !funding.result.ok
              ? "The maker's balance and approvals could not be read."
              : stop;
  const reviewing = state.review.phase === "running";
  const prepared = state.review.phase === "done" && state.review.result.ok ? state.review.result.value : null;
  const tifs = tifsFor(facts.venue);
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
    <section className="tr-section" aria-labelledby="tr-direct-h" data-testid="direct-ticket" data-venue={facts.venue} data-direct={state.session === null ? "logged-out" : "logged-in"}>
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
        . Orders go from this page straight to Polymarket, signed by your wallet.
      </p>
      <AccountBlock state={state} heading={tile} />
      {state.readiness.phase === "done" && state.readiness.result.ok ? (
        <>
          <LoginBlock state={state} heading={tile} />
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
            <SignStrip cells={directSignCells(ticket, facts, form.side, account?.signatureType ?? null)} />
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
          {state.answer === null ? null : <AnswerTile answer={state.answer} heading={tile} />}
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
                    {tifs.map((tif) => (
                      <option key={tif} value={tif}>
                        {tifLabel(tif)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={`Life in seconds (GTD only, ${POLYMARKET_GTD_MIN_TTL_S} or more; empty = 300)`}>{(id) => <input id={id} className="ui-input" inputMode="numeric" autoComplete="off" value={form.ttlS} onChange={(event) => set("ttlS", event.target.value.trim())} />}</Field>
            </div>
            <label className="tr-check">
              <input type="checkbox" checked={form.postOnly} onChange={(event) => set("postOnly", event.target.checked)} /> Post-only (GTC or GTD orders only)
            </label>
            {ticket === null ? null : (
              <KeyValues
                rows={[
                  { label: "Order", value: `${sideLabel(ticket.side)} ${ticket.shares} shares at ${ticket.price}` },
                  { label: "Principal", value: `${formatClobUsd(ticket.principalAtomic)} pUSD` },
                  ticket.maxOutlayAtomic === null ? { label: "Cash out", value: "none: a sell moves no pUSD out" } : { label: `Worst-case cash out (principal plus the ${CLOB_FEE_CEILING_TEXT})`, value: `${formatClobUsd(ticket.maxOutlayAtomic)} pUSD` },
                  { label: "Tick and minimum size", value: `${facts.tick}; ${facts.minSize === "0" ? "no minimum stated" : `${facts.minSize} shares`} (checked against the live book before signing)` },
                ]}
              />
            )}
            <p className="tr-note">
              Price on the <Num>{facts.tick}</Num> tick; size in shares with at most {CLOB_SIZE_DECIMALS} decimals. The fee is a policy ceiling, not Polymarket&apos;s quote. A GTC order rests until it fills or you cancel it below.
            </p>
          </Disclosure>
          <Disclosure summary="Your open orders on this market">
            <OrdersBlock state={state} heading={tile} />
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
