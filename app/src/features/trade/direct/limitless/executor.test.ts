import { describe, expect, it } from "vitest";

import { decodeFunctionData, encodeAbiParameters, erc20Abi, hexToString, maxUint256, parseAbi, recoverMessageAddress, recoverTypedDataAddress, type Hex } from "viem";

import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { hashLimitlessOrder, type LimitlessOrder } from "@sdk/trade/clob/limitless/order";
import { LIMITLESS_EXCHANGES } from "@sdk/trade/clob/venues";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import { buildClobTicket, type ClobMarketFacts, type ClobTicket } from "../../clob-ticket";
import type { TradingAccount } from "../../../account/types";
import { credentialKey } from "../credentials";
import type { VenueRequest, VenueResponse } from "../http";
import { PROOF_HEADER, proofText } from "../../../account/proof";
import { asLocal, fakeChain, fakeSigner, fakeVenue, json, MemoryStorage, testDeps, TEST_NOW_MS, type FakeVenue, type Route } from "../testkit";
import type { DirectAccount, DirectPreparedOrder } from "../types";
import { limitlessActivation, LIMITLESS_STEP_REGISTER } from "./activation";
import { ALREADY_HAS_ACCOUNT, createLimitlessExecutor, NOT_AVAILABLE, PREPARED_TTL_MS } from "./executor";

// The Limitless path of the trading account end to end against a scripted partner relay (answering as our markets API
// and Limitless would, marked as the relay marks them) and an in-memory Base node: what the key signs, and the exact
// requests that reach the relay. No network; the keys are the public Anvil test keys. No Limitless token exists on the
// page any more: the relay holds the operator's.

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const STRANGER = ANVIL_TEST_ACCOUNTS[1]!;
const SLUG = "will-it-rain-in-test-city-1792756800000";
const YES = "74545983764114334479013489209199340682364685758382950569413632147917995316991";
const NO = "61626535714832143963095226478401016279493533995883896169905600811367354846655";
const EXCHANGE = LIMITLESS_EXCHANGES[0]!;
const ORDER_ID = "6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203";
const RELAY = "/v1/relay/limitless";
// A sign-in text of the live form (note 44 section 2.1), with a test nonce.
const SIGNING_TEXT = `Welcome to Limitless Exchange!\n\nThis request will not trigger a blockchain transaction or cost any gas fees.\n\nSignature is required to authenticate an upcoming API request.\n\nNonce: 0x${"ab".repeat(32)}`;

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

// The relay's own answer (its refusals, and the routes it composes such as register).
function own(status: number, body: unknown): VenueResponse {
  return { ...json(status, body), marker: "refused" };
}

const MARKET = { slug: SLUG, tradeType: "clob", marketType: "single", tokens: { yes: YES, no: NO }, venue: { exchange: EXCHANGE, adapter: null }, metadata: { fee: false } };

function relay(over: Record<string, Route> = {}): FakeVenue {
  return fakeVenue({
    [`GET ${RELAY}/signing-message`]: () => ({ status: 200, text: SIGNING_TEXT, marker: "upstream" }),
    [`POST ${RELAY}/register`]: () => own(200, { profileId: 4242 }),
    [`GET ${RELAY}/markets/${SLUG}`]: () => upstream(200, MARKET),
    [`POST ${RELAY}/orders`]: () => upstream(201, { order: { id: ORDER_ID, status: "LIVE" }, execution: {} }),
    [`GET ${RELAY}/orders`]: () => upstream(200, [{ id: ORDER_ID, token: YES, type: "GTC", status: "LIVE", side: "BUY", price: "0.52", originalSize: "10000000", remainingSize: "4000000" }]),
    [`POST ${RELAY}/orders/cancel`]: () => upstream(200, { message: "Order canceled successfully" }),
    ...over,
  });
}

