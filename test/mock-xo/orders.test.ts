import assert from "node:assert/strict";
import { describe } from "node:test";

import { hashTypedData, keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CTF_EXCHANGE, KERNEL_FACTORY, MARKET_MANAGER } from "../../src/xo/chain/constants.js";
import { getJson, useMock } from "./testing.js";
import {
  buildOrder,
  createCredentials,
  l2Call,
  l2Headers,
  marketTokens,
  placeOrder,
  postJson,
  setupTrader,
  type Credentials,
  type Trader,
} from "./traders.js";
import type { MockXo } from "./server.js";

// POST /order and everything the engine does with it. The signatures are verified by the REAL deployed Kernel on
// the local chain (ERC-1271); the rules around them are the docs' (M). Every guardrail has a failing case here
// that proves it blocks the bad input and leaves no order behind.

interface World {
  readonly a: Trader;
  readonly credsA: Credentials;
  readonly yes: string;
  readonly no: string;
}

// The optimistic profile (everything the plugin assumes works), a paymaster that sponsors, one funded trader.
async function world(mock: MockXo, options: { readonly fundMicro?: bigint } = {}): Promise<World> {
  mock.setProfile("optimistic");
  await mock.paymaster.reconcile("sponsor");
  const a = await setupTrader(mock, 2, options.fundMicro === undefined ? {} : { fundMicro: options.fundMicro });
  const credsA = await createCredentials(mock, a);
  const tokens = marketTokens(mock, "clob-active-a");
  return { a, credsA, yes: tokens.yes, no: tokens.no };
}

const errorOf = (reply: { body: unknown }): string => (reply.body as { error: string }).error;
const SHARES = 10_000_000n;

describe("order intake: a valid order", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("rests as live, answers its EIP-712 hash as orderID, and shows up in /orders, /book and /balance-allowance", async (mock) => {
    const w = await world(mock);
    const { built, reply } = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES });
    assert.equal(reply.status, 200, reply.text);
    assert.deepEqual(reply.body, { success: true, errorMsg: "", orderID: built.hash, status: "live", makingAmount: "0", takingAmount: "0" });

    const listed = await l2Call(mock, w.a, w.credsA, "GET", "/orders");
    const rows = (listed.body as { data: Record<string, unknown>[]; next_cursor: string; count: number }).data;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.["order_hash"], built.hash);
    assert.equal(rows[0]?.["id"], 100001);
    assert.equal(rows[0]?.["side"], "BUY");
    assert.equal(rows[0]?.["price"], "0.300");
    assert.equal(rows[0]?.["original_size"], "10");
    assert.equal(rows[0]?.["size_matched"], "0");
    assert.equal(rows[0]?.["order_type"], "GTD");
    assert.equal(rows[0]?.["outcome"], "Yes");
    assert.equal(rows[0]?.["asset_id"], w.yes);

    const book = (await getJson(mock, "orderbook", `/book?token_id=${w.yes}`)).body as { bids: { price: string; size: string }[] };
    assert.deepEqual(book.bids.find((level) => level.price === "0.300"), { price: "0.300", size: "10" });
    // $3.00 of collateral plus the 800 bps fee bound is reserved: allowance is what is left for new orders.
    const balance = (await getJson(mock, "orderbook", `/balance-allowance?address=${w.a.account}`)).body as { balance: string; allowance: string };
    assert.deepEqual(balance, { balance: "100000000", allowance: String(100_000_000n - 3_240_000n), smart_account: w.a.key });
  });

  harness.it("a SELL needs the position, reserves the shares and shows them as reserved in /positions", async (mock) => {
    const w = await world(mock);
    const empty = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 700, sharesMicro: SHARES });
    assert.equal(empty.reply.status, 422);
    assert.deepEqual(empty.reply.body, { error: "insufficient position" });
    mock.state.setPositions(w.a.account, [{ tokenId: w.yes, balanceMicro: 25_000_000n, reservedMicro: 0n }]);
    const ok = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 700, sharesMicro: SHARES });
    assert.equal(ok.reply.status, 200, ok.reply.text);
    const positions = (await getJson(mock, "orderbook", `/positions?address=${w.a.account}`)).body as { positions: { token_id: string; balance: string; reserved: string }[] };
    assert.deepEqual(positions.positions[0], { token_id: w.yes, balance: "25000000", reserved: "10000000" });
    // 15 shares are free, so 20 more are refused and 15 are fine.
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 710, sharesMicro: 20_000_000n })).reply.status, 422);
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 710, sharesMicro: 15_000_000n })).reply.status, 200);
  });

  harness.it("ticks 1 and 999 are on the grid; 0 and 1000 are not", async (mock) => {
    const w = await world(mock);
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 1, sharesMicro: SHARES })).reply.status, 200);
    mock.state.setPositions(w.a.account, [{ tokenId: w.yes, balanceMicro: SHARES, reservedMicro: 0n }]);
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "SELL", tick: 999, sharesMicro: SHARES })).reply.status, 200);
    // Prices of 0 and of 1.0 are off the grid whatever the balance is.
    for (const [makerAmount, takerAmount] of [[0n, SHARES], [SHARES, SHARES]] as const) {
      const reply = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 500, sharesMicro: SHARES, makerAmount, takerAmount });
      assert.equal(reply.reply.status, 400, `${String(makerAmount)}/${String(takerAmount)}`);
    }
  });
});

