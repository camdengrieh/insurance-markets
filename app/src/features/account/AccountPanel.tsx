import { useCallback, useEffect, useId, useState } from "react";
import type { Address, Hex } from "viem";

import { untrustedField } from "../../core/untrusted";
import { Badge, Button, Dialog, Disclosure, Field, Num, UntrustedText, useOpenConnect, venueName } from "../../ui";
import { useWalletSigner } from "../wallet/connect/context";
import { checkActivations, runActivations, subscribeVenueActivations, VENUE_ACTIVATIONS, type ActivationRow } from "./activation";
import { accountUsdcSource, balanceSources, readAllBalances, subscribeBalanceSources, totalOf, type BalanceLine } from "./balances";
import { MONEY_CHAINS, type MoneyChainId } from "./constants";
import { useTradingAccountControls, type TradingAccountControls } from "./context";
import { checkWithdrawDestination, deposit, parseUsdcAmount, withdraw, type MoneyResult } from "./money";
import type { TradingAccount } from "./types";
import "./account.css";

// The trading account panel (docs/unified-account-design.md section 1): one account for every venue. Locked, it offers
// the two ways in (the connected wallet, or a passkey). Open, it shows the account's address, one total balance, Deposit,
// Withdraw, "Activate trading" (each registered venue's activation, in order) and Export key. Plain words throughout:
// the visitor never meets a venue account, a credential or a gas token here. It reads in the layout of the Connect modal
// (wallet.css): outlined sections over a 2 px ink rule, facts in a two-column list, one bordered footer row.

export const PANEL_TITLE = "Trading account";
export const PANEL_LEDE = "One account for every market. Its key stays in this browser, and gas is paid for you.";

export function shortAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// Dollars to the cent, floored, from millionths. Exact integer arithmetic.
export function formatDollars(micros: bigint): string {
  const cents = micros / 10_000n;
  const whole = cents / 100n;
  const part = (cents % 100n).toString().padStart(2, "0");
  return `$${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${part}`;
}

function Detail({ text }: { readonly text: string | null }) {
  if (text === null) return null;
  return (
    <span className="ac-detail">
      {" "}
      The service said: <UntrustedText value={untrustedField("generic", text)} maxChars={240} />
    </span>
  );
}

function TxLine({ hash }: { readonly hash: Hex }) {
  return (
    <>
      {" "}
      Transaction <Num>{hash}</Num>.
    </>
  );
}

// ---- locked: the two ways in ---------------------------------------------------------------------------------------------------

function LockedView({ controls }: { readonly controls: TradingAccountControls }) {
  const openConnect = useOpenConnect();
  // The connected wallet's address, for the labels (the account is not open yet, so it has no funding wallet).
  const connected = useWalletSigner()?.address ?? null;
  const generated = controls.records.filter((record) => record.kind === "generated");
  const derivedKnown = connected !== null && controls.records.some((record) => record.kind === "derived" && record.funding.toLowerCase() === connected.toLowerCase());
  // Until this browser's account list is open the page cannot tell creating from unlocking, so the buttons wait for it.
  const ready = controls.persistence !== null;

  return (
    <div className="ac-routes">
      <section className="ac-route" aria-labelledby="ac-route-wallet">
        <h3 id="ac-route-wallet">Use your wallet</h3>
        <p>Your wallet signs one message, which costs nothing and moves no funds. The same wallet makes the same account on any device, and it is where deposits come from.</p>
        {connected === null ? (
          <Button variant="primary" onClick={() => openConnect?.()} disabled={openConnect === null} data-action="account-connect">
            Connect a wallet
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void controls.openWithWallet()} busy={controls.busy === "wallet"} disabled={!ready || (controls.busy !== null && controls.busy !== "wallet")} data-action="account-wallet">
            {derivedKnown ? `Unlock with ${shortAddress(connected)}` : `Create with ${shortAddress(connected)}`}
          </Button>
        )}
        {connected !== null && !derivedKnown ? <p className="ac-note">Your wallet will ask you to sign twice, to check that it always signs the same way.</p> : null}
      </section>
      <section className="ac-route" aria-labelledby="ac-route-passkey">
        <h3 id="ac-route-passkey">No wallet? Use a passkey</h3>
        {controls.prf === "no" ? (
          <>
            <p role="status" data-kind="no-prf">
              This browser cannot create a trading account with a passkey. Connect a wallet instead.
            </p>
            <Button onClick={() => openConnect?.()} disabled={openConnect === null} data-action="account-connect-instead">
              Connect a wallet
            </Button>
          </>
        ) : (
          <>
            <p>A new key is made in this browser and locked with a passkey (your fingerprint, face or device PIN). An encrypted copy is kept on our server so the passkey can open it on your other devices; we cannot open it.</p>
            <div className="ac-actions">
              {generated.map((record) => (
                <Button key={record.id} onClick={() => void controls.unlockWithPasskey(record.id)} busy={controls.busy === "passkey_unlock"} disabled={!ready || controls.busy !== null} data-action="account-passkey-unlock">
                  Unlock {shortAddress(record.sealed.address)}
                </Button>
              ))}
              <Button variant={generated.length === 0 && connected === null ? "primary" : "default"} onClick={() => void controls.createWithPasskey()} busy={controls.busy === "passkey_create"} disabled={!ready || controls.busy !== null} data-action="account-passkey-create">
                Create with passkey
              </Button>
              <Button onClick={() => void controls.unlockWithPasskey(null)} disabled={!ready || controls.busy !== null} data-action="account-passkey-restore">
                Restore with a passkey
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---- open: balance ---------------------------------------------------------------------------------------------------------------

type BalanceState = { readonly kind: "loading" } | { readonly kind: "done"; readonly lines: readonly BalanceLine[] };

function useBalances(account: TradingAccount, controls: TradingAccountControls): { readonly state: BalanceState; readonly refresh: () => void } {
  const [state, setState] = useState<BalanceState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);
  useEffect(() => subscribeBalanceSources(refresh), [refresh]);
  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    void readAllBalances(account, accountUsdcSource(controls.services.calls), balanceSources()).then((lines) => {
      if (live) setState({ kind: "done", lines });
    });
    return () => {
      live = false;
    };
  }, [account, controls.services, tick]);
  return { state, refresh };
}

