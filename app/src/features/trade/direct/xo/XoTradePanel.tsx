import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";

import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import type { AdapterDeps } from "../../../../core/ports";
import type { WalletSigner } from "../../../../core/signer";
import { sanitizeText } from "../../../../core/untrusted";
import { Badge, Button, Field, UntrustedText } from "../../../../ui";
import { useWalletSigner } from "../../../wallet/connect/context";
import { formatMicro } from "@sdk/trade/xo/amounts";
import { tabSessionStorage, XoCredentialStore, type CredentialStorage } from "./credentials";
import { browserRandom, type OpenOrderRow, type OrderSideWord } from "./order";
import { readinessView, readXoReadiness, xoChainCalls, type XoReadiness } from "./readiness";
import { XoRelayClient, type RelayFetch } from "./relay";
import { parseAllowanceCap, RAW_SIGNING_WORDS, XoAccountSetup, type AllowanceChoice, type XoSetupCard, type XoSetupOptions } from "./setup";
import type { XoSigningCard } from "./signing";
import { chainSupport, XoTrader, type ActionResult } from "./trader";
import { XoSetupCardView } from "./XoSetupCard";
import { XoSignatureCard } from "./XoSignatureCard";

// XO trading from this page with the visitor's own wallet, through the markets API's relay. What it shows, in order:
// why it cannot trade (no relay in this build, no wallet, a session that cannot sign on chain 3223), the account's
// readiness read fresh, the account setup when the account is not deployed or trading is not enabled (one user
// operation the wallet signs, sent to XO's bundler through the relay), where to fund the account, the login, the order
// ticket for one outcome, the open orders with a cancel each, the Signature Card while a signature is pending, and XO's
// answer after each action. It never fills in an amount, an allowance, a price or a side.

export const NOT_AVAILABLE_TEXT = "XO trading is not available in this build.";

export interface XoTradePanelProps {
  // Reads XO's chain (account code, approvals, USDC.e) through the page's guarded fetch.
  readonly deps: AdapterDeps;
  // The outcome the ticket trades; without one the panel offers the account, the login and the open orders.
  readonly outcome?: { readonly tokenId: string; readonly label: string } | null;
  // Seams for tests and the Cockpit; the page leaves them out.
  readonly signer?: WalletSigner | null;
  readonly relayOrigin?: string | null;
  readonly fetchImpl?: RelayFetch;
  readonly storage?: CredentialStorage | null;
  readonly random?: (bytes: number) => Uint8Array;
  readonly readReadiness?: (relay: XoRelayClient, owner: Address, account: Address) => Promise<XoReadiness>;
  // eth_call on XO's chain for the account setup (nonce, paymaster); the page's read port when left out.
  readonly chainCall?: XoSetupOptions["call"];
  // The account setup's receipt polling (tests shorten it).
  readonly sleep?: (ms: number) => Promise<void>;
}

const pageFetch: RelayFetch = (url, init) => globalThis.fetch(url, init);
const XO_CHAIN_LABEL = "chain id 3223";

type Pending = { readonly kind: "sign"; readonly card: XoSigningCard; readonly resolve: (sign: boolean) => void } | { readonly kind: "setup"; readonly card: XoSetupCard; readonly resolve: (sign: boolean) => void };

const BUSY_WORDS: Readonly<Record<string, string>> = {
  login: "the login",
  order: "the order",
  cancel: "the cancel",
  setup: "the account setup (XO's bundler, then the receipt)",
  follow: "the operation's receipt",
};

function AnswerView({ result }: { readonly result: ActionResult<unknown> }) {
  const tone = result.state === "done" ? "ok" : result.state === "ambiguous" ? "warn" : result.state === "declined" ? "neutral" : "danger";
  return (
    <section data-testid="xo-answer" data-state={result.state} aria-live="polite">
      <p>
        <Badge tone={tone}>{result.state}</Badge> {result.words}
      </p>
      {result.answer === null ? null : (
        <p data-testid="xo-answer-status">
          HTTP <code>{result.answer.status}</code> from {result.answer.from === "xo" ? "XO (through the relay)" : "the relay itself"}
          {result.answer.text === null ? "" : ":"}
        </p>
      )}
      {result.answer === null || result.answer.text === null || result.answer.text === "" ? null : (
        <p data-testid="xo-answer-body">
          <UntrustedText value={sanitizeText("generic", result.answer.text).text} maxChars={600} />
        </p>
      )}
    </section>
  );
}

