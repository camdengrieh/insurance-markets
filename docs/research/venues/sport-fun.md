# Venue spec: Sport.fun (formerly Football.Fun)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Where nothing was found the note says NOT FOUND with what was searched.

## Verdict

- Adapter priority: **skip**. It is a fantasy-sports player-share trading game, not an event-outcome market. Nothing it lists resolves to a yes/no or categorical real-world event, so there is no cross-venue arbitrage leg. There is no official public API, the Pro app is IP-geofenced, and the ToS bar reverse engineering and non-personal use. (H)
- Still live: **yes**. The public landing feed returned `state: fresh` at 2026-10-19T00:04Z, with 140 active football markets and 76 NFL markets. The Pro ToS were updated 16.09.2026. (H)
- Only possible use: a very weak signal source. The player-card feed carries Opta-derived `homeWinPct` / `awayWinPct` for next fixtures, but that is available from other sources and the feed is unofficial. (H for the field, M for its value)

## What it is (H)

- Sport.fun is a "sports market game" ("Own football players, make five-player Picks and compete for real rewards", sport.fun meta description). It is run by Sport.Fun Panama Corp (sport.fun footer). Rebranded from Football.Fun (DefiLlama `previousNames`).
- Two modes: Free to Play (off-chain, global) and **Pro** (real stakes, non-custodial, on-chain on Base). Football is in both; NFL is Pro only (docs "What is Sport.fun?").
- Users "sign" (buy), "release" (sell) and "swap" per-player shares priced in USDC-backed "Gold". Players earn "Tournament Points" (TP) from real match stats, scored with Opta data. Rewards are paid in TP. There are also five-player "Picks" contests ranked against a user's division.
- The landing page also has "Market Call" polls (e.g. "Olise vs Yamal", "manager votes") served by a Cloudflare worker. These are engagement polls, not tradable markets.
- Pool size (docs): about 140 football players from the five big leagues (Pro Football "Which players are available" summary), plus 76 NFL markets per the live feed.

## Market model

- Kind: other. Per-athlete share market, one market per player. Not binary, categorical or scalar. (H)
- Price mechanism: NOT documented in the knowledge base (searched: "What are player shares?", "What is slippage?", "Understanding the Transfers page"). Docs only say "Prices rise as a player is signed more". (H)
- On-chain evidence of an algorithmic, contract-priced market (no order book): the DefiLlama fee adapter reads events `PlayerTokensPurchase(buyer, recipient, playerTokenIds[], playerTokenAmountsToBuy[], currencySpent[], newPlayerPrices[], feeAmounts[])`, `CurrencyPurchase(... currencyReceived[], newPlayerPrices[], feeAmounts[])` and `TokensSwapped(...)` on two Base contracts. Each trade emits a new price. Currency uses 1e6 decimals (USDC). (H that the adapter says this; M that these two contracts are still the live Pro contracts, because the adapter starts 2025-08-03 and the Pro app may have moved.) Source: DefiLlama dimension-adapters `fees/footballdotfun/index.ts`.
- Pro app strings mention "Spot Price", "Post-Trade Spot", "EMA Price", "Price Drift" and "Surge tier ... bps" in the fee breakdown, which suggests an EMA-referenced curve with surge fees. (M, from the public JS bundle text, not documentation)
- Tokenisation: player tokens with ids (`playerTokenIds`, an ERC-1155-style multi-token interface). The token standard is not confirmed. (M/L)
- Share price scale: about $0.002 to $0.004 per share. Example from the movers feed: Alexander-Arnold priceUsd 0.002964, `supply.active` 7,173,144 and `circulating` 11,940,548 (fixture). (H)
- Contracts and scoring: each player has "contracts" that deplete as he plays. Rewards depend on shares held when the player enters the pitch (football) or when the game starts (NFL). (H, docs)

## Chains and collateral

