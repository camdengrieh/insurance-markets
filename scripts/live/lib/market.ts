import { XoClient } from "../../../src/xo/client.js";
import { XO_PLUGIN_HOSTS } from "../../../src/xo/http.js";
import { RELAY_USER_AGENT } from "../../../src/relay/contract.js";
import type { RunContext } from "./types.js";

// Public XO reads for the tests that look at a market (the book, the fee figure), through the run's own
// transport: printed first, the pinned user agent, XO's hosts only. A fresh client per read, so each gets
// its own request budget.
export function xoClientFor(ctx: RunContext): XoClient {
  return new XoClient({ allowedHosts: XO_PLUGIN_HOSTS, userAgent: RELAY_USER_AGENT, fetchImpl: ctx.net.fetch, totalBudgetMs: 20_000 });
}
