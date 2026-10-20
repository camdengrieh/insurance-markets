# Runnable by everyone from day zero: decision record

Status: decision record, 2026-10-19, branch `build/xo-paybox-plugin`. Written from the repo, `docs/phase1-gap-closing.md` (sections 4, 5, 8 and 9; section 9 overrides the rest) and research notes 01, 04 and 06 (each read with its Verification section). I made no network request, called no PayBox tool and contacted nobody. Nothing here was run against a live service.

Reference keys: `[01]`, `[02]`, `[04]`, `[06]` are `docs/research/01-xo-auth-signing.md`, `02-xo-read-api.md`, `04-paybox-reference-plugins-a.md`, `06-paybox-platform.md`. `[P1]` is `docs/phase1-gap-closing.md`. T0 to T8 are the live tests in `[P1 §6]`. "Door (a)" to "door (e)" are the XO off-chain acceptance questions in `[P1 §0]` and `[P1 §9 A6]`. B0 is the PayBox distribution blocker (no upload path for a non-entrant, `docs/phase0-gate-results.md`).

Tags: **verified** means read in a primary source or reproduced by the repo's own offline tests. **designed** means specified here and not built. **unverified** means no note supports it; it is a statement of what is not known, not a guess in either direction.

Status of the code at the time of writing: the relay logic exists as a library (`relay/*`, `src/relay/*`, `src/xo/*`) and the plugin tools talk to it through the `RelayClient` interface in `src/relay/contract.ts`. `src/local.ts` (the local entry point) does **not** exist yet; the `embedded-local` task builds it. Everything this document says about local mode is therefore the binding requirement for that task, not a description of shipped code.

---

## 1. Requirement and binding decision

**Requirement.** Anyone who can run an MCP client must be able to use the plugin from day zero. "Anyone" excludes no one on the grounds that the author did not approve them, did not give them a key, or is not running a machine.

**Binding product decision (2026-10-19).** Nothing may depend on the author operating a server, holding other people's credentials, or allowlisting a user. One codebase, two modes:

1. **Local mode (day zero).** The same tools run as a stdio MCP server on the user's own machine (`dist/local.mjs`, built from `src/local.ts`). The relay logic is embedded in the process: no HTTP hop, no `X-Relay-Key`, no operator. Each user has their own credential store, ledger and caps in their own data directory. The user's agent orchestrates signing through whatever wallet MCP the user has; PayBox `request_wallet_sign` is the primary one.
2. **Hosted-sandbox mode (`dist/plugin.mjs`, the PayBox runner).** Read tools, draft lint, and prepare/submit tools that talk to a relay by URL. This is the second mode and is blocked by B0 until an upload path exists. A stateless variant (no relay at all) is designed in section 4 and is not built.

**Constants of both modes** (unchanged from earlier decisions; restated because every option below is judged against them):

- Everything is keyed by owner account (multi-tenant-ready), single user per process in local mode.
- The caps ($10 per order, $50 per day, env-configurable) are **advisory against a compromised or prompt-injected agent**, in every mode. An agent that holds a wallet grant can call the wallet's signing tool directly `[06 §10]`. Approval-gated signing is the recommended mode because it is the only one in which a human sees each signature, and even there the approver sees an opaque digest `[P1 §5.2, §9 A4]`. The XO owner should be a dedicated PayBox credential holding only what the user will fund.
- No creation cadence cap exists. Every write path is behind a flag that defaults OFF and behind the kill switch (`src/relay/flags.ts`: seven flags, `KILL` overrides the rest).
- The plugin and relay never hold an owner key. The starter conformance (`pnpm test`) stays green for `dist/plugin.mjs`.
- Nobody contacts the XO team. PayBox terms are no obstacle to an author-operated relay (user decision); that decision is not used as a reason for or against any option below.

---

## 2. Options considered

### 2.1 Local embedded mode: **chosen, day zero**

The tool layer calls an in-process implementation of `RelayClient` instead of an HTTP client; the same route handlers (`relay/routes.ts`) serve both. State lives under the user's data directory: the encrypted credential store (AES-256-GCM, account address as AAD, `relay/crypto.ts`), the daily ledger keyed by account and UTC day (`relay/ledger.ts`), prepared items, capability facts, audit log.

