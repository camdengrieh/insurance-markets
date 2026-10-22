# Build log: the Cockpit dApp (static page, daemon, plugin-side contract changes)

Written 2026-10-20 on branch `build/xo-paybox-plugin` by the documentation task of the build workflow. It records what the build streams, the integration pass, the review pass, the fix pass and the final check reported, plus the few things this task looked at itself. Design: [docs/dapp-design.md](dapp-design.md) (its "Fact-check outcome" overrides earlier text). How to run it: [docs/dapp-runbook.md](dapp-runbook.md) and [app/README.md](../app/README.md). Earlier logs: [v0.1](build-log-v0.1.md), [v0.2](build-log-v0.2.md), [v0.3](build-log-v0.3.md) (the integration pass in short).

**Nothing was committed, pushed, uploaded or announced. Nobody was contacted. No PayBox tool was called. Nothing was signed or sent.** No request left the machine in any test described here: unit and component tests use fixtures and fakes, the browser suite used a local mock XO, and the daemon runs had their network blocked or checked.

## How to read the evidence in this log

Every result below carries who produced it. Four kinds exist:

- **Reported by a stream or pass.** I copied the number from that pass's report and did not re-run it. This is most of the log.
- **Final check.** The last verification pass ran on a scratch copy of the tree after the fix pass, with `node_modules` symlinked in rather than freshly installed. It is the most recent full run, and its verdict was **red** (section 3.3).
- **Observed by this task.** Section 3.4 lists the only things I ran or inspected myself.
- **Not run.** Listed in section 3.5. If a thing is in neither the reported nor the observed list, treat it as unverified.

A test count is "tests that passed in a run on that date". It is not evidence the thing works against a real venue, a real PayBox account or a real MCP client; none of those was used.

## 1. Where things stand

The build is **not clean**. At the end of the final check, three things were open that block any commit:

1. `pnpm unit:bridge` fails 16 of 840 tests, all in `bridge/test/signer/`. The fix pass tightened the shared order rebuild (finding SC-7) so that an order's token must be a position id of the condition it shows. `bridge/test/signer/fixtures.ts` still builds an order with condition `0xabab...ab` and an unrelated token, so the fixture no longer rebuilds and the signer tests fail at setup. **I re-ran `bridge/test/signer/vet.test.ts` on 2026-10-20 and saw the same error**: `test setup: the order did not rebuild (decoded.params.condition_id)` from `fixtures.ts:71`. The root `pnpm unit` does not cover `bridge/test/`, so nothing caught it before the final check.
2. Recorded third-party responses from restricted-terms venues sit in paths that `git add` would stage: `app/src/venues/kalshi/fixtures/*_recorded.json` (copies of research captures that the root `.gitignore` deliberately keeps out), and recorded captures of the same kind under `app/src/venues/{gemini,og,novig,udx}/fixtures/`. `git check-ignore` on a Kalshi one returns "not ignored" (observed by this task). Whether they count as raw data under the Kalshi Developer Agreement is a judgement call; the safe fix is to ignore them or replace them with hand-built data before any commit.
3. The root `unit` script is still `tsx --test "test/**/*.test.ts"` (observed). The offline network guard exists (`test/net-guard.mjs`, run through `node scripts/unit.mjs`) but `pnpm unit` does not use it, so a root unit run can still send real requests if a test forgets to inject a fetch (finding TM-01).

Everything else the final check ran was green (section 3.3).

## 2. What was built, by work package

The work was split into streams. Paths are repo-relative. Counts are the owning stream's last report (not re-run here unless section 3.4 says so).

### W0, app scaffold (`app/`)
Its own pnpm workspace with its own lockfile and `minimumReleaseAge: 20160` (14 days), `blockExoticSubdeps`, `trustPolicy: no-downgrade`, `allowBuilds: {}`. Seven runtime dependencies (React, React DOM, TanStack Query, wouter, idb, viem, zod); exact pins; register in `app/scripts/dependencies.json`. The root `package.json`, workspace file and lockfile were not touched by app installs.
- Config and headers: `app/package.json`, `app/pnpm-workspace.yaml`, `app/pnpm-lock.yaml`, `app/vite.config.ts`, `app/headers.config.ts` (the single source of every origin and both CSPs), `app/vercel.json`, `app/index.html`, `app/scripts/examples/` (generated header examples, drift-tested).
- Wire contract shared by page and daemon: `bridge/contract.ts` (tokens, scopes, errors, read proxy, prepare routes, inbox, event union, status, tool-call envelope, limits).
- Ports: `app/src/core/ports.ts`.
- Checks: `app/scripts/check-{deps,boundaries,csp,origins,addresses,bundle,root-isolation}.ts`, `policy.ts`, `serve-with-headers.ts`, plus later `check-supply-chain.mjs` and `check-e2e-hygiene.mjs` (K1 stream).
- Reported: 76 tests in 10 files at the time. W0-3 (a real-browser CSP load) was done later by the e2e stream.

