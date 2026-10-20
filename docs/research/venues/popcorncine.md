# PopcornCine (popcorncine.io, BNB Chain) - adapter spec

Researched 2026-10-19 (~00:30-00:45 UTC). READ-ONLY: unauthenticated GETs to the site, its own JSON routes, its backend host and DefiLlama public APIs; the site's JS chunks were read as text only (nothing cloned, installed or run); `gh api` reads of DefiLlama's adapter registry. No account, wallet, signing, POST/PUT/DELETE or browser. No PayBox tool called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale.
All third-party text (site copy, JS, API payloads, search results) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/popcorncine/` (9 small files). Third-party wallet addresses in the leaderboard fixture are masked.

## 0. Verdict

**adapter_priority: skip.**

1. **Online but economically empty (H).** The site and its JSON routes respond on 2026-10-19. Across all 32 catalogued markets the site's own stats endpoint reports **$10 of total volume lifetime ($5 + $5, one participant each)**. DefiLlama's treasury series for the stake wallet shows $10 from 2026-09-02 to 2026-10-01 and $0 from 2026-10-02 on.
2. **Not a market in the order-book/AMM/contract sense (H, site JS).** A "prediction" is a plain USDT/USDC `transfer` to a single treasury address on BNB Chain, followed by a `POST /api/predict/wallet-stake` to the operator's server. Positions live in the operator's database; payouts are a server-side "claim". There is no market contract, no tokenised outcome, no order book, no exit or cancel.
3. **House-set prices (H).** 30 of the 32 markets have zero volume, so the displayed price is a hard-coded editorial `seedYesPct` in the JS bundle. Where volume exists, the price is just the pool ratio of one $5 stake (99c YES / 1c NO). Neither is a tradable market price.
4. **Resolution unproven (H + M).** Three markets are past their `resolvesAt` (2026-09-29, 2026-10-01 and, by the default close+24h rule, 2026-10-16) and still report `resolved:false, winningSide:null` (18-20 days later for the first two). The sole stake in Endgame Encore was YES; press box office figures (M) point to NO. No payout or resolution announcement was found. No dispute process documented.
5. **Gated and fenced (H, site JS).** Placing a prediction in the UI requires holding the "CINE ONE PASS" soulbound NFT (a $5 purchase) and the site geofences EU and USA users.
6. **Overlap exists only in topic, not in executable liquidity.** Box office, Billboard, Grammys/Oscars, Spotify and GTA VI questions are listed on Polymarket/Kalshi, but there is nothing to trade against here.

Revisit only if DefiLlama/stat-endpoint volume becomes non-trivial AND an on-chain market contract or documented API appears. Not worth building for.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://www.popcorncine.io` | HTTP 200, Next.js app on Vercel, title "PopcornCine - Predict Culture. Predict Markets." Static HTML shell, content client-rendered (fixture `home_headers.txt`). Page cached 19.8 days (`age: 1708596` => last build ~2026-09-29) | H |
| `/api/predict/stats?id=<market>` | HTTP 200 JSON for all 32 ids, `x-vercel-cache: MISS` (dynamic) | H |
| `/api/ai-index` | HTTP 200, `generatedAt: 2026-10-19T00:37:07Z` (regenerated on request) | H |
| `/api/atlas/prices?symbols=NVDAB,QQQB` | HTTP 200, price timestamp 2026-10-19 00:40:20 UTC | H |
| `https://backend.popcorncine.io/predictions/leaderboard` | HTTP 200 JSON (Express behind nginx); root path returns Express `Cannot GET /` | H |
| DefiLlama protocol | id 8554, category "Prediction Market", chain BSC, `listedAt` 1788374423 = 2026-09-02 18:40 UTC, Twitter `Popcorncine_`; no TVL, no volume/fees adapter (`/summary/dexs|fees|options/popcorncine` all 400 "not found") (fixture `defillama_protocol_popcorncine.json`) | H |
| DefiLlama treasury record | `treasury/popcorncine` owner `0x24a2d2503ed27418d7e5b21b617d4bc03aec55e1` on BSC, tokens USDT, USDC, native (registry `registries/treasury.js` via `gh api`). Series: $10 2026-09-02..2026-10-01, $0 from 2026-10-02; residual native BNB ~0.00001 (~$0.0056) (fixture `defillama_treasury_popcorncine.json`) | H |
| Site markets "live" | 29 of 32 markets (19 entertainment + 10 RWA battles) report `phase:"live"`; 3 report `"resolving"` (Endgame Encore, `nvdab-vs-qqqb-sept-2026`, `gta-vi-1b-72h`; see section 8) | H |
| GitHub | No project repo. Search for "popcorncine" returns only unrelated or empty repos (e.g. an empty 2026-02-23 repo with only a README, no link to the site) | H (absence) |
| X account `x.com/Popcorncine_` | WebFetch returned HTTP 402; not retried, nothing paid. Latest posts NOT READ | H |
| Independent coverage | One sponsored Cointelegraph piece hosted on Bitget News dated 2026-07-07 (earlier XP-only product, no staking or payouts described). No independent reporting on volume, users or payouts | H (absence) / M |
| Official socials from site JS | Telegram `t.me/popcorncine7`, Discord `discord.gg/WKY3dbdA4`, X `Popcorncine_`, LinkedIn `company/popcorncine.io`, `x.com/EarnTV_` | H |

