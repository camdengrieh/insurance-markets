import { describe, expect, it } from "vitest";
import { getAddress, hashTypedData, recoverAddress, type Hex } from "viem";

import { deriveAccount } from "@sdk/trade/xo/account/derive";
import { hashClobAuth } from "@sdk/trade/xo/clobauth";
import { kernelWrapDigest } from "@sdk/trade/xo/kernel";
import { hashOrder, orderFromWire } from "@sdk/trade/xo/order";
import * as node from "@sdk/node/trade/xo/hmac";

import { WalletError } from "../../../../core/signer";
import { XoCredential, XoCredentialStore } from "./credentials";
import { xoAvailability, xoDirectExecutor } from "./index";
import { cancelBody, readCancel, readOpenOrders } from "./order";
import { RELAY_BASE_PATH, XoRelayClient } from "./relay";
import { loginCard, orderCard, walletTypedData, type XoSigningCard } from "./signing";
import { CREDENTIAL, fakeRelay, fakeSigner, fixedRandom, memoryStorage, ownerAddress, RELAY_ORIGIN, TOKEN_ID, XO_NOW_S, type FakeSigner, type Route } from "./testkit";
import { chainSupport, PAYBOX_CHAIN_WORDS, XoTrader } from "./trader";

// The XO direct flow end to end against a fake relay: what the wallet is asked to sign for each action and on which
// chain, the refusal for a session that cannot sign on 3223, the requests the relay receives (paths, header names,
// exact bodies, L2 headers identical to the Node signer's), the credential's storage, and the answers handed back.

const OWNER = ownerAddress();
const ACCOUNT = getAddress(deriveAccount(OWNER));
const BOOK = { market: `0x${"ab".repeat(32)}`, tick_size: "0.001", min_order_size: "5", bids: [{ price: "0.40", size: "100" }], asks: [{ price: "0.42", size: "50" }] };

function trader(signer: FakeSigner, routes: Readonly<Record<string, Route>> = {}, options: { readonly decide?: (card: XoSigningCard) => boolean; readonly storage?: ReturnType<typeof memoryStorage> } = {}) {
  const relay = fakeRelay(routes);
  const storage = options.storage ?? memoryStorage();
  const cards: XoSigningCard[] = [];
  const store = new XoCredentialStore(storage);
  const t = new XoTrader({
    signer,
    relay: new XoRelayClient(RELAY_ORIGIN, relay.fetch),
    store,
    random: fixedRandom,
    confirm: async (card) => {
      cards.push(card);
      // The wallet has not been asked anything yet when the card is shown.
      expect(signer.calls.filter((call) => call.method === "signTypedData")).toHaveLength(cards.length - 1);
      return options.decide?.(card) ?? true;
    },
  });
  return { t, relay, storage, store, cards };
}

function loggedIn(storage: ReturnType<typeof memoryStorage>): void {
  const credential = XoCredential.from(CREDENTIAL);
  if (credential === null) throw new Error("test credential");
  new XoCredentialStore(storage).put(OWNER, ACCOUNT, credential);
}

