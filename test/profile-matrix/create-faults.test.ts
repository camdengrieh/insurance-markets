import assert from "node:assert/strict";
import { describe, mock as nodeMock } from "node:test";

import { Secret, loadConfig } from "../../src/config.js";
import { createRelayClient } from "../../src/relay/client.js";
import { RELAY_CLIENT_TIMEOUT_MS } from "../../src/relay/contract.js";
import { CANCEL_MARKET_TOOL, PREPARE_CREATE_TOOL, SEED_TOOL, SUBMIT_CREATE_TOOL, TRACK_TOOL, registerCreateTools } from "../../src/tools/create.js";
import { explorerTransportFromHttp } from "../../src/xo/chain/reads.js";
import { XoClient } from "../../src/xo/client.js";
import { useMock } from "../mock-xo/testing.js";
import { TEST_RELAY_KEY } from "../relay-core-helpers.js";
import { closeAll, connect, ENV_ON, OWNER } from "../tools-helpers.js";
import { applyProfile, identityOf, intentOf, signIntent, withDeadline, preparedIdOf, type MatrixProfile, type Step, type Transport, type WireAction } from "./helpers.js";
import {
  CREATE_TRANSPORTS,
  assertCreateHeld,
  checkCreateInvariants,
  createJourney,
  draftArgs,
  flowCreate,
  flowReview,
  readyCreator,
  signStep,
  startCreateStack,
  type CreateStack,
} from "./create-rig.js";

// Failures that are not a clean "no" on the creation path: a file that is not where the draft said, a file that is not the
// file the draft built, a bundler that complains or goes quiet, an order book that refuses the seed, an explorer that is
// down, signatures that are not the owner's over the prepared digest, a relay that never answers. Each must end in a stable,
// actionable answer inside the time budget, never in a hang, never in a second send, never in a second market.

const OPTIMISTIC: MatrixProfile = { name: "optimistic", base: "optimistic" };
type Mock = Parameters<typeof applyProfile>[0];

const sends = (cs: CreateStack): number => cs.stack.history.wire.count((call) => call.kind === "bundler_send");
const posts = (cs: CreateStack): number => cs.stack.history.wire.count((call) => call.kind === "order_post");

function actionable(step: Step, label: string): void {
  assert.equal(typeof step.structured?.["code"], "string", `${label}: a code (${step.text.slice(0, 200)})`);
  assert.ok(String(step.structured?.["message"] ?? "").length >= 10, `${label}: a message`);
  assert.ok(String(step.structured?.["next_action"] ?? "").length >= 10 || /(^|\n)Next:/.test(step.text), `${label}: a next step (${step.text.slice(0, 300)})`);
}

async function ready(mock: Mock, transport: Transport, index = 0) {
  applyProfile(mock, OPTIMISTIC);
  const cs = await startCreateStack({ mock, transport });
  const who = await readyCreator(cs, index);
  return { cs, who };
}

// A creation prepared and signed (the file hosted as the tool built it).
async function signedCreation(cs: CreateStack, who: Awaited<ReturnType<typeof readyCreator>>, variant = 0) {
  const args = draftArgs(who.owner, variant);
  const file = await cs.call(PREPARE_CREATE_TOOL, args);
  const hosted = file.structured?.["metadata_file"] as { url: string; text: string };
  cs.extras.files.set(hosted.url, hosted.text);
  const prepare = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
  const item = await signStep(cs, who, prepare);
  assert.ok(item !== undefined, prepare.text.slice(0, 300));
  return { args, hosted, prepare, item };
}

