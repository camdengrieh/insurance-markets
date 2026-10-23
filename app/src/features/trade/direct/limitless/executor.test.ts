import { describe, expect, it } from "vitest";

import { decodeFunctionData, encodeAbiParameters, erc20Abi, maxUint256, parseAbi, recoverTypedDataAddress, type Hex } from "viem";

import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { hashLimitlessOrder, type LimitlessOrder } from "@sdk/trade/clob/limitless/order";
import { LIMITLESS_EXCHANGES } from "@sdk/trade/clob/venues";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import { buildClobTicket, type ClobMarketFacts, type ClobTicket } from "../../clob-ticket";
import { credentialKey } from "../credentials";
import type { VenueRequest, VenueResponse } from "../http";
import { fakeChain, fakeSigner, fakeVenue, json, MemoryStorage, testDeps, type FakeVenue, type Route } from "../testkit";
import type { DirectAccount, DirectPreparedOrder } from "../types";
import { createLimitlessExecutor, NOT_AVAILABLE, PREPARED_TTL_MS } from "./executor";
import { buildLimitlessHeaders } from "./hmac";

// The direct Limitless path end to end against a scripted relay (answering as Limitless would, marked as the relay
// marks it) and an in-memory Base node: what the wallet is asked to sign, and the exact requests that reach the relay.
// No network; the wallet keys are the public Anvil test keys and the token below is a test value.

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const STRANGER = ANVIL_TEST_ACCOUNTS[1]!;
const SLUG = "will-it-rain-in-test-city-1792756800000";
const YES = "74545983764114334479013489209199340682364685758382950569413632147917995316991";
const NO = "61626535714832143963095226478401016279493533995883896169905600811367354846655";
const EXCHANGE = LIMITLESS_EXCHANGES[0]!;
const ORDER_ID = "6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203";
// Test-only token values.
const TOKEN = { tokenId: "test-only-token-id-0001", secret: "dGVzdC1vbmx5LWxpbWl0bGVzcy1zZWNyZXQtMDAwMQ==" };
const RELAY = `/v1/relay/limitless`;

const FACTS: ClobMarketFacts = { venue: "limitless", marketId: SLUG, tick: "0.001", minSize: "0", polymarketBook: null, fetchedAtMs: 0 };

function ticketOf(over: Partial<{ side: string; price: string; shares: string; tif: string; postOnly: boolean; tokenId: string }> = {}): ClobTicket {
  const built = buildClobTicket({ tokenId: YES, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ttlS: "", postOnly: false, ...over }, FACTS);
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return built.ticket;
}

// An answer Limitless gave, passed on by the relay (x-limitless-relay: upstream).
function upstream(status: number, body: unknown): VenueResponse {
  return { ...json(status, body), marker: "upstream" };
}

// The relay's own refusal (x-limitless-relay: refused).
function refused(status: number, code: string): VenueResponse {
  return { ...json(status, { error: { code, message: "relay words" } }), marker: "refused" };
}

const MARKET = { slug: SLUG, tradeType: "clob", marketType: "single", tokens: { yes: YES, no: NO }, venue: { exchange: EXCHANGE, adapter: null }, metadata: { fee: true } };
const PROFILE = { id: 4242, account: OWNER.address, tradeWalletOption: "eoa", effectiveFeeRateBps: 150 };

function relay(over: Record<string, Route> = {}): FakeVenue {
  return fakeVenue({
    [`GET ${RELAY}/markets/${SLUG}`]: () => upstream(200, MARKET),
    [`GET ${RELAY}/profiles/me`]: () => upstream(200, PROFILE),
    [`GET /v1/markets/limitless/${SLUG}`]: () =>
      json(200, { market: {}, books: [{ tokenId: YES, book: { bids: [{ price: "0.48", size: "100" }], asks: [{ price: "0.53", size: "40" }], asOfMs: 1_792_755_560_000, derived: "native" }, source: { source: "venue_api" } }, { tokenId: NO, book: null, source: { source: null, reason: "not read" } }] }),
    [`POST ${RELAY}/orders`]: () => upstream(201, { order: { id: ORDER_ID, status: "LIVE" }, execution: {} }),
    [`GET ${RELAY}/markets/${SLUG}/user-orders`]: () => upstream(200, [{ id: ORDER_ID, ownerId: 4242, marketId: "1", token: YES, type: "GTC", status: "LIVE", side: "BUY", makerAmount: "5200000", takerAmount: "10000000", price: "0.52", originalSize: "10000000", remainingSize: "4000000", createdAt: "2026-10-23T12:00:00Z" }]),
    [`DELETE ${RELAY}/orders/${ORDER_ID}`]: () => upstream(200, { message: "Order canceled successfully" }),
    ...over,
  });
}

