# SuiBets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 2026-10-19 00:20-00:30 UTC). READ-ONLY: page and bundle reads, `gh api` file reads, unauthenticated GETs to the venue's own host, one DefiLlama API read, one DexScreener read, one live PayBox `discover_tokens` (read-only catalog call). No account, wallet, key, signature, POST/PUT/DELETE or money-moving PayBox tool was used. Third-party pages, API text and the venue's JS bundle were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB, trimmed where noted): `docs/research/fixtures/suibets/` (listed in section 12).

---

## 0. Bottom line

1. **Technically live, economically dead.** The site, API and a Sui mainnet escrow contract answer today (H), but the order book has **zero open offers** (REST and on-chain counters both say 0, H), the last offer was created 2026-08-29 and the last P2P settlement was 2026-09-20 (H). Total lifetime settled wager volume is ~830M SBETS (a token worth ~$1.8e-7, i.e. ~$150) plus 1.4 SUI (H, `/api/platform/stats`, DexScreener). DefiLlama TVL is **$2** (H).
2. **Not a prediction-market exchange in the sense the aggregator needs.** It is three things bolted together: (a) a P2P fixed-odds offer board where a maker posts "I back X at decimal odds O" and a taker fills the other side, escrowed on a Sui Move contract; (b) a house-style sportsbook whose "odds" are copied from ESPN / API-Sports; (c) a few small binary/AMM-ish side markets (robotics, tech, stocks) with no volume. None of it is independent price discovery.
3. **Volume that did exist looks self-made.** 93% of matched offers (391 of 421) were created by two wallets, and the settled tape shows those same two wallets as each other's counterparty (H data, M interpretation: operator market-making / wash). The whitepaper text says the protocol itself posts counter-offers: "The protocol posts counter-offers directly on-chain through the same P2P Move contract as any user" (H quote from the bundle's tokenomics section).
4. **No documented API, undocumented schema drift.** The REST endpoints exist and are unauthenticated for reads, but there is no docs site, OpenAPI file or SDK (NOT FOUND). A third-party adapter (pmxt) broke on field renames (H, issue #1066).
5. **Not reachable through PayBox.** Settlement chain is **Sui**; PayBox's live chain catalog has 11 chains and no Sui (H, section 4).
6. **adapter_priority = skip.** Revisit only if open offers reappear and a Sui signer path exists.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.suibets.com` (apex 301 -> www) | HTTP 200, title "SuiBets - Crypto Sports Betting Platform", Express on Railway, SPA (Vite/React). `last-modified` of index.html 2026-08-24. | H |
| REST `GET /api/p2p/offers?status=all` | 200, JSON. Highest offer id 954, created 2026-08-29T18:08Z; ids 955+ return `{"message":"Offer not found"}`. | H |
| Open book | `GET /api/p2p/offers?status=open` -> `[]`. `GET /api/p2p/onchain-book` -> `"onchainCounts":{"openOffers":0,"liveBets":0,"openParlays":0}`. | H |
| Last P2P settlement | `settledAt` max 2026-09-20 03:50:33 in both offers and `/api/p2p/settled-tape` | H |
| Contradiction | `/api/p2p/revenue-stats` reports `"openOffersCount":28,"openParlaysCount":3` while the list and on-chain counters say 0. Treat the 28 as stale. | H (contradiction), L (28) |
| Betting switches | `/api/betting-status`: `suiBettingPaused:true` ("SUI betting is temporarily paused while we add funds to the treasury"). `/api/treasury/status`: SUI available 2.1 and `acceptingBets:true`, `paused:false`, SBETS `acceptingBets:false`, available 0. The two endpoints disagree on whether SUI betting is open, and `betting-status` says `sbetsBettingEnabled:true` while the treasury cannot accept SBETS (contradictions). | H |
| DefiLlama | Listed 2026-04-14, category "Prediction Market", chain Sui. TVL = SUI in the `BettingPlatform` object: $1.98 on 2026-10-18 (max $2 on 2026-09-22; first non-zero 2026-04-17). SBETS staking TVL 0. (https://api.llama.fi/protocol/suibets, adapter `projects/suibets/index.js`) | H |
| Token | SBETS price $1.803e-7, FDV $1,804, Cetus pool liquidity $403, 24h volume $56 (DexScreener, 2026-10-19). | H |
| Independent coverage | None found: no audit, no news, no exploit report (WebSearch extended x2). Only promo posts on X. | M |
| pmxt | An unofficial adapter exists in `pmxt-dev/pmxt/core/src/exchanges/suibets/`; open issue #1066 (2026-06-14, updated 2026-10-12) says the API is live but field names changed. | H |

Verdict: **still_live = true**, but dormant: no new offers for ~7 weeks (since 2026-08-29) and no settlements for ~4 weeks (since 2026-09-20).

---

## 2. Kind and market model

- **Kind (H, site bundle FAQ + `/api/p2p/contract-info`):** peer-to-peer fixed-odds sports betting. Quote from the FAQ: "A P2P bet is a direct wager between two wallets - no bookmaker in the middle. You post an offer with your stake and odds; someone takes the other side. The smart contract holds both stakes until the result is settled on-chain."
- **Offer semantics (H, from 924 offers):** `odds` = decimal odds for the maker's backed outcome; `takerStake = creatorStake * (odds - 1)` (e.g. odds 1.06, stake 100000 -> takerStake 6000; odds 100, stake 1000 -> 99000). `oddsBps` on-chain = odds x 10,000. The maker backs `prediction` in {`home`,`away`,`draw`, or an over/under or half-time label}; the taker is implicitly the layer. Partial fills supported (`filledStake`, `onchainState.filledAmount`, `matchCount`).
- **Market types seen (H):** `match_winner` 913 of 924, `fantasy_h2h` 7, `over_under` 3, `half_time` 1. Outcome set is free text (`home`/`away`/`draw`), no tokenised outcome, no tradable position token, no secondary market. A match is a `BetOffer` object (Move) and a `P2PMatchedBet` after fill.
- **Book depth is not an order book you can read as a ladder.** Each offer is one price level with one remaining size; the endpoint returns raw offers, not aggregated bids/asks. Two-sided prices must be derived (implied prob of the backed side = 1/odds; the laid side = 1 - 1/odds).
- **Parlays (H):** `/api/p2p/parlays` exists (post_parlay / accept_parlay on-chain); not relevant for a single-leg scanner.
- **House sportsbook (H):** `/api/events` returns `homeOdds/awayOdds/drawOdds` with `"dataSource":"espn","oddsSource":"live-api"` (and `"oddsSource":"live-score-fallback"`, market `"source":"indicative"` in `/api/events/live-lite`). The whitepaper says sports data is "ESPN free API + API-Sports" and the in-play probability model is computed from ESPN scores every 15 s (H quote from bundle). So these are not independent quotes.
- **Bet placement for the house book (H, bundle):** the client asks the backend `POST /api/oracle/sign-bet` for an oracle signature over the odds (`quoteExpiry`, `finalOddsBps`) and then submits a Sui transaction. Limits from `/api/settlement/transparency`: `maxOdds 7`, `maxParlayOdds 15`, `maxBetsPerWallet24h 7`, `maxBetsPerMatch 3`, `maxPayoutSbets 2,000,000` (~$0.36), `maxPayoutSui 150`, `oddsTolerance 10%`.
- **Side markets (H):** `/api/predict/onchain-markets` returns 23 binary markets with `yesPrice/noPrice` and `openInterest` (units SBETS/SUI base units; sum 1,261,212; 21 participants all-time). Every row has `status:"live"` including ones expiring in April 2026 and rows named "Test rate limit market number 1", so the status field is unreliable. `/api/robotics/markets` (11 markets, yes/no virtual reserves 10,000 each, volume 0). `/api/stocks/events` generates "close above/below" markets from a live price, no volume. `/api/pyth/markets` returns 502 `Hermes HTTP 401`. DeepBook Predict is wired to **testnet** (`/api/predict/status`: "DeepBook Predict is currently on Sui Testnet").

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | **Sui mainnet** only (EVM RPCs in the bundle are for the wallet picker / a bridge page, not betting) | H |
| P2P package | `0xd51fe151bec66a15b086a67c1cfce9b05759ddac1d73fcd3e14324ad202b2e59`, version "v2", config `0xcf87ec33...c7cf`, registry `0x36603458...0116d` (`/api/p2p/contract-info`) | H (as reported by the venue); on-chain state not independently read (Sui RPC/GraphQL need POST, which this task forbids) |
| House `BettingPlatform` object | `0xfed26497...fdf9` (from DefiLlama adapter) holds `treasury_sui`, `treasury_sbets` | H |
| Collateral | SUI (9 dec), SBETS (9 dec, `0x999d696d...::sbets::SBETS`), USDSUI (6 dec), USDC (6 dec; the type looks like Circle's native USDC package on Sui, M). Page also advertises LBTC. Generic `Coin<T>` escrow. | H (contract-info), M (LBTC from search summary) |
| Gas | Gas-sponsored flow for stablecoin bets (`/api/p2p/sponsor-address`: `supportedCurrencies: USDC, USDSUI`) | H |
| Second SBETS address | A web search summary cited `0x6a4d9c0e...::sbets::SBETS` (Turbos pool, FDV $25K). DexScreener returns no pairs for it now. Likely an older token generation; relevance unknown. | L |

---

## 4. Trade path and PayBox reach

- **Taker (H for the call shape, from bundle code; M for what the "contract configured" flag means):** build a Sui programmable transaction block: split a coin of the chosen type, call `<package>::p2p_betting::accept_offer<T>(config, registry, offer_object, coin, amount_u64, clock)`, sign with a Sui key (the UI uses Slush/Nightly/Suiet wallets, zkLogin or a passkey), execute. The UI then POSTs to `/api/p2p/offers/:id/accept` to register the fill in the backend DB (path seen in bundle; request body and auth not tested, POST forbidden). There is also a legacy branch that sends coins to an "escrow wallet" when the contract is not configured (custodial); the contract is configured today.
- **Maker:** `p2p_betting::post_offer<T>(...)` (bundle) with eventId, eventName, prediction, market, oddsBps, expiry; `POST /api/p2p/offers` then registers it.
- **Cancel/reclaim:** `/api/p2p/offers/:id/reclaim`, `/api/p2p/void-offer` (bundle paths).
- **No official SDK, no REST order endpoint that takes a signed order, no API keys.** Programmatic trading therefore means a Sui client library plus the reverse-engineered Move signatures above (NOT FOUND: docs or ABI listing; the whitepaper snippets in the bundle show `p2p::accept_offer` with different argument lists than the `p2p_betting::accept_offer` the client actually calls, so the docs and code disagree).
- **PayBox reachable = no.** Live `discover_tokens mode=chains` (2026-10-19) lists 11 chains: Solana, Ethereum, Base, Arbitrum One, OP Mainnet, Polygon, BNB Smart Chain, Avalanche, Robinhood, Arc, Hyperliquid; `query=sui` returns 0 chains (H; the tool says the catalog is not a support allowlist, so absence is strong evidence, not proof). PayBox proposal types per repo notes are EVM calls/typed data and Solana transactions; a Sui PTB (BCS bytes, intent-prefixed blake2b digest, Sui signature flag) fits neither. A Solana ed25519 key could in theory sign a Sui digest if PayBox exposed raw-message signing for Solana, but that is untested, funds would still have to be bridged to Sui, and there is nothing to trade. EVM wallets on Base/Ethereum/BNB/Arbitrum/Polygon cannot place or fill SuiBets orders.

---

## 5. Read API

| Item | Value | Tag |
|---|---|---|
| Official docs | **NOT FOUND** (searched: `/docs`, `/api`, `/terms`, `/privacy`, `/whitepaper`, `/llms.txt`, `/robots.txt`, `/sitemap.xml` all return the SPA shell; GitHub `suibets/suibets` returns 404; no OpenAPI). Closest thing: the "Whitepaper" page, which is rendered client-side from the JS bundle (technical spec plus FAQ). | H |
| Base URL | `https://www.suibets.com` (apex 301s to www) | H |
| Auth | None for reads (all calls below were anonymous). Wallet-keyed reads take `?wallet=0x...`. Cross-origin browser calls from a foreign `Origin` returned HTTP 500 once (CORS allowlist); server-side calls work. | H / M |
| Rate limit | Response headers `ratelimit-limit: 100`, `ratelimit-policy: 100;w=60` (100 requests per 60 s per client). pmxt uses 300 ms spacing. | H |
| WebSocket | `wss://www.suibets.com/ws` referenced in the bundle (live-odds channel); not connected. | M |
| Pagination | `limit` is capped at 500. **`offset` is ignored** (`status=settled&limit=5&offset=5` returned the same ids as offset 0). `status` filter works (`open`, `settled`, `filled`, `cancelled`, `expired`, `all`; `OPEN` and `open` both give `[]`). Without a working offset, `expired` history is truncated at 500 rows; 30 ids in 1..954 were not returned by any list but a direct GET shows them as expired. | H |
| Schema stability | Poor: pmxt issue #1066 documents renames `matchId->eventId`, `matchName->eventName`, `sport->sportName`, `creatorTeam->prediction`. | H |

Key endpoints (all unauthenticated GET, 200 unless noted):

| Purpose | Endpoint | Notes |
|---|---|---|
| Offers (the "book") | `/api/p2p/offers?status=open&eventId=<id>&limit=500` | array of offer objects; empty today |
| One offer | `/api/p2p/offers/:id` | includes `onchainState` (`objectId`, `makerStakeTotal`, `makerRemaining`, `filledAmount`, `matchCount`, `status`, `statusLabel`, `oddsBps`, `expiresAt`, `isOpen`) |
| Trades / resolution | `/api/p2p/settled-tape` (last 20), offer `status`, `winner`, `settledAt`, `platformFee`, `settlementTxHash`, `refundTxHash` | |
| Contract + fees | `/api/p2p/contract-info`, `/api/p2p/fee-tiers`, `/api/p2p/onchain-book` | |
| Volume | `/api/p2p/revenue-stats`, `/api/platform/stats`, `/api/settlement/transparency` | self-reported |
| Event catalogue / indicative odds | `/api/events`, `/api/events/live-lite`, `/api/events/counts`, `/api/sports` | ESPN-derived; `/api/events?sportId=1` returned `[]` today |
| Other | `/api/p2p/odds-history?eventId=`, `/api/p2p/volume?wallet=`, `/api/p2p/my?wallet=` | `volume` returns 400 "Invalid wallet address" without a wallet |

Sample offer (fixture `p2p_offers_status_all_sample.json`, id 635): `{"id":635,"eventId":"760506","eventName":"Portugal vs Spain","prediction":"away","marketType":"match_winner","odds":100,"creatorStake":1000,"takerStake":99000,"currency":"SBETS","filledStake":1000,"status":"settled","winner":"creator","onchainOfferId":"0x78269b...","onchainState":{"oddsBps":1000000,"statusLabel":"expired",...}}`. Note the odds-100 offers and the `settled` row whose `onchainState.statusLabel` is `expired`: field semantics are inconsistent, so an adapter must not trust `status` alone.

---

## 6. Fees

- **Formulas (H, `/api/p2p/fee-tiers`):** `grossPot = takerStake + creatorStake * takerStake / totalTakerStake` (single offer); `winnerPayout = grossPot * (1 - netFeeRate)`; `netFeeRate = takerFeeRate - makerRebateRate`. The fee is charged on the **whole pot (both stakes)**, not on profit. Verified against data: offer 71 (pot 5,000,000 SBETS) paid `platformFee` 10,000 = 0.20% = Elite net rate. The FAQ text says "winnings (minus the 2% protocol fee)", which is looser than the API formula (M, wording conflict).
- **Tiers by cumulative volume in SUI (H):** Bronze 0: taker 2.00% / rebate 0; Silver 100: 1.50% / 0; Gold 1,000: 1.00% / 0.10%; Diamond 10,000: 0.75% / 0.20%; Elite 100,000: 0.50% / 0.30% (net 20 bps). A new wallet pays Bronze: **2% of the gross pot**. At odds 2.0 that is 4% of the winner's profit on either side; at odds 1.5 it is 6% of the maker-winner's profit (3% of the taker-winner's). Whether the tier rate applies by the winner's or the taker's volume is not stated (NOT FOUND).
- **Gas:** ~0.002-0.003 SUI per call per the whitepaper (M); stablecoin bets can be sponsored.
- **Who pays:** loser's stake funds the pot; fee is deducted from the winner's payout (H). Platform fees are tiny in absolute terms (324,047 SBETS + 0.069 SUI total, H `revenue-stats`).

---

## 7. Resolution and dispute risk

- **Mechanism (H, FAQ and `/api/p2p/contract-info`):** "An authorised oracle posts the final result on-chain." The oracle is a single capability (`oracleCapId`, held by the operator backend). Then a **2-hour dispute window** (`disputeWindowMs` 7,200,000) during which "anyone can challenge an incorrect result". Who adjudicates a challenge is NOT FOUND (searched bundle for challenge/dispute logic; only UI buttons and an admin `all-bets` panel with a "void reason" field are visible).
- **Data source (M/H):** whitepaper says ESPN free API + API-Sports; the transparency endpoint says `oracleDataSource: "Paid Sports Oracle"`. Neither is a decentralised oracle.
- **Void rules (H, site rules page):** bets may be voided for event cancelled/postponed beyond 24 h, venue change, "technical errors in odds or markets", suspected match-fixing, withdrawal before start; "SuiBets reserves the right to delay settlement" on disputed results; unsettled bets voided after 48 h (bundle text).
- **Empirical void rate (H):** `/api/settlement/transparency` overview: 306 voided of 2,169 settled house bets (14.1%), 1,111 won, 752 lost. Very high for an arb leg.
- **Trust assumption:** operator keys (admin, oracle) can settle and void. Funds are in a Move escrow, but the party that decides the winner is the operator.

---

## 8. Geo, ToS, automation

- No KYC, wallet-only: "No account, no email, no KYC. Your wallet is your identity." (H, FAQ). Eligibility: "18+, or higher where required ... it is your responsibility to check that participation is lawful for you" and "Do not use SuiBets where online betting is prohibited" (H). No IP geoblock observed on reads.
- No explicit prohibition on bots or API use found in the site rules text (searched bundle for automated/bots/VPN/terms: only a self-exclusion page and robotics demo data). A dedicated ToS page is NOT FOUND (`/terms` serves the SPA shell; the "Rules" page lists min bet 0.1 SUI, max 10,000 SUI, "All bets are final once confirmed on the blockchain").
- Anti-exploit caps apply server-side to the house book (7 bets/wallet/24 h, 3/match; section 2).

---

## 9. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (SUI in house treasury) | $1.98 | DefiLlama 2026-10-18; max $2 | H |
| Treasury available | 2.1 SUI; SBETS 0 | `/api/treasury/status` 2026-10-19 | H |
| Open P2P offers | 0 (REST and on-chain) | 2026-10-19 | H |
| Lifetime volume, all products | 829,724,800 SBETS + 1.4 SUI + 4 USDSUI + 0 USDC; 2,209 bets, 1,060 settled | `/api/platform/stats` 2026-10-19 | H (self-reported) |
| USD equivalent | ~$150 at SBETS $1.803e-7 | DexScreener 2026-10-19 | M |
| Lifetime P2P settled volume | 99.76M SBETS (~$18) + 16.5 SUI (~$16); 403 settled; weekly rows only for weeks of 2026-08-24, 08-31, 09-14 | `/api/p2p/revenue-stats` | H |
| Typical offer size | median 100,000 SBETS (~$0.02); largest 10,000,000 SBETS (~$1.80); largest SUI offer 130 SUI | computed from 924 offers | H/M |
| Unique bettors (house) | 91 | `/api/settlement/transparency` | H |
| SBETS pool | $403 liquidity, FDV $1.8k | DexScreener 2026-10-19 | H |
| Activity profile | offers created per month: May 114, Jun 400, Jul 287, Aug 123 (of 924 retrieved); matched offers by creation month: 48 / 238 / 125 / 10; last matched offer created 2026-08-23 | computed | H |

Concentration (H data, M reading): 346 of 421 matched offers were created by one wallet (`0x798e8b...`), 45 by another (`0x511778...`); 20 of the last 20 settled-tape rows involve one or both of them, as maker and taker. This reads as operator-run liquidity.

---

## 10. Event coverage and overlap

- **Sports (the only category with offers):** football/soccer (World Cup 2026 group games, Brasileirao, La Liga, Turkish and Portuguese leagues, friendlies), NFL, NHL, MLB, cricket, tennis, basketball, rugby. Overlaps Polymarket, Kalshi, XO and every sportsbook, but only on moneyline/1X2 and simple totals.
- **Naming:** `eventName` is free text ("Portugal vs Spain", "Argentina vs Algeria"); `eventId` is an ESPN or API-Sports id (e.g. "760506", "401873008"). Linking to other venues needs fuzzy team-name matching plus kickoff time (`matchDate`). Draw outcome only appears as `prediction:"draw"` on the maker side.
- **Crypto price / macro / politics:** one stale test-grade market ("Will Bitcoin reach $200K before end of 2026?", yesPrice 0.578, OI 400000 base units, 3 participants), an oil-price market, and generated stock "close above/below" events with zero volume. Pyth-based markets return 502. No politics.
- **Overlap value for arbitrage:** none in practice; no live size and no independent prices.

---

## 11. Shared liquidity / independence

- House odds are a copy of ESPN / API-Sports quotes ("indicative"), so they are **not independent** of the sportsbooks the aggregator already sees (H endpoint fields, M conclusion).
- The whitepaper claims P2P offers are mirrored as DeepBook limit orders and that FLUX/PULSE/DeepBook channels share the same oracle (H quote). In the data, `deepbookOrderId` is null on all 924 offers and DeepBook Predict is on testnet only, so nothing is shared in practice. Separately, Mysten's own DeepBook Predict (not SuiBets) went live on mainnet 2026-09-12 with trading paused since 2026-09-30 (M, small-model summary of docs.sui.io); that is a different venue worth its own look if the Sui crypto-price vertical matters.
- The only "market maker" is the operator (`/api/mm/status`: Cetus SBETS/SUI quote bot, spread 150 bps, vault TVL 0, depositors 0) (H).

---

## 12. Fixtures and how they were taken

All taken 2026-10-19 with `curl -sS -m 20 -A "insurance-markets-research/0.1"`, unauthenticated GET. Wallet addresses inside are third-party public chain addresses.

| File | Source | Trim |
|---|---|---|
| `p2p_offers_status_all_sample.json` | `/api/p2p/offers?status=all&limit=50` | 5 of 50 offers (2 settled, 1 filled, 1 expired, 1 cancelled) |
| `p2p_offers_non_moneyline_sample.json` | `/api/p2p/offers?status=...` merged | 2 offers with non-`match_winner` marketType |
| `p2p_offers_status_open.json` | `/api/p2p/offers?status=open` | full (`[]`) |
| `p2p_settled_tape_sample.json` | `/api/p2p/settled-tape` | first 4 of 20 |
| `p2p_contract_info.json`, `p2p_fee_tiers.json`, `p2p_onchain_book.json`, `p2p_revenue_stats.json` | same-named endpoints | full |
| `platform_stats.json`, `treasury_status.json`, `betting_status.json`, `predict_status.json` | same-named endpoints | full |
| `settlement_transparency_summary.json` | `/api/settlement/transparency` (44 KB) | overview, p2p stats, parlay stats, security block only |
| `events_sample.json` | `/api/events` | full (2.4 KB) |
| `predict_onchain_markets_sample.json` | `/api/predict/onchain-markets` | 6 of 23 |
| `stocks_events_sample.json`, `robotics_markets_sample.json` | `/api/stocks/events`, `/api/robotics/markets` | 1 and 2 items |

---

## 13. Suspicious / odd content

- No text aimed at AI agents was found on the site, in the API responses or in the bundle.
- A web-search summary said a DexScreener page tagline claims the protocol is "powered by bet365"; no evidence of any bet365 relationship found, treat as unsupported marketing (L).
- The site HTML installs scripts that suppress MetaMask/`window.ethereum` errors and swallow WebSocket/console errors, and `localStorage.removeItem('wallet_address')` on every load (H, index.html). Benign but indicates a hastily built, AI-assisted front end.
- `x.com/Sui_Bets` returned HTTP 402 via WebFetch (no payment details exposed); stopped there.
- `/api/predict/*`, `/api/stocks/*` and `/api/robotics/*` expose generated or placeholder markets ("Test rate limit market number 1"), so row counts overstate real markets.

---

## 14. Open questions

1. Who adjudicates a dispute during the 2 h window, and has any dispute ever been upheld? (NOT FOUND)
2. On-chain verification of the package, escrow balances and open-offer count was not done independently (Sui RPC is POST-only here).
3. Is the operator going to relaunch (SUI betting paused "while we add funds to the treasury")? Check `/api/p2p/onchain-book` openOffers weekly if desired.

## Sources

- https://www.suibets.com (index.html, JS bundle `/assets/index-DhaVOoNl.js`: FAQ, rules, whitepaper text, client API calls) [H]
- https://www.suibets.com/api/p2p/offers, `/api/p2p/offers/:id`, `/api/p2p/contract-info`, `/api/p2p/fee-tiers`, `/api/p2p/onchain-book`, `/api/p2p/settled-tape`, `/api/p2p/revenue-stats`, `/api/platform/stats`, `/api/settlement/transparency`, `/api/treasury/status`, `/api/betting-status`, `/api/events`, `/api/events/live-lite`, `/api/predict/status`, `/api/predict/onchain-markets`, `/api/robotics/markets`, `/api/stocks/events`, `/api/mm/status` (2026-10-19) [H]
- https://api.llama.fi/protocol/suibets and https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/suibets/index.js [H]
- https://api.dexscreener.com/latest/dex/tokens/0x999d696dad9e4684068fa74ef9c5d3afc411d3ba62973bd5d54830f324f29502::sbets::SBETS [H]
- https://github.com/pmxt-dev/pmxt/tree/main/core/src/exchanges/suibets (api.ts, config.ts, fetcher.ts) and issue https://github.com/pmxt-dev/pmxt/issues/1066 [H]
- https://docs.sui.io/onchain-finance/deepbook/deepbook-predict [M, small-model page summary]
- PayBox `discover_tokens mode=chains` (live, 2026-10-19) and repo notes docs/research/06-paybox-platform.md [H]
- WebSearch (extended) x2 for coverage/audit/exploit news: nothing independent found [M]
