# Build log: XO Market plugin for PayBox, v0.2 and v0.3 (Phase 1 build)

Written 2026-10-19 on branch `build/xo-paybox-plugin` (HEAD 82d95ae; nothing is committed, every file listed here is untracked or modified in the working tree). It records what was built by which stream, how it was checked, what the post-build review found and what happened to each finding, what is not done, how to run the relay and the mock locally, and how to reproduce the checks. It is a log, not a design: the designs are `docs/phase1-gap-closing.md` (section 9 overrides the rest), `docs/everyone-architecture.md`, `docs/tool-contract.md` and `docs/runbook.md`. v0.1 is in `docs/build-log-v0.1.md`.

**How to read the evidence.** I (the author of this log) did not run the build, the unit suite, the matrix suites or the conformance. Every test and build figure below is **reported** by the stream or step named next to it, copied from that step's report. The only things I ran myself are listed in section 11 (a privacy scan of the two documents I own and the identifier-hygiene test). Nothing is marked as passing unless a step reported it passing. Where two steps reported different figures for the same thing (the unit run moved from 5,303 to 5,348 tests between the integration step and the fix pass), both are given and the later one is the current state.

**Nothing in this log is evidence about XO, Base or PayBox.** Every test ran offline against a local mock XO (`test/mock-xo`), a local anvil running the real account bytecode, recorded fixtures and a stub `fetch`. No signature was made by PayBox: PayBox was played by the public Anvil test keys. The mock's write surfaces are guesses from docs, labelled M. Passing the profile matrix shows robustness to the unknowns that were enumerated, not that XO accepts anything.

## 1. Summary