describe("order intake: every guardrail blocks the bad order and leaves nothing behind", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  async function refuses(mock: MockXo, w: World, spec: Parameters<typeof placeOrder>[3], status: number, text: RegExp | string, options?: Parameters<typeof placeOrder>[4]): Promise<void> {
    const before = mock.write.orders.size;
    const { reply } = await placeOrder(mock, w.a, w.credsA, spec, options);
    assert.equal(reply.status, status, reply.text);
    if (typeof text === "string") assert.equal(errorOf(reply), text);
    else assert.match(errorOf(reply), text);
    assert.equal(mock.write.orders.size, before, "no order was created");
  }

  harness.it("L2 is required on POST when l2.required_on_post = yes: no headers, a bad signature or a stranger's key are 401", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    const bare = await placeOrder(mock, w.a, undefined, spec);
    assert.equal(bare.reply.status, 401);
    assert.deepEqual(bare.reply.body, { error: "HMAC L2 credentials required" });
    await refuses(mock, w, spec, 401, "invalid L2 signature", { signature: "AAAA" });
    // Without the requirement, no headers is fine; WITH headers they are checked.
    mock.setSwitch("l2.required_on_post", "no");
    assert.equal((await placeOrder(mock, w.a, undefined, spec)).reply.status, 200);
    await refuses(mock, w, { ...spec, tick: 310 }, 401, "invalid L2 signature", { signature: "AAAA" });
    // A key of another account cannot post for this maker.
    const b = await setupTrader(mock, 3);
    const credsB = await createCredentials(mock, b);
    const stolen = await placeOrder(mock, w.a, credsB, { ...spec, tick: 320 }, { headers: { xo_address: b.account } });
    assert.equal(stolen.reply.status, 403);
    assert.deepEqual(stolen.reply.body, { error: "the order's maker is not the account of this API key" });
  });

  harness.it("a malformed envelope or field is 400 with the field named", async (mock) => {
    const w = await world(mock);
    const good = (await buildOrder(mock, w.a, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES })).wire;
    const send = async (body: string) => {
      const headers = l2Headers(mock, w.a, w.credsA, "POST", "/order", { body });
      return postJson(mock, "/order", body, headers);
    };
    const cases: [string, string, RegExp][] = [
      ["not json", "{", /expected a JSON object/],
      ["no order", JSON.stringify({ orderType: "GTD" }), /order is required/],
      ["bad orderType", JSON.stringify({ order: good, orderType: "MARKET" }), /orderType must be/],
      ["bad postOnly", JSON.stringify({ order: good, orderType: "GTD", postOnly: "yes" }), /postOnly must be a boolean/],
      ["bad salt", JSON.stringify({ order: { ...good, salt: "1.5" }, orderType: "GTD" }), /salt must be a decimal string/],
      ["bad maker", JSON.stringify({ order: { ...good, maker: "0x12" }, orderType: "GTD" }), /maker must be an address/],
      ["bad side", JSON.stringify({ order: { ...good, side: 2 }, orderType: "GTD" }), /side must be 0/],
      ["bad identifier", JSON.stringify({ order: { ...good, identifier: "0x00" }, orderType: "GTD" }), /identifier/],
      ["hex amount", JSON.stringify({ order: { ...good, makerAmount: "0x10" }, orderType: "GTD" }), /makerAmount must be a decimal string/],
      ["no signature", JSON.stringify({ order: { ...good, signature: undefined }, orderType: "GTD" }), /signature is required/],
    ];
    for (const [name, body, pattern] of cases) {
      const reply = await send(body);
      assert.equal(reply.status, 400, name);
      assert.match(errorOf(reply), pattern, name);
    }
    assert.equal(mock.write.orders.size, 0);
  });

  harness.it("signatureType 3 only, signer must equal maker, amounts above zero", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    for (const signatureType of [0, 1, 2, 4]) await refuses(mock, w, { ...spec, signatureType }, 400, /signatureType 3 \(XO smart account\) is the only accepted value/);
    await refuses(mock, w, { ...spec, signer: w.a.owner.address }, 400, /signer must equal maker/);
    await refuses(mock, w, { ...spec, makerAmount: 0n }, 400, /amounts must be above zero/);
    await refuses(mock, w, { ...spec, takerAmount: 0n }, 400, /amounts must be above zero/);
  });

  harness.it("the price must sit on the 0.001 grid and the size on 0.001 shares: 400 invalid price tick / invalid size", async (mock) => {
    const w = await world(mock);
    // makerAmount / takerAmount that is not an integer tick: 3_000_001 collateral for 10 shares.
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES, makerAmount: 3_000_001n }, 400, "invalid price tick");
    // SELL the other way round.
    await refuses(mock, w, { tokenId: w.yes, side: "SELL", tick: 300, sharesMicro: SHARES, takerAmount: 2_999_999n }, 400, "invalid price tick");
    // price 1.0 and above
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 500, sharesMicro: SHARES, makerAmount: SHARES, takerAmount: SHARES }, 400, "invalid price tick");
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 500, sharesMicro: SHARES, makerAmount: 2n * SHARES, takerAmount: SHARES }, 400, "invalid price tick");
    // an exact ratio on a size that is not a multiple of 1,000 micro-shares: 1,000,500 shares at tick 500 is exact money but off the size grid
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 500, sharesMicro: 1_000_500n, makerAmount: 500_250n, takerAmount: 1_000_500n }, 400, "invalid size: shares must be a multiple of 0.001");
  });

  harness.it("the nonce must equal the maker's on-chain nonce, which is 0", async (mock) => {
    const w = await world(mock);
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES, nonce: 1n }, 400, /nonce must equal the maker's on-chain nonce/);
  });

  harness.it("expiry is checked against the mock clock: GTD needs one, a past one is refused, the minimum life is order.gtd_min", async (mock) => {
    const w = await world(mock);
    const now = BigInt(mock.clock.nowSeconds());
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    await refuses(mock, w, { ...spec, expiration: 0n }, 400, /GTD orders need a non-zero expiration/);
    await refuses(mock, w, { ...spec, expiration: now - 1n }, 400, /already expired/);
    await refuses(mock, w, { ...spec, orderType: "FOK", expiration: now - 1n }, 400, /already expired/);
    // gtd_min 0 (optimistic): any future second is fine, now itself too (the exchange accepts expiration == block.timestamp).
    assert.equal((await placeOrder(mock, w.a, w.credsA, { ...spec, expiration: now })).reply.status, 200);
    mock.setSwitch("order.gtd_min", "180");
    await refuses(mock, w, { ...spec, tick: 310, expiration: now + 179n }, 400, "invalid order: GTD orders must expire at least 180 seconds from now");
    assert.equal((await placeOrder(mock, w.a, w.credsA, { ...spec, tick: 310, expiration: now + 180n })).reply.status, 200);
    // The clock decides: 100 s later the same absolute expiration is no longer far enough.
    await mock.advance(100);
    await refuses(mock, w, { ...spec, tick: 320, expiration: now + 180n }, 400, /at least 180 seconds/);
  });

  harness.it("a token with no book is 404, and an inactive market is 422 with its status", async (mock) => {
    const w = await world(mock);
    await refuses(mock, w, { tokenId: "123", side: "BUY", tick: 300, sharesMicro: SHARES }, 404, "No orderbook exists for the requested token id");
    const paused = marketTokens(mock, "conviction-paused");
    await refuses(mock, w, { tokenId: paused.yes, side: "BUY", tick: 300, sharesMicro: SHARES }, 422, "market is not active (status: Paused)");
    const closed = marketTokens(mock, "clob-closed");
    // A closed market has no book (GET /book is 404), but its token is known: the order is refused as inactive.
    await refuses(mock, w, { tokenId: closed.yes, side: "BUY", tick: 300, sharesMicro: SHARES }, 422, "market is not active (status: Closed)");
    mock.state.tradingState = "paused";
    const stopped = await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES });
    assert.equal(stopped.reply.status, 503);
    assert.equal(stopped.reply.headers.get("retry-after"), "60");
  });

  harness.it("a signature that is not the owner's is refused by the deployed Kernel: wrong key, wrong order, another account's wrap, bad prefix, bad length", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    const stranger = privateKeyToAccount(keccak256(toHex("not the owner")));
    await refuses(mock, w, { ...spec, sign: { signer: stranger as never } }, 400, /does not recover to the owner of the maker account/);
    // A valid signature for a DIFFERENT order (other salt) does not authorise this one.
    const other = await buildOrder(mock, w.a, { ...spec, salt: 777n });
    await refuses(mock, w, { ...spec, salt: 778n, signature: other.signature }, 400, /does not recover to the owner/);
    // Tampering with an amount after signing changes the digest.
    const signed = await buildOrder(mock, w.a, spec);
    await refuses(mock, w, { ...spec, salt: signed.parsed.salt, makerAmount: signed.parsed.makerAmount + 1_000n, takerAmount: signed.parsed.takerAmount, signature: signed.signature }, 400, /invalid price tick|does not recover/);
    // Signed under the Kernel domain of ANOTHER account (the wrapper binds the account).
    const b = await setupTrader(mock, 3);
    const underB = await buildOrder(mock, b, spec);
    await refuses(mock, w, { ...spec, salt: underB.parsed.salt, signature: underB.signature }, 400, /does not recover to the owner/);
    // Prefixes and lengths.
    const good = await buildOrder(mock, w.a, { ...spec, salt: 9001n });
    const wrongValidator = `0x01${"11".repeat(20)}${good.signature.slice(44)}` as const;
    await refuses(mock, w, { ...spec, salt: 9001n, signature: wrongValidator }, 400, /unknown validator/);
    await refuses(mock, w, { ...spec, salt: 9001n, signature: `0x02${good.signature.slice(4)}` }, 400, /unsupported signature length|must start with/);
    await refuses(mock, w, { ...spec, salt: 9001n, signature: `0x${good.signature.slice(44)}` }, 400, /unsupported signature length 65/);
    await refuses(mock, w, { ...spec, salt: 9001n, signature: "0x" }, 400, /not hex|unsupported signature length/);
    await refuses(mock, w, { ...spec, salt: 9001n, signature: `0x01${"00".repeat(20)}${good.signature.slice(44)}` }, 400, /unknown validator/);
  });

  harness.it("the domains are pinned: the same order signed under another chain id, exchange, domain name or Kernel version is refused", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    const reference = await buildOrder(mock, w.a, { ...spec, salt: 5150n });
    const types = {
      Order: [
        { name: "salt", type: "uint256" },
        { name: "maker", type: "address" },
        { name: "signer", type: "address" },
        { name: "beneficiary", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "makerAmount", type: "uint256" },
        { name: "takerAmount", type: "uint256" },
        { name: "expiration", type: "uint256" },
        { name: "nonce", type: "uint128" },
        { name: "identifier", type: "bytes16" },
        { name: "metadata", type: "bytes32" },
        { name: "side", type: "uint8" },
        { name: "signatureType", type: "uint8" },
      ],
    } as const;
    const orderUnder = (domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` }): Hex =>
      hashTypedData({ domain: { ...domain, chainId: BigInt(domain.chainId) }, types, primaryType: "Order", message: { ...reference.parsed } });
    const real = { name: "XO Market CLOB", version: "1", chainId: 3223, verifyingContract: CTF_EXCHANGE };
    assert.equal(orderUnder(real), reference.hash, "the reference domain is the pinned one");
    const wrapUnder = (inner: Hex, kernelVersion: string, chainId: number): Hex =>
      hashTypedData({ domain: { name: "Kernel", version: kernelVersion, chainId: BigInt(chainId), verifyingContract: w.a.account }, types: { Kernel: [{ name: "hash", type: "bytes32" }] }, primaryType: "Kernel", message: { hash: inner } });
    const sendSigned = async (wrapped: Hex): Promise<{ status: number; text: string }> => {
      const signature = `0x01845adb2c711129d4f3966735ed98a9f09fc4ce57${(await w.a.owner.signMessage({ message: { raw: wrapped } })).slice(2)}`;
      const { reply } = await placeOrder(mock, w.a, w.credsA, { ...spec, salt: 5150n, signature: signature as Hex });
      return reply;
    };
    const wrong: [string, Hex][] = [
      ["another chain id", wrapUnder(orderUnder({ ...real, chainId: 1 }), "0.3.1", 3223)],
      ["another exchange", wrapUnder(orderUnder({ ...real, verifyingContract: MARKET_MANAGER }), "0.3.1", 3223)],
      ["another domain name", wrapUnder(orderUnder({ ...real, name: "Polymarket CTF Exchange" }), "0.3.1", 3223)],
      ["another domain version", wrapUnder(orderUnder({ ...real, version: "2" }), "0.3.1", 3223)],
      ["another Kernel version", wrapUnder(reference.hash, "0.3.0", 3223)],
      ["another Kernel chain id", wrapUnder(reference.hash, "0.3.1", 1)],
      ["no Kernel wrapper at all", reference.hash],
    ];
    for (const [name, wrapped] of wrong) {
      const reply = await sendSigned(wrapped);
      assert.equal(reply.status, 400, name);
      assert.match(reply.text, /does not recover to the owner/, name);
    }
    assert.equal(mock.write.orders.size, 0);
    const right = await sendSigned(wrapUnder(reference.hash, "0.3.1", 3223));
    assert.equal(right.status, 200, right.text);
  });

  harness.it("the deployed Kernel has the last word: a signature that recovers to the owner in a library but has v of 0 or 1 is refused (ERC-1271)", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES, salt: 6060n } as const;
    const good = await buildOrder(mock, w.a, spec);
    const v = Number.parseInt(good.signature.slice(-2), 16);
    assert.ok(v === 27 || v === 28);
    const parity = `${good.signature.slice(0, -2)}${(v - 27).toString(16).padStart(2, "0")}` as Hex;
    await refuses(mock, w, { ...spec, signature: parity }, 400, /the maker account rejected the signature \(ERC-1271\)/);
    assert.equal((await placeOrder(mock, w.a, w.credsA, { ...spec, signature: good.signature })).reply.status, 200, "the same order with v of 27 or 28 is fine");
  });

  harness.it("a maker that has code but no owner (a contract that is not a Kernel account) is refused before the registry is asked", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    const stolen = await buildOrder(mock, w.a, spec);
    await refuses(mock, w, { ...spec, maker: KERNEL_FACTORY, signer: KERNEL_FACTORY, signature: stolen.signature }, 400, "invalid signature: the maker has no registered owner");
  });

  harness.it("a maker with no code (never deployed) fails the ERC-1271 step, and an unregistered maker is 403", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES } as const;
    const ghost = (await import("./traders.js")).traderFor(mock, 6);
    mock.state.forceRegistered(ghost.account);
    const credsGhost = w.credsA;
    const body = await buildOrder(mock, ghost, spec);
    const reply = await postJson(mock, "/order", body.body, l2Headers(mock, ghost, credsGhost, "POST", "/order", { body: body.body, headers: { xo_address: w.a.account } }));
    assert.equal(reply.status, 400);
    assert.match(errorOf(reply), /EIP-1271: no contract code at the maker/);
    // Deployed but not registered (registry.trigger never).
    mock.setSwitch("registry.trigger", "never");
    const c = await setupTrader(mock, 4, { register: false });
    const credsC = await createCredentials(mock, c);
    const { reply: unregistered } = await placeOrder(mock, c, credsC, spec);
    assert.equal(unregistered.status, 403);
    assert.deepEqual(unregistered.body, { error: "maker is not a registered XO smart account" });
    mock.state.forceRegistered(c.account);
    assert.equal((await placeOrder(mock, c, credsC, spec)).reply.status, 200);
  });

  harness.it("size and notional floors are 422 with the OpenAPI example's shape", async (mock) => {
    const w = await world(mock);
    mock.setSwitch("order.min_size", "5");
    mock.setSwitch("order.min_notional", "1");
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 500, sharesMicro: 4_000_000n }, 422, "size below minimum: min 5000000, got 4000000");
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 100, sharesMicro: 5_000_000n }, 422, "notional below minimum: min 1000000, got 500000");
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 200, sharesMicro: 5_000_000n })).reply.status, 200, "5 shares at 0.200 is exactly $1.00");
  });

  harness.it("a BUY must be covered including the 800 bps fee bound; the funds of other resting orders count", async (mock) => {
    const w = await world(mock, { fundMicro: 10_000_000n });
    const spec = { tokenId: w.yes, side: "BUY", tick: 500 } as const;
    // $9.26 x 1.08 = $10.0008: refused. $9.25 x 1.08 = $9.99: fine.
    await refuses(mock, w, { ...spec, sharesMicro: 18_520_000n }, 422, "insufficient balance");
    assert.equal((await placeOrder(mock, w.a, w.credsA, { ...spec, sharesMicro: 18_500_000n })).reply.status, 200);
    // What is left (about 1 cent) cannot cover another order.
    await refuses(mock, w, { ...spec, tick: 400, sharesMicro: 1_000_000n }, 422, "insufficient balance");
  });

  harness.it("duplicates: the same signed order cannot rest twice; once it is gone it can be posted again", async (mock) => {
    const w = await world(mock);
    const spec = { tokenId: w.yes, side: "BUY", tick: 300, sharesMicro: SHARES, salt: 4242n } as const;
    const first = await placeOrder(mock, w.a, w.credsA, spec);
    assert.equal(first.reply.status, 200);
    const again = await placeOrder(mock, w.a, w.credsA, spec);
    assert.equal(again.reply.status, 400);
    assert.deepEqual(again.reply.body, { error: "duplicate order: same signed-payload hash is already resting" });
    assert.equal(mock.write.orders.size, 1);
    const cancelled = await l2Call(mock, w.a, w.credsA, "DELETE", "/order", { orderID: first.built.hash });
    assert.deepEqual((cancelled.body as { canceled: string[] }).canceled, ["100001"]);
    assert.equal((await placeOrder(mock, w.a, w.credsA, spec)).reply.status, 200);
  });

  harness.it("post-only: an order that would cross is 400, a resting one is fine, FOK and FAK cannot be post-only", async (mock) => {
    const w = await world(mock);
    // The best ask is 0.505.
    await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 510, sharesMicro: SHARES, postOnly: true }, 400, "post-only order would cross the book");
    assert.equal((await placeOrder(mock, w.a, w.credsA, { tokenId: w.yes, side: "BUY", tick: 500, sharesMicro: SHARES, postOnly: true })).reply.status, 200);
    for (const orderType of ["FOK", "FAK"] as const) {
      await refuses(mock, w, { tokenId: w.yes, side: "BUY", tick: 400, sharesMicro: SHARES, postOnly: true, orderType }, 400, "postOnly is only valid with GTC or GTD");
    }
  });
});
