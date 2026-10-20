# X3X (World Chain mini-app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs only (DefiLlama API, Blockscout v2 REST on World Chain, World's public app-metadata endpoint, the X3X web-app shell), WebFetch of World developer docs, `gh api` for the DefiLlama adapter sources. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. JSON-RPC (`eth_call`) was deliberately NOT used because it is a POST; everything on-chain was read through Blockscout GETs. Third-party text was treated as untrusted data; nothing in it was followed.

Research limit: the shared WebSearch budget ran out after three searches (the fourth, on World's gambling policy, was refused), so the policy section relies on WebFetch of World's docs. WebFetch of `https://x.com/x3x_studio` returned HTTP 402 (x.com paywall, not an X3X payment requirement); recorded and not pursued.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each) are in `docs/research/fixtures/x3x-world-chain-mini-app/` (section 11).

---

## 0. Bottom line

1. **This is not a prediction market (H).** It is a single-player, house-banked "pick a tile in each row, avoid the trap, cash out any time" game, settled by an admin key. There are no events, no outcomes, no counterparties, no price that relates to a real-world event. DefiLlama files it under "Prediction Market" only because its adapter was written as a generic dimension.
2. **Still live, but small and shrinking (H).** On-chain settlement transactions were landing on 2026-10-19; DefiLlama 24h volume is about $68, 30d about $6.3k, TVL about $2.6k. Monthly stake volume fell from about $53.8k (Jun 2025) to about $4.2k (Oct 2026, 19 days).
3. **Fixed 12% house edge, set off-chain (H, derived from six on-chain settlements).** `payout = 0.88 x product(n_i/(n_i-1))` over the rows survived, with exactly one trap per row.
4. **No read API of its own, no trade API (H/M).** Only on-chain events, a Blockscout/DefiLlama side channel, and World's public app-metadata JSON. Bet creation needs a server-signed authorisation from X3X's backend; cash-out and loss settlement are `onlyAdmin`. A third-party agent cannot place or settle a bet.
5. **No arbitrage relevance.** Negative expected value by construction (-12%), no event overlap with any other venue, nothing to hedge against.
6. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Latest `PayoutSent` / `GameCreated` logs on the active contract `0x68f571e43C8d96e40c2DAdb69f4a13749D563095` (Blockscout `/addresses/{a}/logs`) | block 36,520,401, block timestamp 2026-10-19T02:20:29Z (`GameCreated`, game id 1,201,108, bet 2 WLD), `cashOut` tx 2026-10-19T02:20:41Z | H |
| Blockscout `/addresses/{a}/counters` for that contract | 1,191,440 transactions, 1,397,794 token transfers | H |
| DefiLlama `GET https://api.llama.fi/summary/dexs/x3x` (fetched 2026-10-19) | `total24h` 68.21, `total7d` 1,052.3, `total30d` 6,313.16, `total1y` 125,183.94, `totalAllTime` 337,193.15 (USD, WLD-priced stake volume) | H |
| World public app metadata (`world-id-assets.com`, section 3) | `verification_status: verified`, `unique_users: 91692`, `impressions: 12627365`, `app_rating: 4.05`, `deleted_at` absent | H |
| `https://world.org/ecosystem/app_8fa9...` | HTTP 200, 420 KB client-rendered shell titled "Ecosystem - An app in the World ecosystem"; the app id appears only in canonical/hreflang tags. App name is NOT in the server-rendered HTML, so the listing is confirmed only through the metadata endpoint above | H |
| `https://app.x3x.studio/` | HTTP 200, 1.6 KB Vite shell, `<title>X3X Game</title>`, no content in HTML | H |

Verdict: **still_live = true** as a game, but marginal: monthly stake volume (DefiLlama daily chart summed by month): 2025-06 $53.8k, 2025-09 $43.6k, 2025-12 $12.3k, 2026-03 $5.9k, 2026-06 $15.0k, 2026-09 $4.6k, 2026-10 (to the 19th) $4.2k. Recent daily volume ranges roughly $50-$1,000 (H).

