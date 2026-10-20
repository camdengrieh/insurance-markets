# R3R (World Chain mini-app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs only (World app-metadata host, DefiLlama API, World Chain Blockscout REST API, the app's own static HTML and one static JS bundle read as text and never executed), `gh api` raw read of the DefiLlama adapter, one WebFetch attempt. No account, wallet, key, signature, POST/PUT/DELETE or money-moving PayBox tool was used. One read-only PayBox call (`discover_tokens` mode=chains) checked chain metadata. The app's internal `/api/r/*` routes (visible only as strings in the JS bundle) were deliberately NOT probed: undocumented and session-gated.

Research limits: the shared WebSearch budget was exhausted, so no web search was possible. Discovery rests on first-party endpoints. A WebFetch of `https://x.com/x3x_studio` returned HTTP 402 Payment Required; nothing was paid and the page was not read. No docs site, whitepaper, GitHub org or X posts were found or read.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference from first-hand data; **L** = weak or stale.

Fixtures (all <= 50 KB): `docs/research/fixtures/r3r-world-chain-mini-app/` (section 12).

---

## 0. Bottom line

1. **R3R is not a prediction market. It is a house-run roulette game (a casino mini-app).** World's own app-store record names it "R3R : Choose, Spin & Win WLD! Repeat!", category **Gaming**, overview "Choose your favorite icon, spin the roulette, and win WLD!" (H, https://world-id-assets.com/api/v2/public/app/app_bf747d63b2fe4b537e4a91ae48ac3aed). The verified contract's own header says "R3R roulette game" (H, `R3RGame.sol`). The DefiLlama blurb "Predict the result and get paid from the pool prize" is marketing copy that put it in the "Prediction Market" category; it does not describe an event market (M).
2. **No events, no outcomes tied to real-world facts, no order book, no AMM, no pool.** Each bet is a player-vs-house spin. The spin result is decided off-chain by the operator's server and the operator's admin key pays out any amount it chooses (H, source, section 2).
3. **Effectively dormant (H).** The contract has ever recorded only **12 games**, **2.1 WLD (about 1 USD) wagered in total**, last game **2025-11-09**; nothing since (about 11 months). World's record has `show_in_app_store: false`, `verification_status: "changes_requested"`, `unique_users: 7`. The "TVL" of about 1.46K USD is the operator's WLD bankroll sitting in the contract (2,999.39 WLD x WLD price), not user liquidity.
4. **No read API, no trade path an outside wallet could use.** `createGame` requires a signature from the operator's server key. Outcome and payout are written by the operator (section 6).
5. **adapter_priority = skip.** Not an event market, no overlapping categories, no integrable API, dormant. Do not build an adapter. Treat any DefiLlama "Prediction Market" row of this team (R3R, X3X) as a gambling-game false positive in discovery filters.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://r3r.x3x.studio/` | HTTP 200, 1.6 KB Vite SPA shell titled "R3R Game". A front end is still being served. | H |
| `GET https://world.org/ecosystem/app_bf747d63b2fe4b537e4a91ae48ac3aed` | HTTP 200, but a generic client-rendered shell ("An app in the World ecosystem"). It names no app. WebFetch of the page also found no R3R content. | H |
| World app record (host `world-id-assets.com`) | `show_in_app_store: false`, `verification_status: "changes_requested"`, `is_reviewer_app_store_approved: false`, `unique_users: 7`, `impressions: 37`, `deleted_at: null`, `is_android_only: true`. Not delisted-deleted, but not in the public app store and not approved. | H |
| On-chain game activity (Blockscout) | `GameCreated` ids 1..12 between 2025-08-10 (block 17754016) and **2025-11-09** (block 21672562). Contract-level counters: 17 direct transactions (admin calls), 82 token transfers, latest internal call 2025-11-09. Nothing in the 11 months to 2026-10-19 (chain head about block 36.52M). | H |
| DefiLlama | Listed 2025-08-14 (`listedAt` 1755166445). Series still ticks daily (last point 2026-10-19, 1,459 USD). The series is just 2,999 WLD times the WLD price: 3,246 USD on 2025-08-14, 1,459 USD on 2026-10-19. The balance never moved. | H |

Verdict: **still_live = false** for practical purposes (front end reachable, product dormant for about 11 months and out of the app store). Last relevant activity is older than 6 months, so everything about "current" usage is stale-risk.

---

## 2. Kind and market model

