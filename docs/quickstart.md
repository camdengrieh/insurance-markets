# Quickstart

Copy-paste steps to build the XO Market tools from source, add them to an MCP client, pair them with PayBox, and (optionally, later) run the live tests. Written for someone who has never seen this project. Read [README.md](../README.md) first for what is and is not working.

**Status of each step (2026-10-19).** Steps 1 to 4 and the read tools work today, and local mode (`pnpm build:local`, `src/local/README.md`) and the live-test runbook (`docs/runbook.md`) exist. Local mode has been exercised only against a local mock and a local test chain, not under a real MCP client. Nothing in the write path has been run against the real XO service ([docs/phase1-gap-closing.md](phase1-gap-closing.md) section 0 and section 6).

Paths below use `<path-to>` for wherever you put the repository and `<path-to-data-dir>` for a private directory you choose for local state. Replace them; do not put either inside the repository.

## 1. Install the toolchain

The repository needs **Node 24.x** (it is pinned to 24.21.0) and **pnpm 11.11.0** (`package.json` fields `engines` and `packageManager`). Do not use Node 20. The `.tools/env.sh` file in the repository is the author's own pin for one machine and is not part of what you need.

```sh
# Install Node 24.21.0 any way you like (nodejs.org, nvm, fnm, volta), then:
node --version        # expect v24.21.0 (any 24.x works with the engines field)
corepack enable
corepack prepare pnpm@11.11.0 --activate
pnpm --version        # expect 11.11.0
```

Optional, only to run the whole test suite: Foundry (`anvil`, `forge`, `cast`). Tests that need anvil start their own on a free local port and skip with a message if it is missing.

## 2. Get the code and build

```sh
cd <path-to>/insurance-markets
pnpm install --frozen-lockfile     # never plain `pnpm install`: the lockfile is the supply-chain pin
pnpm build                         # writes dist/plugin.mjs (the PayBox-runner bundle; also usable as a stdio MCP server)
```

**Local mode bundle.** The day-zero mode for everyone is `dist/local.mjs`, built from `src/local.ts`, with the relay embedded:

```sh
pnpm build:local                   # writes dist/local.mjs
node dist/local.mjs check          # shows what would be used; creates and opens nothing
```

## 3. Check it

```sh
pnpm test        # typecheck, two builds with a byte-identical check, then the PayBox starter conformance (it discovers the tools)
pnpm unit        # all unit tests, offline (a few use a local anvil if installed)
```

Both run entirely on your machine. Then a read-only smoke test. This one calls XO's public market-data hosts (GET only, no key, no wallet) through the bundle the way PayBox's runner would, with a stripped environment:

```sh
node scripts/call.mjs --list
node scripts/call.mjs xo_search '{"query":"bitcoin","limit":3}'
node scripts/call.mjs pm_list_venues "$(node -e 'process.stdout.write(JSON.stringify(require("./paybox-plugin.json").arguments))')"
```

The last command is the call in `paybox-plugin.json`: `pm_list_venues` with no input. It lists the bundled venue registry (each fact with its source and age) and makes no network request. The search command returns whatever XO's market-data host returns at that moment. Tool inputs and outputs are specified in [tool-contract.md](tool-contract.md).

## 4. Add it to your MCP client

**Start with local mode (the next block, `dist/local.mjs`): it works with ordinary MCP clients such as Claude Code and Claude Desktop.** The bundle below, `dist/plugin.mjs`, is the one PayBox's plugin runner would run (read tools, draft linter, and write tools that talk to a relay by URL). It speaks only protocol version 2026-07-28, which it expects on every request, so a client that sends the usual `initialize` handshake fails to connect (error -32022, "Unsupported protocol version"). Use it only with a client that speaks 2026-07-28:

```json
{
  "mcpServers": {
    "xo-market": {
      "command": "node",
      "args": ["<path-to>/insurance-markets/dist/plugin.mjs"]
    }
  }
}
```

With no further settings the read tools and `xo_validate_market_draft` work; every write tool answers `relay_not_configured` (`src/config.ts`, `src/tools/relay-tool-kit.ts`). The config file location depends on your client.

**Local mode: `dist/local.mjs`.** Register it as a stdio server; no relay key and no relay URL are needed because the relay runs inside the same process. Full settings: [src/local/README.md](../src/local/README.md).

```json
{
  "mcpServers": {
    "xo-market": {
      "command": "node",
      "args": ["<path-to>/insurance-markets/dist/local.mjs"],
      "env": {
        "XO_DATA_DIR": "<path-to-data-dir>"
      }
    }
  }
}
```