const EOA_NODE = { code: {} };

function deps(v: FakeVenue, options: { readonly loggedIn?: boolean; readonly storage?: MemoryStorage; readonly code?: Record<string, string> } = {}) {
  const storage = options.storage ?? new MemoryStorage();
  if (options.loggedIn !== false) storage.setItem(credentialKey("limitless", OWNER.address), JSON.stringify(TOKEN));
  return testDeps(v, fakeChain({ code: options.code ?? EOA_NODE.code }), storage);
}

function account(over: Partial<DirectAccount> = {}): DirectAccount {
  return { venue: "limitless", chainId: 8453, signer: OWNER.address, maker: OWNER.address, label: "your wallet itself", signatureType: 0, makerIsSigner: true, ...over };
}

function pathOf(request: VenueRequest): string {
  const url = new URL(request.url);
  return `${request.method} ${url.pathname}${url.search}`;
}

// The headers a request should carry: the page's own signer over Limitless's path, at the page clock.
async function expectSigned(request: VenueRequest, method: "GET" | "POST" | "DELETE", pathWithQuery: string): Promise<void> {
  const expected = await buildLimitlessHeaders({ token: TOKEN, timestampIso: "2026-10-23T11:39:23Z", method, pathWithQuery, body: request.body ?? "" });
  expect(request.headers).toMatchObject(expected);
  expect(request.marker).toBe("x-limitless-relay");
}

describe("readiness: an EOA on Base, through our markets API", () => {
  it("offers the wallet itself as an EOA maker after reading its code on Base", async () => {
    const executor = createLimitlessExecutor(deps(relay()));
    const ready = await executor.ready(fakeSigner(OWNER));
    expect(ready.ok && ready.value.accounts).toEqual([account()]);
    expect(executor.available).toBe(true);
  });

  it("refuses a contract wallet, a session without Base, and a build with no markets API, before any venue request", async () => {
    const v = relay();
    const contract = await createLimitlessExecutor(deps(v, { code: { [OWNER.address.toLowerCase()]: "0x6080604052" } })).ready(fakeSigner(OWNER));
    expect(!contract.ok && contract.refusal.code).toBe("account_refused");
    const delegated = await createLimitlessExecutor(deps(v, { code: { [OWNER.address.toLowerCase()]: `0xef0100${"11".repeat(20)}` } })).ready(fakeSigner(OWNER));
    expect(delegated.ok).toBe(true);
    const noBase = await createLimitlessExecutor(deps(v)).ready(fakeSigner(OWNER, { capabilities: { chains: [137] } }));
    expect(!noBase.ok && noBase.refusal.code).toBe("wallet_wrong_chain");
    const none = createLimitlessExecutor(deps(v), null);
    expect(none.available).toBe(false);
    const noRelay = await none.ready(fakeSigner(OWNER));
    expect(!noRelay.ok && noRelay.refusal.message).toBe(NOT_AVAILABLE);
    expect(v.requests).toEqual([]);
  });
});

