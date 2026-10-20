import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { utcDayKey } from "../src/guardrails/limits.js";
import { RelayError } from "../src/relay/errors.js";
import { CapabilityRegistry } from "../relay/capabilities.js";
import { loadRelayConfig } from "../relay/config.js";
import {
  DurableLedger,
  ledgerLimitsFrom,
  type LedgerLimits,
  type ReleaseEvidence,
  type TypedReserveRequest,
  type TypedReserveResult,
} from "../relay/ledger.js";
import { openRelayStorage, type RelayStorage } from "../relay/store.js";
import { addr, FakeClock, prng, tempDir, TEST_RELAY_KEY, type TempDir } from "./relay-core-helpers.js";

// The ledger behind the $10 per order, $50 per day, funding and seed caps: durable, idempotent,
// race-free, and strict about giving anything back.

const USD = 1_000_000n;
const LIMITS: LedgerLimits = {
  maxOrderAtomic: 10n * USD,
  maxDailyAtomic: 50n * USD,
  seedCapAtomic: 10_800_000n,
  fundingDailyCapAtomic: 50n * USD,
  fundingLifetimeCapAtomic: 10n * USD,
};
const A = addr(0xa1);
const B = addr(0xb2);

const dirs: TempDir[] = [];
after(async () => {
  for (const made of dirs) await made.cleanup();
});

interface Rig {
  readonly dir: string;
  readonly clock: FakeClock;
  readonly storage: RelayStorage;
  readonly ledger: DurableLedger;
  limits: LedgerLimits;
  reopen(): Promise<Rig>;
}

async function rig(options: { readonly dir?: string; readonly clock?: FakeClock; readonly limits?: LedgerLimits } = {}): Promise<Rig> {
  let dir = options.dir;
  if (dir === undefined) {
    const made = await tempDir();
    dirs.push(made);
    dir = made.dir;
  }
  const clock = options.clock ?? new FakeClock();
  const storage = await openRelayStorage({ dir, now: clock.now });
  const state = { limits: options.limits ?? LIMITS };
  const ledger = new DurableLedger({ store: storage.state, locks: storage.locks, now: clock.now, limits: () => state.limits });
  const made: Rig = {
    dir,
    clock,
    storage,
    ledger,
    get limits() {
      return state.limits;
    },
    set limits(value: LedgerLimits) {
      state.limits = value;
    },
    async reopen() {
      await storage.close();
      return rig({ dir: dir as string, clock, limits: state.limits });
    },
  };
  return made;
}

let counter = 0;
const nextId = (): string => `res${String(++counter).padStart(8, "0")}`;

function request(over: Partial<TypedReserveRequest> & { readonly amountAtomic: bigint }, clock: FakeClock): TypedReserveRequest {
  return {
    kind: "spend",
    account: A,
    day: utcDayKey(clock.now()) as string,
    limitAtomic: 1_000_000n * USD,
    reservationId: nextId(),
    category: "order",
    expiresAtMs: clock.now() + 300_000,
    ...over,
  };
}