function deps(v: FakeVenue, options: { readonly registered?: boolean; readonly storage?: MemoryStorage; readonly code?: Record<string, string>; readonly call?: Parameters<typeof fakeChain>[0]["call"] } = {}) {
  const storage = options.storage ?? new MemoryStorage();
  if (options.registered !== false) storage.setItem(credentialKey("limitless", OWNER.address), JSON.stringify({ profileId: 4242 }));
  return testDeps(v, fakeChain({ code: options.code ?? {}, ...(options.call === undefined ? {} : { call: options.call }) }), storage);
}

function account(over: Partial<DirectAccount> = {}): DirectAccount {
  return { venue: "limitless", chainId: 8453, signer: OWNER.address, maker: OWNER.address, label: "your trading account", signatureType: 0, makerIsSigner: true, ...over };
}

function pathOf(request: VenueRequest): string {
  const url = new URL(request.url);
  return `${request.method} ${url.pathname}${url.search}`;
}

// The ownership proof a request carries recovers to the trading key over the documented text (design section 3.3).
async function expectProof(request: VenueRequest, method: "GET" | "POST", path: string): Promise<void> {
  const header = request.headers?.[PROOF_HEADER] ?? "";
  const [who, seconds, signature] = header.split(".");
  expect(who).toBe(OWNER.address);
  expect(Number(seconds)).toBe(Math.floor(TEST_NOW_MS / 1000));
  const text = proofText(method, path, Number(seconds), request.body ?? "");
  expect(await recoverMessageAddress({ message: text, signature: signature as Hex })).toBe(OWNER.address);
}

describe("readiness: an EOA on Base, through our markets API", () => {
  it("offers the key itself as the maker after reading its code on Base; an EIP-7702 delegation still counts", async () => {
    const ready = await createLimitlessExecutor(deps(relay())).ready(fakeSigner(OWNER));
    expect(ready.ok && ready.value.accounts).toEqual([account()]);
    const delegated = await createLimitlessExecutor(deps(relay(), { code: { [OWNER.address.toLowerCase()]: `0xef0100${"11".repeat(20)}` } })).ready(fakeSigner(OWNER));
    expect(delegated.ok).toBe(true);
  });

  it("refuses a contract address and a build with no markets API, before any request", async () => {
    const v = relay();
    const contract = await createLimitlessExecutor(deps(v, { code: { [OWNER.address.toLowerCase()]: "0x6080604052" } })).ready(fakeSigner(OWNER));
    expect(!contract.ok && contract.refusal.code).toBe("account_refused");
    const none = createLimitlessExecutor(deps(v), null);
    expect(none.available).toBe(false);
    const noRelay = await none.ready(fakeSigner(OWNER));
    expect(!noRelay.ok && noRelay.refusal.message).toBe(NOT_AVAILABLE);
    expect(v.requests).toEqual([]);
  });
});

