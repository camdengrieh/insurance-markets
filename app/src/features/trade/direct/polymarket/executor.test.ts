import { describe, expect, it } from "vitest";

import { recoverAddress, recoverTypedDataAddress, hashTypedData, size, type Hex } from "viem";

import * as nodeL2 from "@sdk/node/trade/clob/polymarket/l2";
import { safeAddress } from "@sdk/chain/polymarket/wallets";
import { hashPolymarketClobAuth } from "@sdk/trade/clob/polymarket/clobauth";
import { depositWalletAddress } from "@sdk/trade/clob/polymarket/deposit-wallet";
import { POLYMARKET_DEPOSIT_WALLET_SIGNATURE_BYTES, polymarketOrderToWire, type PolymarketOrder } from "@sdk/trade/clob/polymarket/order";
import { POLYMARKET_EXCHANGES } from "@sdk/trade/clob/venues";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { buildClobTicket, type ClobMarketFacts, type ClobTicket } from "../../clob-ticket";
import { credentialKey } from "../credentials";
import { fakeChain, fakeSigner, fakeVenue, json, MemoryStorage, testDeps, type FakeVenue, type Route } from "../testkit";
import type { DirectAccount, DirectPreparedOrder } from "../types";
import { POLYMARKET_CLOB_ORIGIN } from "./api";
import { createPolymarketExecutor, PREPARED_TTL_MS } from "./executor";
import { MAKER_LABEL } from "./maker";

// The direct Polymarket path end to end against a scripted venue and an in-memory chain: what the wallet is asked to
// sign, and the exact requests that reach the venue. No network; the keys are the public Anvil test keys.

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const STRANGER = ANVIL_TEST_ACCOUNTS[1]!;
const VENUE_S = 1_792_755_563;
const CONDITION = `0x${"5a".repeat(32)}`;
const TOKEN = "71321045679252212594626385532706912750332728571942532289631379312455583992563";
// Test-only credential values.
const CREDENTIALS = { apiKey: "00000000-test-only-0000-000000000000", secret: "dGVzdC1vbmx5LXNlY3JldC0_Pz8-Pj4tYnl0ZXMtMDE=", passphrase: "test-only-passphrase" };

const FACTS: ClobMarketFacts = { venue: "polymarket", marketId: CONDITION, tick: "0.01", minSize: "5", polymarketBook: "ctf", fetchedAtMs: 0 };

function ticketOf(over: Partial<{ side: string; price: string; shares: string; tif: string; ttlS: string; postOnly: boolean }> = {}): ClobTicket {
  const built = buildClobTicket({ tokenId: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ttlS: "", postOnly: false, ...over }, FACTS);
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return built.ticket;
}

function venue(over: Record<string, Route> = {}): FakeVenue {
  return fakeVenue({
    "GET /time": () => ({ status: 200, text: String(VENUE_S) }),
    "GET /book": () => json(200, { market: CONDITION, asset_id: TOKEN, tick_size: "0.01", min_order_size: "5", neg_risk: false, bids: [{ price: "0.48", size: "100" }], asks: [{ price: "0.53", size: "40" }] }),
    "GET /auth/derive-api-key": () => json(200, CREDENTIALS),
    ...over,
  });
}

function account(over: Partial<DirectAccount> = {}): DirectAccount {
  return { venue: "polymarket", chainId: 137, signer: OWNER.address, maker: OWNER.address, label: MAKER_LABEL.eoa, signatureType: 0, makerIsSigner: true, ...over };
}

function loggedInDeps(v: FakeVenue, storage = new MemoryStorage()) {
  storage.setItem(credentialKey("polymarket", OWNER.address), JSON.stringify(CREDENTIALS));
  return testDeps(v, fakeChain({}), storage);
}

function orderOf(body: string): Record<string, unknown> {
  return (JSON.parse(body) as { order: Record<string, unknown> }).order;
}

function polymarketOrderFromWire(wire: Record<string, unknown>): PolymarketOrder {
  return {
    salt: BigInt(wire["salt"] as number),
    maker: wire["maker"] as `0x${string}`,
    signer: wire["signer"] as `0x${string}`,
    tokenId: BigInt(wire["tokenId"] as string),
    makerAmount: BigInt(wire["makerAmount"] as string),
    takerAmount: BigInt(wire["takerAmount"] as string),
    side: wire["side"] === "BUY" ? 0 : 1,
    signatureType: wire["signatureType"] as number,
    timestamp: BigInt(wire["timestamp"] as string),
    metadata: wire["metadata"] as Hex,
    builder: wire["builder"] as Hex,
  };
}

