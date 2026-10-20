import assert from "node:assert/strict";
import { describe } from "node:test";

import { TRIPLET_SECRET_NAME } from "../../relay/credentials.js";
import { OWNER_CONFIRM_MIN_DELAY_MS } from "../../relay/embedded.js";
import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import {
  applyProfile,
  assertNoViolations,
  checkCredentialsKept,
  checkInvariants,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  flowConnect,
  flowFund,
  flowOrder,
  httpTransport,
  identityOf,
  intentOf,
  preparedIdOf,
  signIntent,
  startStack,
  type Transport,
} from "./helpers.js";

// Two owners never share state: credentials, caps, prepared items, orders, fundings. Keyed by the owner's XO account
// everywhere, in both transports (the embedded relay serves one data directory to every owner when told to).

const transports: readonly Transport[] = [httpTransport, embeddedTransport];

for (const transport of transports) {
  describe(`two owners over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    harness.it("credentials, caps, orders, fundings and prepared items stay with their owner", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const alice = identityOf(mock, 0);
      const bob = identityOf(mock, 1);
      assert.notEqual(alice.account, bob.account);
      await ensureDeployedLikeXoApp(stack, alice);
      await ensureDeployedLikeXoApp(stack, bob);

      // Alice connects; Bob has nothing, and cannot borrow Alice's credentials.
      assert.equal((await flowConnect(stack, alice))["submit"]?.code, "connected");
      creditBalance(mock, alice.account, 200_000_000n);
      creditBalance(mock, bob.account, 200_000_000n);
      const bobBefore = await flowOrder(stack, bob);
      // Whichever step says no (today the submit does; see core-findings.test.ts), Bob cannot use Alice's credentials.
      const bobStop = bobBefore["submit"] ?? bobBefore["prepare"]!;
      assert.equal(bobStop.isError, true, "Bob has no credentials yet");
      assert.equal(bobStop.code, "precondition_failed");
      assert.match(bobStop.text, /credentials/i);
      assert.equal(stack.history.wire.count((call) => call.kind === "order_post"), 0, "nothing reached XO for Bob");
      assert.equal((await stack.call("xo_list_orders", { owner: bob.owner })).isError, true);
      // His refused attempt is not charged to Alice.
      assert.equal((await stack.relay.services.ledger.usageDetail(alice.account.toLowerCase())).spentAtomic, 0n);

      // Bob connects: a separate key for a separate account.
      assert.equal((await flowConnect(stack, bob))["submit"]?.code, "connected");
      assert.equal(mock.write.credentials.length, 2);
      assert.notEqual(mock.write.credentials[0]?.apiKey, mock.write.credentials[1]?.apiKey);
      const vault = stack.relay.services.secrets!;
      for (const who of [alice, bob]) assert.equal(await vault.has(who.account.toLowerCase(), TRIPLET_SECRET_NAME), true, "one triplet each");
      assert.deepEqual(await checkCredentialsKept(stack), []);

      // Alice uses up most of her day; Bob's day is his own.
      for (let n = 0; n < 5; n += 1) assert.equal((await flowOrder(stack, alice, { shares: "22.7", price: "0.4", cancel: false }))["submit"]?.code, "accepted");
      assert.equal((await flowOrder(stack, alice, { shares: "22.7", price: "0.4", cancel: false }))["prepare"]?.code, "cap_exceeded");
      const bobOrder = await flowOrder(stack, bob, { shares: "22.7", price: "0.4", cancel: false });
      assert.equal(bobOrder["submit"]?.code, "accepted", "Alice's spend is not charged to Bob");
      const ledger = stack.relay.services.ledger;
      const aliceUsage = await ledger.usageDetail(alice.account.toLowerCase());
      const bobUsage = await ledger.usageDetail(bob.account.toLowerCase());
      assert.ok(aliceUsage.spentAtomic > 40_000_000n && aliceUsage.spentAtomic <= 50_000_000n, `alice ${aliceUsage.spentAtomic}`);
      // Bob's own order ($9.988) plus the earlier credential-less attempt that is still held until it expires ($4.40).
      assert.ok(bobUsage.spentAtomic > 9_900_000n && bobUsage.spentAtomic <= 14_400_000n, `bob ${bobUsage.spentAtomic}`);

      // Orders listed are the owner's own.
      const aliceList = await stack.call("xo_list_orders", { owner: alice.owner });
      const bobList = await stack.call("xo_list_orders", { owner: bob.owner });
      assert.match(aliceList.text, /5 open order/);
      assert.match(bobList.text, /1 open order/);
      const bobHash = [...mock.write.ordersOf(bob.account.slice(2).toLowerCase())][0]!.hash;
      assert.ok(!aliceList.text.includes(bobHash) && bobList.text.includes(bobHash));
      // Alice cannot cancel Bob's order (the relay holds no credential for that pairing and checks the account).
      const cross = await stack.call("xo_cancel_order", { owner: alice.owner, order_hash: bobHash });
      assert.notEqual(cross.code, "cancelled", cross.text.slice(0, 200));
      assert.equal(mock.write.orders.get(bobHash)?.status, "live", "Bob's order is untouched");

      // A prepared item belongs to its owner: Bob cannot submit Alice's, and Alice's signature does not open Bob's.
      const tokens = marketTokens(mock, "clob-active-b");
      await ledger.sweep(async () => ({ verdict: "unknown" }));
      const forAlice = await stack.call("xo_prepare_order", { owner: bob.owner, token_id: tokens.yes, side: "BUY", price: "0.3", shares: "10" });
      assert.ok(intentOf(forAlice) !== undefined, forAlice.text.slice(0, 200));
      const wrong = await stack.call("xo_submit_order", { prepared_id: preparedIdOf(forAlice), signature: await signIntent(alice.key, intentOf(forAlice)!) });
      assert.equal(wrong.isError, true);
      assert.match(String(wrong.code), /owner_mismatch|signature_invalid/);

      // Fundings are per account.
      mock.hyperlane.setBaseBalance(alice.owner, 100_000_000n);
      mock.hyperlane.setBaseBalance(bob.owner, 100_000_000n);
      assert.equal((await flowFund(stack, alice, { amountUsd: "3" }))["first"]?.isError, false);
      assert.equal((await ledger.usageDetail(bob.account.toLowerCase())).fundedLifetimeAtomic, 0n, "Alice's funding is not charged to Bob");
      assert.equal((await flowFund(stack, bob, { amountUsd: "3" }))["first"]?.isError, false);

      // Statuses show their own credentials only.
      const aliceStatus = await stack.call("xo_account", { owner: alice.owner });
      const bobStatus = await stack.call("xo_account", { owner: bob.owner });
      for (const text of [aliceStatus.text, bobStatus.text]) assert.match(text, /credentials present/i);
      assert.ok(!aliceStatus.text.includes(bob.account) && !bobStatus.text.includes(alice.account));
      assertNoViolations(await checkInvariants(stack), "two owners");

      // And across a crash: everything is still where it was.
      const aliceNow = (await ledger.usageDetail(alice.account.toLowerCase())).spentAtomic;
      const bobNow = (await ledger.usageDetail(bob.account.toLowerCase())).spentAtomic;
      const again = await stack.restart("crash");
      assert.deepEqual(await checkCredentialsKept(again), []);
      assert.equal((await again.relay.services.ledger.usageDetail(alice.account.toLowerCase())).spentAtomic, aliceNow);
      assert.equal((await again.relay.services.ledger.usageDetail(bob.account.toLowerCase())).spentAtomic, bobNow);
    });
  });
}

for (const transport of transports) {
  describe(`two owners at the same time over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });

    harness.it("interleaved orders, cancels and listings keep each owner's book, cap and credentials apart", async (mock) => {
      applyProfile(mock, { name: "optimistic", base: "optimistic" });
      const stack = await startStack({ mock, transport });
      const alice = identityOf(mock, 0);
      const bob = identityOf(mock, 1);
      for (const who of [alice, bob]) {
        await ensureDeployedLikeXoApp(stack, who);
        assert.equal((await flowConnect(stack, who))["submit"]?.code, "connected");
        creditBalance(mock, who.account, 200_000_000n);
      }
      const rounds = await Promise.all([0, 1, 2].flatMap(() => [flowOrder(stack, alice, { shares: "22.7", price: "0.4", cancel: false }), flowOrder(stack, bob, { shares: "22.7", price: "0.4", cancel: false })]));
      for (const flow of rounds) assert.equal(flow["submit"]?.code, "accepted");
      const [aliceList, bobList] = await Promise.all([stack.call("xo_list_orders", { owner: alice.owner }), stack.call("xo_list_orders", { owner: bob.owner })]);
      assert.match(aliceList.text, /3 open order/);
      assert.match(bobList.text, /3 open order/);
      const hashes = (text: string): string[] => text.match(/0x[0-9a-f]{64}/g) ?? [];
      assert.deepEqual(hashes(aliceList.text).filter((hash) => hashes(bobList.text).includes(hash)), [], "no order is in both lists");
      const ledger = stack.relay.services.ledger;
      assert.equal((await ledger.usageDetail(alice.account.toLowerCase())).spentAtomic, 3n * 9_988_000n);
      assert.equal((await ledger.usageDetail(bob.account.toLowerCase())).spentAtomic, 3n * 9_988_000n);
      assertNoViolations(await checkInvariants(stack), "interleaved owners");
    });
  });
}