describe("registration as our partner sub-account", () => {
  it("reads Limitless's text through the relay, has the key personal_sign it, and registers the address; the profile id is kept for this tab", async () => {
    const v = relay();
    const storage = new MemoryStorage();
    const executor = createLimitlessExecutor(deps(v, { registered: false, storage }));
    const signer = fakeSigner(OWNER);
    expect(executor.session(signer)).toBeNull();
    const session = await executor.login(signer);
    expect(session).toEqual({ ok: true, value: { venue: "limitless", address: OWNER.address, keyTag: "profile 4242" } });
    expect(v.requests.map(pathOf)).toEqual([`GET ${RELAY}/signing-message`, `POST ${RELAY}/register`]);
    expect(v.requests.every((request) => request.url.startsWith(`${MARKETS_API_ORIGIN}${RELAY}`))).toBe(true);
    const body = JSON.parse(v.requests[1]?.body ?? "{}") as { account: string; signingMessageHex: Hex; signature: Hex };
    expect(Object.keys(body).sort()).toEqual(["account", "signature", "signingMessageHex"]);
    expect(body.account).toBe(OWNER.address);
    expect(hexToString(body.signingMessageHex)).toBe(SIGNING_TEXT);
    expect(await recoverMessageAddress({ message: SIGNING_TEXT, signature: body.signature })).toBe(OWNER.address);
    // No Limitless credential header leaves the page.
    expect(JSON.stringify(v.requests)).not.toMatch(/lmts-/);
    expect(executor.session(signer)?.keyTag).toBe("profile 4242");
    expect(executor.session(fakeSigner(STRANGER))).toBeNull();
    executor.logout(signer);
    expect(storage.items.size).toBe(0);
  });

  it("says plainly that an address with its own Limitless account cannot be reached, and remembers it for this tab", async () => {
    const v = relay({ [`POST ${RELAY}/register`]: () => own(409, { error: { code: "conflict", message: "this wallet already has a Limitless account" } }) });
    const executor = createLimitlessExecutor(deps(v, { registered: false }));
    const signer = fakeSigner(OWNER);
    const refused = await executor.login(signer);
    expect(!refused.ok && refused.refusal).toMatchObject({ code: "account_refused", message: ALREADY_HAS_ACCOUNT });
    expect(executor.foreign(signer)).toBe(true);
    expect(executor.session(signer)).toBeNull();
    const status = await limitlessActivation(executor).status({ signer: asLocal(signer), address: OWNER.address, mode: "derived", funding: null });
    expect(status).toEqual({ state: "unavailable", reason: ALREADY_HAS_ACCOUNT });
  });

  it("signs nothing when the text is unreadable, and keeps nothing when the relay refuses", async () => {
    const garbled = relay({ [`GET ${RELAY}/signing-message`]: () => ({ status: 200, text: "\u0000", marker: "upstream" }) });
    const signer = fakeSigner(OWNER);
    const bad = await createLimitlessExecutor(deps(garbled, { registered: false })).login(signer);
    expect(!bad.ok && bad.refusal.code).toBe("venue_refused");
    expect(garbled.requests.map(pathOf)).toEqual([`GET ${RELAY}/signing-message`]);
    const storage = new MemoryStorage();
    const off = await createLimitlessExecutor(deps(relay({ [`POST ${RELAY}/register`]: () => own(503, { error: { code: "relay_not_enabled", message: "off" } }) }), { registered: false, storage })).login(signer);
    expect(!off.ok && off.refusal.code).toBe("venue_refused");
    expect(storage.items.size).toBe(0);
  });
});