describe("what the wallet signs, per action", () => {
  it("(a) login: the Kernel wrapper of the ClobAuth digest, domain Kernel 0.3.1 on chain 3223 for the XO account", () => {
    const { card, fields } = loginCard(OWNER, ACCOUNT, XO_NOW_S);
    expect(fields).toEqual({ address: ACCOUNT, timestamp: String(XO_NOW_S), nonce: 0n });
    expect(card.typedData.domain).toEqual({ name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: ACCOUNT });
    expect(card.typedData.primaryType).toBe("Kernel");
    expect(card.typedData.types).toEqual({ Kernel: [{ name: "hash", type: "bytes32" }] });
    expect((card.typedData.message as { hash: Hex }).hash).toBe(hashClobAuth(fields));
    expect(hashTypedData(card.typedData)).toBe(kernelWrapDigest(hashClobAuth(fields), ACCOUNT));
    expect(card.checks.every((check) => check.pass)).toBe(true);
  });

  it("(b) order: the Kernel wrapper of the 13-field order hash, maker = signer = the account, nonce 0, type 3", async () => {
    const signer = fakeSigner();
    const storage = memoryStorage();
    loggedIn(storage);
    let posted: string | null = null;
    const { t, cards } = trader(signer, { "GET /book": () => ({ body: BOOK }), "POST /order": (call) => ((posted = call.body), { body: { success: true, orderID: "x" } }) }, { storage });
    const result = await t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(result.state).toBe("done");
    const card = cards[0] as XoSigningCard;
    expect(card.kind).toBe("order");
    expect(card.typedData.domain).toEqual({ name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: ACCOUNT });
    const wire = JSON.parse(posted ?? "null") as { order: Record<string, unknown> & { signature: string }; orderType: string };
    expect(wire.orderType).toBe("GTD");
    const order = orderFromWire(wire.order);
    expect([order.maker, order.signer, order.nonce, order.signatureType, order.makerAmount, order.takerAmount, order.expiration]).toEqual([ACCOUNT, ACCOUNT, 0n, 3, 4_200_000n, 10_000_000n, BigInt(XO_NOW_S + 300)]);
    expect((card.typedData.message as { hash: Hex }).hash).toBe(hashOrder(order));
    expect(result.value?.orderHash).toBe(hashOrder(order));
    // The wire signature: 0x01 + the Kernel ECDSA validator + 65 bytes that recover to the owner over the Kernel digest.
    expect(wire.order.signature).toMatch(/^0x01845adb2c711129d4f3966735ed98a9f09fc4ce57[0-9a-f]{130}$/);
    expect(await recoverAddress({ hash: kernelWrapDigest(hashOrder(order), ACCOUNT), signature: `0x${wire.order.signature.slice(44)}` })).toBe(OWNER);
  });

  it("(c) cancel: no wallet signature at all, one HMAC-signed DELETE", async () => {
    const signer = fakeSigner();
    const storage = memoryStorage();
    loggedIn(storage);
    const hash = `0x${"cd".repeat(32)}`;
    const { t, relay } = trader(signer, { "DELETE /order": () => ({ body: { canceled: [hash], notCanceled: {} } }) }, { storage });
    const result = await t.cancel(hash);
    expect(result.state).toBe("done");
    expect(signer.calls).toEqual([]);
    const sent = relay.calls.find((call) => call.method === "DELETE");
    expect(sent?.body).toBe(cancelBody(hash));
    expect(sent?.headers["xo-signature"]).toBeDefined();
  });
});

