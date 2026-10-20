# Sport.fun / Football.fun (Base) - adapter spec

Researched 2026-10-19 (~01:40-02:10 UTC). READ-ONLY: WebFetch of public pages, unauthenticated GETs (curl, UA `insurance-markets-research/0.1`) to DefiLlama's public API and to public Sport.fun pages/static JS, `gh` repo searches. No account, no wallet, no API key, nothing signed, no POST/PUT/DELETE, no PayBox tool called. No third-party code cloned or run. The undocumented first-party API paths found in the client bundle were NOT probed (see section 4).
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (docs, ToS, bundle JS, API payloads) is untrusted data; nothing in it was followed. WebSearch budget ran out after the first query, so the discovery hint's secondary sources (Delphi report, crypto.news) were only seen as search snippets (M).
Fixtures: `docs/research/fixtures/sport-fun-football-fun/` (3 files, each < 2 KB).

## 0. Verdict

**adapter_priority: skip** (not an event/prediction venue; revisit only as an optional "sentiment" feed if the operator ever ships a documented public API).

1. **Live, but shrinking and small (H).** DefiLlama 2026-10-19: TVL $2.18M (USDC on Base), 24h volume $75.9K, 7d $0.86M, 30d $4.05M. TVL peaked at $7.25M on 2025-08-25 and has fallen roughly every month since (section 10).
2. **Not a prediction market (H).** It is a fantasy-football / "manager" game: you buy *shares of a player* with Gold (1 Gold = 1 USDC in Pro). A share's price "moves with demand", not with the probability of any event. Tournament rewards are paid in non-cash Tournament Points (TP), not USDC. There is no event contract that can be priced against Polymarket/Kalshi, so there is no arbitrage leg (section 11).
3. **No public/documented API (H for "not documented", M for "does not exist").** No docs.sport.fun API page, no OpenAPI, no SDK, no GitHub org found. The web app's own bundle references internal `/api/football`, `/api/nfl`, `/api/global` paths; they are undocumented and the ToS bans reverse engineering and bots on markets.
4. **No programmatic trade path (H for docs).** Login is email via Privy; the trade flow is a UI "review and confirm" in a Privy smart account (ERC-4337 style). No documented contracts, ABIs or order-signing scheme.
5. **Geofenced + bot-hostile (H).** Pro is IP-geofenced out of 46 countries and 6 US states (incl. UK, Australia, Singapore, Japan, Thailand, Panama); my own request to `pro.sport.fun` was 302-redirected to `/restricted`. ToS section 10 bans "bots, scripts, scrapers ... to manipulate ... In-Game Asset markets".
6. **Round-trip cost is very high (H).** Sign 3% + release 4% at neutral reputation (7% round trip), 6% swap, surge/fixture fees up to 10%+ and "at least 20%" direct-sell fee on some accounts; plus the operator runs a "Market Health Bot" that props the market (a non-independent price).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| DefiLlama protocol "Sport.fun" (id 6625, category "Prediction Market", chain Base) TVL | $2,177,883 on 2026-10-19 00:53 UTC; 100% USDC ($2,178,205 in tokens) | H (`https://api.llama.fi/protocol/sport.fun`) |
| DefiLlama daily volume (dexs) last row | $75,868 for 2026-10-18; 7d $856,682; 30d $4,045,279 | H (`https://api.llama.fi/summary/dexs/sport.fun?dataType=dailyVolume`) |
| `https://sport.fun/` marketing site | HTTP 200, 2026-10-19; shows live "Market Call" (Olise vs Yamal, closed 4 Oct) and promo "50% of first squad buy-back" | H |
| `https://docs.sport.fun/` help center | live; articles updated for the 2026-27 season ("Picks changes for 2026-27", "Football scoring changes for 2026-27", "NFL pack sale", dated 14/28-08-26 in URL slugs) | H (index) / M (date reading from slugs) |
| FUN token article | "Updated on: 07/10/2026" (ambiguous dd/mm vs mm/dd) | H |
| Sherlock bug bounty page for Sport.Fun | LIVE since Jun 2, 2026, max 250,000 USDC | H (`https://audits.sherlock.xyz/bug-bounties/100`) |
| `https://pro.sport.fun/` from my IP | 302 -> `/restricted` (Cloudflare edge colo BKK) | H (observed) |
| Name history | DefiLlama lists previous names (Football.fun -> Sport.fun); `*.football.fun` hosts still in the CSP | H |

Conclusion: still live in Oct 2026, rebranded Football.fun -> Sport.fun, NFL added (Pro only), FUN token live.

## 2. What it is and market model