- **Kind: other (on-chain-settled casino roulette mini-app inside World App, custodial only for the duration of one spin).** Not a prediction market (H).
- **Game (H, bundle text https://r3r.x3x.studio/assets/index-B9106yee.js):** the front end defines six wheel symbols with a payout multiplier and a segment count: Clover-Purple (payout 2, count 6), Diamond-Pink (2, 6), Star-Green (14, 1), Star-Yellow (14, 1), Spade-Purple (7, 1), Spade-Pink (7, 1). That is 16 segments. Player picks an icon "pattern" and a bet size, server returns the result. The exact win rule and house edge are NOT FOUND (searched: contract, bundle, site); the table alone does not fix the RTP (it depends on whether the same-icon variants pay together), so none is claimed.
- **Settlement is operator-decided (H, `R3RGame.sol`):**
  - `createGame(params, permit, transferDetails, signature)`: player escrows WLD via Permit2; requires a server-signed hash over (`"createGame"`, preliminaryGameId, gameSeedHash, gameConfig, deadline, msg.sender, requestedAmount). Stores only hashes (`gameSeedHash`, `configHash`) of the seed and config (a commit-reveal for "provably fair").
  - `cashOut(onChainGameId, payoutAmount, gameState, gameSeed)`: callable only by owner or an admin; pays any `payoutAmount > 0` from the contract to the player. No on-chain check that the payout matches any rule or any random source.
  - `markGameAsLost(...)`: admin only; optionally sends a "bonus" in a side token to the loser.
  - `withdrawFunds`/`withdrawTokens`: owner can drain the bankroll at any time (the deployer did withdraw tokens on 2025-08-13).
  - `batchAdminActions` does a `delegatecall` to self from an admin (self-delegatecall, so no foreign code, but it widens the admin surface).
  - 11 `AdminAdded` events exist (H, logs). Number of live admin keys not checked.
- **Outcome tokenisation: none.** No ERC-20/1155 positions, no market ids; state is a `Game` struct per game (`betAmount`, `status` Active/Won/Lost, `payoutAmount`).
- **Side mechanics (H):** 0.5% of each bet (default `swapPercentageBasisPoints` = 50 bps) is swapped from WLD to a target token (default HTAP) through a Uniswap-V3-style router with `amountOutMinimum: 0` (so the swap is sandwichable; irrelevant to us), and marketing "reward tokens" can be airdropped per game. The contract holds about 40 different token balances (promo tokens), shown by Blockscout.
- **Second contract:** the World record whitelists `0xdDf4560Fc83232845563b858Ad4C2f94A58d2918` (name "Z3ZPoint", verified, 0 transactions, different deployer). Per the bundle it is the app's points contract (the bundle also embeds an `R3RPoint` ABI). It holds no funds (H).

---

## 3. Chains and collateral

- **Chain: World Chain only (chainId 480, `eip155:480`).** (H: DefiLlama `chains: ["World Chain"]`; Blockscout host is World Chain.)
- **Collateral: WLD** (`0x2cFc85d8E48F8EAB294be644d9E25C3030863003`, 18 decimals, H: contract constant `WLD`, World record `permit2_tokens`). Deposits move through **Permit2** (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) signature transfers authorised by the player, which fits World App's MiniKit signing model (M).
- **Contract:** `R3RGame` at `0xeDF3e2F4E4816b45c8f540c6Cee62DdA033d7950`, deployed 2025-08-10, compiler solc 0.8.28 (Blockscout shows verified; no proxy). This address is the only one the DefiLlama adapter reads (H, https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/r3r/index.js).
- **Bet sizes seen:** 0.1 WLD (eleven games) and 1.0 WLD (one game) (H, logs).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **None.** No developer docs, GitHub repo (the World record's `source_code_url` is empty), OpenAPI or websocket found. | H (absence in World record), searched: site, bundle, record |
| Internal web-app backend | Same-origin routes on `r3r.x3x.studio`, visible only as strings in the bundle: `/api/r/user`, `/api/r/game/active`, `/api/r/game/create`, `/api/r/game/create/submit`, `/api/r/game/stop-roulette`, `/api/r/game/last-patterns`, `/api/r/history`, `/api/r/leaderboard`, `/api/r/stat`, `/api/r/point`, `/api/r/daily-check-in`, `/api/auth/nonce`, `/api/auth/complete-siwe`. Auth is a Sign-in-with-Ethereum session cookie. Not probed, not documented, no ToS permission to scrape. | H (strings), not probed |
| On-chain reads | Contract getters: `getGameDetails(id)`, `getOnChainGameId(preliminaryId)`, `gameCounter()`, `games(id)`, `verifyGameConfig(id, config)`, `getSwapInfo()`. Events: `GameCreated`, `PayoutSent`, `GameStatusUpdated`, `TokenSwapped`, `AdminAdded`. Readable through any World Chain RPC or Blockscout REST: `https://worldchain-mainnet.explorer.alchemy.com/api/v2/addresses/<addr>`, `/logs`, `/counters`, `/token-balances`, `/transactions`, `/smart-contracts/<addr>` (all plain GET, no key, H, responses saved). | H |
| Rate limits | Blockscout: not documented in what I read; no throttling seen over about 15 requests. | L |
| World app metadata | `GET https://world-id-assets.com/api/v2/public/app/<app_id>` (public GET; the sibling `developer.worldcoin.org` host answers "Invalid Request Origin, please use https://world-id-assets.com"). Returns name, description, category, whitelisted contracts, usage counts. Useful for discovery/liveness only. | H |
| Prices / books / trades / resolution | **Not applicable** (no markets). The only price-like item is the fixed payout multiplier table in section 2. | H |

---

## 5. Trade path

- **Programmatic placement: none usable by a third party.** To open a game the caller must present a hash signed by the operator's server key (`_verifyOwnerSignature` accepts only the owner or an admin) that binds the caller, bet amount, seed hash and a deadline. The signature is issued by the operator's backend after a World App SIWE login (H: bundle routes `/api/auth/nonce`, `/api/auth/complete-siwe`, `/api/r/game/create`, `/api/r/game/create/submit`). There is no open order, no RFQ and no public endpoint that returns that signature without that session.
- **Win payout** is a separate admin transaction after the server decides the result (`cashOut`).
- **Verdict for an EVM wallet via PayBox:** no. Even if the wallet could sign a Permit2 message, it cannot obtain the operator's authorising signature without the SIWE session in World App. See `paybox_reachable` below.

---

## 6. Fees and economics

- **Explicit fee: NOT FOUND (searched: contract, bundle, World record).** The contract states "funds represent implicitly collected fees (Total Bets - Total Net Payouts)" (H, `withdrawFunds` comment), i.e. the house edge is implicit in the operator-set payout.
- **0.5% of each bet** is diverted to a swap into a target token (default HTAP) by default (H, constructor); it is a protocol-side skim, but the bonus can be returned to losers via `markGameAsLost` (H).
- **Observed:** 12 games, 2.1 WLD staked, 4 wins paid 2.6 WLD total (H, logs: payouts of 0.2, 0.2, 0.2, 2.0 WLD for games 11, 6, 4 and 8). A sample of 12 says nothing about the edge.

---

## 7. Resolution and dispute risk

- **Resolution: the operator's server computes the roulette result; an admin key records it on-chain.** The "provably fair" claim rests on a commit-reveal (`gameSeedHash` and `configHash` committed at creation, `gameSeed` stored at settlement, and `verifyGameConfig` lets anyone check the config hash after the game). Whether the revealed seed deterministically reproduces the outcome is NOT verified here (that logic is off-chain), and the contract does not constrain `payoutAmount` to it (H, source). **Operator trust risk is total**: the owner can also withdraw the whole bankroll (H).
- **Dispute process: NOT FOUND.** No UMA/oracle/dispute window; no documented terms (searched: site, record).

---

## 8. Geo, ToS, automation

- **Geo (H, World record):** `supported_countries` lists 150+ ISO codes and omits, among others, the US, China and many others (the list is a World-app-store availability list, not a legal opinion). `is_android_only: true`. The R3R site also loads a `geo.x3x.studio` helper (H, bundle URL).
- **ToS / automation rules: NOT FOUND** (searched: site shell, bundle strings, World record: `how_it_works`, `how_to_connect` are empty strings; support is a `mailto:` address only). No API terms because there is no public API.
- Regulatory note (M): a stake-and-spin game with house-set payout is a gambling product in most jurisdictions; do not attach it to a prediction-market product line.

---

## 9. Liquidity

| Metric | Value | Source and date |
|---|---|---|
| "TVL" | 1,459.69 USD (2,999.39 WLD in the contract) | DefiLlama `https://api.llama.fi/protocols`, fetched 2026-10-19 (H); WLD balance and rate 0.492664 from Blockscout `/token-balances`, 2026-10-19 (H) |
| Lifetime wagers | 2.1 WLD (about 1 USD) over 12 games | Blockscout logs, through 2025-11-09 (H) |
| Players | `unique_users` 7 | World record, fetched 2026-10-19 (H) |
| Recent volume | zero since 2025-11-09 | Blockscout (H) |

The TVL is the operator's own bankroll plus about 40 promo tokens; it is not liquidity available to anyone.

---

## 10. Event-category overlap and independence (for arbitrage)

- **Overlap with other venues: none.** No sports, politics, crypto-price or macro questions exist; the "event" is a random wheel stop. There is nothing to arbitrage or to use as a signal.
- **Shares liquidity with another venue: no**, because there is no market liquidity at all. Same-team sibling **X3X** (DefiLlama id 6272, "Place your bet, cash out 1000x", `x3x_studio`, TVL about 2.6K USD, contracts `0x1FD5Bb99...6021A` and `0x68f571e4...D563095`) is also a gambling game on World Chain with the same operator (H, DefiLlama adapter). Not researched further.

---

## 11. Adapter recommendation

**skip.** Reasons, in order: not an event market; operator-decided outcomes and payouts; no public API and a server-signed entry; dormant for about 11 months with roughly 1 USD lifetime volume; no category overlap. If this class of "World Chain mini-app" appears again in discovery, filter on the World app record's `category.id` (here `gaming`) instead of DefiLlama's "Prediction Market" tag.

---

## 12. Fixtures

All under `docs/research/fixtures/r3r-world-chain-mini-app/`:

| File | What | Source |
|---|---|---|
| `world-id-assets-app-metadata.json` | Full World app record (2.9 KB) | `GET https://world-id-assets.com/api/v2/public/app/app_bf747d63b2fe4b537e4a91ae48ac3aed`, 2026-10-19 |
| `defillama-protocol-r3r-trimmed.json` | DefiLlama protocol record, TVL series trimmed to first 3 and last 8 points | `GET https://api.llama.fi/protocol/r3r`, 2026-10-19 |
| `blockscout-address-r3r.json` | Contract address record (name `R3RGame`, verified, creator, creation tx) | `GET https://worldchain-mainnet.explorer.alchemy.com/api/v2/addresses/0xeDF3e2F4E4816b45c8f540c6Cee62DdA033d7950` |
| `blockscout-r3r-logs-sample.json` | 14 decoded events (GameCreated, PayoutSent, GameStatusUpdated, TokenSwapped); player/recipient addresses truncated by me | `.../addresses/<R3RGame>/logs` |
| `R3RGame.sol` | Verified Solidity source (main file, 32 KB, treated as data, never executed) | `.../smart-contracts/<R3RGame>` |
| `R3RGame-abi.json` | ABI plus compiler metadata | same |

---

## Suspicious content / safety notes

- No instructions aimed at AI agents were found in any page, API response or source file read.
- The public JS bundle contains a hard-coded QuikNode World Chain RPC URL that embeds an API token in its path. It was **not** copied into these notes, not used and not tested. Flagging it as a leaked third-party credential in a public asset.
- The page loads third-party scripts (`oculus-sdk.humanlabs.world`, `nsdk.x3x.studio`, Google Tag Manager, Cloudflare Insights). None was fetched or executed.
- WebFetch of `x.com/x3x_studio` returned HTTP 402; payment requirements not read and nothing paid.

## Sources

1. World app record (H): https://world-id-assets.com/api/v2/public/app/app_bf747d63b2fe4b537e4a91ae48ac3aed
2. World ecosystem page, generic shell (H): https://world.org/ecosystem/app_bf747d63b2fe4b537e4a91ae48ac3aed
3. DefiLlama protocols and R3R record (H): https://api.llama.fi/protocols , https://api.llama.fi/protocol/r3r
4. DefiLlama adapter (H): https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/r3r/index.js (read via `gh api`)
5. Contract page and verified source (H): https://worldchain-mainnet.explorer.alchemy.com/address/0xeDF3e2F4E4816b45c8f540c6Cee62DdA033d7950 (REST: `/api/v2/addresses/...`, `/smart-contracts/...`, `/logs`, `/counters`, `/token-balances`, `/transactions`, `/internal-transactions`)
6. App front end and bundle (H): https://r3r.x3x.studio/ , https://r3r.x3x.studio/assets/index-B9106yee.js
7. Second whitelisted contract Z3ZPoint (H): https://worldchain-mainnet.explorer.alchemy.com/address/0xdDf4560Fc83232845563b858Ad4C2f94A58d2918
8. PayBox chain catalog (M, "metadata catalog, not a support allowlist"): `discover_tokens` mode=chains returned `eip155:480` World Chain.
9. NOT usable: X (`x.com/x3x_studio`, HTTP 402); WebSearch (session budget exhausted).

## Open questions

- Is a newer R3R contract deployed that the World record does not whitelist? (Only `0xeDF3...7950` and the points contract are listed; deployer activity ended 2025-08-13, H.)
- Is the product being relaunched under another name? (X3X studio: not researched.)
- True house edge and whether outcomes follow the revealed seed. Not needed unless the venue is revived.