### Shell and design system (`app/src/ui/`, `app/src/App.tsx`, `app/src/main.tsx`)
Hash router (wouter), route discovery from `app/src/routes/*.tsx`, light and dark tokens with contrast tests, `UntrustedText` (the only place market text is rendered), the four tile types, dialog, data table, announcer, pairing-fragment removal. Reported: 118 tests in 10 files.

### Core (`app/src/core/`)
Exact money (`money.ts`, `format.ts`), per-host budgets and the venue pause (`budget.ts`), fetch ports for both builds (`fetch.ts`, `fetch-cockpit.ts`, `env.ts`), cache and memory-only policy (`cache.ts`), address checks (`address.ts`), Kernel account derivation and status (`account.ts`), address-book store (`bindings.ts`, `settings.ts`), registry reader with no data (`registry.ts`), venue policy table (`venue-policy.ts`), capability facts where only an exact `yes` is proven (`capabilities.ts`), books (`book.ts`), one rules-hash recipe (`rules-hash.ts`, added in the fix pass), page token source (`page-token.ts`, integration). Reported: 222 tests in 15 files at the time of the stream.

### Venue readers (`app/src/venues/`)
| Package | Directory | State |
|---|---|---|
| C1 | `xo/` (Data API; books, fee-rate and trading-state in the Cockpit variant only) | wired into Markets, Market, Portfolio |
| C2 | `polymarket/` | wired; geoblock reads "unchecked" (its host is not in the origin list) |
| C3 | `manifold/`, `hyperliquid/` (response shapes unverified, tile says so) | wired |
| C4 | `pascal/`, `trueo/` (Base, `eth_call` and `eth_getLogs` only) | wired |
| C5 | `limitless/` (wired, Cockpit only), `kalshi/`, `sx/`, `udx/` | Kalshi, SX, UDX built, not reachable from any screen; SX and UDX have no origin entry |
| C6 | `quotient/` (closed-route client, off by default, never pays) | used by Signals |
| C7 | `novig/`, `gemini/`, `og/`, `defillama/` | built, not reachable from any screen; OG has no origin entry (package status: partial) |

Each reader ships offline fixtures and an opt-in `live.test.ts` (`APP_LIVE=1`). **No live suite was ever run.** Restricted-terms venues (Kalshi, Gemini, Novig, OG, UDX) ship OFF, memory-only, with a disclosure (fork F5).

### Screens (`app/src/routes/`, `app/src/features/`)
| Package | Screens and files | Notes |
|---|---|---|
| E | Markets and Market: `routes/markets.tsx`, `routes/market.tsx`, `features/explorer/` | seven readers fan out; display prices carry "display price, not executable"; XO books are cockpit-only and never shown above "indicative" |
| F | Portfolio and Wallet: `routes/portfolio.tsx`, `routes/wallet.tsx`, `features/portfolio/`, `features/wallet/` | every row is labelled "synthetic-shape tested"; the Polymarket "candidate" address is never computed (always null) |
| G | Signals: `routes/signals.tsx`, `features/signals/` | Quotient off until a licence tick; link overlay reads an optional `links.json` that does not exist, so it shows "no links" |
| J1 | Terminal (read): `routes/terminal.tsx`, `features/terminal/` | closed grammar, four read tools through `POST /ui/tool`, observer pane over the event stream |
| J2 | Prepare console: `features/terminal/prepare/` | order, cancel, redeem, fund, deploy, revoke; re-typing rule for pasted or proposed lines; mounted on the Terminal route at integration |
| H | Signing: `routes/signing.tsx`, `features/signing/` | Signature Card with rebuild check and two tags; no code path that sends a signature (AST test); S2 off |
| I | Trade: `routes/trade.tsx`, `features/trade/` | prepares and vets items; hand-off is text for an agent, never a send; no creation UI |
| Integration | `app/src/session.ts`, `app/src/SessionStatus.tsx` | the page exchanges its pairing code at load and says in words whether it is paired |