- **Kind**: onchain fantasy-sports "player market" game (not a binary/categorical/scalar event market). Operator: Sport.Fun Panama Corp (H, sport.fun footer/ToS). Seed round $2M led by 6th Man Ventures (M, The Block 2026-01-15).
- **Two products** (H, docs): *Free to Play* (free Gold, not withdrawable, available everywhere) and *Pro* (real stakes; Gold pegged 1:1 to USDC, funded by deposit; geofenced). Football is in both, NFL is Pro only. Pro football pool: curated ~140 players from the top-5 European leagues (H).
- **Outcome tokenisation**: each player has a market; a holder owns fractional "player shares" bought with Gold (`What are player shares?`). Shares are not claims on an event; they earn a *share-weighted slice of a tournament reward* if the player finishes near the top of his position that tournament. Shares must be held before the player enters the pitch (football) or the game starts (NFL) to be eligible (H).
- **Pricing mechanism**: NOT FOUND in the docs. Docs only say "Prices move with demand", release returns Gold at "current price and fee", slippage tolerance exists and a trade is cancelled if price moves past tolerance (H). Whether this is a bonding curve/AMM/other is not stated (searched: docs.sport.fun shares, slippage, transfers, sign/swap/release articles; sport.fun/integrity; blog "supporting-the-market"). DefiLlama's description calls them "fractional player shares ... with limited-use contracts" (M) and describes volume as "dexs" (M). Not an order book: there is no counterparty book in any article; the operator also buys shares via a "Market Health Bot" (H).
- **Other mechanics**: per-tournament "player contracts" (up to 8 players; limited-use); Player Packs (TP -> shares in 3 players); "Picks" skill game (5-player lineup, 1.5x captain, division rewards in TP); Reputation score (0-1000, start 500) that discounts fees; leagues/head-to-heads; "Market Calls" (free head-to-head player votes on the marketing page); FUN Seasons for holders (H).
- **Tournaments**: football = two per week (weekend and midweek), scores final at midnight UTC after last match (H).

## 3. Chain and collateral

- **Chain**: Base (Ethereum L2) (H, `docs.sport.fun/en/article/how-does-my-pro-wallet-work-14ow2tl/`). "Everything you hold and trade lives on-chain in auditable smart contracts" (H, same article); DefiLlama TVL is computed from USDC on Base (H).
- **Collateral**: USDC on Base. Gold is pegged 1:1 to USDC in Pro (H). Deposits: send USDC on Base to a per-user deposit address, or send other supported tokens/chains which Sport.fun bridges to USDC on Base (example given: USDT0 on HyperEVM), or card via MoonPay (H, `how-to-deposit-funds-on-pro-1e8n395`). Withdrawals "at any time" to an external Base address from the wallet UI; fee/limit not stated (H).
- **Wallet**: Privy embedded wallet, email login, "a secure smart account"; custody model not stated in the docs; ToS 3.4 says the company does not provide custody (H). Client CSP lists Pimlico (ERC-4337 bundler), Alchemy, QuickNode, dRPC and `*.base.org` RPCs (H, `app.sport.fun` response headers/HTML).
- **FUN token** (optional, Pro perks only): total supply 1,000,000,000; Base `0x16EE7ecAc70d1028E7712751E2Ee6BA808a7dd92`; Solana `8cn4JeRLiHTtfX6maZAsipGGyyZPdEcos3s2X3Hw3BS6` (H, `docs.sport.fun/en/article/what-is-fun-13v1waw/`). DefiLlama maps the same Base address. Listed on Binance Alpha, Kraken, OpenSea at TGE 2026-01-15 (M, The Block, which also mentions Solana listing).
- **Game contracts (player share token/market, Gold/USDC vault)**: NOT FOUND (searched: docs help center, /security, /security/bug-bounty (scope tab not rendered), Sherlock bounty page (scope tab not rendered), the Free app JS bundle (only viem chain constants), DefiLlama adapter path `projects/footballdotfun/index.js` returned 404 via `gh api`, GitHub repo search for sport.fun/football.fun (no operator repos)). The Pro app (`pro.sport.fun`) is geofenced from my location so its bundle was not read.

## 4. Read API

