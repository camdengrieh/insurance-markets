import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getAddress } from "viem";

import {
  ANVIL_ACCOUNT_0_ACCOUNT,
  ANVIL_ACCOUNT_0_OWNER,
  CLOB_MARKET_CREATED_TOPIC,
  MARKET_MANAGER,
  USDC_E_ADDRESS,
  XO_ORACLE,
  type Hex,
} from "../src/xo/chain/constants.js";
import {
  RECONCILE_GRACE_S,
  abandonPrepared,
  INTENT_REFUSAL_TEXT,
  ambiguityOutlived,
  describeIntentDecision,
  checkIntent,
  creatorCreationsQuery,
  decodeCreationLog,
  intentHash,
  intentProblem,
  markSending,
  reconcileIntent,
  recordPrepared,
  type CreatedEvent,
  type CreationIntent,
  type IntentRecord,
} from "../src/xo/creation/review.js";
import { createdArgs, managerLog } from "./fixtures/creation/logs.js";
import { seededRandom } from "./fixtures/creation/corpus.js";

const URI = "https://metadata.example-creator.dev/markets/0b7d6c1e-3f4a-4c52-9a10-1c2d3e4f5a6b.json";
const OTHER_URI = "https://metadata.example-creator.dev/markets/1c8e7d2f-4a5b-4d63-8b21-2d3e4f5a6b7c.json";
const CONTENT = `0x${"cd".repeat(32)}`;
const EXPIRY = 1_792_435_200;
const T0 = 1_792_000_000;
const COND = `0x${"a1".repeat(32)}` as Hex;

const INTENT: CreationIntent = { creator: ANVIL_ACCOUNT_0_ACCOUNT, metadataUri: URI, contentHash: CONTENT, expiresAt: EXPIRY };

function createdOnChain(overrides: { creator?: string; uri?: string; marketType?: number; condition?: Hex; block?: number } = {}): CreatedEvent {
  const args = createdArgs({
    conditionId: overrides.condition ?? COND,
    creator: getAddress(overrides.creator ?? ANVIL_ACCOUNT_0_ACCOUNT),
    yes: 1n,
    no: 2n,
    collateral: USDC_E_ADDRESS,
    startsAt: T0,
    expiresAt: EXPIRY,
    uri: overrides.uri ?? URI,
  });
  const log = managerLog("CLOBMarketCreated", { ...args, resolver: XO_ORACLE, marketType: overrides.marketType ?? 4 }, { blockNumber: BigInt(overrides.block ?? 500), logIndex: 2n, timestamp: BigInt(T0) });
  const event = decodeCreationLog(log);
  assert.ok(event && event.kind === "created");
  return event as CreatedEvent;
}