Verdict: **operating, effectively no users** (still_live = true in the narrow sense that the site and APIs answer; nothing suggests real trading).

## 2. What it is

- **Kind**: onchain-other, but functionally an off-chain bookmaker. Entertainment (box office, music, gaming, streaming, awards) YES/NO markets plus "Real World Assets bStock battles" (relative 7/8-day price performance of Binance bStocks NVDAB, QQQB, SPYB, MSFTB, SPCXB, SNDKB) (H, site JS config module; DefiLlama description).
- **Operator**: no legal entity, team or docs found. Uses an ElevenLabs conversational-AI widget and weekly "AI Index" (H, `/api/ai-index`). Site copy mentions "Founding Member" CoinMarketCap reward codes and a 5% "$CINE presale bonus" (H, `/cmc` route chunk): a $CINE token is promoted but no contract or price was found (NOT FOUND).
- **Market model (H, site JS config + pricing module)**:
  - Binary YES/NO only. Two kinds: `entertainment` (fixed catalog of 20 plus the Endgame Encore market, hard-coded in the bundle) and `rwa` (10 pair templates, a new round id `<pair>__rN` generated by formula every 8 days from 2026-09-01; `intervalMs 6912e5` = 8 days).
  - **Pricing**: `yesPrice = clamp(yesVolume / (yesVolume + noVolume), 0.01, 0.99)`; when total volume is zero it falls back to the hard-coded `seedYesPct / 100`. `shares = (stake - fee) / priceAtEntry`; payout = **$1 per share** if the side wins (UI text "Potential Payout ... $1/share if YES wins"). So it is fixed-price-at-entry shares against the house treasury, not a parimutuel split of the final pool and not an order book/AMM.
  - **Tokenisation**: none. A position is a database row (id, wallet, marketId, side, amount, outcome won/lost/push, payoutUsd, claimedAt) fetched from `/api/predict/positions?wallet=` (H, `my-positions` route chunk).
- **Min stake** $5 (`minStakeUsd: 5`) on every market (H).
- **XP / leaderboard**: wallets earn XP per prediction (leaderboard totals: top wallet 216 predictions, 2160 XP; 5 entries total) (H, fixture `backend_predictions_leaderboard_masked.json`). XP is a points game, not money.

## 3. Chains and collateral