describe("the pasted token", () => {
  it("is checked with Limitless (a signed GET /profiles/me through the relay) and kept for this tab only, keyed by the wallet", async () => {
    const v = relay();
    const storage = new MemoryStorage();
    const executor = createLimitlessExecutor(deps(v, { loggedIn: false, storage }));
    const signer = fakeSigner(OWNER);
    expect(executor.session(signer)).toBeNull();
    const session = await executor.connect(signer, `  ${TOKEN.tokenId} `, TOKEN.secret);
    expect(session.ok && session.value.keyTag).toMatch(/^li[0-9a-f]{8}$/);
    expect(session.ok && session.value.keyTag.includes(TOKEN.tokenId)).toBe(false);
    expect(v.requests.map(pathOf)).toEqual([`GET ${RELAY}/profiles/me`]);
    expect(v.requests[0]?.url.startsWith(`${MARKETS_API_ORIGIN}${RELAY}`)).toBe(true);
    await expectSigned(v.requests[0]!, "GET", "/profiles/me");
    expect(v.requests[0]?.headers?.["lmts-api-key"]).toBe(TOKEN.tokenId);
    expect(JSON.stringify(v.requests[0])).not.toContain(TOKEN.secret);
    expect([...storage.items.keys()]).toEqual([credentialKey("limitless", OWNER.address)]);
    expect(executor.session(signer)?.keyTag).toBe(session.ok ? session.value.keyTag : null);
    // Another wallet in the same tab never sees it.
    expect(executor.session(fakeSigner(STRANGER))).toBeNull();
    executor.logout(signer);
    expect(storage.items.size).toBe(0);
  });

  it("is refused when it is not a token, belongs to another account, is in smart-wallet mode or Limitless refuses it; nothing is kept", async () => {
    const cases: Array<[Route | null, string, string, string]> = [
      [null, "has space", TOKEN.secret, "not_logged_in"],
      [null, TOKEN.tokenId, "not base64!", "not_logged_in"],
      [() => upstream(200, { ...PROFILE, account: STRANGER.address }), TOKEN.tokenId, TOKEN.secret, "account_refused"],
      [() => upstream(200, { ...PROFILE, tradeWalletOption: "smartWallet" }), TOKEN.tokenId, TOKEN.secret, "account_refused"],
      [() => upstream(401, { message: "Invalid signature" }), TOKEN.tokenId, TOKEN.secret, "not_logged_in"],
      [() => refused(429, "rate_limited"), TOKEN.tokenId, TOKEN.secret, "venue_refused"],
    ];
    for (const [route, id, key, code] of cases) {
      const storage = new MemoryStorage();
      const v = relay(route === null ? {} : { [`GET ${RELAY}/profiles/me`]: route });
      const answer = await createLimitlessExecutor(deps(v, { loggedIn: false, storage })).connect(fakeSigner(OWNER), id, key);
      expect(!answer.ok && answer.refusal.code, `${id} ${code}`).toBe(code);
      expect(!answer.ok && JSON.stringify(answer.refusal)).not.toContain(TOKEN.secret);
      expect(storage.items.size).toBe(0);
      if (route === null) expect(v.requests).toEqual([]);
    }
  });
});

