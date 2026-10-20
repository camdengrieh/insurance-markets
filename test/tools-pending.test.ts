import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { POST_ROUTES } from "../src/relay/contract.js";
import { registerAccountTools } from "../src/tools/account.js";
import { registerTradeTools } from "../src/tools/trade.js";
import { registerUseropTools } from "../src/tools/userop.js";
import { OWNER, StubRelay, closeAll, connect, fail, makeDeps, type Obj } from "./tools-helpers.js";

// A relay that answers `pending` (it took longer than its own budget) is not an error: the tool says so with
// outcome "pending" and isError false, and the MCP layer then validates that result against the tool's output
// schema. A schema without "pending" turns the answer into "Output validation error" (found by a run of
// scripts/call.mjs against a slow relay). Each tool below must accept it.

afterEach(closeAll);

const HASH = `0x${"11".repeat(32)}`;
const PREPARED_ID = "0".repeat(32);

function pendingRelay(): StubRelay {
  const relay = new StubRelay();
  for (const path of Object.keys(POST_ROUTES)) relay.on(`POST ${path}`, fail("pending", "still working"));
  relay.on("GET /v1/userop/:hash", fail("pending", "still working"));
  relay.on("GET /v1/order/:hash", fail("pending", "still working"));
  return relay;
}

const CASES: ReadonlyArray<{ readonly tool: string; readonly args: Obj }> = [
  { tool: "xo_connect", args: { step: "prepare", owner: OWNER } },
  { tool: "xo_deploy_enable_trading", args: { step: "prepare", owner: OWNER } },
  { tool: "xo_revoke_trading", args: { step: "prepare", owner: OWNER } },
  { tool: "xo_redeem", args: { step: "prepare", owner: OWNER, condition_ids: [HASH] } },
  { tool: "xo_submit_userop", args: { prepared_id: PREPARED_ID, signature: `0x${"22".repeat(65)}` } },
];

// A read that the relay did not finish is an ordinary refusal (isError true), not a half-valid success.
const READS: ReadonlyArray<{ readonly tool: string; readonly args: Obj }> = [
  { tool: "xo_userop_status", args: { user_op_hash: HASH } },
  { tool: "xo_order_status", args: { order_hash: HASH } },
  { tool: "xo_list_orders", args: { owner: OWNER } },
];

describe("a relay answer of pending is a valid result for every relay tool", () => {
  for (const { tool, args } of CASES) {
    it(`${tool} reports outcome pending and passes its own output schema`, async () => {
      const { deps } = makeDeps({ relay: pendingRelay() });
      const harness = await connect((server) => {
        registerAccountTools(server, { ...deps } as never);
        registerUseropTools(server, deps);
        registerTradeTools(server, deps);
      });
      const result = await harness.call(tool, args);
      assert.doesNotMatch(result.text, /Output validation error/, result.text.slice(0, 300));
      // The userop tools read the account first; when that read is the one left pending it is an ordinary refusal.
      const readFirst = ["xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem"].includes(tool);
      assert.ok(result.structured?.["outcome"] === "pending" || (readFirst && result.structured?.["outcome"] === "refused"), result.text.slice(0, 300));
      assert.equal(result.isError, result.structured?.["outcome"] !== "pending");
    });
  }

  for (const { tool, args } of READS) {
    it(`${tool}: a read that did not finish is refused with code pending, never an output validation error`, async () => {
      const { deps } = makeDeps({ relay: pendingRelay() });
      const harness = await connect((server) => {
        registerUseropTools(server, deps);
        registerTradeTools(server, deps);
      });
      const result = await harness.call(tool, args);
      assert.doesNotMatch(result.text, /Output validation error/, result.text.slice(0, 300));
      assert.equal(result.isError, true);
      assert.equal(result.structured?.["code"], "pending");
      assert.equal(result.structured?.["outcome"], "refused");
    });
  }
});
