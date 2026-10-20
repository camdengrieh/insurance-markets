# Phase 0 gate results: XO Market plugin for PayBox

Synthesized 2026-10-19 on branch `build/xo-paybox-plugin` from `docs/plan.md`, `docs/research-notes.md` and the 17 notes files in `docs/research/` (numbered 01 to 16 and 18; there is no 17). Each notes file was read together with its appended "Verification" section; where a researcher and a verifier disagree, the verifier wins unless I re-checked the primary source myself (section 1.3).

This file is a synthesis. It adds no new research except four primary-source spot checks I ran to settle contradictions between streams (listed in the Sources section). Nothing here was signed, paid or posted, and no PayBox tool was called.

## How to read this

Reference keys: `[01]` = `docs/research/01-xo-auth-signing.md`, `[02]` = `02-xo-read-api.md`, and so on up to `[18]`. "V" after a key means the Verification section of that file (for example `[01 V1]`).

Confidence tags:

- **H**: read in a primary source by a researcher and independently re-derived by a verifier (or by me).
- **M**: one pass at a primary source, a secondary source, or an inference.
- **L**: weak, stale, vendor-only, or unresolved.
- "NOT FOUND (searched: ...)" marks a documented absence. Absence from docs is not a prohibition and not a refusal.

Verdict vocabulary used for tiers:

- **go**: every step has a verified mechanism and the tier can be built and tested now with no third-party confirmation.
- **conditional-go**: a specified path exists and every step has a primary-source mechanism, but release depends on named confirmations or tests by XO, PayBox or the author that nobody has done yet. If a named condition fails, the tier becomes no-go.
- **no-go**: no verified path.

Files 15 and 18 have no independent Verification section (18 has its own adversarial self-review). Treat their numbers as researcher-level (M to H) and note that [15] section 10 still repeats the superseded "about 9 active XO markets" figure.

---

## 0. Bottom line (read this first)

1. **Nothing in the trade, funding or create path has been demonstrated end to end by anyone.** The XO bot's own README says live mode was never run with real funds [07], Predictefy says nothing has ever been submitted to XO through it [10 V, 14 V], and the Ghost Mode claim of a PayBox sign-then-submit mainnet run is unverifiable [05 V D]. Every v0.2 and v0.3 step is a specified mechanism, not an observed success. The XO half of signing is cryptographically verified (hashes and signatures recomputed with Foundry `cast`) [01 V, 07 V1]; the PayBox half is not.
2. **v0.1 (read) is buildable now and needs no secrets.** XO's Orderbook and Data APIs are public, CORS-open and cover all seven read tools [02]. The traps are listed in gate 9.
3. **The decisive unknowns are all external, and none can be tested read-only.** In order of how much they block:
   - Can a PayBox EVM wallet be the owner of an XO Kernel v3.1 smart account? Account creation is documented only through the beta.xo.market web app; no factory, salt, deployer or owner-change flow is documented [01 V3, 07 V2]. This blocks every write.
   - Is there a third-party funding route? Funding is UI-only in the docs, the provider is unnamed, and on-chain the only inbound path is a Hyperlane-style warp route from Base [03]. The plan's "bridge to chain 3223 from a PayBox proposal" has no documented XO endpoint, and PayBox does not list chain 3223 [06].
   - Will PayBox sign what XO needs, and does it need a passkey? The Kernel-wrapped typed data and the raw `userOpHash` are expressible as `typedData` and `raw` intents, but chain 3223 is absent from PayBox's catalog, and PayBox's own docs contradict each other on whether signing under an `autonomous` grant needs a passkey [06, 05 V B1].
   - Per-user XO API credentials (HMAC triplet) cannot live in a hosted Open Plugin: there is no per-user secret store, no user identity passed to plugin code, and a fresh sandbox per call [04, 06]. An author-operated relay is the likely shape, and whether PayBox's developer terms allow it is not known [04 V4].
   - Can the author upload and privately install a plugin at all? The Chapter 1 window closed 2026-10-17 20:00 New York; no non-entrant path is documented [06 V].
4. **Creation has a contract-level path, but it is revocable and sits outside the written terms.** `createConvictionMarket` is wired to the public role, costs a $1.00 non-refundable fee (585 of 585 on-chain fee events), and is paymaster-sponsored; markets then sit `PENDING` until XO's oracle approves (50.3% first-review approve, 40.8% update-required, 8.9% reject) [03 V]. ToS Annex A requires a Catalyst Badge and caps creation at one market per calendar week; the plan's 2 per day exceeds it [03].
5. **The plan's guardrail premise is wrong for the autonomous case.** A plugin cannot cap an agent that holds an `autonomous` PayBox grant, because `request_wallet_sign` carries no value field and the agent can call it directly [06]. Real enforcement points are the PayBox grant approval mode and an author-operated relay that holds the XO credentials.
6. **The multi-venue edge idea survives only as a read-only signal and alerting layer.** After 2026 fee curves, spreads and capital lock, no taker edge survived in 41 relationships at any horizon from 1 minute to 84 days [18]. Details in section 6.

### Tier verdicts

| Tier | Verdict | Exact blocker (short form; full text in section 3) |
|---|---|---|
| v0.1 read | **go** | None for building and local conformance. Shared blocker B0 (distribution) applies to hosted testing and release. |
| v0.2 funding + trading | **conditional-go** | Owner-EOA smart account (gate 3), a third-party funding route (gate 6), PayBox signing behaviour on chain-3223 domains and raw digests (gates 4, 8), and credential custody via a relay (gate 1). |
| v0.3 creation | **conditional-go** (lowest confidence) | Everything in v0.2 except funding, plus XO written permission for programmatic creation above the ToS limit, metadata hosting acceptance, and seed-order timing while the market is `PENDING`. |

### What is NOT established (blunt list)

- No third party has placed, cancelled or created anything on XO through an external signer. [07, 10 V]
- Whether `POST /order` and `DELETE /order` require L2 HMAC in addition to the order signature (strong hint: yes; treat as required) [01 V7].
- Whether `GET /auth/derive-api-key` returns the secret on repeat calls. The `ApiKeyTriplet` schema says the secret is "never returned again" while the same response schema and the official sample expect it. Evidence is balanced; confidence L [01 V1].
- Which HMAC canonical string the live server verifies (path only versus path with query), and which signature prefix the live gateway accepts (`0x00` versus `0x01 || validator`) [07 V5, 05 V B3-B4].
- The `CancelOrder` EIP-712 domain and types, the global-cancel encoding, and which order id form HMAC `DELETE /order` takes [01, 07 V1 D3].
- Minimum order size, share step and rounding (live `min_order_size` is "0") [01 V].
- Whether the order `nonce` must equal an on-chain counter [01 V missed 2].
- Whether `GET /balance-allowance?address=<owner EOA>` resolves to the smart account [02 V C1, 07 V2].
- Whether a capped (non-unlimited) allowance works for Enable Trading. XO's own flow is unlimited in 268 of 268 observed cases [03 V].
- Whether PayBox accepts `eip155:3223` anywhere, and whether the signing window shows anything meaningful for `Kernel(bytes32 hash)` [06].
- Whether autonomous grants sign `request_wallet_sign` or Open Plugin proposals without a passkey [04 V2.3, 05 V B1-B2, 06 V].
- The dispute window length and `resolutionPeriod` value; there is no "disputed" state in either XO API [02, 03].
- The Base-side funding router's code, fees and minimum; the end-to-end funding latency [03 V].
- Which XO fee figure is real: `/fee-rate` returns 0 even for a nonexistent token, while `effectiveFeeConfig` says 400 to 800 bps on many markets [02 V A7, 10 V3, 03 V6].
- Whether the trading-enabled approval state can be read without the keyed RPC (an explorer-log read is plausible but untested for this use).
- Whether any non-entrant can upload to the PayBox developer portal today [06 V].

---

## 1. Evidence base and contradictions resolved

### 1.1 Evidence base

| Stream | File | Independent verification | Reliability (per verifier) |
|---|---|---|---|
| XO auth and signing | [01] | yes | high |
| XO read API | [02] | yes | medium (one headline refuted) |
| XO lifecycle, funding, creation, policy | [03] | yes | medium (log aggregates truncated at 1000 rows, then re-pulled) |
| PayBox reference plugins A | [04] | yes | high |
| PayBox reference plugins B | [05] | yes | medium |
| PayBox platform | [06] | yes | high |
| XO bot reference | [07] | yes | high |
| Polymarket, Kalshi, Polymarket US | [08] | yes | medium |
| On-chain CLOB venues | [09] | yes | high |
| Aggregation landscape | [10] | yes | medium |
| Trueo | [11] | yes | high |
| Quotient | [12] | yes | medium |
| Local implementations | [13] | yes | medium |
| Platform of platforms | [14] | yes | not rated |
| Relationship taxonomy and literature | [15] | no | researcher only |
| Linking methods and services | [16] | yes | not rated; verifier says venue-field claims reliable |
| Correlation and lead-lag study | [18] | no (own adversarial review) | researcher only |

Time and freshness: all live data was taken on a machine clock reading 2026-10-18 UTC (one calendar day behind the harness date 2026-10-19) [08 V]. XO docs carry no publication dates; the privacy policy is dated 6/5/2025 (stale) and the ToS is undated [03]. Items flagged as older than six months are marked STALE where they appear.

### 1.2 Evidence caveats that affect every conclusion

- Many "absence" results rest on search budgets that ran out mid-task ([14], [15], [16], [09] verifiers). Those are "not found", not "does not exist".
- The explorer `getLogs` endpoint silently caps responses at 1000 rows, which truncated several researcher aggregates in [03]. Use the corrected numbers in [03 V].
- OpenAPI `security` annotations are wrong in both directions for XO (section 8, item 10). Trust live 401/200 behaviour and the authentication page.

### 1.3 Cross-stream contradictions and how I resolved them

