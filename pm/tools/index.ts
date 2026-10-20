// The pm_* MCP tools: a read-only signal and alert layer over the aggregation code in pm/.
//
//   registerPmTools(server)       production wiring (a later step calls it from src/plugin.ts; see pm/WIRING.md)
//   registerPmToolsWith(s, deps)  the same with injected dependencies, for tests
//
// No tool places an order, signs, pays or writes to disk. Registering touches no network and does no
// work, so tools/list answers with an empty environment. Each name is registered exactly once: a
// duplicate would make the server throw at startup.

import { registerListVenues, LIST_VENUES_TOOL } from "./venues.js";
import { registerMarketTools, COMPARE_TOOL, LOOKUP_TOOL, QUOTE_TOOL, VERIFY_TOOL } from "./market.js";
import { registerSignalTools, SIGNAL_PARSE_TOOL, SIGNAL_REQUEST_TOOL } from "./signals.js";
import { registerStructureTool, STRUCTURE_TOOL } from "./structure.js";
import { defaultPmToolDeps, type PmToolDeps, type PmToolServer } from "./common.js";

export const PM_TOOL_NAMES = [
  LIST_VENUES_TOOL,
  QUOTE_TOOL,
  LOOKUP_TOOL,
  VERIFY_TOOL,
  COMPARE_TOOL,
  STRUCTURE_TOOL,
  SIGNAL_REQUEST_TOOL,
  SIGNAL_PARSE_TOOL,
] as const;

export function registerPmToolsWith(server: PmToolServer, deps: PmToolDeps): void {
  registerListVenues(server, deps);
  registerMarketTools(server, deps);
  registerStructureTool(server, deps);
  // Off by default behind PM_QUOTIENT: registered always, they answer with the terms clause until enabled.
  registerSignalTools(server, deps);
}

export function registerPmTools(server: PmToolServer): void {
  registerPmToolsWith(server, defaultPmToolDeps());
}

export { defaultPmToolDeps };
export type { PmToolDeps, PmAdapters } from "./common.js";
