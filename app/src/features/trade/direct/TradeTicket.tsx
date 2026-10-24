import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { untrustedField } from "../../../core/untrusted";
import { Badge, Button, Disclosure, Field, Num, Tile, UntrustedText, type TileHeading } from "../../../ui";
import { KeyValues, Mono } from "../components";
import type { ActivationResult, ActivationStatus } from "../../account/activation";
import type { TradingAccount } from "../../account/types";
import type { VenueKit } from "./kit";
import { atomicText } from "./polymarket/card";
import { BRIDGE_MIN_ATOMIC } from "./polymarket/bridge";
import { VENUE_NAME, type TicketForm, type TicketMarket, type TicketSummary } from "./routes";
import { useVenueKit } from "./services";
import type { DirectCancelAnswer, DirectOpenOrders, DirectOrderAnswer, DirectResult } from "./types";
import "../../signing/signing.css";

// The one order ticket, for every market the trading account can trade (XO, Polymarket, Limitless), in the standalone
// build. The venue is a detail of the market, not a separate flow. In order:
//   no account          one action: "Set up your account" (the account feature's flow);
//   venue not active    the steps still to do on this venue and one action, "Activate trading", with a progress list;
//   venue unavailable   the reason, in words; nothing else is offered;
//   ready               outcome, side, price and shares, the order type, a summary worked out exactly, and Place order;
//                       the answer after; the account's open orders on this market with a cancel each; for Polymarket,
//                       moving USDC from the account on Base to its Polymarket wallet.
// The trading key signs in the browser without a prompt, so the summary is what the visitor decides on. Nothing is
// filled in for them: no price, no size, no side.

export interface TradeTicketProps {
  readonly market: TicketMarket;
  // The trading account (useTradingAccount()), null until created or unlocked.
  readonly account: TradingAccount | null;
  // Opens the account feature's setup; null where this build has none to open.
  readonly onSetupAccount: (() => void) | null;
  readonly heading?: "h2" | "h4";
  // Tests pass their own kit; the page uses its own.
  readonly kit?: VenueKit;
}

// A refusal as shown: a venue path's own, or an activation's (the same shape with a looser code).
type Shown = { readonly code: string; readonly message: string; readonly venueText: string | null };
type Check = { readonly phase: "checking" } | { readonly phase: "done"; readonly status: ActivationStatus };
type Async<T> = { readonly phase: "idle" } | { readonly phase: "running" } | { readonly phase: "done"; readonly result: DirectResult<T> };

const IDLE = { phase: "idle" } as const;
const RUNNING = { phase: "running" } as const;
const SIDES = [
  { side: "BUY", label: "Buy" },
  { side: "SELL", label: "Sell" },
] as const;
const USDC_AMOUNT = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

function tileOf(heading: "h2" | "h4"): TileHeading {
  return heading === "h2" ? "h3" : "h4";
}