for (const transport of CREATE_TRANSPORTS) {
  describe(`failures on the creation path over ${transport.name}`, () => {
    const harness = useMock({ chains: { xo: true, base: false } });

    // ---- the hosted file -------------------------------------------------------------------------------------------------------------
    const hostingCases: ReadonlyArray<{ readonly name: string; readonly host: (text: string, uri: string) => string | null; readonly code: string }> = [
      { name: "not hosted at all (the host answers 404)", host: () => null, code: "precondition_failed" },
      { name: "an HTML page instead of the file", host: () => "<html><body>nope</body></html>", code: "precondition_failed" },
      { name: "a file with a key missing", host: (text) => JSON.stringify({ ...(JSON.parse(text) as Record<string, unknown>), tags: undefined }), code: "precondition_failed" },
      { name: "a file that is not the one the draft built (the title changed)", host: (text) => text.replace("Bitcoin", "Ethereum"), code: "metadata_mismatch" },
    ];
    for (const kase of hostingCases) {
      harness.it(`the hosted file is ${kase.name}: refused with ${kase.code}, nothing signable, nothing sent`, async (mock) => {
        const { cs, who } = await ready(mock, transport);
        const args = draftArgs(who.owner, 0);
        const file = await cs.call(PREPARE_CREATE_TOOL, args);
        const hosted = file.structured?.["metadata_file"] as { url: string; text: string };
        const served = kase.host(hosted.text, hosted.url);
        if (served !== null) cs.extras.files.set(hosted.url, served);
        const refused = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        assert.equal(refused.isError, true, refused.text.slice(0, 300));
        assert.equal(refused.code, kase.code, refused.text.slice(0, 300));
        actionable(refused, kase.name);
        assert.equal(intentOf(refused), undefined, "no signing intent for a file that is not the draft");
        assert.equal(sends(cs), 0);
        assert.equal(mock.creation.markets.size, 0);
        // Hosting the right file fixes it: after the earlier attempt's item has run out, the same draft is prepared and made once.
        cs.extras.files.set(hosted.url, hosted.text);
        await mock.advance(400);
        const again = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        assert.equal(again.outcome, "prepared", again.text.slice(0, 300));
        const item = await signStep(cs, who, again);
        const sent = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item!.id, signature: item!.signature });
        assert.equal(sent.outcome, "submitted", sent.text.slice(0, 300));
        await mock.advance(15);
        assert.equal(mock.creation.markets.size, 1);
        assert.equal(sends(cs), 1);
        assertCreateHeld(await checkCreateInvariants(cs), kase.name);
      });
    }

    harness.it("a URL outside the declared self-host: refused before any request to it, from either call", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      const outside = "https://evil.example/m/0b7d6c1e-3f4a-4c52-9a10-1c2d3e4f5a00.json";
      for (const hosted of [false, true]) {
        const refused = await cs.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 0), metadata_url: outside, ...(hosted ? { file_is_hosted: true } : {}) });
        assert.equal(refused.isError, true, refused.text.slice(0, 300));
        assert.equal(refused.code, "uri_invalid");
        actionable(refused, "outside host");
        assert.equal(intentOf(refused), undefined);
      }
      // The relay itself, asked directly, never fetches from a host it was not told about.
      const direct = await cs.stack.client().post("/v1/userop/prepare", { owner: who.owner, action: "create_market", params: { metadata_uri: outside, expires_at: "2027-01-01T00:00:00Z", title: "x" } });
      assert.equal(direct.ok, false);
      assert.ok(!cs.stack.history.wire.calls.some((call) => call.host === "evil.example"), "no request went to the foreign host");
      assert.ok(!cs.extras.fetched.some((url) => url.includes("evil.example")));
      assertCreateHeld(await checkCreateInvariants(cs), "outside host");
    });

    // ---- the bundler -----------------------------------------------------------------------------------------------------------------
    const bundlerCases: ReadonlyArray<{ readonly name: string; readonly action: WireAction; readonly outcomes: readonly string[]; readonly landed: boolean }> = [
      { name: "never opens a connection", action: { action: "fail" }, outcomes: ["ambiguous"], landed: false },
      { name: "does the work and the answer is lost", action: { action: "forward_then_fail" }, outcomes: ["submitted", "ambiguous"], landed: true },
      { name: "answers 502", action: { action: "status", status: 502 }, outcomes: ["ambiguous", "rejected"], landed: false },
      { name: "answers 429", action: { action: "status", status: 429 }, outcomes: ["rejected", "ambiguous"], landed: false },
    ];
    for (const kase of bundlerCases) {
      harness.it(`the bundler ${kase.name}: a stable answer, one send, never a second market`, async (mock) => {
        const { cs, who } = await ready(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 900, metadataUpdate: false };
        const { args, item } = await signedCreation(cs, who);
        cs.stack.history.wire.fault({ name: kase.name, match: (call) => call.kind === "bundler_send", times: 1, action: kase.action });
        const reply = await withDeadline(cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature }), 5_000, "xo_submit_create_market");
        assert.ok(kase.outcomes.includes(String(reply.outcome)), `${String(reply.outcome)}: ${reply.text.slice(0, 300)}`);
        actionable(reply, kase.name);
        if (reply.outcome !== "submitted") assert.match(String(reply.structured?.["next_action"]), /Do NOT|Nothing landed|prepare again|do not/i);
        // The item is single use whatever happened.
        const again = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: item.id, signature: item.signature });
        assert.equal(again.isError, true);
        assert.equal(sends(cs), 1, "the relay did not retry a write");
        // The same draft, prepared again: refused while the first send's outcome is unknown or the market exists; a draft whose
        // send was refused outright may be prepared again, and then it is made once.
        const twin = await cs.call(PREPARE_CREATE_TOOL, { ...args, file_is_hosted: true });
        if (twin.outcome === "prepared") {
          assert.equal(reply.outcome === "rejected", true, "only a refused send may be prepared again");
          const fresh = await signStep(cs, who, twin);
          const second = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: fresh!.id, signature: fresh!.signature });
          assert.equal(second.outcome, "submitted", second.text.slice(0, 300));
        } else {
          assert.equal(twin.isError, true);
          assert.equal(intentOf(twin), undefined);
          actionable(twin, `${kase.name}: the same draft again`);
        }
        await mock.advance(30);
        await cs.tick();
        assert.equal(mock.creation.markets.size, kase.landed || twin.outcome === "prepared" ? 1 : 0);
        assert.ok(mock.creation.markets.size <= 1, "one draft, at most one market");
        assertCreateHeld(await checkCreateInvariants(cs), kase.name);
      });
    }

    // ---- the seed ---------------------------------------------------------------------------------------------------------------------
    const seedCases: ReadonlyArray<{ readonly name: string; readonly action: WireAction; readonly outcomes: readonly string[] }> = [
      { name: "never opens a connection", action: { action: "fail" }, outcomes: ["ambiguous"] },
      { name: "does the work and the answer is lost", action: { action: "forward_then_fail" }, outcomes: ["accepted", "ambiguous"] },
      { name: "answers 503", action: { action: "status", status: 503 }, outcomes: ["ambiguous", "rejected"] },
      { name: "refuses it with 422", action: { action: "status", status: 422 }, outcomes: ["rejected"] },
    ];
    for (const kase of seedCases) {
      harness.it(`the order book ${kase.name} for the seed: a stable answer, one POST, the seed is never resent`, async (mock) => {
        const { cs, who } = await ready(mock, transport);
        mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
        const run = await flowCreate(cs, who, 0);
        await flowReview(cs, run, 700);
        const prepare = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5", ttl_days: 7 });
        const item = await signStep(cs, who, prepare, "seed");
        assert.ok(item !== undefined, prepare.text.slice(0, 300));
        cs.stack.history.wire.fault({ name: kase.name, match: (call) => call.kind === "order_post", times: 1, action: kase.action });
        const reply = await withDeadline(cs.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature }), 5_000, "xo_place_seed");
        assert.ok(kase.outcomes.includes(String(reply.outcome)), `${String(reply.outcome)}: ${reply.text.slice(0, 300)}`);
        actionable(reply, kase.name);
        const again = await cs.call(SEED_TOOL, { step: "submit", prepared_id: item.id, signature: item.signature });
        assert.equal(again.isError, true, "single use");
        assert.equal(posts(cs), 1, "one POST for one prepared seed");
        assert.ok(mock.write.orders.size <= 1);
        assertCreateHeld(await checkCreateInvariants(cs), `seed: ${kase.name}`);
      });
    }

    harness.it("a seed before XO's order book shows the market active waits, with the wait said; it is never posted early", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      const run = await flowCreate(cs, who, 0);
      // Still pending: no seed is prepared, the refusal says XO has not reviewed it.
      const early = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5" });
      assert.equal(early.isError, true);
      assert.equal(early.code, "seed_not_ready", early.text.slice(0, 300));
      assert.equal(intentOf(early), undefined);
      actionable(early, "seed on a pending market");
      assert.equal(posts(cs), 0);
      assert.equal(cs.stack.relay.services.ledger.list().filter((entry) => entry.category === "seed").length, 0, "no cap is held for a seed that was not prepared");
      // Someone else's market, a market that does not exist, a cancelled market: refused, nothing reserved.
      const stranger = identityOf(mock, 6);
      await readyCreator(cs, 6, { connect: false });
      const notMine = await cs.call(SEED_TOOL, { step: "prepare", owner: stranger.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5" });
      assert.equal(notMine.code, "market_not_created_by_owner", notMine.text.slice(0, 300));
      const ghost = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: `0x${"ab".repeat(32)}`, outcome: "yes", price: "0.5" });
      assert.equal(ghost.code, "market_not_created_by_owner");
      assertCreateHeld(await checkCreateInvariants(cs), "seed before active");
    });

    // ---- XO's explorer ----------------------------------------------------------------------------------------------------------------
    harness.it("XO's explorer is down: the reads and the seed refuse with a reason, nothing is signed, and the relay's own tracker still answers", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
      const run = await flowCreate(cs, who, 0);
      await flowReview(cs, run, 700);
      mock.injectFault("5xx", {});
      const list = await cs.call(TRACK_TOOL, { owner: who.owner });
      assert.equal(list.isError, true);
      actionable(list, "the creator's list with the explorer down");
      const seed = await cs.call(SEED_TOOL, { step: "prepare", owner: who.owner, condition_id: run.conditionId!, outcome: "yes", price: "0.5" });
      assert.equal(seed.isError, true);
      actionable(seed, "a seed with the explorer down");
      assert.equal(intentOf(seed), undefined);
      const creation = await cs.call(PREPARE_CREATE_TOOL, { ...draftArgs(who.owner, 3), file_is_hosted: true });
      assert.equal(creation.isError, true, "a creation is not prepared on a guess");
      assert.equal(intentOf(creation), undefined);
      assert.equal(posts(cs), 0);
      assertCreateHeld(await checkCreateInvariants(cs), "explorer down");
    });

    // ---- signatures -------------------------------------------------------------------------------------------------------------------
    harness.it("only the owner's signature over the prepared digest sends anything; the right one still works after wrong ones, once", async (mock) => {
      const { cs, who } = await ready(mock, transport);
      mock.creation.policy = { decision: "approve", reviewDelayS: 900, metadataUpdate: false };
      const a = await signedCreation(cs, who, 0);
      const b = await signedCreation(cs, who, 1);
      const stranger = identityOf(mock, 5);
      const wrongSigners: Array<[string, `0x${string}`, string]> = [
        ["a stranger's key", await signIntent(stranger.key, intentOf(a.prepare)!), a.item.id],
        ["the owner's signature over the OTHER item's digest", b.item.signature, a.item.id],
      ];
      for (const [label, signature, id] of wrongSigners) {
        const refused = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: id, signature });
        assert.equal(refused.isError, true, label);
        assert.equal(refused.code, "owner_mismatch", `${label}: ${refused.text.slice(0, 300)}`);
        actionable(refused, label);
      }
      const unknown = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: "ab".repeat(16), signature: a.item.signature });
      assert.equal(unknown.code, "not_found");
      actionable(unknown, "an unknown prepared id");
      assert.equal(sends(cs), 0, "nothing was sent for a signature that is not the owner's over the digest");
      const good = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: a.item.id, signature: a.item.signature });
      assert.equal(good.outcome, "submitted", good.text.slice(0, 300));
      const twice = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: a.item.id, signature: a.item.signature });
      assert.equal(twice.code, "prepared_used");
      assert.equal(sends(cs), 1);
      // B waits past its five minutes: expired, sends nothing, and its draft can be prepared again.
      await mock.advance(400);
      const late = await cs.call(SUBMIT_CREATE_TOOL, { prepared_id: b.item.id, signature: b.item.signature });
      assert.equal(late.code, "expired", late.text.slice(0, 300));
      actionable(late, "an expired item");
      assert.equal(sends(cs), 1);
      const retry = await cs.call(PREPARE_CREATE_TOOL, { ...b.args, file_is_hosted: true });
      assert.equal(retry.outcome, "prepared", retry.text.slice(0, 300));
      assertCreateHeld(await checkCreateInvariants(cs), "signatures");
    });
  });
}