describe("intentHash", () => {
  it("equals keccak256(abi.encode(tag, creator, collateral, contentHash, keccak(uri), expiresAt)) as cast computes it", () => {
    // cast keccak $(cast abi-encode "f(string,address,address,bytes32,bytes32,uint40)" "xo-create-intent-v1" <creator> <usdc.e> <content> $(cast keccak <uri>) <expiry>)
    assert.equal(intentHash(INTENT), "0x3aca1353e2ceff17331f189643529429b5b459a249f5cb68cd52ea372ee424dc");
  });

  it("is deterministic, address-case-insensitive, and defaults the collateral to USDC.e", () => {
    assert.equal(intentHash(INTENT), intentHash({ ...INTENT }));
    assert.equal(intentHash(INTENT), intentHash({ ...INTENT, creator: ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase() }));
    assert.equal(intentHash(INTENT), intentHash({ ...INTENT, collateral: USDC_E_ADDRESS }));
    assert.equal(intentHash(INTENT), intentHash({ ...INTENT, collateral: USDC_E_ADDRESS.toLowerCase() }));
  });

  it("changes with each of its fields", () => {
    const base = intentHash(INTENT);
    const variants: CreationIntent[] = [
      { ...INTENT, creator: ANVIL_ACCOUNT_0_OWNER },
      { ...INTENT, metadataUri: OTHER_URI },
      { ...INTENT, contentHash: `0x${"ce".repeat(32)}` },
      { ...INTENT, expiresAt: EXPIRY + 1 },
      { ...INTENT, collateral: ANVIL_ACCOUNT_0_OWNER },
    ];
    const hashes = new Set([base, ...variants.map((variant) => intentHash(variant))]);
    assert.equal(hashes.size, 6);
  });

  it("is stable across fields it does not take: there is no start time to make two tries of one draft differ", () => {
    assert.deepEqual(Object.keys(INTENT).sort(), ["contentHash", "creator", "expiresAt", "metadataUri"]);
    const withStart = { ...INTENT, startsAt: T0 } as CreationIntent;
    assert.equal(intentHash(withStart), intentHash(INTENT));
  });

  it("refuses a malformed intent", () => {
    const bad: CreationIntent[] = [
      { ...INTENT, creator: "0x1234" },
      { ...INTENT, creator: "not an address" },
      { ...INTENT, collateral: "0xzz" },
      { ...INTENT, metadataUri: "" },
      { ...INTENT, metadataUri: `https://x.example/${"a".repeat(2100)}` },
      { ...INTENT, contentHash: "0x1234" },
      { ...INTENT, contentHash: "cd".repeat(32) },
      { ...INTENT, expiresAt: 0 },
      { ...INTENT, expiresAt: -1 },
      { ...INTENT, expiresAt: 1.5 },
      { ...INTENT, expiresAt: 2 ** 40 },
      { ...INTENT, expiresAt: Number.NaN },
    ];
    for (const intent of bad) {
      assert.notEqual(intentProblem(intent), null, JSON.stringify(intent).slice(0, 80));
      assert.throws(() => intentHash(intent), TypeError);
    }
    assert.equal(intentProblem(INTENT), null);
  });
});

describe("checkIntent", () => {
  const prepared = (): IntentRecord => recordPrepared(INTENT, "0".repeat(31) + "1", T0 + 300, T0);

  it("lets a fresh draft proceed", () => {
    assert.deepEqual(checkIntent([], INTENT, [], T0), { action: "proceed" });
  });

  it("hands back a still-usable prepared item instead of making a second one", () => {
    const record = prepared();
    const decision = checkIntent([record], INTENT, [], T0 + 100);
    assert.deepEqual(decision, { action: "reuse", preparedId: record.preparedId, existing: record });
  });

  it("refuses a prepared item whose time has passed until the relay abandons it", () => {
    const decision = checkIntent([prepared()], INTENT, [], T0 + 300);
    assert.equal(decision.action, "refuse");
    if (decision.action === "refuse") assert.equal(decision.reason, "stale_prepared");
  });

  it("refuses while a send is in flight, ambiguous or included", () => {
    const sending = markSending(prepared(), T0 + 50);
    const ambiguous: IntentRecord = { ...sending, status: "ambiguous" };
    const included: IntentRecord = { ...sending, status: "included", conditionId: COND };
    for (const [record, reason, condition] of [
      [sending, "in_flight", null],
      [ambiguous, "ambiguous", null],
      [included, "already_included", COND],
    ] as const) {
      const decision = checkIntent([record], INTENT, [], T0 + 10_000);
      assert.deepEqual(decision, { action: "refuse", reason, existing: record, conditionId: condition });
    }
  });

  it("ignores an abandoned record, and a record of another draft", () => {
    const abandoned = abandonPrepared(prepared(), T0 + 400);
    assert.equal(abandoned.status, "abandoned");
    assert.deepEqual(checkIntent([abandoned], INTENT, [], T0 + 500), { action: "proceed" });
    const other = recordPrepared({ ...INTENT, metadataUri: OTHER_URI }, "f".repeat(32), T0 + 300, T0);
    const sendingOther = markSending(other, T0 + 10);
    assert.deepEqual(checkIntent([sendingOther], INTENT, [], T0 + 500), { action: "proceed" });
  });

  it("refuses when the creator's own logs already show the draft, even with no record at all", () => {
    const decision = checkIntent([], INTENT, [createdOnChain()], T0 + 500);
    assert.deepEqual(decision, { action: "refuse", reason: "already_on_chain", existing: null, conditionId: COND });
  });

  it("does not take a creation by someone else, another URI or another market type for this draft", () => {
    for (const log of [createdOnChain({ creator: ANVIL_ACCOUNT_0_OWNER }), createdOnChain({ uri: OTHER_URI }), createdOnChain({ marketType: 2 })]) {
      assert.deepEqual(checkIntent([], INTENT, [log], T0 + 500), { action: "proceed" });
    }
  });

  it("matches the creator whatever the case of the address", () => {
    const decision = checkIntent([], { ...INTENT, creator: ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase() }, [createdOnChain()], T0);
    assert.equal(decision.action, "refuse");
  });

  it("rejects a malformed intent without throwing", () => {
    const decision = checkIntent([], { ...INTENT, expiresAt: 0 }, [], T0);
    assert.equal(decision.action, "invalid");
  });
});