| # | Contradiction | Resolution (primary evidence) |
|---|---|---|
| 1 | [10] says XO has 9 ACTIVE vs 1,322 CLOSED markets (capacity "tiny"); [16] and [02] say about 255 and 408 | Refuted. I re-ran the public Data API on 2026-10-18 18:58 UTC: default scope `statuses=ACTIVE` itemCount 9 (legacy AMM only); `marketType=2` 242; `marketType=4` 166; `marketType=2,4` 408; `marketScope=withClob` 255; type 4 all statuses 505. [10 V1] retracts the headline. The XO tradable surface is about 408 ACTIVE CLOB and Conviction markets plus a few Pulse rounds. [15] section 10 item 6 still carries the stale "about 9". |
| 2 | [02] summary says `GET /users/portfolio` is 200 "for any address" | The body and the verifier show 404 `User not found` for an unregistered address. The orderbook `/positions`, `/balance-allowance`, `/claimable` return 200 for any address. [02 V A1] |
| 3 | `github.com/xomarket` in the docs: [01 V4] says it appears 0 times in the docs; [07 V2.6] says the Orderbook API reference links the live OpenAPI spec to it | Primary check by me: `/api-reference/introduction.mdx` line 5 reads "generated from the live [OpenAPI spec](https://github.com/xomarket)". [01 V4] is wrong on that point. What stands: the account has 0 public repos, both mounted OpenAPI specs have `info.contact.url = https://beta.xo.market`, and the Rust samples use a closed crate. There is no public XO SDK. |
| 4 | Conviction (type 4) count: [02] 505; [03] first pass 274; [03 V] 585 | 585 on-chain creations (585 fee events, one for one) vs 505 in the Data API. The Data API says "Cancelled markets are omitted", which plausibly accounts for the gap (51 rejected plus owner-cancelled). The gap is an inference (M). |
| 5 | Paymaster scope: docs, [06 V], [07 V2.1] say only `redeemPositions` is documented as sponsored; [03] says on-chain allowlist covers more | On-chain wins for what the code allows (H, verified `PolicyPaymaster` source and logs): global `approve`, `setApprovalForAll`, `splitPosition`, `mergePositions`, `safeTransferFrom`, USDC.e `transfer`, `createConvictionMarket`, `respondToUpdateRequest`, `cancelMarket`, `redeemPositions`; any sender; 10,000 per day per sender; the Hyperlane route's `transferRemote` is not allowlisted [03 V8]. Demonstrated only for accounts created in the XO app; acceptance of a foreign account is untested. |
| 6 | Does derive return the secret? [01] first said M | [01 V1] corrects to L: three statements say never returned again, three artifacts expect it. Plan for storing the triplet. |
| 7 | Do autonomous grants auto-sign? [04] "documented NO", [05]/[06] "pending_signature" | Unresolved. The "money tools always pause" sentence is scoped to first-party plugins [04 V2.3, 05 V B2]; `docs.paybox.sh/concepts/model` says signing needs a fresh passkey "regardless of mode"; the live `world` contract says autonomous returns `pending_signature` [06]. Design for both outcomes. |
| 8 | Funding source chains: plan and press say Base, Ethereum, BNB; [06] first said "XO's documented bridge" | On-chain: 100% Base (9,645 of 9,645 inbound, 8,821 of 8,821 outbound). No bridge contract, ABI or deposit API is documented. [06 V] and [03 V] supersede. |
| 9 | XO fee truth | `/fee-rate` returns 0 for 30 of 30 real tokens and for a nonexistent token, so 0 is probably a default. Data API `effectiveFeeConfig` shows takerFeeBps 400 (16 of 25 sampled), 800 (1), 0 (8). Fail closed: use the larger figure until a real fill reconciles it. [03 V6, 10 V3, 02 V A7] |
| 10 | Gate 9 status: [02] and [10] answered-go; [07] and [13] partial | The gate is conditional on the Data API being restricted. It is not, so the fallback is not needed. I score answered-go with residuals. |
| 11 | Quotient: [05] says it could not be identified; [05 V A1] and [12] identify it | Quotient is a real forecast and signal API (x402 on Base, or API key). |
| 12 | Quotient edge: [12] first said "real" | [12 V] shows the Brier edge is not distinguishable from zero outside the final day (+0.00089, CI -0.0018 to +0.0036 when same-day forecasts are dropped). |
| 13 | Gate 8 "answered-go" in [01] and [05] | Both downgraded to partial by their verifiers; [04], [06], [07], [08], [09], [11], [12] all say partial. Final: partial. |
| 14 | "No user identity reaches plugin code" tagged H in [04] and [06] | Only the wallet id is documented as not sent. Downgraded to M for anything broader; remote plugins are a separate class [04 V2.1, 06 V]. |
| 15 | "Trueo equals True Markets" in [10] and [11] | Partly refuted: truemarkets.co is an unrelated trading-API company; only the old name of the protocol is shared [11 V R1]. |

---

## 2. The nine gates

### Gate 1. Auth and credentials: **partial**

**Answer.** The XO side is fully specified; custody of per-user secrets is the open problem.

- Two layers [01 a, b; 01 V; 07]. L1 is a ClobAuth EIP-712 signature (domain `ClobAuthDomain`, version 1, chain 3223, no verifying contract) wrapped in the account's Kernel domain; it mints or derives an `{apiKey, secret, passphrase}` triplet. L2 is HMAC-SHA256 over timestamp, method, path and body; every private REST route and `WS /ws/user` needs it. Live headers are `XO_*` (the OpenAPI text saying `POLY_*` is stale). Measured L1 timestamp window is about plus or minus 120 seconds; the L2 window is plus or minus 30 seconds.
- Reads need nothing [02]. Private routes that returned 401 live without L2: `/orders`, `/data/orders`, `/data/order/{id}`, `/trades`, `/data/trades`, `/auth/api-keys`. Treat `POST /order` and `DELETE /order` as L2-required even though the OpenAPI shows no security on them [01 V7].
- A stolen triplet cannot place orders (orders need the owner signature), so it is a privacy and griefing risk, not theft (M, reasoning) [01 f].
- The hosted Open Plugin has no per-user secret store: env vars are plugin-wide and "non-sensitive", brokered headers are owner-level and shared by all installers, every call is a fresh sandbox, and PayBox does not send the wallet id to plugin code [04 6, 06 2, 06 8]. A per-request HMAC cannot use brokered headers.
- Options table [01 f, 06 8, 05 V F]:
  - A, stateless derive per call: **not safe as a default** until XO says derive re-returns the secret; also each call needs a PayBox signature, and human approval latency can exceed the 120-second L1 window.
  - B, per-user encrypted store in an author-operated service (relay): works today, keyed by smart account with ownership proven by a signature; the operator becomes custodian of HMAC credentials (not funds).
  - C, PayBox `request_secret` with `raw: false` returns a one-time `secret_token` for mediated egress; how a plugin redeems it is NOT FOUND, and `raw: true` puts the secret in model context. Unusable as documented.
  - D, plugin-wide env vars: rejected (one key for all users).
  - E, avoid L2: unlikely to work.
  - F, remote OAuth plugin (a class exists in the platform; third-party registration undocumented) [04 V2.1, 06 7].
- New risk: **key lockout**. If the secret is shown once and is lost, new keys are capped by an unknown `MAX_KEYS_PER_USER`, and freeing a slot needs `DELETE /auth/api-key`, which the OpenAPI puts on L2 (needs the lost secret) while the prose says L1 [01 V2].

**Evidence.** [01 §0, a, b, f, V1, V2, V7], [04 §6, V2.1], [06 §2, §8, V], [05 V F], [07 V1], [02 §0, §1].

**Residual unknowns.**
- Does derive return the secret every call? Numeric `MAX_KEYS_PER_USER`? Is `DELETE /auth/api-key` L1 or L2? Key expiry, rotation, scopes, read-only keys: all NOT FOUND (searched the docs tree and OpenAPI).
- HMAC canonical string (path only versus path with query), secret base64 decoding and output padding: NOT FOUND in XO docs (community code decodes the secret and keeps `=` padding; one client defaults to path-only, labelled "Live XO compatibility") [05 V B4, 07 V1 D7].
- Whether PayBox's developer terms allow an author-operated service that holds users' XO credentials ("prohibited code that ... misuses user credentials, wallet keys, or secrets") [04 V4.2].

### Gate 2. Order flow: **partial** (downgraded from answered-go)

**Answer.** Orders are EIP-712 payloads POSTed to `POST /order` (batch `POST /orders`, up to 100). The pattern `xo_prepare_order` (plugin, read-only) then `request_wallet_sign` (agent) then `xo_submit_order` (plugin or relay) is mechanically sound, because the order hash and the Kernel-wrapped digest are pure functions of the order fields, so submit can recompute the digest and `ecrecover` the returned signature against the expected owner before posting.

- Verified wire facts [01 c, 01 V, 07 §4, 07 V1]: order domain `XO Market CLOB` version 1 chain 3223; 13 signed fields; `signatureType` 3 only (EOA type 0 is not accepted, despite OpenAPI text saying otherwise); maker equals signer equals the smart account; the Kernel wrap is exactly standard EIP-712 typed data `Kernel(bytes32 hash)` under domain `Kernel`, version `0.3.1`, chain 3223, verifying contract equal to the smart account; wire signature `0x01 || validator(20 bytes) || ecdsa(65 bytes)`, 86 bytes. Golden vectors for order hashes, wrapped digest, ClobAuth and HMAC were recomputed independently and matched, and a `signTypedData` signature was byte-identical to a signature over the hand-derived digest [07 V1].
- Taker orders block for at least 500 ms (3 s for live sports); 1 s is the researcher's margin, not a documented figure [01 V5].
- Duplicate protection: a 400 `duplicate order` proves the first submit is resting; absence of that error after a lost response does not make a blind retry safe. Never auto-retry after an ambiguous write; reconcile by order hash [07 V2.3].
- **Signed orders are long-lived bearer instruments.** The signature has no timestamp, and `expiration = 0` means never. Every plugin-originated order should be GTD with a short, non-zero expiration inside the signed hash, and quotes need a TTL [01 V missed 1].
- **The order `nonce` is probably not a free field.** The docs say it is "used for on-chain cancellation"; in the upstream CTF Exchange the nonce must equal the maker's on-chain counter. Hard-coding 0 is only safe while the account's counter is 0 [01 V missed 2].

**Evidence.** [01 c, V6-V7], [07 §2-§6, V1-V2], [06 §4, §6], [04 §10].

**Residual unknowns.** Live acceptance of the whole flow (nobody has done it); prefix `0x00` versus `0x01||validator` (the TUI client returns `0x00`; XO docs say `0x01||validator`; follow the docs and test); HMAC mode; minimum size and rounding; order `nonce` semantics; `CancelOrder` typed data; cancel id form; whether `POST /order` needs L2. PayBox side: gate 8.

### Gate 3. Smart wallet ownership: **partial**

**Answer.** In principle any EOA can own a Kernel v3.1 account: the ECDSA validator takes any non-zero 20-byte owner (Kernel source read), and XO docs describe the owner as "external or embedded" [01 e, 05 V E]. What is not established is any route for a PayBox MPC wallet to become that owner.

