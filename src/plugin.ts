import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { registerAccountTools } from "./tools/account.js";
import { registerCreateTools } from "./tools/create.js";
import { registerDraftTools } from "./tools/draft.js";
import { registerFundTools } from "./tools/fund.js";
import { registerPmTools } from "../pm/tools/index.js";
import { registerReadTools } from "./tools/read.js";
import { registerTradeTools } from "./tools/trade.js";
import { registerUseropTools } from "./tools/userop.js";

const PROTOCOL_VERSION = "2026-07-28";

// No network or heavy work here or at import time: tools/list must answer with an empty env.
function createServer() {
  const server = new McpServer(
    { name: "xo-market", version: "0.1.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );

  registerReadTools(server);
  // Also the offline conformance sample (paybox-plugin.json): it needs no network and always succeeds.
  registerDraftTools(server);
  // v0.2 and v0.3 tools. Every write tool talks to the relay through the RelayClient interface and
  // never to XO. account.ts has xo_account (rewritten: it takes the owner), xo_connect and xo_get_prepared (R9, registered
  // from there so that this file and src/local/server.ts need no extra call); userop.ts the user-operation tools;
  // trade.ts the order tools; fund.ts xo_fund_account and xo_withdraw.
  // Each name is registered exactly once: a duplicate makes the server throw at startup.
  registerAccountTools(server);
  registerPmTools(server);
  // The hosted runner caps tools/list output at 256 KiB (stdout). All 36 tools are about 268 KiB, so the
  // write tools, which are useless without a reachable relay anyway, are registered only when the deployer
  // points the bundle at one (XO_RELAY_URL). The local server (src/local/server.ts) always registers them.
  if (process.env.XO_RELAY_URL) {
    registerUseropTools(server);
    registerTradeTools(server);
    registerFundTools(server);
    registerCreateTools(server);
  }

  return server;
}

// Unconditional, like the starter: the hosted runner starts the bundle as a script. Tests must
// import the register modules directly, never this file, or they would start a stdio server.
serveStdio(createServer, { legacy: "reject" });