- Chain: Base only (DefiLlama `chains: ["Base"]`; docs: "Pro runs on Base"). (H)
- Collateral: USDC deposited gives Gold, "backed 1:1 by USDC". Withdrawals go to an external wallet. (H)
- Wallet: Privy-managed embedded wallet with a smart account created behind the scenes (docs "How does my Pro wallet work?"). The app's connect-src allows `api.pimlico.io` (ERC-4337 bundler/paymaster), `*.base.org`, Alchemy, QuickNode and dRPC. (H for the docs claim and CSP; M for the inference that this is ERC-4337)
- $FUN token (optional, not needed to trade): 1,000,000,000 supply. Base `0x16EE7ecAc70d1028E7712751E2Ee6BA808a7dd92`; Solana `8cn4JeRLiHTtfX6maZAsipGGyyZPdEcos3s2X3Hw3BS6` (docs "What is $FUN?", CoinGecko). Market cap about $2.71M, 24h volume about $293K, listed on Coinbase, Kraken, Gate, KuCoin, Bitget, Toobit, Aerodrome, Uniswap v4 (Base) and Raydium (CoinGecko page, about 2026-10-19/20). (H)
- Sherlock bug bounty referenced from sport.fun/security ("Protocol-level reports ... Sherlock"). No audit report links on that page. DefiLlama shows `audits: "0"`. (H)

## Read API

- Official public API: **NOT FOUND** (searched: docs.sport.fun categories and 20+ articles, sport.fun legal pages, security and integrity pages, GitHub repo search for org sportfun / footballdotfun, web search "sport.fun API developers"). The ToS "does not describe any API access" (section 10 reading). No official GitHub org was found; a GitHub repo named `imzerocg/Football.fun` appears in search but is not linked from any official page, so treat it as unrelated and do not use it. (H for not found)
- `exists`: **unofficial-only**.
- Undocumented first-party public landing feed (anonymous, no auth, cache-control `public, max-age=30`), discovered by reading the public JS bundle `https://sport.fun/assets/index-*.js` (route builder `/api/public/{football|nfl}/home/{module}`). Modules listed in the bundle: `movers`, `fixtures`, `packPulls`, `divisions`, `topPickFive`, `marketProof`, `rewardProof`.
  - `GET https://sport.fun/api/public/football/home/marketProof` returned `{"data":{"schemaVersion":1,"sport":"football","module":"marketProof","state":"fresh","dataAsOf":"2026-10-19T00:04:35.747Z","data":{"volume7dUsd":"558356.405654","activeMarkets":140,"tournament":{...}}},"meta":null,"status":200,"error":null}`. (H, fixture)
  - Same for `nfl`: volume7dUsd 316,495.35, activeMarkets 76. (H, fixture)
  - `GET .../football/home/movers` returned the top 5 movers with `priceUsd` (string), `change24hPct`, `priceLine1d/7d/30d`, and a `card` with supply, form, next fixture and Opta win probabilities (30 KB, fixture).
  - Only top movers, not the full 140-player table. Modules `fixtures`, `packPulls`, `divisions`, `topPickFive`, `rewardProof` were not fetched. No per-player order depth exists because there is no book.
- Authenticated app API (names read from the public Pro bundle, NOT probed and not documented): `GET /v1/players/`, `/v1/players/{id}`, `/v1/players/{id}/price`, `/v1/players/{id}/price/history`, `/v1/players/data/market-cap`, `/v1/players/data/market-volume`, `/v1/tournaments/{id}/leaderboard`, `/v1/trade/surge-fee-tiers`, `/v1/config`. The production host was not confirmed (the bundle lists staging hosts under `sdfservices.xyz` and relative paths). I did not call it: Pro is geofenced, the endpoints are undocumented, and ToS 9.2 prohibits reverse engineering. (M)
- Websocket: the Pro CSP allows `wss://*.football.fun`. No documented stream. (L)
- On-chain reads: the Base events above can be indexed for trades and `newPlayerPrices` (M, contract addresses below).
- Rate limits: NOT FOUND (searched: ToS, docs, response headers show only `cache-control: public, max-age=30`).
- Aggregators: DefiLlama `https://api.llama.fi/protocol/sport.fun`, `/summary/dexs/sport.fun`, `/summary/fees/sport.fun` (H, fixtures).

## Trade path

- No public programmatic trading API. Trading is through the Privy-authenticated web app. (H)
- The app's generated client (names in the Pro bundle) shows a server-assisted flow: `POST /v1/trade/pre-validate`, `/quote`, `/buy`, `/sell`, `/swap`, `POST /v1/trade/signature/{id}`. That points to a server quote plus a server-issued signature that the user's smart account submits on Base. (M, inferred from route names only; not probed, not documented)
- Known Base contracts from DefiLlama fee adapter: `0x9da1bB4e725ACc0d96010b7cE2A7244Cda446617`, `0x4Fdce033b9F30019337dDC5cC028DC023580585e`. (M/L: adapter start 2025-08-03; they may be superseded by newer Pro contracts, and I did not verify code on a block explorer.)
- Fees, geofence checks (`/v1/wallets/eligibility`) and "Rep" are applied server-side, so a bare contract call may not be possible or may be blocked by signature checks. Not verified. (L)