- Documented creation path: "Create an XO smart account at beta.xo.market." That is the only documented path, not a proof that it is the only path [01 V3].
- NOT FOUND (searched privy, zerodev, kernel, factory, create2, counterfactual, deploy, owner wallet, programmatic): factory, implementation, initData, salt or index, who deploys, owner change, programmatic creation [01 V, 07 V6].
- A documented lead: `smart_account` appears in `GET /balance-allowance` ("null for plain EOA users with no smart account"), which suggests an address-to-account lookup. Untested with a real owner and account pair [02 V C1, 07 V2.2].
- `isValidSignature` reverts unless the validator in the signature prefix is installed on the account, so `0x01||0x845A...` works only for accounts with the ECDSA validator installed [01 V].
- The order endpoint describes the account type as "XO Privy/ZeroDev smart accounts", so the common owner is a Privy embedded wallet [07 V2.2].
- Unknown whether XO's bundler, paymaster and orderbook accept a Kernel account that was not created in the XO app, because XO appears to keep a backend registry (`owner` UUID, `smart_account` field) [03 §12, 01 e].
- Blockers named by the research: sign-up at beta.xo.market with the PayBox address as external owner (needs a way for a non-browser wallet to complete the login), XO provisioning, or an owner-change UserOp (undocumented).

**Evidence.** [01 e, V3, V10, V12], [02 V C1], [07 V2.2], [05 V E], [03 §4.2, §12].

**Residual unknowns.** Everything in the bullet list above. The RPC `api_key` and the paymaster address are "from onboarding" per the docs, so the docs themselves point to an XO contact for any integrator.

### Gate 4. Chain 3223 support and gas: **partial**

**Answer.** The question is largely reframed by what XO actually requires. Orders need no chain transaction. XO's on-chain actions (Enable Trading approvals, redeem, split and merge, market creation) are ERC-4337 v0.7 UserOperations from the smart account through XO's bundler, signed by the owner with raw ECDSA over `userOpHash`. They are not EOA transactions and cannot be `io.paybox/transactionProposal` objects on chain 3223.

- PayBox side: chain 3223 is absent from the 11-entry `discover_tokens` chain catalog (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid); the catalog is "not a support allowlist"; the dev guide requires an EVM proposal's "selected network must be available in PayBox"; the behaviour for an unsupported chain is NOT FOUND [06 5, 06 V]. `discover_tokens` search on any unknown chain id returns an empty list without error, so that response says nothing either way [06 V]. For `typedData` the only chain PayBox can read is `domain.chainId`, so a policy denial for 3223 is plausible but unevidenced [06 V].
- One EVM MPC wallet shares one address across every `eip155:*` chain, so the same owner address works on 3223 if signing is permitted [06 4, 04 V2.7].
- Gas: Open Plugin proposals have the EOA pay native gas and have no sponsor field [04 5, 06 3]. For XO the paymaster is a verified `PolicyPaymaster` that sponsors any sender within an allowlist and a 10,000 per day cap, with empty `paymasterData` [03 §4.3, 03 V8]. The docs name only `redeemPositions` as sponsored [07 V2.1]; the code allows more (section 1.3, item 5).
- Enable Trading is observed on-chain as an unlimited USDC.e `approve` plus `setApprovalForAll` to the CTF Exchange, 268 of 268 [03 V]. Whether a capped allowance works is NOT FOUND. The plan's preference for capped allowances is untested.
- Testnet: the chain 1000101 exists with an explorer, but docs say "XO operates a single public production environment" and no testnet orderbook, bundler or API host is documented [03 §4.1, 01 V].
- Native XO acquisition for an external EOA: NOT FOUND. A plain EOA cannot trade at all (signature type 3 only).
- Reading on-chain state (nonce, approvals, `payoutDenominator`, `resolutionPeriod`) needs `eth_call`, and the mainnet RPC needs a private `api_key` in the query string, which PayBox cannot broker [02 §0, 06 2].
- Bridging to 3223 via `request_swap`: no evidence it works and it cannot be tested without a money tool [06 5].

**Evidence.** [06 §3, §5, V], [03 §4, V8], [02 §0], [01 e], [04 V2.7].

**Residual unknowns.** Whether `typedData` with chainId 3223 and a foreign `verifyingContract`, and `raw` with a bare 32-byte digest, are accepted; how the signing window renders them; whether the XO bundler accepts a foreign Kernel account; how the UserOp nonce and gas fields are obtained without the keyed RPC; whether the paymaster policy stays stable (owner-controlled, can be paused or narrowed at any time).

### Gate 5. Market creation: **partial**

**Answer.** No API endpoint creates a market (both OpenAPI path lists checked). A contract-level path exists and is the same function the XO app uses.

- `XOClobMarketManager.createConvictionMarket(startsAt, expiresAt, collateral, metaDataURI)` is "`restricted` but wired to `PUBLIC_ROLE`, so in practice open to everyone" [03 §2.4, 03 V]. Fee is $1.00, non-refundable under every outcome (585 of 585 on-chain fee events equal 1,000,000 raw). The caller needs a USDC.e allowance to the manager. Calls are paymaster-allowlisted.
- Every market starts `PENDING`; only XO's oracle can `APPROVE`, `REJECT` or `UPDATE_REQUIRED`. First-review outcomes over all 585: approve 50.3%, update-required 40.8%, reject 8.9%, none yet 14; latency median 9.9 min, p90 166 min, max 652 min [03 V3]. Budget the fee per attempt, not per live market.
- The contract has no seed minimum, no badge check and no weekly limit; those are app and ToS rules [03 §2.4]. ToS Annex A requires 500 Conviction Points, a 7 to 10 day login streak and a linked social account (the Catalyst Badge), a maximum of one market per calendar week, and admin review [03 §2.3]. On-chain, 132 creators exist and one created 14 markets in a day, so the limit is not technically enforced [03 §2.5].
- A cheaper trusted path exists for XO itself: `createConvictionMarketFor` (no fee, role 73) [03 §2.4]. This suggests asking XO for a partner or sponsored creation endpoint.
- XO can close the selector by re-pointing one role assignment, with no upgrade, at any time [03 §2.4].
- Metadata: the observed target is an XO-owned storage bucket with a JSON schema (title, description, category, tags, outcomes, rules, resolution sources). A documented upload route for creators does not exist; whether the oracle accepts a creator-hosted URI is unknown [03 §2.6].
- Seed order timing: the orderbook rejects non-active markets (`422 market is not active (status: Pending)`), yet the app says it submits the seed GTC right after creation. Unresolved [03 §2.6].
- Eligibility notes: markets in the sampled Data API are `MANUAL` resolution with a creator-specified resolver; on-chain every market's resolver is a single XO oracle [10 V10, 03 §8.3].
- The 20% creator fee share appears only in `what-is-xo.mdx`; on-chain `creatorFeeBps = 0` ("fees not supported yet") for all Conviction and CLOB creations (early Pulse emitted 200 bps) [03 V5]. Do not promise creator income.

**Evidence.** [03 §2, §9-§10, V1, V3, V5], [02 V A8], [07 V4].

**Residual unknowns.** Everything XO would have to say yes to: badge requirement for a PayBox-owned account, weekly limit versus the plan's 2 per day, metadata hosting and schema, seed timing, review SLA, handling of `UPDATE_REQUIRED`, whether agent-created markets are acceptable, topic rules, and permission to keep calling a selector XO can close.

### Gate 6. Funding: **partial** (release-blocking; no supported path exists today)

**Answer.** Funding is UI-only in the docs, provider-mediated, and on-chain it is a single-chain warp route.

- Docs [03 §3.1, 06 V, 10 V4]: three in-app routes (connect an external EVM or Solana wallet and let XO quote through "the funding provider"; transfer crypto to a per-account deposit address watched by "the provider"; pay with cash), all crediting USDC to the XO smart wallet. The provider name, supported assets and networks, minimums, fees and latency are NOT FOUND. There is no documented bridge contract, ABI or deposit API. Depositing into the external owner wallet does not make the smart wallet tradable.
- On-chain [03 V]: the collateral "Bridged USDC (XO)" (symbol USDC.e, 6 decimals) is minted by a Hyperlane-style route; 9,645 of 9,645 inbound and 8,821 of 8,821 outbound transfers are to or from Base (domain 8453); recipient is the XO smart account; the XO-side `HypFiatToken` implementation is fully verified with a readable ABI (`transferRemote(uint32,bytes32,uint256)` payable, `quoteTransferRemote`, `feeHook`, `interchainSecurityModule`). The Base-side router was derived from Hyperlane `Process` events and its code could not be verified (Base explorers returned 403). A route-level fee hook exists; its value is unread.
- Withdrawals look service-mediated (a direct call from a non-contract sender to an XO-side contract), and the route's `transferRemote` is not in the paymaster allowlist, so withdrawals are not obviously gasless for the user [03 §3.2, §4.3].
- PayBox side: `request_swap` with a destination chain only routes through MoonX and 3223 is not in the catalog; assume unsupported (M) [06 5]. Open Plugin proposals carry exactly one call, so approve plus bridge is two proposals and two approvals [04 5, 06 3].
- Deposit-time warnings: do not start a second transfer while one is pending; "Withdrawn" is not terminal; a "Tainted" state means flagged during screening and do not retry; wrong-network transfers may be unrecoverable [03 §3.1].

**Evidence.** [03 §3, §9, V2, V4], [06 §5, V], [10 V4], [04 §5, §9], [07 §2.10].

**Residual unknowns.** Whether XO will support a third-party deposit route at all; the Base router address, ABI, fees, minimum, latency and screening rules; whether a provider deposit address can be fetched programmatically; withdrawal signing flow and gas.

### Gate 7. Terms, bots, jurisdictions: **partial**

**Answer.** Nothing bans bots, but several clauses constrain what the author's own decisions allow.

