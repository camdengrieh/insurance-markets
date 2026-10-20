# 03 - XO Market: creation, funding, chain/gas, fees, redemption, resolution, legal policy

Task key: `xo-lifecycle-funding-creation-policy` (feasibility gates 4, 5, 6, 7; XO side of 4).
Research date: 2026-10-19 (sandbox clock read 2026-10-18T17:35Z). READ-ONLY. No money-moving or signing PayBox tool was called. No `.env`/key/wallet files were read. No third-party code was cloned, installed or executed.

Confidence tags: **H** read first-hand in a primary source this session (path/URL/command given). **M** secondary, inferred, or primary but interpreted. **L** weak/stale. Anything not found says `NOT FOUND (searched: ...)`.

---

## 0. Method, caveats, disclosures

- Docs: the `xo-docs` MCP virtual filesystem (mirror of docs.xo.market). I read every page under `/product/**`, `/guides/**`, `/legal/**`, `/documentation/introduction`, `/api-reference/{introduction,authentication,rate-limits}`, `/data-api-reference/{introduction,rate-limits}`, and ran `rg`/`jq` over both OpenAPI specs (`/openapi/api-reference/openapi.yaml`, `/openapi/data-api-reference/openapi.yaml`; both are minified JSON, so `rg` is line-useless and `cat file | jq` is needed). I also read the MCP resource `mintlify://skills/xomarket` (an agent-facing skill; see Suspicious content).
- The docs carry **no publication dates** except the Privacy Policy (`Last Updated: 6/5/2025`, i.e. ~16 months old, **stale**). The ToS is undated. One OpenAPI description cites a check "on 2026-04-17". Treat every undated page as possibly stale; section 9 lists where docs and live/on-chain behaviour disagree.
- Beyond the docs I verified claims against **public, unauthenticated GETs** of: the Orderbook host (`orderbooks.xo.market`: `/time`, `/trading-state`, `/book`, `/fee-rate`, `/tick-size`), the Data API (`api-mainnet.xo.market/api/markets`), and the XO Blockscout explorer (`explorer-mainnet.xo.market`: `/api/v2/...` and the etherscan-style `/api?module=logs&action=getLogs`). Explorer pages and contract source are untrusted data; I only read them.
- **Disclosure (rule deviation):** while probing the explorer I sent **one HTTP POST** (`/api/eth-rpc`, JSON-RPC `eth_chainId`, a read-only call that returned `0xc97` = 3223). The ground rules say "never POST". It had no side effects and I did **not** repeat it; every later on-chain read used GET-only log queries and the verified contract source. I did not use the XO RPC (needs a private `api_key`).
- Disclosure: `research.xo.market` (two blog URLs found by search) returned HTTP 403; not retried. `base.blockscout.com` returned 403/non-JSON; not retried. `docs.xo.market/llms.txt` fetched OK.
- WebFetch output is summarised by a small model; for every load-bearing on-chain fact I re-read the raw JSON/source with `curl`+`jq` into the scratchpad, and cite that.
- Wallet addresses of users, balances, API keys and secrets are deliberately **not** recorded. Addresses below are **protocol contracts** published in the docs or visible as contract code on the explorer.

---

## 1. Verdict summary (details in sections 2-5)

| Gate | Verdict | One-line answer |
|---|---|---|
| 5 market creation | **partial** (technically yes, contractually/ToS-constrained, undocumented) | No API endpoint and no documented programmatic path (H). BUT the verified `XOClobMarketManager` has `createConvictionMarket(...)`, wired to `PUBLIC_ROLE` (anyone can call), gas-sponsorable by XO's `PolicyPaymaster`, $1 non-refundable fee; every market starts `PENDING` and only XO's oracle can `APPROVE` (H). ToS Annex A additionally requires a Catalyst Badge, 1 market per calendar week, and admin approval (H) - and on-chain data shows those limits are not technically enforced (M). |
| 6 funding | **partial** (release-blocking item still open) | Docs: deposit = UI-only, three routes ending in USDC credited to the XO smart wallet; provider unnamed; chains/minimums/fees/latency NOT FOUND. On-chain: the collateral is a Circle-style "Bridged USDC (XO)" minted by a Hyperlane-style warp route; **100% of 9,610 inbound and 8,277 outbound bridge transfers are to/from Base (domain 8453)** (H). No documented non-UI deposit path. A plain EOA cannot trade (H). |
| 4 chain / gas | **partial** | Chain 3223, Blockscout explorer, native token XO, gas price 5 gwei (H). Smart-account actions go as ERC-4337 UserOps via `mainnet-bundler.xo.market` and are sponsored by a verified `PolicyPaymaster` (any sender, allowlisted selectors, 10,000 tx/day/sender) (H). The orderbook accepts **only** `signatureType=3` Kernel v3 smart-account orders (H). RPC needs a privately issued `api_key` (H). PayBox-side support for 3223 is out of scope here. |
| 7 terms / policy | **partial** | No clause bans bots; the ToS says bots "must comply with these Terms and not overwhelm or misuse the system" (H). Wash trading, manipulation, insider/influence trading, multi-accounting and geo-circumvention are prohibited; US, UK, France, Singapore, Ontario and sanctioned regions are restricted, enforced by IP check "at login or transaction time" (H). Creator rules (Catalyst Badge, 1/week, admin review) conflict with the plan's "2 markets/day". No KYC page; deposit providers may screen (H). |

---

## 2. GATE 5 - Market creation

### 2.1 Is there any API endpoint? NO (H)

- Orderbook OpenAPI paths (complete list, `cat openapi.yaml | jq '.paths|keys'`): `/`, `/auth/api-key(s)`, `/auth/derive-api-key`, `/balance-allowance(/update)`, `/book(s)`, `/cancel-all`, `/cancel-market-orders`, `/claimable`, `/data/order/{id}`, `/data/orders`, `/data/trades`, `/fee-rate`, `/health`, `/heartbeats`, `/last-trade-price(s)`, `/live-activity/events/{condition_id}`, `/markets`, `/markets/{condition_id}`, `/midpoint(s)`, `/neg-risk`, `/order`, `/orders`, `/positions`, `/price(s)`, `/prices-history`, `/sampling-*`, `/simplified-markets`, `/spread(s)`, `/tick-size`, `/time`, `/trades(/{id})`, `/v1/heartbeats`, `/version`. **No create/propose endpoint.** Methods: only `POST /order`, `POST /orders`, `POST /auth/api-key`, `POST /heartbeats`, batch `POST` reads, and `DELETE`s.
- Data API OpenAPI paths: `/markets`, `/markets/{id}`, `/markets/contract/{contractAddress}`, `/markets/slug/{slug}`, `/pulse/markets*`, `/users/portfolio`, `/public/liquidity-rewards/*`, `/liquidity-rewards/*` - **all GET**. No create endpoint.
- `llms.txt` index (WebFetch, M): "Market creation: Create a Conviction" is the only flagged page; "No separate bridging page", "No bots page", "No KYC page", "Gas, Enable trading, Changelog, Testnet: No matching pages".

### 2.2 Documented UI flow ("Create a Conviction", H: `/product/products/create-a-conviction.mdx`)

Five steps: (1) Claim/title, category, subcategory/tags, two outcomes; (2) Resolution: date+time, overall rules, outcome conditions, one or more sources; (3) Back: your side, **stake >= $10**, seed price **5c-95c**; (4) optional thesis + cover image; (5) preview, sign, submit. AI can draft; "you review everything before signing".

- Charges: "Creation charge | Currently $1.00 | Pays the one-time market creation cost"; "Seed order | At least $10.00" - `/product/trading/fees.mdx`. The seed "is not a fee; it becomes a market position as it fills".
- After submit (verbatim, `create-a-conviction.mdx`): "XO signs your seed order against predicted market identifiers, creates the market through a sponsored on-chain transaction, submits the seed buy as a GTC order". Warning: "**Creation is not idempotent.**" (retry can create a duplicate market + second seed).
- Eligibility/review: "Creator eligibility can be gated, and submissions may be reviewed before going live." (same page). `/product/rewards/conviction-points.mdx`: badges, "Catalyst among them, which can gate creator actions".
- Graduation: only defined in `/product/what-is-xo.mdx`: "the traction threshold a Conviction crosses to become a full Prediction Market". **NOT FOUND:** any numeric threshold, any API/field for graduation (searched: `rg -i "graduat"` over `/`; only 2 hits, both in what-is-xo).
- Creator fee share: "earning 20% of all lifetime trading fees" appears **only** in `what-is-xo.mdx` (H that the sentence exists; **unverified as a mechanism**). The fee pages (`/product/trading/fees`, `/guides/fees`) mention no creator share; `/product/rewards/liquidity-rewards.mdx` mentions a separate "**Creator Bonus** is a separate CP program"; the Data API summary has `me.cp.creatorBonus.lifetime`. On-chain: `m.creatorFeeBps = 0; // fees not supported yet` (H, verified source, below). Live Data API: `creatorBps` is `0` on all 2,238 sampled CLOB rows (H) (legacy AMM rows show 30-200 bps). Treat "20%" as unverified/likely stale.
- Reporting: "you can report it as spam, duplicate, illegal or unresolvable. A report creates a review signal" (`/product/products/convictions.mdx`).