- `XO_DATA_DIR` is optional; without it the OS's per-user data location is used. The directory is created mode 0700; an existing directory that others can read is refused.
- **Set `XO_OWNER` to your PayBox wallet's address before you enable funding** (`ENABLE_FUNDING`). Without it the local relay binds to the first wallet whose signature it accepts, and an agent could pick that wallet; funding is refused until an owner is established (`XO_OWNER`, or a first signed action with your wallet). The hosted relay (`pnpm relay`) reads the same variable.
- With no `XO_MASTER_KEY`, a random master key is kept in `master.key` inside the data directory. That protects against copies of the files, not against malware running as you. For more, inject `XO_MASTER_KEY` from your OS keychain or a secrets manager.
- Every write path is off until you set its `ENABLE_*` variable (and either a recorded live-test result or `RELAY_ARM`); see the flags table in section 6.

## 5. Pair it with PayBox

The tools never sign. Your agent needs PayBox's own MCP connector in the same client so it can call `request_wallet_sign` with the instruction a prepare step returns. Follow PayBox's own pages for connecting a client (<https://docs.paybox.sh/connect/mcp>, <https://docs.paybox.sh/connect/oauth>); this project does not call PayBox.

Recommended set-up, in this order:

1. **Make a dedicated PayBox credential for XO.** Its address is the XO account's owner. One approval of an opaque digest can also move that wallet's funds elsewhere, so put only what you can afford to lose behind it ([docs/phase1-gap-closing.md](phase1-gap-closing.md) section 9, amendment A4; open item O1).
2. **Give the agent that credential in approval-gated mode** (the build notes call the modes `iframe` or `always_approve`), not `autonomous`. In approval-gated mode a person sees each signature. Under `autonomous` nothing is shown before PayBox signs, and the plugin's caps do not bind (section 5.2 of the same document, narrowed by A4 to "a cooperative agent"). `autonomous` is acceptable only for a throwaway credential with test amounts (test T0).
3. **Before any funded use, run T0** (section 8 below): it records what PayBox actually does with a bare 32-byte digest and what its approval window shows.
4. **Compare `digest_tag`.** Each prepare step returns a short tag (the first 16 hex digits of the digest). Compare it with what PayBox shows. It guards against accidents, not a hostile agent (`src/relay/contract.ts`, `SAFETY_NOTICES`).

How a write is meant to flow once the live tests pass (today only the mock has ever run it):

```
xo_account                     -> derived XO account, state, what is unproven
xo_deploy_enable_trading step=prepare  -> sign_with_paybox + prepared_id + digest_tag
   agent: request_wallet_sign with sign_with_paybox exactly as returned, human approves
xo_deploy_enable_trading step=submit prepared_id=... signature=...
xo_connect (prepare, sign within ~90 s, submit)   -> XO credentials stored encrypted; only a key_tag is shown
xo_fund_account amount_usd=...  (one PayBox proposal per call; call again after each succeeds)
xo_prepare_order -> sign -> xo_submit_order -> xo_order_status
```

Timing: an auth prepare is valid for about 90 seconds, other prepared items about 5 minutes, an order needs at least 90 seconds of life left when submitted, and its default expiry is 300 seconds. A stale item is refused and re-prepared at no cost. A prepared item is single use. After an `ambiguous` or `pending` result, never submit again; check status (tool descriptions in `src/tools/*.ts`; `docs/phase1-gap-closing.md` sections 5.2, 5.4).

## 6. Settings

All settings are plain environment variables, read by the process that runs the tools. Unset or malformed values fall back to the defaults, and values above a compiled-in ceiling are clamped down (`src/config.ts`, `relay/config.ts`). The kill switch fails closed: any value that is not an explicit "off" word turns it on.

### Caps (advisory against a compromised agent; see [safety.md](safety.md))

| Variable | Default | Ceiling | Meaning |
|---|---|---|---|
| `XO_MAX_ORDER_USD` | 10 | 100 | Largest worst-case outlay of one order, fee bound included |
| `XO_MAX_DAILY_USD` | 50 | 500 | Daily total (UTC); order cap is clamped to it |
| `XO_PRICE_BAND_TICKS` | 50 | 200 | Allowed distance from the reference price, in 0.001 ticks |
| `XO_QUOTE_TTL_SECONDS` | 120 | 600 | How long a quote stays valid |
| `XO_ORDER_EXPIRY_SECONDS` | 600 | 3600 | Upper limit for an order's `ttl_s` (default `ttl_s` is 300; never zero) |
| `RELAY_FUNDING_TEST_CAP_USD` | 10 | 10 | Total funded until the exit is proven (can only be lowered) |
| `RELAY_FUNDING_DAILY_CAP_USD` | 50 | 50 | Daily funding cap (can only be lowered) |
| `RELAY_SEED_CAP_USD` | 10.80 | 10.80 | Cap on a market-creation seed order (can only be lowered) |

There is no cap on how many markets you create per day (a user decision; `src/config.ts`). The brakes on creation are the $50 daily cap (the $1 fee and any seed count toward it), per-attempt approval and the creation flag, which is off by default. Separately, `xo_fund_account` refuses more than a 3 USD test amount until a first small deposit has been seen to arrive and be credited (`src/xo/funding/preflight.ts`).

### Flags (every write path; all default OFF)

| Flag | What turning it on unlocks | Unlocked for normal use by recorded results |
|---|---|---|
| `ENABLE_USEROP_SUBMIT` | Sending signed user operations to XO's bundler: deploy, enable trading, revoke, redeem | T1 |
| `ENABLE_TRADING` | `xo_connect`, order prepare, submit and cancel | T1, T2, T3b |
| `ENABLE_FUNDING` | `xo_fund_account` | T1 |
| `ENABLE_WITHDRAW` | `xo_withdraw` (prepares an exit operation; no verified exit exists) | T4 |
| `XO_ENABLE_CREATE` | Market creation, update answers, cancel and the creation seed (the six creation tools). Submit also needs `ENABLE_USEROP_SUBMIT`; the seed also needs `ENABLE_TRADING` | T6 |
| `ENABLE_SELF_HOSTED_METADATA` | Creating a market whose metadata you host yourself | T6 |
| `KILL` or `XO_KILL_SWITCH` | Turns **every** write off. Reads still work | n/a |

Rules (`src/relay/flags.ts`, `relay/capabilities.ts`): accepted words are 1/true/yes/on and 0/false/no/off; an unrecognised word means OFF for a flag and ON for the kill switch. A write flag takes effect only when it is on **and** either the test results it depends on are recorded as "yes" or you armed it for this run with `RELAY_ARM=ENABLE_USEROP_SUBMIT,...` (the confirmation that lets the live test itself run). `RELAY_ENFORCE_FLAG_FACTS=0` removes the results requirement; do not. A flag must be on both in the plugin's environment and the relay's; in local mode that is one process. Nothing the agent or a market says can turn a flag on.

### Other

| Variable | Used for |
|---|---|
| `XO_RELAY_URL`, `XO_RELAY_KEY` | Hosted-sandbox mode only: where the relay is (https, or http to 127.0.0.1) and the shared key. PayBox plugin environment variables are plain text and shared by every installer, so do not put a key that guards a relay other people can reach there; use a loopback relay you run yourself |
| `XO_OWNER` | The wallet(s) the relay serves for writes (comma or space separated). Required before funding is allowed; without it the first wallet whose signature is accepted is bound. `XO_ALLOW_ANY_OWNER=1` serves every wallet (each kept apart, each with its own caps) |
| `RELAY_BASE_RPC_URL`, `XO_BASE_RPC_URL` | Optional Base RPC for funding checks (https only). A URL usually embeds a provider key, so treat it as a secret. Default is a public Base host |
| `XO_RPC_URL` | Optional read-only XO node; makes "is trading enabled" exact |
| `XO_READ_ADDRESS_ALLOWLIST` | Comma-separated addresses; `xo_positions` and `xo_account` then read only those |
| `RELAY_SELF_HOST` | Your own https host for market metadata (creation) |
| `RELAY_ALERT_HOOK`, `RELAY_ALERT_COMMAND` | Optional alert command (absolute path); off unless both are set |

## 7. Reading capability facts

A capability fact is one recorded answer to an open question ("does XO's bundler accept our first operation?"): `unknown`, `yes` or `no`, with who recorded it and when. `unknown` always behaves like `no`. Two ways to read them:

- **From the agent:** `xo_account` lists which facts are still unproven when a relay is configured, and every write tool's result carries `unproven_capabilities` for the facts it depends on. Treat each as a reason to expect a refusal.
- **From the shell,** with the relay or local server **stopped** (a data directory has one owner at a time):

```sh
pnpm exec tsx scripts/live/facts.ts list  --data-dir <path-to-data-dir>   # every recorded fact
pnpm exec tsx scripts/live/facts.ts flags --data-dir <path-to-data-dir>   # which flags the facts unlock
```

`facts.ts record` writes a fact by hand and needs you to type an exact confirmation phrase (`RECORD <id>=<state>`). Record only what you have seen happen.

## 8. Running the live tests (optional, later)

These are real actions on XO and PayBox. Each is one script in `scripts/live/`, optional, needs your explicit go, and does nothing without `--confirm` and a budget. They print every call before making it. List them (runs nothing):

```sh
pnpm exec tsx scripts/live/index.ts
```

| Test | Settles | Worst case |
|---|---|---|
| T0 PayBox signing probes | What `request_wallet_sign` does with a raw digest and typed data | $0 |
| T1 Deploy plus enable trading | Whether XO's bundler accepts the first operation of your account | $0 (sponsored; an unlimited allowance on an empty account) |
| T2 Credentials | Whether XO's gateway accepts the login signature; uses the account's one key slot | $0 |
| T3a Deposit | Whether XO credits USDC.e sent straight to the account | $3 |
| T4 Exit | Whether funds can be taken back out | $3 (reuses the deposit; may strand it) |
| T3b First order | Gateway rules, cancel, duplicate handling | $0.55 ($0.66 with `--probes`) |
| T3c Fee reconciliation (optional) | Which fee figure is real | $1.10 |
| T5 Redeem | Redeem for a foreign account | $0 |
| T8 Capped allowance and kill switch | Capped approvals; on-chain revoke | $1.43 |
| T6 Creation experiment | Hosting and review of a self-hosted market | $1, non-refundable |
| T6b Seed | Placing the creation seed | $10.80 |

(Worst cases are the kit's own figures, `scripts/live/index.ts`; Base gas is extra, and the stranded-funds case is not a "cost" it can bound. Recommended order: T0, T1, T2, T3a, T4, T3b, T5, T8, then T6. T4 passing is what permits funding above the test amount.)

```sh
pnpm exec tsx scripts/live/t0-paybox-signing.ts --help      # options for one test
pnpm exec tsx scripts/live/t0-paybox-signing.ts             # no --confirm: prints the plan, does nothing
pnpm exec tsx scripts/live/t0-paybox-signing.ts --budget-usd 0     # rehearsal against the local mock (the default target)
# The real thing, only when you decide to:
pnpm exec tsx scripts/live/t0-paybox-signing.ts --target live --confirm --budget-usd 0 \
  --owner <your-dedicated-paybox-credential-address> --credential-id <its-id> --data-dir <path-to-data-dir>
```

Run the rehearsal first. When a live run finishes it asks you to type a confirmation phrase before recording any fact; `--no-record` records nothing. The runbook that the scripts point at is [docs/runbook.md](runbook.md) (order of the tests, costs, facts, rollback, the PayBox manual steps). The live scripts and the relay both hold the same lock on the data directory, so stop the MCP server before running them.

Stop rules, from [phase1-gap-closing.md](phase1-gap-closing.md) section 6: any 401, 403 or "key required" from XO means stop and record it, never look for a key; no balance rise in 10 minutes after a deposit means do not resend; an ambiguous order means reconcile by its hash, never resend; never create a second XO key; do not retry a market creation.

## 9. Rolling back

From least to most drastic. Do the on-chain step **before** the software kill switch, because the kill switch also blocks sending the revoke (`requireFlag` in `src/relay/flags.ts`, `guardWrite` in `relay/capabilities.ts`).

1. **Stop new orders from settling, on chain.** `xo_revoke_trading` (prepare, sign, submit) sets the exchange's USDC.e allowance to 0 and removes its position-token approval. It needs only a deployed account (no funds at XO) and is sent without a paymaster (`src/tools/userop.ts`, `relay/userops.ts`). It needs `ENABLE_USEROP_SUBMIT` on, and a tripped tripwire also refuses writes (I found no exemption for the revoke). Signed orders stay valid until they expire (there is no on-chain cancel), which is why the revoke matters more than `xo_cancel_order`.
2. **Software kill switch.** Set `XO_KILL_SWITCH=1` (or `KILL=1`) and restart: every write is refused, reads work. `SIGUSR2` switches every write off at once, without a restart, in all three ways of running it: a running HTTP relay (`pnpm relay`, `relay/main.ts`) and local mode in both stdio and `serve` (`kill -USR2 <pid>`, `src/local/cli.ts`; not on Windows, where the environment variable plus a restart is the way). Only a restart lifts it.
3. **Turn flags off.** Unset the `ENABLE_*` variables and restart. Writes are refused again; reads and recorded facts are untouched.
4. **Do not delete the data directory** unless you mean to lose your XO credentials: a lost key set may be unrecoverable and the key limit is unknown. The credential store writes an encrypted backup before first use (`backups/` under the data directory). If the machine is lost or compromised, go to the rotation list in [safety.md](safety.md).
5. **Roll back the build.** `pnpm install --frozen-lockfile && pnpm build` from the version you trust; `dist/` is build output and safe to delete.