describe("the embedded relay's owner policy", () => {
  const harness = useMock({ chains: { xo: true, base: true } });

  harness.it("without XO_OWNER the first wallet that signs is bound; another wallet is refused with a reason it can act on", async (mock) => {
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const stack = await startStack({ mock, transport: embeddedTransport, relayEnv: { XO_ALLOW_ANY_OWNER: "0" } });
    const alice = identityOf(mock, 0);
    const bob = identityOf(mock, 1);
    await ensureDeployedLikeXoApp(stack, alice);
    await ensureDeployedLikeXoApp(stack, bob);
    // RT-2: the first write for a wallet the relay has not bound is a question to the user, not yet a login. The
    // refusal is a tool result that names the wallet; nothing was prepared and no key was asked for.
    const asked = await stack.call("xo_connect", { step: "prepare", owner: alice.owner });
    assert.equal(asked.isError, true, asked.text.slice(0, 200));
    assert.equal(asked.code, "precondition_failed");
    assert.ok(asked.text.toLowerCase().includes(alice.owner.slice(0, 6).toLowerCase()) && asked.text.toLowerCase().includes(alice.owner.slice(-4).toLowerCase()), `the wallet to confirm is named: ${asked.text.slice(0, 300)}`);
    assert.match(asked.text, /confirm|XO_OWNER/i);
    assert.equal(stack.relay.services.prepared.list().length, 0, "asking prepared nothing");
    // The user answered (time passed); the same call now goes through, and the first accepted signature binds.
    mock.clock.advanceMs(OWNER_CONFIRM_MIN_DELAY_MS + 1_000);
    assert.equal((await flowConnect(stack, alice))["submit"]?.code, "connected");
    const refused = await stack.call("xo_connect", { step: "prepare", owner: bob.owner });
    assert.equal(refused.isError, true, refused.text.slice(0, 200));
    assert.equal(refused.code, "precondition_failed");
    assert.match(refused.text, /XO_OWNER|first owner|bound|different wallet/i, "the refusal says how to change it");
    assert.equal(stack.relay.services.ledger.list({ account: bob.account.toLowerCase() }).length, 0);
    assert.equal(mock.write.credentials.length, 1, "no key for the refused wallet");
    // The binding survives a restart.
    const again = await stack.restart("crash");
    const still = await again.call("xo_connect", { step: "prepare", owner: bob.owner });
    assert.equal(still.isError, true);
    assertNoViolations(await checkInvariants(again), "owner policy");
  });

  harness.it("XO_OWNER names the wallets served; everyone else is refused before anything is prepared", async (mock) => {
    applyProfile(mock, { name: "optimistic", base: "optimistic" });
    const alice = identityOf(mock, 0);
    const bob = identityOf(mock, 1);
    const stack = await startStack({ mock, transport: embeddedTransport, relayEnv: { XO_ALLOW_ANY_OWNER: "0", XO_OWNER: bob.owner } });
    await ensureDeployedLikeXoApp(stack, alice);
    await ensureDeployedLikeXoApp(stack, bob);
    const refused = await stack.call("xo_connect", { step: "prepare", owner: alice.owner });
    assert.equal(refused.isError, true);
    assert.match(refused.text, /XO_OWNER/);
    const served = await stack.call("xo_connect", { step: "prepare", owner: bob.owner });
    assert.ok(intentOf(served) !== undefined, served.text.slice(0, 200));
    assertNoViolations(await checkInvariants(stack), "XO_OWNER");
  });
});
