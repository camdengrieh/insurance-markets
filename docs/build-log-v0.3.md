# Build log v0.3: the Cockpit integration

Written 2026-10-19 on branch `build/xo-paybox-plugin`, after the streams that built the plugin asks, the daemon (`bridge/`), the page (`app/`), the browser suite and the documents were put together. Nothing was committed, pushed, uploaded or announced. Nobody was contacted. No request left the machine in any test or run described here: the unit and component tests use fixtures and fakes, the browser suite uses a local mock XO, and the one real-daemon run had its network blocked by a preload that records and refuses every outbound connection. Nothing was signed or sent.

## What exists now

- **The plugin** (`dist/plugin.mjs`): 917,805 bytes, sha256 `7f41286f034450c008fecc11c358e3870ab58733cdbb78753fe0d6f11b400564`, byte-identical across repeated builds, 28 tools (the 27 of v0.2 plus `xo_get_prepared`). It imports nothing from `bridge/`, `relay/`, `app/` or `src/local/`, and has no `node:fs` or `child_process`. The starter conformance run passes. The earlier recorded hash (`8203c136...`, 27 tools) in `docs/build-log-v0.2.md` is superseded.
- **Local mode** (`dist/local.mjs`, 1,744,650 bytes): the stdio server, `serve` (the Cockpit daemon) and `shim` (the stdio front for a running daemon), one bundle.
- **The daemon** (`bridge/`): loopback HTTP front with Host and Origin pinning, pairing, page and agent tokens, the read proxy, the tool-class gate, the ARM window, the kill latch, the event stream, the signing inbox, the audit adapter, the S2 signer (off), and `GET /ui/status`.
- **The page** (`app/`): two builds. Screens: Markets, Market, Portfolio, Wallet, Signals, Terminal (with a prepare console), Trade and Signing. Seven venue readers are wired (XO, Polymarket, Trueo, Hyperliquid, Pascal, Manifold, Limitless).

## Gates and their results

| Gate | Command | Result |
|---|---|---|
| Plugin type check | `pnpm typecheck`, `pnpm typecheck:tests` | clean |
| Plugin and relay tests | `pnpm unit` | 5,503 tests: 5,492 pass, 0 fail, 1 skipped, 10 todo (the todo and the skip were there before) |
| Plugin build | `pnpm build` twice | identical sha256 (above) |
| Starter conformance | `pnpm --silent test` | passed, 28 tools |
| Local build | `pnpm build:local` | builds, includes the daemon and the shim |
| Bridge tests | `pnpm unit:bridge` | 762 tests, 762 pass, twice in a row |
| Page type check | `pnpm --dir app run typecheck`, `typecheck:bridge` | clean |
| Page tests | `pnpm --dir app run test` | 154 files: 140 passed, 14 skipped (the opt-in live drift suites, never run); 2,302 tests pass, 61 skipped, 1 todo, 0 fail |
| Page build | `pnpm --dir app run build` | both builds; each about 1.1 MiB raw, 352 KiB gzip over 25 files |
| Page checks | `pnpm --dir app run check` | deps, boundaries, CSP drift, origins, addresses, bundle (one viem, one zod), supply chain, e2e hygiene: all ok |
| Browser suite | `pnpm --dir app run e2e` | 71 pass in headless Chromium (Chrome 153, macOS), zero security-policy violations |
| Real daemon | `node dist/local.mjs serve` with the network blocked, driven with curl and the shim | see below |

Not run: `pnpm audit` and the root-isolation check (both need the network or an install), every opt-in live drift suite (`APP_LIVE=1`), the live-test scripts, any browser but one, any platform but macOS arm64, and the root `pnpm install --frozen-lockfile`.

## The real-daemon run

