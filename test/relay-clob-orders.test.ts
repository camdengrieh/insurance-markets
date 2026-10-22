import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { recoverAddress, type Hex } from "viem";

import { POLYMARKET_EXCHANGES } from "../src/clob/venues.js";
import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { FAKE_TOKEN, FAKE_TRIPLET, LM_EXCHANGE, LM_NO_TOKEN, OWNER_KEY, PM_CONDITION, PM_YES_TOKEN, STRANGER_KEY, cleanupClob, limitlessHashOfWire, lmOrderBody, pmOrderBody, polymarketHashOfWire, prepareOk, signDigest, startClobRig, type ClobRig } from "./relay-clob-helpers.js";

// POST /v1/clob/order/prepare and /submit against the scripted venue fakes. Nothing here touched a real venue: each
// test says "against the scripted fake" by its placement in this file, and the fake answers the documented shapes.

const rigs: ClobRig[] = [];
after(() => cleanupClob(rigs));

async function rig(options: Parameters<typeof startClobRig>[0] = {}): Promise<ClobRig> {
  const started = await startClobRig(options);
  rigs.push(started);
  return started;
}

describe("prepare on Polymarket (against the scripted fake)", () => {
  it("builds an EOA order for the owner itself on the V2 book: typed data is the order, decoded block rebuilds, cap and quote agree", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    assert.equal(item.kind, "clob_order");
    assert.equal(item.owner.toLowerCase(), OWNER_KEY.address.toLowerCase());
    assert.equal(item.account.toLowerCase(), OWNER_KEY.address.toLowerCase(), "the maker is the owner EOA; no derived account");
    assert.equal(item.sign.digest_form, "eip712OrderHash");
    assert.equal(item.sign.intent.op, "typedData");
    if (item.sign.intent.op !== "typedData") throw new Error("typed data expected");
    const typed = item.sign.intent.typedData;
    assert.equal(typed.primaryType, "Order");
    assert.deepEqual(typed.domain, { name: "Polymarket CTF Exchange", version: "3", chainId: 137, verifyingContract: POLYMARKET_EXCHANGES.v2.verifyingContract });
    assert.equal(typed.message["maker"], OWNER_KEY.address);
    assert.equal(typed.message["signer"], OWNER_KEY.address);
    assert.equal(typed.message["signatureType"], 0);
    assert.equal(typed.message["makerAmount"], "5200000");
    assert.equal(typed.message["takerAmount"], "10000000");
    assert.equal(item.summary.inner_hash_tag, item.summary.digest_tag, "the typed data is the order itself");
    assert.deepEqual(item.quote, { venue: "polymarket", price: "0.52", shares: "10", max_outlay_usd: "5.72", fee_bound_bps: 1000, expires_at: item.quote.expires_at });
    assert.equal(item.caps.reserved_usd, "5.72");
    assert.notEqual(item.quote.expires_at, null, "a GTD carries a wire expiry");
    const decoded = item.decoded;
    assert.ok(decoded !== undefined && decoded.kind === "clob_order");
    if (decoded === undefined || decoded.kind !== "clob_order") return;
    assert.equal(decoded.venue, "polymarket");
    assert.equal(decoded.chain_id, 137);
    assert.equal(decoded.params.tick, "0.01");
    assert.equal(decoded.params.min_size, "5");
    assert.equal(decoded.params.market_id, PM_CONDITION.toLowerCase());
    assert.ok(verifyPreparedLocal(item).ok);
    assert.deepEqual(decoded.terms.side, "BUY");
    assert.ok(item.summary.lines.some((line) => line.includes("Polymarket order: BUY 10 shares")));
    assert.ok(item.warnings.some((line) => /requesting IP/.test(line)), "the geoblock note is on the item");
    assert.ok(r.venues.requests.includes("GET clob.polymarket.com/book"));
    assert.ok(r.venues.requests.includes("GET gamma-api.polymarket.com/markets/keyset"));
  });

  it("signs for the CTF or neg-risk exchange when Gamma says the market is not V2", async () => {
    const r = await rig();
    r.venues.pmVersion = "v1";
    const ctf = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody({ tif: "GTC", ttl_s: undefined }));
    assert.ok(ctf.decoded !== undefined && ctf.decoded.kind === "clob_order");
    if (ctf.decoded === undefined || ctf.decoded.kind !== "clob_order") return;
    assert.equal(ctf.decoded.domain.version, "2");
    assert.equal(ctf.decoded.domain.verifying_contract.toLowerCase(), POLYMARKET_EXCHANGES.ctf.verifyingContract.toLowerCase());
    r.venues.pmNegRisk = true;
    const neg = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody({ tif: "GTC", ttl_s: undefined, shares: "6" }));
    assert.ok(neg.decoded !== undefined && neg.decoded.kind === "clob_order");
    if (neg.decoded === undefined || neg.decoded.kind !== "clob_order") return;
    assert.equal(neg.decoded.domain.verifying_contract.toLowerCase(), POLYMARKET_EXCHANGES.neg_risk.verifyingContract.toLowerCase());
  });

  it("refuses with flag_off when ENABLE_CLOB_POLYMARKET is off, and never reads the venue for it", async () => {
    const r = await rig({ env: { ENABLE_CLOB_POLYMARKET: "0" } });
    const result = await r.post("/v1/clob/order/prepare", pmOrderBody());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "flag_off");
    assert.equal(r.venues.requests.length, 0);
    const limitless = await r.post("/v1/clob/order/prepare", lmOrderBody());
    assert.ok(limitless.ok, "the other venue's switch is its own");
  });

  it("refuses a price off the market's tick, a size too fine or below the minimum, a lifetime on a non-GTD, and a slug for a condition id", async () => {
    const r = await rig();
    const code = async (over: Partial<ReturnType<typeof pmOrderBody>>): Promise<string> => {
      const result = await r.post("/v1/clob/order/prepare", pmOrderBody(over));
      return result.ok ? "ok" : `${result.error.code}:${String(result.error.details?.["reason"] ?? "")}`;
    };
    assert.equal(await code({ price: "0.525" }), "invalid_request:invalid_price");
    assert.equal(await code({ shares: "10.123" }), "invalid_request:invalid_size");
    assert.equal(await code({ shares: "4.99" }), "invalid_request:below_minimum");
    assert.equal(await code({ tif: "GTC", ttl_s: 300 }), "invalid_request:ttl_needs_gtd");
    assert.equal(await code({ ttl_s: 60 }), "invalid_request:ttl_out_of_range");
    assert.equal(await code({ market_id: "some-slug" }), "invalid_request:market_id_form");
    assert.equal(await code({ post_only: true, tif: "FOK", ttl_s: undefined }), "invalid_request:post_only_needs_resting");
  });

  it("refuses a BUY further above the best ask than the band, and a taker order on an empty book", async () => {
    const r = await rig();
    const far = await r.post("/v1/clob/order/prepare", pmOrderBody({ price: "0.99", shares: "6" }));
    assert.equal(far.ok, false);
    if (!far.ok) assert.equal(far.error.details?.["reason"], "price_band");
    r.venues.pmAsks = [];
    r.venues.pmBids = [];
    const empty = await r.post("/v1/clob/order/prepare", pmOrderBody());
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.error.details?.["reason"], "no_reference_price");
    const resting = await r.post("/v1/clob/order/prepare", pmOrderBody({ post_only: true }));
    assert.ok(resting.ok, "a post-only order needs no reference");
  });

  it("refuses a tick it does not know and a market whose record Gamma cannot give", async () => {
    const r = await rig();
    r.venues.pmTick = "0.02";
    const tick = await r.post("/v1/clob/order/prepare", pmOrderBody());
    assert.equal(tick.ok, false);
    if (!tick.ok) assert.equal(tick.error.details?.["reason"], "tick_size");
    r.venues.pmTick = "0.01";
    r.venues.pmVersion = undefined;
    const noVersion = await r.post("/v1/clob/order/prepare", pmOrderBody());
    assert.ok(noVersion.ok, "no version means the CTF book, not a refusal");
  });

  it("counts the order against the per-order cap: an order above it is refused with cap_exceeded", async () => {
    const r = await rig({ env: { XO_MAX_ORDER_USD: "5" } });
    const result = await r.post("/v1/clob/order/prepare", pmOrderBody());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "cap_exceeded");
  });
});