// The mock's `faults` switch (429 with Retry-After, 5xx, truncated JSON) on every XO host at once, from the pessimistic and
// the optimistic profile, through the whole creation journey. The `timeout` value is left to the hang tests above and the
// fake-timer test below: it makes every request wait for the relay's own (real-time) timeouts.
for (const transport of CREATE_TRANSPORTS) {
  describe(`the faults switch over ${transport.name}, through the creation journey`, () => {
    const harness = useMock({ chains: { xo: true, base: true } });
    for (const base of ["pessimistic", "optimistic"] as const) {
      for (const value of ["429-retry-after", "5xx", "truncated-json"] as const) {
        harness.it(`${base} + faults=${value}: every creation flow ends in a stable answer, nothing is signable, nothing is written`, async (mock) => {
          applyProfile(mock, { name: base, base, flip: { name: "faults", value } });
          const cs = await startCreateStack({ mock, transport });
          const who = identityOf(mock, 0);
          const journey = await createJourney(cs, who);
          for (const [name, flow] of Object.entries(journey.flows)) {
            for (const step of Object.values(flow)) {
              if (step === undefined || step.tool === "xo_account") continue;
              if (name === "connect" || name === "fund" || name === "fundEarly") continue;
              assert.equal(intentOf(step), undefined, `${name}/${step.tool} hands out a signing intent while XO is failing`);
            }
          }
          assert.equal(cs.stack.history.wire.count((call) => call.kind === "bundler_send" || call.kind === "order_post"), 0, "no write went upstream");
          assert.equal(mock.creation.markets.size, 0);
          assertCreateHeld(await checkCreateInvariants(cs), `${base} + faults=${value}`);
        });
      }
    }
  });
}

