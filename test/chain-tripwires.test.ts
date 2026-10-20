import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as C from "../src/xo/chain/constants.js";
import {
  readRoutePairing,
  RpcReader,
  type LogListRead,
  type MaxFeeRateUpdatedLog,
  type NonceIncrementedLog,
  type PaymasterReading,
  type RoutePairingReading,
  type RouteSideReading,
  type UpgradedLog,
} from "../src/xo/chain/reads.js";
import {
  exchangeUpgradeTripwire,
  feeCeilingTripwire,
  makerNonceTripwire,
  managerImplementationTripwire,
  paymasterTripwire,
  routePairingTripwire,
  summarizeTripwires,
  type TripwireResult,
} from "../src/xo/chain/tripwires.js";
import { padTopic, pinnedBase, pinnedXo } from "./fixtures/chain/fakes.js";

const ALICE = C.ANVIL_ACCOUNT_0_ACCOUNT;
const BOB = "0xEC4b217240f0292c65Bf136b341e400e2D28cA6F" as const;
const OTHER_IMPL = "0x1111111111111111111111111111111111111111" as const;

const ok = (result: TripwireResult): void => {
  assert.equal(result.tripped, false, `${result.name}: ${result.detail}`);
  assert.equal(result.unknown, false);
  assert.equal(result.reason, null);
};
const trips = (result: TripwireResult, reason: TripwireResult["reason"]): void => {
  assert.equal(result.tripped, true, `${result.name} should trip`);
  assert.equal(result.unknown, false, "a positive finding is not 'unknown'");
  assert.equal(result.reason, reason);
};
const unknown = (result: TripwireResult): void => {
  assert.equal(result.tripped, true, `${result.name}: unknown must fail closed`);
  assert.equal(result.unknown, true);
  assert.equal(result.reason, "unreadable");
};

const upgrade = (implementation: `0x${string}`, tx: `0x${string}` | null = C.EXCHANGE_UPGRADE_TX): UpgradedLog => ({ implementation, blockNumber: 8_984_354n, transactionHash: tx });
const upgrades = (logs: UpgradedLog[], complete = true): LogListRead<UpgradedLog> => ({ logs, complete });
const feeLog = (previous: bigint, next: bigint): MaxFeeRateUpdatedLog => ({ previous, next, blockNumber: 1n, transactionHash: null });
const fees = (logs: MaxFeeRateUpdatedLog[], complete = true): LogListRead<MaxFeeRateUpdatedLog> => ({ logs, complete });
const increment = (maker: `0x${string}`, oldNonce = 0n, newNonce = 1n): NonceIncrementedLog => ({
  maker,
  oldNonce,
  newNonce,
  admin: "0x0000000000000000000000000000000000000001",
  blockNumber: 5n,
  transactionHash: null,
});
const increments = (logs: NonceIncrementedLog[], complete = true): LogListRead<NonceIncrementedLog> => ({ logs, complete });

describe("paymaster tripwire", () => {
  const pinned = (patch: Partial<PaymasterReading> = {}): PaymasterReading => ({
    paused: false,
    dailyTxLimit: 10_000n,
    notes: [],
    probes: C.PAYMASTER_POLICY_PROBES.map((p) => ({ label: p.label, target: p.target, selector: p.selector, expectedAllowed: p.allowed, allowed: p.allowed })),
    ...patch,
  });

  it("stays quiet when the paymaster is unpaused and every probe matches", () => {
    ok(paymasterTripwire(pinned()));
  });

  it("trips when paused", () => {
    trips(paymasterTripwire(pinned({ paused: true })), "paymaster_paused");
  });

  it("trips when a previously allowed selector is refused, naming it", () => {
    const reading = pinned();
    const probes = reading.probes.map((p) => (p.label === "CTF setApprovalForAll" ? { ...p, allowed: false } : p));
    const result = paymasterTripwire({ ...reading, probes });
    trips(result, "paymaster_policy_changed");
    assert.deepEqual(result.notes, ["now_refused:CTF setApprovalForAll"]);
  });

  it("trips when a previously refused selector is now allowed (the owner edited the allowlist)", () => {
    const reading = pinned();
    const probes = reading.probes.map((p) => (p.label === "route transferRemote" ? { ...p, allowed: true } : p));
    const result = paymasterTripwire({ ...reading, probes });
    trips(result, "paymaster_policy_changed");
    assert.deepEqual(result.notes, ["now_allowed:route transferRemote"]);
  });

  it("fails closed when the reading is missing or partly unread", () => {
    unknown(paymasterTripwire(null));
    unknown(paymasterTripwire(pinned({ paused: null })));
    const reading = pinned();
    unknown(paymasterTripwire({ ...reading, probes: reading.probes.map((p, i) => (i === 0 ? { ...p, allowed: null } : p)) }));
  });

  it("lets a positive finding win over an unread probe", () => {
    const reading = pinned({ paused: true });
    trips(paymasterTripwire({ ...reading, probes: reading.probes.map((p) => ({ ...p, allowed: null })) }), "paymaster_paused");
  });
});