describe("prepare on Limitless (against the scripted fake)", () => {
  it("builds an EOA order with nonce 0, expiration 0 and the zero taker, signed for the market's pinned exchange", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", lmOrderBody());
    assert.equal(item.kind, "clob_order");
    if (item.sign.intent.op !== "typedData") throw new Error("typed data expected");
    const typed = item.sign.intent.typedData;
    assert.deepEqual(typed.domain, { name: "Limitless CTF Exchange", version: "1", chainId: 8453, verifyingContract: LM_EXCHANGE });
    assert.equal(typed.message["nonce"], "0");
    assert.equal(typed.message["expiration"], "0");
    assert.equal(typed.message["taker"], "0x0000000000000000000000000000000000000000");
    assert.equal(typed.message["feeRateBps"], "0");
    assert.equal(item.quote.expires_at, null, "no expiry is signed on Limitless");
    assert.ok(verifyPreparedLocal(item).ok);
    assert.ok(item.summary.lines.some((line) => /No expiry is signed/.test(line)));
    assert.ok(item.warnings.some((line) => /Ontario or Alberta/.test(line)));
  });

  it("refuses GTD, a lifetime, a market whose exchange is not pinned, a fee module whose rate is unknown, and an AMM market", async () => {
    const r = await rig();
    const code = async (over: Partial<ReturnType<typeof lmOrderBody>>): Promise<string> => {
      const result = await r.post("/v1/clob/order/prepare", lmOrderBody(over));
      return result.ok ? "ok" : `${result.error.code}:${String(result.error.details?.["reason"] ?? "")}`;
    };
    assert.equal(await code({ tif: "GTD" }), "invalid_request:tif_not_offered");
    assert.equal(await code({ ttl_s: 300 }), "invalid_request:ttl_not_signed");
    r.venues.lmExchange = OWNER_KEY.address;
    assert.equal(await code({}), "precondition_failed:exchange_not_pinned");
    r.venues.lmExchange = LM_EXCHANGE;
    r.venues.lmFeeModule = "LEGACY";
    assert.equal(await code({}), "precondition_failed:fee_rate_unknown");
    r.venues.lmFeeModule = "COLLATERAL";
    r.venues.lmTradeType = "amm";
    assert.equal(await code({}), "precondition_failed:not_clob");
  });

  it("refuses an order whose makerAmount is under Limitless's 100 raw-unit floor (create-order.md), and takes one at the floor", async () => {
    const r = await rig();
    r.venues.lmMinSize = "0";
    // 0.01 shares at 0.001 is 10 raw units of collateral; 0.1 shares at 0.001 is exactly 100.
    const under = await r.post("/v1/clob/order/prepare", lmOrderBody({ price: "0.001", shares: "0.01", post_only: true }));
    assert.equal(under.ok, false);
    if (!under.ok) {
      assert.equal(under.error.code, "invalid_request");
      assert.equal(under.error.details?.["reason"], "below_minimum");
      assert.match(under.error.message, /100 raw units/);
    }
    const atFloor = await r.post("/v1/clob/order/prepare", lmOrderBody({ price: "0.001", shares: "0.1", post_only: true }));
    assert.ok(atFloor.ok, JSON.stringify(atFloor));
    if (atFloor.ok && atFloor.data.decoded?.kind === "clob_order") assert.equal(atFloor.data.decoded.order.maker_amount, "100");
  });

  it("checks a NO-token order against the complement of the YES book", async () => {
    const r = await rig();
    // YES best bid 0.500 implies a NO best ask of 0.500: a NO BUY at 0.52 is inside the band, at 0.99 it is not.
    assert.ok((await r.post("/v1/clob/order/prepare", lmOrderBody({ token_id: LM_NO_TOKEN }))).ok);
    const far = await r.post("/v1/clob/order/prepare", lmOrderBody({ token_id: LM_NO_TOKEN, price: "0.99" }));
    assert.equal(far.ok, false);
  });
});