Stale item: a search snippet of the X profile (L, "last indexed ~507 days ago") said X3X plus a sister app Z3Z serve "100k users". Not relied on.

---

## 2. Kind and market model

- **kind: house-banked casino-style game (crash/mines/"tower" family), not a market (H).** World's own listing text: "1. Choose your bet amount 2. In each row, pick one tile... but there's always a single trap waiting 3. Hit the trap and lose it all 4. Cash out anytime... or keep going and race to a massive 1000x prize or more!" (`world-id-assets.com` metadata, `description.overview`). World category: "Gaming".
- **Mechanics from source (H, verified contract `X3XGame` on World Chain; compiler v0.8.28; source in fixtures).** `createGame` escrows the WLD stake and stores a `Game` struct (`createdAt, player, betAmount, status {Active, Won, Lost}, payoutAmount, gameSeedHash, gameSeed, gameConfig, gameState`). The contract's own doc comment says the game is where "players navigate through a grid to maximize their potential winnings".
- **Board config (H).** `gameConfig` in a real `createGame` user-operation was `{"rowConfig":[6,5,6,3,5,3,4,5,4,4,...]}`, 50 rows, each row with 2 to 6 tiles and one trap. Survival probability per row = (n-1)/n.
- **Payout formula (H, derived).** From six recent on-chain games (fixture `derived-house-edge-samples.json`): `payout / stake = 0.88 x product(n_i / (n_i - 1))` for the rows survived, exactly 0.88 of the fair multiplier in all six (for example stake 2 WLD, one row of 6 tiles, payout 2.112 WLD = 1.056x; stake 0.1 WLD, rows [2,2], payout 0.352 WLD = 3.52x). The 0.88 factor is **not on-chain**: the contract's `cashOut` takes an arbitrary `payoutAmount` from the admin, so the 12% edge is an off-chain parameter the operator can change at will (H for the mechanism, M that it is constant over time).
- **Tokenisation: none (H).** No ERC-20/1155 position token. State is only the `games` mapping keyed by a sequential `onChainGameId` (1,201,108 at the time of reading). Player tile choices are NOT on-chain while the game runs; `gameState` (for example `{"selectedTiles":[0]}`) and the revealed `gameSeed` are written only at settlement.
- **Observed stakes (H):** 0.1 WLD and 2 WLD in the five latest games.

---

## 3. Chains and collateral

- Chain: **World Chain (chain id 480; M for the id, H for the chain name)**. Collateral: **WLD only** (`0x2cFc85d8E48F8EAB294be644d9E25C3030863003`, hard-coded constant in the contract; World metadata `permit2_tokens` lists only this token) (H).
- Contracts associated with the app (World metadata `contracts`, H; Blockscout facts H unless noted):

