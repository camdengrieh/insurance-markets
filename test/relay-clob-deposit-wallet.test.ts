import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { recoverAddress, sliceHex, stringToHex, type Address, type Hex } from "viem";

import { depositWalletAddress } from "../src/clob/polymarket/deposit-wallet.js";
import { POLYMARKET_ORDER_TYPE_STRING, hashPolymarketDepositWalletOrder, hashPolymarketOrder, polymarketExchangeDomainSeparator, polymarketOrderDomain, type PolymarketOrder } from "../src/clob/polymarket/order.js";
import type { DecodedClobOrder } from "../src/relay/contract.js";
import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { FAKE_TRIPLET, OWNER_KEY, POLYGON_RPC_HOST, cleanupClob, pmOrderBody, polymarketHashOfWire, prepareOk, signDigest, startClobRig, type ClobRig } from "./relay-clob-helpers.js";

// The Polymarket Deposit Wallet path (signature type 3) of POST /v1/clob/order/prepare and /submit, against the
// scripted fakes: the CLOB and Gamma fakes of relay-clob-helpers.ts and a Polygon JSON-RPC fake that answers eth_getCode
// and eth_call for the rig owner's derived wallet addresses. Nothing here touched a real venue or a real chain;
// test/clob-deposit-wallet-anvil.test.ts runs the signature against the real wallet bytecode.

const rigs: ClobRig[] = [];
after(() => cleanupClob(rigs));

async function rig(): Promise<ClobRig> {
  const started = await startClobRig();
  rigs.push(started);
  return started;
}

const OWNER = OWNER_KEY.address;
const BEACON_WALLET = depositWalletAddress(OWNER, "beacon");
const UUPS_WALLET = depositWalletAddress(OWNER, "uups");

function decodedOrder(item: { readonly decoded?: unknown }): DecodedClobOrder {
  const decoded = item.decoded as DecodedClobOrder | undefined;
  assert.ok(decoded !== undefined && decoded.kind === "clob_order");
  return decoded;
}

function orderOf(d: DecodedClobOrder): PolymarketOrder {
  if (d.order.venue !== "polymarket") throw new Error("a Polymarket order was expected");
  return {
    salt: BigInt(d.order.salt),
    maker: d.order.maker as Address,
    signer: d.order.signer as Address,
    tokenId: BigInt(d.order.token_id),
    makerAmount: BigInt(d.order.maker_amount),
    takerAmount: BigInt(d.order.taker_amount),
    side: d.order.side,
    signatureType: d.order.signature_type,
    timestamp: BigInt(d.order.timestamp_ms),
    metadata: d.order.metadata as Hex,
    builder: d.order.builder as Hex,
  };
}

async function refusal(r: ClobRig, body: Parameters<typeof pmOrderBody>[0] = {}): Promise<string> {
  const result = await r.post("/v1/clob/order/prepare", pmOrderBody(body));
  return result.ok ? "ok" : `${result.error.code}:${String(result.error.details?.["reason"] ?? "")}`;
}

