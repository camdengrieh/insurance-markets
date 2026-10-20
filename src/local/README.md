# Local mode: the XO tools on your own machine

`dist/local.mjs` is the same tool set as the hosted plugin (`dist/plugin.mjs`), started by your MCP client
as a normal stdio server. The relay (credentials, daily caps, the single-send rule, the audit log) runs
inside the same process. There is no server to run, no relay key, no operator, and nobody else holds your
credentials. Each person has their own data directory, ledger and caps.

Writes are off until you turn a path on. The caps below bind this plugin and its relay only: against a
compromised or prompt-injected agent they are advisory, because such an agent can ask your wallet MCP to
sign directly. Use a dedicated PayBox credential as the XO owner, put only what you can afford to lose
behind it, and prefer approval-gated signing, the only mode in which a human sees each signature.

## Start it

You need Node 24 and pnpm 11 (`corepack enable` gives you the pinned pnpm).

```sh
git clone <this repository> && cd insurance-markets
pnpm install --frozen-lockfile
pnpm build:local
node dist/local.mjs check          # shows what would be used; creates and opens nothing
```

Register it with your MCP client. Claude Code:

```sh
claude mcp add xo-market -- node "$(pwd)/dist/local.mjs"
```

Any other client: command `node`, arguments `["/absolute/path/to/insurance-markets/dist/local.mjs"]`
(Claude Desktop: the `mcpServers` entry of its config file). The server prints one block on stderr at
start: the data directory, where the master key comes from, which write paths are on, the caps and the
safety notices.

Try it without a client: `node scripts/call-local.mjs --list` (stripped environment, throwaway data
directory) or `node scripts/call-local.mjs xo_order_status '{"order_hash":"0x..."}'`.

## Settings (environment variables)

| Variable | Meaning | Default |
|---|---|---|
| `XO_DATA_DIR` | State directory, an absolute path (or `~/...`) | `~/Library/Application Support/xo-market-plugin` on macOS, `$XDG_DATA_HOME/xo-market-plugin` (or `~/.local/share/...`) on Linux, `%LOCALAPPDATA%\xo-market-plugin` on Windows |
| `XO_MASTER_KEY` | Master key of the credential store, 16 to 1024 characters | a random key in `master.key` inside the data directory |
| `XO_OWNER` | The wallet address(es) this process serves, comma separated | the first wallet whose signature is accepted |
| `XO_ALLOW_ANY_OWNER=1` | Serve any wallet (each one is kept apart) | off |
| `ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING`, `ENABLE_FUNDING`, `ENABLE_WITHDRAW`, `XO_ENABLE_CREATE` | Write paths | all off |
| `XO_KILL_SWITCH=1` | Refuse every write | off |
| `XO_MAX_ORDER_USD`, `XO_MAX_DAILY_USD` | Caps per order and per day, per account | 10 and 50 |
| `RELAY_ARM=ENABLE_TRADING,...` | Let a write path run before its live-test result is recorded (your own first test) | none |

A write path needs its `ENABLE_*` switch and either a recorded live-test result or `RELAY_ARM` naming
it. Nothing has been proven against XO's off-chain services yet (the phase 0 gates are open), so a first
use is a test: start with a small amount.

## What is on disk

Everything is under the data directory, created `0700`, files `0600`: the credential vault
(`secrets/`, AES-256-GCM, one sealed file per account, with an encrypted backup written first), the
ledger, prepared items and capability facts (`journal.log`, compacted into a snapshot), and the audit log
(`logs/audit.log`, no secret, addresses shortened). A second process on the same directory cannot write: it says so, still
lists the tools, and leaves the first untouched. If no other session is open, `store.lock` in the data
directory is a leftover of a crash (its process number may now belong to an unrelated program): delete that
one file. Do not give a second session its own `XO_DATA_DIR`: the caps and the stored XO credential would
be split, and a second XO API key would be created for the same account.

## The master key

With no `XO_MASTER_KEY`, 32 random bytes are generated once and kept in `master.key` (`0600`, never
printed, never logged). That protects the vault against someone who only gets a copy of the files (a
backup, a synced folder). It does not protect against malware or another process running as you, which can
read the key file as easily as this process can. The stronger setup is `XO_MASTER_KEY` from your OS
keychain or a secrets manager, injected when the client starts the server. A new key is never generated
while sealed credentials exist (it could not open them): restore `master.key` or set the key you used.

Rotate with the server stopped: `node dist/local.mjs rotate-master-key` (with a key file it makes a new
random one; with `XO_MASTER_KEY` set, give the new value as `XO_MASTER_KEY_NEXT`, then switch
`XO_MASTER_KEY` to it). A rotation cut short is repaired at the next start.

## The Cockpit daemon, the shim and the kill switch

`node dist/local.mjs serve [--port N] [--agent-scope read,prepare[,submit]] [--rotate-agent-token] [--app-dir <abs>]`
runs the Cockpit (a loopback web page, a read proxy and a signing inbox) on the same runtime, in the same
process, instead of serving MCP on stdio. Its operator guide is `docs/dapp-runbook.md`. It listens on
`127.0.0.1` only, prints the pairing link and a one-time agent token on stderr, and writes nothing to stdout.

`node dist/local.mjs shim [--data-dir <abs>] [--url http://127.0.0.1:<port>] [--token-file <path>] [--check]` is the
stdio MCP server to point an agent host at when the daemon owns the data directory: it forwards every tool call to the
running daemon with the agent token and holds no relay, ledger or key of its own. With no daemon it says so and
answers every call with an error; it never starts a relay. The token comes from a mode-600 file
(`XO_COCKPIT_AGENT_TOKEN_FILE`) or `XO_COCKPIT_AGENT_TOKEN`, never from the command line.

`kill -USR2 <pid>` engages the one-way kill switch of a running process in both the stdio and the `serve` mode (not
on Windows); the Cockpit's kill button does the same. Only a restart lifts it. The bridge tests run with
`pnpm unit:bridge`; the Cockpit page's with `pnpm --dir app run test`.

## How it relates to the hosted mode

One codebase, two modes. Both register the same tools (`test/local-bundle.test.ts` compares the lists).
The hosted plugin talks to a relay by URL and keeps no state; this one embeds the relay
(`relay/embedded.ts`) and calls its route pipeline as a function, so every rule, flag, error code and
audit line is the relay's own (`test/local-parity.test.ts` runs the same requests through the HTTP relay
and the embedded one). Nothing in the hosted plugin's import graph reaches this directory or `relay/`.
