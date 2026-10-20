# YOLOrekt - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~01:05-01:10 UTC). READ-ONLY: WebFetch, `gh api` file reads, unauthenticated GETs (generic UA `insurance-markets-research/0.1`), public explorer GETs. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. WebSearch was NOT available this run (session search budget exhausted), so discovery relied on direct fetches, GitHub search and explorer APIs; absence of evidence below is therefore weaker than usual and is flagged. Third-party text was treated as untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/yolorekt/` (section 11). There is no public venue API, so these are liveness evidence, not API samples.

---

## 0. Bottom line

1. **Dead / dormant. Skip.** The official domain `yolorekt.finance` now redirects (via `/lander`) to a GoDaddy "for sale" parking page, and every subdomain tried (www, app, api, docs, play) resolves to the same parking IPs or fails TLS (H, section 1). Last official post on the project's Medium publication is 2023-10-26, almost 3 years ago (H). The CMC "listing" is an unverified preview page with circulating supply 0 (M).
2. **Product it was (M/L):** a short-horizon "will price finish above/below strike" binary game (3-minute and 24-hour rounds) on Polygon with USDC, pool-based payouts with LP-seeded liquidity, later extended to a leveraged "FUTURE$" product. Crypto-price only (plus a "SPY game" and TSLA/DOGE pair constants), so overlap with other venues would only be on very short crypto-price intervals that other venues rarely offer.
3. **No public API found, no docs site, no live contracts identified, no liquidity data anywhere** (DefiLlama and CoinGecko have no YOLOrekt entry).
4. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://yolorekt.finance/` | 200, body is only `window.location.href="/lander"` | H (curl, 2026-10-19) |
| `GET https://yolorekt.finance/lander` | 307 to `https://forsale.godaddy.com/forsale/yolorekt.finance?utm_source=TDFS_DASLNC&utm_medium=parkedpages...` i.e. a GoDaddy parked-domain "for sale" page. The forsale page itself returned 403 to me, so I did not read any price/text. | H for the redirect; the "for sale" meaning is M (inferred from the URL path) |
| DNS | `yolorekt.finance`, `www`, `app`, `api`, `docs`, `play` subdomains all resolve to 13.248.169.48 / 76.223.54.146 (same parking IPs, i.e. wildcard); `app.` and `docs.` fail TLS ("unrecognized name"). `yolorekt.xyz/.app/.gg` do not resolve. `yolorekt.io` NXDOMAIN, `yolorekt.com` timed out. | H |
| Medium publication RSS (https://medium.com/feed/yolorekt) | 10 items, newest 2023-10-26 "Pimp Your YOLOREKT Trades: Trailing Stop-Loss Has Your Money"; before that 2023-07-24, 2023-05-19, 2023-03-02, 2022-12-30. Nothing after 2023-10-26. No sunset/wind-down notice among the 10 items I saw. | H (stale: ~36 months) |
| GitHub org `YOLOrekt` | 4 public repos, newest push 2022-07-29 (`community-bug-bounty`). Nothing newer. | H |
| Third-party profile (API Evangelist, repo created 2026-08-02, pushed 2026-10-18) | Says "the yolorekt.finance domain no longer resolves and the project appears dormant". Auto-generated stub, tier "stub"; treat as corroboration only. | M |
| CMC page https://coinmarketcap.com/currencies/yolorekt/ (fetched via WebFetch, small-model summary) | "decentralized short-term prediction exchange"; labelled "preview page"; circulating supply 0; no price/volume/holders data; links to yolorekt.finance, a Medium litepaper and the GitHub bug-bounty repo; single contract 0x8116...3c4db4 on Ethereum. Page is not evidence of activity. | M |
| CoinGecko search "yolorekt" | `{"coins":[],...}` empty | H |
| DefiLlama `/protocol/yolorekt` | "Protocol not found". (A different project, "YOLO Games" on Blast, yologames.io, is unrelated.) | H |
| X/Twitter @playyolorekt (named in repo README) | Not readable without JS; not verified. | NOT FOUND |
| WebSearch for 2025-2026 news/relaunch/shutdown | NOT FOUND (searched: WebSearch unavailable this run - budget exhausted). Could not rule out a rebrand or relaunch under another domain. | open question |

Verdict: **still_live = false** (high confidence the original product at yolorekt.finance is gone; medium confidence there is no successor).

---

## 2. Kind and market model

- **Kind (M):** short-horizon crypto price-direction game ("prediction exchange"), later a leveraged perp-like "FUTURE$" front end. Not a general event-prediction market: only asset price vs strike.
- **Model, from the 2022 public bug-bounty contract source (M for "this is what was deployed"; the repo is v1 code from 2022-07-29 and the product was rebuilt as "v2" in Aug 2022 and "FUTURE$" in Dec 2022, so production may differ):**
  - `GameInstance.sol` doc: "A binary prediction market for a given asset pair, `GAME_PAIR`, and round duration denoted in seconds, `GAME_LENGTH`." (H that this text exists in the repo)
  - Per round: `strikePrice` set at round start; users bid `isUp` true/false with USDC (`bidInYolo(amount, isUp, bidRound)`; minimum 5 USDC; can bid up to 10 rounds ahead; cannot bid in the live round). (H, `contracts/game/GameInstance.sol`)
  - **Parimutuel pools with LP-seeded liquidity**: `RoundPool{totalUserUp,totalUserDown,upLiquidity,downLiquidity}`; payout to a winner = `(bid * totalOppositeSide / totalOwnSide + bid) * (10000 - lpFeeRate)/10000`; if one side has no counter-liquidity the bid is refunded; **ties go to Down**. (H, `_calculatePayout`)
  - **Not an order book, not an AMM, and no tradeable outcome tokens** in this version: bids are `BidInfo` rows in a per-user linked list inside the game contract (user balance tracked in `YoloWallet`); only LP shares are tokenised (`YoloShareTokens`, symbol YLP, ERC-1155). (H code; M extrapolation to production)
  - Pairs in constants: ETH_USD, TSLA_USD, DOGE_USD. Marketing copy says ETH, BTC, MATIC; later a "SPY Game" (Nov 2022 post). (H code constants; M marketing)
  - Game lengths per Dec 2022 post: "3 minute and 24 hour games". (H, Medium post, stale)
  - FUTURE$ (Dec 2022): "Leverage up-to 100x", "charges fees only if users are profitable", "fees on earned profits ... 10%". In Private Beta then. (H text, stale, likely never fully shipped)

## 3. Chains and collateral

- Polygon PoS + USDC for play (M: API Evangelist profile says "Built on the Polygon network"; Medium v2.1 post says deposit/withdraw USDC, "Exchange via Polygon", card deposit via Transak; contract uses USDC with 6 decimals). Native "YOLO Wallet" custody layer inside the game contracts (`YoloWallet`) rather than per-bid wallet transfers.
- YOLO utility token dual-issued on Ethereum and Polygon (H, repo `synced-dual-token-issuance`). The Ethereum token the CMC page lists, `0x811648E10C9cD7f7517644928f3B45FB953c4db4` ("Yolo Utility", 1B supply), has **2 holders and 2 transfers, the last on 2021-07-13** (H, Blockscout, 2026-10-19; fixture). So it is an early 2021 deployment, not an active token.
- No production contract addresses for GameInstance/LiquidityPool/YoloWallet were found in the repos (the config in the issuance repo is for Goerli/Mumbai test networks). NOT FOUND (searched: repo configs, README, CMC page).

## 4. Read API

- **exists = none** (nothing public found). No docs site (docs.* resolves to parking), no OpenAPI, no subgraph URL, no GitHub API repo. API Evangelist also records "delivered as Ethereum and Polygon smart contracts rather than a traditional REST/GraphQL API" and `public: false` for access (M).
- On-chain read would be possible only if the production contract addresses were known (public getters `roundDatas`, `gamePools`, `allBids`, `bidsManager`, `calculateExpectedReturns` exist in the 2022 source), but they are not published anywhere I could reach. NOT FOUND.
- Websocket / rate limits: NOT FOUND.

## 5. Trade path

- Per the 2022 source, `bidInYolo` is a plain public contract call (USDC `approve` + transaction), so in principle any EVM wallet on Polygon could bid; there is no order signing or relayer in the code I read. But there is no live app/contract to point at, so effectively **none**.
- Round settlement is by a privileged role: `processRound(startTime, settlementPrice, nextStrikePrice)` is `onlyAuthorized(GAME_ADMIN_ROLE)` and takes the settlement price as an argument. **No on-chain oracle is referenced in this version; the operator supplies the price** (H code; M that production did the same). That is a trust-the-operator resolution model.

## 6. PayBox reachability

**no** - venue is dead, and even in principle the settlement is operator-controlled and there is no documented market-listing surface. If it were revived on Polygon, a PayBox EVM wallet could send plain USDC approve + `bidInYolo` transactions, but that is hypothetical.

## 7. Fees

- LP fee: `lpFeeRate = 300` basis points default (3%), set per round (`RoundData.lpFeeRate`), taken from the **total** pool of the round; admin-adjustable above a global `FEE_RATE_MIN` (H, code). Paid by winners via reduced payout factor `(10000-lpFeeRate)/10000`; accrues to LPs.
- FUTURE$ product: no fee on losses; "10% fees on earned profits", with a 1% (of that 10%) royalty for beta bidders (H text, Dec 2022 Medium, stale).
- Gas: Polygon (assumed).

## 8. Resolution and dispute risk

- Operator-pushed settlement price via admin role; no dispute process in the code. Rounds are minutes to 24h, so there is no UMA-style dispute window. Counterparty/operator risk is high; ties resolve to Down (H code). Contracts were audited per the repo README claims ("repeated revision and audits") but no audit reports were read here (L).

## 9. Geo / ToS / automation

NOT FOUND (searched: yolorekt.finance is parked; no ToS page reachable; Medium posts do not mention geo-blocking). Nothing to quote.

## 10. Liquidity and event overlap

- Liquidity: **none verifiable**. No DefiLlama/CoinGecko entry; CMC shows 0 circulating supply and no volume (M). No TVL/OI/volume figure with a date exists in any source I could read. The only dated datum: Ethereum YOLO token activity ended 2021-07-13 (H).
- Categories: crypto price direction only (ETH/BTC/MATIC; stray TSLA/DOGE/SPY). Overlap with other venues (Polymarket/Kalshi daily or 15-min crypto-up/down, Limitless hourly) would be conceptual only; the 3-minute horizon has no direct counterpart.
- Shared liquidity: it had its own LP pool (YLP shares) - independent, but irrelevant now.

## 11. Fixtures (all in `docs/research/fixtures/yolorekt/`)

- `yolorekt-finance-http-2026-10-19.txt` - the redirect chain and DNS evidence for the parked domain.
- `eth-blockscout-yolo-token-0x8116.json` - Blockscout metadata for the CMC-listed token: `holders_count: "2"`, supply 1e27.
- `eth-blockscout-yolo-token-transfers.json` - its 2 transfers (2021-07-08 mint, 2021-07-13 transfer).
- `medium-feed-titles.json` - titles and dates of the 10 items in the Medium RSS feed (no body text).

## 12. Suspicious content / embedded instructions

None found. (The API Evangelist README contains a block of self-descriptive "about this repository" boilerplate and a takedown/contact policy; it is not addressed to AI agents and was not followed.)

## 13. Open questions

1. Is there a rebrand or relaunch (e.g. under a new domain or on another chain) after the Oct 2023 posts? Could not check news/search this run.
2. What are the production Polygon contract addresses, and is anything still holding funds or accepting bids? (Only matters if someone wants an on-chain adapter; not recommended.)
3. Who owns the @playyolorekt X account and was there a shutdown announcement there?

## Sources

- https://yolorekt.finance , https://yolorekt.finance/lander (curl, 2026-10-19) - parked/for-sale redirect (H)
- https://coinmarketcap.com/currencies/yolorekt/ (WebFetch summary, 2026-10-19) (M)
- https://medium.com/feed/yolorekt (RSS, 2026-10-19) incl. posts "Welcome to the FUTURE$" (2022-12-30), "YOLOREKT v2.1" (2022-09-13), "Pimp Your YOLOREKT Trades..." (2023-10-26) (H, stale)
- https://github.com/YOLOrekt/community-bug-bounty (contracts/game/GameInstance.sol, contracts/game/utils/GameStructs.sol, contracts/utils/constants.sol; last push 2022-07-29) (H, stale)
- https://github.com/YOLOrekt/synced-dual-token-issuance and https://github.com/YOLOrekt/dual-issuance-bug-bounty (2021) (H, stale)
- https://eth.blockscout.com/api/v2/tokens/0x811648E10C9cD7f7517644928f3B45FB953c4db4 and `/transfers` (2026-10-19) (H)
- https://api.llama.fi/protocols , https://api.llama.fi/protocol/yolorekt (2026-10-19), https://api.coingecko.com/api/v3/search?query=yolorekt (2026-10-19) - no listing (H)
- https://github.com/api-evangelist/yolorekt (README, apis.yml; third-party auto-generated profile, 2026-10-18) (M)