describe("which Polymarket account is the maker: read from Polygon (against the scripted fakes)", () => {
  it("reads both derived addresses and, with no code at either, builds an EOA order (type 0) and says why", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    assert.equal(item.account, OWNER);
    assert.equal(decodedOrder(item).order.signature_type, 0);
    assert.deepEqual(r.venues.rpcCalls.filter((call) => call.startsWith("eth_getCode")).sort(), [`eth_getCode ${BEACON_WALLET}`, `eth_getCode ${UUPS_WALLET}`].sort());
    assert.ok(r.venues.requests.includes(`POST ${POLYGON_RPC_HOST}/`));
    assert.ok(item.warnings.some((line) => /No Polymarket Deposit Wallet is deployed/.test(line)));
  });

  it("prepares a Deposit Wallet order (beacon form): maker and signer the wallet, type 3, the TypedDataSign wrapper to sign, and the card rebuilds it", async () => {
    const r = await rig();
    r.venues.pmWallets = [{ proxy: "beacon" }];
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    assert.equal(item.owner, OWNER);
    assert.equal(item.account, BEACON_WALLET, "the maker is the wallet the relay read");
    const decoded = decodedOrder(item);
    assert.equal(decoded.account, BEACON_WALLET);
    assert.equal(decoded.order.maker, BEACON_WALLET);
    assert.equal(decoded.order.signer, BEACON_WALLET);
    assert.equal(decoded.order.signature_type, 3);
    assert.equal(item.sign.digest_form, "eip712OrderHash");
    if (item.sign.intent.op !== "typedData") throw new Error("typed data expected");
    const typed = item.sign.intent.typedData;
    assert.equal(typed.primaryType, "TypedDataSign");
    assert.equal(typed.message["verifyingContract"], BEACON_WALLET);
    assert.equal((typed.message["contents"] as Record<string, unknown>)["maker"], BEACON_WALLET);
    const order = orderOf(decoded);
    assert.equal(item.sign.expected_digest, hashPolymarketDepositWalletOrder(order, "v2"), "the owner signs the wrapper's digest");
    assert.ok(item.summary.lines.some((line) => line.includes(`Order hash ${hashPolymarketOrder(order, "v2")} (the venue's order id)`)));
    assert.ok(item.summary.lines.some((line) => line.includes("Polymarket Deposit Wallet") && line.includes(OWNER)));
    assert.ok(item.warnings.some((line) => line.includes(`Deposit Wallet ${BEACON_WALLET}`) && /beacon/.test(line)));
    assert.equal(item.caps.reserved_usd, "5.72", "the same cap rule applies");
    assert.ok(verifyPreparedLocal(item).ok, "the card rebuilds the item from its decoded block");
    for (const call of [`eth_call ${BEACON_WALLET} 0x8da5cb5b`, `eth_call ${BEACON_WALLET} 0x84b0196e`]) assert.ok(r.venues.rpcCalls.includes(call), call);
  });

  it("finds a UUPS-form wallet too", async () => {
    const r = await rig();
    r.venues.pmWallets = [{ proxy: "uups" }];
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    assert.equal(item.account, UUPS_WALLET);
    assert.equal(decodedOrder(item).order.signature_type, 3);
    assert.ok(verifyPreparedLocal(item).ok);
  });

  it("accepts a supplied account only when it is the maker it resolved", async () => {
    const r = await rig();
    r.venues.pmWallets = [{ proxy: "beacon" }];
    assert.equal(await refusal(r, { account: OWNER }), "account_mismatch:");
    assert.equal(await refusal(r, { account: BEACON_WALLET }), "ok");
    r.venues.pmWallets = [];
    assert.equal(await refusal(r, { account: BEACON_WALLET }), "account_mismatch:");
  });

  it("refuses, with a precise reason and nothing prepared, a wallet whose code, owner or domain is not what it should be, two wallets, and an unreadable chain", async () => {
    const r = await rig();
    const cases: Array<[typeof r.venues.pmWallets, string]> = [
      [[{ proxy: "beacon", code: "0x6000" }], "precondition_failed:deposit_wallet_code_unexpected"],
      [[{ proxy: "beacon", owner: "0x000000000000000000000000000000000000dEaD" }], "precondition_failed:deposit_wallet_owner_mismatch"],
      [[{ proxy: "beacon", domainName: "SomethingElse" }], "precondition_failed:deposit_wallet_domain"],
      [[{ proxy: "beacon", revert: true }], "precondition_failed:deposit_wallet_unreadable"],
      [[{ proxy: "beacon" }, { proxy: "uups" }], "precondition_failed:deposit_wallet_ambiguous"],
    ];
    for (const [wallets, expected] of cases) {
      r.venues.pmWallets = wallets;
      assert.equal(await refusal(r), expected);
    }
    r.venues.pmWallets = [{ proxy: "beacon" }];
    r.venues.rpcDown = true;
    assert.equal(await refusal(r), "precondition_failed:account_unreadable", "a failed read is never taken as 'no wallet'");
    assert.equal(r.relay.services.prepared.list().length, 0, "nothing was prepared or reserved");
    assert.equal(r.venues.posts.length, 0);
  });
});