## PayBox reachability

- `paybox_reachable`: **no** (practically).
- A PayBox EVM wallet on Base could in principle send USDC to an address, but (a) the trading account is a Privy-created smart account, (b) the trade flow appears to need a server session plus a server signature, (c) Pro access is IP-geofenced (my anonymous request to `pro.sport.fun` was 302-redirected to `/restricted`), (d) ToS limit use to personal, non-commercial entertainment and prohibit automation used to manipulate markets. No money-moving or signing PayBox tools were called.

## Fees (H, docs "What fees are payable on trades?", read raw)

- Payer: the trading manager. Fee and expected proceeds are shown in the quote before confirming.
- Standard fees at Neutral Rep: **sign 3%, release 4%, swap 6%**. Higher Rep discounts them: Pro 20%, Pro II 25%, Pro III 30%, World Class 35%, Legend 40% (Legend: 1.8% / 2.4% / 3.6%). Rep below Neutral means higher fees (figures not given). Rep is 0 to 1,000, new accounts start at 500 (docs summary).
- Higher fees do not stack; the highest applies: Fixture fee 10% on releasing or swapping out of a player in a live fixture (decays over the hour after he leaves the field); Player Surge, Manager Surge (for squads worth $500 or more, about 10% of value over seven days is the usual starting point) and Account Market Impact fees. Extra fees fund a platform "Market Health Bot" that buys shares back into the reward pool.
- Round trip at Neutral Rep is therefore at least 3% + 4% = 7%. An arbitrage leg here would cost at least that before slippage.
- Older figure (3% trade, 2% swap, 12-20% dynamic sell) from a May 2026 third-party article differs from current docs. Trust the docs. (L)
- Gas: Privy/Pimlico smart account; sponsorship not confirmed. NOT FOUND.

## Resolution mechanism and dispute risk

- Results come from Opta match data. Scores are "finalised at midnight UTC after the tournament's final match" and live scores can change if Opta corrects data (docs "How does Football scoring work?"). (H)
- Tournaments run about twice a week (weekend and midweek). Rewards (in TP) go to the top 5 DEF/MID/FWD and top 3 GK per tournament, split 70% to player rewards and 30% to Picks, and can be claimed the day after. (H, docs)
- The share price itself is a market price, not a settlement value. There is no binary resolution. Share value comes from expected future rewards plus trading.
- Dispute process: NOT FOUND (searched: scoring, tiebreakers, ToS). Support only (chat and email). Cancelled matches after start keep the recorded score. Tournament windows can change "in exceptional cases". ToS section 3.2 says the Pro version is in beta and rules may change. Governing law Panama, CECAP arbitration (ToS section 20). (H)

## Geo / ToS / automation (H)

- Pro is IP-geofenced. List page `geographic-restrictions` v1.0 (last updated 24.06.2025, so possibly stale): Arizona, Hawaii, Idaho, Montana, Nevada, Utah (US); Afghanistan, Algeria, Australia, Bangladesh, Bolivia, Brunei, Cambodia, China, Croatia, Cuba, Cyprus, Ecuador, Egypt, Indonesia, Iran, Iraq, Japan, Jordan, Kosovo, Kuwait, Libya, Maldives, Morocco, Myanmar, Nepal, North Korea, North Macedonia, Norway, Oman, Pakistan, Panama, Qatar, Republic of Congo, Russia, Saudi Arabia, Sierra Leone, Singapore, Somalia, Switzerland, Taiwan, Thailand, Tunisia, Turkey, UAE, UK, Venezuela, Vietnam. Free to Play is open worldwide. Extra notices for US (unregistered), EEA (MiCA), UK, Australia, Singapore, South Korea.
- Quote (ToS v1.0, 16.09.2026, section 10): "use bots, scripts, scrapers, exploits, or other automated means to manipulate Contests, scoring, markets in In-Game Assets, or any other functionality" is prohibited. Section 9.2 prohibits reverse engineering "except as permitted by mandatory law". The license is for "personal, non-commercial entertainment purposes". The ToS describe the game as a skill-based contest and say it is not gambling. They do not mention prediction markets.
- Integrity page: the only automation described is the platform's own Market Health Bot. It sets no rules for third-party bots, wash trading or API use.
- Age: 18 or local majority.