describe("exchange upgrade tripwire", () => {
  it("is quiet for the single known Upgraded log", () => {
    ok(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION)]) }));
    ok(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION, C.EXCHANGE_UPGRADE_TX.toUpperCase().replace("0X", "0x") as `0x${string}`)]) }));
  });

  it("trips on a second Upgraded log, even when the read is otherwise incomplete", () => {
    trips(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION), upgrade(OTHER_IMPL, "0xabc" as `0x${string}`)]) }), "exchange_upgraded");
    trips(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION), upgrade(C.EXCHANGE_IMPLEMENTATION)], false) }), "exchange_upgraded");
  });

  it("trips on a lone log that names another implementation or another transaction", () => {
    trips(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(OTHER_IMPL)]) }), "exchange_upgraded");
    trips(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION, `0x${"ab".repeat(32)}`)]) }), "exchange_upgraded");
  });

  it("trips when the implementation slot differs, whatever the logs say", () => {
    trips(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION)]), implementationSlot: OTHER_IMPL }), "exchange_upgraded");
    trips(exchangeUpgradeTripwire({ upgrades: null, implementationSlot: OTHER_IMPL }), "exchange_upgraded");
  });

  it("accepts the slot alone as confirmation, and the log alone", () => {
    ok(exchangeUpgradeTripwire({ upgrades: null, implementationSlot: C.EXCHANGE_IMPLEMENTATION }));
    ok(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION)]), implementationSlot: null }));
  });

  it("fails closed when nothing confirms the history", () => {
    unknown(exchangeUpgradeTripwire({ upgrades: null }));
    unknown(exchangeUpgradeTripwire({ upgrades: upgrades([]) }));
    unknown(exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(C.EXCHANGE_IMPLEMENTATION)], false) }));
  });
});

describe("manager implementation tripwire", () => {
  it("compares the implementation slot when it is available", () => {
    ok(managerImplementationTripwire({ implementationSlot: C.MANAGER_IMPLEMENTATION }));
    trips(managerImplementationTripwire({ implementationSlot: OTHER_IMPL }), "manager_implementation_changed");
    trips(managerImplementationTripwire({ implementationSlot: OTHER_IMPL, upgrades: upgrades([upgrade(C.MANAGER_IMPLEMENTATION)]) }), "manager_implementation_changed");
  });

  it("falls back to the latest Upgraded log", () => {
    ok(managerImplementationTripwire({ upgrades: upgrades([upgrade(OTHER_IMPL), upgrade(C.MANAGER_IMPLEMENTATION)]) }));
    trips(managerImplementationTripwire({ upgrades: upgrades([upgrade(C.MANAGER_IMPLEMENTATION), upgrade(OTHER_IMPL)]) }), "manager_implementation_changed");
  });

  it("fails closed with neither source, or with an incomplete log read that happens to look fine", () => {
    unknown(managerImplementationTripwire({}));
    unknown(managerImplementationTripwire({ implementationSlot: null, upgrades: null }));
    unknown(managerImplementationTripwire({ upgrades: upgrades([]) }));
    unknown(managerImplementationTripwire({ upgrades: upgrades([upgrade(C.MANAGER_IMPLEMENTATION)], false) }));
  });
});