### Daemon (`bridge/`)
| Package | Files | Role |
|---|---|---|
| D1 | `origin.ts`, `auth.ts`, `static.ts`, `server.ts`, `main.ts` | loopback front, Host and Origin pinning, pairing, ui and agent tokens, static serving, route-module registry |
| D2 | `allowlist.ts`, `proxy.ts` | read proxy: closed per-service routes, JSON-RPC read methods only, no redirects, 8 MiB and 15 s caps, R9 pause, restricted venues off unless `XO_COCKPIT_VENUES` |
| D3 | `tool-classes.ts`, `arming.ts`, `kill.ts` | closed tool and route class table, tool gate, ARM window, one-way kill |
| D4 | `events.ts`, `inbox.ts`, `audit-adapter.ts` | SSE feed with resume, prepared inbox, audit feed and relay audit sink |
| D5 | `paybox-signer.ts` | S2 signer adapter, flag OFF, never exercised against a real PayBox; its CLI flow and output shapes were rewritten on 2026-10-21 to the published `@paybox-sh/sdk` 2.2.0 source |
| D6 | `shim.ts` | stdio MCP front for a running daemon |
| Integration | `status.ts` | `GET /ui/status`; also the joins in `main.ts` between daemon and relay |
| Tests | `bridge/test/{server,proxy,tools,events,signer,shim,integrate,e2e}/` | node:test |

### Plugin and relay changes (contract changes seen by the plugin)
These are the "asks" the design made of the plugin side (R1 to R9 and A-items), plus changes the review forced.
- **R1, decoded block.** `Prepared.decoded` (optional): the unpacked user operation, order or login, the call templates, derived terms. `verifyPrepared(item, rebuildFn)` in `src/relay/contract.ts` checks schema, kind, owner, account, validity, rebuilt digest, typed-data hash and domain, both tags, quote and caps and every summary line. The real rebuild is `src/xo/signing/rebuild.ts` (`rebuildDecoded`, `verifyPreparedLocal`); summary lines come from `src/xo/signing/lines.ts`. Rebuilding 11 real on-chain XO operations reproduced the logged `userOpHash`.
- **R2, inner tag.** `summary.inner_hash_tag` with `summary.inner_hash_kind` (`call_data` for operations, `typed_data_hash` for orders and logins).
- **R3.** `_meta["anthropic/requiresUserInteraction"]: true` on 14 write or prepare tools (not read tools, not `xo_cancel_order`).
- **R4.** Submit tools may return an `input_required` form elicitation when the client declares it. A wording and speed-bump aid, not a barrier.
- **R9.** New read tool `xo_get_prepared` (28 tools now, was 27). **No relay route serves it**, so against a real relay it answers `not_implemented`.
- **A5.** `HttpOptions.userAgent` may be `null` (no User-Agent header).
- **A7.** 12 new audit event names, allowlisted fields, opt-in hash chain (`relay/audit.ts`).
- **Caps.** A BUY counts principal x 1.10 (1,000 bps, `ORDER_CAP_FEE_BPS`); a SELL counts the larger of expected proceeds and shares x 1.00 USD (RT-3). Seeds keep 800 bps and $10.80. The fee tripwire still compares against 800 bps.
- **Funding.** The $3 test amount and the $10 lifetime total lift only on operator-recorded facts (FS-3, refusal reason `lift_needs_operator_fact`).
- **Owner confirmation.** An embedded relay with no `XO_OWNER` and no `XO_ALLOW_ANY_OWNER` refuses the first owner write for an unbound wallet until the call is repeated after 5 s inside 15 minutes (RT-2). A speed bump only.
- **Review-pass changes.** The plugin's prepare tools and `xo_withdraw` now compare the verified decoded block with what the caller asked for (`src/tools/prepared-match.ts`); typed-data intents must equal the canonical typed data rebuilt from the signed fields; an order's token must be a position id of the condition shown (`src/xo/signing/ctf.ts`); metadata URIs with credentials, backslashes or long authorities are refused.
- **Local mode (`src/local/cli.ts`).** `serve` (hands the runtime to `bridge/main.ts`), `shim`, `SIGUSR2` kill in stdio and serve mode; `scripts/build-local.mjs` builds `dist/local.mjs`. `dist/plugin.mjs` imports nothing from `bridge/`, `relay/`, `app/` or `src/local/` (checked by the integration pass).
- **Tool list.** 27 to 28 tools; the only added tool is `xo_get_prepared`. Fourteen write or prepare tools changed description, `_meta` and output schema; no input schema changed (integration pass).

### Tests and checks outside packages
- `app/e2e/` (65 then 71 Playwright specs) and `bridge/test/e2e/` (daemon end to end with a local mock XO, no network); `test/mock-xo/` real position ids after SC-7.
- Hygiene: `test/hygiene-identifiers.test.ts` scans `app/` and `bridge/` for personal identifiers and home paths.
- Docs: [docs/dapp-runbook.md](dapp-runbook.md), [app/README.md](../app/README.md), `src/local/README.md`, [docs/tool-contract.md](tool-contract.md), [NOTICE](../NOTICE).