Why chosen:

- No operator exists to be a dependency. The author runs nothing.
- Custody stays with each user: their HMAC triplet sits on their disk, not in a stranger's relay.
- It keeps the stateful design that the whole safety model (`[P1 §5.4]` invariants 1 to 8: relay derives the account, submit takes only `prepared_id` and `signature`, recompute-and-recover before any send, one send per prepared item, ambiguity reconciled never resent) already assumes. The embedded mode reuses the code that is built and tested; nothing is rewritten for a stateless sandbox.
- Each user's XO traffic leaves from their own address, under their own account. That keeps XO's per-user rate limits, the "one account per user" and region checks (`[P1 §7]` risk 12) with the person they apply to, instead of pooling many users behind one egress address (the pooling effect is an inference, **unverified**).
- The 10 s per-call budget does not apply. The relay's 6 s `pending` answer exists only because of that budget `[P1 §5.4]`; in local mode the process can finish a send in the background.

Costs, stated plainly:

- The user needs a runtime. The starter pins Node 24.21.0 and pnpm 11.11.0 `[04 §2]`; whether the built bundle runs on another Node version is **unverified**.
- The user needs a way to sign. The agent must reach a wallet MCP that can sign a raw 32-byte digest or EIP-712 typed data. PayBox's `request_wallet_sign` is the supported shape (`toPayboxIntent` in `src/relay/contract.ts`); whether any other wallet MCP accepts these intents is **unverified**. Headless hosts need PayBox's in-process signer for `pending_signature` `[06 §4]`. PayBox `raw` output shape and `0x` handling are unknown until T0.
- The user holds the master key for their credential store. The key-supply mechanism for local mode is defined by the `embedded-local` task; this record does not specify it.
- Local mode cannot be used from a hosted-only agent (one that cannot spawn a local process). That is a limit of reach, not of correctness.

### 2.2 Author-operated hosted multi-tenant relay: **rejected for now**

A public TLS relay that serves many owners, with the plugin (or any client) calling it by URL.

Why rejected:

