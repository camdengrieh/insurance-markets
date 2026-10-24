import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import { deriveAccount } from "@sdk/trade/xo/account/derive";

import type { TradingAccount } from "../../../account/types";
import { asLocal } from "../testkit";
import { XoCredential, XoCredentialStore } from "./credentials";
import type { XoReadiness } from "./readiness";
import { XoRelayClient } from "./relay";
import { RAW_SIGNING_WORDS } from "./setup";
import { CREDENTIAL, fakeRelay, fakeSetupBundler, fakeSigner, fakeXoChain, fixedRandom, memoryStorage, ownerAddress, RELAY_ORIGIN, TOKEN_ID, type FakeSigner, type Route } from "./testkit";
import { PAYBOX_CHAIN_WORDS } from "./trader";
import { createXoVenue, XO_NOT_AVAILABLE, XO_STEP_ENABLE, XO_STEP_SETUP, XO_STEP_SIGN_IN } from "./venue";

// XO for the trading account against a fake relay (XO's order book and bundler behind it) and a fake XO chain: the
// activation runs the existing account setup and the sign-in with the account's key and no prompt, and the ticket's
// order calls come back as the direct path's results. Every answer is written here; nothing contacts XO.

const OWNER = ownerAddress();
const ACCOUNT = getAddress(deriveAccount(OWNER));
const BOOK = { market: `0x${"ab".repeat(32)}`, tick_size: "0.001", min_order_size: "5", bids: [{ price: "0.40", size: "100" }], asks: [{ price: "0.42", size: "50" }] };
const HASH = `0x${"cd".repeat(32)}`;

function readiness(over: Partial<XoReadiness> = {}): XoReadiness {
  return { owner: OWNER, account: ACCOUNT, deployed: "no", registered: false, usdcMicro: 0n, allowanceMicro: 0n, sellApproved: false, ...over };
}

function rig(options: { readonly read?: () => XoReadiness; readonly routes?: Readonly<Record<string, Route>>; readonly relay?: boolean; readonly signer?: FakeSigner } = {}) {
  const bundler = fakeSetupBundler();
  const relay = fakeRelay({ "POST /v1/relay/xo/bundler": bundler.route, "GET /auth/derive-api-key": () => ({ body: CREDENTIAL }), ...(options.routes ?? {}) });
  const storage = memoryStorage();
  const store = new XoCredentialStore(storage);
  const venue = createXoVenue({
    relay: options.relay === false ? null : new XoRelayClient(RELAY_ORIGIN, relay.fetch),
    store,
    adapter: { fetch: async () => ({ ok: false, error: { kind: "network", message: "no reads in this test" } }) as never, nowMs: () => 0 },
    random: fixedRandom,
    readReadiness: async () => (options.read ?? (() => readiness()))(),
    chainCall: fakeXoChain().call,
    sleep: async () => undefined,
    maxPolls: 5,
  });
  const signer = options.signer ?? fakeSigner();
  const acct: TradingAccount = { signer: asLocal(signer), address: signer.address, mode: "derived", funding: null };
  return { venue, relay, bundler, store, storage, signer, acct };
}

function signIn(store: XoCredentialStore): void {
  const credential = XoCredential.from(CREDENTIAL);
  if (credential === null) throw new Error("test credential");
  store.put(OWNER, ACCOUNT, credential);
}

describe("the XO activation", () => {
  it("lists the account setup and the sign-in, runs both with the key and no prompt, then reads ready", async () => {
    let state = readiness();
    const { venue, signer, store, bundler, acct } = rig({ read: () => state });
    expect(await venue.activation.status(acct)).toEqual({ state: "needs_activation", steps: [XO_STEP_SETUP, XO_STEP_SIGN_IN] });
    const progress: string[] = [];
    const result = await venue.activation.activate(acct, (step) => progress.push(step));
    expect(result).toEqual({ ok: true, value: undefined });
    expect(progress).toEqual([XO_STEP_SETUP, XO_STEP_SIGN_IN]);
    // One user operation (the raw userOpHash, personal_sign) and one ClobAuth signature, sent once each.
    expect(signer.calls.filter((call) => call.method === "signRawMessage")).toHaveLength(1);
    expect(signer.calls.filter((call) => call.method === "signTypedData")).toHaveLength(1);
    expect(bundler.seen.filter((request) => request.method === "eth_sendUserOperation")).toHaveLength(1);
    expect(store.get(OWNER, ACCOUNT)).not.toBeNull();
    state = readiness({ deployed: "yes", allowanceMicro: 10n ** 30n, sellApproved: true });
    expect(await venue.activation.status(acct)).toEqual({ state: "ready" });
  });

  it("enables trading on a deployed account without deploying again, and skips the sign-in a tab already holds", async () => {
    const { venue, store, acct } = rig({ read: () => readiness({ deployed: "yes", allowanceMicro: 0n, sellApproved: false }) });
    signIn(store);
    expect(await venue.activation.status(acct)).toEqual({ state: "needs_activation", steps: [XO_STEP_ENABLE] });
  });

  it("is unavailable, in words, without a relay, on a session that cannot sign on 3223 or raw bytes, and when the chain does not answer", async () => {
    expect(await rig({ relay: false }).venue.activation.status(rig().acct)).toEqual({ state: "unavailable", reason: XO_NOT_AVAILABLE });
    const paybox = rig({ signer: fakeSigner({ kind: "walletconnect", chains: [8453, 137] }) });
    expect(await paybox.venue.activation.status(paybox.acct)).toEqual({ state: "unavailable", reason: PAYBOX_CHAIN_WORDS });
    const noRaw = rig({ signer: fakeSigner({ rawMessage: false }) });
    expect(await noRaw.venue.activation.status(noRaw.acct)).toEqual({ state: "unavailable", reason: RAW_SIGNING_WORDS });
    const unknown = rig({ read: () => readiness({ deployed: "unknown" }) });
    const status = await unknown.venue.activation.status(unknown.acct);
    expect(status.state).toBe("unavailable");
    const refused = await unknown.venue.activation.activate(unknown.acct, () => undefined);
    expect(unknown.signer.calls.filter((call) => call.method !== "chainId")).toEqual([]);
  });
});

