# Live-test runbook

For the person who will run the live tests of `docs/phase1-gap-closing.md` section 6, later, on their own machine. Written 2026-10-19 with that document's section 9 (the amendments, which override the rest). Nothing here has been run against a real service: every script was run end to end against the local mock and a local anvil only, and nothing was signed, sent, paid or posted anywhere. Nobody contacts the XO team; none of these tests needs to.

Eleven scripts live in `scripts/live/`, one per test. Each is optional, each needs your explicit go, and each is a real action on XO's or PayBox's systems (an account, a key, a deposit, an order, a market), not a read.

## 1. The rules every script follows

| Rule | What it means for you |
|---|---|
| Dry run by default | Without `--confirm` a script prints its plan (every call, the cost, the stop rule) and does nothing. `--dry-run` prints the plan and stops even with `--confirm`. |
| `--confirm` and `--budget-usd` | Both are required, even for a $0 test. The budget must cover what the plan puts at risk and may not exceed the worst case in section 3. |
| Mock by default | `--target=mock` (the default) is a rehearsal on the local mock XO with a stand-in for PayBox that signs with a PUBLIC Anvil test key. Nothing leaves the machine. Use it to see what a test will do. |
| Live needs three more things | `--target=live` also needs `XO_LIVE_ACK=<test id>` in the environment (a comma list such as `T0,T1`; one test's acknowledgement does not cover another), `--owner`, `--data-dir`, and `--credential-id`. |
| Every call is printed first | Method, URL, a JSON-RPC method if any, header names and the body with secrets masked are printed BEFORE the call is made, and the status after. A request that the kit refuses (an unlisted host, an unlisted write, a second copy of a write) is printed as BLOCKED and ends the run. |
| Fixed identity | Every request carries one pinned `User-Agent`, `insurance-markets-xo-plugin/0.2`, and no `From`, `Referer`, `Origin`, cookie or forwarding header. Nothing in the kit holds a name, address or path of a person. |
| No secret is printed | Signatures, the relay key, the master secret and XO's HMAC triplet are registered as secrets and replaced by `[redacted]` in every line, in plain, URL-encoded and JSON-escaped form. A 65-, 66- or 86-byte hex string is masked wherever it sits. 32-byte values (digests, hashes) are printed: you compare them with what PayBox shows. |
| A write is never retried | Each test lists the writes it may make and how many. A second copy of a body, or a write that is not on the list, is refused by the transport. An ambiguous result is reconciled by hash, never resent. |
| Stop rules end the run | The test's stop rule (section 3) is enforced in code. A 401 or 403 from the XO node, bundler or explorer is recorded as "requires key" and stops the run; nobody looks for a key. A Cloudflare challenge also stops it and is not worked around. |
| Facts only after you type a phrase | A run PROPOSES capability facts. Nothing is recorded until you type the exact phrase it prints (`RECORD T1=yes`). Anything else records nothing. On the live target you also type `RUN <test>` before the first signature is asked for. |
| One data directory, one owner | The script runs its own relay inside its own process. Stop `pnpm relay` before you point a script at the same `--data-dir`. |

Exit codes: 0 passed (or a dry run you asked for); 1 ran and did not pass (a stop rule, a failure, an inconclusive result); 2 refused before anything ran; 3 internal error; 4 the environment cannot run it (a rehearsal needs `anvil`).

## 2. Before you start

Do these by hand. Nothing in the kit does them for you.

### 2.1 In PayBox (the O1 precondition, amendment A4)

1. **A dedicated credential.** Create a new EVM credential that will own the XO account and holds only what you are willing to fund. The owner key of a PayBox credential is also that wallet's own Base address, so one approval of an opaque digest can move its Base funds, not only the XO account's. Never use your main wallet. Note its address (this is `--owner`) and its `credential_id` (PayBox `list_credentials`; this is `--credential-id`).
2. **Approval mode.** For T1 onward the credential must be approval-gated (`iframe` or `always_approve`) so a human sees each signature. Under an `autonomous` grant nothing is shown to anyone before PayBox signs, the plugin's caps do not bind an agent that can call `request_wallet_sign` itself, and a compromised agent can mint its own XO credentials. Autonomous is for the throwaway T0 credential only.
3. **The wallet grant.** The MCP client you use to run PayBox tools needs a grant on that one credential for `request_wallet_sign` (and, for T3a, the ability to send a Base transaction, either a transaction proposal or `request_wallet_sign` with `op: "transaction"` plus your own broadcast). Grant only that credential.
4. **A throwaway credential for T0.** T0 signs random digests. Use a separate, empty EVM credential for it. It may be autonomous; that is what lets T0 record what an autonomous grant does (PB3).
5. **Fund the owner's Base address** for T3a: Circle USDC (the amount in section 3) and a little ETH for gas. Anyone can call the Base router, so any Base wallet can send the two calls if PayBox cannot; whether a direct transfer is delivered on XO is exactly what T3a tests.

Whether PayBox can sign a raw digest, sign typed data on chain 3223, what it returns and what its window shows are the questions T0 answers. Until T0 is recorded, the kit tries `raw` first with the `0x` prefix on `rawSigningPayloadHex`, then without it.

### 2.2 On this machine

```sh
cd <the repository>
source .tools/env.sh          # the project-local Node 24 and pnpm; never the system Node
anvil --version               # the mock rehearsals need anvil; the live target does not
export XO_DATA_DIR=<a directory OUTSIDE this repository, mode 0700>   # capability facts and encrypted credentials live here
export RELAY_MASTER_KEY=<at least 16 characters you will keep somewhere safe>   # or leave it unset and be asked on a terminal
```

The master key seals XO's HMAC triplet on disk. It is read from the environment or typed at a prompt, never from a file. Without it the stored credentials cannot be opened; keep a copy. `RELAY_BASE_RPC_URL` is optional (a Base node of your choice for the funding reads; the default is the public Base node). `RELAY_SELF_HOST` is an https URL (the folder that serves your market metadata) that the relay may read in T6; it has no query or fragment. `KILL=1` (or `XO_KILL_SWITCH=1`) refuses every script. `LIVE_KIT_DEBUG=1` prints a stack trace for a relay that did not start.

The kit passes only the following variables on to the relay it runs, and reads nothing else from your environment. Every one is optional; each can only tighten what is compiled in, never raise it.

| Variable | What it does |
|---|---|
| `XO_LIVE_ACK` | the acknowledgement, a comma list of test ids (live target only) |
| `KILL`, `XO_KILL_SWITCH` | the software kill switch; any non-false value is ON |
| `RELAY_MASTER_KEY` | the master secret of the credential store (at least 16 characters; or be asked) |
| `XO_MAX_ORDER_USD`, `XO_MAX_DAILY_USD` | the caps, $10 per order and $50 per day by default, clamped to the compiled-in ceilings |
| `XO_PRICE_BAND_TICKS`, `XO_QUOTE_TTL_SECONDS`, `XO_ORDER_EXPIRY_SECONDS` | the plugin's price band, quote life and order life |
| `RELAY_BASE_RPC_URL`, `XO_BASE_RPC_URL` | the Base node the relay and the funding tool read (https, no credentials or query in the URL; the public node by default); both hosts are on the kit's list, nothing else is |
| `XO_RPC_URL`, `XO_BUNDLER_URL` | an XO node and bundler other than the defaults |
| `RELAY_ALLOWANCE_POLICY`, `RELAY_UNLIMITED_BALANCE_MAX_USD`, `RELAY_ALLOWANCE_FLOOR_USD` | the Enable Trading allowance policy (`auto` or `capped`) and its two figures (decision D4) |
| `RELAY_SEED_CAP_USD` | the creation seed cap (compiled-in $10.80, lowered only) |
| `RELAY_FUNDING_TEST_CAP_USD`, `RELAY_FUNDING_DAILY_CAP_USD`, `XO_FUNDING_TEST_AMOUNT_USD` | the funding caps: $10 in total until T4 passes, then $50 a day; the test amount, lowered only |
| `RELAY_SELF_HOST` | the https folder that serves your market metadata (T6) |
| `RELAY_ACK_TRIPWIRES`, `RELAY_ENFORCE_FLAG_FACTS` | acknowledging a tripwire at start-up by id; switching the fact gate off (the banner then says so; do not) |
| `LIVE_KIT_DEBUG` | `1` prints a stack trace when the relay did not start |

To list the tests and rehearse any of them: `pnpm exec tsx scripts/live/index.ts`, then for each `pnpm exec tsx scripts/live/<slug>.ts --help`.

### 2.3 Rehearse first

Run the whole sequence once on the mock, so you know what you will be asked to do and what the output looks like:

```sh
pnpm exec tsx scripts/live/t1-deploy-enable-trading.ts --confirm --budget-usd 0 --prove-revoke
```

The mock target has two profiles (`--mock-profile optimistic`, the default, and `pessimistic`) and single switches (`--mock-set bundler.foreign_account=reject`) so you can see each stop rule fire.

## 3. The order of the tests, what each costs, what each settles

Recommended order: **T0, T1, T2, T3a, T4, T3b, T3c (optional), T5, T8, then T6 and T6b.** Costs are the section 6 table reconciled by amendment A10: the 1,000 bps cap multiplier (the relay's `ORDER_CAP_FEE_BPS`, raised from 800 at the Cockpit integration) is added to every BUY, T3a deposits $2 to $3 (not $1) if T3b and T3c follow, Base gas is extra and in ETH, and a deposit that cannot be exited stays where it is. "Worst case" is the most a script lets `--budget-usd` be.

| Test | Script | Worst case | What the money is | Settles | Flags it arms for its own run |
|---|---|---|---|---|---|
| **T0** PayBox signing probes | `t0-paybox-signing.ts` | $0 | nothing; contacts no service | UO2, PB1 to PB4; the PayBox half of gate 8 | none |
| **T1** Deploy plus Enable Trading (door a) | `t1-deploy-enable-trading.ts` | $0 | sponsored, zero fee; an unlimited allowance on a $0 account | AD5, UO3 to UO7, AD4, door (a), part of door (b) | `ENABLE_USEROP_SUBMIT` |
| **T2** Credentials and gateway probes | `t2-credentials.ts` | $0 | uses the account's one key slot (the cap is unknown) | AU1 to AU4, OR9, OR10, doors (b) and (c) | `ENABLE_TRADING` |
| **T3a** Deposit (door d) | `t3a-deposit.ts` | **$3** | the deposit itself, one-way until T4; plus Base gas | FU3 to FU7 | `ENABLE_FUNDING` |
| **T4** Exit test (H1) | `t4-exit.ts` | **$3** | reuses part of the T3a deposit; if it fails the money stays stranded | FU9, UO8, N5 | `ENABLE_USEROP_SUBMIT`, `ENABLE_WITHDRAW` |
| **T3b** First order | `t3b-first-order.ts` | **$0.55**; **$0.66** with `--probes` | $0.50 principal plus the cap multiplier while a post-only order rests; released on cancel; probes are at most $0.33 each, two at once for the duplicate probe | OR3, OR4, OR6, OR11 to OR14, OR17; gate 2 | `ENABLE_TRADING` |
| **T3c** Fee reconciliation (optional) | `t3c-fee-reconciliation.ts` | **$1.10** | a $1 FOK BUY plus up to 10% (the cap; the fee tripwire still compares the realised fee with 800); you then hold a $1 position | OR7, OR8 | `ENABLE_TRADING` |
| **T5** Redeem | `t5-redeem.ts` | $0 | sponsored or paymaster-less, zero fee | UO11, nonce lanes, policy for a foreign account | `ENABLE_USEROP_SUBMIT` |
| **T8** Capped allowance, revoke, kill switch | `t8-capped-allowance.ts` | **$1.43** | two resting post-only orders of $0.55 and $1.43 at most (the second is expected to be refused); released on cancel | N14; the on-chain revoke; the software kill switch | `ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING` |
| **T6** Creation experiment | `t6-creation.ts` | **$1** | the creation fee, not refundable | CR3, CR4, AD10, N8 | `ENABLE_USEROP_SUBMIT`, `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA` |
| **T6b** Seed (after T6 is active) | `t6b-seed.ts` | **$10.80** | a $10.00 stake times the 1.08 fee multiplier, locked until cancelled | CR7 | `ENABLE_TRADING`, `XO_ENABLE_CREATE` |

Differences from the section 6 table, all deliberate: T8's table cost is $0 but its two orders can lock up to $1.43 if the gateway takes the one that should be refused; T3b and T3c carry the 1,000 bps cap multiplier (A3, the amended D2 and the Cockpit integration; the ceilings rose by one to three cents against the earlier 800 bps figures); T6b carries the seed cap of $10.80 (A3). Money at risk on the core path (T0 to T5, T8): the $3 deposit if it cannot be exited, $0.55 locked briefly, and up to $1.10 in T3c. T6 adds $1 (gone). T6b locks $10.80, which with T6 is **above the $10 funding cap that holds until T4 passes**: raising that cap is your decision (open item O2), and no script does it.

Outcomes (section 6): T1 rejected, go to Plan B (below), else the write path is closed. T3a credited but T4 failed, keep funding at or below $10 and treat the account as one-way. T3a not credited, stop and do not fund again. T6 rejected or ignored, creation stays blocked.

## 4. Each test: how to run it, what you will be asked, what a result means

In every command, add `--target=live --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>` and set `XO_LIVE_ACK=<test id>`. The examples show only the test's own options. Rehearse the same line on the mock first (drop those four options).

### T0 PayBox signing probes

```sh
XO_LIVE_ACK=T0 pnpm exec tsx scripts/live/t0-paybox-signing.ts --target=live --confirm --budget-usd 0 --owner <throwaway address> --data-dir "$XO_DATA_DIR" --credential-id <throwaway id>
```

Asks you to: run PayBox `check_operation_readiness` for `request_wallet_sign` with a raw and with a typed-data intent (a dry run), then run `request_wallet_sign` with exactly the arguments the script prints (a random 32-byte digest, with the `0x` prefix; the bare spelling too if the first is refused or you pass `--both-prefixes`; then a Kernel-wrapped typed-data payload on chain 3223), paste what came back, and say what PayBox showed first and what its signing window displayed.

What it records as capability facts: **PB1** (raw signing works; the value is `rawSigningPayloadHex.<0x|bare>.<answer shape>`, so the field name, the `0x` handling and the shape of the answer are all in one place), **UO2** (raw signs the digest as it is, or PayBox signed under the EIP-191 prefix; either is accepted by the relay), **PB2** (typed data with chain id 3223 and a foreign verifying contract), **PB3** (what an autonomous grant does) and **PB4** (what the signing window shows), and **T0**. Stop rule: if raw cannot sign a digest the write path is blocked on PayBox; `op: "message"` with the digest as hex text is tried only then, and it does not authorise anything the chain checks.

### T1 Deploy plus Enable Trading (door a)

```sh
XO_LIVE_ACK=T1 pnpm exec tsx scripts/live/t1-deploy-enable-trading.ts --target=live --confirm --budget-usd 0 --prove-revoke --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

The relay derives the owner's XO account, confirms from the chain's logs that it is not deployed, builds the deploying operation (initCode, then `USDC.e.approve(exchange, max)` and `CTF.setApprovalForAll(exchange, true)`, zero fees, `PolicyPaymaster` after `checkPolicy`) and you sign its digest once with `raw`. The relay submits it once and the script follows it, then reads `AccountDeployed`, `OwnerRegistered`, `Approval` and `ApprovalForAll` and asks the orderbook whether it knows the account. **Do not fund an account before this test passes**: USDC.e minted to an undeployed account can only be moved by an operation, which needs this door.

`--prove-revoke` (recommended before any funding, amendment A11) adds two more signatures and two more operations, still $0: the on-chain `revoke_trading` (`approve(exchange, 0)` and `setApprovalForAll(false)`, sent without a paymaster at zero fee), checked by reading the allowance back, then Enable Trading again. If the revoke does not hold, T1 is proposed as **no** so the flags that need it stay locked, and you must not fund this account. Stop rule: any 401, 403 or "key required" is recorded as "requires key" and stops the run; a plain rejection text is stored as a fact.

### T2 Credentials and gateway probes

```sh
XO_LIVE_ACK=T2 pnpm exec tsx scripts/live/t2-credentials.ts --target=live --confirm --budget-usd 0 --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

First a restore drill (the credential store seals a secret, loses its file and restores it from the encrypted backup; T2 is gated on this), then the relay prepares a login (a timestamp from XO's own clock) and you sign it **within about 90 seconds** (XO accepts it for about 120). The relay then derives, creates at most one key, stores it encrypted **before** using it, makes at most six signed probes and derives again. `--probe-l2-on-post` (your call) adds one `POST /order` with a deliberately invalid signature and no L2 headers to learn whether L2 is required on order intake (OR9); it cannot place an order. Facts: the accepted L1 form (AU6), the accepted HMAC form (OR10), whether derive returns the secret (AU2), **T2**. Stop rule: six failed probes; never a second key. If the key store reports the credentials already exist, the script says so and stops; it never makes another.

### T3a Deposit (door d)

```sh
XO_LIVE_ACK=T3a pnpm exec tsx scripts/live/t3a-deposit.ts --target=live --confirm --budget-usd 3 --amount-usd 3 --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

`--amount-usd` is $1 (the deposit arrives, nothing more) up to $3 (if T4, T3b and T3c will follow). It drives the plugin's own funding tool in this process: the relay is asked first (caps, the reservation), eight preflight checks on the Base route run, then ONE call at a time is printed for you to send from the **owner's** Base address: the exact-amount `approve` on Circle USDC, then `transferRemote(3223, <your account>, amount)` on the Base router, both with `value` 0. Paste each transaction hash. The script then follows the Hyperlane message for up to 10 minutes and reads the credited balance. Stop rule: if nothing is credited in 10 minutes, **do not send another**; check `Mailbox.delivered` with the message id the script prints. It is a rule of the kit that a second transfer is never asked for once the hash is known.

### T4 Exit test (H1)

```sh
XO_LIVE_ACK=T4 pnpm exec tsx scripts/live/t4-exit.ts --target=live --confirm --budget-usd 3 --amount-usd 1 --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

A paymaster-less, zero-fee operation `[USDC.e.approve(route, a), route.transferRemote(8453, owner, a)]`; the destination is the owner address only. You sign once; the relay submits once; the script watches the owner's Base balance for the arrival (about 30 seconds expected). Rejected means nothing moved. Accepted but not delivered after 10 minutes: no retry; the funds may stay stranded until XO's relayer processes the message, and the account is one-way. `$1` is enough to prove the exit.

### T3b First order

```sh
XO_LIVE_ACK=T3b pnpm exec tsx scripts/live/t3b-first-order.ts --target=live --confirm --budget-usd 0.55 --token-id <decimal token id> --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

A post-only GTD BUY of 100 shares at 0.005, living 300 seconds, far from the market so it does not fill. You sign the Kernel-wrapped order digest once; the relay submits it once with the wire prefix `0x01` (`0x00` only after an explicit signature rejection, with the same signature); the script finds it in the order list, cancels it by hash and confirms it is gone. Find a `--token-id` of an active, liquid market with the plugin's read tools (`xo_search`, `xo_get_market`).

`--probes` (budget `0.66`) adds the sub-floor probes of the table, each one more signature from you: 10 shares at 0.03 ($0.30), 1 share at 0.01, the $0.30 order living 60, 30 and 15 seconds, then the first accepted probe's bytes sent again on purpose (OR13). They are built, signed and sent by the kit straight to the gateway, **outside the relay's order records and daily ledger**, one at a time, each cancelled at once if taken, each at most $0.33 outlay. A rejection costs nothing and its text is the finding. The lifetime probes need a signature inside the probe's own lifetime: a 15 second order cannot be measured by a person approving in a window. When the signature arrives late the script says so and draws the OR17 finding from the time the order really had left, or draws none.

### T3c Fee reconciliation (optional)

```sh
XO_LIVE_ACK=T3c pnpm exec tsx scripts/live/t3c-fee-reconciliation.ts --target=live --confirm --budget-usd 1.10 --token-id <decimal token id> --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

A fill-or-kill taker BUY of about $1 priced at the best ask. It reconciles the **outflow** (amendment A11): the credited balance before minus after, against the principal at the limit price plus the fee from the `OrderFilled` log by order hash, against `effectiveFeeConfig` from the Data API, against the 800 bps on-chain bound. Stop rule: stop if the realised fee exceeds the bound, or the outflow exceeds the declared maximum; do not trade further until you have looked. A FOK that does not fill costs nothing and teaches nothing (inconclusive).

### T5 Redeem

```sh
XO_LIVE_ACK=T5 pnpm exec tsx scripts/live/t5-redeem.ts --target=live --confirm --budget-usd 0 --condition-id <32-byte hex> --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

One `redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2])` operation on a condition that has **resolved**. The relay refuses a condition it cannot prove resolved. A revert on zero holdings is informative, not a failure of the tool: it is reported as inconclusive and tells you how XO's token contract treats an empty redeem.

### T8 Capped allowance, kill switch

```sh
XO_LIVE_ACK=T8 pnpm exec tsx scripts/live/t8-capped-allowance.ts --target=live --confirm --budget-usd 1.43 --token-id <decimal token id> --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

Five signatures. The **on-chain revoke** (`revoke_trading`, paymaster-less) and the relay's **software kill switch** are two separately named things (A11); this test drills both: revoke, then Enable Trading with a capped allowance (`--allowance-usd`, default 1), a post-only order inside the cap (accepted), one beyond it (expected to be refused; if the gateway takes it the cap is not enforced when an order rests), a final revoke (trading must read off and an order must now be refused), and the kill switch (every write route must answer `kill_switch`). It ends with trading **off**; enable it again to trade.

### T6 Creation experiment

```sh
XO_LIVE_ACK=T6 RELAY_SELF_HOST=<the https folder that holds your metadata file> pnpm exec tsx scripts/live/t6-creation.ts --target=live --confirm --budget-usd 1 --metadata-file <your nine-key JSON> --metadata-uri <https URL where you host that file> --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

You write a clean nine-key metadata file for a sports market 1 to 7 days out (the family that passes first review 85% of the time) and host it at an https URL you control. The script validates it as `xo_validate_market_draft` does, checks that your URL serves exactly that content, asks the relay to prepare the create batch (`USDC.e.approve(manager, exactly the fee)` then `createConvictionMarket`), and follows the review for 30 minutes. **Approve**: hosting is accepted. **Update required**: answered only if the diff guard passes and the end date is unchanged (a second signature); otherwise left unanswered, which costs nothing. **Reject or no review**: hosting is not accepted; creation stays blocked and no substitute is built. Stop rule: creation is not retried; an ambiguous result is reconciled from `CLOBMarketCreated`. The $1 fee is not refundable, creation is not an everyday operation (open item O5), and market text is shown only in a fixed `[market title (untrusted): "..."]` slot.

### T6b Seed (after T6 is `active: true`)

```sh
XO_LIVE_ACK=T6b pnpm exec tsx scripts/live/t6b-seed.ts --target=live --confirm --budget-usd 10.8 --condition-id <the market T6 created> --owner <address> --data-dir "$XO_DATA_DIR" --credential-id <id>
```

A post-only GTD BUY of a $10.00 stake (7 to 30 days, never GTC; amendment A3), placed only if the market's own record says it is active, cancelled afterwards unless `--keep-seed`. A 422 "market is not active" means wait and run it again. It needs the funding cap raised first (O2).

### Plan B, if T1 is rejected

User-run, one time: sign in at the XO web app with the PayBox wallet as an external owner (the docs say "Owner wallet (external or embedded)"). Whether PayBox can connect to the app is unknown, and this is a human step, not plugin automation. If the app deploys the same Kernel at the same address (salt 0), T1 is not needed. If PayBox cannot connect, the write path stays closed until XO changes something.

## 5. Reading the capability facts

A capability fact is one row of the assumptions register (AD5, UO7, FU6, ...) or a test result (T1, T3a, ...), with a state (`yes`, `no` or `unknown`), where it came from (`probe` when the relay found out itself, `operator` when you recorded it), a time, a short note and, for facts that pick between alternatives, a value token. Unknown means "behave as if it were no". Facts are durable in the data directory.

```sh
pnpm exec tsx scripts/live/facts.ts list  --data-dir "$XO_DATA_DIR"     # every recorded fact
pnpm exec tsx scripts/live/facts.ts flags --data-dir "$XO_DATA_DIR"     # which write flags the facts unlock
pnpm exec tsx scripts/live/facts.ts record --data-dir "$XO_DATA_DIR" --id T4 --state yes --note "..."   # by hand; asks for RECORD T4=yes
```

Stop `pnpm relay` first: a data directory has one owner at a time.

| Fact | Means | Value token |
|---|---|---|
| T0 to T8, T6b | the test passed (`yes`) or failed (`no`) | none |
| PB1 | PayBox `raw` signs a digest | `rawSigningPayloadHex.<0x or bare>.<answer shape>`; shapes `sig65`, `object_signature`, `rs_recovery_id`, `rs_v` |
| PB2, PB3, PB4 | typed data on 3223; autonomous behaviour; what the window shows | `chain3223.kernel`; `pending_signature` or `pending_approval`; `digest`, `typed_fields`, `little` |
| UO2, UO1 | which digest form PayBox signed; which form validated on chain | `raw.<shape>.rec<byte>`; `raw` or `eip191` |
| UO8, FU9 | a paymaster-less zero-fee operation landed; the exit (H1) works | none |
| AU2, AU6, OR10 | derive returns the secret; the accepted L1 form; the accepted HMAC form | `kernel-on:sig-86:addr-yes`, `b64url-padded:path-only:addr-yes` and similar |
| OR3, OR4, OR11 | wire prefix; digest form; cancel body | `prefix_01`, `raw`, `hash` |
| OR6, OR17, OR13 | size floor; GTD lifetime floor; duplicate handling | `floor_in_0.01_to_0.30usd`, `gtd_min_le_60s`, `duplicate_accepted` |

**How a flag flips.** A write flag (`ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING`, `ENABLE_FUNDING`, `ENABLE_WITHDRAW`, `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA`) is effective only when its environment variable is on AND every fact it needs is recorded as `yes` (`facts.ts flags` prints exactly which), or the operator armed it for one run (what each script does for its own relay). Needs: `ENABLE_USEROP_SUBMIT` T1; `ENABLE_FUNDING` T1; `ENABLE_TRADING` T1, T2 and T3b; `ENABLE_WITHDRAW` T4; `XO_ENABLE_CREATE` and `ENABLE_SELF_HOSTED_METADATA` T6. `KILL` overrides everything. A `no` that you recorded cannot be overruled by a probe's `yes`.

## 6. How to roll back

Two different things, named separately (amendment A11), plus the money.

1. **Software kill switch.** Set `KILL=1` (or `XO_KILL_SWITCH=1`) in the environment of whatever runs the relay or a script, and restart it. Every write route and every script then refuses. This stops the plugin; it does not touch the chain, and it does not stop an agent that can call `request_wallet_sign` on its own.
2. **On-chain revoke of trading.** The plugin's `xo_revoke_trading` tool (or the relay's `revoke_trading` action) sends `approve(exchange, 0)` and `setApprovalForAll(exchange, false)` from the account, **without a paymaster**, so it works even when the sponsor is paused. You sign it once with PayBox. T1 `--prove-revoke` and T8 prove it before and after you rely on it. After it, the exchange can pull nothing from the account until you enable trading again.
3. **Stop depositing.** Do not run T3a again. Funding is capped at $10 in total until T4 has passed.
4. **Lock a flag by recording a `no`.** `facts.ts record --id T1 --state no` locks every flag that needs T1 (and an operator `no` is not overruled by a probe).
5. **Revoke the PayBox grant.** Remove the wallet grant on the dedicated credential, or set it to approval-gated. This is the only thing that stops an agent from signing directly.
6. **Get the money out.** `xo_withdraw` (flag `ENABLE_WITHDRAW`, which needs T4 passed) sends the balance back to the owner on Base. Until T4 has passed there is no verified exit.

## 7. What a mock rehearsal proves, and what it does not

It proves that the script, the transport and the relay behave as described: the call sequence, the refusals, the stop rules, the redaction, the single write. It proves contract-level validity against the real EntryPoint, factory, validator and Kernel bytecode on a local anvil. It does not prove XO's acceptance of anything (the four doors are XO's off-chain stack), and every write-surface fixture in the mock is a guess from documents (label M). PayBox is a stand-in that signs with a public test key.

## 8. Open items for the user (O1 to O5)

| ID | Open item | Default until answered |
|---|---|---|
| O1 | A dedicated PayBox credential for XO (A4) | Required for any funded use; every script prints it as a precondition and the build assumes it |
| O2 | Raise the $10 funding cap for T6 plus T6b (needs T4 to pass first) | No raise. T6b says so and the relay refuses |
| O3 | Creation seed cap $10.80 and GTD-only seeds (A3) | As written; creation stays off |
| O4 | Single tenant, localhost relay | As written; the kit's relay is in its own process on 127.0.0.1 |
| O5 | Accept XO's terms, badge-rule and jurisdiction exposure for creation, and where the relay's egress address sits | Not accepted; creation stays off by default. "The user accepted the exposure" in section 1 of the gap-closing document was an inference by that synthesis, not a recorded decision |

## 9. If something goes wrong

| You see | It means | Do |
|---|---|---|
| `REFUSED: --confirm was not given` | a dry run | add `--confirm` and `--budget-usd` |
| `REFUSED: the live target needs the acknowledgement XO_LIVE_ACK=Tn` | you did not say you mean it | set `XO_LIVE_ACK=Tn` for this test only |
| `REFUSED: the relay could not start` | another process owns the data directory, or the master key is missing | stop `pnpm relay`; set `RELAY_MASTER_KEY` |
| `UNAVAILABLE: ...` | the rehearsal needs `anvil`, or its own set-up could not stand in for earlier tests under those mock switches | install anvil; try the optimistic profile |
| `STOP RULE requires_key` | a host now asks for a key | nothing; the fact UO9 = no is proposed; the kit does not look for a key |
| `STOP RULE cloudflare` | a challenge page | nothing; it is not worked around |
| `BLOCKED before sending` | the transport refused a call the test did not list, or a repeat of a write | read the reason; this is the kit protecting you |
| `ambiguous` | a send's result is unknown | never resend; follow the hash the script printed |
| exit 3, `INTERNAL ERROR` | a bug in the kit | nothing was sent after it; report it with `LIVE_KIT_DEBUG=1` output (it holds no secret, and the repository and home directory paths in it are replaced; read it once before you paste it anyway) |

## 10. Known gaps (found when the pieces were put together, 2026-10-19)

These are open. None is hidden behind a green test; the matrix suites carry a `todo` test for most of them (`test/profile-matrix/core-findings.test.ts`, `create-findings.test.ts`), which starts passing when the gap is closed.

| Gap | What it means for you | Where |
|---|---|---|
| **No tripwire checkers.** Only the pure decision functions in `src/xo/chain/tripwires.ts` exist; nothing reads the paymaster, the exchange proxy, the manager implementation or the fee ceiling on a timer, so the relay runs with an empty checker list and a tripwire never trips by itself. | Do not fund an account with more than you can lose. Check the exchange and paymaster by hand before a live run. | `relay/wiring.ts` (`runUpkeep`), `relay/embedded.ts` |
| **The kill switch set by a signal is not durable.** `SIGUSR2` (the HTTP relay, and local mode in both stdio and `serve` mode; not available on Windows) latches in memory; a restart forgets it. The environment variable `XO_KILL_SWITCH=1` survives restarts. The Cockpit's kill button does the same one-way latch. | Use the environment variable and restart. | F4 |
| **`xo_prepare_order` does not check for stored XO credentials.** It reserves cap and hands out an intent; the refusal comes at submit. Same for `xo_place_seed` (G5). | Connect first (`xo_connect`). | F5, G5 |
| **A gateway that rejects the signature form can burn the day cap.** With `order.sig_forms=eip191-only` every order and seed is rejected and the relay says "prepare again"; each attempt keeps its reservation. | Stop after the first rejected order; do not loop. | F6, G4 |
| **A relay crash after XO minted a credential reports "Nothing was sent".** | After any `internal` refusal during `xo_connect`, check `xo_account` before retrying. | F3 |
| **`xo_fund_account` / `xo_withdraw` refusals when the node cannot be read carry no next step.** | Set `XO_BASE_RPC_URL` / `XO_RPC_URL`. | F1 |
| **An unsettled operation blocks the account** for 10 to 60 minutes (a creation attempt 24 hours) and the tool's hint blames a relay timeout. Revoke is not blocked. | Wait, or check `xo_userop_status`. | G2 |
| **An unreadable explorer is reported as `internal`**, not as an outage. | Retry later. | G1 |
| **The probe records T1 itself** after it sees a deployment land, which with `ENABLE_FUNDING` on unlocks funding before the on-chain revoke has been tested (`--prove-revoke` in T1). | Run T1 with `--prove-revoke` before turning funding on. | `relay/userops.ts` `probeFirstOperation` |
| The plugin and the relay read the Base node from two variables (`XO_BASE_RPC_URL`, `RELAY_BASE_RPC_URL`). | Set both to the same value. | `src/tools/fund.ts`, `relay/config.ts` |
| `docs/tool-contract.md` documents only the read tools and the draft tool; the write and creation tools are described in their tool descriptions (`src/tools/*.ts`). | Read `tools/list`. | docs |

What changed in this pass: `pnpm relay` (`createProductionRelay` in `relay/main.ts`) and local mode now share one wiring (`relay/wiring.ts`): the account directory, the XO request signer, the userop options, the creation watcher and the upkeep rounds, so the HTTP relay no longer answers `not_implemented` for account status and userop prepare, and releases the $1 held for an expired creation (the G7 finding).