function RefusalText({ refusal }: { readonly refusal: Shown }) {
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

function RefusalTile({ refusal, title, heading }: { readonly refusal: Shown; readonly title: string; readonly heading: TileHeading }) {
  return (
    <Tile tone={refusal.code === "venue_ambiguous" ? "warn" : "danger"} title={title} heading={heading} role="alert" dataKind="ticket-refusal" dataCode={refusal.code}>
      <RefusalText refusal={refusal} />
    </Tile>
  );
}

function money(value: bigint, symbol: string): string {
  return `${atomicText(value, 6)} ${symbol}`;
}

function summaryRows(s: TicketSummary): readonly { readonly label: string; readonly value: ReactNode }[] {
  const verb = s.side === "BUY" ? "Buy" : "Sell";
  const fee = `${(s.feeCeilingBps / 100).toLocaleString("en-US")}%`;
  return [
    { label: "Order", value: `${verb} ${s.shares} shares of ${s.outcomeWords} at ${s.price}` },
    s.side === "BUY"
      ? { label: "You pay", value: <Num>{`${money(s.amountAtomic, s.collateral)}, at most ${money(s.boundAtomic, s.collateral)} with fees (a ${fee} ceiling, not the venue's quote)`}</Num> }
      : { label: "You receive", value: <Num>{`${money(s.amountAtomic, s.collateral)} before fees, at least ${money(s.boundAtomic, s.collateral)} after (a ${fee} ceiling)`}</Num> },
    { label: "Type", value: s.orderType },
    { label: "Each share pays", value: `1 ${s.collateral} if ${s.outcomeWords} wins` },
  ];
}

export function TradeTicket({ market, account, onSetupAccount, heading = "h4", kit: provided }: TradeTicketProps) {
  const fallback = useVenueKit();
  const kit = provided ?? fallback;
  const tile = tileOf(heading);
  const venueName = VENUE_NAME[market.venue];
  if (account === null) {
    return (
      <section className="tr-section" data-testid="trade-ticket" data-venue={market.venue} data-state="no-account">
        <Tile
          tone="info"
          title="Set up your account to trade"
          heading={tile}
          dataKind="ticket"
          dataCode="no-account"
          actions={
            <Button variant="primary" disabled={onSetupAccount === null} onClick={() => onSetupAccount?.()} data-action="setup-account">
              Set up your account
            </Button>
          }
        >
          <p>One trading account places your orders on every market here. It holds no venue key you have to manage and needs no gas from you. Set it up once, then come back to this market.</p>
        </Tile>
      </section>
    );
  }
  return <ActiveTicket key={`${account.address}:${market.venue}:${market.marketId}`} market={market} account={account} kit={kit} heading={heading} venueName={venueName} />;
}

function ActiveTicket({ market, account, kit, heading, venueName }: { readonly market: TicketMarket; readonly account: TradingAccount; readonly kit: VenueKit; readonly heading: "h2" | "h4"; readonly venueName: string }) {
  const tile = tileOf(heading);
  const activation = useMemo(() => kit.activation(market.venue), [kit, market.venue]);
  const [version, recheck] = useState(0);
  const [check, setCheck] = useState<Check>({ phase: "checking" });
  const [activating, setActivating] = useState<readonly string[] | null>(null);
  const [activated, setActivated] = useState<ActivationResult | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setCheck({ phase: "checking" });
    void activation.status(account).then((status) => {
      if (current) setCheck({ phase: "done", status });
    });
    return () => {
      current = false;
    };
  }, [activation, account, version]);

  const activate = useCallback(() => {
    setActivated(null);
    setActivating([]);
    void activation
      .activate(account, (step) => {
        if (live.current) setActivating((ran) => [...(ran ?? []), step]);
      })
      .then((result) => {
        if (!live.current) return;
        setActivating(null);
        setActivated(result);
        recheck((n) => n + 1);
      });
  }, [activation, account]);

  if (activating !== null) {
    const planned = check.phase === "done" && check.status.state === "needs_activation" ? check.status.steps : [];
    const steps = [...planned, ...activating.filter((step) => !planned.includes(step))];
    const now = activating[activating.length - 1] ?? null;
    return (
      <section className="tr-section" data-testid="trade-ticket" data-venue={market.venue} data-state="activating">
        <Tile tone="info" title={`Activating trading on ${venueName}`} heading={tile} role="status" dataKind="ticket" dataCode="activating">
          <ol className="tr-lines" aria-label="Activation steps">
            {steps.map((step) => {
              const state = step === now ? "now" : activating.includes(step) ? "done" : "to do";
              return (
                <li key={step} data-step-state={state}>
                  <Badge tone={state === "done" ? "ok" : state === "now" ? "info" : "neutral"}>{state === "now" ? "in progress" : state}</Badge> {step}
                </li>
              );
            })}
          </ol>
        </Tile>
      </section>
    );
  }

  if (check.phase === "checking") {
    return (
      <section className="tr-section" data-testid="trade-ticket" data-venue={market.venue} data-state="checking">
        <p role="status">{`Checking your account on ${venueName}.`}</p>
      </section>
    );
  }

  const status = check.status;
  const failure = activated !== null && !activated.ok ? <RefusalTile refusal={activated.refusal} title="Trading was not activated" heading={tile} /> : null;
  if (status.state === "unavailable") {
    const why = status.reason;
    return (
      <section className="tr-section" data-testid="trade-ticket" data-venue={market.venue} data-state="unavailable">
        {failure}
        <Tile
          tone="warn"
          title={`Trading on ${venueName} is not available for your account`}
          heading={tile}
          dataKind="ticket"
          dataCode="unavailable"
          actions={
            <Button onClick={() => recheck((n) => n + 1)} data-action="recheck">
              Check again
            </Button>
          }
        >
          <p>{why}</p>
        </Tile>
      </section>
    );
  }
  if (status.state === "needs_activation") {
    return (
      <section className="tr-section" data-testid="trade-ticket" data-venue={market.venue} data-state="needs-activation">
        {failure}
        <Tile
          tone="info"
          title={`Activate trading on ${venueName}`}
          heading={tile}
          dataKind="ticket"
          dataCode="needs-activation"
          actions={
            <Button variant="primary" onClick={activate} data-action="activate">
              Activate trading
            </Button>
          }
        >
          <p>Your account does this once, with no gas from you and no prompt. Still to do:</p>
          <ul className="tr-lines">
            {status.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </Tile>
      </section>
    );
  }
  return <ReadyTicket market={market} account={account} kit={kit} heading={heading} venueName={venueName} />;
}