The daemon started on a fixed port with a throwaway data directory, all write flags OFF, and a preload that records and refuses any non-loopback connection. Observed: a wrong Host, a `localhost` Host, a foreign Origin, a cross-site fetch and a preflight each got 403; no token, a malformed token and the wrong kind of token got 401 or `scope_denied`; a pairing code worked once and then 401; `/ui/status` showed no flag on and the relay's recorded capabilities all unknown; arming answered `flag_off`; a submit-class tool was `scope_denied` for a page token and for the default agent token (read and prepare only; a submit scope also needs an open ARM window); the read proxy refused the signed-only orders path (`path_not_allowed`) and a JSON-RPC write (`rpc_method_not_allowed`); the kill (route or `SIGUSR2`) showed KILLED in the status at once and refused later prepares with `kill_switch`; no response carried `Set-Cookie`; `SIGTERM` exited 0 and removed `daemon.json`. The shim initialised, listed 28 tools, forwarded a call (the daemon's audit log shows it) and refused a world-readable token file. Every outbound attempt (the relay's reads of XO hosts) was blocked and logged; none went out.

## What the integration changed

Joins that no single stream owned:

- `bridge/main.ts` now connects the daemon to the relay: the inbox reads the relay's prepared records, the audit adapter writes the relay's audit log, the kill latch learns of a relay-side kill (so `SIGUSR2` shows as KILLED), `/ui/status` reads the relay, and a prepared item in a settled tool answer is offered to the inbox, which lists it only if the relay holds the same record. The stub imports and `@ts-ignore` lines for modules that now exist were removed.
- `bridge/status.ts` (new): `GET /ui/status` in the contract's shape. Without a relay every flag reads OFF and one tripwire says the relay is not running.
- `bridge/tool-classes.ts`: the gate offers settled results to listeners (`onResult`).
- `src/local/cli.ts`: the `shim` subcommand (the shim had no entry point), and the `serve` import is type-checked.
- `app/src/session.ts`, `SessionStatus.tsx`, `core/page-token.ts`: the page exchanges its pairing code at load and says in words whether it is paired; the explorer, wallet and signals screens read the token through one source. The terminal route also mounts the prepare console. Limitless is wired into the Markets screen.

Defects found by running the whole thing:

- `bridge/server.ts`: a request refused before its body was read (a POST to the app) got a second response from the parser's error handler on the same socket, in about a quarter of the attempts with node's http client. Fixed; a mutation check confirms the new test fails without the fix.
- A browser warning on every load: zod's `new Function("")` probe ran before the setting that turns it off. zod and the setting now share a chunk (`app/scripts/vite-base.ts`); the browser suite holds the build to zero violations and its pin for this defect was removed.
- The standalone Markets page was 895 px wide at 360 px: `.ui-table-scroll` now establishes the containing block.
- `app/scripts/build-lib.ts`'s real-app build did not pass the Vite mode, so the standalone check inspected the Cockpit code twice.
- `app/src/core/fetch.ts`: the daemon's own `rate_limited` answer read as "not supported"; it now reads as rate limited.
- `INERT_HOSTS` lacked the documentation hostname inside viem's decode errors.
- The relay now caps a BUY at 1,000 bps while the live-test scripts still computed 800: the T3b, T3c and T8 ceilings rose by one to three cents (`$0.55`, `$1.10`, `$1.43`; T3b with probes stays `$0.66`). **These are real-money limits for tests you have not run; check them before running one** (`docs/runbook.md` section 3).
- `test/scaffold.test.ts` pinned `pnpm-workspace.yaml` byte for byte; the 14-day release-age rule (ask A6) is now a documented local tail, and the starter part must still hash to the manifest.
- `test/relay-core-store.test.ts` failed in one run in 64: its "damage the backup" step replaced a ciphertext character with a fixed one that was sometimes the original. It now picks a different character.

## Still not built or not proven (not hidden)

- **No `/mcp` route.** An agent reaches the daemon through the shim. The daemon says "no MCP endpoint in this build".
- **No relay route `GET /v1/prepared/{id}`**: `xo_get_prepared` answers `not_implemented` against a real relay.
- **The page reads no recorded capability facts**, so every capability reads "unproven" and the trade screens stay closed. That is the safe default; wiring it needs a mapping from the relay's fact ids to the page's.
- **Hosts and routes**: SX Bet, UDX, OG and the Polymarket geoblock endpoint are not in `app/headers.config.ts`, so their readers refuse every call; the daemon's allowlist has no routes for them; there is no daemon-held Quotient key store; no screen switches a restricted-terms venue on. Seven readers (Kalshi, SX, UDX, Novig, Gemini, OG, DefiLlama) are therefore unreachable from any screen.
- **One browser, one platform.** Firefox, Safari, Local Network Access prompts, Linux, Windows and screen readers were not tried. The external security review the design requires before release has not happened.
- **Every XO and PayBox capability is unproven** (doors a to e, what PayBox signs and shows, the exit, the redeem, the first order). No live test was run.
- Housekeeping: `docs/plan.md` names the repository's owner in one line; `src/tools/account.ts` has an unused import; `docs/phase1-gap-closing.md` still shows the 800 bps ceilings in its worst-case table (its section 9 and the runbook carry the new ones).

## Reproduce

```sh
source .tools/env.sh
pnpm typecheck && pnpm typecheck:tests && pnpm unit && pnpm unit:bridge
pnpm build && shasum -a 256 dist/plugin.mjs      # expect 7f41286f034450c008fecc11c358e3870ab58733cdbb78753fe0d6f11b400564
pnpm --silent test && pnpm build:local
pnpm --dir app install --frozen-lockfile && pnpm --dir app run typecheck && pnpm --dir app run test
pnpm --dir app run build && pnpm --dir app run check
(cd app && node e2e/install-browser.ts)           # the only step that uses the network
pnpm --dir app run e2e
```