- XO bots clause: "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system." No bot page, no KYC page; the Boarding Pass terms treat bots as a sybil signal (campaign-scoped) [03 §5, V9].
- Wash trading ("trades with yourself or colluding with others to create artificial activity or false liquidity"), market manipulation, one account per user, and VPN, proxy or Tor masking are prohibited. The ToS also bars trading "where you have direct or indirect influence over the outcome of a market"; every sampled market is `MANUAL` resolution with a creator-specified resolver, so a creator trading its own market is exposed to this clause as well [10 V10].
- The orderbook has self-trade prevention: self-matches cancel and earn no maker rebate [03 §5]. The plan's "self-trading always allowed" therefore cannot be executed against the account's own resting orders. The author's decision stands; the tool-level mark-and-log is still valid; the exposure is XO's enforcement (suspension, halted or invalidated markets), not only regulation [03 §5, 07 V4].
- Restricted regions: the US, UK, France, Singapore, Ontario and sanctioned territories; enforced by an IP check at login and transaction time. A hosted plugin's or relay's egress IP matters and cannot be hard-coded around (defer to XO's live check, as the plan says) [03 §5].
- Creator rules (badge, one per week, admin review, $1 non-refundable fee, seed of at least $10, indemnity for creation harm) conflict with the plan's 2 per day [03 §2.3, §5].
- Regulators: the CFTC advisory of 2026-02-25 (Release 9185-26) is real and silent on bots and arbitrage; the 2026-03-23 Polymarket and Kalshi rule changes are verified at secondary level [15 §9, 10 V]. Polymarket US Rulebook (2026.09.30) Rule 5.2(i) requires pre-trade risk controls for automated systems; no equivalent XO rule exists.
- PayBox portal side: MoonPay KYC where applicable (PayBox email must match KYC email), 18+, sanctions exclusion, one project per participant, a perpetual irrevocable license to the submission, and prohibited credential-misuse code [04 V4.1-4.2].
- The privacy policy (6/5/2025) is stale; the ToS is undated; terms can change with or without notice.

**Evidence.** [03 §5, V9], [10 V10], [07 V4], [04 V4], [15 §9], [08 §8, V].

**Residual unknowns.** Whether XO treats agent-operated accounts and market-maker programme participants differently (the maker-rebate page says external makers may participate with no whitelist and subject to screening); which jurisdiction the operator and the relay sit in.

### Gate 8. Sign-then-submit: **partial** (downgraded from answered-go)

**Answer.** Plugin-internal sign-then-submit is no-go: there is no proposal kind for signatures ("Do not include ... signatures"), plugins cannot call PayBox tools, and the sandbox ends before approval and is not resumed [04 §10, 06 §6]. The agent-orchestrated pattern (plugin prepare, then `request_wallet_sign` with `typedData` or `raw`, then plugin submit with the signature) is supported by PayBox primitives and documented, but not demonstrated.

- `request_wallet_sign` takes `{credential_id, intent}` with `op` in `message`, `typedData`, `transaction`, `authorization`, `solanaMessage`, `solanaTransaction`, `raw`. It returns a signature without broadcasting. It has no `chain` and no `value_cents` field, so grant spend policy cannot evaluate it [06 §4].
- For XO the intents are `typedData` for orders and ClobAuth (the Kernel wrapper) and `raw` for `userOpHash` [01 e, 06 §6]. Each order costs one PayBox signature; a batch costs N.
- Because `submit` cannot trust the model to relay faithfully, it must recompute the digest and check `ecrecover` equals the expected owner before posting [06 §6, 01 design].
- Autonomous grants: unresolved and internally contradicted (section 1.3, item 7). `autonomous` returns `pending_signature` (no human) per the tool text and the `world` contract; `concepts/model` says signing needs a fresh passkey "regardless of mode". A signing window or a paired `pbxk1.` SDK key is still needed to produce the artifact, so a headless OAuth-only agent host cannot sign [05 V B1, 06 §4].
- The `Kernel(bytes32 hash)` payload is opaque; neither PayBox nor an approver can see order amounts unless the signing window decodes it (NOT FOUND) [06 §4, §11].
- Timing: an order signature has no timestamp, so it survives human-approval latency, but that is also the danger (bearer instrument; use short GTD). L1 has a 120-second window, so re-deriving credentials per call after a human approval is awkward [01 V missed 1, 06 §8].

**Evidence.** [06 §4, §6, V], [04 §10, V2.3-V2.4], [05 V B1-B2, E], [01 e, V6-V7].

**Residual unknowns.** Autonomous behaviour for `request_wallet_sign` and for Open Plugin proposals; how the signing window renders typed data and raw digests; whether a chain-3223 domain is denied by grant policy; whether PayBox verifies the sender of an EVM proposal [04 V3]; the Ghost Mode mainnet claim (unverifiable).

### Gate 9. Read-side fallback: **answered-go**

**Answer.** The plan's premise ("if the Data API is restricted") is false: both hosts are public, unauthenticated and CORS-open, so no fallback is needed for v0.1. Hosts: Orderbook `https://orderbooks.xo.market`, Data API `https://api-mainnet.xo.market/api`. I confirmed the Data API is live and unauthenticated with the counts in section 1.3.

Seven traps to build around [02 §0, 02 V]:
- Discovery must use `marketType=2,4`. The default scope returns only the 9 legacy AMM markets; `onlyClob` excludes type 4 (the Conviction product, 166 ACTIVE of 505); type 3 (Pulse, 44,060 rows) floods the catalogue.
- `take` max is 50 (the spec says 1000). `categories` filters after pagination, rows can be hidden after `itemCount`, so page on `meta.hasNextPage` only.
- Data API prices are micro-units ("670000" is 0.67). List `currentPrice` is a display price (mid when spread is at most 0.10, else last trade). **Detail routes return a constant "500000" for both outcomes**, so never quote either as a price; use the orderbook (`GET /book`, `/price` where BUY is the best bid and SELL the best ask). Book sizes are decimal strings with up to 6 decimals.
- Outcome index 0 is the "Yes" slot and index 1 the "No" slot even for team-named markets. `winningOutcomeId` is an outcome row id, not an index. `CLOSED` always has a winner in practice (2,393 of 2,393 reachable rows); `RESOLVED` is a short provisional window; `VOIDED` and `VOIDED_CLOSED` exist with no winner; there is no disputed state.
- Cloudflare returns 403 to the default Python-urllib User-Agent; send an explicit UA. A Data API 429 body is `{"statusCode":429,"message":"Rate limit exceeded",...}`.
- `/users/portfolio` returns 404 for an unregistered address; handle 404 as "no XO profile". Orderbook `/positions`, `/balance-allowance`, `/claimable` answer 200 for any address; positions are in micro-shares.
- `/fee-rate` is unreliable (section 1.3, item 9); quote fees from `effectiveFeeConfig`, and fail closed on disagreement.

Explorer: `explorer-mainnet.xo.market` answers public Blockscout REST (`/api/v2/...` and the etherscan-style `getLogs`, capped at 1000 rows) [03 §0, §4.1]. It is not an XO-documented host and its GraphQL endpoint was not probed. It is the likeliest read-only source for the trading-enabled flag (Approval and ApprovalForAll logs for the owner account), which the REST APIs cannot return (`allowance` on `/balance-allowance` was read as available cash in [02 §0.8], but that reading is unverified: it is 0 on every funded wallet sampled, see Q19; it is not the ERC-20 approval either). Untested for that purpose (M).

**Evidence.** [02 §0-§3, V], [03 §0, §4.1], [10 V1, V9], [07 V2.5], [13 V B1] (local Blockscout clients exist for other chains).

**Residual unknowns.** Whether `address=<owner EOA>` resolves to a smart account; which address kind `creator.walletPublicKey` carries (and the creator fields are constant across type 2 rows, so a "self-created market" flag is not derivable for those); whether the PayBox sandbox fetch sends a User-Agent Cloudflare accepts and whether GET-with-body calls work there; the populated shape of `/users/portfolio`.

---

## 3. Tier verdicts under the author's must-have decisions

Decisions held fixed: own Open Plugin; self-trading allowed; release needs read plus trade plus create plus funding; caps $10 per order, $50 per day, 2 markets per day; the plugin must handle funding; no browser automation; no "draft plus link" substitute for creation.

### 3.0 Shared blockers (apply to every tier)

- **B0 Distribution.** PayBox portal Chapter 1 closed 2026-10-17 20:00 New York; "You cannot upload another file, submit or withdraw a version, or delete your entry after the deadline." Publication needs manual approval of every version at MoonPay's sole discretion; the marketplace is not publicly open; private agent-side install requires "Submit Project". The landing page promises a new mission each month ("every full moon" in `llms.txt`), but no next date and no non-entrant path is published [06 §2, V; 04 V4.3]. Local build and conformance work anytime, and hosted Test runs work before Submit [06 V].
- **B1 Credential custody.** A hosted bundle cannot hold per-user HMAC credentials (gate 1).
- **B2 Caps are not a boundary** against an agent that can call `request_wallet_sign` directly under an autonomous grant [06 §0.6, §10].
- **B3 Terms exposure** (gate 7): wash-trading, influence, geo and the creation limit.

### 3.1 v0.1 read: **go**

- **Blocker.** None for build. B0 applies to hosted testing and release.
- **Recommended path.** Build `xo_search`, `xo_get_markets`, `xo_get_market`, `xo_orderbook`, `xo_market_prices`, `xo_positions`, `xo_account` against the public APIs using the traps in gate 9. Allowlist only `orderbooks.xo.market` and `api-mainnet.xo.market` (two of 16 hosts). Return titles and descriptions as labelled untrusted data. Keep the whole call under 10 s (target about 4 s per fetch). Record fixtures from `docs/research/fixtures/xo/`. Use the starter 1.0.2 files from the portal (not a GitHub repo) and its local conformance checks as the acceptance test [04 §2, §8, §11].
- **Corrections to scope.** `xo_account` cannot return a trading-enabled flag from REST (explorer-log read is the candidate, untested); the self-created-market flag is unreliable for type 2 and unverified for type 4; `xo_search` is a title-only substring match; do not use detail-route prices.
- **Tool design.** Remember that Open Plugin proposal fields exclude `value_cents` and slippage; read tools need no proposals at all [04 §5].

### 3.2 v0.2 funding + trading: **conditional-go**

- **Exact blockers.**
  1. A PayBox wallet must own an XO account XO's stack accepts (gate 3). Failure means no writes at all.
  2. A supported third-party funding route exists (gate 6). Failure means the "plugin must handle funding" decision cannot be met.
  3. PayBox must sign the Kernel typed data and the raw `userOpHash` for chain-3223 domains, and the autonomous-grant behaviour must be known (gates 4, 8).
  4. Per-user credential custody (gate 1) and the ambiguities XO must answer: L2 on POST, derive, HMAC mode, cancel typed data, order `nonce`, minimums.
  5. B0.
- **Recommended path.** (a) Send XO the questions in section 4.1 first, answers to Q1 to Q6 gate everything. (b) Run the PayBox zero-value tests in section 4.3 on a throwaway credential. (c) Design now, behind interfaces, for the relay architecture: plugin tools `prepare` and `submit`, an author-operated relay that holds triplets keyed by smart account (ownership proven by signature), enforces the $10 per order and $50 per day caps at submit time, recomputes the digest and `ecrecover`s before posting, and builds and submits UserOps to the XO bundler. Treat relay-side caps as advisory against an autonomous agent (B2). (d) Orders: GTD with a short expiration, integer math only, pinned constants, digest recompute. Enable Trading and redeem: UserOps signed with `raw`, not proposals. Cancel: HMAC single-order form only until XO documents the typed data. (e) Funding: Base proposals only (section 4.4), after XO confirms the router.
- **Not recommended.** Stateless derive as default; proposals for Enable Trading or redeem; claiming caps that hold under an autonomous grant.

### 3.3 v0.3 creation: **conditional-go** (lowest confidence)

- **Exact blockers.** All v0.2 items except funding, plus:
  1. XO permission. A badge holder creating at most one market per calendar week is within the written ToS; the plan's up-to-2-per-day is not, and XO can close the selector or reject each market at review (about 9% reject, 41% update-required).
  2. Metadata hosting and schema acceptance (no documented upload path).
  3. Seed-order timing while the market is `PENDING` (the orderbook returns 422).
  4. Foreign-account acceptance by bundler and paymaster.
- **Recommended path.** Implement `xo_validate_market_draft` (free lint) and `xo_create_market` behind an env flag that defaults off and a default of one creation per week, with the 2-per-day figure as the configurable ceiling the author chose. The creation call is one UserOp batch (fee `approve` to the manager, then `createConvictionMarket`), both calls inside the paymaster allowlist, signed with `raw` over `userOpHash` and submitted to XO's bundler [03 §2.4, §4.3]. Then wait for review, handle `UPDATE_REQUIRED` via `respondToUpdateRequest`, and place the seed order only when the market is `ACTIVE`. Ask XO for written permission and for a partner route (section 4.1, Q13 to Q17). Do not enable on mainnet without that permission. Budget $1 per attempt plus a seed of at least $10 per live market; see the cap delta in section 7.
- **Not offered.** Browser automation and "draft plus link" substitutes, per the author's decision.

---

## 4. Recommended paths for the release-blocking unknowns

### 4.1 XO partnership ask (questions to send to the XO onboarding channel)

Priority 1 (everything depends on these):
- **Q1.** Can a Kernel v3.1 smart account be created or provisioned with an external EOA that we specify (a PayBox MPC wallet, which can sign messages and typed data but cannot drive a browser extension) as the ECDSA-validator owner? Via what exact sign-up method? Is there an owner-rotation operation?
- **Q2.** What are the factory, implementation, init data and salt or index, so a client can derive the account address and confirm `smart_account` resolution? Does the orderbook, bundler and paymaster accept accounts not created in the XO app?
- **Q3.** Does `POST /order` (and `DELETE /order`) require L2 HMAC in addition to the order signature?
- **Q4.** Does `GET /auth/derive-api-key` return `secret` and `passphrase` on every call? What is `MAX_KEYS_PER_USER`? Is `DELETE /auth/api-key` L1 or L2? Do keys expire; are read-only or scoped keys available?
- **Q5.** Is there a supported third-party funding route: the Base-side router address, ABI, fees (`quoteTransferRemote`), minimums, latency, screening ("Tainted") behaviour, and a programmatic way to fetch a provider deposit address? What is the withdrawal signing flow, destination restriction and gas?
- **Q6.** How can integrators get the RPC `api_key` and paymaster address, and can state reads (nonce, approvals, `payoutDenominator`) be served without a keyed query-string credential?

Priority 2 (needed to ship trading correctly):
- **Q7.** The exact HMAC canonical string (path only or with query), secret base64 decoding and output padding, and a golden test vector. Header names `XO_*` versus `POLY_*`.
- **Q8.** Signature prefix: `0x01||validator||sig` versus `0x00||sig`; ERC-6492 for undeployed accounts; when the account is deployed.
- **Q9.** The `CancelOrder` EIP-712 domain and types (Kernel-wrapped?), global-cancel encoding, which id form HMAC `DELETE /order` accepts, and whether batch and cancel-all accept HMAC only.
- **Q10.** Order `nonce` semantics (uint128; on-chain equality?), minimum size and notional, share step and rounding.
- **Q11.** Fee truth: why `/fee-rate` returns 0 while `effectiveFeeConfig` says 400 to 800 bps; which is authoritative, and when it is charged.
- **Q12.** Is a capped allowance sufficient for Enable Trading? Is a testnet (chain 1000101) available to integrators with orderbook, bundler and API hosts?

Priority 3 (creation):
- **Q13.** Written permission for programmatic `createConvictionMarket` by an agent-operated account: Catalyst Badge handling, the weekly limit versus the plan's ceiling, topic rules, and acceptable agent-generated content.
- **Q14.** Accepted `metaDataURI` hosting and schema; is there an upload API?
- **Q15.** Seed-order timing while a market is `PENDING`; is the $10 seed enforced anywhere but the app; review SLA; handling of `UPDATE_REQUIRED`.
- **Q16.** Could XO expose `createConvictionMarketFor` (no fee, role 73) or a sponsored creation endpoint to a partner, and will the selector stay open?
- **Q17.** Is the 20% creator fee share real (on-chain `creatorFeeBps` is 0)?

Read-API reconciliation (added after the post-build review):
- **Q19.** What does `GET /balance-allowance`'s `allowance` field mean? The field schema says "available cash after open-order reservations" and the endpoint text says "exchange allowance", but live it was `0` on every funded wallet sampled (15 of 15, balances from $1.50 to $9,005), including wallets with no visible resting buy order, so it cannot be available cash and is not the unlimited ERC-20 approval either. Which on-chain quantity is it, and is there a field that does carry available cash? Until a wallet with a known resting order reconciles it, `xo_account` returns it raw and flagged `unverified` and derives no available or reserved cash.

Policy:
- **Q18.** Bot and agent policy for autonomous trading and creation; how the wash-trading and influence clauses apply to a creator trading its own market; self-trade-prevention behaviour; the geo check on a hosted plugin's or relay's egress IP; stability of the paymaster allowlist and daily limit; resolution period and dispute process.

### 4.2 PayBox and MoonPay contact ask

- **P1.** Can an account that did not enter Chapter 1 upload, submit and privately install a plugin now? Next Chapter date and public marketplace date? Review turnaround?
- **P2.** Can a third party register a remote (URL-based, OAuth) plugin? Can it return `io.paybox/transactionProposal`, and does it receive any user identity?
- **P3.** Does a zero-value `evm` proposal on `eip155:3223` pass "Validate transaction"? Does `request_wallet_sign` `typedData` with chainId 3223 and a foreign `verifyingContract`, and `raw` with a 32-byte digest, work? Do grants carry chain allowlists?
- **P4.** For Open Plugin proposals and for `request_wallet_sign`, does an `autonomous` grant return `pending_approval` or `pending_signature`? What is the passkey "threshold"?
- **P5.** How does the signing window render `typedData` and raw digests? Can a plugin attach a human-readable summary for non-transaction signatures?
- **P6.** Is an author-operated service that holds users' third-party API credentials acceptable under the developer terms? Is there a supported way for plugin code to redeem a `request_secret` token or receive a stable per-user identity? Can brokered credentials go in a query string?
- **P7.** Do end-user calls count toward the 1 start per second and 1,000 starts per rolling 24 hours allowance? Is the EVM sender verified against the selected wallet?
- **P8.** Would MoonX route `request_swap` to XO's chain? Path from Open Plugin to official promotion?

- **P9 (verify in the portal; no ask needed).** Does `use_plugin` hand the agent a tool's `structuredContent`, or only its text block? The v0.1 read tools put condition ids, token ids and prices only in `structuredContent` and a one-line summary in the text. If only text reaches the agent, `xo_search` -> `xo_get_market` -> `xo_orderbook` cannot chain (the ids are invisible), and the text block must also carry the key fields. Check in the portal Test console and with a real `use_plugin` call before release. No source in the repo settles it (the starter's own `echo` tool mirrors its text into `structuredContent`).

