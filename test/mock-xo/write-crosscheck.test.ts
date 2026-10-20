import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress, type Address } from "viem";

import {
  SIDE_BUY,
  assembleWireSignature,
  buildL1Headers,
  buildL2Headers,
  computeOrderAmounts,
  hashClobAuth,
  hashOrder,
  kernelWrapDigest,
  orderToWire,
  prepareClobAuthSigning,
  prepareOrderSigning,
  type XoOrder,
} from "../../src/xo/signing/index.js";
import { seeded } from "../anvil/scenarios.js";
import { getJson, useMock } from "./testing.js";
import { marketTokens, setupTrader, ZERO_ADDRESS, ZERO_BYTES16, ZERO_BYTES32 } from "./traders.js";
import { clobAuthDigest, kernelWrappedDigest, orderDigest } from "./verify.js";

// The mock verifies with its own digests (verify.ts, viem only). The relay signs with src/xo/signing. These tests make
// the two meet: the digests agree on seeded random inputs, and what the production signing code builds is accepted
// by the mock, byte for byte, through the real deployed Kernel.

describe("the mock's digests equal the production signing code's", () => {
  it("order hash, Kernel wrap and ClobAuth digest agree on 60 seeded random inputs", () => {
    const rnd = seeded("write-crosscheck");
    for (let i = 0; i < 60; i += 1) {
      const maker = rnd.address();
      const order: XoOrder = {
        salt: rnd.word() >> 20n,
        maker,
        signer: maker,
        beneficiary: ZERO_ADDRESS,
        tokenId: rnd.word() >> 8n,
        makerAmount: BigInt(1 + rnd.below(1_000_000_000)),
        takerAmount: BigInt(1 + rnd.below(1_000_000_000)),
        expiration: BigInt(rnd.below(2_000_000_000)),
        nonce: 0n,
        identifier: ZERO_BYTES16,
        metadata: ZERO_BYTES32,
        side: rnd.below(2) as 0 | 1,
        signatureType: 3,
      };
      const mine = orderDigest({ ...order });
      assert.equal(mine, hashOrder(order), `order ${String(i)}`);
      assert.equal(kernelWrappedDigest(mine, maker), kernelWrapDigest(mine, maker), `wrap ${String(i)}`);
      const timestamp = String(1_700_000_000 + rnd.below(100_000_000));
      const nonce = BigInt(rnd.below(5));
      assert.equal(clobAuthDigest(maker, timestamp, nonce), hashClobAuth({ address: maker, timestamp, nonce }), `clobauth ${String(i)}`);
    }
  });
});

describe("what the production signing code builds, the mock accepts", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("L1 headers, L2 headers and a signed order from src/xo/signing pass the mock's checks through the real Kernel", async (mock) => {
    mock.setProfile("optimistic");
    await mock.paymaster.reconcile("sponsor");
    const trader = await setupTrader(mock, 2);
    const account = getAddress(trader.account) as Address;

    // L1: the owner signs the Kernel-wrapped ClobAuth digest; the header carries the canonical 86-byte wire signature.
    const timestamp = String(mock.clock.nowSeconds());
    const clob = prepareClobAuthSigning({ address: account, timestamp, nonce: 0n });
    const ecdsa = await trader.owner.signMessage({ message: { raw: clob.wrappedDigest } });
    const l1 = buildL1Headers({ address: account, timestamp, nonce: 0n }, assembleWireSignature(ecdsa));
    const created = await getJson(mock, "orderbook", "/auth/api-key", { method: "POST", headers: Object.fromEntries(Object.entries(l1).map(([name, value]) => [name.toLowerCase(), value])) });
    assert.equal(created.status, 200, created.text);
    const credentials = created.body as { apiKey: string; secret: string; passphrase: string };

    // L2: path-only target, padded URL-safe base64, decoded key, no address: the optimistic server's form.
    const l2 = (method: string, path: string, body = ""): Record<string, string> => {
      const headers = buildL2Headers({ credentials, timestamp: String(mock.clock.nowSeconds()), method, requestPath: path, body, canonicalMode: "path-only" });
      return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
    };
    assert.equal((await getJson(mock, "orderbook", "/auth/api-keys", { headers: l2("GET", "/auth/api-keys") })).status, 200);

    // An order: amounts from the production calculator, the digest from prepareOrderSigning, the wire object from orderToWire.
    const { yes } = marketTokens(mock, "clob-active-a");
    const amounts = computeOrderAmounts({ side: SIDE_BUY, price: "0.30", shares: "10" });
    const now = mock.clock.nowSeconds();
    const order: XoOrder = {
      salt: 123456789n,
      maker: account,
      signer: account,
      beneficiary: ZERO_ADDRESS,
      tokenId: BigInt(yes),
      makerAmount: amounts.makerAmount,
      takerAmount: amounts.takerAmount,
      expiration: BigInt(now + 600),
      nonce: 0n,
      identifier: ZERO_BYTES16,
      metadata: ZERO_BYTES32,
      side: SIDE_BUY,
      signatureType: 3,
    };
    const request = prepareOrderSigning(order, { expiry: { nowSeconds: now, minTtlSeconds: 60, maxTtlSeconds: 3600 } });
    for (const form of ["eip191", "raw"] as const) {
      const signed: XoOrder = { ...order, salt: order.salt + (form === "raw" ? 1n : 0n) };
      const prepared = prepareOrderSigning(signed, { expiry: { nowSeconds: now, minTtlSeconds: 60, maxTtlSeconds: 3600 } });
      const sig65 = form === "raw" ? await trader.owner.sign({ hash: prepared.wrappedDigest }) : await trader.owner.signMessage({ message: { raw: prepared.wrappedDigest } });
      const body = JSON.stringify({ order: { ...orderToWire(signed), signature: assembleWireSignature(sig65) }, orderType: "GTD" });
      const reply = await getJson(mock, "orderbook", "/order", { method: "POST", headers: { "content-type": "application/json", ...l2("POST", "/order", body) }, body });
      assert.equal(reply.status, 200, `${form}: ${reply.text}`);
      assert.equal((reply.body as { orderID: string }).orderID, prepared.innerHash, "the orderID is the hash the production code computed");
    }
    assert.equal(request.smartAccount, account);
    assert.equal(mock.engine.liveOrders(trader.key).length, 2);
  });
});