describe("an order: built, signed by the key, sent once through the partner relay", () => {
  it("builds the EOA order for the pinned exchange, signs nothing while building, and posts {account, order, orderType, marketSlug}", async () => {
    const v = relay();
    const signer = fakeSigner(OWNER);
    const executor = createLimitlessExecutor(deps(v));
    const prepared = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: "Yes" });
    if (!prepared.ok) throw new Error(prepared.refusal.message);
    expect(signer.typedData).toEqual([]);
    const fields = Object.fromEntries(prepared.value.card.fields.map((field) => [`${field.group}.${field.name}`, field.value]));
    expect(fields).toMatchObject({ "domain.verifyingContract": EXCHANGE, "message.maker": OWNER.address, "message.signer": OWNER.address, "message.feeRateBps": "0", "message.signatureType": "0", "wire.account": OWNER.address, "wire.marketSlug": SLUG });
    const order: LimitlessOrder = { salt: BigInt(fields["message.salt"] ?? "0"), maker: OWNER.address, signer: OWNER.address, taker: "0x0000000000000000000000000000000000000000", tokenId: BigInt(YES), makerAmount: 5_200_000n, takerAmount: 10_000_000n, expiration: 0n, nonce: 0n, feeRateBps: 0n, side: 0, signatureType: 0 };
    expect(prepared.value.card.digest).toBe(hashLimitlessOrder(order, EXCHANGE));
    v.requests.length = 0;
    const placed = await executor.placeOrder(signer, prepared.value);
    expect(placed).toEqual({ ok: true, value: { orderId: ORDER_ID, status: "live", venueText: null } });
    expect(v.requests.map(pathOf)).toEqual([`POST ${RELAY}/orders`]);
    const body = JSON.parse(v.requests[0]?.body ?? "{}") as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["account", "marketSlug", "order", "orderType"]);
    expect(body).toMatchObject({ account: OWNER.address, orderType: "GTC", marketSlug: SLUG });
    expect(body["order"]).toMatchObject({ maker: OWNER.address, signer: OWNER.address, tokenId: YES, makerAmount: 5_200_000, takerAmount: 10_000_000, expiration: "0", nonce: 0, price: 0.52, feeRateBps: 0, side: 0, signatureType: 0 });
    const sent = (body["order"] as { signature: Hex }).signature;
    expect(await recoverTypedDataAddress({ ...signer.typedData[0]!, signature: sent } as Parameters<typeof recoverTypedDataAddress>[0])).toBe(OWNER.address);
    const again = await executor.placeOrder(signer, prepared.value);
    expect(!again.ok && again.refusal.code).toBe("invalid_order");
    expect(v.requests).toHaveLength(1);
  });

  it("on a fee-enabled market signs 0, then once more at the rate a FEE_RATE_MISMATCH names, and remembers it for the account", async () => {
    let posts = 0;
    const v = relay({
      [`GET ${RELAY}/markets/${SLUG}`]: () => upstream(200, { ...MARKET, metadata: { fee: true } }),
      [`POST ${RELAY}/orders`]: (request) => {
        posts += 1;
        const fee = (JSON.parse(request.body ?? "{}") as { order: { feeRateBps: number } }).order.feeRateBps;
        return fee === 150 ? upstream(201, { order: { id: ORDER_ID, status: "LIVE" } }) : upstream(400, { code: "FEE_RATE_MISMATCH", expectedFeeRateBps: 150 });
      },
    });
    const signer = fakeSigner(OWNER);
    const executor = createLimitlessExecutor(deps(v));
    const first = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    if (!first.ok) throw new Error(first.refusal.message);
    const placed = await executor.placeOrder(signer, first.value);
    expect(placed.ok).toBe(true);
    expect(posts).toBe(2);
    expect(signer.typedData).toHaveLength(2);
    // The next order starts at the rate Limitless named: one post.
    const second = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    if (!second.ok) throw new Error(second.refusal.message);
    expect(second.value.card.fields.find((field) => field.name === "feeRateBps")?.value).toBe("150");
    await executor.placeOrder(signer, second.value);
    expect(posts).toBe(3);
  });

  it("refuses an unpinned exchange, an unknown fee flag, a foreign token, FOK and post-only, and an unregistered account", async () => {
    const run = async (market: unknown, ticket = ticketOf(), registered = true) => {
      const v = relay({ [`GET ${RELAY}/markets/${SLUG}`]: () => upstream(200, market) });
      return createLimitlessExecutor(deps(v, { registered })).prepareOrder(fakeSigner(OWNER), account(), { ticket, facts: FACTS, outcome: null });
    };
    const codeOf = (result: Awaited<ReturnType<typeof run>>) => (result.ok ? "ok" : result.refusal.code);
    expect(codeOf(await run({ ...MARKET, venue: { exchange: EXCHANGE, feeModuleType: "COLLATERAL" } }))).toBe("ok");
    expect(codeOf(await run({ ...MARKET, venue: { exchange: `0x${"12".repeat(20)}` } }))).toBe("invalid_order");
    expect(codeOf(await run({ ...MARKET, metadata: {} }))).toBe("venue_refused");
    expect(codeOf(await run({ ...MARKET, tokens: { yes: NO, no: "1" } }))).toBe("invalid_order");
    expect(codeOf(await run(MARKET, ticketOf({ tif: "FOK" })))).toBe("invalid_order");
    expect(codeOf(await run(MARKET, ticketOf({ postOnly: true })))).toBe("invalid_order");
    expect(codeOf(await run(MARKET, ticketOf(), false))).toBe("not_logged_in");
  });

  it("sends nothing when the key signs with another account or the order is stale; a lost answer is unknown, never retried", async () => {
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
    expect(await run(fakeSigner(OWNER, { signs: { with: STRANGER } }))).toBe("signature_mismatch");
    expect(await run(fakeSigner(OWNER), PREPARED_TTL_MS + 1)).toBe("invalid_order");
    expect(v.requests.filter((request) => request.method === "POST")).toEqual([]);
    const outcomes: Array<[Route, string]> = [
      [() => own(504, { error: { code: "upstream_timeout", message: "late" } }), "venue_ambiguous"],
      [() => upstream(201, { execution: {} }), "venue_ambiguous"],
      [() => upstream(400, { message: ["order.price must be a multiple of 0.001"] }), "venue_refused"],
      [
        () => {
          throw new Error("network");
        },
        "venue_ambiguous",
      ],
    ];
    for (const [route, code] of outcomes) {
      const venue = relay({ [`POST ${RELAY}/orders`]: route });
      const signer = fakeSigner(OWNER);
      const executor = createLimitlessExecutor(deps(venue));
      const prepared = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
      if (!prepared.ok) throw new Error(prepared.refusal.message);
      const placed = await executor.placeOrder(signer, prepared.value);
      expect(!placed.ok && placed.refusal.code).toBe(code);
      expect(venue.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    }
  });
});