### 4.3 Human-run, zero-value tests (the user runs these; I did not)

Use a dedicated test credential on an approval-gated grant, and record outcomes in a new file, not here.
- **T1.** Portal "Validate transaction" with a zero-value `evm` proposal on `eip155:3223` (needs portal access, B0).
- **T2.** `check_operation_readiness` dry run of `request_wallet_sign` with a `Kernel(bytes32 hash)` typed data on chain 3223 (read-only per description, but needs explicit approval).
- **T3.** `request_wallet_sign` `typedData` on a throwaway credential signing a random hash under a Kernel-shaped domain, then `ecrecover` locally to confirm a 65-byte signature; repeat with `raw`. Observe `pending_signature` versus `pending_approval` and what the signing window shows.
- **T4.** A zero-value proposal tool through `use_plugin` on an `autonomous` grant (needs an installed plugin).

### 4.4 Alternative routes (none uses browser automation or draft-plus-link)

Signing:
- **S1 (primary).** `typedData` for orders and ClobAuth, then prepend `0x01||validator`.
- **S2.** If `typedData` for chainId 3223 is denied, `raw` with the 32-byte wrapped digest, with digest recompute and `ecrecover` in submit. Same blind-signing caveat.
- **S3.** For headless hosts, `@paybox-sh/sdk` with a paired `pbxk1.` key signs in-process and clears immediately under an autonomous grant [06 V]. The key is itself a credential.
- **S4.** A remote OAuth plugin, if PayBox permits third-party registration (identity, state, no 10-second limit).
- **S5 (ask XO).** A scoped or delegated signing key issued by XO for orders only, so the PayBox wallet does not sign every order blind. Not documented; ask.

Funding (the author requires the plugin to handle it):
- **F1.** Two Base proposals through PayBox (USDC `approve` to the router, then `transferRemote(domain, recipient, amount)` with any required `msg.value`) after XO confirms the router. Recipient is the pinned XO smart account. One call per proposal, five-minute expiry; use the "next missing step" pattern from arcanum that re-derives state from public reads [04 §9]. A wrong recipient is irrecoverable; pin and cap hard.
- **F2.** If XO exposes a programmatic deposit address, a single ERC-20 `transfer` proposal on Base.
- **F3.** `request_swap` to a chain-3223 USDC.e route only if MoonPay adds it (ask P8). Not evidenced.
- Manual funding is not an acceptable substitute under the author's decision.

Creation:
- **C1.** One UserOp batch (fee `approve`, then `createConvictionMarket`), sponsored, signed with `raw`.
- **C2.** An XO partner route (`createConvictionMarketFor` or a sponsored endpoint), granted under a written agreement.

---

## 5. Cross-cutting risks the plan does not yet account for

