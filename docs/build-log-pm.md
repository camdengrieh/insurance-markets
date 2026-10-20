# Build log: the pm/ aggregation layer (AGG-0 + AGG-1)

Written 2026-10-20 on branch `build/xo-paybox-plugin`. Nothing was committed, pushed, uploaded or announced. Nobody was contacted. No request left the machine in any test or run described here: every test uses fixtures, fakes or loopback servers on 127.0.0.1. The recorder was built and tested but never started against a real venue. Nothing was signed or sent.

This log covers the MVP in `docs/aggregation-design.md` (AGG-0: the math core and the read tools; AGG-1: the human-approved link dataset). The operating instructions are in `docs/pm-runbook.md`. The code is all under `pm/`; the only files outside it that this work added are the two documents.

## What this is, in one paragraph

A read-only signal and reference-price layer for prediction markets: eight `pm_*` MCP tools (not yet wired into the plugin), a bundled platform registry, a hash-pinned link dataset with an empty shipped set, read adapters for XO, Polymarket and (off by default) Kalshi, exact-arithmetic edge and fee math, a Quotient request/parse helper (flag off), and an optional local recorder to collect the evidence the design still lacks. No tool places an order, none can produce an `executable_arbitrage` label (that value does not exist in the code), and none claims guaranteed profit. Every write path stays off. Nothing here is operated by the author and nothing holds custody.

## File map

183 files under `pm/`, 63 of them `*.test.ts`. Counts below are tests as reported by the final run (see the gate section).

| Path | Contents | Tests |
|---|---|---|
| `pm/tsconfig.json`, `pm/types.ts`, `pm/index.ts`, `pm/README.md` | Config extending the root one; venue-agnostic types (`Dec`, `Fixed`, `Market`, `Book`, `Quote`, `FeeSpec`, `VenueReadAdapter`, `Untrusted`); barrel; ownership table and gate commands | 7 (`pm/test/types.test.ts`) |
| `pm/core/` | Exact bigint rationals; fee models and builders; book conventions and normalisers; depth-walk VWAP; marginal basket walk; closed-form relation checks; exact rational LP; gates and labels; rules hash | 121 |
| `pm/registry/` | Bundled platform registry for 14 venues with per-section freshness, fail-closed reads, validator, pool derivation, data-terms policy, offline `listVenues` | 48 |
| `pm/links/` | Link record schema and invariants; rules and masked hashes; hash-pinned bundle and validator; approval CLI; lookup logic; runtime pin check; gold-set tooling; the empty shipped bundle and its pin | 163 |
| `pm/adapters/` | XO, Polymarket and Kalshi read adapters behind the `VenueReadAdapter` port; injected transport with host allowlists; persistence policy; the disabled adapter | 129 |
| `pm/ops/` | Data functions behind the tools: `getQuote`, `verifyLink`, `compareMarket`, `lookupLinksOp`, `checkStructure` | 165 (includes structure) |
| `pm/signals/` | Quotient request description, body parser, identity-only link join, agent-held calibration log; flag `PM_QUOTIENT`, off by default; no network, fs or signing code | 93 |
| `pm/tools/` | `registerPmTools(server)` and the eight tool registrations; strict zod output schemas | 73 |
| `pm/recorder/` | Local recorder: allowlist, polite HTTP client, SQLite store (`node:sqlite`), scheduler, collector, report, CLI entry `main.ts`, `RUN.md` | 98 |
| `pm/test/gate/` | One integration test: restricted-terms audit and x402 address pins | 3 |
| `pm/WIRING.md` | The exact change a later step makes in `src/plugin.ts` and `src/local/server.ts` | (none) |

The eight tools: `pm_list_venues`, `pm_get_quote`, `pm_lookup_links`, `pm_verify_link`, `pm_compare_market`, `pm_check_structure`, and the `PM_QUOTIENT`-flagged `pm_signal_request` and `pm_signal_parse`.

Not edited: `src/`, `relay/`, `bridge/`, `app/`, `test/`, the root `package.json` and lockfile. No dependency was added. The `pm/` code imports `src/guardrails/amount.ts`, `src/guardrails/untrusted.ts` and `src/xo/*` read-only.

## Gate results

The gate has been run three times by three different steps and once more while writing this document.

