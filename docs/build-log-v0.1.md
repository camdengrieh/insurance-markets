# Build log: XO Market plugin for PayBox, v0.1

Written 2026-10-19 on branch `build/xo-paybox-plugin` (HEAD 82d95ae; nothing is committed, every file listed here is untracked or modified in the working tree). It records what was built, how it was checked, what the post-build review found and what happened to each finding, what is not done, and how to reproduce the checks. It is a log, not a design: the designs are `docs/tool-contract.md`, `docs/signing-vectors.md` and `docs/plan.md`.

**How to read the evidence.** Each result below is marked either **re-run** (I ran it in the documentation step on 2026-10-19 and saw the output) or **reported** (an earlier build step ran it and reported the output to me; I did not repeat it). Nothing is marked as passing unless it was one of the two.

## 1. Summary

- **Built**: a single-file PayBox Open Plugin with 8 tools, all read-only: 7 XO read tools and 1 offline dry-run validator for market drafts. The bundle is `dist/plugin.mjs`, 516,853 bytes, sha256 `4522c64f72e1fbcb30c9fa4e053fc68eedfe2755df4bfda451e76c71d9a837f9`. Server name `xo-market`, version 0.1.0, protocol `2026-07-28`, starter release 1.0.2.
- **Checks that passed (re-run)**: typecheck of `src` (exit 0); typecheck of the tests (exit 0); unit suite 1,012 tests, 1,011 pass, 0 fail, 1 skipped; `pnpm test` (typecheck, two builds, determinism check, starter conformance) exit 0 with status `passed`, sample call passed, 8 tools discovered.
- **Not built**: every write tool (funding, withdrawal, Enable Trading, order prepare, submit and cancel, redeem, market creation), any relay, any credential store. The signing helpers and limit checks exist as pure offline modules that no tool imports.
- **Not verified**: any run in PayBox's hosted runner, whether `use_plugin` passes `structuredContent` to the agent (P9, release-blocking), populated-position and funded-wallet data, the meaning of `/balance-allowance`'s `allowance` field (Q19).
- **One blocker before anything is committed**: four `.pyc` files under `docs/research/fixtures/linking/correlation/scripts/__pycache__/` embed the author's home-directory path (section 9).

## 2. What was built

### 2.1 Tools in the bundle

All eight tools have strict zod input schemas (unknown properties refused) and strict output schemas, and are annotated `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`. The seven XO read tools have `openWorldHint: true`; `xo_validate_market_draft` has `openWorldHint: false`. None signs, pays, calls a PayBox tool or returns an `io.paybox/transactionProposal`. Full contract: `docs/tool-contract.md`.

| Tool | What it does | Upstream (GET only) |
|---|---|---|
| `xo_search` | Title-only, case-insensitive substring search over live CLOB (type 2) and Conviction (type 4) markets | Data API `/api/markets` |
| `xo_get_markets` | Paged, filterable (status, kind, category), sortable list; each page re-sorted client-side because XO returns pages in scrambled order | Data API `/api/markets` |
| `xo_get_market` | One market by `condition_id`: metadata, rules, an orderbook-derived quote for both tokens, a tradability verdict, the effective taker fee | Data API `/api/markets/contract/{condition_id}`; orderbook `/book`, `/last-trade-price`, `/fee-rate`, `/markets/{condition_id}`, `/trading-state` |
| `xo_orderbook` | Depth-limited book for one outcome token | orderbook `/book` |
| `xo_market_prices` | Best bid, ask, spread, last trade and depth for both outcomes | orderbook `/book`, `/last-trade-price` |
| `xo_positions` | Outcome-share positions for an address (100 largest) | orderbook `/positions`; Data API `/api/users/portfolio` (labels) |
| `xo_account` | Profile status, balance, claimable positions and exchange-wide trading state; `trading_enabled` is reported as `unknown` | orderbook `/balance-allowance`, `/claimable`, `/trading-state`; Data API `/api/users/portfolio` |
| `xo_validate_market_draft` | Free, offline lint, cost quote and creation-limit note for a draft Conviction market. Does not create anything and makes no network request; `duplicate_check` is always `not_run` | none |

Design rules that hold across the read tools (each has tests):