function BalanceView({ state, onRefresh }: { readonly state: BalanceState; readonly onRefresh: () => void }) {
  if (state.kind === "loading") {
    return (
      <p role="status" className="ac-total" data-kind="balance-loading">
        Reading your balance
      </p>
    );
  }
  const total = totalOf(state.lines);
  return (
    <div className="ac-balance">
      <p className="ac-total" data-kind="balance-total">
        <span className="ac-total-label">Balance</span> <Num>{formatDollars(total.micros)}</Num>
        {total.complete ? null : <span className="ac-note"> at least: part of it could not be read</span>}
      </p>
      <Disclosure summary="Where it is">
        <ul className="ac-lines">
          {state.lines.map((line) => (
            <li key={line.id}>
              <span>{line.label}</span> {line.micros === null ? <span className="ac-note">could not be read</span> : <Num>{formatDollars(line.micros)}</Num>}
            </li>
          ))}
        </ul>
      </Disclosure>
      <Button onClick={onRefresh} data-action="balance-refresh">
        Refresh balance
      </Button>
    </div>
  );
}

// ---- open: deposit and withdraw --------------------------------------------------------------------------------------------------

type MoneyState = { readonly kind: "idle" } | { readonly kind: "busy"; readonly step: string } | { readonly kind: "done"; readonly result: MoneyResult; readonly verb: "Deposited" | "Withdrawn" };

function MoneyOutcome({ state }: { readonly state: MoneyState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "busy") return <p role="status">{state.step}</p>;
  if (state.result.ok) {
    return (
      <p role="status" data-kind="money-done">
        {state.verb}.<TxLine hash={state.result.transactionHash} />
      </p>
    );
  }
  return (
    <p role="alert" data-kind="money-failed">
      {state.result.message}
      {state.result.transactionHash === null ? null : <TxLine hash={state.result.transactionHash} />}
      <Detail text={state.result.detail} />
    </p>
  );
}