## 3. Gate results

### 3.1 Integration pass (before the review and fix passes), as reported
| Gate | Result |
|---|---|
| `pnpm typecheck`, `pnpm typecheck:tests` | clean |
| `pnpm unit` | 5,503 tests: 5,492 pass, 0 fail, 1 skipped, 10 todo |
| `pnpm build` twice | identical sha256 `7f41286f034450c008fecc11c358e3870ab58733cdbb78753fe0d6f11b400564`, 917,805 bytes (**superseded**, see 3.3) |
| `pnpm --silent test` (starter conformance) | passed, 28 tools |
| `pnpm build:local` | built, `dist/local.mjs` 1,744,650 bytes (superseded) |
| `pnpm unit:bridge` | 762 of 762, twice |
| `pnpm --dir app run typecheck` and `typecheck:bridge` | clean |
| `pnpm --dir app run test` | 154 files: 140 passed, 14 skipped (live suites); 2,302 tests pass, 61 skipped, 1 todo, 0 fail |
| `pnpm --dir app run build` | both builds, about 1.1 MiB raw and 352 KiB gzip each over 25 files |
| `pnpm --dir app run check` | deps, boundaries, csp, origins, addresses, bundle (one viem, one zod), supply-chain, e2e-hygiene: ok |
| `pnpm --dir app run e2e` | 71 passed, 0 failed, 0 skipped, headless Chromium (Chrome 153, macOS arm64), zero security-policy violations |
| Real daemon (`node dist/local.mjs serve` with outbound connections blocked and logged) | wrong Host, `localhost`, rebinding Host, foreign Origin, cross-site fetch and preflight: 403; no or bad token: 401; pairing worked once; `/ui/status` all flags off; arming `flag_off`; submit tool `scope_denied`; proxy refused the signed-orders path and a JSON-RPC write; kill via route and `SIGUSR2` showed KILLED; no `Set-Cookie`; SIGTERM exit 0; shim initialised, listed 28 tools and forwarded a call |

The e2e result predates the fix pass. The fix pass changed the Signature Card, the address-book import, both fetch ports, arming and the event stream; **the browser suite was not re-run afterwards.**

### 3.2 Fix pass (after review), as reported by the three fix streams
| Area | Result |
|---|---|
| Plugin and relay | `tsc` clean for both projects; `node scripts/unit.mjs` (the guarded run): 5,565 tests, 5,554 pass, 0 fail, 1 skipped, 10 todo |
| App | typecheck (3 projects) ok; 144 files passed, 14 skipped; 2,356 tests pass, 61 skipped, 1 todo; builds ok; `check` ok |
| Bridge | `tsx --test bridge/test/**`: 840 tests, 824 pass, 16 fail (the SC-7 fixture problem above; an earlier run before the plugin change was 797 of 797) |

### 3.3 Final check (after the fix pass), as reported; verdict red
Run on a scratch copy (no `.git`, `node_modules` symlinked, `pnpm` dependency check disabled). Not a fresh install.
- Plugin: typecheck clean for both projects. `node scripts/unit.mjs`: 5,565 tests, 5,553 pass, 0 fail, 2 skipped, 10 todo (the todos are open findings documented in `test/profile-matrix/core-findings.test.ts` and one other). Two `pnpm run build` runs gave the same sha256 `73f5835c2dd67c4f33ba98a0e196605aec1dd81629f1f7ab7dbabfbbe3f7e691` (927,847 bytes). `pnpm --silent test` passed with 28 tools. `pnpm run build:local` twice gave `dist/local.mjs` sha256 `42c27a4ef95e381b136a4579b26d5c07aae8b1b5b683f804fca1acfd1f15b5f7`. The hash in v0.3 (`7f4128...`) and the `dist/plugin.mjs` currently in the working tree are stale; the working tree's `dist/` is gitignored.
- App: typecheck and `typecheck:bridge` clean; vitest 144 files passed, 14 skipped, 2,356 tests passed, 61 skipped, 1 todo; two production builds gave identical file hashes (52 files); `pnpm run check` ok including supply-chain and e2e-hygiene.
- Bridge: **FAIL**, 840 tests, 824 pass, 16 fail (section 1, item 1).
- Real daemon (production bundle, empty environment, throwaway data directory, loopback only; `lsof` showed one listening socket and no outbound sockets): wrong Host variants 403; no token and bad token 401; evil Origin 403 before the token check; preflight from an evil origin 403; pairing worked once and reuse got 401; `/ui/status` with the page token 200 with all flags false; `xo_submit_order` with the page token `scope_denied`; `xo_prepare_order` refused `flag_off` and audited; SIGTERM exited cleanly and removed `daemon.json`; modes 0700 on the data directory and 0600 on `master.key` and `agent-token.json`.
- Cockpit front with the local mock XO: a read journey through `/ui/read` returned list, contract detail and order book; a non-allowlisted service got 403; a traversal path 400; a POST to a read route 415; `xo_prepare_order` through `/ui/tool` was refused `flag_off`.
- **Gap:** no prepare with a write flag ON was run through the daemon. Prepare logic is covered by the unit suite only.
- Privacy sweep: no personal identifier, email or home path in source or any build output other than the following. One line in `docs/plan.md` names the repository's owner; it is also in the committed HEAD of that file, so it is not new, but it is in history. Test files build the author's login from fragments on purpose.
- Leftover processes: none started by the check. It reported an orphaned vitest worker (running for hours) and some old Node 20 test runners from earlier sessions that it did not start and did not kill.