describe("open orders and cancel, each with the key's ownership proof", () => {
  it("lists this market's orders for the account and cancels one by its id", async () => {
    const v = relay();
    const signer = fakeSigner(OWNER);
    const executor = createLimitlessExecutor(deps(v));
    const listed = await executor.openOrders(signer, { market: SLUG });
    expect(listed).toEqual({ ok: true, value: { orders: [{ id: ORDER_ID, side: "BUY", price: "0.52", originalSize: "10", sizeMatched: "6", tokenId: YES, maker: null, status: "LIVE", outcome: null }], more: false } });
    expect(pathOf(v.requests[0]!)).toBe(`GET ${RELAY}/orders?account=${OWNER.address}&marketSlug=${SLUG}`);
    await expectProof(v.requests[0]!, "GET", `${RELAY}/orders?account=${OWNER.address}&marketSlug=${SLUG}`);
    const cancelled = await executor.cancel(signer, ORDER_ID);
    expect(cancelled).toEqual({ ok: true, value: { canceled: [ORDER_ID], notCanceled: [] } });
    expect(JSON.parse(v.requests[1]?.body ?? "{}")).toEqual({ account: OWNER.address, orderId: ORDER_ID });
    await expectProof(v.requests[1]!, "POST", `${RELAY}/orders/cancel`);
  });

  it("says why a cancel did not happen, calls a lost answer unknown, and asks for activation first", async () => {
    const notFound = await createLimitlessExecutor(deps(relay({ [`POST ${RELAY}/orders/cancel`]: () => upstream(404, { message: "Order not found" }) }))).cancel(fakeSigner(OWNER), ORDER_ID);
    expect(notFound).toEqual({ ok: true, value: { canceled: [], notCanceled: [{ id: ORDER_ID, reason: "Order not found" }] } });
    const lost = await createLimitlessExecutor(deps(relay({ [`POST ${RELAY}/orders/cancel`]: () => own(504, { error: { code: "upstream_timeout", message: "late" } }) }))).cancel(fakeSigner(OWNER), ORDER_ID);
    expect(!lost.ok && lost.refusal.code).toBe("venue_ambiguous");
    const proofRefused = await createLimitlessExecutor(deps(relay({ [`GET ${RELAY}/orders`]: () => own(401, { error: { code: "proof_invalid", message: "stale" } }) }))).openOrders(fakeSigner(OWNER), { market: SLUG });
    expect(!proofRefused.ok && proofRefused.refusal.code).toBe("not_logged_in");
    const v = relay();
    const anonymous = createLimitlessExecutor(deps(v, { registered: false }));
    expect((await anonymous.openOrders(fakeSigner(OWNER), { market: SLUG })).ok).toBe(false);
    expect((await anonymous.cancel(fakeSigner(OWNER), ORDER_ID)).ok).toBe(false);
    expect((await createLimitlessExecutor(deps(v)).cancel(fakeSigner(OWNER), "not-an-id")).ok).toBe(false);
    expect(v.requests).toEqual([]);
  });
});

const READS = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)", "function isApprovedForAll(address, address) view returns (bool)", "function balanceOf(address, uint256) view returns (uint256)"]);