function reserved(result: TypedReserveResult): string {
  assert.equal(result.reserved, true, `expected a reservation, got ${JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return (result as { reservationId: string }).reservationId;
}

function denied(result: TypedReserveResult): string {
  assert.equal(result.reserved, false);
  return (result as { reason: string }).reason;
}

const absent = (rig_: Rig, source: ReleaseEvidence["source"] = "orders_list"): ReleaseEvidence => ({ kind: "absent_after_expiry", source, checkedAtMs: rig_.clock.now() });

async function refused(promise: Promise<unknown>, code = "precondition_failed"): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof RelayError && error.code === code, `expected ${code}`);
}

describe("reserving", () => {
  it("starts at zero, counts a reservation, and reports it through the DailyLedger interface", async () => {
    const r = await rig();
    const day = r.ledger.currentDay();
    assert.deepEqual(await r.ledger.usage(A, day), { spentAtomic: 0n, fundedAtomic: 0n });
    const result = await r.ledger.reserve({ kind: "spend", account: A, day, amountAtomic: 4n * USD, limitAtomic: 50n * USD });
    assert.equal(result.reserved, true);
    assert.deepEqual(await r.ledger.usage(A, day), { spentAtomic: 4n * USD, fundedAtomic: 0n });
    await r.storage.close();
  });

  it("makes a reservation id idempotent: the second call adds nothing and says it was a replay", async () => {
    const r = await rig();
    const req = request({ amountAtomic: 3n * USD }, r.clock);
    const first = await r.ledger.reserveFor(req);
    const second = await r.ledger.reserveFor(req);
    assert.equal(reserved(first), reserved(second));
    assert.equal((first as { replayed: boolean }).replayed, false);
    assert.equal((second as { replayed: boolean }).replayed, true);
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 3n * USD);
    await r.storage.close();
  });

  it("refuses an id reused with different terms", async () => {
    const r = await rig();
    const req = request({ amountAtomic: 3n * USD }, r.clock);
    await r.ledger.reserveFor(req);
    await refused(r.ledger.reserveFor({ ...req, amountAtomic: 4n * USD }), "internal");
    await refused(r.ledger.reserveFor({ ...req, account: B }), "internal");
    await refused(r.ledger.reserveFor({ ...req, category: "seed" }), "internal");
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 3n * USD);
    await r.storage.close();
  });

  it("generates an id when none is given and honours the interface's plain reserve", async () => {
    const r = await rig();
    const day = r.ledger.currentDay();
    const result = await r.ledger.reserve({ kind: "spend", account: A, day, amountAtomic: USD, limitAtomic: 50n * USD });
    assert.equal(result.reserved, true);
    assert.match((result as { reservationId: string }).reservationId, /^res_[0-9a-f]{32}$/);
    await r.storage.close();
  });

  it("refuses bad input without touching anything", async () => {
    const r = await rig();
    const day = r.ledger.currentDay();
    await refused(r.ledger.reserve({ kind: "spend", account: "0xABC", day, amountAtomic: USD, limitAtomic: 50n * USD }), "invalid_request");
    await refused(r.ledger.reserve({ kind: "spend", account: A.toUpperCase().replace("0X", "0x"), day, amountAtomic: USD, limitAtomic: 50n * USD }), "invalid_request");
    await refused(r.ledger.reserve({ kind: "other" as "spend", account: A, day, amountAtomic: USD, limitAtomic: 50n * USD }), "invalid_request");
    await refused(r.ledger.reserve({ kind: "spend", account: A, day, amountAtomic: USD, limitAtomic: 50n * USD, reservationId: "short" }), "invalid_request");
    for (const amountAtomic of [0n, -1n, 1.5 as unknown as bigint, "5" as unknown as bigint]) {
      assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic }, r.clock))), "invalid");
    }
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD, limitAtomic: -1n }, r.clock))), "invalid");
    assert.deepEqual(await r.ledger.usageDetail(A), { spentAtomic: 0n, fundedAtomic: 0n, seedAtomic: 0n, fundedLifetimeAtomic: 0n });
    await r.storage.close();
  });
});

describe("the caps", () => {
  it("allows exactly $10 for one order and refuses a micro-dollar more", async () => {
    const r = await rig();
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD + 1n }, r.clock))), "order_cap");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    await r.storage.close();
  });

  it("allows exactly $50 in a day and refuses the next micro-dollar, telling how much was left", async () => {
    const r = await rig();
    for (let index = 0; index < 5; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    const over = await r.ledger.reserveFor(request({ amountAtomic: 1n }, r.clock));
    assert.equal(denied(over), "daily_cap");
    assert.equal((over as { remainingAtomic: bigint }).remainingAtomic, 0n);
    assert.equal((over as { limitAtomic: bigint }).limitAtomic, 50n * USD);
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 50n * USD);
    await r.storage.close();
  });

  it("reports what is left under the day cap when a reservation does not fit", async () => {
    const r = await rig();
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 9n * USD }, r.clock)));
    for (let index = 0; index < 4; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 9n * USD }, r.clock)));
    const over = await r.ledger.reserveFor(request({ amountAtomic: 9n * USD }, r.clock));
    assert.equal(denied(over), "daily_cap");
    assert.equal((over as { remainingAtomic: bigint }).remainingAtomic, 5n * USD);
    await r.storage.close();
  });

  it("lets a caller pass a lower limit but never a higher one", async () => {
    const r = await rig();
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 6n * USD, limitAtomic: 5n * USD }, r.clock))), "daily_cap");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 5n * USD, limitAtomic: 5n * USD }, r.clock)));
    // A huge limit from the caller does not lift the configured day cap.
    for (let index = 0; index < 4; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD, limitAtomic: 10_000n * USD }, r.clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 6n * USD, limitAtomic: 10_000n * USD }, r.clock))), "daily_cap");
    await r.storage.close();
  });

  it("applies each account's cap separately", async () => {
    const r = await rig();
    for (let index = 0; index < 5; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD }, r.clock))), "daily_cap");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD, account: B }, r.clock)));
    await r.storage.close();
  });

  it("follows the configured limits, read on every call", async () => {
    const r = await rig();
    r.limits = { ...LIMITS, maxOrderAtomic: 2n * USD, maxDailyAtomic: 3n * USD };
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 3n * USD }, r.clock))), "order_cap");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 2n * USD }, r.clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 2n * USD }, r.clock))), "daily_cap");
    r.limits = LIMITS;
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 2n * USD }, r.clock)));
    await r.storage.close();
  });
});

describe("seed and creation fee", () => {
  it("lets a seed be $10.80 (not $10), refuses a micro-dollar more, and counts it toward the day", async () => {
    const r = await rig();
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 10_800_001n, category: "seed" }, r.clock))), "seed_cap");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 10_800_000n, category: "seed" }, r.clock)));
    const usage = await r.ledger.usageDetail(A);
    assert.equal(usage.spentAtomic, 10_800_000n);
    assert.equal(usage.seedAtomic, 10_800_000n);
    // The same amount as an ordinary order is over the order cap.
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 10_800_000n }, r.clock))), "order_cap");
    await r.storage.close();
  });

  it("counts the $1 creation fee toward the $50 and has no per-day count of creations", async () => {
    const r = await rig();
    for (let index = 0; index < 50; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, category: "creation_fee" }, r.clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD, category: "creation_fee" }, r.clock))), "daily_cap");
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 50n * USD);
    await r.storage.close();
  });

  it("keeps the seed counter apart from the funding counter", async () => {
    const r = await rig();
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD, category: "seed" }, r.clock)));
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 5n * USD, kind: "fund", category: "funding" }, r.clock)));
    const usage = await r.ledger.usageDetail(A);
    assert.equal(usage.seedAtomic, 10n * USD);
    assert.equal(usage.spentAtomic, 10n * USD);
    assert.equal(usage.fundedAtomic, 5n * USD);
    await r.storage.close();
  });
});

describe("funding", () => {
  it("has its own counter: funding does not use up the spend cap and spending does not use up the funding cap", async () => {
    const r = await rig({ limits: { ...LIMITS, fundingLifetimeCapAtomic: undefined } });
    for (let index = 0; index < 5; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    for (let index = 0; index < 5; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD, kind: "fund", category: "funding" }, r.clock)));
    const usage = await r.ledger.usage(A, r.ledger.currentDay());
    assert.equal(usage.spentAtomic, 50n * USD);
    assert.equal(usage.fundedAtomic, 50n * USD);
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 1n, kind: "fund", category: "funding" }, r.clock))), "funding_daily_cap");
    await r.storage.close();
  });

  it("holds the total funded to the test cap until the exit is proven, across days", async () => {
    const r = await rig();
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD, kind: "fund", category: "funding" }, r.clock)));
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 6n * USD, kind: "fund", category: "funding" }, r.clock)));
    const over = await r.ledger.reserveFor(request({ amountAtomic: 1n, kind: "fund", category: "funding" }, r.clock));
    assert.equal(denied(over), "funding_total_cap");
    assert.equal((over as { remainingAtomic: bigint }).remainingAtomic, 0n);
    // A new day does not reset the total.
    r.clock.advance(86_400_000);
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 1n, kind: "fund", category: "funding" }, r.clock))), "funding_total_cap");
    assert.equal((await r.ledger.usageDetail(A)).fundedLifetimeAtomic, 10n * USD);
    await r.storage.close();
  });

  it("lifts the total cap only when the capability facts say the deposit and the exit were seen to work", async () => {
    const made = await tempDir();
    dirs.push(made);
    const clock = new FakeClock();
    const storage = await openRelayStorage({ dir: made.dir, now: clock.now });
    const capabilities = await CapabilityRegistry.open({ store: storage.state, now: clock.now });
    const { config } = loadRelayConfig({ XO_RELAY_KEY: TEST_RELAY_KEY, RELAY_DATA_DIR: made.dir });
    const ledger = new DurableLedger({ store: storage.state, locks: storage.locks, now: clock.now, limits: ledgerLimitsFrom(config, capabilities) });
    const fund = (amountAtomic: bigint): TypedReserveRequest => request({ amountAtomic, kind: "fund", category: "funding" }, clock);
    reserved(await ledger.reserveFor(fund(10n * USD)));
    assert.equal(denied(await ledger.reserveFor(fund(1n))), "funding_total_cap");
    for (const id of ["FU6", "FU7"]) await capabilities.record({ id, state: "yes", source: "probe" });
    assert.equal(denied(await ledger.reserveFor(fund(1n))), "funding_total_cap", "the exit (FU9) is still unproven");
    await capabilities.record({ id: "FU9", state: "yes", source: "operator" });
    reserved(await ledger.reserveFor(fund(1n)));
    // A fact turning back to "no" brings the cap back.
    await capabilities.record({ id: "FU9", state: "no", source: "probe" });
    assert.equal(denied(await ledger.reserveFor(fund(1n))), "funding_total_cap");
    // The configured values: order $10, day $50, seed $10.80, funding total $10, funding day $50.
    assert.deepEqual(ledgerLimitsFrom(config)(), { maxOrderAtomic: 10n * USD, maxDailyAtomic: 50n * USD, seedCapAtomic: 10_800_000n, fundingDailyCapAtomic: 50n * USD, fundingLifetimeCapAtomic: 10n * USD });
    await storage.close();
  });
});

describe("the UTC day", () => {
  it("starts a fresh day at midnight UTC and keeps the old day's numbers", async () => {
    const clock = new FakeClock("2026-10-19T23:59:58Z");
    const r = await rig({ clock });
    for (let index = 0; index < 5; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD }, clock))), "daily_cap");
    clock.advance(2000);
    assert.equal(r.ledger.currentDay(), "2026-10-20");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, clock)));
    assert.equal((await r.ledger.usageDetail(A, "2026-10-19")).spentAtomic, 50n * USD);
    assert.equal((await r.ledger.usageDetail(A, "2026-10-20")).spentAtomic, 10n * USD);
    await r.storage.close();
  });

  it("rolls over on the UTC boundary, not the local one (one second before and after)", async () => {
    const clock = new FakeClock("2026-12-31T23:59:59Z");
    const r = await rig({ clock });
    assert.equal(r.ledger.currentDay(), "2026-12-31");
    clock.advance(1000);
    assert.equal(r.ledger.currentDay(), "2027-01-01");
    await r.storage.close();
  });

  it("refuses a request that names another day, so yesterday's counter cannot be spent against", async () => {
    const r = await rig();
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD, day: "2026-10-18" }, r.clock))), "stale_day");
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD, day: "2026-10-20" }, r.clock))), "stale_day");
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: USD, day: "garbage" }, r.clock))), "stale_day");
    await r.storage.close();
  });

  it("still finds a reservation made before midnight, by id, after midnight", async () => {
    const clock = new FakeClock("2026-10-19T23:59:59Z");
    const r = await rig({ clock });
    const req = request({ amountAtomic: 4n * USD }, clock);
    reserved(await r.ledger.reserveFor(req));
    clock.advance(5000);
    const again = await r.ledger.reserveFor(req);
    assert.equal((again as { replayed: boolean }).replayed, true);
    assert.equal((await r.ledger.usageDetail(A, "2026-10-20")).spentAtomic, 0n);
    await r.storage.close();
  });
});

describe("commit, release and the evidence rule", () => {
  it("commits: the amount stays counted, committing twice is harmless, and a committed reservation cannot be released", async () => {
    const r = await rig();
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD }, r.clock)));
    await r.ledger.commit(id);
    await r.ledger.commit(id);
    assert.equal(r.ledger.reservation(id)?.state, "committed");
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 4n * USD);
    r.clock.advance(600_000);
    await refused(r.ledger.release(id, absent(r)));
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 4n * USD);
    await refused(r.ledger.commit("nonexistent1"), "not_found");
    await r.storage.close();
  });

  it("refuses to release without evidence, however long ago the item expired", async () => {
    const r = await rig();
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD }, r.clock)));
    r.clock.advance(10 * 86_400_000 - 1);
    await refused(r.ledger.release(id));
    await refused(r.ledger.release(id, undefined));
    await refused(r.ledger.release(id, { kind: "something_else", source: "orders_list", checkedAtMs: r.clock.now() } as unknown as ReleaseEvidence));
    await refused(r.ledger.release(id, { kind: "absent_after_expiry", source: "my_hunch", checkedAtMs: r.clock.now() } as unknown as ReleaseEvidence));
    assert.equal(r.ledger.reservation(id)?.state, "reserved");
    assert.equal((await r.ledger.usageDetail(A, "2026-10-19")).spentAtomic, 4n * USD);
    await r.storage.close();
  });

  it("refuses to release before the item has expired, even with evidence", async () => {
    const r = await rig();
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD, expiresAtMs: r.clock.now() + 300_000 }, r.clock)));
    r.clock.advance(299_999);
    await refused(r.ledger.release(id, absent(r)));
    assert.equal(r.ledger.reservation(id)?.state, "reserved");
    await r.storage.close();
  });

  it("refuses a release that arrives before the expiry even when the evidence is dated at the expiry (inside the clock skew)", async () => {
    const r = await rig();
    const expiry = r.clock.now() + 300_000;
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD, expiresAtMs: expiry }, r.clock)));
    r.clock.advance(298_000);
    await refused(r.ledger.release(id, { kind: "absent_after_expiry", source: "orders_list", checkedAtMs: expiry }));
    assert.equal(r.ledger.reservation(id)?.state, "reserved");
    r.clock.advance(2_000);
    await r.ledger.release(id, { kind: "absent_after_expiry", source: "orders_list", checkedAtMs: expiry });
    assert.equal(r.ledger.reservation(id)?.state, "released");
    await r.storage.close();
  });

  it("refuses evidence gathered before the expiry, or dated in the future, or without a time", async () => {
    const r = await rig();
    const expiry = r.clock.now() + 300_000;
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD, expiresAtMs: expiry }, r.clock)));
    r.clock.advance(301_000);
    await refused(r.ledger.release(id, { kind: "absent_after_expiry", source: "orders_list", checkedAtMs: expiry - 1 }));
    await refused(r.ledger.release(id, { kind: "absent_after_expiry", source: "orders_list", checkedAtMs: r.clock.now() + 60_000 }));
    await refused(r.ledger.release(id, { kind: "absent_after_expiry", source: "orders_list", checkedAtMs: Number.NaN }));
    assert.equal(r.ledger.reservation(id)?.state, "reserved");
    await r.storage.close();
  });

  it("releases after the expiry with evidence taken after it, gives the amount back, and is idempotent", async () => {
    const r = await rig();
    const expiry = r.clock.now() + 300_000;
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD, expiresAtMs: expiry }, r.clock)));
    r.clock.advance(300_000);
    await r.ledger.release(id, absent(r, "orders_list_and_fill_logs"));
    assert.equal(r.ledger.reservation(id)?.state, "released");
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 0n);
    await r.ledger.release(id, absent(r));
    await r.ledger.release("never-existed-0", absent(r));
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 0n);
    await r.storage.close();
  });

  it("does not let a released id reserve again", async () => {
    const r = await rig();
    const req = request({ amountAtomic: 4n * USD }, r.clock);
    const id = reserved(await r.ledger.reserveFor(req));
    r.clock.advance(400_000);
    await r.ledger.release(id, absent(r));
    assert.equal(denied(await r.ledger.reserveFor(req)), "released_id");
    await r.storage.close();
  });

  it("gives funding back, including the total, so the same room can be used again", async () => {
    const r = await rig();
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 8n * USD, kind: "fund", category: "funding", expiresAtMs: r.clock.now() + 600_000 }, r.clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 3n * USD, kind: "fund", category: "funding" }, r.clock))), "funding_total_cap");
    r.clock.advance(601_000);
    await r.ledger.release(id, absent(r, "no_report"));
    const usage = await r.ledger.usageDetail(A);
    assert.equal(usage.fundedAtomic, 0n);
    assert.equal(usage.fundedLifetimeAtomic, 0n);
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 3n * USD, kind: "fund", category: "funding" }, r.clock)));
    await r.storage.close();
  });

  it("keeps an ambiguous reservation reserved until evidence arrives", async () => {
    const r = await rig();
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 4n * USD }, r.clock)));
    await r.ledger.markAmbiguous(id, "the submit timed out");
    assert.equal(r.ledger.reservation(id)?.hold, true);
    assert.equal(r.ledger.reservation(id)?.holdReason, "the submit timed out");
    r.clock.advance(3_600_000);
    await refused(r.ledger.release(id));
    assert.equal((await r.ledger.usageDetail(A, "2026-10-19")).spentAtomic, 4n * USD);
    // Still counted for the day it belongs to, whatever the clock says now.
    r.clock.set("2026-10-19T13:30:00Z");
    await r.ledger.release(id, { kind: "absent_after_expiry", source: "orders_list_and_fill_logs", checkedAtMs: r.clock.now() });
    assert.equal(r.ledger.reservation(id)?.state, "released");
    await r.storage.close();
  });

  it("settles a partial fill: the difference comes back only with evidence, the rest is committed", async () => {
    const r = await rig();
    const expiry = r.clock.now() + 300_000;
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD, expiresAtMs: expiry }, r.clock)));
    await refused(r.ledger.settle(id, 4n * USD));
    await refused(r.ledger.settle(id, 11n * USD), "invalid_request");
    await refused(r.ledger.settle(id, -1n), "invalid_request");
    r.clock.advance(301_000);
    await r.ledger.settle(id, 4n * USD, absent(r));
    const view = r.ledger.reservation(id);
    assert.equal(view?.state, "committed");
    assert.equal(view?.spentAtomic, 4n * USD);
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 4n * USD);
    // The same settlement again is a no-op; a different one is refused.
    await r.ledger.settle(id, 4n * USD, absent(r));
    await refused(r.ledger.settle(id, 5n * USD, absent(r)));
    await r.storage.close();
  });

  it("settles a full fill without evidence", async () => {
    const r = await rig();
    const id = reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    await r.ledger.settle(id, 10n * USD);
    assert.equal(r.ledger.reservation(id)?.state, "committed");
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 10n * USD);
    await r.storage.close();
  });
});

describe("sweeping expired reservations", () => {
  it("releases what the checker proves absent, and keeps what is present, unknown or uncheckable", async () => {
    const r = await rig();
    const expiry = r.clock.now() + 300_000;
    const ids = {
      gone: reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: expiry }, r.clock))),
      resting: reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: expiry }, r.clock))),
      unsure: reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: expiry }, r.clock))),
      broken: reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: expiry }, r.clock))),
      later: reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: expiry + 3_600_000 }, r.clock))),
    };
    r.clock.advance(301_000);
    const checked: string[] = [];
    const report = await r.ledger.sweep(async (reservation) => {
      checked.push(reservation.id);
      if (reservation.id === ids.gone) return { verdict: "absent", source: "orders_list" };
      if (reservation.id === ids.resting) return { verdict: "present" };
      if (reservation.id === ids.broken) throw new Error("the order book is down");
      return { verdict: "unknown" };
    });
    assert.deepEqual(report.released, [ids.gone]);
    assert.deepEqual(report.present, [ids.resting]);
    assert.deepEqual([...report.unknown].sort(), [ids.broken, ids.unsure].sort());
    assert.equal(checked.includes(ids.later), false, "an item that has not expired is not even checked");
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 4n * USD);
    await r.storage.close();
  });
});

describe("the per-account lock", () => {
  it("takes the account's lock for every reserve, commit, settle, hold and release, and a different one per account", async () => {
    const made = await tempDir();
    dirs.push(made);
    const clock = new FakeClock();
    const storage = await openRelayStorage({ dir: made.dir, now: clock.now });
    const keys: string[] = [];
    const locks = {
      run: <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
        keys.push(key);
        return storage.locks.run(key, fn);
      },
    } as unknown as typeof storage.locks;
    const ledger = new DurableLedger({ store: storage.state, locks, now: clock.now, limits: () => LIMITS });
    const a = reserved(await ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: clock.now() + 1000 }, clock)));
    reserved(await ledger.reserveFor(request({ amountAtomic: USD, account: B }, clock)));
    await ledger.markAmbiguous(a, "unknown");
    await ledger.commit(a);
    assert.deepEqual(keys, [`ledger:${A}`, `ledger:${B}`, `ledger:${A}`, `ledger:${A}`]);
    const c = reserved(await ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: clock.now() + 1000 }, clock)));
    clock.advance(2000);
    await ledger.release(c, absent({ clock } as Rig));
    await ledger.settle(a, USD);
    assert.equal(keys.filter((key) => key === `ledger:${A}`).length, 6);
    await storage.close();
  });
});

describe("races", () => {
  it("lets exactly $50 through when 80 parallel $1 reservations race for it", async () => {
    const r = await rig();
    const results = await Promise.all(Array.from({ length: 80 }, () => r.ledger.reserveFor(request({ amountAtomic: USD }, r.clock))));
    assert.equal(results.filter((result) => result.reserved).length, 50);
    assert.equal(results.filter((result) => !result.reserved).length, 30);
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 50n * USD);
    await r.storage.close();
  });

  it("adds a reservation id once when 25 calls race with the same id", async () => {
    const r = await rig();
    const req = request({ amountAtomic: 7n * USD }, r.clock);
    const results = await Promise.all(Array.from({ length: 25 }, () => r.ledger.reserveFor(req)));
    assert.equal(results.filter((result) => result.reserved && !(result as { replayed: boolean }).replayed).length, 1);
    assert.equal(results.every((result) => result.reserved), true);
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 7n * USD);
    await r.storage.close();
  });

  it("keeps two accounts' races apart", async () => {
    const r = await rig();
    const results = await Promise.all(
      Array.from({ length: 120 }, (_unused, index) => r.ledger.reserveFor(request({ amountAtomic: USD, account: index % 2 === 0 ? A : B }, r.clock))),
    );
    assert.equal(results.filter((result) => result.reserved).length, 100);
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 50n * USD);
    assert.equal((await r.ledger.usageDetail(B)).spentAtomic, 50n * USD);
    await r.storage.close();
  });

  it("holds the funding total under a race too", async () => {
    const r = await rig();
    const results = await Promise.all(Array.from({ length: 30 }, () => r.ledger.reserveFor(request({ amountAtomic: USD, kind: "fund", category: "funding" }, r.clock))));
    assert.equal(results.filter((result) => result.reserved).length, 10);
    await r.storage.close();
  });
});

describe("a restart never resets a cap", () => {
  it("keeps the day's spend, the funding total, holds and released reservations across a clean restart", async () => {
    let r = await rig();
    for (let index = 0; index < 4; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    const held = reserved(await r.ledger.reserveFor(request({ amountAtomic: 5n * USD }, r.clock)));
    await r.ledger.markAmbiguous(held, "unknown outcome");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 9n * USD, kind: "fund", category: "funding" }, r.clock)));
    r = await r.reopen();
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 45n * USD);
    assert.equal(r.ledger.reservation(held)?.hold, true);
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 6n * USD }, r.clock))), "daily_cap");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 5n * USD }, r.clock)));
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 2n * USD, kind: "fund", category: "funding" }, r.clock))), "funding_total_cap");
    await r.storage.close();
  });

  it("keeps the day's spend, the funding total, the funding lifetime and the hold when the restart reads a COMPACTED snapshot, not the journal", async () => {
    let r = await rig();
    for (let index = 0; index < 4; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    const held = reserved(await r.ledger.reserveFor(request({ amountAtomic: 5n * USD }, r.clock)));
    await r.ledger.markAmbiguous(held, "unknown outcome");
    reserved(await r.ledger.reserveFor(request({ amountAtomic: 9n * USD, kind: "fund", category: "funding" }, r.clock)));
    await r.storage.state.compact();
    r = await r.reopen();
    assert.equal((await r.ledger.usageDetail(A)).spentAtomic, 45n * USD, "the day counter came back from the snapshot");
    assert.equal(r.ledger.reservation(held)?.hold, true);
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 6n * USD }, r.clock))), "daily_cap");
    assert.equal(denied(await r.ledger.reserveFor(request({ amountAtomic: 2n * USD, kind: "fund", category: "funding" }, r.clock))), "funding_total_cap");
    await r.storage.close();
  });

  it("keeps everything that was acknowledged after a crash (no orderly close)", async () => {
    const r = await rig();
    for (let index = 0; index < 5; index += 1) reserved(await r.ledger.reserveFor(request({ amountAtomic: 10n * USD }, r.clock)));
    r.storage.abandon();
    const after = await rig({ dir: r.dir, clock: r.clock });
    assert.equal((await after.ledger.usageDetail(A)).spentAtomic, 50n * USD);
    assert.equal(denied(await after.ledger.reserveFor(request({ amountAtomic: 1n }, r.clock))), "daily_cap");
    await after.storage.close();
  });
});

describe("invariants under a random sequence of operations (fixed seed)", () => {
  it("keeps the counters equal to the live reservations and under the caps, before and after a restart", async () => {
    const random = prng(0x5eed1019);
    let r = await rig();
    const accounts = [A, B, addr(0xc3)];
    const live = new Map<string, { account: string; amount: bigint; kind: "spend" | "fund"; state: "reserved" | "committed" | "released"; expiresAtMs: number }>();

    const check = async (): Promise<void> => {
      for (const account of accounts) {
        let spent = 0n;
        let funded = 0n;
        for (const entry of live.values()) {
          if (entry.account !== account || entry.state === "released") continue;
          if (entry.kind === "spend") spent += entry.amount;
          else funded += entry.amount;
        }
        const usage = await r.ledger.usageDetail(account);
        assert.equal(usage.spentAtomic, spent, `spent for ${account}`);
        assert.equal(usage.fundedAtomic, funded, `funded for ${account}`);
        assert.equal(usage.fundedLifetimeAtomic, funded, `lifetime for ${account}`);
        assert.ok(spent <= LIMITS.maxDailyAtomic);
        assert.ok(funded <= (LIMITS.fundingLifetimeCapAtomic as bigint));
      }
    };

    for (let step = 0; step < 400; step += 1) {
      const roll = random();
      const account = accounts[Math.floor(random() * accounts.length)] as string;
      if (roll < 0.6) {
        const kind = random() < 0.3 ? "fund" : "spend";
        const amount = BigInt(1 + Math.floor(random() * 12_000_000));
        const expiresAtMs = r.clock.now() + 60_000 + Math.floor(random() * 600_000);
        const result = await r.ledger.reserveFor(request({ amountAtomic: amount, account, kind, category: kind === "fund" ? "funding" : "order", expiresAtMs }, r.clock));
        if (result.reserved) live.set((result as { reservationId: string }).reservationId, { account, amount, kind, state: "reserved", expiresAtMs });
      } else if (roll < 0.75) {
        const open = [...live.entries()].filter(([, entry]) => entry.state === "reserved");
        const pick = open[Math.floor(random() * open.length)];
        if (pick !== undefined) {
          await r.ledger.commit(pick[0]);
          pick[1].state = "committed";
        }
      } else if (roll < 0.9) {
        const open = [...live.entries()].filter(([, entry]) => entry.state === "reserved");
        const pick = open[Math.floor(random() * open.length)];
        if (pick !== undefined) {
          r.clock.set(new Date(Math.max(r.clock.now(), pick[1].expiresAtMs) + 1000).toISOString());
          // Stay inside one UTC day so the invariant is about a single day's counters.
          if (utcDayKey(r.clock.now()) === "2026-10-19") {
            await r.ledger.release(pick[0], absent(r));
            pick[1].state = "released";
          }
        }
      } else if (roll < 0.95) {
        r = await r.reopen();
      } else {
        const open = [...live.entries()].filter(([, entry]) => entry.state === "reserved");
        const pick = open[Math.floor(random() * open.length)];
        if (pick !== undefined) await r.ledger.markAmbiguous(pick[0], "unknown");
      }
      if (step % 25 === 0) await check();
    }
    await check();
    await r.storage.close();
  });
});

describe("housekeeping", () => {
  it("prunes old days and finished reservations, never a reservation that is still reserved", async () => {
    const r = await rig();
    const oldId = reserved(await r.ledger.reserveFor(request({ amountAtomic: USD }, r.clock)));
    const finishedId = reserved(await r.ledger.reserveFor(request({ amountAtomic: USD }, r.clock)));
    await r.ledger.commit(finishedId);
    r.clock.advance(500 * 86_400_000);
    const report = await r.ledger.prune();
    assert.ok(report.days >= 1);
    assert.equal(report.reservations, 1);
    assert.equal(r.ledger.reservation(finishedId), undefined);
    assert.ok(r.ledger.reservation(oldId) !== undefined, "a reservation with no evidence is kept forever");
    await r.storage.close();
  });

  it("lists reservations by account, state and expiry", async () => {
    const r = await rig();
    const a = reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, expiresAtMs: r.clock.now() + 1000 }, r.clock)));
    reserved(await r.ledger.reserveFor(request({ amountAtomic: USD, account: B, expiresAtMs: r.clock.now() + 9_999_999 }, r.clock)));
    await r.ledger.commit(a);
    assert.equal(r.ledger.list().length, 2);
    assert.equal(r.ledger.list({ account: A }).length, 1);
    assert.equal(r.ledger.list({ state: "committed" }).length, 1);
    assert.equal(r.ledger.list({ state: "reserved", expiredBeforeMs: r.clock.now() + 5000 }).length, 0);
    await r.storage.close();
  });
});