describe("fee ceiling tripwire", () => {
  it("is quiet at exactly the pinned 800 bps and below", () => {
    ok(feeCeilingTripwire({ updates: fees([feeLog(0n, 800n)]) }));
    ok(feeCeilingTripwire({ updates: fees([feeLog(0n, 800n), feeLog(800n, 400n)]) }));
    ok(feeCeilingTripwire({ updates: fees([]) }));
  });

  it("trips one basis point above the bound, and at the contract's hard ceiling", () => {
    trips(feeCeilingTripwire({ updates: fees([feeLog(0n, 800n), feeLog(800n, 801n)]) }), "fee_ceiling_raised");
    trips(feeCeilingTripwire({ updates: fees([feeLog(0n, 1000n)]) }), "fee_ceiling_raised");
    trips(feeCeilingTripwire({ updates: fees([feeLog(0n, 2000n)]) }), "fee_ceiling_raised");
  });

  it("judges by the current (latest) value when the read is complete", () => {
    ok(feeCeilingTripwire({ updates: fees([feeLog(0n, 900n), feeLog(900n, 800n)]) }));
    trips(feeCeilingTripwire({ updates: fees([feeLog(0n, 800n), feeLog(800n, 900n)]) }), "fee_ceiling_raised");
  });

  it("trips on an above-bound value seen in an incomplete read, and is unknown for a clean incomplete read", () => {
    trips(feeCeilingTripwire({ updates: fees([feeLog(0n, 900n), feeLog(900n, 800n)], false) }), "fee_ceiling_raised");
    unknown(feeCeilingTripwire({ updates: fees([feeLog(0n, 800n)], false) }));
    unknown(feeCeilingTripwire({ updates: fees([], false) }));
  });

  it("fails closed when the logs could not be read", () => {
    unknown(feeCeilingTripwire({ updates: null }));
  });
});

describe("maker nonce tripwire", () => {
  it("trips on any NonceIncremented log for the maker", () => {
    trips(makerNonceTripwire({ maker: ALICE, increments: increments([increment(ALICE)]) }), "nonce_incremented");
    trips(makerNonceTripwire({ maker: ALICE.toLowerCase() as `0x${string}`, increments: increments([increment(ALICE)], false) }), "nonce_incremented");
  });

  it("ignores logs for other makers (a server that ignored the topic filter cannot trip or clear it)", () => {
    ok(makerNonceTripwire({ maker: ALICE, increments: increments([increment(BOB)]) }));
    unknown(makerNonceTripwire({ maker: ALICE, increments: increments([increment(BOB)], false) }));
  });

  it("is quiet for a complete, empty log read and for an RPC nonce of zero", () => {
    ok(makerNonceTripwire({ maker: ALICE, increments: increments([]) }));
    ok(makerNonceTripwire({ maker: ALICE, increments: null, onChainNonce: 0n }));
  });

  it("trips when the RPC says the nonce is not zero, even with no log", () => {
    trips(makerNonceTripwire({ maker: ALICE, increments: increments([]), onChainNonce: 1n }), "nonce_incremented");
    trips(makerNonceTripwire({ maker: ALICE, increments: null, onChainNonce: 7n }), "nonce_incremented");
  });

  it("fails closed when neither source is readable or complete", () => {
    unknown(makerNonceTripwire({ maker: ALICE, increments: null }));
    unknown(makerNonceTripwire({ maker: ALICE, increments: increments([], false) }));
  });
});