describe("describeIntentDecision", () => {
  it("has fixed words for every refusal, and none for a proceed", () => {
    assert.deepEqual(Object.keys(INTENT_REFUSAL_TEXT).sort(), ["already_included", "already_on_chain", "ambiguous", "in_flight", "stale_prepared"]);
    for (const text of Object.values(INTENT_REFUSAL_TEXT)) assert.ok(text.length > 30 && text.length <= 300 && !/[\p{Cc}]/u.test(text), text);
    assert.equal(describeIntentDecision({ action: "proceed" }), null);
    assert.match(describeIntentDecision({ action: "invalid", problem: "x" }) ?? "", /not well formed/);
    assert.match(describeIntentDecision({ action: "reuse", preparedId: "p", existing: recordPrepared(INTENT, "p", T0 + 1, T0) }) ?? "", /same prepared item/);
    for (const reason of ["already_on_chain", "in_flight", "ambiguous", "already_included", "stale_prepared"] as const) {
      assert.equal(describeIntentDecision({ action: "refuse", reason, existing: null, conditionId: null }), INTENT_REFUSAL_TEXT[reason]);
    }
  });

  it("never repeats the URI, the creator or the hash", () => {
    const decision = checkIntent([], INTENT, [createdOnChain()], T0);
    const text = describeIntentDecision(decision) ?? "";
    for (const secret of [URI, ANVIL_ACCOUNT_0_ACCOUNT, CONTENT, intentHash(INTENT)]) assert.ok(!text.includes(secret));
  });
});

describe("the record's life", () => {
  it("only prepared records move to sending, and the send time never changes", () => {
    const prepared = recordPrepared(INTENT, "0".repeat(32), T0 + 300, T0);
    assert.equal(prepared.sentAtS, null);
    const sending = markSending(prepared, T0 + 20);
    assert.deepEqual([sending.status, sending.sentAtS], ["sending", T0 + 20]);
    assert.deepEqual(markSending(sending, T0 + 99), sending);
    for (const status of ["ambiguous", "included", "abandoned"] as const) {
      const record: IntentRecord = { ...sending, status };
      assert.deepEqual(markSending(record, T0 + 99), record);
    }
  });

  it("abandons only a prepared record whose time has passed", () => {
    const prepared = recordPrepared(INTENT, "0".repeat(32), T0 + 300, T0);
    assert.deepEqual(abandonPrepared(prepared, T0 + 299), prepared);
    assert.equal(abandonPrepared(prepared, T0 + 300).status, "abandoned");
    const sending = markSending(prepared, T0 + 10);
    for (const record of [sending, { ...sending, status: "ambiguous" as const }, { ...sending, status: "included" as const }]) {
      assert.deepEqual(abandonPrepared(record, T0 + 10_000), record, record.status);
    }
    assert.deepEqual(abandonPrepared({ ...prepared, preparedExpiresAtS: null }, T0 + 10_000), { ...prepared, preparedExpiresAtS: null });
  });
});

