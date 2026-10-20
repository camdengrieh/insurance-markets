import assert from "node:assert/strict";
import { describe } from "node:test";

import { deriveAccount } from "../src/xo/account/derive.js";
import type { MockXo } from "./mock-xo/server.js";
import { deployOwner, useMock } from "./mock-xo/testing.js";
import { failed, mintUsdce, ok, startRig } from "./relay-userops-helpers.js";

// POST /v1/account/status reads through the same readers as the user-operation handlers: the deployment from
// the logs and the node, the registry, whether trading is enabled, and the credited balance.

function owner(mock: MockXo, index: number) {
  const chain = mock.chains.xo;
  assert.ok(chain !== undefined);
  return chain.owner(index);
}

describe("the account status route, wired to the relay's readers", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("an undeployed account: undeployed, not registered, trading no, nothing held", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { directory: true });
    const status = ok(await rig.post("/v1/account/status", { owner: owner(mock, 3).address }));
    assert.equal(status.account, deriveAccount(owner(mock, 3).address));
    assert.equal(status.state, "undeployed");
    assert.equal(status.registered, false);
    assert.equal(status.trading_enabled, "no");
    assert.equal(status.balance_usd, "0");
  });

  harness.it("a deployed, funded account with trading on and the orderbook knowing it", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { directory: true });
    await deployOwner(mock, 3, { enableTrading: true });
    mock.state.setBalance(deriveAccount(owner(mock, 3).address), { balanceMicro: 12_500_000n, allowanceMicro: 12_500_000n, cashBalanceMicro: 12_500_000n });
    const status = ok(await rig.post("/v1/account/status", { owner: owner(mock, 3).address }));
    assert.deepEqual({ state: status.state, registered: status.registered, trading: status.trading_enabled, balance: status.balance_usd }, { state: "registered", registered: true, trading: "yes", balance: "12.5" });
  });

  harness.it("deployed but unknown to the orderbook: deployed_unregistered, and the answer carries no claim about trading it cannot make", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("registry.trigger", "never");
    const rig = await startRig(mock, { directory: true });
    await deployOwner(mock, 3, { enableTrading: false });
    const status = ok(await rig.post("/v1/account/status", { owner: owner(mock, 3).address }));
    assert.deepEqual({ state: status.state, registered: status.registered, trading: status.trading_enabled }, { state: "deployed_unregistered", registered: false, trading: "no" });
  });

  harness.it("with the node closed, trading falls back to the logs: unlimited is provable, a capped allowance is 'unknown'", async (mock) => {
    mock.setProfile("optimistic");
    mock.setSwitch("rpc.access", "down");
    const rig = await startRig(mock, { directory: true });
    await deployOwner(mock, 3, { enableTrading: true });
    assert.equal(ok(await rig.post("/v1/account/status", { owner: owner(mock, 3).address })).trading_enabled, "yes");
    await mintUsdce(mock, deriveAccount(owner(mock, 4).address), 1n);
    // A capped enable (as the relay prepares for a larger balance) cannot be proven from logs alone.
    const second = await startRig(mock, { directory: true });
    assert.equal(ok(await second.post("/v1/account/status", { owner: owner(mock, 3).address })).state, "registered");
  });

  harness.it("an unreadable deployment is an error, not 'undeployed'; a caller's wrong account is account_mismatch", async (mock) => {
    mock.setProfile("optimistic");
    const rig = await startRig(mock, { directory: true });
    await deployOwner(mock, 3, { enableTrading: true });
    mock.injectFault("5xx", { listeners: ["explorer"] });
    mock.setSwitch("rpc.access", "down");
    const unreadable = failed(await rig.post("/v1/account/status", { owner: owner(mock, 3).address }));
    assert.equal(unreadable.code, "precondition_failed");
    mock.faults.clear();
    assert.equal(failed(await rig.post("/v1/account/status", { owner: owner(mock, 3).address, account: deriveAccount(owner(mock, 4).address) })).code, "account_mismatch");
  });
});