- **exists: none (official/public).** NOT FOUND (searched: docs.sport.fun category pages incl. Account and tech support, sport.fun nav/footer links, sitemap.xml (pages only), bug-bounty page, GitHub search, `api.sport.fun` DNS = does not resolve).
- **What exists**:
  - Undocumented first-party app API: the `app.sport.fun` client bundle (`/static/assets/index-wCwLEiFk.js`, public static file, 4.4 MB) contains base-path strings `/api/football`, `/api/nfl` (on `app.sport.fun`) and `/api/global` (on `pro.sport.fun`), plus `ws.local.football.fun`/`wss://*.football.fun` in the CSP (H for the strings, nothing known about shapes or auth). I did **not** call these (not a documented API host; ToS 9.2 prohibits reverse engineering). Treat as M for existence and unknown for stability/auth.
  - Third-party aggregates: DefiLlama TVL, daily volume and fees (public, no key). Use these only as an indicator (fixtures below).
  - On-chain reads: possible in principle (Base RPC / Basescan) but the contract addresses are not published (see section 3), so no.
- **Base URLs checked (H)**: `https://api.llama.fi/protocol/sport.fun`, `https://api.llama.fi/summary/dexs/sport.fun?dataType=dailyVolume`, `https://api.llama.fi/summary/fees/sport.fun` (all HTTP 200, unauthenticated). DefiLlama docs: `https://api-docs.defillama.com/`.
- **Per-player price data**: shown in the UI ("Trends": current share price, 24h change, form, crowd flow; "Next game": Win % for football, salary) (H, `understanding-the-transfers-trades-page-1cobt3j`); supply and market cap per player are NOT shown. NFL data can lag up to a minute (H, sport.fun/nfl).
- **Auth/limits/websocket**: NOT FOUND for any official interface. Cloudflare in front of all hosts (H); `blockscout`/other explorers also challenge non-browser clients (H, observed on Base Blockscout).

## 5. Trade path

- **none (programmatic)**. Trading = login via Privy (email/social) then UI steps "Sign / Release / Swap -> review -> confirm" with a price and fee preview and slippage tolerance (H, `how-do-i-sign-swap-or-release-football-players-t2fwod`, `what-is-slippage-q6hz7i`). The docs do not mention onchain steps, wallet-signing prompts, order types, signatures, an SDK, or a keeper/relayer interface (NOT FOUND, searched: all docs categories read for this task).
- The wallet is a Privy-managed smart account created for the user's email login; an external wallet cannot sign on its behalf without access to that account (inference, M).

## 6. PayBox reachability

**paybox_reachable: no** (funding yes, trading no).
- *Funding path (H)*: a PayBox EVM wallet on Base could send USDC on Base to the deposit address shown inside the Sport.fun app (an ordinary ERC-20 transfer proposal). That only funds Gold; it does not place trades.
- *Trading path*: needs the Privy session (email login) or documented contract ABIs. Neither is available/documented. Not a "transaction proposal" or "signed order" integration.
- *Also blocked by*: ToS bot ban, IP geofence, no custody-free control of the smart account.
- Withdrawals go to any Base address, so exit to a PayBox wallet would work (H, docs), but with the fee structure in section 7.

## 7. Fees

All fees are dynamic, shown pre-confirmation, and paid by the manager placing the trade (H, `what-fees-are-payable-on-trades-1yudz8i`; ToS 6.3).

| Item | Rate | Tag |
|---|---|---|
| Sign (buy) | 3% at Neutral Rep | H |
| Release (sell) | 4% at Neutral Rep | H |
| Swap | 6% at Neutral Rep | H |
| Rep discounts | Pro 20%, Pro II 25%, Pro III 30%, World Class 35%, Legend 40% off; Legend = 1.8% / 2.4% / 3.6% | H |
| Below Neutral Rep | "higher", no figures | H |
| Fixture fee (live match) | 10% on release/swap-out of a player in a live match; decays over the hour after the match | H |
| Player surge fee, manager surge fee (~10% of squad value sold in 7 days is "the usual starting point" for squads >= $500), account market-impact fee | amounts not given | H |
| Stacking | highest applicable fee is charged, they do not stack | H |
| Blog (undated): direct-sell fee "at least 20%" for six high-drawdown accounts; planned "exit button" aiming for "roughly 80% of value on a clean exit" | | M (`sport.fun/blogs/supporting-the-market/`, date not shown) |
| Fee destination | DefiLlama: protocol revenue to treasury (M); docs: market-protection fees buy shares from player markets back into the reward pool (H) | |
| Realised take | DefiLlama fees: 24h $1,977, 30d $103,462, 1y $2.60M, all-time $6.38M vs all-time volume $137.2M (~4.7%) | H (derived) |
| Gas / deposit/withdraw fees | NOT FOUND (docs silent) | |

## 8. Resolution mechanism and dispute risk