describe("a relay that never answers the creation tools, with fake timers", () => {
  const harness = useMock({ chains: false });

  // The real RelayClient against a fetch that never settles (but honours abort). The 8 s client timeout and the tools' own
  // budgets run on mocked timers: no real time passes and the scheduler cannot make the test flaky.
  async function silentCreateTools() {
    let sent = 0;
    const clock = { ms: Date.parse("2026-10-19T12:00:00Z") };
    const silent = ((_input: unknown, init?: RequestInit): Promise<Response> => {
      sent += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    }) as typeof fetch;
    const env = { ...ENV_ON, XO_RELAY_URL: "http://127.0.0.1:9", XO_RELAY_KEY: TEST_RELAY_KEY, XO_ENABLE_CREATE: "1", ENABLE_SELF_HOSTED_METADATA: "1" };
    const config = loadConfig(env).config;
    const client = createRelayClient({ baseUrl: "http://127.0.0.1:9", key: new Secret(TEST_RELAY_KEY), fetch: silent });
    const publicReads = new XoClient({ totalBudgetMs: 7_000, allowedHosts: ["orderbooks.xo.market", "explorer-mainnet.xo.market", "data-api.xo.market"], userAgent: "insurance-markets-xo-plugin/0.2", fetchImpl: silent as never, minIntervalMs: 1 });
    const deps = {
      nowMs: () => clock.ms,
      config: () => config,
      env: () => env,
      relay: () => client,
      audit: { write: () => undefined },
      createClient: () => publicReads,
      explorer: (xo: XoClient) => explorerTransportFromHttp(xo.http),
    };
    const harness = await connect((server) => registerCreateTools(server, deps));
    return { call: (name: string, args: Record<string, unknown>) => harness.call(name, args), sent: () => sent, clock };
  }

  harness.it("every creation tool gives up at the client's time limit with a stable answer; a write is ambiguous and says never to prepare the draft again", async () => {
    nodeMock.timers.enable({ apis: ["setTimeout"] });
    try {
      const { call, sent, clock } = await silentCreateTools();
      const settle = async (pending: Promise<{ isError: boolean; structured: Record<string, unknown> | undefined; text: string }>) => {
        for (let i = 0; i < 8; i += 1) await Promise.resolve();
        nodeMock.timers.tick(RELAY_CLIENT_TIMEOUT_MS + 1);
        clock.ms += RELAY_CLIENT_TIMEOUT_MS + 1;
        return pending;
      };
      const submitted = await settle(call("xo_submit_create_market", { prepared_id: "ab".repeat(16), signature: `0x${"11".repeat(32)}${"22".repeat(32)}1b` }));
      assert.equal(submitted.isError, true);
      assert.equal(submitted.structured?.["code"], "ambiguous", submitted.text.slice(0, 300));
      assert.match(String(submitted.structured?.["next_action"]), /Do NOT submit this again and do NOT prepare the same draft again/);
      assert.equal(sent(), 1, "one request, no retry");
      for (const [name, args] of [
        [TRACK_TOOL, { condition_id: `0x${"c0".repeat(32)}` }],
        [CANCEL_MARKET_TOOL, { step: "prepare", owner: OWNER, condition_id: `0x${"c0".repeat(32)}` }],
      ] as const) {
        const before = sent();
        const reply = await settle(call(name, args));
        assert.equal(reply.isError, true, name);
        assert.equal(typeof reply.structured?.["code"], "string", name);
        assert.ok(String(reply.structured?.["next_action"] ?? "").length >= 10, `${name}: ${reply.text.slice(0, 300)}`);
        assert.ok(sent() > before, name);
      }
    } finally {
      nodeMock.timers.reset();
      await closeAll();
    }
  });
});

void preparedIdOf;
