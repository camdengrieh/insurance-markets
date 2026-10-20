import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { describe } from "node:test";

import { getJson, useMock } from "./testing.js";
import type { MockXo } from "./server.js";
import { createCredentials, setupTrader, traderFor } from "./traders.js";

// The control listener's write-side routes, for a mock that runs as a program and has no test code beside it.

const harness = useMock({ chains: { xo: true, base: false } });
const post = (mock: MockXo, path: string, payload: unknown) => getJson(mock, "control", path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

describe("control: provision, register, fund, creation policy, inclusion delay", () => {
  harness.it("provision makes the bundler treat an account as XO's own; register and fund set up the orderbook side", async (mock) => {
    const trader = traderFor(mock, 2);
    assert.equal(mock.state.provisioned.has(trader.key), false);
    assert.equal((await post(mock, "/provision", { address: trader.account })).status, 200);
    assert.equal(mock.state.provisioned.has(trader.key), true);
    assert.equal((await post(mock, "/register", { address: trader.account })).status, 200);
    assert.equal(mock.state.forcedRegistered.has(trader.key), true);
    assert.equal((await post(mock, "/fund", { address: trader.account, micro: "25000000" })).status, 200);
    const balance = (await getJson(mock, "orderbook", `/balance-allowance?address=${trader.account}`)).body as { balance: string; allowance: string; smart_account: string };
    assert.deepEqual(balance, { balance: "25000000", allowance: "25000000", smart_account: trader.key });
    for (const [path, payload] of [["/provision", { address: "0x12" }], ["/register", {}], ["/fund", { address: trader.account, micro: "-1" }], ["/fund", { address: trader.account, micro: 5 }]] as const) {
      assert.equal((await post(mock, path, payload)).status, 400, `${path} ${JSON.stringify(payload)}`);
    }
  });

  harness.it("creation sets the oracle's policy for the next markets and refuses what is not a policy", async (mock) => {
    const ok = await post(mock, "/creation", { decision: "update", reviewDelayS: 90, windowS: 1200, changeExpiry: true, metadataUpdate: false, notes: "hello" });
    assert.equal(ok.status, 200);
    assert.deepEqual(mock.creation.policy, { decision: "update", reviewDelayS: 90, windowS: 1200, changeExpiry: true, metadataUpdate: false, notes: "hello" });
    for (const payload of [{ decision: "maybe" }, { reviewDelayS: -1 }, { windowS: "5" }, { changeExpiry: "yes" }, { notes: 5 }, []]) {
      assert.equal((await post(mock, "/creation", payload)).status, 400, JSON.stringify(payload));
    }
    assert.equal(mock.creation.policy.decision, "update", "a refused policy changes nothing");
  });

  harness.it("inclusion-delay sets the seconds a sent UserOp waits", async (mock) => {
    assert.equal((await post(mock, "/inclusion-delay", { seconds: 6 })).status, 200);
    assert.equal(mock.userops.inclusionDelaySeconds, 6);
    assert.equal((await post(mock, "/inclusion-delay", { seconds: -1 })).status, 400);
    assert.equal(mock.userops.inclusionDelaySeconds, 6);
  });

  harness.it("state reports what the write mock holds, and the routes refuse a foreign Host like every control route", async (mock) => {
    mock.setProfile("optimistic");
    const trader = await setupTrader(mock, 2);
    await createCredentials(mock, trader);
    const state = (await getJson(mock, "control", "/state")).body as { scheduled: number; implementation: Record<string, string> };
    assert.equal(typeof state.scheduled, "number");
    assert.equal(Object.values(state.implementation).filter((value) => value === "mock-write").length, 27);
    const send = (headers: Record<string, string>): Promise<number> =>
      new Promise((resolve, reject) => {
        const req = httpRequest({ host: "127.0.0.1", port: mock.ports.control, path: "/provision", method: "POST", headers: { "content-type": "application/json", ...headers } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end(JSON.stringify({ address: trader.account }));
      });
    assert.equal(await send({ host: "evil.example" }), 403);
    assert.equal(await send({ host: `127.0.0.1:${String(mock.ports.control)}`, origin: "https://evil.example" }), 403);
    assert.equal(await send({ host: `127.0.0.1:${String(mock.ports.control)}` }), 200);
  });
});
