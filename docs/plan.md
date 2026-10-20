# XO Market plugin for PayBox

> **Status (2026-10-19, after Phase 1): the whole local build is done and tested against a local mock and a local anvil only. No gate is closed; nothing has been run against a real XO, Base or PayBox service. Everything that remains is a live test (T0 to T8) that only the user can choose to run, plus five open items (O1 to O5).**
>
> - **What exists**: 27 tools (the 7 read tools and the offline draft validator from v0.1, plus the v0.2 account, userop, trading and funding tools and the v0.3 creation tools), an author-operated relay (`relay/`), a stdio "local mode" in which the relay runs inside the plugin process (`dist/local.mjs`), a local mock XO with a real-bytecode anvil chain, a live-test kit (`scripts/live/`, one script per test, rehearsable on the mock), and a profile-matrix acceptance suite. File map by stream, results and review dispositions: `docs/build-log-v0.2.md`. v0.1 history: `docs/build-log-v0.1.md`.
> - **Every write path is off by default** (7 flags: `ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING`, `ENABLE_FUNDING`, `ENABLE_WITHDRAW`, `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA`, `KILL`) and a flag that needs a live-test fact stays held until that fact is recorded or the operator arms it by name. Behind the flags the code is fully specified and tested; what it does against XO's real off-chain services is unknown.
> - **Checks as reported by the final-check step (not re-run by the author of this update)**: `pnpm typecheck` and `pnpm typecheck:tests` exit 0; `pnpm unit` 5,348 tests, 5,336 pass, **1 fail**, 1 skipped, 10 todo; `pnpm test` (typecheck, two builds with identical sha256 `8203c136...b1a6`, starter 1.0.2 conformance) passed with 27 tools discovered, bundle 862,249 bytes. The one failure is the identifier-hygiene test on `docs/research/venues/atrum.md:57` (an abbreviated temporary-directory path fragment in a research note that no stream may edit); it holds no real identifier. The 10 todo tests are open product findings (F1, F3 to F6, G1, G2, G4, G5, plus one placeholder), listed in `docs/runbook.md` section 10 and in the build log.
> - **Still not verified**: any real MCP client, Linux or Windows, any PayBox hosted run (no upload by decision), whether `use_plugin` hands the agent `structuredContent` (P9), and every XO off-chain behaviour behind the four doors in "Phase 1 outcome". Mock results show robustness to the unknowns that were enumerated, not that XO accepts anything.
> - **Nothing has been demonstrated end to end** (trade, fund or create) by anyone, and no third party is known to have placed, cancelled or created anything on XO through an external signer.
> - **Decisions of 2026-10-19 are binding for the build** (section "Decisions recorded 2026-10-19"): nobody contacts XO, PayBox's terms are no obstacle to an author-operated relay, local build with no PayBox upload, no creation cadence cap, approval-gated signing is the recommended mode.
> - **Superseded status (Phase 0, kept for history)**: "v0.1 (read tools) is built and passes its local checks (1,012 tests, bundle 516,853 bytes, 8 tools); v0.2 and v0.3 are not built." That was true until Phase 1; see the build logs.
>
> *Superseded banner (2026-10-18), kept for history: "planning only, no plugin code yet. Phase 0 is blocked on (1) the XO docs, which were unreachable from the research sandbox, (2) reading the public reference plugins (the clone was denied by the permission classifier), and (3) PayBox developer-portal access. See "Resume checklist" at the end and `docs/research-notes.md` for sources and confidence levels. Every XO-specific claim below is unverified."* Items (1) and (2) are resolved and (3) is open; most XO-specific claims below are now verified or corrected (see the `[Phase 0: ...]` notes).

## Phase 0 outcome (2026-10-19)

Source: `docs/phase0-gate-results.md` (sections 0, 2, 3), with follow-up in `docs/phase1-gap-closing.md`. Verdict vocabulary: **go** = every step has a verified mechanism and the tier can be built and tested now with no third-party confirmation. **conditional-go** = a specified path exists and every step has a primary-source mechanism, but release depends on named confirmations or tests by XO, PayBox or the author that nobody has done; if a named condition fails the tier becomes no-go.

| Tier | Verdict | Exact blocker (short form) |
|---|---|---|
| v0.1 read | **go** | None for building and local conformance (done; see the status banner). Shared blocker B0 (distribution) applies to hosted testing and release. |
| v0.2 funding + trading | **conditional-go** | A PayBox wallet must own an XO account that XO's stack accepts (gate 3); a third-party funding route (gate 6); PayBox must sign the chain-3223 Kernel typed data and the raw `userOpHash`, and autonomous-grant behaviour must be known (gates 4, 8); per-user credential custody through a relay (gate 1); B0. |
| v0.3 creation | **conditional-go** (lowest confidence) | Everything in v0.2 except funding, plus XO's written permission for programmatic creation above the ToS limit (1 market per calendar week, badge required), acceptance of self-hosted metadata, and seed-order timing while a market is `PENDING`. |

Top blockers, in the order the gate results rank them:

1. **Wallet ownership (gate 3)**: no documented route for a PayBox MPC wallet to own an XO Kernel v3.1 smart account; account creation is documented only through the XO web app. Blocks every write.
2. **Funding (gate 6, release-blocking)**: UI-only in XO's docs with the provider unnamed; the only on-chain inbound path is a warp route from Base; no documented bridge or deposit API; PayBox does not list chain 3223.
3. **PayBox signing (gates 4, 8)**: chain 3223 is absent from PayBox's catalog; whether it signs the Kernel typed data and a raw 32-byte digest is untested; PayBox's own docs contradict each other on whether signing under an `autonomous` grant needs a passkey.
4. **Credential custody (gate 1)**: per-user HMAC credentials cannot live in a hosted Open Plugin; an author-operated relay is the likely shape.
5. **Distribution (B0)**: Chapter 1 closed 2026-10-17 20:00 New York and no non-entrant upload path is documented.
6. **Caps are not a boundary (B2) and terms exposure (B3)**: a plugin cannot cap an agent that holds an `autonomous` grant; wash-trading, influence, region and creation-limit clauses constrain the author's decisions.

| Gate | Verdict | In one line |
|---|---|---|
| 1 Auth and credentials | partial | XO side fully specified (L1 ClobAuth, L2 HMAC, `XO_*` headers); custody of per-user secrets is open. |
| 2 Order flow | partial (downgraded from answered-go) | EIP-712 orders; prepare, sign, submit is mechanically sound but never demonstrated live; signed orders are bearer instruments. |
| 3 Smart wallet ownership | partial | Any EOA can own a Kernel v3.1 account in principle; no route is documented for a PayBox wallet. |
| 4 Chain 3223 and gas | partial | XO writes are ERC-4337 UserOps sponsored by a `PolicyPaymaster`, not PayBox proposals; PayBox support for 3223 matters for signing domains only. |
| 5 Market creation | partial | No API; a contract-level `createConvictionMarket` ($1.00 non-refundable fee) is revocable and outside the written ToS. |
| 6 Funding | partial (release-blocking) | No supported third-party path today; the on-chain route is Base only. |
| 7 Terms, bots, jurisdictions | partial | Nothing bans bots, but several clauses constrain the author's decisions. |
| 8 Sign-then-submit | partial (downgraded from answered-go) | A plugin cannot sign; the agent-orchestrated pattern is supported by PayBox primitives but not demonstrated; autonomous-grant behaviour is unresolved. |
| 9 Read-side fallback | answered-go | The Data API is public, so no fallback is needed; seven traps to build around. |

The decisions made after Phase 0 are recorded in the next section; the verdict table above is the Phase 0 state, and "Phase 1 outcome" below gives the state after Phase 1.

## Decisions recorded 2026-10-19

Source: "User decisions (binding, 2026-10-19)" in `docs/phase1-gap-closing.md`, relayed to every build stream as binding. They are the user's decisions; the research documents only recorded and applied them. (An earlier version of this section said they had not been re-confirmed with the author; they are now treated as standing.) They add to the 2026-10-18 decisions further down and replace the statements listed after them.