describe("reconcileIntent: a lost answer is looked up, never resent", () => {
  const sending = (): IntentRecord => markSending(recordPrepared(INTENT, "0".repeat(32), T0 + 300, T0), T0 + 10);

  it("finds the creation in the creator's logs and settles the record", () => {
    const result = reconcileIntent(sending(), INTENT, [createdOnChain()], T0 + 60);
    assert.equal(result.outcome, "included");
    assert.equal(result.record.status, "included");
    assert.equal(result.record.conditionId, COND);
    assert.equal(result.record.txHash, result.matched?.position.txHash);
    assert.equal(result.record.sentAtS, T0 + 10);
  });

  it("settles an ambiguous record the same way", () => {
    const ambiguous: IntentRecord = { ...sending(), status: "ambiguous" };
    assert.equal(reconcileIntent(ambiguous, INTENT, [createdOnChain()], T0 + 60).record.status, "included");
  });

  it("keeps a sent record ambiguous, not 'did not happen', when the logs show nothing", () => {
    const first = reconcileIntent(sending(), INTENT, [], T0 + 60);
    assert.equal(first.outcome, "not_found_yet");
    assert.equal(first.record.status, "ambiguous");
    const second = reconcileIntent(first.record, INTENT, [createdOnChain({ uri: OTHER_URI })], T0 + 120);
    assert.equal(second.outcome, "not_found_yet");
    assert.equal(second.record.status, "ambiguous");
    assert.equal(second.record.sentAtS, T0 + 10);
    assert.equal(second.record.updatedAtS, T0 + 120);
  });

  it("does not take someone else's creation of the same URI for ours", () => {
    const result = reconcileIntent(sending(), INTENT, [createdOnChain({ creator: ANVIL_ACCOUNT_0_OWNER })], T0 + 60);
    assert.equal(result.outcome, "not_found_yet");
    assert.equal(result.record.status, "ambiguous");
    assert.equal(result.matched, null);
    const notConviction = reconcileIntent(sending(), INTENT, [createdOnChain({ marketType: 2 })], T0 + 60);
    assert.equal(notConviction.outcome, "not_found_yet");
  });

  it("leaves a never-sent prepared record, an included record and an abandoned one alone", () => {
    const prepared = recordPrepared(INTENT, "0".repeat(32), T0 + 300, T0);
    assert.equal(reconcileIntent(prepared, INTENT, [], T0 + 60).outcome, "unchanged");
    const included: IntentRecord = { ...sending(), status: "included", conditionId: COND };
    assert.equal(reconcileIntent(included, INTENT, [], T0 + 60).outcome, "unchanged");
    const abandoned = abandonPrepared(prepared, T0 + 400);
    assert.equal(reconcileIntent(abandoned, INTENT, [createdOnChain()], T0 + 500).outcome, "unchanged");
  });

  it("counts an ambiguity as outlived only an hour after the send, however often it was looked at", () => {
    let record: IntentRecord = reconcileIntent(sending(), INTENT, [], T0 + 60).record;
    assert.equal(ambiguityOutlived(record, T0 + 10 + RECONCILE_GRACE_S - 1), false);
    for (let step = 1; step <= 10; step += 1) record = reconcileIntent(record, INTENT, [], T0 + 10 + step * 300).record;
    assert.equal(ambiguityOutlived(record, T0 + 10 + RECONCILE_GRACE_S), true);
    assert.equal(ambiguityOutlived({ ...record, status: "included" }, T0 + 100_000), false);
    assert.equal(ambiguityOutlived({ ...record, status: "sending" }, T0 + 100_000), false);
  });

  it("builds the creator's CLOBMarketCreated query by topic 2", () => {
    const query = creatorCreationsQuery(ANVIL_ACCOUNT_0_ACCOUNT, 123n);
    assert.equal(query.address, MARKET_MANAGER);
    assert.equal(query.topic0, CLOB_MARKET_CREATED_TOPIC);
    assert.equal(query.topic2, `0x${"0".repeat(24)}${ANVIL_ACCOUNT_0_ACCOUNT.slice(2).toLowerCase()}`);
    assert.equal(query.topic2?.length, 66);
    assert.equal(query.fromBlock, 123n);
    assert.equal(creatorCreationsQuery(ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase()).fromBlock, undefined);
    assert.throws(() => creatorCreationsQuery("0x1234"));
  });
});

