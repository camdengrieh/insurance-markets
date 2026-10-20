import assert from "node:assert/strict";
import { describe } from "node:test";

import { useMock } from "../mock-xo/testing.js";
import { marketTokens } from "../mock-xo/traders.js";
import { sendFunding } from "../relay-funding-helpers.js";
import { mintUsdce } from "../relay-userops-helpers.js";
import {
  allProfiles,
  applyProfile,
  assertNoViolations,
  checkCredentialsKept,
  checkInvariants,
  conditionId,
  creditBalance,
  embeddedTransport,
  ensureDeployedLikeXoApp,
  flowConnect,
  flowDeploy,
  flowFund,
  flowOrder,
  httpTransport,
  identityOf,
  intentOf,
  preparedIdOf,
  resolveOnChain,
  signIntent,
  startStack,
  type Identity,
  type Stack,
  type Step,
  type Transport,
} from "./helpers.js";

// A seeded random walk through the whole tool surface with two owners, restarts, lost answers, replays, wrong
// signatures, time jumps and a late kill switch. After EVERY action the invariants are checked over the whole history
// (nothing sent that was not prepared and signed, no double send, caps, flags, no funding of an undeployed account,
// actionable answers, credentials kept). A failure prints the seed, the profile and the action trace, which is the
// reproduction. Fixed seeds: the same walk on every run and every machine.

// A short account of every write that went upstream, for a failure message.
function wireDigest(stack: Stack): string {
  return stack.history.wire.calls
    .filter((call) => call.kind !== "other" || process.env["MATRIX_WIRE"] === "all")
    .map((call) => `#${String(call.seq)} ${call.kind} ${call.method} ${call.path} ${String(call.orderHash ?? call.userOpHash ?? "").slice(0, 10)} ${String(call.prefix ?? "")} status ${String(call.status)}${call.accepted ? " accepted" : ""}`)
    .join("\n    ");
}

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted by repetition: orders and connects are the busiest paths.
const ACTIONS = [
  "deploy",
  "connect",
  "connect",
  "order",
  "order",
  "order",
  "order",
  "order_lost_answer",
  "order_refused_connection",
  "prepare_only",
  "fund",
  "redeem",
  "redeem_lost_answer",
  "withdraw",
  "restart_crash",
  "restart_close",
  "advance",
  "replay",
  "replay",
  "wrong_signature",
  "reads",
  "cancel_all",
  "kill",
] as const;
type Action = (typeof ACTIONS)[number];

const SEEDS: ReadonlyArray<readonly [number, string]> = [
  [11, "optimistic"],
  [23, "optimistic"],
  [37, "optimistic"],
  [41, "pessimistic"],
  [53, "order.sig_forms=both"],
  [67, "rpc.access=open"],
  [79, "optimistic"],
  [97, "optimistic"],
];
const LENGTH = 30;

// Exploration (not part of the suite): MATRIX_EXTRA_SEEDS="101,102:order.sig_forms=both" adds walks, each seed optionally
// with the profile after a colon (default: optimistic). A failing seed is then pinned by adding it to SEEDS.
const EXTRA: ReadonlyArray<readonly [number, string]> = (process.env["MATRIX_EXTRA_SEEDS"] ?? "")
  .split(",")
  .filter((entry) => entry.trim() !== "")
  .map((entry) => {
    const [seed, name] = entry.trim().split(":");
    return [Number(seed), name ?? "optimistic"] as const;
  });

// What the walks reached, so a walk that never gets anywhere cannot pass for coverage.
const reached = new Map<string, number>();

interface Used {
  readonly tool: string;
  readonly args: Record<string, unknown>;
}

const transports: readonly Transport[] = [httpTransport, embeddedTransport];

