# Divvy.Bet (divvy.bet / app.divvy.bet) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19 (session date). READ-ONLY: public pages, `gh api` reads of public repos, GETs to documented third-party APIs (DefiLlama, CoinGecko, GeckoTerminal), static reading of the site's public JavaScript (never executed). No account, no wallet, no key, no signing, no POST/PUT/DELETE, no PayBox tool called, no third-party code cloned or run. Third-party text is untrusted data; nothing in it was followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source or my inference; **L** = weak or stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.

## 0. Verdict

- **Live: yes, small and promotional (H/M).** See section 1.
- **Adapter priority: skip.** Each reason is independently sufficient:
  1. **No documented API of any kind.** The only data path is an undocumented backend (`api.divvy.bet`) that the front-end uses, which I did not probe (it is not a documented API host). Odds, limits and the bet transaction itself come from that backend (H for the front-end code, section 3 and 5).
  2. **A wallet cannot place a bet alone.** The on-chain `createSlipV3` instruction requires a second signer, the `foreman` ("offchain data provider ... signs off transaction to ensure given max_amount, min_amount, payout_amount are provided by him"), so every bet needs a co-signature from Divvy's server (H, IDL in the public bundle).
  3. **Terms forbid exactly our use**: "predatory arbitrage loops utilizing external latency edges", collusive hedging across wallets, and "automated botting scripts to manipulate pool liquidity" (H, section 8). The US is a prohibited jurisdiction, VPNs are forbidden, and the site/API geo-redirects to a 403 page.
  4. **Not independent price discovery.** It is a house-vs-bettor sportsbook: odds are quoted by the operator's off-chain feed and the operator also settles every bet (H for who signs; M for "odds are a vendor feed plus house margin"; the odds source is NOT FOUND).
  5. **Thin.** DefiLlama TVL about 4.9K USD (5-digit, flipping to about 42K on some days), token 24h volume about 3 USD (section 9). Betting volume: NOT FOUND.
- Only conceivable use: none that justifies an adapter. Not even a signal feed, because prices are not readable without the gated backend.

## 1. Liveness (H unless marked)

| Check | Result | Source |
|---|---|---|
| `https://app.divvy.bet` | 301 to `https://divvy.bet/` | curl headers 2026-10-19 |
| `https://divvy.bet/` | 200, `last-modified: Wed, 14 Oct 2026 17:34:21 UTC`, "(c) 2026" footer, entity Divvy Real Entertainment Ltda | https://divvy.bet/ |
| Terms | "Last Updated: June 2026" | https://divvy.bet/terms-and-conditions/ |
| Nav products | Sports (singles + parlays), Hi-Lo, Survivor Pool, Season 2, Champions (NFT mint), House Pool, Staking, Poker (separate site `poker.divvy.bet`) | https://divvy.bet/ |
| Season 2 page | "The Divvy Arena": points for betting, minting Champions or playing Hi/Lo; a $10 qualifying wager is needed for leaderboard/raffle. Dates show "Loading season details..." | https://divvy.bet/season-2/?house=SOL |
| Official X post 2026-10-13 | Season 2 live, "$25k in rewards", Hi/Lo earns 3 points per dollar (M: relayed by a news aggregator, X itself returned HTTP 402 to WebFetch) | https://www.kucoin.com/news/trends/SOL/6ace78e4f25df5000749cbb9 |
| World Cup 2026 campaign | 220 SOL prize pool, drawn 2026-07-26, now closed (M: airdrop-listing site; `divvy.bet/world-cup-2026/` now 404) | https://airdropalert.com/airdrops/divvy-bet-world-cup-2026/ |
| DefiLlama | Listed 2024-06-06 as "Prediction Market"; latest TVL point 2026-10-18 20:29 UTC = 4,863 USD | https://api.llama.fi/protocol/divvy.bet |
| Third-party review | "Updated August 12, 2026" | https://coingape.com/decentralized-sports-betting/ |