- There is no market resolution. Value accrues through per-tournament rewards computed from scoring. Football scoring uses **Opta** official match data; scores finalise at midnight UTC after the tournament's last match; live scores "can change if Opta updates or corrects the underlying match data" with no stated deadline (H, `how-does-football-scoring-work-w8o2uc`). NFL scoring uses **Sportradar** (H, article summary `how-does-nfl-scoring-work-2bi38y`).
- Rewards for players: 70% of the TP pool to top scorers per position, 30% to Picks (H); the exact formula and the pool size are only "shown in the app on the Live page". Rewards are paid in **TP**, not Gold/USDC (H).
- **Dispute/Rep risk**: the company can adjust Rep manually for "manipulation or linked-account abuse", errors or integrity threats; support-based redress only; ToS governing law Panama, CECAP arbitration seated in Panama City, EU/EEA/UK consumer carve-outs (H, ToS 20.1-20.2). Rules, scoring and fee methodology may change (Pro is labelled **beta**, ToS 3.2) (H).
- Operator discretion over the market: "Market Health Bot" buys shares to support the market ("not a guaranteed price floor") (H blog/integrity).

## 9. Geo / ToS / automation

- **Geofence (Pro only; Free is open everywhere)**: Afghanistan, Algeria, Australia, Bangladesh, Bolivia, Brunei, Cambodia, China, Croatia, Cuba, Cyprus, Ecuador, Egypt, Indonesia, Iran, Iraq, Japan, Jordan, Kosovo, Kuwait, Libya, Maldives, Morocco, Myanmar, Nepal, North Korea, North Macedonia, Norway, Oman, Pakistan, Panama, Qatar, Republic of Congo, Russia, Saudi Arabia, Sierra Leone, Singapore, Somalia, Switzerland, Taiwan, Thailand, Tunisia, Turkey, UAE, United Kingdom, Venezuela, Vietnam; US states Arizona, Hawaii, Idaho, Montana, Nevada, Utah (H, `sport.fun/legal/pro/geographic-restrictions`). IP-based; page silent on VPNs; the ToS (4.4) has users represent they are not in a restricted jurisdiction (H). KYC may be required for Pro access/rewards (ToS 5.3) (H).
- **Automation**: ToS s.10 prohibits "bots, scripts, scrapers, exploits, or other automated means to manipulate Contests", extending to scoring and In-Game Asset markets; s.9.2 bans reverse engineering; no sanctioned API or scripting access is described (H, ToS summary via WebFetch; the quoted fragment is from the fetch summary, not a verbatim re-read of the legal text).
- **Legal posture**: the game states it is skill-based, "does not constitute gambling", and that in-game assets are "entertainment utilities, not securities"; Pro is for 18+ and users must not buy "for investment" (H, ToS 3.4/4.2/7.1). This is opposite to a prediction-market compliance posture.
- Free site `robots.txt`: `Allow: /` (H); that says nothing about the API or the ToS.

## 10. Liquidity (DefiLlama, fetched 2026-10-19)

| Metric | Value | Source / date |
|---|---|---|
| TVL | $2,177,883 (USDC, Base) | H, `api.llama.fi/protocol/sport.fun`, 2026-10-19 |
| TVL peak | $7,248,975 on 2025-08-25 | H, same |
| TVL path (first of month) | 2025-09 $5.61M; 2025-12 $5.00M; 2026-01 $5.89M; 2026-04 $3.68M; 2026-07 $2.94M; 2026-10 $2.43M | H, same |
| Volume 24h / 7d / 30d / 1y / all-time | $75.9K / $0.86M / $4.05M / $75.8M / $137.2M | H, `summary/dexs/sport.fun`, last data day 2026-10-18 |
| Fees 24h / 30d / 1y / all-time | $1,977 / $103K / $2.60M / $6.38M | H, `summary/fees/sport.fun` |
| FUN token mcap | $2.73M | H (DefiLlama field `mcap`, 2026-10-19) |
| Claimed launch figures | ">$100M TVL within two weeks" and "~$25M volume", ~10,700 active wallets (Aug 2025) | M: search snippets of crypto.news and Bitget, pages not opened. **Not reconciled**: DefiLlama's TVL never exceeded $7.25M. Possible definitional difference (share value vs USDC held). Treat the $100M as unverified. |
| Per-player depth / "book" | NOT FOUND (no supply, no depth shown) | |

## 11. Event overlap and shared liquidity