### 3.4 Observed by this task (2026-10-20)
- `pnpm exec tsx --test bridge/test/signer/vet.test.ts` fails with the setup error quoted in section 1.
- `bridge/test/signer/fixtures.ts` line 69 still passes condition `0xabab...ab` to `buildDecodedOrder` (file read).
- `git check-ignore` returns "not ignored" for `app/src/venues/kalshi/fixtures/markets_list_recorded.json`.
- `package.json` scripts: `unit` is `tsx --test "test/**/*.test.ts"`; `unit:bridge` is `tsx --test "bridge/test/**/*.test.ts"`; `scripts/unit.mjs` and `test/net-guard.mjs` exist.
- I read `bridge/arming.ts`, `bridge/main.ts`, `bridge/contract.ts`, `bridge/status.ts`, `bridge/proxy.ts`, `bridge/shim.ts`, `app/src/features/explorer/adapters.ts`, `app/src/SessionStatus.tsx`, `app/package.json` and `app/pnpm-workspace.yaml` to correct the runbook. I confirmed: the `serve` options and the two `XO_COCKPIT_*` variables; arming refuses with `flag_off` or `no_page_stream` and disarms with reason `sse_disconnect`; the app has no kill or arm control (no reference to `/ui/kill`, `/ui/arm` or `/ui/disarm` in `app/src`); the explorer wires seven readers including Limitless; the app has seven runtime dependencies; the 14-day release age is set in both workspace files.
- I ran nothing else. In particular I did not re-run the plugin, app, e2e or live suites, and did not build anything.

### 3.5 Not run by anyone
`pnpm audit` and the root-isolation check (both need network or an install); any `APP_LIVE=1` or `XO_LIVE=1` suite; any live-test script (T0 to T8); any browser other than one headless Chromium on macOS arm64; Linux and Windows; a fresh install from the lockfile; the root `pnpm build` and `pnpm test` in the real tree after the fix pass; the Playwright suite after the fix pass; a real MCP client; a real PayBox account; a prepare with a write flag ON through the daemon.

## 4. Review findings and what became of them

An independent review (six reviewers) confirmed 38 named findings, no uncertain ones, and reported 32 further low-severity items as a count only. **The inputs to this log do not itemise those 32; their disposition is unknown to this log.** Dispositions below are as reported by the fix pass; "red then green" means the fix stream reported that the new test failed before the change.