| Run | Typecheck | Tests |
|---|---|---|
| Gate step, before review fixes | `tsc --noEmit -p pm/tsconfig.json` exit 0 | 848 tests, 848 pass, 0 fail, 0 skipped (about 3 s). The streams' own counts summed to 845; the gate step added 3 (`pm/test/gate/restricted-audit.test.ts`). |
| Fix step, after review fixes | exit 0 | 900 tests, 900 pass, 0 fail, 0 skipped |
| Final-verify step, on a scratch copy with `--test-concurrency=1` | exit 0 | 900 tests, 900 pass, 0 fail, 0 skipped, cancelled 0 (about 74 s). By directory: adapters 129, core 121, gate 3, links 163, ops 165, recorder 98, registry 48, signals 93, tools 73, types 7 (sum 900). |
| Re-run while writing this log, in the repo, default concurrency | `node_modules/.bin/tsc --noEmit -p pm/tsconfig.json` exit 0, no output | `node_modules/.bin/tsx --test "pm/test/**/*.test.ts"`: tests 900, suites 60, pass 900, fail 0, cancelled 0, skipped 0, todo 0 (about 61 s) |

Notes on those numbers:

- `tsc` and `tsx` are not on `PATH` after `source .tools/env.sh` in these shells; the commands use `node_modules/.bin/`.
- The `PM_LIVE=1` drift suites (`pm/test/adapters/live.test.ts`) are suite-level skips and are not counted as skipped tests. They were never run, because that would contact real venues.
- The root `pnpm build`, `pnpm test` and `pnpm typecheck` were not run by any pm step, by the ground rules. They belong to the wiring step.
- A near-miss in the final-verify step: `pnpm exec tsc` in a symlinked scratch copy started an automatic install and aborted (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`) before removing anything; the repo's `node_modules`, `package.json` and lockfile were checked afterwards and show no change. Do not use `pnpm exec` for the pm gate.

Other checks reported by the gate and final-verify steps (I re-ran only the typecheck and test commands above):

- `registerPmTools` on an in-memory server with `fetch` stubbed to throw and all `PM_*` variables unset: 8 tools registered, names match `PM_TOOL_NAMES`, every tool read-only and non-destructive, `pm_list_venues` answered (14 venues, xo and polymarket on, kalshi off), `pm_lookup_links` returned 0 approved, 0 candidate and 0 withdrawn records, both signal tools answered "OFF", invalid arguments were rejected, fetch was called 0 times, a second registration on the same server threw. Every input and output schema compiles under Ajv 2020-12 strict.
- Restricted-terms audit (`pm/test/gate/restricted-audit.test.ts`): a sentinel string was planted in Kalshi market, event and series bodies, a Quotient row and a Kalshi leg id in a bundle, then the enabled Kalshi adapter, the signal parser and the recorder `once` command were run. Afterwards the recorder database, WAL and shm files and its data directory, every file under `pm/`, and the OS temp area (excluding tsx's own compile cache) held no sentinel, and the `pm/` tree hashes were identical before and after. A failing-case test confirms the scanner detects a planted leak.
- Greps over `pm/`: no personal identifiers, no home paths (the one generic `~/Library/LaunchAgents/...` example is in `RUN.md`), no 0x-plus-64-hex strings or known test keys, no private-key blocks, no `.env`/`.pem`/`.key` files, no `.sqlite`/`.db`/`-wal`/`-shm`/`.jsonl`/`.log` files. The only User-Agents are `insurance-markets-research/0.1` and `insurance-markets-xo-plugin/0.2`. There is no `pm/package.json`.
- Float and network greps over non-test code: no `parseFloat`; `Number(`, `Math.*` and `toFixed` hits are rounding digits, a JSON exponent shift, cursors, timestamps and recorder statistics, none on a money path. The only bare `fetch` is in `pm/recorder/http.ts`, behind an injected `fetchImpl` and a host allowlist. No `node:http`, `net`, `tls`, WebSocket, write HTTP methods, `eval` or `child_process`.

## Review

A review pass produced 37 itemised confirmed findings plus 22 further low-severity ones that were not itemised in the material this log was written from (listed in the fix report as skipped; their ids include TM-19 to TM-24, FM-6 to FM-10, LS-8, LS-9, TC-3 to TC-6, ADT-6, ADT-7, ADT-9 and ADT-10, but I do not have their text). A separate mutation pass found test gaps (the TM items). A fix step then worked through them.

Fixed, with the failing test written first where noted in the fix report:

| Id | Sev | What | Disposition |
|---|---|---|---|
| LS-1 | high | Rules-hash HTML stripping could swallow later fields after an unterminated `<x` | Fixed: recipe `rules-v2` (no HTML stripping, entities decoded per field, NFC for the pin, NFKC only for the masked form). Golden vectors, the shipped bundle and its pin were regenerated through the CLI (shipped set still empty). Not seen red before the fix: `hash.ts` was changed before its replacement tests were written. |
| LS-7 | low | NFKC mapped distinct numerals to one hash | Fixed by the same change; same caveat about not seeing it red |
| LS-3 | high | Outcome identity not checked live; compare priced outcome 0 against a twin from the human map only | Partly fixed: `pm_compare_market` withholds with `outcome_role_mismatch` when yes/no roles contradict the relation. Not fixed: per-leg outcome labels or token ids are still not pinned in the link, and `verify` still checks only the outcome count. |
| ADT-1 | high | XO rules hash computed over truncated text yet marked tradable | Fixed: any lossy read of a rule-bearing field makes the rules unhashable (sentinel hash, not tradable) |
| ADT-2 | high | XO recorder resolve URL lacked the `/api` prefix; the test fake mirrored the bug | Fixed: `/api/markets/contract/{id}`; a contract test derives the URL from `src/xo/client.ts`. The dry-run output above shows the corrected path. |
| FM-2 | med | `pm_check_structure` could emit `structural_violation` on an incomplete member list | Fixed: capped at indicative with `member_list_not_proven_complete` |
| FM-5, FM-1 | med, low | compare's sized net ignored order-level fee rounding; label used top-of-book net | Fixed: sized net is after `repriceOrders`; label uses the lower of top-of-book and sized net; new reason `depth_net_below_tau` |
| FM-3 | low | compare lacked crossed/locked and venue-timestamp checks | Fixed (`book_crossed`, `venue_book_stale`, `venue_time_from_future`, `venue_time_invalid`) |
| FM-4 | low | getQuote said `executable: true` below min size or off the tick grid | Fixed (`below_min_size`, `price_off_tick`, `effective_price_out_of_range`) |
| LS-2 | med | "Human approval" is not authenticated | Partly fixed: proposer cannot approve own proposal; token-based automation-handle check; `replaceLink` no longer exported; CLI `approve` needs an interactive TTY and a typed 8-character digest prefix. Not fixed: an agent with Bash can still run the CLI under a pseudo-terminal or edit `shipped-data.ts`; no matching-approve-event requirement; the pin lives in the data file. The real control remains human review of the diff to the shipped bundle in git. |
| LS-4 | low | Identity link with differing void policies / closes accepted | Fixed |
| TC-1 | med | Kalshi-leg link could carry free text | Fixed: short codes without spaces on that side and in evidence details |
| TM-01 | med | Restricted-venue list hard-coded to Kalshi | Fixed: derived from the platform registry; unknown terms count as restricted |
| TM-02 | med | Calibration log claimed not to store Quotient's probability, but `q = mid + qMinusMid` | Fixed: the header now states the log is reversible and is agent memory only; `LOG_HANDLING_NOTICE` and a test added |
| ADT-3 | med | Polymarket recorder trusted `list[0]`, ignored version, did not check outcome order | Fixed |
| ADT-4 | med | `once` under cron sampled at half the stated cadence | Fixed: due after `interval - min(30 s, interval/10)` |
| ADT-5 | med | Persistence episodes could span a recorder gap | Fixed |
| TC-2 | low | Recorder allowlist ignored registry terms freshness | Fixed: checked every tick; a venue whose terms are stale is paused with one `refused` event. This has an operational consequence, see the runbook. |
| TM-03 to TM-15, TM-17 | low to med | Surviving mutants | Tests added. TM-09, TM-10, TM-03 and TM-05 were re-mutated and each mutant now fails a test. The rest passed immediately because the production code was already correct. TM-17 needed `loadShippedBundle` to take an optional source. |
| TM-18, ADT-8 (part) | low | Wall-clock-dependent tests flaky under load | Partly fixed (adapter `fast()` deadline 20 s, looser budget test). The recorder HTTP tests still use short real timers and file mtimes and were not run under heavy load. |

Not fixed (decided, not forgotten): LS-5 (proposer evidence is self-declared and not checked against the record), LS-6 (an LLM or statistics veto makes a candidate permanently `revoked` and squats its content-addressed id; needs a schema or state change), TM-16 (two gold-set gate conditions untested: the 20-gold-axis minimum and the relation-kappa threshold), and the 22 unitemised lows. The remainders of LS-2, LS-3 and TM-18 are described in the rows above.

## What is NOT built

Per the MVP definition, AGG-2 and later are out of scope. Specifically absent:

- `pm_find_edge` (cross-venue scan over the registry) and `pm_plan_legs` (leg planning). Without these, the tools answer questions about a market or a link you name; nothing scans.
- A signed dataset: the link bundle is hash-pinned, not signed, and ships empty. There is no key, no signing step, no distribution channel.
- Trueo and Limitless readers in `pm/adapters/` (the registry has records for them; the recorder has a Limitless collector but the tools have no Limitless adapter). SX Bet, Hyperliquid, Pascal and the other registry-only venues have no adapters either.
- Any LP-pool, AMM-quote or liquidity-provision logic. `pm/core/lp.ts` is a small exact linear-programming solver for arbitrage structure checks, not an LP-provider tool.
- Polymarket Data API v2 and Polymarket US coverage (only the Gamma and CLOB hosts are allowed).
- Ladder checks in `pm_check_structure` (rung metadata must be supplied by the caller and the adapters give none, so it reports `not_applicable`); bucket checks; automatic group discovery in the recorder.
- A real entity-alias table for the masked hash (only a caller-supplied list recorded by fingerprint).
- Any approved link. The shipped bundle has 0 approved, 0 candidate, 0 suspended, 0 revoked records (its manifest hash is `ee818dee51a4f8b78ddc9f0ce605c4003dc79657ec67f21834a2077856d635bd`, checked with `verify-bundle` while writing this log).
- Any gold-set class gate. No gold set exists, so every label is capped at `indicative_discrepancy` by design until one is built and a later step supplies the gates.
- Anything that acts: no order, no signing, no transfer, no taker execution, no PayBox call.

## Limits of the evidence

Read these before trusting any number the layer prints.

1. **One snapshot.** The design's conclusion that no taker arbitrage survived frictions rests on a single snapshot (the research notes, `docs/research/18` Verification: one 30-day window of candles, no live depth, no self-recorded history). That is a weak basis for a general claim in either direction. It does not show such opportunities never exist, only that none was found there.
2. **The recorder has not been started.** It was tested against fixtures and a local fake server only. The live response shapes of the XO Data API, Gamma, CLOB `/book` and Limitless are known only from saved research fixtures and synthetic payloads. Per-host budgets come from research-note limits; the real tolerance of each host (including XO's Cloudflare behaviour) is untested. The launchd, systemd, cron and Dockerfile examples were not executed or linted. Disk figures in `RUN.md` are estimates. WAL on network mounts and some container volumes is untested. The Polymarket recorder queries `condition_ids` where the docs show `condition_ids[]`; untested against the live host.
3. **Adapters were never run against live venues.** All 129 adapter tests use recorded or synthetic fixtures. Never exercised: the Polymarket v2 `positionIds` path and its `GET /markets?condition_ids=` fallback, Gamma `/public-search` paging, the Kalshi batch `/markets/orderbooks` envelope, Kalshi `fee_changes` route shapes, and the `exclude_markets` event parameter. If Polymarket's CLOB `t` array does not use `positionIds` for v2 markets, every v2 market fails closed with `SCHEMA_DRIFT` (by design). The tools were exercised only through fake in-memory adapters, never through `createAdapters` with real transport.
4. **Fees.** XO fee modelling follows a `p(1-p)` curve; the live `effectiveFeeConfig` reports `FLAT_BPS`, and the live `/fee-rate` versus `effectiveFeeConfig` conflict is unresolved, so the registry marks XO fees `conflicted` and quotes are non-executable. Kalshi rounding is a conservative stand-in, not the venue rule. Polymarket rounding mode is assumed. Limitless exposes only a flag, so the recorder withholds its net.
5. **Registry facts** were compiled from repo notes dated 2026-10-19 and not re-verified. Hyperliquid, Manifold, ProphetX, OG, Novig, UDX and Pascal fields are mostly medium or low confidence and labelled unverified.
6. **Quotient** body shapes come from the OpenAPI 20.5.0 summary in `docs/research/12`. No paid body was ever read; field names, nesting and the sports listing fields are unconfirmed. The pinned `payTo`, asset and price ceilings were carried over from notes dated 2026-10-18/19 and not re-fetched. The gate test checks only that the two addresses are well-formed and that the asset equals the checksummed USDC address.
7. **Link hashes on real rule text are untested.** Only synthetic text was used. The mask treats "May" followed by a day or year as a month and masks numbers inside dates; its recall on real XO, Polymarket and Kalshi text is unknown. Whether the gold-set gate thresholds are reachable, and how long a review takes per link, are unmeasured.
8. **Numeric defaults** (1 cent reserve, 8% APY hurdle, 24 h near-close window, 60 s book age, 9 s tool budget, 3.5 s per adapter call) are design values, not calibrated. The 128 KiB output guard was tested on synthetic data only.
9. **Not tested:** bundling `pm/` into the hosted PayBox sandbox (the tool graph was bundled on its own with esbuild once, about 340 KB, and uses `node:crypto`); SHA-256 availability in the hosted sandbox is unverified and there is no pure-JS fallback; two simultaneous CLI sessions writing the same registry (last writer wins, atomic rename only); duplicate JSON keys in a bundle file (the last wins, the pin covers the canonical parsed form).
10. **Approval is a procedure, not authentication.** See the LS-2 row above.

## Known mismatches the integrating step must settle

- **Two rules-hash recipes.** `pm/links/hash.ts` (`rules-v2`, with `mask-v1`) is what links pin and what adapters put in `Rules.sha256`; `pm/core/rules-hash.ts` is a different recipe, carried in the adapter `extras.coreRulesSha256`. `pm_verify_link` must compare like with like. Pick one and delete the other.
- **Two `Link` types.** `pm/types.ts` `Link` and `pm/links` `Link` differ in fields and enums. The tools use the `pm/links` one throughout; there is no converter.
- **`getBooks` `deadlineMs`.** The adapters read it as a budget in milliseconds from the call start; `pm/ops` passes an absolute epoch (`nowMs + timeout`). Only the per-call `guarded()` timeout bounds ops calls today. `pm_check_structure` passes a budget. Agree on one meaning.
- **`VenueId`** in `pm/types.ts` lacks pascal, sxbet, prophetx, gemini, og, novig and udx, and has `hyperliquid` where Quotient says `hl_outcomes` (the join maps it).
- **`LegFetcher` port.** `pm/ops/verify.ts` needs raw rule-bearing fields per market; `legFetcherFromAdapters` exists, but without rule fields every link suspends with `rulesSha256_missing`.
- **Registry freshness.** The `status` section has a 1-day TTL (fails closed after 2026-10-21 unless refreshed; ops does not gate on it, `verify` shows it as a warning). The `dataTerms`, `fees` and similar sections have 30-day TTLs from 2026-10-19: after that, quotes carry `memory_only_data` and the recorder pauses (see the runbook).
- **Kalshi captures on disk.** `docs/research/fixtures/kalshi/` holds captured Kalshi payloads. The Developer Agreement bars caching or storing beyond one's own trading. The repo owner should decide whether those files stay committed. Tests read them read-only and skip if absent; no Kalshi data was copied into `pm/`.
- **Root tests.** `test/tools-schema.test.ts` and `test/integration.test.ts` probably need their expected tool lists extended after wiring (not run).

## The wiring step still pending

`registerPmTools(server)` exists and is tested, but nothing in the plugin calls it. The pm streams did not touch `src/`. The change, from `pm/WIRING.md`: one import and one call in `src/plugin.ts` (hosted bundle) and in `src/local/server.ts` (local stdio server); `src/local.ts` needs none. After wiring, someone must run the root gate (`pnpm build`, `pnpm build:local`, the root tests, `scripts/conformance.mjs` against `dist/plugin.mjs` with the hosted 10 s operation limit), extend the two root tool-list tests, and decide how gold-set gates and registry refreshes are supplied. Until then the pm tools are reachable only through the pm test harness.

Optional settings once wired (all read from the plugin environment, all off by default): `PM_QUOTIENT=1`, and `PM_KALSHI=1` with `PM_KALSHI_ACK=<clause sha256>` (the hash is shown by `pm_list_venues` next to the disclosure, which makes the acknowledgement a procedural step rather than a strong control).