describe("an order: prepared, shown, signed by the wallet, sent once", () => {
  it("builds the EOA order for the pinned exchange with the profile's fee rate on a fee-enabled market, and signs nothing", async () => {
    const v = relay();
    const signer = fakeSigner(OWNER);
    const executor = createLimitlessExecutor(deps(v));
    const prepared = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: "Yes" });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(signer.typedData).toEqual([]);
    const fields = Object.fromEntries(prepared.value.card.fields.map((field) => [`${field.group}.${field.name}`, field.value]));
    expect(fields).toMatchObject({
      "domain.name": "Limitless CTF Exchange",
      "domain.version": "1",
      "domain.chainId": "8453",
      "domain.verifyingContract": EXCHANGE,
      "message.maker": OWNER.address,
      "message.signer": OWNER.address,
      "message.taker": "0x0000000000000000000000000000000000000000",
      "message.tokenId": YES,
      "message.makerAmount": "5200000",
      "message.takerAmount": "10000000",
      "message.expiration": "0",
      "message.nonce": "0",
      "message.feeRateBps": "150",
      "message.side": "0",
      "message.signatureType": "0",
      "wire.orderType": "GTC",
      "wire.price": "0.52",
      "wire.ownerId": "4242",
      "wire.marketSlug": SLUG,
    });
    const order: LimitlessOrder = { salt: BigInt(fields["message.salt"] ?? "0"), maker: OWNER.address, signer: OWNER.address, taker: "0x0000000000000000000000000000000000000000", tokenId: BigInt(YES), makerAmount: 5_200_000n, takerAmount: 10_000_000n, expiration: 0n, nonce: 0n, feeRateBps: 150n, side: 0, signatureType: 0 };
    expect(prepared.value.card.digest).toBe(hashLimitlessOrder(order, EXCHANGE));
    expect(prepared.value.card.lines.join(" ")).toContain("best bid 0.48, best ask 0.53");
    expect(prepared.value.card.worstCase).toMatch(/USDC$/);
    expect(v.requests.map(pathOf).sort()).toEqual([`GET ${RELAY}/markets/${SLUG}`, `GET ${RELAY}/profiles/me`, `GET /v1/markets/limitless/${SLUG}`].sort());
    // The market record is a public read: no token header rides with it.
    expect(v.requests.find((request) => pathOf(request) === `GET ${RELAY}/markets/${SLUG}`)?.headers?.["lmts-api-key"]).toBeUndefined();
  });

  it("signs 0 on a fee-free or COLLATERAL market, and refuses an unpinned exchange, a fee-enabled market without a profile rate, a foreign token and FOK", async () => {
    const run = async (market: unknown, profile: unknown = PROFILE, ticket = ticketOf()) => {
      const v = relay({ [`GET ${RELAY}/markets/${SLUG}`]: () => upstream(200, market), [`GET ${RELAY}/profiles/me`]: () => upstream(200, profile) });
      return createLimitlessExecutor(deps(v)).prepareOrder(fakeSigner(OWNER), account(), { ticket, facts: FACTS, outcome: null });
    };
    const feeOf = (result: Awaited<ReturnType<typeof run>>) => (result.ok ? result.value.card.fields.find((field) => field.name === "feeRateBps")?.value : result.refusal.code);
    expect(feeOf(await run({ ...MARKET, metadata: { fee: false } }))).toBe("0");
    expect(feeOf(await run({ ...MARKET, venue: { exchange: EXCHANGE, feeModuleType: "COLLATERAL" } }))).toBe("0");
    expect(feeOf(await run({ ...MARKET, venue: { exchange: `0x${"12".repeat(20)}` } }))).toBe("invalid_order");
    expect(feeOf(await run(MARKET, { ...PROFILE, effectiveFeeRateBps: null }))).toBe("invalid_order");
    expect(feeOf(await run({ ...MARKET, metadata: {} }))).toBe("venue_refused");
    expect(feeOf(await run({ ...MARKET, tradeType: "amm" }))).toBe("invalid_order");
    expect(feeOf(await run({ ...MARKET, tokens: { yes: NO, no: "1" } }, PROFILE, ticketOf({ tokenId: YES })))).toBe("invalid_order");
    expect(feeOf(await run(MARKET, PROFILE, ticketOf({ tif: "FOK" })))).toBe("invalid_order");
    expect(feeOf(await run({ ...MARKET, slug: "another-market" }))).toBe("venue_refused");
  });

  it("asks the wallet for exactly the card's typed data, checks the signature, and POSTs /orders once with the documented body and a signed request", async () => {
    const v = relay();
    const signer = fakeSigner(OWNER);
    const executor = createLimitlessExecutor(deps(v));
    const prepared = await executor.prepareOrder(signer, account(), { ticket: ticketOf({ postOnly: true }), facts: FACTS, outcome: "Yes" });
    if (!prepared.ok) throw new Error(prepared.refusal.message);
    v.requests.length = 0;
    const placed = await executor.placeOrder(signer, prepared.value);
    expect(placed).toEqual({ ok: true, value: { orderId: ORDER_ID, status: "live", venueText: null } });
    expect(signer.typedData).toHaveLength(1);
    const sent = (JSON.parse(v.requests[0]?.body ?? "{}") as { order: { signature: Hex } }).order.signature;
    expect(await recoverTypedDataAddress({ ...signer.typedData[0]!, signature: sent } as Parameters<typeof recoverTypedDataAddress>[0])).toBe(OWNER.address);
    expect(v.requests.map(pathOf)).toEqual([`POST ${RELAY}/orders`]);
    const body = JSON.parse(v.requests[0]?.body ?? "{}") as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["marketSlug", "order", "orderType", "ownerId", "postOnly"]);
    expect(body).toMatchObject({ ownerId: 4242, orderType: "GTC", marketSlug: SLUG, postOnly: true });
    expect(body["order"]).toMatchObject({ maker: OWNER.address, signer: OWNER.address, tokenId: YES, makerAmount: 5_200_000, takerAmount: 10_000_000, expiration: "0", nonce: 0, price: 0.52, feeRateBps: 150, side: 0, signatureType: 0 });
    expect(typeof (body["order"] as Record<string, unknown>)["salt"]).toBe("string");
    await expectSigned(v.requests[0]!, "POST", "/orders");
    // Sent once: the handle is spent.
    const again = await executor.placeOrder(signer, prepared.value);
    expect(!again.ok && again.refusal.code).toBe("invalid_order");
    expect(v.requests).toHaveLength(1);
  });

  it("sends nothing when the wallet declines, signs with another key, or the card is stale", async () => {
    const v = relay();
    const run = async (signer: ReturnType<typeof fakeSigner>, advanceMs = 0): Promise<string> => {
      const d = deps(v);
      const executor = createLimitlessExecutor(d);
      const prepared = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
      if (!prepared.ok) throw new Error(prepared.refusal.message);
      d.clock.now += advanceMs;
      const placed = await executor.placeOrder(signer, prepared.value as DirectPreparedOrder);
      return placed.ok ? "ok" : placed.refusal.code;
    };
    expect(await run(fakeSigner(OWNER, { signs: "reject" }))).toBe("wallet_rejected");
    expect(await run(fakeSigner(OWNER, { signs: { with: STRANGER } }))).toBe("signature_mismatch");
    expect(await run(fakeSigner(OWNER), PREPARED_TTL_MS + 1)).toBe("invalid_order");
    expect(v.requests.filter((request) => request.method === "POST")).toEqual([]);
  });

  it("reports a send with no usable answer as unknown, never retried, and Limitless's refusal in its own words", async () => {
    const outcomes: Array<[Route, string]> = [
      [() => refused(504, "upstream_timeout"), "venue_ambiguous"],
      [() => upstream(500, { message: "internal" }), "venue_ambiguous"],
      [() => upstream(201, { execution: {} }), "venue_ambiguous"],
      [() => upstream(400, { message: ["order.price must be a multiple of 0.001"] }), "venue_refused"],
      [() => refused(429, "rate_limited"), "venue_refused"],
      [
        () => {
          throw new Error("network");
        },
        "venue_ambiguous",
      ],
    ];
    for (const [route, code] of outcomes) {
      const v = relay({ [`POST ${RELAY}/orders`]: route });
      const signer = fakeSigner(OWNER);
      const executor = createLimitlessExecutor(deps(v));
      const prepared = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
      if (!prepared.ok) throw new Error(prepared.refusal.message);
      const placed = await executor.placeOrder(signer, prepared.value);
      expect(!placed.ok && placed.refusal.code).toBe(code);
      expect(v.requests.filter((request) => request.method === "POST")).toHaveLength(1);
      if (code === "venue_refused" && !placed.ok && placed.refusal.message.startsWith("Limitless")) expect(placed.refusal.venueText).toBe("order.price must be a multiple of 0.001");
    }
  });
});