- **BNB Smart Chain (chainId 56; testnet 97 also accepted by the stake component)**. Wallet-stake path rejects any other chain ("Switch to BNB Chain") (H, site JS).
- **Collateral**: USDT `0x55d398326f99059fF775485246999027B3197955` and USDC `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` on BSC, 18 decimals (H, site JS config; these are the standard BSC USDT/USDC contracts, M, not independently looked up this session).
- **Treasury (stake destination)**: `0x24a2d2503ed27418d7e5b21b617d4bc03aec55e1`, default of `NEXT_PUBLIC_PREDICTION_TREASURY` in the bundle and the owner address DefiLlama tracks (H). Whether it is an EOA or a contract: NOT VERIFIED (no explorer GET API available without a key; JSON-RPC is POST and excluded).
- **Pass NFT** "CINE ONE PASS" at `0xec995b05cc6c7bdcd96ac5f6575b862ec122b5c6` on BSC (soulbound ERC-721-like with `mint(tier, maxAllocation, proof[], referrer)`, merkle-gated tiers); site pays for it via Morph Payments checkout (USDT, "amount 5") (H, site JS ABI/constants).
- Alternative payment: "Morph" hosted checkout / QR, created by `POST /api/morph/create` (not called) (H).

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official public API docs | **NOT FOUND** (searched: `/docs`, `/terms`, `/robots.txt`, `/sitemap.xml` all return the Next.js 404 shell; no OpenAPI; no docs link in the footer; web search extended; GitHub search) | H |
| Undocumented but publicly callable JSON routes (used by the site's own frontend) | see table below | H |
| WebSocket / streaming | NOT FOUND in the bundle (the site polls: Atlas prices every 30 s, stats on load) | H |
| Auth | None for the GET routes below; no API key or signature seen. CORS: backend returns `Access-Control-Allow-Origin: *` | H |
| Rate limits | NOT FOUND (no `x-ratelimit-*` headers on any response; Vercel/nginx defaults) | H |
| On-chain | Stake transfers are plain ERC-20 `Transfer` events to the treasury; the only way to enumerate volume independently of the operator is replaying those transfers on BSC (not done: needs RPC/explorer key) | M |

Routes (all GET unless noted), base `https://www.popcorncine.io` unless stated:

| Route | Purpose | Verified live | Fixture |
|---|---|---|---|
| `/api/predict/stats?id=<marketId>` | Market metadata + pool stats: `participants, positions, yesVolume, noVolume, volume, yesPct/noPct, yesCents/noCents, yesPrice/noPrice, fees, openCount, settledCount`, plus `phase` (`upcoming|live|closed|resolving`, computed from timestamps), `resolved`, `winningSide` | yes, 32/32 ids | `predict_stats_avengers-doomsday.json`, `predict_stats_endgame-encore_resolving.json`, `all_markets_stats_summary_2026-10-19.json` |
| `/api/ai-index` | Weekly "AI Index" score for the featured market (`confidencePct, stance, summary, sources, briefingScript`) - the site's own editorial signal, not a market | yes | `ai_index.json` |
| `/api/atlas/prices?symbols=A,B` or `?all=true` | bStock reference prices: `price, priceRaw (18 dp), decimals, timestamp, roundId, source:"singular", change` | yes (bare call returns 400 asking for `symbols` or `all=true`) | `atlas_prices_nvdab_qqqb.json` |
| `https://backend.popcorncine.io/predictions/leaderboard` | XP leaderboard | yes | `backend_predictions_leaderboard_masked.json` |
| `https://backend.popcorncine.io/predictions/wallet/<addr>` | Per-wallet predictions | not called (needs a wallet) | none |
| `/api/predict/positions?wallet=<addr>` | Per-wallet positions incl. outcome and payout | not called (needs a wallet) | none |
| `/api/pass/status?wallet=<addr>` | Pass ownership flag | not called | none |
| `/api/geo/check` | Returns `{ok, country, blocked, message}` for the caller's IP | yes (returned `blocked:false`; country not recorded) | none |
| `/api/campaign` | Returns 405 to GET | yes | none |
| `POST /api/predict/wallet-stake`, `POST /api/predict/claim`, `POST /api/morph/create` | Write routes | **not called** (POST excluded) | none |

Gaps for an aggregator: **no market list endpoint** (the catalog is hard-coded in the JS bundle: ids, questions, `closesAt`, `resolvesAt`, `resolutionSource`, seed odds; the RWA rounds are computed by formula), no order book, no trade feed, no per-market history, no price history. An adapter would have to parse the bundle or maintain a static id list, which breaks on every deploy.

Sample stats response (fixture, abridged): `{"ok":true,"market":{"id":"avengers-doomsday-1-5b-ww","question":"Will Avengers: Doomsday open above $1.5B worldwide?","closesAt":"2026-12-18T23:59:00.000Z","resolvesAt":"2026-12-22T00:00:00.000Z","resolutionSource":"Atlas Oracle","yesOddsPct":40,"seedYesPct":40},"stats":{"participants":1,"yesVolume":5,"noVolume":0,"volume":5,"yesPct":99,"yesPrice":0.99,"fees":0.05},"phase":"live","resolved":false,"winningSide":null}`. Note the market's editorial seed was 40% YES but a single $5 YES stake moved displayed YES to 99%.

## 5. Trade path

- **Order placement (from client code, H)**: connect an EVM wallet on BSC -> `ERC20.transfer(treasury, amount)` for USDT or USDC (a transaction the user signs) -> after confirmation the page calls `POST /api/predict/wallet-stake {wallet, marketId, side, token, amount, txHash}` -> server records the position. No signature over the order is visible in the client code; the server evidently trusts `wallet` and `txHash` (server-side verification not observable, NOT VERIFIED). Alternative: Morph hosted checkout.
- **Pass gating**: UI only shows the "Place Bet" button when `hasPass` is true (NFT `balanceOf` on BSC or `/api/pass/status`); whether the server re-checks the pass is NOT VERIFIED.
- **Cancel / sell / exit**: none in the client code. After close, winners (or "push" refunds) press "Claim" which calls `POST /api/predict/claim {wallet, positionId}`; the operator then pays USDC (H, `my-positions` chunk text "Claim $X USDC + XP").
- **Settlement of funds**: operator-held treasury; no escrow contract. No way to hedge a position or take the other side except by staking the opposite side at the pool price.

## 6. Reachable through PayBox?

**partial, but not worth integrating.**
- BNB Smart Chain (56) is in PayBox's chain catalog per the repo's own live `discover_tokens` record dated 2026-10-19 (`docs/research/06-paybox-platform.md`, tagged H there, not re-queried this session: M). A USDT `transfer` to the treasury is an ordinary token-transfer proposal.
- But a valid position also needs (a) the CINE ONE PASS NFT in the wallet (purchase/mint flow, merkle proof or Morph checkout), (b) the follow-up off-chain `POST /api/predict/wallet-stake` made by the adapter itself (not a PayBox action), (c) a non-EU/non-US caller, and (d) trust that the operator pays out. Sending funds without (b) risks an unrecorded transfer.
- No PayBox tool was called; no signing was attempted.

## 7. Fees

- **1% of stake**, deducted at entry (`feePct` default 1; `fees: 0.05` returned for a $5 stake; UI "Fee $0.05 USDT"). Net stake buys shares at the entry price; payout $1/share. Fee paid by the bettor, retained by the operator (H, site JS + stats endpoint).
- CINE ONE PASS: $5 via Morph (promotional "CMC reward code" version also $5) (H, site JS). Morph checkout fee: NOT FOUND. BNB gas on the transfer is paid by the user (H, standard).
- No withdrawal fee documented; claim path costs the user no gas (server-side payout, M).

## 8. Resolution mechanism and dispute risk

- Every market names a `resolutionSource` / `resolutionOracle`: "Atlas Oracle" (most), "Chainlink" (Game Awards, Netflix, Esports WC, Billboard weeks), "TMDB" (The Odyssey Best Picture), "Box Office Mojo" (Endgame Encore), "Atlas Oracle (SYMA, SYMB)" for RWA rounds (H, config module).
- **No on-chain resolution contract, oracle address, UMA-style dispute or timelock was found.** "Atlas Oracle" returned no independent documentation (searched: web extended "Atlas Oracle bStock ..."; the closest hit was APRO Oracle supplying bStock feeds on BNB Chain, M, unconfirmed to be related). The site's `/api/atlas/prices` returns `source:"singular"` with `roundId:"1"` and a timestamp equal to request time, so the feed looks like a server-side wrapper around a quote, not an auditable round-based oracle (M).
- "Chainlink" as a resolution source for subjective items (Game of the Year, Billboard streak counts) cannot be a Chainlink price feed; treat the label as marketing (M).
- **Observed behaviour**: Endgame Encore (`closesAt` 2026-09-24, `resolvesAt` 2026-09-29, rule: > $50M domestic opening weekend, Box Office Mojo) is still `phase:"resolving", resolved:false, winningSide:null` on 2026-10-19; so is the first RWA market `nvdab-vs-qqqb-sept-2026` (`resolvesAt` 2026-10-01 18:00 UTC) and `gta-vi-1b-72h` (`closesAt` 2026-10-15) (H, stats endpoint). Press reports put the Endgame Encore opening weekend near $26M (M: Variety/Wikipedia snippets via web search, not verified against Box Office Mojo), i.e. NO, which would mean the lone YES stake loses.
- The treasury balance going from $10 to $0 on 2026-10-02 (H, DefiLlama) fits an operator withdrawal or a payout; cause NOT KNOWN (M/L).
- Dispute risk: total operator discretion; no documented appeal or refund for unresolved markets other than `push` handling inside the claim UI.

## 9. Geo / ToS / automation

- **Geofence**: `/api/geo/check` is called on load; blocked users see "Not available in your region (EU/USA geofencing)" on stake and pass purchase (H, site JS). The check is client-side UI plus a server route; server-side enforcement on `wallet-stake` NOT VERIFIED.
- **ToS**: Footer "Terms" links to `/cmc` (a CoinMarketCap founding-member reward-code page) and "Privacy" links to `/my-positions`; the wallet modal says "By connecting your wallet, you agree to our Terms of Service" but no terms text was found (NOT FOUND, searched: `/terms`, `/cmc`, footer links, route chunks). No automation/bot policy documented.
- Contact: Telegram `t.me/popcorncine7`.

## 10. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Lifetime volume, all 32 catalogued markets | **$10** (two $5 stakes, 1 participant each in Avengers: Doomsday and Endgame Encore) | `/api/predict/stats` per id, 2026-10-19 ~00:37 UTC (fixture `all_markets_stats_summary_2026-10-19.json`) | H |
| Treasury balance (stake wallet) | $10 -> $0 on 2026-10-02; $0 on 2026-10-18 | DefiLlama treasury series, fetched 2026-10-19 | H |
| Leaderboard activity | 5 wallets, max 216 predictions (XP game; predictions may include non-money XP entries, M) | backend leaderboard, 2026-10-19 | H |
| DefiLlama TVL / volume / fees | empty / no adapter / no adapter | `api.llama.fi/protocol/popcorncine`, `/summary/*` | H |
| Hard-coded "stakes from $5" copy | "20 Entertainment Prediction Markets" (search-snippet of homepage) | WebSearch | M |

## 11. Overlap with other venues, and independence

- **Topic overlap** (nominal): box office openings (Avengers: Doomsday), Billboard/Spotify/Grammys/Oscars, GTA VI, streaming subscribers - categories also listed on Polymarket and Kalshi (M, from general knowledge of those venues, not rechecked here). RWA battles (NVDAB vs QQQB over 7-8 days) have no direct counterpart; the underlying bStocks trade on Binance/Metric DEX and could in principle be hedged spot (M).
- **Independent liquidity**: yes, nothing is mirrored from or routed to another venue; the Atlas/bStock feed is only a settlement reference.
- **Arbitrage value: nil today.** Prices are hard-coded seeds or a single-stake pool ratio, minimum $5, 1% fee, no exit, house counterparty, unresolved settled-looking markets. A scanner might still use the seed odds as a weak editorial signal, but they are not market prices.

## 12. Open questions

- Is `0x24a2d2...55e1` an EOA or a contract, and where did its $10 go on 2026-10-02? (needs an explorer/RPC read.)
- Does the backend verify the `txHash` and pass ownership server-side, and what does `POST /api/predict/claim` pay or reject?
- Is "Atlas Oracle" an actual third-party oracle with on-chain rounds, or the operator's own endpoint?
- Why do Endgame Encore and the Sept RWA market remain unresolved weeks after `resolvesAt`?
- Does a $CINE token exist, and is it related to a future market contract?

## Suspicious content

None aimed at AI agents. Searched fetched JS (layout, page, config, stake and route chunks), the stats/ai-index/atlas/leaderboard JSON and the HTML shells for strings such as "ignore previous", "system prompt", "language model", "AI agent": the only hit was the markup `<elevenlabs-convai agent-id=...>` (an embedded ElevenLabs voice-assistant widget loaded from unpkg.com; a site feature, not an instruction). The ai-index `briefingScript` is spoken-news copy. Search-result and third-party text were not followed.

## Not found

- Official API docs, OpenAPI, SDK or market-list endpoint (searched: site routes, JS bundle, GitHub, web).
- Terms of service, privacy policy, or any bot/automation policy (searched: `/terms`, `/cmc`, footer, route chunks).
- Any on-chain market, order-book or oracle contract besides the pass NFT and the treasury address.
- Independent coverage or audits of the markets, volume, payouts or resolution of any market (searched: web extended x3).
- Live read of BSC on-chain data for the treasury or pass contract (BscScan/Blockscout GET APIs unavailable without key; RPC is POST).
- X posts from `@Popcorncine_` (HTTP 402, not paid).
- Team identity, legal entity, licence.

## Sources

- https://www.popcorncine.io (shell HTML/headers, 2026-10-19) - H
- https://www.popcorncine.io/_next/static/chunks/ : `app/page-*.js`, `app/layout-*.js`, `app/cmc/page-*.js`, `app/my-positions/page-*.js`, `9796-*.js` (market catalog and config), `2990-*.js` (token/pass/treasury constants, pass hook), `8982-*.js` (stake component, geo provider, backend URLs), `4478` module inside layout (pricing/fee math) (read as text only) - H
- https://www.popcorncine.io/api/predict/stats?id=<32 ids> , /api/ai-index , /api/atlas/prices?symbols=NVDAB,QQQB , /api/geo/check , /api/campaign - H
- https://backend.popcorncine.io/predictions/leaderboard , / - H
- https://www.popcorncine.io/docs , /terms , /robots.txt , /sitemap.xml (404 shell) , /cmc , /mint , /my-positions - H
- https://api.llama.fi/protocol/popcorncine , https://api.llama.fi/treasury/popcorncine , https://api.llama.fi/protocols (entry id 8554) , https://api.llama.fi/summary/dexs|fees|options/popcorncine (400) - H
- https://defillama.com/protocol/popcorncine (HTTP 403 to WebFetch; data taken from the API) - H
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/registries/treasury.js (entry `treasury/popcorncine`, via `gh api`) - H
- https://www.bitget.com/news/detail/12560605493432 (sponsored Cointelegraph piece, 2026-07-07: earlier XP-only product, SBT pass, BNB Chain) - M
- WebSearch (extended): "PopcornCine prediction market BNB Chain entertainment bStock battles"; "Atlas Oracle bStock NVDAB QQQB BNB Chain tokenized stocks" (bStocks context: Binance bStocks launched 2026-06-12; APRO feeds - M); "PopcornCine CINE ONE PASS Endgame Encore ... payout" (press box-office figures for Endgame Encore, M)
- https://x.com/Popcorncine_ (HTTP 402, not read) - none
- Repo notes: `docs/research/06-paybox-platform.md` (PayBox chain catalog incl. BNB Smart Chain 56) - H in that file, M here
