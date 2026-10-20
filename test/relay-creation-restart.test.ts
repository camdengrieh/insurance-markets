import assert from "node:assert/strict";
import { describe } from "node:test";

import { useMock } from "./mock-xo/testing.js";
import { failed, eventually, ok, signPrepared } from "./relay-userops-helpers.js";
import { HOSTED_URI, buildFile, createBody, createMarket, hostedText, ownerOf, readyOwner, startCreationRig, trackOf } from "./relay-creation-helpers.js";
import type { MetadataJson } from "../src/xo/creation/metadata.js";

// The durable watcher (amendment A2): a restart in the middle of a watch loses nothing, repeats nothing and double-sends
// nothing. The relay is killed without an orderly shutdown ("crash"), then started again on the same data directory.

const alive = { isProcessAlive: () => false };

function count(view: { readonly timeline: readonly { readonly event: string }[] }, event: string): number {
  return view.timeline.filter((entry) => entry.event === event).length;
}

describe("a restart in the middle of a watch", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("waiting for the first review: the tracker resumes, the creation is not counted twice, and the approval is seen once", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 1800, metadataUpdate: false };
    await readyOwner(mock, 3);
    const first = await startCreationRig(mock);
    const made = await createMarket(first, 3);
    await mock.advance(120);
    await first.tick();
    assert.equal((await trackOf(first, made.conditionId)).status, "pending");
    await first.crash();

    const second = await startCreationRig(mock, { dir: first.temp, files: first.files, createOptions: alive });
    // Nothing is in memory: the tracker is read back from the store.
    const resumed = await trackOf(second, made.conditionId);
    assert.equal(resumed.status, "pending");
    assert.equal(count(resumed, "market_created"), 1);
    await mock.advance(2000);
    const report = await second.creation.tick();
    assert.deepEqual(report?.polled, [made.conditionId]);
    const view = await trackOf(second, made.conditionId);
    assert.equal(view.status, "active");
    assert.equal(count(view, "market_created"), 1);
    assert.equal(count(view, "approved"), 1);
    // A second restart after the end changes nothing either, and a terminal-or-watched market is not created again.
    await second.stop();
    const third = await startCreationRig(mock, { dir: first.temp, files: first.files });
    const again = await trackOf(third, made.conditionId);
    assert.equal(count(again, "approved"), 1);
    assert.equal(mock.creation.markets.size, 1);
  });

  harness.it("inside an update window: the guard's verdict is kept, XO's file is not fetched again, and the answer is still possible", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "update", reviewDelayS: 300, windowS: 48 * 3600, changeExpiry: false, metadataUpdate: false };
    await readyOwner(mock, 3);
    const first = await startCreationRig(mock);
    const made = await createMarket(first, 3);
    await mock.advance(305);
    const market = mock.creation.markets.get(made.conditionId);
    assert.ok(market?.suggestion != null);
    const suggested = structuredClone(made.file.metadata) as unknown as Record<string, unknown>;
    suggested["tags"] = [...(suggested["tags"] as string[]), "Markets"];
    first.files.set(market.suggestion.uri, hostedText(suggested as unknown as MetadataJson));
    await first.tick();
    assert.equal((await trackOf(first, made.conditionId)).pending_update?.guard_verdict, "pass");
    const fetchesBefore = first.fetched.filter((url) => url === market.suggestion?.uri).length;
    assert.ok(fetchesBefore >= 1);
    await first.crash();

    const second = await startCreationRig(mock, { dir: first.temp, files: first.files, createOptions: alive });
    // The suggestion is no longer served: if the relay needed it again it would see a 404 and lose the verdict.
    second.files.delete(market.suggestion.uri);
    await mock.advance(120);
    await second.tick();
    const view = await trackOf(second, made.conditionId);
    assert.equal(view.status, "update_required");
    assert.equal(view.pending_update?.guard_verdict, "pass", "the verdict survived the restart");
    assert.equal(second.fetched.filter((url) => url === market.suggestion?.uri).length, 0, "the suggested file was not fetched again");
    const accept = ok(await second.post("/v1/userop/prepare", { owner: made.alice.address, action: "respond_update", params: { condition_id: made.conditionId as `0x${string}`, accept: true } }));
    assert.equal(accept.kind, "create");
  });

  harness.it("after a send whose answer was lost: the restart keeps it ambiguous, never sends it again, and the tick finds the market", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 3600, metadataUpdate: false };
    const { alice } = await readyOwner(mock, 3);
    const hide = { on: true };
    const wrap = (inner: typeof fetch): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const body = typeof init?.body === "string" ? init.body : "";
        if (url.startsWith("https://mainnet-bundler.xo.market") && body.includes("eth_getUserOperationReceipt")) throw new TypeError("fetch failed");
        if (url.startsWith("https://explorer-mainnet.xo.market") && hide.on && url.includes("topic0")) {
          return new Response(JSON.stringify({ status: "0", message: "No logs found", result: [] }), { status: 200, headers: { "content-type": "application/json" } });
        }
        const response = await inner(input, init);
        if (url.startsWith("https://mainnet-bundler.xo.market") && body.includes("eth_sendUserOperation")) {
          await response.text();
          throw new TypeError("fetch failed");
        }
        return response;
      }) as typeof fetch;
    const first = await startCreationRig(mock, { wrapFetch: wrap });
    const file = buildFile(mock);
    first.files.set(HOSTED_URI, hostedText(file.metadata));
    const prepared = ok(await first.post("/v1/userop/prepare", createBody(alice.address, file)));
    assert.equal(ok(await first.post("/v1/userop/submit", { prepared_id: prepared.prepared_id, signature: await signPrepared(alice, prepared.sign, "raw") })).state, "ambiguous");
    await first.crash();

    const second = await startCreationRig(mock, { dir: first.temp, files: first.files, wrapFetch: wrap, createOptions: alive });
    assert.equal(second.relay.services.prepared.require(prepared.prepared_id).state, "ambiguous");
    assert.equal(failed(await second.post("/v1/userop/prepare", createBody(alice.address, file))).code, "ambiguous");
    assert.equal(mock.creation.markets.size, 1);
    hide.on = false;
    const report = await second.creation.tick();
    assert.equal(report?.started.length, 1);
    assert.equal(mock.creation.markets.size, 1, "still the one creation");
  });

  harness.it("an unreadable explorer backs off and loses nothing; the next good look catches up", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 300, metadataUpdate: false };
    await readyOwner(mock, 3);
    const down = { on: false };
    const wrap = (inner: typeof fetch): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (down.on && url.startsWith("https://explorer-mainnet.xo.market")) return new Response("bad gateway", { status: 502 });
        return inner(input, init);
      }) as typeof fetch;
    const rig = await startCreationRig(mock, { wrapFetch: wrap });
    const made = await createMarket(rig, 3);
    await mock.advance(400);
    down.on = true;
    await rig.tick();
    const doc = () => rig.relay.services.state.get("watchers", `market:${made.conditionId}`) as unknown as { failures: number; nextDueS: number; state: { phase: string } };
    assert.equal(doc().failures, 1);
    assert.equal(doc().state.phase, "pending", "nothing was concluded from a failed read");
    assert.ok(doc().nextDueS > Math.floor(mock.clock.nowMs() / 1000), "the next look is later");
    down.on = false;
    await mock.advance(120);
    await rig.tick();
    assert.equal(doc().failures, 0);
    assert.equal(doc().state.phase, "active");
  });

  harness.it("a market of an account this relay has never served is answered once and not kept", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 300, metadataUpdate: false };
    await readyOwner(mock, 3);
    const first = await startCreationRig(mock);
    const made = await createMarket(first, 3);
    await first.stop();
    const stranger = await startCreationRig(mock);
    const view = await trackOf(stranger, made.conditionId);
    assert.equal(view.status, "pending");
    assert.ok(view.timeline.some((entry) => entry.event === "market_created"));
    assert.equal(stranger.relay.services.state.keys("watchers").filter((key) => key.startsWith("market:")).length, 0, "nothing stored for a market asked about by anyone");
    // It cannot be answered for either: the relay does not know its creator.
    assert.equal(failed(await stranger.post("/v1/userop/prepare", { owner: made.alice.address, action: "cancel_market", params: { condition_id: made.conditionId as `0x${string}` } })).code, "not_found");
  });

  harness.it("the loop resumes by itself on attach and keeps looking on its own period", async (mock) => {
    mock.setProfile("optimistic");
    mock.creation.policy = { decision: "approve", reviewDelayS: 600, metadataUpdate: false };
    await readyOwner(mock, 3);
    const first = await startCreationRig(mock);
    const made = await createMarket(first, 3);
    await first.crash();
    await mock.advance(700);
    // Nobody calls tick(): attach() starts the loop, and its first run is immediate.
    const second = await startCreationRig(mock, { dir: first.temp, files: first.files, intervalMs: 25, createOptions: alive });
    const doc = (): { state: { phase: string } } => second.relay.services.state.get("watchers", `market:${made.conditionId}`) as unknown as { state: { phase: string } };
    assert.ok(await eventually(() => doc().state.phase === "active", 4000), "the loop moved the market to active without being asked");
    void ownerOf;
  });
});
