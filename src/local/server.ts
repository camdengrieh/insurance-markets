import { McpServer } from "@modelcontextprotocol/server";

import { registerAccountTools } from "../tools/account.js";
import { registerClobTools } from "../tools/clob.js";
import { registerCreateTools } from "../tools/create.js";
import { registerDraftTools } from "../tools/draft.js";
import { registerFundTools } from "../tools/fund.js";
import { registerPmTools } from "../../pm/tools/index.js";
import { registerReadTools } from "../tools/read.js";
import { registerTradeTools } from "../tools/trade.js";
import { registerUseropTools } from "../tools/userop.js";
import { LOCAL_VERSION } from "./runtime.js";

// The same tools as dist/plugin.mjs, registered the same way, for a long-running stdio server that a
// desktop MCP client starts. Differences from src/plugin.ts, all deliberate:
//   - no protocol-version restriction: Claude Code, Claude Desktop and other clients open with the
//     standard `initialize` handshake, which the server also answers (the hosted runner speaks the
//     newer stateless form, and so can this one);
//   - the relay behind the write tools is the in-process one (src/local.ts calls useEmbeddedRelay
//     before the first request), so no tool reads XO_RELAY_URL or XO_RELAY_KEY.
// Registering makes no network call and reads no file; tools/list answers with an empty environment.
export function createLocalMcpServer(): McpServer {
  const server = new McpServer({ name: "xo-market", version: LOCAL_VERSION });
  registerReadTools(server);
  registerDraftTools(server);
  registerAccountTools(server);
  registerUseropTools(server);
  registerTradeTools(server);
  registerFundTools(server);
  registerCreateTools(server);
  registerClobTools(server);
  registerPmTools(server);
  return server;
}