Caveats (flagged, not resolved):
- I could **not** observe on-chain activity (a bet or settlement) because GET-only Solana explorers answered 404/502 and I did not use JSON-RPC POST. "Live" rests on the maintained site, the 2026 terms and the promotional posts. (M)
- The homepage banner "HiLo is now LIVE!" is stale: a search snippet dates the page listing "583 days ago", i.e. about March 2025 (L).
- The homepage and House Pool pages render all zeroes ("Total in House Pool 0.00", "No active bets have been found") when fetched without JavaScript or a wallet; that is a client-rendering artefact, not evidence of an empty pool (H for what was rendered, M for the interpretation).
- GitHub org `DivvyBet` has **0 public repositories**, last profile update 2026-05-20 (H: `gh api users/DivvyBet`).

## 2. Kind and market model

- **Kind:** on-chain sportsbook with a pooled house ("Be the House"), plus a 5-minute crypto Hi-Lo game, an NFL survivor pool and an NFT mint. Not an exchange, no order book, no peer matching, no secondary market. (H: homepage; H: IDL; M: Coingape calls it "Peer-to-Pool infinite liquidity".) The hint "sportsbook-exchange" in the discovery list is inaccurate.
- **Pricing:** fixed odds set off-chain by the operator and passed into the bet transaction as `odds: u32`, with `remainingOdds` (vec u32) and `oddsOffset`; the foreman signs the quote (H, IDL `createSlipV3`). Odds vendor: NOT FOUND (searched: terms, homepage, front-end bundle for provider names such as Pinnacle, OpticOdds, Sportradar, The Rundown, Odds API; the Dec 2022 litepaper PDF text is font-subset encoded and unreadable without a PDF tool).
- **Outcome structure (H, IDL account `betV2`):** one account per `(house, gameId, typeId, points)` with `status` Open / Closed / Win / Lose / Push and an `isHalf` flag for Asian-handicap half win / half lose. Bettor's position is a `slip` PDA `(bettor, house, gameId, typeId, points, createdTs, betAmount, payoutAmount)`, i.e. a receipt, **not a transferable token**. Parlays are a separate `parlay` account `(house, slipId, payoutAmount, betAmount)` created with `createParlay`. So: binary-ish one-sided positions priced at fixed odds; no complementary YES/NO tokens, no scalar.
- **House risk accounting (H, IDL `house`):** `liquidity`, `maxPayoutAmount`, `betAmount`, `utilizedAmount`, `maxUtilizationBps`, per-game `maxPayoutAmount`, `maxLockedLiquidity`/`unitLockedLiquidity` in the bet args. Bets are rejected with `MaxLockedLiquidityExceeded` / `InsufficientLiquidity`. Concrete limits: NOT FOUND (they sit in the backend; the Terms say Divvy "reserves the complete right to limit maximum wager sizes").
- **Hi-Lo:** "Rapid 5-minute crypto price predictions" 24/7 (H homepage, BTC/ETH named on base.divvy.bet page). Price source and payout multiplier: NOT FOUND (searched: homepage, hilo page which is JS-rendered).
- **Sports coverage in the UI (M, front-end config only used for sort order):** football (FIFA World Cup, UCL, EPL, La Liga, Bundesliga, Ligue 1, Serie A, Europa), basketball (NBA, WNBA, EuroLeague), NFL/NCAAF, tennis majors, MLB, UFC/Bellator/PFL, NHL; also volleyball per the front-end. Politics, macro: NOT FOUND.

## 3. Read API

- **Official documented API: NONE.** NOT FOUND (searched: `docs.divvy.bet` does not resolve; `divvy.bet/docs`, `/api`, `/llms.txt`, `/robots.txt`, `/sitemap.xml` all 404; homepage links list no docs; GitHub org has 0 public repos; DefiLlama/CoinGecko link no docs). `exists` = **unofficial-only**.
- **What exists (H as code, not as documentation):** the public front-end bundle (`https://divvy.bet/_next/static/chunks/pages/_app-0818bd703213c9b5.js`) hard-codes:
  - Backend base `https://api.divvy.bet` with path constants `/sports`, `/leagues`, `/houses`, `/houses/lock-status`, `/slips`, `/games`, `/tournaments`, `/users`, `/parlay`, `/bets`, `/abr-stats`, `/blog-posts`, and a call to `/users/{wallet}/has-bets`. A 403 from this host makes the app redirect to its `/403` geo page.
  - A WebSocket odds feed referenced through an env var `NEXT_PUBLIC_ODDS_WS_URL`; the value is not in the bundle (NOT FOUND).
  - Static stats JSON on S3 `.../stats/divvy-points.json` (points programme).
  - Auth, rate limits, schemas: NOT FOUND. **I did not call any endpoint on `api.divvy.bet`**, because it is not a documented API host. (One exception to disclose: a probe loop issued a single `GET https://api.divvy.bet/` with the generic User-Agent; it returned HTTP 404 `application/json` of 63 bytes and I did not read the body. Nothing else was requested from that host.)