### 2.3 ToS "User Generated Market Terms" (Annex A) - H (`/legal/terms-of-service.mdx`)

- Eligibility (Sec. 2): "Accumulate at least 500 Conviction Points"; "Complete a streak of 7-10 consecutive daily log-ins"; "Link and verify an approved social media account (e.g., X (Twitter))". Result: a non-transferable **Catalyst Badge** (SBT).
- Sec. 3a: "Ownership of the Catalyst Badge is required for any user to propose, submit, or otherwise create a new market."
- Sec. 3b: "Users may create a maximum of one (1) market per calendar week."
- Sec. 3c: "All proposed markets undergo review by XO Market administrators/moderators." Approval required to launch; checks cover illegal/violent/self-harm topics, "duplicate or substantially similar markets", and "markets lacking clear, objective, and verifiable resolution criteria".
- Sec. 3d: markets "only go live ... after admin approval"; CP creation rewards accrue only after approval.
- Sec. 4: badge needs maintained social link and "continuous activity"; revocable for "abuse of the market creation feature" and "Any attempt to transfer the Catalyst Badge or circumvent Catalyst Badge restrictions".
- Sec. 5 prohibited categories (unlawful/violent, suicide/self-harm, privacy/personal data, anything risking "legal or reputational standing of XO Market"). Sec. 7: XO may void any user market in sole discretion; "all unresolved positions will be settled on a 50/50 basis".
- General ToS Sec. 5 "Market Creation": creators "must provide accurate and unambiguous details" and "should not create markets on events that are impossible to verify". Sec. 12(d): indemnity for "the creation of markets or disputes that cause harm to a third party".

### 2.4 What "approval" means on-chain - H (verified `XOClobMarketManager` source)

Read from the verified implementation `0x60a10A0C0885628e413afFA4F62F3e942f11fcda` (proxy `0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307`, EIP-1967; fetched via `GET /api/v2/smart-contracts/<addr>` and extracted `source_code`; this is also `marketContractAddress` for all V3 CLOB rows in the Data API).

- `createConvictionMarket(uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI) returns (bytes32 conditionId)` - modifiers `restricted nonReentrant whenNotPaused`. NatSpec (verbatim): "`restricted` but wired to `PUBLIC_ROLE`, so in practice open to everyone: the creation fee is what gates spam."
- Same NatSpec: the fee "is non-refundable under every outcome (reject, cancel, void, expiry)". Fee = `CONFIG_MANAGER.collateralConfig(token).marketCreationFee`, `safeTransferFrom(msg.sender, treasury, fee)`; the caller therefore needs a USDC.e **allowance to the manager** first.
- `_createMarket` checks: `expiresAt > block.timestamp`, `startsAt <= expiresAt`, `collateralToken == CTF_EXCHANGE.getCollateral()` and allowed in config. It prepares the CTF condition, registers tokens on the exchange, **mints a market NFT to the creator**, stores `m.resolver = XO_ORACLE`, `m.creatorFeeBps = 0`, and `m.status = PENDING`. Ids are deterministic from `(creator, nonce, collateral)` (`computeNextMarketIds`) - this is how XO pre-signs the seed order.
- `reviewMarket(...)` is `onlyXOOracle`: from `PENDING` -> `APPROVE` (ACTIVE) | `REJECT` (CANCELLED) | `UPDATE_REQUIRED` (stores a suggested metadata URI/expiry). Owner (NFT holder) may then `respondToUpdateRequest(conditionId, accept)` (accept -> ACTIVE with new metadata; decline -> CANCELLED) or `cancelMarket` while `PENDING`. `updateMetadata`/`updateExpiry`/`pause`/`unpause`/`close` are `onlyXOOracle`.
- So "approval" = XO's oracle address calling `reviewMarket(APPROVE)`. The contract has **no seed minimum, no CP check, no Catalyst check, no per-week limit** ("The text contains no references to seed, minimum, CP, or Catalyst" - grep of the full source). Those are off-chain/UI rules.
- Related entry points: `createCLOBMarket` and `createConvictionMarketFor(creator, ...)` ("Charges no creation fee - the caller is trusted infrastructure sponsoring the market on the user's behalf") are **not** public: see role wiring below.