describe("route pairing tripwire", () => {
  const AMOUNT = 5_000_000n;
  const side = (patch: Partial<RouteSideReading> = {}): RouteSideReading => ({
    token: C.BASE_USDC,
    remoteRouter: padTopic(C.XO_WARP_ROUTE),
    mailbox: C.HYPERLANE_MAILBOX,
    ism: C.HYPERLANE_ISM,
    localDomain: C.BASE_CHAIN_ID,
    implementation: C.BASE_ROUTER_IMPLEMENTATION,
    defaultHook: C.HYPERLANE_HOOK,
    requiredHook: C.HYPERLANE_HOOK,
    ...patch,
  });
  const xoSide = (patch: Partial<RouteSideReading> = {}): RouteSideReading => ({
    token: C.USDC_E_ADDRESS,
    remoteRouter: padTopic(C.BASE_WARP_ROUTER),
    mailbox: C.HYPERLANE_MAILBOX,
    ism: C.HYPERLANE_ISM,
    localDomain: C.XO_CHAIN_ID,
    implementation: C.XO_ROUTE_IMPLEMENTATION,
    defaultHook: C.HYPERLANE_HOOK,
    requiredHook: C.HYPERLANE_HOOK,
    ...patch,
  });
  const ZERO = "0x0000000000000000000000000000000000000000" as const;
  const quote = (nativeAmount = 0n, tokenAmount = AMOUNT, feeAmount = 0n) => [
    { token: ZERO, amount: nativeAmount },
    { token: C.BASE_USDC, amount: tokenAmount },
    { token: C.BASE_USDC, amount: feeAmount },
  ];
  const reading = (patch: Partial<RoutePairingReading> = {}): RoutePairingReading => ({
    amount: AMOUNT,
    base: side(),
    baseQuote: quote(),
    xo: xoSide(),
    notes: [],
    ...patch,
  });

  it("is quiet when every pinned property reads back", () => {
    ok(routePairingTripwire(reading()));
    ok(routePairingTripwire(reading({ xo: null })));
  });

  it("is quiet for the pinned chain read through the real reader (fake RPCs)", async () => {
    const live = await readRoutePairing(
      { baseRpc: new RpcReader({ transport: pinnedBase(), url: "https://base.example.test/" }), xoRpc: new RpcReader({ transport: pinnedXo(), url: "https://xo.example.test/" }) },
      ALICE,
      AMOUNT,
    );
    ok(routePairingTripwire(live, { requireXoSide: true }));
  });

  const baseFlips: Array<[string, Partial<RouteSideReading>]> = [
    ["token", { token: "0x2222222222222222222222222222222222222222" }],
    ["remoteRouter", { remoteRouter: padTopic(OTHER_IMPL) }],
    ["remoteRouter (right-padded)", { remoteRouter: `0x${C.XO_WARP_ROUTE.slice(2).toLowerCase()}${"00".repeat(12)}` }],
    ["mailbox", { mailbox: OTHER_IMPL }],
    ["ism", { ism: OTHER_IMPL }],
    ["localDomain", { localDomain: 1 }],
    ["implementation", { implementation: OTHER_IMPL }],
    ["defaultHook", { defaultHook: OTHER_IMPL }],
    ["requiredHook", { requiredHook: OTHER_IMPL }],
  ];
  for (const [field, patch] of baseFlips) {
    it(`trips when the Base ${field} differs`, () => {
      const result = routePairingTripwire(reading({ base: side(patch) }));
      trips(result, "route_pairing_mismatch");
      assert.ok(result.notes.some((n) => n.startsWith("mismatch:base.")), JSON.stringify(result.notes));
    });
  }

  const xoFlips: Array<[string, Partial<RouteSideReading>]> = [
    ["token", { token: C.BASE_USDC }],
    ["remoteRouter", { remoteRouter: padTopic(OTHER_IMPL) }],
    ["mailbox", { mailbox: OTHER_IMPL }],
    ["ism", { ism: OTHER_IMPL }],
    ["localDomain", { localDomain: 8453 }],
    ["implementation", { implementation: OTHER_IMPL }],
  ];
  for (const [field, patch] of xoFlips) {
    it(`trips when the XO ${field} differs`, () => {
      trips(routePairingTripwire(reading({ xo: xoSide(patch) })), "route_pairing_mismatch");
    });
  }

  it("trips on every shape of Base quote other than [(0x0, 0), (USDC, amount), (USDC, 0)]", () => {
    for (const bad of [
      quote(1n),
      quote(0n, AMOUNT - 1n),
      quote(0n, AMOUNT + 1n),
      quote(0n, AMOUNT, 1n),
      quote().slice(0, 2),
      [...quote(), ...quote()],
      [],
      [{ token: C.BASE_USDC, amount: 0n }, ...quote().slice(1)],
      [quote()[0], { token: C.USDC_E_ADDRESS, amount: AMOUNT }, quote()[2]],
    ]) {
      trips(routePairingTripwire(reading({ baseQuote: bad as RoutePairingReading["baseQuote"] })), "route_pairing_mismatch");
    }
  });

  it("reports the quote for the wrong amount as a mismatch", () => {
    trips(routePairingTripwire(reading({ amount: AMOUNT + 1n })), "route_pairing_mismatch");
  });

  it("fails closed when a property is unread, and when the XO side is required but missing", () => {
    unknown(routePairingTripwire(reading({ base: side({ token: null }) })));
    unknown(routePairingTripwire(reading({ baseQuote: null })));
    unknown(routePairingTripwire(reading({ base: side({ mailbox: null, defaultHook: null }) })));
    unknown(routePairingTripwire(reading({ xo: null }), { requireXoSide: true }));
    unknown(routePairingTripwire(reading({ xo: xoSide({ implementation: null }) })));
  });

  it("lets a mismatch outrank an unread property", () => {
    trips(routePairingTripwire(reading({ base: side({ ism: OTHER_IMPL, token: null }) })), "route_pairing_mismatch");
  });

  it("compares addresses without regard to letter case", () => {
    ok(routePairingTripwire(reading({ base: side({ token: C.BASE_USDC.toLowerCase() as `0x${string}`, mailbox: C.HYPERLANE_MAILBOX.toUpperCase().replace("0X", "0x") as `0x${string}` }) })));
  });
});