function OrdersTable({ rows, busy, onCancel }: { readonly rows: readonly OpenOrderRow[]; readonly busy: boolean; readonly onCancel: (hash: string) => void }) {
  if (rows.length === 0) return <p>No open orders on XO for this account.</p>;
  return (
    <table className="ui-table" data-testid="xo-orders">
      <thead>
        <tr>
          <th scope="col">Order</th>
          <th scope="col">Side</th>
          <th scope="col">Price</th>
          <th scope="col">Shares (matched)</th>
          <th scope="col">Status</th>
          <th scope="col">Cancel</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.hash} data-hash={row.hash}>
            <td>
              <code>{`${row.hash.slice(0, 10)}…${row.hash.slice(-6)}`}</code>
            </td>
            <td>{row.side ?? "unknown"}</td>
            <td>{row.price ?? "unknown"}</td>
            <td>
              {row.originalShares ?? "unknown"} ({row.matchedShares ?? "unknown"})
            </td>
            <td>{row.status ?? "unknown"}</td>
            <td>
              <Button onClick={() => onCancel(row.hash)} disabled={busy} data-action="cancel-order">
                Cancel
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function XoTradePanel({ deps, outcome = null, signer: signerProp, relayOrigin = MARKETS_API_ORIGIN, fetchImpl = pageFetch, storage, random = browserRandom, readReadiness, chainCall, sleep }: XoTradePanelProps) {
  const contextSigner = useWalletSigner();
  const signer = signerProp === undefined ? contextSigner : signerProp;
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [readiness, setReadiness] = useState<XoReadiness | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [orders, setOrders] = useState<readonly OpenOrderRow[] | null>(null);
  const [side, setSide] = useState<OrderSideWord | null>(null);
  const [price, setPrice] = useState("");
  const [shares, setShares] = useState("");
  const [allowanceKind, setAllowanceKind] = useState<AllowanceChoice["kind"] | null>(null);
  const [capText, setCapText] = useState("");
  // A sent user operation whose outcome is not settled yet: no second one is offered until it is.
  const [pendingOp, setPendingOp] = useState<Hex | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const relay = useMemo(() => (relayOrigin === null ? null : new XoRelayClient(relayOrigin, fetchImpl)), [relayOrigin, fetchImpl]);
  const store = useMemo(() => new XoCredentialStore(storage === undefined ? tabSessionStorage() : storage), [storage]);
  const support = signer === null ? null : chainSupport(signer);
  const trader = useMemo(() => {
    if (relay === null || signer === null || !chainSupport(signer).ok) return null;
    return new XoTrader({
      signer,
      relay,
      store,
      random,
      confirm: (card) =>
        new Promise<boolean>((resolve) => {
          const entry: Pending = { kind: "sign", card, resolve };
          pendingRef.current = entry;
          setPending(entry);
        }),
    });
  }, [relay, signer, store, random]);
  const setup = useMemo(() => {
    if (relay === null || signer === null || !chainSupport(signer).ok) return null;
    return new XoAccountSetup({
      signer,
      relay,
      call: chainCall ?? xoChainCalls(deps),
      ...(sleep === undefined ? {} : { sleep }),
      confirm: (card) =>
        new Promise<boolean>((resolve) => {
          const entry: Pending = { kind: "setup", card, resolve };
          pendingRef.current = entry;
          setPending(entry);
        }),
    });
  }, [relay, signer, deps, chainCall, sleep]);

  const decide = useCallback((sign: boolean) => {
    const entry = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    entry?.resolve(sign);
  }, []);

  const readAccount = useCallback(async () => {
    if (trader === null || relay === null) return;
    setReadFailed(false);
    try {
      setReadiness(await (readReadiness === undefined ? readXoReadiness(deps, relay, trader.owner, trader.account) : readReadiness(relay, trader.owner, trader.account)));
    } catch {
      setReadFailed(true);
    }
  }, [deps, relay, trader, readReadiness]);

  useEffect(() => {
    if (trader === null) return;
    setLoggedIn(trader.hasCredential());
    void readAccount();
  }, [trader, readAccount]);

  const run = useCallback(async (label: string, action: () => Promise<ActionResult<unknown>>) => {
    setBusy(label);
    setResult(null);
    try {
      setResult(await action());
    } finally {
      setBusy(null);
    }
  }, []);

  if (relayOrigin === null || relay === null) {
    return (
      <section data-testid="xo-direct" data-state="unavailable">
        <p>{NOT_AVAILABLE_TEXT}</p>
        <p>XO&apos;s order book does not answer pages on other sites, so this page trades on XO only through the markets API&apos;s relay, and this build has no relay address.</p>
      </section>
    );
  }
  if (signer === null) {
    return (
      <section data-testid="xo-direct" data-state="no-wallet">
        <p>Connect a wallet to trade on XO from this page. Your wallet signs every login and order itself; this page holds no key.</p>
      </section>
    );
  }
  if (support !== null && !support.ok) {
    return (
      <section data-testid="xo-direct" data-state="chain-unsupported">
        <p>{support.words}</p>
      </section>
    );
  }
  if (trader === null || setup === null) return null;

  const view = readiness === null ? null : readinessView(readiness);
  const working = busy !== null || pending !== null;
  const cap = allowanceKind === "capped" ? parseAllowanceCap(capText) : null;
  const choice: AllowanceChoice | null = allowanceKind === "unlimited" ? { kind: "unlimited" } : cap !== null && cap.ok ? { kind: "capped", amountMicro: cap.amountMicro } : null;
  const setupAction = view?.setup ?? null;

  return (
    <section data-testid="xo-direct" data-state="ready" aria-label="Trade on XO">
      <h3>Trade on XO</h3>
      <p>
        XO account <code>{trader.account}</code>, owned by <code>{trader.owner}</code>. Every request goes through the markets API&apos;s relay, which forwards what your wallet and this tab signed and holds no key.
      </p>

      <section data-testid="xo-readiness">
        {view === null ? <p>{readFailed ? "The account could not be read." : "Reading the account on XO's chain and order book."}</p> : (
          <ul>
            {view.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <Button onClick={() => void readAccount()} disabled={working} data-action="read-account">
          Read the account again
        </Button>
      </section>

      {setupAction === null && pendingOp === null ? null : (
        <section data-testid="xo-setup" data-action={setupAction ?? "pending"}>
          <h4>{setupAction === "deploy_enable_trading" ? "Set up your XO account" : "Enable trading"}</h4>
          {pendingOp !== null ? (
            <>
              <p data-testid="xo-setup-pending">
                A user operation from this tab is not settled yet: <code>{pendingOp}</code>. Nothing new is offered until it is; check it again by its hash.
              </p>
              <Button
                disabled={working}
                onClick={() =>
                  void run("follow", async () => {
                    const done = await setup.follow(pendingOp);
                    if (done.state !== "ambiguous") setPendingOp(null);
                    void readAccount();
                    return done;
                  })
                }
                data-action="follow-setup"
              >
                Check the operation again
              </Button>
            </>
          ) : !signer.capabilities.rawMessage ? (
            <p data-testid="xo-setup-unsupported">{RAW_SIGNING_WORDS}</p>
          ) : (
            <>
              <p>
                {setupAction === "deploy_enable_trading"
                  ? "One user operation deploys your XO account (the address above, derived from this wallet) and enables trading: it approves XO's exchange to use the account's USDC.e and to move its outcome shares. Your wallet signs it once; XO's paymaster pays the gas when it agrees to, and nothing is charged to your wallet."
                  : "One user operation enables trading on your deployed XO account: it approves XO's exchange to use the account's USDC.e and to move its outcome shares. Your wallet signs it once; nothing is charged to your wallet."}
              </p>
              <fieldset>
                <legend>USDC.e allowance for the exchange</legend>
                <label>
                  <input type="radio" name="xo-allowance" value="unlimited" checked={allowanceKind === "unlimited"} onChange={() => setAllowanceKind("unlimited")} /> Unlimited, as XO&apos;s own app sets it
                </label>
                <label>
                  <input type="radio" name="xo-allowance" value="capped" checked={allowanceKind === "capped"} onChange={() => setAllowanceKind("capped")} /> Capped at an amount I choose
                </label>
              </fieldset>
              {allowanceKind === "capped" ? (
                <Field label="Allowance cap in USDC.e">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={capText} onChange={(event) => setCapText(event.target.value)} />}</Field>
              ) : null}
              {cap !== null && !cap.ok && capText.trim() !== "" ? <p data-testid="xo-setup-cap-error">{cap.words}</p> : null}
              <Button
                variant="primary"
                disabled={working || choice === null || readiness === null}
                onClick={() => {
                  if (choice === null || readiness === null) return;
                  void run("setup", async () => {
                    const done = await setup.run(readiness, choice);
                    if (done.state === "ambiguous" && done.value !== undefined) setPendingOp(done.value.userOpHash);
                    if (done.state === "done") void readAccount();
                    return done;
                  });
                }}
                data-action="setup-account"
              >
                {setupAction === "deploy_enable_trading" ? "Set up XO account" : "Enable trading"}
              </Button>
              <p>The card shows every call, the allowance and the 32 bytes your wallet signs before it is asked.</p>
            </>
          )}
        </section>
      )}

      <section data-testid="xo-funding">
        <h4>Fund the account</h4>
        <p>
          Send USDC.e on XO&apos;s chain ({XO_CHAIN_LABEL}) to your XO account: <code>{trader.account}</code>. Only USDC.e on that chain counts; the same address on another chain is not this account. To bring USDC from Base, use the Wallet screen.
        </p>
        <p data-testid="xo-funding-balance">
          {readiness === null ? "Reading the account's USDC.e balance." : readiness.usdcMicro === null ? "The account's USDC.e balance could not be read." : `USDC.e in the account now: ${formatMicro(readiness.usdcMicro)}.`}
        </p>
      </section>

      <section data-testid="xo-login" data-logged-in={loggedIn ? "true" : "false"}>
        {loggedIn ? (
          <p>
            This tab holds your XO API credential (kept in this tab only).{" "}
            <Button
              onClick={() => {
                trader.forgetCredential();
                setLoggedIn(false);
                setOrders(null);
              }}
              disabled={working}
              data-action="forget"
            >
              Forget it
            </Button>
          </p>
        ) : (
          <>
            <p>Log in to XO&apos;s order book: one signature, no funds move. {view !== null && !view.canLogin ? "The account must be deployed first." : ""}</p>
            <Button
              variant="primary"
              disabled={working || view === null || !view.canLogin}
              onClick={() =>
                void run("login", async () => {
                  const done = await trader.login();
                  setLoggedIn(trader.hasCredential());
                  return done;
                })
              }
              data-action="login"
            >
              Log in to XO
            </Button>
          </>
        )}
      </section>

      {outcome === null ? null : (
        <section data-testid="xo-ticket">
          <h4>
            Order on <UntrustedText value={sanitizeText("outcome", outcome.label).text} field="outcome" />
          </h4>
          <fieldset>
            <legend>Side</legend>
            {(["BUY", "SELL"] as const).map((word) => (
              <label key={word}>
                <input type="radio" name="xo-side" value={word} checked={side === word} onChange={() => setSide(word)} /> {word === "BUY" ? "Buy" : "Sell"}
              </label>
            ))}
          </fieldset>
          <Field label="Price per share in USDC (0.001 to 0.999)">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={price} onChange={(event) => setPrice(event.target.value)} />}</Field>
          <Field label="Shares">{(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={shares} onChange={(event) => setShares(event.target.value)} />}</Field>
          <p>The order is good for 5 minutes on XO&apos;s clock. The card shows everything that will be signed before your wallet is asked.</p>
          <Button
            variant="primary"
            disabled={working || !loggedIn || side === null || price.trim() === "" || shares.trim() === "" || view === null || !(side === "SELL" ? view.canSell : view.canBuy)}
            onClick={() => {
              if (side === null) return;
              void run("order", async () => {
                const done = await trader.placeOrder({ tokenId: outcome.tokenId, side, price, shares });
                if (done.state === "done") void trader.openOrders().then((list) => setOrders(list.value ?? null));
                return done;
              });
            }}
            data-action="review-order"
          >
            Review and sign the order
          </Button>
          {view !== null && side !== null && !(side === "SELL" ? view.canSell : view.canBuy) ? <p data-testid="xo-ticket-blocked">This account cannot {side === "SELL" ? "sell" : "buy"} on XO yet; the account section above says why.</p> : null}
        </section>
      )}

      <section data-testid="xo-open-orders">
        <Button
          disabled={working || !loggedIn}
          onClick={() =>
            void run("orders", async () => {
              const list = await trader.openOrders();
              setOrders(list.value ?? null);
              return list;
            })
          }
          data-action="list-orders"
        >
          Show my open orders on XO
        </Button>
        {orders === null ? null : (
          <OrdersTable
            rows={orders}
            busy={working}
            onCancel={(hash) =>
              void run("cancel", async () => {
                const done = await trader.cancel(hash);
                const list = await trader.openOrders();
                setOrders(list.value ?? null);
                return done;
              })
            }
          />
        )}
        <p>A cancel is signed with this tab&apos;s XO credential only; your wallet is not asked.</p>
      </section>

      {pending === null ? null : pending.kind === "sign" ? (
        <XoSignatureCard card={pending.card} onSign={() => decide(true)} onDecline={() => decide(false)} />
      ) : (
        <XoSetupCardView card={pending.card} onSign={() => decide(true)} onDecline={() => decide(false)} />
      )}
      {busy !== null && pending === null ? <p data-testid="xo-busy">Waiting for {BUSY_WORDS[busy] ?? "XO"}…</p> : null}
      {result === null ? null : <AnswerView result={result} />}
    </section>
  );
}