1. **Caps are advisory against an autonomous agent** (B2). An agent that can sign anything can also mint its own HMAC triplet by signing a ClobAuth digest. Real boundaries: the XO wallet's grant approval mode (`iframe` or `always_approve`) and a relay holding the credentials, and even then approvers see only an opaque `Kernel(hash)` unless the signing window decodes it [06 §10-§11].
2. **Blind signing and prompt injection.** Market titles are attacker-controlled; an autonomous `request_wallet_sign` can sign arbitrary typed data on a model's say-so [06 §11].
3. **Bearer orders and L1 timing** (gate 2, gate 8): short GTD; fresh L1 within about 60 seconds.
4. **Balance-drop auto-cancel.** The engine cancels resting orders LIFO when the indexer sees an on-chain balance drop (withdrawal, other-venue fills), relevant to any multi-venue design that moves funds [01 V missed 3].
5. **Centralisation.** XO can pause trading, close the creation selector, change the paymaster allowlist, upgrade the exchange and manager, and void markets in its sole discretion; one oracle resolves all markets; AI determinations can be "final" [03 §8, §13].
6. **Thin, owner-controlled collateral** (about $0.34M USDC.e supply; Circle FiatToken admin powers, M) [03 §13].
7. **Plugin platform churn.** The SDK moved from 2.0.0 to 2.2.0 in 12 days and PayBox docs contradict each other on approvals [06 §11].
8. **Reference plugin guards are not safety controls.** `paylink-guard`'s `max_amount` is agent-supplied and its confirm code is returned to the agent in the error text [04 V2.11]. Do not copy `propose_even_if_denied`.

---

## 6. Multi-venue aggregation and Quotient (user request; outside the nine gates)

What the research says, bluntly:

- **No taker edge survives frictions.** 41 relationships, 1 minute to 84 days, no positive net in any taker rule after spread and two taker fees (2 positive variants were artefacts on near-certain rungs). Lead-lag exists on crypto basis pairs but is 10 to 100 times smaller than round-trip cost [18 §0, §4]. Within-venue structural edge (negRisk partitions, ladders) was zero after fees in the snapshots [16 §0, 15 §6]. Historical profit was in single-event partitions in a zero-fee regime (STALE: April 2024 to April 2025) [15 §0].
- **Cross-venue pairs are dominated by resolution divergence and lock-up**, not price. XO markets are `MANUAL` resolution with a creator resolver, so every XO-versus-X pair is `settlement_source` divergent by default; the six title-identical XO and Polymarket pairs read at rule level share a UTC versus ET cutoff offset [16 §0, 15 §10].
- **Matching is the hard part**, and unattended linking does not hold: gated token matching scored 23 of 23 in-sample but 5 to 7 of 8 out of sample with one clear entity-swap false link [16 V K2]. Keep a human-approved, rule-hash-pinned pair registry; the plugin verifies hashes, status, close times and fees on every call. Intra-XO duplicates exist [16 V K3].
- **No aggregator or SDK covers XO or Trueo at runtime** except Predictefy (vendor claim, "nothing has ever been submitted to XO", Enterprise-only for commercial use) and directory-only listings (DefiLlama, Prediction Index, PredictionTalk). Dome is dead, Metaforecast discontinued, Parsec and Verso unreachable. pmxt is personal-use only on every plan. Do not depend on any hosted aggregator at runtime [14, 10 V, 16 V K5-K6].
- **Fees are curves, not constants**, and must be read per market: Polymarket `rate*p*(1-p)` from Gamma `feeSchedule` (feeTypes include 0.03 and 0.05 sports); Kalshi series `fee_type` and `fee_multiplier` plus event overrides and scheduled changes; Polymarket US theta 0.06 in a CFTC filing; XO per the gate-9 caveat [10 V5-V7, 08 V].
- **Quotient** is a real forecast API (pay-per-call x402 v2 in USDC on Base, or API key). It covers Polymarket, Polymarket US, Kalshi and HL Outcomes; **not XO, not Trueo**. Its headline edge is not distinguishable from zero outside the final day; sports signals are labelled experimental; its terms (updated 2026-08-07) restrict redistribution, resale, shared access and building a competing signals product. A shared API key behind plugin brokered headers would breach that. Use it as a per-user, agent-paid signal and candidate ranker only, and request a written licence before any shared cache [12, 12 V].
- **Kalshi** Developer Agreement v1.1 (2023, possibly superseded) bars caching, aggregating or sharing API data and facilitating other members' trading; it also bars sublicensing and public statements without written approval. Seek written authorization before any multi-user feature [08 V E1].
- **Polymarket** global is close-only for the US and requires a "not a U.S. person" attestation; server-side order relay for restricted users is a circumvention risk. Polymarket US is a separate fiat, SSN-KYC venue [08].
- **Trueo** is Base-only today (Ethereum migration announced 2026-09-21, no addresses or date), TVL about $1.06M, 24-hour volume $313, all on-chain, so it needs no keys but has no API, thin books, upgradeable contracts and Samoa terms excluding US persons [11].
- **Venue priority for ingest** (provisional, DefiLlama-volume driven, not depth-measured): Polymarket and Kalshi first, Limitless as a Polymarket mirror (carries `externalSlug`, `isPolyArbitrage`, `rulesHash`), then Predict.fun and Opinion (headline volume is an upper bound; points-farming; keyed) [09 V, 16 V]. STALE sources: Predict.fun ToS (2025-11-18), Opinion ToS (2025-10-19), DeFi Rate (2026-02-23).
- **Recommended shape.** A read-only signal and alerting layer, not an execution engine: hourly polling for correlation and basis; 1 to 5 minute polling only for crypto-linked legs; always show spread, fee, depth and capital-lock-adjusted returns next to any gap; keep your own history because public history is short (Polymarket 1-minute data for about 7 days) [18 §4].

---

## 7. Where `docs/plan.md` is now wrong or obsolete

Line numbers refer to `docs/plan.md` as of this commit. The machine-readable list in the structured output mirrors this.

1. **Status banner (line 3).** "Phase 0 is blocked on (1) XO docs unreachable, (2) reference plugins unreadable, (3) portal access" is obsolete for (1) and (2): XO docs are readable through the `xo-docs` MCP, the reference repos and PayBox docs are readable through `gh api` and `developer.paybox.sh`. Only portal access remains. "Every XO-specific claim below is unverified" is wrong: most are now verified or corrected.
2. **Creation decision (line 9).** There is no API endpoint, but a contract-level path exists (`createConvictionMarket`). The decision's fallback ("an XO partnership or contract-level path") is now concrete and has ToS limits.
3. **Caps (line 10).** (a) 2 per day exceeds ToS Annex A (1 per calendar week, badge required). (b) Plugin-enforced caps do not bind an autonomous agent. (c) One creation costs $1 plus a seed of at least $10, which consumes the whole $10 per order cap and $11 of the $50 per day budget per attempt, with 41% update-required and 9% reject outcomes. (d) Whether funding, withdrawal and creation fees count toward the daily cap is still undecided.
4. **Funding decision (line 11).** "Bridge USDC to XO chain 3223 inside the flow" assumes a PayBox-reachable bridge. There is no documented XO bridge or deposit API; the on-chain path is Base-only; PayBox does not list 3223.
5. **Packaging (lines 21 to 27).** Field-level schema is now known: version "1", kinds `evm`, `solana`, `x402` only, one call per proposal, `expiresAt` within five minutes, strict schema, no description, gas, simulation or value fields. Network settings sit under "Test & configure" and "Variables & Secrets" (the "Project settings, Network access" label may be an older UI). New release facts: manual approval of every version, Chapter 1 closed 2026-10-17, MoonPay KYC where applicable, one project per participant, perpetual license to the submission, a remote-plugin class exists, and the starter (version 1.0.2) is served by the developer portal, not GitHub.
6. **XO facts (lines 31 to 34).**
   - Collateral name: docs say "XO USDC"; the token is "Bridged USDC (XO)", symbol USDC.e, 6 decimals (H).
   - Funding sources: Base only on-chain; docs name none.
   - Enable Trading: confirmed as unlimited USDC.e approval plus `setApprovalForAll` to the CTF Exchange, executed as a UserOp, not an EOA transaction.
   - Gas: a `PolicyPaymaster` (ERC-4337), not a generic "fee-grant or relayer".
   - Testnet: chain 1000101 exists but no integrator hosts are documented.
   - Creation: no longer "looks like a UI flow"; fee verified; 20% creator share unverified and on-chain 0.
   - Fees, bot policy, jurisdictions: now known (sections 2 and 3, gate 7).
7. **"What PayBox gives us" (lines 38 to 41).** `value_cents` and `slippage_bps` are first-party `world` conventions and do not exist in Open Plugin proposals. "SDK stops with `unsupported` on gasless plans, so XO gas sponsorship is a real risk" is a mis-framing: XO sponsorship is paymaster-based on XO's bundler and does not involve PayBox transactions at all.
8. **Gate 4 text (line 48).** Reframe: PayBox support for 3223 matters only for signing domains, not for XO writes as proposals.
9. **Gate 6 text (line 50).** "`xo_fund_account` can return unsigned approve + bridge calls on the source chain" is two separate proposals and requires an XO-confirmed router; whether PayBox's swap or bridge can target 3223 is "unlikely".
10. **Gate 8 text (line 52).** Answered: a plugin cannot sign; the pattern is agent-orchestrated; the autonomous question is unresolved and must be designed for both outcomes.
11. **Gate 9 text (line 53).** The premise is false; the Data API is public.
12. **v0.1 tool list (line 61).** `xo_account` trading-enabled flag is not readable from REST; the self-created-market flag is unreliable; `xo_search` is title-only.
13. **v0.2 tools (line 62).** `xo_enable_trading` and `xo_redeem` are UserOps signed with `raw`, not proposals. `xo_fund_account` as bridge proposals has no source. `xo_withdraw` is service-mediated and not sponsored; "only to the owner's own address" must be confirmed with XO. `xo_cancel_order` should use the HMAC single-order form only.
14. **v0.3 (line 63).** "Must be a real programmatic path" is satisfied at contract level; approval gating by the plugin cannot hold under an autonomous grant.
15. **Guardrails (lines 67 to 76).**
   - "supply `value_cents` so grant policy can evaluate" is not possible for Open Plugin proposals or `request_wallet_sign`.
   - "Pinned constants: RPC" cannot be pinned; it needs a private `api_key` and cannot be a brokered header.
   - "Prefer capped allowances" is untested; XO's own flow is unlimited.
   - "Creation is always approval-gated ... even when autonomous" cannot be guaranteed by a plugin.
   - Add short GTD expiry and `nonce` handling, since signed orders are bearer instruments.
   - "Refuse disputed markets": no disputed state exists; handle `UPDATE_REQUIRED`, `VOIDED`, `VOIDED_CLOSED`, `RESOLVED` (provisional), `CLOSED` (settled with winner).
   - "Audit log" needs a host; the plugin has no storage.
   - Self-trading: mark-and-log stands, but orderbook STP cancels self-matches, and the ToS wash-trading and influence clauses apply.