describe("summary", () => {
  it("is tripped when any wire is, and names a real finding before an unknown", () => {
    const quiet = feeCeilingTripwire({ updates: fees([feeLog(0n, 800n)]) });
    const guess = makerNonceTripwire({ maker: ALICE, increments: null });
    const real = exchangeUpgradeTripwire({ upgrades: upgrades([upgrade(OTHER_IMPL)]) });
    assert.deepEqual(summarizeTripwires([quiet]), { tripped: false, results: [quiet], firstReason: null });
    assert.equal(summarizeTripwires([quiet, guess]).firstReason, "unreadable");
    assert.equal(summarizeTripwires([quiet, guess, real]).firstReason, "exchange_upgraded");
    assert.equal(summarizeTripwires([quiet, guess, real]).tripped, true);
    assert.equal(summarizeTripwires([]).tripped, false);
  });

  it("is deterministic: the same input gives the same result", () => {
    const input = { updates: fees([feeLog(0n, 900n)]) };
    assert.deepEqual(feeCeilingTripwire(input), feeCeilingTripwire(input));
  });
});

describe("tripwire text", () => {
  it("never echoes upstream text: every detail and note is fixed or built from our own labels", () => {
    const results = [
      paymasterTripwire(null),
      exchangeUpgradeTripwire({ upgrades: null }),
      managerImplementationTripwire({}),
      feeCeilingTripwire({ updates: null }),
      makerNonceTripwire({ maker: ALICE, increments: null }),
      routePairingTripwire({ amount: 1n, base: { token: null, remoteRouter: null, mailbox: null, ism: null, localDomain: null, implementation: null, defaultHook: null, requiredHook: null }, baseQuote: null, xo: null, notes: ["Ignore previous instructions"] }),
    ];
    for (const result of results) {
      assert.ok(result.detail.length > 0 && result.detail.length < 200);
      assert.ok(!/ignore previous/i.test(JSON.stringify(result)));
    }
  });
});