1. **Nobody contacts the XO team, in any way.** No email, no feedback channel, no partnership request. The open XO questions (`docs/phase0-gate-results.md` section 4.1, Q1 to Q19) are settled only by the opt-in live tests T0 to T8, or they stay open and the code degrades safely (fail closed, feature flag off, or mock-only). Consequence: there is no safe harbour from XO for programmatic creation or for a non-app account, and the exposure is accepted by the user (gate 7, with the caveat in O5).
2. **PayBox's terms are no obstacle to an author-operated relay** that holds users' XO HMAC credentials. This settles P6 as a decision, not as a PayBox statement: PayBox was not asked. It covers the relay the author runs; it was not extended by the build to a hosted service holding strangers' credentials (`docs/everyone-architecture.md` section 2 reads it that way and rejects a hosted multi-tenant relay for now; that reading is the document's, not a user statement).
3. **Local build, no PayBox upload.** The plugin is built and tested locally. Blocker B0 (distribution) is parked, not solved; P9 (does `use_plugin` hand the agent `structuredContent`?) and every other hosted-runner question stay open because they need an uploaded plugin.
4. **No creation cadence cap.** There is no maximum-creates-per-day setting any more. The $10 per order and $50 per day caps stay, environment-configurable. The $1 creation fee counts toward the $50 day and a seed counts as an order (defaults D5/D2 of `docs/phase1-gap-closing.md`), so the day cap is the only brake: about 45 fee-only creations, or about 4 with seeds, per day. XO's written limit (one market per calendar week, Catalyst Badge required) is still shown as a warning in every creation approval and reported by the draft lint under `limits.tos`; the plugin does not enforce it.
5. **Approval-gated signing is acceptable, and it is the recommended mode.** Reason: the plugin cannot sign anything, so under an `autonomous` PayBox grant an agent can call `request_wallet_sign` itself, sign a ClobAuth to mint its own XO credentials, and talk to XO directly, bypassing the relay and every cap. In approval-gated mode (`iframe` or `always_approve`) a human sees each signature, which matches the profile: at $10 per order and $50 per day that is at most a handful of approvals a day. **Its limits (amendment A4)**: the claim holds only against a cooperative agent. `raw` signing has no domain separation, so a compromised agent can request a signature over an Ethereum transaction hash or a UserOp hash, and the approver sees an opaque digest, not a decoded order (the relay's `digest_tag`, the first 16 hex digits of the digest, is anti-accident only). The PayBox owner key is also that wallet's own Base address, so one blind approval can move its Base funds, not only the XO account. Therefore for any funded use: the XO owner is a **dedicated PayBox credential** that holds only what the user will fund (open item O1), `typedData` is preferred over `raw` wherever XO accepts both, `autonomous` is for a throwaway test credential with test amounts only (T0), and every tool description that signs or sends says the caps are advisory against a compromised or prompt-injected agent.

**Earlier statements these decisions supersede** (the original text is kept in place with a note):

| Earlier statement | Where | Status |
|---|---|---|
| "At most 2 markets created per day" (caps), "max 2 per day", "creation rate limit (2/day)", `XO_MAX_CREATES_PER_DAY` | Decisions recorded 2026-10-18; Staged delivery v0.3; Guardrails | **Superseded by decision 4.** No such setting exists in the code; the only hits left in the repository are negative tests and history. |
| "Plugin must work under autonomous grants", "guardrails that hold even when a wallet grant is `autonomous`", "enforced in the plugin; do not rely on prompts or human approval", "creation is always approval-gated even when the credential is autonomous" | Context; Guardrails; Staged delivery | **Superseded by decision 5** (and already shown impossible in Phase 0). The assumption is replaced by: approval-gated is the supported mode, caps are advisory against a compromised agent, `autonomous` is for a throwaway credential. |
| "Decide whether anyone contacts XO" and "the gate results' rank 1 recommendation (send the full list)" | Next actions item 1 | **Decided: no one contacts XO** (decision 1). |
| P6 "may a relay hold user credentials under PayBox's developer terms" | Next actions items 2 and 4; Decisions still open | **Treated as answered by decision 2** (not by PayBox). |
| "Access to the PayBox developer portal for upload and conformance checks" | Prerequisites item 4 | **Parked by decision 3.** |

The 2026-10-18 decisions on packaging, self-trading, creation as a must-have, the $10 and $50 caps and funding in the flow are not changed by these five.

## Phase 1 outcome (2026-10-19)

Sources: `docs/phase1-gap-closing.md` sections 0, 1, 4, 6 and 9 (section 9, the amendments after the critic pass, overrides every earlier section), research notes 19 to 23 with their Verification sections, and `docs/build-log-v0.2.md` for what was built and how it was checked. Phase 1 had two halves: a research synthesis that settled everything readable without contacting XO (constants, byte layouts, formulas, digests, policies), and a build of the whole write path (relay, tools, local mode, live-test kit) tested against a local mock XO and a local anvil that runs the real account contracts. **Neither half closed a gate end to end.** The mock proves the code is robust to the unknowns that were enumerated; it proves nothing about whether XO accepts anything.

### Gate table after Phase 1 (section 1 as amended by section 9)

| Gate | Phase 0 | After Phase 1 | What moved |
|---|---|---|---|
| 1 Auth and credentials | partial | **partial** (narrowed) | Wire shape, test vectors, relay design and a probe protocol are complete (L1 tagged M, amendment A7: the gateway has accepted none of our signatures). Derive-returns-secret, key cap, DELETE level and HMAC target are live-only. Custody is solved by decision 2 plus the built relay. |
| 2 Order flow | partial | **partial** (narrowed hard) | Nonce rule, signature construction, both digest forms, rounding, fee bound, absence of on-chain cancel settled at contract level. Gateway acceptance of a PayBox-owned account, minimum size, GTD minimum and L2 on `POST /order` are live-only. |
| 3 Smart-wallet ownership | partial | **partial** (A answered, B not establishable) | Any EOA can own a deterministic Kernel v3.1 account; derivation and the deploying UserOp are proven on chain code. Whether XO's off-chain stack accepts and registers a self-derived account is XO's (doors a to c). |
| 4 Chain 3223 support and gas | partial | **partial** (narrowed) | UserOp construction, hashing, signing, nonce, gas, keyless reads and the sponsorship policy are settled. Foreign-account bundler acceptance, PayBox `raw`, and policy stability are open. |
| 5 Market creation | partial | **partial** (narrowed) | The create selector is open to any address today; fee, batch, review loop and costs are measured. Self-hosted metadata acceptance (T6) and a seed on a pending market (T6b) are not establishable. |
| 6 Funding | partial (release-blocking) | **partial** (relabelled by amendment A6; section 1 of the synthesis had said deposit leg answered-go) | The deposit mechanism is verified by source and simulation only. Third-party delivery is unobserved: all 483 deliveries and 34 sampled transactions went through XO's own executor. A new door (e) is added. The withdrawal leg has no verified path (hypothesis H1, test T4). |
| 7 Terms, bots, jurisdictions | partial | **partial** (unchanged) | No XO statement added. The user accepted no-contact; "user accepted the exposure" for creation is an inference of the synthesis and is open item O5. |
| 8 Sign-then-submit | partial | **partial** (XO half closed) | What digest to sign, in which forms, with which prefix, with no timestamp. PayBox half untouched: `raw` output shape, `typedData` on 3223, autonomous behaviour, window rendering. |
| 9 Read-side fallback | answered-go | **answered-go** (with additions; wording narrowed by A8) | Trading-enabled, deployment, nonce tripwire, fee-ceiling changes and resolution are readable keyless from explorer logs and, when an RPC is open, `eth_call`. Owner-to-account lookup is refuted: derive locally. |

Tiers: **v0.1 read: go** (built). **v0.2 funding, trading, redeem: conditional-go**, now fully specified, built and mock-tested; release depends on the user running T0 to T4. **v0.3 creation: conditional-go, lowest confidence**; adds T6, and if T6 fails creation stays blocked (no "draft plus link" substitute, by the 2026-10-18 decision).

### The four doors, and door (e)

Everything that remains open sits behind XO's off-chain stack, and none of it is observable read-only. Do not fund an account before T1 passes: USDC.e minted to an undeployed account can only be moved by a UserOp, which needs door (a).

| Door | Question | Opened by |
|---|---|---|
| (a) | Does the bundler admit a first UserOp from an account XO never provisioned? (Without it the whole write path is dead; self-bundling is not available to outsiders.) | T1 |
| (b) | Does the orderbook register that account (`smart_account` non-null), and how? | T1, T2 |
| (c) | Does the L1 ClobAuth check accept it (deployed account; ERC-6492 for an undeployed one is unknown)? | T2 |
| (d) | Does the orderbook credit USDC.e that was minted straight to the account? | T3a |
| (e) | (added by A6) Does XO's relayer deliver a Hyperlane message that did not come through XO's own executor? The router pays no gas, and recovery by `process()` needs native XO that outsiders lack. | T3a |

### The live tests are the only way forward

Because nobody contacts XO (decision 1), T0 to T8 are the only way to settle these. None has been run, by anyone. Each is optional, needs the user's explicit go, and is a real action on XO's or PayBox's systems. The kit in `scripts/live/` has one script per test, rehearsable end to end on the mock (`--target=mock`, the default), prints every call before making it, and on the live target refuses without `--confirm`, an explicit `--budget-usd`, `XO_LIVE_ACK=<test>` and a typed `RUN <test>` phrase. Capability facts are recorded only after the operator types the exact phrase. Procedure and costs: `docs/runbook.md`. Recommended order: T0, T1, T2, T3a, T4, T3b, T3c (optional), T5, T8, then T6 and T6b.

| Test | Settles | Worst case |
|---|---|---|
| T0 PayBox signing probes | `raw` and `typedData` output shape, 3223 domain, autonomous behaviour, window rendering (PayBox half of gate 8) | $0 |
| T1 Deploy plus Enable Trading | door (a), part of (b); `--prove-revoke` also tests the on-chain revoke paymaster-less (A11) | $0 |
| T2 Credentials and gateway probes | derive-returns-secret, key cap, DELETE level, HMAC target, doors (b), (c) | $0 (uses the account's one key slot) |
| T3a Deposit | door (d) and (e) | $3 plus Base gas |
| T4 Exit test (H1) | whether a paymaster-less `transferRemote` withdrawal works; decides whether funding beyond the test amount is allowed | $3 (the same money; stranded if it fails) |
| T3b First order | gateway order rules (prefix, digest form, minimum size, GTD minimum, duplicate key, cancel) | $0.54; $0.66 with probes |
| T3c Fee reconciliation (optional) | which fee figure is real | $1.08 |
| T5 Redeem | nonce lanes, policy for a foreign account | $0 |
| T8 Capped allowance, revoke, kill switch | whether a capped Enable Trading allowance is enough for the exchange | $1.41 |
| T6 Creation experiment | self-hosted metadata acceptance (CR3, CR4) | $1 (non-refundable) |
| T6b Seed | seed on a pending market (CR7) | $10.80 |

Worst cases follow `docs/runbook.md` section 3, which reconciled the spec's table with amendments A3 and A10 (the 800 bps fee bound on every BUY; T6b at the $10.80 seed cap). T6 plus T6b is $11, above the $10 funding cap that holds until T4 passes (O2). Plan B if T1 is rejected: a human signs in at the XO web app with the PayBox wallet as external owner; whether PayBox can connect to that app is unknown. Outcome rules: T1 rejected, Plan B or the write path is closed; T3a credited but T4 failed, keep funding at or below $10 and treat the account as one-way; T3a not credited, stop and do not fund again; T6 rejected or ignored, creation stays blocked.

### Open items for the user

| ID | Open item | Default until answered |
|---|---|---|
| O1 | A dedicated PayBox credential for XO (amendment A4) | Required for any funded use; the build assumes it |
| O2 | Raise the $10 funding cap for T6/T6b (needs T4 to pass first) | No raise |
| O3 | Creation seed cap of $10.80 and GTD-only seeds (A3) | As written; creation stays off |
| O4 | Single tenant (local mode, or a localhost relay) | As written |
| O5 | Accept XO terms, badge-rule and jurisdiction exposure for creation, and where the relay's egress address sits (Phase 0 rank 8) | Not accepted; creation stays off by default |

Decision 1 (no XO contact) and decision 4 (no cadence cap) do not answer O3 or O5: they remove the means of asking XO and remove the plugin's own limit, not the exposure.

### What Phase 1 built, in one paragraph, and what is still wrong with it

Built (all mock-tested, flags off): the chain-account and UserOp layers with the researcher's golden vectors, a local mock XO with an anvil chain running the real Kernel, EntryPoint, factory and validator bytecode, the relay (store, ledger, credentials, orders, userops, funding, creation with a review watcher), the 27 plugin tools, local mode, the live kit, and two profile-matrix suites (core and creation) that run the same journeys over both transports in every mock profile and with each switch flipped alone. A post-build review confirmed 44 findings (4 high, 19 medium, 21 low by the reviewers' labels, plus 38 further low findings that were not itemised; 2 candidate findings were refuted). A fix pass fixed all four highs; of the mediums it left RT-3 (SELL price band) and SI-4 (the plugin cannot verify the digest the relay hands it) unfixed, and fixed FS-2/RT-1 (funding recipient not bound to the signer) and FS-3 (a lifted test amount) only in part. SI-2 and the master key file beside the vault (F4, a disclosed design choice) were also left. No re-review of the fixes is recorded. What is still open and known: no tripwire I/O checkers exist, so the relay never trips a tripwire by itself (do not fund beyond a test amount); the SIGUSR2 kill switch is not durable across a restart; a SELL's cap is on proceeds and has no price band (RT-3); a doomed order or seed loop can burn the day cap (F6, G4); the fee-ceiling bound is compiled in at 800 bps while the chain allows 1000 (SI-2); the first-connected owner binding can be chosen by the agent (RT-2). Details: `docs/build-log-v0.2.md` sections 6 to 8 and `docs/runbook.md` section 10.

## Decisions recorded (author, 2026-10-18)

- **Packaging**: our own Open Plugin; official only if MoonPay promotes it.
- **Self-trading**: **always allowed.** No block and no flag required. Cheap mitigations that do not restrict it stay in: self-trades are marked in tool output and the audit log. Risk accepted by the author: creator-fee gaming, wash-trading optics, and manipulation/insider rules (CFTC advisory 2026-02-25; Polymarket/Kalshi tightened rules 2026-03) apply to whoever operates this.
- **First release scope**: **creation is a must-have.** The release is read + trade + create (+ funding). Internal milestones (v0.1/v0.2/v0.3) still exist, but nothing ships publicly until all work. If XO has no programmatic create path, the answer is an XO partnership or contract-level path, not browser automation and not a "draft + link" substitute.
  > **[Phase 0: partly obsolete]** There is no API endpoint that creates a market (both OpenAPI path lists were checked), but a contract-level path exists: `createConvictionMarket` on XO's market manager, wired to a public role, with a $1.00 non-refundable fee and paymaster sponsorship. The fallback named above ("an XO partnership or contract-level path") is now concrete, and it sits outside XO's written terms (ToS Annex A: Catalyst Badge, at most one market per calendar week, admin review); XO can close it by re-pointing one role assignment. Gate results gate 5 and section 7 item 2.
- **Caps (plugin-enforced, env-configurable)**: **$10 per order, $50 per day, at most 2 markets created per day.**
  > **[Phase 0: partly wrong]** (a) 2 markets per day exceeds ToS Annex A (1 per calendar week, badge required). (b) Plugin-enforced caps do not bind an agent that holds an `autonomous` grant. (c) One creation attempt costs a $1 non-refundable fee plus a seed of at least $10, which uses the whole $10 per-order cap and $11 of the $50 daily budget, and about 41% of first reviews return update-required and about 9% reject (on-chain history to 2026-10-18). (d) Still undecided: whether funding, withdrawal and creation fees count toward the daily cap (recommended defaults in gate results section 9, rank 10). Gate results section 7 item 3.
  > **[Superseded 2026-10-19]** Decision 4 in "Decisions recorded 2026-10-19": no creation cadence cap, with the $10 per order and $50 per day caps unchanged. There is no max-creates-per-day setting in the code any more. The 2-per-day text above is kept as history.
- **Funding**: **the plugin must handle funding** (bridge USDC to XO chain 3223 inside the flow), not a manual step. This is a release-blocking unknown, see gate item 6.
  > **[Phase 0: premise wrong]** "Bridge USDC to XO chain 3223 inside the flow" assumes a bridge reachable from a PayBox proposal. XO documents no bridge contract, ABI or deposit API (funding is app-only and provider-mediated); on-chain, the only inbound path is a Hyperlane-style warp route from Base (all sampled inbound transfers came from Base); PayBox does not list chain 3223. Funding stays release-blocking. Gate results gate 6 and section 7 item 4. `docs/phase1-gap-closing.md` verifies the deposit mechanism by simulation only; no third-party deposit has been observed.

## Context

PayBox (MoonPay's non-custodial agent wallet, exposed over MCP) has no route to XO Market (xo.market, a permissionless, user-created prediction-market platform). Its only prediction-market plugin, `world`, is Solana-only and has no create-market tool. Goal: a plugin so people's PayBox agents can **discover, bet on, and create** XO markets, with guardrails that hold even when a wallet grant is `autonomous` (both of this account's granted wallets are).

> **[Phase 0: goal not achievable as stated]** A plugin cannot enforce guardrails against an agent that holds an `autonomous` PayBox grant: `request_wallet_sign` carries no value field and the agent can call it directly. The real enforcement points are the grant's approval mode and an author-operated relay that holds the XO credentials. Gate results section 0 item 5 and section 5.
>
> **[Superseded 2026-10-19]** The assumption that the plugin must work (and hold its guardrails) under autonomous grants is replaced by decision 5: approval-gated signing is the recommended mode and the only one in which a human sees each signature; caps are advisory against a compromised or prompt-injected agent; `autonomous` is for a throwaway test credential only.

`camdengrieh/insurance-markets` is empty (only `.gitattributes`), so this is greenfield.

> **[Phase 0: obsolete]** The repository is no longer empty: branch `build/xo-paybox-plugin` holds the v0.1 plugin source, tests, scripts and the research and design docs, all uncommitted at the time of writing.

## Packaging decision (confirmed 2026-10-18)

**Confirmed by the author: we build our own Open Plugin. It only becomes official if and when MoonPay promotes it.** Background: the author first chose "official PayBox plugin". Research shows official handlers live in MoonPay's **private** monorepo (`moonpay/paybox`; anonymous git read refused; not in your accessible repos), so an official plugin cannot be built from this repo. What outside developers *can* build is an **Open Plugin**:

- single-file ES module `dist/plugin.mjs` (Node 24, pnpm, build must be byte-reproducible), uploaded in the PayBox developer portal (developer.paybox.sh), outbound hosts allowlisted under Project settings → Network access, plain env vars, hosted conformance checks, then enabled at app.paybox.sh/plugins. It appears in `discover_plugins` as `unofficial`.
  > **[Phase 0: partly outdated]** Network settings sit under "Test & configure" and "Variables & Secrets" (the "Project settings, Network access" label may be an older UI). The starter (version 1.0.2) is served by the developer portal, not GitHub. Gate results section 7 item 5.
- write tools return **unsigned EVM calls as `io.paybox/transactionProposal`**; PayBox simulates, the user/grant approves, the vault signs. Proposals expire in ~5 minutes. (Field-level schema not yet seen — it is in the reference repos below.)
  > **[Phase 0: schema now known]** Proposal version "1"; kinds `evm`, `solana` and `x402` only; one call per proposal; `expiresAt` within five minutes; strict schema with no description, gas, simulation or value fields. Gate results section 7 item 5.
- marketplace listing is not publicly open yet (hackathon winners go first); promotion to "official" is MoonPay's call.
  > **[Phase 0: release facts]** Publication needs manual approval of every version at MoonPay's discretion. Chapter 1 closed 2026-10-17 20:00 New York and no non-entrant path is published. MoonPay KYC applies where applicable, there is one project per participant, the submission carries a perpetual irrevocable license, and a remote (URL-based) plugin class exists. This is blocker B0 in gate results section 3.0.

**Plan: build the Open Plugin in this repo, structured so MoonPay can promote it.** Public working examples to copy the structure from: `theluckystrike/paylink-guard` (EVM + Solana proposals), `bunnyyxtan/arcanum-plugin`. Test harness: `@paybox-sh/sdk` (Apache-2.0): `paybox plugins list|contract|use`, `PayboxClient.runPlugin/resumeRequest`.

## What is known about XO (secondary sources only; XO docs not yet read — treat as unverified)

> **[Phase 0: heading obsolete]** The XO docs were read through the `xo-docs` MCP and the public APIs, the chain and the contracts were checked directly. Most bullets below are now verified or corrected in `docs/phase0-gate-results.md`; the per-bullet notes mark what changed.

- Own EVM chain "XO Network", chain ID **3223**, native token XO, Blockscout explorer; testnet ID 1000101. Collateral **USDC.e**; funding by bridge (Base/Ethereum/BNB reported). Trading uses an **XO smart wallet** and an "Enable Trading" approval (USDC allowance + ERC-1155 operator approval). Gas is sponsored on XO's side (fee-grant/relayer).
  > **[Phase 0: corrections]** Collateral: the docs say "XO USDC"; the token is "Bridged USDC (XO)", symbol USDC.e, 6 decimals. Funding sources: the docs name none, and all sampled inbound transfers on-chain came from Base. Enable Trading: confirmed as an unlimited USDC.e `approve` plus `setApprovalForAll` to the CTF Exchange (268 of 268 observed), executed as an ERC-4337 UserOp from the smart account, not an EOA transaction. Gas: a verified `PolicyPaymaster` (ERC-4337) sponsors allowlisted calls; it is not a generic fee-grant or relayer. Testnet: chain 1000101 exists with an explorer, but no integrator hosts are documented and the docs say XO runs a single production environment. Gate results section 7 item 6.
- Order book: **off-chain matching, on-chain settlement**; Orderbook API + Data API documented for integrators. A community bot README reportedly shows **HMAC "L2" API auth**, **Kernel v3 smart-account signing** (owner key + smart-account address), CTF Exchange/Conditional Tokens addresses on 3223 (unverified).
  > **[Phase 0: partly verified]** HMAC L2 authentication and Kernel v3.1 signing are confirmed from XO's docs, and the XO-side hashes and signatures were recomputed independently with Foundry `cast`. Live acceptance of an externally signed order has not been demonstrated by anyone. Gate results section 0 item 1 and gates 1 and 2.
- Conviction (user market) creation looks like a **UI flow**: $1 charge + ≥$10 seed at 5–95¢, "eligibility and review may apply", creator earns 20% of lifetime fees. **No programmatic create path found.** MODRA (AI panel) resolves; rules are locked at creation.
  > **[Phase 0: partly wrong]** Not only a UI flow: a contract-level path exists (`createConvictionMarket`; the $1.00 fee was verified on-chain). The "creator earns 20% of lifetime fees" claim is unverified, and on-chain `creatorFeeBps` is 0 for Conviction and CLOB creations. Gate results section 7 item 6.
- Fees, bot/ToS policy, jurisdictions, invite-code gating: unknown or conflicting.
  > **[Phase 0: now known]** See gate 7 in the gate results (bots clause, wash-trading and influence clauses, self-trade prevention, restricted regions including the US and UK, creator rules). Fees: `/fee-rate` returns 0 while `effectiveFeeConfig` shows 400 to 800 bps on many markets, so the plugin fails closed on the larger figure (gate results section 1.3 item 9). Invite-code gating is not addressed in the gate results. Section 7 item 6.

## What PayBox gives us

- Signing intents: `message`, `typedData` (EIP-712), `transaction`, `authorization`, `solanaMessage`, `solanaTransaction`, `raw`. So EIP-712 order signing is possible at the PayBox layer.
- Request lifecycle: `pending_approval | pending_funding | pending_signature | pending_settlement | pending_confirmation | success | denied | error`; poll the same `request_id`; never re-call a write; reuse `invocation_id` for idempotency; success needs a tx hash, "a signature alone is not success".
- Tool conventions to mirror (from `world`): read tools `readOnlyHint`, writes `destructiveHint`; `<plugin>_<verb>` names; string amounts; PayBox pins wallet/sender; optional `slippage_bps` and `value_cents`; description boilerplate on approval and polling.
  > **[Phase 0: wrong for Open Plugins]** `value_cents` and `slippage_bps` are first-party `world` conventions. They do not exist in Open Plugin proposals, and `request_wallet_sign` has no value field either, so grant spend policy cannot evaluate them. Gate results section 7 item 7.
- SDK stops with `unsupported` on versioned and **gasless** plans, so the XO gas-sponsorship model is a real risk.
  > **[Phase 0: mis-framed]** XO's sponsorship is paymaster-based on XO's own bundler and does not involve PayBox transactions at all, so this SDK limitation is not the risk; the open points are in gates 3, 4 and 8. Gate results section 7 item 7.

## Feasibility gate (Phase 0 — nothing else starts until these are answered)

1. **Auth/credentials**: how does the Orderbook API authenticate? If it needs per-user HMAC credentials derived from a wallet signature, where can a plugin hold per-user secrets (env vars are plugin-wide; secrets must never pass through tool args or model context)?
  > **[Phase 0: partial]** Two layers: an L1 ClobAuth EIP-712 signature mints or derives an HMAC triplet, and L2 HMAC authenticates every private route. A hosted Open Plugin cannot hold per-user secrets (no per-user store, no user identity in plugin code, a fresh sandbox per call), so an author-operated relay is the likely shape. Gate results gate 1.
2. **Order flow**: are orders EIP-712-signed payloads POSTed to the API? If so use a **prepare → `request_wallet_sign` (typedData) → submit** pattern, with the plugin never holding keys.
  > **[Phase 0: partial, downgraded from answered-go]** Orders are EIP-712 payloads POSTed to the orderbook, and prepare, `request_wallet_sign`, submit is mechanically sound, but nobody has demonstrated it live. Signed orders are bearer instruments (use a short GTD expiry) and the `nonce` may need to equal an on-chain counter. Gate results gate 2.
3. **Smart wallet**: can a PayBox EVM wallet be the owner of an XO (Kernel v3) smart account, and is the account deployable/usable by an external owner?
  > **[Phase 0: partial]** In principle any EOA can own a Kernel v3.1 account, but no route is documented for a PayBox MPC wallet to become the owner; creation is documented only through the web app. This blocks every write. Gate results gate 3.
4. **Chain support**: will PayBox simulate/sign proposals for chainId 3223, and how does gas work for an external wallet?
  > **[Phase 0: reframed]** Orders need no chain transaction. XO's on-chain actions are ERC-4337 v0.7 UserOperations signed by the owner (raw ECDSA over `userOpHash`) and sent to XO's bundler; they are not EOA transactions and cannot be `io.paybox/transactionProposal` objects on chain 3223. PayBox support for 3223 therefore matters only for signing domains. Chain 3223 is absent from PayBox's token catalog and the behaviour for an unsupported chain is not documented. Verdict: partial. Gate results gate 4 and section 7 item 8.
5. **Market creation**: any API or contract path, and what "eligibility/review" means for agents.
  > **[Phase 0: partial]** No API endpoint creates a market; the contract-level path is described in the note on the creation decision above. Gate results gate 5.
6. **Funding (release-blocking, plugin must handle it)**: what is XO's deposit/bridge mechanism (contract, provider, supported source chains such as Base, fees, time, withdrawal path)? Funding is the natural fit for the documented proposal model: `xo_fund_account` can return unsigned approve + bridge calls on the *source* chain for PayBox to simulate and sign. Also check whether PayBox's own cross-chain swap/bridge (`pending_settlement` = bridge in flight) can target chain 3223. If neither works, funding blocks the release.
  > **[Phase 0: reframed]** Returning "unsigned approve + bridge calls" means two separate proposals (one call per proposal) and needs a router that XO has confirmed; no XO deposit API is documented, and PayBox's own swap or bridge reaching chain 3223 is unlikely (not evidenced). Verdict: partial, release-blocking. Gate results gate 6 and section 7 item 9.
7. **Terms**: bot policy, restricted jurisdictions.
  > **[Phase 0: partial]** Nothing bans bots, but the wash-trading, influence, one-account, region and creation-limit clauses constrain the author's decisions. Gate results gate 7.
8. **Sign-then-submit**: the documented `io.paybox/transactionProposal` pattern only covers on-chain EVM calls. Can a plugin obtain an off-chain typed-data signature and then continue to an HTTP submit, or must the agent orchestrate prepare → `request_wallet_sign` → submit? And do `autonomous` grants auto-sign Open Plugin proposals (an SDK `SKILL.md` reportedly says "plugin money always pauses for passkey"; `world` tool text says autonomous grants return `pending_signature`; unresolved)?
  > **[Phase 0: answered for the plugin, open for autonomy]** A plugin cannot sign: there is no proposal kind for signatures and plugins cannot call PayBox tools. The pattern is agent-orchestrated (prepare, `request_wallet_sign`, submit), supported by PayBox primitives but not demonstrated. Whether `autonomous` grants sign without a passkey is unresolved and PayBox's docs contradict each other, so design for both outcomes. Verdict: partial, downgraded from answered-go. Gate results gate 8 and section 7 item 10.
9. **Read-side fallback**: if the Data API is restricted, is the Blockscout GraphQL endpoint (`/graphiql` on the XO explorer) a usable read model?
  > **[Phase 0: premise false]** The Data API is public, unauthenticated and CORS-open, so no fallback is needed for v0.1. Verdict: answered-go, with seven traps to build around (gate results gate 9). Section 7 item 11.

Go/no-go: reads are buildable regardless; trading needs 1–4 and 8; funding needs 6; creation needs 5. Because creation and funding are must-haves, **items 5 and 6 (as well as 1–4 and 8) are release-blocking.** If creation is UI-only, "agents create markets" cannot be built as a plugin without XO's cooperation: take it to XO (partnership/whitelisting or a documented contract path). Do not substitute browser automation.

> **[Phase 0: go/no-go recorded]** Per-tier verdicts are in "Phase 0 outcome" above: v0.1 go, v0.2 conditional-go, v0.3 conditional-go (lowest confidence).

## Staged delivery

Internal milestones, built in this order. **Public release requires all of v0.1–v0.3** (author decision).

- **v0.1 read-only** (no signing, no secrets, lowest risk): `xo_search`, `xo_get_markets`, `xo_get_market`, `xo_orderbook`, `xo_market_prices`, `xo_positions`, `xo_account` (includes balance, trading-enabled flag, self-created-market flag). Buildable as soon as the Data API is known; also the fastest way to validate the plugin pipeline end to end.
  > **[Phase 0: corrections; built]** `xo_account` cannot return a trading-enabled flag from REST, so it reports the status `unknown` (an explorer-log or `eth_call` read is the untested candidate); the self-created-market flag is unreliable for type 2 markets and unverified for type 4, so it is omitted; `xo_search` is a title-only substring match. Built on this branch: all seven read tools, plus `xo_validate_market_draft`; see `docs/tool-contract.md` and `docs/build-log-v0.1.md`. Gate results section 7 item 12.
- **v0.2 funding + trading**: `xo_fund_account` (bridge to chain 3223 as source-chain proposals, subject to gate 6), `xo_withdraw` (only to the owner's own address, approval-gated, subject to a confirmed safe path), `xo_enable_trading`, `xo_prepare_order` (EIP-712 payload + quote, read-only), `xo_submit_order`, `xo_cancel_order`, `xo_redeem`.
  > **[Phase 0: design changes; not built]** `xo_enable_trading` and `xo_redeem` are UserOps signed with `raw`, not proposals. `xo_fund_account` as bridge proposals has no documented source. `xo_withdraw` is service-mediated and not on the paymaster allowlist, and "only to the owner's own address" must be confirmed with XO. `xo_cancel_order` should use the HMAC single-order form only until XO documents the cancel typed data. None of the v0.2 tools exists yet. Gate results section 7 item 13.
- **v0.3 creation**: `xo_validate_market_draft` (free dry run), `xo_create_market` (must be a real programmatic path, subject to gate 5; always approval-gated even for `autonomous` credentials; max 2 per day).
  > **[Phase 0: partly satisfied; not built]** "Must be a real programmatic path" is satisfied at contract level, not by an API. "Always approval-gated even for `autonomous` credentials" cannot be guaranteed by a plugin. `xo_validate_market_draft` (offline lint and cost quote) is built; `xo_create_market` is not. Gate results section 7 item 14.
  > **[Phase 1 / 2026-10-19]** "Max 2 per day" is superseded (no cadence cap). The creation tools now exist, as six tools rather than one: `xo_prepare_create_market`, `xo_submit_create_market`, `xo_track_market`, `xo_respond_update`, `xo_cancel_market`, `xo_place_seed`. Mock-tested only; off by default (needs `XO_ENABLE_CREATE` and `ENABLE_SELF_HOSTED_METADATA`, and, while flag-fact enforcement is on, a recorded live-test result or an operator `RELAY_ARM`); never exercised against XO.
  > **[Phase 1 / 2026-10-19]** v0.2 is likewise built (flags off, mock-tested only) as: `xo_account`, `xo_connect`, `xo_deploy_enable_trading`, `xo_revoke_trading`, `xo_redeem`, `xo_submit_userop`, `xo_userop_status`, `xo_prepare_order`, `xo_submit_order`, `xo_order_status`, `xo_cancel_order`, `xo_list_orders`, `xo_fund_account`, `xo_withdraw`. `xo_enable_trading` is `xo_deploy_enable_trading`.

## Guardrails (enforced in the plugin; do not rely on prompts or human approval)

> **[Phase 0: premise]** "Enforced in the plugin; do not rely on prompts or human approval" cannot hold against an agent that holds an `autonomous` grant (gate results section 0 item 5). The guardrails that exist today are the pure modules in `src/guardrails/` and `src/xo/signing/`, which no tool imports yet.

- Hard caps, author-chosen defaults, env-configurable: **$10 per order, $50 per day, 2 markets created per day**. Also a price/slippage band, and `value_cents` supplied so grant policy can evaluate. Funding and withdrawal count toward the daily cap unless the author says otherwise.
  > **[Phase 0: partly impossible]** Supplying `value_cents` so grant policy can evaluate it is not possible for Open Plugin proposals or for `request_wallet_sign`. The 2-per-day creation figure exceeds the ToS (see the note on the caps above). Caps are advisory against an agent that holds an autonomous grant. Gate results section 7 item 15.
  > **[Superseded 2026-10-19]** The "2 markets created per day" cap is gone (decision 4). The $10 per order and $50 per day caps are enforced by the relay's durable ledger (the plugin is stateless), per account; the $1 creation fee counts toward the day and a seed counts as an order, with its own $10.80 cap (O3). Funding has separate caps ($10 in total until T4 passes, then $50 a day) and a $3 test amount in the plugin's funding tool.
- Pinned constants: chain ID, RPC, exchange, conditional-token and USDC.e addresses are constants in the plugin, verified on the explorer, and are never accepted from the agent. Prefer capped allowances over unlimited in `xo_enable_trading`.
  > **[Phase 0: partly wrong]** The RPC cannot be pinned: the mainnet RPC needs a private `api_key` in the query string, which PayBox cannot broker. The chain id, the exchange, the conditional-tokens and the USDC.e addresses are pinned in `src/guardrails/constants.ts`. "Prefer capped allowances" is untested: XO's own flow is unlimited (268 of 268) and whether a capped allowance works for Enable Trading is not found. Gate results section 7 item 15.
- Off-chain order signing must not be blind: turn intent into a human-readable quote with a `quote_id`, then have `xo_submit_order` re-verify that the signed typed data equals the quote before submitting. Amounts are strings in one documented unit; confirm USDC.e decimals before use (a 6-vs-18 mix-up is a 10^12 error).
  > **[Phase 0: add]** Signed orders are bearer instruments (the signature has no timestamp and `expiration = 0` means never), so every plugin-originated order should be GTD with a short non-zero expiration inside the signed hash, and quotes need a TTL. The order `nonce` is probably not a free field (the exchange may require it to equal the maker's on-chain counter), so hard-coding 0 is safe only while that counter is 0. Approvers see an opaque `Kernel(bytes32 hash)` unless the signing window decodes it (not found). `src/xo/signing` implements the expiry rule (default maximum 3,600 s) and the nonce rule, and no tool uses it yet. Gate results section 7 item 15.
- Creation is always approval-gated and rate-limited even when the credential is `autonomous`. Self-trading (creator trading its own market) is **allowed** by author decision; it is not blocked, but every such trade is marked in tool output and written to the audit log.
  > **[Phase 0: partly wrong]** Approval-gating of creation cannot be guaranteed by a plugin under an autonomous grant. Self-trading: the mark-and-log decision stands, but XO's orderbook has self-trade prevention (self-matches cancel and earn no maker rebate) and its wash-trading and influence clauses apply, so the exposure is XO enforcement as well as regulation. An audit log needs a host: the plugin has no storage, so the v0.1 read tools write one-line structured audit records to stderr only. Gate results section 7 item 15.
- Read-then-verify-then-act: writes require the exact market id returned by a read; refuse stale, closed, determined or disputed markets; refuse thin books; never infer outcomes from absent data.
  > **[Phase 0: wrong]** There is no "disputed" state in either XO API. The states to handle are `UPDATE_REQUIRED`, `VOIDED`, `VOIDED_CLOSED`, `RESOLVED` (provisional) and `CLOSED` (settled with a winner). Gate results section 7 item 15.
- Quote-before-trade; dry-run first; no automatic retry after ambiguous failure; idempotency keys; one request per intent.
- Creation lint: absolute close date, named deterministic resolution source, no relative dates, near-duplicate detection against existing markets, creation rate limit (2/day), quoted creation cost and seed shown before signing.
  > **[Superseded 2026-10-19]** "Creation rate limit (2/day)" is dropped (decision 4). The lint now has 90 finding codes, reconciled against research note 23's 39-check list (its table of where each check lives is machine-checked in `src/create/lint.ts`); it reports XO's written one-per-week limit under `limits.tos` and sets `limits.configured.plugin_cadence_cap` to the literal `"none"`. Near-duplicate detection runs only when the caller passes existing titles, which the tool does not, so `duplicate_check` stays `not_run`. How well the new heuristics hold on real XO market prose is unverified (only 5 real metadata files plus a reconstruction were run).
- Market titles/descriptions are attacker-controlled: return them in labeled fields as data, never as instructions.
- Defer geo restrictions to XO's live check or the signing window; never hardcode country lists.
- Repo hygiene: no keys or XO credentials in code or logs.

## Repo layout (proposed)

`package.json` (pnpm, Node 24, TypeScript, single-file bundler) · `src/plugin.ts` (entry shape copied from reference plugins) · `src/xo/{client,auth,signing,types}.ts` · `src/tools/{read,trade,create}.ts` · `src/guardrails/` · `test/` + recorded fixtures · `docs/tool-contract.md` · `docs/runbook.md`.

> **[Phase 0: changed]** `src/xo/{auth,signing}` will need a relay service with its own directory: the single-file bundle cannot hold credentials. As built: `src/xo/{client,http,types,units}.ts`, `src/xo/signing/` (offline helpers), `src/tools/{read,draft}.ts`, `src/guardrails/`, `src/create/lint.ts`. There is no `src/xo/auth`, no `trade.ts` or `create.ts`, no relay, and `docs/runbook.md` was not written. File map: `docs/build-log-v0.1.md`. Gate results section 7 item 16.
  > **[Phase 1 / 2026-10-19: built]** There is now a relay (`relay/`), `src/tools/{account,userop,trade,fund,create}.ts`, `src/xo/{chain,account,userop,funding,creation}/`, `src/relay/` (the frozen plugin-to-relay contract), `src/local*` (local mode), `scripts/live/`, a mock XO under `test/mock-xo/` and `test/anvil/`, and `docs/runbook.md`. There is still no `src/xo/auth`; credentials live in `relay/credentials.ts`. File map by stream: `docs/build-log-v0.2.md` section 2.

## Verification

Typecheck, lint and unit tests pass; build twice is byte-identical; hosted conformance check passes; each guardrail has a failing-case test; `paybox plugins contract` shows the expected schemas; XO **testnet** (chain 1000101) order placed and cancelled through `paybox plugins use` with an approval-gated test credential; mainnet only with tiny caps after that. No money tool is called outside a dedicated test credential.

> **[Phase 0: partly impossible]** "XO testnet order placed and cancelled through `paybox plugins use`" has no documented host set (the only XO environment documented is mainnet), and `paybox plugins use` needs an installed plugin (blocker B0). Done locally for v0.1: typecheck, unit tests, a byte-identical double build, the starter's conformance run, failing-case tests for the guardrails that exist (see the build log for exact results). Not done: the hosted conformance check, `paybox plugins contract`, any money tool call. Gate results section 7 item 17.
  > **[Phase 1 / 2026-10-19]** Added locally and offline: tests per guardrail and refusal against a mock XO plus a local anvil, in two mock profiles and with each unknown flipped alone, over two transports; the final-check step reported the 5,348-test unit run, double-build determinism and starter conformance with 27 tools (see the status banner for the exact figures and the one failing hygiene test). "XO testnet" remains impossible. The live-test kit replaces it: opt-in tests on mainnet with tiny budgets, one script each (`docs/runbook.md`).

## Prerequisites still needed from you

> **[Phase 0: status 2026-10-19]** Items 1 to 3 are done; item 4 is open. Gate results section 7 item 18.

1. [x] ~~Confirm **Open Plugin** instead of official~~ Done: confirmed 2026-10-18.
2. [x] XO docs via the `.mcp.json` on branch `add-xo-docs-mcp` (server `xo-docs` at `https://docs.xo.market/mcp`) in a new session started from a branch that contains it, with `docs.xo.market` allowlisted. Also allowlist `developer.paybox.sh` and `docs.paybox.sh` to read the plugin spec directly.
   > **[Phase 0: done]** `.mcp.json` is on main as of commit 82d95ae; the XO docs are readable through the `xo-docs` MCP and the PayBox docs through `developer.paybox.sh` and `docs.paybox.sh`.
3. [x] The three reference repos (`theluckystrike/paylink-guard`, `bunnyyxtan/arcanum-plugin`, `NitinkashyapSTRR/xo-pulse-market-maker`) must be read. A shallow clone into the scratchpad was **denied by the permission classifier ("untrusted code integration")**. Either add a Bash permission rule allowing read-only `git clone --depth 1` into the scratchpad, or paste the relevant files (plugin entry point, the `io.paybox/transactionProposal` schema, build/test scripts, the XO order-signing and auth sections). They are read, never run or installed.
   > **[Phase 0: done]** The reference repos were read through `gh api` (read only; nothing was cloned or run) and through the portal; summaries are in `docs/research/04` to `07`.
4. [ ] Access to the PayBox developer portal (account) for upload and conformance checks.
   > **[Phase 0: still open]** With a schedule dependency: Chapter 1 closed 2026-10-17 20:00 New York and no non-entrant path is published (blocker B0). Decision 3 (2026-10-19) parks B0: the plugin is built and tested locally with no PayBox upload. This item stays unchecked on purpose.
5. [ ] A dedicated PayBox EVM credential to own the XO account (open item O1), approval-gated, plus a small Base balance for T3a. Needed only if the user chooses to run the live tests.

## Decisions still open (from the research critic)

Decided on 2026-10-18 (see top of file): packaging, self-trading, first-release scope, caps, funding.

- **Funding detail**: the PayBox EVM wallet on XO chain 3223 is assumed; a Solana-held balance cannot trade on XO directly, so funding means moving value from a chain PayBox can sign on. Who pays gas on chain 3223 if the wallet is not sponsored?
  > **[Phase 0: answered; the assumption was wrong]** The owner EOA is only the signer; funds live in the Kernel smart account on chain 3223, so "the PayBox EVM wallet on 3223 is assumed" is wrong. Who pays gas: answered for allowlisted calls (the paymaster pays; the owner EOA needs no XO gas). Gate results section 7 item 19.
- **Guardrail extras not yet decided**: topic denylist for creation, a global kill switch (recommended yes), and whether funding/withdrawals count toward the $50/day cap.
  > **[Phase 0: status]** A software kill switch (`XO_KILL_SWITCH`) exists in `src/config.ts` and `src/guardrails/limits.ts` with tests, but no write tool exists for it to gate. Whether funding and withdrawals count toward the daily cap is still undecided (recommended defaults: gate results section 9, rank 10).
- **Secrets**: if XO needs per-user HMAC credentials, may the plugin hold per-user secrets, or must it be stateless? A shared XO API key is not acceptable for per-user trading.
  > **[Phase 0: answered]** XO needs per-user HMAC credentials, a hosted bundle cannot hold them, so an author-operated relay is needed. Whether PayBox's developer terms allow it is unknown (P6); `docs/phase1-gap-closing.md` records a decision that the terms are no obstacle. Gate results section 7 item 19.
- **Environments**: develop on XO testnet (chain 1000101); what dedicated PayBox credential and dollar budget is approved for mainnet smoke tests (suggest a few dollars, approval-gated)?
  > **[Phase 0: answered]** Mainnet only: no testnet orderbook, bundler or API hosts are documented (chain 1000101 exists with an explorer). Tests that touch XO therefore run on mainnet; the gate results propose about $25 in total (section 9, rank 9). Section 7 item 19.
- **Legal posture**: who accepts responsibility for agents creating markets and betting, which jurisdictions to exclude, and whether MoonPay compliance sign-off is needed for listing. XO is offshore and its terms on bots are unknown.
  > **[Phase 0: partly answered]** The restricted regions (the US, UK, France, Singapore, Ontario, sanctioned territories) and the bot, wash-trading, influence and creation clauses are now known (gate 7). Who accepts responsibility, and where the relay or plugin runs, remain the author's decisions (rank 8). Section 7 item 19.
- **Timing**: PayBox's plugin hackathon ("Chapter 1", Oct 16–17, 2026) appears to have just closed and the marketplace is not publicly open. Is there a later submission date or demo deadline?
  > **[Phase 0: answered]** Chapter 1 closed 2026-10-17 20:00 New York. The landing page promises a new chapter each month ("every full moon" in `llms.txt`) with no published date, and no non-entrant path is documented. Section 7 item 19.

## Multi-venue aggregation and Quotient

Outside the nine gates and outside the release gate (read + trade + create + funding). The designs are in `docs/aggregation-design.md` (venue adapters, edge methods, fee models, Quotient as a per-user paid signal), `docs/market-linking-design.md` (how markets on different venues are linked: a human-approved, rule-hash-pinned link registry) and `docs/platform-registry-design.md` (a registry of the platforms themselves, with pools rather than venues as the unit of independence); `docs/venue-census.md` did not exist when this paragraph was written and has since appeared in the working tree (it was produced by another workflow and has not been read for this update), so nothing here depends on it. The evidence is research notes 08 to 18 under `docs/research/`. The headline is a **read-only signal and alert layer, not an execution engine**: in the 2026-10-18 snapshots no taker edge survived spreads and fees (0 net-positive of 706 sell-side exclusive sets with full books, no net-positive taker rule across 41 relationships from 1 minute to 84 days once two artefacts were set aside, and verified cross-venue gaps of tens to low hundreds of basis points that are long-dated and thin), and at the author's $10 per order cap even a generous 6-cent gross gap nets under a dollar per capped pair (aggregation design section 5.1). The numbers are single-moment snapshots with small samples; the independent reproductions in notes 17 and 18 confirm the headline, and note 18 carries corrections that weaken some secondary claims. Cross-venue pairs are dominated by resolution divergence and capital lock-up rather than price, and Quotient (a forecast API, paid per call or by API key) covers Polymarket, Polymarket US, Kalshi and similar venues but not XO or Trueo, shows an edge that is not distinguishable from zero outside the final day, and has terms that restrict redistribution and shared access. All of this is design only; none of it is in the v0.1 bundle. The gate results recommend treating it as a later milestone outside the release gate (decision rank 12; a recommendation, not a decision).

## Next actions (checklist, updated 2026-10-19 after Phase 1)

The Phase 0 checklist is complete (a branch with `.mcp.json`, the `xo-docs` queries, the reference repos read, the feasibility gate run, v0.1 built). Phase 1 is complete as far as it can go without a live service: the whole write path is built and mock-tested. Everything that remains needs the user. For the current state read `docs/phase1-gap-closing.md` (section 9 overrides the rest), `docs/build-log-v0.2.md` and `docs/runbook.md`; for the Phase 0 questions, `docs/phase0-gate-results.md` sections 3 and 4.

Done:

- [x] Phase 0: gates run and recorded (`docs/phase0-gate-results.md`).
- [x] Phase 1 research synthesis: constants, assumptions register, degrade designs, live-test list (`docs/phase1-gap-closing.md`).
- [x] User decisions of 2026-10-19 recorded (section "Decisions recorded 2026-10-19").
- [x] Local build of v0.2 and v0.3: 27 tools, relay, local mode, mock XO and chain harness, live kit, runbook, user docs (`README.md`, `docs/quickstart.md`, `docs/safety.md`), architecture decision record (`docs/everyone-architecture.md`), two profile-matrix suites. Evidence and caveats in the build log.
- [x] Post-build review (44 confirmed findings) and a fix pass; dispositions in the build log.

Decided (no longer open):

- [x] **Does anyone contact XO?** No (decision 1). Q1 to Q19 stay open, to be settled only by T0 to T8.
- [x] **May a relay hold users' credentials under PayBox's terms (P6)?** Treated as answered by decision 2.
- [x] **Upload to PayBox?** Not now (decision 3). B0 and P9 stay open.
- [x] **Creation cadence cap?** None (decision 4).
- [x] **Approval mode?** Approval-gated, dedicated credential (decision 5, O1).

Open, needs the user:

1. [ ] **Fix the one failing unit test before anything is committed.** `test/hygiene-identifiers.test.ts` flags `docs/research/venues/atrum.md:57`, a sentence that contains an abbreviated temporary-directory path fragment. It holds no real identifier, but no build stream may edit `docs/research/`. Reword that sentence (or narrow the test's rule); then `pnpm unit` should be fully green.
2. [ ] **Hygiene before any commit** (beyond item 1): the four `__pycache__/*.pyc` files that embedded the author's home-directory path are gone from the working tree and `.gitignore` now ignores `__pycache__/` and `*.pyc` (checked 2026-10-19); the repository slug on the Context line of this file is the only identifier the hygiene test exempts (amendment A12 asks for it to be scrubbed before any publish); decide whether to redact vendor contact emails in research notes 09 and 12; review and rotate the config set named in gate results section 10 (a credential-bearing config was read by a research stream). **New in the final check**: derived files under `docs/research/fixtures/` that carry Kalshi-origin quotes, titles and tickers are not matched by the `.gitignore` patterns (examples are listed in the build log, section 9); whether they count as "raw data" under the Kalshi Developer Agreement is a judgement call to make before any commit.
3. [ ] **Decide whether to run the live tests** (T0 to T8, `docs/runbook.md`), in the recommended order and with the budgets there; each is a real action and optional. Before T1, do O1 (a dedicated approval-gated PayBox credential) and run T1 with `--prove-revoke`. Money on the core path is about $3 for the deposit (stranded if T4 fails), $0.54 locked briefly, up to $1.08 for the optional fee test and up to $1.41 for T8; creation adds $1 (T6) and locks $10.80 (T6b), which needs O2.
4. [ ] **Answer O2 to O5** (above). Until answered the defaults stand: no raise of the funding cap, creation off, seed cap $10.80 GTD-only, single tenant, exposure for creation not accepted.
5. [ ] **Product decisions the fix pass could not take** (build log section 7): the reference price for a SELL's band (RT-3, a midpoint?), whether to wire the fee-ceiling checker and size caps on 1000 bps (SI-2), and the contract change that would let the plugin rebuild digests itself (SI-4, hosted mode only).
6. [ ] **Build the tripwire I/O checkers** (exchange upgrade, paymaster, manager implementation, fee ceiling). Until then the relay never trips a tripwire by itself and funding should stay at a test amount.
7. [ ] **Run in a real MCP client and on Linux** (nothing has been). The hosted plugin bundle speaks only protocol version 2026-07-28; local mode accepts both that and 2025-06-18.
8. [ ] **Stop the six stale test processes** from earlier workflow streams (three pairs of `tsx --test test/relay-orders-pending.test.ts` under system Node 20, hung for hours; listed in the build log). They are not part of this build and were left alone.
9. [ ] **P9** (does `use_plugin` hand the agent `structuredContent`?) and the other PayBox-side questions, once an upload path exists. The text block of the read tools still carries only a one-line summary.
10. [ ] Multi-venue aggregation and Quotient (decision rank 12): later milestone outside the release gate, unchanged.

The ranked decisions list of the gate results, with the Phase 1 status:

| Rank | Decision | Recommended in the gate results | Status 2026-10-19 |
|---|---|---|---|
| 1 | Send the XO partnership and question list now | Send the full list, Q1 to Q6 first | **Decided no** (decision 1) |
| 2 | Account onboarding stance | A one-time human step creating the XO account with the PayBox wallet as external owner, if XO confirms it works; ask XO to provision it | Open; T1 tests the self-derived route, Plan B is the human step, and nobody asks XO |
| 3 | Per-user XO credential custody | Author-operated relay now; ask P2 and P6; XO-issued scoped access via Q4 | **Decided** (decision 2): relay built; local mode means each user holds their own credentials |
| 4 | Approval mode and cap enforcement | `iframe` or `always_approve` for any wallet with real XO funds; `autonomous` only for test credentials | **Decided** (decision 5, A4); dedicated credential is O1 |
| 5 | Creation cadence versus the ToS | Default-off flag, default 1 per week, mainnet only after XO's written permission | **Decided** (decision 4): no cadence cap; creation stays off by default (D5); the ToS warning is shown on every approval; XO's permission will not be asked for |
| 6 | PayBox access and schedule | Contact PayBox now and build locally | **Decided** (decision 3): build locally, no upload |
| 7 | Funding fallback if XO will not bless a route | Wait for an XO-supported route or a provider deposit-address API; the Base warp route only with XO's written OK | Open; T3a/T4 test the warp route directly, with a $10 cap until the exit is proven |
| 8 | Operator and legal posture | Decide an operator entity and a hosting region outside XO's restricted list before any mainnet test | Open (O5) |
| 9 | Test credential and budget | A dedicated approval-gated PayBox test credential, about $25 in total | Open (O1, O2); the reconciled worst cases in `docs/runbook.md` section 3 replace the $25 figure |
| 10 | Cap semantics | The seed counts as an order; the creation fee counts toward the daily cap; funding and withdrawals get a separate transfer cap | **Built to this default** (D5, D3, A3, A10); O3 open |
| 11 | Re-confirm self-trading | Keep the decision, add a disclosure, avoid self-matching own resting orders | Open |
| 12 | Multi-venue and Quotient scope | A read-only edge and alert layer as a later milestone outside the release gate | Open |

## dApp (the Cockpit)

Added 2026-10-20. A local-first web page and loopback daemon on top of the plugin: one place for markets, positions by address, Quotient signals and an agent terminal, using the user's PayBox wallet through their own agent rather than a separate account-abstraction kit. Design and decisions: [docs/dapp-design.md](dapp-design.md) (see its "Build status" section). What was built, what the checks showed, review findings and what is not built: [docs/build-log-dapp.md](build-log-dapp.md). How to run it: [docs/dapp-runbook.md](dapp-runbook.md) and `app/README.md`.

Status in one paragraph: the page (`app/`) and daemon (`bridge/`) are built and tested offline only; the last full check was red on a known set of items (daemon signer fixtures, third-party fixtures that must not be committed, the root unit script lacking the network guard) that the build log lists; every write path is off, the agent seat and S2 signing are not enabled, and every XO and PayBox capability stays "unproven" until the live tests (DT1 to DT9, T0 to T8) are run by the user.