| Address (World Chain) | Name | State |
|---|---|---|
| `0x68f571e43C8d96e40c2DAdb69f4a13749D563095` | `X3XGame` (verified 2026-01-24) | **Active "V2"**: 1,191,440 txs; holds 5,302.03 WLD (about $2.6k at Blockscout's $0.4927 rate) |
| `0x1FD5Bb99b8469916e1D2a65e186b7b30b2C6021A` | "V1" (named in DefiLlama TVL adapter; not inspected beyond counters) | 3,103 txs; holds about 0.005 WLD, effectively retired |
| `0xfD724468e9913d0EBb37AB4D06E42Ca0CDd38eeE` | `XXXGame` (verified 2026-09-18) | **Dead**: 4 txs, all 2025-06-01/02, zero balance. DefiLlama's volume adapter labels it "new" and V2 "old"; that comment is inverted or stale |
| `0x18D61bC668ac1Bf1A80D27d49BFc5a127963e46C` | `X3XPoint` (verified 2026-09-18) | Active `createGame` (latest log 2026-10-19T03:23Z) but no `cashOut`/`markGameAsLost` in its ABI and not counted by DefiLlama: appears to be a points/non-WLD variant (M, purpose not confirmed) |
| `0x0b68815E27F7bAE8E87191568A26d786d0AC0B15` | `X3XPoint` | 19 txs, last 2025-06 |
| `0xD42d7a28619471dFC3Cc0F563A274F42569A5397` | `ReferralRewards` | 2,203 txs, `withdrawTokens` on 2026-10-13 |
| `0x02dd362c2c17482ec5d6151b3b20e878e855a758` | unverified | 8 txs, 2025-06 |

- Wallets: players use World App wallets, which are ERC-4337 smart accounts. The `GameCreated` log was emitted inside an `EntryPoint.handleOps` transaction (EntryPoint `0x0000000071727De22E5E9d8BAf0edAc6f37da032`) (H).
- Stake is pulled with **Permit2 `permitTransferFrom` (SignatureTransfer)** (H, source). World's current mini-app docs say "SignatureTransfer is no longer supported. Please use Allowance Transfers" (H, docs.world.org send-transaction). X3X still works on 2026-10-19, so this is a fragility rather than a blocker (M).

---

## 4. Read API

- **exists = none (official).** No public API, SDK, docs site or repo found. World metadata `source_code_url` is empty and `integration_url` is just the web app `https://app.x3x.studio`. The web app's own backend endpoints are undocumented and were NOT probed.
- NOT FOUND (searched: world.org listing, `world-id-assets.com` metadata, `app.x3x.studio` HTML and robots.txt, GitHub-hosted DefiLlama adapters, three web searches): docs URL, OpenAPI, websocket, rate limits, any GitHub org for X3X.

Side channels that do work (all unauthenticated GET, all third-party):

| Source | Use | Tag |
|---|---|---|
| `https://api.llama.fi/summary/dexs/x3x` | daily stake volume series (502 days, 31 KB) | H |
| `https://api.llama.fi/tvl/x3x` | returned `2579.1317886500433` on 2026-10-19 | H |
| `https://worldchain-mainnet.explorer.alchemy.com/api/v2/addresses/{a}/logs`, `/transactions`, `/counters`, `/token-balances`, `/smart-contracts/{a}` | events `GameCreated(string preliminaryGameId, uint256 indexed onChainGameId, address indexed player, uint256 betAmount, bytes32 gameSeedHash)`, `PayoutSent(uint256 indexed onChainGameId, uint256 amount, address indexed recipient)`, `GameStatusUpdated(uint256 indexed, uint8)`; decoded admin txs `cashOut(onChainGameId, payoutAmount, gameState, gameSeed)` / `markGameAsLost(...)` | H |
| `https://world-id-assets.com/api/v2/public/app/app_8fa94e7384f9634e6797d6fe132fe35a` | app name, description, supported countries, contracts, unique users. Reached because `developer.worldcoin.org/api/v2/public/app/{id}` answered `{"error":"Invalid Request Origin, please use https://world-id-assets.com"}`. Undocumented in what I read, so treat the shape as unstable (M) | H (shape observed) |

Rate limits for Blockscout and DefiLlama: NOT FOUND (not probed beyond about 30 requests, no throttling seen).

---

## 5. Trade path

- **trade_path = none for a third party.**
- `createGame(params, permit, transferDetails, signature)` checks `keccak256(abi.encode("createGame", preliminaryGameId, gameSeedHash, gameConfig, deadline, msg.sender, requestedAmount))` was signed by the contract **owner** (V2: owner **or any admin**) with a deadline. Only the X3X backend holds that key, so a caller cannot even open a game without the operator's per-game signature (H, source). The backend's API for requesting that signature is undocumented (NOT FOUND).
- `cashOut` and `markGameAsLost` are `onlyAdmin` (H). The player has **no on-chain way to cash out or contest a result**; every tile pick goes through the operator's server, and the operator then submits the settlement tx with whatever `payoutAmount` it chooses. A player who is not settled has no recourse on-chain.
- `withdrawTokens(amount, token, recipient)` is `onlyOwner`: the owner can withdraw the entire escrowed WLD at any time (H). Combined with admin-set payouts this is a pure custodial/operator-trust design.
- Could an EVM wallet reachable through PayBox trade it? **No.** Reasons: (1) every game needs the operator's server signature; (2) the product is delivered as a World App mini-app (`is_android_only: true`, `app_mode: mini-app`), and the stake is authorised through World App's 4337 account and Permit2 flow; (3) it lives on World Chain, and the repo's PayBox notes only record Base/Ethereum/BNB in the catalog (World Chain support NOT FOUND, not probed); (4) there is nothing worth trading (section 9). No PayBox tool was called.

---

## 6. Fees

- No explicit fee parameter. **Cost = 12% house edge embedded in the payout multiplier (0.88 of fair)** paid by the player. The 0.88 factor is applied once to the final multiplier, not per row (H, derived from 6 samples, section 2).
- Gas: user-operation gas is paid through World App's account flow; whether it is sponsored is NOT FOUND. Admin settlement gas is paid by the operator.
- Contract comment: withdrawn funds "represent implicitly collected fees (Total Bets - Total Net Payouts)" (H).

---

## 7. Resolution mechanism and dispute risk

- Claimed scheme: "provably fair" commit-reveal. `gameSeedHash` ("Hash of the seed + gameConfig + algoVersion", per the struct comment) is committed at `createGame`; `gameSeed` is revealed at settlement (H, source). Example: game 1,201,108 committed hash `0xe31cfaea...` and revealed seed `0xb2698e40...` (H, decoded txs).
- What is NOT verifiable: the hash function, the exact preimage layout, the algorithm version and the seed-to-trap mapping are not published (NOT FOUND: no docs, no repo). So fairness is "check after the fact if you can reverse-engineer it", not a proof. The contract does not recompute or check the seed, the traps or the payout.
- Dispute: none. Admin writes the final status and payout. DefiLlama `audits: "0"`; no audit report found (M).
- Counterparty/solvency risk: the contract held 5,302 WLD against theoretical multipliers up to 1000x, so large wins depend on bankroll (M).

---

## 8. Geo / ToS / automation

- World metadata `supported_countries`: **159 ISO codes (H)**. It includes GB, FR, DE, SG, AU, CA, JP, IN, KR and many others; it does **not** include **US** (H, checked), CN or RU. `is_android_only: true`, `supported_languages: ["en"]`, `is_for_humans_only: false`.
- World's mini-app guidelines: "avoid building chance based games" ("prize awarded based on chance, not skill") (H, `docs.world.org/mini-apps/guidelines/app-guidelines`). X3X is verified and listed anyway; policy-removal risk is real (M).
- Betting/prediction-market-specific rules, geographic rules beyond the country list, and automation/bot rules: not addressed in that page (H).
- X3X terms of service / responsible-gambling page: NOT FOUND (searched: `app.x3x.studio` HTML shell, robots.txt, World metadata). `app.x3x.studio/robots.txt` is Cloudflare-managed boilerplate with content signals; I did not treat it as a ToS.
- Support contact is published only as a mailto in the World metadata; not used.

---

## 9. Liquidity and arbitrage relevance

- Liquidity (all USD, WLD priced by DefiLlama/Blockscout): 24h $68 (2026-10-19); 7d $1,052; 30d $6,313; 1y $125,184; all-time $337,193 (all H, `api.llama.fi`, fetched 2026-10-19). TVL $2,579 (H, same day); contract WLD balance 5,302.03 WLD (H, Blockscout `token-balances`). These are **stake** sums, not open interest. All-time figure counts only V2 and the dead XXXGame, not V1 or the points contract.
- Event categories overlapping other venues: **none**. No sports, politics, crypto-price, or macro events exist. Outcomes are random traps generated by the operator.
- Shared liquidity: none; bankroll is the operator's own contract. It is independent of every other venue but also not a market you can take a view on.
- Signal value for Quotient or the scanner: none identified.

---

## 10. Adapter priority and open questions

**skip.** Not a prediction market; no event outcomes; -12% EV; operator-signed entry and operator-only settlement; no API; tiny, declining volume; no overlap with any other venue. If a catalogue wants a record, tag it `kind=casino-game`, `tradable=false`.

Open questions (nothing here would change the verdict):
- What does `X3XPoint` (`0x18D6...`) do exactly, and is it WLD-free? (read-only ABI shows no payout function)
- Algorithm and hash preimage for `gameSeedHash`.
- Whether World will keep allowing SignatureTransfer for these contracts.

---

## 11. Fixtures saved (all < 50 KB)

`docs/research/fixtures/x3x-world-chain-mini-app/`
- `defillama-summary-dexs-x3x.json` - DefiLlama summary + 502-day volume series (31 KB).
- `world-app-public-metadata.json` - World public app metadata (3.6 KB; includes the studio's own public support mailto, verbatim).
- `blockscout-gamecreated-log-sample.json` - one decoded `GameCreated` log.
- `blockscout-settlement-tx-sample.json` - two decoded admin settlement transactions (`cashOut`, `markGameAsLost`) with `gameState`/`gameSeed`.
- `blockscout-wld-balance-x3xgame.json` - WLD balance of the active contract (raw 18 decimals).
- `derived-house-edge-samples.json` - my six-game payout/fair-multiplier computation.
- `X3XGame.sol.txt` - verified source of the active contract as served by Blockscout.

---

## 12. Sources

Primary / first-party (H):
- World public app metadata: https://world-id-assets.com/api/v2/public/app/app_8fa94e7384f9634e6797d6fe132fe35a (found via the error text from https://developer.worldcoin.org/api/v2/public/app/app_8fa94e7384f9634e6797d6fe132fe35a)
- World ecosystem listing (shell): https://world.org/ecosystem/app_8fa94e7384f9634e6797d6fe132fe35a
- X3X web app shell: https://app.x3x.studio/ and https://app.x3x.studio/robots.txt
- Active contract, verified source and ABI: https://worldchain-mainnet.explorer.alchemy.com/api/v2/smart-contracts/0x68f571e43C8d96e40c2DAdb69f4a13749D563095
- Dead contract `XXXGame`: https://worldchain-mainnet.explorer.alchemy.com/api/v2/smart-contracts/0xfD724468e9913d0EBb37AB4D06E42Ca0CDd38eeE
- Blockscout address, logs, transactions, counters, token balances for the contracts above: https://worldchain-mainnet.explorer.alchemy.com/api/v2/addresses/{address}[/logs|/transactions|/counters|/token-balances]
- World docs, MiniKit transactions: https://docs.world.org/mini-apps/commands/send-transaction ; Pay: https://docs.world.org/mini-apps/commands/pay ; guidelines: https://docs.world.org/mini-apps/guidelines/app-guidelines

Secondary (M):
- DefiLlama protocol and volume API: https://api.llama.fi/summary/dexs/x3x , https://api.llama.fi/tvl/x3x , https://api.llama.fi/protocol/x3x , https://api.llama.fi/overview/dexs (category "Prediction Market", id 6272)
- DefiLlama adapters: https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/x3x.ts , https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/x3x/index.js
- Web search snippet of https://x.com/x3x_studio (L, stale ~507 days; the page itself returned HTTP 402 to WebFetch)

Not found (searched: world.org listing, World metadata, app.x3x.studio, DefiLlama protocol record, three web searches, GitHub adapter repos): official docs, API, GitHub, audit report, terms of service, fairness algorithm, rate limits, websocket.

Untrusted-content note: no embedded instructions to AI agents were found in any fetched page or response. The app shell loads third-party analytics scripts (Google Tag Manager, Cloudflare Web Analytics, a World "oculus" SDK and `nsdk.x3x.studio/nsdk.js`); none were executed or followed.
