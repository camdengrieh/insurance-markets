import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { registerTradeTools } from "../src/tools/trade.js";
import type { RelayToolDeps } from "../src/tools/relay-tool-kit.js";
import { loadConfig } from "../src/config.js";
import { ENV_ON, closeAll, connect, must } from "./tools-helpers.js";
import { TOKEN_ID, cleanup, startRig, type Rig } from "./relay-orders-helpers.js";

// xo_prepare_order against the REAL in-process relay (no stub), both sides. The stub relay in
// tools-trade.test.ts answers a SELL with a non-zero max_outlay_usd, which the real relay never does.

afterEach(closeAll);

const rigs: Rig[] = [];
afterEach(async () => {
  await cleanup(rigs.splice(0));
});

async function setup(): Promise<{ rig: Rig; call: (args: Record<string, unknown>) => ReturnType<Awaited<ReturnType<typeof connect>>["call"]> }> {
  const rig = await startRig();
  rigs.push(rig);
  const loaded = loadConfig(ENV_ON);
  const deps: RelayToolDeps = {
    nowMs: rig.clock.now,
    config: () => loaded.config,
    env: () => ENV_ON,
    relay: () => rig.client,
    audit: { write: () => undefined },
  };
  const harness = await connect((server) => registerTradeTools(server, deps));
  return { rig, call: (args) => harness.call("xo_prepare_order", { owner: rig.owner.address, token_id: TOKEN_ID, price: "0.5", shares: "10", ...args }) };
}

describe("xo_prepare_order through the real relay", () => {
  it("prepares a BUY", async () => {
    const { call } = await setup();
    const result = await call({ side: "BUY" });
    assert.equal(result.isError, false, result.text);
    assert.equal(must(result.structured)["outcome"], "prepared");
  });

  it("prepares a SELL: the quote's max outlay of 0 (no cash leaves the account) is not a cap breach", async () => {
    const { call } = await setup();
    const result = await call({ side: "SELL" });
    assert.equal(result.isError, false, result.text);
    assert.equal(must(result.structured)["outcome"], "prepared");
  });

  it("still refuses a SELL whose proceeds the relay reserves above the per-order cap", async () => {
    const { call } = await setup();
    const result = await call({ side: "SELL", price: "0.9", shares: "20" });
    assert.equal(result.isError, true, result.text);
    assert.equal(must(result.structured)["code"], "cap_exceeded");
  });
});
