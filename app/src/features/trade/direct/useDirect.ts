import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { WalletSigner } from "../../../core/signer";
import type { ClobMarketFacts, ClobTicket } from "../clob-ticket";
import type { PolymarketExecutor } from "./polymarket/executor";
import type { ApprovalAmount } from "./polymarket/funding";
import type { DirectAccount, DirectApproval, DirectCancelAnswer, DirectFunding, DirectOpenOrders, DirectOrderAnswer, DirectPreparedOrder, DirectReadiness, DirectResult, DirectSession, DirectTransaction } from "./types";

// The state of the direct ticket for one wallet and one market. Every request is started by the visitor (connect,
// log in, review, sign, approve, cancel) except the reads that follow from them: the account when a wallet connects,
// its balances and approvals when an account is known, and the open orders when a session exists. An answer that
// arrives after the wallet, the account or the market changed is dropped.

export type Async<T> = { readonly phase: "idle" } | { readonly phase: "running" } | { readonly phase: "done"; readonly result: DirectResult<T> };

const IDLE = { phase: "idle" } as const;
const RUNNING = { phase: "running" } as const;

function done<T>(result: DirectResult<T>): Async<T> {
  return { phase: "done", result };
}

export interface DirectState {
  readonly readiness: Async<DirectReadiness>;
  readonly accounts: readonly DirectAccount[];
  readonly account: DirectAccount | null;
  readonly pickAccount: (index: number) => void;
  readonly rereadAccount: () => void;
  readonly session: DirectSession | null;
  readonly login: Async<DirectSession>;
  readonly doLogin: () => void;
  readonly doLogout: () => void;
  readonly funding: Async<DirectFunding>;
  readonly rereadFunding: () => void;
  readonly review: Async<DirectPreparedOrder>;
  readonly doReview: (ticket: ClobTicket, outcome: string | null) => void;
  readonly closeReview: () => void;
  readonly placing: boolean;
  readonly answer: DirectResult<DirectOrderAnswer> | null;
  readonly doPlace: () => void;
  readonly orders: Async<DirectOpenOrders>;
  readonly rereadOrders: () => void;
  readonly cancels: Readonly<Record<string, Async<DirectCancelAnswer>>>;
  readonly doCancel: (orderId: string) => void;
  readonly approval: DirectTransaction | null;
  readonly openApproval: (approval: DirectApproval, amount: ApprovalAmount) => void;
  readonly closeApproval: () => void;
  readonly approving: boolean;
  readonly approvalAnswer: DirectResult<`0x${string}`> | null;
  readonly doApprove: () => void;
}