describe("submitting a Deposit Wallet order (against the scripted fakes)", () => {
  it("re-reads the wallet, wraps the owner's signature (317 bytes) and posts maker = signer = the wallet, type 3; the order id is the order hash", async () => {
    const r = await rig();
    r.venues.pmWallets = [{ proxy: "beacon" }];
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    const order = orderOf(decodedOrder(item));
    const orderHash = hashPolymarketOrder(order, "v2");
    const signature = await signDigest(item.sign.expected_digest);
    const readsBefore = r.venues.rpcCalls.length;
    const sent = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature });
    assert.ok(sent.ok, JSON.stringify(sent));
    if (!sent.ok) return;
    assert.equal(sent.data.state, "accepted");
    assert.equal(sent.data.order_hash, orderHash.toLowerCase());
    assert.ok(r.venues.rpcCalls.slice(readsBefore).includes(`eth_getCode ${BEACON_WALLET}`), "the wallet is read again at submit");
    const post = r.venues.posts[0];
    assert.ok(post !== undefined);
    assert.equal(post.headers["poly_address"], OWNER, "the L2 credential is the owner's");
    assert.equal(post.body["owner"], FAKE_TRIPLET.apiKey);
    const wire = post.body["order"] as Record<string, unknown>;
    assert.equal(wire["maker"], BEACON_WALLET);
    assert.equal(wire["signer"], BEACON_WALLET);
    assert.equal(wire["signatureType"], 3);
    assert.equal(polymarketHashOfWire(wire), orderHash.toLowerCase());
    const wrapped = wire["signature"] as Hex;
    assert.equal((wrapped.length - 2) / 2, 317);
    assert.equal(sliceHex(wrapped, 0, 65), signature.toLowerCase());
    assert.equal(sliceHex(wrapped, 65, 97), polymarketExchangeDomainSeparator(polymarketOrderDomain("v2")));
    assert.equal(sliceHex(wrapped, 129, 315), stringToHex(POLYMARKET_ORDER_TYPE_STRING).toLowerCase());
    assert.equal(sliceHex(wrapped, 315, 317), "0x00ba");
    assert.equal((await recoverAddress({ hash: item.sign.expected_digest as Hex, signature: sliceHex(wrapped, 0, 65) })).toLowerCase(), OWNER.toLowerCase());
  });

  it("refuses at submit, sending nothing and keeping the item, when the wallet changed owner, lost its code, or cannot be read", async () => {
    const r = await rig();
    r.venues.pmWallets = [{ proxy: "beacon" }];
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    const signature = await signDigest(item.sign.expected_digest);
    const submit = async (): Promise<string> => {
      const result = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature });
      return result.ok ? result.data.state : `${result.error.code}:${String(result.error.details?.["reason"] ?? "")}`;
    };
    r.venues.pmWallets = [{ proxy: "beacon", owner: "0x000000000000000000000000000000000000dEaD" }];
    assert.equal(await submit(), "precondition_failed:deposit_wallet_owner_mismatch");
    r.venues.pmWallets = [];
    assert.equal(await submit(), "precondition_failed:deposit_wallet_not_deployed");
    r.venues.pmWallets = [{ proxy: "beacon" }];
    r.venues.rpcDown = true;
    assert.equal(await submit(), "precondition_failed:account_unreadable");
    assert.equal(r.venues.posts.length, 0);
    assert.equal(r.relay.services.prepared.get(item.prepared_id)?.state, "prepared");
    r.venues.rpcDown = false;
    assert.equal(await submit(), "accepted", "once the wallet reads right again, the same signature goes through");
  });

  it("refuses the owner's signature over the bare order hash: the owner signs the wrapper, and the relay checks against that digest", async () => {
    const r = await rig();
    r.venues.pmWallets = [{ proxy: "beacon" }];
    const item = await prepareOk(r, "/v1/clob/order/prepare", pmOrderBody());
    const bare = await signDigest(hashPolymarketOrder(orderOf(decodedOrder(item)), "v2"));
    const sent = await r.post("/v1/clob/order/submit", { prepared_id: item.prepared_id, signature: bare });
    assert.equal(sent.ok, false);
    if (!sent.ok) assert.equal(sent.error.code, "owner_mismatch");
    assert.equal(r.venues.posts.length, 0);
  });
});
