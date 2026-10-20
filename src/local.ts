import { runCli } from "./local/cli.js";

// Entry point of dist/local.mjs (built by `pnpm build:local`): the XO tools as a stdio MCP server on
// the user's own machine, with the relay running inside the same process. Not the PayBox sandbox
// bundle (dist/plugin.mjs): this one reads and writes files in the user's data directory.
const code = await runCli(process.argv.slice(2));
if (code !== undefined) process.exitCode = code;