- **Built (local, mock-tested, every write flag off by default)**: 27 tools in one stateless plugin bundle (`dist/plugin.mjs`, 862,249 bytes, sha256 `8203c1364294b839b479a02fe160aefc1eaa7cf0f88a1ee52102d61ed253b1a6`, byte-identical across repeated builds); an author-operated relay (`relay/`, HTTP, entry `pnpm relay`); "local mode" (`dist/local.mjs`, a stdio MCP server with the relay in the same process, one data directory per user); a local mock XO with a real-bytecode anvil chain; a live-test kit (`scripts/live/`, 11 scripts for T0 to T8 and T3c, T6b, rehearsable on the mock) and `docs/runbook.md`; two profile-matrix acceptance suites (core and creation); user docs (`README.md`, `docs/quickstart.md`, `docs/safety.md`) and the day-zero decision record (`docs/everyone-architecture.md`).
- **Checks reported by the last two steps (fix pass, final check)**: `pnpm typecheck` and `pnpm typecheck:tests` exit 0 (both now include `scripts/live/**`); `pnpm unit` 5,348 tests in 864 suites: 5,336 pass, **1 fail**, 1 skipped, 10 todo, 0 cancelled; `pnpm test` (typecheck, two builds with a hash comparison, starter 1.0.2 conformance) exit 0, status `passed`, 27 tools discovered, sample call `xo_validate_market_draft` passed. The final check ran in a scratch copy of the repository with the project toolchain.
- **The one failing test** is `test/hygiene-identifiers.test.ts` on `docs/research/venues/atrum.md:57` (rule "temporary session directory"). The line contains only an abbreviated temporary-directory path with its tail elided; the final check read it and found no username, home path or session id. It is a false positive of an over-broad rule, but it is a real gate failure, and no build stream may edit `docs/research/`. Fix: reword that sentence or narrow the rule.
- **Review**: 44 confirmed findings (4 high, 19 medium, 21 low by the reviewers' labels), 0 uncertain, 38 further low findings not itemised, 2 refuted. A fix pass addressed all four highs; section 6 has every disposition. Unfixed on purpose: RT-3, SI-2, SI-4, F4 and the lows.
- **Not done**: every live test; any run against real XO, Base or PayBox; any real MCP client; Linux and Windows; the tripwire I/O checkers; ten known product gaps carried as `todo` tests (section 7). **No gate is closed.** The state after Phase 1 is in `docs/plan.md` ("Phase 1 outcome").

## 2. What was built, by stream

The streams ran in waves under the rules of `docs/phase1-gap-closing.md` section 5.3 (one owner per path). For the streams marked **tree only**, no stream report was available to this log; the file lists come from the repository tree and the stream names from the spec, and the only test figures for them are in the aggregate unit run. Stream reports that were available are marked **report**.

| Stream | Basis | Files (paths relative to the repository root) |
|---|---|---|
| wave0 (contract, error codes, flag names, tsconfig and script wiring) | tree only | `src/relay/{contract,errors,flags}.ts`, `tsconfig.relay.json`, the `scripts` block of `package.json` (`typecheck`, `relay`, `build:local`, `local`, `call:local`); tests `relay-contract*.test.ts`, `relay-contract-golden.test.ts`, `relay-flags.test.ts`, `relay-boundary.test.ts` |
| chain-account | tree only | `src/xo/chain/{constants,abi,reads,tripwires}.ts`, `src/xo/account/{derive,state}.ts`; tests `chain-*.test.ts`, `account-*.test.ts`; fixtures `test/fixtures/chain/` |
| userop | tree only | `src/xo/userop/{calls,encode,nonce,pack,hash,sign,verify,gas,bundler}.ts`; tests `userop-*.test.ts` (including a golden test and an anvil test); fixtures `test/fixtures/userop/` |
| mock-xo | tree only | `test/mock-xo/*` (orderbook, Data API, explorer, JSON-RPC, bundler, Hyperlane, creation, switches, profiles, faults, clock; its README is the usage doc), `test/anvil/*` (chain harness with the real EntryPoint, factory, validator and Kernel bytecode), bytecode fixtures `test/fixtures/bytecode/*.hex` (the EntryPoint, SenderCreator, factory, validator, Kernel implementation and PolicyPaymaster runtime) |
| relay-core | tree only | `relay/{server,config,auth,store,crypto,ledger,prepared,audit,capabilities,upstream,alerts,health,types,routes}.ts`; tests `relay-core-*.test.ts`, `relay-routes.test.ts`, `relay-stubs.test.ts` |
| relay-trading | tree only | `relay/{credentials,orders,userops}.ts`, the signing deltas in `src/xo/signing/*`; tests `relay-credentials-*.test.ts`, `relay-orders-*.test.ts`, `relay-userops-*.test.ts`, `signing-*.test.ts` |
| funding | tree only | `src/xo/funding/{preflight,calldata,steps,delivery}.ts`, `src/tools/fund.ts`, `relay/funding.ts`; tests `funding-*.test.ts`, `relay-funding-*.test.ts` |
| plugin-tools | tree only | `src/relay/client.ts`, `src/tools/{account,userop,trade,relay-tool-kit}.ts`, `src/plugin.ts`, `src/config.ts`, `src/guardrails/*`; tests `tools-*.test.ts`, `relay-client.test.ts`, `test/fixtures/tools/schema-snapshot.json` |
| creation-lib | report | `src/xo/creation/{metadata,diff,review,seed}.ts`; tests `test/creation-*.test.ts` (8 files); fixtures `test/fixtures/creation/` |
| lint-reconcile | report | `src/create/lint.ts` (2,830 lines, 90 finding codes), `src/tools/draft.ts`; tests `draft-*.test.ts` (6 files) |
| creation-wire | report | `relay/creation.ts`, `relay/watchers.ts`, `src/tools/create.ts`; tests `relay-creation-*.test.ts` (5 files), `relay-creation-helpers.ts`, `tools-create.test.ts` |
| live-kit | report | `scripts/live/{t0-paybox-signing,t1-deploy-enable-trading,t2-credentials,t3a-deposit,t4-exit,t3b-first-order,t3c-fee-reconciliation,t5-redeem,t8-capped-allowance,t6-creation,t6b-seed}.ts`, `scripts/live/{index,facts}.ts`, `scripts/live/lib/*` (harness, transport, redaction, world, registry, relay runner), `docs/runbook.md`; tests `live-kit-{core,scripts,run-a,run-b,run-c,operator}.test.ts` |
| embedded-local | report | `relay/embedded.ts`, `src/local.ts`, `src/local/{cli,runtime,server,paths,master-key}.ts`, `src/local/README.md`, `scripts/call-local.mjs`; tests `local-*.test.ts` (9 files), `test/local-helpers.ts`; edits to `relay/main.ts` (`assembleCore`), `relay/config.ts` (`requireRelayKey`), `src/relay/client.ts` (embedded transport) and `test/relay-boundary.test.ts` |
| user-docs | report | `README.md`, `docs/quickstart.md`, `docs/safety.md` |
| arch-doc | report | `docs/everyone-architecture.md` |
| matrix-core | report | `test/profile-matrix/helpers.ts`, `core-*.test.ts` (12 files) |
| matrix-create | report | `test/profile-matrix/create-rig.ts`, `create-*.test.ts` (12 files) |
| integrate | report | `relay/wiring.ts` (new), `relay/main.ts` (`createProductionRelay`, upkeep, stopper), `relay/embedded.ts` (uses the shared wiring), `src/xo/http.ts` (User-Agent), `src/tools/{account,userop,trade}.ts` (`pending` outcome), `src/tools/relay-tool-kit.ts`, `tsconfig.relay.json` and `tsconfig.test.json` (include `scripts/live`), `docs/tool-contract.md`, `docs/runbook.md` section 10, user docs wording; tests `tools-pending.test.ts`, `relay-wiring.test.ts` |
| fix | report | `relay/owners.ts` (new; the owner policy moved out of `embedded.ts`), and fixes in `relay/{upstream,orders,funding,creation,userops,store}.ts`, `src/tools/{trade,fund}.ts`, `src/xo/creation/diff.ts`, `src/xo/funding/*`, `src/local/{master-key,runtime}.ts`, the funding step in `src/relay/contract.ts`; new tests `tools-trade-relay.test.ts`, `relay-owner-http.test.ts`, `relay-credentials-guards.test.ts` plus additions (section 6) |
| plan-update (this step) | self | `docs/plan.md`, `docs/build-log-v0.2.md` |

### 2.1 The 27 tools

Reads (`readOnlyHint`, GET only, unchanged from v0.1 except the User-Agent): `xo_search`, `xo_get_markets`, `xo_get_market`, `xo_orderbook`, `xo_market_prices`, `xo_positions`. Offline: `xo_validate_market_draft`. Account and UserOps (through the relay): `xo_account`, `xo_connect`, `xo_deploy_enable_trading`, `xo_revoke_trading`, `xo_redeem`, `xo_submit_userop`, `xo_userop_status`. Trading: `xo_prepare_order`, `xo_submit_order`, `xo_order_status`, `xo_cancel_order`, `xo_list_orders`. Funding: `xo_fund_account`, `xo_withdraw`. Creation: `xo_prepare_create_market`, `xo_submit_create_market`, `xo_track_market`, `xo_respond_update`, `xo_cancel_market`, `xo_place_seed`.

Checks reported by the integration step: all 7 write flags default OFF (`ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING`, `ENABLE_FUNDING`, `ENABLE_WITHDRAW`, `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA`, `KILL`), confirmed in the running relay's `flags()` and in the local-mode start-up block. All 15 non-read-only tools say "off unless" or "dry run by default" and carry the "caps are advisory" sentence; all that sign also say approval-gated signing is the only mode in which a human sees each signature and that the XO owner should be a dedicated PayBox credential. `xo_cancel_order` needs no signature and lacks the last two sentences by design. The plugin's User-Agent is exactly `insurance-markets-xo-plugin/0.2` (it was `xo-paybox-plugin/0.1` until the integration step). `dist/plugin.mjs` contains no relay code and none of `node:fs`, `node:net`, `node:http`, `node:child_process`; tools/list with an empty environment took about 150 ms for it and 120 to 134 ms for `dist/local.mjs`.

### 2.2 Two modes, one tool set

- **Hosted plugin + author-operated relay** (`dist/plugin.mjs` with `XO_RELAY_URL` and `XO_RELAY_KEY`). Not usable from a PayBox-hosted sandbox today (no upload, decision 3; a hosted plugin cannot reach a localhost relay). The bundle speaks only protocol version 2026-07-28; an `initialize` with 2025-06-18 gets no result.
- **Local mode** (`dist/local.mjs`): same 27 tools, relay in-process, no socket, no relay key, one data directory (`XO_DATA_DIR`, 0700, files 0600), accepts both protocol versions, master key from `XO_MASTER_KEY` or a random `master.key` file in the data directory (disclosed design choice F4). This is the day-zero mode of `docs/everyone-architecture.md`. The relay starts in the background after the server listens, so tools/list never waits for it.

## 3. Results

All figures **reported**. "Re-run" below means re-run by that stream or step in this phase, not by me.

### 3.1 Whole-repo gate (fix pass and final check, the current state)

| Check | Outcome |
|---|---|
| `pnpm --silent typecheck` (`tsc --noEmit -p tsconfig.relay.json`, covering `src`, `relay`, `test`, `scripts/live`) | exit 0, no output |
| `tsc --noEmit -p tsconfig.json` (`src` only) | exit 0 (final check) |
| `pnpm --silent typecheck:tests` | exit 0 |
| `pnpm --silent unit` | tests 5,348; suites 864; pass 5,336; **fail 1**; cancelled 0; skipped 1; todo 10; about 2m17s (final check, in a scratch copy) |
| the failing test | `test/hygiene-identifiers.test.ts`, "finds none in the docs, source, tests, scripts and root files": `docs/research/venues/atrum.md:57 (temporary session directory)` |
| the skipped test | "XO live smoke (public GET only)" (gated on `XO_LIVE`, needs the network) |
| the 10 todo tests | F1, F3, F4, F5, F6 (`test/profile-matrix/core-findings.test.ts`), G1, G2, G4, G5 (`create-findings.test.ts`), and one "not reproducible from the repo" placeholder in `test/signing-vectors.test.ts` |
| `pnpm --silent test` | exit 0. One JSON line: `starterVersion 1.0.2`, `protocolVersion 2026-07-28`, node 24.21.0 darwin arm64, `status passed`, sample call `xo_validate_market_draft` passed, `discoveredToolCount 27`, artifact 862,249 bytes, sha256 `8203c1364294b839b479a02fe160aefc1eaa7cf0f88a1ee52102d61ed253b1a6`, 9,099 ms |
| determinism | `dist/plugin.mjs` built three times from a deleted `dist/` plus the two builds inside `pnpm test`: sha256 identical every time (`8203c136...b1a6`); the main tree's `dist/plugin.mjs` hashes the same, so the bundle does not depend on the checkout path. `dist/local.mjs` (1,255,956 bytes) built twice by the fix pass with identical sha256 (prefix `98a3e6ae8dfa5124`) |
| end-to-end through the built bundle (final check) | The production relay wiring (`createProductionRelay`) on 127.0.0.1 on an OS-picked port, the optimistic mock profile on a local anvil, a labelled test master secret, a random relay key, and four write flags on; every plugin call a fresh `node dist/plugin.mjs` process under `sandbox-exec` with all outbound network denied except loopback and a preload that maps the XO host names to the mock and refuses any other host. All 27 tools were called at least once, none timed out or returned a JSON-RPC error. Journey: account undeployed, deploy prepare/submit/status, account registered, connect, order prepare/submit (accepted)/status/list/cancel, redeem prepare/submit, fund and withdraw refused `flag_off`, create prepare (`metadata_ready`, then `prepared`)/submit/track, respond and cancel refused `precondition_failed` (nothing to respond to), seed prepare, revoke prepare/submit. The mock saw 215 requests, all with User-Agent `insurance-markets-xo-plugin/0.2` and none with `From`, `Referer` or `Origin`. Caveats: the relay ran in-process (not as `pnpm relay`, because `main.ts` cannot take a mock `fetch`); the children were SIGKILLed after replying, so clean exit on stdin close was not tested |

### 3.2 Per-stream results (as reported by each stream when it finished)

| Stream | Result |
|---|---|
| creation-lib | 385 tests, 385 pass in the 8 `test/creation-*.test.ts` files (56 suites). The libraries and tests were already in the repo from an earlier stopped run; this run audited and re-ran them and edited nothing. Coverage: 138 reconstructed metadata files valid and the same files made wrong all blocked; 51 rejected examples map to expected categories; 38 original-versus-suggested pairs through the diff guard; 585 recorded market histories replayed; idempotency, selector-closed latch, seed retry on 422 |
| lint-reconcile | six draft test files 346 tests, 346 pass; adjacent suites (hygiene, creation-corpus, creation-metadata, tools-schema) 126 of 126; creation-seed and creation-diff 124 of 124. Mutation check on the lint: all 208 mutants killed (202 first run, 6 re-run after stale patterns were refreshed). Lint went from 63 to 90 finding codes (27 new, none removed, none changed severity); `NOTE23_CHECKS` maps all 39 checks of note 23 to codes or to the module where they live |
| creation-wire | 82 tests, 82 pass (`tools-create` 39, `relay-creation-journey` 8, `-update` 10, `-guards` 13, `-profiles` 6, `-restart` 6); wider run with relay-boundary, tools-*, relay-userops-extension, relay-routes, relay-stubs 591 pass, 0 fail. A scratchpad bundle of `src/plugin.ts` passed the repo's conformance with 27 tools. 36 hand-made breakages of the guards: 30 caught at once, 4 survivors got new tests that then caught them, 2 survivors were redundant checks that a lower layer enforces and were kept |
| live-kit | `test/live-kit-*.test.ts` 239 tests, 239 pass (core 67, scripts 98, run-a 23, run-b 19, run-c 23, operator 9), about 24 s; all 11 scripts pass on the mock with the right budgets, all offline (the mock and a local anvil) |
| embedded-local | 9 new `local-*` files 108 tests, 108 pass; with `relay-boundary` 118 of 118. The anvil-backed `local-e2e` ran for real (4 tests). Regression sweep over the existing relay, credentials, funding, userops, orders and tools suites: 1,795 tests, 1,794 pass, 1 timing flake in `relay-core-restart` (passes 3 of 3 alone). Mutation checks on 11 guards all caught (after adding one test). Start-up timing from process spawn: initialize about 116 to 132 ms, tools/list about 125 to 143 ms, relay banner about 360 to 400 ms |
| user-docs | only `test/hygiene-identifiers.test.ts`, 4 of 4 pass; no network, `pnpm test` not run |
| arch-doc | no tests (documentation); privacy grep clean |
| matrix-core | 274 pass, 0 fail, 7 todo, 281 total, about 44 s wall clock (budget 90 s), run twice with identical counts. Typecheck of `test/profile-matrix` clean. Each invariant check is itself tested to fire on a run that breaks it. Both transports (HTTP, embedded) in one process |
| matrix-create | 323 tests, 318 pass, 0 fail, 5 todo, about 70 s in parallel; 184 journeys over 5 shards, both transports and about 94 profiles each; invariants C1 to C9 on top of core I1 to I9. Two full runs identical; one earlier concurrency flake fixed |
| integrate | `pnpm unit` 5,303 tests: 5,291 pass, 1 fail (the hygiene test), 1 skipped, 10 todo, about 136 s; `pnpm test` passed with 27 tools; bundle 860,983 bytes at that point (before the fix pass) |
| fix | `pnpm unit` 5,348 tests, 864 suites, 5,336 pass, 1 fail (hygiene), 1 skipped, 10 todo; `pnpm test` exit 0; bundle 862,249 bytes |

Mutation testing is a mixture of the streams' own throwaway scripts (not in the repository, so their kill counts cannot be reproduced from the repo) and the reviewers' mutation harness (finding group TM). Streams that did not report a mutation run did not do one.

## 4. Deviations from the spec (collected from the stream reports)

1. **Seed stake.** `seedPriceChoices`/`planSeedOrder` accept only a $10.00 stake (price 5 to 95 cents in 1-cent steps, 15 valid prices listed); with the 1.08 multiplier this is $10.80, the seed cap (A3, O3). The seed is a post-only GTD BUY of 7 to 30 days; no resting GTC order exists anywhere.
2. **138 metadata files are a reconstruction.** `test/fixtures/creation/corpus.ts` rebuilds them from note 23's statistics with invented prose; the original files are not in the repository. A byte-identity check against `docs/research/fixtures/gaps/creation-and-metadata-onchain` runs only when that directory exists. Review finding CL-7 stands: the verdicts were placed by the author, so those tests cannot disagree with the guard.
3. **Live-kit worst cases differ from the spec's section 6 table** (all per A3/A10, listed in `docs/runbook.md` section 3): T3a and T4 $3, T3b $0.54 ($0.66 with probes), T3c $1.08, T8 $1.41, T6b $10.80.
4. **`--prove-revoke` added to T1** (A11): two extra signatures at $0 test the on-chain revoke paymaster-less before any funding. Opt-in; without it T1 can pass but says the revoke is not proven.
5. **Live kit uses the real creation runtime**; the stand-in was deleted. A build without the real module refuses `create_market` on both targets.
6. **`xo_validate_market_draft` is a re-run lint, not a token.** `xo_prepare_create_market` re-runs the same lint and refuses on a fail; no stateful token proves the validate tool was called earlier.
7. **create_market takes its title from the hosted file**, not from `params.title`; the caller's title is only compared. The plugin compares the content hash the relay states with the hash of the file it built (not asked for by the spec).
8. **Owner policy semantics** (embedded and now HTTP): the owner is bound at the first accepted submit by a wallet whose signature was verified, not at the first prepare, so a hallucinated owner in a prepare cannot lock the real wallet out. `XO_OWNER` (a list) wins; `XO_ALLOW_ANY_OWNER=1` serves every wallet.
9. **Per-day creation ceiling removed from tests.** Two tests in `draft-cost.test.ts` and four lines in `draft-tool.test.ts` that asserted the per-day ceiling were rewritten to assert `plugin_cadence_cap` is `"none"` (decision 4). All other old test titles remain.
10. **Lint is stricter than note 23 in places** (M02 fails anything but Yes then No; R03 fails crypto markets without a time zone) and looser in others (C04 only warns for a date more than a day after the close). Single-source rules give an info note instead of a warning.
11. **`docs/tool-contract.md`** was updated only for the cadence text and the User-Agent; it still documents just the read tools and the draft tool.
12. **Tool counts in earlier streams' reports** (21 tools in local mode at the time embedded-local finished, 27 after creation was wired) differ because the creation tools landed later; the final figure is 27.

## 5. Network use during this phase

- No stream was allowed to contact the XO team, call a PayBox tool, or send anything real. The reports state none did.
- **Disclosure from embedded-local (its own mistake).** The first two runs of `test/local-embedded.test.ts`, before a loopback-only `fetch` guard was added, ran real relay handlers with the global `fetch`. Two tests had write flags on, and a dry-run userop prepare reads the chain without any flag. They very likely tried read-only requests to XO hosts: GET `explorer-mainnet.xo.market`, GET `orderbooks.xo.market` and a POST JSON-RPC to `rpc-mainnet-2.xo.market`, with User-Agent `insurance-markets-xo-plugin/0.2`, no secret, no personal identifier and nothing signed. Whether the sandbox let any request through is unknown. The JSON-RPC POST is covered by the "no JSON-RPC to any third party" rule, so this is a rule breach, small and read-only. Since then every `local-*` file installs the guard, which refuses non-loopback requests and fails the file if one is attempted; all later runs made none. The guard covers `fetch` only.
- The mock-chain capture step was permitted at most 25 unauthenticated GET requests to `explorer-mainnet.xo.market` for contract bytecode. The fixtures it produced are in `test/fixtures/bytecode/`; its stream report was not available to this log, so the request count is not confirmed here.
- Personal identifiers: every stream grepped its scripts and outputs for `@` and personal names; the final check scanned the tree (excluding `docs/research` and `node_modules`) and both bundles. The only hits are the repository slug on the Context line of `docs/plan.md` (committed earlier; the hygiene test exempts it by name) and a regex in `test/funding-tool.test.ts` assembled from pieces with no literal. Email-looking strings in tests are `example.*` placeholders. `docs/research` has third-party vendor contact emails copied from vendor docs (notes 09, 12, and `venues/verifact-markets.md`); they are not the author's. The bundles hold none of the Anvil test keys.

## 6. Post-build review and what happened to each finding

Reviewers: relay-security, signing-independent, funding-safety, creation-lifecycle, tests-mutation, conformance-repro, local-mode, red-team-agent. Counts: 44 confirmed, 0 uncertain, 38 further lows not itemised, 2 refuted. Method of the fix pass: for each real bug, a failing test first (red), then the fix (green); for test gaps in correct code, a mutant that must be killed. "Red then green" is as reported by the fix pass; "no" means the change was documentation, a wording change or a flake fix. No second review of the fixes is recorded.

### 6.1 Fixed

| ID | Sev | Finding (short) | Disposition |
|---|---|---|---|
| F1 | high | Cloudflare-fronted 503/403 HTML on a POST treated as a challenge: caller records "not sent" and the host is blocked 15 min | **Fixed.** `looksLikeCloudflare` takes the method; a 503 counts as a challenge only with `cf-mitigated` or on a GET with challenge wording. Red then green |
| FS-1 | high | A funding could be repeated without limit on one reservation | **Fixed.** Contract gains optional `step: "transfer"` on `/v1/funding/check`; the plugin sends it before handing out the `transferRemote` proposal; the relay marks the record `transferIssued` and refuses later checks (`funding_transfer_issued`) until reported or lapsed. Red then green |
| CL-1 | high | Diff guard passes a changed figure when the old one is restated elsewhere in the text | **Fixed.** Within `rules.description`, a figure/date/time that went away while a new one the original never stated appeared is a substitution and is flagged; the same for comparison families; `describeDiff` no longer says "no number changed" when some were added. Red then green; the 38 pairs still pass |
| RT-4 / SI-3 | high / medium | Every SELL refused by the plugin with `cap_exceeded: The amount must be greater than zero` after the relay already reserved cap | **Fixed in the plugin** (caps the relay's `reserved_usd` for a SELL). **Not fixed:** releasing the relay reservation after a plugin-side refusal. Red then green |
| F2 | medium | A gateway-accepted order treated as "never placed" and its reservation released after expiry when no list or fill log shows it | **Fixed.** Absence after expiry no longer releases; status says `unknown (accepted_then_absent_could_not_confirm)`; only an explicit terminal row releases. Ambiguous and rejected items keep the old rules. Red then green |
| F3 / RT-1 / FS-2 | medium | No owner allowlist on the HTTP relay; funding recipient derived from an agent-supplied `owner` | **Fixed (partly).** `relay/owners.ts`: the HTTP relay applies `XO_OWNER` / first-connected / `XO_ALLOW_ANY_OWNER` to owner write routes and binds on a successful submit; funding check also needs an established owner (`owner_not_established`) in both relays; docs and tool description say to set `XO_OWNER`. **Not done:** `xo_fund_account` reading the bound owner from the relay. Red then green |
| F6 | medium | L2 headers built after `beginSend` spent the approved item | **Fixed.** First POST body and headers are built before `beginSend`; a local failure leaves the item usable and sends nothing. Red then green |
| FS-5 | medium | One transfer hash bindable to several fundings | **Fixed.** `hash_already_bound`. Red then green |
| FS-3 | medium | Test-amount guardrail liftable by an agent-reported hash | **Fixed (partly).** A recognised transfer dispatched more than 60 s before the record was created is treated as not this funding. **Not done:** attributing a balance rise to the delivered message; stopping probe-learned FU6/FU7 from lifting the test amount |
| CL-3 | medium | Hosted metadata file read once at prepare; nothing re-verifies it at submit | **Fixed.** New `beforeSend` hook on `UserOpActionExtension`; create re-fetches the hosted file and refuses on change or unreachable (`metadata_changed`, `metadata_unreachable`) without spending the item; after inclusion a changed file raises a critical `creation_metadata_changed` alert. Red then green |
| SI-1 | low | Order expiry taken from `GET /time` with no plausibility check | **Fixed.** Prepare refuses when XO's time differs from the relay's clock by more than 120 s (`clock_implausible`). Red then green |
| L-1 | medium | Stale data-directory lock takeover not atomic | **Fixed.** Serialised by an exclusive `store.lock.claim` file. Deterministic interleave test. Red then green |
| L-2 | medium | `rotate-master-key` with a key file and `XO_MASTER_KEY_NEXT` wrote the passphrase into `master.key` | **Fixed.** Refused (`next_with_key_file`) with the correct procedure. Red then green |
| L-3 | medium | A stale lock with a reused pid locked the user out with no hint | **Fixed.** The message names `store.lock` as the leftover to delete, drops the "use another `XO_DATA_DIR`" advice (it would split caps and credentials) and fits the 500-character error limit. Not red-first (found when the longer draft broke a bundle test) |
| L-4, L-5, F1 (client key comment), FS-6 | medium / low | Docs said things false for local mode; the quickstart's first config did not work with a normal handshake; XO_RELAY_KEY comment; funding text claimed unproven third-party delivery | **Fixed, wording only.** `docs/safety.md` and README now state the local default (`master.key` file, same-user readability, default data dir, protocol versions); quickstart puts local mode first; funding text no longer claims delivery "usually under 30 seconds" for direct transfers |
| TM-1, TM-8 | low / medium | Credential guards without failing-case tests (`create_already_done`, key-limit and rejection paths, unreadable stored credential, undecodable secret, orders-list refusal) | **Tests only**; six mutants re-run and killed. `test/relay-credentials-guards.test.ts` |
| TM-4, TM-5 | medium | Creator-log read tolerated incomplete; relay-side end-time rules untested | **Tests only**; both mutants killed (`creator_logs_unreadable`, `create_params_invalid`) |
| TM-6 | low | Deployment re-check at userop submit untested | **Tests only**; mutant killed |
| TM-7 | medium | "A restart never resets a cap" tested only via journal replay | **Tests only**; a compacted-snapshot restart test; mutant killed |
| TM-3 | low | Upstream allowlist never pinned as an exact list | **Tests only**: exact-list pin and look-alike host probes. Mutation not re-run |
| TM-14, TM-15, F11 (flaky part) | low | Wall-clock-dependent tests failing on unmutated code under load | **Fixed:** `relay-orders-pending` no longer asserts at 5.0 s of mocked time; `relay-core-restart` uses a 5 s request budget except where it needs the pending answer; the integration step replaced a fixed 20 ms wait with a bounded poll. Not stress-run under load |

Integration-step fixes that came from putting the pieces together (not from the review): F2 and F2b of the matrix (HTTP relay had no account directory and the order and credential modules used different secret names, `hmac_triplet` versus `xo_triplet`), and G7 (the $1 creation fee reserved forever on the HTTP relay) are real tests now; `pending` answers no longer fail output validation in five tools; a `pending` answer to a read becomes an ordinary refusal.

### 6.2 Not fixed

| ID | Sev | Reason |
|---|---|---|
| RT-3 | medium | A SELL's cap is on proceeds and its price-band reference is the book's own best bid. A last-trade band for a SELL refused ordinary SELLs at the best bid on the default wide-spread test book (4 existing tests) and was reverted. Needs a product decision on the reference price. Cap-on-proceeds is decision D2 |
| SI-4 | medium | The plugin cannot verify that the digest it forwards commits to what was asked; the wallet shows an opaque `Kernel(bytes32 hash)`. Needs a contract change (prepare returning the full order fields or packed UserOp). Hosted mode only |
| SI-2 | low | The BUY cap uses a compiled-in 800 bps bound while the chain allows up to 1000. Wiring the fee-ceiling checker would make every submit fail closed whenever the explorer is unreadable. Needs a decision. The tripwire is still not wired |
| F4 | low | Master key in `master.key` next to the vault in local mode: a disclosed design choice for day zero. Docs say so plainly; no keychain default or flag added |
| RT-2 / L-9 | low | The first-connected owner binding can still be chosen by the agent; funding is refused until an owner is established and `XO_OWNER` is documented, but binding stays the default |
| FS-4 | low | Unreported funding reservations are still released as "absent" from the XO side alone |
| CL-2, CL-4, CL-5, CL-6 | low | Guard's cached pass not re-checked at accept; duplicate draft under a different URL not detected; no operator entry point for the creation latch; the 200-watch limit is never pruned |
| CL-7 | low | The creation corpus is still synthetic; the docs say so |
| RT-5, RT-6 | low | Calendar-day cap (orders either side of UTC midnight); gateway rejection text still reaches the agent in the submit message |
| the other lows | low | F7 to F10, F12, SI-5 to SI-8, FS-7 to FS-9, CL-8 to CL-11, TM-9 to TM-13, TM-16 to TM-18, the remaining conformance-repro items F2 to F7, L-6 to L-10, RT-7 to RT-9: skipped per instructions (low, not trivial). Their texts are not in this log's input |
| F5 (inside F11) | n/a | Not a finding: a cancel kill-switch test already exists |

## 7. Known gaps carried as todo tests or in the runbook

From the matrix suites and the integration step; the rows with an ID (F1, F3 to F6, G1, G2, G4, G5) are `todo` tests that start passing when the gap closes. Details and repros: `docs/runbook.md` section 10 and the findings files.

| ID | Gap |
|---|---|
| F1 | `xo_fund_account` and `xo_withdraw` refusals when the node cannot be read carry no next step |
| F3 | After XO minted a credential, a later relay failure still says "Nothing was sent" |
| F4 | The SIGUSR2 kill switch is an in-memory latch; a restart forgets it (the `XO_KILL_SWITCH` environment variable survives); local mode has no signal. The software kill switch also blocks the on-chain revoke |
| F5, G5 | `xo_prepare_order` and `xo_place_seed` reserve cap and return a signing intent for an account with no stored credentials; the refusal comes at submit |
| F6, G4 | With `order.sig_forms=eip191-only` a doomed order or seed loop keeps its reservation each turn and burns the day cap |
| G1 | An unreadable explorer is reported as `internal`, not as an outage |
| G2 | An unsettled earlier operation blocks the account 10 to 60 minutes (a creation attempt 24 hours) and the hint blames a relay timeout |
| not todo | Tripwire I/O checkers do not exist; `relay/userops.ts` `probeFirstOperation` records T1=yes by itself after a deployment lands, which with `ENABLE_FUNDING` on unlocks funding before the on-chain revoke is proven (use `--prove-revoke`); two names for the Base node (`XO_BASE_RPC_URL` in the plugin, `RELAY_BASE_RPC_URL` in the relay); address literals remain in three older files besides `src/xo/chain/constants.ts` (`src/guardrails/constants.ts`, `src/xo/signing/constants.ts`, `src/paybox.ts`; `test/chain-constants.test.ts` proves each equals the chain constants); the matrix-create notes O1 to O4 (a plugin-only lowered daily cap is not honoured for creation fees or seeds; a stale-nonce or rejected creation keeps its prepared item valid for up to 5 minutes; a metadata mismatch leaves a $1 reservation the caller never sees; hosted-file problems use the generic `precondition_failed` next step) |

## 8. What is NOT done, and why

| Item | Why |
|---|---|
| Any live test T0 to T8, T3c, T6b, Plan B | Opt-in, each a real action on XO's or PayBox's systems, the user's call (decision 1: no XO contact; the tests are the only way to settle the open items) |
| Any behaviour against real XO, Base or PayBox | Same; the mock's write surfaces are fixtures labelled M |
| PayBox upload, hosted conformance, `paybox plugins contract`, P9 | Decision 3 (no upload); B0 parked |
| A real MCP client; Linux; Windows | Never run. Local mode was tested through the standard `initialize` handshake with protocolVersion 2025-06-18, the stateless form the PayBox runner uses, and hand-written stdio framing, on macOS (Darwin 25.2, Node 24.21.0) only; the Windows and XDG path branches are unit-tested with injected values |
| Tripwire I/O checkers | Not assigned to any stream; only the pure functions exist. Fund only a test amount |
| The pessimistic-profile matrix for local mode beyond what the suites cover; a full fund-and-withdraw journey through the embedded relay on the Base chain mock | Not run; embedded e2e ran in the optimistic profile only, and fund/withdraw were exercised as refusals with flags off |
| A successful `xo_redeem` | Exercised only as a refusal for an unresolved market (embedded) and as a prepare/submit on the local chain (final check) |
| Review fixes for RT-3, SI-2, SI-4, F4, the lows | Section 6.2 |
| A second review pass over the fixes | Not recorded |
| `docs/tool-contract.md` for the write and creation tools | Only the cadence text and the User-Agent were updated; the new tools are described by their tool descriptions and the runbook |
| Multi-tenant hosted relay | Rejected for day zero in `docs/everyone-architecture.md`; the stateless hosted-sandbox variant (section 4 there) is a design only, gated on an upload path and test T2 |
| Multi-venue aggregation and Quotient | Unchanged: design only, outside the release gate |

## 9. Hand-offs for the author

1. **The failing hygiene test** (`docs/research/venues/atrum.md:57`): see section 1. `docs/research` was off-limits to every stream.
2. **Derived Kalshi-origin data may be stageable.** `.gitignore` blocks `docs/research/fixtures/kalshi/`, `fixtures/**/*kalshi*.json`, `fixtures/**/*quotient*` and `fixtures/linking/native_grouping_coverage_*.json`. The final check found files that carry Kalshi-origin content under other names, for example `fixtures/ibkr-forecasttrader-interactive-brokers-prediction-markets/ibkr_vs_kalshi_same_book_check_20261019.txt`, `fixtures/linking/cross_candidates_top.csv`, `linking/census_true_links.csv`, `linking/correlation/registry.json`, `linking/final_summary.json`, the `overlap_snapshot_20261019.txt` files, `defi-rate-prediction-markets-tracker/*.csv` and the `linking/code` and `linking/scripts` `.py` files that call Kalshi hosts. Whether these are "raw data" under the Kalshi Developer Agreement is a judgement call to make before any commit; I have not decided it. (The `.pyc` files that embedded a home path are gone and `*.pyc` is ignored; checked for this log.)
3. **Six stale processes** from earlier workflow streams: three pairs of `tsx --test test/relay-orders-pending.test.ts` under system Node 20 (two pairs run it from a copy under an earlier stream's scratch directory), parented to launchd, hung for hours. Not part of this build; I did not kill them. `ps` listed six matching processes when this log was written.
4. **Vendor contact emails** in research notes 09 and 12 and `venues/verifact-markets.md` (third-party; decide whether to redact).
5. **Credential-bearing config** read by a Phase 0 research stream (`docs/phase0-gate-results.md` section 10): recommended to rotate; unchanged.
6. **Dependencies**: none were added, removed or updated in this phase (`pnpm add/install/update/remove` were forbidden); `package.json` changed only in its `scripts` block (wave0 and embedded-local).
7. **Scratch copy used for the final check** needed its own `node_modules` clone and `pnpm_config_verify_deps_before_run=false`, because pnpm's workspace-state file records the original absolute path and `pnpm run` otherwise tries to reinstall (an earlier attempt with a symlinked `node_modules` aborted with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; the real `node_modules` was checked intact afterwards). In the real repository the commands run as written.

## 10. How to run the relay and the mock locally

All commands: `cd <repo> && source .tools/env.sh` first (project-local Node 24.21.0 and pnpm 11.11.0; never the system Node). Anvil must be on `PATH` for anything that uses the mock chain; tests that need it skip with a message if it is missing. Use a data directory outside the repository, mode 0700.

**Mock XO alone** (no network; every listener binds 127.0.0.1 on a port the OS picks):

```sh
pnpm exec tsx test/mock-xo/main.ts --profile=optimistic      # or pessimistic (the default, decision D9)
# optional: --no-chains, --set bundler.foreign_account=reject
```

It prints one JSON line with the listener URLs and stops every process on SIGINT or SIGTERM. `test/mock-xo/README.md` has the in-test API (`startMockXo`, `useMock`, `setupTrader`) and the list of switches.

**Local mode** (the relay runs inside the plugin process; this is what a stranger runs; flags off):

```sh
pnpm build:local                                   # writes dist/local.mjs
node dist/local.mjs check                          # shows data dir, key source, flags, caps; creates and opens nothing
claude mcp add xo-market -- node "$(pwd)/dist/local.mjs"      # any other MCP client: command node, one argument, the absolute path
node scripts/call-local.mjs --list                 # try it without a client (stripped environment, throwaway data directory)
```

Settings, flags and files on disk: `src/local/README.md`. A write path needs its `ENABLE_*` switch and either a recorded live-test result or `RELAY_ARM=<flag>`.

**HTTP relay** (`pnpm relay`, `createProductionRelay`): needs `RELAY_DATA_DIR` (no default), `XO_RELAY_KEY` (16 to 256 characters), and `RELAY_MASTER_KEY` (or a terminal prompt); `RELAY_PORT=0` picks a free port; binds 127.0.0.1 by default. **Its upstream hosts are the real XO hosts** (`main.ts` cannot take a mock `fetch`), so with all flags off it still makes read-only requests (account status, dry-run userop prepare). The mock-backed relay is available only in process: through the test suites, the profile matrix and the live-kit rehearsals. The hosted bundle talks to it with `XO_RELAY_URL` (for example `http://127.0.0.1:<port>`) and `XO_RELAY_KEY`: `node scripts/call.mjs <tool> '<json>' --env XO_RELAY_URL=... --env XO_RELAY_KEY=...` (the parent environment is never forwarded).

**Live-kit rehearsal on the mock** (the default target; signs with a public Anvil test key; nothing leaves the machine):

```sh
pnpm exec tsx scripts/live/index.ts                          # lists the tests in run order with worst case
pnpm exec tsx scripts/live/t1-deploy-enable-trading.ts --confirm --budget-usd 0 --prove-revoke
pnpm exec tsx scripts/live/<slug>.ts --help
```

`--target=live` is out of scope for this log; it needs `XO_LIVE_ACK`, an operator phrase and the preparations in `docs/runbook.md` section 2. Do not run it without reading that document.

## 11. How to reproduce the checks, and what I ran myself

```sh
cd <repo>
source .tools/env.sh
pnpm --silent typecheck            # tsc --noEmit -p tsconfig.relay.json (src, relay, test, scripts/live)
pnpm --silent typecheck:tests      # tsc --noEmit -p tsconfig.test.json
pnpm --silent unit                 # tsx --test "test/**/*.test.ts"; about 2.5 minutes; expect 5,348 tests, 1 fail (hygiene), 1 skipped, 10 todo
pnpm --silent test                 # typecheck, two builds with a hash comparison, starter conformance; writes dist/
pnpm build:local                   # dist/local.mjs
shasum -a 256 dist/plugin.mjs      # expect 8203c1364294b839b479a02fe160aefc1eaa7cf0f88a1ee52102d61ed253b1a6
node scripts/call.mjs --list       # tools/list against the bundle with a stripped environment (27 tools)
```

Single suites (no `dist/` writes): `pnpm exec tsx --test test/creation-*.test.ts`, `test/live-kit-*.test.ts`, `test/local-*.test.ts`, `test/profile-matrix/core-*.test.ts`, `test/profile-matrix/create-*.test.ts`, `test/mock-xo/*.test.ts`. The matrix suites take about 45 and 70 seconds; they run both transports in one process. Exploratory seeds are opt-in through `MATRIX_EXTRA_SEEDS`; the suites themselves use fixed seeds and injected clocks. `pnpm test` does not run the unit tests and `pnpm unit` does not type-check, so run all of them. Do not run `pnpm add`, `install` or `update` as part of checking; the lockfile is frozen. A fresh clone must recreate `.tools/` (see `docs/build-log-v0.1.md` section 8 and its Appendix A for the toolchain script).

**What I ran for this step (plan-update), exactly:** (1) a grep for at-signs, the author's first name and handle, home-directory prefixes and session ids over `docs/plan.md` and this file: the only hits are the repository slug and the `@paybox-sh/sdk` package name that were already in `docs/plan.md`, and the words quoted from a research note in section 5 of this file that name no one. (2) `pnpm exec tsx --test test/hygiene-identifiers.test.ts` twice. The first run failed on four lines: the research note and three lines of my own documents that quoted the temporary-directory pattern literally; I reworded mine. The second run: 4 tests, 3 pass, 1 fail, and the failure lists only `docs/research/venues/atrum.md:57`, so my two documents are clean and the gate failure is exactly the one reported above. (3) Read-only inspection of the repository tree, `package.json`, `.gitignore`, `scripts/call.mjs`, `relay/config.ts`, `test/mock-xo/README.md` and `docs/runbook.md` to write sections 2 and 10, and `find`/`ps` to confirm that no `.pyc` file remains and that six stale test processes are still running. I did not run `pnpm unit`, `pnpm test`, `pnpm build`, any typecheck, any mock, relay or anvil, and I made no network request, git change, or edit outside `docs/plan.md` and this file.