| Id | Severity | Finding in short | Disposition |
|---|---|---|---|
| DS-1 | low | Static GET leaks an open file handle when the client disconnects mid-serve | Fixed (`bridge/server.ts`), red then green |
| DS-2 | medium | ARM window not tied to the page's own event stream | Fixed (`bridge/arming.ts`): only page-token streams count; the last one closing disarms; arming refused with no page stream. Consequence: an ARM window can start only while the Terminal screen's stream is open |
| DS-3 | low | "Every flag off" checked against raw environment, not the relay's effective flags | Fixed: arming and the signer read the relay's effective flags; an unreadable view means all off |
| DS-4 | low | ARM code, pairing link and agent token go to stderr and nothing checks it is a terminal | **Not fixed.** Needs a TTY requirement plus an escape hatch, and the e2e harnesses parse stderr. Mitigation: runbook section 9 says never let the agent start the daemon or redirect its stderr |
| DS-5 | low | The shim's "answers like the Cockpit" check can be imitated by any process | **Not fixed.** Needs a nonce-and-HMAC handshake on both sides. Mitigation: runbook documents that a fixed `--port` can be squatted |
| FS-1 | medium | Address-book import skipped the poisoning guards and could re-point a saved address | Fixed (`app/src/core/bindings.ts`); red then green. No pre-write diff screen; a bad record refuses the whole file |
| FS-2, A5 | low | Browser HTTP cache could keep memory-only venue data | Fixed: both fetch ports send `cache: 'no-store'` |
| SC-1 | high | Prepare tools did not compare the verified block with what was asked | Fixed in the plugin, also in `xo_withdraw`; red then green |
| SC-2 | medium | Card did not bound an order's signed expiration | Fixed (`features/signing/card.ts`); bound is the plugin maximum plus the item's stated lifetime, not a configured limit |
| SC-3 | medium | Unhashed typed-data content could ride in the signing intent | Fixed: intent must equal the canonical typed data rebuilt from signed fields |
| SC-4 | low | A failed card still showed the signable intent | Fixed: intent withheld on failure |
| SC-5 | low | Long metadata URI truncated on a verified card, hiding the host | **Partly.** Hostile URIs are refused at build and decode; the card display and a separate host row are unchanged |
| SC-6 | medium | Route-specific checks skippable; relay-asserted fields shown in a verified card | Fixed: route shape enforced; capabilities show "proven" only from local recorded facts; caps labelled as the relay states them |
| SC-7 | medium | Order market identity not bound to the signed token | Fixed in the shared rebuild. **This broke the bridge signer fixtures (open, section 1)**; the app fixtures were regenerated (below). The card does not yet mark the condition row as covered |
| SC-8 | medium | Card did not check login timestamp or operation validity against now | Fixed |
| A1 | medium | Polymarket search "cut off" flag dropped, so a truncated search looked complete | Fixed, red then green |
| A2 | medium | Rules-hash comparison missed real rule changes | Fixed with one shared recipe; the test was written after the code (red not run). Kalshi series sources are still not read |
| A3 | low | Link verification ignored the leg's live status | **Partly:** status added; tick, fee model and outcome-map comparisons need baseline fields that do not exist. Test written after the code |
| A4 | low | A keyed 200 that failed closed was not counted by the spend meter | Fixed, red then green |
| A6 | low | XO portfolio mixed units for cost and value | Fixed by deciding the unit from the same position; if undecidable, value and PnL are null with a flag and the row is kept. Test written after the code. The synthetic fixture outside `app/` still mixes units |
| A7 | low | Trueo `endOfTrading` shown as close; OpenForResolution shown as closed | **Not fixed.** Needs a new status representation |
| TM-01 | medium | A unit test could reach real XO hosts | Fixed for that test; a repo-wide net guard was added, but the root `pnpm unit` does not use it yet |
| TM-02, TM-03 | medium, low | No failing-case test for ticket versus prepared order, or for the money checks | Tests added (mutations make them fail) |
| TM-04 | medium | Read-proxy route table had no golden test | Test added |
| TM-05 | low | Failure and ambiguous wording unpinned | Test added |
| TM-06 | low | Audit-unhealthy exemption set unpinned | Test added, **and a real gap found and fixed:** prepare and submit tool calls were not refused while the audit log was unwritable |
| TM-07 | low | Inbox transition table under-tested | Tests added |
| TM-08, TM-09 | low | Reconcile answer not checked against the requested hash; ARMED shown after window end; rejection always announced as recorded | Tests added |
| TM-10 | low | Flags-off window closure and redundant signer checks untested | Tests added; one mutation (the signer's own inbox verification check) stays equivalent today because the same check runs earlier |
| TM-11 | low | "Null is not zero" for cost, Retry-After cap and money helpers untested | Tests added |
| TM-12 | low | Two app test files not independent of timing | Changed to a wall-clock wait; the failure did not reproduce unloaded, so no red run |
| F1 | medium | A resumed event stream carried no status, so a page opened after a kill showed "not known yet" | Fixed, red then green |
| F2 | low | Network failure or 5xx from XO shown as "paused" | **Partly:** the error mapping changed; there is still no "daemon not reachable" tile |
| F4 | medium | Quickstart said local mode has no `SIGUSR2` | Fixed (doc test) |
| F5 | low | Quickstart cost table stale after the 1,000 bps change | Fixed (doc test compares it with the scripts) |

Other open items the fix streams listed: SC-2 has no configured TTL limit to compare with; the plugin's text cleaner trims the leading spaces of summary lines (the trade page restores edge white space; the plugin and relay should agree on one form); four recorded prepare-order answers in `app/src/features/trade/fixtures/relay-answers.json` were regenerated (token ids and digests swapped) and are no longer verbatim plugin recordings.

Nine product findings remain as `todo` tests in `test/profile-matrix/core-findings.test.ts` (F1, F3, F4, F5, F6, G1, G2, G4, G5 of the core review, not the Cockpit review): refusals without a next action, a wrong "nothing was sent" message after XO minted a key, a kill switch lost on a supervisor restart, prepare handing out an intent for an account with no stored credentials, and others.

## 5. What is NOT built

- **The agent seat** (a bring-your-own-model panel in the page; design stretch item M). Only the `proposal` entry point on the prepare console and the proposal checks exist; nothing produces proposals.
- **M5 write commands beyond prepare.** The terminal grammar has prepare commands and refuses any flag or cap setter, raw call, `arm`, `kill` and `call`; nothing in the page sends, signs, cancels or withdraws. `ui.command` audit events are not emitted (no route for it).
- **S2 enabled.** The signer adapter exists and is off (`S2_ENABLED_IN_THIS_BUILD = false` in the page, `ENABLE_PAYBOX_SIGNER` and an acknowledgement of DT1 and DT3 required in the daemon). Everything it assumes about the PayBox CLI (sign output shape, credential listing, decline shapes) is a guess that fails closed.
- **`/mcp`.** The daemon has no MCP endpoint ("no MCP endpoint in this build"). Agents use `node dist/local.mjs shim`. `POST /ui/inbox/sign` is registered only by the signer module.
- **The relay route `GET /v1/prepared/{id}`** (so `xo_get_prepared` is `not_implemented` against a real relay; the inbox cannot rebuild an item after a daemon restart). Later: built in relay 0.3.0 (see docs/tool-contract.md, `xo_get_prepared`). The inbox now restores its in-flight items after a restart: the writer keeps their ids, owner, kind, requester and entry time (nothing signable, nothing secret) in `<data dir>/cockpit/inbox-ids.json`, reads each back with `GET /v1/prepared/{id}` at start, checks it like a fresh item and lists it again at `prepared`, or drops it with a reason on stderr and in the audit (expired, used, ambiguous, not found, answer not kept, relay too old, relay error, refused). See docs/dapp-runbook.md section 3.3 and bridge/inbox-restore.ts; tests in bridge/test/events/inbox-restore.test.ts and bridge/test/server/main.test.ts.
- **The page does not read recorded capability facts**; every capability shows "unproven" and the trade screens stay closed. Wiring needs a mapping from the relay's fact ids to the page's (`setTradeFactsSource`).
- **Market-creation UI** (decision O5), market making, bulk orders, non-XO trading.
- **Page controls**: no kill button, no arm control, no session renewal after 12 hours, one event stream owned by the Terminal screen.
- **Hosts and routes**: SX Bet, UDX, OG and the Polymarket geoblock host are not in `app/headers.config.ts`; the daemon's allowlist has no SX or UDX routes; no daemon-held Quotient key store; no screen switches a restricted-terms venue on. Kalshi, SX, UDX, Novig, Gemini, OG and DefiLlama are unreachable from any screen.
- **Data that does not exist**: platform registry data, the cross-venue link dataset, a build manifest or published build hashes; no reproducible-build claim is made. The Polymarket candidate address (CREATE2) is not computed.
- **Other**: Signals "for my holdings" and structural alerts; positions for Hyperliquid, Manifold, Limitless, SX, UDX and the restricted venues; a nonce handshake for the shim; a TTY requirement for the ARM code; the external security review the design requires before release.

## 6. What depends on the live tests

All live tests are opt-in real actions on third-party systems. None was run. A capability becomes "proven" in the page only when the operator records `yes`, and the page does not read recorded facts yet (section 5).

| Test | What it decides | What stays closed or unproven until then |
|---|---|---|
| DT1 (contains T0) | Does PayBox sign `raw` and `typedData` (chains 3223, 137, 1337, 4162), and what does its approval screen show | The whole XO write path through a user operation (deploy, enable trading, redeem, revoke); the two-tag wording on the Signature Card (M4-12); the meaning of `inner_hash_tag` for an approver; S1 end to end; the S2 enable condition |
| DT2 | Does the PayBox address carry an EIP-7702 delegation | The wallet screen does not call the address a plain EOA; x402 payer assumptions |
| DT3 | Does S2 (the daemon as a PayBox client) work end to end | S2 stays off. The commands, the approval flow (sign, read, `--complete-signature`) and the answer and listing shapes are read from `@paybox-sh/sdk` 2.2.0 (2026-10-21); what still needs the live run (the server returning the posted artifact unchanged, the raw scheme, low s, the signing window after approval, the failure shapes, the approval screen) is in `S2_ENABLE_CONDITIONS` and is refused until then |
| DT4 | Are grants independent per client and revocable | Documentation claims about separate grants (no code depends on it) |
| DT5 | Does the loopback UI work in Chromium, Firefox and Safari | Only one headless Chromium on macOS was tried; Local Network Access and Safari mixed-content behaviour unknown |
| DT6 | Does one paid Quotient call work from a plain EOA | Quotient mode B2 (daemon pays through PayBox) is not built; paid calls use the user's own key or an import |
| DT7 | Do the daemon and real MCP clients interoperate; do `requiresUserInteraction` and the elicitation dialog behave; external security review | No `/mcp`; the shim was tested only with the SDK and hand-written peers; the marker and the confirmation are unverified in a real client |
| DT8 | Do populated read shapes match (XO portfolio and positions, Pascal accounts, Limitless, Hyperliquid spot) | Every portfolio row stays "synthetic-shape tested"; Hyperliquid tile stays "unverified" |
| DT9 | Does the Polymarket derivation match the user's account | Not implemented; the candidate address is never shown |
| T1 (door a) | Does XO's bundler admit a first operation from an account XO never provisioned | If it fails, the XO write path stays closed and the Cockpit is a read-and-verify tool |
| T2 (doors b, c) | Does the orderbook register the account and accept the login signature | Orders |
| T3a (door d) | Does the orderbook credit USDC.e sent straight to the account | A derived account is not a deposit target on XO until recorded |
| T3b, T3c | First order accepted and cancelled; fee reconciliation | XO fees stay "a ceiling, not reconciled" |
| T4 | A verified way to take money out of XO | Funding is one-way and stays at test amounts |
| T5, T8 | Redeem; capped allowance and revoke | Redeem and revoke unproven |
| T6, T6b | Market creation | Not shipped in the page |
| `APP_LIVE=1` drift suites | Upstream shapes and CORS for each reader | Every shape and CORS statement in the adapters; constants such as `HYPERLIQUID_SHAPE_STATUS` and `QUOTIENT_SHAPE_STATUS` are flipped by hand after a person reads a run |

The live-test budget ceilings changed with the 1,000 bps cap: T3b $0.55 ($0.66 with probes), T3c $1.10, T8 $1.43. **These are real-money limits for tests nobody has run; check `docs/runbook.md` section 3 before running one.**

## 7. How to run it

From the repository root, after `source .tools/env.sh`:

```sh
# plugin, relay and local mode
pnpm typecheck && pnpm typecheck:tests
node scripts/unit.mjs            # the unit suite with the offline network guard (same file selection as pnpm unit)
pnpm unit:bridge                 # daemon tests; 16 fail today (section 1)
pnpm build && pnpm --silent test
pnpm build:local                 # dist/local.mjs, includes the daemon and the shim

# page (its own workspace)
pnpm --dir app install --frozen-lockfile
pnpm --dir app run typecheck && pnpm --dir app run test
pnpm --dir app run build && pnpm --dir app run check
(cd app && node e2e/install-browser.ts)    # the only step that uses the network; installs a project-local Chromium
pnpm --dir app run e2e

# use it
node dist/local.mjs serve                  # prints a one-time pair link on stderr; open exactly that address
node dist/local.mjs shim --check           # an agent host runs `shim --token-file <path>` instead
```

Start the daemon yourself in a terminal you watch; do not let an agent start it and do not redirect its stderr. Details, options, environment variables and the security statement are in [docs/dapp-runbook.md](dapp-runbook.md). A standalone (no daemon) build is `pnpm --dir app run build:standalone`, served from any static host with the headers in `app/scripts/examples/`.

## 8. Deviations from the spec worth knowing

- Seed caps stay at 800 bps ($10.80) while trades use 1,000 bps; the fee tripwire stays at 800 bps.
- The Cockpit's CSP has no `upgrade-insecure-requests` and the standalone CSP has no loopback entry (design 4.2 overrides the note).
- Paths follow design 5.4 (`/ui/*`, `/mcp`), not the earlier `/v1/*`.
- The owner-confirmation handshake is a speed bump, not a barrier; a compromised agent can repeat a call.
- The daemon's `--port`, `daemon.json` and the pair-link re-announcement are additions beyond the design.
- An item with no decoded block (an older relay) passes with a loud warning and `verification: unverified`; a mismatch is refused.
- Published tool output schemas for `Prepared` are a lean loose object to keep `tools/list` under the runner's size limit; the strict schema is enforced on every item coming in.
- Several decisions made by individual streams (rate limits, token lifetimes, ring sizes, 5 s and 15 min owner confirmation, the 90 s and 30 s signing windows) are the authors' choices and were not measured.