describe("the chain the wallet signs on", () => {
  it("refuses, in words and before any wallet call, a WalletConnect session without chain 3223 (PayBox)", async () => {
    const paybox = fakeSigner({ kind: "walletconnect", chains: [8453, 137] });
    expect(chainSupport(paybox)).toEqual({ ok: false, words: PAYBOX_CHAIN_WORDS });
    expect(PAYBOX_CHAIN_WORDS).toMatch(/PayBox/);
    expect(PAYBOX_CHAIN_WORDS).toMatch(/3223/);
    expect(xoAvailability(paybox, RELAY_ORIGIN)).toEqual({ available: false, reason: PAYBOX_CHAIN_WORDS });
    const storage = memoryStorage();
    loggedIn(storage);
    const { t, relay } = trader(paybox, {}, { storage });
    for (const result of [await t.login(), await t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" })]) {
      expect(result.state).toBe("refused");
      expect(result.words).toBe(PAYBOX_CHAIN_WORDS);
    }
    expect(paybox.calls).toEqual([]);
    expect(relay.calls).toEqual([]);
    expect(chainSupport(fakeSigner({ kind: "walletconnect", chains: [3223] }))).toEqual({ ok: true });
  });

  it("switches a browser wallet to 3223 before it signs, and says so when the wallet will not switch", async () => {
    const signer = fakeSigner({ startChain: 8453 });
    const { t } = trader(signer, { "GET /auth/derive-api-key": () => ({ body: CREDENTIAL }) });
    expect((await t.login()).state).toBe("done");
    const order = signer.calls.map((call) => call.method);
    expect(order.indexOf("switchChain")).toBeLessThan(order.indexOf("signTypedData"));
    expect(signer.calls.find((call) => call.method === "switchChain")?.arg).toBe(3223);

    const stuck = fakeSigner({ startChain: 8453, switchError: new WalletError("unsupported_chain", "no") });
    const refused = await trader(stuck).t.login();
    expect(refused.state).toBe("refused");
    expect(refused.words).toMatch(/would not switch to, or add, XO's chain \(3223\)/);
    expect(stuck.calls.some((call) => call.method === "signTypedData")).toBe(false);
  });

  it("a declined card or a declined wallet prompt sends nothing", async () => {
    const signer = fakeSigner({ startChain: 3223 });
    const declined = trader(signer, {}, { decide: () => false });
    expect((await declined.t.login()).state).toBe("declined");
    expect(signer.calls.some((call) => call.method === "signTypedData")).toBe(false);
    expect(declined.relay.calls.map((call) => call.path)).toEqual(["/time"]);

    const rejecting = fakeSigner({ startChain: 3223, signError: new WalletError("rejected", "user rejected") });
    const rejected = trader(rejecting);
    expect((await rejected.t.login()).state).toBe("declined");
    expect(rejected.relay.calls.map((call) => call.path)).toEqual(["/time"]);
  });

  it("refuses a signature that does not recover to the connected owner", async () => {
    const signer = fakeSigner({ startChain: 3223, signWith: `0x${"5d".repeat(32)}` });
    const { t, relay } = trader(signer);
    const result = await t.login();
    expect(result.state).toBe("refused");
    expect(result.words).toMatch(/not made by the connected address/);
    expect(relay.calls.map((call) => call.path)).toEqual(["/time"]);
  });
});

describe("the login against the relay", () => {
  it("derives first; on XO's 404 creates once with the same L1 headers; keeps the credential in sessionStorage only", async () => {
    const signer = fakeSigner({ startChain: 3223 });
    const storage = memoryStorage();
    const { t, relay } = trader(signer, { "GET /auth/derive-api-key": () => ({ status: 404, body: { error: "no key" } }), "POST /auth/api-key": () => ({ body: CREDENTIAL }) }, { storage });
    const result = await t.login();
    expect(result.state).toBe("done");
    expect(result.answer).toEqual({ status: 200, from: "xo", text: null });
    const [time, derive, create] = relay.calls;
    expect([time?.path, derive?.path, create?.path]).toEqual(["/time", "/auth/derive-api-key", "/auth/api-key"]);
    expect(derive?.url).toBe(`${RELAY_ORIGIN}${RELAY_BASE_PATH}/auth/derive-api-key`);
    expect(Object.keys(derive?.headers ?? {}).sort()).toEqual(["accept", "xo-address", "xo-signature", "xo-timestamp"]);
    expect(derive?.headers["xo-address"]).toBe(ACCOUNT);
    expect(derive?.headers["xo-timestamp"]).toBe(String(XO_NOW_S));
    expect(derive?.headers["xo-signature"]).toMatch(/^0x01845adb2c711129d4f3966735ed98a9f09fc4ce57[0-9a-f]{130}$/);
    expect(create?.headers["xo-signature"]).toBe(derive?.headers["xo-signature"]);
    expect(create?.body).toBe("{}");
    for (const call of relay.calls) {
      expect(call.init.credentials).toBe("omit");
      expect(call.init.redirect).toBe("error");
      expect(call.init.referrerPolicy).toBe("no-referrer");
    }
    const sigHex = (derive?.headers["xo-signature"] ?? "").slice(44);
    expect(await recoverAddress({ hash: kernelWrapDigest(hashClobAuth({ address: ACCOUNT, timestamp: String(XO_NOW_S), nonce: 0n }), ACCOUNT), signature: `0x${sigHex}` })).toBe(OWNER);
    expect([...storage.items.keys()]).toEqual([`xo-l2:${OWNER.toLowerCase()}:${ACCOUNT.toLowerCase()}`]);
    expect(t.hasCredential()).toBe(true);
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL.secret);
  });

  it("says plainly when XO keeps a key but not its secret, and never creates a second one", async () => {
    const signer = fakeSigner({ startChain: 3223 });
    const { t, relay } = trader(signer, { "GET /auth/derive-api-key": () => ({ body: { apiKey: CREDENTIAL.apiKey } }) });
    const result = await t.login();
    expect(result.state).toBe("refused");
    expect(result.words).toMatch(/did not send its secret/);
    expect(relay.calls.some((call) => call.path === "/auth/api-key")).toBe(false);
  });
});

describe("orders, the list and cancels against the relay", () => {
  it("signs L2 headers byte-identical to the Node signer, over the exact body sent", async () => {
    const storage = memoryStorage();
    loggedIn(storage);
    const { t, relay } = trader(fakeSigner(), { "GET /book": () => ({ body: BOOK }), "POST /order": () => ({ status: 200, body: { success: true } }) }, { storage });
    expect((await t.placeOrder({ tokenId: TOKEN_ID, side: "SELL", price: "0.4", shares: "5" })).state).toBe("done");
    const post = relay.calls.find((call) => call.method === "POST" && call.path === "/order");
    expect(post?.url).toBe(`${RELAY_ORIGIN}${RELAY_BASE_PATH}/order`);
    const expected = node.buildL2Headers({ credentials: CREDENTIAL, timestamp: String(XO_NOW_S), method: "POST", requestPath: "/order", body: post?.body ?? "", canonicalMode: "path-with-query" });
    expect({ k: post?.headers["xo-api-key"], p: post?.headers["xo-passphrase"], t: post?.headers["xo-timestamp"], s: post?.headers["xo-signature"] }).toEqual({ k: expected.XO_API_KEY, p: expected.XO_PASSPHRASE, t: expected.XO_TIMESTAMP, s: expected.XO_SIGNATURE });
    expect(post?.headers["content-type"]).toBe("application/json");
    expect(Object.keys(post?.headers ?? {}).some((name) => name.includes("_"))).toBe(false);
  });

  it("refuses before the card when not logged in, when the book is not on the 0.001 tick, and for a size below the minimum", async () => {
    const signer = fakeSigner();
    expect((await trader(signer).t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" })).words).toMatch(/Log in to XO first/);
    const storage = memoryStorage();
    loggedIn(storage);
    const coarse = await trader(signer, { "GET /book": () => ({ body: { ...BOOK, tick_size: "0.01" } }) }, { storage }).t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(coarse.words).toMatch(/tick is 0.01/);
    const small = await trader(signer, { "GET /book": () => ({ body: BOOK }) }, { storage }).t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "2" });
    expect(small.words).toMatch(/below XO's minimum: at least 5 shares/);
    expect(signer.calls.some((call) => call.method === "signTypedData")).toBe(false);
  });

  it("an order post with no answer is looked up by its hash, never sent again", async () => {
    const storage = memoryStorage();
    loggedIn(storage);
    const { t, relay } = trader(fakeSigner(), { "GET /book": () => ({ body: BOOK }), "POST /order": () => ({ status: 504, from: "relay", body: { error: { code: "upstream_timeout" } } }), "GET /orders/:hash": () => ({ status: 404, body: {} }) }, { storage });
    const result = await t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(result.state).toBe("ambiguous");
    expect(result.words).toMatch(/may or may not be on the book/);
    expect(relay.calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(relay.calls.at(-1)?.path).toBe(`/orders/${result.value?.orderHash ?? ""}`);
  });

  it("shows XO's refusal with its status and body", async () => {
    const storage = memoryStorage();
    loggedIn(storage);
    const { t } = trader(fakeSigner(), { "GET /book": () => ({ body: BOOK }), "POST /order": () => ({ status: 400, body: { error: "not enough balance / allowance" } }) }, { storage });
    const result = await t.placeOrder({ tokenId: TOKEN_ID, side: "BUY", price: "0.42", shares: "10" });
    expect(result.state).toBe("refused");
    expect(result.answer).toEqual({ status: 400, from: "xo", text: '{"error":"not enough balance / allowance"}' });
  });

  it("reads the open orders and XO's cancel answers in known shapes only", async () => {
    const hash = `0x${"ef".repeat(32)}`;
    const rows = readOpenOrders({ data: [{ order_hash: hash, asset_id: TOKEN_ID, side: "buy", price: "0.42", original_size: "10", size_matched: "2.5", status: "LIVE", expiration: "1792757100" }, { order_hash: "nope" }] });
    expect(rows).toEqual([{ hash, tokenId: TOKEN_ID, side: "BUY", price: "0.42", originalShares: "10", matchedShares: "2.5", status: "LIVE", expiresAtS: 1792757100 }]);
    expect(readOpenOrders({ nothing: true })).toBeNull();
    expect(readCancel({ canceled: [], notCanceled: { [hash]: "order already filled <script>" } }, hash)).toEqual({ state: "not_cancelled", reason: "already filled" });
    expect(readCancel({ canceled: [hash], notCanceled: {} }, hash).state).toBe("cancelled");
    const storage = memoryStorage();
    loggedIn(storage);
    const { t, relay } = trader(fakeSigner(), { "GET /orders": () => ({ body: [{ order_hash: hash, side: "SELL", price: "0.5", original_size: "5" }] }) }, { storage });
    const listed = await t.openOrders();
    expect(listed.value?.map((row) => row.hash)).toEqual([hash]);
    const get = relay.calls.find((call) => call.path === "/orders");
    expect(get?.body).toBeNull();
    expect(get?.headers["xo-signature"]).toBe(node.buildL2Headers({ credentials: CREDENTIAL, timestamp: String(XO_NOW_S), method: "GET", requestPath: "/orders", body: "", canonicalMode: "path-with-query" }).XO_SIGNATURE);
  });
});

describe("the credential and the executor", () => {
  it("prints as [redacted], lives in sessionStorage under the owner and account, and a damaged entry is dropped", () => {
    const credential = XoCredential.from(CREDENTIAL);
    expect(JSON.stringify({ credential })).toBe('{"credential":"[redacted]"}');
    expect(String(credential)).toBe("[redacted]");
    expect(XoCredential.from({ ...CREDENTIAL, secret: "has spaces in it" })).toBeNull();
    const storage = memoryStorage();
    storage.setItem(`xo-l2:${OWNER.toLowerCase()}:${ACCOUNT.toLowerCase()}`, "{not json");
    expect(new XoCredentialStore(storage).get(OWNER, ACCOUNT)).toBeNull();
    expect(storage.items.size).toBe(0);
    const memoryOnly = new XoCredentialStore(null);
    memoryOnly.put(OWNER, ACCOUNT, credential as XoCredential);
    expect(memoryOnly.get(OWNER, ACCOUNT)?.forSigning()).toEqual(CREDENTIAL);
  });

  it("is registered as the xo venue and is unavailable without a relay origin", () => {
    const executor = xoDirectExecutor();
    expect([executor.venue, executor.chainId]).toEqual(["xo", 3223]);
    expect(executor.availability(fakeSigner(), null)).toEqual({ available: false, reason: "XO trading is not available in this build." });
    expect(executor.availability(null, RELAY_ORIGIN).available).toBe(false);
    expect(executor.availability(fakeSigner(), RELAY_ORIGIN)).toEqual({ available: true });
  });

  it("refuses a card whose checks fail before the wallet is asked", async () => {
    const card = orderCard(OWNER, { salt: 1n, maker: ACCOUNT, signer: ACCOUNT, beneficiary: "0x0000000000000000000000000000000000000000", tokenId: 1n, makerAmount: 4_200_000n, takerAmount: 10_000_000n, expiration: BigInt(XO_NOW_S + 300), nonce: 0n, identifier: "0x00000000000000000000000000000000", metadata: `0x${"00".repeat(32)}`, side: 0, signatureType: 3 }, { nowSeconds: XO_NOW_S, reference: null });
    expect(card.checks.every((check) => check.pass)).toBe(true);
    // The same card for an owner the account was not derived from fails the derivation check.
    const other = getAddress(`0x${"77".repeat(20)}`);
    const foreign = orderCard(other, { salt: 1n, maker: ACCOUNT, signer: ACCOUNT, beneficiary: "0x0000000000000000000000000000000000000000", tokenId: 1n, makerAmount: 4_200_000n, takerAmount: 10_000_000n, expiration: BigInt(XO_NOW_S + 300), nonce: 0n, identifier: "0x00000000000000000000000000000000", metadata: `0x${"00".repeat(32)}`, side: 0, signatureType: 3 }, { nowSeconds: XO_NOW_S, reference: null });
    expect(foreign.checks.find((check) => /derived from the connected wallet/.test(check.label))?.pass).toBe(false);
    expect(walletTypedData({ types: { EIP712Domain: [], Kernel: [] }, primaryType: "Kernel", domain: { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: ACCOUNT }, message: { hash: card.innerHash } }).types).toEqual({ Kernel: [{ name: "hash", type: "bytes32" }] });
  });
});