describe("logging in (L1) with the visitor's own wallet", () => {
  it("asks the wallet for the ClobAuth typed data on the venue's clock and derives the key with the documented L1 headers", async () => {
    const v = venue();
    const storage = new MemoryStorage();
    const executor = createPolymarketExecutor(testDeps(v, fakeChain({}), storage));
    const signer = fakeSigner(OWNER);
    const session = await executor.login(signer);
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.keyTag).toMatch(/^po[0-9a-f]{8}$/);

    const typed = signer.typedData[0] as { domain: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };
    expect(typed.primaryType).toBe("ClobAuth");
    expect(typed.domain).toEqual({ name: "ClobAuthDomain", version: "1", chainId: 137 });
    expect(typed.message).toEqual({ address: OWNER.address, timestamp: String(VENUE_S), nonce: 0n, message: "This message attests that I control the given wallet" });

    expect(v.requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(["GET /time", "GET /auth/derive-api-key"]);
    const derive = v.requests[1]!;
    expect(derive.url).toBe(`${POLYMARKET_CLOB_ORIGIN}/auth/derive-api-key`);
    const headers = derive.headers ?? {};
    expect(Object.keys(headers).sort()).toEqual(["POLY_ADDRESS", "POLY_NONCE", "POLY_SIGNATURE", "POLY_TIMESTAMP"]);
    expect(headers["POLY_ADDRESS"]).toBe(OWNER.address);
    expect(headers["POLY_TIMESTAMP"]).toBe(String(VENUE_S));
    expect(headers["POLY_NONCE"]).toBe("0");
    const recovered = await recoverAddress({ hash: hashPolymarketClobAuth({ address: OWNER.address, timestamp: String(VENUE_S), nonce: 0n }), signature: headers["POLY_SIGNATURE"] as Hex });
    expect(recovered).toBe(OWNER.address);

    // Kept for this tab, under this wallet's address only.
    expect([...storage.items.keys()]).toEqual([credentialKey("polymarket", OWNER.address)]);
    expect(JSON.parse(storage.items.get(credentialKey("polymarket", OWNER.address)) ?? "{}")).toEqual(CREDENTIALS);
    expect(executor.session(signer)?.keyTag).toBe(session.value.keyTag);
    expect(executor.session(fakeSigner(STRANGER))).toBeNull();
  });

  it("creates a key once when derive finds none, and never when the venue refused the signature", async () => {
    const created = venue({ "GET /auth/derive-api-key": () => json(400, { error: "Could not derive api key!" }), "POST /auth/api-key": () => json(200, { api_key: CREDENTIALS.apiKey, secret: CREDENTIALS.secret, passphrase: CREDENTIALS.passphrase }) });
    const signer = fakeSigner(OWNER);
    expect((await createPolymarketExecutor(testDeps(created, fakeChain({}))).login(signer)).ok).toBe(true);
    expect(created.requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(["GET /time", "GET /auth/derive-api-key", "POST /auth/api-key"]);
    expect(created.requests[2]?.headers).toEqual(created.requests[1]?.headers);

    const refused = venue({ "GET /auth/derive-api-key": () => json(401, { error: "Invalid L1 Request headers" }) });
    const result = await createPolymarketExecutor(testDeps(refused, fakeChain({}))).login(signer);
    expect(result.ok ? null : result.refusal).toEqual({ code: "venue_refused", message: "Polymarket refused the login signature.", venueText: "Invalid L1 Request headers" });
    expect(refused.requests.some((request) => request.method === "POST")).toBe(false);

    const down = venue({ "GET /auth/derive-api-key": () => json(404, {}), "POST /auth/api-key": () => json(502, { error: "bad gateway" }) });
    const ambiguous = await createPolymarketExecutor(testDeps(down, fakeChain({}))).login(signer);
    expect(ambiguous.ok ? null : ambiguous.refusal.code).toBe("venue_ambiguous");
  });

  it("sends nothing when the wallet declines, signs with another key, or the session lacks Polygon", async () => {
    const v = venue();
    const executor = createPolymarketExecutor(testDeps(v, fakeChain({})));
    const declined = await executor.login(fakeSigner(OWNER, { signs: "reject" }));
    expect(declined.ok ? null : declined.refusal.code).toBe("wallet_rejected");
    const wrongKey = await executor.login(fakeSigner(OWNER, { signs: { with: STRANGER } }));
    expect(wrongKey.ok ? null : wrongKey.refusal.code).toBe("signature_mismatch");
    const noPolygon = await executor.login(fakeSigner(OWNER, { capabilities: { chains: [1, 8453] } }));
    expect(noPolygon.ok ? null : noPolygon.refusal.code).toBe("wallet_wrong_chain");
    expect(v.requests.filter((request) => new URL(request.url).pathname.startsWith("/auth"))).toEqual([]);
  });

  it("logs out of this tab only for that wallet", () => {
    const storage = new MemoryStorage();
    storage.setItem(credentialKey("polymarket", OWNER.address), JSON.stringify(CREDENTIALS));
    storage.setItem(credentialKey("polymarket", STRANGER.address), JSON.stringify(CREDENTIALS));
    const executor = createPolymarketExecutor(testDeps(venue(), fakeChain({}), storage));
    executor.logout(fakeSigner(OWNER));
    expect(executor.session(fakeSigner(OWNER))).toBeNull();
    expect(executor.session(fakeSigner(STRANGER))).not.toBeNull();
  });
});

describe("placing an order", () => {
  async function prepare(v: FakeVenue, who: DirectAccount, ticket = ticketOf()) {
    const deps = loggedInDeps(v);
    const executor = createPolymarketExecutor(deps);
    const signer = fakeSigner(OWNER);
    const prepared = await executor.prepareOrder(signer, who, { ticket, facts: FACTS, outcome: "Yes" });
    if (!prepared.ok) throw new Error(prepared.refusal.message);
    return { deps, executor, signer, prepared: prepared.value };
  }

  function accept(v: FakeVenue, prepared: DirectPreparedOrder): void {
    v.routes.set("POST /order", () => json(200, { success: true, errorMsg: "", orderID: prepared.orderId, status: "live", takingAmount: "", makingAmount: "" }));
  }

  it("an EOA order: the card lists every signed field, the wallet signs that typed data, and one POST /order goes out with the L2 headers", async () => {
    const v = venue();
    const { executor, signer, prepared } = await prepare(v, account());
    expect(v.requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(["GET /time", "GET /book"]);
    expect(prepared.typedData.primaryType).toBe("Order");
    expect(hashTypedData(prepared.typedData as never)).toBe(prepared.card.digest);
    expect(prepared.card.fields.filter((field) => field.group === "message").map((field) => field.name)).toEqual(["salt", "maker", "signer", "tokenId", "makerAmount", "takerAmount", "side", "signatureType", "timestamp", "metadata", "builder"]);
    expect(prepared.card.fields.find((field) => field.name === "verifyingContract")?.value).toBe(POLYMARKET_EXCHANGES.ctf.verifyingContract);
    expect(prepared.card.fields.find((field) => field.name === "makerAmount")).toMatchObject({ value: "5200000", meaning: "5.2 pUSD the maker pays at most" });
    expect(prepared.card.worstCase).toBe("5.72 pUSD");
    expect(prepared.card.lines.join(" ")).toContain("best bid 0.48, best ask 0.53");

    accept(v, prepared);
    const placed = await executor.placeOrder(signer, prepared);
    expect(placed).toEqual({ ok: true, value: { orderId: prepared.orderId.toLowerCase(), status: "live", venueText: null } });
    expect(signer.typedData).toEqual([prepared.typedData]);

    const posts = v.requests.filter((request) => request.method === "POST");
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.url).toBe(`${POLYMARKET_CLOB_ORIGIN}/order`);
    const body = post.body ?? "";
    const sent = JSON.parse(body) as Record<string, unknown>;
    expect(Object.keys(sent)).toEqual(["order", "owner", "orderType"]);
    expect(sent["owner"]).toBe(CREDENTIALS.apiKey);
    expect(sent["orderType"]).toBe("GTC");
    const wire = orderOf(body);
    const order = polymarketOrderFromWire(wire);
    expect({ ...wire, signature: undefined }).toEqual({ ...polymarketOrderToWire(order, 0n), signature: undefined });
    expect(order).toMatchObject({ maker: OWNER.address, signer: OWNER.address, signatureType: 0, makerAmount: 5_200_000n, takerAmount: 10_000_000n, side: 0, timestamp: BigInt(VENUE_S) * 1000n, salt: 0x010203040506n });
    expect(await recoverAddress({ hash: prepared.orderId, signature: wire["signature"] as Hex })).toBe(OWNER.address);
    // The L2 headers are exactly the relay's Node signer's for this body on the venue's clock.
    const expected = nodeL2.buildPolymarketL2Headers({ address: OWNER.address, credentials: CREDENTIALS, timestampSeconds: VENUE_S, method: "POST", path: "/order", body });
    expect(post.headers).toEqual({ ...expected, "Content-Type": "application/json" });
    // Every request went to the CLOB's own origin.
    expect(v.requests.every((request) => request.url.startsWith(`${POLYMARKET_CLOB_ORIGIN}/`))).toBe(true);
  });

  it("a GTD order carries the venue clock's expiry on the wire, and post-only rides beside it", async () => {
    const v = venue();
    const { executor, signer, prepared } = await prepare(v, account(), ticketOf({ tif: "GTD", ttlS: "600", postOnly: true }));
    accept(v, prepared);
    await executor.placeOrder(signer, prepared);
    const sent = JSON.parse(v.requests.find((request) => request.method === "POST")?.body ?? "{}") as Record<string, unknown>;
    expect(sent["orderType"]).toBe("GTD");
    expect(sent["postOnly"]).toBe(true);
    expect((sent["order"] as Record<string, unknown>)["expiration"]).toBe(String(VENUE_S + 600));
  });

  it("a Safe order: the Safe is the maker, the wallet the signer, signature type 2, and the signature is over the order itself", async () => {
    const v = venue();
    const safe = safeAddress(OWNER.address);
    const { executor, signer, prepared } = await prepare(v, account({ maker: safe, label: MAKER_LABEL.safe, signatureType: 2, makerIsSigner: false }));
    expect(prepared.typedData.primaryType).toBe("Order");
    accept(v, prepared);
    expect((await executor.placeOrder(signer, prepared)).ok).toBe(true);
    const wire = orderOf(v.requests.find((request) => request.method === "POST")?.body ?? "{}");
    expect(wire).toMatchObject({ maker: safe, signer: OWNER.address, signatureType: 2 });
    expect(await recoverAddress({ hash: prepared.orderId, signature: wire["signature"] as Hex })).toBe(OWNER.address);
  });

  it("a Deposit Wallet order: the wallet signs the TypedDataSign wrapper, and the venue receives the ERC-1271 wrapped signature", async () => {
    const v = venue();
    const wallet = depositWalletAddress(OWNER.address, "beacon");
    const { executor, signer, prepared } = await prepare(v, account({ maker: wallet, label: MAKER_LABEL.deposit_wallet, signatureType: 3, makerIsSigner: false }));
    expect(prepared.typedData.primaryType).toBe("TypedDataSign");
    expect(prepared.card.fields.filter((field) => field.group === "contents")).toHaveLength(11);
    accept(v, prepared);
    expect((await executor.placeOrder(signer, prepared)).ok).toBe(true);
    const wire = orderOf(v.requests.find((request) => request.method === "POST")?.body ?? "{}");
    expect(wire).toMatchObject({ maker: wallet, signer: wallet, signatureType: 3 });
    const signature = wire["signature"] as Hex;
    expect(size(signature)).toBe(POLYMARKET_DEPOSIT_WALLET_SIGNATURE_BYTES);
    // The first 65 bytes are the owner's signature over the wrapper's digest.
    expect(await recoverTypedDataAddress({ ...(prepared.typedData as Record<string, unknown>), signature: signature.slice(0, 132) as Hex } as never)).toBe(OWNER.address);
  });

  it("reports the venue's answer as it is: accepted, refused with its words, ambiguous on a failure, never a guess", async () => {
    const cases: ReadonlyArray<readonly [string, (prepared: DirectPreparedOrder) => ReturnType<typeof json>, string]> = [
      ["refused in a success envelope", () => json(200, { success: false, errorMsg: "not enough balance / allowance" }), "venue_refused"],
      ["a 400", () => json(400, { error: "invalid order payload" }), "venue_refused"],
      ["a geoblock 403", () => json(403, { error: "Trading restricted in your region" }), "venue_refused"],
      ["a 500", () => json(500, { error: "internal" }), "venue_ambiguous"],
      ["another order's id", () => json(200, { success: true, orderID: `0x${"cd".repeat(32)}`, status: "live" }), "venue_ambiguous"],
      ["no id", () => json(200, { success: true }), "venue_ambiguous"],
      ["not JSON", () => ({ status: 200, text: "<html>" }), "venue_ambiguous"],
    ];
    for (const [name, answer, code] of cases) {
      const v = venue();
      const { executor, signer, prepared } = await prepare(v, account());
      v.routes.set("POST /order", () => answer(prepared));
      const placed = await executor.placeOrder(signer, prepared);
      expect(placed.ok ? "ok" : placed.refusal.code, name).toBe(code);
    }
    const v = venue();
    const { executor, signer, prepared } = await prepare(v, account());
    v.routes.set("POST /order", () => json(200, { success: false, errorMsg: "  not enough‮ balance  " }));
    const refused = await executor.placeOrder(signer, prepared);
    expect(refused.ok ? null : refused.refusal.venueText).toBe("not enough balance");
  });

  it("a POST that gets no answer is ambiguous; a clock that fails first sends no order at all", async () => {
    const lost = venue({ "POST /order": () => Promise.reject(new TypeError("Failed to fetch")) });
    const one = await prepare(lost, account());
    const placed = await one.executor.placeOrder(one.signer, one.prepared);
    expect(placed.ok ? null : placed.refusal.code).toBe("venue_ambiguous");

    const v = venue();
    const two = await prepare(v, account());
    // The clock was remembered at prepare; a minute later it is asked again and fails.
    two.deps.clock.now += 61_000;
    v.routes.set("GET /time", () => json(503, {}));
    const notSent = await two.executor.placeOrder(two.signer, two.prepared);
    expect(notSent.ok ? null : notSent.refusal.code).toBe("venue_unreachable");
    expect(v.requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("sends a prepared order at most once, only while fresh, only for the wallet it was built for, and nothing when the wallet declines", async () => {
    const v = venue();
    const { deps, executor, signer, prepared } = await prepare(v, account());
    accept(v, prepared);
    expect((await executor.placeOrder(fakeSigner(STRANGER), prepared)).ok).toBe(false);
    expect((await executor.placeOrder(fakeSigner(OWNER, { signs: "reject" }), prepared)).ok).toBe(false);
    expect((await executor.placeOrder(fakeSigner(OWNER, { signs: { with: STRANGER } }), prepared)).ok).toBe(false);
    expect(v.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    expect((await executor.placeOrder(signer, prepared)).ok).toBe(true);
    const again = await executor.placeOrder(signer, prepared);
    expect(again.ok ? null : again.refusal.code).toBe("invalid_order");
    expect(v.requests.filter((request) => request.method === "POST")).toHaveLength(1);

    const stale = await executor.prepareOrder(signer, account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    if (!stale.ok) throw new Error("prepare");
    deps.clock.now += PREPARED_TTL_MS + 1;
    const late = await executor.placeOrder(signer, stale.value);
    expect(late.ok ? null : late.refusal.code).toBe("invalid_order");
  });

  it("refuses to build when the live book disagrees with the ticket, or no session is held", async () => {
    const moved = venue({ "GET /book": () => json(200, { market: CONDITION, tick_size: "0.001", min_order_size: "5" }) });
    const deps = loggedInDeps(moved);
    const executor = createPolymarketExecutor(deps);
    const refused = await executor.prepareOrder(fakeSigner(OWNER), account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    expect(refused.ok ? null : refused.refusal.code).toBe("invalid_order");
    const other = venue({ "GET /book": () => json(200, { market: `0x${"77".repeat(32)}`, tick_size: "0.01" }) });
    const elsewhere = await createPolymarketExecutor(loggedInDeps(other)).prepareOrder(fakeSigner(OWNER), account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    expect(elsewhere.ok ? null : elsewhere.refusal.message).toMatch(/another market/);
    const negRisk = venue({ "GET /book": () => json(200, { market: CONDITION, tick_size: "0.01", neg_risk: true }) });
    const built = await createPolymarketExecutor(loggedInDeps(negRisk)).prepareOrder(fakeSigner(OWNER), account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    expect(built.ok ? built.value.card.fields.find((field) => field.name === "verifyingContract")?.value : null).toBe(POLYMARKET_EXCHANGES.neg_risk.verifyingContract);

    const v = venue();
    const loggedOut = createPolymarketExecutor(testDeps(v, fakeChain({})));
    const prepared = await loggedOut.prepareOrder(fakeSigner(OWNER), account(), { ticket: ticketOf(), facts: FACTS, outcome: null });
    if (!prepared.ok) throw new Error("prepare");
    const placed = await loggedOut.placeOrder(fakeSigner(OWNER), prepared.value);
    expect(placed.ok ? null : placed.refusal.code).toBe("not_logged_in");
  });
});

describe("open orders and cancel", () => {
  const ID = `0x${"ab".repeat(32)}`;

  it("lists this market's orders with L2 headers signed over the path without its query, in either answer shape", async () => {
    for (const answer of [
      [{ id: ID, status: "LIVE", market: CONDITION, asset_id: TOKEN, side: "BUY", original_size: "10", size_matched: "2.5", price: "0.52", outcome: "Yes", maker_address: OWNER.address }],
      { data: [{ id: ID, side: "sell", price: 0.6, original_size: 5 }, { id: "not-hex" }], next_cursor: "MTAw" },
    ]) {
      const v = venue({ "GET /data/orders": () => json(200, answer) });
      const executor = createPolymarketExecutor(loggedInDeps(v));
      const listed = await executor.openOrders(fakeSigner(OWNER), { market: CONDITION });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.orders).toHaveLength(1);
      expect(listed.value.orders[0]?.id).toBe(ID);
      const request = v.requests.find((entry) => new URL(entry.url).pathname === "/data/orders")!;
      expect(request.url).toBe(`${POLYMARKET_CLOB_ORIGIN}/data/orders?market=${CONDITION}`);
      expect(request.headers).toEqual(nodeL2.buildPolymarketL2Headers({ address: OWNER.address, credentials: CREDENTIALS, timestampSeconds: VENUE_S, method: "GET", path: "/data/orders", body: "" }));
      if (!Array.isArray(answer)) expect(listed.value.more).toBe(true);
      else expect(listed.value.orders[0]).toMatchObject({ side: "BUY", price: "0.52", originalSize: "10", sizeMatched: "2.5", status: "LIVE", outcome: "Yes" });
    }
  });

  it("cancels with DELETE /order and the exact body it signed, and reads what the venue did not cancel", async () => {
    const v = venue({ "DELETE /order": () => json(200, { canceled: [], not_canceled: { [ID]: "order already matched" } }) });
    const executor = createPolymarketExecutor(loggedInDeps(v));
    const answer = await executor.cancel(fakeSigner(OWNER), ID);
    expect(answer).toEqual({ ok: true, value: { canceled: [], notCanceled: [{ id: ID, reason: "order already matched" }] } });
    const request = v.requests.find((entry) => entry.method === "DELETE")!;
    expect(request.body).toBe(JSON.stringify({ orderID: ID }));
    expect(request.headers).toEqual({ ...nodeL2.buildPolymarketL2Headers({ address: OWNER.address, credentials: CREDENTIALS, timestampSeconds: VENUE_S, method: "DELETE", path: "/order", body: request.body ?? "" }), "Content-Type": "application/json" });
    const bad = await executor.cancel(fakeSigner(OWNER), "1; drop");
    expect(bad.ok ? null : bad.refusal.code).toBe("invalid_order");
  });

  it("asks a wallet with no session to log in, and says so when the venue refuses the credential", async () => {
    const v = venue({ "GET /data/orders": () => json(401, { error: "Unauthorized/Invalid api key" }) });
    expect((await createPolymarketExecutor(testDeps(v, fakeChain({}))).openOrders(fakeSigner(OWNER), { market: null })).ok).toBe(false);
    const refused = await createPolymarketExecutor(loggedInDeps(v)).openOrders(fakeSigner(OWNER), { market: null });
    expect(refused.ok ? null : refused.refusal).toEqual({ code: "not_logged_in", message: "Polymarket refused the credential held in this tab. Log in again.", venueText: "Unauthorized/Invalid api key" });
  });
});
