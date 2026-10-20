import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { Principal } from "../../auth.js";
import { armControllerOf } from "../../arming.js";
import { killControllerOf } from "../../kill.js";
import { toolGateOf } from "../../tool-classes.js";
import { PayboxSigningPath } from "../../paybox-signer.js";
import { startGateDaemon } from "../tools/helpers.js";
import { ID_USEROP, FakeClient, deployItem } from "./fixtures.js";
import { errorOf, startSignerRig, type SignerRig } from "./rig.js";

// Defence in depth (review finding TM-10). The class guard stands in front of the sign route and answers first for a
// missing scope, a read-only instance, a kill and a closed window, so route.test.ts never reaches the copies of those
// checks inside the route. Here the guard is left out and the route has to refuse by itself; the tool gate's own
// read-only check is tested with a principal that carries a scope it should not have.

const rigs: SignerRig[] = [];
afterEach(async () => {
  while (rigs.length > 0) await rigs.pop()?.stop();
});

async function unguarded(): Promise<{ readonly rig: SignerRig; readonly client: FakeClient }> {
  const client = new FakeClient();
  const rig = await startSignerRig({ withoutClassGuard: true, signer: { path: new PayboxSigningPath(client) } });
  rigs.push(rig);
  return { rig, client };
}

describe("the sign route repeats its own gates when no class guard is in front of it (TM-10)", () => {
  it("there is no class guard in this rig: the route table has no /ui/tool", async () => {
    const { rig } = await unguarded();
    assert.equal(rig.d.daemon.host.routes().some((route) => route.key === "POST /ui/tool"), false);
  });

  it("refuses with not_armed when the window is closed, and PayBox is never asked", async () => {
    const { rig, client } = await unguarded();
    rig.show(deployItem());
    const reply = await rig.sign(ID_USEROP);
    assert.equal(reply.status, 403);
    assert.equal(errorOf(reply).code, "not_armed");
    assert.equal(client.signCalls.length, 0);
    assert.equal(rig.submit.requests.length, 0);
  });

  it("refuses with kill_switch when the kill is engaged, before it looks at the window", async () => {
    const { rig, client } = await unguarded();
    rig.show(deployItem());
    await rig.armed();
    assert.equal(armControllerOf(rig.d.daemon.host).isArmed(), true);
    await killControllerOf(rig.d.daemon.host).engage("test");
    const reply = await rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).code, "kill_switch");
    assert.equal(client.signCalls.length, 0);
    assert.equal(rig.submit.requests.length, 0);
  });

  it("refuses an item that is not in the shown state by itself", async () => {
    const { rig, client } = await unguarded();
    rig.ingestOnly(deployItem());
    await rig.armed();
    const reply = await rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).details?.["reason"], "bad_state");
    assert.equal(client.signCalls.length, 0);
  });

  it("refuses an item the daemon cannot verify by itself", async () => {
    const { rig, client } = await unguarded();
    const bare = structuredClone(deployItem());
    delete bare["decoded"];
    delete (bare["summary"] as Record<string, unknown>)["inner_hash_tag"];
    delete (bare["summary"] as Record<string, unknown>)["inner_hash_kind"];
    rig.show(bare);
    assert.equal(rig.inbox.verificationOf(ID_USEROP)?.status, "unverified");
    await rig.armed();
    const reply = await rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).details?.["reason"], "not_verified");
    assert.equal(client.signCalls.length, 0);
  });
});

describe("the tool gate refuses a prepare or submit call on a read-only instance by itself (TM-10)", () => {
  it("even for a principal that wrongly carries the scope", async () => {
    const d = await startGateDaemon({ env: { ENABLE_TRADING: "1" }, role: "read_only" });
    try {
      const forged: Principal = { kind: "agent", id: "0a1b2c3d", scopes: ["read", "prepare", "submit"], requestedBy: "agent:0a1b2c3d" };
      const gate = toolGateOf(d.daemon.host);
      for (const [tool, args] of [
        ["xo_prepare_order", {}],
        ["xo_submit_order", { prepared_id: "ab".repeat(16) }],
      ] as const) {
        const admission = gate.admit(forged, tool, args);
        assert.equal(admission.ok, false, tool);
        if (!admission.ok) {
          assert.equal(admission.failure.code, "scope_denied", tool);
          assert.match(admission.failure.message, /reads only/);
        }
      }
      assert.equal(d.runner.calls.length, 0);
    } finally {
      await d.stop();
    }
  });
});