for (const transport of transports) {
  describe(`random walks over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });
    const profiles = allProfiles().filter((profile) => profile.flip?.name !== "faults");

    for (const [seed, profileName] of [...SEEDS, ...EXTRA]) {
      const profile = profiles.find((entry) => entry.name === profileName)!;
      harness.it(`seed ${String(seed)} under ${profile.name}`, async (mock) => {
        applyProfile(mock, profile);
        const random = prng(seed);
        const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
        let stack: Stack = await startStack({ mock, transport, orderTimings: { pendingAfterMs: 200, postTimeoutMs: 800 } });
        const owners: Identity[] = [identityOf(mock, 0), identityOf(mock, 1)];
        for (const owner of owners) {
          await ensureDeployedLikeXoApp(stack, owner);
          creditBalance(mock, owner.account, 200_000_000n);
          mock.hyperlane.setBaseBalance(owner.owner, 100_000_000n);
        }
        const trace: string[] = [];
        const used: Used[] = [];
        let killed = false;
        let killedAt = { wireSeq: 0, step: 0 };
        let resolved = 0;

        for (let n = 0; n < LENGTH; n += 1) {
          const who = pick(owners);
          const action: Action = pick(ACTIONS);
          const label = `${String(n)}:${action}(${who.index})`;
          trace.push(label);
          const remember = (step: Step | undefined, args: Record<string, unknown>): void => {
            // Only an item that was actually consumed (sent, or in doubt) must never be sent again; one that was refused
            // before anything left (no credentials yet, a flag off) can legitimately be submitted later.
            if (step !== undefined && step.structured !== undefined && ["accepted", "pending", "ambiguous", "submitted", "rejected"].includes(String(step.outcome))) used.push({ tool: step.tool, args });
          };
          // A fault that did not fire (its send never happened) must not wait for an unrelated later send.
          stack.history.wire.clearFaults();
          try {
            switch (action) {
              case "deploy":
                await flowDeploy(stack, who);
                break;
              case "connect":
                await flowConnect(stack, who);
                break;
              case "order": {
                const flow = await flowOrder(stack, who, { shares: pick(["5", "10", "22.7", "30"]), price: pick(["0.3", "0.4", "0.5"]), marketSeed: pick(["clob-active-a", "clob-active-b"]), outcome: pick(["yes", "no"]), cancel: random() < 0.5 });
                const prepared = flow["prepare"];
                if (prepared !== undefined && intentOf(prepared) !== undefined) remember(flow["submit"], { prepared_id: preparedIdOf(prepared), signature: await signIntent(who.key, intentOf(prepared)!) });
                break;
              }
              case "order_lost_answer":
              case "order_refused_connection":
                stack.history.wire.fault({ name: action, match: (call) => call.kind === "order_post", times: 1, action: action === "order_lost_answer" ? { action: "forward_then_fail" } : { action: "fail" } });
                await flowOrder(stack, who, { cancel: false });
                break;
              case "prepare_only":
                await stack.call("xo_prepare_order", { owner: who.owner, token_id: marketTokens(mock, "clob-active-a").yes, side: "BUY", price: "0.3", shares: pick(["5", "10"]) });
                break;
              case "fund": {
                const flow = await flowFund(stack, who, { amountUsd: pick(["1", "2", "3"]), execute: random() < 0.5 });
                void flow;
                break;
              }
              case "redeem":
              case "redeem_lost_answer": {
                const id = conditionId(`walk-${String(seed)}-${String(resolved++)}`);
                await resolveOnChain(mock, id);
                if (action === "redeem_lost_answer") stack.history.wire.fault({ name: action, match: (call) => call.kind === "bundler_send", times: 1, action: { action: "forward_then_fail" } });
                const prepared = await stack.call("xo_redeem", { step: "prepare", owner: who.owner, condition_ids: [id] });
                const intent = intentOf(prepared);
                if (intent !== undefined) {
                  const signature = await signIntent(who.key, intent);
                  stack.history.signed.push({ preparedId: preparedIdOf(prepared), digest: "redeem", by: who.owner });
                  const args = { step: "submit", prepared_id: preparedIdOf(prepared), signature };
                  remember(await stack.call("xo_redeem", args), args);
                }
                break;
              }
              case "withdraw": {
                await mintUsdce(mock, who.account, 2_000_000n);
                const prepared = await stack.call("xo_withdraw", { owner: who.owner, amount_usd: "1" });
                const intent = prepared.structured?.["request_wallet_sign_intent"] as never;
                const id = prepared.structured?.["prepared_id"];
                if (intent !== undefined && typeof id === "string") {
                  const signature = await signIntent(who.key, intent);
                  stack.history.signed.push({ preparedId: id, digest: "withdraw", by: who.owner });
                  const args = { prepared_id: id, signature };
                  remember(await stack.call("xo_submit_userop", args), args);
                }
                break;
              }
              case "restart_crash":
              case "restart_close":
                stack = await stack.restart(action === "restart_crash" ? "crash" : "close", { relayKill: killed });
                assertNoViolations(await checkCredentialsKept(stack), `after ${label}`);
                break;
              case "advance":
                await mock.advance(pick([5, 20, 60, 200, 400]));
                break;
              case "replay": {
                const old = used.length === 0 ? undefined : pick(used);
                if (old !== undefined) {
                  const before = stack.history.wire.calls.length;
                  const again = await stack.call(old.tool, old.args);
                  // A used prepared item is never sent a second time.
                  assert.equal(stack.history.wire.calls.slice(before).filter((call) => call.kind !== "other").length, 0, `a replay of ${old.tool} sent something: ${JSON.stringify(stack.history.wire.calls.slice(before).filter((call) => call.kind !== "other").map((call) => ({ kind: call.kind, status: call.status, accepted: call.accepted, hash: call.orderHash ?? call.userOpHash, prefix: call.prefix, path: call.path })))} :: ${again.text.slice(0, 300)}\n  wire:\n    ${wireDigest(stack)}\n  used: ${JSON.stringify(used.map((u) => `${u.tool}:${String(u.args["prepared_id"]).slice(0, 8)}`))}\n  replayed: ${old.tool} ${String(old.args["prepared_id"])}`);
                }
                break;
              }
              case "wrong_signature": {
                const stranger = identityOf(mock, 6);
                const prepared = await stack.call("xo_prepare_order", { owner: who.owner, token_id: marketTokens(mock, "clob-active-b").yes, side: "BUY", price: "0.3", shares: "5" });
                const intent = intentOf(prepared);
                if (intent !== undefined) {
                  const before = stack.history.wire.calls.length;
                  const wrong = await stack.call("xo_submit_order", { prepared_id: preparedIdOf(prepared), signature: await signIntent(stranger.key, intent) });
                  assert.equal(wrong.isError, true, "a stranger's signature is refused");
                  assert.equal(stack.history.wire.calls.slice(before).filter((call) => call.kind !== "other").length, 0, "and sends nothing");
                }
                break;
              }
              case "reads":
                await stack.call("xo_account", { owner: who.owner });
                await stack.call("xo_list_orders", { owner: who.owner });
                break;
              case "cancel_all": {
                const listed = await stack.call("xo_list_orders", { owner: who.owner });
                for (const hash of listed.text.match(/0x[0-9a-f]{64}/g) ?? []) await stack.call("xo_cancel_order", { owner: who.owner, order_hash: hash });
                break;
              }
              case "kill":
                if (random() < 0.5 && n > LENGTH / 2) {
                  killedAt = { wireSeq: stack.history.wire.calls.length, step: stack.history.steps.length };
                  await stack.relay.services.flagGate.engageKill("random walk");
                  killed = true;
                }
                break;
            }
          } catch (error) {
            throw new Error(`seed ${String(seed)} under ${profile.name}: step ${label} threw: ${error instanceof Error ? error.message : String(error)}\ntrace: ${trace.join(" ")}`);
          }
          for (const step of stack.history.steps.slice(-6)) reached.set(`${step.tool}:${String(step.code)}`, (reached.get(`${step.tool}:${String(step.code)}`) ?? 0) + 1);
          const violations = await checkInvariants(stack, {
            skipScan: true,
            // A kill switch engaged mid-walk: only what happened after it is held to it, which is the point of the next lines.
            writable: killed ? { userop: false, trading: false, funding: false, withdraw: false } : undefined,
            ...(killed ? { gatesFrom: killedAt } : {}),
          });
          assertNoViolations(violations, `seed ${String(seed)} under ${profile.name} after ${label}\ntrace: ${trace.join(" ")}`);
        }
        assertNoViolations(
          await checkInvariants(stack, killed ? { writable: { userop: false, trading: false, funding: false, withdraw: false }, gatesFrom: killedAt } : {}),
          `seed ${String(seed)} under ${profile.name} (final, with the leak scan)\ntrace: ${trace.join(" ")}`,
        );
      });
    }
  });
}

describe("the random walks got somewhere", () => {
  const harness = useMock({ chains: false });
  // Runs after the walks of this file (node:test runs a file's suites in order).
  harness.it("they placed, cancelled, lost, replayed and refused things, not only refused everything", () => {
    const count = (key: string): number => reached.get(key) ?? 0;
    assert.ok(count("xo_submit_order:accepted") >= 4, `accepted orders: ${String(count("xo_submit_order:accepted"))}`);
    assert.ok(count("xo_cancel_order:cancelled") >= 1, "cancelled orders");
    assert.ok(count("xo_submit_order:ambiguous") + count("xo_submit_userop:ambiguous") + count("xo_redeem:ambiguous") >= 1, "a send in doubt");
    assert.ok(count("xo_submit_order:prepared_used") + count("xo_redeem:prepared_used") + count("xo_submit_userop:prepared_used") >= 1, "a replay refused as already used");
    assert.ok(count("xo_prepare_order:cap_exceeded") >= 1, "a cap refusal");
    assert.ok(count("xo_connect:connected") >= 1, "a connect");
  });
});