16. **Repo layout (line 80).** `src/xo/{auth,signing}` will need a relay service and its own directory; the single-file bundle cannot hold credentials.
17. **Verification (line 84).** "XO testnet order placed and cancelled through `paybox plugins use`" has no documented host set; the only XO environment documented is mainnet. `paybox plugins use` needs an installed plugin (B0).
18. **Prerequisites (lines 86 to 91).** Items 1 to 3 are done (the `.mcp.json` is on main as of commit 82d95ae; reference repos were read via `gh api` and the portal). Item 4 (portal access) is still open and now has a schedule dependency.
19. **Open decisions (lines 93 to 102).**
   - Funding detail: the owner EOA is only the signer; funds live in the Kernel smart account on 3223; the plan's "PayBox EVM wallet on 3223 is assumed" is wrong.
   - "Who pays gas on 3223" is answered for allowlisted calls (paymaster); the EOA needs no XO gas.
   - Secrets: answered (per-user HMAC; a relay is needed).
   - Environments: mainnet only.
   - Legal posture: restricted regions and clauses are now known.
   - Timing: Chapter 1 closed; recurring but undated.
20. **Resume checklist (lines 104 to 110).** Obsolete; replaced by sections 3 and 4 of this file.
21. **Missing scope.** The plan has no multi-venue or Quotient section; see section 6 and decision 12.

---

## 8. Docs-versus-code and other discrepancies (every one found)

"Code" here means live API behaviour, on-chain contract behaviour, OpenAPI specs, or community clients.

XO auth, signing and orderbook:
1. L2 header names: auth page and guides say `XO_API_KEY`, `XO_PASSPHRASE`; OpenAPI text says `POLY_API_KEY`, `POLY_PASSPHRASE`. Live: `XO_*` accepted, `POLY_*` rejected [01, 08 V].
2. `/auth/*` levels: prose says L1 for all; OpenAPI puts delete and list on L2; live `/auth/api-keys` needs L2 [01].
3. Secret "shown once" and `ApiKeyTriplet` "never returned again" versus derive 200 schema, example and sample code returning the secret [01 V1].
4. `signatureType` 0: guides say EOA orders are not accepted; OpenAPI `CTFOrder` and the order endpoint page say EOA uses 0; cancel enums allow 0 and 3 [01, 10 V].
5. `order.signature` "65-byte hex" in OpenAPI versus 86-byte wrapped form in the guide; the TUI client returns `0x00||sig` versus docs `0x01||validator||sig` [01, 05 V B3].
6. HMAC target: docs say path with query; the TUI defaults to path-only labelled "Live XO compatibility" [05 V B4, 07 V1 D7].
7. Cancel id form: numeric `42` in examples versus a `0x` hash in the Rust sample; `GET /orders` returns both `id` and `order_hash`. `CancelOrder` typed data undocumented; cancel-all requires `signature` in the schema but samples say "authenticated client" [01 d, 07 V1 D3].
8. `GET /order/{id}` (used by the community bot) is 404 live; the documented route is `GET /data/order/{id}` with L2 [07 V1 D1].
9. `/trading-state` works live and is absent from the OpenAPI [01].
10. OpenAPI `security` annotations are unreliable: `/data/orders`, `POST /order`, `POST /orders`, `DELETE /order*`, `/heartbeats` show no security but need L2; `/balance-allowance/update` shows L2 but answers 200 unauthenticated; `GET /orders` shows `[L2, {}]` but returns 401 [02 V A9, 07 V4].
11. Book sizes: OpenAPI and the intro say integers; live sizes are decimals with up to 6 fractional digits [02 V A2].
12. `min_order_size` is "0" even on books with resting orders; OpenAPI examples show 5,000,000 micro-shares and a $0.01 minimum notional [03, 01 V].
13. `/guides/smart-accounts` shows `rpcUrl: https://rpc-mainnet-2.xo.market` without a key while the introduction requires an `api_key` [02 V C4].
14. `/prices-history`: schema says integer `interval` seconds, the Rust sample passes `"1h"`, and live ignores `interval` as a window (one stale point); XO history is trade ticks in descending order with duplicate timestamps [02 V A11, 18 §2.10].
15. `GET /markets` on the orderbook: live `count` is the grand total (47,065), not the page size; `/simplified-markets` and `/sampling-markets` are byte-identical to `/markets` [02].
16. Rate limits: public REST documented 5 req/s but 20 concurrent GETs all passed; Data API documented 100 per 10 s while headers say `x-ratelimit-limit: 50`, and 429 appeared after about 35 rapid requests [02 V, 10 V11].

XO Data API and market model:
17. `take` max: spec 1000, live 50.
18. `marketScope=default`: spec says STANDARD plus CLOB; live returns only type 0 (9 ACTIVE rows).
19. Type enum documents 0 to 3; live and on-chain have type 4 (Conviction); status enum lacks `UPDATE_REQUIRED` and `VOIDED_CLOSED`, which the API returns [03 V10].
20. Field names: spec `tokenId`, `position`, `category`; live `outcomeTokenId`, `index`, `categoryPath`. Prices are micro-units; the spec example is "0.55"; volume has 6 decimals [02 §0].
21. `categories` filters after pagination; short pages and `itemCount` mismatches [02 V A12].
22. List `currentPrice` is a display price; detail routes return a constant "500000" [02 V A5-A6].
23. Creator fields: constant across 2,238 sampled type-2 rows although on-chain shows 132 creators of type-4 markets [03 §2.5].

XO fees:
24. Pulse taker rate 6% in docs and `effectiveFeeConfig`; `/fee-rate` 0 for 30 of 30 tokens and for a nonexistent token; `effectiveFeeConfig` 400 to 800 bps on many CLOB markets [03 V6, 10 V3].

XO lifecycle and creation:
25. `Closed` documented as "ended without a resolution"; live `CLOSED` rows always have winners; payouts are reported only at close [03 §7, §8; 02 V B3].
26. Creation ToS (badge, one per week, admin approval) versus contract (public role, no badge or limit; 132 creators; 14 in a day) [03 §2.5].
27. Creator share 20% (what-is-xo) versus `creatorFeeBps = 0` on-chain for current implementation; early Pulse markets emitted 200 bps [03 V5].

XO gas and chain:
28. Paymaster: docs say `redeemPositions` only; on-chain allowlist is much wider (section 1.3, item 5). ToS says users pay network fees for trades, market creation and withdrawals, while product pages say sponsored [03 §4.1].
29. Testnet: docs say "single public production environment"; chain 1000101 and an explorer exist [03 §4.1].

XO funding:
30. Docs list "EVM or Solana wallet" and a USDC-only picker; on-chain inbound is 100% Base. Older press says Base, Ethereum, BNB [03 V4].

Docs links:
31. The Orderbook reference links its "live OpenAPI spec" to `github.com/xomarket`, an account with zero public repos; both OpenAPI specs list `https://beta.xo.market` as contact [07 V2.6, my check].

Community code versus docs:
32. The bot's `getOrder` uses `/order/{id}` (404) and omits the required `address` on `/balance-allowance`; its cancel-by-id form is ambiguous [07 §6].
33. Polymarket-derived local code: Safe-proxy salt (64-byte versus 32-byte), eager nonce increments (the exchange needs equality on `order.maker`), HMAC output padding stripped (upstream keeps `=`), and a V1 order struct when V1 is archived [13 V].

Other venues:
34. Polymarket `/price`: prose says BUY returns the lowest ask; the OpenAPI and live say BUY returns the best bid [08 V A1]. GET batch endpoints (`/books`, `/midpoints`, `/prices`) returned 400 live, though documented [08 V A3]. `orderMinSize` "in USDC" on one page and shares elsewhere [08 V A5]. Fee types `sports_fees_nfl_cfb_oct26` (0.03) and `sports_fees_v3` (0.05) are undocumented [08 V A4].
35. Kalshi: batch order books need repeated `tickers=` params (comma form returns a bogus empty book); OpenAPI says book arrays go "best to worst" while the guide says the best level is last; `status` prose lists four values while the enum lists five; `GET /series` ignores `limit` [08 V A2, A9].
36. Opinion: docs OpenAPI says `{code,msg,result}`, the server sends `{errno,errmsg,result}`; `conditionId` empty on list rows but populated on detail rows [09 V B1-B2].
37. Docs on Limitless credentials say UI-only; docs also describe a headless Privy-token route [09 V B3].
38. Dome and Prediction Index: directories list Dome as live after its APIs ended 2026-04-28 [14].

PayBox:
39. "Plugin money tools always pause even under autonomous" (scoped to first-party plugins) versus the live `world` contract ("autonomous returns `pending_signature`") versus `concepts/model` (signing needs a fresh passkey "regardless of mode") [06 V, 04 V2.3-2.4].
40. `use_plugin` describes unofficial plugins as "remote MCP installation" while the dev guide describes uploaded bundles [06 §7].
41. `discover_services` documents a `raw` flag that the connector's tool schema does not expose [06 V].
42. The three-attempt retry sentence applies to preflight and discovery, not tool calls ("PayBox never automatically retries a tool call") [04 V2.5].

Research-pipeline discrepancies:
43. Notes' counts truncated by the explorer 1000-row cap: conviction creations 274 versus 585; outbound transfers 8,277 versus 8,821; mints 10,514 versus 10,915 [03 V].
44. [14] counted 14 DefiLlama prediction "Interface" rows; there are 63 [14 V A2].
45. [15] §10 still states about 9 active XO markets [16, 02, 10 V].
46. Fixture inconsistencies in [14] (River row says no cross-venue matching; River has generic assets) [14 V A1, A9].

---

## 9. Decisions only the user can make (ranked)

Ranked by how much they block or reshape the release. Recorded decisions (Open Plugin; self-trading allowed; release needs read plus trade plus create plus funding; caps; plugin handles funding; no browser automation; no draft-plus-link) are not reopened.

