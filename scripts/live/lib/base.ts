import { BaseRpc, DEFAULT_BASE_RPC_URL } from "../../../src/xo/funding/preflight.js";
import { createBaseRpcTransport } from "../../../src/tools/fund.js";
import type { RunContext } from "./types.js";

// Read-only access to the Base node for tests that watch Base (a deposit leaving, a withdrawal arriving).
// Every request goes through the run's own transport, so it is printed first, carries the pinned
// user agent, and is paced like the plugin's own Base reads (4 a second; none on the mock).

export function baseRpcFor(ctx: RunContext): BaseRpc {
  const url = ctx.env["XO_BASE_RPC_URL"] !== undefined && ctx.env["XO_BASE_RPC_URL"] !== "" ? (ctx.env["XO_BASE_RPC_URL"] as string) : DEFAULT_BASE_RPC_URL;
  const transport = createBaseRpcTransport({
    fetchImpl: ctx.net.fetch,
    nowMs: () => ctx.clock.nowMs(),
    ...(ctx.target === "mock" ? { minIntervalMs: 0 } : {}),
  });
  return new BaseRpc({ transport, url });
}