- **Overlap with other venues: effectively none.** The tradable object is a *player's share price in a closed game*, not an outcome of a real-world event. Prediction venues list outcomes such as match winner, top scorer, Premier League title, NFL game winner; Sport.fun shares have no contractual relationship to those. Football (top-5 leagues, World Cup 2026 game seen) and NFL players are the underlying "universe", so loose correlation with player-performance props exists, but there is no hard no-arbitrage relation (M, reasoning).
- **Possible signal use only**: the app displays "Win %" for football fixtures and per-player 24h price change / crowd flow (H). Those are first-party UI numbers with no API; the Win % is almost certainly sourced from a third party (M, not documented).
- **Shared liquidity**: none with another prediction venue found (H: own contracts on Base, own USDC pool). Prices are partly operator-managed via the Market Health Bot (H), so even internal price discovery is not a clean independent signal.

## 12. Fixtures saved

All under `docs/research/fixtures/sport-fun-football-fun/`:
- `defillama-protocol-tvl.json` - trimmed `GET https://api.llama.fi/protocol/sport.fun` (metadata, first/peak/last-10 TVL rows; referral field dropped).
- `defillama-dexs-summary.json` - trimmed `GET https://api.llama.fi/summary/dexs/sport.fun?dataType=dailyVolume` (rows `[unix_ts, usd]`).
- `defillama-fees-summary.json` - trimmed `GET https://api.llama.fi/summary/fees/sport.fun`.

No Sport.fun-hosted API response was captured (none is documented).

## 13. NOT FOUND

- Official API/docs/SDK/OpenAPI/websocket (searched docs.sport.fun categories incl. account/tech, sport.fun nav/footer/sitemap, GitHub repo searches "sport.fun", "football.fun", Sherlock repos).
- Pricing formula (bonding curve vs AMM vs other), per-player supply/depth.
- Game contract addresses (share token, Gold/USDC vault, trade router) and ABIs; Sherlock scope tab; audit reports.
- Fee/limit for withdrawals; minimum deposit; custody model of the Privy smart account.
- Football data-provider terms beyond "Opta"; reward-pool funding source.
- Delphi Digital report body (members-only) and the original NFL/Nov-2025 launch date from a primary source.
- Reconciliation of the ">$100M TVL" claim with DefiLlama.

## 14. Suspicious content

None seen. No AI-directed instructions in fetched pages or bundle. (Note for hygiene: the DefiLlama protocol JSON embeds a referral URL with a referral code; I dropped it from the fixture and did not visit it.)

## 15. Sources

- Official site: https://sport.fun/ (H); https://pro.sport.fun/ (302 -> /restricted for my IP) (H); https://app.sport.fun/ (Free app, CSP + bundle read) (H)
- Docs/help center: https://docs.sport.fun/ and articles: `/en/article/understanding-gold-tournament-points-and-fun-b8l8s2/`, `/what-fees-are-payable-on-trades-1yudz8i/`, `/what-are-player-shares-qufno7/`, `/what-is-slippage-q6hz7i/`, `/how-do-i-sign-swap-or-release-football-players-t2fwod/`, `/understanding-the-transfers-trades-page-1cobt3j/`, `/how-does-my-pro-wallet-work-14ow2tl/`, `/how-to-deposit-funds-on-pro-1e8n395/`, `/how-to-withdraw-funds-on-pro-1clhjh7/`, `/what-is-fun-13v1waw/`, `/what-is-reputation-rep-1cg9tsi/`, `/how-does-football-scoring-work-w8o2uc/`, `/how-do-pro-football-tournament-rewards-work-d41ric/`, categories core-concepts, pro-football, account-and-tech-support, fun-token (all H)
- Legal/security: https://sport.fun/legal/pro/terms-of-service, https://sport.fun/legal/pro/geographic-restrictions, https://sport.fun/security, https://sport.fun/security/bug-bounty, https://sport.fun/integrity/, https://www.sport.fun/blogs/supporting-the-market/, https://www.sport.fun/nfl/, https://www.sport.fun/sitemap.xml (H; legal pages read via WebFetch summaries)
- Sherlock bounty: https://audits.sherlock.xyz/bug-bounties/100 (H, scope not rendered)
- DefiLlama: https://api.llama.fi/protocols, /protocol/sport.fun, /summary/dexs/sport.fun, /summary/fees/sport.fun (H)
- The Block (discovery evidence, FUN TGE 2026-01-15): https://www.theblock.co/post/385736/footballdotfun-debuts-fun-token (H for what it says; it gives no TVL/volume figures)
- Search snippets only (M): https://crypto.news/football-fun-hits-100m-tvl-within-two-weeks-after-launch/ ; https://www.bitget.com/news/detail/12560604930192 ; https://members.delphidigital.io/reports/sport-fun-reimagining-the-fantasy-sports-frontier ; https://www.fantasyfootballscout.co.uk/2026/06/03/how-to-play-sport-fun-during-world-cup-2026 ; https://www.coingecko.com/en/coins/sport-fun