- **Custody of other people's credentials.** The relay would store every tenant's XO HMAC triplet. A theft is a privacy and cancel-griefing event, not a theft of funds (M, `[P1 §7]` risk 7), but it is exactly the thing the binding decision forbids the design from depending on. Loss of a triplet may also be unrecoverable (`DELETE /auth/api-key` is probably L2, key cap unknown `[01 V2]`), so an operator bug can lock other people's accounts out of the API.
- **TLS, abuse and operations burden.** Public exposure needs TLS, authentication of tenants (today there is only a shared `X-Relay-Key` and an owner allowlist, `[P1 §5.4]` invariant 6), per-tenant rate limits, abuse handling, backups, an on-call path for the kill switch, and a recovery plan for the encrypted store. None exists. Section 6 lists what it would take.
- **XO terms exposure.** Automated access "must not overwhelm or misuse"; accounts are per user; region checks are IP based `[P1 §7]` risk 12. One operator egress fronting many users concentrates all of it on one address and one operator. With no XO contact there is no safe harbour. (Concentration is an inference, **unverified** against XO's actual enforcement.)
- **It is not needed for day zero.** Local mode already gives everyone a working path. Hosting buys convenience only.
- Third-party terms also constrain it: PayBox's developer terms prohibit code that "exploits, exfiltrates, or misuses user credentials, wallet keys, or secrets" `[04 V3]`. The user's decision that PayBox terms are no obstacle was about an author-operated relay for the author's own use; I do not extend it to a service holding strangers' credentials.

### 2.3 Author-operated single-tenant relay (the earlier architecture): **superseded**

The `[P1 §5.2]` design: stateless `dist/plugin.mjs` plus a relay on `127.0.0.1`. It serves one author, and it cannot serve a PayBox-hosted plugin at all, because the sandbox cannot reach localhost `[P1 §9 A5]`. It survives as the dev and test shape (`relay/main.ts`) and as the base for section 6.

### 2.4 PayBox hosted sandbox bundle: **kept as the second mode, blocked by B0**

`dist/plugin.mjs` uploaded to the PayBox developer portal. Verified limits `[06 §2, §8]`: fresh sandbox per operation, 10 s per operation, no persistent state, no user identity or wallet id passed to the code (EVM owner must be a tool argument), env vars are plain-text and owner-level, secrets are owner-level host-scoped brokered headers the code cannot read, up to 16 hosts.

Why kept: it is the only route to users who live inside PayBox and never run a local process, and it gives read tools and Base funding proposals (`io.paybox/transactionProposal`, which only the hosted plugin can return).

Why not day zero: B0. Chapter 1 closed 2026-10-17; whether a non-entrant can upload is not found `[06 §2, V]`; every published version needs manual approval at MoonPay's sole discretion; private agent-side install needs "Submit Project". The user's decision is no PayBox upload for now. Local build and conformance work anytime.

Which tools it can carry depends on whether a relay exists behind it. With a relay URL (a user-run relay reachable over public TLS, or the author's, which section 2.2 declines to make multi-tenant) it carries the full tool set. With no relay it carries only the stateless subset of section 4.

### 2.5 PayBox remote URL plugin: **exists, registration undocumented**

The platform has "unofficial plugins" whose catalog target is `kind: "remote"` (a URL, optional OAuth) beside `kind: "sandbox"` `[06 §7]`. `use_plugin` says unofficial plugins "call the authenticated user's enabled remote MCP installation" `[06 §7]`. How a third party registers one is **not found** in the dev guide, llms.txt, docs or SDK; the app JS suggests the catalog is catalog-driven rather than a free URL box `[06 V item 8]`. Whether a remote plugin can return `io.paybox/transactionProposal` and whether it receives any user identity are also not found `[04 V]`. Not usable until PayBox documents registration. It would fix per-user state (OAuth identifies the user to the server) but only by putting a server behind it, which is option 2.2 again.

### 2.6 Stdio MCP via npm or a GitHub release: **the distribution form of 2.1**

Not a separate architecture: it is how `dist/local.mjs` reaches people. Two forms: a source checkout (clone, `pnpm install --frozen-lockfile`, `pnpm build`) and a prebuilt single-file bundle (a GitHub release asset or an npm package). Both are hosted by third parties (GitHub, npm); the author operates nothing. The build is byte-reproducible (the starter's `pnpm test` builds twice and compares), so a user can rebuild from source and compare hashes against a release asset. Publishing is a user decision and has not been made; no package or release exists.

### 2.7 Plugin or relay holds an owner key: **rejected**

Would remove the signing round trip and the whole sign-then-submit design. Rejected by the standing rule that no component holds an owner key `[P1 §5.1]`; it also turns a credential leak into a fund loss.

---

## 3. Distribution matrix

"Today" means 2026-10-19, with the code in this repository and no publication having happened.

| Channel | Who can use it today | Friction | Trust the user must extend | What the author must operate | Blockers |
|---|---|---|---|---|---|
| **A. Local stdio, source checkout** (`dist/local.mjs` built from the repo) | Anyone who obtains the repo and has Node 24, pnpm 11.11.0, an MCP client that can launch a stdio server, and a signer | Highest: clone, install, build, edit the client's MCP config, set env and a master key | Only the code they read and build; can rebuild and compare hashes | Nothing | `src/local.ts` not built yet (`embedded-local`). Signer compatibility beyond PayBox is unverified |
| **B. Local stdio, prebuilt bundle** (GitHub release asset or npm package) | Same people minus the build step. **Nobody today**: nothing is published | Medium: download, point the client at the file | The publisher's artifact; mitigated by reproducible build and published hash | Nothing (GitHub or npm host the file) | Publication is the user's decision and not made. Package metadata must carry no personal identifier. Node version support is unverified |
| **C. PayBox hosted sandbox, stateless subset** (`dist/plugin.mjs`) | Nobody today | Lowest for PayBox users: enable under Unofficial plugins | PayBox's sandbox and the plugin owner's portal config (env, hosts) | Portal configuration only (env vars, host list); no server | B0. Stateless private tools also need the open XO facts in section 4.4 |
| **D. PayBox hosted sandbox with a relay behind it** | Nobody today | Low for the user, high for whoever runs the relay | The relay operator holds credentials | A public TLS relay | B0 and section 2.2 (declined). A user-run relay reachable by the sandbox is possible in principle and unproven |
| **E. PayBox remote URL plugin** | Nobody | Unknown | The server operator and PayBox review | A server | Registration undocumented `[06 §7]`; not found whether it can return proposals |
| **F. Hosted multi-tenant relay (any client)** | Nobody | Low | The operator holds everyone's credentials | Everything in section 6 | Declined (section 2.2) |

The reading tools and the offline draft validator work in every channel that exists. The only channel that gives everyone a complete path on day zero is A (and B once published).

---

## 4. Design (not built): the stateless hosted-sandbox variant

Goal: make channel C useful for private operations without any relay and without the author holding anything. This section is a design; none of it is implemented. It is **gated**: do not build it until (1) an upload path exists (B0) and (2) T2 has shown that `GET /auth/derive-api-key` returns the secret on repeat calls (section 4.4, item 1). If (2) fails, the variant is dead and channel C stays at its read-only plus proposal subset.

### 4.1 What the sandbox allows (checked in `[04]` and `[06]` before relying on it)

| Capability | What the notes say | Consequence for the design |
|---|---|---|
| Memory or disk across calls | None: "every operation uses a fresh sandbox" `[06 §2]` | No ledger, no prepared-item store, no watchers, no persisted credential |
| Per-user secret | None. Env vars are plain-text "non-sensitive" and plugin-wide; brokered headers are owner-level, host-scoped and "the plugin ... does not read the secret from `process.env`" `[06 §2, §8]`, `[04 §6.1]` | A secret cannot be held for a user. A brokered header cannot be used as an HMAC key, because the code never sees it |
| User identity | Not sent; the wallet id is withheld. Anything else is not found `[06 V item 5]` | Owner address must be a tool argument; ownership is proven by a signature, not by identity |
| Env var visibility to installers | Not found `[06 §12]` | Treat every env var as public |
| Query-string credentials | Cannot be brokered `[06 §2]` | An RPC URL with a key cannot be used; explorer log reads are keyless |
| Time and size | 10 s per operation, 256 KiB stdout, 16 KiB stderr, 1 start per second and 1,000 per rolling 24 h per user, 16 hosts `[06 §2]` | One derive plus one XO call per invocation; no background completion |
| Retries | PayBox never retries a tool call automatically `[04 V item 5]` | Ambiguity must be handled by the agent |

### 4.2 The flow

All of it is per call; nothing survives the call.

1. **Prepare** (pure plus public reads): the agent passes the owner address. The tool derives the XO account locally (CREATE2, no state), reads the clock with `GET /time`, builds the thing to sign (an order's Kernel-wrapped digest, a UserOp hash, or an L1 ClobAuth digest) and returns the exact `request_wallet_sign` intent plus a decoded summary and `digest_tag`. Same `Prepared.sign` shape as the stateful mode, minus `prepared_id`: there is no store to hold it.
2. **Sign:** the agent calls the wallet's sign tool, once for the order or UserOp and once for the L1 ClobAuth when a private XO endpoint is needed.
3. **Submit** (one invocation, at most 10 s): the arguments carry every field of the item plus the signature(s). The tool then:
   - recomputes the digest from the arguments and recovers the signer under both digest forms; refuses unless it equals the owner;
   - re-runs the caps, floors, fee-bound and flag checks against the arguments and public chain reads, fail closed;
   - calls `GET /auth/derive-api-key` with the L1 headers (never `create`; see 4.4), keeps the triplet **in local variables only**, computes the L2 HMAC, makes the one XO call, and discards the triplet;
   - returns a result that is scrubbed so that no triplet, HMAC value or L1 signature can appear in it.

### 4.3 What replaces what

| Stateful mode (local, or hosted with relay) | Stateless variant |
|---|---|
| Stored HMAC triplet (encrypted at rest) | Re-derived per call from an L1 signature; held inside one invocation; never stored |
| `prepared_id`, single-use record, TTL | The arguments themselves. The signature binds them: if the agent alters any field after signing, the recomputed digest differs and the owner recovery fails. Expiry is the signed order expiration (it is inside the hash); a UserOp has none |
| Quote token / MAC | **Not used.** See below |
| Daily ledger with reservation, `sending` marker, ambiguity hold | Cap check against XO history and chain logs (below); no reservation, no durable marker |
| Capability facts recorded by probes | Fixed pessimistic defaults, optionally flipped by the plugin owner through env vars after a recorded test (the facts describe XO, so they are not per user). A flag therefore flips for every installer at once |
| Kill switch in the relay's environment | Owner-level env var `XO_KILL_SWITCH`, changed in the portal ("Owners can update runtime hosts, variables and API credentials without resubmitting code" `[06 §2]`). The owner is a dependency for the kill switch; that is the one place the author's portal access matters |
| Audit log (append-only file) | None that persists. stderr is capped at 16 KiB per operation and is not retained by this design |
| Watchers (creation review loop) | None. A `track` call polls once per invocation |

**Quote tokens: why no MAC.** The task asked to check what the platform allows before claiming a MAC'd token under an owner-level plugin secret. It does not allow it safely. A MAC needs a key the code can read. The only readable channel is an env var, which is plain text, plugin-wide, and of unknown visibility to installers; brokered headers are unreadable by code. A key in that channel must be assumed public, and the reference plugin that did this fell back to a public default key and sent the confirmation code in its own error text `[04 §6.1, V item 11]`, so a MAC would give a false sense of security. It is also unnecessary: the signature already binds the arguments, every check is a pure function of the arguments plus public data, and the signed expiry bounds the age. The only thing a MAC would add is proof that `prepare` ran, and `submit` re-checks everything anyway. Any MAC added later must be described as defence in depth and the design must stay safe when its key is known.

**Daily cap without a ledger.** Sources, none exact:

| Source | Gives | Limit |
|---|---|---|
| `OrderFilled` and `OrdersMatched` logs by maker (keyless explorer logs, topic filter by account) | Filled volume per account, public | Explorer `getLogs` caps at 1,000 rows, so the query must use narrow topics and block ranges `[P1 §1 gate 9]`; lag between fill and indexing; does not see orders that were placed and cancelled |
| `GET /orders` (L2, needs the per-call derive) | Open orders (resting outlay) | Requires a fresh L1 signature, so one more approval; no query string on signed requests `[P1 gate 1]` |
| `GET /trades` and `GET /data/orders` (L2) | Trade and order history | Whether they carry timestamps and include cancelled orders is **unverified** |
| Base logs of the funding route | Funding already sent | Needs a Base reader (the stateful funding code has one; wiring into the sandbox is not designed here) |

The check is: filled in the last 24 hours plus resting outlay plus this order's outlay must not exceed the cap, else refuse. If any source cannot be read, refuse. Honest limits: concurrent invocations race (two sandboxes can both read the history before either order lands, so the overshoot is up to the concurrency times $10), history lags, and a place-then-cancel loop is not counted because it spends nothing until filled. This is strictly weaker than the ledger with reservations and it is advisory against a compromised agent like every cap here. The account balance is the other bound: with funding capped at $10 until T4 passes `[P1 §8 D3]`, the balance itself limits loss.

### 4.4 Open XO facts this design needs

| # | Fact | Where it stands | Effect if the answer is bad |
|---|---|---|---|
| 1 | Does `derive` return the secret and passphrase on **every** call? | Genuinely unresolved, evidence balanced, confidence L `[01 V1]`: three statements say "never returned again", three artifacts (schema, example, official sample code) say derive returns it. Settled only by T2 (derive once more and compare) | Variant is dead. There is no fallback: `create` mints a new key per call up to an unknown cap, and the delete route is probably L2 and so unusable after a lost secret `[01 V2]`. The rule "never create a second key" stays |
| 2 | Is an L1 signature single-use (nonce semantics), or can it be replayed inside its window? | Not found `[01]`; only the timestamp window was measured | If single-use: one L1 signature per private call (the design's default assumption). If replayable: one signature can serve a few calls inside the window, which reduces approvals and raises the value of a leaked signature (4.5) |
| 3 | L1 window width | About plus or minus 120 s of server time: accepted at -115 and +119, rejected at -120 and +121 `[01 V]`; a single-session measurement | The agent must sign and submit within about 90 s of `prepare` (`[P1 §5.2]` uses 90 s). The tool checks age against `GET /time` and refuses stale |
| 4 | Sandbox clock agreement with XO | Not found | Use XO's `GET /time` as the only clock for L1 and L2 |
| 5 | Is L2 required on `POST /order`? | Unknown; treated as yes (A8) | If no, a leaked order signature is postable by a stranger, and the per-call derive is unnecessary for placement |
| 6 | HMAC decode, padding and target (path with or without query), `XO_ADDRESS` on L2 | OR9 and OR10 unresolved; the pessimistic mock profile is path-with-query, stripped decode, address required `[P1 §4 N6]` | Without persisted facts each call would have to try variants inside 10 s. The design instead fixes the variant in owner env after T2 |
| 7 | Does the sandbox's User-Agent pass XO's Cloudflare rules? | Open `[P1 §9 A8]` | Every XO call fails with 403 |
| 8 | Which approval mode applies to plugin proposals and to `request_wallet_sign` under each grant | Docs contradict each other `[06 §6, V item 4]`; settled only by T0 | Changes how many human approvals each call costs, not whether the design works |

### 4.5 Security cost

- **The L1 signature is the cost.** It travels through the agent's context and PayBox's request records (retention of a signature in PayBox request output is **unverified**). While it is valid (about 2 minutes) whoever holds it can call `derive` and receive the **permanent** triplet, if fact 1 is yes. The triplet does not place orders (every order needs the owner's Kernel signature, M) but it reads private orders and sends cancels, and a leaked triplet cannot be revoked if the delete route is L2 `[01 V2]`.
- **It happens more often.** The stateful mode exposes an L1 signature once per credential set. This variant exposes one per private call, so the number of chances to leak is higher by the number of private calls. That is the real price of statelessness.
- **Nothing at rest.** The mirror image: no stored triplet means no store to steal, no master key, no backup to protect. A plugin-side compromise yields only the triplets of calls in flight.
- **Weaker caps** (4.3) and **no durable ambiguity handling**: if a `POST /order` times out, the invocation cannot reconcile later. The result is `ambiguous`; reconciliation needs a status call with a fresh L1 signature, or a public read by order hash that no note shows to exist. The agent must never resend.
- **Owner-level config is shared.** Flags, the kill switch and the HMAC variant are one setting for all installers, held in the author's portal.
- The caps-are-advisory caveat holds unchanged, and approval-gated mode costs two approvals per order here (order plus L1) and one per private read.

### 4.6 What degrades

Private reads (open orders, history) cost one approval each. No creation watchers, so market tracking is poll-on-demand. No daily reservation or ambiguity hold. No persisted capability facts. No audit trail. No in-process background send; the 10 s budget applies to every step, and a taker `POST /order` blocks 500 ms to 3 s `[P1 §0 item 6]`. The Base funding proposals and the read tools are unaffected, since they never needed state.

---

## 5. What is guaranteed on day zero, and what is not

This section separates two kinds of statement. The first column holds properties of the design and the code that are not subject to any open XO or PayBox fact. The second holds what waits on a recorded test. Neither is softened.

### 5.1 Guaranteed (no XO door, no live test involved)

1. **No operator is required.** Local mode needs no author server, no relay key, no allowlist, no account with the author. This is the acceptance criterion of the `embedded-local` task. If that task does not deliver it, day zero is not met and this record is falsified, not the criterion relaxed.
2. **The read tools work with no credential.** The six public read tools (`xo_search`, `xo_get_markets`, `xo_get_market`, `xo_orderbook`, `xo_market_prices`, `xo_positions`) use XO's public keyless endpoints `[02]`. This depends on XO keeping those endpoints open, which is true of any client of XO and is outside the author's control.
3. **Draft lint is free and offline.** `xo_validate_market_draft` reads only its arguments, the clock and the environment; it makes no network request, signs nothing and moves no money (`src/tools/draft.ts`).
4. **Every write path is OFF by default.** Seven flags, all default OFF, an unrecognised value means OFF, an unrecognised kill-switch value means ON, and nothing an agent or a market says can turn one on (`src/relay/flags.ts`, `test/relay-flags.test.ts`).
5. **Dry-run prepare works without any flag.** Without `ENABLE_USEROP_SUBMIT`, `prepare` returns the packed operation, hash and digest and sends nothing `[P1 §4 N1]`.
6. **Untrusted text is fenced.** A market title reaches an approver only inside the fixed `[market title (untrusted): "..."]` slot, truncated to 80 characters, with control and bidi characters stripped.
7. **Every tool description states the three safety facts:** caps are advisory against a compromised agent, approval-gated mode is the only mode in which a human sees each signature, and the XO owner should be a dedicated PayBox credential (`SAFETY_NOTICES` in `src/relay/contract.ts`).
8. **No component holds an owner key or sends anything unsigned or not matching a prepared item.**

### 5.2 Not guaranteed: depends on the four XO doors, door (e) and T0 to T8

No write works because it is built. It works if and only if the test that gates it has been run by the user and recorded. This record makes no prediction in either direction about any of them.

| Capability | Gated by | Until then |
|---|---|---|
| Sign anything through PayBox (raw output shape, `0x` handling, `typedData` on chain 3223, approval behaviour, how the window renders a digest) | T0 | `raw` only; approval-gated mode recommended; the conformance harness and the mock stand in |
| Deploy plus Enable Trading, revoke trading, redeem (door (a): the bundler admits a first UserOp from an account XO never provisioned) | T1, T5 | Dry-run prepare only |
| Credentials: connect, derive, key lifecycle, order auth (doors (b), (c); OR9, OR10) | T2 | Off; at most one key create per account |
| Fund (door (d), and door (e): XO's relayer delivers a message that did not come through XO's executor) | T3a | Test amount only, then not above $10 total until T4 |
| Withdraw (hypothesis H1, unverified) | T4 | Off. Treat any funded account as one-way |
| Place, cancel and list orders (gateway minimum size, GTD minimum, duplicate key, signature prefix and digest form) | T2, T3b | Off |
| Capped allowance and the on-chain revoke | T8 | XO's own unlimited shape while the balance is a test amount |
| Market creation (does XO's oracle accept a self-hosted metadata URI) | T6, T6b | Lint and dry run only; if T6 fails creation stays blocked |
| The stateless variant of section 4 | B0 and T2 (fact 1) | Not built |

Also outside the guarantee: PayBox behaviour (autonomous grants, window rendering, chain policy for 3223), XO changing any parameter on any day (paymaster allowlist, role wiring, exchange upgrades; tripwires turn most of this into "go read-only"), and the stranded-funds risk until T4.

---

## 6. Migration path if a hosted multi-tenant relay is chosen later

Nothing here is built. It is a list of what is already in place and what would be added.

### 6.1 Already keyed per owner

- **Routes.** Every request in `src/relay/contract.ts` names an `owner`; the relay derives the account and rejects a caller-supplied `account` that differs (invariant 1).
- **Credential store.** Sealed records are AES-256-GCM with the lower-case account address in the AAD, so a record copied into another account's slot fails to open (`relay/crypto.ts`).
- **Ledger.** Day usage is keyed by account and UTC day, lifetime funding by account, with a per-account lock (`relay/ledger.ts`).
- **Prepared items** bind the owner, and the single-use rule is per item.
- **Flags and the kill switch** are process-wide today, which is right for a single operator and wrong for per-tenant controls (see 6.2).

### 6.2 To add

| Need | What it means |
|---|---|
| **Tenant authentication** | Replace the shared `X-Relay-Key` plus owner allowlist with signed-challenge sessions: the relay issues a challenge, the owner signs it through the wallet, and the relay binds a short-lived session to the recovered owner before it stores or uses a triplet `[P1 §9 A5]`. Without this, any caller can name any owner |
| **TLS** | A public listener with TLS termination, certificate renewal, `Host` and `Origin` validation (today it binds 127.0.0.1) |
| **Per-tenant rate limits** | The upstream client has a per-host token bucket (4 requests per second per host). That is global. Add a per-tenant bucket in front of it so one tenant cannot starve the rest or trigger XO limits for all, and a per-tenant cap on pending prepared items |
| **Pooled-egress policy** | Decide how many tenants share one XO-facing address; XO's region checks and misuse clauses apply to it (**unverified** how XO treats it) |
| **Abuse handling** | Per-tenant suspend, blocklist, quarantine of a tenant's credentials, and a process for reports. The software kill switch becomes global plus per-tenant |
| **Credential custody operations** | Master-key custody and rotation for the shared store, encrypted backup and tested restore at tenant scale, deletion on request, a breach plan. Note again that a triplet cannot place orders but exposes private data and cancels |
| **Durability and scale** | The current store is a local journal plus a snapshot rewritten by write-temp, fsync, rename (`relay/store.ts`), with no database; many tenants need a database, a lock model beyond per-account locks in one process, and a way to run more than one instance |
| **Observability and audit** | Per-tenant audit logs, redaction review, alert routing. The current alert sink is a file plus a desktop hook |
| **Terms and disclosures** | A statement to tenants of what the operator holds and can do, and the caps-are-advisory caveat, since a hosted operator would otherwise appear to enforce limits it cannot enforce against a tenant's own agent |
| **Plugin side** | The hosted-sandbox plugin sends the tenant session (an authorisation the plugin can pass as an argument or, for a single shared header, a brokered header) instead of a shared relay key. A brokered header is shared by all installers, so per-tenant identity must come from the session argument, not from the header |

### 6.3 Order of work if it is ever chosen

(1) tenant authentication, (2) TLS and per-tenant limits, (3) database and backup, (4) abuse and audit, (5) a closed beta with a small number of owners who accept the custody terms, (6) only then publication. Local mode stays available throughout and remains the recommended path for anyone who does not want to extend that trust.

---

## 7. Unverified items collected

- `src/local.ts` and `dist/local.mjs` do not exist yet; every local-mode statement is a requirement on the `embedded-local` task.
- Whether the built bundle runs on a Node version other than 24.21.0.
- Whether any wallet MCP other than PayBox accepts the `raw` and `typedData` intents the contract emits.
- PayBox `raw` output shape and `0x` prefix handling; `typedData` on chain 3223; how the signing window renders a digest; autonomous behaviour for plugin proposals and for `request_wallet_sign` (all T0).
- Whether a non-entrant can upload a plugin after Chapter 1 (B0); how a remote plugin is registered; whether a remote plugin can return proposals or receives a user identity.
- Visibility of env var values to installers.
- Retention of a signature in PayBox request records.
- Whether `derive` returns the secret on every call; L1 single-use and replay semantics; whether `GET /trades` and `GET /data/orders` carry timestamps and cancelled orders; whether a public order-by-hash read exists; whether the sandbox's User-Agent passes Cloudflare.
- How XO treats many users behind one egress address (the pooling argument against a hosted relay is an inference).
- Capability facts are believed to be global (they describe XO), not per owner; check `relay/capabilities.ts` before relying on that in section 6.

## Sources

`docs/phase1-gap-closing.md` (sections 0, 1, 4, 5.2, 5.4, 6, 7, 8, 9); `docs/research/01-xo-auth-signing.md` (L1 window, derive evidence and Verification V1, V2); `docs/research/02-xo-read-api.md` (public reads, L2-only endpoints); `docs/research/04-paybox-reference-plugins-a.md` (sections 6.1, 6.2, 9, Verification); `docs/research/06-paybox-platform.md` (sections 2, 4, 6, 7, 8, 10, Verification); `docs/phase0-gate-results.md` (B0); repo files `src/relay/contract.ts`, `src/relay/flags.ts`, `src/tools/draft.ts`, `src/tools/read.ts`, `relay/crypto.ts`, `relay/ledger.ts`, `relay/store.ts`.