export function useDirectPolymarket(signer: WalletSigner | null, executor: PolymarketExecutor, facts: ClobMarketFacts, tokenId: string): DirectState {
  const [readVersion, rereadAccount] = useReducer((n: number) => n + 1, 0);
  const [readiness, setReadiness] = useState<Async<DirectReadiness>>(IDLE);
  const [picked, setPicked] = useState(0);
  const [sessionVersion, bumpSession] = useReducer((n: number) => n + 1, 0);
  const [login, setLogin] = useState<Async<DirectSession>>(IDLE);
  const [fundingVersion, rereadFunding] = useReducer((n: number) => n + 1, 0);
  const [funding, setFunding] = useState<Async<DirectFunding>>(IDLE);
  const [review, setReview] = useState<Async<DirectPreparedOrder>>(IDLE);
  const [placing, setPlacing] = useState(false);
  const [answer, setAnswer] = useState<DirectResult<DirectOrderAnswer> | null>(null);
  const [ordersVersion, rereadOrders] = useReducer((n: number) => n + 1, 0);
  const [orders, setOrders] = useState<Async<DirectOpenOrders>>(IDLE);
  const [cancels, setCancels] = useState<Readonly<Record<string, Async<DirectCancelAnswer>>>>({});
  const [approval, setApproval] = useState<DirectTransaction | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalAnswer, setApprovalAnswer] = useState<DirectResult<`0x${string}`> | null>(null);
  // The wallet the latest answers belong to; an answer for another one is dropped.
  const current = useRef<WalletSigner | null>(signer);
  current.current = signer;

  useEffect(() => {
    setPicked(0);
    setLogin(IDLE);
    setReview(IDLE);
    setAnswer(null);
    setCancels({});
    setApproval(null);
    setApprovalAnswer(null);
    if (signer === null) {
      setReadiness(IDLE);
      return;
    }
    let live = true;
    setReadiness(RUNNING);
    void executor.ready(signer).then((result) => {
      if (live) setReadiness(done(result));
    });
    return () => {
      live = false;
    };
  }, [signer, executor, readVersion]);

  const accounts = useMemo(() => (readiness.phase === "done" && readiness.result.ok ? readiness.result.value.accounts : []), [readiness]);
  const account = accounts[picked] ?? accounts[0] ?? null;
  // Read again whenever this page changes it (log in, log out: sessionVersion) or the wallet changes.
  const session = useMemo(() => (signer === null ? null : executor.session(signer)), [signer, executor, sessionVersion]);

  const book = executor.bookOf(facts);
  const fundingToken = /^[1-9][0-9]{0,77}$/.test(tokenId) ? tokenId : null;
  useEffect(() => {
    if (account === null) {
      setFunding(IDLE);
      return;
    }
    let live = true;
    setFunding(RUNNING);
    void executor.funding(account, book, fundingToken).then((result) => {
      if (live) setFunding(done(result));
    });
    return () => {
      live = false;
    };
  }, [executor, account, book, fundingToken, fundingVersion]);

  const sessionKey = session?.keyTag ?? null;
  useEffect(() => {
    if (signer === null || sessionKey === null) {
      setOrders(IDLE);
      return;
    }
    let live = true;
    setOrders(RUNNING);
    void executor.openOrders(signer, { market: facts.marketId }).then((result) => {
      if (live) setOrders(done(result));
    });
    return () => {
      live = false;
    };
  }, [executor, signer, sessionKey, facts.marketId, ordersVersion]);

  const doLogin = useCallback(() => {
    if (signer === null) return;
    setLogin(RUNNING);
    void executor.login(signer).then((result) => {
      if (current.current !== signer) return;
      setLogin(done(result));
      bumpSession();
    });
  }, [executor, signer]);

  const doLogout = useCallback(() => {
    if (signer === null) return;
    executor.logout(signer);
    setLogin(IDLE);
    bumpSession();
  }, [executor, signer]);

  const doReview = useCallback(
    (ticket: ClobTicket, outcome: string | null) => {
      if (signer === null || account === null) return;
      setReview(RUNNING);
      setAnswer(null);
      void executor.prepareOrder(signer, account, { ticket, facts, outcome }).then((result) => {
        if (current.current === signer) setReview(done(result));
      });
    },
    [executor, signer, account, facts],
  );

  const closeReview = useCallback(() => setReview(IDLE), []);

  const doPlace = useCallback(() => {
    if (signer === null || review.phase !== "done" || !review.result.ok) return;
    const prepared = review.result.value;
    setPlacing(true);
    void executor.placeOrder(signer, prepared).then((result) => {
      if (current.current !== signer) return;
      setPlacing(false);
      setAnswer(result);
      // A refusal before anything was sent keeps the card open so the visitor can read why; anything else closes it.
      const stayOpen = !result.ok && ["wallet_rejected", "wallet_failed", "wallet_wrong_chain", "wallet_unsupported", "signature_mismatch", "not_logged_in"].includes(result.refusal.code);
      if (!stayOpen) setReview(IDLE);
      rereadFunding();
      rereadOrders();
    });
  }, [executor, signer, review]);

  const doCancel = useCallback(
    (orderId: string) => {
      if (signer === null) return;
      setCancels((previous) => ({ ...previous, [orderId]: RUNNING }));
      void executor.cancel(signer, orderId).then((result) => {
        if (current.current !== signer) return;
        setCancels((previous) => ({ ...previous, [orderId]: done(result) }));
        rereadOrders();
      });
    },
    [executor, signer],
  );

  const openApproval = useCallback(
    (entry: DirectApproval, amount: ApprovalAmount) => {
      if (account === null) return;
      setApprovalAnswer(null);
      setApproval(executor.approval(account, entry, amount));
    },
    [executor, account],
  );

  const closeApproval = useCallback(() => setApproval(null), []);

  const doApprove = useCallback(() => {
    if (signer === null || account === null || approval === null) return;
    setApproving(true);
    void executor.sendApproval(signer, account, approval).then((result) => {
      if (current.current !== signer) return;
      setApproving(false);
      setApprovalAnswer(result);
      if (result.ok) setApproval(null);
    });
  }, [executor, signer, account, approval]);

  return {
    readiness,
    accounts,
    account,
    pickAccount: setPicked,
    rereadAccount,
    session,
    login,
    doLogin,
    doLogout,
    funding,
    rereadFunding,
    review,
    doReview,
    closeReview,
    placing,
    answer,
    doPlace,
    orders,
    rereadOrders,
    cancels,
    doCancel,
    approval,
    openApproval,
    closeApproval,
    approving,
    approvalAnswer,
    doApprove,
  };
}