describe("open orders and cancel", () => {
  it("lists this market's orders with the token, sizes in shares, and cancels one by its id", async () => {
    const v = relay();
    const signer = fakeSigner(OWNER);
    const executor = createLimitlessExecutor(deps(v));
    const listed = await executor.openOrders(signer, { market: SLUG });
    expect(listed).toEqual({ ok: true, value: { orders: [{ id: ORDER_ID, side: "BUY", price: "0.52", originalSize: "10", sizeMatched: "6", tokenId: YES, maker: null, status: "LIVE", outcome: null }], more: false } });
    expect(v.requests.map(pathOf)).toEqual([`GET ${RELAY}/markets/${SLUG}/user-orders?limit=100`]);
    await expectSigned(v.requests[0]!, "GET", `/markets/${SLUG}/user-orders?limit=100`);
    const cancelled = await executor.cancel(signer, ORDER_ID);
    expect(cancelled).toEqual({ ok: true, value: { canceled: [ORDER_ID], notCanceled: [] } });
    await expectSigned(v.requests[1]!, "DELETE", `/orders/${ORDER_ID}`);
    expect(v.requests[1]?.body).toBeUndefined();
  });

  it("says why a cancel did not happen, calls a lost answer unknown, and asks for a token first", async () => {
    const notFound = await createLimitlessExecutor(deps(relay({ [`DELETE ${RELAY}/orders/${ORDER_ID}`]: () => upstream(404, { message: "Order not found" }) }))).cancel(fakeSigner(OWNER), ORDER_ID);
    expect(notFound).toEqual({ ok: true, value: { canceled: [], notCanceled: [{ id: ORDER_ID, reason: "Order not found" }] } });
    const lost = await createLimitlessExecutor(deps(relay({ [`DELETE ${RELAY}/orders/${ORDER_ID}`]: () => refused(504, "upstream_timeout") }))).cancel(fakeSigner(OWNER), ORDER_ID);
    expect(!lost.ok && lost.refusal.code).toBe("venue_ambiguous");
    const v = relay();
    const anonymous = createLimitlessExecutor(deps(v, { loggedIn: false }));
    expect((await anonymous.openOrders(fakeSigner(OWNER), { market: SLUG })).ok).toBe(false);
    expect((await anonymous.cancel(fakeSigner(OWNER), ORDER_ID)).ok).toBe(false);
    expect((await createLimitlessExecutor(deps(v)).cancel(fakeSigner(OWNER), "not-an-id")).ok).toBe(false);
    expect(v.requests).toEqual([]);
  });
});