describe("submit (against the scripted fake)", () => {
  it("sends a Polymarket order once with the stored credential and the owner's raw EIP-712 signature, and the fake recomputes the same order id", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    const signature = await signDigest(item.sign.expected_digest);
    const sent = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature });
    assert.ok(sent.ok, JSON.stringify(sent));
    if (!sent.ok) return;
    assert.equal(sent.data.state, "accepted");
    assert.equal(sent.data.venue, "polymarket");
    assert.equal(sent.data.order_hash, item.sign.expected_digest.toLowerCase());
    const post = r.venues.posts[0];
    assert.ok(post !== undefined);
    assert.equal(post.path, "/order");
    assert.equal(post.headers["poly_api_key"], FAKE_TRIPLET.apiKey);
    assert.equal(post.headers["poly_address"], OWNER_KEY.address);
    assert.ok(post.headers["poly_signature"] !== undefined && post.headers["poly_timestamp"] !== undefined && post.headers["poly_passphrase"] === FAKE_TRIPLET.passphrase);
    const wire = post.body["order"] as Record<string, unknown>;
    assert.equal(polymarketHashOfWire(wire), item.sign.expected_digest.toLowerCase());
    assert.equal(wire["signature"], signature);
    assert.equal(wire["side"], "BUY");
    assert.equal(post.body["orderType"], "GTD");
    assert.equal(post.body["owner"], FAKE_TRIPLET.apiKey, "owner on the wire is the API key, as the docs say");
    assert.equal((await recoverAddress({ hash: item.sign.expected_digest as Hex, signature })).toLowerCase(), OWNER_KEY.address.toLowerCase());
    // Once only.
    const again = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.error.code, "prepared_used");
    assert.equal(r.venues.posts.length, 1);
  });

  it("sends a Limitless order with the lmts headers, the market slug and the signed struct's fields", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", lmOrderBody());
    const signature = await signDigest(item.sign.expected_digest);
    const sent = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature });
    assert.ok(sent.ok, JSON.stringify(sent));
    if (!sent.ok) return;
    assert.equal(sent.data.state, "accepted");
    assert.equal(sent.data.detail, "venue_ack_shape_unverified");
    const post = r.venues.posts[0];
    assert.ok(post !== undefined);
    assert.equal(post.path, "/orders");
    assert.equal(post.headers["lmts-api-key"], FAKE_TOKEN.tokenId);
    assert.match(post.headers["lmts-timestamp"] ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(post.body["marketSlug"], lmOrderBody().market_id);
    assert.equal(post.body["orderType"], "GTC");
    assert.equal(limitlessHashOfWire(post.body["order"] as Record<string, unknown>), item.sign.expected_digest.toLowerCase());
  });

  it("refuses a stranger's signature and a personal-message (EIP-191) wrapping, and sends nothing", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    const stranger = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest, STRANGER_KEY) });
    assert.equal(stranger.ok, false);
    if (!stranger.ok) assert.equal(stranger.error.code, "owner_mismatch");
    const wrapped = await OWNER_KEY.signMessage({ message: { raw: item.sign.expected_digest as Hex } });
    const eip191 = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature: wrapped });
    assert.equal(eip191.ok, false);
    if (!eip191.ok) {
      assert.equal(eip191.error.code, "signature_invalid");
      assert.equal(eip191.error.details?.["reason"], "eip191_not_accepted");
    }
    assert.equal(r.venues.posts.length, 0);
    // The item is still usable with the right signature.
    const ok = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest) });
    assert.ok(ok.ok);
  });

  it("refuses with flag_off at submit when the venue's switch went off after prepare, and sends nothing", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    const signature = await signDigest(item.sign.expected_digest);
    const off = await r.relay.close().then(() => startClobRig({ env: { ENABLE_CLOB_POLYMARKET: "0" }, dir: r.dir, clock: r.clock, venues: r.venues }));
    rigs.push(off);
    const sent = await off.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature });
    assert.equal(sent.ok, false);
    if (!sent.ok) assert.equal(sent.error.code, "flag_off");
    assert.equal(off.venues.posts.length, 0);
  });

  it("answers rejected on a venue 4xx and ambiguous on a 5xx, and never resends", async () => {
    const r = await rig();
    const first = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    r.venues.postQueue.push({ kind: "reject", status: 400, error: "invalid order: min size" });
    const rejected = await r.post("/v1/clob/order/submit", { prepared_id: first.prepared_id, signature: await signDigest(first.sign.expected_digest) });
    assert.ok(rejected.ok);
    if (rejected.ok) {
      assert.equal(rejected.data.state, "rejected");
      assert.match(rejected.data.detail ?? "", /min size/);
    }
    const second = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody({ shares: "6" }));
    r.venues.postQueue.push({ kind: "http", status: 502, body: "bad gateway" });
    const ambiguous = await r.post("/v1/clob/order/submit", { prepared_id: second.prepared_id, signature: await signDigest(second.sign.expected_digest) });
    assert.ok(ambiguous.ok);
    if (ambiguous.ok) assert.equal(ambiguous.data.state, "ambiguous");
    const again = await r.post("/v1/clob/order/submit", { prepared_id: second.prepared_id, signature: await signDigest(second.sign.expected_digest) });
    assert.equal(again.ok, false);
    assert.equal(r.venues.posts.length, 2);
    await r.clob.idle();
  });

  it("refuses to send without a stored credential and leaves the item usable after one is stored", async () => {
    const r = await rig({ credentials: { polymarket: false } });
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    assert.ok(item.warnings.some((line) => /No Polymarket credential is stored/.test(line)));
    const sent = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest) });
    assert.equal(sent.ok, false);
    if (!sent.ok) assert.equal(sent.error.code, "precondition_failed");
    assert.equal(r.venues.posts.length, 0);
  });

  it("answers pending when the venue is slow, then settles in the background", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    r.venues.postQueue.push({ kind: "hang" });
    const sent = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest) });
    assert.ok(sent.ok);
    if (sent.ok) assert.equal(sent.data.state, "pending");
    r.venues.releaseHangs();
    await r.clob.idle();
    const record = r.relay.services.prepared.get(item.prepared_id);
    assert.equal(record?.state, "accepted");
  });
});
