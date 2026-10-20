import { runShimCli } from "../../shim.js";

// Launcher for the stdio test only: what `node dist/local.mjs shim` will do once the CLI wires it. It never starts a
// relay or a daemon. Exits when the MCP client closes stdin.
const outcome = await runShimCli(process.argv.slice(2));
if ("exit" in outcome) {
  process.exit(outcome.exit);
} else {
  process.stdin.once("end", () => {
    void outcome.handle.close().finally(() => process.exit(0));
  });
}
