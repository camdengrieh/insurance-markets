# Phase 1 gap closing: XO Market plugin for PayBox

Synthesized 2026-10-19 on branch `build/xo-paybox-plugin` from `docs/phase0-gate-results.md`, research notes 19 to 23 (each read together with its appended Verification section, which overrides the researcher) and, where a claim needed its origin, notes 01, 04 to 07. Data in the notes was read on a machine clock of 2026-10-18 evening UTC (one day behind the harness date), so counts, percentages and "latest block" figures drift.

I made no network request. I ran offline checks of my own and one offline re-run of the researcher's UserOp golden test (Appendix A). Nothing was signed, sent, paid or posted. No PayBox tool was called. XO was not contacted in any way, and `submit_feedback` was not used.

## How to read this

Reference keys: `[19]` = `docs/research/19-smart-account-derivation.md`, `[20]` = `20-funding-route-verification.md`, `[21]` = `21-userop-templates.md`, `[22]` = `22-order-semantics-from-source.md`, `[23]` = `23-creation-and-metadata-onchain.md`, `[01]` to `[07]` as in Phase 0, `[P0]` = `docs/phase0-gate-results.md`. "V" after a key is that note's Verification section (for example `[21 V2]`). `§` is a section number, `A8` etc. are rows of the assumptions register in `[22 §14]` or in section 3 below.

Confidence tags:

- **H**: read in a primary source and reproduced by the researcher and an independent verifier (or by me).
- **H\***: H, and I also recomputed it offline in this synthesis (Appendix A).
- **M**: one pass, secondary source, or inference.
- **L**: weak, unresolved, or my own judgement without evidence.
- "NOT FOUND (searched: ...)" is a documented absence. "NOT ESTABLISHABLE WITHOUT XO" means no read-only means can settle it and the user has ruled out contacting XO.

### User decisions (binding, 2026-10-19)

1. Nobody contacts the XO team in any way. The unanswered XO questions in `[P0 §4.1]` are therefore settled only by tests the user may choose to run (section 6) or stay open and degrade safely (section 4).
2. PayBox's terms are no obstacle to an author-operated relay that holds the users' XO HMAC credentials.
3. The plugin is built and tested locally. There is no PayBox upload (so `[P0]` blocker B0 is parked, not solved).
4. No creation cadence cap. The $10 per order and $50 per day USD caps stay.
5. Approval-gated signing is acceptable "if it makes sense". Section 5.2 says it does, and that it is the only mode in which the caps bind.

> **Read section 9 (Amendments after the critic pass) together with sections 5 and 8.** Where section 9 contradicts an earlier section, section 9 wins. It corrects the PayBox `raw` intent shape, adds durability, upstream-client and credential-store specs, relabels gate 6, narrows the approval-gated claim to a cooperative agent, and resolves the seed-order contradiction.

---

## 0. Bottom line