## Liquidity (dated)

- First-party public feed, 2026-10-19: 7-day volume **$558,356** (football, 140 active markets) and **$316,495** (NFL, 76 markets), about $875K combined. (H, fixtures)
- DefiLlama, 2026-10-19: DEX-type volume 24h $73,216, 7d $881,207, 30d $4.21M, all-time $137.2M; fees 24h $1,917, 7d $21,766, 30d $106,645, all-time $6.38M. TVL (Base) $2.18M on 2026-10-18; peak $7.25M on 2025-08-25. (H, fixtures)
- Tournament reward pools are denominated in TP; the docs give "1 TP = $0.04 expected value" in a public landing page string (L, from the bundle).
- Per-market depth: NOT FOUND (no book; per-player price is shown, supply and circulating shares are in the movers `card`).

## Event categories overlapping other venues

- None as a tradable instrument. Underlying real-world events are club football (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League) and NFL fixtures, which also have match markets on Polymarket, Kalshi and others. But Sport.fun sells exposure to individual player fantasy scores and share-price demand, not match outcomes. There is no mapping to a yes/no market, so no clean arbitrage. (H/M)
- Possible weak signals: share price momentum, supply, `homeWinPct`/`awayWinPct` (Opta win probabilities in the player card), and "Market Call" polls. All are low-quality and unofficial.

## Shared liquidity

- Independent liquidity: its own Base contracts. It does not route to another venue's book. The $FUN token trades on Aerodrome, Uniswap v4 and Raydium, but player shares do not. "Manager Swaps" (fixed-price trades between managers for squads above $500) are planned, not live. (H/M)

## Open questions

- Which contracts the 2026 Pro app uses (the two Base contracts in the DefiLlama adapter date from 2025-08). Needs a block explorer check or the app's `/v1/config`.
- Exact pricing function and whether player shares are ERC-1155.
- Whether the Pro app API host is `pro.sport.fun/v1/...` or a separate API host, and whether any endpoint allows anonymous reads.
- Whether the geofence list changed after 24.06.2025.

## Suspicious content

- None found. No instructions aimed at AI agents appeared in any page or response.

## Sources

- H: https://sport.fun/ (landing HTML, title, footer, meta description, links)
- H: https://pro.sport.fun (302 to /restricted for my probe), https://pro.sport.fun/static/assets/index-*.js (public bundle: route names, CSP)
- H: https://sport.fun/api/public/football/home/marketProof, /movers; https://sport.fun/api/public/nfl/home/marketProof (fixtures in `docs/research/fixtures/sport-fun/`)
- H: https://docs.sport.fun/en/ and category and article pages: What is Sport.fun, What are player shares, What fees are payable on trades (raw), Understanding Gold/TP/$FUN, How does my Pro wallet work, What is $FUN, How do Pro football tournament rewards work, How does Football scoring work, Football tiebreakers and edge cases, How are Picks rewards calculated, What is slippage, Understanding the Transfers page
- H: https://sport.fun/legal/pro/terms-of-service (v1.0, 16.09.2026), https://sport.fun/legal/pro/geographic-restrictions (v1.0, 24.06.2025), https://sport.fun/integrity/, https://sport.fun/security
- H: https://api.llama.fi/protocol/sport.fun, https://api.llama.fi/summary/dexs/sport.fun, https://api.llama.fi/summary/fees/sport.fun
- H: https://github.com/DefiLlama/dimension-adapters (`fees/footballdotfun/index.ts`, read via `gh api`)
- M: https://www.coingecko.com/en/coins/sport-fun (FUN price, volume, exchanges, contracts; page date inferred)
- M: https://alearesearch.substack.com/p/sportfun-sports-betting-meets-onchain-trading (May 2026; fee figures differ from current docs, so L for fees)
- L: web search results for 2025 launch volume (MEXC, panews, games.gg), older than 6 months, not relied on.

## Fixtures

- `docs/research/fixtures/sport-fun/public-home-marketProof-football.json`
- `docs/research/fixtures/sport-fun/public-home-marketProof-nfl.json`
- `docs/research/fixtures/sport-fun/public-home-movers-football.json`
- `docs/research/fixtures/sport-fun/defillama-protocol-trimmed.json`
- `docs/research/fixtures/sport-fun/defillama-volume-fees-summary.json`