- Creator-written text (titles, outcomes, rules, descriptions, categories, creator names, resolution sources) is sanitised (normalised, hidden characters removed, length-capped, combining-mark runs capped) and returned only inside an object labelled `trust: "untrusted-user-content"` with informational flags. The one-line text block never contains creator text.
- Money and share amounts are decimal strings parsed to `bigint` with exact integer math. No floating point touches a price, size or balance.
- The only hosts the code can request are `api-mainnet.xo.market` and `orderbooks.xo.market` (hard allowlist in `src/xo/http.ts`; any other host throws). GET only, no credentials, no cookies, no redirects. Runtime User-Agent `xo-paybox-plugin/0.1`. Throttle of 4 requests per second per host, a per-host request budget reserved synchronously, an 8 s deadline per call (the hosted limit is 10 s), no caching across calls.
- Prices are never taken from the Data API detail routes (which return a constant `500000`) or from list display prices; quotes come from the orderbook. Fees use the larger of `/fee-rate` and `effectiveFeeConfig`; an unknown fee refuses to quote.
- Dates are strict ISO 8601 with an explicit zone and are returned in canonical UTC form.
- A one-line structured audit record is written to stderr per call (capped well under the runner's 16 KiB stderr limit).
- Optional plain environment variables, all with safe defaults: `XO_READ_ADDRESS_ALLOWLIST` (read by the read tools); `XO_KILL_SWITCH`, `XO_MAX_ORDER_USD`, `XO_MAX_DAILY_USD`, `XO_MAX_CREATES_PER_DAY`, `XO_ENABLE_CREATE`, `XO_ORDER_EXPIRY_SECONDS`, `XO_PRICE_BAND_TICKS`, `XO_QUOTE_TTL_SECONDS` (parsed in `src/config.ts`; no shipped tool enforces the spend caps because there is no write tool, and the draft tool only reports creation settings). The hosted project needs the two XO hosts in its network allowlist (two of 16 slots).

### 2.2 Modules built but not wired into any tool

- `src/xo/signing/` (13 files): exact-integer price and size handling, the 13-field order struct and hash, the Kernel v3.1 wrapper, ClobAuth (L1) typed data, HMAC (L2) canonical strings in several modes, wire-signature prefixes and canonical form, verify-by-recovery for orders and ClobAuth, GTD expiry rules (default maximum 3,600 s) and nonce rules, `prepareOrderSigning`. Golden vectors were compared across three independent methods (viem through the module, hand-rolled EIP-712 with viem utilities, and Foundry `cast` plus `openssl`): 48 values, all agree (`docs/signing-vectors.md`). Live acceptance of any of it by XO is unverified. Not imported by `src/plugin.ts` or any tool, so it is not in the bundle (the bundle contains no viem).
- `src/guardrails/limits.ts`: pure limit checks (per-order and daily caps, creation count, kill switch, price band, quote TTL). No clock, no I/O, no storage. Not imported by any tool.

### 2.3 File map

Source (`src/`, about 8,200 lines):

| Path | Role |
|---|---|
| `plugin.ts` | Entry: `McpServer`, `registerReadTools`, `registerDraftTools`, `serveStdio`. No network or heavy work at import time |
| `paybox.ts` | Starter file, verbatim (proposal builders; hash-pinned) |
| `config.ts` | Guardrail settings from plain environment variables |
| `tools/read.ts` | The seven read tools (exports `defaultReadToolDeps` so default wiring is testable) |
| `tools/draft.ts` | `xo_validate_market_draft` |
| `create/lint.ts` | Offline lint rules, cost quote, near-duplicate matcher |
| `xo/client.ts`, `xo/http.ts`, `xo/types.ts`, `xo/units.ts` | Defensive typed client for the public APIs, transport (allowlist, throttle, budget, deadline), types, exact number and id helpers |
| `xo/signing/*` | Offline signing helpers (section 2.2) |
| `guardrails/{amount,audit,constants,limits,untrusted}.ts` | Decimal-to-bigint, audit line writer, pinned constants, limit checks, sanitiser |

Tests (`test/`, 28 files plus fixtures): read path (`tools-read`, `xo-client`, `xo-http`, `xo-units`, `xo-fixtures`, `xo-live` opt-in); guardrails (`guardrails-{amount,audit,config,constants,limits,pins,untrusted}`); draft validator (`draft-{cost,dedupe,lint,tool}`); signing (`signing-{amounts,hmac,order,properties,signature,vectors,verify}`); starter and integration (`paybox`, `scaffold`, `integration`); `hygiene-identifiers` (scans docs, source, tests, scripts, root files and the bundle for personal identifiers). `test/fixtures/xo/` holds 61 JSON responses plus a manifest and loader: recorded live responses from 2026-10-18 (19 are named `live-*`), documentation examples and 5 synthetic ones (populated portfolio, balance, positions and claimable shapes that were never observed live).

Scripts (`scripts/`): `conformance.mjs`, `process.mjs`, `report.mjs`, `schema.mjs`, `test.mjs` are the PayBox starter 1.0.2 files, verbatim and checked against the release manifest; `call.mjs` is a dev harness written here (runs one MCP request against `dist/plugin.mjs` in a fresh process with a stripped environment and a 10 s limit).

Root: `package.json` (derived from the starter), `pnpm-lock.yaml` (starter lock plus the `viem` addition, +142 lines, 0 deletions), `pnpm-workspace.yaml`, `starter-version.json`, `tsconfig.json` (verbatim, covers `src` only), `tsconfig.test.json` (own, covers `src` and `test`), `paybox-plugin.json` (the conformance sample call: `xo_validate_market_draft` with a fixed offline draft), `.gitignore`, `.gitattributes` (modified: appended `* text=auto eol=lf`), `.editorconfig`, `NOTICE` (lists exactly what came from the starter and claims no copyright over it; no LICENSE file was added and no licence terms of the starter were looked up).

Docs: `plan.md`, `phase0-gate-results.md`, `phase1-gap-closing.md`, `research-notes.md`, `tool-contract.md`, `signing-vectors.md`, `aggregation-design.md`, `market-linking-design.md`, `platform-registry-design.md`, this file, and `research/` (notes 01 to 23, `design-panel/`, `fixtures/`).

### 2.4 Toolchain and dependencies

- Project-local, in `.tools/` (gitignored, so it is not in a clone): Node v24.21.0 darwin-arm64 (tarball sha256 `bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057`, matched against nodejs.org's SHASUMS256.txt) and pnpm 11.11.0 through the corepack bundled with that Node. `.tools/env.sh` puts them first on `PATH`, keeps corepack, pnpm, XDG and npm caches inside `.tools/`, and points the npm user and global rc files at empty files so no registry token in a home-directory rc file can be read or sent. Nothing was installed globally and the system Node 20 is never used.
- Exact pins: `@modelcontextprotocol/server` 2.0.0, `viem` 2.57.2, `zod` 4.4.3; dev `@types/node` 24.12.2, `ajv` 8.20.0, `esbuild` 0.28.2, `tsx` 4.23.12, `typescript` 5.9.3. `viem` is the only addition to the starter's pins. It is 2.57.2 rather than 2.57.3 because 2.57.3 was 13.91 days old by the machine's UTC clock (14.10 by the harness date) and the rule is 14 days; 2.57.2 is not deprecated, MIT licensed, has no install hooks and carries provenance attestations.
- `pnpm audit` (reported, at scaffold time): no known vulnerabilities in 53 dependencies. The post-build review noted that a dedicated dependency and provenance review was not done (sec-11).
- Starter 1.0.2 (reported): all 14 files downloaded from `developer.paybox.sh`; all 14 sha256 values matched the release manifest; every `.mjs` and `.ts` file was read in full and has no `fetch`, sockets, `eval`, telemetry or URL literals (the only `child_process` use is in the harness, to spawn the bundle and run `pnpm`).

## 3. Results

### 3.1 Re-run in the documentation step (2026-10-19)

All commands: `cd <repo> && source .tools/env.sh && <command>`, project-local Node 24.21.0 and pnpm 11.11.0.

| Command | Outcome |
|---|---|
| `pnpm --silent typecheck` | exit 0, no output |
| `pnpm --silent typecheck:tests` | exit 0, no output |
| `pnpm --silent unit` | exit 0. 1,012 tests in 184 suites; 1,011 pass; 0 fail; 0 cancelled; 1 skipped; 0 todo; about 2.5 s |
| `pnpm --silent test` | exit 0. Report: `reportVersion 1`, `starterVersion 1.0.2`, `protocolVersion 2026-07-28`, toolchain node 24.21.0 darwin arm64, `status passed`, `sampleCall` `xo_validate_market_draft` `passed`, `discoveredToolCount 8`, artifact 516,853 bytes, sha256 `4522c64f72e1fbcb30c9fa4e053fc68eedfe2755df4bfda451e76c71d9a837f9`, 4,469 ms. The script built twice and compared; stderr shows tsc then two esbuild runs (504.7 kb each) and no errors |
| `shasum -a 256 dist/plugin.mjs` and `wc -c` after the above | `4522c64f...37f9`, 516,853 bytes (identical to the reported earlier builds) |
| `tsx --test test/signing-*.test.ts` | 162 tests, 161 pass, 0 fail, 1 skipped (`docs/signing-vectors.md` still says 151 and 150: stale) |

The one skipped test in the unit run is a placeholder in `test/signing-vectors.test.ts` ("is not reproducible from the repo": the token id is elided in research note 01). The opt-in live suite `test/xo-live.test.ts` (7 tests) is skipped at suite level when `XO_LIVE` is unset and is not in the 1,012.

### 3.2 Reported by earlier build steps (not repeated)

- **Bundle history**: 391,450 bytes at scaffold (starter echo tool only), 512,575 bytes after integration (sha256 `afb7daa1...f1e4`), 516,853 bytes after the review fixes. The build is deterministic: two builds from a deleted `dist/` were byte-identical (`cmp`), and a build from a different checkout path gave the same sha256, so the bundle does not depend on the path.
- **Integration step** (817 tests at that point, 816 pass, 1 skipped): the unit suite was also green with the network blocked (0 attempts), `XO_*` variables poisoned (kill switch on, creation on, caps at ceilings, allowlist set), three time zones and `LC_ALL=C`, wall clock shifted by +120, +3,650 and -2,000 days, five repeats, and three runs under 32 busy processes. These hermeticity runs were not repeated at 1,012 tests. Five deliberate bugs planted in the cross-stream test file were all caught. `tools/list` over real stdio with an empty environment answered in 69 to 76 ms (8 runs, 0 stderr bytes, 8 tools, 54,862 bytes). The sample tool was called in the real bundle with the clock shifted by -3,000 to +36,500 days and never returned an error; its output always validated against the listed output schema (the verdict flips from pass to fail with `close_date_in_past` after 2027-01-01, which conformance accepts). Every input and output schema compiles in Ajv 2020-12 in strict mode.
- **Outbound hosts in the bundle** (integration step): the code can request only `api-mainnet.xo.market` (`/api/markets`, `/api/markets/contract/{condition_id}`, `/api/users/portfolio`) and `orderbooks.xo.market` (`/book`, `/last-trade-price`, `/fee-rate`, `/markets/{condition_id}`, `/positions`, `/balance-allowance`, `/claimable`, `/trading-state`). `globalThis.fetch` has one call site. The bundle imports only `node:process`. Other host names found in it (JSON-schema ids, one GitHub issue link, about 35 social and shortener domains in the lint's denylist) are strings that are never requested. No personal identifier is in the bundle.
- **Live checks against the public XO hosts, GET only, fix and final-check steps**: `XO_LIVE=1 pnpm exec tsx --test test/xo-live.test.ts` exit 0, 7 of 7 pass (8.96 s): discovery returned 100 unique markets over 2 pages with 0 skipped rows; ACTIVE item count 9 for the default scope and 396 for `marketType=2,4`; `take=51` refused locally; the orderbook quote check passed; fee check status `agree`, taker 0; a dummy address returns zeros and "no profile"; a closed market shows an empty book and clock skew 0 s. Request counts for that run: `api-mainnet.xo.market` 14, `orderbooks.xo.market` 16 (cap 150 each). Then each of the 8 tools was called once through the real bundle with the stripped-environment harness; all succeeded in 84 ms to 1,472 ms. Only the empty case was exercised for `xo_positions` and `xo_account` (the repo's dummy address, no XO profile and no balances): the populated shapes are covered by synthetic fixtures only.
- **Review fixes** (section 4): red-before-green for the real bugs, mutation checks for the test gaps. The mutation runs used throwaway scripts in a scratch directory; they are not in the repo, so the kill counts cannot be reproduced from the repo alone.

## 4. Post-build review and what happened to each finding

The review found 18 confirmed findings (5 medium, 13 low), 1 uncertain finding and 38 further low findings. Method for the fixes: for each real bug, write the failing test, see it fail against the unfixed code, fix, see it pass. For findings that were test gaps in correct code, apply one-line mutants to a scratch copy and show the new tests fail on the mutant and pass on the real code.

### 4.1 Confirmed findings: all 18 addressed, plus one bug found while fixing

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| F1 | med | `xo_account` derived "available cash" and "reserved in open orders" from `/balance-allowance`'s `allowance`, which is 0 on every funded wallet checked, so it reported "100% reserved" as fact | **Fixed.** Derived cash fields are always null; `allowance_raw_micro` returned as received with `allowance_semantics: "unverified"`; a warning fires when balance is positive and allowance is 0. Red 3 failing, then green. Reconciling the field is still open (Q19) |
| F2 | low | "Sorted by traded volume" claim, but XO's page order is scrambled and page membership shifts with `limit` | **Fixed.** Each page is re-sorted client-side (stable, bigint-exact, nulls last, all five keys, both directions); descriptions now say ranking is approximate across pages. Red 15 failing, then green |
| F3 | low | `kind` filter applied client-side after pagination, so `kind=conviction` returned empty early pages | **Fixed.** `kind` maps to `marketType=2` or `4` server-side (scope never widens); a client-side check still drops and counts wrong-kind rows. Red 2 failing; live check: page 1 returned 25 Conviction rows |
| sec-01 | low | Unicode normalisation is super-linear on long combining-mark runs; one hostile market could stall `xo_get_market` for about 4 s | **Fixed.** Runs of combining marks are capped at 4 before NFC/NFKC (invisible characters interleaved cannot dodge it). Red 4 failing; end-to-end hostile market now under 750 ms |
| sec-02 | low | Oversized or excess creator fields silently dropped; `resolution_sources_total` counted survivors; no warning | **Fixed.** Over-cap text is cut, not nulled; unreadable entries are counted; "Incomplete market data" warnings; totals count what XO sent. Red 8 failing |
| sec-03 | med | Untracked docs held the author's home path, GitHub handle and organisation, first name and an inventory of private local repositories | **Fixed in the working tree.** Paths and names redacted in 11 docs; note 13 aliased (private repo names replaced by aliases, session paths dropped); `test/hygiene-identifiers.test.ts` added (fails on the pre-redaction copy, passes now). `docs/plan.md` was left alone then: its one hit is the repository slug, already committed and exempted by name. See the `.pyc` blocker in section 9 |
| TM-01 | med | Sanitiser not proven to run on 12 of 15 creator-text fields | **Test-only.** Table-driven test over every creator-text path plus a whole-result walk. 15 of 15 mutants (12 plus 3 controls) killed. No source change needed |
| TM-02 | low | Date fields returned as the raw upstream string if `Date.parse` accepted them | **Fixed.** Strict ISO 8601 with an explicit zone, canonical UTC output; anything else refuses the row; output schema pins the pattern. Red 6 failing; 0 of 50 real rows skipped |
| TM-03 | med | Default wiring (real clock, `process.env`, default client) never exercised; tests always injected everything | **Test-only plus one export.** `defaultReadToolDeps` exported (no behaviour change); tests use only `registerReadTools(server)` and `registerDraftTools(server)` with `fetch` and `process.env` stubbed. 10 of 10 mutants killed |
| TM-04 | low | Hard caps, ceilings and budgets not pinned by literal assertions | **Test-only.** `test/guardrails-pins.test.ts` (14 tests) plus additions; 13 of 13 targeted mutants killed |
| TM-05 | low | Decoder size and shape bounds had no failing-case tests | **Test-only.** Boundary pairs (N accepted, N+1 refused) across the decoders; 15+ mutants killed |
| TM-06 | med | Fail-open and under-reporting branches had no test (unknown trading state, fee-rate-only, one-sided book, 51 claimable entries, locked book and others) | **Test-only.** 8 branches pinned; targeted mutants killed |
| TM-08 | low | No test that errors which must stay fatal are not swallowed | **Test-only.** Budget refusal, `invalid_input` and programming errors fail the call; throwing audit formatter returns `audit_format_failed`. Mutants killed. Found HTTP-RACE below |
| TM-09 | low | Starter proposal builders (`proposeEvm`, `proposeSolana`, `proposeX402`, `atomicAmount`) had no behavioural tests | **Test-only.** `test/paybox.test.ts` (24 tests); 23 of 23 mutants of `src/paybox.ts` killed; the file itself is untouched so its hash pin holds |
| TM-10 | low | Several draft-lint rules accepted bad drafts because their failing case was untested | **Test-only.** New failing cases; 16 of 18 mutants killed, 2 survivors judged equivalent (the dotless-host check already refuses `localhost` and `[`) |
| SIGN-1 | low | `buildL1Headers` normalised a recovery byte of 0 or 1 internally but emitted the caller's original string, so a signature the chain rejects was reported valid | **Fixed.** `canonicalWire` (lower-case, v 27 or 28, pinned validator) is emitted by the builders and wire verifiers. Red 3 failing |
| SIGN-2 | low | `prepareOrderSigning` enforced no expiry or nonce rule and the expiry helper had no default maximum | **Fixed.** `prepareOrderSigning` requires an expiry window and refuses expiration 0, past or beyond the window, and a non-zero nonce unless explicitly allowed; helpers default to a 3,600 s maximum. One existing test that asserted a 30-day TTL passes by default was changed. Red 4 failing plus an import failure |
| SIGN-3 | low | `unrecoverable_signature` branch never exercised | **Test-only.** Off-curve signature through all four verifiers; mutant killed |
| HTTP-RACE | (found) | The per-host request-budget check and the count were separated by an `await`, so parallel requests in one tick could overshoot the cap | **Fixed.** The slot is reserved synchronously and returned if the request never leaves. Red 1 failing |

### 4.2 Uncertain finding: not fixed

| ID | Finding | Why not fixed |
|---|---|---|
| CR-1 | Whether `use_plugin` hands the agent `structuredContent` or only the text block; the read tools put ids and prices only in `structuredContent` and a one-line summary in the text, so if only text arrives, `xo_search` to `xo_get_market` to `xo_orderbook` cannot chain | Cannot be settled without a PayBox call (forbidden here) and no repo source settles it. Changing the text block is a contract decision that interacts with the 256 KiB stdout limit. Recorded as release-blocking verification P9 (`docs/phase0-gate-results.md` section 4.2) and known gap 19 in `docs/tool-contract.md`. The live tool calls in section 3.2 confirmed the premise: the text block of `xo_get_markets` and `xo_search` carries only the summary line |

### 4.3 Low findings: 38, not fixed

None was fixed outright; three are partly covered by other fixes. They are recorded so they are not lost. Those that matter before any v0.2 work are marked with a star.

| ID | Finding |
|---|---|
| F4 | List `reviewStatus` is null upstream; not trivial to express without a schema decision |
| F5 | Fee status "agree" wording for a 0 bps `/fee-rate` |
| F6 | `winning_outcome` passthrough for VOIDED needs a decision and tests |
| F7 | Position labels use the default portfolio scope (Pulse positions unlabelled) |
| F8 | `status_raw` whitespace strip can show "ACTIVE" next to status "unknown" |
| F9 | Creator shown for type-2 markets, where the creator fields are constant |
| sec-04 | `min_order_size` remains any string of 40 characters or fewer (the date half is fixed by TM-02: partly covered) |
| sec-05 | Gaps in the invisible-character strip list |
| sec-06 | A hostile market can still push `xo_get_market` past the 128 KiB guard (the 20K caps make it much harder; error text unchanged) |
| sec-07 | Lint excerpt fields echo 30 to 60 characters of draft text |
| sec-08 | Draft tool output wording about plugin-enforced caps |
| sec-09 | Markdown and HTML in creator text are flagged, not removed |
| sec-10 | `.mcp.json` wires a third-party docs MCP server (committed project config) |
| sec-11 | A dedicated dependency vulnerability and registry provenance review was not done (the scaffold step did run `pnpm audit`) |
| TM-07 | Remaining thresholds and warnings in the read path (some now pinned by TM-04 and TM-06: partly covered) |
| TM-11 | Individual sanitiser flag patterns lack positive tests |
| TM-12 | Other audit-writer behaviours unpinned (partly covered by the audit pins in TM-04) |
| TM-13 | Signing constants and options are checked against themselves |
| TM-14 | `plugin.ts` protocol settings not covered by unit tests or the starter conformance run |
| TM-15 | A few vacuous or loose `xo-http` tests |
| TM-16 | Wall-clock assertions in the read-tool tests (the added ones use wide margins) |
| TM-17 | `pnpm unit` does not type-check and `pnpm test` does not run the unit suite (starter scripts are not ours to change, so the hygiene check lives in the unit suite) |
| TM-18 | Dead export and equivalent mutant survivors |
| CR-2 | 8 s call budget versus the 10 s hosted limit |
| CR-3 | Degraded book reads leave `warnings` empty and the audit outcome `ok` |
| CR-4 | Draft tool shows `creation_enabled` true under an active kill switch |
| CR-5 | `redactSecrets` e-mail regex is quadratic but only reached with 2,000-character input |
| CR-6 | Allowlist documentation wording about it being plugin-wide |
| SIGN-4 (star) | Undetermined L2 details (secret decoding, padding, `XO_ADDRESS`) are silently fixed to one choice |
| SIGN-5 (star) | The verifier is stricter than the chain (high-s, compact, EIP-191 wrapped signatures); `docs/phase1-gap-closing.md` says XO's own app signs EIP-191 and the verifier must accept both |
| SIGN-6 | `canonicalRequestTarget` versus WHATWG URL rewriting |
| SIGN-7 | Pinned domain and type objects are mutable at runtime |
| SIGN-8 (star) | The zero address is accepted as maker or signer |
| SIGN-9 (star) | Empty amount constraints sign sub-dust orders |
| SIGN-10 (star) | BUY cap checks do not add fee headroom |
| SIGN-11 | `kernelWrapDigest` and `buildKernelTypedData` are generic exports |
| SIGN-12 | Seven further surviving `signing-verify` mutants (SIGN-3 covers only the unrecoverable branch) |
| SIGN-13 | Three claims in `docs/signing-vectors.md` do not match the sources |

## 5. Deviations from the plan and the starter spec

1. `viem` 2.57.2, not the newest allowed 2.57.3 (clock reasoning in section 2.4).
2. `.gitattributes` was modified: its first two lines are untouched and `* text=auto eol=lf` was appended (redundant with the existing `* text=auto`; harmless).
3. Extra files and scripts beyond the spec: `tsconfig.test.json`, `test/scaffold.test.ts`, `scripts/call.mjs`, and the `package.json` scripts `call`, `typecheck:tests` and `unit`. `pnpm add` re-sorted `devDependencies`, so `ajv` moved to alphabetical position.
4. `.tools/env.sh` does not override `HOME` (git and `gh` need it); isolation is through `COREPACK_HOME`, `PNPM_HOME`, the XDG variables, the npm cache and empty npm rc files. `npm_config_store_dir` was dropped after pnpm 11 ignored it.
5. The personal-identifier scan is a unit test (`test/hygiene-identifiers.test.ts`), not an addition to `scripts/test.mjs`, because `pnpm test` does not run the unit suite and the starter scripts are not ours to extend. It reads text files only.
6. `docs/plan.md` was not edited by the fix step; this documentation step then updated it (status banner, Phase 0 outcome, in-place `[Phase 0: ...]` notes, ticked prerequisites, Next actions). The repository slug on its Context line was kept.
7. Note 13 was aliased rather than deleted, because other notes cite it. `.claude/settings.local.json` was added to `.gitignore`.
8. `defaultReadToolDeps` is exported from `src/tools/read.ts` so the default wiring can be tested.
9. The final check ran in a scratch checkout, where `pnpm run` first tried `pnpm install` (the `node_modules` symlink pointed at another workspace path) and aborted itself with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; it ran the commands with `pnpm_config_verify_deps_before_run=false`. Nothing was installed or removed and the real `node_modules` was untouched. In the real repo the check passes.
10. Network use during the build beyond the XO hosts: `nodejs.org`, `developer.paybox.sh` (14 requests), `registry.npmjs.org` and one `gh api` read of a public repository's NOTICE file. All were GET-only steps of the scaffold task. Scripted requests used User-Agent `insurance-markets-research/0.1`; the plugin's runtime User-Agent is `xo-paybox-plugin/0.1`.
11. In this documentation step no network request was made, no PayBox tool was called, no git state was changed, and no dependency was added or installed.

## 6. What is NOT done, and why

| Item | Why |
|---|---|
| v0.2 tools: `xo_fund_account`, `xo_withdraw`, `xo_enable_trading`, order prepare, submit and cancel, `xo_redeem` | Blocked by gates 1, 3, 4, 6 and 8 (conditional-go). No route for a PayBox wallet to own an XO smart account, no supported funding route, PayBox signing of chain-3223 domains untested, credential custody needs a relay that does not exist. The offline helpers are ready; nothing else is |
| v0.3 `xo_create_market` | Gate 5: XO's written permission, metadata hosting and seed timing are unresolved; the validator is built, the tool is not. The validator's `duplicate_check` is always `not_run` (the matcher is not connected to the client) |
| Relay service, credential store, durable ledger, live-test kit (`scripts/live/`), local mock XO and chain harness | Designed in `docs/phase1-gap-closing.md` sections 5 and 6; not built, and the live tests are opt-in actions the author must choose to run |
| `docs/runbook.md` | Not written |
| Hosted run in PayBox (hosted conformance, `paybox plugins contract`, Test console, `use_plugin`) | No portal access (blocker B0; the 2026-10-19 decisions in `docs/phase1-gap-closing.md` park it). The tests run against recorded fixtures and a stubbed `fetch`, and the bundle was exercised over real stdio locally |
| P9 / CR-1 (does the agent receive `structuredContent`?) | Needs the portal Test console or a real `use_plugin` call |
| Populated `xo_positions` / `xo_account` verified against a real funded wallet | No known funded public address and no authority to search for personal wallets; populated shapes rest on synthetic fixtures |
| A trading-enabled read | REST cannot return it; an explorer-log or `eth_call` read is untested. The tools say `unknown` |
| Live acceptance of any signing helper by XO | Needs a live account (not possible read-only, and the author's 2026-10-19 decision is that nobody contacts XO) |
| Meaning of `allowance` on `/balance-allowance` (Q19) | Needs a wallet with a known resting order |
| The 38 low findings in section 4.3 | Judged not worth the change now; several (starred) should be revisited before any v0.2 signing work |

## 7. Not verified (consolidated)

- Anything inside PayBox's hosted runner, including whether Cloudflare accepts `xo-paybox-plugin/0.1` from the hosted sandbox's egress address and whether GET with the plugin's fetch behaves the same there (all 8 live calls from this machine succeeded).
- Whether `use_plugin` passes `structuredContent` (P9).
- Any XO write-path behaviour: HMAC mode, signature prefix, minimum order size and rounding, order `nonce` semantics, the Kernel validator address as the gateway sees it, `CancelOrder` typed data, whether `POST /order` needs L2.
- Real populated data for positions, portfolio and claimable amounts.
- That the research counts quoted in the docs (active markets, review rates, transfer shares) still hold: they are single-moment snapshots taken on a machine clock a day behind the harness date.
- That the hermeticity results from the integration step still hold at 1,012 tests (not repeated).
- The mutation-kill counts (scratch scripts are not in the repo).

## 8. How to reproduce

The toolchain in `.tools/` is gitignored, so a fresh clone must recreate it: download Node v24.21.0 (darwin-arm64) from nodejs.org and check the tarball against SHASUMS256.txt (expected sha256 in section 2.4), unpack it as `.tools/node-v24.21.0-darwin-arm64/`, save the script in Appendix A as `.tools/env.sh` (it is not in git either), `source` it, enable pnpm 11.11.0 through the corepack bundled with that Node, then `pnpm install --frozen-lockfile` once. The scaffold step report records the outcome (`pnpm -v` prints 11.11.0, corepack 0.36.0) but not the exact corepack commands, so check `node -v` and `pnpm -v` before trusting any result. On a machine that already has the project-local toolchain:

```sh
cd <repo>
source .tools/env.sh                 # project-local Node 24.21.0 and pnpm 11.11.0
pnpm --silent typecheck              # tsc --noEmit over src
pnpm --silent typecheck:tests        # tsc --noEmit over src and test
pnpm --silent unit                   # 1,012 tests; the XO live suite is skipped
pnpm --silent test                   # typecheck, two builds, determinism check, starter conformance
shasum -a 256 dist/plugin.mjs        # expect 4522c64f72e1fbcb30c9fa4e053fc68eedfe2755df4bfda451e76c71d9a837f9
node scripts/call.mjs --list         # tools/list against the bundle with a stripped environment
node scripts/call.mjs xo_validate_market_draft "$(node -e 'process.stdout.write(JSON.stringify(require("./paybox-plugin.json").arguments))')"
```

`pnpm test` does not run the unit tests and `pnpm unit` does not type-check, so run all four. Do not run `pnpm add`, `install` or `update` as part of checking; the lockfile is frozen.

Optional, sends public GET requests to the two XO hosts (about 14 and 16 requests in the last reported run, throttled, hard cap 150 per host): `XO_LIVE=1 pnpm exec tsx --test test/xo-live.test.ts`. Do not run it from a machine whose user agent or logs you do not control; the plugin sets its own User-Agent `xo-paybox-plugin/0.1` and no identifying header.

## 9. Open issues and hand-offs

1. **Commit blocker.** Four untracked, not gitignored files, `docs/research/fixtures/linking/correlation/scripts/__pycache__/{leadlag_econ,lib,pmhttp,run_study}.cpython-314.pyc`, embed the author's absolute home path. They still exist. Delete them and the directory, add `__pycache__/` and `*.pyc` to `.gitignore`, and consider making `test/hygiene-identifiers.test.ts` scan binary files (it reads text extensions only). Not in the bundle; the bundle hash is unaffected.
2. **Stale statements in files this step does not own** (found while writing; not edited): `docs/phase0-gate-results.md` (header and sections 6 and 7) says there is no note 17 and that notes 15 and 18 have no Verification section; notes 15, 17 and 18 now have one (`## Verification (2026-10-19)`), and note 18's confirms the headline "no taker-side edge survives frictions" while correcting several secondary numbers. `docs/signing-vectors.md` says 151 signing tests; the current count is 162. `docs/tool-contract.md` numbers its v0.1 known gaps 17, 18, 19, 17 (the last should be 20). `docs/aggregation-design.md` section 0.2 and appendix B repeat the stale "no verification" statement (`docs/market-linking-design.md` already notes this).
3. **Identifiers still in docs**: the repository slug on `docs/plan.md`'s Context line, which is the only author-related one (already committed and exempted by name in the hygiene test; `docs/phase1-gap-closing.md` amendment A12 asks for it to be scrubbed before any publish); and third-party vendor contact e-mails in research notes 09 and 12 (not the author's).
4. **Research-process disclosures** that remain the author's to act on are in `docs/phase0-gate-results.md` section 10 (an e-mail address sent in a User-Agent by a research script, one POST sent, credential-bearing config files opened by a research stream with a recommendation to rotate them).
5. **Dependency requests**: none. No `pnpm add` is needed for the work recorded here.

## Appendix A. `.tools/env.sh` (as it exists on the build machine)

No identifiers, no absolute paths; every path is relative to the script's own directory.

```sh
# Project-local toolchain. Usage (from anywhere):
#   cd <repo> && source .tools/env.sh && pnpm --silent test
# Pins Node 24.21.0 and pnpm 11.11.0 and keeps every cache and config path inside .tools/
# so nothing is written to, or read from, the home directory.

_xo_src="${BASH_SOURCE[0]:-$0}"
_xo_tools="$(cd "$(dirname "$_xo_src")" && pwd)"

export XO_TOOLS_DIR="$_xo_tools"
_xo_node_bin="$_xo_tools/node-v24.21.0-darwin-arm64/bin"

export COREPACK_HOME="$_xo_tools/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export COREPACK_ENABLE_AUTO_PIN=0
export PNPM_HOME="$_xo_tools/pnpm-home"
export XDG_CONFIG_HOME="$_xo_tools/xdg/config"
export XDG_CACHE_HOME="$_xo_tools/xdg/cache"
export XDG_DATA_HOME="$_xo_tools/xdg/data"
export XDG_STATE_HOME="$_xo_tools/xdg/state"
export npm_config_cache="$_xo_tools/npm-cache"
# pnpm 11 keeps its content store under PNPM_HOME, so it stays inside .tools too.
# Empty rc files: pnpm reads $HOME/.npmrc by default (checked with a decoy HOME), so this keeps
# any registry token in it from being read or sent.
export npm_config_userconfig="$_xo_tools/npmrc"
export npm_config_globalconfig="$_xo_tools/npmrc-global"
export npm_config_update_notifier=false
export NO_UPDATE_NOTIFIER=1

mkdir -p "$COREPACK_HOME" "$PNPM_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" \
  "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$npm_config_cache" "$_xo_tools/bin"
: >> "$npm_config_userconfig"
: >> "$npm_config_globalconfig"

# Order matters: corepack shims (pnpm) and node first, so system Node 20 is never used.
export PATH="$_xo_tools/bin:$_xo_node_bin:$PNPM_HOME:$PATH"

unset _xo_src _xo_tools _xo_node_bin
```