function base(allowance: bigint | null, operator: boolean | null) {
  return (to: string, data: Hex): Hex | null => {
    const { functionName } = decodeFunctionData({ abi: READS, data });
    if (to === LIMITLESS_USDC.toLowerCase() && functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [25_000_000n]);
    if (to === LIMITLESS_USDC.toLowerCase() && functionName === "allowance") return allowance === null ? null : encodeAbiParameters([{ type: "uint256" }], [allowance]);
    if (to === LIMITLESS_CONDITIONAL_TOKENS.toLowerCase() && functionName === "isApprovedForAll") return operator === null ? null : encodeAbiParameters([{ type: "bool" }], [operator]);
    if (to === LIMITLESS_CONDITIONAL_TOKENS.toLowerCase() && functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [3_000_000n]);
    return null;
  };
}

describe("USDC, approvals and activation on Base", () => {
  it("reads USDC and the approvals for the pinned exchange, and turns the missing ones into calls the key sends", async () => {
    const executor = createLimitlessExecutor(deps(relay(), { call: base(1_000_000n, false) }));
    const funding = await executor.funding(account(), YES);
    expect(funding.ok && funding.value).toMatchObject({ collateralSymbol: "USDC", collateralBalance: 25_000_000n, shareBalance: 3_000_000n });
    const calls = await executor.approvalCalls(account());
    if (!calls.ok) throw new Error(calls.refusal.message);
    expect(calls.value.map((call) => [call.to, call.chainId])).toEqual([
      [LIMITLESS_USDC, 8453],
      [LIMITLESS_CONDITIONAL_TOKENS, 8453],
    ]);
    expect(decodeFunctionData({ abi: erc20Abi, data: calls.value[0]!.data }).args).toEqual([EXCHANGE, maxUint256]);
    expect(decodeFunctionData({ abi: parseAbi(["function setApprovalForAll(address operator, bool approved)"]), data: calls.value[1]!.data }).args).toEqual([EXCHANGE, true]);
    const sender = fakeSigner(OWNER, { txHash: `0x${"aa".repeat(32)}` });
    expect(await executor.sendApproval(sender, calls.value[0]!)).toEqual({ ok: true, value: `0x${"aa".repeat(32)}` });
    expect(sender.transactions).toEqual([{ chainId: 8453, to: LIMITLESS_USDC, data: calls.value[0]!.data }]);
    const done = await createLimitlessExecutor(deps(relay(), { call: base(maxUint256 - 5n, true) })).approvalCalls(account());
    expect(done.ok && done.value).toEqual([]);
  });

  it("activates in order: registration, then each approval; status is ready afterwards and lists the steps before", async () => {
    let approved = false;
    const call = (to: string, data: Hex): Hex | null => base(approved ? maxUint256 : 0n, approved)(to, data);
    const storage = new MemoryStorage();
    const v = relay();
    const executor = createLimitlessExecutor(deps(v, { registered: false, storage, call }));
    const signer = fakeSigner(OWNER, { txHash: `0x${"bb".repeat(32)}` });
    const acct: TradingAccount = { signer: asLocal(signer), address: OWNER.address, mode: "derived", funding: null };
    const activation = limitlessActivation(executor);
    const before = await activation.status(acct);
    expect(before).toEqual({ state: "needs_activation", steps: [LIMITLESS_STEP_REGISTER, "USDC approval for the Limitless CTF Exchange", "Outcome token approval for the Limitless CTF Exchange"] });
    const progress: string[] = [];
    const result = await activation.activate(acct, (step) => {
      progress.push(step);
      if (step.startsWith("Outcome")) approved = true;
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(progress).toEqual([LIMITLESS_STEP_REGISTER, "USDC approval for the Limitless CTF Exchange", "Outcome token approval for the Limitless CTF Exchange"]);
    expect(signer.transactions).toHaveLength(2);
    expect(await activation.status(acct)).toEqual({ state: "ready" });
    const off = await limitlessActivation(createLimitlessExecutor(deps(v), null)).status(acct);
    expect(off).toEqual({ state: "unavailable", reason: NOT_AVAILABLE });
  });
});