**Role wiring (AccessManager `0x414ea2da101008fc9d59fb4ec43431910cb936f5`, taken from the proxy's initializer calldata):** `TargetFunctionRoleUpdated` logs for the manager proxy (latest assignments, block 9,102,867): `createConvictionMarket 0x7f54a7a2 -> role 18446744073709551615 (PUBLIC_ROLE)`; `createConvictionMarketFor 0x507cedd3 -> role 73`; `createCLOBMarket 0x3585dec1 -> role 73`; `createPulseCLOBMarket 0xe9df1f93 -> role 72`. No `TargetClosed` event exists. NatSpec adds XO "can close this path - globally or down to a specific role - by re-pointing one selector, with no implementation upgrade" (H) -> **XO can switch off permissionless creation at any time.**

**Gas for creation:** a sampled creation tx (2026-10-18) is an EntryPoint `handleOps` (selector `0x765e827f`) from a bundler EOA at gas price 5 gwei, 988,744 gas; its `UserOperationEvent` names a **non-zero paymaster** - XO's `PolicyPaymaster` (section 4.3). Its batch includes the USDC.e `approve` for the fee and the fee transfer of exactly 1,000,000 raw (= $1.00), and a market-NFT mint (H).

### 2.5 Evidence that non-UI/automated creation already happens (M - inference)

- `MarketCreationFeeCharged` events (emitted only by the public `createConvictionMarket`): **585** events, **all exactly 1,000,000 raw USDC.e ($1.00)**, 132 distinct creators, from 2026-08-14 to 2026-10-18 (H on counts; the on-chain fee equals the docs' "$1.00", H).
- Per-creator cadence: 73 of 132 creators made >1 market inside some 7-day window; max **14 creations by one creator in one UTC day**; one creator made 70 markets total. So the ToS "one (1) market per calendar week" is **not enforced on-chain, and apparently not enforced at the platform level for these accounts** (M: either the ToS is stale, enforcement is UI-only, or those creators bypass the UI).
- Review outcomes for the 274 matched conviction-type markets (first `MarketReviewed` decision): APPROVE 147 (54%), UPDATE_REQUIRED 98 (36%), REJECT 24 (9%), none yet 5. Latency creation->first review: median 10.2 min, p75 33.5 min, p90 235 min, max 524 min (H on log data; n=269).
- Conviction-type (`marketType=4`) creations by month in the logs: Aug 81, Sep 17, Oct 176 (H).
- Live Data API oddity (H): across 2,238 sampled CLOB rows (`marketType=2`), **every** row has the same `creatorId`, `creatorBps=0`, `reviewStatus=null`, `resolutionType="MANUAL"`, tier "Spectator". That contradicts the 132 distinct on-chain creators -> the Data API `creator*` fields are **not reliable attribution** for user-created markets (M interpretation).

### 2.6 What is still missing for a plugin-driven create path (NOT FOUND / open)

- A documented, supported way to host `metaDataURI` (observed target: an XO-owned S3 bucket `market-metadata-...s3.eu-west-1.amazonaws.com/<uuid>.json`; schema observed: `title, description, category, tags, subcategories, image_url, rules{description, outcomeRules[]}, resolution_sources[], outcomes[]`). NOT FOUND (searched: all docs for `metadata`, OpenAPI for `metadataUri`/upload). Whether the oracle accepts a creator-hosted URI is unknown.
- Whether the seed order can rest while the market is `PENDING`: the Orderbook rejects non-Active markets with `422 market is not active (status: Pending)` (H, market-lifecycle guide), yet the UI says it submits the seed "GTC" right after creation. Unresolved.
- Whether the XO bundler/orderbook accept a smart account not created through `beta.xo.market` (docs: "Create an XO smart account at beta.xo.market").
- Whether the Catalyst Badge is enforced anywhere but the UI (not on-chain: confirmed absent in source).
- Searched and found nothing: `rg -i "create|conviction|graduat|seed|eligib|review|creator|propos|catalyst|createMarket|factory|MarketCreated"` over `/` (docs) and both OpenAPI specs; `llms.txt`; the MCP skill resource. The only doc mentions of an on-chain creation event: `/guides/market-lifecycle.mdx` "Markets created on-chain through the protocol enter `Pending`. The matching engine activates them when the on-chain `MarketCreated` event is observed" and `/data-api-reference/markets/...` ("`marketContractAddress` - on-chain contract to target for transactions (settlement, pause/resolve, etc.). For V3 CLOB this is the unified `XOClobMarketManager`").

---

## 3. GATE 6 - Funding, deposit/bridge, withdrawal

### 3.1 What the docs say (H)

- `/product/accounts/deposit.mdx`: "Every funding route ends the same way: USDC credited to your XO smart wallet." Three routes: (a) "Connect an external EVM or Solana wallet and select a supported asset. XO obtains a quote, transfers through the funding provider, and credits USDC to your smart wallet"; (b) "Transfer crypto": per-user **deposit address** watched by "the provider"; (c) "Use cash": card/Apple Pay/Google Pay/"the listed provider" embedded checkout.
- Not named anywhere: the funding provider, supported source chains/assets ("a supported asset, on the selected network"), minimums, fees, expected latency. `/product/what-is-xo.mdx`: "At the current launch surface the token picker is USDC-only." `/product/accounts/withdraw.mdx`: "Supported networks, minimum and maximum amounts, fees and expected delivery times are shown in the withdrawal flow itself."
  **NOT FOUND (searched: `rg -i "bridge|provider|relay|across|lifi|rhino|moonpay|transak|stripe|solana|base|ethereum|bnb|minimum|supported (asset|network)"` over `/product /guides /documentation`; `llms.txt` states there is no bridging page).**
- Smart account is funded directly; the owner wallet is not: `/product/accounts/wallets.mdx`: "Depositing into your external owner wallet does **not** make the XO smart wallet tradable." `/guides/smart-accounts.mdx`: "For MM integrations, the smart account **is** the maker - fund it directly."
- Integrator quick-start (`/documentation/introduction.mdx`): "Deposit XO USDC into the smart account via the `beta.xo.market` deposit flow." -> no documented API/contract deposit path for integrators.
- States (`/product/accounts/transfer-states.mdx`): Pending, Processing, Withdrawn (**not terminal**), Complete, Failed, Expired, Tainted ("flagged during screening ... Do not retry"). "Do not start a second transfer while the first is still pending." Some transfers "require additional verification".
- Withdrawals: "Only free balance can be withdrawn. Cash reserved by resting buy orders is not available"; USDC only, to "a supported destination chain", to a connected wallet or external address; wrong-address withdrawals "cannot be reversed".
- Can a plain EOA on 3223 hold collateral for trading? **No** (H): `/guides/smart-accounts.mdx`: "`0` | Direct EOA order | **No** - the XO orderbook does not accept EOA-signed orders today." (An EOA can of course hold USDC.e; it just cannot place orders.) Note an OpenAPI schema text still says "direct EOA integrations use `signatureType = 0`" - contradicted by the guide and introduction (docs inconsistency).

### 3.2 What the chain shows (H unless marked)

- Collateral token ("XO USDC", `0x80c12230ce677e6f304027a14780Edd2A829ab0c`, 6 decimals): explorer metadata name **"Bridged USDC (XO)"**, symbol **USDC.e**, ERC-20, proxy `FiatTokenProxy` -> `FiatTokenV2_2` (Circle FiatToken); total supply ~342,222.8 USDC.e and 3,091 holders at fetch time (WebFetch summary; M on the exact figures). So the plan's "USDC.e" label is right; the docs' "XO USDC" is the same token. Circle-style FiatToken implies blacklist/pause powers exist on the token (M, from standard FiatToken design; not read in code).
- **Minters:** only three minter contracts ever (all `Mint` events: 10,514): one route contract `0x9090463546d725F6eCE5D1A4B27beB929D5D1983` (9,601 mints, 2026-03-22 -> 2026-10-18; implementation named **`HypFiatToken`**, i.e. a Hyperlane warp-route token contract; unverified code) plus two contracts that minted only on 2026-05-02 (731 and 182 mints, ~1.5 hours; looks like a one-off).
- A sampled inbound tx: Hyperlane `Mailbox.process` -> route `ReceivedTransferRemote` -> FiatToken `Mint` (relayer-paid gas 186,774 gas ~ 0.00093 XO).
- **Source chain: Base only.** `ReceivedTransferRemote(origin, recipient, amount)` events from the route: **9,610 events, 100% origin domain 8453 (Base)**; by month Mar 22, Apr 44, May 747, Jun 1,315, Jul 1,740, Aug 3,420, Sep 1,837, Oct(18d) 485; amounts min ~0.03 USDC, median $16, max $30,000. **Withdrawals**: `SentTransferRemote` **8,277 events, 100% destination 8453**; median $25, max $25,000. The Base-side router, taken from a Hyperlane `Process` event sender, is `0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f` (derived on-chain; I could not verify its code or token on Base because Base explorers returned 403) (M).
  Inference (M): whatever the app's quote shows for "EVM or Solana wallets / other assets", the on-chain mint path is a Base USDC warp route; other sources are swapped/bridged to Base by the unnamed funding provider first. Older press ("Base, Ethereum, BNB") is not reflected on-chain (L, ~305 days old).
- No route-level minimum observed (smallest mint ~$0.03); the app minimum, bridge/IGP fee and end-to-end latency are NOT FOUND.
- **Withdrawals look service-mediated, not a plain user UserOp:** a sampled withdrawal tx is a direct call (selector `0x3a022aa7`) from a non-contract sender to an XO-side contract, with `Transfer -> Approval -> Transfer -> Burn -> SentTransferRemote -> Dispatch` in one tx; it is not an EntryPoint `handleOps` (H on shape; M on interpretation). The route contract's own `transferRemote` is **not** in the paymaster allowlist (H, section 4.3).
- Deposit-time warnings the agent must respect: do not start a second transfer while one is pending; "Withdrawn" is not final; funds sent on the wrong network "may not be recoverable"; withdrawals are irreversible.

### 3.3 Gate-6 verdict reasoning

A plugin cannot call a documented funding API (none exists). A technically plausible path exists - Base USDC -> Hyperlane warp-route `transferRemote` to the XO smart-account address - but its Base router ABI/fees/limits/relayer SLA are undocumented and unverified here, and nothing says XO supports third-party use. PayBox's cross-chain swap/bridge targeting chain 3223 was not tested here (out of scope). Funding therefore stays **release-blocking until XO confirms a supported deposit path** (or the plugin only supports "fund via XO app / Base USDC route" as an explicit, documented flow).

---

## 4. GATE 4 - Chain, gas, "Enable Trading"

### 4.1 Chain facts

| Item | Value | Conf./source |
|---|---|---|
| Chain id | 3223 (0xc97) | H docs `/documentation/introduction.mdx`; H `eth_chainId` -> `0xc97` |
| Orderbook REST / WS | `https://orderbooks.xo.market` / `wss://orderbooks.xo.market` | H docs |
| Data API | `https://api-mainnet.xo.market/api` | H docs |
| RPC | `https://rpc-mainnet-2.xo.market?api_key=<API_KEY>`; key "issued privately during onboarding ... Treat it as a credential" | H docs (key not obtainable here) |
| Bundler (ERC-4337 v0.7) | `https://mainnet-bundler.xo.market/`; EntryPoint `0x0000000071727De22E5E9d8BAf0edAc6f37da032`; accepts `maxFeePerGas=0`/`maxPriorityFeePerGas=0` | H `/guides/redeem-positions.mdx` |
| Explorer | `https://explorer-mainnet.xo.market` (open-source Blockscout, backend v9.0.2) | H explorer API; M chainlist |
| Native token | **XO** (chainlist "XO"; explorer coin price null = no market price) | M chainlist.org/chain/3223, H explorer |
| Gas price / block time | 5 gwei (`gas_price 5000000000` in sampled txs; stats "5.0"); ~1.5 s blocks (mainnet), 12.6M blocks, 8.5M txs | H explorer |
| Testnet | NOT documented in docs ("XO operates a single public production environment."). A testnet exists on-chain: chain 1000101, `explorer-testnet.xo.market` live (7.0M blocks, 4.8 s block time) (H explorer, M chainlist), but **no testnet orderbook/bundler/paymaster/API hosts are documented** -> the plan's "XO testnet order test" has no documented endpoint set. | H/M |
| Contracts (docs) | CTF Exchange `0x4bC5E872256D12E6017dfe466E04c867DC761B77`; Conditional Tokens `0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909`; XO USDC `0x80c12230ce677e6f304027a14780Edd2A829ab0c`; EntryPoint above | H docs |
| Exchange is upgradeable | CTF Exchange address is an `ERC1967Proxy` -> `CTFExchange` impl `0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED` (verified 2026-08-10) | H explorer |

Native token acquisition for an external EOA: **NOT FOUND** (searched docs for `native token|XO token|faucet|gas`, chainlist). The ToS says users are "solely responsible for paying any such network fees ... (for example, when placing a trade, creating a market, or withdrawing funds)" while the product docs say claims/creation are "sponsored" - contradictory wording (section 9).

### 4.2 What an external EOA can and cannot do

- Trading: cannot. Orders must be `signatureType = 3` (ERC-1271), `maker == signer == XO smart account` (Kernel v3). Owner EOA signs the Kernel-wrapped digest (domain `name="Kernel"`, `version="0.3.1"`, `chainId=3223`, `verifyingContract=<smart account>`, type `Kernel(bytes32 hash)`), wire format `0x01 || validator(0x845ADb2C711129d4f3966735eD98a9F09fC4cE57) || ecdsa(wrappedDigest)` (H, `/guides/smart-accounts.mdx`). The same wrapped signature authenticates the L1 `ClobAuth` call that mints API keys (`POST /auth/api-key`, `GET /auth/derive-api-key`); L2 = HMAC-SHA256 headers `XO_API_KEY, XO_TIMESTAMP (+-30 s), XO_PASSPHRASE, XO_SIGNATURE` (H, `/api-reference/authentication.mdx`; the OpenAPI text still says `POLY_API_KEY`/`POLY_PASSPHRASE`: docs inconsistency).
- UserOp signing: "Sign the bundler-computed `userOpHash` with the **owner EOA** of the smart account (raw ECDSA, same key that signs orders)" (H). Whether Kernel's ECDSA validator also accepts an EIP-191-prefixed signature (relevant to PayBox `message` vs `raw` intents) is NOT FOUND (validator `0x845A...` is not verified on the explorer).
- Creating the smart account: docs only say create it at `beta.xo.market`. Self-deployed Kernel accounts: NOT FOUND / untested (the exchange only needs ERC-1271, but the orderbook/bundler/paymaster policies for foreign accounts are undocumented).

### 4.3 Gas sponsorship (who pays) - H, verified `PolicyPaymaster`

- Docs: "The paymaster allowlists `ConditionalTokens.redeemPositions`, so redemption is gas-sponsored. The smart account does not need a native-token balance." Paymaster address: "from onboarding" (not in docs).
- Explorer: the sponsor seen in creation UserOps is `PolicyPaymaster` `0x2353b23d8f329fd3cec0d21652f14208248a439d` (verified source, no proxy). `validatePaymasterUserOp`: reject if paused; **`userOp.sender` is not allow-listed** (any smart account qualifies); every call in the account's `execute` (ERC-7579 single/batch, or legacy `execute`) must pass `_isAllowed(target, selector)`; per-sender daily cap `dailyTxLimit` (config log: 50 -> 5,000 -> **10,000**). No `paymasterData` signature is needed ("empty `paymasterData`" in docs). No `ContractWhitelisted`, `UnlimitedAddressSet`, `Paused` events exist.
- Allowlist (decoded from `GlobalSelectorAllowed` / `SelectorAllowed` logs): global `approve(address,uint256)` (any token) and ~33 other globally allowed selectors (unidentified); on **Conditional Tokens**: `redeemPositions`, `setApprovalForAll`, `splitPosition`, `mergePositions`, `safeTransferFrom`; on **USDC.e**: `transfer`; on the **market manager**: `createConvictionMarket`, `respondToUpdateRequest`, `cancelMarket` (+ four other selectors incl. the XO-only creators); on the oracle and two other contracts: further selectors. **Not allowlisted: the Hyperlane route's `transferRemote`** and CTF-Exchange order cancels (`incrementNonce`) as far as the decoded list shows (M: some selectors unidentified).
- Consequence: Enable Trading, redemption and conviction creation are gasless for any Kernel smart account that XO's bundler will accept; withdrawals and nonce-cancels are not obviously sponsored (M). The policy is owner-controlled and can be paused or narrowed at any time.

### 4.4 "Enable Trading" - exact on-chain steps

- Docs (H): "This grants your smart wallet's USDC allowance and Conditional Token operator approval. It is an enabling transaction, not the trade itself." Integrator version: "Approve the CTF Exchange for XO USDC and Conditional Tokens." Executed as UserOperations ("on-chain calls (approvals, split/merge/redeem) execute as ERC-4337 UserOperations through the XO bundler"). Spender/operator, amounts, and gas payer are **not stated** in the docs.
- On-chain (H): since block 12,000,000 (~2 weeks) there are **267** `Approval` events on USDC.e with spender = CTF Exchange, **all `2^256-1` (unlimited)**, and **267** `ApprovalForAll(owner, CTF Exchange, true)` events on Conditional Tokens. So XO's own "Enable Trading" = `USDC.e.approve(CTFExchange, MaxUint256)` + `ConditionalTokens.setApprovalForAll(CTFExchange, true)`, both paymaster-allowlisted. Whether a **capped** allowance works for trading is NOT FOUND (docs: "Budget a little extra USDC allowance on the smart account for taker buys so the fee can clear with the principal" suggests the exchange pulls principal + fee). Creation also needs `USDC.e.approve(XOClobMarketManager, >= fee)`; 451 of the first 1,000 approvals to the manager were unlimited.

---

## 5. GATE 7 - Terms, bots, policy, jurisdictions (`/legal/terms-of-service.mdx`, privacy policy)

Clauses (quoted sparingly; H):

- **Bots/automation:** Sec. 5 "No Improper Use of Data or Content": "You may not harvest or scrape data from the Platform for unauthorized purposes ... Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system." There is no bot ban and no bot licence; `llms.txt` has "No bots page". The API docs openly target bots/market makers and rate limits (public REST 5 req/s, auth single orders 250 req/s, batch 25 req/s, cancel-all 5 req/s, WS 25 concurrent auth, 100 msgs/s) but the RPC key requires onboarding ("use the XO onboarding channel provided to your team").
- **Manipulation / wash trading:** "market manipulation, such as wash trading (engaging in trades with yourself or colluding with others to create artificial activity or false liquidity), pumping or distorting prices through misinformation"; violators "may be suspended, and offending markets may be halted or resolved as 'invalid'". Product behaviour: self-matches earn no maker rebate (`maker-rebates.mdx`: "The trade is a self-match") and the orderbook has "self-trade prevention" as a cancellation reason (`/guides/order-types.mdx`). **The plan's "self-trading always allowed" conflicts with the wash-trading clause and cannot be executed against one's own resting orders (STP).**
- **Insider/influence:** "You must not engage in trading ... where you have direct or indirect influence over the outcome of a market." A creator who also trades is allowed to seed ($10+ stake is part of the product) but should not trade if it can influence resolution.
- **One account:** "Each user is generally allowed to register and use only one account"; "Creating multiple accounts to circumvent limits, abuse promotions, or manipulate markets is prohibited."
- **Geo / jurisdictions (Sec. 3):** not available where prediction markets are prohibited, comprehensive-sanctions territories ("Cuba, Iran, North Korea, Syria") and "such as the United States, the United Kingdom, France, Singapore, Ontario (Canada)"; the list may change "with or without notice". Users must not use "VPNs, proxies, Tor" to mask location. Privacy policy: "we might use your IP address to infer your approximate country for the sole purpose of blocking access from restricted regions"; geo check is "an automated check at login or transaction time". Eligibility is also "checked at the point of use" (`/product/policies/risk-and-eligibility.mdx`). A hosted plugin/agent runtime's egress IP could therefore be geo-blocked; not hard-codable (defer to XO's live check).
- **KYC / invite gating:** no KYC page; Privy social-login/embedded wallet; deposits may require provider "additional verification" and can end "Tainted". Product access can depend on "geography, account state, product access, verification and contest whitelisting". Invite/waitlist gating of the platform: NOT FOUND (searched: `rg -i "invite|waitlist|whitelist|allowlist|kyc"`; only referrals, Parlays whitelist, Boarding Pass). Parlays access is gated by CP/Boarding Pass.
- **Creator obligations/fees:** see 2.3; plus $1.00 non-refundable creation charge, >= $10 seed (a real position), content prohibitions, indemnity (Sec. 12(d)).
- **Resolution finality:** outcomes "final and binding"; "You waive any right to pursue external legal action against XO or its operators to contest a market outcome"; XO may mark "Invalid" (stakes "returned") or void with "50/50" settlement; XO may pause/freeze manipulated markets. Swiss law, arbitration in Zug, class-action waiver, 1-year claim limit, 30-day opt-out.
- **Fees clause:** XO "may charge a fee on trades, matched orders, or liquidity provisioning ... and/or a fee upon settlement"; can change fees prospectively. Gas: user "solely responsible" (but see sponsorship).
- **Termination:** XO may "suspend, restrict, or terminate your access ... (including disabling your ability to create or trade markets) at any time, with or without cause."
- Staleness: Privacy Policy 6/5/2025 (stale). ToS undated; Annex A's "Catalyst Badge ... one market per calendar week" is contradicted by on-chain behaviour (section 2.5), so treat Annex A as possibly outdated but still the written rule.

---

## 6. Fee schedule

- Docs (H): trading fees only on "eligible order-book markets" in XO USDC when an order fills; "Only the taker pays a trading fee. The maker pays no trading fee." Curve: `fee = filled shares x base rate x price x (1 - price)` (integer form `feeBps x C x tick x (1000 - tick) / (10_000 x 1000 x 1000)`, floor). Buy: fee added; sell: withheld from proceeds; partial fills charged on executed shares only. **Pulse: 6% taker base rate** (`/product/trading/fees.mdx`). Rates fetched per token via `GET /fee-rate` -> `{ "base_fee": <bps> }`; orders do **not** carry a fee rate ("Do not send or sign `feeRateBps`").
- Maker rewards: on maker-rebate markets maker fee is 0 and "XO returns **35% of the taker fee** to the maker", paid T+1; liquidity-reward pools get 10% of collected fees on eligible markets; referral pool is "15% of eligible taker fees" with tiers (referrer gets 5-15%). Creator share: **20% (claimed in what-is-xo only)** vs `creatorFeeBps=0` on-chain (see 2.2).
- Creation: $1.00 (verified on-chain, 585/585 fee events = 1,000,000 raw), seed >= $10.
- **Live check (H, discrepancy):** `GET /fee-rate` returned `{"base_fee":0}` for **all 18 sampled tokens**, including Pulse and event markets, despite the documented Pulse 6%. Either fees are applied by the executor at settlement (the manager's `matchOrders(..., takerFee, makerFees, feeDistribution)` overload takes fees as arguments, M) or the docs/endpoint are out of sync. The plugin must treat `/fee-rate` as advisory and show an estimate range.
- Orderbook floors: `422 size below minimum` / `notional below minimum` exist (OpenAPI examples: min 5,000,000 micro-shares; min notional 10,000 micro = $0.01) but `GET /book` returns `min_order_size: "0"` when MarketInfo isn't loaded; tick size 0.001 globally (H live).

---

## 7. Redemption / claim flow

- Docs (H, `/guides/redeem-positions.mdx`, `/product/portfolio/claim-payouts.mdx`): the orderbook does not move collateral. After settlement the smart account calls `ConditionalTokens.redeemPositions(collateral=XO USDC, parentCollectionId=0x00..00, conditionId, indexSets=[1,2])` as a UserOperation via the XO bundler (sponsored). Owner-EOA-signed normal transactions do not redeem the smart account's positions. Always pass both index sets; de-dupe per condition; batch several in one UserOp.
- Gate: `GET /claimable?address=<smart account>` is only a **hint**; the on-chain gate is `payoutDenominator(conditionId) > 0`; otherwise revert `result for condition not received yet`. Winner recorded is **not enough**: on-chain payouts are reported only when the market is **closed** after the resolution period (source: `close()` calls `reportPayouts`).
- Payouts: Resolved YES `[1,0]`, NO `[0,1]` (1 USDC.e per winning share); Voided `[1,1]` -> **0.5 USDC.e per share on each side**. 6-decimal shares and collateral. Check the UserOp receipt `success`; a bundle tx succeeding does not mean the redeem succeeded. Zero collateral usually = losing side or already redeemed (idempotent).
- UI: "Claim"/"Claim All"; wait for indexing; don't repeat while pending.

---

## 8. Resolution, states, pauses, cancellations (rules an agent must respect)

### 8.1 Market states (three vocabularies - reconcile before coding)

| Source | States |
|---|---|
| Product docs `/product/concepts/market-catalog.mdx` | Active, Paused, Resolved, Voided, Closed ("Terminal. The market ended without a resolution under engine rules.") |
| Guide `/guides/market-lifecycle.mdx` | Pending (422), Active, Paused (orders retained), Resolved/Voided/Closed (terminal; all resting orders cancelled atomically) |
| Data API schema | PENDING, ACTIVE, PAUSED, CLOSED, RESOLVED, VOIDED (+CANCELLED on detail rows). **Live data also returns `UPDATE_REQUIRED` and `VOIDED_CLOSED`** (H) |
| On-chain enum (`IXOMarketV1.MarketStatus`) | PENDING, CANCELLED, ACTIVE, PAUSED, RESOLVED, CLOSED, UPDATE_REQUIRED, VOIDED, VOIDED_CLOSED |

**Docs vs reality on CLOSED (H):** product docs call `Closed` a no-outcome state, but on-chain `CLOSED` is reached from `RESOLVED` after the resolution period (payouts reported), and in live data **1,929 of 1,929** sampled `CLOSED` rows have `winningOutcomeId` and `resolvedAt` set (only 3 sampled rows were `RESOLVED`). `VOIDED_CLOSED` = voided + payouts reported (14 sampled). An agent must **not** treat `CLOSED` as "nothing to claim"; use `/claimable` + `payoutDenominator`.

### 8.2 Order entry / orderbook rules

- Non-`Active` market: `422 {"error":"market is not active (status: X)"}`; substring-match "market is not active".
- Global trading pause: on-chain `TradingPaused` flips `GET /trading-state` to `{"state":"paused"}` (live: `active`); orders return `503 trading_paused` + `Retry-After: 60` ("advisory floor"); resting orders are retained; WS `trading_state_changed` on all channels. Handle by halting, not looping.
- Taker delay: marketable orders held **500 ms** (3 s for sports markets during match time); `POST /order` blocks for the window - set timeouts accordingly. Resting makers are not delayed.
- Order types: GTC/GTD/FAK/FOK; no MARKET value (cap price 0.99 BUY / 0.001 SELL); `postOnly` envelope flag; FOK failure returns HTTP 200 `success:false status:"delayed"`; tick 0.001; sizes human-decimal strings vs 6-decimal micro-units on the signed order.
- Auto-cancellation (4 causes, `/guides/auto-cancellation.mdx`): (1) opt-in heartbeat sweep (30 s; first successful `POST /heartbeats` opts you in; SDK background heartbeats are a footgun); (2) balance rebalance (LIFO cancel when on-chain balance drops, e.g. withdrawal); (3) terminal market transition (Resolved/Voided/Closed); (4) GTD expiry sweep (~10 s). Plus self-trade prevention (order-types guide). Resting buy orders reserve cash; sells reserve shares.
- Rate limit reality: documented Data API 100 req/10 s; I hit one `429 Rate limit exceeded` while paging at ~2.5 req/s (M). The Data API spec says `take` max 1000, but `take=100` and `take=400` returned `400 validations.MAXIMUM_NOT_OBSERVED`; `take=50` worked (H).

### 8.3 Resolution ("MODRA") and dispute windows

- Docs (M-H): `what-is-xo`: MODRA is "XO's AI Market Engine that assists in both market creation and resolution"; `how-markets-resolve.mdx` says "XO Oracle determines the final outcome" via stages (rules published -> trading ends/pauses -> evidence reviewed -> outcome recorded -> portfolio updates -> you claim); ToS: MODRA = "hybrid dispute resolution mechanism combining AI analysis ... and human jurors"; AI determinations "may be final without further review".
- **Dispute/challenge window length: NOT FOUND in docs** (searched `rg -i "dispute|challenge|juror|bond|appeal|window|escalat"`; the research notes' "bonded challenges"/"human juror court" are not in the docs beyond the ToS wording).
- **On-chain (H):** every market's `resolver` is a single address `XO_ORACLE` = `0xdb3206Bde18aeBd1b84657B98B9E0f55e0f95648` (an `ERC1967Proxy`; implementation `0xEF2D...d6Bf` is **not verified** on the explorer, so any proposal/dispute logic inside is unreadable; the Data API shows `resolutionType:"MANUAL"` and `resolverAddress` = this oracle). `resolve(conditionId, winner, notes)` and `voidMarket` are `onlyResolver`; `close()` is `onlyXOOracle` and enforces `resolvedAt + CONFIG_MANAGER.resolutionPeriod()` for non-Pulse markets (source comment: "Standard CLOB markets keep the dispute window enforced"; Pulse bypasses it). The `resolutionPeriod` value was **not read** (ConfigManager implementation unverified; reading it needs an `eth_call`, which needs the keyed RPC or a POST). Empirically (n=70 non-Pulse CLOB/Conviction markets) `MarketResolved/Voided -> MarketClosed` took median ~16 min, min 6 min, p90 ~2.0 h, max 2.06 h (H on logs) -> the on-chain dispute period is short (<= 6 min lower bound), then XO closes it. Pulse markets close at the same block as resolution.
- Resolve/void are blocked for `PENDING`, `UPDATE_REQUIRED`, `CANCELLED`, `CLOSED`; the oracle can pause/unpause an `ACTIVE` market; owner can cancel only while `PENDING`.
- Centralisation facts that matter to risk: CTF Exchange and the market manager are upgradeable proxies; the AccessManager can re-point/close selectors; one oracle address resolves all markets and XO can void in sole discretion (ToS).

---

## 9. Docs vs live/on-chain discrepancies (flag these in the plan)

| # | Docs say | Observed | Impact |
|---|---|---|---|
| 1 | Creation needs Catalyst Badge, 1 market/calendar week, admin approval (ToS Annex A) | Contract: public, $1 fee, no badge/limit; 132 creators, up to 14/day by one creator; only oracle approval is real | Plan's 2/day cap > ToS; compliance risk even though technically allowed |
| 2 | Creator earns 20% of lifetime fees (what-is-xo) | On-chain `creatorFeeBps=0 // fees not supported yet`; Data API `creatorBps=0` | Do not promise creator income |
| 3 | Pulse taker base rate 6% | `GET /fee-rate` = 0 for 18/18 sampled tokens | Fee estimates uncertain |
| 4 | `Closed` = ended without resolution | CLOSED rows have winners; redeem works only after close | Claim logic must not skip CLOSED |
| 5 | Testnet absent from docs ("single public production environment") | Testnet chain + explorer exist, no API hosts documented | Plan's testnet verification step has no endpoint set |
| 6 | Docs: gas "sponsored"; ToS: user pays gas | PolicyPaymaster sponsors allowlisted calls only | Withdrawals/cancels may need native XO |
| 7 | OpenAPI: `signatureType 0` for EOA; `POLY_API_KEY` headers; Data API `take` <= 1000 | Guide: EOA not accepted; auth guide uses `XO_*`; `take` > ~50 fails | Trust guides + live behaviour over generated spec text |
| 8 | Deposit: "EVM or Solana wallet" and "token picker USDC-only" | On-chain only Base route (9,610/9,610) | Source-chain support must be confirmed with XO |
| 9 | Data API creator fields | Constant across all 2,238 sampled CLOB rows | Don't use for creator attribution |
| 10 | Privacy policy 6/5/2025; ToS undated | - | Re-check terms at integration time |

---

## 10. Implications for the plan (for the lead to weigh; not decisions)

1. **Creation is NOT UI-only at contract level.** The plan's "contract-level path" exists: `approve(manager, fee)` + `createConvictionMarket(startsAt, expiresAt, USDC.e, metaDataURI)` as a Kernel-account UserOp, paymaster-sponsored, then wait for `reviewMarket`. But (a) it needs the XO smart account (owner = PayBox EOA) with `userOpHash` signing via PayBox `raw`/`message` intent, not a plain EVM proposal; (b) it needs a hosted metadata JSON the oracle will accept (unknown); (c) ToS Annex A forbids it without a Catalyst Badge and beyond 1/week; (d) XO can close the selector at will. Per the author's rule ("answer is an XO partnership or contract-level path, not browser automation"), this supports pursuing an XO partnership / written permission rather than silent direct calls.
2. **`io.paybox/transactionProposal` mismatch:** XO actions are UserOps from a contract account, not EOA transactions; only `approve`/`setApprovalForAll`-style steps could be proposals if executed by the EOA itself (they would approve from the EOA, which is useless for XO). The viable shape is sign-then-submit (`request_wallet_sign` over typed data / userOpHash -> plugin submits to the XO bundler/orderbook). Gate 8 owns that.
3. **Caps:** creation cap of 2/day exceeds the ToS 1/week; funding-in-flow is blocked until XO confirms a deposit route; "capped allowance" in `xo_enable_trading` is untested (XO's own flow uses unlimited).
4. **Self-trading:** the ToS wash-trading clause and orderbook STP conflict with "always allowed"; keep the mark-and-log but expect cancellations/penalties.
5. **Geo:** plugin/runtime egress IP and the user's location both matter; US/UK/France/Singapore/Ontario are named restricted regions.
6. **Reads are safe regardless** (public REST 5 req/s; Data API ~100/10 s with `take` <= 50 in practice); fee, state, and creator fields need defensive parsing.

---

## 11. NOT FOUND (what was searched)

- Any create/propose/graduate API: both OpenAPI path lists, `rg` over `/` for create/conviction/graduat/seed/eligib/review/creator/propos/catalyst/factory/MarketCreated.
- Graduation threshold: `rg -i graduat /` (2 hits, definition only).
- Funding provider name, supported source chains/assets, deposit/withdraw minimums, fees, latency: `/product/accounts/*`, `llms.txt`, bridge/provider regexes.
- Native-token acquisition / faucet, explorer URL, testnet hosts in docs: `rg -i "native|faucet|explorer|blockscout|testnet|1000101"`.
- Paymaster address in docs: "from onboarding" (found on-chain instead).
- Dispute/challenge window length, bonds, juror process: `rg -i "dispute|challenge|juror|bond|appeal"`.
- Bot policy page, KYC page, invite/waitlist: `llms.txt` + `rg`.
- Exact `resolutionPeriod` value; `collateralConfig` struct semantics (ConfigManager implementation `0x370bFF02...` unverified).
- Base-side router code/token/fees (Base explorers 403).
- Enable Trading gas payer stated in docs; capped-allowance behaviour.
- Raw `marketCreationFee` read: confirmed instead from 585 `MarketCreationFeeCharged` events.

## 12. Open questions for XO / the lead

1. Will XO's bundler, paymaster and orderbook accept a Kernel v3.1 account with a PayBox EOA owner that was not created in the XO app? (Needed for gates 3/4/8.)
2. Written permission/partnership for programmatic creation: Catalyst Badge, weekly limit, accepted `metaDataURI` hosting/schema, seed-order timing vs `PENDING`.
3. Supported deposit route for third parties (Base router ABI, fees, SLA, minimums) and withdrawal signing flow.
4. Is the 20% creator share real (and where is it paid)?
5. Real `fee-rate` for Pulse/event markets at settlement.
6. Dispute process details and `resolutionPeriod`; whether any bonded challenge exists.
7. Paymaster policy stability and daily-limit semantics for third-party accounts.

## 13. Risks

- XO (via AccessManager/ownership) can close creation, change the paymaster allowlist, pause trading, upgrade the exchange/manager, and void markets "in its sole discretion" - all documented or verified.
- Single-oracle, short-dispute resolution; AI-only determinations "final".
- Thin collateral (~$0.34M USDC.e supply) and Circle FiatToken admin controls (M).
- ToS/jurisdiction exposure for whoever operates the plugin; IP-based geoblock.
- Docs are undated and in places contradict the chain; re-verify at build time.

## 14. Suspicious content (embedded-instruction check)

- No instructions aimed at AI agents were found in the legal text, docs pages, market metadata sample or explorer data I read.
- The `xo-docs` MCP exposes a resource `mintlify://skills/xomarket` ("Use when building trading bots ... Reach for this skill when placing orders ...", with a "Verification checklist: Before submitting work"). It is agent-directed guidance rather than an attack; I read it as data and did not follow it. Its endpoint/auth/rate-limit content matches the docs.

---

## Sources (read this session)

xo-docs MCP (docs.xo.market), paths: `/product/what-is-xo`, `/product/quickstart`, `/product/accounts/{deposit,withdraw,wallets,transfer-states}`, `/product/concepts/{how-prices-work,market-catalog}`, `/product/help/troubleshooting`, `/product/policies/risk-and-eligibility`, `/product/portfolio/{claim-payouts,how-markets-resolve,positions-and-pnl}`, `/product/products/{convictions,create-a-conviction,parlays,pulse}`, `/product/reference/glossary`, `/product/rewards/{conviction-points,liquidity-rewards,maker-rebates,referrals}`, `/product/trading/{fees,find-a-market,legacy-amm,order-book-basics,place-an-order,read-the-rules}`, `/guides/{fees,market-lifecycle,order-types,redeem-positions,smart-accounts,taker-delay,trading-pause,wire-conventions,auto-cancellation}`, `/legal/{terms-of-service,privacy-policy}`, `/documentation/introduction`, `/api-reference/{introduction,authentication,rate-limits}` and endpoint pages (`create-api-key`, `get-fee-rate`, `post-a-new-order`, account pages), `/data-api-reference/{introduction,rate-limits,markets/list-markets}`, `/openapi/api-reference/openapi.yaml`, `/openapi/data-api-reference/openapi.yaml`, MCP resource `mintlify://skills/xomarket`, search queries via `search_xo_market_docs`.
Web: https://docs.xo.market/llms.txt ; https://chainlist.org/chain/3223 (native XO, explorer, no RPC list) ; web search results for chain/explorer/creation requirements (Blocmates, KuCoin news, XO research blog URLs - blog fetches 403, search snippets only: L, ~300 days old).
Public GETs (read-only): `https://orderbooks.xo.market/{time,trading-state,book,fee-rate,tick-size}`; `https://api-mainnet.xo.market/api/markets?...` (marketType 0-3, marketScope=default/onlyClob, pages of 50); `https://explorer-mainnet.xo.market/api/v2/{stats,smart-contracts/<addr>,addresses/<addr>,transactions/<hash>[/logs|/token-transfers|/internal-transactions],tokens/<usdc.e>,tokens/<usdc.e>/transfers,config/backend-version}` and `/api?module=logs&action=getLogs&...` for: AccessManager `TargetFunctionRoleUpdated`/`TargetClosed`; manager `CLOBMarketCreated`, `MarketReviewed`, `MarketResolved`, `MarketClosed`, `MarketVoided`, `MarketCreationFeeCharged`; PolicyPaymaster config events; USDC.e `Approval`, `Mint`, `Burn`; Conditional Tokens `ApprovalForAll`; route `ReceivedTransferRemote`/`SentTransferRemote`; ConfigManager logs; https://explorer-testnet.xo.market/api/v2/stats. One metadata JSON on the XO S3 bucket (schema sample). One `gh api` tree listing of `hyperlane-xyz/hyperlane-registry` (no XO USDC route listed; `deployments/warp_routes/XO` exists, chains dir has no XO entry).
Short verbatim quotes used above come from the pages named inline; scratch files (logs, source extracts) are in the session scratchpad, not the repo.

---

## Verification (2026-10-19)

Adversarial re-derivation by an independent verifier. Method: re-read both OpenAPI specs (`jq '.paths'`, top-level keys, webhooks), re-ran keyword sweeps (create, new market, launch, propose, publish, permissionless, deposit, bridge, on-ramp, fund, withdraw, bot, automated, onboarding, partner, faucet, sandbox, dispute, graduat, 20%) over the docs filesystem and `llms.txt`, re-read the ToS and privacy policy text, and re-pulled the on-chain evidence from the public Blockscout API with GET-only calls (verified contract source, AccessManager role logs, fee/creation/review/mint/bridge/approval logs, paymaster config logs, sample creation txs). Explorer `getLogs` silently caps each response at 1000 results, so I re-pulled every large set with adaptive block-range splitting and de-duplicated by (tx, logIndex). No money-moving or signing tool was called, no POST was sent, no third-party code was run. The notes file was scanned: it contains only protocol-contract addresses (EntryPoint, CTF Exchange, Conditional Tokens, USDC.e, manager proxy/impl, AccessManager, PolicyPaymaster, XO_ORACLE proxy, Hyperlane route and its Base-side router, Kernel validator), no user wallet, key, API key or email. The Base-side router is the sole origin sender of all 9,645 inbound messages, so it is a router, not a person.

### Overall

Gate-level conclusions (all four partial) stand. Every auth/endpoint/domain/address/ToS/paymaster/role-wiring/fee-event fact I rechecked reproduced exactly. The errors are concentrated in log-derived aggregates where the original pull hit the 1000-row cap while still being tagged H, plus one wrong statement about contract verification status. Treat any H-tagged count in sections 2.5, 3.2 and 8 as approximate until re-pulled; use the corrected figures below.

### REFUTED

1. **Section 2.5 "Conviction-type (marketType=4) creations by month: Aug 81, Sep 17, Oct 176" (= 274).** On-chain `CLOBMarketCreated` with marketType 4 (CLOB_CONVICTION) totals **585**: Aug 152, Sep 256, Oct 177 (to 2026-10-18). This equals the 585 `MarketCreationFeeCharged` events one-for-one (all 585 fee events map to a marketType-4 creation). The 274 figure came from a truncated pull. Other creation totals for context: marketType 3 (CLOB_PULSE) 44,065; marketType 2 (CLOB) 2,424. (H, getLogs with topic0 `CLOBMarketCreated`, 47,074 events de-duplicated.)
2. **Section 3.2 "implementation named HypFiatToken ... unverified code" (also summary: route code not verified).** The XO-side route implementation `HypFiatToken` (0xdc4b86...D052) IS fully verified on the explorer (`is_fully_verified: true`, source available, compiler 0.8.22, 43 ABI entries). Readable ABI includes `transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount) payable`, `quoteTransferRemote(...)`, `quoteGasPayment(uint32)`, `enrollRemoteRouter(s)`, `routers`, `domains`, `feeHook`, `feeRecipient`, `feeToken`, `interchainSecurityModule`, `destinationGas`, plus `ReceivedTransferRemote`/`SentTransferRemote`. So the XO-side ABI for Gate 6 is available; only the Base-side router code remains unverifiable from here (Base explorers were not retried). The route has a fee hook/recipient, so a per-transfer fee is possible (value not read; needs eth_call).

### CORRECTED

3. **Section 2.5 review outcomes ("274 matched ... 54% / 36% / 9%, median 10.2 min, p90 235 min, max 524 min").** Over all 585 conviction markets: first (and only) `MarketReviewed` decision APPROVE 287 (50.3%), UPDATE_REQUIRED 233 (40.8%), REJECT 51 (8.9%), none yet 14. Creation-to-review latency (n=571): min 0.5 min, median 9.9, p75 34.0, p90 166, max 652 min. Direction is unchanged (about half approved, roughly 9% rejected, median ~10 min) but UPDATE_REQUIRED is more common than reported. Every reviewed condition has exactly one `MarketReviewed` event (2,946 events, 2,946 conditions, of which 2,375 are non-conviction markets).
4. **Section 3.2 bridge counts ("9,610 inbound, 8,277 outbound", "10,514 Mint events", "9,601 + 731 + 182 mints").** Re-pulled with no cap: `ReceivedTransferRemote` **9,645**, `SentTransferRemote` **8,821**, `Mint` **10,915** = 9,645 (route 0x9090..., 2026-03-22 to 2026-10-18) + **1,088** (one other minter, 2026-05-02 only) + 182 (third minter, 2026-05-02 only). The +35 inbound is consistent with a day of new traffic; the outbound and second-minter differences are truncation. **The structural claim is confirmed and strengthened: 100% of inbound events have origin domain 8453 and 100% of outbound have destination 8453; all 9,645 Hyperlane `Process` messages to the route come from one Base sender (the router the notes cite).** Amount range: smallest inbound is 0.00001 USDC (not ~0.03); median inbound ~$16, outbound ~$26; max $30,000 / $25,000.
5. **Section 2.2/9 "on-chain creatorFeeBps is 0".** True for the current manager source (`m.creatorFeeBps = 0; // fees not supported yet`) and for every CLOB (2,424) and Conviction (585) creation event. But 2,705 early CLOB_PULSE creation events (first seen May 2026, block 5,323,052) emitted creatorFeeBps = 200 from an earlier implementation. Does not change the Conviction conclusion; it does mean "never non-zero on-chain" is wrong for Pulse history. The Data API creator fields remain constant (one creatorId, creatorBps 0, reviewStatus null across 200 freshly sampled `marketType=2,onlyClob` rows).
6. **Section 6 live `/fee-rate` evidence.** Reproduced: `base_fee: 0` for 30 of 30 real active tokens (8 Pulse, 22 CLOB), against the documented 6% Pulse rate. But the endpoint also returns `{"base_fee":0}` for a nonexistent `token_id=1`, so the zero may be a default, not an affirmative "this market has a 0% fee". The docs/endpoint disagreement is real; the inference that fees are actually 0 is not supported. Estimate fees from the docs and check fills.
7. **Section 4.4 "267 of each".** Now 268 `Approval(spender=CTF Exchange)` and 268 `ApprovalForAll(CTF Exchange, true)` since block 12.0M, all 2^256-1 / true (count grows with time; no discrepancy).
8. **Section 4.3 "transferRemote is not in the decoded allowlist (M)".** Upgraded to H: I computed the `transferRemote(uint32,bytes32,uint256)` selector and it appears in neither the 34 `GlobalSelectorAllowed` entries nor any of the 46 `SelectorAllowed` events (none target the route contract). Net allow state decoded from logs: manager 0x7f54a7a2 (createConvictionMarket), createConvictionMarketFor, createCLOBMarket, respondToUpdateRequest, cancelMarket; Conditional Tokens redeemPositions/splitPosition/mergePositions/setApprovalForAll/safeTransferFrom; USDC.e transfer; global approve. 33 global selectors remain unidentified. Also confirmed: no ContractWhitelisted, UnlimitedAddressSet, Paused or Unpaused events; DailyTxLimitUpdated 50 -> 5,000 -> 10,000; validatePaymasterUserOp has no signature check; **25 of 25 most recent creation txs carry this paymaster in `UserOperationEvent`**.
9. **Section 5 "no bot ban".** Accurate for the General Terms (Sec. 5 "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system"). Missed: the Boarding Pass Terms (clause 9) list "automated tools, bots or other Sybil techniques" as grounds to revoke a pass, and clause 8 repeats the VPN/proxy certification. Those are scoped to the Boarding Pass campaign, not trading, but show XO treats bots as a sybil signal.
10. **Data API `type` enum.** The Data API spec documents `type` 0 STANDARD, 1 PULSE, 2 CLOB, 3 CLOB_PULSE only. On-chain there is a fifth type, CLOB_CONVICTION (4), with 585 markets. Do not use the Data API `type` field to identify Conviction markets (and the spec's status enum omits UPDATE_REQUIRED and VOIDED_CLOSED, which the live API returns: 1 UPDATE_REQUIRED and 14 VOIDED_CLOSED rows today).

### CONFIRMED (independently re-derived, no change)

- Both OpenAPI path/method lists exactly as in 2.1; no webhooks key; no `x-` creation operations. Docs sweeps with new keywords (launch, propose, publish, permissionless, createMarket, on-ramp, bridge, hyperlane, cctp, faucet, sandbox, partner) find nothing beyond `create-a-conviction`, `fees`, `what-is-xo` and the ToS.
- `createConvictionMarket(uint40,uint40,address,string)`: NatSpec "`restricted` but wired to `PUBLIC_ROLE`, so in practice open to everyone: the creation fee is what gates spam" and "non-refundable under every outcome"; selector 0x7f54a7a2 -> role 18446744073709551615 at block 0x8ae613 = 9,102,867; createConvictionMarketFor 0x507cedd3 and createCLOBMarket 0x3585dec1 -> role 73; createPulseCLOBMarket 0xe9df1f93 -> role 72; no TargetClosed event; role 73 has 2 grant events and role 72 has 1.
- 585 `MarketCreationFeeCharged` events, every one exactly 1,000,000 raw; 132 distinct creators; 2026-08-14 to 2026-10-18; 73 creators had two creations inside a 7-day window; max 14 by one creator in one UTC day; max 70 total by one creator. `_createMarket` stores PENDING, `resolver = XO_ORACLE`; `reviewMarket` is `onlyXOOracle`; `close()` is `onlyXOOracle` and enforces `resolvedAt + resolutionPeriod()` except for CLOB_PULSE.
- ToS Annex A quotes verbatim (500 CP, "7-10" login streak, linked social account, "maximum of one (1) market per calendar week. Attempted submissions beyond this limit will be rejected by the Platform", admin review, badge revocable for circumventing restrictions); wash-trading, influence, one-account, VPN/proxy/Tor, restricted-region (US, UK, France, Singapore, Ontario) clauses; Sec. 12(d) indemnity; privacy policy `Last Updated: 6/5/2025`; "automated check at login or transaction time".
- Docs: deposit/withdraw pages name no provider, chain, asset, minimum, fee or latency; `llms.txt` has no pages on bots, KYC, testnet, gas or bridging; introduction says "single public production environment"; RPC `api_key` issued privately during onboarding; paymaster address "from onboarding"; "Deposit XO USDC into the smart account via the `beta.xo.market` deposit flow".
- Chain: explorer stats gas 5 gwei (slow/average/fast 5.0), coin_price null, 12.6M blocks, ~1.48 s blocks; chain registry (chainid.network) lists chain 3223 "XO Market", native currency XO, 18 decimals, explorer-mainnet.xo.market; chainlist lists chain 1000101 "XO Chain Testnet", native XO, explorer-testnet.xo.market (testnet explorer: 7.0M blocks, ~4.7 s, gas price 0). The notes' "4.8 s" should read ~4.7 s. No testnet orderbook/bundler/API host is documented.
- Docs numbers: 500 ms / 3 s taker delay, 30 s heartbeat, ~10 s GTD sweep, LIFO balance cancel, 503 `trading_paused` + `Retry-After: 60`, Pulse 6% taker, maker rebate 35%, liquidity pool 10% of fees, referral pool 15% (5% to 15% to referrer), public REST 5 req/s, Data API 100 req/10 s, redeem `[1,2]` index sets, `[1,1]` voided payout, `payoutDenominator > 0` gate, bundler accepts zero fees; "20% of all lifetime trading fees" appears only in `what-is-xo.mdx`; graduation only defined there; the OpenAPI text still says `signatureType = 0` for direct EOA and `POLY_API_KEY`/`POLY_PASSPHRASE` while the guides and auth page say EOA unsupported and `XO_*` headers.
- Docs vs reality on Closed: `how-markets-resolve` still says Closed has "no outcome recorded"; live Data API returns CLOSED rows (first 50 of 46,133 `onlyClob` CLOSED rows all have `winningOutcomeId`) and UPDATE_REQUIRED / VOIDED_CLOSED statuses.

### UNVERIFIABLE by this verifier

- "Dispute/challenge window length": still NOT FOUND in docs (re-searched: resolution period, dispute, challenge, juror, bond, appeal via rg and semantic search). The `resolutionPeriod()` value is not readable without an eth_call (needs the keyed RPC or a POST). I did not recompute the "median ~16 min between resolve/void and close (n=70)" figure; treat as M.
- Funding provider name, chains, minimums, fees, latency, native-XO acquisition, creator metadata hosting, XO_ORACLE implementation logic, Base-side router code: still NOT FOUND. One external web search for a named provider found none (older press, ~305 days, mentions Base/Ethereum/BNB: L); the search budget was then exhausted, so no second search ran.
- The researcher's disclosed single POST (`eth_chainId`) and the 403 on research.xo.market / Base explorers cannot be re-checked.
- "Kernel ECDSA validator accepts EIP-191-prefixed signatures" and "foreign smart accounts accepted by bundler/orderbook/paymaster": not testable read-only; remain open.

### Missed items worth carrying forward

- The 1000-row `getLogs` cap is a systematic risk for anyone re-using these scripts: always split block ranges until a response is under 1000 rows.
- The route's `quoteTransferRemote` / fee hook means Base-to-XO transfers may carry a protocol fee in addition to Hyperlane gas; amount is unread.
- Rejected markets still pay the $1 fee (non-refundable in all outcomes), and 41% of first reviews are UPDATE_REQUIRED, so a plugin should budget for fee-per-attempt, not fee-per-live-market.