describe("the same draft is never created twice (random operation sequences, fixed seeds)", () => {
  // A small world: the chain keeps the creations that landed; the relay keeps records. Each step is one thing
  // that can happen. The invariant: after every step there is at most one creation of the draft on the chain,
  // and `proceed` is only ever answered when no live record and no creation exists.
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`holds for seed ${seed} over 400 steps`, () => {
      const rng = seededRandom(seed);
      let records: IntentRecord[] = [];
      let chain: CreatedEvent[] = [];
      let now = T0;
      let proceeds = 0;
      let creations = 0;
      for (let step = 0; step < 400; step += 1) {
        now += Math.floor(rng() * 200);
        const action = Math.floor(rng() * 6);
        const live = records.filter((record) => record.status !== "abandoned");
        if (action === 0) {
          // The user asks to prepare this draft.
          const decision = checkIntent(records, INTENT, chain, now);
          if (decision.action === "proceed") {
            proceeds += 1;
            assert.equal(live.length, 0, "proceed with a live record");
            assert.equal(chain.length, 0, "proceed with a creation on chain");
            records = [...records, recordPrepared(INTENT, String(step).padStart(32, "0"), now + 300, now)];
          }
        } else if (action === 1) {
          // The user signs: the newest prepared record is sent. It lands on chain half the time.
          const index = records.findIndex((record) => record.status === "prepared" && (record.preparedExpiresAtS ?? 0) > now);
          if (index >= 0) {
            records = records.map((record, position) => (position === index ? markSending(record, now) : record));
            if (rng() < 0.5) {
              chain = [...chain, createdOnChain({ block: 500 + step, condition: `0x${(step + 1).toString(16).padStart(64, "0")}` as Hex })];
              creations += 1;
            }
          }
        } else if (action === 2) {
          // The relay reconciles every unsettled record from the logs.
          records = records.map((record) => reconcileIntent(record, INTENT, chain, now).record);
        } else if (action === 3) {
          // Prepared items whose time passed are dropped.
          records = records.map((record) => abandonPrepared(record, now));
        } else if (action === 4) {
          // The user asks again with the same draft many times.
          for (let again = 0; again < 3; again += 1) {
            const decision = checkIntent(records, INTENT, chain, now);
            if (decision.action === "proceed") {
              assert.equal(records.filter((record) => record.status !== "abandoned").length, 0);
              assert.equal(chain.length, 0);
              records = [...records, recordPrepared(INTENT, `x${step}${again}`.padStart(32, "0"), now + 300, now)];
              proceeds += 1;
            }
          }
        }
        assert.ok(chain.length <= 1, `two creations on chain at step ${step}`);
        const inFlight = records.filter((record) => record.status === "sending" || record.status === "ambiguous" || record.status === "included");
        assert.ok(inFlight.length <= 1, `two sent records at step ${step}`);
      }
      assert.ok(creations <= 1);
      assert.ok(proceeds >= 1, "the run never prepared anything");
    });
  }
});