function ChainSelect({ value, onChange }: { readonly value: MoneyChainId; readonly onChange: (chainId: MoneyChainId) => void }) {
  return (
    <Field label="Chain">
      {(id) => (
        <select id={id} className="ui-select" value={String(value)} onChange={(event) => onChange(Number(event.target.value) as MoneyChainId)}>
          {MONEY_CHAINS.map((chain) => (
            <option key={chain.chainId} value={String(chain.chainId)}>
              USDC on {chain.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function AmountField({ value, onChange }: { readonly value: string; readonly onChange: (text: string) => void }) {
  return (
    <Field label="Amount in USDC">
      {(id) => <input id={id} className="ui-input" inputMode="decimal" autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} />}
    </Field>
  );
}

const FIRST_CHAIN: MoneyChainId = MONEY_CHAINS[0]?.chainId ?? 8453;

function DepositForm({ account, controls, onMoved }: { readonly account: TradingAccount; readonly controls: TradingAccountControls; readonly onMoved: () => void }) {
  const openConnect = useOpenConnect();
  const [chainId, setChainId] = useState<MoneyChainId>(FIRST_CHAIN);
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<MoneyState>({ kind: "idle" });
  const funding = account.funding;

  async function onDeposit(): Promise<void> {
    if (funding === null) return;
    const parsed = parseUsdcAmount(amount);
    if (!parsed.ok) {
      setState({ kind: "done", verb: "Deposited", result: { ok: false, message: parsed.message, detail: null, transactionHash: null } });
      return;
    }
    const sponsor = controls.open?.sponsor;
    if (sponsor === undefined) {
      setState({ kind: "done", verb: "Deposited", result: { ok: false, message: "The account is locked.", detail: null, transactionHash: null } });
      return;
    }
    setState({ kind: "busy", step: "Approve the deposit in your wallet. It is a signature only: your wallet pays no gas." });
    const result = await deposit({ funding, account: account.address, sponsor, calls: controls.services.calls, chainId, value: parsed.value, nowMs: controls.services.nowMs(), randomBytes: controls.services.randomBytes });
    setState({ kind: "done", verb: "Deposited", result });
    if (result.ok) {
      setAmount("");
      onMoved();
    }
  }

  return (
    <section className="ac-section" aria-labelledby="ac-deposit">
      <h3 id="ac-deposit">Deposit</h3>
      {funding === null ? (
        <>
          <p>{account.mode === "derived" ? "Connect the wallet this account was made from to deposit from it." : "Connect the wallet you want to deposit from."}</p>
          <Button onClick={() => openConnect?.()} disabled={openConnect === null} data-action="deposit-connect">
            Connect a wallet
          </Button>
        </>
      ) : (
        <>
          <p>From your wallet {shortAddress(funding.address)}. Your wallet signs a transfer; it pays no gas.</p>
          <div className="ac-form">
            <ChainSelect value={chainId} onChange={setChainId} />
            <AmountField value={amount} onChange={setAmount} />
          </div>
          <Button variant="primary" onClick={() => void onDeposit()} busy={state.kind === "busy"} data-action="deposit">
            Deposit from your wallet
          </Button>
        </>
      )}
      <MoneyOutcome state={state} />
    </section>
  );
}

function WithdrawForm({ account, controls, onMoved }: { readonly account: TradingAccount; readonly controls: TradingAccountControls; readonly onMoved: () => void }) {
  const [chainId, setChainId] = useState<MoneyChainId>(FIRST_CHAIN);
  const [amount, setAmount] = useState("");
  const [toWallet, setToWallet] = useState(true);
  const [typed, setTyped] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<MoneyState>({ kind: "idle" });
  const groupName = useId();
  const funding = account.funding;
  const useWallet = toWallet && funding !== null;
  const check = useWallet ? null : typed.trim() === "" ? null : checkWithdrawDestination(typed);

  async function onWithdraw(): Promise<void> {
    const parsed = parseUsdcAmount(amount);
    const fail = (message: string): void => setState({ kind: "done", verb: "Withdrawn", result: { ok: false, message, detail: null, transactionHash: null } });
    if (!parsed.ok) return fail(parsed.message);
    let to: Address;
    if (useWallet && funding !== null) to = funding.address;
    else {
      const checked = checkWithdrawDestination(typed);
      if (!checked.ok) return fail(checked.message);
      if (checked.needsConfirmation && !confirmed) return fail("Read the warning about this address and tick the box to confirm it.");
      to = checked.address;
    }
    const sponsor = controls.open?.sponsor;
    if (sponsor === undefined) return fail("The account is locked.");
    setState({ kind: "busy", step: "Sending. Gas is paid for you." });
    const result = await withdraw({ account: account.address, sponsor, calls: controls.services.calls, chainId, to, value: parsed.value });
    setState({ kind: "done", verb: "Withdrawn", result });
    if (result.ok) {
      setAmount("");
      onMoved();
    }
  }

  return (
    <section className="ac-section" aria-labelledby="ac-withdraw">
      <h3 id="ac-withdraw">Withdraw</h3>
      <div className="ac-form">
        <ChainSelect value={chainId} onChange={setChainId} />
        <AmountField value={amount} onChange={setAmount} />
      </div>
      <fieldset className="ac-choice">
        <legend>Send to</legend>
        {funding === null ? null : (
          <label>
            <input type="radio" name={groupName} checked={toWallet} onChange={() => setToWallet(true)} /> Your wallet <Num>{shortAddress(funding.address)}</Num>
          </label>
        )}
        <label>
          <input type="radio" name={groupName} checked={!useWallet} onChange={() => setToWallet(false)} /> Another address
        </label>
      </fieldset>
      {useWallet ? null : (
        <Field label="Address to send to">
          {(id) => <input id={id} className="ui-input ac-address" autoComplete="off" spellCheck={false} value={typed} onChange={(event) => { setTyped(event.target.value); setConfirmed(false); }} />}
        </Field>
      )}
      {check === null ? null : !check.ok ? (
        <p role="alert" data-kind="address-refused">
          {check.message}
        </p>
      ) : check.warnings.length === 0 ? null : (
        <div data-kind="address-warnings">
          <ul className="ac-warnings">
            {check.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
          {check.needsConfirmation ? (
            <label className="ac-confirm">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I compared every character and this is the right address.
            </label>
          ) : null}
        </div>
      )}
      <Button variant="primary" onClick={() => void onWithdraw()} busy={state.kind === "busy"} data-action="withdraw">
        Withdraw
      </Button>
      <MoneyOutcome state={state} />
    </section>
  );
}

// ---- open: activate trading -------------------------------------------------------------------------------------------------------

function rowWords(row: ActivationRow): { readonly tone: "neutral" | "ok" | "warn" | "danger"; readonly badge: string; readonly text: string | null; readonly venueText: string | null } {
  switch (row.state) {
    case "checking":
      return { tone: "neutral", badge: "checking", text: null, venueText: null };
    case "ready":
      return { tone: "ok", badge: "ready", text: null, venueText: null };
    case "needs_activation":
      return { tone: "warn", badge: "needs activation", text: row.steps.length === 0 ? null : row.steps.join("; "), venueText: null };
    case "activating":
      return { tone: "neutral", badge: "activating", text: row.step, venueText: null };
    case "unavailable":
      return { tone: "danger", badge: "not available", text: row.reason, venueText: null };
    case "failed":
      return { tone: "danger", badge: "did not finish", text: row.message, venueText: row.venueText };
  }
}

function useActivationList(): typeof VENUE_ACTIVATIONS {
  const [list, setList] = useState(() => [...VENUE_ACTIVATIONS]);
  useEffect(() => subscribeVenueActivations(() => setList([...VENUE_ACTIVATIONS])), []);
  return list;
}

function ActivationView({ account }: { readonly account: TradingAccount }) {
  const list = useActivationList();
  const [rows, setRows] = useState<readonly (ActivationRow | null)[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let live = true;
    setRows(list.map(() => null));
    void checkActivations(account, list, (index, row) => {
      if (live) setRows((current) => current.map((entry, at) => (at === index ? row : entry)));
    });
    return () => {
      live = false;
    };
  }, [account, list]);

  async function onActivate(): Promise<void> {
    setRunning(true);
    try {
      await runActivations(account, list, (index, row) => setRows((current) => current.map((entry, at) => (at === index ? row : entry))));
    } finally {
      setRunning(false);
    }
  }

  const pending = rows.some((row) => row !== null && (row.state === "needs_activation" || row.state === "failed"));
  return (
    <section className="ac-section" aria-labelledby="ac-activate">
      <h3 id="ac-activate">Activate trading</h3>
      {list.length === 0 ? (
        <p data-kind="no-activations">No market needs a setup step from this account yet.</p>
      ) : (
        <>
          <ol className="ac-activations">
            {list.map((activation, index) => {
              const row = rows[index] ?? null;
              const words = row === null ? null : rowWords(row);
              return (
                <li key={activation.venue} data-venue={activation.venue} data-state={row?.state ?? "checking"}>
                  <span className="ac-venue">{venueName(activation.venue)}</span> {words === null ? <Badge>checking</Badge> : <Badge tone={words.tone}>{words.badge}</Badge>}
                  {words?.text === null || words === null ? null : <span className="ac-note"> {words.text}</span>}
                  {words?.venueText === null || words === null ? null : <Detail text={words.venueText} />}
                </li>
              );
            })}
          </ol>
          <Button variant="primary" onClick={() => void onActivate()} busy={running} disabled={!pending && !running} data-action="activate">
            {pending || running ? "Activate trading" : "Everything that can be activated is ready"}
          </Button>
        </>
      )}
    </section>
  );
}

// ---- open: export -------------------------------------------------------------------------------------------------------------------

function ExportView({ controls }: { readonly controls: TradingAccountControls }) {
  const [understood, setUnderstood] = useState(false);
  const [shown, setShown] = useState<Hex | null>(null);

  function onShow(): void {
    const key = controls.open?.reveal() ?? null;
    setShown(key);
    setUnderstood(false);
  }

  return (
    <Disclosure summary="Export key">
      <p>The key is the account. Anyone who sees it can take everything in it, on every market. Export it only to keep a private copy, and never paste it into a site.</p>
      {shown === null ? (
        <>
          <label className="ac-confirm">
            <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /> I understand that anyone who sees this key controls the account and its funds.
          </label>
          <Button variant="danger" onClick={onShow} disabled={!understood} data-action="export-show">
            Show my key
          </Button>
        </>
      ) : (
        <>
          <code className="ac-key" data-kind="exported-key">
            {shown}
          </code>
          <Button onClick={() => setShown(null)} data-action="export-hide">
            Hide key
          </Button>
        </>
      )}
    </Disclosure>
  );
}

// ---- open --------------------------------------------------------------------------------------------------------------------------

function OpenView({ account, controls }: { readonly account: TradingAccount; readonly controls: TradingAccountControls }) {
  const balances = useBalances(account, controls);
  return (
    <div className="ac-open">
      <section className="ac-summary" aria-labelledby="ac-summary-title">
        <h3 id="ac-summary-title">Your account</h3>
        <dl className="ac-facts">
          <div>
            <dt>Address</dt>
            <dd>
              <Num>{account.address}</Num>
            </dd>
          </div>
          <div>
            <dt>Made from</dt>
            <dd>{account.mode === "derived" ? <>your wallet <Num>{shortAddress(controls.open?.madeFrom ?? "")}</Num></> : "a passkey"}</dd>
          </div>
          <div>
            <dt>Funding wallet</dt>
            <dd>{account.funding === null ? "none connected" : <Num>{shortAddress(account.funding.address)}</Num>}</dd>
          </div>
          {account.mode === "generated" && controls.backup !== null ? (
            <div>
              <dt>Backup</dt>
              <dd data-kind="backup" data-state={controls.backup.kind}>
                {controls.backup.kind === "saved" ? "an encrypted copy is saved on our server" : <>not saved. {controls.backup.message} Export your key and keep it somewhere safe.</>}
              </dd>
            </div>
          ) : null}
        </dl>
        <BalanceView state={balances.state} onRefresh={balances.refresh} />
        {account.mode === "generated" && controls.backup?.kind === "not_saved" ? (
          <Button onClick={() => void controls.retryBackup()} busy={controls.busy === "backup"} data-action="backup-retry">
            Try the backup again
          </Button>
        ) : null}
      </section>
      <DepositForm account={account} controls={controls} onMoved={balances.refresh} />
      <WithdrawForm account={account} controls={controls} onMoved={balances.refresh} />
      <ActivationView account={account} />
      <ExportView controls={controls} />
      <div className="wl-connect-footer ac-footer">
        <p>Locking forgets the key in this tab. {account.mode === "derived" ? "Your wallet unlocks it again." : "Your passkey unlocks it again."}</p>
        <Button onClick={controls.lock} data-action="account-lock">
          Lock
        </Button>
      </div>
    </div>
  );
}

export function AccountDialog() {
  const controls = useTradingAccountControls();
  if (controls === null) return null;
  const account = controls.account;
  return (
    <Dialog open={controls.panelOpen} title={PANEL_TITLE} lede={PANEL_LEDE} onClose={controls.closePanel} size="medium">
      {controls.unavailable !== null ? (
        <p role="status" data-kind="account-unavailable">
          {controls.unavailable}
        </p>
      ) : account === null ? (
        <LockedView controls={controls} />
      ) : (
        <OpenView account={account} controls={controls} />
      )}
      {controls.error === null ? null : (
        <div className="ac-error">
          <p role="alert" data-kind="account-error">
            {controls.error.message}
          </p>
          {/* A wallet that cannot make the account (not deterministic, or a smart-contract wallet): the passkey way in. */}
          {controls.error.offerPasskey && account === null && controls.prf !== "no" ? (
            <Button variant="primary" onClick={() => void controls.createWithPasskey()} busy={controls.busy === "passkey_create"} disabled={controls.busy !== null} data-action="account-passkey-fallback">
              Create with passkey instead
            </Button>
          ) : null}
        </div>
      )}
      {controls.notice === null ? null : (
        <p role="status" data-kind="account-notice">
          {controls.notice}
        </p>
      )}
    </Dialog>
  );
}