function ReadyTicket({ market, account, kit, heading, venueName }: { readonly market: TicketMarket; readonly account: TradingAccount; readonly kit: VenueKit; readonly heading: "h2" | "h4"; readonly venueName: string }) {
  const Heading = heading;
  const tile = tileOf(heading);
  const route = useMemo(() => kit.route(market.venue), [kit, market.venue]);
  const [form, setForm] = useState<TicketForm>({ tokenId: market.outcomes[0]?.tokenId ?? "", side: "BUY", price: "", shares: "", tif: route.orderTypes[0]?.tif ?? "" });
  const set = <K extends keyof TicketForm>(key: K, value: TicketForm[K]): void => setForm((previous) => ({ ...previous, [key]: value }));
  const [placing, setPlacing] = useState(false);
  const [answer, setAnswer] = useState<DirectResult<DirectOrderAnswer> | null>(null);
  const [ordersVersion, rereadOrders] = useState(0);
  const [orders, setOrders] = useState<Async<DirectOpenOrders>>(IDLE);
  const [cancels, setCancels] = useState<Readonly<Record<string, Async<DirectCancelAnswer>>>>({});
  const summary = useMemo(() => route.summarize(market, form), [route, market, form]);
  const touched = form.price !== "" || form.shares !== "";
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setOrders(RUNNING);
    void route.openOrders(account, market).then((result) => {
      if (current) setOrders({ phase: "done", result });
    });
    return () => {
      current = false;
    };
  }, [route, account, market, ordersVersion]);

  const place = (): void => {
    if (!summary.ok || placing) return;
    setPlacing(true);
    setAnswer(null);
    void route.place(account, market, form).then((result) => {
      if (!live.current) return;
      setPlacing(false);
      setAnswer(result);
      rereadOrders((n) => n + 1);
    });
  };

  const cancel = (orderId: string): void => {
    setCancels((previous) => ({ ...previous, [orderId]: RUNNING }));
    void route.cancel(account, market, orderId).then((result) => {
      if (!live.current) return;
      setCancels((previous) => ({ ...previous, [orderId]: { phase: "done", result } }));
      rereadOrders((n) => n + 1);
    });
  };

  return (
    <section className="tr-section" aria-labelledby="tr-ticket-h" data-testid="trade-ticket" data-venue={market.venue} data-state="ready">
      <Heading id="tr-ticket-h" className="ui-visually-hidden">
        Order ticket
      </Heading>
      <div className="tr-bar">
        {market.outcomes.length > 1 ? (
          <div className="tr-toggle" role="group" aria-label="Outcome">
            {market.outcomes.map((outcome) => (
              <button key={outcome.tokenId} type="button" className="tr-toggle-button" data-outcome={outcome.label === "Yes" ? "yes" : outcome.label === "No" ? "no" : "label"} aria-pressed={outcome.tokenId === form.tokenId} onClick={() => set("tokenId", outcome.tokenId)}>
                {outcome.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="tr-toggle" role="group" aria-label="Side">
          {SIDES.map((entry) => (
            <button key={entry.side} type="button" className="tr-toggle-button" aria-pressed={form.side === entry.side} onClick={() => set("side", entry.side)}>
              {entry.label}
            </button>
          ))}
        </div>
        <Field label="Price per share">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={form.price} onChange={(event) => set("price", event.target.value.trim())} />}</Field>
        <Field label="Shares">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={form.shares} onChange={(event) => set("shares", event.target.value.trim())} />}</Field>
        {route.orderTypes.length > 1 ? (
          <Field label="Order type">
            {(id) => (
              <select id={id} className="ui-select" value={form.tif} onChange={(event) => set("tif", event.target.value)}>
                {route.orderTypes.map((type) => (
                  <option key={type.tif} value={type.tif}>
                    {type.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <div className="tr-bar-action">
          <Button variant="primary" busy={placing} disabled={!summary.ok || placing} onClick={place} data-action="place-order">
            Place order
          </Button>
        </div>
      </div>
      {summary.ok ? (
        <div data-ticket="summary">
          <KeyValues rows={summaryRows(summary.summary)} />
        </div>
      ) : touched ? (
        <ul className="tr-issues" aria-label="Problems with the ticket">
          {summary.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="tr-note">Enter a price and a number of shares to see what the order costs.</p>
      )}
      <p className="tr-note" data-ticket="venue">{`Venue: ${venueName}. Your trading account ${account.address.slice(0, 6)}…${account.address.slice(-4)} signs the order here and sends it once.`}</p>
      {answer === null ? null : answer.ok ? (
        <Tile tone="ok" title="Order placed" heading={tile} role="status" dataKind="ticket-answer" dataCode={answer.value.status}>
          <KeyValues
            rows={[
              { label: "Order", value: <Mono>{answer.value.orderId}</Mono> },
              { label: "Status, as the venue reported it", value: <Mono>{answer.value.status}</Mono> },
            ]}
          />
        </Tile>
      ) : (
        <RefusalTile refusal={answer.refusal} title={answer.refusal.code === "venue_ambiguous" ? "The order's outcome is not known" : "The order was not placed"} heading={tile} />
      )}
      {market.venue === "polymarket" ? <PolymarketFunds account={account} kit={kit} /> : null}
      <Disclosure summary="Your open orders on this market" defaultOpen>
        <OpenOrders orders={orders} cancels={cancels} onCancel={cancel} onReread={() => rereadOrders((n) => n + 1)} heading={tile} />
      </Disclosure>
    </section>
  );
}

function OpenOrders({ orders, cancels, onCancel, onReread, heading }: { readonly orders: Async<DirectOpenOrders>; readonly cancels: Readonly<Record<string, Async<DirectCancelAnswer>>>; readonly onCancel: (id: string) => void; readonly onReread: () => void; readonly heading: TileHeading }) {
  if (orders.phase !== "done") return <p role="status">Listing your open orders on this market.</p>;
  if (!orders.result.ok) {
    return (
      <div>
        <RefusalTile refusal={orders.result.refusal} title="Your open orders could not be listed" heading={heading} />
        <Button onClick={onReread} data-action="reread-orders">
          List again
        </Button>
      </div>
    );
  }
  const list = orders.result.value;
  return (
    <div data-ticket="orders">
      {list.orders.length === 0 ? (
        <p>No open orders on this market.</p>
      ) : (
        <table className="signing-table" aria-label="Your open orders on this market">
          <thead>
            <tr>
              <th scope="col">Side, size, price</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.orders.map((order) => {
              const state = cancels[order.id];
              return (
                <tr key={order.id} data-order-id={order.id}>
                  <td>
                    {order.side === "SELL" ? "Sell" : order.side === "BUY" ? "Buy" : "Side not given"} <Num>{order.originalSize ?? "?"}</Num> at <Num>{order.price ?? "?"}</Num>
                    {order.sizeMatched === null ? null : (
                      <>
                        , <Num>{order.sizeMatched}</Num> filled
                      </>
                    )}
                  </td>
                  <td>{order.status === null ? "not given" : <UntrustedText value={untrustedField("generic", order.status)} maxChars={40} />}</td>
                  <td>
                    {state?.phase === "done" ? (
                      state.result.ok ? (
                        state.result.value.canceled.includes(order.id) ? (
                          "cancelled"
                        ) : (
                          <span>
                            not cancelled: <UntrustedText value={untrustedField("generic", state.result.value.notCanceled.find((entry) => entry.id === order.id)?.reason ?? "no reason given")} maxChars={120} />
                          </span>
                        )
                      ) : (
                        <RefusalText refusal={state.result.refusal} />
                      )
                    ) : (
                      <Button busy={state?.phase === "running"} disabled={state?.phase === "running"} onClick={() => onCancel(order.id)} data-action="cancel-order">
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
      {list.more ? <p className="tr-note">The venue has more orders than the first page shown here.</p> : null}
      <Button onClick={onReread} data-action="reread-orders">
        List again
      </Button>
    </div>
  );
}

// Moving USDC from the trading account on Base to its Polymarket wallet, through Polymarket's bridge.
function PolymarketFunds({ account, kit }: { readonly account: TradingAccount; readonly kit: VenueKit }) {
  const [amount, setAmount] = useState("");
  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<VenueKit["fundPolymarket"]>> | null>(null);
  const atomic = USDC_AMOUNT.test(amount) ? BigInt(amount.split(".")[0] ?? "0") * 1_000_000n + BigInt((amount.split(".")[1] ?? "").padEnd(6, "0") || "0") : null;
  const move = (): void => {
    if (atomic === null || moving) return;
    setMoving(true);
    setResult(null);
    void kit.fundPolymarket(account, atomic).then((outcome) => {
      setMoving(false);
      setResult(outcome);
    });
  };
  return (
    <Disclosure summary="Add funds to Polymarket from Base">
      <p className="tr-note">{`Polymarket settles in pUSD on Polygon. This sends USDC from your trading account on Base to Polymarket's bridge, which credits your Polymarket wallet with pUSD, usually within minutes. The bridge takes at least ${atomicText(BRIDGE_MIN_ATOMIC, 6)} USDC.`}</p>
      <div className="tr-bar">
        <Field label="USDC to move">{(id) => <input id={id} className="ui-input tr-bar-input" inputMode="decimal" autoComplete="off" spellCheck={false} value={amount} onChange={(event) => setAmount(event.target.value.trim())} />}</Field>
        <div className="tr-bar-action">
          <Button busy={moving} disabled={atomic === null || moving} onClick={move} data-action="fund-polymarket">
            Move USDC to Polymarket
          </Button>
        </div>
      </div>
      {result === null ? null : result.ok ? (
        <p role="status" data-ticket="funded">
          Sent to Polymarket&apos;s deposit address <Mono>{result.value.depositAddress}</Mono>, transaction <Mono>{result.value.transactionHash}</Mono>. Your Polymarket balance updates once the bridge credits it.
        </p>
      ) : (
        <div role="alert" data-ticket="fund-refused">
          <RefusalText refusal={result.refusal} />
        </div>
      )}
    </Disclosure>
  );
}