const READS = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)", "function isApprovedForAll(address, address) view returns (bool)", "function balanceOf(address, uint256) view returns (uint256)"]);

describe("USDC and approvals on Base", () => {
  it("reads the wallet's USDC, its allowance and the Conditional Tokens approval for the pinned exchange, and builds the approvals", async () => {
    const chain = fakeChain({
      call: (to, data) => {
        const { functionName, args } = decodeFunctionData({ abi: READS, data });
        if (to === LIMITLESS_USDC.toLowerCase() && functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [25_000_000n]);
        if (to === LIMITLESS_USDC.toLowerCase() && functionName === "allowance") return args?.[1] === EXCHANGE ? encodeAbiParameters([{ type: "uint256" }], [1_000_000n]) : null;
        if (to === LIMITLESS_CONDITIONAL_TOKENS.toLowerCase() && functionName === "isApprovedForAll") return encodeAbiParameters([{ type: "bool" }], [false]);
        if (to === LIMITLESS_CONDITIONAL_TOKENS.toLowerCase() && functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [3_000_000n]);
        return null;
      },
    });
    const executor = createLimitlessExecutor({ ...testDeps(relay(), chain), chain: () => chain });
    const funding = await executor.funding(account(), YES);
    expect(funding.ok && funding.value).toMatchObject({ collateralSymbol: "USDC", collateralBalance: 25_000_000n, shareBalance: 3_000_000n });
    expect(funding.ok && funding.value.approvals.map((entry) => [entry.id, entry.token, entry.spender, entry.granted, entry.allowance])).toEqual([
      ["collateral", LIMITLESS_USDC, EXCHANGE, true, 1_000_000n],
      ["positions", LIMITLESS_CONDITIONAL_TOKENS, EXCHANGE, false, null],
    ]);
    if (!funding.ok) return;
    const exact = executor.approval(account(), funding.value.approvals[0]!, { kind: "exact", atomic: 5_720_000n });
    expect(exact.request).toMatchObject({ chainId: 8453, to: LIMITLESS_USDC });
    expect(decodeFunctionData({ abi: erc20Abi, data: exact.request.data as Hex }).args).toEqual([EXCHANGE, 5_720_000n]);
    const unlimited = executor.approval(account(), funding.value.approvals[0]!, { kind: "unlimited" });
    expect(decodeFunctionData({ abi: erc20Abi, data: unlimited.request.data as Hex }).args).toEqual([EXCHANGE, maxUint256]);
    // A wallet that sends transactions is asked once, on Base; one that only signs (PayBox over WalletConnect) is told so.
    const sender = fakeSigner(OWNER, { txHash: `0x${"aa".repeat(32)}` });
    expect(await executor.sendApproval(sender, account(), exact)).toEqual({ ok: true, value: `0x${"aa".repeat(32)}` });
    expect(sender.switches).toEqual([8453]);
    expect(sender.transactions).toHaveLength(1);
    const signOnly = fakeSigner(OWNER, { capabilities: { sendTransaction: false } });
    expect(executor.approvalBlocker(signOnly)).toMatch(/PayBox over WalletConnect/);
    const blocked = await executor.sendApproval(signOnly, account(), exact);
    expect(!blocked.ok && blocked.refusal.code).toBe("account_refused");
  });
});