1. **No gate is closed end to end, and none can be closed by reading.** Gates 1, 2, 3, 4, 5, 7 and 8 stay `partial`, although 2, 3 (on-chain half), 4, 5 (on-chain half) and the XO half of 8 are narrowed to a few named live-only questions. Gate 6 splits: the deposit leg is `answered-go` as a mechanism, the withdrawal leg stays `partial`. Gate 9 stays `answered-go`. On gate 4 I follow the verifier (`partial`), not the researcher's `answered-go` `[21 V5]`.
2. **The deterministic layer is finished.** Addresses, selectors, byte layouts, formulas, digests, policies and ABI fragments are cross-verified and can be compiled in (section 2.1, about 60 rows). I recomputed the headline ones offline: the ERC-1967 init-code hash `0x85d96aa1...03e6`, the counterfactual account of the public Anvil account 0 (`0xB3729F7e...d30d`), and all 21 selectors and 11 event topics that the notes state (Appendix A) match. I re-ran the researcher's UserOp golden test: 158 of 158 pass offline (their code, not independent; the verifier derived independently).
3. **Everything that remains open sits behind four doors in XO's off-chain stack**, none observable read-only: (a) the bundler admits a first UserOp from an account XO never provisioned, (b) the orderbook registers it (`smart_account` non-null), (c) the L1 ClobAuth check accepts it, (d) the orderbook credits USDC.e that was minted straight to it. Test T1 in section 6 ($0, one PayBox `raw` signature, sponsored deploy plus Enable Trading) opens door (a) and shows whether door (b) opens as a side effect. **Do not fund an account before T1 passes**: USDC.e minted to an undeployed account can only be moved by a UserOp, which needs door (a).
4. **There is no verified way out.** XO's own withdrawal goes through an unverified executor and the paymaster refuses `transferRemote`. I have one untested hypothesis, H1 (section 3, FU9): a paymaster-less, zero-fee UserOp `[USDC.e.approve(route, a), route.transferRemote(8453, owner, a)]`. Every component is individually verified; the whole is not. Until test T4 passes, cap funding at a test amount.
5. **Approval-gated PayBox signing makes sense and is the only configuration in which the caps bind** (section 5.2). With an `autonomous` grant an agent can sign a ClobAuth, mint its own XO credentials and bypass the relay entirely. The cost is one approval per order, which matches a $10 per order, $50 per day profile (at most a handful of orders per day).
6. **New in this synthesis (not in any note):**
   - Four more bad-checksum address strings in the notes (Mailbox, one validator and the Base Safe in note 20; the old paymaster owner in note 21), on top of the three the verifiers flagged (factory in note 19, route in notes 03 and 21, paymaster in the template builder). Ten fixture scripts copy the bad route string and the template builder carries the bad paymaster string. Code must use section 2.1 and must test every pinned address with a strict EIP-55 check (Appendix A).
   - `src/xo/signing/verify.ts` accepts only the raw-digest signature form; XO's own app signs EIP-191 and the chain accepts both `[19 §7.3]`. It must accept both.
   - Unlimited Enable Trading (XO's own flow, 268 of 268) exposes the whole balance to a future exchange upgrade; a capped allowance is inside the paymaster's policy but untested with the exchange (T8).
   - A resting $10.00 creation seed does not fit a $10 cap if the cap uses a 1.08 fee multiplier. Maker-only (post-only) orders need a different rule (decision D2, section 8).
   - The plugin has a 10 s budget per call `[06 §2]`; taker orders block for 500 ms to 3 s `[22 h.2]`. Order submission must be asynchronous with a status call.
   - The L1 timestamp window is about plus or minus 120 s `[01 (a)]`; an approval-gated ClobAuth must be signed within about 90 s of preparation.
   - Anvil, forge and cast are installed on this machine. A local anvil chain with chain id 3223 and the real EntryPoint, factory, validator and Kernel bytecode (captured once with `eth_getCode`) tests deployment, signing, nonce and `execute` against the real contracts, offline.
7. **Confidence snapshot (blunt):**

| Layer | Confidence | Basis |
|---|---|---|
| Account derivation and the deploying UserOp bytes | High | 2,627 of 2,627 re-derived `[19 §3.5, V1]`; Base factory `getAddress` 6 of 6; my offline recomputation matches |
| UserOp hash, signature form, nonce, gas, paymaster policy | High | 158 of 158 golden; on-chain `getUserOpHash` equals the local hash for 7 of 7 (researcher) and 3 of 3 (verifier); validator probes `[21 V1]`, `[19 §7.2]` |
| Order digest, signature, nonce rule, fee ceiling, rounding | High (contract level) | verified exchange source, 99 of 99 fresh orders recover the owner `[22 V6]` |
| Funding mechanism (Base to XO) | High as a mechanism, unproven live | source plus `eth_call` simulation on both chains plus 483 delivered messages; no third-party raw transfer has ever been observed `[20 V]` |
| XO's off-chain acceptance of a PayBox-owned account (four doors) | Unknown | NOT ESTABLISHABLE WITHOUT XO |
| Gateway semantics (HMAC target, derive, key cap, min size, GTD minimum, duplicate key) | Low | docs conflict; live-only `[22 §10]` |
| PayBox behaviour (raw output, typed data on 3223, autonomous grants, window rendering) | Unknown | untested; `[06]` |
| Creation hosting and upload | Unknown | 0 of 585 precedent for a non-XO URI `[23 §2]` |
| Stability of XO's mutable parameters | Low | paymaster owner handed over 5 times, UUPS manager and exchange, role wiring editable `[21 V2.2]`, `[23 V3.8]` |

---

## 1. The nine gates: before and after

Status vocabulary as in `[P0]`: `answered-go`, `partial`, `no-go`. "After" is the status after this phase and after the verifiers' corrections.

| Gate | Phase 0 | After Phase 1 | What moved | Evidence |
|---|---|---|---|---|
| 1 Auth and credentials | partial | **partial** (narrowed) | Wire shape, test vectors, relay design and a 6-request probe protocol are complete. Derive-returns-secret, key cap, DELETE level and HMAC target are live-only | `[22 §e,f,g,§14]`, `[01 §a,b,f]` |
| 2 Order flow | partial | **partial** (narrowed hard) | Nonce rule, signature construction, validity of both digest forms, rounding, fee ceiling, absence of on-chain cancel all settled. Gateway acceptance of a PayBox-owned account, minimum size, GTD minimum and L2-on-POST are live-only | `[22 §a-c,h,§9]`, `[19 §7]` |
| 3 Smart-wallet ownership | partial | **partial** (A answered, B not establishable) | A: any EOA owns a deterministic Kernel v3.1 account; derivation function, deploy op and on-chain validity proven. B: bundler, registry, L1 and deposit acceptance of a self-derived account are XO's | `[19 §0,§5,§10.4]` |
| 4 Chain 3223 support and gas | partial | **partial** (narrowed) | UserOp construction, hashing, signing, nonce, gas, keyless reads and the sponsorship policy are settled. Foreign-account bundler acceptance, PayBox `raw`, and policy stability are open. Researcher said answered-go; verifier corrected to partial | `[21 §0,§11,V5]` |
| 5 Market creation | partial | **partial** (narrowed) | Selector is open to any address today; fee, batch, review loop, oracle behaviour and costs are measured. Metadata hosting, non-XO upload and seed-on-PENDING are not establishable | `[23 §0,V1,§13]` |
| 6 Funding | partial (release-blocking) | **deposit leg: answered-go (mechanism); withdrawal leg: partial** | Base router identified and proven from both ends; zero fee, value 0, 483 deliveries under 30 s. No verified third-party withdrawal path | `[20 §0,§12,V]` |
| 7 Terms, bots, jurisdictions | partial | **partial** (unchanged) | Nothing new from XO. Creator limits are visibly unenforced (62% repeat-in-week) but invocable. User has accepted the exposure | `[23 §6,§11]`, `[P0 gate 7]` |
| 8 Sign-then-submit | partial | **partial** (XO half closed, PayBox half unchanged) | What digest to sign, in which forms, with which prefix, without any timestamp. PayBox: autonomous behaviour, window rendering, `raw` return shape, grant policy for chain 3223 untouched | `[21 §5,§8.3]`, `[22 b.3]`, `[06 §4,§6]` |
| 9 Read-side fallback | answered-go | **answered-go** (with additions) | Trading-enabled flag, deployment, nonce tripwire, fee-ceiling changes and resolution are readable keyless from explorer logs. Owner-to-account lookup is refuted | `[21 §6,V1.16]`, `[19 §6]`, `[22 V]` |

Tier verdicts after Phase 1:

- **v0.1 read: go** (built, unchanged).
- **v0.2 funding, trading, redeem: conditional-go, now fully specified and buildable and testable locally.** Release depends on the user running tests T0 to T4 (section 6). The blockers are no longer vague; each has a named test, a price and a safe default.
- **v0.3 creation: conditional-go, lowest confidence.** Adds T6 (does XO's oracle accept a self-hosted metadata URI?). If T6 fails, creation stays blocked; no substitute is built (Phase 0 decision "no draft plus link", unchanged).

### Gate 1. Auth and credentials: partial (narrowed)

Settled:

- L1 is a ClobAuth signed under the Kernel wrapper; L2 is HMAC-SHA256 over `timestamp + METHOD + path + body`; headers are `XO_API_KEY`, `XO_TIMESTAMP`, `XO_PASSPHRASE`, `XO_SIGNATURE` (`POLY_*` is rejected live) `[01 (a),(b)]`, `[22 e.1]`. Test vectors reproduce byte for byte `[22 V13]`.
- The HMAC target ambiguity (path only, or path with query) matters only for signed requests that carry a query string; with no query the two forms are identical `[22 e.1]` (H, `hmac_variants.py`). Design: send no query on signed requests (use `GET /orders` without parameters). A read-only probe protocol of at most 6 GETs settles key decoding, padding and target if ever needed `[22 e.3]`.
- Key lifecycle design: derive first, never create first; mint at most one key per account; persist the triplet (encrypted) before first use `[22 f.3]`.
- A stolen triplet cannot place orders (every order needs the owner's Kernel signature); it can read private order data and send cancels (M, reasoning) `[01 f]`.
- The relay (author-operated, per the user's decision) removes the sandbox's lack of per-user state `[06 §8]`.
- New: the L1 timestamp window is about plus or minus 120 s (accepted at -110 and +120, rejected at -125 and +150) `[01 (a)]`.

Live-only: does derive re-return the secret (docs contradict, M leaning yes); `MAX_KEYS_PER_USER` (NOT FOUND); is `DELETE /auth/api-key` L1 or L2 (L2 more likely); which HMAC target the server verifies (50/50, L); is `XO_ADDRESS` required or ignored on L2; is L2 required on `POST /order` (treat as yes) `[22 §10]`.

### Gate 2. Order flow: partial (narrowed hard)

Settled `[22]`:

- `order.nonce` must equal the exchange's `nonces[maker]`; only an admin-only `incrementNonceFor` writes it; zero `NonceIncremented` events since block 0; 600 of 600 sampled orders carry nonce 0 (H).
- No user-callable on-chain cancel exists (`cancelOrder` is commented out in the deployed source). A cancelled order's signature stays valid until expiry, fill, shortfall or admin bump. Settlement is operator-only (H).
- Signature type 3: `signer == maker`, `maker.code.length > 0`, plain ERC-1271 (Solady `isValidSignatureNow`), no ERC-6492 (H) `[19 §7.1]`.
- The Kernel-wrapped digest signature validates in both raw and EIP-191 form on the deployed validator, through a real deployed Kernel, with `v` of 27 or 28 only (H, key-free `eth_call` probes) `[19 §7.2]`. XO's own app uses EIP-191 (62 of 62 classifiable makers, 99 of 99 fresh orders `[22 V6]`); the docs' raw form is proven on chain for one root-mode account.
- The researcher's recomputation of order hash, Kernel wrap and recovery matched the registered owner for 9 of 9 real orders `[22 b.3]`; the verifier's own code did so for 99 of 99 fresh ones `[22 V6]`.
- XO's own UI rounds BUY collateral up and SELL down (580 of 580 inexact cases); choosing share sizes in multiples of 0.001 share makes the question disappear `[22 c.3,c.4]`.
- BUY legs pull principal plus fee; the on-chain per-leg fee bound is `maxFeeRateBps` = 800 (ceiling constant 1000) `[22 §9.2]`. On a SELL the signed `takerAmount` is a pre-fee floor; net proceeds can be 92% of it `[22 V M2]`.

Live-only: gateway acceptance of the whole flow for a PayBox-owned account; gateway minimum size and notional (live `min_order_size` is "0"; the smallest Kernel-account order seen is 1.001001 shares and $0.2576; the $0.064 and 5-share orders in the first sample belong to one non-Kernel account `[22 V C2]`); GTD minimum lifetime at the gateway; whether the duplicate key includes the signature; prefix `0x01` versus `0x00`.

### Gate 3. Smart-wallet ownership: partial (A answered, B not establishable)

Answered `[19]`:

- Every one of 34 decoded v3.1 deployments is `KernelFactory.createAccount(initData, 0)` with root validator `0x01 + ECDSA validator`, no hook, `validatorData` = the 20-byte owner, empty hook data and init config. 2,627 of 2,627 `OwnerRegistered` events re-derive offline across six windows (2025-10-28 to 2026-10-18); the live Base factory returns the real account for 6 of 6 owners; I recomputed the Anvil-0 counterfactual `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` from the pinned constants (H\*).
- Any non-zero 20-byte EOA is a valid owner; the owner cannot be changed in place (no `transferOwnership` in the deployed validator) and no sponsored owner-change selector exists `[19 §7.2, §8]`.
- Deployment is lazy: the account's first UserOp deploys it, signed by the owner, sponsored by the PolicyPaymaster (22 of 34 sampled were the Enable Trading batch) `[19 §8]`. The paymaster does not look at `initCode`, factory or sender `[19 §8, 21 §7]`.
- `GET /balance-allowance?address=<owner>` never returns the account (null for 18 of 18, then 19 of 19 owners). The field flags a registered account by its own address; it is not an owner lookup `[19 §6, V1]`. The Data API's `creator.walletPublicKey` is the account, not the owner.
- Corrected by the verifier: "deployed" cannot be tested with the explorer's `smart-contracts/<addr>` 404 or `is_contract` (10 of 12 deployed accounts returned 404; flags fill lazily). Use `AccountDeployed` (topic2 = sender) or `OwnerRegistered` (topic1 = account) logs `[19 V2.1]`, `[22 V M1]`.

NOT ESTABLISHABLE WITHOUT XO: doors (a) to (d) in section 0; how an account becomes registered (first-op class does not predict it `[19 V2.5]`); deposit-address provisioning for a foreign account.

### Gate 4. Chain 3223 support and gas: partial (narrowed)

Settled `[21]`:

- Orders need no chain transaction. On-chain actions are ERC-4337 v0.7 UserOps from the Kernel account; 22 real operations (Enable Trading with deployment, redeem, merge, split, create, plus two operator-account redeems) were decoded and rebuilt byte for byte (158 of 158 golden checks); the hash equals the `UserOperationEvent` hash and the on-chain `getUserOpHash`.
- PayBox needs no chain-3223 support to sign them: the owner signs a 32-byte digest with `raw`; the chain id is inside the digest `[21 §8.3]`. PayBox's own handling of a 3223 domain is still untested.
- Gas: `maxFeePerGas` = `maxPriorityFeePerGas` = 0 in 236 of 236 recent operations; sponsorship is optional (61 of 236 carry no paymaster and land) `[21 V1.12]`.
- The documented need for a private RPC `api_key` is not enforced today: `rpc-mainnet-2.xo.market` and `mainnet-bundler.xo.market` answered every read keyless. Reads also have explorer-log fallbacks. Stability is unknown (L) `[21 §6]`.
- Nonce lanes: key 0 in the main window, but a live non-zero key (0x0032) exists, so parallel lanes work `[21 V2.3]`. Paymaster limits vary (40,262 / 26,478 is the app default, 100,000 / 150,000 also lands) `[21 V2.5]`.

Open: foreign-account bundler acceptance (door a); keyless access staying open; paymaster policy stability (5 owner handovers, can pause or narrow at will); PayBox `raw` semantics.

### Gate 5. Market creation: partial (narrowed)

Settled `[23]`:

- `createConvictionMarket` (`0x7f54a7a2`) is callable by any address today: `AccessManager.canCall(0x...dEaD, manager, 0x7f54a7a2)` returned `(true, 0)` at block about 12.61M `[23 V1]` (H). Fee is 1,000,000 raw USDC.e in 585 of 585 events and is readable at call time from `CONFIG_MANAGER.collateralConfig(USDC.e)`. Every decoded creation is one sponsored batch `[approve(manager, unlimited), create]` (13 of 13).
- Review loop is fully observable: first review approve 49.1%, update-required 39.8%, reject 8.7%, owner-cancelled 2.4%; owners accepted 93.6% of updates; eventual activation 86.3% (90.1% since 2026-09-01); expected fee about $1.11 per live market.
- The oracle rewrites rules; in 2 of 38 sampled pairs it changed what the market means (3% to 5%). Accepting an update also changes the market end date in 22 of 233 cases, which is not visible in the JSON `[23 V2.3]`. XO rewrites metadata after activation for at least 10.3% of listed markets `[23 V2.1]`.
- Metadata is a nine-key JSON in one of two XO-named buckets (564 GCS, 21 S3, migrated 2026-10-13); no creator-hosted URI in 585 `[23 §2,§3.1]`.

NOT ESTABLISHABLE WITHOUT XO: whether the oracle or indexer accepts a self-hosted URI, any upload route, a third-party seed order on a PENDING market (docs: 422), where the badge and weekly rules are enforced, stability of the role wiring.

### Gate 6. Funding: deposit leg answered-go (mechanism), withdrawal partial

Settled `[20]`:

- Base router `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` (Hyperlane `HypERC20Collateral` 11.1.0, Sourcify exact match) is paired from both ends with XO route `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983`; both share one Mailbox and one 2-of-3 merkle-root ISM.
- Permissionless: no fee, no gas payment, no minimum or maximum in code. `msg.value` must be exactly 0 (simulated on both chains). Sequence: USDC `approve(router, amount)`, then `transferRemote(3223, bytes32(left-padded account), amount)`, two PayBox proposals with `value` "0".
- Delivery Base to XO: median 14 s, p90 24 s, max 27 s (n = 253); XO to Base: median 12 s, p90 14 s, max 18 s (n = 230); none unmatched. The "74 missing messages" anomaly was not reproduced `[20 V A]`.
- Bad recipients are unrecoverable: right-padded, zero, or blacklisted recipient strands the funds (XO-side `handle` reverts simulated, H) `[20 V C]`.
- Governance: one EOA owns both ProxyAdmins and blacklists USDC.e; validators 2 of 3; Circle can freeze escrow. Collateral supply is about $0.34M.
- Withdrawal: the XO app uses an unverified executor; `PolicyPaymaster.checkPolicy` refuses `transferRemote`; the XO-side `transferRemote` itself simulates successfully for a funded account `[20 V B]`. No verified third-party path.

Live-only: does the orderbook credit USDC.e minted straight to the account (T3a); the executor interface; whether H1 works (T4).

### Gate 7. Terms, bots, jurisdictions: partial (unchanged)

Phase 1 adds no XO statement. Evidence added: no ToS clause names bots, agents or programmatic creation; the weekly creator limit is not enforced in practice (364 of 585 creations were a creator's second or later that ISO week) but remains invocable, and XO may void markets, revoke creation, close the selector or terminate access `[23 §6,§11]`. The user has accepted the exposure and the no-contact condition. Self-trade prevention, the wash-trading and influence clauses, and the IP-based geo check are unchanged `[P0 gate 7]`.

### Gate 8. Sign-then-submit: partial (XO half closed)

Closed on the XO side `[21 §5, §8.3]`, `[22 b.3, h]`:

- UserOps: sign the 32-byte `userOpHash` itself; 65 bytes, `v` 27 or 28, low `s`; no typed data, no mode prefix.
- Orders and ClobAuth: sign the Kernel-wrapped digest (raw ECDSA over it equals a `typedData` signature of `Kernel(bytes32 hash)`); wire form `0x01 + validator + sig65` (86 bytes), with `0x00 + sig65` as a fallback that needs no new PayBox signature.
- No timestamp in any signature, so approval latency is harmless, but every signed order and UserOp is a long-lived bearer instrument. Short GTD for orders; submit UserOps immediately.
- One PayBox primitive suffices: `raw`. `typedData` for orders is an optional, possibly more readable alternative with the same result.

PayBox half unchanged: whether `raw` returns `{r, s, recovery_id}` (M) or a 65-byte signature; whether `typedData` with chainId 3223 and a foreign `verifyingContract` is allowed; how the signing window renders a digest; what an `autonomous` grant does for `request_wallet_sign` `[06 §4,§6]`.

### Gate 9. Read-side fallback: answered-go (with additions)

Keyless reads that now exist `[21 §6, V1.16]`, `[19 §3.5]`, `[22 (a), V4]`: trading-enabled (CTF `ApprovalForAll` and USDC.e `Approval` to the exchange, ranged `getLogs` with all `*_opr=and`); resolved (`ConditionResolution` logs, or `payoutDenominator` by `eth_call`); deployed (`AccountDeployed`, `OwnerRegistered`); nonce tripwire (`NonceIncremented` filtered by maker); exchange upgrade and fee-ceiling tripwires (`Upgraded`, `MaxFeeRateUpdated`); next nonce (`getNonce` or last `UserOperationEvent` nonce + 1). Cautions: explorer `getLogs` caps at 1,000 rows, so query by narrow topic and block range; the transaction feed contains pending rows with null `block_number`; address fields are filled lazily. Known gap 8 in `docs/tool-contract.md` (does an owner EOA resolve to its account on `/balance-allowance`?) is closed: it does not; derive locally and pass the account.

---

## 2. Constants

Every address below was checked with a strict EIP-55 test (Appendix A). **Do not copy an address from notes 03, 19, 20, 21 or from the fixture scripts; use this table** (section 2.3 lists the bad strings). Pin classes:

- **PIN**: compile in; never accept from the agent, market data or environment.
- **PIN+TRIPWIRE**: compile in, and check a mutable property at runtime; on a change the relay falls back to read-only and alerts.
- **READ**: the value is policy that XO can edit; read it at runtime.

### 2.1 Verified constants that code may pin

**A. Chains and signing domains**

| Name | Value | Chain | How verified | Conf | Pin |
|---|---|---|---|---|---|
| XO chain id | 3223 (0xc97) | XO | `eth_chainId` on RPC and bundler; cached chain id `0x0c97` in the Kernel implementation `[19 §5.2]`, `[21 §6]` | H | PIN |
| Base chain id; Hyperlane domains | 8453 (0x2105); Base 8453, XO 3223 | both | `localDomain()` on both routers and Mailboxes `[20 §2.2]` | H | PIN |
| Order EIP-712 domain | name "XO Market CLOB", version "1", chainId 3223, verifyingContract = exchange proxy | XO | verified exchange source; owner recovery for 9 + 99 orders `[22 b.3, V6]` | H | PIN (in code) |
| Kernel wrapper | struct `Kernel(bytes32 hash)`, typehash `0x1547321c374afde8a591d972a084b071c594c275e36724931ff96c25f2999c83`; domain name "Kernel", version "0.3.1", chainId 3223, verifyingContract = the account | XO | Kernel v3.1 `Constants.sol:60`, `Kernel.sol:153-156`; 3223 bytecode separator recomputed `[19 §5.2]`, `[22 V5]` | H | PIN (in code) |
| ClobAuth | domain "ClobAuthDomain", "1", chainId 3223, no verifyingContract; struct `ClobAuth(address address,string timestamp,uint256 nonce,string message)`; message "This message attests that I control the given wallet" | XO | docs plus independent vectors `[01 (a)]`, `docs/signing-vectors.md`. Gateway acceptance unproven | H (formula) | PIN (in code) |

**B. Account and UserOp stack (XO; factory, validator and EntryPoint bytecode are byte-identical on Base)**

| Name | Value | How verified | Conf | Pin |
|---|---|---|---|---|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (16,035 B) | `getUserOpHash` equals local hash for 7 + 3 ops `[21 V1.1, §2]` | H* | PIN |
| KernelFactory 0.3.1 | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` (989 B) | factory field of 2,626 of 2,628 `AccountDeployed` `[19 §0]` | H* | PIN |
| Kernel implementation 0.3.1 | `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` (22,784 B; differs from Base in 34 bytes) | pinned by CREATE2 for 2,627 of 2,627; `factory.implementation()` `[19 §5.2]` | H | PIN |
| ECDSA validator | `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` (1,819 B; no `transferOwnership`) | root validator in 34 of 34 deployments `[19 §3.2]` | H | PIN |
| ERC-1967 init-code hash for that implementation | `0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6` | `[19 §5.1]`; recomputed from the layout in Appendix A | H* | PIN |
| Factory call | `createAccount(bytes,bytes32)` = `0xea6d13ac`; data = `initialize(bytes21,address,bytes,bytes,bytes[])` = `0x3c3b752b` with root = `0x01` + validator, hook = `address(0)`, validatorData = owner (20 B), hookData = `0x`, initConfig = `[]` (292 B); salt = `bytes32(0)` | rebuilt byte-identical for 34 of 34 `[19 §5]` | H* | PIN |
| Account address | `CREATE2(factory, keccak256(initData ++ salt), initCodeHash)` | 2,627 of 2,627; Base factory `getAddress` 6 of 6 `[19 §3.5, V1]` | H* | PIN |
| Test vector (public Anvil account 0, address only) | owner `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` gives `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d`; undeployed on 3223, deployed on Base | `[19 §5.3]`; recomputed | H* | tests |
| Validator owner storage | `keccak256(abi.encode(kernel, 0))` holds the owner (mapping at slot 0) | state-override read-back on Base `[19 §7.2]` | H | tests |
| Event `OwnerRegistered(address indexed kernel, address indexed owner)` | topic0 `0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca` on the validator | `[19 §3.5]` | H* | PIN |
| Event `AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)` | topic0 `0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d` on the EntryPoint; topic2 = sender | notes quote prefix and suffix `[22 V15]`; full value computed | H* | PIN |
| Event `UserOperationEvent(...)` | topic0 `0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f` (standard v0.7 signature on a byte-identical EntryPoint) | computed; first live log should confirm | H* | PIN |
| Nonce layout | 32 bytes: mode `0x00`, type `0x00` (root), identifier = validator (20 B), key (2 B), sequence (8 B). First-op nonce `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000`. `EntryPoint.getNonce(address,uint192)` = `0x35567e1a`, key = nonce >> 64. Non-zero keys exist live (0x0032) | 236 of 236 decoded; `getNonce` equals log-derived next nonce `[21 §3, V1.8, V2.3]` | H* | PIN |
| `execute(bytes32,bytes)` | `0xe9ae5c53`. Mode: single `0x00` then zeros, batch `0x01` then zeros, execType `0x00` (revert). Single payload = target (20) + value (32) + data; batch = `abi.encode((address,uint256,bytes)[])` | 22 real ops decoded and re-encoded `[21 §3]` | H | PIN |
| `handleOps` | `0x765e827f` | `[21 V1.6]` | H* | PIN |
| userOpHash (v0.7) | `keccak(abi.encode(keccak(abi.encode(sender, nonce, keccak(initCode), keccak(callData), accountGasLimits, preVerificationGas, gasFees, keccak(paymasterAndData))), entryPoint, 3223))`; `accountGasLimits` = verificationGasLimit (high 16 B) + callGasLimit (low 16 B); `gasFees` = maxPriorityFeePerGas (high) + maxFeePerGas (low); `signature` not hashed | equals event hash and on-chain `getUserOpHash` `[21 §5]` | H | PIN |
| UserOp signature | 65 B (r, s, v), v in {27, 28}, low `s`, no prefix. Owner may sign the raw hash or its EIP-191 form; XO's app signs EIP-191 (14 of 14) | `[21 §5, V1.2-3]`, `[19 §7.2]` | H | PIN |
| `paymasterAndData` | paymaster (20) + paymasterVerificationGasLimit (16) + paymasterPostOpGasLimit (16), empty paymasterData (52 B). Optional: `0x` (no paymaster) | `[21 §3, §8.1]` | H | PIN |
| PolicyPaymaster | `0x2353B23D8F329fD3cEC0d21652F14208248A439d` (verified source). Views: `checkPolicy(address,address,bytes4)` `0xb591eaca`, `paused()` `0x5c975abb`, `dailyTxLimit()` `0xda023b31`, `getRemainingDailyTxs(address)` `0xad1e92ea`. Owner today `0x0498B2632c3D2bb24DaB53717f0e74DDEE46DE2f` (5 handovers) | source read; `paymasterAndData` in 175 of 236 ops `[21 §7, V1.10,V1.12]` | H* | PIN+TRIPWIRE |
| Paymaster policy on 2026-10-18 | allowed: global `approve`; USDC.e `transfer`; CTF `setApprovalForAll`, `redeemPositions`, `splitPosition`, `mergePositions`, `safeTransferFrom`; manager `createConvictionMarket`, `respondToUpdateRequest`, `cancelMarket`. Refused: `transferFrom`, `safeBatchTransferFrom`, `updateMetadata`, route `transferRemote`, exchange `incrementNonce`. `dailyTxLimit` 10,000 per sender per UTC day, `paused` false | `checkPolicy` for a never-seen address `[21 V1.10]` | H (dated) | READ |
| Fee fields | `maxFeePerGas` = `maxPriorityFeePerGas` = 0 | 236 of 236 `[21 V1.12]` | H | PIN (default) |
| Gas defaults (verification / call / preVerification; paymaster verification / postOp) | deploy + Enable Trading 297,342 / 74,916 / 56,214; 40,262 / 26,478. Redeem, one market 87,869 / 126,186 / 51,195 (call about 35k per extra redeem + 100k; preVerification +7.5 gas per extra calldata byte). Create market 105,442 / 1,100,000 / 55,814. Already-deployed Enable Trading: 87,869 / 74,916 / about 51,200 is M | real ops `[21 §8.1]`. These are defaults, not requirements: larger round limits (100,000 / 150,000) also land `[21 V2.5]`; prefer the bundler's estimate `[21 V4.1]` | H (M where marked) | PIN (defaults) |

**C. Exchange and orders**

| Name | Value | How verified | Conf | Pin |
|---|---|---|---|---|
| CTF Exchange proxy | `0x4bC5E872256D12E6017dfe466E04c867DC761B77` (order-domain verifyingContract) | `[22 §1]`; owner recovery on live orders | H | PIN+TRIPWIRE |
| Exchange implementation | `0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED` (solc 0.8.28, verified 2026-08-10); exactly one `Upgraded(address)` event ever (tx `0x834910095e4d91e5503f754b0f73d3cf5ec1393d14a334e1e9f9f7a8ceee37ad`); topic0 `0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b` | `getLogs` `[22 §1]`; topic recomputed | H* | tripwire: a second `Upgraded` log freezes trading |
| USDC.e | `0x80c12230ce677e6f304027a14780Edd2A829ab0c`, 6 decimals ("Bridged USDC (XO)") | `[20 §3.4]` | H | PIN |
| Conditional Tokens | `0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909` (source not verified on the explorer; standard Gnosis selectors match) | `[21 §2]` | H (address) | PIN |
| Order identity | `signatureType` 3; `signer == maker ==` the account; beneficiary, identifier, metadata zero | `Signatures.sol:123-130`; 600 of 600 `[22 b.1, A23]` | H | PIN |
| Order nonce | 0. Tripwire: `NonceIncremented(address indexed user, uint128, uint128, address indexed)` topic0 `0xc3ab8769b052bec3201cd16265d258ccc297277e8d91d562d5b5e399d5f8cca0`, topic1 = maker; any log means the counter moved. `nonces(address)` `0x7ecebe00`; `incrementNonceFor(address)` `0xbfb66376` is admin-only (never call) | `[22 (a)]`; topics recomputed | H* | PIN+TRIPWIRE |
| Wire signature | default `0x01` + validator + sig65 (86 B); fallback `0x00` + sig65 (66 B) only after an explicit signature rejection | 595 of 600 and 1 of 600 settled `[22 b.3]` | H | PIN |
| Fee bound | `maxFeeRateBps` = 800 (set 0 to 800 in tx `0xf3b293c6454ab0e5bf6ad633e2d186857117b93fbca6bc76cfcfb8d5edb4e6ae` on 2026-08-10); hard ceiling constant 1000. `MaxFeeRateUpdated(uint256,uint256)` topic0 `0x3b0628c08a7360081d719329ff580ace85680788ec349e5f2b95788e262fd61d` | `Fees.sol:26,62-67`; topic recomputed from the saved ABI | H* | PIN+TRIPWIRE |
| Price and size grid | tick 0.001, integer tick t in [1, 999]; BUY (makerAmount = S x t / 1000, takerAmount = S), SELL (makerAmount = S, takerAmount = S x t / 1000); S a multiple of 1,000 micro-shares; both amounts above zero (`takerAmount` 0 crosses everything) | `[22 c, §9.3]` | H | PIN |
| `validateOrder(order)` | `0x5451c7a4`, a public view (free pre-flight when an RPC is open) | saved ABI | H* | optional |

**D. Creation (v0.3)**

| Name | Value | How verified | Conf | Pin |
|---|---|---|---|---|
| XOClobMarketManager proxy | `0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307` (UUPS, upgraded once); implementation `0x60a10A0C0885628e413afFA4F62F3e942f11fcda` (verified) | emitter of 585 of 585 events `[23 §1, V0]` | H | PIN+TRIPWIRE (implementation slot) |
| AccessManager | `0x414Ea2dA101008Fc9d59Fb4EC43431910cB936f5` (`authority()` `0xbf7e214f`). `canCall(address,address,bytes4)` `0xb7009613` returned `(true, 0)` for `0x7f54a7a2` | `eth_call` at block about 12.61M `[23 V1]` | H | PIN address; READ result |
| CONFIG_MANAGER | `0x7bFf30281075Ee095A3bDf14a70a36dAed9075B1` (`CONFIG_MANAGER()` `0x6d64c83f`). `collateralConfig(address)` `0x0cc248ad` returned `(allowed 1, minInitialCollateralAmount 5000, minCreatorFeeBps 200, maxFeeCollateralAmount 5000, maxCreatorFeeBps 200, minTradeSizeInCollateral 100000, maxTradeSizeInCollateral 5000000000, marketCreationFee 1000000)` | `[23 V3.2]` | H | PIN address; READ fee |
| XO oracle; market NFT | oracle `0xdb3206Bde18aeBd1b84657B98B9E0f55e0f95648`; NFT proxy `0x83933Bf3af4Bd7F0ccA2e776ef9b55851C0eD098`, implementation `0xf214AA7f356065F97375c9f762F3c2388c92A319` (`_safeMint` to the creator) | `[23 V6, V3.3]` | H | info |
| Selectors | `createConvictionMarket(uint40,uint40,address,string)` `0x7f54a7a2`; `respondToUpdateRequest(bytes32,bool)` `0x1de5facd`; `cancelMarket(bytes32)` `0xbdb83289`. Never call: `reviewMarket` `0x4cbe35ee` (oracle), `createConvictionMarketFor` `0x507cedd3` (XO infrastructure), `updateMetadata` `0xa375765e` (oracle) | recomputed from the saved verified ABI | H* | PIN |
| Events (manager) | `CLOBMarketCreated` `0xfc777083d83af2d598c4ee0de93a86199dec7742d0001485cb6e25bc8c3b16c8` (topic1 conditionId, topic2 creator); `MarketReviewed` `0xab43af6d7c659e1ce1dfdc8a80d94af9f6b085793b380ddd2e8a0d1b6d3ba27f` (topic1 conditionId); `MarketCreationFeeCharged` `0xe9927345bdffcfbc768aecc0c516a76565447079fc0dab2b1e5f2c28e91dcf2e`; `UpdateRequestResponded` `0xd875fbcccd09683c3f5634238cfc5441c0c702ec33c6d705dd181524212ac74b`; `MarketCancelledByOwner` `0xa594ccd17afec32aa8a5584fd61eb38872adbb5948e5de67a3046bcc9236e2ea`; `MetadataUpdated` `0xe36c73fd13989812054eaa73a813bdd65752bda9044a9bdac079e4143c6ab7bd`. Data layouts in `[23 V3.5]` | recomputed from the saved ABI; 60 review logs cross-decoded with 0 mismatches `[23 §2]` | H* | PIN |
| Enums, fee, encodings | `ReviewDecision` {0 APPROVE, 1 REJECT, 2 UPDATE_REQUIRED}; `MarketStatus` {PENDING, CANCELLED, ACTIVE, PAUSED, RESOLVED, CLOSED, UPDATE_REQUIRED, VOIDED, VOIDED_CLOSED}; `MarketType` CLOB_CONVICTION = 4; creation fee 1,000,000 raw (non-refundable); create uses Kernel batch mode, respond and cancel use single mode | `[23 §1, §9, V3.4]` | H | PIN |

**E. Funding (Base to XO)**

| Name | Value | Chain | How verified | Conf | Pin |
|---|---|---|---|---|---|
| Base warp router (proxy) | `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F`; implementation `0x5b3F32417d651d47ebAEb079e8cf28B479b0926a` (HypERC20Collateral 11.1.0, Sourcify exact match) | Base | `token()`, `routers(3223)`, source `[20 §2-3]` | H | PIN+TRIPWIRE (EIP-1967 implementation slot equals the known one) |
| Circle USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals | Base | `decimals()`, router `token()`, Sourcify `[20 §3.4]` | H | PIN |
| XO route (proxy) | `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983`; implementation `0xdc4b86B0f3Abfc461a9A03a94B347D6F5DA8D052` (HypFiatToken 11.1.0) | XO | `routers(8453)`, explorer verification `[20 §2.2]` | H | PIN |
| Mailbox (both chains) | `0xfDd96df1b2D4354DbB1070815819DB47469Ca470` (note 20 prints it with a wrong checksum); `delivered(bytes32)` `0xe495f1d4`, `nonce()` | both | `mailbox()` on both routers `[20 §3.2]` | H* | PIN |
| Hook; ISM | hook `0xf9a84A5e63e7335D44E132775B1244462e08E449` (type 3, requires `msg.value == 0`); ISM `0xb429F39836eC9BD6b0fEDD999Bf49991592BB8Ff`, threshold 2 of 3, validators `0xafBd7650D0A47621e66dC005da466395CFc8B889`, `0x3D5dAEFB696DEd2e12847B5341Ea66eD77CaC7d4`, `0xA6c998F0DB2b56D7a63FAF30a9B677C8B9b6faab` | both | code decode `[20 §3.2, V3]` | H* | PIN (preflight equality) |
| Calls | `approve(address,uint256)` `0x095ea7b3` on Circle USDC, spender = router, amount = exact. `transferRemote(uint32,bytes32,uint256)` `0x81b4e8b4` on the router: (3223, account left-padded to 32 bytes, amount). PayBox proposals: kind `evm`, chain `eip155:8453`, `value` "0", calldata 68 B and 100 B | Base | `eth_call` simulation value 0 returns a message id, value 1 wei reverts; calldata byte-identical to `cast` `[20 §4, V B]` | H* | PIN |
| Quote and fees | `quoteTransferRemote(3223, recipient, amount)` = `[(0x0, 0), (USDC, amount), (USDC, 0)]`; `quoteGasPayment(3223)` 0; scale 1/1; `destinationGas` 68,000 | both | `[20 §3.1]`, `[20 V item 5]` | H | PIN (preflight) |
| Preflight views | `token()` `0xfc0c546a`, `routers(uint32)` `0x2ead72f6`, `allowance(address,address)` `0xdd62ed3e`, `balanceOf(address)` `0x70a08231`, `quoteTransferRemote` `0x8bd90b82` | Base | recomputed | H* | PIN |
| Delivery timing (polling only) | Base to XO median 14 s, p90 24 s, max 27 s (n = 253); XO to Base 12 / 14 / 18 s (n = 230); none unmatched. Poll for 10 minutes, then report pending, never resend | both | `[20 §6.2, V]`; extrapolation beyond the sampled days is M | H (samples) | PIN (timeouts) |
| Event topics | `DispatchId` `0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a`, `ProcessId` `0x1cae38cdd3d3919489272725a5ae62a4f48b2989b0dae843d3c279fee18073a9` (diagnostics only) | both | recomputed | H* | info |

**F. Operating limits and windows**

| Name | Value | How verified | Conf |
|---|---|---|---|
| L1 timestamp window | about plus or minus 120 s (accepted -110 and +120, rejected -125 and +150); design for 60 s | `[01 (a)]` live | H |
| L2 timestamp window | plus or minus 30 s; align with `GET /time` (bare integer seconds) | docs, `[01 (b)]`, `[22 V12]` | H |
| Taker delay; GTD sweeper | 500 ms (3 s live sports); expired GTD swept about 10 s after the deadline (the chain enforces expiry at `block.timestamp` anyway) | docs `[22 h.2-3]` | H (docs) |
| Rate limits | orderbook public REST 5 req/s documented (20 concurrent passed); Data API 100 per 10 s documented, header says 50; authenticated single 250 req/s, batch 25, cancel-all 5. Own throttle: 4 req/s per host | `[01 (g)]`, `[P0 §8 #16]` | H (docs) |
| PayBox plugin limits | 10 s per call, fresh sandbox, 16 hosts, 10 MiB bundle, no user identity, GET and POST only | `[06 §2]` | H |

### 2.2 Constants that must NOT be pinned yet

| Item | Why not | What the code does instead |
|---|---|---|
| `rpc-mainnet-2.xo.market` | Docs say a private `api_key` is required; it answered keylessly (hundreds of calls) `[21 §6]`. Stability unknown, L | `XO_RPC_URL` is configuration. On 401 or 403 mark "requires key" and stop; do not look for a key. Every read has an explorer-log fallback. Nothing but optional pre-flights depends on it |
| `mainnet-bundler.xo.market` | Documented host, answers reads; no write has ever been attempted for a foreign account | Configuration plus the `ENABLE_USEROP_SUBMIT` flag, off until T1 |
| EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | Advertised by the bundler only (M); never used by anything seen | Do not use |
| Paymaster gas limits as requirements; paymaster allowlist, limit, owner | App defaults only; owner-editable, 5 handovers | Use values at or above the defaults; `paused()` and `checkPolicy` before every sponsored op |
| Metadata bucket hosts (GCS `market-metadata-mainnet`, S3 `market-metadata-623756711122`) | Migrated 2026-10-13; acceptance of any other host unknown | Lint warns, never pins; T6 decides |
| Metadata schema (nine keys) | Observed uniform in 138 of 138; omissions untested | Lint rules (BLOCK/WARN per `[23 §8]`), not a protocol |
| Gateway minimum size and notional, share step finer than 0.001, GTD minimum lifetime, duplicate-detection key, tick tolerance | NOT ESTABLISHABLE WITHOUT A LIVE ORDER `[22 §10]` | Conservative client floors (at least 1 share and $0.30; 300 s GTD), configurable, tightened from the 4xx text |
| HMAC decoding, padding and target; `XO_ADDRESS` on L2; derive-returns-secret; `MAX_KEYS_PER_USER`; DELETE level; L2-on-POST | Docs conflict; live-only | Stored as capability facts with state `unknown`; pessimistic behaviour until a probe records the answer |
| Cancel body key and id form; batch/all HMAC-only; `CancelOrder` typed data | Undocumented `[22 d]` | Single `DELETE /order` loop; do not implement the typed-data forms |
| Executor `0x5D1d6FA733bfba0EC7B143de0d7E8a4afa9F9Ba9` and selector `0x3a022aa7`; deposit account D derivation | Unverified contract; interface unknown `[20 §7-8]` | Never call, never derive |
| The 33 unidentified paymaster global selectors (for example `0x0a1c55e6`, `0xbe040fb0`, `0xdffdd5d3`) | Unknown XO products `[21 §7]` | Never call |
| Fee schedule | `/fee-rate` is 0 for everything; `effectiveFeeConfig` shows 400 and 800 bps `[P0 §1.3 #9]`. Only the on-chain ceiling (800) is a bound | Read `effectiveFeeConfig` per market; fail closed to 800 when unknown |
| Operator and role-gated selectors (`createConvictionMarketFor`, `reviewMarket`, `updateMetadata`, `incrementNonceFor`) | XO infrastructure only | Constants for decoding only; absent from every allowlist |
| Governance addresses (upgrade EOA `0xC0c87622761d6c606851662708E7C7547B4bca06`, XO Safe `0xf08239F9575B30133Ee79a12df5b22238b554697`, Base Safe `0x9dC83f5947E5F86d9726D6484195F9DC4FdfC5D6`, ProxyAdmins) | Owners change; informational | Monitoring only |
| Rates and shares (approve rate 49.1%, activation 86.3%, delivery latencies, sizes) | Drift | Documentation only |
| Capped Enable Trading allowance | Untested with the exchange | Default is XO's own shape; capped variant behind T8 |
| Any withdrawal construction (H1) | Untested | `ENABLE_WITHDRAW` off |

### 2.3 Bad-checksum strings (do not copy)

Found by a strict EIP-55 scan of the notes, code and fixtures (Appendix A). The first three were flagged by verifiers; the last four are new.

| Bad string | Where it appears | Correct form |
|---|---|---|
| `0xaac5D4240AF87249B3f71bC8E4A2cae074A3E419` | `[19 §0 item 1]` | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` |
| `0x9090463546d725F6eCE5D1A4B27beB929D5D1983` (XO route) | `[03]`, `[21 §4.4]`, ten fixture scripts (`kernel.mjs`, `rpc_reads2.mjs`, `collect_candidates.py`, `sanitize.py`, `s20`, `p6`, `p8`, `p9`, `p10`, `p20`) | `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983` |
| `0x2353b23d8F329fD3cec0D21652f14208248A439D` (paymaster) | `userop_templates.mjs` `ADDR.paymaster` | `0x2353B23D8F329fD3cEC0d21652F14208248A439d` |
| `0xfDd96df1b2D4354dbB1070815819DB47469Ca470` (Mailbox) | `[20 §3.2, §10]` | `0xfDd96df1b2D4354DbB1070815819DB47469Ca470` |
| `0xA6c998F0DB2b56d7a63FAF30a9B677C8B9b6faab` (validator 3) | `[20 §3.2]` | `0xA6c998F0DB2b56D7a63FAF30a9B677C8B9b6faab` |
| `0x9dC83f5947E5F86D9726D6484195F9DC4FdfC5D6` (Base Safe) | `[20 §3.3, §10]` | `0x9dC83f5947E5F86d9726D6484195F9DC4FdfC5D6` |
| `0x30e817b9703c77A3baF82a4d8B3D231F3Ed8Cf93` (old paymaster owner) | `[21 §4.3]`, `sanitize.py` | `0x30e817b9703c77A3bAF82a4d8B3D231F3Ed8Cf93` |

---

## 3. Assumptions register

Each row is a behaviour the relay or plugin will assume. "Safe default" is what the code does when the assumption is unproven or false. "Cheapest test" refers to the live tests in section 6 (T0 to T8). IDs are stable; the order-semantics rows keep the `A` numbers of `[22 §14]` in brackets.

### 3.1 Accounts and deployment

| ID | Assumption | Evidence | Safe default | Cheapest test |
|---|---|---|---|---|
| AD1 | The account is a pure function of the owner: CREATE2 with the pinned constants, index 0 | `[19 §5]` 2,627 of 2,627, Base factory 6 of 6; H* | Derive locally; compare any supplied account; refuse on mismatch; never accept a maker from the model | Free: unit test; optional `getAddress` on the Base factory |
| AD2 | Deployed means an `AccountDeployed` (topic2 = sender) or `OwnerRegistered` (topic1 = account) log exists. Explorer 404 and `is_contract` prove nothing | `[19 V2.1]` (10 of 12 false 404), `[22 V M1]` (5 of 25 transient false) | Log test; absent means undeployed; with an open RPC also `eth_getCode`; two consecutive negatives before blocking a signature | Free |
| AD3 | No API maps an owner to its account; `/balance-allowance?address=<owner>` is always null | `[19 §6, V1]` 19 of 19 | Never query with the owner; use `/balance-allowance` only on the derived account as the registry check | Free |
| AD4 | `smart_account` non-null means the orderbook knows the account; the trigger is unknown and first-op class does not predict it | `[19 §6, V2.5]` M, L | States: undeployed, deployed_unregistered, registered. Trading blocked while unregistered; re-check once after deploy and once after credentials | T1, T2 (free re-reads) |
| AD5 | The XO bundler accepts a first UserOp with `initCode` from an account XO never provisioned, sponsored by the paymaster | Paymaster code is sender-agnostic `[21 §7]`; 52 of 52 recent deployments sponsored (all app-created); NOT tested | `ENABLE_USEROP_SUBMIT` off; dry run returns the packed op, hash and digest; fail closed on any rejection; no self-bundling (outsiders hold no native XO `[21 §6]`) | T1 ($0) |
| AD6 | An undeployed account cannot trade: the exchange needs code, the L1 check probably fails, there is no ERC-6492 | `[19 §7.1, §7.4]`, `[22 b.1]` | Refuse orders and L1 until deployed | None needed |
| AD7 | USDC.e minted to an undeployed account is stuck until a UserOp deploys it (door a) | `[19 §8]`, `[21 §6]` | Funding refused until deployed | None (rule) |
| AD8 | No owner rotation: no `transferOwnership`, no sponsored `installModule` or `changeRootValidator` | `[19 §7.2, §8]` (33 selectors unidentified, so "none sponsored" is M) | No rotation tool; a new owner is a new account | None |
| AD9 | One account per owner at index 0 | `[19 §3.5]`; ToS "one account per user" is unenforced as far as seen | Single account; no other index | None |
| AD10 | A Kernel account can hold a market NFT (`_safeMint`) | XO's creators are Kernel accounts `[23 V3.3]` | None | T6 |

### 3.2 UserOps

| ID | Assumption | Evidence | Safe default | Cheapest test |
|---|---|---|---|---|
| UO1 | The owner signs the 32-byte `userOpHash`; raw and EIP-191 digests both validate; `v` 27 or 28; XO's app uses EIP-191 | `[21 §5, V1.3]`, `[19 §7.2]`; H | The relay recomputes the hash from stored packed fields, recovers under both digests, requires the owner, normalises `v` and low `s`, refuses otherwise | T0, T1 |
| UO2 | PayBox `raw` signs a digest as-is and returns `{r, s, recovery_id}` or 65 bytes | `[06 §4]` M | Accept both; `v = 27 + recovery_id`; always verify by recovery | T0 ($0) |
| UO3 | Next nonce = `EntryPoint.getNonce(sender, nonce >> 64)`, else last `UserOperationEvent` nonce + 1 (explorer); fresh sender sequence 0; one op in flight per account; `initCode` only while the account is undeployed, and only after the derived sender equals the intended account | `[21 §6, §8.1, V1.8]` (2 of 2 equal) | Per-account lock; re-read the nonce at submit; reject if stale; refuse a first op whose sender differs from `deriveAccount(owner)` | T1 |
| UO4 | Zero fees are accepted | 236 of 236 `[21 V1.12]`; docs "The XO bundler accepts zero EIP-1559 fees" | Zero | T1 |
| UO5 | Gas: call `eth_estimateUserOperationGas` first (the docs sample does), else observed defaults with +30% on `callGasLimit`; paymaster limits at least 40,262 / 26,478 | `[21 §8.1, V4.1]` M | Defaults; record the bundler's rejection text | T1 |
| UO6 | `eth_sendUserOperation` takes the ERC-4337 v0.7 unpacked JSON | The docs sample uses viem's bundler client `[21 V4.1]`; untested | Contract test against the mock; flag | T1 |
| UO7 | The paymaster sponsors a never-seen sender for allowlisted calls | `[21 §7]` H (dated), mutable | Runtime `paused()` and `checkPolicy`. If refused: existing account, retry once without a paymaster; deployment, stop | T1 |
| UO8 | A UserOp with no paymaster and zero fee lands for existing accounts | 3 large redeem batches and 61 of 236 `[21 §4.2, V1.12]`; deployment case untested | Only the UO7 fallback | T4, T5 |
| UO9 | Keyless RPC and bundler reads stay open | `[21 §6]` H today; docs say a key is required, so stability is L | On 401 or 403 record "requires key" and stop. Explorer-log fallbacks for nonce, deployment, trading-enabled. Never look for a key | None |
| UO10 | A signed UserOp has no expiry | `[21 §8.3]` M | Submit immediately; drop unsent signed ops after 10 minutes; bearer instrument | None |
| UO11 | Redeem is `redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2])` once `payoutDenominator > 0`; 62 to 73 redeems per op have landed | `[21 §4.2, §8.2, V4.1]` | Gate on a `ConditionResolution` log or `payoutDenominator`; de-dupe; at most 50 per op | T5 |
| UO12 | XO's withdrawal is not a UserOp (11 of 11, 8 of 8) | `[21 §4.4, V1.14]` | See FU9 | T4 |
| UO13 | Split and merge need `approve(ConditionalTokens)` and were seen only from an operator account | `[21 §4.3]` M | Out of scope for v0.2 | None |

### 3.3 Orders, cancel and auth

| ID | Assumption | Evidence | Safe default | Cheapest test |
|---|---|---|---|---|
| OR1 [A1] | `nonce = 0` is valid forever until an admin bump | `[22 (a)]` H; 600 of 600 | Sign 0. Before a signing session read `NonceIncremented` by maker; refuse and alert on any log | Free |
| OR2 [A2] | No on-chain cancel; a cancelled signature stays valid until expiry, fill or shortfall | `[22 (a), §9.1]` H | Every order GTD, default 300 s, never 0, at least 90 s remaining at submit; cancel is best effort; kill switch is a sponsored `approve(exchange, 0)` plus `setApprovalForAll(exchange, false)` | T3b |
| OR3 [A3,A4] | `0x01` + validator + sig65 is accepted; `0x00` + sig65 is valid on chain | `[22 b.3]` 595 of 600 and 1 of 600 | Default `0x01`; swap prefix only after an explicit signature-invalid 4xx, same sig65, never after a timeout | T3b |
| OR4 [A5] | Raw or EIP-191 digest signature both pass the gateway | Chain: both, H. Gateway preference unknown | Accept what PayBox returns; verifier accepts both | T3b |
| OR5 [A7,A22] | Integer grid: tick in [1, 999], S a multiple of 1,000 micro-shares and at least 1,000,000, both amounts above zero | `[22 c, §9.3]` | Reject everything else | Unit test |
| OR6 [A15] | The gateway minimum is unknown; smallest Kernel-account order seen is 1.001001 shares and $0.2576 | `[22 V C2]` | Floor: at least 1 share and $0.30; show `/book` `min_order_size` when non-zero | T3b |
| OR7 [A16] | BUY outflow is at most makerAmount x (1 + fee bound); SELL net proceeds are at least 92% of `takerAmount` at bound 800 | `Fees.sol:62-67`, `Trading.sol:179,199-203,305` `[22 §9.2, V M2]` | Bound = `effectiveFeeConfig` taker bps, 800 when unknown or disagreeing; cap check on the integer amounts including the bound | T3c |
| OR8 | Makers pay no fee (docs; 0 of 300 sampled maker legs) although the contract allows the same bound | `[22 §9.2]`, `[03]` | Post-only GTC is exempt from the multiplier (decision D2); re-check on every fill | T3c |
| OR9 [A8] | L2 HMAC is required on `POST /order` and the DELETE routes | `[22 (g)]` M-H | Always send L2; treat a leaked signed order as a bearer order regardless | Invalid-signature POST with no L2 headers (user's call) |
| OR10 [A9,A10] | HMAC key is the base64url-decoded secret; output is base64url with padding; no query on signed requests | Five clients agree; docs silent `[22 e]` M, target L | Probe A (at most 4 GETs), probe B (at most 2); cache globally; stop after 6 failures per credential | T2 |
| OR11 [A13,A14] | Cancel is `DELETE /order {"orderID": <0x hash>}` with L2; fallbacks numeric `id`, key `orderId`; batch and all unverified | `[22 d.3]` M | Loop of single cancels; `DELETE /cancel-all` HMAC-only only as an emergency with loop fallback | T3b |
| OR12 [A18] | `POST` blocks for the taker delay (500 ms, 3 s live sports) | `[22 h.2]` docs | Relay timeout 5 s (10 s sports); return `pending` to the plugin after at most 6 s; status by order hash; no auto retry | T3b |
| OR13 [A21,A4] | A 400 "duplicate order" proves the first submit rests; whether the key includes the signature is unknown | OpenAPI `[22]` | No blind resubmit; reconcile by order hash through `GET /orders` | T3b |
| OR14 [A19] | Balance drops cancel the newest resting orders first | docs `[22 h.1]` | Re-list orders after any funding, withdrawal or transfer | T3b |
| OR15 | Settlement is operator-only; a leaked signature cannot be settled by third parties | `CTFExchange.sol:103,111,127` `[22 d.1]` | Still short GTD | None |
| OR16 [A20] | Never call heartbeats | `[22 A20]` | n/a | None |
| OR17 [A17] | The gateway's minimum GTD lifetime is unknown (Polymarket requires 3 minutes; an XO taker order with about 16 s left was filled, one order, M) | `[22 h.3, V C1]` | Default 300 s from `GET /time`; never 0; lower only after T3b | T3b (60, 30, 15 s; rejections cost nothing) |
| OR18 [A23] | The exchange accepts an order only with `signer == maker ==` the account, `signatureType` 3, zero beneficiary, identifier and metadata, chainId 3223 and the pinned exchange | `Signatures.sol:128`; 600 of 600 `[22 A23]` | Pin these; reject any other value from the agent | Unit test |
| AU1 | L1 must be signed within about 60 s of preparation | `[01 (a)]` window about 120 s | Timestamp from `GET /time` at prepare; refuse submit after 90 s; re-prepare | T2 |
| AU2 [A11] | Derive returns the oldest key; it may not re-return the secret | `[22 f]` L | Derive first; on 404 create once; persist before use; validate with probe A | T2 |
| AU3 [A12] | A lost triplet is unrecoverable by us | `[22 f.3]`, `[01 V2]` | Encrypted store, backup before first use, never delete keys | None |
| AU4 | `MAX_KEYS_PER_USER` unknown | NOT FOUND | At most one create per account, ever | None |
| AU5 | A stolen triplet cannot place orders | `[01 f]` M | Still encrypted; never in logs or output | None |
| AU6 | L1 needs a deployed account (ERC-1271 on `XO_ADDRESS`); ERC-6492 unknown | `[01 (a)]`, `[19 §7.4]` | L1 only after deployment | None |

### 3.4 Funding and withdrawal

| ID | Assumption | Evidence | Safe default | Cheapest test |
|---|---|---|---|---|
| FU1 | The route is as pinned: `token()`, `routers(3223)`, `quoteTransferRemote` = `[0, amount, 0]`, Mailbox, hook and ISM equal, router implementation slot equals the known one | `[20 §2-3]` H; one EOA can upgrade `[20 §3.3]` | Preflight on every funding call (Base `eth_call`); refuse on any difference | Free |
| FU2 | `value` must be "0" | Simulated on both chains `[20 V B]` | Reject any other value in code | None |
| FU3 | The recipient is the derived account, left-padded, non-zero, not the owner EOA, deployed (AD2) | `[20 §4.1, V C]` | Pad helper, re-decode calldata, refuse otherwise | T3a |
| FU4 | Exact allowance equals the amount | `[20 §4]` | `approve(router, amount)`; a next-missing-step tool reads allowance and balance each call | T3a |
| FU5 | Delivery is under 30 s typically (483 samples); the explorer index is complete as of 2026-10-18 | `[20 §6, V A]` | Poll the account's USDC.e balance or `Mailbox.delivered(messageId)` for up to 10 minutes, then report pending; never resend | T3a |
| FU6 | The orderbook credits USDC.e minted straight to the account (XO's app mints to a deposit account D and sweeps) | `[20 §8.1]` M; untested | Fund test amounts only until T3a | T3a |
| FU7 | Third-party use of the raw route works | Source plus simulation on both chains; 0 of 34 sampled transactions used it `[20 V]` | Same as FU6 | T3a |
| FU8 | Governance risk is acceptable: one EOA upgrades both routers and blacklists USDC.e; 2-of-3 validators; Circle can freeze escrow | `[20 §3.3]` | Warn, cap, monitor the implementation slot | None |
| FU9 | **H1 (hypothesis, L to M):** a paymaster-less, zero-fee UserOp `[approve(route, a), transferRemote(8453, owner, a)]` exits funds. Verified parts: XO-side `transferRemote` simulates for a funded account with value 0 `[20 V B]`; the paymaster refuses it `[20 §7]`; paymaster-less zero-fee ops land for existing accounts `[21 §4.2]`. Unverified: bundler admission for this sender, delivery of a third-party message by XO's relayer, Circle blacklist | as stated | `xo_withdraw` behind `ENABLE_WITHDRAW`, off. Funding total capped at a test amount (decision D3) until T4 passes | T4 |

### 3.5 Creation

| ID | Assumption | Evidence | Safe default | Cheapest test |
|---|---|---|---|---|
| CR1 | The creation selector is open: `canCall(account, manager, 0x7f54a7a2)` is true | `[23 V1]` H today | Pre-flight `canCall` when an RPC is open; on `AccessManagedUnauthorized` or a pause revert stop for the session | Free |
| CR2 | Fee is 1,000,000 raw, read from `CONFIG_MANAGER.collateralConfig(USDC.e)` | `[23 V3.2]` | Abort and ask if not 1,000,000; fallback: last `MarketCreationFeeCharged` | Free |
| CR3 | Batch `[USDC.e.approve(manager, at least fee), createConvictionMarket(startsAt = now, expiresAt, USDC.e, uri)]`, sponsored; an approve of exactly the fee is within policy but unobserved | 13 of 13 `[23 §9]` | Approve exactly the fee; `startsAt` within 60 s of chain time | T6 |
| CR4 | A self-hosted metadata URI is reviewed and indexed like XO's | 0 of 585 precedent `[23 §2]`; NOT ESTABLISHABLE | Lint and dry run only; `ENABLE_SELF_HOSTED_METADATA` off | T6 ($1) |
| CR5 | Review loop: after inclusion read `CLOBMarketCreated` from the receipt, poll `MarketReviewed` every 60 s for 30 minutes then every 5 minutes for 12 hours; on UPDATE_REQUIRED diff the suggested JSON (numbers, dates, entities, outcome meaning) and compare `suggestedExpiresAt` with the current expiry (differs in 22 of 233) | `[23 §4, V2.3, §8 O07]` | Never auto-accept (a signature is needed anyway); notify and wait; an unanswered update stays UPDATE_REQUIRED at no further cost; windows can be 20 minutes | T6 |
| CR6 | XO rewrites metadata after activation (at least 10.3% of markets); the Data API follows the latest `MetadataUpdated` | `[23 V2.1]` | Watch `MetadataUpdated` by conditionId and re-run the diff guard | None |
| CR7 | Seed only after orderbook `active: true`; resting GTC buy, stake at least $10 | `[23 §5]`; 0 of 33 early fills | Wait; retry 422 "market is not active" with backoff | T6b |
| CR8 | Creation is non-idempotent; reconcile from `CLOBMarketCreated` (topic2 = creator), not from fee events | `[23 V3.1]` | Intent hash plus log scan before any retry; never auto-retry | None |
| CR9 | No cadence cap (user decision); limits are the $50 per day cap (fee counts), per-attempt approval and the off-by-default flag `XO_ENABLE_CREATE` | user; `[P0 §9 row 10]` | Remove `maxCreatesPerDay` enforcement | None |
| CR10 | Void settlement is 50/50 (ToS) or pro-rata refund (lifecycle guide); the seed loss is bounded by the seed | `[23 V3.6]` | Cite both in the warning | None |

### 3.6 PayBox and cross-cutting

| ID | Assumption | Evidence | Safe default | Cheapest test |
|---|---|---|---|---|
| PB1 | `request_wallet_sign` `raw` accepts any 32-byte digest and returns a signature; no chain policy applies | `[06 §4]` M | The plugin returns the exact `intent` JSON; the relay verifies | T0 |
| PB2 | `typedData` with chainId 3223 and a foreign verifyingContract is signable | `[06 §4]` unknown | Offer `raw` first, typed data as an alternative | T0 |
| PB3 | Under `autonomous`, `request_wallet_sign` returns `pending_signature` (no human); contradicted by `concepts/model` | `[06 §6]` unresolved | Recommend approval-gated; design for both | T0 |
| PB4 | The signing window shows little for a digest | `[06 §4, §11]` | `prepare` returns a decoded summary and a `digest_tag` (first 8 hex digits) to compare | T0 |
| PB5 | Plugin budget: 10 s, fresh sandbox, no user identity, 16 hosts | `[06 §2]` H | Thin tools; state in the relay | Local conformance |
| PB6 | Proposals carry one call, `value` decimal wei, expiry at most 5 minutes; approvers see raw calldata | `[06 §3]`, `[20 §9]` | Next-missing-step funding tool | Portal validation (deferred) |
| XS1 | XO can change anything: paymaster policy, role wiring, exchange and manager (UUPS), fee ceiling, oracle | `[21 V2.2]`, `[23 V3.8]` | Tripwires (section 2.1); on a change go read-only and alert | None |
| XS2 | Explorer `getLogs` caps at 1,000 rows and times out on unbounded ranges; pending rows have null `block_number`; address fields fill lazily | `[20 §1]`, `[21 V4.3-4]`, `[19 V2.7]` | Narrow topic filters plus block ranges; split on the cap; filter pending | None |
| XS3 | Caps bind only with approval-gated signing | `[06 §10]`, `[P0 §5.1]` | State it in every approval summary | None |
| XS4 | Automated access must "not overwhelm or misuse the system" | ToS `[19 §1]` | 4 req/s per host; own User-Agent `xo-paybox-plugin/0.1`; no personal identifier in any header | None |
| XS5 | Secrets never reach logs or tool output | hygiene | Log scanner test; audit log holds tags, not signatures | None |
| XS6 | Test vectors and docs use only public chain data (owner and account pairs), with third-party addresses truncated | `[19 §1]` | Fixtures sanitized; no personal identifier in any fixture, header or log | None |

---

## 4. NOT ESTABLISHABLE WITHOUT XO, and how each degrades safely

Degrade kinds: **F** = fail closed (refuse, say why), **FF** = feature flag, default off, flipped only by a recorded test result, **M** = mock-only (the code is built and tested against the mock; behaviour on the real service is unknown).

| # | Open item | Why it cannot be settled read-only | Degrade design | Settled by |
|---|---|---|---|---|
| N1 | Door (a): the bundler admits a first UserOp with `initCode` from a self-derived account; its admission rules, rate limits, any key or allowlist | It is a write | FF `ENABLE_USEROP_SUBMIT` (off) plus F. Without it `prepare` still works as a dry run that returns the packed op, hash and digest. No self-bundling: outsiders hold no native XO and no faucet was found `[21 §6]` | T1 |
| N2 | Door (b): how an account becomes registered (`smart_account`), and whether a deployed unregistered account can register itself | Registry is XO's backend | F: trading blocked in state `deployed_unregistered`. The only automatic action is re-reading the registry after each step. L1 key creation is tried only when the user approves it | T1, T2 |
| N3 | Door (c): L1 for an undeployed account (ERC-6492) and the gateway's preferred signature form | Needs an auth call | F: L1 only after deployment; accept either digest form | T2 |
| N4 | Door (d): does the orderbook credit USDC.e minted straight to the account; deposit-address D provisioning and API | Needs funds | F plus cap: funding refused above the test amount until T3a passes; after delivery, if the XO balance has not risen in 10 minutes report `delivered_not_credited` | T3a |
| N5 | Withdrawal: the executor's interface (`0x3a022aa7`), paymaster sponsorship of `transferRemote`, H1 | Unverified contract; a write | FF `ENABLE_WITHDRAW` (off). The tool says "no verified withdrawal path; do not fund beyond the test amount". Funding is capped until T4 | T4 |
| N6 | Gateway auth semantics: derive-returns-secret, key cap, DELETE level, HMAC target, decoding and padding, `XO_ADDRESS` on L2, L2 on POST | Needs a live account | M plus F: variants chosen by probes and stored as capability facts; pessimistic until recorded; at most one key create per account | T2 |
| N7 | Gateway order rules: minimum size and notional, GTD minimum lifetime, duplicate-key composition, tick tolerance, `CancelOrder` typed data, batch and all cancel | Needs a live order | F: floors of 1 share and $0.30, 300 s GTD, single cancels; the typed-data cancel forms are not implemented | T3b |
| N8 | Metadata hosting and upload; whether `image_url` or `tags` may be omitted; whether the oracle fetches a foreign host | XO's backend; 0 of 585 precedent | FF `ENABLE_SELF_HOSTED_METADATA` (off). Creation is lint plus dry run until T6. If T6 fails, creation stays blocked; no substitute is built | T6 |
| N9 | A third-party seed on a PENDING market | Docs say 422 | F: wait for `active: true` | T6b |
| N10 | Where the badge, 500 CP, login streak and one-per-week rules are enforced; XO's stance on non-app accounts and automation | XO policy | Accepted exposure (user): single account, throttled, warnings in every creation approval, kill switch | none |
| N11 | Stability of the keyless RPC, paymaster allowlist and limit, role wiring, exchange and manager upgrades, bucket names | XO can change them any day | Tripwires; read-only fallback; explorer-log fallbacks | none |
| N12 | Oracle drift (approval rate rose from 34% in August to 63% in October); MODRA scoring | XO's model | Informational; the diff guard protects the creator | none |
| N13 | Who controls the three validators and the upgrade EOA; escrow redesign | Not on chain | Funding caps, monitoring, warning text | none |
| N14 | Whether a capped Enable Trading allowance is enough for the exchange | Needs an order beyond the cap | Default is XO's own shape (unlimited) while the balance is a test amount; capped variant behind T8 | T8 |
| N15 | The 33 unidentified paymaster selectors | No ABI | Never call | none |

PayBox-side items that no local build can settle (they are not XO's, but they gate the same flows): PB1 to PB4 (section 3.6, T0), the hosted `Validate transaction` for `eip155:8453` proposals, and Open Plugin behaviour under `autonomous` grants (needs an installed plugin, which the user has deferred). Degrade: `raw` only; approval-gated mode recommended; the conformance harness and the mock stand in locally.

---

## 5. Build plan for v0.2 and v0.3

Everything in this section can be built and tested with no third party: Node 24 (project toolchain), viem, zod, the MCP server package already in `package.json`, `anvil` and `cast` (installed here), and the local mock. The only network use is read-only, one-time, public-data capture of five contract bytecodes (EntryPoint, its SenderCreator helper, factory, validator, Kernel implementation) for fixtures (section 5.5).

### 5.1 Scope and rules

- **v0.2 tools:** account status (rewrite of `xo_account`), deploy plus Enable Trading, Enable Trading (deployed account), revoke trading (kill switch), connect (L1, credentials), fund, withdraw (flag, off), prepare and submit order, order status, cancel, list orders, redeem (prepare and submit).
- **v0.3 tools:** `xo_validate_market_draft` (exists), prepare and submit create, track market, respond to update, cancel market, place seed.
- **Not built:** split and merge, ERC-6492 handling, self-bundling, key rotation or deletion, Pulse rounds, WebSocket feeds, any `CancelOrder` typed-data form, any call to an operator or oracle selector.
- **Rules:** no new dependency; the relay never holds an owner key; no secret in the plugin bundle, logs or tool output; every write sits behind a flag and a kill switch; every unknown fails closed; no model-supplied address is used for a transaction target or maker (derive, compare, refuse).

### 5.2 Architecture, and why approval-gated signing is the right default

```
agent --(MCP)--> PayBox --use_plugin--> xo plugin   (stateless dist/plugin.mjs, 10 s per call, no secrets)
  |                                        | HTTPS to XO_RELAY_URL (localhost for now), header X-Relay-Key
  | request_wallet_sign (raw)              v
  +-----> PayBox signer           relay  (author-operated, stateful)
                                     holds: HMAC triplets (AES-256-GCM at rest), prepared items (memory),
                                            daily ledger, capability facts, watchers, audit log
                                     talks to: orderbooks.xo.market, api-mainnet.xo.market, explorer-mainnet.xo.market,
                                               rpc-mainnet-2.xo.market (optional), mainnet-bundler.xo.market, Base RPC
```

Division of labour:

| Component | Does | Never does |
|---|---|---|
| Plugin | Read tools (as v0.1); builds Base funding proposals after asking the relay for a cap check; thin wrappers for every relay call; returns the exact `request_wallet_sign` intent | Hold credentials, state or caps; sign; trust an address from the agent |
| Relay | Derives accounts; reads chain and explorer; builds UserOps and orders; stores prepared items; **recomputes the digest and recovers the signer before any send**; holds the triplet; signs L2 requests; keeps the daily ledger; runs watchers (review loop); owns the kill switch | Hold an owner key; send anything unsigned or not matching a prepared item; resend after an ambiguous result |
| Agent with PayBox | Calls `request_wallet_sign` with the intent exactly as returned; passes the signature to the plugin | Choose digests, amounts or addresses |

**Approval mode.** `docs/plan.md` assumed plugin caps hold under an `autonomous` grant; they do not `[06 §10]`. An agent that can call `request_wallet_sign` can sign a ClobAuth digest, mint its own XO triplet, sign orders and UserOps itself and talk to XO directly, bypassing the relay and every cap. So:

| Flow | PayBox primitive | Signatures | Why it should be approval-gated |
|---|---|---|---|
| Deploy plus Enable Trading (once) | `raw` on the userOpHash | 1 | Creates the account and the exchange allowance |
| Connect (ClobAuth, once per credential set) | `raw` on the Kernel-wrapped digest, or `typedData` | 1 (+1 per re-derive) | Whoever holds it can mint credentials |
| Order | `typedData` (Kernel wrapper) or `raw` on the wrapped digest | 1 per order | A signed order is a bearer instrument |
| Redeem, revoke trading, create, respond, cancel market, withdraw | `raw` | 1 each | Blind digest; fee or ToS exposure |
| Fund | two PayBox proposals on Base | 2 per funding | Approvers see raw calldata only `[20 §9]` |
| Cancel order | none (HMAC in the relay) | 0 | Bounded by the relay |

**Verdict: it makes sense.** The caps ($10 per order, $50 per day) imply at most about five full-size orders per day, so one approval per order is a small cost, and it is the only configuration in which the caps bind. Two honest limits: (1) an approver sees an opaque digest (PB4), so this protects against unattended autonomy, not against a deceived human; `prepare` therefore returns a decoded summary and a `digest_tag` (first 8 hex digits) to compare with what PayBox shows. (2) Approval latency competes with clocks: L1 needs a signature within about 90 s of preparation (window about 120 s), an order's remaining TTL at submit must be at least 90 s (default TTL 300 s), a UserOp should be signed within minutes. Stale items are refused and re-prepared at no cost. `autonomous` is acceptable only for a throwaway test credential with test amounts (T0). Per-order approval does not scale to market making; that is out of scope.

### 5.3 Modules, file ownership and streams

One owner per path; cross-stream changes go through the owner. Existing v0.1 code is kept; paths marked (delta) change (section 5.8).

| Stream | Owns (paths) | Contents | Depends on |
|---|---|---|---|
| `chain-account` | `src/xo/chain/{constants,abi,reads,tripwires}.ts`, `src/xo/account/{derive,state}.ts` | Section 2.1 as code with strict-checksum tests; ABI fragments; explorer-log and optional-RPC readers; tripwires; `deriveAccount(owner)`, the four-state machine | none |
| `userop` | `src/xo/userop/{calls,encode,nonce,pack,hash,sign,verify,gas,bundler}.ts` | TypeScript port of the researcher's `userop_templates.mjs` (including the corrected paymaster string); call builders for approve, setApprovalForAll, revoke, redeem, create, respond, cancel, withdraw (flag); `eth_estimateUserOperationGas` and `eth_sendUserOperation` client behind the flag; dual-digest verifier | `chain-account` |
| `mock-xo` | `test/mock-xo/*`, `test/anvil/*` | Section 5.5 | `chain-account` (constants, ABI), `userop` (bundler shapes, later) |
| `relay-core` | `relay/{server,config,auth,store,crypto,ledger,prepared,audit,capabilities}.ts` | HTTP server (`node:http`), encrypted store, per-account locks, `DailyLedger` implementation (interface exists in `src/guardrails/limits.ts`), capability facts, kill switch, audit log (reuse `src/guardrails/audit.ts`) | Wave 0 contract |
| `relay-trading` | `relay/{credentials,orders,userops}.ts`; (delta) `src/xo/signing/{verify,amounts,expiry}.ts` | L1 flow, probes, derive-first, persist-before-use; order prepare and submit with cap and fee-bound checks; UserOp prepare and submit; reconcile after ambiguity | `chain-account`, `userop`, `mock-xo`, `relay-core` |
| `funding` | `src/xo/funding/{preflight,calldata,steps,delivery}.ts`, `src/tools/fund.ts` | Router preflight, calldata, next-missing-step machine, proposals (reuse `proposeEvm`), delivery monitor | `chain-account`, `mock-xo` (Base RPC) |
| `plugin-tools` | `src/relay/{contract,client}.ts`, `src/tools/{account,userop,trade}.ts`; (delta) `src/guardrails/*`, `src/config.ts`, `src/plugin.ts` | Tool schemas and handlers; relay client; flag and cap configuration; registration | Wave 0 contract |
| `creation` | `src/xo/creation/{metadata,diff,review,seed}.ts`, `relay/watchers.ts`, `src/tools/create.ts`; (delta) `src/create/lint.ts` | Metadata builder, diff guard, review poller, seed placement, intent-hash idempotency, selector-closed latch | `userop`, `relay-core`, `relay-trading`, `mock-xo` |
| `live-kit` | `scripts/live/*`, `docs/runbook.md`; (delta) `docs/tool-contract.md`, `docs/signing-vectors.md` | One script per test T0 to T8, each printing every call before sending and refusing to run without `--confirm` and a budget; runbook | all (skeleton early) |

### 5.4 Interface between plugin and relay

`src/relay/contract.ts` is the single source of truth (zod schemas, no Node-only imports); the plugin imports it, the relay imports it, the mock validates against it. It is frozen in Wave 0.

```ts
type Hex = `0x${string}`;
type SignInstruction =
  | { op: "raw"; digest: Hex }                                         // sign these 32 bytes as-is
  | { op: "typedData"; typed_data: object; raw_equivalent: Hex };      // Kernel(bytes32) wrapper; same signature either way
type Prepared = {
  prepared_id: string;           // 128-bit random, single use, in memory, TTL 5 min (auth: 90 s)
  kind: "userop" | "order" | "auth" | "create";
  owner: Hex; account: Hex;      // account derived by the relay, never taken from the caller
  expires_at: string;            // whole-second UTC
  sign: SignInstruction;         // pass to request_wallet_sign unchanged
  summary: { lines: string[]; digest_tag: string };    // decoded calls or order terms; first 8 hex digits of the digest
  caps: { reserved_usd: string; day_remaining_usd: string };
  capabilities: Record<string, "unknown" | "yes" | "no">;   // facts this call depends on, so the agent can say what is unproven
  warnings: string[];
};
```

| Endpoint | Request | Response |
|---|---|---|
| `POST /v1/account/status` | `{owner}` | `{account, state, registered, trading_enabled, balance_usd, credentials, flags, tripwires}`; `state` is `undeployed`, `deployed_unregistered` or `registered` |
| `POST /v1/userop/prepare` | `{owner, action, params}`; `action` in `deploy_enable_trading`, `enable_trading`, `revoke_trading`, `redeem`, `withdraw`, `create_market`, `respond_update`, `cancel_market` | `Prepared` plus `user_op_hash` |
| `POST /v1/userop/submit` | `{prepared_id, signature}` | `{state: submitted or rejected or ambiguous, user_op_hash, tx_hash?}`; `GET /v1/userop/{hash}` for status |
| `POST /v1/auth/prepare`, `POST /v1/auth/submit` | `{owner}`; `{prepared_id, signature}` | `Prepared`; `{credentials: "stored", key_tag}` (never the triplet) |
| `POST /v1/order/prepare` | `{owner, token_id, side, price, shares, tif, ttl_s?, post_only?}` | `Prepared` plus `quote {price, shares, max_outlay_usd, fee_bound_bps, expires_at}` |
| `POST /v1/order/submit` | `{prepared_id, signature}` | `{state: accepted or pending or rejected or ambiguous, order_hash, detail}` within 6 s; then `GET /v1/order/{hash}` |
| `POST /v1/order/cancel`, `POST /v1/orders/list` | `{owner, order_hash}`; `{owner}` | cancel result; open orders (no query string on the upstream call) |
| `POST /v1/funding/check` | `{owner, amount}` | `{permitted, reserved_usd, reasons[]}`; the plugin then builds the Base proposals itself |
| `POST /v1/creation/track` | `{condition_id}` | status, review decision, timeline, pending update diff |

Invariants (each has a test):

1. The relay derives the account; a caller-supplied `account` that differs is an error.
2. Submit takes only `prepared_id` and `signature`; everything else comes from the stored record.
3. Before any send: recompute the digest from the stored fields, recover the signer under both digest forms, require it to equal the owner, re-check nonce, expiry, kill switch, flags and caps.
4. One upstream send per `prepared_id`. An ambiguous result is `ambiguous`; the relay reconciles by order hash or nonce and never resends.
5. The relay never returns a triplet, an HMAC value or a stored signature.
6. Plugin to relay authentication is a shared header `X-Relay-Key` (brokered or env) plus an owner allowlist (single tenant). Multi-tenant use would need signed-challenge sessions and is out of scope.
7. Stable error codes: `owner_mismatch`, `stale_nonce`, `expired`, `cap_exceeded`, `kill_switch`, `flag_off`, `capability_unknown`, `upstream_requires_key`, `upstream_rejected` (with code and text), `ambiguous`.
8. A plugin call must return within 10 s. The relay answers `pending` after at most 6 s and finishes in the background.

### 5.5 The local mock XO and the chain harness

**Chain harness (real contract code, offline).** Start `anvil --chain-id 3223`. Install, with `anvil_setCode`, the runtime bytecode of the EntryPoint (16,035 B), its `SenderCreator` helper, KernelFactory (989 B), ECDSA validator (1,819 B) and Kernel implementation (22,784 B) at their real addresses. The helper is the EntryPoint's first `CREATE`: `getContractAddress({ from: entryPoint, nonce: 1n })` gives `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` (computed by me; confirm with `eth_getCode` on 3223 before relying on it, M). Capture them once with read-only `eth_getCode` (or the explorer's `deployed_bytecode` field); EntryPoint, factory and validator are byte-identical on Base, and the implementation differs there in 34 bytes (the cached domain separator and the chain id), so a Base capture can be patched `[19 §5.2]`. Each is under 100 KB as hex. Targets such as USDC.e and the exchange can be a one-byte `STOP` contract; assert the calls the Kernel executed with `debug_traceTransaction`. A test EOA plays bundler by calling `handleOps`. This proves, against the real code: the initCode deploys the predicted address; the owner's signature passes (raw and EIP-191, wrong owner and `v` of 0 or 1 fail); `getNonce` and `execute` single and batch behave as the notes say; and `K.isValidSignature(orderHash, 0x01 + validator + sig65)` returns `0x1626ba7e` for the exact bytes the relay will send as an order signature. It proves nothing about XO's off-chain stack, and it does not run the real PolicyPaymaster (sponsorship is emulated by the mock).

**Mock server (Node `node:http`, one process, several listeners).** Categories:

*A. Emulated faithfully (basis H).*

| Surface | Behaviour | Basis |
|---|---|---|
| Orderbook reads | `/time` bare integer seconds; `/tick-size`; `/book` with decimal sizes and `min_order_size`; `/markets/{cid}`; `/balance-allowance` returns `smart_account` = the queried address in lower-case hex without `0x` if registered, else null; `/positions`, `/claimable`; error bodies for 400 invalid tick and duplicate order, 401, 422 market not active, 429 | `test/fixtures/xo/*`, `[01]`, `[02]`, `[19 §6]` |
| Order intake | Pinned domain; Kernel wrap; real signature recovery against the owner of the deployed account; `signatureType` 3 only; `signer == maker`; account must have code (from the chain mock); nonce 0; GTD expiry against the mock clock; tick grid; positive amounts; BUY fee bound | `[22 a-c]` |
| L1 | `XO_*` headers; plus or minus 120 s; ClobAuth digest recomputed; ERC-1271-style check on a deployed account | `[01 (a)]` |
| L2 | plus or minus 30 s; HMAC verification; `GET /auth/api-keys` | `[01 (b)]` |
| JSON-RPC (3223 and Base) | `eth_chainId`, `eth_blockNumber`, `eth_call` for the views in 2.1, `eth_getCode`, `eth_getStorageAt` (implementation slots), `eth_getTransactionReceipt`; non-read methods rejected; Base `eth_getLogs` rejected; XO log range limit 100,000 blocks | `[21 §6]`, `[20 §1]` |
| Explorer GET | `getLogs` with topic filters and `*_opr` parameters; 1,000-row cap; `page` ignored; pending rows with null `block_number`; lazy `is_contract` | `[19 V2.1]`, `[21 V4.3]` |
| Bundler | `eth_chainId`, `eth_supportedEntryPoints`, `eth_estimateUserOperationGas`, `eth_sendUserOperation` (v0.7 unpacked), `eth_getUserOperationReceipt`; rejects JSON-RPC batch arrays | `[19 §1, §8]`, `[21 §6]` |
| Hyperlane | Base escrow to XO mint after 10 to 30 s; `Mailbox.delivered`; bad-recipient reverts | `[20 §6, V C]` |
| Creation | Manager events with the real data layouts; review timeline sampled from the observed distribution (49 / 40 / 9 / 2 percent; update windows from 20 minutes to 48 hours; expiry changed on accept in 9.4%; post-activation `MetadataUpdated` in 10%) | `[23 §4, V3.5]` |

*B. Unknown on the real service: switches (default first; "pessimistic" profile = all defaults, "optimistic" = all alternatives).*

| Switch | Values | Register |
|---|---|---|
| `bundler.foreign_account` | reject (allowlist) / accept / requires-key | AD5 |
| `bundler.paymasterless` | accept / reject | UO8 |
| `bundler.estimate` | supported / unsupported | UO5 |
| `bundler.shape` | v0.7-unpacked / reject-unpacked | UO6 |
| `paymaster.state` | sponsor / paused / policy-narrowed | UO7 |
| `rpc.access` | open / requires-key / down | UO9 |
| `registry.trigger` | never / on-enable-trading / on-l1-create / on-deploy | AD4 |
| `l1.undeployed` | reject / erc6492 | AU6 |
| `auth.derive_returns_secret` | no / yes | AU2 |
| `auth.max_keys` | 1 / 5 | AU4 |
| `auth.delete_level` | L2 / L1 | AU3 |
| `hmac.target`, `hmac.decode` | path-with-query, path-only; b64url-decoded padded, raw, stripped | OR10 |
| `l2.required_on_post`, `l2.xo_address` | yes / no; ignored / required | OR9 |
| `order.min_size`, `order.min_notional`, `order.gtd_min` | 5 shares, 1, 0; $1, $0.30, 0; 180 s, 60 s, 0 | OR6, OR17 |
| `order.sig_forms`, `order.prefix` | both, raw-only, eip191-only; 0x01, 0x00, both | OR3, OR4 |
| `order.dup_key_includes_sig` | no / yes | OR13 |
| `cancel.body`, `cancel.batch_hmac_only` | orderID-hash, orderId, numeric id; no / yes | OR11 |
| `engine.taker_delay`, `engine.balance_drop` | 500 ms, 3 s; LIFO on, off | OR12, OR14 |
| `funding.credit` | credited / not-credited / delayed 5 min / credited-after-sweep-only | FU6 |
| `withdraw.paymasterless` | accept-and-deliver / reject / accept-no-deliver | FU9 |
| `meta.foreign_uri` | reviewed / ignored / rejected | CR4 |
| `seed.on_pending` | 422 / accept | CR7 |
| `faults` | 429 with `retry_after_ms`, 5xx, timeouts, truncated JSON | XS |

*C. Not emulated:* the matching engine beyond resting orders; the real fee schedule; MODRA; real FiatToken semantics (a plain ERC-20 in memory); validators and relayers; XO's UI; the real PolicyPaymaster.

**Mock self-tests.** Read-surface shapes are checked against the recorded fixtures (`test/fixtures/xo/*`); each switch has a test that flips it and checks the visible effect; the default profile equals the pessimistic column. Write-surface shapes come from docs and OpenAPI (M) and are labelled so.

### 5.6 Test strategy per module

All tests run offline with `pnpm exec tsx --test` (the existing convention) and the project toolchain (`source .tools/env.sh`).

| Module | Tests |
|---|---|
| `chain-account` | Strict EIP-55 for every pinned address; selectors and topics recomputed from ABI fragments equal section 2.1; no address literal outside `constants.ts`; import-boundary test (no `node:fs` under `src/`). Golden: the 34 decoded deployments (owner to account) and the Anvil-0 vector; property test of random owners against the real factory's `getAddress` on anvil; state machine over log fixtures (`AccountDeployed` only, `OwnerRegistered` only, neither, explorer false-404); refuses a mismatching supplied account |
| `userop` | The 158 golden rebuilds (ported from the researcher's test, with sanitized fixtures); hash equals anvil `getUserOpHash` for random ops; signature properties (raw and EIP-191 accepted, wrong owner rejected, `v` 0 or 1 normalised, high `s` normalised); mutation test (flip any byte of the packed op, hash changes, verifier rejects); deploy and execute on anvil with real bytecode; nonce lanes; paymaster fallback logic per switch |
| `funding` | Calldata byte-identical to `cast calldata`; left-pad property (upper 12 bytes zero); refuses zero address, owner EOA, undeployed account, non-zero value, wrong chain; each of the 8 preflight checks flipped, refuse; next-missing-step over the (allowance, balance, XO balance) grid yields exactly one step; proposals satisfy the `.strict()` schema in `src/paybox.ts` |
| `relay-core` | AES-GCM round trip and tamper detection; crash-atomic write; no plaintext secret on disk and none in logs (scanner test); ledger reserve and release under concurrency, UTC rollover, idempotent per `prepared_id`; separate funding counter; kill switch blocks every write |
| `relay-trading` | Credentials across the profile matrix: at most one `POST /auth/api-key` ever per account, triplet persisted before first use (crash right after create is recoverable), at most 6 probe GETs, stop after 6 failures; orders: amount properties (rounding, fee bound, SELL minimum proceeds, floors, post-only rule), digest recompute, wrong-owner signature rejected, the same `prepared_id` twice gives one POST, timeout gives `ambiguous` and no resend, prefix swap only on an explicit rejection, GTD never 0, remaining TTL at least 90 s, 6 s budget with fake timers, cancel variants |
| `plugin-tools` | Tool schema snapshots; output scanner (no secrets, untrusted text labelled); one failing-case test per guardrail (existing convention); `pnpm test` (type check, build twice byte-identical, conformance) |
| `creation` | Lint corpus: the 138 fetched metadata files pass and the 51 rejected examples map to the expected rule ids; diff guard on the 38 original-versus-suggested pairs (the 3% to 5% change is flagged, a tags-only change is not); `suggestedExpiresAt` change flagged; poller state machine on recorded timelines including a 20-minute window; intent-hash idempotency; selector-closed latch; seed retry on 422 |
| `mock-xo` | As in 5.5 |
| `live-kit` | Each script run end to end against the mock with the identical call sequence it would use live; refuses without `--confirm` and an explicit budget; prints each call before sending |
| Profile matrix (cross-cutting) | The relay suite runs in the pessimistic and optimistic profiles and with each switch flipped alone. Acceptance in every profile: nothing is signed or sent that does not match a prepared item; caps are never exceeded; no double send; credentials are never lost; no funding of an undeployed account; and each failure is an actionable error, not a hang |

### 5.7 Order of work and parallel streams

- **Wave 0 (small, serial):** freeze `src/relay/contract.ts`, the profile switch names, the error codes and the flag names (`ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING`, `ENABLE_FUNDING`, `ENABLE_WITHDRAW`, `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA`, `KILL`). This unblocks everyone.
- **Wave 1 (parallel):** `chain-account` (S); then `userop` (M) after the constants land; `mock-xo` read surfaces plus the anvil harness (M); `relay-core` (M); `funding` (M); `plugin-tools` skeletons and guardrail deltas (S).
- **Wave 2:** `relay-trading` (L: credentials, orders, userops); `plugin-tools` filled in; `mock-xo` write surfaces and switches; funding monitor.
- **Wave 3:** `creation` (L), `live-kit` (M), profile matrix hardening, security review of the relay (secrets, logs, the signature-binding invariant), byte-identical build.

Checkpoints: CP1 constants plus derive plus UserOp golden plus anvil deploy pass. CP2 mock read surfaces pass fixture conformance. CP3 relay prepare and submit for UserOps and orders pass in the pessimistic and optimistic profiles. CP4 tools run end to end with `pnpm call` against local relay and mock; conformance green. CP5 full profile matrix green. CP6 funding calldata golden plus state machine. CP7 creation lifecycle in the mock. CP8 live kit dry run against the mock. **Definition of done for the local build:** CP1 to CP8, every flag default off, secrets scan clean, no pinned address fails the strict check. Releasing anything further needs the live tests in section 6, run by the user.

### 5.8 Delta to the v0.1 code

| File | Change | Why |
|---|---|---|
| `src/xo/signing/verify.ts`, `docs/signing-vectors.md` §6 | Accept the raw digest signature and the EIP-191 form; return which form matched | The verifier is raw-only; XO's own signers use EIP-191 and the chain accepts both `[19 §7.3]`, `[22 b.3]` |
| `src/xo/signing/amounts.ts` | Add `maxBuyOutlay(makerAmount, feeBps)` and `minSellProceeds(takerAmount, feeBps)`; default share step 1,000 micro-shares, minimum 1,000,000 micro-shares and $0.30 (configurable); post-only rule (D2) | Fee sits on top of BUY principal, SELL proceeds are net of fee `[22 §9.2, V M2]`; the defaults are unset today |
| `src/xo/signing/expiry.ts` | Default TTL 300 s; remaining TTL at submit at least 90 s | `[22 h.3]` |
| `src/guardrails/constants.ts` | Replace the "deliberately NOT pinned" header with the pinned set; move chain constants to `src/xo/chain/constants.ts`; strict EIP-55 test | Section 2 |
| `src/config.ts`, `src/guardrails/limits.ts` | Remove `maxCreatesPerDay` enforcement (user decision); keep `createEnabled` default off; add the flags; the `DailyLedger` implementation lives in the relay (the plugin is stateless) | Decisions 4 and 5 |
| `src/xo/client.ts` | Add the ranged explorer log reader (split on the 1,000-row cap, filter pending rows), the optional RPC reader with a "requires key" latch, derive-from-owner; `xo_account` takes the owner | Section 2.1, AD2, AD3 |
| `src/create/lint.ts` (1,904 lines) | Reconcile rule by rule with `[23 §8]` (39 checks); add `suggestedExpiresAt` comparison; add the operational checks to the relay | I did not check its rule set against note 23's checklist |
| `docs/tool-contract.md` | Close known gaps 1 and 8; add the new tools | Sections 2 and 3 |

### 5.9 Tool readiness

| Tool | Primitive | Needs | Enabled by | Default |
|---|---|---|---|---|
| `xo_account` | none | derive, explorer logs | built | on |
| `xo_deploy_enable_trading` | `raw` | door (a) | T1 | dry run only |
| `xo_connect` | `raw` or `typedData` | deployed account, doors (b) and (c) | T1, T2 | off |
| `xo_fund_account` | 2 Base proposals | deployed account, door (d) | T3a | test amount only |
| `xo_withdraw` | `raw` | H1 | T4 | off |
| `xo_prepare_order`, `xo_submit_order`, `xo_cancel_order`, `xo_list_orders` | `typedData` or `raw` | credentials, funded, trading enabled | T2, T3b | off until T3b |
| `xo_redeem` | `raw` | door (a) | T5 | off |
| `xo_revoke_trading` | `raw` | door (a) | T1 | on after T1 passes |
| `xo_prepare_create_market`, `xo_submit_create_market`, `xo_track_market`, `xo_respond_update`, `xo_cancel_market`, `xo_place_seed` | `raw` (+ order for the seed) | everything above plus hosting | T6, T6b | off |

---

## 6. Live tests the user may later choose to run

These are the only ways to settle the open items without contacting XO. None of these tests has been run, by me or by any research stream. Each is optional, each needs the user's explicit go, and each is a real action on XO's or PayBox's systems (an account, a key, a deposit, an order, a market), not a read. The kit in `scripts/live/` runs one test per script, prints every call before making it, and refuses without `--confirm` and an explicit budget. Recommended order: T0, T1, T2, T3a, T4, T3b, T5, T8, then T6.

| Test | Settles | Minimal procedure | Worst-case cost | Stop rule |
|---|---|---|---|---|
| **T0** PayBox signing probes | UO2, PB1 to PB4; the PayBox half of gate 8 | Throwaway PayBox EVM credential. (1) `check_operation_readiness` dry run for `request_wallet_sign` with `raw` and with `typedData` (Kernel wrapper, chainId 3223). (2) `request_wallet_sign` `raw` on a random 32-byte digest produced by the kit; recover locally and compare with the credential address; record the output shape (`r, s, recovery_id` or 65 bytes) and the `v` byte. (3) The same with `typedData`. (4) Record `pending_signature` versus `pending_approval` and what the signing window shows | $0 | If `raw` cannot sign a digest, the write path is blocked on PayBox; `message` is a fallback only if it accepts hex bytes |
| **T1** Deploy plus Enable Trading (door a) | AD5, UO3 to UO7, door (a), part of door (b); the residual of gates 3 and 4 | Relay `prepare deploy_enable_trading` for the PayBox owner: derives the account, confirms by logs that it is undeployed, builds `initCode` and the batch `[USDC.e.approve(exchange, max), CTF.setApprovalForAll(exchange, true)]`, zero fees, `PolicyPaymaster` after `checkPolicy`. Compare `digest_tag`, sign once with `raw`, submit. Poll the receipt and logs: `AccountDeployed` (sender = account), `OwnerRegistered`, `ApprovalForAll`, `Approval`. Then re-read `/balance-allowance?address=<account>` | $0 (sponsored, zero fee). Exposure: an unlimited allowance on a $0 account | Any 401, 403 or "key required": record "requires key", stop, do not look for a key. A plain rejection text is stored as a capability fact |
| **Plan B** if T1 is rejected | Door (a) by another route | User-run, one time: sign in at the XO web app with the PayBox wallet as an external owner (docs: "Owner wallet (external or embedded)" `[01 (e)]`). Whether PayBox can connect to the app is unknown, and this is a human step, not plugin automation. If the app deploys the same Kernel at the same address (salt 0, M), skip T1 | $0 | If PayBox cannot connect, the write path is closed until XO changes something |
| **T2** Credentials and gateway probes | AU1 to AU4, OR9, OR10, doors (b) and (c) | Relay `auth/prepare` (timestamp from `GET /time`), sign within 60 to 90 s. Relay: `GET /auth/derive-api-key` (expect 404); if 404, one `POST /auth/api-key`; persist the triplet encrypted before anything else; probe A `GET /auth/api-keys` (at most 4 decode and padding variants); probe B `GET /orders?limit=1` documented form then path-only (at most 2); derive once more and compare (does it re-return the secret?). Optionally A8: `POST /order` with a deliberately invalid signature and no L2 headers (cannot place an order; the user's call). Re-read `/balance-allowance` | $0. Uses the account's one key slot (cap unknown) | Stop after 6 failed probes; never create a second key |
| **T3a** Deposit $1 (door d) | FU3 to FU7 | Relay `funding/check`; the plugin prints the two Base calls (approve exact, `transferRemote(3223, account, 1 USDC)`). Without an uploaded plugin the user sends them from any Base wallet (the route is permissionless), or signs them with PayBox `request_wallet_sign` `transaction` and broadcasts. Watch the account's USDC.e balance (expected under 30 s, poll 10 minutes), `Mailbox.delivered(messageId)`, and the credited balance on `/balance-allowance` | $1 plus Base gas (cents) | No balance rise in 10 minutes: do not resend; check `delivered` by id |
| **T4** Exit test (H1) | FU9, UO8, N5; decides whether funding beyond the test amount is allowed | Relay `prepare withdraw`: no paymaster, zero fee, batch `[USDC.e.approve(route, a), route.transferRemote(8453, owner, a)]` with a = the deposited amount, destination the owner EOA only, after an XO-side `quoteTransferRemote` check. Sign, submit; observe bundler acceptance, the XO `SentTransferRemote`, and the Base USDC arrival (expected about 30 s) | Reuses the $1; worst case it stays stranded | Rejected: nothing moved. Accepted but not delivered after 10 minutes: no retry |
| **T3b** First order | OR3, OR4, OR6, OR11 to OR14, OR17; gate 2 | With the $1 balance: post-only GTD BUY of 100 shares at 0.005 ($0.50) on a liquid market, 300 s. Check acceptance (prefix, digest form), `GET /orders`, cancel by hash, a duplicate resubmit, then sub-floor probes (10 shares at 0.03 = $0.30; 1 share at 0.01; GTD lifetimes of 60, 30, 15 s) whose rejections cost nothing and reveal the gateway text | $0.50 locked while resting, released on cancel; no fill expected | Any ambiguous result: reconcile by order hash, no resend |
| **T3c** (optional) Fee reconciliation | OR7, OR8; which fee figure is real | A $1 FOK taker order on a liquid market; compare the realised fee with `effectiveFeeConfig` and the 800 bps bound | Up to 8% of $1 plus a $1 position | Stop if the realised fee exceeds the bound |
| **T5** Redeem | UO11; nonce lanes; policy for a foreign account | `redeemPositions(USDC.e, 0x00..00, conditionId, [1,2])` on any resolved condition where the account holds nothing (expected to succeed with zero payout under standard CTF behaviour, M; XO's CTF source is unverified), or on a real $1 position that resolved | $0 | A revert on zero holdings is informative, not a failure of the tool |
| **T8** Capped allowance, kill switch | N14; kill switch | `approve(exchange, 0)` then `approve(exchange, X)` with X a little above the balance; place an order within the cap, then one beyond it (a rejection costs nothing). Finally run `revoke_trading` and confirm orders are refused | $0 | None |
| **T6** Creation experiment | CR3, CR4, AD10, N8 | Draft a sports market of 1 to 7 days (the family with 85% first-pass), nine-key JSON, clean under `xo_validate_market_draft`; host it at an HTTPS URL the user controls; `canCall` pre-flight; prepare, sign and submit the create batch; poll `MarketReviewed` (60 s for 30 minutes). Approve means hosting is accepted. Update-required: accept only if the diff guard passes, otherwise decline. Reject or no review means hosting is not accepted | $1 (non-refundable) | Do not retry creation; reconcile by `CLOBMarketCreated` |
| **T6b** Seed (after T6 is `active: true`) | CR7 | `order/prepare` a resting GTC BUY, stake $10, price between 5 and 95 cents | $10 locked, released on cancel | 422 "not active" means wait |

Money at risk on the core path (T0 to T5, T8): about $2 (the $1 deposit if it cannot be exited, plus $0.50 locked briefly, plus up to $0.08 in T3c). T6 adds $1; T6b locks $10. Outcome table: T1 rejected, go to Plan B, else the write path is closed. T3a credited but T4 failed, keep funding at or below $10 and treat the account as one-way. T3a not credited, stop and do not fund again. T6 rejected or ignored, creation stays blocked.

---

## 7. Risks that remain

Ordered by consequence. "L" marks my own judgement without evidence.

1. **Door (a) may be closed.** If the bundler refuses a foreign first UserOp, the whole write path (trading, redeem, creation) is dead: self-bundling needs native XO and outsiders hold none `[21 §6]`. Plan B is of unknown feasibility. L: I expect T1 to pass more often than not (the paymaster is sender-agnostic, the bundler answers keyless, the deploying op is an ordinary first op), and I would not bet either way on doors (b) and (d).
2. **Stranded funds.** No verified exit; H1 is a hypothesis. Escrow and token are controlled by one upgrade EOA that also blacklists USDC.e, a 2-of-3 validator set and Circle; total collateral is only about $0.34M `[20 §3.3]`. Mitigation: deploy before funding, test amounts, T4 before scaling.
3. **XO can change anything any day:** paymaster allowlist (5 handovers), role wiring, UUPS exchange and manager, fee ceiling, the oracle, and it can void markets, revoke creation or terminate access "with or without cause" `[23 §6]`. Tripwires turn most of this into "go read-only", not into safety.
4. **Blind signing and prompt injection.** Approvers see an opaque digest; market titles are attacker-controlled text. The `digest_tag` helps only if a human compares it; approval fatigue is real.
5. **Autonomous grants defeat every cap.** If the user chooses `autonomous`, the caps are advisory and the agent can self-mint XO credentials.
6. **Bearer instruments.** A signed order is valid until expiry (no on-chain cancel); a signed UserOp has no expiry. Short TTLs and prompt submission shrink the window; whether L2 is required on `POST /order` is unknown, which decides whether a leaked order can be posted by a stranger.
7. **Credential custody.** The relay holds triplets. A theft is a privacy and cancel-griefing event, not a theft of funds (M). Loss of a triplet may be unrecoverable (DELETE is probably L2, the key cap is unknown).
8. **Unlimited allowance to an upgradeable exchange** (one upgrade so far). A bad upgrade could pull the whole balance. Mitigation: small balances and the capped-allowance policy after T8.
9. **Gateway rules can stall trading even if all four doors open** (minimum size, GTD minimum, duplicate key). Mitigation: conservative floors and learning from rejection text.
10. **Fee uncertainty.** `effectiveFeeConfig` (400 and 800 bps seen) versus the on-chain ceiling of 800; a BUY can cost up to 8% more than its principal and a SELL can net 8% less; 4 of 300 sampled matches paid a taker fee, up to 5.5% `[22 §9.2]`.
11. **Creation is the weakest tier.** Hosting unresolved; 13.7% of attempts never activate and the $1 is non-refundable; the oracle rewrites meaning (2 of 38) and an accepted update can move the end date (22 of 233); XO rewrites metadata after activation (10.3%); void settlement is 50/50 or pro-rata depending on which page is right; a creator trading its own market meets the influence clause; the NFT sits with the creator; the badge and weekly rules are unenforced but invocable. With no cadence cap the $50 daily limit is the only brake (about 45 fee-only creations, or about 4 with seeds).
12. **Terms and jurisdiction.** Automated access "must not overwhelm or misuse", one account per user, wash-trading and self-trade prevention, IP-based region checks that apply to the relay's egress address. With no XO contact there is no safe harbour.
13. **Fragile read paths.** Keyless RPC and bundler, lazily filled explorer fields, 1,000-row caps, Cloudflare 403 on default User-Agents (the plugin sets its own). Reads fall back to explorer logs; writes stop.
14. **Mock fidelity.** The profile matrix covers the unknowns I enumerated, built from the same notes it tests. Passing it proves robustness to those unknowns, not to unknown unknowns. Anvil proves contract-level validity, not XO's acceptance.
15. **Data hygiene.** Seven bad-checksum strings in notes and scripts (section 2.3); counts in the notes are dated snapshots; one anomaly (the 74-message gap) was refuted. Constants must come from section 2, not from the notes.
16. **PayBox-side unknowns** stay until T0 and an upload: `raw` output shape, `typedData` on 3223, autonomous behaviour, window rendering, the hosted sandbox's User-Agent versus Cloudflare. Distribution (B0) is parked by the user's decision.
17. **Process risk.** A Phase 0 verifier once sent the user's email in a User-Agent `[P0 §10]`. The relay and the live kit set one fixed User-Agent and are reviewed for any header that could identify a person.
18. **Live tests are actions, not research.** They create an account, a key, a deposit, an order, possibly a market on XO. They must stay opt-in, one script each, with a printed call list.

---

## 8. Defaults I will build to unless the user objects

| ID | Decision | Default | Alternative and consequence |
|---|---|---|---|
| D1 | Approval mode | Approval-gated (`iframe` or `always_approve`) for any wallet with real XO funds; `autonomous` only for the throwaway test credential | Autonomous: caps become advisory (risk 5) |
| D2 | What counts toward the $10 per order cap | BUY: `makerAmount x (1 + fee bound)`; post-only GTC (maker): principal only; SELL: notional with a minimum-proceeds guard. A $10.00 seed fits only under the post-only rule | Applying 1.08 to everything caps a seed at $9.25, below XO's "at least $10", and makes creation impossible |
| D3 | Exposure before the exit is proven | Total funded at most $10 until T4 passes, then a separate $50 per day funding cap | Raising it earlier accepts risk 2 |
| D4 | Enable Trading allowance | XO's own unlimited shape while the balance is a test amount; after T8, a capped allowance (the larger of open exposure and $50) refreshed by approval-gated UserOps | Unlimited forever accepts risk 8 |
| D5 | Creation | Off by default; no cadence cap; the $1 fee counts toward $50 per day; a seed counts as an order; per-attempt approval; the ToS warning shown each time | Enabling unattended creation is not offered |
| D6 | Relay | Single tenant, localhost, owner allowlist, AES-256-GCM store with a master key supplied at start (never read from a file on disk by the code) | Multi-tenant needs signed-challenge sessions |
| D7 | Live tests | Run only by the user, one script each, with `--confirm` and a budget | None |
| D8 | Flags | `xo_withdraw`, self-hosted metadata, userop submit, funding and trading all start off | Each flips only on a recorded test result |
| D9 | Mock profile | Pessimistic is the default; the matrix runs both profiles and every single flip | None |

## 9. Amendments after the critic pass (binding for the build; they override sections 1 to 8)

Source: the gap-closing critic (14 gaps, 11 overstated claims). The PayBox signing schema in item A1 was checked against the live `request_wallet_sign` tool definition (schema loaded only, no call made).

**A1. PayBox signing intent shape (fixes section 5.4).** The live tool takes `{credential_id, intent}` with `intent` one of `{op:"raw", rawSigningPayloadHex}`, `{op:"typedData", typedData}`, `{op:"message", message}`, `{op:"transaction", transaction}`, `{op:"authorization", authorization}` (plus Solana variants). It has no `digest` or `typed_data` field. So `Prepared.sign` becomes `{ intent: <exact request_wallet_sign intent object>, expected_digest: Hex, digest_form: "userOpHash" | "kernelWrappedOrderHash" | "kernelWrappedClobAuth" }`: `intent` is passed to PayBox unchanged, `expected_digest` and `digest_form` stay on the relay side for the post-signature check. A `toPayboxIntent()` adapter with a golden test pins the exact field names and the `0x` prefix handling, and T0 records both. Headless hosts need an in-process signer for `pending_signature`; the live-kit docs say so.

**A2. Durability (adds to sections 5.2 and 5.3).** The relay has one durable store (atomic write-then-rename file, or `node:sqlite` if the toolchain's Node 24 has it without a flag; no new dependency). It holds the daily ledger, the funding counter, prepared items, a `sending` marker, intent hashes, watchers and capability facts. Rules: write the `sending` marker (fsync) before every upstream POST; a reservation is released only after the item's expiry has passed AND `GET /orders` or an `OrderFilled`/`OrdersMatched` log query (topic1 = order hash) confirms it is gone; ambiguous items stay reserved; a restart never resets a cap. Tests: kill and restart mid-prepare, mid-send and mid-watch (cap not reset, no double send, watchers resume).

**A3. Seed order (resolves OR2 vs CR7 vs D2).** No resting GTC order is ever placed: every order, including the creation seed, is GTD (expiry never 0). The creation seed is a post-only GTD BUY of 7 to 30 days, refreshed only by a new approval. The fee multiplier of 1.08 applies to every BUY, post-only included (makers may be charged up to the 800 bps bound by the operator's `makerFees` argument). Creation seed has its own cap of $10.80 (a $10.00 stake times 1.08), it counts toward the $50 per day, and the creation approval text states the number. This is a judgement call, not a user decision; it is listed as open item O3 in section 9.4.

**A4. Approval-gated mode and the dedicated wallet (corrects section 5.2 and D1).** The claim "it is the only configuration in which the caps bind" holds only against a cooperative agent. `raw` has no domain separation; an agent can request a signature over an Ethereum transaction hash or a UserOp hash, and the approver sees an opaque digest. The PayBox owner key is also that wallet's Base address, so one blind approval can move its Base funds, not only the XO account. Preconditions for any funded use: (1) the XO owner is a dedicated PayBox credential that holds only what the user will fund; (2) prefer `typedData` over `raw` wherever XO accepts both; (3) `digest_tag` is the first 16 hex digits (not 8) and is documented as anti-accident only; (4) caps are advisory against a compromised agent and every tool description says so. "Dedicated wallet" is added to the T0 and T1 checklists.

**A5. Relay completeness (adds modules to section 5.3).**
- `relay/upstream.ts` (stream `relay-core`): per-host token bucket (4 requests per second), 429 and `Retry-After` handling, backoff, Cloudflare-403 handling, a pinned `User-Agent` (`insurance-markets-xo-plugin/0.2`, no personal identifier), circuit breakers, the "requires key" latch, response size and time caps, an https-only host allowlist (the XO hosts, the two XO metadata buckets and the declared self-host), and tests for 429, 403 and timeouts.
- Credential store spec: scrypt (or argon2 if already available) for the key, the account address as AAD, a schema version, file mode 0600, an encrypted backup written before the first use, and a restore test. T2 is gated on a verified restore.
- Audit and alerts: a separate append-only, redacted, rotated relay audit log (the stderr writer in `src/guardrails/audit.ts` stays the plugin's). An alert sink (a file plus a local desktop notification hook). Tripwires are re-checked at submit, not only at prepare. `/health`, per-host error counters and tripwire state appear in account status.
- Local-only authentication: bind to 127.0.0.1, validate `Host` and `Origin`, rotate `X-Relay-Key`, per-IP and per-endpoint rate limit. A real PayBox-hosted plugin cannot reach localhost; a public TLS relay is then needed, and multi-tenant use needs an owner-signed challenge before the relay stores or uses a triplet. Both are out of scope for the local build and stated in the runbook. Single tenant is a stated assumption (O4).
- Reconcile after an ambiguous order: open-orders check, then an `OrderFilled`/`OrdersMatched` explorer query by order hash, then a time-boxed `unknown` state with the reservation kept. A funding endpoint takes the Base transaction hash from the agent (`POST /v1/funding/report`) so the relay can follow the `DispatchId` message.

**A6. Gate 6 relabel.** Gate 6 is `partial`: mechanism verified by simulation; third-party delivery unobserved (all 483 deliveries and 34 sampled transactions went through XO's own executor). A new door (e) is added to section 0: XO's relayer must deliver a message that did not come through the executor, and the router pays no gas, so recovery by `process()` needs native XO that outsiders lack. N4 gains this. The funding tool refuses any amount above the test amount unless T3a recorded both delivery and credit. It reports `dispatched_not_delivered` after 10 minutes and never resends.

**A7. ClobAuth is tagged M, not H.** It rests on XO's docs and our own vectors; the gateway has accepted none of our signatures and the docs were wrong on at least five other points. L1 header variants (Kernel wrap on or off, 86-byte or 65-byte signature, `XO_ADDRESS` present or absent) are switchable and probe-selected as capability facts. T2 names the accepted L1 form as an explicit outcome.

**A8. Trading-enabled read (corrects gate 9).** The log-existence test breaks under a capped allowance (a capped allowance falls silently on `transferFrom` with no `Approval` event). Read `allowance()` and `isApprovedForAll()` by `eth_call` when an RPC is open and fall back to the latest matching log only, with the gate wording narrowed to "read-only REST and log fallback". Whether the PayBox sandbox's `User-Agent` passes Cloudflare stays open.

**A9. Mock fidelity.** Etch the real PolicyPaymaster runtime (7,309 bytes, one read-only `eth_getCode`, fixtures only) and replay its allowlist from logs. USDC.e may remain a plain ERC-20 but is labelled as such (FiatToken v2.2 differs on allowance and blacklist). Add a read-only drift test that diffs recorded live read shapes against `test/fixtures/xo`. Every write-surface fixture is labelled M.

**A10. Budget and caps (corrects section 6 and D3).** T3a deposits $2 to $3, not $1, if T3b and T3c follow. A failed T4 blocks T6b. T6 plus T6b is $11, above the $10 funding cap before T4 passes, so raising the cap for T6/T6b is an explicit decision (O2), not an implied one. "About $2" omits Base gas and the stranded-funds case.

**A11. Tags and switches.** Retag unreproduced `H*` rows as `H` (Appendix A recomputed only checksums, selectors and topics, the account derivation, the init-code hash, the Kernel typehash and the researcher's own golden test). The `gasFees` high/low order and the L1 window of about plus or minus 120 s are spec-only or single-measurement. The relay's software kill switch and the on-chain revoke are two separately named things; the on-chain revoke is pre-tested paymaster-less in T1/T8 before any funding. Funding requires positive proof of deployment (code or `AccountDeployed`/`OwnerRegistered` logs); AD2's "two consecutive negatives" never applies to funding. A flag flips only through a recorded capability fact plus an operator confirmation (live-kit feature).

**A12. Hygiene.** The GitHub handle and home paths in `docs/plan.md`, `docs/research/05`, `07` and `13` are scrubbed before any publish. Risk 17 gains the note that a Phase 1 verifier ran scripts before the required `@`/name grep (no outbound leak).

### 9.4 Open items for the user

| ID | Open item | Default until answered |
|---|---|---|
| O1 | Dedicated PayBox credential for XO (A4) | Required for any funded use; the build assumes it |
| O2 | Raise the $10 funding cap for T6/T6b (needs T4 to pass first) | No raise |
| O3 | Creation seed cap $10.80 and GTD-only seeds (A3) | As written; creation stays off |
| O4 | Single tenant, localhost relay | As written |
| O5 | Accept XO terms, badge-rule and jurisdiction exposure for creation, and where the relay's egress address sits (Phase 0 rank 8) | Not accepted; creation stays off by default. "User accepted the exposure" in section 1 gate 7 was an inference by the synthesis, not a recorded decision |

---

## Sources

- `docs/phase0-gate-results.md` (read in full).
- `docs/research/19-smart-account-derivation.md`, `20-funding-route-verification.md`, `21-userop-templates.md`, `22-order-semantics-from-source.md`, `23-creation-and-metadata-onchain.md`, each with its Verification section (read in full except the long machine-listing tables).
- `docs/research/01-xo-auth-signing.md` (§a, b, e, f, g), `06-paybox-platform.md` (§2 to §8, §10 to §11), for origins of claims about L1/L2, signing intents, sandbox limits, approval modes.
- Repository state read for the delta in 5.8: `package.json`, `docs/plan.md`, `docs/tool-contract.md`, `docs/signing-vectors.md`, `src/plugin.ts`, `src/config.ts`, `src/paybox.ts`, `src/guardrails/{constants,limits}.ts`, `src/xo/signing/*`, `test/xo-live.test.ts`, and the saved fixtures under `docs/research/fixtures/gaps/` (ABI files for the offline recomputation, `userop-templates/` for the golden test).
- Not re-read: notes 02, 03, 07 to 18 beyond what the Phase 0 synthesis and the five new notes cite from them.
- Environment facts used: `anvil`, `forge` and `cast` are installed (checked with `which`, nothing run); the project toolchain is `.tools/env.sh` (Node 24.21.0, viem).

## Appendix A. What I ran (offline; no network; no key; no signature)

All commands use the project's Node 24 (`source .tools/env.sh`) and the already-installed viem, set through an environment variable (`VIEM_DIR` = the repo's `node_modules/viem`). Scripts were written in the session scratchpad (not in the repo), grepped for at-signs and personal names before running, and send no request.

1. **Strict EIP-55 check of every address** that goes into section 2 and of the three strings the verifiers flagged; then a scan of this document itself: every address passes except the seven deliberately listed bad strings in section 2.3, whose correct forms are printed beside them. Lower-case-only addresses in the notes (AccessManager, CONFIG_MANAGER, oracle, NFT proxy) were converted with `getAddress`.
2. **Checksum scan over files** (notes 01, 03, 07, 19 to 23, `docs/phase0-gate-results.md`, `src/`, `test/`, all of `docs/research/fixtures/gaps/`): reports every mixed-case 40-hex string that fails EIP-55. Core of the scanner:

```js
const re = /(?<![0-9a-fA-Fx])0x([0-9a-fA-F]{40})(?![0-9a-fA-F])/g;
for (const m of text.matchAll(re)) {
  const mixed = /[a-f]/.test(m[1]) && /[A-F]/.test(m[1]);
  if (mixed && getAddress(m[0].toLowerCase()) !== m[0]) report(m[0], getAddress(m[0].toLowerCase()));
}
```

3. **Selectors and topics** (`toFunctionSelector`, `toEventSelector`): 29 selectors computed; the 21 the notes state all match. 11 event topics the notes state all match (`OwnerRegistered`, `NonceIncremented`, `AccountDeployed` prefix and suffix, `DispatchId`, `ProcessId`, and the six manager events recomputed from the saved verified ABI `docs/research/fixtures/gaps/userop-templates/abi/manager.abi.json`). New topics computed from the saved ABIs: `MaxFeeRateUpdated` `0x3b0628c0...fd61d`, `Upgraded` `0xbc7cd75a...2d3b`, the paymaster events.
4. **Account derivation from the pinned constants**:

```js
const initData = encodeFunctionData({ abi: [initializeFragment], functionName: "initialize",
  args: [concat(["0x01", ecdsaValidator]), zeroAddress, owner, "0x", []] });           // 292 bytes, selector 0x3c3b752b
const salt = keccak256(concat([initData, "0x" + "00".repeat(32)]));
const initCode = concat(["0x603d3d8160223d3973", kernelImpl, "0x6009", "0x5155f3363d3d373d3d363d7f",
  "0x360894a13ba1a3210667c828492db98dca3e2076",
  "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3"]);
const account = getContractAddress({ opcode: "CREATE2", from: kernelFactory, salt, bytecodeHash: keccak256(initCode) });
```

   Results: `keccak256(initCode)` = `0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6` (equals the note); for the public Anvil account 0 address the account is `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` (equals the note, which the researcher and the verifier matched to the Base factory). The first-op nonce for sequence 0 is `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000` (32 bytes), matching `[21 §3]`.
5. **EntryPoint helper address**: `getContractAddress({ from: entryPoint, nonce: 1n })` = `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` (the address I remember as the canonical v0.7 `SenderCreator`; derived from the CREATE rule, not read from chain, so M until `eth_getCode` confirms it).
6. **Researcher's UserOp golden test, re-run offline** against the checked-in transaction fixtures (`docs/research/fixtures/gaps/userop-templates/test_templates.mjs`): `TOTAL pass 158 fail 0`. This is the researcher's code; it shows the checked-in state reproduces, not an independent derivation.

What I did not do: any request to XO, PayBox, Base, GitHub or any other host; any signing; any run of third-party code other than the project's own scripts and viem; any edit outside this file.