- **On-chain reads:** the Solana program is `dvy7Zoj6DfrnTx1VNbJZz9MTp9ax2w4J65REG5UgT6f` (H: constant `DIVVY_HOUSE_PROGRAM_ID` in the bundle); a second program for tournaments is `4APoSeXM9M4QNhuAR7vVD2MFUvE7C1P1fX66Qg1UWu64` (H: same bundle). DefiLlama's adapter instead reads program `dvyFwAPniptQNb1ey4eM12L8iLHrzdiDsPPDndd6xAR` filtered by admin `AHf1MX99d31ebLfAydVPe2vVdgzZGuUaW972znWPNzZY` (H: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/divvy-bet/index.js, last changed 2024-06-13). So **the TVL feed may track an older program (M)**. With the saved IDL, `house`, `game` and `betV2` accounts could be enumerated through any Solana RPC (`getProgramAccounts`), giving pool size, utilisation, per-game max payout and settled status, but **no odds**: odds only exist inside the foreman-signed transaction arguments. I did not run RPC reads.
- Events emitted (IDL): `BetUpdatedEvent`, `GameUpdatedEvent`, `HouseUpdatedEvent`.

## 4. Chains and collateral

- **Chain: Solana (H).** DefiLlama chain list `["Solana"]`; token `DVYcTNFVGxePLgK8rUjViJvurRmTnD1FZUBR7puADymT` (H: https://api.coingecko.com/api/v3/coins/divvy-bet).
- **Collateral: per-"house"** (H, IDL `house.currency` = "SPL token mint or NATIVE token (SOL)"; `houseMint` = LP share mint). URLs carry `house=SOL`, so the SOL house is the default (H). A USDC house is claimed by a review site (M: Coingape "USDC is primary"), while another third-party page says payouts are "commonly shown in SOL" (L, internally inconsistent). The set of live houses and their balances: NOT FOUND (needs an RPC read or the backend `/houses`).
- `base.divvy.bet` exists (referenced in the bundle as a "base" site URL) and renders the same app with HBAR/ETH labels and zero liquidity; chain not stated (L). Ambiguous: do not read it as an EVM deployment.
- Idle house liquidity can be lent through Kamino (IDL has `kaminoInit`, `kaminoDepositReserveLiquidity`, `kaminoRedeemReserveCollateral`, ... ; H as code).

## 5. Trade path

- **Programmatic placement without Divvy's backend: not possible.** `createSlipV3(gameId, typeId, points, createdTs, odds, betAmount, maxLockedLiquidity, unitLockedLiquidity, unitOffset, oddsOffset, remainingOdds)` has signers `bettor`, `foreman` and `payer` (H, IDL). The foreman key belongs to Divvy; the app obtains a transaction from the backend, the user wallet signs, then the app sends it (M for the exact request flow; the `/slips` path exists, the body is NOT FOUND). Parlays (`createParlay`) and settlement (`updateBetV2`, `closeGame`, `closeParlay`) also require the foreman/authority.
- **Cash-out / early exit:** none found. `closeSlip` is the bettor claim after settlement (accounts: bettor, slip, bet, house). Cancel: NOT FOUND.
- **LP side (single-signer, H as IDL):** `createDepositPosition(amount, minAmountOut)` / `closeDepositPosition`, `createWithdrawPosition` / `closeWithdrawPosition` queue deposits and withdrawals while games are in progress ("queued deposit and withdrawal will be made once pool is open", H, House Pool page). LP is a fund-the-house position, not an arbitrage leg.

### Reachable through PayBox? **no** (for betting); partial only for LP (M, reasoned, nothing called)
- PayBox has Solana and a `solanaTransaction` signing op (see `docs/research/06-paybox-platform.md`), but a bet needs a foreman co-signed, multi-signer transaction fetched from a geo-gated, undocumented backend; PayBox's `transactionProposal` Solana kind is restricted to one signer who is fee payer (same note). There is no EVM leg at all. LP deposit/withdraw are single-signer instructions and could in principle be proposed, but that is not something we want to automate, and the US is a prohibited jurisdiction.

## 6. Fees

- **Bettor fees:** none stated. Terms contain no fee schedule or house edge (H). Third parties say "near-zero fees, only Solana gas" (M/L: Coingape, solanabox.tools), which ignores the margin built into odds. The odds margin vs a fair price: NOT FOUND (needs odds data).
- **Protocol fees on house profit (H, IDL `house`):** `beneficiaryFeeBps`, `dvypassFeeBps`, `revshareFeeBps` (comment: "i.e. 100 = 1%"), set by `admin`; actual values NOT FOUND (needs an RPC read). Paid out of house profits, not by bettors (M, from field names `beneficiaryLiquidity` "profits").
- Solana network fee plus rent for the slip/bet accounts (the app also uses a `payer` signer; who pays rent: M).

## 7. Resolution

- **Operator-settled.** `updateBetV2(status, isHalf)` and `closeGame(profitAmount)` are signed by `authority`/foreman (H, IDL); the bettor then calls `closeSlip` to collect. There is no on-chain oracle, no dispute window, no bond (H absence in IDL). A review site mentions Switchboard/Pyth for result confirmation (L: Coingape, uncorroborated by the IDL).
- **Terms (H):** may "void or correct any wagers placed on markets that exhibit an obvious or palpable error" (e.g. "corrupted data feeds", lines left open after event start), may "invalidate settlements found to violate market integrity", disputes under Costa Rican law, entity Divvy Real Entertainment Ltda (Costa Rica, Puntarenas). Protocol exploit losses are promised "good faith" remediation; user error/phishing excluded. Dispute risk: high and one-sided (operator is counterparty and judge).
- `pause`/`unpause` admin instructions and a `paused` flag exist (H, IDL): the operator can freeze the house.

## 8. Geo, ToS, automation (quoted sparingly; https://divvy.bet/terms-and-conditions/, Last Updated June 2026, H)

- Prohibited jurisdictions include "The United States of America (including its territories and possessions)", the UK, Costa Rica, OFAC-sanctioned countries; no "Virtual Private Networks (VPNs) or proxy servers".
- Section 5: "Coordinated syndicate betting, predatory arbitrage loops utilizing external latency edges" and collusive hedging across wallets are prohibited; so is "the usage of automated botting scripts to manipulate pool liquidity". Wagers are to be placed individually by the wallet holder.
- Operator may limit wager sizes and refuse service to any address.
- Technical geo-gate: the app redirects to `/403` ("isn't available in your region", H: https://divvy.bet/403) when the backend returns 403.

## 9. Liquidity (with dates)

| Metric | Value | Source |
|---|---|---|
| TVL | **4,863 USD** at 2026-10-18 20:29 UTC; Sep-Oct 2026 alternates between about 4.9K and about 42K day to day (e.g. 42,227 on 2026-10-10, 4,929 on 2026-10-13) | https://api.llama.fi/protocol/divvy.bet (H as reported; M as completeness, see program mismatch in section 3) |
| TVL history | peak 692,137 USD on 2024-11-23; about 300K Oct 2025; 134K Jan 2026; 145K Mar 2026; 4,977 on 2026-04-01 | same; fixture `defillama-protocol-trimmed.json` |
| Volume / fees / OI | NOT FOUND (searched: DefiLlama dexs/fees/options summaries for `divvy.bet` and `divvy-bet` return HTTP 400 "not found"; docs; site) | n/a |
| DVY token | price 0.000553 USD, mcap 200.7K USD, 24h volume 2.91 USD, ATH 0.0115 on 2024-11-02 (CoinGecko, last_updated 2026-10-12); GeckoTerminal shows lower values and a 24h volume of about 1.2 USD | https://api.coingecko.com/api/v3/coins/divvy-bet ; https://api.geckoterminal.com/api/v2/networks/solana/tokens/DVYcTNFVGxePLgK8rUjViJvurRmTnD1FZUBR7puADymT |
| Campaign scale | World Cup 2026 jackpot 220 SOL total (M); Season 2 "$25k in rewards" (M) | sources in section 1 |

The TVL drop from about 145K (March 2026) to about 5K (April 2026) is either LP withdrawals or a migration to the program the adapter does not read; not resolvable from first-hand data (open question).

## 10. Event overlap and shared liquidity

- **Overlap (arbitrage-relevant):** mainstream sports match winners and totals overlap Polymarket, Kalshi, Overtime, Azuro, SX Bet. Hi-Lo 5-minute crypto up/down overlaps short-window crypto markets elsewhere, but it is a game with operator payouts, not a market with a quotable price. No politics or macro found (NOT FOUND).
- **Shared liquidity:** no sharing with another venue found. The poker product is a separate site. But the counterparty is the operator's own pool, so a price here is a quote, not a market. Any "arb" would be taking the operator's margin against another venue's price, which the Terms prohibit and the operator can void.

## 11. Open questions

1. Real current activity: number of settled bets per day, and which houses (SOL, USDC) hold liquidity (needs an RPC read of program `dvy7Zoj...`; I stayed GET-only).
2. Why DefiLlama reads program `dvyFwAP...` and the bundle uses `dvy7Zoj...`; whether TVL is undercounted.
3. Odds vendor and margin; `/slips` request/response shape; WebSocket URL.
4. Values of beneficiary / dvypass / revshare fee bps and `maxUtilizationBps`.

## Sources

- https://app.divvy.bet (301) and https://divvy.bet/ (H, homepage, response headers 2026-10-19)
- https://divvy.bet/terms-and-conditions/ (H, Last Updated June 2026)
- https://divvy.bet/403 , https://divvy.bet/season-2/?house=SOL , https://divvy.bet/housepool/?house=SOL , https://divvy.bet/hilo/?house=SOL , https://base.divvy.bet/ (H as rendered without JS)
- https://divvy.bet/_next/static/chunks/pages/_app-0818bd703213c9b5.js and `index-fbb9eb8e63212709.js` (H as code; read as text, never executed; IDL, program ids, API path constants). Note: this public bundle also embeds third-party RPC API keys; they are deliberately not reproduced here and were not used.
- https://api.llama.fi/protocol/divvy.bet , https://api.llama.fi/protocols , https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/divvy-bet/index.js (H)
- https://api.coingecko.com/api/v3/coins/divvy-bet , https://api.geckoterminal.com/api/v2/networks/solana/tokens/DVYcTNFVGxePLgK8rUjViJvurRmTnD1FZUBR7puADymT (H)
- https://api.github.com/users/DivvyBet (H: 0 public repos)
- https://www.kucoin.com/news/trends/SOL/6ace78e4f25df5000749cbb9 , https://airdropalert.com/airdrops/divvy-bet-world-cup-2026/ , https://coingape.com/decentralized-sports-betting/ , https://solanabox.tools/tools/divvy (M/L, undated or promotional)
- https://defillama.com/protocol/divvy.bet (HTTP 403 to WebFetch; data taken from the API instead)
- https://x.com/DivvyBet (HTTP 402 to WebFetch; no payment made, none attempted)
- Not read: Divvy Knowledge Hub PDF (`/assets/uploads/Divvy_Knowledge_Hub_06.pdf`, a beginner guide, text unreadable without a PDF tool) and the Dec 2022 litepaper (stale by design).

## Fixtures (docs/research/fixtures/divvy-bet/)

- `divvy_house_idl_from_frontend_bundle.json` (30 KB): Anchor IDL of program `divvy_house` v0.30.0 (51 instructions, 16 account types, 15 errors), parsed statically from the public bundle. Unofficial; may differ from the deployed program.
- `defillama-protocol-trimmed.json` (6 KB): DefiLlama metadata, monthly TVL, last 45 points.
- `coingecko-dvy-subset.json` (0.5 KB): token market data subset.
- No Divvy backend response is saved: there is no documented API host to sample.