describe("the ticket's XO calls", () => {
  it("places an order with the account and hands back its hash and XO's status word; nothing before activation", async () => {
    let posted: string | null = null;
    const { venue, store, signer } = rig({ routes: { "GET /book": () => ({ body: BOOK }), "POST /order": (call) => ((posted = call.body), { body: { success: true, orderID: "x", status: "LIVE" } }) } });
    const before = await venue.placeOrder(signer, { tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(!before.ok && before.refusal.code).toBe("not_logged_in");
    signIn(store);
    const placed = await venue.placeOrder(signer, { tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(placed.ok && placed.value.status).toBe("live");
    expect(placed.ok && placed.value.orderId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(posted).not.toBeNull();
    const refused = await rig({ routes: { "GET /book": () => ({ body: BOOK }), "POST /order": () => ({ status: 400, body: { error: "not enough balance" } }) } });
    signIn(refused.store);
    const answer = await refused.venue.placeOrder(refused.signer, { tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(!answer.ok && answer.refusal.code).toBe("venue_refused");
    expect(!answer.ok && answer.refusal.venueText).toContain("not enough balance");
  });

  it("lists the market's orders only, and reads a cancel XO confirmed or refused", async () => {
    const rows = [
      { order_hash: HASH, asset_id: TOKEN_ID, side: "BUY", price: "0.420", original_size: "10", size_matched: "2", status: "LIVE" },
      { order_hash: `0x${"ef".repeat(32)}`, asset_id: "1", side: "SELL", price: "0.300", original_size: "5", size_matched: "0", status: "LIVE" },
    ];
    const { venue, store, signer } = rig({ routes: { "GET /orders": () => ({ body: rows }), "DELETE /order": () => ({ body: { canceled: [HASH], notCanceled: {} } }) } });
    signIn(store);
    const listed = await venue.openOrders(signer, [TOKEN_ID]);
    expect(listed.ok && listed.value.map((order) => [order.id, order.side, order.price, order.originalSize, order.sizeMatched, order.status])).toEqual([[HASH, "BUY", "0.42", "10", "2", "live"]]);
    expect(await venue.cancel(signer, HASH)).toEqual({ ok: true, value: { canceled: [HASH], notCanceled: [] } });
    const notCancelled = rig({ routes: { "DELETE /order": () => ({ body: { canceled: [], notCanceled: { [HASH]: "already filled" } } }) } });
    signIn(notCancelled.store);
    const answer = await notCancelled.venue.cancel(notCancelled.signer, HASH);
    expect(answer.ok && answer.value.notCanceled.map((entry) => entry.id)).toEqual([HASH]);
  });

  it("reports K(E)'s USDC.e as the XO balance in dollar millionths, and an unreadable one as null, never zero", async () => {
    const { venue, acct } = rig({ read: () => readiness({ deployed: "yes", usdcMicro: 12_500_000n }) });
    expect(venue.balance.id).toBe("xo-account");
    expect(await venue.balance.read(acct)).toEqual([{ id: "xo-usdce", label: "XO account (USDC.e)", micros: 12_500_000n }]);
    const unread = rig({ read: () => readiness({ usdcMicro: null }) });
    expect(await unread.venue.balance.read(unread.acct)).toEqual([{ id: "xo-usdce", label: "XO account (USDC.e)", micros: null }]);
  });
});