| Rank | Decision | Options | Recommended | Why it matters |
|---|---|---|---|---|
| 1 | Send the XO partnership and question list now | (a) Send the full list in 4.1 with Q1 to Q6 flagged first; (b) send only Q1 to Q6 first; (c) do not contact XO and build on unsanctioned direct calls | (a) | Gates 1, 3, 5, 6 and 8 cannot close without XO. Option (c) risks irrecoverable funds and ToS action. |
| 2 | Account onboarding stance | (a) Accept a one-time human step (create the XO account with the PayBox wallet as external owner, if XO confirms that works); (b) require XO to provision it; (c) require fully programmatic creation | (a), with (b) as the ask in Q1 | Every write requires the account. This is a one-time account setup, not browser automation by the plugin and not a substitute for creation or funding. Option (c) has no documented path. |
| 3 | Per-user XO credential custody | (a) Author-operated relay holding triplets keyed by smart account; (b) remote OAuth plugin if PayBox permits; (c) stateless derive per call; (d) XO-issued scoped or signature-only access | (a) now; ask P2 and P6; (d) via Q4 | A hosted bundle cannot hold secrets. Stateless derive is unsafe until XO answers Q4 and fails with approval latency. The relay is custody of credentials (not funds) and may conflict with developer terms. |
| 4 | Approval mode and cap enforcement | (a) Put the XO wallet on `iframe` or `always_approve`; (b) keep `autonomous` and accept advisory caps; (c) autonomous plus relay-side caps | (a) for any wallet holding real XO funds; (c) only for test credentials | The $10, $50 and 2 per day caps cannot bind an autonomous agent. Approvers still see an opaque hash unless the signing window decodes it. |
| 5 | Creation cadence versus the ToS | (a) Build behind a default-off flag, default 1 per week, ceiling 2 per day, enable on mainnet only after XO's written permission; (b) enable at 2 per day without permission | (a) | The written limit is one market per week for a badge holder; XO can close the selector or reject each market. Budget fee per attempt. |
| 6 | PayBox access and schedule | (a) Contact PayBox now (P1 to P8); (b) wait for the next monthly Chapter; (c) build locally and defer E2E | (a) and (c) together | Without portal access nothing can be installed or tested end to end. A remote-plugin route would change gates 1 and 8. |
| 7 | Funding fallback if XO will not bless a route | (a) Wait for an XO-supported route; (b) call the Base warp route directly with pinned recipient and tiny caps behind a flag; (c) pursue a provider deposit-address API | (a) or (c); (b) only with XO's written OK | The release requires funding handled in-plugin, but a wrong recipient is irrecoverable and the Base router is unverified. |
| 8 | Operator and legal posture | Who accepts responsibility for agents betting and creating; where the relay and plugin run (egress IP versus XO's restricted regions); whether MoonPay compliance sign-off is needed for listing | Decide an operator entity and hosting region outside the restricted list before any mainnet test | XO's geo check uses IP at login and transaction time; ToS exposure falls on whoever operates this. |
| 9 | Test credential and budget | Dedicated PayBox test credential with a small approval-gated budget; no testnet hosts exist, so tests are on mainnet | About $25 total: signing tests move no money, about $10 for one funded trade (plus Base gas for a funding test), and $11 more only if creation is later permitted | Min sizes are unknown (live `min_order_size` is "0"); creation costs $1 plus a seed of at least $10 per attempt. |
| 10 | Cap semantics | Do funding, withdrawals and creation fees count toward $50 per day; does a creation seed count as an order | Seed counts as an order (at most exactly $10); creation fee counts toward the daily cap; funding and withdrawals get a separate transfer cap | The plan left this open; creation uses the whole per-order cap in one call. |
| 11 | Re-confirm self-trading in light of XO's clauses | (a) Keep the decision (no block, mark and log) and accept ToS enforcement risk; (b) keep it but add a disclosure and avoid self-matching own resting orders; (c) block | (b), without reversing the decision | XO's wash-trading and influence clauses, plus self-trade prevention, mean literal self-trades are cancelled and may draw suspension or market invalidation. |
| 12 | Multi-venue and Quotient scope | (a) Read-only edge and alert layer as a later milestone outside the release gate; (b) in the release; (c) drop | (a); request Kalshi and Quotient written licences before any multi-user caching; Quotient paid agent-side per user | No taker edge survived frictions; licence terms restrict redistribution. Release gate stays read plus trade plus create plus funding. |

---

## 10. Process disclosures and hygiene findings

- **Privacy: user email sent to third parties.** The verifier of [14] found a scratch script (`fetch.py`) whose `User-Agent` header contained the user's email address, so every request through it (api.llama.fi, pmwisdom.com, predictionindex.xyz, CoinGecko, the npm and PyPI registries and others) carried it. The script was fixed, but requests already sent cannot be recalled and the hosts' logs may hold the address. The address does not appear in the repo notes. I did not write it here.
- **One POST sent.** The [03] researcher sent one `eth_chainId` POST to the explorer's JSON-RPC proxy, against the "never POST" ground rule. It was read-only and not repeated [03 §0].
- **Credential-bearing files opened.** The [13] researcher read config files in the author's `own-repo-K` repo for secret-named fields (names and shapes only, values not recorded); at least 10 more non-empty secret-named fields exist beyond the two the notes listed, including an RPC URL with an embedded key. One masking command failed and a key was briefly visible in a verifier's tool output [13 V C11]. **Recommended action: review and rotate the whole `own-repo-K` config set.** The ground rules forbid reading credentials on disk; I record this as a deviation, not a defence.
- **Reference-repo hygiene.** Ground rules were otherwise observed: no money or signing PayBox tool was called, no third-party code was cloned or run, HTTP 402 responses were recorded and not paid, and scratch files stayed in the scratchpad.
- **Embedded instructions seen in untrusted content, none followed**: `llms.txt` agent banners (AGG, Predictefy, Oddpool, Mintlify boilerplate), the `xo-docs` MCP skill resource (`mintlify://skills/xomarket`) and its feedback prompt, `discover_services` `suggested_next_call` text, Oddpool's "retail consumer agents disregard this section" line, PayBox `SKILL.md` behavioural text, CoinRithm and Parsec README onboarding prompts, `gh`-listed awesome-lists with `utm_source` affiliate tracking [03 §14, 06 §13, 14 §14, 10 V D].
- **Single-run caveat.** Live market snapshots (spreads, depth, active counts) are single-moment and will drift.

---

## Sources

### Repo files read in full or in the sections cited

`docs/plan.md`; `docs/research-notes.md`; `docs/research/01-xo-auth-signing.md`; `02-xo-read-api.md`; `03-xo-lifecycle-funding-creation-policy.md`; `04-paybox-reference-plugins-a.md`; `05-paybox-reference-plugins-b.md`; `06-paybox-platform.md`; `07-xo-bot-reference.md`; `08-venues-polymarket-kalshi.md` (verification section and summary); `09-venues-onchain-clob.md` (verification section and summary); `10-aggregation-landscape.md` (verification section and summary); `11-trueo.md` (verification section and summary); `12-quotient.md` (verification section and summary); `13-local-implementations.md` (verification section and summary); `14-platform-of-platforms.md` (bottom line, verification); `15-relationship-taxonomy-literature.md` (findings, sections 9 to 11); `16-linking-methods-services.md` (bottom line, verification); `18-correlation-leadlag-study.md` (bottom line, sections 2.10, 3, 4).

### Primary sources I re-checked myself this session

- XO docs via the `xo-docs` MCP: `/api-reference/introduction.mdx` line 5; `/documentation/introduction.mdx` lines 55 and 109; `/guides/redeem-positions.mdx` lines 53, 68 and 215.
- Live public GET to `https://api-mainnet.xo.market/api/markets` (take=1, read `meta.itemCount`) on the machine clock 2026-10-18 18:58 UTC: default scope ACTIVE 9; `marketType=2` ACTIVE 242; `marketType=4` ACTIVE 166; `marketType=2,4` ACTIVE 408; `marketType=4` all statuses 505; `marketScope=withClob` ACTIVE 255.

### Primary sources the notes rely on (not re-opened by me)

- XO: `https://docs.xo.market/` paths `/guides/smart-accounts`, `/guides/wire-conventions`, `/guides/order-types`, `/guides/fees`, `/guides/market-lifecycle`, `/guides/taker-delay`, `/guides/auto-cancellation`, `/api-reference/authentication`, `/product/accounts/{deposit,withdraw,wallets,transfer-states}`, `/product/products/create-a-conviction`, `/product/trading/fees`, `/legal/terms-of-service`, `/legal/privacy-policy`, `/openapi/api-reference/openapi.yaml`, `/openapi/data-api-reference/openapi.yaml`; hosts `orderbooks.xo.market`, `api-mainnet.xo.market`, `mainnet-bundler.xo.market`, `explorer-mainnet.xo.market`.
- PayBox: `https://developer.paybox.sh/requirements.md`, `/skill.md`, `/llms.txt`, `/terms`, `/plugin-starter/v1.0.2/`; `https://docs.paybox.sh/` (`/reference/mcp-tools`, `/concepts/{model,approvals,requests}`, `/sdk-cli`); `@paybox-sh/sdk@2.2.0` (README, SKILL.md).
- Reference repos: `theluckystrike/paylink-guard`, `bunnyyxtan/arcanum-plugin`, `NitinkashyapSTRR/xo-pulse-market-maker`, `klumpfuss1234/xo-market-tui`, `Himess/ghost-mode-paybox`, `ivanmolto/echomarkets`, `moonpay/paybox-plugin`; Kernel `zerodevapp/kernel` v3.1 and `kernel-7579-plugins`.
- Venues and signals: Polymarket and Kalshi docs and OpenAPI, Polymarket US Rulebook (2026.09.30), Kalshi Developer Agreement v1.1, Quotient OpenAPI 20.5.0 and Terms (2026-08-07), `trueo-protocol/trueo-contracts`, DefiLlama, CFTC releases 9185-26, 9193-26, 9194-26, arXiv 2601.01706 and 2508.03474.

### Short verbatim quotes for load-bearing facts (as captured in the notes unless marked)

- "generated from the live [OpenAPI spec](https://github.com/xomarket)" (`/api-reference/introduction.mdx`, checked by me).
- "restricted but wired to PUBLIC_ROLE, so in practice open to everyone: the creation fee is what gates spam." (verified `XOClobMarketManager` NatSpec, [03]).
- "Do not rely on memory or disk surviving: every operation uses a fresh sandbox." (`developer.paybox.sh/requirements.md`, [06]).
- "Return one unsigned call on a supported chain; PayBox constructs and simulates the transaction." (same, [06]).
- "Publication to other users requires manual approval of every version." (same, [06]).
- "You cannot upload another file, submit or withdraw a version, or delete your entry after the deadline." (same, [06]).
- "plugin money tools always pause for the user's approval, even under an autonomous grant." (`docs.paybox.sh/reference/mcp-tools`, first-party plugins section, [06]).
- "Approval follows the grant: autonomous returns pending_signature, while approval-gated returns pending_approval." (live `world` contract, [06 V]).
- "Regardless of mode, sensitive operations (revealing a raw secret, signing, issuing keys) require a fresh passkey assertion." (`docs.paybox.sh/concepts/model`, [04 V2.4]).
- "The paymaster allowlists ConditionalTokens.redeemPositions, so redemption is gas-sponsored." (`/guides/redeem-positions`, [06 V]).
- "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system." (XO ToS, [03]).
- "Creator eligibility can be gated, and submissions may be reviewed before going live." (`/product/products/create-a-conviction`, [03]).
- "Only the taker pays a trading fee. The maker pays no trading fee." (`/guides/fees`, [03]).
- "the secret/passphrase are never returned again. Store them on receipt." (OpenAPI `ApiKeyTriplet`, [01 V1]).
- "Live mode has not been run against real funds by the author." (community bot README, [07 V1]).
- "Nothing has ever been submitted to XO yet." (Predictefy docs, [14 V B]).
